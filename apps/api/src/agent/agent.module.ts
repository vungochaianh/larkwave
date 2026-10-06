import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { TelegramService } from './telegram.service';
import { SkillsModule } from '../skills/skills.module';
import { UploadsModule } from '../uploads/uploads.module';

// PrismaModule + EventsModule are @Global(), so they need no explicit import
// here (same as SocialModule). The service injects PrismaService + EventsService.
// SkillsModule is imported so the hosted-assistant turns can inject enabled skills; UploadsModule
// so a chat turn can resolve the files the user attached (images ride the agentic run path).
@Module({
  imports: [SkillsModule, UploadsModule],
  controllers: [AgentController],
  providers: [AgentService, TelegramService],
  exports: [TelegramService],
})
export class AgentModule {}
