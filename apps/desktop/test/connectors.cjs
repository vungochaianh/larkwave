/**
 * Kết nối Zalo / Gmail cho kỹ năng (17/10/2026). Người dùng muốn: "agent không được thao tác, chỉ cấu
 * thành skills — giống fbinbox_workspace". Các bài dưới giữ đúng ba chốt:
 *   1. chỉ lượt của CHÍNH CHỦ MÁY (hội thoại của chủ máy, hoặc lịch chủ máy tạo từ đó; bot Lark do người
 *      lạ nhắn, lượt chia sẻ: bị từ chối);
 *   2. chỉ công cụ mà một KỸ NĂNG đã nạp nhắc ĐÚNG TÊN (kỹ năng đọc không mở được lệnh gửi);
 *   3. gửi là thao tác ghi như mọi thao tác khác — Tự động bật thì chạy luôn, không trần số tin, chỉ cảnh
 *      báo (người dùng đổi ý 17/10/2026: "muốn gửi thế nào thì gửi, cảnh báo tài khoản Zalo là được").
 *
 *   bash apps/desktop/test/run.sh
 */
const assert = require('node:assert');
const Module = require('node:module');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const orig = Module._load;
Module._load = function (req) {
  if (req === 'electron') return { app: { getPath: () => tmpdir(), isPackaged: false, getVersion: () => '0.0.0', on() {} }, safeStorage: { isEncryptionAvailable: () => false }, session: { fromPartition: () => ({}) }, BrowserWindow: function () {}, shell: {}, net: {}, ipcMain: { handle() {}, on() {} }, Notification: { isSupported: () => false } };
  return orig.apply(this, arguments);
};

const B = join(__dirname, '..', '.test-build', 'runtime');
const C = require(join(B, 'lark', 'tools', 'connectors.js'));
const T = require(join(B, 'lark', 'tools', 'index.js'));
const FC = require(join(B, 'lark', 'fileContext.js'));
const EX = require(join(B, 'lark', 'larkToolExec.js'));
const UP = require(join(B, 'lark', 'unattendedPolicy.js'));
const { BUILTIN_SKILLS } = require(join(B, 'skills', 'builtinSkills.js'));
const { ZaloMessageBook, fold, MAX_PER_THREAD } = require(join(B, 'connectors', 'zalo', 'messages.js'));
const G = require(join(B, 'connectors', 'gmail', 'gmailService.js'));
const P = require(join(B, 'connectors', 'sendPace.js'));

let failed = 0;
const pending = [];
const test = (name, fn) => {
  pending.push(
    Promise.resolve()
      .then(fn)
      .then(
        () => console.log(`✓ ${name}`),
        (e) => {
          failed++;
          console.error(`✗ ${name}\n  ${e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n  ') : e}`);
        },
      ),
  );
};
const msg = (o) => ({ threadId: 't1', isGroup: false, msgId: 'm1', fromId: 'u2', fromName: 'Lan Ánh', isSelf: false, text: 'chào', ts: 1000, ...o });

// ── 1. Sổ tin Zalo ──────────────────────────────────────────────────────────────────────────────
test('sổ tin: bỏ trùng theo msgId, xếp cũ → mới, tên người bên kia lấy từ tin của họ', () => {
  const b = new ZaloMessageBook();
  b.add('a', [msg({ msgId: 'm2', ts: 2000, text: 'lần 2' }), msg({ msgId: 'm1', ts: 1000 }), msg({ msgId: 'm1', ts: 1000 })]);
  b.add('a', [msg({ msgId: 'm3', ts: 3000, isSelf: true, fromName: 'Tôi', text: 'ok' })]);
  const r = b.read('a', 't1');
  assert.deepStrictEqual(r.map((m) => m.msgId), ['m1', 'm2', 'm3']);
  const [th] = b.recent('a');
  assert.strictEqual(th.title, 'Lan Ánh', 'không lấy tên của chính mình làm tên hội thoại');
  assert.strictEqual(th.lastFromSelf, true);
  assert.strictEqual(th.count, 3);
});

test('sổ tin: tìm không dấu, mới nhất trước, nhóm lấy tên từ danh sách nhóm, giới hạn tin mỗi hội thoại', () => {
  const b = new ZaloMessageBook();
  b.add('a', [msg({ threadId: 'g1', isGroup: true, msgId: 'x', ts: 5000, text: 'họp lúc 9h', fromName: 'An' }), msg({ threadId: 't9', msgId: 'y', ts: 4000, fromName: 'Bình' })]);
  b.setGroupNames('a', [{ groupId: 'g1', name: 'Kho Hà Nội', members: 5 }]);
  assert.deepStrictEqual(b.recent('a').map((x) => x.title), ['Kho Hà Nội', 'Bình']);
  assert.deepStrictEqual(b.recent('a', { query: 'kho ha noi' }).map((x) => x.threadId), ['g1']);
  assert.deepStrictEqual(b.recent('a', { usersOnly: true }).map((x) => x.threadId), ['t9']);
  assert.strictEqual(fold('Đặng Thị Ánh'), 'dang thi anh');
  const many = Array.from({ length: MAX_PER_THREAD + 30 }, (_, i) => msg({ threadId: 'big', msgId: `k${i}`, ts: i }));
  b.add('a', many);
  assert.strictEqual(b.read('a', 'big', 999).length, MAX_PER_THREAD);
  assert.strictEqual(b.read('a', 'big', 5)[4].msgId, `k${MAX_PER_THREAD + 29}`, 'giữ tin MỚI nhất');
  b.clear('a');
  assert.deepStrictEqual(b.recent('a'), []);
});

// ── 2. Chốt: chủ máy + kỹ năng nhắc đúng tên công cụ ─────────────────────────────────────────────
test('mở khoá theo TỪNG công cụ: chỉ tên công cụ có thật; kỹ năng đọc KHÔNG mở được lệnh gửi', () => {
  assert.deepStrictEqual(C.connectorUnlocksOf('dùng `zalo_read_chat` rồi zalo_send_text, và zalo_fake_tool'), ['zalo_read_chat', 'zalo_send_text']);
  const by = Object.fromEntries(BUILTIN_SKILLS.map((s) => [s.id, C.connectorUnlocksOf(s.body)]));
  assert.ok(by['lw-zalo-doc-tin'].includes('zalo_read_chat') && !by['lw-zalo-doc-tin'].includes('zalo_send_text'));
  assert.ok(by['lw-zalo-gui-tin'].includes('zalo_send_text'));
  assert.ok(by['lw-gmail-doc-thu'].includes('gmail_read') && !by['lw-gmail-doc-thu'].includes('gmail_send'));
  assert.ok(by['lw-gmail-gui-thu'].includes('gmail_send'));
  // Đồng bộ: kỹ năng đọc + kỹ năng đồng bộ mở zalo_sync / zalo_web_*, KHÔNG mở lệnh gửi.
  for (const id of ['lw-zalo-doc-tin', 'lw-zalo-dong-bo']) {
    assert.ok(by[id].includes('zalo_sync'), `${id} mở zalo_sync`);
    assert.ok(!by[id].includes('zalo_send_text'), `${id} không mở lệnh gửi`);
  }
  assert.ok(by['lw-zalo-doc-tin'].includes('zalo_search_messages'));
  assert.ok(by['lw-zalo-dong-bo'].includes('zalo_web_open') && by['lw-zalo-dong-bo'].includes('zalo_web_read'), 'kỹ năng đồng bộ mở cửa sổ Zalo Web');
  for (const id of ['lw-xuat-bang', 'lw-nhap-bang', 'lw-dinh-tep-bitable']) assert.deepStrictEqual(by[id], [], `${id} không đụng Zalo/Gmail`);
});

test('chốt: không có quyền lượt (bot Lark / lịch / chia sẻ) ⇒ từ chối, kể cả công cụ ĐỌC', async () => {
  assert.throws(() => C.connectorGate('zalo_read_chat', undefined), /chính chủ máy/);
  const tool = T.allTools().find((t) => t.name === 'zalo_read_chat');
  await assert.rejects(() => tool.exec({ threadId: 't1' }, {}), /chính chủ máy/, 'chạy ngoài withTurnFiles = không có quyền');
  // Bộ công cụ chỉ-đọc (lượt bot Lark trả lời trong nhóm) CÓ công cụ đọc Zalo — chốt mới là thứ chặn.
  assert.ok(T.readOnlyTools().some((t) => t.name === 'zalo_read_chat'));
  await FC.withTurnFiles({ outDir: null }, () => assert.rejects(() => tool.exec({ threadId: 't1' }, {}), /chính chủ máy/));
});

test('chốt: lượt của chủ máy nhưng chưa nạp kỹ năng ⇒ "agent không tự thao tác"; skill_get nạp kỹ năng thì mở đúng công cụ', async () => {
  const access = { skills: [], tools: [] };
  assert.throws(() => C.connectorGate('zalo_send_text', access), /không tự thao tác Zalo/);
  await FC.withTurnFiles({ connectors: access }, async () => {
    C.noteSkillLoaded('lw-zalo-doc-tin', BUILTIN_SKILLS.find((s) => s.id === 'lw-zalo-doc-tin').body);
  });
  assert.deepStrictEqual(access.skills, ['lw-zalo-doc-tin']);
  C.connectorGate('zalo_read_chat', access); // không ném
  assert.throws(() => C.connectorGate('zalo_send_text', access), /không tự thao tác Zalo/, 'kỹ năng đọc không mở lệnh gửi');
  C.noteSkillLoaded('x', 'zalo_send_text'); // ngoài lượt ⇒ không làm gì
  assert.ok(!access.tools.includes('zalo_send_text'));
});

// ── 3. Gửi = thao tác ghi thường; lịch của chủ máy được gửi ──────────────────────────────────────
test('gửi Zalo / Gmail: gated (Tự động TẮT ⇒ hỏi), Tự động BẬT ⇒ chạy luôn; lượt tự động = loại "Gửi tin"', () => {
  for (const name of ['zalo_send_text', 'gmail_send']) {
    const t = T.allTools().find((x) => x.name === name);
    assert.ok(t && t.gated && !t.alwaysConfirm, name);
    assert.ok(!T.isAlwaysConfirmTool(name), `${name} không còn "luôn hỏi"`);
    assert.strictEqual(EX.needsConfirmation(t, { autoApproveTool: () => false }), true, `${name}: Tự động tắt ⇒ hỏi`);
    assert.strictEqual(EX.needsConfirmation(t, { autoApproveTool: () => 'all' }), false, `${name}: Tự động bật ⇒ không hỏi`);
    assert.strictEqual(EX.needsConfirmation(t, { autoApprove: true }), false, `${name}: Tự động duyệt chung ⇒ không hỏi`);
    assert.strictEqual(UP.gatedCategory(t), 'send', `${name}: lịch gửi được khi có quyền "Gửi tin"`);
    assert.strictEqual(UP.unattendedDecision(t, {}, { sendMessages: true }).allow, true);
    assert.strictEqual(UP.unattendedDecision(t, {}, { sendMessages: false }).allow, false, 'không có quyền gửi ⇒ bỏ qua');
    assert.doesNotMatch(t.description, /LUÔN hỏi|30 tin|40 thư/);
  }
  for (const name of ['zalo_read_chat', 'gmail_search', 'gmail_read', 'zalo_list_chats']) assert.ok(!T.allTools().find((x) => x.name === name).gated, `${name} chỉ đọc`);
  // Không cần custom app Lark (chạy bằng kết nối riêng của app).
  assert.ok(T.agentTools({ withOpenApi: false }).some((t) => t.name === 'zalo_send_text'));
});

test('lịch: chỉ lượt của chủ máy cấp được Zalo/Gmail; cấp đúng công cụ prompt nhắc + công cụ cùng loại đã mở', async () => {
  const prompt = 'Gửi giờ hiện tại vào nhóm Zalo «Test» bằng `zalo_send_text` {threadId:"g1", isGroup:true}.';
  // Bot Lark / lượt chia sẻ / lịch khác: không có quyền lượt ⇒ không cấp gì.
  assert.deepStrictEqual(C.connectorGrantForSchedule(prompt, undefined), []);
  assert.deepStrictEqual(await FC.withTurnFiles({}, async () => C.connectorGrantForSchedule(prompt)), []);
  // Hội thoại của chủ máy, kỹ năng gửi Zalo đã nạp: cấp công cụ Zalo, KHÔNG cấp Gmail.
  const access = { skills: ['lw-zalo-gui-tin'], tools: ['zalo_status', 'zalo_list_groups', 'zalo_send_text', 'gmail_send'] };
  const g = await FC.withTurnFiles({ connectors: access }, async () => C.connectorGrantForSchedule(prompt));
  assert.ok(g.includes('zalo_send_text') && g.includes('zalo_list_groups') && !g.includes('gmail_send'), JSON.stringify(g));
  // Chưa nạp kỹ năng nhưng prompt nhắc đúng tên ⇒ vẫn cấp đúng công cụ đó (người dùng đã nói rõ việc).
  assert.deepStrictEqual(C.connectorGrantForSchedule(prompt, { skills: [], tools: [] }), ['zalo_send_text']);
  // Prompt không nhắc Zalo/Gmail ⇒ không cấp, dù lượt có mở.
  assert.deepStrictEqual(C.connectorGrantForSchedule('Mỗi sáng tóm tắt Base bán hàng', access), []);
  // Lượt chạy của lịch mang đúng các công cụ đó ⇒ chốt cho qua, công cụ khác vẫn bị chặn.
  const run = { skills: [], tools: g };
  C.connectorGate('zalo_send_text', run);
  assert.throws(() => C.connectorGate('gmail_send', run), /không tự thao tác Gmail/);
});

test('nhịp gửi: không trần, chỉ cảnh báo (tin đầu của phiên + khi gửi dày); Gmail tới 100 người nhận', () => {
  assert.ok(P.ZALO_SEND_FLOOR_MS <= 2000 && P.GMAIL_SEND_FLOOR_MS <= 2000);
  assert.match(P.zaloSendWarning(0, true), /khoá tài khoản/);
  assert.strictEqual(P.zaloSendWarning(3, false), undefined);
  assert.match(P.zaloSendWarning(29, false), /Đã gửi 30 tin Zalo/);
  assert.match(P.zaloSendWarning(100, false), /khoá/, 'tin thứ 101 trong giờ vẫn chỉ là cảnh báo');
  assert.strictEqual(P.gmailSendWarning(2, 3, false), undefined);
  assert.match(P.gmailSendWarning(2, 50, false), /50 người nhận/);
  assert.strictEqual(P.GMAIL_MAX_RECIPIENTS, 100);
  assert.deepStrictEqual(P.lastHour([0, 1000, 3_700_000], 3_700_500), [1000, 3_700_000].filter((t) => 3_700_500 - t < 3_600_000));
});

// ── 4. Kỹ năng dựng sẵn ─────────────────────────────────────────────────────────────────────────
test('bộ kỹ năng "Zalo & Gmail": 5 kỹ năng, lệnh /, nhãn riêng; kỹ năng gửi: không trần, cảnh báo, lịch lặp lại', () => {
  const zg = BUILTIN_SKILLS.filter((s) => (s.tags || []).includes('Zalo & Gmail'));
  assert.deepStrictEqual(zg.map((s) => s.command).sort(), ['gmail-doc-thu', 'gmail-gui-thu', 'zalo-doc-tin', 'zalo-dong-bo', 'zalo-gui-tin']);
  // Đồng bộ qua cửa sổ Zalo Web: kỹ năng hướng dẫn ĐĂNG NHẬP TRONG CỬA SỔ (không dùng sidebar) + chống vòng lặp.
  const sync = BUILTIN_SKILLS.find((s) => s.id === 'lw-zalo-dong-bo');
  assert.match(sync.body, /zalo_web_open/);
  assert.match(sync.body, /zalo_web_read/);
  assert.match(sync.body, /QUÉT MÃ QR NGAY TRONG CỬA SỔ/);
  assert.match(sync.body, /ĐỪNG bấm nút «Kết nối Zalo» ở thanh bên|KHÔNG bảo người dùng quét QR ở sidebar/);
  assert.match(sync.body, /VÒNG LẶP/);
  for (const s of zg) {
    assert.ok(s.id.startsWith('lw-') && s.triggers.length >= 8, s.id);
    assert.match(s.body, /Kỹ năng → Kết nối|Kết nối Zalo \(quét QR\)|«Kết nối/, `${s.id}: chỉ chỗ kết nối khi chưa có`);
  }
  const zs = BUILTIN_SKILLS.find((s) => s.id === 'lw-zalo-gui-tin');
  assert.ok(zs.version >= 3);
  assert.match(zs.body, /KHÔNG giới hạn số tin/);
  assert.match(zs.body, /khoá tài khoản/);
  assert.match(zs.body, /schedule_agent_job[\s\S]*max_runs[\s\S]*send_messages:true[\s\S]*zalo_send_text/);
  for (const s of zg) assert.doesNotMatch(s.body, /30 tin\/giờ|40 thư\/giờ|không gửi được \(app chặn\)/, s.id);
  assert.match(BUILTIN_SKILLS.find((s) => s.id === 'lw-zalo-doc-tin').body, /KHÔNG bịa/);
});

// ── 5. Gmail (phần thuần) ───────────────────────────────────────────────────────────────────────
test('Gmail: mật khẩu ứng dụng bỏ dấu cách; lỗi đăng nhập ra câu hướng dẫn; câu lỗi không lộ mật khẩu', () => {
  assert.strictEqual(G.normalizeAppPassword('abcd efgh ijkl mnop'), 'abcdefghijklmnop');
  assert.match(G.friendlyGmailError({ response: '535-5.7.8 Username and Password not accepted.' }), /MẬT KHẨU ỨNG DỤNG/);
  assert.match(G.friendlyGmailError(new Error('Command failed: [AUTHENTICATIONFAILED] Invalid credentials')), /MẬT KHẨU ỨNG DỤNG/);
  const leaked = G.friendlyGmailError(new Error('lạ: AUTH PLAIN AGJvYkBnbWFpbC5jb20Ac2VjcmV0 · abcdefghijklmnop · abcd efgh ijkl mnop'), ['abcdefghijklmnop']);
  assert.ok(!/abcdefghijklmnop|abcd efgh|AGJvY/.test(leaked), leaked);
  assert.ok(G.isGmailAddress('a.b@gmail.com') && !G.isGmailAddress('ab@'));
});

test('Gmail: chọn phần chữ (text/plain trước, rồi html) + liệt kê đính kèm; html → chữ', () => {
  const tree = {
    childNodes: [
      { childNodes: [{ part: '1.1', type: 'text/plain' }, { part: '1.2', type: 'text/html' }] },
      { part: '2', type: 'application/pdf', disposition: 'attachment', dispositionParameters: { filename: 'hoa-don.pdf' }, size: 1234 },
    ],
  };
  assert.deepStrictEqual(G.pickParts(tree), { textPart: '1.1', htmlPart: '1.2', attachments: [{ name: 'hoa-don.pdf', size: 1234, type: 'application/pdf' }] });
  assert.deepStrictEqual(G.pickParts({ type: 'text/html' }), { htmlPart: '1', attachments: [] });
  assert.strictEqual(G.htmlToText('<p>Chào&nbsp;anh</p><style>x{}</style><div>Đơn <b>DH-1</b></div>'), 'Chào anh\nĐơn DH-1');
});

Promise.all(pending).then(() => {
  if (failed) {
    console.error(`\n${failed} bài lỗi`);
    process.exit(1);
  }
});
