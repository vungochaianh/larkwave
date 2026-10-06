import { Module } from '@nestjs/common';
import { AnthropicService } from './anthropic.service';
import { OpenaiService } from './openai.service';
import { CodegenService } from './codegen.service';
import { CloudflarePagesService } from './cloudflare-pages.service';
import { BuildRunnerService } from './build-runner.service';
import { QrService } from './qr.service';
import { GitlabService } from './gitlab.service';
import { GitProvidersService } from './git-providers.service';
import { SiteCaptureService } from './site-capture.service';

@Module({
  providers: [
    AnthropicService,
    OpenaiService,
    CodegenService,
    CloudflarePagesService,
    BuildRunnerService,
    QrService,
    GitlabService,
    GitProvidersService,
    SiteCaptureService,
  ],
  exports: [
    AnthropicService,
    OpenaiService,
    CodegenService,
    CloudflarePagesService,
    BuildRunnerService,
    QrService,
    GitlabService,
    GitProvidersService,
    SiteCaptureService,
  ],
})
export class EngineModule {}
