/**
 * IndexNow — báo cho công cụ tìm kiếm rằng có URL mới, ngay khi vừa đăng.
 *
 * Vì sao dùng cái này: nó là đường duy nhất báo-index mà KHÔNG cần tài khoản, không cần xác minh
 * quyền sở hữu, không cần khoá dịch vụ. Chỉ cần một file khoá nằm công khai trên chính tên miền
 * đó — đặt được file ở đó tức là chứng minh được quyền sở hữu.
 *
 *   apps/web/public/<KEY>.txt   chứa đúng chuỗi <KEY>
 *
 * NÓI RÕ GIỚI HẠN: Bing, Yandex, Seznam, Naver nhận IndexNow. GOOGLE KHÔNG. Google chỉ nhận
 * sitemap (đã có, robots.ts trỏ tới) và Indexing API — mà Indexing API đòi service account của
 * Google Cloud kèm quyền sở hữu trong Search Console, hai thứ dự án này chưa có. Đừng tưởng gọi
 * hàm này là Google đã biết.
 */

/**
 * Khoá phải KHỚP tên file trong apps/web/public/. Khoá IndexNow vốn công khai, không phải bí mật.
 *
 * VÌ SAO ĐỔI KHOÁ NGÀY 21/09/2026. Khoá cũ fcab6f06…e0e2 bị Microsoft từ chối vĩnh viễn:
 * mọi lượt gửi đều trả về 403 UserForbiddedToAccessSite, ở cả api.indexnow.org lẫn www.bing.com.
 *
 * Nguyên nhân không nằm ở file khoá — file trả đúng 32 byte, đúng chuỗi khoá, không có ký tự
 * xuống dòng thừa, content-type text/plain, và mọi User-Agent kiểu bot đều tải được 200 (đã đo
 * cả bingbot lẫn không UA, Cloudflare không chặn). Nguyên nhân là TRƯỚC bản deploy này, proxy.ts
 * không loại trừ đuôi .txt khỏi matcher, nên chính file khoá bị đá 307 sang /login. Mỗi lượt
 * Microsoft sang xác minh đều gặp trang đăng nhập, và họ ghi nhớ trạng thái "khoá không hợp lệ"
 * cho cặp (tên miền, khoá) đó. Sửa proxy xong thì file đã phục vụ đúng, nhưng trạng thái đã ghi
 * nhớ kia không tự xoá — thử lại nhiều lượt, cả hai endpoint, vẫn 403.
 *
 * Khoá mới chưa từng có lịch sử nên không dính trạng thái đó. File khoá CŨ vẫn để nguyên trong
 * public/: nó không tốn gì, và cách đẩy mã lên máy chủ không xoá file (không có --delete), nên
 * xoá ở đây cũng không làm nó biến mất trên máy chủ.
 */
export const INDEXNOW_KEY = '70c39475c5e6fb913828c0398b61dbc5';
export const SITE_HOST = 'toolswave.net';

/**
 * Gửi tối đa 10.000 URL một lượt (giới hạn của giao thức).
 *
 * Trả về { ok, status, note } — KHÔNG ném. Việc báo index hỏng không được phép kéo đổ việc đăng
 * bài: bài đã lên site rồi thì nó vẫn được thu thập qua sitemap, chỉ là chậm hơn.
 */
export async function submitToIndexNow(urls, { key = INDEXNOW_KEY, host = SITE_HOST } = {}) {
  const list = [...new Set((urls ?? []).filter(Boolean))].slice(0, 10000);
  if (!list.length) return { ok: true, status: 0, note: 'không có URL nào để gửi' };

  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host,
        key,
        keyLocation: `https://${host}/${key}.txt`,
        urlList: list,
      }),
    });
    // 200 = nhận rồi. 202 = nhận nhưng khoá đang chờ kiểm tra — vẫn coi là thành công.
    //
    // Với 403, ĐỪNG đoán. Bản cũ ở đây ghi sẵn "nhiều khả năng file khoá chưa deploy", và ngày
    // 21/09/2026 lời đoán đó dẫn đi sai hẳn một vòng: file khoá vẫn phục vụ 200, đúng 32 byte,
    // đúng nội dung. Lý do thật nằm trong phần thân phản hồi (errorCode), mà bản cũ vứt đi.
    // Đọc thân phản hồi ra rồi kèm vào ghi chú, để lần sau nhìn là biết.
    let body = '';
    try { body = (await res.text()).slice(0, 300); } catch { /* không đọc được thì thôi */ }
    const note =
      res.status === 403
        ? `403 — máy chủ tìm kiếm từ chối. Kiểm theo thứ tự: (1) https://${host}/${key}.txt có trả 200 và đúng nội dung khoá không, (2) nếu có thì gần như chắc là cặp (tên miền, khoá) đã bị ghi nhớ trạng thái xấu từ những lượt hỏng trước — phải ĐỔI SANG KHOÁ MỚI, thử lại khoá cũ bao nhiêu lượt cũng vô ích. Phản hồi: ${body}`
        : res.status === 422
          ? `422 — URL không thuộc host đã khai. Phản hồi: ${body}`
          : body && !res.ok
            ? `${res.status} — ${body}`
            : '';
    return { ok: res.status === 200 || res.status === 202, status: res.status, note, count: list.length };
  } catch (e) {
    return { ok: false, status: 0, note: e.message, count: list.length };
  }
}
