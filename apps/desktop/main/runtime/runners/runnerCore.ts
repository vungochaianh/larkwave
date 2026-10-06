import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import type { BuildEvent } from '@larkwave/core';
import type { RunnerId } from '@larkwave/shared';
import { resolvedPath } from '../claudeRunner';
import { getProviderKey, PROVIDER_ENV_VAR } from './runnerTokenStore';

/** Write a long runner prompt to a scratch file (Grok requires `--prompt-file`). */
export function writeRunnerPromptFile(cwd: string, runnerId: string, prompt: string): string {
  const dir = join(cwd, '.toolswave');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${runnerId}-prompt.txt`);
  writeFileSync(path, prompt, 'utf8');
  return path;
}

// Each `shellEnvVar` miss spawns a LOGIN+INTERACTIVE shell (`zsh -lic`) that sources the
// user's full profile (.zshrc/nvm/…) — 200ms–2s apiece. Runner-status probing calls it
// several times per runner, so without this cache a single screen load spawned a dozen
// login shells. Env vars are stable for the process lifetime, so cache each lookup once.
const shellEnvCache = new Map<string, string | undefined>();

/** Read an env var the way the user's login shell sees it (Finder-launched apps miss .zshrc exports). */
export function shellEnvVar(name: string): string | undefined {
  const direct = process.env[name]?.trim();
  if (direct) return direct;
  if (process.platform === 'win32') return undefined;
  if (shellEnvCache.has(name)) return shellEnvCache.get(name);
  let value: string | undefined;
  try {
    const shell = process.env.SHELL || '/bin/zsh';
    const r = spawnSync(shell, ['-lic', `printf "%s" "\${${name}}"`], { encoding: 'utf8', timeout: 5000 });
    value = r.stdout?.trim() || undefined;
  } catch {
    value = undefined;
  }
  shellEnvCache.set(name, value);
  return value;
}

/** True when `grok login` (OAuth) left a session in ~/.grok/auth.json. */
function grokOAuthSession(): boolean {
  const p = join(homedir(), '.grok', 'auth.json');
  if (!existsSync(p)) return false;
  try {
    const j = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
    return typeof j === 'object' && j !== null && Object.keys(j).length > 0;
  } catch {
    return false;
  }
}

/** Probe `grok models` — prints "You are logged in with grok.com" when OAuth is active. */
function probeGrokModels(bin: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(bin, ['models'], { stdio: ['ignore', 'pipe', 'pipe'], env });
    let out = '';
    let settled = false;
    const finish = (v: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      try {
        child.kill();
      } catch {
        /* gone */
      }
      resolve(v);
    };
    // Bounded low: this runs on the UI's status probe, so a long wait stalls the
    // model picker / connect panel when grok is installed but not OAuth-logged-in.
    const t = setTimeout(() => finish(/logged in/i.test(out)), 3000);
    child.stdout.on('data', (c: Buffer) => {
      out += c.toString('utf8');
    });
    child.stderr.on('data', (c: Buffer) => {
      out += c.toString('utf8');
    });
    child.on('close', () => finish(/logged in/i.test(out)));
    child.on('error', () => finish(false));
  });
}

/**
 * Detect whether a non-Claude provider can run: Larkwave-stored key, shell/env API key,
 * or (grok) an existing `grok login` OAuth session.
 */
export async function probeProviderAuth(
  id: RunnerId,
  bin: string,
  env: NodeJS.ProcessEnv,
): Promise<{ loggedIn: boolean; authMethod?: string }> {
  if (getProviderKey(id)) return { loggedIn: true, authMethod: 'api_key' };
  const envVar = PROVIDER_ENV_VAR[id];
  if (envVar) {
    const fromShell = shellEnvVar(envVar);
    const alias =
      id === 'grok' ? shellEnvVar('GROK_API_KEY') : id === 'codex' ? shellEnvVar('CODEX_API_KEY') : undefined;
    if (fromShell || alias || env[envVar] || process.env[envVar]) {
      return { loggedIn: true, authMethod: 'env' };
    }
  }
  if (id === 'grok') {
    if (grokOAuthSession()) return { loggedIn: true, authMethod: 'grok.com' };
    if (await probeGrokModels(bin, env)) return { loggedIn: true, authMethod: 'grok.com' };
  }
  return { loggedIn: false };
}

/** Best-effort absolute path to a CLI binary on PATH (for the connect panel). */
export function resolveBinPath(bin: string, env: NodeJS.ProcessEnv): Promise<string | undefined> {
  return new Promise((resolve) => {
    const p = spawn('which', [bin], { stdio: ['ignore', 'pipe', 'ignore'], env });
    let out = '';
    p.stdout.on('data', (c: Buffer) => (out += c.toString('utf8')));
    p.on('error', () => resolve(undefined));
    p.on('close', (code) => resolve(code === 0 && out.trim() ? out.trim() : undefined));
  });
}

/** Kill a CLI that emits NO output for this long — it's hung (e.g. waiting on a
 *  non-TTY prompt) and would otherwise leave the build "đang chạy" forever.
 *  Override via TW_RUNNER_INACTIVITY_MS (also used by tests). */
const INACTIVITY_MS = Number(process.env.TW_RUNNER_INACTIVITY_MS) || 6 * 60_000;
const WATCH_TICK_MS = Math.min(30_000, INACTIVITY_MS);

/**
 * Generic runner plumbing shared by the non-Claude CLIs (grok/gemini/codex).
 * Claude has its own richer runner (claudeRunner.ts) and is NOT routed through
 * here — this keeps Claude's behaviour byte-identical while the other providers
 * reuse one spawn/drain/abort loop modeled on runClaude (claudeRunner.ts 312-375).
 */

/**
 * Environment for spawning a provider CLI: the process env with a login-shell PATH
 * (so a Finder-launched app finds nvm/homebrew/npm-global bins), plus the stored
 * provider key in the env var the CLI reads. grok also gets GROK_API_KEY (alias).
 */
export function runnerEnv(provider: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: resolvedPath(), HOME: process.env.HOME || homedir() };
  const varName = PROVIDER_ENV_VAR[provider];
  const key =
    getProviderKey(provider) ||
    (varName ? shellEnvVar(varName) : undefined) ||
    (provider === 'grok' ? shellEnvVar('GROK_API_KEY') : undefined) ||
    (provider === 'codex' ? shellEnvVar('CODEX_API_KEY') : undefined);
  if (key && varName) {
    env[varName] = key;
    // Some CLIs read a provider-specific alias too — set both so whichever the
    // installed build expects is present. grok: XAI_API_KEY | GROK_API_KEY;
    // codex: OPENAI_API_KEY | CODEX_API_KEY.
    if (provider === 'grok') env.GROK_API_KEY = key;
    if (provider === 'codex') env.CODEX_API_KEY = key;
  }
  return env;
}

/** True if `bin --version` exits 0 with the given env. Copy of claudeAvailable. */
export function binAvailable(bin: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn(bin, ['--version'], { stdio: 'ignore', env });
    p.on('error', () => resolve(false));
    p.on('close', (code) => resolve(code === 0));
  });
}

/**
 * One `bin --version` spawn → both liveness AND version, so status probing doesn't run
 * two identical spawns (`binAvailable` + `binVersion`) per runner. `installed` is the
 * exit code (matches `binAvailable`); `version` is parsed from the same output.
 */
export function binProbe(bin: string, env: NodeJS.ProcessEnv): Promise<{ installed: boolean; version?: string }> {
  return new Promise((resolve) => {
    const p = spawn(bin, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'], env });
    let out = '';
    p.stdout.on('data', (c: Buffer) => (out += c.toString('utf8')));
    p.stderr.on('data', (c: Buffer) => (out += c.toString('utf8')));
    p.on('error', () => resolve({ installed: false }));
    p.on('close', (code) =>
      resolve({ installed: code === 0, version: (out.match(/[\d]+\.[\d.]+/) || out.match(/[\d.]+/) || [])[0] }),
    );
  });
}

/** Best-effort version string from `bin --version` (first dotted number), or undefined. */
export function binVersion(bin: string, env: NodeJS.ProcessEnv): Promise<string | undefined> {
  return new Promise((resolve) => {
    const p = spawn(bin, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'], env });
    let out = '';
    p.stdout.on('data', (c: Buffer) => (out += c.toString('utf8')));
    p.stderr.on('data', (c: Buffer) => (out += c.toString('utf8')));
    p.on('error', () => resolve(undefined));
    p.on('close', () => resolve((out.match(/[\d]+\.[\d.]+/) || out.match(/[\d.]+/) || [])[0]));
  });
}

export interface GenericRunInput {
  bin: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  /** Turn one stdout line into zero or more BuildEvents (these CLIs aren't stream-json). */
  parseLine: (line: string) => BuildEvent[];
  signal?: AbortSignal;
  /** Stage label for the start/end markers (defaults to the bin name). */
  stageName?: string;
}

/**
 * Spawn a CLI and stream its stdout line-by-line through `parseLine`, piping stderr
 * as warn logs. Emits the standard running/succeeded|failed status + a stage marker
 * — same queue/drain/abort idiom as runClaude so the shared <BuildProgress/> renders it.
 */
export async function* genericRun(input: GenericRunInput): AsyncGenerator<BuildEvent> {
  const stage = input.stageName ?? `Khởi động ${input.bin}`;
  yield { type: 'status', status: 'running' };
  yield { type: 'stage', name: stage, state: 'running' };

  const child = spawn(input.bin, input.args, {
    cwd: input.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: input.env,
  });
  input.signal?.addEventListener('abort', () => child.kill('SIGTERM'));

  const queue: BuildEvent[] = [];
  let resolveNext: (() => void) | null = null;
  const push = (e: BuildEvent) => {
    queue.push(e);
    resolveNext?.();
    resolveNext = null;
  };

  let buf = '';
  let lastOut = Date.now(); // for the inactivity watchdog below
  let done = false;
  let exitCode = 0;
  let timedOut = false;
  let watchdog: ReturnType<typeof setInterval> | undefined;
  const stopWatch = () => {
    if (watchdog) {
      clearInterval(watchdog);
      watchdog = undefined;
    }
  };
  child.stdout.on('data', (chunk: Buffer) => {
    lastOut = Date.now();
    buf += chunk.toString('utf8');
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      for (const e of input.parseLine(line)) push(e);
    }
  });
  child.stderr.on('data', (c: Buffer) => {
    lastOut = Date.now();
    const msg = c.toString('utf8').trim().slice(0, 400);
    // Surface CLI fatal errors (e.g. grok "unexpected argument") as errors, not silent warns.
    const isErr = /^error\b/i.test(msg) || /\berror:/i.test(msg);
    push({ type: 'log', level: isErr ? 'error' : 'warn', message: msg });
    if (isErr) push({ type: 'error', message: msg });
  });

  child.on('error', (err) => {
    push({ type: 'error', message: `Không gọi được ${input.bin}: ${err.message}` });
    exitCode = -1; // spawn failed → final status must be 'failed', not 'succeeded'
    done = true;
    stopWatch();
    resolveNext?.();
  });
  child.on('close', (code) => {
    // A signal-kill (watchdog/abort) reports code=null → must be 'failed', not 'succeeded'.
    exitCode = timedOut ? 124 : code ?? 0;
    done = true;
    stopWatch();
    resolveNext?.();
  });

  // Inactivity watchdog: if the CLI emits NOTHING for too long it's hung (e.g. waiting for
  // interactive input in a non-TTY) → kill it + emit a terminal error so the build never
  // stays "đang chạy" forever.
  watchdog = setInterval(() => {
    if (done) return;
    if (Date.now() - lastOut > INACTIVITY_MS) {
      timedOut = true;
      stopWatch();
      push({
        type: 'error',
        message: `Tiến trình "${input.bin}" không phản hồi quá ${Math.round(INACTIVITY_MS / 60000)} phút — đã tự dừng.`,
      });
      try {
        child.kill('SIGTERM');
      } catch {
        /* already gone */
      }
      setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* already gone */
        }
      }, 4000);
    }
  }, WATCH_TICK_MS);

  try {
    while (!done || queue.length) {
      if (!queue.length) {
        await new Promise<void>((r) => (resolveNext = r));
        continue;
      }
      yield queue.shift()!;
    }
  } finally {
    // Runs on normal completion AND on an early abort (.return()): always stop the watchdog
    // and kill the child if it's still alive, so an aborted build never orphans a process.
    stopWatch();
    if (!done) {
      try {
        child.kill('SIGTERM');
      } catch {
        /* already gone */
      }
    }
  }
  // Flush any trailing partial line.
  const tail = buf.trim();
  if (tail) for (const e of input.parseLine(tail)) yield e;

  yield { type: 'stage', name: stage, state: exitCode === 0 ? 'done' : 'error' };
  yield { type: 'status', status: exitCode === 0 ? 'succeeded' : 'failed' };
}
