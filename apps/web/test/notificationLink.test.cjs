/**
 * Kiểm bộ nắn link thông báo. Chạy: node apps/web/test/notificationLink.test.cjs
 * Biên dịch trước, từ GỐC repo:
 *   npx tsc apps/web/src/lib/notificationLink.ts --outDir .tmp-test --module commonjs --target es2020
 */
// apps/web/test → lên 3 cấp mới tới gốc repo (apps/web/test → apps/web → apps → gốc).
const { join } = require('node:path');
const { normalizeNotificationLink: f } = require(join(__dirname, '../../../.tmp-test/notificationLink.js'));
const cases = [
  ['/video/library?id=abc', '/marketing/video/library?id=abc'],
  ['/picture/library?id=x', '/marketing/picture/library?id=x'],
  ['/blog/library', '/marketing/blog/library'],
  ['/video/library', '/marketing/video/library'],
  // đã đúng rồi thì KHÔNG được nắn lần nữa (nếu không sẽ thành /marketing/marketing/...)
  ['/marketing/video/library?id=abc', '/marketing/video/library?id=abc'],
  // không đụng vào link khác
  ['/reports', '/reports'],
  ['/friends?chat=u1', '/friends?chat=u1'],
  ['/apps/abc', '/apps/abc'],
  // không khớp nhầm tiền tố giống nhau
  ['/videos/library', '/videos/library'],
  ['/video/librarian', '/video/librarian'],
];
let bad = 0;
for (const [inp, want] of cases) {
  const got = f(inp);
  if (got !== want) { bad++; console.log('✗', inp, '→', got, '(mong', want + ')'); }
  else console.log('✓', inp, '→', got);
}
console.log(bad ? `\nHỎNG ${bad}` : `\nĐẠT ${cases.length} ca`);
process.exit(bad ? 1 : 0);
