import type { Metadata } from "next";
import { resolveLang } from "@/lib/serverLocale";
import { metaSongNgu } from "@/lib/metaLocale";
import ResetClient from "./ResetClient";

/** Vỏ server mỏng, chỉ để khai metadata — xem chú thích ở `login/page.tsx`. */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const m = await metaSongNgu(
    "/reset",
    {
      vi: {
        title: "Đặt lại mật khẩu",
        description: "Chọn mật khẩu mới cho tài khoản Larkwave. Liên kết đặt lại chỉ dùng được một lần.",
      },
      en: {
        title: "Reset your password",
        description: "Choose a new password for your Larkwave account. The reset link works only once.",
      },
    },
    { queryLang: sp.lang },
  );
  // KHÔNG lập chỉ mục trang này: địa chỉ của nó mang theo mã đặt lại dùng một lần. Để máy tìm kiếm
  // lưu lại một URL như vậy thì vừa vô ích (mã hết hạn ngay) vừa đưa mã vào chỗ công khai.
  return { ...m, robots: { index: false, follow: false } };
}

/**
 * `lang` được giải ở MÁY CHỦ rồi truyền xuống island.
 *
 * generateMetadata ở trên đã song ngữ đầy đủ qua `metaSongNgu(..., { queryLang: sp.lang })`, nhưng thân
 * trang thì không: island dùng `useI18n()` mà lúc dựng ở máy chủ context luôn trả 'vi'. Kết quả là thẻ
 * <title> tiếng Anh đứng trên một biểu mẫu tiếng Việt — đúng lỗi đã gặp ở /blog (23/09) và /pricing (24/09).
 */
export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const lang = await resolveLang(sp.lang);
  return <ResetClient lang={lang} />;
}
