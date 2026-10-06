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
Module._load = function (req) {
  if (req === 'electron') return { app: { getVersion: () => CURRENT } };
  return orig.apply(this, arguments);
};
const VH_PATH = require.resolve('../.test-build/runtime/versionHint.js');
/** Nạp LẠI module cho mỗi ca: ảnh chụp là trạng thái ở tầng module, và nay prime CỐ Ý không ghi đè
 *  ảnh chụp tốt — nên dùng chung một instance thì ca sau sẽ thừa hưởng ca trước. */
function freshVh() {
  delete require.cache[VH_PATH];
  return require(VH_PATH);
}

const cases = [
  { name: 'đang ở bản mới nhất → im lặng', cur: '1.0.284', facts: { latestVersion: '1.0.284', mainChangedAt: '1.0.284' }, wantNote: false, wantMainFix: false },
  { name: 'cũ hơn + bản mới sửa lõi → nhắc cài lại', cur: '1.0.283', facts: { latestVersion: '1.0.284', mainChangedAt: '1.0.284', notice: 'Sửa lỗi HTTP 400' }, wantNote: true, wantMainFix: true },
  { name: 'cũ hơn nhưng lõi đã có bản vá → vẫn báo có bản mới, KHÔNG doạ cài lại', cur: '1.0.284', facts: { latestVersion: '1.0.285', mainChangedAt: '1.0.284' }, wantNote: true, wantMainFix: false },
  { name: 'so số chứ không so chuỗi (9 < 10)', cur: '1.0.9', facts: { latestVersion: '1.0.10', mainChangedAt: '1.0.10' }, wantNote: true, wantMainFix: true },
  { name: 'không lấy được manifest → im lặng', cur: '1.0.283', facts: null, wantNote: false, wantMainFix: false },
  { name: 'manifest thiếu latestVersion → im lặng', cur: '1.0.283', facts: { notice: 'x' }, wantNote: false, wantMainFix: false },
  { name: 'bản cài MỚI HƠN máy chủ (bản thử nghiệm) → im lặng', cur: '1.0.290', facts: { latestVersion: '1.0.284', mainChangedAt: '1.0.284' }, wantNote: false, wantMainFix: false },
];

(async () => {
  let bad = 0;
  for (const c of cases) {
    CURRENT = c.cur;
    const vh = freshVh();
    vh.primeVersionSnapshot(c.facts);
    const snap = await vh.versionSnapshot();
    const note = await vh.toolFailureVersionNote();
    const line = await vh.versionPromptLine();
    const okNote = !!note === c.wantNote;
    const okFix = snap.mainFixPending === c.wantMainFix;
    const okCur = snap.current === c.cur;
    const pass = okNote && okFix && okCur;
    if (!pass) bad++;
    console.log(`${pass ? '✓' : '✗'} ${c.name}`);
    if (!pass) console.log(`   snap=${JSON.stringify(snap)}\n   note=${note ? 'CÓ' : 'không'}`);
    if (c.wantNote && pass) console.log(`   → ${note.replace(/\s+/g, ' ').slice(0, 150)}…`);
    if (pass && !c.wantNote) console.log(`   → prompt: ${line.slice(0, 90)}`);
  }
  console.log(bad ? `\nHỎNG ${bad}/${cases.length}` : `\nĐẠT ${cases.length}/${cases.length}`);
  process.exit(bad ? 1 : 0);
})();
