import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, chmodSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { safeStorage } from 'electron';
import type { LarkAutomation, LarkBaseRef, LarkBotConfig } from '@larkwave/core';
import type { LarkUserTokens } from './larkOAuth';

/** A persisted automation rule + the engine's dedup state (record ids already actioned). */
export type StoredAutomation = LarkAutomation & { firedRecordIds?: string[] };

export interface LarkCreds {
  appId: string;
  appSecret: string;
}

/** One remembered app in the connection history — includes the (encrypted) secret so
 *  the user can switch back without re-pasting it. */
export interface StoredApp extends LarkCreds {
  name?: string;
  tenantName?: string;
  lastUsedAt?: string;
}

/** The personal-account OAuth session (user_access_token bundle + display name). */
export type StoredUserAuth = LarkUserTokens & { userName?: string };

/**
 * On-disk store for the Lark connection, under `${userData}/lark/`.
 *
 * The custom-app credentials (`app_id` + `app_secret`) are encrypted at rest with
 * Electron `safeStorage` (OS keychain — macOS Keychain / Windows DPAPI), the
 * desktop analog of the API's AES secret-crypto. We never write `app_secret` in
 * plaintext when the keychain is available. The Base list is not secret and is a
 * plain JSON file. The short-lived `tenant_access_token` is kept in memory only
 * (see LarkClient) — never persisted.
 */
export class SecretStore {
  /** `${userData}/lark` — holds the per-account config subfolders + legacy flat files. */
  private readonly larkRoot: string;
  /** The ACTIVE account's config folder (`lark/accounts/<userId>` | `.../_local`). */
  private dir: string;
  private legacyMigrated = false;

  /** Every per-account config file — the connection secret, saved apps, bot, OAuth, Bases,
   *  settings, automations. All isolated per Larkwave account (moved together on adopt). */
  private static readonly CONFIG_FILES = [
    'creds.bin',
    'apps.bin',
    'bot.bin',
    'user.bin',
    'bases.json',
    'settings.json',
    'automations.json',
  ];

  constructor(baseDir: string) {
    this.larkRoot = join(baseDir, 'lark');
    this.dir = join(this.larkRoot, 'accounts', '_local');
    mkdirSync(this.dir, { recursive: true });
  }

  private localDir(): string {
    return join(this.larkRoot, 'accounts', '_local');
  }

  /**
   * Scope the ENTIRE Lark config to a Larkwave account (null → the signed-out `_local`
   * pool). Isolates the connection (app_secret), saved apps, personal OAuth, bot, Bases,
   * settings + automations per account, so signing in as someone else never inherits — or
   * exposes — another account's Lark setup on a shared device. The config secret is never
   * backed up to the cloud (only sessions/bases sync), so unlike conversations it is
   * device-bounded and the first account to sign in may safely ADOPT the device's existing
   * connection (the common single-user upgrade) rather than forcing a reconnect.
   */
  setScope(userId: string | null): void {
    this.migrateLegacyRootOnce();
    const scope = (userId ? userId.replace(/[^A-Za-z0-9_-]/g, '') : '') || '_local';
    this.dir = join(this.larkRoot, 'accounts', scope);
    mkdirSync(this.dir, { recursive: true });
    if (userId) this.adoptLocalPoolIfEmpty();
  }

  private moveConfigFiles(from: string, to: string): void {
    for (const f of SecretStore.CONFIG_FILES) {
      const src = join(from, f);
      if (!existsSync(src)) continue;
      try {
        mkdirSync(to, { recursive: true });
        renameSync(src, join(to, f));
      } catch {
        /* best effort */
      }
    }
  }

  /** One-time: the old device-level config lived directly in `lark/*`. Move it into the
   *  `_local` pool; the first account to sign in adopts it. */
  private migrateLegacyRootOnce(): void {
    if (this.legacyMigrated) return;
    this.legacyMigrated = true;
    this.moveConfigFiles(this.larkRoot, this.localDir());
  }

  /** First account on a device inherits the pre-login `_local` connection (device-bounded). */
  private adoptLocalPoolIfEmpty(): void {
    if (this.dir === this.localDir()) return;
    if (existsSync(join(this.dir, 'creds.bin'))) return; // account already connected
    if (!existsSync(join(this.localDir(), 'creds.bin'))) return; // nothing to adopt
    this.moveConfigFiles(this.localDir(), this.dir);
  }

  private credsPath() {
    return join(this.dir, 'creds.bin');
  }
  private basesPath() {
    return join(this.dir, 'bases.json');
  }

  /** True when the OS keychain is available to encrypt the credentials. */
  encryptionAvailable(): boolean {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  }

  // No keychain (rare; some Linux setups) → writeSecret falls back to an obfuscated,
  // clearly-marked blob and the connect UI warns. NOT secure, but it is the only case
  // where a PLAIN: blob is legitimate — see readSecret for why that matters.
  setCreds(creds: LarkCreds): void {
    this.writeSecret(this.credsPath(), creds);
  }

  getCreds(): LarkCreds | null {
    return this.readSecret<LarkCreds>(this.credsPath());
  }

  clearCreds(): void {
    try {
      rmSync(this.credsPath(), { force: true });
    } catch {
      /* ignore */
    }
  }

  // ── Saved-app history (encrypted — each entry holds an app_secret) ───────────
  private appsPath() {
    return join(this.dir, 'apps.bin');
  }

  /** Encrypt+write an arbitrary secret JSON blob (keychain, else marked-plain fallback).
   *  Owner-only permissions: these files hold app secrets and OAuth tokens. */
  private writeSecret(path: string, value: unknown): void {
    const json = JSON.stringify(value);
    const data = this.encryptionAvailable()
      ? safeStorage.encryptString(json)
      : Buffer.concat([Buffer.from('PLAIN:'), Buffer.from(json, 'utf8')]);
    writeFileSync(path, data, { mode: 0o600 });
    // `mode` only applies when the file is CREATED, so re-assert it for existing files.
    try {
      chmodSync(path, 0o600);
    } catch {
      /* best effort (e.g. Windows) */
    }
  }

  private readSecret<T>(path: string): T | null {
    try {
      if (!existsSync(path)) return null;
      const buf = readFileSync(path);
      if (buf.subarray(0, 6).toString('utf8') === 'PLAIN:') {
        const value = JSON.parse(buf.subarray(6).toString('utf8')) as T;
        // A plaintext blob is only legitimate on a machine with NO keychain. When the
        // keychain is available, accepting it unconditionally means anyone who can write
        // this file can downgrade it to plaintext and we would honour that forever —
        // which also defeats any "refuse to store a secret without encryption" rule.
        // Re-encrypt in place instead: the user stays connected, the plaintext is gone.
        if (this.encryptionAvailable()) this.writeSecret(path, value);
        return value;
      }
      if (!this.encryptionAvailable()) return null;
      return JSON.parse(safeStorage.decryptString(buf)) as T;
    } catch {
      return null;
    }
  }

  /** Every remembered app (with secret) — newest-used first. */
  getApps(): StoredApp[] {
    const arr = this.readSecret<StoredApp[]>(this.appsPath());
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((a) => a && typeof a.appId === 'string' && typeof a.appSecret === 'string')
      .sort((a, b) => (b.lastUsedAt || '').localeCompare(a.lastUsedAt || ''));
  }

  getApp(appId: string): StoredApp | null {
    return this.getApps().find((a) => a.appId === appId) ?? null;
  }

  /** Insert or update a remembered app (keyed by appId), keeping prior name if none given. */
  upsertApp(app: StoredApp): void {
    const list = this.getApps().filter((a) => a.appId !== app.appId);
    const prev = this.getApp(app.appId);
    list.push({
      appId: app.appId,
      appSecret: app.appSecret,
      name: app.name ?? prev?.name,
      tenantName: app.tenantName ?? prev?.tenantName,
      lastUsedAt: app.lastUsedAt ?? new Date().toISOString(),
    });
    this.writeSecret(this.appsPath(), list);
  }

  renameApp(appId: string, name: string): void {
    const list = this.getApps().map((a) => (a.appId === appId ? { ...a, name } : a));
    this.writeSecret(this.appsPath(), list);
  }

  removeApp(appId: string): void {
    const list = this.getApps().filter((a) => a.appId !== appId);
    this.writeSecret(this.appsPath(), list);
  }

  // ── Non-secret settings (plain JSON) ────────────────────────────────────────
  private settingsPath() {
    return join(this.dir, 'settings.json');
  }
  /** User preferences for the Lark agent (e.g. auto-approving writes). */
  getSettings(): { autoApprove?: boolean; defaultRunner?: string; defaultModel?: string; apiMode?: boolean; webHost?: string | null; cmsSyncBaseUrl?: string; hostedMode?: boolean;
    /** Nguồn chạy agent Lark: 'cli' (mặc định) | 'api' (khoá riêng) | 'maic' (gói Larkwave). */
    larkRunSource?: 'cli' | 'api' | 'maic' } {
    try {
      const s = JSON.parse(readFileSync(this.settingsPath(), 'utf8'));
      return s && typeof s === 'object' ? s : {};
    } catch {
      return {};
    }
  }
  setSettings(s: { autoApprove?: boolean; defaultRunner?: string; defaultModel?: string; apiMode?: boolean; webHost?: string | null; cmsSyncBaseUrl?: string; hostedMode?: boolean;
    /** Nguồn chạy agent Lark: 'cli' (mặc định) | 'api' (khoá riêng) | 'maic' (gói Larkwave). */
    larkRunSource?: 'cli' | 'api' | 'maic' }): void {
    writeFileSync(this.settingsPath(), JSON.stringify({ ...this.getSettings(), ...s }, null, 2));
  }

  // ── Tuỳ chọn RIÊNG MÁY NÀY (không đi theo bản sao lưu tài khoản như settings.json) ──
  private machinePrefsPath() {
    return join(this.dir, 'machine-prefs.json');
  }
  /** `workflowAuto`: chế độ Tạo workflow tự ghi phần cộng-thêm không hỏi (mặc định BẬT). */
  getMachinePrefs(): { workflowAuto?: boolean; runnerId?: string } {
    try {
      const s = JSON.parse(readFileSync(this.machinePrefsPath(), 'utf8'));
      return s && typeof s === 'object' ? s : {};
    } catch {
      return {};
    }
  }
  setMachinePrefs(p: { workflowAuto?: boolean; runnerId?: string }): void {
    writeFileSync(this.machinePrefsPath(), JSON.stringify({ ...this.getMachinePrefs(), ...p }, null, 2));
  }

  getBases(): LarkBaseRef[] {
    try {
      const arr = JSON.parse(readFileSync(this.basesPath(), 'utf8'));
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  setBases(bases: LarkBaseRef[]): void {
    writeFileSync(this.basesPath(), JSON.stringify(bases, null, 2));
  }

  // ── Tự động hoá (Larkwave) rules — not secret (references app_tokens like bases). ──
  private automationsPath() {
    return join(this.dir, 'automations.json');
  }
  getAutomations(): StoredAutomation[] {
    try {
      const arr = JSON.parse(readFileSync(this.automationsPath(), 'utf8'));
      return Array.isArray(arr) ? (arr as StoredAutomation[]) : [];
    } catch {
      return [];
    }
  }
  setAutomations(list: StoredAutomation[]): void {
    writeFileSync(this.automationsPath(), JSON.stringify(list, null, 2));
  }

  // Bot config holds secrets (encrypt key + verification token) → encrypt like creds.
  private botPath() {
    return join(this.dir, 'bot.bin');
  }

  getBotConfig(): LarkBotConfig | null {
    return this.readSecret<LarkBotConfig>(this.botPath());
  }

  setBotConfig(cfg: LarkBotConfig): void {
    this.writeSecret(this.botPath(), cfg);
  }

  // ── Personal-account OAuth session (user_access_token) — secret, encrypted ──
  private userAuthPath() {
    return join(this.dir, 'user.bin');
  }

  getUserAuth(): StoredUserAuth | null {
    return this.readSecret<StoredUserAuth>(this.userAuthPath());
  }

  setUserAuth(auth: StoredUserAuth): void {
    this.writeSecret(this.userAuthPath(), auth);
  }

  clearUserAuth(): void {
    try {
      rmSync(this.userAuthPath(), { force: true });
    } catch {
      /* ignore */
    }
  }
}
