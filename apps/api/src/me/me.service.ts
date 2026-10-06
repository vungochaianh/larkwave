import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import {
  ActivityDay,
  MeActivity,
  MeOverview,
  MeSubscription,
  PlanId,
  UpgradeQuote,
  User,
  usagePercent,
} from '@larkwave/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth-user';
import { toUser } from '../common/mappers';
import { normalizePlanId, planRank } from '../billing/plans';
import { computeUpgradeAmount } from '../billing/proration';
import { BillingService } from '../billing/billing.service';
import { AuthService } from '../auth/auth.service';
import { MaicAdminService } from '../maic/maic-admin.service';
import { ensureIdentity, applySignupReferral, REFERRER_BONUS } from '../common/identity';

/** Minimal shape of a Multer-parsed upload (avoids needing @types/multer). */
export interface UploadedImageFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const ALLOWED_AVATAR_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const MAX_AVATAR_BYTES = 3 * 1024 * 1024; // 3 MB

@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly maicAdmin: MaicAdminService,
  ) {}

  /** `YYYY-MM-DD` for a date, in UTC, to bucket builds by calendar day. */
  private dayKey(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  async overview(user: AuthUser): Promise<MeOverview> {
    const ownerId = user.id;
    const account = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { createdAt: true },
    });
    if (!account) throw new NotFoundException('Không tìm thấy người dùng');

    const [aiRuns, remoteTasks, artifacts, skills, scheduledTasks, reports] = await Promise.all([
      this.prisma.maicUsage.count({ where: { userId: ownerId } }),
      this.prisma.remoteTask.count({ where: { userId: ownerId } }),
      this.prisma.artifact.count({ where: { userId: ownerId } }),
      this.prisma.skill.count({ where: { userId: ownerId } }),
      this.prisma.scheduledTask.count({ where: { userId: ownerId } }),
      this.prisma.feedback.count({ where: { userId: ownerId } }),
    ]);

    return {
      aiRuns,
      remoteTasks,
      artifacts,
      skills,
      scheduledTasks,
      reports,
      joinedAt: account.createdAt.toISOString(),
    };
  }

  /** Contribution graph: one count per day of AI activity (hosted AI runs + desktop remote tasks). */
  async activity(user: AuthUser, days: number): Promise<MeActivity> {
    const ownerId = user.id;

    // Window spans `days` calendar days ending today (UTC), inclusive.
    const todayKey = this.dayKey(new Date());
    const start = new Date(`${todayKey}T00:00:00.000Z`);
    start.setUTCDate(start.getUTCDate() - (days - 1));

    const [runs, tasks] = await Promise.all([
      this.prisma.maicUsage.findMany({
        where: { userId: ownerId, createdAt: { gte: start } },
        select: { createdAt: true },
      }),
      this.prisma.remoteTask.findMany({
        where: { userId: ownerId, createdAt: { gte: start } },
        select: { createdAt: true },
      }),
    ]);

    // Bucket counts by UTC calendar day.
    const counts = new Map<string, number>();
    for (const b of [...runs, ...tasks]) {
      const key = this.dayKey(b.createdAt);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    // Emit one entry per day across the whole window (zeros filled), ascending.
    const result: ActivityDay[] = [];
    let total = 0;
    let longestStreak = 0;
    let run = 0;
    const cursor = new Date(start);
    for (let i = 0; i < days; i++) {
      const key = this.dayKey(cursor);
      const count = counts.get(key) ?? 0;
      result.push({ date: key, count });
      total += count;
      if (count > 0) {
        run += 1;
        if (run > longestStreak) longestStreak = run;
      } else {
        run = 0;
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    // Current streak = consecutive days with count > 0 ending today.
    let currentStreak = 0;
    for (let i = result.length - 1; i >= 0; i--) {
      if (result[i].count > 0) currentStreak += 1;
      else break;
    }

    return { total, currentStreak, longestStreak, days: result };
  }

  /** `GET /v1/me/subscription` — current plan, monthly usage (%) & catalog. */
  async subscription(user: AuthUser): Promise<MeSubscription> {
    const account = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        plan: true,
        quotaUsed: true,
        quotaResetAt: true,
        quotaWindowAt: true,
      },
    });
    if (!account) throw new NotFoundException('Không tìm thấy người dùng');

    const unlimited = user.role === 'admin';

    // monthlyTokens/price come from the runtime-editable billing config
    // (merged over plans.ts defaults); label/features stay from plans.ts.
    const plan = await this.billing.getPlan(account.plan);
    const [catalog, freePlanEnabled, discount] = await Promise.all([
      this.billing.getCatalog(),
      this.billing.isFreePlanEnabled(),
      this.billing.getDiscount(),
    ]);

    // Reflect a rolled-over window as 0 used, without persisting (the lazy reset
    // happens on the next metered run). `quotaUsed` holds TOKENS used this month.
    const expired =
      !account.quotaResetAt || account.quotaResetAt.getTime() <= Date.now();
    const tokensLimit = plan.monthlyTokens;
    const tokensUsed = unlimited
      ? await this.unlimitedTokensUsed(user.id, account.quotaWindowAt, expired)
      : expired
        ? 0
        : account.quotaUsed;
    // Không giới hạn thì phần trăm vô nghĩa (không có mẫu số) — nhưng SỐ ĐÃ DÙNG ở trên vẫn thật.
    const percentUsed = unlimited ? 0 : usagePercent(tokensUsed, tokensLimit);

    // Prorated upgrade quotes (mirror PaymentsService.create) so /pricing shows the
    // reduced cost to move up mid-cycle. Only while on an active PAID plan.
    const upgrade: Record<string, UpgradeQuote> = {};
    const curRank = planRank(account.plan);
    if (!expired && !unlimited && curRank >= planRank('starter')) {
      const now = new Date();
      const curPrice = await this.billing.getEffectivePriceVnd(plan.id);
      for (const entry of catalog) {
        if (entry.id === 'free' || planRank(entry.id) <= curRank) continue;
        const fullPrice = await this.billing.getEffectivePriceVnd(entry.id);
        const q = computeUpgradeAmount({
          fullPrice,
          curPrice,
          quotaResetAt: account.quotaResetAt ?? null,
          quotaWindowAt: account.quotaWindowAt ?? null,
          now,
        });
        if (q.prorated) {
          upgrade[entry.id] = { amountVnd: q.amountVnd, fullVnd: q.fullVnd, savingVnd: q.savingVnd };
        }
      }
    }

    return {
      plan: plan.id,
      planLabel: plan.label,
      percentUsed,
      tokensUsed,
      tokensLimit,
      resetAt: account.quotaResetAt ? account.quotaResetAt.toISOString() : null,
      unlimited,
      freePlanEnabled,
      discount,
      catalog,
      upgrade,
    };
  }

  /**
   * Mức dùng THẬT của một tài khoản không giới hạn (admin).
   *
   * Admin không bao giờ được cộng vào `User.quotaUsed`: `meterMaic` chỉ ghi bảng kiểm toán rồi
   * dừng. Đọc `quotaUsed` cho admin vì thế LUÔN ra 0 — màn hình sẽ báo "chưa dùng gì" trong khi
   * thực tế đã chạy rất nhiều. Cộng lại từ chính sổ MaicUsage đã ghi thật đó.
   *
   * Cửa sổ: giữ cửa sổ đang mở nếu còn hạn, không thì lấy tròn một tháng đổ lại — cùng bước nhảy
   * `nextMonthStart` của người dùng thường, để hai con số còn so được với nhau.
   *
   * Chỉ để HIỂN THỊ: không cổng nào chặn theo số này (`unlimited` vẫn là true).
   */
  private async unlimitedTokensUsed(
    userId: string,
    windowAt: Date | null,
    expired: boolean,
  ): Promise<number> {
    const now = new Date();
    const since =
      !expired && windowAt
        ? windowAt
        : new Date(
            Date.UTC(
              now.getUTCFullYear(),
              now.getUTCMonth() - 1,
              now.getUTCDate(),
              now.getUTCHours(),
              now.getUTCMinutes(),
              now.getUTCSeconds(),
            ),
          );

    const maic = await this.prisma.maicUsage.aggregate({
      _sum: { tokens: true },
      where: { userId, createdAt: { gte: since } },
    });
    return maic._sum.tokens ?? 0;
  }

  /**
   * `POST /v1/me/plan` — set a plan. STUB: no payment yet. Admins may set any
   * user's plan (via `targetUserId`); a regular user may only change their own.
   */
  async setPlan(
    user: AuthUser,
    plan: PlanId,
    targetUserId?: string,
  ): Promise<MeSubscription> {
    const isAdmin = user.role === 'admin';
    if (targetUserId && targetUserId !== user.id && !isAdmin) {
      throw new ForbiddenException('Chỉ admin mới đổi gói của người dùng khác');
    }
    // SECURITY: a non-admin may DOWNGRADE freely (to free, or to a LOWER paid tier
    // they no longer want — they already paid for the higher one). But UPGRADING to
    // a higher/same paid tier MUST go through a settled payment (PaymentsService) —
    // else anyone could POST /me/plan and grant themselves a paid plan for free.
    if (!isAdmin) {
      const target = await this.billing.getPlan(normalizePlanId(plan));
      if ((target?.priceVnd ?? 0) > 0) {
        const me = await this.prisma.user.findUnique({
          where: { id: user.id },
          select: { plan: true },
        });
        if (planRank(plan) >= planRank(me?.plan)) {
          throw new ForbiddenException(
            'Nâng gói trả phí phải kích hoạt qua thanh toán — chỉ có thể tự HẠ gói.',
          );
        }
      }
    }
    const userId = targetUserId ?? user.id;
    const exists = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!exists) throw new NotFoundException('Không tìm thấy người dùng');

    await this.prisma.user.update({
      where: { id: userId },
      data: { plan: normalizePlanId(plan) },
    });
    // Gói vừa đổi → đẩy trần mới sang MAIC. Không await và nuốt lỗi: MAIC sập
    // không được phép làm hỏng một giao dịch đã thu tiền.
    void this.maicAdmin.syncUser(userId);

    // Return the (possibly other user's) updated subscription view.
    return this.subscription(
      userId === user.id ? user : { id: userId, email: '', role: 'user' },
    );
  }

  // ── Self profile editing ─────────────────────────────────────────────────────

  /** Re-read the current user and map to the public User shape (id..avatarUrl). */
  private async currentUser(userId: string): Promise<User> {
    const account = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!account) throw new NotFoundException('Không tìm thấy người dùng');
    return toUser(account);
  }

  /** `PATCH /v1/me/profile` — update the current user's display name + privacy. */
  async updateProfile(user: AuthUser, name?: string, discoverable?: boolean): Promise<User> {
    const data: { name?: string; discoverable?: boolean } = {};
    if (name !== undefined) data.name = name.trim();
    if (discoverable !== undefined) data.discoverable = discoverable;

    const updated = Object.keys(data).length
      ? await this.prisma.user.update({ where: { id: user.id }, data })
      : await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    await this.audit.log(user.id, user.email, 'profile.update', user.id, { ...data });
    return toUser(updated);
  }

  /**
   * `POST /v1/me/avatar` — persist an uploaded image to the uploads dir and set
   * the current user's avatarUrl to the served public URL.
   */
  async updateAvatarFromUpload(user: AuthUser, file?: UploadedImageFile): Promise<User> {
    if (!file) throw new BadRequestException('Thiếu tệp ảnh (trường "file")');

    const ext = ALLOWED_AVATAR_MIME[file.mimetype];
    if (!ext) {
      throw new BadRequestException('Ảnh phải là PNG, JPEG, WEBP hoặc GIF');
    }
    if (file.size > MAX_AVATAR_BYTES) {
      throw new BadRequestException('Ảnh tối đa 3MB');
    }

    const dir = join(this.config.uploadsDir, 'avatars');
    await fs.mkdir(dir, { recursive: true });

    const filename = `${user.id}-${Date.now()}.${ext}`;
    await fs.writeFile(join(dir, filename), file.buffer);

    const avatarUrl = `${this.config.publicApiUrl}/uploads/avatars/${filename}`;
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl },
    });

    await this.audit.log(user.id, user.email, 'avatar.update', user.id, { avatarUrl });
    return toUser(updated);
  }

  /** `PATCH /v1/me/avatar` — set a direct avatar URL (e.g. revert to Google). */
  async updateAvatarUrl(user: AuthUser, avatarUrl: string): Promise<User> {
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl },
    });
    await this.audit.log(user.id, user.email, 'avatar.update', user.id, { avatarUrl });
    return toUser(updated);
  }

  // ── Change password (OTP) ────────────────────────────────────────────────────

  /**
   * `POST /v1/me/password/request-code` — email the current user a 6-digit OTP
   * (60s cooldown). Returns the masked email the code was sent to.
   */
  async requestPasswordCode(user: AuthUser): Promise<{ ok: true; sentTo: string }> {
    return this.auth.requestChangePasswordCode(user.id, user.email);
  }

  /**
   * `POST /v1/me/password` — verify the emailed 6-digit OTP and set the new
   * password (same attempts/expiry rules as the public reset flow).
   */
  async changePassword(user: AuthUser, code: string, newPassword: string): Promise<{ ok: true }> {
    return this.auth.changePassword(user.id, user.email, code, newPassword);
  }

  // ── Referral ────────────────────────────────────────────────────────────
  /** This user's referral code/link + how many people they've referred. */
  async referral(
    user: AuthUser,
  ): Promise<{ code: string; link: string; referrals: number; rewardPerReferral: number }> {
    await ensureIdentity(this.prisma, user.id);
    const u = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { referralCode: true, _count: { select: { referrals: true } } },
    });
    const code = u?.referralCode ?? user.id;
    return {
      code,
      link: `${this.config.env.WEB_PUBLIC_URL}/?ref=${code}`,
      referrals: u?._count.referrals ?? 0,
      rewardPerReferral: REFERRER_BONUS,
    };
  }

  /** Capture a referral after signup (OAuth or email). Guarded: only on a fresh,
   *  not-yet-referred account so it can't be replayed to farm credits. */
  async captureReferral(user: AuthUser, ref: string): Promise<{ applied: boolean }> {
    const u = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { referredById: true, createdAt: true },
    });
    if (!u || u.referredById) return { applied: false };
    if (Date.now() - u.createdAt.getTime() > 30 * 60_000) return { applied: false };
    await applySignupReferral(this.prisma, user.id, ref);
    const after = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { referredById: true },
    });
    return { applied: !!after?.referredById };
  }
}
