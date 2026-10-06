import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { AuthUser } from '../common/auth-user';
import { LarkHostedService, type HostedRunnerStatus } from './lark-hosted.service';

/**
 * `/v1/me/lark-hosted` — người dùng tự bật/tắt việc Larkwave chạy lịch tự động hoá hộ.
 * `/v1/internal/lark-hosted/*` — tiến trình tw-lark-runner lấy khoá để chạy.
 *
 * Hai nhóm nằm CHUNG file có chủ ý: chúng là hai đầu của cùng một đường đi khoá, để cạnh nhau
 * thì người sửa một đầu nhìn thấy ngay đầu kia. Nhưng chúng chắn bằng hai thứ khác hẳn nhau —
 * nhóm `me` bằng JWT người dùng, nhóm `internal` bằng khoá tiến trình — nên đừng gộp guard.
 */
@Controller()
export class LarkHostedController {
  constructor(private readonly svc: LarkHostedService) {}

  @Get('me/lark-hosted')
  status(@CurrentUser() user: AuthUser): Promise<HostedRunnerStatus> {
    return this.svc.status(user.id);
  }

  /** Bật / cập nhật khoá. Desktop gọi với creds nó đang giữ; web gọi với cái người dùng vừa gõ. */
  @Put('me/lark-hosted')
  enable(
    @CurrentUser() user: AuthUser,
    @Body() body: { appId?: string; appSecret?: string; label?: string },
  ): Promise<HostedRunnerStatus> {
    return this.svc.enable(user.id, body || {});
  }

  @Delete('me/lark-hosted')
  disable(@CurrentUser() user: AuthUser): Promise<HostedRunnerStatus> {
    return this.svc.disable(user.id);
  }

  // ── Tiến trình runner ────────────────────────────────────────────────────────────────
  //
  // @Public để guard JWT không chặn, rồi TỰ chắn bằng LARK_RUNNER_SERVICE_KEY. Khoá sai (hoặc
  // máy chủ chưa đặt khoá) ⇒ 404 chứ không phải 401: một endpoint trả 401 là đã xác nhận nó có
  // thật và đáng để thử tiếp.

  @Public()
  @Get('internal/lark-hosted/tenants')
  async tenants(@Headers('x-runner-key') key?: string) {
    if (!this.svc.serviceKeyMatches(key)) throw new NotFoundException();
    return { tenants: await this.svc.tenantsForRunner() };
  }

  @Public()
  @Post('internal/lark-hosted/:userId/status')
  @HttpCode(200)
  async reportStatus(
    @Param('userId') userId: string,
    @Body() body: { error?: string | null },
    @Headers('x-runner-key') key?: string,
  ): Promise<{ ok: true }> {
    if (!this.svc.serviceKeyMatches(key)) throw new NotFoundException();
    await this.svc.reportStatus(userId, body?.error ?? null);
    return { ok: true };
  }
}
