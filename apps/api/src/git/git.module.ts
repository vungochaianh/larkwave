import { Module } from '@nestjs/common';
import { EngineModule } from '../engine/engine.module';
import { BuildsModule } from '../builds/builds.module';
import { GitService } from './git.service';
import { AppGitController, MeGitController } from './git.controller';

@Module({
  imports: [EngineModule, BuildsModule],
  controllers: [MeGitController, AppGitController],
  providers: [GitService],
})
export class GitModule {}
