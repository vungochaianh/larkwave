import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import type { DiscoverUser, Friend, FriendRequest, Paginated } from '@larkwave/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { SocialService } from './social.service';
import { SendRequestDto } from './social.dto';

@Controller('friends')
export class FriendsController {
  constructor(private readonly social: SocialService) {}

  @Get()
  friends(@CurrentUser() user: AuthUser): Promise<Friend[]> {
    return this.social.friends(user.id);
  }

  @Get('requests')
  requests(@CurrentUser() user: AuthUser): Promise<FriendRequest[]> {
    return this.social.requests(user.id);
  }

  /** Discover other (non-private) users to befriend. */
  @Get('discover')
  discover(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<Paginated<DiscoverUser>> {
    const p = Math.max(1, parseInt(page ?? '1', 10) || 1);
    const ps = Math.min(48, Math.max(1, parseInt(pageSize ?? '24', 10) || 24));
    return this.social.discover(user.id, q, p, ps);
  }

  /** Send a friend request to a user by id (from the discovery directory). */
  @Post('request-user/:userId')
  sendById(
    @CurrentUser() user: AuthUser,
    @Param('userId') targetId: string,
  ): Promise<{ status: 'pending' | 'accepted' }> {
    return this.social.sendRequestById(user.id, targetId);
  }

  @Post('request')
  send(
    @CurrentUser() user: AuthUser,
    @Body() dto: SendRequestDto,
  ): Promise<{ status: 'pending' | 'accepted' }> {
    return this.social.sendRequest(user.id, dto.email);
  }

  @Post(':userId/accept')
  async accept(
    @CurrentUser() user: AuthUser,
    @Param('userId') otherId: string,
  ): Promise<{ ok: true }> {
    await this.social.accept(user.id, otherId);
    return { ok: true };
  }

  @Delete(':userId')
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('userId') otherId: string,
  ): Promise<{ ok: true }> {
    await this.social.remove(user.id, otherId);
    return { ok: true };
  }
}
