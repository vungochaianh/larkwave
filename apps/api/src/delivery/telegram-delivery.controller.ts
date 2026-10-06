import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { TelegramDeliveryService } from './telegram-delivery.service';

export class SetTelegramDeliveryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  botToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  chatId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  threadId?: string;
}

@Controller('delivery/telegram')
export class TelegramDeliveryController {
  constructor(private readonly svc: TelegramDeliveryService) {}

  @Get()
  status(@CurrentUser() u: AuthUser) {
    return this.svc.getStatus(u.id);
  }

  @Put()
  set(@CurrentUser() u: AuthUser, @Body() dto: SetTelegramDeliveryDto) {
    return this.svc.setConfig(u.id, dto);
  }

  @Post('test')
  test(@CurrentUser() u: AuthUser) {
    return this.svc.test(u.id);
  }
}
