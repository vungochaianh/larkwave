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
}

export interface ZaloWebRead {
  title: string;
  /** Nội dung chữ của hội thoại đang mở (đã cuộn lên để tải thêm lịch sử). */
  text: string;
  /** Đã cắt bớt vì quá dài. */
  truncated: boolean;
  /** Không mở hội thoại nào / không thấy vùng tin. */
  empty: boolean;
  /** Đã dò vùng tin bằng cách nào + đo được gì — để chẩn đoán khi đọc ra rỗng. */
  diag?: { how: string; tag: string; cls: string; bodyLen: number; areaLen: number; scrolled: number };
}

const MAX_TEXT = 200_000;

/**
 * Lái cửa sổ (chạy trong trang). Đọc innerText vùng tin lớn nhất, cuộn lên `scrolls` lần để Zalo tải thêm
 * lịch sử. THUẦN chuỗi (chạy qua executeJavaScript) nên không phụ thuộc tên lớp CSS hay thay đổi của Zalo.
 */
/**
 * Đọc nội dung hội thoại đang mở (chạy TRONG trang).
 *
 * BÀI HỌC 18/10/2026: bản đầu dò vùng tin bằng `getComputedStyle().overflowY === 'auto'|'scroll'` → trên
 * Zalo Web KHÔNG khớp phần tử nào ⇒ luôn trả rỗng, kể cả khi màn hình đang hiện đầy tin. Nay dò theo thứ tự
 * chắc dần, và LUÔN trả về `diag` để biết đã đi nhánh nào (không phải đoán lần nữa):
 *   1. `elementFromPoint` giữa vùng chat (phải màn hình) rồi leo lên tổ tiên CUỘN ĐƯỢC — chắc nhất.
 *   2. Quét toàn trang lấy phần tử có (scrollHeight − clientHeight) lớn nhất.
 *   3. Cùng lắm đọc `document.body` — thà lẫn cột trái còn hơn trả rỗng.
 * Cuộn lên bằng cả `scrollTop = 0` lẫn sự kiện `wheel` (danh sách ảo của Zalo nghe wheel).
 */
function readScript(scrolls: number): string {
  return `(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const canScroll = (el) => el && el.scrollHeight > el.clientHeight + 24 && el.clientHeight > 120;
    const diag = { how: '', tag: '', cls: '', bodyLen: 0, areaLen: 0, scrolled: 0 };

    // 1) Từ điểm giữa vùng chat leo lên tổ tiên cuộn được.
    let area = null;
    const px = Math.round(innerWidth * 0.68), py = Math.round(innerHeight * 0.5);
    let node = document.elementFromPoint(px, py);
    while (node && node !== document.body) {
      if (canScroll(node)) { area = node; diag.how = 'point'; break; }
      node = node.parentElement;
    }
    // 2) Quét toàn trang: phần tử cuộn được "sâu" nhất, nằm lệch phải (vùng chat), không phải cột trái.
    if (!area) {
      let best = null, bestScore = 0;
      for (const el of document.querySelectorAll('div,section,main,ul')) {
        if (!canScroll(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 240 || r.height < 160) continue;
        const score = (el.scrollHeight - el.clientHeight) * (r.left > innerWidth * 0.25 ? 2 : 1);
        if (score > bestScore) { bestScore = score; best = el; }
      }
      if (best) { area = best; diag.how = 'scan'; }
    }
    // 3) Cùng lắm: cả trang.
    if (!area) { area = document.scrollingElement || document.body; diag.how = 'body'; }

    diag.tag = (area.tagName || '').toLowerCase();
    diag.cls = String(area.className || '').slice(0, 80);

    // Cuộn lên để Zalo nạp thêm tin cũ (dừng khi chiều cao không tăng nữa).
    let lastH = -1, stable = 0;
    for (let i = 0; i < ${Math.max(0, Math.min(scrolls, 80))}; i++) {
      try { area.scrollTop = 0; } catch (e) {}
      try { area.dispatchEvent(new WheelEvent('wheel', { deltaY: -1500, bubbles: true })); } catch (e) {}
      await sleep(700);
      diag.scrolled = i + 1;
      const h = area.scrollHeight;
      if (h === lastH) { if (++stable >= 3) break; } else { stable = 0; lastH = h; }
    }
    try { area.scrollTop = area.scrollHeight; } catch (e) {}

    const clean = (x) => (x || '').replace(/\n{3,}/g, '\n\n').trim();
    let text = clean(area.innerText);
    diag.areaLen = text.length;
    const bodyText = clean(document.body ? document.body.innerText : '');
    diag.bodyLen = bodyText.length;
    // Vùng tìm được mà rỗng/quá ngắn ⇒ lấy cả trang, còn hơn báo "không có gì".
    if (text.length < 20 && bodyText.length > text.length) { text = bodyText; diag.how += '+body'; }

    const truncated = text.length > ${MAX_TEXT};
    if (truncated) text = text.slice(-${MAX_TEXT});

    // Tên hội thoại: thử vài chỗ, cuối cùng lấy dòng chữ đầu của nửa phải màn hình.
    let title = '';
    const h1 = document.querySelector('[class*="header"] [class*="name"], [class*="conv"] [class*="title"], header h1, header h2');
    if (h1 && h1.textContent) title = h1.textContent.trim().slice(0, 120);
    if (!title) {
      const top = document.elementFromPoint(Math.round(innerWidth * 0.68), 40);
      if (top && top.textContent) title = top.textContent.trim().slice(0, 120);
    }
    return { empty: !text, title, text, truncated, diag };
  })()`;
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
  scan(localStorage); scan(sessionStorage);
  return { hits, keys: keys.slice(0, 60) };
})()`;

class ZaloWeb {
  private win: BrowserWindow | null = null;
  private seeded = false;
  private lastReadAt = 0;
  /** URL mới nhất sau mỗi lần điều hướng — để biết trang đã ổn định ở đâu (xem BÀI HỌC ở đầu tệp). */
  private navUrl = '';
  private lastNavAt = 0;
  /** Lưu/nạp cookie cửa sổ qua các lần tắt app (zaloService nối vào kho mã hoá). */
  private persist: { load: () => ZaloWebCookie[]; save: (c: ZaloWebCookie[]) => void } | null = null;
  private saveTimer: ReturnType<typeof setInterval> | null = null;
  private restored = false;

  /** Nối kho giữ cookie cửa sổ (mã hoá) — xem zaloStore.loadWebCookies/saveWebCookies. */
  setPersist(p: { load: () => ZaloWebCookie[]; save: (c: ZaloWebCookie[]) => void }): void {
    this.persist = p;
  }

  private alive(): boolean {
    return !!this.win && !this.win.isDestroyed();
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
    const bump = (url?: string) => {
      this.navUrl = url || wc.getURL();
      this.lastNavAt = Date.now();
    };
    wc.on('did-navigate', (_e, url) => bump(url));
    wc.on('did-navigate-in-page', (_e, url) => bump(url));
    wc.on('did-stop-loading', () => bump());
    wc.on('did-start-loading', () => (this.lastNavAt = Date.now()));
  }

  /** Chờ trang ỔN ĐỊNH: không còn điều hướng trong ~900ms, và đã kết luận được login/chưa. Tối đa `timeout`. */
  private async settle(timeout = 9000): Promise<void> {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const quiet = Date.now() - this.lastNavAt > 900;
      if (quiet && urlLoggedIn(this.navUrl) !== undefined) return;
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
        if (this.win === win) this.win = null;
      });
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      this.navUrl = '';
      this.lastNavAt = Date.now();
      this.track(win.webContents);
      this.win = win;
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
      loggedIn: urlLoggedIn(url),
      ...(this.lastReadAt ? { lastReadAt: this.lastReadAt } : {}),
    };
  }

  /**
   * Lấy phiên web hiện tại (cookie trong partition + UA) để GỘP sang zca (loginWithCredentials). Dạng cookie
   * theo tough-cookie JSON để zca `parseCookies` nạp được. Chưa đăng nhập ⇒ null.
   */
  /** imei mà CHÍNH cửa sổ đã dùng để đăng nhập (phiên Zalo gắn với thiết bị này) — xem IMEI_SCAN. */
  async readImei(): Promise<{ imei?: string; key?: string; keys: string[] }> {
    if (!this.alive()) return { keys: [] };
    try {
      const r = (await this.win!.webContents.executeJavaScript(IMEI_SCAN, true)) as { hits: { key: string; imei: string }[]; keys: string[] };
      const hit = r?.hits?.[0];
      return { ...(hit ? { imei: hit.imei, key: hit.key } : {}), keys: r?.keys ?? [] };
    } catch {
      return { keys: [] };
    }
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
  async openChat(name: string): Promise<{ opened: boolean; clicked?: string; candidates: string[]; webHistoryLimit?: string }> {
    if (!this.alive()) throw new Error('Cửa sổ Zalo Web chưa mở.');
    const wc = this.win!.webContents;
    const want = String(name || '').trim();
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    // 1) Gõ tên vào ô tìm (cột trái) để Zalo lọc danh sách.
    await wc
      .executeJavaScript(
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
        true,
      )
      .catch(() => false);
    await sleep(1600);

    // 2) Tìm TOẠ ĐỘ hàng kết quả khớp tên (ở cột trái, dưới ô tìm).
    const found = (await wc
      .executeJavaScript(
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
          const limit = (document.body.innerText.match(/tin nhắn trước ngày\s*[\d/]+/i) || [])[0] || '';
          if (!el) return { ok: false, candidates, limit };
          const r = el.getBoundingClientRect();
          return { ok: true, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), label: (el.textContent || '').trim().slice(0, 80), candidates, limit };
        })()`,
        true,
      )
      .catch(() => null)) as { ok: boolean; x?: number; y?: number; label?: string; candidates: string[]; limit?: string } | null;

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
    const opened = (await wc
      .executeJavaScript(
        `(() => {
          const t = document.body ? document.body.innerText : '';
          if (/Chào mừng đến với Zalo/i.test(t)) return false;
          const el = document.elementFromPoint(Math.round(innerWidth * 0.68), Math.round(innerHeight * 0.5));
          let n = el, deep = false;
          while (n && n !== document.body) { if (n.scrollHeight > n.clientHeight + 24 && n.clientHeight > 120) { deep = true; break; } n = n.parentElement; }
          return deep || t.length > 400;
        })()`,
        true,
      )
      .catch(() => false)) as boolean;

    return { opened, ...(found.label ? { clicked: found.label } : {}), candidates, ...(webHistoryLimit ? { webHistoryLimit } : {}) };
  }

  /** Đọc nội dung hội thoại ĐANG MỞ trong cửa sổ Zalo Web (cuộn lên `scrolls` lần để tải thêm lịch sử). */
  async readOpen(scrolls = 12): Promise<ZaloWebRead> {
    if (!this.alive()) throw new Error('Cửa sổ Zalo Web chưa mở. Dùng zalo_web_open, rồi mở đúng hội thoại cần đọc TRONG CỬA SỔ ĐÓ.');
    await this.settle(4000);
    if (this.status().loggedIn === false) {
      throw new Error('Cửa sổ Zalo Web đang ở trang đăng nhập. Người dùng cần ĐĂNG NHẬP NGAY TRONG CỬA SỔ ĐÓ (quét QR), và nếu điện thoại hỏi thì bấm Đồng ý đồng bộ, rồi mở hội thoại cần đọc.');
    }
    const r = (await this.win!.webContents.executeJavaScript(readScript(scrolls), true)) as ZaloWebRead;
    this.lastReadAt = Date.now();
    return r;
  }
}

export const zaloWeb = new ZaloWeb();
