import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { app, safeStorage } from 'electron';

/**
 * On-disk store for a pasted API key, PER non-Claude CLI runner (grok/gemini/codex),
 * under `${userData}/runners/`. Modeled 1:1 on claudeTokenStore.ts: the key is a
 * SECRET → encrypted at rest with Electron `safeStorage` (OS keychain), with a
 * `PLAIN:` fallback when no keychain is available. Cached in memory per provider so
 * `runnerEnv()` can read it synchronously on every spawn.
 *
 * Claude keeps its OWN store (claudeTokenStore.ts) — this is only the generic
 * provider-key store for the other runners.
 */

/** The env var each provider's CLI reads its key from. grok also accepts GROK_API_KEY. */
export const PROVIDER_ENV_VAR: Record<string, string> = {
  grok: 'XAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  codex: 'OPENAI_API_KEY',
};

// undefined = not yet loaded from disk; null = loaded, no key.
const cache: Record<string, string | null | undefined> = {};

function dir(): string {
  const d = join(app.getPath('userData'), 'runners');
  mkdirSync(d, { recursive: true });
  return d;
}
function keyPath(provider: string): string {
  return join(dir(), `${provider}.bin`);
}
function encAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

/** The stored key for a provider, or null. Loads + caches on first call. */
export function getProviderKey(provider: string): string | null {
  if (cache[provider] !== undefined) return cache[provider] ?? null;
  try {
    const p = keyPath(provider);
    if (!existsSync(p)) {
      cache[provider] = null;
      return null;
    }
    const buf = readFileSync(p);
    if (buf.subarray(0, 6).toString('utf8') === 'PLAIN:') {
      cache[provider] = buf.subarray(6).toString('utf8');
    } else if (encAvailable()) {
      cache[provider] = safeStorage.decryptString(buf);
    } else {
      cache[provider] = null;
    }
  } catch {
    cache[provider] = null;
  }
  return cache[provider] ?? null;
}

export function setProviderKey(provider: string, token: string): void {
  const t = token.trim();
  const p = keyPath(provider);
  if (encAvailable()) {
    writeFileSync(p, safeStorage.encryptString(t));
  } else {
    // No keychain (rare): obfuscate + mark; the connect UI warns when unavailable.
    writeFileSync(p, Buffer.concat([Buffer.from('PLAIN:'), Buffer.from(t, 'utf8')]));
  }
  cache[provider] = t;
}

export function removeProviderKey(provider: string): void {
  try {
    rmSync(keyPath(provider), { force: true });
  } catch {
    /* ignore */
  }
  cache[provider] = null;
}
