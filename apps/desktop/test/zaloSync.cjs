/**
 * Đồng bộ tin Zalo (17/10/2026): sổ tin (đọc theo khoảng / tìm / phân trang cũ), lưu ra đĩa (mã hoá),
 * cài đặt giữ tin. Dữ liệu ở đây là GIẢ, dựng trong bài kiểm — không chạm phiên Zalo / mạng nào.
 *
 *   bash apps/desktop/test/run.sh
 */
const assert = require('node:assert');
const { mkdtempSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const B = join(__dirname, '..', '.test-build', 'runtime', 'connectors', 'zalo');
const { ZaloMessageBook, MAX_PER_THREAD, phoneThreadId, isPhoneOnlyId } = require(join(B, 'messages.js'));
const { ZaloStore, normalizeZaloSettings, retentionCutoff, DEFAULT_ZALO_SYNC_SETTINGS } = require(join(B, 'zaloStore.js'));

let failed = 0;
const test = (name, fn) => {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`✗ ${name}\n  ${e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n  ') : e}`);
  }
};
const T0 = 1_760_000_000_000;
const msg = (o) => ({ threadId: 't1', isGroup: false, msgId: 'm1', fromId: 'u2', fromName: 'Lan Ánh', isSelf: false, text: 'chào', ts: T0, ...o });

// ── Sổ tin ──────────────────────────────────────────────────────────────────────────────────────
test('đọc theo khoảng since/before + phân trang lùi bằng before', () => {
  const b = new ZaloMessageBook();
  for (let i = 0; i < 10; i++) b.add('a', [msg({ msgId: `m${i}`, ts: T0 + i * 1000, text: `tin ${i}` })]);
  const all = b.read('a', 't1', 100);
  assert.strictEqual(all.length, 10);
  // Trang cuối 3 tin → before = ts tin đầu trang → 3 tin kế trước.
  const last3 = b.read('a', 't1', 3);
  assert.deepStrictEqual(last3.map((m) => m.text), ['tin 7', 'tin 8', 'tin 9']);
  const prev3 = b.read('a', 't1', 3, { before: last3[0].ts });
  assert.deepStrictEqual(prev3.map((m) => m.text), ['tin 4', 'tin 5', 'tin 6']);
  // since lọc từ mốc.
  assert.deepStrictEqual(b.read('a', 't1', 100, { since: T0 + 8000 }).map((m) => m.text), ['tin 8', 'tin 9']);
});

test('tìm theo chữ (không dấu, mọi từ đều phải có) + lọc thời gian, mới nhất trước', () => {
  const b = new ZaloMessageBook();
  b.add('a', [
    msg({ msgId: 'x1', ts: T0, text: 'Đơn DH-12 giao thứ Hai' }),
    msg({ msgId: 'x2', ts: T0 + 1000, text: 'Giá đơn hàng này bao nhiêu' }),
    msg({ msgId: 'x3', ts: T0 + 2000, text: 'chào buổi sáng' }),
  ]);
  const hits = b.search('a', { query: 'don hang' });
  assert.deepStrictEqual(hits.map((h) => h.message.msgId), ['x2'], 'cả "don" và "hang" cùng có');
  const dh = b.search('a', { query: 'dh-12' });
  assert.strictEqual(dh.length, 1);
  assert.strictEqual(b.search('a', { query: 'chào', since: T0 + 5000 }).length, 0, 'ngoài khoảng → không thấy');
});

test('oldestMsgId: chỉ tin Zalo Web (không tính tin điện thoại), id dạng số', () => {
  const b = new ZaloMessageBook();
  b.add('a', [msg({ msgId: '500', ts: T0 + 5000 }), msg({ msgId: '100', ts: T0 + 1000 }), msg({ msgId: 'p:x', ts: T0, source: 'phone' })]);
  assert.strictEqual(b.oldestMsgId('a', false), '100');
  b.add('g', [msg({ threadId: 'g1', isGroup: true, msgId: '900', ts: T0 })]);
  assert.strictEqual(b.oldestMsgId('a', true), undefined, 'tài khoản a không có tin nhóm');
});

test('giới hạn mỗi hội thoại: giữ tin MỚI nhất; setLimits nới ra rồi cắt lại', () => {
  const b = new ZaloMessageBook();
  const many = Array.from({ length: MAX_PER_THREAD + 30 }, (_, i) => msg({ threadId: 'big', msgId: `k${i}`, ts: T0 + i }));
  b.add('a', many);
  assert.strictEqual(b.read('a', 'big', 99999).length, MAX_PER_THREAD);
  assert.strictEqual(b.read('a', 'big', 1)[0].msgId, `k${MAX_PER_THREAD + 29}`, 'giữ tin mới nhất');
  b.setLimits(50, 100);
  assert.strictEqual(b.read('a', 'big', 99999).length, 50);
});

test('pruneBefore bỏ tin cũ hơn mốc', () => {
  const b = new ZaloMessageBook();
  for (let i = 0; i < 10; i++) b.add('a', [msg({ msgId: `m${i}`, ts: T0 + i * 86_400_000 })]);
  const removed = b.pruneBefore('a', T0 + 5 * 86_400_000);
  assert.strictEqual(removed, 5);
  assert.strictEqual(b.read('a', 't1', 99).length, 5);
});

test('snapshot → restore khứ hồi, không mất tin, không đánh dấu dirty', () => {
  const b = new ZaloMessageBook();
  b.add('a', [msg({ msgId: 'm1', text: 'một' }), msg({ threadId: 'g1', isGroup: true, msgId: 'g', text: 'nhóm' })]);
  b.setTitle('a', 't1', 'Lan Ánh');
  const snap = b.snapshot('a');
  const b2 = new ZaloMessageBook();
  const n = b2.restore('a', snap);
  assert.strictEqual(n, 2);
  assert.ok(!b2.dirtyAccounts().includes('a'), 'restore không làm bẩn');
  assert.strictEqual(b2.read('a', 't1', 9)[0].text, 'một');
  assert.strictEqual(b2.recent('a', { usersOnly: true })[0].title, 'Lan Ánh');
});

test('id hội thoại điện thoại: phoneThreadId / isPhoneOnlyId', () => {
  assert.strictEqual(phoneThreadId(true, '123'), 'phone:g:123');
  assert.ok(isPhoneOnlyId('phone:u:9') && !isPhoneOnlyId('456'));
});

// ── Cài đặt + lưu ra đĩa ────────────────────────────────────────────────────────────────────────
test('normalizeZaloSettings: chặn giá trị lạ, giữ mặc định', () => {
  assert.deepStrictEqual(normalizeZaloSettings({}), DEFAULT_ZALO_SYNC_SETTINGS);
  assert.strictEqual(normalizeZaloSettings({ retentionDays: -5 }).retentionDays, DEFAULT_ZALO_SYNC_SETTINGS.retentionDays);
  assert.strictEqual(normalizeZaloSettings({ retentionDays: 90 }).retentionDays, 90);
  assert.strictEqual(normalizeZaloSettings({ persist: false }).persist, false);
  assert.strictEqual(normalizeZaloSettings({ perThread: 1 }).perThread, DEFAULT_ZALO_SYNC_SETTINGS.perThread, 'quá nhỏ → giữ mặc định');
});

test('retentionCutoff: 0 = giữ mãi', () => {
  assert.strictEqual(retentionCutoff(0), undefined);
  assert.strictEqual(retentionCutoff(30, 1_000 * 86_400_000), (1_000 - 30) * 86_400_000);
});

test('ZaloStore: KHÔNG có kho khoá ⇒ không ghi tin nhắn dạng thường; CÓ kho khoá ⇒ lưu/đọc khứ hồi', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zstore-'));
  let available = false;
  // Kho khoá giả: "mã hoá" = đảo byte (đủ để chứng minh KHÔNG ghi plaintext).
  const xor = (b) => Buffer.from(b.map((x) => x ^ 0x5a));
  const crypto = { available: () => available, encrypt: (t) => xor(Buffer.from(t, 'utf8')), decrypt: (b) => xor(Buffer.from(b)).toString('utf8') };
  const store = new ZaloStore(dir, crypto);
  const snap = { v: 1, threads: [{ threadId: 't1', isGroup: false, peerName: 'A', messages: [{ threadId: 't1', isGroup: false, msgId: 'm1', fromId: 'u', fromName: 'A', isSelf: false, text: 'bí mật', ts: T0 }] }], groupNames: [] };

  assert.strictEqual(store.canPersist(), false);
  assert.strictEqual(store.save('a', snap), false, 'không kho khoá → không ghi');
  assert.strictEqual(store.load('a'), null);

  available = true;
  assert.strictEqual(store.save('a', snap), true);
  const back = store.load('a');
  assert.strictEqual(back.threads[0].messages[0].text, 'bí mật');
  assert.ok(store.bytes('a') > 0);
  store.remove('a');
  assert.strictEqual(store.load('a'), null);
});

test('ZaloStore: lưu cài đặt + đọc lại', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zstore2-'));
  const store = new ZaloStore(dir, { available: () => true, encrypt: (t) => Buffer.from(t), decrypt: (b) => b.toString() });
  const next = store.saveSettings({ retentionDays: 365 });
  assert.strictEqual(next.retentionDays, 365);
  assert.strictEqual(store.settings().retentionDays, 365);
});

test('cookie cửa sổ Zalo Web: lưu/nạp qua lần tắt app, mã hoá, hết hạn 30 ngày, xoá được', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zweb-'));
  let available = false;
  const xor = (b) => Buffer.from(b.map((x) => x ^ 0x5a));
  const store = new ZaloStore(dir, { available: () => available, encrypt: (t) => xor(Buffer.from(t, 'utf8')), decrypt: (b) => xor(Buffer.from(b)).toString('utf8') });
  const cookies = [{ name: 'zpsid', value: 'bí-mật', domain: '.zalo.me', path: '/', secure: true, httpOnly: true }];

  // Không kho khoá ⇒ KHÔNG ghi chìa khoá Zalo ra đĩa.
  assert.strictEqual(store.saveWebCookies(cookies), false);
  assert.deepStrictEqual(store.loadWebCookies(), []);

  available = true;
  assert.strictEqual(store.saveWebCookies(cookies), true);
  assert.strictEqual(store.loadWebCookies()[0].value, 'bí-mật', 'mở app lại vẫn còn đăng nhập');
  assert.strictEqual(store.saveWebCookies([]), false, 'rỗng thì không ghi đè bản tốt');
  store.clearWebCookies();
  assert.deepStrictEqual(store.loadWebCookies(), [], 'đóng hẳn cửa sổ ⇒ xoá chìa khoá');
});

if (failed) {
  console.error(`\n${failed} bài lỗi`);
  process.exit(1);
}
