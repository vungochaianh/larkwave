import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { categoryLabel, tagLabel, type BlogPost, type BlogPostListItem } from "@larkwave/shared";
import { API_BASE } from "@/lib/api";
import { resolveLang, type Lang } from "@/lib/serverLocale";
import { jsonLdScript } from "@/lib/jsonLd";
import { LandingHeader, LandingFooter } from "@/components/LandingChrome";
import BlogMarkdown from "@/components/BlogMarkdown";
import { CursorGlow } from "@/components/fx";
import { BlogStyles } from "@/components/blog/BlogStyles";
import ShareBar from "@/components/blog/ShareBar";
import TableOfContents from "@/components/blog/TableOfContents";
import BlogComments from "@/components/blog/BlogComments";
import { BRAND, GRADIENT, SITE, blogHref, extractToc, fmtDate, postHref, readingMinutes } from "@/components/blog/blogShared";

const BODY_ID = "tw-blog-body";

/**
 * Chữ của trang bài viết, theo ngôn ngữ — cùng lý do với bảng UI ở /blog: trang kết xuất ở MÁY CHỦ
 * nên không gọi được `useI18n`.
 *
 * Vì sao thêm hôm 23/09/2026: thân bài đã dịch sẵn (bản `en` trong `post.i18n`), nhưng mọi nhãn
 * quanh nó — "phút đọc", "Thẻ", "Chia sẻ bài viết", lời mời cuối bài — vẫn là tiếng Việt cứng.
 * Người đọc tiếng Anh gặp một bài tiếng Anh nằm trong một cái khung tiếng Việt.
 */
const UI: Record<Lang, Record<string, string>> = {
  vi: {
    minutes: "phút đọc",
    views: "lượt xem",
    tags: "Thẻ",
    share: "Chia sẻ bài viết",
    ctaTitle: "Sẵn sàng tạo app của bạn?",
    ctaSub: "Mô tả ý tưởng — Larkwave lo phần còn lại.",
    ctaBtn: "Bắt đầu miễn phí →",
    related: "Bài liên quan",
  },
  en: {
    minutes: "min read",
    views: "views",
    tags: "Tags",
    share: "Share this post",
    ctaTitle: "Ready to build your app?",
    ctaSub: "Describe the idea — Larkwave handles the rest.",
    ctaBtn: "Start for free →",
    related: "Related posts",
  },
};

/** API công khai của hệ thống kia, sau khi hai hệ hoán đổi tên miền ngày 22/09/2026. */
const API_HE_KIA = "https://apia.toolswave.net";
const WEB_HE_KIA = "https://app.toolswave.net";

/**
 * Bài này có nằm ở hệ thống kia không?
 *
 * HỎI THẲNG API của họ thay vì đá người dùng sang đó rồi phó mặc. Trước hoán đổi,
 * `toolswave.net/blog/<slug>` là blog của hệ kia và đã được lập chỉ mục ở đó, nên một slug lạ ở
 * đây RẤT có thể là bài cũ của họ — nhưng cũng có thể chỉ là URL gõ sai.
 *
 * Hỏi trước rồi mới quyết cho ra hai kết quả đều đúng: có thì 308 (vĩnh viễn, dồn uy tín về địa
 * chỉ mới), không có thì 404 thật. Cách "đá sang rồi tính sau" thì người gõ sai địa chỉ bị ném
 * sang một site khác để nhận 404 ở đó — và hai site có luật đối xứng thì phải thêm cờ chống lặp.
 *
 * Chỉ chạy trên đường 404 (hiếm), và hỏng mạng thì trả false nên vẫn ra 404 bình thường.
 */
async function coOHeKia(slug: string): Promise<boolean> {
  try {
    const c = new AbortController();
    const hen = setTimeout(() => c.abort(), 4000);
    const r = await fetch(`${API_HE_KIA}/api/blog/${encodeURIComponent(slug)}`, {
      signal: c.signal,
      next: { revalidate: 3600 },
      headers: { accept: "application/json" },
    });
    clearTimeout(hen);
    return r.ok;
  } catch {
    return false;
  }
}

async function fetchPost(slug: string, lang: Lang = 'vi'): Promise<BlogPost | null> {
  try {
    const res = await fetch(`${API_BASE}/blog/${encodeURIComponent(slug)}?locale=${lang}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return (await res.json()) as BlogPost;
  } catch {
    return null;
  }
}

/**
 * Bài cùng chủ đề, để trang này không phải ngõ cụt.
 *
 * Trước khi có khối này, bài soi ra 80/100 với đúng một lỗi: "không có liên kết nội bộ nào". Một
 * bài không trỏ đi đâu thì người đọc thoát ở đó, và công cụ tìm kiếm không có đường lần sang phần
 * còn lại của site — bài mới đăng phải chờ sitemap thay vì được phát hiện qua liên kết.
 *
 * Ghép theo THẺ, bỏ thẻ đầu vì đó là kiểu bài (howto/listicle/news/story) — mọi bài howto giống
 * nhau ở chỗ đó, ghép theo nó thì ra một đống bài chẳng liên quan gì về nội dung.
 */
/**
 * Cắt thân bài làm hai ở tiêu đề cấp 2 THỨ HAI, để chèn khối "Đọc thêm" vào giữa.
 *
 * Trả `["", ""]` khi bài không đủ hai tiêu đề — người gọi hiểu là không chèn gì. Cắt ở tiêu đề
 * chứ không cắt theo số ký tự: cắt giữa đoạn văn thì khối chèn rơi vào giữa một mạch lập luận.
 *
 * Chỉ nhận tiêu đề nằm ĐẦU DÒNG (`^## `). Dấu `##` giữa dòng là chuỗi trong câu, không phải tiêu đề.
 */
function chiaThanBai(md: string): [string, string] {
  const vitri: number[] = [];
  const re = /^## /gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    vitri.push(m.index);
    if (vitri.length >= 2) break;
  }
  if (vitri.length < 2) return ["", ""];
  const cat = vitri[1];
  return [md.slice(0, cat).trimEnd(), md.slice(cat)];
}

/**
 * `lang` phải đi kèm mọi lượt gọi ở đây, không chỉ lượt lấy bài chính.
 *
 * Thiếu nó thì máy chủ trả bản gốc tiếng Việt: đo ngày 23/09/2026 trên một bài tiếng Anh — thân
 * bài tiếng Anh, còn "Đọc thêm" giữa bài và "Bài liên quan" cuối trang là bốn tiêu đề tiếng Việt,
 * dù cả bốn bài đó đều đã có bản dịch.
 */
async function fetchRelated(post: BlogPost, lang: Lang, limit = 4): Promise<BlogPostListItem[]> {
  const loc = `&locale=${lang}`;
  const tags = (Array.isArray(post.tags) ? post.tags : []).slice(1);
  const seen = new Map<string, BlogPostListItem>();
  for (const tag of tags) {
    if (seen.size >= limit) break;
    try {
      const res = await fetch(`${API_BASE}/blog?page=1&pageSize=8&tag=${encodeURIComponent(tag)}${loc}`, {
        next: { revalidate: 300 },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { items?: BlogPostListItem[] };
      for (const p of data.items ?? []) {
        if (p.slug !== post.slug && !seen.has(p.slug)) seen.set(p.slug, p);
      }
    } catch {
      /* một thẻ hỏng không được làm mất cả khối */
    }
  }
  // Không đủ bài cùng thẻ thì lấp bằng bài mới nhất: thà liên quan lỏng còn hơn ngõ cụt.
  if (seen.size < limit) {
    try {
      const res = await fetch(`${API_BASE}/blog?page=1&pageSize=${limit + 4}${loc}`, { next: { revalidate: 300 } });
      if (res.ok) {
        const data = (await res.json()) as { items?: BlogPostListItem[] };
        for (const p of data.items ?? []) {
          if (seen.size >= limit) break;
          if (p.slug !== post.slug && !seen.has(p.slug)) seen.set(p.slug, p);
        }
      }
    } catch {
      /* bỏ qua */
    }
  }
  return [...seen.values()].slice(0, limit);
}

// `fmtDate` bản cục bộ ở đây đã bỏ: nó trùng tên với bản trong `@/components/blog/blogShared`
// (import ở đầu file) — hệ quả của việc hai máy cùng sửa file này. Giữ bản DÙNG CHUNG để trang
// danh sách và trang bài viết hiển thị ngày giống nhau; hai bản riêng rồi trôi lệch là chuyện
// nhỏ mà khó chịu.

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const { slug } = await params;
  const sp = await searchParams;
  // ?lang= thắng cookie (link chia sẻ phải mở đúng thứ tiếng), cookie thắng mặc định.
  const lang = await resolveLang(sp.lang);
  const post = await fetchPost(slug, lang);
  // `absolute`: khuôn "%s · Larkwave" ở layout gốc nối thêm một lần nữa, đo trên trang thật ra
  // "Không tìm thấy bài viết · Larkwave · Larkwave".
  if (!post)
    return {
      title: {
        absolute: lang === "vi" ? "Không tìm thấy bài viết · Larkwave" : "Post not found · Larkwave",
      },
      robots: { index: false },
    };
  const title = post.seoTitle?.trim() || `${post.title} · Blog Larkwave`;
  // Câu dự phòng phải theo ngôn ngữ của trang: nó đi thẳng ra thẻ description, Open Graph và Twitter
  // (dùng lại chính biến này bên dưới), tức chính dòng hiện trên trang kết quả tìm kiếm. Bản cũ luôn
  // tiếng Việt nên một bài tiếng Anh chưa có seoDescription sẽ ra nửa Anh nửa Việt.
  const description =
    post.seoDescription?.trim() ||
    post.excerpt?.trim() ||
    `${post.title}${lang === "vi" ? " — bài viết trên blog Larkwave." : " — a post on the Larkwave blog."}`;
  const path = `/blog/${post.slug}`;
  const url = `${SITE}${path}${lang === "vi" ? "" : `?lang=${lang}`}`;

  /**
   * hreflang — KHAI THEO NHỮNG NGÔN NGỮ BÀI NÀY THẬT SỰ CÓ, không khai cứng cả hai.
   *
   * Khai một bản tiếng Anh cho bài chưa dịch là chỉ máy tìm kiếm tới một địa chỉ trả về nguyên
   * văn tiếng Việt. Nó đọc ra hai URL cùng nội dung mà tự xưng là hai thứ tiếng — vừa mất niềm
   * tin vừa có thể bị coi là nội dung trùng. `post.locales` do máy chủ tính, chỉ gồm ngôn ngữ có
   * đủ cả tiêu đề lẫn thân bài.
   */
  const languages: Record<string, string> = {};
  for (const l of post.locales ?? ["vi"]) {
    languages[l] = l === "vi" ? path : `${path}?lang=${l}`;
  }
  languages["x-default"] = path;
  return {
    metadataBase: new URL(SITE),
    // `absolute` để KHÔNG dính khuôn "%s · Larkwave" ở layout gốc.
    //
    // seoTitle đã được cắt sẵn ở ngưỡng 60 ký tự (packages/shared/src/blog-seo.ts). Khuôn kia nối
    // thêm 11 ký tự nữa, và bài thật đo được 70 ký tự trên trang đã đăng — vượt đúng chỗ Google
    // cắt. Không thấy được bằng cách soi dữ liệu, chỉ thấy khi mở trang render ra mà đếm.
    title: { absolute: title },
    description,
    keywords: post.tags,
    // canonical trỏ về CHÍNH bản đang xem (kèm ?lang), không phải luôn về bản tiếng Việt: trỏ hết
    // về một bản là tự nói bản dịch không đáng lập chỉ mục, và thế thì dịch ra để làm gì.
    alternates: { canonical: lang === "vi" ? path : `${path}?lang=${lang}`, languages },
    openGraph: {
      type: "article",
      url,
      siteName: "Larkwave",
      title,
      description,
      locale: lang === "vi" ? "vi_VN" : "en_US",
      publishedTime: post.publishedAt ?? undefined,
      ...(post.category ? { section: post.category } : {}),
      tags: post.tags,
      ...(post.coverImage ? { images: [{ url: post.coverImage }] } : {}),
    },
    twitter: {
      card: post.coverImage ? "summary_large_image" : "summary",
      title,
      description,
      ...(post.coverImage ? { images: [post.coverImage] } : {}),
    },
  };
}

export default async function BlogPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  // ?lang= thắng cookie (link chia sẻ phải mở đúng thứ tiếng), cookie thắng mặc định.
  const lang = await resolveLang(sp.lang);
  const T = UI[lang];
  const post = await fetchPost(slug, lang);
  if (!post) {
    if (await coOHeKia(slug)) permanentRedirect(`${WEB_HE_KIA}/blog/${slug}`);
    notFound();
  }
  // NGÔN NGỮ ĐANG THẬT SỰ HIỂN, không phải ngôn ngữ được yêu cầu.
  //
  // Máy chủ RƠI VỀ tiếng Việt khi bài chưa có bản của `lang`. Lọc theo `lang` thì ở một bài chỉ có
  // bản tiếng Việt, mở bằng ?lang=en sẽ hiện nút "Đọc bản tiếng Việt" — trỏ tới đúng thứ người ta
  // đang đọc. Đo ngày 25/09/2026: API trả `locales: ["vi"]` cho cả hai lần gọi locale=vi và locale=en,
  // và trang ?lang=en vẫn mời đọc bản tiếng Việt.
  //
  // Chú thích ở khối nút bên dưới đã cấm đúng cái bẫy này — nhưng chỉ cho chiều ngược lại.
  const ngonNguDangHien: Lang = (post.locales ?? ["vi"]).includes(lang)
    ? lang
    : ((post.locales?.[0] as Lang | undefined) ?? "vi");
  const others = (post.locales ?? ["vi"]).filter((l) => l !== ngonNguDangHien);

  // Hoà hai máy: lấy @graph + bài liên quan của máy kia (SEO tốt hơn hẳn — một Organization
  // dùng chung qua @id thay vì mỗi bài khai lại một tổ chức), giữ mục lục + thời gian đọc của
  // bản thiết kế lại. `articleLd` cũ bị @graph thay thế hoàn toàn nên bỏ.
  const url = `${SITE}/blog/${post.slug}`;
  const toc = extractToc(post.content);
  // Một mục thì mục lục chỉ là một dòng thừa; từ hai trở lên mới đáng chiếm chỗ.
  const showToc = toc.length >= 2;
  const minutes = readingMinutes(post.content);

  const related = await fetchRelated(post, lang);

  /**
   * Một @graph thay vì một BlogPosting rời.
   *
   * Bản cũ khai Organization ngay trong `publisher`, nên mỗi bài mô tả lại tổ chức một lần và
   * không có gì buộc các bản khai đó là CÙNG một thực thể. Dùng @id để mọi bài trỏ về đúng một
   * Organization và một WebSite — đó mới là thứ máy tìm kiếm gom lại thành thực thể, thay vì
   * hàng trăm tổ chức trùng tên.
   *
   * BreadcrumbList cho trang kết quả hiện đường dẫn "Blog › tên bài" thay vì URL trần.
   * `keywords` + `about` gắn bài vào chủ đề của nó, không để nó lơ lửng.
   */
  const ORG_ID = `${SITE}/#organization`;
  const SITE_ID = `${SITE}/#website`;
  const tags = Array.isArray(post.tags) ? post.tags : [];

  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORG_ID,
        name: "Larkwave",
        url: SITE,
        logo: { "@type": "ImageObject", url: `${SITE}/og.png` },
        description:
          "Nền tảng tạo web app bằng AI: mô tả ý tưởng, nhận về ứng dụng chạy thật với cơ sở dữ liệu và API.",
      },
      {
        "@type": "WebSite",
        "@id": SITE_ID,
        url: SITE,
        name: "Larkwave",
        inLanguage: lang === "vi" ? "vi-VN" : "en-US",
        publisher: { "@id": ORG_ID },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${SITE}/blog/${post.slug}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Blog", item: `${SITE}/blog` },
          { "@type": "ListItem", position: 2, name: post.title },
        ],
      },
      {
        "@type": "BlogPosting",
        "@id": `${SITE}/blog/${post.slug}#article`,
        headline: post.title,
        description: post.seoDescription ?? post.excerpt ?? undefined,
        url: `${SITE}/blog/${post.slug}`,
        datePublished: post.publishedAt ?? undefined,
        dateModified: post.updatedAt,
        image: post.coverImage ?? undefined,
        inLanguage: lang === "vi" ? "vi-VN" : "en-US",
        keywords: tags.length ? tags.join(", ") : undefined,
        // Bỏ thẻ đầu: đó là KIỂU bài (howto/listicle), không phải chủ đề bài nói về.
        about: tags.slice(1).map((t) => ({ "@type": "Thing", name: t })),
        author: post.authorName
          ? { "@type": "Person", name: post.authorName }
          : { "@id": ORG_ID },
        publisher: { "@id": ORG_ID },
        isPartOf: { "@id": SITE_ID },
        mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE}/blog/${post.slug}` },
      },
    ],
  };

  return (
    // Màu qua biến theme: trang được ForceDark ép tối ở providers. Bài viết là trang ĐỌC, nên chỉ
    // có đèn rọi theo chuột — không nền WebGL, không thẻ nghiêng — để chữ là thứ duy nhất chuyển động.
    <main style={{ background: "var(--tw-layer, #FFFFFF)", color: "var(--tw-text, #1E2230)", minHeight: "100vh" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(graph) }} />
      {/* BỘ CSS CỦA BLOG. Trước đây trên trang này nó chỉ được IMPORT chứ không được kết xuất, nên
          mọi lớp `tw-bl-*` ở đây đều vô hiệu — một lỗi trình biên dịch không hề báo (import thừa
          không báo gì) và trông vẫn "gần đúng" trên máy rộng. Đo ngày 25/09/2026 trên bản thật ở 375px:
          ảnh bìa kèm `aspect-ratio` + `object-fit:cover` không được áp nên nằm nguyên kích thước gốc
          2400×1260 và bị cắt cụt; `document.styleSheets` không có MỘT luật `tw-bl-` nào. */}
      <BlogStyles />
      <CursorGlow />
      <LandingHeader lang={lang} />

      <div className="tw-bl-post">
        <article className="tw-bl-article">
          <div className="tw-bl-crumbs">
            <Link href={blogHref({ lang })}>← Blog</Link>
            {post.category && (
              <>
                <span className="sep" aria-hidden="true">/</span>
                <Link href={blogHref({ category: post.category, lang })} className="tw-bl-chip">
                  {categoryLabel(post.category, lang)}
                </Link>
              </>
            )}
          </div>

          {/*
            Nút đổi ngôn ngữ — CHỈ hiện khi bài thật sự có bản kia.
            Hiện sẵn nút "English" ở bài chưa dịch là hứa một thứ không có: bấm vào lại ra đúng
            nguyên văn tiếng Việt. `post.locales` do máy chủ tính và chỉ tính ngôn ngữ có đủ cả
            tiêu đề lẫn thân bài, nên ở đây không phải đoán.
            Là thẻ <a> thật chứ không phải nút JavaScript: mỗi bản là một địa chỉ riêng, phải bấm
            chuột giữa mở tab mới được, và máy tìm kiếm phải lần theo được.
          */}
          {others.length > 0 && (
            <div className="tw-bl-langs">
              {others.map((l) => (
                <Link
                  key={l}
                  href={l === "vi" ? `/blog/${post.slug}` : `/blog/${post.slug}?lang=${l}`}
                  hrefLang={l}
                  className="tw-bl-chip"
                >
                  {l === "vi" ? "Đọc bản tiếng Việt" : "Read in English"}
                </Link>
              ))}
            </div>
          )}

          <h1 className="tw-bl-h1">{post.title}</h1>
          <div className="tw-bl-postmeta">
            <b>{post.authorName ?? "Larkwave"}</b>
            {post.publishedAt && (
              <>
                <span aria-hidden="true">·</span>
                <time dateTime={post.publishedAt}>{fmtDate(post.publishedAt)}</time>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>{minutes} {T.minutes}</span>
            {post.views > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span>{post.views} {T.views}</span>
              </>
            )}
          </div>

          <ShareBar url={url} title={post.title} lang={lang} />

          {post.coverImage && (
            // Cùng cách xử lý với thẻ ở /blog: tỉ lệ cố định, hạ sáng, veil tối — ảnh cũ nền sáng
            // có chữ in sẵn không còn là một mảng trắng chọi vào trang. Tiêu đề đã ở TRÊN, không đè lên ảnh.
            <div className="tw-bl-hero-cover">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={post.coverImage} alt="" decoding="async" />
              <i className="tw-bl-cover-veil" aria-hidden="true" />
            </div>
          )}

          {post.excerpt && <p className="tw-bl-lead">{post.excerpt}</p>}

          {showToc && <TableOfContents items={toc} bodyId={BODY_ID} variant="mobile" lang={lang} />}

          <div id={BODY_ID} className="tw-bl-postbody">
            {(() => {
              // "Đọc thêm" nằm GIỮA THÂN BÀI, không phải ở khung trang.
              //
              // Khối "Bài cùng chủ đề" cuối trang không giải quyết được vấn đề: nó ngoài thân bài,
              // người đọc bỏ dở giữa chừng không bao giờ thấy, và bộ chấm SEO cũng không tính —
              // 27/28 bài vẫn bị chấm "thân bài không có liên kết nội bộ nào".
              //
              // Cắt ở tiêu đề cấp 2 THỨ HAI: lúc đó người đọc vừa xong một phần trọn vẹn, đúng lúc
              // có thể muốn rẽ sang bài khác. Cắt ở tiêu đề đầu tiên thì khối này đập vào mặt trước
              // cả nội dung. Bài không đủ tiêu đề, hoặc không tìm được 2 bài liên quan, thì KHÔNG
              // chèn — thà thiếu liên kết còn hơn nhét một khối vào giữa mạch đọc.
              // NHƯỜNG khi bài tự có liên kết nội bộ trong nội dung (script đăng bài chèn sẵn một
              // mục "## Đọc thêm"). Không nhường thì trang hiện hai khối cùng tên — đo ngày
              // 23/09/2026 trên bài `cach-them-thanh-toan-chuyen-khoan…`: chữ "Đọc thêm" xuất
              // hiện 7 lần trên một trang.
              const [truoc, sau] = chiaThanBai(post.content);
              const goiY = related.slice(0, 2);
              const tuCoLienKet =
                /^##\s*(Đọc thêm|Read next)/m.test(post.content) ||
                /\]\((?:https?:\/\/toolswave\.net)?\/blog\//.test(post.content);
              if (!sau || goiY.length < 2 || tuCoLienKet) return <BlogMarkdown content={post.content} />;
              return (
                <>
                  <BlogMarkdown content={truoc} />
                  <aside className="tw-bl-readnext">
                    <p className="tw-bl-readnext-h">{lang === "vi" ? "Đọc thêm" : "Read next"}</p>
                    <ul>
                      {goiY.map((r) => (
                        <li key={r.slug}>
                          <Link href={postHref(r.slug, lang)}>{r.title}</Link>
                        </li>
                      ))}
                    </ul>
                  </aside>
                  <BlogMarkdown content={sau} />
                </>
              );
            })()}
          </div>

          {post.tags.length > 0 && (
            <div className="tw-bl-section">
              <p className="tw-bl-section-h">{T.tags}</p>
              <div className="tw-bl-tags">
                {post.tags.map((t) => (
                  <Link key={t} href={blogHref({ tag: t, lang })} className="tw-bl-chip">
                    #{tagLabel(t, lang)}
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="tw-bl-section">
            <p className="tw-bl-section-h">{T.share}</p>
            <ShareBar url={url} title={post.title} lang={lang} />
          </div>

          <BlogComments slug={post.slug} lang={lang} />

          {/* CTA cuối bài */}
          <div
            style={{
              marginTop: 48,
              padding: "28px 26px",
              borderRadius: 18,
              background: GRADIENT,
              color: "#fff",
              textAlign: "center",
              boxShadow: "0 30px 80px rgba(108,92,231,0.35)",
            }}
          >
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 8px" }}>{T.ctaTitle}</h2>
            <p style={{ opacity: 0.95, margin: "0 0 18px" }}>{T.ctaSub}</p>
            <Link
              href="/register"
              style={{
                display: "inline-block",
                padding: "12px 26px",
                background: "#fff",
                color: BRAND,
                borderRadius: 10,
                fontWeight: 700,
              }}
            >
              {T.ctaBtn}
            </Link>
          </div>
        </article>

        {/* Cột phải chỉ hiện ≥1100px (CSS); mục lục dính theo cuộn. */}
        {showToc && (
          <aside className="tw-bl-aside">
            <TableOfContents items={toc} bodyId={BODY_ID} variant="aside" lang={lang} />
          </aside>
        )}
      </div>

      {/* DÙNG ĐÚNG KHUNG CỦA BÀI, không tự tính lại.

          Bản cũ đặt maxWidth 760 + padding clamp(16px,5vw,28px) và mở ở CHÍNH giữa khung nhìn, trong
          khi thân bài ở trên dùng .tw-bl-post với clamp(16px,5vw,56px). Hai clamp khác trần nhau nên ở
          768px khối này nhô ra ~10px so với mọi chữ phía trên. Nặng hơn từ 1100px: lúc đó .tw-bl-post
          thành lưới hai cột và bài dạt về trái, còn khối này vẫn căn giữa màn hình — đo ở 1440px thì
          lệch ~134px, trông như một khối của trang khác. Ở 375px hai bên trùng nhau nên chỉ soi máy
          nhỏ sẽ không bao giờ thấy. */}
      {related.length > 0 && (
        <section
          aria-labelledby="bai-lien-quan"
          className="tw-bl-post"
          style={{ paddingBottom: 72 }}
        >
          {/* Lớp trong dùng đúng .tw-bl-article để rộng bằng cột bài (760px) chứ không tràn ra cả
              cột lưới ở màn ≥1100px. */}
          <div className="tw-bl-article">
          <h2 id="bai-lien-quan" style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>
            {T.related}
          </h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
            {related.map((r) => (
              <li key={r.slug}>
                <Link
                  href={postHref(r.slug, lang)}
                  style={{
                    display: "block",
                    padding: "14px 16px",
                    borderRadius: 10,
                    border: "1px solid rgba(127,127,127,0.25)",
                    fontWeight: 600,
                    lineHeight: 1.45,
                  }}
                >
                  {r.title}
                </Link>
              </li>
            ))}
          </ul>
          </div>
        </section>
      )}

      <LandingFooter lang={lang} />
    </main>
  );
}
