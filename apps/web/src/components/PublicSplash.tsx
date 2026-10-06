"use client";

import { usePathname } from "next/navigation";
import { useI18n } from "@larkwave/ui";
import { SplashScreen } from "@/components/fx";

/**
 * Các gốc đường dẫn CÔNG KHAI được mở màn splash. Phản chiếu danh sách trang trong
 * `proxy.ts` (PUBLIC_PATHS) nhưng khai lại ở đây thay vì import — proxy.ts kéo theo `next/server`,
 * không đem vào bundle client được. Cố ý BỎ `/auth/callback`: đó là trang máy chuyển hướng OAuth,
 * người dùng chỉ lướt qua vài trăm ms, splash ở đó chỉ gây rối.
 *
 * Trong dashboard (đã đăng nhập) không có splash: người dùng vào làm việc, không phải vào xem
 * giới thiệu.
 */
const PUBLIC_SPLASH_BASES = [
  "/welcome",
  "/login",
  "/register",
  "/forgot",
  "/reset",
  "/pricing",
  "/support",
  "/a",
  "/s",
  "/g",
  "/lark/s",
  "/download",
];

function isPublicSplashRoute(pathname: string): boolean {
  return PUBLIC_SPLASH_BASES.some((b) => pathname === b || pathname.startsWith(`${b}/`));
}

/**
 * Gắn `SplashScreen` cho mọi trang công khai, hiện MỘT lần mỗi phiên (sessionStorage — do
 * SplashScreen tự quản). Đặt trong `<Providers>` của layout gốc, tức là nằm TRONG `ForceLight` ở
 * các trang bị ép sáng: màu nền/chữ của splash khớp đúng với trang phía sau nó, không có cảnh
 * splash tối rồi trang sáng bật lên.
 *
 * `usePathname` có giá trị ngay lúc SSR, nên với trang không công khai ta trả `null` từ server —
 * HTML không chứa splash lẫn script chống chớp, không có gì để giấu.
 */
export default function PublicSplash() {
  const pathname = usePathname();
  const { t } = useI18n();
  if (!isPublicSplashRoute(pathname || "")) return null;
  // Câu dẫn bám định vị hiện tại của site (cùng câu với <title> ở layout gốc) thay vì câu mặc
  // định của component.
  return <SplashScreen tagline={t("landing.splash.tagline.lw", "Trợ lý AI làm việc thật trên Lark")} />;
}
