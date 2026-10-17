/**
 * Cửa sổ Zalo Web nhúng trong Larkwave — mở chat.zalo.me CHÍNH THỨC bằng chính phiên của người dùng.
 *
 * Vì sao có (17/10/2026): để trợ lý đọc được tin CŨ (nhất là chat 1-1), app cần thấy lịch sử mà chỉ Zalo Web
 * dựng ra sau khi điện thoại "đồng bộ tin nhắn". Thay vì bẻ khoá tệp đồng bộ, ta mở thẳng trang Zalo Web:
 *   - người dùng giữ cửa sổ mở, tự bấm Đồng ý đồng bộ trên ĐIỆN THOẠI như bình thường;
 *   - Larkwave chỉ ĐỌC NỘI DUNG ĐANG HIỂN THỊ trên trang (innerText vùng tin) — y như app đang lái phiên Lark
 *     web. Không mò mẫm, không giải mã.
 *
 * Để KHÔNG phải quét QR lần nữa và không đá nhau với phiên zca (Zalo chỉ cho một phiên web một lúc), cửa sổ
 * được NHÉT cookie của phiên zca đang đăng nhập (seedCookies) → Zalo coi là cùng một phiên. Cửa sổ tạo ẩn,
 * vẫn vẽ nền (paintWhenInitiallyHidden) để trang tải/đồng bộ kể cả khi người dùng chưa mở ra xem.
 */
import { BrowserWindow, session as electronSession } from 'electron';
import { hiddenMode } from '../../../hiddenMode';
import type { ZaloWebCookie } from './session';

const ZALO_WEB_URL = 'https://chat.zalo.me/';
const PARTITION = 'persist:zalo-web';
const CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';
/** URL lúc CHƯA đăng nhập (trang quét QR / đăng nhập). */
const LOGIN_MARKER = /\/(login|qr|id\.zalo|account)/i;

export interface ZaloWebStatus {
  /** Cửa sổ đã được tạo chưa. */
  exists: boolean;
  visible: boolean;
  /** Đoán theo URL: đang ở trang đăng nhập hay đã vào ứng dụng. undefined = chưa biết. */
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

  private alive(): boolean {
    return !!this.win && !this.win.isDestroyed();
  }

  /** Đặt cookie phiên zca lên partition của cửa sổ (một lần) — cùng một phiên đăng nhập. */
  async seedCookies(cookies: ZaloWebCookie[]): Promise<void> {
    if (this.seeded || !cookies.length) return;
    const ses = electronSession.fromPartition(PARTITION);
    for (const c of cookies) {
      const domain = c.domain?.replace(/^\./, '') || 'zalo.me';
      const url = `https://${domain}${c.path || '/'}`;
      try {
        await ses.cookies.set({
          url,
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path || '/',
          secure: c.secure ?? url.startsWith('https'),
          httpOnly: c.httpOnly,
          ...(c.expirationDate ? { expirationDate: c.expirationDate } : {}),
        });
      } catch {
        /* một cookie lỗi không chặn các cookie còn lại */
      }
    }
    this.seeded = true;
  }

  /** Tạo (nếu cần) + nạp trang. `show` = hiện ra màn hình luôn. */
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
      // Mở link ngoài (ví dụ tải tệp) ở trình duyệt hệ thống, không đẻ cửa sổ con lạ.
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      this.win = win;
      await win.loadURL(ZALO_WEB_URL, { userAgent: CHROME_UA }).catch(() => undefined);
    }
    if (show && !hiddenMode()) {
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
      this.win!.webContents.reload();
      await new Promise((r) => setTimeout(r, 400));
    }
    return this.status();
  }

  close(): ZaloWebStatus {
    if (this.alive()) this.win!.close();
    this.win = null;
    return { exists: false, visible: false };
  }

  status(): ZaloWebStatus {
    if (!this.alive()) return { exists: false, visible: false };
    const wc = this.win!.webContents;
    const url = wc.getURL();
    return {
      exists: true,
      visible: this.win!.isVisible(),
      url,
      title: wc.getTitle(),
      loggedIn: url.startsWith('https://chat.zalo.me') && !LOGIN_MARKER.test(url),
      ...(this.lastReadAt ? { lastReadAt: this.lastReadAt } : {}),
    };
  }

  /** Đọc nội dung hội thoại ĐANG MỞ trong cửa sổ (cuộn lên `scrolls` lần để tải thêm lịch sử). */
  async readOpen(scrolls = 12): Promise<ZaloWebRead> {
    if (!this.alive()) throw new Error('Cửa sổ Zalo Web chưa mở. Mở nó (zalo_web_open) rồi mở đúng hội thoại cần đọc trong cửa sổ đó.');
    const wc = this.win!.webContents;
    if (LOGIN_MARKER.test(wc.getURL()) || !wc.getURL().startsWith('https://chat.zalo.me')) {
      throw new Error('Cửa sổ Zalo Web đang ở trang đăng nhập. Người dùng cần đăng nhập (và đồng bộ trên điện thoại) trong cửa sổ đó trước.');
    }
    const r = (await wc.executeJavaScript(readScript(scrolls), true)) as ZaloWebRead;
    this.lastReadAt = Date.now();
    return r;
  }
}

export const zaloWeb = new ZaloWeb();
