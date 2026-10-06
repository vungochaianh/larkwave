"use client";

import { useEffect, type ReactNode } from "react";
import { ConfigProvider, type ThemeConfig } from "antd";
import { darkTheme } from "@larkwave/ui";
import { FxStyles, FX_DARK_PALETTE as D } from "@/components/fx";

/**
 * Ép một subtree sang TỐI bất kể toggle sáng/tối của app — đối xứng với ForceLight, dành cho trang
 * công khai (/welcome, /download, /explore, /pricing, /blog) vốn được thiết kế tối hẳn: nền gần đen
 * có sắc tím, mặt kính, viền phát sáng. Thẩm mỹ này sống bằng nền tối; ép lên nền trắng thì ánh
 * sáng tím thành màu phấn (đó là lý do đợt giao diện trước bị bác).
 *
 * Reset cả hai tầng: antd (ConfigProvider với darkTheme + bề mặt đen-tím) và biến CSS `--tw-*`
 * (qua `data-theme="dark"` — theme.ts khai tầng attribute cho nó — rồi `.tw-fx-dark` trong FxStyles
 * ghi đè bằng bảng màu đen-tím với specificity cao hơn). Màu nền + color-scheme của <html> do rule
 * `html:has(.tw-fx-dark)` trong FxStyles lo (CSS !important thắng inline style của ThemeProvider —
 * effect ở đây KHÔNG đủ vì effect cha chạy sau và ghi đè, đã đo được). Effect bên dưới chỉ là
 * đường lùi cho trình duyệt chưa có :has().
 */
const publicDarkTheme: ThemeConfig = {
  ...darkTheme,
  token: {
    ...darkTheme.token,
    colorBgLayout: D.layer,
    colorBgContainer: D.surface,
    colorBgElevated: D.surfaceAlt,
    colorText: D.text,
    colorTextSecondary: D.textSub,
    colorTextTertiary: D.textFaint,
    colorBorder: D.border,
    colorBorderSecondary: D.borderSub,
  },
};

export default function ForceDark({ children }: { children: ReactNode }) {
  useEffect(() => {
    const html = document.documentElement;
    html.style.backgroundColor = D.layer;
    html.style.colorScheme = "dark";
    return () => {
      // Cùng hai màu mà ThemeProvider/_document dùng — không đọc từ PALETTES để tránh kéo theme.ts
      // vào đây chỉ vì hai hằng.
      html.style.backgroundColor = html.dataset.theme === "dark" ? "#13151C" : "#F4F5FB";
      html.style.colorScheme = html.dataset.theme === "dark" ? "dark" : "light";
    };
  }, []);
  return (
    <ConfigProvider theme={publicDarkTheme}>
      <div data-theme="dark" className="tw-fx-dark" style={{ minHeight: "100vh", background: D.layer, color: D.text }}>
        <FxStyles />
        {children}
      </div>
    </ConfigProvider>
  );
}
