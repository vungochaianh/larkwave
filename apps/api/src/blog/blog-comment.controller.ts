import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { BlogCommentService, type BlogCommentDto } from './blog-comment.service';

/**
 * `/v1/blog/:slug/comments` — ĐỌC công khai, VIẾT phải đăng nhập.
 *
 * Đọc để `@Public()` vì blog là trang SEO: khách chưa đăng nhập phải thấy được thảo luận, nếu
 * không thì phần bình luận vô hình với đúng những người nó cần thuyết phục.
 */
@Controller('blog/:slug/comments')
export class BlogCommentController {
  constructor(private readonly svc: BlogCommentService) {}

  @Public()
  @Get()
  list(@Param('slug') slug: string, @Req() req: Request): Promise<BlogCommentDto[]> {
    // Guard bỏ qua route công khai nên `req.user` chỉ có khi token tình cờ được giải mã ở nơi
    // khác — coi như khách nếu vắng. Cờ `mine` sai lệch chỉ làm nút Xoá không hiện, không rò gì.
    const viewer = (req as Request & { user?: AuthUser }).user;
    return this.svc.list(slug, viewer?.id ?? null);
  }

  @Post()
  add(
    @Param('slug') slug: string,
    @CurrentUser() user: AuthUser,
    @Body() body: { content?: string; parentId?: string | null },
  ): Promise<BlogCommentDto> {
    return this.svc.add(slug, user.id, user.email?.split('@')[0] || 'Người dùng', body || {});
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<{ ok: true }> {
    return this.svc.remove(id, user.id, user.role === 'admin');
  }
}
