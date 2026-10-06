import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AdminMessageUserResult, ImpersonateResponse, Paginated, User } from '@larkwave/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../common/auth-user';
import { toUser } from '../common/mappers';
import { normalizePlanId, PLANS } from '../billing/plans';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { AppConfigService } from '../config/app-config.service';
import { MaicAdminService } from '../maic/maic-admin.service';
import { CreateUserDto, MessageUserDto, SetUserPlanDto, UpdateUserDto, UserQueryDto } from './users.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly notifications: NotificationsService,
    private readonly maicAdmin: MaicAdminService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Admin impersonation: mint a login token for `id` so an admin can open that
   * user's builder session (app.toolswave.net) to inspect their conversations /
   * builds and diagnose failures. Admin-only (controller @Roles) + audited.
   */
  async impersonate(actor: AuthUser, id: string): Promise<ImpersonateResponse> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('Không tìm thấy người dùng');
    // Mirror the login paths: never mint a live session for a locked account
    // (impersonation would otherwise bypass the suspension gate). Unsuspend first.
    if (target.status === 'suspended') {
      throw new ForbiddenException(
        'Tài khoản đang bị khoá — bỏ khoá trước khi vào tài khoản.',
      );
    }
    const { token, user } = await this.auth.signFor(target, actor.id);
    await this.audit.log(actor.id, actor.email, 'user.impersonate', id, {
      targetEmail: target.email,
    });
    return { token, user };
  }

  /**
   * Admin support drill-down summary: lightweight counts across a user's apps / builds /
   * errors / deployments / payments / feedback + last activity — so the per-user support
   * page loads one cheap call. Opening it is the AUDIT ANCHOR ('admin viewed this user'),
   * mirroring impersonate's audit so every look shows up in /admin/audit. Admin-only.
   */
  async supportSummary(
    actor: AuthUser,
    id: string,
  ): Promise<{
    apps: number;
    builds: number;
    failedBuilds: number;
    succeededBuilds: number;
    deployments: number;
    payments: number;
    feedback: number;
    lastActivityAt: string | null;
  }> {
    const target = await this.prisma.user.findUnique({ where: { id }, select: { id: true, email: true } });
    if (!target) throw new NotFoundException('Không tìm thấy người dùng');
    const [apps, builds, failedBuilds, succeededBuilds, deployments, payments, feedback, lastBuild] =
      await Promise.all([
        this.prisma.app.count({ where: { ownerId: id } }),
        this.prisma.build.count({ where: { ownerId: id } }),
        this.prisma.build.count({ where: { ownerId: id, status: 'failed' } }),
        this.prisma.build.count({ where: { ownerId: id, status: 'succeeded' } }),
        this.prisma.deployment.count({ where: { app: { ownerId: id } } }),
        this.prisma.payment.count({ where: { userId: id } }),
        this.prisma.feedback.count({ where: { userId: id } }),
        this.prisma.build.findFirst({
          where: { ownerId: id },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
      ]);
    await this.audit.log(actor.id, actor.email, 'user.support.view', id, { targetEmail: target.email });
    return {
      apps,
      builds,
      failedBuilds,
      succeededBuilds,
      deployments,
      payments,
      feedback,
      lastActivityAt: lastBuild?.createdAt.toISOString() ?? null,
    };
  }

  async list(q: UserQueryDto): Promise<Paginated<User>> {
    const where = {
      ...(q.role ? { role: q.role } : {}),
      ...(q.q
        ? {
            OR: [
              { email: { contains: q.q, mode: 'insensitive' as const } },
              { name: { contains: q.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: q.skip,
        take: q.pageSize,
        include: { _count: { select: { apps: true } } },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items: items.map(toUser), total, page: q.page, pageSize: q.pageSize };
  }

  async get(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { _count: { select: { apps: true } } },
    });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    return toUser(user);
  }

  async create(actor: AuthUser, dto: CreateUserDto): Promise<User> {
    const email = dto.email.toLowerCase().trim();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('Email đã tồn tại');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: { email, passwordHash, name: dto.name?.trim() || email.split('@')[0], role: dto.role ?? 'user' },
    });
    await this.audit.log(actor.id, actor.email, 'user.create', user.id, { email, role: user.role });
    return toUser(user);
  }

  async update(actor: AuthUser, id: string, dto: UpdateUserDto): Promise<User> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('Không tìm thấy người dùng');

    // Guard: never strip the last admin.
    if (target.role === 'admin' && dto.role === 'user') {
      const admins = await this.prisma.user.count({ where: { role: 'admin' } });
      if (admins <= 1) throw new BadRequestException('Không thể hạ quyền admin cuối cùng');
    }

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.update({ where: { id }, data });
    await this.audit.log(actor.id, actor.email, 'user.update', id, { ...dto, password: undefined });
    return toUser(user);
  }

  /**
   * End of an N-month credit cycle (UTC) — same convention as
   * `PaymentsService.nextMonthStart`, just extended to N months: the cycle is
   * GRANT-anchored (a grant on the 28th gets full months, not the stub of the
   * current calendar month) and `Date.UTC` normalizes month overflow without the
   * local-time/DST drift a `getMonth()`-based version would introduce.
   */
  private cycleEnd(from: Date, months: number): Date {
    return new Date(
      Date.UTC(
        from.getUTCFullYear(),
        from.getUTCMonth() + months,
        from.getUTCDate(),
        from.getUTCHours(),
        from.getUTCMinutes(),
        from.getUTCSeconds(),
        0,
      ),
    );
  }

  /**
   * Admin kích hoạt gói cho một người dùng (`POST /v1/users/:id/plan`). Writes the
   * SAME field set a settled payment writes (`PaymentsService.settle`) — plan +
   * a fresh credit window — so a granted plan behaves exactly like a paid one,
   * unlike `POST /v1/me/plan` which only swaps the tier and leaves a burnt
   * `quotaUsed` in place. Admin-only (controller @Roles) + audited.
   */
  async setPlan(actor: AuthUser, id: string, dto: SetUserPlanDto): Promise<User> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('Không tìm thấy người dùng');

    const plan = normalizePlanId(dto.plan);
    const months = dto.months ?? 1;
    const resetQuota = dto.resetQuota ?? true;
    const now = new Date();

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        plan,
        ...(resetQuota ? { quotaUsed: 0 } : {}),
        quotaResetAt: this.cycleEnd(now, months),
        // Monotonic window key (see PaymentsService.settle): bumping it stops a
        // refund for a build charged BEFORE this grant from matching the new window.
        quotaWindowAt: now,
      },
      // Same include as `list()` so the response is the exact shape GET /v1/users
      // returns (incl. appsCount) and the admin table row can be swapped in place.
      include: { _count: { select: { apps: true } } },
    });
    await this.audit.log(actor.id, actor.email, 'user.plan_grant', id, {
      email: target.email,
      from: target.plan,
      to: plan,
      months,
      resetQuota,
    });
    // Gói vừa đổi → đẩy trần mới sang MAIC. Không await: MAIC sập không được phép
    // làm hỏng thao tác cấp gói đã ghi xong vào cơ sở dữ liệu.
    void this.maicAdmin.syncUser(id);
    if (resetQuota) void this.maicAdmin.resetUsage(id);
    // Notify the user they've been GIFTED a plan (paid grants only — a reset to free
    // isn't a gift). Best-effort + live via SSE (notify swallows its own errors).
    if (plan !== 'free') {
      const label = PLANS[plan]?.label ?? plan;
      await this.notifications.notify(
        id,
        'system',
        `🎁 Bạn được tặng gói ${label}`,
        `Larkwave đã kích hoạt gói ${label}${months > 1 ? ` trong ${months} tháng` : ''} cho tài khoản của bạn. Chúc bạn sáng tạo vui vẻ!`,
        '/pricing',
      );
    }
    return toUser(user);
  }

  async remove(actor: AuthUser, id: string): Promise<{ ok: true }> {
    if (id === actor.id) throw new BadRequestException('Không thể tự xoá tài khoản của bạn');
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('Không tìm thấy người dùng');
    if (target.role === 'admin') {
      const admins = await this.prisma.user.count({ where: { role: 'admin' } });
      if (admins <= 1) throw new BadRequestException('Không thể xoá admin cuối cùng');
    }
    await this.prisma.user.delete({ where: { id } });
    await this.audit.log(actor.id, actor.email, 'user.delete', id, { email: target.email });
    return { ok: true };
  }

  /**
   * NHẮN CHO MỘT NGƯỜI DÙNG — thư và/hoặc thông báo trong app, do người vận hành tự soạn.
   *
   * Vì sao cần: nền tảng có người dùng thật nhưng KHÔNG có đường nào nói với họ khi có sự cố.
   * Mọi `notify()` trong kho đều là thông báo tự động (tặng gói, tin nhắn bạn bè), và không có màn nào
   * soạn thư. Đo ngày 24/09/2026: một người dùng mất bốn site vì một lỗi của hệ thống; lỗi đã sửa
   * xong mà không có cách nào báo cho họ, phải đi soạn thư tay ngoài sản phẩm.
   *
   * KẾT QUẢ NÓI ĐÚNG CÁI GÌ ĐÃ TỚI NƠI. Hai kênh hỏng theo hai kiểu và cả hai đều IM:
   * `sendNotice` trả `false` khi SMTP chưa cấu hình hoặc gửi hỏng (không ném), còn `notify` nuốt mọi
   * lỗi của chính nó. Một câu "Đã gửi" chung chung sẽ nói dối đúng vào lúc người vận hành cần biết sự
   * thật nhất — nên chỗ này kiểm lại từng kênh và trả về đúng kết quả.
   */
  async messageUser(
    actor: AuthUser,
    id: string,
    dto: MessageUserDto,
  ): Promise<AdminMessageUserResult> {
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true },
    });
    if (!target) throw new NotFoundException('Không tìm thấy người dùng');

    const emailConfigured = this.mail.isConfigured();
    let emailSent = false;
    if (dto.email && emailConfigured) {
      // ĐỊA CHỈ LẤY TỪ CSDL, không từ thân yêu cầu — xem chú thích của `sendNotice`.
      emailSent = await this.mail.sendNotice(
        target.email,
        dto.subject,
        dto.body,
        dto.link ? { label: 'Mở Larkwave', url: `${this.config.env.WEB_PUBLIC_URL}${dto.link}` } : undefined,
      );
    }

    let notified = false;
    if (dto.inApp) {
      await this.notifications.notify(id, 'system', dto.subject, dto.body, dto.link ?? null);
      // `notify` nuốt lỗi của chính nó nên `await` không cho biết thành hay bại. Hỏi lại CSDL là
      // cách duy nhất để câu trả lời cho người vận hành là một sự thật chứ không phải một giả định.
      const moiNhat = await this.prisma.notification.findFirst({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        select: { title: true },
      });
      notified = moiNhat?.title === dto.subject.slice(0, 200);
    }

    await this.audit.log(actor.id, actor.email, 'user.message', id, {
      email: target.email,
      subject: dto.subject,
      kenh: { email: dto.email, inApp: dto.inApp },
      emailConfigured,
      emailSent,
      notified,
      // Giữ lại NỘI DUNG đã nói với người dùng: một dòng nhật ký chỉ ghi "đã nhắn" thì sau này
      // không ai trả lời được câu "ta đã hứa gì với họ?".
      body: dto.body.slice(0, 2000),
      ...(dto.link ? { link: dto.link } : {}),
    });

    return {
      to: target.email,
      emailConfigured,
      emailSent,
      notified,
      notifiedTruncated: dto.inApp && dto.body.length > 1000,
    };
  }
}
