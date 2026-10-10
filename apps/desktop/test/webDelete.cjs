/**
 * Xoá bảng / automation / khối Workflow qua phiên Lark web (tool lark_web_delete) + chọn model cho
 * Claude CLI. Hành vi Lark đo thật 10/10/2026 trên Base Test (xem đầu webDelete.ts).
 *
 *   bash apps/desktop/test/run.sh
 */
const assert = require('node:assert');
const vm = require('node:vm');
const { resolveDeleteTargets, describePlan, verifyDeleted, deleteBlocksScript, refusalText } = require('../.test-build/runtime/lark/webDelete.js');
const { claudeModelArgs } = require('../.test-build/runtime/lark/cliModel.js');

const CAT = {
  tables: [
    { id: 'tblA', name: 'Khách hàng', records: 10822 },
    { id: 'tblB', name: 'Lô hàng', records: 5 },
    { id: 'tblC', name: 'Kiểm chéo dữ liệu', records: 0 },
  ],
  automations: [
    { workflowId: '7694526257958604509', title: 'Lô hàng mới → báo Sales phụ trách', enabled: false },
    { workflowId: '7694526257958604510', title: 'Đã thanh toán → báo Sales', enabled: true },
  ],
  workflows: [
    { blockId: 'wkfNuhRu4HS3KiKO', workflowId: '7694595822633438941', name: 'Larkwave DEMO — phân luồng khách mới' },
    { blockId: 'wkfaj244hiPGAKJC', workflowId: '7694595822633438942', name: 'Workflow' },
    { blockId: 'wkfDup1', workflowId: '1', name: 'Trùng' },
    { blockId: 'wkfDup2', workflowId: '2', name: 'Trùng' },
  ],
};

// "*" = cả nhóm; tên không phân biệt hoa thường / khoảng trắng thừa; id cũng được.
let r = resolveDeleteTargets({ tables: ['*'], automations: ['*'], workflows: ['wkfNuhRu4HS3KiKO', '  workflow '] }, CAT);
assert.ok(r.ok);
assert.deepStrictEqual(r.plan.tables.map((t) => t.id), ['tblA', 'tblB', 'tblC']);
assert.strictEqual(r.plan.automations.length, 2);
assert.deepStrictEqual(r.plan.workflows.map((w) => w.blockId), ['wkfNuhRu4HS3KiKO', 'wkfaj244hiPGAKJC']);
r = resolveDeleteTargets({ tables: ['lô hàng', 'tblB'] }, CAT);
assert.deepStrictEqual(r.plan.tables.map((t) => t.id), ['tblB'], 'cùng một bảng nêu hai lần → một lần');
r = resolveDeleteTargets({ workflows: ['7694595822633438941'] }, CAT);
assert.strictEqual(r.plan.workflows[0].blockId, 'wkfNuhRu4HS3KiKO', 'workflow id cũng tìm được khối');
console.log('✓ resolveDeleteTargets: "*" = cả nhóm, tên không phân biệt hoa thường, id bảng / workflow id / block id');

// Không đoán: không thấy / trùng tên / rỗng → lỗi, KHÔNG xoá gì.
r = resolveDeleteTargets({ tables: ['Khách hàng', 'Bảng không có'] }, CAT);
assert.ok(!r.ok && /Bảng không có/.test(r.errors.join(' ')), 'một tên sai là hỏng cả lần gọi (không xoá phần còn lại)');
r = resolveDeleteTargets({ workflows: ['Trùng'] }, CAT);
assert.ok(!r.ok && /2 workflow cùng tên/.test(r.errors[0]) && /wkfDup1/.test(r.errors[0]), 'trùng tên → đòi id');
r = resolveDeleteTargets({}, CAT);
assert.ok(!r.ok, 'không nêu gì → lỗi');
console.log('✓ resolveDeleteTargets: tên không có / trùng tên / rỗng → lỗi, không đoán');

const d = describePlan(resolveDeleteTargets({ tables: ['*'], automations: ['*'] }, CAT).plan);
assert.strictEqual(d.records, 10827);
assert.ok(d.tables[0].includes('10.822 bản ghi'), d.tables[0]);
assert.ok(d.automations[1].includes('đang BẬT'));
console.log('✓ describePlan: số bản ghi từng bảng + tổng, đánh dấu automation đang BẬT');

const plan = resolveDeleteTargets({ tables: ['Khách hàng'], automations: ['Đã thanh toán → báo Sales'], workflows: ['Workflow'] }, CAT).plan;
assert.deepStrictEqual(verifyDeleted(plan, { tableIds: ['tblB'], workflowBlockIds: [], automationIds: ['7694526257958604509'] }), { verified: true, stillThere: [] });
const left = verifyDeleted(plan, { tableIds: ['tblA'], workflowBlockIds: ['wkfaj244hiPGAKJC'], automationIds: [] });
assert.strictEqual(left.verified, false);
assert.deepStrictEqual(left.stillThere, ['bảng «Khách hàng»', 'workflow «Workflow»']);
console.log('✓ verifyDeleted: chỉ "đã xoá" khi đọc lại không còn; nêu đúng thứ còn sót');

// Mã trong trang trên một Base giả: kiểm LOẠI khối trước khi xoá.
function fakeBase(blocks) {
  const deleted = [];
  const base = {
    getToken: () => 'basX',
    getBlock: (id) => (blocks[id] ? { getType: () => blocks[id].type, getToken: () => blocks[id].token } : null),
  };
  const ctx = { base, operate: { baseOperate: { delBlock: async ({ id }) => { deleted.push(id); delete blocks[id]; return { result: 2 }; } } } };
  return { deleted, run: (op) => vm.runInNewContext(deleteBlocksScript(op), { window: { bitableConnectContexts: new Set([ctx]) } }) };
}
(async () => {
  const fb = fakeBase({ tbl1: { type: 'BITABLE_TABLE' }, wkf1: { type: 'WORKFLOW', token: '77' }, dash1: { type: 'DASHBOARD' } });
  const out = JSON.parse(JSON.stringify(await fb.run({ token: 'basX', blocks: [{ id: 'wkf1', kind: 'workflow', workflowId: '77' }, { id: 'tbl1', kind: 'table' }, { id: 'dash1', kind: 'table' }, { id: 'tblGone', kind: 'table' }] })));
  assert.deepStrictEqual(fb.deleted, ['wkf1', 'tbl1'], 'chỉ xoá đúng loại khối');
  assert.strictEqual(out.ok, false);
  assert.deepStrictEqual(out.results.map((x) => [x.id, x.ok, x.error]), [['wkf1', true, undefined], ['tbl1', true, undefined], ['dash1', false, 'wrong-type'], ['tblGone', false, 'not-found']]);
  assert.ok(/không phải bảng/.test(refusalText(out.results[2])));
  const fb2 = fakeBase({ wkf2: { type: 'WORKFLOW', token: '88' } });
  const out2 = JSON.parse(JSON.stringify(await fb2.run({ token: 'basX', blocks: [{ id: 'wkf2', kind: 'workflow', workflowId: '99' }] })));
  assert.deepStrictEqual(fb2.deleted, [], 'khối workflow mà token khác workflow id đã duyệt → không xoá');
  assert.strictEqual(out2.results[0].error, 'wrong-type');
  const out3 = await vm.runInNewContext(deleteBlocksScript({ token: 'basOther', blocks: [{ id: 'x', kind: 'table' }] }), { window: { bitableConnectContexts: new Set() } });
  assert.strictEqual(out3.error, 'no-context');
  console.log('✓ deleteBlocksScript: kiểm loại khối + workflow id trước khi xoá; sai loại / không còn / sai Base → không xoá');

  // --model: lựa chọn của người dùng luôn thắng (lỗi cũ: lượt Lark bỏ qua → chạy Sonnet).
  assert.deepStrictEqual(claudeModelArgs({ mode: 'build', model: 'haiku' }), ['--model', 'haiku']);
  assert.deepStrictEqual(claudeModelArgs({ mode: 'ask', model: 'haiku' }), ['--model', 'haiku']);
  assert.deepStrictEqual(claudeModelArgs({ mode: 'build' }), [], 'không chọn → CLI tự chọn');
  assert.deepStrictEqual(claudeModelArgs({ mode: 'ask' }), ['--model', 'sonnet']);
  assert.deepStrictEqual(claudeModelArgs({ mode: 'ask', generalMode: true }), []);
  assert.deepStrictEqual(claudeModelArgs({ mode: 'build', generalMode: true, model: 'opus' }), ['--model', 'opus']);
  console.log('✓ claudeModelArgs: model người dùng chọn luôn được truyền (build lẫn ask), không chọn thì như cũ');
})();
