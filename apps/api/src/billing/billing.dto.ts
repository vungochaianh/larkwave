import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Promotional discount campaign: `percent` off all paid plans until `until`. */
export class DiscountDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(90)
  percent?: number;

  @IsOptional()
  @IsISO8601()
  until?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string | null;
}

/** Per-plan price / monthly-token budget / live-app cap override. All optional. */
export class BillingPlanOverrideDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceVnd?: number;

  /** Monthly TOKEN budget (= 100% of the plan). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  monthlyTokens?: number;

  /** @deprecated legacy per-build credit allowance. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  credits?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxLiveApps?: number;
}

/** Body for `PUT /v1/admin/billing` — partial overrides merged over defaults. */
export class UpdateBillingDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  vndPerUsd?: number;

  /** Keyed by PlanId (free|starter|pro|enterprise). */
  @IsOptional()
  @IsObject()
  plans?: Record<string, BillingPlanOverrideDto>;

  /** Keyed by ModelChoice (opus|sonnet). */
  @IsOptional()
  @IsObject()
  modelCredits?: Record<string, number>;

  /** Toggle whether the free plan is usable (default true). */
  @IsOptional()
  @IsBoolean()
  freePlanEnabled?: boolean;

  /** Promotional discount campaign (percent off all paid plans, optional expiry). */
  @IsOptional()
  @ValidateNested()
  @Type(() => DiscountDto)
  discount?: DiscountDto;
}
