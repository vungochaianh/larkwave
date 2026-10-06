import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { AuthUser } from '../common/auth-user';
import { LarkShareService, type ShareInput } from './lark-share.service';

/** Authenticated: the desktop publishes / lists / unpublishes the user's shared chats. */
@Controller('me/lark-shares')
export class LarkShareController {
  constructor(private readonly svc: LarkShareService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: ShareInput): Promise<{ id: string; url: string }> {
    return this.svc.create(user.id, body);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.svc.listMine(user.id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.svc.remove(user.id, id);
  }
}

/** Public (no auth): the website fetches a shared conversation to render it read-only. */
@Public()
@Controller('public/lark-shares')
export class PublicLarkShareController {
  constructor(private readonly svc: LarkShareService) {}

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.getPublic(id);
  }
}
