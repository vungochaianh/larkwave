import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { MaicAdminService } from './maic-admin.service';
import type { MaicEndUser, MaicResellerSummary } from './maic-admin.service';

/**
 * Admin-only view onto MAIC's reseller layer.
 *
 * Larkwave sells plans; MAIC runs the engine and caps each of our users. This is where
 * support answers "why did this person get blocked" and "what has this account actually
 * spent" without anyone needing MAIC's own console or its admin password.
 *
 * Every route returns `null`/an empty shape rather than erroring when MAIC is down or our
 * token is not flagged as a reseller yet — an admin screen that explains it is unavailable
 * is far more useful than one that shows a stack trace.
 */
@Roles('admin')
@Controller('admin/maic')
export class MaicAdminController {
  constructor(private readonly maicAdmin: MaicAdminService) {}

  /** Is the gateway configured at all? Lets the UI show a clear "chưa bật" state. */
  @Get('status')
  status(): { enabled: boolean } {
    return { enabled: this.maicAdmin.enabled };
  }

  @Get('end-users')
  list(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('q') q?: string,
  ): Promise<{ endUsers: MaicEndUser[]; total: number; summary: MaicResellerSummary } | null> {
    return this.maicAdmin.listEndUsers({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      q: q || undefined,
    });
  }

  @Get('end-users/:userId')
  get(@Param('userId') userId: string): Promise<MaicEndUser | null> {
    return this.maicAdmin.getEndUser(userId);
  }

  /** The audit trail behind a disputed charge: every MAIC run attributed to this account. */
  @Get('end-users/:userId/runs')
  runs(
    @Param('userId') userId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<{ runs: unknown[]; total: number } | null> {
    return this.maicAdmin.endUserRuns(userId, {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  /** Re-push this account's plan + cap into MAIC (after a manual plan fix, say). */
  @Post('end-users/:userId/sync')
  sync(@Param('userId') userId: string): Promise<MaicEndUser | null> {
    return this.maicAdmin.syncUser(userId);
  }

  @Post('end-users/:userId/block')
  block(
    @Param('userId') userId: string,
    @Body() body: { blocked?: boolean },
  ): Promise<MaicEndUser | null> {
    return this.maicAdmin.setBlocked(userId, body?.blocked !== false);
  }

  /** Open a fresh usage window — the manual counterpart of the monthly auto-reset. */
  @Post('end-users/:userId/reset-usage')
  resetUsage(@Param('userId') userId: string): Promise<MaicEndUser | null> {
    return this.maicAdmin.resetUsage(userId);
  }

  /**
   * Re-push every account's cap. Run after changing the plan catalog, when every
   * ceiling moves at once and MAIC would otherwise keep enforcing the old numbers.
   */
  @Post('sync-all')
  syncAll(@Body() body: { limit?: number }): Promise<{ synced: number; failed: number }> {
    return this.maicAdmin.syncAll(body?.limit ?? 500);
  }
}
