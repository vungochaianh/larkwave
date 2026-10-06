import type { ThemeConfig } from "antd";
import { BRAND } from "@larkwave/ui";

/**
 * Bảng màu tối ĐEN-TÍM của app (chỉ web). Cùng bộ hex với `:root[data-theme="dark"]:has(.tw-app)`
 * trong surface.css — CSS lo phần biến `--tw-*` (inline style qua `V`), còn đây lo token antd
 * (Card, Modal, Dropdown, Input… vẽ bằng css-in-js, không đọc biến CSS của ta).
 *
 * Vì sao không sửa PALETTES.dark trong packages/ui: bảng đó dùng chung với desktop; đổi ở đó là
 * đổi dark mode của cả app Electron trong một lần build mà không ai kiểm. Ghi đè ở tầng web
 * (ConfigProvider lồng — antd gộp token/components với provider cha) thì phạm vi chỉ là web.
 */
export const APP_DARK = {
  layer: "#0A0913",
  surface: "#12101F",
  surfaceAlt: "#181530",
  text: "#EEEDF6",
  textSub: "#A8A5C4",
  textFaint: "#6E6B8C",
  border: "#262240",
  borderSub: "#1C1932",
} as const;

/** Menu: bo góc và lề chung cho cả hai chế độ (antd mặc định 8px/4px — hơi chật cho rail 248px). */
const menuShared = {
  itemBg: "transparent",
  subMenuItemBg: "transparent",
  itemBorderRadius: 10,
  itemMarginInline: 8,
} as const;

/** Ô nhập: vòng sáng tím khi focus thay cho viền đổi màu khô khan — "viền phát sáng" của form. */
const inputGlow = (ring: string) =>
  ({
    activeShadow: `0 0 0 3px ${ring}`,
    hoverBorderColor: BRAND,
    activeBorderColor: BRAND,
  }) as const;

/** Nhãn thành viên thuốc — cùng dáng với pill ở trang công khai. */
const tagPill = { borderRadiusSM: 999 } as const;

/**
 * Chế độ SÁNG: chỉ ghi đè component, token toàn cục giữ nguyên lightTheme (packages/ui).
 * Đầu bảng + hàng hover nhuộm tím rất nhạt; nút thường hơi trong để lộ quầng nền.
 */
export const appLightTheme: ThemeConfig = {
  components: {
    Menu: {
      ...menuShared,
      itemSelectedBg: "rgba(108,92,231,0.10)",
      itemSelectedColor: BRAND,
      itemHoverBg: "rgba(108,92,231,0.06)",
      itemActiveBg: "rgba(108,92,231,0.10)",
    },
    Table: {
      headerBg: "rgba(108,92,231,0.05)",
      headerColor: "#6B7280",
      headerSplitColor: "rgba(30,34,48,0.08)",
      rowHoverBg: "rgba(108,92,231,0.05)",
      borderColor: "rgba(30,34,48,0.08)",
    },
    Tag: tagPill,
    Button: {
      primaryShadow: "0 8px 20px rgba(108,92,231,0.30)",
      defaultBg: "rgba(255,255,255,0.72)",
      defaultHoverBg: "#FFFFFF",
      defaultHoverBorderColor: BRAND,
      defaultHoverColor: BRAND,
    },
    Input: inputGlow("rgba(108,92,231,0.16)"),
    InputNumber: inputGlow("rgba(108,92,231,0.16)"),
    Select: { activeOutlineColor: "rgba(108,92,231,0.16)" },
  },
};

/**
 * Chế độ TỐI: token bề mặt chuyển sang đen-tím + cùng bộ component như sáng nhưng đậm hơn.
 * Menu: chữ TRẮNG trên nền tím ĐẶC (≈4.9:1) — sửa lỗi tương phản AA cũ (antd mặc định tím trên
 * tím nhạt ≈2.2:1); surface.css còn thêm ánh sáng lên trên nền này.
 */
export const appDarkTheme: ThemeConfig = {
  token: {
    colorBgLayout: APP_DARK.layer,
    colorBgContainer: APP_DARK.surface,
    colorBgElevated: APP_DARK.surfaceAlt,
    colorText: APP_DARK.text,
    colorTextSecondary: APP_DARK.textSub,
    colorTextTertiary: APP_DARK.textFaint,
    colorBorder: APP_DARK.border,
    colorBorderSecondary: APP_DARK.borderSub,
  },
  components: {
    Menu: {
      ...menuShared,
      itemSelectedColor: "#fff",
      itemSelectedBg: BRAND,
      itemActiveBg: "rgba(124,108,240,0.16)",
      itemHoverBg: "rgba(124,108,240,0.10)",
    },
    Table: {
      headerBg: "rgba(124,108,240,0.09)",
      headerColor: APP_DARK.textSub,
      headerSplitColor: "rgba(255,255,255,0.08)",
      rowHoverBg: "rgba(124,108,240,0.10)",
      borderColor: "rgba(255,255,255,0.07)",
    },
    Tag: tagPill,
    Button: {
      primaryShadow: "0 8px 22px rgba(108,92,231,0.42)",
      defaultBg: "rgba(255,255,255,0.04)",
      defaultBorderColor: "rgba(255,255,255,0.14)",
      defaultColor: "#D6D3EA",
      defaultHoverBg: "rgba(124,108,240,0.14)",
      defaultHoverBorderColor: "rgba(160,140,255,0.6)",
      defaultHoverColor: APP_DARK.text,
    },
    Input: inputGlow("rgba(124,108,240,0.28)"),
    InputNumber: inputGlow("rgba(124,108,240,0.28)"),
    Select: { activeOutlineColor: "rgba(124,108,240,0.28)" },
    Modal: { contentBg: "#141222", headerBg: "#141222", footerBg: "transparent" },
  },
};
