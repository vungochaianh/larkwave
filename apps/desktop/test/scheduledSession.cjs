/**
 * Một LỊCH = MỘT hội thoại, mỗi lần chạy là một lượt mới trong đó.
 *
 * Trước đây mỗi lần lịch chạy lại tạo một hội thoại MỚI (id ngẫu nhiên). Một lịch chạy hằng ngày
 * đẻ ra 30 hội thoại một tháng — cùng tên, cùng một câu hỏi — và hội thoại thật của người dùng bị
 * đẩy xuống dưới đống rác đó. Đây chính là triệu chứng "tự động tạo hội thoại mới" người dùng báo.
 */
const assert = require('node:assert');
const { mkdtempSync, existsSync, readFileSync, readdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const Module = require('node:module');
const home = mkdtempSync(join(tmpdir(), 'tw-sess-'));
const orig = Module._load;
Module._load = function (req) {
  if (req === 'electron') {
    return {
      app: { getPath: () => home, getVersion: () => '1.0.0' },
      safeStorage: { isEncryptionAvailable: () => false },
      Notification: class { show() {} static isSupported() { return false; } },
    };
  }
  return orig.apply(this, arguments);
};
const { LarkService } = require('../.test-build/runtime/lark/larkService.js');

(async () => {
  const svc = new LarkService(home);
  const save = LarkService.prototype.saveScheduledResult;
  assert.ok(typeof save === 'function', 'saveScheduledResult phải tồn tại');

  let pass = 0;
  const t = (name, cond) => { assert.ok(cond, name); pass += 1; console.log('  ✓', name); };

  // Ba lần chạy của CÙNG một lịch.
  await save.call(svc, 'rule-1', 'PBTTCN', 'doi chieu cong no', 'ket qua lan 1');
  await save.call(svc, 'rule-1', 'PBTTCN', 'doi chieu cong no', 'ket qua lan 2');
  await save.call(svc, 'rule-1', 'PBTTCN', 'doi chieu cong no', 'ket qua lan 3');
  // Và một lịch KHÁC.
  await save.call(svc, 'rule-2', 'Doanh thu', 'bao cao doanh thu', 'ket qua khac');

  const dir = svc.sessionsDir();
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  t('3 lần chạy của một lịch ⇒ chỉ 1 tệp hội thoại (trước đây là 3)', files.filter((f) => f.startsWith('sched-rule-1')).length === 1);
  t('hai lịch khác nhau ⇒ hai hội thoại riêng', files.length === 2);

  const s1 = JSON.parse(readFileSync(join(dir, 'sched-rule-1.json'), 'utf8'));
  t('cả 3 lần chạy đều nằm trong đó (3 lượt × 2 tin = 6)', s1.items.length === 6);
  t('kết quả lần đầu vẫn còn', JSON.stringify(s1.items).includes('ket qua lan 1'));
  t('kết quả mới nhất ở cuối', s1.items[s1.items.length - 1].text === 'ket qua lan 3');
  t('createdAt giữ nguyên của lần đầu', s1.createdAt <= s1.updatedAt);
  t('agentSessionId ổn định qua các lần chạy', typeof s1.agentSessionId === 'string' && s1.agentSessionId.length > 0);

  // Chạy nhiều để kiểm chốt chặn cắt bớt.
  for (let i = 0; i < 30; i += 1) await save.call(svc, 'rule-3', 'Nhieu', 'p', `r${i}`);
  const s3 = JSON.parse(readFileSync(join(dir, 'sched-rule-3.json'), 'utf8'));
  t('chạy 30 lần vẫn chỉ 1 hội thoại, và bị cắt ở 40 lượt', s3.items.length === 40);
  t('cắt từ ĐẦU nên lần chạy mới nhất còn nguyên', s3.items[s3.items.length - 1].text === 'r29');

  // ── Ba lỗi của chính bản vá này, do lượt soát tìm ra ───────────────────────
  console.log('\ncác bẫy của id ỔN ĐỊNH (id ngẫu nhiên thì không có)');

  // 1) Ghi đè bằng danh sách khoá cố định ⇒ xoá sạch ghi chú + tóm tắt của người dùng.
  const p1 = join(dir, 'sched-rule-9.json');
  await save.call(svc, 'rule-9', 'R', 'p', 'lan 1');
  const s9a = JSON.parse(readFileSync(p1, 'utf8'));
  s9a.notes = { text: 'ghi chu cua toi', updatedAt: new Date().toISOString() };
  s9a.summaries = { 'x': 'tom tat da ton tien sinh ra' };
  require('node:fs').writeFileSync(p1, JSON.stringify(s9a));
  await save.call(svc, 'rule-9', 'R', 'p', 'lan 2');
  const s9b = JSON.parse(readFileSync(p1, 'utf8'));
  t('ghi chú người dùng còn nguyên sau lần chạy kế', s9b.notes && s9b.notes.text === 'ghi chu cua toi');
  t('tóm tắt AI không bị xoá', s9b.summaries && s9b.summaries.x);

  // 2) Bia mộ: xoá hội thoại lịch một lần ⇒ báo cáo sau đó bị đồng bộ xoá im lặng 180 ngày.
  await svc.larkDeleteSession('sched-rule-9');
  const dpath = svc.deletedPathFor(svc.currentUserId ?? null);
  const tomb1 = JSON.parse(readFileSync(dpath, 'utf8'));
  t('xoá hội thoại có ghi bia mộ (đúng, để máy khác xoá theo)', tomb1['sched-rule-9'] !== undefined);
  await save.call(svc, 'rule-9', 'R', 'p', 'lan 3');
  const tomb2 = JSON.parse(readFileSync(dpath, 'utf8'));
  t('lần chạy sau GỠ bia mộ — nếu không, báo cáo mới bị xoá lặng lẽ suốt 180 ngày', tomb2['sched-rule-9'] === undefined);
  t('và hội thoại được tạo lại', existsSync(p1));

  // 3) Mỗi lượt phải có mốc thời gian, nếu không đồng bộ sẽ xếp lượt cũ xuống dưới lượt mới.
  const s9c = JSON.parse(readFileSync(p1, 'utf8'));
  t('mỗi tin nhắn có ts', s9c.items.every((it) => typeof it.ts === 'number'));
  t('ts tăng dần', s9c.items.every((it, i, a) => i === 0 || a[i - 1].ts <= it.ts));

  // ── Phạm vi Base của lượt chạy theo lịch ─────────────────────────────────
  console.log('\nphạm vi Base (đo thật: một lịch cần 1 Base lại được cấp cả 40)');
  const scope = LarkService.prototype.basesForPrompt;
  assert.ok(typeof scope === 'function', 'basesForPrompt phải tồn tại');
  const fakeStore = [
    { appToken: 'tok_dung', name: 'Base Test' },
    { appToken: 'tok_khac1', name: 'Kế toán' },
    { appToken: 'tok_khac2', name: 'Nhân sự' },
  ];
  const svc2 = { store: { getBases: () => fakeStore } };

  t('chỉ giữ Base có app_token XUẤT HIỆN trong câu lệnh', () => {
    const out = scope.call(svc2, 'Tạo bản ghi vào app_token: tok_dung, bảng tblX');
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].name, 'Base Test');
  });
  t('nhiều Base trong câu lệnh ⇒ giữ đúng những cái đó', () => {
    const out = scope.call(svc2, 'đối chiếu tok_dung với tok_khac2');
    assert.strictEqual(out.length, 2);
  });
  t('không nhận ra Base nào ⇒ RỖNG, không mở cả kho', () => {
    // Thà agent hỏi "Base nào?" còn hơn được cấp 39 chỗ nó có thể ghi nhầm.
    assert.strictEqual(scope.call(svc2, 'làm báo cáo tổng hợp giúp tôi').length, 0);
  });

  console.log(`\n${pass} ca đạt.`);
  // LarkService khởi động bộ đếm giờ (tự động hoá, làm mới CMS) trong constructor, nên tiến trình
  // không tự thoát. Thoát tường minh — bài kiểm đã xong việc của nó.
  process.exit(0);
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
