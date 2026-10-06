import type { Metadata } from "next";
import { jsonLdScript, siteGraph, ORG_ID, WEBSITE_ID } from "@/lib/jsonLd";
import { metaSongNgu, SITE } from "@/lib/metaLocale";
import { resolveLang } from "@/lib/serverLocale";
import PricingClient from "./PricingClient";

type SP = Promise<Record<string, string | string[] | undefined>>;

/** Vỏ server mỏng: metadata + JSON-LD; thân trang là island PricingClient. */
export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const sp = await searchParams;
  return metaSongNgu(
    "/pricing",
    {
      vi: {
        title: "Bảng giá và các gói dịch vụ",
        description:
          "Bảng giá Larkwave: hạn mức dùng AI hàng tháng cho trợ lý AI và Lark Agents. Từ 0đ, thanh toán QR tự kích hoạt. Có gói miễn phí, không cần thẻ.",
        ogTitle: "Bảng giá và các gói dịch vụ — Larkwave",
        ogDescription:
          "Hạn mức dùng AI hàng tháng cho trợ lý AI và Lark Agents — chạy bằng AI trên máy bạn thì không tính. Có gói miễn phí để bắt đầu.",
      },
      en: {
        title: "Pricing and plans",
        description:
          "Larkwave pricing: a monthly AI usage quota for the AI assistant and Lark Agents. QR payment with instant activation. Free plan to start, no card needed.",
        ogTitle: "Pricing and plans — Larkwave",
        ogDescription: "A monthly AI usage quota for the assistant and Lark Agents — running on your own machine's AI is free. Free plan to start.",
      },
    },
    { queryLang: sp.lang },
  );
}

export default async function PricingPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const lang = await resolveLang(sp.lang);
  const vi = lang === "vi";
  // siteGraph: Organization ở đây là ĐÚNG một thực thể với trang chủ và trang tải về nhờ chung
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
