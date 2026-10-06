import { Injectable } from '@nestjs/common';
import type { ClaudeDataOverview, ClaudeReport, ClaudeUserData, ReportPeriod } from '@larkwave/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MaicService } from '../maic/maic.service';

/** MAIC surfaces that call the gateway but do NOT write a MaicUsage row (so their spend isn't in
 *  this report). Kept in sync with the metering audit — shown as a coverage caveat in the UI. */
const UNMETERED_SURFACES = [
  'Trợ lý trợ giúp (chatbot hỗ trợ)',
  'Gợi ý ứng dụng hằng ngày',
  'Phân loại báo lỗi (feedback)',
  'Soạn nháp Skill bằng AI',
  'Sinh hạ tầng Docker (Chạy trên Server)',
];

/**
 * Aggregates hosted-Claude (MAIC) usage for the admin console — the spend the profit report
 * (codegen builds only) never covered. Reads the `MaicUsage` table (kind `ask` = hosted Trợ lý AI
 * chat incl. the /claude workspace + desktop; kind `scheduled` = scheduled tasks) and reports live
 * gateway health from `GET /v1/usage`.
 */
@Injectable()
export class ClaudeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly maic: MaicService,
  ) {}

  private dayKey(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  /** Inclusive start instant for a period; `null` = all-time. Mirrors ReportsService. */
  private periodStart(period: ReportPeriod): Date | null {
    if (period === 'all') return null;
    const start = new Date(`${this.dayKey(new Date())}T00:00:00.000Z`);
    if (period === '7d') start.setUTCDate(start.getUTCDate() - 6);
    else if (period === '30d') start.setUTCDate(start.getUTCDate() - 29);
    return start;
  }

  async report(period: ReportPeriod): Promise<ClaudeReport> {
    const start = this.periodStart(period);
    const where = start ? { createdAt: { gte: start } } : {};

    // Pull the usage rows for the window (capped; matches ReportsService's findMany approach).
    const rows = await this.prisma.maicUsage.findMany({
      where,
      select: { userId: true, tokens: true, costUsd: true, kind: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 50000,
    });

    // Totals + per-kind + per-user + daily series, bucketed in JS.
    const totals = { requests: 0, tokens: 0, costUsd: 0 };
    const byKind = new Map<string, { requests: number; tokens: number; costUsd: number }>();
    const byUser = new Map<string, { requests: number; tokens: number; costUsd: number }>();
    const byDay = new Map<string, { requests: number; tokens: number; costUsd: number }>();

    for (const r of rows) {
      const tokens = r.tokens || 0;
      const cost = r.costUsd || 0;
      totals.requests += 1;
      totals.tokens += tokens;
      totals.costUsd += cost;

      const k = byKind.get(r.kind) || { requests: 0, tokens: 0, costUsd: 0 };
      k.requests += 1; k.tokens += tokens; k.costUsd += cost;
      byKind.set(r.kind, k);

      const u = byUser.get(r.userId) || { requests: 0, tokens: 0, costUsd: 0 };
      u.requests += 1; u.tokens += tokens; u.costUsd += cost;
      byUser.set(r.userId, u);

      const day = this.dayKey(r.createdAt);
      const d = byDay.get(day) || { requests: 0, tokens: 0, costUsd: 0 };
      d.requests += 1; d.tokens += tokens; d.costUsd += cost;
      byDay.set(day, d);
    }

    // Resolve the top ~20 users' identity for a readable table.
    const topUserIds = [...byUser.entries()]
      .sort((a, b) => b[1].tokens - a[1].tokens)
      .slice(0, 20)
      .map(([id]) => id);
    const users = topUserIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: topUserIds } },
          select: { id: true, name: true, email: true, plan: true },
        })
      : [];
    const userById = new Map(users.map((u) => [u.id, u]));
    const topUsers = topUserIds.map((id) => {
      const agg = byUser.get(id)!;
      const u = userById.get(id);
      return {
        userId: id,
        name: u?.name || '',
        email: u?.email || '(đã xoá)',
        plan: u?.plan || '—',
        ...agg,
      };
    });

    const series = [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-90)
      .map(([date, v]) => ({ date, ...v }));

    // Live gateway health (never throws — the report must render even if MAIC is down/off).
    let gateway: ClaudeReport['gateway'] = { enabled: this.maic.enabled, reachable: false };
    if (this.maic.enabled) {
      try {
        const u = await this.maic.usage();
        gateway = {
          enabled: true,
          reachable: true,
          available: u.available,
          state: u.state,
          mode: u.mode,
          message: u.message,
          rateLimit: u.rateLimit,
        };
      } catch (e) {
        gateway = { enabled: true, reachable: false, message: (e as Error)?.message?.slice(0, 200) };
      }
    }

    return {
      period,
      gateway,
      totals: { ...totals, users: byUser.size },
      byKind: [...byKind.entries()].map(([kind, v]) => ({ kind, ...v })).sort((a, b) => b.tokens - a.tokens),
      topUsers,
      series,
      unmeteredSurfaces: UNMETERED_SURFACES,
    };
  }

  /** Platform-wide Claude DATA volume (all-time state) + top accounts — for data management. */
  async dataOverview(): Promise<ClaudeDataOverview> {
    const [convByUser, projByUser, totalConversations, totalProjects] = await Promise.all([
      this.prisma.agentChatConversation.groupBy({ by: ['userId'], _count: { _all: true }, _max: { clientTs: true } }),
      this.prisma.agentChatProject.groupBy({ by: ['userId'], _count: { _all: true } }),
      this.prisma.agentChatConversation.count(),
      this.prisma.agentChatProject.count(),
    ]);
    const projCount = new Map(projByUser.map((p) => [p.userId, p._count._all]));
    const convCount = new Map(convByUser.map((c) => [c.userId, c._count._all]));
    const lastTs = new Map(convByUser.map((c) => [c.userId, c._max.clientTs || 0]));
    const userIds = new Set<string>([...convCount.keys(), ...projCount.keys()]);

    const top = [...userIds]
      .sort((a, b) => (convCount.get(b) || 0) - (convCount.get(a) || 0))
      .slice(0, 50);
    const users = top.length
      ? await this.prisma.user.findMany({
          where: { id: { in: top } },
          select: { id: true, name: true, email: true, plan: true },
        })
      : [];
    const userById = new Map(users.map((u) => [u.id, u]));

    return {
      totals: { usersWithData: userIds.size, conversations: totalConversations, projects: totalProjects },
      byUser: top.map((id) => {
        const u = userById.get(id);
        const ts = lastTs.get(id) || 0;
        return {
          userId: id,
          name: u?.name || '',
          email: u?.email || '(đã xoá)',
          plan: u?.plan || '—',
          conversations: convCount.get(id) || 0,
          projects: projCount.get(id) || 0,
          lastActivityAt: ts > 0 ? new Date(ts).toISOString() : null,
        };
      }),
    };
  }

  /** One account's conversations + projects (admin drill-down). */
  async userData(userId: string): Promise<ClaudeUserData> {
    const [user, projects, conversations] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, plan: true } }),
      this.prisma.agentChatProject.findMany({ where: { userId }, select: { id: true, name: true, instructions: true }, orderBy: { ord: 'asc' } }),
      this.prisma.agentChatConversation.findMany({
        where: { userId },
        select: { id: true, title: true, projectId: true, pinned: true, body: true, updatedAt: true, clientTs: true },
        orderBy: { clientTs: 'desc' },
        take: 500,
      }),
    ]);
    const projName = new Map(projects.map((p) => [p.id, p.name]));
    const projConv = new Map<string, number>();
    const convs = conversations.map((c) => {
      if (c.projectId) projConv.set(c.projectId, (projConv.get(c.projectId) || 0) + 1);
      const body = c.body as unknown;
      return {
        id: c.id,
        title: c.title || '',
        projectId: c.projectId || undefined,
        projectName: c.projectId ? projName.get(c.projectId) : undefined,
        pinned: c.pinned,
        messages: Array.isArray(body) ? body.length : 0,
        updatedAt: c.updatedAt.toISOString(),
      };
    });
    return {
      userId,
      name: user?.name || '',
      email: user?.email || '(đã xoá)',
      plan: user?.plan || '—',
      conversations: convs,
      projects: projects.map((p) => ({ id: p.id, name: p.name, instructions: p.instructions, conversations: projConv.get(p.id) || 0 })),
    };
  }

  /** Admin delete a conversation (best-effort; also drops its MAIC session mapping). NOTE: the owner's
   *  device localStorage is unreachable — it can re-sync the conversation back on their next turn. */
  async deleteConversation(id: string): Promise<{ ok: boolean }> {
    await this.prisma.agentChatConversation.delete({ where: { id } }).catch(() => undefined);
    await this.prisma.maicSession.deleteMany({ where: { clientConversationId: id } }).catch(() => undefined);
    return { ok: true };
  }
}
