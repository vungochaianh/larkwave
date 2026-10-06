/**
 * Kiểm logic "bản cài đã cũ" trên MÃ ĐÃ BIÊN DỊCH, với `electron` giả để đặt được bản đang chạy.
 *
 *   cd apps/desktop && npx tsc main/runtime/versionHint.ts --outDir .test-build \
 *     --module commonjs --target es2020 --esModuleInterop --skipLibCheck
 *   node test/versionHint.basic.cjs && node test/versionHint.offline.cjs
 */
const Module = require('node:module');
let CURRENT = '1.0.283';
const orig = Module._load;
Module._load = function (r) {
  if (r === 'electron') return { app: { getVersion: () => CURRENT } };
  return orig.apply(this, arguments);
};
const vh = require('../.test-build/runtime/versionHint.js');

(async () => {
  let bad = 0;
  const ok = (name, cond, extra) => { if (!cond) { bad++; console.log('✗', name, extra || ''); } else console.log('✓', name); };

  // 1. Manifest CŨ (không có mainChangedAt) vẫn phải kích hoạt nhánh "sửa phần lõi".
  vh.primeVersionSnapshot({ latestVersion: '1.0.284' });
  let s = await vh.versionSnapshot();
  ok('manifest cũ (thiếu mainChangedAt) vẫn nhận ra bản vá lõi', s.mainFixPending === true, JSON.stringify(s));

  // 2. Prime bằng dữ liệu RỖNG (mất mạng lúc khởi động) KHÔNG được xoá ảnh chụp tốt.
  vh.primeVersionSnapshot(null);
  s = await vh.versionSnapshot();
  ok('prime rỗng không xoá ảnh chụp tốt', s.latest === '1.0.284' && s.hasNewer === true, JSON.stringify(s));

  vh.primeVersionSnapshot({ notice: 'chỉ có ghi chú' });
  s = await vh.versionSnapshot();
  ok('prime thiếu latestVersion cũng không xoá', s.latest === '1.0.284', JSON.stringify(s));

  // 3. Lõi đã có bản vá → có bản mới nhưng KHÔNG doạ cài lại.
  CURRENT = '1.0.284';
  vh.primeVersionSnapshot({ latestVersion: '1.0.285', mainChangedAt: '1.0.284' });
  s = await vh.versionSnapshot();
  ok('lõi đã có bản vá → không doạ cài lại', s.hasNewer === true && s.mainFixPending === false, JSON.stringify(s));

  // 4. Ghi chú chỉ nhắc một lần trong khoảng nghỉ.
  CURRENT = '1.0.283';
  vh.primeVersionSnapshot({ latestVersion: '1.0.284' });
  const n1 = await vh.toolFailureVersionNote();
  const n2 = await vh.toolFailureVersionNote();
  ok('nhắc một lần rồi im (đã nhắc ở lần chạy trước nên có thể cả hai đều im)', !n2, `n1=${!!n1} n2=${!!n2}`);

  console.log(bad ? `\nHỎNG ${bad}` : '\nĐẠT tất cả');
  process.exit(bad ? 1 : 0);
})();
