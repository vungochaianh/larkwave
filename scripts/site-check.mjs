#!/usr/bin/env node
/**
 * Soi toàn bộ website, ghi mọi lỗi tìm được vào một bảng Lark, rồi TỰ SỬA những loại sửa được.
 *
 * NÓI RÕ RANH GIỚI NGAY TỪ ĐẦU, vì đây là chỗ dễ trông đợi nhầm nhất:
 *
 *   TỰ SỬA ĐƯỢC — những loại có định nghĩa chặt và có đường sửa bằng dữ liệu:
 *     • bài blog quảng cáo đối thủ hoặc không nhắc sản phẩm  → gọi blog-refresh.mjs
 *     • trang mới chưa báo cho công cụ tìm kiếm              → gửi IndexNow
 *
 *   KHÔNG TỰ SỬA ĐƯỢC — chỉ GHI VÀO BẢNG để người xử lý:
 *     • lỗi JavaScript, request hỏng, ảnh vỡ, tràn khung, liên kết gãy, lỗi logic
 *   Sửa những thứ đó là sửa MÃ NGUỒN rồi deploy. Một script chạy theo lịch không tự viết mã, và
 *   nếu nó tự sửa được thì cũng không nên: không ai xem lại trước khi lên production.
 *
 * Dùng:  node scripts/site-check.mjs [--dry-run] [--no-fix] [--limit N]
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditPage, auditSite } from './lib/onpage.mjs';
import { loadPlaywright, inspect, VIEWPORTS } from './lib/browser.mjs';
import { brandProblem } from './lib/brand.mjs';
import { submitToIndexNow, SITE_HOST } from './lib/indexnow.mjs';
import { notifyBlockedOnce } from './lib/notify.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const NO_FIX = argv.includes('--no-fix');
const LIMIT = Number(argv[argv.indexOf('--limit') + 1]) || 40;

const cfg = { ...process.env };
for (const f of ['.blog-autopost.env', '.lark-report.env']) {
  const p = path.join(ROOT, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) cfg[m[1]] = m[2];
  }
}
const SITE = `https://${SITE_HOST}`;
const API = (cfg.TW_API_BASE || 'https://api.toolswave.net/v1').replace(/\/$/, '');
const LARK = (cfg.LARK_HOST || 'https://open.larksuite.com').replace(/\/$/, '');
const BASE = cfg.LARK_BASE_TOKEN || 'N0Pubvc2ka8XaisoxcdjL5lRp2e';
const TABLE = cfg.LARK_BUG_TABLE || 'Lỗi website (tự động)';

const log = (m) => console.log(`${new Date().toISOString().slice(0, 19).replace('T', ' ')}  ${m}`);

// ── Lark ──────────────────────────────────────────────────────────────────────
let TK = null;
async function lark(method, route, body) {
  if (!TK) {
    const r = await (
      await fetch(`${LARK}/open-apis/auth/v3/tenant_access_token/internal`, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ app_id: cfg.LARK_APP_ID, app_secret: cfg.LARK_APP_SECRET }),
      })
    ).json();
    if (r.code !== 0) throw new Error(`Lark token: ${r.code} ${r.msg}`);
    TK = r.tenant_access_token;
  }
  return (
    await fetch(`${LARK}${route}`, {
      method,
      headers: { authorization: `Bearer ${TK}`, 'content-type': 'application/json; charset=utf-8' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  ).json();
}

const FIELDS = [
  { field_name: 'Lỗi', type: 1 },
  { field_name: 'Trang', type: 15 },
  {
    field_name: 'Loại',
    type: 3,
    property: { options: [{ name: 'SEO' }, { name: 'Logic' }, { name: 'UI/UX' }, { name: 'Hiệu năng' }] },
  },
  {
    field_name: 'Mức',
    type: 3,
    property: { options: [{ name: 'Nặng' }, { name: 'Vừa' }, { name: 'Nhẹ' }] },
  },
  {
    field_name: 'Tự sửa',
    type: 3,
    property: {
      options: [
        { name: 'Đã tự sửa' },
        { name: 'Sửa được, đang chờ' },
        { name: 'Phải sửa mã' },
        { name: 'Không phải lỗi trang' },
      ],
    },
  },
  { field_name: 'Khung nhìn', type: 1 },
  // ── vòng đời của một lỗi ──
  // Bảng này là SỔ THEO DÕI, không phải ảnh chụp. Bản đầu xoá sạch rồi ghi lại mỗi lượt, nên khi
  // một lỗi được sửa thì dòng của nó biến mất không dấu vết — không ai thấy được "lỗi này từng
  // có, đã sửa xong". Mà đó lại đúng là thứ cần thấy nhất.
  {
    field_name: 'Trạng thái',
    type: 3,
    property: { options: [{ name: 'Mới' }, { name: 'Còn' }, { name: 'Đã hết' }] },
  },
  { field_name: 'Lần đầu thấy', type: 5, property: { date_formatter: 'yyyy/MM/dd HH:mm', auto_fill: false } },
  { field_name: 'Lần cuối thấy', type: 5, property: { date_formatter: 'yyyy/MM/dd HH:mm', auto_fill: false } },
  { field_name: 'Hết lúc', type: 5, property: { date_formatter: 'yyyy/MM/dd HH:mm', auto_fill: false } },
  { field_name: 'Số lượt thấy', type: 2, property: { formatter: '0' } },
  // Bản mã lúc quan sát — để biết lỗi hết nhờ commit nào, thay vì đoán theo thời gian.
  { field_name: 'Bản mã', type: 1 },
];

async function ensureTable() {
  const list = await lark('GET', `/open-apis/bitable/v1/apps/${BASE}/tables?page_size=100`);
  const found = (list.data?.items ?? []).find((t) => t.name === TABLE);
  if (found) {
    // Bổ sung cột thiếu — bảng tạo từ lần chạy trước mang bộ cột của lần đó, thêm phép kiểm mới
    // mà không thêm cột thì batch_create trả FieldNameNotFound cho cả lô.
    const cur = await lark('GET', `/open-apis/bitable/v1/apps/${BASE}/tables/${found.table_id}/fields?page_size=200`);
    const have = new Set((cur.data?.items ?? []).map((f) => f.field_name));
    for (const f of FIELDS.filter((f) => !have.has(f.field_name))) {
      await lark('POST', `/open-apis/bitable/v1/apps/${BASE}/tables/${found.table_id}/fields`, f);
    }
    return found.table_id;
  }
  if (DRY) return null;
  const made = await lark('POST', `/open-apis/bitable/v1/apps/${BASE}/tables`, {
    table: { name: TABLE, default_view_name: 'Tất cả', fields: FIELDS },
  });
  if (made.code !== 0) throw new Error(`tạo bảng: ${made.code} ${made.msg}`);
  log(`đã TẠO bảng "${TABLE}" (${made.data.table_id})`);
  return made.data.table_id;
}

/**
 * Xếp loại một câu mô tả lỗi thành {loại, mức, tự sửa được}.
 *
 * So khớp trên bản đã BỎ DẤU CÂU, không so trên chuỗi thô. Bản đầu so thô và trượt ngay câu
 * "không có <h1>" — luật viết là `không có h1`, dấu ngoặc nhọn làm hỏng khớp, nên một lỗi đáng
 * mức Vừa rơi xuống Nhẹ qua đường luật mặc định. Cùng cái bẫy đã làm hàm gộp trùng không chạy.
 */
function classify(text) {
  const t = text.toLowerCase().replace(/[<>]/g, '');
  // Xếp TRƯỚC mọi luật khác. Nếu để luật "console error" bắt trước thì một lần quét quá nhanh của
  // chính mình bị ghi thành hàng chục lỗi Logic mức Nặng — đúng chuyện đã xảy ra suốt bốn lượt.
  if (/bộ soi chạy quá nhanh|429/.test(t))
    return { kind: 'Hiệu năng', level: 'Nhẹ', fix: 'Không phải lỗi trang' };
  if (/http [45]\d\d|không mở được|chặn lập chỉ mục|chặn toàn site/.test(t))
    return { kind: 'Logic', level: 'Nặng', fix: 'Phải sửa mã' };
  if (/lỗi javascript|console error|request hỏng/.test(t))
    return { kind: 'Logic', level: 'Nặng', fix: 'Phải sửa mã' };
  if (/tràn ngang|ảnh không tải được|không có chữ lẫn nhãn/.test(t))
    return { kind: 'UI/UX', level: 'Vừa', fix: 'Phải sửa mã' };
  // Thiếu H1 / title / mô tả / canonical KHÔNG phải lỗi nhẹ: đó là bốn tín hiệu cơ bản nhất mà
  // công cụ tìm kiếm đọc. Bản xếp loại đầu tiên cho chúng vào nhóm "Nhẹ" chỉ vì luật mặc định
  // rơi xuống cuối — tức là đánh giá theo thứ tự viết luật, không theo hậu quả.
  if (/không có h1|thẻ h1|không có <title>|không có meta description|không có canonical|canonical trỏ đi/.test(t))
    return { kind: 'SEO', level: 'Vừa', fix: 'Phải sửa mã' };
  if (/thiếu alt|thiếu lang/.test(t)) return { kind: 'UI/UX', level: 'Nhẹ', fix: 'Phải sửa mã' };
  if (/chậm|tải \d+ms/.test(t)) return { kind: 'Hiệu năng', level: 'Vừa', fix: 'Phải sửa mã' };
  if (/đối thủ|không nhắc toolswave|nhồi từ khoá/.test(t))
    return { kind: 'SEO', level: 'Nặng', fix: 'Sửa được, đang chờ' };
  if (/không có trong sitemap/.test(t)) return { kind: 'SEO', level: 'Vừa', fix: 'Sửa được, đang chờ' };
  return { kind: 'SEO', level: 'Nhẹ', fix: 'Phải sửa mã' };
}

// ── gom danh sách trang cần soi ──────────────────────────────────────────────
log('lấy danh sách trang từ sitemap…');
let urls = [];
try {
  const x = await (await fetch(`${SITE}/sitemap.xml`)).text();
  urls = [...x.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
} catch (e) {
  log(`không đọc được sitemap: ${e.message}`);
}
// Trang công khai quan trọng, kể cả khi sitemap sót.
//
// KHÔNG có '/welcome' và '/create-website' trong danh sách này, và đừng thêm lại:
//   • '/welcome' chuyển VĨNH VIỄN (308) về '/' — nó là một lối cũ, không phải một trang. Soi nó
//     chỉ đẻ ra lỗi "có chuyển hướng" lặp lại mỗi 5 tiếng, mà chuyển hướng ấy đúng và cố ý.
//   • '/create-website' đòi đăng nhập (307 sang /login) — nội dung thật nằm sau cửa, nên mọi phép
//     đo on-page ở đây đều đang đo trang đăng nhập chứ không đo nó.
// Cả hai còn kéo theo lỗi phụ "KHÔNG có trong sitemap", mà đưa chúng vào sitemap mới là sai thật:
// sitemap chỉ nên khai URL trả 200 và đọc được khi chưa đăng nhập.
for (const u of ['/', '/blog', '/pricing', '/explore', '/download', '/support']) {
  const full = `${SITE}${u}`;
  if (!urls.includes(full)) urls.push(full);
}
urls = [...new Set(urls)].slice(0, LIMIT);
log(`${urls.length} trang sẽ soi`);

// ── soi ──────────────────────────────────────────────────────────────────────
const findings = [];
/**
 * Gộp lỗi TRÙNG trên cùng một trang.
 *
 * Một lỗi như "không có H1" hiện ra ba lần: một lần từ HTML thô, một lần ở khung điện thoại, một
 * lần ở khung máy tính. Ba dòng cho một việc phải sửa làm bảng dày lên mà không thêm thông tin —
 * và làm con số tổng nói dối. Giữ một dòng, ghi lại mọi khung nhìn đã thấy nó.
 */
const seen = new Map();
// KHÔNG gỡ thẻ HTML ở đây: bản đầu dùng /<[^>]*>/ và nó nuốt luôn phần "h1" trong chuỗi
// "không có <h1>", nên chuỗi đó không khớp với "không có H1" của bản soi bằng trình duyệt —
// đúng cặp trùng mà hàm này sinh ra để gộp. Chỉ bỏ dấu câu là đủ.
const norm = (t) =>
  t
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
function add(text, url, viewport = '—') {
  const key = `${url}|${norm(text)}`;
  const hit = seen.get(key);
  if (hit) {
    if (viewport !== '—' && !hit.viewport.includes(viewport)) hit.viewport += `, ${viewport}`;
    return;
  }
  const f = { text, url, viewport, ...classify(text) };
  seen.set(key, f);
  findings.push(f);
}

const site = await auditSite(SITE, urls);
for (const i of site.issues) add(i, SITE);

const pw = loadPlaywright(ROOT);
let browser = null;
if (pw) {
  try {
    browser = await pw.chromium.launch({ headless: true });
  } catch (e) {
    log(`không mở được trình duyệt (${String(e.message).split('\n')[0].slice(0, 80)}) — chỉ soi HTML thô`);
  }
} else {
  log('không nạp được playwright — chỉ soi HTML thô');
}

/**
 * Giãn nhịp giữa các trang.
 *
 * nginx cho 600r/m = 10 request/giây từ một IP (deploy/nginx-toolswave.conf). Bộ soi quét 31 trang
 * × 2 khung nhìn liên tiếp, không nghỉ, nên nó tự đẩy mình qua ngưỡng rồi ghi 429 vào bảng như
 * thể website hỏng — và đập vào production thật, nơi có người dùng thật, mỗi 5 tiếng.
 *
 * Số lỗi bốn lượt liên tiếp: 118, 114, 104, 69 — trong khi mã nguồn không đổi. Lỗi thật không dao
 * động như vậy; giới hạn tốc độ thì có. Đó là dấu hiệu đầu tiên cho thấy thủ phạm là chính mình.
 */
const PAUSE_MS = Number(cfg.SITE_CHECK_PAUSE_MS || 1500);
for (const [i, u] of urls.entries()) {
  if (i > 0) await new Promise((r) => setTimeout(r, PAUSE_MS));
  const short = u.replace(SITE, '') || '/';
  process.stdout.write(`  [${i + 1}/${urls.length}] ${short}`);
  const before = findings.length;

  const raw = await auditPage(u);
  /**
   * HTML thô đúng cho phần <head> — thẻ meta, canonical, robots, JSON-LD nằm sẵn ở đó.
   * Nhưng nó SAI cho cấu trúc đã render, vì hai lý do ngược chiều nhau:
   *
   *   đếm thừa  React streaming để lại một bản trong `<div hidden id="S:0">`, và biểu thức chính
   *             quy không biết đường bỏ qua → "/register: 2 thẻ h1"
   *   đếm thiếu phần render phía trình duyệt chưa có trong HTML máy chủ → "/login: không có h1"
   *
   * Cùng một trang, hai kết luận trái ngược, và bộ soi bằng trình duyệt nói đúng ở cả hai. Nên khi
   * có kết quả trình duyệt thì những phép đo về CẤU TRÚC RENDER lấy từ đó, không lấy từ HTML thô.
   */
  const RENDERED_CHECKS = /h1|h2|ảnh thiếu alt|từ hiển thị|trang mỏng/i;
  for (const s of raw.issues) {
    if (browser && RENDERED_CHECKS.test(s)) continue;
    add(s, u, 'HTML thô');
  }

  if (browser) {
    for (const vp of VIEWPORTS) {
      try {
        const r = await inspect(browser, u, { viewport: vp });
        for (const s of r.issues) add(s, u, vp.name);
      } catch (e) {
        add(`soi bằng trình duyệt hỏng: ${String(e.message).split('\n')[0].slice(0, 120)}`, u, vp.name);
      }
    }
  }
  console.log(`  — ${findings.length - before} lỗi`);
}
if (browser) await browser.close();

// ── bài blog: luật thương hiệu ───────────────────────────────────────────────
let fixable = 0;
try {
  const list = await (await fetch(`${API}/blog?page=1&pageSize=200`)).json();
  for (const p of list.items ?? []) {
    const post = await (await fetch(`${API}/blog/${p.slug}`)).json();
    const bad = brandProblem(post);
    if (bad) {
      add(bad, `${SITE}/blog/${post.slug}`);
      fixable++;
    }
  }
} catch (e) {
  log(`không soi được bài blog: ${e.message}`);
}

console.log('');
const bySev = { Nặng: 0, Vừa: 0, Nhẹ: 0 };
for (const f of findings) bySev[f.level]++;

// In TỪNG lỗi ra log, gom theo trang. Chỉ in con số tổng thì lúc đọc lại log của một lượt chạy
// lúc 3 giờ sáng sẽ không biết nó đã thấy gì — mà bảng Lark thì bị lượt sau ghi đè.
const byPage = new Map();
for (const f of findings) {
  const k = f.url.replace(SITE, '') || '/';
  if (!byPage.has(k)) byPage.set(k, []);
  byPage.get(k).push(f);
}
for (const [page, list] of byPage) {
  console.log(`  ${page}`);
  for (const f of list) console.log(`     [${f.level}/${f.kind}] ${f.viewport !== '—' ? f.viewport + ': ' : ''}${f.text}`);
}
console.log('');
log(`TỔNG: ${findings.length} lỗi — nặng ${bySev['Nặng']} · vừa ${bySev['Vừa']} · nhẹ ${bySev['Nhẹ']}`);

// ── tự sửa phần sửa được ─────────────────────────────────────────────────────
let fixedNote = 'không có lỗi nào thuộc loại tự sửa được';
if (!DRY && !NO_FIX && !fixable) log('tự sửa: không có bài blog nào trượt luật thương hiệu');
if (!DRY && !NO_FIX && fixable) {
  log(`tự sửa ${fixable} bài blog trượt luật thương hiệu…`);
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/blog-refresh.mjs')], {
      cwd: ROOT,
      stdio: 'inherit',
      timeout: 2 * 60 * 60_000,
    });
    fixedNote = `đã chạy viết lại cho ${fixable} bài`;
    for (const f of findings) if (f.fix === 'Sửa được, đang chờ') f.fix = 'Đã tự sửa';
  } catch (e) {
    fixedNote = `viết lại hỏng: ${String(e.message).slice(0, 120)}`;
  }
}
if (!DRY) {
  // Ghi log cả hai bước gửi đi. Trước đây chúng chạy IM LẶNG, nên đọc lại log của một lượt chạy
  // lúc 3 giờ sáng không biết được nó có gửi hay không — mà đó đúng là lúc cần biết nhất.
  const inx = await submitToIndexNow([`${SITE}/blog`, ...urls.filter((u) => u.includes('/blog/'))]);
  log(`IndexNow: HTTP ${inx.status}${inx.note ? ' — ' + inx.note : ''} (${inx.count ?? 0} URL)`);
  // 403 = file khoá chưa có trên site, nên KHÔNG có URL nào được báo index. Hỏng hoàn toàn im
  // lặng: script vẫn chạy, vẫn "thành công". Phải nhắn ra ngoài, nếu không nó chết âm thầm nhiều
  // ngày — đúng chuyện đã xảy ra.
  if (!inx.ok) {
    const r = await notifyBlockedOnce(cfg, `indexnow-${inx.status}`, {
      what: 'Báo index (IndexNow) đang hỏng',
      why: `Gửi ${inx.count ?? 0} URL nhưng máy chủ IndexNow trả HTTP ${inx.status}. ${inx.note ?? ''}`,
      need: 'Deploy web để file khoá lên site, rồi lượt soi sau sẽ tự trả về 200. Nếu vẫn 403 sau khi deploy thì khoá đã bị từ chối và cần đúc lại.',
    }, { root: ROOT });
    log(`   báo Telegram: ${r.ok ? 'đã gửi' : r.note}`);
  }
}

// ── ghi sổ theo dõi ─────────────────────────────────────────────────────────
//
// KHÔNG xoá rồi ghi lại. Đối chiếu theo dấu vân tay (trang + nội dung lỗi đã chuẩn hoá):
//   có trong lượt này, chưa có trong sổ   → dòng mới, trạng thái "Mới"
//   có cả hai                             → cập nhật "Lần cuối thấy", tăng số lượt, "Còn"
//   có trong sổ, KHÔNG có lượt này        → "Đã hết" + ghi "Hết lúc"
//
// Nhánh thứ ba mới là phần bạn cần: nó chính là bản ghi của một lỗi ĐÃ SỬA. Ảnh chụp thì mất.
let ledger = { moi: 0, con: 0, hetMoi: 0 };
if (!DRY) {
  const tableId = await ensureTable();
  if (tableId) {
    const now = Date.now();
    let commit = '';
    try {
      commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim();
    } catch {
      /* không phải kho git thì thôi */
    }

    const old = await lark('GET', `/open-apis/bitable/v1/apps/${BASE}/tables/${tableId}/records?page_size=500`);
    const oldRows = old.data?.items ?? [];
    // Dấu vân tay phải khớp với cách `add()` gộp trùng, nếu không mỗi lượt lại đẻ ra dòng mới cho
    // cùng một lỗi và sổ thành vô dụng sau vài ngày.
    const fp = (page, text) => `${page}|${norm(text)}`;
    const byFp = new Map();
    for (const r of oldRows) {
      const page = r.fields['Trang']?.text ?? r.fields['Trang']?.link ?? '';
      byFp.set(fp(page, r.fields['Lỗi'] ?? ''), r);
    }

    const seenNow = new Set();
    const toCreate = [];
    const toUpdate = [];

    for (const f of findings.slice(0, 480)) {
      const page = f.url.replace(SITE, '') || '/';
      const key = fp(page, f.text);
      seenNow.add(key);
      const hit = byFp.get(key);
      const common = {
        Lỗi: f.text,
        Trang: { link: f.url, text: page },
        Loại: f.kind,
        Mức: f.level,
        'Tự sửa': f.fix,
        'Khung nhìn': f.viewport,
        'Lần cuối thấy': now,
        'Bản mã': commit,
      };
      if (hit) {
        toUpdate.push({
          record_id: hit.record_id,
          fields: {
            ...common,
            'Trạng thái': 'Còn',
            'Số lượt thấy': Number(hit.fields['Số lượt thấy'] ?? 1) + 1,
          },
        });
        ledger.con++;
      } else {
        toCreate.push({
          fields: { ...common, 'Trạng thái': 'Mới', 'Lần đầu thấy': now, 'Số lượt thấy': 1 },
        });
        ledger.moi++;
      }
    }

    /**
     * Dòng trong sổ mà lượt này không thấy nữa → đã hết.
     *
     * CHỈ XÉT NHỮNG TRANG LƯỢT NÀY THỰC SỰ ĐÃ SOI. Bản đầu xét cả sổ, nên một lượt chạy hẹp
     * (--limit 8) đánh dấu "đã hết" cho lỗi của 23 trang nó không hề mở ra — đo được ngay lần
     * chạy thử đầu tiên: 43 dòng bị đóng sai. Không thấy vì không nhìn thì không phải là hết.
     *
     * "Đã hết" nghĩa là KHÔNG CÒN PHÁT HIỆN ĐƯỢC, không phải "đã được sửa". Phần lớn là do sửa
     * thật, nhưng một phép kiểm đổi luật cũng làm dòng cũ đóng lại — cột "Bản mã" để lần ra.
     *
     * Chỉ ghi "Hết lúc" MỘT LẦN: lần sau chạy lại không dập ngày cũ và mất mốc thật.
     */
    const scannedPages = new Set(urls.map((u) => u.replace(SITE, '') || '/'));
    for (const [key, r] of byFp) {
      if (seenNow.has(key)) continue;
      if (r.fields['Trạng thái'] === 'Đã hết') continue;
      const page = r.fields['Trang']?.text ?? '';
      if (!scannedPages.has(page)) continue;
      toUpdate.push({
        record_id: r.record_id,
        fields: { 'Trạng thái': 'Đã hết', 'Hết lúc': now, 'Bản mã': commit },
      });
      ledger.hetMoi++;
    }

    for (let i = 0; i < toCreate.length; i += 200) {
      const w = await lark('POST', `/open-apis/bitable/v1/apps/${BASE}/tables/${tableId}/records/batch_create`, {
        records: toCreate.slice(i, i + 200),
      });
      if (w.code !== 0) throw new Error(`thêm dòng: ${w.code} ${w.msg}`);
    }
    for (let i = 0; i < toUpdate.length; i += 200) {
      const w = await lark('POST', `/open-apis/bitable/v1/apps/${BASE}/tables/${tableId}/records/batch_update`, {
        records: toUpdate.slice(i, i + 200),
      });
      if (w.code !== 0) throw new Error(`cập nhật dòng: ${w.code} ${w.msg}`);
    }
    log(`sổ lỗi: ${ledger.moi} mới · ${ledger.con} còn · ${ledger.hetMoi} vừa hết (bản mã ${commit || '?'})`);
  }
}

// ── đẩy sang bảng Tester ─────────────────────────────────────────────────────
//
// Hai bảng trước đây rời nhau: sổ lỗi máy ghi ở một chỗ, luồng làm việc của người kiểm thử ở chỗ
// khác. Ai chỉ mở bảng Tester thì không bao giờ thấy lỗi máy tìm ra.
//
// Chạy như TIẾN TRÌNH RIÊNG, và hỏng ở đây KHÔNG được làm hỏng cả lượt soi: sổ lỗi đã ghi xong
// rồi, mất bước đồng bộ thì lượt sau bù được, còn ném lỗi ra thì mất luôn cả tin báo.
if (!DRY) {
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/sync-tester.mjs')], {
      cwd: ROOT,
      stdio: 'inherit',
      timeout: 5 * 60_000,
    });
  } catch (e) {
    log(`đồng bộ bảng Tester hỏng (bỏ qua): ${String(e.message).slice(0, 120)}`);
  }
}

// ── báo tin ──────────────────────────────────────────────────────────────────
if (!DRY && cfg.TG_TOKEN && cfg.TG_CHAT_ID) {
  const top = findings.filter((f) => f.level === 'Nặng').slice(0, 6);
  const text = [
    `🔍 <b>Soi website</b> — ${new Date().toLocaleString('vi-VN')}`,
    '',
    `Trang đã soi: <b>${urls.length}</b>`,
    `Lỗi đang còn: <b>${findings.length}</b> (nặng ${bySev['Nặng']} · vừa ${bySev['Vừa']} · nhẹ ${bySev['Nhẹ']})`,
    // Ba con số này mới trả lời được "có tiến triển gì không". Chỉ báo tổng số lỗi thì một lượt
    // sửa được 10 lỗi và một lượt không làm gì trông y hệt nhau.
    `Thay đổi từ lượt trước: <b>+${ledger.moi} mới</b> · <b>−${ledger.hetMoi} đã hết</b> · ${ledger.con} còn`,
    `Tự sửa nội dung: ${fixedNote}`,
    '',
    ...(top.length ? ['<b>Nặng nhất:</b>', ...top.map((f) => `• ${f.url.replace(SITE, '') || '/'} — ${f.text.slice(0, 110)}`)] : ['Không có lỗi nặng.']),
    '',
    `Bảng chi tiết: "${TABLE}" trong base TOOLSWAVE — lọc cột Trạng thái để xem riêng Mới / Còn / Đã hết.`,
    'Dòng "Đã hết" = không còn phát hiện được nữa, kèm ngày và bản mã. Bảng giữ lịch sử, không xoá.',
    'Lỗi ghi "Phải sửa mã" cần một phiên có người — script không tự viết mã rồi deploy.',
  ].join('\n');
  try {
    const r = await (
      await fetch(`https://api.telegram.org/bot${cfg.TG_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: Number(cfg.TG_CHAT_ID),
          ...(cfg.TG_THREAD_ID ? { message_thread_id: Number(cfg.TG_THREAD_ID) } : {}),
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      })
    ).json();
    log(`Telegram: ${r.ok ? 'đã gửi (message_id ' + r.result.message_id + ')' : 'LỖI ' + r.description}`);
  } catch (e) {
    log(`Telegram: LỖI ${e.message}`);
  }
} else if (!DRY) {
  log('Telegram: bỏ qua (chưa cấu hình TG_TOKEN / TG_CHAT_ID)');
}

log('xong');
