import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthUser } from '../common/auth-user';
import { RunnerTelemetryService } from './runner-telemetry.service';

/** Giao diện báo một lỗi runner của CHÍNH người dùng (JWT). Fire-and-forget phía client. */
@Controller('me/runner-errors')
export class RunnerTelemetryController {
  constructor(private readonly svc: RunnerTelemetryService) {}

  @Post()
  report(
    @CurrentUser() u: AuthUser,
    @Body() body: { runner?: string; model?: string; kind?: string; message?: string; surface?: string },
  ) {
    return this.svc.report(u.id, body || {});
  }
}

/** Bảng "lỗi runner gần đây" cho người vận hành. */
@Roles('admin')
@Controller('admin/runner-errors')
export class AdminRunnerTelemetryController {
  constructor(private readonly svc: RunnerTelemetryService) {}

  @Get()
  list(
    @Query('days') days?: string,
    @Query('kind') kind?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.svc.listAdmin({
      days: days ? Number(days) : undefined,
      kind: kind || undefined,
      q: q || undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }
}
