import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { App, Paginated } from '@larkwave/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { AppsService } from './apps.service';
import { AppQueryDto, SuspendAppDto } from './apps.dto';

/**
 * Admin moderation surface for apps (`/v1/admin/apps`). Reuses AppsService;
 * the admin role bypasses owner-scoping in `list`/`load`, so these routes can
 * monitor + act on ANY app. Takedown is the existing DELETE /v1/apps/:id.
 */
@Roles('admin')
@Controller('admin/apps')
export class AdminAppsController {
  constructor(private readonly apps: AppsService) {}

  /**
   * Admin app list. Adds a computed `flagged` per app (banned-keyword match on
   * name/description/latest build prompt) and supports `?flagged=true` and
   * `?status=suspended` filters. Includes owner email, currentUrl, suspendReason.
   */
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: AppQueryDto): Promise<Paginated<App>> {
    return this.apps.list(user, query);
  }

  /**
   * Dựng lại một app mà KHÔNG sinh code — chỉ build + deploy lại từ file của bản dựng gần nhất.
   *
   * Dùng khi NỀN TẢNG đổi thứ mà nó nướng vào từng app lúc deploy: header bảo mật, đoạn đếm lượt
   * xem, huy hiệu, thẻ SEO. Sửa mã nguồn ở đây không chạm được vào app đã deploy — chúng chỉ nhận
   * giá trị mới ở lượt deploy kế tiếp. Xem chú thích ở AppsService.redeployLatest.
   */
  @Post(':id/redeploy')
  redeploy(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ buildId: string }> {
    return this.apps.redeployLatest(id, user);
  }

  /**
   * Free Cloudflare D1 slots: delete `tw-*` databases not referenced by any app.
   * (Free plan caps at 10 D1/account — this reclaims orphans from failed/deleted builds.)
   */
  @Post('cleanup-d1')
  cleanupD1(): Promise<{ total: number; deleted: number; kept: number; names: string[] }> {
    return this.apps.cleanupOrphanD1();
  }

  /**
   * Trang web của app ĐÃ XOÁ mà vẫn còn sống trên Cloudflare.
   *
   * Hai bước tách rời: xem danh sách trước (`GET`), xoá sau (`POST`). Tên dự án Pages là slug
   * ngẫu nhiên, không có tiền tố nhận dạng như D1, nên xoá mù là rủi ro mất một trang thật.
   */
  @Get('orphan-pages')
  listOrphanPages(): Promise<{ orphans: string[]; total: number; kept: number }> {
    return this.apps.listOrphanPages();
  }

  @Post('cleanup-pages')
  cleanupPages(): Promise<{ deleted: string[]; failed: { name: string; error: string }[] }> {
    return this.apps.cleanupOrphanPages();
  }

  /** Take a policy-violating app offline (status=suspended, pull DNS). */
  @Post(':id/suspend')
  suspend(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SuspendAppDto,
  ): Promise<App> {
    return this.apps.suspend(user, id, dto);
  }

  /** Lift a suspension and bring the app back online. */
  @Post(':id/unsuspend')
  unsuspend(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<App> {
    return this.apps.unsuspend(user, id);
  }
}
