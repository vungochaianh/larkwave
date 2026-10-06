import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { TelegramChannelService } from './telegram-channel.service';

export class CreateChannelDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(200) botToken?: string;
  @IsOptional() @IsString() @MaxLength(64) chatId?: string;
  @IsOptional() @IsString() @MaxLength(64) threadId?: string;
}
export class UpdateChannelDto extends CreateChannelDto {}

@Controller('delivery/channels')
export class TelegramChannelController {
  constructor(private readonly svc: TelegramChannelService) {}

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.svc.list(u.id);
  }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateChannelDto) {
    return this.svc.create(u.id, dto);
  }

  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateChannelDto) {
    return this.svc.update(u.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.remove(u.id, id);
  }

  @Post(':id/test')
  test(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.test(u.id, id);
  }
}
