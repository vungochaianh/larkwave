import { Module } from '@nestjs/common';
import { MakeBlogController } from './makeblog.controller';
import { MakeBlogService } from './makeblog.service';

/**
 * Make Blog (marketing) — distinct from the public BlogModule. RenderService (@Global MediaModule)
 * renders the cover; MaicModule/NotificationsModule/DeliveryModule/Prisma/AppConfig are @Global.
 */
@Module({
  controllers: [MakeBlogController],
  providers: [MakeBlogService],
  exports: [MakeBlogService],
})
export class MakeBlogModule {}
