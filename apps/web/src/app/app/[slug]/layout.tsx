import type { Metadata } from "next";
import type { ReactNode } from "react";
import { deriveSeoDescription } from "@larkwave/shared";
import { API_BASE, APP_BASE_URL } from "@/lib/api";
import { jsonLdScript, siteGraph, ORG_ID, WEBSITE_ID } from "@/lib/jsonLd";

type PublicAppMeta = { name: string; description?: string; author?: string };

/**
 * Lấy app dùng chung cho generateMetadata và cho khối JSON-LD bên dưới.
 *
 * Gọi hai lần KHÔNG tốn hai lượt mạng: Next gộp các `fetch` trùng URL và trùng tuỳ chọn trong
 * cùng một lượt kết xuất. Đổi lại phải giữ tuỳ chọn Y HỆT nhau ở cả hai chỗ — lệch một chữ
 * `revalidate` là mất gộp, và không có gì báo, chỉ là số lượt gọi API lặng lẽ nhân đôi.
 */
async function getApp(slug: string): Promise<PublicAppMeta | null> {
  try {
    const res = await fetch(`${API_BASE}/public/apps/${slug}`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return (await res.json()) as PublicAppMeta;
  } catch {
    return null;
  }
}

/**
 * Per-app social metadata so a shared maker link (Zalo/Facebook/Messenger/X)
 * renders an attractive, app-specific card instead of a generic brand title.
 * The matching opengraph-image.tsx in this folder supplies the preview image —
 * Next wires og:image/twitter:image to it automatically.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const app = await getApp(slug);
  if (!app) return { title: "App công khai" };

  // Document <title> is bare — the root template "%s · Larkwave" appends the suffix once.
  // OG/Twitter titles are NOT run through the template, so they carry the full brand string.
  const socialTitle = `${app.name} · Larkwave`;

  // PHẢI cắt: mô tả này do NGƯỜI DÙNG nhập, không có giới hạn nào ở form, và trước đây được đưa
  // thẳng vào thẻ meta. Đo ngày 21/09/2026 trên bản chạy thật: 255, 212 và 201 ký tự ở ba trong
  // bốn app công khai — Google cắt quanh mốc ~155 nên phần đuôi chỉ tổ làm rối. deriveSeoDescription
  // cắt ở ranh giới TỪ rồi thêm dấu …, chứ không cắt ngang giữa chữ.
  const description =
    deriveSeoDescription(app.description ?? "", "") ||
    `Ứng dụng tạo & deploy bằng Larkwave${app.author ? ` bởi ${app.author}` : ""}.`;

  const url = `${APP_BASE_URL}/app/${slug}`;
  return {
    title: app.name,
    description,
    // Thiếu canonical thì mỗi biến thể URL (có ?utm_…, có dấu / ở cuối) là một trang riêng trong
    // mắt máy tìm kiếm, và uy tín của một trang bị chia ra cho vài bản sao.
    alternates: { canonical: `/app/${slug}` },
    openGraph: { title: socialTitle, description, url, type: "website", siteName: "Larkwave" },
    twitter: { card: "summary_large_image", title: socialTitle, description },
  };
}

/**
 * JSON-LD cho trang giới thiệu một app công khai.
 *
 * Loại đúng ở đây là WebApplication chứ không phải WebPage: thứ đang được mô tả là một ỨNG DỤNG
 * chạy được trên trình duyệt, và đó cũng là thứ máy tìm kiếm có thể hiển thị kèm thông tin tác
 * giả. WebPage chung chung thì khai cũng như không.
 *
 * Khối này kết xuất Ở MÁY CHỦ, khác hẳn phần thân trang (page.tsx là "use client" và tải dữ liệu
 * trong useEffect). Nhờ vậy máy tìm kiếm đọc được tên, mô tả và tác giả ngay trong HTML đầu tiên,
 * không phải chờ chạy JavaScript.
 */
export default async function PublicAppLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const app = await getApp(slug);
  if (!app) return children;

  const url = `${APP_BASE_URL}/app/${slug}`;
  const graph = siteGraph({
    breadcrumb: [
      { name: "Khám phá", url: `${APP_BASE_URL}/explore` },
      { name: app.name, url },
    ],
    extra: [
      {
        "@type": "WebApplication",
        "@id": `${url}#app`,
        url,
        name: app.name,
        applicationCategory: "WebApplication",
        operatingSystem: "Web",
        inLanguage: "vi-VN",
        isPartOf: { "@id": WEBSITE_ID },
        provider: { "@id": ORG_ID },
        ...(app.description ? { description: deriveSeoDescription(app.description, "") } : {}),
        ...(app.author ? { author: { "@type": "Person", name: app.author } } : {}),
      },
    ],
  });

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(graph) }} />
      {children}
    </>
  );
}
