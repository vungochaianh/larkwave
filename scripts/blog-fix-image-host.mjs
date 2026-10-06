#!/usr/bin/env node
/**
 * Đổi địa chỉ ảnh trong bài blog từ `apia.toolswave.net` sang `api.toolswave.net`.
 *
 * VÌ SAO CẦN. Ảnh trong bài được chèn bằng đường dẫn tuyệt đối tới API lúc bài được tạo:
 *
 *     ![...](https://apia.toolswave.net/uploads/images/1789669106403-e535e3b0.png)
 *
 * Sau khi hoán đổi tên miền, `apia.toolswave.net` thuộc về hệ B (backend portal), nên những ảnh
 * này 404 hết — bài vẫn đọc được nhưng mất toàn bộ hình. Đo ngày 22/09/2026: 22 ảnh như vậy.
 *
 * Sửa CẢ bản tiếng Việt (cột content) lẫn bản dịch (cột i18n), vì bản dịch giữ nguyên đường dẫn
 * ảnh của bản gốc — dịch mà đổi đường dẫn ảnh thì mới là sai.
 *
 * DÙNG:
 *   node scripts/blog-fix-image-host.mjs --dry-run     # xem sẽ đổi gì, không ghi
 *   node scripts/blog-fix-image-host.mjs               # đổi thật
 *   node scripts/blog-fix-image-host.mjs --tu api --sang apia   # đổi ngược lại (khi lùi)
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const arg = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const TU = arg('--tu', 'apia');
const SANG = arg('--sang', 'api');
const CU = `${TU}.toolswave.net`;
const MOI = `${SANG}.toolswave.net`;

const cfg = { ...process.env };
for (const f of ['.blog-autopost.env']) {
  const p = path.join(ROOT, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !cfg[m[1]]) cfg[m[1]] = m[2];
  }
}
const API = (cfg.TW_API_BASE || 'https://api.toolswave.net/v1').replace(/\/+$/, '');
if (!cfg.TW_TOKEN) {
  console.error('✗ thiếu TW_TOKEN trong .blog-autopost.env');
  process.exit(1);
}
const H = { Authorization: `Bearer ${cfg.TW_TOKEN}`, 'content-type': 'application/json; charset=utf-8' };
const log = (m) => console.log(`${new Date().toISOString().slice(11, 19)}  ${m}`);

log(`đổi "${CU}" → "${MOI}"${DRY ? '  (--dry-run)' : ''}`);
log(`gọi API tại ${API}`);

// Lấy hết bài, duyệt mọi trang. Chỉ lấy trang đầu thì kho quá 50 bài là lặng lẽ bỏ sót phần đuôi.
const posts = [];
for (let page = 1; page <= 40; page += 1) {
  const r = await fetch(`${API}/admin/blog?page=${page}&pageSize=50`, { headers: H });
  if (!r.ok) {
    console.error(`✗ không đọc được danh sách bài: HTTP ${r.status}`);
    process.exit(1);
  }
  const d = await r.json();
  posts.push(...(d.items ?? []));
  if ((d.items ?? []).length < 50) break;
}
log(`${posts.length} bài`);

const thay = (s) => (typeof s === 'string' ? s.split(CU).join(MOI) : s);

let doi = 0;
let anh = 0;
let hong = 0;
for (const p of posts) {
  try {
    const full = await (await fetch(`${API}/admin/blog/${p.id}`, { headers: H })).json();
    // PHẢI gồm coverImage. Bản đầu chỉ xét content + i18n và bỏ sót nó — kết quả là thân bài sửa
    // xong nhưng ẢNH BÌA vẫn trỏ địa chỉ cũ, nên thumbnail trên /blog vỡ hết. Đúng lỗi người dùng
    // báo "icon và thumbnail biến mất", và nó không lộ ra ở phép đo nào của tôi vì tôi chỉ đếm
    // trong nội dung.
    const truoc = JSON.stringify({ content: full.content, i18n: full.i18n, coverImage: full.coverImage });
    if (!truoc.includes(CU)) continue;

    const soAnh = (truoc.match(new RegExp(CU.replace(/\./g, '\\.'), 'g')) || []).length;
    const body = { content: thay(full.content) };
    if (full.coverImage) body.coverImage = thay(full.coverImage);
    if (full.i18n && Object.keys(full.i18n).length) {
      body.i18n = {};
      for (const [loc, tr] of Object.entries(full.i18n)) {
        body.i18n[loc] = {};
        for (const [k, v] of Object.entries(tr)) body.i18n[loc][k] = thay(v);
      }
    }

    if (DRY) {
      log(`  [xem] ${p.slug.slice(0, 54)} — ${soAnh} chỗ`);
      doi += 1;
      anh += soAnh;
      continue;
    }
    const r = await fetch(`${API}/admin/blog/${p.id}`, { method: 'PATCH', headers: H, body: JSON.stringify(body) });
    const raw = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status} — ${raw.slice(0, 140)}`);
    log(`  ${p.slug.slice(0, 54)} — đổi ${soAnh} chỗ`);
    doi += 1;
    anh += soAnh;
  } catch (e) {
    log(`  ${p.slug.slice(0, 54)} — HỎNG: ${e.message}`);
    hong += 1;
  }
}
log(`xong: ${doi} bài · ${anh} chỗ · ${hong} hỏng`);
if (hong) process.exitCode = 1;
