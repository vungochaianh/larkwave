// Nội dung FAQ tĩnh dùng chung cho server (JSON-LD FAQPage ở app/page.tsx) và client (khối FAQ
// trên trang chủ) — một nguồn để hai bên không bao giờ lệch nhau.
//
// Chữ `q`/`a` ở đây là bản TIẾNG VIỆT và phải KHỚP TỪNG CHỮ với `vi` của khoá tương ứng trong
// packages/ui/src/i18n.tsx: t() ưu tiên bảng dịch, câu ở đây chỉ là dự phòng khi thiếu khoá.
// Sửa một bên mà quên bên kia là bản trên máy chủ khác bản trong mã (đã xảy ra một lần).
//
// Định vị: AI làm việc trong Lark. Mỗi câu trả lời chỉ nói thứ đang chạy thật, và ghi rõ giới
// hạn (Lark Agents cần app máy tính; chạy hộ khi tắt máy ở gói Chuyên nghiệp trở lên).
//
// Khoá mang hậu tố `.lw` để bản dịch cũ (thời còn tạo app) trong i18n.tsx không đè lên câu mới.

export const FAQS: { q: string; a: string; qKey: string; aKey: string }[] = [
  {
    qKey: "home.lpFaq1Q.lw",
    q: "Larkwave là gì?",
    aKey: "home.lpFaq1A.lw",
    a: "Trợ lý AI làm việc ngay trong Lark: kết nối tài khoản Lark/Feishu rồi trò chuyện để AI đọc và ghi Bitable (Base), Docs, Sheets, Wiki, Drive, Lịch và tin nhắn; tự động hoá theo lịch; xuất tệp xlsx/docx/pdf/csv. Có thêm Trợ lý AI trên web với Dự án, Artifacts và Kỹ năng. Giao diện có tiếng Việt và tiếng Anh.",
  },
  {
    qKey: "home.lpFaq2Q.lw",
    q: "Tôi kết nối Lark thế nào?",
    aKey: "home.lpFaq2A.lw",
    a: "Cài app máy tính Larkwave (macOS/Windows), mở Lark Agents rồi quét mã QR bằng app Lark để đăng nhập tài khoản cá nhân — hoặc dùng app tự tạo (custom app) của doanh nghiệp bạn. Larkwave thao tác với tư cách chính bạn, chỉ trong phạm vi quyền bạn đang có.",
  },
  {
    qKey: "home.lpFaq3Q.lw",
    q: "AI có tự ý sửa dữ liệu Lark của tôi không?",
    aKey: "home.lpFaq3A.lw",
    a: "Không. Mọi thao tác GHI — thêm/sửa bản ghi, tạo Base, đổi quyền, gửi tin nhắn — đều hiện yêu cầu xác nhận để bạn duyệt trước. Đọc dữ liệu thì không cần hỏi.",
  },
  {
    qKey: "home.lpFaq4Q.lw",
    q: "Tôi có phải cài gì không?",
    aKey: "home.lpFaq4A.lw",
    a: "Trợ lý AI trên web chạy thẳng trên trình duyệt — chỉ cần đăng ký. Phần làm việc với Lark (Lark Agents) chạy qua app máy tính Larkwave (macOS/Windows), vì nó dùng phiên Lark của bạn. Từ điện thoại hay trình duyệt, bạn vẫn điều khiển được app máy tính đó từ xa.",
  },
  {
    qKey: "home.lpFaq5Q.lw",
    q: "Tự động hoá chạy được khi tôi tắt máy không?",
    aKey: "home.lpFaq5A.lw",
    a: "Được. Đặt lịch kiểu \"mỗi ngày 9h tổng hợp đơn mới trong Base\" là app máy tính tự chạy; với tính năng \"Larkwave chạy hộ\", lịch vẫn chạy trên máy chủ kể cả khi máy bạn tắt. Lịch còn có thể kích hoạt bằng bot/webhook.",
  },
  {
    qKey: "home.lpFaq6Q.lw",
    q: "Tôi dùng AI nào? Có tốn phí AI không?",
    aKey: "home.lpFaq6A.lw",
    a: "Trên app máy tính, bạn chạy bằng Claude, Codex, Gemini hoặc Grok đã cài trên máy mình — không trừ hạn mức Larkwave. Nếu không muốn cài gì, dùng Claude do Larkwave cung cấp, trừ theo % hạn mức của gói.",
  },
  {
    qKey: "home.lpFaq7Q.lw",
    q: "Tôi có thể chia sẻ trợ lý cho đồng đội không?",
    aKey: "home.lpFaq7A.lw",
    a: "Có. Bạn cấp quyền uỷ thác cho từng người để họ dùng trợ lý Lark/AI của bạn — không phải gửi mật khẩu hay khoá bí mật, thu hồi lúc nào cũng được. Hội thoại có thể dùng chung.",
  },
  {
    qKey: "home.lpFaq8Q.lw",
    q: "Tính phí thế nào?",
    aKey: "home.lpFaq8A.lw",
    a: "Mỗi gói có một hạn mức dùng AI hàng tháng; mỗi lượt chạy trên AI của Larkwave trừ một phần % theo khối lượng thực tế. Có gói Miễn phí để bắt đầu, không cần thẻ; thanh toán gói trả phí bằng chuyển khoản QR, tự kích hoạt.",
  },
  {
    qKey: "home.lpFaq9Q.lw",
    q: "Dữ liệu Lark của tôi có an toàn không?",
    aKey: "home.lpFaq9A.lw",
    a: "Phiên đăng nhập Lark nằm trên máy bạn. Khi chia sẻ cho người khác, Larkwave dùng quyền uỷ thác thay vì chia sẻ khoá bí mật; chỉ khi bạn bật \"Larkwave chạy hộ\" thì máy chủ mới giữ thông tin cần thiết để chạy lịch, và bạn tắt được bất cứ lúc nào.",
  },
];
