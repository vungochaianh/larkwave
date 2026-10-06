/**
 * Chốt "tệp có nằm trong thư mục cho phép không" — và bài kiểm gọi ĐÚNG HÀM THẬT.
 *
 * Bản trước của bài kiểm này CHÉP LẠI luật rồi tự kiểm bản chép. Nó vẫn xanh kể cả khi mã thật đã
 * hỏng, vì nó chỉ kiểm chính nó. Nay luật ở `filePaths.isInsideDir`, hai nơi dùng đều gọi vào đó,
 * và bài kiểm cũng gọi vào đó — hỏng một chỗ là hỏng cả ba.
 *
 * Vì sao chốt này là bảo mật chứ không phải tiện ích: `path` tới từ lượt chạy của model. Không
 * chốt thì `send_file` gửi được khoá SSH vào một nhóm Lark, và `shell.openPath` lên tệp thực thi
 * là CHẠY nó.
 */
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const { join, sep } = require('node:path');
const { isInsideDir } = require('../.test-build/runtime/lark/filePaths.js');

const ROOT = join(sep, 'Users', 'ai', 'Library', 'Application Support', '@toolswave', 'desktop', 'lark', 'work');

// ── Phải CHO QUA ─────────────────────────────────────────────────────────────────────
assert.ok(isInsideDir(ROOT, join(ROOT, 'conv-1', 'Báo cáo thu tiền.xlsx')), 'tệp hợp lệ bị chặn oan');
assert.ok(isInsideDir(ROOT, join(ROOT, 'sched-files', 'Bao cao.pdf')), 'tệp của lượt theo lịch bị chặn oan');
assert.ok(isInsideDir(ROOT, ROOT), 'chính thư mục gốc phải qua');

// ── Phải CHẶN ────────────────────────────────────────────────────────────────────────
for (const [p, vi] of [
  [join(sep, 'etc', 'passwd'), 'đường dẫn tuyệt đối ngoài thư mục'],
  [join(ROOT, '..', '..', '..', '..', '.ssh', 'id_rsa'), 'leo lên bằng ..'],
  [join(ROOT, 'conv-1', '..', '..', '..', '..', '..', '.env'), '.. lồng sâu trong đường dẫn hợp lệ'],
  [`${ROOT}-khac${sep}x.xlsx`, 'thư mục CÙNG TIỀN TỐ nhưng khác — bẫy của startsWith trần'],
  ['', 'đường dẫn rỗng'],
  [null, 'null'],
]) {
  assert.ok(!isInsideDir(ROOT, p), `PHẢI chặn (${vi}): ${p}`);
}
assert.ok(!isInsideDir(null, join(ROOT, 'a.xlsx')), 'chưa có thư mục gốc thì phải chặn hết');
console.log('✓ isInsideDir: cho qua tệp thật, chặn .. / ngoài thư mục / bẫy cùng-tiền-tố');

// ── Hai nơi dùng phải THẬT SỰ gọi vào đó, không quay lại tự so chuỗi ─────────────────
const R = join(__dirname, '..', 'main');
const files = readFileSync(join(R, 'runtime', 'lark', 'tools', 'files.ts'), 'utf8');
const bg = readFileSync(join(R, 'background.ts'), 'utf8');

const than = files.slice(files.indexOf("name: 'send_file'"));
assert.ok(/isInsideDir\(OUT_DIR, p\)/.test(than), 'send_file phải chốt qua isInsideDir');
assert.ok(!/startsWith\(/.test(than), 'send_file không được tự so chuỗi nữa');

const hbody = bg.slice(bg.indexOf('IPC.openLocalFile'), bg.indexOf('IPC.openLocalFile') + 1200);
assert.ok(/isInsideDir\(root, target\)/.test(hbody), 'handler mở tệp phải chốt qua isInsideDir');
assert.ok(/'lark', 'work'/.test(hbody), 'handler phải chốt theo userData/lark/work');
assert.ok(!/startsWith\(/.test(hbody), 'handler không được tự so chuỗi nữa');
console.log('✓ cả send_file lẫn handler IPC đều gọi vào hàm chung, không còn bản chép nào');

// ── Phân loại thao tác: cái nào cần hỏi, cái nào không ───────────────────────────────
assert.ok(/name: 'send_file'[\s\S]{0,3000}gated: true/.test(files), 'send_file phải gated — tệp đi ra ngoài');
assert.ok(/name: 'create_file'[\s\S]{0,3000}gated: false/.test(files), 'create_file không nên gated — chỉ ghi thư mục tạm');
console.log('✓ send_file có hỏi xác nhận, create_file thì không (chặn ở đó là chặn mọi lịch chạy)');
