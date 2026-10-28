/**
 * Lượt chạy lại bằng thuê bao sau khi API key trong app hết credit — không được IM LẶNG.
 *
 * Lỗi người dùng gặp (28/10/2026): app bơm API key đã cạn vào `claude` ⇒ "Credit balance is too
 * low"; larkService chạy lại lượt đó bằng đăng nhập Claude của máy (gói Max) nhưng dùng LẠI
 * `--session-id X` mà lần đầu vừa tạo. CLI từ chối bằng một dòng stderr
 * (`Error: Session ID X is already in use.`) rồi thoát 1, không một dòng stdout — mà runOnce bỏ
 * qua stderr ⇒ lần chạy lại không ra gì, người dùng chỉ thấy thẻ "hết credit" dù đã đăng nhập.
 *
 * Kiểm bằng một `claude` GIẢ đặt đầu PATH, cư xử đúng như CLI 2.1.92 đã đo:
 *  - `--session-id X` lần đầu: tạo phiên, trả lỗi credit;
 *  - `--session-id X` khi phiên đã có: stderr "already in use", thoát 1, stdout rỗng;
 *  - `--resume X`: trả lời bình thường.
 */
const Module = require('node:module');
const assert = require('node:assert');
const { mkdtempSync, writeFileSync, chmodSync, readFileSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const orig = Module._load;
Module._load = function (req) {
  if (req === 'electron') return { app: { getPath: () => tmpdir() }, safeStorage: { isEncryptionAvailable: () => false } };
  return orig.apply(this, arguments);
};

const work = mkdtempSync(join(tmpdir(), 'lw-sid-'));
const bin = join(work, 'bin');
require('node:fs').mkdirSync(bin);
writeFileSync(
  join(bin, 'claude'),
  `#!/usr/bin/env node
const fs = require('fs'), path = require('path');
const a = process.argv.slice(2);
const dir = process.env.FAKE_CLAUDE_DIR;
fs.appendFileSync(path.join(dir, 'calls.log'), a.filter((x) => x === '--session-id' || x === '--resume').concat(a.filter((_, i) => a[i - 1] === '--session-id' || a[i - 1] === '--resume')).join(' ') + '\\n');
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
if (process.env.FAKE_CLAUDE_MODE === 'crash') { process.stderr.write('boom: CLI hỏng kiểu lạ\\n'); process.exit(2); }
if (process.env.FAKE_CLAUDE_MODE === 'synthetic-ok') { out({ type: 'assistant', message: { model: '<synthetic>', content: [{ type: 'text', text: 'No response requested.' }] } }); out({ type: 'result', is_error: false, result: '' }); process.exit(0); }
const si = a.indexOf('--session-id'), ri = a.indexOf('--resume');
if (si >= 0) {
  const id = a[si + 1], f = path.join(dir, id);
  if (fs.existsSync(f)) { process.stderr.write('Error: Session ID ' + id + ' is already in use.\\n'); process.exit(1); }
  fs.writeFileSync(f, '');
  out({ type: 'system', subtype: 'init', model: 'claude-opus-5-5' });
  out({ type: 'assistant', error: 'billing_error', message: { model: '<synthetic>', content: [{ type: 'text', text: 'Credit balance is too low' }] } });
  out({ type: 'result', is_error: true, result: 'Credit balance is too low' });
  process.exit(1);
}
if (ri >= 0) {
  out({ type: 'system', subtype: 'init', model: 'claude-opus-5-5' });
  out({ type: 'assistant', message: { content: [{ type: 'text', text: 'Chạy bằng thuê bao.' }] } });
  out({ type: 'result', is_error: false, result: 'Chạy bằng thuê bao.' });
}
`,
);
chmodSync(join(bin, 'claude'), 0o755);
process.env.PATH = `${bin}:${process.env.PATH}`;
process.env.FAKE_CLAUDE_DIR = work;
delete process.env.ELECTRON_RUN_AS_NODE;

const { runLarkAgent } = require('../.test-build/runtime/lark/larkAgent.js');

const turn = async (session) => {
  const evs = [];
  for await (const ev of runLarkAgent('xin chào', 'build', {
    systemPrompt: 'test',
    runner: 'claude',
    generalMode: true,
    preferSubscription: true,
    cwd: work,
    session,
  })) evs.push(ev);
  return {
    text: evs.filter((e) => e.type === 'text').map((e) => e.delta).join(''),
    errors: evs.filter((e) => e.type === 'error').map((e) => e.message),
  };
};
const calls = () => readFileSync(join(work, 'calls.log'), 'utf8').trim().split('\n');

(async () => {
  const id = '11111111-2222-4333-8444-555555555555';

  // Lần đầu: phiên mới, khoá cạn ⇒ lỗi credit (đã dịch sang tiếng Việt).
  const first = await turn({ id, resume: false });
  assert.ok(first.errors.some((m) => /Hết credit API/.test(m)), `lần đầu phải báo hết credit: ${JSON.stringify(first)}`);
  assert.ok(existsSync(join(work, id)), 'lần đầu đã tạo phiên');
  // Câu lỗi thô của CLI KHÔNG được thành chữ trong bong bóng: chạy lại thành công mà đầu bong bóng
  // còn "Credit balance is too low" thì giao diện thay cả câu trả lời bằng thẻ hết credit.
  assert.ok(!/credit balance/i.test(first.text), `câu lỗi thô lọt thành chữ: ${JSON.stringify(first.text)}`);
  console.log('✓ lượt hỏng: câu lỗi thô của CLI không thành chữ, chỉ còn sự kiện lỗi tiếng Việt');

  // Chạy lại với ĐÚNG session lỗi cũ ({resume:false}): phải tự chuyển sang --resume, KHÔNG im lặng.
  const retry = await turn({ id, resume: false });
  assert.strictEqual(retry.errors.length, 0, `không được có lỗi: ${JSON.stringify(retry.errors)}`);
  assert.ok(/Chạy bằng thuê bao/.test(retry.text), `phải ra câu trả lời: ${JSON.stringify(retry)}`);
  assert.deepStrictEqual(calls().slice(-2), [`--session-id ${id}`, `--resume ${id}`]);
  console.log('✓ --session-id trùng phiên đã có ⇒ tự --resume, lượt chạy lại có câu trả lời');

  // Đường larkService dùng sau khi sửa: nối thẳng phiên lần đầu vừa tạo.
  const direct = await turn({ id, resume: true });
  assert.ok(/Chạy bằng thuê bao/.test(direct.text) && direct.errors.length === 0, JSON.stringify(direct));
  assert.strictEqual(calls().at(-1), `--resume ${id}`);
  console.log('✓ chạy lại với {resume:true} ⇒ nối phiên lần đầu, không tốn thêm lần gọi hỏng');

  // CLI thoát lỗi chỉ bằng stderr (không result) ⇒ phải hiện lỗi, không im lặng.
  process.env.FAKE_CLAUDE_MODE = 'crash';
  const crash = await turn({ id: '99999999-2222-4333-8444-555555555555', resume: false });
  delete process.env.FAKE_CLAUDE_MODE;
  assert.ok(crash.errors.length === 1 && /boom: CLI hỏng kiểu lạ/.test(crash.errors[0]), JSON.stringify(crash));
  console.log('✓ CLI chết chỉ để lại stderr ⇒ lỗi hiện ra (đúng một lần), không phải lượt trống');

  // Tin <synthetic> ở lượt KHÔNG lỗi vẫn hiện như cũ.
  process.env.FAKE_CLAUDE_MODE = 'synthetic-ok';
  const syn = await turn({ id: '88888888-2222-4333-8444-555555555555', resume: false });
  delete process.env.FAKE_CLAUDE_MODE;
  assert.ok(/No response requested/.test(syn.text) && syn.errors.length === 0, JSON.stringify(syn));
  console.log('✓ tin <synthetic> ở lượt không lỗi vẫn hiện');
})().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
