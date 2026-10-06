import type { Metadata } from "next";
import Link from "next/link";
import { categoryLabel, tagLabel, type BlogPostListItem, type Paginated } from "@larkwave/shared";
import { API_BASE } from "@/lib/api";
import { chuDau } from "@/lib/chuDau";
import { resolveLang, type Lang } from "@/lib/serverLocale";
import { jsonLdScript } from "@/lib/jsonLd";
import { LandingHeader, LandingFooter } from "@/components/LandingChrome";
import { CursorGlow, HeroShader, TiltCard } from "@/components/fx";
import { BlogStyles } from "@/components/blog/BlogStyles";
import { GRADIENT, PAGE_SIZE, SITE, blogHref, fmtDate, postHref, sameName } from "@/components/blog/blogShared";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

interface NameCount {
  name: string;
  count: number;
}

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] ?? "" : v ?? "").trim();

/**
 * Chữ của trang này, theo ngôn ngữ.
 *
 * Để ngay đây chứ không nhét vào bộ i18n chung: trang này kết xuất ở MÁY CHỦ nên không gọi được
 * useI18n (một hook của client). Chỉ vài nhãn, và chúng chỉ dùng ở đúng trang này.
 */
const UI: Record<Lang, Record<string, string>> = {
  vi: {
    heroSub: "Hướng dẫn, mẹo và câu chuyện về cách biến ý tưởng thành web app full-stack bằng AI.",
    all: "Tất cả",
    categories: "Chuyên mục",
    tags: "Thẻ",
    clear: "Bỏ lọc ×",
    posts: "bài",
    inCat: "trong chuyên mục",
    withTag: "với thẻ",
    views: "lượt xem",
    more: "Đọc tiếp →",
    noneTitle: "Không có bài nào khớp bộ lọc",
    noneSub: "Thử chuyên mục khác, hoặc bỏ lọc để xem tất cả.",
    emptyTitle: "Chưa có bài viết nào",
    emptySub: "Nội dung hướng dẫn & mẹo đang được biên tập. Quay lại sớm nhé!",
    emptyCta: "Tạo app miễn phí →",
    seeAll: "Xem tất cả bài viết",
    pager: "Phân trang",
    prev: "Trang trước",
    next: "Trang sau",
  },
  en: {
    heroSub: "Guides, tips and stories on turning an idea into a full-stack web app with AI.",
    all: "All",
    categories: "Categories",
    tags: "Tags",
    clear: "Clear filter ×",
    posts: "posts",
    inCat: "in",
    withTag: "tagged",
    views: "views",
    more: "Read more →",
    noneTitle: "No posts match this filter",
    noneSub: "Try another category, or clear the filter to see everything.",
    emptyTitle: "No posts yet",
    emptySub: "Guides and tips are being written. Check back soon.",
    emptyCta: "Create an app for free →",
    seeAll: "See all posts",
    pager: "Pagination",
    prev: "Previous page",
    next: "Next page",
  },
};

/** Đọc bộ lọc từ URL — nguồn sự thật duy nhất, xem chú thích `blogHref`. */
async function readFilters(sp: SearchParams) {
  const q = await sp;
  const page = Math.max(1, parseInt(first(q.page) || "1", 10) || 1);
  return { category: first(q.category) || null, tag: first(q.tag) || null, page };
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const { category, tag, page } = await readFilters(searchParams);
  const sp = await searchParams;
  const lang = await resolveLang(sp.lang);
  const vi = lang === "vi";
  const focus = category ? ` — ${categoryLabel(category, lang)}` : tag ? ` — #${tagLabel(tag, lang)}` : "";
  const pageSfx = page > 1 ? (vi ? ` (trang ${page})` : ` (page ${page})`) : "";
  // Tiêu đề và mô tả PHẢI theo ngôn ngữ đang phục vụ: thân trang đã song ngữ từ trước (xem UI ở
  // đầu tệp), nhưng hai dòng này thì không — nên site tiếng Anh vẫn hiện tiêu đề tiếng Việt trên
  // tab và trên trang kết quả tìm kiếm.
  const title = vi
    ? `Blog Larkwave${focus}${pageSfx} — Hướng dẫn tạo app bằng AI`
    : `Larkwave blog${focus}${pageSfx} — guides to building apps with AI`;
  const description = vi
    ? "Hướng dẫn, mẹo và câu chuyện về cách tạo web app full-stack bằng AI với Larkwave: từ ý tưởng đến deploy, prompt hiệu quả, cơ sở dữ liệu, tên miền và hơn thế."
    : "Guides, tips and stories on building full-stack web apps with AI on Larkwave: idea to deploy, prompts that work, databases, custom domains and more.";
  const canonical = vi ? "/blog" : "/blog?lang=en";
  return {
    metadataBase: new URL(SITE),
    // `absolute` + câu ngắn hơn. Bản cũ đã dài 64 ký tự trước khi khuôn "%s · Larkwave" ở layout
    // gốc nối thêm 12 nữa — đo trên trang thật là 76, vượt xa chỗ Google cắt. Phần bị cắt lại đúng
    // là đuôi "mẹo & câu chuyện", nên vừa mất chữ vừa không được gì.
    title: { absolute: title },
    description,
    keywords: vi
      ? ["blog Larkwave", "hướng dẫn tạo app bằng AI", "AI app builder", "prompt to app", "no-code"]
      : ["Larkwave blog", "build apps with AI", "AI app builder", "prompt to app", "no-code"],
    // Trang lọc/phân trang là cùng một nội dung xếp lại — canonical trỏ về /blog để không tự cạnh tranh.
    alternates: {
      canonical,
      languages: { vi: "/blog", en: "/blog?lang=en", "x-default": "/blog" },
    },
    openGraph: {
      type: "website",
      url: `${SITE}${canonical}`,
      siteName: "Larkwave",
      title: vi ? `Blog Larkwave${focus}` : `Larkwave blog${focus}`,
      description: vi
        ? "Hướng dẫn, mẹo và câu chuyện về cách tạo app bằng AI với Larkwave."
        : "Guides, tips and stories on building apps with AI on Larkwave.",
      locale: vi ? "vi_VN" : "en_US",
    },
  };
}

async function getJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { next: { revalidate: 300 } });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

/**
 * Thẻ bài viết. Ảnh có `aspect-ratio` cố định + veil tối, tiêu đề luôn ở DƯỚI ảnh — lý do ở đầu
 * BlogStyles. TiltCard (client) bọc ngoài; Link lấp đầy bên trong nên cả thẻ vẫn là MỘT liên kết.
 */
/** Góc xoay màu suy ra từ slug: cùng bài luôn ra cùng màu, khác bài thì khác nhau rõ. */
function sacTheoSlug(slug: string): number {
  let n = 0;
  for (let i = 0; i < slug.length; i += 1) n = (n * 31 + slug.charCodeAt(i)) % 360;
  return n;
}

function PostCard({ p, hero, t, lang }: { p: BlogPostListItem; hero?: boolean; t: Record<string, string>; lang: Lang }) {
  return (
    <TiltCard maxTilt={hero ? 6 : 14} scale={hero ? 1.01 : 1.03} className="tw-pub-card tw-bl-card">
      <Link href={postHref(p.slug, lang)} className={`tw-bl-card-link${hero ? " is-hero" : ""}`}>
        <div className="tw-bl-cover">
          {p.coverImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.coverImage} alt="" loading={hero ? "eager" : "lazy"} decoding="async" />
          ) : (
            // Bài chưa có ảnh bìa. Trước đây mọi khối thay thế dùng CHUNG một gradient, nên sáu bài
            // liền nhau ra sáu ô giống hệt — nhìn như ảnh bị thiếu chứ không như một lựa chọn thiết
            // kế. Nay mỗi bài lệch màu theo slug (cùng slug luôn ra cùng màu, không nhấp nháy giữa
            // các lần dựng) và có một chữ cái làm điểm nhìn.
            <div
              className="tw-bl-cover-fallback"
              aria-hidden="true"
              style={{ "--tw-bl-hue": sacTheoSlug(p.slug) + "deg" } as React.CSSProperties}
            >
              <span>{chuDau(p.category || p.title)}</span>
            </div>
          )}
          <i className="tw-bl-cover-veil" aria-hidden="true" />
        </div>
        <div className="tw-bl-body">
          <div className="tw-bl-meta">
            {p.category && <span className="tw-bl-cat">{categoryLabel(p.category, lang)}</span>}
            {p.category && p.publishedAt && <span aria-hidden="true">·</span>}
            {p.publishedAt && <time dateTime={p.publishedAt}>{fmtDate(p.publishedAt)}</time>}
          </div>
          {/* h2, KHÔNG phải h3: trang này đi h1 → h3, nhảy mất một cấp. Người dùng trình đọc
              màn hình điều hướng THEO CẤP, nhảy cấp là gãy dàn ý trang. Tiêu đề bài là mục nội
              dung chính dưới h1 của trang, nên h2 mới đúng. Lớp CSS đặt sẵn cỡ chữ và margin:0
              nên đổi thẻ không xê dịch gì. */}
          <h2 className="tw-bl-title">{p.title}</h2>
          {p.excerpt && <p className="tw-bl-excerpt">{p.excerpt}</p>}
          <div className="tw-bl-foot">
            <span>
              {p.authorName ?? "Larkwave"}
              {p.views > 0 ? ` · ${p.views} ${t.views}` : ""}
            </span>
            <span className="tw-bl-more">{t.more}</span>
          </div>
        </div>
      </Link>
    </TiltCard>
  );
}

/** Dãy số trang gọn: 1 … 4 5 [6] 7 8 … 20 — đủ để nhảy xa mà không tràn dòng trên điện thoại. */
function pageWindow(cur: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set<number>([1, total, cur - 1, cur, cur + 1]);
  const nums = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  for (let i = 0; i < nums.length; i += 1) {
    if (i > 0 && nums[i] - nums[i - 1] > 1) out.push("…");
    out.push(nums[i]);
  }
  return out;
}

export default async function BlogIndexPage({ searchParams }: { searchParams: SearchParams }) {
  const { category, tag, page } = await readFilters(searchParams);
  const sp = await searchParams;
  const lang = await resolveLang(sp.lang);
  const T = UI[lang];
  const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), locale: lang });
  if (category) qs.set("category", category);
  if (tag) qs.set("tag", tag);

  const [data, categories, tags] = await Promise.all([
    getJson<Paginated<BlogPostListItem>>(`/blog?${qs.toString()}`, { items: [], total: 0, page, pageSize: PAGE_SIZE }),
    getJson<NameCount[]>("/blog/categories", []),
    getJson<NameCount[]>("/blog/tags", []),
  ]);
  const posts = data.items ?? [];
  const total = data.total ?? posts.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = !!(category || tag);
  // Thẻ nổi bật chỉ ở trang đầu KHÔNG lọc: đang lọc theo thẻ mà bài đầu phình to thì trông như kết quả "đặc biệt" — không phải.
  const showHero = !filtered && page === 1 && posts.length > 0;
  const hero: BlogPostListItem | undefined = showHero ? posts[0] : undefined;
  const rest: BlogPostListItem[] = showHero ? posts.slice(1) : posts;

  const listLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Blog Larkwave",
    url: `${SITE}/blog`,
    blogPost: posts.slice(0, 10).map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      url: `${SITE}/blog/${p.slug}`,
      datePublished: p.publishedAt ?? undefined,
      author: p.authorName ? { "@type": "Person", name: p.authorName } : undefined,
    })),
  };

  // Hoà hai máy: giữ nền TỐI + BlogStyles của bản thiết kế lại, nhưng lấy `jsonLdScript` của máy
  // kia thay cho JSON.stringify trần — nó thoát ký tự "<", chặn được chèn script qua khối JSON-LD.
  // An toàn hơn thì lấy, không tranh.
  return (
    <main style={{ background: "var(--tw-layer, #0B0914)", color: "var(--tw-text, #F2F2F7)", minHeight: "100vh" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(listLd) }} />
      <BlogStyles />
      {/* Đèn rọi bám chuột (client island, fixed, không chắn click; tự tắt trên cảm ứng). */}
      <CursorGlow />
      <LandingHeader lang={lang} />

      {/* Hero: nền WebGL (sàn lưới có sương mù) phía sau tiêu đề — cùng thế giới với /welcome. */}
      <section style={{ position: "relative", textAlign: "center", padding: "clamp(40px,7vw,72px) clamp(16px,5vw,56px) 24px", overflow: "hidden" }}>
        <HeroShader />
        <div style={{ position: "relative" }}>
          <h1 style={{ fontSize: "clamp(30px,5vw,46px)", fontWeight: 800, margin: "0 0 12px", letterSpacing: -0.5 }}>
            Blog{" "}
            <span style={{ background: GRADIENT, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
              Larkwave
            </span>
          </h1>
          <p style={{ color: "var(--tw-text-sub, #A9B0C3)", fontSize: 17, maxWidth: 640, margin: "0 auto", lineHeight: 1.55 }}>
            {T.heroSub}
          </p>
        </div>
      </section>

      <section className="tw-bl-wrap">
        {/* Tab chuyên mục: là LINK (server render) chứ không phải nút đổi state — URL đổi, Back hoạt động, chia sẻ được. */}
        {categories.length > 0 && (
          <nav className="tw-bl-tabs" aria-label={T.categories}>
            <Link href={blogHref({ tag, lang })} className="tw-bl-tab" aria-current={!category ? "true" : undefined}>
              {T.all}
            </Link>
            {categories.map((c) => (
              <Link
                key={c.name}
                href={blogHref({ category: c.name, tag, lang })}
                className="tw-bl-tab"
                aria-current={sameName(category, c.name) ? "true" : undefined}
              >
                {categoryLabel(c.name, lang)}
                <small>{c.count}</small>
              </Link>
            ))}
          </nav>
        )}

        {/* Dải thẻ: bấm thẻ đang chọn thì bỏ chọn. Tối đa 24 để dải không thành một bức tường. */}
        {tags.length > 0 && (
          <div className="tw-bl-tags" style={{ marginTop: 14 }} aria-label={T.tags}>
            {tags.slice(0, 24).map((t) => {
              const on = sameName(tag, t.name);
              return (
                <Link
                  key={t.name}
                  href={blogHref({ category, tag: on ? null : t.name, lang })}
                  className="tw-bl-chip"
                  aria-current={on ? "true" : undefined}
                >
                  #{tagLabel(t.name, lang)}
                  <small>{t.count}</small>
                </Link>
              );
            })}
          </div>
        )}

        {filtered && (
          <div className="tw-bl-filterbar">
            <span>
              {total} {T.posts}
              {category ? ` ${T.inCat} "${categoryLabel(category, lang)}"` : ""}
              {tag ? ` ${T.withTag} #${tagLabel(tag, lang)}` : ""}
            </span>
            <Link href={blogHref({ lang })}>{T.clear}</Link>
          </div>
        )}
        {!filtered && <div style={{ height: 26 }} />}

        {posts.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "60px 20px",
              border: "1px dashed var(--tw-pub-card-border, rgba(255,255,255,.12))",
              borderRadius: 16,
              color: "var(--tw-text-sub, #A9B0C3)",
            }}
          >
            {filtered ? (
              <>
                <p style={{ fontSize: 17, fontWeight: 600, margin: "0 0 6px", color: "var(--tw-text, #F2F2F7)" }}>
                  {T.noneTitle}
                </p>
                <p style={{ margin: "0 0 18px" }}>{T.noneSub}</p>
                <Link href={blogHref({ lang })} className="tw-bl-btn">
                  {T.seeAll}
                </Link>
              </>
            ) : (
              <>
                <p style={{ fontSize: 17, fontWeight: 600, margin: "0 0 6px", color: "var(--tw-text, #F2F2F7)" }}>
                  {T.emptyTitle}
                </p>
                <p style={{ margin: "0 0 18px" }}>{T.emptySub}</p>
                {/* Giữ ngôn ngữ khi rời trang: bản cũ trỏ thẳng /register nên người đang đọc bản
                    tiếng Anh bấm vào là rơi sang trang đăng ký tiếng Việt. */}
                <Link href={lang === "vi" ? "/register" : "/register?lang=en"} className="tw-bl-btn">
                  {T.emptyCta}
                </Link>
              </>
            )}
          </div>
        ) : (
          <>
            {hero && (
              <div style={{ marginBottom: 24 }}>
                <PostCard p={hero} hero t={T} lang={lang} />
              </div>
            )}
            <div className="tw-bl-grid">
              {rest.map((p) => (
                <PostCard key={p.id} p={p} t={T} lang={lang} />
              ))}
            </div>
          </>
        )}

        {totalPages > 1 && (
          <nav className="tw-bl-pager" aria-label={T.pager}>
            <Link
              href={blogHref({ category, tag, page: page - 1, lang })}
              className="tw-bl-page"
              aria-disabled={page <= 1 ? "true" : undefined}
              aria-label={T.prev}
            >
              ←
            </Link>
            {pageWindow(page, totalPages).map((n, i) =>
              n === "…" ? (
                <span key={`e${i}`} className="tw-bl-ellipsis">…</span>
              ) : (
                <Link
                  key={n}
                  href={blogHref({ category, tag, page: n, lang })}
                  className="tw-bl-page"
                  aria-current={n === page ? "page" : undefined}
                >
                  {n}
                </Link>
              ),
            )}
            <Link
              href={blogHref({ category, tag, page: page + 1, lang })}
              className="tw-bl-page"
              aria-disabled={page >= totalPages ? "true" : undefined}
              aria-label={T.next}
            >
              →
            </Link>
          </nav>
        )}
      </section>

      <LandingFooter lang={lang} />
    </main>
  );
}
