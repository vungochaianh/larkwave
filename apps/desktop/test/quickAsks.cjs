/**
 * "⚡ Hỏi nhanh" của Lark × Agents: bộ nút theo chế độ, chèn app_token của Base vào câu lệnh, đường
 * công cụ khi KHÔNG có custom app, và "Hỏi nhanh của tôi" tách theo chế độ.
 *
 *   bash apps/desktop/test/run.sh
 */
const assert = require('node:assert');
const { join } = require('node:path');
const q = require(join(__dirname, '..', '.test-build', 'ui', 'quickAsks.js'));

let pass = 0;
const t = (name, fn) => { fn(); pass += 1; console.log('  ✓', name); };
const BASE = { name: 'Base Test', appToken: 'BaseTokABC123' };
const OPEN_API_CREATE = /bitable_workflow_create|bitable_create_workflow|Open API v3|\bv3\b/;
/** Bỏ các câu PHỦ ĐỊNH / việc của NGƯỜI DÙNG, phần còn lại không được nhắc tới bật. */
const askEnables = (p) =>
  /bật|enable/i.test(
    p
      .replace(/KHÔNG[^.;]*?bật/gi, '')
      .replace(/(tôi|TÔI)[^.;]*?(bật|BẬT)/g, '')
      .replace(/đang bật/g, ''),
  );

t('Tạo workflow: bộ nút riêng, đủ 8 nút, Base đang chọn được chèn token', () => {
  const c = q.buildQuickAsks({ mode: 'workflow', bases: [BASE], appConnected: false });
  assert.deepStrictEqual(c.map((x) => x.k), ['wfSuggest', 'wfRead', 'wfAudit', 'wfRemind', 'wfStatus', 'wfReport', 'wfOwner', 'wfStruct']);
  for (const x of c) assert.ok(x.prompt.includes('BaseTokABC123'), x.label);
  for (const x of c) assert.ok(x.prompt.includes('«Base Test»'), x.label);
  assert.ok(!c.some((x) => /Bảng đầu tiên/.test(x.label)), 'không rơi về câu ví dụ chung');
});
t('Tạo workflow chưa chọn Base → không có nút dựng sẵn, ô gợi ý trống', () => {
  assert.deepStrictEqual(q.buildQuickAsks({ mode: 'workflow', bases: [], appConnected: true }), []);
  assert.deepStrictEqual(q.workflowEmptyExamples(null), []);
});
t('Tạo workflow: chỉ dùng phiên Lark web — không tool Open API, không nút gỡ lỗi (kể cả có app/dev)', () => {
  for (const appConnected of [false, true]) {
    const c = q.buildQuickAsks({ mode: 'workflow', bases: [BASE], appConnected, dev: true });
    for (const x of c) {
      assert.ok(!OPEN_API_CREATE.test(x.prompt), x.label);
      assert.ok(!/bitable_read_workflows|bitable_scan_base|debug=true/.test(x.prompt), x.label);
    }
    assert.ok(!c.some((x) => /gỡ lỗi/.test(x.label)));
  }
});
t('Tạo workflow: đọc dùng lark_web_read_automations + giữ định dạng WF<số>; tạo dùng lark_web_create_automations', () => {
  const by = Object.fromEntries(q.workflowQuickAsks(BASE).map((x) => [x.k, x.prompt]));
  assert.ok(by.wfRead.includes('lark_web_read_automations') && by.wfRead.includes('**WF<số>: <tên>**') && by.wfRead.includes('NGUYÊN VĂN'));
  assert.ok(by.wfAudit.includes('lark_web_read_automations') && /mức độ \(cao\/vừa\/thấp\)/.test(by.wfAudit));
  for (const k of ['wfSuggest', 'wfRemind', 'wfStatus', 'wfReport', 'wfOwner']) assert.ok(by[k].includes('lark_web_create_automations'), k);
  assert.ok(by.wfStruct.includes('lark_web_add_table') && by.wfStruct.includes('lark_web_add_fields') && /KHÔNG tạo automation/.test(by.wfStruct));
  assert.ok(/KHÔNG sửa hay xoá automation gốc/.test(by.wfOwner));
});
t('Không câu lệnh nào bảo trợ lý BẬT; câu tạo đều có chốt "KHÔNG bật"', () => {
  const all = [...q.workflowQuickAsks(BASE), ...q.chatQuickAsks([BASE], true, true), ...q.chatQuickAsks([BASE], false)];
  for (const x of all) assert.ok(!askEnables(x.prompt), x.label + ': ' + x.prompt);
  for (const x of q.workflowQuickAsks(BASE).filter((x) => /lark_web_create_automations/.test(x.prompt))) assert.ok(/KHÔNG bật/.test(x.prompt), x.label);
});
t('Ô gợi ý trống của Tạo workflow = 4 nút đầu của bộ nút, theo Base', () => {
  const e = q.workflowEmptyExamples(BASE);
  assert.deepStrictEqual(e.map((x) => x.k), ['wfSuggest', 'wfStatus', 'wfRemind', 'wfRead']);
  const all = q.workflowQuickAsks(BASE);
  for (const x of e) assert.strictEqual(x.prompt, all.find((y) => y.k === x.k).prompt);
});
t('Hội thoại thường không Base → câu ví dụ cũ (nhãn = câu lệnh)', () => {
  const c = q.buildQuickAsks({ mode: 'chat', bases: [], appConnected: true });
  assert.strictEqual(c.length, 8);
  for (const x of c) assert.strictEqual(x.label, x.prompt);
});
t('Hội thoại thường có app: giữ nút cũ, đọc/soát dùng bitable_read_workflows kèm app_token; nút gỡ lỗi chỉ ở dev', () => {
  const c = q.chatQuickAsks([BASE, { name: 'B2', appToken: 'Tok2' }], true);
  assert.deepStrictEqual(c.map((x) => x.k), ['tablesCols', 'summaryBase', 'evalBase', 'permissions', 'readWf', 'auditWf', 'suggestWf', 'design', 'kanban', 'sampleData']);
  const by = Object.fromEntries(c.map((x) => [x.k, x.prompt]));
  assert.ok(by.readWf.includes('bitable_read_workflows với app_token=BaseTokABC123 (rồi lần lượt'));
  assert.ok(by.readWf.includes('B2 (app_token=Tok2)'));
  assert.ok(by.auditWf.includes('app_token=BaseTokABC123'));
  assert.ok(by.summaryBase.startsWith('Dùng bitable_base_overview'));
  assert.ok(!c.some((x) => x.k === 'debugEndpoint'));
  assert.ok(q.chatQuickAsks([BASE], true, true).some((x) => x.k === 'debugEndpoint'));
});
t('Hội thoại thường KHÔNG có app: không tool Open API nào (v3/overview/roles/read_workflows), dùng phiên web', () => {
  const c = q.chatQuickAsks([BASE], false, true);
  for (const x of c) {
    assert.ok(!OPEN_API_CREATE.test(x.prompt), x.label);
    assert.ok(!/bitable_(base_overview|list_roles|read_workflows|list_fields|scan_base)|debug=true/.test(x.prompt), x.label);
  }
  assert.ok(!c.some((x) => ['permissions', 'kanban', 'sampleData', 'debugEndpoint'].includes(x.k)), 'nút chỉ chạy được với App ID bị ẩn');
  const by = Object.fromEntries(c.map((x) => [x.k, x.prompt]));
  assert.ok(by.readWf.includes('lark_web_read_automations với app_token=BaseTokABC123'));
  assert.ok(by.summaryBase.includes('lark_web_scan_base (app_token=BaseTokABC123'));
  assert.ok(by.suggestWf.includes('lark_web_create_automations'));
});
t('Hỏi nhanh của tôi: khoá riêng theo chế độ; đọc bỏ mục hỏng + trùng; không che nút dựng sẵn', () => {
  assert.notStrictEqual(q.CUSTOM_ASKS_KEYS.chat, q.CUSTOM_ASKS_KEYS.workflow);
  assert.strictEqual(q.CUSTOM_ASKS_KEYS.chat, 'tw_lark_quickasks', 'giữ khoá cũ — không mất danh sách người dùng đã có');
  const parsed = q.parseCustomAsks(JSON.stringify([{ label: ' A ', prompt: 'x' }, { label: 'A', prompt: 'y' }, { label: '', prompt: 'z' }, null, { label: 'B' }]));
  assert.deepStrictEqual(parsed, [{ label: 'A', prompt: 'x' }]);
  assert.deepStrictEqual(q.parseCustomAsks('{bad'), []);
  assert.deepStrictEqual(q.parseCustomAsks(null), []);
  const built = q.workflowQuickAsks(BASE);
  const { chips, isCustom } = q.mergeChips(built, [{ label: '🔧 Đọc workflow', prompt: 'đè' }, { label: 'Của tôi', prompt: 'p' }]);
  assert.strictEqual(chips.length, built.length + 1);
  assert.strictEqual(chips.find((x) => x.label === '🔧 Đọc workflow').prompt, built.find((x) => x.k === 'wfRead').prompt);
  assert.strictEqual(isCustom('Của tôi'), true);
  assert.strictEqual(isCustom('🔧 Đọc workflow'), false);
});

console.log(`  quickAsks: ${pass} kiểm qua`);
