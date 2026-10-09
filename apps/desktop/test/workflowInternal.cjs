// Kiểm bộ chuyển thiết kế v3 → bản nháp NỘI BỘ của khối Workflow (workflowInternal.ts): từng loại
// bước, nối rẽ nhánh/lặp, và đọc ngược cây. Khuôn mong đợi lấy từ dữ liệu thật (fixtures đã thay id).
const assert = require('assert');
const { join } = require('path');
const B = join(__dirname, '..', '.test-build', 'runtime', 'lark');
const conv = require(join(B, 'workflowInternal.js'));
const wb = require(join(B, 'workflowBlock.js'));
const fx = (n) => require(join(__dirname, 'fixtures', 'lark-web', n));

let fail = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log('  ✓', name);
  } catch (e) {
    fail = 1;
    console.log('  ✗', name, '\n   ', e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e);
  }
}

const FX = fx('workflow-tables.json');
const tables = FX.tables.map((t) => ({ ...t, views: [], samples: [], fields: t.fields.map((f, i) => ({ ...f, typeName: String(f.type), isPrimary: i === 0 })) }));
const T = (n) => tables.find((t) => t.name === n);
const F = (t, n) => T(t).fields.find((f) => f.name === n);
const O = (t, n, o) => F(t, n).options.find((x) => x.name === o).id;
const me = { id: '7000000000000000001', name: 'Tôi', avatarUrl: '' };
const opts = { timezone: FX.timezone };
const KH = 'Khách hàng';
const cond = (ref, op, right) => ({ conjunction: 'or', conditions: [{ conjunction: 'and', conditions: [{ left_value: { value_type: 'ref', value: ref }, operator: op, right_value: right }] }] });
const msg = (id, receiver, content, next = null) => ({ id, type: 'LarkMessageAction', title: 'Nhắn', next, data: { receiver, send_to_everyone: false, title: [{ value_type: 'text', value: 'Tiêu đề' }], content, btn_list: [] } });

const IFELSE = {
  title: 'Phân luồng khách mới',
  steps: [
    { id: 't1', type: 'AddRecordTrigger', title: 'Khi thêm khách hàng', next: 'b1', data: { table_name: KH, watched_field_name: 'Tên khách hàng' } },
    {
      id: 'b1',
      type: 'IfElseBranch',
      title: 'Nguồn là Quảng cáo?',
      next: null,
      children: { links: [{ kind: 'if_true', to: 'u1' }, { kind: 'if_false', to: 'm2' }] },
      data: { condition: cond(`$.t1.${F(KH, 'Nguồn tiếp cận').id}`, 'is', [{ value_type: 'option', value: { name: 'Quảng cáo' } }]) },
    },
    {
      id: 'u1',
      type: 'SetRecordAction',
      title: 'Đánh dấu đang tư vấn',
      next: 'm1',
      data: {
        table_name: KH,
        ref_info: { step_id: 't1' },
        field_values: [
          { field_name: 'Phân loại', value: [{ value_type: 'option', value: { name: 'Đang tư vấn' } }] },
          { field_name: 'Ghi chú', value: [{ value_type: 'text', value: 'Lead QC: ' }, { value_type: 'ref', value: `$.t1.${F(KH, 'Tên khách hàng').id}` }] },
          { field_name: 'Tổng chi tiêu (VNĐ)', value: [{ value_type: 'number', value: 0 }] },
          { field_name: 'Lần tiếp cận gần nhất', value: [{ value_type: 'ref', value: '$.t1.recordCreatedTime' }] },
        ],
      },
    },
    msg('m1', [{ value_type: 'ref', value: `$.t1.${F(KH, 'Người phụ trách').id}` }], [{ value_type: 'text', value: 'Khách: ' }, { value_type: 'ref', value: `$.t1.${F(KH, 'Tên khách hàng').id}` }]),
    msg('m2', [{ value_type: 'ref', value: `$.t1.${F(KH, 'Người phụ trách').id}` }], [{ value_type: 'text', value: 'Khách mới' }]),
  ],
};

const MONDAY = {
  title: 'Báo cáo thứ Hai',
  steps: [
    { id: 't1', type: 'TimerTrigger', title: '8:30 thứ Hai', next: 'f1', data: { rule: 'WEEKLY', start_time: '2026-10-09 08:30', sub_unit: [1], is_never_end: true } },
    {
      id: 'f1',
      type: 'FindRecordAction',
      title: 'Việc chưa làm',
      next: 'l1',
      data: { table_name: 'Công việc follow-up', field_names: ['Tiêu đề'], filter_info: { conjunction: 'and', conditions: [{ field_name: 'Trạng thái', operator: 'is', value: [{ value_type: 'option', value: { name: 'Chưa làm' } }] }] } },
    },
    { id: 'l1', type: 'Loop', title: 'Mỗi việc', next: null, children: { links: [{ kind: 'loop_start', to: 'm1' }] }, data: { loop_mode: 'continue', max_loop_times: 200, data: [{ value_type: 'ref', value: '$.f1.fieldRecords' }] } },
    msg('m1', [{ value_type: 'ref', value: `$.l1.item.${F('Công việc follow-up', 'Người phụ trách').id}` }], [{ value_type: 'ref', value: `$.l1.item.${F('Công việc follow-up', 'Tiêu đề').id}` }]),
  ],
};

const KITCHEN = {
  title: 'Nút + HTTP + AI',
  steps: [
    { id: 't1', type: 'ButtonTrigger', title: 'Bấm nút', next: 'h1', data: { button_type: 'buttonField', table_name: 'Lô hàng' } },
    {
      id: 'h1',
      type: 'HTTPClientAction',
      title: 'Gọi webhook',
      next: 'd1',
      data: {
        method: 'POST',
        url: [{ value_type: 'text', value: 'https://example.invalid/hook' }],
        headers: [{ key: 'Content-Type', value: [{ value_type: 'text', value: 'application/json' }] }],
        body_type: 'raw',
        raw_body: [{ value_type: 'text', value: '{"id":"' }, { value_type: 'ref', value: '$.t1.recordId' }, { value_type: 'text', value: '"}' }],
        response_type: 'json',
        response_value: '{"ok":true,"msg":"x"}',
      },
    },
    { id: 'd1', type: 'Delay', title: 'Chờ', next: 'g1', data: { duration: 5 } },
    { id: 'g1', type: 'GenerateAiTextAction', title: 'Tóm tắt', next: 'a1', data: { prompt: [{ value_type: 'text', value: 'Tóm tắt ' }, { value_type: 'ref', value: '$.h1.body.msg' }] } },
    {
      id: 'a1',
      type: 'AddRecordAction',
      title: 'Ghi kiểm chéo',
      next: 's1',
      data: {
        table_name: 'Kiểm chéo dữ liệu',
        field_values: [
          { field_name: 'Hạng mục kiểm tra', value: [{ value_type: 'ref', value: '$.g1' }] },
          { field_name: 'Số vấn đề phát hiện', value: [{ value_type: 'number', value: 1 }] },
          { field_name: 'Trạng thái', value: [{ value_type: 'option', value: { name: 'Đạt' } }] },
          { field_name: 'Thời gian kiểm tra', value: [{ value_type: 'date', value: 'now' }] },
        ],
      },
    },
    {
      id: 's1',
      type: 'SwitchBranch',
      title: 'Theo trạng thái',
      next: null,
      children: { links: [{ kind: 'case', label: 'branch_1', desc: 'Đã giao', to: 'u1' }, { kind: 'case', label: 'default', desc: 'Còn lại', to: 'm1' }] },
      data: { mode: 'exclusive', no_match_action: 'classifyToOther', child_branch_list: [{ name: 'Đã giao', condition: cond(`$.t1.${F('Lô hàng', 'Trạng thái').id}`, 'is', [{ value_type: 'option', value: { name: 'Đã giao' } }]) }] },
    },
    { id: 'u1', type: 'SetRecordAction', title: 'Ghi', next: null, data: { table_name: 'Lô hàng', ref_info: { step_id: 't1' }, field_values: [{ field_name: 'Text', value: [{ value_type: 'ref', value: '$.h1.status_code' }] }] } },
    msg('m1', [{ value_type: 'user', value: { id: 'me' } }], [{ value_type: 'ref', value: `$.t1.${F('Lô hàng', 'Khách hàng').id}` }]),
  ],
};

(async () => {
  console.log('workflowInternal');

  await test('IfElse: meet/notMeet trỏ đúng bước, next rỗng, điều kiện Or/And + id lựa chọn (khuôn khối thật)', () => {
    const r = conv.v3ToInternal(IFELSE, tables, me, opts);
    assert.strictEqual(r.ok, true, JSON.stringify(r.errors));
    assert.strictEqual(r.triggerName, 'addRecord');
    const by = Object.fromEntries(r.draft.steps.map((s) => [s.type + ':' + s.stepTitle, s]));
    const t = r.draft.steps[0];
    const b = r.draft.steps.find((s) => s.type === 'IfElseBranch');
    const u = r.draft.steps.find((s) => s.type === 'SetRecordAction');
    const [m1, m2] = r.draft.steps.filter((s) => s.type === 'LarkMessageAction');
    assert.ok(by && /^branch/.test(b.id));
    assert.deepStrictEqual(t.next, [{ ids: [b.id] }]);
    assert.strictEqual(b.data.meetConditionStepId, u.id);
    assert.strictEqual(b.data.notMeetConditionStepId, m2.id);
    assert.deepStrictEqual(b.next, []);
    assert.deepStrictEqual(u.next, [{ ids: [m1.id] }]);
    assert.deepStrictEqual(m1.next, []);
    const c = b.data.condition;
    assert.strictEqual(c.conjunction, 'Or');
    assert.strictEqual(c.conditions[0].conjunction, 'And');
    const it = c.conditions[0].conditions[0];
    assert.strictEqual(it.operator, 'is');
    assert.deepStrictEqual(it.rightValue, [O(KH, 'Nguồn tiếp cận', 'Quảng cáo')]);
    assert.strictEqual(it.leftValue.tagType, 'step');
    assert.strictEqual(it.leftValue.stepId, t.id);
    // Cùng bộ khoá với leftValue trong khối thật của Base Test.
    const real = fx('workflow-internal-real.json').ifelse_setrecord.steps[1].data.condition.conditions[0].conditions[0].leftValue;
    assert.deepStrictEqual(Object.keys(it.leftValue).sort(), Object.keys(real).sort());
  });

  await test('SetRecordAction: ref_info → recordType Ref {stepId trigger, stepNum 0}; giá trị theo kiểu cột (luật uA)', () => {
    const r = conv.v3ToInternal(IFELSE, tables, me, opts);
    const u = r.draft.steps.find((s) => s.type === 'SetRecordAction');
    assert.strictEqual(u.data.recordType, 'Ref');
    assert.deepStrictEqual(u.data.recordInfo, { stepId: r.draft.steps[0].id, stepNum: 0 });
    assert.strictEqual(u.data.maxSetRecordNum, 100);
    const v = Object.fromEntries(u.data.values.map((x) => [x.fieldId.split('_').pop(), x]));
    assert.deepStrictEqual(v[F(KH, 'Phân loại').id], { fieldId: `ref_${T(KH).id}_${F(KH, 'Phân loại').id}`, valueType: 'value', value: O(KH, 'Phân loại', 'Đang tư vấn') });
    const note = v[F(KH, 'Ghi chú').id];
    assert.strictEqual(note.valueType, 'ref');
    assert.deepStrictEqual(note.value[0], { type: 'text', text: 'Lead QC: ' });
    assert.strictEqual(note.value[1].tagType, 'step');
    assert.deepStrictEqual(v[F(KH, 'Tổng chi tiêu (VNĐ)').id].value, 0);
    const d = v[F(KH, 'Lần tiếp cận gần nhất').id];
    assert.strictEqual(d.valueType, 'ref');
    assert.strictEqual(d.value[0].tagType, 'stepPureValue');
    assert.strictEqual(d.value[0].value, 'recordCreatedTime');
    assert.strictEqual(d.value[0].valueType, 'timestamp');
  });

  await test('LarkMessageAction: người nhận = cột Người (thẻ step, không extra), groups = persons, version 1.1.0', () => {
    const r = conv.v3ToInternal(IFELSE, tables, me, opts);
    const m = r.draft.steps.find((s) => s.type === 'LarkMessageAction');
    assert.strictEqual(m.version, '1.1.0');
    assert.strictEqual(m.data.persons[0].tagType, 'step');
    assert.ok(!('extra' in m.data.persons[0]));
    assert.deepStrictEqual(m.data.groups, m.data.persons);
    assert.strictEqual(m.data.richTextContent[0].value[1].extra && typeof m.data.richTextContent[0].value[1].extra, 'object');
  });

  await test('Timer WEEKLY sub_unit [1] → startTime dời tới thứ Hai 08:30 (múi Base), rule WEEKLY; triggerName cron', () => {
    const r = conv.v3ToInternal(MONDAY, tables, me, opts);
    assert.strictEqual(r.ok, true, JSON.stringify(r.errors));
    assert.strictEqual(r.triggerName, 'cron');
    const d = r.draft.steps[0].data;
    assert.strictEqual(d.rule, 'WEEKLY');
    // 2026-10-09 là thứ Sáu → thứ Hai kế tiếp 2026-10-12 08:30 giờ VN = 01:30 UTC.
    assert.strictEqual(new Date(d.startTime).toISOString(), '2026-10-12T01:30:00.000Z');
    assert.strictEqual(d.timezone, 'Asia/Saigon');
    const multi = conv.v3ToInternal({ ...MONDAY, steps: [{ ...MONDAY.steps[0], data: { rule: 'WEEKLY', start_time: '2026-10-12 08:30', sub_unit: [1, 3] } }, ...MONDAY.steps.slice(1)] }, tables, me, opts);
    assert.deepStrictEqual([multi.draft.steps[0].data.rule, multi.draft.steps[0].data.unit, multi.draft.steps[0].data.subUnit], ['CUSTOM', 'WEEK', [1, 3]]);
  });

  await test('Find + Loop: lọc Filter có conditionId, Loop nối startChildStepId, loopData stepRecordFields, item.<cột> → thẻ loop; cột được ref tự thêm vào fieldIds', () => {
    const r = conv.v3ToInternal(MONDAY, tables, me, opts);
    const [, f, l, m] = r.draft.steps;
    const CV = 'Công việc follow-up';
    assert.strictEqual(f.type, 'FindRecordAction');
    assert.strictEqual(f.data.recordType, 'Filter');
    const c = f.data.recordInfo.conditions[0];
    assert.deepStrictEqual([c.fieldType, c.operator, c.value], [3, 'is', [O(CV, 'Trạng thái', 'Chưa làm')]]);
    assert.match(c.conditionId, /^con/);
    assert.deepStrictEqual(f.data.fieldIds.sort(), [`ref_${T(CV).id}_${F(CV, 'Tiêu đề').id}`, `ref_${T(CV).id}_${F(CV, 'Người phụ trách').id}`].sort());
    assert.deepStrictEqual(f.data.fieldsMap[F(CV, 'Người phụ trách').id], { type: 11 });
    assert.strictEqual(f.data.shouldProceedWithNoResults, true);
    assert.deepStrictEqual(f.next, [{ ids: [l.id] }]);
    assert.match(l.id, /^system/);
    assert.strictEqual(l.data.startChildStepId, m.id);
    assert.deepStrictEqual(l.next, []);
    assert.strictEqual(l.data.loopType, 'forEach');
    assert.strictEqual(l.data.loopMode, 2);
    assert.strictEqual(l.data.maxLoopTimes, 200);
    assert.deepStrictEqual([l.data.loopData.tagType, l.data.loopData.isAllFields, l.data.loopData.stepId], ['stepRecordFields', true, f.id]);
    const p = m.data.persons[0];
    assert.deepStrictEqual([p.tagType, p.loopValue, p.stepId, p.path], ['loop', 'item', l.id, [{ type: 'Field', value: F(CV, 'Người phụ trách').id }]]);
    assert.strictEqual(p.stepNum, 3);
  });

  await test('HTTP/Delay/AI/AddRecord/Switch: khuôn đúng từng loại, Switch nối entryChildStepId + nhánh mặc định', () => {
    const r = conv.v3ToInternal(KITCHEN, tables, me, opts);
    assert.strictEqual(r.ok, true, JSON.stringify(r.errors));
    assert.strictEqual(r.triggerName, 'buttonField');
    const by = (t) => r.draft.steps.find((s) => s.type === t);
    assert.deepStrictEqual([by('ButtonTrigger').data.buttonType, by('ButtonTrigger').version], ['buttonField', '2.0.0']);
    assert.deepStrictEqual(r.extra.BtnTrigger, { TableID: T('Lô hàng').id, FieldID: '' });
    const h = by('HTTPClientAction').data;
    assert.deepStrictEqual([h.method, h.bodyType, h.responseType], ['POST', 'raw', 'json']);
    assert.deepStrictEqual(h.url, [{ type: 'text', text: 'https://example.invalid/hook' }]);
    assert.strictEqual(h.rawBody[1].attribute, 'recordId');
    assert.deepStrictEqual(by('Delay').data, { duration: 5, unit: 'minute' });
    const g = by('GenerateAiTextAction').data;
    assert.strictEqual(g.promptType, 'customize');
    assert.deepStrictEqual(g.prompt[1].path.slice(1), [{ type: 'json', text: 'body' }, { type: 'json', text: 'msg' }]);
    const a = Object.fromEntries(by('AddRecordAction').data.values.map((x) => [x.fieldId.split('_').pop(), x]));
    const KC = 'Kiểm chéo dữ liệu';
    assert.strictEqual(a[F(KC, 'Hạng mục kiểm tra').id].value[0].tagType, 'stepPureValue');
    assert.deepStrictEqual(a[F(KC, 'Số vấn đề phát hiện').id], { fieldId: `ref_${T(KC).id}_${F(KC, 'Số vấn đề phát hiện').id}`, valueType: 'value', value: 1 });
    assert.strictEqual(a[F(KC, 'Trạng thái').id].value, O(KC, 'Trạng thái', 'Đạt'));
    assert.strictEqual(a[F(KC, 'Thời gian kiểm tra').id].value[0].tagType, 'time');
    const sw = by('SwitchBranch');
    const set = by('SetRecordAction');
    const m = by('LarkMessageAction');
    assert.strictEqual(sw.data.mode, 'Exclusive');
    assert.strictEqual(sw.data.childBranchList[0].entryChildStepId, set.id);
    assert.deepStrictEqual(sw.data.defaultBranchInfo, { entryStepId: m.id, mode: 'Execute' });
    assert.strictEqual(set.data.values[0].value[0].valueType, 'number');
    assert.strictEqual(m.data.persons[0].id, me.id);
  });

  await test('Reminder / ChangeRecord / SetRecordTrigger / nút setRecord: điều kiện trigger nằm ở next[0].condition, containsAny → contains', () => {
    const CV = 'Công việc follow-up';
    const rem = conv.v3ToInternal(
      {
        title: 'x',
        steps: [
          { id: 't1', type: 'ReminderTrigger', next: 'm1', data: { table_name: CV, field_name: 'Hạn hoàn thành', offset: -1, unit: 'DAY', hour: 9, minute: 0, condition_list: [{ conjunction: 'and', conditions: [{ field_name: 'Trạng thái', operator: 'isNot', value: [{ value_type: 'option', value: { name: 'Xong' } }] }] }] } },
          msg('m1', [{ value_type: 'ref', value: `$.t1.${F(CV, 'Người phụ trách').id}` }], [{ value_type: 'text', value: 'Sắp hạn' }]),
        ],
      },
      tables,
      me,
      opts,
    );
    assert.strictEqual(rem.ok, true, JSON.stringify(rem.errors));
    assert.strictEqual(rem.triggerName, 'datetimeField');
    assert.deepStrictEqual([rem.draft.steps[0].data.unit, rem.draft.steps[0].data.offset, rem.draft.steps[0].data.hour], [3, -1, 9]);
    const nc = rem.draft.steps[0].next[0].condition;
    assert.strictEqual(nc.conjunction, 'or');
    assert.deepStrictEqual(nc.conditions[0].conditions[0].value, [O(CV, 'Trạng thái', 'Xong')]);
    const ch = conv.v3ToInternal(
      {
        title: 'x',
        steps: [
          { id: 't1', type: 'ChangeRecordTrigger', next: 'f1', data: { table_name: 'Chiến dịch', condition_list: [{ conjunction: 'and', conditions: [{ field_name: 'Số lead', operator: 'isGreater', value: [{ value_type: 'number', value: 100 }] }] }] } },
          { id: 'f1', type: 'FindRecordAction', next: null, data: { table_name: 'Tương tác', field_names: ['Tiêu đề'], filter_info: { conjunction: 'and', conditions: [{ field_name: 'Trạng thái', operator: 'containsAny', value: [{ value_type: 'option', value: { name: 'Đóng' } }, { value_type: 'option', value: { name: 'Chưa xử lý' } }] }] } } },
        ],
      },
      tables,
      me,
      opts,
    );
    assert.strictEqual(ch.ok, true, JSON.stringify(ch.errors));
    const cf = ch.draft.steps[0].data.fields[0];
    assert.deepStrictEqual([cf.operator, cf.value, cf.conditionId], ['isGreater', [100], `${F('Chiến dịch', 'Số lead').id}-isGreater`]);
    assert.deepStrictEqual(ch.draft.steps[0].next[0].condition.conditions[0].conditions[0], cf);
    assert.strictEqual(ch.draft.steps[1].data.recordInfo.conditions[0].operator, 'contains');
    const st = conv.v3ToInternal(
      {
        title: 'x',
        steps: [
          { id: 't1', type: 'SetRecordTrigger', next: 'm1', data: { table_name: 'Tương tác', field_watch_info: [{ field_name: 'Trạng thái', operator: 'is', value: [{ value_type: 'option', value: { name: 'Đóng' } }] }] } },
          {
            ...msg('m1', [{ value_type: 'user', value: { id: 'me' } }], [{ value_type: 'text', value: 'Đã đóng' }]),
            data: {
              receiver: [{ value_type: 'user', value: { id: 'me' } }],
              content: [{ value_type: 'text', value: 'x' }],
              btn_list: [{ text: 'Mở lại', btn_action: 'setRecord', table_name: 'Tương tác', record_values: [{ field_name: 'Trạng thái', value: [{ value_type: 'option', value: { name: 'Đang xử lý' } }] }] }],
            },
          },
        ],
      },
      tables,
      me,
      opts,
    );
    assert.strictEqual(st.ok, true, JSON.stringify(st.errors));
    assert.deepStrictEqual(st.draft.steps[0].data.fields[0], { fieldId: `ref_${T('Tương tác').id}_${F('Tương tác', 'Trạng thái').id}`, fieldType: 3, operator: 'is', value: [O('Tương tác', 'Trạng thái', 'Đóng')] });
    const btn = st.draft.steps[1].data.btnList[0];
    assert.deepStrictEqual([btn.btnAction, btn.recordType, btn.recordValues[0].value], ['setRecord', 'Ref', O('Tương tác', 'Trạng thái', 'Đang xử lý')]);
  });

  await test('Từ chối có lý do: ref sang nhánh anh em, bước mồ côi, loại cần trình soạn (AIClassification) → unsupported', () => {
    const bad = JSON.parse(JSON.stringify(IFELSE));
    bad.steps[4].data.content = [{ value_type: 'ref', value: `$.u1.${F(KH, 'Ghi chú').id}` }];
    const r = conv.v3ToInternal(bad, tables, me, opts);
    assert.strictEqual(r.ok, false);
    assert.ok(r.errors.some((e) => /không đứng trước/.test(e)), r.errors.join(' | '));
    const orphan = conv.v3ToInternal({ title: 'x', steps: [IFELSE.steps[0], { ...IFELSE.steps[3], next: null }] }, tables, me, opts);
    assert.ok(orphan.errors.some((e) => /không nối vào cây/.test(e)));
    const ai = conv.v3ToInternal({ title: 'x', steps: [IFELSE.steps[0], { id: 'c1', type: 'AIClassificationBranch', data: {} }] }, tables, me, opts);
    assert.deepStrictEqual(ai.unsupported, ['AIClassificationBranch']);
    const grp = conv.v3ToInternal({ title: 'x', steps: [{ ...IFELSE.steps[0], next: 'm' }, msg('m', [{ value_type: 'group', value: { id: 'oc_abc', name: 'Nhóm' } }], [{ value_type: 'text', value: 'x' }])] }, tables, me, opts);
    assert.ok(grp.errors.some((e) => /nhóm chat/.test(e)));
    const notPerson = conv.v3ToInternal({ title: 'x', steps: [{ ...IFELSE.steps[0], next: 'm' }, msg('m', [{ value_type: 'ref', value: `$.t1.${F(KH, 'Email').id}` }], [{ value_type: 'text', value: 'x' }])] }, tables, me, opts);
    assert.ok(notPerson.errors.some((e) => /không phải cột Người/.test(e)));
  });

  await test('Đọc ngược cây: chữ ký cấu trúc giữ nguyên qua JSON; khối thật (IfElse / Loop+Switch / Parallel) đọc ra đủ cạnh, không bước mồ côi', () => {
    for (const d of [IFELSE, MONDAY, KITCHEN]) {
      const r = conv.v3ToInternal(d, tables, me, opts);
      const blk = wb.toWorkflowBlockDraft(r.draft, r.extra, tables);
      assert.strictEqual(conv.outlineSignature(JSON.stringify(blk.draft)), conv.outlineSignature(r.draft));
      assert.deepStrictEqual(conv.internalOutline(r.draft).problems, []);
      assert.strictEqual(conv.internalOutline(r.draft).nodes.length, d.steps.length);
    }
    const sig = conv.outlineSignature(conv.v3ToInternal(IFELSE, tables, me, opts).draft);
    assert.strictEqual(sig, '0::AddRecordTrigger|0::IfElseBranch|1:yes:SetRecordAction|1::LarkMessageAction|1:no:LarkMessageAction');
    const real = fx('workflow-internal-real.json');
    const ie = conv.internalOutline(real.ifelse_setrecord);
    assert.deepStrictEqual(ie.nodes.map((n) => n.edge || ''), ['', '', 'yes', 'no']);
    const lp = conv.internalOutline(real.button_find_loop_switch);
    assert.deepStrictEqual(lp.problems, []);
    assert.ok(lp.nodes.some((n) => n.edge === 'loop'));
    assert.ok(lp.nodes.some((n) => /^case:/.test(n.edge || '')));
    assert.deepStrictEqual(conv.internalOutline(real.switch_parallel).problems, []);
    assert.match(conv.internalTreeText(conv.v3ToInternal(IFELSE, tables, me, opts).draft), /\[Nếu đúng\][\s\S]*\[Nếu không\]/);
  });

  await test('verifyWorkflowBlock so CẤU TRÚC: cùng loại bước nhưng đổi nhánh → báo lệch', () => {
    const r = conv.v3ToInternal(IFELSE, tables, me, opts);
    const meta = { workflowBlocks: [{ blockId: 'wkfX', name: 'A', workflowId: '1' }] };
    const okv = wb.verifyWorkflowBlock(meta, { status: 0, draft: JSON.stringify(r.draft) }, { workflowID: '1', steps: r.draft.steps });
    assert.strictEqual(okv.ok, true, okv.problems.join(' '));
    const swapped = JSON.parse(JSON.stringify(r.draft));
    const b = swapped.steps.find((s) => s.type === 'IfElseBranch');
    [b.data.meetConditionStepId, b.data.notMeetConditionStepId] = [b.data.notMeetConditionStepId, b.data.meetConditionStepId];
    assert.strictEqual(wb.verifyWorkflowBlock(meta, { status: 0, draft: JSON.stringify(swapped) }, { workflowID: '1', steps: r.draft.steps }).ok, false);
  });

  await test('wallTimeToMs theo múi giờ; canvasSelfCheckScript là JS hợp lệ, chỉ tính toán (không lưu/bật)', () => {
    assert.strictEqual(new Date(conv.wallTimeToMs('2026-10-12 08:30', 'Asia/Saigon')).toISOString(), '2026-10-12T01:30:00.000Z');
    assert.strictEqual(new Date(conv.wallTimeToMs('2026/01/05 09:00', 'Asia/Tokyo')).toISOString(), '2026-01-05T00:00:00.000Z');
    const js = wb.canvasSelfCheckScript('7600000000000000001');
    new Function(`return ${js}`); // cú pháp
    assert.ok(/toSchema/.test(js) && !/fetch\(|automation\/update|status|enable/i.test(js.replace(/getIsConfig\w+|getIsTaskConfig\w+/g, '')));
  });

  process.exit(fail);
})();
