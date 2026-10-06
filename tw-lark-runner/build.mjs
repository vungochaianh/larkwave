import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Gói bộ chạy lịch thành MỘT file cho VM.
 *
 * Bundle từ chính nguồn của app desktop (`apps/desktop/main/runtime/lark/...`) thay vì chép sang
 * đây: `larkClient`, `automationEngine` và `createToolBridge` chứa những luật không được phép có
 * hai bản — cách phân loại lỗi công cụ, chống trùng lịch, mốc sàn "đừng chạy ngay khi vừa tạo".
 * Chép sang là hai bản rồi trôi lệch, và bên trôi lệch lại là bên chạy không ai trông.
 *
 * `platform: 'node'` + không external gì: VM chỉ cần Node 20, `npm install` không cần chạy khi
 * triển khai. Chính vì vậy mà bản dựng phải TUYỆT ĐỐI không chạm `electron` — xem tools/headless.ts.
 */
const here = dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [join(here, 'src/entry.ts')],
  outfile: join(here, 'dist/runner.js'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  // `import.meta` cần cho ESM; banner tạo require() cho vài thư viện CJS lọt vào cây phụ thuộc.
  banner: { js: "import { createRequire } from 'node:module';const require = createRequire(import.meta.url);" },
  logLevel: 'info',
});

// Chốt chặn: nếu `electron` lọt vào bundle thì VM sẽ chết ngay lúc khởi động với một lỗi khó hiểu.
// Thà hỏng ở đây, lúc dựng, với một câu nói rõ nguyên nhân.
const { readFileSync } = await import('node:fs');
const out = readFileSync(join(here, 'dist/runner.js'), 'utf8');
// Bắt CẢ dạng esbuild viết lại. Bản đầu chỉ tìm `require("electron")` nên trượt sạch: esbuild
// đổi nó thành `__require("electron")` và gói module vào `__commonJS({"…/electron/index.js"…})`.
// Chốt chặn không bắt được thì tệ hơn không có, vì nó in ra "✓ bundle sạch electron" một cách
// tự tin trong khi electron nằm ngay trong đó — đúng thứ đã xảy ra lần dựng đầu.
if (/["'`][^"'`]*node_modules\/electron\/|__require\(["']electron["']\)|require\(["']electron["']\)|from ["']electron["']/.test(out)) {
  console.error('\n✗ Bundle có dính `electron` — VM không chạy được.');
  console.error('  Nguyên nhân thường gặp: một công cụ mới import larkWebSession/cmsSyncService.');
  console.error('  Sửa: thêm/loại ở apps/desktop/main/runtime/lark/tools/headless.ts (KHÔNG lọc từ tools/index.ts).');
  process.exit(1);
}
console.log('✓ bundle sạch electron');
