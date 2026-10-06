/**
 * @larkwave/shared — single source of truth shared by the NestJS API
 * (`apps/api`) and the Next.js frontend (`apps/web`). Defines the full contract:
 * domain entities, the remote-agent relay, billing and platform configuration.
 *
 * Enum string values are lowercase and match the Prisma enum members 1:1, so
 * entities cross the DB ↔ API ↔ UI boundary with no mapping layer.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

export type Role = 'admin' | 'user';
export type UserStatus = 'active' | 'suspended';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// ─────────────────────────────────────────────────────────────────────────────
// Domain entities (API representations — never expose secrets like passwordHash)
// ─────────────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  /** Subscription plan id (e.g. 'free'). Exposed so the web sidebar can read it. */
  plan: string;
  /** Public avatar URL (Google picture or an uploaded image). Null until set. */
  avatarUrl: string | null;
  /** Appears in the public "discover users" directory (default true). */
  discoverable?: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One turn in the AI help-assistant chat. */
export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantChatRequest {
  messages: AssistantMessage[];
  /** Optional page/app context (e.g. current route or app name). */
  context?: string;
}

export interface AssistantChatResponse {
  reply: string;
}

/** An in-app bug/error report submitted by a user (managed by admins). */
export type FeedbackSeverity = "low" | "medium" | "high" | "critical";
export type FeedbackStatus = "open" | "resolved" | "duplicate" | "rejected";

/** Suggested tester points per severity — admin can override per report. */
export const SEVERITY_POINTS: Record<FeedbackSeverity, number> = {
  low: 5,
  medium: 15,
  high: 40,
  critical: 100,
};

export const SEVERITY_LABEL: Record<FeedbackSeverity, string> = {
  low: "Thấp",
  medium: "Trung bình",
  high: "Cao",
  critical: "Nghiêm trọng",
};

export interface FeedbackAttachment {
  id: string;
  name: string;
  kind: "image" | "text" | "pdf";
  mime: string;
  size: number;
}

export interface Feedback {
  id: string;
  message: string;
  url: string | null;
  /** { userAgent?: string; logs?: string[] } — page context + captured console errors. */
  context: { userAgent?: string; logs?: string[] } | null;
  /** Uploaded evidence (images/files). */
  attachments: FeedbackAttachment[];
  status: FeedbackStatus;
  /** Bug-bounty triage. null until an admin classifies it. */
  severity: FeedbackSeverity | null;
  /** Tester points awarded (0 for duplicates/rejected). */
  points: number;
  /** Monetary reward (VND) granted for this report. */
  rewardVnd: number;
  rewardPaid: boolean;
  rewardPaidAt: string | null;
  /** If a duplicate, the canonical (first) report id — its reporter keeps the credit. */
  duplicateOfId: string | null;
  adminNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  /** Who reported it (admin list only). */
  user?: Pick<User, "id" | "email" | "name">;
}

export interface SubmitFeedbackRequest {
  message: string;
  url?: string;
  context?: { userAgent?: string; logs?: string[] };
  /** Ids of files uploaded via POST /uploads to attach as evidence. */
  attachmentIds?: string[];
}

/** Admin triage payload for PATCH /admin/feedback/:id. */
export interface AdminUpdateFeedbackRequest {
  status?: FeedbackStatus;
  severity?: FeedbackSeverity | null;
  points?: number;
  rewardVnd?: number;
  rewardPaid?: boolean;
  adminNote?: string;
  /** Mark as duplicate of another report (its first reporter keeps the credit). */
  duplicateOfId?: string | null;
}

/** A user's own reports + their tester scoreboard (GET /feedback/mine). */
export interface MyFeedbackResponse {
  items: Feedback[];
  totalPoints: number;
  totalRewardVnd: number;
  paidRewardVnd: number;
  resolvedCount: number;
  /** Count of valid (non-rejected) reports — drives the tester danh hiệu. */
  totalReports: number;
}

// ── Blog / content (public /blog + admin /admin/blog) ──────────────────────

/** AI/heuristic duplicate-candidate for a report (admin dedup helper). */
export interface FeedbackSimilar {
  id: string;
  message: string;
  status: FeedbackStatus;
  createdAt: string;
  user?: Pick<User, "id" | "email" | "name">;
  /** 0..100 similarity as judged by Claude. */
  score: number;
  reason: string;
}

export type NotificationType = "message" | "feedback" | "system";

/** An in-app notification (realtime). `link` is an internal path to jump to. */
export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationsResponse {
  items: AppNotification[];
  unread: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tester "danh hiệu" — achievement badges earned by NUMBER of (valid) bug reports.
// Rendered in the profile's "Huy hiệu thành tựu" collection. `tier` = medal rarity.
export interface TesterRank {
  key: string;
  title: string;
  emoji: string;
  tier: "common" | "rare" | "epic" | "legendary" | "mythic";
  /** Bug reports required to unlock this badge. */
  minBugs: number;
}
export const TESTER_RANKS: TesterRank[] = [
  { key: "rookie", title: "Tân binh Tester", emoji: "🌱", tier: "common", minBugs: 1 },
  { key: "reporter", title: "Người báo lỗi", emoji: "🐛", tier: "rare", minBugs: 10 },
  { key: "hunter", title: "Thợ săn Bug", emoji: "🔍", tier: "rare", minBugs: 25 },
  { key: "expert", title: "Chuyên gia QA", emoji: "🛡️", tier: "epic", minBugs: 50 },
  { key: "master", title: "Bậc thầy Tester", emoji: "⭐", tier: "legendary", minBugs: 100 },
  { key: "legend", title: "Huyền thoại QA", emoji: "👑", tier: "mythic", minBugs: 250 },
];

/** A user as shown in friend lists / chats (public-safe profile fields). */
export interface Friend {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
}

/** A user surfaced in the discovery directory + their relationship to the viewer. */
export interface DiscoverUser {
  id: string;
  name: string;
  avatarUrl?: string | null;
  /** none = strangers; pending_out = you invited; pending_in = they invited; friends. */
  friendStatus: "none" | "pending_out" | "pending_in" | "friends";
}

/** A pending friend request (either direction). */
export interface FriendRequest {
  /** The other user involved. */
  user: Friend;
  /** "incoming" = they invited you; "outgoing" = you invited them. */
  direction: "incoming" | "outgoing";
  createdAt: string;
}

/** One direct message in a 1:1 thread. */
export interface ChatMessage {
  id: string;
  senderId: string;
  recipientId: string;
  body: string;
  createdAt: string;
  /** True if the current user sent it. */
  mine: boolean;
}

/** A conversation summary for the messages list. */
export interface Conversation {
  friend: Friend;
  lastMessage: string;
  lastAt: string;
  /** Unread messages from this friend. */
  unread: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Remote agent — phone → server → desktop "Máy của tôi" relay
//
// A signed-in desktop ("agent device") holds an SSE command stream open to the
// server. From a phone the user enqueues a RemoteTask; the server pushes it to an
// online device, which runs the chosen CLI runner and POSTs progress events back.
// Those fan out to the user's existing MESSAGE SSE so the phone thread updates
// live. The command/event shapes live here so the API (apps/api), the desktop
// main process (apps/desktop) and the web all agree on ONE contract.
// ─────────────────────────────────────────────────────────────────────────────

/** The CLI runner (agent) a remote/desktop AI task runs on. Matches the desktop
 *  runner-registry ids. Adding a runner = one entry here + one desktop adapter. */
export type RunnerId = 'claude' | 'grok' | 'gemini' | 'codex';
export const RUNNER_IDS: readonly RunnerId[] = ['claude', 'grok', 'gemini', 'codex'] as const;

/** A selectable model within a provider. */
export interface RunnerModel {
  id: string;
  label: string;
}

/** Display catalog of CLI runners + models — what the phone's provider/model
 *  picker renders. The desktop reports which are actually INSTALLED at runtime;
 *  this is just the menu. Model ids are configurable (CLIs accept aliases/ids). */
export interface RunnerCatalogEntry {
  id: RunnerId;
  label: string;
  /** The CLI binary name (shown as a hint + how the desktop spawns it). */
  bin: string;
  /** npm install hint shown when the binary isn't on PATH. */
  installHint: string;
  models: RunnerModel[];
}

export const RUNNER_CATALOG: readonly RunnerCatalogEntry[] = [
  {
    id: 'claude',
    label: 'Claude CLI',
    bin: 'claude',
    installHint: 'npm i -g @anthropic-ai/claude-code',
    models: [
      { id: 'opus', label: 'Claude Opus' },
      { id: 'sonnet', label: 'Claude Sonnet' },
      { id: 'haiku', label: 'Claude Haiku' },
    ],
  },
  {
    id: 'grok',
    label: 'Grok CLI',
    bin: 'grok',
    installHint: 'npm i -g @vibe-kit/grok-cli',
    models: [
      { id: 'grok-composer-2.5-fast', label: 'Grok Composer 2.5 Fast' },
      { id: 'grok-build', label: 'Grok Build' },
    ],
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    bin: 'gemini',
    installHint: 'npm i -g @google/gemini-cli',
    models: [
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    ],
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    bin: 'codex',
    installHint: 'npm i -g @openai/codex',
    models: [
      { id: 'gpt-5-codex', label: 'GPT-5 Codex' },
      { id: 'gpt-5', label: 'GPT-5' },
    ],
  },
] as const;

export type RemoteTaskStatus = 'queued' | 'running' | 'done' | 'error' | 'canceled';

/** A registered desktop agent device (one per machine the user runs the app on). */
export interface AgentDevice {
  id: string;
  name: string;
  platform: string;
  /** Derived: lastSeenAt within the heartbeat window. */
  online: boolean;
  lastSeenAt: string;
  createdAt: string;
}

/** One streamed progress event of a remote task. `payload` is the desktop
 *  event (log/stage/status/progress/result/error) as-is, replayed on the phone. */
export interface RemoteTaskEventItem {
  id: string;
  kind: 'log' | 'stage' | 'status' | 'progress' | 'result' | 'error';
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface RemoteTask {
  id: string;
  deviceId: string | null;
  runner: RunnerId;
  model: string | null;
  prompt: string;
  status: RemoteTaskStatus;
  /** Final assistant narration when done. */
  result: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  /** Present on the detail endpoint — full event history for replay. */
  events?: RemoteTaskEventItem[];
  /** Present on list endpoints — the device that ran/will run it. */
  device?: { id: string; name: string } | null;
  /** The named conversation this task belongs to (null = default/unfiled). */
  conversationId?: string | null;
}

/** A named conversation on "Máy của tôi" (groups RemoteTasks into a switchable thread). */
export interface AgentConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** Number of tasks filed under it (list endpoint). */
  taskCount?: number;
}

/** `POST /v1/agent/tasks` (phone JWT) + `POST /v1/agent/webhook` (external Apikey) body. */
export interface CreateRemoteTaskRequest {
  prompt: string;
  /** CLI runner id (default 'claude'). */
  runner?: RunnerId;
  /** Model id within the runner (default = the runner's first model). */
  model?: string;
  /** Target a specific device; default = the user's most-recently-seen online device. */
  deviceId?: string;
  /** File this task under a named conversation (default = unfiled). */
  conversationId?: string;
}

export interface CreateRemoteTaskResponse {
  task: RemoteTask;
  /** False when no device is currently online — the task stays queued until one connects. */
  deviceOnline: boolean;
}

/** `POST /v1/agent/tasks/:id/events` (desktop → server) body. */
export interface PostRemoteTaskEvent {
  kind: RemoteTaskEventItem['kind'];
  payload: Record<string, unknown>;
}

/** A command pushed over the desktop's `agent:{userId}` SSE command stream. */
export type AgentCommand =
  | { type: 'task'; task: RemoteTask }
  | { type: 'cancel'; taskId: string }
  | { type: 'ping' }
  /** Phone asked this desktop to (re)login its Lark web session: the desktop opens the Lark login
   *  window, streams the QR image up (larkQr events), and the user scans it with the Lark app. */
  | { type: 'larkLogin'; requestId: string }
  /** Phone/web asked this desktop to RUN the CMS Bitable sync for one or more jobs using its LIVE
   *  Lark session (Approach B). The desktop runs them sequentially + streams cmsSync events back. */
  | { type: 'cmsSyncRun'; requestId: string; jobIds: string[] }
  /** Phone/web asked this desktop to RUN one CHAT turn (Trợ lý AI or Lark) through its local Claude
   *  CLI. The desktop drives larkService.chat and streams larkChat events back; a gated write emits a
   *  tool_call the phone confirms via larkChatConfirm, and an ask_user is answered via larkChatAnswer. */
  | { type: 'larkChatRun'; requestId: string; input: LarkChatRelayInput }
  /** Phone/web answered a pending write-confirmation for the running relay chat turn. */
  | { type: 'larkChatConfirm'; requestId: string; callId: string; decision: 'allow' | 'deny' }
  /** Phone/web answered a pending ask_user for the running relay chat turn. */
  | { type: 'larkChatAnswer'; requestId: string; callId: string; answer: string }
  /** Phone/web asked to STOP the running relay chat turn. */
  | { type: 'larkChatCancel'; requestId: string }
  /** Web asked the desktop to run ONE allow-listed Lark runtime method (larkStatus, larkListBases,
   *  larkSessions, …) and return its result — so the shared LarkChat screen works over the relay.
   *  The desktop enforces the method allow-list; the result comes back as `larkRpcResult`. */
  | { type: 'larkRpc'; requestId: string; method: string; args: unknown[] };

/** The serializable chat input carried over the relay (a subset of the desktop's LarkChatInput —
 *  no file handles: attachments aren't relayed in this phase). */
export interface LarkChatRelayInput {
  prompt: string;
  /** 'ask' = read-only Q&A; 'build' = writes allowed (each write still confirmed on the phone). */
  mode: 'ask' | 'build';
  /** 'general' = the standalone Trợ lý AI (no Lark); omit for a Lark-connected chat. */
  scope?: 'general';
  /** Bases applied to this Lark turn (human name + app_token), so the desktop scopes tools. */
  activeBases?: { appToken: string; name: string }[];
  runner?: string;
  model?: string;
  /** Stable conversation id + whether to --resume it (general chat keeps its own id). */
  sessionId?: string;
  resume?: boolean;
}

/** Pushed to the user's MESSAGE SSE while a phone/web-initiated CHAT turn runs on the desktop.
 *  `event` is a @larkwave/core LarkChatEvent (kept opaque here to avoid a core dependency; the web
 *  casts it) — text deltas, tool_call/tool_result, ask_user, error, usage, done. */
export interface LarkChatStreamEvent {
  type: 'larkChatEvent';
  requestId: string;
  event: Record<string, unknown>;
}

/** Result of a `larkRpc` command, pushed back to the web's MESSAGE SSE. `result` is the runtime
 *  method's return value (JSON-serializable); `error` is set when it threw or was not allow-listed. */
export interface LarkRpcResultEvent {
  type: 'larkRpcResult';
  requestId: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

// ── AgentChat ("Trợ lý AI") history sync — desktop ↔ server ↔ web ────────────

/** One conversation's META in the synced index. Mirrors the desktop AgentChat `ConvMeta`.
 *  `updatedAt` is the client ms timestamp used as the merge key (newest wins). */
export interface AgentChatConvMeta {
  id: string;
  title: string;
  sessionId: string;
  updatedAt: number;
  projectId?: string;
  pinned?: boolean;
}

/** A ChatGPT-style "Project" (folder). */
export interface AgentChatProjectMeta {
  id: string;
  name: string;
}

/** `GET /agent/chat/index` — the user's conversation META + projects (bodies fetched per-id). */
export interface AgentChatIndex {
  conversations: AgentChatConvMeta[];
  projects: AgentChatProjectMeta[];
}

/** Pushed to the user's MESSAGE SSE while a phone-initiated Lark re-login runs: the QR to scan +
 *  the outcome. The phone renders `image` (a data URL) until `status` becomes success/failed. */
export interface LarkQrStreamEvent {
  type: 'larkQr';
  requestId: string;
  status: 'qr' | 'success' | 'failed' | 'timeout';
  /** data:image/png;base64,… screenshot of the Lark login window (present while status==='qr'). */
  image?: string;
  message?: string;
}

/** Pushed to the user's MESSAGE SSE while a phone/web-initiated CMS Bitable sync runs on the
 *  desktop: live per-job progress, then a final tally. */
export interface CmsSyncStreamEvent {
  type: 'cmsSync';
  requestId: string;
  /** 'progress' before each job runs; 'done' when the whole batch finished. */
  kind: 'progress' | 'done';
  /** progress: 0-based index of the job about to run + total + its name. */
  done?: number;
  total?: number;
  name?: string;
  /** done: how many jobs succeeded / failed + a per-job result line each. */
  ok?: number;
  failed?: number;
  lines?: string[];
}

/** Payload pushed to the user's MESSAGE SSE so the phone thread updates live.
 *  Rides the same `streamMessages` channel the web already holds open. */
export interface RemoteTaskStreamEvent {
  type: 'remoteTask';
  taskId: string;
  status: RemoteTaskStatus;
  /** The event that just occurred (absent on a pure status transition). */
  event?: RemoteTaskEventItem;
  /** Set on terminal transitions. */
  result?: string | null;
  error?: string | null;
}

/** `POST /v1/agent/token` — (re)generate the per-user webhook token (returned once). */
export interface AgentTokenResponse {
  /** The raw token — returned ONCE on create; never retrievable again. */
  token: string;
  id?: string;
  name?: string;
}

/** A named webhook token as shown to the user (never the raw token again). */
export interface AgentWebhookTokenInfo {
  id: string;
  name: string;
  /** First few chars for recognition, e.g. "twa_1a2b3c…". */
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  /** OUTBOUND notify target for tasks triggered by this token (F4). */
  notifyLarkWebhookUrl?: string | null;
  notifyTelegramChatId?: string | null;
}

/** Result of `POST /v1/agent/tokens/:id/test` — is the token usable + a device ready. */
export interface TokenTestResult {
  tokenValid: boolean;
  deviceOnline: boolean;
  deviceName?: string | null;
  /** How many seconds ago the device was last seen (null if never / no device). */
  lastSeenSec?: number | null;
}

/** Update a token's outbound notify target (either field omitted = leave unchanged;
 *  empty string = clear). */
export interface UpdateTokenNotifyInput {
  notifyLarkWebhookUrl?: string | null;
  notifyTelegramChatId?: string | null;
}

/** A Telegram chat bound to the user (messages there trigger a remote-run task). */
export interface TelegramBindingInfo {
  id: string;
  chatId: string;
  chatTitle: string | null;
  createdAt: string;
}

/** Admin-page status for the platform Telegram bot (never the raw token). */
export interface TelegramAdminStatus {
  configured: boolean;
  source: "admin" | "env" | null;
  botUsername: string | null;
  tokenLast4: string | null;
  webhookUrl: string;
}

/** `POST /v1/agent/telegram/link` — a one-time bind code + deep link. */
export interface TelegramLinkResponse {
  /** The code to send the bot as `/start <code>`. */
  code: string;
  /** `https://t.me/<bot>?start=<code>` when the bot username is known, else null. */
  deepLink: string | null;
  /** False when the server has no TELEGRAM_BOT_TOKEN configured yet. */
  botConfigured: boolean;
  /** The bot @username when known. */
  botUsername?: string | null;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  usd: number;
}

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  target: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// API request/response DTOs
// ─────────────────────────────────────────────────────────────────────────────

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}
export interface LoginRequest {
  email: string;
  password: string;
}
export interface AuthResponse {
  token: string;
  expiresIn: number;
  user: User;
}

/** Admin impersonation: a session token + the impersonated user (POST /v1/users/:id/impersonate). */
export interface ImpersonateResponse {
  token: string;
  user: User;
}

/** A file attached to a chat / feedback report (image, code, spec, PDF…). */
export interface UploadRef {
  id: string;
  name: string;
  /** `image` → vision, `pdf` → native document block, `text` → extracted/raw text. */
  kind: "image" | "text" | "pdf";
  mime: string;
  size: number;
}

/**
 * Full stored content of an upload (`GET /v1/uploads/:id`) — the ref plus its
 * `data`: base64 for image/pdf, raw text for text. Used to preview an attachment.
 */
export interface UploadContent extends UploadRef {
  data: string;
}

/**
 * One row in "Tệp đã tải lên" (`GET /v1/uploads`) — metadata only, never the bytes.
 *
 * `expired` is what a purged file looks like from outside: the row survives as a tombstone so an
 * old conversation can say the file was REMOVED (and when), instead of the indistinguishable
 * "not found" it would get if the row were deleted outright.
 */
export interface UploadListItem extends UploadRef {
  /** ISO timestamps. `expiresAt` is derived (createdAt + the retention window), not stored. */
  createdAt: string;
  /**
   * NULL khi tệp KHÔNG nằm trong diện tự dọn (ảnh báo lỗi, ảnh nguồn marketing…).
   *
   * Trước đây trường này luôn có giá trị vì được suy ra vô điều kiện từ `createdAt + 30 ngày`,
   * nên giao diện hiện một NGÀY XOÁ KHÔNG BAO GIỜ ĐẾN cho những tệp giữ vĩnh viễn — người dùng
   * ngồi chờ dung lượng tự giảm mà nó không bao giờ giảm.
   */
  expiresAt: string | null;
  /** True once the retention job has deleted the bytes; name/size remain. */
  expired: boolean;
  /** False when there is nothing to hand back — expired, or uploaded before originals were kept. */
  downloadable: boolean;
}

/** `GET /v1/uploads` — one page, newest first. */
export interface UploadListPage {
  items: UploadListItem[];
  nextCursor: string | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// "Me" — current-user profile stats & contribution activity graph
// ─────────────────────────────────────────────────────────────────────────────

/** `GET /v1/me/overview` — profile counters scoped to the logged-in user. */
export interface MeOverview {
  /** Metered hosted-AI runs (help assistant, Trợ lý AI, hosted Lark turns). */
  aiRuns: number;
  /** Tasks run on the user's desktop from the phone/web/webhook/Telegram. */
  remoteTasks: number;
  artifacts: number;
  skills: number;
  scheduledTasks: number;
  /** Bug reports the user submitted. */
  reports: number;
  /** ISO timestamp the user account was created. */
  joinedAt: string;
}

/** One cell of the contribution graph: a calendar day and its AI-activity count. */
export interface ActivityDay {
  /** `YYYY-MM-DD` (UTC). */
  date: string;
  count: number;
}

/** `GET /v1/me/activity?days=N` — GitHub-style contribution graph data. */
export interface MeActivity {
  /** sum of all `days[].count` in the window. */
  total: number;
  /** consecutive days ending today (UTC) with count > 0. */
  currentStreak: number;
  /** longest consecutive run of count > 0 days in the window. */
  longestStreak: number;
  /** one entry per day across the whole window, zeros filled, ascending by date. */
  days: ActivityDay[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Billing — subscription plans & monthly usage budget
// ─────────────────────────────────────────────────────────────────────────────

export type PlanId = 'free' | 'starter' | 'pro' | 'enterprise';
export const PLAN_IDS: readonly PlanId[] = ['free', 'starter', 'pro', 'enterprise'] as const;

// ─── Promotional discount campaign (e.g. "-50% có thời hạn") ───────────────────

/** A resolved discount campaign. `percent` 0 = no campaign; `until` = ISO expiry. */
export interface DiscountInfo {
  /** 0–90. The percentage off all paid plans while active. */
  percent: number;
  /** ISO deadline; null = no expiry. The campaign is active until this time. */
  until: string | null;
  /** Optional short campaign label (e.g. "Ưu đãi ra mắt"). */
  label?: string | null;
}

/** Is a discount campaign currently active (percent > 0 and not past `until`)? */
export function discountActive(d: DiscountInfo | null | undefined, nowMs: number): boolean {
  if (!d || !(d.percent > 0)) return false;
  if (!d.until) return true;
  const end = Date.parse(d.until);
  return Number.isNaN(end) ? true : end > nowMs;
}

/** Price after applying `percent` off, rounded to the nearest 1,000 VND. */
export function discountedVnd(priceVnd: number, percent: number): number {
  if (!(priceVnd > 0) || !(percent > 0)) return priceVnd;
  const raw = (priceVnd * (100 - percent)) / 100;
  return Math.max(0, Math.round(raw / 1000) * 1000);
}

/**
 * Billing unit. A plan grants a MONTHLY TOKEN BUDGET (`monthlyTokens`); each hosted
 * AI run meters its REAL token usage against it. Users only ever see a PERCENT
 * (used ÷ budget). The token numbers are internal / admin-tunable; never surface raw
 * tokens to end users.
 */
export function usagePercent(tokensUsed: number, monthlyTokens: number): number {
  if (!(monthlyTokens > 0)) return 0;
  return Math.min(100, Math.round((tokensUsed / monthlyTokens) * 100));
}

/** One entry of the plan catalog (mirrors `src/billing/plans.ts` on the API). */
export interface PlanCatalogEntry {
  id: PlanId;
  /** Vietnamese display label. */
  label: string;
  priceVnd: number;
  /** Discounted price when a campaign is active (else null). What you actually pay. */
  discountedVnd?: number | null;
  /** Monthly TOKEN budget = 100% of the plan. Hosted AI runs meter real token usage
   *  against it; users see only the resulting percent. Internal/admin-tunable. */
  monthlyTokens: number;
  /** @deprecated legacy credit allowance — superseded by monthlyTokens. */
  credits?: number;
  /**
   * Dung lượng lưu trữ ĐƯỢC TẶNG theo gói, tính bằng MB.
   *
   * Tách hẳn khỏi `monthlyTokens`: hạn mức token là thứ tiêu đi rồi hết mỗi tháng, còn dung
   * lượng là thứ TÍCH LUỸ — tệp tải lên nằm đó cho tới khi người dùng xoá. Gộp hai
   * thứ vào một con số sẽ khiến người dùng hết hạn mức chỉ vì tháng trước lưu nhiều tệp.
   * Mua thêm được, cộng vào `User.storageBonusMb`.
   */
  storageMb: number;
  /** Short Vietnamese feature bullets. */
  features: string[];
}

/** `GET /v1/me/subscription` — current plan, monthly usage (%) & the full catalog. */
export interface MeSubscription {
  plan: PlanId;
  planLabel: string;
  /** Percent of the monthly plan used this month (0–100). The user-facing number. */
  percentUsed: number;
  /** Raw tokens metered this month (internal/debug; not shown to users as a number). */
  tokensUsed: number;
  /** Monthly token budget = 100% of the plan (internal/admin). */
  tokensLimit: number;
  /** ISO timestamp when the monthly usage resets (null until first metered run). */
  resetAt: string | null;
  /** true for admins — usage is never enforced. */
  unlimited: boolean;
  /** Whether the free plan is currently usable (admin-toggled). */
  freePlanEnabled: boolean;
  /** Active promotional discount campaign (drives the pricing banner + countdown). */
  discount?: DiscountInfo | null;
  catalog: PlanCatalogEntry[];
  /**
   * Prorated price to upgrade to each HIGHER-tier plan RIGHT NOW, keyed by plan
   * id. Present only while on an active PAID plan; lets /pricing show the reduced
   * upgrade cost (= price difference scaled by remaining cycle time).
   */
  upgrade?: Record<string, UpgradeQuote>;
}

/** Server-computed prorated upgrade price for one target plan (see MeSubscription.upgrade). */
export interface UpgradeQuote {
  /** Amount to pay now for the upgrade (VND, prorated by the remaining cycle). */
  amountVnd: number;
  /** Full monthly price of the target plan (for a strike-through reference). */
  fullVnd: number;
  /** How much cheaper than the full price (fullVnd − amountVnd). */
  savingVnd: number;
}

/** Error body thrown (HTTP 402) when the user has used 100% of their monthly plan. */
export interface InsufficientCreditsError {
  message: string;
  /** Kept as the historical code; web treats QUOTA_EXCEEDED identically. */
  code: 'INSUFFICIENT_CREDITS' | 'QUOTA_EXCEEDED';
  plan: PlanId;
  /** Percent of the monthly plan already used (≈100 when blocked). */
  percentUsed: number;
}

// ─── SePay bank-transfer payments ─────────────────────────────────────────────

export type PaymentStatus = 'pending' | 'paid';

/** A bank-transfer payment intent (one row of `/v1/me/payments`). */
export interface Payment {
  id: string;
  plan: PlanId;
  planLabel: string;
  amountVnd: number;
  status: PaymentStatus;
  /** Unique memo code the user must include in the transfer (e.g. `TWA1B2C3`). */
  code: string;
  createdAt: string;
  paidAt: string | null;
}

/** Admin view of a payment — includes the owning user (for reconciliation). */
export interface AdminPayment extends Payment {
  userId: string;
  userEmail: string;
  userName: string | null;
}

/** `POST /v1/payments/create` — bank + QR details to complete the transfer. */
export interface CreatePaymentResponse {
  paymentId: string;
  /** Internal payment code (TWxxxxxx) used for matching the incoming transfer. */
  code: string;
  /**
   * The exact memo the user must put on the transfer. Equals `code` for most
   * banks, but is prefixed with `SEVQR ` for VietinBank (SePay only forwards
   * VietinBank balance-change events when the memo starts with that keyword).
   * The QR encodes this, and the UI shows this — not the bare code.
   */
  transferContent: string;
  amountVnd: number;
  plan: PlanId;
  planLabel: string;
  bank: {
    bin: string;
    account: string;
    holder: string;
    name: string;
  };
  /** Pre-rendered VietQR image URL (img.vietqr.io). */
  qrUrl: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin reports — `GET /v1/admin/reports?period=all|30d|7d|today`
// ─────────────────────────────────────────────────────────────────────────────

export type ReportPeriod = 'all' | '30d' | '7d' | 'today';
export const REPORT_PERIODS: readonly ReportPeriod[] = ['all', '30d', '7d', 'today'] as const;

/** AI-cost breakdown for one usage kind (a single bucket of `AdminReport.byKind`). */
export interface UsageCostBucket {
  runs: number;
  usd: number;
  tokens: number;
}

/** Profit & cost dashboard for the admin CMS. AI cost = metered MAIC usage. */
export interface AdminReport {
  period: ReportPeriod;
  apiCost: {
    totalUsd: number;
    tokens: number;
    /** Metered AI runs in the period. */
    runs: number;
  };
  /** Keyed by MaicUsage.kind ('ask' | 'run' | 'lark' …). */
  byKind: Record<string, UsageCostBucket>;
  revenue: {
    paidCount: number;
    totalVnd: number;
    byPlan: Record<Exclude<PlanId, 'free'>, { count: number; vnd: number }>;
  };
  profit: {
    revenueVnd: number;
    revenueUsd: number;
    apiCostUsd: number;
    profitUsd: number;
    profitVnd: number;
    /** profitUsd / revenueUsd * 100 (0 when no revenue). */
    marginPct: number;
  };
  users: {
    total: number;
    byPlan: Record<PlanId, number>;
  };
  /** Daily series for charting (capped ~90 points), ascending by date. */
  series: Array<{ date: string; revenueVnd: number; apiCostUsd: number }>;
}

/** One aggregate row (by kind or by user) in the Claude/MAIC usage report. */
export interface ClaudeUsageRow {
  requests: number;
  tokens: number;
  costUsd: number;
}

/** Hosted-Claude (MAIC) usage & gateway-health report for the admin console. Aggregates the
 *  `MaicUsage` table (hosted "Trợ lý AI" chat = kind `ask`, scheduled tasks = kind `scheduled`) —
 *  the spend that the profit report (`AdminReport`, codegen builds only) does NOT cover. */
export interface ClaudeReport {
  period: ReportPeriod;
  /** Live MAIC gateway health (the shared token's global pool), or disabled/unreachable. */
  gateway: {
    enabled: boolean;
    reachable: boolean;
    available?: boolean;
    state?: string;
    mode?: string;
    message?: string;
    rateLimit?: { status?: string; type?: string; resetsAt?: string; isUsingOverage?: boolean };
  };
  totals: ClaudeUsageRow & { users: number };
  byKind: Array<ClaudeUsageRow & { kind: string }>;
  topUsers: Array<ClaudeUsageRow & { userId: string; name: string; email: string; plan: string }>;
  /** Daily series (ascending by date, capped ~90 points). */
  series: Array<{ date: string; requests: number; tokens: number; costUsd: number }>;
  /** MAIC surfaces that call the gateway but are NOT recorded in MaicUsage (coverage caveat). */
  unmeteredSurfaces: string[];
}

/** Per-account Claude DATA volume (state, all-time) for admin management — separate from usage. */
export interface ClaudeDataOverview {
  totals: { usersWithData: number; conversations: number; projects: number };
  /** Top accounts by conversation count. */
  byUser: Array<{
    userId: string;
    name: string;
    email: string;
    plan: string;
    conversations: number;
    projects: number;
    /** ISO of the most recent conversation activity (from clientTs), or null. */
    lastActivityAt: string | null;
  }>;
}

/** One account's Claude data, for the admin drill-down (view + delete). */
export interface ClaudeUserData {
  userId: string;
  name: string;
  email: string;
  plan: string;
  conversations: Array<{
    id: string;
    title: string;
    projectId?: string;
    projectName?: string;
    pinned: boolean;
    messages: number;
    updatedAt: string;
  }>;
  projects: Array<{ id: string; name: string; instructions: string; conversations: number }>;
}

/** A PUBLIC, read-only shared conversation transcript (/s/<slug>). */
export interface PublicChatConv {
  title: string;
  author: string;
  updatedAt: string;
  messages: Array<{ role: "user" | "assistant"; text: string }>;
}

/** One of the current user's public assistant links (/g/<slug>). */
export interface AssistantShareInfo {
  id: string;
  slug: string;
  label: string;
  enabled: boolean;
  projectId?: string;
  turnsPerDay: number;
  usesTotal: number;
  lastUsedAt: string | null;
  createdAt: string;
}

/** PUBLIC metadata for a public assistant link (shown on /g/<slug>). */
export interface PublicAssistantInfo {
  slug: string;
  label: string;
  owner: string;
  enabled: boolean;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  version: string;
  uptime: number;
  checks: {
    database: boolean;
    anthropic: boolean;
    /** Hosted Claude gateway configured (MAIC_URL + MAIC_TOKEN). */
    maic: boolean;
  };
}

export interface ApiError {
  statusCode: number;
  error: string;
  message: string | string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Platform configuration (single editable row, managed from the admin CMS)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runtime-editable billing configuration. Lives inside the singleton
 * `Setting.config` JSON so prices/budgets can change WITHOUT a
 * redeploy. Every field is optional: the API merges what's stored over the
 * hardcoded defaults in `src/billing/plans.ts`, so an absent
 * section leaves behaviour identical to the compiled-in catalog.
 */
export interface BillingPlanOverride {
  priceVnd?: number;
  /** Monthly TOKEN budget (= 100% of the plan). Admin-tunable. */
  monthlyTokens?: number;
  /** @deprecated legacy credit allowance. */
  credits?: number;
}
export interface BillingConfig {
  /** VND per 1 USD, used to convert revenue (VND) ↔ API cost (USD). Default 25000. */
  vndPerUsd?: number;
  /** Per-plan price / token-budget overrides. */
  plans?: Partial<Record<PlanId, BillingPlanOverride>>;
  /**
   * Whether the free plan can actually be USED. Default true. When false,
   * free-plan users are blocked from hosted AI runs (must upgrade) and the
   * free tier is shown as paused on /pricing. Admins are never affected.
   */
  freePlanEnabled?: boolean;
  /**
   * Promotional discount campaign: `percent` off all PAID plans until `until`
   * (ISO). What the user actually pays (and the SePay-matched amount) becomes the
   * discounted price. Absent / percent 0 = no campaign.
   */
  discount?: { percent?: number; until?: string | null; label?: string | null };
}

/** Fully-resolved billing config (defaults merged with stored overrides). */
export interface ResolvedBillingConfig {
  vndPerUsd: number;
  plans: Record<PlanId, Required<BillingPlanOverride>>;
  /** Whether the free plan is usable (default true). */
  freePlanEnabled: boolean;
  /** Resolved discount campaign (percent 0 = none). */
  discount: DiscountInfo;
}

/** The singleton `Setting.config` JSON — runtime-editable platform settings. */
export interface PlatformConfig {
  version: string;
  /** Runtime-editable pricing/token budgets (merged over plans.ts defaults). */
  billing?: BillingConfig;
}

export const DEFAULT_CONFIG: PlatformConfig = { version: '1.0.0' };

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Convert arbitrary (incl. Vietnamese) text to a URL-safe slug. */
export function slugify(input: string): string {
  return (
    input
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/g, '') || 'app'
  );
}

export const API_PREFIX = 'v1';


/**
 * `POST /v1/admin/users/:id/message` — người vận hành tự soạn một tin nhắn gửi cho MỘT người dùng.
 *
 * Vì sao có: nền tảng có người dùng thật nhưng không có đường nào nói với họ khi xảy ra sự cố.
 * Mọi thông báo trong hệ đều là tự động (tặng gói, tin nhắn bạn bè) và không có màn nào soạn thư.
 * Đo ngày 24/09/2026: một người dùng mất bốn site vì lỗi của hệ thống, sửa xong rồi mà không có
 * cách nào báo cho họ.
 *
 * `body` là VĂN BẢN THUẦN. Máy chủ escape rồi mới đặt vào khung HTML của thư — người soạn gõ dấu
 * `<` không được phép làm vỡ thư, và HTML dán nhầm vào không được phép thành thẻ thật.
 *
 * KHÔNG có trường "gửi tới": địa chỉ luôn đọc từ CSDL theo id người dùng. Nhận địa chỉ từ đầu vào
 * là biến hệ thống thành relay mở cho bất kỳ phiên admin nào bị chiếm.
 */
export interface AdminMessageUserBody {
  subject: string;
  body: string;
  /** Gửi email (bỏ qua nếu SMTP chưa cấu hình — kết quả nói rõ). */
  email: boolean;
  /** Đặt một thông báo trong app. */
  inApp: boolean;
  /** Đường dẫn NỘI BỘ để thông báo và nút trong thư trỏ tới, ví dụ `/apps`. */
  link?: string;
}

/** Kết quả thật của một lần gửi — nói rõ cái gì đã tới nơi, cái gì không. */
export interface AdminMessageUserResult {
  /** Địa chỉ đã gửi tới (đọc từ CSDL). */
  to: string;
  /** SMTP có được cấu hình trên máy chủ này không. */
  emailConfigured: boolean;
  /** Thư đã gửi đi thật chưa. */
  emailSent: boolean;
  /** Thông báo trong app đã được tạo chưa. */
  notified: boolean;
  /**
   * Thông báo trong app có bị cắt bớt không.
   *
   * `NotificationsService.notify` cắt thân còn 1000 ký tự và không báo gì. Thư thì không bị cắt,
   * nên một bức dài gửi cả hai kênh sẽ đến nơi theo hai hình dạng khác nhau — người vận hành
   * cần biết điều đó thay vì đoán.
   */
  notifiedTruncated: boolean;
}
