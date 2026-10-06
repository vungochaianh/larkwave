import type { NextConfig } from "next";

/**
 * Security response headers, applied to every route below.
 *
 * Deliberately conservative: the goal is anti-clone / anti-embed / anti-sniff
 * hardening that cannot take the site down. Anything that could break a real
 * user's session or a working page is NOT here.
 */
const securityHeaders = [
  {
    // Anti-clone / anti-embed control: nobody else may put our pages inside an
    // <iframe>, so a mirror site can't wrap app.toolswave.net and pass it off
    // as its own (and clickjacking goes with it).
    //
    // ONLY `frame-ancestors`. A full CSP with script-src/style-src would be an
    // instant outage here: Next.js ships an inline bootstrap script, antd
    // (cssinjs) and Monaco inject inline styles at runtime, and mermaid
    // evaluates generated code. Tightening this needs nonces + a staged
    // report-only rollout, not a one-line edit.
    //
    // Safe for the shared-Artifact page (/a/<slug>): it renders user HTML with
    // <iframe srcDoc=…>, i.e. an about:srcdoc document with no network
    // response, so frame-ancestors never applies to it — and framing OUR OWN
    // origin is what 'self' permits anyway.
    key: "Content-Security-Policy",
    value: "frame-ancestors 'self'",
  },
  {
    // Older-browser twin of frame-ancestors. Same intent, SAMEORIGIN so the app
    // can keep framing its own content.
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    // Don't let a browser MIME-sniff a response into something executable.
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // Full URL stays inside our origin; third parties (and the deployed apps we
    // link out to) only ever see the bare origin.
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // Nothing in the app uses camera/mic/geolocation, so deny them outright —
    // for our pages and for every nested frame, including the sandboxed
    // Artifact renderer. `interest-cohort` is the legacy FLoC opt-out: a no-op
    // on current browsers, kept because it costs nothing.
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    // 1 year, subdomains included. Intentionally NOT `preload`: preloading is a
    // hard-to-reverse commitment (removal from the browser preload list takes
    // months and bricks any future plain-HTTP subdomain in the meantime), and
    // the owner hasn't asked for it. Add `; preload` only as a deliberate call.
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    // Cut the opener link to cross-origin popups. Safe here: every window.open
    // in the app already passes `noopener`, and the desktop OAuth flow is a
    // top-level navigation (loadURL), not a popup that talks back.
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // Stop advertising the stack: drops `X-Powered-By: Next.js` from every
  // response, so scanners get one less version hint to fingerprint.
  poweredByHeader: false,
  // Next.js 16 decouples ESLint from `next build` (the `eslint` config key was
  // removed). Linting no longer blocks the production build; TypeScript checks
  // remain ON below.
  transpilePackages: [
    // Shared UI/runtime — the same components power the desktop app.
    "@larkwave/ui",
    "@larkwave/core",
    "@ant-design/icons",
    "@ant-design/icons-svg",
    "@ant-design/nextjs-registry",
    "@ant-design/cssinjs",
    "antd",
    "rc-util",
    "rc-pagination",
    "rc-picker",
    "rc-table",
    "rc-tree",
    "rc-input",
  ],
  /**
   * `/welcome` → `/` VĨNH VIỄN (308), ở TẦNG ĐỊNH TUYẾN.
   *
   * Vì sao ở đây chứ không phải `permanentRedirect()` trong page: trang đó được dựng TĨNH, và
   * trong ngữ cảnh dựng tĩnh `permanentRedirect` chỉ chèn một thẻ meta để trình duyệt tự nhảy —
   * phía máy chủ vẫn trả **200 kèm nội dung**. Đo trên máy chủ thật sau lần deploy đầu: đúng như
   * vậy. Với SEO thì 200-rồi-meta-refresh gần như vô dụng: máy tìm kiếm thấy hai URL cùng nội
   * dung, không thấy tín hiệu hợp nhất nào.
   *
   * `redirects()` trả 308 THẬT trước khi React chạy, nên vừa đúng tín hiệu vừa nhanh hơn.
   */
  async redirects() {
    return [
      { source: "/welcome", destination: "/", permanent: true },
      // Khu làm việc AI đổi tên qua nhiều lượt: "Claude" → Wave → Edualc → "Agents Chat" (/agents-chat).
      //
      // PHẢI giữ bốn dòng này, đừng dọn đi sau vài tháng: /claude là đường dẫn người dùng đã lưu
      // trong dấu trang, đã dán cho nhau, và còn nằm trong bảng Lookup trên Lark (5 dòng trỏ tới
      // /claude/projects, /artifacts, /scheduled, /files, /skills). Bỏ redirect là những chỗ đó
      // thành 404 hết.
      //
      // Có cả /wave và /edualc vì hai tên đó đều đã lên bản chạy thật một quãng trước khi đổi tiếp.
      // Sống ngắn thì vẫn là đã sống: ai mở trong quãng đó đều có thể đã lưu dấu trang.
      //
      // Giữ nguyên phần đuôi và query: `/claude?c=<id>` là liên kết sâu tới đúng một cuộc trò
      // chuyện — rơi mất `c` thì người dùng về màn hình trống mà không hiểu vì sao. Next tự
      // chuyển tiếp query string, phần đường dẫn thì do `:path*` giữ.
      { source: "/claude", destination: "/agents-chat", permanent: true },
      { source: "/claude/:path*", destination: "/agents-chat/:path*", permanent: true },
      { source: "/wave", destination: "/agents-chat", permanent: true },
      { source: "/wave/:path*", destination: "/agents-chat/:path*", permanent: true },
      { source: "/edualc", destination: "/agents-chat", permanent: true },
      { source: "/edualc/:path*", destination: "/agents-chat/:path*", permanent: true },
      // Cửa hàng thu lại còn MỘT loại hàng (mã nguồn) ngày 24/09/2026, nên `/store` chính là
      // danh mục — không còn trang danh mục riêng cho từng loại.
      //
      // Ba đường dưới đây đã lên sitemap ngày 23/09 và có thể đã được thu thập, nên chúng phải
      // 301 chứ không được 404. Trang CHI TIẾT `/store/sourcecode/<slug>` KHÔNG nằm trong danh
      // sách này và giữ nguyên địa chỉ — `:path*` là zero-or-more nên một luật cho cả hai sẽ
      // nuốt luôn trang chi tiết.
      { source: "/store/sourcecode", destination: "/store", permanent: true },
      { source: "/store/software", destination: "/store", permanent: true },
      { source: "/store/software/:slug", destination: "/store", permanent: true },
      { source: "/store/documents", destination: "/store", permanent: true },
      { source: "/store/documents/:slug", destination: "/store", permanent: true },
    ];
  },
  // `/:path*` matches every route including "/" (the `*` modifier is zero-or-more).
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
