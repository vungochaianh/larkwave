import { z } from 'zod';

/**
 * Strongly-typed, validated environment. The process refuses to boot if a
 * required secret is missing, so misconfiguration fails fast & loud.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  PORT: z.coerce.number().int().positive().default(4101),
  /**
   * Interface to bind. Defaults to LOOPBACK: nginx (the only intended consumer) proxies to
   * 127.0.0.1:4101, so binding every interface only exposed the whole API — /v1/*, the SePay and
   * agent webhooks, /uploads — to the LAN and the tailnet, where it bypasses Cloudflare, nginx,
   * and every rate limit. Set BIND_ADDR=0.0.0.0 to restore the old behaviour if something really
   * does need to reach the API off-box.
   */
  BIND_ADDR: z.string().default('127.0.0.1'),

  // Database
  DATABASE_URL: z.string().min(10),

  // Claude — direct Anthropic API, used by the help assistant (fallback when MAIC is unset)
  // and feedback triage. Optional: those paths degrade gracefully without it.
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  ANTHROPIC_MODEL: z.string().default('claude-opus-4-8'),
  // OpenAI (optional) — secondary provider for failover / cheap aux tasks. Inert
  // until set. Use a PROJECT key (sk-proj-…), NEVER an admin key (sk-admin-…).
  OPENAI_API_KEY: z.string().optional().default(''),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  // Image generation (assistant "tạo hình" → real AI image). Uses OPENAI_API_KEY.
  OPENAI_IMAGE_MODEL: z.string().default('gpt-image-1'),
  // xAI Grok (optional) — third provider in the failover rotation. xAI exposes an
  // OpenAI-COMPATIBLE API, so it reuses the same client. Inert until set.
  GROK_API_KEY: z.string().optional().default(''),
  GROK_MODEL: z.string().default('grok-2-1212'),
  // MAIC — Larkwave-hosted Claude Code gateway over HTTP (CLI-less agent access, so
  // users need no local Claude and no friend-share). Feature is INERT until BOTH
  // MAIC_URL and MAIC_TOKEN are set. MAIC_TOKEN NEVER leaves apps/api (not sent to any
  // client, never logged). MAIC_USD_PER_MTOK = the blended $/1M-token rate used to
  // convert MAIC's returned costUsd into the token unit the % budget meters against.
  /**
   * Khoá chung cho đường CẤP TÀI KHOẢN service-to-service (`POST /auth/service/link`).
   *
   * Để trống = TẮT HẲN đường đó. Mặc định tắt là có chủ ý: một endpoint đổi "id người dùng của
   * hệ khác" lấy token Larkwave mà bật sẵn thì chỉ cần lộ khoá là lộ mọi tài khoản nó tạo ra.
   * Chỉ bật trên máy chủ thật, và đặt khoá đủ dài.
   */
  SERVICE_LINK_SECRET: z.string().optional().default(''),
  MAIC_URL: z.string().optional().default(''),
  MAIC_TOKEN: z.string().optional().default(''),
  MAIC_USD_PER_MTOK: z.coerce.number().positive().default(10),
  // User uploads (avatars). Served statically at the API origin under /uploads.
  UPLOADS_DIR: z.string().default('./uploads'),
  // API public ORIGIN (no path) — uploaded avatar URLs are `${PUBLIC_API_URL}/uploads/...`.
  // NOTE: static /uploads is served OUTSIDE the global 'v1' prefix, so this is the
  // bare origin, not the /v1 base.
  PUBLIC_API_URL: z.string().default('https://api.toolswave.net'),

  // Security / surfaces
  ADMIN_EMAIL: z.string().email().default('admin@toolswave.net'),
  ADMIN_PASSWORD: z.string().min(6).default('change-me-strong-pass'),
  // Additional platform admins (comma-separated emails). They get NO preset
  // password — they sign in via Google OAuth / "forgot password". Merged with
  // the canonical list hardcoded in seed.ts. Optional; empty by default.
  ADMIN_EMAILS: z.string().optional().default(''),
  JWT_SECRET: z.string().min(16).default('toolswave-dev-secret-change-me-please-now'),
  // Long-lived sessions by design: a token stays valid until the password changes (which
  // bumps User.tokenVersion → the guard rejects old tokens) or the account is suspended.
  // Revocation is enforced server-side, so the timer only needs to be a safety backstop.
  JWT_EXPIRES_IN: z.string().default('365d'),
  ALLOW_REGISTRATION: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  CORS_ORIGINS: z.string().default('https://toolswave.net,https://cms.toolswave.net'),

  // ── Kho khoá Lark của tính năng "Larkwave chạy lịch hộ" (LarkHostedRunner) ──────────
  // CỐ Ý tách khỏi JWT_SECRET: JWT_SECRET có mặt ở nhiều đường (ký token, mã API key), nên
  // nếu nó lộ mà kho khoá Lark dùng chung thì mất luôn app_secret của mọi tenant đã bật.
  // Bỏ trống ⇒ tính năng TẮT HẲN (service từ chối ghi) — không âm thầm tụt về JWT_SECRET,
  // vì một fallback im lặng đúng là cách cái tách biệt này biến mất mà không ai hay.
  LARK_CREDS_KEY: z.string().optional().default(''),
  // Khoá để tiến trình tw-lark-runner tự xưng ở các endpoint /internal/lark-hosted/*.
  // Bỏ trống ⇒ các endpoint đó trả 404 như thể không tồn tại.
  LARK_RUNNER_SERVICE_KEY: z.string().optional().default(''),

  // SePay — bank-transfer payment gateway. All optional (feature is inert when unset).
  SEPAY_WEBHOOK_APIKEY: z.string().optional().default(''),
  // SePay user API token — enables ACTIVE polling of the transactions API to
  // auto-reconcile payments (a robust fallback that doesn't depend on the webhook
  // firing). Inert until set. https://my.sepay.vn → Cấu hình → API Access.
  SEPAY_API_TOKEN: z.string().optional().default(''),
  TW_BANK_BIN: z.string().optional().default(''), // VietQR bank BIN, e.g. 970407=Techcombank
  TW_BANK_ACCOUNT: z.string().optional().default(''),
  TW_BANK_HOLDER: z.string().optional().default(''),
  TW_BANK_NAME: z.string().optional().default(''), // display name e.g. "Techcombank"

  // SMTP / outbound mail (forgot-password). All optional — mail feature is inert
  // (logs a warning, no throw) until SMTP_USER + SMTP_PASS are both set.
  SMTP_HOST: z.string().optional().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_FROM: z.string().optional().default(''), // defaults to SMTP_USER at runtime
  MAIL_FROM_NAME: z.string().optional().default('Larkwave'),

  // Google OAuth login. All optional — the feature returns 503 / hides the button
  // until GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET are set.
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_REDIRECT_URI: z
    .string()
    .optional()
    .default('https://api.toolswave.net/v1/auth/google/callback'),

  // GitLab OAuth (login). All optional — routes return 503 / hide the
  // button until GITLAB_OAUTH_CLIENT_ID + GITLAB_OAUTH_CLIENT_SECRET are set.
  GITLAB_OAUTH_CLIENT_ID: z.string().optional().default(''),
  GITLAB_OAUTH_CLIENT_SECRET: z.string().optional().default(''),
  GITLAB_OAUTH_REDIRECT: z
    .string()
    .optional()
    .default('https://api.toolswave.net/v1/auth/gitlab/callback'),

  // GitHub OAuth (login). All optional — same degrade-gracefully rule.
  GITHUB_OAUTH_CLIENT_ID: z.string().optional().default(''),
  GITHUB_OAUTH_CLIENT_SECRET: z.string().optional().default(''),
  GITHUB_OAUTH_REDIRECT: z
    .string()
    .optional()
    .default('https://api.toolswave.net/v1/auth/github/callback'),

  // Public web origin — used to build password-reset links and OAuth redirects.
  // Trang web công khai — nơi API ném người dùng về sau khi đăng nhập Google, và là mốc dự phòng
  // khi `?origin=` không nằm trong CORS_ORIGINS.
  //
  // Sau lần hoán đổi tên miền 22/09/2026, đây là `toolswave.net`. Biến này TRƯỚC ĐÓ KHÔNG được
  // đặt trong .env máy chủ, nên nó chạy bằng đúng giá trị mặc định ở dòng này — và mặc định cũ
  // (`app.toolswave.net`) sau khi hoán đổi lại trỏ sang một hệ thống KHÁC. Hậu quả sẽ là: đăng
  // nhập Google xong, người dùng bị ném sang portal của hệ khác. Nay .env đã đặt tường minh, và
  // mặc định ở đây cũng sửa cho khớp.
  WEB_PUBLIC_URL: z.string().optional().default('https://toolswave.net'),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  // In production, loudly warn (non-fatal, to avoid bricking a running API) if the
  // master secrets are still the dev defaults. JWT_SECRET both signs JWTs AND keys
  // the at-rest encryption of stored secrets — a known default is unsafe.
  if (raw.NODE_ENV === 'production') {
    if (parsed.data.JWT_SECRET === 'toolswave-dev-secret-change-me-please-now') {
      // eslint-disable-next-line no-console
      console.warn(
        '[env] ⚠️ JWT_SECRET đang là giá trị mặc định trong PRODUCTION — nó vừa ký JWT vừa mã hoá API keys/secrets. Hãy đặt một giá trị mạnh & riêng.',
      );
    }
    if (parsed.data.ADMIN_PASSWORD === 'change-me-strong-pass') {
      // eslint-disable-next-line no-console
      console.warn('[env] ⚠️ ADMIN_PASSWORD đang là mặc định trong PRODUCTION — hãy đổi ngay.');
    }
    if (parsed.data.LARK_CREDS_KEY && parsed.data.LARK_CREDS_KEY === parsed.data.JWT_SECRET) {
      // eslint-disable-next-line no-console
      console.warn(
        '[env] ⚠️ LARK_CREDS_KEY đặt TRÙNG JWT_SECRET — mất hết ý nghĩa của việc tách kho khoá Lark. Hãy sinh một giá trị riêng.',
      );
    }
  }
  return parsed.data;
}

export const ENV_TOKEN = 'ENV';
