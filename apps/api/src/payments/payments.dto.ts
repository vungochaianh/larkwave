import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import type { PlanId } from '@larkwave/shared';

/** Paid plans only — 'free' is rejected (nothing to pay for). */
const PAID_PLAN_IDS = ['starter', 'pro', 'enterprise'] as const;
export type PaidPlanId = (typeof PAID_PLAN_IDS)[number];

export class CreatePaymentDto {
  @IsIn(PAID_PLAN_IDS as readonly string[], {
    message: 'Gói không hợp lệ (chọn starter, pro hoặc enterprise)',
  })
  plan!: PaidPlanId & PlanId;
}

/** `GET /v1/admin/payments?status=&page=&pageSize=` — admin reconciliation list. */
export class AdminPaymentQueryDto {
  @IsOptional()
  @IsString()
  status?: string; // 'pending' | 'paid'

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}

/**
 * SePay webhook payload. We keep it permissive (the gateway may add fields) and
 * only read what we need; the auth header — not the body — is the trust anchor.
 */
export interface SepayWebhookBody {
  id: number | string;
  gateway?: string;
  transactionDate?: string;
  accountNumber?: string;
  content?: string;
  transferType?: string; // 'in' | 'out'
  transferAmount?: number;
  referenceCode?: string;
  [key: string]: unknown;
}
