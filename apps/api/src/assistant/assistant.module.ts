import { Module } from '@nestjs/common';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

/** AI help-assistant (the floating chatbot) — uses the shared Anthropic client. */
@Module({
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
