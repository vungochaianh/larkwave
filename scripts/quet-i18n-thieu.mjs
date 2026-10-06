#!/usr/bin/env node
/**
 * Tìm những chỗ site tiếng Anh vẫn hiện chữ tiếng Việt.
 *
 * VÌ SAO CẦN. Mọi chuỗi hiển thị đi qua `t("khoá", "chuỗi dự phòng")`. Nếu "khoá" KHÔNG có trong
 * từ điển `packages/ui/src/i18n.tsx`, hàm `t` trả về chuỗi dự phòng — và chuỗi dự phòng gần như
 * luôn là tiếng Việt. Nghĩa là: thiếu khoá thì người dùng đang để site tiếng Anh vẫn đọc tiếng
 * Việt, mà không có lỗi nào được ném ra, không có cảnh báo nào ở bản dựng. Nó chỉ lộ khi có người
 * nhìn thấy và báo.
 *
 * Đó đúng là cách lỗi splash bị phát hiện ngày 23/09/2026: `landing.splash.tagline` chưa bao giờ
 * được thêm vào từ điển, nên màn mở đầu của MỌI trang công khai hiện "Trợ lý AI biết làm việc
 * thật" kể cả khi giao diện đang là tiếng Anh.
 *
 * Dùng:  node scripts/quet-i18n-thieu.mjs [--tat-ca]
 *        --tat-ca  liệt kê cả những chỗ nằm sau đăng nhập (mặc định chỉ bề mặt công khai)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TAT_CA = process.argv.includes('--tat-ca');

const MES = readFileSync(path.join(ROOT, 'packages/ui/src/i18n.tsx'), 'utf8');
// Khoá trong từ điển dùng nháy KÉP, không phải nháy đơn. Bản đầu bắt nhầm nháy đơn nên đọc ra 0
// khoá và báo 2436 chỗ "thiếu" — một phép đo sai theo hướng hoảng loạn: mọi khoá đều bị coi là
// thiếu. Đọc được 0 khoá là dấu hiệu bộ quét hỏng, không phải site hỏng.
const coKhoa = new Set([...MES.matchAll(/^\s*"([^"]+)":\s*\{/gm)].map((m) => m[1]));
if (coKhoa.size < 100) {
  console.error(`Đọc từ điển chỉ ra ${coKhoa.size} khoá — bộ quét hỏng, dừng để không báo sai.`);
  process.exit(2);
}

/** Dấu tiếng Việt — đủ để phân biệt chuỗi dự phòng tiếng Việt với chuỗi tiếng Anh. */
const CO_DAU = /[àáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/i;

/** Đường dẫn thuộc bề mặt công khai — nơi một chữ sai ngôn ngữ là người lạ nhìn thấy đầu tiên. */
const CONG_KHAI =
  /(components\/(landing|fx|blog)|components\/(PublicSplash|LandingChrome|AuthCard)|app\/(page|blog|login|register|forgot|reset|pricing|explore|support|download))/;

const tep = [];
const duyet = (d) => {
  for (const f of readdirSync(d)) {
    const p = path.join(d, f);
    if (statSync(p).isDirectory()) duyet(p);
    else if (/\.tsx?$/.test(f)) tep.push(p);
  }
};
for (const g of ['apps/web/src', 'packages/ui/src']) duyet(path.join(ROOT, g));

const thieu = new Map();
for (const f of tep) {
  const s = readFileSync(f, 'utf8');
  // t("khoá", "dự phòng") — cả nháy đơn lẫn nháy kép, cả khi xuống dòng giữa hai tham số.
  for (const m of s.matchAll(/\bt\(\s*["']([a-zA-Z0-9_.]+)["']\s*,\s*["']([^"']{2,160})["']/g)) {
    const [, khoa, duPhong] = m;
    if (coKhoa.has(khoa)) continue;
    if (!CO_DAU.test(duPhong)) continue; // dự phòng tiếng Anh thì không sai ngôn ngữ
    const noi = f.slice(ROOT.length + 1).split(path.sep).join('/');
    if (!thieu.has(khoa)) thieu.set(khoa, { duPhong, noi: new Set() });
    thieu.get(khoa).noi.add(noi);
  }
}

const dsach = [...thieu].map(([k, v]) => ({ khoa: k, ...v, noi: [...v.noi] }));
const congKhai = dsach.filter((x) => x.noi.some((p) => CONG_KHAI.test(p)));
const hienThi = TAT_CA ? dsach : congKhai;

console.log(`từ điển: ${coKhoa.size} khoá`);
console.log(`khoá THIẾU mà dự phòng là tiếng Việt: ${dsach.length} (bề mặt công khai: ${congKhai.length})`);
console.log('mỗi dòng dưới đây = một chỗ site tiếng Anh vẫn hiện tiếng Việt\n');
for (const x of hienThi) {
  console.log(`  ${x.khoa}`);
  console.log(`     "${x.duPhong.slice(0, 70)}"`);
  console.log(`     ${x.noi.slice(0, 3).join(', ')}`);
}
if (!hienThi.length) console.log('  (không còn chỗ nào)');
process.exitCode = hienThi.length ? 1 : 0;
