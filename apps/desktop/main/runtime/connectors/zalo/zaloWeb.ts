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

class ZaloWeb {
  private win: BrowserWindow | null = null;
  private seeded = false;
  private lastReadAt = 0;
  /** URL mới nhất sau mỗi lần điều hướng — để biết trang đã ổn định ở đâu (xem BÀI HỌC ở đầu tệp). */
  private navUrl = '';
  private lastNavAt = 0;

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
      if (show && !hiddenMode()) {
        win.show();
        win.focus();
      }
      await win.loadURL(ZALO_WEB_URL, { userAgent: ZALO_WEB_UA }).catch(() => undefined);
      await this.settle();
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
    if (this.alive()) this.win!.hide();
    return this.status();
  }

  async reload(): Promise<ZaloWebStatus> {
    if (this.alive()) {
      this.lastNavAt = Date.now();
      this.win!.webContents.reload();
      await this.settle();
    }
    return this.status();
  }

  close(): ZaloWebStatus {
    if (this.alive()) this.win!.close();
    this.win = null;
    this.seeded = false;
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
  async exportSession(): Promise<{ cookies: Record<string, unknown>[]; userAgent: string } | null> {
    if (!this.alive() || this.status().loggedIn !== true) return null;
    const cs = await electronSession.fromPartition(PARTITION).cookies.get({}).catch(() => []);
    const cookies = cs
      .filter((c) => /(^|\.)(zalo\.me|zadn\.vn|zdn\.vn)$/i.test(c.domain || ''))
      .map((c) => ({
        key: c.name,
        value: c.value,
        domain: (c.domain || '').replace(/^\./, ''),
        path: c.path || '/',
        secure: !!c.secure,
        httpOnly: !!c.httpOnly,
        hostOnly: !(c.domain || '').startsWith('.'),
        ...(c.expirationDate ? { expires: new Date(c.expirationDate * 1000).toISOString() } : {}),
      }));
    return cookies.length ? { cookies, userAgent: ZALO_WEB_UA } : null;
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
