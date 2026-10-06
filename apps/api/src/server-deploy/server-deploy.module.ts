import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { EngineModule } from '../engine/engine.module';
import { ServerDeployService } from './server-deploy.service';
import { ServerDeployController } from './server-deploy.controller';

@Module({
  imports: [ConfigModule, EngineModule],
  controllers: [ServerDeployController],
  providers: [ServerDeployService],
  exports: [ServerDeployService],
})
export class ServerDeployModule {}
