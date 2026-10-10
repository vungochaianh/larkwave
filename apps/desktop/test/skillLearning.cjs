/**
 * Larkwave TỰ HỌC kỹ năng: nhận ra lời dạy/lời sửa (VI/EN), gỡ bí mật, gỡ câu cấp quyền, lưu/cập nhật
 * (không đẻ bản trùng), không sửa kỹ năng dựng sẵn, lịch sử phiên bản + hoàn tác, đề xuất theo nguồn và
 * cài đặt, đồng bộ sang thư mục CLI larkwave-*, và gợi ý trong lượt chat (dạy / lặp lại).
 *
 *   bash apps/desktop/test/run.sh
 */
const assert = require('node:assert');
const Module = require('node:module');
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const orig = Module._load;
Module._load = function (req) {
  if (req === 'electron') return { Notification: class { show() {} static isSupported() { return false; } }, app: { getPath: () => tmpdir(), isPackaged: false, getVersion: () => '0.0.0' }, safeStorage: { isEncryptionAvailable: () => false }, session: { fromPartition: () => ({}) }, BrowserWindow: function () {}, shell: {}, net: {} };
  return orig.apply(this, arguments);
};

const ROOT = join(__dirname, '..');
const B = join(ROOT, '.test-build');
const HOME = mkdtempSync(join(tmpdir(), 'lw-home-l-'));
process.env.HOME = HOME;
const L = require(join(B, 'core', 'skillLearning.js'));
const { SkillHost } = require(join(B, 'runtime', 'skills', 'skillHost.js'));
const { BUILTIN_SKILLS } = require(join(B, 'runtime', 'skills', 'builtinSkills.js'));

let pass = 0;
let fail = 0;
const t = async (name, fn) => {
  try {
    await fn();
    pass++;
    console.log('  ✓', name);
  } catch (e) {
    fail++;
    console.log('  ✗', name, '\n     ', e && (e.stack || e.message).split('\n').slice(0, 4).join('\n      '));
  }
};
const put = (p, v) => {
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, v);
};

(async () => {
  await t('nhận ra lời DẠY (VI/EN) và lời SỬA; câu thường thì không', () => {
    const ex = [
      'từ giờ khi xuất Excel thì luôn thêm dòng tổng ở cuối',
      'Lần sau nhớ đính vào ô Hồ sơ nhé',
      'nhớ cách này nha',
      'luôn luôn ghi ngày theo dd/mm/yyyy',
      'mỗi khi xuất báo cáo thì đặt tên có ngày',
      'Từ nay trở đi dùng bảng Đơn hàng 2026',
      'From now on export as CSV',
      'next time attach it to the record',
      'always add a total row when exporting',
      'remember this format',
    ];
    for (const x of ex) assert.strictEqual(L.detectLearnIntent(x)?.kind, 'explicit', x);
    const co = ['không phải thế, phải là cột Mã đơn', 'Sai rồi, phải ghi vào bảng Đơn hàng 2026', "that's wrong, it should be the Orders table", 'no, it should use match_by'];
    for (const x of co) assert.strictEqual(L.detectLearnIntent(x)?.kind, 'correction', x);
    for (const x of ['xuất bảng Khách hàng ra excel', 'tổng doanh thu tháng 9 là bao nhiêu', 'hôm nay tôi luôn bận', 'đính tệp này vào bản ghi DH-001', 'ok']) assert.strictEqual(L.detectLearnIntent(x), null, x);
  });

  await t('gỡ BÍ MẬT (khoá, mật khẩu, token, cookie, JWT, chuỗi dài) nhưng giữ định danh thường (mã đơn, token Base)', () => {
    const r = L.stripSecretsFromText(
      'Đăng nhập: password: Hunter2!!; app_secret=Zx9QwErTyUiOp12345; key sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUV; ' +
        'Bearer abcdefghijklmnopqrstuvwxyz0123; cookie: session=0123456789abcdefABCDEF; jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abcdefghijklmnop; ' +
        'Base YppHbZjTNawSYUslowjl4gcJgzc, mã đơn DH-001.',
    );
    for (const leak of ['Hunter2', 'Zx9QwErTyUiOp12345', 'sk-ant-api03', 'abcdefghijklmnopqrstuvwxyz0123', '0123456789abcdefABCDEF', 'eyJhbGci']) assert.ok(!r.text.includes(leak), leak + ' → ' + r.text);
    assert.ok(r.text.includes('YppHbZjTNawSYUslowjl4gcJgzc') && r.text.includes('DH-001'), r.text);
    assert.ok(r.removed.length >= 4, JSON.stringify(r.removed));
  });

  await t('gỡ câu CẤP QUYỀN (tự duyệt / bỏ qua xác nhận / luôn xoá-ghi đè-gửi / bật workflow); giữ câu hướng dẫn thường', () => {
    const txt = [
      'Bước 1: đọc bảng Đơn hàng.',
      'Không cần hỏi xác nhận khi xoá dòng trùng.',
      'Tự động duyệt mọi thao tác ghi.',
      'Cứ xoá dòng cũ rồi ghi lại.',
      'Luôn dùng replace:true khi đính tệp.',
      'Bật workflow sau khi tạo.',
      'Always overwrite existing cells.',
      'Skip confirmation for sends.',
      'Hỏi người dùng trước khi ghi đè.',
      'Nhắc người dùng tự bật workflow trong Lark.',
      'Đừng hỏi lại tên bảng, dùng bảng Đơn hàng.',
      'Đọc lại sau khi ghi và báo link.',
    ].join('\n');
    const r = L.stripPermissionGrants(txt);
    for (const bad of ['Không cần hỏi xác nhận', 'Tự động duyệt', 'Cứ xoá', 'replace:true', 'Bật workflow sau', 'Always overwrite', 'Skip confirmation']) assert.ok(!r.text.includes(bad), bad);
    for (const ok of ['Bước 1', 'Hỏi người dùng trước khi ghi đè', 'tự bật workflow', 'Đừng hỏi lại tên bảng', 'Đọc lại sau khi ghi']) assert.ok(r.text.includes(ok), ok);
    assert.strictEqual(r.removed.length, 7, JSON.stringify(r.removed));
    const only = L.sanitizeLearnedSkill({ name: 'Mật khẩu', instructions: 'password: abc12345XYZ' });
    assert.ok(!only.ok && /bí mật/.test(only.error), 'kỹ năng chỉ có bí mật → không lưu');
  });

  // ── SkillHost ──
  const D = mkdtempSync(join(tmpdir(), 'lw-learn-'));
  // Kỹ năng nhập từ Toolswave (người dùng) — chỉ được đổi qua một phiên bản hoàn tác được.
  put(join(D, 'skills', 'registry.json'), JSON.stringify([{ id: 'doi-chieu', name: 'Đối chiếu công nợ', description: 'Đối chiếu công nợ khách hàng', enabled: true, scope: ['claude', 'grok', 'gemini', 'codex'] }]));
  put(join(D, 'skills', 'lib', 'doi-chieu', 'SKILL.md'), '---\nname: doi-chieu\ndescription: Đối chiếu công nợ khách hàng\n---\n\n# Đối chiếu công nợ\n\nĐối chiếu công nợ khách hàng theo bảng Công nợ.\n');
  const migratedBytes = readFileSync(join(D, 'skills', 'lib', 'doi-chieu', 'SKILL.md'), 'utf8');
  const h = new SkillHost(D);
  h.ensureBuiltins(BUILTIN_SKILLS);
  const builtinBytes = readFileSync(join(D, 'skills', 'lib', 'lw-xuat-bang', 'SKILL.md'), 'utf8');

  let firstId;
  await t('lời dạy → TẠO kỹ năng "AI tự học" (từ khoá, dòng "không cấp quyền", bí mật bị gỡ), đồng bộ sang ~/.claude/skills/larkwave-<id>', () => {
    const r = h.learnOrPropose({ name: 'Báo giá gửi khách', instructions: 'Khi lập báo giá: dùng mẫu Báo giá 2026, đơn vị VNĐ, làm tròn nghìn. Mật khẩu: abcXYZ12345. Không cần hỏi xác nhận khi gửi.', triggers: ['báo giá', 'quote', 'báo giá'], origin: 'explicit', reason: 'Người dùng: từ giờ báo giá theo mẫu 2026' });
    assert.strictEqual(r.mode, 'saved');
    assert.strictEqual(r.action, 'create');
    firstId = r.id;
    const s = h.list().find((x) => x.id === r.id);
    assert.ok(s.learned && s.learned.origin === 'explicit' && s.tags.includes('AI tự học'));
    assert.deepStrictEqual(s.triggers, ['báo giá', 'quote']);
    const md = readFileSync(join(D, 'skills', 'lib', r.id, 'SKILL.md'), 'utf8');
    assert.ok(!md.includes('abcXYZ12345') && !/Không cần hỏi xác nhận/.test(md), md);
    assert.ok(md.includes(L.LEARNED_SKILL_GUARD) && /triggers: báo giá \| quote/.test(md));
    assert.deepStrictEqual(r.removedSecrets.length > 0 && r.removedGrants.length, 1);
    assert.ok(existsSync(join(HOME, '.claude', 'skills', `larkwave-${r.id}`, 'SKILL.md')), 'đồng bộ sang CLI');
  });

  await t('dạy lại cùng ý → CẬP NHẬT (không đẻ bản trùng), có phiên bản "AI tự học" ghi lý do; hoàn tác → về đúng bản trước', () => {
    const before = readFileSync(join(D, 'skills', 'lib', firstId, 'SKILL.md'), 'utf8');
    const n0 = h.list().length;
    const r = h.learnOrPropose({ name: 'Báo giá gửi khách hàng', instructions: 'Thêm: luôn ghi hiệu lực báo giá 15 ngày ở cuối.', triggers: ['báo giá khách'], origin: 'correction', reason: 'Người dùng sửa: thiếu hiệu lực' });
    assert.ok(r.mode === 'saved' && r.action === 'update' && r.id === firstId, JSON.stringify(r));
    assert.strictEqual(h.list().length, n0, 'không có kỹ năng trùng');
    const md = readFileSync(join(D, 'skills', 'lib', firstId, 'SKILL.md'), 'utf8');
    assert.ok(/## Bổ sung/.test(md) && /15 ngày/.test(md) && /mẫu Báo giá 2026/.test(md), 'nối thêm, giữ nội dung cũ');
    const v = h.snapshots(firstId)[0];
    assert.ok(v.by === 'ai' && /AI tự học \(bạn sửa\): Người dùng sửa/.test(v.what), JSON.stringify(v));
    h.undoLearn(firstId);
    assert.strictEqual(readFileSync(join(D, 'skills', 'lib', firstId, 'SKILL.md'), 'utf8'), before);
  });

  await t('hoàn tác lần TẠO → gỡ kỹ năng (cả thư mục CLI); "Lấy lại" → về như cũ', () => {
    h.undoLearn(firstId);
    assert.ok(!h.list().some((x) => x.id === firstId));
    assert.ok(!existsSync(join(HOME, '.claude', 'skills', `larkwave-${firstId}`)));
    h.restoreLearned(firstId);
    assert.ok(h.list().some((x) => x.id === firstId && x.learned));
    assert.ok(existsSync(join(HOME, '.claude', 'skills', `larkwave-${firstId}`, 'SKILL.md')));
  });

  await t('trùng ý kỹ năng DỰNG SẴN → không sửa kỹ năng dựng sẵn, tạo kỹ năng bổ sung nói rõ "áp dụng cùng"', () => {
    const r = h.learnOrPropose({ name: 'Xuất bảng ra Excel', instructions: 'Khi xuất Excel thì luôn thêm dòng tổng ở cuối (lark_export_table_file với total_row:true).', triggers: ['xuất excel', 'xuất bảng'], origin: 'explicit', reason: 'từ giờ khi xuất Excel thì luôn thêm dòng tổng ở cuối' });
    assert.ok(r.mode === 'saved' && r.action === 'create' && r.supplementOf === 'Xuất bảng ra Excel/CSV đầy đủ', JSON.stringify(r));
    assert.strictEqual(readFileSync(join(D, 'skills', 'lib', 'lw-xuat-bang', 'SKILL.md'), 'utf8'), builtinBytes, 'kỹ năng dựng sẵn không đổi một byte');
    assert.ok(/Áp dụng CÙNG với kỹ năng dựng sẵn/.test(readFileSync(join(D, 'skills', 'lib', r.id, 'SKILL.md'), 'utf8')));
    h.undoLearn(r.id);
  });

  await t('kỹ năng nhập từ Toolswave: AI chỉ đổi qua một PHIÊN BẢN hoàn tác được', () => {
    const r = h.learnOrPropose({ name: 'Đối chiếu công nợ', instructions: 'Đối chiếu thêm cột Hạn thanh toán.', origin: 'correction', reason: 'sửa cách đối chiếu' });
    assert.ok(r.mode === 'saved' && r.action === 'update' && r.id === 'doi-chieu');
    assert.notStrictEqual(readFileSync(join(D, 'skills', 'lib', 'doi-chieu', 'SKILL.md'), 'utf8'), migratedBytes);
    h.undoLearn('doi-chieu');
    assert.strictEqual(readFileSync(join(D, 'skills', 'lib', 'doi-chieu', 'SKILL.md'), 'utf8'), migratedBytes, 'hoàn tác về đúng từng byte');
  });

  await t('nguồn + cài đặt: kinh nghiệm / Base → ĐỀ XUẤT (không lưu); "Hỏi trước" → lời dạy cũng thành đề xuất; tắt "Tự học" → không lưu; lưu đề xuất → kỹ năng', () => {
    const n0 = h.list().length;
    const p = h.learnOrPropose({ name: 'Nhập hoá đơn NCC', instructions: 'Đọc tệp hoá đơn → ghi bảng Hoá đơn theo khoá Số HĐ.', triggers: ['nhập hoá đơn'], origin: 'experience' });
    assert.strictEqual(p.mode, 'proposal');
    assert.strictEqual(h.list().length, n0, 'đề xuất chưa lưu gì');
    const pb = h.learnOrPropose({ name: 'Báo giá gửi khách', instructions: 'Quy ước bảng Báo giá: cột Trạng thái có Nháp/Đã gửi/Chốt.', origin: 'base' });
    assert.ok(pb.mode === 'proposal' && pb.proposal.updateId === firstId, 'đề xuất trùng ý → đề xuất CẬP NHẬT kỹ năng đã có');
    h.setLearnSettings({ askFirst: true });
    assert.strictEqual(h.learnOrPropose({ name: 'Quy tắc X', instructions: 'Luôn ghi ngày theo định dạng dd/mm/yyyy trong báo cáo.', origin: 'explicit' }).mode, 'proposal');
    h.setLearnSettings({ askFirst: false, enabled: false });
    assert.strictEqual(h.learnOrPropose({ name: 'Quy tắc Y', instructions: 'Luôn ghi ngày theo định dạng dd/mm/yyyy trong báo cáo.', origin: 'explicit' }).mode, 'disabled');
    h.setLearnSettings({ enabled: true });
    assert.deepStrictEqual(h.getLearnSettings(), { enabled: true, askFirst: false });
    const saved = h.saveLearned({ ...p.proposal });
    assert.ok(h.list().some((x) => x.id === saved.id && x.learned && x.learned.origin === 'experience'));
  });

  await t('công cụ skill_save: lưu ngay / đề xuất / tắt — và phát đúng thẻ "Đã học" / thẻ đề xuất ở cả 3 đường thực thi', async () => {
    const bridge = require(join(B, 'runtime', 'lark', 'skillBridge.js'));
    const { skillTools } = require(join(B, 'runtime', 'lark', 'tools', 'skills.js'));
    const X = require(join(B, 'runtime', 'lark', 'larkToolExec.js'));
    bridge.setAgentSkillLearner(async (i) => h.learnOrPropose(i));
    const tool = skillTools.find((x) => x.name === 'skill_save');
    assert.strictEqual(tool.gated, false, 'lời dạy trực tiếp phải chạy ngay ở chế độ tự động');
    const r1 = await tool.exec({ name: 'Ghi chú cuộc gọi', instructions: 'Sau mỗi cuộc gọi ghi vào bảng Cuộc gọi: ngày, khách, nội dung, bước tiếp.', triggers: ['ghi cuộc gọi'], origin: 'explicit', reason: 'từ giờ ghi cuộc gọi' });
    assert.ok(r1.ok && r1.learned && /Đã học/.test(r1.note), JSON.stringify(r1));
    const ev1 = X.skillEventFor('skill_save', r1);
    assert.ok(ev1.type === 'skill_learned' && ev1.name === 'Ghi chú cuộc gọi' && ev1.action === 'create');
    const r2 = await tool.exec({ name: 'Quy trình nhập kho', instructions: 'Đọc phiếu nhập → cộng tồn kho bảng Kho theo mã hàng.', origin: 'experience' });
    assert.ok(r2.ok && r2.proposal && !r2.learned);
    assert.strictEqual(X.skillEventFor('skill_save', r2).type, 'skill_proposal');
    h.setLearnSettings({ enabled: false });
    const r3 = await tool.exec({ name: 'Z', instructions: 'Luôn ghi ngày theo định dạng dd/mm/yyyy trong báo cáo.', origin: 'explicit' });
    assert.ok(r3.ok === false && /TẮT/.test(r3.error));
    assert.strictEqual(X.skillEventFor('skill_save', r3), null);
    h.setLearnSettings({ enabled: true });
    for (const f of ['mcpServer.ts', 'toolBridge.ts', 'larkToolExec.ts']) assert.ok(/skillEventFor\(name, data\)/.test(readFileSync(join(ROOT, 'main', 'runtime', 'lark', f), 'utf8')), f);
  });

  await t('gợi ý trong lượt chat: lời dạy → dặn gọi skill_save; yêu cầu lặp lại lần 2 → đề xuất một lần; tắt "Tự học" → không gợi ý', async () => {
    assert.ok(L.textSimilarity('xuất bảng đơn hàng tháng 9 ra excel có tổng', 'xuất bảng đơn hàng tháng 10 ra excel có tổng') >= 0.6);
    assert.ok(L.textSimilarity('xuất bảng đơn hàng ra excel', 'đính tệp vào bản ghi khách hàng') < 0.3);
    const { LarkService } = require(join(B, 'runtime', 'lark', 'larkService.js'));
    const svc = new LarkService(D);
    const a = await svc.learnHintFor('từ giờ khi xuất Excel thì luôn thêm dòng tổng ở cuối');
    assert.ok(/TỰ HỌC/.test(a) && /skill_save/.test(a) && /"explicit"/.test(a), a);
    const q = 'đọc tệp hoá đơn nhà cung cấp tháng này rồi ghi vào bảng Hoá đơn NCC theo số hoá đơn';
    assert.strictEqual(await svc.learnHintFor(q), '', 'lần đầu không gợi ý');
    const b = await svc.learnHintFor(q.replace('tháng này', 'tuần này'));
    assert.ok(/lặp lại 2 lần/.test(b) && /"experience"/.test(b), b);
    assert.strictEqual(await svc.learnHintFor(q.replace('tháng này', 'hôm nay')), '', 'đã gợi ý cho nhóm này rồi → không lặp lại');
    h.setLearnSettings({ enabled: false });
    assert.strictEqual(await svc.learnHintFor('từ giờ luôn xuất CSV'), '');
    assert.strictEqual(await svc.learnSystemBlock(), '');
    h.setLearnSettings({ enabled: true });
    assert.ok(/TỰ HỌC KỸ NĂNG \(đang BẬT\)/.test(await svc.learnSystemBlock()));
  });

  await t('lịch sử phiên bản: đọc nội dung bản cũ + bản hiện tại; khác biệt theo dòng', () => {
    h.update(firstId, { instructions: 'Dòng A\nDòng B mới', by: 'you' });
    const at = h.snapshots(firstId)[0].at;
    const vt = h.versionText(firstId, at);
    assert.ok(/mẫu Báo giá 2026/.test(vt.before) && /Dòng B mới/.test(vt.current));
    const d = L.lineDiff('a\nb\nc', 'a\nc\nd');
    assert.deepStrictEqual(d, [{ op: ' ', line: 'a' }, { op: '-', line: 'b' }, { op: ' ', line: 'c' }, { op: '+', line: 'd' }]);
  });

  console.log(fail ? `\n${fail} ca SAI` : `\n  skillLearning: TẤT CẢ ĐÚNG (${pass})`);
  process.exit(fail ? 1 : 0);
})();
