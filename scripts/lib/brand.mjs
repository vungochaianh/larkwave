/**
 * Luật thương hiệu dùng chung cho cả script soi (seo-report) và script viết lại (blog-refresh).
 *
 * Để ở một chỗ vì hai script phải đồng ý với nhau: script viết lại dùng luật này để CHỌN bài cần
 * sửa và để chặn không ghi đè khi bài mới vẫn hỏng. Hai bản luật riêng rồi trôi lệch thì sẽ có
 * lúc nó sửa một bài mà báo cáo vẫn kêu, hoặc ngược lại.
 */

export const RIVALS = ['wordpress', 'shopify', 'wix', 'haravan', 'squarespace', 'webflow', 'ladipage'];

/**
 * Bỏ URL, ảnh, khối mã trước khi đếm chữ.
 *
 * Bắt buộc: bài đầu tiên đếm ra 3 lần "toolswave" mà CẢ BA đều là đường dẫn ảnh
 * (apia.toolswave.net/uploads/...). Đếm thô thì mọi bài đều trông như có nhắc thương hiệu.
 */
export function prose(body) {
  return (body || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\]\([^)]*\)/g, '] ')
    .replace(/https?:\/\/\S+/g, ' ');
}

/**
 * Trả về câu mô tả vấn đề, hoặc null khi bài ổn.
 *
 * MIỄN TRỪ tên đối thủ đã có trong TIÊU ĐỀ bài. Bản luật đầu không có ngoại lệ này và nó gắn cờ
 * bài "Tạo blog cá nhân chuẩn SEO mà không cần cài WordPress" — nhưng bài đó định vị WordPress là
 * thứ KHÔNG cần đến ("Bạn không cần WordPress để có một blog chuẩn SEO"), tức là SEO cạnh tranh
 * hợp lệ và là chủ đề chọn có chủ ý trong blog-topics.txt. Gắn cờ nó là bắt script viết lại một
 * bài vốn đã đúng, bằng một bản mô tả cấm nhắc chính cái tên nằm trong tiêu đề của nó.
 *
 * Ngoại lệ này KHÔNG giảm số bài phải viết lại (13 trước và sau) — bài đó vẫn trượt vì không nhắc
 * Toolswave lần nào. Nó chỉ đổi LÝ DO, và lý do mới mới là thứ đáng sửa. Commit 0f9dac5 ghi
 * "13 → 11" là tôi đọc nhầm một đoạn log bị cắt dòng đầu.
 */
export function brandProblem(post) {
  const title = String(post?.title ?? '');
  const t = prose(post?.content);
  const rivals = RIVALS.filter((r) => new RegExp(r, 'i').test(t) && !new RegExp(r, 'i').test(title));
  if (rivals.length) return `nhắc đối thủ: ${rivals.join(', ')}`;
  const mentions = (t.match(/toolswave/gi) || []).length;
  if (!mentions) return 'không nhắc Toolswave lần nào trong chữ — bài chung chung, không kéo ai về';
  if (mentions > 8) return `nhắc Toolswave ${mentions} lần — nhồi từ khoá`;
  return null;
}
