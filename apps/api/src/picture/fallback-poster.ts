import type { Palette } from '../media/palettes';

/**
 * Built-in deterministic HTML poster — used when MAIC poster generation times out or returns
 * invalid HTML, so Make Picture ALWAYS produces an image. A clean gradient card with the headline,
 * coloured by the chosen palette so it matches (and varies with) the rest.
 */
export function buildFallbackPoster(opts: { headline: string; sub?: string; pal: Palette; w: number; h: number }): string {
  const { headline, sub, pal, w, h } = opts;
  const p = { bg: pal.bg, bg2: pal.bg2, text: pal.ink, accent: pal.accent };
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const titleSize = Math.round(w * 0.066);
  const subSize = Math.round(w * 0.03);
  return `<!doctype html><html><head><meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;700;800&display=swap" rel="stylesheet">
  <style>
    html,body{margin:0;padding:0}
    .card{width:${w}px;height:${h}px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;
      align-items:center;text-align:center;padding:${Math.round(w * 0.1)}px;
      background:linear-gradient(135deg,${p.bg} 0%,${p.bg2} 100%);
      font-family:'Be Vietnam Pro',Arial,sans-serif;color:${p.text}}
    .bar{width:${Math.round(w * 0.12)}px;height:${Math.max(4, Math.round(w * 0.008))}px;background:${p.accent};border-radius:99px;margin-bottom:${Math.round(w * 0.05)}px}
    .title{font-weight:800;font-size:${titleSize}px;line-height:1.22;letter-spacing:-0.01em;max-width:100%}
    .sub{margin-top:${Math.round(w * 0.045)}px;font-size:${subSize}px;opacity:.82;font-weight:400;line-height:1.5;max-width:86%}
    .brand{position:absolute;bottom:${Math.round(h * 0.05)}px;font-size:${Math.round(w * 0.022)}px;opacity:.55;letter-spacing:.14em;text-transform:uppercase}
  </style></head>
  <body><div class="card">
    <div class="bar"></div>
    <div class="title">${esc(headline)}</div>
    ${sub ? `<div class="sub">${esc(sub)}</div>` : ''}
    <div class="brand">Larkwave</div>
  </div></body></html>`;
}
