import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Public web origin the share links point at (matches the deployed website). */
const WEB_BASE = process.env.WEB_PUBLIC_BASE || 'https://toolswave.net';
const shareUrl = (id: string) => `${WEB_BASE}/lark/s/${id}`;

export interface ShareInput {
  /** The desktop's local session id — makes re-sharing update the SAME link. */
  sourceId: string;
  title?: string;
  /** Opaque render payload: { items, runner?, model?, createdAt? }. No secrets/app_tokens. */
  data: unknown;
}

/**
 * Public sharing of a Lark × Agents conversation. The desktop uploads a SANITIZED
 * transcript (the app_secret + Base app_tokens never leave the machine); the website
 * renders it read-only. Re-sharing the same local session upserts one row (stable link).
 */
@Injectable()
export class LarkShareService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, input: ShareInput): Promise<{ id: string; url: string }> {
    const sourceId = (input.sourceId || '').trim();
    if (!sourceId) throw new BadRequestException('Thiếu sourceId của hội thoại.');
    if (JSON.stringify(input.data ?? {}).length > 8 * 1024 * 1024) {
      throw new BadRequestException('Hội thoại quá lớn để chia sẻ (>8MB) — thử bớt ảnh đính kèm.');
    }
    const title = (input.title || '').slice(0, 200);
    const row = await this.prisma.larkShare.upsert({
      where: { userId_sourceId: { userId, sourceId } },
      create: { userId, sourceId, title, data: (input.data ?? {}) as object },
      update: { title, data: (input.data ?? {}) as object },
    });
    return { id: row.id, url: shareUrl(row.id) };
  }

  /** The caller's shared conversations (for a "manage shares" list). `itemCount` = how many
   *  transcript items are CURRENTLY published, so the desktop can flag an out-of-date share. */
  async listMine(
    userId: string,
  ): Promise<{ id: string; sourceId: string; title: string; url: string; views: number; updatedAt: string; itemCount: number }[]> {
    const rows = await this.prisma.larkShare.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } });
    return rows.map((r) => {
      const data = r.data as { items?: unknown[] } | null;
      return {
        id: r.id,
        sourceId: r.sourceId,
        title: r.title,
        url: shareUrl(r.id),
        views: r.views,
        updatedAt: r.updatedAt.toISOString(),
        itemCount: Array.isArray(data?.items) ? data.items.length : 0,
      };
    });
  }

  async remove(userId: string, id: string): Promise<{ ok: true }> {
    await this.prisma.larkShare.deleteMany({ where: { id, userId } });
    return { ok: true };
  }

  /** Public read (no auth) — bumps the view counter. Used by the website page. */
  async getPublic(id: string): Promise<{
    id: string;
    title: string;
    data: unknown;
    author: { name: string; handle: string | null; avatarUrl: string | null } | null;
    views: number;
    createdAt: string;
    updatedAt: string;
  }> {
    const row = await this.prisma.larkShare.findUnique({
      where: { id },
      include: { user: { select: { name: true, handle: true, avatarUrl: true } } },
    });
    if (!row) throw new NotFoundException('Không tìm thấy hội thoại được chia sẻ.');
    // Best-effort view bump — never block the read on it.
    this.prisma.larkShare.update({ where: { id }, data: { views: { increment: 1 } } }).catch(() => undefined);
    return {
      id: row.id,
      title: row.title,
      data: row.data,
      author: row.user ? { name: row.user.name, handle: row.user.handle, avatarUrl: row.user.avatarUrl } : null,
      views: row.views + 1,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
