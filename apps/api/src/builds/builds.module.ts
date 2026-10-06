import { Module } from '@nestjs/common';
import { PipelineModule } from '../pipeline/pipeline.module';
import { BuildsController } from './builds.controller';
import { BuildsService } from './builds.service';

@Module({
  imports: [PipelineModule],
  controllers: [BuildsController],
  providers: [BuildsService],
  exports: [BuildsService],
})
export class BuildsModule {}
