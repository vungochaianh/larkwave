import type { Metadata } from "next";
import { resolveLang } from "@/lib/serverLocale";
import LandingPage from "@/components/landing/LandingPage";
import { FAQS } from "./welcome/content";

const SITE = "https://toolswave.net";

/**
 * TRANG CHỦ — `toolswave.net/`.
 *
 * Trước đây "/" không phải trang chủ: khách và bot bị 307 sang `/welcome`, còn người đã đăng nhập
 * thấy màn hình khác. Ba cái sai cùng lúc:
 *
 *   1. URL có thẩm quyền cao nhất của site trả CHUYỂN HƯỚNG thay vì nội dung. Google lập chỉ mục
 *      `/welcome`, và giá trị liên kết trỏ về gốc — thứ mọi backlink tự nhiên đều trỏ tới — bị
 *      phân tán sang một URL khác.
 *   2. `307` là chuyển hướng TẠM THỜI. Dùng nó cho một cấu trúc cố định là nói với máy tìm kiếm
 *      rằng "chỗ này sắp đổi lại", nên nó không dồn thẩm quyền về đích.
 *   3. Không thẻ canonical nào. `/` và `/welcome` là hai URL cùng nội dung mà không cái nào tự
 *      nhận là bản chính — đúng định nghĩa nội dung trùng lặp.
 *
 * Nay: `/` phục vụ nội dung thật, `/welcome` chuyển VĨNH VIỄN về đây (301) để không gãy link cũ
 * và dồn hết thẩm quyền về một chỗ, canonical trỏ `/`.
 *
 * Khối dữ liệu có cấu trúc ở dưới chuyển nguyên từ `welcome/layout.tsx` sang — nó phải nằm cùng
 * URL mà nó mô tả, nếu không thì mô tả một trang đang chuyển hướng đi nơi khác.
 */
type SP = Promise<Record<string, string | string[] | undefined>>;

/**
 * CHỮ CỦA TRANG CHỦ, THEO NGÔN NGỮ.
 *
 * Trước đây khối này chỉ có tiếng Việt, nên site chuyển sang tiếng Anh thì thân trang đổi còn
 * <title> vẫn nguyên tiếng Việt — hai nửa của cùng một trang nói hai thứ tiếng. Xem `lib/metaLocale.ts`.
 */
const CHU = {
  vi: {
    // Giữ ngắn: Google cắt quanh 60 ký tự, và KHÔNG thêm hậu tố "· Larkwave" vì template ở layout
    // gốc chỉ áp cho trang con — trang này tự khai title nên phải tự mang thương hiệu đúng một lần.
    title: "Larkwave — Trợ lý AI làm việc thật trên Lark",
    // Dưới ~155 ký tự để Google không cắt mất "dùng thử miễn phí".
    description:
      "Trợ lý AI đọc/ghi Lark Base, Docs, Sheets, Wiki, Drive, Lịch và tin nhắn; tự động hoá theo lịch, xuất tệp thật. Dùng thử miễn phí, không cần thẻ.",
    ogDescription:
      "Kết nối tài khoản Lark và trò chuyện với AI: đọc/ghi Bitable, Docs, Sheets, Wiki, Drive, Lịch — mọi thao tác ghi đều hỏi bạn trước. Tự động hoá theo lịch, kể cả khi tắt máy.",
    twDescription:
      "AI cho Lark: đọc/ghi Base, Docs, Sheets, Wiki, Drive, Lịch; tự động hoá theo lịch; xuất xlsx/docx/pdf.",
    keywords: [
      "trợ lý AI",
      "trợ lý AI cho Lark",
      "AI cho Lark",
      "Lark Agents",
      "tự động hoá Lark Base",
      "Lark Base automation",
      "Bitable AI",
      "đồng bộ Bitable",
      "Feishu AI",
      "AI assistant",
      "AI agent",
      "Larkwave",
    ],
  },
  en: {
    title: "Larkwave — an AI assistant that works inside Lark",
    description:
      "AI that reads and writes Lark Base, Docs, Sheets, Wiki, Drive, Calendar and messages; scheduled automation, real file exports. Free to try, no card.",
    ogDescription:
      "Connect your Lark account and chat with AI that reads and writes Bitable, Docs, Sheets, Wiki, Drive and Calendar — every write asks you first. Scheduled automation, even with your computer off.",
    twDescription:
      "AI for Lark: read/write Base, Docs, Sheets, Wiki, Drive, Calendar; scheduled automation; xlsx/docx/pdf export.",
    keywords: [
      "AI assistant",
      "AI for Lark",
      "Lark Agents",
      "Lark Base automation",
      "Bitable AI",
      "Bitable sync",
      "Feishu AI assistant",
      "AI agent",
      "Larkwave",
    ],
  },
} as const;

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const sp = await searchParams;
  const lang = await resolveLang(sp.lang);
  const t = CHU[lang];
  const canonical = lang === "vi" ? "/" : "/?lang=en";
  return {
    metadataBase: new URL(SITE),
    title: t.title,
    description: t.description,
    keywords: [...t.keywords],
    alternates: { canonical, languages: { vi: "/", en: "/?lang=en", "x-default": "/" } },
    openGraph: {
      type: "website",
      url: lang === "vi" ? SITE : `${SITE}/?lang=en`,
      siteName: "Larkwave",
      title: t.title,
      description: t.ogDescription,
      locale: lang === "vi" ? "vi_VN" : "en_US",
      alternateLocale: lang === "vi" ? ["en_US"] : ["vi_VN"],
      // Khai ẢNH rõ ràng: một khối openGraph lồng mà thiếu `images` sẽ đè mất /og.png của layout
      // gốc, và trang chủ chia sẻ ra không có ảnh xem trước.
      images: [{ url: "/og.png", width: 1200, height: 630, alt: t.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: t.title,
      description: t.twDescription,
      images: ["/og.png"],
    },
  };
}

export default async function HomePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const lang = await resolveLang(sp.lang);
  const vi = lang === "vi";
  const t = CHU[lang];
  // `DeveloperApplication` là phân loại SAI cho một nền tảng mà phần lớn người dùng không phải lập
  // trình viên; `BusinessApplication` mô tả đúng hơn. Giá 0 trơ trọi cũng gây hiểu nhầm là miễn phí
  // hoàn toàn — khai kèm trang bảng giá thì đúng với mô hình hạn mức tháng.
  const appLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Larkwave",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, Windows, macOS",
    description: t.description,
    url: SITE,
    // Giao diện có hai ngôn ngữ (packages/ui/src/i18n.tsx tự chọn theo trình duyệt) — khai cả
    // hai để máy tìm kiếm không xếp sản phẩm vào "chỉ tiếng Việt".
    inLanguage: ["vi-VN", "en"],
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "VND",
      description: "Gói miễn phí để bắt đầu; các gói trả phí tính theo % hạn mức dùng AI hàng tháng.",
      url: `${SITE}/pricing`,
    },
  };
  const orgLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE}/#organization`,
    name: "Larkwave",
    url: SITE,
    logo: `${SITE}/icon`,
    description: t.description,
  };
  // Không khai SearchAction: Larkwave không có trang tìm kiếm công khai.
  const siteLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE}/#website`,
    name: "Larkwave",
    url: SITE,
    inLanguage: vi ? "vi-VN" : "en-US",
    publisher: { "@id": `${SITE}/#organization` },
  };
  // FAQ chỉ phát ở bản tiếng Việt. Nguồn chữ là welcome/content.ts, còn bản tiếng Anh của nó nằm
  // trong từ điển i18n — một module "use client", nên server component không đọc được giá trị
  // thật. Thà không khai còn hơn khai câu hỏi tiếng Việt trên một trang đang hiện tiếng Anh: đó
  // là cho máy tìm kiếm thấy một câu trả lời mà người đọc không thấy.
  const faqLd = vi ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  } : null;
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(siteLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appLd) }} />
      {faqLd ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      ) : null}
      <LandingPage lang={lang} />
    </>
  );
}
