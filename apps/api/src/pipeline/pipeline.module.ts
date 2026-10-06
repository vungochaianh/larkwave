import { Module } from '@nestjs/common';
import { EngineModule } from '../engine/engine.module';
import { UploadsModule } from '../uploads/uploads.module';
import { PipelineService } from './pipeline.service';

@Module({
  imports: [EngineModule, UploadsModule],
  providers: [PipelineService],
  exports: [PipelineService],
})
export class PipelineModule {}
