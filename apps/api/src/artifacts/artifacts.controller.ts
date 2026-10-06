import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { AuthUser } from '../common/auth-user';
import { ArtifactsService } from './artifacts.service';
import {
  CreateArtifactDto,
  UpdateArtifactDto,
  type ArtifactDto,
  type PublicArtifactDto,
} from './artifacts.dto';

@Controller('artifacts')
export class ArtifactsController {
  constructor(private readonly artifacts: ArtifactsService) {}

  /** Public read by slug — no login (declared BEFORE ':id'). */
  @Public()
  @Get('public/:slug')
  getPublic(@Param('slug') slug: string): Promise<PublicArtifactDto> {
    return this.artifacts.getPublic(slug);
  }

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<ArtifactDto[]> {
    return this.artifacts.list(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<ArtifactDto> {
    return this.artifacts.get(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateArtifactDto): Promise<ArtifactDto> {
    return this.artifacts.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateArtifactDto,
  ): Promise<ArtifactDto> {
    return this.artifacts.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.artifacts.remove(user.id, id);
  }
}
