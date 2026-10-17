import { spawn, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { AppMode, BuildEvent, ClaudeLoginEvent, ClaudeStatus, KeyValidation } from '@larkwave/core';
import { getStoredToken, removeStoredToken, storeToken, tokenEnvVar } from './claudeTokenStore';
import { getActiveKey, clearActiveKey } from './claudeKeyStore';
import { contextUsageFromResult, CONTEXT_WARN_THRESHOLD } from './contextBudget';
import { isAnthropicApiKey, notApiKeyMessage } from './claudeKeyKind';
import { checkAnthropicKey, type FetchLike } from '@larkwave/core';

/**
 * macOS/Linux GUI apps don't inherit the shell PATH, so `spawn('claude')` fails
 * with ENOENT even when the user has installed + logged in `claude` (it lives in
 * an nvm/homebrew/npm-global bin that the Finder-launched app never sees). We
 * query the user's LOGIN shell once for its PATH and use that for every `claude`
 * spawn — both here and in the Lark agent. Cached for the process.
 */
let cachedPath: string | null = null;
export function resolvedPath(): string {
  if (cachedPath !== null) return cachedPath;
  let extra = '';
  if (process.platform !== 'win32') {
    try {
      const shell = process.env.SHELL || '/bin/zsh';
      // -l (login) + -i (interactive) so nvm/.zshrc PATH edits are applied.
      const r = spawnSync(shell, ['-lic', 'printf "%s" "$PATH"'], { encoding: 'utf8', timeout: 6000 });
      if (r.status === 0 && r.stdout) extra = r.stdout.trim();
    } catch {
      /* fall back to the common dirs below */
    }
  }
  const home = process.env.HOME || '';
  // nvm installs `claude` under ~/.nvm/versions/node/<ver>/bin. Enumerate them DIRECTLY so the
  // binary is found even when the login-shell PATH query above fails/returns empty — common for a
  // Finder-launched GUI app, and the likely cause of "claude not found" on Intel Macs (different
  // shell setup / claude installed via nvm rather than /usr/local/bin). Newest node first.
  let nvmBins: string[] = [];
  try {
    const base = `${home}/.nvm/versions/node`;
    nvmBins = readdirSync(base).sort().reverse().map((v) => `${base}/${v}/bin`);
  } catch {
    /* no nvm — fine */
  }
  cachedPath = [
    process.env.PATH || '',
    extra,
    `${home}/.claude/local`, // Claude Code NATIVE installer target (not covered by the dirs below)
    '/opt/homebrew/bin', // Apple Silicon homebrew
    '/usr/local/bin', // Intel homebrew + many npm-global installs
    ...nvmBins, // nvm-installed npm globals (where `claude` frequently lives)
    `${home}/.local/bin`,
    `${home}/.bun/bin`,
    `${home}/.volta/bin`,
    `${home}/.grok/bin`, // grok installer drops the binary here
  ]
    .filter(Boolean)
    .join(':');
  return cachedPath;
}

/** Environment for spawning `claude` — process env with a shell-resolved PATH,
 *  plus the pasted auth token (if any) in the env var the CLI reads. */
export function claudeEnv(opts?: { noKey?: boolean }): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: resolvedPath() };
  // noKey → use the user's OWN `claude` login (subscription): strip any injected key/token so a
  // depleted/invalid stored API key can't hijack a working subscription (the credit-error retry).
  if (opts?.noKey) {
    delete env.ANTHROPIC_API_KEY;
    delete env.CLAUDE_CODE_OAUTH_TOKEN;
    return env;
  }
  // A managed API key (team-access store) wins over the legacy single pasted token.
  // Managed keys are always API keys, so route them to ANTHROPIC_API_KEY only.
  const managed = getActiveKey();
  if (managed) {
    env.ANTHROPIC_API_KEY = managed;
    delete env.CLAUDE_CODE_OAUTH_TOKEN;
    return env;
  }
  const token = getStoredToken();
  if (token) {
    const chosen = tokenEnvVar(token);
    env[chosen] = token;
    // Set ONLY the chosen var so an unrelated value already in the ambient env
    // can't shadow the user's pasted token (precedence stays unambiguous).
    if (chosen === 'ANTHROPIC_API_KEY') delete env.CLAUDE_CODE_OAUTH_TOKEN;
    else delete env.ANTHROPIC_API_KEY;
    return env;
  }
  // No app-configured credential → the app should behave like `claude` in the user's terminal,
  // i.e. use their own ~/.claude login. Strip any STALE ambient ANTHROPIC_API_KEY /
  // CLAUDE_CODE_OAUTH_TOKEN (e.g. one set via `launchctl setenv`, which a Finder-launched app
  // INHERITS but the shell doesn't). Otherwise that leftover/drained key hijacks the login and the
  // app errors ("credit balance is too low") even though `claude` in the terminal works fine.
  delete env.ANTHROPIC_API_KEY;
  delete env.CLAUDE_CODE_OAUTH_TOKEN;
  return env;
}

/**
 * The heart of the desktop cost win: instead of paying api.toolswave.net per
 * token, we drive the user's LOCAL Claude Code CLI in headless mode. It runs the
 * full agent loop (tools, file writes) on their machine under THEIR Claude
 * subscription, and we translate its stream-json output into BuildEvents the
 * shared <BuildProgress/> already understands.
 *
 * Swap target later: the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`)
 * exposes the same loop programmatically; this CLI-spawn version needs no SDK
 * version pinning and uses whatever `claude` the user already has authed.
 */

// Larkwave runs `claude -p` HEADLESSLY — there's no TTY/UI to answer an
// interactive permission prompt mid-run. So any prompting mode (`default`) writes
// NOTHING (Claude asks, gets auto-denied, scaffolds zero files → broken app). Every
// write-capable mode must therefore auto-accept. `plan` stays read-only (proposes a
// plan, makes no changes — intentional); `auto` also lets Claude run bash to
// self-test/fix. (Was: ask→'default' which silently produced empty apps.)
const PERMISSION_MODE: Record<AppMode, string> = {
  plan: 'plan',
  ask: 'acceptEdits',
  build: 'acceptEdits',
  auto: 'bypassPermissions',
};

/** Kill Claude if it streams NOTHING for this long — it's hung; otherwise the build
 *  would sit at "đang chạy" forever. stream-json emits events continuously, so a long
 *  silence is a reliable hang signal. Override via TW_RUNNER_INACTIVITY_MS. */
const CLAUDE_INACTIVITY_MS = Number(process.env.TW_RUNNER_INACTIVITY_MS) || 6 * 60_000;

export interface ClaudeRunOptions {
  prompt: string;
  mode: AppMode;
  /** Working directory the app is generated into (Claude writes files here). */
  cwd: string;
  /** Extra system steering appended to Claude's system prompt. */
  appendSystemPrompt?: string;
  model?: string;
  signal?: AbortSignal;
}

// Binary presence is stable for a session; a positive result is cached so the many
// callers (status probes, Lark status, each build) don't re-spawn `claude --version`.
// A negative is NOT cached — the user may install the CLI mid-session and recover.
let claudeAvailableCache = false;

/** True when the app would inject a stored API key / pasted token into `claude`'s env (so a credit
 *  error might be that key being out of credit, not the user's own subscription). */
export function hasInjectedCredential(): boolean {
  return !!(getActiveKey() || getStoredToken());
}

/** True if a usable `claude` binary is on PATH. */
export async function claudeAvailable(): Promise<boolean> {
  if (claudeAvailableCache) return true;
  return new Promise((resolve) => {
    const p = spawn('claude', ['--version'], { stdio: 'ignore', env: claudeEnv() });
    p.on('error', () => resolve(false));
    p.on('close', (code) => {
      if (code === 0) claudeAvailableCache = true;
      resolve(code === 0);
    });
  });
}

/** Run a claude subcommand, capture stdout/stderr/exit. */
function capture(args: string[]): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    const p = spawn('claude', args, { stdio: ['ignore', 'pipe', 'pipe'], env: claudeEnv() });
    let out = '';
    let err = '';
    p.stdout.on('data', (c: Buffer) => (out += c.toString('utf8')));
    p.stderr.on('data', (c: Buffer) => (err += c.toString('utf8')));
    p.on('error', () => resolve({ code: -1, out, err: 'spawn error' }));
    p.on('close', (code) => resolve({ code: code ?? -1, out, err }));
  });
}

/** Read `claude auth status` (+ version). */
export async function claudeStatus(): Promise<ClaudeStatus> {
  return claudeStatusBase();
}

async function claudeStatusBase(): Promise<ClaudeStatus> {
  // One `--version` spawn covers BOTH "installed?" and the version string (was two).
  const ver = await capture(['--version']);
  if (ver.code !== 0) return { installed: false, loggedIn: false };
  claudeAvailableCache = true;
  const version = (ver.out.match(/[\d.]+/) || [])[0];
  // A managed API key or a pasted token authenticates via an env var, which
  // `claude auth status` (OAuth login) doesn't reflect — so report it directly.
  const managed = getActiveKey();
  if (managed) {
    return { installed: true, version, loggedIn: true, authMethod: 'token', plan: 'API key (quản lý)' };
  }
  const token = getStoredToken();
  if (token) {
    return {
      installed: true,
      version,
      loggedIn: true,
      authMethod: 'token',
      plan: tokenEnvVar(token) === 'CLAUDE_CODE_OAUTH_TOKEN' ? 'Token đăng nhập' : 'API key',
    };
  }
  const st = await capture(['auth', 'status']);
  // status prints JSON (non-TTY); be defensive and pull the JSON object out.
  let json: any = null;
  const m = st.out.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      json = JSON.parse(m[0]);
    } catch {
      /* ignore */
    }
  }
  if (!json) return { installed: true, version, loggedIn: false };
  return {
    installed: true,
    version,
    loggedIn: !!json.loggedIn,
    email: json.email,
    plan: json.subscriptionType,
    authMethod: json.authMethod,
  };
}

/** Run `claude auth login` (opens the browser OAuth flow) and stream it. */
export async function* claudeLogin(): AsyncGenerator<ClaudeLoginEvent> {
  if (!(await claudeAvailable())) {
    yield { type: 'error', message: 'Chưa cài Claude CLI trên máy.' };
    return;
  }
  const child = spawn('claude', ['auth', 'login'], { stdio: ['ignore', 'pipe', 'pipe'], env: claudeEnv() });
  const queue: ClaudeLoginEvent[] = [];
  let wake: (() => void) | null = null;
  const push = (e: ClaudeLoginEvent) => {
    queue.push(e);
    wake?.();
    wake = null;
  };
  const onText = (t: string) => {
    for (const line of t.split('\n')) {
      const s = line.trim();
      if (!s) continue;
      const url = s.match(/https?:\/\/[^\s"']+/);
      if (url) push({ type: 'url', url: url[0] });
      else push({ type: 'log', message: s.slice(0, 200) });
    }
  };
  child.stdout.on('data', (c: Buffer) => onText(c.toString('utf8')));
  child.stderr.on('data', (c: Buffer) => onText(c.toString('utf8')));
  let done = false;
  let code = 0;
  child.on('error', () => {
    push({ type: 'error', message: 'Không chạy được `claude auth login`.' });
    done = true;
    wake?.();
  });
  child.on('close', (c) => {
    code = c ?? -1;
    done = true;
    wake?.();
  });
  while (!done || queue.length) {
    if (!queue.length) {
      await new Promise<void>((r) => (wake = r));
      continue;
    }
    yield queue.shift()!;
  }
  if (code === 0) {
    // `claude auth login` can finish writing its credentials a moment AFTER the process
    // exits, so a single status read may still see "not logged in". Poll the auth status
    // (cheap base read, no codegraph) for ~2.5s until it registers, so the gate advances on
    // its own instead of leaving the user stuck on "Đăng nhập".
    let s = await claudeStatusBase();
    for (let i = 0; i < 10 && !s.loggedIn; i++) {
      await new Promise((r) => setTimeout(r, 250));
      s = await claudeStatusBase();
    }
    yield { type: 'done', status: await claudeStatus() };
  } else {
    yield { type: 'error', message: 'Đăng nhập chưa hoàn tất. Hãy thử lại hoặc chạy `claude` rồi `/login` trong terminal.' };
  }
}

export async function claudeLogout(): Promise<void> {
  // FULL disconnect — otherwise `claudeStatus()` still reports loggedIn from a leftover
  // pasted token / active managed key and the connect gate never reappears after logout.
  await capture(['auth', 'logout']);
  removeStoredToken(); // clear a pasted personal token (sk-ant-oat… / sk-ant-api…)
  clearActiveKey(); // deactivate the managed team key (keys themselves stay for re-select)
}

/** Save a pasted token (API key / OAuth token) + return the resulting status. */
export async function setClaudeToken(token: string): Promise<ClaudeStatus> {
  storeToken(token);
  return claudeStatus();
}

/** Forget the pasted token (fall back to the CLI's own OAuth login) + return status. */
export async function clearClaudeToken(): Promise<ClaudeStatus> {
  removeStoredToken();
  return claudeStatus();
}

/**
 * Validate an Anthropic API key by making the cheapest possible `/v1/messages` call
 * (`claude-haiku-4-5`, max_tokens 1). HTTP 200 ⇒ valid; 401/403 ⇒ rejected; anything
 * else ⇒ transient/unknown. Used before storing a key and for the UI "Kiểm tra" button,
 * so a typo'd/revoked key is caught instead of being silently saved as "connected".
 */
export async function validateKey(key: string): Promise<KeyValidation> {
  const k = key.trim();
  if (!isAnthropicApiKey(k)) return { ok: false, error: notApiKeyMessage(k) };
  // Đăng nhập bằng /v1/models (không tốn token, không phụ thuộc model) rồi mới thử dùng — lỗi hết credit
  // không còn thành "HTTP 400" vô nghĩa (xem @larkwave/core anthropicKeyCheck).
  return checkAnthropicKey(k, fetch as unknown as FetchLike);
}

/** Run Claude headlessly and yield BuildEvents as it works. */
export async function* runClaude(opts: ClaudeRunOptions): AsyncGenerator<BuildEvent> {
  const args = [
    '-p',
    opts.prompt,
    '--output-format',
    'stream-json',
    '--verbose',
    '--permission-mode',
    PERMISSION_MODE[opts.mode],
    // Let Claude read/write files in its working dir (skill drafts, scratch files).
    '--add-dir',
    opts.cwd,
  ];
  if (opts.model) args.push('--model', opts.model);
  // Optional insurance so a STILL-ACTIVELY-WORKING big build isn't truncated by a low CLI turn
  // default. ENV-GATED + OFF by default: an unrecognised flag on the pinned `claude` would fail
  // EVERY spawn. Set TW_RUNNER_MAX_TURNS (e.g. "40") after validating the flag on the installed CLI.
  if (process.env.TW_RUNNER_MAX_TURNS) args.push('--max-turns', process.env.TW_RUNNER_MAX_TURNS);

  const appendSystemPrompt = opts.appendSystemPrompt;
  if (appendSystemPrompt) args.push('--append-system-prompt', appendSystemPrompt);

  yield { type: 'status', status: 'running' };
  yield { type: 'stage', name: 'Khởi động Claude CLI', state: 'running' };

  const child = spawn('claude', args, { cwd: opts.cwd, stdio: ['ignore', 'pipe', 'pipe'], env: claudeEnv() });
  opts.signal?.addEventListener('abort', () => child.kill('SIGTERM'));

  // stream-json emits one JSON object per line on stdout.
  const queue: BuildEvent[] = [];
  let resolveNext: (() => void) | null = null;
  const push = (e: BuildEvent) => {
    queue.push(e);
    resolveNext?.();
    resolveNext = null;
  };

  let buf = '';
  let cliModel: string | undefined; // model id from the init event → context window
  // The LAST assistant turn's own usage — the true near-end resident context. We must NOT
  // read the terminal `result` event's usage for the context-% warning: that field is the
  // RUN-LEVEL cumulative sum across every internal agent-loop turn (cache_read re-counted
  // each turn), so it balloons past the window and falsely reads ~100% on multi-file builds.
  let lastAssistantUsage: any = null;
  let lastOut = Date.now(); // for the inactivity watchdog
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
      let obj: any;
      try {
        obj = JSON.parse(line);
      } catch {
        push({ type: 'log', level: 'info', message: line.slice(0, 200) });
        continue;
      }
      if (obj?.type === 'system' && obj.subtype === 'init' && typeof obj.model === 'string') cliModel = obj.model;
      if (obj?.type === 'assistant' && obj.message?.usage && typeof obj.message.usage === 'object')
        lastAssistantUsage = obj.message.usage;
      for (const e of mapEvent(obj, cliModel, lastAssistantUsage)) push(e);
    }
  });
  child.stderr.on('data', (c: Buffer) => {
    lastOut = Date.now();
    push({ type: 'log', level: 'warn', message: c.toString('utf8').trim().slice(0, 200) });
  });

  child.on('error', (err) => {
    push({ type: 'error', message: `Không gọi được Claude CLI: ${err.message}` });
    exitCode = -1; // spawn failed → 'failed', not 'succeeded'
    done = true;
    stopWatch();
    resolveNext?.();
  });
  child.on('close', (code) => {
    // A signal-kill (watchdog/abort) reports code=null → must be 'failed'.
    exitCode = timedOut ? 124 : code ?? 0;
    done = true;
    stopWatch();
    resolveNext?.();
  });

  // Inactivity watchdog: kill Claude if it streams NOTHING for too long (hung) so the
  // build never stays "đang chạy" forever.
  watchdog = setInterval(() => {
    if (done) return;
    if (Date.now() - lastOut > CLAUDE_INACTIVITY_MS) {
      timedOut = true;
      stopWatch();
      push({
        type: 'error',
        message: `Claude CLI không phản hồi quá ${Math.round(CLAUDE_INACTIVITY_MS / 60000)} phút — đã tự dừng.`,
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
  }, Math.min(30_000, CLAUDE_INACTIVITY_MS));

  // Drain the queue as events arrive.
  try {
    while (!done || queue.length) {
      if (!queue.length) {
        await new Promise<void>((r) => (resolveNext = r));
        continue;
      }
      yield queue.shift()!;
    }
  } finally {
    // Runs on normal completion AND on an early abort (.return()): always stop the watchdog,
    // kill a still-alive child — no orphaned process.
    stopWatch();
    if (!done) {
      try {
        child.kill('SIGTERM');
      } catch {
        /* already gone */
      }
    }
  }
  yield { type: 'stage', name: 'Khởi động Claude CLI', state: exitCode === 0 ? 'done' : 'error' };
  yield { type: 'status', status: exitCode === 0 ? 'succeeded' : 'failed' };
}

/** A short human label for a tool call — the file it writes/reads, the command it runs — so the
 *  stream shows "🔧 Ghi src/App.tsx" not a bare "🔧 Write" (all identical → looks frozen + the UI
 *  collapses duplicate rows). Degrades to the tool name for unknown tools / missing input. */
function describeTool(name: string, input: any): string {
  const base = (p: unknown) => (typeof p === 'string' ? p.split(/[\\/]/).pop() || p : '');
  const rel = (p: unknown) => {
    if (typeof p !== 'string') return '';
    const m = p.match(/(?:^|\/)((?:src|pages|components|lib|server|public|app)\/.+)$/);
    return m ? m[1] : base(p);
  };
  const clip = (s: unknown, n = 70) => {
    const t = typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '';
    return t.length > n ? t.slice(0, n) + '…' : t;
  };
  switch (name) {
    case 'Write':
      return `Ghi ${rel(input?.file_path) || 'file'}`;
    case 'Edit':
    case 'MultiEdit':
      return `Sửa ${rel(input?.file_path) || 'file'}`;
    case 'Read':
      return `Đọc ${rel(input?.file_path) || 'file'}`;
    case 'Bash':
      return `Chạy ${clip(input?.command) || 'lệnh'}`;
    case 'Grep':
      return `Tìm ${clip(input?.pattern)}`.trim();
    case 'Glob':
      return `Liệt kê ${clip(input?.pattern)}`.trim();
    default:
      return name;
  }
}

/** Map a Claude stream-json line to zero or more BuildEvents. */
function mapEvent(obj: any, model?: string, lastAssistantUsage?: any): BuildEvent[] {
  if (obj?.type === 'system' && obj.subtype === 'init')
    return [{ type: 'log', level: 'info', message: `Claude sẵn sàng (model ${obj.model ?? '?'})` }];
  if (obj?.type === 'assistant' && obj.message?.content) {
    const out: BuildEvent[] = [];
    for (const block of obj.message.content) {
      if (block.type === 'text' && block.text?.trim())
        out.push({ type: 'log', level: 'info', message: block.text.trim().slice(0, 400) });
      else if (block.type === 'tool_use')
        out.push({ type: 'stage', name: `🔧 ${describeTool(block.name, block.input)}`, state: 'running' });
    }
    return out;
  }
  if (obj?.type === 'result') {
    // This is the LOCAL Claude CLI (subscription/Max login) — the CLI self-reports a
    // `total_cost_usd`, but that's only what the run WOULD cost on the pay-as-you-go API;
    // a CLI/subscription user is NOT billed per run. Showing a bare "($2.24)" reads like a
    // charge and alarms users → make it explicit it's an estimate and not billed.
    const costNum = typeof obj.total_cost_usd === 'number' ? obj.total_cost_usd : null;
    const out: BuildEvent[] = [
      {
        type: 'log',
        level: 'info',
        message:
          costNum != null && costNum > 0
            ? `Hoàn tất · ước tính ~$${costNum.toFixed(2)} nếu tính theo giá API — bạn đang dùng Claude CLI (gói thuê bao) nên KHÔNG bị tính tiền.`
            : 'Hoàn tất',
      },
    ];
    // Warn when this build's conversation is nearing Claude's context window — the user
    // should start a fresh app/chat before Claude begins forgetting earlier turns.
    // Measure from the LAST assistant turn's own usage (the true resident context), NOT the
    // `result` event's cumulative run total — the latter over-counts cached reads per turn
    // and falsely reports ~100% on a normal multi-file build.
    const usage = contextUsageFromResult(lastAssistantUsage ? { usage: lastAssistantUsage } : obj, model);
    if (usage && usage.percentUsed >= CONTEXT_WARN_THRESHOLD) {
      out.push({
        type: 'log',
        level: 'warn',
        message: `⚠️ Hội thoại đã dùng ~${Math.round(usage.percentUsed * 100)}% ngữ cảnh của Claude — nên mở cuộc trò chuyện mới để Claude không quên phần trước.`,
      });
    }
    return out;
  }
  return [];
}
