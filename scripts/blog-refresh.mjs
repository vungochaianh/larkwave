#!/usr/bin/env node
/**
 * Viết lại NỘI DUNG của những bài đã đăng mà đang có vấn đề, GIỮ NGUYÊN slug.
 *
 * Vì sao giữ slug thay vì xoá rồi đăng lại: URL cũ đã nằm trong sitemap, đã gửi IndexNow, và có
 * thể đã được chia sẻ. Xoá là biến chúng thành 404 — mất sạch thứ đã gây dựng, để đổi lấy một bài
 * mà đằng nào cũng nói cùng chủ đề. Dùng PATCH /admin/blog/:id thì URL sống nguyên.
 *
 * Việc cụ thể nó sinh ra để làm: mười ba bài đầu được sinh khi chưa có blog-brand.md, nên bảy bài
 * trong đó khuyên người đọc dùng WordPress / Shopify / Haravan — ta trả tiền sinh nội dung để đẩy
 * người đọc sang đối thủ.
 *
 * Dùng:  node scripts/blog-refresh.mjs [--dry-run] [--limit N] [--slug <slug>]
 *
 * Mặc định chỉ chọn bài TRƯỢT luật thương hiệu (nhắc đối thủ, hoặc không nhắc Toolswave lần nào
 * trong chữ). Dùng --slug để chỉ định một bài cụ thể.
 */
import { readFileSync, existsSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { submitToIndexNow, SITE_HOST } from './lib/indexnow.mjs';
import { brandProblem } from './lib/brand.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const flag = (n) => (argv.indexOf(n) >= 0 ? argv[argv.indexOf(n) + 1] : null);
const ONLY_SLUG = flag('--slug');
const LIMIT = Number(flag('--limit')) || 20;

const SHARED = path.join(ROOT, 'packages/shared/dist/index.js');
if (!existsSync(SHARED)) {
  console.error('✗ Chưa dựng @larkwave/shared. Chạy:  pnpm --filter @larkwave/shared build');
  process.exit(1);
}
const { deriveSeoTitle, deriveSeoDescription, deriveTags, deriveCategory } = await import(
  pathToFileURL(SHARED).href
);

const cfg = { ...process.env };
for (const f of ['.blog-autopost.env', '.lark-report.env']) {
  const p = path.join(ROOT, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) cfg[m[1]] = m[2];
  }
}
const API = (cfg.TW_API_BASE || 'https://api.toolswave.net/v1').replace(/\/$/, '');
const TOKEN = cfg.TW_TOKEN;
const IMAGES = Math.max(0, Math.min(6, Number(cfg.TW_IMAGES ?? 3)));
const TEMPLATES = ['howto', 'listicle', 'news', 'story'];

const log = (m) => console.log(`${new Date().toISOString().slice(0, 19).replace('T', ' ')}  ${m}`);
const die = (m) => {
  console.error(`✗ ${m}`);
  process.exit(1);
};
if (!TOKEN) die('Thiếu TW_TOKEN trong .blog-autopost.env');

/** Bản mô tả sản phẩm — cùng nguồn với script đăng bài, để hai đường không trôi lệch. */
function brandBrief() {
  const f = path.join(ROOT, cfg.TW_BRAND_FILE || 'blog-brand.md');
  if (!existsSync(f)) return '';
  return readFileSync(f, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .filter((l) => !l.startsWith('#'))
    .join('\n')
    .trim();
}
const BRIEF = brandBrief();
if (!BRIEF) die('Không đọc được blog-brand.md — viết lại mà thiếu bản mô tả thì bài mới cũng hỏng như bài cũ.');

/**
 * Khoá chống chạy chồng.
 *
 * Từ khi site-check chạy mỗi 5 tiếng và TỰ GỌI script này, hai lượt có thể gối lên nhau: một lượt
 * mất tới hơn một giờ cho 13 bài. Hai tiến trình cùng PATCH một bài thì bài cuối ghi đè bài đầu,
 * và cả hai đều tốn một lượt sinh nội dung — trả tiền hai lần cho một kết quả.
 *
 * Khoá cũ quá 3 giờ coi như rác của một tiến trình đã chết (máy tắt giữa chừng, phiên bị giết) và
 * bị bỏ qua: một khoá kẹt vĩnh viễn còn tệ hơn chạy chồng, vì nó làm im lặng mọi lượt sau.
 */
const LOCK = path.join(ROOT, '.blog-refresh.lock');
const STALE_MS = 3 * 60 * 60_000;
if (!DRY && existsSync(LOCK)) {
  const age = Date.now() - statSync(LOCK).mtimeMs;
  if (age < STALE_MS) {
    log(`đang có lượt viết lại khác chạy (khoá ${Math.round(age / 60000)} phút tuổi) — bỏ lượt này.`);
    process.exit(0);
  }
  log(`khoá cũ ${Math.round(age / 60000)} phút tuổi, coi như tiến trình đã chết — chạy tiếp.`);
}
if (!DRY) {
  writeFileSync(LOCK, String(process.pid));
  const release = () => {
    try {
      unlinkSync(LOCK);
    } catch {
      /* đã bị xoá thì thôi */
    }
  };
  process.on('exit', release);
  process.on('SIGINT', () => process.exit(130));
  process.on('SIGTERM', () => process.exit(143));
}

async function call(method, route, body) {
  const res = await fetch(`${API}${route}`, {
    method,
    headers: { authorization: `Bearer ${TOKEN}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${route} → HTTP ${res.status} ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

async function waitBuilt(id, maxMs = 15 * 60_000) {
  const deadline = Date.now() + maxMs;
  let last = '';
  while (Date.now() < deadline) {
    const p = await call('GET', `/makeblog/${id}`);
    if (p.stage && p.stage !== last) {
      last = p.stage;
      log(`     … ${p.stage}`);
    }
    if (p.status === 'done') return p;
    if (p.status === 'error') throw new Error(p.error || 'makeblog báo lỗi');
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error('quá hạn chờ sinh bài');
}

// ── chọn bài cần sửa ─────────────────────────────────────────────────────────
log('đọc bài đã đăng…');
const list = await (await fetch(`${API}/blog?page=1&pageSize=200`)).json();
const full = [];
for (const p of list.items ?? []) full.push(await (await fetch(`${API}/blog/${p.slug}`)).json());

const targets = full
  .map((p) => ({ post: p, problem: brandProblem(p) }))
  .filter((x) => (ONLY_SLUG ? x.post.slug === ONLY_SLUG : !!x.problem))
  .slice(0, LIMIT);

if (!targets.length) {
  log('không có bài nào cần sửa.');
  process.exit(0);
}
log(`${targets.length} bài cần viết lại:`);
for (const t of targets) log(`   • ${t.post.slug} — ${t.problem ?? '(chỉ định thủ công)'}`);
if (DRY) {
  log('dry-run: dừng ở đây.');
  process.exit(0);
}

// ── viết lại từng bài ────────────────────────────────────────────────────────
const done = [];
const failed = [];
for (const [i, t] of targets.entries()) {
  const post = t.post;
  // Chủ đề lấy từ TIÊU ĐỀ bài cũ: giữ đúng đề tài, chỉ đổi cách viết. Thẻ cũ cũng giữ, vì chúng
  // do người đặt ở blog-topics.txt và đã đúng.
  const topic = post.title;
  const tags = Array.isArray(post.tags) ? post.tags.filter((x) => !TEMPLATES.includes(x)) : [];
  const template = TEMPLATES[i % TEMPLATES.length];
  log(`[${i + 1}/${targets.length}] ${post.slug}  (${template})`);
  try {
    const joined = `${topic}\n\n${BRIEF}`;
    const proj = await call('POST', '/makeblog', {
      topic: joined.length <= 2000 ? joined : joined.slice(0, 1997) + '…',
      template,
      count: IMAGES,
    });
    const built = await waitBuilt(proj.id);
    if (!String(built.body || '').trim()) throw new Error('bài sinh ra rỗng');

    const stillBad = brandProblem({ content: built.body });
    if (stillBad) throw new Error(`bài mới VẪN hỏng (${stillBad}) — không ghi đè lên bài cũ`);

    const description = deriveSeoDescription(built.caption || '', built.body || '');
    await call('PATCH', `/admin/blog/${post.id}`, {
      // KHÔNG gửi `slug`: giữ nguyên URL cũ, đó là toàn bộ lý do dùng PATCH thay vì đăng mới.
      title: built.title || post.title,
      content: built.body,
      excerpt: description || undefined,
      coverImage: built.coverUrl || post.coverImage || undefined,
      status: 'published',
      tags: deriveTags(topic, built.title, template, 5, tags),
      seoTitle: deriveSeoTitle(built.title || post.title),
      seoDescription: description || undefined,
      category: deriveCategory(topic, built.title || post.title),
    });
    // Nội dung đổi thì phải báo lại cho công cụ tìm kiếm, không thì chúng còn giữ bản cũ.
    await submitToIndexNow([`https://${SITE_HOST}/blog/${post.slug}`]);
    done.push(post.slug);
    log(`     ✓ đã viết lại, URL giữ nguyên`);
  } catch (e) {
    failed.push({ slug: post.slug, error: e.message });
    log(`     ✗ ${e.message}`);
  }
}

log(`xong: ${done.length} viết lại được, ${failed.length} lỗi`);

if (cfg.TG_TOKEN && cfg.TG_CHAT_ID) {
  const lines = [`♻️ <b>Viết lại bài blog</b> — ${new Date().toLocaleString('vi-VN')}`, ''];
  for (const s of done) lines.push(`✓ <a href="https://${SITE_HOST}/blog/${s}">${s}</a>`);
  for (const f of failed) lines.push(`✗ ${f.slug} — ${f.error}`);
  lines.push('', 'URL giữ nguyên, không bài nào thành 404.');
  await fetch(`https://api.telegram.org/bot${cfg.TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: Number(cfg.TG_CHAT_ID),
      ...(cfg.TG_THREAD_ID ? { message_thread_id: Number(cfg.TG_THREAD_ID) } : {}),
      text: lines.join('\n'),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  }).catch(() => undefined);
}

process.exit(failed.length && !done.length ? 1 : 0);
