/**
 * Soi một trang bằng TRÌNH DUYỆT THẬT.
 *
 * Khác hẳn `lib/onpage.mjs`: cái kia tải HTML thô, đủ để đo thẻ meta và cấu trúc — nhưng mù trước
 * mọi thứ chỉ xuất hiện khi JavaScript chạy. Lỗi console, request hỏng, ảnh 404, nút tràn ra khỏi
 * màn hình điện thoại: không thứ nào lộ ra trong HTML thô.
 *
 * Playwright nằm trong store pnpm chứ không ở node_modules gốc (nó là phụ thuộc gián tiếp, và
 * package.json ở gốc kho cố ý không có dependency nào), nên phải nạp theo đường dẫn store.
 */
import { createRequire } from 'node:module';
import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);

export function loadPlaywright(root) {
  const store = path.join(root, 'node_modules/.pnpm');
  if (!existsSync(store)) return null;
  const dir = readdirSync(store).find((d) => d.startsWith('playwright@'));
  if (!dir) return null;
  try {
    return require(path.join(store, dir, 'node_modules/playwright'));
  } catch {
    return null;
  }
}

/** Kích thước để soi tràn khung. Điện thoại trước: phần lớn người đọc blog vào bằng điện thoại. */
export const VIEWPORTS = [
  // 375 chứ không phải 390: đây là khổ của iPhone SE/8/mini, vẫn rất nhiều người dùng, và là khổ
  // HẸP NHẤT cần đỡ. Lỗi nút chính bị xén ngày 21/09/2026 lòi 29px ở 375 nhưng chỉ 14px ở 390 —
  // đo ở khổ rộng hơn thì thấy nhẹ hơn thực tế, mà đây lại là loại lỗi bị cắt lặng lẽ.
  { name: 'điện thoại', width: 375, height: 812 },
  { name: 'máy tính', width: 1440, height: 900 },
];

/**
 * Mở một URL và thu lại mọi thứ chỉ thấy được khi trang CHẠY.
 *
 * Trả về danh sách `issues` bằng tiếng Việt, mô tả vấn đề chứ không phải mã lỗi — bảng Lark đọc
 * thẳng, không phải tra bảng mã.
 */
export async function inspect(browser, url, { viewport = VIEWPORTS[0], timeout = 30000 } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    userAgent: 'ToolswaveSiteBot/1.0 (kiểm tra nội bộ)',
  });
  const page = await ctx.newPage();

  /**
   * CHẶN prefetch RSC của Next (`?_rsc=...`).
   *
   * Next tự tải trước mọi liên kết thấy được trên trang. Một trang blog có thanh điều hướng cộng
   * khối bài liên quan là hơn chục prefetch — nhân với 31 trang và 2 khung nhìn thành ~900 request
   * bắn liên tiếp vào production. nginx giới hạn 600r/m (deploy/nginx-toolswave.conf), nên bộ soi
   * tự đẩy mình qua ngưỡng rồi ghi 429 vào bảng như thể website hỏng.
   *
   * Đo được: cùng một trang blog, mở RIÊNG LẺ ra 1 lỗi; mở trong lượt soi đầy đủ ra 8 lỗi, bảy
   * trong số đó là 429 do chính mình.
   *
   * Chặn được vì prefetch là SUY ĐOÁN: nó hỏng thì người dùng không thấy gì, trang vẫn tải khi bấm.
   * Đánh đổi: không còn kiểm được prefetch. Đổi lại là không còn bịa ra lỗi, và không đập máy chủ.
   */
  await page.route('**/*', (route) => {
    const u = route.request().url();
    // 'aborted' chứ không phải abort() trần: mặc định báo net::ERR_FAILED, và bộ bắt lỗi bên dưới
    // ghi lại nó thành "request hỏng" — tức là đổi một lỗi giả (429) lấy một lỗi giả khác.
    if (u.includes('_rsc=')) return route.abort('aborted');
    return route.continue();
  });
  const consoleErrors = [];
  const pageErrors = [];
  const badRequests = [];

  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // Trình duyệt kêu "Failed to load resource" cho chính những prefetch mình vừa chặn. Không lọc
    // thì mỗi trang đẻ ra một lỗi Logic mức Nặng hoàn toàn do bộ soi tạo ra.
    if (/_rsc=/.test(t) || /Failed to load resource/i.test(t)) return;
    consoleErrors.push(t.slice(0, 200));
  });
  page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 200)));
  page.on('requestfailed', (r) => {
    // Bỏ qua request bị HUỶ: rời trang giữa chừng là chuyện bình thường, không phải lỗi.
    const f = r.failure()?.errorText ?? '';
    if (/ERR_ABORTED|NS_BINDING_ABORTED/i.test(f)) return;
    // Và bỏ qua prefetch mà CHÍNH MÌNH vừa chặn ở trên — ghi lại chúng là tự tố cáo mình.
    if (r.url().includes('_rsc=')) return;
    badRequests.push(`${r.url().slice(0, 120)} — ${f}`);
  });
  let throttled = 0;
  page.on('response', (r) => {
    // 429 tách riêng: nó gần như luôn là do MÌNH gọi quá nhanh, không phải website hỏng. Gộp nó
    // vào "request hỏng" là biến giới hạn tốc độ của máy chủ thành một lỗi sản phẩm giả.
    if (r.status() === 429) {
      throttled++;
      return;
    }
    if (r.status() >= 400) badRequests.push(`${r.url().slice(0, 120)} — HTTP ${r.status()}`);
  });

  const issues = [];
  let status = 0;
  let ms = 0;
  /**
   * Chờ `networkidle` trước, nhưng HẾT GIỜ CHỜ KHÔNG CÓ NGHĨA LÀ TRANG HỎNG.
   *
   * Bản cũ chỉ gọi một lần với 'networkidle' rồi bắt lỗi thành "không mở được trang" — mức Nặng.
   * Sai ở chỗ: 'networkidle' đòi 500ms không còn request nào, mà trang /app/<slug> NHÚNG MỘT ỨNG
   * DỤNG ĐANG CHẠY THẬT trong iframe. Ứng dụng đó có thể hỏi máy chủ theo nhịp, giữ websocket,
   * hay tải thêm thứ gì đó không bao giờ dứt — nên trang mở ra bình thường mà vẫn không bao giờ
   * "rảnh mạng".
   *
   * Đo ngày 21/09/2026: /app/vkdtdg bị báo "không mở được trang: Timeout 30000ms" trong khi tải
   * thẳng bằng curl chỉ mất 0,5 giây và trả HTTP 200; chính origin được nhúng
   * (vkdtdg.toolswave.net) cũng trả 200 trong 0,5 giây. Không có gì hỏng cả.
   *
   * Lỗi loại này tệ hơn lỗi bỏ sót vì nó CHẬP CHỜN: bốn trang /app/<slug> cùng một khuôn, lượt
   * này trúng trang nào thì trang ấy bị báo Nặng, lượt sau lại trang khác — người đọc bảng lỗi đi
   * tìm một hỏng hóc không tồn tại.
   *
   * Nên: hết giờ với 'networkidle' thì thử lại bằng 'domcontentloaded'. Mở được nghĩa là trang
   * không hỏng, cứ soi tiếp. Chỉ khi lượt thứ hai cũng hỏng mới thật là không mở được.
   */
  try {
    const t0 = Date.now();
    const res = await page.goto(url, { waitUntil: 'networkidle', timeout });
    ms = Date.now() - t0;
    status = res?.status() ?? 0;
    if (status >= 400) issues.push(`HTTP ${status}`);
  } catch {
    try {
      const t0 = Date.now();
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
      ms = Date.now() - t0;
      status = res?.status() ?? 0;
      if (status >= 400) issues.push(`HTTP ${status}`);
      /**
       * Không còn mốc 'networkidle' để dựa, nên phải tự chờ — nhưng ĐỪNG chờ một khoảng cố định.
       *
       * Bản đầu đặt cứng 2500ms và sai ngay: /app/<slug> kết xuất ở trình duyệt, phải gọi API lấy
       * dữ liệu app rồi mới dựng H1. API chậm hơn 2,5 giây là bộ soi đo vào lúc trang còn trống và
       * báo "không có H1" — một lỗi giả do chính phép đo tạo ra, lại còn chập chờn theo tốc độ
       * mạng, tức là lúc có lúc không.
       *
       * Nên: chờ mốc 'load', rồi cho thêm một nhịp 'networkidle' ngắn. Không tới được cũng không
       * sao — ta đã biết trang này thuộc loại không bao giờ rảnh mạng, đó là lý do rơi vào nhánh
       * này ngay từ đầu. Chờ THEO TÍN HIỆU thay vì theo đồng hồ.
       */
      await page.waitForLoadState('load', { timeout: 15000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    } catch (e2) {
      issues.push(`không mở được trang: ${String(e2.message).split(String.fromCharCode(10))[0].slice(0, 140)}`);
      await ctx.close();
      return { url, viewport: viewport.name, status, ms, issues, counts: {} };
    }
  }

  // ── thứ chỉ thấy khi trang chạy ──
  for (const e of [...new Set(pageErrors)].slice(0, 3)) issues.push(`lỗi JavaScript: ${e}`);
  for (const e of [...new Set(consoleErrors)].slice(0, 3)) issues.push(`console error: ${e}`);
  for (const r of [...new Set(badRequests)].slice(0, 4)) issues.push(`request hỏng: ${r}`);
  if (throttled) {
    issues.push(
      `BỘ SOI CHẠY QUÁ NHANH: máy chủ trả 429 cho ${throttled} request — đây là vấn đề của bộ soi, ` +
        `không phải của trang. Giãn nhịp quét hoặc giảm số trang mỗi lượt.`,
    );
  }

  const info = await page.evaluate(() => {
    const out = {};
    // Ảnh tải hỏng: naturalWidth = 0 sau khi đã complete.
    const imgs = [...document.images];
    out.imgs = imgs.length;
    out.brokenImgs = imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.currentSrc || i.src).slice(0, 4);
    /**
     * THIẾU HẲN alt và alt="" là hai chuyện khác nhau.
     *
     *   không có alt   → trình đọc màn hình đọc tên tệp. Lỗi thật.
     *   alt=""         → tác giả CỐ Ý khai ảnh là trang trí. Đúng chuẩn khi ảnh nằm trong một
     *                    liên kết đã có chữ mô tả đích đến — thêm alt là bắt đọc lặp tiêu đề.
     *
     * Bản đầu dùng `!i.getAttribute('alt')`, mà chuỗi rỗng là falsy, nên nó gắn cờ trang /blog
     * "11/11 ảnh thiếu alt" trong khi mã ở đó viết đúng: mỗi ảnh bìa nằm trong cùng <Link> với
     * tiêu đề bài. Suýt nữa tôi sửa mã đúng để chiều một cái luật sai.
     */
    out.imgsNoAlt = imgs.filter((i) => i.getAttribute('alt') === null).length;
    out.imgsDecorative = imgs.filter((i) => i.getAttribute('alt') === '').length;

    // Tràn ngang: thủ phạm thật sự của "trang bị xê dịch trên điện thoại".
    out.docWidth = document.documentElement.scrollWidth;
    out.viewWidth = document.documentElement.clientWidth;
    out.overflowing = [...document.querySelectorAll('body *')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.right > document.documentElement.clientWidth + 2;
      })
      .slice(0, 3)
      .map((el) => `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}`);

    /**
     * NỘI DUNG BỊ XÉN Ở MÉP, trong khi trang KHÔNG hề cuộn ngang.
     *
     * Phép đo tràn ngang ở trên chỉ kêu khi scrollWidth > clientWidth. Nhưng khi một thẻ cha có
     * overflow ẩn, phần thừa bị CẮT chứ không đẩy trang rộng ra — trang trông hoàn toàn bình
     * thường, chỉ có chữ là cụt. Không có dấu hiệu nào cho người xem, và phép đo cũ im lặng.
     *
     * Bắt được thật ngày 21/09/2026: nút chính "Dùng thử miễn phí" trên đầu trang chạm mép 404px
     * ở khổ 375px, tức lòi 29px và bị xén mất chữ cuối, trong khi scrollWidth vẫn đúng 375. Bản
     * tiếng Anh ("Try it free") ngắn hơn nên vừa khít — lỗi chỉ lộ ở tiếng Việt.
     *
     * CHỈ ĐẾM NỘI DUNG THẬT: thẻ lá có chữ, hoặc liên kết/nút. Nền trang trí (vầng sáng, vòng
     * tròn, canvas hiệu ứng) vốn CỐ Ý rộng hơn khung rồi bị cắt — đó là cách chúng được vẽ, kêu
     * lên là kêu nhầm. Trang chủ có 12 thẻ kiểu đó, không thẻ nào là lỗi.
     */
    out.clipped = [...document.querySelectorAll('a, button, [role="button"], h1, h2, h3, p, span, li, strong')]
      .filter((el) => {
        if (el.childElementCount > 0 && !/^(A|BUTTON)$/.test(el.tagName)) return false;
        const txt = (el.textContent || '').trim();
        if (!txt) return false;
        if (el.closest('[aria-hidden="true"]')) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return false;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.position === 'fixed') return false;
        const vw = document.documentElement.clientWidth;
        if (!(r.left < vw - 8 && r.right > vw + 2)) return false;
        /**
         * BỎ QUA thứ nằm trong một dải CUỘN NGANG ĐƯỢC.
         *
         * Vượt mép mà vẫn với tới được thì không phải bị xén — người dùng vuốt ngang là thấy. Đây
         * là cách dựng đúng cho dải thẻ, băng chuyền, bảng rộng trên điện thoại.
         *
         * Bắt hụt ngay lượt chạy đầu của chính phép đo này: dải thẻ ở /blog bị báo '"Hướng dẫn3"
         * lòi 97px', nhưng thẻ cha .tw-bl-tabs có overflow-x:auto với 790px nội dung trong khung
         * 342px — vuốt một cái là tới. Báo như vậy là bắt người ta đi sửa một chỗ vốn đúng, đúng
         * kiểu lỗi giả đã phải dọn ở 429, alt="" và "2 thẻ H1".
         */
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const pcs = getComputedStyle(p);
          if (/(auto|scroll)/.test(pcs.overflowX) && p.scrollWidth > p.clientWidth + 2) return false;
        }
        return true;
      })
      .slice(0, 4)
      .map((el) => `"${(el.textContent || '').trim().slice(0, 28)}" lòi ${Math.round(el.getBoundingClientRect().right - document.documentElement.clientWidth)}px`);

    /**
     * ĐẾM THẺ THẬT SỰ ĐƯỢC RENDER, bỏ qua vùng ẩn.
     *
     * React streaming SSR đổ nội dung vào một node `<div hidden id="S:0">` rồi chuyển vào chỗ, và
     * node ẩn đó nằm lại trong DOM. Đếm thô thì một trang có suspense ra "2 thẻ H1" — đúng báo
     * động giả vừa gặp trên /support, và mất nửa giờ đi tìm một lỗi không tồn tại.
     *
     * Vùng `hidden` cũng bị trình đọc màn hình bỏ qua, nên không đếm là đúng cả về khả năng tiếp
     * cận chứ không chỉ để cho gọn.
     */
    const rendered = (el) => !el.closest('[hidden]') && el.getClientRects().length > 0;
    out.h1 = [...document.querySelectorAll('h1')].filter(rendered).length;
    out.title = document.title;
    // Liên kết nội bộ, để dò link gãy ở bước sau.
    out.links = [...document.querySelectorAll('a[href]')]
      .map((a) => a.getAttribute('href'))
      .filter((h) => h && !h.startsWith('#') && !h.startsWith('mailto:') && !h.startsWith('tel:'));
    // Nút/liên kết không có chữ và không có nhãn — người dùng đọc màn hình gặp một ô trống.
    /**
     * Nút / liên kết KHÔNG có tên cho trình đọc màn hình.
     *
     * Hai điều kiện bản đầu bỏ sót, và cả hai đều làm nó tố cáo mã đúng:
     *
     *  1. Nhãn có thể nằm ở PHẦN TỬ CON. Nút xoá của antd là
     *     `<button><span role="img" aria-label="close-circle">` — có tên đàng hoàng, nhưng xét
     *     riêng thẻ button thì trông như trống rỗng.
     *  2. `tabindex="-1"` nghĩa là bàn phím không tới được, nên nó không phải mốc điều hướng.
     *
     * Cũng xét aria-labelledby: đó là cách khai tên phổ biến không kém aria-label.
     */
    const named = (el) => {
      if (el.getAttribute('tabindex') === '-1') return true;
      if (el.textContent.trim()) return true;
      for (const a of ['aria-label', 'title', 'aria-labelledby']) if (el.getAttribute(a)) return true;
      // Nhãn ở con: ảnh có alt, hoặc bất kỳ hậu duệ nào mang aria-label.
      if (el.querySelector('[aria-label],[title]')) return true;
      if ([...el.querySelectorAll('img')].some((i) => (i.getAttribute('alt') ?? '').trim())) return true;
      return false;
    };
    out.unlabeled = [...document.querySelectorAll('a,button')].filter((el) => rendered(el) && !named(el)).length;
    return out;
  });

  if (info.brokenImgs.length) issues.push(`${info.brokenImgs.length} ảnh không tải được: ${info.brokenImgs[0]}`);
  if (info.imgsNoAlt) issues.push(`${info.imgsNoAlt}/${info.imgs} ảnh thiếu alt`);
  if (info.docWidth > info.viewWidth + 2) {
    issues.push(
      `TRÀN NGANG ${info.docWidth - info.viewWidth}px trên ${viewport.name}` +
        (info.overflowing.length ? ` — do ${info.overflowing.join(', ')}` : ''),
    );
  }
  // Báo RIÊNG với tràn ngang: ở đây trang không cuộn, nên người dùng không có cách nào kéo ra xem
  // phần bị mất — và vì thế nó dễ lọt qua mắt hơn hẳn tràn ngang thường.
  if (info.clipped?.length && info.docWidth <= info.viewWidth + 2) {
    issues.push(
      `NỘI DUNG BỊ XÉN Ở MÉP trên ${viewport.name} (trang không cuộn ngang nên không kéo ra xem được): ` +
        info.clipped.join(' · '),
    );
  }
  if (info.h1 === 0) issues.push('không có H1');
  else if (info.h1 > 1) issues.push(`${info.h1} thẻ H1`);
  if (info.unlabeled) issues.push(`${info.unlabeled} nút/liên kết không có chữ lẫn nhãn — trình đọc màn hình thấy ô trống`);
  if (ms > 6000) issues.push(`tải ${ms}ms — chậm`);

  await ctx.close();
  return { url, viewport: viewport.name, status, ms, issues, counts: info };
}
