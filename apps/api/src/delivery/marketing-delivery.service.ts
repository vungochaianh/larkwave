import { Injectable, Logger } from '@nestjs/common';
import { CategoryService } from '../category/category.service';
import { TelegramChannelService } from './telegram-channel.service';
import { TelegramDeliveryService, type TelegramTarget } from './telegram-delivery.service';

export type DeliverKind = 'video' | 'picture' | 'blog';

export interface DeliverItem {
  title?: string;
  caption?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  imageUrls?: string[];
  coverUrl?: string;
  body?: string;
}

export interface DeliverResult {
  sent: number;
  errors: string[];
}

/**
 * Routes a finished Marketing item to Telegram. If the item has a Category, it delivers to EACH of
 * that category's channels (each its own bot). Otherwise it falls back to the user's legacy single
 * TelegramDeliveryConfig (honouring an explicit chatId override, e.g. from a schedule). Shared by the
 * manual-create paths (auto-send on finish) and the scheduler.
 */
@Injectable()
export class MarketingDeliveryService {
  private readonly log = new Logger(MarketingDeliveryService.name);
  constructor(
    private readonly category: CategoryService,
    private readonly channels: TelegramChannelService,
    private readonly delivery: TelegramDeliveryService,
  ) {}

  private caption(item: DeliverItem): string {
    return (item.caption || '').trim() || (item.title || '').trim();
  }

  /** Blog body for Telegram text: drop inline image markdown (images aren't sent inline). */
  private blogText(item: DeliverItem): string {
    const body = (item.body || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\n{3,}/g, '\n\n').trim();
    return `${item.title || ''}\n\n${this.caption(item)}\n\n${body}`.slice(0, 4000);
  }

  async deliver(userId: string, categoryId: string | null | undefined, kind: DeliverKind, item: DeliverItem, opts: { legacyChatId?: string | null } = {}): Promise<DeliverResult> {
    const channelIds = await this.category.channelIdsFor(userId, categoryId);
    const targets = await this.channels.targetsFor(userId, channelIds);
    if (targets.length) {
      let sent = 0;
      const errors: string[] = [];
      for (const tg of targets) {
        const err = await this.sendOne(tg, kind, item);
        if (err) errors.push(err);
        else sent++;
      }
      return { sent, errors };
    }
    // No category channels → legacy single config (if any).
    if (await this.delivery.isReady(userId)) {
      const err = await this.sendLegacy(userId, kind, item, opts.legacyChatId ?? undefined);
      return err ? { sent: 0, errors: [err] } : { sent: 1, errors: [] };
    }
    return { sent: 0, errors: ['no-telegram'] };
  }

  private async sendOne(tg: TelegramTarget, kind: DeliverKind, item: DeliverItem): Promise<string | null> {
    const caption = this.caption(item);
    try {
      if (kind === 'picture') {
        const imgs = (item.imageUrls && item.imageUrls.length ? item.imageUrls : [item.imageUrl || '']).filter(Boolean);
        const ok = imgs.length > 1 ? await this.delivery.sendMediaGroupTo(tg, imgs, { caption }) : await this.delivery.sendPhotoTo(tg, imgs[0] || '', { caption });
        return ok ? null : 'Gửi ảnh Telegram thất bại.';
      }
      if (kind === 'blog') {
        if (item.coverUrl) await this.delivery.sendPhotoTo(tg, item.coverUrl, { caption: item.title || caption });
        const ok = await this.delivery.sendMessageTo(tg, this.blogText(item), { html: false });
        return ok ? null : 'Gửi bài viết Telegram thất bại.';
      }
      if (item.thumbnailUrl) await this.delivery.sendPhotoTo(tg, item.thumbnailUrl, {});
      const ok = await this.delivery.sendVideoTo(tg, item.videoUrl || '', { caption });
      return ok ? null : 'Gửi video Telegram thất bại.';
    } catch (e) {
      return (e as Error).message?.slice(0, 200) || 'Gửi Telegram thất bại.';
    }
  }

  private async sendLegacy(userId: string, kind: DeliverKind, item: DeliverItem, chatId?: string): Promise<string | null> {
    const caption = this.caption(item);
    try {
      if (kind === 'picture') {
        const imgs = (item.imageUrls && item.imageUrls.length ? item.imageUrls : [item.imageUrl || '']).filter(Boolean);
        const ok = imgs.length > 1 ? await this.delivery.sendMediaGroup(userId, imgs, { caption, chatId }) : await this.delivery.sendPhoto(userId, imgs[0] || '', { caption, chatId });
        return ok ? null : 'Gửi ảnh Telegram thất bại.';
      }
      if (kind === 'blog') {
        if (item.coverUrl) await this.delivery.sendPhoto(userId, item.coverUrl, { caption: item.title || caption, chatId });
        const ok = await this.delivery.sendMessage(userId, this.blogText(item), { chatId, html: false });
        return ok ? null : 'Gửi bài viết Telegram thất bại.';
      }
      if (item.thumbnailUrl) await this.delivery.sendPhoto(userId, item.thumbnailUrl, { chatId });
      const ok = await this.delivery.sendVideo(userId, item.videoUrl || '', { caption, chatId });
      return ok ? null : 'Gửi video Telegram thất bại.';
    } catch (e) {
      return (e as Error).message?.slice(0, 200) || 'Gửi Telegram thất bại.';
    }
  }
}
