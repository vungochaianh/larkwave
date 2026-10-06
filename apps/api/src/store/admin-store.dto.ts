import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { AppSeo, StoreKind, StoreListingDetail } from '@larkwave/shared';
import { STORE_KINDS } from '@larkwave/shared';
import { PaginationDto } from '../common/dto/pagination.dto';

/**
 * Hợp đồng của TRANG QUẢN TRỊ cửa hàng — cố ý KHÔNG nằm trong `@larkwave/shared`.
 *
 * `shared` là thứ cả web công khai lẫn API cùng đọc; nhét hình dạng quản trị vào đó là mở đường
 * cho một trường nội bộ (ghi chú, đường giao hàng, giá vốn) đi nhờ sang phía công khai chỉ vì nó
 * "có sẵn ở chỗ đó". Trang quản trị nằm trong cùng một app Next (gate theo vai trò), nên nó đọc
 * được các kiểu này qua đường import bình thường mà không cần đẩy lên gói dùng chung.
 *
 * `StoreListing` trong `shared` KHÔNG đổi hình dạng — đó là hợp đồng công khai của giai đoạn 1
 * và ba trang web đang dựa vào nó.
 */

/** active | hidden | sold_out — khớp chú thích `Listing.status` trong schema. */
export const LISTING_STATUSES = ['active', 'hidden', 'sold_out'] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

/**
 * `GET /v1/admin/store/listings?kind=&status=&category=&q=&page=&pageSize=`
 *
 * `q` thừa kế từ `PaginationDto` (tìm trong tên + slug). Không có tham số nào bật được
 * `deliveryEnc` — đường giao hàng có tuyến riêng, xem `AdminStoreController.delivery`.
 */
export class AdminListingQueryDto extends PaginationDto {
  @IsOptional()
  @IsIn(STORE_KINDS as readonly string[])
  kind?: StoreKind;

  @IsOptional()
  @IsIn(LISTING_STATUSES as readonly string[])
  status?: ListingStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;
}

/**
 * Phần thân dùng chung cho tạo và sửa. Mọi trường đều tuỳ chọn ở bản sửa (PATCH: thiếu trường
 * nghĩa là "để yên", không phải "xoá đi") — nên `CreateListingDto` bắt buộc riêng `kind`, `slug`,
 * `name` bằng cách khai lại chúng.
 *
 * `detail` và `seo` khai là `@IsObject()` chứ không phải DTO lồng nhau: `ValidationPipe` của hệ
 * này bật `whitelist` ở tầng trên cùng nhưng KHÔNG lọc sâu vào object con, nên một DTO lồng nhau
 * ở đây chỉ tạo cảm giác an toàn giả. Việc lọc thật nằm ở `AdminStoreService.cleanDetail` /
 * `cleanSeo`, nơi có thể từ chối thẳng những khoá không được phép.
 */
export class UpdateListingDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  /**
   * Đổi slug là ĐỔI ĐƯỜNG DẪN của một trang đang có mặt trên Google. Cho phép, vì đôi khi buộc
   * phải sửa một slug sai chính tả, nhưng service kiểm trùng theo `@@unique([kind, slug])` và
   * ghi vào nhật ký — để sau này còn truy ra vì sao một URL biến mất.
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descriptionShort?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200_000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  thumbnailUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  gallery?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceVnd?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  compareAtVnd?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @IsOptional()
  @IsIn(LISTING_STATUSES as readonly string[])
  status?: ListingStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  /**
   * `shared.StoreListingDetail`. GỘP theo từng khoá chứ không ghi đè cả object (xem service):
   * trang quản trị sửa tài liệu đặc tả thường chỉ gửi `specDocument`, và ghi đè cả khối sẽ thổi
   * bay `languages` do script nhập dựng ra.
   */
  @IsOptional()
  @IsObject()
  detail?: StoreListingDetail;

  /** `shared.AppSeo` — dùng lại đúng cơ chế SEO của app, không đẻ thêm một hình dạng thứ hai. */
  @IsOptional()
  @IsObject()
  seo?: AppSeo;

  /** Ghi chú nội bộ. Không bao giờ ra API công khai — `store.service.ts` không đọc cột này. */
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  notesInternal?: string;

  /** Với kind=app|tool: App của nền tảng đứng sau món này. Chuỗi rỗng = gỡ liên kết. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  appId?: string;

  /** Bản build ĐÓNG BĂNG được bán. Chuỗi rỗng = bỏ ghim. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  buildId?: string;
}

/**
 * `POST /v1/admin/store/listings` — dựng một món bằng tay.
 *
 * Phần lớn danh mục sẽ do script nhập từ hệ B đổ vào, nhưng `kind=service` (làm theo yêu cầu) và
 * các món `app` của giai đoạn 4 không có nguồn nào khác ngoài chỗ này.
 *
 * CẠM BẪY đã cắn ở đây: khai lại `slug`/`name` bên dưới chỉ làm chúng bắt buộc với TRÌNH BIÊN
 * DỊCH, không làm chúng bắt buộc lúc chạy. class-validator kế thừa metadata của lớp cha, và
 * `@IsOptional()` của `UpdateListingDto` bỏ qua mọi validator còn lại khi giá trị là undefined.
 * Nên `AdminStoreService.create` kiểm lại bằng tay — đừng gỡ đoạn kiểm đó.
 */
export class CreateListingDto extends UpdateListingDto {
  @IsIn(STORE_KINDS as readonly string[])
  kind!: StoreKind;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  declare slug: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  declare name: string;
}

/** `POST /v1/admin/store/listings/:id/status` — ẩn/hiện/đánh dấu hết hàng. */
export class ListingStatusDto {
  @IsIn(LISTING_STATUSES as readonly string[])
  status!: ListingStatus;
}

/**
 * Đường giao hàng — nội dung của cột `Listing.deliveryEnc` (đã mã hoá AES-256-GCM).
 *
 * Ba trường này là thứ vừa bị bịt ở portal hôm 23/09 vì chúng lọt ra API công khai. Chúng đi
 * bằng DTO RIÊNG, tuyến RIÊNG, và không bao giờ xuất hiện trong `UpdateListingDto` — để việc
 * "lỡ tay gửi kèm khi sửa mô tả" là chuyện không thể xảy ra chứ không phải chuyện phải nhớ.
 */
export class ListingDeliveryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  driveLink?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  zipFileUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  gitlabRepoId?: string;
}

/**
 * `POST /v1/admin/store/grants` — nhân viên bán hàng cấp một dự án thẳng vào tài khoản khách.
 *
 * Nhận `email` HOẶC `userId`. Email là thứ nhân viên có trong tay sau một cuộc gọi; userId là
 * thứ trang quản trị có sau khi chọn từ danh sách. Bắt buộc một trong hai — service kiểm, vì
 * class-validator không diễn đạt được "đúng một trong hai" mà không kéo theo một decorator tự chế.
 */
export class GrantListingDto {
  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  userId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  listingId!: string;

  /**
   * VÌ SAO cấp — đi vào `Order.grantNote`. Không bắt buộc ở tầng kiểu, nhưng một đơn giá 0 đồng
   * không có lý do là thứ không ai giải thích nổi sau sáu tháng.
   */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hình dạng TRẢ VỀ
// ─────────────────────────────────────────────────────────────────────────────

/** Một dòng trong bảng quản trị. KHÔNG có `deliveryEnc`, và cũng không có chỗ nào để nó lọt vào. */
export interface AdminListingRow {
  id: string;
  kind: StoreKind;
  slug: string;
  name: string;
  descriptionShort: string | null;
  thumbnailUrl: string | null;
  priceVnd: number;
  compareAtVnd: number | null;
  category: string | null;
  status: ListingStatus;
  sortOrder: number;
  totalSold: number;
  /** Có đường giao hàng chưa — chỉ là CÓ/KHÔNG, không kèm nội dung. */
  hasDelivery: boolean;
  appId: string | null;
  buildId: string | null;
  legacyId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Trang chi tiết một món: thêm phần dài (mô tả, detail, seo, ghi chú nội bộ). */
export interface AdminListingFull extends AdminListingRow {
  description: string | null;
  gallery: string[];
  detail: StoreListingDetail;
  seo: AppSeo | null;
  notesInternal: string | null;
  /** Số suất tồn kho còn bán được (chỉ kind=software mới khác 0). */
  availableInventory: number;
}

/** Nội dung `deliveryEnc` đã giải mã — chỉ tuyến delivery trả về thứ này. */
export interface ListingDelivery {
  driveLink: string | null;
  zipFileUrl: string | null;
  gitlabRepoId: string | null;
}

/** Đơn do quản trị cấp, dạng rút gọn đủ để trang quản trị hiện lại cho nhân viên. */
export interface GrantedOrder {
  orderId: string;
  code: string;
  userId: string;
  userEmail: string;
  listingId: string;
  listingName: string;
  kind: StoreKind;
  priceVnd: number;
  entitlementId: string;
  fulfillmentId: string | null;
  fulfillmentMethod: string | null;
  createdAt: string;
}

export interface GrantResult {
  /** `false` = tài khoản này ĐÃ có quyền với món đó; không có đơn thứ hai nào được tạo. */
  created: boolean;
  order: GrantedOrder | null;
  entitlementId: string;
  /**
   * Câu giải thích cho người đứng ở trang quản trị. Khi `created=false` vì quyền cũ được cấp
   * tay (không có đơn kèm theo), `order` là null và chỉ dòng này nói được điều đó.
   */
  message: string;
}
