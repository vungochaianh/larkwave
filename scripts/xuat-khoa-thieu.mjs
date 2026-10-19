/**
 * Xuất các khoá i18n còn THIẾU bản tiếng Anh ra JSON, kèm chuỗi dự phòng ĐẦY ĐỦ.
 *
 * Khác `quet-i18n-thieu.mjs` ở đúng một chỗ, và chỗ đó quan trọng: bộ quét kia in ra cho người
 * đọc nên cắt ngắn chuỗi; ghi bản cắt ngắn vào từ điển sẽ làm CỤT chính câu tiếng Việt, vì từ
 * điển thắng chuỗi dự phòng trong mã. Tệp này giữ nguyên chuỗi.
 *
 * Dùng: node scripts/xuat-khoa-thieu.mjs <thu-muc-ra> [so-lo]
 */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [thuMucRa, soLoRaw] = process.argv.slice(2);
if (!thuMucRa) {
  console.log('thiếu thư mục ra');
  process.exit(1);
}
const SO_LO = Number(soLoRaw || 10);

const MES = readFileSync(path.join(ROOT, 'packages/ui/src/i18n.tsx'), 'utf8');
const coKhoa = new Set([...MES.matchAll(/^\s*"([^"]+)":\s*\{/gm)].map((m) => m[1]));

const CO_DAU =
  /[àáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/i;

const tep = [];
const duyet = (d) => {
  for (const f of readdirSync(d)) {
    const p = path.join(d, f);
    if (statSync(p).isDirectory()) duyet(p);
    else if (/\.tsx?$/.test(f)) tep.push(p);
  }
};
// apps/web đã gỡ 19/10/2026 (bản sao không deploy) — chỉ còn packages/ui là thứ desktop thật sự gói.
for (const g of ['packages/ui/src']) duyet(path.join(ROOT, g));

const thieu = new Map();
for (const f of tep) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/\bt\(\s*["']([a-zA-Z0-9_.]+)["']\s*,\s*["']([^"']{2,160})["']/g)) {
    const [, khoa, duPhong] = m;
    if (coKhoa.has(khoa)) continue;
    if (!CO_DAU.test(duPhong)) continue;
    if (!thieu.has(khoa)) {
      thieu.set(khoa, { k: khoa, vi: duPhong, noi: f.slice(ROOT.length + 1).split(path.sep).join('/') });
    }
  }
}

const ds = [...thieu.values()];
mkdirSync(thuMucRa, { recursive: true });
writeFileSync(path.join(thuMucRa, 'tat-ca.json'), JSON.stringify(ds, null, 0));
for (let i = 0; i < SO_LO; i++) {
  const lo = ds.filter((_, j) => j % SO_LO === i);
  writeFileSync(path.join(thuMucRa, `lo-${i}.json`), JSON.stringify(lo.map(({ k, vi }) => ({ k, vi })), null, 0));
}
console.log('so khoa thieu:', ds.length, '| chia', SO_LO, 'lo');
console.log('dai nhat:', Math.max(...ds.map((x) => x.vi.length)), 'ky tu');
