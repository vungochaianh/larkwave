/**
 * Sổ tin Zalo — THUẦN (không zca-js, không electron) để kiểm được bằng node.
 *
 * Tin đến từ listener của zca-js (`message` khi đang kết nối, `old_messages` khi vừa kết nối xin đồng bộ)
 * và từ lịch sử nhóm. zca-js KHÔNG có hàm đọc lịch sử chat 1-1, nên "đọc hội thoại" = đọc sổ này.
 *
 * CHỈ GIỮ TRONG BỘ NHỚ, cố ý: đây là tin nhắn riêng của người dùng. Ghi ra đĩa là thêm một bản sao
 * dạng thường mà không ai hỏi tới; tắt app thì mất, mở lại thì Zalo đồng bộ lại tin gần đây.
 */
import type { ZaloGroup, ZaloMessage } from './session';

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
}

interface ThreadBook {
  isGroup: boolean;
  /** Tin tăng dần theo thời gian. */
  messages: ZaloMessage[];
  ids: Set<string>;
  peerName: string;
}

export class ZaloMessageBook {
  private readonly accounts = new Map<string, Map<string, ThreadBook>>();
  private readonly groupNames = new Map<string, Map<string, string>>();

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
      const key = m.msgId || `${m.fromId}:${m.ts}:${m.text.slice(0, 32)}`;
      if (t.ids.has(key)) continue;
      t.ids.add(key);
      t.messages.push(m);
      if (!m.isSelf && m.fromName && !m.isGroup) t.peerName = m.fromName;
      added++;
    }
    for (const t of threads.values()) {
      if (t.messages.length > 1) t.messages.sort((a, b) => a.ts - b.ts);
      if (t.messages.length > MAX_PER_THREAD) {
        const drop = t.messages.splice(0, t.messages.length - MAX_PER_THREAD);
        for (const d of drop) t.ids.delete(d.msgId || `${d.fromId}:${d.ts}:${d.text.slice(0, 32)}`);
      }
    }
    if (threads.size > MAX_THREADS) {
      const oldest = [...threads.entries()].sort((a, b) => lastTs(a[1]) - lastTs(b[1])).slice(0, threads.size - MAX_THREADS);
      for (const [id] of oldest) threads.delete(id);
    }
    return added;
  }

  setGroupNames(accountId: string, groups: ZaloGroup[]): void {
    const m = new Map<string, string>();
    for (const g of groups) m.set(g.groupId, g.name);
    this.groupNames.set(accountId, m);
  }

  /** Hội thoại gần đây, mới nhất trước. `query` lọc theo tên hội thoại / chữ tin gần nhất (không dấu). */
  recent(accountId: string, opts: { limit?: number; query?: string; groupsOnly?: boolean; usersOnly?: boolean } = {}): ZaloThreadSummary[] {
    const names = this.groupNames.get(accountId);
    const q = fold(opts.query || '');
    const out: ZaloThreadSummary[] = [];
    for (const [threadId, t] of this.threads(accountId)) {
      if (opts.groupsOnly && !t.isGroup) continue;
      if (opts.usersOnly && t.isGroup) continue;
      const last = t.messages[t.messages.length - 1];
      if (!last) continue;
      const title = t.isGroup ? names?.get(threadId) || `Nhóm ${threadId}` : t.peerName || `Người dùng ${threadId}`;
      if (q && !fold(title).includes(q) && !fold(last.text).includes(q)) continue;
      out.push({ threadId, isGroup: t.isGroup, title, lastTs: last.ts, lastText: last.text.slice(0, 200), lastFromSelf: last.isSelf, count: t.messages.length });
    }
    out.sort((a, b) => b.lastTs - a.lastTs);
    return out.slice(0, Math.max(1, Math.min(opts.limit ?? 20, 100)));
  }

  /** Tin của một hội thoại, cũ → mới, tối đa `limit` tin CUỐI. */
  read(accountId: string, threadId: string, limit = 50): ZaloMessage[] {
    const t = this.threads(accountId).get(threadId);
    if (!t) return [];
    const n = Math.max(1, Math.min(limit, MAX_PER_THREAD));
    return t.messages.slice(-n);
  }

  isGroup(accountId: string, threadId: string): boolean | undefined {
    return this.threads(accountId).get(threadId)?.isGroup;
  }

  clear(accountId: string): void {
    this.accounts.delete(accountId);
    this.groupNames.delete(accountId);
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
