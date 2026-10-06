"use client";

import { ConfigProvider } from "antd";
import type { ReactNode } from "react";
import { useThemeMode } from "@larkwave/ui";
import { appDarkTheme, appLightTheme } from "./surfaceTheme";
import SurfaceTilt from "./SurfaceTilt";
import "./surface.css";

/**
 * Bọc gốc của một shell trong app (AppShell, AgentsChatShell, ClaudeShell) để cả cây bên trong
 * dùng bộ bề mặt chung: nạp surface.css, đổi token antd theo chế độ sáng/tối (ConfigProvider
 * lồng — gộp với provider cha, chỉ ghi đè phần khai ở surfaceTheme.ts), và gắn SurfaceTilt.
 *
 * Shell vẫn phải tự gắn class `tw-app` lên phần tử gốc của nó: mọi rule trong surface.css và
 * bảng màu đen-tím (`:root[data-theme="dark"]:has(.tw-app)`) móc vào class đó — ConfigProvider
 * không render DOM nên không tự gắn được.
 *
 * Các shell cùng đi qua đây để /apps và /agents-chat ở chế độ tối là cùng một màu: nếu chỉ
 * AppShell chuyển đen-tím còn hai shell kia xám xanh thì bấm qua lại là thấy "hai sản phẩm".
 */
export default function SurfaceScope({ children }: { children: ReactNode }) {
  const { mode } = useThemeMode();
  return (
    <ConfigProvider theme={mode === "dark" ? appDarkTheme : appLightTheme}>
      <SurfaceTilt />
      {children}
    </ConfigProvider>
  );
}
