import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { LarkConvService } from './lark-conv.service';
import { LarkGrantService } from './lark-grant.service';

/**
 * `/v1/me/lark-convs` — hội thoại DÙNG CHUNG của Lark Agents.
 *
 * Mọi lượt agent do người được chia sẻ gửi vẫn đi qua `LarkGrantService.submitTurn`, tức là vẫn
 * chịu đúng chính sách của grant. Controller này KHÔNG có đường nào chạy thẳng.
 */
@Controller('me/lark-convs')
export class LarkConvController {
  constructor(
    private readonly svc: LarkConvService,
    private readonly grants: LarkGrantService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.svc.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: { grantId?: string; title?: string }) {
    return this.svc.create(user.id, String(body?.grantId || ''), String(body?.title || ''));
  }

  /** Các dòng SAU `after` (con trỏ `seq`). Máy khách gọi lặp để theo dõi luồng. */
  @Get(':id/items')
  items(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('after') after?: string) {
    return this.svc.items(user.id, id, Number(after) || 0);
  }

  @Post(':id/items')
  post(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { text?: string; run?: boolean },
  ) {
    return this.svc.post(
      user.id,
      id,
      body || {},
      (actorId, grantId, prompt) => this.grants.submitTurn(actorId, grantId, prompt),
    );
  }
}
