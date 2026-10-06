import { Module } from '@nestjs/common';
import { EngineModule } from '../engine/engine.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

/** AI help-assistant (the floating chatbot) — uses the shared Anthropic client. */
@Module({
  imports: [EngineModule],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
