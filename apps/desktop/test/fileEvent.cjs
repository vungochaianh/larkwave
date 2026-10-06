/**
 * Thẻ tệp phải được phát ở CẢ HAI đường chạy tool.
 *
 * Lỗi đã xảy ra thật: tool chạy qua hai đường khác nhau, mỗi đường tự viết lại phần phát sự kiện —
 *
 *   • `toolBridge.execTool` — đường API trực tiếp
 *   • `mcpServer`           — lượt Lark qua Claude CLI, tức đường CHÍNH
 *
 * Lần đầu chỉ gắn vào `toolBridge`. Hậu quả nhìn từ ngoài chẳng liên quan gì tới nguyên nhân:
 * tệp vẫn được tạo, chip công cụ vẫn hiện, nhưng KHÔNG có thẻ tải — nên trợ lý tự đẩy tệp lên
 * Lark Drive cho người dùng còn lấy được, và người dùng báo "sao nó cứ tạo thẳng vào Lark, tìm
 * file khó quá".
 *
 * Bài kiểm giữ hai thứ: luật đúng, và CẢ HAI nơi đều gọi vào luật đó.
 */
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { fileEventFor } = require('../.test-build/runtime/lark/larkToolExec.js');

// ── Luật ─────────────────────────────────────────────────────────────────────────────
const ok = fileEventFor('create_file', {
  ok: true,
  file_name: 'Báo cáo thu tiền.xlsx',
  path: '/x/y/Báo cáo thu tiền.xlsx',
  mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  bytes: 4096,
  upload_id: 'up_123',
});
assert.ok(ok, 'create_file thành công phải sinh sự kiện');
assert.strictEqual(ok.type, 'file');
assert.strictEqual(ok.name, 'Báo cáo thu tiền.xlsx');
assert.strictEqual(ok.uploadId, 'up_123', 'phải chuyển tiếp upload_id → uploadId');
assert.strictEqual(ok.bytes, 4096);

// Không có bản trên máy chủ thì vẫn phát, chỉ là thiếu uploadId — tệp cục bộ vẫn mở được.
const noUp = fileEventFor('create_file', { file_name: 'a.csv', path: '/x/a.csv', mime: 'text/csv', bytes: 10 });
assert.ok(noUp && noUp.uploadId === undefined, 'thiếu upload_id vẫn phải phát thẻ');

// Tool KHÁC trả về `path` cũng không được nhận nhầm thành thẻ tệp.
assert.strictEqual(fileEventFor('drive_list_files', { path: '/x/a.xlsx', file_name: 'a.xlsx' }), null);
// Thiếu path hoặc thiếu tên thì không đủ để dựng thẻ.
assert.strictEqual(fileEventFor('create_file', { file_name: 'a.xlsx' }), null);
assert.strictEqual(fileEventFor('create_file', { path: '/x/a.xlsx' }), null);
assert.strictEqual(fileEventFor('create_file', null), null);
console.log('✓ fileEventFor: đúng tool + đủ dữ liệu mới phát, chuyển tiếp uploadId');

// ── Cả hai đường đều phải gọi vào đó ─────────────────────────────────────────────────
const R = join(__dirname, '..', 'main', 'runtime', 'lark');
for (const f of ['toolBridge.ts', 'mcpServer.ts']) {
  const src = readFileSync(join(R, f), 'utf8');
  assert.ok(
    /fileEventFor\(/.test(src),
    `${f} KHÔNG phát thẻ tệp — đây đúng là lỗi đã làm người dùng phải đi lục Lark Drive`,
  );
}
console.log('✓ cả toolBridge lẫn mcpServer đều phát thẻ tệp');

// ── Và trợ lý phải được dặn ĐỪNG tự đẩy lên Lark ─────────────────────────────────────
const tools = readFileSync(join(R, 'tools', 'files.ts'), 'utf8');
const desc = tools.slice(tools.indexOf("name: 'create_file'"), tools.indexOf('inputSchema'));
assert.ok(/KHÔNG tự đẩy tệp lên Lark/.test(desc), 'mô tả create_file phải cấm tự đẩy lên Lark');
assert.ok(/send_file khi người dùng nói RÕ/.test(desc), 'mô tả phải nói rõ khi nào mới được gửi đi');
console.log('✓ mô tả tool cấm tự đẩy lên Lark Drive/Base');
