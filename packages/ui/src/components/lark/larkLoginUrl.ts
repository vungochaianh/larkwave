/**
 * Đổi trang đăng nhập Lark giữa mã QR và ô email/SSO bằng THAM SỐ URL — đường dùng khi lõi (main)
 * chưa biết tự bấm sang QR (bản 0.1.0, chỉ có "mở một URL Lark"). Lõi 0.1.1+ báo `loginSwitch` và
 * tự lo phần này; giao diện khi đó dùng action loginQr/loginForm thay vì sửa URL.
 *
 * Đo thật 10/10/2026 trên accounts.larksuite.com/accounts/page/login:
 *  - `loginType=qrcode` → mở thẳng mã QR, kể cả khi trang hẹp (lúc đó Lark giấu nút chuyển của nó).
 *  - `loginType=account` → về ô email/SSO. Các giá trị phone/email/mail/credential/password KHÔNG có tác dụng.
 *  - Tham số được giữ nguyên trên URL sau khi tải (không bị Lark xoá) → không có vòng tải lại.
 *  - Lark NHỚ chế độ lần trước (localStorage `login_mod`): bỏ tham số thì trang mở lại đúng chế độ cũ,
 *    nên muốn quay về email phải gắn `account`, không phải xoá tham số.
 */
export type LarkLoginView = 'qr' | 'form';

const PARAM = 'loginType';
const VALUE: Record<LarkLoginView, string> = { qr: 'qrcode', form: 'account' };
const LARK_HOST = /(^|\.)(larksuite\.com|feishu\.cn|larkoffice\.com)$/i;

function parse(url: string | null | undefined): URL | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && LARK_HOST.test(u.hostname) ? u : null;
  } catch {
    return null;
  }
}

/** Trang đăng nhập chính của Lark (nơi có công tắc QR ↔ email). Trang SSO/passport khác thì không. */
export function isLarkLoginPage(url: string | null | undefined): boolean {
  const u = parse(url);
  return !!u && /^\/accounts\/page\/login\/?$/i.test(u.pathname);
}

/** Chế độ mà URL đang yêu cầu; vắng tham số = chưa biết (Lark tự chọn theo lần trước). */
export function loginViewFromUrl(url: string | null | undefined): LarkLoginView | undefined {
  const u = parse(url);
  if (!u || !isLarkLoginPage(url)) return undefined;
  const v = u.searchParams.get(PARAM);
  return v === VALUE.qr ? 'qr' : v === VALUE.form ? 'form' : undefined;
}

/** Cùng trang đăng nhập (giữ nguyên redirect_uri…), chỉ đổi chế độ. */
export function loginUrlFor(url: string, view: LarkLoginView): string {
  const u = parse(url);
  if (!u) return url;
  u.searchParams.set(PARAM, VALUE[view]);
  return u.toString();
}
