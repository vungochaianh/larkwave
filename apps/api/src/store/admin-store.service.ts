import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { AppSeo, Paginated, StoreKind, StoreListingDetail } from '@larkwave/shared';
import type { AuthUser } from '../common/auth-user';
import { decryptJson, encryptJson } from '../common/secret-crypto';
import { AppConfigService } from '../config/app-config.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AdminListingFull,
  AdminListingRow,
  GrantResult,
  GrantedOrder,
  ListingDelivery,
  ListingStatus,
} from './admin-store.dto';
import type {
  AdminListingQueryDto,
  CreateListingDto,
  GrantListingDto,
  ListingDeliveryDto,
  UpdateListingDto,
} from './admin-store.dto';

/**
 * Quản trị cửa hàng — giai đoạn 2. Đọc/ghi thẳng bảng `Listing` của hệ này.
 *
 * Tách hẳn khỏi `StoreService` (tuyến công khai) thay vì thêm vài hàm `adminXxx` vào đó, vì hai
 * bên có hai luật đối lập nhau: tuyến công khai phải CHÉP RA đúng các trường của `StoreListing`
 * và không bao giờ chạm `deliveryEnc`/`notesInternal`; tuyến quản trị phải đọc được chúng. Trộn
 * hai luật vào một tệp là cách chắc chắn nhất để một hôm nào đó một trường nội bộ đi nhờ ra
 * ngoài — đúng lỗi vừa bịt bên portal hôm 23/09 (xem mục 13 của
 * docs/hop-nhat-cua-hang-va-nen-tang.md).
 *
 * Ba luật của tệp này, giữ cho chặt:
 *
 *  1. Mọi truy vấn danh sách/chi tiết dùng `select` TƯỜNG MINH. Không `findMany()` trần rồi
 *     ánh xạ — cách đó để lộ mọi cột được thêm sau này cho tới khi có người nhớ ra.
 *  2. `deliveryEnc` chỉ đi qua đúng hai hàm: `delivery()` và `setDelivery()`. Cả hai ghi nhật ký.
 *  3. `detail` và `seo` được LỌC THEO DANH SÁCH TRẮNG trước khi ghi. `detail` đi thẳng ra API
 *     công khai, nên mọi thứ lọt vào đó là công khai — kể cả khi người gửi tưởng là không.
 */
@Injectable()
export class AdminStoreService {
  private readonly logger = new Logger(AdminStoreService.name);

  /**
   * Khoá được phép nằm trong `Listing.detail`. Danh sách này PHẢI khớp
   * `shared.StoreListingDetail`; thêm khoá mới ở `shared` mà quên thêm ở đây thì trang quản trị
   * lặng lẽ không lưu được trường đó — khó chịu, nhưng vẫn tốt hơn chiều ngược lại (khoá lạ
   * lọt ra trang bán công khai).
   */
  private static readonly DETAIL_KEYS = [
    'fileType',
    'languages',
    'version',
    'prerequisites',
    'specDocument',
    'inventoryType',
    'availableCount',
  ] as const;

  /**
   * Ba khoá TUYỆT ĐỐI KHÔNG được nằm trong `detail`. Gửi kèm là bị từ chối thẳng chứ không bị
   * lặng lẽ bỏ qua: một client gửi nhầm cần biết ngay là đường giao hàng có tuyến riêng, còn
   * lọc im lặng thì nó tưởng đã lưu xong và người mua nhận được một món không có link tải.
   */
  private static readonly DELIVERY_KEYS = ['driveLink', 'zipFileUrl', 'gitlabRepoId'] as const;

  /**
   * Loại hàng cấp thẳng được, và quyền tương ứng trong `Entitlement.kind`.
   *
   * `software` và `document` cố ý KHÔNG có mặt: một suất phần mềm phải rút từ `Inventory` (bán
   * nhầm một tài khoản đã bán là chuyện không sửa được bằng một dòng SQL), còn tài liệu cần
   * đường tải có hạn. Cả hai thuộc giai đoạn 3. Cấp một quyền rỗng cho chúng ở đây chỉ tạo ra
   * một khách hàng tưởng mình đã có hàng.
   */
  private static readonly GRANTABLE: Partial<Record<StoreKind, string>> = {
    sourcecode: 'sourcecode',
    app: 'app_license',
    tool: 'tool_premium',
  };

  /** Cách giao mặc định theo loại hàng — mục 5 của kế hoạch. */
  private static readonly METHOD: Partial<Record<StoreKind, string>> = {
    sourcecode: 'git_invite',
    app: 'app_handover',
    tool: 'entitlement',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Danh mục
  // ───────────────────────────────────────────────────────────────────────────

  /** Các cột an toàn để hiện ở bảng danh sách. `deliveryEnc` không có mặt — đó là chủ ý. */
  private static readonly ROW_SELECT = {
    id: true,
    kind: true,
    slug: true,
    name: true,
    descriptionShort: true,
    thumbnailUrl: true,
    priceVnd: true,
    compareAtVnd: true,
    category: true,
    status: true,
    sortOrder: true,
    totalSold: true,
    appId: true,
    buildId: true,
    legacyId: true,
    createdAt: true,
    updatedAt: true,
    /**
     * Chỉ lấy ĐỘ DÀI thì Prisma không làm được, nên lấy cả cột rồi quy về boolean ngay trong
     * mapper. Chuỗi đã mã hoá không nói lên điều gì, nhưng nó cũng không có lý do gì để rời
     * khỏi tiến trình này — `toRow` cắt nó ở đây.
     */
    deliveryEnc: true,
  } as const;

  /**
   * `GET /v1/admin/store/listings` — bảng danh mục, lọc theo loại/trạng thái/chuyên mục + tìm
   * theo tên hoặc slug.
   *
   * Sắp theo `updatedAt` giảm dần chứ không theo `sortOrder`: đây là bảng LÀM VIỆC, thứ vừa sửa
   * phải nằm ngay trên đầu. `sortOrder` là thứ tự bày hàng cho khách, việc của tuyến công khai.
   */
  async list(q: AdminListingQueryDto): Promise<Paginated<AdminListingRow>> {
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(Math.max(1, q.pageSize ?? 20), 100);
    const term = q.q?.trim();
    const where = {
      ...(q.kind ? { kind: q.kind } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.category ? { category: { equals: q.category, mode: 'insensitive' as const } } : {}),
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: 'insensitive' as const } },
              { slug: { contains: term, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: AdminStoreService.ROW_SELECT,
      }),
      this.prisma.listing.count({ where }),
    ]);
    return { items: rows.map((r) => AdminStoreService.toRow(r)), total, page, pageSize };
  }

  /** `GET /v1/admin/store/listings/:id` — một món, kèm phần dài và số tồn kho còn bán được. */
  async get(id: string): Promise<AdminListingFull> {
    const row = await this.prisma.listing.findUnique({
      where: { id },
      select: {
        ...AdminStoreService.ROW_SELECT,
        description: true,
        gallery: true,
        detail: true,
        seo: true,
        notesInternal: true,
      },
    });
    if (!row) throw new NotFoundException('Không tìm thấy món hàng');
    const availableInventory = await this.prisma.inventory.count({
      where: { listingId: id, status: 'available' },
    });
    return {
      ...AdminStoreService.toRow(row),
      description: row.description ?? null,
      gallery: AdminStoreService.toStringArray(row.gallery),
      detail: (row.detail as StoreListingDetail | null) ?? {},
      seo: (row.seo as AppSeo | null) ?? null,
      notesInternal: row.notesInternal ?? null,
      availableInventory,
    };
  }

  /** `POST /v1/admin/store/listings` — dựng một món bằng tay (service, hoặc app của GĐ4). */
  async create(actor: AuthUser, dto: CreateListingDto): Promise<AdminListingFull> {
    // Kiểm bằng TAY thay vì tin vào decorator. `CreateListingDto` kế thừa `UpdateListingDto`,
    // và class-validator kế thừa cả metadata của lớp cha — trong đó có `@IsOptional()` trên
    // `slug`/`name`. `@IsOptional()` thắng: nó bỏ qua MỌI validator còn lại của trường đó khi
    // giá trị là undefined, nên `@IsString()` khai lại ở lớp con không cứu được. Thiếu dòng này
    // thì một body không có `name` đi thẳng tới `dto.name.trim()` và nổ thành 500.
    if (!dto.slug?.trim() || !dto.name?.trim()) {
      throw new BadRequestException('Cần cả slug và tên cho món hàng mới');
    }
    const slug = AdminStoreService.normalizeSlug(dto.slug);
    const data = {
      kind: dto.kind,
      slug,
      name: dto.name.trim(),
      ...this.writableFields(dto),
    };
    const created = await this.prisma.listing
      .create({ data, select: { id: true } })
      .catch((err: unknown) => {
        throw AdminStoreService.slugConflict(err, dto.kind, slug);
      });
    await this.audit.log(actor.id, actor.email, 'store.listing.create', created.id, {
      kind: dto.kind,
      slug,
    });
    return this.get(created.id);
  }

  /**
   * `PATCH /v1/admin/store/listings/:id` — sửa một món.
   *
   * Hai thứ chủ yêu cầu đích danh đi qua đây: TÀI LIỆU (`detail.specDocument`,
   * `detail.prerequisites`) và SEO (cột `seo`). Cả hai đều là trường dài, sửa thường xuyên, và
   * cả hai đều nằm trong JSON — nên cách GHI chúng quan trọng hơn vẻ ngoài của nó:
   *
   *  - `detail` GỘP theo khoá: trang quản trị sửa đặc tả chỉ gửi `specDocument`, ghi đè cả khối
   *    sẽ xoá `languages`/`version` mà script nhập dựng ra, và không ai nhận ra cho tới khi bộ
   *    lọc theo công nghệ bên /store trống trơn.
   *  - `seo` THAY CẢ KHỐI: nó là một khối cấu hình có mặc định rõ ràng (xem `cleanSeo`), gộp
   *    từng khoá sẽ khiến "tắt sitemap" không bao giờ tắt được vì giá trị cũ còn nằm đó.
   */
  async update(actor: AuthUser, id: string, dto: UpdateListingDto): Promise<AdminListingFull> {
    const cur = await this.prisma.listing.findUnique({
      where: { id },
      select: { id: true, kind: true, slug: true, detail: true },
    });
    if (!cur) throw new NotFoundException('Không tìm thấy món hàng');

    const slug = dto.slug !== undefined ? AdminStoreService.normalizeSlug(dto.slug) : undefined;
    const data = {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(slug !== undefined ? { slug } : {}),
      ...this.writableFields(dto, (cur.detail as StoreListingDetail | null) ?? {}),
    };
    if (Object.keys(data).length === 0) return this.get(id);

    await this.prisma.listing.update({ where: { id }, data }).catch((err: unknown) => {
      throw AdminStoreService.slugConflict(err, cur.kind, slug ?? cur.slug);
    });
    // Nhật ký ghi TÊN TRƯỜNG chứ không ghi giá trị: `description` và `detail.specDocument` dài
    // hàng chục nghìn ký tự, đổ nguyên vào `AuditLog.meta` là biến bảng nhật ký thành bản sao
    // thứ hai của danh mục. Đổi slug thì ghi cả hai đầu — đó là thứ duy nhất ở đây có thể làm
    // gãy một URL đang có mặt trên Google.
    await this.audit.log(actor.id, actor.email, 'store.listing.update', id, {
      fields: Object.keys(dto),
      ...(slug !== undefined && slug !== cur.slug ? { slugFrom: cur.slug, slugTo: slug } : {}),
    });
    return this.get(id);
  }

  /**
   * `POST /v1/admin/store/listings/:id/status` — ẩn/hiện/đánh dấu hết hàng.
   *
   * Tuyến RIÊNG thay vì một lần `PATCH { status }`, vì đây là thao tác một nút bấm và là thao
   * tác duy nhất ở trang quản trị có hậu quả nhìn thấy ngay trên trang công khai. Tách ra thì
   * nhật ký có một dòng đọc được ("ai gỡ món này xuống lúc mấy giờ") thay vì lẫn trong đống
   * `store.listing.update`.
   *
   * `hidden` KHÔNG xoá dữ liệu: đơn hàng cũ vẫn phải đọc được tên và giá của món đã bán. Cũng vì
   * thế mà ở đây không có tuyến DELETE — xem chú thích cuối tệp.
   */
  async setStatus(actor: AuthUser, id: string, status: ListingStatus): Promise<AdminListingRow> {
    const cur = await this.prisma.listing.findUnique({ where: { id }, select: { status: true } });
    if (!cur) throw new NotFoundException('Không tìm thấy món hàng');
    const row = await this.prisma.listing.update({
      where: { id },
      data: { status },
      select: AdminStoreService.ROW_SELECT,
    });
    await this.audit.log(actor.id, actor.email, 'store.listing.status', id, {
      from: cur.status,
      to: status,
    });
    return AdminStoreService.toRow(row);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Đường giao hàng — cột mã hoá, tuyến riêng
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * `GET /v1/admin/store/listings/:id/delivery` — đọc đường giao hàng, ĐÃ GIẢI MÃ.
   *
   * Ghi nhật ký cả lượt ĐỌC, không chỉ lượt ghi. Đây là link tải mã nguồn và id repo GitLab:
   * thứ bị rò ra ngoài thì mất hàng, và câu hỏi sau một vụ rò luôn là "ai đã mở nó", không phải
   * "ai đã sửa nó". Một dòng nhật ký mỗi lần mở là cái giá rất rẻ cho câu trả lời đó.
   */
  async delivery(actor: AuthUser, id: string): Promise<ListingDelivery> {
    const row = await this.prisma.listing.findUnique({
      where: { id },
      select: { id: true, deliveryEnc: true },
    });
    if (!row) throw new NotFoundException('Không tìm thấy món hàng');
    const data = this.readDelivery(row.deliveryEnc, id);
    await this.audit.log(actor.id, actor.email, 'store.listing.delivery.read', id, {
      /** Có gì để đọc hay không — KHÔNG bao giờ ghi giá trị vào nhật ký. */
      filled: Object.entries(data)
        .filter(([, v]) => !!v)
        .map(([k]) => k),
    });
    return data;
  }

  /**
   * `PUT /v1/admin/store/listings/:id/delivery` — đặt lại đường giao hàng.
   *
   * THAY CẢ KHỐI, không gộp: ba trường này mô tả MỘT cách giao, và gộp từng khoá khiến việc gỡ
   * một link chết trở nên bất khả (gửi `driveLink: ""` để xoá là một quy ước không ai đoán ra).
   * Gửi object rỗng = xoá sạch, cột về `null`.
   */
  async setDelivery(
    actor: AuthUser,
    id: string,
    dto: ListingDeliveryDto,
  ): Promise<ListingDelivery> {
    const row = await this.prisma.listing.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundException('Không tìm thấy món hàng');
    const clean: ListingDelivery = {
      driveLink: AdminStoreService.trimOrNull(dto.driveLink),
      zipFileUrl: AdminStoreService.trimOrNull(dto.zipFileUrl),
      gitlabRepoId: AdminStoreService.trimOrNull(dto.gitlabRepoId),
    };
    const filled = Object.entries(clean)
      .filter(([, v]) => !!v)
      .map(([k]) => k);
    // Rỗng hoàn toàn thì ghi `null` chứ không ghi một khối mã hoá của `{}`: cột null đọc được
    // bằng mắt trong một lần `SELECT`, còn một chuỗi `v1:...` luôn phải giải mã mới biết là rỗng.
    const enc = filled.length ? encryptJson(clean, this.config.env.JWT_SECRET) : null;
    await this.prisma.listing.update({ where: { id }, data: { deliveryEnc: enc } });
    await this.audit.log(actor.id, actor.email, 'store.listing.delivery.write', id, { filled });
    return clean;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Cấp dự án thẳng vào tài khoản
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * `POST /v1/admin/store/grants` — nhân viên bán hàng cấp một dự án vào tài khoản khách.
   *
   * Đây là đường bán hàng THẬT của hôm nay: khách chốt qua Zalo/điện thoại, chuyển khoản tay,
   * nhân viên mở trang quản trị và cấp. Nó không đi qua SePay, nên nó phải tự dựng đủ giấy tờ
   * mà một đơn bình thường có — nếu không, doanh thu bán tay sẽ vô hình trong mọi báo cáo và
   * khách bán tay sẽ vô hình trong mọi truy vấn "ai đã mua món này".
   *
   * Vì sao BỐN bản ghi chứ không chỉ một `Entitlement`:
   *  - `Order` + `OrderItem`: để đơn bán tay nằm cùng một bảng với đơn tự động. `nameSnapshot`
   *    và `priceVnd` là bản chụp — món đổi giá sau đó thì hoá đơn không được đổi theo.
   *  - `Fulfillment` (`pending`): việc bàn giao CHƯA xong sau lời gọi này. Để nó ở `pending` là
   *    cách nói thật; tạo sẵn ở `delivered` là kiểu thất bại tệ nhất — báo thành công trong khi
   *    khách chưa nhận được gì (bài học `systemctl reload cloudflared`).
   *  - `Entitlement`: thứ mọi chỗ khác sẽ HỎI. "Người này có quyền với món kia không" phải trả
   *    lời bằng một truy vấn chỉ mục, không phải bằng cách duyệt lại lịch sử đơn.
   *
   * IDEMPOTENT theo (user, listing): cấp lại KHÔNG tạo đơn thứ hai. Nhân viên bấm hai lần, hoặc
   * gọi lại vì lần trước mạng rớt giữa chừng, là chuyện xảy ra hằng tuần — và hậu quả của việc
   * không chống là hai đơn cho một lần bán, tức báo cáo doanh thu sai.
   */
  async grant(actor: AuthUser, dto: GrantListingDto): Promise<GrantResult> {
    const user = await this.resolveUser(dto);
    const listing = await this.prisma.listing.findUnique({
      where: { id: dto.listingId },
      select: { id: true, kind: true, name: true, priceVnd: true, status: true },
    });
    if (!listing) throw new NotFoundException('Không tìm thấy món hàng');

    const kind = listing.kind as StoreKind;
    const entKind = AdminStoreService.GRANTABLE[kind];
    if (!entKind) {
      throw new BadRequestException(
        `Chưa cấp thẳng được loại hàng "${kind}" — phần mềm cần rút suất từ kho, tài liệu cần đường tải có hạn (giai đoạn 3)`,
      );
    }
    // Món đang ẩn vẫn cấp được: nhân viên thường bán những thứ chưa bày ra mặt tiền (bản dựng
    // riêng, gói làm theo yêu cầu). Chặn ở đây chỉ đẩy họ sang bật hiện — rồi quên tắt.

    const existing = await this.prisma.entitlement.findFirst({
      where: { userId: user.id, kind: entKind, listingId: listing.id },
      select: { id: true, orderId: true },
    });
    if (existing) return this.existingGrant(existing, user, listing.name);

    const code = await this.uniqueOrderCode();
    const now = new Date();
    let result: { orderId: string; entitlementId: string; fulfillmentId: string };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            code,
            userId: user.id,
            // Giá GỐC của món, không phải 0: món này đã được trả tiền, chỉ là trả ngoài hệ
            // thống. Ghi 0 sẽ làm mọi con số doanh thu sau này thấp hơn sự thật.
            totalVnd: listing.priceVnd,
            status: 'paid',
            grantedBy: actor.id,
            grantNote: dto.note?.trim() || null,
          },
          select: { id: true },
        });
        const item = await tx.orderItem.create({
          data: {
            orderId: order.id,
            listingId: listing.id,
            kind: listing.kind,
            nameSnapshot: listing.name,
            priceVnd: listing.priceVnd,
            qty: 1,
          },
          select: { id: true },
        });
        const fulfillment = await tx.fulfillment.create({
          data: {
            orderItemId: item.id,
            method: AdminStoreService.METHOD[kind] ?? 'manual',
            status: 'pending',
            steps: [
              {
                buoc: 'ghi-nhan-quyen',
                luc: now.toISOString(),
                ok: true,
                ghiChu: `Cấp tay bởi ${actor.email}`,
              },
            ],
          },
          select: { id: true },
        });
        const ent = await tx.entitlement.create({
          data: {
            userId: user.id,
            kind: entKind,
            listingId: listing.id,
            orderId: order.id,
            grantedBy: actor.id,
            // expiresAt để null = vĩnh viễn. Mã nguồn đã mua thì không hết hạn; `tool_premium`
            // theo tháng sẽ cần hạn, nhưng đó là đường đăng ký chứ không phải đường cấp tay này.
          },
          select: { id: true },
        });
        return { orderId: order.id, entitlementId: ent.id, fulfillmentId: fulfillment.id };
      });
    } catch (err: unknown) {
      // P2002 = đụng `@@unique([userId, kind, listingId])`. Hai lượt cấp song song (bấm nút hai
      // lần, hoặc hai nhân viên cùng xử một khách) chạy tới đây cùng lúc; giao dịch thua cuộc bị
      // cuộn lại TOÀN BỘ, nên không có đơn mồ côi nào ở lại. Đọc lại và trả về bản của người
      // thắng — đúng bằng kết quả của nhánh idempotent phía trên.
      if ((err as { code?: string }).code === 'P2002') {
        const again = await this.prisma.entitlement.findFirst({
          where: { userId: user.id, kind: entKind, listingId: listing.id },
          select: { id: true, orderId: true },
        });
        if (again) return this.existingGrant(again, user, listing.name);
      }
      throw err;
    }

    await this.audit.log(actor.id, actor.email, 'store.grant', listing.id, {
      userId: user.id,
      userEmail: user.email,
      orderId: result.orderId,
      orderCode: code,
      entitlementId: result.entitlementId,
      kind: listing.kind,
      priceVnd: listing.priceVnd,
      note: dto.note?.trim()?.slice(0, 500) || null,
    });

    return {
      created: true,
      entitlementId: result.entitlementId,
      order: {
        orderId: result.orderId,
        code,
        userId: user.id,
        userEmail: user.email,
        listingId: listing.id,
        listingName: listing.name,
        kind,
        priceVnd: listing.priceVnd,
        entitlementId: result.entitlementId,
        fulfillmentId: result.fulfillmentId,
        fulfillmentMethod: AdminStoreService.METHOD[kind] ?? 'manual',
        createdAt: now.toISOString(),
      },
      message: `Đã cấp "${listing.name}" cho ${user.email}. Đơn ${code} — phần bàn giao còn ở trạng thái chờ.`,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Phần dùng chung
  // ───────────────────────────────────────────────────────────────────────────

  /** Tìm người nhận theo userId hoặc email. Email so sánh KHÔNG phân biệt hoa thường. */
  private async resolveUser(dto: GrantListingDto): Promise<{ id: string; email: string }> {
    const email = dto.email?.trim().toLowerCase();
    if (!dto.userId && !email) {
      throw new BadRequestException('Cần email hoặc userId của người nhận');
    }
    const user = dto.userId
      ? await this.prisma.user.findUnique({
          where: { id: dto.userId },
          select: { id: true, email: true },
        })
      : await this.prisma.user.findFirst({
          where: { email: { equals: email as string, mode: 'insensitive' } },
          select: { id: true, email: true },
        });
    if (!user) {
      // KHÔNG tự tạo tài khoản ở đây. Gõ sai một ký tự trong email sẽ sinh ra một tài khoản ma
      // giữ quyền với món hàng, còn khách thật thì vẫn không nhận được gì — và không ai phát
      // hiện ra cho tới khi họ gọi điện hỏi. Mời khách đăng ký trước là bước rẻ hơn nhiều.
      throw new NotFoundException(
        dto.userId
          ? 'Không tìm thấy tài khoản theo userId'
          : `Chưa có tài khoản nào dùng email ${email} — mời khách đăng ký trước rồi cấp lại`,
      );
    }
    return user;
  }

  /** Dựng câu trả lời cho lần cấp LẶP LẠI — không tạo gì thêm, chỉ kể lại thứ đã có. */
  private async existingGrant(
    ent: { id: string; orderId: string | null },
    user: { id: string; email: string },
    listingName: string,
  ): Promise<GrantResult> {
    if (!ent.orderId) {
      // Quyền có sẵn nhưng không kèm đơn: bản nhập từ hệ B, hoặc một lần cấp tay từ trước khi
      // tuyến này tồn tại. Vẫn KHÔNG dựng đơn bù — một đơn "paid" ghi ngày hôm nay cho một lần
      // bán từ năm ngoái là làm sai sổ sách để cho giao diện đẹp.
      return {
        created: false,
        order: null,
        entitlementId: ent.id,
        message: `${user.email} đã có quyền với "${listingName}" từ trước (quyền cấp tay, không kèm đơn). Không tạo đơn mới.`,
      };
    }
    const order = await this.prisma.order.findUnique({
      where: { id: ent.orderId },
      select: {
        id: true,
        code: true,
        createdAt: true,
        items: {
          select: {
            id: true,
            kind: true,
            listingId: true,
            nameSnapshot: true,
            priceVnd: true,
            fulfillment: { select: { id: true, method: true } },
          },
          take: 1,
        },
      },
    });
    if (!order) {
      // Dữ liệu lệch (đơn bị xoá tay dưới CSDL). Không ném lỗi 500 vào mặt nhân viên bán hàng vì
      // một chuyện họ không gây ra và không sửa được — nói thật rồi để họ đi tiếp.
      this.logger.warn(`entitlement ${ent.id} trỏ tới order ${ent.orderId} không còn tồn tại`);
      return {
        created: false,
        order: null,
        entitlementId: ent.id,
        message: `${user.email} đã có quyền với "${listingName}", nhưng đơn kèm theo không còn trong cơ sở dữ liệu.`,
      };
    }
    const item = order.items[0];
    return {
      created: false,
      entitlementId: ent.id,
      order: {
        orderId: order.id,
        code: order.code,
        userId: user.id,
        userEmail: user.email,
        listingId: item?.listingId ?? '',
        listingName: item?.nameSnapshot ?? listingName,
        kind: (item?.kind ?? 'sourcecode') as StoreKind,
        priceVnd: item?.priceVnd ?? 0,
        entitlementId: ent.id,
        fulfillmentId: item?.fulfillment?.id ?? null,
        fulfillmentMethod: item?.fulfillment?.method ?? null,
        createdAt: order.createdAt.toISOString(),
      },
      message: `${user.email} đã có quyền với "${listingName}" (đơn ${order.code}). Không tạo đơn thứ hai.`,
    };
  }

  /**
   * Mã đơn: `DH` + 6 ký tự base36 in hoa, sinh và kiểm trùng đúng theo nếp của `Payment.code`
   * (`PaymentsService.randomCode`/`uniqueCode`).
   *
   * Tiền tố KHÁC `TW` là có chủ ý. `Payment.code` là nội dung khách gõ vào ô chuyển khoản, và bộ
   * đối soát SePay tìm nó bằng `content.includes(code)`. Dùng chung một tiền tố thì một mã đơn
   * lọt vào nội dung chuyển khoản sẽ nằm trong cùng một không gian tên với mã thanh toán — hai
   * thứ đếm tiền khác nhau, trộn vào nhau một lần là đủ hỏng một buổi đối soát.
   */
  private static randomOrderCode(): string {
    const b = randomBytes(8);
    let s = '';
    for (let i = 0; i < b.length && s.length < 6; i += 1) {
      s += (b[i] % 36).toString(36);
    }
    return 'DH' + s.toUpperCase();
  }

  private async uniqueOrderCode(): Promise<string> {
    for (let i = 0; i < 60; i += 1) {
      const code = AdminStoreService.randomOrderCode();
      // eslint-disable-next-line no-await-in-loop
      const exists = await this.prisma.order.findUnique({ where: { code }, select: { id: true } });
      if (!exists) return code;
    }
    // Gần như không xảy ra; nới bằng hậu tố ngẫu nhiên dài hơn thay vì ném lỗi vào giữa một lần bán.
    return ('DH' + randomBytes(8).toString('hex')).slice(0, 14).toUpperCase();
  }

  /**
   * Các trường ghi được, đã lọc. Dùng chung cho `create` và `update` — hai đường ghi khác nhau
   * mà lọc khác nhau là cách để một lỗ hổng chỉ xuất hiện ở một trong hai.
   *
   * `currentDetail` chỉ truyền khi SỬA: khi đó `detail` được gộp theo khoá thay vì thay cả khối.
   */
  private writableFields(
    dto: UpdateListingDto,
    currentDetail?: StoreListingDetail,
  ): Record<string, unknown> {
    return {
      ...(dto.descriptionShort !== undefined
        ? { descriptionShort: dto.descriptionShort.trim() || null }
        : {}),
      ...(dto.description !== undefined ? { description: dto.description || null } : {}),
      ...(dto.thumbnailUrl !== undefined ? { thumbnailUrl: dto.thumbnailUrl.trim() || null } : {}),
      ...(dto.gallery !== undefined
        ? { gallery: dto.gallery.map((s) => String(s).trim()).filter(Boolean).slice(0, 24) }
        : {}),
      ...(dto.priceVnd !== undefined ? { priceVnd: dto.priceVnd } : {}),
      ...(dto.compareAtVnd !== undefined ? { compareAtVnd: dto.compareAtVnd || null } : {}),
      ...(dto.category !== undefined ? { category: dto.category.trim() || null } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      ...(dto.detail !== undefined
        ? { detail: AdminStoreService.cleanDetail(dto.detail, currentDetail) }
        : {}),
      ...(dto.seo !== undefined ? { seo: AdminStoreService.cleanSeo(dto.seo) } : {}),
      ...(dto.notesInternal !== undefined
        ? { notesInternal: dto.notesInternal.trim() || null }
        : {}),
      // Chuỗi rỗng = gỡ liên kết. Quan hệ là `onDelete: SetNull` nên `null` là giá trị hợp lệ.
      ...(dto.appId !== undefined ? { appId: dto.appId.trim() || null } : {}),
      ...(dto.buildId !== undefined ? { buildId: dto.buildId.trim() || null } : {}),
    };
  }

  /**
   * Lọc `detail` theo danh sách trắng và GỘP với giá trị đang có.
   *
   * Cột này đi THẲNG ra `GET /v1/store/:kind/:slug` công khai. Mọi khoá lọt vào đây là công
   * khai, kể cả khi người gửi tưởng nó là ghi chú nội bộ. Ba khoá đường giao hàng bị từ chối
   * thẳng (400) chứ không lọc im lặng — xem `DELIVERY_KEYS`.
   */
  private static cleanDetail(
    input: StoreListingDetail,
    current?: StoreListingDetail,
  ): Record<string, unknown> {
    const src = (input ?? {}) as Record<string, unknown>;
    const leaked = AdminStoreService.DELIVERY_KEYS.filter((k) => k in src);
    if (leaked.length) {
      throw new BadRequestException(
        `Không được đặt ${leaked.join(', ')} trong "detail" — detail đi thẳng ra API công khai. Dùng tuyến PUT .../delivery (mã hoá, chỉ quản trị đọc).`,
      );
    }
    const out: Record<string, unknown> = { ...((current ?? {}) as Record<string, unknown>) };
    for (const key of AdminStoreService.DETAIL_KEYS) {
      if (!(key in src)) continue;
      const v = src[key];
      if (v === null || v === undefined || v === '') {
        delete out[key];
        continue;
      }
      if (key === 'languages') {
        out[key] = (Array.isArray(v) ? v : [v])
          .map((s) => String(s).trim())
          .filter(Boolean)
          .slice(0, 30);
      } else if (key === 'availableCount') {
        out[key] = Math.max(0, Math.trunc(Number(v) || 0));
      } else if (key === 'specDocument') {
        // Tài liệu đặc tả là markdown dài — trần 200k ký tự, đủ cho một cuốn hướng dẫn và vẫn
        // giữ cho một dòng JSONB không phình thành thứ phải đọc riêng.
        out[key] = String(v).slice(0, 200_000);
      } else {
        out[key] = String(v).slice(0, 5000);
      }
    }
    return out;
  }

  /**
   * Lọc `seo` theo `shared.AppSeo` — cùng danh sách trắng và cùng mặc định với
   * `AppsService.updateSeo`, cố ý giống hệt: hai chỗ sinh ra thẻ meta mà hiểu mặc định khác nhau
   * thì một trang bán sẽ `noindex` trong khi giao diện hiện là "đang bật".
   *
   * Mặc định là BẬT (`!== false`): một món chưa ai cấu hình SEO vẫn phải lên được Google.
   */
  private static cleanSeo(seo: AppSeo): Record<string, unknown> {
    const s = seo ?? {};
    return {
      enabled: s.enabled !== false,
      ...(s.title ? { title: String(s.title).slice(0, 200) } : {}),
      ...(s.description ? { description: String(s.description).slice(0, 500) } : {}),
      ...(s.keywords ? { keywords: String(s.keywords).slice(0, 300) } : {}),
      ...(s.ogImage ? { ogImage: String(s.ogImage).slice(0, 1000) } : {}),
      index: s.index !== false,
      sitemap: s.sitemap !== false,
      robots: s.robots !== false,
      aiDiscovery: s.aiDiscovery !== false,
    };
  }

  /** Giải mã `deliveryEnc`. Giải mã hỏng ⇒ khối rỗng + một dòng cảnh báo, không ném lỗi. */
  private readDelivery(blob: string | null, id: string): ListingDelivery {
    const empty: ListingDelivery = { driveLink: null, zipFileUrl: null, gitlabRepoId: null };
    if (!blob) return empty;
    const data = decryptJson<Partial<ListingDelivery>>(blob, this.config.env.JWT_SECRET);
    if (!data) {
      // `decryptJson` nuốt lỗi và trả null — thường nghĩa là JWT_SECRET đã đổi sau khi cột này
      // được ghi. Im lặng ở đây sẽ thành "món này chưa có link tải" trên giao diện, và ai đó sẽ
      // dán lại link tay mà không hiểu vì sao nó biến mất.
      this.logger.warn(
        `deliveryEnc của listing ${id} không giải mã được — JWT_SECRET có thể đã đổi kể từ lần ghi`,
      );
      return empty;
    }
    return {
      driveLink: AdminStoreService.trimOrNull(data.driveLink ?? undefined),
      zipFileUrl: AdminStoreService.trimOrNull(data.zipFileUrl ?? undefined),
      gitlabRepoId: AdminStoreService.trimOrNull(data.gitlabRepoId ?? undefined),
    };
  }

  private static trimOrNull(v: string | null | undefined): string | null {
    const s = (v ?? '').trim();
    return s ? s : null;
  }

  /**
   * Slug về dạng đường dẫn được. KHÔNG dùng `shared.slugify` ở đây: hàm đó cắt ở 40 ký tự và ép
   * về `'app'` khi rỗng — hợp lý cho tên dự án Cloudflare Pages, sai cho một URL cửa hàng đang
   * có mặt trên Google với slug dài hơn thế (dữ liệu hệ B có slug 60–80 ký tự).
   */
  private static normalizeSlug(raw: string): string {
    const s = (raw ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120)
      .replace(/-+$/g, '');
    if (!s) throw new BadRequestException('Slug không hợp lệ (sau khi chuẩn hoá còn rỗng)');
    return s;
  }

  private static toStringArray(v: unknown): string[] {
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  }

  /**
   * P2002 trên `@@unique([kind, slug])` → 409 với câu nói rõ slug nào đụng. Lỗi khác thì trả
   * nguyên để nó nổi lên chỗ xử lý lỗi chung — nuốt hết vào một câu "trùng slug" sẽ che mất
   * những hỏng hóc thật (ví dụ `appId` trỏ tới một App không tồn tại).
   */
  private static slugConflict(err: unknown, kind: string, slug: string): unknown {
    if ((err as { code?: string }).code === 'P2002') {
      return new ConflictException(`Loại "${kind}" đã có món dùng slug "${slug}"`);
    }
    return err;
  }

  /** Cắt `deliveryEnc` thành một boolean — chuỗi mã hoá dừng lại ở đây, không đi tiếp. */
  private static toRow(r: {
    id: string;
    kind: string;
    slug: string;
    name: string;
    descriptionShort: string | null;
    thumbnailUrl: string | null;
    priceVnd: number;
    compareAtVnd: number | null;
    category: string | null;
    status: string;
    sortOrder: number;
    totalSold: number;
    appId: string | null;
    buildId: string | null;
    legacyId: string | null;
    createdAt: Date;
    updatedAt: Date;
    deliveryEnc: string | null;
  }): AdminListingRow {
    return {
      id: r.id,
      kind: r.kind as StoreKind,
      slug: r.slug,
      name: r.name,
      descriptionShort: r.descriptionShort,
      thumbnailUrl: r.thumbnailUrl,
      priceVnd: r.priceVnd,
      compareAtVnd: r.compareAtVnd,
      category: r.category,
      status: r.status as ListingStatus,
      sortOrder: r.sortOrder,
      totalSold: r.totalSold,
      hasDelivery: !!r.deliveryEnc,
      appId: r.appId,
      buildId: r.buildId,
      legacyId: r.legacyId,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}

/*
 * VÌ SAO KHÔNG CÓ `remove()`.
 *
 * Xoá một `Listing` là xoá thứ mà `OrderItem` đã bán trỏ về. Quan hệ khai `onDelete: SetNull`
 * nên đơn cũ không chết theo, nhưng từ giây phút đó không còn đường nào đi từ một đơn về món đã
 * bán, và `Entitlement.listingId` cũng thành null — tức người đã mua mất quyền mà không ai ra
 * lệnh đó. `status='hidden'` làm đúng việc mà người bấm "xoá" thật sự muốn: gỡ khỏi mặt tiền.
 * Khi nào cần dọn hàng nhập sai thật thì làm bằng script có đối chiếu `legacyId`, không làm bằng
 * một nút trên giao diện.
 */
