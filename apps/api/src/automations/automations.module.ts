import { Module } from '@nestjs/common';
import { AutomationsController } from './automations.controller';
import { AutomationsService } from './automations.service';

/** Scheduled per-app tasks (cron) — CRUD + an in-process scheduler tick. */
@Module({
  controllers: [AutomationsController],
  providers: [AutomationsService],
})
export class AutomationsModule {}
