#!/usr/bin/env node
/**
 * Đăng bài blog tự động — CHẠY TRÊN MỘT MÁY TREO, không phải trên máy chủ.
 *
 * Vì sao không nằm trong API: lịch Marketing trong API cũng làm được việc này, nhưng nó đòi deploy
 * máy chủ trước. Script này chỉ gọi những đầu API ĐÃ CHẠY SẴN, nên dùng được ngay hôm nay — đúng
 * mô tả gốc của yêu cầu: "dùng laptop treo chạy bài viết để đăng tự động qua API".
 *
 * Một lượt chạy:
 *   POST /makeblog          → sinh bài (bất đồng bộ)
 *   GET  /makeblog/:id      → chờ tới khi status = done
 *   POST /admin/blog        → đăng lên site, kèm seoTitle / seoDescription / tags
 *   sendMessage (Telegram)  → báo cáo, nếu có cấu hình
 *
 * Cấu hình: đọc .blog-autopost.env ở gốc dự án (KHÔNG commit — .gitignore đã che *.env).
 *   TW_TOKEN=<JWT của tài khoản admin>      bắt buộc
 *   TW_API_BASE=https://api.toolswave.net/v1
 *   TW_TOPICS_FILE=blog-topics.txt          mỗi dòng một chủ đề; dòng bắt đầu bằng # là ghi chú
 *   TW_POSTS=1                              số bài mỗi lượt chạy
 *   TW_TEMPLATE=auto                        auto | howto | listicle | news | story
 *   TW_IMAGES=3                             số ảnh chèn trong bài (0–6)
 *   TG_TOKEN=, TG_CHAT_ID=, TG_THREAD_ID=   báo cáo Telegram (bỏ trống thì không gửi)
 *
 * Dùng:  node scripts/blog-autopost.mjs [--dry-run] [--posts N] [--topic "chủ đề cụ thể"]
 *
 *   --posts N   ghi đè TW_POSTS cho lượt này. Seed lô đầu:  --posts 10
 *
 * Cách lấy TW_TOKEN và cách đặt lịch 3 lần/ngày: xem cuối file.
 */
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { submitToIndexNow, SITE_HOST } from './lib/indexnow.mjs';
import { themLienKetNoiBo } from './lib/blog-bo-sung.mjs';
import { notifyBlockedOnce } from './lib/notify.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Nạp hàm SEO từ bản dựng của @larkwave/shared, không `import` theo tên gói.
 *
 * package.json ở GỐC kho cố ý không có dependency nào, nên `@larkwave/shared` không resolve được
 * từ thư mục scripts/. Nạp thẳng từ dist và báo rõ khi chưa dựng — thà chết ở đây với một câu
 * bảo phải chạy lệnh gì, còn hơn ném ERR_MODULE_NOT_FOUND cho người đọc tự đoán.
 */
const SHARED = path.join(ROOT, 'packages/shared/dist/index.js');
if (!existsSync(SHARED)) {
  console.error('✗ Chưa dựng @larkwave/shared. Chạy:  pnpm --filter @larkwave/shared build');
  process.exit(1);
}
const { deriveSeoTitle, deriveSeoDescription, deriveTags, deriveCategory } = await import(pathToFileURL(SHARED).href);
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const flag = (name) => (argv.indexOf(name) >= 0 ? argv[argv.indexOf(name) + 1] : null);
const topicArg = flag('--topic');
/** Ghi đè TW_POSTS cho một lượt chạy — dùng khi seed lô đầu (vd `--posts 10`). */
const postsArg = Number(flag('--posts')) || null;

// ── cấu hình ──────────────────────────────────────────────────────────────────
const CFG_FILE = path.join(ROOT, '.blog-autopost.env');
const cfg = { ...process.env };
if (existsSync(CFG_FILE)) {
  for (const line of readFileSync(CFG_FILE, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) cfg[m[1]] = m[2];
  }
}
const API = (cfg.TW_API_BASE || 'https://api.toolswave.net/v1').replace(/\/$/, '');
const TOKEN = cfg.TW_TOKEN;
// Trần 20 chứ không phải 10: lô seed đầu tiên thường lớn hơn nhịp chạy hằng ngày.
const POSTS = Math.max(1, Math.min(20, postsArg || Number(cfg.TW_POSTS || 1)));
const IMAGES = Math.max(0, Math.min(6, Number(cfg.TW_IMAGES ?? 3)));
const TEMPLATES = ['howto', 'listicle', 'news', 'story'];

const die = (m) => {
  console.error(`✗ ${m}`);
  process.exit(1);
};
const log = (m) => console.log(`${new Date().toISOString().slice(0, 19).replace('T', ' ')}  ${m}`);

if (!TOKEN) die(`Thiếu TW_TOKEN. Tạo ${CFG_FILE} với dòng TW_TOKEN=<JWT>. Xem hướng dẫn cuối file này.`);

/**
 * Chủ đề đã dùng, ghi lại để KHÔNG đăng trùng.
 *
 * Không phải để cho gọn: hai bài cùng chủ đề sinh ra nội dung gần giống nhau, và Google coi đó là
 * nội dung trùng lặp rồi hạ cả hai. Một máy treo chạy 3 lần/ngày sẽ quay lại đầu danh sách rất
 * nhanh nếu không nhớ.
 */
const USED_FILE = path.join(ROOT, '.blog-autopost-used.txt');
const used = existsSync(USED_FILE)
  ? new Set(
      readFileSync(USED_FILE, 'utf8')
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean),
    )
  : new Set();

/**
 * Một dòng chủ đề:  chủ đề | thẻ1, thẻ2
 *
 * Phần thẻ không bắt buộc nhưng nên có. Thẻ TỐT là cụm nhiều chữ ("website bán hàng"), mà cắt cụm
 * đó ra khỏi một câu bằng máy thì không đáng tin — bài thật đầu tiên chạy không thẻ đã ra
 * ["cách","tạo","bán","hàng"], bốn trong sáu thẻ là chữ vụn.
 */
function parseLine(line) {
  const [topic, tagPart] = line.split('|');
  return {
    topic: topic.trim(),
    tags: (tagPart ?? '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
  };
}

/**
 * Bản mô tả sản phẩm nối vào sau chủ đề trước khi gửi cho /makeblog.
 *
 * Không có nó thì bài sinh ra là nội dung chung chung: mười bài đầu không nhắc Toolswave lần nào
 * trong chữ, lại còn khuyên người đọc dùng WordPress / Shopify / Haravan và mô tả cách làm web là
 * "kéo - thả" — sai luôn cả cách sản phẩm hoạt động. Tốn tiền sinh nội dung để đẩy người đọc sang
 * đối thủ.
 *
 * Để ở FILE chứ không nhúng vào code: sửa cách mọi bài nói về sản phẩm là việc của người làm nội
 * dung, không nên phải sửa script.
 */
function brandBrief() {
  const f = path.join(ROOT, cfg.TW_BRAND_FILE || 'blog-brand.md');
  if (!existsSync(f)) return '';
  return readFileSync(f, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '') // khối ghi chú cho người đọc file, không gửi đi
    .split('\n')
    .filter((l) => !l.startsWith('#'))
    .join('\n')
    .trim();
}
const BRIEF = brandBrief();

/** /makeblog giới hạn topic 2000 ký tự — cắt phần thừa thay vì để API trả 400. */
function withBrief(topic) {
  if (!BRIEF) return topic;
  const joined = `${topic}\n\n${BRIEF}`;
  return joined.length <= 2000 ? joined : joined.slice(0, 1997) + '…';
}

function pickTopics(n) {
  if (topicArg) return [{ topic: topicArg, tags: [] }];
  const f = path.join(ROOT, cfg.TW_TOPICS_FILE || 'blog-topics.txt');
  if (!existsSync(f)) die(`Không thấy danh sách chủ đề: ${f}`);
  const all = readFileSync(f, 'utf8')
    .split('\n')
    .map((x) => x.trim())
    .filter((x) => x && !x.startsWith('#'))
    .map(parseLine);
  // So khớp theo CHỦ ĐỀ, không theo cả dòng: sửa lại phần thẻ không được làm bài cũ đăng lại.
  const fresh = all.filter((x) => !used.has(x.topic));
  if (!fresh.length) {
    // Hết chủ đề = lịch đăng DỪNG HẲN, và nó từng dừng nhiều ngày mà không ai biết vì script chỉ
    // thoát 1 rồi im. Nhắn ra ngoài trước khi chết.
    void notifyBlockedOnce(
      cfg,
      'topics-exhausted',
      {
        what: 'Lịch đăng blog đã dừng',
        why: `Hết chủ đề chưa dùng trong ${path.basename(f)} — đã dùng hết ${used.size} dòng.`,
        need: `Thêm dòng mới vào ${path.basename(f)}, dạng:  chủ đề | thẻ1, thẻ2`,
      },
      { root: ROOT },
    ).finally(() => die(`Hết chủ đề chưa dùng trong ${f} (đã dùng ${used.size}). Thêm dòng mới vào đó.`));
    return [];
  }
  return fresh.slice(0, n);
}

async function call(method, route, body) {
  const res = await fetch(`${API}${route}`, {
    method,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${route} → HTTP ${res.status} ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${method} ${route} → phản hồi không phải JSON: ${text.slice(0, 120)}`);
  }
}

// `withInternalLinks` chuyển sang scripts/lib/blog-bo-sung.mjs để blog-publish dùng chung bản
// này. Trước 23/09/2026 chỉ script này có, nên bài đăng bằng đường kia thiếu liên kết nội bộ.
const withInternalLinks = (body, tags, limit = 3) => themLienKetNoiBo(API, TOKEN, body, tags, limit);

/** Chờ makeblog sinh xong. Trả về project, hoặc ném khi lỗi / quá hạn. */
async function waitBuilt(id, maxMs = 15 * 60_000) {
  const deadline = Date.now() + maxMs;
  let lastStage = '';
  while (Date.now() < deadline) {
    const p = await call('GET', `/makeblog/${id}`);
    if (p.stage && p.stage !== lastStage) {
      lastStage = p.stage;
      log(`   … ${p.stage}`);
    }
    if (p.status === 'done') return p;
    if (p.status === 'error') throw new Error(p.error || 'makeblog báo lỗi');
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`quá ${Math.round(maxMs / 60000)} phút mà chưa sinh xong`);
}

async function telegram(text) {
  if (!cfg.TG_TOKEN || !cfg.TG_CHAT_ID) return;
  try {
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
    });
  } catch (e) {
    log(`   (không gửi được Telegram: ${e.message})`);
  }
}

// ── chạy ──────────────────────────────────────────────────────────────────────
const topics = pickTopics(POSTS);
log(`API ${API} — sẽ đăng ${topics.length} bài`);
const done = [];
const failed = [];

for (const [i, entry] of topics.entries()) {
  const { topic, tags: explicitTags } = entry;
  const template =
    cfg.TW_TEMPLATE && cfg.TW_TEMPLATE !== 'auto' ? cfg.TW_TEMPLATE : TEMPLATES[i % TEMPLATES.length];
  log(`[${i + 1}/${topics.length}] "${topic}"  (${template})`);
  if (DRY) {
    log('   dry-run: bỏ qua sinh + đăng');
    continue;
  }
  try {
    // Hai việc từ hai máy, giữ CẢ HAI:
    //  • `withBrief(topic)` — nối bản mô tả sản phẩm, nếu không bài sinh ra khuyên người đọc dùng
    //    WordPress/Shopify (xem chú thích ở brandBrief).
    //  • `palette: 'brand'` — blog CỦA MÌNH thì mang màu của mình. Bỏ trống thì makeblog dùng
    //    'auto' và bốc ngẫu nhiên theo seed: đo trên bài thật, bài thì ảnh hồng, bài thì xanh lá.
    const proj = await call('POST', '/makeblog', {
      topic: withBrief(topic),
      template,
      count: IMAGES,
      palette: 'brand',
    });
    const built = await waitBuilt(proj.id);
    // Thà bỏ lượt còn hơn đăng một trang rỗng: trang mỏng kéo tụt đánh giá của cả site.
    if (!String(built.body || '').trim()) throw new Error('bài sinh ra rỗng — không đăng');
    const description = deriveSeoDescription(built.caption || '', built.body || '');
    const body = await withInternalLinks(built.body, explicitTags);

    const post = await call('POST', '/admin/blog', {
      title: built.title,
      content: body,
      excerpt: description || undefined,
      coverImage: built.coverUrl || undefined,
      status: 'published',
      // Giữ bản thẻ MỚI của máy kia (có `explicitTags` — thẻ người viết tự đặt trong
      // blog-topics.txt, tốt hơn hẳn thẻ cắt máy từ tiêu đề).
      tags: deriveTags(topic, built.title, template, 5, explicitTags),
      // Chuyên mục suy ra theo danh sách ĐÓNG (xem deriveCategory): để AI tự đặt tên thì tab trên
      // /blog vỡ thành hàng chục mục mỗi mục một bài.
      category: deriveCategory(topic, built.title),
      seoTitle: deriveSeoTitle(built.title),
      seoDescription: description || undefined,
    });
    // Chỉ ghi vào danh sách đã dùng KHI ĐÃ ĐĂNG ĐƯỢC — hỏng giữa chừng thì lượt sau thử lại.
    appendFileSync(USED_FILE, `${topic}\n`);
    done.push({ title: post.title, slug: post.slug });
    log(`   ✓ /blog/${post.slug}`);

    /**
     * BÀI MỚI CHỈ CÓ TIẾNG VIỆT — phải dịch bù bằng tay sau.
     *
     * Bản trước gọi POST /admin/blog/:id/translate ngay tại đây. Endpoint đó ĐÃ BỊ XOÁ: nó bắt
     * việc dịch phải chờ một khoá AI còn hiệu lực trên máy chủ, và khoá hỏng là không dịch được
     * bài nào dù nội dung đã nằm sẵn trong tay. Nay việc dịch do bên soạn nội dung làm rồi đẩy
     * lên bằng scripts/blog-push-translation.mjs.
     *
     * Giữ lời nhắc này TRONG LOG chứ không im lặng: một bài chỉ có tiếng Việt trong khi 24 bài
     * khác song ngữ là thứ rất dễ trôi qua mà không ai để ý, cho tới lúc có người mở /blog bằng
     * tiếng Anh.
     */
    log(`   ⓘ bài mới chỉ có tiếng Việt — dịch bù: soạn content/blog-translations/en/_en_${post.slug}.md rồi chạy scripts/blog-push-translation.mjs`);

    // Báo index NGAY, không gom cuối lượt: một lượt chạy 3 bài kéo dài ~18 phút, và bài đầu không
    // có lý do gì phải chờ bài cuối. Hỏng thì chỉ ghi log — sitemap vẫn là đường thu thập chính.
    const inx = await submitToIndexNow([`https://${SITE_HOST}/blog/${post.slug}`]);
    log(`   ${inx.ok ? '↗' : '⚠'} IndexNow: HTTP ${inx.status}${inx.note ? ' — ' + inx.note : ''}`);
  } catch (e) {
    failed.push({ topic, error: e.message });
    log(`   ✗ ${e.message}`);
  }
}

if (!DRY) {
  const lines = [`📝 <b>Blog tự đăng</b> — ${new Date().toLocaleString('vi-VN')}`, ''];
  for (const d of done) lines.push(`✓ <a href="https://toolswave.net/blog/${d.slug}">${d.title}</a>`);
  for (const f of failed) lines.push(`✗ ${f.topic} — ${f.error}`);
  if (!done.length && !failed.length) lines.push('(không có bài nào)');
  await telegram(lines.join('\n'));
}

log(`xong: ${done.length} đăng được, ${failed.length} lỗi`);
// Chỉ coi là thất bại khi KHÔNG đăng được bài nào — đăng 2/3 vẫn là một lượt chạy có ích.
process.exit(failed.length && !done.length ? 1 : 0);

/*
 * LẤY TW_TOKEN Ở ĐÂU
 * ------------------
 * Đăng nhập app.toolswave.net bằng tài khoản ADMIN (đầu /admin/blog đòi quyền admin), mở
 * DevTools (F12) → Application → Storage → chép giá trị của khoá `tw_token`.
 *
 * Tìm ở Session Storage TRƯỚC, rồi mới Local Storage: web ghi vào session khi đăng nhập không
 * tích "ghi nhớ", và lúc đó Local Storage không có khoá đó — dễ tưởng là chưa đăng nhập.
 *
 * JWT_EXPIRES_IN mặc định 365 ngày nên không phải lấy lại thường xuyên.
 *
 * ĐẶT LỊCH 3 LẦN/NGÀY TRÊN WINDOWS (PowerShell, quyền quản trị)
 * -------------------------------------------------------------
 *   $a = New-ScheduledTaskAction -Execute "node" `
 *          -Argument "C:\tw\app\scripts\blog-autopost.mjs" -WorkingDirectory "C:\tw\app"
 *   $t = @(8, 13, 18 | ForEach-Object { New-ScheduledTaskTrigger -Daily -At "$($_):00" })
 *   Register-ScheduledTask -TaskName "Toolswave blog autopost" -Action $a -Trigger $t
 *
 * Máy phải đang bật vào giờ đó. Muốn chạy bù khi lỡ giờ thì thêm:
 *   -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable)
 */
