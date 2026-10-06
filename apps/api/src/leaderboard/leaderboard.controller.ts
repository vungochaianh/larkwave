import { Controller, Get, Query } from '@nestjs/common';
import type { LeaderboardResponse } from '@larkwave/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { LeaderboardService } from './leaderboard.service';

@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboard: LeaderboardService) {}

  @Get()
  top(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
  ): Promise<LeaderboardResponse> {
    return this.leaderboard.top(user, Math.min(Number(limit) || 50, 100));
  }
}
