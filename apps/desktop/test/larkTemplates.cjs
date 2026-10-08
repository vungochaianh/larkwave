/**
 * "Làm mẫu một lần → dùng lại": trích biến từ gói LƯU mà chính Lark gửi, rồi điền lại.
 *
 * Gói mẫu dưới đây dựng theo đúng hình dạng đã xác minh (memory toolswave-lark-workflow-800004006 +
 * tools/workflows.ts): body POST /space/api/bitable/automation/update = { token, workflowID, status,
 * draft: CHUỖI JSON {title, steps:[{id,type,data,next}]}, extra: CHUỖI JSON {TableMap:{ref_tbl…:
 * {TableID, FieldMap:{ref_tbl…_fld…: fld…}, ViewMap}}, …}, nodeSchema: CHUỖI JSON, triggerName,
 * source, bizType }. Sai một id là bản nháp trỏ sang bảng của Base KHÁC — nên kiểm kỹ.
 *
 *   bash apps/desktop/test/run.sh
 */
const assert = require('node:assert');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { extractTemplate, fillTemplate, loadTemplates, saveTemplates, templateSummary } = require('../.test-build/runtime/lark/larkTemplates.js');

const T = 'tblOrd3rsAbc12', F_STATUS = 'fldSt4tusXy9', F_NAME = 'fldN4meQw12', OPT_NEW = 'optN3wOrd1', USER = 'ou_0f1e2d3c4b5a69788796a5b4c3d2e1f0', CHAT = 'oc_aa11bb22cc33dd44ee55ff6600112233';
const draft = {
  title: 'Báo nhóm khi có đơn mới',
  steps: [
    {
      id: 'step_trigger',
      type: 'AddRecordTrigger',
      stepTitle: 'Khi thêm bản ghi',
      data: { tableId: `ref_${T}`, watchedFieldId: `ref_${T}_${F_STATUS}`, triggerControlList: ['pasteUpdate', 'appendImport'] },
      next: [{ ids: ['step_if'] }],
    },
    {
      id: 'step_if',
      type: 'IfElseBranch',
      data: {
        condition: { conjunction: 'Or', conditions: [{ conjunction: 'And', conditions: [{ leftValue: { fields: [{ fieldId: `ref_${T}_${F_STATUS}`, type: 3 }], stepId: 'step_trigger', type: 'ref' }, operator: 'is', rightValue: [OPT_NEW] }] }] },
        meetConditionStepId: 'step_msg',
        notMeetConditionStepId: null,
      },
    },
    {
      id: 'step_msg',
      type: 'SendMessageAction',
      data: {
        receiver: [{ type: 'user', value: USER }, { type: 'chat', value: CHAT }],
        content: [{ type: 'text', value: 'Đơn mới: ' }, { type: 'ref', fields: [{ fieldId: `ref_${T}_${F_NAME}`, fieldName: 'Tên khách' }] }],
        optionList: ['a'], // khoá JSON thường bắt đầu bằng "opt" — KHÔNG được thành biến
      },
    },
  ],
};
const extra = {
  TableMap: { [`ref_${T}`]: { TableID: T, FieldMap: { [`ref_${T}_${F_STATUS}`]: F_STATUS, [`ref_${T}_${F_NAME}`]: F_NAME }, ViewMap: {} } },
  BlockMap: {},
  WorkflowMap: {},
  RelationInfo: {},
};
const body = {
  token: 'bascnSourceBase01',
  workflowID: '7420000000000000001',
  status: 0,
  draft: JSON.stringify(draft),
  extra: JSON.stringify(extra),
  nodeSchema: JSON.stringify({ version: 2, nodes: [{ id: 'step_trigger', table: T }] }),
  triggerName: 'AddRecordTrigger',
  source: 'workflow_block',
  bizType: '2',
};

const tpl = extractTemplate(body, { name: 'Báo đơn mới', endpoint: '/space/api/bitable/automation/update', now: new Date('2026-10-08T00:00:00Z'), id: 'tpl1' });
const byKind = (k) => tpl.vars.filter((v) => v.kind === k).map((v) => v.original).sort();
assert.deepStrictEqual(byKind('table'), [T]);
assert.deepStrictEqual(byKind('field'), [F_NAME, F_STATUS].sort());
assert.deepStrictEqual(byKind('option'), [OPT_NEW], 'chỉ option id thật, KHÔNG phải khoá "optionList"');
assert.deepStrictEqual(byKind('user'), [USER]);
assert.deepStrictEqual(byKind('chat'), [CHAT]);
const tblKey = tpl.vars.find((v) => v.kind === 'table').key;
assert.strictEqual(tblKey, 'tbl_1');
for (const v of tpl.vars.filter((x) => x.kind === 'field')) assert.strictEqual(v.table, 'tbl_1', `cột ${v.original} phải gắn với biến bảng (từ extra.TableMap)`);
assert.strictEqual(tpl.vars.find((v) => v.original === F_NAME).hint, 'Tên khách', 'gợi ý tên cột lấy từ draft');
for (const id of [T, F_STATUS, F_NAME, OPT_NEW, USER, CHAT]) assert.ok(!tpl.bodyTemplate.includes(id), `id ${id} phải được thay bằng biến`);
assert.ok(!/bascnSourceBase01|7420000000000000001/.test(tpl.bodyTemplate), 'token/workflowID không nằm trong khuôn');
assert.ok(tpl.bodyTemplate.includes('ref_{{tbl_1}}_{{fld_'), 'alias ref_<tbl>_<fld> giữ đúng cấu trúc');
assert.deepStrictEqual([tpl.kind, tpl.sourceBase, tpl.title, tpl.triggerName], ['workflow', 'bascnSourceBase01', 'Báo nhóm khi có đơn mới', 'AddRecordTrigger']);
assert.ok(tpl.fields.includes('nodeSchema'), 'giữ nodeSchema của Lark');
console.log(`✓ extractTemplate: ${tpl.vars.length} biến (bảng/cột/option/người/nhóm), gắn cột↔bảng, gợi ý tên, khuôn không còn id gốc`);

// Cùng Base: để trống = nhân bản y nguyên
const same = fillTemplate(tpl, {}, 'bascnSourceBase01');
assert.deepStrictEqual(same.missing, []);
assert.strictEqual(same.body.draft, body.draft, 'nhân bản cùng Base = đúng từng byte draft của Lark');
assert.strictEqual(same.body.extra, body.extra);
assert.strictEqual(same.body.nodeSchema, body.nodeSchema);
assert.ok(!('token' in same.body) && !('workflowID' in same.body) && !('status' in same.body), 'token/workflowID/status do bên gọi đặt');
console.log('✓ fillTemplate cùng Base: trả lại đúng từng byte gói của Lark');

// Base khác: thiếu bảng/cột → báo thiếu, không đoán
const miss = fillTemplate(tpl, {}, 'bascnOtherBase002');
assert.ok(miss.missing.includes('tbl_1') && miss.missing.length === 4, 'thiếu 1 bảng + 2 cột + 1 option: ' + miss.missing);
assert.ok(!miss.missing.some((k) => /^o[uc]_/.test(k)), 'người/nhóm mặc định giữ nguyên');
// Base khác + đủ biến
const vals = {};
const NEW = { [T]: 'tblNewT4ble99', [F_STATUS]: 'fldNewSt4t01', [F_NAME]: 'fldNewN4me02', [OPT_NEW]: 'optNewV4l03' };
for (const v of tpl.vars) if (NEW[v.original]) vals[v.key] = NEW[v.original];
const other = fillTemplate(tpl, vals, 'bascnOtherBase002');
assert.deepStrictEqual(other.missing, []);
const d2 = JSON.parse(other.body.draft);
assert.strictEqual(d2.steps[0].data.tableId, 'ref_tblNewT4ble99');
assert.strictEqual(d2.steps[0].data.watchedFieldId, 'ref_tblNewT4ble99_fldNewSt4t01');
assert.deepStrictEqual(d2.steps[1].data.condition.conditions[0].conditions[0].rightValue, ['optNewV4l03']);
assert.strictEqual(d2.steps[2].data.receiver[0].value, USER, 'người nhận giữ nguyên');
const e2 = JSON.parse(other.body.extra);
assert.ok(e2.TableMap['ref_tblNewT4ble99'] && e2.TableMap['ref_tblNewT4ble99'].FieldMap['ref_tblNewT4ble99_fldNewSt4t01'] === 'fldNewSt4t01', 'extra.TableMap đổi khoá + giá trị đồng bộ');
assert.ok(!JSON.stringify(other.body).includes(T), 'không còn sót id bảng cũ');
console.log('✓ fillTemplate Base khác: thiếu thì báo thiếu; đủ thì thay đồng bộ draft + extra + nodeSchema');

// Chặn tiêm: giá trị sai kiểu / có ký tự phá JSON
assert.throws(() => fillTemplate(tpl, { ...vals, tbl_1: 'tbl"},{"x' }, 'bascnOtherBase002'), /không hợp lệ/);
assert.throws(() => fillTemplate(tpl, { ...vals, tbl_1: 'fldWrongKind1' }, 'bascnOtherBase002'), /không hợp lệ/, 'id cột không được điền vào biến bảng');
assert.throws(() => fillTemplate(tpl, vals, 'bad base!'), /base/);
assert.throws(() => extractTemplate({ token: 'x' }, { name: 'n', endpoint: '/x' }), /draft/);
console.log('✓ fillTemplate chặn giá trị sai loại / có ký tự phá JSON / base hỏng');

// Kho theo tài khoản
const dir = mkdtempSync(join(tmpdir(), 'lw-tpl-'));
const file = join(dir, 'lark-ui-templates-_local.json');
assert.deepStrictEqual(loadTemplates(file), []);
saveTemplates(file, [tpl]);
assert.strictEqual(loadTemplates(file)[0].id, 'tpl1');
assert.ok(!('bodyTemplate' in templateSummary(tpl)), 'bản tóm tắt cho UI/agent không mang khuôn');
console.log('✓ kho mẫu: lưu/đọc theo file của tài khoản; tóm tắt không lộ khuôn');
