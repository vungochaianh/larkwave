/**
 * Nhiều lượt AI chạy SONG SONG — các bất biến không được vỡ.
 *
 * Ba thứ từng là "một ô nhớ cho cả dịch vụ", và mỗi thứ hỏng theo một kiểu riêng khi có hai lượt:
 *  - khoá: lượt thứ hai bị từ chối thẳng;
 *  - `runs`: nút Dừng của tab này giết CLI của tab kia, hoặc để lại tiến trình mồ côi;
 *  - `pending`/`pendingAsk`: lượt vừa bắt đầu TỪ CHỐI xác nhận đang treo của lượt kia, và lượt
 *    kết thúc trả lời rác cho câu hỏi ask_user của lượt kia.
 */
const Module = require('node:module');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const orig = Module._load;
Module._load = function (req) {
  if (req === 'electron') return { Notification: class { show() {} static isSupported() { return false; } } };
  return orig.apply(this, arguments);
};

const lock = require('../.test-build/runtime/agentLock.js');
const { LarkService } = require('../.test-build/runtime/lark/larkService.js');

let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  ← ${extra}`}`);
  if (!ok) failed++;
};
const owner = (sessionId) => ({ kind: 'lark', sessionId, label: 'x', startedAt: Date.now() });

// ── khoá ────────────────────────────────────────────────────────────────────
lock.forceReleaseAll('test');
const a = lock.tryAcquire(owner('c1'));
const b = lock.tryAcquire(owner('c2'));
check('hai hội thoại KHÁC nhau cùng chạy được', !!a && !!b);
check('cùng một hội thoại bị từ chối (chống bấm Gửi hai lần)', lock.tryAcquire(owner('c1')) === null);
const c = lock.tryAcquire(owner('c3'));
check(`chạm trần ${lock.maxConcurrent()} thì từ chối lượt tiếp`, !!c && lock.tryAcquire(owner('c4')) === null);
check('owners() liệt kê đủ mọi lượt', lock.owners().length === 3, String(lock.owners().length));

let killed = [];
lock.forceReleaseAll('test');
const k1 = lock.tryAcquire(owner('k1'), () => killed.push('k1'));
lock.tryAcquire(owner('k2'), () => killed.push('k2'));
lock.forceRelease('lark:k1', 'test');
check('forceRelease chỉ giết ĐÚNG một lượt', killed.length === 1 && killed[0] === 'k1', JSON.stringify(killed));
check('lượt còn lại vẫn giữ khoá', lock.isBusy('lark:k2'));
lock.release(k1); // nhả một lease đã bị cưỡng chế = không làm gì
check('nhả lease cũ không đụng lượt khác', lock.isBusy('lark:k2'));
lock.forceReleaseAll('test');
check('forceReleaseAll dọn sạch + giết hết', lock.owners().length === 0 && killed.includes('k2'), JSON.stringify(killed));

// ── huỷ đúng lượt ───────────────────────────────────────────────────────────
const svc = new LarkService(mkdtempSync(join(tmpdir(), 'tw-par-')));
const mkRun = (id) => {
  const abort = new AbortController();
  let returned = false;
  svc.runs.set(id, { gen: { return: async () => { returned = true; } }, abort });
  return { abort, wasReturned: () => returned };
};
const r1 = mkRun('c1');
const r2 = mkRun('c2');
svc.cancelChat('c1');
check('Dừng ở tab này KHÔNG giết lượt của tab kia', r1.abort.signal.aborted && !r2.abort.signal.aborted);
svc.cancelChat();
check('Dừng không tham số = dừng tất cả', r2.abort.signal.aborted);

// ── xác nhận công cụ không bị từ chối chéo ──────────────────────────────────
const answers = {};
svc.pending.set('call-A', { convId: 'c1', resolve: (v) => (answers.A = v) });
svc.pending.set('call-B', { convId: 'c2', resolve: (v) => (answers.B = v) });
svc.pendingAsk.set('ask-A', { convId: 'c1', resolve: (v) => (answers.askA = v) });
svc.pendingAsk.set('ask-B', { convId: 'c2', resolve: (v) => (answers.askB = v) });
svc.clearPending('c1');
check('dọn hội thoại c1 → xác nhận của c1 bị từ chối', answers.A === false);
check('… nhưng xác nhận của c2 VẪN TREO, không bị đụng', answers.B === undefined && svc.pending.has('call-B'));
check('câu hỏi ask_user của c2 cũng không bị trả lời rác', answers.askB === undefined);
check('câu hỏi của c1 được giải phóng', typeof answers.askA === 'string');
svc.confirmTool('call-B', 'allow');
check('trả lời đúng địa chỉ theo callId', answers.B === true);

console.log(failed ? `\n${failed} ca SAI` : '\nTẤT CẢ ĐÚNG');
process.exit(failed ? 1 : 0);
