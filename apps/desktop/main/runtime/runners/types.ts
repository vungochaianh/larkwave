import type { AppMode, BuildEvent, RunnerStatusInfo } from '@larkwave/core';
import type { RunnerId } from '@larkwave/shared';

/** Options every runner's `run()` accepts — same shape across providers. */
export interface RunnerRunOptions {
  prompt: string;
  mode: AppMode;
  /** Working directory the app is generated into (the CLI writes files here). */
  cwd: string;
  /** Extra system steering (Claude honours it; others fold it into the prompt). */
  appendSystemPrompt?: string;
  /** When set, used verbatim instead of folding scope + system + user (non-Claude runners). */
  fullPrompt?: string;
  model?: string;
  signal?: AbortSignal;
}

/**
 * One CLI runner (provider) behind the registry. Claude delegates to the existing
 * `runClaude`; the others (grok/gemini/codex) use the generic spawn in runnerCore.
 */
export interface CliRunner {
  id: RunnerId;
  label: string;
  bin: string;
  installHint: string;
  models: { id: string; label: string }[];
  /** True if a usable binary is on PATH. */
  available(): Promise<boolean>;
  /** Live status (installed / logged-in / version) for the connect panel. */
  status(): Promise<RunnerStatusInfo>;
  /** Store an API key / token for this runner. */
  setToken(token: string): Promise<void>;
  /** Forget this runner's stored key/token. */
  clearToken(): Promise<void>;
  /** Run the runner headlessly and yield BuildEvents as it works. */
  run(opts: RunnerRunOptions): AsyncGenerator<BuildEvent>;
}
