/**
 * Nhận ra tệp CLI vừa tạo trong thư mục làm việc (màn "Trợ lý AI" chung).
 *
 * Ở đó agent KHÔNG có `create_file` — chỗ ấy cố ý không bắc cầu MCP, nó dùng `Write`/`Bash` sẵn
 * có của CLI. Tệp vẫn được tạo, chỉ là chẳng ai nói cho giao diện biết, nên người dùng nhận một
 * câu "đã lưu ở /var/folders/..." kèm đường dẫn họ không có cách nào mở. So ảnh chụp thư mục
 * TRƯỚC–SAU là cách bắt được mọi tệp, bằng bất kỳ đường nào nó tạo ra.
 */
const assert = require('node:assert');
const { mkdtempSync, writeFileSync, utimesSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { snapshotDir, newFilesSince } = require('../.test-build/runtime/lark/fileBuild.js');

(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tw-deliver-'));

  // Tệp người dùng ĐÍNH KÈM lên, có mặt trước lượt chạy.
  writeFileSync(join(dir, 'bang-goc.xlsx'), 'cu');
  const before = await snapshotDir(dir);
  assert.ok(before.has('bang-goc.xlsx'), 'ảnh chụp phải thấy tệp có sẵn');

  // Lượt chạy tạo ra: một tệp đáng gửi, một tệp rác, một tệp ẩn, một tệp rỗng.
  writeFileSync(join(dir, 'Báo cáo tháng 9.xlsx'), 'x'.repeat(500));
  writeFileSync(join(dir, 'nhap.log'), 'rác');
  writeFileSync(join(dir, '.ngam'), 'ẩn');
  writeFileSync(join(dir, 'rong.pdf'), '');

  let moi = await newFilesSince(dir, before);
  let ten = moi.map((f) => f.name);
  assert.deepStrictEqual(ten, ['Báo cáo tháng 9.xlsx'], `chỉ tệp đáng gửi mới lên thẻ, nhận được: ${ten}`);
  assert.strictEqual(
    moi[0].mime,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'phải suy đúng kiểu MIME từ đuôi tệp',
  );
  assert.strictEqual(moi[0].bytes, 500);
  console.log('✓ chỉ nhận tệp đáng gửi: bỏ .log, bỏ tệp ẩn, bỏ tệp rỗng');

  // Tệp có SẴN mà không đổi thì không được hiện lại ở lượt sau.
  assert.ok(!ten.includes('bang-goc.xlsx'), 'tệp đính kèm của người dùng bị nhận nhầm thành sản phẩm');

  // Nhưng tệp có sẵn ĐƯỢC GHI ĐÈ thì PHẢI hiện — "sửa lại cột ngày trong file vừa rồi" là việc
  // agent ghi đè đúng tệp cũ; chỉ xét tên mới thì người dùng tải lại đúng bản CHƯA sửa.
  const sau = (before.get('bang-goc.xlsx') + 5000) / 1000;
  writeFileSync(join(dir, 'bang-goc.xlsx'), 'đã sửa');
  utimesSync(join(dir, 'bang-goc.xlsx'), sau, sau);
  moi = await newFilesSince(dir, before);
  ten = moi.map((f) => f.name);
  assert.ok(ten.includes('bang-goc.xlsx'), 'tệp bị ghi đè PHẢI hiện lại, nếu không người dùng tải bản cũ');
  console.log('✓ tệp bị ghi đè cũng hiện lại (bản sửa, không phải bản cũ)');

  // Thư mục không tồn tại thì không được nổ.
  assert.deepStrictEqual([...(await snapshotDir(join(dir, 'khong-co')))], []);
  assert.deepStrictEqual(await newFilesSince(join(dir, 'khong-co'), new Map()), []);
  console.log('✓ thư mục chưa có thì trả rỗng, không ném lỗi');

  // Trần số thẻ: một lượt lỡ sinh nhiều tệp thì hội thoại không được ngập.
  const d2 = mkdtempSync(join(tmpdir(), 'tw-deliver2-'));
  for (let i = 0; i < 30; i += 1) writeFileSync(join(d2, `f${i}.csv`), 'a');
  assert.strictEqual((await newFilesSince(d2, new Map())).length, 10, 'phải chặn ở 10 thẻ mỗi lượt');
  console.log('✓ trần 10 thẻ mỗi lượt');
})();
