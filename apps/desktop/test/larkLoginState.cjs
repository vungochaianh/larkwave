/**
 * "Đã đăng nhập Lark" phải đến từ tín hiệu THẬT (trang ứng dụng + cookie phiên), không phải
 * "đã tới một URL larksuite.com". Tín hiệu = câu trả lời "tôi là ai" của chính Lark (/space/api/user/). Lỗi cũ: trang quảng cáo www.larksuite.com/en_sg/ (nơi connect()
 * mở mặc định) được tính là đã đăng nhập — pill xanh khi chưa có phiên nào.
 *
 *   bash apps/desktop/test/run.sh
 */
const assert = require('node:assert');
const vm = require('node:vm');
const { classifyLarkPage, classifyWhoami, canProbeLogin, loginViewScript } = require('../.test-build/runtime/lark/larkLoginState.js');

const KINDS = [
  ['https://www.larksuite.com/en_sg/', 'public'],
  ['https://www.larksuite.com/', 'public'],
  ['https://www.larksuite.com/en_us/plans?from=navbar', 'public'],
  ['https://larksuite.com/product/base', 'public'],
  ['https://www.feishu.cn/', 'public'],
  ['https://open.larksuite.com/document', 'public'],
  ['https://www.larksuite.com/accounts/page/login?redirect_uri=x', 'login'],
  ['https://passport.larksuite.com/suite/passport/page/login', 'login'],
  ['https://abc.sg.larksuite.com/accounts/page/login', 'login'],
  ['https://www.larksuite.com/next/messenger', 'app'],
  ['https://lsgav2gopb4m.sg.larksuite.com/base/bascnXXXX?table=tbl1', 'app'],
  ['https://abc.larksuite.com/', 'app'],
  ['https://abc.feishu.cn/wiki/wikcnX', 'app'],
  ['https://larksuite.com.evil.io/base/x', 'other'],
  ['https://example.com/', 'other'],
  ['', 'other'],
];
for (const [u, k] of KINDS) assert.strictEqual(classifyLarkPage(u), k, `${u} → ${k}`);
console.log(`✓ classifyLarkPage: ${KINDS.length} URL (công khai / đăng nhập / ứng dụng / ngoài Lark)`);

// Đúng câu trả lời ĐO ĐƯỢC từ www.larksuite.com khi CHƯA đăng nhập (đã rút gọn).
const GUEST = { code: 0, msg: 'Success', data: { name: 'Guest User 66018', uid: '', suid: '7694260868808183235', is_Anonymous: true, user_type: '2', domain: 'www.larksuite.com', tenant_name: '' } };
const USER = { code: 0, msg: 'Success', data: { name: 'Nguyễn Văn A', uid: '7402000000000000001', suid: '7402000000000000001', is_Anonymous: false, domain: 'lsgav2gopb4m.sg.larksuite.com', tenant_name: 'ACME' } };
assert.deepStrictEqual(classifyWhoami(GUEST), { loggedIn: false, anonymous: true }, 'khách ẩn danh (HTTP 200, code 0) → CHƯA đăng nhập');
const u = classifyWhoami(USER);
assert.deepStrictEqual([u.loggedIn, u.anonymous, u.domain], [true, false, 'lsgav2gopb4m.sg.larksuite.com'], 'người dùng thật → đã đăng nhập + đúng shard');
assert.strictEqual(classifyWhoami({ code: 0, data: { name: 'x', uid: '' } }).loggedIn, false, 'không có uid → chưa (fail-closed)');
assert.strictEqual(classifyWhoami({ code: 0, data: { uid: '1', is_Anonymous: false, domain: 'evil.com/"x' } }).domain, undefined, 'domain lạ bị bỏ');
for (const bad of [null, 'html', { code: 4, msg: 'not login' }, { code: 0 }, { code: 0, data: null }])
  assert.strictEqual(classifyWhoami(bad).loggedIn, false, 'trả lời lạ/lỗi → chưa đăng nhập: ' + JSON.stringify(bad));
assert.strictEqual(classifyWhoami(null).anonymous, false, 'không trả lời ≠ ẩn danh (tránh báo "hết phiên" oan)');
// Dạng THẬT đo ngày 09/10/2026 trên tài khoản đã đăng nhập: uid rỗng, mã nằm ở suid/id.
const REAL = { code: 0, data: { uid: '', suid: '7400000000000000123', id: '7400000000000000123', is_Anonymous: false, domain: 'lsgav2gopb4m.sg.larksuite.com' } };
assert.strictEqual(classifyWhoami(REAL).loggedIn, true, 'uid rỗng nhưng có suid + không ẩn danh → ĐÃ đăng nhập');
assert.strictEqual(classifyWhoami(REAL).domain, 'lsgav2gopb4m.sg.larksuite.com');
assert.strictEqual(classifyWhoami(GUEST).loggedIn, false, 'khách có suid nhưng ẩn danh → vẫn chưa');
console.log('✓ classifyWhoami: khách ẩn danh / thiếu uid / lỗi → chưa đăng nhập; chỉ người dùng thật mới tính');

assert.strictEqual(canProbeLogin('https://www.larksuite.com/en_sg/'), true);
assert.strictEqual(canProbeLogin('https://www.larksuite.com/accounts/page/login'), false, 'đang ở trang đăng nhập → chờ, không kết luận');
assert.strictEqual(canProbeLogin('https://evil.com/'), false);
console.log('✓ canProbeLogin: chỉ hỏi Lark khi ở trang Lark và không phải trang đăng nhập');

// ── loginViewScript: bật mã QR trên trang đăng nhập (nút của Lark bị giấu khi khung hẹp) ──────────
// DOM giả: công tắc ĐẢO chế độ mỗi lần bấm, đúng như nút thật — nên bấm thừa một lần là tắt mất QR.
function fakeLoginPage({ qr = false, hasSwitch = true, lateSwitchMs = 0 } = {}) {
  const st = { qr, clicks: 0, t0: Date.now(), everQr: qr };
  const sw = { click: () => { st.clicks++; st.qr = !st.qr; st.everQr = st.everQr || st.qr; } };
  // Như trang thật: canvas QR (184px) có từ lần đầu bật QR và GIỮ NGUYÊN cỡ khi bảng email đè lên;
  // chỉ phần tử trên cùng tại tâm nó mới cho biết bảng nào đang hiện.
  const scanBox = { contains: (el) => el === qrCanvas };
  const qrCanvas = { getBoundingClientRect: () => ({ left: 148, top: 243, width: 184, height: 184 }), closest: () => scanBox };
  const formField = {};
  const icon = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 24, height: 24 }), closest: () => null };
  const document = {
    querySelector: (sel) => (hasSwitch && Date.now() - st.t0 >= lateSwitchMs && /switch-login-mode-box/.test(sel) ? sw : null),
    querySelectorAll: () => [icon, ...(st.everQr ? [qrCanvas] : [])],
    elementFromPoint: () => (st.qr ? qrCanvas : formField),
  };
  return { st, run: (want) => vm.runInNewContext(loginViewScript(want), { document, setTimeout, innerWidth: 480, innerHeight: 900 }) };
}
(async () => {
  let p = fakeLoginPage();
  assert.strictEqual(await p.run('qr'), 'qr', 'ô email → bật QR');
  assert.strictEqual(p.st.clicks, 1);
  assert.strictEqual(await p.run('qr'), 'qr', 'đã ở QR → giữ nguyên');
  assert.strictEqual(p.st.clicks, 1, 'đã ở QR thì KHÔNG bấm (bấm là công tắc, sẽ tắt QR)');
  assert.strictEqual(await p.run('form'), 'form', 'QR → về ô email/SSO (canvas QR vẫn còn nguyên cỡ, bị bảng email đè)');
  assert.strictEqual(p.st.clicks, 2);
  assert.strictEqual(await p.run('form'), 'form', 'đã ở email → giữ nguyên');
  assert.strictEqual(p.st.clicks, 2, 'canvas QR còn trong DOM không được làm nó tưởng đang ở QR rồi bấm');
  assert.strictEqual(await p.run('probe'), 'form', 'probe chỉ đọc');
  assert.strictEqual(p.st.clicks, 2, 'probe không bấm');
  p = fakeLoginPage({ hasSwitch: false });
  assert.strictEqual(await p.run('qr'), '', 'trang không có nút chuyển (SSO…) → rỗng, không đoán');
  p = fakeLoginPage({ lateSwitchMs: 600 });
  assert.strictEqual(await p.run('qr'), 'qr', 'nút chuyển hiện SAU khi trang tải xong → vẫn chờ được');
  assert.strictEqual(p.st.clicks, 1);
  console.log('✓ loginViewScript: bật/tắt QR đúng một lần, probe không bấm, chờ nút vẽ muộn, trang không có nút → rỗng');
})();
