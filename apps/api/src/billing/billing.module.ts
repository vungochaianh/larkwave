import { Global, Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';

/**
 * Global so the runtime-editable billing accessor (prices/credits/model-cost)
 * is injectable everywhere (builds, me, payments, reports) without per-module
 * import wiring. Depends on the global PlatformConfigService.
 */
@Global()
@Module({
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
