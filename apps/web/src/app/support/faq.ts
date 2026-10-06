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
    a: "Có. Gói miễn phí không cần thẻ tín dụng, đủ để dựng và deploy sản phẩm đầu tiên ra một link công khai.",
    qEn: "Is Larkwave free to use?",
    aEn: "Yes. The free plan needs no credit card and is enough to build and deploy your first project to a public link.",
  },
  {
    q: "Larkwave làm được những gì?",
    a: "Web app full-stack, app mobile, app desktop, tiện ích trình duyệt và game HTML5 — cộng với bộ công cụ nội dung: làm video, làm hình ảnh và viết bài blog bằng AI.",
    qEn: "What can Larkwave build?",
    aEn: "Full-stack web apps, mobile apps, desktop apps, browser extensions and HTML5 games — plus AI content tools for video, images and blog posts.",
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
    q: "Sản phẩm của tôi deploy ở đâu, tên miền thế nào?",
    a: "Web app deploy thật lên hạ tầng Cloudflare và có ngay một link công khai; bạn gắn được tên miền riêng sau đó. App mobile/desktop thì nhận về mã nguồn để chạy trên máy bạn.",
    qEn: "Where does my project deploy, and what about domains?",
    aEn: "Web apps deploy to Cloudflare with a public link right away, and you can attach your own domain. Mobile and desktop apps come back as source you run on your machine.",
  },
  {
    q: "Tôi quên mật khẩu thì làm sao?",
    a: "Dùng liên kết quên mật khẩu ở trang đăng nhập. Hệ thống gửi thư đặt lại về đúng địa chỉ đã đăng ký.",
    qEn: "I forgot my password — what now?",
    aEn: "Use the forgot-password link on the sign-in page. A reset email goes to the address you registered with.",
  },
  {
    q: "Dữ liệu và mã nguồn của tôi có riêng tư không?",
    a: "Sản phẩm bạn dựng là của bạn. Trang chia sẻ chỉ công khai khi bạn tự tạo link chia sẻ, và những link đó được đặt ngoài chỉ mục tìm kiếm.",
    qEn: "Are my data and source code private?",
    aEn: "What you build is yours. A page is only public when you create a share link yourself, and those links are kept out of search indexes.",
  },
];

/** Lấy đúng ngôn ngữ. `lang` chỉ nhận "vi" | "en" — mọi giá trị khác rơi về tiếng Việt. */
export function faqFor(lang: string): { q: string; a: string }[] {
  const en = lang === "en";
  return FAQ.map((f) => ({ q: en ? f.qEn : f.q, a: en ? f.aEn : f.a }));
}
