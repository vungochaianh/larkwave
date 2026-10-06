import { Module } from '@nestjs/common';
import { AdminFeedbackController, FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';

/** In-app user bug/error reports + admin triage (uses Anthropic for AI dedup). */
@Module({
  controllers: [FeedbackController, AdminFeedbackController],
  providers: [FeedbackService],
})
export class FeedbackModule {}
