import { Body, Controller, Get, Put } from '@nestjs/common';
import type { BillingConfig, ResolvedBillingConfig } from '@larkwave/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { AuditService } from '../audit/audit.service';
import { BillingService } from './billing.service';
import { UpdateBillingDto } from './billing.dto';

/**
 * Admin editor for the runtime-editable billing config. GET returns the
 * EFFECTIVE (merged) values so the UI can edit them; PUT persists overrides
 * into the singleton `Setting.config` JSON (no redeploy needed) and returns the
 * new effective values.
 */
@Roles('admin')
@Controller('admin/billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  get(): Promise<ResolvedBillingConfig> {
    return this.billing.getEditable();
  }

  @Put()
  async update(
    @CurrentUser() actor: AuthUser,
    @Body() body: UpdateBillingDto,
  ): Promise<ResolvedBillingConfig> {
    const saved = await this.billing.save(body as BillingConfig);
    await this.audit.log(actor.id, actor.email, 'billing.update', 'singleton', {
      vndPerUsd: saved.vndPerUsd,
      freePlanEnabled: saved.freePlanEnabled,
    });
    return saved;
  }
}
