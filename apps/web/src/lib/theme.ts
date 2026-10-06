import { theme, type ThemeConfig } from "antd";

/** Brand violet accent. */
export const BRAND = "#6C5CE7";

/** Soft pastel gradient used as small accents (logo mark, headers, active). */
export const BRAND_GRADIENT =
  "linear-gradient(135deg, #6C5CE7 0%, #A66BFF 45%, #FF7AB6 75%, #4FB6FF 100%)";

/**
 * AGENTS — khu làm việc AI (/agents-chat). Bảng màu XANH DƯƠNG, tách hẳn khỏi tím thương hiệu.
 *
 * Vì sao tách ra thành bộ riêng chứ không dùng BRAND: khu này trước đây đặt tên "Claude" và bắt
 * chước giao diện claude.ai — chữ hiệu serif, bảng màu ấm. Đó là giao diện và tên của SẢN PHẨM
 * CỦA HÃNG KHÁC, nên phải khác đi cả tên lẫn cách nhìn, chứ không chỉ đổi mỗi chữ trên màn hình.
 * Xanh dương + chữ hiệu sans là để nhìn một cái biết ngay không phải chỗ kia.
 *
 * Giữ tím BRAND cho phần còn lại của sản phẩm: đổi hết thì lại thành một cuộc đổi thương hiệu
 * toàn site, không ai yêu cầu.
 */
export const AGENTS = "#2563EB";
export const AGENTS_DEEP = "#1D4ED8";
export const AGENTS_SOFT = "#EFF6FF";
export const AGENTS_GRADIENT = "linear-gradient(135deg, #1D4ED8 0%, #2563EB 45%, #06B6D4 100%)";

/**
 * Bóng thẻ dùng chung. Là một BIẾN CSS (kèm fallback = giá trị cũ) chứ không phải hằng: hơn 180
 * chỗ đặt `boxShadow: CARD_SHADOW` inline, và inline thắng mọi class — nên cách duy nhất để thẻ
 * đổi bóng theo sáng/tối và sáng lên khi hover mà không sửa từng trang là cho inline đọc biến.
 * `--tw-srf-shadow` khai ở components/surface/surface.css (sáng/tối, đổi khi hover thẻ bấm được);
 * nơi không nạp file đó (trang chia sẻ công khai) rơi về fallback, y như trước.
 */
export const CARD_SHADOW =
  "var(--tw-srf-shadow, 0 1px 3px rgba(17,24,39,0.06), 0 8px 24px rgba(17,24,39,0.04))";

/** Bright, modern, professional light theme for the whole platform. */
export const lightTheme: ThemeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: BRAND,
    colorInfo: BRAND,
    colorSuccess: "#16B98D",
    colorWarning: "#F59E0B",
    colorError: "#EF4444",
    borderRadius: 12,

    colorBgLayout: "#F4F5FB",
    colorBgContainer: "#FFFFFF",
    colorBgElevated: "#FFFFFF",

    colorText: "#1E2230",
    colorTextSecondary: "#6B7280",
    colorTextTertiary: "#9AA3B5",

    colorBorder: "#ECEDF3",
    colorBorderSecondary: "#F1F2F7",

    fontSize: 14,
    wireframe: false,
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  components: {
    Layout: {
      headerBg: "#FFFFFF",
      bodyBg: "#F4F5FB",
      siderBg: "#FFFFFF",
      headerHeight: 60,
    },
    Menu: {
      itemBg: "transparent",
      subMenuItemBg: "transparent",
      itemSelectedBg: "rgba(108,92,231,0.10)",
      itemSelectedColor: BRAND,
      itemActiveBg: "rgba(108,92,231,0.06)",
      itemHoverBg: "rgba(108,92,231,0.06)",
      itemBorderRadius: 10,
      itemMarginInline: 8,
    },
    Card: {
      colorBgContainer: "#FFFFFF",
      boxShadowTertiary: CARD_SHADOW,
    },
    Table: {
      headerBg: "#FAFAFE",
      rowHoverBg: "rgba(108,92,231,0.04)",
      headerColor: "#6B7280",
    },
    Button: {
      primaryShadow: "0 6px 16px rgba(108,92,231,0.24)",
    },
    Segmented: {
      itemSelectedBg: "#FFFFFF",
      itemSelectedColor: BRAND,
      trackBg: "#F1F2F7",
      itemColor: "#6B7280",
    },
    Tabs: {
      itemSelectedColor: BRAND,
      inkBarColor: BRAND,
    },
    Input: {
      colorBgContainer: "#FFFFFF",
    },
  },
};
