import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { app, safeStorage } from 'electron';

/**
 * On-disk store for a pasted Claude auth token, under `${userData}/claude/`.
 *
 * Lets the user authenticate the local `claude` CLI by pasting a token instead of
 * the browser OAuth flow — handy on machines where the OAuth round-trip is awkward,
 * or to reuse a CI token. The token is a SECRET → encrypted at rest with Electron
 * `safeStorage` (OS keychain), same as the Lark credentials. Cached in memory so
 * `claudeEnv()` can read it synchronously on every spawn.
 *
 * Two token kinds are supported, routed to the env var the CLI reads:
 *   • API key      `sk-ant-api…` → ANTHROPIC_API_KEY      (billed per-token)
 *   • OAuth token  `sk-ant-oat…` → CLAUDE_CODE_OAUTH_TOKEN (uses the Pro/Max plan;
 *                                   created by `claude setup-token`)
 */

let cached: string | null | undefined; // undefined = not yet loaded from disk

function dir(): string {
  const d = join(app.getPath('userData'), 'claude');
  mkdirSync(d, { recursive: true });
  return d;
}
function tokenPath(): string {
  return join(dir(), 'token.bin');
}
function encAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

/** The stored token (API key or OAuth token), or null. Loads + caches on first call. */
export function getStoredToken(): string | null {
  if (cached !== undefined) return cached;
  try {
    const p = tokenPath();
    if (!existsSync(p)) {
      cached = null;
      return null;
    }
    const buf = readFileSync(p);
    if (buf.subarray(0, 6).toString('utf8') === 'PLAIN:') {
      cached = buf.subarray(6).toString('utf8');
    } else if (encAvailable()) {
      cached = safeStorage.decryptString(buf);
    } else {
      cached = null;
    }
  } catch {
    cached = null;
  }
  return cached ?? null;
}

export function storeToken(token: string): void {
  const t = token.trim();
  const p = tokenPath();
  if (encAvailable()) {
    writeFileSync(p, safeStorage.encryptString(t));
  } else {
    // No keychain (rare): obfuscate + mark; the connect UI warns when unavailable.
    writeFileSync(p, Buffer.concat([Buffer.from('PLAIN:'), Buffer.from(t, 'utf8')]));
  }
  cached = t;
}

export function removeStoredToken(): void {
  try {
    rmSync(tokenPath(), { force: true });
  } catch {
    /* ignore */
  }
  cached = null;
}

/** The env var the CLI reads for this token, chosen by its prefix. */
export function tokenEnvVar(token: string): 'ANTHROPIC_API_KEY' | 'CLAUDE_CODE_OAUTH_TOKEN' {
  return /^sk-ant-oat/i.test(token.trim()) ? 'CLAUDE_CODE_OAUTH_TOKEN' : 'ANTHROPIC_API_KEY';
}
