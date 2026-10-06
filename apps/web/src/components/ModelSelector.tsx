"use client";

import { type ModelChoice } from "@larkwave/shared";

/**
 * Per-build model metadata (the model now auto-routes server-side; usage is
 * metered as a % of the monthly plan, not per-build credits). MODEL_META is still
 * used to badge which model a build ran on.
 */
export const MODEL_META: Record<
  ModelChoice,
  { emoji: string; name: string; hint: string }
> = {
  // "sonnet" tier AUTO-ROUTES: a cheap AI picks Haiku (simple) vs Sonnet (complex)
  // at build time — lower token cost. Opus = explicit premium quality.
  opus: { emoji: "💎", name: "Opus", hint: "Chất lượng cao nhất" },
  sonnet: { emoji: "🤖", name: "Tự động", hint: "AI chọn Haiku/Sonnet — tiết kiệm" },
};

/**
 * The model is NO LONGER user-selectable — the system auto-evaluates each project
 * and picks the optimal model (Haiku for simple, Sonnet for complex), so results
 * stay awesome while cost is minimal. This renders a small reassurance badge only.
 * Props are kept for backward-compat with existing call sites (ignored).
 */
export default function ModelSelector(_props: {
  value?: ModelChoice;
  onChange?: (model: ModelChoice) => void;
  size?: "small" | "middle";
  showLabel?: boolean;
}) {
  // The model auto-routes server-side; the old reassurance badge was unnecessary
  // clutter in the prompt composer, so render nothing. Call sites keep working.
  return null;
}
