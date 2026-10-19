#!/usr/bin/env node
/**
 * Canh các cặp file được CHÉP TAY qua ranh giới package.
 *
 * Repo cố tình nhân bản vài chỗ vì packages/core (ui + desktop) và packages/shared (api + web)
 * KHÔNG được import lẫn nhau. Nhân bản có chủ đích thì được — nhân bản rồi LỆCH NHAU thì là lớp
 * lỗi lặng lẽ nhất ở đây: sửa một bên, bên kia âm thầm chạy sai.
 *
 *   node scripts/check-duplicates.mjs
 *
 * Thoát khác 0 khi có cặp lệch. Chạy trước mỗi lần deploy/dựng bản cài.
 *
 * CHỈ CANH TRONG REPO NÀY (từ 19/10/2026). Trước đó còn so với bản chép ở `apps/api`, rồi so với
 * repo Toolswave. Cả hai mối đã đứt: `apps/api` là bản sao không deploy, đã gỡ; Toolswave thì dừng.
 * Larkwave và Appwave nay tách riêng — `skillCommand` và `ooxml` mỗi bên tự làm chủ bản của mình,
 * cố ý khác nhau, nên không còn gì để so. Đừng dựng lại phép so chéo repo.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = (p) => path.join(ROOT, p);

/** Mỗi cặp: [nhãn, file A, file B] — đường dẫn tương đối từ gốc repo. */
const PAIRS = [
  [
    'claudeKeyKind (phân loại khoá Anthropic)',
    'apps/desktop/main/runtime/claudeKeyKind.ts',
    'packages/ui/src/claudeKeyKind.ts',
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
  const [pa, pb] = [at(a), at(b)];
  if (!existsSync(pa) || !existsSync(pb)) {
    console.error(`✗ ${label}: thiếu file (${!existsSync(pa) ? pa : pb})`);
    bad++;
    continue;
  }
  const ha = hash(normalize(readFileSync(pa, 'utf8')));
  const hb = hash(normalize(readFileSync(pb, 'utf8')));
  if (ha === hb) {
    console.log(`✓ ${label} — khớp (${ha})`);
  } else {
    console.error(`✗ ${label} — LỆCH NHAU\n    ${pa}  ${ha}\n    ${pb}  ${hb}\n    Chép phần mã đã sửa sang bên còn lại rồi chạy lại.`);
    bad++;
  }
}
process.exit(bad ? 1 : 0);
