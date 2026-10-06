import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Các loại lỗi runner mà giao diện phân ra. Giữ cố định để /admin lọc + đếm được. */
export const RUNNER_ERROR_KINDS = ['auth', 'credit', 'context', 'overload', 'rate_limit', 'other'] as const;
export type RunnerErrorKind = (typeof RUNNER_ERROR_KINDS)[number];

const KIND_SET = new Set<string>(RUNNER_ERROR_KINDS);

/**
 * Sổ lỗi runner phía người dùng.
 *
 * Vì sao cần: lượt chạy "CLI trên máy" diễn ra 100% trên máy người dùng — máy chủ không hề thấy khi
 * Claude CLI của họ hỏng xác thực hay hết credit. Giao diện (AgentChat/LarkChat) gửi một bản ghi gọn
 * về đây mỗi khi nhận diện một lỗi như vậy, để người vận hành có bảng "lỗi runner gần đây" ở /admin
 * thay vì chỉ biết khi người dùng gửi ảnh.
 */
@Injectable()
export class RunnerTelemetryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ghi một lỗi do giao diện báo về. Chống lụt: bỏ qua nếu vừa có một bản ghi GIỐNG HỆT trong 2 phút
   * (một lỗi stream có thể kích hoạt nhiều lần). Không bao giờ ném ra lỗi làm hỏng phía client.
   */
  async report(
    userId: string,
    dto: { runner?: string; model?: string; kind?: string; message?: string; surface?: string },
  ): Promise<{ ok: boolean }> {
    const kind = KIND_SET.has(String(dto.kind)) ? (dto.kind as RunnerErrorKind) : 'other';
    const runner = (dto.runner || 'claude').slice(0, 40);
    const surface = (dto.surface || 'general').slice(0, 40);
    const model = dto.model ? String(dto.model).slice(0, 80) : null;
    const message = (dto.message || '').slice(0, 1000);

    const since = new Date(Date.now() - 2 * 60_000);
    const dup = await this.prisma.runnerError
      .findFirst({ where: { userId, kind, surface, message, createdAt: { gte: since } }, select: { id: true } })
      .catch(() => null);
    if (dup) return { ok: true };

    await this.prisma.runnerError
      .create({ data: { userId, runner, model, kind, surface, message } })
      .catch(() => undefined);
    return { ok: true };
  }

  /**
   * Bảng cho /admin: danh sách lỗi gần nhất (kèm email người dùng) + tổng quan theo loại + nhóm
   * người gặp nhiều nhất, trong khoảng `days` ngày.
   */
  async listAdmin(opts: { days?: number; kind?: string; q?: string; limit?: number; offset?: number }) {
    const days = Math.min(90, Math.max(1, opts.days || 7));
    const since = new Date(Date.now() - days * 86_400_000);
    const limit = Math.min(200, Math.max(1, opts.limit || 100));
    const offset = Math.max(0, opts.offset || 0);

    const where: Record<string, unknown> = { createdAt: { gte: since } };
    if (opts.kind && KIND_SET.has(opts.kind)) where.kind = opts.kind;
    if (opts.q) {
      const q = opts.q.trim();
      where.OR = [
        { message: { contains: q, mode: 'insensitive' } },
        { user: { email: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [rows, total, byKindRaw, byUserRaw] = await Promise.all([
      this.prisma.runnerError.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        select: {
          id: true,
          runner: true,
          model: true,
          kind: true,
          surface: true,
          message: true,
          createdAt: true,
          user: { select: { id: true, email: true } },
        },
      }),
      this.prisma.runnerError.count({ where }),
      this.prisma.runnerError.groupBy({ by: ['kind'], where, _count: { _all: true } }),
      this.prisma.runnerError.groupBy({
        by: ['userId'],
        where,
        _count: { _all: true },
        orderBy: { _count: { userId: 'desc' } },
        take: 10,
      }),
    ]);

    const byKind = byKindRaw.map((r) => ({ kind: r.kind, count: r._count._all })).sort((a, b) => b.count - a.count);
    const topUserIds = byUserRaw.map((r) => r.userId);
    const emails = topUserIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: topUserIds } }, select: { id: true, email: true } })
      : [];
    const emailBy = new Map(emails.map((u) => [u.id, u.email]));
    const topUsers = byUserRaw.map((r) => ({
      userId: r.userId,
      email: emailBy.get(r.userId) ?? '(?)',
      count: r._count._all,
    }));

    return {
      days,
      total,
      byKind,
      topUsers,
      distinctUsers: topUsers.length, // đủ cho header; chi tiết đã nằm ở topUsers
      items: rows.map((r) => ({
        id: r.id,
        userId: r.user?.id ?? '',
        email: r.user?.email ?? '(?)',
        runner: r.runner,
        model: r.model,
        kind: r.kind,
        surface: r.surface,
        message: r.message,
        createdAt: r.createdAt,
      })),
    };
  }
}
