import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.service';
import { decryptJson, encryptJson } from '../common/secret-crypto';
import { TelegramDeliveryService, type TelegramTarget } from './telegram-delivery.service';

interface StoredToken {
  botToken: string;
}

export interface TelegramChannelDto {
  id: string;
  name: string;
  chatId: string | null;
  threadId: string | null;
  hasToken: boolean;
  configured: boolean;
}

/**
 * Multiple per-user Telegram destinations (each = own bot token + chat/channel). Tokens are
 * AES-encrypted at rest and never returned. A Category routes its content to one or more channels.
 * On first use it lazily migrates the legacy single TelegramDeliveryConfig into a "Mặc định" channel.
 */
@Injectable()
export class TelegramChannelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly delivery: TelegramDeliveryService,
  ) {}

  private toDto(c: { id: string; name: string; chatId: string | null; threadId: string | null; botTokenEnc: string | null }): TelegramChannelDto {
    return { id: c.id, name: c.name, chatId: c.chatId, threadId: c.threadId, hasToken: !!c.botTokenEnc, configured: !!c.botTokenEnc && !!c.chatId };
  }

  /** List the user's channels, lazily migrating the legacy single config into a channel on first call. */
  async list(userId: string): Promise<TelegramChannelDto[]> {
    let rows = await this.prisma.telegramChannel.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
    if (rows.length === 0) {
      const legacy = await this.prisma.telegramDeliveryConfig.findUnique({ where: { userId } });
      if (legacy?.botTokenEnc) {
        await this.prisma.telegramChannel.create({
          data: { userId, name: 'Mặc định', botTokenEnc: legacy.botTokenEnc, chatId: legacy.chatId, threadId: legacy.threadId },
        });
        rows = await this.prisma.telegramChannel.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
      }
    }
    return rows.map((c) => this.toDto(c));
  }

  async create(userId: string, input: { name?: string; botToken?: string; chatId?: string | null; threadId?: string | null }): Promise<TelegramChannelDto> {
    const bt = (input.botToken || '').trim();
    const c = await this.prisma.telegramChannel.create({
      data: {
        userId,
        name: (input.name || '').trim().slice(0, 80) || 'Kênh mới',
        botTokenEnc: bt ? encryptJson({ botToken: bt } as StoredToken, this.config.env.JWT_SECRET) : null,
        chatId: (input.chatId || '').trim() || null,
        threadId: (input.threadId || '').trim() || null,
      },
    });
    return this.toDto(c);
  }

  async update(userId: string, id: string, input: { name?: string; botToken?: string; chatId?: string | null; threadId?: string | null }): Promise<TelegramChannelDto> {
    const cur = await this.prisma.telegramChannel.findFirst({ where: { id, userId } });
    if (!cur) throw new NotFoundException('Không tìm thấy kênh.');
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name.trim().slice(0, 80) || cur.name;
    if (input.botToken !== undefined) {
      const bt = input.botToken.trim();
      data.botTokenEnc = bt ? encryptJson({ botToken: bt } as StoredToken, this.config.env.JWT_SECRET) : null;
    }
    if (input.chatId !== undefined) data.chatId = (input.chatId || '').trim() || null;
    if (input.threadId !== undefined) data.threadId = (input.threadId || '').trim() || null;
    const c = await this.prisma.telegramChannel.update({ where: { id }, data });
    return this.toDto(c);
  }

  async remove(userId: string, id: string): Promise<{ ok: true }> {
    await this.prisma.telegramChannel.deleteMany({ where: { id, userId } });
    return { ok: true };
  }

  /** Decrypt channels into ready-to-send targets (only fully-configured ones). */
  async targetsFor(userId: string, channelIds: string[]): Promise<TelegramTarget[]> {
    if (!channelIds.length) return [];
    const rows = await this.prisma.telegramChannel.findMany({ where: { userId, id: { in: channelIds } } });
    const out: TelegramTarget[] = [];
    for (const c of rows) {
      if (!c.botTokenEnc || !c.chatId) continue;
      const dec = decryptJson<StoredToken>(c.botTokenEnc, this.config.env.JWT_SECRET);
      if (dec?.botToken) out.push({ token: dec.botToken, chatId: c.chatId, threadId: c.threadId ?? null });
    }
    return out;
  }

  /** Send a test message to one channel. */
  async test(userId: string, id: string): Promise<{ ok: true }> {
    const targets = await this.targetsFor(userId, [id]);
    if (!targets.length) throw new BadRequestException('Kênh chưa đủ Bot Token + Chat ID.');
    const ok = await this.delivery.testTarget(targets[0]);
    if (!ok) throw new BadRequestException('Gửi thử thất bại — kiểm tra Bot Token, Chat ID và bot đã ở trong chat/nhóm chưa.');
    return { ok: true };
  }
}
