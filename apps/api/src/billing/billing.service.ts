import { Injectable } from '@nestjs/common';
import type {
  BillingConfig,
  DiscountInfo,
  ModelChoice,
  PlanCatalogEntry,
  PlanId,
  ResolvedBillingConfig,
} from '@larkwave/shared';
import { discountActive, discountedVnd, MODEL_COST, PLAN_IDS } from '@larkwave/shared';
import { PlatformConfigService } from '../config/platform-config.service';
import { PLANS, normalizePlanId } from './plans';

/**
 * Runtime-editable billing accessor. MERGES the `billing` section stored in the
 * singleton `Setting.config` JSON over the hardcoded defaults from
 * `src/billing/plans.ts` (+ MODEL_COST). When the DB has no billing section the
 * resolved values are identical to the compiled-in catalog, so behaviour is
 * unchanged until an admin edits prices/credits/model-cost from the CMS.
 *
 * label/features always come from `plans.ts`; only priceVnd/credits/maxLiveApps
 * (and model credit cost + vndPerUsd) are overridable.
 */
@Injectable()
export class BillingService {
  /** Default VND per 1 USD when the config doesn't override it. */
  static readonly DEFAULT_VND_PER_USD = 25000;

  constructor(private readonly platformConfig: PlatformConfigService) {}

  /** Fully-resolved billing config (defaults merged with stored overrides). */
  async resolve(): Promise<ResolvedBillingConfig> {
    const config = await this.platformConfig.get();
    return BillingService.merge(config.billing);
  }

  /** Pure merge of an optional `billing` override over the hardcoded defaults. */
  static merge(billing?: BillingConfig): ResolvedBillingConfig {
    const vndPerUsd =
      typeof billing?.vndPerUsd === 'number' && billing.vndPerUsd > 0
        ? billing.vndPerUsd
        : BillingService.DEFAULT_VND_PER_USD;

    const plans = PLAN_IDS.reduce(
      (acc, id) => {
        const base = PLANS[id];
        const override = billing?.plans?.[id] ?? {};
        acc[id] = {
          priceVnd: numOr(override.priceVnd, base.priceVnd),
          monthlyTokens: numOr(override.monthlyTokens, base.monthlyTokens),
          credits: numOr(override.credits, base.credits ?? 0),
          maxLiveApps: numOr(override.maxLiveApps, base.maxLiveApps),
        };
        return acc;
      },
      {} as ResolvedBillingConfig['plans'],
    );

    const modelCredits: Record<ModelChoice, number> = {
      opus: numOr(billing?.modelCredits?.opus, MODEL_COST.opus),
      sonnet: numOr(billing?.modelCredits?.sonnet, MODEL_COST.sonnet),
    };

    // Free plan is usable unless explicitly disabled (default true).
    const freePlanEnabled = billing?.freePlanEnabled !== false;

    // Promotional discount campaign (clamped 0–90%).
    const discount: DiscountInfo = {
      percent: clampPercent(billing?.discount?.percent),
      until: billing?.discount?.until ?? null,
      label: billing?.discount?.label ?? null,
    };

    return { vndPerUsd, plans, modelCredits, freePlanEnabled, discount };
  }

  // ─── Convenience helpers (each does a single resolve) ───────────────────────

  async getVndPerUsd(): Promise<number> {
    return (await this.resolve()).vndPerUsd;
  }

  async getPlanCredits(plan: string | null | undefined): Promise<number> {
    return (await this.resolve()).plans[normalizePlanId(plan)].credits;
  }

  /** Monthly TOKEN budget (= 100% of the plan) — the quota a build meters against. */
  async getMonthlyTokens(plan: string | null | undefined): Promise<number> {
    return (await this.resolve()).plans[normalizePlanId(plan)].monthlyTokens;
  }

  async getPlanPriceVnd(plan: string | null | undefined): Promise<number> {
    return (await this.resolve()).plans[normalizePlanId(plan)].priceVnd;
  }

  /** The resolved promotional discount campaign (percent 0 = none). */
  async getDiscount(): Promise<DiscountInfo> {
    return (await this.resolve()).discount;
  }

  /**
   * The price to actually CHARGE for a plan: the discounted price when a campaign
   * is active, else the list price. Used for the payment amount (so the SePay
   * exact-amount auto-approval matches the discounted sum).
   */
  async getEffectivePriceVnd(plan: string | null | undefined): Promise<number> {
    const resolved = await this.resolve();
    const price = resolved.plans[normalizePlanId(plan)].priceVnd;
    return discountActive(resolved.discount, Date.now())
      ? discountedVnd(price, resolved.discount.percent)
      : price;
  }

  async getPlanMaxLiveApps(plan: string | null | undefined): Promise<number> {
    return (await this.resolve()).plans[normalizePlanId(plan)].maxLiveApps;
  }

  async getModelCredits(model: ModelChoice): Promise<number> {
    return (await this.resolve()).modelCredits[model] ?? MODEL_COST[model];
  }

  /** Whether the free plan may be used (default true; admin-toggled). */
  async isFreePlanEnabled(): Promise<boolean> {
    return (await this.resolve()).freePlanEnabled;
  }

  /** Per-build credit cost by model (resolved), for the subscription view. */
  async getModelCost(): Promise<Record<ModelChoice, number>> {
    return (await this.resolve()).modelCredits;
  }

  /**
   * The full plan catalog with priceVnd/credits/maxLiveApps from billing config,
   * but label/features still from `plans.ts`. Ordered cheapest → most expensive.
   */
  async getCatalog(): Promise<PlanCatalogEntry[]> {
    const resolved = await this.resolve();
    const active = discountActive(resolved.discount, Date.now());
    return PLAN_IDS.map((id) => {
      const base = PLANS[id];
      const o = resolved.plans[id];
      return {
        id,
        label: base.label,
        features: base.features,
        priceVnd: o.priceVnd,
        discountedVnd:
          active && o.priceVnd > 0 ? discountedVnd(o.priceVnd, resolved.discount.percent) : null,
        monthlyTokens: o.monthlyTokens,
        maxLiveApps: o.maxLiveApps,
        // Dung lượng lấy thẳng từ plans.ts: đây là hằng số sản phẩm, không nằm trong phần cấu
        // hình giá chỉnh được lúc chạy (resolved.plans) như priceVnd/monthlyTokens.
        storageMb: base.storageMb,
      };
    });
  }

  /** A single resolved catalog entry (label/features from plans.ts). */
  async getPlan(plan: string | null | undefined): Promise<PlanCatalogEntry> {
    const id = normalizePlanId(plan);
    const resolved = await this.resolve();
    const base = PLANS[id];
    const o = resolved.plans[id];
    return {
      id,
      label: base.label,
      features: base.features,
      storageMb: base.storageMb,
      priceVnd: o.priceVnd,
      monthlyTokens: o.monthlyTokens,
      maxLiveApps: o.maxLiveApps,
    };
  }

  // ─── Admin edit (GET/PUT /v1/admin/billing) ─────────────────────────────────

  /** Effective (merged) billing config for the admin editor. */
  async getEditable(): Promise<ResolvedBillingConfig> {
    return this.resolve();
  }

  /**
   * Persist a billing override into the singleton config. Stores only the
   * supplied { vndPerUsd, plans, modelCredits }; the rest of PlatformConfig is
   * preserved. Returns the effective (merged) values.
   */
  async save(input: BillingConfig): Promise<ResolvedBillingConfig> {
    const current = await this.platformConfig.get();
    const billing: BillingConfig = {
      vndPerUsd:
        typeof input.vndPerUsd === 'number' && input.vndPerUsd > 0
          ? input.vndPerUsd
          : (current.billing?.vndPerUsd ?? BillingService.DEFAULT_VND_PER_USD),
      plans: { ...(current.billing?.plans ?? {}), ...(input.plans ?? {}) },
      modelCredits: {
        ...(current.billing?.modelCredits ?? {}),
        ...(input.modelCredits ?? {}),
      },
      freePlanEnabled:
        typeof input.freePlanEnabled === 'boolean'
          ? input.freePlanEnabled
          : (current.billing?.freePlanEnabled ?? true),
      discount: input.discount !== undefined ? input.discount : current.billing?.discount,
    };
    await this.platformConfig.update({ ...current, billing });
    return BillingService.merge(billing);
  }

  /** Reference to which plan ids exist (re-exported for callers). */
  static readonly PLAN_IDS: readonly PlanId[] = PLAN_IDS;
}

/** Returns `value` when it's a finite non-negative number, else `fallback`. */
function numOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

/** Clamp a discount percent to a safe 0–90 integer (0 when invalid). */
function clampPercent(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return Math.min(90, Math.round(value));
}
