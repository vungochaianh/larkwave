import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import type { Paginated } from '@larkwave/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { AdminStoreService } from './admin-store.service';
import {
  AdminListingQueryDto,
  CreateListingDto,
  GrantListingDto,
  ListingDeliveryDto,
  ListingStatusDto,
  UpdateListingDto,
} from './admin-store.dto';
import type {
  AdminListingFull,
  AdminListingRow,
  GrantResult,
  ListingDelivery,
} from './admin-store.dto';

/**
 * Quản trị cửa hàng (`/v1/admin/store/*`) — mặt sau của `cms.toolswave.net`, giai đoạn 2.
 *
 * Đứng tách hẳn khỏi `StoreController`: bên kia là `@Public()` và phục vụ Google, bên này là
 * `@Roles('admin')` và đọc được đường giao hàng. Hai tệp riêng nghĩa là không có cách nào thêm
 * một tuyến vào đây mà vô tình để nó thừa hưởng `@Public()` của lớp bên kia — thứ bảo vệ tốt
 * nhất là thứ không cần ai nhớ.
 *
 * VAI TRÒ: hệ này chỉ có `admin` và `user` (`shared.Role`), nên "nhân viên bán hàng" ở đây là
 * một tài khoản `admin`. Khi nào cần một vai `staff` hẹp hơn — cấp được hàng nhưng không sửa
 * được giá — thì nó là việc của tầng vai trò, không phải việc của tệp này; mỗi lần cấp đều đã
 * ghi `Order.grantedBy` + một dòng `AuditLog`, nên vẫn truy ra được ai làm gì.
 */
@Roles('admin')
@Controller('admin/store')
export class AdminStoreController {
  constructor(private readonly store: AdminStoreService) {}

  /** Bảng danh mục — lọc theo loại/trạng thái/chuyên mục, `q` tìm trong tên + slug. */
  @Get('listings')
  list(@Query() q: AdminListingQueryDto): Promise<Paginated<AdminListingRow>> {
    return this.store.list(q);
  }

  @Get('listings/:id')
  get(@Param('id') id: string): Promise<AdminListingFull> {
    return this.store.get(id);
  }

  @Post('listings')
  create(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateListingDto,
  ): Promise<AdminListingFull> {
    return this.store.create(actor, dto);
  }

  /**
   * Sửa một món. Trường không gửi = để yên (PATCH đúng nghĩa), nên trang quản trị lưu được
   * riêng ô tài liệu đặc tả mà không phải gửi lại toàn bộ biểu mẫu — và không phải lo hai người
   * sửa hai ô khác nhau ghi đè lên nhau.
   */
  @Patch('listings/:id')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateListingDto,
  ): Promise<AdminListingFull> {
    return this.store.update(actor, id, dto);
  }

  /** Ẩn/hiện/đánh dấu hết hàng — một nút, một dòng nhật ký đọc được. */
  @Post('listings/:id/status')
  setStatus(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: ListingStatusDto,
  ): Promise<AdminListingRow> {
    return this.store.setStatus(actor, id, dto.status);
  }

  /**
   * Đường giao hàng (driveLink / zipFileUrl / gitlabRepoId) — đọc ĐÃ GIẢI MÃ, chỉ ở tuyến này.
   *
   * Cố ý là một tuyến con riêng chứ không phải một trường trong `GET listings/:id`: bảng danh
   * sách và trang chi tiết được mở hàng chục lần mỗi ngày, còn đường giao hàng thì chỉ cần lúc
   * dựng món hoặc lúc chữa một link chết. Tách ra thì nhật ký `delivery.read` đếm đúng những
   * lần thật sự có người nhìn vào nó.
   */
  @Get('listings/:id/delivery')
  delivery(@CurrentUser() actor: AuthUser, @Param('id') id: string): Promise<ListingDelivery> {
    return this.store.delivery(actor, id);
  }

  /** Đặt lại đường giao hàng — THAY cả khối (gửi object rỗng = xoá sạch). */
  @Put('listings/:id/delivery')
  setDelivery(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: ListingDeliveryDto,
  ): Promise<ListingDelivery> {
    return this.store.setDelivery(actor, id, dto);
  }

  /**
   * Cấp một dự án thẳng vào tài khoản khách — đường bán hàng tay của hôm nay.
   *
   * Idempotent theo (người nhận, món): gọi lại trả về đúng đơn cũ với `created=false`, không
   * sinh đơn thứ hai. Nhân viên bấm hai lần hoặc gọi lại sau một lần mạng rớt là chuyện thường,
   * và cái giá của việc không chống là báo cáo doanh thu đếm đôi.
   *
   * Lời gọi này mới chỉ GHI NHẬN QUYỀN. Phần bàn giao thật (mời vào repo GitLab, nhân bản App
   * sang tài khoản người mua) để lại `Fulfillment` ở trạng thái `pending` — xem mục 6 của
   * docs/hop-nhat-cua-hang-va-nen-tang.md.
   */
  @Post('grants')
  grant(@CurrentUser() actor: AuthUser, @Body() dto: GrantListingDto): Promise<GrantResult> {
    return this.store.grant(actor, dto);
  }
}
