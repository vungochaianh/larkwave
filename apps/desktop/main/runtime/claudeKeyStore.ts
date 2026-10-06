import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { app, safeStorage } from 'electron';
import type { ApiKeyEntry, ApiKeyList } from '@larkwave/core';

/**
 * Multi-key store for Anthropic API keys (`sk-ant-api…`), under `${userData}/claude/keys.bin`.
 *
 * This is the COMPLIANT team-access path: an admin adds one or more org-provisioned API
 * keys, labels them, and picks the active one; the active key feeds the local `claude` CLI
 * via `ANTHROPIC_API_KEY` (see claudeRunner.claudeEnv). It deliberately handles API KEYS
 * ONLY — never a personal `sk-ant-oat…` login/OAuth token — so it can't be used to extract
 * and hand off someone's interactive Claude login to other people.
 *
 * Secrets are encrypted at rest with Electron `safeStorage` (OS keychain), mirroring
 * secretStore.ts. When no keychain is available it falls back to a `PLAIN:` obfuscated blob
 * and reports `encrypted:false` so the UI can warn. Loaded + cached in memory so the active
 * key is readable SYNCHRONOUSLY on every CLI spawn.
 */

export interface StoredApiKey {
  id: string;
  label: string;
  /** Raw `sk-ant-api…` — NEVER crosses the IPC boundary to the renderer. */
  key: string;
  addedAt: string;
  lastValidated?: string;
  valid?: boolean;
}
interface KeyFile {
  activeId: string | null;
  keys: StoredApiKey[];
}

let cached: KeyFile | undefined; // undefined = not yet loaded from disk

function dir(): string {
  const d = join(app.getPath('userData'), 'claude');
  mkdirSync(d, { recursive: true });
  return d;
}
function keysPath(): string {
  return join(dir(), 'keys.bin');
}
export function encAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function load(): KeyFile {
  if (cached !== undefined) return cached;
  try {
    const p = keysPath();
    if (!existsSync(p)) {
      cached = { activeId: null, keys: [] };
      return cached;
    }
    const buf = readFileSync(p);
    let json: string;
    if (buf.subarray(0, 6).toString('utf8') === 'PLAIN:') json = buf.subarray(6).toString('utf8');
    else if (encAvailable()) json = safeStorage.decryptString(buf);
    else json = '';
    const parsed = json ? (JSON.parse(json) as KeyFile) : { activeId: null, keys: [] };
    cached = { activeId: parsed.activeId ?? null, keys: Array.isArray(parsed.keys) ? parsed.keys : [] };
  } catch {
    cached = { activeId: null, keys: [] };
  }
  return cached;
}

function persist(f: KeyFile): void {
  const json = JSON.stringify(f);
  const p = keysPath();
  if (encAvailable()) writeFileSync(p, safeStorage.encryptString(json));
  else writeFileSync(p, Buffer.concat([Buffer.from('PLAIN:'), Buffer.from(json, 'utf8')]));
  cached = f;
}

/** `sk-ant-…1234` — never the raw key. */
function mask(key: string): string {
  const k = key.trim();
  return `sk-ant-…${k.slice(-4)}`;
}

function toEntry(k: StoredApiKey, activeId: string | null): ApiKeyEntry {
  return {
    id: k.id,
    label: k.label,
    masked: mask(k.key),
    active: k.id === activeId,
    addedAt: k.addedAt,
    lastValidated: k.lastValidated,
    valid: k.valid,
  };
}

/** The renderer-facing list: masked entries + whether at-rest encryption is on. */
export function listKeys(): ApiKeyList {
  const f = load();
  return { keys: f.keys.map((k) => toEntry(k, f.activeId)), encrypted: encAvailable() };
}

/** True if the input looks like an Anthropic API key (not an OAuth login token). */
export function isApiKey(key: string): boolean {
  return /^sk-ant-api/i.test(key.trim());
}

/**
 * Add a key. Rejects anything that isn't an `sk-ant-api…` key (API keys only — no
 * personal OAuth tokens). Becomes active if it's the first key. `valid`/`lastValidated`
 * are optional (set by the caller after a validateKey() round-trip).
 */
export function addKey(input: { label: string; key: string; valid?: boolean }): ApiKeyList {
  const key = input.key.trim();
  if (!isApiKey(key)) {
    throw new Error('Chỉ chấp nhận API key Anthropic (sk-ant-api…). Token đăng nhập cá nhân (sk-ant-oat…) không dùng để chia sẻ cho người khác.');
  }
  const f = load();
  if (f.keys.some((k) => k.key === key)) throw new Error('Key này đã được thêm rồi.');
  const entry: StoredApiKey = {
    id: randomUUID(),
    label: input.label.trim() || `Key ${f.keys.length + 1}`,
    key,
    addedAt: new Date().toISOString(),
    valid: input.valid,
    lastValidated: input.valid === undefined ? undefined : new Date().toISOString(),
  };
  f.keys.push(entry);
  if (!f.activeId) f.activeId = entry.id; // first key is active by default
  persist(f);
  return listKeys();
}

export function removeKey(id: string): ApiKeyList {
  const f = load();
  f.keys = f.keys.filter((k) => k.id !== id);
  if (f.activeId === id) f.activeId = f.keys[0]?.id ?? null; // re-home the active pointer
  persist(f);
  return listKeys();
}

export function setActiveKey(id: string): ApiKeyList {
  const f = load();
  if (f.keys.some((k) => k.id === id)) {
    f.activeId = id;
    persist(f);
  }
  return listKeys();
}

/** Deactivate the active key WITHOUT removing any keys (used on Claude logout so the
 *  connect gate reappears; the admin's keys stay so the user can re-select one). */
export function clearActiveKey(): void {
  const f = load();
  if (f.activeId !== null) {
    f.activeId = null;
    persist(f);
  }
}

/** Record a validation result for a stored key (by id). */
export function markValidated(id: string, valid: boolean): void {
  const f = load();
  const k = f.keys.find((x) => x.id === id);
  if (k) {
    k.valid = valid;
    k.lastValidated = new Date().toISOString();
    persist(f);
  }
}

/**
 * The raw active API key, or null. Read SYNCHRONOUSLY by claudeEnv() on every spawn.
 * The only function that returns a raw key — and it's main-process only.
 */
export function getActiveKey(): string | null {
  const f = load();
  if (!f.activeId) return null;
  return f.keys.find((k) => k.id === f.activeId)?.key ?? null;
}
