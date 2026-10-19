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
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Tiền tố `tw:` = file nằm ở repo TOOLSWAVE (mặc định `../app`), không phải repo này.
 *
 * Từ 19/10/2026 repo này không còn `apps/api`/`apps/web` — chúng là bản sao không deploy ở đâu.
 * Bản đối chiếu ĐÚNG là bản trên máy chủ thật: so với một bản sao đông lạnh chỉ cho cảm giác an
 * toàn giả, vì máy chủ đổi mà ở đây vẫn báo "khớp". Đổi chỗ bằng `--toolswave <đường/dẫn>`.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const twArg = process.argv.indexOf('--toolswave');
const TW = path.resolve(twArg >= 0 ? process.argv[twArg + 1] : path.join(ROOT, '..', 'app'));
const at = (p) => (p.startsWith('tw:') ? path.join(TW, p.slice(3)) : path.join(ROOT, p));

/** Mỗi cặp: [nhãn, file A, file B]. `tw:` = ở repo Toolswave. */
const PAIRS = [
  [
    'skillCommand',
    'packages/core/src/skillCommand.ts',
    'tw:apps/api/src/skills/skill-command.util.ts',
  ],
  [
    'claudeKeyKind (phân loại khoá Anthropic)',
    'apps/desktop/main/runtime/claudeKeyKind.ts',
    'packages/ui/src/claudeKeyKind.ts',
  ],
  [
    'ooxml (bộ đọc xlsx/docx)',
    'tw:apps/api/src/uploads/ooxml.ts',
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
if (!existsSync(TW)) {
  console.log(`ⓘ không thấy repo Toolswave ở ${TW} — bỏ qua các cặp 'tw:'. Chỉ định bằng --toolswave <đường/dẫn>.`);
}
for (const [label, a, b] of PAIRS) {
  const [pa, pb] = [at(a), at(b)];
  // Bên Toolswave không có trên máy này (ví dụ máy Windows): BỎ QUA, đừng báo đỏ — cặp này
  // không kiểm được chứ không phải đã lệch.
  if ((a.startsWith('tw:') || b.startsWith('tw:')) && !existsSync(TW)) {
    console.log(`– ${label}: bỏ qua (cần repo Toolswave)`);
    continue;
  }
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
