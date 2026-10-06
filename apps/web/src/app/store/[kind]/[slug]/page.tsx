import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { StoreListing } from "@larkwave/shared";
import { jsonLdScript } from "@/lib/jsonLd";
import { resolveLang, type Lang } from "@/lib/serverLocale";
import { LandingHeader, LandingFooter } from "@/components/LandingChrome";
import { CursorGlow } from "@/components/fx";
import MarkdownLite from "@/components/MarkdownLite";
import { StoreStyles } from "@/components/store/StoreStyles";
import { getStore } from "@/components/store/storeApi";
import { KIND_BY_SEG, KIND_UI, SITE, formatVnd } from "@/components/store/storeShared";

type Params = Promise<{ kind: string; slug: string }>;
type SP = Promise<Record<string, string | string[] | undefined>>;

const UI: Record<Lang, Record<string, string>> = {
  vi: {
    store: "Cửa hàng",
    buy: "Mua ngay",
    sold: "đã bán",
    inStock: "Còn hàng",
    outStock: "Tạm hết hàng",
    about: "Giới thiệu",
    spec: "Tài liệu đặc tả",
    needs: "Cần chuẩn bị",
    noteTitle: "Về việc đặt mua",
    note: "Nút Mua mở trang sản phẩm ở app.toolswave.net — nơi đang xử lý đơn hàng. Chúng tôi đang chuyển việc đặt mua về đây.",
    version: "Phiên bản",
    format: "Định dạng",
  },
  en: {
    store: "Store",
    buy: "Buy now",
    sold: "sold",
    inStock: "In stock",
    outStock: "Out of stock",
    about: "About",
    spec: "Spec document",
    needs: "Prerequisites",
    noteTitle: "About checkout",
    note: "Buy opens the product page on app.toolswave.net, where orders are processed today. We are moving checkout over here.",
    version: "Version",
    format: "Format",
  },
};

async function load(seg: string, slug: string): Promise<StoreListing | null> {
  const kind = KIND_BY_SEG[seg];
  if (!kind) return null;
  return getStore<StoreListing | null>(`/${kind}/${encodeURIComponent(slug)}`, null);
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SP;
}): Promise<Metadata> {
  const { kind: seg, slug } = await params;
  const sp = await searchParams;
  const lang = await resolveLang(sp.lang);
  const item = await load(seg, slug);
  if (!item) return {};
  const vi = lang === "vi";
  const kindName = KIND_UI[item.kind][lang].name;
  const description =
    item.descriptionShort ??
    (vi
      ? `${item.name} — ${kindName} tại Larkwave, giá ${formatVnd(item.priceVnd, lang)}.`
      : `${item.name} — ${kindName} at Larkwave, ${formatVnd(item.priceVnd, lang)}.`);
  const canonical = vi ? `/store/${seg}/${slug}` : `/store/${seg}/${slug}?lang=en`;
  return {
    metadataBase: new URL(SITE),
    title: { absolute: `${item.name} — ${kindName} · Larkwave` },
    description,
    alternates: {
      canonical,
      languages: {
        vi: `/store/${seg}/${slug}`,
        en: `/store/${seg}/${slug}?lang=en`,
        "x-default": `/store/${seg}/${slug}`,
      },
    },
    openGraph: {
      type: "website",
      url: `${SITE}${canonical}`,
      siteName: "Larkwave",
      title: item.name,
      description,
      locale: vi ? "vi_VN" : "en_US",
      images: item.thumbnailUrl ? [{ url: item.thumbnailUrl, alt: item.name }] : undefined,
    },
  };
}

export default async function StoreItemPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  const { kind: seg, slug } = await params;
  const sp = await searchParams;
  const lang = await resolveLang(sp.lang);
  const T = UI[lang];
  const item = await load(seg, slug);
  if (!item) notFound();

  const kindName = KIND_UI[item.kind][lang].name;
  const langSfx = lang === "en" ? "?lang=en" : "";
  const chips: string[] = [];
  if (item.detail.version) chips.push(`${T.version} ${item.detail.version}`);
  if (item.detail.fileType) chips.push(`${T.format} ${item.detail.fileType}`);
  for (const l of item.detail.languages ?? []) chips.push(l);

  const ld = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: item.name,
    description: item.descriptionShort ?? item.description ?? undefined,
    image: item.thumbnailUrl ?? undefined,
    category: item.category ?? kindName,
    url: `${SITE}/store/${seg}/${slug}`,
    offers: {
      "@type": "Offer",
      price: String(item.priceVnd),
      priceCurrency: "VND",
      url: `${SITE}/store/${seg}/${slug}`,
      availability:
        item.inStock === false ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
      seller: { "@type": "Organization", name: "Larkwave" },
    },
  };

  return (
    <main style={{ background: "var(--tw-layer, #0B0914)", color: "var(--tw-text, #F2F2F7)", minHeight: "100vh" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(ld) }} />
      <StoreStyles />
      <CursorGlow />
      <LandingHeader lang={lang} />

      <section className="tw-st-wrap" style={{ paddingTop: "clamp(24px,4vw,44px)" }}>
        <nav
          aria-label="Breadcrumb"
          style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 13.5, color: "var(--tw-text-faint, #7C849A)", marginBottom: 20 }}
        >
          <Link href={`/store${langSfx}`} style={{ color: "#C4B4FF" }}>
            {T.store}
          </Link>
          {/* Không còn nấc "loại hàng" ở giữa: mặt tiền chỉ bán mã nguồn nên `/store` VÀ
              `/store/sourcecode` là cùng một trang, và đường thứ hai đã 301 về đường thứ nhất.
              Một breadcrumb trỏ vào chuyển hướng là một cái bẫy tự đặt cho chính mình. */}
          <span aria-hidden="true">/</span>
          <span>{item.name}</span>
        </nav>

        <div className="tw-st-detail">
          <div>
            {item.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="tw-st-hero-img" src={item.thumbnailUrl} alt={item.name} />
            ) : (
              <div className="tw-st-hero-img" style={{ display: "grid", placeItems: "center", fontSize: 54 }} aria-hidden="true">
                {KIND_UI[item.kind].icon}
              </div>
            )}
            {item.gallery.length > 0 && (
              <div className="tw-st-gallery">
                {item.gallery.slice(0, 8).map((src) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={src} src={src} alt="" loading="lazy" decoding="async" />
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {item.category && <span className="tw-st-cat">{item.category}</span>}
            <h1 style={{ margin: 0, fontSize: "clamp(24px,3.6vw,34px)", fontWeight: 800, lineHeight: 1.25 }}>{item.name}</h1>

            {item.descriptionShort && (
              <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: "var(--tw-text-sub, #C6CBD8)" }}>
                {item.descriptionShort}
              </p>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <span style={{ fontSize: 30, fontWeight: 800 }}>{formatVnd(item.priceVnd, lang)}</span>
              {item.inStock !== null && (
                <span className={`tw-st-badge ${item.inStock ? "ok" : "out"}`}>
                  {item.inStock ? T.inStock : T.outStock}
                </span>
              )}
              {item.totalSold > 0 && (
                <span className="tw-st-sold">
                  {item.totalSold} {T.sold}
                </span>
              )}
            </div>

            {chips.length > 0 && (
              <div className="tw-st-chips">
                {chips.map((c) => (
                  <span key={c} className="tw-st-chip">
                    {c}
                  </span>
                ))}
              </div>
            )}

            {item.buyUrl && (
              <a className="tw-st-buy" href={item.buyUrl} rel="noopener" style={{ alignSelf: "flex-start" }}>
                {T.buy} →
              </a>
            )}

            <div className="tw-st-note">
              <span aria-hidden="true">🛒</span>
              <span>
                <strong style={{ color: "var(--tw-text, #fff)" }}>{T.noteTitle}.</strong> {T.note}
              </span>
            </div>
          </div>
        </div>

        {item.description && (
          <div style={{ marginTop: 44, maxWidth: 780 }}>
            <h2 style={{ fontSize: 21, fontWeight: 800, margin: "0 0 12px" }}>{T.about}</h2>
            <div className="tw-st-prose">
              <MarkdownLite text={item.description} />
            </div>
          </div>
        )}

        {item.detail.prerequisites && (
          <div style={{ marginTop: 32, maxWidth: 780 }}>
            <h2 style={{ fontSize: 21, fontWeight: 800, margin: "0 0 12px" }}>{T.needs}</h2>
            <div className="tw-st-prose">
              <MarkdownLite text={item.detail.prerequisites} />
            </div>
          </div>
        )}

        {item.detail.specDocument && (
          <div style={{ marginTop: 32, maxWidth: 780 }}>
            <h2 style={{ fontSize: 21, fontWeight: 800, margin: "0 0 12px" }}>{T.spec}</h2>
            <div className="tw-st-prose">
              <MarkdownLite text={item.detail.specDocument} />
            </div>
          </div>
        )}
      </section>

      <LandingFooter lang={lang} />
    </main>
  );
}
