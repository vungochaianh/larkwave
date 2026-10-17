/**
 * Kiểm API key Anthropic (packages/core anthropicKeyCheck). Lỗi thật 17/10/2026: key mới tạo → "Không kiểm
 * tra được key (HTTP 400)" — thật ra là tài khoản chưa nạp credit, key ĐÚNG. Khoá dưới đây là GIẢ.
 *
 *   bash apps/desktop/test/run.sh
 */
const assert = require('node:assert');
const { join } = require('node:path');
const K = require(join(__dirname, '..', '..', '..', 'packages', 'core', 'dist', 'anthropicKeyCheck.js'));

const res = (status, body) => ({ status, ok: status >= 200 && status < 300, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
const CREDIT = { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.' } };
let failed = 0;
const pending = [];
const test = (name, fn) => pending.push(Promise.resolve().then(fn).then(() => console.log(`✓ ${name}`), (e) => { failed++; console.error(`✗ ${name}\n  ${e.stack.split('\n').slice(0, 3).join('\n  ')}`); }));

test('khoá sai: /v1/models trả 401 ⇒ ok:false, không gọi thử /messages', async () => {
  const calls = [];
  const r = await K.checkAnthropicKey('sk-ant-usr-fake', async (u, i) => (calls.push(u), res(401, { error: { message: 'invalid x-api-key' } })));
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /không hợp lệ/);
  assert.deepStrictEqual(calls.length, 1);
});

test('HẾT CREDIT: key vẫn ĐÚNG (ok:true) + cảnh báo nạp tiền; chọn model rẻ nhất (haiku)', async () => {
  const seen = [];
  const r = await K.checkAnthropicKey('sk-ant-usr-fake', async (u, i) => {
    seen.push({ u, i });
    if (u.includes('/models')) return res(200, { data: [{ id: 'claude-opus-5-5' }, { id: 'claude-sonnet-5-5' }, { id: 'claude-haiku-5-5' }] });
    return res(400, CREDIT);
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.model, 'claude-haiku-5-5');
  assert.match(r.warning, /Key ĐÚNG[\s\S]*credit[\s\S]*Billing/);
  assert.strictEqual(JSON.parse(seen[1].i.body).model, 'claude-haiku-5-5');
  assert.strictEqual(seen[1].i.headers['x-api-key'], 'sk-ant-usr-fake');
});

test('dùng được: /messages 200 ⇒ ok, không cảnh báo; gọi từ giao diện có header CORS', async () => {
  let headers;
  const r = await K.checkAnthropicKey('k', async (u, i) => ((headers = i.headers), u.includes('/models') ? res(200, { data: [{ id: 'claude-sonnet-5-5' }] }) : res(200, {})), { browser: true });
  assert.deepStrictEqual([r.ok, r.model, r.warning], [true, 'claude-sonnet-5-5', undefined]);
  assert.strictEqual(headers['anthropic-dangerous-direct-browser-access'], 'true');
});

test('lỗi khác ở /models giữ nguyên câu của Anthropic; lỗi mạng nói rõ', async () => {
  const r1 = await K.checkAnthropicKey('k', async () => res(400, { error: { message: 'Bad thing' } }));
  assert.deepStrictEqual([r1.ok, r1.error], [false, 'Không kiểm tra được key (HTTP 400): Bad thing']);
  const r2 = await K.checkAnthropicKey('k', async () => { throw new Error('ENOTFOUND'); });
  assert.match(r2.error, /Lỗi mạng[\s\S]*ENOTFOUND/);
  assert.strictEqual(K.anthropicErrorMessage('không phải json'), 'không phải json');
  assert.match(K.explainAnthropicUsage(429, 'rate limited'), /giới hạn tần suất/);
});

Promise.all(pending).then(() => { if (failed) { console.error(`\n${failed} bài lỗi`); process.exit(1); } });
