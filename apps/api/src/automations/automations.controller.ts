import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import type { Automation, UpsertAutomationRequest } from '@larkwave/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { AutomationsService } from './automations.service';

@Controller('apps/:appId/automations')
export class AutomationsController {
  constructor(private readonly automations: AutomationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Param('appId') appId: string): Promise<Automation[]> {
    return this.automations.list(user, appId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('appId') appId: string,
    @Body() dto: UpsertAutomationRequest,
  ): Promise<Automation> {
    return this.automations.create(user, appId, dto);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpsertAutomationRequest,
  ): Promise<Automation> {
    return this.automations.update(user, id, dto);
  }

  @Post(':id/run')
  run(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<Automation> {
    return this.automations.runNow(user, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.automations.remove(user, id);
  }
}
