import { BrowserWindow } from 'electron';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * siteCapture.ts — render a URL in a HIDDEN Electron window and capture a real reference of
 * the site so "Sao chép từ website" produces a FAITHFUL clone instead of an invented one.
 *
 * The local Claude CLI has no web access during a build, so without this it only ever sees
 * the URL string → it makes up a generic, ugly page. Here we use Electron's browser engine to
 * (1) screenshot the rendered page (Claude reads it via vision → sees the real design) and
 * (2) extract the real <img>/background image URLs, dominant colours, fonts, and headings so
 * the clone reuses the site's actual assets.
 */

export interface SiteCapture {
  ok: boolean;
  /** App-relative path of the saved screenshot, or undefined if capture failed. */
  screenshotPath?: string;
  title: string;
  images: string[];
  colors: string[];
  fonts: string[];
  headings: string[];
}

/** Block non-http(s) and private/loopback hosts (basic SSRF guard for the render window). */
function isUnsafeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return true;
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
    if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
    if (h === '::1' || h.startsWith('fc') || h.startsWith('fd')) return true;
    return false;
  } catch {
    return true;
  }
}

// Runs in the loaded PAGE's context — pulls the real assets + design tokens.
const EXTRACT_JS = `(function(){
  function abs(u){ try { return new URL(u, location.href).href; } catch(e){ return null; } }
  var imgs = [];
  document.querySelectorAll('img').forEach(function(el){
    var s = el.currentSrc || el.getAttribute('src');
    if (s){ var a = abs(s); if (a && a.indexOf('data:') !== 0) imgs.push(a); }
  });
  document.querySelectorAll('*').forEach(function(el){
    var bg = (getComputedStyle(el).backgroundImage || '');
    var m = bg.match(/url\\(["']?([^"')]+)["']?\\)/);
    if (m && m[1]){ var a = abs(m[1]); if (a && a.indexOf('data:') !== 0) imgs.push(a); }
  });
  var cc = {};
  document.querySelectorAll('body,header,nav,section,div,button,a,h1,h2').forEach(function(el){
    var cs = getComputedStyle(el);
    [cs.backgroundColor, cs.color].forEach(function(c){
      if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') cc[c] = (cc[c]||0) + 1;
    });
  });
  var colors = Object.keys(cc).sort(function(a,b){ return cc[b]-cc[a]; }).slice(0,10);
  var fs = {};
  document.querySelectorAll('body,h1,h2,p,button,a').forEach(function(el){ fs[getComputedStyle(el).fontFamily] = 1; });
  var fonts = Object.keys(fs).slice(0,4);
  var headings = Array.prototype.map.call(document.querySelectorAll('h1,h2,h3'), function(h){ return (h.textContent||'').trim(); }).filter(Boolean).slice(0,15);
  var seen = {}, uniq = [];
  imgs.forEach(function(u){ if(!seen[u]){ seen[u]=1; uniq.push(u); } });
  return { images: uniq.slice(0,24), colors: colors, fonts: fonts, headings: headings, title: document.title || '' };
})()`;

/**
 * Capture a reference of `url`, saving a screenshot into `${appDir}/.clone-ref/reference.png`.
 * Never throws — returns `{ ok: false }` on any failure (private/unreachable/timeout).
 */
export async function captureSite(url: string, appDir: string): Promise<SiteCapture> {
  const empty: SiteCapture = { ok: false, title: '', images: [], colors: [], fonts: [], headings: [] };
  if (isUnsafeUrl(url)) return empty;

  let win: BrowserWindow | null = null;
  try {
    win = new BrowserWindow({
      show: false,
      width: 1366,
      height: 1200,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
    });
    const w = win;
    await Promise.race([
      w.loadURL(url),
      new Promise<void>((_, reject) => setTimeout(() => reject(new Error('timeout')), 20000)),
    ]);
    // Let images / web fonts / lazy content settle before reading + shooting.
    await new Promise((r) => setTimeout(r, 2800));

    let data: Partial<SiteCapture> = {};
    try {
      data = (await w.webContents.executeJavaScript(EXTRACT_JS, true)) as Partial<SiteCapture>;
    } catch {
      /* extraction failed — still try the screenshot */
    }

    let screenshotPath: string | undefined;
    try {
      const img = await w.webContents.capturePage();
      if (!img.isEmpty()) {
        const refDir = join(appDir, '.clone-ref');
        await mkdir(refDir, { recursive: true });
        await writeFile(join(refDir, 'reference.png'), img.toPNG());
        screenshotPath = '.clone-ref/reference.png';
      }
    } catch {
      /* no screenshot */
    }

    return {
      ok: true,
      screenshotPath,
      title: data.title || '',
      images: Array.isArray(data.images) ? data.images : [],
      colors: Array.isArray(data.colors) ? data.colors : [],
      fonts: Array.isArray(data.fonts) ? data.fonts : [],
      headings: Array.isArray(data.headings) ? data.headings : [],
    };
  } catch {
    return empty;
  } finally {
    try {
      win?.destroy();
    } catch {
      /* already gone */
    }
  }
}
