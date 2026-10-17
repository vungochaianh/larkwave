/**
 * Claude CLI ĐÓNG BĂNG lời nhắc hệ thống + bộ công cụ của một phiên ở lượt đầu (đo thật 10/10/2026,
 * CLI 2.1.295: tạo phiên với "mật mã ALPHA", `--resume` kèm "BETA" → vẫn "ALPHA", kể cả --fork-session).
 * Lỗi người dùng gặp: hội thoại chép từ Toolswave trả lời "bạn đang ở chế độ Hỏi đáp (chỉ đọc)" và
 * không thấy công cụ xoá — vì `--resume` chạy bằng lời nhắc Toolswave cũ chụp từ 06/10.
 *
 *   bash apps/desktop/test/run.sh
 */
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { buildTurnContextBlock, buildWebSessionPrompt, nowLine } = require('../.test-build/runtime/lark/systemPrompt.js');

const block = buildTurnContextBlock({
  bases: [{ appToken: 'YppHb', name: 'Base Test' }],
  me: { name: 'Deveris' },
  auto: true,
  layout: 'chat',
  versionLine: 'Bản cài đang chạy: 0.1.1.',
  skills: '=== KỸ NĂNG ===\n/xuat-bang: …',
});
assert.ok(block.startsWith('[NGỮ CẢNH LƯỢT NÀY'), 'mở đầu bằng nhãn để model biết khối này thắng thông tin cũ');
assert.ok(block.includes('«Base Test» — token = YppHb'));
assert.ok(block.includes('Deveris'));
assert.ok(block.includes('CHẾ ĐỘ: TỰ ĐỘNG'));
assert.ok(block.includes('/xuat-bang'), 'kỹ năng đi ở khối từng lượt (lời nhắc hệ thống không tới được các lượt sau)');
assert.ok(block.endsWith('[HẾT NGỮ CẢNH — yêu cầu của người dùng ở dưới]'));
assert.ok(!/Hỏi đáp|HỎI ĐÁP|chế độ "Thực thi"/.test(block));
const off = buildTurnContextBlock({ bases: [], auto: false });
assert.ok(off.includes('CHƯA CHỌN BASE') && off.includes('HỎI TRƯỚC KHI GHI') && !off.includes('Người dùng đang đăng nhập'));
console.log('✓ buildTurnContextBlock: Base / tài khoản / chế độ Tự động / kỹ năng ở đầu MỖI lượt, không nhắc chế độ Hỏi đáp');

// Giờ hiện tại (giờ Việt Nam) ở MỖI lượt — người dùng đặt "cứ 1 phút gửi giờ hiện tại", agent đáp "mình không có đồng hồ".
// 2026-10-17T07:05:09Z = 14:05:09 Thứ Bảy 17/10/2026 ở Việt Nam; 2026-10-17T18:30:00Z đã sang Chủ nhật 18/10 ở VN.
assert.strictEqual(nowLine(new Date('2026-10-17T07:05:09Z')), 'Bây giờ là 14:05:09, Thứ Bảy 17/10/2026 (giờ Việt Nam, UTC+7).');
assert.match(nowLine(new Date('2026-10-17T18:30:00Z')), /^Bây giờ là 01:30:00, Chủ nhật 18\/10\/2026/);
assert.ok(buildTurnContextBlock({ bases: [], now: new Date('2026-10-17T07:05:09Z') }).includes('- Bây giờ là 14:05:09, Thứ Bảy 17/10/2026'));
assert.ok(/CHỈ thao tác XOÁ là ứng dụng còn hiện hộp xác nhận/.test(block) && !/Xoá \/ sửa \/ ghi đè \/ gửi tin: cứ GỌI TOOL/.test(block), 'Tự động BẬT: chỉ xoá còn hỏi');
const srcT = readFileSync(join(__dirname, '..', 'main', 'runtime', 'lark', 'larkService.ts'), 'utf8');
assert.ok(/const runText = ctx \? `\[\$\{nowLine\(\)\}\]/.test(srcT), 'lượt tự động hoá kèm giờ của chính lần chạy');
console.log('✓ giờ hiện tại (giờ VN) ở mỗi lượt chat + mỗi lần lịch chạy; Tự động BẬT = chỉ xoá còn hỏi');

// Lời nhắc hệ thống (phiên web) dùng ĐÚNG câu chữ của khối từng lượt — hai nơi không được lệch nhau.
const sys = buildWebSessionPrompt({ bases: [{ appToken: 'YppHb', name: 'Base Test' }], auto: true, standalone: true });
for (const line of block.split('\n').slice(1, 2)) assert.ok(sys.includes(line.replace(/^- /, '')), line);
assert.ok(/Larkwave KHÔNG có chế độ "Hỏi đáp"\/"Thực thi"/.test(sys));
assert.ok(/lark_web_delete/.test(sys) && !/KHÔNG được tìm cách BẬT, XOÁ/.test(sys), 'xoá đi qua lark_web_delete; luật cấm bật/xuất bản vẫn còn');
assert.ok(/KHÔNG được tìm cách BẬT, XUẤT BẢN hay CHẠY THỬ/.test(sys));
console.log('✓ lời nhắc phiên web: không có chế độ Hỏi đáp/Thực thi, xoá qua lark_web_delete, vẫn cấm bật/xuất bản workflow');

// Chốt trong mã của chat(): lệch dấu vân tay ⇒ phiên mới; kỹ năng không còn gắn vào lời nhắc hệ thống.
const src = readFileSync(join(__dirname, '..', 'main', 'runtime', 'lark', 'larkService.ts'), 'utf8');
const rot = src.match(/if \(ts\.started && ts\.promptPrint !== print\) \{([\s\S]{0,160}?)\}/);
assert.ok(rot && /ts\.started = false/.test(rot[1]) && /ts\.agentSessionId = randomUUID\(\)/.test(rot[1]), 'lệch dấu ⇒ id phiên mới + started:false (không --resume ảnh chụp cũ)');
assert.ok(/ts\.promptPrint = print;/.test(src), 'nhớ dấu của phiên mới');
assert.ok(!/\)\) \+ skillsBlock;/.test(src), 'skillsBlock KHÔNG được gắn vào lời nhắc hệ thống nữa');
assert.ok(/buildTurnContextBlock\(\{ bases: turnBases/.test(src), 'mỗi lượt Lark có khối ngữ cảnh');
assert.ok(/promptPrint: this\.turnState\.get\(id\)\?\.promptPrint/.test(src), 'dấu vân tay được ghi vào tệp hội thoại');
console.log('✓ chat(): lệch dấu vân tay luật/công cụ ⇒ mở phiên mới + mồi lịch sử; dấu được lưu cùng hội thoại');
