import { Global, Module } from '@nestjs/common';
import { MaicService } from './maic.service';
import { MaicUsageService } from './maic-usage.service';
import { MaicAdminService } from './maic-admin.service';
import { MaicAdminController } from './maic-admin.controller';

/**
 * Global so any agent surface (agent chat, scheduled tasks, Lark router) can inject the
 * MAIC client + its gate/meter without per-module wiring — mirrors BillingModule/ConfigModule.
 * PrismaService, BillingService and AppConfigService are all @Global, so nothing to import.
 */
@Global()
@Module({
  controllers: [MaicAdminController],
  providers: [MaicService, MaicUsageService, MaicAdminService],
  exports: [MaicService, MaicUsageService, MaicAdminService],
})
export class MaicModule {}
