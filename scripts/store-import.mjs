#!/usr/bin/env node
/**
 * NHẬP DANH MỤC CỬA HÀNG — hệ B (portal) ➜ hệ A (nền tảng). Giai đoạn 2 của
 * docs/hop-nhat-cua-hang-va-nen-tang.md.
 *
 * Giai đoạn 1 để /store đọc nhờ API của portal mỗi lần có người xem. Script này chuyển danh mục
 * về nằm hẳn trong bảng `Listing` / `Inventory` của hệ A, để hệ A tự bán được mà không phải hỏi
 * hệ B từng lượt.
 *
 * ── CHẠY Ở ĐÂU ──────────────────────────────────────────────────────────────────────────────
 * Trên MÁY CHỦ. Đó là chỗ duy nhất có .env của cả hai hệ và có cả hai Postgres nghe ở 127.0.0.1
 * (hệ A cổng 5433, hệ B cổng 5432 — không cái nào mở ra ngoài):
 *
 *     cd /home/app/toolswave && node scripts/store-import.mjs --kind=sourcecode
 *     cd /home/app/toolswave && node scripts/store-import.mjs --kind=sourcecode --that-su-ghi
 *
 * Chạy từ máy cá nhân chỉ được nếu bạn tự mở đường tới cả hai cơ sở dữ liệu. Mặc định là không,
 * và như thế là đúng.
 *
 * ── CẦN BIẾN MÔI TRƯỜNG NÀO ─────────────────────────────────────────────────────────────────
 *   DATABASE_URL       Postgres hệ A — ĐÍCH ghi. Lấy từ /home/app/toolswave/.env.
 *   DATABASE_URL_HE_B  Postgres hệ B — NGUỒN đọc. Bỏ trống thì script tự lấy `DATABASE_URL`
 *                      trong .env của hệ B (HE_B_DIR/.env). Hai biến KHÔNG bao giờ được trùng
 *                      nhau — script dừng nếu trùng, vì ghi nhầm vào cơ sở dữ liệu nguồn là thứ
 *                      không lùi lại được bằng một lệnh.
 *   JWT_SECRET         Khoá mã hoá của hệ A. Cùng khoá `App.secretsEnc` đang dùng. Sai khoá thì
 *                      script vẫn chạy trơn tru và ghi ra một đống ô mã hoá KHÔNG AI GIẢI ĐƯỢC —
 *                      lấy đúng từ .env của hệ A, đừng gõ tay.
 *   PORTAL_PUBLIC_URL  Gốc để đưa ảnh tương đối của portal (`/products/x.png`) về địa chỉ đầy đủ.
 *                      Bắt buộc khi dữ liệu còn ảnh tương đối — xem chú thích ở `diaChiDayDu()`.
 *   HE_B_DIR           Thư mục kho hệ B trên máy chủ. Mặc định /var/www/toolswave/backend.
 *
 * ── CÁCH LÙI LẠI ────────────────────────────────────────────────────────────────────────────
 * 1. Trước lần ghi thật đầu tiên: `pg_dump` hệ A. Mọi thứ dưới đây là phương án hai.
 * 2. Mỗi bản ghi script tạo ra đều mang `legacyId` (id bên hệ B); bản ghi do người nhập tay ở hệ A
 *    thì không. Nên lùi lại là xoá đúng những dòng có `legacyId`:
 *
 *        DELETE FROM "Inventory" WHERE "legacyId" IS NOT NULL;
 *        DELETE FROM "Listing"   WHERE "legacyId" IS NOT NULL AND "kind" = 'sourcecode';
 *
 * 3. Chỉ lùi được khi hệ A CHƯA bán gì. Sau khi có đơn thì đừng xoá `Listing`: `OrderItem.listingId`
 *    là `SetNull`, đơn cũ sẽ sống sót nhưng mất đường trỏ về món đã bán, và không có cách dựng lại.
 *    Lúc đó sửa từng dòng, không xoá cả mẻ.
 *
 * ── VÌ SAO ĐỌC THẲNG POSTGRES, KHÔNG GỌI API CỦA PORTAL ─────────────────────────────────────
 * Ba tuyến công khai của portal đã CỐ Ý cắt đúng những trường việc nhập này cần: `driveLink`,
 * `zipFileUrl`, `gitlabRepoId`, `priceCost` (bịt lỗ rò ngày 23/09/2026, commit 21d40d1 bên kho
 * toolswave-workspace), và chúng ép `status = ACTIVE` nên hàng HIDDEN biến mất lặng lẽ — nhập qua
 * đó là mất hàng mà bảng đối chiếu vẫn xanh. Đọc thẳng cơ sở dữ liệu là cách duy nhất thấy đủ.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(import.meta.url);

// ── Tham số ───────────────────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const co = (ten) => argv.includes(ten);
const giaTri = (ten) => {
  const t = argv.find((a) => a.startsWith(`${ten}=`));
  return t ? t.slice(ten.length + 1) : null;
};

/**
 * Mặc định là XEM TRƯỚC. Phải gõ hẳn `--that-su-ghi` mới ghi — không phải vì người chạy hay quên,
 * mà vì `Inventory` là tài khoản và khoá bản quyền của khách đã trả tiền: một lần ghi sai không
 * hiện ra ngay, nó hiện ra lúc có người nhận nhầm hàng của người khác.
 */
const GHI = co('--that-su-ghi');
const LOAI_LOC = giaTri('--kind');
const HE_B_DIR = giaTri('--he-b-dir') ?? process.env.HE_B_DIR ?? '/var/www/toolswave/backend';

const TRO_GIUP = `
Nhập danh mục cửa hàng từ hệ B (portal) sang hệ A (nền tảng).

  node scripts/store-import.mjs [--kind=<loại>] [--that-su-ghi] [--he-b-dir=<đường dẫn>]

  --kind=<loại>     software | document | sourcecode. Bỏ trống = cả ba.
  --that-su-ghi     GHI THẬT. Không có cờ này thì chỉ xem trước, không đụng cơ sở dữ liệu đích.
  --he-b-dir=<..>   Thư mục kho hệ B (để tìm .env và gói pg/prisma của nó).
                    Mặc định /var/www/toolswave/backend, đổi được bằng biến HE_B_DIR.
  --help            Bản này.

Chạy TRÊN MÁY CHỦ, nơi có .env của cả hai hệ. Cần DATABASE_URL (hệ A, đích),
DATABASE_URL_HE_B (hệ B, nguồn — tự lấy từ .env của hệ B nếu bỏ trống), JWT_SECRET (khoá mã hoá
hệ A) và PORTAL_PUBLIC_URL (gốc ảnh của portal).

Chạy được nhiều lần: mỗi bản ghi khớp theo (kind, legacyId), không nhân đôi.
Cách lùi lại: xem khối chú thích đầu tệp này.
`.trim();

if (co('--help') || co('-h')) {
  console.log(TRO_GIUP);
  process.exit(0);
}

/** Ba loại hàng hệ B có. `app` / `tool` / `service` sinh ra ở hệ A, không có gì để nhập. */
const LOAI_CO_THAT = ['software', 'document', 'sourcecode'];
if (LOAI_LOC && !LOAI_CO_THAT.includes(LOAI_LOC)) {
  console.error(`✗ --kind=${LOAI_LOC} không có ở hệ B. Chọn: ${LOAI_CO_THAT.join(' | ')}`);
  process.exit(2);
}
const DANH_SACH_LOAI = LOAI_LOC ? [LOAI_LOC] : LOAI_CO_THAT;

// ── Cấu hình: gộp process.env với .env của hai hệ, KHÔNG cho chúng giẫm lên nhau ───────────────

function docEnv(tep) {
  const ra = {};
  if (!tep || !existsSync(tep)) return ra;
  for (const dong of readFileSync(tep, 'utf8').split('\n')) {
    const m = dong.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) ra[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return ra;
}

const envA = {
  // Ưu tiên biến đã có trong môi trường, rồi mới tới tệp — để chạy thử trỏ sang bản sao được.
  ...docEnv('/home/app/toolswave/.env'),
  ...docEnv(path.join(ROOT, '.env')),
  ...docEnv(path.join(ROOT, 'apps', 'api', '.env')),
  ...process.env,
};
// .env của hệ B đọc vào một túi RIÊNG và chỉ lấy đúng một biến ra. Trộn chung hai túi là cách
// nhanh nhất để `DATABASE_URL` của hệ B thắng và script ghi thẳng vào cơ sở dữ liệu nguồn.
const envB = docEnv(path.join(HE_B_DIR, '.env'));

const URL_DICH = envA.DATABASE_URL ?? '';
const URL_NGUON = envA.DATABASE_URL_HE_B ?? envB.DATABASE_URL ?? '';
const KHOA = envA.JWT_SECRET ?? '';
const GOC_ANH = (envA.PORTAL_PUBLIC_URL ?? '').replace(/\/+$/, '');

function dung(thongDiep) {
  console.error(`✗ ${thongDiep}`);
  process.exit(2);
}

if (!URL_DICH) dung('thiếu DATABASE_URL (Postgres của hệ A — nơi GHI). Chạy trên máy chủ, hoặc đặt biến.');
if (!URL_NGUON)
  dung(
    `thiếu DATABASE_URL_HE_B (Postgres của hệ B — nơi ĐỌC), và không thấy ${path.join(HE_B_DIR, '.env')}`,
  );
if (!KHOA) dung('thiếu JWT_SECRET — không có khoá thì không mã hoá được kho hàng và đường giao hàng.');
if (URL_DICH === URL_NGUON)
  dung('DATABASE_URL và DATABASE_URL_HE_B trỏ vào CÙNG một cơ sở dữ liệu. Dừng trước khi kịp ghi đè.');

/** Che mật khẩu khi in địa chỉ cơ sở dữ liệu ra màn hình / log. */
function cheMatKhau(u) {
  try {
    const x = new URL(u);
    return `${x.protocol}//${x.username ? `${x.username}@` : ''}${x.host}${x.pathname}`;
  } catch {
    return '(không đọc được)';
  }
}

// ── Mã hoá ────────────────────────────────────────────────────────────────────────────────────

/**
 * Bản sao của apps/api/src/common/secret-crypto.ts.
 *
 * Chép chứ không nhập: tệp kia là TypeScript trong ứng dụng NestJS, script .mjs nạp thẳng không
 * được, mà dựng cả một bước biên dịch cho một việc chạy vài lần thì đắt hơn phần nó tiết kiệm.
 * Cái giá phải trả: HAI chỗ phải khớp nhau TỪNG BYTE. Nếu bên kia đổi (ví dụ đổi "v1:" hay đổi
 * cách dẫn xuất khoá), ô mã hoá do script này ghi ra sẽ không giải được — và sẽ không ai biết cho
 * tới lúc có người mua hàng. `tuKiemMaHoa()` ngay dưới đây bắt phần lớn kiểu trôi đó.
 */
function khoaTu(secret) {
  return createHash('sha256').update(`tw-secrets:${secret}`).digest();
}

function maHoa(obj, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', khoaTu(secret), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${data.toString('base64')}`;
}

function giaiMa(blob, secret) {
  if (!blob) return null;
  try {
    const [v, ivB, tagB, dataB] = blob.split(':');
    if (v !== 'v1' || !ivB || !tagB || !dataB) return null;
    const d = createDecipheriv('aes-256-gcm', khoaTu(secret), Buffer.from(ivB, 'base64'));
    d.setAuthTag(Buffer.from(tagB, 'base64'));
    const ra = Buffer.concat([d.update(Buffer.from(dataB, 'base64')), d.final()]);
    return JSON.parse(ra.toString('utf8'));
  } catch {
    return null;
  }
}

function tuKiemMaHoa() {
  const mau = { driveLink: 'https://x/y', gitlabRepoId: 7 };
  const blob = maHoa(mau, KHOA);
  const lai = giaiMa(blob, KHOA);
  if (!blob.startsWith('v1:') || JSON.stringify(lai) !== JSON.stringify(mau))
    dung('tự kiểm mã hoá HỎNG — dừng trước khi ghi ra thứ không giải được.');
}

// ── Nguồn: hệ B ───────────────────────────────────────────────────────────────────────────────

/**
 * Một lớp mỏng để chạy SQL trên hệ B, có hai đường xuống:
 *
 *  1. Gói `pg` — nếu có ở đâu đó quanh đây (kho hệ A không cài, kho hệ B thì tuỳ lúc).
 *  2. Một Prisma client ĐÃ SINH bất kỳ tìm được, dùng `$queryRawUnsafe` như một đường Postgres
 *     thuần — ưu tiên client của hệ B, nhưng client của hệ A cũng chạy được (xem chú thích trong
 *     thân hàm). Đo ngày 24/09/2026: kho này KHÔNG có `pg`, nên đường 2 mới là đường thật.
 *
 * Cả hai chạy CÙNG một câu SQL, nên không có đường nào "chỉ hỏng ở một driver". Không dùng model
 * của Prisma hệ B (`prisma.softwareAccount.findMany`) vì như vậy là hai cách đọc khác nhau phải
 * kiểm hai lần. Khác biệt duy nhất còn lại: `pg` trả Decimal thành CHUỖI, Prisma trả đối tượng
 * Decimal — `tienVnd()` nuốt được cả hai.
 *
 * SQL trong tệp này là hằng số, không ghép chuỗi từ tham số dòng lệnh, nên `Unsafe` ở đây chỉ có
 * nghĩa "không tham số hoá", không có nghĩa "nhận dữ liệu từ ngoài".
 */
async function moNguon(url) {
  const noiTim = [ROOT, path.join(ROOT, 'apps', 'api'), HE_B_DIR, process.cwd()];
  const vuong = [];

  try {
    const { Client } = req(req.resolve('pg', { paths: noiTim }));
    const c = new Client({ connectionString: url });
    await c.connect();
    return { ten: 'pg', truyVan: async (sql) => (await c.query(sql)).rows, dong: () => c.end() };
  } catch (e) {
    vuong.push(`pg: ${e.message.split('\n')[0]}`);
  }

  try {
    // Prisma client NÀO cũng được — kể cả client sinh từ lược đồ hệ A. `$queryRawUnsafe` chỉ là
    // một đường Postgres, nó không soi lược đồ mà client được sinh ra từ đó; thứ quyết định đọc
    // vào cơ sở dữ liệu nào là `url` truyền tường minh ngay dưới đây. Ưu tiên client của hệ B vì
    // nếu kho hệ B có mặt thì phiên bản driver của nó là thứ đã chạy thật với Postgres đó.
    const duong = req.resolve('@prisma/client', { paths: [HE_B_DIR, ...noiTim] });
    const mod = req(duong);
    let c;
    try {
      c = new mod.PrismaClient({ datasourceUrl: url });
    } catch {
      c = new mod.PrismaClient({ datasources: { db: { url } } });
    }
    await c.$connect();
    return {
      ten: `prisma (${path.relative(ROOT, duong).startsWith('..') ? duong : path.relative(ROOT, duong)})`,
      truyVan: (sql) => c.$queryRawUnsafe(sql),
      dong: () => c.$disconnect(),
    };
  } catch (e) {
    vuong.push(`prisma: ${e.message.split('\n')[0]}`);
  }

  dung(`không mở được cơ sở dữ liệu NGUỒN.\n  ${vuong.join('\n  ')}`);
}

// ── Đích: hệ A ────────────────────────────────────────────────────────────────────────────────

async function moDich(url) {
  let mod;
  try {
    mod = req(req.resolve('@prisma/client', { paths: [path.join(ROOT, 'apps', 'api'), ROOT] }));
  } catch (e) {
    dung(`không thấy Prisma client của hệ A: ${e.message.split('\n')[0]}`);
  }
  // PrismaClient đọc process.env.DATABASE_URL khi khởi tạo. Đặt thẳng vào đó thay vì truyền tuỳ
  // chọn: cách này giống hệt lúc API chạy thật, nên không có khả năng "script nối đúng, API nối sai".
  process.env.DATABASE_URL = url;
  const c = new mod.PrismaClient();
  if (!c.listing || !c.inventory)
    dung(
      'Prisma client của hệ A chưa có bảng Listing/Inventory — lược đồ giai đoạn 2 chưa được sinh lại.\n' +
        '  Chạy: pnpm --filter api exec prisma generate',
    );
  await c.$connect();
  return c;
}

// ── Chuyển kiểu ───────────────────────────────────────────────────────────────────────────────

const chuoi = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

/**
 * Decimal(15,2) của hệ B → Int VND của hệ A.
 *
 * Portal trả "100000.00" (chuỗi qua JSON, đối tượng Decimal qua Prisma). Lược đồ hệ A để giá là
 * Int cho khớp `Payment.amountVnd`; VND không có phần lẻ nên làm tròn ở đây là đúng chỗ, làm tròn
 * ở tầng hiển thị mới là sai.
 */
function tienVnd(v) {
  const n = Number(String(v ?? '0'));
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

/** jsonb `string[]` — pg và Prisma đều trả về mảng đã phân tích; chuỗi thô chỉ là phòng xa. */
function mangChuoi(v) {
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string' && x.trim() !== '');
  if (typeof v === 'string') {
    try {
      return mangChuoi(JSON.parse(v));
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Ảnh của portal về địa chỉ ĐẦY ĐỦ.
 *
 * Hệ B lưu `/products/sheet1/x.png` — tương đối với chính portal. Ở giai đoạn 1, `store.service.ts`
 * vá lúc đọc (`abs()`); giai đoạn 2 bộ đọc mới lấy thẳng từ bảng nên nếu nhập nguyên đường tương
 * đối thì trình duyệt hiểu là `https://toolswave.net/products/…` và nhận 404 — đúng con bọ đã đo
 * ngày 23/09/2026, 6 ảnh hỏng trên /store. Vá ở ĐÂY, một lần, lúc nhập.
 *
 * Đường đã đầy đủ thì để nguyên: portal có thể chuyển sang CDN bất cứ lúc nào mà không báo bên này.
 */
function diaChiDayDu(u, thieu) {
  const s = chuoi(u);
  if (!s) return null;
  if (/^(https?:)?\/\//i.test(s) || s.startsWith('data:')) return s;
  if (!GOC_ANH) {
    thieu.push(s);
    return s;
  }
  return `${GOC_ANH}/${s.replace(/^\/+/, '')}`;
}

/**
 * So sánh JSON phải CHUẨN HOÁ thứ tự khoá: Postgres `jsonb` sắp lại khoá khi lưu, nên đọc ra sẽ
 * không cùng thứ tự với đối tượng script vừa dựng. Không chuẩn hoá thì mỗi lần chạy đều báo
 * "lệch detail" và script sẽ ghi lại toàn bộ bảng mỗi lần, mãi mãi.
 *
 * Mảng GIỮ NGUYÊN thứ tự — với `gallery` thì thứ tự ảnh là dữ liệu, không phải chi tiết kỹ thuật.
 */
function onDinh(v) {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return `[${v.map(onDinh).join(',')}]`;
  if (typeof v === 'object')
    return `{${Object.keys(v)
      .sort()
      .filter((k) => v[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${onDinh(v[k])}`)
      .join(',')}}`;
  return JSON.stringify(v);
}

// ── Ánh xạ từng loại hàng ─────────────────────────────────────────────────────────────────────

/** Trạng thái hệ B → hệ A. `OUT_OF_STOCK` là khái niệm riêng của phần mềm (hết suất trong kho). */
const TRANG_THAI = { ACTIVE: 'active', HIDDEN: 'hidden', OUT_OF_STOCK: 'sold_out' };

/**
 * Ba câu SELECT — liệt kê cột TƯỜNG MINH, không `SELECT *`.
 *
 * `price_cost` (giá vốn) CỐ Ý không có mặt: lược đồ hệ A không có cột nào cho nó, chỗ duy nhất
 * "tiện" để nhét là `detail` — mà `detail` đi thẳng ra API công khai, tức là mở lại đúng lỗ rò
 * vừa bịt bên portal. Kế toán ở lại hệ B (quyết định 3, mục 12 của kế hoạch), nên không đọc lên
 * ngay từ đầu là cách chắc chắn nhất để nó không lọt ra.
 */
const NGUON_SQL = {
  software: `
    SELECT id, name, slug, category, description, description_short, thumbnail_url,
           price_retail, inventory_type, total_sold, status, created_at, updated_at
    FROM tbl_software_accounts ORDER BY created_at`,
  document: `
    SELECT id, name, slug, category, file_type, description, description_short, thumbnail_url,
           preview_urls, drive_link, notes_internal, price, total_sold, status,
           created_at, updated_at
    FROM tbl_documents ORDER BY created_at`,
  sourcecode: `
    SELECT id, name, slug, version, category, description, description_short, spec_document,
           thumbnail_url, gallery_urls, languages, prerequisites, gitlab_repo_id, zip_file_url,
           price, total_sold, status, created_at, updated_at
    FROM tbl_source_codes ORDER BY created_at`,
};

const KHO_SQL = `
  SELECT id, software_id, data, status, order_id, sold_at, created_at
  FROM tbl_software_inventory ORDER BY created_at`;

/**
 * Một dòng của hệ B → hình dạng sẵn sàng ghi vào `Listing`.
 *
 * `delivery` tách RIÊNG khỏi `detail` và sẽ đi vào cột mã hoá `deliveryEnc`. Đây là quyết định 1
 * ở đầu khối cửa hàng trong schema.prisma, và nó chỉ đứng vững nếu chỗ nào cũng giữ: ở đây,
 * `driveLink` / `zipFileUrl` / `gitlabRepoId` không bao giờ được chạm vào `detail`.
 */
function anhXa(kind, r, thieuGoc) {
  const chung = {
    legacyId: String(r.id),
    slug: chuoi(r.slug),
    name: chuoi(r.name) ?? chuoi(r.slug) ?? '(không tên)',
    descriptionShort: chuoi(r.description_short),
    description: chuoi(r.description),
    thumbnailUrl: diaChiDayDu(r.thumbnail_url, thieuGoc),
    category: chuoi(r.category),
    status: TRANG_THAI[String(r.status)] ?? 'hidden',
    totalSold: Number(r.total_sold ?? 0) || 0,
    createdAt: r.created_at ? new Date(r.created_at) : new Date(),
    // Ngày sửa của NGUỒN vào cột riêng. `updatedAt` của hệ A do Prisma tự đặt (@updatedAt) và
    // không giữ được — nếu để mặt tiền đọc nó thì sau đợt nhập, cả danh mục mang chung một ngày
    // và mục "Mới cập nhật" mất nghĩa. Xem chú thích cột `sourceUpdatedAt` trong schema.prisma.
    sourceUpdatedAt: r.updated_at ? new Date(r.updated_at) : null,
    notesInternal: null,
    gallery: [],
    detail: {},
    delivery: null,
  };

  if (kind === 'software') {
    // Phần mềm không có đường giao hàng ở mức món: thứ giao cho khách nằm trong từng suất
    // `Inventory`, mỗi suất một tài khoản. `availableCount` CỐ Ý không nhập vào `detail` — nó là
    // số suy ra, sẽ sai ngay khi bán được một suất; bộ đọc giai đoạn 2 đếm `Inventory` là ra đúng.
    chung.priceVnd = tienVnd(r.price_retail);
    const it = chuoi(r.inventory_type);
    if (it) chung.detail.inventoryType = it;
  }

  if (kind === 'document') {
    chung.priceVnd = tienVnd(r.price);
    const ft = chuoi(r.file_type);
    if (ft) chung.detail.fileType = ft;
    chung.gallery = mangChuoi(r.preview_urls).map((u) => diaChiDayDu(u, thieuGoc));
    // `notes_internal` của hệ B về đúng cột `notesInternal` — cột này không có đường nào ra API.
    chung.notesInternal = chuoi(r.notes_internal);
    const drive = chuoi(r.drive_link);
    if (drive) chung.delivery = { driveLink: drive };
  }

  if (kind === 'sourcecode') {
    chung.priceVnd = tienVnd(r.price);
    chung.gallery = mangChuoi(r.gallery_urls).map((u) => diaChiDayDu(u, thieuGoc));
    chung.detail.languages = mangChuoi(r.languages);
    chung.detail.version = chuoi(r.version);
    chung.detail.prerequisites = chuoi(r.prerequisites);
    chung.detail.specDocument = chuoi(r.spec_document);
    const giao = {};
    if (chuoi(r.zip_file_url)) giao.zipFileUrl = chuoi(r.zip_file_url);
    if (r.gitlab_repo_id !== null && r.gitlab_repo_id !== undefined)
      giao.gitlabRepoId = Number(r.gitlab_repo_id);
    if (Object.keys(giao).length) chung.delivery = giao;
  }

  return chung;
}

/**
 * Những chỗ bản ghi đích KHÁC bản đã ánh xạ từ nguồn. Trả về danh sách TÊN TRƯỜNG chứ không phải
 * true/false: lúc một dòng "không chịu" cập nhật, biết nó lệch ở trường nào là khác hẳn với biết
 * rằng nó lệch.
 *
 * `deliveryEnc` so bằng cách GIẢI MÃ rồi so nội dung, không so chuỗi mã hoá: AES-GCM dùng IV ngẫu
 * nhiên nên hai lần mã hoá cùng một nội dung ra hai chuỗi khác nhau. So chuỗi thì mọi dòng đều
 * "lệch" mỗi lần chạy.
 */
function soSanh(dich, m, daBanOHeA) {
  const lech = [];
  for (const k of ['slug', 'name', 'descriptionShort', 'description', 'thumbnailUrl', 'category', 'status'])
    if ((dich[k] ?? null) !== (m[k] ?? null)) lech.push(k);
  if (dich.priceVnd !== m.priceVnd) lech.push('priceVnd');
  if ((dich.notesInternal ?? null) !== (m.notesInternal ?? null)) lech.push('notesInternal');
  if (onDinh(dich.gallery ?? []) !== onDinh(m.gallery)) lech.push('gallery');
  if (onDinh(dich.detail ?? {}) !== onDinh(m.detail)) lech.push('detail');
  if (onDinh(giaiMa(dich.deliveryEnc, KHOA)) !== onDinh(m.delivery)) lech.push('deliveryEnc');
  // `totalSold` chỉ theo hệ B khi món đó CHƯA bán lần nào ở hệ A. Sau giai đoạn 3, hệ A bán được
  // thì con số của nó mới là con số đúng; đè bằng số của hệ B là xoá trắng doanh số của chính mình.
  if (!daBanOHeA && dich.totalSold !== m.totalSold) lech.push('totalSold');
  return lech;
}

function duLieuGhi(m, kemDelivery) {
  const d = {
    slug: m.slug,
    name: m.name,
    descriptionShort: m.descriptionShort,
    description: m.description,
    thumbnailUrl: m.thumbnailUrl,
    gallery: m.gallery,
    priceVnd: m.priceVnd,
    category: m.category,
    status: m.status,
    detail: m.detail,
    notesInternal: m.notesInternal,
  };
  // Chỉ mã hoá lại khi nội dung thực sự đổi: mỗi lần mã hoá sinh một chuỗi mới, ghi lại vô cớ làm
  // `updatedAt` nhảy và làm mọi bản sao lưu khác nhau ở những dòng chẳng có gì đổi.
  if (kemDelivery) d.deliveryEnc = m.delivery ? maHoa(m.delivery, KHOA) : null;
  return d;
}

/** Lý do một dòng không ghi được, nói bằng tiếng người. */
function lyDoLoi(e, m) {
  if (e?.code === 'P2002') {
    const trg = e.meta?.target;
    const ten = Array.isArray(trg) ? trg.join('+') : String(trg ?? '');
    if (ten.includes('slug'))
      return `trùng slug "${m.slug}" với một bản ghi khác cùng loại ở hệ A (không phải bản nhập từ hệ B)`;
    return `đụng ràng buộc duy nhất ${ten}`;
  }
  return (e?.message ?? String(e)).split('\n')[0].slice(0, 160);
}

// ── Nhập một loại hàng ────────────────────────────────────────────────────────────────────────

async function nhapLoai(prisma, nguon, kind) {
  const thieuGoc = [];
  const rows = await nguon.truyVan(NGUON_SQL[kind]);
  const mapped = [];
  const boQua = [];

  for (const r of rows) {
    const m = anhXa(kind, r, thieuGoc);
    if (!m.slug) {
      boQua.push({ ten: String(r.id), ly: 'không có slug — /store/<kind>/<slug> sẽ không có đường vào' });
      continue;
    }
    if (m.priceVnd === null) {
      boQua.push({ ten: m.slug, ly: 'giá không đọc được thành số' });
      continue;
    }
    mapped.push(m);
  }

  if (thieuGoc.length)
    dung(
      `${thieuGoc.length} ảnh của ${kind} là đường TƯƠNG ĐỐI mà thiếu PORTAL_PUBLIC_URL.\n` +
        `  Ví dụ: ${thieuGoc.slice(0, 3).join(', ')}\n` +
        '  Nhập nguyên đường tương đối là dựng lại con bọ ảnh 404 đã sửa hôm 23/09. Đặt biến rồi chạy lại.',
    );

  // Ảnh chụp TRƯỚC khi ghi — để biết dòng nào là tạo mới, dòng nào là cập nhật, mà không phải tin
  // vào biến đếm trong vòng lặp.
  const truoc = await docDich(prisma, kind);
  const keHoach = { tao: [], capNhat: [], yNguyen: [] };
  for (const m of mapped) {
    const d = truoc.get(m.legacyId);
    if (!d) keHoach.tao.push(m);
    else if (soSanh(d, m, d.daBanOHeA).length) keHoach.capNhat.push(m);
    else keHoach.yNguyen.push(m);
  }

  // Ở đích mà nguồn không còn: hàng đã bị xoá bên hệ B. Script KHÔNG tự xoá — một món đã bán vẫn
  // phải đọc được tên và giá. Chỉ nêu ra để người ta tự quyết.
  const cungCapId = new Set(mapped.map((m) => m.legacyId));
  const moCoi = [...truoc.keys()].filter((id) => !cungCapId.has(id));

  if (GHI) {
    for (const m of mapped) {
      const d = truoc.get(m.legacyId);
      const lech = d ? soSanh(d, m, d.daBanOHeA) : null;
      if (d && lech.length === 0) continue;
      try {
        if (d) {
          const data = duLieuGhi(m, lech.includes('deliveryEnc'));
          if (d.daBanOHeA) delete data.totalSold;
          else data.totalSold = m.totalSold;
          await prisma.listing.update({ where: { id: d.id }, data });
        } else {
          await prisma.listing.create({
            data: {
              ...duLieuGhi(m, true),
              kind,
              legacyId: m.legacyId,
              totalSold: m.totalSold,
              // Giữ NGÀY TẠO của hệ B: "mới nhất" trên trang cửa hàng phải là mới nhất thật, không
              // phải "dòng nào script ghi sau". `updatedAt` thì không giữ được — Prisma tự đặt lại
              // ở mọi lượt ghi, nên sau đợt nhập nó là giờ nhập, không phải giờ sửa bên hệ B.
              createdAt: m.createdAt,
            },
          });
        }
      } catch (e) {
        boQua.push({ ten: m.slug, ly: lyDoLoi(e, m) });
      }
    }
  }

  // ĐỌC LẠI từ đích. Mục 11.6 của kế hoạch: đếm những gì mình đã sửa không bao giờ lộ ra thứ mình
  // quên sửa. Mọi con số trong bảng đối chiếu đi ra từ lần đọc này.
  const sau = GHI ? await docDich(prisma, kind) : truoc;
  const thieu = [];
  const conLech = [];
  if (GHI)
    for (const m of mapped) {
      const d = sau.get(m.legacyId);
      if (!d) {
        if (!boQua.some((b) => b.ten === m.slug)) thieu.push(m.slug);
        continue;
      }
      const l = soSanh(d, m, d.daBanOHeA);
      // `totalSold` lệch ở món đã bán tại hệ A là CỐ Ý giữ, không phải hỏng.
      const that = l.filter((x) => !(x === 'totalSold' && d.daBanOHeA));
      if (that.length) conLech.push(`${m.slug}: ${that.join(', ')}`);
    }

  return {
    ten: kind,
    nguon: rows.length,
    tao: GHI ? [...sau.keys()].filter((id) => !truoc.has(id)).length : keHoach.tao.length,
    capNhat: GHI
      ? keHoach.capNhat.filter((m) => sau.has(m.legacyId) && truoc.has(m.legacyId)).length
      : keHoach.capNhat.length,
    yNguyen: keHoach.yNguyen.length,
    boQua,
    thieu,
    conLech,
    moCoi,
    // Bảng tra cho bước nhập kho: legacyId của hệ B → id thật ở hệ A.
    idTheoLegacy: new Map([...sau.entries()].map(([k, v]) => [k, v.id])),
  };
}

/** Đọc mọi bản ghi của một loại đã từng nhập (có `legacyId`), kèm dấu hiệu "đã bán ở hệ A". */
async function docDich(prisma, kind) {
  const rows = await prisma.listing.findMany({
    where: { kind, legacyId: { not: null } },
    select: {
      id: true,
      legacyId: true,
      slug: true,
      name: true,
      descriptionShort: true,
      description: true,
      thumbnailUrl: true,
      gallery: true,
      priceVnd: true,
      category: true,
      status: true,
      totalSold: true,
      detail: true,
      deliveryEnc: true,
      notesInternal: true,
      _count: { select: { orderItems: true } },
    },
  });
  return new Map(rows.map((r) => [r.legacyId, { ...r, daBanOHeA: r._count.orderItems > 0 }]));
}

// ── Nhập kho hàng (chỉ phần mềm) ──────────────────────────────────────────────────────────────

/**
 * Mỗi dòng `tbl_software_inventory` là MỘT tài khoản hoặc MỘT khoá bản quyền — dữ liệu sống của
 * khách hàng, và là chỗ sai đắt nhất trong cả việc nhập này (mục 11.7 của kế hoạch).
 *
 * Hai luật, cả hai đều vì lý do đó:
 *
 *  1. `data` của hệ B nằm ở dạng CHỮ THƯỜNG trong cơ sở dữ liệu. Về đây nó phải mã hoá — không có
 *     chế độ "chép nguyên rồi tính sau".
 *  2. Suất nào đã gắn `orderItemId` ở hệ A (tức đã BÁN cho một người cụ thể) thì script KHÔNG
 *     chạm vào nữa, kể cả khi hệ B vẫn nói nó còn trống. Thiếu luật này, một lần chạy lại sẽ lật
 *     suất đã bán về `available` và món hàng đó sẽ được bán lần thứ hai cho người khác.
 */
async function nhapKho(prisma, nguon, idTheoLegacy) {
  const rows = await nguon.truyVan(KHO_SQL);
  const boQua = [];
  const mapped = [];

  for (const r of rows) {
    const listingId = idTheoLegacy.get(String(r.software_id));
    if (!listingId) {
      boQua.push({
        ten: String(r.id).slice(0, 8),
        ly: GHI
          ? 'món phần mềm chưa có ở hệ A (chạy --kind=software trước)'
          : 'món phần mềm chưa có ở hệ A — ở lượt XEM TRƯỚC thì đây là chuyện bình thường, danh mục chưa được ghi',
      });
      continue;
    }
    const data = r.data === null || r.data === undefined ? '' : String(r.data);
    if (!data.trim()) {
      boQua.push({ ten: String(r.id).slice(0, 8), ly: 'suất rỗng — không có gì để giao' });
      continue;
    }
    mapped.push({
      legacyId: String(r.id),
      listingId,
      // Mã hoá ĐÚNG chuỗi hệ B đang giữ, không tự tách thành {tài khoản, mật khẩu}: mỗi món nhập
      // tay một kiểu, đoán sai cấu trúc là giao cho khách một nửa thứ họ mua. `decryptJson<string>`
      // bên bộ giao hàng trả lại nguyên văn.
      data,
      status: { AVAILABLE: 'available', SOLD: 'sold', RESERVED: 'reserved' }[String(r.status)] ?? 'available',
      soldAt: r.sold_at ? new Date(r.sold_at) : null,
      createdAt: r.created_at ? new Date(r.created_at) : new Date(),
    });
  }

  const doc = async () => {
    const ds = await prisma.inventory.findMany({
      where: { legacyId: { not: null } },
      select: { id: true, legacyId: true, listingId: true, dataEnc: true, status: true, soldAt: true, orderItemId: true },
    });
    return new Map(ds.map((r) => [r.legacyId, r]));
  };

  const truoc = await doc();
  const khac = (d, m) => {
    if (d.orderItemId) return []; // đã bán ở hệ A — không so, không đụng
    const l = [];
    if (d.listingId !== m.listingId) l.push('listingId');
    if (d.status !== m.status) l.push('status');
    if (giaiMa(d.dataEnc, KHOA) !== m.data) l.push('dataEnc');
    if ((d.soldAt?.getTime() ?? null) !== (m.soldAt?.getTime() ?? null)) l.push('soldAt');
    return l;
  };

  const keHoach = { tao: [], capNhat: [] };
  let yNguyen = 0;
  for (const m of mapped) {
    const d = truoc.get(m.legacyId);
    if (!d) keHoach.tao.push(m);
    else if (d.orderItemId) boQua.push({ ten: m.legacyId.slice(0, 8), ly: 'đã bán ở hệ A — giữ nguyên, không ghi đè' });
    else if (khac(d, m).length) keHoach.capNhat.push(m);
    else yNguyen += 1;
  }

  if (GHI)
    for (const m of [...keHoach.tao, ...keHoach.capNhat]) {
      try {
        const d = truoc.get(m.legacyId);
        const lech = d ? khac(d, m) : ['*'];
        const data = { listingId: m.listingId, status: m.status, soldAt: m.soldAt };
        if (lech.includes('dataEnc') || !d) data.dataEnc = maHoa(m.data, KHOA);
        if (d) await prisma.inventory.update({ where: { id: d.id }, data });
        // `orderItemId` để trống: đơn hàng cũ của hệ B chưa được nhập (mảnh khác). Suất đã bán về
        // đây vẫn mang status='sold' nên không ai bán lại được nó; lúc nhập đơn thì nối lại theo
        // `legacyId` của suất và `tbl_software_inventory.order_id`.
        else await prisma.inventory.create({ data: { ...data, legacyId: m.legacyId, createdAt: m.createdAt } });
      } catch (e) {
        boQua.push({ ten: m.legacyId.slice(0, 8), ly: lyDoLoi(e, m) });
      }
    }

  const sau = GHI ? await doc() : truoc;
  const thieu = [];
  const conLech = [];
  if (GHI)
    for (const m of mapped) {
      const d = sau.get(m.legacyId);
      if (!d) {
        if (!boQua.some((b) => b.ten === m.legacyId.slice(0, 8))) thieu.push(m.legacyId.slice(0, 8));
        continue;
      }
      const l = khac(d, m);
      if (l.length) conLech.push(`${m.legacyId.slice(0, 8)}: ${l.join(', ')}`);
    }

  const coONguon = new Set(mapped.map((m) => m.legacyId));
  return {
    ten: 'software·kho',
    nguon: rows.length,
    tao: GHI ? [...sau.keys()].filter((id) => !truoc.has(id)).length : keHoach.tao.length,
    capNhat: GHI ? keHoach.capNhat.filter((m) => sau.has(m.legacyId) && truoc.has(m.legacyId)).length : keHoach.capNhat.length,
    yNguyen,
    boQua,
    thieu,
    conLech,
    moCoi: [...truoc.keys()].filter((id) => !coONguon.has(id)),
  };
}

// ── Bảng đối chiếu ────────────────────────────────────────────────────────────────────────────

function inBang(ketQua) {
  const cot = GHI
    ? ['loại', 'nguồn', 'đã tạo', 'đã cập nhật', 'y nguyên', 'bỏ qua', 'CÒN LỆCH', 'mồ côi']
    : ['loại', 'nguồn', 'sẽ tạo', 'sẽ cập nhật', 'y nguyên', 'bỏ qua', '—', 'mồ côi'];
  const dong = ketQua.map((k) => [
    k.ten,
    String(k.nguon),
    String(k.tao),
    String(k.capNhat),
    String(k.yNguyen),
    String(k.boQua.length),
    GHI ? String(k.conLech.length + k.thieu.length) : '—',
    String(k.moCoi.length),
  ]);
  const rong = cot.map((c, i) => Math.max(c.length, ...dong.map((d) => d[i].length)));
  const ke = (o) => o.map((v, i) => (i === 0 ? v.padEnd(rong[i]) : v.padStart(rong[i]))).join('  ');

  console.log('');
  console.log(
    GHI
      ? 'BẢNG ĐỐI CHIẾU — mọi con số ĐỌC LẠI từ cơ sở dữ liệu đích, không phải đếm trong vòng lặp.'
      : 'XEM TRƯỚC — chưa ghi gì. Thêm --that-su-ghi để ghi thật (và để có cột CÒN LỆCH).',
  );
  console.log('─'.repeat(rong.reduce((a, b) => a + b + 2, 0)));
  console.log(ke(cot));
  for (const d of dong) console.log(ke(d));
  console.log('');

  for (const k of ketQua) {
    if (k.boQua.length) {
      console.log(`bỏ qua · ${k.ten} (${k.boQua.length}):`);
      const nhom = new Map();
      for (const b of k.boQua) nhom.set(b.ly, [...(nhom.get(b.ly) ?? []), b.ten]);
      for (const [ly, ai] of nhom)
        console.log(`  ${ai.length.toString().padStart(4)} × ${ly}  — ví dụ: ${ai.slice(0, 3).join(', ')}`);
    }
    if (k.thieu.length) console.log(`KHÔNG THẤY Ở ĐÍCH · ${k.ten}: ${k.thieu.slice(0, 10).join(', ')}`);
    if (k.conLech.length) {
      console.log(`CÒN LỆCH SAU KHI GHI · ${k.ten} (${k.conLech.length}):`);
      for (const c of k.conLech.slice(0, 10)) console.log(`  ${c}`);
    }
    if (k.moCoi.length)
      console.log(
        `mồ côi · ${k.ten}: ${k.moCoi.length} bản ghi ở hệ A mà hệ B không còn. Script KHÔNG tự xoá — đơn cũ vẫn phải đọc được tên và giá.`,
      );
  }
}

// ── Chạy ──────────────────────────────────────────────────────────────────────────────────────

async function main() {
  tuKiemMaHoa();

  console.log(`nguồn (hệ B) : ${cheMatKhau(URL_NGUON)}`);
  console.log(`đích  (hệ A) : ${cheMatKhau(URL_DICH)}`);
  console.log(`loại         : ${DANH_SACH_LOAI.join(', ')}`);
  console.log(`chế độ       : ${GHI ? 'GHI THẬT' : 'xem trước (mặc định)'}`);

  const nguon = await moNguon(URL_NGUON);
  const prisma = await moDich(URL_DICH);
  console.log(`driver nguồn : ${nguon.ten}`);

  const ketQua = [];
  try {
    let idPhanMem = new Map();
    for (const kind of DANH_SACH_LOAI) {
      const k = await nhapLoai(prisma, nguon, kind);
      if (kind === 'software') idPhanMem = k.idTheoLegacy;
      ketQua.push(k);
    }
    // Kho hàng đi SAU danh mục: mỗi suất phải gắn vào một `Listing` đã có id thật ở hệ A.
    if (DANH_SACH_LOAI.includes('software')) ketQua.push(await nhapKho(prisma, nguon, idPhanMem));
  } finally {
    await nguon.dong().catch(() => {});
    await prisma.$disconnect().catch(() => {});
  }

  inBang(ketQua);

  const hong = ketQua.reduce((s, k) => s + k.conLech.length + k.thieu.length, 0);
  if (hong) {
    console.error(`\n✗ ${hong} bản ghi không khớp nguồn sau khi ghi. Đọc phần CÒN LỆCH ở trên trước khi chạy lại.`);
    process.exit(1);
  }
  if (!GHI) console.log('Chưa ghi gì. Thêm --that-su-ghi khi bảng trên đã đúng như mong đợi.');
}

main().catch((e) => {
  console.error(`✗ ${e?.stack ?? e}`);
  process.exit(1);
});
