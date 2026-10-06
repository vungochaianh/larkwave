import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import type { AdminPayment, Paginated } from '@larkwave/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { PaymentsService } from './payments.service';
import { AdminPaymentQueryDto } from './payments.dto';

/**
 * Admin payments — reconciliation surface. List every payment (pending + paid)
 * and manually confirm a transfer when SePay's auto-match didn't fire (marks it
 * paid + upgrades the user's plan).
 */
@Roles('admin')
@Controller('admin/payments')
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  list(@Query() q: AdminPaymentQueryDto): Promise<Paginated<AdminPayment>> {
    return this.payments.adminList(q);
  }

  /** `POST /v1/admin/payments/sync` — poll SePay now + reconcile pending payments. */
  @Post('sync')
  sync(): Promise<{ checked: number; matched: number }> {
    return this.payments.pollSepay();
  }

  @Post(':id/confirm')
  confirm(@CurrentUser() actor: AuthUser, @Param('id') id: string): Promise<AdminPayment> {
    return this.payments.adminConfirm(actor, id);
  }
}
