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
}

const MAX_TEXT = 200_000;

/**
 * Lái cửa sổ (chạy trong trang). Đọc innerText vùng tin lớn nhất, cuộn lên `scrolls` lần để Zalo tải thêm
 * lịch sử. THUẦN chuỗi (chạy qua executeJavaScript) nên không phụ thuộc tên lớp CSS hay thay đổi của Zalo.
 */
function readScript(scrolls: number): string {
  return `(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    // Vùng cuộn LỚN NHẤT trên trang = khung tin nhắn (danh sách hội thoại bên trái nhỏ hơn nhiều).
    const scrollables = [...document.querySelectorAll('*')].filter((el) => {
      const s = getComputedStyle(el);
      return (s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 40 && el.clientHeight > 180;
    });
    scrollables.sort((a, b) => b.clientHeight * b.scrollWidth - a.clientHeight * a.scrollWidth);
    const area = scrollables[0];
    if (!area) return { empty: true, title: (document.title || ''), text: '' };
    // Cuộn LÊN ĐẦU lặp lại để Zalo nạp thêm tin cũ (dừng khi chiều cao không tăng nữa).
    let lastH = -1, stable = 0;
    for (let i = 0; i < ${Math.max(0, Math.min(scrolls, 80))}; i++) {
      area.scrollTop = 0;
      await sleep(650);
      const h = area.scrollHeight;
      if (h === lastH) { if (++stable >= 3) break; } else { stable = 0; lastH = h; }
    }
    area.scrollTop = area.scrollHeight;
    let text = (area.innerText || '').replace(/\\n{3,}/g, '\\n\\n').trim();
    const truncated = text.length > ${MAX_TEXT};
    if (truncated) text = text.slice(-${MAX_TEXT});
    // Tên hội thoại: tiêu đề trên cùng của khung tin (heading gần nhất phía trên vùng tin).
    let title = '';
    const h = document.querySelector('[class*="header"] [class*="name"], [class*="conv"] [class*="title"]');
    if (h && h.textContent) title = h.textContent.trim().slice(0, 120);
    return { empty: !text, title, text, truncated };
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
   * MỞ một hội thoại trong cửa sổ theo TÊN — agent tự làm, không bắt người dùng bấm (lỗi UX 18/10/2026:
   * trợ lý cứ bảo "bạn bấm vào nhóm …" rồi chờ, trong khi cửa sổ là do app điều khiển).
   *
   * Không bám tên lớp CSS: gõ tên vào ô tìm của Zalo (input/contenteditable đầu ở cột trái), đợi kết quả,
   * rồi bấm vào mục có CHỮ khớp tên. Trả về đã mở được chưa + tên mục đã bấm.
   */
  async openChat(name: string): Promise<{ opened: boolean; clicked?: string; candidates: string[] }> {
    if (!this.alive()) throw new Error('Cửa sổ Zalo Web chưa mở.');
    const js = `(async () => {
      const want = ${JSON.stringify(String(name || '').trim())};
      const fold = (x) => (x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
      const target = fold(want);
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 40 && r.height > 14 && r.top < innerHeight && r.left < innerWidth * 0.55; };
      // 1) Gõ tên vào ô tìm (cột trái) để Zalo lọc danh sách.
      const box = [...document.querySelectorAll('input[type="text"], input:not([type]), [contenteditable="true"]')].find(vis);
      if (box) {
        try {
          box.focus();
          if (box.tagName === 'INPUT') {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(box, want);
            box.dispatchEvent(new Event('input', { bubbles: true }));
          } else {
            box.textContent = want;
            box.dispatchEvent(new InputEvent('input', { bubbles: true }));
          }
          await sleep(1200);
        } catch (e) { /* không gõ được thì dò thẳng danh sách */ }
      }
      // 2) Tìm mục có chữ khớp tên, nằm ở cột trái, và là phần tử NHỎ NHẤT chứa chữ đó (tránh bấm cả khung).
      const pick = () => {
        const all = [...document.querySelectorAll('div,li,a,span')].filter((el) => {
          if (!vis(el)) return false;
          const t = fold(el.textContent);
          return t && t.length < 160 && t.includes(target);
        });
        all.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
        return all[0] || null;
      };
      let el = pick();
      if (!el) { await sleep(1200); el = pick(); }
      const candidates = [...document.querySelectorAll('div,li,a')].filter(vis).map((e) => (e.textContent || '').trim()).filter((t) => t && t.length < 60).slice(0, 25);
      if (!el) return { opened: false, candidates };
      const clicked = (el.textContent || '').trim().slice(0, 80);
      // Bấm vào hàng hội thoại: leo lên vài cấp cho trúng vùng bấm được của Zalo.
      let node = el;
      for (let i = 0; i < 4 && node.parentElement; i++) {
        node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        node = node.parentElement;
      }
      await sleep(1500);
      return { opened: true, clicked, candidates };
    })()`;
    return (await this.win!.webContents.executeJavaScript(js, true)) as { opened: boolean; clicked?: string; candidates: string[] };
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
