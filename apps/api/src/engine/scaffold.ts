// Known-good Vite + React + TS scaffold. Generated source is merged ON TOP of
// this so a `vite build` always succeeds even if the model omits a config file.
// Build uses `vite build` (esbuild transpile) — never `tsc` — so minor type
// issues in generated code never block a deploy.

export const VITE_CONFIG = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
});
`;

export const TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      target: 'ES2020',
      useDefineForClassFields: true,
      lib: ['ES2020', 'DOM', 'DOM.Iterable'],
      module: 'ESNext',
      skipLibCheck: true,
      moduleResolution: 'bundler',
      resolveJsonModule: true,
      isolatedModules: true,
      noEmit: true,
      jsx: 'react-jsx',
      strict: false,
      allowJs: true,
    },
    include: ['src'],
  },
  null,
  2,
);

export const MAIN_TSX = `import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { TwErrorBoundary } from './twErrorBoundary';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TwErrorBoundary>
      <App />
    </TwErrorBoundary>
  </React.StrictMode>,
);
`;

/**
 * Runtime error boundary shipped into EVERY generated web app. Without it, a
 * single render throw (a bad map over undefined API data, a null deref) unmounts
 * the whole React tree to a blank white page — and because `vite build` never
 * runs the app, the build passes and the fix-loop never sees it, so the user
 * ships a "successful" deploy that is silently blank. This catches the throw and
 * shows a branded fallback with a reload button instead.
 */
export const TW_ERROR_BOUNDARY_TSX = `import React from 'react';

type Props = { children: React.ReactNode };
type State = { error: Error | null };

export class TwErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[app error]', error, info?.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", background: '#0b0b0f', color: '#fff' }}>
        <div style={{ maxWidth: 420, textAlign: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>⚠️</div>
          <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Đã xảy ra lỗi</h1>
          <p style={{ opacity: 0.7, fontSize: 14, margin: '0 0 20px' }}>Ứng dụng gặp sự cố khi hiển thị. Hãy thử tải lại trang.</p>
          <button onClick={() => location.reload()} style={{ cursor: 'pointer', border: 0, borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 600, color: '#0b0b0f', background: '#fff' }}>Tải lại</button>
        </div>
      </div>
    );
  }
}

export default TwErrorBoundary;
`;

// Design-system baseline (token layer + reset + a11y), used as the fallback when
// the model doesn't emit its own src/index.css. Gives every generated app a sane
// visual floor and named tokens (--bg/--surface/--text/--muted/--primary/--radius/
// --shadow) the WEB_SYSTEM prompt tells the model to build on, instead of a bare
// 4-line reset. (Body font is handled deterministically by injectFont.)
export const INDEX_CSS = `:root {
  color-scheme: light dark;
  --bg: #ffffff;
  --surface: #f6f7f9;
  --text: #15171a;
  --muted: #6b7280;
  --primary: #4f46e5;
  --primary-hover: #4338ca;
  --border: rgba(0,0,0,0.08);
  --radius: 12px;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.06);
  --shadow: 0 6px 24px rgba(0,0,0,0.08);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0b0c0f;
    --surface: #15171c;
    --text: #e7e9ee;
    --muted: #9aa3b2;
    --primary: #818cf8;
    --primary-hover: #a5b4fc;
    --border: rgba(255,255,255,0.1);
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.4);
    --shadow: 0 8px 30px rgba(0,0,0,0.5);
  }
}
* { box-sizing: border-box; }
html, body, #root { margin: 0; min-height: 100%; }
body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: var(--bg); color: var(--text); }
a { color: var(--primary); }
:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
`;

export const indexHtml = (title: string): string => `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title.replace(/[<>]/g, '')}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

export const appFallback = (title: string): string => `export default function App() {
  return (
    <main style={{ padding: 24 }}>
      <h1>${title.replace(/[<>]/g, '')}</h1>
      <p>Generated by Larkwave App Builder.</p>
    </main>
  );
}
`;

export const BASE_PKG = {
  dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
  devDependencies: { '@vitejs/plugin-react': '^4.3.4', vite: '^5.4.10', typescript: '^5.6.3' },
};

// ---------------------------------------------------------------------------
// PWA support — every generated web app becomes installable ("Thêm vào màn hình
// chính" / Add to Home Screen) with an auto-generated icon, a web app manifest,
// a safe network-first service worker, and a floating install button. Injected
// deterministically in normalizeWeb so it always works regardless of what the
// model emitted (same philosophy as the Vite scaffold merge). Files live under
// public/ so `vite build` copies them to the deploy root unchanged.
// ---------------------------------------------------------------------------

/** Larkwave brand violet — used when the build has no custom primary colour. */
export const DEFAULT_BRAND = '#6C5CE7';

const HEX6 = /^#[0-9a-fA-F]{6}$/;
const HEX3 = /^#[0-9a-fA-F]{3}$/;

/** Normalise an optional colour to a safe #rrggbb, falling back to the brand. */
function safeHex(input?: string | null): string {
  if (!input) return DEFAULT_BRAND;
  const c = input.trim();
  if (HEX6.test(c)) return c.toLowerCase();
  if (HEX3.test(c)) return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`.toLowerCase();
  return DEFAULT_BRAND;
}

/** Mix a #rrggbb colour toward white by `t` (0..1) — for the icon gradient. */
function lighten(hex: string, t: number): string {
  const h = safeHex(hex).slice(1);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * t);
  const to2 = (n: number) => n.toString(16).padStart(2, '0');
  return `#${to2(mix(r))}${to2(mix(g))}${to2(mix(b))}`;
}

const escapeXml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** First visible character of the app name, uppercased (icon glyph). */
function iconLetter(name: string): string {
  const ch = (name || '').trim().replace(/[^\p{L}\p{N}]/gu, '').charAt(0);
  return (ch || 'A').toUpperCase();
}

/**
 * Auto-generated app icon: a gradient rounded square (from the brand colour to a
 * lighter tint) with the app's initial in bold white. Scales crisply at any size
 * — used for the manifest icon and apple-touch-icon.
 */
export function appIconSvg(name: string, primaryColor?: string | null): string {
  const base = safeHex(primaryColor);
  const tint = lighten(base, 0.32);
  const letter = escapeXml(iconLetter(name));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${base}"/>
      <stop offset="1" stop-color="${tint}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#g)"/>
  <text x="256" y="262" dominant-baseline="central" text-anchor="middle"
    font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    font-size="300" font-weight="700" fill="#ffffff">${letter}</text>
</svg>
`;
}

/** Web app manifest enabling "Add to Home Screen" with the generated icon. */
export function manifestWebmanifest(name: string, primaryColor?: string | null): string {
  const clean = (name || 'App').replace(/[<>]/g, '').trim() || 'App';
  const short = clean.length <= 12 ? clean : clean.split(/\s+/)[0].slice(0, 12);
  return JSON.stringify(
    {
      name: clean,
      short_name: short,
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#ffffff',
      theme_color: safeHex(primaryColor),
      icons: [
        { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
      ],
    },
    null,
    2,
  );
}

/**
 * Network-first service worker: serves fresh content when online, falls back to
 * cache offline. Never caches `/api/*` or non-GET requests, so full-stack apps
 * keep working correctly.
 */
export const PWA_SERVICE_WORKER = `// Larkwave PWA service worker (network-first, offline fallback).
var CACHE = 'tw-cache-v1';
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(
          keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })
        );
      })
      .then(function () { return self.clients.claim(); })
  );
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('/api/') === 0) return; // never cache backend calls
  e.respondWith(
    fetch(req)
      .then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      })
      .catch(function () {
        return caches.match(req).then(function (hit) { return hit || caches.match('/'); });
      })
  );
});
`;

/** Inline boot script: registers the SW and renders the install button. */
function pwaBootstrapJs(primaryColor?: string | null): string {
  const color = safeHex(primaryColor);
  return `(function () {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }
  var standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (standalone) return;
  var btn = null;
  function makeBtn(label) {
    if (btn) return btn;
    btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.setAttribute('aria-label', 'Thêm vào màn hình chính');
    btn.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483000;border:none;border-radius:999px;padding:11px 18px;font:600 14px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#fff;background:${color};box-shadow:0 6px 20px rgba(0,0,0,.22);cursor:pointer';
    document.body.appendChild(btn);
    return btn;
  }
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    var b = makeBtn('\\uD83D\\uDCF2 Cài đặt ứng dụng');
    b.style.display = 'block';
    b.onclick = function () {
      b.style.display = 'none';
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.finally(function () { deferred = null; });
    };
  });
  window.addEventListener('appinstalled', function () { if (btn) btn.style.display = 'none'; });
  var isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  if (isIOS) {
    window.addEventListener('load', function () {
      var b = makeBtn('\\uD83D\\uDCF2 Thêm vào màn hình chính');
      b.onclick = function () {
        alert('Để cài như app: nhấn nút Chia sẻ ở thanh trình duyệt, rồi chọn \\u201CThêm vào MH chính\\u201D.');
      };
    });
  }
})();`;
}

/**
 * Inject PWA tags into an existing index.html (the model's or the scaffold's).
 * Idempotent — safe to run again on the build-fix pass.
 */
export function injectPwa(html: string, name: string, primaryColor?: string | null): string {
  let out = html;
  if (!out.includes('rel="manifest"')) {
    const title = escapeXml((name || 'App').replace(/[<>]/g, '').trim() || 'App');
    const head =
      `\n    <link rel="manifest" href="/manifest.webmanifest" />` +
      `\n    <meta name="theme-color" content="${safeHex(primaryColor)}" />` +
      `\n    <link rel="apple-touch-icon" href="/icon.svg" />` +
      `\n    <meta name="apple-mobile-web-app-capable" content="yes" />` +
      `\n    <meta name="mobile-web-app-capable" content="yes" />` +
      `\n    <meta name="apple-mobile-web-app-title" content="${title}" />\n  `;
    out = out.includes('</head>') ? out.replace('</head>', `${head}</head>`) : head + out;
  }
  if (!out.includes('/sw.js')) {
    const script = `\n    <script>${pwaBootstrapJs(primaryColor)}</script>\n  `;
    out = out.includes('</body>') ? out.replace('</body>', `${script}</body>`) : out + script;
  }
  return out;
}

/**
 * Inject a Google Font (<link>) + a default body font-family into <head>.
 * Idempotent. Typography is the single biggest "feels like a real product vs a
 * prototype" lever; WEB_SYSTEM/designHints DEMAND a web font but it only ships if
 * the model remembers the <link> — which it routinely drops on fix/iterate. We
 * ship it deterministically. The inline body rule loses to any explicit
 * per-element font-family the model set, so it only fills the gap.
 */
export function injectFont(html: string): string {
  if (html.includes('fonts.googleapis.com') || html.includes('__twFont')) return html;
  const head =
    `\n    <link rel="preconnect" href="https://fonts.googleapis.com" />` +
    `\n    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />` +
    `\n    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />` +
    `\n    <style id="__twFont">:root{--font-sans:'Inter',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}body{font-family:var(--font-sans)}</style>\n  `;
  return html.includes('</head>') ? html.replace('</head>', `${head}</head>`) : head + html;
}

/**
 * Idempotently wrap the root <App/> render in <TwErrorBoundary> inside an entry
 * file (src/main.tsx / index.tsx). Best-effort and SAFE: if the entry already
 * references a boundary, or no <App …/> render site is found, the file is returned
 * UNCHANGED — we never corrupt a file we can't transform cleanly. Assumes the
 * boundary lives at src/twErrorBoundary.tsx (a sibling of the entry).
 */
export function wrapEntryWithBoundary(entry: string): string {
  if (/ErrorBoundary/.test(entry)) return entry; // model has its own / already wrapped
  if (!/<App\b/.test(entry)) return entry;
  const importLine = "import { TwErrorBoundary } from './twErrorBoundary';\n";
  const firstImport = entry.indexOf('import ');
  const firstImportEnd = firstImport === -1 ? -1 : entry.indexOf('\n', firstImport);
  let out =
    firstImportEnd === -1
      ? importLine + entry
      : entry.slice(0, firstImportEnd + 1) + importLine + entry.slice(firstImportEnd + 1);

  const selfClose = /<App\b[^>]*\/>/;
  const paired = /<App\b[^>]*>[\s\S]*?<\/App>/;
  if (selfClose.test(out)) {
    out = out.replace(selfClose, (m) => `<TwErrorBoundary>${m}</TwErrorBoundary>`);
  } else if (paired.test(out)) {
    out = out.replace(paired, (m) => `<TwErrorBoundary>${m}</TwErrorBoundary>`);
  } else {
    return entry; // couldn't find a wrappable App site → leave the original untouched
  }
  return out;
}

// ---------------------------------------------------------------------------
// "Select to edit" inspector — a tiny script injected into every generated web
// app so the Larkwave preview can let users CLICK a real element (button, text,
// image…) to target a fix/change. The builder (parent window) toggles select
// mode via postMessage; on click the inspector reports the element back. It adds
// zero listeners and has zero visual effect until the parent turns it on, so the
// shipped app is unaffected in normal use.
// ---------------------------------------------------------------------------

export const TW_INSPECTOR_JS = `(function(){
  if (window.__twInspector) return; window.__twInspector = true;
  // Only active inside the Larkwave preview iframe — no-op on the live deployed
  // site (top-level), so the "select to edit" probe never runs for real visitors.
  if (window.parent === window) return;
  var on=false, box=null, lastTarget=null;
  function ensureBox(){
    if (box) return box;
    box=document.createElement('div');
    box.setAttribute('data-tw-inspector','1');
    box.style.cssText='position:fixed;z-index:2147483600;pointer-events:none;border:2px solid #6C5CE7;background:rgba(108,92,231,0.14);border-radius:4px;display:none;box-shadow:0 0 0 2px rgba(108,92,231,0.25)';
    (document.body||document.documentElement).appendChild(box);
    return box;
  }
  function onMove(e){
    var el=e.target; if(!el || (el.getAttribute && el.getAttribute('data-tw-inspector'))) return;
    lastTarget=el; var r=el.getBoundingClientRect(); var b=ensureBox();
    b.style.display='block'; b.style.left=r.left+'px'; b.style.top=r.top+'px';
    b.style.width=r.width+'px'; b.style.height=r.height+'px';
  }
  function cssPath(el){
    var parts=[]; var cur=el; var depth=0;
    while(cur && cur.nodeType===1 && cur!==document.body && cur!==document.documentElement && depth<6){
      var part=cur.tagName.toLowerCase();
      if(cur.id){ parts.unshift('#'+cur.id); break; }
      var parent=cur.parentNode;
      if(parent && parent.children){
        var same=[]; for(var i=0;i<parent.children.length;i++){ if(parent.children[i].tagName===cur.tagName) same.push(parent.children[i]); }
        if(same.length>1){ part+=':nth-of-type('+(same.indexOf(cur)+1)+')'; }
      }
      parts.unshift(part); cur=parent; depth++;
    }
    return parts.join(' > ');
  }
  function describe(el){
    var tag=(el.tagName||'').toLowerCase();
    var text=((el.innerText||el.textContent||'')+'').replace(/\\s+/g,' ').trim().slice(0,80);
    var id=el.id||'';
    return { tag:tag, text:text, id:id, selector:cssPath(el), label:(tag+(id?('#'+id):'')).slice(0,80) };
  }
  function onClick(e){
    if(!on) return;
    e.preventDefault(); e.stopPropagation();
    try{ parent.postMessage({ source:'tw-inspector', type:'tw-selected', payload:describe(e.target) }, '*'); }catch(_){}
    setMode(false);
  }
  function onKey(e){ if(on && e.key==='Escape') setMode(false); }
  function setMode(v){
    on=v;
    try{ document.documentElement.style.cursor=v?'crosshair':''; }catch(_){}
    if(v){
      document.addEventListener('mousemove',onMove,true);
      document.addEventListener('click',onClick,true);
      document.addEventListener('keydown',onKey,true);
    } else {
      document.removeEventListener('mousemove',onMove,true);
      document.removeEventListener('click',onClick,true);
      document.removeEventListener('keydown',onKey,true);
      if(box) box.style.display='none';
    }
    try{ parent.postMessage({ source:'tw-inspector', type:'tw-mode', enabled:v }, '*'); }catch(_){}
  }
  window.addEventListener('message', function(e){
    var d=e.data; if(!d || d.source!=='tw-parent') return;
    if(d.type==='tw-inspect') setMode(!!d.enabled);
    else if(d.type==='tw-ping'){ try{ parent.postMessage({ source:'tw-inspector', type:'tw-ready' }, '*'); }catch(_){} }
  });
  try{ parent.postMessage({ source:'tw-inspector', type:'tw-ready' }, '*'); }catch(_){}
})();`;

/** Inject the "select to edit" inspector before </body>. Idempotent. */
export function injectInspector(html: string): string {
  if (html.includes('__twInspector')) return html;
  const script = `\n    <script>${TW_INSPECTOR_JS}</script>\n  `;
  return html.includes('</body>') ? html.replace('</body>', `${script}</body>`) : html + script;
}

// ---------------------------------------------------------------------------
// In-app LOGS capture — a tiny devtools-lite probe injected into every generated
// web app so the Larkwave workspace can show the app's Console + Network "ngay
// tại màn", without opening the browser devtools. It wraps console.* + window
// error/rejection events + fetch + XMLHttpRequest, keeps a small ring buffer, and
// posts each entry to the parent (source:'tw-logs') — the SAME cross-origin
// postMessage bridge the inspector uses. It is read-only (it always calls the
// originals through) and inert until the workspace's Console tab listens, so the
// shipped app behaves identically in normal use. Runs as a CLASSIC inline script
// so it installs the wrappers DURING parse, before the deferred app module runs.
// ---------------------------------------------------------------------------

export const TW_LOGS_JS = `(function(){
  if (window.__twLogs) return; window.__twLogs = true;
  // Only active when embedded by the Larkwave builder (preview iframe). On a
  // normally-loaded production page (top-level, parent===window) this no-ops, so
  // the deployed app never monkey-patches console/fetch/XHR and never broadcasts
  // its logs/network — no privacy leak, no perpetual overhead for real visitors.
  if (window.parent === window) return;
  var BUF=[], MAX=600, seq=0;
  function safe(v, depth){
    depth = depth||0;
    try{
      if (v===null) return 'null';
      var t=typeof v;
      if (t==='string') return v.length>2000 ? v.slice(0,2000)+'…' : v;
      if (t==='number'||t==='boolean'||t==='undefined') return String(v);
      if (t==='function') return 'ƒ '+(v.name||'anonymous');
      if (t==='symbol') return v.toString();
      if (v instanceof Error) return v.name+': '+v.message;
      if (v && v.nodeType===1) return '<'+(v.tagName||'').toLowerCase()+'>';
      if (depth>=3) return Array.isArray(v)?'[…]':'{…}';
      if (Array.isArray(v)) return '['+v.slice(0,20).map(function(x){return safe(x,depth+1);}).join(', ')+(v.length>20?', …':'')+']';
      var keys=Object.keys(v).slice(0,30), parts=[];
      for (var i=0;i<keys.length;i++){ parts.push(keys[i]+': '+safe(v[keys[i]],depth+1)); }
      return '{'+parts.join(', ')+'}';
    }catch(_){ return String(v); }
  }
  function post(entry){
    entry.seq=++seq; entry.t=Date.now();
    BUF.push(entry); if (BUF.length>MAX) BUF.shift();
    try{ parent.postMessage({ source:'tw-logs', kind:'entry', entry:entry }, '*'); }catch(_){}
  }
  ['log','info','warn','error','debug'].forEach(function(level){
    var orig=console[level];
    if (typeof orig!=='function') return;
    console[level]=function(){
      try{ post({ type:'console', level:level, text:Array.prototype.slice.call(arguments).map(function(a){return safe(a);}).join(' ') }); }catch(_){}
      try{ return orig.apply(console, arguments); }catch(_){}
    };
  });
  window.addEventListener('error', function(e){
    try{ post({ type:'console', level:'error', text:(e.message||'Error')+(e.filename?(' ('+e.filename+':'+e.lineno+')'):'') }); }catch(_){}
  });
  window.addEventListener('unhandledrejection', function(e){
    try{ var r=e.reason; post({ type:'console', level:'error', text:'Unhandled rejection: '+(r&&r.message?r.message:safe(r)) }); }catch(_){}
  });
  if (window.fetch){
    var of=window.fetch;
    window.fetch=function(input, init){
      var start=Date.now();
      var method=((init&&init.method)||(input&&input.method)||'GET');
      var url=(typeof input==='string')?input:((input&&input.url)||String(input));
      return of.apply(this, arguments).then(function(res){
        try{ post({ type:'net', method:(method+'').toUpperCase(), url:url, status:res.status, ok:res.ok, ms:Date.now()-start }); }catch(_){}
        return res;
      }, function(err){
        try{ post({ type:'net', method:(method+'').toUpperCase(), url:url, status:0, ok:false, ms:Date.now()-start, error:(err&&err.message)||'network error' }); }catch(_){}
        throw err;
      });
    };
  }
  (function(){
    var op=XMLHttpRequest.prototype.open, sn=XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open=function(m,u){ try{ this.__tw={ method:(m+'').toUpperCase(), url:u, start:0 }; }catch(_){} return op.apply(this, arguments); };
    XMLHttpRequest.prototype.send=function(){
      var x=this;
      if (x.__tw){
        x.__tw.start=Date.now();
        x.addEventListener('loadend', function(){
          try{ post({ type:'net', method:x.__tw.method, url:x.__tw.url, status:x.status, ok:(x.status>=200&&x.status<400), ms:Date.now()-x.__tw.start }); }catch(_){}
        });
      }
      return sn.apply(this, arguments);
    };
  })();
  window.addEventListener('message', function(e){
    var d=e.data; if(!d || d.source!=='tw-parent') return;
    if (d.type==='tw-logs-flush' || d.type==='tw-logs-ping'){
      try{ parent.postMessage({ source:'tw-logs', kind:'backlog', entries:BUF }, '*'); }catch(_){}
    } else if (d.type==='tw-logs-clear'){ BUF=[]; }
  });
  try{ parent.postMessage({ source:'tw-logs', kind:'ready' }, '*'); }catch(_){}
})();`;

/** Inject the in-app logs probe before </body>. Idempotent. */
export function injectLogs(html: string): string {
  if (html.includes('__twLogs')) return html;
  const script = `\n    <script>${TW_LOGS_JS}</script>\n  `;
  return html.includes('</body>') ? html.replace('</body>', `${script}</body>`) : html + script;
}
