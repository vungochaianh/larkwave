import { Global, Module } from '@nestjs/common';
import { AiKeysController } from './ai-keys.controller';
import { AiKeysService } from './ai-keys.service';
import { AnthropicService } from './anthropic.service';

/** Provider API-key management + agent status, plus the shared Anthropic completion client
 *  (help assistant, feedback triage). @Global so every module shares one cached instance. */
@Global()
@Module({
  controllers: [AiKeysController],
  providers: [AiKeysService, AnthropicService],
  exports: [AiKeysService, AnthropicService],
})
export class AiKeysModule {}
