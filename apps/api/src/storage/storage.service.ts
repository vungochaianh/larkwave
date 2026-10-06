import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';

/** Nhóm dữ liệu hiện trên trang quản lý dung lượng. */
export type StorageCategory = 'uploads' | 'chat';

export interface StorageBucket {
  category: StorageCategory;
  label: string;
  bytes: number;
  count: number;
  /** Người dùng có thể tự xoá nhóm này không. */
  deletable: boolean;
  hint?: string;
}

export interface StorageUsage {
  buckets: StorageBucket[];
  totalBytes: number;
  /**
   * Tài khoản admin KHÔNG bị giới hạn dung lượng — cùng quy tắc với hạn mức AI
   * (me.service: `unlimited = user.role === 'admin'`).
   *
   * Vẫn TRẢ VỀ số đã dùng và bảng chi tiết: không giới hạn không có nghĩa là không cần biết mình
   * đang chiếm bao nhiêu — quản trị viên chính là người cần con số đó nhất.
   */
  unlimited: boolean;
  /** Hạn mức = gói tặng + phần mua thêm. Bằng 0 khi `unlimited`. */
  quotaBytes: number;
  includedMb: number;
  bonusMb: number;
  /** Hạn của phần mua thêm (ISO) — null khi không có phần mua thêm đang hiệu lực. */
  bonusUntil: string | null;
  percentUsed: number;
}

export interface StorageItem {
  id: string;
  name: string;
  bytes: number;
  createdAt: string;
  /** Không xoá được thì nêu lý do — im lặng vô hiệu hoá nút là cách làm người dùng bối rối. */
  lockedReason?: string;
}

const MB = 1024 * 1024;

/**
 * Đo và dọn dung lượng lưu trữ của từng người dùng: tệp tải lên (`Upload.data`/`rawData`) và
 * ngữ cảnh hội thoại (`AgentChatConversation.body`) trong PostgreSQL.
 */
@Injectable()
export class StorageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  private async sumBytesSql(sql: string, userId: string): Promise<{ n: number; bytes: number }> {
    const rows = await this.prisma.$queryRawUnsafe<{ n: bigint; bytes: bigint | null }[]>(sql, userId);
    const r = rows[0];
    return { n: Number(r?.n ?? 0), bytes: Number(r?.bytes ?? 0) };
  }

  async usage(userId: string): Promise<StorageUsage> {
    const [uploads, chat] = await Promise.all([
      this.sumBytesSql(
        `SELECT count(*) n,
                sum(octet_length(coalesce(u."data", '')) + octet_length(coalesce(u."rawData", '')))::bigint bytes
         FROM "Upload" u WHERE u."ownerId" = $1 AND u."purgedAt" IS NULL`,
        userId,
      ),
      this.sumBytesSql(
        // `body` là cột JSON — coalesce với chuỗi rỗng sẽ ép '' thành json và vỡ ngay
        // (22P02). Đổi sang text TRƯỚC rồi mới đo, và ::text của một json null ra 'null'
        // nên dùng coalesce trên chính cột để không đếm 4 byte thừa.
        `SELECT count(*) n, sum(octet_length(coalesce(c."body"::text, '')))::bigint bytes
         FROM "AgentChatConversation" c WHERE c."userId" = $1`,
        userId,
      ),
    ]);

    const buckets: StorageBucket[] = [
      {
        category: 'uploads',
        label: 'Tệp bạn tải lên',
        bytes: uploads.bytes,
        count: uploads.n,
        deletable: true,
        hint: 'Tệp đính kèm trong trò chuyện tự xoá sau 30 ngày.',
      },
      {
        category: 'chat',
        label: 'Ngữ cảnh hội thoại',
        bytes: chat.bytes,
        count: chat.n,
        deletable: true,
        hint: 'Xoá hội thoại là mất luôn nội dung đã trao đổi.',
      },
    ];

    const totalBytes = buckets.reduce((a, b) => a + b.bytes, 0);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { plan: true, role: true, storageBonusMb: true, storageBonusUntil: true },
    });
    const unlimited = user.role === 'admin';
    const plan = await this.billing.getPlan(user.plan);
    const includedMb = plan.storageMb;
    // Phần mua thêm là tiền THUÊ theo tháng: hết hạn thì thôi cộng, nhưng dữ liệu vẫn còn nguyên
    // (xem ghi chú ở schema — không bao giờ tự xoá dữ liệu vì một khoản thanh toán trễ).
    const bonusActive = !!user.storageBonusUntil && user.storageBonusUntil.getTime() > Date.now();
    const bonusMb = bonusActive ? user.storageBonusMb : 0;
    const quotaBytes = (includedMb + bonusMb) * MB;
    return {
      buckets,
      totalBytes,
      unlimited,
      quotaBytes: unlimited ? 0 : quotaBytes,
      includedMb: unlimited ? 0 : includedMb,
      bonusMb,
      bonusUntil: bonusActive ? user.storageBonusUntil!.toISOString() : null,
      percentUsed: unlimited || quotaBytes <= 0 ? 0 : Math.min(100, Math.round((totalBytes / quotaBytes) * 100)),
    };
  }

  async items(userId: string, category: StorageCategory): Promise<StorageItem[]> {
    if (category === 'uploads') {
      const rows = await this.prisma.upload.findMany({
        where: { ownerId: userId, purgedAt: null },
        select: { id: true, name: true, createdAt: true, data: true, rawData: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        bytes: (r.data?.length ?? 0) + (r.rawData?.length ?? 0),
        createdAt: r.createdAt.toISOString(),
      }));
    }
    const rows = await this.prisma.agentChatConversation.findMany({
      where: { userId },
      select: { id: true, title: true, updatedAt: true, body: true },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.title || 'Hội thoại',
      bytes: typeof r.body === 'string' ? r.body.length : Buffer.byteLength(JSON.stringify(r.body ?? '')),
      createdAt: r.updatedAt.toISOString(),
    }));
  }

  /** Xoá một mục và trả về số byte đã giải phóng thật. */
  async remove(userId: string, category: StorageCategory, id: string): Promise<{ freedBytes: number }> {
    if (category === 'uploads') {
      const up = await this.prisma.upload.findFirst({ where: { id, ownerId: userId } });
      if (!up) throw new NotFoundException('Không tìm thấy tệp');
      const freed = (up.data?.length ?? 0) + (up.rawData?.length ?? 0);
      await this.prisma.upload.delete({ where: { id } });
      return { freedBytes: freed };
    }
    const c = await this.prisma.agentChatConversation.findFirst({ where: { id, userId } });
    if (!c) throw new NotFoundException('Không tìm thấy hội thoại');
    const freed = typeof c.body === 'string' ? c.body.length : Buffer.byteLength(JSON.stringify(c.body ?? ''));
    await this.prisma.agentChatConversation.delete({ where: { id } });
    return { freedBytes: freed };
  }
}
