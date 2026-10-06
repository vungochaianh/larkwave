export type VideoTemplateId = 'game' | 'pixel' | 'draw';

export interface VideoTemplate {
  id: VideoTemplateId;
  name: string;
  description: string;
  /** Visual-style guidance injected into the scene-generation prompt. */
  style: string;
}

export const VIDEO_TEMPLATES: VideoTemplate[] = [
  {
    id: 'draw',
    name: 'Vẽ ra hình (whiteboard)',
    description: 'Hoạt hình vẽ tay nét mực — hình vẽ tự chạy ra như đang vẽ, nhiều màu, sống động.',
    style:
      'WHITEBOARD "draw-on" HAND animation (the signature vẽ-ra-hình look): coloured line strokes that literally DRAW THEMSELVES ON progressively as time advances — animate each stroke reveal via lineDashOffset (setLineDash with a big dash then reduce offset with t) or by drawing a partial path proportional to a per-element local progress from t, so it looks like it is being sketched live and FAST. Do NOT draw a pen/marker/hand — just the strokes appearing. Use SEVERAL colours from the palette for the strokes (colourful, not monochrome). Draw simple line-art icons/characters — a fresh little sketch for each narration beat, the previous one fading as the next draws on. Keep it lively (gentle bob, a few floating doodles). Playful and clean. NO on-screen text.',
  },
  {
    id: 'pixel',
    name: 'Pixel / retro 8-bit',
    description: 'Pixel-art 8-bit sống động: nhân vật chạy nhảy, hiệu ứng, màu rực kiểu game cổ.',
    style:
      'PIXEL-ART 8-bit ARCADE animation, HIGH ENERGY: render on a small logical grid (e.g. 160×284 for 9:16) with ctx.imageSmoothingEnabled=false then scale up so everything is chunky pixels. Animate a pixel CHARACTER/sprite that walks, jumps, or reacts, a scrolling tiled background, blinking coins/stars, particle bursts and a bouncing arcade vibe — motion on EVERY frame, stepped/retro timing (quantize positions to the grid), optional scanlines. A new mini-scene per narration beat. NO on-screen text.',
  },
  {
    id: 'game',
    name: 'Game / hành động',
    description: 'Phong cách game hiện đại: nhân vật hành động, nền cuộn, hiệu ứng, năng lượng cao.',
    style:
      'MODERN GAME / action look, CINEMATIC & DYNAMIC: a hero character/shape that moves and acts, a multi-layer PARALLAX background scrolling at different speeds with t, glowing particles, trails, screen-shake accents and a bit of camera pan/zoom. Keep constant motion and visual punch; introduce a fresh visual moment for each narration beat. NO on-screen text (captions are added separately).',
  },
];

export function getTemplate(id: string): VideoTemplate {
  return VIDEO_TEMPLATES.find((t) => t.id === id) ?? VIDEO_TEMPLATES[0];
}

/** Pixel dimensions for the chosen aspect. */
export function aspectDims(aspect: string): { w: number; h: number } {
  return aspect === '16:9' ? { w: 1280, h: 720 } : { w: 1080, h: 1920 };
}
