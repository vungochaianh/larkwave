import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { MarketingScheduleService } from './marketing-schedule.service';
import { CreateMarketingScheduleDto, UpdateMarketingScheduleDto } from './marketing.dto';

@Controller('marketing/schedules')
export class MarketingController {
  constructor(private readonly schedules: MarketingScheduleService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Query('kind') kind?: string) {
    return this.schedules.list(u.id, kind);
  }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateMarketingScheduleDto) {
    return this.schedules.create(u.id, dto as CreateMarketingScheduleDto & { kind: 'video' | 'picture' | 'blog' });
  }

  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateMarketingScheduleDto) {
    return this.schedules.update(u.id, id, dto);
  }

  @Post(':id/run')
  run(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.schedules.runNow(u.id, id);
  }

  @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.schedules.remove(u.id, id);
  }
}
