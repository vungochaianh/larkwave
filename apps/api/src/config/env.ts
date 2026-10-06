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

  // Claude — the codegen brain
  ANTHROPIC_API_KEY: z.string().min(10),
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
  // ElevenLabs TTS — Video Studio narration voices. Inert until set (header `xi-api-key`).
  ELEVENLABS_API_KEY: z.string().optional().default(''),
  // Video Studio render: where Playwright's Chromium lives (shared, readable by the `app` user).
  PLAYWRIGHT_BROWSERS_PATH: z.string().optional().default(''),

  // Cloudflare — Pages deploy target
  CF_ACCOUNT_ID: z.string().min(8),
  CF_API_TOKEN: z.string().min(8),
  DOMAIN_GOC: z.string().default('toolswave.net'),
  // Optional: a DNS-edit token + zone id + the apps tunnel id enable
  // <slug>.toolswave.net domains (served via our reverse-proxy tunnel).
  CF_DNS_API_TOKEN: z.string().optional().default(''),
  CF_ZONE_ID: z.string().optional().default(''),
  TW_APPS_TUNNEL_ID: z.string().optional().default(''),

  // GitLab — optional; auto-detected at runtime
  GITLAB_TOKEN: z.string().optional().default(''),
  GITLAB_GROUP: z.string().default('toolswave'),
  GITLAB_HOST: z.string().default('https://gitlab.com'),
  // Deploy-token mode: push each app as a folder into one pre-created monorepo.
  GITLAB_DEPLOY_USER: z.string().optional().default(''),
  GITLAB_MONOREPO: z.string().optional().default(''),

  // Filesystem (build scratch + downloadable artefacts)
  WORKSPACE_DIR: z.string().default('.workspace'),
  ARTIFACTS_DIR: z.string().default('.artifacts'),
  // User uploads (avatars). Served statically at the API origin under /uploads.
  UPLOADS_DIR: z.string().default('./uploads'),
  // API public ORIGIN (no path) — uploaded avatar URLs are `${PUBLIC_API_URL}/uploads/...`.
  // NOTE: static /uploads is served OUTSIDE the global 'v1' prefix, so this is the
  // bare origin, not the /v1 base.
  PUBLIC_API_URL: z.string().default('https://api.toolswave.net'),

  // Backend của PORTAL (hệ B) — nguồn danh mục cửa hàng ở giai đoạn 1, xem
  // `docs/hop-nhat-cua-hang-va-nen-tang.md`. Mặc định là địa chỉ công khai để chạy được ở mọi
  // máy; trên máy chủ thật nên đặt `http://127.0.0.1:4001/api` vì hai hệ nằm CÙNG một máy —
  // đi vòng qua Cloudflare rồi quay lại chỉ thêm độ trễ và thêm một chỗ hỏng.
  // Để RỖNG là tắt hẳn cửa hàng (API trả danh mục rỗng, không lỗi).
  PORTAL_API_BASE: z.string().optional().default('https://apia.toolswave.net/api'),

  // Địa chỉ công khai của portal — nơi DUY NHẤT còn nhận đơn ở giai đoạn 1, nên mọi nút "Mua"
  // trỏ về đây. Giai đoạn 3 chuyển sang đường mua nội bộ và biến này thành thừa.
  PORTAL_PUBLIC_URL: z.string().optional().default('https://app.toolswave.net'),

  // Nguồn danh mục cửa hàng. Mặc định `auto`: có hàng trong bảng `Listing` thì đọc bảng, chưa có
  // thì đọc portal — nghĩa là việc NHẬP DỮ LIỆU của giai đoạn 2 tự nó lật nguồn, không cần một
  // lần deploy thứ hai đi kèm, và cũng không có khoảnh khắc nào mặt tiền trắng ở giữa.
  //
  // Hai giá trị ép là van khoá tay, mỗi cái cho một tình huống đã lường trước:
  //   `portal` — nhập hỏng giữa chừng (thiếu ảnh, sai giá, mất nửa danh mục). Đổi một biến rồi
  //              khởi động lại là cửa hàng quay về đúng thứ đang chạy tốt hôm nay, trong khi
  //              dữ liệu được dọn lại; không phải revert mã, không phải deploy.
  //   `local`  — soi nhánh mới trên máy chủ thật trước khi tin nó. Ép local thì lỗi cơ sở dữ
  //              liệu HIỆN RA (danh mục rỗng + log) thay vì được portal đỡ hộ — tự cứu ngầm là
  //              đúng cách làm cho thứ ta đang muốn kiểm không bao giờ lộ mặt.
  STORE_SOURCE: z.enum(['local', 'portal', 'auto']).optional().default('auto'),

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

  // GitLab OAuth (connect/import). All optional — routes return 503 / hide the
  // button until GITLAB_OAUTH_CLIENT_ID + GITLAB_OAUTH_CLIENT_SECRET are set.
  // These are the PER-USER OAuth app creds (distinct from the platform GITLAB_TOKEN).
  GITLAB_OAUTH_CLIENT_ID: z.string().optional().default(''),
  GITLAB_OAUTH_CLIENT_SECRET: z.string().optional().default(''),
  GITLAB_OAUTH_REDIRECT: z
    .string()
    .optional()
    .default('https://api.toolswave.net/v1/auth/gitlab/callback'),

  // GitHub OAuth (connect/import). All optional — same degrade-gracefully rule.
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

  // Server (Docker) deploy target — optional. Enables the "Deploy lên Server"
  // feature for full-stack apps (a docker-compose.yml) when host + ssh creds +
  // tunnel are set. Fully inert (feature hidden) until configured.
  SERVER_DEPLOY_HOST: z.string().optional().default(''),       // e.g. root@100.100.164.92
  SERVER_DEPLOY_SSH_PASS: z.string().optional().default(''),   // root ssh password (legacy; prefer SSH_KEY)
  SERVER_DEPLOY_SSH_KEY: z.string().optional().default(''),    // path to a private key for key-auth (no password stored)
  SERVER_DEPLOY_TUNNEL_ID: z.string().optional().default(''),  // cloudflared tunnel id
  // Origin cert authorising DNS edits for the DEPLOY domain's zone. The default
  // root cert may belong to a DIFFERENT zone (→ route dns creates the CNAME under
  // the wrong domain → NXDOMAIN), so point at the toolswave.net origin cert.
  SERVER_DEPLOY_ORIGIN_CERT: z.string().optional().default('/home/deveris/.cloudflared/cert-toolswave.pem'),
  SERVER_DEPLOY_DIR: z.string().optional().default('/var/www/tw-apps'),
  SERVER_DEPLOY_DOMAIN: z.string().optional().default('toolswave.net'),
  SERVER_DEPLOY_PORT_BASE: z.coerce.number().int().positive().default(9200),

  // Limits
  MAX_CONCURRENT_JOBS: z.coerce.number().int().positive().default(2),
  COST_LIMIT_USD: z.coerce.number().positive().default(5),
  MAX_FIX_ATTEMPTS: z.coerce.number().int().nonnegative().default(2),
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
  // the at-rest encryption of API keys / app secrets — a known default is unsafe.
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
