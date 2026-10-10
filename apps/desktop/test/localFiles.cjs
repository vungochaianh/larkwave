/**
 * Bộ phân giải đường dẫn tệp của công cụ (filePaths.classifyLocalPath / resolveLocalFile +
 * fileContext.resolveToolFile) — ma trận cho phép/từ chối (cả dấu tách Windows), chép tệp từ thư mục
 * làm việc Toolswave (nguồn chỉ đọc, không ghi đè bản mới hơn), symlink thoát ra ngoài, tệp chạy được,
 * và ngữ cảnh tệp theo TỪNG lượt (AsyncLocalStorage) khi hai lượt chạy song song.
 *
 *   bash apps/desktop/test/run.sh
 */
const assert = require('node:assert');
const Module = require('node:module');
const path = require('node:path');
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync, utimesSync, statSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { createHash } = require('node:crypto');

const orig = Module._load;
Module._load = function (req) {
  if (req === 'electron') return { app: { getPath: () => tmpdir() }, safeStorage: { isEncryptionAvailable: () => false } };
  return orig.apply(this, arguments);
};

const B = path.join(__dirname, '..', '.test-build', 'runtime', 'lark');
const FP = require(path.join(B, 'filePaths.js'));
const FC = require(path.join(B, 'fileContext.js'));

let pass = 0;
let fail = 0;
const t = async (name, fn) => {
  try {
    await fn();
    pass++;
    console.log('  ✓', name);
  } catch (e) {
    fail++;
    console.log('  ✗', name, '\n     ', e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n      ') : e);
  }
};
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const put = (p, v) => {
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, v);
};

(async () => {
  // ── 1. ma trận PHÂN LOẠI (không đụng đĩa) — POSIX ─────────────────────────────────────────────
  const P = path.posix;
  const LW = '/Users/u/Library/Application Support/@larkwave/desktop';
  const TW = '/Users/u/Library/Application Support/@toolswave/desktop';
  const TWDEV = '/Users/u/Library/Application Support/@toolswave/desktop (development)';
  const OUT = `${LW}/lark/work/conv-now`;
  const AUTO = `${LW}/lark/automations/rule-1`;
  const known = new Set(['c3f9cd1c-0206-4559-98c7-628d9ce02078', 'conv-now']);
  const pol = (lib, o = {}) => ({
    roots: o.roots ?? [OUT, OUT, AUTO],
    larkwaveWorkRoot: 'lw' in o ? o.lw : `${LW}/lark/work`,
    toolswaveRoots: o.tw ?? [TW, TWDEV],
    conversationExists: (id) => known.has(id),
    lib,
  });

  await t('POSIX: CHO QUA tệp trong thư mục lượt / tự động hoá; tên tương đối hiểu theo thư mục lượt', () => {
    const a = FP.classifyLocalPath(`${OUT}/Báo cáo.xlsx`, pol(P));
    assert.strictEqual(a.kind, 'root');
    const b = FP.classifyLocalPath('Báo cáo.xlsx', pol(P));
    assert.strictEqual(b.kind, 'root');
    assert.strictEqual(b.abs, `${OUT}/Báo cáo.xlsx`);
    assert.strictEqual(FP.classifyLocalPath(`${AUTO}/inputs/a.csv`, pol(P)).kind, 'root');
    // dán kèm ngoặc «…» / "…" / file:// — model hay làm vậy
    assert.strictEqual(FP.classifyLocalPath(`«${OUT}/x.xlsx»`, pol(P)).kind, 'root');
    assert.strictEqual(FP.classifyLocalPath(`file://${encodeURI(OUT + '/x y.xlsx')}`, pol(P)).kind, 'root');
  });

  await t('POSIX: tệp trong thư mục làm việc Toolswave của hội thoại ĐÃ NHẬP → chép sang đúng <convId>/<tên>', () => {
    const p = `${TW}/lark/work/c3f9cd1c-0206-4559-98c7-628d9ce02078/File test.xlsx`;
    const c = FP.classifyLocalPath(p, pol(P));
    assert.strictEqual(c.kind, 'toolswave');
    assert.strictEqual(c.convId, 'c3f9cd1c-0206-4559-98c7-628d9ce02078');
    assert.strictEqual(c.dest, `${LW}/lark/work/c3f9cd1c-0206-4559-98c7-628d9ce02078/File test.xlsx`);
    const dev = FP.classifyLocalPath(`${TWDEV}/lark/work/conv-now/sub/b.pdf`, pol(P));
    assert.strictEqual(dev.kind, 'toolswave');
    assert.strictEqual(dev.dest, `${LW}/lark/work/conv-now/sub/b.pdf`);
  });

  await t('POSIX: TỪ CHỐI — ngoài thư mục, .., cùng-tiền-tố, rỗng, chính thư mục gốc, Toolswave ngoài lark/work, hội thoại chưa nhập, tệp ẩn CLI', () => {
    const deny = (p, why, o) => {
      const c = FP.classifyLocalPath(p, pol(P, o));
      assert.strictEqual(c.kind, 'deny', `${why}: ${p} → ${JSON.stringify(c)}`);
      return c.reason;
    };
    deny('/etc/passwd', 'tuyệt đối tuỳ ý');
    deny(`${OUT}/../../../../.ssh/id_rsa`, 'leo ..');
    deny(`${OUT}/a/../b.xlsx`, '.. kể cả khi vẫn ở trong');
    deny(`${OUT}-khac/x.xlsx`, 'thư mục cùng tiền tố');
    deny('', 'rỗng');
    deny(null, 'null');
    deny(OUT, 'chính thư mục gốc (không phải tệp)');
    assert.match(deny(`${TW}/skills/lib/x/SKILL.md`, 'Toolswave ngoài lark/work'), /thư mục làm việc/);
    assert.match(deny(`${TW}/lark/accounts/u/creds.bin`, 'bí mật Toolswave'), /thư mục làm việc/);
    assert.match(deny(`${TW}/lark/work/khong-co/x.xlsx`, 'hội thoại chưa nhập'), /chưa được nhập/);
    deny(`${TW}/lark/work/conv-now/.claude/state.json`, 'tệp ẩn CLI');
    deny(`${TW}/lark/work/conv-now`, 'thư mục hội thoại, không phải tệp');
    deny('relative.xlsx', 'tương đối khi chưa có thư mục lượt', { roots: [] });
    deny(`${TW}/lark/work/conv-now/a.xlsx`, 'chưa có thư mục Larkwave để chép', { lw: null });
  });

  // ── 2. cùng ma trận với dấu tách WINDOWS ────────────────────────────────────────────────────
  await t('WINDOWS (path.win32): cho qua / chép Toolswave / chặn cùng-tiền-tố, .., ổ đĩa khác — so bằng sep, không dùng "/" cứng', () => {
    const W = path.win32;
    const wlw = 'C:\\Users\\u\\AppData\\Roaming\\@larkwave\\desktop';
    const wtw = 'C:\\Users\\u\\AppData\\Roaming\\@toolswave\\desktop';
    const wout = `${wlw}\\lark\\work\\conv-now`;
    const wp = { roots: [wout, null, `${wlw}\\lark\\automations\\r1`], larkwaveWorkRoot: `${wlw}\\lark\\work`, toolswaveRoots: [wtw], conversationExists: (id) => known.has(id), lib: W };
    assert.strictEqual(FP.classifyLocalPath(`${wout}\\Báo cáo.xlsx`, wp).kind, 'root');
    assert.strictEqual(FP.classifyLocalPath('C:/Users/u/AppData/Roaming/@larkwave/desktop/lark/work/conv-now/a.xlsx', wp).kind, 'root', 'gạch xuôi trên Windows vẫn phải qua');
    assert.strictEqual(FP.classifyLocalPath('Báo cáo.xlsx', wp).kind, 'root');
    const c = FP.classifyLocalPath(`${wtw}\\lark\\work\\c3f9cd1c-0206-4559-98c7-628d9ce02078\\File test.xlsx`, wp);
    assert.strictEqual(c.kind, 'toolswave');
    assert.strictEqual(c.dest, `${wlw}\\lark\\work\\c3f9cd1c-0206-4559-98c7-628d9ce02078\\File test.xlsx`);
    assert.strictEqual(FP.classifyLocalPath(`${wout}-khac\\x.xlsx`, wp).kind, 'deny');
    assert.strictEqual(FP.classifyLocalPath(`${wout}\\..\\..\\x.xlsx`, wp).kind, 'deny');
    assert.strictEqual(FP.classifyLocalPath('D:\\secret\\x.xlsx', wp).kind, 'deny');
    assert.strictEqual(FP.classifyLocalPath(`${wtw}\\lark\\work\\khong-co\\x.xlsx`, wp).kind, 'deny');
    assert.ok(FP.isInsideDir('C:\\a\\work', 'C:\\a\\work\\x', W));
    assert.ok(!FP.isInsideDir('C:\\a\\work', 'C:\\a\\work-khac\\x', W));
  });

  await t('ứng viên thư mục Toolswave theo HĐH (mac/win/linux) — một nguồn sự thật (bộ nhập dùng lại)', () => {
    const mac = FP.toolswaveDataDirCandidates('darwin', '/Users/u');
    assert.ok(mac.includes('/Users/u/Library/Application Support/@toolswave/desktop'));
    assert.ok(mac.includes('/Users/u/Library/Application Support/@toolswave/desktop (development)'));
    const win = FP.toolswaveDataDirCandidates('win32', 'C:\\Users\\u', 'C:\\Users\\u\\AppData\\Roaming');
    assert.ok(win.includes('C:\\Users\\u\\AppData\\Roaming\\@toolswave\\desktop'));
    const lin = FP.toolswaveDataDirCandidates('linux', '/home/u', undefined, '/home/u/.config');
    assert.ok(lin.includes('/home/u/.config/@toolswave/desktop'));
    const M = require(path.join(__dirname, '..', '.test-build', 'runtime', 'migrate', 'toolswaveMigrator.js'));
    assert.strictEqual(M.toolswaveDataDirCandidates, FP.toolswaveDataDirCandidates, 'bộ nhập phải dùng CHÍNH hàm này');
  });

  await t('tệp chạy được KHÔNG được mở (ứng dụng/script) — tài liệu thì được', () => {
    for (const n of ['Báo cáo.app', 'x.EXE', 'run.command', 'a.sh', 'b.ps1', 'c.bat', 'd.lnk', 'e.jar', 'f.scpt', 'g.desktop']) assert.ok(FP.isExecutableName(n), n);
    for (const n of ['Báo cáo.xlsx', 'a.pdf', 'b.docx', 'c.csv', 'd.png', 'e.md', 'noext', '']) assert.ok(!FP.isExecutableName(n), n);
  });

  // ── 3. PHÂN GIẢI có đĩa ─────────────────────────────────────────────────────────────────────
  const R = mkdtempSync(path.join(tmpdir(), 'lw-lf-'));
  const rLW = path.join(R, 'larkwave');
  const rTW = path.join(R, 'toolswave');
  const rOUT = path.join(rLW, 'lark', 'work', 'conv-now');
  mkdirSync(rOUT, { recursive: true });
  const CONV = 'c3f9cd1c-0206-4559-98c7-628d9ce02078';
  const src = path.join(rTW, 'lark', 'work', CONV, 'File test.xlsx');
  put(src, Buffer.from('xlsx-v1'));
  const srcHash = sha(src);
  const rpol = () => ({ roots: [rOUT], larkwaveWorkRoot: path.join(rLW, 'lark', 'work'), toolswaveRoots: [rTW], conversationExists: (id) => known.has(id) });

  await t('chép tệp Toolswave → Larkwave; nguồn KHÔNG đổi một byte; gọi lại dùng bản đã chép', async () => {
    const r = await FP.resolveLocalFile(src, rpol());
    assert.ok(r.ok, JSON.stringify(r));
    assert.strictEqual(r.path, path.join(rLW, 'lark', 'work', CONV, 'File test.xlsx'));
    assert.strictEqual(r.copiedFrom, path.resolve(src));
    assert.strictEqual(readFileSync(r.path, 'utf8'), 'xlsx-v1');
    assert.strictEqual(sha(src), srcHash);
    const again = await FP.resolveLocalFile(src, rpol());
    assert.ok(again.ok && again.path === r.path && /đã chép sẵn/.test(again.note));
  });

  await t('đích có bản KHÁC và MỚI HƠN → không ghi đè, chép sang tên "(Toolswave)" bên cạnh', async () => {
    const dest = path.join(rLW, 'lark', 'work', CONV, 'File test.xlsx');
    writeFileSync(dest, 'đã sửa ở Larkwave');
    const future = new Date(Date.now() + 60_000);
    utimesSync(dest, future, future);
    const r = await FP.resolveLocalFile(src, rpol());
    assert.ok(r.ok);
    assert.strictEqual(path.basename(r.path), 'File test (Toolswave).xlsx');
    assert.strictEqual(readFileSync(dest, 'utf8'), 'đã sửa ở Larkwave', 'bản Larkwave mới hơn phải giữ nguyên');
    assert.strictEqual(readFileSync(r.path, 'utf8'), 'xlsx-v1');
  });

  await t('nguồn MỚI HƠN đích (khác nội dung) → cập nhật đích', async () => {
    const s2 = path.join(rTW, 'lark', 'work', CONV, 'b.csv');
    const d2 = path.join(rLW, 'lark', 'work', CONV, 'b.csv');
    put(d2, 'cũ');
    const past = new Date(Date.now() - 3600_000);
    utimesSync(d2, past, past);
    put(s2, 'mới');
    const r = await FP.resolveLocalFile(s2, rpol());
    assert.ok(r.ok && r.path === d2);
    assert.strictEqual(readFileSync(d2, 'utf8'), 'mới');
  });

  await t('symlink thoát ra ngoài bị chặn (cả trong thư mục lượt lẫn thư mục Toolswave); thư mục bị chặn', async () => {
    const outside = path.join(R, 'secret.txt');
    writeFileSync(outside, 'bí mật');
    symlinkSync(outside, path.join(rOUT, 'link.txt'));
    const a = await FP.resolveLocalFile(path.join(rOUT, 'link.txt'), rpol());
    assert.ok(!a.ok && /symlink/.test(a.reason), JSON.stringify(a));
    symlinkSync(outside, path.join(rTW, 'lark', 'work', CONV, 'link2.txt'));
    const b = await FP.resolveLocalFile(path.join(rTW, 'lark', 'work', CONV, 'link2.txt'), rpol());
    assert.ok(!b.ok && /symlink/.test(b.reason), JSON.stringify(b));
    mkdirSync(path.join(rTW, 'lark', 'work', CONV, 'adir'), { recursive: true });
    const c = await FP.resolveLocalFile(path.join(rTW, 'lark', 'work', CONV, 'adir'), rpol());
    assert.ok(!c.ok);
    assert.ok(!existsSync(path.join(rLW, 'lark', 'work', CONV, 'link2.txt')), 'không chép gì khi bị chặn');
  });

  // ── 4. ngữ cảnh tệp theo LƯỢT (AsyncLocalStorage) ───────────────────────────────────────────
  await t('hai lượt song song: mỗi lượt thấy ĐÚNG thư mục của mình qua mọi await (biến module chỉ là dự phòng)', async () => {
    FC.setGlobalOutDir('/fallback');
    const seen = await Promise.all(
      ['/a', '/b', '/c'].map((d) =>
        FC.withTurnFiles({ outDir: d, attachDir: d + '/att', extraRoots: [d + '/auto'] }, async () => {
          const got = [];
          for (let k = 0; k < 4; k++) {
            await new Promise((r) => setTimeout(r, Math.random() * 8));
            got.push(FC.turnOutDir(), FC.turnAttachDir(), FC.turnExtraRoots()[0]);
          }
          return got.every((x, i) => x === [d, d + '/att', d + '/auto'][i % 3]);
        }),
      ),
    );
    assert.deepStrictEqual(seen, [true, true, true]);
    assert.strictEqual(FC.turnOutDir(), '/fallback', 'ngoài lượt → giá trị dự phòng');
    FC.setGlobalOutDir(null);
  });

  // ── 5. công cụ thật: prepare_local_file / fill_xlsx / send_file đi qua bộ phân giải ─────────
  await t('công cụ: prepare_local_file chép tệp Toolswave + trích chữ; send_file từ chối tệp ngoài; fill_xlsx nhận mẫu từ Toolswave', async () => {
    const { fileTools } = require(path.join(B, 'tools', 'files.js'));
    const { buildXlsx } = require(path.join(B, 'fileBuild.js'));
    const tool = (n) => fileTools.find((x) => x.name === n);
    const xl = path.join(rTW, 'lark', 'work', 'conv-now', 'Mẫu.xlsx');
    put(xl, buildXlsx({ name: 'S', rows: [['Mã', 'Tên'], ['001', 'An']] }));
    FC.setLocalFileEnv({ larkwaveWorkRoot: path.join(rLW, 'lark', 'work'), toolswaveRoots: [rTW], conversationExists: (id) => known.has(id) });
    const ctx = { outDir: rOUT, attachDir: rOUT };
    const r = await FC.withTurnFiles(ctx, () => tool('prepare_local_file').exec({ path: xl }));
    assert.ok(r.ok, JSON.stringify(r));
    assert.strictEqual(r.path, path.join(rOUT, 'Mẫu.xlsx'));
    assert.ok(r.copied_from && /001/.test(r.text) && r.preview, JSON.stringify(r).slice(0, 300));
    const filled = await FC.withTurnFiles(ctx, () => tool('fill_xlsx').exec({ source_path: xl, edits: [{ cell: 'B2', value: 'Bình' }] }));
    assert.ok(filled.ok && existsSync(filled.path));
    const denied = await FC.withTurnFiles(ctx, () => tool('prepare_local_file').exec({ path: '/etc/hosts' }));
    assert.strictEqual(denied.ok, false);
    await assert.rejects(FC.withTurnFiles(ctx, () => tool('send_file').exec({ path: '/etc/hosts', to: 'drive' }, {})), /Chỉ gửi được tệp/);
  });

  console.log(fail ? `\n${fail} ca SAI` : `\n  localFiles: TẤT CẢ ĐÚNG (${pass})`);
  process.exit(fail ? 1 : 0);
})();
