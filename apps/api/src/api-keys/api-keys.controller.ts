import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { ApiKeysService } from './api-keys.service';
import { API_SCOPES, SCOPE_LABELS } from './api-scopes';

/** Manage your own Developer API keys (JWT-authed — used by the /api console). */
@Controller('me/api-keys')
export class ApiKeysController {
  constructor(private readonly svc: ApiKeysService) {}

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.svc.list(u.id);
  }

  /** Các quyền có thể cấp cho một key — giao diện dựng ô chọn từ đây, không tự bịa danh sách. */
  @Get('scopes')
  scopes() {
    return API_SCOPES.map((id) => ({ id, label: SCOPE_LABELS[id] }));
  }

  /**
   * Báo cáo dùng của MỘT key: lượt tháng này, tỉ lệ lỗi, top tuyến đường, các lượt gần nhất.
   *
   * Khai TRƯỚC `@Delete(':id')`/`@Patch(':id')`? Không cần — Nest so khớp theo thứ tự khai và
   * `:id/usage` dài hơn `:id`, nên không đụng nhau. Nhưng `scopes` ở trên thì PHẢI đứng trước mọi
   * tuyến `:id`, nếu không nó bị nuốt thành một id.
   */
  @Get(':id/usage')
  usage(@CurrentUser() u: AuthUser, @Param('id') id: string, @Query('days') days?: string) {
    return this.svc.usage(u.id, id, Number(days) || 30);
  }

  /** Create a key → returns the RAW key ONCE (store it now; it can't be shown again). */
  @Post()
  create(
    @CurrentUser() u: AuthUser,
    @Body() body: { name?: string; scopes?: string[]; monthlyLimit?: number | null },
  ) {
    return this.svc.create(u.id, body?.name ?? '', body?.scopes, body?.monthlyLimit);
  }

  /** Sửa phạm vi / hạn mức / tên của một key đang có. */
  @Patch(':id')
  update(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() body: { name?: string; scopes?: string[]; monthlyLimit?: number | null },
  ) {
    return this.svc.update(u.id, id, body || {});
  }

  @Delete(':id')
  revoke(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.revoke(u.id, id);
  }
}
