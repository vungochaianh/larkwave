/**
 * Hai thứ một bài blog cần mà việc "ghi vào cơ sở dữ liệu" không tự làm: LIÊN KẾT NỘI BỘ và ẢNH BÌA.
 *
 * VÌ SAO TÁCH RA ĐÂY. Trước 23/09/2026 chỉ `blog-autopost.mjs` có chèn liên kết nội bộ, còn
 * `blog-publish.mjs` thì không — và không sinh ảnh bìa. Hậu quả đo được: đúng 5 bài đăng bằng
 * blog-publish hôm 22/09 vừa thiếu ảnh bìa vừa thiếu liên kết, kéo điểm SEO trung bình xuống 73.
 * Đó không phải xui: hai đường đăng bài không ngang nhau thì bài đi đường nào sẽ mang khuyết tật
 * của đường đó. Một bản dùng chung là cách duy nhất để chúng không trôi lệch lần nữa.
 */

/** Gọi API có kèm token, ném khi không phải 2xx. */
async function goi(api, token, method, route, body) {
  const r = await fetch(`${api}${route}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { 'content-type': 'application/json; charset=utf-8' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${route} → HTTP ${r.status} ${t.slice(0, 160)}`);
  try {
    return JSON.parse(t);
  } catch {
    throw new Error(`${method} ${route} → phản hồi không phải JSON`);
  }
}

/**
 * Chèn mục "Đọc thêm" trỏ tới bài CÙNG THẺ vào cuối thân bài.
 *
 * Trang bài cũng tự chèn một khối "Đọc thêm" lúc dựng, nhưng hai thứ đó không thừa nhau: khối lúc
 * dựng chỉ tồn tại trên web, còn mục này nằm trong NỘI DUNG nên đi theo bài ở mọi nơi — RSS, bản
 * xuất, bất kỳ giao diện nào sau này. Trang dựng đã biết nhường: thấy nội dung tự có liên kết rồi
 * thì nó không chèn nữa, nên không bao giờ hiện hai lần.
 *
 * Hỏng thì trả lại thân bài nguyên vẹn — một lượt gọi API lỗi không được phép làm hỏng bài viết.
 */
export async function themLienKetNoiBo(api, token, body, tags, gioiHan = 3) {
  const text = String(body || '');
  const chon = new Map();
  for (const tag of tags ?? []) {
    if (chon.size >= gioiHan) break;
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await goi(api, token, 'GET', `/blog?page=1&pageSize=6&tag=${encodeURIComponent(tag)}`);
      for (const p of r.items ?? []) {
        if (chon.size >= gioiHan) break;
        if (!chon.has(p.slug)) chon.set(p.slug, p);
      }
    } catch {
      /* một thẻ hỏng không được làm hỏng cả bài */
    }
  }
  if (!chon.size) return text;
  const dong = [...chon.values()].map((p) => `- [${p.title}](/blog/${p.slug})`);
  return [text.trimEnd(), '', '## Đọc thêm', '', ...dong, ''].join('\n');
}

/**
 * Sinh ảnh bìa qua chính đường "Make Picture" của nền tảng, trả URL (hoặc null).
 *
 * 16:9 vì đây vừa là ảnh bìa bài vừa là thẻ chia sẻ mạng xã hội — ảnh vuông bị cắt hai bên khi
 * Facebook/Zalo dựng thẻ. Bài không có ảnh bìa thì thẻ chia sẻ ra dạng nhỏ, gần như không ai bấm.
 *
 * Trả null thay vì ném: thiếu ảnh bìa là bài xấu đi, còn ném ở đây là bài KHÔNG được đăng. Giữa
 * hai cái đó thì đăng thiếu ảnh vẫn hơn.
 */
export async function sinhAnhBia(api, token, tieuDe, { choToiDa = 200_000 } = {}) {
  try {
    const proj = await goi(api, token, 'POST', '/picture', {
      topic: tieuDe,
      template: 'announce',
      aspect: '16:9',
    });
    let url = proj.imageUrl || '';
    const han = Date.now() + choToiDa;
    while (!url && Date.now() < han) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 5000));
      // eslint-disable-next-line no-await-in-loop
      const d = await goi(api, token, 'GET', `/picture/${proj.id}`);
      if (d.status === 'error') return null;
      url = d.imageUrl || (d.imageUrls || [])[0] || '';
    }
    return url || null;
  } catch {
    return null;
  }
}
