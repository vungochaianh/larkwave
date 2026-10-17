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
    version: '0.1.5',
    date: '2026-10-17',
    items: [
      "Kỹ năng Zalo & Gmail: kết nối Zalo cá nhân (quét QR) và Gmail (mật khẩu ứng dụng) ở Kỹ năng → Kết nối. Bộ kỹ năng dựng sẵn mới: Đọc & tóm tắt tin Zalo, Gửi tin Zalo, Đọc & tìm thư Gmail, Gửi thư Gmail — gọi bằng /zalo-doc-tin, /zalo-gui-tin, /gmail-doc-thu, /gmail-gui-thu hoặc hỏi tự nhiên.",
      "Agent KHÔNG tự thao tác Zalo/Gmail: chỉ dùng trong kỹ năng có dùng đúng công cụ đó (dựng sẵn hoặc kỹ năng bạn tự soạn), chỉ trong cuộc trò chuyện của bạn — không chạy ở lịch tự động hay bot Lark trong nhóm. Lần gửi nào cũng hỏi bạn trước, kể cả khi bật Tự động duyệt.",
      "An toàn khi gửi: Zalo tối thiểu 8 giây giữa hai tin, tối đa 30 tin/giờ; Gmail tối đa 10 người nhận/thư, 40 thư/giờ. Đọc thư không đánh dấu đã đọc; tin Zalo chỉ giữ trong bộ nhớ, không ghi ra đĩa.",
      "Trợ lý kiểm tra (miễn phí, không dùng AI): nút khiên \"Kiểm tra\" trên thanh đầu tự kiểm Claude/Gemini đã cài + đăng nhập chưa, API key, Zalo, Gmail — thiếu thứ cần thiết thì báo ngay kèm nút \"Sửa ngay\" mở thẳng chỗ sửa (đăng nhập, dán key, quét QR Zalo, nhập Gmail), không phải vào Cài đặt.",
      "Sửa một chạm ở chỗ gặp lỗi: thẻ lỗi Claude có nút \"Đăng nhập lại Claude\" / \"Dùng API key\"; công cụ Zalo/Gmail báo chưa kết nối có nút kết nối; gõ /zalo-… hay /gmail-… khi chưa kết nối thì mở luôn bảng quét QR / Gmail.",
      "Kiểm API key Claude nói đúng nguyên nhân thay vì \"HTTP 400\": key mới tạo mà tài khoản Anthropic chưa nạp credit giờ được báo là key ĐÚNG kèm lời nhắc nạp tiền ở console.anthropic.com → Billing.",
    ],
  },
  {
    version: '0.1.4',
    date: '2026-10-15',
    items: [
      "Lark × Agents chạy đầy đủ bằng Gemini (Gemini CLI): gọi thẳng công cụ Lark như Claude, chữ hiện dần khi đang trả lời, nhớ hội thoại giữa các lượt. Thao tác ghi vẫn hỏi bạn qua hộp xác nhận.",
      "Thêm model Gemini 3.1 Pro, 3 Pro, 3 Flash và \"Tự chọn\" (Gemini tự chọn model theo độ khó của câu hỏi).",
      "An toàn hơn khi dùng Gemini: Gemini không còn được tự chạy lệnh trên máy hay ghi tệp; chỉ dùng công cụ Lark của app (và đọc tệp bạn đính kèm).",
      "Gemini chưa đăng nhập hoặc hết hạn mức thì báo rõ cách xử lý (chạy `gemini` → Login with Google) thay vì một lỗi khó hiểu.",
      "Sửa lỗi không thêm được API key Claude dạng mới (sk-ant-usr-…) mà Anthropic Console đang cấp: app nhận mọi API key Anthropic và kiểm trực tiếp với API, chỉ từ chối token đăng nhập / admin key kèm câu giải thích.",
      "Máy còn bản cài cũ mà thêm API key dạng mới (sk-ant-usr-…): app không báo lỗi khó hiểu nữa mà đề nghị dùng key ngay làm khoá Claude của máy (không cần cài lại), kèm lời nhắc cài bản mới để quản lý key trong danh sách.",
      "Thanh trên màn chat không còn báo nhầm \"Chưa có API key\" khi key đã thêm (tự làm mới ngay khi thêm/xoá key). Chọn \"API trực tiếp\" mà chưa kết nối Lark Bot (App ID) thì app nói rõ: lượt chat chạy bằng CLI trên máy, vẫn dùng API key của bạn.",
    ],
  },
  {
    version: '0.1.3',
    date: '2026-10-11',
    items: [
      "Mỗi tab (hội thoại) có TRANG Lark riêng trong khung: hai tab làm hai Base khác nhau chạy song song không còn giẫm lên nhau; đổi tab là khung đổi sang Base của tab đó.",
      "Tab khác đang chạy không còn khoá nút Gửi; mở tab mới gửi câu hỏi không còn tự từ chối hộp xác nhận đang chờ ở tab kia.",
      "Tài khoản Lark trên thanh khung Lark: xem ai đang đăng nhập, chuyển nhanh giữa nhiều tài khoản (không phải quét lại), Thêm tài khoản Lark, Đăng xuất.",
      "Đăng nhập lần đầu / thêm tài khoản mở thẳng trang đăng nhập Lark có mã QR, không còn dừng ở trang giới thiệu.",
    ],
  },
  {
    version: '0.1.2',
    date: '2026-10-10',
    items: [
      "Lark × Agents XOÁ được bảng, automation và khối Workflow khi bạn yêu cầu — một hộp xác nhận liệt kê đủ từng thứ (kèm số bản ghi), bảng và workflow vào thùng rác của Base nên khôi phục được; xoá xong tự đọc lại để kiểm.",
      "Sửa lỗi hội thoại cũ (nhất là hội thoại chép từ Toolswave) cứ nói \"đang ở chế độ Hỏi đáp\" và không dùng được công cụ mới: khi luật hay công cụ của app đổi, hội thoại tự chuyển sang phiên mới mà vẫn giữ lịch sử.",
      "Model bạn chọn (vd Haiku) giờ được dùng thật cho Lark × Agents — trước đây luôn chạy model mặc định.",
      "Chế độ Tự động không hỏi lại trong chat nữa: xoá/sửa/ghi đè chỉ hỏi đúng một lần qua hộp xác nhận.",
    ],
  },
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
