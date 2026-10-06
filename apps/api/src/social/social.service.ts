import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import type { User as PUser } from '@prisma/client';
import type { ChatMessage, Conversation, DiscoverUser, Friend, FriendRequest } from '@larkwave/shared';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { AuthUser } from '../common/auth-user';

type UserSel = Pick<PUser, 'id' | 'name' | 'email' | 'avatarUrl'>;
const USER_SELECT = { id: true, name: true, email: true, avatarUrl: true } as const;

// A shared-project message body is `APP_MSG + JSON`, where APP_MSG wraps a
// private-use char (U+E000) so it never collides with real text. MUST match the
// web encoder (MessengerWidget.tsx) exactly. Previews check this prefix so a
// shared app shows "📎 …" instead of the raw sentinel+JSON fragment.
const APP_MSG = 'tw-app';
const isAppShare = (body: string): boolean => body.startsWith(APP_MSG);
const APP_SHARE_PREVIEW = '📎 Đã chia sẻ một dự án';

@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly notifications: NotificationsService,
  ) {}

  private toFriend(u: UserSel): Friend {
    return { id: u.id, name: u.name, email: u.email, avatarUrl: u.avatarUrl };
  }

  /** Accepted friends of `userId`. */
  async friends(userId: string): Promise<Friend[]> {
    const rows = await this.prisma.friendship.findMany({
      where: { status: 'accepted', OR: [{ requesterId: userId }, { addresseeId: userId }] },
      include: { requester: { select: USER_SELECT }, addressee: { select: USER_SELECT } },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((r) =>
      this.toFriend(r.requesterId === userId ? r.addressee : r.requester),
    );
  }

  /** Pending friend requests (both directions). */
  async requests(userId: string): Promise<FriendRequest[]> {
    const rows = await this.prisma.friendship.findMany({
      where: { status: 'pending', OR: [{ requesterId: userId }, { addresseeId: userId }] },
      include: { requester: { select: USER_SELECT }, addressee: { select: USER_SELECT } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) =>
      r.requesterId === userId
        ? { user: this.toFriend(r.addressee), direction: 'outgoing', createdAt: r.createdAt.toISOString() }
        : { user: this.toFriend(r.requester), direction: 'incoming', createdAt: r.createdAt.toISOString() },
    );
  }

  /** Send a friend request by email. Auto-accepts if a reverse request exists. */
  async sendRequest(userId: string, email: string): Promise<{ status: 'pending' | 'accepted' }> {
    const target = await this.prisma.user.findFirst({
      where: { email: { equals: email.trim(), mode: 'insensitive' } },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Không tìm thấy người dùng với email này');
    return this.requestTo(userId, target.id);
  }

  /** Send a friend request by user id (from the discovery directory). */
  async sendRequestById(userId: string, targetId: string): Promise<{ status: 'pending' | 'accepted' }> {
    const target = await this.prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!target) throw new NotFoundException('Không tìm thấy người dùng');
    return this.requestTo(userId, target.id);
  }

  /** Core create-or-auto-accept of a friendship between two user ids. */
  private async requestTo(userId: string, targetId: string): Promise<{ status: 'pending' | 'accepted' }> {
    if (targetId === userId) throw new BadRequestException('Không thể kết bạn với chính mình');
    const existing = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: userId, addresseeId: targetId },
          { requesterId: targetId, addresseeId: userId },
        ],
      },
    });
    if (existing) {
      if (existing.status === 'accepted') {
        throw new BadRequestException('Hai bạn đã là bạn bè');
      }
      // Reverse pending (they already invited me) → accept it.
      if (existing.addresseeId === userId) {
        await this.prisma.friendship.update({
          where: { id: existing.id },
          data: { status: 'accepted' },
        });
        return { status: 'accepted' };
      }
      throw new BadRequestException('Bạn đã gửi lời mời, đang chờ phản hồi');
    }
    await this.prisma.friendship.create({
      data: { requesterId: userId, addresseeId: targetId, status: 'pending' },
    });
    return { status: 'pending' };
  }

  /** Discover other users (excludes private accounts + self), with friend status. */
  async discover(
    userId: string,
    q: string | undefined,
    page: number,
    pageSize: number,
  ): Promise<{ items: DiscoverUser[]; total: number; page: number; pageSize: number }> {
    const search = q?.trim();
    const where = {
      discoverable: true,
      status: 'active' as const,
      id: { not: userId },
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { email: { equals: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: { id: true, name: true, avatarUrl: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    const ids = rows.map((r) => r.id);
    const fr = ids.length
      ? await this.prisma.friendship.findMany({
          where: {
            OR: [
              { requesterId: userId, addresseeId: { in: ids } },
              { addresseeId: userId, requesterId: { in: ids } },
            ],
          },
        })
      : [];
    const statusFor = (otherId: string): DiscoverUser['friendStatus'] => {
      const f = fr.find(
        (x) =>
          (x.requesterId === userId && x.addresseeId === otherId) ||
          (x.addresseeId === userId && x.requesterId === otherId),
      );
      if (!f) return 'none';
      if (f.status === 'accepted') return 'friends';
      return f.requesterId === userId ? 'pending_out' : 'pending_in';
    };
    return {
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        avatarUrl: r.avatarUrl,
        friendStatus: statusFor(r.id),
      })),
      total,
      page,
      pageSize,
    };
  }

  /** Accept an incoming request from `otherId`. */
  async accept(userId: string, otherId: string): Promise<void> {
    const fr = await this.prisma.friendship.findFirst({
      where: { requesterId: otherId, addresseeId: userId, status: 'pending' },
    });
    if (!fr) throw new NotFoundException('Không tìm thấy lời mời kết bạn');
    await this.prisma.friendship.update({ where: { id: fr.id }, data: { status: 'accepted' } });
  }

  /** Remove a friend OR cancel/reject a pending request (either direction). */
  async remove(userId: string, otherId: string): Promise<void> {
    await this.prisma.friendship.deleteMany({
      where: {
        OR: [
          { requesterId: userId, addresseeId: otherId },
          { requesterId: otherId, addresseeId: userId },
        ],
      },
    });
  }

  private async assertFriends(userId: string, otherId: string): Promise<void> {
    const fr = await this.prisma.friendship.findFirst({
      where: {
        status: 'accepted',
        OR: [
          { requesterId: userId, addresseeId: otherId },
          { requesterId: otherId, addresseeId: userId },
        ],
      },
      select: { id: true },
    });
    if (!fr) throw new ForbiddenException('Hai bạn chưa phải là bạn bè');
  }

  /** The 1:1 thread with `otherId` (marks incoming messages read). */
  async thread(userId: string, otherId: string): Promise<ChatMessage[]> {
    await this.assertFriends(userId, otherId);
    const rows = await this.prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId, recipientId: otherId },
          { senderId: otherId, recipientId: userId },
        ],
      },
      // Lấy 300 tin MỚI NHẤT rồi đảo lại, KHÔNG phải 300 tin cũ nhất.
      // Bản cũ `asc` + take 300 nghĩa là một hội thoại quá 300 tin sẽ ĐÓNG BĂNG vĩnh viễn ở tin
      // thứ 300: người dùng gửi tiếp mà không bao giờ thấy tin mới của mình hiện ra.
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    rows.reverse();
    await this.prisma.message.updateMany({
      where: { senderId: otherId, recipientId: userId, readAt: null },
      data: { readAt: new Date() },
    });
    return rows.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      recipientId: m.recipientId,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      mine: m.senderId === userId,
    }));
  }

  async send(userId: string, otherId: string, body: string): Promise<ChatMessage> {
    await this.assertFriends(userId, otherId);
    const text = body.trim();
    if (!text) throw new BadRequestException('Tin nhắn trống');
    const m = await this.prisma.message.create({
      data: { senderId: userId, recipientId: otherId, body: text.slice(0, 4000) },
    });
    const base = {
      id: m.id,
      senderId: m.senderId,
      recipientId: m.recipientId,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    };
    // Push to BOTH parties' live SSE streams (real-time delivery). `mine` is
    // computed per-viewer. Frontends dedup by message id.
    this.events.publishUser(otherId, { type: 'message', message: { ...base, mine: false } });
    this.events.publishUser(userId, { type: 'message', message: { ...base, mine: true } });
    // Notify the recipient (links straight to this conversation).
    const sender = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    const who = sender?.name || sender?.email || 'Một người bạn';
    const preview = isAppShare(text) ? APP_SHARE_PREVIEW : text.slice(0, 80);
    void this.notifications.notify(otherId, 'message', `${who} đã nhắn tin`, preview, `/friends?chat=${userId}`);
    return { ...base, mine: true };
  }

  /** SSE stream of live chat events for the current user (real-time messaging). */
  streamMessages(user: AuthUser, res: Response): void {
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
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(payload)}\n\n`);
    });
    const cleanup = () => {
      clearInterval(heartbeat);
      unsubscribe();
      if (!res.writableEnded) res.end();
    };
    res.on('close', cleanup);
  }

  /** Conversation summaries (one per friend who has a message), newest first. */
  async conversations(userId: string): Promise<Conversation[]> {
    const friends = await this.friends(userId);
    const convos = await Promise.all(
      friends.map(async (f) => {
        const last = await this.prisma.message.findFirst({
          where: {
            OR: [
              { senderId: userId, recipientId: f.id },
              { senderId: f.id, recipientId: userId },
            ],
          },
          orderBy: { createdAt: 'desc' },
        });
        if (!last) return null;
        const unread = await this.prisma.message.count({
          where: { senderId: f.id, recipientId: userId, readAt: null },
        });
        return {
          friend: f,
          lastMessage: isAppShare(last.body) ? APP_SHARE_PREVIEW : last.body.slice(0, 80),
          lastAt: last.createdAt.toISOString(),
          unread,
        } satisfies Conversation;
      }),
    );
    return convos
      .filter((c): c is Conversation => c !== null)
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.message.count({
      where: { recipientId: userId, readAt: null },
    });
    return { count };
  }
}
