import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import type { MakerProfile, Paginated, PublicApp } from '@larkwave/shared';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { PublicService } from './public.service';

/** Public, unauthenticated showcase of published apps. */
@Controller('public')
export class PublicController {
  constructor(private readonly publicSvc: PublicService) {}

  @Public()
  @Get('apps')
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('q') q?: string,
    @Query('track') track?: string,
  ): Promise<Paginated<PublicApp>> {
    return this.publicSvc.list({
      page: Number(page) || 1,
      pageSize: Number(pageSize) || 24,
      q: q || undefined,
      track: track || undefined,
    });
  }

  @Public()
  @Get('apps/:slug')
  get(@Param('slug') slug: string): Promise<PublicApp> {
    return this.publicSvc.get(slug);
  }

  @Public()
  @Get('makers/:handle')
  maker(@Param('handle') handle: string): Promise<MakerProfile> {
    return this.publicSvc.maker(handle);
  }

  @Public()
  @Post('apps/:slug/visit')
  visit(@Param('slug') slug: string): Promise<{ visits: number }> {
    return this.publicSvc.visit(slug);
  }

  /** Remix/fork a published app into the CURRENT user's account (auth required). */
  @Post('apps/:slug/remix')
  remix(
    @CurrentUser() user: AuthUser,
    @Param('slug') slug: string,
  ): Promise<{ appId: string; buildId: string }> {
    return this.publicSvc.remix(user, slug);
  }
}
