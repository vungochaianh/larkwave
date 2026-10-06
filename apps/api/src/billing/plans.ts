import type { PlanCatalogEntry, PlanId } from '@larkwave/shared';

/**
 * Subscription plan catalog — the single source of truth for the monthly USAGE
 * BUDGET, live-app caps and pricing. CONFIGURABLE: tweak `monthlyTokens` /
 * `maxLiveApps` / `priceVnd` / `features` here and the whole quota system +
 * `/v1/me/subscription` follow automatically.
 *
 * Billing model: each plan grants a MONTHLY TOKEN BUDGET (`monthlyTokens` = 100%
 * of the plan). Every build meters its REAL token usage (input + output) against
 * that budget; the user only ever sees a PERCENT used. A big/complex app uses more
 * tokens → consumes more % (fairer than a flat per-build credit). Token numbers
 * are INTERNAL/admin-only — never shown to end users. Every app is generated
 * full-stack (frontend + backend/data + admin CMS); heavier builds simply use
 * more of the monthly %.
 *
 * Budgets are calibrated so Free allows a handful of real builds (the
 * "prompt → live app" aha moment) and each paid tier multiplies the allowance.
 */
export const PLANS: Record<PlanId, PlanCatalogEntry> = {
  free: {
    id: 'free',
    label: 'Miễn phí',
    priceVnd: 0,
    // Generous free allowance (owner: "max everything") so new accounts can build
    // several real full-stack apps before hitting the cap. Admin-tunable at runtime.
    monthlyTokens: 3_000_000,
    maxLiveApps: 1,
    storageMb: 1_024,
    serverDeploy: false,
    features: [
      'Hạn mức dùng hàng tháng (gói cơ bản) — tạo & deploy app thật',
      'App đầy đủ: giao diện + dữ liệu + trang quản trị',
      '1 app chạy đồng thời',
      'Deploy thật ra Cloudflare (subdomain công khai)',
      'Sửa app bằng chat · Xem & tải source',
      'Hỗ trợ cộng đồng',
    ],
  },
  starter: {
    id: 'starter',
    label: 'Khởi đầu',
    priceVnd: 199000,
    monthlyTokens: 30_000_000,
    maxLiveApps: 3,
    storageMb: 5_120,
    serverDeploy: false,
    features: [
      'Hạn mức gấp ~10× gói Miễn phí mỗi tháng',
      'App đầy đủ: giao diện + dữ liệu (D1) + trang quản trị',
      '3 app chạy đồng thời',
      'Tải source code (ZIP) · Đồng bộ GitLab',
      'Sửa code trong app + deploy lại',
      'Web · Mobile · Extension',
      'Hỗ trợ email',
    ],
  },
  pro: {
    id: 'pro',
    label: 'Chuyên nghiệp',
    priceVnd: 499000,
    monthlyTokens: 100_000_000,
    maxLiveApps: 12,
    storageMb: 10_240,
    serverDeploy: true,
    maxServerServices: 8,
    features: [
      'Hạn mức gấp ~33× gói Miễn phí mỗi tháng',
      '12 app chạy đồng thời',
      'Mọi tính năng gói Khởi đầu',
      '★ Chạy trên Server (Docker): backend/DB/Python thật, mỗi service 1 subdomain',
      'Import workspace nhiều service → chạy chung 1 app',
      'Tên miền riêng cho từng service (custom domain)',
      "Xoá nhãn 'Tạo bởi Larkwave' · Templates riêng tư",
      'Hỗ trợ ưu tiên',
    ],
  },
  enterprise: {
    id: 'enterprise',
    label: 'Doanh nghiệp',
    priceVnd: 999000,
    monthlyTokens: 300_000_000,
    maxLiveApps: 9999,
    storageMb: 25_600,
    serverDeploy: true,
    maxServerServices: 9999,
    features: [
      'Hạn mức gấp ~100× gói Miễn phí mỗi tháng',
      'App chạy đồng thời KHÔNG giới hạn',
      'Mọi tính năng gói Chuyên nghiệp',
      '★ Tài nguyên Server cao hơn (RAM/CPU) cho app Docker',
      'Sớm dùng tính năng mới · Hỗ trợ riêng (SLA)',
    ],
  },
};

/** Ordered catalog for display (cheapest → most expensive). */
export const PLAN_CATALOG: PlanCatalogEntry[] = [
  PLANS.free,
  PLANS.starter,
  PLANS.pro,
  PLANS.enterprise,
];

/** Resolve a (possibly stale/unknown) plan string to a valid catalog entry. */
export function resolvePlan(plan: string | null | undefined): PlanCatalogEntry {
  return PLANS[(plan ?? 'free') as PlanId] ?? PLANS.free;
}

/** Whether a plan may RUN apps on the Docker server (Pro tier and above). */
export function planAllowsServerDeploy(plan: string | null | undefined): boolean {
  return planRank(plan) >= planRank('pro');
}

/** Whether a plan REMOVES the "Tạo bằng Larkwave" badge from deployed apps (Pro+). */
export function planRemovesBranding(plan: string | null | undefined): boolean {
  return planRank(plan) >= planRank('pro');
}

/**
 * Max Docker services one app may run on the server for a plan (0 = not allowed).
 * INTENTIONALLY compile-time (the static catalog), NOT CMS-tunable like price/credits
 * — it maps to real host RAM/CPU, so it's a capacity guardrail, not a soft quota.
 */
export function serverServiceLimit(plan: string | null | undefined): number {
  return resolvePlan(plan).maxServerServices ?? 0;
}

/**
 * Numeric tier rank for comparison: free=0 < starter=1 < pro=2 < enterprise=3.
 * Used to keep plan changes monotonic so a late/out-of-order payment can never
 * downgrade a higher active plan. Unknown → free's rank (0).
 */
export function planRank(plan: string | null | undefined): number {
  const i = PLAN_CATALOG.findIndex((p) => p.id === normalizePlanId(plan));
  return i < 0 ? 0 : i;
}

/** Normalize a plan string to a valid `PlanId` (falls back to 'free'). */
export function normalizePlanId(plan: string | null | undefined): PlanId {
  return PLANS[(plan ?? 'free') as PlanId] ? (plan as PlanId) : 'free';
}

/**
 * Gói MUA THÊM dung lượng — 1 GB cho mỗi lần mua, tính theo THÁNG.
 *
 * Vì sao phải có hạn dùng chứ không cộng vĩnh viễn như bonusCredits: đây là tiền thuê chỗ, tháng
 * nào không trả thì không còn chỗ. Cộng vĩnh viễn nghĩa là trả 100k một lần rồi giữ 1 GB mãi mãi
 * — không phải thứ người dùng mua, cũng không phải thứ hạ tầng chịu nổi.
 *
 * Áp dụng cho MỌI gói, kể cả Miễn phí: người dùng nào cũng có thể cần thêm chỗ mà chưa muốn
 * nâng cả gói.
 */
export const STORAGE_ADDON = {
  /** Mỗi lần mua thêm bằng này dung lượng. */
  gbPerUnit: 1,
  /** Giá một đơn vị, mỗi tháng. */
  priceVndPerMonth: 100_000,
} as const;
