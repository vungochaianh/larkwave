import { Injectable, Logger } from '@nestjs/common';
import { lookup as dnsLookup } from 'node:dns';
import { isIP } from 'node:net';
import { isPrivateIp } from './site-clone';
import type { AnthropicImage } from './anthropic.service';
import type { Browser, BrowserContext, Frame, Page, Route } from 'playwright';

/**
 * site-capture.service.ts — render a user-supplied URL in headless Chromium and bring back a REAL
 * reference of the page (screenshot + computed design tokens) so "Sao chép từ website" clones what
 * the site actually looks like instead of what a text scraper guesses it looks like.
 *
 * `engine/site-clone.ts` fetches raw HTML and regexes it: no JS runs, no CSS is read, an SPA comes
 * back empty. This is the web twin of `apps/desktop/main/runtime/siteCapture.ts` (proven there):
 * a browser paints the page, we screenshot it into Claude vision and read the real image URLs,
 * colour histogram and font stacks off `getComputedStyle`.
 *
 * NEVER THROWS. Every failure path returns `{ ok: false, reason }` so a build degrades to the old
 * text clone instead of dying.
 *
 * SECURITY — this is the whole point of the file. A user picks the URL and OUR browser, inside OUR
 * network, fetches it. Chromium resolves DNS itself, so `site-clone.ts`'s connect-time `lookup`
 * pinning cannot protect it. Defence is layered:
 *   1. pre-flight: scheme, credentials, hostname denylist, literal-IP and resolve-all check;
 *   2. `--host-resolver-rules` pins the entry hostname to the exact address we validated, which
 *      closes DNS rebinding on the one host the attacker fully controls;
 *   3. `page.route` intercepts EVERY request — scheme, port, literal IP and a resolve-all DNS
 *      check on each new host — and, because Chromium follows 3xx internally without re-invoking
 *      the handler, navigations are fetched with redirects DISABLED so each `Location` is checked
 *      before the browser can act on it (this leaked one live GET to loopback until it was fixed);
 *   4. `framenavigated` re-validates the URL the frame actually landed on (belt and braces for
 *      client-side navigations and meta-refresh);
 *   5. WebSockets are routed and closed (they bypass `page.route`) and service workers blocked
 *      (their fetches are not interceptable);
 *   6. hard wall-clock deadline, byte budget, capped screenshot, browser closed in a `finally`.
 * The private/loopback/link-local/CGNAT/IPv4-mapped-IPv6 ranges come from `isPrivateIp` in
 * site-clone.ts — one implementation, deliberately not a second differently-wrong copy.
 */

// ── budgets ──────────────────────────────────────────────────────────────────

const VIEWPORT_W = 1440;
const VIEWPORT_H = 1200;

/**
 * Trang được chụp thành NHIỀU Ô nối tiếp, không phải một ảnh cao duy nhất.
 *
 * Vì sao: Claude thu nhỏ mọi ảnh có cạnh dài quá 1568px. Một ảnh 1440×4000 về còn 565×1568 — hệ
 * số 0,39, nên chữ 14px chỉ còn 5,5px: model thấy được vệt màu và nhịp bố cục, nhưng KHÔNG ĐỌC
 * ĐƯỢC gì. Đo trên xemlicham.com: cả 3 bảng lịch đều nằm trong vùng chụp, vậy mà bản sao ra 0
 * bảng — model nhìn thấy chúng nhưng không đọc nổi chữ bên trong.
 *
 * Một ô 1440×1200 VẪN bị thu nhỏ trên Sonnet (model mặc định): 1,73MP vượt trần ~1,18MP nên co
 * lại ×0,82 → ~1188×990, chữ 14px về ~11,5px — ĐỌC ĐƯỢC. Không phải "không thu nhỏ", nhưng là
 * 2,1 lần tốt hơn mức 5,5px của một ảnh cao duy nhất. Muốn không thu nhỏ chút nào thì phải hạ ô
 * xuống ≤800px, tức 8 ô — không đáng, vì 11,5px đã đủ để đọc bảng.
 */
const TILE_H = 1200;
/**
 * Số ô tối đa là 5, KHÔNG phải 6 — dù ngân sách ảnh của prompt là 6.
 * Bằng đúng 6 thì các ô chiếm sạch ngân sách và ĐÁ VĂNG mọi ảnh mockup người dùng đính kèm.
 * 5 × 1200 = 6000px vẫn phủ trọn một trang chủ 5969px, và chừa lại một chỗ cho người dùng.
 */
const MAX_TILES = 5;
/** Chiều cao tối đa còn chụp — phần dưới nữa gần như luôn là footer/quảng cáo. */
const MAX_SHOT_HEIGHT = TILE_H * MAX_TILES;

/** PNG over this is re-taken as JPEG: uploads caps images at 5MB and base64 inflates by ~1.37×. */
const MAX_SHOT_BYTES = 3_000_000;

const SETTLE_MS = 2_500; // let webfonts / lazy images paint before reading + shooting
// Nới từ 25s: chụp 5 ô là 5 lần screenshot tuần tự, không phải 1.
const HARD_MS = 35_000; // wall clock for one capture, once it has a browser slot
const BACKSTOP_MS = 42_000; // absolute "cannot possibly hang" cap (a page can wedge page.evaluate)
const GOTO_MS = 15_000;
const LOAD_MS = 6_000;
const SCROLL_MS = 3_000;
// Nới từ 8s. Với 8s chia cho 5 ô, các ô CUỐI — đúng phần trang trước đây bị mất — lại là thứ
// bị bỏ đầu tiên khi hết giờ, tức bản vá tự vô hiệu hoá chính mục đích của nó.
const SHOT_MS = 16_000;
const DNS_MS = 4_000; // a hung resolver must fail CLOSED, not stall the build

const MAX_PAGE_BYTES = 30_000_000; // best-effort download budget across the whole page
const MAX_DOC_BYTES = 8_000_000; // hard cap on a single document we hand to the renderer
const MAX_HOSTS = 512; // distinct hosts one page may pull from before we stop trusting it
const MAX_REDIRECT_HOPS = 8; // each hop is now a fresh navigation, so bound the chain ourselves

const MAX_CONCURRENT = 2; // Chromium is heavy and shares this VPS with codegen + video renders
const MAX_QUEUE = 6;
const QUEUE_WAIT_MS = 10_000;

/** Real-browser UA: many sites serve a stripped/blocked page to "HeadlessChrome". */
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * Ports that never serve a web page worth cloning but do front databases / admin planes. Private
 * addresses are already blocked by IP, so this only trims the residual "public host, wrong port"
 * surface; Chromium blocks a different (mostly mail/legacy) set of its own.
 */
const BLOCKED_PORTS = new Set([
  22, 23, 25, 110, 143, 445, 465, 587, 993, 995, 1433, 1521, 2049, 2375, 2376, 3306, 3389, 5432,
  5900, 6379, 9200, 11211, 27017,
]);

// ── result shape ─────────────────────────────────────────────────────────────

/** Real design tokens read off the painted page (not guessed from HTML source). */
export interface SiteCaptureExtract {
  title: string;
  description: string;
  /** Absolute URLs of <img> + CSS background images actually used by the page. */
  images: string[];
  /** Computed colours, most-used first (rgb()/rgba() strings, as the browser reports them). */
  colors: string[];
  fonts: string[];
  headings: string[];
  /** Dàn ý có cấu trúc của trang: tiêu đề, đoạn, danh sách, và BẢNG giữ nguyên hàng/cột. */
  outline: string;
  /** Nhãn các link trong header/nav — để bản sao không tự bịa thêm mục menu. */
  navLinks: string[];
  /** Chiều cao thật của trang, để biết ảnh chụp có phủ hết hay không. */
  pageHeight: number;
}

export interface SiteCaptureResult {
  ok: boolean;
  /** URL the browser really ended on (after redirects) — useful for resolving relative assets. */
  finalUrl?: string;
  /**
   * Các ô ảnh nối tiếp nhau TỪ TRÊN XUỐNG của cùng một trang, mỗi ô một khung nhìn.
   * Rỗng khi không chụp được. Thứ tự trong mảng CHÍNH LÀ thứ tự trên trang.
   */
  screenshots?: AnthropicImage[];
  extracted?: SiteCaptureExtract;
  /** Vietnamese, user-facing: why the capture was skipped. Only set when `ok` is false. */
  reason?: string;
}

// ── URL / host classification ────────────────────────────────────────────────

/**
 * Hostname reduced to the form `isIP` / `isPrivateIp` understand. Two normalisations, both of
 * which are bypasses if skipped:
 *  - `URL.hostname` KEEPS the brackets on an IPv6 literal ("http://[::1]/" → "[::1]"), and
 *    `isIP('[::1]')` is 0 — so without this the literal-IP branch is never taken and `::1`
 *    reaches the DNS path as if it were a name (verified against Node's WHATWG parser);
 *  - a trailing FQDN dot ("localhost.") slips past an equality check on the denylist.
 */
function normHost(hostname: string): string {
  let h = (hostname || '').toLowerCase();
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  return h.endsWith('.') ? h.slice(0, -1) : h;
}

type QuickVerdict = 'block' | 'resolve';

/**
 * Synchronous half of the guard: everything decidable without DNS. Returns 'block' to refuse
 * outright, 'resolve' when the hostname still has to be checked against its addresses.
 * Mirrors `isSafeUrl` in site-clone.ts (same denylist, same literal-IP rule) plus port + userinfo.
 */
function quickVerdict(raw: string): QuickVerdict {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return 'block';
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'block';
  if (u.username || u.password) return 'block'; // no credential smuggling into an internal service
  const host = normHost(u.hostname);
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal'))
    return 'block';
  if (u.port && BLOCKED_PORTS.has(Number(u.port))) return 'block';
  // Literal IP (the WHATWG parser has already canonicalised 2130706433 / 0x7f.1 → dotted quad).
  if (isIP(host)) return isPrivateIp(host) ? 'block' : 'resolve';
  return 'resolve';
}

/** Every address a hostname resolves to, or null if it cannot be resolved in time. */
function resolveAll(host: string): Promise<string[] | null> {
  return new Promise<string[] | null>((resolve) => {
    let done = false;
    const finish = (v: string[] | null) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), DNS_MS);
    dnsLookup(host, { all: true }, (err, addresses) => {
      clearTimeout(timer);
      if (err || !addresses || !addresses.length) return finish(null);
      finish(addresses.map((a) => a.address));
    });
  });
}

/**
 * Per-capture host allow-check with memoisation — a page issues hundreds of requests and we must
 * not pay a DNS round trip for each. Fails CLOSED on resolve failure, on an unresolvable host and
 * once a page has pulled from absurdly many hosts.
 */
class HostGuard {
  private readonly cache = new Map<string, Promise<boolean>>();

  allowed(host: string): Promise<boolean> {
    const key = normHost(host);
    const hit = this.cache.get(key);
    if (hit) return hit;
    if (this.cache.size >= MAX_HOSTS) return Promise.resolve(false);
    const p = (async () => {
      if (isIP(key)) return !isPrivateIp(key);
      const addrs = await resolveAll(key);
      if (!addrs) return false;
      return addrs.every((a) => !isPrivateIp(a));
    })();
    this.cache.set(key, p);
    return p;
  }

  /** Full check for a URL string: sync rules first, then the resolve-all check. */
  async urlAllowed(raw: string): Promise<boolean> {
    if (quickVerdict(raw) === 'block') return false;
    try {
      return await this.allowed(new URL(raw).hostname);
    } catch {
      return false;
    }
  }
}

// ── in-page extraction (ported from apps/desktop/main/runtime/siteCapture.ts) ─

interface RawExtract {
  title: string;
  description: string;
  images: string[];
  colors: string[];
  fonts: string[];
  headings: string[];
  outline: string;
  navLinks: string[];
  pageHeight: number;
}

/**
 * Runs in the PAGE's context. Reads what only a real browser knows: `currentSrc` (so responsive
 * images resolve), CSS background images, a frequency-ranked computed-colour histogram and the
 * real font stacks.
 */
function extractInPage(): RawExtract {
  const abs = (u: string): string | null => {
    try {
      return new URL(u, location.href).href;
    } catch {
      return null;
    }
  };
  const imgs: string[] = [];
  const pushImg = (s: string | null | undefined) => {
    if (!s) return;
    const a = abs(s);
    if (a && a.indexOf('data:') !== 0 && /^https?:/i.test(a)) imgs.push(a);
  };
  document.querySelectorAll('img').forEach((el) => {
    const im = el as HTMLImageElement;
    pushImg(im.currentSrc || im.getAttribute('src'));
  });
  // Background images: bounded scan — a hostile/huge DOM must not stall the capture.
  const all = Array.prototype.slice.call(document.querySelectorAll('*'), 0, 4000) as Element[];
  all.forEach((el) => {
    const bg = getComputedStyle(el).backgroundImage || '';
    const m = bg.match(/url\(["']?([^"')]+)["']?\)/);
    if (m && m[1]) pushImg(m[1]);
  });

  const counts: Record<string, number> = {};
  document.querySelectorAll('body,header,nav,section,div,button,a,h1,h2').forEach((el) => {
    const cs = getComputedStyle(el);
    [cs.backgroundColor, cs.color].forEach((c) => {
      if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') counts[c] = (counts[c] || 0) + 1;
    });
  });
  const colors = Object.keys(counts)
    .sort((a, b) => counts[b] - counts[a])
    .slice(0, 10);

  const fontSet: Record<string, number> = {};
  document.querySelectorAll('body,h1,h2,p,button,a').forEach((el) => {
    const f = getComputedStyle(el).fontFamily;
    if (f) fontSet[f] = 1;
  });

  const headings = Array.prototype.map
    .call(document.querySelectorAll('h1,h2,h3'), (h: Element) => (h.textContent || '').trim())
    .filter(Boolean) as string[];

  const seen: Record<string, number> = {};
  const uniqImgs: string[] = [];
  imgs.forEach((u) => {
    if (!seen[u]) {
      seen[u] = 1;
      uniqImgs.push(u);
    }
  });

  // ── DÀN Ý CÓ CẤU TRÚC ────────────────────────────────────────────────────────
  // Đường trích cũ đưa cho model `strip(body)` — toàn bộ chữ của trang bị ép thành MỘT chuỗi
  // phẳng. Với một trang lịch âm mà giá trị nằm ở BẢNG, làm phẳng là xoá sạch thứ cần sao chép:
  // đo thực tế, bản sao ra 0 bảng trong khi trang gốc có 3. Ở đây có DOM sống, nên giữ nguyên
  // được quan hệ khối → tiêu đề → đoạn/danh sách/bảng.
  const outline: string[] = [];
  const seenText = new Set<string>();
  const txt = (el: Element): string =>
    ((el as HTMLElement).innerText || el.textContent || '').replace(/\s+/g, ' ').trim();

  const walkNodes = Array.prototype.slice.call(
    document.querySelectorAll('h1,h2,h3,h4,p,li,table,blockquote'),
    0,
    600,
  ) as Element[];
  for (const el of walkNodes) {
    // Bỏ phần tử ẩn: menu xổ xuống, tab chưa mở, banner đã đóng — chúng không nằm trong ảnh
    // chụp, nên đưa vào dàn ý sẽ khiến model dựng ra những khối không hề tồn tại trên trang.
    const r = (el as HTMLElement).getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;

    const tag = el.tagName.toLowerCase();
    if (tag === 'table') {
      const rows = Array.prototype.slice.call(el.querySelectorAll('tr'), 0, 40) as Element[];
      const body = rows
        .map((tr) => {
          const cells = Array.prototype.slice.call(tr.querySelectorAll('th,td'), 0, 12) as Element[];
          return cells.map((c) => txt(c).slice(0, 60)).join(' | ');
        })
        .filter(Boolean);
      if (body.length) {
        const cols = Math.max.apply(null, body.map((l) => l.split('|').length));
        outline.push(`[BẢNG ${cols} cột × ${body.length} dòng]`);
        body.forEach((l) => outline.push(`| ${l} |`));
      }
      continue;
    }
    const t = txt(el);
    if (!t || t.length < 2 || t.length > 400) continue;
    // Chữ trong <li>/<p> hay bị lặp vì phần tử cha cũng khớp — chỉ giữ lần xuất hiện đầu.
    if (seenText.has(t)) continue;
    seenText.add(t);
    if (/^h[1-4]$/.test(tag)) outline.push(`\n${'#'.repeat(Number(tag[1]))} ${t}`);
    else if (tag === 'li') outline.push(`- ${t}`);
    else outline.push(t);
    if (outline.length > 900) break;
  }

  // Header/nav thật, tách riêng: bản sao hay tự bịa thêm mục menu, nên đưa danh sách CHÍNH XÁC.
  // Chọn theo VỊ TRÍ chứ không theo thẻ: đo trên xemlicham.com, trang không dùng <nav> hay
  // <header> nào cả — lọc theo thẻ trả về rỗng, và "đừng bịa menu" mất luôn danh sách để đối
  // chiếu. Link nằm trong dải 160px trên cùng thì chính là thanh điều hướng, dù markup ra sao.
  const navSeen = new Set<string>();
  const navLinks: string[] = [];
  const anchors = Array.prototype.slice.call(document.querySelectorAll('a'), 0, 400) as Element[];
  for (const a of anchors) {
    const r = a.getBoundingClientRect();
    if (r.height < 2 || r.top + window.scrollY > 160) continue;
    const t = txt(a);
    if (!t || t.length > 40 || navSeen.has(t)) continue;
    navSeen.add(t);
    navLinks.push(t);
    if (navLinks.length >= 30) break;
  }

  const descEl = document.querySelector('meta[name="description"]');
  return {
    outline: outline.join('\n').slice(0, 24000),
    navLinks,
    pageHeight: document.documentElement.scrollHeight,
    title: document.title || '',
    description: descEl ? descEl.getAttribute('content') || '' : '',
    images: uniqImgs.slice(0, 24),
    colors,
    fonts: Object.keys(fontSet).slice(0, 4),
    headings: headings.slice(0, 20),
  };
}

/**
 * Text hygiene on everything the page hands back: strip zero-width / bidi controls (they hide
 * payloads inside otherwise-innocent strings), collapse whitespace, bound the length.
 * NOTE: this is hygiene, not prompt-injection defence — the caller must still fence this block
 * as untrusted (see `defang()` in site-clone.ts) before it goes near a prompt.
 */
function scrub(s: string, max: number): string {
  return String(s || '')
    .replace(/[­​-‏‪-‮⁠﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function cleanExtract(raw: Partial<RawExtract> | null | undefined): SiteCaptureExtract {
  const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as unknown[]).map(String) : []);
  return {
    title: scrub(raw?.title || '', 200),
    description: scrub(raw?.description || '', 400),
    images: arr(raw?.images)
      .filter((u) => /^https?:\/\//i.test(u))
      .slice(0, 24)
      .map((u) => u.slice(0, 500)),
    colors: arr(raw?.colors)
      .map((c) => scrub(c, 40))
      .filter(Boolean)
      .slice(0, 10),
    fonts: arr(raw?.fonts)
      .map((f) => scrub(f, 120))
      .filter(Boolean)
      .slice(0, 4),
    headings: arr(raw?.headings)
      .map((h) => scrub(h, 160))
      .filter((h) => h.length > 1)
      .slice(0, 20),
    // Dàn ý giữ nguyên XUỐNG DÒNG (scrub() gộp mọi khoảng trắng, sẽ phá cấu trúc) — chỉ bỏ ký
    // tự điều khiển ẩn và giới hạn độ dài.
    outline: String(raw?.outline || '')
      .replace(/[\u00ad\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g, '')
      .slice(0, 24000),
    navLinks: arr(raw?.navLinks)
      .map((t) => scrub(t, 40))
      .filter(Boolean)
      .slice(0, 30),
    pageHeight: Number(raw?.pageHeight) || 0,
  };
}

// ── service ──────────────────────────────────────────────────────────────────

@Injectable()
export class SiteCaptureService {
  private readonly logger = new Logger(SiteCaptureService.name);
  private inFlight = 0;
  private readonly waiters: Array<() => void> = [];

  /**
   * Screenshot + read `rawUrl`. Never throws and never rejects: on any problem (blocked address,
   * timeout, no Chromium on the box) it returns `{ ok: false, reason }` and the build carries on
   * with the text-only clone reference.
   *
   * Worst case ≈ QUEUE_WAIT_MS + BACKSTOP_MS.
   */
  async capture(rawUrl: string): Promise<SiteCaptureResult> {
    if (quickVerdict(rawUrl) === 'block')
      return { ok: false, reason: 'URL không hợp lệ hoặc trỏ tới địa chỉ nội bộ (bị chặn).' };

    if (!(await this.acquire()))
      return { ok: false, reason: 'Máy chủ đang bận chụp trang khác, bỏ qua bước chụp ảnh.' };

    try {
      // The run owns the browser lifecycle (closed in its own finally); this race is only the
      // backstop for a page that manages to wedge an in-page evaluate.
      let timer: NodeJS.Timeout | undefined;
      const backstop = new Promise<SiteCaptureResult>((resolve) => {
        timer = setTimeout(
          () => resolve({ ok: false, reason: 'Quá thời gian chụp trang nguồn.' }),
          BACKSTOP_MS,
        );
      });
      const run = this.run(rawUrl).catch((e): SiteCaptureResult => {
        this.logger.warn(`site capture failed: ${(e as Error)?.message || e}`);
        return { ok: false, reason: 'Không chụp được trang nguồn.' };
      });
      const out = await Promise.race([run, backstop]);
      clearTimeout(timer);
      // If the backstop won, let the run finish closing its browser without an unhandled rejection.
      void run.then(() => undefined);
      return out;
    } finally {
      this.release();
    }
  }

  // ── the actual capture ─────────────────────────────────────────────────────

  private async run(rawUrl: string): Promise<SiteCaptureResult> {
    const deadline = Date.now() + HARD_MS;
    const left = (cap: number) => Math.max(1_000, Math.min(cap, deadline - Date.now()));

    const entry = new URL(rawUrl);
    const entryHost = normHost(entry.hostname);
    const guard = new HostGuard();

    // Pre-flight resolve-all. Also gives us the address to PIN, which is what actually stops DNS
    // rebinding on the entry host: Chromium would otherwise re-resolve it and could get a
    // different (internal) answer than the one we validated.
    let pinnedIp = '';
    if (isIP(entryHost)) {
      if (isPrivateIp(entryHost))
        return { ok: false, reason: 'Trang nguồn trỏ tới địa chỉ nội bộ (bị chặn).' };
    } else {
      const addrs = await resolveAll(entryHost);
      if (!addrs) return { ok: false, reason: 'Không phân giải được tên miền của trang nguồn.' };
      if (addrs.some((a) => isPrivateIp(a)))
        return { ok: false, reason: 'Trang nguồn trỏ tới địa chỉ nội bộ (bị chặn).' };
      pinnedIp = addrs[0];
    }

    const args = [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--hide-scrollbars',
      '--mute-audio',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-client-side-phishing-detection',
      '--disable-sync',
      '--disable-extensions',
    ];
    if (pinnedIp)
      args.push(
        `--host-resolver-rules=MAP ${entryHost} ${isIP(pinnedIp) === 6 ? `[${pinnedIp}]` : pinnedIp}`,
      );

    // Lazy import — Playwright/Chromium is heavy; only load it when actually capturing.
    const { chromium } = await import('playwright');
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    try {
      browser = await chromium.launch({ args });
      context = await browser.newContext({
        viewport: { width: VIEWPORT_W, height: VIEWPORT_H },
        deviceScaleFactor: 1,
        userAgent: USER_AGENT,
        acceptDownloads: false, // nothing should ever land on this disk
        serviceWorkers: 'block', // a SW's fetches are not interceptable by page.route
        ignoreHTTPSErrors: false, // a broken cert degrades to the text clone rather than proceeding
        bypassCSP: false,
      });
      const page = await context.newPage();
      page.setDefaultTimeout(GOTO_MS);
      page.setDefaultNavigationTimeout(GOTO_MS);

      // `blocked` is the hard kill-switch (abandon the capture). `navBlocked` only records WHY a
      // navigation was refused so the user gets the real message instead of a generic failure —
      // a refused SUBRESOURCE must not kill the capture, the page just renders without it.
      const state: {
        blocked: string | null;
        navBlocked: string | null;
        bytes: number;
        hops: number;
      } = { blocked: null, navBlocked: null, bytes: 0, hops: 0 };
      const INTERNAL_REDIRECT = 'Trang nguồn chuyển hướng tới địa chỉ nội bộ (bị chặn).';
      const trip = (reason: string, what: string) => {
        if (state.blocked) return;
        state.blocked = reason;
        this.logger.warn(`site capture blocked (${what})`);
        void page.close().catch(() => undefined); // unblocks whatever is awaiting
      };

      // (3) EVERY request. A predicate matcher is used instead of the '**/*' glob so no URL shape
      // can fail to match and slip through unchecked.
      await page.route(
        () => true,
        async (route: Route) => {
          const kill = async (code = 'blockedbyclient') => {
            await route.abort(code).catch(() => undefined);
          };
          try {
            if (state.blocked) return await kill();
            const req = route.request();
            const url = req.url();
            if (req.resourceType() === 'media') return await kill('blockedbyclient'); // unbounded streams
            if (state.bytes > MAX_PAGE_BYTES) return await kill();
            const isNav = req.isNavigationRequest();
            if (!(await guard.urlAllowed(url))) {
              if (isNav) state.navBlocked = INTERNAL_REDIRECT;
              return await kill('addressunreachable');
            }

            if (!isNav) return await route.continue();

            // MEASURED, and the reason this branch exists: once a route is `continue()`d, Chromium
            // follows any 3xx INSIDE that same interception and Playwright does NOT re-invoke this
            // handler for the next hop — a 302 to http://127.0.0.1:5433/ went on the wire before
            // any guard saw it (framenavigated only caught it afterwards). So for navigations we
            // fetch the response ourselves with redirects DISABLED and validate each Location
            // before the browser is ever allowed to act on it.
            if (++state.hops > MAX_REDIRECT_HOPS) return await kill();
            const resp = await route.fetch({ maxRedirects: 0, timeout: left(GOTO_MS) });
            const status = resp.status();
            if (status >= 300 && status < 400) {
              const loc = resp.headers()['location'] || '';
              let next = '';
              try {
                next = new URL(loc, url).href;
              } catch {
                next = '';
              }
              if (!next || !(await guard.urlAllowed(next))) {
                state.navBlocked = INTERNAL_REDIRECT;
                return await kill('addressunreachable');
              }
            }
            const declared = Number(resp.headers()['content-length'] || 0);
            if (Number.isFinite(declared) && declared > MAX_DOC_BYTES) return await kill();
            await route.fulfill({ response: resp });
          } catch {
            await kill();
          }
        },
      );

      // (5) WebSockets bypass page.route's IP guard entirely — a reference screenshot never needs
      // one, so refuse them all. Not calling connectToServer() means nothing is ever dialled.
      await page
        .routeWebSocket(
          () => true,
          (ws) => {
            ws.close();
          },
        )
        .catch(() => undefined);

      // (4) Re-validate what the MAIN frame actually landed on: 302s and client-side navigations.
      // Scoped to the main frame on purpose. Sub-frames are already gated at the request layer
      // (their navigations are routed and redirect-validated like any other), and a blocked ad
      // iframe reports its URL as `chrome-error://chromewebdata/` — treating that as a violation
      // made the guard cannibalise itself and every ad-funded site (vnexpress.net et al) failed
      // to capture. Only http(s) is validated here; anything else is a dead/blocked frame, not a
      // way to reach the internal network (Chromium refuses to navigate a page to file://, and
      // the route layer blocks non-http schemes before they are ever requested).
      page.on('framenavigated', (frame: Frame) => {
        if (frame !== page.mainFrame()) return;
        const u = frame.url();
        if (!u || !/^https?:\/\//i.test(u)) return;
        if (quickVerdict(u) === 'block') return trip(INTERNAL_REDIRECT, u);
        void guard.urlAllowed(u).then((ok) => {
          if (!ok) trip(INTERNAL_REDIRECT, u);
        });
      });

      // Best-effort download budget: Content-Length is advisory (absent on chunked responses), so
      // the hard bounds remain the deadline, the media block and the screenshot cap.
      page.on('response', (res) => {
        const n = Number(res.headers()['content-length'] || 0);
        if (Number.isFinite(n) && n > 0) state.bytes += n;
      });

      try {
        await page.goto(rawUrl, { waitUntil: 'domcontentloaded', timeout: left(GOTO_MS) });
      } catch (e) {
        const stop = state.blocked || state.navBlocked;
        if (stop) return { ok: false, reason: stop };
        throw e;
      }
      if (state.blocked) return { ok: false, reason: state.blocked };

      await page.waitForLoadState('load', { timeout: left(LOAD_MS) }).catch(() => undefined);
      // Walk the page so lazy-loaded imagery below the fold is actually painted before we shoot.
      await this.withTimeout(
        page.evaluate(async (maxH: number) => {
          const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
          for (let y = 0; y < maxH; y += 800) {
            window.scrollTo(0, y);
            await sleep(90);
            const h = document.documentElement?.scrollHeight || 0;
            if (y > h) break;
          }
          window.scrollTo(0, 0);
        }, MAX_SHOT_HEIGHT),
        left(SCROLL_MS),
      ).catch(() => undefined);
      await page
        .evaluate(() => (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts?.ready)
        .catch(() => undefined);
      await page.waitForTimeout(Math.min(SETTLE_MS, left(SETTLE_MS)));
      if (state.blocked) return { ok: false, reason: state.blocked };

      const finalUrl = page.url();
      // Final gate: after every redirect and script-driven hop, is the page we are about to read
      // still on a public address?
      if (!(await guard.urlAllowed(finalUrl)))
        return { ok: false, reason: 'Trang nguồn kết thúc ở địa chỉ nội bộ (bị chặn).' };

      let extracted: SiteCaptureExtract | undefined;
      try {
        const raw = await this.withTimeout(page.evaluate(extractInPage), left(5_000));
        extracted = cleanExtract(raw);
      } catch {
        /* extraction failed — the screenshot alone is still worth having */
      }

      const screenshots = await this.shoot(page, left(SHOT_MS)).catch(() => []);
      if (state.blocked) return { ok: false, reason: state.blocked };
      if (!screenshots.length && !extracted) return { ok: false, reason: 'Không đọc được nội dung trang nguồn.' };

      return { ok: true, finalUrl, screenshots, extracted };
    } finally {
      await context?.close().catch(() => undefined);
      await browser?.close().catch(() => undefined);
    }
  }

  /**
   * Chụp trang thành các ô liên tiếp (xem TILE_H). Playwright cắt clip theo trang thật, nên
   * document rect, so short pages are not padded). Falls back to JPEG when the PNG would blow the
   * per-image budget — a 4000px-tall PNG of a photo-heavy site easily exceeds it.
   */
  private async shoot(page: Page, timeout: number): Promise<AnthropicImage[]> {
    const pageH: number = await page
      .evaluate(() => document.documentElement.scrollHeight)
      .catch(() => TILE_H);
    const height = Math.min(Math.max(pageH, TILE_H), MAX_SHOT_HEIGHT);
    const tiles = Math.min(Math.ceil(height / TILE_H), MAX_TILES);
    const out: AnthropicImage[] = [];
    const perTile = Math.max(2_000, Math.floor(timeout / tiles));

    for (let i = 0; i < tiles; i += 1) {
      const y = i * TILE_H;
      // Ô cuối bị cắt cho vừa trang thật, để không thừa một dải trắng vô nghĩa.
      const h = Math.min(TILE_H, height - y);
      if (h < 80) break;
      const common = {
        fullPage: true as const,
        clip: { x: 0, y, width: VIEWPORT_W, height: h },
        scale: 'css' as const,
        animations: 'disabled' as const,
        caret: 'hide' as const,
        timeout: perTile,
      };
      try {
        const png = await page.screenshot({ ...common, type: 'png' });
        if (png.length <= MAX_SHOT_BYTES) {
          out.push({ mime: 'image/png', data: png.toString('base64') });
          continue;
        }
        const jpeg = await page.screenshot({ ...common, type: 'jpeg', quality: 72 });
        if (jpeg.length <= MAX_SHOT_BYTES) out.push({ mime: 'image/jpeg', data: jpeg.toString('base64') });
        // Ô quá nặng thì BỎ ô đó thôi, các ô khác vẫn giữ — thà thiếu một khúc còn hơn mất cả trang.
      } catch {
        break; // hết giờ hoặc trang chết: giữ những ô đã chụp được
      }
    }
    return out;
  }


  private withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    return Promise.race([
      p.finally(() => clearTimeout(timer)),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), ms);
      }),
    ]);
  }

  // ── concurrency (Chromium shares this box with codegen builds + video renders) ──

  private async acquire(): Promise<boolean> {
    if (this.inFlight < MAX_CONCURRENT) {
      this.inFlight++;
      return true;
    }
    if (this.waiters.length >= MAX_QUEUE) return false;
    const got = await new Promise<boolean>((resolve) => {
      let timer: NodeJS.Timeout | undefined;
      const wake = () => {
        clearTimeout(timer);
        resolve(true);
      };
      timer = setTimeout(() => {
        const i = this.waiters.indexOf(wake);
        if (i >= 0) this.waiters.splice(i, 1);
        resolve(false);
      }, QUEUE_WAIT_MS);
      this.waiters.push(wake);
    });
    if (got) this.inFlight++;
    return got;
  }

  private release(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
    this.waiters.shift()?.();
  }
}
