import { Global, Module } from '@nestjs/common';
import { RenderService } from '../video/render.service';
import { TtsService } from '../video/tts.service';
import { MarketingHistoryService } from './marketing-history.service';
import { AttachmentService } from './attachment.service';

/**
 * Shared media engine — Playwright/ffmpeg rendering (video mp4 + HTML→PNG posters/covers),
 * ElevenLabs TTS, and the Marketing edit/version history. @Global so every Marketing tool
 * (video/picture/blog) can inject them without importing this module. AppConfigService is @Global.
 */
@Global()
@Module({
  providers: [RenderService, TtsService, MarketingHistoryService, AttachmentService],
  exports: [RenderService, TtsService, MarketingHistoryService, AttachmentService],
})
export class MediaModule {}
