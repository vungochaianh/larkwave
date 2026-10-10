/**
 * App changelog — shown via the sidebar "phiên bản" footer → modal. Newest first;
 * the top entry's version is the app's current version. This list is bundled with
 * the RENDERER, so it updates together with a code-push: seeing a newer top version
 * in the app confirms the renderer code-push landed. Add an entry on each release.
 */
export interface ChangelogEntry {
  version: string;
  /** YYYY-MM-DD */
  date: string;
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.1.1',
    date: '2026-10-10',
    items: [
      "Đăng nhập Lark mặc định hiện MÃ QR để quét bằng app Lark trên điện thoại — kể cả trong khung Lark hẹp cạnh màn chat, nơi trang của Lark tự giấu nút quét mã.",
      "Nút \"Quét mã QR\" / \"Email / SSO\" trên thanh của khung Lark để đổi cách đăng nhập (email, số điện thoại, SSO, Google, Apple).",
      "\"Đăng nhập lại từ điện thoại\" giờ gửi lên đúng mã QR thay vì ảnh ô nhập email.",
    ],
  },
  {
    version: '0.1.0',
    date: '2026-10-07',
    items: [
      "Larkwave 0.1.0 — bản đầu tiên. Trợ lý AI làm việc thật trong Lark: kết nối tài khoản Lark, giao việc bằng một câu tiếng Việt hoặc tiếng Anh.",
      "Lark × Agents đọc và ghi Bitable, Docs, Sheets, Wiki, Drive, Lịch và tin nhắn — mọi thao tác ghi đều hỏi bạn trước, có tuỳ chọn \"nhớ lựa chọn\" cho lần sau.",
      "Nhận về tệp thật: Excel nhiều sheet có công thức và gộp ô, điền thẳng vào mẫu .xlsx có sẵn, Word và PDF.",
      "Đặc tả hệ thống: đọc cấu trúc Base và workflow trực tiếp từ Lark, mỗi lần đồng bộ hiện rõ phần thêm/đổi/gỡ.",
      "Tự động hoá theo lịch: gửi tin nhắn, cập nhật bản ghi, gọi webhook hoặc chạy AI agent theo giờ bạn đặt.",
      "Đồng bộ Bitable (CMS): giữ phiên Lark web luôn sống để các job đồng bộ tự chạy; theo dõi trạng thái, lỗi và nhật ký ngay trong app.",
      "Kỹ năng và Kỹ năng chéo (nhiều bước, kiểm chéo kết quả), chia sẻ hội thoại qua link công khai, điều khiển từ xa từ điện thoại.",
      "Giao diện gọn cho màn hình rộng: thanh bên chỉ còn chức năng Lark, mục tài khoản nằm trong menu ở ảnh đại diện; mặc định tiếng Việt.",
    ],
  },
];

/** Current app version = the newest changelog entry. */
export const APP_VERSION = CHANGELOG[0].version;
