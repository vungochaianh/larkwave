/**
 * @larkwave/core — the platform-agnostic contract between the SHARED UI and a
 * RUNTIME. The UI (packages/ui) only ever talks to a `RuntimeAdapter`; it never
 * knows whether the AI runs on the server (web, hosted MAIC) or via the local CLI
 * runners (desktop). Swap the adapter → same UI runs on both. This is what lets the
 * web app and the Nextron desktop app stay in sync from one codebase.
 */

import type { SkillContractFields } from './skillContract';

export type RuntimeKind = 'web' | 'desktop';

/**
 * The user-facing "modes" — a recognizable set that maps onto Claude Code
 * permission modes for the desktop runtime:
 *  - 'plan'  → read-only, propose a plan first   (claude --permission-mode plan)
 *  - 'ask'   → ask before each change             (claude --permission-mode default)
 *  - 'build' → auto-apply edits                    (claude --permission-mode acceptEdits)
 *  - 'auto'  → fully autonomous, no prompts        (claude --permission-mode auto)
 * The web runtime ignores the permission semantics (server-side) but keeps the
 * same labels so the UI is identical.
 */
export type AppMode = 'plan' | 'build' | 'ask' | 'auto';

export type BuildStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';

/** A streamed event from a local CLI runner turn (claudeRunner / runners/*). The Lark engine
 *  turns these into LarkChatEvents; the name is historical. */
export type BuildEvent =
  | { type: 'status'; status: BuildStatus }
  | { type: 'stage'; name: string; state: 'running' | 'done' | 'error' }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string }
  | { type: 'file'; path: string; bytes: number }
  | { type: 'progress'; ratio: number; note?: string }
  | { type: 'result'; appId: string; buildId?: string; previewUrl?: string }
  | { type: 'error'; message: string };

export interface AuthState {
  signedIn: boolean;
  email?: string;
  /** For desktop: whether a usable local Claude CLI/SDK was detected. */
  claudeAvailable?: boolean;
}

/** Desktop code-push status (renderer OTA + full-version availability). */
export interface DesktopUpdateInfo {
  /** The renderer is currently served from a pushed remote build. */
  remote: boolean;
  /** A newer FULL version exists (main changed) → user should reinstall the app. */
  reinstall: boolean;
  current: string;
  latest?: string;
  /** Version of the renderer the manifest advertises (diagnostic; shown in the footer). */
  rendererVersion?: string;
  /**
   * Có bản cài mới hơn VÀ bản đó có sửa phần LÕI → cài lại mới nhận được bản sửa.
   *
   * Khác `reinstall`: `reinstall` chỉ bật khi renderer mới KHÔNG CHẠY NỔI trên lõi cũ
   * (minMain > bản đang cài). Một bản vá lõi phát hành mà vẫn giữ nguyên minMain — cách phát hành
   * đúng, để không ép ai rơi về renderer đóng gói — cho `reinstall = false`, nên trước đây màn
   * phiên bản IM LẶNG đúng lúc người dùng cần biết nhất.
   */
  mainFixPending?: boolean;
  notice?: string;
}

// ── Local SQLite browser (desktop "Cơ sở dữ liệu" tab) ──────────────────────────

/** Local Claude Code CLI status (desktop only) — from `claude auth status`. */
export interface ClaudeStatus {
  installed: boolean;
  version?: string;
  loggedIn: boolean;
  email?: string;
  plan?: string; // subscriptionType, e.g. "max"
  authMethod?: string; // e.g. "claude.ai"
}

export type ClaudeLoginEvent =
  | { type: 'url'; url: string } // open this to authenticate
  | { type: 'log'; message: string }
  | { type: 'done'; status: ClaudeStatus }
  | { type: 'error'; message: string };

/**
 * One managed Anthropic API key (the COMPLIANT team-access path). The raw key never
 * crosses this boundary — only the masked form. The admin distributes org-provisioned
 * `sk-ant-api…` keys; this is NOT for handing off a personal `sk-ant-oat…` login token.
 */
export interface ApiKeyEntry {
  id: string;
  label: string;
  /** `sk-ant-…1234` — the raw key stays in the main process. */
  masked: string;
  /** This key is the one fed to the Claude CLI. */
  active: boolean;
  /** ISO timestamp added. */
  addedAt: string;
  /** ISO timestamp of the last validation, if any. */
  lastValidated?: string;
  /** Last validation result (true=accepted by Anthropic, false=rejected). */
  valid?: boolean;
}

/** The managed-keys view: masked entries + whether at-rest encryption is active. */
export interface ApiKeyList {
  keys: ApiKeyEntry[];
  /** false ⇒ stored without OS keychain (PLAIN) → the UI warns. */
  encrypted: boolean;
}

/** Result of validating an API key against the Anthropic API. */
export interface KeyValidation {
  ok: boolean;
  /** The model the validation call used (when ok). */
  model?: string;
  /** Friendly Vietnamese reason when not ok. */
  error?: string;
}

/**
 * Desktop-only controls for the local Claude Code CLI. Present as
 * `RuntimeAdapter.claude` on the desktop runtime; undefined on web (the UI shows
 * the "Kết nối Claude" gate only when this exists).
 */
export interface ClaudeControls {
  status(): Promise<ClaudeStatus>;
  /** Runs `claude auth login` (opens the browser OAuth flow) and streams it. */
  login(): AsyncIterable<ClaudeLoginEvent>;
  logout(): Promise<void>;
  /**
   * Authenticate by pasting a token instead of the OAuth flow — an API key
   * (`sk-ant-api…`, billed per-token) or an OAuth token (`sk-ant-oat…` from
   * `claude setup-token`, uses the Pro/Max plan). Returns the new status.
   */
  setToken(token: string): Promise<ClaudeStatus>;
  /** Forget the pasted token (revert to the CLI's own login). Returns the new status. */
  clearToken(): Promise<ClaudeStatus>;

  // ── Managed API keys (team access; desktop only, optional for older bundles) ──
  /** List the managed Anthropic API keys (masked) + at-rest encryption state. */
  listKeys?(): Promise<ApiKeyList>;
  /** Add an `sk-ant-api…` key (validates it first; throws on a non-API-key input). */
  addKey?(input: { label: string; key: string }): Promise<ApiKeyList>;
  /** Remove a managed key by id. */
  removeKey?(id: string): Promise<ApiKeyList>;
  /** Make a managed key the active one fed to the Claude CLI. */
  setActiveKey?(id: string): Promise<ApiKeyList>;
  /** Validate a raw key against the Anthropic API (used before adding + for "Kiểm tra"). */
  validateKey?(key: string): Promise<KeyValidation>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-CLI runners (desktop only) — Claude + Grok + Gemini + Codex behind one
// registry. The renderer's provider/model picker + "AI runners" connect panel
// talk to these; the chat composers pass the chosen `runner` to larkChat.
// ─────────────────────────────────────────────────────────────────────────────

export interface RunnerStatusInfo {
  id: string;
  label: string;
  /** Binary name (e.g. 'claude', 'grok', 'gemini', 'codex'). */
  bin: string;
  /** Absolute path when the binary is on PATH (desktop probes via `which`). */
  binPath?: string;
  /** Binary found on PATH. */
  installed: boolean;
  /** Authenticated (logged-in CLI or a stored key/token). */
  loggedIn: boolean;
  /** Installed + authenticated — safe to pick in the composer. */
  ready?: boolean;
  version?: string;
  /** Bản mới nhất trên npm (tra một lần, có cache). Không tra được thì bỏ trống. */
  latestVersion?: string;
  /**
   * Bản đang cài CŨ hơn bản mới nhất.
   *
   * Cần vì model được chọn bằng BÍ DANH (`opus`, `fable`), và bí danh chỉ trỏ tới model mới khi
   * CLI đủ mới. Một máy cài CLI cũ sẽ lặng lẽ chạy model đời trước — không lỗi, không cảnh báo,
   * chỉ là kết quả kém hơn mà không ai hiểu vì sao.
   */
  outdated?: boolean;
  authMethod?: string;
  models: { id: string; label: string }[];
  /** Friendly hint when not installed (e.g. the npm install command). */
  installHint?: string;
  /** A direct-API key is stored for this provider — so it can run via API even without the CLI. */
  apiKey?: boolean;
}

/** Desktop-only controls for the multi-CLI runner registry. */
export interface RunnerControls {
  /** All known runners with live installed/logged-in status. */
  list(): Promise<RunnerStatusInfo[]>;
  /** Store an API key / token for a runner (provider-specific env var). Returns the new list. */
  setToken(id: string, token: string): Promise<RunnerStatusInfo[]>;
  /** Forget a runner's stored key/token. Returns the new list. */
  clearToken(id: string): Promise<RunnerStatusInfo[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Remote control ("Điều khiển từ xa") — desktop agent client (desktop only)
//
// When enabled, the desktop holds an SSE command stream to the server and runs
// tasks the user enqueues from their phone, streaming progress back. OFF by
// default; the app must be open + signed in. This is the desktop side of the
// phone → server → desktop relay.
// ─────────────────────────────────────────────────────────────────────────────

/** A named webhook token as shown to the user (never the raw token again). */
export interface AgentWebhookTokenInfo {
  id: string;
  name: string;
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  /** OUTBOUND notify target for tasks triggered by this token. */
  notifyLarkWebhookUrl?: string | null;
  notifyTelegramChatId?: string | null;
}

/** Result of testing a token — usable + a device ready to run (nothing is run). */
export interface TokenTestResult {
  tokenValid: boolean;
  deviceOnline: boolean;
  deviceName?: string | null;
  lastSeenSec?: number | null;
}

/** Set/clear a token's outbound notify target (omit = unchanged; '' = clear). */
export interface UpdateTokenNotifyInput {
  notifyLarkWebhookUrl?: string | null;
  notifyTelegramChatId?: string | null;
}

/** A Telegram chat bound to the user (messages there trigger a remote run). */
export interface TelegramBindingInfo {
  id: string;
  chatId: string;
  chatTitle: string | null;
  createdAt: string;
}

/** One-time Telegram bind code + deep link. */
export interface TelegramLinkResponse {
  code: string;
  deepLink: string | null;
  botConfigured: boolean;
  botUsername?: string | null;
}

export interface AgentClientStatus {
  /** Master toggle (off by default). */
  enabled: boolean;
  /** Whether the SSE command stream is currently connected. */
  connected: boolean;
  /** Whether the user is signed in to a Larkwave account (required to connect). */
  signedIn: boolean;
  /** This machine's display name (sent to the server as the device name). */
  deviceName: string;
  /** The RAW token just created — shown ONCE, then cleared; null otherwise. */
  webhookToken: string | null;
  /** The user's NAMED webhook tokens (label model — each can be used from an external service). */
  webhookTokens: AgentWebhookTokenInfo[];
  /** Telegram chats bound to this account (chat → remote run). */
  telegramBindings: TelegramBindingInfo[];
  /** Recent remote tasks handled on this device. */
  recent: { id: string; prompt: string; status: string; createdAt: string }[];
  /** Set when the last connection attempt failed (surfaced to the UI). */
  error?: string;
}

export interface AgentControls {
  status(): Promise<AgentClientStatus>;
  /** Turn remote-control on/off (connect/disconnect the command stream). */
  setEnabled(on: boolean): Promise<AgentClientStatus>;
  /** (Re)generate the LEGACY single webhook token (returns it once, in `webhookToken`). */
  regenerateToken(): Promise<AgentClientStatus>;
  /** Create a NAMED webhook token (per project). The raw token is in the returned `webhookToken`. */
  createToken(name: string): Promise<AgentClientStatus>;
  /** Refresh the list of named tokens (in `webhookTokens`). */
  listTokens(): Promise<AgentClientStatus>;
  /** Revoke one named token. */
  deleteToken(id: string): Promise<AgentClientStatus>;
  /** Test a token: is it usable + is a device online right now (nothing is run). */
  testToken(id: string): Promise<TokenTestResult>;
  /** Set/clear a token's outbound notify target; returns refreshed status. */
  updateTokenNotify(id: string, input: UpdateTokenNotifyInput): Promise<AgentClientStatus>;
  /** Mint a one-time Telegram bind code + deep link. */
  telegramLink(): Promise<TelegramLinkResponse>;
  /** Refresh the list of bound Telegram chats (in `telegramBindings`). */
  listTelegramBindings(): Promise<AgentClientStatus>;
  /** Unbind a Telegram chat. */
  deleteTelegramBinding(id: string): Promise<AgentClientStatus>;
  /** Subscribe to live status pushes (connection up/down, task started/finished). */
  onEvent(cb: (s: AgentClientStatus) => void): () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lark × Agents (desktop only)
//
// A self-built Lark CUSTOM APP (app_id + app_secret) is connected in the main
// process; its tenant_access_token grants Open API access. Claude (driven via the
// local CLI through an MCP bridge) answers questions about — and edits — Lark
// "server data" (Bitable/Base, messaging, docs, contacts). All of this is desktop
// only; the web runtime leaves every `lark*` method undefined and the UI guards
// with `runtime.larkConnect?`.
// ─────────────────────────────────────────────────────────────────────────────

/** State of the connected Lark custom app (no secrets ever cross this boundary). */
/** One Lark chat turn's input. */
/** Xem trước nội dung một tệp agent dựng (thẻ tệp trong hội thoại). Dựng ở main (lark/filePreview.ts). */
export interface LarkFilePreview {
  kind: 'xlsx' | 'csv' | 'docx' | 'pdf' | 'text';
  summary: string;
  sheets?: { name: string; rows: number; cols: number; head: string[][] }[];
  paragraphs?: number;
  pages?: number;
  head?: string[];
}

/** Thao tác người dùng bấm trên thẻ tệp (không qua agent). Main chốt đường dẫn trong thư mục hội thoại. */
export interface LarkFileActionInput {
  action: 'reveal' | 'saveAs' | 'drive' | 'sheet' | 'doc';
  path: string;
  /** drive/sheet/doc: thư mục Drive đích (token hoặc link …/drive/folder/<token>); bỏ trống = thư mục «Larkwave» trong "Không gian của tôi". */
  folder?: string;
}
export interface LarkFileActionResult {
  ok: boolean;
  error?: string;
  /** saveAs: nơi đã lưu (người dùng chọn). */
  savedTo?: string;
  /** drive/sheet/doc: liên kết mở trên Lark + token. */
  url?: string;
  token?: string;
  kind?: 'drive_file' | 'sheet' | 'docx';
  /** Đường đã dùng: phiên Lark web hay Open API (custom app). */
  via?: 'web' | 'openapi';
  /** Đọc lại sau khi tạo: tóm tắt thứ Lark đang có (sheet/dòng, tiêu đề tài liệu). */
  verified?: string;
}

export interface LarkChatInput {
  prompt: string;
  mode: LarkChatMode;
  /** Desktop CLI runner for this turn (default: session default or claude). */
  runner?: string;
  model?: string;
  /** True when user just switched runner — inject transcript carryover. */
  runnerSwitched?: boolean;
  /** The Bases applied to THIS conversation: the agent works across them and
   *  needn't ask which Base / paste the app_token. Chosen when the conversation
   *  starts (multi-select) and editable mid-chat. */
  activeBases?: LarkBaseRef[];
  /** Files/images attached to this turn for Claude to read + analyze (documents,
   *  screenshots). Written to a temp dir the agent reads via its Read tool. */
  attachments?: LarkAttachment[];
  /** 'general' = the GENERAL "Agents chat" (a capable ChatGPT/Claude-style assistant, NOT tied to
   *  Lark): no Lark connection required, general system prompt, and the CLI runs with its built-in
   *  tools in a private workspace. Omitted/undefined = a normal Lark turn (unchanged). */
  scope?: 'general';
  /** Agents-chat only: the caller-owned conversation id (kept separate from Lark's session state);
   *  `resume` continues that CLI session. Ignored for Lark turns. */
  sessionId?: string;
  resume?: boolean;
  /** (Cũ — trước khi hợp nhất.) Base của màn "Tạo workflow"; nay gộp vào `activeBases`. Vẫn nhận để
   *  relay/bản cũ gửi lên không mất Base. */
  workflow?: { base?: LarkBaseRef };
  /** Bố cục đang hiển thị hội thoại: 'chat' = Lark × Agents (khung Lark là ngăn phụ, mặc định đóng),
   *  'frame' = Tạo workflow (khung Lark lớn, hội thoại thu gọn bên trái). Cùng agent, cùng công cụ —
   *  chỉ đổi lời dặn "khung Lark ở đâu". */
  layout?: 'chat' | 'frame';
  /** 'relay' = this turn was initiated remotely (web/phone) and is driving THIS desktop. Surfaces
   *  as a `kind:'relay'` busy-lock so the desktop shows "đang chạy từ xa" + blocks concurrent sends. */
  source?: 'relay';
}

/** One file attached to a Lark chat turn (base64 bytes + display name). */
export interface LarkAttachment {
  name: string;
  /** Base64-encoded file bytes (no data: prefix). */
  dataBase64: string;
  /**
   * Kiểu tệp trình duyệt báo. Trước đây trường này không tồn tại, nên đường web dựng File không
   * kèm type → application/octet-stream → máy chủ từ chối ảnh, và ảnh đính kèm ở /claude chưa
   * bao giờ đến được model. Tuỳ chọn: bản desktop cũ không gửi vẫn chạy bình thường.
   */
  mime?: string;
}

export interface LarkConnection {
  connected: boolean;
  /** The connected app_id (safe to show); app_secret never leaves the main process. */
  appId?: string;
  /** Tenant display name, if resolved on connect. */
  tenantName?: string;
  /** Whether a usable local `claude` CLI was detected. */
  claudeAvailable?: boolean;
  /** Default Lark chat runner id (claude|grok|gemini|codex). */
  defaultRunner?: string;
  defaultModel?: string;
  /** Auto-approve write operations in Build mode (skip the per-tool confirm). */
  autoApprove?: boolean;
  /** Logged in with a PERSONAL Lark account (user_access_token) → full access as the user. */
  userLoggedIn?: boolean;
  /** Display name of the logged-in personal account, if resolved. */
  userName?: string;
  /**
   * Health of the connected app's credentials, set by `larkCheckConnection()` (a real
   * token re-mint). `true` = the app_secret still mints a tenant token; `false` = the
   * creds are stored but no longer valid (rotated/revoked/expired) → the UI shows a
   * "reconnect" prompt. `undefined` = not checked (the cheap `larkStatus()` never
   * touches the network). See also `userTokenExpired`.
   */
  tokenValid?: boolean;
  /** The personal-account session was present but its refresh token has expired → re-scan QR. */
  userTokenExpired?: boolean;
  /** Logged in, but the granted OAuth scopes lack `bitable:app` → Bitable reads/writes come
   *  back EMPTY with no error. The UI warns the user to enable+publish the scope then re-login. */
  userBitableScopeMissing?: boolean;
  /** Direct-API mode: run the AI via its HTTP API (no local CLI needed). */
  apiMode?: boolean;
  /** True when apiMode is on AND the default runner has a usable API key. */
  apiKeyReady?: boolean;
  /** Nguồn chạy agent Lark: 'cli' (CLI trên máy) | 'api' (khoá riêng) | 'maic' (gói Larkwave). */
  larkRunSource?: 'cli' | 'api' | 'maic';
  /** Máy chủ có cấu hình trợ lý hosted (MAIC) không — quyết định lựa chọn "gói Larkwave" có hiện. */
  maicAvailable?: boolean;
  /** Set when a connect/test attempt failed (surfaced to the UI). */
  error?: string;
}

/** EXPERIMENTAL Lark WEB session status (internal-API workflow reader). */
export interface LarkWebInfo {
  connected: boolean;
  host?: string;
  error?: string;
  /** The sniffed/pasted internal workflow endpoint path (undefined = not learned yet). */
  workflowEndpoint?: string;
}

/** Snapshot of the UI-automation recorder — captured Lark network requests + UI interactions from
 *  a hand-made workflow. `captured` = a valid workflow save request was seen and can be replayed. */
export interface LarkWebRecording {
  netCount: number;
  uiCount: number;
  captured: boolean;
  /** Field names present in the captured valid request body (draft/extra/nodeSchema/…). */
  capturedFields: string[];
  capturedBase: string;
  net: unknown[];
  ui: unknown[];
}

/** A rectangle in the renderer's CSS pixels (the "Trình duyệt Lark" view placeholder). */
export interface LarkBrowserRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One Lark automation/workflow WRITE request the CDP driver saw + what Lark answered. */
export interface LarkUiSave {
  at: number;
  path: string;
  method: string;
  /** create | update | save | publish | enable | disable | delete | … (from the path). */
  op: string;
  /** Lark answered code 0. */
  ok: boolean;
  code?: number;
  msg?: string;
  workflowID?: string;
  /** `status` the request carried (0 = draft/disabled, 1 = enabled). */
  status?: number;
  baseId?: string;
  error?: string;
}

/** Live state of the "Trình duyệt Lark" screen (the embedded Lark web view + AI driver). */
export interface LarkBrowserState {
  connected: boolean;
  /** From the session health probe: alive | dead (hết phiên) | unknown. */
  health: 'alive' | 'dead' | 'unknown';
  host?: string;
  /** A Lark page exists (logged in or logging in). */
  hasWindow: boolean;
  /** A visible login (QR/SSO) is waiting for the user. */
  loginPending: boolean;
  /** The page is currently shown inside the app window. */
  embedded: boolean;
  url?: string;
  title?: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  driver: 'cdp' | 'legacy' | 'none';
  /** LARKWAVE_HIDDEN=1 dev mode (no window is ever shown). */
  hidden?: boolean;
  ai: {
    active: boolean;
    stopped: boolean;
    step?: string;
    actions: number;
    cap: number;
    startedAt?: number;
    lastAt?: number;
    saves: LarkUiSave[];
  };
  /** The latest VALID automation save captured (can be saved as a template). */
  capturedSave?: { endpoint: string; base: string; title?: string; fields: string[] };
}

/** Một Base thấy được qua phiên Lark web (Drive hoặc trong Wiki). `token` = app_token thật. */
export interface LarkWebBase {
  token: string;
  name: string;
  url: string;
  isWiki: boolean;
  wikiToken?: string;
  /** Giây epoch. */
  editTime?: number;
  openTime?: number;
  wikiSpace?: string;
}

export interface LarkUiTemplateVar {
  key: string;
  kind: 'table' | 'field' | 'view' | 'option' | 'user' | 'chat' | 'department';
  original: string;
  table?: string;
  hint?: string;
}

/** "Làm mẫu một lần → dùng lại": a hand-made Lark automation/workflow turned into a template. */
export interface LarkUiTemplate {
  id: string;
  name: string;
  description?: string;
  kind: 'automation' | 'workflow';
  createdAt: string;
  sourceBase: string;
  endpoint: string;
  vars: LarkUiTemplateVar[];
  fields: string[];
  triggerName?: string;
  source?: string;
  bizType?: string;
  title?: string;
}

export interface LarkUiTemplateApplyResult {
  ok: boolean;
  workflowID?: string;
  baseId: string;
  /** Always 0 — a template only ever creates a DISABLED draft. */
  status?: number;
  code?: number;
  title?: string;
  /** Variables that must be given (target base differs from the recorded one). */
  missing?: string[];
  error?: string;
}

/** One Lark web re-login attempt — shown as an audit "lịch sử đăng nhập lại" in the CMS screen. */
export interface LarkReloginEntry {
  /** ISO timestamp. */
  at: string;
  /** local = the desktop "Đăng nhập lại Lark web" button; remote = phone QR handoff. */
  source: 'local' | 'remote';
  outcome: 'success' | 'failed' | 'timeout';
  host?: string;
}

/**
 * A remembered Lark custom app (connection history). The desktop stores each app the
 * user has connected — encrypted (app_secret) — so they can switch between multiple
 * Lark workspaces/apps without re-pasting credentials. `app_secret` never leaves the
 * main process (not part of this shape).
 */
export interface LarkAppRef {
  appId: string;
  /** User-given label to recognise it by (defaults to the tenant/org name). */
  name?: string;
  /** Resolved tenant/org display name, if available. */
  tenantName?: string;
  /** ISO timestamp this app was last connected/used. */
  lastUsedAt?: string;
  /** True for the app that is currently connected. */
  active?: boolean;
}

// ── Tự động hoá (Larkwave) — a rule engine that works AROUND Lark's missing
// "create automation" API: poll a Base table, and when a record matches the
// condition, run an action (send message / update record / call webhook). ─────
export interface LarkAutoCondition {
  /** Column display name to test. */
  field: string;
  op: 'is' | 'isNot' | 'contains' | 'doesNotContain' | 'isEmpty' | 'isNotEmpty' | 'isGreater' | 'isLess';
  /** Compared value (omit for isEmpty/isNotEmpty). */
  value?: string;
}
export type LarkAutoAction =
  | { type: 'send_message'; receiveIdType: 'chat_id' | 'open_id' | 'user_id' | 'email'; receiveId: string; text: string }
  | { type: 'update_record'; field: string; value: string }
  | { type: 'webhook'; url: string }
  /** Run a saved Lark-agent prompt (e.g. a recurring reconciliation like "PBTTCN") on the
   *  schedule, then deliver the report: post to a Lark chat, save to a conversation, notify. */
  | {
      type: 'run_agent';
      prompt: string;
      postToChatId?: string;
      saveConversation?: boolean;
      notify?: boolean;
      /**
       * Chế độ chạy của lịch. MẶC ĐỊNH 'build' (thực thi, được ghi dữ liệu).
       *
       * Trước đây lượt chạy theo lịch bị ghim cứng ở 'ask' (chỉ đọc), nên một lịch kiểu "mỗi ngày
       * 9h đối chiếu rồi ghi vào bảng 4.1.3" chạy xong chỉ trả về một câu giải thích rằng nó
       * không có quyền tạo bản ghi — đúng thứ người dùng đặt lịch để khỏi phải tự làm.
       *
       * 'ask' vẫn giữ cho lịch chỉ báo cáo: đọc số liệu rồi gửi tin nhắn, không đụng vào dữ liệu.
       */
      mode?: 'ask' | 'build';
    }
  /**
   * Chạy một BỘ KỸ NĂNG có hợp đồng, thay vì một prompt trần.
   *
   * Khác `run_agent` ở chỗ quan trọng nhất: `run_agent` là một ô văn bản và MỘT lượt chạy — người
   * dùng phải nhét cả bảy việc vào một đoạn mô tả rồi hy vọng mô hình làm đúng thứ tự, và không có
   * khoá nào nên không có gì để kiểm chéo. Ở đây thứ tự tự suy ra từ `needs`/`produces`, mỗi bước
   * có ràng buộc, gãy thì chạy lại, và ràng buộc còn gãy đến cuối thì `rowsToWrite()` KHÔNG ghi
   * dòng nào.
   */
  | {
      type: 'run_skill_set';
      /**
       * Một kỹ năng BẤT KỲ trong bộ. Cả bộ được suy ra bằng `relatedSet()` — theo quan hệ dữ liệu
       * thật, không phải theo một danh sách khai tay. Danh sách khai tay sẽ lệch với quan hệ dữ
       * liệu ngay lần sửa kỹ năng đầu tiên, và lúc đó thứ chạy sai là thứ không ai nhìn.
       */
      skillId: string;
      /**
       * TÊN CỘT trong bảng → tên khoá trong hợp đồng. Dòng vừa kích hoạt được đổ vào `seedFacts`
       * qua bảng này.
       *
       * Bỏ trống = không lấy gì từ dòng đó (hợp với lịch chạy theo giờ không cần dữ liệu đầu vào).
       */
      seedFrom?: Record<string, string>;
      /**
       * Ghi kết quả về đâu. `target` = dùng `target:` khai trong SKILL.md (bảng riêng);
       * `record` = cập nhật lại CHÍNH dòng đã kích hoạt; `none` = chỉ báo cáo, không ghi.
       * Mặc định `target`.
       */
      writeBack?: 'target' | 'record' | 'none';
      /** Khoá trong hợp đồng → TÊN CỘT, dùng khi `writeBack: 'record'`. */
      writeMap?: Record<string, string>;
      postToChatId?: string;
      notify?: boolean;
    };

/** Một lần chạy đã ghi lại của quy tắc tự động hoá (lịch sử thực thi). */
export interface LarkAutomationRun {
  /** Thời điểm bắt đầu (ISO). */
  at: string;
  /** Chạy hết bao lâu, mili giây. */
  ms: number;
  ok: boolean;
  /** Chế độ đã chạy — để đọc lịch sử biết lần đó có được ghi hay không. */
  mode?: 'ask' | 'build';
  /** Số lời gọi công cụ trong lượt đó. */
  tools?: number;
  /** Trong đó bao nhiêu lời gọi GHI dữ liệu — con số người dùng cần nhất khi rà lại. */
  writes?: number;
  /** Vài dòng đầu của kết quả, hoặc câu lỗi. */
  summary?: string;
}
/** Time schedule for a triggerType==='schedule' rule (fires without a Base record). */
export interface LarkAutoSchedule {
  /** interval = every `intervalSec` seconds; daily = at atHour:atMinute on activeDays. */
  mode: 'interval' | 'daily';
  /** daily: hour 0-23. */
  atHour?: number;
  /** daily: minute 0-59. */
  atMinute?: number;
  /** daily: weekdays 0(CN)-6(T7) it fires; empty/undefined = every day. */
  days?: number[];
}
/** Fields the user edits when creating/updating a rule. */
export interface LarkAutomationInput {
  id?: string;
  name: string;
  enabled: boolean;
  appToken: string;
  tableId: string;
  /** undefined = fire for every record that appears in the table. */
  condition?: LarkAutoCondition;
  action: LarkAutoAction;
  /** Poll interval in seconds (min 30). */
  intervalSec: number;
  /** true = also act on records that ALREADY match now; false (default) = only records
   *  that match AFTER the rule is created (existing matches are recorded as a baseline). */
  fireExisting?: boolean;
  /** 'record' (default) = poll a Base table; 'schedule' = fire the action on a TIME schedule
   *  with no record context (e.g. đăng 1 nội dung cố định vào group mỗi ngày 9h). */
  triggerType?: 'record' | 'schedule';
  /** Time schedule config (used when triggerType==='schedule'). */
  schedule?: LarkAutoSchedule;
}
/** A persisted rule (input + engine runtime state, read-only in the UI). */
export interface LarkAutomation extends LarkAutomationInput {
  id: string;
  /** Baseline done (existing matches recorded so only NEW matches fire). */
  seeded?: boolean;
  lastRunAt?: string;
  lastError?: string;
  runCount?: number;
  createdAt?: string;
  /** Lịch sử vài lần chạy gần nhất (mới nhất ở CUỐI). Cắt bớt ở tầng lưu. */
  runs?: LarkAutomationRun[];
}
/**
 * Những lời hỏi ĐANG CHỜ của một hội thoại — để giao diện dựng lại sau khi rời đi rồi quay vào.
 *
 * Tiến trình chính vẫn đang chờ đúng như cũ; thứ mất đi là cái HỘP hỏi trong renderer. Không có
 * đường này thì thao tác treo ở "cần xác nhận" mà không còn chỗ nào bấm, rồi 10 phút sau bị từ chối.
 */
export interface LarkPendingPrompts {
  confirms: { callId: string; name: string; input: unknown }[];
  asks: { callId: string; question: string; choices?: string[] }[];
}

/** Result of running a rule once (manual "test" or a scheduled tick). */
export interface LarkAutomationRunResult {
  matched: number;
  fired: number;
  error?: string;
}
/** A table in a Base (for the automation form's table picker). */
export interface LarkTableRef {
  tableId: string;
  name: string;
}

/** Result of publishing a Lark conversation — the public link to share. */
export interface LarkShareInfo {
  /** Public share id (slug in the URL). */
  id: string;
  /** Full public URL, e.g. https://toolswave.net/lark/s/<id>. */
  url: string;
}

/**
 * A Lark Base (Bitable) the user has registered for Claude to work with. There is
 * no "list apps" Open API endpoint, so app_tokens are supplied by the user (pasted
 * token or Base URL) and remembered here.
 */
export interface LarkBaseRef {
  appToken: string;
  name: string;
  /** Optional user note on what this Base holds / is used for — shown in the panel and
   *  fed to the agent so it understands the data without being told each time. */
  description?: string;
}

/** A Base's structure + a few sample rows (bounded read-only snapshot). */
export interface LarkSnapshotField {
  name: string;
  type: string; // readable kind, e.g. "Văn bản" | "Số" | "Ngày giờ"
}
export interface LarkSnapshotTable {
  tableName: string;
  fields: LarkSnapshotField[];
  /** Simplified sample rows ({ columnName: value }) — bounded. */
  sample: Record<string, unknown>[];
}
export interface LarkBaseSnapshot {
  appToken: string;
  baseName: string;
  tables: LarkSnapshotTable[];
}

/**
 * Chat mode for the Lark assistant:
 *  - 'ask'   → read-only Q&A (Sonnet, only read tools exposed)
 *  - 'build' → full tool loop incl. gated writes (Opus, confirmation-gated)
 */
export type LarkChatMode = 'ask' | 'build';

/** Metadata for a saved Lark chat conversation (history list). */
export interface LarkSessionMeta {
  id: string;
  title: string;
  updatedAt: string;
  /** The Bases applied to this conversation (the agent works across them). */
  bases?: LarkBaseRef[];
  runner?: string;
  model?: string;
  /** Unfinished todos in this conversation's notes — drives the sidebar badge. */
  openTodos?: number;
  /** (Cũ) 'workflow' = hội thoại tạo ra ở màn "Tạo workflow" trước khi hợp nhất. Nay mọi hội thoại chung
   *  một danh sách; trường này chỉ còn là gợi ý bố cục mở mặc định (xem larkConversations.ts). */
  kind?: 'workflow';
  /** True for the CURRENTLY-active session — lets a client (incl. the web over the relay) adopt
   *  the shared active conversation instead of blindly opening the most-recent one. */
  active?: boolean;
}

/** Who currently holds the shared AI turn-lock, mirrored to every tab. */
export interface AgentBusyOwner {
  kind: 'lark' | 'relay';
  /** Lark conversation id (lark turns). */
  sessionId?: string;
  /** Human label for the blocked-tab banner. */
  label?: string;
  startedAt: number;
}

/** One note or todo attached to a Lark conversation. */
export interface LarkNote {
  id: string;
  text: string;
  /** Explicit discriminator — a note is either a todo or a plain note. */
  todo: boolean;
  /** Always present; meaningless when `todo` is false. */
  done: boolean;
  createdAt: string;
  updatedAt?: string;
  /** Set when `done` flips true, cleared on un-done. Orders the done section. */
  doneAt?: string;
  /** Chat-item id this note was captured from — click to jump back to it. */
  srcId?: string;
  /** Frozen excerpt of the source message, so the chip stays readable even if
   *  that message is later edited or re-asked. */
  srcExcerpt?: string;
}

/**
 * The OWNER-side scope of one delegated grant. Lives only on the owner's disk — the
 * server stores base NAMES for display, never these app_tokens, so a compromised server
 * can request a turn but cannot widen what it may touch.
 */
export interface LarkGrantPolicy {
  /** Base app_tokens this grant may reach. */
  appTokens: string[];
  mode: 'ask' | 'build';
  /**
   * Quyền GHI theo TỪNG Base: `{ [app_token]: true }`.
   *
   * Vì sao theo từng Base chứ không phải một cờ chung: chia sẻ thật gần như luôn là "được sửa
   * bảng Đơn hàng, chỉ được đọc bảng Nhân sự". Một cờ chung buộc người ta chọn giữa mở hết hoặc
   * không mở gì, và thực tế họ sẽ mở hết.
   *
   * Vắng mặt hoặc false = CHỈ ĐỌC. Mặc định đóng: một chính sách cũ (chưa có trường này) phải
   * tiếp tục là chỉ-đọc chứ không được tự nhiên có quyền ghi sau khi cập nhật app.
   */
  writeTokens?: Record<string, boolean>;
  /** Run write tools without the owner present. Off by default. */
  autoApproveWrites?: boolean;
  revoked?: boolean;
  label?: string;
}

/** The notes document for one conversation. Versioned so a later build can migrate
 *  notes independently of the conversation items. */
export interface LarkNoteDoc {
  v: 1;
  notes: LarkNote[];
  updatedAt: string;
}

// ── Đặc tả hệ thống (living Lark system specification) ────────────────────────
/**
 * Trust status of one spec entity, derived from freshness — NEVER invented:
 *  - 'verified'   → re-fetched live from Lark this recently (its `source.fetchedAt` is fresh)
 *  - 'stale'      → last fetched long enough ago that it may have drifted
 *  - 'unverified' → surfaced only from conversation prose / a workflow whose logic couldn't be
 *                   read (Lark web not connected), so it was never confirmed against live data
 */
export type SpecStatus = 'verified' | 'stale' | 'unverified';

/** Where one spec entity came from — the integrity anchor. Every entity carries one so the UI
 *  can show "đọc lúc … từ bitable_base_overview" and jump back to the conversation. */
export interface SpecSource {
  /** The Lark tool that produced it (e.g. 'bitable_base_overview', 'bitable_read_workflows'),
   *  or 'conversation' for a user-promoted insight. */
  tool: string;
  /** ISO time the live data was fetched (drives verified/stale). */
  fetchedAt: string;
  /** Conversation that surfaced it — click to jump back. Set for promoted insights. */
  sessionId?: string;
  itemId?: string;
}

export interface SpecField {
  fieldId: string;
  name: string;
  /** Numeric Lark field type. */
  type?: number;
  /** Readable ui_type ('Text' | 'SingleSelect' | …) — makes single vs multi explicit. */
  uiType?: string;
  optionsCount?: number;
  optionsSample?: string[];
  status: SpecStatus;
  source: SpecSource;
  /** Soft-removed: vanished from a FULLY re-fetched Base. Rendered struck-through, never deleted. */
  removed?: boolean;
}

export interface SpecTable {
  tableId: string;
  name: string;
  recordCount?: number;
  fields: SpecField[];
  status: SpecStatus;
  source: SpecSource;
  removed?: boolean;
}

export interface SpecBase {
  appToken: string;
  name: string;
  tables: SpecTable[];
  status: SpecStatus;
  source: SpecSource;
  removed?: boolean;
}

export interface SpecWorkflow {
  workflowId: string;
  /** The Base this automation lives in. */
  appToken: string;
  name: string;
  /** 'đang bật' | 'đang tắt' | ''. */
  statusText?: string;
  /** The verbatim •/┗/↳ logic tree (2-space indent per depth), exactly as the tool renders it. */
  logicTree?: string;
  /** true when the trigger/condition/action logic couldn't be read (Lark web not connected). */
  logicMissing?: boolean;
  status: SpecStatus;
  source: SpecSource;
  removed?: boolean;
}

/** An inferred link/lookup between two tables (from a field of type link(18)/lookup(19)). */
export interface SpecRelation {
  fromTableId: string;
  toTableId: string;
  viaFieldId?: string;
  viaFieldName?: string;
  kind: 'link' | 'lookup';
  /** Always true for M1 — relations are inferred from field types, not declared by Lark. */
  inferred: boolean;
}

/** An AI-distilled or user-promoted insight (guide/rule/purpose). NON-load-bearing: it is
 *  surfaced as context but never used as a source of structural truth. */
export interface SpecInsight {
  id: string;
  kind: 'guide' | 'rule' | 'purpose' | 'note';
  text: string;
  /** The base/table this insight is about (for grouping), if any. */
  entityKey?: string;
  /** Stable dedup key (kind + normalized text) so re-syncing never duplicates it. */
  hash: string;
  source: SpecSource;
  dismissed?: boolean;
  createdAt: string;
}

/** One entry in the sync history — the visible payoff of a "Đồng bộ" run. */
export interface SpecSyncEntry {
  at: string;
  added: number;
  changed: number;
  removed: number;
  basesFetched: number;
  basesFailed: number;
}

/** User-owned prose describing the system (grafted into, never overwritten by, sync). */
export interface SpecOverview {
  text: string;
  updatedAt: string;
}

/**
 * The living specification of a user's Lark workspace — a digital twin built by RE-FETCHING
 * live structured data (bitable_base_overview + bitable_read_workflows) and merging by real
 * Lark id, never scraped from the chat transcript. Per-account, versioned, cross-device via
 * the existing opaque backup blob.
 */
export interface LarkSpecDoc {
  v: 1;
  updatedAt: string;
  overview: SpecOverview;
  bases: SpecBase[];
  workflows: SpecWorkflow[];
  relations: SpecRelation[];
  insights: SpecInsight[];
  /** Newest-first sync history. */
  syncLog: SpecSyncEntry[];
}

/** Input to promote one conversation finding into the spec (a low-friction alternative to a
 *  full re-sync). */
export interface SpecPromoteInput {
  sessionId: string;
  itemId?: string;
  kind: SpecInsight['kind'];
  text: string;
  entityKey?: string;
}

/** Result of a "Đồng bộ đặc tả" run — the merged doc + what changed. */
export interface SpecBuildResult {
  doc: LarkSpecDoc;
  diff: SpecSyncEntry;
  /** Bases that failed to re-fetch this run (so the UI can warn + explain skipped soft-removes). */
  failedBases: { appToken: string; name: string; error: string }[];
}

// ── CMS Bitable sync (connector session kept fresh by the desktop) ────────────
/** One Bitable-sync job on the cms-lark-sync backend. Loosely typed — the backend owns the
 *  schema; the desktop only needs a few fields to list + refresh the session. */
export interface CmsSyncJob {
  _id?: string;
  id?: string;
  name: string;
  syncMode?: 'read_only' | 'mirror' | 'connector';
  appToken?: string;
  tableId?: string;
  enabled?: boolean;
  connector?: {
    domain?: string;
    docToken?: string;
    tableIds?: string[];
    cookies?: string;
    csrfToken?: string;
    hostId?: string;
    hostType?: string;
  };
  intervalSeconds?: number;
  /** Auto-schedule (mirrors the cms-lark-sync backend). */
  ignoreSchedule?: boolean;
  schedule?: { activeHoursStart?: number; activeHoursEnd?: number; activeDays?: number[]; timezone?: string };
  description?: string;
  /** Per-job error report: on THIS job erroring, send an error card to a Lark bot webhook and/or a chat. */
  errorNotify?: { enabled?: boolean; larkWebhookUrl?: string; chatId?: string };
  lastSyncAt?: string | null;
  lastRunAt?: string;
  lastStatus?: string;
  lastError?: string;
  /** Result of the last sync run (mirrors the cms-lark-sync backend). */
  lastSyncStatus?: 'success' | 'error' | 'pending' | string;
  lastSyncError?: string;
  lastSyncStats?: { total?: number; added?: number; updated?: number; deleted?: number };
  [k: string]: unknown;
}

/** Editable config for a connector job — sent as a partial to PUT /bitable-sync/:id. */
export interface CmsSyncJobPatch {
  name?: string;
  description?: string;
  intervalSeconds?: number;
  enabled?: boolean;
  ignoreSchedule?: boolean;
  schedule?: { activeHoursStart?: number; activeHoursEnd?: number; activeDays?: number[]; timezone?: string };
  /** Per-job error-report target (Lark webhook and/or chat). */
  errorNotify?: { enabled?: boolean; larkWebhookUrl?: string; chatId?: string };
}

/** Aggregate ("tổng") error report: any CMS sync job that errors → a Lark webhook and/or chat. */
export interface CmsSyncErrorReport {
  enabled: boolean;
  larkWebhookUrl: string;
  /** chat_id of a Lark group the bot is in (send via Open API, no webhook needed). */
  chatId: string;
}

/** A Lark group the bot is a member of — for the error-report "chọn nhóm" dropdown. */
export interface CmsSyncLarkChat {
  chatId: string;
  name: string;
}

/** Liveness of the external VM session-keeper (tw-cms-keeper), read from the CMS
 *  backend. Lets the desktop show "máy VM đang giữ phiên" without SSH. */
export interface CmsKeeperStatus {
  /** false when no heartbeat has ever been received. */
  present?: boolean;
  /** true when a heartbeat arrived recently (backend threshold ~3 min). */
  online?: boolean;
  /** seconds since the last heartbeat (null when none). */
  ageSec?: number | null;
  /** whether the keeper's Lark web session is signed in. */
  loggedIn?: boolean;
  /** 'ok' | 'need_relogin' | 'error' | 'starting' … */
  state?: string;
  host?: string;
  /** live QR page to scan when the session expired (null when healthy). */
  reloginUrl?: string | null;
  lastRefresh?: { total: number; refreshed: number; reenabled: number; failed: number } | null;
  /** ISO time the keeper generated this heartbeat / the backend received it. */
  at?: string;
  receivedAt?: string;
  note?: string;
}

export interface CmsSyncRefreshResult {
  total: number;
  refreshed: number;
  /** How many jobs the backend had auto-disabled on session expiry were flipped back on. */
  reenabled?: number;
  failed: number;
  errors: string[];
}

/**
 * One streamed event from a Lark chat turn (the desktop agent loop → UI). A
 * `tool_call` with `gated: true` pauses the loop until the renderer answers with
 * `larkConfirmTool(callId, …)`.
 */
export type LarkChatEvent =
  | { type: 'text'; delta: string }
  /**
   * Agent vừa DỰNG XONG một tệp cho người dùng (create_file).
   *
   * Là sự kiện riêng chứ không gộp vào `tool_result`: `tool_result` chỉ mang một dòng tóm tắt
   * bằng chữ, mà thứ cần ở đây là một thẻ BẤM ĐƯỢC để mở tệp. Nhét đường dẫn vào câu tóm tắt rồi
   * bắt giao diện dò lại bằng biểu thức chính quy là dựng một hợp đồng ngầm giữa hai tầng — hỏng
   * lặng lẽ ngay lần đầu ai đó sửa câu chữ.
   */
  | {
      type: 'file';
      name: string;
      path: string;
      mime: string;
      bytes: number;
      /** Bản sao trên máy chủ tài khoản. Có thì tệp mở lại được ở MÁY KHÁC — tệp đi theo
       *  tài khoản đúng như hội thoại, thay vì nằm chết trên máy vừa tạo ra nó. */
      uploadId?: string;
      /** Xem trước thật của nội dung (sheet/dòng/cột/vài dòng đầu, đoạn đầu, số trang) — main dựng. */
      preview?: LarkFilePreview;
    }
  | {
      type: 'tool_call';
      callId: string;
      name: string;
      input: unknown;
      gated: boolean;
      /** Bản dễ đọc cho hộp xác nhận (vd `{ fieldNames: { fld…: 'Tên cột' } }`) — chỉ để hiển thị. */
      preview?: unknown;
    }
  /**
   * `suspectAppBug`: thất bại này ĐÁNG NGỜ là do ỨNG DỤNG hỏng (công cụ không tồn tại, lỗi cấp
   * ngôn ngữ) chứ không phải Lark từ chối / mạng / giới hạn sản phẩm. Phân loại làm ở main; UI
   * KHÔNG được đoán lại, vì đoán lại là có hai bộ luật rồi trôi khác nhau.
   */
  | {
      type: 'tool_result';
      callId: string;
      ok: boolean;
      summary?: string;
      /**
       * Bản tóm KẾT QUẢ để làm trí nhớ (id, số lượng, liên kết, tên) — không hiển thị. Lưu cùng thẻ
       * công cụ trong lịch sử, để khi phải nối lại hội thoại bằng chữ (runner không có --resume,
       * phiên CLI đã mất) model vẫn biết công cụ đã trả về gì, không chỉ đã được gọi với gì.
       */
      memo?: string;
      error?: string;
      suspectAppBug?: boolean;
      /**
       * Tầng của thất bại — quyết định giao diện hiện đỏ, hiện xám, hay im. Tính ở MAIN
       * (larkToolExec.tierForPayload/tierForError); UI không đoán lại.
       */
      tier?: 'error' | 'blocked' | 'noise';
    }
  | { type: 'tool_denied'; callId: string }
  /**
   * Claude is asking the user for help/clarification (e.g. which Base, a missing id, a
   * decision). The agent loop is PAUSED until the renderer answers with
   * `larkAnswerAsk(callId, answer)` — same blocking machinery as a gated tool confirm.
   */
  | { type: 'ask_user'; callId: string; question: string; choices?: string[] }
  /**
   * Context-window telemetry for THIS turn (the resumed conversation's input size vs the
   * model's window). The renderer warns + offers a fresh session when percentUsed is high.
   */
  | {
      type: 'usage';
      contextTokens: number;
      windowTokens: number;
      percentUsed: number;
      /**
       * Id model THẬT mà CLI đã dùng, vd `claude-opus-5-5`.
       *
       * Người dùng chọn BÍ DANH (`opus`), còn bí danh trỏ tới bản nào thì tuỳ phiên bản CLI
       * trên máy. Không hiện id thật ra thì không ai biết mình đang chạy đời nào — chính tôi
       * đã kết luận nhầm "không có Opus 5.5" vì CLI của mình cũ.
       */
      model?: string;
    }
  /**
   * Tệp DO TRỢ LÝ TẠO RA trong lượt này (hợp đồng .xlsx, báo cáo .pdf…), đã lưu lại để tải về.
   * Trước đây lượt chạy được yêu cầu `returnFiles: 'none'`, nên mọi tệp agent viết ra đều bị vứt
   * cùng workspace — người dùng chỉ nhận được chữ mô tả một tệp không tồn tại.
   */
  | { type: 'files'; files: { uploadId: string; name: string; size: number; mime: string }[] }
  | { type: 'error'; message: string }
  | { type: 'done' };

/**
 * A curated plugin installed in the desktop app. A plugin is pure DATA — a
 * manifest that declares Lark tools bound to permission-scoped Open API
 * endpoints. It contains no executable code, so enabling one can never run
 * arbitrary code; it only lets Claude call the declared, allow-listed endpoints.
 */
export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  /** True when the manifest signature verified against a trusted publisher key. */
  signed: boolean;
  author?: string;
  description?: string;
  /** Granted permission scopes (e.g. 'lark:bitable', 'lark:approval'). */
  permissions?: string[];
  /** Number of Lark tools the plugin contributes. */
  toolCount?: number;
}

/** A user skill (SKILL.md folder) the local CLIs can use in builds + Lark chat. */
/** Một bộ kỹ năng: các kỹ năng nối với nhau qua needs/produces/checks. */
export interface LarkSkillSet {
  /** Kỹ năng đại diện — dùng để gọi chạy cả bộ. */
  id: string;
  name: string;
  members: string[];
  /** Vấn đề phát hiện được TRƯỚC khi chạy (thiếu khoá không ai sinh ra…). */
  issues: string[];
  /** Tên bảng đích nếu đây là bộ "đọc tệp rồi ghi vào bảng". Rỗng = bộ thường. */
  target?: string;
  /** Vài lượt chạy gần nhất, MỚI NHẤT Ở ĐẦU. Xem `SkillSetRun`. */
  runs?: SkillSetRun[];
  /**
   * Nhãn mà MỌI thành viên của bộ cùng mang — dùng để GOM NHÓM KHI HIỂN THỊ.
   *
   * Quan trọng: đây thuần tuý là chuyện trình bày. Thứ quyết định "chạy cùng nhau" vẫn là quan hệ
   * dữ liệu (`relatedSet`), không phải nhãn — xem chú thích ở `relatedSet` về lý do cố ý không cho
   * khai nhóm bằng tay. Nhãn chỉ giúp xếp mấy chục bộ vào vài ngăn cho dễ nhìn.
   */
  tags?: string[];
  /** Khoá cả bộ sinh ra — hiện ngay trên dòng để biết bộ này cho ra cái gì mà không phải mở ra. */
  produces?: string[];
  /**
   * Tiền tố khoá chung — `tt_`, `kc2_`, `sw_`. Đây là thứ tách các bộ với nhau RÕ HƠN NHÃN.
   *
   * Đo trên dữ liệu thật: ba bộ khác hẳn nhau đều mang cùng nhãn `Lark` + `Kiểm chéo`, nên gom theo
   * nhãn là nhét chúng chung một chỗ. Khoá thì không nhầm được — nó là thứ nối kỹ năng với nhau.
   * Rỗng = các khoá không có tiền tố chung.
   */
  ns?: string;
  /**
   * Từng thành viên kèm khoá, THEO THỨ TỰ SẼ CHẠY.
   *
   * `members` chỉ có tên nên giao diện không vẽ được chuỗi, không biết bước nào bị ép thứ tự, và
   * không tính được khoá nào đang treo. Giữ `members` cho chỗ gọi cũ.
   */
  nodes?: {
    id: string;
    name: string;
    needs: string[];
    produces: string[];
    /** Ràng buộc kỹ năng này khai (nguyên văn). */
    checks: string[];
    /** Đang bật không. Tắt ⇒ không tham gia lượt chạy, nhưng vẫn hiện trong danh sách. */
    enabled: boolean;
    /**
     * Tên các kỹ năng sinh ra khoá mà bước này cần — rỗng nghĩa là nó chạy được ngay từ đầu.
     * Có giá trị ⇒ thứ tự của nó bị DỮ LIỆU ép, kéo thả không đổi được.
     */
    after: string[];
  }[];
}

/**
 * Một lượt chạy bộ kỹ năng đã ghi lại.
 *
 * Vì sao cần: kết quả một lượt chạy trước đây chỉ sống trong state của thẻ — tải lại trang là mất.
 * Mà đây là tính năng KIỂM CHÉO: giá trị của nó nằm ở chỗ so được lượt này với lượt trước
 * ("hôm qua sạch, hôm nay gãy hai ràng buộc"). Không lưu thì mỗi lượt là một ảnh chụp rời rạc, và
 * người dùng không có cách nào thấy được xu hướng.
 */
export interface SkillSetRun {
  /** Thời điểm bắt đầu (ISO). */
  at: string;
  ms: number;
  /** 'ask' = chạy thử (không ghi), 'build' = chạy thật. */
  mode: 'ask' | 'build';
  /** Tên kỹ năng đã chạy, THEO ĐÚNG thứ tự thực tế — thứ tự này đổi giữa các lượt là bình thường. */
  ran: string[];
  /**
   * Diễn biến TỪNG BƯỚC — đây mới là phần đáng đọc của một lượt kiểm chéo.
   *
   * `ran` chỉ nói ai chạy và theo thứ tự nào. Thứ người dùng cần khi rà lại là: bước nào sinh ra
   * khoá gì, và bước nào làm GÃY ràng buộc của bước khác rồi bị bắt chạy lại. Không có cột đó thì
   * "thứ tự lượt này khác lượt trước" trông như ngẫu nhiên, trong khi nó luôn có nguyên nhân.
   */
  steps: {
    name: string;
    /** >1 nghĩa là bước này đã bị bắt chạy lại vì làm gãy ràng buộc. */
    attempt: number;
    /** Khoá bước này sinh ra. */
    produced: string[];
    /** Ràng buộc mà LƯỢT NÀY của bước làm gãy — chính là cái kích hoạt chạy lại. */
    broke: string[];
    /** Bỏ qua vì khoá đã có sẵn trong dữ liệu đầu vào. */
    skipped?: boolean;
    /** Lý do lượt này hỏng (hết giờ, mất mạng…). Có giá trị ⇒ bước không ra khoá VÌ LÝ DO NÀY,
     *  chứ không phải vì kỹ năng "chạy xong mà không tính ra gì". Hai chuyện khác hẳn nhau. */
    failed?: string;
  }[];
  /** Ràng buộc còn SAI khi dừng. Rỗng = sạch. */
  failing: string[];
  /** Kỹ năng không chạy được vì thiếu khoá. */
  blocked: string[];
  /** Số dòng đã ghi vào bảng, nếu là lượt trích-xuất-ghi-bảng. */
  wrote?: number;
}

/** Kết quả một lượt chạy bộ kỹ năng. */
export interface LarkSkillRunResult {
  facts: Record<string, string | number | boolean | null>;
  checks: { raw: string; owner: string; verdict: 'pass' | 'fail' | 'unknown'; reason: string }[];
  ran: string[];
  blocked: { name: string; missing: string[]; nobodyProduces: string[] }[];
}

/** Kết quả trích xuất một tệp. `failing` rỗng = dòng sạch. */
export interface LarkExtractRow {
  file: string;
  facts: Record<string, string | number | boolean | null>;
  failing: string[];
  blocked: string[];
}

export interface LarkExtractResult {
  rows: LarkExtractRow[];
  /** Số dòng SẠCH. Dòng có ràng buộc sai KHÔNG bao giờ được ghi. */
  wouldWrite: number;
  written: number;
  table: string;
  base: string;
}

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  /** Enabled = synced into the scoped CLIs' skill dirs; disabled = kept in the library only. */
  enabled: boolean;
  /** Which CLI runners this skill applies to (ids: 'claude'|'grok'|'gemini'|'codex').
   *  All four = "shared". Claude/Grok/Gemini get the SKILL.md folder; Codex gets a managed
   *  block in ~/.codex/AGENTS.md. Defaults to all on legacy/migrated skills. */
  scope: string[];
  /** Free-form labels the user assigns to categorize/filter skills (e.g. "Làm app",
   *  "Lark", "Bảo mật"). Purely organizational — does NOT affect where the skill is
   *  synced. Empty/undefined = untagged. */
  tags?: string[];
  /** Where it was imported from (folder path), if any. */
  source?: string;
  /** How many reference files are attached to this skill (server-side skills only). */
  attachmentCount?: number;
  /**
   * Optional slash-command shortcut, stored WITHOUT the leading "/" (e.g. `sieu-ba` → the user
   * types `/sieu-ba`). Typing "/" in a chat composer lists these; picking one forces the skill
   * for that turn, even if the skill is disabled. '' / undefined = no shortcut.
   */
  command?: string;
  /**
   * Hợp đồng kỹ năng, nếu có khai. Danh sách kỹ năng cần trường này để hiện huy hiệu "có hợp đồng"
   * và cảnh báo hai kỹ năng cùng sinh một khoá — cả hai đều phải thấy được TRƯỚC khi bấm Chạy,
   * chứ không phải lúc vòng lặp đã dừng giữa chừng.
   */
  contract?: SkillContractFields;
}

/** A reference file attached to a skill (like a Claude Skills bundle file). Text content. */
export interface SkillAttachment {
  name: string;
  description?: string;
  content: string;
}

/** One field of a plugin form panel (derived from the tool's input schema). */
export interface PluginPanelField {
  name: string;
  type: 'string' | 'number' | 'integer' | 'boolean' | 'object';
  description?: string;
  required: boolean;
  enum?: string[];
}

/** A no-code form panel contributed by an enabled plugin. */
export interface PluginPanelInfo {
  pluginId: string;
  pluginName: string;
  panelId: string;
  title: string;
  description?: string;
  submitLabel?: string;
  /** Full tool name the form submits to (`plugin_<id>__<tool>`). */
  toolName: string;
  /** True when running it performs a destructive Lark write. */
  gated: boolean;
  fields: PluginPanelField[];
}

/** Result of a direct (UI-initiated) Lark tool run. */
export interface LarkToolRunResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Lark bot (Event Subscription) config. The desktop runs a LOCAL webhook listener;
 * the user exposes it with a tunnel (cloudflared/ngrok) and points the Lark app's
 * Event Subscription "Request URL" at the tunnel. The bot answers in READ-ONLY
 * mode (no gated writes — there is no UI to confirm them from inside Lark).
 */
export interface LarkBotConfig {
  enabled: boolean;
  port: number;
  /** Event "Encrypt Key" (AES). Secret — stays in the main process. */
  encryptKey?: string;
  /** Event "Verification Token". Secret — stays in the main process. */
  verificationToken?: string;
  /** CLI agent for bot replies (default claude). */
  runner?: string;
  model?: string;
  /** Auto-start a cloudflared quick tunnel so Lark gets a public callback URL (no manual ngrok). */
  tunnel?: boolean;
}

/** Bot status as shown to the UI (secrets masked to set/not-set flags). */
export interface LarkBotStatus {
  running: boolean;
  enabled: boolean;
  port: number;
  encryptKeySet: boolean;
  verificationTokenSet: boolean;
  /** CLI agent configured for bot replies. */
  runner?: string;
  model?: string;
  /** The local callback a tunnel should forward to. */
  localUrl: string;
  error?: string;
  /** Whether the auto-tunnel is requested (config). */
  tunnel?: boolean;
  /** Public HTTPS URL from cloudflared (paste into Lark's Event Subscription) — when the tunnel is up. */
  publicUrl?: string;
  /** Tunnel process running. */
  tunnelRunning?: boolean;
  /** Last tunnel error (e.g. cloudflared not installed) — shown as a hint in the UI. */
  tunnelError?: string;
  /** Live counters from the webhook listener — lets the UI show the bot is actually
   * receiving/replying (or surface why it isn't) instead of just "running". */
  activity?: {
    received: number;
    processed: number;
    deduped: number;
    failed: number;
    lastMessageAt?: number;
    lastError?: string;
  };
}

/**
 * The single interface every platform implements:
 *  - WebRuntimeAdapter    → HTTP calls to api.toolswave.net (metered, hosted AI)
 *  - LocalRuntimeAdapter  → drives the local CLI runners + Lark engine (cheap)
 *  - IpcRuntimeAdapter     → renderer-side proxy that forwards to LocalRuntimeAdapter
 *                            in Electron's main process over IPC
 */
export interface RuntimeAdapter {
  readonly kind: RuntimeKind;

  auth(): Promise<AuthState>;
  signIn?(email: string, password: string): Promise<AuthState>;
  signOut?(): Promise<void>;




  /** Live holder of the shared "one AI turn at a time" lock (null when free). Lets every
   *  tab mirror the lock so it can block its own send while another tab is mid-answer. */
  onAgentBusy?(cb: (owner: AgentBusyOwner | null) => void): () => void;
  /** Pull the CURRENT lock owner (the push channel only fires on change, so a tab that
   *  mounts mid-turn must ask, or it would show Send enabled while a turn runs). */
  agentBusyNow?(): Promise<AgentBusyOwner | null>;
  /** Mọi lượt AI đang chạy (Lark nay chạy song song nhiều hội thoại). */
  agentBusyList?(): Promise<AgentBusyOwner[]>;
  onAgentBusyList?(cb: (owners: AgentBusyOwner[]) => void): () => void;
  /** Force-release the lock, killing whatever is running — stuck-turn recovery. */
  /** Không truyền khoá = mở khoá khẩn cấp TẤT CẢ; truyền khoá = chỉ dừng đúng lượt đó. */
  agentUnlock?(key?: string): Promise<void>;






  // ── Skills (Claude-style SKILL.md folders the local CLI uses in Lark + Trợ lý AI) ──
  /** List the user's imported/created skills. */
  listSkills?(): Promise<SkillInfo[]>;
  /** Just the skills that have a `/command`, for a composer's "/" menu — lighter than listSkills()
   *  where the runtime can serve it cheaply. Absent = fall back to filtering listSkills(). */
  listSkillCommands?(): Promise<
    { id: string; name: string; description: string; command: string; enabled: boolean }[]
  >;
  /** Import a skill FOLDER (native picker; must contain SKILL.md). `scope` = which runners
   *  it applies to (default all); `tags` = free-form labels. Returns the new list. */
  importSkill?(scope?: string[], tags?: string[]): Promise<SkillInfo[]>;
  /** Author a skill from a name + instructions (the "train" flow). `scope` = which runners
   *  it applies to (default all); `tags` = free-form labels; `attachments` = reference files
   *  bundled with the skill (server-side skills — see `supportsSkillAttachments`). */
  createSkill?(
    name: string,
    instructions: string,
    scope?: string[],
    tags?: string[],
    attachments?: SkillAttachment[],
    description?: string,
    /** Slash-command shortcut without the leading "/" — see `supportsSkillCommands`. */
    command?: string,
    /** needs/produces/checks/target — bỏ trống là kỹ năng thường, không tham gia kiểm chéo. */
    contract?: SkillContractFields,
  ): Promise<SkillInfo[]>;
  /** "Create with Claude" — draft a skill (name + description + instructions) from a short idea,
   *  using the hosted assistant. Server-side skills only (see `supportsSkillAttachments`). */
  draftSkill?(prompt: string): Promise<{ name: string; description: string; instructions: string }>;
  /** Enable/disable a skill (syncs it into / out of the scoped CLIs' skill dirs). */
  setSkillEnabled?(id: string, enabled: boolean): Promise<SkillInfo[]>;
  /** Change which CLI runners a skill applies to (re-syncs every runner's skill dir). */
  setSkillScope?(id: string, scope: string[]): Promise<SkillInfo[]>;
  /** Change a skill's free-form labels (tags) — organizational only, no re-sync needed. */
  setSkillTags?(id: string, tags: string[]): Promise<SkillInfo[]>;
  /** Read a skill's EDITABLE fields (+ attachments, where supported) so the UI can edit it. */
  readSkill?(id: string): Promise<{
    id: string;
    name: string;
    description?: string;
    instructions: string;
    attachments?: SkillAttachment[];
    command?: string;
    contract?: SkillContractFields;
  }>;
  /** Edit a skill IN PLACE — any of name/description/instructions/scope/tags/attachments. */
  updateSkill?(
    id: string,
    patch: {
      name?: string;
      description?: string;
      instructions?: string;
      scope?: string[];
      tags?: string[];
      attachments?: SkillAttachment[];
      /** '' clears the shortcut. Sanitized + de-duplicated by the runtime, not the caller. */
      command?: string;
      /**
       * BỎ TRỐNG = GIỮ NGUYÊN hợp đồng đang có, không phải xoá.
       *
       * Phân biệt này là bắt buộc: form sửa kỹ năng thường chỉ gửi vài trường, và nếu "không gửi"
       * bị hiểu là "xoá" thì mỗi lần đổi tên là mất sạch needs/produces/checks — đúng con bug đã
       * xảy ra. Muốn xoá thì gửi một object rỗng `{}`.
       */
      contract?: SkillContractFields;
    },
  ): Promise<SkillInfo[]>;
  /**
   * ĐỀ XUẤT hợp đồng từ phần mô tả bằng tiếng Việt — người dùng duyệt, sửa, hoặc bỏ.
   *
   * Vì sao phải có: `needs`/`produces` là tên khoá máy đọc được, còn người dùng viết kỹ năng bằng
   * lời. Bắt họ tự nghĩ ra tên khoá và tự khớp tên đó giữa 7 kỹ năng là bắt họ làm đúng phần việc
   * mà tính năng này sinh ra để khỏi phải làm. `existingKeys` là các khoá những kỹ năng khác đã
   * khai — truyền vào để mô hình DÙNG LẠI tên có sẵn thay vì đẻ ra `gia_von` bên cạnh `giaVon`.
   *
   * Trả về đề xuất thuần, KHÔNG tự ghi vào đâu cả.
   */
  suggestSkillContract?(
    name: string,
    instructions: string,
    existingKeys?: string[],
  ): Promise<SkillContractFields & { note?: string }>;
  /**
   * Các BẢN LƯU của một kỹ năng, mới nhất ở đầu.
   *
   * Mỗi lần kỹ năng bị ghi đè — người dùng sửa hay AI sửa — đều chụp lại một bản. Đây là điều kiện
   * để dám cho AI viết lại kỹ năng: không có chỗ lùi thì không ai bấm nút đó.
   */
  skillSnapshots?(id: string): Promise<{ at: string; by: 'you' | 'ai'; what: string }[]>;
  /**
   * Đổi thứ tự một NHÓM kỹ năng trong sổ đăng ký (các kỹ năng khác giữ nguyên chỗ).
   *
   * Chỉ đổi thứ tự NHÌN THẤY khi nhiều kỹ năng cùng sẵn sàng chạy — không đổi kết quả, vì hai kỹ
   * năng cùng sẵn sàng thì theo định nghĩa không dùng khoá của nhau.
   */
  reorderSkills?(ids: string[]): Promise<SkillInfo[]>;
  /** Khôi phục một bản lưu. Bản HIỆN TẠI được chụp lại trước, nên lùi nhầm vẫn tiến lại được. */
  restoreSkill?(id: string, at: string): Promise<SkillInfo[]>;
  /**
   * True khi runtime này ghi được HỢP ĐỒNG vào kỹ năng.
   *
   * Cùng cơ chế với `supportsSkillCommands`: hợp đồng đi ghép vào payload create/update sẵn có nên
   * không có phương thức mới để dò, và một main cũ sẽ nuốt mất nó mà không báo gì.
   */
  supportsSkillContracts?: boolean;
  /** Permanently delete a skill. */
  deleteSkill?(id: string): Promise<SkillInfo[]>;
  /** True when this runtime supports bundling reference FILES into a skill (the create/edit flow
   *  shows an attach-files section). Server-side (web) skills support it; the desktop local skill
   *  files don't yet, so it's absent/false there. */
  supportsSkillAttachments?: boolean;
  /**
   * True when this runtime stores a skill's `command` (slash-command shortcut). The Skills screen
   * hides the command field when it is absent, and a composer skips its "/" menu — so an older
   * installed desktop build degrades to the previous behaviour instead of silently dropping the
   * field on save.
   */
  supportsSkillCommands?: boolean;

  /** Desktop: hard-exit the app (force) — used before a core reinstall so a hidden window
   *  can't keep the process alive and block the drag-replace. */
  quitApp?(): Promise<void>;


















  /** Local Claude CLI controls — present on desktop, undefined on web. */
  claude?: ClaudeControls;

  /** Desktop only: multi-CLI runner controls (status + connect for Claude/Grok/
   *  Gemini/Codex). Undefined on web. */
  runners?: RunnerControls;

  /** Desktop only: remote-control ("Điều khiển từ xa") agent client — receive +
   *  run tasks enqueued from the phone. Undefined on web. */
  agent?: AgentControls;

  /** Open a URL in the user's real browser (desktop: shell.openExternal; web: window.open). */
  openExternal?(url: string): void;
  /** Mở tệp agent vừa dựng (create_file) bằng ứng dụng mặc định của hệ điều hành.
   *  Chỉ desktop; phía main chặn mọi đường dẫn nằm ngoài thư mục hội thoại. */
  openLocalFile?(path: string): Promise<{ ok: boolean; error?: string }>;
  /** Thẻ tệp: hiện trong thư mục / lưu về… (hộp thoại CHỈ khi người dùng bấm) / đưa lên Lark Drive, Sheets, Docs. */
  larkFileAction?(input: LarkFileActionInput): Promise<LarkFileActionResult>;
  /**
   * Theo dõi tiến trình tải bộ cài. Trả về hàm huỷ đăng ký.
   *
   * Cần một kênh RIÊNG chứ không gộp vào giá trị trả về của `downloadInstaller()`: hàm đó chỉ
   * trả lời khi đã tải XONG, mà thứ người dùng cần biết là trong lúc CHỜ. Trước đây giao diện
   * ghim `Progress percent={100}` nhấp nháy — nhìn thì có vẻ đang chạy, nhưng nó không mang một
   * bit thông tin nào, nên mười giây hay mười phút trông giống hệt nhau.
   */
  onInstallerProgress?(cb: (p: { received: number; total: number }) => void): () => void;

  /** Desktop only: code-push status — is a renderer update / full reinstall available. */
  checkUpdate?(): Promise<DesktopUpdateInfo>;
  /** Desktop only: reload the renderer to the latest pushed build (hot code push). */
  applyUpdate?(): Promise<DesktopUpdateInfo>;
  /** Desktop only: download the new installer (.dmg/.exe) for this OS + open it — a
   *  one-click alternative to visiting the download page when the CORE needs reinstalling. */
  downloadInstaller?(): Promise<{ ok: boolean; path?: string; error?: string }>;

  /** Desktop only: subscribe to a Larkwave-account JWT delivered via the
   *  `larkwave://` deep link OR the loopback OAuth callback. Returns an
   *  unsubscribe fn. Undefined on web. */
  onAuthDeepLink?(cb: (token: string) => void): () => void;

  /** Desktop only: subscribe to the OAuth round-trip RESULT (success/error) so the
   *  UI can show a status modal and route. Fires from the loopback callback right
   *  after `onAuthDeepLink`. Returns an unsubscribe fn. Undefined on web. */
  onAuthStatus?(cb: (status: { phase: 'success' | 'error'; error?: string }) => void): () => void;

  /** Desktop only: start a one-shot `http://127.0.0.1:<port>/cb` server to catch
   *  the OAuth redirect (works in dev — no custom-scheme OS registration needed).
   *  Returns the redirect URL to pass as `?redirect=` to the OAuth start. */
  startAuthLoopback?(): Promise<{ redirect: string }>;

  /** Desktop only: run an OAuth flow inside an in-app window and intercept the
   *  server's redirect to the web callback (`…/auth/callback?token=…`). Works with
   *  the CURRENT server (no redeploy): the captured JWT is delivered to the app via
   *  `onAuthDeepLink`. Resolves when the window closes. Undefined on web. */
  openAuthWindow?(
    url: string,
  ): Promise<{ ok: boolean; kind?: 'login' | 'connect'; provider?: string; error?: string }>;

  // ── Lark × Claude (desktop only; undefined on web) ─────────────────────────

  /** Current Lark custom-app connection state. */
  larkStatus?(): Promise<LarkConnection>;
  /** Connect (and persist, encrypted) a Lark custom app; tests the credentials.
   *  `name` labels this app in the saved-connection history. */
  larkConnect?(creds: { appId: string; appSecret: string; name?: string }): Promise<LarkConnection>;
  /** Forget the connected app + its tokens. */
  larkDisconnect?(): Promise<void>;
  /**
   * Bật "Larkwave chạy lịch tự động hoá hộ": tiến trình CHÍNH đọc app_secret đang lưu và đẩy
   * lên máy chủ. Cố ý không nhận tham số và không trả về khoá — renderer không bao giờ cầm
   * app_secret. Web runtime để undefined (ở đó người dùng tự gõ khoá vào form).
   */
  larkHostedPush?(): Promise<{ ok: boolean; error?: string }>;

  // ── Bộ kỹ năng có hợp đồng (needs/produces/checks) ────────────────────────
  /** Các bộ kỹ năng dính nhau về dữ liệu — mỗi bộ chạy được theo kiểu kiểm chéo liên tục. */
  larkListSkillSets?(): Promise<LarkSkillSet[]>;
  /** Chạy bộ chứa kỹ năng này. Tiến trình bắn về qua sự kiện `larkSkillSetEvent`. */
  /** Lời hỏi đang chờ của một hội thoại (xác nhận ghi + ask_user). Xem `LarkPendingPrompts`. */
  larkPendingPrompts?(convId: string): Promise<LarkPendingPrompts>;
  larkRunSkillSet?(
    skillId: string,
    seedFacts?: Record<string, string | number | boolean | null>,
    /** 'ask' = chạy thử chỉ đọc (mặc định), 'build' = được ghi vào Base thật. */
    mode?: 'ask' | 'build',
  ): Promise<LarkSkillRunResult>;
  /** Nghe tiến trình một lượt chạy bộ kỹ năng. Trả về hàm gỡ đăng ký. */
  onLarkSkillSetEvent?(cb: (e: unknown) => void): () => void;
  /**
   * Đọc tệp (Excel/PDF/ảnh/Word…) → trích theo format đã khai → ghi vào bảng đích.
   * `dryRun` = chỉ trích và kiểm, KHÔNG ghi. Trả null khi người dùng huỷ hộp chọn tệp.
   */
  larkExtractToTable?(skillId: string, dryRun: boolean): Promise<LarkExtractResult | null>;

  // ── Saved Lark apps (connection history) ───────────────────────────────────
  /** List the remembered Lark custom apps (no secrets), newest-used first. */
  larkListApps?(): Promise<LarkAppRef[]>;
  /** Reconnect to a remembered app by id (re-mints its token; no secret re-entry). */
  larkConnectSaved?(appId: string): Promise<LarkConnection>;
  /** Rename a remembered app; returns the updated list. */
  larkRenameApp?(appId: string, name: string): Promise<LarkAppRef[]>;
  /** Remove a remembered app from history (disconnects it if active); returns the list. */
  larkForgetApp?(appId: string): Promise<LarkAppRef[]>;
  /**
   * Actively validate the connection: re-mint the tenant token and proactively refresh
   * the personal-account token. Returns a status with `tokenValid`/`userTokenExpired`
   * set, so a session that expired while the app was idle is detected + surfaced (the
   * cheap `larkStatus()` never hits the network). Safe to call on opening the screen.
   */
  larkCheckConnection?(): Promise<LarkConnection>;
  /**
   * Log in with a PERSONAL Lark account (opens the Lark authorize page — QR scan or
   * credentials). Yields a user_access_token so every Lark call acts AS the user
   * (full access to their Bases, Docs, Sheets, Wiki, Drive, messages…).
   */
  larkUserLogin?(): Promise<LarkConnection>;
  /** Log out of the personal account (revert to app/tenant-token access). */
  larkUserLogout?(): Promise<LarkConnection>;

  /** EXPERIMENTAL — connect a Lark WEB session (login window) for the internal-API workflow
   *  reader (`bitable_read_workflows`). `url` = any URL from the user's workspace. */
  larkWebConnect?(url?: string): Promise<LarkWebInfo>;
  larkWebStatus?(): Promise<LarkWebInfo>;
  larkWebDisconnect?(): Promise<void>;
  /** Show the Lark web window again (so the user can open a Base's Automation panel → the app
   *  auto-sniffs the internal workflow endpoint). */
  larkWebReveal?(): Promise<void>;
  /** Manually set the internal workflow endpoint from a pasted request URL (sniffer fallback). */
  larkWebSetWorkflowUrl?(url: string): Promise<LarkWebInfo>;
  /** UI-automation: arm the in-page recorder + reveal the Lark window so the user creates a
   *  workflow by hand; we capture the EXACT valid request Lark sends (no schema guessing). */
  larkWebStartRecorder?(url?: string): Promise<{ ok: boolean; error?: string }>;
  /** Read the recorder buffer + refresh the captured valid workflow payload. */
  larkWebGetRecording?(): Promise<LarkWebRecording | null>;
  /** Create a REAL workflow by replaying the captured valid request (Lark's own bytes). */
  larkWebReplayWorkflow?(opts?: { enable?: boolean }): Promise<{ workflowID: string; baseId: string; title: string }>;

  /** "Trình duyệt Lark": show the SAME Lark web page (session) inside the app at `rect` (CSS px).
   *  A zero-size rect keeps it attached but hidden (e.g. while an app modal is open). */
  larkBrowserAttach?(rect: LarkBrowserRect): Promise<LarkBrowserState>;
  /** Leave the screen — the page goes back to the hidden window (session stays warm). */
  larkBrowserDetach?(): Promise<void>;
  larkBrowserState?(): Promise<LarkBrowserState>;
  larkBrowserNavigate?(input: { url?: string; action?: 'back' | 'forward' | 'reload' | 'home' | 'stop' }): Promise<LarkBrowserState>;
  /** "Dừng" — abort the running AI UI automation. */
  larkBrowserStopAi?(): Promise<LarkBrowserState>;
  larkBrowserResumeAi?(): Promise<LarkBrowserState>;
  larkUiTemplateList?(): Promise<LarkUiTemplate[]>;
  larkUiTemplateSave?(input: { name: string; description?: string }): Promise<LarkUiTemplate>;
  larkUiTemplateDelete?(id: string): Promise<LarkUiTemplate[]>;
  larkUiTemplateApply?(input: { id: string; baseId?: string; vars?: Record<string, string>; title?: string }): Promise<LarkUiTemplateApplyResult>;

  /** List the Bitable Bases registered for Claude to operate on. */
  larkListBases?(): Promise<LarkBaseRef[]>;
  /** Snapshot a Base's schema + a few sample rows (bounded, read-only). */
  larkBaseSnapshot?(appToken: string): Promise<LarkBaseSnapshot>;
  /** Auto-discover the user's Bases by walking their Drive (needs the personal login). */
  larkDiscoverBases?(): Promise<LarkBaseRef[]>;
  /** Register (or update) a Base by app_token or Base URL; `name`/`description` are
   *  optional labels. Re-adding an existing app_token updates its labels. Returns the list. */
  larkAddBase?(input: { appToken?: string; url?: string; name?: string; description?: string }): Promise<LarkBaseRef[]>;
  /** Unregister a Base; returns the updated list. */
  larkRemoveBase?(appToken: string): Promise<LarkBaseRef[]>;

  /** Run one Lark chat turn; streams text + tool-call events. Multi-turn: turns
   *  in the same conversation share context until `larkResetChat()`. */
  larkChat?(input: LarkChatInput): AsyncIterable<LarkChatEvent>;
  /** Answer a pending gated tool call (destructive Lark write). */
  larkConfirmTool?(callId: string, decision: 'allow' | 'deny'): Promise<void>;
  /** Answer a pending `ask_user` request (Claude asked the user for help/clarification). */
  larkAnswerAsk?(callId: string, answer: string): Promise<void>;
  /** Toggle auto-approving writes (Build mode runs without per-tool confirm).
   *  Returns the updated connection status. */
  larkSetAutoApprove?(on: boolean): Promise<LarkConnection>;
  /** Tạo workflow: công tắc "Tự động (không hỏi lại)" — riêng máy này, mặc định BẬT. */
  larkGetWorkflowAuto?(): Promise<{ workflowAuto: boolean }>;
  larkSetWorkflowAuto?(on: boolean): Promise<{ workflowAuto: boolean }>;
  /** Back up + sync local Lark data (sessions/bases/settings, NOT the app_secret) to
   *  the Larkwave account so it survives a lost machine + syncs across devices.
   *  Returns the server timestamp, or null when offline/unreachable (local stays safe). */
  larkBackupSync?(): Promise<{ at: string } | null>;
  /** Start a fresh conversation (drops the shared Claude session context). */
  larkResetChat?(): Promise<void>;

  // ── Public sharing of a conversation (viewable on the website) ──────────────
  /** Publish (or update) a Lark conversation to a PUBLIC link. Uploads a sanitized
   *  transcript (never the app_secret / Base app_tokens). The Larkwave JWT is
   *  injected by the adapter. */
  larkShareSession?(sessionId: string): Promise<LarkShareInfo>;
  /** Un-publish a shared conversation (by its local session id). */
  larkUnshareSession?(sessionId: string): Promise<void>;
  /** Whether a conversation is currently shared → its public URL (else null) + how many transcript
   *  items are CURRENTLY published (`itemCount`), so the UI can flag an out-of-date share. */
  larkShareStatus?(sessionId: string): Promise<{ url: string | null; itemCount?: number }>;

  // ── Tự động hoá (Larkwave rule engine — works around Lark's missing API) ────
  /** List the user's Larkwave automation rules (with live status). */
  larkListAutomations?(): Promise<LarkAutomation[]>;
  /** Create (id absent) or update (id present) a rule; returns the full list. */
  larkSaveAutomation?(rule: LarkAutomationInput): Promise<LarkAutomation[]>;
  /** Delete a rule; returns the updated list. */
  larkDeleteAutomation?(id: string): Promise<LarkAutomation[]>;
  /** Enable/disable a rule; returns the updated list. */
  larkSetAutomationEnabled?(id: string, on: boolean): Promise<LarkAutomation[]>;
  /** Run a rule once now (for testing) — returns how many records matched/fired. */
  larkRunAutomation?(id: string): Promise<LarkAutomationRunResult>;
  /** List the tables of a Base (for the automation form's table picker). */
  larkListTables?(appToken: string): Promise<LarkTableRef[]>;
  /** Tên các CỘT của một bảng — form tạo kỹ năng dùng để gợi ý khoá từ thứ người dùng nhìn thấy. */
  larkListFieldNames?(appToken: string, tableId: string): Promise<string[]>;

  // ── Lark chat history (sessions) ───────────────────────────────────────────
  /** List saved Lark conversations, newest first. */
  larkSessions?(): Promise<LarkSessionMeta[]>;
  /** Begin a brand-new conversation (fresh Claude session) scoped to `bases`. */
  larkNewSession?(bases?: LarkBaseRef[], opts?: { kind?: 'workflow' }): Promise<{ id: string }>;
  /** Mọi Base người dùng thấy qua phiên Lark web (không cần App ID). `query` = tìm thêm Base cũ. */
  larkWebListBases?(input?: { query?: string }): Promise<LarkWebBase[]>;
  /** Open a saved conversation — resumes its Claude session, returns items + bases. */
  larkSwitchSession?(id: string): Promise<{ items: unknown[]; bases?: LarkBaseRef[]; runner?: string; model?: string }>;
  larkSetAgentPrefs?(prefs: { runner?: string; model?: string; apiMode?: boolean; larkRunSource?: 'cli' | 'api' | 'maic' }): Promise<LarkConnection>;
  /** Persist the open conversation's items (+ its applied Bases). */
  larkSaveSession?(id: string, items: unknown[], bases?: LarkBaseRef[]): Promise<void>;
  /** Delete a saved conversation. */
  larkDeleteSession?(id: string): Promise<void>;
  /** Đặt tên hội thoại. Tên rỗng = trả về tên tự suy từ tin nhắn đầu. */
  larkRenameSession?(id: string, title: string): Promise<void>;
  /** Kho tệp đính kèm của Lark Agents trên MÁY NÀY, gom theo hội thoại. */
  larkListFiles?(): Promise<
    { convId: string; title: string; files: { name: string; size: number; mtime: number }[] }[]
  >;
  larkReadFile?(convId: string, name: string): Promise<{ dataBase64: string; size: number } | null>;
  larkDeleteFile?(convId: string, name: string): Promise<{ ok: boolean }>;
  /** Notes/todos for a conversation. Deliberately separate from larkSaveSession: notes
   *  save on a typing debounce, and `items` can carry megabytes of inlined images —
   *  re-shipping the whole transcript per keystroke would be wasteful and would race the
   *  turn-end save. Saving notes also does NOT touch the session's updatedAt, so jotting
   *  a note never reorders the conversation list. */
  larkNotes?(id: string): Promise<LarkNoteDoc | null>;
  larkSaveNotes?(id: string, doc: LarkNoteDoc): Promise<void>;

  // ── Đặc tả hệ thống (living Lark spec) ──────────────────────────────────────
  /** The current per-account spec doc (null if never built). */
  larkSpec?(): Promise<LarkSpecDoc | null>;
  /** Persist an edited spec (e.g. the user-owned overview or a dismissed insight). Saved
   *  scoped to the account + queued for cross-device backup by the adapter (token injected). */
  larkSaveSpec?(doc: LarkSpecDoc): Promise<void>;
  /** "Đồng bộ đặc tả": RE-FETCH live structured data from every applied Base
   *  (bitable_base_overview + bitable_read_workflows), merge by real Lark id into the
   *  existing doc, compute the added/changed/removed diff, and persist. Holds the shared AI
   *  turn-lock while it runs. */
  larkBuildSpec?(): Promise<SpecBuildResult>;
  /** Promote one conversation finding into the spec as an insight (no full re-fetch). */
  larkPromoteToSpec?(input: SpecPromoteInput): Promise<LarkSpecDoc>;

  // ── CMS Bitable sync ────────────────────────────────────────────────────────
  /** The configured cms-lark-sync backend URL + whether the Lark web session is live enough
   *  to extract a fresh connector session. */
  cmsSyncConfig?(): Promise<{ baseUrl: string; webReady: boolean }>;
  cmsSyncSetBaseUrl?(url: string): Promise<void>;
  /** List the CMS's Bitable-sync jobs. */
  cmsSyncListJobs?(): Promise<CmsSyncJob[]>;
  /** Create a connector-mode job for a Base + one-or-more tables, attaching a fresh session. */
  cmsSyncCreateJob?(input: {
    name: string;
    appToken: string;
    tableIds: string[];
    enabled?: boolean;
    intervalSeconds?: number;
  }): Promise<CmsSyncJob>;
  /** Change which tables a connector job syncs (multi-select). */
  cmsSyncSetJobTables?(jobId: string, tableIds: string[]): Promise<CmsSyncJob>;
  /** Edit a job's config (name, interval, auto-schedule, enabled) — like the web /sync/bitable Edit form. */
  cmsSyncUpdateJob?(jobId: string, patch: CmsSyncJobPatch): Promise<CmsSyncJob>;
  /** Read/write the aggregate ("tổng") Lark error-report target (backend NotifyConfig). */
  cmsSyncGetErrorReport?(): Promise<CmsSyncErrorReport>;
  cmsSyncSetErrorReport?(cfg: CmsSyncErrorReport): Promise<CmsSyncErrorReport>;
  /** Liveness of the external VM session-keeper (heartbeat via the CMS backend). */
  cmsSyncKeeperStatus?(): Promise<CmsKeeperStatus>;
  /** List Lark groups the bot is in (for the error-report "chọn nhóm" dropdown). */
  cmsSyncListLarkChats?(): Promise<CmsSyncLarkChat[]>;
  /** Create a NEW Lark group (bot as owner); the current user is added best-effort. Returns the
   *  chat + how many members were actually added (0 = bot-only; add yourself in Lark). */
  cmsSyncCreateLarkChat?(name: string): Promise<{ chatId: string; name: string; addedMembers: number; joinLink?: string; memberError?: string }>;
  /** Send a TEST card to a webhook and/or chat to confirm the target is reachable. */
  cmsSyncTestErrorReport?(target: { larkWebhookUrl?: string; chatId?: string }): Promise<{
    ok: boolean;
    results: { target: string; ok: boolean; error?: string }[];
  }>;
  /** Push a fresh connector session into every connector job (incl. disabled). */
  cmsSyncRefreshAll?(): Promise<CmsSyncRefreshResult>;
  /** History of Lark web re-logins (local button + remote phone-QR), newest first. */
  cmsSyncLoginHistory?(): Promise<LarkReloginEntry[]>;
  /** Refresh one job's session (per-job button). */
  cmsSyncRefreshJob?(jobId: string): Promise<CmsSyncJob>;
  /** Run a job now — triggers Lark's connector sync directly (real per-table result + details). */
  cmsSyncExecute?(jobId: string): Promise<{ ok: boolean; synced?: number; total?: number; failed?: string[]; details?: string[]; viaLocal?: boolean; error?: string }>;
  cmsSyncToggle?(jobId: string): Promise<CmsSyncJob>;
  cmsSyncDeleteJob?(jobId: string): Promise<void>;
  /** Subscribe to "Lark web session expired" pushes (proactive re-login alert). Returns an
   *  unsubscribe fn. Undefined on web. */
  onLarkWebSessionDead?(cb: () => void): () => void;

  /** Cached AI summaries of collapsed answers for a conversation, keyed by item id. */
  larkSummaries?(id: string): Promise<Record<string, string>>;
  /** Summarize one answer with the ACTIVE runner (local CLI or direct API, per the
   *  existing switch) and cache it against the conversation. Returns the summary. */
  larkSummarize?(id: string, itemId: string, text: string): Promise<string>;
  /** Set the signed-in account so local Lark sessions are stored + synced PER-ACCOUNT
   *  (switching accounts on one device must not mix conversations). null = signed out. */
  larkSetAccount?(userId: string | null): Promise<void>;
  /** Nhập dữ liệu cũ của app desktop Toolswave (desktop). Xem docs/migrate-from-toolswave.md. */
  toolswaveMigrationStatus?(): Promise<ToolswaveMigrationStatus>;
  toolswaveMigrate?(o: { dryRun?: boolean }): Promise<ToolswaveMigrationReport>;
  onToolswaveMigrationEvent?(cb: (ev: ToolswaveMigrationEvent) => void): () => void;
  /** Owner-side scope for delegated grants (kept on this machine, never on the server). */
  larkGrantPolicies?(): Promise<Record<string, LarkGrantPolicy>>;
  larkSetGrantPolicy?(grantId: string, policy: LarkGrantPolicy | null): Promise<void>;
  /** Execute one delegated turn locally, under this machine's copy of the policy. */
  larkRunGrantTurn?(grantId: string, prompt: string): Promise<{ ok: boolean; text?: string; error?: string }>;
  /** Execute one delegated "shared Trợ lý AI" turn locally — a READ-ONLY general assistant
   *  (no Lark, no scope; the CLI is confined to read/search/browse tools). */
  larkRunAgentGrantTurn?(grantId: string, prompt: string): Promise<{ ok: boolean; text?: string; error?: string }>;
  /** Nearing the context limit: summarize the CURRENT conversation, start a fresh session
   *  (same Bases) seeded with that summary, and return it. Lets a long chat continue cleanly. */
  larkHandoffSession?(): Promise<{ summary: string; id: string; bases: LarkBaseRef[] }>;
  /**
   * Nén ngữ cảnh NGAY TRONG hội thoại đang mở: tóm tắt rồi thay phiên Claude bên dưới, giữ
   * nguyên id hội thoại, lịch sử hiển thị và Base. Khác `larkHandoffSession` — hàm kia tạo
   * hội thoại MỚI, cắt đôi thứ người dùng đang làm dở.
   */
  larkCompactSession?(convId?: string): Promise<{ ok: boolean; summary: string }>;

  /** Current Lark bot (Event Subscription) status. */
  larkBotStatus?(): Promise<LarkBotStatus>;
  /** Save bot config + (re)start/stop the local webhook listener. Blank secrets keep stored ones. */
  larkBotConfigure?(cfg: LarkBotConfig): Promise<LarkBotStatus>;
  /** Create a Lark group to chat WITH THE BOT (bot = owner) + a one-tap join link. */
  larkBotCreateChat?(name: string): Promise<{ chatId: string; name: string; joinLink?: string }>;

  // ── Curated plugins (desktop only) ─────────────────────────────────────────
  listPlugins?(): Promise<PluginInfo[]>;
  /** Install a plugin from a local path to its manifest.json (or its folder). */
  installPlugin?(source: string): Promise<PluginInfo[]>;
  setPluginEnabled?(id: string, enabled: boolean): Promise<PluginInfo[]>;
  uninstallPlugin?(id: string): Promise<PluginInfo[]>;
  /** No-code form panels contributed by enabled plugins. */
  larkPluginPanels?(): Promise<PluginPanelInfo[]>;
  /** Run a Lark tool directly (UI-initiated, e.g. a plugin form panel). */
  larkRunTool?(name: string, input: Record<string, unknown>): Promise<LarkToolRunResult>;
}


// ── Nhập dữ liệu từ app desktop Toolswave ──────────────────────────────────────────────────────
export type ToolswaveMigrationCategory =
  | 'sessions'
  /** Phiên Claude CLI gốc (`~/.claude/projects/<slug>/<id>.jsonl`) chép sang thư mục làm việc Larkwave — "phiên Claude đã nối lại". */
  | 'claudeSessions'
  | 'deleted'
  | 'specs'
  | 'larkConfig'
  | 'automations'
  | 'bases'
  | 'relogin'
  | 'workFiles'
  /** Thẻ tệp trong hội thoại đã nhập được trỏ sang bản chép ở Larkwave (thay vì thư mục Toolswave). */
  | 'fileLinks'
  | 'skills'
  | 'plugins';

export interface ToolswaveMigrationReport {
  dryRun: boolean;
  userId: string;
  sources: string[];
  at: string;
  counts: Record<ToolswaveMigrationCategory, { added: number; merged: number; unchanged: number }>;
  /** Đường dẫn tương đối đã che id + lý do bỏ qua (không có nội dung). */
  skipped: { path: string; reason: string }[];
  droppedSecretFields: number;
  followUps: string[];
  /**
   * Lần nối lại phiên Claude CLI (bổ sung cho tài khoản đã nhập trước khi có bước này). Có trường
   * này thì máy đã chạy bước nối phiên — không tự chạy lại.
   */
  claudeRelink?: { at: string; added: number; merged: number; unchanged: number };
  /**
   * Lần chép bổ sung TẤT CẢ tệp làm việc + trỏ lại thẻ tệp (cho tài khoản đã nhập bằng bản chỉ chép tệp
   * ≤ 5 MB). Có trường này thì không tự chạy lại.
   */
  filesRelink?: { at: string; files: number; links: number; skipped: number };
}

export interface ToolswaveMigrationStatus {
  found: boolean;
  sources: number;
  userId: string | null;
  last: ToolswaveMigrationReport | null;
  running: boolean;
}

export type ToolswaveMigrationEvent =
  | { phase: 'start'; dryRun: boolean; auto: boolean }
  | { phase: 'done'; report: ToolswaveMigrationReport; auto: boolean }
  | { phase: 'error'; message: string; auto: boolean };
