/**
 * @larkwave/shared — single source of truth shared by the NestJS API
 * (`apps/api`) and the Next.js frontend (`apps/web`). Defines the full contract:
 * domain entities, pipeline stages, SSE events, and platform configuration.
 *
 * Enum string values are lowercase and match the Prisma enum members 1:1, so
 * entities cross the DB ↔ API ↔ UI boundary with no mapping layer.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

export type Track = 'web' | 'mobile' | 'extension' | 'desktop' | 'game';
export const TRACKS: readonly Track[] = ['web', 'mobile', 'extension', 'desktop', 'game'] as const;

export type Role = 'admin' | 'user';
export type UserStatus = 'active' | 'suspended';

export type AppStatus = 'draft' | 'building' | 'live' | 'failed' | 'archived' | 'suspended';
/**
 * `awaiting_approval` is a non-terminal pause: the design Blueprint has been
 * generated and the build is waiting for the user to review/approve it at the
 * gate before codegen runs. Approving resumes the pipeline.
 */
export type BuildStatus =
  | 'queued'
  | 'running'
  | 'awaiting_approval'
  | 'succeeded'
  | 'failed'
  | 'canceled';
export type DeploymentStatus = 'live' | 'superseded' | 'failed';

/**
 * Which kind of app a build produces. `static` = the classic SPA-on-Pages
 * output (default, fully backward-compatible). `fullstack` = SPA + backend
 * (Pages Functions) + per-app database (reserved for v1; not emitted in v0).
 */
export type BackendKind = 'static' | 'fullstack';
export const BACKEND_KINDS: readonly BackendKind[] = ['static', 'fullstack'] as const;

export type StageName = 'intake' | 'blueprint' | 'spec' | 'codegen' | 'build' | 'preview' | 'deploy';
export const STAGE_ORDER: readonly StageName[] = [
  'intake',
  'blueprint',
  'spec',
  'codegen',
  'build',
  'preview',
  'deploy',
] as const;
export const STAGE_LABELS: Record<StageName, string> = {
  intake: 'Phân loại',
  blueprint: 'Thiết kế',
  spec: 'Đặc tả',
  codegen: 'Sinh code',
  build: 'Build',
  preview: 'Preview',
  deploy: 'Deploy',
};

export type StageStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * How much of the design pipeline a build runs — the user's speed/care trade-off.
 *
 * - `turbo`    — prompt → code. The intake, blueprint (design) and spec stages are
 *                marked `skipped` and codegen runs straight off the request. Fastest;
 *                also the right default for a CLONE, where the blueprint would invent
 *                a design of its own instead of following the source site.
 * - `balanced` — the full pipeline with the design auto-approved. This is the default
 *                and is byte-for-byte today's behaviour.
 * - `thorough` — the full pipeline, PAUSED at the design gate (`awaiting_approval`)
 *                so the user reviews/edits the Blueprint before any code is written.
 *
 * MUST stay identical to `BuildPreset` in packages/core/src/runtime.ts — see the note there.
 */
export type BuildPreset = 'turbo' | 'balanced' | 'thorough';
export const BUILD_PRESETS: readonly BuildPreset[] = ['turbo', 'balanced', 'thorough'] as const;
/** The preset a build gets when the caller sends none — today's pipeline, unchanged. */
export const DEFAULT_BUILD_PRESET: BuildPreset = 'balanced';

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
  /** convenience aggregates for admin lists */
  appsCount?: number;
}

/**
 * Per-app SEO & GEO configuration, applied to the deployed app's index.html at
 * deploy time (meta + Open Graph + Twitter tags) plus sitemap.xml / robots.txt.
 * All optional — unset fields fall back to the app's name/description.
 */
export interface AppSeo {
  /** Enable SEO injection for this app (master toggle). Default true. */
  enabled?: boolean;
  /** <title> + og:title. Falls back to the app name. */
  title?: string;
  /** meta description + og:description. Falls back to the app description. */
  description?: string;
  /** comma-separated meta keywords. */
  keywords?: string;
  /** absolute URL of the social share image (og:image / twitter:image). */
  ogImage?: string;
  /** Allow search engines to index the app. Default true (false → noindex). */
  index?: boolean;
  /** Generate /sitemap.xml. Default true. */
  sitemap?: boolean;
  /** Generate /robots.txt. Default true. */
  robots?: boolean;
  /** GEO: help AI assistants understand the app (emits a JSON-LD block). Default true. */
  aiDiscovery?: boolean;
}

export type UpdateAppSeoRequest = AppSeo;

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
export type BlogPostStatus = "draft" | "published";

/**
 * Ngôn ngữ của nội dung blog.
 *
 * Là CHUỖI TỰ DO chứ không phải union đóng ('vi' | 'en'), cố ý: thêm tiếng Trung hay tiếng Hàn về
 * sau chỉ là ghi thêm một khoá vào `i18n`, không phải sửa kiểu rồi kéo theo mọi chỗ dùng. Dùng mã
 * BCP-47 ngắn: vi, en, zh, ko, ja…
 */
export type BlogLocale = string;

/** Phần nội dung của MỘT ngôn ngữ. Thiếu trường nào thì lùi về bản gốc của bài. */
export interface BlogTranslation {
  title?: string;
  excerpt?: string | null;
  /** Markdown body. */
  content?: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
}

/**
 * Bản dịch theo ngôn ngữ: { en: {...}, ko: {...} }.
 *
 * VÌ SAO LÀ MỘT OBJECT CHỨ KHÔNG PHẢI THÊM CỘT `titleEn`, `contentEn`:
 * thêm cột thì mỗi ngôn ngữ mới là một lần đổi schema, một lần migrate, và năm chỗ phải nhớ sửa
 * theo. Với object thì thêm tiếng Hàn là ghi thêm một khoá — không đụng tới cơ sở dữ liệu.
 *
 * Các cột gốc (title/content/…) VẪN LÀ BẢN CHUẨN và đang giữ tiếng Việt. `i18n` chỉ chứa các
 * ngôn ngữ KHÁC. Nhờ vậy mọi mã cũ đọc `post.title` vẫn chạy y như trước, không có bài nào biến
 * mất trong lúc chuyển đổi.
 */
export type BlogI18n = Record<BlogLocale, BlogTranslation>;

/** A blog post. `content` is Markdown. Dates are ISO strings. */
export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  /** Markdown body. */
  content: string;
  coverImage: string | null;
  status: BlogPostStatus;
  tags: string[];
  /** Chuyên mục CHÍNH (một bài đúng một) — dùng chia tab trên /blog; null khi bài chưa xếp mục. */
  category: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  /** Bản dịch sang các ngôn ngữ KHÁC bản gốc. Xem BlogI18n. */
  i18n: BlogI18n;
  /** Các ngôn ngữ bài này đọc được, gồm cả bản gốc. Máy chủ tính sẵn để client khỏi dò `i18n`. */
  locales: BlogLocale[];
  authorName: string | null;
  featured: boolean;
  views: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Lightweight list item (no full body) for cards / list pages. */
export interface BlogPostListItem {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  coverImage: string | null;
  tags: string[];
  category: string | null;
  /** Ngôn ngữ đọc được (gồm bản gốc) — để thẻ bài hiện huy hiệu EN/VI mà không cần tải cả bài. */
  locales: BlogLocale[];
  authorName: string | null;
  featured: boolean;
  views: number;
  publishedAt: string | null;
}

export interface CreateBlogPostRequest {
  title: string;
  /** Optional — derived from title when omitted. */
  slug?: string;
  excerpt?: string;
  content: string;
  coverImage?: string;
  status?: BlogPostStatus;
  tags?: string[];
  category?: string;
  seoTitle?: string;
  seoDescription?: string;
  /**
   * Bản dịch, theo ngôn ngữ: { en: { title, content, … } }.
   *
   * KHÔNG chứa bản gốc — bản gốc đi bằng các trường phẳng ở trên. Khi cập nhật, object này GỘP
   * theo từng ngôn ngữ chứ không thay cả cụm, nên gửi riêng { en } không xoá mất { ko } đã có.
   */
  i18n?: BlogI18n;
  authorName?: string;
  featured?: boolean;
}

export type UpdateBlogPostRequest = Partial<CreateBlogPostRequest>;

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

export type NotificationType = "message" | "feedback" | "build" | "system";

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

/** A scheduled task that calls a path on the app's own deployed URL on a cadence. */
export interface Automation {
  id: string;
  appId: string;
  name: string;
  enabled: boolean;
  /** Cadence in minutes (15 / 60 / 360 / 1440=daily / 10080=weekly). */
  intervalMinutes: number;
  method: string;
  /** Path on the app's own URL, e.g. "/api/cron/digest". */
  path: string;
  body: string | null;
  nextRunAt: string;
  lastRunAt: string | null;
  /** Last HTTP status (0 = never run / network error). */
  lastStatus: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertAutomationRequest {
  name: string;
  enabled?: boolean;
  intervalMinutes?: number;
  method?: string;
  path?: string;
  body?: string | null;
}

/** A single app secret / environment variable (read by the app's backend at runtime). */
export interface AppSecretItem {
  key: string;
  value: string;
}

export interface AppSecretsResponse {
  secrets: AppSecretItem[];
}

export interface UpdateAppSecretsRequest {
  secrets: AppSecretItem[];
}

/** One day's pageview count in the analytics series. */
export interface AppAnalyticsDay {
  /** "YYYY-MM-DD" (UTC). */
  day: string;
  count: number;
}

/** Aggregated visit analytics for a deployed app over a time window. */
export interface AppAnalytics {
  /** Window length in days. */
  rangeDays: number;
  /** Total pageviews in the window. */
  total: number;
  /** Chronological daily series (missing days filled with 0). */
  days: AppAnalyticsDay[];
  /** Top referrer hosts in the window. */
  referrers: { host: string; count: number }[];
  /** Device split. */
  devices: { mobile: number; desktop: number };
}

/**
 * "Bộ site" — các mặt của MỘT hệ thống, mỗi mặt là một site riêng biệt (địa chỉ riêng,
 * project deploy riêng), nối với nhau qua một API dùng chung.
 *
 * Vì sao là site riêng chứ không phải route trong cùng một app: backoffice và portal có
 * người dùng khác nhau, vòng đời phát hành khác nhau, và rủi ro khác nhau — gộp chung thì
 * một lần sửa CMS cũng đẩy lại trang bán hàng, và ai vào được trang công khai cũng tải luôn
 * mã nguồn khu quản trị.
 */
export const SITE_SURFACES = ['site', 'cms', 'portal', 'api'] as const;
export type SiteSurface = (typeof SITE_SURFACES)[number];

/** Một site trong bộ, rút gọn cho thẻ danh sách và màn quản lý bộ. */
export interface SuiteMemberInfo {
  id: string;
  name: string;
  slug: string;
  surface: SiteSurface;
  status: AppStatus;
  /** Địa chỉ đang chạy; null khi site chưa deploy được lần nào. */
  currentUrl: string | null;
  /** Site đại diện — cái duy nhất hiện thành thẻ ở danh sách. */
  primary: boolean;
}

export interface App {
  /** Trang gốc khi app này là một BẢN SAO. null = không phải bản sao. */
  sourceUrl?: string | null;
  /** Độ giống trang gốc (%) của lần dựng gần nhất — chỉ có với app bản sao. */
  cloneScore?: number | null;
  id: string;
  ownerId: string;
  owner?: Pick<User, 'id' | 'email' | 'name'>;
  name: string;
  slug: string;
  track: Track;
  description: string;
  status: AppStatus;
  /** Cloudflare Pages project name backing this app. */
  pagesProject: string | null;
  /** Live public URL of the current deployment. */
  currentUrl: string | null;
  currentDeploymentId: string | null;
  /** Kind of backend this app targets (`static` default; `fullstack` = DB + API). */
  backendKind: BackendKind;
  /** Whether the app includes an admin/CMS area (implies a full-stack backend). */
  cms?: boolean;
  /** Per-app SEO & GEO config (applied to the deployed app at deploy time). */
  seo?: AppSeo | null;
  /** Admin moderation: reason the app was suspended (null unless suspended). */
  suspendReason?: string | null;
  /**
   * Admin moderation heuristic: true when name/description/latest build prompt
   * contains a banned keyword. Only populated on the admin app list.
   */
  flagged?: boolean;
  /** Git provider this app was imported from (set when `gitImported`). */
  gitProvider?: GitProvider | null;
  /** Linked repository in `owner/repo` form (set when `gitImported`). */
  gitRepo?: string | null;
  /** Branch the import tracked / the "Đẩy lên Git" push targets. */
  gitBranch?: string | null;
  /** True when the app's code originated from a Git import. */
  gitImported?: boolean;
  /** Workspace model: parent (workspace) app id when this app is a sub-project. */
  parentId?: string | null;
  /** Sub-project directory within the parent repo (e.g. 'velvel-admin'). */
  servicePath?: string | null;
  /** "Bộ site": id chung của các site tạo cùng một lượt. Null = app đứng một mình. */
  suiteId?: string | null;
  /** Vai trò trong bộ site ('site'|'cms'|'portal'|'api'). Null khi không thuộc bộ nào. */
  surface?: SiteSurface | null;
  /** Site đại diện của bộ — cái duy nhất hiện thành thẻ ở danh sách app. */
  suitePrimary?: boolean;
  /** MỌI site trong bộ (kể cả chính nó). Chỉ có trên thẻ đại diện ở danh sách app. */
  suiteMembers?: SuiteMemberInfo[];
  /** Pinned to the sidebar for quick access. */
  pinned?: boolean;
  /** Published to the public showcase. */
  published?: boolean;
  /** Public-page visit count. */
  visits?: number;
  /** The current user's role on this app (set on detail / shared lists). */
  role?: AppRole;
  /** True when this app is shared with the current user (they're not the owner). */
  shared?: boolean;
  createdAt: string;
  updatedAt: string;
  buildsCount?: number;
  deploymentsCount?: number;
}

/** A published app as shown on the PUBLIC showcase (no owner-private fields). */
export interface PublicApp {
  slug: string;
  name: string;
  description: string;
  track: Track;
  /** Live deployed URL (where the actual app runs). */
  url: string | null;
  /** Public-page visit count. */
  visits: number;
  /** Display name of the author. */
  author: string;
  /** Author's public maker handle (→ /u/{handle}); null for legacy users w/o one. */
  authorHandle?: string | null;
  /** Last update (ISO). */
  updatedAt: string;
}

/** A public maker profile (GET /public/makers/:handle). */
export interface MakerProfile {
  handle: string;
  name: string;
  avatarUrl: string | null;
  /** Published apps by this maker. */
  apps: PublicApp[];
  followers: number;
  following: number;
  appCount: number;
  joinedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Social — friends + direct messages
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Gamification — XP, levels, leaderboard (one formula shared by profile + ranks)
// ─────────────────────────────────────────────────────────────────────────────

/** The activity counts that earn XP. */
export interface XpStats {
  apps: number;
  succeededBuilds: number;
  deployments: number;
  visits: number;
}

/** XP awarded per unit of each activity. */
export const XP_WEIGHTS = { app: 40, build: 25, deployment: 60, visit: 2 } as const;

/** Total XP from a user's activity counts (the single source of truth). */
export function computeXp(s: XpStats): number {
  return (
    Math.max(0, s.apps) * XP_WEIGHTS.app +
    Math.max(0, s.succeededBuilds) * XP_WEIGHTS.build +
    Math.max(0, s.deployments) * XP_WEIGHTS.deployment +
    Math.max(0, s.visits) * XP_WEIGHTS.visit
  );
}

export interface LevelInfo {
  level: number;
  /** Total XP. */
  xp: number;
  /** XP earned within the current level. */
  xpInLevel: number;
  /** XP span of the current level (xpInLevel / xpForNext = progress). */
  xpForNext: number;
  /** Flavor title for the level tier. */
  title: string;
}

const LEVEL_TITLES = [
  "Tân binh",
  "Thợ học việc",
  "Nhà sáng tạo",
  "Cao thủ",
  "Bậc thầy",
  "Huyền thoại",
];

/** Level curve: level = floor(sqrt(xp/100)) + 1 (each level ~quadratic). */
export function levelInfo(xp: number): LevelInfo {
  const x = Math.max(0, Math.floor(xp));
  const level = Math.floor(Math.sqrt(x / 100)) + 1;
  const floor = 100 * (level - 1) ** 2;
  const next = 100 * level ** 2;
  const title = LEVEL_TITLES[Math.min(LEVEL_TITLES.length - 1, Math.floor((level - 1) / 3))];
  return { level, xp: x, xpInLevel: x - floor, xpForNext: next - floor, title };
}

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

/** One row of the leaderboard. */
export interface LeaderboardEntry {
  rank: number;
  user: Friend;
  xp: number;
  level: number;
  isMe: boolean;
}

/** Leaderboard payload: the top entries + the current user's own rank. */
export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  /** The current user's entry (may be outside the top list); null if no XP. */
  me: LeaderboardEntry | null;
}

/** A user's role on an app: owner, or an invited collaborator. */
export type AppRole = "owner" | "editor" | "viewer";
/** Invited-collaborator roles (excludes the implicit owner). */
export type AppMemberRole = "editor" | "viewer";

/** A collaborator on an app (shown in the members panel). */
export interface AppMemberEntry {
  user: Friend;
  role: AppMemberRole;
}

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

/** The CLI runner (agent) a remote/desktop build runs on. Matches the desktop
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
 *  BuildEvent (log/stage/status/progress/result/error) as-is, so the phone
 *  renders it with the same building blocks the build-progress UI uses. */
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
  /** The local app id the desktop produced/iterated (for a "mở app" link). */
  appId: string | null;
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
  /** Iterate an EXISTING app on the device (from the synced app list) instead of
   *  creating a new one. Undefined = new app. */
  appId?: string;
}

/** A local app on a device, synced up so the phone can list + send follow-ups to it. */
export interface RemoteAppInfo {
  id: string;
  name: string;
  status: string;
  url?: string;
  updatedAt?: string;
  /** Which device holds it (so a follow-up task targets the right machine). */
  deviceId: string;
  deviceName: string;
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
  appId?: string | null;
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

/** Supported Git providers for connect / import / push-back. */
export type GitProvider = "gitlab" | "github";

/** One repository listed from a connected Git provider. */
export interface GitRepo {
  id: string | number;
  /** `owner/repo`. */
  fullName: string;
  name: string;
  defaultBranch: string;
  private: boolean;
  webUrl: string;
  updatedAt: string;
}

/**
 * Response of `GET /me/git/:provider/repos`. When the user hasn't linked the
 * provider the API returns `{ connected: false }`; otherwise the repo list.
 */
export type GitReposResponse =
  | { connected: false }
  | { connected: true; repos: GitRepo[]; hasMore: boolean };

/** A detected sub-project inside an imported (mono)repo. */
export interface DetectedService {
  /** Directory prefix within the repo ('' = repo root). */
  path: string;
  /** Display name (last path segment, or 'root'). */
  name: string;
  type: 'frontend' | 'backend' | 'static' | 'other';
  /** Detected framework/runtime, e.g. 'react', 'next', 'nestjs', 'go'. */
  framework: string | null;
  /** True when it can be built + deployed as its own web app on our pipeline. */
  buildable: boolean;
  fileCount: number;
}

/**
 * Persisted ".toolswave" build/deploy config for an imported, directly-buildable
 * repo. Derived ONCE at import time (or read from a repo-provided `.toolswave/
 * config.json`) and reused on every subsequent build/redeploy — so re-running an
 * imported site costs ZERO AI tokens (it never touches codegen). When present, the
 * pipeline runs `installCommand` + `buildCommand` (or neither, for a static site)
 * and deploys `outputDir`, bypassing the LLM entirely.
 */
export interface BuildConfig {
  /** Detected framework, e.g. 'react' | 'vite' | 'next' | 'nuxt' | 'vue' | 'svelte' | 'astro' | 'angular' | 'html'. */
  framework: string;
  /** Shell command to install deps, or null for a no-deps static site. */
  installCommand: string | null;
  /** Shell command to build, or null to deploy the files as-is (static site, no build). */
  buildCommand: string | null;
  /** Directory (relative to repo root) that holds the deployable index.html: '.', 'dist', 'out', 'build', '.output/public'. */
  outputDir: string;
  /** 'fullstack' only when the repo ships schema.sql + functions/ (D1 + Pages Functions); else 'static'. */
  deployTarget: 'static' | 'fullstack';
  /** Optional build-time env vars (rarely needed; app secrets are stored separately). */
  env?: Record<string, string>;
  /** 'toolswave-file' when read from a repo `.toolswave/config.json`/`toolswave.json`; else 'auto' (derived from detection). */
  source: 'auto' | 'toolswave-file';
}

/** `GET /apps/:id/services` — detected sub-projects of an imported repo. */
export interface AppServicesResponse {
  services: DetectedService[];
}

/** One deployed service of a "Deploy lên Server (Docker)" app. */
export interface ServerDeployServiceEntry {
  name: string;
  subdomain: string;
  port: number;
  url: string;
}

/** State of an app's Docker/server deploy. */
export interface ServerDeployInfo {
  status: 'deploying' | 'live' | 'failed';
  services: ServerDeployServiceEntry[];
  error: string | null;
  /** Live deploy log (progress steps + full docker-compose output). */
  log: string | null;
  updatedAt: string;
}

/** `GET /apps/:id/server-deploy` — feature availability + current deploy state. */
export interface ServerDeployStatusResponse {
  /** Server-deploy target configured on the platform (host/ssh/tunnel set). */
  enabled: boolean;
  /** This app is deployable to the server (has a root docker-compose.yml). */
  canDeploy: boolean;
  /** ≥2 detected sub-projects → can synthesize Docker infra to run them together. */
  multiService: boolean;
  /** The user's PLAN allows running on the Docker server (Pro+). When false, the
   *  UI shows an upgrade prompt instead of the deploy button. */
  planAllowed: boolean;
  deploy: ServerDeployInfo | null;
}

/** `POST /apps/:id/prepare-server` — AI-generated docker-compose + Dockerfiles. */
export interface PrepareServerResponse {
  /** How many infra files were generated + merged into the app. */
  created: number;
  /** Number of detected services. */
  services: number;
  /** True once a docker-compose.yml exists (i.e. the app is now server-deployable). */
  hasCompose: boolean;
}

/** One AI-generated app-idea suggestion on the builder home. */
export interface AppSuggestion {
  label: string;
  prompt: string;
  track?: Track;
}

/** A daily suggestion-generation run (kept for admin history). */
export interface SuggestionRunEntry {
  id: string;
  items: AppSuggestion[];
  count: number;
  model: string;
  createdAt: string;
}

/** Detected shape of an imported repo (drives auto-build vs import-only). */
export type ImportKind =
  | 'web-single'
  | 'monorepo'
  | 'backend'
  | 'static'
  | 'extension'
  | 'unknown';

/** Response of `POST /me/git/import` — the created app + its first build. */
export interface GitImportResponse {
  appId: string;
  buildId: string;
  /** True when the import runs in the BACKGROUND: clone/classify/build happen
   *  async and stream progress to `buildId`. The client navigates to the build
   *  and watches; `kind`/`fileCount`/`buildable` aren't known yet at return time. */
  pending?: boolean;
  /** Detected project kind. */
  kind?: ImportKind;
  /** Number of files imported. */
  fileCount?: number;
  /** True = single web app, auto-built + deployed. False = imported faithfully
   *  (full source stored) without auto-building (monorepo / backend / complex). */
  buildable?: boolean;
  /** True when the repo exceeded import caps and some files were skipped. */
  truncated?: boolean;
}

/** Response of `POST /apps/:id/git/push`. */
export interface GitPushResponse {
  ok: true;
  commitUrl?: string;
}

export interface StageState {
  name: StageName;
  status: StageStatus;
  startedAt?: number;
  finishedAt?: number;
  summary?: string;
}

export interface LogLine {
  ts: number;
  level: LogLevel;
  stage?: StageName;
  msg: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  usd: number;
}

export interface BuildResult {
  url?: string;
  previewUrl?: string;
  /** Branded `<slug>.toolswave.net` domain (activates on Cloudflare's schedule). */
  customUrl?: string;
  repoUrl?: string;
  artifactPath?: string;
  /** data-URL PNG QR code pointing at `url`. */
  qr?: string;
  /** Track C / mobile install & config guide (markdown). */
  guide?: string;
  projectName?: string;
  /**
   * Chấm điểm bản sao so với trang gốc (chỉ có ở build sao chép từ URL).
   * Cố tình THÔ: một tín hiệu để người dùng biết có nên xem lại hay không, không phải thước đo
   * chính xác — nên nó BÁO CÁO chứ không bao giờ chặn build.
   */
  fidelity?: {
    /** Trung bình ba trục dưới, 0-100. */
    score: number;
    /** % dòng nội dung của bản gốc còn tìm thấy trong bản sao (bất kể nằm ở thẻ nào). */
    contentPct: number;
    /** % chiều cao trang so với bản gốc. */
    heightPct: number;
    srcTables: number;
    dstTables: number;
    /** Mục menu CÓ ở bản sao mà KHÔNG có ở bản gốc — tức tính năng model tự bịa. */
    invented: string[];
  };
}

export interface GeneratedFile {
  path: string;
  content: string;
  /**
   * How `content` is encoded. Omitted/'utf8' = plain text (the default). 'base64' =
   * a BINARY asset (image/font imported from a repo) — decode before writing to disk.
   * Lets imported apps keep their real images/fonts instead of shipping a broken/empty
   * public dir.
   */
  encoding?: 'utf8' | 'base64';
}

// ─────────────────────────────────────────────────────────────────────────────
// Blueprint — the structured "design intake" produced before codegen.
//
// A Blueprint is the typed plan the user reviews/approves at the gate: which
// pages the app has, the data entities (→ SQL in v1), the auth model and any
// integrations. It is the single source of truth shared by the design wizard
// (apps/web), the codegen prompts (apps/api), and the v1 SQL generator.
// Enum values are lowercase to match the rest of this contract.
// ─────────────────────────────────────────────────────────────────────────────

export type BpFieldType =
  | 'string'
  | 'text'
  | 'int'
  | 'float'
  | 'bool'
  | 'datetime'
  | 'json'
  | 'enum'
  | 'ref';

export interface BpField {
  name: string;
  type: BpFieldType;
  required?: boolean;
  unique?: boolean;
  /** Literal default value (rendered into SQL/forms in v1). */
  default?: string;
  /** Allowed values when `type === 'enum'`. */
  enumValues?: string[];
  /** Target entity name when `type === 'ref'`. */
  refEntity?: string;
}

/** How rows of an entity are owned — drives owner_id columns + access rules in v1. */
export type BpOwnership = 'public' | 'per-user' | 'shared';
export type BpOp = 'list' | 'read' | 'create' | 'update' | 'delete';
export type BpAccess = 'public' | 'authed' | 'owner' | 'admin';

export interface BpEntity {
  name: string;
  label: string;
  fields: BpField[];
  ownership: BpOwnership;
  ops: BpOp[];
  /** Per-operation access template (drives the v1 backend permission layer). */
  permissions?: { create: BpAccess; read: BpAccess; update: BpAccess; delete: BpAccess };
}

export type BpPageKind = 'list' | 'detail' | 'form' | 'dashboard' | 'landing' | 'auth';

export interface BpPage {
  path: string;
  title: string;
  kind: BpPageKind;
  /** Entity this page is centred on (for list/detail/form pages). */
  entity?: string;
  requiresAuth?: boolean;
}

export interface BpAuth {
  enabled: boolean;
  providers: ('email' | 'google')[];
  roles?: string[];
}

export interface BpIntegration {
  kind: 'email' | 'payment' | 'storage' | 'webhook' | 'none';
  note?: string;
}

export interface BpNavItem {
  label: string;
  pagePath: string;
}

export interface Blueprint {
  appName: string;
  summary: string;
  /** `static` in v0; `fullstack` reserved for v1. */
  backend: BackendKind;
  pages: BpPage[];
  entities: BpEntity[];
  auth: BpAuth;
  integrations: BpIntegration[];
  navigation: BpNavItem[];
}

/** Lifecycle of a stored Blueprint (one row per design intake, versioned). */
export type BlueprintStatus = 'draft' | 'approved' | 'superseded';

export interface Build {
  id: string;
  appId: string;
  ownerId: string;
  prompt: string;
  name: string | null;
  track: Track | null;
  status: BuildStatus;
  /**
   * How this build was produced: 'codegen' = AI-generated from a prompt;
   * 'edit' = deploy user-provided/edited files (incl. imported repos, redeploys);
   * 'import' = an import shell. Drives the recovery UX — 'edit'/'import' builds carry
   * the user's OWN code, so re-running rebuilds + deploys it for FREE (no AI), whereas
   * 'codegen' offers AI regenerate. Null for legacy builds (treat as 'codegen').
   */
  mode: 'codegen' | 'edit' | 'import' | null;
  /** The model this build ran on (drives credit cost). */
  model: ModelChoice;
  /** Brand/accent color (`#rrggbb`) the generated app should use. Null = unset. */
  primaryColor: string | null;
  /** Preferred layout/canvas hint (e.g. 'dashboard'|'landing'|'auto'). */
  style: string | null;
  stages: StageState[];
  spec: string | null;
  /** Files attached to this build's prompt (image mockups, code, specs…). */
  attachments?: UploadRef[];
  /**
   * The design Blueprint generated for this build (draft while
   * `awaiting_approval`, approved once the gate is passed). Null for builds that
   * skip the design stage (edit-mode, iterate builds, legacy builds).
   */
  blueprint: Blueprint | null;
  result: BuildResult | null;
  usage: TokenUsage | null;
  error: string | null;
  /** present only on the detail endpoint + SSE snapshot */
  logs?: LogLine[];
  /** present only on the detail endpoint */
  files?: GeneratedFile[];
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface Deployment {
  id: string;
  appId: string;
  buildId: string;
  url: string;
  previewUrl: string | null;
  pagesProject: string;
  pagesDeploymentId: string | null;
  status: DeploymentStatus;
  createdAt: string;
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

/** A file attached to the build conversation (image mockup, code, spec, PDF…). */
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

/**
 * Concrete, user-friendly app features chosen in the composer and built in from
 * the FIRST build. Baseline (responsive / SEO / PWA) is always applied; these add
 * to it. Persisted on `App.featureSpec` so iterate/edit preserves them.
 */
export interface AppFeatureSpec {
  /** Light/dark support. 'both' = light+dark with a toggle (default). */
  theme?: "both" | "light" | "dark";
  /** UI language labels (e.g. "Tiếng Việt", "English"). >1 → i18n + switcher. Default ["Tiếng Việt"]. */
  languages?: string[];

  // ── Nội dung ──
  /** Blog / news section (list + detail, backed by DB + API). */
  blog?: boolean;
  /** FAQ / câu hỏi thường gặp section (accordion). */
  faq?: boolean;
  /** Customer testimonials / cảm nhận section. */
  testimonials?: boolean;
  /** Image gallery / portfolio. */
  gallery?: boolean;

  // ── Bán hàng ──
  /** Simple checkout / payment flow. */
  payments?: boolean;
  /** Product ratings + reviews/comments (saved to DB). */
  reviews?: boolean;
  /** Booking / appointment / reservation scheduling (saved to DB). */
  booking?: boolean;
  /** Working search over the main content. */
  search?: boolean;

  // ── Tương tác khách ──
  /** Contact form that saves to the DB. */
  contactForm?: boolean;
  /** Newsletter / email capture (saved to DB). */
  newsletter?: boolean;
  /** Floating support-chat widget. */
  chat?: boolean;
  /** Social share buttons + social links. */
  socialShare?: boolean;

  // ── Tài khoản & vận hành ──
  /** End-user login / register. */
  auth?: boolean;
  /** Internal analytics dashboard (views / orders). */
  analytics?: boolean;
  /** Notifications system (in-app / email). */
  notifications?: boolean;
  /** Cookie-consent (GDPR) banner. */
  cookieConsent?: boolean;
}

export interface CreateBuildRequest {
  prompt: string;
  name?: string;
  track?: Track;
  /** Ids of uploaded files to attach as context (images + text). */
  attachmentIds?: string[];
  /** Re-build / iterate an existing app instead of creating a new one. */
  appId?: string;
  /**
   * App "surfaces" the user explicitly wants (overrides the AI's static/fullstack
   * guess). `backend: 'fullstack'` forces a real DB + API; `cms: true` adds an
   * admin/CMS area (and implies full-stack). On an existing app these UPGRADE it.
   */
  backend?: BackendKind;
  cms?: boolean;
  /** Per-build model choice (defaults to 'opus'). Drives credit cost. */
  model?: ModelChoice;
  /** Concrete app features the user wants built in from the start (dark mode,
   *  languages, blog, auth, payments…). Persisted on the app + injected into codegen. */
  features?: AppFeatureSpec;
  /** Brand/accent color (`#rrggbb`); fed into codegen as the main accent. */
  primaryColor?: string;
  /** Preferred layout/canvas hint (e.g. 'dashboard'|'landing'|'auto'). */
  style?: string;
  /**
   * Public website URL to CLONE. When set, the pipeline fetches the page and
   * feeds its layout/sections/copy/colours/images to codegen as a faithful
   * "rebuild this site" reference. Persisted on the app so iterate builds keep
   * the reference. Treated as untrusted content (prompt-injection guarded).
   */
  sourceUrl?: string;
  /**
   * Workflow preset — how much of the design pipeline to run (see `BuildPreset`).
   * Omitted ⇒ `balanced` (exactly today's pipeline), except when `sourceUrl` is
   * set, where the server defaults to `turbo` so the design stage can't overwrite
   * the source site's layout with an invented one.
   */
  preset?: BuildPreset;
  /**
   * When the build runs the design stage, whether to auto-approve the generated
   * Blueprint and continue immediately (default true). When false the pipeline
   * pauses at `awaiting_approval` until the user approves at the gate. Only
   * affects the first design of a brand-new app; iterate/edit builds ignore it.
   * `preset: 'thorough'` implies `autoApprove: false`.
   */
  autoApprove?: boolean;
  /**
   * "Bộ site": tách hệ thống thành nhiều site độc lập — mỗi mặt được chọn là một app riêng với
   * một lượt build riêng, nối nhau qua site API dùng chung. Dưới 2 mặt thì máy chủ bỏ qua.
   */
  surfaces?: SiteSurface[];
}
export interface CreateBuildResponse {
  buildId: string;
  appId: string;
}

/** `PATCH /v1/builds/:id/blueprint` — save the user's edits to a draft Blueprint. */
export interface UpdateBlueprintRequest {
  blueprint: Blueprint;
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
  totalApps: number;
  liveApps: number;
  totalBuilds: number;
  succeededBuilds: number;
  failedBuilds: number;
  totalDeployments: number;
  /** Sum of public-page visits across the user's apps. */
  totalVisits: number;
  /** ISO timestamp the user account was created. */
  joinedAt: string;
}

/** One cell of the contribution graph: a calendar day and its build count. */
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
// Billing — subscription plans & monthly build quota
// ─────────────────────────────────────────────────────────────────────────────

export type PlanId = 'free' | 'starter' | 'pro' | 'enterprise';
export const PLAN_IDS: readonly PlanId[] = ['free', 'starter', 'pro', 'enterprise'] as const;

// ─── Per-build model choice (Base44-style credit system) ──────────────────────

/** The model a build runs on. Opus is smarter; Sonnet is cheaper/faster. */
export type ModelChoice = 'opus' | 'sonnet';
export const MODEL_CHOICES: readonly ModelChoice[] = ['opus', 'sonnet'] as const;

/**
 * @deprecated Billing moved from per-build credits to a monthly TOKEN budget that
 * each build meters against by REAL token usage (see `PlanCatalogEntry.monthlyTokens`
 * + `MeSubscription.percentUsed`). Kept only for legacy admin-config migration.
 */
export const MODEL_COST: Record<ModelChoice, number> = { opus: 5, sonnet: 1 };

/** Resolved Anthropic model id per choice. CONFIGURABLE. */
export const MODEL_IDS: Record<ModelChoice, string> = {
  opus: 'claude-opus-4-8',
  sonnet: 'claude-sonnet-4-6',
};

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

/** Default model used when a build doesn't specify one. Sonnet = faster/cheaper
 * (fewer tokens) so the default experience is affordable; users can pick Opus. */
export const DEFAULT_MODEL: ModelChoice = 'sonnet';

/**
 * Billing unit. A plan grants a MONTHLY TOKEN BUDGET (`monthlyTokens`); each build
 * meters its REAL token usage (input + output) against it. Users only ever see a
 * PERCENT (used ÷ budget). Bigger apps use more tokens → consume more % — which is
 * why % is fairer than a flat per-build credit. The token numbers are internal /
 * admin-tunable; never surface raw tokens to end users.
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
  /** Monthly TOKEN budget = 100% of the plan. Builds meter real token usage against
   *  it; users see only the resulting percent. Internal/admin-tunable. */
  monthlyTokens: number;
  /** @deprecated legacy per-build credit allowance — superseded by monthlyTokens. */
  credits?: number;
  /** Max apps allowed in `live` status at once. */
  maxLiveApps: number;
  /** Whether this plan may RUN apps on the real Docker server (full-stack incl.
   *  Python + custom domains). A premium capability — real always-on resources. */
  serverDeploy?: boolean;
  /** Max containers/services one app may run on the Docker server (resource cap;
   *  0 = server-deploy not available on this plan). */
  maxServerServices?: number;
  /**
   * Dung lượng lưu trữ ĐƯỢC TẶNG theo gói, tính bằng MB.
   *
   * Tách hẳn khỏi `monthlyTokens`: hạn mức token là thứ tiêu đi rồi hết mỗi tháng, còn dung
   * lượng là thứ TÍCH LUỸ — video và mã nguồn app nằm đó cho tới khi người dùng xoá. Gộp hai
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
  /** ISO timestamp when the monthly usage resets (null until first build). */
  resetAt: string | null;
  /** Count of the user's apps currently in `live` status. */
  liveApps: number;
  maxLiveApps: number;
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

/** Per-model API-cost breakdown (a single bucket of `AdminReport.byModel`). */
export interface ModelCostBucket {
  builds: number;
  usd: number;
  inputTokens: number;
  outputTokens: number;
}

/** Profit & cost dashboard for the admin CMS. */
export interface AdminReport {
  period: ReportPeriod;
  apiCost: {
    totalUsd: number;
    inputTokens: number;
    outputTokens: number;
    /** Builds that carried a usage record. */
    builds: number;
  };
  byModel: Record<ModelChoice, ModelCostBucket>;
  builds: {
    total: number;
    succeeded: number;
    failed: number;
    canceled: number;
    /** succeeded / total, 0..1. */
    successRate: number;
  };
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
    cloudflare: boolean;
    deployTarget: 'cloudflare-pages';
  };
}

export interface ApiError {
  statusCode: number;
  error: string;
  message: string | string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// SSE event contract — `GET /v1/builds/:id/stream`
// ─────────────────────────────────────────────────────────────────────────────

export type SseEvent =
  | { type: 'snapshot'; build: Build }
  | { type: 'log'; line: LogLine }
  | { type: 'stage'; stage: StageState }
  | { type: 'status'; status: BuildStatus }
  | { type: 'blueprint'; blueprint: Blueprint }
  | { type: 'result'; result: BuildResult }
  | { type: 'done'; build: Build }
  | { type: 'error'; message: string; retryable?: boolean };

// ─────────────────────────────────────────────────────────────────────────────
// Platform configuration (single editable row, managed from the admin CMS)
// ─────────────────────────────────────────────────────────────────────────────

export interface TrackConfig {
  label: string;
  triggerKeywords: string[];
  stack: Record<string, string>;
  output: string;
}
export interface SubdomainRules {
  slugify: string;
  onConflict: string;
  overwriteExisting: boolean;
  autoSsl: boolean;
}
export interface PlatformLimits {
  maxCoreFeaturesV0: number;
  maxFixAttempts: number;
  costLimitUsd: number;
  maxConcurrentJobs: number;
}
export interface PlatformPrompts {
  classify: string;
  /** Design-intake prompt → emits a structured Blueprint (tool-use). */
  blueprint: string;
  spec: string;
  codegen: string;
  fix: string;
  guide: string;
}
/**
 * Runtime-editable billing configuration. Lives inside the singleton
 * `Setting.config` JSON so prices/credits/model-cost can change WITHOUT a
 * redeploy. Every field is optional: the API merges what's stored over the
 * hardcoded defaults in `src/billing/plans.ts` (+ MODEL_COST), so an absent
 * section leaves behaviour identical to the compiled-in catalog.
 */
export interface BillingPlanOverride {
  priceVnd?: number;
  /** Monthly TOKEN budget (= 100% of the plan). Admin-tunable. */
  monthlyTokens?: number;
  /** @deprecated legacy per-build credit allowance. */
  credits?: number;
  maxLiveApps?: number;
}
export interface BillingConfig {
  /** VND per 1 USD, used to convert revenue (VND) ↔ API cost (USD). Default 25000. */
  vndPerUsd?: number;
  /** Per-plan price / credit allowance / live-app cap overrides. */
  plans?: Partial<Record<PlanId, BillingPlanOverride>>;
  /** Credit cost per build by model (defaults = MODEL_COST: opus 5, sonnet 1). */
  modelCredits?: Partial<Record<ModelChoice, number>>;
  /**
   * Whether the free plan can actually be USED. Default true. When false,
   * free-plan users are blocked from creating builds (must upgrade) and the
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
  modelCredits: Record<ModelChoice, number>;
  /** Whether the free plan is usable (default true). */
  freePlanEnabled: boolean;
  /** Resolved discount campaign (percent 0 = none). */
  discount: DiscountInfo;
}

/**
 * App moderation settings. `bannedKeywords` drives the admin "flagged" heuristic:
 * an app is flagged when its name/description/latest build prompt contains any of
 * these (case-insensitive). Stored at `Setting.config.moderation`.
 */
export interface ModerationConfig {
  bannedKeywords: string[];
}

export const DEFAULT_BANNED_KEYWORDS: readonly string[] = [
  'casino',
  'sex',
  'phishing',
  'lừa đảo',
  'cờ bạc',
  'súng',
  'ma túy',
] as const;

export interface PlatformConfig {
  version: string;
  tracks: Record<Track, TrackConfig>;
  limits: PlatformLimits;
  subdomainRules: SubdomainRules;
  prompts: PlatformPrompts;
  /** Runtime-editable pricing/credits/model-cost (merged over plans.ts defaults). */
  billing?: BillingConfig;
  /** App moderation: banned-keyword list backing the admin "flagged" heuristic. */
  moderation?: ModerationConfig;
}

export const DEFAULT_CONFIG: PlatformConfig = {
  version: '1.0.0',
  tracks: {
    web: {
      label: 'Web App',
      triggerKeywords: ['website', 'web app', 'trang web', 'landing', 'dashboard', 'tool online', 'web'],
      stack: { frontend: 'Vite + React + TS', styling: 'Tailwind', hosting: 'Cloudflare Pages' },
      output: 'Subdomain công khai {slug}.pages.dev (+ {slug}.toolswave.net khi có DNS) + QR',
    },
    mobile: {
      label: 'Mobile App',
      triggerKeywords: ['app điện thoại', 'ios', 'android', 'mobile', 'di động', 'react native', 'expo'],
      stack: { framework: 'React Native + Expo', preview: 'Expo Go (QR)', build: 'EAS' },
      output: 'Dự án Expo + QR preview iOS/Android + hướng dẫn chạy',
    },
    extension: {
      label: 'Extension / Khác',
      triggerKeywords: ['extension', 'tiện ích', 'plugin', 'add-on', 'bot', 'script', 'chrome'],
      stack: { varies: 'true' },
      output: 'Source ZIP + HUONG-DAN-CAI-DAT.md',
    },
    desktop: {
      label: 'App desktop',
      triggerKeywords: ['desktop', 'electron', 'tauri', 'app máy tính', 'windows app', 'macos app', 'phần mềm máy tính', 'ứng dụng desktop'],
      stack: { framework: 'Electron + Vite + React + TS', build: 'electron-builder' },
      output: 'Dự án Electron + hướng dẫn chạy (npm install && npm start) + đóng gói app cài đặt',
    },
    game: {
      label: 'Game',
      triggerKeywords: ['game', 'trò chơi', 'phaser', 'canvas game', '2d game', 'arcade', 'platformer', 'game html5'],
      stack: { engine: 'HTML5 Canvas / Phaser 3', frontend: 'Vite + TS', hosting: 'Cloudflare Pages' },
      output: 'Game HTML5 chơi ngay trên trình duyệt + subdomain công khai + QR',
    },
  },
  limits: { maxCoreFeaturesV0: 5, maxFixAttempts: 2, costLimitUsd: 5, maxConcurrentJobs: 2 },
  subdomainRules: {
    slugify: 'không dấu, viết thường, gạch ngang',
    onConflict: 'thêm hậu tố -2, -3',
    overwriteExisting: false,
    autoSsl: true,
  },
  moderation: { bannedKeywords: [...DEFAULT_BANNED_KEYWORDS] },
  prompts: {
    classify:
      'Bạn là bộ phân loại. Phân loại yêu cầu sau vào đúng MỘT track: web | mobile | extension | desktop | game. ' +
      'web = website/trang web/dashboard; mobile = app điện thoại (Expo); extension = tiện ích trình duyệt; ' +
      'desktop = phần mềm máy tính (Electron); game = trò chơi (HTML5/canvas). ' +
      'Chỉ trả về DUY NHẤT một từ (web, mobile, extension, desktop, hoặc game), không giải thích.\n\nYêu cầu: {{USER_PROMPT}}',
    blueprint:
      'Bạn là kiến trúc sư sản phẩm. Phân tích yêu cầu cho app track {{TRACK}} và trả về BLUEPRINT ' +
      'qua tool emit_blueprint. Gồm: appName, summary ngắn, pages (các trang: path/title/kind), ' +
      'entities (model dữ liệu: name + fields{name,type} + ownership), auth (có cần đăng nhập không), ' +
      'integrations, navigation. CHỈ tính năng cốt lõi (v0), tối đa ~6 trang & ~6 entity. ' +
      'QUYẾT ĐỊNH backend: đặt "fullstack" NẾU app cần lưu/đọc dữ liệu chung lâu dài ' +
      '(danh sách, CRUD, ghi chú, người dùng, đặt chỗ, tồn kho…) — khi đó LIỆT KÊ entities + fields. ' +
      'Đặt "static" nếu app không cần lưu trữ (máy tính, landing, công cụ cục bộ) — khi đó entities rỗng. ' +
      'Tiếng Việt cho nhãn hiển thị. Yêu cầu gốc: {{USER_PROMPT}}',
    spec:
      'Viết đặc tả ngắn gọn (tối đa 15 dòng, markdown) cho app track {{TRACK}}. ' +
      'Gồm: tên app, các màn hình/trang, luồng người dùng chính, model dữ liệu nếu cần, stack. ' +
      'Chỉ làm tính năng cốt lõi (v0). Yêu cầu gốc: {{USER_PROMPT}}',
    codegen:
      'Sinh code đầy đủ cho app theo đặc tả, dùng stack {{STACK}}. ' +
      'Yêu cầu: TypeScript, code sạch tách component, KHÔNG hardcode secret, responsive, build được ngay. ' +
      'Xuất TOÀN BỘ file qua tool emit_project (KHÔNG trả JSON thô, KHÔNG markdown). Đặc tả:\n{{SPEC}}',
    fix:
      'Build thất bại. Tìm NGUYÊN NHÂN GỐC và sửa để build pass, GIỮ NGUYÊN tính năng. ' +
      'CHỈ trả về file bạn TẠO MỚI hoặc SỬA (mỗi file kèm nội dung ĐẦY ĐỦ MỚI), KHÔNG xuất lại file không đổi — ' +
      'hệ thống tự giữ nguyên chúng. Lỗi:\n{{BUILD_ERROR}}\n\nFiles:\n{{FILES}}',
    guide:
      'Viết HUONG-DAN-CAI-DAT.md (markdown) đủ 6 phần cho người không rành kỹ thuật: ' +
      '1) Yêu cầu, 2) Cài đặt từng bước, 3) Cấu hình (bảng trường|lấy ở đâu|ví dụ), ' +
      '4) Kiểm tra 30 giây, 5) ≥3 lỗi thường gặp + xử lý, 6) Gỡ cài đặt. Về app:\n{{SPEC}}',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Cửa hàng (store)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Loại hàng bán. Một `StoreListing` cho MỌI loại — trang cửa hàng, tìm kiếm, SEO và quản trị
 * đều nhìn mọi món như nhau; phần khác nhau nằm gọn trong `detail`.
 *
 * Giai đoạn 1 chỉ có ba loại đầu (đọc từ hệ portal). `app` | `tool` | `service` là chỗ đã chừa
 * sẵn cho bàn giao app và tool tự dựng — xem `docs/hop-nhat-cua-hang-va-nen-tang.md`.
 */
export type StoreKind = 'software' | 'document' | 'sourcecode' | 'app' | 'tool' | 'service';
export const STORE_KINDS: readonly StoreKind[] = [
  'software',
  'document',
  'sourcecode',
  'app',
  'tool',
  'service',
] as const;

/** Phần riêng của từng loại hàng. Mọi trường đều tuỳ chọn — chỉ loại tương ứng mới điền. */
export interface StoreListingDetail {
  /** document: PDF | VIDEO | EXCEL | ZIP | OTHER. */
  fileType?: string;
  /** sourcecode: ngôn ngữ / công nghệ. */
  languages?: string[];
  /** sourcecode: phiên bản đang bán. */
  version?: string | null;
  /** sourcecode: cần chuẩn bị gì trước khi chạy. */
  prerequisites?: string | null;
  /** sourcecode: tài liệu đặc tả (markdown). */
  specDocument?: string | null;
  /** software: ACCOUNT | KEY | PACKAGE. */
  inventoryType?: string;
  /** software: còn bao nhiêu suất trong kho. */
  availableCount?: number;
}

/**
 * Một món bán được — hình dạng DUY NHẤT mà web đọc, bất kể dữ liệu đang nằm ở đâu.
 *
 * Giai đoạn 1 nguồn là API của portal (hệ B); giai đoạn 2 nguồn đổi sang bảng `Listing` trong
 * cơ sở dữ liệu của chính hệ này. Hợp đồng này không đổi giữa hai giai đoạn — đó là lý do nó
 * tồn tại thay vì web gọi thẳng portal.
 */
export interface StoreListing {
  kind: StoreKind;
  slug: string;
  name: string;
  descriptionShort: string | null;
  /** Mô tả đầy đủ — chỉ trả ở trang chi tiết, danh sách để null cho nhẹ. */
  description: string | null;
  thumbnailUrl: string | null;
  gallery: string[];
  priceVnd: number;
  category: string | null;
  totalSold: number;
  /** `null` khi loại hàng không có khái niệm tồn kho (tài liệu, mã nguồn bán bản sao). */
  inStock: boolean | null;
  detail: StoreListingDetail;
  /**
   * Nơi đặt mua. Giai đoạn 1 trỏ sang portal — nơi DUY NHẤT còn nhận đơn; đổi thành đường mua
   * nội bộ ở giai đoạn 3. Web chỉ việc mở liên kết này, không tự đoán.
   */
  buyUrl: string;
  updatedAt: string | null;
}

/** Nhóm hàng trên trang /store — mỗi loại một hàng thẻ. */
export interface StoreOverviewGroup {
  kind: StoreKind;
  total: number;
  items: StoreListing[];
}

export interface StoreOverview {
  groups: StoreOverviewGroup[];
  /** Nguồn dữ liệu đang dùng — `portal` (đọc hệ B) hay `local` (bảng của hệ này). */
  source: 'portal' | 'local';
}

/** Chuyên mục (hoặc công nghệ) có hàng + số món, dựng từ toàn bộ danh mục chứ không từ một trang. */
export interface StoreFacet {
  name: string;
  count: number;
}

/**
 * Thứ tự bày hàng. `ban-chay` là mặc định.
 *
 * `moi` sắp theo `updatedAt` chứ không theo ngày tạo: với mã nguồn, bản vừa được cập nhật đáng
 * xem hơn bản mới đăng mà đã nằm im.
 */
export type StoreSort = 'ban-chay' | 'moi' | 'gia-thap' | 'gia-cao' | 'ten';
export const STORE_SORTS: readonly StoreSort[] = ['ban-chay', 'moi', 'gia-thap', 'gia-cao', 'ten'] as const;

/**
 * Danh mục đang đọc từ đâu: `portal` là đi nhờ API hệ B (giai đoạn 1), `local` là bảng `Listing`
 * trong cơ sở dữ liệu của chính hệ này (giai đoạn 2).
 *
 * Trường này có mặt vì giai đoạn 2 KHÔNG cắt nguồn cũ trong một nhát: hai nguồn sẽ chạy song song
 * một thời gian, và khi cửa hàng hiện sai hàng thì câu hỏi đầu tiên luôn là "dữ liệu này ở đâu
 * ra". Không có nó thì phải đi đọc log máy chủ để trả lời.
 *
 * Lưu ý: `StoreOverview.source` khai đúng hai giá trị này ở dạng chữ trực tiếp (viết trước khi có
 * tên gọi chung). Hai bên cùng hình dạng nên không lệch được, nhưng ai động vào `StoreOverview`
 * lần tới thì đổi sang `StoreSource` luôn.
 */
export type StoreSource = 'local' | 'portal';

// ─────────────────────────────────────────────────────────────────────────────
// Quản trị cửa hàng (giai đoạn 2) — CHỈ dùng cho CMS, KHÔNG ra API công khai
//
// Ranh giới giữa khối này và `StoreListing` ở trên là thứ đáng giữ nhất ở đây. `StoreListing` là
// cái ai cũng đọc được; mọi thứ dưới đây đứng sau cổng đăng nhập quản trị. Trộn hai bên lại là
// cách lỗ rò giá vốn bên portal đã xảy ra hôm 23/09 — không ai cố ý để lộ `priceCost`, chỉ là nó
// nằm chung một hình dạng với phần công khai và không có gì chặn.
//
// Vì vậy có ĐÚNG MỘT thứ của model `Listing` không xuất hiện ở đây dù trông rất tiện: `deliveryEnc`
// (driveLink / zipFileUrl / gitlabRepoId). Nó đi tuyến riêng, xem `ListingDelivery`.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Trạng thái một món bán.
 *
 * `hidden` KHÔNG phải là xoá: đơn hàng cũ vẫn phải đọc được tên và giá của món đã bán, nên gỡ
 * hàng là đổi trạng thái chứ không bao giờ là xoá dòng. `sold_out` chỉ có nghĩa với `software`
 * (hết suất trong kho); tài liệu và mã nguồn bán bản sao nên không bao giờ hết hàng.
 */
export type ListingStatus = 'active' | 'hidden' | 'sold_out';
export const LISTING_STATUSES: readonly ListingStatus[] = ['active', 'hidden', 'sold_out'] as const;

/**
 * Một món bán nhìn từ trang quản trị — mọi cột của model `Listing` TRỪ `deliveryEnc`.
 *
 * Khác `StoreListing` ở ba chỗ, và cả ba đều là chủ ý:
 *  - Có `id`, `sortOrder`, `legacyId`, `createdAt`, `notesInternal` — thứ chỉ người bán cần.
 *  - Có `compareAtVnd` và `status` thật, thay vì chỉ thấy hàng `active` như ngoài mặt tiền.
 *  - KHÔNG có `buyUrl`: đó là thứ máy chủ tính ra cho web, không phải dữ liệu để sửa.
 *
 * `deliveryEnc` vắng mặt ở đây là cố ý, không phải bỏ sót. Bất cứ thứ gì lọt vào hình dạng này
 * đều sẽ nằm trong bộ nhớ đệm của trình duyệt quản trị, trong log lỗi, trong màn hình chia sẻ lúc
 * hỗ trợ khách. Đường tải về và id repo không được phép đi cùng chuyến với tên và giá.
 */
export interface AdminListing {
  id: string;
  kind: StoreKind;
  slug: string;
  name: string;
  descriptionShort: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  gallery: string[];
  priceVnd: number;
  /** Giá gạch ngang. `null` = không khuyến mãi. */
  compareAtVnd: number | null;
  category: string | null;
  status: ListingStatus;
  sortOrder: number;
  /** Máy chủ tự đếm theo đơn đã trả tiền — quản trị đọc chứ không sửa. */
  totalSold: number;
  detail: StoreListingDetail;
  /** `null` = suy ra từ `name` + `descriptionShort` lúc dựng trang. */
  seo: AppSeo | null;
  /** Ghi chú nội bộ. Không bao giờ ra ngoài, kể cả khi món đang bán. */
  notesInternal: string | null;
  /** Chỉ `kind=app|tool`: App của nền tảng đứng sau món này. */
  appId: string | null;
  /** Bản build ĐÓNG BĂNG được bán — người mua hôm nay và tháng sau nhận cùng một thứ. */
  buildId: string | null;
  /** `null` = Larkwave bán. Giai đoạn này luôn `null` (xem mục 12 của kế hoạch). */
  sellerId: string | null;
  /** Id bên hệ B. Có giá trị nghĩa là dòng này do script nhập sinh ra, không phải gõ tay. */
  legacyId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * `PATCH /v1/admin/store/listings/:id` — những cột quản trị được phép sửa.
 *
 * Quy ước quan trọng, API và CMS phải hiểu giống nhau:
 *  - Bỏ trống (`undefined`) = KHÔNG động tới cột đó. Gửi `null` = xoá trắng cột đó.
 *    Thiếu luật này thì một form CMS chỉ sửa giá cũng sẽ vô tình xoá mô tả.
 *  - `detail` GỘP theo từng khoá, không ghi đè cả khối. Trang quản trị sửa tài liệu đặc tả chỉ
 *    gửi `specDocument`, và ghi đè cả khối sẽ thổi bay `languages` do script nhập dựng ra. Cái
 *    giá của lựa chọn này: muốn xoá một khoá thì phải gửi `null` (hoặc `[]` với `languages`) chứ
 *    không bỏ trống được — bỏ trống nghĩa là giữ nguyên, giống mọi cột khác.
 *
 * Vắng mặt ở đây cũng là hợp đồng: `kind` không sửa được (đổi loại là đổi cả đường dẫn công khai
 * lẫn cách giao hàng — việc đó là tạo món mới), `totalSold` và `legacyId` do máy chủ giữ.
 */
export interface UpdateListingRequest {
  /**
   * Đổi slug là đổi URL đang chạy thật (`/store/<kind>/<slug>`) — link cũ chết, SEO mất. Sửa
   * trước khi mở bán thì không sao; sửa sau thì phải kèm chuyển hướng, và đó là việc bên web.
   */
  slug?: string;
  name?: string;
  descriptionShort?: string | null;
  description?: string | null;
  thumbnailUrl?: string | null;
  gallery?: string[];
  /** Int VND. Portal trả Decimal ra JSON dạng CHUỖI ("100000.00") — chỗ nhập liệu phải làm tròn. */
  priceVnd?: number;
  compareAtVnd?: number | null;
  category?: string | null;
  status?: ListingStatus;
  sortOrder?: number;
  /**
   * Phần riêng của từng loại, gộp theo từng khoá (xem luật ở trên). `specDocument` và
   * `prerequisites` của mã nguồn nằm TRONG ĐÂY chứ không phải ở cấp ngoài — chúng là nội dung
   * công khai của trang bán, nên đi chung với `detail` để rõ ràng rằng mọi thứ trong khối này
   * đều ra ngoài được.
   */
  detail?: StoreListingDetail;
  /** `null` = quay về suy ra từ tên + mô tả ngắn. */
  seo?: AppSeo | null;
  notesInternal?: string | null;
  appId?: string | null;
  buildId?: string | null;
}

/**
 * Đường giao hàng của một món — nội dung đã giải mã của `Listing.deliveryEnc`.
 *
 * Đi tuyến RIÊNG (`GET`/`PUT /v1/admin/store/listings/:id/delivery`), không bao giờ nhúng vào
 * `AdminListing`. Lý do không phải là sạch sẽ về kiến trúc mà là thực dụng: một tuyến riêng có
 * thể ghi log truy cập riêng, giới hạn riêng, và khi có người hỏi "ai đã xem link tải của món
 * này" thì có chỗ để trả lời. Nhét chung vào danh sách món thì câu hỏi đó không trả lời được.
 *
 * Dùng cho cả hai chiều đọc và ghi: gửi `null` cho một trường là xoá đường giao đó.
 */
export interface ListingDelivery {
  /** Link Google Drive — cách hệ B giao tài liệu và một phần mã nguồn. */
  driveLink?: string | null;
  /** File ZIP trên kho lưu trữ. */
  zipFileUrl?: string | null;
  /** Id repo GitLab để mời người mua vào (`inviteToGitlab` bên hệ B). */
  gitlabRepoId?: string | null;
}

/**
 * `POST /v1/admin/store/grant` — cấp thẳng một món vào tài khoản khách, không qua thanh toán.
 *
 * Đây là đường cho việc đã xảy ra hằng ngày bên hệ B: khách chuyển khoản tay, khách mua ngoài
 * sàn, đền bù cho một lần giao hỏng. Trước giờ nhân viên sửa thẳng trong cơ sở dữ liệu; tuyến này
 * tồn tại để việc đó để lại dấu vết (`Order.grantedBy` / `grantNote`) thay vì biến mất.
 */
export interface GrantProjectRequest {
  /**
   * Email người nhận. Đây là đường thường dùng — phiếu hỗ trợ đến kèm email chứ không kèm id.
   * Email KHÔNG khớp tài khoản nào thì tuyến này báo lỗi; nó không tạo tài khoản hộ, vì tài khoản
   * sinh ra từ một ô nhập sai chính tả sẽ không ai nhận và cũng không ai dọn.
   */
  email?: string;
  /** Id tài khoản, khi CMS đã chọn người từ danh sách — chính xác hơn email, ưu tiên hơn nếu có cả hai. */
  userId?: string;
  listingId: string;
  /** Vì sao cấp. Ghi vào `Order.grantNote`; sáu tháng sau đây là thứ duy nhất giải thích đơn 0đ này. */
  note?: string;
}

export interface GrantProjectResponse {
  /** Đơn 0đ sinh ra để giữ lịch sử — khách vẫn thấy món này trong mục đơn hàng của mình. */
  orderId: string;
  orderCode: string;
  entitlementId: string;
  /**
   * `true` = người này ĐÃ có quyền với món đó từ trước, tuyến chỉ trả lại đơn và quyền cũ chứ
   * không cấp thêm lần nữa (`@@unique([userId, kind, listingId])` chặn ở tầng dữ liệu).
   *
   * Trường này có mặt để CMS nói đúng sự thật với người bấm nút: "đã có sẵn" khác hẳn "vừa cấp
   * xong". Bấm hai lần vì mạng chậm là chuyện bình thường, và câu trả lời cho lần bấm thứ hai
   * không được phép là một đơn 0đ thứ hai.
   *
   * CHỖ HỞ ĐÃ BIẾT: `Entitlement.orderId` cho phép null (quyền do quản trị cấp tay thời hệ B).
   * Gặp một quyền cũ như vậy thì không có `orderId`/`orderCode` nào để trả, mà hai trường trên
   * lại không nhận null. Máy chủ phải chọn: hoặc sinh một `Order` 0đ vá vào quyền cũ, hoặc hai
   * trường đó phải mở cho null. Chưa chốt — xem `GrantResult` bên `apps/api/src/store/`.
   */
  daCapTruocDo: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Convert arbitrary (incl. Vietnamese) text to a DNS/Pages-safe slug. */
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

/** Sinh trường SEO cho bài blog — dùng chung giữa API và script đăng bài chạy ngoài máy chủ. */
export * from './blog-seo';
export { deriveCategory } from './blog-seo';

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
