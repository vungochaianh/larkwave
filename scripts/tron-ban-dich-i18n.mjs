/**
 * Trộn bản dịch (do agent sinh) vào `packages/ui/src/i18n.tsx`.
 *
 * HAI HÀNG RÀO, vì một bản dịch sai ghi vào từ điển sẽ THẮNG chuỗi dự phòng trong mã:
 *
 *  1. Chuỗi `vi` phải TRÙNG KHỚP chuỗi dự phòng thật đang nằm trong mã nguồn. Bộ quét in ra bản
 *     cắt ngắn cho dễ đọc; ghi bản cắt ngắn vào từ điển là làm cụt chính câu tiếng Việt.
 *  2. Khoá đã có trong từ điển thì BỎ QUA, không ghi đè — bản đang có là bản người ta đã duyệt.
 *
 * Dùng: node scripts/tron-ban-dich-i18n.mjs <tep-ket-qua.json>
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tepKetQua = process.argv[2];
if (!tepKetQua) {
  console.log('thiếu tệp kết quả');
  process.exit(1);
}

const ban = JSON.parse(readFileSync(tepKetQua, 'utf8')).result.ban;
const P_I18N = path.join(ROOT, 'packages/ui/src/i18n.tsx');
let MES = readFileSync(P_I18N, 'utf8');
const daCo = new Set([...MES.matchAll(/^\s*"([^"]+)":\s*\{/gm)].map((m) => m[1]));

// ── Chuỗi dự phòng THẬT, lấy bằng đúng biểu thức của bộ quét ──────────────────
const goc = new Map();
const tep = [];
const duyet = (d) => {
  for (const f of readdirSync(d)) {
    const p = path.join(d, f);
    if (statSync(p).isDirectory()) duyet(p);
    else if (/\.tsx?$/.test(f)) tep.push(p);
  }
};
for (const g of ['apps/web/src', 'packages/ui/src']) duyet(path.join(ROOT, g));
for (const f of tep) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/\bt\(\s*["']([a-zA-Z0-9_.]+)["']\s*,\s*["']([^"']{2,160})["']/g)) {
    if (!goc.has(m[1])) goc.set(m[1], m[2]);
  }
}

const thoat = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');

const nhan = [];
const boQua = [];
for (const x of ban) {
  if (daCo.has(x.k)) {
    boQua.push({ k: x.k, vi_sao: 'đã có trong từ điển' });
    continue;
  }
  const viThat = goc.get(x.k);
  if (viThat === undefined) {
    boQua.push({ k: x.k, vi_sao: 'không thấy trong mã nguồn' });
    continue;
  }
  if (viThat.trim() !== String(x.vi).trim()) {
    boQua.push({ k: x.k, vi_sao: 'chuỗi vi không khớp mã nguồn' });
    continue;
  }
  if (!x.en || !String(x.en).trim()) {
    boQua.push({ k: x.k, vi_sao: 'bản en rỗng' });
    continue;
  }
  nhan.push(`  "${x.k}": { vi: "${thoat(viThat)}", en: "${thoat(String(x.en))}" },`);
}

console.log('nhan :', nhan.length);
console.log('bo qua:', boQua.length);
const dem = {};
for (const b of boQua) dem[b.vi_sao] = (dem[b.vi_sao] || 0) + 1;
console.log(dem);

if (nhan.length) {
  const neo = 'export const MESSAGES: Record<string, { vi: string; en: string }> = {\n';
  if (!MES.includes(neo)) {
    console.log('KHÔNG thấy điểm chèn');
    process.exit(1);
  }
  const khoi =
    neo +
    '  // ── 495 khoá bổ sung ngày 25/09/2026 ───────────────────────────────────────\n' +
    '  // Trước đó chúng được gọi bằng t() nhưng KHÔNG có trong từ điển, nên t() lặng lẽ rơi về\n' +
    '  // chuỗi dự phòng tiếng Việt — giao diện tiếng Anh vẫn hiện tiếng Việt, không lỗi, không\n' +
    '  // cảnh báo. Chuỗi vi ở đây được đối chiếu ĐÚNG với chuỗi dự phòng trong mã trước khi ghi.\n' +
    nhan.join('\n') +
    '\n\n';
  MES = MES.replace(neo, khoi);
  writeFileSync(P_I18N, MES);
  console.log('đã ghi vào', path.relative(ROOT, P_I18N));
}
