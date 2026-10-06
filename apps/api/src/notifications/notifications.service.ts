import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import type { Notification as PNotification } from '@prisma/client';
import type {
  AppNotification,
  NotificationsResponse,
  NotificationType,
} from '@larkwave/shared';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import type { AuthUser } from '../common/auth-user';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  private toDto(n: PNotification): AppNotification {
    return {
      id: n.id,
      type: (n.type as NotificationType) ?? 'system',
      title: n.title,
      body: n.body ?? null,
      link: n.link ?? null,
      read: !!n.read,
      createdAt: n.createdAt.toISOString(),
    };
  }

  /**
   * Create + push a notification to the user's live SSE stream. Best-effort:
   * a failure here must never break the action that triggered it (chat/build/etc.).
   */
  async notify(
    userId: string,
    type: NotificationType,
    title: string,
    body?: string | null,
    link?: string | null,
  ): Promise<void> {
    try {
      const n = await this.prisma.notification.create({
        data: {
          userId,
          type,
          title: title.slice(0, 200),
          body: body ? body.slice(0, 1000) : null,
          link: link ?? null,
        },
      });
      this.events.publishUser(userId, { type: 'notification', notification: this.toDto(n) });
    } catch {
      /* notifications are non-critical */
    }
  }

  async list(userId: string, limit = 50): Promise<NotificationsResponse> {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId, read: false } }),
    ]);
    return { items: items.map((n) => this.toDto(n)), unread };
  }

  async unreadCount(userId: string): Promise<{ unread: number }> {
    const unread = await this.prisma.notification.count({ where: { userId, read: false } });
    return { unread };
  }

  async markRead(userId: string, id: string): Promise<{ ok: true }> {
    await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { read: true },
    });
    return { ok: true };
  }

  async markAllRead(userId: string): Promise<{ ok: true }> {
    await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return { ok: true };
  }

  /** SSE stream — forwards this user's notification events (mirrors messages stream). */
  stream(user: AuthUser, res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    res.write(': connected\n\n');

    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': ping\n\n');
    }, 15000);
    const unsubscribe = this.events.subscribeUser(user.id, (payload) => {
      if ((payload as { type?: string })?.type !== 'notification') return;
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(payload)}\n\n`);
    });
    const cleanup = () => {
      clearInterval(heartbeat);
      unsubscribe();
      if (!res.writableEnded) res.end();
    };
    res.on('close', cleanup);
  }
}
