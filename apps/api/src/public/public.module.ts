import { Module } from '@nestjs/common';
import { BuildsModule } from '../builds/builds.module';
import { PublicService } from './public.service';
import { PublicController } from './public.controller';

@Module({
  imports: [BuildsModule],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
