import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const TOKEN_COOKIE = "tw_token";

/** Public pages/assets that never require auth (incl. SEO image routes). */
const PUBLIC_PATHS = [
  "/welcome",
  "/login",
  "/register",
  "/forgot",
  "/reset",
  "/auth/callback",
  "/pricing",
  // Public shared Artifacts — "/a/<slug>" (NOT the authed "/artifacts"/"/assistant").
  "/a",
  // Public shared Trợ lý AI conversation transcript — "/s/<slug>" (read-only).
  "/s",
  // Public chat-able assistant link — "/g/<slug>".
  "/g",
  // Public shared Lark × Agents conversations — "/lark/s/<id>".
  "/lark/s",
  // Desktop app download landing + its release-manifest proxy.
  "/download",
  // Góp ý & Hỗ trợ. PHẢI công khai: người cần hỗ trợ nhất thường là người chưa đăng nhập được —
  // đẩy họ sang /login là đóng đúng cánh cửa họ đang gõ.
  "/support",
  "/api/desktop-release",
  "/opengraph-image",
  "/twitter-image",
  "/icon",
  "/apple-icon",
  "/manifest.webmanifest",
];

function isPublic(pathname: string): boolean {
  // TRANG CHỦ. Phải kiểm RIÊNG chứ không thêm "/" vào PUBLIC_PATHS: luật tiền tố bên dưới là
  // `startsWith(p + "/")`, mà với p="/" thì `startsWith("//")` không khớp gì — còn nếu ai đó
  // "sửa cho gọn" thành `startsWith(p)` thì MỌI đường dẫn thành công khai, tức là mở toang cả app.
  //
  // Trước đây "/" không cần nằm ở đây vì middleware đá nó sang /welcome từ sớm. Bỏ chuyển hướng
  // đó mà quên chỗ này thì trang chủ bị đẩy sang /login — đúng lỗi vừa gặp.
  if (pathname === "/") return true;
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * NHÁNH CẦN ĐĂNG NHẬP.
 *
 * Danh sách này thay cho luật cũ "mọi thứ không công khai đều đẩy sang /login" — luật đó biến mọi
 * đường dẫn KHÔNG TỒN TẠI thành một chuyển hướng tới trang đăng nhập thay vì một 404 thật. Với
 * máy tìm kiếm đó là số URL vô hạn cùng trả về một trang đăng nhập; với người gõ nhầm địa chỉ thì
 * không có cách nào biết mình gõ sai.
 *
 * Quên thêm một nhánh mới vào đây thì hậu quả là trang đó hiện vỏ rỗng cho khách chưa đăng nhập
 * rồi AuthGuard ở trình duyệt đá về /login — chậm hơn một nhịp, KHÔNG lộ dữ liệu (mọi dữ liệu đều
 * phải kèm token khi gọi API).
 */
const DUONG_CAN_DANG_NHAP = [
  "/overview",
  "/agent",
  "/agents-chat",
  "/artifacts",
  "/assistant",
  "/community",
  "/friends",
  "/notifications",
  "/profile",
  "/projects",
  "/remote",
  "/scheduled",
  "/skills",
  "/storage",
];

const khopNhanh = (pathname: string, ds: string[]): boolean =>
  ds.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/**
 * Hosts we will build a redirect for. Exact match, or a leading "." for any
 * subdomain. Dev hosts carry a port, so compare on the hostname only.
 */
const ALLOWED_HOSTS = ["toolswave.net", ".toolswave.net", "localhost", "127.0.0.1"];
/** Used when the Host header is missing or not ours — never redirect off-site. */
const FALLBACK_HOST = "toolswave.net";

/**
 * A gated page must never end up in a search index, even if a bot somehow
 * reaches it — robots.txt is advisory, this header is not. Public pages are
 * left untouched so /, /pricing, /download keep ranking.
 */
function noindex(res: NextResponse): NextResponse {
  res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return res;
}

function isAllowedHost(rawHost: string | null | undefined): boolean {
  const h = (rawHost ?? "").toLowerCase().split(":")[0].trim();
  if (!h) return false;
  return ALLOWED_HOSTS.some((a) => (a.startsWith(".") ? h === a.slice(1) || h.endsWith(a) : h === a));
}

/**
 * Build a redirect URL on the PUBLIC origin. Behind the Cloudflare tunnel,
 * `request.nextUrl` carries the INTERNAL origin (http://localhost:4100), so
 * redirects must be reconstructed from the public Host + X-Forwarded-Proto,
 * otherwise the browser would be sent to localhost.
 */
function publicRedirect(request: NextRequest, pathname: string, search = ""): URL {
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const raw =
    request.headers.get("host") ??
    request.headers.get("x-forwarded-host") ??
    request.nextUrl.host;
  // Allowlist the Host before it becomes a redirect target. The header is
  // attacker-controllable if anything ever reaches the origin without passing
  // Cloudflare, and an unchecked Host here turns every 307 into an open
  // redirect (…/login?next=… delivered to a domain we don't own).
  const host = isAllowedHost(raw) ? raw : FALLBACK_HOST;
  const url = new URL(`${proto}://${host}`);
  url.pathname = pathname;
  url.search = search;
  return url;
}

/**
 * Host-routed surfaces:
 *  - Host starts with 'cms.' -> admin surface, redirect to /admin/*
 *  - Otherwise (localhost, anything) -> public Larkwave surface
 * Auth: missing tw_token cookie on a protected page -> redirect to /login.
 *
 * (Next.js 16 renamed `middleware` -> `proxy`; logic is identical.)
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const host = (
    request.headers.get("host") ??
    request.headers.get("x-forwarded-host") ??
    ""
  ).toLowerCase();
  // Mặt quản trị nay ở `cms.` — sau khi hai hệ hoán đổi tên miền (22/09/2026), `aapp.` thuộc về
  // hệ thống khác. Để nguyên tiền tố cũ thì nhánh quản trị KHÔNG BAO GIỜ chạy, và hệ quả là
  // cms.toolswave.net/admin bị luật bên dưới đá về "/" — tức là bảng quản trị biến mất hoàn toàn.
  const isAdminHost = host.startsWith("cms.");
  const hasToken = Boolean(request.cookies.get(TOKEN_COOKIE)?.value);

  // "/" LÀ trang chủ — không chuyển hướng nữa.
  //
  // Trước đây chỗ này đẩy khách và bot sang `/welcome`, và đó là một lỗi SEO thật: URL có thẩm
  // quyền cao nhất của site trả 307 (TẠM THỜI) thay vì nội dung, nên Google lập chỉ mục
  // `/welcome` còn mọi backlink tự nhiên trỏ về gốc thì bị phân tán. Nay nội dung nằm thẳng ở
  // `app/page.tsx`, `/welcome` chuyển VĨNH VIỄN (308) ngược về đây, canonical trỏ "/".
  //
  // ĐỪNG khôi phục chuyển hướng cũ: nó sẽ tạo VÒNG LẶP với 308 của /welcome.
  //
  // KHÔNG chuyển hướng người đã đăng nhập khỏi "/". Trước đây chỗ này đẩy họ sang /overview với
  // lý do "vào app để làm việc, không phải đọc trang giới thiệu" — lý do đó sai ở hai điểm.
  //
  // Một, nó lấy mất trang chủ của chính người dùng. Đã đăng nhập rồi thì vẫn cần đọc blog, xem
  // bảng giá, đọc chính sách, gửi góp ý — tất cả đều được liên kết từ "/". Bị đá đi mỗi lần gõ
  // địa chỉ gốc nghĩa là không còn đường nào quay lại phần công khai, trừ khi thoát tài khoản.
  //
  // Hai, nó bắt trang chủ mang hai bộ mặt tuỳ trạng thái đăng nhập, nên một liên kết chia sẻ mở
  // ra hai thứ khác nhau cho hai người — và người gửi không hề biết.
  //
  // Việc cần làm không phải đá người ta đi, mà là ĐỔI PHẦN ĐẦU TRANG: đã đăng nhập thì hiện tài
  // khoản kèm lối vào bảng điều khiển, thay cho "Đăng nhập / Dùng thử miễn phí".
  // Xem LandingChrome.tsx.

  // Let social/search crawlers through so they can read the OpenGraph
  // <meta>/<title> in the document <head>. Without this, a bot hitting
  // app.toolswave.net/ gets a 307→/login (Zalo etc. don't follow it) and the
  // share preview shows no thumbnail.
  //
  // SCOPED TO PUBLIC PATHS ONLY. This used to return early for EVERY path, and
  // the User-Agent is just a string anyone can send — so `curl -A Googlebot`
  // walked straight past the gate onto /admin/* and the whole private area. That
  // leaked no data (real data needs a Bearer token) but it handed the entire
  // private-area HTML + JS bundle graph to anyone willing to type one flag,
  // which is exactly the scrape/clone surface we're closing. A crawler has no
  // business on a gated page: it can't index it and shouldn't fetch it.
  const ua = (request.headers.get("user-agent") ?? "").toLowerCase();
  const isCrawler =
    /facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|telegrambot|whatsapp|discordbot|zalo|pinterest|googlebot|bingbot|redditbot|applebot|skypeuripreview|vkshare|embedly|w3c_validator|baiduspider|yandexbot/.test(
      ua,
    );
  if (isCrawler && isPublic(pathname)) {
    return NextResponse.next();
  }

  // ── Admin surface (cms.*) ────────────────────────────────────────────────
  if (isAdminHost) {
    // login/register stay public even on the admin host.
    if (isPublic(pathname)) {
      return NextResponse.next();
    }
    if (!hasToken) {
      return NextResponse.redirect(
        publicRedirect(request, "/login", `?next=${encodeURIComponent(pathname + search)}`),
      );
    }
    if (!pathname.startsWith("/admin")) {
      // Redirect (not rewrite) to /admin/* on the public origin. A rewrite would
      // proxy to the internal localhost origin (TLS↔plaintext mismatch / loops);
      // the admin panel simply lives under /admin on the cms host.
      return NextResponse.redirect(
        publicRedirect(request, `/admin${pathname === "/" ? "" : pathname}`, search),
      );
    }
    return noindex(NextResponse.next());
  }

  // ── Public surface (localhost / anything else) ───────────────────────────
  // Block direct access to /admin paths from the public host.
  if (pathname.startsWith("/admin")) {
    return NextResponse.redirect(publicRedirect(request, "/"));
  }

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // Đường không công khai VÀ không thuộc khu làm việc = đường không tồn tại. Để Next trả 404 thật
  // thay vì đẩy sang /login — xem chú thích ở DUONG_CAN_DANG_NHAP.
  if (!khopNhanh(pathname, DUONG_CAN_DANG_NHAP)) {
    return NextResponse.next();
  }

  if (!hasToken) {
    return NextResponse.redirect(
      publicRedirect(request, "/login", `?next=${encodeURIComponent(pathname + search)}`),
    );
  }

  return noindex(NextResponse.next());
}

export const config = {
  matcher: [
    /*
     * Run on all paths except Next internals, API, and static assets.
     *
     * `.txt` phải nằm trong danh sách loại trừ, không chỉ riêng robots.txt.
     *
     * File khoá IndexNow (apps/web/public/<key>.txt) là cách chứng minh quyền sở hữu tên miền với
     * Bing/Yandex: họ tải nó về và so nội dung. Không loại trừ thì middleware đẩy nó sang
     * /login?next=… — đo được trên site thật: HTTP 307. Bing nhận một trang đăng nhập thay vì
     * khoá và trả 403 cho MỌI lần báo URL mới, tức là cả đường báo index chết mà không kêu một
     * tiếng: script vẫn chạy, vẫn "thành công", chỉ là không có gì được lập chỉ mục.
     *
     * An toàn vì mọi thứ trong public/ vốn đã công khai — đó là định nghĩa của thư mục đó.
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:txt|png|jpg|jpeg|gif|svg|ico|webp)$).*)",
  ],
};
