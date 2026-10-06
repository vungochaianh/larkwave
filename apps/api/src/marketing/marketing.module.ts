import { Module } from '@nestjs/common';
import { VideoModule } from '../video/video.module';
import { PictureModule } from '../picture/picture.module';
import { MakeBlogModule } from '../makeblog/makeblog.module';
import { BlogModule } from '../blog/blog.module';
import { MarketingController } from './marketing.controller';
import { MarketingScheduleService } from './marketing-schedule.service';

/**
 * Generic Marketing scheduling — one cron runner drives Make Video / Picture / Blog. Imports the
 * three tool modules for their exported services; TelegramDeliveryService (DeliveryModule) and the
 * rest are @Global.
 */
@Module({
  imports: [VideoModule, PictureModule, MakeBlogModule, BlogModule],
  controllers: [MarketingController],
  providers: [MarketingScheduleService],
})
export class MarketingModule {}
