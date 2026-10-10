/**
 * Đổi trang đăng nhập Lark giữa mã QR và ô email/SSO bằng tham số URL — đường của giao diện khi lõi
 * còn là bản cũ (0.1.0, không tự bấm sang QR được). Giá trị đo trên trang thật 10/10/2026.
 *
 *   bash apps/desktop/test/run.sh
 */
const assert = require('node:assert');
const { isLarkLoginPage, loginViewFromUrl, loginUrlFor } = require('../.test-build/ui/larkLoginUrl.js');

// Đúng URL mà Lark đá tới khi mở www.larksuite.com lúc chưa đăng nhập.
const LANDED = 'https://accounts.larksuite.com/accounts/page/login?app_id=1&no_trap=1&redirect_uri=https%3A%2F%2Fwww.larksuite.com%2Fnext%2Fmessenger';

assert.strictEqual(isLarkLoginPage(LANDED), true);
assert.strictEqual(isLarkLoginPage('https://abc.sg.larksuite.com/accounts/page/login'), true, 'trang đăng nhập của tenant');
assert.strictEqual(isLarkLoginPage('https://accounts.feishu.cn/accounts/page/login?x=1'), true);
for (const u of ['https://www.larksuite.com/next/messenger', 'https://passport.larksuite.com/suite/passport/page/login', 'https://accounts.larksuite.com.evil.io/accounts/page/login', 'http://accounts.larksuite.com/accounts/page/login', '', undefined])
  assert.strictEqual(isLarkLoginPage(u), false, 'không phải trang có công tắc QR: ' + u);
console.log('✓ isLarkLoginPage: chỉ trang /accounts/page/login trên host Lark (https)');

assert.strictEqual(loginViewFromUrl(LANDED), undefined, 'vắng tham số = chưa biết (Lark nhớ chế độ lần trước)');
const qr = loginUrlFor(LANDED, 'qr');
assert.strictEqual(new URL(qr).searchParams.get('loginType'), 'qrcode');
assert.strictEqual(new URL(qr).searchParams.get('redirect_uri'), 'https://www.larksuite.com/next/messenger', 'giữ nguyên redirect_uri');
assert.strictEqual(loginViewFromUrl(qr), 'qr');
const form = loginUrlFor(qr, 'form');
assert.strictEqual(new URL(form).searchParams.get('loginType'), 'account', 'về email phải GẮN account — xoá tham số thì Lark mở lại QR');
assert.strictEqual(loginViewFromUrl(form), 'form');
assert.strictEqual(loginUrlFor(loginUrlFor(qr, 'qr'), 'qr'), qr, 'gắn lại cùng chế độ không đổi URL (không tải vòng)');
assert.strictEqual(loginUrlFor('https://evil.com/accounts/page/login', 'qr'), 'https://evil.com/accounts/page/login', 'ngoài Lark: không đụng');
console.log('✓ loginUrlFor/loginViewFromUrl: qrcode ↔ account, giữ redirect_uri, không đổi khi đã đúng chế độ');
