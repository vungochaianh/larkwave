import { Module } from '@nestjs/common';
import { VideoController } from './video.controller';
import { VideoService } from './video.service';

/**
 * Make Video. RenderService + TtsService come from the @Global MediaModule; MaicModule,
 * NotificationsModule, DeliveryModule, PrismaService and AppConfigService are all @Global.
 * Scheduling is handled generically by MarketingScheduleService (marketing module).
 */
@Module({
  controllers: [VideoController],
  providers: [VideoService],
  exports: [VideoService],
})
export class VideoModule {}
