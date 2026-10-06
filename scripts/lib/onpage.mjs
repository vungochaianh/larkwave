/**
 * Soi ON-PAGE bằng cách MỞ TRANG THẬT, không đọc dữ liệu trong cơ sở dữ liệu.
 *
 * Vì sao phải tách hẳn ra: báo cáo cũ chỉ soi bản ghi lấy từ API nên cho điểm cao trong khi trang
 * render ra lại sai. Bằng chứng: seoTitle trong DB dài 57 ký tự — đạt — nhưng layout gốc nối thêm
 * "· Toolswave" nên `<title>` thật dài 70, vượt đúng chỗ Google cắt. Dữ liệu đúng, trang sai.
 *
 * Đọc HTML bằng biểu thức chính quy chứ không dựng cây DOM: chỉ cần vài thẻ ở phần <head> và đếm
 * ít thứ trong <body>, không đáng kéo thêm một thư viện phân tích HTML vào kho.
 */

/**
 * Đổi thực thể HTML về ký tự thật TRƯỚC KHI ĐO ĐỘ DÀI.
 *
 * Không có bước này thì phép đo nói dối, và nói dối theo hướng tệ nhất: báo lỗi ở chỗ không có
 * lỗi. Một dấu nháy kép trong mô tả nằm trong HTML dưới dạng `&quot;` — sáu ký tự thay vì một.
 * Đo ngày 21/09/2026: một bài blog bị báo "meta description 164 ký tự — bị cắt" trong khi mô tả
 * thật dài đúng 154, tức là NẰM TRONG giới hạn; chênh 10 ký tự là do hai dấu nháy kép. Người đọc
 * báo cáo sẽ đi sửa một bài vốn không hỏng, còn công cụ thì mất uy tín.
 *
 * Giải mã `&amp;` SAU CÙNG, cố ý: làm trước thì `&amp;quot;` (vốn là chuỗi chữ "&quot;" hiển thị
 * ra cho người đọc) biến thành `&quot;` rồi thành dấu nháy — giải mã hai lần, sai nội dung.
 */
function decodeEntities(str) {
  return str
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

const pick = (html, re) => {
  const m = html.match(re);
  return m ? decodeEntities(m[1]).trim() : null;
};

/** Gỡ thẻ, script, style để đếm chữ người đọc thật sự thấy. */
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Trả về { url, ok, status, ms, signals, issues }.
 *
 * `issues` là danh sách câu tiếng Việt mô tả VẤN ĐỀ, không phải mã lỗi — bảng báo cáo đọc thẳng,
 * không cần tra bảng mã.
 */
export async function auditPage(url, { expectCanonical = true } = {}) {
  const t0 = Date.now();
  let res;
  let html = '';
  try {
    res = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'ToolswaveSEOBot/1.0' } });
    html = await res.text();
  } catch (e) {
    return { url, ok: false, status: 0, ms: Date.now() - t0, signals: {}, issues: [`không tải được: ${e.message}`] };
  }
  const ms = Date.now() - t0;
  const issues = [];

  if (res.status >= 300 && res.status < 400) {
    // Dừng HẲN ở đây. Thân của một phản hồi chuyển hướng là rỗng, nên mọi phép kiểm bên dưới sẽ
    // báo "không có title / không có H1 / trang mỏng" — tám dòng nhiễu cho một sự thật duy nhất là
    // trang này đã dời đi. Đo trang ĐÍCH mới có nghĩa, và trang đích vốn đã nằm trong danh sách.
    return {
      url,
      ok: false,
      status: res.status,
      ms,
      signals: {},
      issues: [`chuyển hướng ${res.status} → ${res.headers.get('location') ?? '?'}`],
    };
  }
  if (res.status !== 200) {
    issues.push(`HTTP ${res.status}`);
  }

  const title = pick(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ?? '';
  const desc = pick(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ?? '';
  const canonical = pick(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i);
  const robots = pick(html, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i) ?? '';
  const lang = pick(html, /<html[^>]*\slang=["']([^"']*)["']/i);
  const h1s = (html.match(/<h1[\s>]/gi) || []).length;
  const h2s = (html.match(/<h2[\s>]/gi) || []).length;
  const imgs = html.match(/<img[^>]*>/gi) || [];
  const imgNoAlt = imgs.filter((i) => !/\salt\s*=/i.test(i)).length;
  const ldBlocks = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
  const words = visibleText(html).split(' ').filter(Boolean).length;

  /**
   * Liên kết nội bộ nằm TRONG THÂN BÀI (không tính khung trang).
   *
   * Đo trên HTML ĐÃ DỰNG chứ không trên nội dung lưu trong cơ sở dữ liệu, vì hai thứ đó không còn
   * giống nhau: khối "Đọc thêm" được chèn lúc dựng trang, nên đọc `content` trong DB sẽ báo "không
   * có liên kết nội bộ nào" cho một trang thật sự có. Đo thứ người đọc và máy tìm kiếm nhận được
   * mới là đo đúng.
   *
   * Khoanh vùng từ `id="tw-blog-body"` tới khối `tw-bl-section` ngay sau (phần Thẻ) — ranh giới
   * thân bài trong khuôn trang bài viết. Không thấy mốc thì trả null: KHÔNG đoán, thà để người gọi
   * tự quyết còn hơn báo một con số bịa ra.
   */
  const iBody = html.indexOf('id="tw-blog-body"');
  const iEnd = iBody >= 0 ? html.indexOf('tw-bl-section', iBody) : -1;
  const inBodyLinks =
    iBody < 0
      ? null
      : (
          html
            .slice(iBody, iEnd > iBody ? iEnd : undefined)
            .match(/href=["']\/(?:blog|explore|pricing|download|support|create-website)\//g) || []
        ).length;

  /**
   * Trang CÔNG CỤ (đăng nhập, đăng ký, quên mật khẩu…) được miễn vài luật bên dưới.
   *
   * Không phải để cho đẹp số: một trang đăng nhập có 16 từ và không có dữ liệu có cấu trúc là
   * ĐÚNG, không phải thiếu sót. Gắn cờ chúng ở mọi lượt soi tạo ra những dòng đỏ vĩnh viễn không
   * ai sửa được — và một bảng lỗi có dòng không bao giờ hết là bảng người ta thôi đọc.
   */
  const utility = /\/(login|register|forgot|reset|auth)(\/|$|\?)/.test(url);

  // ── on-page ────────────────────────────────────────────────────────────────
  if (!title) issues.push('không có <title>');
  else if (title.length > 60) issues.push(`<title> ${title.length} ký tự — Google cắt quanh 60`);
  else if (title.length < 25) issues.push(`<title> chỉ ${title.length} ký tự`);

  if (!desc) issues.push('không có meta description');
  else if (desc.length > 160) issues.push(`meta description ${desc.length} ký tự — bị cắt`);
  else if (desc.length < 70) issues.push(`meta description chỉ ${desc.length} ký tự`);

  if (h1s === 0) issues.push('không có <h1>');
  else if (h1s > 1) issues.push(`${h1s} thẻ <h1> — chỉ nên có một`);
  if (h2s === 0 && words > 400) issues.push('bài dài mà không có <h2> nào — không có cấu trúc để quét');

  if (!lang) issues.push('thẻ <html> thiếu lang');
  if (imgNoAlt) issues.push(`${imgNoAlt}/${imgs.length} ảnh thiếu alt`);

  // ── khả năng được lập chỉ mục ──────────────────────────────────────────────
  // Đây là phần quyết định "trang có lên được kết quả tìm kiếm không". Một trang noindex thì mọi
  // thứ on-page bên trên đều vô nghĩa, nên nó phải là một vấn đề riêng, thấy ngay.
  if (/noindex/i.test(robots)) issues.push('CHẶN LẬP CHỈ MỤC: meta robots có noindex');
  const xrobots = res.headers?.get?.('x-robots-tag') ?? '';
  if (/noindex/i.test(xrobots)) issues.push('CHẶN LẬP CHỈ MỤC: header X-Robots-Tag có noindex');

  if (expectCanonical) {
    if (!canonical) issues.push('không có canonical');
    else if (canonical.replace(/\/$/, '') !== url.replace(/\/$/, ''))
      issues.push(`canonical trỏ đi chỗ khác: ${canonical}`);
  }

  // Trang công cụ KHÔNG cần dữ liệu có cấu trúc: không có loại schema.org nào nói được điều gì
  // có ích về một biểu mẫu đăng nhập. Thêm vào chỉ là đánh dấu cho đủ ô — và một luật đòi thứ vô
  // nghĩa sẽ dạy người đọc bảng bỏ qua cả những dòng đáng đọc.
  if (!ldBlocks.length && !utility) issues.push('không có dữ liệu có cấu trúc (JSON-LD)');
  else {
    for (const b of ldBlocks) {
      const raw = b.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');
      try {
        JSON.parse(raw);
      } catch {
        issues.push('JSON-LD không phân tích được — máy tìm kiếm sẽ bỏ qua');
        break;
      }
    }
  }

  if (words < 300 && !utility) issues.push(`chỉ ${words} từ hiển thị — trang mỏng`);
  if (ms > 3000) issues.push(`tải ${ms}ms — chậm`);

  return {
    url,
    ok: res.status === 200,
    status: res.status,
    ms,
    signals: {
      titleLen: title.length,
      descLen: desc.length,
      h1s,
      h2s,
      imgs: imgs.length,
      imgNoAlt,
      ldBlocks: ldBlocks.length,
      inBodyLinks,
      words,
      canonical,
      robots: robots || '(không đặt)',
      lang,
    },
    issues,
  };
}

/**
 * Đếm đoạn chữ TIẾNG VIỆT còn sót trên một trang đáng ra đã tiếng Anh.
 *
 * VÌ SAO PHÉP KIỂM NÀY TỒN TẠI. Trước 24/09/2026 cả hai bộ soi (site-check và seo-report) chỉ mở
 * bản tiếng Việt — không chỗ nào chạm tới `?lang=en`. Nên suốt thời gian đó chúng chấm 98/100 và
 * "0 lỗi" trong khi trang tiếng Anh có 51 đoạn chữ tiếng Việt: chuyên mục, thẻ, menu, mục lục,
 * nút chia sẻ, cả khối bình luận. Không bộ soi nào sai — chúng chỉ chưa bao giờ được hỏi. Người
 * dùng phát hiện bằng mắt, đó là dấu hiệu rõ nhất rằng phép kiểm còn thiếu.
 *
 * Cách nhận: chữ có dấu tiếng Việt. Không bắt được câu tiếng Việt viết không dấu, nhưng trên site
 * này mọi chuỗi giao diện đều có dấu, nên thước này không bao giờ báo dương tính giả.
 *
 * CHỈ soi bề mặt blog. Trang cửa hàng lấy tên và mô tả hàng thẳng từ portal — đó là DỮ LIỆU tiếng
 * Việt, không phải giao diện chưa dịch; đưa vào đây thì báo cáo lúc nào cũng đỏ và không ai đọc nữa.
 */
const KHONG_TINH = new Set([
  // Tên ngôn ngữ tự gọi mình. Dịch "Tiếng Việt" thành "Vietnamese" là làm người nói tiếng Việt
  // khó tìm đường về hơn — mọi site đa ngữ đều để nguyên endonym.
  'Tiếng Việt',
  'Đọc bản tiếng Việt',
  // Màn mở đầu nằm ở layout gốc, mà layout gốc dựng TĨNH nên không biết ngôn ngữ máy chủ đã chọn.
  // Sửa được, nhưng cái giá là ép cả site thành dựng động để đổi một lớp phủ hiện chưa tới một
  // giây và đã tự đổi ngay khi trình duyệt tiếp quản. Ghi ra đây để lần sau khỏi điều tra lại.
  'Trợ lý AI biết làm việc thật',
  'Bỏ qua',
]);

const DAU_TIENG_VIET =
  /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

export async function quetChuViet(url) {
  let html = '';
  try {
    const r = await fetch(url, { headers: { 'accept-language': 'en-US,en;q=0.9' } });
    if (!r.ok) return { url, loi: [`HTTP ${r.status}`], sot: [] };
    html = await r.text();
  } catch (e) {
    return { url, loi: [`không mở được: ${e.message}`], sot: [] };
  }
  // Bỏ script/style: chữ tiếng Việt trong đó (từ điển i18n, JSON-LD) không hiện ra màn hình.
  const chu = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '\n');
  const sot = new Set();
  for (const raw of chu.split('\n')) {
    const t = raw.replace(/&[a-z]+;/gi, ' ').trim();
    if (!t || !DAU_TIENG_VIET.test(t) || KHONG_TINH.has(t)) continue;
    sot.add(t.slice(0, 80));
  }
  return { url, loi: [], sot: [...sot] };
}

/** Soi tầng SITE: robots.txt, sitemap.xml, và độ phủ của sitemap so với danh sách bài thật. */
export async function auditSite(site, knownUrls = []) {
  const issues = [];
  const out = { site, robots: {}, sitemap: {}, issues };

  try {
    const r = await fetch(`${site}/robots.txt`);
    const t = await r.text();
    out.robots = { status: r.status, bytes: t.length, declaresSitemap: /Sitemap:/i.test(t) };
    if (r.status !== 200) issues.push(`robots.txt trả HTTP ${r.status}`);
    if (!/Sitemap:/i.test(t)) issues.push('robots.txt không khai sitemap');
    // Một dòng chặn toàn site là lỗi chết người và rất dễ lọt qua khi sửa vội.
    if (/^\s*Disallow:\s*\/\s*$/im.test(t)) issues.push('CHẶN TOÀN SITE: robots.txt có "Disallow: /"');
  } catch (e) {
    issues.push(`không đọc được robots.txt: ${e.message}`);
  }

  let locs = [];
  try {
    const r = await fetch(`${site}/sitemap.xml`);
    const x = await r.text();
    locs = [...x.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    out.sitemap = { status: r.status, urls: locs.length };
    if (r.status !== 200) issues.push(`sitemap.xml trả HTTP ${r.status}`);
    if (!locs.length) issues.push('sitemap.xml không có URL nào');
  } catch (e) {
    issues.push(`không đọc được sitemap.xml: ${e.message}`);
  }

  const inMap = new Set(locs.map((u) => u.replace(/\/$/, '')));
  const missing = knownUrls.filter((u) => !inMap.has(u.replace(/\/$/, '')));
  out.missingFromSitemap = missing;
  if (missing.length) issues.push(`${missing.length} trang KHÔNG có trong sitemap`);

  // Bản tiếng Anh: trang danh sách + ba bài (đủ để bắt cả khung trang lẫn ruột bài, mà không kéo
  // dài báo cáo). Lấy ba bài ĐẦU danh sách chứ không lấy ngẫu nhiên — báo cáo phải lặp lại được.
  const mauEn = [`${site}/blog?lang=en`, ...knownUrls.slice(0, 3).map((u) => `${u}?lang=en`)];
  const enq = [];
  for (const u of mauEn) {
    // eslint-disable-next-line no-await-in-loop
    enq.push(await quetChuViet(u));
  }
  out.en = enq;
  for (const r of enq) {
    for (const e of r.loi) issues.push(`bản EN ${r.url.replace(site, '')}: ${e}`);
    if (r.sot.length) {
      issues.push(
        `bản EN còn ${r.sot.length} chuỗi tiếng Việt ở ${r.url.replace(site, '')}: ${r.sot
          .slice(0, 3)
          .join(' · ')}${r.sot.length > 3 ? ' …' : ''}`,
      );
    }
  }

  return out;
}
