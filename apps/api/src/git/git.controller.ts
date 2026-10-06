import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import type { App, AppServicesResponse, GitImportResponse } from '@larkwave/shared';
import type { GitProvider } from '../engine/git-providers.service';
import { GitService } from './git.service';
import type { ReposResult } from './git.service';
import { BuildServiceDto, GitPushDto, ImportRepoDto, RepoQueryDto } from './git.dto';

/** Current-user git integration: list connected repos + import a repo as an app. */
@Controller('me/git')
export class MeGitController {
  constructor(private readonly git: GitService) {}

  /**
   * `GET /v1/me/git/:provider/repos?q=` — list the current user's repos using
   * their stored OAuth token. Returns { connected:false } when not connected.
   */
  @Get(':provider/repos')
  repos(
    @CurrentUser() user: AuthUser,
    @Param('provider') provider: GitProvider,
    @Query() query: RepoQueryDto,
  ): Promise<ReposResult> {
    return this.git.listRepos(user, provider, query.q ?? '', query.page ?? 1);
  }

  /**
   * `POST /v1/me/git/import` — import a connected repo as a new Larkwave app
   * and enqueue a build that deploys it. Returns { appId, buildId }.
   */
  @Post('import')
  import(
    @CurrentUser() user: AuthUser,
    @Body() dto: ImportRepoDto,
  ): Promise<GitImportResponse> {
    return this.git.importRepo(user, dto.provider, dto.repo, dto.branch);
  }
}

/** Push an app's current files back to its linked repo. */
@Controller('apps')
export class AppGitController {
  constructor(private readonly git: GitService) {}

  /**
   * `POST /v1/apps/:id/git/push` — commit the app's CURRENT files back to the
   * linked repo on the user's behalf. Returns { ok, commitUrl? }.
   */
  @Post(':id/git/push')
  push(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: GitPushDto,
  ): Promise<{ ok: true; commitUrl?: string }> {
    return this.git.push(user, id, dto.message);
  }

  /**
   * `POST /v1/apps/:id/git/resync` — re-pull the latest code from the linked repo
   * INTO this same app (keeps its id/URL). Returns { appId, buildId, pending }.
   */
  @Post(':id/git/resync')
  resync(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<GitImportResponse> {
    return this.git.resyncRepo(user, id);
  }

  /** `GET /v1/apps/:id/services` — detected sub-projects of an imported repo. */
  @Get(':id/services')
  services(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<AppServicesResponse> {
    return this.git.listServices(user, id);
  }

  /** `POST /v1/apps/:id/services/build` — build one sub-project as its own app. */
  @Post(':id/services/build')
  buildService(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: BuildServiceDto,
  ): Promise<GitImportResponse> {
    return this.git.buildService(user, id, dto.path);
  }

  /** `GET /v1/apps/:id/children` — child apps (services) of a workspace. */
  @Get(':id/children')
  children(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<App[]> {
    return this.git.listChildren(user, id);
  }
}
