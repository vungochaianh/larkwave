import { Global, Module } from '@nestjs/common';
import { TelegramDeliveryController } from './telegram-delivery.controller';
import { TelegramDeliveryService } from './telegram-delivery.service';
import { TelegramChannelController } from './telegram-channel.controller';
import { TelegramChannelService } from './telegram-channel.service';
import { MarketingDeliveryService } from './marketing-delivery.service';

/**
 * Per-user Telegram delivery. @Global so the Marketing tool modules (video/picture/blog + scheduler)
 * can inject the delivery services directly. Provides the legacy single-config service, the
 * multi-channel manager, and the category-aware delivery orchestrator. CategoryService (also @Global,
 * CategoryModule) is resolved by MarketingDeliveryService without an import.
 */
@Global()
@Module({
  controllers: [TelegramDeliveryController, TelegramChannelController],
  providers: [TelegramDeliveryService, TelegramChannelService, MarketingDeliveryService],
  exports: [TelegramDeliveryService, TelegramChannelService, MarketingDeliveryService],
})
export class DeliveryModule {}
