import { SITE_SURFACES, type GeneratedFile, type SiteSurface } from '@larkwave/shared';

/**
 * "Bộ site" — một hệ thống được tách thành NHIỀU site độc lập, mỗi site một địa chỉ riêng và
 * một lượt build riêng, nối với nhau qua MỘT API dùng chung.
 *
 * Vì sao tách site chứ không làm route trong cùng một app: khu quản trị và cổng khách hàng phục
 * vụ hai nhóm người khác nhau, phát hành theo nhịp khác nhau, và chịu rủi ro khác nhau. Gộp chung
 * thì một lần sửa bảng quản trị cũng đẩy lại trang bán hàng, và bất kỳ ai mở trang công khai cũng
 * tải luôn mã nguồn khu quản trị về máy.
 *
 * Chỗ nối là ĐỊA CHỈ API — biết trước được, vì địa chỉ site suy ra từ `slug` (cấp lúc tạo app),
 * không phải chờ deploy xong mới có. Nhờ vậy mọi site trong bộ đều được sinh code với địa chỉ
 * thật của các site anh em ngay từ lượt build đầu tiên.
 */

/** Thứ tự chuẩn: API dựng trước (các site khác gọi vào nó), rồi tới các mặt có giao diện. */
const ORDER: SiteSurface[] = ['api', 'site', 'cms', 'portal'];

export interface SurfaceMeta {
  /** Nhãn tiếng Việt hiển thị cho người dùng. */
  label: string;
  /** Hậu tố ghép vào tên app để phân biệt các site trong bộ. */
  suffix: string;
  /** Chỉ site API mới có cơ sở dữ liệu + Functions; các site còn lại là frontend gọi sang nó. */
  fullstack: boolean;
}

export const SURFACE_META: Record<SiteSurface, SurfaceMeta> = {
  site: { label: 'Website công khai', suffix: 'Website', fullstack: false },
  cms: { label: 'Backoffice (CMS)', suffix: 'Quản trị', fullstack: false },
  portal: { label: 'Portal khách hàng', suffix: 'Cổng khách hàng', fullstack: false },
  api: { label: 'API dùng chung', suffix: 'API', fullstack: true },
};

/**
 * Danh sách trang người dùng tự chọn ở ô soạn ("Các trang cần có: …") được ghép vào prompt CHUNG,
 * nên nó tới cả bốn site. Với mặt tiền thì đúng; với API/backoffice/cổng khách thì sai — không ai
 * muốn site API có trang "Bảng giá" và "Tuyển dụng". Câu này đứng SAU danh sách đó nên nó thắng.
 */
const PAGES_OVERRIDE =
  '- Danh sách "Các trang cần có" ở phần mô tả phía trên (nếu có) là của WEBSITE CÔNG KHAI, ' +
  'KHÔNG áp cho site này. Site này chỉ dựng đúng các màn nêu ở phần vai trò ngay trên.\n';

/** Ai dùng site này — câu quan trọng nhất, vì nó quyết định có cổng đăng nhập hay không. */
const AUDIENCE: Record<SiteSurface, string> = {
  site: 'khách vãng lai, KHÔNG cần đăng nhập mới xem được',
  cms: 'nhân viên nội bộ, BẮT BUỘC đăng nhập mới vào được (không có trang công khai nào)',
  portal: 'khách hàng đã có tài khoản, đăng nhập để xem dữ liệu CỦA CHÍNH HỌ',
  api: 'các site khác trong bộ gọi vào (không phải người dùng cuối)',
};

/**
 * Chuẩn hoá danh sách mặt người dùng chọn.
 *
 * Luật quan trọng: từ 2 mặt trở lên thì LUÔN có 'api'. Backoffice và portal mà không có kho dữ
 * liệu dùng chung thì mỗi site đẻ một cơ sở dữ liệu riêng — nhìn thì đủ mặt, nhưng sửa nội dung
 * ở khu quản trị xong ra trang công khai vẫn thấy dữ liệu cũ. Đó không phải "liên kết với nhau",
 * đó là ba hệ thống rời nhau trông giống một hệ thống.
 */
export function normalizeSurfaces(input?: readonly string[] | null): SiteSurface[] {
  if (!input?.length) return [];
  const picked = new Set<SiteSurface>();
  for (const raw of input) {
    const v = String(raw).trim().toLowerCase();
    if ((SITE_SURFACES as readonly string[]).includes(v)) picked.add(v as SiteSurface);
  }
  if (picked.size < 2) return [];
  picked.add('api');
  return ORDER.filter((s) => picked.has(s));
}

export interface SuiteMember {
  surface: SiteSurface;
  slug: string;
  name: string;
}

/** Địa chỉ công khai suy ra từ slug — giống hệt cách pipeline đặt tên miền lúc deploy. */
export function suiteUrl(slug: string): string {
  return `https://${slug}.toolswave.net`;
}

/** Tên app cho từng site trong bộ: giữ tên gốc, thêm hậu tố để phân biệt trong danh sách. */
export function suiteAppName(baseName: string, surface: SiteSurface): string {
  const base = baseName.trim().slice(0, 40) || 'App';
  return `${base} — ${SURFACE_META[surface].suffix}`.slice(0, 60);
}

function memberLine(m: SuiteMember, me: SiteSurface): string {
  const meta = SURFACE_META[m.surface];
  const mark = m.surface === me ? '  ← SITE BẠN ĐANG DỰNG' : '';
  return `- ${meta.label} (${m.surface}): ${suiteUrl(m.slug)} — ${AUDIENCE[m.surface]}${mark}`;
}

/** Chỉ dẫn riêng cho từng vai, nối vào sau phần mô tả chung của cả bộ. */
function roleSpec(
  me: SiteSurface,
  members: SuiteMember[],
  apiUrl: string,
  cloning: boolean,
): string {
  const has = (s: SiteSurface) => members.some((m) => m.surface === s);
  const urlOf = (s: SiteSurface) => {
    const m = members.find((x) => x.surface === s);
    return m ? suiteUrl(m.slug) : '';
  };
  // Các site có giao diện đều gọi chung một khối config — nói rõ để ba site không đẻ ra ba
  // kiểu gọi API khác nhau, và để người dùng đổi địa chỉ API mà không phải sửa khắp nơi.
  // Sao chép một trang có sẵn thì NỘI DUNG của trang gốc phải nằm ngay trong mã — đó chính là
  // bản sao. Câu "mọi dữ liệu lấy từ API" ở dưới nói ngược lại, và nếu để nguyên thì mặt tiền
  // dựng ra một cái khung rỗng chờ API trả về nội dung mà API không hề có. Tách bạch: nội dung
  // TĨNH đã chép về thì để trong mã; chỉ dữ liệu NGHIỆP VỤ (đơn hàng, tài khoản, biểu mẫu gửi
  // đi) mới đi qua API.
  const cloneCarveOut =
    cloning && me === 'site'
      ? `\n- NGOẠI LỆ cho site này (đang SAO CHÉP một trang có sẵn): toàn bộ nội dung đã chép về từ ` +
        `trang gốc (chữ, tiêu đề, mục sản phẩm/bài viết, đường dẫn ảnh) PHẢI để thành dữ liệu TĨNH ngay ` +
        `trong mã, đúng như phần sao chép yêu cầu. Chỉ những gì thật sự cần dùng chung với các site khác ` +
        `(đơn hàng, tài khoản, biểu mẫu người dùng gửi) mới gọi sang API.\n`
      : '';
  const clientData =
    `DỮ LIỆU: site này KHÔNG có cơ sở dữ liệu riêng và KHÔNG được tạo "schema.sql" hay thư mục "functions/".\n` +
    `Mọi thao tác đọc/ghi đều gọi sang API dùng chung:\n` +
    `- Tạo "src/config.ts": export const API_BASE = import.meta.env.VITE_API_BASE ?? '${apiUrl}';\n` +
    `- Mọi lời gọi dùng dạng: fetch(\`\${API_BASE}/api/<tài nguyên>\`, { credentials: 'include' }).\n` +
    `- TUYỆT ĐỐI không gọi đường dẫn tương đối "/api/..." — site này và API nằm trên hai tên miền khác nhau.\n` +
    `- Khi API lỗi hoặc chưa có dữ liệu: hiện trạng thái rỗng/lỗi tử tế, KHÔNG bịa dữ liệu giả trong code.\n` +
    cloneCarveOut;

  if (me === 'api') {
    const origins = members.filter((m) => m.surface !== 'api').map((m) => suiteUrl(m.slug));
    return (
      `VAI TRÒ: đây là site API — nơi DUY NHẤT trong bộ giữ dữ liệu.\n` +
      `- Full-stack: "schema.sql" ở gốc + "functions/api/<tài nguyên>.js" (Cloudflare Pages Functions + D1).\n` +
      `- Schema phải phủ ĐỦ nhu cầu của mọi site trong bộ ở trên, kể cả bảng người dùng/phiên đăng nhập ` +
      `nếu bộ có khu quản trị hoặc cổng khách hàng.\n` +
      `- Mỗi tài nguyên có đủ CRUD (GET danh sách, GET theo id, POST, PUT, DELETE) và seed sẵn 3–5 bản ghi mẫu.\n` +
      // Auth phải nằm Ở ĐÂY, và phải nói THẲNG. Backoffice và cổng khách hàng đều có cổng đăng
      // nhập, nhưng chúng bị cấm có cơ sở dữ liệu riêng — nên nếu site API chỉ tạo BẢNG người
      // dùng mà không tạo ENDPOINT đăng nhập, cả hai site kia gọi sang và nhận 404, tức cả hai
      // không ai vào được. Trước khi có dòng này, phần vai chỉ nói "schema phải phủ đủ nhu cầu",
      // và một cái bảng thì không đăng nhập hộ ai được.
      (members.some((m) => m.surface === 'cms' || m.surface === 'portal')
        ? `- BẮT BUỘC có ĐĂNG NHẬP tại site này (các site kia không có CSDL riêng nên không tự làm được):\n` +
          `  · "functions/api/auth/[action].js" phục vụ ít nhất: register, login, logout, me.\n` +
          `  · Bảng "users" (mật khẩu băm kèm salt, KHÔNG lưu mật khẩu thô) và bảng "sessions".\n` +
          `  · Phiên đăng nhập trả bằng cookie HttpOnly + SameSite=None + Secure (khác tên miền thì ` +
          `SameSite=Lax sẽ KHÔNG gửi kèm, và cả bộ sẽ đăng nhập được rồi lập tức mất phiên).\n` +
          `  · Phân biệt vai: tài khoản nhân viên vào được backoffice, tài khoản khách chỉ thấy dữ liệu ` +
          `của chính mình ở cổng khách hàng.\n`
        : '') +
      `- CORS BẮT BUỘC (các site anh em nằm khác tên miền, thiếu phần này là cả bộ hỏng):\n` +
      `  · Đọc header Origin của request; nếu nằm trong danh sách dưới đây thì trả về đúng origin đó ở ` +
      `"Access-Control-Allow-Origin" (KHÔNG dùng "*" vì có gửi cookie) kèm "Access-Control-Allow-Credentials: true".\n` +
      `  · Trả lời request OPTIONS bằng 204 kèm "Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS" ` +
      `và "Access-Control-Allow-Headers: Content-Type,Authorization".\n` +
      `  · Origin được phép: ${origins.join(', ')}\n` +
      `  · Đặt phần CORS vào MỘT chỗ dùng chung ("functions/_middleware.js") thay vì chép lại ở từng route.\n` +
      `- Giao diện: chỉ cần MỘT trang chỉ mục ở "/" liệt kê các endpoint và ví dụ gọi thử. Không dựng ` +
      `trang bán hàng, không dựng bảng quản trị ở đây.\n` +
      PAGES_OVERRIDE
    );
  }

  if (me === 'cms') {
    return (
      `VAI TRÒ: đây là backoffice (CMS) — bảng điều khiển nội bộ, KHÔNG phải trang công khai.\n` +
      `- Cổng đăng nhập chắn TOÀN BỘ site: chưa đăng nhập thì mọi đường dẫn đều đưa về trang đăng nhập.\n` +
      `- Với mỗi tài nguyên nghiệp vụ: bảng dữ liệu có tìm kiếm, lọc, phân trang, và form thêm/sửa/xoá ` +
      `(hỏi xác nhận trước khi xoá).\n` +
      `- Có trang tổng quan với vài số liệu thật lấy từ API (không phải số bịa trong code).\n` +
      (has('site') ? `- Trong menu có lối mở trang công khai: ${urlOf('site')} (mở tab mới).\n` : '') +
      PAGES_OVERRIDE +
      clientData
    );
  }

  if (me === 'portal') {
    return (
      `VAI TRÒ: đây là cổng khách hàng — nơi khách ĐĂNG NHẬP để xem việc của chính họ.\n` +
      `- Có đăng ký, đăng nhập, quên mật khẩu, và trang hồ sơ cá nhân.\n` +
      `- Sau khi đăng nhập: chỉ hiển thị dữ liệu THUỘC VỀ người đang đăng nhập (đơn hàng, yêu cầu, ` +
      `hoá đơn… tuỳ nghiệp vụ). Không có màn nào liệt kê dữ liệu của khách khác.\n` +
      `- KHÔNG có chức năng quản trị (sửa dữ liệu người khác, đổi cấu hình hệ thống) — việc đó thuộc backoffice.\n` +
      (has('site') ? `- Có lối quay về trang công khai: ${urlOf('site')}.\n` : '') +
      PAGES_OVERRIDE +
      clientData
    );
  }

  // site
  return (
    `VAI TRÒ: đây là website công khai — mặt tiền cho khách vãng lai.\n` +
    `- Xem được toàn bộ nội dung công khai mà KHÔNG cần đăng nhập.\n` +
    `- Nội dung (bài viết, sản phẩm, dịch vụ…) lấy từ API dùng chung, để sửa ở backoffice là trang này đổi theo.\n` +
    (has('portal')
      ? `- Nút "Đăng nhập" / "Tài khoản" trên đầu trang trỏ sang cổng khách hàng: ${urlOf('portal')}.\n`
      : '') +
    (has('cms') ? `- KHÔNG nhúng khu quản trị vào site này; nó là một site riêng.\n` : '') +
    clientData
  );
}

/**
 * Ghép prompt cho MỘT site trong bộ: mô tả gốc của người dùng + bản đồ cả bộ + vai của site này.
 *
 * Bản đồ đặt TRƯỚC phần vai để model biết mình đang ở đâu trong hệ thống rồi mới đọc việc phải
 * làm; và câu "chỉ sinh code cho site này" lặp lại ở cuối vì đó là chỗ dễ trượt nhất — model rất
 * hay tiện tay dựng luôn cả khu quản trị vào chung một app.
 */
export function suitePrompt(
  basePrompt: string,
  me: SiteSurface,
  members: SuiteMember[],
  opts: { cloning?: boolean } = {},
): string {
  const apiMember = members.find((m) => m.surface === 'api');
  const apiUrl = apiMember ? suiteUrl(apiMember.slug) : '';
  const map = members.map((m) => memberLine(m, me)).join('\n');
  const meta = SURFACE_META[me];
  return (
    `${basePrompt.trim()}\n\n` +
    `═══ HỆ THỐNG NHIỀU SITE ═══\n` +
    `Hệ thống này được tách thành ${members.length} site ĐỘC LẬP, mỗi site deploy riêng ở một địa chỉ riêng:\n` +
    `${map}\n\n` +
    `SITE BẠN ĐANG DỰNG: ${meta.label} — ${me === 'api' ? apiUrl : suiteUrl(members.find((m) => m.surface === me)?.slug ?? '')}\n` +
    `CHỈ sinh code cho site này. KHÔNG dựng các site còn lại vào cùng dự án.\n\n` +
    `${roleSpec(me, members, apiUrl, !!opts.cloning)}\n` +
    `Nhắc lại: dự án này chỉ chứa ${meta.label}. Các mặt khác đã có site riêng ở địa chỉ nêu trên.`
  );
}

/**
 * RÀO CỨNG: site không phải mặt API thì không được mang theo cơ sở dữ liệu.
 *
 * Vì sao phải là mã chứ không phải một câu trong prompt: đã thử bằng prompt và ĐO ĐƯỢC là hỏng.
 * Bộ site thật đầu tiên (truanayangi, 2026-09-10) sinh ra BA cơ sở dữ liệu D1 riêng — API một
 * cái, backoffice một cái, portal một cái — dù chỉ thị nói rõ "site này KHÔNG có cơ sở dữ liệu
 * riêng và KHÔNG được tạo schema.sql". Hậu quả cho người dùng: sửa nội dung ở backoffice xong ra
 * trang công khai không thấy gì, vì chúng đọc ba kho khác nhau.
 *
 * Chuỗi nhân quả: model tự đẻ schema.sql + functions/ → bước deploy thấy có backend nên đặt lại
 * `backendKind = 'fullstack'` (đúng việc của nó: giữ cờ thành thật) → `deployFullStack` cấp một
 * D1 mới `tw-<slug>-db`. Bỏ file đi là chỗ DUY NHẤT cắt được cả chuỗi, và cờ `backendKind` tự
 * khắc đúng mà không phải sửa gì ở đó.
 *
 * Trả về `null` khi không phải việc của nó — nơi gọi giữ nguyên mảng cũ, không tạo bản sao thừa.
 */
export function stripSuiteBackend(
  app: { suiteId?: string | null; surface?: string | null },
  paths: readonly string[],
): { keep: boolean[]; dropped: string[] } | null {
  if (!app.suiteId || !app.surface || app.surface === 'api') return null;
  const dropped: string[] = [];
  const keep = paths.map((raw) => {
    const path = raw.replace(/^\.?\//, '');
    const isBackend = path === 'schema.sql' || path.startsWith('functions/');
    if (isBackend) dropped.push(path);
    return !isBackend;
  });
  return dropped.length ? { keep, dropped } : null;
}


export function suiteApiContract(files: GeneratedFile[]): string {
  if (!files.length) return '';
  const norm = (path: string) => path.replace(/^\.?\//, '');
  const schema = files.find((f) => norm(f.path) === 'schema.sql');
  // Bỏ INSERT/seed: chúng chiếm gần hết file mà không nói gì thêm về hình dạng dữ liệu.
  const ddl = (schema?.content ?? '')
    .split(/;\s*\n/)
    .filter((stmt) => /create\s+table/i.test(stmt))
    .join(';\n')
    .slice(0, 6000);
  const routes = files
    .map((f) => norm(f.path))
    .filter((path) => path.startsWith('functions/api/'))
    .map((path) => '/' + path.replace(/^functions\//, '').replace(/\.(js|ts)$/, ''))
    // "[id]" trong tên file Pages Functions là tham số đường dẫn — viết lại cho dễ đọc.
    .map((r) => r.replace(/\[([^\]]+)\]/g, ':$1'))
    .sort();
  if (!ddl && !routes.length) return '';
  return (
    `═══ HỢP ĐỒNG THẬT CỦA SITE API (đã dựng xong, KHÔNG phải phán đoán) ═══\n` +
    `Site API của bộ đã build xong. Dưới đây là cấu trúc dữ liệu và các endpoint CÓ THẬT của nó.\n` +
    `BẮT BUỘC gọi đúng những đường dẫn này và đọc/ghi đúng các cột này — đừng tự đặt tên khác.\n\n` +
    (routes.length ? `Endpoint có thật:\n${routes.map((r) => `- ${r}`).join('\n')}\n\n` : '') +
    (ddl ? `Bảng dữ liệu có thật:\n${ddl}\n\n` : '') +
    `Nếu site này cần một dữ liệu mà API chưa có endpoint tương ứng: hiển thị trạng thái rỗng ` +
    `tử tế, KHÔNG tự tạo cơ sở dữ liệu riêng và KHÔNG bịa endpoint không có trong danh sách trên.`
  );
}

export function suiteBrandNote(files: GeneratedFile[]): string {
  const styleText = files
    .filter((f) => /\.(css|scss|ts|tsx|js|jsx|html)$/i.test(f.path))
    .map((f) => f.content)
    .join('\n')
    .slice(0, 400_000);
  if (!styleText) return '';

  // Màu: đếm tần suất. Bỏ mọi sắc XÁM (r=g=b, gồm cả trắng và đen) — chúng có ở mọi trang web
  // trên đời nên không nói lên thương hiệu nào cả.
  const counts = new Map<string, number>();
  for (const m of styleText.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
    const hex = m[0].toLowerCase();
    const [, r, g, b] = /#(..)(..)(..)/.exec(hex)!;
    if (r === g && g === b) continue;
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  const colors = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([hex]) => hex);

  // Phông phải đọc từ BA nguồn, không chỉ `font-family`.
  // Đo trên một app thật do chính hệ thống sinh ra: chỉ soi `font-family` thì trả về RỖNG, vì
  // phông thật được khai ở thẻ <link> Google Fonts và ở biến CSS `--font-display/--font-body`.
  // Một hàm rút bản sắc mà im lặng trả rỗng đúng trên đầu ra của chính mình thì vô dụng.
  const rawFonts = [
    // 1) Google Fonts: `?family=Plus+Jakarta+Sans:wght@...&family=Inter:...`
    ...[...styleText.matchAll(/family=([^:&"')]+)/g)].map((m) => m[1].replace(/\+/g, ' ')),
    // 2) Biến CSS `--font-…: 'Inter', system-ui`
    ...[...styleText.matchAll(/--font[\w-]*\s*:\s*([^;{}]+)/gi)].map((m) => m[1]),
    // 3) `font-family` thường. KHÔNG loại dấu nháy khỏi lớp ký tự — `font-family:"Be Vietnam
    //    Pro",sans-serif` sẽ dừng ngay ở nháy mở và bắt về chuỗi rỗng, mà tên phông có khoảng
    //    trắng thì gần như luôn nằm trong nháy.
    ...[...styleText.matchAll(/font-family\s*:\s*([^;{}]+)/gi)].map((m) => m[1]),
  ];
  const fonts = [
    ...new Set(
      rawFonts
        .map((v) => v.split(',')[0]!.trim().replace(/^["']|["']$/g, ''))
        .filter((f) => f && !/^(inherit|initial|unset|var\(|sans-serif|serif|monospace|system-ui)/i.test(f)),
    ),
  ].slice(0, 3);

  if (!colors.length && !fonts.length) return '';
  return (
    `═══ BẢN SẮC GIAO DIỆN CỦA HỆ THỐNG (rút từ website mặt tiền ĐÃ DỰNG XONG) ═══\n` +
    `Site này phải trông như CÙNG MỘT hệ thống với website mặt tiền, không phải một sản phẩm khác.\n` +
    (colors.length ? `- Bảng màu dùng chung (ưu tiên đúng thứ tự): ${colors.join(', ')}\n` : '') +
    (fonts.length ? `- Phông chữ dùng chung: ${fonts.join(', ')}\n` : '') +
    `- Dùng đúng bảng màu này cho nút bấm, đường dẫn, nhãn và điểm nhấn. KHÔNG dùng màu tím mặc định ` +
    `hay bảng màu tự chọn nào khác.\n` +
    `- Đầu trang và chân trang giữ cùng tên thương hiệu, cùng cách xưng hô, cùng cỡ chữ như mặt tiền.`
  );
}


/**
 * Cờ bề mặt ĐÚNG cho một app, suy ra từ VAI của nó trong bộ.
 *
 * `App.surface` là nguồn sự thật, KHÔNG phải `App.backendKind`. Lý do rất cụ thể: `backendKind`
 * đã bị ghi đè ba lần từ ba chỗ khác nhau, mỗi chỗ đều có lý của nó —
 *   • bước deploy đặt lại theo file thật sự ship (giữ cờ thành thật);
 *   • nhánh iterate nâng MỌI app web lên fullstack+cms (đường "thêm CSDL/CMS");
 *   • và trước khi có rào cứng, model tự đẻ backend nên bước deploy thấy có thật.
 * Kết quả đo được: app slug 'bb8tyh' surface='site' mang backendKind='fullstack', cms=true —
 * rồi chốt chặn ở stageBuildWeb đòi backend, trong khi rào cứng vừa bỏ đúng những file đó đi.
 * Hai nửa của cùng hệ thống đánh nhau, và người dùng nhận một build hỏng không lý do.
 *
 * Vai thì không đổi theo thời gian: một site đã sinh ra làm backoffice thì mãi là backoffice.
 * Nên mọi chỗ cần biết "app này có backend không" phải hỏi hàm này, không đọc thẳng cột.
 */
export function surfaceFlags(app: {
  suiteId?: string | null;
  surface?: string | null;
  backendKind?: string | null;
  cms?: boolean | null;
}): { backendKind: 'static' | 'fullstack'; cms: boolean; d1DatabaseId?: null; d1Ready?: boolean } | null {
  if (!app.suiteId || !app.surface) return null;
  if (app.surface === 'api') return { backendKind: 'fullstack', cms: false };
  // Cắt luôn con trỏ tới cơ sở dữ liệu riêng. Bộ nào tạo trước khi có rào cứng đều đã được cấp
  // một D1 riêng cho từng site; để lại con trỏ đó thì cột dữ liệu vẫn nói site này có kho riêng,
  // và bất kỳ đường nào sau này đọc `d1DatabaseId` sẽ lại bind vào đúng cái kho không nên tồn tại.
  // (Bản thân D1 mồ côi trên Cloudflare do `reclaimOrphanD1` thu hồi.)
  return { backendKind: 'static', cms: false, d1DatabaseId: null, d1Ready: false };
}

/** Các mốc mở đầu của những khối do HỆ THỐNG ghép vào, không phải người dùng gõ. */
const SYSTEM_BLOCKS = [
  '\n═══ HỆ THỐNG NHIỀU SITE ═══',
  '\n═══ HỢP ĐỒNG THẬT CỦA SITE API',
  '\n═══ BẢN SẮC GIAO DIỆN CỦA HỆ THỐNG',
];

/**
 * Trả prompt về đúng câu NGƯỜI DÙNG gõ, bỏ mọi khối do hệ thống ghép vào.
 *
 * Vì sao cần: bản đầu nhồi bản đồ bộ site (~2100 ký tự) thẳng vào `build.prompt`. Nút "Chạy lại"
 * gửi LẠI chính prompt đó, nên nó vừa vượt trần 4000 ký tự của DTO ("prompt must be shorter than
 * or equal to 4000 characters"), vừa bị nối chồng thêm một bản nữa. Đo thật trên sản xuất: một
 * build ra 4568 ký tự với khối bộ site xuất hiện HAI lần.
 *
 * Nay bối cảnh được ghép lúc CHẠY, nhưng hàm này vẫn phải sống: những build tạo trước đó đang
 * mang prompt đã phình, và người dùng bấm "Chạy lại" trên chúng thì phải chạy được.
 */
export function cleanSuitePrompt(prompt: string): string {
  let out = prompt;
  for (const marker of SYSTEM_BLOCKS) {
    const i = out.indexOf(marker);
    if (i >= 0) out = out.slice(0, i);
  }
  return out.trimEnd();
}

/**
 * Thứ tự MẶT TIỀN của một bộ site: website → cổng khách hàng → khu quản trị → API.
 *
 * Dùng ở hai chỗ và phải là MỘT danh sách: lúc tạo bộ (chọn site đại diện) và lúc xoá một site
 * (trao lại vai đại diện cho ai). Hai bản sao lệch nhau thì bộ site đổi "mặt" sau một lần xoá,
 * mà không ai hiểu vì sao.
 *
 * Vì sao thứ tự này: site đại diện là cái DUY NHẤT hiện thành thẻ trong "Website của tôi", nên
 * nó phải là chỗ có gì đó xem được — không phải trang chỉ mục endpoint của API.
 */
export const THU_TU_MAT_TIEN: readonly SiteSurface[] = ['site', 'portal', 'cms', 'api'];

/**
 * Sau khi site đại diện của một bộ bị xoá, ai lên thay?
 *
 * Vì sao phải có ai đó lên thay, chứ không để bộ không có đại diện: danh sách app chỉ hiện những
 * app `suiteId = null` HOẶC `suitePrimary = true` (xem apps.service). Bộ mất đại diện thì các
 * site còn lại BIẾN MẤT khỏi danh sách — chúng vẫn tồn tại, vẫn tính vào hạn mức, nhưng người
 * dùng không còn đường nào mở chúng ra. Và khi một tầng hỏng thì `releaseSuite` đánh hỏng các
 * tầng sau kèm lời khuyên "Hãy chạy lại site đó trước, rồi dựng lại các site này" — lời khuyên
 * đúng, nhưng không làm theo được nếu site cần chạy lại cũng đang ẩn khỏi danh sách.
 *
 * Đo ngày 23/09/2026 trên một tài khoản thực: xoá site đại diện lúc 04:29:42 để lại ba site
 * api/cms/portal mồ côi — không dựng được, không nhìn thấy, không xoá được.
 *
 * Trả `null` khi bộ không còn ai — lúc đó không có gì để làm.
 */
export function chonDaiDienMoi(
  conLai: readonly { id: string; surface?: string | null }[],
): string | null {
  if (!conLai.length) return null;
  for (const sf of THU_TU_MAT_TIEN) {
    const ung = conLai.find((a) => a.surface === sf);
    if (ung) return ung.id;
  }
  // Mặt lạ (bộ về sau có thêm vai mới) — vẫn phải có đại diện, lấy cái đầu tiên.
  return conLai[0]!.id;
}

/**
 * Các TẦNG phụ thuộc của một bộ site: chạy lần lượt theo tầng, trong một tầng thì song song.
 *
 * API trước, vì mọi mặt còn lại đọc hợp đồng dữ liệu của nó; rồi website mặt tiền, vì khi bộ sinh ra
 * từ một lệnh sao chép thì đó là nơi DUY NHẤT nhìn thấy trang gốc và chuyền bản sắc sang; cuối cùng
 * backoffice và cổng khách hàng, hai cái này không phụ thuộc nhau.
 *
 * MỘT danh sách dùng chung cho cả ba đường: tạo bộ, dựng lại bộ, và dựng lại hàng chờ từ CSDL khi
 * bản ghi trong RAM đã mất (xem `PipelineService.releaseSuite`). Ba bản sao lệch nhau thì thứ tự
 * phụ thuộc đổi tùy đường đi, mà không ai hiểu vì sao.
 */
export const THU_TU_TANG: readonly (readonly SiteSurface[])[] = [['api'], ['site'], ['cms', 'portal']];

/**
 * Xếp các build của một bộ thành tầng để đưa vào hàng chờ.
 *
 * `layId(mặt)` trả về id của việc cần làm cho mặt đó, hoặc `undefined` nếu bộ không có mặt đó.
 * Trả `tangDau` (chạy ngay) và `tangSau` (mở khóa lần lượt sau đó), đã bỏ các tầng rỗng.
 */
export function xepTangBo<T>(layId: (mat: SiteSurface) => T | undefined): {
  tangDau: T | undefined;
  tangSau: T[][];
} {
  const tang = THU_TU_TANG.map((nhom) => nhom.map(layId).filter((x): x is T => x !== undefined));
  const [dau, ...sau] = tang;
  return { tangDau: dau?.[0], tangSau: sau.filter((t) => t.length) };
}
