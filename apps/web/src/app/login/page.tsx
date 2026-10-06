import type { Metadata } from "next";
import { resolveLang } from "@/lib/serverLocale";
import { metaSongNgu } from "@/lib/metaLocale";
import LoginClient from "./LoginClient";

/**
 * Vỏ server mỏng, chỉ để khai metadata. Giao diện nằm ở `LoginClient.tsx`.
 *
 * Phải tách làm hai vì một tệp "use client" không xuất được `generateMetadata`, mà đặt metadata ở
 * `layout.tsx` thì không đọc được `?lang=` (Next không truyền `searchParams` vào layout) — xem
 * chú thích trong `lib/metaLocale.ts`.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const sp = await searchParams;
  return metaSongNgu(
    "/login",
    {
      vi: {
        // Tiêu đề cũ chỉ "Đăng nhập" — sau khuôn "%s · Larkwave" thành 21 ký tự. Quá ngắn thì bỏ
        // phí dòng duy nhất mình được tự viết trên trang kết quả tìm kiếm, và hai chữ đó không cho
        // ai biết đây là trang đăng nhập của cái gì.
        title: "Đăng nhập tài khoản",
        description:
          "Đăng nhập Larkwave để tiếp tục dựng web app, app mobile, game và nội dung bằng AI. Chưa có tài khoản thì đăng ký miễn phí, không cần thẻ.",
      },
      en: {
        title: "Sign in to your account",
        description:
          "Sign in to Larkwave to keep building web apps, mobile apps, games and content with AI. No account yet? Sign up free — no card needed.",
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
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const lang = await resolveLang(sp.lang);
  return <LoginClient lang={lang} />;
}
