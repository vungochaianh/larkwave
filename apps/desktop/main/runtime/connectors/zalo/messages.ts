/**
 * Sổ tin Zalo — THUẦN (không zca-js, không electron) để kiểm được bằng node.
 *
 * Tin vào sổ từ bốn ngả:
 *  - listener của zca-js (`message` khi đang kết nối, cmd 551 cho chat 1-1 kênh E2EE);
 *  - `old_messages` (xin tin cũ khi vừa kết nối / khi người dùng bấm "Lấy thêm tin cũ");
 *  - lịch sử nhóm từ kho tin cloud;
 *  - ĐỒNG BỘ TỪ ĐIỆN THOẠI (`source: 'phone'`).
 *
 * Trước 0.1.7 sổ chỉ ở trong bộ nhớ (200 tin/hội thoại), cố ý: tin nhắn riêng thì không tự ghi ra đĩa.
 * Người dùng muốn đồng bộ được lịch sử (17/10/2026), mà một lần đồng bộ điện thoại có thể ra hàng chục nghìn
 * tin — tắt app là mất hết thì vô nghĩa. Nên nay LƯU TRÊN MÁY là một tuỳ chọn trong Cài đặt (zaloStore.ts, mã
 * hoá bằng kho khoá của hệ điều hành). Lưu thì sổ giữ nhiều hơn (`setLimits`); tắt thì về như cũ.
 */
import type { ZaloGroup, ZaloMessage } from './session';

/** Giới hạn mặc định khi KHÔNG lưu trên máy. */
export const MAX_PER_THREAD = 200;
export const MAX_THREADS = 500;

export interface ZaloThreadSummary {
  threadId: string;
  isGroup: boolean;
  /** Tên nhóm, hoặc tên người bên kia (tên hiện ở tin gần nhất của họ). */
  title: string;
  lastTs: number;
  lastText: string;
  lastFromSelf: boolean;
  count: number;
  /** Tin cũ nhất đang có (để nói rõ phạm vi). */
  firstTs?: number;
  /** Hội thoại chỉ có tin từ đồng bộ điện thoại, CHƯA khớp được id Zalo Web (không gửi tin vào được). */
  phoneOnly?: boolean;
}

interface ThreadBook {
  isGroup: boolean;
  /** Tin tăng dần theo thời gian. */
  messages: ZaloMessage[];
  ids: Set<string>;
  peerName: string;
  /** Tên đặt từ ngoài (đồng bộ điện thoại). */
  title?: string;
}

/** Dạng lưu ra đĩa của một tài khoản. */
export interface ZaloBookSnapshot {
  v: 1;
  threads: { threadId: string; isGroup: boolean; peerName: string; title?: string; messages: ZaloMessage[] }[];
  groupNames: [string, string][];
}

const keyOf = (m: ZaloMessage) => m.msgId || `${m.fromId}:${m.ts}:${m.text.slice(0, 32)}`;

export class ZaloMessageBook {
  private readonly accounts = new Map<string, Map<string, ThreadBook>>();
  private readonly groupNames = new Map<string, Map<string, string>>();
  private perThread = MAX_PER_THREAD;
  private maxThreads = MAX_THREADS;
  /** Đổi (thêm/xoá tin) từ lần lưu trước — zaloStore đọc để biết khi nào cần ghi đĩa. */
  private readonly dirty = new Set<string>();

  /** Lưu trên máy ⇒ giữ nhiều hơn. Giảm giới hạn thì cắt bớt tin CŨ ngay. */
  setLimits(perThread: number, maxThreads: number): void {
    this.perThread = Math.max(50, Math.floor(perThread));
    this.maxThreads = Math.max(50, Math.floor(maxThreads));
    for (const id of this.accounts.keys()) this.trim(id);
  }

  limits(): { perThread: number; maxThreads: number } {
    return { perThread: this.perThread, maxThreads: this.maxThreads };
  }

  add(accountId: string, messages: ZaloMessage[]): number {
    let added = 0;
    const threads = this.threads(accountId);
    for (const m of messages) {
      if (!m || !m.threadId) continue;
      let t = threads.get(m.threadId);
      if (!t) {
        t = { isGroup: m.isGroup, messages: [], ids: new Set(), peerName: '' };
        threads.set(m.threadId, t);
      }
      const key = keyOf(m);
      if (t.ids.has(key)) continue;
      t.ids.add(key);
      t.messages.push(m);
      if (!m.isSelf && m.fromName && !m.isGroup) t.peerName = m.fromName;
      added++;
    }
    if (added) {
      this.trim(accountId);
      this.dirty.add(accountId);
    }
    return added;
  }

  private trim(accountId: string): void {
    const threads = this.threads(accountId);
    for (const t of threads.values()) {
      if (t.messages.length > 1) t.messages.sort((a, b) => a.ts - b.ts);
      if (t.messages.length > this.perThread) {
        const drop = t.messages.splice(0, t.messages.length - this.perThread);
        for (const d of drop) t.ids.delete(keyOf(d));
      }
    }
    if (threads.size > this.maxThreads) {
      const oldest = [...threads.entries()].sort((a, b) => lastTs(a[1]) - lastTs(b[1])).slice(0, threads.size - this.maxThreads);
      for (const [id] of oldest) threads.delete(id);
    }
  }

  /** Bỏ tin cũ hơn mốc (giữ theo số ngày trong Cài đặt). Trả số tin đã bỏ. */
  pruneBefore(accountId: string, cutoffTs: number): number {
    let n = 0;
    const threads = this.threads(accountId);
    for (const [id, t] of threads) {
      const keep = t.messages.filter((m) => m.ts >= cutoffTs);
      if (keep.length === t.messages.length) continue;
      for (const d of t.messages) if (d.ts < cutoffTs) t.ids.delete(keyOf(d));
      n += t.messages.length - keep.length;
      t.messages = keep;
      if (!keep.length) threads.delete(id);
    }
    if (n) this.dirty.add(accountId);
    return n;
  }

  setGroupNames(accountId: string, groups: ZaloGroup[]): void {
    const m = new Map<string, string>();
    for (const g of groups) m.set(g.groupId, g.name);
    this.groupNames.set(accountId, m);
  }

  /** Đặt tên cho hội thoại (tin đồng bộ điện thoại chưa có tên người/nhóm). */
  setTitle(accountId: string, threadId: string, title: string): void {
    const t = this.threads(accountId).get(threadId);
    if (t && title && t.title !== title) {
      t.title = title;
      this.dirty.add(accountId);
    }
  }

  private titleOf(accountId: string, threadId: string, t: ThreadBook): string {
    if (t.isGroup) return this.groupNames.get(accountId)?.get(threadId) || t.title || `Nhóm ${threadId}`;
    return t.peerName || t.title || `Người dùng ${threadId}`;
  }

  /** Hội thoại gần đây, mới nhất trước. `query` lọc theo tên hội thoại / chữ tin gần nhất (không dấu). */
  recent(accountId: string, opts: { limit?: number; query?: string; groupsOnly?: boolean; usersOnly?: boolean } = {}): ZaloThreadSummary[] {
    const q = fold(opts.query || '');
    const out: ZaloThreadSummary[] = [];
    for (const [threadId, t] of this.threads(accountId)) {
      if (opts.groupsOnly && !t.isGroup) continue;
      if (opts.usersOnly && t.isGroup) continue;
      const last = t.messages[t.messages.length - 1];
      if (!last) continue;
      const title = this.titleOf(accountId, threadId, t);
      if (q && !fold(title).includes(q) && !fold(last.text).includes(q)) continue;
      out.push({
        threadId,
        isGroup: t.isGroup,
        title,
        lastTs: last.ts,
        lastText: last.text.slice(0, 200),
        lastFromSelf: last.isSelf,
        count: t.messages.length,
        firstTs: t.messages[0]?.ts,
        ...(isPhoneOnlyId(threadId) ? { phoneOnly: true } : {}),
      });
    }
    out.sort((a, b) => b.lastTs - a.lastTs);
    return out.slice(0, Math.max(1, Math.min(opts.limit ?? 20, 100)));
  }

  /**
   * Tin của một hội thoại, cũ → mới, tối đa `limit` tin CUỐI trong khoảng [since, before).
   * Đọc lùi về quá khứ: gọi lại với `before` = thời điểm tin đầu tiên của lần trước.
   */
  read(accountId: string, threadId: string, limit = 50, range: { since?: number; before?: number } = {}): ZaloMessage[] {
    const t = this.threads(accountId).get(threadId);
    if (!t) return [];
    const n = Math.max(1, Math.min(limit, this.perThread));
    const inRange = t.messages.filter((m) => (range.since === undefined || m.ts >= range.since) && (range.before === undefined || m.ts < range.before));
    return inRange.slice(-n);
  }

  /** Tìm tin theo chữ (không dấu, mọi từ đều phải có) — một hội thoại hoặc tất cả — mới nhất trước. */
  search(
    accountId: string,
    opts: { query: string; threadId?: string; since?: number; before?: number; limit?: number },
  ): { threadId: string; title: string; isGroup: boolean; message: ZaloMessage }[] {
    const words = fold(opts.query || '').split(/\s+/).filter(Boolean);
    const out: { threadId: string; title: string; isGroup: boolean; message: ZaloMessage }[] = [];
    for (const [threadId, t] of this.threads(accountId)) {
      if (opts.threadId && threadId !== opts.threadId) continue;
      const title = this.titleOf(accountId, threadId, t);
      for (const m of t.messages) {
        if (opts.since !== undefined && m.ts < opts.since) continue;
        if (opts.before !== undefined && m.ts >= opts.before) continue;
        const hay = fold(`${m.text} ${m.fromName}`);
        if (words.length && !words.every((w) => hay.includes(w))) continue;
        out.push({ threadId, title, isGroup: t.isGroup, message: m });
      }
    }
    out.sort((a, b) => b.message.ts - a.message.ts);
    return out.slice(0, Math.max(1, Math.min(opts.limit ?? 30, 200)));
  }

  /** Id của tin Zalo Web CŨ nhất theo loại hội thoại — mốc để xin trang tin cũ kế tiếp. */
  oldestMsgId(accountId: string, isGroup: boolean): string | undefined {
    let best: ZaloMessage | undefined;
    for (const t of this.threads(accountId).values()) {
      if (t.isGroup !== isGroup) continue;
      for (const m of t.messages) if (m.msgId && /^\d+$/.test(m.msgId) && !m.source && (!best || m.ts < best.ts)) best = m;
    }
    return best?.msgId;
  }

  /** Mọi tin Zalo Web đã thấy (không gồm tin điện thoại) — để khớp id điện thoại → id Zalo Web. */
  known(accountId: string): ZaloMessage[] {
    const out: ZaloMessage[] = [];
    for (const t of this.threads(accountId).values()) for (const m of t.messages) if (!m.source) out.push(m);
    return out;
  }

  stats(accountId: string): { threads: number; messages: number; phoneMessages: number; oldestTs?: number } {
    let messages = 0;
    let phoneMessages = 0;
    let oldestTs: number | undefined;
    const threads = this.threads(accountId);
    for (const t of threads.values()) {
      messages += t.messages.length;
      for (const m of t.messages) if (m.source === 'phone') phoneMessages++;
      const first = t.messages[0]?.ts;
      if (first !== undefined && (oldestTs === undefined || first < oldestTs)) oldestTs = first;
    }
    return { threads: threads.size, messages, phoneMessages, ...(oldestTs !== undefined ? { oldestTs } : {}) };
  }

  isGroup(accountId: string, threadId: string): boolean | undefined {
    return this.threads(accountId).get(threadId)?.isGroup;
  }

  clear(accountId: string): void {
    this.accounts.delete(accountId);
    this.groupNames.delete(accountId);
    this.dirty.add(accountId);
  }

  /** Lấy rồi XOÁ cờ "đã đổi" của một tài khoản. */
  takeDirty(accountId: string): boolean {
    return this.dirty.delete(accountId);
  }

  dirtyAccounts(): string[] {
    return [...this.dirty];
  }

  snapshot(accountId: string): ZaloBookSnapshot {
    return {
      v: 1,
      threads: [...this.threads(accountId).entries()].map(([threadId, t]) => ({ threadId, isGroup: t.isGroup, peerName: t.peerName, ...(t.title ? { title: t.title } : {}), messages: t.messages })),
      groupNames: [...(this.groupNames.get(accountId) ?? new Map<string, string>()).entries()],
    };
  }

  /** Nạp bản đã lưu (gộp với tin đã có trong bộ nhớ, không đánh dấu "đã đổi"). */
  restore(accountId: string, snap: ZaloBookSnapshot | null | undefined): number {
    if (!snap || snap.v !== 1 || !Array.isArray(snap.threads)) return 0;
    const had = this.dirty.has(accountId);
    let n = 0;
    for (const th of snap.threads) {
      if (!th?.threadId || !Array.isArray(th.messages)) continue;
      n += this.add(accountId, th.messages.map((m) => ({ ...m, threadId: th.threadId, isGroup: !!th.isGroup })));
      const t = this.threads(accountId).get(th.threadId);
      if (t) {
        if (th.peerName && !t.peerName) t.peerName = th.peerName;
        if (th.title && !t.title) t.title = th.title;
      }
    }
    if (Array.isArray(snap.groupNames) && !this.groupNames.has(accountId)) this.groupNames.set(accountId, new Map(snap.groupNames));
    if (!had) this.dirty.delete(accountId);
    return n;
  }

  private threads(accountId: string): Map<string, ThreadBook> {
    let m = this.accounts.get(accountId);
    if (!m) {
      m = new Map();
      this.accounts.set(accountId, m);
    }
    return m;
  }
}

function lastTs(t: ThreadBook): number {
  return t.messages[t.messages.length - 1]?.ts ?? 0;
}

/** Id hội thoại chỉ có từ điện thoại (chưa khớp id Zalo Web): `phone:u:<số>` / `phone:g:<số>`. */
export const phoneThreadId = (isGroup: boolean, shortId: string) => `phone:${isGroup ? 'g' : 'u'}:${shortId}`;
export const isPhoneOnlyId = (threadId: string) => threadId.startsWith('phone:');

/** Bỏ dấu + chữ thường, để "lan anh" khớp "Lan Ánh". */
export function fold(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}
