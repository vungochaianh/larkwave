import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { AppConfigService } from '../config/app-config.service';
import { normalizePlanId } from '../billing/plans';

/** One end user as MAIC reports it (see MAIC's `publicEndUser`). */
export interface MaicEndUser {
  id: string;
  externalId: string;
  label: string | null;
  plan: string | null;
  monthlyBudgetUsd: number;
  maxConcurrent: number;
  blocked: boolean;
  blockedAt: string | null;
  periodStart: string;
  createdAt: string;
  usage: {
    runs: number;
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
  /** null when there is no cap (monthlyBudgetUsd = 0 means unlimited). */
  percentUsed: number | null;
  remainingUsd: number | null;
  running: number;
}

export interface MaicResellerSummary {
  endUsers: number;
  blocked: number;
  totalRuns: number;
  totalCostUsd: number;
}

/**
 * Delegated admin client for MAIC's reseller layer (`/v1/end-users`).
 *
 * Larkwave is a MAIC reseller: we sell plans to our users, MAIC is the engine behind
 * them. MAIC needs to know who each turn belongs to so it can attribute spend and cap
 * per person — otherwise all our traffic is one opaque blob to it and the only limit
 * that exists is the one in OUR database, which disappears the moment a code path
 * forgets to call `assertMaicAllowed`.
 *
 * Everything here authenticates with the SAME shared MAIC_TOKEN — it never leaves
 * apps/api, and end users never get a MAIC credential of their own.
 *
 * Every method is FAILURE-TOLERANT by design. MAIC being down, or our token not being
 * flagged as a reseller yet, must never break a Larkwave request: attribution is a
 * bookkeeping nicety, not a prerequisite for serving the user. Callers get `null` and
 * a log line instead of an exception.
 */
@Injectable()
export class MaicAdminService {
  private readonly logger = new Logger(MaicAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly config: AppConfigService,
  ) {}

  get enabled(): boolean {
    return !!(this.config.env.MAIC_URL && this.config.env.MAIC_TOKEN);
  }

  private get base(): string {
    return this.config.env.MAIC_URL.replace(/\/+$/, '');
  }

  private async call<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T | null> {
    if (!this.enabled) return null;
    try {
      const res = await fetch(`${this.base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.config.env.MAIC_TOKEN}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        // 403 not_reseller is the expected state before the MAIC operator flips the
        // role — log it at warn once per call rather than throwing, so the product
        // keeps working with attribution simply switched off.
        this.logger.warn(`MAIC ${method} ${path} → ${res.status} ${text.slice(0, 200)}`);
        return null;
      }
      return (await res.json()) as T;
    } catch (e) {
      this.logger.warn(`MAIC ${method} ${path} hỏng: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * Our monthly budget is denominated in TOKENS (`plan.monthlyTokens`); MAIC's cap is in
   * USD. Convert with the same rate `meterMaic` uses in the other direction, so the two
   * ceilings describe the same allowance instead of drifting apart.
   */
  private async planBudgetUsd(plan: string | null | undefined): Promise<number> {
    const monthlyTokens = await this.billing.getMonthlyTokens(plan);
    const rate = this.config.env.MAIC_USD_PER_MTOK || 10;
    return Number(((monthlyTokens / 1_000_000) * rate).toFixed(4));
  }

  /**
   * Push one user's identity + cap into MAIC. Safe to call repeatedly — MAIC's
   * `POST /v1/end-users` creates or updates in one shot.
   *
   * Deliberately sends `User.id` and NOT the email: MAIC only needs a stable opaque
   * handle, and the less it holds the less a leak there costs us.
   */
  async syncUser(userId: string): Promise<MaicEndUser | null> {
    // Cổng chưa cấu hình → không có gì để đẩy. Thoát Ở ĐÂY chứ không để `call` trả null ở
    // cuối: khi MAIC tắt, mỗi lời gọi (mỗi tài khoản đầu phiên, mỗi lần đổi gói) vẫn đang tốn
    // hai vòng vào cơ sở dữ liệu cho một việc chắc chắn không xảy ra.
    if (!this.enabled) return null;

    // Phương thức này được gọi kiểu bắn-rồi-quên (`void this.maicAdmin.syncUser(...)`) ở
    // payments/me/users/maic-usage. Khác với các phương thức còn lại — nơi mọi việc nằm gọn
    // trong `call` đã nuốt lỗi — chỗ này còn đọc cơ sở dữ liệu TRƯỚC khi gọi mạng. Một cú vấp
    // của Prisma ở đó là một promise bị từ chối mà không ai bắt, và apps/api chạy `node
    // dist/main` trơn, không đăng ký `unhandledRejection` → Node mặc định giết luôn tiến
    // trình API. Giữ đúng lời hứa "mọi phương thức đều chịu được hỏng" ghi ở đầu lớp.
    try {
      const u = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, plan: true, handle: true, name: true, status: true, role: true },
      });
      if (!u) return null;

      const plan = normalizePlanId(u.plan);
      // Admin KHÔNG có trần — và trần phải bỏ ở CẢ PHÍA MAIC, không chỉ phía mình.
      //
      // Bên ta miễn cho admin ở `MaicUsageService.assertUnderQuota`, nhưng MAIC giữ hạn mức RIÊNG
      // cho từng người dùng cuối. Trước đây ta vẫn đẩy lên trần theo GÓI (bỏ qua vai trò), nên
      // admin dùng hết trần đó là MAIC trả `end_user_quota_exceeded` → người dùng thấy "đã dùng hết
      // gói tháng này" dù bên mình không hề chặn. Tệ hơn: `resetUsage` chỉ được gọi ở nhánh dành
      // cho người dùng THƯỜNG, nên cửa sổ của admin không bao giờ xoay vòng — chặn một lần là chặn
      // vĩnh viễn. 0 = không giới hạn.
      const budget = u.role === 'admin' ? 0 : await this.planBudgetUsd(plan);
      const r = await this.call<{ endUser: MaicEndUser }>('POST', '/v1/end-users', {
        externalId: u.id,
        label: u.handle || u.name || null,
        plan,
        monthlyBudgetUsd: budget,
      });
      if (!r) return null;

      // A suspended Larkwave account must not keep spending through MAIC either.
      const shouldBlock = u.status === 'suspended';
      if (shouldBlock !== r.endUser.blocked) {
        return (await this.setBlocked(u.id, shouldBlock)) ?? r.endUser;
      }
      return r.endUser;
    } catch (e) {
      this.logger.warn(`MAIC đồng bộ người dùng ${userId} hỏng: ${(e as Error).message}`);
      return null;
    }
  }

  /** Open a fresh usage window in MAIC — call when our own monthly quota resets. */
  async resetUsage(userId: string): Promise<MaicEndUser | null> {
    const r = await this.call<{ endUser: MaicEndUser }>(
      'POST',
      `/v1/end-users/${encodeURIComponent(userId)}/reset-usage`,
    );
    return r?.endUser ?? null;
  }

  async setBlocked(userId: string, blocked: boolean): Promise<MaicEndUser | null> {
    const r = await this.call<{ endUser: MaicEndUser }>(
      'POST',
      `/v1/end-users/${encodeURIComponent(userId)}/${blocked ? 'block' : 'unblock'}`,
    );
    return r?.endUser ?? null;
  }

  async getEndUser(userId: string): Promise<MaicEndUser | null> {
    const r = await this.call<{ endUser: MaicEndUser }>(
      'GET',
      `/v1/end-users/${encodeURIComponent(userId)}`,
    );
    return r?.endUser ?? null;
  }

  async listEndUsers(
    opts: { limit?: number; offset?: number; q?: string } = {},
  ): Promise<{ endUsers: MaicEndUser[]; total: number; summary: MaicResellerSummary } | null> {
    const qs = new URLSearchParams();
    if (opts.limit) qs.set('limit', String(opts.limit));
    if (opts.offset) qs.set('offset', String(opts.offset));
    if (opts.q) qs.set('q', opts.q);
    const suffix = qs.toString() ? `?${qs}` : '';
    return this.call('GET', `/v1/end-users${suffix}`);
  }

  /** Runs MAIC attributed to one user — the audit trail behind a disputed charge. */
  async endUserRuns(
    userId: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<{ runs: unknown[]; total: number } | null> {
    const qs = new URLSearchParams();
    if (opts.limit) qs.set('limit', String(opts.limit));
    if (opts.offset) qs.set('offset', String(opts.offset));
    const suffix = qs.toString() ? `?${qs}` : '';
    return this.call('GET', `/v1/end-users/${encodeURIComponent(userId)}/runs${suffix}`);
  }

  /**
   * Sync every user MAIC has seen, or a bounded batch of ours.
   *
   * Used after a plan-catalog change, when every cap moves at once. Sequential on
   * purpose: this is a background reconciliation, and hammering the gateway with
   * hundreds of parallel writes to save a few seconds is a bad trade.
   */
  async syncAll(limit = 500): Promise<{ synced: number; failed: number }> {
    const users = await this.prisma.user.findMany({
      select: { id: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    let synced = 0;
    let failed = 0;
    for (const u of users) {
      const r = await this.syncUser(u.id);
      if (r) synced++;
      else failed++;
    }
    this.logger.log(`Đồng bộ người dùng cuối sang MAIC: ${synced} xong, ${failed} hỏng`);
    return { synced, failed };
  }
}
