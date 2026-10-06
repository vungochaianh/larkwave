import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { PictureService } from './picture.service';
import { CreatePictureDto } from './picture.dto';
import { RefineDto } from '../video/video.dto';

@Controller('picture')
export class PictureController {
  constructor(private readonly picture: PictureService) {}

  @Get('templates')
  templates() {
    return this.picture.templates();
  }

  @Get('palettes')
  palettes() {
    return this.picture.palettes();
  }

  @Get('characters')
  characters() {
    return this.picture.characters();
  }

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.picture.list(u.id);
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.picture.get(u.id, id);
  }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: CreatePictureDto) {
    return this.picture.create(u.id, dto, u);
  }

  @Post(':id/render')
  rerender(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.picture.rerender(u.id, id);
  }

  @Post(':id/refine')
  refine(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: RefineDto) {
    return this.picture.refine(u.id, id, dto.instruction || '');
  }

  @Get(':id/history')
  history(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.picture.listHistory(u.id, id);
  }

  @Post(':id/restore')
  restore(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: { editId?: string }) {
    return this.picture.restore(u.id, id, body.editId || '');
  }

  @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.picture.remove(u.id, id);
  }
}
