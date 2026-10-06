import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { LarkConvService } from './lark-conv.service';

export interface CreateGrantInput {
  /** Friend who receives the delegated connection. */
  inviteeUserId: string;
  /** 'lark' (share the Lark connection, base-scoped) or 'agentchat' (share the general
   *  "Trợ lý AI" assistant — no base scope, always read-only). Defaults to 'lark'. */
  kind?: 'lark' | 'agentchat';
  label?: string;
  mode?: 'ask' | 'build';
  /** Days until the grant expires; 0/undefined = no expiry. */
  expiresInDays?: number;
  turnsPerHour?: number;
  turnsPerDay?: number;
  tokenBudgetPct?: number;
  /** Human-readable scope only — never an app_token (the enforcing copy stays on the
   *  owner's machine, so a compromised server cannot widen a grant's reach). */
  scopes?: { baseName: string; tableNames?: string[] }[];
}

const INVITE_TTL_DAYS = 14;

/**
 * Delegated Lark access ("Cổng uỷ quyền"). The server stores WHO may ask the owner's
 * desktop to run a turn, and the audit trail of what was run — never any Lark
 * credential. Revocation is a status change on one row, so cutting off one person
 * never disturbs anyone else (unlike sharing an app secret, which can only be undone
 * by rotating the secret for everybody).
 */
@Injectable()
export class LarkGrantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly convs: LarkConvService,
  ) {}

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

  /** Owner shares their Lark connection with ONE friend. Invitations are rows keyed to
   *  that user — no code, link or deep link is ever produced. */
  async create(ownerId: string, input: CreateGrantInput) {
    if (!input?.inviteeUserId) throw new BadRequestException('Thiếu người nhận');
    if (input.inviteeUserId === ownerId) throw new BadRequestException('Không thể tự chia sẻ cho chính mình');
    await this.assertFriends(ownerId, input.inviteeUserId);

    const days = Number(input.expiresInDays) || 0;
    // An agentchat grant is ALWAYS read-only (the shared assistant can never write on the
    // owner's machine), so 'build' is coerced away regardless of what the client sent.
    const kind = input.kind === 'agentchat' ? 'agentchat' : 'lark';
    const grant = await this.prisma.larkGrant.create({
      data: {
        ownerId,
        kind,
        label: (input.label || '').slice(0, 120),
        mode: kind === 'agentchat' ? 'ask' : input.mode === 'build' ? 'build' : 'ask',
        status: 'pending',
        expiresAt: days > 0 ? new Date(Date.now() + days * 86400_000) : null,
        turnsPerHour: clamp(input.turnsPerHour, 1, 600, 60),
        turnsPerDay: clamp(input.turnsPerDay, 1, 5000, 300),
        tokenBudgetPct: clamp(input.tokenBudgetPct, 1, 100, 5),
        scopes: {
          create: (input.scopes ?? []).slice(0, 50).map((s) => ({
            baseName: (s.baseName || '').slice(0, 200),
            tableNames: (s.tableNames ?? []).slice(0, 200).map((t) => String(t).slice(0, 200)),
          })),
        },
        invites: {
          create: {
            inviteeUserId: input.inviteeUserId,
            expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86400_000),
          },
        },
      },
      include: { scopes: true, invites: true },
    });
    return grant;
  }

  /** Grants the caller OWNS (with grantee + usage), for the "người đang dùng" list. */
  async listMine(ownerId: string) {
    return this.prisma.larkGrant.findMany({
      where: { ownerId, status: { not: 'revoked' } },
      include: {
        scopes: true,
        grantee: { select: { id: true, name: true, email: true, avatarUrl: true } },
        invites: { select: { inviteeUserId: true, usedAt: true, expiresAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Grants shared WITH the caller — plus pending invitations they can claim. */
  async listReceived(userId: string) {
    const [active, invites] = await Promise.all([
      this.prisma.larkGrant.findMany({
        where: { granteeId: userId, status: { in: ['active', 'suspended'] } },
        include: { scopes: true, owner: { select: { id: true, name: true, email: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.larkGrantInvite.findMany({
        where: { inviteeUserId: userId, usedAt: null, expiresAt: { gt: new Date() } },
        include: {
          grant: {
            include: { scopes: true, owner: { select: { id: true, name: true, email: true, avatarUrl: true } } },
          },
        },
      }),
    ]);
    return {
      active,
      pending: invites.filter((i) => i.grant.status === 'pending' || i.grant.status === 'active').map((i) => i.grant),
    };
  }

  /**
   * One click, no secret: the friend's own JWT is the whole proof. The body is empty by
   * design — there is nothing to paste, leak or replay.
   */
  async claim(userId: string, grantId: string) {
    const invite = await this.prisma.larkGrantInvite.findFirst({
      where: { grantId, inviteeUserId: userId },
      include: { grant: true },
    });
    if (!invite) throw new NotFoundException('Lời mời không tồn tại');
    if (invite.usedAt) throw new BadRequestException('Lời mời đã được dùng');
    if (invite.expiresAt.getTime() < Date.now()) throw new BadRequestException('Lời mời đã hết hạn');
    const g = invite.grant;
    if (g.status === 'revoked') throw new ForbiddenException('Quyền đã bị thu hồi');
    // Only a grant still awaiting acceptance may be claimed. Without this a grantee
    // could flip an owner-SUSPENDED grant back to 'active' and override the pause.
    if (g.status !== 'pending') throw new ForbiddenException('Lời mời không còn hiệu lực');
    if (g.expiresAt && g.expiresAt.getTime() < Date.now()) throw new ForbiddenException('Quyền đã hết hạn');
    // The friendship must STILL hold at claim time, not merely when the invite was sent.
    await this.assertFriends(g.ownerId, userId);

    const [, grant] = await this.prisma.$transaction([
      this.prisma.larkGrantInvite.update({ where: { id: invite.id }, data: { usedAt: new Date() } }),
      this.prisma.larkGrant.update({
        where: { id: grantId },
        data: { granteeId: userId, status: 'active' },
        include: { scopes: true, owner: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      }),
    ]);
    return grant;
  }

  private async ownedGrant(ownerId: string, id: string) {
    const g = await this.prisma.larkGrant.findFirst({ where: { id, ownerId }, select: { id: true } });
    if (!g) throw new NotFoundException('Không tìm thấy quyền chia sẻ');
    return g;
  }

  /** Reversible pause — keeps the transcript and the grant, stops execution. */
  async suspend(ownerId: string, id: string, on: boolean) {
    await this.ownedGrant(ownerId, id);
    return this.prisma.larkGrant.update({
      where: { id },
      data: { status: on ? 'suspended' : 'active' },
    });
  }

  /** Per-person revocation. No secret to rotate, so nobody else is affected. */
  async revoke(ownerId: string, id: string) {
    await this.ownedGrant(ownerId, id);
    await this.prisma.larkGrant.update({
      where: { id },
      data: { status: 'revoked', revokedAt: new Date(), granteeId: null },
    });
    return { ok: true as const };
  }

  /** Update scope/limits without re-inviting — takes effect on the next tool call. */
  async update(ownerId: string, id: string, input: Partial<CreateGrantInput>) {
    await this.ownedGrant(ownerId, id);
    if (input.scopes) {
      await this.prisma.larkGrantScopeRef.deleteMany({ where: { grantId: id } });
      await this.prisma.larkGrantScopeRef.createMany({
        data: input.scopes.slice(0, 50).map((s) => ({
          grantId: id,
          baseName: (s.baseName || '').slice(0, 200),
          tableNames: (s.tableNames ?? []).slice(0, 200).map((t) => String(t).slice(0, 200)),
        })),
      });
    }
    return this.prisma.larkGrant.update({
      where: { id },
      data: {
        label: input.label?.slice(0, 120),
        mode: input.mode === 'build' ? 'build' : input.mode === 'ask' ? 'ask' : undefined,
        turnsPerHour: input.turnsPerHour === undefined ? undefined : clamp(input.turnsPerHour, 1, 600, 60),
        turnsPerDay: input.turnsPerDay === undefined ? undefined : clamp(input.turnsPerDay, 1, 5000, 300),
        tokenBudgetPct: input.tokenBudgetPct === undefined ? undefined : clamp(input.tokenBudgetPct, 1, 100, 5),
        expiresAt:
          input.expiresInDays === undefined
            ? undefined
            : Number(input.expiresInDays) > 0
              ? new Date(Date.now() + Number(input.expiresInDays) * 86400_000)
              : null,
      },
      include: { scopes: true },
    });
  }

  /** Per-person access log for the owner. */
  async calls(ownerId: string, id: string, limit = 100) {
    await this.ownedGrant(ownerId, id);
    return this.prisma.larkGrantCall.findMany({
      where: { grantId: id },
      include: { actor: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
    });
  }

  /**
   * A grantee asks the owner's desktop to run a turn. The server validates the grant is
   * still usable and enforces the rate limits, then notifies the owner's device over the
   * SAME agent SSE channel the remote-run relay already uses. It never touches Lark.
   */
  async submitTurn(actorId: string, grantId: string, prompt: string): Promise<SubmitTurnResult> {
    const text = String(prompt || '').trim();
    if (!text) throw new BadRequestException('Nội dung trống');
    // CHỦ cũng gửi được, để hội thoại dùng chung đối xứng: cả hai bên cùng nhờ trợ lý trong một
    // luồng. Máy thực thi vẫn là máy của chủ, và `runGrantTurn` vẫn chạy theo ĐÚNG phạm vi của
    // grant — hẹp hơn quyền thật của chủ, nhưng như vậy hai người làm việc trong cùng một phạm vi
    // và chỉ có MỘT đường thực thi để rà soát.
    const g = await this.prisma.larkGrant.findFirst({
      where: { id: grantId, OR: [{ granteeId: actorId }, { ownerId: actorId }] },
    });
    if (!g) throw new NotFoundException('Không tìm thấy quyền chia sẻ');
    const isOwner = g.ownerId === actorId;
    if (g.status !== 'active') throw new ForbiddenException('Quyền đang bị tạm dừng hoặc đã thu hồi');
    if (g.expiresAt && g.expiresAt.getTime() < Date.now()) throw new ForbiddenException('Quyền đã hết hạn');
    if (!isOwner) {
      // The friendship must still hold — un-friending revokes access implicitly.
      await this.assertFriends(g.ownerId, actorId);
    }

    // Hạn mức là để chặn NGƯỜI ĐƯỢC CHIA SẺ dùng quá tay trên máy của chủ. Áp lên chính chủ thì
    // họ tự khoá mình khỏi máy của mình — vô nghĩa.
    if (!isOwner) {
      const now = Date.now();
      const [inHour, inDay] = await Promise.all([
        this.prisma.larkGrantTurn.count({
          where: { grantId, actorId: { not: g.ownerId }, createdAt: { gt: new Date(now - 3600_000) } },
        }),
        this.prisma.larkGrantTurn.count({
          where: { grantId, actorId: { not: g.ownerId }, createdAt: { gt: new Date(now - 86400_000) } },
        }),
      ]);
      if (inHour >= g.turnsPerHour) throw new ForbiddenException(`Vượt giới hạn ${g.turnsPerHour} lượt/giờ`);
      if (inDay >= g.turnsPerDay) throw new ForbiddenException(`Vượt giới hạn ${g.turnsPerDay} lượt/ngày`);
    }

    const turn = await this.prisma.larkGrantTurn.create({
      data: { grantId, actorId, prompt: text.slice(0, 8000), status: 'queued' },
      select: { id: true, status: true },
    });
    // Wake the owner's desktop. If it is offline the row simply stays queued and the
    // desktop picks it up from `queuedTurns` when it next connects.
    this.events.publishAgent(g.ownerId, { type: 'lark.turn', turnId: turn.id, grantId });
    return turn;
  }

  /** Poll a turn — readable by the grantee who asked and by the owner. */
  async getTurn(userId: string, turnId: string) {
    const t = await this.prisma.larkGrantTurn.findUnique({
      where: { id: turnId },
      include: { grant: { select: { ownerId: true, granteeId: true } } },
    });
    if (!t) throw new NotFoundException('Không tìm thấy lượt chạy');
    if (t.actorId !== userId && t.grant.ownerId !== userId) throw new ForbiddenException('Không có quyền xem');
    return {
      id: t.id,
      status: t.status,
      result: t.result,
      error: t.error,
      createdAt: t.createdAt,
      finishedAt: t.finishedAt,
    };
  }

  /** The owner's desktop pulls whatever is still queued (SSE-miss recovery). Each turn
   *  carries its grant's `kind` so the desktop routes it to the right executor (Lark
   *  connection vs the read-only general assistant). */
  async queuedTurns(ownerId: string) {
    const rows = await this.prisma.larkGrantTurn.findMany({
      // Expiry is re-checked HERE, not just at submit: a turn queued while the owner was
      // offline must not execute days later against an expired grant. The age bound stops
      // a long offline period from unleashing a stale backlog all at once.
      where: {
        status: 'queued',
        createdAt: { gt: new Date(Date.now() - 3600_000) },
        grant: {
          ownerId,
          status: 'active',
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      },
      select: { id: true, grantId: true, actorId: true, prompt: true, createdAt: true, grant: { select: { kind: true } } },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    return rows.map(({ grant, ...t }) => ({ ...t, kind: grant.kind }));
  }

  /** The owner's desktop reports progress/outcome. Only the owner may write a result. */
  async reportTurn(
    ownerId: string,
    turnId: string,
    body: { status: 'running' | 'succeeded' | 'failed' | 'denied'; result?: string; error?: string },
  ) {
    const t = await this.prisma.larkGrantTurn.findFirst({
      where: { id: turnId, grant: { ownerId } },
      select: { id: true, actorId: true, convId: true },
    });
    if (!t) throw new NotFoundException('Không tìm thấy lượt chạy');
    const done = body.status !== 'running';
    const turn = await this.prisma.larkGrantTurn.update({
      where: { id: turnId },
      data: {
        status: body.status,
        result: body.result?.slice(0, 200_000),
        error: body.error?.slice(0, 4000),
        startedAt: body.status === 'running' ? new Date() : undefined,
        finishedAt: done ? new Date() : undefined,
      },
      select: { id: true, status: true },
    });
    // Lượt thuộc một hội thoại dùng chung ⇒ ghi kết quả vào luồng để CẢ HAI bên cùng đọc được.
    // Chỉ ghi khi đã kết thúc: ghi ở trạng thái 'running' là đẻ ra một dòng rỗng rồi phải sửa.
    if (t.convId && done) {
      await this.convs
        .appendTurnResult(
          turnId,
          t.convId,
          body.status === 'succeeded'
            ? body.result?.trim() || '(không có nội dung trả về)'
            : `Lượt chạy ${body.status === 'denied' ? 'bị từ chối' : 'thất bại'}: ${body.error?.trim() || 'không rõ lý do'}`,
          body.status === 'succeeded',
        )
        .catch(() => undefined); // luồng hỏng không được làm hỏng việc báo cáo lượt chạy
    }
    // Let the grantee's UI update without waiting for its next poll.
    this.events.publishUser(t.actorId, { type: 'lark.turn.update', turnId, status: body.status });
    return turn;
  }

  /** Turn history for a grant (owner or grantee). */
  async turns(userId: string, grantId: string, limit = 50) {
    const g = await this.prisma.larkGrant.findFirst({
      where: { id: grantId, OR: [{ ownerId: userId }, { granteeId: userId }] },
      select: { id: true },
    });
    if (!g) throw new NotFoundException('Không tìm thấy quyền chia sẻ');
    return this.prisma.larkGrantTurn.findMany({
      where: { grantId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }

  /** The owner's desktop reports each tool call it executed for a grantee. */
  async logCall(
    ownerId: string,
    id: string,
    entry: { actorId?: string; tool: string; targetName?: string; decision: string; latencyMs?: number; conversationId?: string },
  ) {
    const g = await this.prisma.larkGrant.findFirst({
      where: { id, ownerId },
      select: { id: true, granteeId: true },
    });
    if (!g) throw new NotFoundException('Không tìm thấy quyền chia sẻ');
    // Bind the actor to the grant itself. Taking it from the body let an owner forge
    // audit rows against arbitrary users and read back their name+email (and probe which
    // user ids exist via the FK error), so the caller-supplied value is ignored.
    const actorId = g.granteeId;
    if (!actorId) throw new BadRequestException('Quyền này chưa có người nhận');
    await this.prisma.larkGrantCall.create({
      data: {
        grantId: id,
        actorId,
        conversationId: entry.conversationId,
        tool: String(entry.tool).slice(0, 120),
        targetName: String(entry.targetName || '').slice(0, 200),
        decision: String(entry.decision).slice(0, 40),
        latencyMs: Math.max(0, Math.trunc(Number(entry.latencyMs) || 0)),
      },
    });
    await this.prisma.larkGrant.update({ where: { id }, data: { lastUsedAt: new Date() } });
    return { ok: true as const };
  }
}

/** Turn execution: the server queues + relays, it never runs anything itself. */
export interface SubmitTurnResult {
  id: string;
  status: string;
}

function clamp(v: unknown, min: number, max: number, dflt: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(Math.max(Math.trunc(n), min), max);
}
