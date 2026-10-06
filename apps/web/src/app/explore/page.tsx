import type { Metadata } from "next";
import { jsonLdScript, siteGraph, ORG_ID, WEBSITE_ID } from "@/lib/jsonLd";
import { metaSongNgu, SITE } from "@/lib/metaLocale";
import { resolveLang } from "@/lib/serverLocale";
import ExploreClient from "./ExploreClient";

type SP = Promise<Record<string, string | string[] | undefined>>;

/** Vỏ server mỏng: metadata + JSON-LD. Giao diện nằm ở `ExploreClient.tsx`. */
export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const sp = await searchParams;
  return metaSongNgu(
    "/explore",
    {
      vi: {
        title: "Khám phá app cộng đồng",
        description:
          "Những ứng dụng thật do người dùng Larkwave tạo bằng AI — xem giao diện, mở thử và lấy ý tưởng cho app của bạn.",
        ogTitle: "Khám phá app cộng đồng — Larkwave",
        ogDescription: "Những ứng dụng thật do người dùng tạo bằng AI trên Larkwave.",
      },
      en: {
        title: "Explore community apps",
        description:
          "Real apps that Larkwave users built with AI — look at the interface, open them live and borrow ideas for your own.",
        ogTitle: "Explore community apps — Larkwave",
        ogDescription: "Real apps built with AI by Larkwave users.",
      },
    },
    { queryLang: sp.lang },
  );
}

/**
 * JSON-LD ở ĐÂY chứ không ở layout.tsx như trước.
 *
 * Layout không nhận `searchParams`, nên để nguyên chỗ cũ thì `/explore?lang=en` sẽ có tiêu đề
 * tiếng Anh nhưng dữ liệu có cấu trúc vẫn khai `inLanguage: "vi-VN"` với tên tiếng Việt — đúng
 * kiểu tự mâu thuẫn mà máy tìm kiếm đọc được còn người thì không.
 *
 * Loại CollectionPage chứ không phải WebPage: trang này là một DANH SÁCH sản phẩm.
 */
export default async function ExplorePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const lang = await resolveLang(sp.lang);
  const vi = lang === "vi";
  const graph = siteGraph({
    breadcrumb: [{ name: vi ? "Khám phá" : "Explore", url: `${SITE}/explore` }],
    extra: [
      {
        "@type": "CollectionPage",
        "@id": `${SITE}/explore#webpage`,
        url: `${SITE}/explore`,
        name: vi ? "Khám phá sản phẩm cộng đồng — Larkwave" : "Explore community apps — Larkwave",
        inLanguage: vi ? "vi-VN" : "en-US",
        isPartOf: { "@id": WEBSITE_ID },
        about: { "@id": ORG_ID },
      },
    ],
  });
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(graph) }} />
      {/* Ngôn ngữ đi xuống island — cùng lý do với /pricing, xem chú thích ở đó. */}
      <ExploreClient lang={lang} />
    </>
  );
}
