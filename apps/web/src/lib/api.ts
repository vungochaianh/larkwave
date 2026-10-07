import type { AgentDevice, AgentTokenResponse, AssistantChatRequest, AssistantChatResponse, AdminPayment, AdminReport, ClaudeReport, ClaudeDataOverview, ClaudeUserData, PublicChatConv, PublicAssistantInfo, AuditLogEntry, AuthResponse, BillingConfig, ChatMessage, Conversation, CreateRemoteTaskRequest, CreateRemoteTaskResponse, DiscoverUser, Feedback, SubmitFeedbackRequest, MyFeedbackResponse, AdminUpdateFeedbackRequest, FeedbackSimilar, AppNotification, NotificationsResponse, CreatePaymentResponse, Friend, FriendRequest, AdminMessageUserBody, AdminMessageUserResult, ImpersonateResponse, HealthResponse, LoginRequest, MeActivity, MeOverview, MeSubscription, InsufficientCreditsError, Paginated, Payment, PlanId, RegisterRequest, RemoteTask, RemoteTaskStreamEvent, AgentConversation, LarkQrStreamEvent, CmsSyncStreamEvent, LarkChatStreamEvent, LarkChatRelayInput, LarkRpcResultEvent, TelegramAdminStatus, ReportPeriod, UploadContent, UploadRef, ResolvedBillingConfig, Role, User, UserStatus } from "@larkwave/shared";

/** A saved Artifact (`/artifacts`, public at `/a/<slug>`). Not part of the shared package. */
export interface Artifact {
  id: string;
  title: string;
  kind: string;
  language: string;
  content: string;
  visibility: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}
export interface PublicArtifact {
  title: string;
  kind: string;
  language: string;
  content: string;
  updatedAt: string;
}

export interface ScheduledTask {
  id: string;
  name: string;
  prompt: string;
  cron: string;
  timezone: string;
  enabled: boolean;
  deliver: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastResult: string | null;
  lastError: string | null;
  runCount: number;
  createdAt: string;
}

// ── In-workspace database admin (full-stack apps) ──────────────────────────

/** Provider + agent-logic status for the admin AI page (no raw keys). */
export interface AiKeyMask {
  set: boolean;
  source: "admin" | "env" | null;
  last4: string | null;
  /** Short SHA-256 fingerprint (hashcode) to verify the key without exposing it. */
  hash: string | null;
}
export interface AiStatus {
  providers: { id: string; label: string; enabled: boolean; role: string }[];
  keys: { anthropic: AiKeyMask; openai: AiKeyMask; grok: AiKeyMask };
  defaultTier: string;
  auxModel: string;
  autoRouter: boolean;
}

/** Admin support drill-down counts for one user (GET /users/:id/support-summary). */
export interface AdminUserSupportSummary {
  aiRuns: number;
  remoteTasks: number;
  failedRemoteTasks: number;
  payments: number;
  feedback: number;
  lastActivityAt: string | null;
}

/** Một lỗi runner người dùng gặp (CLI trên máy / Gói Larkwave), do giao diện báo về. */
export interface RunnerErrorRow {
  id: string;
  userId: string;
  email: string;
  runner: string;
  model: string | null;
  kind: string;
  surface: string;
  message: string;
  createdAt: string;
}
export interface RunnerErrorReport {
  days: number;
  total: number;
  byKind: { kind: string; count: number }[];
  topUsers: { userId: string; email: string; count: number }[];
  distinctUsers: number;
  items: RunnerErrorRow[];
}


/** Tác giả một bài đăng / bình luận trong Cộng đồng. */
export interface CommunityAuthor {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/** Một tệp đính kèm của bài Cộng đồng. `mime` quyết định hiện thành ảnh hay thẻ tải về. */
export interface CommunityAttachment {
  url: string;
  name: string;
  mime: string;
  size: number;
}

export interface CommunityPost {
  id: string;
  author: CommunityAuthor;
  content: string;
  attachments: CommunityAttachment[];
  createdAt: string;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  canDelete: boolean;
}

export interface CommunityComment {
  id: string;
  author: CommunityAuthor;
  content: string;
  createdAt: string;
  canDelete: boolean;
  /** Bình luận cha; null = bình luận gốc. Máy chủ chỉ cho MỘT cấp, giao diện gom cây từ đây. */
  parentId: string | null;
}

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "https://api.toolswave.net/v1";

/**
 * The API origin including the version prefix, used for full-page navigations
 * that the browser must perform itself (e.g. the Google OAuth redirect at
 * `${API_ORIGIN}/auth/google`). Same value as API_BASE, exposed under a clearer
 * name for browser-driven flows.
 */
export const API_ORIGIN = API_BASE;

/**
 * The builder web origin (app.toolswave.net). Used by the admin site
 * (aapp.toolswave.net) to hand off an impersonation token to the builder via
 * `${APP_BASE_URL}/auth/callback?token=…`. Overridable for non-prod.
 */
export const APP_BASE_URL =
  process.env.NEXT_PUBLIC_APP_BASE ?? "https://toolswave.net";

export const TOKEN_KEY = "tw_token";

/**
 * Read the JWT (client only). sessionStorage is checked FIRST so an admin
 * impersonation session (stored per-tab in sessionStorage) is isolated from the
 * persistent localStorage session — multiple tabs / the admin's own login never
 * collide, and every page in the tab uses the same impersonated identity.
 */
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(TOKEN_KEY) ?? window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  statusCode: number;
  /**
   * Parsed JSON response body (when the server returned one). Lets callers
   * read structured error payloads — e.g. the 402 QUOTA_EXCEEDED body
   * `{ code, message, plan, quotaUsed, limit }`.
   */
  body: unknown;
  constructor(message: string, statusCode: number, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.body = body;
  }
}

/**
 * Narrow an unknown error to the 402 INSUFFICIENT_CREDITS payload thrown when
 * the user has run out of monthly credits. Returns the typed body or null.
 */
export function asInsufficientCredits(err: unknown): InsufficientCreditsError | null {
  if (!(err instanceof ApiError) || err.statusCode !== 402) return null;
  const body = err.body;
  if (
    body &&
    typeof body === "object" &&
    (body as { code?: string }).code === "INSUFFICIENT_CREDITS"
  ) {
    return body as InsufficientCreditsError;
  }
  return null;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Override / disable auth header. */
  token?: string | null;
  signal?: AbortSignal;
}

function buildUrl(
  path: string,
  query?: RequestOptions["query"],
): string {
  const url = new URL(
    `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`,
  );
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, String(v));
      }
    }
  }
  return url.toString();
}

/** Typed fetch wrapper: injects Bearer token, parses JSON, throws on !ok. */
export async function apiFetch<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const token = opts.token === undefined ? getToken() : opts.token;
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(buildUrl(path, opts.query), {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
    cache: "no-store",
  });

  const text = await res.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const message = extractError(data) ?? res.statusText ?? "Có lỗi xảy ra";
    throw new ApiError(message, res.status, data);
  }

  return data as T;
}

function extractError(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return typeof data === "string" && data ? data : null;
  }
  const obj = data as { message?: string | string[]; error?: string };
  if (Array.isArray(obj.message)) return obj.message.join(", ");
  if (typeof obj.message === "string") return obj.message;
  if (typeof obj.error === "string") return obj.error;
  return null;
}

/** Subscribe to the current user's live chat SSE stream. Returns an abort fn. */
export function streamMessages(
  onEvent: (event: { type: string; message?: ChatMessage }) => void,
  options: { onError?: (err: Error) => void; onClose?: () => void } = {},
): () => void {
  const controller = new AbortController();
  const token = getToken();
  (async () => {
    try {
      const res = await fetch(buildUrl("/messages/stream"), {
        method: "GET",
        headers: {
          Accept: "text/event-stream",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
        cache: "no-store",
      });
      if (!res.ok || !res.body) {
        throw new ApiError("Không kết nối được luồng chat", res.status);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          for (const rawLine of chunk.split("\n")) {
            const line = rawLine.trimEnd();
            if (!line.startsWith("data:")) continue;
            const json = line.slice(5).trim();
            if (!json) continue;
            const parsed = safeParse(json);
            if (parsed) onEvent(parsed as { type: string; message?: ChatMessage });
          }
        }
      }
      options.onClose?.();
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      options.onError?.(err as Error);
    }
  })();
  return () => controller.abort();
}

/**
 * Subscribe to the user's live REMOTE-TASK progress. Opens its own message-SSE
 * subscription (the server supports multiple per-user listeners) and forwards
 * only `{ type: 'remoteTask' }` payloads (RemoteTaskStreamEvent) — so the agent
 * page gets task updates without re-parsing chat messages. Returns an abort fn.
 */
export function streamRemoteTasks(
  onEvent: (event: RemoteTaskStreamEvent) => void,
  options: { onError?: (err: Error) => void; onClose?: () => void } = {},
): () => void {
  return streamMessages(
    (ev) => {
      if ((ev as { type?: string }).type === "remoteTask") {
        onEvent(ev as unknown as RemoteTaskStreamEvent);
      }
    },
    options,
  );
}

/** Subscribe to the phone-initiated Lark re-login QR/outcome (`{ type: 'larkQr' }`). */
export function streamLarkQr(
  onEvent: (event: LarkQrStreamEvent) => void,
  options: { onError?: (err: Error) => void; onClose?: () => void } = {},
): () => void {
  return streamMessages(
    (ev) => {
      if ((ev as { type?: string }).type === "larkQr") {
        onEvent(ev as unknown as LarkQrStreamEvent);
      }
    },
    options,
  );
}

/** Subscribe to a phone/web-initiated CMS Bitable sync running on the desktop (`{ type: 'cmsSync' }`). */
export function streamCmsSync(
  onEvent: (event: CmsSyncStreamEvent) => void,
  options: { onError?: (err: Error) => void; onClose?: () => void } = {},
): () => void {
  return streamMessages(
    (ev) => {
      if ((ev as { type?: string }).type === "cmsSync") {
        onEvent(ev as unknown as CmsSyncStreamEvent);
      }
    },
    options,
  );
}

/** Subscribe to a phone/web-initiated CHAT turn running on the desktop CLI (`{ type: 'larkChatEvent' }`).
 *  Optionally filter to a single requestId so parallel turns don't cross-talk. */
export function streamLarkChat(
  onEvent: (event: LarkChatStreamEvent) => void,
  options: { requestId?: string; onError?: (err: Error) => void; onClose?: () => void } = {},
): () => void {
  return streamMessages(
    (ev) => {
      const e = ev as unknown as LarkChatStreamEvent;
      if (e?.type !== "larkChatEvent") return;
      if (options.requestId && e.requestId !== options.requestId) return;
      onEvent(e);
    },
    options,
  );
}

/** Subscribe to Lark RPC results (`{ type: 'larkRpcResult' }`) — one shared stream demuxes by
 *  requestId in the relay runtime, so the shared LarkChat screen can call desktop Lark methods. */
export function streamLarkRpc(
  onEvent: (event: LarkRpcResultEvent) => void,
  options: { onError?: (err: Error) => void; onClose?: () => void } = {},
): () => void {
  return streamMessages((ev) => {
    const e = ev as unknown as LarkRpcResultEvent;
    if (e?.type === "larkRpcResult") onEvent(e);
  }, options);
}

/** A CMS Bitable connector job as the web list needs it (the backend returns more). */
export interface RemoteCmsJob {
  _id?: string;
  id?: string;
  name?: string;
  enabled?: boolean;
  syncMode?: string;
  intervalSeconds?: number;
  lastSyncAt?: string;
  lastSyncStatus?: string;
  lastSyncError?: string;
}

/**
 * Stream a help-assistant reply token-by-token (POST + fetch streaming, Bearer
 * auth). Calls `onDelta` per token, `onDone` with the final reassembled reply,
 * `onError` on failure. Returns an abort fn.
 */
export function streamAssistant(
  body: AssistantChatRequest,
  handlers: {
    onDelta?: (delta: string) => void;
    onDone?: (reply: string) => void;
    onError?: (err: Error) => void;
  } = {},
): () => void {
  const controller = new AbortController();
  const token = getToken();
  (async () => {
    try {
      const res = await fetch(buildUrl("/assistant/chat/stream"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
      });
      if (!res.ok || !res.body) {
        throw new ApiError("Không kết nối được trợ lý", res.status);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          for (const rawLine of chunk.split("\n")) {
            const line = rawLine.trimEnd();
            if (!line.startsWith("data:")) continue;
            const json = line.slice(5).trim();
            if (!json) continue;
            const ev = safeParse(json) as
              | { delta?: string; done?: boolean; reply?: string; error?: string }
              | null;
            if (!ev) continue;
            if (ev.error) handlers.onError?.(new Error(ev.error));
            else if (ev.done) handlers.onDone?.(ev.reply ?? "");
            else if (ev.delta) handlers.onDelta?.(ev.delta);
          }
        }
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      handlers.onError?.(err as Error);
    }
  })();
  return () => controller.abort();
}

/**
 * PUBLIC (anonymous) streaming turn against a chat-able assistant link (/g/<slug>). Token-by-token
 * SSE via fetch. Returns an abort fn. No auth — the turn is metered to the link OWNER server-side.
 */
export function streamPublicAssistant(
  slug: string,
  prompt: string,
  handlers: { onDelta?: (delta: string) => void; onDone?: () => void; onError?: (err: Error) => void } = {},
): () => void {
  const controller = new AbortController();
  (async () => {
    try {
      const res = await fetch(buildUrl(`/agent/public-assistant/s/${encodeURIComponent(slug)}/ask`), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ prompt }),
        signal: controller.signal,
        cache: "no-store",
      });
      if (!res.ok || !res.body) throw new ApiError("Không kết nối được trợ lý", res.status);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) >= 0) {
          const chunk = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          for (const rawLine of chunk.split("\n")) {
            const line = rawLine.trimEnd();
            if (!line.startsWith("data:")) continue;
            const json = line.slice(5).trim();
            if (!json) continue;
            const ev = safeParse(json) as { type?: string; delta?: string; message?: string } | null;
            if (!ev) continue;
            if (ev.type === "text" && ev.delta) handlers.onDelta?.(ev.delta);
            else if (ev.type === "error") handlers.onError?.(new Error(ev.message || "Lỗi"));
            else if (ev.type === "done") { handlers.onDone?.(); return; }
          }
        }
      }
      handlers.onDone?.();
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      handlers.onError?.(err as Error);
    }
  })();
  return () => controller.abort();
}

/** Live SSE stream of the current user's notifications (mirrors streamMessages). */
export function streamNotifications(
  onEvent: (event: { type: string; notification?: AppNotification }) => void,
  options: { onError?: (err: Error) => void; onClose?: () => void } = {},
): () => void {
  const controller = new AbortController();
  const token = getToken();
  (async () => {
    try {
      const res = await fetch(buildUrl("/notifications/stream"), {
        method: "GET",
        headers: {
          Accept: "text/event-stream",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
        cache: "no-store",
      });
      if (!res.ok || !res.body) {
        throw new ApiError("Không kết nối được luồng thông báo", res.status);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          for (const rawLine of chunk.split("\n")) {
            const line = rawLine.trimEnd();
            if (!line.startsWith("data:")) continue;
            const json = line.slice(5).trim();
            if (!json) continue;
            const parsed = safeParse(json);
            if (parsed) onEvent(parsed as { type: string; notification?: AppNotification });
          }
        }
      }
      options.onClose?.();
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      options.onError?.(err as Error);
    }
  })();
  return () => controller.abort();
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Download a build's project as a ZIP. Browser-initiated downloads (`<a download>`)
 * cannot attach the Authorization header, so we fetch with the Bearer token and
 * return the binary as a Blob for the caller to save.
 */
export async function downloadBuildZip(buildId: string): Promise<Blob> {
  const token = getToken();
  const res = await fetch(buildUrl(`/builds/${buildId}/download`), {
    method: "GET",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new ApiError(
      extractError(safeParse(txt)) ?? "Không tải được file ZIP",
      res.status,
    );
  }

  return res.blob();
}

/**
 * Upload a single file as multipart/form-data and parse the JSON response.
 * We MUST NOT set Content-Type ourselves — the browser sets it (with the
 * multipart boundary) when given a FormData body. Auth is injected as usual.
 */
export async function apiUpload<T>(
  path: string,
  field: string,
  file: File,
): Promise<T> {
  const token = getToken();
  const form = new FormData();
  form.append(field, file);

  const res = await fetch(buildUrl(path), {
    method: "POST",
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: form,
    cache: "no-store",
  });

  const text = await res.text();
  let data: unknown = undefined;
  if (text) data = safeParse(text) ?? text;

  if (!res.ok) {
    const message = extractError(data) ?? res.statusText ?? "Tải ảnh thất bại";
    throw new ApiError(message, res.status, data);
  }
  return data as T;
}

/**
 * Như `apiUpload` nhưng qua XMLHttpRequest để có `upload.onprogress` — fetch không có sự kiện
 * tiến trình tải lên. Cùng cách xác thực (Bearer) và cùng cách rút thông báo lỗi từ thân JSON,
 * để người gọi không phân biệt được hai đường ngoài việc có thêm tiến trình.
 */
export function apiUploadWithProgress<T>(
  path: string,
  field: string,
  file: File,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const token = getToken();
    const form = new FormData();
    form.append(field, file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", buildUrl(path));
    xhr.setRequestHeader("Accept", "application/json");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (ev) => {
      if (onProgress && ev.lengthComputable && ev.total > 0) onProgress(ev.loaded / ev.total);
    };
    xhr.onerror = () => reject(new ApiError("Mất kết nối khi tải lên", 0));
    xhr.onabort = () => reject(new ApiError("Đã huỷ tải lên", 0));
    xhr.onload = () => {
      const text = xhr.responseText;
      const data: unknown = text ? (safeParse(text) ?? text) : undefined;
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new ApiError(extractError(data) ?? xhr.statusText ?? "Tải tệp thất bại", xhr.status, data));
        return;
      }
      resolve(data as T);
    };
    if (signal) {
      if (signal.aborted) xhr.abort();
      else signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(form);
  });
}

/** Trigger a browser download for an already-fetched Blob. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the click has a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Typed endpoint helpers
// ─────────────────────────────────────────────────────────────────────────────

// KHÔNG còn kiểu nào cho bộ Marketing ở đây (02/10/2026). Make Video / Picture / Blog, lịch đăng,
// kênh Telegram và danh mục đã chuyển sang Social Wave; client của web không còn màn nào gọi tới.
//
// Máy chủ thì VẪN CÒN (`apps/api/src/marketing/`) — Social Wave gọi vào đó. Giữ lại một bộ client
// chết ở đây chính là cái bẫy "một tính năng sống hai nơi": lần sau sửa hợp đồng API, người ta sửa
// bản này và tưởng đã xong.

export interface MaicEndUser {
  id: string;
  externalId: string;
  label: string | null;
  plan: string | null;
  monthlyBudgetUsd: number;
  maxConcurrent: number;
  blocked: boolean;
  blockedAt: string | null;
  periodStart: string;
  createdAt: string;
  usage: {
    runs: number;
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
  /** null khi không có trần — trần 0 nghĩa là không giới hạn, không phải 0%. */
  percentUsed: number | null;
  remainingUsd: number | null;
  running: number;
}

/** Một lượt chạy MAIC quy về người dùng đó. */
export interface MaicRunRow {
  id: string;
  kind: string;
  status: string;
  model: string;
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number | null;
  createdAt: string;
  error: string | null;
}

export const api = {
  // auth
  register: (body: RegisterRequest) =>
    apiFetch<AuthResponse>("/auth/register", { method: "POST", body }),
  login: (body: LoginRequest) =>
    apiFetch<AuthResponse>("/auth/login", { method: "POST", body }),
  me: (token?: string) => apiFetch<User>("/auth/me", { token }),
  /**
   * Public: which social-login buttons should be shown. Each flag is true only
   * when the backend has that provider's OAuth client id/secret configured, so
   * a disabled button never dead-ends on a 503.
   */
  authConfig: () =>
    apiFetch<{ google: boolean; gitlab: boolean; github: boolean }>(
      "/auth/config",
      { token: null },
    ),
  /**
   * Public: request a 6-digit password-reset code by email. Always resolves to
   * {ok:true} (the backend never reveals whether the email exists — no account
   * enumeration). Subject to a 60s resend cooldown server-side.
   */
  forgotPassword: (email: string) =>
    apiFetch<{ ok: true }>("/auth/forgot-password", {
      method: "POST",
      body: { email },
      token: null,
    }),
  /**
   * Public: set a new password using the emailed 6-digit OTP code. Throws
   * ApiError(400) with a Vietnamese message when the code is wrong/expired or
   * too many attempts were made.
   */
  resetPassword: (email: string, code: string, password: string) =>
    apiFetch<{ ok: true }>("/auth/reset-password", {
      method: "POST",
      body: { email, code, password },
      token: null,
    }),
  /**
   * Authed: email the current user a 6-digit change-password OTP code. Returns
   * the masked address it was sent to (e.g. "d***@gmail.com"). 60s cooldown.
   */
  requestPasswordCode: () =>
    apiFetch<{ ok: true; sentTo: string }>("/me/password/request-code", {
      method: "POST",
      body: {},
    }),
  /**
   * Authed: change the current user's password using the emailed 6-digit OTP
   * code. Throws ApiError(400) with a Vietnamese message when the code is
   * wrong/expired or too many attempts were made.
   */
  changePassword: (code: string, newPassword: string) =>
    apiFetch<{ ok: true }>("/me/password", {
      method: "POST",
      body: { code, newPassword },
    }),

  /** Admin: lỗi runner gần đây người dùng gặp trên máy họ (xác thực/credit CLI, hoặc Gói Larkwave). */
  adminRunnerErrors: (query?: { days?: number; kind?: string; q?: string; limit?: number; offset?: number }) =>
    apiFetch<RunnerErrorReport>("/admin/runner-errors", { query }),

  /** This user's referral code/link + how many people they've referred. */
  getReferral: () =>
    apiFetch<{ code: string; link: string; referrals: number; rewardPerReferral: number }>(
      "/me/referral",
    ),
  /** Capture a referral code shortly after signup. */
  captureReferral: (ref: string) =>
    apiFetch<{ applied: boolean }>("/me/referral", { method: "POST", body: { ref } }),
  // Social — friends + direct messages
  friends: () => apiFetch<Friend[]>("/friends"),
  friendRequests: () => apiFetch<FriendRequest[]>("/friends/requests"),
  /** Discover other (non-private) users to befriend. */
  discoverUsers: (q?: string, page = 1, pageSize = 24) =>
    apiFetch<Paginated<DiscoverUser>>("/friends/discover", {
      query: { ...(q ? { q } : {}), page, pageSize },
    }),
  sendFriendRequest: (email: string) =>
    apiFetch<{ status: "pending" | "accepted" }>("/friends/request", {
      method: "POST",
      body: { email },
    }),
  /** Send a friend request by user id (from discovery). */
  sendFriendRequestById: (userId: string) =>
    apiFetch<{ status: "pending" | "accepted" }>(`/friends/request-user/${userId}`, {
      method: "POST",
    }),
  acceptFriend: (userId: string) =>
    apiFetch<{ ok: true }>(`/friends/${userId}/accept`, { method: "POST" }),
  removeFriend: (userId: string) =>
    apiFetch<{ ok: true }>(`/friends/${userId}`, { method: "DELETE" }),
  conversations: () => apiFetch<Conversation[]>("/messages"),
  unreadMessages: () => apiFetch<{ count: number }>("/messages/unread"),
  // notifications (realtime bell)
  notifications: () => apiFetch<NotificationsResponse>("/notifications"),
  notificationsUnread: () => apiFetch<{ unread: number }>("/notifications/unread-count"),
  markNotificationRead: (id: string) =>
    apiFetch<{ ok: true }>(`/notifications/${id}/read`, { method: "PATCH" }),
  markAllNotificationsRead: () =>
    apiFetch<{ ok: true }>("/notifications/read-all", { method: "POST" }),
  messageThread: (userId: string) =>
    apiFetch<ChatMessage[]>(`/messages/${userId}`),
  sendMessage: (userId: string, body: string) =>
    apiFetch<ChatMessage>(`/messages/${userId}`, { method: "POST", body: { body } }),

  // ── Remote agent — "Máy của tôi": phone → server → desktop relay ──────────
  /**
   * Enqueue a coding task to run on the user's signed-in desktop. When no device
   * is currently online the response carries `deviceOnline: false` and the task
   * stays queued until a desktop connects. Live progress arrives on the message
   * SSE as `{ type: 'remoteTask' }` events (RemoteTaskStreamEvent).
   */
  createRemoteTask: (body: CreateRemoteTaskRequest) =>
    apiFetch<CreateRemoteTaskResponse>("/agent/tasks", { method: "POST", body }),
  /** The current user's remote tasks (newest first), each with its device summary.
   *  Optionally scoped to a conversation ('none' = the unfiled thread). */
  listRemoteTasks: (conversationId?: string) =>
    apiFetch<RemoteTask[]>(
      conversationId ? `/agent/tasks?conversationId=${encodeURIComponent(conversationId)}` : "/agent/tasks",
    ),
  /** One remote task with its full streamed `events[]` for replay. */
  remoteTask: (id: string) => apiFetch<RemoteTask>(`/agent/tasks/${id}`),
  /** Named conversations on "Máy của tôi" (sidebar). */
  listConversations: () => apiFetch<AgentConversation[]>("/agent/conversations"),
  createConversation: (title?: string) =>
    apiFetch<AgentConversation>("/agent/conversations", { method: "POST", body: { title } }),
  renameConversation: (id: string, title: string) =>
    apiFetch<AgentConversation>(`/agent/conversations/${id}`, { method: "PATCH", body: { title } }),
  deleteConversation: (id: string) =>
    apiFetch<{ ok: true }>(`/agent/conversations/${id}`, { method: "DELETE" }),
  /** The user's registered desktop agent devices (with derived online flag). */
  listDevices: () => apiFetch<AgentDevice[]>("/agent/devices"),
  /** (Re)generate the per-user webhook token (returned once) for external triggers. */
  regenAgentToken: () =>
    apiFetch<AgentTokenResponse>("/agent/token", { method: "POST" }),
  /** Ask the signed-in desktop to open its Lark login window and stream a QR back. The QR +
   *  outcome arrive on the message SSE as `{ type: 'larkQr', requestId, status, image }`. */
  startLarkLogin: () =>
    apiFetch<{ requestId: string }>("/agent/lark-login", { method: "POST" }),
  /** List the CMS Bitable connector jobs (server proxies the CMS backend → no CORS). */
  cmsSyncListJobs: () => apiFetch<{ jobs: RemoteCmsJob[] }>("/agent/cms-sync/jobs"),
  /** Ask the signed-in desktop to RUN these CMS jobs with its LIVE Lark session. Progress +
   *  final tally arrive on the message SSE as `{ type: 'cmsSync', ... }`. */
  cmsSyncRun: (jobIds: string[]) =>
    apiFetch<{ requestId: string }>("/agent/cms-sync/run", { method: "POST", body: { jobIds } }),

  // Chat-over-relay: run any chat (Trợ lý AI / Lark) on the signed-in desktop's CLI. Stream via
  // streamLarkChat(); gated writes (build mode) confirm via larkChatConfirm; ask_user via larkChatAnswer.
  /** Start a chat turn on the desktop. Events arrive on the message SSE as `larkChatEvent`. */
  larkChatRun: (input: LarkChatRelayInput) =>
    apiFetch<{ requestId: string }>("/agent/lark-chat/run", { method: "POST", body: input }),
  /** Allow/deny a gated write on the running turn (build mode). */
  larkChatConfirm: (requestId: string, callId: string, decision: "allow" | "deny") =>
    apiFetch<{ ok: boolean }>("/agent/lark-chat/confirm", { method: "POST", body: { requestId, callId, decision } }),
  /** Reply to an ask_user prompt on the running turn. */
  larkChatAnswer: (requestId: string, callId: string, answer: string) =>
    apiFetch<{ ok: boolean }>("/agent/lark-chat/answer", { method: "POST", body: { requestId, callId, answer } }),
  /** Stop the running turn. */
  larkChatCancel: (requestId: string) =>
    apiFetch<{ ok: boolean }>("/agent/lark-chat/cancel", { method: "POST", body: { requestId } }),
  /** Is the hosted (MAIC) assistant configured on the server? Picks hosted vs desktop-relay. */
  maicStatus: () => apiFetch<{ enabled: boolean }>("/agent/maic/status"),
  /** Start a HOSTED (MAIC) general chat turn — runs SERVER-SIDE (no desktop, no local Claude).
   *  Events arrive on the SAME message SSE (`larkChatEvent`), consumed by streamLarkChat(). */
  maicChatRun: (input: {
    prompt: string;
    mode?: string;
    scope?: string;
    model?: string;
    sessionId?: string;
    resume?: boolean;
    /** Uploads to attach to this turn (POST /uploads first). Images route the turn through the
     *  agentic run so the model can actually open them. */
    attachmentIds?: string[];
  }) => apiFetch<{ requestId: string }>("/agent/maic-chat/run", { method: "POST", body: input }),
  /** Stop an in-flight hosted (MAIC) turn. */
  maicChatCancel: (requestId: string) =>
    apiFetch<{ ok: boolean }>("/agent/maic-chat/cancel", { method: "POST", body: { requestId } }),
  /** Run one allow-listed Lark runtime method on the desktop; result arrives on the SSE as larkRpcResult. */
  larkRpcRun: (method: string, args: unknown[]) =>
    apiFetch<{ requestId: string }>("/agent/lark-rpc", { method: "POST", body: { method, args } }),

  // AI help assistant (floating chatbot)
  assistantChat: (body: AssistantChatRequest) =>
    apiFetch<AssistantChatResponse>("/assistant/chat", { method: "POST", body }),
  // feedback — in-app bug/error reports
  submitFeedback: (body: SubmitFeedbackRequest) =>
    apiFetch<Feedback>("/feedback", { method: "POST", body }),
  /** The signed-in user's own reports (shown on /support). */
  myFeedback: () => apiFetch<MyFeedbackResponse>("/feedback/mine"),
  /** Preview an attachment on the user's own report. */
  getFeedbackAttachment: (id: string, uploadId: string) =>
    apiFetch<UploadContent>(`/feedback/${id}/attachment/${uploadId}`),
  adminFeedback: (query?: { status?: string; page?: number; pageSize?: number }) =>
    apiFetch<Paginated<Feedback>>("/admin/feedback", { query }),
  /** All matching reports (no pagination) for CSV export. */
  exportFeedback: (status?: string) =>
    apiFetch<Feedback[]>("/admin/feedback/export", {
      query: status && status !== "all" ? { status } : {},
    }),
  setFeedbackStatus: (id: string, status: "open" | "resolved", adminNote?: string) =>
    apiFetch<Feedback>(`/admin/feedback/${id}`, {
      method: "PATCH",
      body: { status, ...(adminNote !== undefined ? { adminNote } : {}) },
    }),
  /** Full admin triage update (severity/points/reward/paid/status/duplicate/note). */
  adminUpdateFeedback: (id: string, body: AdminUpdateFeedbackRequest) =>
    apiFetch<Feedback>(`/admin/feedback/${id}`, { method: "PATCH", body }),
  /** Claude-assisted duplicate candidates for a report. */
  adminFeedbackSimilar: (id: string) =>
    apiFetch<FeedbackSimilar[]>(`/admin/feedback/${id}/similar`),
  /** One-click: resolve all open feedback. */
  resolveAllFeedback: () =>
    apiFetch<{ count: number }>("/admin/feedback/resolve-all", { method: "POST" }),
  /** Admin previews any report's attachment. */
  adminFeedbackAttachment: (id: string, uploadId: string) =>
    apiFetch<UploadContent>(`/admin/feedback/${id}/attachment/${uploadId}`),


  // AI providers + agent logic (admin)
  adminAiStatus: () => apiFetch<AiStatus>("/admin/ai/status"),
  setAiKeys: (body: { openai?: string; grok?: string }) =>
    apiFetch<{ ok: true }>("/admin/ai/keys", { method: "PUT", body }),
  /** Platform Telegram bot (remote-run bridge) — set the token without a redeploy. */
  adminTelegramStatus: () => apiFetch<TelegramAdminStatus>("/agent/telegram/admin"),
  setTelegramBot: (body: { botToken?: string; botUsername?: string }) =>
    apiFetch<TelegramAdminStatus>("/agent/telegram/admin", { method: "PUT", body }),
  /** Admin: all payments (newest first) for reconciliation. */
  adminListPayments: (query?: { status?: string; page?: number; pageSize?: number }) =>
    apiFetch<Paginated<AdminPayment>>("/admin/payments", { query }),
  /** Admin: manually confirm a transfer → marks paid + upgrades the plan. */
  adminConfirmPayment: (id: string) =>
    apiFetch<AdminPayment>(`/admin/payments/${id}/confirm`, { method: "POST" }),
  /** Admin: poll SePay now → auto-reconcile pending payments. */
  adminSyncPayments: () =>
    apiFetch<{ checked: number; matched: number }>("/admin/payments/sync", {
      method: "POST",
    }),

  // users (admin)
  listUsers: (query?: { page?: number; pageSize?: number; role?: Role }) =>
    apiFetch<Paginated<User>>("/users", { query }),
  /** Admin: one user's full record (for the support drill-down). */
  getUser: (id: string) => apiFetch<User>(`/users/${id}`),
  /** Admin: lightweight support-summary counts for a user. Opening it is audited server-side. */
  getUserSupportSummary: (id: string) =>
    apiFetch<AdminUserSupportSummary>(`/users/${id}/support-summary`),
  createUser: (body: {
    email: string;
    password: string;
    name?: string;
    role?: Role;
  }) => apiFetch<User>("/users", { method: "POST", body }),
  updateUser: (
    id: string,
    body: { name?: string; role?: Role; status?: UserStatus; password?: string },
  ) => apiFetch<User>(`/users/${id}`, { method: "PATCH", body }),
  deleteUser: (id: string) =>
    apiFetch<{ ok: true }>(`/users/${id}`, { method: "DELETE" }),
  /** Admin: grant/activate a plan for a user (fresh credit window, like a settled payment).
   *  Paid grants send the user a "🎁 được tặng gói" notification. Admin-only + audited. */
  setUserPlan: (
    id: string,
    body: { plan: string; months?: number; resetQuota?: boolean },
  ) => apiFetch<User>(`/users/${id}/plan`, { method: "POST", body }),
  /** Admin: mint a session token to impersonate a user (open their builder session). */
  impersonateUser: (id: string) =>
    apiFetch<ImpersonateResponse>(`/users/${id}/impersonate`, { method: "POST" }),
  /**
   * Admin: nhắn cho một người dùng — thư và/hoặc thông báo trong app.
   *
   * KHÔNG có tham số địa chỉ người nhận: máy chủ đọc từ CSDL theo `id`. Kết quả nói rõ từng
   * kênh đã tới nơi chưa — cả hai kênh đều hỏng trong im lặng nếu chỉ nhìn vào "không có lỗi".
   */
  messageUser: (id: string, body: AdminMessageUserBody) =>
    apiFetch<AdminMessageUserResult>(`/users/${id}/message`, { method: "POST", body }),

  // scheduled tasks (recurring assistant runs)
  listScheduledTasks: () => apiFetch<ScheduledTask[]>("/scheduled"),
  getScheduledTask: (id: string) => apiFetch<ScheduledTask>(`/scheduled/${id}`),
  createScheduledTask: (body: {
    name: string;
    prompt: string;
    cron: string;
    timezone?: string;
    deliver?: string;
    enabled?: boolean;
  }) => apiFetch<ScheduledTask>("/scheduled", { method: "POST", body }),
  updateScheduledTask: (
    id: string,
    body: Partial<{ name: string; prompt: string; cron: string; timezone: string; deliver: string; enabled: boolean }>,
  ) => apiFetch<ScheduledTask>(`/scheduled/${id}`, { method: "PATCH", body }),
  deleteScheduledTask: (id: string) =>
    apiFetch<{ ok: true }>(`/scheduled/${id}`, { method: "DELETE" }),
  runScheduledTask: (id: string) =>
    apiFetch<ScheduledTask>(`/scheduled/${id}/run`, { method: "POST" }),

  // artifacts (saved outputs + public share)
  listArtifacts: () => apiFetch<Artifact[]>("/artifacts"),
  getArtifact: (id: string) => apiFetch<Artifact>(`/artifacts/${id}`),
  createArtifact: (body: { title: string; kind?: string; language?: string; content: string; visibility?: string }) =>
    apiFetch<Artifact>("/artifacts", { method: "POST", body }),
  updateArtifact: (
    id: string,
    body: Partial<{ title: string; kind: string; language: string; content: string; visibility: string }>,
  ) => apiFetch<Artifact>(`/artifacts/${id}`, { method: "PATCH", body }),
  deleteArtifact: (id: string) => apiFetch<{ ok: true }>(`/artifacts/${id}`, { method: "DELETE" }),
  getPublicArtifact: (slug: string) =>
    apiFetch<PublicArtifact>(`/artifacts/public/${slug}`, { token: null }),
  /** PUBLIC read-only shared conversation transcript (/s/<slug>). */
  getPublicChatConv: (slug: string) =>
    apiFetch<PublicChatConv>(`/agent/chat/public/${encodeURIComponent(slug)}`, { token: null }),
  /** PUBLIC metadata for a chat-able assistant link (/g/<slug>). */
  getPublicAssistant: (slug: string) =>
    apiFetch<PublicAssistantInfo>(`/agent/public-assistant/s/${encodeURIComponent(slug)}`, { token: null }),

  // chat projects (custom instructions per project)
  listChatProjects: () =>
    apiFetch<{ id: string; name: string; instructions: string; ord: number }[]>("/agent/chat/projects"),
  updateChatProject: (id: string, body: { name?: string; instructions?: string }) =>
    apiFetch<{ id: string; name: string; instructions: string; ord: number }>(`/agent/chat/projects/${id}`, {
      method: "PATCH",
      body,
    }),



  // MAIC — lớp đại lý. Larkwave bán gói, MAIC chạy máy và chặn hạn mức theo
  // từng người dùng của ta. Mọi lời gọi ở đây đi qua apps/api; token MAIC không
  // bao giờ ra tới trình duyệt.
  // Tên khác `maicStatus` ở trên: cái kia hỏi cổng có bật cho chat không,
  // cái này hỏi lớp đại lý đã dùng được chưa. Hai câu hỏi khác nhau.
  maicAdminStatus: () => apiFetch<{ enabled: boolean }>("/admin/maic/status"),
  maicEndUsers: (query?: { limit?: number; offset?: number; q?: string }) =>
    apiFetch<{
      endUsers: MaicEndUser[];
      total: number;
      summary: { endUsers: number; blocked: number; totalRuns: number; totalCostUsd: number };
    } | null>("/admin/maic/end-users", { query }),
  maicEndUser: (userId: string) =>
    apiFetch<MaicEndUser | null>(`/admin/maic/end-users/${encodeURIComponent(userId)}`),
  maicEndUserRuns: (userId: string, query?: { limit?: number; offset?: number }) =>
    apiFetch<{ runs: MaicRunRow[]; total: number } | null>(
      `/admin/maic/end-users/${encodeURIComponent(userId)}/runs`,
      { query },
    ),
  maicSyncUser: (userId: string) =>
    apiFetch<MaicEndUser | null>(`/admin/maic/end-users/${encodeURIComponent(userId)}/sync`, {
      method: "POST",
    }),
  maicSetBlocked: (userId: string, blocked: boolean) =>
    apiFetch<MaicEndUser | null>(`/admin/maic/end-users/${encodeURIComponent(userId)}/block`, {
      method: "POST",
      body: { blocked },
    }),
  maicResetUsage: (userId: string) =>
    apiFetch<MaicEndUser | null>(
      `/admin/maic/end-users/${encodeURIComponent(userId)}/reset-usage`,
      { method: "POST" },
    ),
  maicSyncAll: (limit?: number) =>
    apiFetch<{ synced: number; failed: number }>("/admin/maic/sync-all", {
      method: "POST",
      body: { limit },
    }),

  // audit
  listAudit: (query?: { page?: number; pageSize?: number }) =>
    apiFetch<Paginated<AuditLogEntry>>("/audit", { query }),

  // reports (admin) — profit / API-cost / revenue dashboard
  adminReports: (period?: ReportPeriod) =>
    apiFetch<AdminReport>("/admin/reports", {
      query: period ? { period } : undefined,
    }),

  /** Admin: hosted-Claude (MAIC) usage & gateway-health report. */
  adminClaude: (period?: ReportPeriod) =>
    apiFetch<ClaudeReport>("/admin/claude", {
      query: period ? { period } : undefined,
    }),
  /** Admin: platform-wide Claude data volume + top accounts. */
  adminClaudeData: () => apiFetch<ClaudeDataOverview>("/admin/claude/data"),
  /** Admin: one account's conversations + projects. */
  adminClaudeUser: (id: string) => apiFetch<ClaudeUserData>(`/admin/claude/users/${encodeURIComponent(id)}`),
  /** Admin: delete a conversation (data management). */
  adminClaudeDeleteConv: (id: string) =>
    apiFetch<{ ok: boolean }>(`/admin/claude/conversations/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // billing (admin) — runtime-editable pricing/credits/model-cost.
  // Both GET and PUT return the fully-resolved (merged) billing config.
  adminGetBilling: () =>
    apiFetch<ResolvedBillingConfig>("/admin/billing"),
  adminSaveBilling: (body: BillingConfig) =>
    apiFetch<ResolvedBillingConfig>("/admin/billing", { method: "PUT", body }),

  // me — profile mutations (current user only; all return the updated User)
  /** PATCH /me/profile — rename the current user + toggle discoverability. */
  updateProfile: (body: { name?: string; discoverable?: boolean }) =>
    apiFetch<User>("/me/profile", { method: "PATCH", body }),
  /**
   * POST /me/avatar — upload an avatar image (multipart, field `file`).
   * Accepts png/jpeg/webp/gif up to 3MB; returns the updated User.
   */
  uploadAvatar: (file: File) => apiUpload<User>("/me/avatar", "file", file),
  /** Upload a file (image/PDF/Office doc/text) to attach to a build conversation. */
  uploadFile: (file: File, purpose?: "chat" | "feedback") =>
    apiUpload<UploadRef>(purpose ? `/uploads?purpose=${purpose}` : "/uploads", "file", file),
  /** GET /uploads/:id — full stored content of an attachment (owner-only) to preview. */
  getUpload: (id: string) => apiFetch<UploadContent>(`/uploads/${id}`),
  /**
   * PATCH /me/avatar — set the avatar to an explicit URL (e.g. revert to the
   * Google picture) or clear it. Pass null/'' to reset; returns the updated User.
   */
  setAvatarUrl: (avatarUrl: string | null) =>
    apiFetch<User>("/me/avatar", { method: "PATCH", body: { avatarUrl } }),

  // me — current-user profile stats & contribution activity (auth via Bearer)
  meOverview: () => apiFetch<MeOverview>("/me/overview"),
  meActivity: (days?: number) =>
    apiFetch<MeActivity>("/me/activity", {
      query: days !== undefined ? { days } : undefined,
    }),

  // ── Cộng đồng (dòng thời gian bài đăng ngắn) ──────────────────────────────
  /** `q` tìm trong nội dung bài VÀ tên người đăng (máy chủ không phân biệt hoa thường). */
  communityFeed: (cursor?: string, q?: string) =>
    apiFetch<{ items: CommunityPost[]; nextCursor: string | null }>("/community/feed", {
      query: { cursor, q },
    }),
  communityCreate: (content: string, attachments: CommunityAttachment[] = []) =>
    apiFetch<CommunityPost>("/community/posts", {
      method: "POST",
      body: { content, attachments },
    }),
  /**
   * Tải một tệp đính kèm cho bài Cộng đồng → `{url, name, mime, size}` sẵn để nhét vào
   * `communityCreate`. Đi qua XHR chứ không phải fetch vì fetch KHÔNG báo tiến trình tải lên —
   * với ảnh 10MB trên 4G, một thanh đứng im bị hiểu là treo.
   */
  communityUpload: (file: File, onProgress?: (fraction: number) => void, signal?: AbortSignal) =>
    apiUploadWithProgress<CommunityAttachment>("/community/uploads", "file", file, onProgress, signal),
  communityDelete: (id: string) =>
    apiFetch<{ ok: true }>(`/community/posts/${encodeURIComponent(id)}`, { method: "DELETE" }),
  communityLike: (id: string) =>
    apiFetch<{ liked: boolean; likeCount: number }>(
      `/community/posts/${encodeURIComponent(id)}/like`,
      { method: "POST" },
    ),
  communityComments: (id: string) =>
    apiFetch<CommunityComment[]>(`/community/posts/${encodeURIComponent(id)}/comments`),
  /** `parentId` = trả lời một bình luận; máy chủ tự gắn lên cha nếu nhắm vào một trả lời. */
  communityAddComment: (id: string, content: string, parentId?: string | null) =>
    apiFetch<CommunityComment>(`/community/posts/${encodeURIComponent(id)}/comments`, {
      method: "POST",
      body: { content, parentId: parentId ?? null },
    }),
  communityDeleteComment: (id: string) =>
    apiFetch<{ ok: true }>(`/community/comments/${encodeURIComponent(id)}`, { method: "DELETE" }),


  // billing — current plan, monthly build quota & the full plan catalog
  subscription: () => apiFetch<MeSubscription>("/me/subscription"),
  /** GET /storage/usage — dung lượng đang dùng + hạn mức (dùng cho thanh bên và trang /storage). */
  storageUsage: () =>
    apiFetch<{
      /** Tỉ trọng từng nhóm dữ liệu — thanh bên dùng để vẽ thanh thành phần khi không có trần. */
      buckets: { category: string; label: string; bytes: number; count: number }[];
      totalBytes: number;
      /** Admin không bị giới hạn — số đã dùng vẫn được trả về và vẫn hiển thị. */
      unlimited: boolean;
      quotaBytes: number;
      includedMb: number;
      bonusMb: number;
      bonusUntil: string | null;
      percentUsed: number;
    }>("/storage/usage"),

  // ── Developer API keys (console) ──────────────────────────────────────────
  /**
   * Đổi gói KHÔNG qua thanh toán — và máy chủ chỉ cho HẠ gói bằng đường này.
   *
   * Chú thích cũ ghi "STUB plan switch (no payment)" như thể nâng gói cũng được: sai từ lâu.
   * `me.service.setPlan` ném 403 "Nâng gói trả phí phải kích hoạt qua thanh toán" cho mọi gói có
   * giá > 0. Nâng gói phải đi `createPayment` → CheckoutModal → webhook SePay.
   * Admin thì được đổi gói của bất kỳ ai qua `targetUserId`.
   */
  setPlan: (plan: PlanId, targetUserId?: string) =>
    apiFetch<MeSubscription>("/me/plan", {
      method: "POST",
      body: targetUserId ? { plan, targetUserId } : { plan },
    }),

  // payments (SePay bank-transfer checkout)
  /**
   * Create a bank-transfer payment intent for a paid plan. Returns the VietQR
   * image URL, bank details and the unique memo `code` the user must include in
   * the transfer.
   */
  createPayment: (plan: PlanId) =>
    apiFetch<CreatePaymentResponse>("/payments/create", {
      method: "POST",
      body: { plan },
    }),
  /** Poll a payment's status ('pending' → 'paid' once the webhook matches). */
  paymentStatus: (id: string) => apiFetch<Payment>(`/payments/${id}`),
  /** The current user's full payment history (newest first). */
  payments: () => apiFetch<Payment[]>("/me/payments"),



  // health
  health: () => apiFetch<HealthResponse>("/health", { token: null }),
};
