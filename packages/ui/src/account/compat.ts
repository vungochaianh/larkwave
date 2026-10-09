/**
 * Lớp tương thích: Larkwave dùng chung API của Toolswave (cùng tài khoản, cùng gói), nhưng vài
 * endpoint bên Larkwave từng viết lại theo hoạt động AI thì bên Toolswave vẫn tính theo app/build.
 * Hàm THUẦN (không import gì) để bài kiểm gọi đúng luật này.
 *
 * `GET /me/overview`:
 *   - API Larkwave: `{ aiRuns, remoteTasks, artifacts, skills, scheduledTasks, reports, joinedAt }`
 *   - API Toolswave: `{ totalApps, liveApps, totalBuilds, succeededBuilds, failedBuilds,
 *     totalDeployments, totalVisits, joinedAt }`
 * Thiếu lớp này thì các ô "Lượt AI / Tác vụ từ xa / Kỹ năng…" nằm skeleton mãi (value undefined).
 * Toolswave không có số đếm AI → điền 0 và gắn `partial: true` để giao diện hiện "—".
 */
export interface OverviewLike {
  aiRuns: number;
  remoteTasks: number;
  artifacts: number;
  skills: number;
  scheduledTasks: number;
  reports: number;
  joinedAt: string;
  /** true = máy chủ không có số đếm này (API Toolswave) — hiện "—" thay vì 0. */
  partial?: boolean;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function normalizeOverview(raw: unknown): OverviewLike {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const keys = ['aiRuns', 'remoteTasks', 'artifacts', 'skills', 'scheduledTasks', 'reports'] as const;
  const got = keys.map((k) => num(o[k]));
  const partial = got.some((v) => v === null);
  const joinedAt = typeof o.joinedAt === 'string' ? o.joinedAt : '';
  const out: OverviewLike = {
    aiRuns: got[0] ?? 0,
    remoteTasks: got[1] ?? 0,
    artifacts: got[2] ?? 0,
    skills: got[3] ?? 0,
    scheduledTasks: got[4] ?? 0,
    reports: got[5] ?? 0,
    joinedAt,
  };
  if (partial) out.partial = true;
  return out;
}

/** Giá trị hiển thị của một ô đếm: "—" khi máy chủ không có số này. */
export function overviewCell(ov: OverviewLike | null | undefined, key: keyof Omit<OverviewLike, 'joinedAt' | 'partial'>): number | string | undefined {
  if (!ov) return undefined;
  return ov.partial && ov[key] === 0 ? '—' : ov[key];
}

/**
 * `GET /storage/usage`: API Toolswave trả thêm nhóm `apps` / `video` / `image` (dữ liệu App Builder,
 * Video, Ảnh của Toolswave). Larkwave chỉ quản lý `uploads` + `chat`: hiện các nhóm kia là cho
 * phép người dùng XOÁ mã nguồn app / dự án video của Toolswave ngay từ Larkwave. Lọc bỏ ở đây,
 * nhưng GIỮ tổng dung lượng/hạn mức (đó là hạn mức chung của tài khoản).
 */
export const LARKWAVE_STORAGE_CATEGORIES = ['uploads', 'chat'] as const;

export function isLarkwaveStorageCategory(c: unknown): boolean {
  return typeof c === 'string' && (LARKWAVE_STORAGE_CATEGORIES as readonly string[]).includes(c);
}

export function filterStorageUsage<U extends { buckets?: { category?: unknown }[] }>(raw: U): U {
  if (!raw || !Array.isArray(raw.buckets)) return raw;
  return { ...raw, buckets: raw.buckets.filter((b) => isLarkwaveStorageCategory(b?.category)) };
}
