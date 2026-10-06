import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { Role } from '@larkwave/shared';
import { PrismaService } from '../prisma/prisma.service';
import { readScopes, monthStart, type ApiScope } from './api-scopes';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const MAX_ACTIVE = 20;

/** Developer API keys. The RAW key is returned ONCE at creation; only its SHA-256 hash is stored. */
@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  /** Create a new key for `userId`. Returns the raw key (shown once, never stored again). */
  async create(userId: string, name: string, scopes?: string[], monthlyLimit?: number | null) {
    const clean = (name || '').trim().slice(0, 60) || 'API key';
    const active = await this.prisma.apiKey.count({ where: { userId, revokedAt: null } });
    if (active >= MAX_ACTIVE) {
      throw new BadRequestException(`Đã đạt tối đa ${MAX_ACTIVE} API key đang hoạt động — thu hồi bớt trước khi tạo mới.`);
    }
    // tw_live_ + 48 hex chars. The prefix (tw_live_ + 8 hex) is the non-secret display handle.
    const raw = `tw_live_${randomBytes(24).toString('hex')}`;
    const prefix = raw.slice(0, 16);
    const limit = Number(monthlyLimit);
    const rec = await this.prisma.apiKey.create({
      data: {
        userId,
        name: clean,
        prefix,
        hash: sha256(raw),
        scopes: readScopes(scopes ?? []) as unknown as object,
        monthlyLimit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : null,
      },
      select: { id: true, name: true, prefix: true, createdAt: true, scopes: true, monthlyLimit: true },
    });
    return { ...rec, scopes: readScopes(rec.scopes), key: raw };
  }

  /**
   * Sửa phạm vi / hạn mức của một key đang có.
   *
   * Cho sửa thay vì bắt tạo key mới: thu hẹp quyền một key đang chạy là việc người ta cần làm GẤP
   * khi nghi nó bị lộ, mà tạo key mới thì phải đi sửa cấu hình ở mọi nơi đang dùng.
   */
  async update(
    userId: string,
    id: string,
    patch: { name?: string; scopes?: string[]; monthlyLimit?: number | null },
  ) {
    const k = await this.prisma.apiKey.findFirst({ where: { id, userId }, select: { id: true } });
    if (!k) throw new NotFoundException('Không tìm thấy API key');
    const limit = Number(patch.monthlyLimit);
    const rec = await this.prisma.apiKey.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name.trim().slice(0, 60) || 'API key' } : {}),
        ...(patch.scopes !== undefined ? { scopes: readScopes(patch.scopes) as unknown as object } : {}),
        ...(patch.monthlyLimit !== undefined
          ? { monthlyLimit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : null }
          : {}),
      },
      select: { id: true, name: true, prefix: true, scopes: true, monthlyLimit: true, revokedAt: true },
    });
    return { ...rec, scopes: readScopes(rec.scopes) };
  }

  /** List the user's keys (never the hash/raw). */
  async list(userId: string) {
    const keys = await this.prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, prefix: true, lastUsedAt: true, revokedAt: true, createdAt: true,
        scopes: true, monthlyLimit: true,
      },
    });
    // Đếm lượt tháng này cho TẤT CẢ key bằng một truy vấn, không phải mỗi key một lượt: danh sách
    // 20 key mà đếm riêng từng cái là 20 vòng đi về CSDL cho một trang chỉ để hiển thị.
    const used = await this.prisma.apiKeyCall.groupBy({
      by: ['keyId'],
      where: { keyId: { in: keys.map((k) => k.id) }, createdAt: { gte: monthStart(new Date()) } },
      _count: { _all: true },
    });
    const byKey = new Map(used.map((u) => [u.keyId, u._count._all]));
    return keys.map((k) => ({
      ...k,
      scopes: readScopes(k.scopes),
      monthUsed: byKey.get(k.id) ?? 0,
    }));
  }

  /** Revoke one key (idempotent). */
  async revoke(userId: string, id: string): Promise<{ ok: boolean }> {
    const k = await this.prisma.apiKey.findFirst({ where: { id, userId }, select: { id: true, revokedAt: true } });
    if (!k) throw new NotFoundException('Không tìm thấy API key');
    if (!k.revokedAt) await this.prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    return { ok: true };
  }

  /**
   * Đối chiếu key thô → chủ key (đang hoạt động) + PHẠM VI, hoặc null.
   *
   * Trả thêm `keyId` và `scopes` vì guard cần cả hai: một để ghi sổ và tính hạn mức, một để chặn
   * theo quyền. Trước đây chỉ trả về người dùng, nên guard không có cách nào biết lượt gọi này đi
   * qua key NÀO.
   */
  async verify(
    raw: string,
  ): Promise<{ keyId: string; scopes: ApiScope[]; user: { id: string; email: string; role: Role } } | null> {
    if (!raw || !raw.startsWith('tw_')) return null;
    const rec = await this.prisma.apiKey.findUnique({
      where: { hash: sha256(raw) },
      select: {
        id: true,
        revokedAt: true,
        scopes: true,
        user: { select: { id: true, email: true, role: true, status: true } },
      },
    });
    if (!rec || rec.revokedAt || !rec.user || rec.user.status !== 'active') return null;
    void this.prisma.apiKey.update({ where: { id: rec.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
    return {
      keyId: rec.id,
      scopes: readScopes(rec.scopes),
      user: { id: rec.user.id, email: rec.user.email, role: rec.user.role as Role },
    };
  }

  /**
   * Key này đã vượt hạn mức tháng chưa? null = chưa, hoặc không đặt hạn mức.
   *
   * Đếm theo THÁNG DƯƠNG LỊCH chứ không phải 30 ngày trượt: người dùng nghĩ theo tháng, và một
   * cửa sổ trượt thì không bao giờ "hết hạn mức rồi lại đầy" vào một mốc đoán được.
   */
  async overMonthlyLimit(keyId: string): Promise<{ used: number; limit: number } | null> {
    const k = await this.prisma.apiKey.findUnique({ where: { id: keyId }, select: { monthlyLimit: true } });
    const limit = k?.monthlyLimit ?? null;
    if (!limit || limit <= 0) return null;
    const used = await this.prisma.apiKeyCall.count({
      where: { keyId, createdAt: { gte: monthStart(new Date()) } },
    });
    return used >= limit ? { used, limit } : null;
  }

  /** Ghi một lượt gọi vào sổ. Không bao giờ ném: sổ hỏng không được làm hỏng lượt gọi thật. */
  async logCall(keyId: string, route: string, status: number, ms: number): Promise<void> {
    await this.prisma.apiKeyCall
      .create({ data: { keyId, route: route.slice(0, 200), status, ms: Math.max(0, Math.round(ms)) } })
      .catch(() => undefined);
  }

  /**
   * Báo cáo dùng của MỘT key: tổng lượt tháng này, tỉ lệ lỗi, top tuyến đường, và những lượt gần
   * nhất.
   *
   * Vì sao có cả bốn: khi một key bỗng tốn gấp mười, câu hỏi là "gọi cái gì, lúc nào, có lỗi
   * không". Một con số tổng không trả lời được câu nào.
   */
  async usage(userId: string, keyId: string, days = 30) {
    const k = await this.prisma.apiKey.findFirst({
      where: { id: keyId, userId },
      select: { id: true, name: true, prefix: true, monthlyLimit: true, scopes: true },
    });
    if (!k) throw new NotFoundException('Không tìm thấy API key');

    const since = new Date(Date.now() - Math.min(90, Math.max(1, days)) * 86_400_000);
    const from = monthStart(new Date());
    const [monthUsed, rows, recent] = await Promise.all([
      this.prisma.apiKeyCall.count({ where: { keyId, createdAt: { gte: from } } }),
      this.prisma.apiKeyCall.groupBy({
        by: ['route'],
        where: { keyId, createdAt: { gte: since } },
        _count: { _all: true },
        _avg: { ms: true },
      }),
      this.prisma.apiKeyCall.findMany({
        where: { keyId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { route: true, status: true, ms: true, createdAt: true },
      }),
    ]);
    const failed = await this.prisma.apiKeyCall.count({
      where: { keyId, createdAt: { gte: since }, status: { gte: 400 } },
    });
    const total = rows.reduce((n, r) => n + r._count._all, 0);
    return {
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      scopes: readScopes(k.scopes),
      monthlyLimit: k.monthlyLimit,
      monthUsed,
      windowDays: days,
      total,
      failed,
      routes: rows
        .map((r) => ({ route: r.route, count: r._count._all, avgMs: Math.round(r._avg.ms ?? 0) }))
        .sort((a, b) => b.count - a.count),
      recent: recent.map((r) => ({
        route: r.route,
        status: r.status,
        ms: r.ms,
        at: r.createdAt.toISOString(),
      })),
    };
  }
}
