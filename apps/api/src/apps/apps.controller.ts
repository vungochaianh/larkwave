import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { App, AppMemberEntry, AppSecretsResponse, Build, Deployment, Paginated } from '@larkwave/shared';
import type { UpdateAppSeoRequest, UpdateAppSecretsRequest } from '@larkwave/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { PaginationDto } from '../common/dto/pagination.dto';
import { AppsService } from './apps.service';
import { D1AdminService } from './d1-admin.service';
import { AddMemberDto, AppQueryDto, DbRowDto, UpdateAppDto, UpdateMemberDto } from './apps.dto';

@Controller('apps')
export class AppsController {
  constructor(
    private readonly apps: AppsService,
    private readonly d1: D1AdminService,
  ) {}

  /**
   * Deploy a DESKTOP-built app to Cloudflare Pages. The body carries the static
   * file set (vite `dist/`, base64) — read via @Req() so the global whitelist
   * ValidationPipe doesn't strip the nested `files` array. Auth = the user JWT.
   */
  @Post('desktop-deploy')
  desktopDeploy(@CurrentUser() user: AuthUser, @Req() req: Request): Promise<{ url: string }> {
    return this.apps.desktopDeploy(user, req.body as Parameters<AppsService['desktopDeploy']>[1]);
  }

  // ── In-workspace database admin (full-stack apps) ──────────────────────
  @Get(':id/db')
  db(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.d1.overview(user, id);
  }

  @Get(':id/db/:table')
  dbRows(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('table') table: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.d1.rows(user, id, table, Number(page) || 1, Number(pageSize) || 50);
  }

  @Post(':id/db/:table')
  dbInsert(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('table') table: string,
    @Body() dto: DbRowDto,
  ) {
    return this.d1.insert(user, id, table, dto.values);
  }

  @Put(':id/db/:table/:rowid')
  dbUpdate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('table') table: string,
    @Param('rowid') rowid: string,
    @Body() dto: DbRowDto,
  ) {
    return this.d1.update(user, id, table, Number(rowid), dto.values);
  }

  @Delete(':id/db/:table/:rowid')
  dbDelete(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('table') table: string,
    @Param('rowid') rowid: string,
  ) {
    return this.d1.remove(user, id, table, Number(rowid));
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: AppQueryDto): Promise<Paginated<App>> {
    return this.apps.list(user, query);
  }

  /** Apps shared WITH the current user (collaborations). */
  @Get('shared')
  shared(@CurrentUser() user: AuthUser): Promise<App[]> {
    return this.apps.listShared(user);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<App> {
    return this.apps.get(user, id);
  }

  // ── Collaboration members ──────────────────────────────────────────────
  @Get(':id/members')
  members(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<AppMemberEntry[]> {
    return this.apps.members(user, id);
  }

  @Post(':id/members')
  addMember(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddMemberDto,
  ): Promise<AppMemberEntry> {
    return this.apps.addMember(user, id, dto.email, dto.role ?? 'editor');
  }

  @Patch(':id/members/:userId')
  updateMember(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('userId') memberId: string,
    @Body() dto: UpdateMemberDto,
  ): Promise<{ ok: true }> {
    return this.apps.updateMember(user, id, memberId, dto.role);
  }

  @Delete(':id/members/:userId')
  removeMember(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('userId') memberId: string,
  ): Promise<{ ok: true }> {
    return this.apps.removeMember(user, id, memberId);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAppDto,
  ): Promise<App> {
    return this.apps.update(user, id, dto);
  }

  @Put(':id/seo')
  updateSeo(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAppSeoRequest,
  ): Promise<App> {
    return this.apps.updateSeo(user, id, dto);
  }

  @Get(':id/secrets')
  secrets(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<AppSecretsResponse> {
    return this.apps.getSecrets(user, id);
  }

  @Put(':id/secrets')
  setSecrets(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAppSecretsRequest,
  ): Promise<AppSecretsResponse> {
    return this.apps.setSecrets(user, id, dto.secrets);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.apps.remove(user, id);
  }

  @Get(':id/builds')
  builds(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: PaginationDto,
  ): Promise<Paginated<Build>> {
    return this.apps.builds(user, id, query);
  }

  @Get(':id/deployments')
  deployments(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: PaginationDto,
  ): Promise<Paginated<Deployment>> {
    return this.apps.deployments(user, id, query);
  }
}
