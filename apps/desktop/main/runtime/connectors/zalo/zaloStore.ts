/**
 * Cài đặt "Đồng bộ tin Zalo" + lưu sổ tin ra đĩa (tuỳ chọn).
 *
 * Tin nhắn riêng ⇒ CHỈ lưu khi mã hoá được bằng kho khoá của hệ điều hành (safeStorage = Keychain/DPAPI).
 * Máy không có kho khoá thì KHÔNG lưu dạng thường — sổ chỉ ở trong bộ nhớ như trước, giao diện nói rõ.
 * Phần thuần (chuẩn hoá cài đặt, mốc giữ tin) tách riêng để kiểm bằng node; phần đĩa nhận `crypto` từ ngoài.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ZaloBookSnapshot } from './messages';
import type { ZaloWebCookie } from './session';

export interface ZaloSyncSettings {
  /** Lưu sổ tin trên máy (mã hoá). Tắt = chỉ trong bộ nhớ, tắt app là mất. */
  persist: boolean;
  /** Giữ tin trong N ngày (theo thời điểm gửi tin). 0 = giữ tới khi người dùng xoá. */
  retentionDays: number;
  /** Số tin tối đa mỗi hội thoại khi lưu trên máy. */
  perThread: number;
}

export const DEFAULT_ZALO_SYNC_SETTINGS: ZaloSyncSettings = { persist: true, retentionDays: 0, perThread: 5000 };
export const RETENTION_CHOICES = [0, 30, 90, 180, 365, 730];
export const PER_THREAD_CHOICES = [1000, 5000, 20000];
/** Số hội thoại tối đa khi lưu trên máy. */
export const PERSIST_MAX_THREADS = 3000;

export function normalizeZaloSettings(x: unknown, base: ZaloSyncSettings = DEFAULT_ZALO_SYNC_SETTINGS): ZaloSyncSettings {
  const o = (x && typeof x === 'object' ? x : {}) as Partial<ZaloSyncSettings>;
  const days = Number(o.retentionDays);
  const per = Number(o.perThread);
  return {
    persist: typeof o.persist === 'boolean' ? o.persist : base.persist,
    retentionDays: Number.isFinite(days) && days >= 0 ? Math.min(3650, Math.floor(days)) : base.retentionDays,
    perThread: Number.isFinite(per) && per >= 200 ? Math.min(50_000, Math.floor(per)) : base.perThread,
  };
}

/** Mốc bỏ tin cũ (ms), hoặc undefined nếu giữ mãi. */
export function retentionCutoff(days: number, now = Date.now()): number | undefined {
  return days > 0 ? now - days * 86_400_000 : undefined;
}

export interface StoreCrypto {
  available(): boolean;
  encrypt(text: string): Buffer;
  decrypt(buf: Buffer): string;
}

const safeName = (accountId: string) => String(accountId).replace(/[^\w-]/g, '_').slice(0, 64) || 'acc';

export class ZaloStore {
  constructor(
    private readonly dir: string,
    private readonly crypto: StoreCrypto,
  ) {}

  private file(name: string): string {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
    return join(this.dir, name);
  }

  settings(): ZaloSyncSettings {
    try {
      return normalizeZaloSettings(JSON.parse(readFileSync(this.file('zalo-sync-settings.json'), 'utf8')));
    } catch {
      return { ...DEFAULT_ZALO_SYNC_SETTINGS };
    }
  }

  saveSettings(patch: Partial<ZaloSyncSettings>): ZaloSyncSettings {
    const next = normalizeZaloSettings({ ...this.settings(), ...patch });
    writeFileSync(this.file('zalo-sync-settings.json'), JSON.stringify(next, null, 2));
    return next;
  }

  /** Lưu được (bật + có kho khoá). */
  canPersist(): boolean {
    return this.crypto.available();
  }

  private bookPath(accountId: string): string {
    return this.file(`zalo-book-${safeName(accountId)}.bin`);
  }

  load(accountId: string): ZaloBookSnapshot | null {
    const p = this.bookPath(accountId);
    if (!existsSync(p) || !this.crypto.available()) return null;
    try {
      return JSON.parse(this.crypto.decrypt(readFileSync(p))) as ZaloBookSnapshot;
    } catch {
      return null;
    }
  }

  /** Ghi nguyên tử (tệp tạm rồi đổi tên). Không có kho khoá ⇒ không ghi gì, trả false. */
  save(accountId: string, snap: ZaloBookSnapshot): boolean {
    if (!this.crypto.available()) return false;
    const p = this.bookPath(accountId);
    const tmp = `${p}.tmp`;
    writeFileSync(tmp, this.crypto.encrypt(JSON.stringify(snap)));
    renameSync(tmp, p);
    return true;
  }

  remove(accountId: string): void {
    rmSync(this.bookPath(accountId), { force: true });
  }

  // ── Cookie của CỬA SỔ Zalo Web ────────────────────────────────────────────────────────────────
  // Zalo cấp phần lớn cookie phiên theo kiểu KHÔNG lưu đĩa, nên tắt app là cửa sổ mất đăng nhập và
  // người dùng phải quét QR lại mỗi lần (phản hồi thật 18/10/2026). Ta tự giữ chúng — MÃ HOÁ bằng kho
  // khoá của máy, không bao giờ ghi dạng thường (đây là chìa khoá vào Zalo của người dùng).
  private webPath(): string {
    return this.file('zalo-web-session.bin');
  }

  loadWebCookies(): ZaloWebCookie[] {
    if (!this.crypto.available() || !existsSync(this.webPath())) return [];
    try {
      const v = JSON.parse(this.crypto.decrypt(readFileSync(this.webPath()))) as { v: 1; at: number; cookies: ZaloWebCookie[] };
      // Quá 30 ngày thì bỏ: phiên Zalo chắc chắn đã chết, giữ lại chỉ tổ rủi ro.
      if (v?.v !== 1 || !Array.isArray(v.cookies) || Date.now() - (v.at || 0) > 30 * 86_400_000) return [];
      return v.cookies;
    } catch {
      return [];
    }
  }

  /** Ghi nguyên tử. Không có kho khoá ⇒ KHÔNG ghi (người dùng sẽ phải quét QR lại — chấp nhận được). */
  saveWebCookies(cookies: ZaloWebCookie[]): boolean {
    if (!this.crypto.available() || !cookies.length) return false;
    const p = this.webPath();
    const tmp = `${p}.tmp`;
    writeFileSync(tmp, this.crypto.encrypt(JSON.stringify({ v: 1, at: Date.now(), cookies })));
    renameSync(tmp, p);
    return true;
  }

  clearWebCookies(): void {
    rmSync(this.webPath(), { force: true });
  }

  bytes(accountId: string): number {
    try {
      return statSync(this.bookPath(accountId)).size;
    } catch {
      return 0;
    }
  }
}
