import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Build, CreateBuildResponse, Paginated } from '@larkwave/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthUser } from '../common/auth-user';
import { BuildsService, type BuildErrorEntry } from './builds.service';
import { BuildQueryDto, CreateBuildDto, UpdateBlueprintDto } from './builds.dto';
import { PaginationDto } from '../common/dto/pagination.dto';

@Controller('builds')
export class BuildsController {
  constructor(private readonly builds: BuildsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBuildDto): Promise<CreateBuildResponse> {
    return this.builds.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: BuildQueryDto): Promise<Paginated<Build>> {
    return this.builds.list(user, query);
  }

  /** Admin bug/error report: errored builds (failed/canceled). `reviewed=all`
   *  includes acknowledged ones; by default only unresolved errors are shown. */
  @Roles('admin')
  @Get('errors/report')
  errorReport(
    @Query() query: PaginationDto,
    @Query('reviewed') reviewed?: string,
    @Query('ownerId') ownerId?: string,
  ): Promise<Paginated<BuildErrorEntry>> {
    return this.builds.errorReport(query, reviewed === 'all' || reviewed === 'true', ownerId);
  }

  /** Admin marks (or re-opens) a failed build as resolved in the error report. */
  @Roles('admin')
  @Patch(':id/error-review')
  setErrorReviewed(
    @Param('id') id: string,
    @Body() dto: { reviewed?: boolean },
  ): Promise<{ ok: true }> {
    return this.builds.setErrorReviewed(id, dto.reviewed !== false);
  }

  /** Admin one-click: mark ALL unresolved errored builds as reviewed. */
  @Roles('admin')
  @Post('errors/review-all')
  @HttpCode(200)
  reviewAllErrors(): Promise<{ count: number }> {
    return this.builds.reviewAllErrors();
  }

  /**
   * "Chạy lại" một bản dựng: máy chủ tự đọc yêu cầu gốc. KHÔNG nhận prompt qua thân request —
   * prompt đã lưu có thể dài hơn trần 4000 ký tự của DTO và sẽ bị chặn ngay ở cổng kiểm tra.
   */
  @Post(':id/rerun')
  rerun(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<{ buildId: string; appId: string }> {
    return this.builds.rerun(user, id);
  }

  /**
   * Dựng lại CẢ BỘ site theo đúng thứ tự phụ thuộc (API → mặt tiền → backoffice/portal).
   * `id` là app BẤT KỲ trong bộ; máy chủ tự tìm các thành viên còn lại.
   */
  @Post('suite/:appId/rebuild')
  rebuildSuite(
    @CurrentUser() user: AuthUser,
    @Param('appId') appId: string,
  ): Promise<{ builds: number }> {
    return this.builds.rebuildSuite(user, appId);
  }

  /** Bản dựng đang chạy + dự đoán còn bao lâu — nút "tiến trình" trên header đọc cái này. */
  @Get('running')
  running(@CurrentUser() user: AuthUser) {
    return this.builds.running(user);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<Build> {
    return this.builds.get(user, id);
  }

  /** SSE live progress. Client uses fetch streaming with Authorization header. */
  @Get(':id/stream')
  stream(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    return this.builds.stream(user, id, res);
  }

  /** Download the generated project as a .zip (Export project). */
  @Get(':id/download')
  download(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    return this.builds.download(user, id, res);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.builds.cancel(user, id);
  }

  /** Roll back to this build: re-deploy its files as a new build (no credit). */
  @Post(':id/rollback')
  rollback(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<CreateBuildResponse> {
    return this.builds.rollback(user, id);
  }

  /**
   * Re-deploy this build's already-generated source (no AI codegen, no credit).
   * For a build whose codegen succeeded but build/deploy failed (e.g. a transient
   * Cloudflare error) — rebuild + redeploy the exact files instead of regenerating.
   */
  @Post(':id/redeploy')
  redeploy(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<CreateBuildResponse> {
    return this.builds.redeploy(user, id);
  }

  /** Save the user's edits to a draft Blueprint while the build waits at the gate. */
  @Patch(':id/blueprint')
  updateBlueprint(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateBlueprintDto,
  ): Promise<Build> {
    return this.builds.updateBlueprint(user, id, dto.blueprint);
  }

  /** Approve the Blueprint at the gate → consume credit + resume codegen. */
  @Post(':id/approve')
  @HttpCode(200)
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.builds.approve(user, id);
  }
}
