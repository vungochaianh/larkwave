/**
 * Workflow Lark Base qua Open API chính thức (v3): bộ kiểm thiết kế, hồ sơ Base, link → token,
 * lỗi → tiếng Việt, và chốt "ghi thì phải hỏi".
 *
 * Điều đáng giữ nhất ở đây là HAI CHIỀU của bộ kiểm: mọi ví dụ trong tài liệu chính thức PHẢI qua
 * (chặn nhầm là bắt người dùng sửa một thiết kế đúng), và mỗi lỗi kinh điển PHẢI bị bắt với một câu
 * nói rõ chỗ sai (lọt là để người dùng duyệt một thiết kế mà Lark sẽ trả "[2200] Internal Error").
 *
 *   bash apps/desktop/test/run.sh
 */
const assert = require('node:assert');
const Module = require('node:module');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const orig = Module._load;
Module._load = function (req) {
  if (req === 'electron')
    return {
      Notification: class { show() {} static isSupported() { return false; } },
      app: { getPath: () => '/tmp', on() {}, isReady: () => false },
      BrowserWindow: class {},
      ipcMain: { handle() {}, on() {} },
      session: {},
      shell: {},
      net: {},
      webContents: {},
      protocol: {},
    };
  return orig.apply(this, arguments);
};

const B = join(__dirname, '..', '.test-build', 'runtime', 'lark');
const w = require(join(B, 'workflowV3.js'));
const docs = require(join(B, 'docs', 'workflowDocs.js'));
const { workflowV3Tools, resolveBaseInput } = require(join(B, 'tools', 'workflowsV3.js'));
const { executeLarkTool } = require(join(B, 'larkToolExec.js'));
const core = require('@larkwave/core');

let passed = 0;
const ok = (name) => {
  passed++;
  console.log('✓', name);
};
const clone = (o) => JSON.parse(JSON.stringify(o));
const errText = (r) => r.errors.map((e) => `${e.path}: ${e.message}`).join('\n');

// ── 0. Tài liệu nhúng khớp từng byte với bản gốc + giấy phép đi kèm ────────────────
const D = join(__dirname, '..', 'main', 'runtime', 'lark', 'docs');
assert.strictEqual(docs.LARK_WORKFLOW_GUIDE_MD, readFileSync(join(D, 'lark-base-workflow.md'), 'utf8'), 'workflowDocs.ts lệch lark-base-workflow.md — chạy lại gen-workflow-docs.mjs');
assert.strictEqual(docs.LARK_WORKFLOW_SCHEMA_MD, readFileSync(join(D, 'lark-base-workflow-schema.md'), 'utf8'), 'workflowDocs.ts lệch lark-base-workflow-schema.md');
assert.strictEqual(docs.LARK_CLI_LICENSE, readFileSync(join(D, 'LICENSE.larksuite-cli'), 'utf8'));
assert.ok(/MIT License/.test(docs.LARK_CLI_LICENSE) && /Lark Technologies/.test(docs.LARK_CLI_LICENSE));
ok('tài liệu nhúng khớp bản .md gốc, kèm giấy phép MIT');

// ── 1. Mọi ví dụ chính thức đều qua ───────────────────────────────────────────────
const examples = [...(docs.LARK_WORKFLOW_GUIDE_MD + '\n' + docs.LARK_WORKFLOW_SCHEMA_MD).matchAll(/```json\n([\s\S]*?)```/g)]
  .map((m) => {
    try {
      return JSON.parse(m[1]);
    } catch {
      return null;
    }
  })
  .filter((j) => j && Array.isArray(j.steps));
assert.ok(examples.length >= 9, `chỉ tìm được ${examples.length} ví dụ`);
for (const ex of examples) {
  const r = w.validateWorkflowBody(ex);
  assert.ok(r.ok, `ví dụ chính thức «${ex.title}» bị chặn nhầm:\n${errText(r)}`);
  assert.strictEqual(r.warnings.length, 0, `ví dụ «${ex.title}» có cảnh báo: ${JSON.stringify(r.warnings)}`);
}
ok(`${examples.length} ví dụ trong tài liệu chính thức đều hợp lệ, không cảnh báo`);

const byTitle = (t) => clone(examples.find((e) => e.title === t));
const EX_IFELSE = byTitle('订单金额自动判断');
const EX_LOOP = byTitle('每日待处理订单提醒');
const EX_AI = byTitle('用户反馈自动分流');

// ── 2. Lỗi cấu trúc ───────────────────────────────────────────────────────────────
const expectErr = (label, body, re, opts) => {
  const r = w.validateWorkflowBody(body, opts);
  assert.ok(!r.ok, `${label}: đáng lẽ bị chặn`);
  assert.ok(re.test(errText(r)), `${label}: thông báo không rõ:\n${errText(r)}`);
  ok(`chặn: ${label}`);
  return r;
};

let b = clone(EX_IFELSE);
b.steps[2].id = 'step_check_amount';
expectErr('id bước trùng', b, /trùng/);

b = clone(EX_IFELSE);
b.steps[0].next = 'step_khong_co';
expectErr('next trỏ bước không tồn tại', b, /steps\[0\]\.next.*không tồn tại/);

b = clone(EX_IFELSE);
b.steps[1].children.links[0].to = 'step_notify_managr';
expectErr('link trỏ sai + gợi ý tên gần', b, /không tồn tại.*step_notify_manager/);

b = clone(EX_IFELSE);
b.steps[0].type = 'CreateRecordTrigger';
expectErr('loại bước không có (gợi ý AddRecordTrigger)', b, /CreateRecordTrigger.*AddRecordTrigger/);

b = clone(EX_LOOP);
delete b.steps[3].data.btn_list;
expectErr('LarkMessageAction thiếu btn_list', b, /btn_list/);

b = clone(EX_IFELSE);
b.steps.push({ id: 'step_wait', type: 'Delay', next: null, data: {} });
b.steps[4].next = 'step_wait';
expectErr('Delay thiếu duration', b, /duration/);

b = clone(EX_IFELSE);
b.steps[3].data.ref_info = null;
expectErr('SetRecordAction thiếu filter_info lẫn ref_info', b, /filter_info.*ref_info/);

b = clone(EX_IFELSE);
b.steps[0].data.condition_list = [];
expectErr('condition_list rỗng', b, /condition_list.*null/);

b = clone(EX_IFELSE);
b.steps.unshift({ id: 'step_t2', type: 'TimerTrigger', next: 'step_trigger', data: { rule: 'DAILY' } });
expectErr('hai trigger', b, /Chỉ được có 1 trigger/);

b = clone(EX_IFELSE);
b.steps.push(b.steps.shift());
expectErr('trigger không đứng đầu', b, /ĐẦU TIÊN/);

b = clone(EX_IFELSE);
b.steps[4].next = 'step_check_amount';
expectErr('vòng lặp vô hạn bằng next', b, /VÒNG LẶP/);

b = clone(EX_IFELSE);
b.steps[1].children.links.pop();
expectErr('IfElseBranch thiếu if_false', b, /if_true.*if_false/);

b = clone(EX_IFELSE);
b.steps[2].children = { links: [{ kind: 'case', to: 'step_log' }] };
expectErr('hành động có children', b, /không được có `children`/);

b = clone(EX_IFELSE);
b.steps[1].data.condition.conditions[0].conditions[0].left_value.value = '$.step_log.x';
expectErr('ref tới bước ĐỨNG SAU', b, /ĐỨNG TRƯỚC/);

b = clone(EX_LOOP);
b.steps[3].data.content[1].value = '$.step_loop_customers.item.客户名称';
expectErr('ref dùng TÊN cột (không cần hồ sơ Base)', b, /field_id/);

b = clone(EX_IFELSE);
b.steps[2].data.content.push({ value_type: 'ref', value: '$.step_check_amount.x' });
expectErr('ref tới bước không có đầu ra (IfElseBranch)', b, /không có đầu ra/);

b = clone(EX_AI);
b.steps[1].children.links[1].label = 'branch_9';
expectErr('AIClassificationBranch: label sai thứ tự (luật CLI)', b, /branch_2/);

b = clone(EX_AI);
b.steps[1].data.mode = 'exclusive';
expectErr('AIClassificationBranch: không nhận mode (luật CLI)', b, /mode/);

b = clone(EX_LOOP);
b.steps[2].data.data = [{ value_type: 'text', value: 'x' }];
expectErr('Loop.data không phải ref', b, /Loop\.data/);

expectErr('steps rỗng', { title: 'x', steps: [] }, /ít nhất 1 bước/);
expectErr('thiếu title khi tạo', { steps: clone(EX_IFELSE).steps }, /title/);

// ── 3. Đối chiếu Base thật (hồ sơ) ────────────────────────────────────────────────
const profile = {
  tables: [
    {
      table_id: 'tblOrders',
      name: 'Đơn hàng',
      fields: [
        { field_id: 'fldCode', name: 'Mã đơn', type: 1 },
        { field_id: 'fldAmount', name: 'Số tiền', type: 2 },
        { field_id: 'fldStatus', name: 'Trạng thái', type: 3, options: ['Mới', 'Đã duyệt', 'Huỷ'] },
        { field_id: 'fldOwner', name: 'Phụ trách', type: 11 },
        { field_id: 'fldDue', name: 'Hạn', type: 5 },
      ],
    },
    { table_id: 'tblLog', name: 'Nhật ký', fields: [{ field_id: 'fldNote', name: 'Ghi chú', type: 1 }] },
    { table_id: 'tblOther', name: 'Khách hàng' },
  ],
};
const good = {
  title: 'Duyệt đơn lớn',
  steps: [
    { id: 't', type: 'AddRecordTrigger', next: 'b', data: { table_name: 'Đơn hàng', watched_field_name: 'Mã đơn', condition_list: null } },
    {
      id: 'b',
      type: 'IfElseBranch',
      next: null,
      children: { links: [{ kind: 'if_true', to: 'msg' }, { kind: 'if_false', to: 'set' }] },
      data: { condition: { conjunction: 'or', conditions: [{ conjunction: 'and', conditions: [{ left_value: { value_type: 'ref', value: '$.t.fldAmount' }, operator: 'isGreaterEqual', right_value: [{ value_type: 'number', value: 10000000 }] }] }] } },
    },
    {
      id: 'msg',
      type: 'LarkMessageAction',
      next: null,
      data: { receiver: [{ value_type: 'ref', value: '$.t.fldOwner' }], send_to_everyone: false, content: [{ value_type: 'text', value: 'Đơn ' }, { value_type: 'ref', value: '$.t.fldCode' }], btn_list: [{ text: 'Mở', btn_action: 'openLink', link: [{ value_type: 'ref', value: '$.t.recordLink' }] }] },
    },
    { id: 'set', type: 'SetRecordAction', next: null, data: { table_name: 'Đơn hàng', ref_info: { step_id: 't' }, field_values: [{ field_name: 'Trạng thái', value: [{ value_type: 'option', value: { name: 'Đã duyệt' } }] }] } },
  ],
};
let r = w.validateWorkflowBody(good, { profile });
assert.ok(r.ok, errText(r));
assert.deepStrictEqual(r.tables, ['Đơn hàng']);
ok('thiết kế đúng với Base thật: hợp lệ, liệt kê đúng bảng được dùng');

b = clone(good);
b.steps[0].data.table_name = 'Don hang';
expectErr('bảng không có + gợi ý tên gần (bỏ dấu)', b, /Bảng «Don hang» không có.*«Đơn hàng»/, { profile });

b = clone(good);
b.steps[3].data.field_values[0].field_name = 'Trang thai';
expectErr('cột không có + gợi ý', b, /không có cột «Trang thai».*«Trạng thái»/, { profile });

b = clone(good);
b.steps[2].data.content[1].value = '$.t.Mã đơn';
expectErr('ref dùng tên cột → chỉ đúng field_id', b, /fldCode/, { profile });

b = clone(good);
b.steps[2].data.content[1].value = '$.t.fldCodee';
expectErr('ref field_id sai', b, /không phải cột/, { profile });

b = clone(good);
b.steps[3].data.field_values[0].value = [{ value_type: 'text', value: 'Đã duyệt' }];
expectErr('cột lựa chọn gán chữ trơn', b, /LỰA CHỌN.*option/, { profile });

b = clone(good);
b.steps[0].data.watched_field_name = 'fldCode';
expectErr('field_id ở chỗ cần TÊN cột', b, /TÊN cột.*«Mã đơn»/, { profile });

b = clone(good);
b.steps[3].data.field_values[0].value = [{ value_type: 'option', value: { name: 'Da duyet' } }];
r = w.validateWorkflowBody(b, { profile });
assert.ok(r.ok && r.warnings.some((x) => /Đã duyệt/.test(x.message)), 'lựa chọn lạ chỉ là cảnh báo, có gợi ý');
ok('lựa chọn chưa có: cảnh báo (không chặn) + gợi ý');

b = clone(good);
b.steps[0] = { id: 't', type: 'ReminderTrigger', next: 'b', data: { table_name: 'Đơn hàng', field_name: 'Mã đơn', unit: 'DAY', offset: -1, hour: 9, minute: 0 } };
expectErr('ReminderTrigger trên cột không phải ngày', b, /không phải cột ngày/, { profile });
b.steps[0].data.field_name = 'Hạn';
b.steps[0].data.offset = 9;
expectErr('ReminderTrigger offset ngoài khoảng', b, /offset 9/, { profile });

// Bảng không tải cột (Khách hàng) → không báo lỗi cột vô cớ.
b = clone(good);
b.steps.push({ id: 'add', type: 'AddRecordAction', next: null, data: { table_name: 'Khách hàng', field_values: [{ field_name: 'Bất kỳ', value: [{ value_type: 'text', value: 'x' }] }] } });
b.steps[3].next = 'add';
r = w.validateWorkflowBody(b, { profile });
assert.ok(r.ok, `bảng chưa tải cột bị chặn nhầm: ${errText(r)}`);
ok('bảng chưa tải cột: không đoán bừa là sai');

// ── 4. Mô tả thiết kế cho hộp xác nhận ─────────────────────────────────────────────
const lines = core.describeWorkflowSteps(good.steps, { fieldNames: { fldAmount: 'Số tiền', fldOwner: 'Phụ trách', fldCode: 'Mã đơn' } });
const text = lines.map((l) => '  '.repeat(l.depth) + l.text).join('\n');
assert.ok(/KHI có bản ghi MỚI trong bảng «Đơn hàng»/.test(text), text);
assert.ok(/NẾU «Số tiền» ≥ 10000000/.test(text), text); // ref cột của bản ghi trigger → chỉ tên cột
assert.ok(/✔ ĐÚNG/.test(text) && /✗ NGƯỢC LẠI/.test(text), text);
assert.ok(/Cập nhật bản ghi của bước t trong bảng «Đơn hàng»: «Trạng thái» = “Đã duyệt”/.test(text), text);
assert.ok(lines.find((l) => l.stepId === 'msg').depth === 2, 'bước trong nhánh phải thụt vào');
for (const ex of examples) {
  const ls = core.describeWorkflowSteps(ex.steps);
  assert.strictEqual(new Set(ls.filter((l) => l.stepId).map((l) => l.stepId)).size, ex.steps.length, `mô tả bỏ sót bước ở «${ex.title}»`);
  assert.ok(!ls.some((l) => /không nối vào luồng/.test(l.text)), `«${ex.title}» bị coi là có bước lạc`);
}
ok('mô tả thiết kế: đúng câu, thụt lề theo nhánh, phủ đủ mọi bước của mọi ví dụ');

// ── 5. Hồ sơ Base gọn ─────────────────────────────────────────────────────────────
const longText = 'x'.repeat(300);
const raw = {
  token: 'bascnAAAAAAAAAAAAAA',
  name: 'CRM',
  origin: 'https://acme.sg.larksuite.com',
  tables: [
    {
      table_id: 'tblA',
      name: 'Đơn hàng',
      fields: [
        { field_id: 'fld1', field_name: 'Mã', type: 1, ui_type: 'Text', is_primary: true },
        { field_id: 'fld2', field_name: 'Trạng thái', type: 3, ui_type: 'SingleSelect', property: { options: Array.from({ length: 20 }, (_, k) => ({ name: `opt${k}`, id: `o${k}`, color: k })) } },
        { field_id: 'fld3', field_name: 'Khách', type: 18, ui_type: 'SingleLink', property: { table_id: 'tblB' } },
      ],
      views: [{ view_id: 'vew1', view_name: 'Tất cả', view_type: 'grid' }],
      records: { total: 57, items: [1, 2, 3, 4, 5].map((k) => ({ fields: { fld1: `M${k}`, fld2: 'opt1', fldX: longText, fld3: [{ text: 'KH1' }] } })) },
    },
    { table_id: 'tblB', name: 'Khách hàng', fields: [], records: { total: 0, items: [] } },
  ],
  skipped: ['Bảng thừa'],
  workflows: [{ workflow_id: 'wkf1', title: 'Báo đơn mới', status: 'disabled' }],
  workflowSteps: { wkf1: good.steps },
};
const prof = w.compactBaseProfile(raw, { describe: (s) => core.workflowDesignText(s) });
assert.strictEqual(prof.base.url, 'https://acme.sg.larksuite.com/base/bascnAAAAAAAAAAAAAA');
assert.strictEqual(prof.table_count, 3);
const tA = prof.tables[0];
assert.strictEqual(tA.record_count, 57);
assert.strictEqual(tA.fields[0], 'fld1 · Mã · Text (chính)');
assert.ok(/^fld2 · Trạng thái · SingleSelect: opt0\|.*opt11 \(\+8\)$/.test(tA.fields[1]), tA.fields[1]);
assert.strictEqual(tA.fields[2], 'fld3 · Khách · SingleLink → «Khách hàng»');
assert.deepStrictEqual(tA.views, ['vew1 · Tất cả · grid']);
assert.strictEqual(tA.sample_records.length, 3, 'tối đa 3 bản ghi mẫu');
assert.strictEqual(tA.sample_records[0]['Mã'], 'M1', 'mẫu phải theo TÊN cột');
assert.ok(tA.sample_records[0].fldX.length <= 60, 'giá trị dài phải bị cắt');
assert.strictEqual(tA.sample_records[0]['Khách'], 'KH1');
assert.deepStrictEqual(prof.tables_not_scanned, ['Bảng thừa']);
assert.ok(prof.workflows[0].steps === 4 && /KHI có bản ghi MỚI/.test(prof.workflows[0].design));
assert.ok(JSON.stringify(prof).length < 4000, 'hồ sơ phải gọn');
const vp = w.validationProfileFrom(raw);
assert.strictEqual(vp.tables[0].fields[1].options.length, 20, 'hồ sơ để KIỂM giữ đủ lựa chọn');
ok('hồ sơ Base: mỗi cột một dòng, lựa chọn cắt gọn, liên kết ra tên bảng, ≤3 mẫu theo tên cột, link đúng tenant');

// ── 6. Link → token ───────────────────────────────────────────────────────────────
const P = w.parseBaseRef;
assert.deepStrictEqual(P('https://acme.sg.larksuite.com/base/bascnXyZ123456789?table=tblAbc&view=vew1'), { kind: 'base', token: 'bascnXyZ123456789', origin: 'https://acme.sg.larksuite.com', tableId: 'tblAbc' });
assert.strictEqual(P('https://x.larksuite.com/bitable/AbCdEfGhIjKl').token, 'AbCdEfGhIjKl');
assert.deepStrictEqual(P('https://x.larksuite.com/wiki/WikNode123456?table=tblQ'), { kind: 'wiki', node: 'WikNode123456', origin: 'https://x.larksuite.com', tableId: 'tblQ' });
assert.deepStrictEqual(P('bascnRawToken123'), { kind: 'base', token: 'bascnRawToken123' });
assert.strictEqual(P('acme.larksuite.com/base/bascnNoScheme1').token, 'bascnNoScheme1');
assert.strictEqual(P('https://x.larksuite.com/docx/abc'), null);
assert.strictEqual(P(''), null);
assert.strictEqual(w.baseUrl('tok', 'https://evil.example.com'), 'https://www.larksuite.com/base/tok', 'không nhận tên miền lạ');
ok('link Base / Bitable / Wiki / token trần → đúng token, giữ tenant + bảng');

const fakeClient = (node) => ({
  calls: [],
  async request(method, path, opts) {
    this.calls.push([method, path, opts]);
    if (path === '/open-apis/wiki/v2/spaces/get_node') return { node };
    throw new Error('không mong đợi ' + path);
  },
});

(async () => {
  let c = fakeClient({ obj_token: 'bascnFromWiki123', obj_type: 'bitable', title: 'Base trong Wiki' });
  const res = await resolveBaseInput(c, { url: 'https://x.larksuite.com/wiki/WikNode123456' });
  assert.strictEqual(res.token, 'bascnFromWiki123');
  assert.strictEqual(res.kind, 'wiki');
  assert.deepStrictEqual(c.calls[0][2].params, { token: 'WikNode123456', obj_type: 'wiki' });
  c = fakeClient({ obj_token: 'doxcn1', obj_type: 'docx' });
  await assert.rejects(resolveBaseInput(c, { url: 'https://x.larksuite.com/wiki/WikNode123456' }), /không phải Bitable/);
  c = fakeClient({});
  await assert.rejects(resolveBaseInput(c, { url: 'https://x.larksuite.com/wiki/WikNode123456' }), /wiki:wiki/);
  c = fakeClient(null);
  const direct = await resolveBaseInput(c, { app_token: 'https://x.larksuite.com/base/bascnDirect1234' });
  assert.strictEqual(direct.token, 'bascnDirect1234');
  assert.strictEqual(c.calls.length, 0, 'link Base không cần gọi mạng');
  ok('link Wiki → tra node → obj_token; Wiki không phải Base / không có quyền → báo rõ');

  // ── 7. Lỗi Lark → tiếng Việt ─────────────────────────────────────────────────────
  const E = (code, larkMsg, name = 'LarkApiError') => Object.assign(new Error(`Lark API ${code}: ${larkMsg}`), { name, code, larkMsg });
  let m = w.mapWorkflowError(E(99991672, 'Access denied. One of the following scopes is required: [base:workflow:create]'), 'create');
  assert.strictEqual(m.kind, 'scope');
  assert.ok(/base:workflow:create/.test(m.error) && m.fix.some((f) => /Release|PHÁT HÀNH/.test(f)), JSON.stringify(m));
  m = w.mapWorkflowError(E(99991679, 'Unauthorized. user access token missing scope'), 'update');
  assert.ok(m.kind === 'scope' && /base:workflow:update/.test(m.error), 'không có scope trong thông báo → dùng scope theo thao tác');
  m = w.mapWorkflowError(E(99991672, 'Access denied'), 'list');
  assert.ok(/base:workflow:read/.test(m.error));
  assert.strictEqual(w.mapWorkflowError(E(91403, 'Forbidden'), 'create').kind, 'permission');
  const un = w.mapWorkflowError(E(404, 'Not Found'), 'create');
  assert.ok(un.kind === 'unsupported' && un.fallback === 'ui');
  m = w.mapWorkflowError(E(1254001, '[2200] Internal Error'), 'create');
  assert.ok(m.kind === 'schema' && m.fix.some((f) => /TRÙNG/.test(f)), JSON.stringify(m));
  m = w.mapWorkflowError(E(1254001, 'path "fldX" does not exist in the output path tree, steps[2]'), 'create');
  assert.ok(m.kind === 'schema' && /steps\[2\]/.test(m.error) && m.fix.some((f) => /ref/.test(f)));
  assert.strictEqual(w.mapWorkflowError(E(99991663, 'token invalid'), 'get').kind, 'auth');
  assert.strictEqual(w.mapWorkflowError(Object.assign(new Error('x'), { name: 'LarkNetworkError' }), 'get').kind, 'network');
  ok('lỗi Lark → tiếng Việt: thiếu scope nói đúng scope + phát hành lại app; quyền Base; không hỗ trợ → dự phòng; schema có gợi ý + vị trí');

  // ── 8. Chốt ghi: create/update phải hỏi, còn lại thì không; không có tool BẬT ─────
  const T = Object.fromEntries(workflowV3Tools.map((t) => [t.name, t]));
  for (const n of ['bitable_workflow_create', 'bitable_workflow_update']) {
    assert.strictEqual(T[n].gated, true, `${n} phải gated`);
    assert.strictEqual(typeof T[n].preflight, 'function', `${n} phải kiểm trước hộp xác nhận`);
  }
  for (const n of ['bitable_scan_base', 'bitable_workflow_list', 'bitable_workflow_get', 'bitable_workflow_validate', 'bitable_workflow_schema'])
    assert.strictEqual(T[n].gated, false, `${n} là đọc, không được gated`);
  assert.ok(!workflowV3Tools.some((t) => /enable|bat_workflow|activate/i.test(t.name)), 'không được có tool bật workflow');
  const src = readFileSync(join(__dirname, '..', 'main', 'runtime', 'lark', 'tools', 'workflowsV3.ts'), 'utf8');
  assert.ok(!/\/enable['`]/.test(src), 'không được gọi endpoint enable');
  assert.ok(/'POST', `\$\{v3\(p\.base\.token\)\}\/workflows`/.test(src), 'create phải POST /open-apis/base/v3/bases/:token/workflows');
  assert.ok(/'PUT', `\$\{v3\(p\.base\.token\)\}\/workflows\/\$\{enc\(id\)\}`/.test(src), 'update phải PUT …/workflows/:id');
  assert.ok(/\/workflows\/list`/.test(src), 'list phải POST …/workflows/list');
  // Bảng công cụ thật (nguồn sự thật của isWriteTool) phải có đủ, đúng phân loại.
  const reg = require(join(B, 'tools', 'index.js'));
  assert.ok(reg.isWriteTool('bitable_workflow_create') && reg.isWriteTool('bitable_workflow_update'));
  assert.ok(!reg.isWriteTool('bitable_scan_base') && !reg.isWriteTool('bitable_workflow_get') && !reg.isWriteTool('bitable_workflow_validate'));
  const ro = reg.readOnlyTools().map((t) => t.name);
  assert.ok(ro.includes('bitable_scan_base') && !ro.includes('bitable_workflow_create'), 'chế độ Hỏi: có quét, không có tạo');
  ok('create/update gated + có preflight; scan/list/get/validate/schema không gated; không có đường bật workflow');

  // Hộp xác nhận chỉ hiện cho thiết kế HỢP LỆ: preflight thất bại → không hỏi, không exec.
  const events = [];
  let confirms = 0;
  let execs = 0;
  const fake = (pre) => ({
    name: 'fake_write',
    gated: true,
    description: '',
    inputSchema: {},
    preflight: async () => pre,
    exec: async () => {
      execs++;
      return { ok: true, workflow_id: 'wkf9' };
    },
  });
  const ctx = (tool) => ({
    tools: [tool],
    client: {},
    emit: (e) => events.push(e),
    confirm: async () => {
      confirms++;
      return true;
    },
    ask: async () => '',
  });
  let out = await executeLarkTool('fake_write', {}, ctx(fake({ ok: false, kind: 'invalid', error: 'Thiết kế workflow chưa hợp lệ (1 lỗi)', errors: ['x'] })));
  assert.ok(!out.ok && confirms === 0 && execs === 0, 'preflight hỏng: không được hỏi, không được chạy');
  assert.strictEqual(events.find((e) => e.type === 'tool_call').gated, false);
  assert.ok(/chưa hợp lệ/.test(out.text));
  out = await executeLarkTool('fake_write', {}, ctx(fake(null)));
  assert.ok(out.ok && confirms === 1 && execs === 1, 'preflight ổn: hỏi rồi mới chạy');
  const throwing = fake(null);
  throwing.preflight = async () => {
    throw new Error('mạng chập chờn');
  };
  out = await executeLarkTool('fake_write', {}, ctx(throwing));
  assert.ok(out.ok && confirms === 2, 'preflight ném lỗi không được chặn mất việc người dùng muốn duyệt');
  ok('preflight: thiết kế hỏng thì không hiện hộp xác nhận; hợp lệ thì hỏi rồi mới ghi');

  // validate là phép KIỂM: kết quả "không hợp lệ" không được tô thành tool hỏng (ok:false).
  const vc = { async request() { throw new Error('offline'); }, async listAllTables() { throw new Error('offline'); } };
  const vr = await T.bitable_workflow_validate.exec({ app_token: 'bascnValidate123', title: 'x', steps: [{ id: 'a', type: 'Nope', data: {} }] }, vc);
  assert.strictEqual(vr.valid, false);
  assert.ok(vr.ok === undefined && vr.errors.length > 0);
  ok('bitable_workflow_validate: trả valid/errors, không giả làm lỗi công cụ');

  // Tạo/sửa trọn vòng với một Lark giả: đúng endpoint, có client_token, KHÔNG gửi status, đọc lại.
  const lark = (wfStatus) => {
    const calls = [];
    return {
      calls,
      async listAllTables() {
        return { items: [{ table_id: 'tblOrders', name: 'Đơn hàng' }, { table_id: 'tblLog', name: 'Nhật ký' }], total: 2 };
      },
      async request(method, path, opts = {}) {
        calls.push({ method, path, data: opts.data });
        if (method === 'GET' && path.endsWith('/tables/tblOrders/fields'))
          return { items: profile.tables[0].fields.map((f) => ({ field_id: f.field_id, field_name: f.name, type: f.type, property: f.options ? { options: f.options.map((n) => ({ name: n })) } : undefined })) };
        if (method === 'POST' && path === '/open-apis/base/v3/bases/bascnE2E12345/workflows') return { workflow_id: 'wkfNew1', title: opts.data.title };
        if (method === 'GET' && /\/open-apis\/base\/v3\/bases\/bascnE2E12345\/workflows\/wkf/.test(path))
          return { workflow_id: path.split('/').pop(), title: 'Duyệt đơn lớn', status: wfStatus, steps: good.steps };
        if (method === 'PUT' && path === '/open-apis/base/v3/bases/bascnE2E12345/workflows/wkfOld1') return {};
        if (method === 'PATCH' && path.endsWith('/disable')) return {};
        throw Object.assign(new Error('Lark API 404: Not Found'), { name: 'LarkApiError', code: 404, larkMsg: 'Not Found' });
      },
    };
  };
  const input = { url: 'https://acme.sg.larksuite.com/base/bascnE2E12345', title: good.title, steps: good.steps, status: 'enabled' };
  let lc = lark('disabled');
  assert.strictEqual(await T.bitable_workflow_create.preflight(input, lc), null, 'thiết kế đúng phải qua preflight');
  const created = await T.bitable_workflow_create.exec(input, lc);
  assert.ok(created.ok && created.workflow_id === 'wkfNew1' && created.verified && created.steps_saved === 4, JSON.stringify(created));
  assert.strictEqual(created.base_url, 'https://acme.sg.larksuite.com/base/bascnE2E12345');
  assert.ok(/TẮT/.test(created.status_text) && /tự bật|TỰ BẬT/i.test(created.review));
  const post = lc.calls.find((x) => x.method === 'POST');
  assert.ok(post.data.client_token && post.data.title === good.title && Array.isArray(post.data.steps));
  assert.ok(!('status' in post.data), 'không được gửi status khi tạo');
  assert.ok(created.notes.some((n) => /status/.test(n)), 'phải báo đã bỏ qua status');
  assert.ok(!lc.calls.some((x) => /enable|disable/.test(x.path)), 'không gọi bật/tắt khi Lark đã trả TẮT');
  ok('create: POST v3 với client_token, không status, đọc lại xác minh, trả link đúng tenant');

  // Lark lỡ trả BẬT → tắt lại ngay.
  lc = lark('enabled');
  const odd = await T.bitable_workflow_create.exec({ ...input, title: 'Khác' }, lc);
  assert.ok(lc.calls.some((x) => x.method === 'PATCH' && x.path.endsWith('/workflows/wkfNew1/disable')), 'phải tắt lại');
  assert.ok(odd.note_disabled);
  ok('create: nếu Lark trả trạng thái BẬT thì tắt lại ngay');

  // Thiết kế hỏng → preflight trả lỗi, KHÔNG gửi gì.
  lc = lark('disabled');
  const bad = clone(input);
  bad.steps[3].data.field_values[0].field_name = 'Trang thai';
  const pf = await T.bitable_workflow_create.preflight(bad, lc);
  assert.ok(pf && pf.ok === false && pf.kind === 'invalid' && pf.errors.some((e) => /«Trạng thái»/.test(e)), JSON.stringify(pf));
  assert.ok(!lc.calls.some((x) => x.method === 'POST' && /\/workflows$/.test(x.path)), 'thiết kế hỏng không được gửi lên Lark');
  ok('create: thiết kế hỏng bị chặn ở preflight, chưa gửi gì lên Lark');

  // Sửa: workflow đang BẬT thì từ chối; đang TẮT thì PUT toàn bộ, giữ tên cũ nếu không truyền.
  lc = lark('enabled');
  const upIn = { app_token: 'bascnE2E12345', workflow_id: 'wkfOld1', steps: good.steps };
  const refused = await T.bitable_workflow_update.preflight(upIn, lc);
  assert.ok(refused && refused.kind === 'enabled', JSON.stringify(refused));
  lc = lark('disabled');
  const upd = await T.bitable_workflow_update.exec({ ...upIn, steps: clone(good.steps) }, lc);
  const put = lc.calls.find((x) => x.method === 'PUT');
  assert.ok(upd.ok && put && put.data.title === 'Duyệt đơn lớn' && put.data.steps.length === 4 && !('status' in put.data), JSON.stringify(upd));
  const notWkf = await T.bitable_workflow_update.preflight({ ...upIn, workflow_id: 'tblOrders', steps: clone(good.steps) }, lc);
  assert.ok(notWkf && /wkf/.test(notWkf.error));
  ok('update: từ chối workflow đang BẬT, PUT toàn bộ steps, giữ tên cũ, chặn id không phải wkf…');

  // Thiếu scope khi tạo → thông báo đúng scope.
  lc = lark('disabled');
  lc.request = async (method, path, opts) => {
    if (method === 'GET' && path.endsWith('/fields')) return { items: [] };
    throw Object.assign(new Error('x'), { name: 'LarkApiError', code: 99991672, larkMsg: 'Access denied. One of the following scopes is required: [base:workflow:create]' });
  };
  const noScope = await T.bitable_workflow_create.exec({ ...input, title: 'Thiếu quyền', steps: [{ id: 't', type: 'TimerTrigger', next: null, data: { rule: 'DAILY' } }] }, lc);
  assert.ok(noScope.ok === false && noScope.kind === 'scope' && /base:workflow:create/.test(noScope.error), JSON.stringify(noScope));
  ok('create: thiếu scope → báo đúng base:workflow:create + cách phát hành lại app');

  // Chủ đề tài liệu: loại bước trả cả data lẫn đầu ra.
  const sec = w.schemaSection('SetRecordAction');
  assert.ok(/### SetRecordAction/.test(sec.text) && /##### SetRecordAction（更新记录）/.test(sec.text) && /MIT/.test(sec.source));
  assert.ok(/buttonElement/.test(w.schemaSection('ButtonTrigger').text), 'ButtonTrigger phải gồm cả 2 mục đầu ra');
  for (const t of w.SCHEMA_TOPICS) assert.ok(w.schemaSection(t), `chủ đề ${t} rỗng`);
  assert.strictEqual(w.schemaSection('khong-co'), null);
  ok(`bitable_workflow_schema: ${w.SCHEMA_TOPICS.length} chủ đề đều có nội dung`);

  console.log(`\n${passed} kiểm tra workflow v3 đều đạt.`);
})().catch((e) => {
  console.error('✗', e);
  process.exit(1);
});
