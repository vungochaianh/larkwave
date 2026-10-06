/**
 * Nút hành động rút từ câu trả lời của trợ lý.
 *
 * Luật nền: THÀ BỎ SÓT CÒN HƠN BẮT NHẦM. Một nút hiện sai chỗ sẽ gửi đi câu người dùng không hề
 * định gửi — tệ hơn hẳn việc họ phải gõ tay. Nên phần lớn ca dưới đây là ca PHẢI IM.
 */
const assert = require('node:assert');
const { extractChoices, needsExecuteMode } = require('../.test-build/ui/answerActions.js');

let pass = 0;
const t = (name, fn) => { fn(); pass += 1; console.log('  ✓', name); };

console.log('extractChoices — phải BẮT');
t('ca thật từ ảnh người dùng gửi', () => {
  const s = 'Bạn muốn tôi làm gì tiếp: (a) dừng và để agent Thực thi xử lý toàn bộ, hay (b) tôi phân tích mẫu cho một số MKH cụ thể bạn chỉ định?';
  const c = extractChoices(s);
  assert.strictEqual(c.length, 2);
  assert.strictEqual(c[0].key, 'a');
  assert.strictEqual(c[0].text, 'dừng và để agent Thực thi xử lý toàn bộ');
  assert.strictEqual(c[1].text, 'tôi phân tích mẫu cho một số MKH cụ thể bạn chỉ định');
});
t('chỉ đọc ĐOẠN CUỐI, bỏ qua phần phân tích phía trên', () => {
  const s = 'Phân tích dài (a) không phải lựa chọn (b) cũng không.\n\nBạn chọn: (a) làm ngay, hay (b) xem trước?';
  const c = extractChoices(s);
  assert.strictEqual(c.length, 2);
  assert.strictEqual(c[0].text, 'làm ngay');
});
t('ba lựa chọn, và số thay vì chữ', () => {
  assert.strictEqual(extractChoices('Chọn: (a) A, (b) B, (c) C?').length, 3);
  assert.strictEqual(extractChoices('Chọn: (1) một, (2) hai?').length, 2);
});
t('bỏ đánh dấu markdown khỏi nhãn nút', () => {
  const c = extractChoices('Chọn: (a) **chạy thật**, hay (b) `xem trước`?');
  assert.strictEqual(c[0].text, 'chạy thật');
  assert.strictEqual(c[1].text, 'xem trước');
});

console.log('extractChoices — phải IM');
t('không có dấu hỏi ⇒ không phải câu hỏi lựa chọn', () => {
  assert.deepStrictEqual(extractChoices('Có hai cách: (a) cách một, (b) cách hai.'), []);
});
t('chỉ một nhãn ⇒ không phải lựa chọn', () => {
  assert.deepStrictEqual(extractChoices('Xem mục (a) trong tài liệu nhé?'), []);
});
t('nhãn trùng ⇒ là trích dẫn, không phải lựa chọn', () => {
  assert.deepStrictEqual(extractChoices('Theo điều (a) và điều (a) thì sao?'), []);
});
t('đoạn cuối quá dài ⇒ là phân tích, không phải câu hỏi chốt', () => {
  const s = 'x'.repeat(750) + ' (a) một, (b) hai?';
  assert.deepStrictEqual(extractChoices(s), []);
});
t('một lựa chọn rỗng ⇒ bỏ cả cụm', () => {
  assert.deepStrictEqual(extractChoices('Chọn: (a) , (b) ?'), []);
});
t('chuỗi rỗng / không có gì', () => {
  assert.deepStrictEqual(extractChoices(''), []);
  assert.deepStrictEqual(extractChoices('Đã chạy xong, không có gì cần hỏi thêm.'), []);
});
t('danh sách đánh số thường KHÔNG bị bắt (nó là đề xuất, không phải lựa chọn)', () => {
  assert.deepStrictEqual(extractChoices('Đề xuất:\n\n1. Làm cái này.\n2. Hoặc cái kia?'), []);
});

console.log('needsExecuteMode');
t('nhận ra các câu trợ lý thật sự nói khi bị chặn quyền ghi', () => {
  for (const s of [
    'Tôi đang ở chế độ **Hỏi đáp (chỉ đọc)** — không có quyền tạo bản ghi.',
    'bạn bật **chế độ Thực thi** để tôi tạo thật',
    'Vui lòng chuyển sang Thực thi rồi thử lại.',
    'Tôi không có quyền ghi vào bảng này.',
    'Tôi không thể ghi dữ liệu ở chế độ hiện tại.',
  ]) assert.ok(needsExecuteMode(s), s);
});
t('KHÔNG bắt câu chỉ nhắc tới việc thực thi một cách bình thường', () => {
  for (const s of [
    'Đã thực thi xong 12 bản ghi.',
    'Tôi đã ghi dữ liệu vào bảng 4.1.3 thành công.',
    'Kết quả: 192 bản ghi.',
    '',
  ]) assert.ok(!needsExecuteMode(s), s);
});

console.log(`\n${pass} ca đạt.`);
