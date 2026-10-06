import { Body, Controller, Get, Put } from '@nestjs/common';
import type { PlatformConfig } from '@larkwave/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Any authenticated user can read config (tracks/limits inform the UI). */
  @Get('config')
  get(): Promise<PlatformConfig> {
    return this.settings.get();
  }

  @Roles('admin')
  @Put('config')
  update(@CurrentUser() user: AuthUser, @Body() body: PlatformConfig): Promise<PlatformConfig> {
    return this.settings.update(user, body);
  }
}
