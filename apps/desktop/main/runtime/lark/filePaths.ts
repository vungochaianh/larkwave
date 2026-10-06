/**
 * Phép chốt "tệp này có nằm trong thư mục cho phép không" — MỘT chỗ duy nhất.
 *
 * Trước đây luật này nằm rải ở hai nơi (`send_file` và handler IPC mở tệp) và bài kiểm thì CHÉP
 * LẠI luật lần thứ ba. Ba bản chép của một luật bảo mật là ba cơ hội để chúng trôi khác nhau, và
 * bài kiểm chép-lại thì vẫn xanh trong lúc mã thật đã hỏng — nó chỉ kiểm chính nó.
 *
 * Vì sao cần chốt: `path` tới từ lượt chạy của model, tức dữ liệu không tin được, y như một ô dữ
 * liệu trong Base. Không chốt thì `send_file` gửi được khoá SSH vào một nhóm Lark, và handler IPC
 * gọi `shell.openPath` lên một tệp thực thi — tức là CHẠY nó.
 */
import { resolve, sep } from 'node:path';

/**
 * `p` có nằm trong `root` (hoặc chính là `root`) không.
 *
 * Hai chi tiết quyết định tính đúng, cả hai đều từng là lỗi thật ở đâu đó:
 *
 *  1. `resolve()` TRƯỚC khi so — nếu không thì `.../work/../../.ssh/id_rsa` lọt qua vì chuỗi của
 *     nó vẫn bắt đầu bằng `root`.
 *  2. Nối `sep` khi so tiền tố — `startsWith(root)` trần cho `/var/www/work-khac` lọt qua vì nó
 *     cùng tiền tố với `/var/www/work`. Và phải là `sep` chứ KHÔNG phải `'/'` cứng: trên Windows
 *     `resolve()` trả dấu `\`, nên một dấu gạch chéo cứng biến chốt bảo mật thành lỗi chức năng —
 *     chặn oan MỌI tệp hợp lệ, và chỉ máy Windows mới thấy.
 */
export function isInsideDir(root: string | null | undefined, p: string | null | undefined): boolean {
  if (!root || !p) return false;
  const r = resolve(root);
  const t = resolve(p);
  return t === r || t.startsWith(r + sep);
}
