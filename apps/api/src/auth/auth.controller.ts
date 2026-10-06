import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { OAuthProvider } from './oauth-providers.service';
import type { Request, Response } from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { AuthResponse, User } from '@larkwave/shared';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.service';
import { toUser } from '../common/mappers';
import { AuthService, type DeviceCtx } from './auth.service';
import { ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto, ServiceLinkDto } from './auth.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Capture the login device (user-agent + client IP through Cloudflare) for the device manager,
   * and as one key of the login brute-force throttle.
   *
   * `CF-Connecting-IP` FIRST: Cloudflare sets and overwrites it, so a client cannot forge it as
   * long as traffic arrives through the tunnel. The left-most X-Forwarded-For hop — which this
   * used to take on its own — is fully client-supplied, so an attacker could rotate it per
   * request and walk straight past any per-IP limit keyed on it.
   */
  private deviceCtx(req: Request): DeviceCtx {
    const cf = (req.headers['cf-connecting-ip'] as string | undefined)?.trim();
    const xff = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
    return {
      userAgent: (req.headers['user-agent'] as string | undefined) || undefined,
      ip: cf || xff || req.ip || undefined,
    };
  }

  /**
   * CẤP TÀI KHOẢN THAY MẶT MỘT HỆ NGOÀI — chỉ máy chủ gọi, không phải trình duyệt.
   *
   * Social Wave dùng đường này: người dùng đăng nhập MỘT lần bằng tài khoản fbinbox, máy chủ
   * fbinbox đổi lấy token Larkwave tương ứng. Nhờ vậy không ai phải nuôi tài khoản thứ hai, mà
   * mỗi người vẫn có thư viện và hạn mức riêng.
   *
   * Ba chốt, và không cái nào thừa:
   *  1. TẮT MẶC ĐỊNH. `SERVICE_LINK_SECRET` rỗng ⇒ 404, như thể endpoint không tồn tại. Một đường
   *     đổi-id-lấy-token mà bật sẵn ở mọi môi trường là một cửa hậu chờ sẵn.
   *  2. So khoá bằng `timingSafeEqual`. So bằng `===` thì thời gian trả lời rò rỉ số ký tự khớp —
   *     đủ để dò ra khoá bằng cách thử từng ký tự.
   *  3. Liên kết theo `externalId`, KHÔNG theo email — xem `linkServiceAccount`. Đây mới là chốt
   *     chặn việc chiếm tài khoản, hai chốt trên chỉ chặn người lạ gọi vào.
   */
  @Public()
  @HttpCode(200)
  @Post('service/link')
  async serviceLink(
    @Body() dto: ServiceLinkDto,
    @Req() req: Request,
  ): Promise<AuthResponse> {
    const expected = this.config.env.SERVICE_LINK_SECRET;
    if (!expected) throw new NotFoundException();
    const got = String(req.headers['x-service-secret'] ?? '');
    const a = Buffer.from(got);
    const b = Buffer.from(expected);
    // `timingSafeEqual` ném khi độ dài lệch, nên so độ dài trước — và việc đó KHÔNG rò rỉ gì thêm:
    // độ dài khoá không phải bí mật, nội dung mới là.
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new NotFoundException();
    return this.auth.linkServiceAccount(dto);
  }

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: Request): Promise<AuthResponse> {
    return this.auth.register(dto, this.deviceCtx(req));
  }

  @Public()
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request): Promise<AuthResponse> {
    return this.auth.login(dto, this.deviceCtx(req));
  }

  // ── Device manager (login sessions) ───────────────────────────────────────────

  /** List the current account's active devices; marks the one making THIS request. */
  @Get('devices')
  async devices(
    @CurrentUser() current: AuthUser,
  ): Promise<{ current: string | null; devices: Awaited<ReturnType<AuthService['listDevices']>> }> {
    const devices = await this.auth.listDevices(current.id);
    return { current: current.sid ?? null, devices };
  }

  /** Log out one of the account's devices (revoke its session). */
  @Delete('devices/:id')
  @HttpCode(200)
  revokeDevice(@CurrentUser() current: AuthUser, @Param('id') id: string): Promise<{ ok: boolean }> {
    return this.auth.revokeDevice(current.id, id);
  }

  /** Returns the current authenticated user (validates the token). The web app
   * calls this on every load to restore the session — exempt it from the global
   * rate-limiter so rapid refreshes (esp. mashing F5) can't 429 it into a logout. */
  @SkipThrottle()
  @Get('me')
  async me(@CurrentUser() current: AuthUser): Promise<User> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: current.id } });
    return toUser(user);
  }

  // ── Forgot / reset password (PUBLIC) ─────────────────────────────────────────

  /**
   * Start a password reset. Always returns { ok: true } regardless of whether
   * the email exists (no account enumeration). Sends the reset email if mail is
   * configured; otherwise just logs.
   */
  @Public()
  @HttpCode(200)
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ ok: true }> {
    return this.auth.forgotPassword(dto);
  }

  /** Complete a password reset with the emailed 6-digit code + a new password. */
  @Public()
  @HttpCode(200)
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto): Promise<{ ok: true }> {
    return this.auth.resetPassword(dto);
  }

  // ── Google OAuth (PUBLIC) ─────────────────────────────────────────────────────

  /** Feature flags for the frontend (show/hide the OAuth login/connect buttons). */
  @Public()
  @Get('config')
  authConfig(): { google: boolean; gitlab: boolean; github: boolean } {
    return {
      google: this.auth.googleEnabled,
      gitlab: this.auth.gitProviderEnabled('gitlab'),
      github: this.auth.gitProviderEnabled('github'),
    };
  }

  /** Kick off Google OAuth: 302 to the consent screen (503 if not configured). */
  @Public()
  @Get('google')
  googleStart(
    @Query('origin') origin: string | undefined,
    @Query('redirect') redirect: string | undefined,
    @Res() res: Response,
  ): void {
    if (!this.auth.googleEnabled) {
      throw new ServiceUnavailableException('Google login chưa được cấu hình');
    }
    // Carry the originating web origin (app vs aapp) — or a DESKTOP deep link —
    // through OAuth state so the callback returns the JWT to the right place.
    const state = this.encodeState(
      undefined,
      this.resolveWebOrigin(origin),
      this.resolveDesktopRedirect(redirect) ?? undefined,
    );
    res.redirect(this.auth.buildGoogleConsentUrl(state));
  }

  /**
   * Google OAuth callback: exchange `code`, find-or-create the user, issue a
   * JWT, and 302 back to the web app. On any error redirect to /login?error=google.
   */
  @Public()
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // Return to the frontend the login STARTED on (encoded in state), validated
    // against the trusted-origin allowlist — never an attacker-supplied origin.
    const decoded = this.decodeState(state);
    const web = this.resolveWebOrigin(decoded.origin);
    const desktop = this.resolveDesktopRedirect(decoded.desktop);
    try {
      if (!code) throw new Error('Missing authorization code');
      const token = await this.auth.googleLogin(code, this.deviceCtx(req));
      if (desktop) {
        res.redirect(`${desktop}?token=${encodeURIComponent(token)}`);
        return;
      }
      res.redirect(`${web}/auth/callback?token=${encodeURIComponent(token)}`);
    } catch {
      if (desktop) {
        res.redirect(`${desktop}?error=google`);
        return;
      }
      res.redirect(`${web}/login?error=google`);
    }
  }

  // ── GitLab / GitHub OAuth (PUBLIC) ────────────────────────────────────────────

  /** Validate the path provider segment; 400 on anything else. */
  private parseProvider(provider: string): OAuthProvider {
    if (provider !== 'gitlab' && provider !== 'github') {
      throw new BadRequestException('Nhà cung cấp không hợp lệ');
    }
    return provider;
  }

  /**
   * Encode the CSRF nonce + an optional `?link=<jwt>` (so a logged-in user can
   * CONNECT the provider to their account) into a single opaque `state`.
   */
  private encodeState(
    link: string | undefined,
    origin: string | undefined,
    desktop?: string,
  ): string {
    const payload = JSON.stringify({
      n: randomBytes(12).toString('hex'),
      l: link ?? '',
      o: origin ?? '',
      d: desktop ?? '',
    });
    return Buffer.from(payload, 'utf8').toString('base64url');
  }

  /** Recover the `?link=<jwt>` + web origin + desktop deep-link carried in `state`. */
  private decodeState(state: string | undefined): { link?: string; origin?: string; desktop?: string } {
    if (!state) return {};
    try {
      const { l, o, d } = JSON.parse(
        Buffer.from(state, 'base64url').toString('utf8'),
      ) as { l?: string; o?: string; d?: string };
      return { link: l || undefined, origin: o || undefined, desktop: d || undefined };
    } catch {
      return {};
    }
  }

  /**
   * Resolve a DESKTOP redirect target to 302 the issued JWT back to. The token is
   * a bearer secret, so this is STRICTLY allow-listed (open-redirect = token leak):
   *  - `larkwave://auth` — the packaged-app custom scheme, OR
   *  - `http://127.0.0.1:<port>/cb` / `http://localhost:<port>/cb` — the desktop's
   *    transient loopback OAuth server (works in dev without OS scheme registration).
   * Loopback is safe: it can only ever reach back to the user's own machine.
   */
  private resolveDesktopRedirect(requested: string | undefined): string | null {
    if (!requested) return null;
    try {
      const u = new URL(requested);
      if (u.protocol === 'toolswave:') {
        const id = `larkwave://${u.host || u.pathname.replace(/^\/+/, '')}`.replace(/\/+$/, '');
        return id === 'larkwave://auth' ? id : null;
      }
      if (
        u.protocol === 'http:' &&
        (u.hostname === '127.0.0.1' || u.hostname === 'localhost') &&
        u.pathname.replace(/\/+$/, '') === '/cb'
      ) {
        return `http://${u.host}/cb`; // keep host:port, drop any query/hash
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Resolve the web frontend to 302 back to. OAuth mints a JWT into the redirect
   * URL, so the target MUST be a trusted origin — never an attacker-controlled
   * `origin` query (that would leak the token = open redirect). Allowlist comes
   * from CORS_ORIGINS (app + aapp); anything else falls back to WEB_PUBLIC_URL.
   */
  private resolveWebOrigin(requested: string | undefined): string {
    const fallback = this.config.env.WEB_PUBLIC_URL;
    if (!requested) return fallback;
    const normalized = requested.replace(/\/+$/, '');
    const allowed = new Set(
      this.config.env.CORS_ORIGINS.split(',')
        .map((s) => s.trim().replace(/\/+$/, ''))
        .filter(Boolean),
    );
    return allowed.has(normalized) ? normalized : fallback;
  }

  /**
   * Kick off GitLab/GitHub OAuth: 302 to the provider consent (503 if not
   * configured). Pass `?link=<jwt>` to connect the provider to the CURRENT user
   * instead of logging in fresh.
   */
  @Public()
  @Get(':provider')
  gitStart(
    @Param('provider') provider: string,
    @Query('link') link: string | undefined,
    @Query('origin') origin: string | undefined,
    @Query('redirect') redirect: string | undefined,
    @Res() res: Response,
  ): void {
    const p = this.parseProvider(provider);
    if (!this.auth.gitProviderEnabled(p)) {
      throw new ServiceUnavailableException(`${p} OAuth chưa được cấu hình`);
    }
    res.redirect(
      this.auth.buildGitConsentUrl(
        p,
        this.encodeState(link, this.resolveWebOrigin(origin), this.resolveDesktopRedirect(redirect) ?? undefined),
      ),
    );
  }

  /**
   * GitLab/GitHub OAuth callback: exchange `code`, resolve the target user
   * (linked current user or find/create by email), store the provider
   * username, issue a JWT and 302 back to the web app. Errors -> /login?error=<p>.
   */
  @Public()
  @Get(':provider/callback')
  async gitCallback(
    @Param('provider') provider: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const decoded = this.decodeState(state);
    const { link, origin } = decoded;
    const web = this.resolveWebOrigin(origin);
    const desktop = this.resolveDesktopRedirect(decoded.desktop);
    let p: OAuthProvider;
    try {
      p = this.parseProvider(provider);
    } catch {
      if (desktop) {
        res.redirect(`${desktop}?error=provider`);
        return;
      }
      res.redirect(`${web}/login?error=provider`);
      return;
    }
    try {
      if (!code) throw new Error('Missing authorization code');
      const linkUserId = await this.auth.resolveLinkUserId(link);
      const token = await this.auth.gitOAuthLogin(p, code, linkUserId, this.deviceCtx(req));
      if (desktop) {
        // Desktop: hand the fresh JWT to the app via the deep link.
        res.redirect(`${desktop}?token=${encodeURIComponent(token)}&linked=1`);
        return;
      }
      res.redirect(`${web}/auth/callback?token=${encodeURIComponent(token)}`);
    } catch {
      if (desktop) {
        res.redirect(`${desktop}?error=${p}`);
        return;
      }
      res.redirect(`${web}/login?error=${p}`);
    }
  }
}
