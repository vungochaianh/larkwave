import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CategoryDto {
  id: string;
  name: string;
  color: string;
  channelIds: string[];
  channels: { id: string; name: string }[];
}

/**
 * Content categories (danh mục), shared across video/picture/blog. Each maps to 0+ TelegramChannels;
 * picking a category on a piece of content routes its delivery to those channels.
 */
@Injectable()
export class CategoryService {
  constructor(private readonly prisma: PrismaService) {}

  private toDto(c: { id: string; name: string; color: string; channels: { id: string; name: string }[] }): CategoryDto {
    return { id: c.id, name: c.name, color: c.color, channelIds: c.channels.map((ch) => ch.id), channels: c.channels };
  }

  async list(userId: string): Promise<CategoryDto[]> {
    const rows = await this.prisma.category.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      include: { channels: { select: { id: true, name: true }, orderBy: { createdAt: 'asc' } } },
    });
    return rows.map((c) => this.toDto(c));
  }

  /** Keep only channel ids that actually belong to this user (prevents attaching someone else's channel). */
  private async ownChannelIds(userId: string, ids: string[] | undefined): Promise<string[]> {
    if (!ids || !ids.length) return [];
    const rows = await this.prisma.telegramChannel.findMany({ where: { userId, id: { in: ids } }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  async create(userId: string, input: { name: string; color?: string; channelIds?: string[] }): Promise<CategoryDto> {
    const name = (input.name || '').trim();
    if (name.length < 1) throw new BadRequestException('Thiếu tên danh mục.');
    const channelIds = await this.ownChannelIds(userId, input.channelIds);
    const c = await this.prisma.category.create({
      data: {
        userId,
        name: name.slice(0, 80),
        color: (input.color || '').trim().slice(0, 20),
        channels: { connect: channelIds.map((id) => ({ id })) },
      },
      include: { channels: { select: { id: true, name: true }, orderBy: { createdAt: 'asc' } } },
    });
    return this.toDto(c);
  }

  async update(userId: string, id: string, input: { name?: string; color?: string; channelIds?: string[] }): Promise<CategoryDto> {
    const cur = await this.prisma.category.findFirst({ where: { id, userId }, select: { id: true } });
    if (!cur) throw new NotFoundException('Không tìm thấy danh mục.');
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name.trim().slice(0, 80) || undefined;
    if (input.color !== undefined) data.color = (input.color || '').trim().slice(0, 20);
    if (input.channelIds !== undefined) {
      const channelIds = await this.ownChannelIds(userId, input.channelIds);
      data.channels = { set: channelIds.map((cid) => ({ id: cid })) };
    }
    const c = await this.prisma.category.update({
      where: { id },
      data,
      include: { channels: { select: { id: true, name: true }, orderBy: { createdAt: 'asc' } } },
    });
    return this.toDto(c);
  }

  async remove(userId: string, id: string): Promise<{ ok: true }> {
    await this.prisma.category.deleteMany({ where: { id, userId } });
    return { ok: true };
  }

  /** Channel ids attached to a category (owned by the user); [] if category missing/none. */
  async channelIdsFor(userId: string, categoryId: string | null | undefined): Promise<string[]> {
    if (!categoryId) return [];
    const c = await this.prisma.category.findFirst({
      where: { id: categoryId, userId },
      include: { channels: { select: { id: true } } },
    });
    return c ? c.channels.map((ch) => ch.id) : [];
  }
}
