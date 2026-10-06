import { cookies } from "next/headers";

/**
 * Ngôn ngữ để KẾT XUẤT Ở MÁY CHỦ, cho những trang máy tìm kiếm phải đọc được (blog, bài viết).
 *
 * Thứ tự ưu tiên, và thứ tự này có lý do:
 *
 *   1. `?lang=` trên URL — thắng tất cả. Một liên kết chia sẻ phải mở ra đúng thứ tiếng người gửi
 *      đang đọc, bất kể người nhận đã chọn gì. Đây cũng là địa chỉ mà hreflang khai.
 *   2. cookie `tw_locale` — lựa chọn của chính người dùng trên site.
 *   3. tiếng Việt — mặc định.
 *
 * VÌ SAO KHÔNG DÙNG localStorage: nó chỉ tồn tại ở trình duyệt. Trang blog kết xuất ở máy chủ, nên
 * đọc localStorage là không thể — và đó chính là lỗi đã gặp: người dùng chuyển site sang tiếng
 * Anh, giao diện đổi, nhưng bài viết vẫn nguyên tiếng Việt vì máy chủ không hề biết.
 */
export const LOCALES = ["vi", "en"] as const;
export type Lang = (typeof LOCALES)[number];

const isLang = (v: string | undefined): v is Lang =>
  !!v && (LOCALES as readonly string[]).includes(v);

/** Ngôn ngữ từ `?lang=`, bỏ qua giá trị lạ. */
export function langFromQuery(v: string | string[] | undefined): Lang | null {
  const raw = Array.isArray(v) ? v[0] : v;
  return isLang(raw) ? raw : null;
}

/** Ngôn ngữ cuối cùng để kết xuất: `?lang=` → cookie → 'vi'. */
export async function resolveLang(queryLang?: string | string[] | undefined): Promise<Lang> {
  const fromQuery = langFromQuery(queryLang);
  if (fromQuery) return fromQuery;
  try {
    const c = (await cookies()).get("tw_locale")?.value;
    if (isLang(c)) return c;
  } catch {
    /* ngoài ngữ cảnh có request (dựng tĩnh) thì không có cookie — lùi về mặc định */
  }
  return "vi";
}
