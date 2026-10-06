import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { ChatMessage, Conversation } from '@larkwave/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { SocialService } from './social.service';
import { SendMessageDto } from './social.dto';

@Controller('messages')
export class MessagesController {
  constructor(private readonly social: SocialService) {}

  @Get()
  conversations(@CurrentUser() user: AuthUser): Promise<Conversation[]> {
    return this.social.conversations(user.id);
  }

  // Declared BEFORE ':userId' so "/messages/unread" doesn't match the param route.
  @Get('unread')
  unread(@CurrentUser() user: AuthUser): Promise<{ count: number }> {
    return this.social.unreadCount(user.id);
  }

  /** SSE: live chat events for the current user (real-time). Consumed via fetch
   * streaming with the Bearer header (like the build stream). BEFORE ':userId'. */
  @Get('stream')
  stream(@CurrentUser() user: AuthUser, @Res() res: Response): void {
    this.social.streamMessages(user, res);
  }

  @Get(':userId')
  thread(
    @CurrentUser() user: AuthUser,
    @Param('userId') otherId: string,
  ): Promise<ChatMessage[]> {
    return this.social.thread(user.id, otherId);
  }

  @Post(':userId')
  send(
    @CurrentUser() user: AuthUser,
    @Param('userId') otherId: string,
    @Body() dto: SendMessageDto,
  ): Promise<ChatMessage> {
    return this.social.send(user.id, otherId, dto.body);
  }
}
