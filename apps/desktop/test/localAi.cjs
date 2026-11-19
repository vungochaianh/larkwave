/**
 * "Cài AI" (0.1.24) — người dùng tự cài AI ngay trong app, chạy trên máy của họ:
 *   1. apiRunner provider 'ollama': gọi /v1/chat/completions ở ĐỊA CHỈ truyền vào, KHÔNG cần khoá, gửi
 *      `max_tokens` (không phải max_completion_tokens), lọc khối <think> khỏi chữ trả lời, chạy vòng công cụ.
 *   2. Bộ quản lý Ollama: link tải đúng theo hệ điều hành, tìm tệp chạy sau giải nén, mô hình mặc định theo RAM.
 *   3. Claude một bấm: đúng lệnh trình cài chính thức của Anthropic (không npm).
 *   4. fixRules: lõi có "Cài AI" ⇒ chưa có AI thì mở thẳng màn Cài AI; nguồn 'local' chưa sẵn sàng ⇒ báo lỗi.
 *
 *   bash apps/desktop/test/run.sh
 */
const assert = require('node:assert');
const Module = require('node:module');
const { mkdtempSync, mkdirSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const orig = Module._load;
Module._load = function (req) {
  if (req === 'electron') return { app: { getPath: () => tmpdir(), isPackaged: false, getVersion: () => '0.0.0', on() {} } };
  return orig.apply(this, arguments);
};

const B = join(__dirname, '..', '.test-build');
const { runApiAgent, stripThink, API_PROVIDER } = require(join(B, 'runtime', 'apiRunner.js'));
const O = require(join(B, 'runtime', 'localAi', 'ollama.js'));
const CI = require(join(B, 'runtime', 'localAi', 'claudeInstall.js'));
const F = require(join(B, 'ui-fix', 'fixRules.js'));

let n = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); n++; console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '\n     ', e.message); }
}

(async () => {
  await t('ollama: gọi đúng địa chỉ truyền vào, không cần khoá, max_tokens, lọc <think>, chạy vòng công cụ', async () => {
    assert.ok(API_PROVIDER.ollama, 'phải có provider ollama');
    const reqs = [];
    const old = global.fetch;
    global.fetch = async (url, init) => {
      const body = JSON.parse(init.body);
      reqs.push({ url: String(url), body, auth: init.headers.authorization });
      if (reqs.length === 1) {
        return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '<think>nghĩ thầm</think>', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'dem_don', arguments: '{"bang":"Đơn hàng"}' } }] }, finish_reason: 'tool_calls' }] }));
      }
      return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '<think>xong rồi</think>Bảng Đơn hàng có 14 đơn.' }, finish_reason: 'stop' }] }));
    };
    const calls = [];
    try {
      const evs = [];
      for await (const e of runApiAgent({
        runnerId: 'ollama', apiKey: '', model: 'qwen3:8b', base: 'http://127.0.0.1:11435/v1',
        system: 'sys', prompt: 'Bảng Đơn hàng có bao nhiêu đơn?',
        tools: [{ name: 'dem_don', description: 'đếm', parameters: { type: 'object', properties: { bang: { type: 'string' } } } }],
        execTool: async (name, input) => { calls.push([name, input]); return { count: 14 }; },
      })) evs.push(e);
      assert.strictEqual(reqs[0].url, 'http://127.0.0.1:11435/v1/chat/completions');
      assert.strictEqual(reqs[0].body.model, 'qwen3:8b');
      assert.ok('max_tokens' in reqs[0].body && !('max_completion_tokens' in reqs[0].body), 'Ollama dùng max_tokens');
      assert.deepStrictEqual(calls, [['dem_don', { bang: 'Đơn hàng' }]]);
      assert.strictEqual(reqs.length, 2, 'gửi lại kết quả công cụ rồi mới có câu trả lời');
      const text = evs.filter((e) => e.type === 'text').map((e) => e.delta).join('');
      assert.strictEqual(text, 'Bảng Đơn hàng có 14 đơn.', 'không lộ khối <think>');
      assert.ok(!evs.some((e) => e.type === 'error'), 'không đòi API key');
    } finally { global.fetch = old; }
  });
  await t('stripThink: bỏ khối <think> đã đóng và khối chưa đóng ở đầu', () => {
    assert.strictEqual(stripThink('<think>a\nb</think>\nTrả lời'), 'Trả lời');
    assert.strictEqual(stripThink('<think>đang nghĩ dở'), '');
    assert.strictEqual(stripThink('Không có suy nghĩ'), 'Không có suy nghĩ');
  });

  await t('Ollama: link tải bản chính thức theo hệ điều hành (mac .tgz, Windows .zip, Linux tự cài)', () => {
    assert.match(O.downloadUrl('darwin'), /github\.com\/ollama\/ollama\/releases\/latest\/download\/ollama-darwin\.tgz$/);
    assert.match(O.downloadUrl('win32'), /ollama-windows-amd64\.zip$/);
    assert.strictEqual(O.downloadUrl('linux'), null);
  });
  await t('Ollama: tìm tệp chạy sau giải nén dù nằm trong thư mục con; cổng riêng 11435', () => {
    const d = mkdtempSync(join(tmpdir(), 'lw-oll-'));
    mkdirSync(join(d, 'bin'), { recursive: true });
    writeFileSync(join(d, 'bin', process.platform === 'win32' ? 'ollama.exe' : 'ollama'), '');
    assert.strictEqual(O.findOllamaBin(d), join(d, 'bin', process.platform === 'win32' ? 'ollama.exe' : 'ollama'));
    assert.strictEqual(O.findOllamaBin(join(d, 'khong-co')), null);
    assert.strictEqual(O.OWN_PORT, 11435, 'không giẫm lên Ollama người dùng tự cài ở 11434');
  });
  await t('Ollama: mô hình mặc định theo RAM; gợi ý đều có kích thước + RAM tối thiểu', () => {
    assert.strictEqual(O.defaultModelFor(8), 'qwen3:4b');
    assert.strictEqual(O.defaultModelFor(16), 'qwen3:8b');
    assert.strictEqual(O.defaultModelFor(64), 'qwen3:8b');
    for (const m of O.RECOMMENDED) assert.ok(m.sizeGb > 0 && m.minRamGb > 0 && m.id.includes(':'), m.id);
  });

  await t('Claude một bấm: trình cài CHÍNH THỨC của Anthropic, không npm', () => {
    const mac = CI.installCommand('darwin');
    assert.strictEqual(mac.cmd, '/bin/bash');
    assert.match(mac.args.join(' '), /curl -fsSL https:\/\/claude\.ai\/install\.sh \| bash/);
    const win = CI.installCommand('win32');
    assert.match(win.args.join(' '), /irm https:\/\/claude\.ai\/install\.ps1 \| iex/);
    assert.ok(!JSON.stringify([mac, win]).includes('npm'), 'không còn đòi Node/npm');
  });

  const R = (o = {}) => ({ id: 'claude', label: 'Claude CLI', installed: false, loggedIn: false, ...o });
  await t('fixRules: lõi có "Cài AI" ⇒ chưa có CLI thì nút sửa mở màn Cài AI; lõi cũ giữ hướng dẫn cài CLI', () => {
    const a = F.healthIssues({ runners: [R()], activeRunner: 'claude', runSource: 'cli', canSetupAi: true });
    assert.deepStrictEqual([a[0].level, a[0].fix, a[0].fixLabel], ['error', 'aiSetup', 'Cài AI']);
    const b = F.healthIssues({ runners: [R()], activeRunner: 'claude', runSource: 'cli' });
    assert.strictEqual(b[0].fix, 'runner:claude');
  });
  await t('fixRules: nguồn "AI trên máy" chưa sẵn sàng ⇒ lỗi mở Cài AI; sẵn sàng ⇒ không báo gì về CLI', () => {
    const a = F.healthIssues({ runners: [R()], activeRunner: 'claude', runSource: 'local', localReady: false, canSetupAi: true });
    assert.deepStrictEqual(a.map((x) => [x.id, x.fix]), [['local-ai', 'aiSetup']]);
    assert.deepStrictEqual(F.healthIssues({ runners: [R()], activeRunner: 'claude', runSource: 'local', localReady: true, canSetupAi: true }), []);
  });

  console.log(fail ? `\n${fail} BÀI HỎNG` : `\nTẤT CẢ ĐÚNG (${n})`);
  process.exit(fail ? 1 : 0);
})();
