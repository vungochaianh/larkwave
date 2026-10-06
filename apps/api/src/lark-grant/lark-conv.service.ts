import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';

/**
 * Hội thoại DÙNG CHUNG của Lark Agents: chủ và người được chia sẻ cùng đọc, cùng viết, cùng thấy
 * kết quả agent trong một luồng.
 *
 * Trước đây chia sẻ chỉ là "hỏi một câu → máy của chủ chạy → trả kết quả" (`LarkGrantTurn`). Đủ để
 * nhờ vả, không đủ để làm chung: hai người không nhìn thấy nhau nói gì, và không ai biết bên kia
 * có đang chạy hay không.
 *
 * Ba thứ file này thêm vào, và chỉ ba thứ đó:
 *   1. Luồng chung có thứ tự ỔN ĐỊNH (`seq`, không phải `createdAt`).
 *   2. Tin nhắn người-nói-người, không chỉ lệnh cho agent.
 *   3. Khoá lượt: mỗi hội thoại chỉ một lượt agent chạy tại một thời điểm.
 *
 * Bất biến KHÔNG đổi: máy chủ không chạy gì cả, và không giữ khoá Lark nào. Mọi lượt agent vẫn do
 * máy của CHỦ thực thi qua `LarkGrantTurn`, với đúng chính sách của grant (Base nào đọc/ghi được,
 * hạn mức bao nhiêu). Đừng thêm đường nào ở đây cho phép chạy mà không đi qua grant.
 */

export interface ConvItemDto {
  id: string;
  seq: number;
  authorId: string;
  authorName: string;
  role: string;
  text: string;
  turnId: string | null;
  createdAt: string;
}

@Injectable()
export class LarkConvService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  /** Hội thoại + vai của người gọi. Không có quyền ⇒ 404, không phải 403: xác nhận nó tồn tại
   *  cũng là rò rỉ (dò được ai đang làm việc với ai). */
  private async access(userId: string, convId: string) {
    const conv = await this.prisma.larkSharedConv.findFirst({
      where: { id: convId, grant: { OR: [{ ownerId: userId }, { granteeId: userId }] } },
      include: { grant: { select: { id: true, ownerId: true, granteeId: true, status: true, expiresAt: true } } },
    });
    if (!conv) throw new NotFoundException('Không tìm thấy hội thoại');
    return { conv, isOwner: conv.grant.ownerId === userId };
  }

  /** Mọi hội thoại người này thấy được — của grant mình là chủ, và grant được chia sẻ cho mình. */
  async list(userId: string) {
    const rows = await this.prisma.larkSharedConv.findMany({
      where: { grant: { OR: [{ ownerId: userId }, { granteeId: userId }] } },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: {
        grant: { select: { id: true, label: true, ownerId: true, granteeId: true, status: true } },
        _count: { select: { items: true } },
      },
    });
    // Lượt đang chạy = khoá. Tính một lần cho cả danh sách thay vì N truy vấn.
    const running = await this.prisma.larkGrantTurn.findMany({
      where: { convId: { in: rows.map((r) => r.id) }, status: { in: ['queued', 'running'] } },
      select: { convId: true, actorId: true, status: true },
    });
    const busy = new Map(running.map((t) => [t.convId!, t]));
    return rows.map((r) => ({
      id: r.id,
      grantId: r.grantId,
      grantLabel: r.grant.label,
      title: r.title,
      itemCount: r._count.items,
      isOwner: r.grant.ownerId === userId,
      updatedAt: r.updatedAt.toISOString(),
      running: busy.get(r.id) ? { actorId: busy.get(r.id)!.actorId, status: busy.get(r.id)!.status } : null,
    }));
  }

  async create(userId: string, grantId: string, title: string) {
    const g = await this.prisma.larkGrant.findFirst({
      where: { id: grantId, OR: [{ ownerId: userId }, { granteeId: userId }] },
      select: { id: true, status: true },
    });
    if (!g) throw new NotFoundException('Không tìm thấy quyền chia sẻ');
    if (g.status !== 'active') throw new ForbiddenException('Quyền đang bị tạm dừng hoặc đã thu hồi');
    return this.prisma.larkSharedConv.create({
      data: { grantId, createdById: userId, title: String(title || '').slice(0, 120) || 'Hội thoại chung' },
      select: { id: true, title: true },
    });
  }

  /** Các dòng SAU `afterSeq`. Dùng con trỏ `seq` chứ không phải thời gian: đồng hồ hai máy lệch
   *  nhau vài giây là đủ để một tin nhắn biến mất khỏi lượt tải của người kia. */
  async items(userId: string, convId: string, afterSeq = 0): Promise<ConvItemDto[]> {
    await this.access(userId, convId);
    const rows = await this.prisma.larkConvItem.findMany({
      where: { convId, seq: { gt: afterSeq } },
      orderBy: { seq: 'asc' },
      take: 500,
    });
    return rows.map((r) => ({
      id: r.id,
      seq: r.seq,
      authorId: r.authorId,
      authorName: r.authorName,
      role: r.role,
      text: r.text,
      turnId: r.turnId,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * Thêm một dòng, cấp `seq` kế tiếp.
   *
   * Hai người gửi CÙNG LÚC thì cả hai đọc cùng một `max(seq)` và cùng ghi `seq+1` — `@@unique`
   * chặn, người thua thử lại. Không có ràng buộc đó thì hai dòng cùng số thứ tự, và hai máy sắp
   * xếp khác nhau: một cuộc trò chuyện mà mỗi người đọc một thứ tự còn tệ hơn không dùng chung.
   */
  private async append(
    convId: string,
    data: { authorId: string; authorName: string; role: string; text: string; turnId?: string | null },
  ) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const last = await this.prisma.larkConvItem.findFirst({
        where: { convId },
        orderBy: { seq: 'desc' },
        select: { seq: true },
      });
      try {
        const item = await this.prisma.larkConvItem.create({
          data: { convId, seq: (last?.seq ?? 0) + 1, ...data, text: data.text.slice(0, 200_000) },
        });
        await this.prisma.larkSharedConv.update({ where: { id: convId }, data: { updatedAt: new Date() } });
        return item;
      } catch (e) {
        // P2002 = đụng `@@unique([convId, seq])` ⇒ có người vừa chèn, đọc lại rồi thử tiếp.
        if ((e as { code?: string })?.code !== 'P2002') throw e;
      }
    }
    throw new BadRequestException('Hội thoại đang quá bận, thử lại sau giây lát.');
  }

  /** Hội thoại này có lượt agent nào đang chạy không — đây chính là khoá lượt. */
  private async activeTurn(convId: string) {
    return this.prisma.larkGrantTurn.findFirst({
      where: { convId, status: { in: ['queued', 'running'] } },
      select: { id: true, actorId: true, status: true },
    });
  }

  /**
   * Gửi một dòng vào hội thoại. `run=true` ⇒ đồng thời nhờ máy của CHỦ chạy một lượt agent.
   *
   * Khoá lượt là trạng thái SUY RA (có lượt queued/running hay không), không phải một cột riêng.
   * Cột riêng sẽ kẹt vĩnh viễn khi một tiến trình chết giữa chừng, và lúc đó hội thoại thành đá.
   */
  /**
   * Tên hiển thị của người viết. Tra từ `User.name`, KHÔNG lấy phần trước @ của email: email là
   * thông tin của họ, và hội thoại này người khác đọc được.
   */
  private async displayName(userId: string): Promise<string> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    return u?.name?.trim() || 'Người dùng';
  }

  async post(
    userId: string,
    convId: string,
    body: { text?: string; run?: boolean },
    submitTurn: (actorId: string, grantId: string, prompt: string) => Promise<{ id: string }>,
  ) {
    const text = String(body?.text || '').trim();
    if (!text) throw new BadRequestException('Nội dung trống');
    const { conv } = await this.access(userId, convId);
    const userName = await this.displayName(userId);

    if (!body?.run) {
      // Tin nhắn người-nói-người: KHÔNG bị khoá lượt chặn. Chặn cả lời nhắn trong lúc agent chạy
      // là làm hỏng đúng việc hai người cần nhất — nói với nhau về cái đang chạy.
      const item = await this.append(convId, { authorId: userId, authorName: userName, role: 'user', text });
      this.notify(conv.grant.ownerId, conv.grant.granteeId, userId, convId);
      return { seq: item.seq, turnId: null };
    }

    const active = await this.activeTurn(convId);
    if (active) {
      throw new ForbiddenException(
        active.actorId === userId
          ? 'Lượt trước của bạn chưa chạy xong.'
          : 'Người khác đang chạy một lượt trong hội thoại này — chờ xong rồi gửi.',
      );
    }
    // CẢ HAI bên đi cùng một đường: `submitTurn` → máy của chủ thực thi theo phạm vi của grant.
    // Chủ được miễn hạn mức (xem submitTurn) nhưng KHÔNG có lối tắt riêng — một đường thực thi
    // duy nhất thì chỉ có một chỗ phải rà soát về sau.
    const turn = await submitTurn(userId, conv.grantId, text);
    await this.prisma.larkGrantTurn.update({ where: { id: turn.id }, data: { convId } });
    const item = await this.append(convId, {
      authorId: userId,
      authorName: userName,
      role: 'user',
      text,
      turnId: turn.id,
    });
    this.notify(conv.grant.ownerId, conv.grant.granteeId, userId, convId);
    return { seq: item.seq, turnId: turn.id };
  }

  /**
   * Ghi kết quả một lượt vào luồng. Gọi từ `reportTurn` khi lượt kết thúc.
   *
   * Idempotent theo `turnId`: máy của chủ có thể báo lại cùng một lượt (mất mạng rồi thử lại), và
   * hai dòng kết quả giống hệt nhau trong hội thoại trông như agent trả lời hai lần.
   */
  async appendTurnResult(turnId: string, convId: string, text: string, ok: boolean) {
    const existing = await this.prisma.larkConvItem.findFirst({
      where: { convId, turnId, role: { in: ['agent', 'system'] } },
      select: { id: true },
    });
    if (existing) return;
    await this.append(convId, {
      authorId: 'agent',
      authorName: 'Trợ lý',
      role: ok ? 'agent' : 'system',
      text,
      turnId,
    });
    const conv = await this.prisma.larkSharedConv.findUnique({
      where: { id: convId },
      include: { grant: { select: { ownerId: true, granteeId: true } } },
    });
    if (conv) this.notify(conv.grant.ownerId, conv.grant.granteeId, 'agent', convId);
  }

  /** Đánh thức MỌI người trong hội thoại trừ người vừa gửi — họ đã biết rồi. */
  private notify(ownerId: string, granteeId: string | null, exceptId: string, convId: string) {
    for (const uid of [ownerId, granteeId]) {
      if (!uid || uid === exceptId) continue;
      this.events.publishUser(uid, { type: 'lark.conv.update', convId });
    }
  }
}
