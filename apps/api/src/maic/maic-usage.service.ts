import { HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { AppConfigService } from '../config/app-config.service';
import { MaicAdminService } from './maic-admin.service';
import { normalizePlanId } from '../billing/plans';
import type { AuthUser } from '../common/auth-user';

/**
 * Gate + meter for MAIC (hosted Claude) usage, sharing the SAME monthly % token-budget
 * as codegen. MAIC returns costUsd; the budget unit is tokens (User.quotaUsed), so cost is
 * converted via MAIC_USD_PER_MTOK. Mirrors PipelineService.meterBuildTokens + BuildsService's
 * quota gate (kept self-contained to avoid refactoring those hot paths). Admins are unlimited.
 * The per-user gate — NOT MAIC's global /v1/usage — is what enforces plans/trials per user.
 */
@Injectable()
export class MaicUsageService {
  private readonly logger = new Logger(MaicUsageService.name);

  /** Ai đã được đẩy trần sang MAIC trong vòng đời tiến trình này. */
  private static readonly daDongBo = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly config: AppConfigService,
    private readonly maicAdmin: MaicAdminService,
  ) {}

  /** Month boundary — identical rule to PipelineService.meterBuildTokens (same-day next month, UTC). */
  private nextMonthStart(from: Date): Date {
    return new Date(
      Date.UTC(
        from.getUTCFullYear(),
        from.getUTCMonth() + 1,
        from.getUTCDate(),
        from.getUTCHours(),
        from.getUTCMinutes(),
        from.getUTCSeconds(),
        0,
      ),
    );
  }

  /**
   * Block a MAIC turn when the user is out of monthly budget or the free plan is off —
   * same 402 semantics as BuildsService.assertUnderQuota/assertPlanUsable, so hosted-agent
   * usage and codegen share one budget. Admins are never gated. Call BEFORE hitting MAIC.
   */
  async assertMaicAllowed(user: AuthUser): Promise<void> {
    // Tự vũ trang hàng rào bên MAIC.
    //
    // MAIC tạo người dùng cuối ngay ở lời gọi đầu tiên, nhưng lúc đó nó chưa biết
    // gói nên trần để 0 = không giới hạn. Trần chỉ được đẩy sang khi người dùng
    // ĐỔI gói — nghĩa là mọi tài khoản đã tồn tại từ trước sẽ mãi không có trần
    // bên đó, và hàng rào thứ hai coi như không tồn tại với đúng những người
    // đang dùng nhiều nhất.
    //
    // Đồng bộ một lần cho mỗi tài khoản trong vòng đời tiến trình: không đụng cơ
    // sở dữ liệu, không chặn lượt gọi, và tự lành sau mỗi lần khởi động lại.
    if (!MaicUsageService.daDongBo.has(user.id)) {
      MaicUsageService.daDongBo.add(user.id);
      void this.maicAdmin.syncUser(user.id);
    }

    if (user.role === 'admin') return; // unlimited

    if (!(await this.billing.isFreePlanEnabled())) {
      const acc = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { plan: true },
      });
      if (normalizePlanId(acc?.plan) === 'free') {
        throw new HttpException(
          {
            message: 'Chế độ miễn phí đang tạm tắt. Vui lòng nâng cấp gói để dùng Trợ lý AI.',
            code: 'FREE_PLAN_DISABLED',
            plan: 'free',
          },
          402,
        );
      }
    }

    const acc = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { plan: true, quotaUsed: true, quotaResetAt: true },
    });
    if (!acc) throw new NotFoundException('Không tìm thấy người dùng');
    const planId = normalizePlanId(acc.plan);
    const monthlyTokens = await this.billing.getMonthlyTokens(planId);
    const expired = !acc.quotaResetAt || acc.quotaResetAt.getTime() <= Date.now();
    const used = expired ? 0 : acc.quotaUsed;
    if (used >= monthlyTokens) {
      throw new HttpException(
        {
          message: 'Bạn đã dùng hết 100% gói tháng này. Nâng gói để tiếp tục dùng Trợ lý AI.',
          code: 'QUOTA_EXCEEDED',
          plan: planId,
          percentUsed: 100,
        },
        402,
      );
    }
  }

  /** costUsd → token unit: costUsd / ($/Mtok) * 1e6. */
  private usdToTokens(costUsd: number): number {
    const rate = this.config.env.MAIC_USD_PER_MTOK || 10;
    return Math.max(0, Math.round((costUsd / rate) * 1_000_000));
  }

  /**
   * Record a completed MAIC turn into the owner's monthly % budget (in tokens). Prefers the REAL
   * token counts MAIC now returns (`inputTokens + outputTokens`); falls back to converting `costUsd`
   * via MAIC_USD_PER_MTOK only when tokens are absent. Idempotent per runId (a MaicUsage row is the
   * claim). Admin turns are recorded for audit but never counted. Lazily resets the monthly window
   * (same rule as meterBuildTokens), all in one transaction so a concurrent reset/meter can't interleave.
   */
  async meterMaic(
    userId: string,
    opts: { runId: string; kind: string; inputTokens?: number; outputTokens?: number; costUsd?: number },
  ): Promise<void> {
    const { runId, kind } = opts;
    if (!runId) return;
    const costUsd = opts.costUsd ?? 0;
    const real = (opts.inputTokens ?? 0) + (opts.outputTokens ?? 0);
    const tokens = real > 0 ? real : this.usdToTokens(costUsd);
    if (tokens <= 0) return;
    await this.prisma
      .$transaction(async (tx) => {
        // Idempotency claim: first writer for this runId wins (guards double-debit on retry).
        const existing = await tx.maicUsage.findUnique({ where: { runId }, select: { runId: true } });
        if (existing) return;
        const u = await tx.user.findUnique({
          where: { id: userId },
          select: { role: true, quotaResetAt: true },
        });
        if (!u) return;
        await tx.maicUsage.create({ data: { runId, userId, costUsd, tokens, kind } });
        if (u.role === 'admin') return; // recorded for audit, never counts against a budget
        const now = new Date();
        const expired = !u.quotaResetAt || u.quotaResetAt.getTime() <= now.getTime();
        if (expired) {
          await tx.user.update({
            where: { id: userId },
            data: { quotaUsed: tokens, quotaResetAt: this.nextMonthStart(now), quotaWindowAt: now },
          });
          // Cửa sổ hạn mức bên ta vừa xoay vòng → mở chu kỳ mới bên MAIC luôn,
          // nếu không trần bên đó vẫn tính mức dùng của tháng cũ và sẽ chặn oan.
          // Không await: đây là chuyện sổ sách, không được làm hỏng lượt chạy.
          void this.maicAdmin.resetUsage(userId);
        } else {
          await tx.user.update({
            where: { id: userId },
            data: { quotaUsed: { increment: tokens } },
          });
        }
        this.logger.log(`metered ${tokens} token(s) (MAIC ${kind}) for user ${userId}`);
      })
      .catch((e) => this.logger.warn(`meterMaic ${runId} failed: ${String(e)}`));
  }

  /** MAIC is stateless per token → map a client conversation id ↔ MAIC's sessionId. */
  async getMaicSessionId(userId: string, clientConversationId: string): Promise<string | null> {
    const row = await this.prisma.maicSession.findUnique({
      where: { userId_clientConversationId: { userId, clientConversationId } },
      select: { maicSessionId: true },
    });
    return row?.maicSessionId ?? null;
  }

  /**
   * Forget a stored MAIC session. Called when the gateway reports the session no longer exists:
   * MAIC resumes a CLI conversation by id, and once that conversation is gone (pruned, or the run
   * never produced an answer) every later turn keyed to it fails forever. Dropping the mapping is
   * what lets the next turn open a fresh conversation instead of retrying a dead one.
   */
  async clearMaicSessionId(userId: string, clientConversationId: string): Promise<void> {
    await this.prisma.maicSession
      .deleteMany({ where: { userId, clientConversationId } })
      .catch(() => undefined);
  }

  /**
   * Ghi bối cảnh mang sang từ một lượt có file đính kèm (xem MaicSession.carryOver).
   * Dùng maicSessionId='' khi chưa có phiên nào — lượt có file không sinh ra phiên nối lại được.
   */
  async saveCarryOver(userId: string, clientConversationId: string, carryOver: string): Promise<void> {
    await this.prisma.maicSession
      .upsert({
        where: { userId_clientConversationId: { userId, clientConversationId } },
        create: { userId, clientConversationId, maicSessionId: '', carryOver },
        update: { carryOver },
      })
      .catch(() => undefined);
  }

  /** Đọc rồi XOÁ bối cảnh mang sang — nó chỉ dành cho ĐÚNG lượt kế tiếp, không phải mãi mãi. */
  async takeCarryOver(userId: string, clientConversationId: string): Promise<string | null> {
    const row = await this.prisma.maicSession
      .findUnique({ where: { userId_clientConversationId: { userId, clientConversationId } } })
      .catch(() => null);
    if (!row?.carryOver) return null;
    await this.prisma.maicSession
      .update({ where: { id: row.id }, data: { carryOver: null } })
      .catch(() => undefined);
    return row.carryOver;
  }

  /** Đánh dấu hội thoại đã vào chế độ agentic — từ đó mọi lượt sau đều chạy đường có công cụ. */
  async markAgentic(userId: string, clientConversationId: string): Promise<void> {
    await this.prisma.maicSession
      .upsert({
        where: { userId_clientConversationId: { userId, clientConversationId } },
        create: { userId, clientConversationId, maicSessionId: '', agentic: true },
        update: { agentic: true },
      })
      .catch(() => undefined);
  }

  /** Hội thoại này có đang ở chế độ agentic không. */
  async isAgentic(userId: string, clientConversationId: string): Promise<boolean> {
    const row = await this.prisma.maicSession
      .findUnique({ where: { userId_clientConversationId: { userId, clientConversationId } }, select: { agentic: true } })
      .catch(() => null);
    return !!row?.agentic;
  }

  async saveMaicSessionId(userId: string, clientConversationId: string, maicSessionId: string): Promise<void> {
    await this.prisma.maicSession
      .upsert({
        where: { userId_clientConversationId: { userId, clientConversationId } },
        create: { userId, clientConversationId, maicSessionId },
        update: { maicSessionId },
      })
      .catch(() => undefined);
  }
}
