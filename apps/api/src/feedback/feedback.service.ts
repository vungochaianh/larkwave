import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Feedback as PFeedback, User as PUser } from '@prisma/client';
import type {
  AdminUpdateFeedbackRequest,
  Feedback,
  FeedbackAttachment,
  FeedbackSeverity,
  FeedbackSimilar,
  FeedbackStatus,
  MyFeedbackResponse,
  Paginated,
  SubmitFeedbackRequest,
  UploadContent,
} from '@larkwave/shared';
import { SEVERITY_POINTS } from '@larkwave/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AnthropicService } from '../ai-keys/anthropic.service';
import { MaicService } from '../maic/maic.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { AuthUser } from '../common/auth-user';

type WithUser = PFeedback & { user?: Pick<PUser, 'id' | 'email' | 'name'> | null };

const VALID_STATUS: FeedbackStatus[] = ['open', 'resolved', 'duplicate', 'rejected'];
const VALID_SEVERITY: FeedbackSeverity[] = ['low', 'medium', 'high', 'critical'];

@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly anthropic: AnthropicService,
    private readonly notifications: NotificationsService,
    private readonly maic: MaicService,
  ) {}

  private toDto(f: WithUser): Feedback {
    return {
      id: f.id,
      message: f.message,
      url: f.url ?? null,
      context: (f.context as Feedback['context']) ?? null,
      attachments: Array.isArray(f.attachments)
        ? (f.attachments as unknown as FeedbackAttachment[])
        : [],
      status: (VALID_STATUS.includes(f.status as FeedbackStatus)
        ? f.status
        : 'open') as FeedbackStatus,
      severity:
        f.severity && VALID_SEVERITY.includes(f.severity as FeedbackSeverity)
          ? (f.severity as FeedbackSeverity)
          : null,
      points: f.points ?? 0,
      rewardVnd: f.rewardVnd ?? 0,
      rewardPaid: !!f.rewardPaid,
      rewardPaidAt: f.rewardPaidAt ? f.rewardPaidAt.toISOString() : null,
      duplicateOfId: f.duplicateOfId ?? null,
      adminNote: f.adminNote ?? null,
      resolvedAt: f.resolvedAt ? f.resolvedAt.toISOString() : null,
      createdAt: f.createdAt.toISOString(),
      ...(f.user
        ? { user: { id: f.user.id, email: f.user.email, name: f.user.name } }
        : {}),
    };
  }

  /** Resolve attachment ids the user actually OWNS into stored metadata. */
  private async resolveAttachments(
    ownerId: string,
    ids: string[],
  ): Promise<FeedbackAttachment[]> {
    const clean = [...new Set((ids ?? []).filter(Boolean))].slice(0, 8);
    if (!clean.length) return [];
    const rows = await this.prisma.upload.findMany({
      where: { id: { in: clean }, ownerId },
      select: { id: true, name: true, kind: true, mime: true, size: true },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind as FeedbackAttachment['kind'],
      mime: r.mime,
      size: r.size,
    }));
  }

  /** A user submits an in-app bug/error report (page URL + logs + attachments). */
  async submit(user: AuthUser, dto: SubmitFeedbackRequest): Promise<Feedback> {
    const message = String(dto?.message ?? '').trim().slice(0, 4000);
    if (!message) throw new BadRequestException('Vui lòng mô tả lỗi bạn gặp.');
    const context = dto.context
      ? {
          userAgent: String(dto.context.userAgent ?? '').slice(0, 400),
          logs: (dto.context.logs ?? []).slice(-30).map((l) => String(l).slice(0, 1000)),
        }
      : undefined;
    const attachments = await this.resolveAttachments(user.id, dto.attachmentIds ?? []);
    const f = await this.prisma.feedback.create({
      data: {
        userId: user.id,
        message,
        url: dto.url ? String(dto.url).slice(0, 1000) : null,
        ...(context ? { context: context as unknown as object } : {}),
        ...(attachments.length
          ? { attachments: attachments as unknown as object }
          : {}),
      },
    });
    return this.toDto(f);
  }

  /** A user's own reports + their tester scoreboard. */
  async mine(user: AuthUser): Promise<MyFeedbackResponse> {
    // Lifetime totals are computed with DB aggregates over ALL rows (not capped
    // by the 200-row display window). Duplicate/rejected rows are forced to 0
    // points + 0 reward on write, so summing every row is correct.
    const [rows, agg, paidAgg, resolvedCount, totalReports] = await Promise.all([
      this.prisma.feedback.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.feedback.aggregate({
        where: { userId: user.id },
        _sum: { points: true, rewardVnd: true },
      }),
      this.prisma.feedback.aggregate({
        where: { userId: user.id, rewardPaid: true },
        _sum: { rewardVnd: true },
      }),
      this.prisma.feedback.count({ where: { userId: user.id, status: 'resolved' } }),
      // Tester "danh hiệu" counts valid (non-rejected) reports.
      this.prisma.feedback.count({ where: { userId: user.id, status: { not: 'rejected' } } }),
    ]);
    return {
      items: rows.map((r) => this.toDto(r)),
      totalPoints: agg._sum.points ?? 0,
      totalRewardVnd: agg._sum.rewardVnd ?? 0,
      paidRewardVnd: paidAgg._sum.rewardVnd ?? 0,
      resolvedCount,
      totalReports,
    };
  }

  /** Admin one-click: resolve ALL currently-open reports. */
  async resolveAllOpen(): Promise<{ count: number }> {
    const r = await this.prisma.feedback.updateMany({
      where: { status: 'open' },
      data: { status: 'resolved', resolvedAt: new Date() },
    });
    return { count: r.count };
  }

  async adminList(
    status: string | undefined,
    page: number,
    pageSize: number,
  ): Promise<Paginated<Feedback>> {
    const where = VALID_STATUS.includes(status as FeedbackStatus) ? { status } : {};
    const [rows, total] = await Promise.all([
      this.prisma.feedback.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { id: true, email: true, name: true } } },
      }),
      this.prisma.feedback.count({ where }),
    ]);
    return { items: rows.map((r) => this.toDto(r)), total, page, pageSize };
  }

  /** All matching reports (no pagination) for CSV export. Capped for safety. */
  async exportAll(status: string | undefined): Promise<Feedback[]> {
    const where = VALID_STATUS.includes(status as FeedbackStatus) ? { status } : {};
    const rows = await this.prisma.feedback.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 5000,
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    return rows.map((r) => this.toDto(r));
  }

  /** Admin triage: severity/points/reward/status/duplicate/note in one call. */
  async adminUpdate(id: string, dto: AdminUpdateFeedbackRequest): Promise<Feedback> {
    const exists = await this.prisma.feedback.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Không tìm thấy báo cáo');

    const data: Prisma.FeedbackUncheckedUpdateInput = {};
    // Track the resulting status so the credit guard below can zero points/reward
    // for duplicate/rejected rows regardless of the order fields arrive in.
    let effStatus: string = exists.status;
    const existingSeverity =
      exists.severity && VALID_SEVERITY.includes(exists.severity as FeedbackSeverity)
        ? (exists.severity as FeedbackSeverity)
        : null;

    if (dto.status && VALID_STATUS.includes(dto.status)) {
      data.status = dto.status;
      data.resolvedAt = dto.status === 'resolved' ? new Date() : null;
      effStatus = dto.status;
    }
    if (dto.severity !== undefined) {
      data.severity =
        dto.severity && VALID_SEVERITY.includes(dto.severity) ? dto.severity : null;
    }
    if (dto.points !== undefined) {
      data.points = Math.max(0, Math.min(100000, Math.round(Number(dto.points) || 0)));
    }
    if (dto.rewardVnd !== undefined) {
      data.rewardVnd = Math.max(0, Math.round(Number(dto.rewardVnd) || 0));
    }
    if (dto.rewardPaid !== undefined) {
      data.rewardPaid = !!dto.rewardPaid;
      data.rewardPaidAt = dto.rewardPaid ? new Date() : null;
    }
    if (dto.adminNote !== undefined) data.adminNote = String(dto.adminNote).slice(0, 4000);
    if (dto.duplicateOfId !== undefined) {
      if (dto.duplicateOfId) {
        if (dto.duplicateOfId === id) {
          throw new BadRequestException('Không thể đánh dấu trùng với chính nó.');
        }
        const canonical = await this.prisma.feedback.findUnique({
          where: { id: dto.duplicateOfId },
        });
        if (!canonical) throw new BadRequestException('Báo cáo gốc không tồn tại.');
        // Credit stays with the FIRST reporter (canonical); this one earns 0 (guard below).
        data.duplicateOfId = dto.duplicateOfId;
        data.status = 'duplicate';
        effStatus = 'duplicate';
      } else {
        data.duplicateOfId = null;
        // Returning from duplicate → re-open and restore the severity-suggested
        // credit (marking duplicate zeroed it), so the fix isn't destructive.
        if (exists.status === 'duplicate') {
          if (!dto.status) {
            data.status = 'open';
            data.resolvedAt = null;
            effStatus = 'open';
          }
          if (existingSeverity) data.points = SEVERITY_POINTS[existingSeverity];
        }
      }
    }

    // Credit guard: duplicate + rejected reports earn nothing (matches the schema
    // contract + keeps the scoreboard honest). Wins over any explicit points/reward.
    if (effStatus === 'duplicate' || effStatus === 'rejected') {
      data.points = 0;
      data.rewardVnd = 0;
    }

    const f = await this.prisma.feedback.update({
      where: { id },
      data,
      include: { user: { select: { id: true, email: true, name: true } } },
    });

    // Notify the reporter on ANY admin response: a triage (status change), a
    // reward payout, OR an admin note/message (the admin replying on the report).
    const statusChanged = dto.status && dto.status !== exists.status;
    const newlyPaid = dto.rewardPaid === true && !exists.rewardPaid;
    const noteChanged =
      dto.adminNote !== undefined && String(dto.adminNote) !== (exists.adminNote ?? '');
    if (statusChanged || newlyPaid || noteChanged) {
      const note = (f.adminNote ?? '').trim();
      const title = newlyPaid
        ? 'Bạn đã được thưởng cho báo lỗi 🎉'
        : f.status === 'resolved'
          ? 'Báo lỗi của bạn đã được xử lý ✓'
          : f.status === 'rejected'
            ? 'Báo lỗi của bạn bị từ chối'
            : noteChanged && !statusChanged
              ? 'Admin đã phản hồi báo lỗi của bạn 💬'
              : 'Báo lỗi của bạn đã được cập nhật';
      const credit =
        (f.points ? `+${f.points} điểm` : '') +
        (f.rewardVnd ? `${f.points ? ' · ' : ''}${f.rewardVnd.toLocaleString('vi-VN')}đ` : '');
      // Prefer the admin's actual message as the body; else the credit; else the report text.
      const body = note
        ? note.length > 90
          ? note.slice(0, 90) + '…'
          : note
        : credit || (f.message.length > 60 ? f.message.slice(0, 60) + '…' : f.message);
      void this.notifications.notify(f.userId, 'feedback', title, body, '/reports');
    }
    return this.toDto(f);
  }

  /**
   * AI-assisted duplicate detection: ask Claude which recent OTHER reports
   * describe the same bug as `id`. Returns ranked candidates (score ≥ 60).
   */
  async findSimilar(id: string): Promise<FeedbackSimilar[]> {
    const target = await this.prisma.feedback.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('Không tìm thấy báo cáo');

    const candidates = await this.prisma.feedback.findMany({
      where: { id: { not: id }, duplicateOfId: null },
      orderBy: { createdAt: 'desc' },
      take: 60,
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    if (!candidates.length) return [];

    const list = candidates
      .map(
        (c, i) =>
          `[${i}] (${c.url ?? '-'}) ${c.message.slice(0, 300).replace(/\s+/g, ' ')}`,
      )
      .join('\n');
    const prompt =
      `Báo cáo lỗi GỐC cần tìm trùng:\n"""${target.message.slice(0, 600)}"""\n` +
      `Trang: ${target.url ?? '-'}\n\n` +
      `DANH SÁCH báo cáo khác (mỗi dòng: [chỉ số] (trang) nội dung):\n${list}\n\n` +
      `Tìm các báo cáo trong DANH SÁCH mô tả CÙNG MỘT lỗi với báo cáo GỐC. ` +
      `Chỉ trả về JSON array, mỗi phần tử {"i": <chỉ số>, "score": <0-100>, "reason": "<ngắn gọn tiếng Việt>"}. ` +
      `Chỉ gồm phần tử score>=60. Nếu không có, trả []. KHÔNG kèm văn bản nào khác.`;

    let parsed: { i: number; score: number; reason: string }[] = [];
    try {
      // MAIC-only: classify via the hosted gateway, fallback to Anthropic.
      let text: string;
      if (this.maic.enabled) {
        const res = await this.maic.ask({
          prompt,
          systemPrompt: 'Bạn là trợ lý phân loại lỗi. Chỉ trả JSON hợp lệ, không markdown.',
          effort: 'low',
        });
        text = res.answer;
      } else {
        ({ text } = await this.anthropic.complete(prompt, {
          system: 'Bạn là trợ lý phân loại lỗi. Chỉ trả JSON hợp lệ, không markdown.',
          maxTokens: 800,
          model: 'claude-sonnet-4-6',
        }));
      }
      const start = text.indexOf('[');
      const end = text.lastIndexOf(']');
      if (start === -1 || end === -1) return [];
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
      return [];
    }

    const out: FeedbackSimilar[] = [];
    for (const p of parsed) {
      const c = candidates[p?.i];
      if (!c || typeof p.score !== 'number' || p.score < 60) continue;
      out.push({
        id: c.id,
        message: c.message,
        status: (VALID_STATUS.includes(c.status as FeedbackStatus)
          ? c.status
          : 'open') as FeedbackStatus,
        createdAt: c.createdAt.toISOString(),
        ...(c.user
          ? { user: { id: c.user.id, email: c.user.email, name: c.user.name } }
          : {}),
        score: Math.round(p.score),
        reason: String(p.reason ?? '').slice(0, 200),
      });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 8);
  }

  /**
   * Fetch one attachment's full content. Admins may view any; a non-admin may
   * only view attachments on their OWN report (`ownerId` enforced).
   */
  async getAttachment(
    feedbackId: string,
    uploadId: string,
    ownerId?: string,
  ): Promise<UploadContent> {
    const f = await this.prisma.feedback.findUnique({
      where: { id: feedbackId },
      select: { userId: true, attachments: true },
    });
    if (!f) throw new NotFoundException('Không tìm thấy báo cáo');
    if (ownerId && f.userId !== ownerId) {
      throw new NotFoundException('Không có quyền xem tệp này.');
    }
    const atts = Array.isArray(f.attachments)
      ? (f.attachments as unknown as FeedbackAttachment[])
      : [];
    if (!atts.some((a) => a.id === uploadId)) {
      throw new NotFoundException('Tệp không thuộc báo cáo này.');
    }
    const row = await this.prisma.upload.findUnique({
      where: { id: uploadId },
      select: { id: true, name: true, kind: true, mime: true, size: true, data: true },
    });
    if (!row) throw new NotFoundException('Không tìm thấy tệp.');
    return {
      id: row.id,
      name: row.name,
      kind: row.kind as 'image' | 'text' | 'pdf',
      mime: row.mime,
      size: row.size,
      data: row.data,
    };
  }
}
