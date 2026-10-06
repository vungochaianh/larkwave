import { Controller, Get, HttpCode, Param, Patch, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { NotificationsResponse } from '@larkwave/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** Live SSE stream of this user's notifications. Declared BEFORE ':id' routes. */
  @Get('stream')
  stream(@CurrentUser() user: AuthUser, @Res() res: Response): void {
    this.notifications.stream(user, res);
  }

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<NotificationsResponse> {
    return this.notifications.list(user.id);
  }

  @Get('unread-count')
  unread(@CurrentUser() user: AuthUser): Promise<{ unread: number }> {
    return this.notifications.unreadCount(user.id);
  }

  @Post('read-all')
  @HttpCode(200)
  readAll(@CurrentUser() user: AuthUser): Promise<{ ok: true }> {
    return this.notifications.markAllRead(user.id);
  }

  @Patch(':id/read')
  read(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.notifications.markRead(user.id, id);
  }
}
