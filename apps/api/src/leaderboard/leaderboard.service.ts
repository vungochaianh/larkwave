import { Injectable } from '@nestjs/common';
import {
  computeXp,
  levelInfo,
  type LeaderboardEntry,
  type LeaderboardResponse,
} from '@larkwave/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/auth-user';

interface Stat {
  apps: number;
  succeededBuilds: number;
  deployments: number;
  visits: number;
}

@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  /** Top builders by XP (computed from activity), plus the caller's own rank. */
  async top(user: AuthUser, limit = 50): Promise<LeaderboardResponse> {
    const [apps, builds, deploys] = await Promise.all([
      this.prisma.app.groupBy({
        by: ['ownerId'],
        _count: { _all: true },
        _sum: { visits: true },
      }),
      this.prisma.build.groupBy({
        by: ['ownerId'],
        where: { status: 'succeeded' },
        _count: { _all: true },
      }),
      // Deployments belong to an app (no ownerId column) — join to attribute them.
      this.prisma.$queryRaw<{ ownerId: string; c: number }[]>`
        SELECT a."ownerId" AS "ownerId", COUNT(d.id)::int AS c
        FROM "Deployment" d JOIN "App" a ON a.id = d."appId"
        GROUP BY a."ownerId"`,
    ]);

    const stat = new Map<string, Stat>();
    const get = (id: string): Stat => {
      let s = stat.get(id);
      if (!s) {
        s = { apps: 0, succeededBuilds: 0, deployments: 0, visits: 0 };
        stat.set(id, s);
      }
      return s;
    };
    for (const a of apps) {
      const s = get(a.ownerId);
      s.apps = a._count._all;
      s.visits = a._sum.visits ?? 0;
    }
    for (const b of builds) get(b.ownerId).succeededBuilds = b._count._all;
    for (const d of deploys) get(d.ownerId).deployments = Number(d.c);

    const ranked = [...stat.entries()]
      .map(([id, s]) => ({ id, xp: computeXp(s) }))
      .filter((r) => r.xp > 0)
      .sort((a, b) => b.xp - a.xp);

    const meIndex = ranked.findIndex((r) => r.id === user.id);
    const needIds = new Set(ranked.slice(0, limit).map((r) => r.id));
    if (meIndex >= 0) needIds.add(user.id);

    const users = await this.prisma.user.findMany({
      where: { id: { in: [...needIds] } },
      select: { id: true, name: true, email: true, avatarUrl: true },
    });
    const uMap = new Map(users.map((u) => [u.id, u]));

    const toEntry = (r: { id: string; xp: number }, rank: number): LeaderboardEntry => {
      const u = uMap.get(r.id);
      return {
        rank,
        user: {
          id: r.id,
          name: u?.name ?? '',
          email: u?.email ?? '',
          avatarUrl: u?.avatarUrl ?? null,
        },
        xp: r.xp,
        level: levelInfo(r.xp).level,
        isMe: r.id === user.id,
      };
    };

    return {
      entries: ranked.slice(0, limit).map((r, i) => toEntry(r, i + 1)),
      me: meIndex >= 0 ? toEntry(ranked[meIndex], meIndex + 1) : null,
    };
  }
}
