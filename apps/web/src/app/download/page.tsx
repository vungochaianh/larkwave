import type { Metadata } from "next";
import { jsonLdScript, siteGraph, ORG_ID } from "@/lib/jsonLd";
import { metaSongNgu, SITE } from "@/lib/metaLocale";
import { resolveLang } from "@/lib/serverLocale";
import DownloadClient from "./DownloadClient";

type SP = Promise<Record<string, string | string[] | undefined>>;

/** Vỏ server mỏng: metadata + JSON-LD; thân trang là island DownloadClient. */
export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const sp = await searchParams;
  return metaSongNgu(
    "/download",
    {
      vi: {
        title: "Tải Larkwave Desktop — Trợ lý AI cho Lark trên máy bạn",
        description:
          "Kết nối Lark bằng QR, để AI đọc/ghi Base, Docs, Sheets, Wiki, Drive, Lịch và tin nhắn; tự động hoá theo lịch. Chạy bằng AI của bạn. Windows & macOS, tự cập nhật.",
        keywords: [
          "tải Larkwave desktop",
          "Larkwave app",
          "Lark Agents",
          "trợ lý AI cho Lark",
          "tự động hoá Lark Base",
          "download Larkwave",
        ],
        ogTitle: "Tải Larkwave Desktop — Lark × Agents trên máy bạn",
        ogDescription:
          "AI làm việc trong Lark với tư cách bạn: Bitable, Docs, Sheets, Wiki, Drive, Lịch, tin nhắn. Chạy bằng Claude/Codex/Gemini/Grok của bạn, tự động hoá theo lịch. Windows & macOS.",
      },
      en: {
        title: "Download Larkwave Desktop — an AI assistant for Lark on your machine",
        description:
          "Connect Lark with a QR code and let AI read/write Base, Docs, Sheets, Wiki, Drive, Calendar and messages; scheduled automation. Runs on your own AI. Windows & macOS.",
        keywords: [
          "download Larkwave desktop",
          "Larkwave app",
          "Lark Agents",
          "AI assistant for Lark",
          "Lark Base automation",
        ],
        ogTitle: "Download Larkwave Desktop — Lark × Agents on your machine",
        ogDescription:
          "AI that works in Lark as you: Bitable, Docs, Sheets, Wiki, Drive, Calendar, messages. Runs on your own Claude/Codex/Gemini/Grok, with scheduled automation. Windows & macOS.",
      },
    },
    { absolute: true, queryLang: sp.lang },
  );
}

export default async function DownloadPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const lang = await resolveLang(sp.lang);
  const vi = lang === "vi";
  // SoftwareApplication chứ không phải WebPage: đây là trang TẢI PHẦN MỀM, nên đó là loại thực thể
  // đúng — nó cho trang kết quả tìm kiếm hiện hệ điều hành hỗ trợ và mức giá thay vì một dòng trần.
  const graph = siteGraph({
    breadcrumb: [{ name: vi ? "Tải về" : "Download", url: `${SITE}/download` }],
    extra: [
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE}/download#app`,
        name: "Larkwave Desktop",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Windows, macOS",
        url: `${SITE}/download`,
        publisher: { "@id": ORG_ID },
        // Có gói miễn phí — khai giá 0 là đúng sự thật, và trang kết quả hiện được nhãn "Miễn phí".
        offers: { "@type": "Offer", price: "0", priceCurrency: "VND" },
      },
    ],
  });
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(graph) }} />
      <DownloadClient lang={lang} />
    </>
  );
}
