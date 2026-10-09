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
  await test('v3ToInternal: loại bước chưa có khuôn đo → unsupported (không đoán); rẽ nhánh cũng vậy', () => {
    const r = conv.v3ToInternal({ title: 'x', steps: [design.steps[0], { id: 'a1', type: 'SetRecordAction', data: {} }] }, tables, me);
    assert.strictEqual(r.ok, false);
    assert.deepStrictEqual(r.unsupported, ['SetRecordAction']);
    const br = conv.v3ToInternal({ title: 'x', steps: [design.steps[0], { ...design.steps[1], children: { links: [{ kind: 'if_true', to: 'z' }] } }] }, tables, me);
    assert.strictEqual(br.ok, false);
  });
  await test('v3ToInternal: người nhận open_id ou_… / nhóm chat bị từ chối kèm lý do; ref ngoài trigger bị từ chối', () => {
    const r = conv.v3ToInternal({ title: 'x', steps: [design.steps[0], { ...design.steps[1], data: { ...design.steps[1].data, receiver: [{ value_type: 'group', value: { id: 'oc_x' } }] } }] }, tables, me);
    assert.strictEqual(r.ok, false);
    assert.ok(r.errors.some((e) => /người nhận/.test(e)));
    const r2 = conv.v3ToInternal({ title: 'x', steps: [design.steps[0], { ...design.steps[1], data: { ...design.steps[1].data, content: [{ value_type: 'ref', value: '$.a1.fldX' }] } }] }, tables, me);
    assert.strictEqual(r2.ok, false);
    const r3 = conv.v3ToInternal({ title: 'x', steps: [design.steps[0], { ...design.steps[1], data: { ...design.steps[1].data, btn_list: [{ text: 'Web', btn_action: 'openLink', link: [{ value_type: 'text', value: 'https://x' }] }] } }] }, tables, me);
    assert.strictEqual(r3.ok, false);
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
  await test('workflowModeTools: chỉ công cụ web/schema/UI; create có gate; không có tool bật/xoá/ghi bản ghi', () => {
    const tools = require(join(B, 'tools', 'index.js'));
    const names = tools.workflowModeTools(false).map((t) => t.name);
    for (const n of ['lark_web_list_bases', 'lark_web_scan_base', 'lark_web_create_automation', 'bitable_workflow_schema', 'lark_ui_open', 'lark_ui_act', 'lark_ui_saved']) assert.ok(names.includes(n), n);
    for (const n of names) assert.ok(!/enable|delete|publish|_record$|send_message/i.test(n), n);
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
  await test('buildWorkflowSystemPrompt: quét → thiết kế → chờ đồng ý → tạo TẮT; cấm bật; có Base đang chọn', () => {
    const sp = require(join(B, 'systemPrompt.js'));
    const p = sp.buildWorkflowSystemPrompt({ base: { appToken: 'BaseTokX', name: 'Larkwave Test' }, me: { name: 'Phương' } });
    assert.ok(p.includes('BaseTokX') && p.includes('Larkwave Test'));
    const iScan = p.indexOf('lark_web_scan_base');
    const iCreate = p.indexOf('lark_web_create_automation');
    assert.ok(iScan > 0 && iCreate > iScan);
    assert.ok(/VIẾT RA VĂN BẢN/.test(p) && /CHƯA đồng ý → không tạo/.test(p));
    assert.ok(/KHÔNG được tìm cách BẬT/.test(p));
    assert.ok(!p.includes('bitable_workflow_create'));
    assert.ok(sp.buildWorkflowSystemPrompt({ openApi: true }).includes('bitable_workflow_create'));
    assert.ok(/CHƯA CHỌN BASE/.test(sp.buildWorkflowSystemPrompt({})));
  });
  await test('larkService: lượt workflow không đòi custom app, luôn hỏi xác nhận, không chạy đường API/MAIC', () => {
    const src = readFileSync(join(__dirname, '..', 'main', 'runtime', 'lark', 'larkService.ts'), 'utf8');
    assert.ok(/if \(!client && !general && !workflowTurn\)/.test(src));
    assert.ok(/const autoApprove = workflowTurn \? false/.test(src));
    assert.ok(/!workflowTurn && this\.store\.getSettings\(\)\.autoApprove/.test(src));
    assert.ok(/onApi = !!\(apiMode && apiKey && !general && !workflowTurn/.test(src));
    assert.ok(/!general && !workflowTurn && this\.accountTokenGetter/.test(src));
    assert.ok((src.match(/toolsOverride: workflowModeTools\(!!client\)/g) || []).length >= 2);
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

  console.log(`  larkWeb: ${passed} kiểm qua`);
})();
