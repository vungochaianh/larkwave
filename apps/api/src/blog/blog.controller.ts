import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type {
  BlogPost,
  BlogPostListItem,
  CreateBlogPostRequest,
  Paginated,
  UpdateBlogPostRequest,
} from '@larkwave/shared';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { BlogService } from './blog.service';

/** Public, unauthenticated blog (SEO): list + detail of PUBLISHED posts. */
@Public()
@Controller('blog')
export class BlogController {
  constructor(private readonly blog: BlogService) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('tag') tag?: string,
    @Query('category') category?: string,
    /** Ngôn ngữ muốn đọc (vi | en | …). Thiếu bản dịch thì tự lùi về bản gốc, KHÔNG trả rỗng. */
    @Query('locale') locale?: string,
  ): Promise<Paginated<BlogPostListItem>> {
    const p = Math.max(1, parseInt(page ?? '1', 10) || 1);
    const ps = Math.min(50, Math.max(1, parseInt(pageSize ?? '12', 10) || 12));
    return this.blog.listPublished(
      p,
      ps,
      tag?.trim() || undefined,
      category?.trim() || undefined,
      locale?.trim() || undefined,
    );
  }

  /** Chuyên mục đang có bài + số bài — /blog dựng tab từ đây. */
  @Get('categories')
  categories(): Promise<{ name: string; count: number }[]> {
    return this.blog.categories();
  }

  /** Thẻ đang có bài + số lần dùng. */
  @Get('tags')
  tags(): Promise<{ name: string; count: number }[]> {
    return this.blog.tags();
  }

  /** Featured (else newest) posts for the landing teaser. */
  @Get('featured')
  featured(
    @Query('limit') limit?: string,
    @Query('locale') locale?: string,
  ): Promise<BlogPostListItem[]> {
    return this.blog.featured(parseInt(limit ?? '3', 10) || 3, locale?.trim() || undefined);
  }

  @Get(':slug')
  get(@Param('slug') slug: string, @Query('locale') locale?: string): Promise<BlogPost> {
    return this.blog.getPublished(slug, locale?.trim() || undefined);
  }
}

/** Admins author + manage posts in aapp (/admin/blog). */
@Roles('admin')
@Controller('admin/blog')
export class AdminBlogController {
  constructor(private readonly blog: BlogService) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
  ): Promise<Paginated<BlogPost>> {
    const p = Math.max(1, parseInt(page ?? '1', 10) || 1);
    const ps = Math.min(50, Math.max(1, parseInt(pageSize ?? '20', 10) || 20));
    return this.blog.adminList(p, ps, status);
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<BlogPost> {
    return this.blog.adminGet(id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBlogPostRequest): Promise<BlogPost> {
    return this.blog.create(user, dto);
  }


  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBlogPostRequest): Promise<BlogPost> {
    return this.blog.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<{ ok: true }> {
    return this.blog.remove(id);
  }
}
