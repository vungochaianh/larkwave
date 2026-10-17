/**
 * Kết nối Zalo của Larkwave — tài khoản Zalo CÁ NHÂN qua zca-js (chép bộ phiên từ Social Wave, xem
 * session.ts). Người dùng tự đăng nhập bằng QR trong mục Kỹ năng → Kết nối; app giữ phiên (mã hoá),
 * agent KHÔNG cầm phiên: nó chỉ gọi các hàm ở đây qua công cụ `zalo_*`, và chỉ trong lượt có kỹ năng
 * Zalo (connectorGate trong lark/tools/connectors.ts).
 *
 * Luật gửi (sendPace.ts): KHÔNG có trần — người dùng muốn gửi bao nhiêu thì gửi. Chỉ giữ sàn 2 giây
 * giữa hai tin và trả `warning` (rủi ro Zalo khoá tài khoản) ở tin đầu của phiên app và khi gửi dày.
 *
 * ĐỒNG BỘ TIN (17/10/2026, cấu hình ở Cài đặt → Đồng bộ tin Zalo):
 *  - Lưu sổ tin trên máy (mã hoá, zaloStore.ts), giữ theo số ngày đã chọn.
 *  - "Lấy thêm tin cũ từ máy chủ" (fetchHistory): nhóm qua kho tin cloud, chat 1-1 qua trang tin cũ của listener.
 *  - "Cửa sổ Zalo Web" (zaloWeb.ts): mở chat.zalo.me CHÍNH THỨC bằng cookie của phiên này (cùng phiên, khỏi
 *    quét QR lại); người dùng tự đồng bộ trên điện thoại rồi Larkwave ĐỌC NỘI DUNG ĐANG HIỂN THỊ (không giải mã).
 */
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { app, safeStorage } from 'electron';
import { ZaloSessionManager, type ChannelContext, type QrLoginSnapshot, type ZaloCredentials, type ZaloMessage, type ZaloSession } from './session';
import { ZaloMessageBook, MAX_PER_THREAD, MAX_THREADS, fold, type ZaloThreadSummary } from './messages';
import { ZaloStore, PERSIST_MAX_THREADS, retentionCutoff, type ZaloSyncSettings } from './zaloStore';
import { zaloWeb, type ZaloWebRead, type ZaloWebStatus } from './zaloWeb';
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

export interface ZaloSyncStatusView {
  settings: ZaloSyncSettings;
  /** Máy có kho khoá để lưu mã hoá. */
  persistAvailable: boolean;
  accounts: { accountId: string; label: string; status: ZaloSession['status']; threads: number; messages: number; phoneMessages: number; oldestTs?: number; storedBytes: number }[];
  /** Trạng thái cửa sổ Zalo Web nhúng. */
  web: ZaloWebStatus;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const SAVE_DEBOUNCE_MS = 4_000;

class ZaloService {
  private mgr: ZaloSessionManager | null = null;
  private restored: Promise<void> | null = null;
  readonly book = new ZaloMessageBook();
  private readonly sent = new Map<string, number[]>(); // accountId → mốc gửi trong 1 giờ qua
  private lastSendAt = 0;
  private sendChain: Promise<unknown> = Promise.resolve();
  private storeInst: ZaloStore | null = null;
  private readonly loaded = new Set<string>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private quitHooked = false;
  private adoptTried = false;

  private connectorsDir(): string {
    return join(app.getPath('userData'), 'connectors');
  }

  private store(): ZaloStore {
    this.storeInst ??= new ZaloStore(this.connectorsDir(), {
      available: () => {
        try {
          return safeStorage.isEncryptionAvailable();
        } catch {
          return false;
        }
      },
      encrypt: (t) => safeStorage.encryptString(t),
      decrypt: (b) => safeStorage.decryptString(b),
    });
    return this.storeInst;
  }

  private persisting(): boolean {
    return this.store().settings().persist && this.store().canPersist();
  }

  private applyLimits(): void {
    if (this.persisting()) this.book.setLimits(this.store().settings().perThread, PERSIST_MAX_THREADS);
    else this.book.setLimits(MAX_PER_THREAD, MAX_THREADS);
  }

  /** Nạp sổ đã lưu của một tài khoản (một lần), rồi bỏ tin quá hạn giữ. */
  private ensureLoaded(accountId: string): void {
    if (this.loaded.has(accountId)) return;
    this.loaded.add(accountId);
    this.applyLimits();
    if (!this.persisting()) return;
    this.book.restore(accountId, this.store().load(accountId));
    const cut = retentionCutoff(this.store().settings().retentionDays);
    if (cut !== undefined) this.book.pruneBefore(accountId, cut);
    this.hookQuit();
  }

  private hookQuit(): void {
    if (this.quitHooked) return;
    this.quitHooked = true;
    try {
      app.on('before-quit', () => this.flush());
    } catch {
      /* chạy ngoài electron (kiểm thử) */
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer || !this.persisting()) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, SAVE_DEBOUNCE_MS);
  }

  /** Ghi các tài khoản có thay đổi ra đĩa (mã hoá). */
  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (!this.persisting()) return;
    const cut = retentionCutoff(this.store().settings().retentionDays);
    for (const id of this.book.dirtyAccounts()) {
      if (cut !== undefined) this.book.pruneBefore(id, cut);
      this.book.takeDirty(id);
      try {
        this.store().save(id, this.book.snapshot(id));
      } catch (e) {
        console.warn('[zalo] lưu sổ tin lỗi:', (e as Error)?.message);
      }
    }
  }

  private addMessages(accountId: string, msgs: ZaloMessage[]): number {
    this.ensureLoaded(accountId);
    const n = this.book.add(accountId, msgs);
    if (n) this.scheduleSave();
    return n;
  }

  private manager(): ZaloSessionManager {
    if (this.mgr) return this.mgr;
    const ctx: ChannelContext = {
      userDataDir: this.connectorsDir(),
      // Không in `meta`: lỗi của zca-js có thể chép cả cookie/request.
      log: (level, msg) => {
        if (level === 'error' || level === 'warn') console.warn(msg);
      },
      emit: () => undefined, // giao diện tự hỏi trạng thái (zaloStatus) trong lúc mở bảng QR
    };
    this.mgr = new ZaloSessionManager({ ctx, onMessages: (accountId, msgs) => this.addMessages(accountId, msgs) });
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
  /** Đăng xuất = ngắt hẳn tài khoản trên máy này: xoá luôn sổ tin đã lưu của nó. */
  async logout(accountId: string): Promise<ZaloStatusView> {
    await this.manager().logout(accountId);
    this.book.clear(accountId);
    this.book.takeDirty(accountId);
    this.store().remove(accountId);
    this.loaded.delete(accountId);
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
    let hit = ready[0];
    if (account) {
      const q = fold(account);
      const found = ready.find((s) => s.accountId === account || fold(s.label) === q || (s.phone && s.phone.replace(/\D/g, '').endsWith(account.replace(/\D/g, ''))));
      if (!found) throw new Error(`Không thấy tài khoản Zalo "${account}" đang kết nối. Đang có: ${ready.map((s) => s.label).join(', ')}.`);
      hit = found;
    }
    this.ensureLoaded(hit.accountId);
    return hit;
  }

  async recent(opts: { account?: string; limit?: number; query?: string; groupsOnly?: boolean; usersOnly?: boolean }): Promise<{ account: string; threads: ZaloThreadSummary[]; note?: string }> {
    const s = this.session(opts.account);
    await this.ensureGroupNames(s);
    const threads = this.book.recent(s.accountId, opts);
    return {
      account: s.label,
      threads,
      ...(threads.length
        ? {}
        : { note: 'Chưa có tin nào trong sổ. Thử zalo_sync {action:"server"} để lấy thêm tin cũ từ máy chủ; cần lịch sử cũ hơn (chat 1-1) thì mở cửa sổ Zalo Web (zalo_web_open) + đồng bộ trên điện thoại rồi zalo_web_read.' }),
    };
  }

  async read(opts: { account?: string; threadId: string; limit?: number; since?: number; before?: number }) {
    const s = this.session(opts.account);
    const limit = Math.max(1, Math.min(opts.limit ?? 50, 200));
    // Nhóm: lấy thêm lịch sử từ kho tin cloud của Zalo; chat 1-1 thì đọc sổ (+ zalo_sync để xin thêm).
    if (this.book.isGroup(s.accountId, opts.threadId) !== false && s.api?.groupHistory) {
      try {
        const hist = await s.api.groupHistory(opts.threadId, Math.min(Math.max(limit, 50), 200));
        if (hist.length) this.addMessages(s.accountId, hist);
      } catch {
        /* không phải nhóm, hoặc Zalo từ chối — đọc những gì sổ đang có */
      }
    }
    const msgs = this.book.read(s.accountId, opts.threadId, limit, { since: opts.since, before: opts.before });
    this.manager().markActivity(s.accountId);
    const first = msgs[0];
    return {
      account: s.label,
      threadId: opts.threadId,
      messages: msgs.map((m) => ({ from: m.isSelf ? 'Tôi' : m.fromName || m.fromId, isSelf: m.isSelf, text: m.text, time: new Date(m.ts).toISOString(), ...(m.source ? { source: m.source } : {}) })),
      ...(first ? { olderBefore: new Date(first.ts).toISOString() } : {}),
      ...(msgs.length
        ? {}
        : { note: 'Không có tin nào của hội thoại này trong sổ (trong khoảng đã chọn). Thử zalo_sync {action:"server", threadId}; lịch sử cũ hơn thì đọc trong cửa sổ Zalo Web (zalo_web_read).' }),
    };
  }

  /** Tìm tin theo chữ / khoảng thời gian trong sổ (gồm tin đã đồng bộ). */
  async search(opts: { account?: string; query: string; threadId?: string; since?: number; before?: number; limit?: number }) {
    const s = this.session(opts.account);
    await this.ensureGroupNames(s);
    const hits = this.book.search(s.accountId, opts);
    const st = this.book.stats(s.accountId);
    return {
      account: s.label,
      found: hits.length,
      results: hits.map((h) => ({ threadId: h.threadId, chat: h.title, isGroup: h.isGroup, from: h.message.isSelf ? 'Tôi' : h.message.fromName || h.message.fromId, text: h.message.text, time: new Date(h.message.ts).toISOString() })),
      searched: { threads: st.threads, messages: st.messages, ...(st.oldestTs ? { oldest: new Date(st.oldestTs).toISOString() } : {}) },
      ...(hits.length ? {} : { note: 'Không thấy tin khớp trong sổ. Sổ chỉ có tin app đã thấy/đã đồng bộ — xem "searched".' }),
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

  // ── Đồng bộ ───────────────────────────────────────────────────────────────────────────────────

  syncSettings(): ZaloSyncSettings {
    return this.store().settings();
  }

  saveSyncSettings(patch: Partial<ZaloSyncSettings>): ZaloSyncStatusView {
    const before = this.store().settings();
    const next = this.store().saveSettings(patch);
    this.applyLimits();
    const ids = this.manager().sessions().map((s) => s.accountId);
    // Tắt lưu: xoá bản đã lưu ngay (sổ trong bộ nhớ còn tới khi tắt app).
    if (!next.persist && before.persist) for (const id of ids) this.store().remove(id);
    if (next.persist && this.store().canPersist()) {
      // Vừa BẬT lưu / đổi số ngày giữ: nạp bản cũ (nếu có), bỏ tin quá hạn, ghi ngay những gì đang có.
      const cut = retentionCutoff(next.retentionDays);
      for (const id of ids) {
        if (!before.persist) {
          this.loaded.delete(id);
          this.ensureLoaded(id);
        }
        if (cut !== undefined) this.book.pruneBefore(id, cut);
        this.book.takeDirty(id);
        this.store().save(id, this.book.snapshot(id));
      }
    }
    return this.syncStatus();
  }

  /** Xoá sổ tin (bộ nhớ + đĩa) của một tài khoản, hoặc mọi tài khoản. */
  clearStore(accountId?: string): ZaloSyncStatusView {
    const ids = accountId ? [accountId] : this.manager().sessions().map((s) => s.accountId);
    for (const id of ids) {
      this.book.clear(id);
      this.book.takeDirty(id);
      this.store().remove(id);
    }
    return this.syncStatus();
  }

  syncStatus(): ZaloSyncStatusView {
    const sessions = this.manager().sessions();
    for (const s of sessions) this.ensureLoaded(s.accountId);
    return {
      settings: this.store().settings(),
      persistAvailable: this.store().canPersist(),
      accounts: sessions.map((s) => ({ accountId: s.accountId, label: s.label, status: s.status, ...this.book.stats(s.accountId), storedBytes: this.store().bytes(s.accountId) })),
      web: zaloWeb.status(),
    };
  }

  /**
   * Lấy thêm tin cũ từ MÁY CHỦ Zalo (không cần điện thoại): một nhóm qua kho tin cloud, hoặc từng trang tin
   * cũ của listener (1-1 + nhóm). Có nhịp nghỉ giữa các trang để không bị Zalo coi là bất thường.
   */
  async fetchHistory(opts: { account?: string; threadId?: string; pages?: number }): Promise<{ account: string; added: number; pages: number; note: string }> {
    const s = this.session(opts.account);
    const api = s.api;
    if (!api) throw new Error('Phiên Zalo chưa sẵn sàng.');
    const maxPages = Math.max(1, Math.min(opts.pages ?? 6, 20));
    let added = 0;
    let pages = 0;
    if (opts.threadId && this.book.isGroup(s.accountId, opts.threadId) !== false && api.groupHistory) {
      const hist = await api.groupHistory(opts.threadId, Math.min(50 * maxPages, 1000)).catch(() => [] as ZaloMessage[]);
      added += this.addMessages(s.accountId, hist);
      pages = Math.ceil(hist.length / 50);
    }
    if (api.requestOlder && (!opts.threadId || this.book.isGroup(s.accountId, opts.threadId) === false)) {
      for (const isGroup of opts.threadId ? [false] : [false, true]) {
        for (let i = 0; i < maxPages; i++) {
          const batch = await api.requestOlder(isGroup, this.book.oldestMsgId(s.accountId, isGroup));
          pages++;
          const n = this.addMessages(s.accountId, batch);
          added += n;
          if (!batch.length || !n) break;
          await sleep(700);
        }
      }
    }
    this.manager().markActivity(s.accountId);
    return {
      account: s.label,
      added,
      pages,
      note: added
        ? `Đã thêm ${added} tin cũ vào sổ.`
        : 'Máy chủ Zalo không trả thêm tin cũ nào. Lịch sử xa hơn (nhất là chat 1-1) chỉ có trên điện thoại — mở cửa sổ Zalo Web (zalo_web_open), đồng bộ trên điện thoại rồi đọc bằng zalo_web_read.',
    };
  }

  // ── Cửa sổ Zalo Web nhúng ──────────────────────────────────────────────────────────────────────

  /** Thử nhét cookie của phiên zca vào cửa sổ Zalo Web — chỉ có tác dụng khi cửa sổ CHƯA có phiên (zaloWeb tự chặn đè). */
  private async seedWeb(account?: string): Promise<void> {
    try {
      const cookies = (await this.session(account).api?.webCookies?.()) ?? [];
      if (cookies.length) await zaloWeb.seedCookies(cookies);
    } catch {
      /* chưa đăng nhập zca — người dùng sẽ tự quét QR trong cửa sổ web */
    }
  }

  /**
   * GỘP PHIÊN: lấy phiên đã đăng nhập trong CỬA SỔ ZALO WEB đưa cho zca (gửi tin / lấy nhóm từ máy chủ dùng
   * CHUNG một phiên — Zalo chỉ cho 1 phiên web/lúc). Cookie của cửa sổ là đủ; imei là nonce zca tự sinh.
   */
  async adoptWebSession(): Promise<{ ok: boolean; account?: string; note: string }> {
    if (zaloWeb.status().loggedIn !== true) return { ok: false, note: 'Cửa sổ Zalo Web chưa đăng nhập — đăng nhập (quét QR) TRONG CỬA SỔ đó trước.' };
    const sess = await zaloWeb.exportSession();
    if (!sess) return { ok: false, note: 'Chưa lấy được phiên từ cửa sổ Zalo Web (chưa đăng nhập xong?).' };
    const imei = `${randomUUID()}-${createHash('md5').update(sess.userAgent).digest('hex')}`;
    const creds: ZaloCredentials = { imei, userAgent: sess.userAgent, cookie: { cookies: sess.cookies }, language: 'vi' };
    // Chẩn đoán (chỉ TÊN cookie, không có giá trị) — để biết có đủ cookie phiên không khi gộp lỗi.
    const want = ['zpsid', 'zpw_sek', 'zpw_enk', 'app.login', '__zi'];
    const have = want.filter((n) => sess.names.some((x) => x.toLowerCase().startsWith(n.toLowerCase())));
    const diag = `(${sess.cookies.length} cookie; thấy: ${have.join(', ') || 'KHÔNG có cookie phiên nào'})`;
    try {
      const session = await this.manager().loginWithCredentials(creds);
      this.adoptTried = true;
      return { ok: true, account: session.label, note: `Đã gộp phiên: "${session.label}" giờ gửi tin / lấy nhóm từ máy chủ dùng chung phiên của cửa sổ Zalo Web.` };
    } catch (e) {
      return { ok: false, note: `Chưa gộp được phiên: ${(e as Error)?.message || e} ${diag}. Vẫn ĐỌC được lịch sử qua cửa sổ bình thường.` };
    }
  }

  /** Tự gộp MỘT lần khi cửa sổ đã đăng nhập mà zca chưa sẵn sàng — để "một đăng nhập" chạy ngầm, không cần bấm. */
  private async autoAdopt(): Promise<void> {
    if (this.adoptTried) return;
    if (zaloWeb.status().loggedIn !== true) return;
    if (this.manager().readySessions().length) {
      this.adoptTried = true;
      return;
    }
    this.adoptTried = true;
    await this.adoptWebSession().catch(() => undefined);
  }

  /** Mở (và hiện) cửa sổ Zalo Web. Nhét sẵn cookie phiên để vào thẳng, không phải quét QR lại. */
  async webOpen(opts: { account?: string; show?: boolean } = {}): Promise<ZaloWebStatus> {
    await this.seedWeb(opts.account);
    const st = await zaloWeb.open(opts.show !== false);
    if (st.loggedIn === true) void this.autoAdopt();
    return st;
  }
  webShow(): ZaloWebStatus {
    return zaloWeb.show();
  }
  webHide(): ZaloWebStatus {
    return zaloWeb.hide();
  }
  webReload(): Promise<ZaloWebStatus> {
    return zaloWeb.reload();
  }
  webClose(): ZaloWebStatus {
    return zaloWeb.close();
  }
  webStatus(): ZaloWebStatus {
    return zaloWeb.status();
  }

  /** Đọc nội dung hội thoại ĐANG MỞ trong cửa sổ Zalo Web (người dùng tự mở đúng hội thoại + đồng bộ điện thoại). */
  async webRead(opts: { scrolls?: number } = {}): Promise<ZaloWebRead> {
    await zaloWeb.open(false); // đảm bảo cửa sổ tồn tại (không bắt buộc hiện ra)
    return zaloWeb.readOpen(opts.scrolls ?? 12);
  }
}

export const zaloService = new ZaloService();
