// Dùng: node scripts/check-landing-i18n.mjs [check|dump]
// Trích mọi cặp (khoá home.lp*, câu tiếng Việt dự phòng) từ mã nguồn trang chủ, và so với bảng
// MESSAGES trong packages/ui/src/i18n.tsx. In ra: số khoá, số lệch, số thiếu en. Thoát ≠0 nếu lệch.
//
// Cách bắt cặp: (a) t("KEY", "STR"); (b) trong object: `xKey: "KEY",` rồi `x: "STR"` ngay sau
// (có thể xuống dòng); (c) { key: "KEY", label|text: "STR" }.
import fs from "node:fs";

import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = [
  `${ROOT}/apps/web/src/components/landing/LandingPage.tsx`,
  `${ROOT}/apps/web/src/app/welcome/content.ts`,
];
const I18N = `${ROOT}/packages/ui/src/i18n.tsx`;

const pairs = new Map(); // key -> vi (từ mã)
const add = (k, v, where) => {
  if (pairs.has(k) && pairs.get(k) !== v) console.error(`DUP khác câu: ${k} (${where})`);
  pairs.set(k, v);
};
for (const f of SRC) {
  const s = fs.readFileSync(f, "utf8");
  for (const m of s.matchAll(/\bt\(\s*"(home\.lp[^"]+)"\s*,\s*"((?:[^"\\]|\\.)*)"/g)) add(m[1], JSON.parse(`"${m[2]}"`), f);
  for (const m of s.matchAll(/(\w+)Key:\s*"(home\.lp[^"]+)",\s*(\w+):\s*"((?:[^"\\]|\\.)*)"/g)) {
    if (m[1] !== m[3]) { console.error(`Cặp lệch tên: ${m[1]}Key vs ${m[3]}`); continue; }
    add(m[2], JSON.parse(`"${m[4]}"`), f);
  }
  for (const m of s.matchAll(/key:\s*"(home\.lp[^"]+)",\s*(?:label|text):\s*"((?:[^"\\]|\\.)*)"/g)) add(m[1], JSON.parse(`"${m[2]}"`), f);
}

// MESSAGES: cắt đúng object literal rồi eval (không cần TS runner; i18n.tsx có JSX nên không import được).
const i18n = fs.readFileSync(I18N, "utf8");
const start = i18n.indexOf("export const MESSAGES");
const open = i18n.indexOf("= {", start) + 2;
const close = i18n.indexOf("\n};", open);
const MESSAGES = new Function(`return (${i18n.slice(open, close + 2)});`)();

const mode = process.argv[2] || "check";
if (mode === "dump") {
  // Xuất JSON {key: vi} để làm bảng dịch.
  console.log(JSON.stringify(Object.fromEntries(pairs), null, 2));
  process.exit(0);
}

let drift = 0, missing = 0, noEn = 0;
for (const [k, vi] of pairs) {
  const row = MESSAGES[k];
  if (!row) { missing++; console.log(`THIẾU  ${k}`); continue; }
  if (row.vi !== vi) { drift++; console.log(`LỆCH   ${k}\n   mã : ${vi}\n   bảng: ${row.vi}`); }
  if (!row.en || row.en === row.vi && /[ăâđêôơưàáảãạ]/i.test(row.vi)) { noEn++; console.log(`NO-EN  ${k}`); }
}
// Khoá home.lp* trong bảng mà mã không còn dùng (rác).
const stale = Object.keys(MESSAGES).filter((k) => k.startsWith("home.lp") && !pairs.has(k));
if (stale.length) console.log(`RÁC trong bảng (${stale.length}): ${stale.join(", ")}`);
console.log(`\nTổng khoá trong mã: ${pairs.size} · lệch vi: ${drift} · thiếu khoá: ${missing} · thiếu en: ${noEn} · rác: ${stale.length}`);
process.exit(drift + missing + noEn + stale.length ? 1 : 0);
