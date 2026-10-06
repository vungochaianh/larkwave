import type { Metadata } from "next";
import { resolveLang } from "@/lib/serverLocale";
import { metaSongNgu } from "@/lib/metaLocale";
import RegisterClient from "./RegisterClient";

/** Vỏ server mỏng, chỉ để khai metadata — xem chú thích ở `login/page.tsx`. */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const sp = await searchParams;
  return metaSongNgu(
    "/register",
    {
      vi: {
        // Bản cũ: tiêu đề 19 ký tự sau khuôn, mô tả 51 ký tự. Cả hai đều dưới ngưỡng có ích — mô
        // tả ngắn như vậy thì Google thường tự bịa một đoạn khác lấy từ thân trang.
        title: "Đăng ký tài khoản miễn phí",
        description:
          "Tạo tài khoản Larkwave miễn phí, không cần thẻ tín dụng. Mô tả ý tưởng bằng tiếng Việt và nhận về web app, app mobile, game hoặc nội dung do AI dựng.",
      },
      en: {
        title: "Create a free account",
        description:
          "Create a free Larkwave account — no credit card. Describe your idea in plain language and get back a web app, mobile app, game or content built by AI.",
      },
    },
    { queryLang: sp.lang },
  );
}

/**
 * `lang` được giải ở MÁY CHỦ rồi truyền xuống island.
 *
 * generateMetadata ở trên đã song ngữ đầy đủ qua `metaSongNgu(..., { queryLang: sp.lang })`, nhưng thân
 * trang thì không: island dùng `useI18n()` mà lúc dựng ở máy chủ context luôn trả 'vi'. Kết quả là thẻ
 * <title> tiếng Anh đứng trên một biểu mẫu tiếng Việt — đúng lỗi đã gặp ở /blog (23/09) và /pricing (24/09).
 */
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const lang = await resolveLang(sp.lang);
  return <RegisterClient lang={lang} />;
}
