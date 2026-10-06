import { Injectable } from '@nestjs/common';
import type {
  AdminReport,
  ModelChoice,
  ModelCostBucket,
  PlanId,
  ReportPeriod,
} from '@larkwave/shared';
import { MODEL_CHOICES, PLAN_IDS } from '@larkwave/shared';
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

  /** `GET /v1/admin/reports` — profit / cost / revenue dashboard. */
  async report(period: ReportPeriod): Promise<AdminReport> {
    const start = this.periodStart(period);
    const buildWhere = start ? { createdAt: { gte: start } } : {};
    const paymentWhere = start
      ? { status: 'paid', paidAt: { gte: start } }
      : { status: 'paid' };

    const [builds, payments, vndPerUsd, usersByPlanRaw, totalUsers] =
      await Promise.all([
        this.prisma.build.findMany({
          where: buildWhere,
          select: { model: true, usage: true, status: true, createdAt: true },
        }),
        this.prisma.payment.findMany({
          where: paymentWhere,
          select: { amountVnd: true, plan: true, paidAt: true },
        }),
        this.billing.getVndPerUsd(),
        this.prisma.user.groupBy({ by: ['plan'], _count: { _all: true } }),
        this.prisma.user.count(),
      ]);

    // ── API cost (sum Build.usage, guard nulls) + per-model breakdown ──────────
    const byModel = MODEL_CHOICES.reduce(
      (acc, m) => {
        acc[m] = { builds: 0, usd: 0, inputTokens: 0, outputTokens: 0 };
        return acc;
      },
      {} as Record<ModelChoice, ModelCostBucket>,
    );

    let totalUsd = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let usageBuilds = 0;

    const buildCounts = { total: 0, succeeded: 0, failed: 0, canceled: 0 };
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

    for (const b of builds) {
      buildCounts.total += 1;
      if (b.status === 'succeeded') buildCounts.succeeded += 1;
      else if (b.status === 'failed') buildCounts.failed += 1;
      else if (b.status === 'canceled') buildCounts.canceled += 1;

      const usage = parseUsage(b.usage);
      if (usage) {
        const model: ModelChoice = b.model === 'sonnet' ? 'sonnet' : 'opus';
        totalUsd += usage.usd;
        inputTokens += usage.inputTokens;
        outputTokens += usage.outputTokens;
        usageBuilds += 1;

        const bucket = byModel[model];
        bucket.builds += 1;
        bucket.usd += usage.usd;
        bucket.inputTokens += usage.inputTokens;
        bucket.outputTokens += usage.outputTokens;

        bumpSeries(this.dayKey(b.createdAt)).apiCostUsd += usage.usd;
      }
    }

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
      apiCost: {
        totalUsd: round4(totalUsd),
        inputTokens,
        outputTokens,
        builds: usageBuilds,
      },
      byModel: roundByModel(byModel),
      builds: {
        ...buildCounts,
        successRate: buildCounts.total > 0 ? buildCounts.succeeded / buildCounts.total : 0,
      },
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

/** Parse a Build.usage JSON blob into a TokenUsage, guarding nulls/garbage. */
function parseUsage(
  raw: unknown,
): { inputTokens: number; outputTokens: number; usd: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const u = raw as Record<string, unknown>;
  const usd = num(u.usd);
  const inputTokens = num(u.inputTokens);
  const outputTokens = num(u.outputTokens);
  if (usd === 0 && inputTokens === 0 && outputTokens === 0) return null;
  return { inputTokens, outputTokens, usd };
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
function roundByModel(
  byModel: Record<ModelChoice, ModelCostBucket>,
): Record<ModelChoice, ModelCostBucket> {
  for (const m of MODEL_CHOICES) byModel[m].usd = round4(byModel[m].usd);
  return byModel;
}
