/**
 * Bộ hiệu ứng 3D dùng chung cho website công khai. Không thêm thư viện — app SSR bằng Next, một
 * thư viện 3D nặng làm bundle trang landing phình gấp nhiều lần chỉ để vẽ nền.
 *
 *  - HeroShader: nền hero WebGL thuần (lưới raymarch có sương mù, tinh vân, hạt có phối cảnh);
 *    rơi về Starfield (Canvas 2D) khi không có WebGL.
 *  - TiltCard: thẻ nghiêng 18°, viền phát sáng bám chuột trên mọi thẻ gần, lực hút, vệt quét.
 *  - Magnetic: nút bị con trỏ hút.
 *  - CursorGlow: đèn rọi hai lớp bám con trỏ.
 *  - ParallaxLayers: sân khấu 3D nhiều lớp dịch lệch nhau theo cuộn/chuột.
 *
 * Mọi component ở đây tự tôn trọng `prefers-reduced-motion` (tắt hẳn chuyển động, giữ bố cục),
 * tự tắt hiệu ứng theo chuột trên màn cảm ứng, và lấy màu từ biến `--tw-*` của theme.
 */
export { default as TiltCard } from "./TiltCard";
export { default as Magnetic } from "./Magnetic";
export { default as CursorGlow } from "./CursorGlow";
export { default as ParallaxLayers, type ParallaxLayer } from "./ParallaxLayers";
export { default as Starfield } from "./Starfield";
export { default as HeroShader } from "./HeroShader";
export { default as SplashScreen } from "./SplashScreen";
export { FxStyles, FX_CSS } from "./FxStyles";
export { FX_DARK_PALETTE } from "./fxTheme";
export { useReducedMotion, useFinePointer } from "./useFxPrefs";
