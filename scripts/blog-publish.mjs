#!/usr/bin/env node
/**
 * Đăng một bài blog viết sẵn, song ngữ, qua POST /admin/blog.
 *
 * VÌ SAO KHÔNG DÙNG /makeblog. Đường cũ là: gửi chủ đề cho /makeblog → MAIC sinh bài → đăng. Nó
 * kéo theo hai chỗ có thể chết mà chẳng liên quan gì tới việc đăng bài:
 *
 *   • MAIC phải đang chạy ở 127.0.0.1:5201. Đo ngày 22/09/2026: không có tiến trình nào nghe ở đó,
 *     không có unit systemd nào tên maic, và log API lặp ECONNREFUSED mỗi phút. Blog đứng ở 20 bài
 *     suốt từ 18/09 chỉ vì lý do đó.
 *   • MAIC lại nằm NGOÀI kho này (không có unit trong deploy/systemd), nên khi nó chết thì người
 *     giữ kho không dựng lại được.
 *
 * Nội dung vốn do người (hoặc trợ lý) viết. Bắt nó phải đi vòng qua một dịch vụ sinh nội dung chỉ
 * để tới được cơ sở dữ liệu là tự thêm một mắt xích có thể đứt. Script này bỏ mắt xích đó: bài
 * viết sẵn ở dạng file, đăng thẳng.
 *
 * DÙNG:
 *   node scripts/blog-publish.mjs content/blog-posts/<slug>.md [--dry-run]
 *   node scripts/blog-publish.mjs --dir content/blog-posts [--dry-run]
 *
 * ĐỊNH DẠNG FILE — phần khai ở đầu, một dòng `---`, rồi thân Markdown tiếng Việt:
 *
 *   slug: cach-lam-abc            (không bắt buộc; thiếu thì máy chủ tự suy từ tiêu đề)
 *   title: ...
 *   excerpt: ...
 *   tags: thẻ một, thẻ hai        (không bắt buộc; thiếu thì suy theo deriveTags)
 *   category: ...                 (không bắt buộc; thiếu thì suy theo deriveCategory)
 *   topic: ...                    (dòng trong blog-topics.txt, để ghi vào sổ đã dùng)
 *   ---
 *   Thân bài…
 *
 * Bản tiếng Anh để ở file cùng tên trong thư mục `en/` cạnh đó, cùng định dạng phần khai của
 * scripts/blog-push-translation.mjs. Không có thì bài lên một mình tiếng Việt, KHÔNG phải lỗi.
 */
import { readFileSync, existsSync, appendFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { submitToIndexNow, SITE_HOST } from './lib/indexnow.mjs';
import { themLienKetNoiBo, sinhAnhBia } from './lib/blog-bo-sung.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SHARED = path.join(ROOT, 'packages/shared/dist/index.js');
if (!existsSync(SHARED)) {
  console.error('✗ Chưa dựng @larkwave/shared. Chạy:  pnpm --filter @larkwave/shared build');
  process.exit(1);
}
const { deriveSeoTitle, deriveSeoDescription, deriveTags, deriveCategory, BLOG_CATEGORIES } =
  await import(pathToFileURL(SHARED).href);

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const arg = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
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
const TOKEN = cfg.TW_TOKEN;
if (!TOKEN) {
  console.error('✗ thiếu TW_TOKEN trong .blog-autopost.env');
  process.exit(1);
}
const H = { Authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json; charset=utf-8' };
const USED_FILE = path.join(ROOT, '.blog-autopost-used.txt');
const log = (m) => console.log(`${new Date().toISOString().slice(11, 19)}  ${m}`);
const NL = String.fromCharCode(10);

async function call(method, route, body) {
  const res = await fetch(`${API}${route}`, {
    method,
    headers: H,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${route} → HTTP ${res.status} ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/** Đọc file có phần khai ở đầu. Trả về { ...các khoá, content }. */
function readFront(file) {
  const raw = readFileSync(file, 'utf8');
  const sep = NL + '---' + NL;
  const i = raw.indexOf(sep);
  if (i < 0) throw new Error('thiếu dòng --- ngăn phần khai với phần thân');
  const out = { content: raw.slice(i + sep.length).trim() };
  for (const line of raw.slice(0, i).split(NL)) {
    const m = line.match(/^([a-zA-Z]+): *(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

/**
 * Kiểm luật thương hiệu TRƯỚC KHI đăng, không phải sau.
 *
 * Bộ soi seo-report vẫn bắt được bài vi phạm, nhưng lúc đó bài đã nằm trên site và đã được gửi
 * cho máy tìm kiếm. Bắt ở đây thì chưa ai thấy. Luật lấy đúng từ blog-brand.md: phải nhắc
 * Toolswave trong VĂN XUÔI (không tính URL ảnh), phải có liên kết tới /create-website, và không
 * được nêu tên đối thủ.
 */
const RIVALS = ['wordpress', 'shopify', 'wix', 'haravan', 'squarespace', 'webflow', 'ladipage'];
function brandCheck(title, body) {
  const prose = String(body || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\]\([^)]*\)/g, '] ')
    .replace(/https?:\/\/\S+/g, ' ')
    .toLowerCase();
  const problems = [];
  if (!prose.includes('toolswave')) problems.push('không nhắc Toolswave lần nào trong văn xuôi');
  if (!/\]\(\/create-website\)/.test(body)) problems.push('thiếu liên kết [.](/create-website)');
  const t = String(title || '').toLowerCase();
  // Đối thủ có trong TIÊU ĐỀ thì miễn trừ — đó là SEO cạnh tranh hợp lệ, xem lib/brand.mjs.
  const named = RIVALS.filter((r) => prose.includes(r) && !t.includes(r));
  if (named.length) problems.push(`nêu tên đối thủ: ${named.join(', ')}`);
  return problems;
}

const files = DIR
  ? readdirSync(DIR)
      .filter((f) => f.endsWith('.md'))
      .map((f) => path.join(DIR, f))
  : argv.filter((a) => a.endsWith('.md'));
if (!files.length) {
  console.error('✗ cần một file .md hoặc --dir');
  process.exit(1);
}
/**
 * Slug đã có trên site — để KHÔNG đăng lại bài cũ.
 *
 * Máy chủ tự làm slug thành duy nhất bằng cách thêm hậu tố (-2, -3…), nên chạy lại script trên
 * cùng thư mục sẽ không báo lỗi gì cả: nó lẳng lặng tạo bài thứ hai cùng nội dung ở một địa chỉ
 * khác. Hai bài trùng nội dung là thứ máy tìm kiếm phạt, và là thứ phải đi gỡ bằng tay.
 *
 * Thư mục bài viết vốn là kho lưu, không phải hàng đợi — bài đăng rồi vẫn nằm đó. Nên bỏ qua bài
 * đã có là hành vi ĐÚNG, không phải lỗi: cứ chạy lại cả thư mục, chỉ bài mới được đăng.
 */
const existing = new Set();
if (!DRY) {
  for (let page = 1; page <= 40; page += 1) {
    const d = await call('GET', `/admin/blog?page=${page}&pageSize=50`);
    for (const p of d.items ?? []) existing.add(p.slug);
    if ((d.items ?? []).length < 50) break;
  }
  log(`${existing.size} bài đã có trên site`);
}

log(`${files.length} bài sẽ đăng${DRY ? ' (--dry-run: không ghi gì)' : ''}`);

let ok = 0;
let fail = 0;
let skipped = 0;
for (const [i, file] of files.entries()) {
  const label = `[${i + 1}/${files.length}] ${path.basename(file).replace(/\.md$/, '').slice(0, 52)}`;
  try {
    const fm = readFront(file);
    if (!fm.title) throw new Error('thiếu title');
    if (!fm.content) throw new Error('thiếu thân bài');

    if (fm.slug && existing.has(fm.slug)) {
      log(`${label} — đã có trên site, bỏ qua`);
      skipped += 1;
      continue;
    }

    const problems = brandCheck(fm.title, fm.content);
    // DỪNG chứ không cảnh báo rồi đăng: một bài đẩy người đọc sang đối thủ, hoặc không nhắc sản
    // phẩm lần nào, là bài không đáng đăng — sửa rồi chạy lại rẻ hơn nhiều so với gỡ xuống sau.
    if (problems.length) throw new Error(`trượt luật thương hiệu: ${problems.join('; ')}`);

    /**
     * Chuyên mục tự đặt phải nằm trong danh sách ĐÓNG.
     *
     * Tab trên /blog dựng từ chuyên mục, nên mỗi tên mới là một tab mới. Chính tôi vừa suýt đăng
     * bài này với mục "Kiến thức" — nghe hợp lý, nhưng nó không có trong danh sách và sẽ đẻ ra
     * một tab chỉ chứa đúng một bài, lặng lẽ, không ai được báo. Thà chết ở đây.
     */
    if (fm.category && !BLOG_CATEGORIES.includes(fm.category)) {
      throw new Error(
        `chuyên mục "${fm.category}" không hợp lệ. Chọn một trong: ${BLOG_CATEGORIES.join(' · ')}` +
          ' (hoặc bỏ dòng category để tự suy)',
      );
    }

    const explicit = fm.tags ? fm.tags.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
    const topic = fm.topic || fm.title;
    const tags = deriveTags(topic, fm.title, undefined, 5, explicit);
    const excerpt = fm.excerpt || deriveSeoDescription('', fm.content);

    // Bản tiếng Anh nằm ở en/<tên file> cạnh bên. Không có thì đăng một mình tiếng Việt.
    const enFile = path.join(path.dirname(file), 'en', path.basename(file));
    let i18n;
    if (existsSync(enFile)) {
      const en = readFront(enFile);
      if (en.title && en.content) {
        i18n = {
          en: {
            title: en.title,
            excerpt: en.excerpt || null,
            content: en.content,
            seoTitle: en.seoTitle || null,
            seoDescription: en.seoDescription || null,
          },
        };
      }
    }

    /**
     * NGANG BẰNG với blog-autopost: liên kết nội bộ + ảnh bìa.
     *
     * Thiếu hai thứ này là lý do đúng 5 bài đăng bằng script hôm 22/09 kéo điểm SEO trung bình
     * xuống 73 — không phải xui, mà vì hai đường đăng bài không ngang nhau. Cả hai nay dùng chung
     * `lib/blog-bo-sung.mjs` để không trôi lệch lần nữa.
     *
     * Ảnh bìa tốn một lượt sinh ảnh, nên tôn trọng `cover:` khai sẵn trong file và bỏ qua khi
     * --dry-run. Sinh hỏng thì trả null và bài vẫn đăng: thiếu ảnh còn hơn không đăng được.
     */
    const noiDung = DRY ? fm.content : await themLienKetNoiBo(API, TOKEN, fm.content, tags);
    const anhBia = fm.cover || (DRY ? null : await sinhAnhBia(API, TOKEN, fm.title));
    if (!DRY && !anhBia) log(`${label} — ! không sinh được ảnh bìa, vẫn đăng`);

    const payload = {
      title: fm.title,
      ...(fm.slug ? { slug: fm.slug } : {}),
      content: noiDung,
      ...(anhBia ? { coverImage: anhBia } : {}),
      excerpt,
      status: 'published',
      tags,
      category: fm.category || deriveCategory(topic, fm.title),
      seoTitle: fm.seoTitle || deriveSeoTitle(fm.title),
      seoDescription: fm.seoDescription || excerpt,
      ...(i18n ? { i18n } : {}),
    };

    if (DRY) {
      log(`${label} — sẽ đăng · thẻ ${JSON.stringify(tags)} · mục "${payload.category}" · ${i18n ? 'kèm bản EN' : 'chỉ tiếng Việt'}`);
      ok += 1;
      continue;
    }

    const post = await call('POST', '/admin/blog', payload);
    log(`${label} — /blog/${post.slug} · ${JSON.stringify(post.locales)}`);

    // Ghi sổ CHỈ KHI đã đăng được, để lượt sau không đăng trùng mà lượt hỏng vẫn thử lại được.
    if (fm.topic) appendFileSync(USED_FILE, `${fm.topic}${NL}`);

    const inx = await submitToIndexNow([`https://${SITE_HOST}/blog/${post.slug}`]);
    log(`   ${inx.ok ? '↗' : '⚠'} IndexNow: HTTP ${inx.status}${inx.note ? ' — ' + inx.note : ''}`);
    ok += 1;
  } catch (e) {
    log(`${label} — HỎNG: ${e.message}`);
    fail += 1;
  }
}
log(`xong: ${ok} đăng được · ${skipped} bỏ qua (đã có) · ${fail} hỏng`);
if (fail) process.exitCode = 1;
