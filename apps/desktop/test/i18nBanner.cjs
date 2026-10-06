/**
 * Bảng dịch THẮNG chuỗi mặc định — và đó là cách một bản sửa trở thành mã chết.
 *
 * Chuyện đã xảy ra: tôi sửa chữ trong băng cảnh báo ngữ cảnh ở `LarkChat.tsx` qua hai bản liền
 * (1.0.343 rồi 1.0.344), nhưng `tr('chat.contextWarnDesc', '…')` chỉ dùng chuỗi mặc định KHI KHOÁ
 * KHÔNG CÓ trong bảng dịch. Khoá đó đã có sẵn, nên người dùng vẫn đọc đúng câu cũ — "Tạo phiên
 * mới — agent tự tóm tắt để tiếp tục" — trong khi hành vi thật đã đổi thành tự nén tại chỗ.
 *
 * Tức băng cảnh báo NÓI SAI về chính app: nó bảo người dùng phải tự bấm, còn app thì đã tự làm.
 */
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const i18n = readFileSync(
  join(__dirname, '..', '..', '..', 'packages', 'ui', 'src', 'i18n.tsx'),
  'utf8',
);
const line = i18n.split('\n').find((l) => l.includes('"chat.contextWarnDesc"'));
assert.ok(line, 'không tìm thấy khoá chat.contextWarnDesc');

// Không được quay lại lối cũ: bảo người dùng tự tạo phiên mới.
assert.ok(!/Tạo phiên mới/.test(line), 'băng cảnh báo không được bảo người dùng tự tạo phiên mới');
assert.ok(!/Start a new session/i.test(line), 'bản tiếng Anh cũng vậy');
// Phải nói đúng hành vi: tự nén, giữ nguyên hội thoại.
assert.ok(/TỰ NÉN/.test(line), 'phải nói rõ app TỰ NÉN');
assert.ok(/trong cuộc trò chuyện này/.test(line), 'phải nói rõ giữ nguyên cuộc trò chuyện đang mở');
assert.ok(/AUTO-COMPACT/i.test(line), 'bản tiếng Anh phải nói auto-compact');
console.log('✓ băng cảnh báo ngữ cảnh nói ĐÚNG hành vi (tự nén tại chỗ), cả vi lẫn en');

// Và nút bên cạnh vẫn phải còn, cho ai muốn nén ngay thay vì đợi lượt sau.
assert.ok(/"chat.newSessionKeepSummary"/.test(i18n), 'vẫn giữ nút bấm tay');
console.log('✓ vẫn còn nút bấm tay cho ai muốn làm ngay');
