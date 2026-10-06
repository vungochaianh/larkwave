import type { MetadataRoute } from "next";

const SITE = "https://toolswave.net";

/**
 * Sitemap for search engines. Covers the public marketing surface.
 *
 * Nguyên tắc chọn URL: chỉ đưa vào những trang (a) truy cập được KHÔNG cần đăng nhập, và (b) có
 * nội dung riêng đáng để xếp hạng. Vì vậy:
 *  - KHÔNG có /login, /register, /forgot, /reset — trang thao tác, không có nội dung để xếp hạng,
 *    và đưa vào chỉ làm loãng ngân sách thu thập của bot.
 *  - KHÔNG có /agents-chat, /assistant, /community… — đều cần đăng nhập.
 *  - KHÔNG có /a/<slug>, /s/<slug>, /g/<slug> — đó là nội dung NGƯỜI DÙNG chia sẻ qua link riêng;
 *    họ chia sẻ cho một người cụ thể chứ không xin được lập chỉ mục toàn cầu.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  // TRANG CHỦ là "/", KHÔNG phải "/welcome" (đã chuyển VĨNH VIỄN về "/", next.config.ts).
  // Larkwave không có trang danh mục/nội dung động công khai nào, nên sitemap là danh sách tĩnh.
  return [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/pricing`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE}/download`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE}/support`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
  ];
}
