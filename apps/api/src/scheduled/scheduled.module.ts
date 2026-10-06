import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SkillsModule } from '../skills/skills.module';
import { ScheduledController } from './scheduled.controller';
import { ScheduledService } from './scheduled.service';

// PrismaModule + SkillsModule imported; MaicService, MaicUsageService and NotificationsService
// are all @Global, so they need no explicit import here.
@Module({
  imports: [PrismaModule, SkillsModule],
  controllers: [ScheduledController],
  providers: [ScheduledService],
})
export class ScheduledModule {}
