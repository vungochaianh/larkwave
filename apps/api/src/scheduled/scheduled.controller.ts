import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { ScheduledService } from './scheduled.service';
import {
  CreateScheduledTaskDto,
  UpdateScheduledTaskDto,
  type ScheduledTaskDto,
} from './scheduled.dto';

/** Recurring "Scheduled tasks" — the hosted assistant runs a prompt on a cron schedule. */
@Controller('scheduled')
export class ScheduledController {
  constructor(private readonly scheduled: ScheduledService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<ScheduledTaskDto[]> {
    return this.scheduled.list(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<ScheduledTaskDto> {
    return this.scheduled.get(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateScheduledTaskDto): Promise<ScheduledTaskDto> {
    return this.scheduled.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateScheduledTaskDto,
  ): Promise<ScheduledTaskDto> {
    return this.scheduled.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.scheduled.remove(user.id, id);
  }

  /** Run the task immediately (does not shift its regular schedule). */
  @Post(':id/run')
  @HttpCode(200)
  runNow(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<ScheduledTaskDto> {
    return this.scheduled.runNow(user.id, id);
  }
}
