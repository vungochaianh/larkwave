import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  Paginated,
  StoreFacet,
  StoreKind,
  StoreListing,
  StoreOverview,
  StoreSort,
} from '@larkwave/shared';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';

/** Nguồn danh mục đang phục vụ một loại hàng. Cùng tên với `StoreOverview.source`. */
type NguonHang = 'portal' | 'local';

/**
 * Một dòng `Listing` đã ĐƯỢC LỌC CỘT — hình dạng duy nhất mà tầng này nhìn thấy.
 *
 * Viết tay thay vì lấy kiểu suy ra từ Prisma là cố ý: nó khiến `deliveryEnc` và `notesInternal`
 * không tồn tại ở tầng kiểu, nên một lần "thêm cột cho tiện" sau này sẽ hỏng biên dịch ngay tại
 * chỗ nó được thêm, chứ không âm thầm chảy ra API công khai. Xem `CHON_TOM_TAT`.
 */
type DongListing = {
  slug: string;
  name: string;
  descriptionShort: string | null;
  /** Chỉ có ở truy vấn chi tiết — danh sách cố ý không kéo cột Text này về. */
  description?: string | null;
  thumbnailUrl: string | null;
  /** Json — phải ép kiểu, không được tin. */
  gallery: unknown;
  priceVnd: number;
  category: string | null;
  totalSold: number;
  /** Json — phải ép kiểu, không được tin. */
  detail: unknown;
  createdAt: Date;
  updatedAt: Date;
  sourceUpdatedAt?: Date | null;
  _count?: { inventory: number };
};

/**
 * Cửa hàng — HAI NGUỒN, MỘT HỢP ĐỒNG.
 *
 * Giai đoạn 1 danh mục nằm ở portal (hệ B) và tệp này chỉ đọc rồi chuẩn hoá. Giai đoạn 2 dữ liệu
 * dọn về bảng `Listing` của chính hệ này. Hai nguồn đó sống CẠNH NHAU ở đây, không thay thế nhau
 * bằng một lần sửa mã: xem `chonNguon`.
 *
 * Vì sao web không gọi thẳng portal mà đi vòng qua đây:
 *
 *  1. Hợp đồng `StoreListing` giữ nguyên khi nguồn đổi — chỉ mỗi tệp này biết dữ liệu đang nằm ở
 *     đâu, mọi trang web đứng yên. Đó chính là cái đang được dùng đến trong lúc này.
 *  2. Portal trả ba hình dạng khác nhau cho ba loại hàng (`{items,total,page}` với phần mềm và
 *     tài liệu, `{items,pagination:{...}}` với mã nguồn) và ba tên trường giá khác nhau. Chuẩn
 *     hoá một lần ở đây rẻ hơn ba lần ở giao diện.
 *  3. Portal để lộ vài trường KHÔNG được ra ngoài: `priceCost` (giá vốn) trong danh sách phần
 *     mềm, `zipFileUrl` + `gitlabRepoId` (đường giao hàng) và `driveLink` trong chi tiết. Cổng
 *     này chỉ chép ra những trường có trong `StoreListing`, nên không có gì lọt kể cả khi
 *     portal thêm trường mới. Xem `docs/hop-nhat-cua-hang-va-nen-tang.md`.
 *
 * Luật số 3 áp cho CẢ nguồn nội bộ, và ở đó nó còn quan trọng hơn: `Listing.deliveryEnc` giữ
 * driveLink/zipFileUrl/gitlabRepoId (đã mã hoá) và `Listing.notesInternal` giữ ghi chú quản trị.
 * Cả hai đều không nằm trong danh sách cột được `select`, nên chúng không bao giờ rời cơ sở dữ
 * liệu trên đường này. Đây đúng là lỗ rò đã bịt bên portal ngày 23/09/2026 — bịt một lần ở gốc
 * rồi vẫn giữ lớp thứ hai ở cổng, vì hai hệ phát hành độc lập nhau.
 *
 * Bộ nhớ đệm: mỗi loại hàng giữ TOÀN BỘ danh mục rồi lọc/sắp/phân trang tại chỗ. Danh mục hiện ở
 * quy mô vài trăm món nên đây là một lần gọi mỗi chu kỳ thay vì một lần mỗi lượt xem, và chuyên
 * mục đếm được CHÍNH XÁC (đếm trên toàn danh mục, không phải trên một trang). Khi danh mục vượt
 * `MAX_ITEMS` thì cũng là lúc dữ liệu đã nên nằm ở giai đoạn 2.
 */
@Injectable()
export class StoreService {
  private readonly logger = new Logger(StoreService.name);

  /** Loại hàng ĐỌC ĐƯỢC từ portal. Ba loại còn lại (`app`|`tool`|`service`) portal chưa từng bán. */
  private static readonly PORTAL_KINDS: readonly StoreKind[] = ['software', 'document', 'sourcecode'];

  /**
   * Loại hàng BÀY RA MẶT TIỀN. Cố ý hẹp hơn `PORTAL_KINDS`.
   *
   * Cửa hàng trên nền tảng chỉ bán MÃ NGUỒN: đó là thứ đứng cùng một câu chuyện với phần còn lại
   * của sản phẩm (dựng app, xem source, bàn giao repo), và là thứ người mua cần NGHIÊN CỨU trước
   * khi xuống tiền — nên trang phải cho lọc theo công nghệ, đọc đặc tả, xem ảnh. Tài khoản phần
   * mềm và tài liệu vẫn bán ở portal; đưa chúng lên đây chỉ làm loãng mặt tiền và kéo theo một
   * mô hình tồn kho không liên quan gì tới nền tảng.
   *
   * Khả năng đọc hai loại kia GIỮ NGUYÊN trong service (`detail`, `list` vẫn nhận `kind` của
   * chúng): giai đoạn 4 sẽ thêm `app` vào mặt tiền, và lúc đó có sẵn đường thì rẻ hơn dựng lại.
   */
  private static readonly SHOP_KINDS: readonly StoreKind[] = ['sourcecode'];

  private static readonly PORTAL_PATH: Record<string, string> = {
    software: '/shop/software',
    document: '/shop/documents',
    sourcecode: '/shop/sourcecode',
  };

  /**
   * Thời gian sống của bản đệm, KHÁC NHAU theo nguồn — và cố ý khác nhau.
   *
   * Portal là một cú nhảy HTTP sang hệ khác, có thể tốn tới 5 lượt gọi cho một loại hàng, nên 5
   * phút mua lại rất nhiều. Cơ sở dữ liệu là truy vấn tại chỗ, đệm dài ở đó gần như không mua
   * được gì mà lại phải trả một cái giá khó chịu: quản trị sửa giá trong CMS rồi tải lại trang
   * và thấy giá cũ — đúng kiểu hỏng khiến người ta nghĩ nút Lưu không chạy. 30 giây vẫn đủ nuốt
   * một cơn tải trang liên tiếp mà không làm việc sửa hàng thành ra đáng ngờ.
   */
  private static readonly TTL_MS: Record<NguonHang, number> = {
    portal: 5 * 60_000,
    local: 30_000,
  };

  /** Trần an toàn: không kéo vô hạn nếu danh mục phình. */
  private static readonly MAX_ITEMS = 500;
  private static readonly PAGE_SIZE_UPSTREAM = 100;

  /**
   * Cột được phép rời cơ sở dữ liệu trên đường công khai. Danh sách TƯỜNG MINH, không phải
   * `select` mặc định (lấy hết) rồi xoá bớt sau — vì thứ tự đó có nghĩa là mỗi cột nhạy cảm thêm
   * vào bảng sẽ mặc định ĐƯỢC ra ngoài cho tới khi có người nhớ ra.
   *
   * `_count.inventory` đếm số suất còn bán được. Nó là một phép gộp thêm cho mỗi lần đọc danh
   * mục — giá phải trả, nhưng chỉ mỗi chu kỳ đệm một lần, và không có nó thì nhãn "còn hàng" của
   * phần mềm chỉ là phỏng đoán.
   *
   * Không có `seo` và `compareAtVnd`: `StoreListing` chưa mang hai thứ đó, và mảnh này không được
   * đổi hình dạng hợp đồng công khai.
   */
  private static readonly CHON_TOM_TAT = {
    slug: true,
    name: true,
    descriptionShort: true,
    thumbnailUrl: true,
    gallery: true,
    priceVnd: true,
    category: true,
    totalSold: true,
    detail: true,
    createdAt: true,
    updatedAt: true,
    sourceUpdatedAt: true,
    _count: { select: { inventory: { where: { status: 'available' } } } },
  } satisfies Prisma.ListingSelect;

  /**
   * Thêm `description` cho trang chi tiết. Danh sách KHÔNG kéo cột Text này về: nó là thứ nặng
   * nhất trong bảng, nhân với cả danh mục, để rồi bị ném đi ngay ở bộ chuẩn hoá (danh sách trả
   * `description: null` — đúng như nhánh portal vẫn làm).
   */
  private static readonly CHON_DAY_DU = {
    ...StoreService.CHON_TOM_TAT,
    description: true,
  } satisfies Prisma.ListingSelect;

  private readonly cache = new Map<StoreKind, { at: number; src: NguonHang; items: StoreListing[] }>();

  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /** Gốc API của portal, đã bỏ dấu `/` cuối. Rỗng = tắt cửa hàng. */
  private get portalApi(): string {
    return (this.config.env.PORTAL_API_BASE ?? '').replace(/\/+$/, '');
  }

  /** Gốc trang công khai của portal — nơi nút "Mua" trỏ về ở giai đoạn 1. */
  private get portalSite(): string {
    return (this.config.env.PORTAL_PUBLIC_URL ?? '').replace(/\/+$/, '');
  }

  /** `auto` | `local` | `portal`. Xem `STORE_SOURCE` trong `config/env.ts` và `chonNguon`. */
  private get cheDoNguon(): 'auto' | 'local' | 'portal' {
    return this.config.env.STORE_SOURCE ?? 'auto';
  }

  /**
   * Đưa một đường dẫn ảnh về địa chỉ ĐẦY ĐỦ, lấy portal làm gốc.
   *
   * Portal trả `/products/sheet1/x.png` — tương đối với chính nó. Chép nguyên sang đây thì trình
   * duyệt hiểu là `https://toolswave.net/products/…` và nhận 404: đo ngày 23/09/2026 trên /store
   * và /store/software, 6 ảnh hỏng. Ảnh vẫn nằm ở portal và vẫn phục vụ được (kiểm: HTTP 200), chỉ
   * là không ai nói cho trình duyệt biết nó ở đâu.
   *
   * Dùng ĐÚNG hàm này cho cả dòng đọc từ bảng `Listing`, và đó không phải sự lười: bộ tải ảnh của
   * hệ này vốn sinh địa chỉ tuyệt đối (`${PUBLIC_API_URL}/uploads/…`), nên một đường dẫn tương đối
   * nằm trong bảng chỉ có thể là giá trị chép sang từ hệ B — và hệ B là nơi tấm ảnh đó thật sự
   * đang nằm. Nếu sau này có ảnh của hệ B được tải hẳn về đây thì việc của bản nhập là ghi địa chỉ
   * mới, không phải việc của chỗ này đoán.
   *
   * Đường dẫn đã đầy đủ (http/https, `//`, hoặc data:) thì để nguyên — portal có thể chuyển sang
   * CDN bất cứ lúc nào mà không cần báo bên này.
   */
  private abs(u: string | null): string | null {
    if (!u) return null;
    if (/^(https?:)?\/\//i.test(u) || u.startsWith('data:')) return u;
    if (!this.portalSite) return u;
    return `${this.portalSite}/${u.replace(/^\/+/, '')}`;
  }

  /**
   * Trang bán của một món bên portal — đường duy nhất còn nhận đơn cho tới giai đoạn 3.
   *
   * Loại hàng portal chưa từng bán (`app`|`tool`|`service`, sẽ xuất hiện khi bảng `Listing` có
   * dữ liệu) trả chuỗi rỗng: giao diện đã ẩn nút khi `buyUrl` rỗng, còn bịa ra một địa chỉ portal
   * chắc chắn 404 thì tệ hơn hẳn — người dùng bấm, rơi vào trang lỗi của một hệ khác, và không
   * ai biết lỗi bắt nguồn từ đây.
   */
  private buyUrl(kind: StoreKind, slug: string): string {
    const seg =
      kind === 'software' ? 'software' : kind === 'document' ? 'documents' : kind === 'sourcecode' ? 'sourcecode' : '';
    if (!seg || !this.portalSite) return '';
    return `${this.portalSite}/shop/${seg}/${slug}`;
  }

  // ── Chọn nguồn ─────────────────────────────────────────────────────────────

  /**
   * Danh mục một loại hàng từ bảng `Listing`. `null` = cơ sở dữ liệu nấc, `[]` = chưa có hàng —
   * `all` cần phân biệt hai thứ đó vì chúng dẫn tới hai hành vi khác hẳn nhau.
   */
  private async docCoSoDuLieu(kind: StoreKind): Promise<StoreListing[] | null> {
    try {
      const rows = await this.prisma.listing.findMany({
        where: { kind, status: 'active' },
        select: StoreService.CHON_TOM_TAT,
        // Cắt ở `MAX_ITEMS` thì phải cắt theo một thứ tự XÁC ĐỊNH, nếu không hai lần đọc giữ lại
        // hai tập 500 khác nhau. Dùng đúng khoá của thứ tự mặc định (`ban-chay`) để phần bị cắt
        // luôn là phần đằng đuôi danh mục. Bản thân thứ tự bày hàng vẫn do `sapXep` quyết định.
        orderBy: [{ totalSold: 'desc' }, { name: 'asc' }],
        take: StoreService.MAX_ITEMS,
      });
      return rows.map((r) => this.toListingTuDb(kind, r, false));
    } catch (e) {
      // Bảng `Listing` vừa thêm vào lược đồ và CHƯA chắc đã có trên mọi máy chủ — migration là
      // một việc riêng, chạy sau. Lỗi ở đây là chuyện lường trước được, nên nó không được phép
      // nổ ra tới người đang xem hàng: trả `null` để `all` hiểu là "nguồn này nấc" và đi lối khác.
      this.logger.warn(`listing(${kind}) → ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * Toàn bộ danh mục một loại hàng, có đệm — và là chỗ DUY NHẤT quyết định nó đến từ đâu.
   *
   * LUẬT CHỌN NGUỒN:
   *
   *   `portal` ép  → luôn đọc portal, không chạm cơ sở dữ liệu.
   *   `local`  ép  → luôn đọc bảng `Listing`, không lùi về portal (kể cả khi rỗng hoặc lỗi).
   *   `auto`   (mặc định) → có ít nhất một `Listing` cùng `kind` và `status='active'` thì đọc
   *                         bảng; không có thì đọc portal y như giai đoạn 1.
   *
   * Vì sao luật nằm ở "có dữ liệu hay không" chứ không ở một lá cờ bật tay: giai đoạn 2 nhập dữ
   * liệu xong là mặt tiền TỰ chuyển nguồn, không cần một lần deploy thứ hai đi kèm và không có
   * khoảnh khắc nào hai việc đó lệch nhau. Mà nếu bản nhập hỏng giữa chừng — chạy được nửa danh
   * mục rồi chết — thì loại hàng chưa nhập vẫn còn portal để đứng, thay vì trắng trang.
   *
   * Điều kiện "có ít nhất một" được kiểm bằng CHÍNH lần đọc danh mục (`docCoSoDuLieu` trả mảng
   * rỗng) chứ không bằng một câu `count` riêng: hai câu hỏi tách rời nhau thì có một khe ở giữa
   * (đếm thấy có, đọc lại thấy không), và một truy vấn rẻ hơn hai. `nguonChoChiTiet` là ngoại lệ
   * duy nhất — xem chú thích ở đó.
   *
   * Nguồn nào hỏng thì trả BẢN CŨ nếu còn (cửa hàng cũ vài phút tốt hơn cửa hàng trắng trang), và
   * KHÔNG ghi lại mốc thời gian — nên lượt xem kế tiếp thử lại ngay chứ không đợi hết chu kỳ.
   */
  private async all(kind: StoreKind): Promise<StoreListing[]> {
    const hit = this.cache.get(kind);
    if (hit && Date.now() - hit.at < StoreService.TTL_MS[hit.src]) return hit.items;

    const cheDo = this.cheDoNguon;

    if (cheDo !== 'portal') {
      const rows = await this.docCoSoDuLieu(kind);
      if (rows && rows.length > 0) return this.luu(kind, 'local', rows);
      if (cheDo === 'local') {
        // Ép local là để SOI nhánh mới, nên nó cố ý không có lưới đỡ: rỗng thì cửa hàng rỗng, lỗi
        // thì giữ bản đệm cũ. Lùi về portal ở đây sẽ che mất đúng cái đang cần nhìn.
        return rows === null ? (hit?.items ?? []) : this.luu(kind, 'local', []);
      }
      // `auto` + bảng chưa có hàng (hoặc cơ sở dữ liệu nấc) → rơi xuống portal bên dưới.
    }

    const items = await this.docPortal(kind);
    if (items === null) return hit?.items ?? [];
    return this.luu(kind, 'portal', items);
  }

  /** Sắp, ghi đệm, trả về. Tách ra vì `all` có ba lối thoát cùng phải làm đúng ba việc này. */
  private luu(kind: StoreKind, src: NguonHang, items: StoreListing[]): StoreListing[] {
    // Sắp lại TẠI ĐÂY chứ không tin thứ tự của nguồn: `sortBy=totalSold` mà cả danh mục cùng
    // bằng 0 thì thứ tự còn lại do cơ sở dữ liệu quyết định — mỗi lần làm mới đệm là trang chủ
    // cửa hàng đảo chỗ, người dùng tưởng hàng đổi còn máy tìm kiếm thấy một trang không ổn định.
    items.sort((a, b) => b.totalSold - a.totalSold || a.name.localeCompare(b.name, 'vi'));
    this.cache.set(kind, { at: Date.now(), src, items });
    return items;
  }

  /** Nguồn đã phục vụ lần đọc gần nhất của một loại hàng. Chưa đọc lần nào thì coi như portal. */
  private nguonDaDung(kind: StoreKind): NguonHang {
    return this.cache.get(kind)?.src ?? 'portal';
  }

  // ── Đọc từ portal ──────────────────────────────────────────────────────────

  private async getJson(path: string): Promise<unknown | null> {
    if (!this.portalApi) return null;
    try {
      const res = await fetch(`${this.portalApi}${path}`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) {
        this.logger.warn(`portal ${path} → HTTP ${res.status}`);
        return null;
      }
      const body = (await res.json()) as { success?: boolean; data?: unknown };
      if (body && typeof body === 'object' && 'data' in body) return body.data ?? null;
      return body ?? null;
    } catch (e) {
      this.logger.warn(`portal ${path} → ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * Danh mục một loại hàng từ portal. `null` = portal nấc (khác hẳn `[]` = portal nói không có
   * hàng); `all` cần phân biệt hai thứ đó để biết có nên giữ bản đệm cũ hay không.
   */
  private async docPortal(kind: StoreKind): Promise<StoreListing[] | null> {
    if (!StoreService.PORTAL_KINDS.includes(kind)) return [];

    const path = StoreService.PORTAL_PATH[kind];
    const items: StoreListing[] = [];
    let page = 1;
    let ok = false;

    while (items.length < StoreService.MAX_ITEMS) {
      const data = await this.getJson(
        `${path}?page=${page}&limit=${StoreService.PAGE_SIZE_UPSTREAM}&sortBy=totalSold&sortOrder=desc`,
      );
      if (!data) break;
      ok = true;
      const raw = data as { items?: unknown[]; totalPages?: number; pagination?: { totalPages?: number } };
      const batch = Array.isArray(raw.items) ? raw.items : [];
      for (const it of batch) items.push(this.toListing(kind, it as Record<string, unknown>, false));
      const totalPages = raw.totalPages ?? raw.pagination?.totalPages ?? 1;
      if (page >= totalPages || batch.length === 0) break;
      page += 1;
    }

    return ok ? items : null;
  }

  // ── Chuẩn hoá ──────────────────────────────────────────────────────────────

  private static str(v: unknown): string | null {
    return typeof v === 'string' && v.trim() ? v : null;
  }

  private static num(v: unknown): number {
    // Prisma Decimal về JSON là CHUỖI ("199000.00"), không phải số — `Number()` thẳng. Cột
    // `Listing.priceVnd` là Int nên nhánh nội bộ đi qua đây không mất gì, nhưng vẫn đi qua: dữ
    // liệu nhập từ hệ B có thể còn sót kiểu cũ ở chỗ nào đó chưa ai soi hết.
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  private static arr(v: unknown): string[] {
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  }

  /** Một cột Json về dạng đối tượng để đọc trường. Mảng và `null` đều thành `{}`. */
  private static obj(v: unknown): Record<string, unknown> {
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  }

  /**
   * Khoá so khớp của một tên công nghệ: bỏ hoa/thường và mọi ký tự không phải chữ-số.
   *
   * Dữ liệu bên portal do người nhập tay nên cùng một thứ có nhiều cách viết — đo ngày
   * 24/09/2026: `Tailwind CSS` (93 dự án) và `TailwindCSS` (1) nằm thành hai mục riêng, tương tự
   * `Next.js` / `NextJS`. Với một trang để NGHIÊN CỨU thì đó không phải chuyện thẩm mỹ: lọc theo
   * mục này là mất trắng dự án nằm ở mục kia, mà người lọc không hề biết mình vừa bỏ sót.
   *
   * Gộp theo KHOÁ, hiện theo CÁCH VIẾT PHỔ BIẾN NHẤT — sửa ở tầng đọc chứ không sửa dữ liệu của
   * hệ khác. Bản nhập của giai đoạn 2 bê nguyên các cách viết cũ sang, nên luật này còn cần ở
   * nhánh nội bộ đúng bằng lúc nó cần ở nhánh portal.
   */
  private static khoaCongNghe(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  /**
   * Một bản ghi của portal → `StoreListing`. CHỈ chép những trường có trong hợp đồng: trường lạ
   * của portal (giá vốn, link giao hàng, ghi chú nội bộ) không có đường nào đi ra ngoài.
   */
  private toListing(kind: StoreKind, r: Record<string, unknown>, full: boolean): StoreListing {
    const slug = StoreService.str(r.slug) ?? '';
    const price = kind === 'software' ? r.priceRetail : r.price;
    const availableCount =
      typeof r.availableCount === 'number' ? r.availableCount : undefined;

    const detail: StoreListing['detail'] = {};
    if (kind === 'document') {
      const ft = StoreService.str(r.fileType);
      if (ft) detail.fileType = ft;
    }
    if (kind === 'sourcecode') {
      detail.languages = StoreService.arr(r.languages);
      detail.version = StoreService.str(r.version);
      if (full) {
        detail.prerequisites = StoreService.str(r.prerequisites);
        detail.specDocument = StoreService.str(r.specDocument);
      }
    }
    if (kind === 'software') {
      const it = StoreService.str(r.inventoryType);
      if (it) detail.inventoryType = it;
      if (availableCount !== undefined) detail.availableCount = availableCount;
    }

    const gallery = [...StoreService.arr(r.galleryUrls), ...StoreService.arr(r.previewUrls)]
      .map((u) => this.abs(u))
      .filter((u): u is string => !!u);

    return {
      kind,
      slug,
      name: StoreService.str(r.name) ?? slug,
      descriptionShort: StoreService.str(r.descriptionShort),
      description: full ? StoreService.str(r.description) : null,
      thumbnailUrl: this.abs(StoreService.str(r.thumbnailUrl)),
      gallery,
      priceVnd: StoreService.num(price),
      category: StoreService.str(r.category),
      totalSold: typeof r.totalSold === 'number' ? r.totalSold : 0,
      // Chỉ phần mềm mới có kho thật (mỗi suất là một tài khoản/khoá). Tài liệu và mã nguồn bán
      // bản sao nên không có khái niệm hết hàng — `null` để giao diện đừng vẽ nhãn "còn hàng"
      // ở chỗ nó vô nghĩa.
      inStock:
        kind === 'software'
          ? availableCount !== undefined
            ? availableCount > 0
            : StoreService.str(r.status) !== 'OUT_OF_STOCK'
          : null,
      detail,
      buyUrl: this.buyUrl(kind, slug),
      updatedAt: StoreService.str(r.updatedAt) ?? StoreService.str(r.createdAt),
    };
  }

  /**
   * Một dòng `Listing` → `StoreListing`.
   *
   * `detail` trong bảng là một cột Json, và nó được DỰNG LẠI TỪNG TRƯỜNG ở đây chứ không sao chép
   * cả khối. Trải nguyên cột Json ra ngoài thì bất cứ thứ gì bản nhập hay CMS nhét thêm vào đó —
   * một `costPrice` tiện tay, một ghi chú, một token — sẽ đi thẳng ra API công khai mà không ai
   * phải duyệt. Đây là cùng một luật đang áp cho nhánh portal, chỉ khác là ở đây dữ liệu là của
   * chính mình nên cảm giác an toàn giả còn mạnh hơn.
   *
   * Cột `sortOrder` cố ý KHÔNG được đọc: `StoreSort` chưa có lựa chọn "thứ tự thủ công", nên dùng
   * nó sẽ khiến cùng một danh mục bày ra hai kiểu khác nhau tuỳ nguồn — và lúc `auto` lật nguồn
   * thì cửa hàng tự đảo chỗ toàn bộ. Khi nào hợp đồng công khai có chỗ cho nó thì mới đọc.
   */
  private toListingTuDb(kind: StoreKind, r: DongListing, full: boolean): StoreListing {
    const d = StoreService.obj(r.detail);
    const suat = typeof r._count?.inventory === 'number' ? r._count.inventory : undefined;

    const detail: StoreListing['detail'] = {};
    if (kind === 'document') {
      const ft = StoreService.str(d.fileType);
      if (ft) detail.fileType = ft;
    }
    if (kind === 'sourcecode') {
      detail.languages = StoreService.arr(d.languages);
      detail.version = StoreService.str(d.version);
      if (full) {
        detail.prerequisites = StoreService.str(d.prerequisites);
        detail.specDocument = StoreService.str(d.specDocument);
      }
    }
    if (kind === 'software') {
      const it = StoreService.str(d.inventoryType);
      if (it) detail.inventoryType = it;
      if (suat !== undefined) detail.availableCount = suat;
    }

    return {
      kind,
      slug: r.slug,
      name: r.name || r.slug,
      descriptionShort: StoreService.str(r.descriptionShort),
      description: full ? StoreService.str(r.description) : null,
      thumbnailUrl: this.abs(StoreService.str(r.thumbnailUrl)),
      gallery: StoreService.arr(r.gallery)
        .map((u) => this.abs(u))
        .filter((u): u is string => !!u),
      priceVnd: StoreService.num(r.priceVnd),
      category: StoreService.str(r.category),
      totalSold: typeof r.totalSold === 'number' ? r.totalSold : 0,
      // Chỉ phần mềm mới có kho thật, và ở nguồn nội bộ kho đó là bảng `Inventory` chứ không phải
      // một con số chép tay. Đếm không ra (truy vấn cũ, bản giả lập thiếu `_count`) thì coi như
      // CÒN hàng: ở giai đoạn này `buyUrl` vẫn trỏ về portal, nên nhãn này chỉ để đọc — dán
      // "hết hàng" lên một món portal vẫn đang bán là nói sai, còn thiếu nhãn thì không.
      inStock: kind === 'software' ? (suat !== undefined ? suat > 0 : true) : null,
      detail,
      buyUrl: this.buyUrl(kind, r.slug),
      // `sourceUpdatedAt` TRƯỚC: với hàng nhập từ hệ B, `updatedAt` chỉ là ngày script chạy, và
      // cả danh mục sẽ mang đúng một ngày đó. Xem chú thích của cột trong schema.prisma.
      updatedAt: (r.sourceUpdatedAt ?? r.updatedAt ?? r.createdAt)?.toISOString() ?? null,
    };
  }

  // ── API công khai ──────────────────────────────────────────────────────────

  /** Trang /store: mỗi loại hàng bày ra mặt tiền một hàng thẻ. */
  async overview(limit: number): Promise<StoreOverview> {
    const kinds = StoreService.SHOP_KINDS;
    const lists = await Promise.all(kinds.map((k) => this.all(k)));
    return {
      // `local` chỉ khi MỌI nhóm trong câu trả lời này đọc từ bảng. Giai đoạn 2 nhập từng loại
      // một nên sẽ có lúc nửa nạc nửa mỡ, và lúc đó "portal" là câu trả lời đúng hơn: vẫn còn
      // phần danh mục phụ thuộc hệ B, nên vẫn còn phần có thể tắt cùng hệ B.
      source: kinds.every((k) => this.nguonDaDung(k) === 'local') ? 'local' : 'portal',
      groups: kinds.map((kind, i) => ({
        kind,
        total: lists[i].length,
        items: lists[i].slice(0, limit),
      })),
    };
  }

  /**
   * Danh sách một loại hàng — lọc, tìm, sắp, phân trang tại chỗ trên bản đã đệm.
   *
   * Bộ lọc ở đây là bộ lọc của người ĐI NGHIÊN CỨU, không phải của người đi dạo: lọc theo công
   * nghệ (`language`) mới là câu hỏi thật khi chọn mã nguồn — "có cái nào chạy Next.js + Prisma
   * không" — còn chuyên mục chỉ trả lời được "đại khái nó thuộc nhóm nào".
   *
   * Toàn bộ đoạn dưới KHÔNG biết dữ liệu đến từ đâu, và đó là điểm: đổi nguồn không được phép
   * đổi cách cửa hàng lọc, tìm hay sắp — nếu không thì "lật nguồn" trở thành một thay đổi mà
   * người dùng nhìn thấy.
   */
  async list(
    kind: StoreKind,
    opts: {
      page: number;
      pageSize: number;
      search?: string;
      category?: string;
      language?: string;
      sort?: StoreSort;
    },
  ): Promise<Paginated<StoreListing>> {
    let items = await this.all(kind);

    if (opts.category) {
      const c = opts.category.trim().toLowerCase();
      items = items.filter((i) => (i.category ?? '').trim().toLowerCase() === c);
    }
    if (opts.language) {
      // So khớp theo khoá đã chuẩn hoá: `?language=Tailwind CSS` phải bắt được cả `TailwindCSS`.
      const l = StoreService.khoaCongNghe(opts.language.trim());
      items = items.filter((i) =>
        (i.detail.languages ?? []).some((x) => StoreService.khoaCongNghe(x) === l),
      );
    }
    if (opts.search) {
      const q = opts.search.trim().toLowerCase();
      // Stack NẰM TRONG phạm vi tìm kiếm: gõ "Prisma" là đang hỏi về công nghệ, không phải hỏi
      // về tên sản phẩm. Bỏ nó ra thì ô tìm kiếm trả rỗng đúng lúc người dùng biết rõ nhất mình
      // muốn gì.
      items = items.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.descriptionShort ?? '').toLowerCase().includes(q) ||
          (i.category ?? '').toLowerCase().includes(q) ||
          (i.detail.languages ?? []).some((x) => x.toLowerCase().includes(q)),
      );
    }

    items = StoreService.sapXep(items, opts.sort);

    const total = items.length;
    const start = (opts.page - 1) * opts.pageSize;
    return {
      items: items.slice(start, start + opts.pageSize),
      total,
      page: opts.page,
      pageSize: opts.pageSize,
    };
  }

  /**
   * Sắp xếp. Mọi nhánh đều có KHOÁ PHỤ là tên: hàng loạt sản phẩm cùng giá 100.000đ và cùng
   * `totalSold = 0`, nên thiếu khoá phụ thì thứ tự do bộ sắp xếp quyết định và trang đảo chỗ
   * giữa hai lần tải — người dùng tưởng hàng đổi, máy tìm kiếm thấy một trang không ổn định.
   */
  private static sapXep(items: StoreListing[], sort?: StoreSort): StoreListing[] {
    const theoTen = (a: StoreListing, b: StoreListing) => a.name.localeCompare(b.name, 'vi');
    const arr = [...items];
    switch (sort) {
      case 'moi':
        return arr.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || theoTen(a, b));
      case 'gia-thap':
        return arr.sort((a, b) => a.priceVnd - b.priceVnd || theoTen(a, b));
      case 'gia-cao':
        return arr.sort((a, b) => b.priceVnd - a.priceVnd || theoTen(a, b));
      case 'ten':
        return arr.sort(theoTen);
      case 'ban-chay':
      default:
        return arr.sort((a, b) => b.totalSold - a.totalSold || theoTen(a, b));
    }
  }

  /**
   * Công nghệ đang có + số sản phẩm dùng nó. Một sản phẩm đếm vào NHIỀU công nghệ, nên tổng các
   * con số ở đây lớn hơn số sản phẩm — đó là đúng, và giao diện đừng cộng chúng lại để khoe tổng.
   */
  async languages(kind: StoreKind): Promise<StoreFacet[]> {
    const items = await this.all(kind);
    /** khoá → { tổng số dự án, số lần gặp từng cách viết } */
    const gom = new Map<string, { count: number; cachViet: Map<string, number> }>();
    for (const i of items) {
      // Một dự án khai trùng hai cách viết của cùng công nghệ thì chỉ đếm MỘT lần — nếu không,
      // con số trên chip sẽ lớn hơn số dự án mà lọc ra được, và người dùng bấm vào thấy hụt.
      const daDem = new Set<string>();
      for (const raw of i.detail.languages ?? []) {
        const name = raw.trim();
        if (!name) continue;
        const k = StoreService.khoaCongNghe(name);
        if (!k) continue;
        const o = gom.get(k) ?? { count: 0, cachViet: new Map<string, number>() };
        if (!daDem.has(k)) {
          o.count += 1;
          daDem.add(k);
        }
        o.cachViet.set(name, (o.cachViet.get(name) ?? 0) + 1);
        gom.set(k, o);
      }
    }
    return [...gom.values()]
      .map((o) => ({
        // Cách viết phổ biến nhất thắng; hoà thì lấy bản dài hơn ("Tailwind CSS" dễ đọc hơn
        // "TailwindCSS"), hoà nữa thì theo bảng chữ cái để kết quả không đổi giữa hai lần gọi.
        name: [...o.cachViet.entries()].sort(
          (a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0]),
        )[0][0],
        count: o.count,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  /** Chuyên mục đang có hàng + số món — đếm trên TOÀN danh mục, không phải trên một trang. */
  async categories(kind: StoreKind): Promise<StoreFacet[]> {
    const items = await this.all(kind);
    const count = new Map<string, number>();
    for (const i of items) {
      const name = (i.category ?? '').trim();
      if (!name) continue;
      count.set(name, (count.get(name) ?? 0) + 1);
    }
    return [...count.entries()]
      .map(([name, c]) => ({ name, count: c }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  /**
   * Trang chi tiết đọc nguồn NÀO.
   *
   * Phải là cùng nguồn với danh sách, không được "thử bảng, không thấy thì hỏi portal". Lý do
   * không phải sạch sẽ mà là đúng/sai: một món bị đặt `status='hidden'` trong CMS mà vẫn còn bên
   * portal sẽ mở được bằng đường dẫn trực tiếp — tức là nút Ẩn không ẩn được gì. Kèm theo đó,
   * `slugs()` (sitemap) đi theo nguồn của danh sách, nên trộn nguồn nghĩa là khai một tập địa chỉ
   * rồi phục vụ một tập khác.
   *
   * `auto` mà chưa từng đọc danh mục (đệm nguội, người dùng vào thẳng một trang bán từ Google)
   * thì phải hỏi riêng một câu — đây là chỗ DUY NHẤT có câu truy vấn chỉ để chọn nguồn, và nó cố
   * ý chỉ lấy `id` của một dòng.
   */
  private async nguonChoChiTiet(kind: StoreKind): Promise<NguonHang> {
    const cheDo = this.cheDoNguon;
    if (cheDo !== 'auto') return cheDo;
    const hit = this.cache.get(kind);
    if (hit) return hit.src;
    try {
      const co = await this.prisma.listing.findFirst({
        where: { kind, status: 'active' },
        select: { id: true },
      });
      return co ? 'local' : 'portal';
    } catch (e) {
      this.logger.warn(`listing(${kind}) → ${(e as Error).message}`);
      return 'portal';
    }
  }

  /**
   * Chi tiết một món. Đọc thẳng nguồn (bản đệm chỉ có phần tóm tắt) và lùi về bản trong đệm khi
   * nguồn nấc — người đang xem vẫn thấy tên, giá và nút mua thay vì trang 404.
   */
  async detail(kind: StoreKind, slug: string): Promise<StoreListing> {
    if ((await this.nguonChoChiTiet(kind)) === 'local') {
      try {
        const row = await this.prisma.listing.findFirst({
          where: { kind, slug, status: 'active' },
          select: StoreService.CHON_DAY_DU,
        });
        if (row) return this.toListingTuDb(kind, row, true);
      } catch (e) {
        this.logger.warn(`listing(${kind}/${slug}) → ${(e as Error).message}`);
      }
      const cached = (await this.all(kind)).find((i) => i.slug === slug);
      if (cached) return cached;
      throw new NotFoundException('Không có món này');
    }

    if (!StoreService.PORTAL_KINDS.includes(kind)) throw new NotFoundException('Không có món này');
    const data = await this.getJson(`${StoreService.PORTAL_PATH[kind]}/${encodeURIComponent(slug)}`);
    if (data && typeof data === 'object') {
      return this.toListing(kind, data as Record<string, unknown>, true);
    }
    const cached = (await this.all(kind)).find((i) => i.slug === slug);
    if (cached) return cached;
    throw new NotFoundException('Không có món này');
  }

  /**
   * Mọi slug đang bán — cho sitemap. Theo MẶT TIỀN, không theo khả năng đọc: hai loại hàng kia
   * đã chuyển hướng về /store, khai chúng trong sitemap là tự dẫn bot vào một cú 301.
   */
  async slugs(): Promise<{ kind: StoreKind; slug: string; updatedAt: string | null }[]> {
    const lists = await Promise.all(StoreService.SHOP_KINDS.map((k) => this.all(k)));
    return lists.flat().map((i) => ({ kind: i.kind, slug: i.slug, updatedAt: i.updatedAt }));
  }
}
