/**
 * "Tạo workflow" bằng PHIÊN LARK WEB (không App ID): danh sách Base (phân trang + Wiki + tìm kiếm),
 * gắn x-csrftoken cho MỌI request, giải nén cấu trúc Base (gzip+base64), automation đã có, chuyển
 * thiết kế `steps` chính thức → bản nháp nội bộ, đọc lại sau khi ghi, chốt chế độ (bộ công cụ, luôn
 * hỏi xác nhận, không có tool bật/xoá), và máy trạng thái của khung Lark gắn cạnh hội thoại.
 *
 * Fixtures ở test/fixtures/lark-web đúng HÌNH response thật đo 09/10/2026 (đã thay tên/token).
 *
 *   bash apps/desktop/test/run.sh
 */
const assert = require('node:assert');
const Module = require('node:module');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { gzipSync } = require('node:zlib');

const orig = Module._load;
Module._load = function (req) {
  if (req === 'electron')
    return {
      Notification: class { show() {} static isSupported() { return false; } },
      app: { getPath: () => '/tmp', on() {}, isReady: () => false },
      BrowserWindow: class {},
      WebContentsView: class {},
      ipcMain: { handle() {}, on() {} },
      session: { fromPartition: () => ({ webRequest: { onBeforeSendHeaders() {} }, cookies: { get: async () => [] } }) },
      shell: {},
      net: {},
      webContents: {},
      protocol: {},
    };
  return orig.apply(this, arguments);
};

const B = join(__dirname, '..', '.test-build', 'runtime', 'lark');
const api = require(join(B, 'larkWebApi.js'));
const conv = require(join(B, 'webAutomation.js'));
const v3 = require(join(B, 'workflowV3.js'));
const dock = require(join(__dirname, '..', '.test-build', 'ui', 'larkDock.js'));
const fx = (n) => JSON.parse(readFileSync(join(__dirname, 'fixtures', 'lark-web', n), 'utf8'));

let passed = 0;
const test = async (name, fn) => {
  try {
    await fn();
    passed++;
  } catch (e) {
    console.error('✗', name, '\n ', e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n  ') : e);
    process.exitCode = 1;
  }
};

(async () => {
  // ── Danh sách Base ───────────────────────────────────────────────────────────────────────────
  await test('recentListPath: đúng bộ tham số trang Drive + phân trang', () => {
    const p = api.recentListPath({ types: [8], lastLabel: '1791256250|7642566917424729821' });
    assert.ok(p.startsWith('/space/api/explorer/recent/list/?'));
    const q = new URLSearchParams(p.split('?')[1]);
    assert.strictEqual(q.get('length'), '50');
    assert.deepStrictEqual(q.getAll('obj_type'), ['8']);
    for (const k of ['thumbnail_width', 'thumbnail_height', 'thumbnail_policy', 'type_opt', 'rank', 'thumbnail_mode']) assert.ok(q.has(k), k);
    assert.strictEqual(q.get('last_label'), '1791256250|7642566917424729821');
    assert.ok(!new URLSearchParams(api.recentListPath().split('?')[1]).has('last_label'));
  });

  await test('parseRecentList: Base thường + Base trong Wiki (wiki_subtype 8 → wiki_sub_token), bỏ docx/wiki-docx', () => {
    const r = api.parseRecentList(fx('recent-list.page1.json'));
    assert.strictEqual(r.hasMore, true);
    assert.strictEqual(r.lastLabel, '1791256250|7642566917424729821');
    assert.deepStrictEqual(r.bases.map((b) => b.token), ['BaseTokDDDDDDDDDDDDDDDDDDDDDDD', 'BaseInWikiTokBBBBBBBBBBBBBBBB']);
    const w = r.bases[1];
    assert.strictEqual(w.isWiki, true);
    assert.strictEqual(w.wikiToken, 'WikiNodeTokAAAAAAAAAAAAAAAAAAA');
    assert.strictEqual(w.wikiSpace, 'Phòng Kế Toán');
    assert.strictEqual(r.bases[0].isWiki, false);
    assert.strictEqual(r.bases[0].editTime, 1791514924);
  });

  await test('parseRecentList: trang cuối + khử trùng qua mergeBases, Base không tên có nhãn', () => {
    const a = api.parseRecentList(fx('recent-list.page1.json'));
    const b = api.parseRecentList(fx('recent-list.page2.json'));
    assert.strictEqual(b.hasMore, false);
    const all = api.mergeBases(a.bases, b.bases);
    assert.strictEqual(all.length, 3);
    assert.strictEqual(all.filter((x) => x.token === 'BaseTokDDDDDDDDDDDDDDDDDDDDDDD').length, 1);
    assert.strictEqual(all[2].name, 'Base chưa đặt tên');
  });

  await test('parseRecentList: code ≠ 0 → ném lỗi rõ ràng', () => {
    assert.throws(() => api.parseRecentList({ code: 4, msg: 'no permission' }), /recent\/list: Lark báo lỗi 4/);
    assert.throws(() => api.parseRecentList(null), /không phải JSON/);
  });

  await test('search: refine_search obj_types=8; bỏ <em>, chỉ lấy Base (kể cả Base trong Wiki)', () => {
    const p = api.searchPath('Larkwave Test');
    assert.ok(p.startsWith('/space/api/search/refine_search/?'));
    const q = new URLSearchParams(p.split('?')[1]);
    assert.strictEqual(q.get('query'), 'Larkwave Test');
    assert.strictEqual(q.get('obj_types'), '8');
    const r = api.parseSearch(fx('search.json'));
    assert.deepStrictEqual(r.bases.map((b) => b.name), ['TEST LOGIC LARK', 'Quy trình Test']);
    assert.strictEqual(r.bases[1].isWiki, true);
    assert.strictEqual(r.bases[1].url, 'https://tenant.sg.larksuite.com/wiki/WikiNodeJJJJ');
    assert.strictEqual(r.total, 32);
  });

  await test('findBaseByName: không phân biệt hoa thường / khoảng trắng', () => {
    const list = [{ token: 'a', name: 'Larkwave  Test ' }, { token: 'b', name: 'Khác' }];
    assert.strictEqual(api.findBaseByName(list, 'larkwave test').token, 'a');
    assert.strictEqual(api.findBaseByName(list, 'nope'), undefined);
  });

  // ── x-csrftoken cho MỌI request (GET recent/list thiếu nó là HTTP 500) ───────────────────────
  const runPageJs = async (js, cookie) => {
    const calls = [];
    const g = {
      document: { cookie },
      location: { href: 'https://tenant.sg.larksuite.com/drive/home/' },
      fetch: async (url, opts) => {
        calls.push({ url, opts });
        return { status: 200, url, redirected: false, text: async () => '{"code":0,"data":{}}' };
      },
    };
    const fn = new Function('document', 'location', 'fetch', `return ${js};`);
    const res = await fn(g.document, g.location, g.fetch);
    return { res, calls };
  };
  await test('pageFetchJs: GET cũng gắn x-csrftoken (giải mã cookie), credentials include', async () => {
    const { res, calls } = await runPageJs(api.pageFetchJs('/space/api/explorer/recent/list/?length=50'), 'a=1; _csrf_token=abc%2D123; b=2');
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].opts.method, 'GET');
    assert.strictEqual(calls[0].opts.credentials, 'include');
    assert.strictEqual(calls[0].opts.headers['x-csrftoken'], 'abc-123');
    assert.strictEqual(calls[0].opts.body, undefined);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.json, { code: 0, data: {} });
  });
  await test('pageFetchJs: POST có body JSON + content-type + csrf; không có cookie thì không bịa header', async () => {
    const { calls } = await runPageJs(api.pageFetchJs('/space/api/bitable/automation/create', 'POST', { token: 'x', status: 0 }), '_csrf_token=tok1');
    assert.strictEqual(calls[0].opts.headers['content-type'], 'application/json');
    assert.strictEqual(calls[0].opts.headers['x-csrftoken'], 'tok1');
    assert.deepStrictEqual(JSON.parse(calls[0].opts.body), { token: 'x', status: 0 });
    const { calls: c2 } = await runPageJs(api.pageFetchJs('/x'), 'other=1');
    assert.ok(!('x-csrftoken' in c2[0].opts.headers));
  });

  // ── Cấu trúc Base (gzip+base64) ─────────────────────────────────────────────────────────────
  const gz = (o) => gzipSync(Buffer.from(JSON.stringify(o))).toString('base64');
  await test('decodeLarkGz: "H4sI…" → object; JSON thường vẫn đọc được; null giữ null', () => {
    const s = gz({ a: 1 });
    assert.ok(s.startsWith('H4sI'));
    assert.deepStrictEqual(api.decodeLarkGz(s), { a: 1 });
    assert.deepStrictEqual(api.decodeLarkGz('{"b":2}'), { b: 2 });
    assert.strictEqual(api.decodeLarkGz(null), null);
  });
  await test('clientVarsPath: tableID + recordLimit nhỏ + needBase', () => {
    const p = api.clientVarsPath('BaseTok', 'tblX', 3);
    assert.ok(p.startsWith('/space/api/v1/bitable/BaseTok/clientvars?'));
    const q = new URLSearchParams(p.split('?')[1]);
    assert.strictEqual(q.get('tableID'), 'tblX');
    assert.strictEqual(q.get('recordLimit'), '3');
    assert.strictEqual(q.get('needBase'), 'true');
  });
  await test('parseBaseMeta: bảng theo thứ tự blocks, bỏ bảng trong thùng rác, khối workflow (86) riêng', () => {
    const m = api.parseBaseMeta(api.decodeLarkGz(gz(fx('clientvars.base.json'))));
    assert.strictEqual(m.name, 'Base Test');
    assert.deepStrictEqual(m.tables, [{ id: 'tblkQBhz17Rnuqg7', name: 'Khách hàng' }, { id: 'tblMqfzvjMpJiGRt', name: 'Tương tác' }]);
    assert.deepStrictEqual(m.workflowBlocks, [{ blockId: 'wkfjsVtNDZBXzZiv', name: 'Quy trình làm việc', workflowId: '7654164572698316507' }]);
    assert.strictEqual(m.timezone, 'Asia/Saigon');
  });
  await test('parseTableSchema: cột theo thứ tự view, kiểu VN, lựa chọn, liên kết, cột chính, bản ghi mẫu phẳng', () => {
    const t = api.parseTableSchema(fx('clientvars.table.json'), 'Tương tác', 3);
    assert.strictEqual(t.id, 'tblMqfzvjMpJiGRt');
    assert.deepStrictEqual(t.fields.map((f) => f.name), ['Tiêu đề', 'Trạng thái', 'Người xử lý', 'Thời gian', 'Chiến dịch liên quan']);
    const st = t.fields.find((f) => f.name === 'Trạng thái');
    assert.strictEqual(st.typeName, 'Chọn một');
    assert.deepStrictEqual(st.options.map((o) => o.name), ['Chưa xử lý', 'Đang xử lý', 'Đóng']);
    assert.strictEqual(t.fields[0].isPrimary, true);
    assert.strictEqual(t.fields.find((f) => f.id === 'fldP7utf0A').linkTable, 'tblzILAQn0CepAAT');
    assert.deepStrictEqual(t.views.map((v) => v.name), ['Grid', 'Kanban']);
    assert.strictEqual(t.recordCount, 5);
    assert.deepStrictEqual(t.samples[0], { 'Tiêu đề': 'Inbox hỏi giá', 'Trạng thái': 'Chưa xử lý', 'Thời gian': '2026-06-20' });
    assert.deepStrictEqual(t.samples[1], { 'Tiêu đề': 'Comment hỏi dịch vụ', 'Trạng thái': 'Đóng' });
  });
  await test('parseAutomationList: draft/extra là CHUỖI JSON → bước tiếng Việt, bảng thật, bật/tắt', () => {
    const list = api.parseAutomationList(fx('automation-list.json'), { tblMqfzvjMpJiGRt: 'Tương tác' });
    assert.strictEqual(list.length, 1);
    const a = list[0];
    assert.strictEqual(a.workflowId, '7672057879164554974');
    assert.strictEqual(a.title, 'Tự động hóa');
    assert.strictEqual(a.enabled, false);
    assert.deepStrictEqual(a.steps.map((s) => s.label), ['Khi bản ghi được sửa', 'Gửi tin nhắn Lark']);
    assert.strictEqual(a.steps[0].table, 'Tương tác');
    assert.deepStrictEqual(api.parseAutomationList({ code: 0, data: { workflowList: [] } }), []);
    assert.throws(() => api.parseAutomationList({ code: 91402, msg: 'x' }), /91402/);
  });

  // ── Thiết kế chính thức → bản nháp nội bộ ──────────────────────────────────────────────────
  const tables = [api.parseTableSchema(fx('clientvars.table.json'), 'Tương tác', 0)];
  const me = { id: '7000000000000000001', name: 'Phương', avatarUrl: 'https://x/a.png' };
  const design = {
    title: 'Báo tôi khi có tương tác mới',
    steps: [
      { id: 't1', type: 'AddRecordTrigger', title: 'Khi thêm bản ghi', next: 'a1', data: { table_name: 'Tương tác', watched_field_name: 'Tiêu đề' } },
      {
        id: 'a1',
        type: 'LarkMessageAction',
        title: 'Báo tôi',
        next: null,
        data: {
          receiver: [{ value_type: 'user', value: { id: 'me' } }],
          send_to_everyone: false,
          title: [{ value_type: 'text', value: 'Có tương tác mới' }],
          content: [{ value_type: 'text', value: 'Tiêu đề: ' }, { value_type: 'ref', value: '$.t1.fld52eqPQQ' }],
          btn_list: [{ text: 'Xem bản ghi', btn_action: 'openLink', link: [{ value_type: 'ref', value: '$.t1.recordLink' }] }],
        },
      },
    ],
  };
  await test('profileFromWebTables: cùng dạng hồ sơ bộ kiểm v3 dùng → thiết kế hợp lệ qua validateWorkflowBody (trừ open_id)', () => {
    const r = v3.validateWorkflowBody(design, { mode: 'create', profile: conv.profileFromWebTables(tables) });
    const errs = r.errors.filter((e) => !/receiver|open_?id|ou_/i.test(`${e.path} ${e.message}`));
    assert.deepStrictEqual(errs, []);
    const bad = v3.validateWorkflowBody({ ...design, steps: [{ ...design.steps[0], data: { table_name: 'Không có' } }, design.steps[1]] }, { mode: 'create', profile: conv.profileFromWebTables(tables) });
    assert.ok(bad.errors.some((e) => /Không có/.test(e.message)));
  });
  await test('v3ToInternal: AddRecordTrigger + LarkMessageAction → khuôn nội bộ đo từ dữ liệu thật', () => {
    const r = conv.v3ToInternal(design, tables, me);
    assert.strictEqual(r.ok, true, JSON.stringify(r.errors));
    assert.strictEqual(r.triggerName, 'addRecord');
    const [t, a] = r.draft.steps;
    assert.match(t.id, /^trig/);
    assert.match(a.id, /^act/);
    assert.strictEqual(t.type, 'AddRecordTrigger');
    assert.strictEqual(t.data.tableId, 'ref_tblMqfzvjMpJiGRt');
    assert.strictEqual(t.data.watchedFieldId, 'ref_tblMqfzvjMpJiGRt_fld52eqPQQ');
    assert.deepStrictEqual(t.next, [{ ids: [a.id] }]);
    assert.deepStrictEqual(a.next, []);
    assert.strictEqual(a.data.persons[0].id, me.id);
    assert.strictEqual(a.data.persons[0].tagType, 'user');
    assert.deepStrictEqual(a.data.title, [{ text: 'Có tương tác mới', type: 'text' }]);
    const para = a.data.richTextContent[0].value;
    assert.strictEqual(para[0].text, 'Tiêu đề: ');
    assert.strictEqual(para[1].type, 'ref');
    assert.strictEqual(para[1].stepId, t.id);
    assert.deepStrictEqual(para[1].fields, [{ fieldId: 'ref_tblMqfzvjMpJiGRt_fld52eqPQQ', type: 1 }]);
    assert.strictEqual(a.data.btnList[0].link[0].tagType, 'stepLink');
    assert.strictEqual(r.extra.TableMap.ref_tblMqfzvjMpJiGRt.TableID, 'tblMqfzvjMpJiGRt');
    assert.strictEqual(r.extra.TableMap.ref_tblMqfzvjMpJiGRt.FieldMap.ref_tblMqfzvjMpJiGRt_fld52eqPQQ, 'fld52eqPQQ');
    assert.deepStrictEqual(r.extra.BtnTrigger, { TableID: '', FieldID: '' });
    assert.strictEqual(r.draft.title, design.title);
  });
  await test('v3ToInternal: SetRecordTrigger theo lựa chọn → id option thật; chữ trơn ở cột chữ bị từ chối', () => {
    const r = conv.v3ToInternal(
      { title: 'x', steps: [{ id: 't1', type: 'SetRecordTrigger', next: 'a1', data: { table_name: 'Tương tác', field_watch_info: [{ field_name: 'Trạng thái', operator: 'is', value: [{ value_type: 'option', value: { name: 'Đóng' } }] }] } }, design.steps[1]] },
      tables,
      me,
    );
    assert.strictEqual(r.ok, true, JSON.stringify(r.errors));
    assert.deepStrictEqual(r.draft.steps[0].data.fields, [{ fieldId: 'ref_tblMqfzvjMpJiGRt_fldGoAQZa3', fieldType: 3, operator: 'is', value: ['optwQirOpQ'] }]);
    assert.strictEqual(r.triggerName, 'setRecord');
    const bad = conv.v3ToInternal(
      { title: 'x', steps: [{ id: 't1', type: 'SetRecordTrigger', next: 'a1', data: { table_name: 'Tương tác', field_watch_info: [{ field_name: 'Tiêu đề', value: [{ value_type: 'text', value: 'a' }] }] } }, design.steps[1]] },
      tables,
      me,
    );
    assert.strictEqual(bad.ok, false);
  });
  await test('v3ToInternal: loại bước cần trình soạn (LarkMessageTrigger…) → unsupported; nhánh trỏ tới bước không có → lỗi', () => {
    const r = conv.v3ToInternal({ title: 'x', steps: [design.steps[0], { id: 'a1', type: 'AIAnalysisAction', data: {} }] }, tables, me);
    assert.strictEqual(r.ok, false);
    assert.deepStrictEqual(r.unsupported, ['AIAnalysisAction']);
    const br = conv.v3ToInternal({ title: 'x', steps: [design.steps[0], { ...design.steps[1], children: { links: [{ kind: 'if_true', to: 'z' }] } }] }, tables, me);
    assert.strictEqual(br.ok, false);
  });
  await test('v3ToInternal: người nhận open_id ou_… / nhóm chat oc_… bị từ chối kèm lý do; ref tới bước SAU bị từ chối', () => {
    const r = conv.v3ToInternal({ title: 'x', steps: [design.steps[0], { ...design.steps[1], data: { ...design.steps[1].data, receiver: [{ value_type: 'group', value: { id: 'oc_x' } }] } }] }, tables, me);
    assert.strictEqual(r.ok, false);
    assert.ok(r.errors.some((e) => /người nhận/.test(e)));
    const r2 = conv.v3ToInternal({ title: 'x', steps: [design.steps[0], { ...design.steps[1], data: { ...design.steps[1].data, content: [{ value_type: 'ref', value: '$.a1.fldX' }] } }] }, tables, me);
    assert.strictEqual(r2.ok, false);
    // Nút mở link chữ (URL) nay tạo được: link = đoạn chữ.
    const r3 = conv.v3ToInternal({ title: 'x', steps: [design.steps[0], { ...design.steps[1], data: { ...design.steps[1].data, btn_list: [{ text: 'Web', btn_action: 'openLink', link: [{ value_type: 'text', value: 'https://x' }] }] } }] }, tables, me);
    assert.strictEqual(r3.ok, true, JSON.stringify(r3.errors));
    assert.deepStrictEqual(r3.draft.steps[1].data.btnList[0].link, [{ type: 'text', text: 'https://x' }]);
  });
  await test('verifyReadBack: đúng bước + TẮT = ok; lệch bước hoặc ĐANG BẬT = không ok', () => {
    const r = conv.v3ToInternal(design, tables, me);
    const saved = { workflowID: '1', status: 0, draft: JSON.stringify(r.draft) };
    assert.deepStrictEqual(conv.verifyReadBack(saved, r.draft), { ok: true, enabled: false, problems: [] });
    assert.strictEqual(conv.verifyReadBack({ ...saved, status: 1 }, r.draft).ok, false);
    assert.strictEqual(conv.verifyReadBack({ ...saved, draft: '{"steps":[]}' }, r.draft).ok, false);
    assert.strictEqual(conv.verifyReadBack(null, r.draft).ok, false);
  });

  // ── Chế độ Tạo workflow: bộ công cụ + chốt ghi ─────────────────────────────────────────────
  await test('workflowModeTools: chỉ công cụ web/schema/UI; create có gate; không có tool bật/xuất bản; xoá CHỈ qua lark_web_delete (luôn hỏi)', () => {
    const tools = require(join(B, 'tools', 'index.js'));
    const names = tools.workflowModeTools(false).map((t) => t.name);
    for (const n of ['lark_web_list_bases', 'lark_web_scan_base', 'lark_web_create_automation', 'bitable_workflow_schema', 'lark_ui_open', 'lark_ui_act', 'lark_ui_saved']) assert.ok(names.includes(n), n);
    // 10/10/2026 người dùng yêu cầu xoá được bảng/automation/workflow khi họ cho phép → có ĐÚNG MỘT tool
    // xoá, luôn qua hộp xác nhận (gated, không bao giờ additive → công tắc "Tự động" không tự duyệt).
    for (const n of names) assert.ok(n === 'lark_web_delete' || !/enable|delete|publish|_record$|send_message/i.test(n), n);
    assert.ok(names.includes('lark_web_delete'));
    assert.strictEqual(tools.isWriteTool('lark_web_delete'), true, 'xoá phải có hộp xác nhận');
    assert.strictEqual(tools.isAdditiveTool('lark_web_delete'), false, 'xoá không bao giờ được tự duyệt');
    assert.ok(!names.includes('bitable_workflow_create'));
    assert.ok(tools.workflowModeTools(true).map((t) => t.name).includes('bitable_workflow_create'));
    assert.strictEqual(tools.isWriteTool('lark_web_create_automation'), true);
    assert.strictEqual(tools.isWriteTool('lark_web_scan_base'), false);
    assert.strictEqual(tools.isWriteTool('lark_web_list_bases'), false);
  });
  await test('lark_web_create_automation: không có tham số bật; createWebAutomation luôn gửi status 0', () => {
    const tools = require(join(B, 'tools', 'index.js'));
    const t = tools.resolveTool('lark_web_create_automation');
    assert.ok(!('enable' in t.inputSchema.properties));
    assert.ok(!('status' in t.inputSchema.properties));
    const src = readFileSync(join(__dirname, '..', 'main', 'runtime', 'lark', 'larkWebSession.ts'), 'utf8');
    const m = /async createWebAutomation[\s\S]*?\n  }\n/.exec(src);
    assert.ok(m && /status: 0/.test(m[0]) && !/status: 1|status: p\.|enable/.test(m[0]));
  });
  await test('buildWorkflowSystemPrompt: quét → cấu trúc → thiết kế → viết ra → tạo NGAY (một lần cho cả bộ); cấm bật; giữ người nhận là cột', () => {
    const sp = require(join(B, 'systemPrompt.js'));
    const p = sp.buildWorkflowSystemPrompt({ base: { appToken: 'BaseTokX', name: 'Larkwave Test' }, me: { name: 'Phương' } });
    assert.ok(p.includes('BaseTokX') && p.includes('Larkwave Test'));
    const iScan = p.indexOf('lark_web_scan_base');
    const iStruct = p.indexOf('lark_web_add_table');
    const iBatch = p.indexOf('6) TẠO');
    assert.ok(iScan > 0 && iStruct > iScan && iBatch > iStruct);
    assert.ok(/VIẾT RA CÂY/.test(p) && /TẠO NGAY/.test(p), 'mặc định tự động: viết cây thiết kế rồi tạo luôn');
    assert.ok(/THIẾT KẾ CÓ LOGIC THẬT/.test(p) && /IfElseBranch/.test(p) && /Loop/.test(p) && /KHÔNG rút gọn thành trigger → gửi tin/.test(p), 'yêu cầu có logic → dựng đủ bước');
    assert.ok(/saved_tree/.test(p) && /lark_check/.test(p) && /block_id/.test(p));
    assert.ok(!/choices \["Tạo bản nháp"/.test(p), 'không còn xin phép bằng ask_user');
    assert.ok(/TỰ ĐỘNG/.test(p));
    assert.ok(/HỎI TRƯỚC KHI GHI/.test(sp.buildWorkflowSystemPrompt({ auto: false })));
    assert.ok(/KHÔNG đổi người nhận sang "tôi"/.test(p));
    assert.ok(/lark_ui_health/.test(p) && /lark_ui_dismiss/.test(p) && /SẠCH/.test(p));
    assert.ok(/KHÔNG được tìm cách BẬT/.test(p));
    assert.ok(!p.includes('bitable_workflow_create'));
    assert.ok(sp.buildWorkflowSystemPrompt({ openApi: true }).includes('bitable_workflow_create'));
    assert.ok(/CHƯA CHỌN BASE/.test(sp.buildWorkflowSystemPrompt({})));
  });
  await test('larkService: (hợp nhất) KHÔNG dùng Tự động duyệt chung cho lượt Lark; công tắc riêng BẬT = mọi thao tác trừ xoá', () => {
    const src = readFileSync(join(__dirname, '..', 'main', 'runtime', 'lark', 'larkService.ts'), 'utf8');
    assert.ok(/const autoApprove = workflowTurn \? false/.test(src));
    assert.ok(/!workflowTurn && this\.store\.getSettings\(\)\.autoApprove/.test(src));
    assert.ok(/const autoApproveTool = workflowTurn \? \(_name: string\): boolean \| 'all' => \(this\.workflowAutoOn\(\) \? 'all' : false\)/.test(src), 'Tự động BẬT ⇒ "all" (mọi thao tác trừ xoá)');
    assert.ok(/workflowAuto !== false/.test(src), 'mặc định BẬT');
  });

  // ── Duyệt: tool cộng-thêm tự chạy ở Tạo workflow, xoá/ghi đè vẫn hỏi ──────────────────────────
  const exec = require(join(B, 'larkToolExec.js'));
  const tools = require(join(B, 'tools', 'index.js'));
  await test('needsConfirmation: additive + công tắc BẬT → không hỏi; công tắc TẮT → hỏi; tool không additive → luôn hỏi', () => {
    const on = { autoApproveTool: (n) => tools.isAdditiveTool(n) };
    const off = { autoApproveTool: () => false };
    for (const n of ['lark_web_create_automation', 'lark_web_create_automations', 'lark_web_add_table', 'lark_web_add_fields', 'lark_ui_template_apply']) {
      const t = tools.resolveTool(n);
      assert.ok(t && t.gated && t.additive, n);
      assert.strictEqual(exec.needsConfirmation(t, on), false, n + ' tự chạy');
      assert.strictEqual(exec.needsConfirmation(t, off), true, n + ' hỏi khi công tắc tắt');
    }
    // Hàm tự duyệt "lỡ" trả true cho MỌI tên vẫn không mở được tool không-additive (chốt nằm ở needsConfirmation).
    const yes = { autoApproveTool: () => true };
    for (const t of tools.allTools().filter((x) => x.gated && !x.additive)) assert.strictEqual(exec.needsConfirmation(t, yes), true, t.name);
    assert.strictEqual(exec.needsConfirmation({ name: 'x', gated: false }, {}), false);
    assert.strictEqual(exec.needsConfirmation({ name: 'x', gated: true }, {}, true), false, 'preflight đã chặn → không hỏi');
    assert.strictEqual(exec.needsConfirmation({ name: 'x', gated: true }, { autoApprove: true }), false);
  });
  await test("công tắc Tự động BẬT ('all'): mọi thao tác ghi chạy luôn — sửa, ghi đè, gửi tin, tạo lịch — TRỪ xoá", () => {
    const all = { autoApproveTool: () => 'all' };
    const gated = tools.allTools().filter((x) => x.gated);
    const dels = gated.filter((x) => exec.isDeleteToolName(x.name));
    assert.ok(dels.length >= 3 && dels.some((x) => x.name === 'lark_web_delete'), 'có tool xoá để kiểm');
    for (const t of gated) assert.strictEqual(exec.needsConfirmation(t, all, false, {}), exec.isDeleteToolName(t.name), t.name);
    for (const n of ['lark_web_update_records', 'messaging_send_message', 'schedule_agent_job', 'zalo_send_text', 'gmail_send']) {
      const t = tools.resolveTool(n);
      if (t) assert.strictEqual(exec.needsConfirmation(t, all), false, n + ' không hỏi khi Tự động bật');
    }
    // TẮT ⇒ hỏi mọi thao tác ghi không cộng thêm (như cũ).
    for (const t of gated.filter((x) => !x.additive)) assert.strictEqual(exec.needsConfirmation(t, { autoApproveTool: () => false }), true, t.name);
    assert.ok(!exec.isDeleteToolName('lark_web_update_records') && exec.isDeleteToolName('bitable_delete_record') && exec.isDeleteToolName('bitable_remove_role_member'));
  });
  await test('additive chỉ gắn cho thao tác CỘNG THÊM: không tool xoá/sửa/bật/gửi nào là additive', () => {
    const add = tools.allTools().filter((t) => t.additive);
    for (const t of add) {
      assert.ok(t.gated, t.name + ' additive phải là gated');
      assert.ok(!/delete|remove|update|enable|publish|send|set_|_set|overwrite|clear/i.test(t.name), t.name);
    }
    assert.strictEqual(tools.isAdditiveTool('bitable_workflow_update'), false);
    assert.strictEqual(tools.isAdditiveTool('lark_web_scan_base'), false, 'tool đọc không phải additive');
  });

  // ── Người nhận là CỘT NGƯỜI (khuôn đo từ automation thật) ────────────────────────────────────
  const real = fx('automation-person-field.json');
  await test('v3ToInternal: người nhận = cột Người của bản ghi trigger → đúng khuôn Lark lưu (tagType step, value "step"), groups sao chép persons', () => {
    const d = JSON.parse(JSON.stringify(design));
    d.steps[1].data.receiver = [{ value_type: 'ref', value: '$.t1.fldUi0s6Ud' }];
    const r = conv.v3ToInternal(d, tables, me);
    assert.strictEqual(r.ok, true, JSON.stringify(r.errors));
    const [t, a] = r.draft.steps;
    const p = a.data.persons[0];
    const want = real.action.data.persons[0];
    assert.deepStrictEqual(Object.keys(p).sort(), Object.keys(want).sort(), 'cùng bộ khoá với bản Lark lưu');
    assert.strictEqual(p.tagType, 'step');
    assert.strictEqual(p.value, 'step');
    assert.strictEqual(p.stepId, t.id);
    assert.deepStrictEqual(p.fields, [{ fieldId: 'ref_tblMqfzvjMpJiGRt_fldUi0s6Ud', type: 11 }]);
    assert.match(p.id, new RegExp(`^${t.id}-tblMqfzvjMpJiGRt-fldUi0s6Ud-\\d+$`));
    assert.deepStrictEqual(a.data.groups, a.data.persons, 'giống mọi bản Lark lưu: groups = persons');
    assert.strictEqual(r.extra.TableMap.ref_tblMqfzvjMpJiGRt.FieldMap.ref_tblMqfzvjMpJiGRt_fldUi0s6Ud, 'fldUi0s6Ud');
    // Bọc ref trong value_type "user" (agent hay viết vậy) cũng nhận.
    d.steps[1].data.receiver = [{ value_type: 'user', value: { id: '$.t1.fldUi0s6Ud' } }, { value_type: 'user', value: { id: 'me' } }];
    const r2 = conv.v3ToInternal(d, tables, me);
    assert.strictEqual(r2.ok, true, JSON.stringify(r2.errors));
    assert.deepStrictEqual(r2.draft.steps[1].data.persons.map((x) => x.tagType), ['step', 'user']);
  });
  await test('v3ToInternal: người nhận là cột KHÔNG phải Người (vd Văn bản) → từ chối kèm lý do; ref nội dung cùng khuôn Lark ("step" + extra)', () => {
    const d = JSON.parse(JSON.stringify(design));
    d.steps[1].data.receiver = [{ value_type: 'ref', value: '$.t1.fld52eqPQQ' }];
    const r = conv.v3ToInternal(d, tables, me);
    assert.strictEqual(r.ok, false);
    assert.ok(r.errors.some((e) => /không phải cột Người/.test(e)), r.errors.join(' '));
    const ok = conv.v3ToInternal(design, tables, me);
    const ref = ok.draft.steps[1].data.richTextContent[0].value[1];
    const realRef = real.action.data.richTextContent[0].value.find((x) => x.type === 'ref');
    assert.deepStrictEqual(Object.keys(ref).sort(), Object.keys(realRef).sort());
    assert.strictEqual(ref.value, 'step');
  });

  await test('hộp xác nhận đọc được: ref cột → «Tên cột», người nhận là cột → «Tên cột», "me" → @bạn (không còn [trigger_1.fld…])', () => {
    const core = require('@larkwave/core');
    const d = JSON.parse(JSON.stringify(design));
    d.steps[1].data.receiver = [{ value_type: 'ref', value: '$.t1.fldUi0s6Ud' }, { value_type: 'user', value: { id: 'me' } }];
    const text = core.workflowDesignText(d.steps, { fieldNames: { fld52eqPQQ: 'Tiêu đề', fldUi0s6Ud: 'Người xử lý' } });
    assert.ok(text.includes('Gửi tin Lark tới «Người xử lý», @bạn'), text);
    assert.ok(text.includes('Tiêu đề: «Tiêu đề»'), text);
    assert.ok(!/fld[A-Za-z0-9]{6}|trigger_1|\$\./.test(text), text);
  });

  // ── Dựng cấu trúc Base qua lớp lệnh của trang Lark ───────────────────────────────────────────
  const bs = require(join(B, 'baseStructure.js'));
  const so = fx('structure-ops.json');
  await test('fieldData: đúng khuôn trang Lark gửi khi thêm cột (Chọn một / Người / Ngày / Văn bản)', () => {
    const sel = bs.fieldData({ name: 'LW opt', type: 'single_select', options: ['Mở', 'Đóng', 'Mở'] });
    assert.ok(sel.ok);
    const w = so.addField_args.data;
    assert.deepStrictEqual(Object.keys(sel.data).sort(), Object.keys(w).sort());
    assert.strictEqual(sel.data.type, w.type);
    assert.strictEqual(sel.data.fieldUIType, w.fieldUIType);
    assert.deepStrictEqual(sel.data.exInfo, w.exInfo);
    assert.deepStrictEqual(sel.data.property.options.map((o) => [o.name, o.color]), [['Mở', 0], ['Đóng', 1]], 'khử trùng lựa chọn');
    for (const o of sel.data.property.options) assert.match(o.id, /^opt[A-Za-z0-9]{7}$/);
    const per = bs.fieldData({ name: 'Sales', type: 'person' }).data;
    assert.deepStrictEqual([per.type, per.fieldUIType, per.property], [so.existing_fieldMap.person.type, so.existing_fieldMap.person.fieldUIType, so.existing_fieldMap.person.property]);
    const dt = bs.fieldData({ name: 'ETA', type: 'ngày' }).data;
    assert.deepStrictEqual([dt.type, dt.fieldUIType, dt.property], [5, 'DateTime', so.existing_fieldMap.date.property]);
    assert.strictEqual(bs.fieldData({ name: 'X', type: 'select' }).ok, false, 'chọn một không có lựa chọn → lỗi');
    assert.strictEqual(bs.fieldData({ name: 'X', type: 'formula' }).ok, false);
  });
  await test('planFields: chỉ CỘNG THÊM — cột trùng tên bỏ qua, lựa chọn đã có bỏ qua, cột không phải chọn thì từ chối thêm lựa chọn', () => {
    const t = tables[0];
    const plan = bs.planFields(t, [{ name: 'tiêu đề', type: 'text' }, { name: 'Ghi chú', type: 'text' }], [{ field_name: 'Trạng thái', options: ['Đóng', 'Mới'] }, { field_name: 'Tiêu đề', options: ['a'] }]);
    assert.deepStrictEqual(plan.skipped, ['tiêu đề']);
    assert.deepStrictEqual(plan.add.map((f) => f.name), ['Ghi chú']);
    assert.deepStrictEqual(plan.addOptions, [{ fieldId: 'fldGoAQZa3', fieldName: 'Trạng thái', names: ['Mới'] }]);
    assert.ok(plan.errors.some((e) => /không phải cột chọn/.test(e)));
  });
  await test('structureScript (trong trang): tạo bảng → đặt tên → đổi tên cột chính → thêm cột; CHỈ xoá dòng trống do chính addTable sinh ra', async () => {
    const vm = require('node:vm');
    const calls = [];
    const recData = { reczz28LAyx2qBKh: {}, reczz28LAyx2thhM: {}, reczz28LAyx2sdYO: { fldnFOtJzV: { value: [{ type: 'text', text: 'người dùng gõ vào' }] } }, reczz28LAyx2sAgs: {}, reczz28LAyx2tw0f: {}, recUSER0000001: {} };
    const ctx = {
      base: {
        getToken: () => 'BaseTok',
        getTable: () => ({ getPrimaryField: () => ({ toJSON: () => ({ id: 'fldnFOtJzV', name: 'Text', type: 1 }) }), getRecordIdList: () => Object.keys(recData), getRecordDataById: (id) => recData[id] }),
      },
      operate: {
        baseOperate: {
          addTable: async (a) => (calls.push(['addTable', a]), so.addTable_result),
          setBlock: async (a) => (calls.push(['setBlock', a]), { result: 2 }),
        },
        tableOperate: {
          setField: async (a) => (calls.push(['setField', a]), { result: 2 }),
          addField: async (a) => (calls.push(['addField', a]), { result: 2, data: { fieldId: 'fldNEW' + calls.length } }),
          addSelectFieldOption: async (a) => (calls.push(['addOpt', a]), { result: 2 }),
          delRecords: async (a) => (calls.push(['delRecords', a]), { result: 2 }),
        },
      },
    };
    const other = { base: { getToken: () => 'OtherBase' } };
    const plan = bs.planFields(null, [{ name: 'Trạng thái', type: 'single_select', options: ['A'] }, { name: 'Sales', type: 'person' }]);
    const js = bs.structureScript({ token: 'BaseTok', createTable: { name: 'Lô hàng 2', primaryFieldName: 'Mã lô', removePlaceholders: true }, fields: plan.add, addOptions: [] });
    const out = await vm.runInNewContext(js, { window: { bitableConnectContexts: new Set([other, ctx]) }, Array, Object, JSON, String, Promise });
    assert.strictEqual(out.ok, true, JSON.stringify(out));
    assert.strictEqual(out.tableId, 'tblJ3obpXhtaLUM1');
    const J = (x) => JSON.parse(JSON.stringify(x)); // đối tượng sinh trong vm khác realm
    assert.deepStrictEqual(J(calls[0]), ['addTable', so.addTable_args]);
    assert.deepStrictEqual(J(calls[1]), ['setBlock', { id: 'tblJ3obpXhtaLUM1', name: 'Lô hàng 2' }]);
    assert.strictEqual(calls[2][0], 'setField');
    assert.strictEqual(calls[2][1].data.name, 'Mã lô');
    assert.deepStrictEqual(calls.filter((c) => c[0] === 'addField').map((c) => c[1].data.name), ['Trạng thái', 'Sales']);
    const del = calls.find((c) => c[0] === 'delRecords');
    assert.deepStrictEqual(J(del[1].recordIds).sort(), ['reczz28LAyx2qBKh', 'reczz28LAyx2sAgs', 'reczz28LAyx2thhM', 'reczz28LAyx2tw0f'].sort(), 'không xoá dòng có dữ liệu, không xoá dòng không do addTable tạo');
    assert.strictEqual(out.removedPlaceholders, 4);
    const none = await vm.runInNewContext(bs.structureScript({ token: 'Khác', tableId: 't', fields: [], addOptions: [] }), { window: { bitableConnectContexts: new Set([ctx]) }, Array, Object, JSON, String, Promise });
    assert.strictEqual(none.error, 'no-context', 'sai Base → không làm gì');
  });
  await test('verifyStructure: đọc lại thiếu cột / sai kiểu / sai tên bảng → không ok', () => {
    const t = tables[0];
    assert.deepStrictEqual(bs.verifyStructure(t, { name: 'Tương tác', fields: [{ name: 'Trạng thái', type: 3 }] }), { ok: true, problems: [] });
    assert.strictEqual(bs.verifyStructure(t, { fields: [{ name: 'Trạng thái', type: 1 }] }).ok, false);
    assert.strictEqual(bs.verifyStructure(t, { fields: [{ name: 'Không có', type: 1 }] }).ok, false);
    assert.strictEqual(bs.verifyStructure(null, { fields: [] }).ok, false);
  });

  // ── Tự kiểm khung Lark: lớp chặn + đóng an toàn ──────────────────────────────────────────────
  const ui = require(join(B, 'larkUiCore.js'));
  const ov = fx('blocking-overlays.json');
  await test('classifyBlocking: hộp "bản ghi chưa gửi" đứng đầu; toast thành công không tính; giao diện sạch → null', () => {
    const b = ui.classifyBlocking(ov);
    assert.strictEqual(b.kind, 'unsaved-record');
    assert.deepStrictEqual(b.buttons, ['Back to Edit', 'Exit']);
    assert.strictEqual(b.others, 2);
    assert.strictEqual(ui.classifyBlocking([ov[3]]).kind, 'record-form', 'form thêm bản ghi đang mở (đo thật)');
    assert.strictEqual(ui.classifyBlocking([ov[2]]), null);
    assert.strictEqual(ui.classifyBlocking([]), null);
    assert.strictEqual(ui.classifyBlocking([{ role: '', cls: 'ud__toast ud__toast-error', text: 'Save failed: no permission', buttons: [], w: 200, h: 40 }]).kind, 'error-toast');
    assert.strictEqual(ui.classifyBlocking([{ role: 'alertdialog', cls: '', text: 'Delete this automation?', buttons: [{ text: 'Delete' }, { text: 'Cancel' }], w: 400, h: 200 }]).kind, 'confirm-dialog');
  });
  await test('pickSafeButton: Exit/Huỷ/Đóng/取消 — KHÔNG BAO GIỜ Xoá/Bật/Lưu/Gửi/Xác nhận/Back to Edit', () => {
    assert.strictEqual(ui.pickSafeButton(ov[0].buttons).text, 'Exit');
    assert.strictEqual(ui.pickSafeButton([{ text: 'Delete' }, { text: 'Cancel' }]).text, 'Cancel');
    assert.strictEqual(ui.pickSafeButton([{ text: 'Xác nhận' }, { text: 'Huỷ' }]).text, 'Huỷ');
    assert.strictEqual(ui.pickSafeButton([{ text: '确认' }, { text: '取消' }]).text, '取消');
    for (const bad of ['Delete', 'Xoá', 'Enable', 'Bật', 'Save', 'Lưu', 'Submit', 'Gửi', 'Confirm', 'OK', 'Back to Edit', 'Publish', '删除'])
      assert.strictEqual(ui.pickSafeButton([{ text: bad }]), null, bad);
    assert.strictEqual(ui.UI_ACTION_CAP, 200);
  });

  await test('dismiss: form gõ dở → Escape → hộp "chưa gửi" → bấm Exit (không bấm Back to Edit/Submit) → sạch', async () => {
    const { LarkCdpDriver } = require(join(B, 'larkCdp.js'));
    const seq = [[ov[3]], [ov[0], ov[3]], []];
    const sent = [];
    let k = 0;
    const wc = {
      isDestroyed: () => false,
      getURL: () => 'https://abc.sg.larksuite.com/base/BaseTok?table=tbl1',
      debugger: {
        attach() {}, isAttached: () => true, detach() {}, on() {},
        sendCommand: async (m, p) => {
          sent.push([m, p]);
          if (m === 'Runtime.evaluate' && /ud__drawer/.test(p.expression)) return { result: { value: seq[Math.min(k++, seq.length - 1)] } };
          return {};
        },
      },
    };
    const d = new LarkCdpDriver();
    d.bind(wc);
    const r = await d.dismiss();
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.deepStrictEqual(r.steps, ['Escape', 'bấm «Exit»']);
    const clicks = sent.filter(([m, p]) => m === 'Input.dispatchMouseEvent' && p.type === 'mousePressed');
    assert.deepStrictEqual(clicks.map(([, p]) => [p.x, p.y]), [[672.8, 452]], 'chỉ bấm đúng nút Exit');
    const h = await d.health();
    assert.strictEqual(h.clean, true);
  });

  // ── Tạo NHIỀU automation trong một lần gọi: lỗi một mục không chặn các mục khác ─────────────
  await test('lark_web_create_automations: tạo lần lượt, mục lỗi báo riêng, mục ok vẫn tạo; luôn status 0', async () => {
    const web = require(join(B, 'larkWebSession.js')).getLarkWebSession();
    const sent = [];
    web.scanWebBase = async () => ({ meta: { name: 'Base Test' }, tables, automations: [], workflows: [], errors: [] });
    web.webMe = async () => me;
    web.createWebAutomation = async (tok, p) => (sent.push({ tok, ...p }), { workflowID: '76945' + sent.length });
    web.readWebAutomation = async (tok, id) => ({ workflowID: id, status: 0, draft: sent[sent.length - 1].draft });
    web.showBase = async () => {};
    const t = tools.resolveTool('lark_web_create_automations');
    const bad = { title: 'Hỏng', steps: [design.steps[0], { ...design.steps[1], data: { ...design.steps[1].data, receiver: [{ value_type: 'ref', value: '$.t1.fld52eqPQQ' }] } }] };
    const input = { app_token: 'BaseTokZ', workflows: [design, bad, { ...design, title: 'Thứ ba' }] };
    assert.strictEqual(await t.preflight(input), null, 'có mục hợp lệ → không chặn trước');
    const prev = await t.preview(input);
    assert.strictEqual(prev.fieldNames.fldUi0s6Ud, 'Người xử lý', 'hộp xác nhận có tên cột');
    const r = await t.exec(input);
    assert.strictEqual(r.created, 2);
    assert.strictEqual(r.failed, 1);
    assert.deepStrictEqual(r.items.map((x) => x.ok), [true, false, true]);
    assert.ok(/không phải cột Người/.test(JSON.stringify(r.items[1])));
    assert.strictEqual(sent.length, 2);
    assert.ok(r.items[0].design_text.includes('«Tiêu đề»'), r.items[0].design_text);
    const all = await t.preflight({ app_token: 'BaseTokZ', workflows: [bad] });
    assert.strictEqual(all.ok, false, 'tất cả hỏng → chặn trước, không hỏi');
    assert.ok(!('status' in t.inputSchema.properties.workflows.items.properties));
  });

  // ── Cầu MCP: chờ người dùng lâu không làm CLI cắt kết nối ───────────────────────────────────
  await test('MCP: hạn chờ của CLI (config timeout + MCP_TOOL_TIMEOUT + idle) dài hơn hạn chờ duyệt 10 phút', () => {
    const src = readFileSync(join(__dirname, '..', 'main', 'runtime', 'lark', 'larkAgent.ts'), 'utf8');
    assert.ok(/export const MCP_TOOL_WAIT_MS = 15 \* 60_000/.test(src));
    assert.ok(/timeout: MCP_TOOL_WAIT_MS/.test(src), 'trường timeout trong cấu hình server lark');
    assert.ok(/MCP_TOOL_TIMEOUT: String\(MCP_TOOL_WAIT_MS\)/.test(src) && /CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT: String\(MCP_TOOL_WAIT_MS\)/.test(src));
    assert.ok(/\.\.\.mcpWaitEnv\(\)/.test(src));
    const ms = readFileSync(join(__dirname, '..', 'main', 'runtime', 'lark', 'mcpServer.ts'), 'utf8');
    assert.ok(/CONFIRM_TIMEOUT_MS = 10 \* 60_000/.test(ms) && 15 * 60_000 > 10 * 60_000);
  });
  await test('MCP: tools/call chờ duyệt trả bằng SSE — có nhịp giữ kết nối/tiến độ trong lúc chờ, rồi kết quả', async () => {
    const { startMcpBridge } = require(join(B, 'mcpServer.js'));
    let release;
    const gate = new Promise((r) => (release = r));
    const events = [];
    const bridge = await startMcpBridge({
      tools: [{ name: 'w', description: 'x', gated: true, inputSchema: { type: 'object' }, exec: async () => ({ done: 1 }) }],
      client: {},
      emit: (e) => events.push(e),
      confirm: () => gate,
      ask: async () => '',
      heartbeatMs: 40,
    });
    try {
      setTimeout(() => release(true), 230);
      const res = await fetch(bridge.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'x-tw-token': bridge.token },
        body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'w', arguments: {}, _meta: { progressToken: 'p1' } } }),
      });
      assert.match(res.headers.get('content-type'), /text\/event-stream/);
      const txt = await res.text();
      const msgs = txt.split('\n\n').filter((b) => b.startsWith('event: message')).map((b) => JSON.parse(b.split('data: ')[1]));
      const prog = msgs.filter((m) => m.method === 'notifications/progress');
      assert.ok(prog.length >= 3, 'có tiến độ trong lúc chờ: ' + prog.length);
      assert.strictEqual(prog[0].params.progressToken, 'p1');
      const fin = msgs[msgs.length - 1];
      assert.strictEqual(fin.id, 7);
      assert.ok(/done/.test(fin.result.content[0].text));
      assert.ok(events.some((e) => e.type === 'tool_call' && e.gated === true));
      // Client chỉ nhận JSON → đường cũ.
      const plain = await fetch(bridge.url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-tw-token': bridge.token }, body: JSON.stringify({ jsonrpc: '2.0', id: 8, method: 'tools/list' }) });
      assert.match(plain.headers.get('content-type'), /application\/json/);
    } finally {
      await bridge.close();
    }
  });

  // ── Khung Lark gắn cạnh hội thoại ───────────────────────────────────────────────────────────
  const R = { x: 10.4, y: 20.6, width: 500, height: 600 };
  await test('dockDecision: gắn đúng toạ độ khi mở + có trang + không hộp thoại', () => {
    assert.deepStrictEqual(dock.dockDecision({ visible: true, paneOpen: true, overlayOpen: false, hasWindow: true, rect: R }), { kind: 'attach', rect: { x: 10, y: 21, width: 500, height: 600 } });
  });
  await test('dockDecision: hộp thoại app đang mở / thu gọn / ô quá nhỏ → giấu (vẫn gắn, vẫn vẽ)', () => {
    assert.deepStrictEqual(dock.dockDecision({ visible: true, paneOpen: true, overlayOpen: true, hasWindow: true, rect: R }), { kind: 'hide' });
    assert.deepStrictEqual(dock.dockDecision({ visible: true, paneOpen: false, overlayOpen: false, hasWindow: true, rect: R }), { kind: 'hide' });
    assert.deepStrictEqual(dock.dockDecision({ visible: true, paneOpen: true, overlayOpen: false, hasWindow: true, rect: { x: 0, y: 0, width: 1, height: 400 } }), { kind: 'hide' });
    assert.deepStrictEqual(dock.dockDecision({ visible: true, paneOpen: true, overlayOpen: false, hasWindow: true, rect: null }), { kind: 'hide' });
  });
  await test('dockDecision: màn bị ẩn hoặc chưa có trang → tháo (không để khung nổi đè app)', () => {
    assert.deepStrictEqual(dock.dockDecision({ visible: false, paneOpen: true, overlayOpen: false, hasWindow: true, rect: R }), { kind: 'detach' });
    assert.deepStrictEqual(dock.dockDecision({ visible: true, paneOpen: true, overlayOpen: false, hasWindow: false, rect: R }), { kind: 'detach' });
  });
  await test('shouldAutoOpen: AI vừa bắt đầu / chờ đăng nhập / hết phiên → tự mở; AI đang chạy tiếp thì không ép', () => {
    assert.strictEqual(dock.shouldAutoOpen({ ai: { active: true } }, false), true);
    assert.strictEqual(dock.shouldAutoOpen({ ai: { active: true } }, true), false);
    assert.strictEqual(dock.shouldAutoOpen({ loginPending: true }, false), true);
    assert.strictEqual(dock.shouldAutoOpen({ health: 'dead' }, false), true);
    assert.strictEqual(dock.shouldAutoOpen({ health: 'alive', connected: true }, false), false);
    assert.strictEqual(dock.shouldAutoOpen(null, false), false);
  });
  await test('clampPaneWidth: kẹp giữa tối thiểu và chừa chỗ cho hội thoại', () => {
    assert.strictEqual(dock.clampPaneWidth(100, 1400), 360);
    assert.strictEqual(dock.clampPaneWidth(1300, 1400), 980);
    assert.strictEqual(dock.clampPaneWidth(600.4, 1400), 600);
    assert.strictEqual(dock.clampPaneWidth(500, 600), 360);
  });

  // ── Đọc chi tiết automation qua phiên web (không App ID) ────────────────────────────────────
  await test('lark_web_read_automations: có trong bộ Tạo workflow, CHỈ ĐỌC; dịch cây logic bằng tên quét từ web (không Open API)', async () => {
    const tools = require(join(B, 'tools', 'index.js'));
    assert.ok(tools.workflowModeTools(false).map((t) => t.name).includes('lark_web_read_automations'));
    assert.strictEqual(tools.isWriteTool('lark_web_read_automations'), false);
    const wf = require(join(B, 'tools', 'workflows.js'));
    const raw = fx('automation-list.json').data.workflowList[0];
    const tbl = api.parseTableSchema(fx('clientvars.table.json'), 'Tương tác', 0);
    const [t] = await wf.translateWebWorkflows([{ raw }], [tbl]);
    assert.strictEqual(t.workflow_id, '7672057879164554974');
    assert.strictEqual(t.status_text, 'đang tắt');
    assert.ok(t.logic.includes('«Tương tác»'), t.logic);
    assert.ok(!/«tbl/.test(t.logic), 'không để lộ id bảng thô');
    const sp = require(join(B, 'systemPrompt.js'));
    assert.ok(sp.buildWorkflowSystemPrompt({ base: { appToken: 'X', name: 'Y' } }).includes('lark_web_read_automations'));
  });

  console.log(`  larkWeb: ${passed} kiểm qua`);
})();
