import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface HistorySnapshot {
  projectId: string;
  userId: string;
  kind: string;
  instruction: string;
  title: string;
  caption: string;
  mediaUrl: string;
  thumbnailUrl?: string;
  extra?: string; // script (video) / html (picture) / body (blog)
  durationSec?: number;
}

/**
 * Version/commit history for Marketing items — one 'create' entry then a 'fix'/'redo' per refine,
 * each snapshotting the result so the user can see the timeline and view/restore any version.
 * @Global via MediaModule so all three tool services can inject it.
 */
@Injectable()
export class MarketingHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  /** 'create' for the first version, else 'fix' (has a prompt) or 'redo' (plain regenerate). */
  private async nextAction(projectId: string, instruction: string): Promise<string> {
    const count = await this.prisma.marketingEdit.count({ where: { projectId } });
    return count === 0 ? 'create' : instruction ? 'fix' : 'redo';
  }

  /** Append a version snapshot (best-effort — never breaks the render on failure). */
  async record(snap: HistorySnapshot): Promise<void> {
    try {
      const action = await this.nextAction(snap.projectId, snap.instruction);
      await this.prisma.marketingEdit.create({
        data: {
          projectId: snap.projectId,
          userId: snap.userId,
          kind: snap.kind,
          action,
          instruction: (snap.instruction || '').slice(0, 4000),
          title: snap.title.slice(0, 200),
          caption: (snap.caption || '').slice(0, 4000),
          mediaUrl: snap.mediaUrl || '',
          thumbnailUrl: snap.thumbnailUrl || '',
          extra: (snap.extra || '').slice(0, 40000),
          durationSec: snap.durationSec || 0,
        },
      });
    } catch {
      /* history is best-effort */
    }
  }

  list(userId: string, kind: string, projectId: string) {
    return this.prisma.marketingEdit.findMany({
      where: { projectId, userId, kind },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
  }

  get(userId: string, editId: string) {
    return this.prisma.marketingEdit.findFirst({ where: { id: editId, userId } });
  }

  async deleteForProject(projectId: string): Promise<void> {
    await this.prisma.marketingEdit.deleteMany({ where: { projectId } }).catch(() => undefined);
  }
}
