#!/usr/bin/env node
/**
 * Canh các cặp file được CHÉP TAY qua ranh giới package.
 *
 * Repo cố tình nhân bản vài chỗ vì packages/core (ui + desktop) và packages/shared (api + web)
 * KHÔNG được import lẫn nhau. Nhân bản có chủ đích thì được — nhân bản rồi LỆCH NHAU thì là lớp
 * lỗi lặng lẽ nhất ở đây: sửa một bên, bên kia âm thầm chạy sai.
 *
 * Trước file này chỉ có đúng MỘT cặp được canh (skillCommand), và script canh nó không nằm trong
 * bất kỳ quy trình nào — tức trên thực tế không cặp nào được canh cả.
 *
 *   node scripts/check-duplicates.mjs
 *
 * Thoát khác 0 khi có cặp lệch. Chạy trước mỗi lần deploy/dựng bản cài.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

/** Mỗi cặp: [nhãn, file A, file B, (tuỳ chọn) hàm chuẩn hoá trước khi so]. */
const PAIRS = [
  [
    'skillCommand',
    'packages/core/src/skillCommand.ts',
    'apps/api/src/skills/skill-command.util.ts',
  ],
  [
    'ooxml (bộ đọc xlsx/docx)',
    'apps/api/src/uploads/ooxml.ts',
    'apps/desktop/main/runtime/lark/ooxml.ts',
  ],
];

/** Bỏ khối chú thích đầu file + khoảng trắng: hai bản CỐ Ý ghi chú khác nhau, phần MÃ mới phải khớp. */
function normalize(src) {
  return src
    .replace(/^\s*\/\*\*[\s\S]*?\*\/\s*/, '') // chú thích mở đầu
    .replace(/\/\/[^\n]*/g, '')               // chú thích dòng
    .replace(/\/\*[\s\S]*?\*\//g, '')         // chú thích khối
    .replace(/\s+/g, ' ')
    .trim();
}

const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);

let bad = 0;
for (const [label, a, b] of PAIRS) {
  if (!existsSync(a) || !existsSync(b)) {
    console.error(`✗ ${label}: thiếu file (${!existsSync(a) ? a : b})`);
    bad++;
    continue;
  }
  const ha = hash(normalize(readFileSync(a, 'utf8')));
  const hb = hash(normalize(readFileSync(b, 'utf8')));
  if (ha === hb) {
    console.log(`✓ ${label} — khớp (${ha})`);
  } else {
    console.error(`✗ ${label} — LỆCH NHAU\n    ${a}  ${ha}\n    ${b}  ${hb}\n    Chép phần mã đã sửa sang bên còn lại rồi chạy lại.`);
    bad++;
  }
}
process.exit(bad ? 1 : 0);
