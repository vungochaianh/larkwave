#!/usr/bin/env node
/**
 * Soi SEO từng bài blog đã đăng, ghi vào một bảng Lark (tự tạo nếu chưa có), báo index, rồi gửi
 * tóm tắt.
 *
 * Vì sao là BẢNG chứ không phải một tin nhắn dài: một tin nhắn nói "trung bình 78 điểm" thì không
 * ai sửa được gì. Một bảng có từng bài, từng vấn đề, sắp được theo điểm thì mở ra là biết sửa bài
 * nào trước. Tin nhắn chỉ để BÁO là bảng vừa cập nhật.
 *
 * Dùng:  node scripts/seo-report.mjs [--dry-run] [--no-index]
 *
 * Cấu hình: .blog-autopost.env (dùng chung với script đăng bài) + .lark-report.env nếu muốn tách.
 *   LARK_APP_ID=, LARK_APP_SECRET=, LARK_HOST=https://open.larksuite.com
 *   LARK_BASE_TOKEN=N0Pubvc2ka8XaisoxcdjL5lRp2e     base "TOOLSWAVE"
 *   LARK_REPORT_TABLE=Báo cáo SEO (tự động)          tên bảng; tự tạo nếu chưa có
 *   LARK_CHAT_ID=                                    để trống = không gửi tin Lark
 *   TG_TOKEN=, TG_CHAT_ID=, TG_THREAD_ID=            gửi tóm tắt qua Telegram
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { submitToIndexNow, SITE_HOST } from './lib/indexnow.mjs';
import { auditPage, auditSite } from './lib/onpage.mjs';
import { brandProblem } from './lib/brand.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const NO_INDEX = argv.includes('--no-index');

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
const LARK = (cfg.LARK_HOST || 'https://open.larksuite.com').replace(/\/$/, '');
const BASE = cfg.LARK_BASE_TOKEN || 'N0Pubvc2ka8XaisoxcdjL5lRp2e';
const TABLE_NAME = cfg.LARK_REPORT_TABLE || 'Báo cáo SEO (tự động)';
const SITE_TABLE_NAME = cfg.LARK_SITE_TABLE || 'SEO tầng site (tự động)';

const log = (m) => console.log(`${new Date().toISOString().slice(0, 19).replace('T', ' ')}  ${m}`);
const die = (m) => {
  console.error(`✗ ${m}`);
  process.exit(1);
};

// ── soi SEO ───────────────────────────────────────────────────────────────────
/**
 * Ngưỡng lấy theo chỗ Google thật sự cắt, không phải theo cảm tính:
 * tiêu đề ~60 ký tự, mô tả ~155. Ngắn quá cũng trừ điểm — một mô tả 40 ký tự là bỏ phí chỗ
 * duy nhất mình được tự viết trên trang kết quả tìm kiếm.
 */
const RULES = [
  {
    key: 'seoTitle',
    weight: 20,
    check: (p) => {
      const n = (p.seoTitle || p.title || '').length;
      if (!n) return 'thiếu tiêu đề SEO';
      if (n > 60) return `tiêu đề ${n} ký tự — Google cắt quanh 60`;
      if (n < 25) return `tiêu đề chỉ ${n} ký tự — quá ngắn, phí chỗ`;
      return null;
    },
  },
  {
    key: 'seoDescription',
    weight: 20,
    check: (p) => {
      const n = (p.seoDescription || p.excerpt || '').length;
      if (!n) return 'thiếu mô tả SEO';
      if (n > 158) return `mô tả ${n} ký tự — bị cắt`;
      if (n < 70) return `mô tả chỉ ${n} ký tự — quá ngắn`;
      return null;
    },
  },
  {
    key: 'tags',
    weight: 15,
    check: (p) => {
      const t = Array.isArray(p.tags) ? p.tags : [];
      if (t.length < 2) return `chỉ ${t.length} thẻ — không đủ để liên kết nội bộ`;
      /**
       * Thẻ ngắn gần như luôn là chữ vụn cắt ra từ câu — trừ những từ mà bản thân nó ĐÃ là một chủ
       * đề hoàn chỉnh. Danh sách miễn trừ phải nêu đủ, không thì luật bắt người viết đổi một thẻ
       * đúng thành một thẻ dài hơn nhưng dở hơn.
       *
       * "api" bị bắt ngày 23/09/2026 trên hai bài mà chủ đề CHÍNH là API. Đổi nó thành "tích hợp
       * api" để qua luật là làm hỏng dữ liệu cho vừa lòng một phép đo — sửa phép đo mới đúng.
       */
      const NGAN_HOP_LE = /^(seo|ai|api|ui|ux|cms|crm|erp|sql|css|dns|ssl|pwa|seo)$/i;
      const junk = t.filter((x) => String(x).trim().length < 4 && !NGAN_HOP_LE.test(String(x).trim()));
      if (junk.length) return `thẻ vụn: ${junk.join(', ')}`;
      return null;
    },
  },
  {
    key: 'coverImage',
    weight: 10,
    check: (p) => (p.coverImage ? null : 'không có ảnh bìa — thẻ chia sẻ ra dạng nhỏ, ít người bấm'),
  },
  {
    key: 'content',
    weight: 25,
    check: (p) => {
      const n = (p.content || '').length;
      if (n < 1200) return `bài chỉ ${n} ký tự — trang mỏng, kéo tụt cả site`;
      return null;
    },
  },
  {
    key: 'slug',
    weight: 10,
    check: (p) => {
      const s = p.slug || '';
      if (s.length > 75) return `slug ${s.length} ký tự — dài quá, khó chia sẻ`;
      if (!/^[a-z0-9-]+$/.test(s)) return 'slug có ký tự lạ';
      return null;
    },
  },
  /**
   * Luật này cố ý đo thứ pipeline sinh bài KHÔNG kiểm soát.
   *
   * Lần chạy đầu cả 7 bài đều 100/100 — nhưng chúng do chính pipeline của tôi sinh ra, nên tiêu
   * đề / mô tả / thẻ dĩ nhiên nằm trong ngưỡng. Một bộ luật chỉ đo lại thứ mình vừa tự đặt thì
   * luôn cho điểm tuyệt đối và không phát hiện được gì.
   *
   * Đo liên kết TRONG THÂN BÀI, cố ý không tính khối "Bài liên quan" ở khung trang. Hai thứ đó
   * không tương đương: liên kết khung trang lặp lại y hệt trên mọi bài nên gần như không mang
   * trọng số, còn liên kết nằm giữa câu chữ thì có. Khối khung trang đã có rồi — luật này hỏi
   * một câu khác.
   */
  {
    key: 'internalLinks',
    weight: 20,
    check: (p, pg) => {
      /**
       * Ưu tiên số đo trên TRANG ĐÃ DỰNG (`signals.inBodyLinks`).
       *
       * Từ 23/09/2026 khối "Đọc thêm" được chèn lúc dựng trang, nên nội dung lưu trong cơ sở dữ
       * liệu không còn là thứ người đọc nhận được. Chấm theo nội dung lưu sẽ báo "không có liên
       * kết nội bộ nào" cho một trang thật sự có hai liên kết — bộ chấm nói sai về chính site mình.
       *
       * Chỉ lùi về đếm trong nội dung khi không soi được trang (mạng hỏng, trang 404): lúc đó thà
       * đo cái còn đo được còn hơn bỏ trống luật.
       */
      const doTrenTrang = pg?.signals?.inBodyLinks;
      if (typeof doTrenTrang === 'number') {
        if (!doTrenTrang) return 'thân bài không có liên kết nội bộ nào (khối "Bài liên quan" ở khung trang không tính)';
        return null;
      }
      const body = p.content || '';
      // Nhận CẢ địa chỉ tương đối lẫn tuyệt đối, và tuyệt đối phải là tên miền HIỆN TẠI.
      // Luật cũ chỉ chấp nhận app.toolswave.net — địa chỉ trước ngày hoán đổi 22/09/2026. Một bài
      // viết đúng chuẩn hôm nay, trỏ tới https://toolswave.net/blog/..., vẫn bị chấm "không có
      // liên kết nội bộ nào". Bộ chấm mà tự lạc hậu thì nó bắt người viết chạy theo một tiêu
      // chuẩn không còn tồn tại.
      const n = (
        body.match(
          /\]\((?:https?:\/\/toolswave\.net)?\/(?:blog|explore|pricing|create-website|download|support)\//g,
        ) || []
      ).length;
      if (!n) return 'thân bài không có liên kết nội bộ nào (khối "Bài liên quan" ở khung trang không tính)';
      return null;
    },
  },
  /**
   * Bài có nói về SẢN PHẨM không. Luật nằm ở scripts/lib/brand.mjs — dùng chung với script viết
   * lại bài, để hai bên không trôi lệch rồi một bên sửa mà bên kia vẫn kêu.
   *
   * Mười bài đầu đều đạt mọi luật kỹ thuật ở trên mà vẫn vô dụng về mặt kinh doanh: không nhắc
   * Toolswave lần nào trong chữ, lại còn khuyên người đọc dùng WordPress, Shopify, Haravan.
   */
  { key: 'brand', weight: 25, check: (p) => brandProblem(p) },
];

function audit(post, pg) {
  const issues = [];
  let score = 100;
  for (const r of RULES) {
    const problem = r.check(post, pg);
    if (problem) {
      issues.push(problem);
      score -= r.weight;
    }
  }
  return { score: Math.max(0, score), issues };
}

// ── Lark ──────────────────────────────────────────────────────────────────────
let TOKEN = null;
async function larkToken() {
  if (TOKEN) return TOKEN;
  const r = await (
    await fetch(`${LARK}/open-apis/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ app_id: cfg.LARK_APP_ID, app_secret: cfg.LARK_APP_SECRET }),
    })
  ).json();
  if (r.code !== 0) die(`Lark không cấp token: ${r.code} ${r.msg}`);
  TOKEN = r.tenant_access_token;
  return TOKEN;
}

async function lark(method, route, body) {
  const t = await larkToken();
  const r = await (
    await fetch(`${LARK}${route}`, {
      method,
      headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json; charset=utf-8' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  ).json();
  return r;
}

/** Cột của bảng báo cáo. type: 1 chữ · 2 số · 3 chọn một · 5 ngày · 7 tick · 15 link */
const FIELDS = [
  { field_name: 'Bài', type: 1 },
  { field_name: 'URL', type: 15 },
  { field_name: 'Điểm SEO', type: 2, property: { formatter: '0' } },
  { field_name: 'Vấn đề', type: 1 },
  { field_name: 'Tiêu đề (ký tự)', type: 2, property: { formatter: '0' } },
  { field_name: 'Mô tả (ký tự)', type: 2, property: { formatter: '0' } },
  { field_name: 'Số thẻ', type: 2, property: { formatter: '0' } },
  { field_name: 'Thẻ', type: 1 },
  { field_name: 'Độ dài bài', type: 2, property: { formatter: '0' } },
  { field_name: 'Ảnh bìa', type: 7 },
  { field_name: 'Lượt xem', type: 2, property: { formatter: '0' } },
  { field_name: 'Ngày đăng', type: 5, property: { date_formatter: 'yyyy/MM/dd', auto_fill: false } },
  { field_name: 'Soi lúc', type: 5, property: { date_formatter: 'yyyy/MM/dd HH:mm', auto_fill: false } },
  // ── đo trên TRANG RENDER, không phải trên bản ghi trong cơ sở dữ liệu ──
  { field_name: 'HTTP', type: 2, property: { formatter: '0' } },
  { field_name: 'Tải (ms)', type: 2, property: { formatter: '0' } },
  { field_name: '<title> (ký tự)', type: 2, property: { formatter: '0' } },
  { field_name: 'meta desc (ký tự)', type: 2, property: { formatter: '0' } },
  { field_name: 'Số H1', type: 2, property: { formatter: '0' } },
  { field_name: 'Ảnh thiếu alt', type: 2, property: { formatter: '0' } },
  { field_name: 'JSON-LD', type: 2, property: { formatter: '0' } },
  { field_name: 'Từ hiển thị', type: 2, property: { formatter: '0' } },
  { field_name: 'Lập chỉ mục được', type: 7 },
  { field_name: 'Trong sitemap', type: 7 },
  { field_name: 'Lỗi on-page', type: 1 },
];

/** Cột của bảng tầng site — một dòng một phép kiểm, để mở ra là biết cái nào đỏ. */
const SITE_FIELDS = [
  { field_name: 'Phép kiểm', type: 1 },
  { field_name: 'Kết quả', type: 3, property: { options: [{ name: 'Đạt' }, { name: 'Hỏng' }, { name: 'Cảnh báo' }] } },
  { field_name: 'Chi tiết', type: 1 },
  { field_name: 'Soi lúc', type: 5, property: { date_formatter: 'yyyy/MM/dd HH:mm', auto_fill: false } },
];

/**
 * Bổ sung những cột còn THIẾU vào một bảng đã tồn tại.
 *
 * Bảng được tạo ở lần chạy trước có bộ cột của lần đó. Thêm phép kiểm mới vào báo cáo là thêm cột,
 * và batch_create sẽ trả `FieldNameNotFound` cho cả lô — đúng chuyện vừa xảy ra, sau khi lệnh xoá
 * dòng cũ đã chạy, nên bảng nằm lại rỗng.
 *
 * Chỉ THÊM, không sửa và không xoá cột: cột thừa do người dùng tự thêm vào bảng là của họ, script
 * không có quyền dọn.
 */
async function addMissingFields(tableId, wanted) {
  const cur = await lark('GET', `/open-apis/bitable/v1/apps/${BASE}/tables/${tableId}/fields?page_size=200`);
  if (cur.code !== 0) die(`không đọc được cột của bảng: ${cur.code} ${cur.msg}`);
  const have = new Set((cur.data.items ?? []).map((f) => f.field_name));
  const missing = wanted.filter((f) => !have.has(f.field_name));
  if (!missing.length) return;
  for (const f of missing) {
    const r = await lark('POST', `/open-apis/bitable/v1/apps/${BASE}/tables/${tableId}/fields`, f);
    if (r.code !== 0) die(`không thêm được cột "${f.field_name}": ${r.code} ${r.msg}`);
  }
  log(`thêm ${missing.length} cột mới: ${missing.map((f) => f.field_name).join(', ')}`);
}

/** Tìm bảng theo TÊN, tạo nếu chưa có, và bổ sung cột còn thiếu. Trả về table_id. */
async function ensureTable(name = TABLE_NAME, fields = FIELDS) {
  const list = await lark('GET', `/open-apis/bitable/v1/apps/${BASE}/tables?page_size=100`);
  if (list.code !== 0) die(`không đọc được danh sách bảng: ${list.code} ${list.msg}`);
  const found = (list.data.items ?? []).find((t) => t.name === name);
  if (found) {
    log(`bảng "${name}" đã có (${found.table_id})`);
    await addMissingFields(found.table_id, fields);
    return found.table_id;
  }
  if (DRY) {
    log(`dry-run: sẽ TẠO bảng "${name}" với ${fields.length} cột`);
    return null;
  }
  const made = await lark('POST', `/open-apis/bitable/v1/apps/${BASE}/tables`, {
    table: { name, default_view_name: 'Tất cả', fields },
  });
  if (made.code !== 0) die(`không tạo được bảng: ${made.code} ${made.msg}`);
  log(`đã TẠO bảng "${name}" (${made.data.table_id})`);
  return made.data.table_id;
}

function rowFor(post, a) {
  const tags = Array.isArray(post.tags) ? post.tags : [];
  const pg = a.page; // kết quả soi TRANG THẬT; có thể vắng nếu tải hỏng
  const sg = pg?.signals ?? {};
  return {
    Bài: post.title || post.slug,
    URL: { link: `https://${SITE_HOST}/blog/${post.slug}`, text: post.slug },
    'Điểm SEO': a.score,
    'Vấn đề': a.issues.length ? a.issues.join(' · ') : 'không có',
    'Tiêu đề (ký tự)': (post.seoTitle || post.title || '').length,
    'Mô tả (ký tự)': (post.seoDescription || post.excerpt || '').length,
    'Số thẻ': tags.length,
    Thẻ: tags.join(', '),
    'Độ dài bài': (post.content || '').length,
    'Ảnh bìa': !!post.coverImage,
    'Lượt xem': post.views ?? 0,
    'Ngày đăng': post.publishedAt ? new Date(post.publishedAt).getTime() : undefined,
    'Soi lúc': Date.now(),
    HTTP: pg?.status ?? 0,
    'Tải (ms)': pg?.ms ?? 0,
    '<title> (ký tự)': sg.titleLen ?? 0,
    'meta desc (ký tự)': sg.descLen ?? 0,
    'Số H1': sg.h1s ?? 0,
    'Ảnh thiếu alt': sg.imgNoAlt ?? 0,
    'JSON-LD': sg.ldBlocks ?? 0,
    'Từ hiển thị': sg.words ?? 0,
    // "Lập chỉ mục được" = trang trả 200 và KHÔNG có noindex. Đây là điều kiện CẦN để lên kết quả
    // tìm kiếm, không phải bằng chứng đã lên — xem ghi chú ở phần tóm tắt.
    'Lập chỉ mục được': !!pg?.ok && !a.pageIssues.some((x) => x.startsWith('CHẶN LẬP CHỈ MỤC')),
    'Trong sitemap': !!a.inSitemap,
    'Lỗi on-page': a.pageIssues.length ? a.pageIssues.join(' · ') : 'không có',
  };
}

// ── chạy ──────────────────────────────────────────────────────────────────────
if (!cfg.LARK_APP_ID || !cfg.LARK_APP_SECRET) die('Thiếu LARK_APP_ID / LARK_APP_SECRET.');

log('đọc bài đã đăng…');
const posts = [];
for (let page = 1; page <= 20; page++) {
  const r = await (await fetch(`${API}/blog?page=${page}&pageSize=200`)).json();
  const items = r.items ?? [];
  posts.push(...items);
  if (items.length < 200) break;
}
if (!posts.length) die('Chưa có bài nào đã đăng — chạy scripts/blog-autopost.mjs trước.');

// Danh sách bài chỉ trả về bản rút gọn; phải lấy từng bài mới có content + seo* đầy đủ.
log(`có ${posts.length} bài — lấy chi tiết từng bài…`);
const full = [];
for (const p of posts) {
  try {
    full.push(await (await fetch(`${API}/blog/${p.slug}`)).json());
  } catch {
    full.push(p);
  }
}

// ── soi TRANG THẬT + tầng site ────────────────────────────────────────────────
//
// Phần này tách hẳn khỏi phần soi dữ liệu bên trên, và đó là điểm chính: soi bản ghi trong cơ sở
// dữ liệu KHÔNG thay được việc mở trang ra xem. Bằng chứng cụ thể: seoTitle trong DB dài 57 ký tự
// (đạt), nhưng layout gốc nối thêm "· Toolswave" nên <title> thật dài 70 — vượt đúng chỗ Google
// cắt. Dữ liệu đúng, trang sai, và báo cáo cũ cho 100 điểm.
const urls = full.map((p) => `https://${SITE_HOST}/blog/${p.slug}`);

log('soi tầng site (robots.txt, sitemap.xml, độ phủ)…');
const site = await auditSite(`https://${SITE_HOST}`, urls);
const inSitemap = new Set(urls.filter((u) => !site.missingFromSitemap.includes(u)));
const enPages = (site.en ?? []).length;
const enSot = (site.en ?? []).reduce((n, r) => n + r.sot.length, 0);

log(`mở ${urls.length} trang thật để soi on-page…`);
const pages = new Map();
for (const u of urls) {
  const r = await auditPage(u);
  pages.set(u, r);
  if (r.issues.length) log(`   ${r.issues.length} lỗi — ${u.split('/blog/')[1]}`);
}

const audited = full
  .map((p) => {
    const u = `https://${SITE_HOST}/blog/${p.slug}`;
    const pg = pages.get(u);
    const base = audit(p, pg);
    const pageIssues = pg?.issues ?? ['không soi được trang'];
    // Lỗi on-page trừ điểm THẬT, không chỉ ghi ra cho biết: một trang noindex hoặc 404 thì mọi
    // điểm nội dung bên trên đều vô nghĩa.
    const penalty = Math.min(40, pageIssues.length * 8);
    return {
      post: p,
      score: Math.max(0, base.score - penalty),
      issues: base.issues,
      page: pg,
      pageIssues,
      inSitemap: inSitemap.has(u),
    };
  })
  .sort((a, b) => a.score - b.score);
const avg = Math.round(audited.reduce((s, x) => s + x.score, 0) / audited.length);
const bad = audited.filter((x) => x.issues.length);

console.log('');
for (const x of audited) {
  console.log(`  ${String(x.score).padStart(3)}  ${x.post.slug}`);
  for (const i of x.issues) console.log(`       ↳ ${i}`);
  for (const i of x.pageIssues) console.log(`       ⌁ ${i}`);
}
console.log('');
console.log('  TẦNG SITE');
console.log(`       robots.txt HTTP ${site.robots.status ?? '?'} · khai sitemap: ${site.robots.declaresSitemap ? 'có' : 'KHÔNG'}`);
console.log(`       sitemap.xml HTTP ${site.sitemap.status ?? '?'} · ${site.sitemap.urls ?? 0} URL`);
console.log(`       bản tiếng Anh: ${enPages} trang soi · ${enSot} chuỗi tiếng Việt còn sót`);
for (const i of site.issues) console.log(`       ⌁ ${i}`);
console.log('');
log(`điểm trung bình ${avg}/100 — ${bad.length}/${audited.length} bài có vấn đề`);

// Báo index lại toàn bộ: rẻ, và bắt được bài từng gửi hỏng.
let indexNote = 'bỏ qua';
if (!NO_INDEX && !DRY) {
  const res = await submitToIndexNow([
    `https://${SITE_HOST}/blog`,
    ...full.map((p) => `https://${SITE_HOST}/blog/${p.slug}`),
  ]);
  indexNote = `HTTP ${res.status}${res.note ? ' — ' + res.note : ''}`;
  log(`IndexNow: ${indexNote}`);
}

const tableId = await ensureTable();
if (tableId && !DRY) {
  // Xoá sạch rồi ghi lại: bảng này là ẢNH CHỤP hiện trạng, không phải nhật ký. Giữ dòng cũ thì
  // mỗi lần chạy lại nhân đôi số dòng và không ai biết dòng nào còn đúng.
  const old = await lark('GET', `/open-apis/bitable/v1/apps/${BASE}/tables/${tableId}/records?page_size=500`);
  const oldIds = (old.data?.items ?? []).map((r) => r.record_id);
  if (oldIds.length) {
    await lark('POST', `/open-apis/bitable/v1/apps/${BASE}/tables/${tableId}/records/batch_delete`, {
      records: oldIds,
    });
    log(`xoá ${oldIds.length} dòng cũ`);
  }
  const records = audited.map((x) => ({ fields: rowFor(x.post, x) }));
  const w = await lark('POST', `/open-apis/bitable/v1/apps/${BASE}/tables/${tableId}/records/batch_create`, {
    records,
  });
  if (w.code !== 0) die(`ghi bảng thất bại: ${w.code} ${w.msg}`);
  log(`ghi ${w.data.records.length} dòng vào bảng`);

  // ── bảng thứ hai: tầng site ──
  // Tách bảng chứ không nhét chung: mỗi dòng ở đây là MỘT PHÉP KIỂM của cả site, không phải một
  // bài. Nhét chung một bảng thì hai loại dòng có ý nghĩa khác nhau nằm lẫn, không lọc được.
  const siteTable = await ensureTable(SITE_TABLE_NAME, SITE_FIELDS);
  if (siteTable) {
    const oldS = await lark('GET', `/open-apis/bitable/v1/apps/${BASE}/tables/${siteTable}/records?page_size=500`);
    const oldSIds = (oldS.data?.items ?? []).map((r) => r.record_id);
    if (oldSIds.length)
      await lark('POST', `/open-apis/bitable/v1/apps/${BASE}/tables/${siteTable}/records/batch_delete`, {
        records: oldSIds,
      });
    const now = Date.now();
    const checks = [
      ['robots.txt tải được', site.robots.status === 200, `HTTP ${site.robots.status ?? '?'}`],
      ['robots.txt khai sitemap', !!site.robots.declaresSitemap, site.robots.declaresSitemap ? 'có dòng Sitemap:' : 'thiếu'],
      ['sitemap.xml tải được', site.sitemap.status === 200, `HTTP ${site.sitemap.status ?? '?'}`],
      ['sitemap có URL', (site.sitemap.urls ?? 0) > 0, `${site.sitemap.urls ?? 0} URL`],
      ['mọi bài có trong sitemap', site.missingFromSitemap.length === 0,
        site.missingFromSitemap.length ? `thiếu ${site.missingFromSitemap.length}` : 'đủ'],
      ['mọi trang trả HTTP 200', audited.every((x) => x.page?.ok),
        `${audited.filter((x) => x.page?.ok).length}/${audited.length}`],
      ['không trang nào bị noindex',
        !audited.some((x) => x.pageIssues.some((i) => i.startsWith('CHẶN LẬP CHỈ MỤC'))),
        'meta robots + header X-Robots-Tag'],
      ['mọi trang có canonical đúng',
        !audited.some((x) => x.pageIssues.some((i) => i.includes('canonical'))), 'canonical tự trỏ'],
      ['mọi trang có JSON-LD',
        !audited.some((x) => x.pageIssues.some((i) => i.includes('JSON-LD'))), 'dữ liệu có cấu trúc'],
      ['tiêu đề render không quá 60 ký tự',
        !audited.some((x) => x.pageIssues.some((i) => i.includes('<title>'))), 'đo trên trang render'],
      // Phép kiểm này phải có mặt cả khi ĐẠT. Một phép kiểm chỉ hiện lúc hỏng thì không ai biết nó
      // có chạy hay không — và đó chính là cách bản tiếng Anh hỏng lặng lẽ suốt thời gian trước.
      ['bản tiếng Anh không lẫn tiếng Việt', enSot === 0,
        `${enPages} trang soi · ${enSot} chuỗi sót`],
    ];
    const rows = checks.map(([name, pass, detail]) => ({
      fields: { 'Phép kiểm': name, 'Kết quả': pass ? 'Đạt' : 'Hỏng', 'Chi tiết': detail, 'Soi lúc': now },
    }));
    const ws = await lark('POST', `/open-apis/bitable/v1/apps/${BASE}/tables/${siteTable}/records/batch_create`, {
      records: rows,
    });
    log(ws.code === 0 ? `ghi ${rows.length} phép kiểm vào bảng tầng site` : `ghi bảng site lỗi: ${ws.code} ${ws.msg}`);
  }
}

// ── báo tin ───────────────────────────────────────────────────────────────────
const summary = [
  `📊 <b>Báo cáo SEO blog</b> — ${new Date().toLocaleString('vi-VN')}`,
  '',
  `Bài đã đăng: <b>${audited.length}</b>`,
  `Điểm trung bình: <b>${avg}/100</b>`,
  `Bài có vấn đề: <b>${bad.length}</b>`,
  `IndexNow: ${indexNote}`,
  '',
  ...(bad.length
    ? ['<b>Cần sửa trước:</b>', ...bad.slice(0, 5).map((x) => `• ${x.post.slug} (${x.score}) — ${x.issues[0]}`)]
    : ['Không bài nào có vấn đề.']),
  '',
  `Bảng chi tiết: "${TABLE_NAME}" trong base TOOLSWAVE.`,
].join('\n');

if (!DRY && cfg.TG_TOKEN && cfg.TG_CHAT_ID) {
  const r = await (
    await fetch(`https://api.telegram.org/bot${cfg.TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: Number(cfg.TG_CHAT_ID),
        ...(cfg.TG_THREAD_ID ? { message_thread_id: Number(cfg.TG_THREAD_ID) } : {}),
        text: summary,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    })
  ).json();
  log(`Telegram: ${r.ok ? 'đã gửi' : 'lỗi ' + r.description}`);
}

/**
 * Tin nhắn Lark: chỉ gửi khi có LARK_CHAT_ID.
 *
 * App Lark hiện KHÔNG gửi tin được — `im/v1/chats` trả 232025 "Bot ability is not activated".
 * Đó là công tắc trong Developer Console (Thêm tính năng → Bot), không phải thiếu scope. Bật xong
 * thì mời bot vào nhóm, lấy chat_id từ im/v1/chats, điền vào .lark-report.env là chạy.
 */
if (!DRY && cfg.LARK_CHAT_ID) {
  const plain = summary.replace(/<[^>]+>/g, '');
  const r = await lark('POST', '/open-apis/im/v1/messages?receive_id_type=chat_id', {
    receive_id: cfg.LARK_CHAT_ID,
    msg_type: 'text',
    content: JSON.stringify({ text: plain }),
  });
  log(`Lark: ${r.code === 0 ? 'đã gửi' : 'lỗi ' + r.code + ' ' + r.msg}`);
} else if (!DRY) {
  log('Lark: bỏ qua (chưa có LARK_CHAT_ID — cần bật Bot trong Developer Console trước)');
}

log('xong');
