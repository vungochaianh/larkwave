/**
 * Chế độ "dữ liệu chỉ trên máy" (0.1.25) — dùng Larkwave không cần tài khoản, không gửi gì lên máy chủ.
 *   1. Cờ do main giữ trong <userData>/local-mode.json: mặc định TẮT, bật thì ghi tệp và còn sau khi khởi động lại.
 *   2. LARKWAVE_LOCAL_ONLY=1 (bản tự dựng từ mã nguồn mở) cưỡng bức BẬT — giao diện không tắt được, không ghi tệp.
 *   3. Tệp hỏng ⇒ coi như TẮT (không làm app kẹt ở một chế độ lạ).
 *   4. Mọi cửa ra máy chủ ở main đều qua chốt localModeOn(): accountFetch/accountUpload, token, relay, code-push.
 *
 *   bash apps/desktop/test/run.sh
 */
const assert = require('node:assert');
const Module = require('node:module');
const { mkdtempSync, writeFileSync, readFileSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

let userData = mkdtempSync(join(tmpdir(), 'lw-local-'));
const orig = Module._load;
Module._load = function (req) {
  if (req === 'electron') return { app: { getPath: () => userData } };
  return orig.apply(this, arguments);
};

const B = join(__dirname, '..', '.test-build');
const MOD = join(B, 'localMode.js');
/** Nạp lại module như một lần khởi động app mới (bộ nhớ đệm cờ bị xoá). */
function fresh() { delete require.cache[require.resolve(MOD)]; return require(MOD); }

let n = 0, fail = 0;
function t(name, fn) {
  try { fn(); n++; console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '\n     ', e.message); }
}

delete process.env.LARKWAVE_LOCAL_ONLY;

t('mặc định TẮT khi chưa có tệp cờ', () => {
  const L = fresh();
  assert.deepStrictEqual(L.localModeState(), { on: false, forced: false });
});

t('bật → ghi tệp, và vẫn BẬT sau khi "khởi động lại"', () => {
  let L = fresh();
  assert.deepStrictEqual(L.setLocalMode(true), { on: true, forced: false });
  const f = join(userData, 'local-mode.json');
  assert.ok(existsSync(f));
  assert.strictEqual(JSON.parse(readFileSync(f, 'utf8')).on, true);
  L = fresh();
  assert.strictEqual(L.localModeOn(), true);
  L.setLocalMode(false);
  assert.strictEqual(fresh().localModeOn(), false);
});

t('tệp cờ hỏng ⇒ TẮT', () => {
  writeFileSync(join(userData, 'local-mode.json'), '{hỏng');
  assert.strictEqual(fresh().localModeOn(), false);
});

t('LARKWAVE_LOCAL_ONLY=1 cưỡng bức BẬT: không tắt được, không ghi tệp', () => {
  userData = mkdtempSync(join(tmpdir(), 'lw-local-'));
  process.env.LARKWAVE_LOCAL_ONLY = '1';
  try {
    const L = fresh();
    assert.deepStrictEqual(L.localModeState(), { on: true, forced: true });
    assert.deepStrictEqual(L.setLocalMode(false), { on: true, forced: true });
    assert.ok(!existsSync(join(userData, 'local-mode.json')), 'không được ghi tệp khi bị cưỡng bức');
    assert.strictEqual(L.localModeForced({ LARKWAVE_LOCAL_ONLY: '0' }), false);
  } finally {
    delete process.env.LARKWAVE_LOCAL_ONLY;
  }
});

t('phản hồi chặn có cùng khuôn lỗi mạng (status 0) và mã LOCAL_MODE', () => {
  const { LOCAL_MODE_BLOCKED: b } = fresh();
  assert.strictEqual(b.ok, false);
  assert.strictEqual(b.status, 0);
  assert.strictEqual(JSON.parse(b.text).code, 'LOCAL_MODE');
});

t('main: mọi cửa ra máy chủ đều qua chốt localModeOn()', () => {
  const bg = readFileSync(join(__dirname, '..', 'main', 'background.ts'), 'utf8');
  const ad = readFileSync(join(__dirname, '..', 'main', 'runtime', 'localAdapter.ts'), 'utf8');
  const has = (src, re, what) => assert.ok(re.test(src), 'thiếu chốt: ' + what);
  has(bg, /accountGetToken,[^\n]*localModeOn\(\)\s*\?\s*null/, 'accountGetToken trả null');
  assert.ok((bg.match(/if \(localModeOn\(\)\) return LOCAL_MODE_BLOCKED/g) || []).length >= 2, 'thiếu chốt: accountFetch + accountUpload');
  has(bg, /if \(!localModeOn\(\)\) agentClient\.bootstrap\(\)/, 'relay không tự bật');
  has(bg, /agentSetEnabled[^\n]*on && localModeOn\(\)/, 'không cho bật relay');
  has(bg, /if \(!localModeOn\(\)\) target = \(await resolveRenderer/, 'không hỏi manifest code-push');
  assert.ok((bg.match(/!isProd \|\| localModeOn\(\)/g) || []).length >= 2, 'thiếu chốt: checkUpdate + applyUpdate');
  has(ad, /setAccountTokenGetter\(\(\) => \(localModeOn\(\) \? null/, 'lõi Lark không có token tài khoản');
});

console.log(`localMode: ${n} đạt, ${fail} hỏng`);
process.exit(fail ? 1 : 0);
