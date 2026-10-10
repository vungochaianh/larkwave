import { isLarkHost } from './larkUiCore';

/**
 * Is the Lark web page REALLY logged in? Pure (no Electron) → apps/desktop/test/larkLoginState.cjs.
 *
 * The old check was "the URL is on a Lark host and isn't a login page", so the public marketing
 * site (https://www.larksuite.com/en_sg/ — where connect() lands by default) counted as logged in:
 * the status pill said "Đã đăng nhập" with no session at all, and the host was remembered as the
 * user's tenant. Now the signal is Lark's own "who am I" answer (`classifyWhoami`): logged in
 * only when Lark returns a NON-anonymous user with a real uid. The URL only decides whether we are
 * on a login page (keep waiting) or may probe.
 */

export type LarkPageKind = 'login' | 'public' | 'app' | 'other';

export const LOGIN_PATH = /\/(accounts|passport|login|sso|suite\/passport)(\/|$|\?)/i;

/** Hosts that serve the PUBLIC site / auth, never a tenant's workspace. */
const PUBLIC_HOSTS = /^(www\.|)(larksuite\.com|larkoffice\.com|feishu\.cn|feishu\.com)$|^(open|passport|accounts|login|sso|help|www-[a-z]+)\./i;
/** Paths of the logged-in web app (also valid on a public host, e.g. www.larksuite.com/next/messenger). */
const APP_PATH = /^\/(next|messenger|base|wiki|docx|docs|doc|sheets|drive|mindnotes|file|app|admin|calendar|minutes|approval|space|okr)(\/|$)/i;

export function classifyLarkPage(url: string | null | undefined): LarkPageKind {
  if (!url || !isLarkHost(url)) return 'other';
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return 'other';
  }
  if (LOGIN_PATH.test(u.pathname) || /^(passport|accounts|login|sso)\./i.test(u.hostname)) return 'login';
  if (APP_PATH.test(u.pathname)) return 'app';
  if (PUBLIC_HOSTS.test(u.hostname)) return 'public'; // marketing pages (/en_sg/, /product/…)
  return 'app'; // tenant shard (abc.larksuite.com, abc.sg.larksuite.com) — any path
}

/** Endpoint the Lark web app itself calls for "who am I". Measured on the public site without a
 *  login: HTTP 200 `{code:0, data:{is_Anonymous:true, uid:"", name:"Guest User 66018", …}}` — so a
 *  200 alone proves nothing; the anonymity flag + a real uid do. (A `session` cookie is ALSO set for
 *  anonymous visitors — measured — so cookies are not a login signal either.) */
export const WHOAMI_PATH = '/space/api/user/';

export interface LarkWhoami {
  loggedIn: boolean;
  /** Definitive: Lark answered and said "anonymous" (vs. unknown = no/odd answer). */
  anonymous: boolean;
  name?: string;
  /** The tenant's web domain (e.g. abc.sg.larksuite.com) when logged in. */
  domain?: string;
}

/** Classify the whoami JSON. Fail-closed: anything but a clear non-anonymous user → not logged in. */
export function classifyWhoami(json: unknown): LarkWhoami {
  const j = json as { code?: unknown; data?: Record<string, unknown> } | null;
  if (!j || typeof j !== 'object' || j.code !== 0 || !j.data || typeof j.data !== 'object') return { loggedIn: false, anonymous: false };
  const d = j.data;
  const anon = d.is_Anonymous === true || d.isAnonymous === true || d.is_anonymous === true;
  // Đo thật 09/10/2026 trên một tài khoản ĐÃ đăng nhập: `uid` là CHUỖI RỖNG, mã thật nằm ở `suid`
  // (19 ký tự) và `id`. Khách ẩn danh thì is_Anonymous=true. Nên: không ẩn danh + có MỘT mã bất kỳ.
  const realUid = [d.uid, d.suid, d.id].some((v) => String(v ?? '').trim() !== '');
  if (anon) return { loggedIn: false, anonymous: true };
  if (!realUid) return { loggedIn: false, anonymous: false };
  const domain = typeof d.domain === 'string' && /^[a-z0-9.-]+$/i.test(d.domain) && isLarkHost('https://' + d.domain) ? d.domain : undefined;
  return { loggedIn: true, anonymous: false, name: typeof d.name === 'string' ? d.name.slice(0, 80) : undefined, domain };
}

/** A page we may run the whoami probe on (Lark host, not the login/SSO page itself). */
export function canProbeLogin(url: string | null | undefined): boolean {
  const k = classifyLarkPage(url);
  return k === 'app' || k === 'public';
}

/** Trang đăng nhập Lark đang hiện mã QR hay ô email/SSO. */
export type LarkLoginView = 'qr' | 'form';

/**
 * Đoạn mã chạy TRONG trang đăng nhập Lark (`webContents.executeJavaScript`) để chuyển sang mã QR
 * (`want='qr'`), về ô email/SSO (`'form'`), hoặc chỉ đọc chế độ hiện tại (`'probe'`). Trả về
 * `'qr' | 'form'`, hoặc `''` khi trang không có nút chuyển (trang SSO, trang đã đổi giao diện…).
 *
 * Vì sao cần: trang mở mặc định ở ô email, và nút "Scan QR Code" ở góc thẻ đăng nhập bị Lark GIẤU
 * khi trang hẹp dưới ~600px — đúng bề rộng của khung Lark gắn cạnh màn chat. Đo thật 10/10/2026:
 * ở 480px phần tử `.switch-login-mode-box` vẫn nằm trong DOM (kích thước 0×0), bấm bằng mã thì mã
 * QR (canvas 184px) hiện đầy đủ. Luồng "đăng nhập lại từ điện thoại" chụp trang này gửi lên, nên
 * thiếu bước này thì điện thoại nhận về ô email chứ không phải mã để quét.
 *
 * Nhận biết QR bằng canvas VUÔNG đủ lớn — không dựa vào chữ, vì chữ đổi theo ngôn ngữ. Kích thước
 * thôi thì chưa đủ: bảng QR và bảng email nằm CHỒNG lên nhau, chuyển bằng hiệu ứng mờ, và canvas QR
 * vẫn giữ nguyên 184px khi bảng email đè lên (đo thật: đo theo cỡ thì sau "về email" vẫn báo 'qr').
 * Nên hỏi phần tử TRÊN CÙNG tại tâm mã QR có thuộc khối quét mã không — đúng ở mọi mẫu, kể cả lúc
 * đang chuyển. Nút chuyển là công tắc (bấm lần nữa là quay lại), nên chỉ bấm khi chế độ KHÁC ý muốn.
 */
export function loginViewScript(want: LarkLoginView | 'probe'): string {
  return `(async (want) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const isQr = () => [...document.querySelectorAll('canvas')].some((c) => {
    const r = c.getBoundingClientRect();
    if (r.width < 120 || Math.abs(r.width - r.height) >= 12) return false;
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return true; // ngoài khung nhìn: không hỏi được
    const hit = document.elementFromPoint(x, y);
    const box = c.closest('[class*="scan" i]') || c.parentElement;
    return !!hit && (hit === c || !!(box && box.contains(hit)));
  });
  const sw = () => document.querySelector('.login-qr-switch-box .switch-login-mode-box') || document.querySelector('.switch-login-mode-box');
  for (let i = 0; i < 20 && !sw(); i++) await sleep(250); // trang tự vẽ sau khi tải xong
  const s = sw();
  if (!s) return isQr() ? 'qr' : '';
  if (want !== 'probe' && (want === 'qr') !== isQr()) {
    s.click();
    for (let i = 0; i < 16 && (want === 'qr') !== isQr(); i++) await sleep(250);
  }
  return isQr() ? 'qr' : 'form';
})(${JSON.stringify(want)})`;
}
