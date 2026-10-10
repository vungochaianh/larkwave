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

const WF = ['wfSuggest', 'wfRead', 'wfAudit', 'wfRemind', 'wfStatus', 'wfReport', 'wfOwner', 'wfStruct'];
t('Bố cục frame (Tạo workflow): MỘT bộ hợp nhất — nút workflow trước, rồi nút dữ liệu; Base chèn token', () => {
  const c = q.buildQuickAsks({ layout: 'frame', bases: [BASE], appConnected: false });
  assert.deepStrictEqual(c.slice(0, 8).map((x) => x.k), WF);
  assert.deepStrictEqual(c.slice(8).map((x) => x.k), ['tablesCols', 'summaryBase', 'evalBase']);
  for (const x of c.filter((y) => WF.includes(y.k))) assert.ok(x.prompt.includes('BaseTokABC123') && x.prompt.includes('«Base Test»'), x.label);
  // mode cũ 'workflow' ≙ layout 'frame' (relay / nơi gọi cũ)
  assert.deepStrictEqual(q.buildQuickAsks({ mode: 'workflow', bases: [BASE], appConnected: false }).map((x) => x.k), c.map((x) => x.k));
});
t('Bố cục chat (Lark × Agents): cùng bộ nút, nút dữ liệu trước; không trùng vai (readWf/auditWf/suggestWf cũ đã gộp)', () => {
  const c = q.buildQuickAsks({ layout: 'chat', bases: [BASE, { name: 'B2', appToken: 'Tok2' }], appConnected: true });
  assert.deepStrictEqual(c.map((x) => x.k), ['tablesCols', 'summaryBase', 'evalBase', 'wfSuggest', 'wfRead', 'wfAudit', 'wfRemind', 'wfStatus', 'wfReport', 'wfOwner', 'permissions', 'design', 'kanban', 'sampleData', 'fileExport', 'fileImport', 'fileAttach', 'fileReadAttach', 'autoFromFiles', 'learnBase']);
  assert.strictEqual(new Set(c.map((x) => x.label)).size, c.length, 'nhãn duy nhất');
  assert.ok(!c.some((x) => ['readWf', 'auditWf', 'suggestWf'].includes(x.k)));
  assert.deepStrictEqual(q.chatQuickAsks([BASE], true).map((x) => x.k), q.buildQuickAsks({ layout: 'chat', bases: [BASE], appConnected: true }).map((x) => x.k));
});
t('Chưa có Base: chat → câu ví dụ (nhãn = câu lệnh); frame → không nút, ô gợi ý trống', () => {
  const c = q.buildQuickAsks({ layout: 'chat', bases: [], appConnected: true });
  assert.strictEqual(c.length, 8);
  for (const x of c) assert.strictEqual(x.label, x.prompt);
  assert.deepStrictEqual(q.buildQuickAsks({ layout: 'frame', bases: [], appConnected: true }), []);
  assert.deepStrictEqual(q.emptyExamples({ layout: 'frame', bases: [], appConnected: true }), []);
});
t('Ô gợi ý theo bố cục: frame = 4 nút workflow; chat = 2 nút dữ liệu + 2 nút workflow', () => {
  assert.deepStrictEqual(q.emptyExamples({ layout: 'frame', bases: [BASE], appConnected: false }).map((x) => x.k), ['wfSuggest', 'wfStatus', 'wfRemind', 'wfRead']);
  assert.deepStrictEqual(q.emptyExamples({ layout: 'chat', bases: [BASE], appConnected: false }).map((x) => x.k), ['tablesCols', 'summaryBase', 'wfSuggest', 'wfRead']);
});
t('"workflow" = KHỐI Workflow: nút tạo dùng lark_web_create_workflows, không bao giờ Open API v3 / automation cổ điển', () => {
  for (const appConnected of [false, true]) {
    const c = q.buildQuickAsks({ layout: 'frame', bases: [BASE], appConnected, dev: true });
    for (const x of c.filter((y) => WF.includes(y.k))) {
      assert.ok(!OPEN_API_CREATE.test(x.prompt), x.label);
      assert.ok(!/lark_web_create_automations?\b/.test(x.prompt), x.label + ' không tạo automation cổ điển');
    }
  }
  const by = Object.fromEntries(q.workflowQuickAsks(BASE).map((x) => [x.k, x.prompt]));
  for (const k of ['wfSuggest', 'wfRemind', 'wfStatus', 'wfReport', 'wfOwner']) assert.ok(by[k].includes('lark_web_create_workflows') && /KHỐI Workflow/.test(by[k]), k);
  assert.ok(by.wfRead.includes('lark_web_read_automations') && by.wfRead.includes('**WF<số>: <tên>**') && by.wfRead.includes('NGUYÊN VĂN'));
  assert.ok(by.wfAudit.includes('lark_web_read_automations') && /mức độ \(cao\/vừa\/thấp\)/.test(by.wfAudit));
  assert.ok(by.wfStruct.includes('lark_web_add_table') && by.wfStruct.includes('lark_web_add_fields') && /KHÔNG tạo automation/.test(by.wfStruct));
  assert.ok(/KHÔNG sửa hay xoá automation gốc/.test(by.wfOwner));
});
t('Không câu lệnh nào bảo trợ lý BẬT; câu tạo đều có chốt "KHÔNG bật"', () => {
  const all = [...q.workflowQuickAsks(BASE), ...q.buildQuickAsks({ layout: 'chat', bases: [BASE], appConnected: true, dev: true }), ...q.buildQuickAsks({ layout: 'chat', bases: [BASE], appConnected: false })];
  for (const x of all) assert.ok(!askEnables(x.prompt), x.label + ': ' + x.prompt);
  for (const x of q.workflowQuickAsks(BASE).filter((x) => /lark_web_create_workflows/.test(x.prompt))) assert.ok(/KHÔNG bật/.test(x.prompt), x.label);
});
t('Không custom app: nút dữ liệu dùng phiên web, ẩn nút chỉ chạy được với App ID; nút gỡ lỗi chỉ ở dev + có app', () => {
  const c = q.buildQuickAsks({ layout: 'chat', bases: [BASE], appConnected: false, dev: true });
  for (const x of c) assert.ok(!/bitable_(base_overview|list_roles|read_workflows|list_fields|scan_base)|debug=true/.test(x.prompt), x.label);
  assert.ok(!c.some((x) => ['permissions', 'kanban', 'sampleData', 'debugEndpoint'].includes(x.k)));
  const by = Object.fromEntries(c.map((x) => [x.k, x.prompt]));
  assert.ok(by.summaryBase.includes('lark_web_scan_base (app_token=BaseTokABC123'));
  assert.ok(q.buildQuickAsks({ layout: 'chat', bases: [BASE], appConnected: true, dev: true }).some((x) => x.k === 'debugEndpoint'));
  assert.ok(!q.buildQuickAsks({ layout: 'chat', bases: [BASE], appConnected: true }).some((x) => x.k === 'debugEndpoint'));
});
t('Hỏi nhanh của tôi: MỘT khoá (giữ khoá cũ của hội thoại thường); đọc bỏ mục hỏng + trùng; không che nút dựng sẵn', () => {
  assert.strictEqual(q.CUSTOM_ASKS_KEY, 'tw_lark_quickasks');
  assert.strictEqual(q.CUSTOM_ASKS_KEYS.chat, q.CUSTOM_ASKS_KEY, 'không mất danh sách người dùng đã có');
  const parsed = q.parseCustomAsks(JSON.stringify([{ label: ' A ', prompt: 'x' }, { label: 'A', prompt: 'y' }, { label: '', prompt: 'z' }, null, { label: 'B' }]));
  assert.deepStrictEqual(parsed, [{ label: 'A', prompt: 'x' }]);
  assert.deepStrictEqual(q.parseCustomAsks('{bad'), []);
  const built = q.workflowQuickAsks(BASE);
  const { chips, isCustom } = q.mergeChips(built, [{ label: '🔧 Đọc workflow', prompt: 'đè' }, { label: 'Của tôi', prompt: 'p' }]);
  assert.strictEqual(chips.length, built.length + 1);
  assert.strictEqual(chips.find((x) => x.label === '🔧 Đọc workflow').prompt, built.find((x) => x.k === 'wfRead').prompt);
  assert.strictEqual(isCustom('Của tôi'), true);
  assert.strictEqual(isCustom('🔧 Đọc workflow'), false);
});

t('Nút "Tệp & dữ liệu": mỗi nút gọi đúng kỹ năng dựng sẵn, chèn token Base, chạy được chỉ với phiên web', () => {
  const c = q.buildQuickAsks({ layout: 'chat', bases: [BASE], appConnected: false });
  const by = Object.fromEntries(c.map((x) => [x.k, x.prompt]));
  for (const k of q.FILE_ASK_KEYS) assert.ok(by[k] && by[k].includes('BaseTokABC123'), k);
  assert.ok(/lark_export_table_file/.test(by.fileExport) && /N dòng nguồn → N dòng/.test(by.fileExport));
  assert.ok(/match_by/.test(by.fileImport) && /xác nhận/.test(by.fileImport));
  assert.ok(/lark_web_attach_file/.test(by.fileAttach) && /GHI THÊM/.test(by.fileAttach));
  assert.ok(/lark_web_download_attachments/.test(by.fileReadAttach));
  assert.ok(/schedule_agent_job/.test(by.autoFromFiles) && /KHÔNG cấp quyền/.test(by.autoFromFiles));
  assert.ok(/skill_save/.test(by.learnBase) && /origin "base"/.test(by.learnBase) && /CHỈ ĐỌC/.test(by.learnBase), '"Học từ Base" chỉ đọc + đề xuất');
  const frame = q.buildQuickAsks({ layout: 'frame', bases: [BASE], appConnected: false }).map((x) => x.k);
  assert.ok(!frame.some((k) => q.FILE_ASK_KEYS.includes(k)), 'bố cục frame giữ nguyên bộ nút workflow');
});

console.log(`  quickAsks: ${pass} kiểm qua`);
