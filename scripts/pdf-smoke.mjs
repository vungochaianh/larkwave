#!/usr/bin/env node
/**
 * Chạy THẬT đường dựng PDF một lần, bằng Electron thật.
 *
 * Vì sao cần riêng một kịch bản: `boot-smoke.mjs` GIẢ LẬP electron để đếm kênh IPC, nên nó không
 * chạm được `printToPDF` — thứ duy nhất nó chứng minh là mã import được. Mà PDF là đường dễ hỏng
 * lặng lẽ nhất trong cả tính năng xuất tệp: `loadURL` với `data:` URL có thể bị chặn, cửa sổ ẩn có
 * thể không bao giờ báo tải xong, hoặc PDF ra đúng định dạng nhưng TRẮNG TRƠN vì trang chưa kịp
 * dựng. Không chạy thật thì cả ba đều lọt tới tay người dùng.
 *
 * Kiểm ba thứ, theo đúng thứ tự dễ hỏng:
 *   1. có phải PDF thật không (chữ ký %PDF-)
 *   2. có NHIỀU HƠN một trang trắng không (đo theo dung lượng)
 *   3. chữ tiếng Việt và số liệu có thật sự nằm trong tệp không (dò luồng nội dung)
 *
 * Dùng:  node scripts/pdf-smoke.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const c = { red: '\x1b[31m', green: '\x1b[32m', cyan: '\x1b[36m', dim: '\x1b[2m', off: '\x1b[0m' };
const die = (m) => {
  console.error(`${c.red}✗ ${m}${c.off}`);
  process.exit(1);
};

const ELECTRON = join(ROOT, 'apps/desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
if (!existsSync(ELECTRON)) die(`Không thấy Electron ở ${ELECTRON}`);

// Biên dịch hai module cần thiết ra CommonJS để Electron require thẳng.
const OUT = mkdtempSync(join(tmpdir(), 'tw-pdf-smoke-'));
console.log(`${c.cyan}▸${c.off} biên dịch fileBuild + filePdf…`);
execFileSync(
  'npx',
  [
    'tsc',
    'main/runtime/lark/fileBuild.ts',
    'main/runtime/lark/filePdf.ts',
    '--outDir',
    join(OUT, 'build'),
    '--module',
    'commonjs',
    '--target',
    'es2020',
    '--esModuleInterop',
    '--skipLibCheck',
  ],
  { cwd: join(ROOT, 'apps/desktop'), stdio: 'inherit' },
);

// `tsc` suy `rootDir` từ thư mục chung của các tệp đầu vào; hai tệp này cùng nằm trong
// main/runtime/lark nên đầu ra PHẲNG ngay trong build/, không có cây thư mục con.
const B = join(OUT, 'build');
const pdfPath = join(OUT, 'ra.pdf');

// Kịch bản chạy TRONG Electron. Phải `app.whenReady()` trước khi dựng BrowserWindow.
const main = `
const { app } = require('electron');
const { writeFileSync } = require('node:fs');
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  try {
    const { buildHtml } = require(${JSON.stringify(join(B, 'fileBuild.js'))});
    const { htmlToPdf, canMakePdf } = require(${JSON.stringify(join(B, 'filePdf.js'))});
    if (!canMakePdf()) throw new Error('canMakePdf() trả về false trong Electron thật');
    const html = buildHtml('Báo cáo thu tiền tháng 9', 'Tổng thu 12.500.000đ, đã đối chiếu 128 dòng.', {
      rows: [
        ['Khách hàng', 'Mã', 'Số tiền'],
        ['Nguyễn Thị Bưởi', '0074', '1250000'],
        ['Trần Đức Đạt', '0123456789', '980500'],
      ],
    });
    const buf = await htmlToPdf(html);
    writeFileSync(${JSON.stringify(pdfPath)}, buf);
    console.log('PDF_OK ' + buf.length);
    app.exit(0);
  } catch (e) {
    console.error('PDF_ERR ' + (e && e.message ? e.message : e));
    app.exit(1);
  }
});
`;
const mainPath = join(OUT, 'main.cjs');
writeFileSync(mainPath, main);

console.log(`${c.cyan}▸${c.off} chạy Electron thật…`);
let out = '';
try {
  // `ELECTRON_RUN_AS_NODE` rò từ tiến trình cha (VS Code đặt nó) biến Electron thành Node trần —
  // app.whenReady() không bao giờ chạy và tiến trình thoát mã 0 trong im lặng. Phải gỡ.
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  out = execFileSync(ELECTRON, [mainPath], { env, encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  die(`Electron thoát với lỗi: ${(e.stderr || e.stdout || e.message || '').toString().slice(0, 600)}`);
}
if (!/PDF_OK/.test(out)) die(`Không dựng được PDF: ${out.slice(0, 600)}`);

// ── Kiểm tệp ra ──────────────────────────────────────────────────────────────────────
if (!existsSync(pdfPath)) die('Không thấy tệp PDF sinh ra.');
const buf = readFileSync(pdfPath);
if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') die('Tệp sinh ra không phải PDF.');

// Một trang A4 TRẮNG TRƠN chỉ khoảng 1KB. Có chữ + bảng + nền thì luôn lớn hơn nhiều.
if (buf.length < 4000) die(`PDF chỉ ${buf.length} byte — gần như chắc chắn là trang trắng.`);

// Chữ nằm trong luồng nội dung đã nén, nên dò thẳng byte không thấy. Giải nén các stream Flate
// rồi tìm — đây mới là bằng chứng nội dung THẬT SỰ được vẽ, không phải chỉ có khung trang.
const { inflateSync } = await import('node:zlib');
let text = '';
for (const m of buf.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
  try {
    text += inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1');
  } catch {
    /* không phải stream nén — bỏ qua */
  }
}
// PDF mã hoá chữ theo phông nên không tìm được nguyên văn tiếng Việt; thay vào đó đòi có lệnh vẽ
// chữ (Tj/TJ) — thứ một trang trắng không bao giờ có.
if (!/\bTJ\b|\bTj\b/.test(text)) die('PDF không có lệnh vẽ chữ nào — trang trắng.');

console.log(`${c.green}✓${c.off} PDF dựng thật được: ${(buf.length / 1024).toFixed(1)} KB, có nội dung được vẽ`);
console.log(`${c.dim}  ${pdfPath}${c.off}`);
