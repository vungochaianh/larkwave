/**
 * "Trợ lý kiểm tra" + sửa một chạm (packages/ui/src/components/fix/fixRules.ts). Người dùng muốn (17/10/2026):
 * không bắt lần vào Cài đặt — kiểm trước, báo ngay, mở thẳng modal (quét QR, dán key…). Trợ lý chạy bằng
 * LUẬT, không gọi AI; chỉ lỗi CHẮC làm hỏng lượt chat mới được bật thông báo.
 *
 *   bash apps/desktop/test/run.sh
 */
const assert = require('node:assert');
const { join } = require('node:path');
const F = require(join(__dirname, '..', '.test-build', 'ui-fix', 'fixRules.js'));

let failed = 0;
const test = (name, fn) => { try { fn(); console.log(`✓ ${name}`); } catch (e) { failed++; console.error(`✗ ${name}\n  ${e.stack.split('\n').slice(0, 3).join('\n  ')}`); } };
const R = (o) => ({ id: 'claude', label: 'Claude CLI', installed: true, loggedIn: true, ready: true, ...o });
const base = { runners: [R(), R({ id: 'gemini', label: 'Gemini CLI', loggedIn: false })], activeRunner: 'claude', runSource: 'cli' };

test('máy sẵn sàng ⇒ không có lỗi chặn; Zalo/Gmail chưa nối chỉ là "tuỳ chọn" (không bao giờ bật thông báo)', () => {
  const r = F.healthIssues({ ...base, zalo: { connected: false }, gmail: { connected: true } });
  assert.deepStrictEqual(r.map((x) => [x.id, x.level, x.fix]), [['zalo', 'info', 'zalo']]);
});

test('runner đang dùng chưa cài / chưa đăng nhập ⇒ lỗi, mở thẳng modal đúng chỗ', () => {
  const a = F.healthIssues({ ...base, runners: [R({ installed: false, loggedIn: false })] });
  assert.deepStrictEqual([a[0].level, a[0].fix], ['error', 'runner:claude'], 'chưa cài ⇒ hướng dẫn cài');
  const b = F.healthIssues({ ...base, runners: [R({ loggedIn: false })] });
  assert.deepStrictEqual([b[0].level, b[0].fix], ['error', 'claude'], 'Claude chưa đăng nhập ⇒ modal Kết nối Claude');
  const c = F.healthIssues({ ...base, activeRunner: 'gemini' });
  assert.deepStrictEqual([c[0].title, c[0].fix], ['Gemini chưa đăng nhập', 'runner:gemini']);
  assert.deepStrictEqual(F.healthIssues({ ...base, runSource: 'maic', runners: [R({ installed: false })] }), [], 'chạy bằng gói Larkwave thì CLI không liên quan');
});

test('chọn "API key riêng" mà chưa có key ⇒ lỗi mở thẳng quản lý key; key đang dùng bị Anthropic từ chối ⇒ cảnh báo', () => {
  const a = F.healthIssues({ ...base, runSource: 'api', apiKeyReady: false });
  assert.deepStrictEqual([a[0].level, a[0].fix], ['error', 'claudeKeys']);
  const b = F.healthIssues({ ...base, claudeKeys: { keys: [{ active: true, valid: false }] } });
  assert.deepStrictEqual([b[0].id, b[0].level, b[0].fix], ['claude-key-invalid', 'warn', 'claudeKeys']);
});

test('lỗi công cụ "chưa kết nối" ⇒ modal kết nối; lệnh /zalo-… /gmail-… nhận ra kết nối cần có', () => {
  assert.strictEqual(F.fixTargetForToolError('Chưa kết nối Zalo. Mở Kỹ năng → Kết nối → Zalo và quét mã QR…'), 'zalo');
  assert.strictEqual(F.fixTargetForToolError('Zalo (Lan) đang mất kết nối — mở Kỹ năng → Kết nối Zalo để đăng nhập lại bằng QR.'), 'zalo');
  assert.strictEqual(F.fixTargetForToolError('Gmail từ chối đăng nhập: cần MẬT KHẨU ỨNG DỤNG…'), 'gmail');
  assert.strictEqual(F.fixTargetForToolError('Agent không tự thao tác Zalo: `zalo_send_text` chỉ chạy trong một KỸ NĂNG…'), null, 'lỗi chốt kỹ năng không phải lỗi kết nối');
  assert.strictEqual(F.fixTargetForToolError('HTTP 500'), null);
  assert.strictEqual(F.connectorForPrompt('/zalo-gui-tin nhắn anh Nam'), 'zalo');
  assert.strictEqual(F.connectorForPrompt('  /gmail-doc-thu thư hoá đơn'), 'gmail');
  assert.strictEqual(F.connectorForPrompt('đọc zalo giúp'), null, 'câu tự nhiên: để kỹ năng/công cụ tự báo');
});

if (failed) { console.error(`\n${failed} bài lỗi`); process.exit(1); }
