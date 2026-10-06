import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.service';
import { AuthService } from '../auth/auth.service';
import { encryptJson, decryptJson } from '../common/secret-crypto';

/**
 * "Larkwave chạy lịch tự động hoá Lark hộ tôi" — tính năng người dùng TỰ BẬT, và là chỗ duy
 * nhất trong hệ thống cất app_secret của Lark. Đọc chú thích ở model `LarkHostedRunner` trước
 * khi sửa file này: đánh đổi an ninh ở đó đã được cân nhắc rồi mới chọn, đừng nới thêm.
 *
 * Ba luật của file này, vi phạm cái nào cũng làm hỏng đúng thứ tính năng này đang đánh đổi:
 *   1. Bản rõ app_secret CHỈ đi ra ở `tenantsForRunner()`. Không hàm nào khác trả nó.
 *   2. Không có fallback khoá. Thiếu `LARK_CREDS_KEY` là từ chối ghi, không tụt về JWT_SECRET.
 *   3. Tắt = XOÁ hàng. Không có cờ `enabled` để một lần sửa nhầm làm khoá sống lại.
 */

/** Trạng thái an toàn để trả về trình duyệt — không bao giờ có app_secret. */
export interface HostedRunnerStatus {
  enabled: boolean;
  /** app_id đã che bớt ("cli_a1b2…f9"). Đủ để người dùng nhận ra app nào, không đủ để dùng. */
  appIdMasked: string | null;
  label: string;
  lastSeenAt: string | null;
  lastError: string | null;
  /** false ⇒ máy chủ chưa đặt LARK_CREDS_KEY, giao diện phải ẩn/khoá tính năng. */
  available: boolean;
}

/** Che app_id: giữ đầu đuôi đủ nhận diện. app_id không phải bí mật, nhưng cũng không cần phơi. */
export function maskAppId(appId: string): string {
  if (appId.length <= 12) return appId;
  return `${appId.slice(0, 8)}…${appId.slice(-4)}`;
}

@Injectable()
export class LarkHostedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly auth: AuthService,
  ) {}

  /** Khoá kho. CỐ Ý không fallback về JWT_SECRET — xem chú thích ở env.ts. */
  private vaultKey(): string {
    return this.config.env.LARK_CREDS_KEY.trim();
  }

  available(): boolean {
    return this.vaultKey().length >= 16;
  }

  /** Khoá tiến trình runner. Rỗng ⇒ endpoint nội bộ coi như không tồn tại. */
  serviceKeyMatches(presented: string | undefined): boolean {
    const expected = this.config.env.LARK_RUNNER_SERVICE_KEY.trim();
    if (expected.length < 16) return false;
    const got = (presented || '').trim();
    if (got.length !== expected.length) return false;
    // So sánh không rò thời gian. Không dùng timingSafeEqual vì độ dài đã lộ ở trên,
    // nhưng vẫn quét hết chuỗi để không dừng sớm ở byte đầu khác nhau.
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
    return diff === 0;
  }

  async status(userId: string): Promise<HostedRunnerStatus> {
    const row = await this.prisma.larkHostedRunner.findUnique({ where: { userId } });
    return {
      enabled: !!row,
      appIdMasked: row ? maskAppId(row.appId) : null,
      label: row?.label ?? '',
      lastSeenAt: row?.lastSeenAt?.toISOString() ?? null,
      lastError: row?.lastError ?? null,
      available: this.available(),
    };
  }

  /**
   * Bật (hoặc cập nhật khoá). Người gọi là chính chủ tài khoản — desktop đẩy creds nó đang giữ,
   * hoặc web gửi cái người dùng vừa gõ.
   */
  async enable(
    userId: string,
    input: { appId?: string; appSecret?: string; label?: string },
  ): Promise<HostedRunnerStatus> {
    if (!this.available()) {
      throw new BadRequestException(
        'Máy chủ chưa bật kho khoá Lark (thiếu LARK_CREDS_KEY) — không thể nhận app_secret.',
      );
    }
    const appId = String(input?.appId || '').trim();
    const appSecret = String(input?.appSecret || '').trim();
    if (!appId || !appSecret) throw new BadRequestException('Thiếu app_id hoặc app_secret.');
    if (appId.length > 128 || appSecret.length > 512) {
      throw new BadRequestException('app_id/app_secret dài bất thường.');
    }

    await this.prisma.larkHostedRunner.upsert({
      where: { userId },
      create: {
        userId,
        appId,
        secretEnc: encryptJson({ appSecret }, this.vaultKey()),
        label: String(input?.label || '').slice(0, 80) || 'Larkwave chạy hộ',
        // Khoá vừa đổi ⇒ lỗi cũ không còn ý nghĩa.
        lastError: null,
      },
      update: {
        appId,
        secretEnc: encryptJson({ appSecret }, this.vaultKey()),
        ...(input?.label ? { label: String(input.label).slice(0, 80) } : {}),
        lastError: null,
      },
    });
    return this.status(userId);
  }

  /** Tắt = xoá hẳn khoá khỏi máy chủ. Người dùng bấm tắt là phải mất thật, không phải ẩn đi. */
  async disable(userId: string): Promise<HostedRunnerStatus> {
    await this.prisma.larkHostedRunner.deleteMany({ where: { userId } });
    return this.status(userId);
  }

  // ── Chỉ dành cho tiến trình runner (chắn bằng LARK_RUNNER_SERVICE_KEY) ──────────────

  /**
   * Danh sách tenant + BẢN RÕ app_secret + một token tài khoản vừa ký cho mỗi người.
   *
   * Đây là lối ra duy nhất của bản rõ trong toàn bộ mã máy chủ. Token ký ngắn hạn và runner
   * nạp lại danh sách định kỳ, nên đổi mật khẩu / khoá tài khoản là runner mất quyền theo —
   * nếu ký token dài hạn thì việc khoá tài khoản sẽ không chạm được tới runner.
   */
  async tenantsForRunner(): Promise<
    Array<{ userId: string; appId: string; appSecret: string; accountToken: string; label: string }>
  > {
    if (!this.available()) return [];
    const rows = await this.prisma.larkHostedRunner.findMany({
      include: { user: true },
      orderBy: { updatedAt: 'asc' },
    });

    const out: Array<{
      userId: string;
      appId: string;
      appSecret: string;
      accountToken: string;
      label: string;
    }> = [];
    for (const row of rows) {
      const dec = decryptJson<{ appSecret: string }>(row.secretEnc, this.vaultKey());
      if (!dec?.appSecret) {
        // Giải mã hỏng = khoá kho đã đổi (hoặc hàng bị sửa). Báo cho người dùng thấy ở giao
        // diện thay vì im lặng bỏ qua — im lặng ở đây nghĩa là lịch không chạy mà không ai biết.
        await this.markError(row.userId, 'Không giải mã được khoá đã lưu — hãy nhập lại app_secret.');
        continue;
      }
      // Tài khoản bị khoá/treo thì không chạy hộ nữa.
      if (row.user.status && row.user.status !== 'active') {
        await this.markError(row.userId, 'Tài khoản đang bị khoá — tạm dừng chạy lịch.');
        continue;
      }
      const accountToken = await this.auth.signForRunner(row.user);
      out.push({
        userId: row.userId,
        appId: row.appId,
        appSecret: dec.appSecret,
        accountToken,
        label: row.label,
      });
    }
    return out;
  }

  /** Runner báo về: nạp được rồi (xoá lỗi cũ), hoặc tenant này đang hỏng vì lý do gì. */
  async reportStatus(userId: string, lastError: string | null): Promise<void> {
    const exists = await this.prisma.larkHostedRunner.findUnique({ where: { userId } });
    if (!exists) throw new NotFoundException('Tenant không tồn tại.');
    await this.prisma.larkHostedRunner.update({
      where: { userId },
      data: { lastSeenAt: new Date(), lastError: lastError ? lastError.slice(0, 300) : null },
    });
  }

  private async markError(userId: string, msg: string): Promise<void> {
    await this.prisma.larkHostedRunner
      .update({ where: { userId }, data: { lastError: msg.slice(0, 300) } })
      .catch(() => undefined);
  }
}
