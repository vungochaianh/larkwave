import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Per-user backup of the desktop Lark × Claude local data (chat sessions + bases +
 * settings). The `data` blob is opaque to the server — the desktop client owns the
 * merge/conflict policy. The Lark app_secret is NEVER stored here (stays local).
 */
/** Nhịp tim trong ngần này được coi là còn sống. */
export const RUNNER_ALIVE_MS = 90_000;

/**
 * Bên xin (`me`) có được quyền chạy lịch không, khi chủ hiện tại là `cur`?
 *
 * Tách thành hàm thuần để bài kiểm gọi ĐÚNG luật này, không phải một bản chép — hai bản rồi trôi
 * lệch là kiểu hỏng lặng lẽ nhất, và ở đây cái giá là bản ghi trùng trong Base thật của khách.
 *
 * Luật: chưa ai giữ hoặc chủ đã im quá lâu ⇒ cho. Chính mình ⇒ cho. VM giành được từ desktop —
 * đó là nơi người dùng CỐ Ý đặt để chạy 24/7. Chiều ngược lại thì KHÔNG, nếu không hai bên sẽ
 * cướp qua cướp lại mỗi nhịp và lịch chạy ở cả hai nơi.
 */
export function canTakeRunner(
  cur: { ownerId: string; ownerKind: string; beatAt: Date | number } | null,
  me: { ownerId: string; ownerKind: 'vm' | 'desktop' },
  nowMs: number,
): boolean {
  if (!cur) return true;
  const beat = cur.beatAt instanceof Date ? cur.beatAt.getTime() : cur.beatAt;
  if (nowMs - beat >= RUNNER_ALIVE_MS) return true;
  if (cur.ownerId === me.ownerId) return true;
  return me.ownerKind === 'vm' && cur.ownerKind !== 'vm';
}

@Injectable()
export class LarkBackupService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<{ data: unknown; updatedAt: string } | null> {
    const row = await this.prisma.larkBackup.findUnique({ where: { userId } });
    if (!row) return null;
    return { data: row.data, updatedAt: row.updatedAt.toISOString() };
  }

  async put(userId: string, data: unknown): Promise<{ updatedAt: string }> {
    // Guard against pathological payloads (full chat histories are small JSON).
    if (data !== undefined && JSON.stringify(data).length > 8 * 1024 * 1024) {
      throw new BadRequestException('Lark backup quá lớn (>8MB).');
    }
    const row = await this.prisma.larkBackup.upsert({
      where: { userId },
      create: { userId, data: (data ?? {}) as object },
      update: { data: (data ?? {}) as object },
    });
    return { updatedAt: row.updatedAt.toISOString() };
  }

  /**
   * Nhịp tim của bên đang chạy lịch tự động hoá, và trả về AI mới là chủ.
   *
   * Lịch có thể chạy ở hai nơi — app desktop và một máy chạy nền (VM). Không có chỗ chốt này thì
   * mỗi lịch chạy hai lần, và với một lịch GHI dữ liệu đó là hai bản ghi trùng trong Base thật.
   *
   * Luật: nhịp tim trong 90 giây được coi là còn sống. Khi cả hai còn sống thì VM thắng — đó là
   * nơi người dùng CỐ Ý đặt để chạy 24/7, còn desktop thì họ đóng mở tuỳ lúc. Giữa hai bên cùng
   * loại thì bên nhịp gần nhất thắng.
   */
  async runnerBeat(
    userId: string,
    me: { ownerId: string; ownerKind: 'vm' | 'desktop'; label?: string },
  ): Promise<{ ownerId: string; ownerKind: string; label: string; isMine: boolean }> {
    const now = new Date();
    const cur = await this.prisma.larkRunnerLease.findUnique({ where: { userId } });
    if (canTakeRunner(cur, me, now.getTime())) {
      const row = await this.prisma.larkRunnerLease.upsert({
        where: { userId },
        create: { userId, ownerId: me.ownerId, ownerKind: me.ownerKind, label: me.label ?? '', beatAt: now },
        update: { ownerId: me.ownerId, ownerKind: me.ownerKind, label: me.label ?? '', beatAt: now },
      });
      return { ownerId: row.ownerId, ownerKind: row.ownerKind, label: row.label, isMine: true };
    }
    return { ownerId: cur!.ownerId, ownerKind: cur!.ownerKind, label: cur!.label, isMine: false };
  }
}
