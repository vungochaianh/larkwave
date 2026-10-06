/**
 * Lịch tự động hoá không được chạy NGAY lúc vừa tạo, và không được nhân bản.
 *
 * Hai lỗi thật người dùng gặp:
 *  (a) nói "mỗi ngày 9h chạy PBTTCN" lúc 14h chiều → rule chạy ngay lập tức, app tự mở một hội
 *      thoại mới và tự hỏi lại đúng câu vừa gõ. Vì rule mới có lastRunAt rỗng nên mốc so sánh là
 *      0, và MỌI khung giờ trong quá khứ đều bị coi là "chưa chạy" — kể cả khung trước lúc rule
 *      tồn tại.
 *  (b) nhắc lại yêu cầu → thêm một mục nữa ở trang Tự động hoá, chạy song song, báo cáo trùng.
 *
 * Bài kiểm này canh cả hai, VÀ canh ca ngược lại đừng bị phá: app tắt qua đêm, mở muộn thì lịch
 * hôm nay vẫn phải chạy bù.
 */
// GHIM MÚI GIỜ — phải đặt TRƯỚC mọi thao tác Date.
//
// `scheduleDue` tính khung "9h hôm nay" theo GIỜ ĐỊA PHƯƠNG, và đó là hành vi ĐÚNG: người dùng
// nói "mỗi ngày 9h" là 9h giờ họ, không phải 9h UTC. Nhưng bài kiểm này viết mốc kèm "+07:00" rồi
// kỳ vọng kết quả chỉ đúng khi tiến trình CŨNG chạy ở +07 — một giả định không khai ra.
//
// Hệ quả: đạt trên máy ở Việt Nam, HỎNG trên runner GitLab (chạy UTC). Ca hỏng là ca thứ hai —
// 23:59 giờ VN là 16:59 UTC, nên trong UTC khung 9h "hôm nay" nằm SAU lúc tạo rule và bị coi là
// đến hạn. Đừng gỡ dòng này; gỡ ra là CI đỏ lại ngay.
process.env.TZ = 'Asia/Ho_Chi_Minh';

const assert = require('node:assert');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const Module = require('node:module');
const orig = Module._load;
Module._load = function (req) {
  if (req === 'electron') return { app: { getPath: () => mkdtempSync(join(tmpdir(), 'tw-sched-')) } };
  return orig.apply(this, arguments);
};
const { AutomationEngine } = require('../.test-build/runtime/lark/automationEngine.js');

/** Gọi thẳng hàm riêng — đây là toàn bộ logic quyết định "có chạy bây giờ không". */
const due = (rule, nowMs) => AutomationEngine.prototype.scheduleDue.call(null, rule, nowMs);

const DAY = 24 * 3600 * 1000;
const at = (iso) => Date.parse(iso);
const daily = (extra) => ({ triggerType: 'schedule', schedule: { mode: 'daily', atHour: 9, atMinute: 0 }, ...extra });

let pass = 0;
// Một số ca là async (engine.execute). Gom promise lại rồi chờ ở cuối, để ca đồng bộ vẫn chạy
// như cũ mà không phải viết lại toàn bộ file.
const waits = [];
const t = (name, fn) => {
  const r = fn();
  if (r && typeof r.then === 'function') {
    waits.push(r.then(() => { pass += 1; console.log('  ✓', name); }));
  } else { pass += 1; console.log('  ✓', name); }
};

console.log('scheduleDue — lịch hằng ngày');
t('rule TẠO LÚC 14h cho khung 9h: KHÔNG chạy ngay (đây là lỗi người dùng gặp)', () => {
  const r = daily({ createdAt: '2026-09-11T14:00:00+07:00' });
  assert.strictEqual(due(r, at('2026-09-11T14:00:05+07:00')), false);
});
t('...và cũng không chạy suốt phần còn lại của ngày hôm đó', () => {
  const r = daily({ createdAt: '2026-09-11T14:00:00+07:00' });
  assert.strictEqual(due(r, at('2026-09-11T23:59:00+07:00')), false);
});
t('...nhưng ĐÚNG 9h hôm sau thì chạy', () => {
  const r = daily({ createdAt: '2026-09-11T14:00:00+07:00' });
  assert.strictEqual(due(r, at('2026-09-12T09:00:01+07:00')), true);
});
t('rule tạo lúc 8h cho khung 9h: chờ tới 9h rồi chạy trong CÙNG ngày', () => {
  const r = daily({ createdAt: '2026-09-11T08:00:00+07:00' });
  assert.strictEqual(due(r, at('2026-09-11T08:30:00+07:00')), false);
  assert.strictEqual(due(r, at('2026-09-11T09:00:01+07:00')), true);
});
t('CA NGƯỢC phải giữ: app tắt qua đêm, mở lúc 11h ⇒ vẫn chạy bù khung 9h', () => {
  const r = daily({ createdAt: '2026-09-01T10:00:00+07:00', lastRunAt: '2026-09-10T09:00:00+07:00' });
  assert.strictEqual(due(r, at('2026-09-11T11:00:00+07:00')), true);
});
t('đã chạy khung hôm nay rồi thì không chạy lại', () => {
  const r = daily({ createdAt: '2026-09-01T10:00:00+07:00', lastRunAt: '2026-09-11T09:00:02+07:00' });
  assert.strictEqual(due(r, at('2026-09-11T15:00:00+07:00')), false);
});
t('không đúng thứ đã chọn thì không chạy', () => {
  const r = { triggerType: 'schedule', createdAt: '2026-09-01T10:00:00+07:00', schedule: { mode: 'daily', atHour: 9, atMinute: 0, days: [1] } };
  assert.strictEqual(new Date(at('2026-09-11T10:00:00+07:00')).getDay() === 1, false);
  assert.strictEqual(due(r, at('2026-09-11T10:00:00+07:00')), false);
});

console.log('scheduleDue — lịch theo chu kỳ');
t('rule "mỗi 2 tiếng" vừa tạo: phải đợi đủ 2 tiếng, không chạy khi bấm lưu', () => {
  const r = { triggerType: 'schedule', intervalSec: 7200, createdAt: '2026-09-11T14:00:00+07:00', schedule: { mode: 'interval' } };
  assert.strictEqual(due(r, at('2026-09-11T14:00:05+07:00')), false);
  assert.strictEqual(due(r, at('2026-09-11T15:59:00+07:00')), false);
  assert.strictEqual(due(r, at('2026-09-11T16:00:01+07:00')), true);
});
t('rule cũ không có createdAt (dữ liệu đời trước) vẫn chạy theo lastRunAt', () => {
  const r = { triggerType: 'schedule', intervalSec: 3600, lastRunAt: '2026-09-11T10:00:00+07:00', schedule: { mode: 'interval' } };
  assert.strictEqual(due(r, at('2026-09-11T10:30:00+07:00')), false);
  assert.strictEqual(due(r, at('2026-09-11T11:00:01+07:00')), true);
});

// ── Chống trùng khi tạo lịch ──────────────────────────────────────────────────
console.log('\nupsert — chống trùng lịch chạy agent');
const mk = () => {
  let saved = [];
  const e = new AutomationEngine(
    () => null,
    () => saved,
    (l) => { saved = l; },
    async () => true, // luôn là chủ chạy lịch
    { run: async () => 'ok' },
  );
  e.start = () => {}; // đừng khởi động bộ đếm giờ trong bài kiểm
  return e;
};
const lich = (prompt, extra) => ({
  name: 'PBTTCN',
  enabled: true,
  appToken: '',
  tableId: '',
  intervalSec: 60,
  triggerType: 'schedule',
  schedule: { mode: 'daily', atHour: 9, atMinute: 0 },
  action: { type: 'run_agent', prompt, saveConversation: true, notify: true },
  ...extra,
});

t('nhắc lại CÙNG yêu cầu ⇒ vẫn 1 mục, không nhân đôi', () => {
  const e = mk();
  e.upsert(lich('doi chieu cong no'));
  const l = e.upsert(lich('doi chieu cong no'));
  assert.strictEqual(l.length, 1);
});
t('khác nội dung ⇒ là lịch khác, được thêm mới', () => {
  const e = mk();
  e.upsert(lich('doi chieu cong no'));
  const l = e.upsert(lich('bao cao doanh thu'));
  assert.strictEqual(l.length, 2);
});
t('cùng nội dung nhưng khác giờ ⇒ là lịch khác', () => {
  const e = mk();
  e.upsert(lich('doi chieu cong no'));
  const l = e.upsert(lich('doi chieu cong no', { schedule: { mode: 'daily', atHour: 17, atMinute: 30 } }));
  assert.strictEqual(l.length, 2);
});
t('gộp trùng phải GIỮ lastRunAt — mất nó là lịch bắn thêm một lần nữa hôm nay', () => {
  const e = mk();
  const first = e.upsert(lich('doi chieu cong no'));
  first[0].lastRunAt = '2026-09-11T09:00:02+07:00';
  const l = e.upsert(lich('doi chieu cong no'));
  assert.strictEqual(l.length, 1);
  assert.strictEqual(l[0].lastRunAt, '2026-09-11T09:00:02+07:00');
  assert.strictEqual(due(l[0], at('2026-09-11T15:00:00+07:00')), false);
});
t('rule theo BẢNG BASE không bị gộp — hai quy tắc khác điều kiện trên cùng bảng là hợp lệ', () => {
  const e = mk();
  const r = { name: 'x', enabled: true, appToken: 'A', tableId: 'T', intervalSec: 60, triggerType: 'record', action: { type: 'webhook', url: 'https://x' } };
  e.upsert(r);
  const l = e.upsert(r);
  assert.strictEqual(l.length, 2);
});


// ── Dọn lịch đã nhân bản từ trước ────────────────────────────────────────────
console.log('\ndedupeSchedules — dọn mục đã trùng sẵn trên máy người dùng');
const { dedupeSchedules } = require('../.test-build/runtime/lark/automationEngine.js');
const sched = (extra) => ({
  id: extra.id, triggerType: 'schedule', enabled: true,
  schedule: { mode: 'daily', atHour: 9, atMinute: 0 },
  action: { type: 'run_agent', prompt: 'doi chieu cong no' },
  ...extra,
});

t('ba bản sao ⇒ còn một', () => {
  const out = dedupeSchedules([sched({ id: 'a' }), sched({ id: 'b' }), sched({ id: 'c' })]);
  assert.strictEqual(out.length, 1);
});
t('GIỮ mốc chạy muộn nhất — bỏ nhầm là mời thêm một lần chạy thừa hôm nay', () => {
  const out = dedupeSchedules([
    sched({ id: 'a' }),
    sched({ id: 'b', lastRunAt: '2026-09-11T09:00:02+07:00' }),
  ]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].lastRunAt, '2026-09-11T09:00:02+07:00');
  assert.strictEqual(due(out[0], at('2026-09-11T15:00:00+07:00')), false);
});
t('còn bật ở bất kỳ bản nào thì mục gộp vẫn bật', () => {
  const out = dedupeSchedules([sched({ id: 'a', enabled: false }), sched({ id: 'b', enabled: true })]);
  assert.strictEqual(out[0].enabled, true);
});
t('cộng dồn số lần đã chạy', () => {
  const out = dedupeSchedules([sched({ id: 'a', runCount: 3 }), sched({ id: 'b', runCount: 5 })]);
  assert.strictEqual(out[0].runCount, 8);
});
t('lịch khác nội dung KHÔNG bị gộp', () => {
  const out = dedupeSchedules([sched({ id: 'a' }), sched({ id: 'b', action: { type: 'run_agent', prompt: 'khac' } })]);
  assert.strictEqual(out.length, 2);
});
t('rule theo bảng Base đi qua nguyên vẹn', () => {
  const rec = { id: 'r1', triggerType: 'record', appToken: 'A', tableId: 'T', action: { type: 'webhook', url: 'https://x' } };
  const out = dedupeSchedules([rec, { ...rec, id: 'r2' }]);
  assert.strictEqual(out.length, 2);
});
t('danh sách rỗng và danh sách sạch không đổi', () => {
  assert.strictEqual(dedupeSchedules([]).length, 0);
  assert.strictEqual(dedupeSchedules([sched({ id: 'a' })]).length, 1);
});


// ── Lịch phải THỰC THI, và phải ghi lịch sử ───────────────────────────────────
console.log('\nlịch chạy ở chế độ nào + lịch sử thực thi');
const mkRun = () => {
  let saved = [];
  const seen = [];
  const e = new AutomationEngine(
    () => ({}), // client giả — runAction chỉ cần nó khác null
    () => saved,
    (l) => { saved = l; },
    async () => true, // luôn là chủ chạy lịch
    {
      run: async (prompt, mode, stats) => { seen.push({ prompt, mode }); stats.tools = 3; stats.writes = 2; return 'xong rồi'; },
      save: async () => {},
      notify: () => {},
    },
  );
  e.start = () => {};
  return { e, seen, list: () => saved };
};
const lichAgent = (extra) => ({
  name: 'PBTTCN', enabled: true, appToken: '', tableId: '', intervalSec: 60,
  triggerType: 'schedule', schedule: { mode: 'daily', atHour: 9, atMinute: 0 },
  action: { type: 'run_agent', prompt: 'doi chieu roi ghi vao 4.1.3', saveConversation: true, notify: false, ...extra },
});

t('MẶC ĐỊNH là thực thi — đặt lịch là để nó LÀM, không phải để báo là không có quyền', async () => {
  const { e, seen } = mkRun();
  const l = e.upsert(lichAgent());
  await e.execute(l[0].id, {});
  assert.strictEqual(seen.length, 1);
  assert.strictEqual(seen[0].mode, 'build');
});
t('lịch CŨ (chưa có trường mode) cũng lên thực thi', async () => {
  const { e, seen } = mkRun();
  const l = e.upsert(lichAgent());
  delete l[0].action.mode;
  await e.execute(l[0].id, {});
  assert.strictEqual(seen[0].mode, 'build');
});
t('chọn chỉ-đọc thì vẫn tôn trọng', async () => {
  const { e, seen } = mkRun();
  const l = e.upsert(lichAgent({ mode: 'ask' }));
  await e.execute(l[0].id, {});
  assert.strictEqual(seen[0].mode, 'ask');
});
t('mỗi lần chạy vào lịch sử, kèm SỐ THAO TÁC GHI', async () => {
  const { e, list } = mkRun();
  const l = e.upsert(lichAgent());
  await e.execute(l[0].id, {});
  const r = list()[0].runs;
  assert.ok(Array.isArray(r) && r.length === 1, 'phải có 1 dòng lịch sử');
  assert.strictEqual(r[0].ok, true);
  assert.strictEqual(r[0].writes, 2);
  assert.strictEqual(r[0].tools, 3);
  assert.strictEqual(r[0].mode, 'build');
  assert.ok(r[0].summary.includes('xong rồi'));
});
t('lịch sử cắt ở 20 lần, giữ MỚI NHẤT', async () => {
  const { e, list } = mkRun();
  const l = e.upsert(lichAgent());
  for (let i = 0; i < 25; i += 1) { l[0].lastRunAt = undefined; await e.execute(l[0].id, {}); }
  const r = list()[0].runs;
  assert.strictEqual(r.length, 20);
});

// ── Nhường quyền cho VM ───────────────────────────────────────────────────────
console.log('\nchống chạy trùng với máy nền (VM)');
t('KHÔNG phải chủ ⇒ tick im, không chạy lịch nào', async () => {
  let saved = [];
  const seen = [];
  const e = new AutomationEngine(
    () => ({}),
    () => saved,
    (l) => { saved = l; },
    async () => false, // VM đang giữ quyền
    { run: async () => { seen.push(1); return 'x'; }, notify: () => {} },
  );
  e.start = () => {}; // đừng khởi động bộ đếm giờ thật trong bài kiểm
  e.upsert(lichAgent());
  saved[0].lastRunAt = undefined;
  await e.tick();
  await new Promise((r) => setTimeout(r, 30));
  assert.strictEqual(seen.length, 0, 'máy không phải chủ mà vẫn chạy ⇒ bản ghi trùng trong Base thật');
});
t('là chủ ⇒ chạy bình thường', async () => {
  let saved = [];
  const seen = [];
  const e = new AutomationEngine(
    () => ({}),
    () => saved,
    (l) => { saved = l; },
    async () => true,
    { run: async () => { seen.push(1); return 'x'; }, notify: () => {} },
  );
  e.start = () => {};
  // `lichAgent(extra)` spread extra vào ACTION, nên schedule phải đặt ở cấp quy tắc.
  const l = e.upsert({ ...lichAgent(), schedule: { mode: 'interval' }, intervalSec: 60 });
  l[0].createdAt = new Date(Date.now() - 3600_000).toISOString();
  await e.tick();
  // `tick` gọi execute bằng `void` (không chờ) để một lịch chậm không chặn các lịch khác — nên
  // phải nhường một nhịp vòng lặp sự kiện rồi mới kiểm.
  await new Promise((r) => setTimeout(r, 30));
  assert.strictEqual(seen.length, 1);
});

(async()=>{ await Promise.all(waits); console.log(`\n${pass} ca đạt (tổng).`); })();
