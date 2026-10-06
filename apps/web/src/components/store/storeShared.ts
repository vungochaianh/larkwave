/**
 * Hằng số + hàm thuần dùng chung cho cửa hàng. KHÔNG có "use client": mọi trang đều kết xuất ở
 * máy chủ.
 *
 * MẶT TIỀN CHỈ BÁN MÃ NGUỒN (24/09/2026). Trước đó `/store` là trang gom ba nhóm — tài khoản
 * phần mềm, tài liệu, mã nguồn — và mỗi nhóm có trang danh mục riêng. Nay:
 *
 *   /store                      chính là danh mục mã nguồn (lọc, sắp, tìm, phân trang)
 *   /store/sourcecode/<slug>    trang một sản phẩm
 *   /store/{software,documents,sourcecode}  → 301 về /store (xem next.config.ts)
 *
 * Đường dẫn CHI TIẾT giữ nguyên dạng `/store/<kind>/<slug>` dù mặt tiền chỉ còn một loại. Hai lý
 * do: các URL đó vừa lên sitemap hôm qua nên đổi là tự reset tín hiệu SEO, và giai đoạn 4 sẽ thêm
 * loại `app` — lúc đó một `/store/<slug>` phẳng sẽ phải phân biệt slug trùng giữa hai loại.
 */
import type { StoreKind, StoreSort } from "@larkwave/shared";
import type { Lang } from "@/lib/serverLocale";

export const SITE = "https://toolswave.net";
export const GRADIENT =
  "linear-gradient(135deg, #6C5CE7 0%, #A66BFF 45%, #FF7AB6 75%, #4FB6FF 100%)";

/** Loại hàng DUY NHẤT đang bày ra mặt tiền. Đổi chỗ này phải đổi cùng `SHOP_KINDS` bên API. */
export const KIND_MAT_TIEN: StoreKind = "sourcecode";

/**
 * 24 mỗi trang, không phải 12. Người đi chọn mã nguồn đang SO SÁNH chứ không đang đọc: thấy nhiều
 * lựa chọn cùng lúc có ích hơn là bấm sang trang. 24 chia hết cho lưới 2/3/4 cột nên trang cuối
 * không lệch hàng.
 */
export const PAGE_SIZE = 24;

/** Đoạn đường dẫn ↔ loại hàng — chỉ còn dùng cho trang chi tiết. */
export const KIND_BY_SEG: Record<string, StoreKind> = {
  software: "software",
  documents: "document",
  sourcecode: "sourcecode",
};

export const SEG_BY_KIND: Partial<Record<StoreKind, string>> = {
  software: "software",
  document: "documents",
  sourcecode: "sourcecode",
};

interface KindText {
  name: string;
  blurb: string;
  meta: string;
}

export const KIND_UI: Record<StoreKind, { icon: string; vi: KindText; en: KindText }> = {
  sourcecode: {
    icon: "💻",
    vi: {
      name: "Mã nguồn",
      blurb:
        "Dự án hoàn chỉnh, có đặc tả và danh sách công nghệ — lọc theo stack bạn dùng, đọc kỹ rồi hãy mua.",
      meta: "Mua mã nguồn website và ứng dụng tại Larkwave: lọc theo công nghệ (Next.js, React, Go, Prisma…), có tài liệu đặc tả, nhận qua GitLab hoặc tải về.",
    },
    en: {
      name: "Source code",
      blurb:
        "Complete projects with a spec and a declared stack — filter by the tech you use, read before you buy.",
      meta: "Buy website and app source code at Larkwave: filter by stack (Next.js, React, Go, Prisma…), spec document included, delivered via GitLab or as a zip.",
    },
  },
  software: {
    icon: "🔑",
    vi: {
      name: "Tài khoản phần mềm",
      blurb: "Tài khoản và khoá bản quyền — bán ở trang cũ.",
      meta: "Tài khoản phần mềm bản quyền tại Larkwave.",
    },
    en: {
      name: "Software accounts",
      blurb: "Accounts and licence keys — sold on the old site.",
      meta: "Licensed software accounts at Larkwave.",
    },
  },
  document: {
    icon: "📄",
    vi: {
      name: "Tài liệu",
      blurb: "Tài liệu và biểu mẫu tải về — bán ở trang cũ.",
      meta: "Tài liệu và biểu mẫu tải về tại Larkwave.",
    },
    en: {
      name: "Documents",
      blurb: "Documents and templates — sold on the old site.",
      meta: "Downloadable documents and templates at Larkwave.",
    },
  },
  app: {
    icon: "🚀",
    vi: {
      name: "App bàn giao",
      blurb: "App dựng sẵn, bàn giao cả bản chạy lẫn mã nguồn — và bạn sửa tiếp được bằng chat.",
      meta: "App dựng sẵn bàn giao trọn gói tại Larkwave.",
    },
    en: {
      name: "Ready-made apps",
      blurb: "Ready-made apps handed over live and in source — editable by chat.",
      meta: "Ready-made apps from Larkwave.",
    },
  },
  tool: {
    icon: "🧰",
    vi: { name: "Công cụ", blurb: "Công cụ online dùng ngay trên trình duyệt.", meta: "Công cụ online tại Larkwave." },
    en: { name: "Tools", blurb: "Online tools that run in the browser.", meta: "Online tools at Larkwave." },
  },
  service: {
    icon: "🤝",
    vi: { name: "Dịch vụ", blurb: "Làm theo yêu cầu.", meta: "Dịch vụ làm theo yêu cầu tại Larkwave." },
    en: { name: "Services", blurb: "Built to order.", meta: "Made-to-order services at Larkwave." },
  },
};

/** Nhãn của từng thứ tự bày hàng. */
export const SORT_UI: Record<StoreSort, { vi: string; en: string }> = {
  "ban-chay": { vi: "Bán chạy", en: "Best selling" },
  moi: { vi: "Mới cập nhật", en: "Recently updated" },
  "gia-thap": { vi: "Giá thấp trước", en: "Price: low first" },
  "gia-cao": { vi: "Giá cao trước", en: "Price: high first" },
  ten: { vi: "Tên A→Z", en: "Name A→Z" },
};

export const SORT_MAC_DINH: StoreSort = "ban-chay";

/** "199.000 ₫" — giá 0 hiện thành chữ, vì "0 ₫" đọc như một lỗi chứ không như quà tặng. */
export function formatVnd(value: number, lang: Lang): string {
  if (!value || value <= 0) return lang === "vi" ? "Miễn phí" : "Free";
  return `${new Intl.NumberFormat("vi-VN").format(Math.round(value))} ₫`;
}

export interface StoreQuery {
  category?: string | null;
  language?: string | null;
  search?: string | null;
  sort?: StoreSort | null;
  page?: number;
  lang?: Lang;
}

/**
 * Dựng URL danh mục từ bộ lọc. Lọc nằm TRONG URL (không phải state) để chia sẻ được link, nút
 * Back hoạt động, và máy tìm kiếm lập chỉ mục được từng lát cắt — cùng luật với /blog.
 *
 * Trang 1 và thứ tự mặc định KHÔNG ghi vào URL, để `/store` và `/store?page=1&sort=ban-chay`
 * không thành hai địa chỉ cho cùng một nội dung.
 */
export function storeHref(q: StoreQuery = {}): string {
  const sp = new URLSearchParams();
  if (q.category) sp.set("category", q.category);
  if (q.language) sp.set("language", q.language);
  if (q.search) sp.set("search", q.search);
  if (q.sort && q.sort !== SORT_MAC_DINH) sp.set("sort", q.sort);
  if (q.page && q.page > 1) sp.set("page", String(q.page));
  if (q.lang === "en") sp.set("lang", "en");
  const s = sp.toString();
  return s ? `/store?${s}` : "/store";
}

/** Dãy số trang gọn: 1 … 4 5 [6] 7 8 … 20. */
export function pageWindow(cur: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set<number>([1, total, cur - 1, cur, cur + 1]);
  const nums = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  for (let i = 0; i < nums.length; i += 1) {
    if (i > 0 && nums[i] - nums[i - 1] > 1) out.push("…");
    out.push(nums[i]);
  }
  return out;
}
