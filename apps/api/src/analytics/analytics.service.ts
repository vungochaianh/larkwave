import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AppAnalytics } from '@larkwave/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppAccessService } from '../common/app-access.service';
import type { AuthUser } from '../common/auth-user';

const BOT =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|monitor|uptime|curl|wget|python-requests/i;

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AppAccessService,
  ) {}

  private dayKey(d = new Date()): string {
    return d.toISOString().slice(0, 10);
  }

  private refHost(ref?: string): string {
    if (!ref) return 'direct';
    try {
      const h = new URL(ref).host.replace(/^www\./, '');
      return h || 'direct';
    } catch {
      return 'direct';
    }
  }

  /** Increment a key in a bucket map, keeping only the top `cap` keys (bounds JSON). */
  private mergeBucket(cur: unknown, key: string, cap: number): Record<string, number> {
    const m: Record<string, number> =
      cur && typeof cur === 'object' ? { ...(cur as Record<string, number>) } : {};
    m[key] = (m[key] ?? 0) + 1;
    return Object.fromEntries(
      Object.entries(m)
        .sort((a, b) => b[1] - a[1])
        .slice(0, cap),
    );
  }

  /** Public beacon: record one pageview for a deployed app. Best-effort, never throws. */
  async track(appId: string, referrer: string | undefined, ua: string | undefined): Promise<void> {
    if (BOT.test(ua ?? '')) return;
    const day = this.dayKey();
    const host = this.refHost(referrer);
    const device = /Mobi|Android|iPhone|iPad|iPod/i.test(ua ?? '') ? 'mobile' : 'desktop';
    try {
      const existing = await this.prisma.appVisitDay.findUnique({
        where: { appId_day: { appId, day } },
      });
      if (existing) {
        await this.prisma.appVisitDay.update({
          where: { id: existing.id },
          data: {
            count: { increment: 1 },
            referrers: this.mergeBucket(existing.referrers, host, 25),
            devices: this.mergeBucket(existing.devices, device, 2),
          },
        });
      } else {
        await this.prisma.appVisitDay.create({
          data: { appId, day, count: 1, referrers: { [host]: 1 }, devices: { [device]: 1 } },
        });
      }
    } catch {
      // Bogus/non-existent appId (FK) or a write race → ignore (analytics-lite).
    }
  }

  /** Aggregated analytics for the dashboard (owner / editor / viewer). */
  async summary(user: AuthUser, appId: string, rangeDays = 30): Promise<AppAnalytics> {
    if (!(await this.access.canRead(user, appId))) {
      throw new ForbiddenException('App không thuộc về bạn');
    }
    const days = Math.min(Math.max(Number.isFinite(rangeDays) ? rangeDays : 30, 7), 90);
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - (days - 1));
    const startKey = start.toISOString().slice(0, 10);

    const rows = await this.prisma.appVisitDay.findMany({
      where: { appId, day: { gte: startKey } },
      orderBy: { day: 'asc' },
    });

    const byDay = new Map(rows.map((r) => [r.day, r.count]));
    const series: { day: string; count: number }[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      const key = d.toISOString().slice(0, 10);
      series.push({ day: key, count: byDay.get(key) ?? 0 });
    }

    const refAgg: Record<string, number> = {};
    let mobile = 0;
    let desktop = 0;
    let total = 0;
    for (const r of rows) {
      total += r.count;
      const refs = (r.referrers as Record<string, number> | null) ?? {};
      for (const [h, c] of Object.entries(refs)) refAgg[h] = (refAgg[h] ?? 0) + c;
      const dev = (r.devices as Record<string, number> | null) ?? {};
      mobile += dev.mobile ?? 0;
      desktop += dev.desktop ?? 0;
    }
    const referrers = Object.entries(refAgg)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([host, count]) => ({ host, count }));

    return { rangeDays: days, total, days: series, referrers, devices: { mobile, desktop } };
  }
}
