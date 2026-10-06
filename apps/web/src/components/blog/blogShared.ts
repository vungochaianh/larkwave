/**
 * Hằng số + hàm thuần dùng chung cho /blog và /blog/[slug]. KHÔNG có "use client": hai trang là
 * server component, các island client import lẻ từng hàm — file này phải chạy được ở cả hai phía.
 */

export const SITE = "https://toolswave.net";
export const BRAND = "#6C5CE7";
export const GRADIENT =
  "linear-gradient(135deg, #6C5CE7 0%, #A66BFF 45%, #FF7AB6 75%, #4FB6FF 100%)";

/** Số bài mỗi trang danh sách. 12 chia hết cho lưới 2/3/4 cột nên trang cuối không lệch hàng. */
export const PAGE_SIZE = 12;

export function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

/** Ước lượng phút đọc: ~200 từ/phút tiếng Việt, tối thiểu 1 — để người đọc quyết định có đọc ngay không. */
export function readingMinutes(markdown: string): number {
  const words = (markdown || "").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/**
 * Dựng URL danh sách từ bộ lọc. Lọc nằm TRONG URL (không phải state) để link chia sẻ được, nút
 * Back của trình duyệt hoạt động, và Google index được từng chuyên mục. Trang 1 không ghi `page`
 * để /blog?category=x và /blog?category=x&page=1 không thành hai URL cho cùng một nội dung.
 *
 * `lang` đi kèm khi KHÔNG phải tiếng Việt. Thiếu nó thì mọi liên kết lọc trên trang tiếng Anh trỏ
 * tới một địa chỉ không khai ngôn ngữ: người dùng thật vẫn ra tiếng Anh nhờ cookie, nhưng máy tìm
 * kiếm (không mang cookie) đi từ trang tiếng Anh sang lại rơi vào bản tiếng Việt. Bỏ qua khi
 * lang='vi' để địa chỉ mặc định vẫn sạch, không sinh bản trùng /blog?lang=vi.
 */
export function blogHref(q: {
  category?: string | null;
  tag?: string | null;
  page?: number;
  lang?: string | null;
}): string {
  const sp = new URLSearchParams();
  if (q.category) sp.set("category", q.category);
  if (q.tag) sp.set("tag", q.tag);
  if (q.page && q.page > 1) sp.set("page", String(q.page));
  if (q.lang && q.lang !== "vi") sp.set("lang", q.lang);
  const s = sp.toString();
  return s ? `/blog?${s}` : "/blog";
}

/**
 * URL một bài viết, giữ nguyên ngôn ngữ đang xem — cùng lý do với `blogHref`.
 *
 * Bài viết là chỗ tốn kém nhất nếu đi sai: người đọc đang ở giữa một trang tiếng Anh, bấm sang
 * bài khác mà ra tiếng Việt thì họ không quay lại nữa.
 */
export function postHref(slug: string, lang?: string | null): string {
  return lang && lang !== "vi" ? `/blog/${slug}?lang=${lang}` : `/blog/${slug}`;
}

/** So khớp chuyên mục/thẻ không phân biệt hoa thường — cùng luật với API (`mode: insensitive`). */
export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

// ── Mục lục ─────────────────────────────────────────────────────────────────

export interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

/** Bỏ cú pháp inline Markdown để lấy chữ trần cho mục lục (cùng bộ token BlogMarkdown hỗ trợ). */
function stripInline(s: string): string {
  return s
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .trim();
}

/** Slug ASCII từ tiêu đề tiếng Việt: bỏ dấu, đ→d, còn lại thành gạch nối. */
function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/**
 * Rút các h2/h3 từ Markdown để dựng mục lục NGAY TỪ SERVER (có trong HTML đầu tiên, không chờ
 * hydrate). Phải đi qua đúng luật mà BlogMarkdown dùng để nhận diện heading và bỏ qua khối code
 * (` ``` `) — nếu lệch một dòng thì id gắn vào sai heading ở phía client. Chỉ lấy cấp 2–3: h1 là
 * tiêu đề bài, h4+ là chi tiết quá nhỏ cho mục lục.
 */
export function extractToc(markdown: string): TocItem[] {
  const lines = (markdown ?? "").replace(/\r\n/g, "\n").split("\n");
  const items: TocItem[] = [];
  const used = new Set<string>();
  let inFence = false;
  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = line.match(/^(#{2,3})\s+(.*)$/);
    if (!m) continue;
    const text = stripInline(m[2]);
    if (!text) continue;
    let id = slugify(text) || `muc-${items.length + 1}`;
    // Hai heading cùng chữ (hay gặp: "Ví dụ") phải ra hai id khác nhau, không thì link nhảy nhầm.
    let n = 2;
    const base = id;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    items.push({ id, text, level: m[1].length as 2 | 3 });
  }
  return items;
}
