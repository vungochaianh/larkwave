import type { Metadata } from "next";
import { resolveLang, type Lang } from "./serverLocale";

export const SITE = "https://toolswave.net";

/**
 * TIÊU ĐỀ VÀ MÔ TẢ THEO NGÔN NGỮ NGƯỜI ĐANG ĐỌC.
 *
 * Lỗi nó sửa: giao diện site chuyển sang tiếng Anh nhưng thẻ <title> trên tab vẫn là "Đăng nhập
 * tài khoản". Phần thân trang song ngữ vì nó kết xuất ở trình duyệt và đọc được lựa chọn ngôn
 * ngữ, còn <title> do máy chủ sinh ra một lần rồi đứng yên — nên hai nửa của cùng một trang nói
 * hai thứ tiếng khác nhau.
 *
 * Với máy tìm kiếm, cái giá không chỉ là trông kỳ: tiêu đề và mô tả là phần văn bản DUY NHẤT mình
 * tự viết được trên trang kết quả. Người tìm bằng tiếng Anh mà thấy một dòng tiếng Việt thì gần
 * như chắc chắn bỏ qua, và Google học từ chính cú bỏ qua đó.
 *
 * Thứ tự ưu tiên do `resolveLang` quyết: `?lang=` → cookie `tw_locale` → tiếng Việt.
 *
 * HẠN CHẾ CÓ THẬT, PHẢI BIẾT: layout KHÔNG nhận `searchParams` (Next không truyền vào), nên hàm
 * này chỉ đọc được `?lang=` khi được gọi từ một PAGE. Đó là lý do các trang công khai đều có một
 * vỏ server mỏng ở `page.tsx` để khai metadata, còn phần giao diện nằm trong tệp `*Client.tsx`.
 * Đặt metadata ở layout thì `?lang=en` không có tác dụng, và lúc đó khai hreflang cho bản tiếng
 * Anh là chỉ máy tìm kiếm tới một địa chỉ trả về nguyên văn tiếng Việt.
 */
export interface MetaText {
  title: string;
  description: string;
  keywords?: string[];
  /** Mặc định lấy theo `title` — chỉ đặt khi muốn câu khác cho mạng xã hội. */
  ogTitle?: string;
  ogDescription?: string;
}

type QueryLang = string | string[] | undefined;

export async function metaSongNgu(
  path: string,
  chu: Record<Lang, MetaText>,
  opts: {
    /** `true` = bỏ qua khuôn "%s · Larkwave" ở layout gốc (dùng khi tiêu đề đã tự mang thương hiệu). */
    absolute?: boolean;
    /** `?lang=` của chính trang đó. Không truyền thì chỉ còn cookie. */
    queryLang?: QueryLang;
  } = {},
): Promise<Metadata> {
  const lang = await resolveLang(opts.queryLang);
  const t = chu[lang];
  // canonical trỏ về CHÍNH bản đang xem, không dồn hết về bản tiếng Việt — dồn về một bản là tự
  // nói bản dịch không đáng lập chỉ mục. Cùng quy ước với blog/[slug].
  const canonical = lang === "vi" ? path : `${path}?lang=${lang}`;
  return {
    metadataBase: new URL(SITE),
    title: opts.absolute ? { absolute: t.title } : t.title,
    description: t.description,
    ...(t.keywords ? { keywords: t.keywords } : {}),
    alternates: {
      canonical,
      // Khai đủ hai bản vì cả hai đều kết xuất được thật qua `?lang=` — khác với bài blog, nơi chỉ
      // khai ngôn ngữ bài đó THẬT SỰ có bản dịch.
      languages: { vi: path, en: `${path}?lang=en`, "x-default": path },
    },
    openGraph: {
      type: "website",
      url: `${SITE}${canonical}`,
      siteName: "Larkwave",
      title: t.ogTitle ?? t.title,
      description: t.ogDescription ?? t.description,
      locale: lang === "vi" ? "vi_VN" : "en_US",
    },
  };
}
