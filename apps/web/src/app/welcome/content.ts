// Nội dung FAQ tĩnh dùng chung cho server (JSON-LD FAQPage ở app/page.tsx) và client (khối FAQ
// trên trang chủ) — một nguồn để hai bên không bao giờ lệch nhau.
//
// Chữ `q`/`a` ở đây là bản TIẾNG VIỆT và phải KHỚP TỪNG CHỮ với `vi` của khoá tương ứng trong
// packages/ui/src/i18n.tsx: t() ưu tiên bảng dịch, câu ở đây chỉ là dự phòng khi thiếu khoá.
// Sửa một bên mà quên bên kia là bản trên máy chủ khác bản trong mã (đã xảy ra một lần).
//
// Định vị: sản phẩm dùng được ở mọi nơi (giao diện Việt/Anh tự theo trình duyệt); tiếng Việt là
// thế mạnh được nêu, không phải điều kiện. Mỗi câu trả lời chỉ nói thứ đang chạy thật, và ghi rõ
// giới hạn (Lark cần app máy tính, lịch đăng gửi qua Telegram, app cần máy chủ riêng ở gói Pro).

export const FAQS: { q: string; a: string; qKey: string; aKey: string }[] = [
  {
    qKey: "home.lpFaq1Q",
    q: "Larkwave là gì?",
    aKey: "home.lpFaq1A",
    a: "Nền tảng AI cho công việc: trò chuyện với trợ lý AI (gửi tệp, nhận lại tệp), tạo web app full-stack, dựng video/ảnh/bài viết, và tự động hoá Lark Base — dùng chung một hạn mức mỗi tháng. Giao diện có tiếng Việt và tiếng Anh.",
  },
  {
    qKey: "home.lpFaq2Q",
    q: "Tôi không ở Việt Nam, dùng được không?",
    aKey: "home.lpFaq2A",
    a: "Được. Larkwave chạy trên trình duyệt, dùng từ bất cứ đâu; giao diện tự chuyển sang tiếng Anh theo ngôn ngữ trình duyệt và bạn đổi lại bất cứ lúc nào. Tiếng Việt được chăm kỹ — từ giao diện đến giọng lồng tiếng — nên với người dùng tiếng Việt đó là một lợi thế, không phải điều kiện.",
  },
  {
    qKey: "home.lpFaq3Q",
    q: "Tôi có phải cài gì không?",
    aKey: "home.lpFaq3A",
    a: "Trợ lý AI, tạo app và bộ công cụ nội dung chạy thẳng trên trình duyệt — chỉ cần đăng ký tài khoản. Riêng phần tự động hoá Lark Base chạy qua app máy tính Larkwave (Windows/macOS), vì nó thao tác trực tiếp với phiên Lark của bạn.",
  },
  {
    qKey: "home.lpFaq4Q",
    q: "Trợ lý AI khác gì một chatbot thông thường?",
    aKey: "home.lpFaq4A",
    a: "Nó trả về sản phẩm chứ không chỉ câu trả lời: đọc bảng tính/PDF/Word/ảnh bạn gửi lên, tạo ra tệp thật để tải về, ghi nhớ kỹ năng riêng của bạn dưới dạng lệnh tắt, và chạy được theo lịch hẹn kể cả khi bạn tắt máy.",
  },
  {
    qKey: "home.lpFaq5Q",
    q: "App tạo ra có cơ sở dữ liệu thật không?",
    aKey: "home.lpFaq5A",
    a: "Có. Mỗi web app được dựng đầy đủ: giao diện + cơ sở dữ liệu (Cloudflare D1) + API /api/* + trang quản trị, rồi deploy ra link công khai dạng <tên>.toolswave.net. App cần máy chủ riêng chạy trên Docker (gói Chuyên nghiệp).",
  },
  {
    qKey: "home.lpFaq6Q",
    q: "Video và bài viết được tạo ra thế nào?",
    aKey: "home.lpFaq6A",
    a: "Video được dựng thật từng khung hình trên máy chủ rồi ghép lồng tiếng AI — giọng tiếng Việt tự nhiên đứng đầu danh sách, nghe thử được trước khi chọn. Ảnh hỗ trợ nhiều slide, bài viết theo hướng chuẩn SEO. Bạn có thể đặt lịch để tự tạo và gửi về Telegram.",
  },
  {
    qKey: "home.lpFaq7Q",
    q: "Tự động hoá Lark Base làm được những gì?",
    aKey: "home.lpFaq7A",
    a: "Đọc và ghi bản ghi, tra cấu trúc bảng, xem phân quyền, đọc/giải thích workflow, đồng bộ dữ liệu sang CMS, và đọc được cả nội dung tệp đính kèm (Excel, PDF, ảnh) trong Bitable — 54 công cụ, thao tác với tư cách chính bạn. Phần này cần app máy tính.",
  },
  {
    qKey: "home.lpFaq8Q",
    q: "Tính phí thế nào?",
    aKey: "home.lpFaq8A",
    a: "Mỗi gói có một hạn mức dùng chung hàng tháng cho tất cả tính năng; mỗi lượt dùng trừ một phần % theo khối lượng thực tế. Có gói miễn phí để bắt đầu, không cần thẻ tín dụng.",
  },
  {
    qKey: "home.lpFaq9Q",
    q: "Tôi có thể nhập dự án có sẵn từ GitLab/GitHub không?",
    aKey: "home.lpFaq9A",
    a: "Có. Larkwave nhập repo của bạn, tự nhận diện framework (React, Vue, Next.js…), build và deploy — kèm cả ảnh và tài nguyên của dự án.",
  },
];
