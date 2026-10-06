import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { BuildsService } from '../builds/builds.service';
import { AppsService } from '../apps/apps.service';
import { MeService } from '../me/me.service';
import { CreateBuildDto } from '../builds/builds.dto';
import { AppQueryDto } from '../apps/apps.dto';

/**
 * Public Developer API (/v1/pub/*) — authed by an API key (not JWT), so external programs can
 * build apps + read status on the user's behalf. Every call is metered against the same monthly %
 * budget as the web/desktop apps (BuildsService gates + meters). @Public() skips the global JWT
 * guard; ApiKeyGuard enforces a valid `Authorization: Bearer tw_...` and sets req.user.
 */
@Public()
@UseGuards(ApiKeyGuard)
@Controller('pub')
export class PublicApiController {
  constructor(
    private readonly builds: BuildsService,
    private readonly apps: AppsService,
    private readonly me: MeService,
  ) {}

  /** Create an app from a prompt (kicks off a build). Returns { appId, buildId }. */
  @Post('apps')
  createApp(@CurrentUser() u: AuthUser, @Body() dto: CreateBuildDto) {
    return this.builds.create(u, dto);
  }

  /** Poll a build's status (stage, status, deploy URL when live). */
  @Get('builds/:id')
  buildStatus(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.builds.get(u, id);
  }

  /** List the caller's apps. */
  @Get('apps')
  listApps(@CurrentUser() u: AuthUser, @Query() q: AppQueryDto) {
    return this.apps.list(u, q);
  }

  /** Current plan + % of the monthly budget used. */
  @Get('me')
  usage(@CurrentUser() u: AuthUser) {
    return this.me.subscription(u);
  }
}
