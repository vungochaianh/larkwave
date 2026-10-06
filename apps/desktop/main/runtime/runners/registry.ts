import type { RunnerStatusInfo } from '@larkwave/core';
import type { RunnerId } from '@larkwave/shared';
import { RUNNER_CATALOG } from './catalog';
import { claudeRunnerEntry } from './claude';
import { grokRunner } from './grok';
import { geminiRunner } from './gemini';
import { codexRunner } from './codex';
import type { CliRunner } from './types';
import { getActiveKey } from '../claudeKeyStore';
import { getProviderKey } from './runnerTokenStore';

/** A direct-API key exists for this runner (Claude managed key, or a stored provider key). */
function hasApiKey(id: string): boolean {
  return id === 'claude' ? !!getActiveKey() : !!getProviderKey(id);
}

/**
 * The multi-CLI runner registry — Claude (delegates to runClaude) + Grok/Gemini/
 * Codex (generic spawn) behind one map. localAdapter.createBuild + the IPC handlers
 * resolve a runner here; `claude` is the default everywhere.
 */
const RUNNERS: Record<RunnerId, CliRunner> = {
  claude: claudeRunnerEntry,
  grok: grokRunner,
  gemini: geminiRunner,
  codex: codexRunner,
};

/** Resolve a runner by id; defaults to Claude and falls back to Claude on unknown. */
export function getRunner(id?: string): CliRunner {
  if (id && (id as RunnerId) in RUNNERS) return RUNNERS[id as RunnerId];
  return RUNNERS.claude;
}

// ── Runner-status cache ──────────────────────────────────────────────────────
// Probing every runner is EXPENSIVE: it spawns `<bin> --version` / `which` and, for
// the non-Claude CLIs, one or more login-shell env probes (+ a `grok models` probe).
// On a single screen mount 3–4 components each call this (HomeShell, the AppShell
// runner badge, the Composer, the model picker), and re-mount on every navigation —
// which used to fire the whole probe set concurrently, thrashing the main process and
// stalling the UI. So we (a) share ONE in-flight probe across concurrent callers and
// (b) cache the resolved result briefly. Token changes call `invalidateRunnerStatus`.
const STATUS_TTL_MS = 8_000;
let statusCache: { at: number; value: RunnerStatusInfo[] } | null = null;
let statusInFlight: Promise<RunnerStatusInfo[]> | null = null;

/** Drop the cached runner statuses so the next `listRunnerStatus()` re-probes (call
 *  after a login/logout or token change so the UI reflects the new auth immediately). */
export function invalidateRunnerStatus(): void {
  statusCache = null;
  statusInFlight = null;
}

/** Status of every runner, in catalog order (drives the model picker + connect panel).
 *  Cached for a few seconds + de-duplicated across concurrent callers (see above). */
export function listRunnerStatus(): Promise<RunnerStatusInfo[]> {
  if (statusCache && Date.now() - statusCache.at < STATUS_TTL_MS) {
    return Promise.resolve(statusCache.value);
  }
  if (statusInFlight) return statusInFlight;
  statusInFlight = Promise.all(RUNNER_CATALOG.map((c) => RUNNERS[c.id].status()))
    .then((list) => {
      // Attach direct-API key readiness so the composer can offer the no-CLI path.
      const value = list.map((s) => ({ ...s, apiKey: hasApiKey(s.id) }));
      statusCache = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      statusInFlight = null;
    });
  return statusInFlight;
}
