import type { Metadata } from "next";
import Link from "next/link";
import type { Paginated, StoreFacet, StoreListing, StoreSort } from "@larkwave/shared";
import { STORE_SORTS } from "@larkwave/shared";
import { jsonLdScript } from "@/lib/jsonLd";
import { resolveLang, type Lang } from "@/lib/serverLocale";
import { LandingHeader, LandingFooter } from "@/components/LandingChrome";
import { CursorGlow, HeroShader } from "@/components/fx";
import { StoreStyles } from "@/components/store/StoreStyles";
import StoreCard from "@/components/store/StoreCard";
import { getStore } from "@/components/store/storeApi";
import {
  GRADIENT,
  KIND_MAT_TIEN,
  KIND_UI,
  PAGE_SIZE,
  SITE,
  SORT_MAC_DINH,
  SORT_UI,
  pageWindow,
  storeHref,
} from "@/components/store/storeShared";

type SP = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] ?? "" : v ?? "").trim();

/**
 * Chữ của trang, theo ngôn ngữ. Để ngay đây chứ không nhét vào bộ i18n chung: trang này kết xuất
 * ở MÁY CHỦ nên không gọi được `useI18n` (một hook của client) — cùng lý do với /blog.
 */
const UI: Record<Lang, Record<string, string>> = {
  vi: {
    h1a: "Mã nguồn",
    h1b: "sẵn sàng chạy",
    all: "Tất cả",
    tech: "Công nghệ",
    cat: "Chuyên mục",
    sort: "Sắp xếp",
    search: "Tìm theo tên hoặc công nghệ…",
    searchBtn: "Tìm",
    found: "dự án",
    clear: "Bỏ lọc ×",
    none: "Không có dự án nào khớp",
    noneSub: "Thử bỏ bớt một bộ lọc, hoặc tìm bằng tên công nghệ (React, Go, Prisma…).",
    empty: "Cửa hàng đang được dọn hàng",
    emptySub: "Danh mục sẽ hiện ở đây ngay khi kết nối xong. Trong lúc chờ, bạn có thể tự dựng app bằng AI.",
    build: "Dựng app bằng AI →",
    pager: "Phân trang",
    prev: "Trang trước",
    next: "Trang sau",
    noteTitle: "Đặt mua",
    note: "Đơn hàng hiện vẫn xử lý ở trang cũ; bấm “Mua” sẽ mở đúng trang sản phẩm ở đó. Chúng tôi đang chuyển việc đặt mua về đây.",
  },
  en: {
    h1a: "Source code",
    h1b: "ready to run",
    all: "All",
    tech: "Stack",
    cat: "Category",
    sort: "Sort",
    search: "Search by name or stack…",
    searchBtn: "Search",
    found: "projects",
    clear: "Clear filters ×",
    none: "No project matches",
    noneSub: "Drop one of the filters, or search by a technology name (React, Go, Prisma…).",
    empty: "The store is being stocked",
    emptySub: "The catalogue appears here as soon as the connection is live. Meanwhile, you can build an app with AI.",
    build: "Build an app with AI →",
    pager: "Pagination",
    prev: "Previous page",
    next: "Next page",
    noteTitle: "Checkout",
    note: "Orders are still processed on the old site; “Buy” opens that product page there. We are moving checkout over here.",
  },
};

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const sp = await searchParams;
  const lang = await resolveLang(sp.lang);
  const vi = lang === "vi";
  const page = Math.max(1, parseInt(first(sp.page) || "1", 10) || 1);
  const language = first(sp.language) || null;
  const text = KIND_UI[KIND_MAT_TIEN][lang];

  // Lát cắt theo CÔNG NGHỆ được đưa vào tiêu đề: "Mã nguồn Next.js" là thứ người ta thật sự gõ
  // vào ô tìm kiếm, còn "Cửa hàng" thì không ai gõ.
  const focus = language ? ` ${language}` : "";
  const pageSfx = page > 1 ? (vi ? ` (trang ${page})` : ` (page ${page})`) : "";
  const title = vi
    ? `Mã nguồn${focus}${pageSfx} — mua dự án hoàn chỉnh · Larkwave`
    : `${focus ? `${language} source code` : "Source code"}${pageSfx} — complete projects · Larkwave`;

  // Trang lọc/phân trang là cùng một danh mục xếp lại — canonical trỏ về /store để chúng không
  // tự cạnh tranh nhau. NGOẠI TRỪ lát cắt theo công nghệ: đó là nội dung khác thật (tập sản phẩm
  // khác, tiêu đề khác) và đáng được lập chỉ mục riêng.
  const canonicalPath = language ? `/store?language=${encodeURIComponent(language)}` : "/store";
  const canonical = vi ? canonicalPath : `${canonicalPath}${language ? "&" : "?"}lang=en`;
  const viHref = canonicalPath;
  const enHref = `${canonicalPath}${language ? "&" : "?"}lang=en`;

  return {
    metadataBase: new URL(SITE),
    title: { absolute: title },
    description: text.meta,
    alternates: {
      canonical,
      languages: { vi: viHref, en: enHref, "x-default": viHref },
    },
    openGraph: {
      type: "website",
      url: `${SITE}${canonical}`,
      siteName: "Larkwave",
      title,
      description: text.meta,
      locale: vi ? "vi_VN" : "en_US",
    },
  };
}

export default async function StorePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const lang = await resolveLang(sp.lang);
  const T = UI[lang];
  const kind = KIND_MAT_TIEN;
  const text = KIND_UI[kind][lang];

  const page = Math.max(1, parseInt(first(sp.page) || "1", 10) || 1);
  const category = first(sp.category) || null;
  const language = first(sp.language) || null;
  const search = first(sp.search) || null;
  const rawSort = first(sp.sort) as StoreSort;
  const sort: StoreSort = STORE_SORTS.includes(rawSort) ? rawSort : SORT_MAC_DINH;
  const filtered = !!(category || language || search);

  const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), sort });
  if (category) qs.set("category", category);
  if (language) qs.set("language", language);
  if (search) qs.set("search", search);

  const [data, cats, techs, unfiltered] = await Promise.all([
    getStore<Paginated<StoreListing>>(`/${kind}?${qs.toString()}`, {
      items: [],
      total: 0,
      page,
      pageSize: PAGE_SIZE,
    }),
    getStore<StoreFacet[]>(`/categories?kind=${kind}`, []),
    getStore<StoreFacet[]>(`/languages?kind=${kind}`, []),
    // Số của thẻ "Tất cả" phải là số dự án CỦA CẢ DANH MỤC, không phải số kết quả đang lọc — các
    // chip bên cạnh luôn đếm trên toàn danh mục, nên để nó đếm theo bộ lọc thì ra cảnh
    // "Tất cả 4" đứng cạnh "React 51". Lấy thêm một lượt, và chỉ khi đang lọc.
    filtered
      ? getStore<Paginated<StoreListing>>(`/${kind}?page=1&pageSize=1`, {
          items: [],
          total: 0,
          page: 1,
          pageSize: 1,
        })
      : Promise.resolve(null),
  ]);

  const items = data.items ?? [];
  const total = data.total ?? items.length;
  const totalAll = unfiltered?.total ?? total;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const here = (q: Parameters<typeof storeHref>[0]) => storeHref({ category, language, search, sort, lang, ...q });

  const ld = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: text.name,
    url: `${SITE}/store`,
    numberOfItems: total,
    itemListElement: items.slice(0, 20).map((it, i) => ({
      "@type": "ListItem",
      position: (page - 1) * PAGE_SIZE + i + 1,
      name: it.name,
      url: `${SITE}/store/sourcecode/${it.slug}`,
    })),
  };

  return (
    <main style={{ background: "var(--tw-layer, #0B0914)", color: "var(--tw-text, #F2F2F7)", minHeight: "100vh" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(ld) }} />
      <StoreStyles />
      <CursorGlow />
      <LandingHeader lang={lang} />

      <section style={{ position: "relative", textAlign: "center", padding: "clamp(36px,6vw,64px) clamp(16px,5vw,56px) 20px", overflow: "hidden" }}>
        <HeroShader />
        <div style={{ position: "relative" }}>
          <h1 style={{ fontSize: "clamp(28px,4.8vw,44px)", fontWeight: 800, margin: "0 0 12px", letterSpacing: -0.5 }}>
            {T.h1a}{" "}
            <span style={{ background: GRADIENT, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
              {T.h1b}
            </span>
          </h1>
          <p style={{ color: "var(--tw-text-sub, #A9B0C3)", fontSize: 17, maxWidth: 660, margin: "0 auto", lineHeight: 1.55 }}>
            {text.blurb}
          </p>
        </div>
      </section>

      <section className="tw-st-wrap">
        {totalAll === 0 ? (
          <div className="tw-st-empty">
            <p style={{ fontSize: 18, fontWeight: 700, color: "var(--tw-text, #fff)", margin: "0 0 8px" }}>{T.empty}</p>
            <p style={{ margin: "0 0 18px" }}>{T.emptySub}</p>
            <Link href={lang === "en" ? "/register?lang=en" : "/register"} style={{ color: "#C4B4FF", fontWeight: 600 }}>
              {T.build}
            </Link>
          </div>
        ) : (
          <>
            <div className="tw-st-note" style={{ marginBottom: 22 }}>
              <span aria-hidden="true">🛒</span>
              <span>
                <strong style={{ color: "var(--tw-text, #fff)" }}>{T.noteTitle}.</strong> {T.note}
              </span>
            </div>

            {/* Lọc theo CÔNG NGHỆ đứng trên cùng: đó là câu hỏi đầu tiên của người đi chọn mã
                nguồn ("có cái nào chạy stack của tôi không"), còn chuyên mục chỉ là phân loại thô. */}
            <div className="tw-st-filter">
              <span className="tw-st-filter-label">{T.tech}</span>
              <nav className="tw-st-tabs" aria-label={T.tech}>
                <Link href={here({ language: null, page: 1 })} className="tw-st-tab" aria-current={!language ? "true" : undefined}>
                  {T.all} <small>{totalAll}</small>
                </Link>
                {techs.map((t) => (
                  <Link
                    key={t.name}
                    href={here({ language: t.name, page: 1 })}
                    className="tw-st-tab"
                    aria-current={language === t.name ? "true" : undefined}
                  >
                    {t.name} <small>{t.count}</small>
                  </Link>
                ))}
              </nav>
            </div>

            {cats.length > 0 && (
              <div className="tw-st-filter">
                <span className="tw-st-filter-label">{T.cat}</span>
                <nav className="tw-st-tabs" aria-label={T.cat}>
                  <Link href={here({ category: null, page: 1 })} className="tw-st-tab" aria-current={!category ? "true" : undefined}>
                    {T.all}
                  </Link>
                  {cats.map((c) => (
                    <Link
                      key={c.name}
                      href={here({ category: c.name, page: 1 })}
                      className="tw-st-tab"
                      aria-current={category === c.name ? "true" : undefined}
                    >
                      {c.name} <small>{c.count}</small>
                    </Link>
                  ))}
                </nav>
              </div>
            )}

            <div className="tw-st-bar">
              <nav className="tw-st-tabs" aria-label={T.sort} style={{ flex: "1 1 320px" }}>
                <span className="tw-st-filter-label" style={{ alignSelf: "center" }}>
                  {T.sort}
                </span>
                {STORE_SORTS.map((s) => (
                  <Link
                    key={s}
                    href={here({ sort: s, page: 1 })}
                    className="tw-st-tab"
                    aria-current={sort === s ? "true" : undefined}
                  >
                    {SORT_UI[s][lang]}
                  </Link>
                ))}
              </nav>

              {/* Form GET thuần: tìm kiếm chạy được cả khi JavaScript chưa tải xong, và kết quả
                  có URL riêng để chia sẻ hoặc bấm Back. Các bộ lọc đang bật đi kèm dạng hidden
                  để bấm "Tìm" không âm thầm xoá chúng. */}
              <form className="tw-st-search" action="/store" method="get">
                {lang === "en" && <input type="hidden" name="lang" value="en" />}
                {category && <input type="hidden" name="category" value={category} />}
                {language && <input type="hidden" name="language" value={language} />}
                {sort !== SORT_MAC_DINH && <input type="hidden" name="sort" value={sort} />}
                <input type="search" name="search" defaultValue={search ?? ""} placeholder={T.search} aria-label={T.search} />
                <button type="submit">{T.searchBtn}</button>
              </form>
            </div>

            {filtered && (
              <p style={{ margin: "0 0 16px", fontSize: 14, color: "var(--tw-text-sub, #A9B0C3)" }}>
                {total} {T.found}
                {language ? ` · ${language}` : ""}
                {category ? ` · ${category}` : ""}
                {search ? ` · “${search}”` : ""}
                <Link href={storeHref({ sort, lang })} style={{ color: "#C4B4FF", fontWeight: 600, marginLeft: 10 }}>
                  {T.clear}
                </Link>
              </p>
            )}

            {items.length === 0 ? (
              <div className="tw-st-empty">
                <p style={{ fontSize: 17, fontWeight: 700, color: "var(--tw-text, #fff)", margin: "0 0 6px" }}>{T.none}</p>
                <p style={{ margin: 0 }}>{T.noneSub}</p>
              </div>
            ) : (
              <div className="tw-st-grid">
                {items.map((item) => (
                  <StoreCard key={item.slug} item={item} lang={lang} />
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <nav className="tw-st-pager" aria-label={T.pager}>
                <Link
                  href={here({ page: page - 1 })}
                  className="tw-st-page"
                  aria-disabled={page <= 1 ? "true" : undefined}
                  aria-label={T.prev}
                >
                  ←
                </Link>
                {pageWindow(page, totalPages).map((n, i) =>
                  n === "…" ? (
                    <span key={`e${i}`} className="tw-st-ellipsis">
                      …
                    </span>
                  ) : (
                    <Link key={n} href={here({ page: n })} className="tw-st-page" aria-current={n === page ? "page" : undefined}>
                      {n}
                    </Link>
                  ),
                )}
                <Link
                  href={here({ page: page + 1 })}
                  className="tw-st-page"
                  aria-disabled={page >= totalPages ? "true" : undefined}
                  aria-label={T.next}
                >
                  →
                </Link>
              </nav>
            )}
          </>
        )}
      </section>

      <LandingFooter lang={lang} />
    </main>
  );
}
