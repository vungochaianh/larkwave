/**
 * Kết nối Zalo của Larkwave — tài khoản Zalo CÁ NHÂN qua zca-js (chép bộ phiên từ Social Wave, xem
 * session.ts). Người dùng tự đăng nhập bằng QR trong mục Kỹ năng → Kết nối; app giữ phiên (mã hoá),
 * agent KHÔNG cầm phiên: nó chỉ gọi các hàm ở đây qua công cụ `zalo_*`, và chỉ trong lượt có kỹ năng
 * Zalo (connectorGate trong lark/tools/connectors.ts).
 *
 * Luật gửi (sendPace.ts): KHÔNG có trần — người dùng muốn gửi bao nhiêu thì gửi. Chỉ giữ sàn 2 giây
 * giữa hai tin và trả `warning` (rủi ro Zalo khoá tài khoản) ở tin đầu của phiên app và khi gửi dày.
 */
import { join } from 'node:path';
import { app } from 'electron';
import { ZaloSessionManager, type ChannelContext, type QrLoginSnapshot, type ZaloSession } from './session';
import { ZaloMessageBook, fold, type ZaloThreadSummary } from './messages';
import { ZALO_SEND_FLOOR_MS, lastHour, zaloSendWarning } from '../sendPace';

export const ZALO_TEXT_MAX = 2_000;

export interface ZaloAccountView {
  accountId: string;
  label: string;
  phone: string;
  avatar: string;
  status: ZaloSession['status'];
  message: string;
}

export interface ZaloStatusView {
  accounts: ZaloAccountView[];
  qr: QrLoginSnapshot;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

class ZaloService {
  private mgr: ZaloSessionManager | null = null;
  private restored: Promise<void> | null = null;
  readonly book = new ZaloMessageBook();
  private readonly sent = new Map<string, number[]>(); // accountId → mốc gửi trong 1 giờ qua
  private lastSendAt = 0;
  private sendChain: Promise<unknown> = Promise.resolve();

  private manager(): ZaloSessionManager {
    if (this.mgr) return this.mgr;
    const ctx: ChannelContext = {
      userDataDir: join(app.getPath('userData'), 'connectors'),
      // Không in `meta`: lỗi của zca-js có thể chép cả cookie/request.
      log: (level, msg) => {
        if (level === 'error' || level === 'warn') console.warn(msg);
      },
      emit: () => undefined, // giao diện tự hỏi trạng thái (zaloStatus) trong lúc mở bảng QR
    };
    this.mgr = new ZaloSessionManager({ ctx, onMessages: (accountId, msgs) => this.book.add(accountId, msgs) });
    return this.mgr;
  }

  /** Khôi phục phiên đã lưu (gọi một lần khi app chạy). Không có phiên đã lưu thì không nạp zca-js. */
  restore(): Promise<void> {
    if (!this.restored) {
      this.restored = this.manager()
        .restoreAll()
        .then(() => undefined)
        .catch((e) => console.warn('[zalo] khôi phục phiên lỗi:', (e as Error)?.message));
    }
    return this.restored;
  }

  async status(): Promise<ZaloStatusView> {
    const m = this.manager();
    return {
      accounts: m.sessions().map((s) => ({ accountId: s.accountId, label: s.label, phone: s.phone, avatar: s.avatar, status: s.status, message: s.message })),
      qr: m.qrSnapshot(),
    };
  }

  async qrStart(): Promise<QrLoginSnapshot> {
    return this.manager().beginQrLogin();
  }
  qrRetry(): boolean {
    return this.manager().retryQr();
  }
  qrAbort(): boolean {
    return this.manager().abortQr();
  }
  async logout(accountId: string): Promise<ZaloStatusView> {
    await this.manager().logout(accountId);
    this.book.clear(accountId);
    return this.status();
  }

  /** Phiên dùng được: chọn theo id/tên/số, mặc định tài khoản sẵn sàng đầu tiên. */
  private session(account?: string): ZaloSession {
    const ready = this.manager().readySessions();
    if (!ready.length) {
      const any = this.manager().sessions();
      throw new Error(
        any.length
          ? `Zalo (${any[0].label}) đang ${any[0].status === 'reconnecting' ? 'nối lại' : 'mất kết nối'} — mở Kỹ năng → Kết nối Zalo để đăng nhập lại bằng QR.`
          : 'Chưa kết nối Zalo. Người dùng bấm nút «Kết nối Zalo (quét QR)» (hiện dưới câu trả lời / nút khiên «Kiểm tra» trên thanh đầu) rồi quét mã bằng app Zalo trên điện thoại.',
      );
    }
    if (!account) return ready[0];
    const q = fold(account);
    const hit = ready.find((s) => s.accountId === account || fold(s.label) === q || (s.phone && s.phone.replace(/\D/g, '').endsWith(account.replace(/\D/g, ''))));
    if (!hit) throw new Error(`Không thấy tài khoản Zalo "${account}" đang kết nối. Đang có: ${ready.map((s) => s.label).join(', ')}.`);
    return hit;
  }

  async recent(opts: { account?: string; limit?: number; query?: string; groupsOnly?: boolean; usersOnly?: boolean }): Promise<{ account: string; threads: ZaloThreadSummary[]; note?: string }> {
    const s = this.session(opts.account);
    await this.ensureGroupNames(s);
    const threads = this.book.recent(s.accountId, opts);
    return {
      account: s.label,
      threads,
      ...(threads.length ? {} : { note: 'Chưa có tin nào trong sổ. Zalo đồng bộ tin gần đây vài giây sau khi kết nối; tin cũ hơn thời điểm đó và chat 1-1 chưa từng mở trên máy này có thể không có.' }),
    };
  }

  async read(opts: { account?: string; threadId: string; limit?: number }) {
    const s = this.session(opts.account);
    const limit = Math.max(1, Math.min(opts.limit ?? 50, 200));
    // Nhóm: lấy thêm lịch sử từ Zalo (có API); chat 1-1 thì chỉ có những gì listener đã thấy.
    if (this.book.isGroup(s.accountId, opts.threadId) !== false && s.api?.groupHistory) {
      try {
        const hist = await s.api.groupHistory(opts.threadId, Math.min(limit, 100));
        if (hist.length) this.book.add(s.accountId, hist);
      } catch {
        /* không phải nhóm, hoặc Zalo từ chối — đọc những gì sổ đang có */
      }
    }
    const msgs = this.book.read(s.accountId, opts.threadId, limit);
    this.manager().markActivity(s.accountId);
    return {
      account: s.label,
      threadId: opts.threadId,
      messages: msgs.map((m) => ({ from: m.isSelf ? 'Tôi' : m.fromName || m.fromId, isSelf: m.isSelf, text: m.text, time: new Date(m.ts).toISOString() })),
      ...(msgs.length ? {} : { note: 'Không có tin nào của hội thoại này trong sổ (chat 1-1: chỉ có tin Zalo đã đồng bộ/đến từ lúc kết nối).' }),
    };
  }

  async groups(opts: { account?: string; query?: string }) {
    const s = this.session(opts.account);
    const all = (await s.api?.groups?.()) ?? [];
    this.book.setGroupNames(s.accountId, all);
    this.groupNamesAt.set(s.accountId, Date.now());
    const q = fold(opts.query || '');
    return { account: s.label, groups: all.filter((g) => !q || fold(g.name).includes(q)).slice(0, 100) };
  }

  async friends(opts: { account?: string; query?: string }) {
    const s = this.session(opts.account);
    const all = (await s.api?.friends()) ?? [];
    const q = fold(opts.query || '');
    return { account: s.label, friends: all.filter((f) => !q || fold(f.name).includes(q) || f.phone.includes(q)).slice(0, 100).map((f) => ({ userId: f.uid, name: f.name, phone: f.phone })) };
  }

  async findUser(opts: { account?: string; phone: string }) {
    const s = this.session(opts.account);
    const phone = String(opts.phone || '').replace(/[^\d+]/g, '');
    if (phone.replace(/\D/g, '').length < 9) throw new Error('Số điện thoại không hợp lệ.');
    const u = await s.api!.findUserByPhone(phone);
    return { account: s.label, found: !!u, ...(u ? { userId: u.uid, name: u.name } : {}) };
  }

  /** Gửi CHỮ vào một hội thoại. Tuần tự, sàn 2 giây, không trần (cảnh báo khi gửi dày — sendPace). */
  send(opts: { account?: string; threadId: string; text: string; isGroup?: boolean }) {
    const job = this.sendChain.then(() => this.sendNow(opts));
    this.sendChain = job.catch(() => undefined);
    return job;
  }

  private async sendNow(opts: { account?: string; threadId: string; text: string; isGroup?: boolean }) {
    const s = this.session(opts.account);
    const text = String(opts.text || '').trim();
    if (!text) throw new Error('Tin trống.');
    if (text.length > ZALO_TEXT_MAX) throw new Error(`Tin dài ${text.length} ký tự — tối đa ${ZALO_TEXT_MAX}. Chia nhỏ hoặc rút gọn.`);
    const now = Date.now();
    const first = !this.sent.has(s.accountId);
    const log = lastHour(this.sent.get(s.accountId) ?? [], now);
    const warning = zaloSendWarning(log.length, first);
    const wait = this.lastSendAt + ZALO_SEND_FLOOR_MS - now;
    if (wait > 0) await sleep(wait);
    const isGroup = opts.isGroup ?? this.book.isGroup(s.accountId, opts.threadId) ?? false;
    const res = s.api!.sendTextTo ? await s.api!.sendTextTo(text, opts.threadId, isGroup) : await s.api!.sendText(text, opts.threadId);
    this.lastSendAt = Date.now();
    log.push(this.lastSendAt);
    this.sent.set(s.accountId, log);
    this.manager().markActivity(s.accountId);
    return { ok: true, account: s.label, threadId: opts.threadId, isGroup, msgId: res.msgId, sentAt: new Date(this.lastSendAt).toISOString(), ...(warning ? { warning } : {}) };
  }

  private readonly groupNamesAt = new Map<string, number>();

  private async ensureGroupNames(s: ZaloSession): Promise<void> {
    if (!s.api?.groups) return;
    if (Date.now() - (this.groupNamesAt.get(s.accountId) ?? 0) < 10 * 60_000) return; // tên nhóm ít đổi
    try {
      this.book.setGroupNames(s.accountId, await s.api.groups());
      this.groupNamesAt.set(s.accountId, Date.now());
    } catch {
      /* không lấy được tên nhóm — vẫn liệt kê theo id */
    }
  }
}

export const zaloService = new ZaloService();
