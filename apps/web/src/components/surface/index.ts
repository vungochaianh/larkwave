/**
 * Bộ bề mặt dùng chung trong app — đối trọng "làm việc" của bộ hiệu ứng `fx/` (trang tiếp thị).
 * Cùng vật liệu (kính, viền sáng, đen-tím), khác liều: không WebGL, không đèn rọi, nghiêng ≤ 4°.
 *
 *  - surface.css: class toàn cục móc vào `.tw-app` (thẻ, bảng, nhãn, nút, tiêu đề, khung).
 *  - surfaceTheme.ts: token antd sáng/tối tương ứng.
 *  - SurfaceScope: bọc gốc shell → nạp CSS + ConfigProvider + SurfaceTilt.
 *  - SurfaceTilt: nghiêng nhẹ thẻ bấm được (uỷ quyền, không cần sửa trang).
 */
export { default as SurfaceScope } from "./SurfaceScope";
export { default as SurfaceTilt } from "./SurfaceTilt";
export { appDarkTheme, appLightTheme, APP_DARK } from "./surfaceTheme";
