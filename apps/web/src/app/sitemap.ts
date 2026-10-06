import type { MetadataRoute } from "next";

const SITE = "https://toolswave.net";
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "https://api.toolswave.net/v1";

/**
 * Sitemap for search engines. Covers the public marketing + showcase surface.
 *
 * Nguyên tắc chọn URL: chỉ đưa vào những trang (a) truy cập được KHÔNG cần đăng nhập, và (b) có
 * nội dung riêng đáng để xếp hạng. Vì vậy:
 *  - KHÔNG có /login, /register, /forgot, /reset — trang thao tác, không có nội dung để xếp hạng,
 *    và đưa vào chỉ làm loãng ngân sách thu thập của bot.
 *  - KHÔNG có /studio, /agents-chat — đều chuyển hướng sang /login (đã kiểm bằng curl). (/marketing
 *    thì không còn tồn tại: bộ đó đã sang Social Wave, 02/10/2026.)
 *  - KHÔNG có /a/<slug>, /s/<slug>, /g/<slug> — đó là nội dung NGƯỜI DÙNG chia sẻ qua link riêng;
 *    họ chia sẻ cho một người cụ thể chứ không xin được lập chỉ mục toàn cầu.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const base: MetadataRoute.Sitemap = [
    // TRANG CHỦ là "/", KHÔNG phải "/welcome".
    //
    // Chỗ này từng khai `/welcome` với priority 1 trong khi `/welcome` đã chuyển VĨNH VIỄN (308)
    // về "/" từ lúc nội dung landing dọn sang `app/page.tsx` — next.config.ts khai redirect đó,
    // proxy.ts ghi rõ canonical trỏ "/", chỉ riêng sitemap là không ai sửa theo. Hậu quả: sitemap
    // dẫn bot tới một URL chuyển hướng và BỎ SÓT hẳn trang chủ, đúng trang quan trọng nhất và là
    // nơi mọi backlink tự nhiên trỏ về.
    { url: `${SITE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/explore`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE}/pricing`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE}/blog`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    // Cửa hàng — MỘT trang danh mục. Ba đường `/store/<loại>` cũ nay 301 về đây (next.config.ts),
    // nên khai chúng ở sitemap là tự dẫn bot vào một cú chuyển hướng. Trang bán từng dự án được
    // thêm ở dưới, lấy từ /v1/store/slugs.
    { url: `${SITE}/store`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE}/support`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    // Trang tải bản desktop — công khai (đã kiểm: HTTP 200 khi chưa đăng nhập) nhưng trước đây
    // thiếu trong sitemap, nên bot chỉ tìm ra nó qua liên kết nội bộ.
    { url: `${SITE}/download`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
  ];

  // Best-effort: add every public app showcase page. A failure here must never
  // break the sitemap, so we just fall back to the static entries.
  try {
    const res = await fetch(`${API_BASE}/public/apps?page=1&pageSize=500`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const data = (await res.json()) as { items?: { slug?: string; updatedAt?: string }[] };
      for (const a of data.items ?? []) {
        if (!a.slug) continue;
        base.push({
          url: `${SITE}/app/${a.slug}`,
          lastModified: a.updatedAt ? new Date(a.updatedAt) : now,
          changeFrequency: "weekly",
          priority: 0.6,
        });
      }
    }
  } catch {
    /* keep the static entries */
  }

  // Best-effort: add every PUBLISHED blog post — DUYỆT HẾT CÁC TRANG, không chỉ trang đầu.
  //
  // Trước đây chỉ lấy `page=1&pageSize=500`. API sắp theo publishedAt giảm dần, nên khi vượt 500
  // bài thì bài CŨ lặng lẽ rơi khỏi sitemap — không báo lỗi, không ai biết. Với lịch tự đăng
  // 3 bài/ngày thì ngưỡng đó tới sau khoảng năm tháng rưỡi.
  const PAGE_SIZE = 500;
  const MAX_PAGES = 20; // 10.000 URL; giới hạn của Google là 50.000 mỗi sitemap.
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await fetch(`${API_BASE}/blog?page=${page}&pageSize=${PAGE_SIZE}`, {
        next: { revalidate: 3600 },
      });
      if (!res.ok) break;
      const data = (await res.json()) as {
        items?: { slug?: string; publishedAt?: string }[];
        total?: number;
      };
      const items = data.items ?? [];
      for (const p of items) {
        if (!p.slug) continue;
        base.push({
          url: `${SITE}/blog/${p.slug}`,
          lastModified: p.publishedAt ? new Date(p.publishedAt) : now,
          changeFrequency: "monthly",
          priority: 0.7,
        });
      }
      // Dừng khi trang cuối trả về thiếu, hoặc đã lấy đủ theo `total`.
      if (items.length < PAGE_SIZE) break;
      if (typeof data.total === "number" && page * PAGE_SIZE >= data.total) break;
    }
  } catch {
    /* keep the prior entries */
  }

  // Best-effort: trang bán từng món. Cửa hàng hỏng thì sitemap vẫn còn nguyên phần trên — một
  // sitemap thiếu vài URL tốt hơn một sitemap 500.
  try {
    const res = await fetch(`${API_BASE}/store/slugs`, { next: { revalidate: 3600 } });
    if (res.ok) {
      const items = (await res.json()) as { kind?: string; slug?: string; updatedAt?: string }[];
      const seg: Record<string, string> = {
        software: "software",
        document: "documents",
        sourcecode: "sourcecode",
      };
      for (const it of items ?? []) {
        const s = it.kind ? seg[it.kind] : undefined;
        if (!s || !it.slug) continue;
        base.push({
          url: `${SITE}/store/${s}/${it.slug}`,
          lastModified: it.updatedAt ? new Date(it.updatedAt) : now,
          changeFrequency: "weekly",
          priority: 0.6,
        });
      }
    }
  } catch {
    /* keep the prior entries */
  }

  return base;
}
