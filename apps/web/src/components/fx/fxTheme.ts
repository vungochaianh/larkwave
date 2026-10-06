/**
 * Đọc màu theme cho các hiệu ứng vẽ bằng Canvas.
 *
 * Canvas không hiểu `var(--tw-*)`, nên phải lấy giá trị đã tính ra. Đọc từ CHÍNH phần tử canvas
 * (không phải `<html>`) vì trang công khai bọc trong `ForceLight` (data-theme="light" ở một div
 * con) — nhìn `<html>` sẽ thấy dark trong khi khu vực đó thực ra đang sáng.
 */

export type FxRgb = [number, number, number];

export type FxTheme = {
  /** Nền đang tối → chấm sáng phải sáng hơn nền, và ngược lại. */
  dark: boolean;
  /** Màu chữ chính (`--tw-text`) — dùng làm "mực" cho sao/lưới để hợp với chữ xung quanh. */
  ink: FxRgb;
  /** Màu nền (`--tw-layer`) — để phủ mờ vệt sao cũ mà không lộ màu lạ. */
  layer: FxRgb;
};

/** Bộ ba màu thương hiệu, dùng để nhuộm một phần nhỏ chấm sao — đủ nhận ra là Larkwave, không loè loẹt. */
export const FX_BRAND_RGB: FxRgb[] = [
  [108, 92, 231], // #6C5CE7 tím
  [255, 122, 182], // #FF7AB6 hồng
  [79, 182, 255], // #4FB6FF xanh
];

const LIGHT_INK: FxRgb = [30, 34, 48];
const LIGHT_LAYER: FxRgb = [244, 245, 251];

/** Nhận `#RGB`, `#RRGGBB`, `rgb()/rgba()`; trả `null` nếu không hiểu để caller dùng màu dự phòng. */
export function parseCssColor(raw: string): FxRgb | null {
  const s = raw.trim();
  if (!s) return null;
  if (s[0] === "#") {
    const hex = s.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      return [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16),
      ];
    }
    if (hex.length === 6 || hex.length === 8) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    }
    return null;
  }
  const m = s.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

/** Độ sáng cảm nhận 0..1 (Rec. 601) — đủ để phân biệt nền sáng/tối, không cần chính xác hơn. */
function luminance([r, g, b]: FxRgb): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export function readFxTheme(el: Element): FxTheme {
  const cs = getComputedStyle(el);
  const layer = parseCssColor(cs.getPropertyValue("--tw-layer")) ?? LIGHT_LAYER;
  const ink = parseCssColor(cs.getPropertyValue("--tw-text")) ?? LIGHT_INK;
  return { dark: luminance(layer) < 0.5, ink, layer };
}

export const rgba = ([r, g, b]: FxRgb, a: number): string => `rgba(${r},${g},${b},${a})`;

/**
 * Gọi lại `onChange` khi theme đổi lúc trang đang mở (người dùng bật dark, hoặc hệ điều hành
 * đổi theo giờ). Chỉ theo dõi thuộc tính `data-theme` trên `<html>` và media query hệ thống —
 * hai nguồn duy nhất ThemeProvider dùng — nên không tốn gì khi không có gì đổi.
 */
export function watchFxTheme(onChange: () => void): () => void {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onChange);
  return () => {
    mo.disconnect();
    mq.removeEventListener("change", onChange);
  };
}

/**
 * Bảng màu TỐI riêng cho trang công khai (ForceDark). Vì sao không dùng thẳng PALETTES.dark của
 * app: bản tối của dashboard là xám xanh trung tính (#13151C) — đúng cho màn hình làm việc, nhưng
 * trang giới thiệu cần nền GẦN ĐEN có sắc tím để ánh sáng tím #6C5CE7 (đèn rọi, viền phát sáng,
 * lưới WebGL) có chỗ để "phát" — trên nền xám sáng hơn, cùng một quầng sáng chỉ còn là vết bẩn.
 * Bề mặt thẻ cố ý chỉ nhỉnh hơn nền một chút: chiều sâu sẽ đến từ ánh sáng và viền, không từ
 * độ chênh màu.
 */
export const FX_DARK_PALETTE = {
  layer: "#07060E",
  surface: "#100E1C",
  surfaceAlt: "#151328",
  surfaceMuted: "#1A1730",
  text: "#EEEDF6",
  textSub: "#A8A5C4",
  textFaint: "#6E6B8C",
  border: "#221F3A",
  borderSub: "#1A1830",
  chipBg: "rgba(124,108,240,0.18)",
  chipText: "#C3B8FF",
  codeBg: "#0E0C1A",
  codeHeaderBg: "#151328",
  codeBorder: "#252143",
  codeText: "#EEEDF6",
} as const;
