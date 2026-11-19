/**
 * Nguồn chạy (0.1.24): người dùng TỰ cài AI trong app ("Cài AI") — không tự chuyển sang AI máy chủ.
 *   1. pickRunSource: chưa có CLI + đã cài AI trên máy ⇒ 'local'; 'maic' chỉ khi tự chọn; lựa chọn đã lưu thắng.
 *   2. runLarkMaicAgent KHÔNG có client (chỉ phiên web): gửi đúng bộ công cụ phiên web lên máy chủ,
 *      không lọt công cụ Open API (sẽ chết vì thiếu client), và nằm dưới trần 64 công cụ của máy chủ.
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

const B = join(__dirname, '..', '.test-build', 'runtime', 'lark');
const { pickRunSource } = require(join(B, 'runSource.js'));
const T = require(join(B, 'tools', 'index.js'));
const { runLarkMaicAgent } = require(join(B, 'larkMaicAgent.js'));

let n = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); n++; console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '\n     ', e.message); }
}

(async () => {
  await t('máy chưa CLI nhưng đã cài AI trên máy (Ollama + mô hình) ⇒ local — không cần AI máy chủ', () => {
    assert.strictEqual(pickRunSource({ runnerReady: false, localReady: true }), 'local');
  });
  await t('đã có CLI sẵn sàng ⇒ cli (dùng gói AI của chính họ), kể cả khi có AI trên máy', () => {
    assert.strictEqual(pickRunSource({ runnerReady: true, localReady: true }), 'cli');
  });
  await t('KHÔNG BAO GIỜ tự chọn Gói Larkwave (AI máy chủ) — chỉ khi người dùng tự chọn', () => {
    for (const f of [{ runnerReady: false, localReady: false }, { runnerReady: true, localReady: false }, { runnerReady: false, localReady: true }]) {
      assert.notStrictEqual(pickRunSource(f), 'maic');
    }
    assert.strictEqual(pickRunSource({ chosen: 'maic', runnerReady: true, localReady: true }), 'maic');
  });
  await t('lựa chọn đã lưu THẮNG mọi dữ kiện; cờ cũ apiMode ⇒ api; không có gì ⇒ cli (hướng dẫn Cài AI)', () => {
    assert.strictEqual(pickRunSource({ chosen: 'cli', runnerReady: false, localReady: true }), 'cli');
    assert.strictEqual(pickRunSource({ chosen: 'local', runnerReady: true, localReady: false }), 'local');
    assert.strictEqual(pickRunSource({ apiMode: true, runnerReady: false, localReady: true }), 'api');
    assert.strictEqual(pickRunSource({ runnerReady: false, localReady: false }), 'cli');
  });

  await t('MAIC KHÔNG có client: gửi bộ công cụ phiên web (≤ 64), không lọt công cụ Open API', async () => {
    const web = T.agentTools({ withOpenApi: false, mode: 'build' }).map((x) => x.name).sort();
    const openApiOnly = T.agentTools({ withOpenApi: true, mode: 'build' }).map((x) => x.name).filter((x) => !web.includes(x));
    assert.ok(openApiOnly.length > 0, 'phải có công cụ chỉ dành cho Open API để phép thử có nghĩa');
    let body = null;
    const results = [];
    const sse = (evs) => new ReadableStream({ start(c) { for (const e of evs) c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(e)}\n\n`)); c.close(); } });
    const oldFetch = global.fetch;
    global.fetch = async (url, init) => {
      if (String(url).endsWith('/agent/maic-tools')) {
        body = JSON.parse(init.body);
        // model gọi một công cụ Open API (không có trong bộ phiên web) → phải nhận lại kết quả LỖI, không treo
        return new Response(sse([{ type: 'run', runId: 'r1' }, { type: 'tool_use', id: 'tu1', name: 'bitable_create_record', input: {} }, { type: 'delta', text: 'xong' }, { type: 'done' }]), { status: 200 });
      }
      if (String(url).includes('/agent/maic-tools/r1/result')) { results.push(JSON.parse(init.body)); return new Response('{}'); }
      throw new Error('fetch lạ: ' + url);
    };
    try {
      const evs = [];
      for await (const e of runLarkMaicAgent('Tóm tắt bảng Đơn hàng', 'build', {
        systemPrompt: 'sys',
        accountToken: 'tok',
        autoApprove: false,
        awaitConfirm: async () => true,
        baseTools: (m) => T.agentTools({ withOpenApi: false, mode: m }),
      })) evs.push(e);
      const sent = body.tools.map((x) => x.name).sort();
      assert.deepStrictEqual(sent, web, 'bộ công cụ gửi lên phải đúng bộ phiên web');
      assert.ok(sent.length <= 64, `quá trần 64 của máy chủ: ${sent.length}`);
      for (const x of openApiOnly) assert.ok(!sent.includes(x), `lọt công cụ Open API: ${x}`);
      assert.strictEqual(results.length, 1, 'phải trả kết quả cho lời gọi công cụ');
      assert.strictEqual(results[0].isError, true, 'công cụ không có phải trả về LỖI để model tự xoay');
      assert.ok(evs.some((e) => e.type === 'text' && e.delta === 'xong'));
      assert.strictEqual(evs[evs.length - 1].type, 'done');
    } finally {
      global.fetch = oldFetch;
    }
  });

  console.log(fail ? `\n${fail} BÀI HỎNG` : `\nTẤT CẢ ĐÚNG (${n})`);
  process.exit(fail ? 1 : 0);
})();
