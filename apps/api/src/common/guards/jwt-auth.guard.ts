import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

interface JwtPayload {
  sub: string;
  email: string;
  role: 'admin' | 'user';
  /** Session-revocation stamp (User.tokenVersion at sign time). Absent on legacy tokens. */
  tv?: number;
  /** Per-device login-session id (LoginSession.id). Absent on impersonation / legacy tokens.
   *  When present, the guard rejects the token once the session is revoked (device cap / manual
   *  logout), which is how a 4th device gets booted. */
  sid?: string;
  /** Impersonation: the admin id that minted this token (signFor(target, actor.id)). Traceability. */
  imp?: string;
}

/** Short-lived cache of a user's revocation-relevant state, so the guard doesn't hit the DB
 *  on every authenticated request. Revocation (password change / suspend) takes effect within
 *  CACHE_TTL_MS. */
const CACHE_TTL_MS = 20_000;

/**
 * Global guard: requires a valid Bearer JWT unless the route is @Public().
 *
 * Tokens are long-lived by design (see JWT_EXPIRES_IN). Revocation is enforced HERE against
 * live DB state so a session ends exactly when the user wants it to:
 *  - the account is suspended  → every token rejected, or
 *  - the password changes      → User.tokenVersion is bumped, so tokens carrying the old value
 *                                are rejected (all devices logged out).
 * An unchanged password + active account keeps the session valid indefinitely.
 *
 * Availability guardrails: the check is CACHED (≤ one DB read per user per 20s) and FAILS OPEN —
 * if the DB is unreachable, a signature-valid token is still accepted, so a database blip can
 * never mass-log-out every user. Legacy tokens minted before this change (no `tv` claim) skip
 * the version check (they simply expire on their own short timer), so deploying this doesn't
 * boot everyone at once.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly cache = new Map<string, { status: string; tokenVersion: number; at: number }>();
  /** Per-session (device) validity cache — same TTL/fail-open policy as the user cache. */
  private readonly sessionCache = new Map<string, { active: boolean; at: number }>();

  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private async userState(userId: string): Promise<{ status: string; tokenVersion: number } | null> {
    const hit = this.cache.get(userId);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { status: hit.status, tokenVersion: hit.tokenVersion };
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, tokenVersion: true },
    });
    if (!u) return null;
    this.cache.set(userId, { status: u.status, tokenVersion: u.tokenVersion, at: Date.now() });
    // Bound the cache so a long-running process can't grow it unbounded.
    if (this.cache.size > 5000) {
      const cutoff = Date.now() - CACHE_TTL_MS;
      for (const [k, v] of this.cache) if (v.at < cutoff) this.cache.delete(k);
    }
    return { status: u.status, tokenVersion: u.tokenVersion };
  }

  /** Is this login session still active? ONE query bumps lastSeenAt (for LRU eviction) AND tells us
   *  if the session is active (count>0) or revoked/deleted (0). Cached ≤ CACHE_TTL_MS. */
  private async sessionActive(sid: string): Promise<boolean> {
    const hit = this.sessionCache.get(sid);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.active;
    const res = await this.prisma.loginSession.updateMany({
      where: { id: sid, revokedAt: null },
      data: { lastSeenAt: new Date() },
    });
    const active = res.count > 0;
    this.sessionCache.set(sid, { active, at: Date.now() });
    if (this.sessionCache.size > 5000) {
      const cutoff = Date.now() - CACHE_TTL_MS;
      for (const [k, v] of this.sessionCache) if (v.at < cutoff) this.sessionCache.delete(k);
    }
    return active;
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: unknown }>();
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Thiếu bearer token');
    }
    const token = header.slice('Bearer '.length).trim();

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token, { secret: this.config.env.JWT_SECRET });
    } catch {
      throw new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn');
    }

    // Revocation check against live DB state — best-effort (fails open on DB error).
    try {
      const state = await this.userState(payload.sub);
      if (state) {
        if (state.status !== 'active') {
          throw new UnauthorizedException('Tài khoản đã bị khoá — hãy đăng nhập lại');
        }
        // Only enforce the version on tokens that carry it (legacy tokens simply expire).
        if (payload.tv !== undefined && payload.tv !== state.tokenVersion) {
          throw new UnauthorizedException('Phiên đã hết hiệu lực (mật khẩu đã thay đổi) — hãy đăng nhập lại');
        }
        // Per-device cap: reject once this session is revoked (evicted by a newer device, or logged
        // out from the device manager). Only tokens carrying `sid` are checked (legacy tokens skip).
        if (payload.sid) {
          const active = await this.sessionActive(payload.sid);
          if (!active) {
            throw new UnauthorizedException('Thiết bị đã bị đăng xuất (đã vượt quá 3 thiết bị) — hãy đăng nhập lại');
          }
        }
      }
      // state === null (user genuinely not found) → treat as deleted → reject.
      else {
        throw new UnauthorizedException('Tài khoản không tồn tại');
      }
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      // DB unreachable / unexpected error → fail OPEN: a valid signature still passes, so a
      // database hiccup never logs everyone out.
    }

    // Carry the impersonator id (if this is an impersonation token) so downstream/audit can
    // see the session is an admin acting AS this user, not the user themselves.
    req.user = { id: payload.sub, email: payload.email, role: payload.role, impersonatorId: payload.imp, sid: payload.sid };
    return true;
  }
}
