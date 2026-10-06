import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { isIP } from 'node:net';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { gunzipSync, inflateSync, brotliDecompressSync } from 'node:zlib';

/**
 * Fetch a public website and distil it into a compact, UNTRUSTED reference the
 * codegen can use to CLONE the site (layout, sections, copy, colours, images).
 *
 * Security (hardened after adversarial review):
 *  - SSRF-guarded by IP, not hostname: every address the connection resolves to
 *    is validated at ACTUAL connect time via a custom dns `lookup` — this closes
 *    the DNS-rebinding TOCTOU (validate-then-fetch resolving twice).
 *  - isPrivateIp normalizes IPv4-mapped IPv6 (::ffff:), NAT64 (64:ff9b::), 6to4
 *    (2002::) and covers loopback/private/link-local/CGNAT/benchmark/multicast.
 *  - Redirects followed manually, each hop re-validated (protocol + IP).
 *  - Body read is STREAM-capped (MAX_HTML_BYTES) and decompression is bounded
 *    (anti zip-bomb); one overall wall-clock deadline across all hops.
 *  - Distilled text has the prompt-fence delimiter tokens neutralised; the caller
 *    additionally frames it as untrusted and tells the model to ignore embedded
 *    instructions (defence in depth against prompt injection).
 */

const MAX_HTML_BYTES = 1_500_000; // cap on bytes pulled off the wire (compressed)
const MAX_DECOMPRESSED = 4_000_000; // cap on decompressed HTML (anti zip-bomb)
/** Phản hồi API của trang gốc: chỉ cần vài bản ghi mẫu, không cần cả kho dữ liệu. */
const MAX_JSON_BYTES = 400_000;
const MAX_REF_CHARS = 12_000;
/** Ngân sách chữ cho MỖI trang phụ — nhỏ hơn trang chủ vì chỉ cần đủ dựng lại trang đó. */
const MAX_SUB_REF_CHARS = 3_500;
/** Số trang phụ tối đa đi theo (chưa kể trang chủ). */
const MAX_SUB_PAGES = 7;
/** Số trang CHI TIẾT lấy mẫu từ một danh sách (sản phẩm / bài viết). */
const MAX_SAMPLE_ITEMS = 3;
/** Hạn chót cho cả lượt đi nhiều trang. Dài hơn OVERALL_MS vì phải tải nhiều trang. */
const CRAWL_MS = 55_000;
/** Số trang tải song song. Vừa đủ nhanh mà không dội vào máy chủ người ta. */
const CRAWL_CONCURRENCY = 3;
const PER_HOP_MS = 12_000;
const OVERALL_MS = 25_000;
const MAX_HOPS = 5;

// ── IP classification ──────────────────────────────────────────────────────

function isPrivateV4(ip: string): boolean {
  const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return true; // unparseable → treat as unsafe
  const a = +m[1];
  const b = +m[2];
  const c = +m[3];
  const d = +m[4];
  if ([a, b, c, d].some((x) => x > 255)) return true;
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 IETF
  if (a === 192 && b === 168) return true; // private
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmark 198.18/15
  if (a === 255) return true; // broadcast
  if (a >= 224) return true; // multicast / reserved (224-255)
  return false;
}

function v4FromHextets(hi: number, lo: number): string {
  return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
}

export function isPrivateIp(ip: string): boolean {
  let addr = (ip || '').toLowerCase().trim();
  const pct = addr.indexOf('%'); // strip zone id (fe80::1%eth0)
  if (pct >= 0) addr = addr.slice(0, pct);
  if (!addr) return true;

  // IPv4-mapped / -compatible IPv6 with dotted tail: ::ffff:a.b.c.d / ::a.b.c.d
  const dotted = addr.match(/^::(?:ffff:0*:?)?(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return isPrivateV4(dotted[1]);
  // IPv4-mapped IPv6 with hex tail: ::ffff:7f00:1
  const hexMapped = addr.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped) return isPrivateV4(v4FromHextets(parseInt(hexMapped[1], 16), parseInt(hexMapped[2], 16)));
  // NAT64 well-known prefix 64:ff9b::/96 → embedded v4
  if (addr.startsWith('64:ff9b:') || addr.startsWith('64:ff9b::')) {
    const dot = addr.match(/(\d+\.\d+\.\d+\.\d+)$/);
    if (dot) return isPrivateV4(dot[1]);
    const hx = addr.match(/:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hx) return isPrivateV4(v4FromHextets(parseInt(hx[1], 16), parseInt(hx[2], 16)));
    return true;
  }
  // 6to4 2002:V4V4:V4V4::/16 → embedded v4 is the next 32 bits
  if (addr.startsWith('2002:')) {
    const parts = addr.split(':');
    if (parts.length >= 3 && parts[1] && parts[2])
      return isPrivateV4(v4FromHextets(parseInt(parts[1], 16) || 0, parseInt(parts[2], 16) || 0));
    return true;
  }

  if (isIP(addr) === 4) return isPrivateV4(addr);

  // Plain IPv6
  if (addr === '::' || addr === '::1') return true; // unspecified / loopback
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true; // ULA fc00::/7
  if (addr.startsWith('fe8') || addr.startsWith('fe9') || addr.startsWith('fea') || addr.startsWith('feb'))
    return true; // link-local fe80::/10
  if (addr.startsWith('ff')) return true; // multicast ff00::/8
  // Public IPv6 (global unicast 2000::/3 minus the above) is allowed.
  return false;
}

export async function isSafeUrl(raw: string): Promise<boolean> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (isIP(host)) return !isPrivateIp(host); // literal IP: validate directly
  // hostname: every resolved address must be public
  let ips: LookupAddress[];
  try {
    ips = await new Promise<LookupAddress[]>((res, rej) =>
      dnsLookup(host, { all: true }, (e, a) => (e ? rej(e) : res(a))),
    );
  } catch {
    return false;
  }
  return ips.length > 0 && ips.every((a) => !isPrivateIp(a.address));
}

// ── safe fetch (connect-time IP pinning, no TOCTOU) ──────────────────────────

/** dns.lookup-compatible resolver that BLOCKS the connection if any resolved
 *  address is private — runs at the moment the socket is opened. */
function guardedLookup(
  hostname: string,
  options: unknown,
  // Node calls this either as (err, address, family) or — when it requests
  // `all: true` for Happy-Eyeballs — as (err, addresses[]). Support both.
  callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
): void {
  dnsLookup(hostname, { all: true }, (err, addresses) => {
    if (err) return callback(err, '', 0);
    if (!addresses.length) return callback(Object.assign(new Error('NO_ADDR'), { code: 'ENOTFOUND' }), '', 0);
    for (const a of addresses)
      if (isPrivateIp(a.address))
        return callback(Object.assign(new Error('blocked private address'), { code: 'EBLOCKED' }), '', 0);
    const wantsAll = !!(options && typeof options === 'object' && (options as { all?: boolean }).all);
    if (wantsAll) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
}

function decompress(buf: Buffer, encoding: string | undefined): string {
  const enc = (encoding || '').toLowerCase();
  try {
    if (enc.includes('br')) return brotliDecompressSync(buf, { maxOutputLength: MAX_DECOMPRESSED }).toString('utf8');
    if (enc.includes('gzip')) return gunzipSync(buf, { maxOutputLength: MAX_DECOMPRESSED }).toString('utf8');
    if (enc.includes('deflate')) return inflateSync(buf, { maxOutputLength: MAX_DECOMPRESSED }).toString('utf8');
  } catch {
    return ''; // bad/oversized stream → treat as empty
  }
  return buf.toString('utf8');
}

interface FetchResult {
  status: number;
  location?: string;
  contentType: string;
  html?: string;
}

/** One GET, manual redirect (no follow), IP-pinned, body stream-capped. */
/**
 * Một lần gọi HTTP có canh IP lúc kết nối.
 *
 * `wantJson` mở cho phản hồi JSON đi qua — mặc định hàm này VỨT BỎ mọi thân không phải HTML, nên
 * nếu không có cờ này thì mọi endpoint API của trang gốc đều trả về rỗng mà không báo gì.
 */
function fetchOnce(target: string, deadline: number, wantJson = false): Promise<FetchResult> {
  return new Promise<FetchResult>((resolve, reject) => {
    let u: URL;
    try {
      u = new URL(target);
    } catch {
      return reject(new Error('bad url'));
    }
    const mod = u.protocol === 'https:' ? httpsRequest : httpRequest;
    const timeLeft = Math.max(1000, Math.min(PER_HOP_MS, deadline - Date.now()));
    const req = mod(
      u,
      {
        method: 'GET',
        lookup: guardedLookup, // ← validates the real connect IP
        headers: {
          'User-Agent': 'LarkwaveCloneBot/1.0 (+https://toolswave.net)',
          Accept: wantJson ? 'application/json,*/*' : 'text/html,application/xhtml+xml,*/*',
          'Accept-Encoding': 'gzip, deflate, br',
        },
        timeout: timeLeft,
      },
      (res: IncomingMessage) => {
        const status = res.statusCode || 0;
        const contentType = String(res.headers['content-type'] || '').toLowerCase();
        if (status >= 300 && status < 400) {
          res.resume(); // drain
          return resolve({ status, location: res.headers.location, contentType });
        }
        const cap = wantJson ? MAX_JSON_BYTES : MAX_HTML_BYTES;
        const clen = Number(res.headers['content-length'] || 0);
        if (clen && clen > cap) {
          req.destroy();
          return resolve({ status, contentType }); // too big → no body
        }
        const wanted = wantJson ? /json/.test(contentType) : contentType.includes('text/html');
        if (status === 200 && !wanted) {
          req.destroy();
          return resolve({ status, contentType }); // wrong type → skip body
        }
        const chunks: Buffer[] = [];
        let total = 0;
        res.on('data', (c: Buffer) => {
          total += c.length;
          if (total <= cap) chunks.push(c);
          else {
            res.destroy();
            req.destroy();
          }
        });
        res.on('end', () =>
          resolve({
            status,
            contentType,
            html: decompress(Buffer.concat(chunks), res.headers['content-encoding']),
          }),
        );
        res.on('close', () =>
          resolve({
            status,
            contentType,
            html: decompress(Buffer.concat(chunks), res.headers['content-encoding']),
          }),
        );
        res.on('error', () => reject(new Error('stream error')));
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => reject(e));
    req.end();
  });
}

// ── HTML distillation ────────────────────────────────────────────────────────

function strip(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Neutralise the prompt-fence delimiter grammar so a cloned page cannot forge
 *  a boundary / smuggle instructions out of the untrusted block. */
function defang(s: string): string {
  return (
    s
      // Strip zero-width / bidi / soft-hyphen chars an attacker can splice INTO the
      // fence words to slip past the matchers below.
      .replace(/[­​-‏‪-‮⁠﻿]/g, '')
      // Collapse any run of dashes/underscores/box-drawing (the fence uses "---"),
      // incl. en/em dashes so a page can't forge a closing boundary with "–––".
      .replace(/[-–—_=*~·•▬─-╿]{2,}/g, ' ')
      // Diacritic/spacing-insensitive neutralise of the Vietnamese fence words.
      // Verified bypasses this now catches: "HET TRANG NGUON", circumflex "NGUÔN".
      .replace(/(B\p{L}*T\s*\p{L}*U|H\p{L}*T)\s*TRANG\s*NGU\p{L}*N/giu, 'trang-nguon')
      // Any-language end/begin-of-source markers a payload might use to fake a boundary.
      .replace(/\b(END|BEGIN|START)\s+(OF\s+)?(SOURCE|REFERENCE|PAGE|SITE|DATA|UNTRUSTED)\b/gi, 'noi-dung')
      .replace(/[\[\]]/g, ' ')
  );
}

function absUrl(src: string, base: string): string {
  try {
    return new URL(src, base).href;
  } catch {
    return '';
  }
}

function distil(html: string, baseUrl: string): string {
  const pick = (re: RegExp) => (html.match(re)?.[1] || '').trim();
  const title = strip(pick(/<title[^>]*>([\s\S]*?)<\/title>/i));
  const desc = pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i);
  const ogImg = pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i);

  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  const headings = [...body.matchAll(/<(h[1-3])[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((m) => `${m[1].toUpperCase()}: ${strip(m[2])}`)
    .filter((t) => t.length > 4)
    .slice(0, 40);
  const links = [
    ...new Set(
      [...body.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => strip(m[1])).filter((t) => t && t.length < 36),
    ),
  ].slice(0, 30);
  const imgs = [
    ...new Set(
      [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)]
        .map((m) => absUrl(m[1], baseUrl))
        .filter((u) => u && /^https?:/.test(u) && !u.startsWith('data:')),
    ),
  ].slice(0, 24);
  const colors = [...new Set(html.match(/#[0-9a-fA-F]{6}\b/g) || [])].slice(0, 14);
  const text = strip(body).slice(0, 6000);

  const out = [
    `TIÊU ĐỀ: ${title}`,
    desc && `MÔ TẢ: ${desc}`,
    headings.length && `CÁC TIÊU ĐỀ THEO THỨ TỰ:\n${headings.join('\n')}`,
    links.length && `MENU / NÚT: ${links.join(' · ')}`,
    colors.length && `MÀU HAY DÙNG: ${colors.join(' ')}`,
    (ogImg || imgs.length) &&
      `ẢNH (URL tuyệt đối — DÙNG LẠI trong app):\n${[ogImg, ...imgs].filter(Boolean).slice(0, 24).join('\n')}`,
    `NỘI DUNG TRANG (rút gọn):\n${text}`,
  ]
    .filter(Boolean)
    .join('\n\n');
  return defang(out).slice(0, MAX_REF_CHARS);
}

/** Một trang đã lấy được, kèm vai trò của nó trong bản sao. */
export interface ClonedPage {
  url: string;
  /** Đường dẫn để đặt route trong app sinh ra, vd "/", "/lien-he". */
  path: string;
  title: string;
  reference: string;
  kind: 'home' | 'page' | 'item';
  /** Với trang chi tiết: đường dẫn trang danh sách đẻ ra nó. */
  listPath?: string;
}

const SKIP_EXT = /\.(pdf|zip|rar|docx?|xlsx?|pptx?|csv|jpe?g|png|gif|webp|svg|ico|mp4|mp3|avi|dmg|exe|apk)$/i;
const SKIP_PATH =
  /(^\/(wp-admin|wp-login|admin|login|signin|signup|register|cart|checkout|gio-hang|thanh-toan|dang-nhap|dang-ky)\b)|(\/feed\/?$)|(\/rss)/i;

/** Bỏ mọi thứ khiến hai địa chỉ cùng một trang trông như hai trang khác nhau. */
function canonPath(u: URL): string {
  let path = u.pathname.replace(/\/+$/, '') || '/';
  if (/^\/index\.(html?|php)$/i.test(path)) path = '/';
  return path;
}

/**
 * Liên kết NỘI BỘ trong trang, đã xếp hạng.
 *
 * `distil` chỉ giữ CHỮ của các liên kết mà vứt hết `href`, nên trước đây model biết tên mục menu
 * nhưng không biết trang nào có thật — và bản sao dừng lại ở mỗi trang chủ. Ở đây giữ cả địa chỉ,
 * và ưu tiên liên kết nằm trong <nav>/<header>: đó chính là những trang chủ site muốn người ta vào.
 */
function internalLinks(html: string, baseUrl: string): { url: string; path: string; text: string; nav: boolean }[] {
  let origin: string;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return [];
  }
  // Vùng điều hướng: <nav> và <header>. Liên kết trong đó được ưu tiên.
  const navHtml = [...html.matchAll(/<(nav|header)[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => m[2]).join(' ');
  const navHrefs = new Set(
    [...navHtml.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)].map((m) => absUrl(m[1], baseUrl)).filter(Boolean),
  );

  const seen = new Map<string, { url: string; path: string; text: string; nav: boolean }>();
  for (const m of html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const raw = m[1];
    if (/^(mailto:|tel:|javascript:|#|data:)/i.test(raw.trim())) continue;
    const abs = absUrl(raw, baseUrl);
    if (!abs) continue;
    let u: URL;
    try {
      u = new URL(abs);
    } catch {
      continue;
    }
    if (u.origin !== origin) continue; // chỉ đi trong cùng một site
    if (SKIP_EXT.test(u.pathname) || SKIP_PATH.test(u.pathname)) continue;
    const path = canonPath(u);
    if (path === '/') continue; // trang chủ đã có rồi
    if (path.split('/').length > 5) continue; // quá sâu, thường là trang rác
    const text = strip(m[2]).slice(0, 60);
    const nav = navHrefs.has(abs);
    const prev = seen.get(path);
    // Cùng một trang xuất hiện nhiều nơi: giữ bản có chữ và bản nằm trong nav.
    if (!prev) seen.set(path, { url: `${u.origin}${path}${u.search}`, path, text, nav });
    else if ((!prev.text && text) || (nav && !prev.nav)) seen.set(path, { ...prev, text: prev.text || text, nav: prev.nav || nav });
  }

  return [...seen.values()].sort((a, b) => {
    if (a.nav !== b.nav) return a.nav ? -1 : 1; // trang trong menu trước
    const da = a.path.split('/').length;
    const db = b.path.split('/').length;
    if (da !== db) return da - db; // nông trước sâu
    return a.path.localeCompare(b.path);
  });
}

/**
 * Gom các liên kết cùng một "họ" đường dẫn (vd /san-pham/a, /san-pham/b, /san-pham/c).
 *
 * Ba anh em trở lên thì gần như chắc chắn đó là danh sách sản phẩm / bài viết. Ta chỉ lấy MẪU vài
 * cái: đủ để app sinh ra có dữ liệu thật để hiển thị tĩnh, mà không phải bò hết cả site.
 */
function listingGroups(links: { path: string }[]): Map<string, string[]> {
  const byParent = new Map<string, string[]>();
  for (const l of links) {
    const parts = l.path.split('/').filter(Boolean);
    if (parts.length < 2) continue;
    const parent = '/' + parts.slice(0, -1).join('/');
    byParent.set(parent, [...(byParent.get(parent) ?? []), l.path]);
  }
  const out = new Map<string, string[]>();
  for (const [parent, children] of byParent) if (children.length >= 3) out.set(parent, children);
  return out;
}

/** Tải + rút gọn MỘT trang. Trả null khi trang hỏng — một trang lỗi không được làm hỏng cả lượt. */
async function fetchOnePage(
  target: string,
  deadline: number,
  maxChars: number,
): Promise<{ url: string; title: string; reference: string; html: string } | null> {
  let current = target;
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    if (Date.now() > deadline) return null;
    if (!(await isSafeUrl(current))) return null;
    let res: FetchResult;
    try {
      res = await fetchOnce(current, deadline);
    } catch {
      return null;
    }
    if (res.status >= 300 && res.status < 400) {
      if (!res.location) return null;
      current = absUrl(res.location, current) || res.location;
      continue;
    }
    if (res.status !== 200 || !res.contentType.includes('text/html') || !res.html) return null;
    const title = strip((res.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim());
    const reference = distil(res.html, current).slice(0, maxChars);
    if (!reference || reference.length < 40) return null;
    return { url: current, title, reference, html: res.html };
  }
  return null;
}

/**
 * Gọi MỘT endpoint JSON của trang gốc, đi qua đúng bộ rào an toàn như khi tải HTML
 * (isSafeUrl trước + canh IP thật lúc kết nối + hạn chót + trần dung lượng).
 *
 * Trả `null` cho MỌI ca hỏng (404, không phải JSON, JSON vỡ, quá giờ) — nơi gọi chỉ cần biết
 * "có đọc được không", và một endpoint không tồn tại là chuyện bình thường chứ không phải lỗi.
 */
export async function fetchJsonGuarded(target: string, deadline: number): Promise<unknown | null> {
  let current = target;
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    if (Date.now() > deadline) return null;
    if (!(await isSafeUrl(current))) return null;
    let res: FetchResult;
    try {
      res = await fetchOnce(current, deadline, true);
    } catch {
      return null;
    }
    if (res.status >= 300 && res.status < 400) {
      if (!res.location) return null;
      current = absUrl(res.location, current) || res.location;
      continue;
    }
    if (res.status !== 200 || !res.html) return null;
    try {
      return JSON.parse(res.html) as unknown;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Làm cùn nội dung lấy từ trang lạ trước khi đưa vào prompt. Xuất ra để phần dò API dùng chung
 * MỘT bộ luật với phần chưng cất HTML — hai bộ luật rồi trôi khác nhau là chỗ chèn prompt lọt.
 */
export function defangExternal(s: string): string {
  return defang(s);
}

/** Chạy các việc theo lô, tối đa `limit` việc cùng lúc. */
async function pooled<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    out.push(...(await Promise.all(items.slice(i, i + limit).map(fn))));
  }
  return out;
}

/**
 * Sao chép NHIỀU TRANG của một website, không chỉ trang chủ.
 *
 * Vì sao cần: `fetchSiteReference` chỉ tải đúng địa chỉ được đưa, nên bản sao luôn chỉ có trang
 * chủ — người dùng nhận về một site cụt. Ở đây ta đọc menu của trang chủ, đi theo các trang chính,
 * và với những danh sách (sản phẩm / bài viết) thì lấy mẫu vài trang chi tiết để app sinh ra có
 * DỮ LIỆU THẬT hiển thị tĩnh thay vì chỗ trống.
 *
 * Vẫn giữ nguyên mọi rào an toàn của bản một trang: mỗi địa chỉ đều qua `isSafeUrl` + kiểm IP lúc
 * kết nối, chỉ đi trong cùng origin, có hạn chót chung, và nội dung vẫn được defang.
 */
export async function fetchSiteBundle(
  rawUrl: string,
): Promise<{ ok: boolean; pages?: ClonedPage[]; reason?: string; homeHtml?: string }> {
  const deadline = Date.now() + CRAWL_MS;
  const home = await fetchOnePage(rawUrl, deadline, MAX_REF_CHARS).catch(() => null);
  if (!home) {
    // Rơi về đường cũ để giữ nguyên thông báo lỗi cụ thể (bị chặn / timeout / không phải HTML…).
    const single = await fetchSiteReference(rawUrl);
    if (!single.ok) return { ok: false, reason: single.reason };
    return {
      ok: true,
      pages: [{ url: rawUrl, path: '/', title: '', reference: single.reference!, kind: 'home' }],
    };
  }

  const pages: ClonedPage[] = [
    { url: home.url, path: '/', title: home.title, reference: home.reference, kind: 'home' },
  ];

  const links = internalLinks(home.html, home.url);
  if (links.length) {
    const groups = listingGroups(links);
    // Trang chính: ưu tiên menu, và với mỗi "họ" danh sách chỉ lấy trang CHA vào nhóm này —
    // các trang con để dành cho phần lấy mẫu bên dưới.
    const childPaths = new Set([...groups.values()].flat());
    const main = links.filter((l) => !childPaths.has(l.path)).slice(0, MAX_SUB_PAGES);

    const fetched = await pooled(main, CRAWL_CONCURRENCY, (l) =>
      fetchOnePage(l.url, deadline, MAX_SUB_REF_CHARS).catch(() => null),
    );
    fetched.forEach((r, i) => {
      if (r) pages.push({ url: r.url, path: main[i]!.path, title: r.title, reference: r.reference, kind: 'page' });
    });

    // Lấy mẫu trang chi tiết của danh sách LỚN NHẤT — đủ để có dữ liệu thật, không bò cả site.
    const biggest = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    if (biggest && Date.now() < deadline) {
      const [listPath, children] = biggest;
      const origin = new URL(home.url).origin;
      const sample = children.slice(0, MAX_SAMPLE_ITEMS);
      const items = await pooled(sample, CRAWL_CONCURRENCY, (path) =>
        fetchOnePage(`${origin}${path}`, deadline, MAX_SUB_REF_CHARS).catch(() => null),
      );
      items.forEach((r, i) => {
        if (r) pages.push({ url: r.url, path: sample[i]!, title: r.title, reference: r.reference, kind: 'item', listPath });
      });
    }
  }

  // `homeHtml` đi kèm để phần dò API (site-api.ts) đọc lại khối JSON nhúng sẵn trong trang
  // chủ mà KHÔNG phải tải lại trang — và để hai bên không có hai bản HTML lệch nhau.
  return { ok: true, pages, homeHtml: home.html };
}

export async function fetchSiteReference(
  rawUrl: string,
): Promise<{ ok: boolean; reference?: string; reason?: string }> {
  let current = rawUrl;
  const deadline = Date.now() + OVERALL_MS;
  try {
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      if (Date.now() > deadline) return { ok: false, reason: 'Quá thời gian tải trang.' };
      // Pre-check protocol/hostname; the connect-time guardedLookup is authoritative for IPs.
      if (!(await isSafeUrl(current)))
        return { ok: false, reason: 'URL không hợp lệ hoặc trỏ tới địa chỉ nội bộ (bị chặn).' };
      let res: FetchResult;
      try {
        res = await fetchOnce(current, deadline);
      } catch (e) {
        const code = (e as NodeJS.ErrnoException)?.code;
        if (code === 'EBLOCKED')
          return { ok: false, reason: 'Trang nguồn trỏ tới địa chỉ nội bộ (bị chặn).' };
        return { ok: false, reason: 'Không tải được trang nguồn (timeout hoặc bị chặn).' };
      }
      if (res.status >= 300 && res.status < 400) {
        if (!res.location) return { ok: false, reason: `Chuyển hướng ${res.status} không có địa chỉ.` };
        current = absUrl(res.location, current) || res.location; // re-validated next loop
        continue;
      }
      if (res.status !== 200) return { ok: false, reason: `Trang nguồn trả về ${res.status}.` };
      if (!res.contentType.includes('text/html'))
        return { ok: false, reason: 'Liên kết không phải trang HTML.' };
      if (!res.html) return { ok: false, reason: 'Không đọc được nội dung trang.' };
      const reference = distil(res.html, current);
      if (!reference || reference.length < 40)
        return { ok: false, reason: 'Không trích xuất được nội dung.' };
      return { ok: true, reference };
    }
    return { ok: false, reason: 'Quá nhiều lần chuyển hướng.' };
  } catch {
    return { ok: false, reason: 'Không tải được trang nguồn.' };
  }
}
