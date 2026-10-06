import { theme, type ThemeConfig } from 'antd';

/** Brand violet accent — shared by web + desktop. */
export const BRAND = '#6C5CE7';

/**
 * Semantic accent colors — the single source of truth (previously re-declared as local consts in
 * HomeOverview/AttentionApps/HubCommunity/LarkSessionsPanel and hardcoded, sometimes WRONG, inline).
 * These are fixed brand accents (not theme-swapped): they read well on both light + dark surfaces.
 */
export const OK = '#16B98D'; // success / live / connected
export const WARN = '#F59E0B'; // warning / attention
export const ERR = '#EF4444'; // error / over-limit
export const BLUE = '#4FB6FF'; // info / neutral-accent

/** A faint tinted fill for an accent (icon tiles, pills): `tint(BRAND)` → 'rgba…' equivalent of `${BRAND}1f`. */
export const tint = (hex: string, alpha = '1f'): string => `${hex}${alpha}`;

export const BRAND_GRADIENT =
  'linear-gradient(135deg, #6C5CE7 0%, #A66BFF 45%, #FF7AB6 75%, #4FB6FF 100%)';

/**
 * Bóng thẻ: biến CSS kèm fallback = giá trị cũ. Web khai `--tw-srf-shadow` (components/surface)
 * để mọi `boxShadow: CARD_SHADOW` inline đổi theo sáng/tối và sáng lên khi hover mà không sửa
 * từng màn hình; desktop không khai biến này nên rơi về fallback — không đổi gì ở đó.
 */
export const CARD_SHADOW = 'var(--tw-srf-shadow, 0 1px 3px rgba(17,24,39,0.06), 0 8px 24px rgba(17,24,39,0.04))';

/**
 * Semantic surface/text/border palette for the two themes. The SAME keys exist in
 * both — dark mode is a swap, not a re-design. These feed the CSS custom properties
 * (`--tw-*`, see THEME_CSS) that inline styles reference through `V` below, so a single
 * `data-theme` flip on <html> re-colours every custom (non-antd) surface at once.
 */
export const PALETTES = {
  light: {
    layer: '#F4F5FB', // app/page background
    surface: '#FFFFFF', // cards, sider, header
    surfaceAlt: '#FAFAFE', // subtle inner panels (tree cards, hover)
    surfaceMuted: '#F6F5FE', // chips / faint violet fills
    text: '#1E2230',
    textSub: '#6B7280',
    textFaint: '#9AA3B5',
    border: '#ECEDF3',
    borderSub: '#F1F2F7',
    chipBg: '#F1EFFE', // violet-tinted chip (field/table names)
    chipText: '#5B4FC2',
    // Khối mã. Trên nền sáng đây là "tím trắng" chứ không phải xám: đủ đậm để tách khỏi thẻ
    // trắng bao quanh, đủ nhạt để chữ đen vẫn dễ đọc, và cùng họ màu với BRAND.
    codeBg: '#FBFAFF',
    codeHeaderBg: '#F3F1FD',
    codeBorder: '#E6E2F8',
    codeText: '#2E2A44',
    // Cờ để một component đọc ra chế độ ĐANG THỰC SỰ ÁP DỤNG cho chính nó (kể cả khi nằm trong
    // một nhánh bị ép sáng bằng data-theme="light"). Xem useCodeTheme trong ChatMarkdown.
    codeDark: '0',
  },
  dark: {
    layer: '#13151C',
    surface: '#1B1E27',
    surfaceAlt: '#232734',
    surfaceMuted: '#272C3B',
    text: '#E7E9F1',
    textSub: '#A7AEC0',
    textFaint: '#79808F',
    border: '#2B3040',
    borderSub: '#242836',
    chipBg: 'rgba(124,108,240,0.20)',
    chipText: '#B9AEF7',
    // Nền tối giữ nguyên đúng bộ màu cũ — chế độ tối vốn đã đẹp, không có gì phải sửa.
    codeBg: '#1E2230',
    codeHeaderBg: '#171A24',
    codeBorder: '#2A2E3E',
    codeText: '#F3F4F8',
    codeDark: '1',
  },
} as const;

/**
 * Inline-style helpers: `var(--tw-x, <light fallback>)`. The fallback means these are
 * SAFE even on surfaces rendered without the ThemeProvider (e.g. the public web share
 * page that reuses ChatMarkdown) — there they simply resolve to the light value.
 */
export const V = {
  layer: `var(--tw-layer, ${PALETTES.light.layer})`,
  surface: `var(--tw-surface, ${PALETTES.light.surface})`,
  surfaceAlt: `var(--tw-surface-alt, ${PALETTES.light.surfaceAlt})`,
  surfaceMuted: `var(--tw-surface-muted, ${PALETTES.light.surfaceMuted})`,
  text: `var(--tw-text, ${PALETTES.light.text})`,
  textSub: `var(--tw-text-sub, ${PALETTES.light.textSub})`,
  textFaint: `var(--tw-text-faint, ${PALETTES.light.textFaint})`,
  border: `var(--tw-border, ${PALETTES.light.border})`,
  borderSub: `var(--tw-border-sub, ${PALETTES.light.borderSub})`,
  chipBg: `var(--tw-chip-bg, ${PALETTES.light.chipBg})`,
  chipText: `var(--tw-chip-text, ${PALETTES.light.chipText})`,
  codeBg: `var(--tw-code-bg, ${PALETTES.light.codeBg})`,
  codeHeaderBg: `var(--tw-code-header-bg, ${PALETTES.light.codeHeaderBg})`,
  codeBorder: `var(--tw-code-border, ${PALETTES.light.codeBorder})`,
  codeText: `var(--tw-code-text, ${PALETTES.light.codeText})`,
} as const;

/** Nền của khối mã ở chế độ sáng — cần dưới dạng hex thuần để tính tương phản. */
export const CODE_BG_LIGHT = PALETTES.light.codeBg;

type Palette = { [K in keyof (typeof PALETTES)['light']]: string };
const cssFor = (sel: string, p: Palette, scheme: string) => `${sel}{
  --tw-layer:${p.layer};--tw-surface:${p.surface};--tw-surface-alt:${p.surfaceAlt};--tw-surface-muted:${p.surfaceMuted};
  --tw-text:${p.text};--tw-text-sub:${p.textSub};--tw-text-faint:${p.textFaint};
  --tw-border:${p.border};--tw-border-sub:${p.borderSub};
  --tw-chip-bg:${p.chipBg};--tw-chip-text:${p.chipText};
  --tw-code-bg:${p.codeBg};--tw-code-header-bg:${p.codeHeaderBg};--tw-code-border:${p.codeBorder};--tw-code-text:${p.codeText};--tw-code-dark:${p.codeDark};
  color-scheme:${scheme};
}`;

/** Global stylesheet injected once by ThemeProvider — defines the `--tw-*` vars per theme. */
export const THEME_CSS = [
  cssFor(':root', PALETTES.light, 'light'),
  cssFor(':root[data-theme="dark"]', PALETTES.dark, 'dark'),
  // Re-declare the LIGHT palette on any element carrying data-theme="light" (an attribute selector,
  // NOT :root) so a subtree — e.g. a public/marketing page — can force light even when <html> is
  // data-theme="dark". Without this, a wrapper's data-theme="light" matches no rule and the inherited
  // dark vars from <html> win. Also re-paint that subtree's own background light.
  cssFor('[data-theme="light"]', PALETTES.light, 'light'),
  `[data-theme="light"]{background:${PALETTES.light.layer};}`,
  // Tầng đối xứng cho ép TỐI một subtree (ForceDark ở web — trang công khai /welcome, /download,
  // /blog… thiết kế tối hẳn dù người dùng đang để app sáng). Không có tầng này thì một wrapper
  // data-theme="dark" bên trong <html data-theme="light"> không khớp rule nào và kế thừa biến sáng.
  // Đặt SAU tầng light để hai wrapper lồng nhau vẫn đúng: biến CSS là thuộc tính kế thừa, phần tử
  // gần nhất mang thuộc tính sẽ thắng, không phụ thuộc thứ tự — thứ tự chỉ quyết định các thuộc
  // tính KHÔNG kế thừa (background) khi cùng một phần tử khớp cả hai, mà điều đó không xảy ra.
  cssFor('[data-theme="dark"]', PALETTES.dark, 'dark'),
  `[data-theme="dark"]{background:${PALETTES.dark.layer};}`,
  // Thin, quiet scrollbar (light default) — matches the web shell's globals.css.
  // The dark-mode thumb rule below has higher specificity so it wins in dark.
  `::-webkit-scrollbar{width:10px;height:10px;}`,
  `::-webkit-scrollbar-track{background:transparent;}`,
  `::-webkit-scrollbar-thumb{background:rgba(30,34,48,0.14);border-radius:8px;}`,
  `::-webkit-scrollbar-thumb:hover{background:rgba(30,34,48,0.24);}`,
  // Dark-mode readability: antd's own dark surfaces + a smoother scrollbar.
  `:root[data-theme="dark"] body{background:${PALETTES.dark.layer};}`,
  `:root[data-theme="dark"] ::-webkit-scrollbar-thumb{background:#3A4152;border-radius:8px;}`,
  // Shared hover-lift for kit stat/interactive cards (used across every screen, not just the hub).
  `.tw-stat-card{transition:transform .14s ease, box-shadow .14s ease;}`,
  `.tw-stat-card:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(17,24,39,.12);}`,
  // "Đang suy nghĩ…" typing dots (Trợ lý AI while the answer is generating).
  `@keyframes tw-typing-bounce{0%,80%,100%{transform:scale(.55);opacity:.45}40%{transform:scale(1);opacity:1}}`,
  `.tw-typing{display:inline-flex;align-items:center;gap:5px}`,
  `.tw-typing i{width:6px;height:6px;border-radius:50%;background:${BRAND};display:inline-block;animation:tw-typing-bounce 1.15s infinite ease-in-out}`,
  `.tw-typing i:nth-child(2){animation-delay:.16s}`,
  `.tw-typing i:nth-child(3){animation-delay:.32s}`,
  // Animated "khung caro" (graph-paper) background — the signature app surface (matches the website).
  `:root{--tw-grid-line:rgba(108,92,231,0.055);}`,
  `:root[data-theme="dark"]{--tw-grid-line:rgba(255,255,255,0.05);}`,
  `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--tw-grid-line:rgba(255,255,255,0.05);}}`,
  `.tw-grid-bg{position:relative;isolation:isolate;}`,
  `.tw-grid-bg::before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;background-image:linear-gradient(var(--tw-grid-line) 1px,transparent 1px),linear-gradient(90deg,var(--tw-grid-line) 1px,transparent 1px);background-size:46px 46px;animation:tw-grid-drift 28s linear infinite;will-change:background-position;}`,
  `@keyframes tw-grid-drift{from{background-position:0 0,0 0}to{background-position:46px 46px,46px 46px}}`,
  `@media (prefers-reduced-motion: reduce){.tw-grid-bg::before{animation:none;}}`,
  // ---- Thanh tiến trình cho tài khoản KHÔNG GIỚI HẠN --------------------------------------
  // Vẫn vẽ tỉ lệ THẬT so với mức gói (chỉ làm mốc tham chiếu), nhưng mép phải NHOÈ DẦN thay vì
  // kết thúc bằng một vạch cứng. Một thanh đầy màu đặc rất dễ bị đọc thành "đã dùng hết, bị
  // chặn" — trong khi tài khoản này không có trần nào để mà hết. Mép nhoè là cách nói "còn
  // tiếp, không có điểm dừng" mà không cần thêm chữ.
  `.tw-bar-unl{position:relative;height:6px;border-radius:999px;background:var(--tw-border-sub);overflow:hidden;-webkit-mask-image:linear-gradient(90deg,#000 70%,rgba(0,0,0,.12) 100%);mask-image:linear-gradient(90deg,#000 70%,rgba(0,0,0,.12) 100%);}`,
  `.tw-bar-unl>i{display:block;height:100%;min-width:6px;border-radius:999px;background:linear-gradient(90deg,${BRAND},#8B7BF0 40%,#4FB6FF 72%,${BRAND});background-size:220% 100%;animation:tw-bar-drift 7s linear infinite;will-change:background-position;}`,
  `@keyframes tw-bar-drift{from{background-position:0 0}to{background-position:220% 0}}`,
  // Trên nền tím của khối hero trang chủ thì gradient tím chìm mất — đổi sang sắc trắng.
  `.tw-bar-unl.tw-bar-onbrand{background:rgba(255,255,255,.25);}`,
  `.tw-bar-unl.tw-bar-onbrand>i{background:linear-gradient(90deg,#fff,rgba(255,255,255,.55) 50%,#fff);background-size:220% 100%;}`,
  // Thanh THÀNH PHẦN — dùng khi không có mẫu số nào cả (dung lượng của tài khoản không giới
  // hạn). Luôn đầy khung nên không bao giờ bị hiểu là "sắp hết", mà vẫn nói được một điều
  // đúng: dung lượng đang nằm ở đâu.
  `.tw-bar-mix{display:flex;height:6px;border-radius:999px;overflow:hidden;background:var(--tw-border-sub);}`,
  `.tw-bar-mix>i{display:block;height:100%;transition:width .3s ease;}`,
  // Bản mảnh cho thanh bên lúc thu gọn.
  `.tw-bar-xs{height:4px !important;}`,
  // Hiện lên nhẹ khi vào màn hình chào — đủ để thấy có chuyển động, không đủ để phải chờ.
  `@keyframes tw-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}`,
  `.tw-rise{animation:tw-rise .42s cubic-bezier(.22,.8,.3,1) both;}`,
  `.tw-rise-1{animation-delay:.06s}.tw-rise-2{animation-delay:.13s}.tw-rise-3{animation-delay:.2s}`,
  // Vòng sáng thở sau biểu tượng chào — chậm và mờ, để nó là nền chứ không giành sự chú ý.
  `@keyframes tw-breathe{0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(1.09);opacity:.82}}`,
  `.tw-breathe{animation:tw-breathe 4.5s ease-in-out infinite;}`,
  `@media (prefers-reduced-motion: reduce){.tw-rise,.tw-breathe{animation:none;}}`,
  // Khối trượt mở/đóng. Dùng grid-template-rows 0fr→1fr thay vì max-height: không phải đoán
  // trước chiều cao (bảng tuỳ chọn của ô tạo app dài ngắn tuỳ loại), và không bị "giật" ở đoạn
  // cuối như khi đặt max-height dư.
  `.tw-collapsible{display:grid;grid-template-rows:0fr;transition:grid-template-rows .24s ease;}`,
  `.tw-collapsible>div{overflow:hidden;min-height:0;}`,
  `.tw-collapsible.tw-open{grid-template-rows:1fr;}`,
  `@media (prefers-reduced-motion: reduce){.tw-collapsible{transition:none;}}`,
  `@media (prefers-reduced-motion: reduce){.tw-bar-unl>i{animation:none;}}`,
].join('\n');

/**
 * Màu từng nhóm dữ liệu ở trang Dung lượng — dùng chung cho thanh thành phần trên trang và
 * ở thanh bên, để hai chỗ không tô khác màu cho cùng một nhóm.
 */
export const STORAGE_COLORS: Record<string, string> = {
  apps: BRAND,
  uploads: '#4FB6FF',
  video: '#16B98D',
  image: '#F59E0B',
  chat: '#EC6EAD',
};

/** Màu dự phòng cho nhóm mới chưa kịp gán màu. */
export const STORAGE_COLOR_FALLBACK = '#94A3B8';

/** Shared button tokens — stronger CTA presence so buttons don't melt into white. */
const buttonTokens = {
  fontWeight: 600,
  primaryShadow: '0 6px 16px rgba(108,92,231,0.30)',
  defaultShadow: 'none',
} as const;

/** The exact Larkwave light theme (mirrors apps/web/src/lib/theme.ts). */
export const lightTheme: ThemeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: BRAND,
    colorInfo: BRAND,
    colorSuccess: '#16B98D',
    colorWarning: '#F59E0B',
    colorError: '#EF4444',
    borderRadius: 12,
    colorBgLayout: PALETTES.light.layer,
    colorBgContainer: PALETTES.light.surface,
    colorBgElevated: PALETTES.light.surface,
    colorText: PALETTES.light.text,
    colorTextSecondary: PALETTES.light.textSub,
    colorTextTertiary: PALETTES.light.textFaint,
    colorBorder: PALETTES.light.border,
    colorBorderSecondary: PALETTES.light.borderSub,
    fontSize: 14,
    wireframe: false,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  components: {
    Card: { boxShadowTertiary: CARD_SHADOW },
    Segmented: { itemSelectedBg: BRAND, itemSelectedColor: '#fff' },
    Button: { ...buttonTokens, defaultBorderColor: '#DCDEEA', defaultColor: '#3A4256' },
  },
};

/** Larkwave dark theme — same tokens, dark surfaces; the violet brand keeps popping. */
export const darkTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: BRAND,
    colorInfo: BRAND,
    colorSuccess: '#16B98D',
    colorWarning: '#F59E0B',
    colorError: '#EF4444',
    borderRadius: 12,
    colorBgLayout: PALETTES.dark.layer,
    colorBgContainer: PALETTES.dark.surface,
    colorBgElevated: PALETTES.dark.surfaceAlt,
    colorText: PALETTES.dark.text,
    colorTextSecondary: PALETTES.dark.textSub,
    colorTextTertiary: PALETTES.dark.textFaint,
    colorBorder: PALETTES.dark.border,
    colorBorderSecondary: PALETTES.dark.borderSub,
    fontSize: 14,
    wireframe: false,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  components: {
    Card: { boxShadowTertiary: '0 1px 3px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.28)' },
    Segmented: { itemSelectedBg: BRAND, itemSelectedColor: '#fff' },
    Button: { ...buttonTokens, defaultBorderColor: '#353A4B', defaultColor: '#C9CEDC' },
    // High-contrast selected sidebar item in dark mode (antd's default is ~2.2:1 violet-on-tint).
    // Shared here so BOTH the desktop shell and the website inherit it.
    Menu: { itemSelectedColor: '#fff', itemSelectedBg: BRAND, itemActiveBg: 'rgba(124,108,240,0.16)' },
  },
};

export type ThemeMode = 'light' | 'dark';
