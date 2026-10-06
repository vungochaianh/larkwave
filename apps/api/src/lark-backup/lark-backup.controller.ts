import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { LarkBackupService } from './lark-backup.service';

/** `GET/PUT /v1/me/lark-backup` — the desktop syncs its local Lark data here. */
@Controller('me')
export class LarkBackupController {
  constructor(private readonly svc: LarkBackupService) {}

  @Get('lark-backup')
  get(@CurrentUser() user: AuthUser): Promise<{ data: unknown; updatedAt: string } | null> {
    return this.svc.get(user.id);
  }

  @Put('lark-backup')
  put(@CurrentUser() user: AuthUser, @Body() body: { data?: unknown }): Promise<{ updatedAt: string }> {
    return this.svc.put(user.id, body?.data);
  }

  /**
   * Nhịp tim của bên đang chạy lịch tự động hoá Lark → trả về ai là chủ.
   * Bên KHÔNG phải chủ phải bỏ qua lượt tick của mình, nếu không mỗi lịch chạy hai lần.
   */
  @Post('lark-runner/beat')
  @HttpCode(200)
  runnerBeat(
    @CurrentUser() user: AuthUser,
    @Body() body: { ownerId: string; ownerKind: 'vm' | 'desktop'; label?: string },
  ): Promise<{ ownerId: string; ownerKind: string; label: string; isMine: boolean }> {
    return this.svc.runnerBeat(user.id, {
      ownerId: String(body?.ownerId || '').slice(0, 64) || 'unknown',
      ownerKind: body?.ownerKind === 'vm' ? 'vm' : 'desktop',
      label: String(body?.label || '').slice(0, 80),
    });
  }
}
