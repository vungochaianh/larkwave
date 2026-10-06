import { Global, Module } from '@nestjs/common';
import { AiKeysController } from './ai-keys.controller';
import { AiKeysService } from './ai-keys.service';

/** Provider API-key management (OpenAI/Grok) + agent status. @Global so the engine
 *  (OpenaiService) and the admin controller share one cached instance. */
@Global()
@Module({
  controllers: [AiKeysController],
  providers: [AiKeysService],
  exports: [AiKeysService],
})
export class AiKeysModule {}
