import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { VideoService } from './video.service';
import { CreateVideoDto, RefineDto } from './video.dto';

@Controller('video')
export class VideoController {
  constructor(private readonly video: VideoService) {}

  @Get('templates')
  templates() {
    return this.video.templates();
  }

  @Get('palettes')
  palettes() {
    return this.video.palettes();
  }

  @Get('characters')
  characters() {
    return this.video.characters();
  }

  @Get('voices')
  voices() {
    return this.video.listVoices();
  }

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.video.list(u.id);
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.video.get(u.id, id);
  }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateVideoDto) {
    return this.video.create(u.id, dto, u);
  }

  @Post(':id/render')
  rerender(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.video.rerender(u.id, id);
  }

  @Post(':id/refine')
  refine(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: RefineDto) {
    return this.video.refine(u.id, id, dto.instruction || '');
  }

  @Get(':id/history')
  history(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.video.listHistory(u.id, id);
  }

  @Post(':id/restore')
  restore(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: { editId?: string }) {
    return this.video.restore(u.id, id, body.editId || '');
  }

  @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.video.remove(u.id, id);
  }
}
