import type { PlanCatalogEntry, PlanId } from '@larkwave/shared';

/**
 * Subscription plan catalog — the single source of truth for the monthly USAGE
 * BUDGET, storage and pricing. CONFIGURABLE: tweak `monthlyTokens` / `priceVnd` /
 * `features` here and the whole quota system + `/v1/me/subscription` follow.
 *
 * Billing model: each plan grants a MONTHLY TOKEN BUDGET (`monthlyTokens` = 100%
 * of the plan). Every hosted AI run (Trợ lý AI on Larkwave's Claude, hosted Lark
 * turns, the help assistant) meters its REAL token usage against that budget; the
 * user only ever sees a PERCENT used. Token numbers are INTERNAL/admin-only.
 * Running the assistant on the user's OWN local Claude/Codex/Gemini/Grok CLI on the
 * desktop is not metered.
 */
export const PLANS: Record<PlanId, PlanCatalogEntry> = {
  free: {
    id: 'free',
    label: 'Miễn phí',
    priceVnd: 0,
    // Admin-tunable at runtime (billing config).
    monthlyTokens: 3_000_000,
    storageMb: 1_024,
    features: [
      'Hạn mức dùng AI hàng tháng (gói cơ bản)',
      'Lark Agents trên desktop: Bitable · Docs · Sheets · Wiki · Drive · Lịch · Tin nhắn',
      'Chạy trên Claude/Codex/Gemini/Grok của máy bạn — không tính hạn mức',
      'Trợ lý AI · Kỹ năng · Artifacts',
      'Hỗ trợ cộng đồng',
    ],
  },
  starter: {
    id: 'starter',
    label: 'Khởi đầu',
    priceVnd: 199000,
    monthlyTokens: 30_000_000,
    storageMb: 5_120,
    features: [
      'Hạn mức gấp ~10× gói Miễn phí mỗi tháng',
      'Trợ lý AI trên Claude do Larkwave cung cấp (không cần cài Claude)',
      'Tự động hoá Lark theo lịch · Đặc tả · Xuất xlsx/docx/pdf',
      'Điều khiển máy desktop từ điện thoại/web',
      'Hỗ trợ email',
    ],
  },
  pro: {
    id: 'pro',
    label: 'Chuyên nghiệp',
    priceVnd: 499000,
    monthlyTokens: 100_000_000,
    storageMb: 10_240,
    features: [
      'Hạn mức gấp ~33× gói Miễn phí mỗi tháng',
      'Mọi tính năng gói Khởi đầu',
      'Larkwave chạy hộ lịch tự động hoá khi máy bạn tắt',
      'Đồng bộ CMS Bitable nhiều tài khoản Lark',
      'Chia sẻ trợ lý cho đồng đội (quyền uỷ thác, không lộ khoá)',
      'Hỗ trợ ưu tiên',
    ],
  },
  enterprise: {
    id: 'enterprise',
    label: 'Doanh nghiệp',
    priceVnd: 999000,
    monthlyTokens: 300_000_000,
    storageMb: 25_600,
    features: [
      'Hạn mức gấp ~100× gói Miễn phí mỗi tháng',
      'Mọi tính năng gói Chuyên nghiệp',
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
