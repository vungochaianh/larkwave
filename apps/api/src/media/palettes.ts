/**
 * Shared COLOR-PALETTE + LAYOUT-VARIATION system for all Marketing tools (video / picture / blog).
 *
 * Before this, colors were keyed only by the template (draw/pixel/game each had ONE fixed palette)
 * and the layout was hardcoded — so every item looked the same. Now the user picks a palette (or
 * "auto" = varies per item) and the composition varies by a per-project seed. The palette drives
 * BOTH the deterministic fallback renderers AND the MAIC art/poster/cover prompts.
 *
 * NOTE: the web create form has a parallel presentational list in
 * apps/web/src/app/marketing/_shared/palettes.ts — keep the ids in sync when adding a palette.
 */

export interface Palette {
  id: string;
  /** Vietnamese display name (also sent to the picker via the API). */
  name: string;
  /** true = dark background (white text + dark caption outline). */
  dark: boolean;
  bg: string;
  bg2: string;
  /** primary text / ink colour. */
  ink: string;
  accent: string;
  /** bright multi-colour set used for sketch strokes / sprites / accents. */
  colors: string[];
}

/** The real, selectable palettes (excludes the special "auto"). Order matters for auto-rotation. */
export const REAL_PALETTES: Palette[] = [
  {
    // Bảng màu NHẬN DIỆN của chính Larkwave — nền gần đen, nhấn tím #6C5CE7, đúng màu website.
    // Thêm vào vì ảnh bìa blog trước đây để `auto` nên bốc trúng bảng hồng: đặt lên trang nền tối
    // thành một mảng sáng chói và lệch hẳn nhận diện. Bài trên blog CỦA MÌNH thì phải mang màu
    // của mình, không phải màu bốc thăm.
    id: 'brand', name: 'Larkwave (tím, nền tối)', dark: true,
    bg: '#0B0917', bg2: '#141033', ink: '#F2F1FA', accent: '#6C5CE7',
    colors: ['#6C5CE7', '#A66BFF', '#FF7AB6', '#4FB6FF', '#8B7CF6', '#C4B5FD'],
  },
  {
    id: 'sunset', name: 'Hoàng hôn', dark: false,
    bg: '#FFF6ED', bg2: '#FFE1CE', ink: '#3A2417', accent: '#FF6B4A',
    colors: ['#FF6B4A', '#FF9E64', '#FFC24B', '#E8557F', '#C65D9E', '#7B5EA7'],
  },
  {
    id: 'ocean', name: 'Biển xanh', dark: false,
    bg: '#F0FAFF', bg2: '#D3EEFA', ink: '#0E2A3A', accent: '#0EA5C4',
    colors: ['#0EA5C4', '#2DD4BF', '#38BDF8', '#3B82F6', '#6366F1', '#0891B2'],
  },
  {
    id: 'forest', name: 'Rừng xanh', dark: false,
    bg: '#F3FAF3', bg2: '#DBF1DD', ink: '#14301C', accent: '#16A34A',
    colors: ['#16A34A', '#65C466', '#A3D948', '#0E9F6E', '#3F9142', '#84CC16'],
  },
  {
    id: 'berry', name: 'Mọng ngọt', dark: false,
    bg: '#FFF3F9', bg2: '#FBDCEE', ink: '#3A0F2A', accent: '#DB2777',
    colors: ['#DB2777', '#F472B6', '#C026D3', '#8B5CF6', '#EC4899', '#A21CAF'],
  },
  {
    // soft pastel look, but the `colors` are deep enough to stay legible as strokes on the near-white bg
    id: 'pastel', name: 'Pastel dịu', dark: false,
    bg: '#FBF8FF', bg2: '#EEE6FB', ink: '#3A3355', accent: '#7C5CF0',
    colors: ['#7C5CF0', '#2E90CF', '#E06B86', '#1FA37B', '#C98A12', '#D362A6'],
  },
  {
    id: 'mono', name: 'Tối giản', dark: false,
    bg: '#FAFAF7', bg2: '#EAE8E1', ink: '#191919', accent: '#111111',
    colors: ['#191919', '#3F3F3F', '#6B6B6B', '#2B2B2B', '#525252', '#7A7A7A'],
  },
  {
    id: 'neon', name: 'Neon (nền tối)', dark: true,
    bg: '#0B0B18', bg2: '#171634', ink: '#FFFFFF', accent: '#00E5FF',
    colors: ['#00E5FF', '#7C3AED', '#FF2D95', '#39FF14', '#FFE600', '#FF6B00'],
  },
  {
    id: 'gold', name: 'Sang trọng (gold)', dark: true,
    bg: '#0E1428', bg2: '#161E3A', ink: '#F5EAD0', accent: '#E6B450',
    colors: ['#E6B450', '#F2D492', '#C9A227', '#B08D57', '#DDBF7A', '#8C6D3F'],
  },
];

/** Valid palette ids for DTO validation (auto + every real palette). */
export const PALETTE_IDS: string[] = ['auto', ...REAL_PALETTES.map((p) => p.id)];

/** For the picker: "auto" first, then the real palettes. */
export const PALETTE_OPTIONS: { id: string; name: string; dark: boolean; swatch: string[] }[] = [
  { id: 'auto', name: 'Tự động (đa dạng)', dark: false, swatch: ['#FF6B4A', '#0EA5C4', '#16A34A', '#DB2777'] },
  ...REAL_PALETTES.map((p) => ({ id: p.id, name: p.name, dark: p.dark, swatch: [p.accent, p.colors[2], p.colors[4], p.bg2] })),
];

/** Stable non-negative hash of a string (project id) → used to seed auto-palette + layout variant. */
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}

/**
 * Resolve a stored palette id to a concrete Palette. `auto` (or unknown) → deterministically pick a
 * real palette from the seed, so different projects get different colours but the SAME project is
 * stable across refine/rerender.
 */
export function resolvePalette(id: string | null | undefined, seed: number): Palette {
  const found = REAL_PALETTES.find((p) => p.id === id);
  if (found) return found;
  return REAL_PALETTES[seed % REAL_PALETTES.length];
}

/** Layout composition variant index (0..4) from the seed — varies subject placement / arrangement. */
export function layoutVariant(seed: number): number {
  return Math.floor(seed / REAL_PALETTES.length) % 5;
}

const VARIANT_HINTS = [
  'CENTERED composition — the main subject sits in the upper-middle, symmetric.',
  'ASYMMETRIC composition — weight the subject to the LEFT, leave open negative space on the right.',
  'ASYMMETRIC composition — weight the subject to the RIGHT, open space on the left.',
  'DYNAMIC DIAGONAL composition — arrange elements along a diagonal for energy.',
  'LAYERED DEPTH — one large central subject with smaller accent elements toward the corners.',
];

/**
 * The colour + composition instruction appended to every MAIC art/poster/cover prompt. It OVERRIDES
 * any specific hex colours mentioned in the template STYLE text so the chosen palette always wins.
 */
export function paletteDirective(pal: Palette, variant: number): string {
  return (
    `\n\nCOLOR PALETTE — use ONLY these colours (ignore/override any specific hex values mentioned above):\n` +
    `• background: ${pal.bg} (secondary ${pal.bg2})\n` +
    `• text/ink: ${pal.ink} — must stay high-contrast on the background\n` +
    `• accent: ${pal.accent}\n` +
    `• extra accents (use for variety): ${pal.colors.join(', ')}\n` +
    `Overall mood: ${pal.dark ? 'a DARK background with luminous/vivid accents' : 'a LIGHT, airy background with the accents used boldly'}.\n` +
    `COMPOSITION: ${VARIANT_HINTS[variant % VARIANT_HINTS.length]}`
  );
}
