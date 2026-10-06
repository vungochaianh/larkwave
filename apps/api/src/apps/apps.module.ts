import { Module } from '@nestjs/common';
import { EngineModule } from '../engine/engine.module';
import { ServerDeployModule } from '../server-deploy/server-deploy.module';
import { PipelineModule } from '../pipeline/pipeline.module';
import { AppsController } from './apps.controller';
import { AdminAppsController } from './admin-apps.controller';
import { AppsService } from './apps.service';
import { D1AdminService } from './d1-admin.service';

@Module({
  imports: [EngineModule, ServerDeployModule, PipelineModule],
  controllers: [AppsController, AdminAppsController],
  providers: [AppsService, D1AdminService],
  exports: [AppsService],
})
export class AppsModule {}
