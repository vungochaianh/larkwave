import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthResponse } from '@larkwave/shared';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import type { User as PUser } from '@prisma/client';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { ensureIdentity } from '../common/identity';
import { GitProvidersService, GitProvider } from '../engine/git-providers.service';
import { toUser } from '../common/mappers';
import { parseDurationToSeconds } from '../common/duration';
import { ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto } from './auth.dto';

// OTP rules: 6-digit numeric code, valid 10 minutes, 5 wrong attempts allowed,
// 60s cooldown between sends.
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
const OTP_MAX_ATTEMPTS = 5;

// ── Device / login-session cap ──────────────────────────────────────────────
/** Max concurrent signed-in devices per account (typically 1 phone + 2 computers). A new login
 *  beyond this revokes the least-recently-used session, logging that device out. */
export const MAX_DEVICES = 3;

/** Login context captured from the request for the device manager. */
export type DeviceCtx = { userAgent?: string; ip?: string };

/** Classify a login by user-agent for the device manager (phone vs computer). */
function deviceKindFromUA(ua?: string): string {
  const s = (ua || '').toLowerCase();
  if (/mobile|android|iphone|ipod|ipad|windows phone/.test(s)) return 'phone';
  if (/electron|toolswave/.test(s)) return 'desktop';
  return 'web';
}

/** A friendly "Chrome · macOS" / "App Larkwave" label from the user-agent. */
function deviceLabelFromUA(ua?: string): string {
  const s = ua || '';
  const os = /Windows/i.test(s)
    ? 'Windows'
    : /Mac OS X|Macintosh/i.test(s)
      ? 'macOS'
      : /Android/i.test(s)
        ? 'Android'
        : /iPhone|iPad|iPod|iOS/i.test(s)
          ? 'iOS'
          : /Linux/i.test(s)
            ? 'Linux'
            : '';
  const app = /Electron|Larkwave/i.test(s)
    ? 'App Larkwave'
    : /Edg\//i.test(s)
      ? 'Edge'
      : /OPR\/|Opera/i.test(s)
        ? 'Opera'
        : /Chrome/i.test(s)
          ? 'Chrome'
          : /Firefox/i.test(s)
            ? 'Firefox'
            : /Safari/i.test(s)
              ? 'Safari'
              : 'Trình duyệt';
  return [app, os].filter(Boolean).join(' · ') || 'Thiết bị';
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly gitProviders: GitProvidersService,
  ) {}

  async register(dto: RegisterDto, device?: DeviceCtx): Promise<AuthResponse> {
    if (!this.config.env.ALLOW_REGISTRATION) {
      throw new ForbiddenException('Đăng ký đang bị tắt. Liên hệ quản trị viên.');
    }
    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email đã được đăng ký');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: { email, passwordHash, name: dto.name?.trim() || email.split('@')[0], role: 'user' },
    });
    await ensureIdentity(this.prisma, user.id); // public handle + referral code
    await this.audit.log(user.id, user.email, 'user.register', user.id);
    return this.sign(user, { device });
  }

  /**
   * CẤP TÀI KHOẢN THAY MẶT MỘT HỆ NGOÀI (service-to-service).
   *
   * Dùng cho Social Wave: người dùng đăng nhập MỘT lần bằng tài khoản fbinbox, máy chủ fbinbox
   * gọi vào đây để lấy token Larkwave tương ứng. Nhờ vậy họ không phải nuôi tài khoản thứ hai,
   * mà mỗi người vẫn có thư viện và hạn mức riêng.
   *
   * ─── LIÊN KẾT THEO `externalId`, TUYỆT ĐỐI KHÔNG THEO EMAIL ───
   *
   * Đây là chỗ dễ mở cửa hậu nhất của cả tính năng. Nếu liên kết theo email, một hệ ngoài chỉ cần
   * khai "người dùng của tôi có email <admin>" là nhận được token của tài khoản đó — tức chiếm
   * tài khoản, không phải tạo tài khoản. Nên:
   *
   *   • khoá liên kết là `<hệ>:<id>`, do hệ ngoài sở hữu, không ai khác đặt được;
   *   • email CHỈ để hiển thị. Nếu email trùng một tài khoản ĐÃ CÓ mà chưa liên kết thì TỪ CHỐI,
   *     không gộp — người đó phải tự đăng nhập Larkwave và tự nối, chứ không để một máy chủ khác
   *     nhận hộ.
   *
   * Tài khoản tạo ra ở đây KHÔNG có mật khẩu dùng được: `passwordHash` là một chuỗi ngẫu nhiên đã
   * băm, nên không ai đăng nhập bằng mật khẩu vào nó được. Muốn dùng trên web thì đặt lại mật khẩu
   * qua email như thường.
   */
  async linkServiceAccount(input: {
    provider: string;
    externalId: string;
    email?: string;
    name?: string;
  }): Promise<AuthResponse> {
    const provider = input.provider.trim().toLowerCase();
    const rawId = String(input.externalId ?? '').trim();
    if (!/^[a-z0-9_-]{2,32}$/.test(provider)) throw new BadRequestException('provider không hợp lệ');
    if (!rawId || rawId.length > 128) throw new BadRequestException('externalId không hợp lệ');
    const externalId = `${provider}:${rawId}`;

    const linked = await this.prisma.user.findUnique({ where: { externalId } });
    if (linked) {
      if (linked.status !== 'active') throw new ForbiddenException('Tài khoản đang bị khoá.');
      return this.sign(linked);
    }

    // Email chỉ để hiển thị; trùng email với một tài khoản đã có thì TỪ CHỐI, không gộp.
    const email = (input.email ?? '').toLowerCase().trim();
    if (email) {
      const clash = await this.prisma.user.findUnique({ where: { email } });
      if (clash) {
        throw new ConflictException(
          'Email này đã có tài khoản Larkwave. Hãy đăng nhập Larkwave rồi tự nối, ' +
            'thay vì để hệ ngoài nhận hộ.',
        );
      }
    }

    // Email nội bộ khi hệ ngoài không gửi email: vẫn phải duy nhất vì cột `email` là @unique.
    const finalEmail = email || `${externalId.replace(':', '.')}@external.local`;
    const user = await this.prisma.user.create({
      data: {
        email: finalEmail,
        // Mật khẩu KHÔNG dùng được: băm một chuỗi ngẫu nhiên, không ai biết bản gốc.
        passwordHash: await bcrypt.hash(randomBytes(48).toString('hex'), 10),
        name: input.name?.trim() || email.split('@')[0] || provider,
        role: 'user',
        externalId,
      },
    });
    await ensureIdentity(this.prisma, user.id);
    await this.audit.log(user.id, user.email, 'user.service-link', user.id);
    return this.sign(user);
  }

  async login(dto: LoginDto, device?: DeviceCtx): Promise<AuthResponse> {
    const email = dto.email.toLowerCase().trim();
    // Two keys so neither axis alone is a bypass: an attacker spraying ONE password across many
    // accounts is caught by the IP key, and a botnet grinding ONE account is caught by the email
    // key. Checked BEFORE the DB lookup so a locked-out attacker can't even probe for existence.
    const ipKey = device?.ip ? `ip:${device.ip}` : null;
    const emailKey = `em:${email}`;
    this.assertLoginAllowed(emailKey, AuthService.LOGIN_MAX_FAILS_EMAIL);
    if (ipKey) this.assertLoginAllowed(ipKey, AuthService.LOGIN_MAX_FAILS_IP);

    // Explicitly typed so TS treats a `fail()` call as terminating and narrows `user` after it.
    const fail: () => never = () => {
      this.noteLoginFailure(emailKey, AuthService.LOGIN_MAX_FAILS_EMAIL);
      if (ipKey) this.noteLoginFailure(ipKey, AuthService.LOGIN_MAX_FAILS_IP);
      // Always the SAME message whether the email exists, the password is wrong, or the account
      // is unknown — otherwise this endpoint becomes an account-enumeration oracle.
      throw new UnauthorizedException('Sai email hoặc mật khẩu');
    };

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) fail();
    if (user.status === 'suspended') throw new ForbiddenException('Tài khoản đã bị khoá');

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) fail();

    for (const k of [ipKey, emailKey]) if (k) this.loginFailures.delete(k);
    await this.audit.log(user.id, user.email, 'user.login', user.id);
    return this.sign(user, { device });
  }

  // ── Login brute-force throttle ─────────────────────────────────────────────
  // In-memory on purpose: the API runs as a SINGLE systemd instance
  // (deploy/ci-deploy.sh restarts one `toolswave-api`), so a shared store would buy nothing.
  // If the API is ever scaled out, move this to Postgres/Redis or the limit becomes per-process.
  // A restart clears the counters — acceptable: it costs an attacker a fresh window, not access.
  /** key → { fails, until } where `until` is when the current lockout expires (0 = not locked). */
  private readonly loginFailures = new Map<string, { fails: number; until: number }>();
  /**
   * Wrong attempts before a key locks. The two axes need very different thresholds:
   *  - EMAIL is the one that actually protects an account, and only its real owner should ever
   *    be typing it — 8 mistakes is already generous.
   *  - IP is shared. Behind office NAT or a mobile carrier, hundreds of unrelated people arrive
   *    as ONE address, so a low threshold here would let eight fat-fingered logins lock out a
   *    whole company. It exists to blunt password SPRAYING (many accounts, few tries each),
   *    which needs volume to work, so a high bar still catches it.
   */
  private static readonly LOGIN_MAX_FAILS_EMAIL = 8;
  private static readonly LOGIN_MAX_FAILS_IP = 50;
  /** Lockout length once the limit is hit. */
  private static readonly LOGIN_LOCK_MS = 15 * 60_000;
  /** A key with no failure for this long is forgotten (also bounds the map's growth). */
  private static readonly LOGIN_WINDOW_MS = 15 * 60_000;

  private assertLoginAllowed(key: string, max: number): void {
    const e = this.loginFailures.get(key);
    if (!e) return;
    const now = Date.now();
    if (e.until > now) {
      const mins = Math.ceil((e.until - now) / 60_000);
      throw new UnauthorizedException(
        `Sai quá nhiều lần. Hãy thử lại sau ${mins} phút, hoặc dùng "Quên mật khẩu".`,
      );
    }
    if (e.until && e.until <= now) this.loginFailures.delete(key); // lockout served
  }

  private noteLoginFailure(key: string, max: number): void {
    const now = Date.now();
    const e = this.loginFailures.get(key);
    // Sweep expired entries occasionally so a spray attack can't grow the map without bound.
    if (this.loginFailures.size > 5000) {
      for (const [k, v] of this.loginFailures) {
        if (v.until <= now && now - v.until > AuthService.LOGIN_WINDOW_MS) this.loginFailures.delete(k);
      }
    }
    // Start over only when a REAL lockout has since expired. `until === 0` means "counting, never
    // locked" — treating that as expired (0 <= now is always true) reset the counter on every
    // attempt and made this whole limiter a no-op.
    const servedLockout = !!e && e.until > 0 && e.until <= now;
    const fails = (servedLockout ? 0 : (e?.fails ?? 0)) + 1;
    this.loginFailures.set(key, {
      fails,
      until: fails >= max ? now + AuthService.LOGIN_LOCK_MS : 0,
    });
  }

  // ── Password OTP (shared by forgot-password + change-password) ──────────────

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  /** A zero-padded 6-digit numeric code from crypto-strong randomness. */
  private generateOtpCode(): string {
    // Uniform 0..999999 via rejection sampling on a 24-bit value.
    let n: number;
    do {
      n = randomBytes(3).readUIntBE(0, 3); // 0 .. 16_777_215
    } while (n >= 16_000_000); // 16_000_000 = 16 * 1_000_000 → unbiased mod
    return String(n % 1_000_000).padStart(6, '0');
  }

  /**
   * Issue a fresh password OTP for `userId` and email it. Enforces a 60s resend
   * cooldown: if a code was created < 60s ago we DON'T create a new one (caller
   * still treats this as success). Otherwise invalidates prior unused codes,
   * generates a 6-digit code, stores sha256(code), and mails it. Returns whether
   * a new code was sent (false = throttled or mail not configured).
   */
  async issuePasswordOtp(
    userId: string,
    email: string,
    purpose: 'reset' | 'change',
  ): Promise<void> {
    // 60s resend cooldown — silently skip if a code was just created.
    const recent = await this.prisma.passwordResetToken.findFirst({
      where: {
        userId,
        usedAt: null,
        createdAt: { gt: new Date(Date.now() - OTP_RESEND_COOLDOWN_MS) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) return;

    // Invalidate prior unused codes so only the newest works.
    await this.prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    // Generate + store; retry on the astronomically-unlikely tokenHash clash.
    let code = this.generateOtpCode();
    for (let i = 0; i < 5; i++) {
      try {
        await this.prisma.passwordResetToken.create({
          data: {
            userId,
            tokenHash: this.hashToken(code),
            attempts: 0,
            expiresAt: new Date(Date.now() + OTP_TTL_MS),
          },
        });
        break;
      } catch (err) {
        // P2002 = unique constraint on tokenHash; regenerate and retry.
        if ((err as { code?: string }).code === 'P2002' && i < 4) {
          code = this.generateOtpCode();
          continue;
        }
        throw err;
      }
    }

    const sent = await this.mail.sendOtpCode(email, code, purpose);
    if (!sent) {
      this.logger.warn(`Password OTP (${purpose}) generated for ${email} but mail was not sent`);
    }
  }

  /**
   * Verify a 6-digit OTP for `userId` against the latest unused, non-expired
   * code and, on success, set the new bcrypt password (consuming the code) in a
   * single transaction. Throws BadRequest on invalid/expired/too-many-attempts/
   * wrong code (incrementing `attempts` on a wrong code). `auditAction` records
   * the event. Returns the user's email for downstream auditing.
   */
  private async verifyOtpAndSetPassword(
    userId: string,
    code: string,
    newPassword: string,
    auditAction: 'auth.password_reset' | 'auth.password_change',
    auditEmail: string | null,
  ): Promise<void> {
    const record = await this.prisma.passwordResetToken.findFirst({
      where: { userId, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) {
      throw new BadRequestException('Mã không hợp lệ hoặc đã hết hạn');
    }
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      throw new BadRequestException('Nhập sai quá nhiều lần, hãy gửi lại mã');
    }
    if (this.hashToken(code) !== record.tokenHash) {
      await this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Mã xác thực không đúng');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.$transaction([
      // Bump tokenVersion so EVERY existing session (all devices) is invalidated on a
      // password change — the guard rejects tokens carrying the old value.
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    await this.audit.log(userId, auditEmail, auditAction, userId);
  }

  // ── Forgot / reset password (PUBLIC, OTP) ───────────────────────────────────

  /**
   * Begin a password reset. ALWAYS returns { ok: true } so the endpoint never
   * reveals whether an email is registered. When the email exists we issue a
   * 6-digit OTP (subject to the 60s resend cooldown) and email it.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ ok: true }> {
    const email = dto.email.toLowerCase().trim();
    // Kiểm đường thư TRƯỚC khi tra tài khoản — thứ tự này quan trọng.
    //
    // Trả "đã gửi" đồng nhất là để không lộ tài khoản nào có thật; nhưng khi hệ thống thư HỎNG thì
    // câu đó thành lời hứa suông: người dùng ngồi chờ một email không bao giờ tới, còn dấu vết duy
    // nhất là một dòng log không ai đọc. Báo hỏng ở đây KHÔNG lộ gì cả, vì tình trạng đường thư
    // không phụ thuộc email nào được nhập — nên phải kiểm trước, không phải sau khi biết tài khoản.
    if (!(await this.mail.isHealthy())) {
      throw new ServiceUnavailableException(
        'Hệ thống gửi email đang lỗi nên không gửi được mã xác thực. Đây không phải lỗi tài khoản của bạn — ' +
          'vui lòng thử lại sau, hoặc liên hệ quản trị viên để kiểm tra cấu hình email.',
      );
    }
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user) {
      await this.issuePasswordOtp(user.id, email, 'reset');
    }
    // Always uniform response — do not leak account existence.
    return { ok: true };
  }

  /**
   * Complete a password reset with the emailed 6-digit code. Validates the
   * latest unused/non-expired OTP for the email's user (attempts + expiry rules),
   * then sets the new bcrypt password and consumes the code.
   */
  async resetPassword(dto: ResetPasswordDto): Promise<{ ok: true }> {
    const email = dto.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Same generic error as a stale code — no account enumeration.
      throw new BadRequestException('Mã không hợp lệ hoặc đã hết hạn');
    }
    await this.verifyOtpAndSetPassword(
      user.id,
      dto.code,
      dto.password,
      'auth.password_reset',
      user.email,
    );
    return { ok: true };
  }

  // ── Change password (LOGGED IN, OTP) ────────────────────────────────────────

  /**
   * Email the CURRENT user a 6-digit change-password OTP (60s cooldown). Returns
   * the masked email the code was sent to (e.g. `d***@gmail.com`).
   */
  async requestChangePasswordCode(userId: string, email: string): Promise<{ ok: true; sentTo: string }> {
    await this.issuePasswordOtp(userId, email, 'change');
    return { ok: true, sentTo: this.maskEmail(email) };
  }

  /**
   * Verify the current user's latest change-password OTP and set the new
   * password (same attempts/expiry rules as reset).
   */
  async changePassword(
    userId: string,
    email: string,
    code: string,
    newPassword: string,
  ): Promise<{ ok: true }> {
    await this.verifyOtpAndSetPassword(
      userId,
      code,
      newPassword,
      'auth.password_change',
      email,
    );
    return { ok: true };
  }

  /** Mask an email for display: keep the first char + domain (`d***@gmail.com`). */
  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return '***';
    const head = local.slice(0, 1);
    return `${head}***@${domain}`;
  }

  // ── Google OAuth ───────────────────────────────────────────────────────────

  /** Whether Google login is configured (drives /auth/config + the 503 guard). */
  get googleEnabled(): boolean {
    return Boolean(this.config.env.GOOGLE_CLIENT_ID);
  }

  /** Build the Google consent-screen URL to 302-redirect the user to. */
  buildGoogleConsentUrl(state: string): string {
    const { GOOGLE_CLIENT_ID, GOOGLE_REDIRECT_URI } = this.config.env;
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'select_account',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Exchange the OAuth `code` for the user's Google profile, find-or-create the
   * matching local user, and issue the SAME JWT as normal login. Returns the
   * JWT token. Throws on any failure (the controller turns it into the
   * `/login?error=google` redirect).
   */
  async googleLogin(code: string, device?: DeviceCtx): Promise<string> {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = this.config.env;

    // 1. Exchange the authorization code for an access token.
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) {
      throw new Error(`Google token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
    }
    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    if (!tokenJson.access_token) throw new Error('Google token response missing access_token');

    // 2. Fetch the user profile.
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!profileRes.ok) {
      throw new Error(`Google userinfo failed: ${profileRes.status}`);
    }
    const profile = (await profileRes.json()) as {
      email?: string;
      name?: string;
      picture?: string;
      verified_email?: boolean;
    };
    if (!profile.email) throw new Error('Google profile missing email');

    const email = profile.email.toLowerCase().trim();
    const picture = profile.picture?.trim() || null;

    // 3. Find-or-create the local user (case-insensitive email match).
    let user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (!user) {
      // Random un-guessable hash so password login is disabled until they reset.
      const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
      user = await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          name: profile.name?.trim() || email.split('@')[0],
          avatarUrl: picture,
          role: 'user',
          status: 'active',
        },
      });
      await ensureIdentity(this.prisma, user.id);
    } else if (picture && !user.avatarUrl) {
      // Refresh the avatar from Google only when the user hasn't set one yet
      // (never clobber a user-uploaded avatar on subsequent logins).
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { avatarUrl: picture },
      });
    }
    if (user.status === 'suspended') throw new ForbiddenException('Tài khoản đã bị khoá');

    await this.audit.log(user.id, user.email, 'auth.google_login', user.id);
    const { token } = await this.sign(user, { device });
    return token;
  }

  // ── GitLab / GitHub OAuth (connect or login) ────────────────────────────────

  /** Whether a git provider's OAuth is configured (drives /auth/config + 503). */
  gitProviderEnabled(provider: GitProvider): boolean {
    return this.gitProviders.isEnabled(provider);
  }

  /** Build the GitLab/GitHub consent URL to 302-redirect the user to. */
  buildGitConsentUrl(provider: GitProvider, state: string): string {
    return this.gitProviders.buildConsentUrl(provider, state);
  }

  /**
   * Verify a `?link=<jwt>` so a LOGGED-IN user can CONNECT a provider to their
   * existing account. Returns the user id when the token is a valid Larkwave
   * JWT, else null (callback then falls back to login/create by email).
   */
  async resolveLinkUserId(linkToken: string | undefined): Promise<string | null> {
    if (!linkToken) return null;
    try {
      const payload = await this.jwt.verifyAsync<{ sub?: string }>(linkToken, {
        secret: this.config.env.JWT_SECRET,
      });
      return payload.sub ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Complete a git-provider OAuth flow: exchange `code` for the user's access
   * token, fetch their provider profile, resolve the target user (the linked
   * current user when `linkUserId` is set, else find-or-create by email), store
   * the provider token + username on that user, and issue the Larkwave JWT.
   * Returns the JWT. Throws on failure (controller -> /login?error=<provider>).
   */
  async gitOAuthLogin(
    provider: GitProvider,
    code: string,
    linkUserId: string | null,
    device?: DeviceCtx,
  ): Promise<string> {
    const tok = await this.gitProviders.exchangeCode(provider, code);
    const profile = await this.gitProviders.fetchProfile(provider, tok.accessToken);

    const tokenField = provider === 'gitlab' ? 'gitlabToken' : 'githubToken';
    const userField = provider === 'gitlab' ? 'gitlabUsername' : 'githubUsername';

    let user: PUser | null = null;

    // 1) Linked connect flow — attach to the already-logged-in user.
    if (linkUserId) {
      user = await this.prisma.user.findUnique({ where: { id: linkUserId } });
    }

    // 2) Login/create by email (like Google) when not linking.
    if (!user) {
      const email = profile.email;
      if (email) {
        user = await this.prisma.user.findFirst({
          where: { email: { equals: email, mode: 'insensitive' } },
        });
      }
      if (!user) {
        if (!email) {
          throw new Error(`${provider} profile missing email and no linked account`);
        }
        const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
        user = await this.prisma.user.create({
          data: {
            email,
            passwordHash,
            name: profile.username || email.split('@')[0],
            role: 'user',
            status: 'active',
          },
        });
        await ensureIdentity(this.prisma, user.id);
      }
    }

    if (user.status === 'suspended') throw new ForbiddenException('Tài khoản đã bị khoá');

    // Store the provider token + username on the resolved user (never logged).
    // For GitLab also persist the refresh token + expiry so the connection
    // auto-renews instead of forcing a re-authorize every couple of hours.
    user = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        [tokenField]: tok.accessToken,
        [userField]: profile.username || null,
        ...(provider === 'gitlab'
          ? { gitlabRefreshToken: tok.refreshToken, gitlabTokenExpiresAt: tok.expiresAt }
          : {}),
      },
    });

    await this.audit.log(user.id, user.email, `auth.${provider}_connect`, user.id, {
      username: profile.username,
      linked: Boolean(linkUserId),
    });
    const { token: jwt } = await this.sign(user, { device });
    return jwt;
  }

  /**
   * Mint a login token for an arbitrary user — ADMIN IMPERSONATION ONLY. The
   * caller (UsersService) MUST enforce the admin role + audit-log it. The token
   * carries an `imp` claim (the impersonating admin's id) for traceability and a
   * SHORT expiry (impersonation is a diagnostics session, not a durable login).
   */
  async signFor(user: PUser, impersonatedBy: string): Promise<AuthResponse> {
    return this.sign(user, { impersonatedBy, expiresIn: '60m' });
  }

  /**
   * Token cho tiến trình chạy lịch tự động hoá hộ người dùng (`LarkHostedRunner`).
   *
   * Cố ý KHÔNG có `device`: runner không phải một thiết bị của người dùng, nên nó không được
   * chiếm một suất trong hạn mức 3 máy — và cũng không được bị đá ra khi người dùng đăng nhập
   * máy thứ tư.
   *
   * Cố ý NGẮN HẠN (6 giờ) dù JWT_EXPIRES_IN mặc định là 365 ngày: runner nạp lại danh sách
   * tenant định kỳ và ký lại, nên việc treo tài khoản hay đổi mật khẩu chạm được tới nó trong
   * vòng vài giờ. Ký dài hạn thì một tài khoản đã khoá vẫn có thứ chạy nền thay mặt nó.
   */
  async signForRunner(user: PUser): Promise<string> {
    const { token } = await this.sign(user, { expiresIn: '6h' });
    return token;
  }

  private async sign(
    user: PUser,
    ctx?: { device?: DeviceCtx; impersonatedBy?: string; expiresIn?: string },
  ): Promise<AuthResponse> {
    const expiresIn = ctx?.expiresIn ?? this.config.env.JWT_EXPIRES_IN;
    // Register a login SESSION (device) for real logins (NOT impersonation) + enforce the device cap.
    // Best-effort: any failure leaves `sid` undefined so the login still succeeds.
    let sid: string | undefined;
    if (ctx?.device && !ctx.impersonatedBy) {
      sid = await this.registerDevice(user.id, ctx.device).catch(() => undefined);
    }
    const token = await this.jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        // Session-revocation stamp — the guard rejects the token if this drifts from the
        // user's current tokenVersion (bumped on password change).
        tv: user.tokenVersion,
        // Per-device session id — the guard rejects the token once this session is revoked
        // (evicted by the device cap or logged out from the device manager). Absent on
        // impersonation / legacy tokens (which skip the device check).
        ...(sid ? { sid } : {}),
        ...(ctx?.impersonatedBy ? { imp: ctx.impersonatedBy } : {}),
      },
      { secret: this.config.env.JWT_SECRET, expiresIn: expiresIn as unknown as number },
    );
    return { token, expiresIn: parseDurationToSeconds(expiresIn), user: toUser(user) };
  }

  /**
   * Create a login session for THIS device, then enforce the per-account cap: keep the
   * MAX_DEVICES most-recently-seen sessions and revoke the rest (the just-created one is the
   * newest, so a 4th login evicts the least-recently-used device — that device is logged out on
   * its next request). Returns the new session id, or throws (the caller swallows → login still ok).
   */
  private async registerDevice(userId: string, ctx: DeviceCtx): Promise<string> {
    const session = await this.prisma.loginSession.create({
      data: {
        userId,
        kind: deviceKindFromUA(ctx.userAgent),
        label: deviceLabelFromUA(ctx.userAgent),
        userAgent: ctx.userAgent?.slice(0, 400) ?? null,
        ip: ctx.ip?.slice(0, 64) ?? null,
      },
      select: { id: true },
    });
    const active = await this.prisma.loginSession.findMany({
      where: { userId, revokedAt: null },
      orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true },
    });
    // Per-account cap: deviceLimit null → the default MAX_DEVICES; a positive value is a
    // custom cap; 0 or negative means UNLIMITED (no eviction — e.g. a shared team account).
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { deviceLimit: true },
    });
    const cap = u?.deviceLimit == null ? MAX_DEVICES : u.deviceLimit;
    if (cap > 0 && active.length > cap) {
      const evict = active.slice(cap).map((s) => s.id);
      await this.prisma.loginSession.updateMany({
        where: { id: { in: evict } },
        data: { revokedAt: new Date() },
      });
    }
    return session.id;
  }

  // ── Device manager (login sessions) ─────────────────────────────────────────
  /** List the account's ACTIVE devices, newest-seen first; the caller marks the current one. */
  async listDevices(userId: string): Promise<
    { id: string; kind: string; label: string; ip: string | null; createdAt: string; lastSeenAt: string }[]
  > {
    const rows = await this.prisma.loginSession.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastSeenAt: 'desc' },
      select: { id: true, kind: true, label: true, ip: true, createdAt: true, lastSeenAt: true },
    });
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      label: r.label,
      ip: r.ip,
      createdAt: r.createdAt.toISOString(),
      lastSeenAt: r.lastSeenAt.toISOString(),
    }));
  }

  /** Revoke (log out) one of the account's devices. Only the owner may revoke their own session. */
  async revokeDevice(userId: string, sessionId: string): Promise<{ ok: boolean }> {
    const res = await this.prisma.loginSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: res.count > 0 };
  }
}
