import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { MakeBlogService } from './makeblog.service';
import { CreateMakeBlogDto } from './makeblog.dto';
import { RefineDto } from '../video/video.dto';

// Route 'makeblog' — distinct from the public blog module's @Controller('blog').
@Controller('makeblog')
export class MakeBlogController {
  constructor(private readonly blog: MakeBlogService) {}

  @Get('templates')
  templates() {
    return this.blog.templates();
  }

  @Get('palettes')
  palettes() {
    return this.blog.palettes();
  }

  @Get('characters')
  characters() {
    return this.blog.characters();
  }

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.blog.list(u.id);
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.blog.get(u.id, id);
  }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateMakeBlogDto) {
    return this.blog.create(u.id, dto, u);
  }

  @Post(':id/render')
  rerender(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.blog.rerender(u.id, id);
  }

  @Post(':id/refine')
  refine(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: RefineDto) {
    return this.blog.refine(u.id, id, dto.instruction || '');
  }

  @Get(':id/history')
  history(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.blog.listHistory(u.id, id);
  }

  @Post(':id/restore')
  restore(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: { editId?: string }) {
    return this.blog.restore(u.id, id, body.editId || '');
  }

  @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.blog.remove(u.id, id);
  }
}
