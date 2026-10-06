import type { Metadata } from "next";
import { jsonLdScript, siteGraph, ORG_ID, WEBSITE_ID, SITE_URL as SITE } from "@/lib/jsonLd";
import { metaSongNgu } from "@/lib/metaLocale";
import { resolveLang } from "@/lib/serverLocale";
import { FAQ } from "./faq";
import SupportClient from "./SupportClient";

type SP = Promise<Record<string, string | string[] | undefined>>;

/** Vỏ server mỏng: metadata + JSON-LD; thân trang là island SupportClient. */
export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const sp = await searchParams;
  return metaSongNgu(
    "/support",
    {
      vi: {
        title: "Góp ý & Hỗ trợ — Larkwave",
        description:
          "Báo lỗi, gửi góp ý và tra cứu câu hỏi thường gặp về Larkwave: kết nối Lark, quyền ghi dữ liệu, gói cước, thanh toán, đặt lại mật khẩu và quyền riêng tư.",
        keywords: ["hỗ trợ Larkwave", "báo lỗi Larkwave", "góp ý", "câu hỏi thường gặp"],
      },
      en: {
        title: "Support & feedback — Larkwave",
        description:
          "Report a bug, send feedback and read the FAQ for Larkwave: connecting Lark, write permissions, plans, payment, password resets and privacy.",
        keywords: ["Larkwave support", "report a Larkwave bug", "feedback", "FAQ"],
      },
    },
    // `absolute`: tiêu đề đã tự mang tên thương hiệu, để khuôn "%s · Larkwave" nối thêm nữa là lặp.
    { absolute: true, queryLang: sp.lang },
  );
}

export default async function SupportPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const lang = await resolveLang(sp.lang);
  const vi = lang === "vi";
  const graph = siteGraph({
    breadcrumb: [{ name: vi ? "Góp ý & Hỗ trợ" : "Support & feedback", url: `${SITE}/support` }],
    extra: [
      {
        "@type": "WebPage",
        "@id": `${SITE}/support#webpage`,
        url: `${SITE}/support`,
        name: vi ? "Góp ý & Hỗ trợ — Larkwave" : "Support & feedback — Larkwave",
        inLanguage: vi ? "vi-VN" : "en-US",
        isPartOf: { "@id": WEBSITE_ID },
        about: { "@id": ORG_ID },
      },
      {
        // FAQ lấy ĐÚNG thứ tiếng đang hiển thị. Khai câu hỏi tiếng Việt trên một trang đang hiện
        // tiếng Anh là cho máy tìm kiếm thấy một câu trả lời mà người đọc không thấy — đúng thứ
        // dữ liệu có cấu trúc bị phạt vì.
        "@type": "FAQPage",
        "@id": `${SITE}/support#faq`,
        inLanguage: vi ? "vi-VN" : "en-US",
        mainEntity: FAQ.map((f) => ({
          "@type": "Question",
          name: vi ? f.q : f.qEn,
          acceptedAnswer: { "@type": "Answer", text: vi ? f.a : f.aEn },
        })),
      },
    ],
  });
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(graph) }} />
      <SupportClient lang={lang} />
    </>
  );
}
