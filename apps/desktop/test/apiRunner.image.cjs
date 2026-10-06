/**
 * Kiểm `imageBlocksFor`: kết quả tool khai báo ảnh thì phải thành KHỐI ẢNH thật cho Anthropic,
 * còn mọi thứ khác phải trả về null (giữ nguyên đường chữ).
 *
 *   cd apps/desktop && npx tsc main/runtime/apiRunner.ts --outDir .test-build \
 *     --module commonjs --target es2020 --esModuleInterop --skipLibCheck
 *   node test/apiRunner.image.cjs
 */
const { writeFileSync, mkdtempSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { imageBlocksFor } = require('../.test-build/runtime/apiRunner.js');

const dir = mkdtempSync(join(tmpdir(), 'tw-img-'));
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const small = join(dir, 'anh.png');
const big = join(dir, 'to.png');
writeFileSync(small, PNG);
writeFileSync(big, Buffer.alloc(4 * 1024 * 1024, 1)); // vượt trần ẢNH (3MB)
const bigPdf = join(dir, 'to.pdf');
writeFileSync(bigPdf, Buffer.alloc(9 * 1024 * 1024, 1)); // vượt trần PDF (8MB)

(async () => {
  let bad = 0;
  const ok = (name, cond, extra) => {
    if (!cond) { bad++; console.log('✗', name, extra ?? ''); } else console.log('✓', name);
  };

  const r1 = await imageBlocksFor({ kind: 'image', path: small, mime: 'image/png', size: PNG.length }, 'chữ');
  ok('ảnh hợp lệ → 2 khối (chữ + ảnh base64)',
    Array.isArray(r1) && r1.length === 2 && r1[1].type === 'image' &&
    r1[1].source.media_type === 'image/png' && r1[1].source.data === PNG.toString('base64'),
    JSON.stringify(r1)?.slice(0, 120));

  ok('kết quả KHÔNG phải ảnh → null', (await imageBlocksFor({ kind: 'text', text: 'x' }, 'c')) === null);
  // PDF nay đi khối `document` — tài liệu Anthropic cho phép nó ngay trong tool_result.
  const rPdf = await imageBlocksFor({ kind: 'pdf', path: small, mime: 'application/pdf' }, 'chữ');
  ok('PDF → khối document base64',
    Array.isArray(rPdf) && rPdf.length === 2 && rPdf[1].type === 'document' &&
    rPdf[1].source.media_type === 'application/pdf' && rPdf[1].source.data === PNG.toString('base64'),
    JSON.stringify(rPdf)?.slice(0, 120));
  ok('PDF quá lớn → null', (await imageBlocksFor({ kind: 'pdf', path: bigPdf, mime: 'application/pdf' }, 'c')) === null);
  ok('PDF 4MB (dưới trần 8MB) vẫn được', Array.isArray(await imageBlocksFor({ kind: 'pdf', path: big, mime: 'application/pdf' }, 'c')));
  ok('kind lạ (binary) → null', (await imageBlocksFor({ kind: 'binary', path: small, mime: 'application/zip' }, 'c')) === null);
  ok('mime lạ → null', (await imageBlocksFor({ kind: 'image', path: small, mime: 'image/tiff' }, 'c')) === null);
  ok('size khai quá lớn → null', (await imageBlocksFor({ kind: 'image', path: small, mime: 'image/png', size: 9e9 }, 'c')) === null);
  ok('tệp trên đĩa quá lớn → null', (await imageBlocksFor({ kind: 'image', path: big, mime: 'image/png' }, 'c')) === null);
  ok('đường dẫn không tồn tại → null', (await imageBlocksFor({ kind: 'image', path: join(dir, 'khong-co.png'), mime: 'image/png' }, 'c')) === null);
  ok('chuỗi thường → null', (await imageBlocksFor('chỉ là chữ', 'c')) === null);
  ok('null → null', (await imageBlocksFor(null, 'c')) === null);

  console.log(bad ? `\nHỎNG ${bad}` : '\nĐẠT tất cả');
  process.exit(bad ? 1 : 0);
})();
