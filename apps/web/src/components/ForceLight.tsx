"use client";

import type { ReactNode } from "react";
import { ConfigProvider } from "antd";
import { lightTheme } from "@larkwave/ui";

/**
 * Force a subtree to LIGHT theme regardless of the global dark toggle — for public / marketing pages
 * (outside the dashboard) whose dark variant isn't designed, so a user who toggled dark in the app
 * doesn't carry a broken dark theme onto the public site. Resets BOTH layers: antd components
 * (nested ConfigProvider with lightTheme) and the CSS `--tw-*` custom properties (via
 * `data-theme="light"`, which THEME_CSS re-declares on the attribute so it overrides the inherited
 * dark vars from `<html>`).
 */
export default function ForceLight({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider theme={lightTheme}>
      <div data-theme="light" style={{ minHeight: "100vh", background: "var(--tw-layer, #F4F5FB)" }}>
        {children}
      </div>
    </ConfigProvider>
  );
}
