/**
 * contextBudget.ts — detect when a Claude conversation (Lark chat OR the app-builder
 * "Trò chuyện") is approaching the model's context-window limit, so the UI can warn the
 * user and offer a fresh session before Claude silently auto-compacts / loses context.
 *
 * How we measure: the Claude CLI's stream-json final `result` event carries a `usage`
 * object ({ input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens }).
 * For a `--resume`d turn the *input side* of that usage IS the current context size —
 * `input_tokens` is only the UNcached remainder, so the full prompt the model saw is
 * `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`. Compare that
 * sum to the model's context window to get how full the conversation is.
 *
 * Context windows (per Anthropic docs, 2026-06): Opus 4.6/4.7/4.8, Sonnet 4.6, Fable 5 =
 * 1,000,000 tokens; Haiku 4.5 = 200,000. Unknown model → conservative 200K.
 */

/** Tokens the model can hold. The CLI model comes from the stream-json `system`/init event. */
export function modelContextWindow(model?: string): number {
  const m = (model || '').toLowerCase();
  if (m.includes('haiku')) return 200_000;
  // Default to 1M: every Claude model this product runs (Opus 4.6/4.7/4.8, Sonnet 4.6,
  // Fable 5) is 1,000,000 tokens — only Haiku is 200K and it's matched above. If the init
  // event didn't surface a model id (empty/unknown), assume 1M so we don't over-warn: a
  // 200K default made a 170K conversation read as ~85% when it's really ~17% of the window.
  return 1_000_000;
}

export interface ContextUsage {
  /** Full input prompt the model just processed = the current resumed-context size. */
  contextTokens: number;
  /** The model's context window. */
  windowTokens: number;
  /** contextTokens / windowTokens, clamped to [0, 1]. */
  percentUsed: number;
}

/** Warn at/above this fraction of the window — "gần đến lúc giới hạn". */
export const CONTEXT_WARN_THRESHOLD = 0.8;

/**
 * Pull a ContextUsage from a stream-json `result` event, or null if it carries no usage.
 * `model` should be the id seen in the `system`/init event for accurate windowing.
 */
export function contextUsageFromResult(obj: any, model?: string): ContextUsage | null {
  const u = obj?.usage;
  if (!u || typeof u !== 'object') return null;
  const input = Number(u.input_tokens) || 0;
  const cacheRead = Number(u.cache_read_input_tokens) || 0;
  const cacheCreate = Number(u.cache_creation_input_tokens) || 0;
  const contextTokens = input + cacheRead + cacheCreate;
  if (contextTokens <= 0) return null;
  const windowTokens = modelContextWindow(model);
  const percentUsed = Math.max(0, Math.min(1, contextTokens / windowTokens));
  return { contextTokens, windowTokens, percentUsed };
}
