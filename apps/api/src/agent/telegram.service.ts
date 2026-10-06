import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { DEFAULT_CONFIG, type TelegramAdminStatus } from '@larkwave/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.service';
import { decryptJson, encryptJson } from '../common/secret-crypto';

/**
 * Telegram Bot API client for the remote-run bridge. ONE platform bot is shared
 * across users; a chat is scoped to a user by TelegramBinding.
 *
 * The bot token can be set WITHOUT a redeploy from the admin page: it's AES-encrypted
 * in Setting.telegramEnc (same pattern as AiKeysService), preferred over the env vars
 * (TELEGRAM_BOT_TOKEN / TELEGRAM_BOT_USERNAME / TELEGRAM_WEBHOOK_SECRET). An in-memory
 * cache keeps token/secret lookups SYNC (hot path: verifySecret on every webhook POST);
 * it's refreshed on boot and whenever the token is saved, which also (re)registers the
 * Telegram webhook immediately.
 */
interface TelegramStore {
  botToken?: string;
  botUsername?: string;
  webhookSecret?: string;
}

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly log = new Logger('TelegramService');
  private cache: { botToken: string; botUsername: string; webhookSecret: string; source: 'admin' | 'env' | null } = {
    botToken: '',
    botUsername: '',
    webhookSecret: '',
    source: null,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.reload();
    if (this.isConfigured()) await this.registerWebhook().catch(() => undefined);
  }

  /** Reload the effective config: admin-set (DB, encrypted) wins over env; a stable
   *  webhook secret is generated once if neither provides one. */
  private async reload(): Promise<void> {
    let stored: TelegramStore = {};
    try {
      const row = await this.prisma.setting.findUnique({
        where: { id: 'singleton' },
        select: { telegramEnc: true },
      });
      stored = decryptJson<TelegramStore>(row?.telegramEnc, this.config.env.JWT_SECRET) ?? {};
    } catch (e) {
      this.log.warn(`telegram config reload failed: ${String(e)}`);
    }
    const adminToken = (stored.botToken ?? '').trim();
    const envToken = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
    const botToken = adminToken || envToken;
    const botUsername =
      (stored.botUsername ?? '').trim() || (process.env.TELEGRAM_BOT_USERNAME ?? '').trim();
    const webhookSecret =
      (stored.webhookSecret ?? '').trim() ||
      (process.env.TELEGRAM_WEBHOOK_SECRET ?? '').trim() ||
      this.cache.webhookSecret ||
      randomBytes(24).toString('hex');
    this.cache = {
      botToken,
      botUsername,
      webhookSecret,
      source: adminToken ? 'admin' : botToken ? 'env' : null,
    };
  }

  get token(): string {
    return this.cache.botToken;
  }

  isConfigured(): boolean {
    return !!this.cache.botToken;
  }

  get webhookSecret(): string {
    return this.cache.webhookSecret;
  }

  /** Verify the X-Telegram-Bot-Api-Secret-Token header. There is ALWAYS a secret
   *  (admin / env / generated), so an unauthenticated request is always rejected. */
  verifySecret(headerSecret: string | undefined): boolean {
    return (headerSecret ?? '') === this.cache.webhookSecret;
  }

  private async call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T | null> {
    if (!this.isConfigured()) return null;
    try {
      const res = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
      if (!json?.ok) {
        this.log.warn(`telegram ${method} failed: ${json?.description ?? res.status}`);
        return null;
      }
      return (json.result ?? null) as T | null;
    } catch (e) {
      this.log.warn(`telegram ${method} error: ${(e as Error).message}`);
      return null;
    }
  }

  /** The bot @username (no @), cached. From admin/env config, else fetched via getMe. */
  async botUsername(): Promise<string | null> {
    if (this.cache.botUsername) return this.cache.botUsername;
    const me = await this.call<{ username?: string }>('getMe', {});
    this.cache.botUsername = me?.username ?? '';
    return this.cache.botUsername || null;
  }

  /** Send a message. Defaults to HTML parse mode for our own formatted strings; pass
   *  `{ html: false }` for arbitrary user content (prompts/results) so unescaped
   *  `< > &` don't trip Telegram's entity parser and silently drop the message. */
  async sendMessage(
    chatId: string | number,
    text: string,
    opts: { html?: boolean } = {},
  ): Promise<boolean> {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text: text.slice(0, 4000),
      disable_web_page_preview: true,
    };
    if (opts.html !== false) body.parse_mode = 'HTML';
    const r = await this.call('sendMessage', body);
    return r != null;
  }

  /** Send a video by public URL (Telegram fetches it; ≤20MB for URL sends). Optional caption
   *  and a message-thread (forum topic) id. Returns true on success. */
  async sendVideo(
    chatId: string | number,
    videoUrl: string,
    opts: { caption?: string; threadId?: string | number } = {},
  ): Promise<boolean> {
    const body: Record<string, unknown> = { chat_id: chatId, video: videoUrl, supports_streaming: true };
    if (opts.caption) body.caption = opts.caption.slice(0, 1000);
    if (opts.threadId != null && String(opts.threadId).trim()) body.message_thread_id = opts.threadId;
    const r = await this.call('sendVideo', body);
    return r != null;
  }

  /** Register the webhook URL so Telegram delivers updates to us. Idempotent. */
  async registerWebhook(): Promise<boolean> {
    const base = (this.config.env.PUBLIC_API_URL || 'https://api.toolswave.net/v1').replace(/\/+$/, '');
    const r = await this.call('setWebhook', {
      url: `${base}/agent/telegram/webhook`,
      allowed_updates: ['message'],
      secret_token: this.cache.webhookSecret,
      drop_pending_updates: false,
    });
    if (r != null) this.log.log(`telegram webhook registered → ${base}/agent/telegram/webhook`);
    return r != null;
  }

  /** ADMIN — set/clear the bot token (encrypted at rest). Empty token clears it back
   *  to the env fallback. Re-registers the webhook immediately (no redeploy). */
  async setBot(input: { botToken: string; botUsername?: string }): Promise<TelegramAdminStatus> {
    const botToken = (input.botToken ?? '').trim();
    // Keep the webhook secret stable across token changes (or mint one on first set).
    const webhookSecret =
      this.cache.webhookSecret || (process.env.TELEGRAM_WEBHOOK_SECRET ?? '').trim() || randomBytes(24).toString('hex');
    const store: TelegramStore = botToken
      ? { botToken, botUsername: (input.botUsername ?? '').trim() || undefined, webhookSecret }
      : {};
    const enc = botToken ? encryptJson(store, this.config.env.JWT_SECRET) : null;
    await this.prisma.setting.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', config: DEFAULT_CONFIG as unknown as object, telegramEnc: enc },
      update: { telegramEnc: enc },
    });
    await this.reload();
    // Resolve the username via getMe if not provided, then register the webhook.
    if (this.isConfigured()) {
      if (!this.cache.botUsername) await this.botUsername().catch(() => undefined);
      await this.registerWebhook().catch(() => undefined);
    }
    return this.status();
  }

  /** ADMIN — non-secret status for the admin page (never returns the raw token). */
  status(): TelegramAdminStatus {
    const t = this.cache.botToken;
    return {
      configured: !!t,
      source: this.cache.source,
      botUsername: this.cache.botUsername || null,
      tokenLast4: t ? t.slice(-4) : null,
      webhookUrl: `${(this.config.env.PUBLIC_API_URL || 'https://api.toolswave.net/v1').replace(/\/+$/, '')}/agent/telegram/webhook`,
    };
  }
}
