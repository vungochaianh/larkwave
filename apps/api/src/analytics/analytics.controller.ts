import { Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import type { AppAnalytics } from '@larkwave/shared';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { AnalyticsService } from './analytics.service';

@Controller()
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /**
   * Public pageview beacon — fired by deployed apps via navigator.sendBeacon on
   * load. No body (data in query) so it's a CORS-safelisted request (no preflight).
   */
  @Public()
  @Post('track/:appId')
  async track(
    @Param('appId') appId: string,
    @Query('r') referrer: string | undefined,
    @Headers('user-agent') ua: string | undefined,
  ): Promise<{ ok: true }> {
    await this.analytics.track(appId, referrer, ua);
    return { ok: true };
  }

  @Get('apps/:id/analytics')
  summary(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('days') days?: string,
  ): Promise<AppAnalytics> {
    return this.analytics.summary(user, id, days ? parseInt(days, 10) : 30);
  }
}
