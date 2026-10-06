/**
 * Tuần tự hoá JSON-LD an toàn để nhét vào `dangerouslySetInnerHTML`.
 *
 * `JSON.stringify` KHÔNG làm sạch chuỗi: một tiêu đề bài chứa `</script>` sẽ đóng sớm thẻ script
 * và mọi thứ sau đó chạy như HTML. Bài blog ở đây do AI sinh rồi ghi qua /admin/blog, nên nội dung
 * lọt vào JSON-LD không phải thứ mình gõ tay từng chữ.
 *
 * Tài liệu của Next (node_modules/next/dist/docs/01-app/02-guides/json-ld.md) dặn đúng việc này:
 * đổi `<` sang dạng unicode. `<` vẫn là `<` hợp lệ với bộ đọc JSON, nhưng bộ phân tích HTML
 * không còn thấy một thẻ nào cả.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\u003c");
}

/** Một nguồn duy nhất cho hai thực thể gốc của site. */
export const SITE_URL = "https://toolswave.net";
export const ORG_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

/**
 * Khối @graph dùng chung: Organization + WebSite, kèm breadcrumb nếu trang có.
 *
 * Để ở ĐÂY chứ không chép vào từng trang. Mỗi trang tự khai lại Organization thì máy tìm kiếm
 * thấy nhiều tổ chức trùng tên chứ không thấy một thực thể — đúng thứ `@id` sinh ra để tránh.
 * Trang nào cần thêm (BlogPosting, Product…) thì truyền qua `extra`.
 */
export function siteGraph(opts: {
  breadcrumb?: { name: string; url?: string }[];
  extra?: Record<string, unknown>[];
} = {}) {
  const { breadcrumb, extra = [] } = opts;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORG_ID,
        name: "Larkwave",
        url: SITE_URL,
        logo: { "@type": "ImageObject", url: `${SITE_URL}/og.png` },
        description:
          "Nền tảng tạo web app bằng AI: mô tả ý tưởng, nhận về ứng dụng chạy thật với cơ sở dữ liệu và API.",
      },
      {
        "@type": "WebSite",
        "@id": WEBSITE_ID,
        url: SITE_URL,
        name: "Larkwave",
        // Nút WebSite mô tả CẢ SITE chứ không phải một trang, nên nó khai cả hai thứ tiếng thật
        // sự có. Trước đây khai cứng "vi-VN": trang /support?lang=en tự mâu thuẫn — WebPage nói
        // en-US còn WebSite bao ngoài nói vi-VN.
        inLanguage: ["vi-VN", "en-US"],
        publisher: { "@id": ORG_ID },
      },
      ...(breadcrumb?.length
        ? [
            {
              "@type": "BreadcrumbList",
              itemListElement: breadcrumb.map((b, i) => ({
                "@type": "ListItem",
                position: i + 1,
                name: b.name,
                ...(b.url ? { item: b.url } : {}),
              })),
            },
          ]
        : []),
      ...extra,
    ],
  };
}
