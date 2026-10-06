/**
 * Đưa link của một thông báo về đường dẫn CÒN TỒN TẠI trước khi điều hướng.
 *
 * Vì sao cần một lớp riêng: link được ghi vào cơ sở dữ liệu tại thời điểm tạo thông báo, rồi nằm
 * đó mãi. Khi một trang được dời chỗ, mọi thông báo CŨ vẫn trỏ vào đường dẫn cũ và dẫn thẳng ra
 * trang 404 — người dùng bấm vào lời hứa "video đã tạo xong" và nhận lại một trang trắng. Đã xảy
 * ra thật với 19 thông báo (/video/library và /picture/library dời xuống /marketing/...).
 *
 * Dữ liệu cũ đã được vá, nhưng vẫn giữ lớp này: bản cài desktop cũ còn có thể ghi link theo lối cũ,
 * và lần dời trang tới sẽ lại sinh ra đúng vấn đề này.
 *
 * BẢNG HIỆN ĐANG RỖNG CÓ CHỦ Ý (02/10/2026). Ba lối cũ trước đây được dời xuống `/marketing/...`,
 * nhưng bộ Marketing đã sang Social Wave nên ĐÍCH cũng không còn — vá vào đó chỉ là đổi một đường
 * 404 thành một đường 404 khác, lại khiến người đọc mã tin rằng trang đích có thật.
 *
 * Còn một đầu mối đang hở, và nó KHÔNG thuộc tệp này: `apps/api` vẫn ghi link `/marketing/<kind>/library`
 * vào thông báo (video/picture/makeblog + lịch). Máy chủ ở lại là đúng, nhưng link thì chỉ Social
 * Wave dịch được sang màn của nó — ghi trong tài liệu bàn giao, đừng tự đoán ở đây.
 */
const LEGACY_PREFIXES: [string, string][] = [];

export function normalizeNotificationLink(link: string): string {
  for (const [from, to] of LEGACY_PREFIXES) {
    if (link === from || link.startsWith(`${from}?`) || link.startsWith(`${from}/`)) {
      return to + link.slice(from.length);
    }
  }
  return link;
}
