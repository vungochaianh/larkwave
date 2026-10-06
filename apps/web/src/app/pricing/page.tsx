import type { Metadata } from "next";
import { jsonLdScript, siteGraph, ORG_ID, WEBSITE_ID } from "@/lib/jsonLd";
import { metaSongNgu, SITE } from "@/lib/metaLocale";
import { resolveLang } from "@/lib/serverLocale";
import PricingClient from "./PricingClient";

type SP = Promise<Record<string, string | string[] | undefined>>;

/** Vỏ server mỏng: metadata + JSON-LD — xem chú thích ở `explore/page.tsx`. */
export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const sp = await searchParams;
  return metaSongNgu(
    "/pricing",
    {
      vi: {
        title: "Bảng giá và các gói dịch vụ",
        description:
          "Bảng giá Larkwave: một hạn mức dùng chung hàng tháng cho trợ lý AI, tạo app, nội dung và Lark. Có gói miễn phí, không cần thẻ.",
        ogTitle: "Bảng giá và các gói dịch vụ — Larkwave",
        ogDescription:
          "Một hạn mức dùng chung mỗi tháng cho tất cả tính năng. Có gói miễn phí để bắt đầu.",
      },
      en: {
        title: "Pricing and plans",
        description:
          "Larkwave pricing: one shared monthly quota across the AI assistant, app building, content and Lark. Free plan to start, no card needed.",
        ogTitle: "Pricing and plans — Larkwave",
        ogDescription: "One shared monthly quota across every feature. Free plan to start.",
      },
    },
    { queryLang: sp.lang },
  );
}

export default async function PricingPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const lang = await resolveLang(sp.lang);
  const vi = lang === "vi";
  // siteGraph: Organization ở đây là ĐÚNG một thực thể với trang blog và trang tải về nhờ chung
  // `@id`. Ba trang tự khai riêng thì máy tìm kiếm thấy ba tổ chức trùng tên.
  const graph = siteGraph({
    breadcrumb: [{ name: vi ? "Gói & Giá" : "Plans & pricing", url: `${SITE}/pricing` }],
    extra: [
      {
        "@type": "WebPage",
        "@id": `${SITE}/pricing#webpage`,
        url: `${SITE}/pricing`,
        name: vi ? "Gói & Giá — Larkwave" : "Plans & pricing — Larkwave",
        inLanguage: vi ? "vi-VN" : "en-US",
        isPartOf: { "@id": WEBSITE_ID },
        about: { "@id": ORG_ID },
      },
    ],
  });
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(graph) }} />
      {/* Ngôn ngữ đi XUỐNG island. Thiếu một dòng này thì trang tự mâu thuẫn: tiêu đề và thẻ meta
          (dựng ở máy chủ, đọc `?lang=`) ra tiếng Anh, còn thân trang — một client component đọc
          i18n từ context, mà context lúc kết xuất ở máy chủ chưa có gì để dựa vào — luôn ra tiếng
          Việt. Đo ngày 24/09/2026 trên /pricing?lang=en: title "Pricing and plans" đứng trên một
          thân trang "Chọn gói phù hợp với bạn", và bản catalog tiếng Anh đã có sẵn trong mã thì
          không bao giờ được chọn. Máy tìm kiếm đọc HTML thô nên chỉ thấy vế sai. */}
      <PricingClient lang={lang} />
    </>
  );
}
