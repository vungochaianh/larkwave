"use client";

import "@ant-design/v5-patch-for-react-19";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { App as AntApp, ConfigProvider } from "antd";
import viVN from "antd/locale/vi_VN";
import enUS from "antd/locale/en_US";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ThemeProvider, useThemeMode, lightTheme, darkTheme, I18nProvider, useI18n } from "@larkwave/ui";
import { AuthProvider } from "@/lib/auth";
import ForceLight from "@/components/ForceLight";
import ForceDark from "@/components/ForceDark";

/**
 * Trang công khai (ngoài dashboard) KHÔNG đi theo toggle sáng/tối của app — mỗi nhóm có một theme
 * cố định, để người đã bật dark trong app không mang theme app ra site và ngược lại:
 *
 *  - Nhóm TỐI: /welcome, /download, /blog và nhóm xác thực (/login, /register, /forgot, /reset) —
 *    thiết kế tối hẳn (nền đen-tím, kính, viền phát sáng, nền WebGL). Bản tối đã được thiết kế và
 *    là bản CHÍNH; không có bản sáng. Nhóm xác thực chuyển sang đây (09/2026) vì người dùng đi từ
 *    /welcome tối sang một form trắng là thấy "hai sản phẩm"; AuthCard đã có bản tối riêng.
 *  - Nhóm SÁNG: trang chia sẻ app (/app, /a, /lark/s), hồ sơ (/u), và /auth/callback (chỉ là màn
 *    chờ vài trăm ms sau OAuth) — bản tối của chúng chưa thiết kế.
 *
 * Hai route "hai vỏ" (khách vs đã đăng nhập trong AppShell) tự ép ở cấp trang: `/pricing`,
 * `/explore` — chúng bọc ForceDark cho nhánh khách.
 */
const PUBLIC_DARK_BASES = ["/welcome", "/download", "/blog", "/store", "/login", "/register", "/forgot", "/reset"];
const PUBLIC_LIGHT_BASES = ["/auth", "/app", "/a", "/lark/s", "/u"];
/**
 * TRANG CHỦ "/" kiểm RIÊNG chứ không thêm vào mảng: luật tiền tố là `startsWith(b + "/")`, với
 * b="/" thành `startsWith("//")` không khớp gì — và nếu ai "sửa cho gọn" thành `startsWith(b)` thì
 * MỌI đường dẫn bị ép tối (cùng cái bẫy proxy.ts đã ghi cho PUBLIC_PATHS).
 *
 * Trước đây "/" không cần ở đây vì middleware đá nó sang /welcome (có trong mảng). Khi trang chủ
 * dời về "/" mà quên chỗ này, nó render theo theme SÁNG mặc định của app: toàn bộ thiết kế đen-tím
 * của trang chủ vô hình với khách — đúng lỗi vừa gặp. Người đã đăng nhập không tới đây (proxy đưa
 * họ về /overview) nên không đụng AppShell.
 */
const matches = (bases: string[], pathname: string): boolean =>
  pathname === "/" ? bases === PUBLIC_DARK_BASES : bases.some((b) => pathname === b || pathname.startsWith(`${b}/`));

/** Antd theme + AntApp, driven by the shared light/dark mode (same tokens as the desktop). */
function ThemedApp({ children }: { children: ReactNode }) {
  const { mode } = useThemeMode();
  const { locale } = useI18n();
  const pathname = usePathname();
  const publicDark = matches(PUBLIC_DARK_BASES, pathname || "");
  const publicLight = !publicDark && matches(PUBLIC_LIGHT_BASES, pathname || "");
  return (
    <ConfigProvider theme={mode === "dark" ? darkTheme : lightTheme} locale={locale === "en" ? enUS : viVN}>
      <AntApp
        style={{ minHeight: "100%" }}
        message={{ maxCount: 3 }}
        notification={{ placement: "topRight" }}
      >
        <AuthProvider>
          {publicDark ? <ForceDark>{children}</ForceDark> : publicLight ? <ForceLight>{children}</ForceLight> : children}
        </AuthProvider>
      </AntApp>
    </ConfigProvider>
  );
}

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <AntdRegistry>
      {/* Shared theme system with the desktop: ThemeProvider injects the full `--tw-*` palette +
          `data-theme` on <html> and owns the light/dark choice; ThemedApp swaps antd's algorithm to
          match. Defaults to LIGHT (no regression); the header has a toggle. */}
      <ThemeProvider>
        <I18nProvider>
          <ThemedApp>{children}</ThemedApp>
        </I18nProvider>
      </ThemeProvider>
    </AntdRegistry>
  );
}
