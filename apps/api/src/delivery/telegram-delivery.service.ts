import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.service';
import { decryptJson, encryptJson } from '../common/secret-crypto';

interface StoredToken {
  botToken: string;
}

export interface TelegramDeliveryStatus {
  configured: boolean;
  hasToken: boolean;
  chatId: string | null;
  threadId: string | null;
}

interface SendOpts {
  caption?: string;
  chatId?: string | null;
  threadId?: string | null;
  html?: boolean;
}

/** An explicit delivery destination (one specific bot + chat) — used for per-Category channels. */
export interface TelegramTarget {
  token: string;
  chatId: string;
  threadId?: string | null;
}

/**
 * Per-user Telegram delivery via the USER'S OWN bot (token AES-encrypted at rest). Shared by the
 * Marketing tools (Make Video / Picture / Blog) to push generated content to the user's chat.
 * Distinct from the platform bot in agent/telegram.service.ts (Lark/agent features).
 */
@Injectable()
export class TelegramDeliveryService {
  private readonly log = new Logger(TelegramDeliveryService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  /** Non-secret status for the settings UI (never returns the raw token). */
  async getStatus(userId: string): Promise<TelegramDeliveryStatus> {
    const c = await this.prisma.telegramDeliveryConfig.findUnique({ where: { userId } });
    const hasToken = !!c?.botTokenEnc;
    return { configured: hasToken && !!c?.chatId, hasToken, chatId: c?.chatId ?? null, threadId: c?.threadId ?? null };
  }

  /** Upsert the config. botToken: undefined = keep, '' = clear, else set (encrypted). */
  async setConfig(
    userId: string,
    input: { botToken?: string; chatId?: string | null; threadId?: string | null },
  ): Promise<TelegramDeliveryStatus> {
    const data: Record<string, unknown> = {};
    if (input.botToken !== undefined) {
      const bt = input.botToken.trim();
      data.botTokenEnc = bt ? encryptJson({ botToken: bt } as StoredToken, this.config.env.JWT_SECRET) : null;
    }
    if (input.chatId !== undefined) data.chatId = (input.chatId || '').trim() || null;
    if (input.threadId !== undefined) data.threadId = (input.threadId || '').trim() || null;
    await this.prisma.telegramDeliveryConfig.upsert({
      where: { userId },
      create: {
        userId,
        botTokenEnc: (data.botTokenEnc as string | null) ?? null,
        chatId: (data.chatId as string | null) ?? null,
        threadId: (data.threadId as string | null) ?? null,
      },
      update: data,
    });
    return this.getStatus(userId);
  }

  /** Whether the user can receive deliveries (token + chat set). */
  async isReady(userId: string): Promise<boolean> {
    const c = await this.prisma.telegramDeliveryConfig.findUnique({ where: { userId } });
    return !!c?.botTokenEnc && !!c?.chatId;
  }

  private async resolve(userId: string): Promise<{ token: string; chatId: string; threadId: string | null } | null> {
    const c = await this.prisma.telegramDeliveryConfig.findUnique({ where: { userId } });
    if (!c?.botTokenEnc || !c.chatId) return null;
    const dec = decryptJson<StoredToken>(c.botTokenEnc, this.config.env.JWT_SECRET);
    if (!dec?.botToken) return null;
    return { token: dec.botToken, chatId: c.chatId, threadId: c.threadId ?? null };
  }

  private async call(token: string, method: string, body: Record<string, unknown>): Promise<boolean> {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
      if (!json?.ok) {
        this.log.warn(`telegram ${method} failed: ${json?.description ?? res.status}`);
        return false;
      }
      return true;
    } catch (e) {
      this.log.warn(`telegram ${method} error: ${(e as Error).message}`);
      return false;
    }
  }

  private buildBody(chatId: string, threadId: string | null, extra: Record<string, unknown>): Record<string, unknown> {
    const body: Record<string, unknown> = { chat_id: chatId, ...extra };
    if (threadId && threadId.trim()) body.message_thread_id = threadId;
    return body;
  }

  async sendMessage(userId: string, text: string, opts: SendOpts = {}): Promise<boolean> {
    const r = await this.resolve(userId);
    if (!r) return false;
    const chatId = (opts.chatId || r.chatId).trim();
    const body = this.buildBody(chatId, opts.threadId ?? r.threadId, {
      text: text.slice(0, 4000),
      disable_web_page_preview: true,
      ...(opts.html !== false ? { parse_mode: 'HTML' } : {}),
    });
    return this.call(r.token, 'sendMessage', body);
  }

  async sendPhoto(userId: string, photoUrl: string, opts: SendOpts = {}): Promise<boolean> {
    const r = await this.resolve(userId);
    if (!r) return false;
    const chatId = (opts.chatId || r.chatId).trim();
    const body = this.buildBody(chatId, opts.threadId ?? r.threadId, {
      photo: photoUrl,
      ...(opts.caption ? { caption: opts.caption.slice(0, 1000) } : {}),
    });
    return this.call(r.token, 'sendPhoto', body);
  }

  /** Send 2–10 images as a single album (carousel). Caption sits on the first item. */
  async sendMediaGroup(userId: string, photoUrls: string[], opts: SendOpts = {}): Promise<boolean> {
    const urls = photoUrls.filter(Boolean).slice(0, 10);
    if (urls.length <= 1) return this.sendPhoto(userId, urls[0] || '', opts);
    const r = await this.resolve(userId);
    if (!r) return false;
    const chatId = (opts.chatId || r.chatId).trim();
    const cap = opts.caption ? opts.caption.slice(0, 1000) : '';
    const media = urls.map((u, i) => ({ type: 'photo', media: u, ...(i === 0 && cap ? { caption: cap } : {}) }));
    return this.call(r.token, 'sendMediaGroup', this.buildBody(chatId, opts.threadId ?? r.threadId, { media }));
  }

  async sendVideo(userId: string, videoUrl: string, opts: SendOpts = {}): Promise<boolean> {
    const r = await this.resolve(userId);
    if (!r) return false;
    const chatId = (opts.chatId || r.chatId).trim();
    const body = this.buildBody(chatId, opts.threadId ?? r.threadId, {
      video: videoUrl,
      supports_streaming: true,
      ...(opts.caption ? { caption: opts.caption.slice(0, 1000) } : {}),
    });
    return this.call(r.token, 'sendVideo', body);
  }

  // ── Explicit-target sends (one specific channel's bot+chat) — used by MarketingDeliveryService ──
  async sendMessageTo(tg: TelegramTarget, text: string, opts: { html?: boolean } = {}): Promise<boolean> {
    if (!tg.token || !tg.chatId) return false;
    return this.call(tg.token, 'sendMessage', this.buildBody(tg.chatId, tg.threadId ?? null, {
      text: text.slice(0, 4000),
      disable_web_page_preview: true,
      ...(opts.html !== false ? { parse_mode: 'HTML' } : {}),
    }));
  }
  async sendPhotoTo(tg: TelegramTarget, photoUrl: string, opts: { caption?: string } = {}): Promise<boolean> {
    if (!tg.token || !tg.chatId || !photoUrl) return false;
    return this.call(tg.token, 'sendPhoto', this.buildBody(tg.chatId, tg.threadId ?? null, {
      photo: photoUrl,
      ...(opts.caption ? { caption: opts.caption.slice(0, 1000) } : {}),
    }));
  }
  async sendVideoTo(tg: TelegramTarget, videoUrl: string, opts: { caption?: string } = {}): Promise<boolean> {
    if (!tg.token || !tg.chatId || !videoUrl) return false;
    return this.call(tg.token, 'sendVideo', this.buildBody(tg.chatId, tg.threadId ?? null, {
      video: videoUrl,
      supports_streaming: true,
      ...(opts.caption ? { caption: opts.caption.slice(0, 1000) } : {}),
    }));
  }
  async sendMediaGroupTo(tg: TelegramTarget, photoUrls: string[], opts: { caption?: string } = {}): Promise<boolean> {
    const urls = photoUrls.filter(Boolean).slice(0, 10);
    if (!tg.token || !tg.chatId || urls.length === 0) return false;
    if (urls.length === 1) return this.sendPhotoTo(tg, urls[0], opts);
    const cap = opts.caption ? opts.caption.slice(0, 1000) : '';
    const media = urls.map((u, i) => ({ type: 'photo', media: u, ...(i === 0 && cap ? { caption: cap } : {}) }));
    return this.call(tg.token, 'sendMediaGroup', this.buildBody(tg.chatId, tg.threadId ?? null, { media }));
  }

  /** Verify a specific bot token + chat id (used by the channel manager). */
  async testTarget(tg: TelegramTarget): Promise<boolean> {
    if (!tg.token || !tg.chatId) return false;
    return this.call(tg.token, 'sendMessage', this.buildBody(tg.chatId, tg.threadId ?? null, { text: '✅ Larkwave đã kết nối kênh Telegram này thành công.' }));
  }

  /** Send a test message to verify the token + chat id. Throws a helpful error on failure. */
  async test(userId: string): Promise<{ ok: true }> {
    const r = await this.resolve(userId);
    if (!r) throw new BadRequestException('Chưa cấu hình Bot Token + Chat ID.');
    const ok = await this.call(
      r.token,
      'sendMessage',
      this.buildBody(r.chatId, r.threadId, { text: '✅ Larkwave đã kết nối Telegram thành công.' }),
    );
    if (!ok) throw new BadRequestException('Gửi thử thất bại — kiểm tra Bot Token, Chat ID và bot đã ở trong chat/nhóm chưa.');
    return { ok: true };
  }
}
