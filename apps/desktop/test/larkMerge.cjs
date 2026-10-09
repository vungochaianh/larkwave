/**
 * Hợp nhất Lark × Agents ⇄ Tạo workflow (10/2026) + KHỐI Workflow:
 *   - thanh đầu gọn: chip động cơ (nhãn, chấm cảnh báo, nội dung popover), tooltip công tắc Tự động;
 *   - máy trạng thái bố cục (mở rộng / thu nhỏ / dải, thanh kéo, nhớ riêng máy);
 *   - chuyển hội thoại cũ (kind 'workflow' + thường) về MỘT danh sách, gộp "Hỏi nhanh của tôi", Base;
 *   - bộ công cụ hợp nhất + chốt duyệt (cộng thêm tự chạy khi Tự động bật, xoá/sửa/gửi luôn hỏi);
 *   - dựng/đọc payload KHỐI Workflow (workflow/create + addBlock + đọc lại), prompt "workflow" vs "automation".
 *
 * Fixtures đã thay id (test/fixtures/lark-web/workflow-block.json).
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
const UI = join(__dirname, '..', '.test-build', 'ui');
const eng = require(join(UI, 'engineChip.js'));
const lay = require(join(UI, 'larkLayout.js'));
const conv = require(join(UI, 'larkConversations.js'));
const dock = require(join(UI, 'larkDock.js'));
const wb = require(join(B, 'workflowBlock.js'));
const wa = require(join(B, 'webAutomation.js'));
const api = require(join(B, 'larkWebApi.js'));
const fx = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'lark-web', 'workflow-block.json'), 'utf8'));

let pass = 0;
const t = (name, fn) => { fn(); pass += 1; console.log('  ✓', name); };

// ── 1. Thanh đầu: chip động cơ ────────────────────────────────────────────────────────────────
const CLAUDE = { id: 'claude', label: 'Claude CLI', installed: true, ready: true, version: '2.1.286', latestVersion: '2.1.295', outdated: true, models: [{ id: 'fable', label: 'Claude Fable (mới nhất)' }, { id: 'opus', label: 'Claude Opus 4.6' }] };
const base = { runners: [CLAUDE], runnerId: 'claude', model: 'fable', runSource: 'cli', apiKeyReady: false, maicAvailable: false };
t('chip động cơ: "Claude · Fable" — bỏ chữ CLI, bỏ ngoặc, bỏ tiền tố Claude của model', () => {
  const m = eng.engineModel({ ...base, runners: [{ ...CLAUDE, outdated: false }] });
  assert.strictEqual(m.label, 'Claude · Fable');
  assert.strictEqual(m.dot, null);
  assert.strictEqual(m.warn, null);
  assert.strictEqual(eng.engineModel({ ...base, model: 'opus', runners: [{ ...CLAUDE, outdated: false }] }).label, 'Claude · Opus 4.6');
  assert.strictEqual(eng.shortModelLabel('grok-4', 'Grok CLI'), 'grok-4');
});
t('CLI cũ → chỉ CHẤM vàng trên chip; câu đầy đủ + lệnh cập nhật sao chép được nằm trong popover', () => {
  const m = eng.engineModel(base);
  assert.strictEqual(m.dot, 'warn');
  assert.strictEqual(m.warn.kind, 'outdated');
  assert.ok(m.warn.text.includes('2.1.286 → 2.1.295'));
  assert.strictEqual(m.warn.command, 'npm i -g @anthropic-ai/claude-code');
  assert.ok(!m.label.includes('cũ'), 'nhãn chip không chứa câu cảnh báo');
});
t('cảnh báo theo NGUỒN chạy: API thiếu key = chấm đỏ (CLI cũ không còn liên quan); Gói Larkwave chưa đăng nhập = đỏ', () => {
  const api1 = eng.engineModel({ ...base, runSource: 'api' });
  assert.strictEqual(api1.dot, 'error');
  assert.strictEqual(api1.warn.kind, 'apiNoKey');
  assert.strictEqual(api1.label, 'Claude · Fable · API');
  assert.strictEqual(eng.engineModel({ ...base, runSource: 'api', apiKeyReady: true }).dot, null);
  assert.strictEqual(eng.engineModel({ ...base, runSource: 'maic' }).warn.kind, 'maicOff');
  assert.strictEqual(eng.engineModel({ ...base, runSource: 'maic', maicAvailable: true }).dot, null);
});
t('lượt sẽ HỎNG xếp trước CLI cũ: chưa cài / cần đăng nhập = chấm đỏ', () => {
  assert.strictEqual(eng.engineModel({ ...base, runners: [{ ...CLAUDE, installed: false }] }).warn.kind, 'notInstalled');
  assert.strictEqual(eng.engineModel({ ...base, runners: [{ ...CLAUDE, ready: false }] }).warn.kind, 'needsLogin');
  assert.strictEqual(eng.engineModel({ ...base, runners: [{ ...CLAUDE, ready: false }] }).dot, 'error');
});
t('tooltip công tắc Tự động nói rõ: cộng thêm chạy luôn, xoá/sửa/gửi vẫn hỏi, không bao giờ tự bật', () => {
  assert.ok(/Xoá, sửa, ghi đè, gửi tin vẫn hỏi/.test(eng.autoTip(true)) && /Không bao giờ tự bật/.test(eng.autoTip(true)));
  assert.ok(/Hỏi trước khi ghi/.test(eng.autoTip(false)));
});

// ── 2. Bố cục ─────────────────────────────────────────────────────────────────────────────────
t('prefs: chuỗi hỏng/thiếu → mặc định từng trường (expanded 460, ngăn khung Lark ĐÓNG); kẹp giá trị lạ', () => {
  assert.deepStrictEqual(lay.parseLayoutPrefs('{bad'), lay.DEFAULT_PREFS);
  assert.strictEqual(lay.DEFAULT_PREFS.sidePaneOpen, false, 'Lark × Agents: khung Lark mặc định đóng');
  const p = lay.parseLayoutPrefs(JSON.stringify({ dock: 'weird', expandedW: 9999, historyOpen: 'yes', sidePaneOpen: true, sidePaneW: 10 }));
  assert.strictEqual(p.dock, 'expanded');
  assert.strictEqual(p.expandedW, 560);
  assert.strictEqual(p.historyOpen, false);
  assert.strictEqual(p.sidePaneOpen, true);
  assert.strictEqual(p.sidePaneW, 380);
  assert.deepStrictEqual(lay.parseLayoutPrefs(lay.serializeLayoutPrefs({ ...lay.DEFAULT_PREFS, dock: 'rail' })).dock, 'rail');
});
t('bề rộng hội thoại theo nấc: rail 48 · collapsed 300 · expanded kẹp để khung Lark ≥ 560', () => {
  assert.deepStrictEqual(lay.dockWidth({ dock: 'rail', expandedW: 460 }, 1500), { state: 'rail', width: 48 });
  assert.deepStrictEqual(lay.dockWidth({ dock: 'collapsed', expandedW: 460 }, 1500), { state: 'collapsed', width: 300 });
  assert.deepStrictEqual(lay.dockWidth({ dock: 'expanded', expandedW: 520 }, 1700), { state: 'expanded', width: 520 });
  // 1366px: vùng nội dung ~1100 → khung Lark ≥ 560 → hội thoại ≤ 540
  assert.deepStrictEqual(lay.dockWidth({ dock: 'expanded', expandedW: 560 }, 1100), { state: 'expanded', width: 540 });
  // quá hẹp cho expanded → hiển thị như collapsed, không đè khung Lark
  assert.strictEqual(lay.dockWidth({ dock: 'expanded', expandedW: 460 }, 900).state, 'collapsed');
});
t('chuyển nấc + kéo thanh chia: dưới 360 → thu nhỏ, dưới 170 → dải; từ 360 → mở rộng (kẹp 420–560)', () => {
  assert.strictEqual(lay.nextDock('expanded', 'toggle'), 'collapsed');
  assert.strictEqual(lay.nextDock('collapsed', 'toggle'), 'expanded');
  assert.strictEqual(lay.nextDock('rail', 'toggle'), 'expanded');
  assert.strictEqual(lay.nextDock('expanded', 'rail'), 'rail');
  assert.strictEqual(lay.nextDock('rail', 'restore'), 'expanded');
  assert.deepStrictEqual(lay.dragDock(120, 1400), { dock: 'rail' });
  assert.deepStrictEqual(lay.dragDock(300, 1400), { dock: 'collapsed' });
  assert.deepStrictEqual(lay.dragDock(380, 1400), { dock: 'expanded', expandedW: 420 });
  assert.deepStrictEqual(lay.dragDock(800, 1400), { dock: 'expanded', expandedW: 560 });
  assert.deepStrictEqual(lay.dragDock(800, 1000), { dock: 'expanded', expandedW: 440 });
});
t('bố cục chat: ngăn khung Lark kẹp chừa ≥ 460px cho hội thoại; hội thoại cũ kind workflow → mở ở bố cục frame', () => {
  assert.strictEqual(lay.sidePaneWidth(900, 1200), 740);
  assert.strictEqual(lay.sidePaneWidth(100, 1200), 380);
  assert.strictEqual(lay.preferredLayout({ kind: 'workflow' }), 'frame');
  assert.strictEqual(lay.preferredLayout({}), 'chat');
});
t('khung Lark: lớp nổi chỉ giấu native view khi ĐÈ lên ô giữ chỗ', () => {
  const pane = { x: 700, y: 100, width: 600, height: 700 };
  assert.strictEqual(dock.overlayHitsPane([{ x: 300, y: 120, width: 300, height: 200 }], pane), false, 'popover trong cột hội thoại');
  assert.strictEqual(dock.overlayHitsPane([{ x: 600, y: 120, width: 300, height: 200 }], pane), true, 'popover tràn sang khung');
  assert.strictEqual(dock.overlayHitsPane([{ x: 800, y: 120, width: 0, height: 0 }], pane), false, 'lớp ẩn (0×0)');
  assert.strictEqual(dock.overlayHitsPane([{ x: 800, y: 120, width: 10, height: 10 }], null), false);
  assert.ok(/ant-popover/.test(dock.OVERLAY_SELECTOR) && /ant-dropdown/.test(dock.OVERLAY_SELECTOR));
});

// ── 3. Chuyển hội thoại / Hỏi nhanh / Base ───────────────────────────────────────────────────
t('MỘT danh sách hội thoại: giữ cả kind workflow cũ, mới nhất lên đầu, khử trùng id, có origin', () => {
  const list = conv.unifySessions([
    { id: 'a', title: 'Hỏi đáp', updatedAt: '2026-10-08T10:00:00Z', bases: [{ appToken: 'X', name: 'Base X' }] },
    { id: 'w', title: 'Tạo workflow cũ', kind: 'workflow', updatedAt: '2026-10-09T09:00:00Z', bases: [{ appToken: 'T', name: 'Base Test' }] },
    { id: 'a', title: 'Hỏi đáp (mới hơn)', updatedAt: '2026-10-09T11:00:00Z' },
    null,
    { title: 'không id' },
  ]);
  assert.deepStrictEqual(list.map((s) => s.id), ['a', 'w']);
  assert.strictEqual(list[0].title, 'Hỏi đáp (mới hơn)');
  assert.strictEqual(list[1].origin, 'workflow');
  assert.strictEqual(list[0].origin, 'chat');
  assert.deepStrictEqual(list[1].bases, [{ appToken: 'T', name: 'Base Test' }], 'Base của hội thoại workflow cũ vẫn còn');
  assert.deepStrictEqual(conv.unifySessions(undefined), []);
});
t('"Hỏi nhanh của tôi": gộp danh sách workflow cũ vào danh sách chung (không mất, không trùng); đã gộp thì null', () => {
  const merged = JSON.parse(conv.migrateCustomAsks(JSON.stringify([{ label: 'A', prompt: '1' }]), JSON.stringify([{ label: 'A', prompt: '2' }, { label: ' B ', prompt: ' 3 ' }, { label: '', prompt: 'x' }])));
  assert.deepStrictEqual(merged, [{ label: 'A', prompt: '1' }, { label: 'B', prompt: '3' }]);
  assert.deepStrictEqual(JSON.parse(conv.migrateCustomAsks(null, JSON.stringify([{ label: 'C', prompt: '4' }]))), [{ label: 'C', prompt: '4' }]);
  assert.strictEqual(conv.migrateCustomAsks('[]', null), null);
  assert.deepStrictEqual(JSON.parse(conv.migrateCustomAsks('{bad', '[]')), []);
});
t('bộ chọn Base: TẤT CẢ Base (phiên web + custom app, gộp theo token), lọc không dấu, Base đang chọn lên đầu', () => {
  const opts = conv.mergeBaseOptions(
    [{ token: 'T', name: 'Base Test', url: 'https://x/base/T' }, { token: 'W', name: 'Wiki Base', isWiki: true }],
    [{ appToken: 'T', name: 'Base Test' }, { appToken: 'A', name: 'Đơn hàng' }],
  );
  assert.deepStrictEqual(opts.map((o) => [o.appToken, o.source]), [['T', 'both'], ['W', 'web'], ['A', 'app']]);
  assert.deepStrictEqual(conv.filterBaseOptions(opts, 'don hang', []).map((o) => o.appToken), ['A']);
  assert.deepStrictEqual(conv.filterBaseOptions(opts, '', ['A']).map((o) => o.appToken), ['A', 'T', 'W']);
  const one = conv.toggleBase([], { appToken: 'T', name: 'Base Test' });
  const two = conv.toggleBase(one, { appToken: 'A', name: 'Đơn hàng' });
  assert.deepStrictEqual(two.map((b) => b.appToken), ['T', 'A'], 'Base đầu = Base chính');
  assert.deepStrictEqual(conv.toggleBase(two, { appToken: 'T' }).map((b) => b.appToken), ['A']);
});

// ── 4. Bộ công cụ hợp nhất + chốt duyệt ──────────────────────────────────────────────────────
const tools = require(join(B, 'tools', 'index.js'));
const exec = require(join(B, 'larkToolExec.js'));
t('chưa có custom app: chỉ tool phiên web + tệp; có app: đủ cả Open API; ask cũ: bỏ mọi tool ghi', () => {
  const web = tools.agentTools({ withOpenApi: false }).map((x) => x.name);
  for (const n of ['lark_web_scan_base', 'lark_web_create_workflows', 'lark_web_create_automations', 'lark_web_add_fields', 'lark_ui_act', 'create_file']) assert.ok(web.includes(n), n);
  for (const n of web) assert.ok(!/^(bitable_create_record|messaging_send|calendar_)/.test(n), n + ' cần client — không bày khi chưa có app');
  const all = tools.agentTools({ withOpenApi: true }).map((x) => x.name);
  assert.ok(all.includes('bitable_create_record') && all.includes('lark_web_create_workflows'));
  assert.ok(tools.agentTools({ withOpenApi: true, mode: 'ask' }).every((x) => !x.gated));
});
t('chốt duyệt: tool CỘNG THÊM tự chạy khi Tự động BẬT; xoá/sửa/gửi tin luôn hỏi; Tự động TẮT → mọi ghi hỏi', () => {
  const on = { autoApproveTool: (n) => tools.isAdditiveTool(n) };
  const off = { autoApproveTool: () => false };
  for (const n of ['lark_web_create_workflows', 'lark_web_create_automations', 'lark_web_add_table', 'bitable_create_record', 'bitable_batch_create_records', 'bitable_create_field', 'bitable_workflow_create']) {
    const tl = tools.resolveTool(n);
    assert.ok(tl && tl.gated && tl.additive, n);
    assert.strictEqual(exec.needsConfirmation(tl, on), false, n + ' tự chạy');
    assert.strictEqual(exec.needsConfirmation(tl, off), true, n + ' hỏi khi tắt');
  }
  for (const n of ['bitable_delete_record', 'bitable_update_record', 'bitable_batch_delete_records', 'messaging_send_message', 'bitable_delete_field']) {
    const tl = tools.resolveTool(n);
    if (!tl) continue;
    assert.ok(!tl.additive, n);
    assert.strictEqual(exec.needsConfirmation(tl, { autoApproveTool: () => true }), true, n + ' luôn hỏi');
  }
});
t('lark_web_create_workflows: có gate, cộng thêm, không có tham số bật/status', () => {
  const tl = tools.resolveTool('lark_web_create_workflows');
  assert.ok(tl.gated && tl.additive);
  assert.ok(!('status' in tl.inputSchema.properties) && !('enable' in tl.inputSchema.properties));
  assert.ok(/MẶC ĐỊNH khi người dùng nói "workflow"/.test(tl.description));
});

// ── 5. KHỐI Workflow: payload + đọc lại ──────────────────────────────────────────────────────
const TABLE = {
  id: 'tblCUSTOMER0001',
  name: 'Khách hàng',
  fields: [
    { id: 'fldNAME00001', name: 'Tên khách hàng', type: 1, typeName: 'Văn bản', isPrimary: true },
    { id: 'fldOWNER0001', name: 'Người phụ trách', type: 11, typeName: 'Người' },
  ],
  views: [],
  samples: [],
};
const DESIGN = {
  title: 'Báo người phụ trách',
  steps: [
    { id: 'trigger_1', type: 'AddRecordTrigger', title: 'Khi thêm khách hàng', data: { table_name: 'Khách hàng' }, next: 'action_1' },
    {
      id: 'action_1',
      type: 'LarkMessageAction',
      title: 'Báo người phụ trách',
      data: {
        receiver: [{ value_type: 'ref', value: '$.trigger_1.fldOWNER0001' }],
        title: [{ value_type: 'text', value: 'Khách hàng mới' }],
        content: [{ value_type: 'text', value: 'Có khách hàng mới: ' }, { value_type: 'ref', value: '$.trigger_1.fldNAME00001' }],
        btn_list: [{ text: 'Xem bản ghi', btn_action: 'openLink', link: [{ value_type: 'ref', value: '$.trigger_1.recordLink' }] }],
      },
    },
  ],
};
t('bản nháp KHỐI = bước của automation (cùng bộ chuyển v3) + tabldFieldMap + extensionI18nMap, KHÔNG có title', () => {
  const c = wa.v3ToInternal(DESIGN, [TABLE], { id: '1', name: 'me' });
  assert.ok(c.ok, c.errors.join(' '));
  const blk = wb.toWorkflowBlockDraft(c.draft, c.extra, [TABLE]);
  assert.deepStrictEqual(Object.keys(blk.draft), ['steps', 'extensionI18nMap', 'tabldFieldMap']);
  assert.deepStrictEqual(blk.draft.tabldFieldMap, { tblCUSTOMER0001: { fldNAME00001: { type: 1 }, fldOWNER0001: { type: 11 } } });
  assert.deepStrictEqual(blk.draft.steps.map((s) => s.type), ['AddRecordTrigger', 'LarkMessageAction']);
  assert.strictEqual(blk.extra.TableMap.ref_tblCUSTOMER0001.TableID, 'tblCUSTOMER0001');
  // khớp hình bản Lark lưu (fixture đọc lại từ workflow/detail)
  const saved = JSON.parse(fx.detail.data.workflow.draft);
  assert.deepStrictEqual(Object.keys(saved), Object.keys(blk.draft));
});
t('body workflow/create: source "workflow_block", bizType "2", draft/extra là CHUỖI JSON, KHÔNG có status', () => {
  const b = wb.workflowCreateBody('BaseTokTEST', { draft: { steps: [] }, extra: { TableMap: {} }, triggerName: 'addRecord' });
  assert.deepStrictEqual(Object.keys(b).sort(), ['bizType', 'draft', 'extra', 'source', 'token', 'triggerName']);
  assert.strictEqual(b.source, 'workflow_block');
  assert.strictEqual(b.bizType, '2');
  assert.strictEqual(typeof b.draft, 'string');
  assert.ok(!('status' in b));
  assert.strictEqual(wb.workflowDetailPath('BaseTokTEST', '76'), '/space/api/bitable/BaseTokTEST/workflow/detail?workflowID=76&bizType=2');
});
t('phản hồi create: lấy workflowID; mã ≠ 0 / thiếu id → lỗi đọc được', () => {
  assert.deepStrictEqual(wb.parseCreateResponse(fx.createResponse), { ok: true, workflowID: '7600000000000000001' });
  assert.strictEqual(wb.parseCreateResponse({ code: 800004006, msg: 'flow schema is invalid' }).ok, false);
  assert.ok(/800004006/.test(wb.parseCreateResponse({ code: 800004006, msg: 'x' }).error));
  assert.strictEqual(wb.parseCreateResponse({ code: 0, data: {} }).ok, false);
  assert.strictEqual(wb.parseCreateResponse(null).ok, false);
});
t('script trong trang: addBlock type "WORKFLOW" với token = workflowID; xoá chỉ khi đúng khối của mình', () => {
  const add = wb.addWorkflowBlockScript({ token: 'BaseTokTEST', workflowID: '7600000000000000001', name: 'X' });
  assert.ok(add.includes('baseOperate.addBlock') && add.includes('"WORKFLOW"') && add.includes('7600000000000000001'));
  assert.ok(!/enable|status/.test(add));
  const del = wb.deleteWorkflowBlockScript({ token: 'T', blockId: 'wkf1', workflowID: '9' });
  assert.ok(del.includes('not-our-block') && del.includes('getToken()) !== OP.workflowID'));
});
t('đọc lại: khối ở thanh bên + đúng bước + ĐANG TẮT = ok; thiếu khối / lệch bước / đang bật = không ok', () => {
  const meta = api.parseBaseMeta(fx.baseAfter);
  const detail = fx.detail.data.workflow;
  const steps = JSON.parse(detail.draft).steps;
  const v = wb.verifyWorkflowBlock(meta, detail, { workflowID: '7600000000000000001', steps, name: 'Larkwave test — báo người phụ trách' });
  assert.deepStrictEqual(v, { ok: true, blockId: 'wkfTESTBLOCK00001', enabled: false, problems: [] });
  assert.strictEqual(wb.verifyWorkflowBlock({ workflowBlocks: [] }, detail, { workflowID: '7600000000000000001', steps }).ok, false);
  assert.strictEqual(wb.verifyWorkflowBlock(meta, { ...detail, status: 1 }, { workflowID: '7600000000000000001', steps }).enabled, true);
  assert.strictEqual(wb.verifyWorkflowBlock(meta, { ...detail, draft: '{"steps":[]}' }, { workflowID: '7600000000000000001', steps }).ok, false);
  assert.strictEqual(wb.workflowBlockUrl('https://t.sg.larksuite.com/', 'BaseTokTEST', 'wkf1'), 'https://t.sg.larksuite.com/base/BaseTokTEST?table=wkf1');
});

// ── 6. Prompt hợp nhất ───────────────────────────────────────────────────────────────────────
t('prompt: "workflow" = KHỐI (lark_web_create_workflows), "automation" chỉ khi nói rõ; nhiều Base; không app = đứng một mình', () => {
  const sp = require(join(B, 'systemPrompt.js'));
  const p = sp.buildAgentSystemPrompt({ bases: [{ appToken: 'T1', name: 'Base Test' }, { appToken: 'T2', name: 'B2' }], auto: true, layout: 'frame' });
  assert.ok(/QUY ƯỚC TÊN GỌI/.test(p) && p.includes('lark_web_create_workflows'));
  assert.ok(p.indexOf('lark_web_create_workflows') < p.indexOf('lark_web_create_automations'));
  assert.ok(p.includes('T1') && p.includes('T2') && /BASE CỦA HỘI THOẠI \(2\)/.test(p));
  assert.ok(/KHÔNG được tìm cách BẬT/.test(p));
  assert.ok(!p.includes('bitable_create_record'), 'chưa có app: không nhắc tool Open API ghi bản ghi');
  const withApp = sp.buildAgentSystemPrompt({ bases: [{ appToken: 'T1', name: 'Base Test' }], openApi: { bases: [], tenantName: 'X' } });
  assert.ok(withApp.includes('bitable_base_overview') && withApp.includes('=== PHIÊN LARK WEB'));
  assert.ok(/khung Lark \(nút "Mở khung Lark"/.test(sp.buildWebSessionPrompt({ layout: 'chat' })));
  assert.deepStrictEqual(sp.mergeTurnBases([{ appToken: 'A', name: 'a' }], { appToken: 'A', name: 'a' }).length, 1);
  assert.deepStrictEqual(sp.mergeTurnBases(undefined, { appToken: 'B', name: 'b' }).map((b) => b.appToken), ['B']);
});
t('larkService: mọi lượt Lark không đòi custom app; bộ công cụ = agentTools; Tự động chỉ duyệt tool cộng thêm', () => {
  const src = readFileSync(join(__dirname, '..', 'main', 'runtime', 'lark', 'larkService.ts'), 'utf8');
  assert.ok(/const workflowTurn = !general;/.test(src));
  assert.ok(!/Chưa kết nối Lark\. Hãy nhập App ID \+ App Secret ở panel kết nối\.' \};\n      yield \{ type: 'done' \};\n      return;\n    \}\n    \/\/ Khoá theo TỪNG/.test(src));
  assert.ok((src.match(/toolsOverride: agentTools\(\{ withOpenApi: !!client, mode: input\.mode \}\), autoApproveTool/g) || []).length >= 2);
  assert.ok(/const autoApproveTool = workflowTurn \? \(name: string\) => this\.workflowAutoOn\(\) && isAdditiveTool\(name\)/.test(src));
  assert.ok(/onApi = !!\(apiMode && apiKey && !general && client/.test(src), 'đường API chỉ khi có client');
});

// ── Một màn Lark × Agents + mục Lark Bot (App ID) ────────────────────────────────────────────
t('cách xếp: mặc định hội thoại-trước; đổi sang khung-trước rồi về (×) → ngăn khung đóng; nút ưu tiên hội thoại → khung về ngăn phụ', () => {
  assert.strictEqual(lay.DEFAULT_PREFS.mode, 'chat');
  assert.strictEqual(lay.parseLayoutPrefs('{"mode":"frame"}').mode, 'frame');
  assert.strictEqual(lay.parseLayoutPrefs('{"mode":"lạ"}').mode, 'chat');
  const f = lay.switchMode({ ...lay.DEFAULT_PREFS, dock: 'rail' }, 'frame');
  assert.deepStrictEqual([f.mode, f.dock], ['frame', 'collapsed']);
  assert.deepStrictEqual([lay.switchMode(f, 'chat', 'closeFrame').mode, lay.switchMode(f, 'chat', 'closeFrame').sidePaneOpen], ['chat', false]);
  assert.strictEqual(lay.switchMode(f, 'chat', 'toggle').sidePaneOpen, true);
  assert.strictEqual(lay.parseLayoutPrefs(lay.serializeLayoutPrefs(f)).mode, 'frame', 'nhớ cách xếp');
  assert.strictEqual(lay.ACTIVE_CONV_KEY, 'larkwave.wf.activeConv', 'một khoá hội thoại cho cả hai cách xếp');
});
t('thanh bên: không còn mục "Tạo workflow"; có "Lark Bot (App ID)"; liên kết cũ tw-lark-wf vẫn mở Lark × Agents (khung-trước)', () => {
  const UIC = join(__dirname, '..', '..', '..', 'packages', 'ui', 'src', 'components');
  const shell = readFileSync(join(UIC, 'AppShell.tsx'), 'utf8');
  const home = readFileSync(join(UIC, 'HomeScreen.tsx'), 'utf8');
  assert.ok(!/key: 'tw-lark-wf'/.test(shell), 'không còn mục Tạo workflow');
  assert.ok(/key: 'tw-lark-bot', label: 'Lark Bot \(App ID\)'/.test(shell));
  assert.ok(/'tw-lark-wf': 'lark-wf'/.test(home) && /'lark-wf': 'tw-lark'/.test(home), 'liên kết cũ → chọn mục Lark × Agents');
  assert.ok(/view === 'lark-bot' && <LarkBotScreen/.test(home));
  const bot = readFileSync(join(UIC, 'lark', 'LarkBotScreen.tsx'), 'utf8');
  for (const p of ['LarkConnectPanel', 'BotPanel', 'PluginsPanel', 'BasesPanel']) assert.ok(bot.includes(`<${p}`), p);
  assert.ok(!/<LarkChat\b|<LarkChatShell\b/.test(bot), 'Lark Bot không có ô chat riêng — dùng chung agent');
  const screen = readFileSync(join(UIC, 'LarkScreen.tsx'), 'utf8');
  assert.ok(/switchMode\(p, 'frame'\)/.test(screen) && /onToChat=/.test(screen));
});

console.log(`  larkMerge: ${pass} kiểm qua`);
