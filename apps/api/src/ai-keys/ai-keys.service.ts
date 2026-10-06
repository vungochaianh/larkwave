import { BadRequestException, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DEFAULT_CONFIG } from '@larkwave/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.service';
import { decryptJson, encryptJson } from '../common/secret-crypto';

export type Provider = 'anthropic' | 'openai' | 'grok';
/** Secondary providers (OpenAI/Grok) — kept for OpenaiService's local typing. */
export type CompatProvider = 'openai' | 'grok';
type KeyStore = Partial<Record<Provider, string>>;

const MANAGED: Provider[] = ['anthropic', 'openai', 'grok'];
/** A submitted key must contain one of these markers — guards against pasting the
 *  wrong thing (e.g. an xAI management token, or an OpenAI admin key) by mistake. */
const KEY_MARKERS: Record<Provider, string[]> = {
  anthropic: ['sk-ant'],
  openai: ['sk-'],
  grok: ['xai-'],
};

/**
 * Resolves + manages the optional secondary-provider API keys (OpenAI, Grok).
 * Keys set from the admin "AI Keys" page are AES-encrypted in Setting.aiKeysEnc;
 * env vars are the fallback. An in-memory cache keeps `keyFor`/`enabled` SYNC
 * (no DB hit on the hot path); it's refreshed on boot + whenever keys are saved.
 * @Global so OpenaiService (engine) and the admin controller share one instance.
 */
@Injectable()
export class AiKeysService implements OnModuleInit {
  private readonly logger = new Logger(AiKeysService.name);
  private cache: KeyStore = {};

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.reload();
  }

  private async reload(): Promise<void> {
    try {
      const row = await this.prisma.setting.findUnique({
        where: { id: 'singleton' },
        select: { aiKeysEnc: true },
      });
      this.cache = decryptJson<KeyStore>(row?.aiKeysEnc, this.config.env.JWT_SECRET) ?? {};
    } catch (e) {
      this.logger.warn(`Ai keys reload failed: ${String(e)}`);
      this.cache = {};
    }
  }

  private envKey(provider: Provider): string {
    if (provider === 'anthropic') return this.config.env.ANTHROPIC_API_KEY;
    if (provider === 'grok') return this.config.env.GROK_API_KEY;
    return this.config.env.OPENAI_API_KEY;
  }

  /** Effective key: admin-set (DB) wins over env. Both trimmed (a stray newline in
   *  an env-pasted key would otherwise corrupt the Authorization header → 401). */
  keyFor(provider: Provider): string {
    return (this.cache[provider] || '').trim() || (this.envKey(provider) || '').trim();
  }

  enabled(provider: Provider): boolean {
    return !!this.keyFor(provider);
  }

  /** Short SHA-256 fingerprint (hashcode) so a key can be identified/verified
   *  without ever revealing it. Same key → same hash. */
  private fingerprint(key: string): string {
    return createHash('sha256').update(key).digest('hex').slice(0, 12);
  }

  /** Save/clear admin keys (encrypted). Pass '' to clear back to the env fallback. */
  async setKeys(partial: Partial<KeyStore>): Promise<void> {
    // Merge against the CURRENT DB state (not the possibly-stale cache) so a failed
    // boot-reload or a concurrent save can't silently drop a previously-saved key.
    const row = await this.prisma.setting.findUnique({
      where: { id: 'singleton' },
      select: { aiKeysEnc: true },
    });
    const current = decryptJson<KeyStore>(row?.aiKeysEnc, this.config.env.JWT_SECRET) ?? {};
    const next: KeyStore = { ...current };
    for (const p of MANAGED) {
      if (partial[p] === undefined) continue;
      const v = (partial[p] ?? '').trim();
      if (!v) {
        delete next[p];
        continue;
      }
      if (!KEY_MARKERS[p].some((m) => v.includes(m))) {
        throw new BadRequestException(
          `Key ${p} không đúng định dạng (cần chứa "${KEY_MARKERS[p][0]}…"). Kiểm tra lại — có thể bạn dán nhầm loại token.`,
        );
      }
      next[p] = v;
    }
    const enc = Object.keys(next).length ? encryptJson(next, this.config.env.JWT_SECRET) : null;
    await this.prisma.setting.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', config: DEFAULT_CONFIG as unknown as object, aiKeysEnc: enc },
      update: { aiKeysEnc: enc },
    });
    this.cache = next;
  }

  private mask(provider: Provider): {
    set: boolean;
    source: 'admin' | 'env' | null;
    last4: string | null;
    hash: string | null;
  } {
    const adminVal = (this.cache[provider] || '').trim();
    const eff = this.keyFor(provider);
    if (!eff) return { set: false, source: null, last4: null, hash: null };
    return { set: true, source: adminVal ? 'admin' : 'env', last4: eff.slice(-4), hash: this.fingerprint(eff) };
  }

  /** Provider + agent-logic status for the admin "AI / Agents" page (NO raw keys). */
  status() {
    return {
      providers: [
        {
          id: 'anthropic',
          label: 'Anthropic Claude',
          enabled: this.enabled('anthropic'),
          role: 'Codegen chính + auto-router (Opus / Sonnet / Haiku)',
        },
        { id: 'openai', label: 'OpenAI GPT', enabled: this.enabled('openai'), role: 'Failover cho router/aux' },
        { id: 'grok', label: 'xAI Grok', enabled: this.enabled('grok'), role: 'Failover cho router/aux' },
      ],
      keys: {
        anthropic: this.mask('anthropic'),
        openai: this.mask('openai'),
        grok: this.mask('grok'),
      },
      defaultTier: 'Tự động (Haiku ⇄ Sonnet)',
      auxModel: 'claude-haiku-4-5',
      autoRouter: true,
    };
  }
}
