import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "./providers";
import AntiClone from "@/components/AntiClone";
import RefCapture from "@/components/RefCapture";
import PublicSplash from "@/components/PublicSplash";

// Định vị: Larkwave là trợ lý AI làm việc trong Lark (Lark Agents · tự động hoá · Trợ lý AI ·
// chia sẻ). Không quảng cáo tạo app/video/bài viết — các phần đó không có trong Larkwave.
const TITLE_DEFAULT = "Larkwave — Trợ lý AI làm việc thật trên Lark";
const DESCRIPTION =
  "Trợ lý AI cho Lark: đọc/ghi Bitable, Docs, Sheets, Wiki, Drive, Lịch và tin nhắn, tự động hoá theo lịch, xuất tệp thật. Dùng thử miễn phí.";

export const metadata: Metadata = {
  metadataBase: new URL("https://toolswave.net"),
  title: {
    default: TITLE_DEFAULT,
    template: "%s · Larkwave",
  },
  description: DESCRIPTION,
  applicationName: "Larkwave",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Larkwave",
    statusBarStyle: "default",
  },
  // Cụm tiếng Việt về Lark/Bitable là mảng ít cạnh tranh nhất và đúng người tìm nhất.
  // Lưu ý: Google đã ngừng dùng thẻ meta keywords từ 2009 — giá trị SEO thật nằm ở H1/H2,
  // nội dung trang và sitemap; giữ thẻ này chủ yếu cho các máy tìm kiếm khác và cho nội bộ.
  keywords: [
    "Larkwave",
    // Lark / Bitable
    "trợ lý AI cho Lark",
    "AI cho Lark Base",
    "tự động hoá Lark Base",
    "đồng bộ Bitable",
    "Lark Agents",
    "Feishu AI",
    // Trợ lý AI
    "trợ lý AI tiếng Việt",
    "AI agent tiếng Việt",
    "giải pháp AI cho doanh nghiệp",
    // Biến thể không dấu — người dùng gõ nhanh trên điện thoại thường bỏ dấu.
    "tro ly AI cho Lark",
    "tu dong hoa Lark Base",
  ],
  authors: [{ name: "Larkwave", url: "https://toolswave.net" }],
  creator: "Larkwave",
  openGraph: {
    type: "website",
    siteName: "Larkwave",
    locale: "vi_VN",
    url: "https://toolswave.net",
    title: TITLE_DEFAULT,
    description: DESCRIPTION,
    images: [
      {
        // PNG TĨNH có chủ ý: đáng tin hơn route động với bot mạng xã hội (Zalo/Facebook hay
        // trượt khi route phải sinh ảnh). Đổi lại nó dễ bị cũ — nên tệp này được SINH LẠI từ
        // /opengraph-image mỗi khi định vị đổi, để hai bên không bao giờ nói khác nhau.
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Larkwave — Trợ lý AI làm việc thật trên Lark",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE_DEFAULT,
    description: DESCRIPTION,
    images: ["/og.png"],
  },
  robots: { index: true, follow: true },
};

/**
 * Mobile viewport — the app is phone-first (esp. the "Máy của tôi" agent thread).
 * `width=device-width, initial-scale=1` + a brand theme colour for the address bar.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#6C5CE7",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // `lang` ở đây là giá trị KHỞI ĐIỂM, không phải kết luận: kịch bản tiền-vẽ ngay dưới đặt lại
  // `document.documentElement.lang` theo `?lang=` rồi tới cookie `tw_locale`, trước cả khi React nạp.
  //
  // Vì sao KHÔNG đọc cookie ở đây để đặt thẳng cho đúng ngay trong HTML máy chủ: `cookies()` trong layout GỐC
  // biến MỌI trang của site thành kết xuất động, kể cả những trang hôm nay còn dựng tĩnh được
  // (/skills, /pricing, /welcome…). Đó là một đánh đổi về hiệu năng cho toàn site để đổi lấy một thuộc
  // tính; nên chỗ này chọn sửa cho NGƯỜI ĐỌC (trình đọc màn hình, ngắt dòng, tự dịch của trình duyệt
  // đều đọc thuộc tính SAU khi kịch bản chạy) và chấp nhận máy tìm kiếm thấy 'vi' trong HTML thô.
  // Ngôn ngữ thật của từng trang vẫn được khai đúng qua `alternates.languages` và `openGraph.locale`.
  //
  return (
    <html lang="vi" className="h-full">
      <body className="min-h-full">
        {/* Pre-paint theme: mirror the persisted light/dark choice onto <html> + set the page
            background BEFORE React hydrates, so dark-mode users get no white flash on reload.
            Keep the two layer colors in sync with PALETTES.layer / ThemeProvider.applyThemeToDom. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var m=localStorage.getItem('tw-theme');if(m!=='light'&&m!=='dark')m='light';document.documentElement.dataset.theme=m;document.documentElement.style.backgroundColor=m==='dark'?'#13151C':'#F4F5FB';}catch(e){}try{var q=new URLSearchParams(location.search).get('lang');var c=(document.cookie.match(/(?:^|; )tw_locale=([^;]*)/)||[])[1];var L=q==='en'||q==='vi'?q:(c==='en'||c==='vi'?c:'vi');document.documentElement.lang=L;}catch(e){}`,
          }}
        />
        {/* Cảnh báo khi bundle này bị mirror sang domain lạ. Đặt NGOÀI <Providers> để không
            phụ thuộc theme/antd; render null nên không đụng tới layout. */}
        <AntiClone />
        <Providers>
          <RefCapture />
          {/* Màn mở đầu cho các trang công khai, một lần mỗi phiên. Phải nằm TRONG Providers (để
              ở trang ép sáng nó nằm trong ForceLight và lấy đúng màu), và đặt TRƯỚC children để
              script chống chớp của nó chạy trước khi trình duyệt tới phần thân trang. */}
          <PublicSplash />
          {children}
        </Providers>
      </body>
    </html>
  );
}
