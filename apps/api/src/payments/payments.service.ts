import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { AdminPayment, CreatePaymentResponse, Paginated, Payment } from '@larkwave/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MaicAdminService } from '../maic/maic-admin.service';
import { AuditService } from '../audit/audit.service';
import { AppConfigService } from '../config/app-config.service';
import { AuthUser } from '../common/auth-user';
import { PLANS, STORAGE_ADDON, normalizePlanId, planRank, resolvePlan } from '../billing/plans';
import { computeUpgradeAmount } from '../billing/proration';
import { BillingService } from '../billing/billing.service';
import { CreatePaymentDto, SepayWebhookBody } from './payments.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { REFERRER_BONUS, rewardReferrerOnce } from '../common/identity';

@Injectable()
export class PaymentsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentsService.name);
  private pollTimer?: ReturnType<typeof setInterval>;
  /** Epoch ms of the last SePay poll — throttles on-demand reconciles. */
  private lastPollAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
    private readonly billing: BillingService,
    private readonly maicAdmin: MaicAdminService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    // When a SePay API token is set, actively poll the transactions API to
    // auto-reconcile payments even if the webhook never fires.
    if (this.config.env.SEPAY_API_TOKEN) {
      this.pollTimer = setInterval(() => {
        this.pollSepay().catch((e) => this.logger.warn(`SePay poll error: ${String(e)}`));
      }, 60_000);
      this.logger.log('SePay polling reconciler enabled (every 60s)');
    }
  }

  onModuleDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  /** `TW` + 6 base36 upper chars (e.g. `TWA1B2C3`). Collision-checked by caller. */
  private randomCode(): string {
    const b = randomBytes(8);
    let s = '';
    for (let i = 0; i < b.length && s.length < 6; i += 1) {
      s += (b[i] % 36).toString(36);
    }
    return 'TW' + s.toUpperCase();
  }

  private async uniqueCode(): Promise<string> {
    for (let i = 0; i < 60; i += 1) {
      const code = this.randomCode();
      // eslint-disable-next-line no-await-in-loop
      const exists = await this.prisma.payment.findUnique({ where: { code } });
      if (!exists) return code;
    }
    // Extremely unlikely; widen with a timestamp suffix as a last resort.
    return ('TW' + randomBytes(8).toString('hex')).slice(0, 14).toUpperCase();
  }

  /** First instant of next month (UTC) — mirrors BuildsService quota convention. */
  /**
   * Credit window end = ONE MONTH from `from` (purchase-anchored), not the start
   * of the next calendar month — a plan bought on the 28th gets a full month.
   */
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

  /** Normalize content/code for matching: uppercase, strip everything but A–Z0–9. */
  private normalize(s: string): string {
    return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  /** `POST /v1/payments/create` — open a pending payment + VietQR details. */
  async create(
    user: AuthUser,
    dto: CreatePaymentDto,
  ): Promise<CreatePaymentResponse> {
    const plan = PLANS[dto.plan];
    if (!plan || plan.id === 'free') {
      throw new ForbiddenException('Gói không hợp lệ hoặc không cần thanh toán');
    }
    // Price comes from the runtime-editable billing config (label from plans.ts).
    // EFFECTIVE price = discounted while a campaign is active, so the user pays
    // (and SePay auto-matches/approves) the discounted amount.
    const fullPrice = await this.billing.getEffectivePriceVnd(plan.id);
    if (fullPrice <= 0) {
      throw new ForbiddenException('Gói không hợp lệ hoặc không cần thanh toán');
    }
    // UPGRADE PRORATION: if the user is on an ACTIVE, LOWER paid plan, charge only
    // the price DIFFERENCE scaled by the time still left in the current cycle
    // (computeUpgradeAmount — the shared formula also quoted on /pricing). The
    // cycle/renewal date is KEPT (settle() detects the upgrade and does NOT reset
    // the window) so the user pays a fair, reduced amount to move up mid-cycle.
    const acct = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { plan: true, quotaResetAt: true, quotaWindowAt: true },
    });
    let amountVnd = fullPrice;
    let prorated = false;
    if (
      planRank(acct?.plan) >= planRank('starter') &&
      planRank(plan.id) > planRank(acct?.plan)
    ) {
      const curPrice = await this.billing.getEffectivePriceVnd(normalizePlanId(acct?.plan));
      const quote = computeUpgradeAmount({
        fullPrice,
        curPrice,
        quotaResetAt: acct?.quotaResetAt ?? null,
        quotaWindowAt: acct?.quotaWindowAt ?? null,
        now: new Date(),
      });
      if (quote.prorated) {
        amountVnd = quote.amountVnd;
        prorated = true;
      }
    }
    const anchorAt = prorated ? (acct?.quotaResetAt ?? null) : null;
    // NOTE: we intentionally do NOT cancel the user's other pending intents here.
    // A superseded/stale intent stays pending so an in-flight bank transfer for it
    // still matches and reaches settle(), where the monotonic + stale-prorated
    // guards either grant correctly or record `payment.grant_skipped` for manual
    // reconciliation — never silently swallowing received money.
    // Reuse the user's existing OPEN intent for this plan+amount instead of
    // minting a fresh row on every click. One stable intent per plan keeps the
    // QR/code consistent and the history clean. A reused row whose anchor is
    // stale (priced against a now-gone cycle) is refreshed below.
    let payment = await this.prisma.payment.findFirst({
      where: { userId: user.id, plan: plan.id, amountVnd, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
    if (payment && (payment.prorated !== prorated || (anchorAt?.getTime() ?? null) !== (payment.cycleAnchorAt?.getTime() ?? null))) {
      payment = await this.prisma.payment.update({
        where: { id: payment.id },
        data: { prorated, cycleAnchorAt: anchorAt },
      });
    }
    if (!payment) {
      const code = await this.uniqueCode();
      payment = await this.prisma.payment.create({
        data: {
          userId: user.id,
          plan: plan.id,
          code,
          amountVnd,
          status: 'pending',
          prorated,
          cycleAnchorAt: anchorAt,
        },
      });
      await this.audit.log(user.id, user.email, 'payment.create', payment.id, {
        plan: plan.id,
        amountVnd,
        code,
        ...(prorated ? { prorated: true, from: acct?.plan } : {}),
      });
    }

    const bin = this.config.env.TW_BANK_BIN;
    const account = this.config.env.TW_BANK_ACCOUNT;
    const holder = this.config.env.TW_BANK_HOLDER;
    const name = this.config.env.TW_BANK_NAME;
    // VietinBank (BIN 970415) only forwards balance-change events to SePay when
    // the transfer memo STARTS WITH the keyword "SEVQR" (SePay's hard requirement
    // for VietinBank). Prepend it so the transfer is actually captured; our TWxxx
    // code stays inside the content, so matching (content.includes(code)) is
    // unaffected. Other banks deliver every transaction, so no prefix is needed.
    const transferContent = bin === '970415' ? `SEVQR ${payment.code}` : payment.code;
    const qrUrl =
      `https://img.vietqr.io/image/${bin}-${account}-compact2.png` +
      `?amount=${amountVnd}&addInfo=${encodeURIComponent(transferContent)}` +
      `&accountName=${encodeURIComponent(holder)}`;

    return {
      paymentId: payment.id,
      code: payment.code,
      transferContent,
      amountVnd,
      plan: plan.id,
      planLabel: plan.label,
      bank: { bin, account, holder, name },
      qrUrl,
    };
  }

  /**
   * `POST /v1/payments/storage` — tạo đơn MUA THÊM DUNG LƯỢNG.
   *
   * Dùng lại nguyên cơ chế mã chuyển khoản + QR của đơn mua gói (SePay khớp theo nội dung + số
   * tiền chính xác), chỉ khác `kind = 'storage'`. Không đụng gì tới gói: người dùng gói Miễn phí
   * cũng mua thêm chỗ được mà không bị coi là "đổi gói".
   */
  async createStorageOrder(user: AuthUser, units: number) {
    const qty = Math.max(1, Math.min(50, Math.trunc(units) || 1));
    const amountVnd = STORAGE_ADDON.priceVndPerMonth * qty;
    const gb = STORAGE_ADDON.gbPerUnit * qty;
    const acct = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { plan: true },
    });
    // Dùng lại đơn CÒN TREO cùng số lượng thay vì đẻ mã mới mỗi lần bấm — giữ QR ổn định và lịch
    // sử sạch, đúng cách đơn mua gói đang làm.
    let payment = await this.prisma.payment.findFirst({
      where: { userId: user.id, kind: 'storage', storageGb: gb, amountVnd, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
    if (!payment) {
      const code = await this.uniqueCode();
      payment = await this.prisma.payment.create({
        data: {
          userId: user.id,
          plan: acct?.plan ?? 'free',
          kind: 'storage',
          storageGb: gb,
          code,
          amountVnd,
          status: 'pending',
        },
      });
      await this.audit.log(user.id, user.email, 'payment.create', payment.id, {
        kind: 'storage',
        storageGb: gb,
        amountVnd,
        code,
      });
    }
    const bin = this.config.env.TW_BANK_BIN;
    const account = this.config.env.TW_BANK_ACCOUNT;
    const holder = this.config.env.TW_BANK_HOLDER;
    const name = this.config.env.TW_BANK_NAME;
    const transferContent = bin === '970415' ? `SEVQR ${payment.code}` : payment.code;
    const qrUrl =
      `https://img.vietqr.io/image/${bin}-${account}-compact2.png` +
      `?amount=${amountVnd}&addInfo=${encodeURIComponent(transferContent)}` +
      `&accountName=${encodeURIComponent(holder)}`;
    return {
      paymentId: payment.id,
      code: payment.code,
      transferContent,
      amountVnd,
      storageGb: gb,
      months: 1,
      bank: { bin, account, holder, name },
      qrUrl,
    };
  }

  /**
   * `POST /v1/payments/sepay/webhook` — PUBLIC. Verifies the `Apikey` header,
   * matches an incoming `transferType==='in'` transfer to a pending payment by
   * memo `code` + exact amount, then activates the plan (idempotent on sepayId).
   */
  async sepayWebhook(
    authHeader: string | undefined,
    body: SepayWebhookBody,
  ): Promise<{ ok: boolean; matched?: boolean }> {
    const expectedKey = this.config.env.SEPAY_WEBHOOK_APIKEY;
    const header = (authHeader ?? '').trim();
    const [scheme, ...rest] = header.split(/\s+/);
    const token = rest.join(' ');
    if (
      !expectedKey ||
      scheme.toLowerCase() !== 'apikey' ||
      token !== expectedKey
    ) {
      throw new UnauthorizedException('Sai webhook API key');
    }

    // Only money coming IN can settle a payment. Acknowledge 200 either way so
    // SePay doesn't retry; reconcileTransaction is idempotent + shared with poll.
    if (body.transferType !== 'in') return { ok: true, matched: false };
    const matched = await this.reconcileTransaction(
      String(body.id),
      Number(body.transferAmount),
      String(body.content ?? ''),
      body.gateway ?? 'sepay-webhook',
    );
    return { ok: true, matched };
  }

  /** Find a pending payment matching the amount whose code is in the content. */
  private async findMatch(rawContent: string, amount: number) {
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const content = this.normalize(rawContent);
    const candidates = await this.prisma.payment.findMany({
      where: { status: 'pending', amountVnd: amount },
      orderBy: { createdAt: 'desc' },
    });
    return candidates.find((p) => content.includes(this.normalize(p.code))) ?? null;
  }

  /**
   * Reconcile one incoming SePay transaction → settle the matching pending
   * payment + activate the plan. Idempotent on `sepayId`; shared by the webhook
   * and the polling reconciler. Returns whether it matched + settled.
   */
  async reconcileTransaction(
    sepayId: string,
    amountIn: number,
    content: string,
    gateway?: string | null,
  ): Promise<boolean> {
    if (sepayId) {
      const seen = await this.prisma.payment.findUnique({ where: { sepayId } });
      if (seen) return false; // already processed this transaction
    }
    const match = await this.findMatch(content, amountIn);
    if (!match) return false;
    const ok = await this.settle(
      // `kind`/`storageGb` phải đi kèm, nếu không đơn mua dung lượng sẽ rơi vào nhánh cấp GÓI.
      { id: match.id, userId: match.userId, plan: match.plan, kind: match.kind, storageGb: match.storageGb },
      { gateway: gateway ?? null, sepayId },
    );
    if (ok) {
      await this.audit.log(null, null, 'payment.paid', match.id, {
        userId: match.userId,
        plan: match.plan,
        amountVnd: match.amountVnd,
        code: match.code,
        sepayId,
        gateway,
      });
    }
    return ok;
  }

  /**
   * `POST /v1/admin/payments/sync` (+ a 60s interval) — poll SePay's transactions
   * API for recent transfers IN and reconcile each against pending payments. A
   * robust fallback for when the webhook doesn't fire. No-op without SEPAY_API_TOKEN.
   */
  async pollSepay(): Promise<{ checked: number; matched: number }> {
    const token = this.config.env.SEPAY_API_TOKEN;
    if (!token) return { checked: 0, matched: 0 };
    this.lastPollAt = Date.now();
    let res: Response;
    try {
      // Latest 50 transfers. Fine for this account's volume; if it ever gets
      // busy enough that 50+ arrive between polls, a since-id cursor would be
      // needed so a transfer can't scroll out of the window unreconciled.
      res = await fetch('https://my.sepay.vn/userapi/transactions/list?limit=50', {
        headers: { authorization: `Bearer ${token}` },
      });
    } catch (err) {
      this.logger.warn(`SePay API unreachable: ${String(err)}`);
      return { checked: 0, matched: 0 };
    }
    if (!res.ok) {
      // Surface the body so 401/403 (bad token) vs other errors are diagnosable.
      const body = await res.text().catch(() => '');
      this.logger.warn(`SePay API ${res.status}: ${body.slice(0, 200)}`);
      return { checked: 0, matched: 0 };
    }
    const data = (await res.json()) as {
      transactions?: { id: number | string; amount_in?: string | number; transaction_content?: string }[];
    };
    const txs = data.transactions ?? [];
    let matched = 0;
    for (const t of txs) {
      const amountIn = Number(t.amount_in ?? 0);
      if (!Number.isFinite(amountIn) || amountIn <= 0) continue;
      // eslint-disable-next-line no-await-in-loop
      const ok = await this.reconcileTransaction(
        String(t.id),
        amountIn,
        String(t.transaction_content ?? ''),
        'sepay-poll',
      );
      if (ok) matched += 1;
    }
    if (matched) this.logger.log(`SePay poll: matched ${matched}/${txs.length}`);
    else this.logger.debug(`SePay poll: 0 matched of ${txs.length} transactions`);
    return { checked: txs.length, matched };
  }

  /** `GET /v1/payments/:id` — owner-or-admin, for client polling. */
  async get(user: AuthUser, id: string): Promise<Payment> {
    let payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException('Không tìm thấy thanh toán');
    if (payment.userId !== user.id && user.role !== 'admin') {
      throw new ForbiddenException('Thanh toán không thuộc về bạn');
    }
    // The /pricing page polls this while the user waits for their transfer to
    // clear — a perfect moment to actively reconcile against SePay so approval
    // lands the instant they return, instead of waiting for the 60s background
    // tick. Throttled so concurrent polls don't hammer the SePay API.
    if (payment.status === 'pending' && this.config.env.SEPAY_API_TOKEN) {
      await this.pollSepayThrottled();
      const fresh = await this.prisma.payment.findUnique({ where: { id } });
      if (fresh) payment = fresh;
    }
    return this.toPayment(payment);
  }

  /** Run a SePay poll at most once every 8s (shared across concurrent callers). */
  private async pollSepayThrottled(): Promise<void> {
    const now = Date.now();
    if (now - this.lastPollAt < 8_000) return;
    this.lastPollAt = now;
    try {
      await this.pollSepay();
    } catch (e) {
      this.logger.warn(`SePay on-demand poll error: ${String(e)}`);
    }
  }

  /**
   * `GET /v1/me/payments` — the user's billing HISTORY: settled (paid)
   * transactions only, newest first. Pending checkout intents (created when
   * opening the QR on /pricing) are not history and are intentionally excluded.
   */
  async listMine(user: AuthUser): Promise<Payment[]> {
    const rows = await this.prisma.payment.findMany({
      where: { userId: user.id, status: 'paid' },
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((p) => this.toPayment(p));
  }

  /** Mark a pending payment paid + activate the user's plan (idempotent). */
  private async settle(
    payment: { id: string; userId: string; plan: string; kind?: string; storageGb?: number },
    opts: { gateway?: string | null; sepayId?: string | null } = {},
  ): Promise<boolean> {
    const now = new Date();
    let settled = false;
    // Set to a reason string when money was received but NO plan grant was applied
    // (out-of-order/stale/superseded intent) → audited after the tx so an admin can
    // reconcile (grant manually or refund). Prevents silent revenue loss / cheating.
    let grantSkipped: string | null = null;
    await this.prisma.$transaction(async (tx) => {
      const claim = await tx.payment.updateMany({
        where: { id: payment.id, status: 'pending' },
        data: {
          status: 'paid',
          paidAt: now,
          gateway: opts.gateway ?? null,
          ...(opts.sepayId ? { sepayId: opts.sepayId } : {}),
        },
      });
      if (claim.count === 0) return; // already settled / claimed elsewhere
      // Read the intent context (prorated + the cycle it was priced against).
      const pay = await tx.payment.findUnique({
        where: { id: payment.id },
        select: { prorated: true, cycleAnchorAt: true },
      });
      // Monotonic plan grant: apply the purchased plan only when it's the same
      // tier (renewal → refresh quota) or higher. A late / out-of-order settle
      // of a lower-tier intent must NOT downgrade an already-higher active plan
      // or wipe its quota — the payment is still recorded as paid for history.
      // ĐƠN MUA DUNG LƯỢNG: không đụng gì tới gói. Cộng thêm chỗ và gia hạn theo THÁNG — nếu
      // phần mua thêm còn hiệu lực thì cộng dồn từ hạn cũ, hết hạn rồi thì tính từ hôm nay.
      // (Không dùng nhánh so-sánh-bậc-gói bên dưới: một đơn dung lượng của người dùng gói Miễn
      // phí sẽ bị coi là "thấp hơn gói hiện tại" và bị bỏ qua, tức mất tiền của họ.)
      if (payment.kind === 'storage') {
        const cur = await tx.user.findUnique({
          where: { id: payment.userId },
          select: { storageBonusMb: true, storageBonusUntil: true },
        });
        const active = !!cur?.storageBonusUntil && cur.storageBonusUntil.getTime() > now.getTime();
        const from = active ? cur!.storageBonusUntil! : now;
        const until = new Date(from);
        until.setMonth(until.getMonth() + 1);
        await tx.user.update({
          where: { id: payment.userId },
          data: {
            storageBonusMb: (active ? (cur?.storageBonusMb ?? 0) : 0) + (payment.storageGb ?? 0) * 1024,
            storageBonusUntil: until,
          },
        });
        settled = true;
        return;
      }
      const u = await tx.user.findUnique({
        where: { id: payment.userId },
        select: { plan: true, quotaResetAt: true, quotaWindowAt: true },
      });
      if (!u || planRank(payment.plan) < planRank(u.plan)) {
        // Lower-tier than the user's current plan (out-of-order / superseded) →
        // money recorded as paid, but applying it would downgrade. Skip + audit.
        grantSkipped = u ? 'lower_tier_than_current' : 'user_missing';
        settled = true;
        return;
      }
      const windowActive = !!u.quotaResetAt && u.quotaResetAt.getTime() > now.getTime();
      if (pay?.prorated) {
        // PRORATED UPGRADE: amountVnd is only the time-scaled price DIFFERENCE, so
        // it's valid ONLY against the exact cycle it was priced for. Re-validate the
        // anchor still matches the live window AND it's still an upgrade — otherwise
        // honoring it would grant a full month for a fraction of the price.
        const anchorOk =
          !!pay.cycleAnchorAt &&
          !!u.quotaResetAt &&
          pay.cycleAnchorAt.getTime() === u.quotaResetAt.getTime();
        if (windowActive && anchorOk && planRank(payment.plan) > planRank(u.plan)) {
          // Valid mid-cycle upgrade → KEEP the cycle, just raise the tier (higher
          // allowance applies for the rest of the window; renewal date unchanged).
          await tx.user.update({
            where: { id: payment.userId },
            data: { plan: payment.plan },
          });
        } else {
          // Stale prorated intent (window changed/lapsed, or no longer an upgrade)
          // → do NOT grant a fresh month for a prorated amount. Skip + audit.
          grantSkipped = 'stale_prorated_intent';
        }
      } else {
        // Full-price renewal (same tier) / new purchase / lapsed-window upgrade →
        // fresh full month at the (possibly higher) tier; they paid the full price.
        await tx.user.update({
          where: { id: payment.userId },
          data: {
            plan: payment.plan,
            quotaUsed: 0,
            quotaResetAt: this.nextMonthStart(now),
            // Bump the monotonic window key so a refund for a build charged BEFORE
            // this renewal won't match the fresh window (avoids over-refunding the
            // new allowance when a renewal lands in the same calendar month).
            quotaWindowAt: now,
          },
        });
      }
      settled = true;
    });
    // Gói vừa đổi → đẩy trần mới sang MAIC. Không await và nuốt lỗi: MAIC sập
    // không được phép làm hỏng một giao dịch đã thu tiền.
    if (settled && !grantSkipped) void this.maicAdmin.syncUser(payment.userId);
    if (settled && !grantSkipped && payment.kind !== 'storage') {
      // Người được giới thiệu vừa trả gói đầu tiên → thưởng người giới thiệu (một lần).
      void rewardReferrerOnce(this.prisma, payment.userId).then((referrerId) => {
        if (!referrerId) return;
        void this.notifications.notify(
          referrerId,
          'system',
          'Bạn nhận credit giới thiệu 🎉',
          `+${REFERRER_BONUS} credit vì người bạn giới thiệu vừa kích hoạt gói trả phí.`,
          '/',
        );
      });
    }
    if (settled && grantSkipped) {
      // Money received but no plan grant applied — surface for manual reconciliation.
      await this.audit
        .log(payment.userId, 'system@sepay', 'payment.grant_skipped', payment.id, {
          plan: payment.plan,
          reason: grantSkipped,
        })
        .catch(() => undefined);
    }
    return settled;
  }

  /** `GET /v1/admin/payments` — all payments (newest first) for reconciliation. */
  async adminList(query: {
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<Paginated<AdminPayment>> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(Math.max(1, query.pageSize ?? 20), 100);
    const where = query.status ? { status: query.status } : {};
    const [rows, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { id: true, email: true, name: true } } },
      }),
      this.prisma.payment.count({ where }),
    ]);
    return { items: rows.map((r) => this.toAdminPayment(r)), total, page, pageSize };
  }

  /**
   * `POST /v1/admin/payments/:id/confirm` — manually confirm a transfer when
   * SePay auto-match didn't fire: marks the payment paid + upgrades the plan.
   */
  async adminConfirm(actor: AuthUser, id: string): Promise<AdminPayment> {
    const p = await this.prisma.payment.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Không tìm thấy thanh toán');
    if (p.status !== 'paid') {
      const ok = await this.settle(
        { id: p.id, userId: p.userId, plan: p.plan, kind: p.kind, storageGb: p.storageGb },
        { gateway: 'admin' },
      );
      if (ok) {
        await this.audit.log(actor.id, actor.email, 'payment.admin_confirm', p.id, {
          userId: p.userId,
          plan: p.plan,
          amountVnd: p.amountVnd,
        });
      }
    }
    const fresh = await this.prisma.payment.findUniqueOrThrow({
      where: { id },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    return this.toAdminPayment(fresh);
  }

  private toAdminPayment(p: {
    id: string;
    plan: string;
    amountVnd: number;
    status: string;
    code: string;
    createdAt: Date;
    paidAt: Date | null;
    userId: string;
    user?: { email: string; name: string | null } | null;
  }): AdminPayment {
    return {
      ...this.toPayment(p),
      userId: p.userId,
      userEmail: p.user?.email ?? '',
      userName: p.user?.name ?? null,
    };
  }

  private toPayment(p: {
    id: string;
    plan: string;
    amountVnd: number;
    status: string;
    code: string;
    createdAt: Date;
    paidAt: Date | null;
  }): Payment {
    const plan = resolvePlan(p.plan);
    return {
      id: p.id,
      plan: plan.id,
      planLabel: plan.label,
      amountVnd: p.amountVnd,
      status: p.status === 'paid' ? 'paid' : 'pending',
      code: p.code,
      createdAt: p.createdAt.toISOString(),
      paidAt: p.paidAt ? p.paidAt.toISOString() : null,
    };
  }
}
