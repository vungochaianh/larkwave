#!/usr/bin/env node
/**
 * Đẩy bản dịch đã soạn sẵn lên bài, qua PATCH /admin/blog/:id.
 *
 * VÌ SAO KHÔNG DỊCH Ở MÁY CHỦ. Bản trước đặt việc dịch thành một đầu API gọi Anthropic ngay trong
 * BlogService. Sai ở hai điểm: nó buộc module blog phụ thuộc vào engine AI, và nó bắt việc dịch
 * phải chờ một khoá AI còn hiệu lực trên máy chủ — khoá hỏng là không dịch được bài nào, dù nội
 * dung đã nằm sẵn trong tay. Dịch là việc của bên SOẠN nội dung, còn máy chủ chỉ cần biết nhận và
 * lưu; API đã nhận `i18n` từ lúc thêm cột nên không cần gì thêm.
 *
 * Dùng:
 *   node scripts/blog-push-translation.mjs <file.json> [--slug <slug>] [--locale en]
 *   node scripts/blog-push-translation.mjs --dir C:/tw/posts --locale en
 *
 * Nhận HAI dạng file, cùng tên `_<locale>_<slug>`:
 *   .json  { title, excerpt, content, seoTitle, seoDescription }
 *   .md     bốn dòng khai ở đầu, một dòng `---`, rồi phần thân Markdown
 *
 * Dạng .md có vì thân bài là Markdown nhiều dòng: nhét nguyên nó vào một chuỗi JSON nghĩa là phải
 * thoát từng dấu xuống dòng và từng dấu nháy, và chỉ cần sai một chỗ là hỏng cả file mà thông báo
 * lỗi lại chỉ nói "JSON không hợp lệ". Để thân bài nằm nguyên dạng thì viết và đọc lại đều dễ.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const LOCALE = arg('--locale', 'en');
const DIR = arg('--dir', '');

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
const H = { Authorization: `Bearer ${cfg.TW_TOKEN}`, 'content-type': 'application/json; charset=utf-8' };
const log = (m) => console.log(`${new Date().toISOString().slice(11, 19)}  ${m}`);

// Bản đồ slug → id, lấy một lần. Duyệt hết các trang: kho quá 50 bài mà chỉ lấy trang đầu thì
// những bài cuối lặng lẽ không bao giờ được đẩy.
const bySlug = new Map();
for (let page = 1; page <= 40; page += 1) {
  const r = await fetch(`${API}/admin/blog?page=${page}&pageSize=50&status=published`, { headers: H });
  if (!r.ok) { console.error(`✗ không đọc được danh sách bài: HTTP ${r.status}`); process.exit(1); }
  const d = await r.json();
  for (const p of d.items ?? []) bySlug.set(p.slug, p.id);
  if ((d.items ?? []).length < 50) break;
}

/** Đọc file dịch, nhận cả .json lẫn .md có phần khai ở đầu. */
function readTranslation(file) {
  const raw = readFileSync(file, 'utf8');
  if (file.endsWith('.json')) return JSON.parse(raw);
  const sep = String.fromCharCode(10) + '---' + String.fromCharCode(10);
  const i = raw.indexOf(sep);
  if (i < 0) throw new Error('file .md thiếu dòng --- ngăn phần khai với phần thân');
  const out = { content: raw.slice(i + sep.length).trim() };
  for (const line of raw.slice(0, i).split(String.fromCharCode(10))) {
    const m = line.match(/^(title|excerpt|seoTitle|seoDescription): *(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const jobs = [];
if (DIR) {
  for (const f of readdirSync(DIR)) {
    const m = f.match(new RegExp(`^_${LOCALE}_(.+)\.(json|md)$`));
    if (m) jobs.push({ slug: m[1], file: path.join(DIR, f) });
  }
} else {
  const file = argv.find((a) => a.endsWith('.json') || a.endsWith('.md'));
  if (!file) { console.error('✗ cần một file .json/.md hoặc --dir'); process.exit(1); }
  const slug = arg('--slug', path.basename(file).replace(new RegExp(`^_${LOCALE}_`), '').replace(/\.(json|md)$/, ''));
  jobs.push({ slug, file });
}
log(`${jobs.length} bản dịch sẽ đẩy (ngôn ngữ '${LOCALE}')`);

let ok = 0, fail = 0;
for (const [i, j] of jobs.entries()) {
  const label = `[${i + 1}/${jobs.length}] ${j.slug.slice(0, 56)}`;
  try {
    const id = bySlug.get(j.slug);
    if (!id) throw new Error('không tìm thấy bài có slug này');
    const tr = readTranslation(j.file);
    // Thiếu một trong hai là bản dịch không dùng được: máy chủ chỉ khai ngôn ngữ khi có ĐỦ tiêu
    // đề lẫn thân bài, nên đẩy lên cũng không ai đọc tới.
    if (!tr.title || !tr.content) throw new Error('thiếu title hoặc content');
    const r = await fetch(`${API}/admin/blog/${id}`, {
      method: 'PATCH', headers: H, body: JSON.stringify({ i18n: { [LOCALE]: tr } }),
    });
    const raw = await r.text();
    let body = {};
    try { body = JSON.parse(raw); } catch { /* HTML (trang lỗi) — giữ nguyên văn để đọc */ }
    if (!r.ok) throw new Error(body?.message || `HTTP ${r.status} — ${raw.slice(0, 140)}`);
    log(`${label} — xong · locales: ${JSON.stringify(body.locales)}`);
    ok += 1;
  } catch (e) {
    log(`${label} — HỎNG: ${e.message}`);
    fail += 1;
  }
}
log(`xong: ${ok} đẩy được · ${fail} hỏng`);
if (fail) process.exitCode = 1;
