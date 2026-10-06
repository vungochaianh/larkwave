/**
 * Upgrade proration — the single source of truth for "what does it cost to move
 * to a higher plan RIGHT NOW", used by both `PaymentsService.create` (the charge)
 * and `MeService.subscription` (the quote shown on /pricing). Pure + deterministic
 * so the quoted price and the charged price can never diverge.
 *
 * Model (standard SaaS proration): the user only pays the PRICE DIFFERENCE
 * (target − current), scaled by the fraction of the current billing cycle still
 * remaining. The renewal date is kept (the caller's settle() must NOT reset the
 * window for an upgrade) — at the next renewal they pay the full target price.
 * Result: upgrading late in a cycle is cheap (little time left to pay the delta
 * for), upgrading early costs close to the full delta — always ≤ the full delta.
 */

/** Round charges to a clean 1.000 VND so the bank-transfer amount is tidy. */
const ROUND_VND = 1_000;
/** Floor so a near-end-of-cycle upgrade is never ~0 (and stays SePay-matchable). */
const MIN_UPGRADE_VND = 10_000;
/** Fallback cycle length when the window-start key is missing (legacy rows). */
const DEFAULT_CYCLE_MS = 30 * 24 * 60 * 60 * 1000;

export interface ProrationInput {
  /** Effective (post-discount) monthly price of the TARGET plan. */
  fullPrice: number;
  /** Effective (post-discount) monthly price of the user's CURRENT plan. */
  curPrice: number;
  /** Current cycle end (User.quotaResetAt). */
  quotaResetAt: Date | null;
  /** Current cycle start (User.quotaWindowAt — set to `now` on each settle). */
  quotaWindowAt: Date | null;
  now: Date;
}

export interface ProrationResult {
  /** Amount to charge for the upgrade now (VND, rounded). */
  amountVnd: number;
  /** True when a proration credit was actually applied. */
  prorated: boolean;
  /** Target full price (for display). */
  fullVnd: number;
  /** How much cheaper than the full target price (fullVnd − amountVnd). */
  savingVnd: number;
  /** Fraction of the cycle still remaining (0..1) — for display/debug. */
  remainingFraction: number;
}

/**
 * Compute the prorated upgrade charge. Returns `prorated:false` + `amountVnd =
 * fullPrice` when proration does not apply (no active window, or target is not
 * strictly more expensive). The caller is responsible for the tier gate (only
 * call this for current=paid → target=higher).
 */
export function computeUpgradeAmount(input: ProrationInput): ProrationResult {
  const { fullPrice, curPrice, quotaResetAt, quotaWindowAt, now } = input;
  const nowMs = now.getTime();
  const resetMs = quotaResetAt ? quotaResetAt.getTime() : 0;
  const windowActive = resetMs > nowMs;
  const diff = fullPrice - curPrice;

  if (!windowActive || diff <= 0) {
    return {
      amountVnd: fullPrice,
      prorated: false,
      fullVnd: fullPrice,
      savingVnd: 0,
      remainingFraction: 1,
    };
  }

  const startMs = quotaWindowAt ? quotaWindowAt.getTime() : 0;
  const cycleMs = startMs > 0 && resetMs > startMs ? resetMs - startMs : DEFAULT_CYCLE_MS;
  const remainingMs = Math.max(0, Math.min(cycleMs, resetMs - nowMs));
  const frac = cycleMs > 0 ? remainingMs / cycleMs : 0;

  let amount = Math.round((diff * frac) / ROUND_VND) * ROUND_VND;
  // Never exceed the full delta; never drop below the matchable floor.
  amount = Math.min(amount, diff);
  if (amount < MIN_UPGRADE_VND) amount = Math.min(MIN_UPGRADE_VND, diff);

  return {
    amountVnd: amount,
    prorated: true,
    fullVnd: fullPrice,
    savingVnd: Math.max(0, fullPrice - amount),
    remainingFraction: frac,
  };
}
