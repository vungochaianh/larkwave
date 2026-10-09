/**
 * Bộ điều khiển giao diện Lark qua CDP (larkCdp + larkUiCore): các CHỐT AN TOÀN và các phần thuần.
 *
 * Mấy chốt này là thứ duy nhất đứng giữa một agent và tài khoản Lark THẬT của người dùng: bấm nhầm
 * "Bật" là automation chạy thật (gửi tin, sửa bản ghi), bấm nhầm "Xác nhận" trong hộp thoại xoá là
 * mất workflow. Nên phải kiểm bằng mã, không tin vào lời dặn trong prompt.
 *
 *   bash apps/desktop/test/run.sh
 */
const assert = require('node:assert');
const core = require('../.test-build/runtime/lark/larkUiCore.js');
const { LarkCdpDriver } = require('../.test-build/runtime/lark/larkCdp.js');
const { classifySensitive, isLarkHost, ActionBudget, compactAxTree, dragSequence, keyInfo, summarizeSave } = core;

// ── 1. SENSITIVE_UI — VI / EN / ZH ─────────────────────────────────────────────────────────────
const MUST_BLOCK = [
  ['Bật', 'button'], ['Bật automation', 'button'], ['Kích hoạt', 'button'], ['Xuất bản', 'button'],
  ['Xoá', 'menuitem'], ['Xóa quy trình', 'menuitem'], ['XOÁ', 'button'], ['Chạy thử', 'button'], ['Lưu và bật', 'button'],
  ['Enable', 'button'], ['Turn on', 'button'], ['Activate', 'button'], ['Publish', 'button'], ['Delete workflow', 'menuitem'],
  ['Remove', 'button'], ['Test run', 'button'], ['Run now', 'button'],
  ['启用', 'button'], ['开启', 'button'], ['发布', 'button'], ['删除', 'menuitem'], ['测试运行', 'button'], ['立即运行', 'button'],
];
for (const [name, role] of MUST_BLOCK) {
  const v = classifySensitive({ name, role, action: 'click' });
  assert.strictEqual(v.blocked, true, `phải chặn bấm "${name}"`);
}
// Nhấn Enter / Space trên nút nhạy cảm cũng là bấm.
assert.strictEqual(classifySensitive({ name: 'Bật', role: 'button', action: 'press', key: 'Enter' }).blocked, true, 'Enter trên "Bật" phải bị chặn');
assert.strictEqual(classifySensitive({ name: 'Bật', role: 'button', action: 'press', key: ' ' }).blocked, true, 'Space trên "Bật" phải bị chặn');
// Công tắc bật/tắt automation thường KHÔNG có tên → chặn theo vai trò.
assert.strictEqual(classifySensitive({ name: '', role: 'switch', action: 'click' }).blocked, true, 'switch không tên phải bị chặn');
console.log(`✓ chặn ${MUST_BLOCK.length} nhãn nhạy cảm VI/EN/ZH + Enter/Space + công tắc không tên`);

const MUST_ALLOW = [
  ['Lưu', 'button'], ['Save', 'button'], ['保存', 'button'], ['Thêm hành động', 'button'], ['Add action', 'button'],
  ['Tạo tự động hoá', 'button'], ['Chọn bảng', 'combobox'], ['Khi bản ghi được thêm', 'text'], ['新建', 'button'],
  ['Gửi tin nhắn', 'option'], ['Xác nhận', 'button'], ['OK', 'button'], ['Tắt thông báo', 'button'],
];
for (const [name, role] of MUST_ALLOW) {
  assert.strictEqual(classifySensitive({ name, role, action: 'click' }).blocked, false, `không được chặn "${name}" (dựng bản nháp cần nó)`);
}
// Gõ chữ vào ô tên "Xoá…" không phải kích hoạt.
assert.strictEqual(classifySensitive({ name: 'Xoá', role: 'textbox', action: 'fill' }).blocked, false, 'fill không kích hoạt nút');
console.log(`✓ không chặn ${MUST_ALLOW.length} nhãn dựng-nháp thường gặp`);

// "OK/Xác nhận/确定" chỉ nguy hiểm trong hộp thoại xoá/bật.
for (const [name, ctx] of [
  ['Xác nhận', 'Xoá automation này? Thao tác không thể hoàn tác.'],
  ['OK', 'Delete this workflow? This cannot be undone.'],
  ['确定', '确定删除该工作流吗？删除后无法恢复'],
  ['Đồng ý', 'Bật tự động hoá cho bảng Đơn hàng?'],
]) {
  const v = classifySensitive({ name, role: 'button', context: ctx, action: 'click' });
  assert.deepStrictEqual(v, { blocked: true, reason: 'destructive-confirm' }, `"${name}" trong hộp thoại xoá/bật phải bị chặn`);
}
assert.strictEqual(classifySensitive({ name: 'Xác nhận', role: 'button', context: 'Chọn cột cần cập nhật', action: 'click' }).blocked, false, '"Xác nhận" trong hộp chọn cột thì cho');
assert.strictEqual(classifySensitive({ name: '', role: 'button', context: 'Delete this automation?', action: 'click' }).blocked, true, 'nút không tên trong hộp thoại xoá → chặn (fail-closed)');
console.log('✓ "OK/Xác nhận/确定" chỉ bị chặn khi hộp thoại nói về xoá/bật (+ nút không tên trong hộp đó)');

// ── 2. Chỉ Lark ────────────────────────────────────────────────────────────────────────────────
for (const u of ['https://abc.sg.larksuite.com/base/xyz', 'https://www.larksuite.com/', 'https://x.feishu.cn/base/1', 'https://open.feishu.com', 'https://a.larkoffice.com/wiki/1'])
  assert.strictEqual(isLarkHost(u), true, `phải nhận ${u}`);
for (const u of ['https://larksuite.com.evil.io/base', 'https://evil-larksuite.com/', 'https://evil.com/?u=larksuite.com', 'javascript:alert(1)', 'file:///etc/passwd', '', 'larksuite.com'])
  assert.strictEqual(isLarkHost(u), false, `phải từ chối ${u}`);
console.log('✓ chốt chỉ-Lark: nhận đúng tên miền Lark/Feishu, từ chối tên miền giả + scheme lạ');

// ── 3. Ngân sách thao tác ──────────────────────────────────────────────────────────────────────
const b = new ActionBudget(3);
assert.ok(b.take() && b.take() && b.take(), '3 lượt đầu được');
assert.strictEqual(b.take(), false, 'lượt thứ 4 bị từ chối');
assert.strictEqual(b.count, 3);
b.reset();
assert.strictEqual(b.left, 3);
console.log('✓ ActionBudget: đủ trần thì từ chối, reset khi mở lượt mới');

// ── 4. Rút gọn cây AX (fixture giống trình sửa Tự động hoá của Lark) ─────────────────────────
const N = (nodeId, role, name, childIds, extra = {}) => ({ nodeId: String(nodeId), role: { value: role }, name: { value: name }, childIds: (childIds || []).map(String), ...extra });
const FIX = [
  N(1, 'RootWebArea', 'Base · Đơn hàng', [2, 30], { backendDOMNodeId: 1 }),
  N(2, 'generic', '', [3, 10, 20], { backendDOMNodeId: 2 }),
  N(3, 'heading', 'Tự động hoá', [4], { backendDOMNodeId: 3 }),
  N(4, 'StaticText', 'Tự động hoá', [5], { backendDOMNodeId: 4 }),
  N(5, 'InlineTextBox', 'Tự động hoá', [], { backendDOMNodeId: 5 }),
  N(10, 'dialog', 'Thêm hành động', [11, 12, 13, 14, 15], { backendDOMNodeId: 10 }),
  N(11, 'button', 'Gửi tin nhắn', [16], { backendDOMNodeId: 111 }),
  N(16, 'StaticText', 'Gửi tin nhắn', [], { backendDOMNodeId: 116 }),
  N(12, 'button', '', [17], { backendDOMNodeId: 112 }),
  N(17, 'StaticText', 'Cập nhật bản ghi', [], { backendDOMNodeId: 117 }),
  N(13, 'textbox', 'Tên', [], { backendDOMNodeId: 113, value: { value: 'Báo đơn mới' }, properties: [{ name: 'focused', value: { value: true } }] }),
  N(14, 'switch', '', [], { backendDOMNodeId: 114, properties: [{ name: 'checked', value: { value: false } }] }),
  N(15, 'generic', '', [18], { backendDOMNodeId: 115, ignored: true }),
  N(18, 'StaticText', 'Khi bản ghi được thêm', [], { backendDOMNodeId: 118 }),
  N(20, 'generic', 'Thêm bước', [], { backendDOMNodeId: 120, properties: [{ name: 'focusable', value: { value: true } }] }),
  N(30, 'button', 'Bật', [], { backendDOMNodeId: 130, properties: [{ name: 'disabled', value: { value: true } }] }),
];
let nextRef = 1;
const refMap = new Map();
const refFor = (m) => {
  if (!refMap.has(m.backendId)) refMap.set(m.backendId, nextRef++);
  return refMap.get(m.backendId);
};
const out = compactAxTree(FIX, { refFor, maxLines: 50 });
const text = out.lines.join('\n');
assert.ok(/^- heading "Tự động hoá"$/m.test(text), 'heading in ra không ref:\n' + text);
assert.ok(!/text "Tự động hoá"/.test(text), 'chữ trùng tên heading phải bị gộp');
assert.ok(!/InlineTextBox/.test(text), 'InlineTextBox bị bỏ');
assert.ok(/^- dialog "Thêm hành động"$/m.test(text), 'dialog là dòng nhóm');
assert.ok(/^ {2}- button "Gửi tin nhắn" \[ref=\d+\]$/m.test(text), 'nút trong dialog thụt vào + có ref');
assert.ok(/- button "Cập nhật bản ghi" \[ref=\d+\]/.test(text), 'nút không tên lấy tên từ chữ con');
assert.ok(/- textbox "Tên" value="Báo đơn mới" \[focused\]/.test(text), 'textbox kèm value + focused');
assert.ok(/- switch "" \[expanded=|- switch ""/.test(text), 'switch vẫn được liệt kê (để agent biết mà KHÔNG bấm)');
assert.ok(/- text "Khi bản ghi được thêm" \[ref=\d+\]/.test(text), 'chữ dưới node bị ignored vẫn hiện (promote) + bấm được');
assert.ok(/- generic "Thêm bước" \[ref=\d+\]/.test(text), 'div focusable có tên = bấm được');
assert.ok(/- button "Bật" \[disabled\] \[ref=\d+\]/.test(text), 'trạng thái disabled');
const sendItem = out.items.find((i) => i.name === 'Gửi tin nhắn');
assert.strictEqual(sendItem.backendId, 111);
assert.ok(/Thêm hành động/.test(sendItem.context), 'context = chữ của dialog bao quanh');
// ref ổn định giữa 2 lần chụp
const out2 = compactAxTree(FIX, { refFor, maxLines: 50 });
assert.strictEqual(out2.items.find((i) => i.name === 'Gửi tin nhắn').ref, sendItem.ref, 'ref ổn định giữa các snapshot');
const small = compactAxTree(FIX, { refFor, maxLines: 3 });
assert.strictEqual(small.lines.length, 3);
assert.strictEqual(small.truncated, true, 'vượt trần dòng → truncated');
console.log('✓ compactAxTree: gộp generic/ignored, bỏ chữ trùng, ref cho nút + chữ bấm được, trạng thái, ref ổn định, có trần');

// ── 5. Chuỗi kéo-thả ──────────────────────────────────────────────────────────────────────────
const seq = dragSequence({ x: 100, y: 200 }, { x: 400, y: 260 }, { steps: 5 });
assert.deepStrictEqual(seq.map((e) => e.type), ['mouseMoved', 'mousePressed', 'mouseMoved', 'mouseMoved', 'mouseMoved', 'mouseMoved', 'mouseMoved', 'mouseMoved', 'mouseMoved', 'mouseReleased']);
assert.deepStrictEqual([seq[1].x, seq[1].y, seq[1].buttons, seq[1].button], [100, 200, 1, 'left'], 'nhấn ở điểm đầu');
assert.ok(seq.slice(2, -1).every((e) => e.buttons === 1), 'giữ chuột suốt quãng di');
assert.ok(Math.abs(seq[2].x - 100) >= 3, 'có cú nhích vượt ngưỡng kéo');
const last = seq[seq.length - 1];
assert.deepStrictEqual([last.x, last.y, last.buttons], [400, 260, 0], 'thả ở đích');
assert.deepStrictEqual([seq[seq.length - 2].x, seq[seq.length - 2].y], [400, 260], 'di LÊN đích trước khi thả');
const xs = seq.slice(3, -2).map((e) => e.x);
assert.ok(xs.every((x, i) => i === 0 || x >= xs[i - 1]), 'di đơn điệu về phía đích');
assert.strictEqual(dragSequence({ x: 0, y: 0 }, { x: 1, y: 1 }, { steps: 999 }).length, 60 + 5, 'steps bị kẹp ≤ 60');
console.log('✓ dragSequence: nhấn → nhích → di nhiều bước → lên đích → thả');

assert.deepStrictEqual(keyInfo('Enter'), { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
assert.strictEqual(keyInfo('a').code, 'KeyA');

// ── 6. Driver đầu-cuối với debugger giả ──────────────────────────────────────────────────────
function fakeWc(url) {
  const calls = [];
  const listeners = { message: [], detach: [] };
  const st = { url, cover: null, title: 'Base', axNodes: FIX };
  const dbg = {
    attached: false,
    attach() { this.attached = true; },
    isAttached() { return this.attached; },
    detach() { this.attached = false; },
    on(ev, cb) { listeners[ev].push(cb); },
    async sendCommand(method, params = {}, sessionId) {
      calls.push({ method, params, sessionId });
      switch (method) {
        case 'Page.getFrameTree': return { frameTree: { frame: { id: 'F0' } } };
        case 'Accessibility.getFullAXTree': return { nodes: st.axNodes };
        case 'Runtime.evaluate':
          if (/document\.title/.test(params.expression)) return { result: { value: st.title } };
          if (/getElementsByTagName/.test(params.expression)) return { result: { value: calls.length } };
          return { result: { value: false } };
        case 'DOM.getDocument': return { root: { backendNodeId: 1 } };
        case 'DOM.getContentQuads': {
          const id = params.backendNodeId;
          const x = (id % 100) * 10, y = 100;
          return { quads: [[x, y, x + 40, y, x + 40, y + 20, x, y + 20]] };
        }
        case 'DOM.getNodeForLocation': return { backendNodeId: st.cover || Math.round((params.x - 20) / 10) + 100 };
        case 'DOM.resolveNode': return { object: { objectId: 'o' + params.backendNodeId } };
        case 'Runtime.callFunctionOn':
          if (/elementFromPoint/.test(params.functionDeclaration)) {
            st.lastHit = params.arguments.map((x) => x.value);
            return { result: { value: st.cover ? { rel: false, name: 'Hộp thoại khác' } : { rel: true } } };
          }
          return { result: { value: 'input' } };
        case 'Network.getResponseBody': return { body: JSON.stringify({ code: 0, msg: 'success', data: { workflowID: '7420000000000000001' } }), base64Encoded: false };
        default: return {};
      }
    },
  };
  const wc = { debugger: dbg, getURL: () => st.url, isDestroyed: () => false };
  const emit = (method, params, sessionId) => listeners.message.forEach((cb) => cb({}, method, params, sessionId));
  return { wc, calls, st, emit };
}

(async () => {
  // 6a. host guard: không phải Lark → không chụp, không bấm
  {
    const f = fakeWc('https://evil.example.com/');
    const d = new LarkCdpDriver();
    d.bind(f.wc);
    assert.strictEqual(await d.ensure(), true);
    const r = await d.snapshot();
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error, 'not-on-lark');
    console.log('✓ driver: trang ngoài Lark → từ chối snapshot');
  }

  const f = fakeWc('https://abc.sg.larksuite.com/base/bascnXXXX');
  const d = new LarkCdpDriver();
  d.bind(f.wc);
  assert.strictEqual(await d.ensure(), true, 'gắn debugger (không cổng remote-debugging)');
  assert.strictEqual(f.calls.filter((c) => c.method === 'Target.setAutoAttach' && c.params.flatten === true).length, 1, 'tự gắn vào iframe khác origin (flatten)');
  assert.ok(d.startRun());
  const snap = await d.snapshot();
  assert.strictEqual(snap.ok, true);
  assert.strictEqual(snap.driver, 'cdp');
  const refOf = (name) => Number(new RegExp(`"${name}"[^\\n]*\\[ref=(\\d+)\\]`).exec(snap.text)[1]);

  // 6b. bấm thật: chuột move → press → release đúng tâm phần tử
  f.calls.length = 0;
  const r1 = await d.act({ ref: refOf('Gửi tin nhắn'), action: 'click' });
  assert.strictEqual(r1.ok, true, JSON.stringify(r1));
  const mouse = f.calls.filter((c) => c.method === 'Input.dispatchMouseEvent').map((c) => c.params);
  assert.deepStrictEqual(mouse.map((m) => m.type), ['mouseMoved', 'mousePressed', 'mouseReleased']);
  assert.deepStrictEqual([mouse[1].x, mouse[1].y], [130, 110], 'bấm vào TÂM hộp của phần tử (backend 111)');
  assert.deepStrictEqual(f.st.lastHit, [130, 110], 'kiểm điểm bấm (elementFromPoint) đúng toạ độ đó TRƯỚC khi nhấn');
  console.log('✓ driver: click = Input.dispatchMouseEvent thật (move/press/release) vào tâm phần tử');

  // 6c. nhãn nhạy cảm bị chặn TRƯỚC khi chạm chuột, không tốn ngân sách
  f.calls.length = 0;
  const before = d.budget.count;
  const r2 = await d.act({ ref: refOf('Bật'), action: 'click' });
  assert.strictEqual(r2.error, 'requires-confirm');
  assert.strictEqual(f.calls.filter((c) => c.method.startsWith('Input.')).length, 0, 'không có sự kiện chuột nào');
  assert.strictEqual(d.budget.count, before, 'bị chặn thì không trừ ngân sách');
  const r2b = await d.act({ ref: refOf('Bật'), action: 'click', force: true });
  assert.strictEqual(r2b.error, 'requires-confirm', '`force` từ agent KHÔNG có tác dụng');
  console.log('✓ driver: "Bật" bị chặn trước khi chạm chuột; force bị bỏ qua');

  // 6d. bị che (hộp thoại khác nằm trên) → fail-closed, không bấm
  f.st.cover = 999;
  f.calls.length = 0;
  const r3 = await d.act({ ref: refOf('Gửi tin nhắn'), action: 'click' });
  assert.strictEqual(r3.error, 'obscured');
  assert.strictEqual(f.calls.filter((c) => c.method === 'Input.dispatchMouseEvent' && c.params.type === 'mousePressed').length, 0, 'không nhấn chuột khi bị che');
  f.st.cover = null;
  console.log('✓ driver: điểm bấm bị lớp khác che → từ chối (fail-closed)');

  // 6e. ref không có → stale-ref
  assert.strictEqual((await d.act({ ref: 99999, action: 'click' })).error, 'stale-ref');

  // 6f. kéo thả thật
  f.calls.length = 0;
  const rd = await d.drag({ from_ref: refOf('Gửi tin nhắn'), to_ref: refOf('Thêm bước'), steps: 4 });
  assert.strictEqual(rd.ok, true, JSON.stringify(rd));
  const dm = f.calls.filter((c) => c.method === 'Input.dispatchMouseEvent').map((c) => c.params);
  assert.strictEqual(dm[1].type, 'mousePressed');
  assert.strictEqual(dm[dm.length - 1].type, 'mouseReleased');
  assert.deepStrictEqual([dm[dm.length - 1].x, dm[dm.length - 1].y], [220, 110], 'thả ở tâm "Thêm bước" (backend 120)');
  assert.ok(dm.filter((m) => m.type === 'mouseMoved' && m.buttons === 1).length >= 4, 'có nhiều bước di khi giữ chuột');
  console.log('✓ driver: lark_ui_drag phát đúng chuỗi nhấn → di → thả giữa hai phần tử');

  // 6g. sự thật từ mạng: Lark lưu automation → saves + mẫu
  const draft = JSON.stringify({ title: 'Báo đơn mới', steps: [{ id: 's1', type: 'AddRecordTrigger', data: { tableId: 'ref_tblAbcDEF123' } }] });
  f.emit('Network.requestWillBeSent', { requestId: 'r1', type: 'XHR', request: { url: 'https://abc.sg.larksuite.com/space/api/bitable/automation/update', method: 'POST', postData: JSON.stringify({ token: 'bascnXXXX', workflowID: '7420000000000000001', status: 0, draft, extra: '{}' }) } }, '');
  f.emit('Network.loadingFinished', { requestId: 'r1' }, '');
  await new Promise((r) => setTimeout(r, 20));
  const stt = d.status();
  assert.strictEqual(stt.saves.length, 1);
  assert.deepStrictEqual([stt.saves[0].ok, stt.saves[0].workflowID, stt.saves[0].status, stt.saves[0].op], [true, '7420000000000000001', 0, 'update']);
  assert.ok(d.lastValidSave() && d.lastValidSave().endpoint === '/space/api/bitable/automation/update', 'lần lưu hợp lệ thành nguồn mẫu');
  assert.ok(d.networkIdleFor(0), 'không còn request → mạng yên');
  console.log('✓ driver: bắt lần LƯU của Lark (workflowID + code + status) qua Network domain');

  // 6h. trần thao tác
  d.budget.reset();
  assert.strictEqual(d.budget.cap, 200, 'trần thao tác mỗi lượt = 200 (vẫn có trần)');
  for (let i = 0; i < 200; i++) assert.ok(d.budget.take());
  assert.strictEqual((await d.act({ ref: refOf('Gửi tin nhắn'), action: 'click' })).error, 'budget-exhausted');
  console.log('✓ driver: quá 200 thao tác/lượt → budget-exhausted');

  // 6i. Dừng
  d.stop();
  assert.strictEqual((await d.snapshot()).error, 'stopped-by-user');
  assert.strictEqual((await d.act({ ref: refOf('Gửi tin nhắn'), action: 'click' })).error, 'stopped-by-user');
  assert.strictEqual((await d.wait({ ms: 50 })).error, 'stopped-by-user');
  assert.strictEqual(d.startRun(), false, 'cùng lượt không tự mở lại được ngay sau khi bị dừng');
  d.resume();
  assert.strictEqual(d.startRun(), true, 'người dùng cho tiếp tục → mở lại được');
  console.log('✓ driver: Dừng chặn snapshot/act/wait + không cho mở lại ngay');

  // 6j. dừng GIỮA lúc kéo → nhả chuột ở điểm đầu, không thả vào đích
  await d.snapshot();
  f.calls.length = 0;
  let n = 0;
  const orig = f.wc.debugger.sendCommand.bind(f.wc.debugger);
  f.wc.debugger.sendCommand = async (m, p, s) => {
    if (m === 'Input.dispatchMouseEvent' && ++n === 4) d.stop();
    return orig(m, p, s);
  };
  const rs = await d.drag({ from_ref: refOf('Gửi tin nhắn'), to_ref: refOf('Thêm bước') });
  assert.strictEqual(rs.error, 'stopped-by-user');
  const ms = f.calls.filter((c) => c.method === 'Input.dispatchMouseEvent').map((c) => c.params);
  const rel = ms[ms.length - 1];
  assert.deepStrictEqual([rel.type, rel.x, rel.y], ['mouseReleased', 130, 110], 'nhả ở điểm ĐẦU khi bị dừng');
  console.log('✓ driver: Dừng giữa lúc kéo → quay về điểm đầu rồi nhả (không bao giờ giữ chuột)');

  // summarizeSave dạng form-encoded + lỗi Lark
  const s2 = summarizeSave('https://x.larksuite.com/space/api/bitable/bascn1/workflow/create', 'POST', 'draft=%7B%7D&token=bascn1', JSON.stringify({ code: 800004006, msg: 'flow schema is invalid' }));
  assert.deepStrictEqual([s2.ok, s2.code, s2.op, s2.baseId], [false, 800004006, 'create', 'bascn1']);
  console.log('✓ summarizeSave: đọc body form-encoded + báo đúng mã lỗi Lark');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
