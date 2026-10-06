/**
 * Câu hỏi thường gặp — nguồn DUY NHẤT cho cả phần hiển thị lẫn JSON-LD, và cho cả hai ngôn ngữ.
 *
 * File riêng, không để trong layout.tsx: layout là server component và có `export const metadata`;
 * import nó từ trang client sẽ kéo cả module đó vào gói client.
 *
 * Một nguồn chứ không phải hai bản: viết riêng một bản cho mắt người và một bản cho máy tìm kiếm
 * thì chúng trôi lệch nhau, và Google thấy một câu trả lời mà người dùng không thấy — đúng thứ
 * dữ liệu có cấu trúc bị phạt vì.
 *
 * Không dùng hệ i18n chung ở đây: FAQ cần đọc được từ SERVER component (để dựng JSON-LD) mà
 * `useI18n` là hook client. Giữ song ngữ ngay trong dữ liệu là cách duy nhất để hai phía dùng
 * chung một nguồn.
 */
export interface FaqItem {
  q: string;
  a: string;
  qEn: string;
  aEn: string;
}

export const FAQ: FaqItem[] = [
  {
    q: "Larkwave có dùng miễn phí được không?",
    a: "Có. Gói miễn phí không cần thẻ tín dụng: dùng Lark Agents trên app máy tính, Trợ lý AI, Kỹ năng và Artifacts. Chạy bằng AI cài trên máy bạn thì không tính hạn mức.",
    qEn: "Is Larkwave free to use?",
    aEn: "Yes. The free plan needs no credit card: use Lark Agents in the desktop app, the AI Assistant, Skills and Artifacts. Running on AI installed on your machine doesn't count toward your quota.",
  },
  {
    q: "Larkwave làm được những gì?",
    a: "Trợ lý AI làm việc trong Lark: đọc/ghi Bitable, Docs, Sheets, Wiki, Drive, Lịch và tin nhắn; tự động hoá theo lịch hoặc bằng bot/webhook; xuất tệp xlsx/docx/pdf/csv; Đặc tả sống từ Lark; đồng bộ CMS Bitable; chia sẻ trợ lý cho đồng đội.",
    qEn: "What can Larkwave do?",
    aEn: "An AI assistant that works in Lark: read/write Bitable, Docs, Sheets, Wiki, Drive, Calendar and messages; automate on a schedule or via bot/webhook; export xlsx/docx/pdf/csv files; a living Spec pulled from Lark; Bitable CMS sync; share the assistant with teammates.",
  },
  {
    q: "Làm sao kết nối tài khoản Lark?",
    a: "Cài app máy tính Larkwave (macOS/Windows), mở Lark Agents và quét mã QR bằng app Lark — hoặc dùng app tự tạo (custom app) của doanh nghiệp. Bạn kết nối được nhiều tài khoản Lark.",
    qEn: "How do I connect my Lark account?",
    aEn: "Install the Larkwave desktop app (macOS/Windows), open Lark Agents and scan the QR code with the Lark app — or use your company's custom app. You can connect several Lark accounts.",
  },
  {
    q: "AI có tự ý sửa dữ liệu Lark không?",
    a: "Không. Mọi thao tác ghi (thêm/sửa bản ghi, tạo Base, đổi quyền, gửi tin nhắn) đều hiện để bạn xác nhận trước khi chạy.",
    qEn: "Does the AI change Lark data on its own?",
    aEn: "No. Every write (adding/editing records, creating a Base, changing permissions, sending messages) is shown for you to confirm before it runs.",
  },
  {
    q: "Tôi báo lỗi ở đâu?",
    a: "Đăng nhập rồi gửi ngay trong trang này, hoặc bấm nút báo lỗi ở góc màn hình khi đang dùng app. Báo lỗi kèm ảnh chụp màn hình được xử lý nhanh hơn.",
    qEn: "Where do I report a bug?",
    aEn: "Sign in and send it right on this page, or use the report button in the corner while using the app. Reports with a screenshot get handled faster.",
  },
  {
    q: "Báo lỗi rồi thì bao lâu có phản hồi?",
    a: "Mỗi báo cáo đều được đọc và phân loại. Lỗi chặn người dùng làm việc được ưu tiên trước. Bạn xem lại trạng thái báo cáo của mình ngay trong trang này.",
    qEn: "How long until someone responds?",
    aEn: "Every report is read and triaged. Bugs that block people from working are handled first. You can track your own reports on this page.",
  },
  {
    q: "Thanh toán gói trả phí thế nào?",
    a: "Chọn gói ở trang Gói & Giá rồi chuyển khoản bằng mã QR ngân hàng; gói tự kích hoạt khi tiền về. Cần thêm dung lượng thì mua thêm 1 GB với 100.000đ/tháng.",
    qEn: "How do I pay for a paid plan?",
    aEn: "Pick a plan on the Plans & Pricing page and pay by bank QR transfer; the plan activates automatically once the payment arrives. Need more storage? Add 1 GB for 100,000đ/month.",
  },
  {
    q: "Tôi quên mật khẩu thì làm sao?",
    a: "Dùng liên kết quên mật khẩu ở trang đăng nhập. Hệ thống gửi thư đặt lại về đúng địa chỉ đã đăng ký.",
    qEn: "I forgot my password — what now?",
    aEn: "Use the forgot-password link on the sign-in page. A reset email goes to the address you registered with.",
  },
  {
    q: "Dữ liệu Lark và hội thoại của tôi có riêng tư không?",
    a: "Phiên Lark nằm trên máy bạn. Hội thoại hay Artifact chỉ công khai khi bạn tự tạo link chia sẻ, và những link đó được đặt ngoài chỉ mục tìm kiếm. Chia sẻ trợ lý cho đồng đội dùng quyền uỷ thác, không lộ khoá bí mật.",
    qEn: "Are my Lark data and conversations private?",
    aEn: "Your Lark session stays on your machine. A conversation or Artifact is only public when you create a share link yourself, and those links are kept out of search indexes. Sharing the assistant with teammates uses delegated access, with no secret keys exposed.",
  },
];

/** Lấy đúng ngôn ngữ. `lang` chỉ nhận "vi" | "en" — mọi giá trị khác rơi về tiếng Việt. */
export function faqFor(lang: string): { q: string; a: string }[] {
  const en = lang === "en";
  return FAQ.map((f) => ({ q: en ? f.qEn : f.q, a: en ? f.aEn : f.a }));
}
