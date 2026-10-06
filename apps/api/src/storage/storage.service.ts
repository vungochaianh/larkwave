import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.service';
import { BillingService } from '../billing/billing.service';

/** Nhóm dữ liệu hiện trên trang quản lý dung lượng. */
export type StorageCategory = 'apps' | 'uploads' | 'video' | 'image' | 'chat';

export interface StorageBucket {
  category: StorageCategory;
  label: string;
  bytes: number;
  count: number;
  /** Người dùng có thể tự xoá nhóm này không (một số thứ xoá sẽ hỏng app đang chạy). */
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
 * Đo và dọn dung lượng lưu trữ của từng người dùng.
 *
 * Hai nơi chứa dữ liệu, phải cộng cả hai thì con số mới thật:
 *  - PostgreSQL: mã nguồn app (`Build.files`), tệp tải lên (`Upload.data`/`rawData`), hội thoại.
 *  - Đĩa máy chủ (`UPLOADS_DIR`): video, ảnh và audio do bộ công cụ nội dung dựng ra.
 *
 * Vì sao đo tệp trên đĩa bằng `stat` chứ không lưu sẵn kích thước: lược đồ hiện KHÔNG có cột nào
 * ghi kích thước tệp (đã kiểm: không có `sizeBytes`/`fileSize` nào trong schema), nên lưu sẵn sẽ
 * cần một đợt backfill và từ đó luôn có nguy cơ lệch với đĩa thật. `stat` thì luôn đúng, và tệp
 * nằm ngay trên máy chủ nên chi phí là vài mili-giây.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly billing: BillingService,
  ) {}

  /**
   * Đổi một URL đã lưu thành đường dẫn tệp trên đĩa — hoặc null nếu nó không nằm trong thư mục
   * uploads. Đây là CHỐT AN TOÀN: giá trị URL đến từ cơ sở dữ liệu, và một giá trị dị dạng
   * (`../../etc/passwd`) tuyệt đối không được biến thành lệnh xoá ngoài phạm vi.
   */
  private diskPathFor(url: string | null | undefined): string | null {
    if (!url) return null;
    const m = /\/uploads\/([A-Za-z0-9._\-/]+)$/.exec(url);
    if (!m) return null;
    const root = resolve(this.config.uploadsDir);
    const abs = resolve(root, m[1]);
    return abs === root || abs.startsWith(root + sep) ? abs : null;
  }

  private async fileBytes(url: string | null | undefined): Promise<number> {
    const p = this.diskPathFor(url);
    if (!p) return 0;
    try {
      return (await fs.stat(p)).size;
    } catch {
      return 0; // tệp đã bị xoá hoặc chưa dựng xong — không phải lỗi
    }
  }

  /** Xoá tệp trên đĩa nếu có. Thiếu bước này thì "xoá" chỉ giấu bản ghi, dung lượng không giảm. */
  private async unlink(url: string | null | undefined): Promise<void> {
    const p = this.diskPathFor(url);
    if (!p) return;
    await fs.rm(p, { force: true }).catch(() => undefined);
  }

  private async sumBytesSql(sql: string, userId: string): Promise<{ n: number; bytes: number }> {
    const rows = await this.prisma.$queryRawUnsafe<{ n: bigint; bytes: bigint | null }[]>(sql, userId);
    const r = rows[0];
    return { n: Number(r?.n ?? 0), bytes: Number(r?.bytes ?? 0) };
  }

  async usage(userId: string): Promise<StorageUsage> {
    const [apps, uploads, chat] = await Promise.all([
      // Mã nguồn app: nguồn chiếm chỗ lớn nhất. Đo 08/09/2026 trên production bằng chính câu
      // dưới đây: 81 MB / 120 bản dựng ≈ 675 KB mỗi lần dựng.
      //
      // `octet_length(::text)` là kích thước JSON LOGIC, không phải byte trên đĩa — jsonb được
      // Postgres nén (TOAST) nên đĩa thật thường nhỏ hơn. Chọn số logic vì nó ổn định và giải
      // thích được cho người dùng ("dữ liệu của bạn"), còn byte đĩa thì đổi theo cách nén.
      this.sumBytesSql(
        `SELECT count(*) n, sum(octet_length(b."files"::text))::bigint bytes
         FROM "Build" b JOIN "App" a ON a.id = b."appId"
         WHERE a."ownerId" = $1 AND b."files" IS NOT NULL`,
        userId,
      ),
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

    const [videos, pictures] = await Promise.all([
      this.prisma.videoProject.findMany({ where: { userId }, select: { videoUrl: true, thumbnailUrl: true } }),
      this.prisma.pictureProject.findMany({ where: { userId }, select: { imageUrls: true, imageUrl: true } }),
    ]);
    const videoBytes = (
      await Promise.all(videos.flatMap((v) => [this.fileBytes(v.videoUrl), this.fileBytes(v.thumbnailUrl)]))
    ).reduce((a, b) => a + b, 0);
    const imageBytes = (
      await Promise.all(
        pictures.flatMap((p) => (p.imageUrls.length ? p.imageUrls : [p.imageUrl]).map((u) => this.fileBytes(u))),
      )
    ).reduce((a, b) => a + b, 0);

    const buckets: StorageBucket[] = [
      {
        category: 'apps',
        label: 'Mã nguồn app đã tạo',
        bytes: apps.bytes,
        count: apps.n,
        deletable: true,
        // Nói thẳng cả lối thoát: bản dựng ĐANG PHỤC VỤ app không xoá được, nên nếu người dùng
        // chỉ có đúng một bản dựng cho mỗi app thì nhóm này không giải phóng được gì — và họ cần
        // biết là phải xoá cả app, chứ không phải bấm quanh một danh sách toàn nút khoá.
        hint: 'Mỗi lần dựng lưu lại toàn bộ mã nguồn. Xoá được các bản dựng CŨ; bản đang phục vụ app thì phải xoá cả app mới giải phóng.',
      },
      {
        category: 'video',
        label: 'Video',
        bytes: videoBytes,
        count: videos.length,
        deletable: true,
      },
      {
        category: 'image',
        label: 'Ảnh đã tạo',
        bytes: imageBytes,
        count: pictures.length,
        deletable: true,
      },
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
    if (category === 'apps') {
      // Bản dựng ĐANG PHỤC VỤ app không cho xoá: mã nguồn của nó còn cần cho deploy lại và đẩy Git.
      const rows = await this.prisma.$queryRawUnsafe<
        { id: string; name: string; bytes: bigint; createdAt: Date; current: boolean }[]
      >(
        `SELECT b.id, a.name, octet_length(b."files"::text)::bigint bytes, b."createdAt",
                (d.id IS NOT NULL) AS current
         FROM "Build" b
         JOIN "App" a ON a.id = b."appId"
         LEFT JOIN "Deployment" d ON d."buildId" = b.id AND d.status = 'live'
         WHERE a."ownerId" = $1 AND b."files" IS NOT NULL
         ORDER BY octet_length(b."files"::text) DESC LIMIT 200`,
        userId,
      );
      return rows.map((r) => ({
        id: r.id,
        name: `${r.name} — bản dựng ${r.createdAt.toISOString().slice(0, 10)}`,
        bytes: Number(r.bytes),
        createdAt: r.createdAt.toISOString(),
        ...(r.current ? { lockedReason: 'Bản đang chạy — xoá sẽ không deploy lại được' } : {}),
      }));
    }
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
    if (category === 'video') {
      const rows = await this.prisma.videoProject.findMany({
        where: { userId },
        select: { id: true, title: true, createdAt: true, videoUrl: true, thumbnailUrl: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      return Promise.all(
        rows.map(async (r) => ({
          id: r.id,
          name: r.title || 'Video chưa đặt tên',
          bytes: (await this.fileBytes(r.videoUrl)) + (await this.fileBytes(r.thumbnailUrl)),
          createdAt: r.createdAt.toISOString(),
        })),
      );
    }
    if (category === 'image') {
      const rows = await this.prisma.pictureProject.findMany({
        where: { userId },
        select: { id: true, title: true, createdAt: true, imageUrl: true, imageUrls: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      return Promise.all(
        rows.map(async (r) => {
          const urls = r.imageUrls.length ? r.imageUrls : [r.imageUrl];
          const sizes = await Promise.all(urls.map((u) => this.fileBytes(u)));
          return {
            id: r.id,
            name: r.title || 'Ảnh chưa đặt tên',
            bytes: sizes.reduce((a, b) => a + b, 0),
            createdAt: r.createdAt.toISOString(),
          };
        }),
      );
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

  /**
   * Xoá một mục và GIẢI PHÓNG chỗ thật.
   *
   * Với video/ảnh phải xoá cả tệp trên đĩa: trước đây xoá dự án chỉ bỏ bản ghi, tệp vẫn nằm lại
   * mãi (chỉ có thư mục tạm lúc render là được dọn). Nếu chỉ xoá bản ghi thì trang này sẽ báo
   * "đã giải phóng" trong khi đĩa không hề vơi — tức là nói dối đúng chỗ người dùng đang trả tiền.
   */
  async remove(userId: string, category: StorageCategory, id: string): Promise<{ freedBytes: number }> {
    if (category === 'apps') {
      const build = await this.prisma.build.findFirst({
        where: { id, app: { ownerId: userId } },
        select: { id: true, files: true },
      });
      if (!build) throw new NotFoundException('Không tìm thấy bản dựng');
      const live = await this.prisma.deployment.findFirst({ where: { buildId: id, status: 'live' } });
      if (live) {
        throw new BadRequestException(
          'Đây là bản dựng đang phục vụ app — xoá mã nguồn của nó thì không deploy lại được. Hãy xoá các bản dựng cũ hơn.',
        );
      }
      const freed = Buffer.byteLength(JSON.stringify(build.files ?? null));
      // Chỉ bỏ MÃ NGUỒN, giữ lại bản ghi build để lịch sử và số liệu không bị thủng.
      //
      // PHẢI là `Prisma.DbNull`, KHÔNG phải `undefined`: trong Prisma `undefined` nghĩa là "bỏ qua
      // trường này", nên câu lệnh sẽ không giải phóng một byte nào trong khi hàm vẫn trả freedBytes
      // > 0 và giao diện báo "đã giải phóng". Người dùng bấm xoá, thấy thành công, tải lại trang
      // và dung lượng y nguyên — đúng kiểu nói dối tệ hơn là không có tính năng.
      await this.prisma.build.update({ where: { id }, data: { files: Prisma.DbNull } });
      return { freedBytes: freed };
    }
    if (category === 'uploads') {
      const up = await this.prisma.upload.findFirst({ where: { id, ownerId: userId } });
      if (!up) throw new NotFoundException('Không tìm thấy tệp');
      const freed = (up.data?.length ?? 0) + (up.rawData?.length ?? 0);
      await this.prisma.upload.delete({ where: { id } });
      return { freedBytes: freed };
    }
    if (category === 'video') {
      const v = await this.prisma.videoProject.findFirst({ where: { id, userId } });
      if (!v) throw new NotFoundException('Không tìm thấy video');
      const freed = (await this.fileBytes(v.videoUrl)) + (await this.fileBytes(v.thumbnailUrl));
      await this.unlink(v.videoUrl);
      await this.unlink(v.thumbnailUrl);
      await this.prisma.videoProject.delete({ where: { id } });
      return { freedBytes: freed };
    }
    if (category === 'image') {
      const p = await this.prisma.pictureProject.findFirst({ where: { id, userId } });
      if (!p) throw new NotFoundException('Không tìm thấy ảnh');
      const urls = p.imageUrls.length ? p.imageUrls : [p.imageUrl];
      const sizes = await Promise.all(urls.map((u) => this.fileBytes(u)));
      for (const u of urls) await this.unlink(u);
      await this.prisma.pictureProject.delete({ where: { id } });
      return { freedBytes: sizes.reduce((a, b) => a + b, 0) };
    }
    const c = await this.prisma.agentChatConversation.findFirst({ where: { id, userId } });
    if (!c) throw new NotFoundException('Không tìm thấy hội thoại');
    const freed = typeof c.body === 'string' ? c.body.length : Buffer.byteLength(JSON.stringify(c.body ?? ''));
    await this.prisma.agentChatConversation.delete({ where: { id } });
    return { freedBytes: freed };
  }
}
