import { Module } from '@nestjs/common';
import { PictureController } from './picture.controller';
import { PictureService } from './picture.service';

/**
 * Make Picture. RenderService comes from the @Global MediaModule; MaicModule, NotificationsModule,
 * DeliveryModule, PrismaService and AppConfigService are all @Global. Scheduling is generic
 * (MarketingScheduleService).
 */
@Module({
  controllers: [PictureController],
  providers: [PictureService],
  exports: [PictureService],
})
export class PictureModule {}
