import type { Metadata } from "next";
import { resolveLang } from "@/lib/serverLocale";
import { metaSongNgu } from "@/lib/metaLocale";
import ForgotClient from "./ForgotClient";

/** Vỏ server mỏng, chỉ để khai metadata — xem chú thích ở `login/page.tsx`. */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const sp = await searchParams;
  return metaSongNgu(
    "/forgot",
    {
      vi: {
        title: "Quên mật khẩu — lấy lại tài khoản",
        description:
          "Nhập email để nhận liên kết đặt lại mật khẩu Larkwave. Liên kết dùng một lần và hết hạn sau ít phút.",
      },
      en: {
        title: "Forgot your password",
        description:
          "Enter your email to get a Larkwave password reset link. The link is single-use and expires within minutes.",
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
export default async function ForgotPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const lang = await resolveLang(sp.lang);
  return <ForgotClient lang={lang} />;
}
