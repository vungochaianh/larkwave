import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toAudit } from '../common/mappers';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Best-effort audit write — never throws into the caller's path. */
  async log(
    actorId: string | null,
    actorEmail: string | null,
    action: string,
    target?: string | null,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          actorEmail,
          action,
          target: target ?? null,
          meta: (meta as object) ?? undefined,
        },
      });
    } catch (err) {
      this.logger.warn(`audit write failed: ${String(err)}`);
    }
  }

  async list(skip: number, take: number) {
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.auditLog.count(),
    ]);
    return { items: items.map(toAudit), total };
  }
}
