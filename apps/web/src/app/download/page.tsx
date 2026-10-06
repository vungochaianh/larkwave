import type { Metadata } from "next";
import { jsonLdScript, siteGraph, ORG_ID } from "@/lib/jsonLd";
import { metaSongNgu, SITE } from "@/lib/metaLocale";
import { resolveLang } from "@/lib/serverLocale";
import DownloadClient from "./DownloadClient";

type SP = Promise<Record<string, string | string[] | undefined>>;

/** Vỏ server mỏng: metadata + JSON-LD — xem chú thích ở `explore/page.tsx`. */
export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const sp = await searchParams;
  return metaSongNgu(
    "/download",
    {
      vi: {
        title: "Tải Larkwave Desktop — dựng app bằng AI trên máy bạn",
        description:
          "Dùng Claude CLI ngay trên máy bạn để sinh code, tích hợp sâu Lark × Agents, chạy được cả khi offline. Tải cho Windows & macOS, cài một lần và tự cập nhật.",
        keywords: [
          "tải Larkwave desktop",
          "Larkwave app",
          "Claude desktop app",
          "Lark Agents",
          "tải app dựng app bằng AI",
          "download Larkwave",
        ],
        ogTitle: "Tải Larkwave Desktop — AI trên máy bạn + tích hợp Lark sâu",
        ogDescription:
          "Dựng app bằng Claude CLI của bạn (chi phí gần như 0), Lark × Agents toàn quyền, dựng app từ phân tích, chạy offline. Windows & macOS, tự cập nhật.",
      },
      en: {
        title: "Download Larkwave Desktop — build apps with AI on your machine",
        description:
          "Run your own Claude CLI to generate code, with deep Lark × Agents integration and offline support. For Windows & macOS — install once, it updates itself.",
        keywords: [
          "download Larkwave desktop",
          "Larkwave app",
          "Claude desktop app",
          "Lark Agents",
          "AI app builder download",
        ],
        ogTitle: "Download Larkwave Desktop — AI on your machine, deep Lark integration",
        ogDescription:
          "Build with your own Claude CLI (near-zero cost), full Lark × Agents access, build straight from an analysis, work offline. Windows & macOS, self-updating.",
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
        applicationCategory: "DeveloperApplication",
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
