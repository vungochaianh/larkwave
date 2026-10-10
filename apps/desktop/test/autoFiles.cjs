/**
 * Tự động hoá đọc tệp → ghi Lark, không người trông:
 *   - thư mục riêng của quy tắc (inputs/sources/outputs, "chỉ xử lý tệp mới" theo sha256, giữ N lần chạy)
 *   - luật duyệt không người trông (cộng thêm tự chạy; ghi đè/thay tệp/gửi/xoá theo quyền; loại "never")
 *   - ghi theo khoá `match_by` (kế hoạch thuần + Open API giả + đường phiên web giả, chạy hai lần không trùng)
 *   - biên bản lần chạy, động cơ lịch (chạy bằng phiên web khi chưa có custom app, "chỉ trên máy này",
 *     lần hỏng vẫn có biên bản và chỉ ghi MỘT dòng lịch sử)
 *   - thư mục được phép trong lượt tự động (công cụ thật đọc inputs/, ghi outputs/<lần>)
 *
 *   bash apps/desktop/test/run.sh
 */
const assert = require('node:assert');
const Module = require('node:module');
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const orig = Module._load;
Module._load = function (req) {
  if (req === 'electron') return { app: { getPath: () => tmpdir(), isPackaged: false, getVersion: () => '0.0.0' }, safeStorage: { isEncryptionAvailable: () => false }, session: { fromPartition: () => ({}) }, BrowserWindow: function () {}, shell: {}, net: {}, Notification: { isSupported: () => false } };
  return orig.apply(this, arguments);
};

const B = join(__dirname, '..', '.test-build', 'runtime', 'lark');
const AF = require(join(B, 'automationFiles.js'));
const UP = require(join(B, 'unattendedPolicy.js'));
const PL = require(join(B, 'upsertPlan.js'));
const REC = require(join(B, 'autoRunRecorder.js'));
const FC = require(join(B, 'fileContext.js'));
const FB = require(join(B, 'fileBuild.js'));
const X = require(join(B, 'larkToolExec.js'));

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

(async () => {
  const BASE = mkdtempSync(join(tmpdir(), 'lw-auto-'));

  // ── 1. thư mục của quy tắc ─────────────────────────────────────────────────────────────────
  await t('thư mục quy tắc: inputs/sources/outputs; thêm tệp KHÔNG ghi đè tệp khác cùng tên; tên không thoát được thư mục', async () => {
    const f = await AF.ensureAutomationFolder(BASE, 'rule-1');
    assert.strictEqual(f.root, join(BASE, 'lark', 'automations', 'rule-1'));
    for (const d of [f.inputs, f.sources, f.outputs]) assert.ok(existsSync(d));
    const a = await AF.addInputFile(f, 'Đơn hàng.xlsx', Buffer.from('v1'));
    const same = await AF.addInputFile(f, 'Đơn hàng.xlsx', Buffer.from('v1'));
    const diff = await AF.addInputFile(f, 'Đơn hàng.xlsx', Buffer.from('v2'));
    assert.strictEqual(a.path, same.path, 'cùng nội dung → cùng tệp');
    assert.strictEqual(diff.name, 'Đơn hàng-2.xlsx');
    const evil = await AF.addInputFile(f, '../../../.ssh/id_rsa', Buffer.from('x'));
    assert.ok(evil.path.startsWith(f.inputs), evil.path);
    assert.strictEqual(AF.automationRoot(BASE, '../x').endsWith(join('automations', 'x')), true);
  });

  await t('"chỉ xử lý tệp mới" theo NỘI DUNG (sha256): đổi tên không thành mới; chỉ đánh dấu sau lượt thành công', async () => {
    const f = await AF.ensureAutomationFolder(BASE, 'rule-2');
    await AF.addInputFile(f, 'a.csv', Buffer.from('Mã,Tên\n001,An\n'));
    await AF.addInputFile(f, 'b.csv', Buffer.from('Mã,Tên\n002,Bình\n'));
    writeFileSync(join(f.inputs, '.hidden'), 'x');
    let files = await AF.listInputFiles(f);
    assert.deepStrictEqual(files.map((x) => x.rel), ['inputs/a.csv', 'inputs/b.csv'], 'bỏ tệp ẩn');
    let p = AF.pendingFiles(files, await AF.readAutoState(f), true);
    assert.strictEqual(p.todo.length, 2);
    await AF.markProcessed(f, p.todo);
    p = AF.pendingFiles(await AF.listInputFiles(f), await AF.readAutoState(f), true);
    assert.strictEqual(p.todo.length, 0, 'lần 2: không có tệp mới');
    await AF.addInputFile(f, 'a-doi-ten.csv', Buffer.from('Mã,Tên\n001,An\n'));
    await AF.addInputFile(f, 'c.csv', Buffer.from('Mã,Tên\n003,Chi\n'));
    p = AF.pendingFiles(await AF.listInputFiles(f), await AF.readAutoState(f), true);
    assert.deepStrictEqual(p.todo.map((x) => x.name), ['c.csv'], 'đổi tên cùng nội dung không tính là mới');
    assert.strictEqual(AF.pendingFiles(await AF.listInputFiles(f), await AF.readAutoState(f), false).todo.length, 4, 'tắt tuỳ chọn → xử lý tất cả');
  });

  await t('mỗi lần chạy một thư mục outputs/<mốc>; giữ N lần gần nhất; trích chữ Excel vào .extract/ cho agent Read', async () => {
    const f = await AF.ensureAutomationFolder(BASE, 'rule-3');
    const dirs = [];
    for (let k = 0; k < 4; k++) {
      const d = await AF.newRunDir(f, `20261010-09000${k}`);
      writeFileSync(join(d, 'Báo cáo.xlsx'), 'x');
      dirs.push(d);
    }
    const again = await AF.newRunDir(f, '20261010-090003');
    assert.notStrictEqual(again, dirs[3], 'trùng mốc → thư mục khác');
    assert.strictEqual(await AF.pruneRuns(f, 2), 3);
    assert.deepStrictEqual(readdirSync(f.outputs).sort(), ['20261010-090003', '20261010-090003-2']);
    const outs = await AF.listRunOutputs(dirs[3]);
    assert.strictEqual(outs[0].name, 'Báo cáo.xlsx');
    assert.ok(/spreadsheetml/.test(outs[0].mime));
    await AF.addInputFile(f, 'Nguồn.xlsx', FB.buildXlsx({ name: 'S', rows: [['Mã', 'Tên'], ['007', 'Tâm']] }));
    const names = await AF.extractForAgent(f, await AF.listInputFiles(f));
    assert.ok(names.includes('inputs/Nguồn.xlsx'));
    const txt = names.find((n) => n.startsWith('.extract/'));
    assert.ok(txt && /007/.test(readFileSync(join(f.root, txt), 'utf8')), names.join(','));
  });

  // ── 2. luật duyệt không người trông ─────────────────────────────────────────────────────────
  const TOOL = (name, extra = {}) => ({ name, gated: true, ...extra });
  const WRITE = TOOL('lark_web_write_records', { additive: true, additiveWhen: (i) => !(i.match_by && i.match_by.length) });
  const ATTACH = TOOL('lark_web_attach_file', { additive: true, additiveWhen: (i) => i.replace !== true });
  await t('không người trông: cộng thêm tự chạy; ghi đè/thay tệp/gửi/xoá CHỈ khi được cấp; phân quyền/workflow/lái giao diện KHÔNG BAO GIỜ', () => {
    const none = {};
    const all = { overwriteCells: true, replaceAttachments: true, sendMessages: true, deleteRecords: true };
    const d = (tool, input, perms, dyn) => UP.unattendedDecision(tool, input, perms, dyn);
    assert.ok(d(WRITE, { records: [] }, none).allow, 'thêm bản ghi mới = cộng thêm');
    assert.ok(d(ATTACH, { path: 'x' }, none).allow, 'đính ghi thêm = cộng thêm');
    assert.ok(d(TOOL('lark_web_drive_upload', { additive: true }), {}, none).allow);
    const ow = d(WRITE, { match_by: ['Mã'] }, none, false);
    assert.ok(!ow.allow && ow.category === 'overwrite' && /Ghi đè ô/.test(ow.reason), JSON.stringify(ow));
    assert.ok(d(WRITE, { match_by: ['Mã'] }, none, true).allow, 'ghi theo khoá mà không có dòng nào phải sửa = cộng thêm');
    assert.ok(d(WRITE, { match_by: ['Mã'] }, { overwriteCells: true }, false).allow);
    assert.strictEqual(d(ATTACH, { replace: true }, none).category, 'replace_attachment');
    assert.ok(!d(ATTACH, { replace: true }, { overwriteCells: true }).allow, 'quyền ghi đè ô KHÔNG bao gồm thay tệp');
    assert.ok(d(ATTACH, { replace: true }, { replaceAttachments: true }).allow);
    assert.strictEqual(d(TOOL('send_file'), { to: 'chat' }, none).category, 'send');
    assert.ok(d(TOOL('send_file'), { to: 'drive' }, none).allow, 'send_file lên Drive = cộng thêm');
    assert.ok(!d(TOOL('messaging_send_message'), {}, none).allow);
    assert.ok(d(TOOL('messaging_send_message'), {}, { sendMessages: true }).allow);
    assert.strictEqual(d(TOOL('bitable_delete_record'), {}, none).category, 'delete');
    assert.ok(d(TOOL('bitable_batch_delete_records'), {}, { deleteRecords: true }).allow);
    assert.ok(!d(TOOL('lark_web_update_records'), {}, none).allow);
    for (const n of ['bitable_update_role', 'bitable_add_role_member', 'bitable_workflow_update', 'schedule_agent_job', 'skill_save', 'lark_ui_act', 'bitable_create_workflow']) {
      const r = d(TOOL(n), {}, all);
      assert.ok(!r.allow && r.category === 'never', n);
    }
  });

  await t('quyền hiệu lực: quy tắc CŨ chế độ thực thi giữ sự cho phép cũ; quy tắc mới / chỉ-đọc không cấp gì', () => {
    assert.deepStrictEqual(UP.effectivePerms({ action: { type: 'run_agent', mode: 'build' } }), { perms: { overwriteCells: true, replaceAttachments: true, sendMessages: true, deleteRecords: true }, legacy: true });
    assert.deepStrictEqual(UP.effectivePerms({ action: { type: 'run_agent', mode: 'ask' } }), { perms: {}, legacy: false });
    assert.deepStrictEqual(UP.effectivePerms({ permissions: {}, action: { type: 'run_agent', mode: 'build' } }), { perms: {}, legacy: false });
    assert.deepStrictEqual(UP.effectivePerms({ permissions: { sendMessages: true }, action: { type: 'run_agent' } }).perms, { sendMessages: true });
  });

  await t('cờ cộng thêm ĐỘNG: ghi theo khoá không có dòng phải sửa → tự duyệt; có dòng phải sửa → hỏi', async () => {
    const ctx = { autoApproveTool: () => true };
    assert.strictEqual(X.needsConfirmation(WRITE, ctx, false, { match_by: ['Mã'] }), true, 'tĩnh: có match_by → hỏi');
    assert.strictEqual(X.needsConfirmation(WRITE, ctx, false, { match_by: ['Mã'] }, true), false);
    assert.strictEqual(X.needsConfirmation(WRITE, ctx, false, { match_by: ['Mã'] }, false), true);
    assert.strictEqual(X.needsConfirmation({ name: 'x', gated: true }, ctx, false, {}, true), true, 'tool không có cờ additive thì kiểm động không mở được');
    assert.strictEqual(await X.runAdditiveCheck({ additiveCheck: async () => { throw new Error('mạng'); } }, {}, null), false, 'kiểm lỗi → nghi ngờ thì hỏi');
    assert.strictEqual(await X.runAdditiveCheck({}, {}, null), undefined);
  });

  // ── 3. ghi theo khoá ──────────────────────────────────────────────────────────────────────
  await t('khoá: chuẩn hoá (hoa/thường, khoảng trắng, 12.0 ≡ 12, "001" giữ là chữ); kế hoạch thêm/sửa/giữ/từ chối', () => {
    assert.strictEqual(PL.normKey('  DH-001 '), 'dh-001');
    assert.strictEqual(PL.normKey(12), '12');
    assert.strictEqual(PL.normKey('12.0'), '12');
    assert.strictEqual(PL.normKey('001'), '001');
    assert.notStrictEqual(PL.normKey('001'), PL.normKey('1'));
    assert.strictEqual(PL.compositeKey(['A', '']), '', 'khoá ghép thiếu một phần = rỗng');
    const existing = [{ id: 'rec1', key: 'dh-001' }, { id: 'rec2', key: 'dh-002' }, { id: 'rec3', key: 'dh-009' }, { id: 'rec4', key: 'dh-009' }];
    const incoming = [
      { key: 'dh-001', fields: ['Tên', 'Số'] },
      { key: 'dh-002', fields: ['Tên'] },
      { key: 'dh-003', fields: ['Tên'] },
      { key: '', fields: ['Tên'] },
      { key: 'dh-003', fields: ['Tên'] },
      { key: 'dh-009', fields: ['Tên'] },
    ];
    const plan = PL.planUpsert(existing, incoming, (i, id, f) => !(i === 0 && f === 'Số'));
    assert.deepStrictEqual(plan.creates, [2]);
    assert.deepStrictEqual(plan.updates, [{ index: 0, recordId: 'rec1', fields: ['Số'] }]);
    assert.deepStrictEqual(plan.unchanged, [{ index: 1, recordId: 'rec2' }]);
    assert.deepStrictEqual(plan.rejected.map((r) => r.index), [3, 4, 5]);
    assert.match(PL.planSummary(plan), /1 dòng mới · 1 dòng cần sửa · 1 dòng không đổi · 3 dòng không ghi được/);
  });

  await t('ghi theo khoá qua Open API (custom app, cũng là đường của máy chạy hộ): chạy 2 lần với cùng dữ liệu KHÔNG tạo trùng', async () => {
    const rows = new Map(); // id → fields
    let seq = 0;
    const calls = [];
    const client = {
      async request(method, path, opts = {}) {
        calls.push(path.split('/records/')[1] || path);
        if (path.endsWith('/records/search')) return { items: [...rows].map(([record_id, fields]) => ({ record_id, fields })), total: rows.size, has_more: false };
        if (path.endsWith('/records/batch_create')) return { records: opts.data.records.map((r) => { const id = `rec${++seq}`; rows.set(id, { ...r.fields }); return { record_id: id }; }) };
        if (path.endsWith('/records/batch_update')) { for (const r of opts.data.records) rows.set(r.record_id, { ...rows.get(r.record_id), ...r.fields }); return {}; }
        if (path.endsWith('/records/batch_get')) return { records: opts.data.record_ids.filter((id) => rows.has(id)).map((id) => ({ record_id: id })) };
        throw new Error('không mong đợi ' + path);
      },
    };
    const data = [{ fields: { 'Mã đơn': 'DH-001', 'Số tiền': 100 } }, { fields: { 'Mã đơn': 'DH-002', 'Số tiền': 200 } }];
    const r1 = await PL.openApiUpsert(client, 'app1', 'tbl1', data, ['Mã đơn']);
    assert.ok(r1.ok && r1.created === 2 && r1.updated === 0 && r1.verified, JSON.stringify(r1));
    calls.length = 0;
    const r2 = await PL.openApiUpsert(client, 'app1', 'tbl1', data, ['Mã đơn']);
    assert.ok(r2.ok && r2.created === 0 && r2.updated === 0 && r2.unchanged === 2, JSON.stringify(r2));
    assert.deepStrictEqual(calls, ['search'], 'lần 2 chỉ đọc, không ghi gì');
    assert.strictEqual(rows.size, 2, 'không có dòng trùng');
    const r3 = await PL.openApiUpsert(client, 'app1', 'tbl1', [{ fields: { 'Mã đơn': 'dh-002 ', 'Số tiền': 250 } }, { fields: { 'Mã đơn': 'DH-003', 'Số tiền': 300 } }], ['Mã đơn']);
    assert.ok(r3.created === 1 && r3.updated === 1 && rows.size === 3, JSON.stringify(r3));
    assert.strictEqual([...rows.values()].find((f) => f['Mã đơn'] === 'DH-002')['Số tiền'], 250);
    const { plan } = await PL.openApiUpsertPlan(client, 'app1', 'tbl1', data, ['Mã đơn']);
    assert.strictEqual(plan.updates.length, 1, 'kiểm động: DH-002 đã đổi → có dòng cần sửa → không còn là cộng thêm');
  });

  await t('ghi theo khoá qua PHIÊN WEB (lark_web_write_records + match_by): thêm, chạy lại không trùng, sửa đúng ô đổi, đọc lại từng ô', async () => {
    const S = require(join(B, 'larkWebSession.js')).getLarkWebSession();
    const fields = [
      { id: 'fldKey00001', name: 'Mã đơn', type: 1, uiType: 'Text', isPrimary: true },
      { id: 'fldAmt00001', name: 'Số tiền', type: 2, uiType: 'Number', formatter: '0' },
    ];
    const recs = {}; // id → { fid: { value } }
    let seq = 0;
    S.webHost = () => 'https://x.sg.larksuite.com';
    S.webTableSchema = async () => ({ table: { id: 'tblTest0001', name: 'Đơn', fields }, timezone: 'Asia/Saigon', baseName: 'Base Test', tables: [] });
    S.webReadAllRecords = async () => ({ ids: Object.keys(recs), recordMap: JSON.parse(JSON.stringify(recs)), total: Object.keys(recs).length });
    S.webRecordsById = async (_t, _tb, ids) => Object.fromEntries(ids.filter((id) => recs[id]).map((id) => [id, JSON.parse(JSON.stringify(recs[id]))]));
    S.webRunInBase = async (_t, script) => {
      const op = JSON.parse(/var OP = (\{[\s\S]*?\});\n/.exec(script)[1]);
      const created = op.creates.map((cells) => { const id = `recW${++seq}`; recs[id] = Object.fromEntries(Object.entries(cells).map(([k, c]) => [k, { value: c.value }])); return id; });
      const updated = op.updates.map((u) => { for (const [k, c] of Object.entries(u.cells)) recs[u.recordId][k] = { value: c.value }; return u.recordId; });
      return { ok: true, created, updated, errors: [] };
    };
    const { larkWebWriteTools } = require(join(B, 'tools', 'larkWebWrite.js'));
    const tool = larkWebWriteTools.find((x) => x.name === 'lark_web_write_records');
    const input = (rows) => ({ app_token: 'BaseTok', table: 'tblTest0001', match_by: ['Mã đơn'], records: rows.map((r) => ({ fields: r })) });
    const rows = [{ 'Mã đơn': 'DH-001', 'Số tiền': 100 }, { 'Mã đơn': 'DH-002', 'Số tiền': 200 }];
    assert.strictEqual(await tool.additiveCheck(input(rows), null), true, 'bảng trống → chỉ thêm mới = cộng thêm');
    const r1 = await tool.exec(input(rows), null);
    assert.ok(r1.ok && r1.created === 2 && r1.verified, JSON.stringify(r1));
    const r2 = await tool.exec(input(rows), null);
    assert.ok(r2.ok && r2.created === 0 && r2.unchanged === 2, JSON.stringify(r2));
    assert.strictEqual(Object.keys(recs).length, 2, 'chạy lần 2 KHÔNG trùng dòng');
    const changed = [{ 'Mã đơn': 'DH-002', 'Số tiền': 250 }];
    assert.strictEqual(await tool.additiveCheck(input(changed), null), false, 'có dòng phải sửa → không còn cộng thêm');
    const r3 = await tool.exec(input(changed), null);
    assert.ok(r3.ok && r3.updated === 1 && r3.created === 0 && r3.verified, JSON.stringify(r3));
    assert.strictEqual(Object.values(recs).find((r) => r.fldKey00001.value[0].text === 'DH-002').fldAmt00001.value, 250);
    const bad = await tool.preflight({ ...input(rows), match_by: ['Không có'] }, null);
    assert.ok(bad && bad.ok === false && /Cột khoá không có/.test(bad.error), JSON.stringify(bad));
  });

  // ── 4. biên bản ──────────────────────────────────────────────────────────────────────────
  await t('biên bản: bọc công cụ ghi lại đã đọc / đã ghi (mới·sửa·không đổi·link) / đọc lại; dòng tóm tắt', async () => {
    const report = {};
    const tools = REC.wrapToolsForReport(
      [
        { name: 'lark_web_read_records', gated: false, exec: async () => ({ table: 'Đơn', total: 21, returned: 21 }) },
        { name: 'lark_web_write_records', gated: true, additive: true, exec: async () => ({ ok: true, table: 'Đơn', created: 2, updated: 1, unchanged: 3, verified: true, url: 'https://x/base/T?table=t' }) },
        { name: 'lark_web_attach_file', gated: true, additive: true, exec: async () => ({ ok: true, field: 'Tệp', record_id: 'rec1', file_name: 'Báo cáo.xlsx', verified: false }) },
        { name: 'lark_web_drive_upload', gated: true, additive: true, exec: async () => ({ ok: false, error: 'x' }) },
      ],
      report,
    );
    for (const x of tools) await x.exec({}, null);
    assert.deepStrictEqual(report.read, [{ what: 'bảng «Đơn»', rows: 21 }]);
    assert.strictEqual(report.written.length, 2, 'lần hỏng (ok:false) không tính là đã ghi');
    assert.deepStrictEqual(report.written[0], { tool: 'lark_web_write_records', target: 'Đơn', created: 2, updated: 1, unchanged: 3, url: 'https://x/base/T?table=t', verified: true });
    assert.deepStrictEqual(report.verify, { ok: 1, failed: 1 });
    report.skipped = [{ tool: 'messaging_send_message', category: 'send', reason: 'x' }];
    assert.match(REC.reportLine(report), /ghi: 2 mới · 1 sửa.*đọc lại 1 khớp · 1 LỆCH.*1 thao tác bị bỏ qua/);
    assert.strictEqual(tools[1].additive, true, 'bọc giữ nguyên cờ của tool');
  });

  // ── 5. động cơ lịch ──────────────────────────────────────────────────────────────────────
  const { AutomationEngine } = require(join(B, 'automationEngine.js'));
  // Mỗi quy tắc một câu lệnh riêng: hai lịch cùng câu lệnh + cùng nhịp bị gộp (dedupeSchedules).
  const sched = (id, extra = {}) => ({ id, name: id, enabled: true, appToken: '', tableId: '', intervalSec: 60, triggerType: 'schedule', schedule: { mode: 'interval' }, action: { type: 'run_agent', prompt: `việc ${id}`, mode: 'build' }, createdAt: '2020-01-01T00:00:00Z', ...extra });

  await t('chưa có custom app + phiên Lark web còn sống → lịch "Chạy AI agent" vẫn chạy; biên bản vào lịch sử; quy tắc theo bảng thì báo cần custom app', async () => {
    let rules = [sched('s1'), { ...sched('r1'), triggerType: 'record', appToken: 'a', tableId: 't', action: { type: 'send_message', receiveIdType: 'chat_id', receiveId: 'c', text: 'x' } }];
    const got = [];
    const eng = new AutomationEngine(() => null, () => rules, (l) => (rules = l), undefined, {
      run: async (prompt, mode, stats, rule) => {
        got.push(rule.id);
        stats.report = { written: [{ tool: 'lark_web_write_records', created: 2 }] };
        return 'xong';
      },
    }, undefined, undefined, { env: 'desktop', canRunWithoutClient: () => true });
    const r = await eng.execute('s1');
    assert.ok(!r.error && r.fired === 1, JSON.stringify(r));
    assert.deepStrictEqual(got, ['s1']);
    assert.strictEqual(rules.find((x) => x.id === 's1').runs[0].report.written[0].created, 2);
    const r2 = await eng.execute('r1');
    assert.match(r2.error, /custom app/);
    const eng2 = new AutomationEngine(() => null, () => rules, (l) => (rules = l), undefined, { run: async () => 'x' }, undefined, undefined, { canRunWithoutClient: () => false });
    assert.match((await eng2.execute('s1')).error, /Lark web/);
  });

  await t('"chỉ trên máy này": máy chạy hộ bỏ qua; app desktop chạy kể cả khi KHÔNG giữ quyền chạy lịch', async () => {
    const mk = (env, mine) => {
      let rules = [sched('d1', { runOn: 'desktop' }), sched('a1')];
      const ran = [];
      const eng = new AutomationEngine(() => ({}), () => rules, (l) => (rules = l), async () => mine, { run: async (_p, _m, _s, rule) => (ran.push(rule.id), 'ok') }, undefined, undefined, { env });
      return { eng, ran };
    };
    const hosted = mk('hosted', true);
    await hosted.eng.tick();
    await new Promise((r) => setTimeout(r, 30));
    assert.deepStrictEqual(hosted.ran, ['a1'], 'VM chỉ chạy quy tắc không bị ghim máy');
    const desk = mk('desktop', false);
    await desk.eng.tick();
    await new Promise((r) => setTimeout(r, 30));
    assert.deepStrictEqual(desk.ran, ['d1'], 'desktop không giữ quyền vẫn chạy quy tắc ghim máy này, không chạy quy tắc chung');
  });

  await t('lần chạy HỎNG vẫn có biên bản (vd thao tác bị bỏ qua) và chỉ MỘT dòng lịch sử; upsert với id sinh sẵn tạo đúng id', async () => {
    let rules = [];
    const eng = new AutomationEngine(() => ({}), () => rules, (l) => (rules = l), undefined, {
      run: async (_p, _m, stats) => {
        stats.report = { skipped: [{ tool: 'messaging_send_message', category: 'send', reason: 'thiếu quyền' }] };
        throw new Error('Quá thời gian chạy (900 giây)');
      },
    });
    eng.upsert({ id: 'draft-id-123', name: 'x', enabled: true, appToken: '', tableId: '', intervalSec: 60, triggerType: 'schedule', schedule: { mode: 'interval' }, action: { type: 'run_agent', prompt: 'p' }, permissions: { overwriteCells: true }, files: { onlyNewFiles: true }, runOn: 'desktop' });
    const saved = rules.find((x) => x.id === 'draft-id-123');
    assert.ok(saved && saved.permissions.overwriteCells && saved.files.onlyNewFiles && saved.runOn === 'desktop', JSON.stringify(saved));
    const r = await eng.execute('draft-id-123');
    assert.match(r.error, /Quá thời gian/);
    const runs = rules.find((x) => x.id === 'draft-id-123').runs;
    assert.strictEqual(runs.length, 1, 'không ghi trùng dòng lịch sử');
    assert.strictEqual(runs[0].ok, false);
    assert.strictEqual(runs[0].report.skipped[0].reason, 'thiếu quyền');
    eng.stop();
  });

  // ── 6. thư mục được phép trong lượt tự động (công cụ thật) ───────────────────────────────
  await t('lượt tự động: công cụ thật đọc được inputs/ của quy tắc, ghi vào outputs/<lần chạy>, từ chối tệp ngoài', async () => {
    const f = await AF.ensureAutomationFolder(BASE, 'rule-6');
    const src = await AF.addInputFile(f, 'Đơn.xlsx', FB.buildXlsx({ name: 'S', rows: [['Mã', 'Tiền'], ['DH-1', 10]] }));
    const runDir = await AF.newRunDir(f);
    const { fileTools } = require(join(B, 'tools', 'files.js'));
    const tool = (n) => fileTools.find((x) => x.name === n);
    const ctx = { outDir: runDir, attachDir: f.root, extraRoots: [f.root] };
    const read = await FC.withTurnFiles(ctx, () => tool('prepare_local_file').exec({ path: src.path }));
    assert.ok(read.ok && /DH-1/.test(read.text), JSON.stringify(read).slice(0, 200));
    const made = await FC.withTurnFiles(ctx, () => tool('create_file').exec({ format: 'xlsx', name: 'Báo cáo', rows: [['A'], [1]] }));
    assert.ok(made.path.startsWith(runDir), made.path);
    const other = await AF.ensureAutomationFolder(BASE, 'rule-khac');
    const leak = await AF.addInputFile(other, 'bi-mat.csv', Buffer.from('x'));
    const denied = await FC.withTurnFiles(ctx, () => tool('prepare_local_file').exec({ path: leak.path }));
    assert.strictEqual(denied.ok, false, 'quy tắc này không đọc được thư mục của quy tắc khác');
  });

  await t('mã nguồn: lượt tự động dùng thư mục riêng + luật không người trông + biên bản + kỹ năng; máy chạy hộ cũng vậy', () => {
    const svc = readFileSync(join(__dirname, '..', 'main', 'runtime', 'lark', 'larkService.ts'), 'utf8');
    const body = svc.slice(svc.indexOf('private async runAutomationAgent('), svc.indexOf('private async fetchAutoSource('));
    assert.ok(/files: \{ outDir: runDir, attachDir: folder\.root, extraRoots: \[folder\.root\] \}/.test(body));
    assert.ok(/unattendedDecision\(tool, input, perms\)/.test(body));
    assert.ok(/wrapToolsForReport\(tools, report\)/.test(body));
    assert.ok(/withSkills: true/.test(body));
    assert.ok(/if \(ok && todo\.length\) await markProcessed/.test(body), 'chỉ lượt thành công mới đánh dấu đã xử lý');
    assert.ok(/900_000/.test(body), 'giữ trần giờ 900s');
    const hr = readFileSync(join(__dirname, '..', 'main', 'runtime', 'lark', 'headlessRunner.ts'), 'utf8');
    assert.ok(/unattendedDecision\(t, /.test(hr) && /autoApprove: false/.test(hr) && /env: 'hosted'/.test(hr));
  });

  console.log(fail ? `\n${fail} ca SAI` : `\n  autoFiles: TẤT CẢ ĐÚNG (${pass})`);
  process.exit(fail ? 1 : 0);
})();
