import { Injectable } from '@nestjs/common';
import type { AdminReport, PlanId, ReportPeriod, UsageCostBucket } from '@larkwave/shared';
import { PLAN_IDS } from '@larkwave/shared';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { normalizePlanId } from '../billing/plans';

/** Paid-plan ids (exclude 'free') — revenue is only ever from these. */
const PAID_PLAN_IDS = PLAN_IDS.filter((p) => p !== 'free') as Exclude<PlanId, 'free'>[];

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  /** `YYYY-MM-DD` (UTC) for bucketing the daily series. */
  private dayKey(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  /** Inclusive start instant for a period; `null` = all-time (no lower bound). */
  private periodStart(period: ReportPeriod): Date | null {
    if (period === 'all') return null;
    const todayKey = this.dayKey(new Date());
    const start = new Date(`${todayKey}T00:00:00.000Z`);
    if (period === '7d') start.setUTCDate(start.getUTCDate() - 6);
    else if (period === '30d') start.setUTCDate(start.getUTCDate() - 29);
    // 'today' -> start of today, no shift
    return start;
  }

  /** `GET /v1/admin/reports` — profit / cost / revenue dashboard. AI cost = the metered
   *  MAIC usage (help assistant, hosted Trợ lý AI runs, hosted Lark turns). */
  async report(period: ReportPeriod): Promise<AdminReport> {
    const start = this.periodStart(period);
    const usageWhere = start ? { createdAt: { gte: start } } : {};
    const paymentWhere = start
      ? { status: 'paid', paidAt: { gte: start } }
      : { status: 'paid' };

    const [usages, payments, vndPerUsd, usersByPlanRaw, totalUsers] =
      await Promise.all([
        this.prisma.maicUsage.findMany({
          where: usageWhere,
          select: { kind: true, costUsd: true, tokens: true, createdAt: true },
        }),
        this.prisma.payment.findMany({
          where: paymentWhere,
          select: { amountVnd: true, plan: true, paidAt: true },
        }),
        this.billing.getVndPerUsd(),
        this.prisma.user.groupBy({ by: ['plan'], _count: { _all: true } }),
        this.prisma.user.count(),
      ]);

    // ── AI cost (sum MaicUsage) + per-kind breakdown ──────────────────────────
    const byKind: Record<string, UsageCostBucket> = {};
    let totalUsd = 0;
    let tokens = 0;

    // Daily series: date -> { apiCostUsd } (revenue filled below).
    const seriesMap = new Map<string, { revenueVnd: number; apiCostUsd: number }>();
    const bumpSeries = (date: string): { revenueVnd: number; apiCostUsd: number } => {
      let cell = seriesMap.get(date);
      if (!cell) {
        cell = { revenueVnd: 0, apiCostUsd: 0 };
        seriesMap.set(date, cell);
      }
      return cell;
    };

    for (const u of usages) {
      const usd = num(u.costUsd);
      const t = num(u.tokens);
      totalUsd += usd;
      tokens += t;
      const bucket = (byKind[u.kind] ??= { runs: 0, usd: 0, tokens: 0 });
      bucket.runs += 1;
      bucket.usd += usd;
      bucket.tokens += t;
      bumpSeries(this.dayKey(u.createdAt)).apiCostUsd += usd;
    }
    for (const k of Object.keys(byKind)) byKind[k].usd = round4(byKind[k].usd);

    // ── Revenue (paid payments) + per-plan breakdown ──────────────────────────
    const revenueByPlan = PAID_PLAN_IDS.reduce(
      (acc, p) => {
        acc[p] = { count: 0, vnd: 0 };
        return acc;
      },
      {} as Record<Exclude<PlanId, 'free'>, { count: number; vnd: number }>,
    );

    let totalVnd = 0;
    let paidCount = 0;
    for (const p of payments) {
      const amount = typeof p.amountVnd === 'number' ? p.amountVnd : 0;
      totalVnd += amount;
      paidCount += 1;
      const planId = normalizePlanId(p.plan);
      if (planId !== 'free') {
        revenueByPlan[planId].count += 1;
        revenueByPlan[planId].vnd += amount;
      }
      if (p.paidAt) bumpSeries(this.dayKey(p.paidAt)).revenueVnd += amount;
    }

    // ── Profit ────────────────────────────────────────────────────────────────
    const revenueUsd = vndPerUsd > 0 ? totalVnd / vndPerUsd : 0;
    const profitUsd = revenueUsd - totalUsd;
    const profitVnd = profitUsd * vndPerUsd;
    const marginPct = revenueUsd > 0 ? (profitUsd / revenueUsd) * 100 : 0;

    // ── Users by plan ─────────────────────────────────────────────────────────
    const usersByPlan = PLAN_IDS.reduce(
      (acc, p) => {
        acc[p] = 0;
        return acc;
      },
      {} as Record<PlanId, number>,
    );
    for (const row of usersByPlanRaw) {
      usersByPlan[normalizePlanId(row.plan)] += row._count._all;
    }

    // ── Daily series (ascending, capped ~90 points) ───────────────────────────
    const series = [...seriesMap.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .slice(-90)
      .map(([date, v]) => ({
        date,
        revenueVnd: round0(v.revenueVnd),
        apiCostUsd: round4(v.apiCostUsd),
      }));

    return {
      period,
      apiCost: { totalUsd: round4(totalUsd), tokens, runs: usages.length },
      byKind,
      revenue: { paidCount, totalVnd: round0(totalVnd), byPlan: revenueByPlan },
      profit: {
        revenueVnd: round0(totalVnd),
        revenueUsd: round4(revenueUsd),
        apiCostUsd: round4(totalUsd),
        profitUsd: round4(profitUsd),
        profitVnd: round0(profitVnd),
        marginPct: round2(marginPct),
      },
      users: { total: totalUsers, byPlan: usersByPlan },
      series,
    };
  }
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
function round0(n: number): number {
  return Math.round(n);
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
