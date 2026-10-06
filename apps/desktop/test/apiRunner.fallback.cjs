/**
 * Kiểm đường lui khi tệp đính kèm vượt giới hạn của model.
 *
 * PDF có trần 600 trang, nhưng tụt xuống 100 khi model dưới 1M ngữ cảnh — mà người dùng đổi được
 * model. Không có đường lui thì một tệp quá khổ giết cả lượt chat, tức đưa tệp vào còn TỆ HƠN
 * trước khi có tính năng. Ở đây giả lập một API luôn trả 400 cho request có tệp, và khẳng định:
 * lượt chat vẫn chạy tiếp, và model được nói rõ là chưa xem được tệp.
 *
 *   bash apps/desktop/test/run.sh
 */
const { runApiAgent } = require('../.test-build/runtime/apiRunner.js');

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const { writeFileSync, mkdtempSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const dir = mkdtempSync(join(tmpdir(), 'tw-fb-'));
const pdfPath = join(dir, 'a.pdf');
writeFileSync(pdfPath, PNG);

let requests = [];
const origFetch = global.fetch;
global.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  requests.push(body);
  const hasDoc = JSON.stringify(body.messages).includes('"document"');
  if (hasDoc) {
    // Model 200K từ chối PDF quá số trang.
    return { ok: false, status: 400, text: async () => '{"error":{"message":"too many pages"}}' };
  }
  // Lượt 1: yêu cầu gọi tool. Lượt sau: trả lời bằng chữ.
  const round = requests.length;
  if (round === 1) {
    return { ok: true, json: async () => ({
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 'tu_1', name: 'doc_tool', input: {} }],
    }) };
  }
  return { ok: true, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'xong' }] }) };
};

(async () => {
  let bad = 0;
  const ok = (n, c, e) => { if (!c) { bad++; console.log('✗', n, e ?? ''); } else console.log('✓', n); };
  let text = '';
  try {
    for await (const ev of runApiAgent({
      runnerId: 'claude',
      apiKey: 'test',
      system: 's',
      prompt: 'đọc pdf',
      tools: [{ name: 'doc_tool', description: 'd', parameters: { type: 'object' } }],
      execTool: async () => ({ ok: true, kind: 'pdf', path: pdfPath, mime: 'application/pdf', size: PNG.length }),
    })) {
      if (ev.type === 'text') text += ev.delta;
    }
  } catch (e) {
    bad++; console.log('✗ lượt chat CHẾT thay vì suy giảm êm:', String(e.message).slice(0, 120));
  }
  ok('lượt chat chạy tới cùng dù PDF bị từ chối', text.includes('xong'), `text=${JSON.stringify(text)}`);
  const last = JSON.stringify(requests[requests.length - 1]);
  ok('request cuối KHÔNG còn khối document', !last.includes('"document"'));
  ok('model được báo rõ là chưa xem được tệp', last.includes('chưa xem được tệp'));
  ok('có đúng một lần thử lại (3 request: gọi tool → 400 → thử lại)', requests.length === 3, `số request=${requests.length}`);

  global.fetch = origFetch;
  console.log(bad ? `\nHỎNG ${bad}` : '\nĐẠT tất cả');
  process.exit(bad ? 1 : 0);
})();
