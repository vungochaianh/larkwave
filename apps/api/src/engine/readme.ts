import type { Track } from '@larkwave/shared';

export interface ReadmeOpts {
  name: string;
  slug: string;
  /** Live URL if the app has been deployed. */
  url?: string | null;
  /** Web only: app ships Cloudflare Pages Functions + a D1 database. */
  fullstack?: boolean;
}

const footer = (url?: string | null) =>
  [
    '',
    '---',
    '',
    url ? `🔗 Bản chạy trực tuyến: ${url}` : '',
    '',
    'Dự án này được tạo bằng [Larkwave](https://toolswave.net) — nền tảng dựng app bằng AI.',
    '',
  ]
    .filter((l) => l !== '')
    .join('\n');

function webReadme(o: ReadmeOpts): string {
  return `# ${o.name}

Web app (React + Vite + TypeScript) tạo bởi Larkwave.

## Yêu cầu
- [Node.js](https://nodejs.org) phiên bản **20 trở lên** (kèm npm)

## Chạy trên máy (local)
\`\`\`bash
npm install      # cài thư viện (chạy 1 lần)
npm run dev      # khởi động dev server
\`\`\`
Mở trình duyệt tại **http://localhost:5173**. Sửa code trong \`src/\` — trang tự cập nhật (hot reload).

## Build bản production
\`\`\`bash
npm run build    # xuất site tĩnh ra thư mục dist/
npm run preview  # xem thử bản build tại http://localhost:4173
\`\`\`
Thư mục \`dist/\` là site tĩnh — có thể deploy lên bất kỳ static host nào (Cloudflare Pages, Vercel, Netlify, GitHub Pages…).
${
  o.fullstack
    ? `
## Backend (full-stack)
App này có API chạy bằng **Cloudflare Pages Functions** trong thư mục \`functions/\` và CSDL **Cloudflare D1** (schema ở \`schema.sql\`).
\`\`\`bash
npm i -g wrangler                       # công cụ Cloudflare (1 lần)
wrangler d1 create ${o.slug}-db          # tạo D1 (lấy database_id điền vào wrangler.toml)
wrangler d1 execute ${o.slug}-db --file=./schema.sql   # nạp schema
npm run build && wrangler pages dev dist # chạy cả frontend + functions ở local
\`\`\`
`
    : ''
}
## Cấu trúc
- \`src/\` — mã nguồn React
- \`public/\` — tài nguyên tĩnh (icon, manifest PWA…)
- \`index.html\` — điểm vào${o.fullstack ? '\n- `functions/` — API (Pages Functions)\n- `schema.sql` — schema CSDL D1' : ''}

## Khắc phục sự cố
- Lỗi khi \`npm install\`: kiểm tra Node ≥ 20 (\`node -v\`), xoá \`node_modules\` + \`package-lock.json\` rồi cài lại.
- Cổng 5173 bận: chạy \`npm run dev -- --port 5174\`.
${footer(o.url)}`;
}

function mobileReadme(o: ReadmeOpts): string {
  return `# ${o.name}

Ứng dụng di động (Expo / React Native + TypeScript) tạo bởi Larkwave.

## Yêu cầu
- [Node.js](https://nodejs.org) **20+**
- App **Expo Go** trên điện thoại ([iOS](https://apps.apple.com/app/expo-go/id982107779) · [Android](https://play.google.com/store/apps/details?id=host.exp.exponent))

## Chạy trên máy (local)
\`\`\`bash
npm install
npx expo start
\`\`\`
Một mã **QR** sẽ hiện ở terminal — mở **Expo Go** trên điện thoại và quét để xem app chạy trực tiếp trên iOS/Android. Sửa code trong \`app/\` hoặc \`src/\` — app tự reload.

## Đóng gói file cài đặt (APK/IPA)
\`\`\`bash
npm i -g eas-cli
eas build --platform android   # hoặc ios
\`\`\`
(Cần tài khoản Expo miễn phí. Xem https://docs.expo.dev/build/setup)

## Khắc phục sự cố
- Không quét được QR: đảm bảo điện thoại và máy tính cùng mạng Wi-Fi, hoặc chạy \`npx expo start --tunnel\`.
${footer(o.url)}`;
}

function extensionReadme(o: ReadmeOpts): string {
  return `# ${o.name}

Tiện ích trình duyệt (Chrome/Edge — Manifest V3) tạo bởi Larkwave.

## Cài đặt (không cần build)
1. Mở trình duyệt, vào **chrome://extensions** (Edge: **edge://extensions**).
2. Bật **Developer mode** (Chế độ nhà phát triển) ở góc trên bên phải.
3. Bấm **Load unpacked** (Tải tiện ích đã giải nén) và chọn **thư mục này**.
4. Tiện ích xuất hiện trên thanh công cụ — ghim lại để dùng.

Sau khi sửa code, quay lại trang tiện ích và bấm **nút tải lại (↻)** trên thẻ tiện ích để áp dụng thay đổi.

## Cấu trúc
- \`manifest.json\` — khai báo tiện ích (quyền, popup, script…)
- các file HTML/JS/CSS — popup & content/background script

## Khắc phục sự cố
- Không thấy tiện ích: kiểm tra \`manifest.json\` hợp lệ và đã bật Developer mode.
${footer(o.url)}`;
}

/**
 * Deterministic per-track "run it locally" README. No AI call — pure templates,
 * so it adds zero cost/latency and can't network-fail. Shipped as README.md in
 * every generated project and surfaced in the "Hướng dẫn chạy local" tab.
 */
export function renderReadme(track: Track, opts: ReadmeOpts): string {
  if (track === 'mobile') return mobileReadme(opts);
  if (track === 'extension') return extensionReadme(opts);
  return webReadme(opts);
}
