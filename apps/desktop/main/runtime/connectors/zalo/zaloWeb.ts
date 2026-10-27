/**
 * Cửa sổ Zalo Web nhúng trong Larkwave — mở chat.zalo.me CHÍNH THỨC bằng chính phiên của người dùng.
 *
 * Vì sao có (17/10/2026): để trợ lý đọc được tin CŨ (nhất là chat 1-1), app cần thấy lịch sử mà chỉ Zalo Web
 * dựng ra sau khi điện thoại "đồng bộ tin nhắn". Thay vì bẻ khoá tệp đồng bộ, ta mở thẳng trang Zalo Web:
 *   - người dùng ĐĂNG NHẬP NGAY TRONG CỬA SỔ NÀY (quét QR) và (nếu điện thoại hỏi) bấm Đồng ý đồng bộ;
 *   - Larkwave chỉ ĐỌC NỘI DUNG ĐANG HIỂN THỊ trên trang (innerText vùng tin). Không mò mẫm, không giải mã.
 *
 * ĐĂNG NHẬP là RIÊNG của cửa sổ này (partition persist:zalo-web), KHÁC phiên zca (quét QR ở sidebar). Đăng nhập
 * một lần thì partition giữ lại, mở app lần sau vẫn còn. `seedCookies` cố nhét cookie của phiên zca vào để khỏi
 * quét QR lại, nhưng CHỈ khi cửa sổ chưa có phiên — không bao giờ đè lên lần đăng nhập người dùng đã làm.
 *
 * BÀI HỌC 17/10/2026 (bản 0.1.7 đầu): đọc `getURL()` NGAY sau loadURL là sai — chat.zalo.me khi chưa đăng nhập
 * mới CHUYỂN HƯỚNG sang id.zalo.me/login sau đó, nên báo "đã đăng nhập" nhầm rồi "chưa đăng nhập". Nay theo dõi
 * điều hướng (`did-navigate`…) + chờ trang ỔN ĐỊNH (settle) rồi mới kết luận.
 */
import { BrowserWindow, session as electronSession } from 'electron';
import { hiddenMode } from '../../../hiddenMode';
import type { ZaloWebCookie } from './session';

const ZALO_WEB_URL = 'https://chat.zalo.me/';
const PARTITION = 'persist:zalo-web';
export const ZALO_WEB_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';

/** Đã ĐĂNG NHẬP khi URL đã ổn định ở chat.zalo.me (KHÔNG phải trang login). Chưa: host id.zalo.me, hoặc /login, /qr. */
function urlLoggedIn(url: string): boolean | undefined {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  if (/(^|\.)id\.zalo\.me$/i.test(u.hostname)) return false;
  if (/(^|\.)chat\.zalo\.me$/i.test(u.hostname)) return !/\/(login|qr|account|passport)/i.test(u.pathname);
  return undefined; // about:blank / đang tải
}

export interface ZaloWebStatus {
  /** Cửa sổ đã được tạo chưa. */
  exists: boolean;
  visible: boolean;
  /** true/false sau khi trang ổn định; undefined = chưa rõ (đang tải). */
  loggedIn?: boolean;
  url?: string;
  title?: string;
  /** Lần cuối đọc được nội dung (ms). */
  lastReadAt?: number;
  /** Trang đăng nhập kẹt không ra mã QR dù đã tự tải lại — câu báo kèm lý do (xem LOGIN_PAGE_SCAN). */
  loginStuck?: string;
}

export interface ZaloWebRead {
  /** Ngày CŨ NHẤT Zalo Web chịu nạp (Zalo tự ghi trong khung hội thoại). Cũ hơn mốc này chỉ Zalo PC mới có. */
  limitDate?: string;
  title: string;
  /** Nội dung chữ của hội thoại đang mở (đã cuộn lên để tải thêm lịch sử). */
  text: string;
  /** Đã cắt bớt vì quá dài. */
  truncated: boolean;
  /** Không mở hội thoại nào / không thấy vùng tin. */
  empty: boolean;
  /** Đã dò vùng tin bằng cách nào + đo được gì — để chẩn đoán khi đọc ra rỗng. */
  diag?: { how: string; tag: string; cls: string; bodyLen: number; areaLen: number; scrolled: number; reachedTop?: boolean; oldestSeen?: string };
}

const MAX_TEXT = 200_000;

/**
 * Lái cửa sổ (chạy trong trang). Đọc innerText vùng tin lớn nhất, cuộn lên `scrolls` lần để Zalo tải thêm
 * lịch sử. THUẦN chuỗi (chạy qua executeJavaScript) nên không phụ thuộc tên lớp CSS hay thay đổi của Zalo.
 */
/**
 * Tìm KHUNG TIN NHẮN trong trang. Dùng lại cho mọi script ngắn bên dưới.
 *
 * Dò theo `elementFromPoint` giữa khung chat rồi leo tổ tiên cuộn được (chắc nhất); dự phòng quét toàn
 * trang; cùng lắm trả cả trang. KHÔNG dựa vào `overflowY` của CSS — Zalo Web không khớp (bài học 18/10/2026).
 */
const AREA_FN = `function __lwArea() {
  const canScroll = (el) => el && el.scrollHeight > el.clientHeight + 24 && el.clientHeight > 120;
  let a = null;
  let n = document.elementFromPoint(Math.round(innerWidth * 0.68), Math.round(innerHeight * 0.5));
  while (n && n !== document.body) { if (canScroll(n)) { a = n; break; } n = n.parentElement; }
  if (!a) {
    let best = null, bs = 0;
    for (const el of document.querySelectorAll('div,section,main,ul')) {
      if (!canScroll(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 240 || r.height < 160) continue;
      const sc = (el.scrollHeight - el.clientHeight) * (r.left > innerWidth * 0.25 ? 2 : 1);
      if (sc > bs) { bs = sc; best = el; }
    }
    a = best;
  }
  return a || document.scrollingElement || document.body;
}`;

/**
 * MỘT ĐỢT cuộn ngắn (vài lần) rồi trả về trạng thái. Vòng lặp nằm ở PHÍA APP, không phải trong trang.
 *
 * BÀI HỌC 18/10/2026: bản trước cuộn cả trăm vòng TRONG MỘT script và đọc `innerText` (ép tính lại bố cục
 * cả hội thoại) mỗi vòng ⇒ chạy vài phút, trang nặng, Electron trả "Script failed to execute" và chết trước
 * khi kịp cuộn tới nơi. Nay mỗi lần gọi chỉ cuộn `n` lần và đọc `textContent` (rẻ, không ép bố cục) phần đầu
 * khung để dò vạch ngày.
 */
function scrollStepScript(n: number): string {
  return `(async () => {
    ${AREA_FN}
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const a = __lwArea();
    for (let i = 0; i < ${Math.max(1, Math.min(n, 12))}; i++) {
      try { a.scrollTop = 0; } catch (e) {}
      try { a.dispatchEvent(new WheelEvent('wheel', { deltaY: -2000, bubbles: true })); } catch (e) {}
      await sleep(900);
    }
    const head = (a.textContent || '').slice(0, 8000);
    return { h: a.scrollHeight, top: a.scrollTop, head, len: (a.textContent || '').length };
  })()`;
}

/**
 * Lấy nội dung + chẩn đoán (chạy MỘT lần, sau khi đã cuộn xong).
 *
 * BÀI HỌC 18/10/2026 (lỗi cuối của chuỗi này): bản trước gọi `area.innerText`. Sau khi cuộn tới đầu một nhóm
 * cả tháng, `innerText` ÉP TÍNH LẠI BỐ CỤC của hàng chục nghìn tin ⇒ quá nặng, Electron trả "Script failed to
 * execute" ở TẦNG NGOÀI (không vào nổi try trong trang). Phần cuộn vẫn chạy ngon ⇒ triệu chứng "cuộn tới nơi
 * rồi mà đọc ra rỗng". Nay duyệt TỪNG HÀNG con và lấy `textContent` (không ép bố cục), cộng dồn tới trần.
 */
function extractScript(maxText: number): string {
  return `(() => {
    ${AREA_FN}
    const a = __lwArea();
    const MAX = ${maxText};
    // Tìm danh sách HÀNG tin: đi sâu qua các lớp bọc chỉ có đúng một con.
    let list = a.children && a.children.length ? a.children : [a];
    for (let d = 0; d < 4 && list.length === 1 && list[0].children && list[0].children.length > 1; d++) list = list[0].children;
    const parts = [];
    let len = 0, truncated = false, rows = 0;
    const cap = Math.min(list.length, 30000);
    for (let i = 0; i < cap; i++) {
      const t = (list[i].textContent || '').trim();
      if (!t) continue;
      rows++;
      if (len + t.length > MAX) { truncated = true; break; }
      parts.push(t);
      len += t.length + 1;
    }
    let text = parts.join('\\n').replace(/\\n{3,}/g, '\\n\\n').trim();
    const areaLen = text.length;
    let how = 'rows';
    if (text.length < 20) {
      text = (a.textContent || '').slice(0, MAX).trim();
      how = 'areaText';
      if (text.length < 20) { text = (document.body ? document.body.textContent || '' : '').slice(0, MAX).trim(); how = 'bodyText'; }
    }
    let title = '';
    const h1 = document.querySelector('[class*="header"] [class*="name"], [class*="conv"] [class*="title"], header h1, header h2');
    if (h1 && h1.textContent) title = h1.textContent.trim().slice(0, 120);
    if (!title) {
      const top = document.elementFromPoint(Math.round(innerWidth * 0.68), 40);
      if (top && top.textContent) title = top.textContent.trim().slice(0, 120);
    }
    try { a.scrollTop = a.scrollHeight; } catch (e) {}
    const lim = (text.match(/tìm tin nhắn trước ngày\\s*([\\d./-]+)/i) || [])[1] || '';
    return { empty: !text, title, text, truncated, how, areaLen, bodyLen: rows, tag: (a.tagName || '').toLowerCase(), cls: String(a.className || '').slice(0, 80), limitDate: lim };
  })()`;
}

/** Ngày CŨ NHẤT thấy trong một đoạn chữ (vạch ngày của Zalo: "01/10/2026", "Thứ Hai, 01/10"). */
function oldestDate(text: string): { ts: number; label: string } {
  const now = new Date();
  let ts = Infinity;
  let label = '';
  // CHỈ nhận vạch ngày thật: dd/mm/yyyy, hoặc dd/mm với CẢ HAI là 2 chữ số. Một chuỗi như "3/4" lẫn trong
  // câu chữ KHÔNG tính (lỗi thật 18/10/2026: báo nhầm "ngày cũ nhất là 3/4").
  for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b|\b(\d{2})\/(\d{2})\b/g)) {
    const d = Number(m[1] ?? m[4]);
    const mo = Number(m[2] ?? m[5]);
    const yr = m[3];
    if (!d || !mo || d < 1 || d > 31 || mo < 1 || mo > 12) continue;
    const t = new Date(yr ? Number(yr) : now.getFullYear(), mo - 1, d).getTime();
    if (t < ts) {
      ts = t;
      label = m[0];
    }
  }
  return { ts, label };
}

/**
 * imei của Zalo Web = `<uuid>-<md5(userAgent)>` (zca sinh y khuôn này trong generateZaloUUID). Trang lưu nó
 * trong localStorage; KHÔNG dò theo tên khoá (Zalo đổi tên bất cứ lúc nào) mà dò theo ĐÚNG KHUÔN chuỗi —
 * khuôn này đặc trưng nên gần như không nhầm với giá trị khác.
 */
const IMEI_SCAN = `(() => {
  const RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[0-9a-f]{32}/i;
  const hits = []; const keys = [];
  const scan = (store) => {
    try {
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i); keys.push(k);
        const v = store.getItem(k) || '';
        const m = RE.exec(v);
        if (m) hits.push({ key: k, imei: m[0] });
      }
    } catch (e) { /* storage bị chặn */ }
  };
  try { scan(localStorage); } catch (e) { /* trang chặn localStorage */ }
  try { scan(sessionStorage); } catch (e) { /* trang chặn sessionStorage */ }
  return { hits, keys: keys.slice(0, 60) };
})()`;

/**
 * Trang đăng nhập (id.zalo.me) có KẸT không.
 *
 * BÀI HỌC 27/10/2026 (ảnh người dùng gửi): cửa sổ chỉ có logo Zalo + "Tiếng Việt / English", KHÔNG có mã QR, và
 * đứng yên mãi như thế. Đo lại trên Electron: trang đăng nhập chỉ dựng khung QR SAU KHI `POST /account/logininfo`
 * trả về; lời gọi đó hỏng hoặc treo (mạng chập chờn, máy chủ Zalo bận) là trang kẹt vĩnh viễn — Zalo không tự thử
 * lại, không báo lỗi. `qr/generate` hỏng cũng vậy: có khung nhưng ô QR rỗng.
 *
 * Dò theo CẤU TRÚC, không theo chữ (giao diện có thể là tiếng Anh): `blank` = không có ảnh/svg/nút nào và gần như
 * không có chữ (chỉ còn hai chữ chọn ngôn ngữ); `qrEmpty` = có ô `.qrcode` mà bên trong rỗng (QR thật là một svg
 * ~1600 phần tử). Zalo đổi giao diện ⇒ cả hai false ⇒ không làm gì, an toàn.
 */
const LOGIN_PAGE_SCAN = `(() => {
  const root = document.getElementById('app') || document.body;
  if (!root) return { blank: true, qrEmpty: false };
  const note = document.getElementById('larkwave-zalo-note');
  const len = (el) => (el && el.textContent || '').replace(/\\s+/g, '').length;
  const text = len(root) - (note && root.contains(note) ? len(note) : 0);
  const media = root.querySelectorAll('img,svg,canvas,input,button,iframe').length;
  const qr = root.querySelector('.qrcode');
  // KHÔNG xét chữ: ô QR luôn chứa sẵn "Mã QR hết hạn / Lấy mã mới" (ẩn) kể cả khi qr/generate hỏng (đo 27/10/2026).
  const qrEmpty = !!qr && !qr.querySelector('svg,img,canvas');
  return { blank: media === 0 && text < 40, qrEmpty };
})()`;

/**
 * Hỏi lại `logininfo` NGAY TRONG TRANG (cùng lời gọi trang tự làm) để câu báo nói ra lý do THẬT.
 *
 * BÀI HỌC 27/10/2026 (0.1.21 vẫn kẹt ở máy người dùng): trang kẹt y hệt ảnh cả khi logininfo trả HTTP 200 nhưng
 * `error_code` ≠ 0, hoặc trả HTML (proxy/tường lửa chèn trang) — webRequest chỉ thấy "HTTP 200", vô dụng.
 */
const LOGIN_INFO_PROBE = `(async () => {
  const s = document.querySelector('script[src*="/main-"]');
  const v = ((s && s.src.match(/main-(\\d+)/)) || [])[1] || '';
  const cont = new URLSearchParams(location.search).get('continue') || 'https://chat.zalo.me/';
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch('/account/logininfo', { method: 'POST', credentials: 'include', signal: ctl.signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'continue=' + encodeURIComponent(cont) + (v ? '&v=' + v : '') });
    const txt = await res.text();
    let j;
    try { j = JSON.parse(txt); } catch (e) { return { http: res.status, notJson: txt.replace(/\\s+/g, ' ').slice(0, 80) }; }
    return { http: res.status, code: j.error_code, msg: String(j.error_message || '').slice(0, 120) };
  } catch (e) {
    return { err: ctl.signal.aborted ? 'không trả lời sau 8 giây' : String((e && e.message) || e).slice(0, 120) };
  } finally { clearTimeout(t); }
})()`;

/** Dải báo của Larkwave chèn lên trang đăng nhập (người dùng nhìn thấy ngay trong cửa sổ). "Thử lại" = #larkwave-retry. */
const loginNoteScript = (msg: string, retry: boolean): string => `(() => {
  let b = document.getElementById('larkwave-zalo-note');
  if (!b) {
    b = document.createElement('div');
    b.id = 'larkwave-zalo-note';
    b.style.cssText = 'position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:2147483647;width:calc(100% - 32px);max-width:640px;box-sizing:border-box;padding:12px 16px;border-radius:8px;background:#fff7e6;border:1px solid #f5b041;color:#4a3000;font:14px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.12)';
    const m = document.createElement('div');
    m.className = 'lw-m';
    const a = document.createElement('a');
    a.className = 'lw-r';
    a.href = '#larkwave-retry';
    a.textContent = 'Thử lại';
    a.style.cssText = 'display:inline-block;margin-top:8px;font-weight:600;color:#0068ff';
    b.append(m, a);
    (document.body || document.documentElement).appendChild(b);
  }
  b.querySelector('.lw-m').textContent = ${JSON.stringify(msg)};
  b.querySelector('.lw-r').style.display = ${retry ? "''" : "'none'"};
  return true;
})()`;

/**
 * chat.zalo.me đã dựng xong ỨNG DỤNG: có ô tìm kiếm ở cột trái (chính ô `openChat` gõ vào, chạy được trên tài khoản
 * thật 18/10/2026). Trang chưa đăng nhập không có ô này trong mấy giây trước khi tự chuyển sang id.zalo.me.
 */
const APP_READY_SCAN = `(() => [...document.querySelectorAll('input[type="text"], input[type="search"], input:not([type]), [contenteditable="true"]')].some((el) => {
  const r = el.getBoundingClientRect();
  return r.width > 40 && r.height > 14 && r.left < innerWidth * 0.5;
}))()`;

/**
 * Dự phòng khi không dò được ô tìm (Zalo đổi giao diện): đứng yên ở chat.zalo.me chừng này mà không bị chuyển sang
 * trang đăng nhập thì coi là đã đăng nhập. Đo 27/10/2026: bộ đệm trống thì trang chưa đăng nhập đứng 6,6 giây rồi
 * mới chuyển.
 */
const CHAT_CONFIRM_MS = 12_000;

/**
 * Kẹt liền bao lâu thì tự cứu, và các bậc cứu theo thứ tự (hết bậc mà vẫn kẹt ⇒ báo người dùng):
 *   1. tải lại thường — mạng chập chờn một lần;
 *   2. XOÁ SẠCH dữ liệu của cửa sổ (cookie, storage, bộ đệm, cookie đã lưu) rồi nạp lại = như máy mới. Trên partition
 *      sạch trang đăng nhập luôn ra QR; còn máy người dùng có cookie cũ — nhất là cookie phiên zca mà `seedCookies`
 *      nhét vào (phiên zca gắn imei KHÁC) — là thứ duy nhất khác với máy thử. Chỉ tới đây khi đang ở trang đăng
 *      nhập ⇒ chưa đăng nhập ⇒ không mất gì;
 *   3. tải lại bỏ qua bộ đệm.
 */
const LOGIN_STUCK_MS = 10_000;
const LOGIN_STEPS = ['reload', 'reset', 'hard'] as const;

const onLoginPage = (url: string): boolean => {
  try {
    return /(^|\.)id\.zalo\.me$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
};

class ZaloWeb {
  private win: BrowserWindow | null = null;
  private seeded = false;
  private lastReadAt = 0;
  /** URL mới nhất sau mỗi lần điều hướng — để biết trang đã ổn định ở đâu (xem BÀI HỌC ở đầu tệp). */
  private navUrl = '';
  private lastNavAt = 0;
  /** Lưu/nạp cookie cửa sổ qua các lần tắt app (zaloService nối vào kho mã hoá). */
  private persist: { load: () => ZaloWebCookie[]; save: (c: ZaloWebCookie[]) => void; clear?: () => void } | null = null;
  private saveTimer: ReturnType<typeof setInterval> | null = null;
  private restored = false;
  /** Canh trang đăng nhập kẹt (xem LOGIN_PAGE_SCAN). */
  private loginTimer: ReturnType<typeof setInterval> | null = null;
  private loginChecking = false;
  private stuckSince = 0;
  private autoReloads = 0;
  /** Đã tự tải lại đủ số lần mà vẫn kẹt ⇒ câu báo; rỗng = không kẹt. Người dùng bấm Tải lại/Mở thì canh lại từ đầu. */
  private loginStuck = '';
  /** Kết quả gần nhất của logininfo / qr/generate — để câu báo nói ra lý do THẬT thay vì "không hiện QR". */
  private loginApi = new Map<string, { at: number; result?: string }>();
  private loginApiHooked = false;
  /** Request đang chờ (theo id) + lỗi mạng gần nhất theo host — "trang treo vì cái gì". */
  private inflight = new Map<number, { host: string; at: number }>();
  private netErrors = new Map<string, string>();
  /** Đã thấy ứng dụng chat.zalo.me dựng xong (APP_READY_SCAN) kể từ lần điều hướng gần nhất. */
  private appReady = false;
  /** Lúc trang vào chat.zalo.me (0 = không ở đó) — cho mốc dự phòng CHAT_CONFIRM_MS. */
  private chatSince = 0;

  /** Nối kho giữ cookie cửa sổ (mã hoá) — xem zaloStore.loadWebCookies/saveWebCookies/clearWebCookies. */
  setPersist(p: { load: () => ZaloWebCookie[]; save: (c: ZaloWebCookie[]) => void; clear?: () => void }): void {
    this.persist = p;
  }

  private alive(): boolean {
    return !!this.win && !this.win.isDestroyed();
  }

  /**
   * Chạy MỘT biểu thức JS trong trang và KHÔNG BAO GIỜ ném.
   *
   * BÀI HỌC 18/10/2026: chỉ cần script ném một lỗi bất kỳ (ví dụ trang chặn `localStorage`) là Electron trả
   * đúng một câu "Script failed to execute…" — không nói lỗi gì, ở đâu. Người dùng gặp bốn lượt liên tiếp mà
   * mình không có manh mối nào. Nay bọc try/catch NGAY TRONG trang: luôn trả `{ok,value}` hoặc `{ok:false,error}`
   * với câu lỗi THẬT, và nơi gọi tự quyết định đi tiếp hay dừng — một script hỏng không giết cả lượt.
   */
  private async runJs<T>(expr: string, now = false): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
    if (!this.alive()) return { ok: false, error: 'cửa sổ Zalo Web chưa mở' };
    const wrapped = `(async () => { try { return { __ok: true, v: await (${expr}) }; } catch (e) { return { __ok: false, e: String((e && e.message) || e).slice(0, 300) }; } })()`;
    try {
      // `now`: chạy NGAY trên khung chính. webContents.executeJavaScript của Electron CHỜ `did-stop-loading` khi trang
      // còn đang tải — còn một request treo (Google Analytics, font… — đo 27/10/2026) là chờ mãi.
      const wc = this.win!.webContents;
      const r = (await (now ? wc.mainFrame.executeJavaScript(wrapped, true) : wc.executeJavaScript(wrapped, true))) as { __ok?: boolean; v?: T; e?: string };
      if (r?.__ok) return { ok: true, value: r.v as T };
      return { ok: false, error: r?.e || 'script trả về rỗng' };
    } catch (e) {
      // Chỉ còn lại các ca ngoài tầm try trong trang: trang vừa điều hướng, context bị huỷ…
      return { ok: false, error: `không chạy được script trong trang (${String((e as Error)?.message || e).slice(0, 160)})` };
    }
  }

  /** Có cookie phiên Zalo trong partition chưa (đã từng đăng nhập ở cửa sổ này). */
  private async hasSession(): Promise<boolean> {
    try {
      const cs = await electronSession.fromPartition(PARTITION).cookies.get({ domain: 'zalo.me' });
      // `zpsid` / `zpw_sek` là cookie phiên Zalo đặt SAU khi đăng nhập (không có ở trang QR ẩn danh).
      return cs.some((c) => /^(zpsid|zpw_sek|zpw_enk|app\.login)/i.test(c.name) && c.value.length > 10);
    } catch {
      return false;
    }
  }

  /** Toàn bộ cookie Zalo trong partition, dạng lưu được (không có loggedIn requirement). */
  async dumpCookies(): Promise<ZaloWebCookie[]> {
    try {
      const cs = await electronSession.fromPartition(PARTITION).cookies.get({});
      return cs
        .filter((c) => /(^|\.)(zalo\.me|zadn\.vn|zdn\.vn|zaloapp\.com)$/i.test(c.domain || ''))
        .map((c) => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path || '/',
          secure: !!c.secure,
          httpOnly: !!c.httpOnly,
          ...(c.expirationDate ? { expirationDate: c.expirationDate } : {}),
        }));
    } catch {
      return [];
    }
  }

  /** Đặt một danh sách cookie vào partition (dùng cho cả nạp-lại-sau-khi-tắt-app lẫn seed từ zca). */
  private async applyCookies(cookies: ZaloWebCookie[]): Promise<void> {
    const ses = electronSession.fromPartition(PARTITION);
    for (const c of cookies) {
      const bare = c.domain?.replace(/^\./, '') || 'zalo.me';
      const url = `https://${bare}${c.path && c.path.startsWith('/') ? c.path : '/'}`;
      try {
        await ses.cookies.set({
          url,
          name: c.name,
          value: c.value,
          ...(c.domain && c.domain.startsWith('.') ? { domain: c.domain } : {}),
          path: c.path || '/',
          secure: c.secure ?? true,
          httpOnly: c.httpOnly,
          ...(c.expirationDate ? { expirationDate: c.expirationDate } : {}),
        });
      } catch {
        /* một cookie lỗi không chặn các cookie còn lại */
      }
    }
  }

  /** Ghi cookie hiện tại xuống kho (chỉ khi đang đăng nhập — đừng lưu trạng thái đăng xuất đè lên bản tốt). */
  private async saveNow(): Promise<void> {
    if (!this.persist || !this.alive() || this.status().loggedIn !== true) return;
    const cs = await this.dumpCookies();
    if (cs.length) this.persist.save(cs);
  }

  /**
   * Nhét cookie của phiên zca vào partition — CHỈ khi cửa sổ chưa có phiên (để khỏi quét QR lại). KHÔNG đè lên
   * lần đăng nhập người dùng đã tự làm trong cửa sổ (nếu đã có phiên thì bỏ qua). Best-effort.
   */
  async seedCookies(cookies: ZaloWebCookie[]): Promise<void> {
    if (this.seeded || !cookies.length) return;
    this.seeded = true;
    if (await this.hasSession()) return; // đã đăng nhập trong cửa sổ → không đụng tới
    const ses = electronSession.fromPartition(PARTITION);
    for (const c of cookies) {
      const bare = c.domain?.replace(/^\./, '') || 'zalo.me';
      const url = `https://${bare}${c.path && c.path.startsWith('/') ? c.path : '/'}`;
      try {
        await ses.cookies.set({
          url,
          name: c.name,
          value: c.value,
          ...(c.domain && c.domain.startsWith('.') ? { domain: c.domain } : {}),
          path: c.path || '/',
          secure: c.secure ?? true,
          httpOnly: c.httpOnly,
          ...(c.expirationDate ? { expirationDate: c.expirationDate } : {}),
        });
      } catch {
        /* một cookie lỗi không chặn các cookie còn lại */
      }
    }
  }

  private track(wc: Electron.WebContents): void {
    const bump = (url?: string, full = false) => {
      this.navUrl = url || wc.getURL();
      this.lastNavAt = Date.now();
      // Điều hướng THẬT (không phải đổi route trong trang) ⇒ phải xác nhận lại ứng dụng đã dựng.
      if (full) this.appReady = false;
      if (urlLoggedIn(this.navUrl) !== true) {
        this.chatSince = 0;
        this.appReady = false;
      } else if (full || !this.chatSince) this.chatSince = Date.now();
    };
    wc.on('did-navigate', (_e, url) => bump(url, true));
    wc.on('did-navigate-in-page', (_e, url) => {
      // Nút "Thử lại" trên dải báo của Larkwave (loginNoteScript).
      if (/#larkwave-retry$/.test(url)) return void this.retryLogin();
      bump(url);
    });
    wc.on('did-stop-loading', () => bump());
    wc.on('did-start-loading', () => (this.lastNavAt = Date.now()));
  }

  /** Ghi lại kết quả các lời gọi của trang đăng nhập. Partition này chỉ cửa sổ Zalo Web dùng ⇒ giữ được webRequest. */
  private hookLoginApi(): void {
    if (this.loginApiHooked) return;
    this.loginApiHooked = true;
    const wr = electronSession.fromPartition(PARTITION).webRequest;
    const key = (url: string) => /^https:\/\/id\.zalo\.me\/account\/(logininfo|authen\/qr\/generate)(\?|$)/.exec(url)?.[1];
    const host = (url: string) => /^\w+:\/\/([^/]+)/.exec(url)?.[1] || '';
    const done = (d: { id: number; url: string }, result: string, failed: boolean) => {
      this.inflight.delete(d.id);
      if (failed && host(d.url) && !/ERR_(ABORTED|CACHE_MISS)/.test(result)) this.netErrors.set(host(d.url), result);
      const k = key(d.url);
      const cur = k ? this.loginApi.get(k) : undefined;
      if (!k || !cur) return;
      const s = Math.round((Date.now() - cur.at) / 1000);
      this.loginApi.set(k, { at: cur.at, result: s >= 2 ? `${result} sau ${s}s` : result });
    };
    // onBeforeRequest (không phải onSendHeaders): thấy cả request hỏng TRƯỚC khi gửi được header (DNS, bị chặn…).
    wr.onBeforeRequest((d, cb) => {
      if (this.inflight.size > 500) this.inflight.clear();
      this.inflight.set(d.id, { host: host(d.url), at: Date.now() });
      const k = key(d.url);
      if (k) this.loginApi.set(k, { at: Date.now() });
      cb({});
    });
    wr.onCompleted((d) => done(d, `HTTP ${d.statusCode}`, false));
    wr.onErrorOccurred((d) => done(d, d.error, true));
  }

  private loginApiNote(): string {
    const now = Date.now();
    const api = [...this.loginApi].map(([k, v]) => `${k}: ${v.result ?? `chưa trả lời sau ${Math.round((now - v.at) / 1000)}s`}`);
    const slow = new Map<string, number>();
    for (const r of this.inflight.values()) if (now - r.at > 8000) slow.set(r.host, Math.max(slow.get(r.host) ?? 0, now - r.at));
    const hang = [...slow].slice(0, 4).map(([h, ms]) => `${h} (${Math.round(ms / 1000)}s)`);
    const errs = [...this.netErrors].slice(-4).map(([h, e]) => `${h}: ${e}`);
    return [...api, ...(hang.length ? [`đang treo: ${hang.join(', ')}`] : []), ...(errs.length ? [`lỗi mạng: ${errs.join(', ')}`] : [])].join('; ');
  }

  /** Lý do THẬT (LOGIN_INFO_PROBE) thành câu cho người dùng; kèm lời khuyên hợp với từng loại. */
  private async diagnoseLogin(): Promise<string> {
    const r = await this.runJsCapped<{ http?: number; code?: number; msg?: string; notJson?: string; err?: string }>(LOGIN_INFO_PROBE, 10_000);
    if (r.ok !== true) return `không hỏi lại được máy chủ đăng nhập (${r.error})`;
    const v = r.value;
    if (v.err) return `máy không kết nối được tới id.zalo.me (${v.err}) — kiểm tra mạng, VPN/proxy, tường lửa hoặc phần mềm chặn quảng cáo`;
    if (v.notJson !== undefined)
      return `id.zalo.me trả về một trang lạ thay vì dữ liệu Zalo (HTTP ${v.http}: "${v.notJson}") — thường do proxy/tường lửa/mạng công ty chặn`;
    if (v.code !== undefined && v.code !== 0) return `Zalo từ chối trang đăng nhập: "${v.msg || 'không rõ'}" (mã ${v.code}, HTTP ${v.http}) — đợi vài phút rồi Thử lại, hoặc thử mạng khác`;
    const qr = this.loginApi.get('authen/qr/generate')?.result;
    if (qr && !/^HTTP 200/.test(qr)) return `Zalo không tạo được mã QR (${qr}) — kiểm tra mạng rồi Thử lại`;
    return 'máy chủ Zalo trả lời bình thường nhưng trang vẫn không dựng mã QR';
  }

  /**
   * runJs chạy NGAY (không chờ trang tải xong — xem `now` ở runJs) và có trần giờ: renderer treo hẳn thì
   * executeJavaScript không bao giờ trả, kẻo nhịp canh/settle chết theo.
   */
  private runJsCapped<T>(expr: string, ms = 5000): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
    return Promise.race([
      this.runJs<T>(expr, true),
      new Promise<{ ok: false; error: string }>((res) => setTimeout(() => res({ ok: false, error: 'hết giờ' }), ms)),
    ]);
  }

  /** Dò xem ứng dụng chat.zalo.me đã dựng xong chưa (APP_READY_SCAN) — chỉ khi đang ở đó và chưa thấy. */
  private async probeApp(): Promise<void> {
    if (this.appReady || urlLoggedIn(this.navUrl) !== true) return;
    const r = await this.runJsCapped<boolean>(APP_READY_SCAN);
    if (r.ok === true && r.value && urlLoggedIn(this.navUrl) === true) this.appReady = true;
  }

  /**
   * Đăng nhập chưa. BÀI HỌC 27/10/2026: trang chat.zalo.me khi CHƯA đăng nhập vẫn đứng yên 2–7 giây sau
   * `did-stop-loading` rồi mới tự chuyển sang id.zalo.me ⇒ chỉ nhìn URL là báo "đã đăng nhập" nhầm (agent bảo
   * người dùng mở hội thoại trong khi cửa sổ đang ở trang QR; giao diện tự gộp phiên với cookie ẩn danh). Nay ở
   * chat.zalo.me mà chưa thấy ứng dụng ⇒ CHƯA RÕ (undefined), cho tới khi thấy ô tìm hoặc qua mốc CHAT_CONFIRM_MS.
   */
  private loginState(url: string): boolean | undefined {
    const byUrl = urlLoggedIn(url);
    if (byUrl !== true) return byUrl;
    return this.appReady || (this.chatSince > 0 && Date.now() - this.chatSince >= CHAT_CONFIRM_MS) ? true : undefined;
  }

  private resetLoginWatch(): void {
    this.stuckSince = 0;
    this.autoReloads = 0;
    this.loginStuck = '';
  }

  private stopLoginWatch(): void {
    if (this.loginTimer) clearInterval(this.loginTimer);
    this.loginTimer = null;
  }

  /**
   * Một nhịp canh (2 giây/lần, chỉ làm việc khi đang ở id.zalo.me): trang kẹt liền LOGIN_STUCK_MS ⇒ đi tiếp một bậc
   * của LOGIN_STEPS; hết bậc mà vẫn kẹt ⇒ hỏi lại logininfo lấy lý do thật, để câu báo ở `status().loginStuck` và
   * hiện dải báo + nút "Thử lại" ngay trên trang. Vẫn canh tiếp: trang tự lành (người dùng tự tải lại) ⇒ xoá câu báo.
   *
   * Script không chạy được trong trang cũng tính là kẹt (trang treo hẳn); chỉ lúc đang điều hướng mới bỏ qua.
   */
  private async checkLogin(): Promise<void> {
    if (!this.alive()) return this.stopLoginWatch();
    if (!onLoginPage(this.navUrl)) {
      this.stuckSince = 0;
      // Chỉ xoá bộ đếm khi ĐÃ ĐĂNG NHẬP thật: bậc "reset" nạp lại từ chat.zalo.me ⇒ trang đi ngang chat.zalo.me
      // trước khi quay về id.zalo.me — xoá ở đó là thang cứu lặp vô tận, không bao giờ tới câu báo (đo 27/10/2026).
      if ((this.autoReloads || this.loginStuck) && this.loginState(this.navUrl) === true) this.resetLoginWatch();
      // Ở chat.zalo.me: dò luôn ứng dụng đã dựng chưa, để status() (giao diện hỏi 4 giây/lần) sớm biết đã đăng nhập.
      if (!this.appReady && !this.loginChecking && urlLoggedIn(this.navUrl) === true) {
        this.loginChecking = true;
        await this.probeApp().finally(() => (this.loginChecking = false));
      }
      return;
    }
    if (this.loginChecking) return;
    this.loginChecking = true;
    try {
      const r = await this.runJsCapped<{ blank: boolean; qrEmpty: boolean }>(LOGIN_PAGE_SCAN);
      if (!this.alive() || !onLoginPage(this.navUrl) || Date.now() - this.lastNavAt < 1500) return; // giữa lúc điều hướng
      if (r.ok === true && !r.value.blank && !r.value.qrEmpty) {
        if (this.stuckSince || this.autoReloads || this.loginStuck) this.resetLoginWatch();
        return;
      }
      const what = r.ok !== true ? `trang không trả lời (${r.error})` : r.value.blank ? 'trang không dựng khung đăng nhập' : 'ô mã QR rỗng';
      if (this.loginStuck) {
        void this.runJsCapped(loginNoteScript(`Larkwave: ${this.loginStuck}`, true)); // trang vừa tự tải lại ⇒ chèn lại dải báo
        return;
      }
      const now = Date.now();
      if (!this.stuckSince) this.stuckSince = now;
      if (now - this.stuckSince < LOGIN_STUCK_MS) return;
      const why = this.loginApiNote();
      if (this.autoReloads >= LOGIN_STEPS.length) {
        const real = await this.diagnoseLogin();
        if (!this.alive() || !onLoginPage(this.navUrl)) return;
        this.loginStuck =
          `Trang đăng nhập Zalo không hiện mã QR (${what}; đã tự thử lại ${this.autoReloads} lần, kể cả xoá dữ liệu đăng nhập cũ của cửa sổ). ` +
          `Lý do: ${real}.${why ? ` [${why}]` : ''}`;
        console.warn(`[zaloWeb] ${this.loginStuck}`);
        void this.runJsCapped(loginNoteScript(`Larkwave: ${this.loginStuck}`, true));
        return;
      }
      const step = LOGIN_STEPS[this.autoReloads++];
      this.stuckSince = 0;
      console.warn(`[zaloWeb] ${what} — tự cứu bậc ${this.autoReloads} (${step})${why ? ` [${why}]` : ''}`);
      await this.runJsCapped(
        loginNoteScript(`Larkwave: trang đăng nhập Zalo chưa hiện mã QR — đang tự thử lại (${this.autoReloads}/${LOGIN_STEPS.length})…`, false),
        1500,
      );
      if (!this.alive()) return;
      this.lastNavAt = Date.now();
      const wc = this.win!.webContents;
      if (step === 'reset') {
        await this.wipeLoginData();
        if (this.alive()) void this.win!.loadURL(ZALO_WEB_URL, { userAgent: ZALO_WEB_UA }).catch(() => undefined);
      } else if (step === 'hard') wc.reloadIgnoringCache();
      else wc.reload();
    } finally {
      this.loginChecking = false;
    }
  }

  /**
   * Xoá SẠCH dữ liệu của partition cửa sổ (cookie, localStorage/IndexedDB, service worker, bộ đệm) + cookie đã lưu.
   * CHỈ gọi khi đang kẹt ở trang đăng nhập (= chưa đăng nhập, không mất phiên nào). Không động tới phiên zca.
   */
  private async wipeLoginData(): Promise<void> {
    const ses = electronSession.fromPartition(PARTITION);
    try {
      this.persist?.clear?.();
    } catch {
      /* kho lỗi không chặn việc dọn partition */
    }
    await ses.clearStorageData().catch(() => undefined);
    await ses.clearCache().catch(() => undefined);
    this.netErrors.clear();
    this.loginApi.clear();
  }

  /** Nút "Thử lại" trên dải báo: canh lại từ đầu và nạp lại từ chat.zalo.me. */
  private retryLogin(): void {
    if (!this.alive()) return;
    this.resetLoginWatch();
    this.lastNavAt = Date.now();
    void this.win!.loadURL(ZALO_WEB_URL, { userAgent: ZALO_WEB_UA }).catch(() => undefined);
  }

  /**
   * Chờ trang ỔN ĐỊNH: không còn điều hướng trong ~900ms, và đã kết luận được login/chưa (loginState). Tối đa
   * `timeout` — mặc định dài hơn CHAT_CONFIRM_MS để mốc dự phòng kịp tới khi không dò được ô tìm.
   */
  private async settle(timeout = CHAT_CONFIRM_MS + 2000): Promise<void> {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (Date.now() - this.lastNavAt > 900) {
        await this.probeApp();
        if (this.loginState(this.navUrl) !== undefined) return;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  /** Tạo (nếu cần) + nạp trang + CHỜ ỔN ĐỊNH. `show` = hiện ra màn hình. KHÔNG nạp lại nếu cửa sổ đã sống. */
  async open(show: boolean): Promise<ZaloWebStatus> {
    if (!this.alive()) {
      const win = new BrowserWindow({
        show: false,
        width: 1180,
        height: 820,
        title: 'Zalo Web (Larkwave)',
        backgroundColor: '#ffffff',
        paintWhenInitiallyHidden: true,
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, partition: PARTITION, backgroundThrottling: false },
      });
      win.on('closed', () => {
        if (this.win === win) {
          this.win = null;
          this.stopLoginWatch();
        }
      });
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      this.navUrl = '';
      this.lastNavAt = Date.now();
      this.track(win.webContents);
      this.win = win;
      this.hookLoginApi();
      this.resetLoginWatch();
      this.loginTimer ??= setInterval(() => void this.checkLogin(), 2000);
      // Nạp lại cookie đã lưu từ lần chạy trước ⇒ không phải quét QR lại mỗi lần mở app.
      if (!this.restored && this.persist) {
        this.restored = true;
        const saved = this.persist.load();
        if (saved.length && !(await this.hasSession())) await this.applyCookies(saved);
      }
      if (show && !hiddenMode()) {
        win.show();
        win.focus();
      }
      await win.loadURL(ZALO_WEB_URL, { userAgent: ZALO_WEB_UA }).catch(() => undefined);
      await this.settle();
      void this.saveNow(); // vừa vào được (cookie nạp lại còn sống, hoặc vừa đăng nhập)
      // Người dùng quét QR sau đó / Zalo làm mới cookie ⇒ ghi lại định kỳ.
      this.saveTimer ??= setInterval(() => void this.saveNow(), 90_000);
    } else if (show && !hiddenMode()) {
      this.win!.show();
      this.win!.focus();
    }
    return this.status();
  }

  show(): ZaloWebStatus {
    if (this.alive() && !hiddenMode()) {
      this.win!.show();
      this.win!.focus();
    }
    return this.status();
  }

  hide(): ZaloWebStatus {
    void this.saveNow();
    if (this.alive()) this.win!.hide();
    return this.status();
  }

  /** Ghi cookie ngay (gọi lúc thoát app). */
  flush(): Promise<void> {
    return this.saveNow();
  }

  async reload(): Promise<ZaloWebStatus> {
    if (this.alive()) {
      this.resetLoginWatch();
      this.lastNavAt = Date.now();
      this.win!.webContents.reload();
      await this.settle();
    }
    return this.status();
  }

  /** Đóng hẳn = người dùng chủ động bỏ cửa sổ: XOÁ luôn cookie đã lưu (không giữ chìa khoá Zalo lại). */
  close(): ZaloWebStatus {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }
    this.stopLoginWatch();
    this.resetLoginWatch();
    if (this.alive()) this.win!.close();
    this.win = null;
    this.seeded = false;
    this.restored = false;
    return { exists: false, visible: false };
  }

  status(): ZaloWebStatus {
    if (!this.alive()) return { exists: false, visible: false };
    const wc = this.win!.webContents;
    // Dùng URL điều hướng gần nhất (đã ổn định) thay vì getURL() tức thời giữa lúc chuyển hướng.
    const url = this.navUrl || wc.getURL();
    return {
      exists: true,
      visible: this.win!.isVisible(),
      url,
      title: wc.getTitle(),
      loggedIn: this.loginState(url),
      ...(this.lastReadAt ? { lastReadAt: this.lastReadAt } : {}),
      ...(this.loginStuck ? { loginStuck: this.loginStuck } : {}),
    };
  }

  /**
   * Lấy phiên web hiện tại (cookie trong partition + UA) để GỘP sang zca (loginWithCredentials). Dạng cookie
   * theo tough-cookie JSON để zca `parseCookies` nạp được. Chưa đăng nhập ⇒ null.
   */
  /** imei mà CHÍNH cửa sổ đã dùng để đăng nhập (phiên Zalo gắn với thiết bị này) — xem IMEI_SCAN. */
  async readImei(): Promise<{ imei?: string; key?: string; keys: string[] }> {
    const r = await this.runJs<{ hits: { key: string; imei: string }[]; keys: string[] }>(IMEI_SCAN);
    if (!r.ok) return { keys: [] };
    const hit = r.value?.hits?.[0];
    return { ...(hit ? { imei: hit.imei, key: hit.key } : {}), keys: r.value?.keys ?? [] };
  }

  async exportSession(): Promise<{ cookies: Record<string, unknown>[]; userAgent: string; names: string[]; imei?: string; imeiKey?: string; storeKeys: string[] } | null> {
    if (!this.alive() || this.status().loggedIn !== true) return null;
    const cs = await electronSession.fromPartition(PARTITION).cookies.get({}).catch(() => []);
    const zaloish = cs.filter((c) => /(^|\.)(zalo\.me|zadn\.vn|zdn\.vn|zaloapp\.com)$/i.test(c.domain || ''));
    // BÀI HỌC 18/10: cookie đăng nhập của Zalo Web thường chỉ gắn host chat.zalo.me (hostOnly). zca gọi sang
    // wpa.chat.zalo.me / tdb.zalo.me… nên cookie hostOnly KHÔNG được gửi kèm → getLoginInfo "Đăng nhập thất bại".
    // Vì vậy xuất cho zca dưới dạng cookie TÊN MIỀN `.zalo.me` (gửi tới mọi máy chủ con), không hostOnly.
    const cookies = zaloish.map((c) => {
      const d = (c.domain || '').replace(/^\./, '');
      const parent = /(^|\.)zalo\.me$/i.test(d) ? 'zalo.me' : d;
      return {
        key: c.name,
        value: c.value,
        domain: parent,
        path: '/',
        secure: !!c.secure,
        httpOnly: !!c.httpOnly,
        hostOnly: false,
        ...(c.expirationDate ? { expires: new Date(c.expirationDate * 1000).toISOString() } : {}),
      };
    });
    if (!cookies.length) return null;
    const dev = await this.readImei();
    return { cookies, userAgent: ZALO_WEB_UA, names: cs.map((c) => c.name), ...(dev.imei ? { imei: dev.imei, imeiKey: dev.key } : {}), storeKeys: dev.keys };
  }

  /**
   * MỞ một hội thoại trong cửa sổ theo TÊN — agent tự làm, không bắt người dùng bấm.
   *
   * BÀI HỌC 18/10/2026 (ảnh người dùng gửi): gõ tên vào ô tìm thì CHẠY (Zalo hiện đúng 1 kết quả), nhưng
   * `dispatchEvent(new MouseEvent('click'))` KHÔNG mở được hội thoại — Zalo bỏ qua sự kiện giả lập. Nay lấy
   * TOẠ ĐỘ của hàng kết quả rồi bắn CLICK CHUỘT THẬT bằng `webContents.sendInputEvent` (sự kiện tin cậy, y
   * như người dùng bấm), rồi KIỂM CHỨNG đã rời màn hình chào mừng chưa.
   */
  async openChat(name: string): Promise<{ opened: boolean; clicked?: string; candidates: string[]; webHistoryLimit?: string; scriptError?: string }> {
    if (!this.alive()) throw new Error('Cửa sổ Zalo Web chưa mở.');
    const wc = this.win!.webContents;
    const want = String(name || '').trim();
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    // 1) Gõ tên vào ô tìm (cột trái) để Zalo lọc danh sách.
    await this.runJs<boolean>(
        `(() => {
          const want = ${JSON.stringify(want)};
          const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 40 && r.height > 14 && r.left < innerWidth * 0.5; };
          const box = [...document.querySelectorAll('input[type="text"], input[type="search"], input:not([type]), [contenteditable="true"]')].find(vis);
          if (!box) return false;
          box.focus();
          if (box.tagName === 'INPUT') {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(box, want);
            box.dispatchEvent(new Event('input', { bubbles: true }));
          } else {
            box.textContent = want;
            box.dispatchEvent(new InputEvent('input', { bubbles: true }));
          }
          return true;
        })()`,
    );
    await sleep(1600);

    // 2) Tìm TOẠ ĐỘ hàng kết quả khớp tên (ở cột trái, dưới ô tìm).
    const foundR = await this.runJs<{ ok: boolean; x?: number; y?: number; label?: string; candidates: string[]; limit?: string }>(
        `(() => {
          const want = ${JSON.stringify(want)};
          const fold = (x) => (x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
          const target = fold(want);
          const rows = [...document.querySelectorAll('div,li,a')].filter((el) => {
            const r = el.getBoundingClientRect();
            if (r.width < 80 || r.height < 24 || r.height > 110) return false;
            if (r.left > innerWidth * 0.5 || r.top < 80) return false;
            const t = fold(el.textContent);
            return t && t.length < 120 && t.includes(target);
          });
          // Hàng "sát" nhất: phần tử nhỏ nhất bao được tên (tránh bắt cả khung danh sách).
          rows.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
          const el = rows[0];
          const candidates = [...document.querySelectorAll('div,li,a')]
            .filter((e) => { const r = e.getBoundingClientRect(); return r.left < innerWidth * 0.5 && r.width > 80 && r.height > 24 && r.height < 110; })
            .map((e) => (e.textContent || '').trim())
            .filter((t) => t && t.length < 60)
            .slice(0, 25);
          // Ghi chú GIỚI HẠN của chính Zalo Web (vd "tìm tin nhắn trước ngày 04/10/2026").
          const limit = ((document.body.textContent || '').match(/tin nhắn trước ngày\s*[\d/]+/i) || [])[0] || '';
          if (!el) return { ok: false, candidates, limit };
          const r = el.getBoundingClientRect();
          return { ok: true, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), label: (el.textContent || '').trim().slice(0, 80), candidates, limit };
        })()`,
    );
    if (foundR.ok !== true) return { opened: false, candidates: [], scriptError: foundR.error };
    const found = foundR.value;

    const candidates = found?.candidates ?? [];
    const webHistoryLimit = found?.limit || undefined;
    if (!found?.ok || found.x === undefined || found.y === undefined) return { opened: false, candidates, ...(webHistoryLimit ? { webHistoryLimit } : {}) };

    // 3) CLICK CHUỘT THẬT (sự kiện tin cậy) — chỗ mà sự kiện giả lập thất bại.
    const pt = { x: found.x, y: found.y };
    wc.sendInputEvent({ type: 'mouseMove', ...pt });
    await sleep(80);
    wc.sendInputEvent({ type: 'mouseDown', ...pt, button: 'left', clickCount: 1 });
    await sleep(60);
    wc.sendInputEvent({ type: 'mouseUp', ...pt, button: 'left', clickCount: 1 });
    await sleep(1800);

    // 4) Kiểm chứng: đã rời màn hình chào mừng / đã có khung tin chưa.
    const okR = await this.runJs<boolean>(
        `(() => {
          const t = document.body ? (document.body.textContent || '').slice(0, 200000) : '';
          if (/Chào mừng đến với Zalo/i.test(t)) return false;
          const el = document.elementFromPoint(Math.round(innerWidth * 0.68), Math.round(innerHeight * 0.5));
          let n = el, deep = false;
          while (n && n !== document.body) { if (n.scrollHeight > n.clientHeight + 24 && n.clientHeight > 120) { deep = true; break; } n = n.parentElement; }
          return deep || t.length > 400;
        })()`,
    );
    const opened = okR.ok === true ? !!okR.value : false;
    const okErr = okR.ok === true ? '' : okR.error;

    return { opened, ...(found.label ? { clicked: found.label } : {}), candidates, ...(webHistoryLimit ? { webHistoryLimit } : {}), ...(okErr ? { scriptError: okErr } : {}) };
  }

  /**
   * Đọc hội thoại ĐANG MỞ: cuộn lên từng ĐỢT NGẮN (vòng lặp ở đây, không phải trong trang) cho tới khi chạm
   * `untilTs`, hoặc chạm đỉnh hội thoại, hoặc hết `scrolls` / hết giờ. Rồi lấy nội dung một lần.
   */
  async readOpen(scrolls = 12, untilTs?: number): Promise<ZaloWebRead> {
    if (!this.alive()) throw new Error('Cửa sổ Zalo Web chưa mở. Dùng zalo_web_open, rồi mở đúng hội thoại cần đọc TRONG CỬA SỔ ĐÓ.');
    await this.settle(4000);
    if (this.status().loggedIn === false) {
      throw new Error('Cửa sổ Zalo Web đang ở trang đăng nhập. Người dùng cần ĐĂNG NHẬP NGAY TRONG CỬA SỔ ĐÓ (quét QR), và nếu điện thoại hỏi thì bấm Đồng ý đồng bộ.');
    }
    const BATCH = 6;
    const budgetMs = 150_000; // trần giờ: thà trả về phần đã cuộn còn hơn treo rồi hỏng cả lượt
    const t0 = Date.now();
    let done = 0;
    let reachedTop = false;
    let oldestSeen = '';
    let lastH = -1;
    let stable = 0;
    let stepErr = '';

    while (done < Math.max(1, Math.min(scrolls, 400)) && Date.now() - t0 < budgetMs) {
      const n = Math.min(BATCH, scrolls - done);
      type Step = { h: number; top: number; head: string; len: number };
      const stR = await this.runJs<Step>(scrollStepScript(n));
      if (stR.ok !== true) {
        // Một đợt hỏng (trang vừa vẽ lại) thì dừng cuộn, vẫn lấy phần đang có — đừng để hỏng cả lượt đọc.
        stepErr = stR.error.slice(0, 160);
        break;
      }
      const st = stR.value;
      done += n;
      if (!st) break;
      const od = oldestDate(st.head);
      if (od.label) oldestSeen = od.label;
      if (untilTs && Number.isFinite(od.ts) && od.ts <= untilTs) break; // đã tới mốc ngày cần lấy
      if (st.h === lastH) {
        stable++;
        // Chỉ coi là HẾT TIN khi vừa đứng yên vừa thật sự ở đỉnh (Zalo đang tải cũng đứng yên).
        if (stable >= 3 && st.top <= 2) {
          reachedTop = true;
          break;
        }
        if (stable >= 8) break;
      } else {
        stable = 0;
        lastH = st.h;
      }
    }

    type Extract = { empty: boolean; title: string; text: string; truncated: boolean; how: string; areaLen: number; bodyLen: number; tag: string; cls: string; limitDate?: string };
    const rR = await this.runJs<Extract>(extractScript(MAX_TEXT));
    if (rR.ok !== true) {
      // Trả về RỖNG kèm lý do THẬT, không ném — nơi gọi báo đúng lỗi cho người dùng.
      return {
        empty: true,
        title: '',
        text: '',
        truncated: false,
        diag: { how: `lỗi đọc: ${rR.error}`, tag: '', cls: '', bodyLen: 0, areaLen: 0, scrolled: done, reachedTop, oldestSeen },
      };
    }
    const r = rR.value;
    this.lastReadAt = Date.now();
    return {
      empty: r.empty,
      title: r.title,
      text: r.text,
      truncated: r.truncated,
      ...(r.limitDate ? { limitDate: r.limitDate } : {}),
      diag: { how: r.how + (stepErr ? `(cuộn dừng: ${stepErr})` : ''), tag: r.tag, cls: r.cls, bodyLen: r.bodyLen, areaLen: r.areaLen, scrolled: done, reachedTop, oldestSeen },
    };
  }
}

export const zaloWeb = new ZaloWeb();
