'use client';
/**
 * Larkwave API client for the DESKTOP account features (Friends, Reports,
 * Profile, Billing…). Mirrors apps/web/src/lib/api
 * but standalone so the desktop can talk to the same server (api.toolswave.net)
 * with the user's Larkwave-account JWT. Types are kept local + minimal so this
 * package needn't depend on @larkwave/shared.
 *
 * ĐỪNG ĐỔI NGƯỢC LẠI `apia.toolswave.net`. Ghi chú cũ ở đây từng nói App Builder là `apia`
 * (hai chữ a) và PHÂN BIỆT với `api` — đúng cho tới ngày hoán đổi tên miền 22/09/2026, sai kể
 * từ đó: hai hệ đã đổi chỗ cho nhau. Nay `apia` là backend cửa hàng, và gọi nhầm sang đó không
 * nhận lỗi mạng — chỉ nhận 404 từ một API lạ. Địa chỉ lấy từ hằng `APIA_BASE` (tên hằng giữ
 * nguyên để khỏi sửa 31 nơi gọi), và đặt `LARKWAVE_API_BASE` đổi được cho toàn bộ app.
 */
import { APIA_BASE } from '@larkwave/core';

export const API_BASE = APIA_BASE;

export const TOKEN_KEY = 'tw_token';

/* ───────────────────────── local types ───────────────────────── */
export interface User {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
  handle?: string | null;
  plan?: string | null;
  role?: 'user' | 'admin' | string;
  discoverable?: boolean;
  createdAt?: string;
}

export interface MeOverview {
  /** Metered hosted-AI runs (help assistant, Trợ lý AI, hosted Lark turns). */
  aiRuns: number;
  /** Tasks run on the user's desktop from the phone/web/webhook/Telegram. */
  remoteTasks: number;
  artifacts: number;
  skills: number;
  scheduledTasks: number;
  reports: number;
  joinedAt: string;
}

/** One cell of the contribution graph: a calendar day and its AI-activity count. */
export interface ActivityDay {
  /** `YYYY-MM-DD` (UTC). */
  date: string;
  count: number;
}

/** `GET /me/activity?days=N` — GitHub-style contribution graph data. */
export interface MeActivity {
  /** Sum of all `days[].count` in the window. */
  total: number;
  /** Consecutive days ending today (UTC) with count > 0. */
  currentStreak: number;
  /** Longest consecutive run of count > 0 days in the window. */
  longestStreak: number;
  /** One entry per day across the whole window, zeros filled, ascending by date. */
  days: ActivityDay[];
}

export interface Referral {
  code: string;
  link: string;
  referrals: number;
  rewardPerReferral: number;
}
export interface AuthResponse {
  token: string;
  user: User;
}
export interface AuthConfig {
  google: boolean;
  gitlab: boolean;
  github: boolean;
}
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type FeedbackStatus = 'open' | 'resolved' | 'duplicate' | 'rejected';
export type FeedbackSeverity = 'low' | 'medium' | 'high' | 'critical';
export interface Feedback {
  id: string;
  message: string;
  severity: FeedbackSeverity | null;
  status: FeedbackStatus;
  createdAt: string;
  url?: string | null;
  attachments: { id?: string; uploadId?: string; name?: string }[];
  adminNote?: string | null;
}
/** GET /feedback/mine — the user's own reports (reward program removed 07/10/2026). */
export interface MyFeedbackResponse {
  items: Feedback[];
  resolvedCount: number;
  /** Valid (non-rejected) reports. */
  totalReports: number;
}

export interface Friend {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
}
export interface FriendRequest {
  user: Friend;
  direction: 'incoming' | 'outgoing';
  createdAt: string;
}
export type FriendStatus = 'none' | 'friends' | 'pending_out' | 'pending_in';

/** A 1:1 direct message. Local copy (not @larkwave/shared) to keep the web build's React isolation. */
export interface ChatMessage {
  id: string;
  senderId: string;
  recipientId: string;
  body: string;
  createdAt: string;
  /** True if the current user sent it. */
  mine: boolean;
}
export interface Conversation {
  friend: Friend;
  lastMessage: string;
  lastAt: string;
  /** Unread messages from this friend. */
  unread: number;
}
export interface DiscoverUser extends Friend {
  friendStatus: FriendStatus;
}

export type PlanId = 'free' | 'starter' | 'pro' | 'enterprise';
export interface PlanCatalogEntry {
  id: PlanId;
  label: string;
  priceVnd: number;
  discountedVnd?: number | null;
  monthlyTokens?: number;
  storageMb?: number;
  features?: string[];
}
export interface MeSubscription {
  plan: PlanId;
  planLabel: string;
  percentUsed: number;
  resetAt: string | null;
  unlimited: boolean;
  freePlanEnabled: boolean;
  catalog: PlanCatalogEntry[];
}
export type PaymentStatus = 'pending' | 'paid';
export interface Payment {
  id: string;
  plan: PlanId;
  planLabel: string;
  amountVnd: number;
  status: PaymentStatus;
  code: string;
  createdAt: string;
  paidAt: string | null;
}

/** SePay bank-transfer intent returned by POST /payments/create. */
export interface CreatePaymentResponse {
  paymentId: string;
  code: string;
  /** Exact memo the user must put on the transfer (QR encodes this). */
  transferContent: string;
  amountVnd: number;
  plan: PlanId;
  planLabel: string;
  /** VietQR image URL to render. */
  qrUrl: string;
  bank: { name: string; holder: string; account: string };
}

/* ───────────────────────── token helpers ───────────────────────── */
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
/** Desktop bridge that persists the account token in the MAIN process (origin-independent). */
function tokenBridge():
  | { accountGetToken?: () => Promise<string | null>; accountSetToken?: (t: string | null) => void }
  | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { toolswave?: ReturnType<typeof tokenBridge> }).toolswave;
}

export function setToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
  // Also persist in the MAIN process so the session survives the renderer origin flipping
  // between the bundled `app://` and the remote `pages.dev` build (localStorage is per-origin).
  try {
    tokenBridge()?.accountSetToken?.(token);
  } catch {
    /* desktop-only; no-op on web */
  }
}

/**
 * Desktop only: if THIS renderer origin's localStorage has no token but the main process holds
 * one (saved from the other origin), pull it back into localStorage so the user stays logged in
 * across an origin flip. No-op on web / when already present. Call once before the first auth read.
 */
export async function hydrateToken(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    if (window.localStorage.getItem(TOKEN_KEY)) return;
    const t = await tokenBridge()?.accountGetToken?.();
    if (t) window.localStorage.setItem(TOKEN_KEY, t);
  } catch {
    /* ignore */
  }
}

/* ───────────────────────── fetch wrapper ───────────────────────── */
export class ApiError extends Error {
  statusCode: number;
  body: unknown;
  constructor(message: string, statusCode: number, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.body = body;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  token?: string | null;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(`${API_BASE}${path.startsWith('/') ? path : `/${path}`}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

function extractError(data: unknown): string | null {
  if (!data || typeof data !== 'object') {
    return typeof data === 'string' && data ? data : null;
  }
  const obj = data as { message?: string | string[]; error?: string };
  if (Array.isArray(obj.message)) return obj.message.join(', ');
  if (typeof obj.message === 'string') return obj.message;
  if (typeof obj.error === 'string') return obj.error;
  return null;
}

/**
 * Desktop main-process proxy for account API calls. The Electron renderer origin
 * (localhost / app://) isn't in the API's CORS allowlist, so a direct renderer
 * fetch is blocked; the desktop exposes `window.toolswave.accountFetch` which runs
 * the request in the main (Node) process where CORS doesn't apply. Web → undefined.
 */
interface AccountFetchBridge {
  accountFetch(req: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }): Promise<{ ok: boolean; status: number; text: string }>;
  /** Multipart upload proxied through main (avatar). Present on newer desktop builds. */
  accountUpload?(req: {
    url: string;
    field: string;
    filename: string;
    mimeType?: string;
    bytes: Uint8Array;
    headers?: Record<string, string>;
  }): Promise<{ ok: boolean; status: number; text: string }>;
}
function desktopProxy(): AccountFetchBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  const tw = (window as unknown as { toolswave?: Partial<AccountFetchBridge> }).toolswave;
  return tw && typeof tw.accountFetch === 'function' ? (tw as AccountFetchBridge) : undefined;
}

/** Typed fetch wrapper: injects Bearer token, parses JSON, throws ApiError on !ok. */
export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const token = opts.token === undefined ? getToken() : opts.token;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = buildUrl(path, opts.query);
  const method = opts.method ?? 'GET';
  const bodyStr = opts.body !== undefined ? JSON.stringify(opts.body) : undefined;

  let status: number;
  let ok: boolean;
  let text: string;
  const proxy = desktopProxy();
  if (proxy) {
    const r = await proxy.accountFetch({ url, method, headers, body: bodyStr });
    status = r.status;
    ok = r.ok;
    text = r.text;
  } else {
    const res = await fetch(url, { method, headers, body: bodyStr, signal: opts.signal, cache: 'no-store' });
    status = res.status;
    ok = res.ok;
    text = await res.text();
  }

  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!ok) {
    throw new ApiError(extractError(data) ?? `Có lỗi xảy ra (${status})`, status, data);
  }
  return data as T;
}

/** Multipart upload (FormData) — used for avatar/file uploads. */
export async function apiUpload<T>(path: string, field: string, file: File): Promise<T> {
  const token = getToken();
  const url = buildUrl(path);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let status: number;
  let ok: boolean;
  let text: string;
  const proxy = desktopProxy();
  if (proxy?.accountUpload) {
    // Desktop: a renderer FormData fetch CORS-fails — stream the bytes to main, which
    // rebuilds the multipart body and posts from Node (no CORS).
    const bytes = new Uint8Array(await file.arrayBuffer());
    const r = await proxy.accountUpload({ url, field, filename: file.name, mimeType: file.type, bytes, headers });
    status = r.status;
    ok = r.ok;
    text = r.text;
  } else {
    const fd = new FormData();
    fd.append(field, file);
    const res = await fetch(url, { method: 'POST', headers, body: fd });
    status = res.status;
    ok = res.ok;
    text = await res.text();
  }

  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!ok) throw new ApiError(extractError(data) ?? 'Tải lên thất bại', status, data);
  return data as T;
}

/** Full URL for a browser-driven OAuth start (e.g. `${API_BASE}/auth/google`). */
export function oauthUrl(provider: 'google' | 'gitlab' | 'github'): string {
  return `${API_BASE}/auth/${provider}`;
}

/** Bug report / feedback submission (POST /feedback). Mirrors the web form. */
export interface SubmitFeedbackRequest {
  message: string;
  url?: string;
  context?: { userAgent?: string; logs?: string[] };
  /** Ids of files uploaded via POST /uploads to attach as evidence. */
  attachmentIds?: string[];
}

/** A stored upload returned by POST /uploads (attachment evidence). */
/** `UploadRef` plus the stored content (base64 for image/pdf, extracted text otherwise). */
export interface UploadContent extends UploadRef {
  data: string;
}

export interface UploadRef {
  id: string;
  name: string;
  kind: 'image' | 'text' | 'pdf';
  mime: string;
  size: number;
}

/**
 * Một dòng trong "Tệp đã tải lên" (GET /uploads).
 *
 * Bản sao có chủ ý của `UploadListItem` trong @larkwave/shared: packages/ui phục vụ cả desktop
 * nên KHÔNG được phụ thuộc vào packages/shared (vốn chỉ dành cho api + web). Sửa một bên thì
 * phải sửa bên kia.
 */
export interface UploadListItem extends UploadRef {
  createdAt: string;
  /** Ngày hệ thống sẽ tự xoá — suy ra từ ngày tạo, máy chủ không lưu riêng. */
  expiresAt: string;
  /** Đã quá hạn và nội dung đã bị xoá; tên và dung lượng vẫn còn để nói được là "đã hết hạn". */
  expired: boolean;
  /** Sai khi không còn gì để trả lại: đã hết hạn, hoặc tải lên trước khi hệ thống giữ bản gốc. */
  downloadable: boolean;
}

export interface UploadListPage {
  items: UploadListItem[];
  nextCursor: string | null;
}

/* ───────────────────────── endpoints ───────────────────────── */
/** A person the owner shared their Lark connection with (or vice-versa). */
export interface LarkGrant {
  id: string;
  ownerId: string;
  granteeId?: string | null;
  /** 'lark' = shared Lark connection (base-scoped); 'agentchat' = shared "Trợ lý AI"
   *  (read-only general assistant). Absent on rows created before this field existed → 'lark'. */
  kind?: 'lark' | 'agentchat';
  label: string;
  status: 'pending' | 'active' | 'suspended' | 'revoked';
  mode: 'ask' | 'build';
  expiresAt?: string | null;
  turnsPerHour: number;
  turnsPerDay: number;
  tokenBudgetPct: number;
  createdAt: string;
  lastUsedAt?: string | null;
  scopes?: { id: string; baseName: string; tableNames: string[] }[];
  owner?: { id: string; name?: string; email?: string; avatarUrl?: string | null };
  grantee?: { id: string; name?: string; email?: string; avatarUrl?: string | null } | null;
  invites?: { inviteeUserId: string; usedAt?: string | null; expiresAt: string }[];
}

export interface LarkGrantCreateInput {
  inviteeUserId: string;
  kind?: 'lark' | 'agentchat';
  label?: string;
  mode?: 'ask' | 'build';
  expiresInDays?: number;
  turnsPerHour?: number;
  turnsPerDay?: number;
  tokenBudgetPct?: number;
  scopes?: { baseName: string; tableNames?: string[] }[];
}

export interface LarkGrantCall {
  id: string;
  tool: string;
  targetName: string;
  decision: string;
  latencyMs: number;
  createdAt: string;
  actor?: { id: string; name?: string; email?: string };
}

/** AgentChat ("Trợ lý AI") history sync — the server-shared shape (mirrors ConvMeta/Project). */
export interface ChatConvMeta {
  id: string;
  title: string;
  sessionId: string;
  updatedAt: number;
  projectId?: string;
  pinned?: boolean;
}
export interface ChatProjectMeta {
  id: string;
  name: string;
}
export interface ChatIndex {
  conversations: ChatConvMeta[];
  projects: ChatProjectMeta[];
}

/** A public chat-able assistant link (/g/<slug>). Local copy (no @larkwave/shared dep). */
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

/** One signed-in device (login session) for the device manager. */
export interface LoginDevice {
  id: string;
  kind: string; // phone | desktop | web
  label: string;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
}


/** Nhóm dữ liệu trên trang quản lý dung lượng. */
export type StorageCategory = 'uploads' | 'chat';

export interface StorageBucket {
  category: StorageCategory;
  label: string;
  bytes: number;
  count: number;
  deletable: boolean;
  hint?: string;
}

export interface StorageUsage {
  buckets: StorageBucket[];
  totalBytes: number;
  /** Admin không bị giới hạn — nhưng số đã dùng vẫn được trả về và vẫn hiển thị. */
  unlimited: boolean;
  quotaBytes: number;
  includedMb: number;
  bonusMb: number;
  /** Hạn của phần mua thêm (ISO) — null khi không có phần mua thêm đang hiệu lực. */
  bonusUntil: string | null;
  percentUsed: number;
}

export interface StorageOrder {
  paymentId: string;
  code: string;
  transferContent: string;
  amountVnd: number;
  storageGb: number;
  months: number;
  bank: { bin: string; account: string; holder: string; name: string };
  qrUrl: string;
}

export interface StorageItem {
  id: string;
  name: string;
  bytes: number;
  createdAt: string;
  /** Có lý do thì nút xoá bị khoá và hiện đúng lý do đó. */
  lockedReason?: string;
}

/** Trạng thái "chạy lịch hộ" — cố ý KHÔNG có trường nào chứa app_secret. */
export interface LarkHostedStatus {
  enabled: boolean;
  /** app_id đã che ("cli_a1b2…f9"), hoặc null khi chưa bật. */
  appIdMasked: string | null;
  label: string;
  lastSeenAt: string | null;
  lastError: string | null;
  /** false ⇒ máy chủ chưa bật kho khoá; giao diện phải khoá tính năng lại. */
  available: boolean;
}

/** Một hội thoại dùng chung (trong phạm vi một grant Lark). */
export interface LarkSharedConv {
  id: string;
  grantId: string;
  grantLabel: string;
  title: string;
  itemCount: number;
  isOwner: boolean;
  updatedAt: string;
  /** Có lượt agent đang chạy ⇒ đây là khoá lượt. null = rảnh. */
  running: { actorId: string; status: string } | null;
}

/** Một dòng trong hội thoại dùng chung. `seq` là thứ tự CHUẨN, không dùng thời gian. */
export interface LarkConvItem {
  id: string;
  seq: number;
  authorId: string;
  authorName: string;
  /** user | agent | system */
  role: string;
  text: string;
  turnId: string | null;
  createdAt: string;
}

export const accountApi = {
  /** Generate a REAL AI image (OpenAI) from a prompt → stored image URL. */
  assistantImage: (prompt: string, size?: string) =>
    apiFetch<{ url: string }>('/assistant/image', { method: 'POST', body: { prompt, ...(size ? { size } : {}) } }),
  // ── AgentChat history sync: desktop ↔ server ↔ web ────────────────────────
  /** Pull the user's conversation META + projects (bodies fetched per-id on open). */
  chatGetIndex: () => apiFetch<ChatIndex>('/agent/chat/index'),
  /** Pull one conversation's text-only body (null if the server has none). */
  chatGetBody: (id: string) => apiFetch<{ body: unknown[] | null }>(`/agent/chat/body/${encodeURIComponent(id)}`),
  /** Upsert conversation META (newest updatedAt wins; bodies untouched). */
  chatPushIndex: (conversations: ChatConvMeta[]) =>
    apiFetch<{ ok: boolean }>('/agent/chat/index', { method: 'PUT', body: { conversations } }),
  /** Replace the user's projects. */
  chatPushProjects: (projects: ChatProjectMeta[]) =>
    apiFetch<{ ok: boolean }>('/agent/chat/projects', { method: 'PUT', body: { projects } }),
  /** Upsert one conversation fully (meta + body). */
  chatPushBody: (id: string, meta: ChatConvMeta, body: unknown[]) =>
    apiFetch<{ ok: boolean }>(`/agent/chat/body/${encodeURIComponent(id)}`, { method: 'PUT', body: { meta, body } }),
  /** Remove one conversation from the server. */
  chatDeleteConv: (id: string) => apiFetch<{ ok: boolean }>(`/agent/chat/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  /** Make a conversation PUBLIC (read-only /s/<slug>) → returns its slug. */
  chatShare: (id: string) => apiFetch<{ slug: string }>(`/agent/chat/${encodeURIComponent(id)}/share`, { method: 'POST', body: {} }),
  /** Stop sharing a conversation. */
  chatUnshare: (id: string) => apiFetch<{ ok: boolean }>(`/agent/chat/${encodeURIComponent(id)}/share`, { method: 'DELETE' }),
  /** Public chat-able assistant links (/g/<slug>). */
  assistantShares: () => apiFetch<AssistantShareInfo[]>('/agent/public-assistant'),
  assistantShareCreate: (body: { label?: string; projectId?: string }) =>
    apiFetch<AssistantShareInfo>('/agent/public-assistant', { method: 'POST', body }),
  assistantShareUpdate: (id: string, body: { enabled?: boolean; label?: string }) =>
    apiFetch<{ ok: boolean }>(`/agent/public-assistant/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  assistantShareDelete: (id: string) =>
    apiFetch<{ ok: boolean }>(`/agent/public-assistant/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // ── Device manager (login sessions; max 3 per account) ────────────────────
  /** The account's active devices + which one is making this request. */
  listDevices: () => apiFetch<{ current: string | null; devices: LoginDevice[] }>('/auth/devices'),
  /** Log out one device (revoke its session). */
  revokeDevice: (id: string) => apiFetch<{ ok: boolean }>(`/auth/devices/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // ── Lark: hội thoại DÙNG CHUNG (chủ + người được chia sẻ cùng một luồng) ──
  larkConvs: () => apiFetch<LarkSharedConv[]>('/me/lark-convs'),
  larkConvCreate: (grantId: string, title: string) =>
    apiFetch<{ id: string; title: string }>('/me/lark-convs', { method: 'POST', body: { grantId, title } }),
  /** Con trỏ `after` là `seq`, KHÔNG phải thời gian — đồng hồ hai máy lệch nhau là mất tin nhắn. */
  larkConvItems: (id: string, after = 0) =>
    apiFetch<LarkConvItem[]>(`/me/lark-convs/${encodeURIComponent(id)}/items?after=${after}`),
  larkConvPost: (id: string, text: string, run = false) =>
    apiFetch<{ seq: number; turnId: string | null }>(
      `/me/lark-convs/${encodeURIComponent(id)}/items`,
      { method: 'POST', body: { text, run } },
    ),

  // ── Lark: Larkwave chạy lịch tự động hoá hộ (LarkHostedRunner) ───────────
  //
  // ĐÂY LÀ ĐƯỜNG DUY NHẤT app_secret của Lark đi lên máy chủ, và chỉ khi người dùng tự bật.
  // Chiều ngược lại KHÔNG BAO GIỜ có bí mật: `larkHostedStatus` chỉ trả app_id đã che.
  // Đọc chú thích ở model `LarkHostedRunner` trước khi thêm gì vào đây.
  larkHostedStatus: () => apiFetch<LarkHostedStatus>('/me/lark-hosted'),
  larkHostedEnable: (body: { appId: string; appSecret: string; label?: string }) =>
    apiFetch<LarkHostedStatus>('/me/lark-hosted', { method: 'PUT', body }),
  larkHostedDisable: () => apiFetch<LarkHostedStatus>('/me/lark-hosted', { method: 'DELETE' }),

  // ── Lark: delegated connection ("Cổng uỷ quyền") ──────────────────────────
  // No secret ever crosses these calls: a grant only says WHO may ask the owner's
  // desktop to run a turn. Claiming takes an empty body — the caller's JWT is the proof.
  larkGrants: () => apiFetch<LarkGrant[]>('/me/lark-grants'),
  larkGrantsReceived: () => apiFetch<{ active: LarkGrant[]; pending: LarkGrant[] }>('/me/lark-grants/received'),
  larkGrantCreate: (body: LarkGrantCreateInput) => apiFetch<LarkGrant>('/me/lark-grants', { method: 'POST', body }),
  larkGrantClaim: (id: string) => apiFetch<LarkGrant>(`/me/lark-grants/${id}/claim`, { method: 'POST', body: {} }),
  larkGrantUpdate: (id: string, body: Partial<LarkGrantCreateInput>) =>
    apiFetch<LarkGrant>(`/me/lark-grants/${id}`, { method: 'PATCH', body }),
  larkGrantSuspend: (id: string, on: boolean) =>
    apiFetch<LarkGrant>(`/me/lark-grants/${id}/suspend`, { method: 'POST', body: { on } }),
  larkGrantRevoke: (id: string) => apiFetch<{ ok: true }>(`/me/lark-grants/${id}`, { method: 'DELETE' }),
  /** Grantee asks the owner's desktop to run a turn; the server only queues + relays. */
  larkGrantSubmitTurn: (id: string, prompt: string) =>
    apiFetch<{ id: string; status: string }>(`/me/lark-grants/${id}/turns`, { method: 'POST', body: { prompt } }),
  larkGrantTurn: (turnId: string) =>
    apiFetch<{ id: string; status: string; result?: string | null; error?: string | null }>(
      `/me/lark-grants/turns/${turnId}`,
    ),
  /** Owner's desktop: pull anything still queued (recovers a missed push). */
  larkGrantQueuedTurns: () =>
    apiFetch<{ id: string; grantId: string; actorId: string; prompt: string; kind?: 'lark' | 'agentchat' }[]>(
      '/me/lark-grants/queued/turns',
    ),
  larkGrantReportTurn: (turnId: string, body: { status: string; result?: string; error?: string }) =>
    apiFetch<{ id: string; status: string }>(`/me/lark-grants/turns/${turnId}/report`, { method: 'POST', body }),
  larkGrantCalls: (id: string, limit?: number) =>
    apiFetch<LarkGrantCall[]>(`/me/lark-grants/${id}/calls`, { query: limit ? { limit } : undefined }),

  // auth
  login: (body: { email: string; password: string }) =>
    apiFetch<AuthResponse>('/auth/login', { method: 'POST', body }),
  register: (body: { email: string; password: string; name?: string }) =>
    apiFetch<AuthResponse>('/auth/register', { method: 'POST', body }),
  me: (token?: string) => apiFetch<User>('/auth/me', { token }),
  authConfig: () => apiFetch<AuthConfig>('/auth/config', { token: null }),
  /** Liveness probe for the offline banner (never cached). Throws when apia is down. */
  health: () => apiFetch<{ status?: string }>('/health', { token: null }),



  // feedback (bug reports)
  myFeedback: () => apiFetch<MyFeedbackResponse>('/feedback/mine'),
  /** Submit a bug report / feedback (auto-attaches app context + recent logs). */
  submitFeedback: (body: SubmitFeedbackRequest) =>
    apiFetch<Feedback>('/feedback', { method: 'POST', body }),
  /** Upload one evidence file (image/pdf/text) → returns its ref for attachmentIds. */
  uploadFile: (file: File, purpose?: 'chat' | 'feedback') =>
    apiUpload<UploadRef>(purpose ? `/uploads?purpose=${purpose}` : '/uploads', 'file', file),
  /** GET /uploads/:id — the FULL stored content (owner-only). For an office doc this is the text
   *  the server extracted at upload time, i.e. exactly what the assistant will read. */
  getUpload: (id: string) => apiFetch<UploadContent>(`/uploads/${encodeURIComponent(id)}`),
  /** GET /uploads — the user's own files, newest first (metadata only, never the bytes). */
  listUploads: (opts: { limit?: number; cursor?: string } = {}) =>
    apiFetch<UploadListPage>('/uploads', {
      query: { ...(opts.limit ? { limit: String(opts.limit) } : {}), ...(opts.cursor ? { cursor: opts.cursor } : {}) },
    }),
  /** GET /uploads/:id/raw — the ORIGINAL bytes, base64 (see the endpoint for why not binary). */
  uploadRaw: (id: string) =>
    apiFetch<{ id: string; name: string; mime: string; dataBase64: string }>(
      `/uploads/${encodeURIComponent(id)}/raw`,
    ),
  /** DELETE /uploads/:id — the user removing their own file before it expires. */
  deleteUpload: (id: string) => apiFetch<{ ok: true }>(`/uploads/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // ── Dung lượng lưu trữ ──────────────────────────────────────────────────────
  /** GET /storage/usage — đang chiếm bao nhiêu, chia theo nhóm, kèm hạn mức. */
  storageUsage: () => apiFetch<StorageUsage>('/storage/usage'),
  /** GET /storage/items — danh sách từng mục trong một nhóm, nặng nhất trước. */
  storageItems: (category: StorageCategory) =>
    apiFetch<StorageItem[]>('/storage/items', { query: { category } }),
  /** POST /payments/storage — tạo đơn mua thêm dung lượng (1 GB/đơn vị, theo tháng). */
  storageBuy: (units: number) =>
    apiFetch<StorageOrder>('/payments/storage', { method: 'POST', body: { units } }),
  /** DELETE /storage/items/:category/:id — xoá và giải phóng chỗ thật (cả tệp trên đĩa). */
  storageRemove: (category: StorageCategory, id: string) =>
    apiFetch<{ freedBytes: number }>(
      `/storage/items/${encodeURIComponent(category)}/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    ),

  // social — friends
  friends: () => apiFetch<Friend[]>('/friends'),
  friendRequests: () => apiFetch<FriendRequest[]>('/friends/requests'),
  discoverUsers: (q?: string, page = 1, pageSize = 24) =>
    apiFetch<Paginated<DiscoverUser>>('/friends/discover', { query: { ...(q ? { q } : {}), page, pageSize } }),
  sendFriendRequest: (email: string) =>
    apiFetch<{ status: 'pending' | 'accepted' }>('/friends/request', { method: 'POST', body: { email } }),
  sendFriendRequestById: (userId: string) =>
    apiFetch<{ status: 'pending' | 'accepted' }>(`/friends/request-user/${userId}`, { method: 'POST' }),
  acceptFriend: (userId: string) => apiFetch<{ ok: true }>(`/friends/${userId}/accept`, { method: 'POST' }),
  removeFriend: (userId: string) => apiFetch<{ ok: true }>(`/friends/${userId}`, { method: 'DELETE' }),

  // direct messages (1:1) — desktop POLLS these (the accountFetch proxy buffers; no SSE through IPC).
  conversations: () => apiFetch<Conversation[]>('/messages'),
  unreadMessages: () => apiFetch<{ count: number }>('/messages/unread'),
  messageThread: (userId: string) => apiFetch<ChatMessage[]>(`/messages/${userId}`),
  sendMessage: (userId: string, body: string) =>
    apiFetch<ChatMessage>(`/messages/${userId}`, { method: 'POST', body: { body } }),

  // profile
  meOverview: () => apiFetch<MeOverview>('/me/overview'),
  /** Contribution graph + streaks. `days` is clamped 1..365 by the server (default 365). */
  meActivity: (days?: number) =>
    apiFetch<MeActivity>('/me/activity', { query: days !== undefined ? { days } : undefined }),
  updateProfile: (body: { name?: string; discoverable?: boolean }) =>
    apiFetch<User>('/me/profile', { method: 'PATCH', body }),
  uploadAvatar: (file: File) => apiUpload<User>('/me/avatar', 'file', file),
  setAvatarUrl: (avatarUrl: string | null) =>
    apiFetch<User>('/me/avatar', { method: 'PATCH', body: { avatarUrl } }),
  requestPasswordCode: () => apiFetch<{ ok: true; sentTo: string }>('/me/password/request-code', { method: 'POST', body: {} }),
  changePassword: (code: string, newPassword: string) =>
    apiFetch<{ ok: true }>('/me/password', { method: 'POST', body: { code, newPassword } }),
  getReferral: () => apiFetch<Referral>('/me/referral'),

  // billing
  subscription: () => apiFetch<MeSubscription>('/me/subscription'),
  payments: () => apiFetch<Payment[]>('/me/payments'),
  /** Create a SePay bank-transfer intent for a paid plan (returns QR + bank + memo). */
  createPayment: (plan: PlanId) =>
    apiFetch<CreatePaymentResponse>('/payments/create', { method: 'POST', body: { plan } }),
  /** Poll a payment's status ('pending' → 'paid' once the SePay webhook matches). */
  paymentStatus: (id: string) => apiFetch<Payment>(`/payments/${id}`),
  /** Downgrade/switch plan without payment (server prorates). */
  setPlan: (plan: PlanId) => apiFetch<MeSubscription>('/me/plan', { method: 'POST', body: { plan } }),


  // notifications (for the header bell)
  notificationsUnread: () => apiFetch<{ unread: number }>('/notifications/unread-count'),
};

/* ───────────────────────── small formatting helpers ───────────────────────── */
/** Relative time in Vietnamese ("3 giờ trước"), mirroring the web's fromNow. */
export function fromNow(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (Number.isNaN(sec)) return '';
  if (sec < 60) return 'vừa xong';
  const mins = Math.floor(sec / 60);
  if (mins < 60) return `${mins} phút trước`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} giờ trước`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} ngày trước`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} tháng trước`;
  return `${Math.floor(months / 12)} năm trước`;
}

/** Absolute date "dd/MM/yyyy HH:mm" (vi-VN), mirroring the web's formatDate. */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export const SEVERITY_LABEL: Record<FeedbackSeverity, string> = {
  low: 'Thấp',
  medium: 'Trung bình',
  high: 'Cao',
  critical: 'Nghiêm trọng',
};
