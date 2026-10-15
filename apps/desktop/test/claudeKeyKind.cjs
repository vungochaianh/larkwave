/**
 * Khoá Anthropic theo tiền tố (claudeKeyKind.ts). Lỗi thật 15/10/2026: Console cấp API key dạng mới
 * `sk-ant-usr-…`, app từ chối ngay vì chỉ nhận `sk-ant-api…`. Khoá dưới đây là GIẢ, dựng cho kiểm thử.
 *
 *   bash apps/desktop/test/run.sh
 */
const assert = require('node:assert');
const { join } = require('node:path');
const K = require(join(__dirname, '..', '.test-build', 'runtime', 'claudeKeyKind.js'));
const fake = (prefix) => prefix + 'Ab3_' + 'x'.repeat(90) + '-yz';

let failed = 0;
const test = (name, fn) => {
  try { fn(); console.log(`✓ ${name}`); } catch (e) { failed++; console.error(`✗ ${name}\n  ${e.message}`); }
};

test('API key: dạng cũ sk-ant-api03-… VÀ dạng mới sk-ant-usr-… đều nhận', () => {
  assert.strictEqual(K.claudeKeyKind(fake('sk-ant-api03-')), 'api');
  assert.strictEqual(K.claudeKeyKind(fake('sk-ant-usr-')), 'api');
  assert.strictEqual(K.claudeKeyKind('  ' + fake('sk-ant-usr-') + '\n'), 'api', 'dán kèm khoảng trắng / xuống dòng');
  assert.ok(K.isAnthropicApiKey(fake('sk-ant-usr-')));
  assert.strictEqual(K.claudeKeyKind(fake('sk-ant-key07-')), 'api', 'dạng mới sau này: để lần gọi API phán quyết');
});

test('token đăng nhập (oat) không phải API key — câu báo chỉ đúng chỗ dán', () => {
  assert.strictEqual(K.claudeKeyKind(fake('sk-ant-oat01-')), 'oauth');
  assert.ok(!K.isAnthropicApiKey(fake('sk-ant-oat01-')));
  assert.match(K.notApiKeyMessage(fake('sk-ant-oat01-')), /token đăng nhập cá nhân.*Kết nối Claude/);
});

test('admin key / refresh / phiên không phải API key', () => {
  for (const p of ['sk-ant-admin01-', 'sk-ant-ort01-', 'sk-ant-sid01-', 'sk-ant-si-', 'sk-ant-cc-', 'sk-ant-ccsr-']) {
    assert.strictEqual(K.claudeKeyKind(fake(p)), 'other-anthropic', p);
  }
  assert.match(K.notApiKeyMessage(fake('sk-ant-admin01-')), /không phải API key/);
});

test('không phải khoá Anthropic', () => {
  for (const s of ['', 'abc', 'sk-proj-xyz', 'AIzaSyFake', 'sk-ant-', 'sk-ant-api']) assert.strictEqual(K.claudeKeyKind(s), 'not-anthropic', JSON.stringify(s));
  assert.match(K.notApiKeyMessage('abc'), /sk-ant-usr-/);
});

if (failed) { console.error(`\n${failed} bài lỗi`); process.exit(1); }
