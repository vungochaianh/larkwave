/**
 * Luật hợp nhất dữ liệu Lark giữa hai bản (máy ⇄ máy chủ, và Toolswave → Larkwave khi nhập).
 * Tách khỏi larkService để bộ nhập dữ liệu Toolswave (runtime/migrate) dùng ĐÚNG luật này —
 * hai bản chép rồi trôi lệch nhau là kiểu hỏng lặng lẽ nhất. Thuần: không electron.
 */
import type { LarkBaseRef, LarkNoteDoc, LarkSpecDoc, SpecBase, SpecInsight, SpecRelation, SpecSyncEntry, SpecWorkflow } from '@larkwave/core';

/** A persisted Lark chat session (claudeSessionId drives `--resume`; items are the
 *  renderer's chat bubbles/tool cards, stored opaquely for full restore). */
export interface StoredSession {
  id: string;
  claudeSessionId: string;
  /** Agent session id (Claude --resume; others: logical id + UI transcript). */
  agentSessionId?: string;
  runner?: string;
  model?: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  items: unknown[];
  /** The Bases applied to this conversation (the agent works across them). */
  bases?: LarkBaseRef[];
  /** User-authored notes + todos for this conversation. */
  notes?: LarkNoteDoc;
  /** 'workflow' = hội thoại của chế độ "Tạo workflow" (danh sách riêng). */
  kind?: 'workflow';
  /** AI summaries of collapsed answers, keyed by chat-item id. Cached because each
   *  one costs a model call — regenerating on every reopen would burn tokens. */
  summaries?: Record<string, string>;
}


/**
 * Union chat items of one conversation from two devices by their stable id, so NO turn is
 * lost when both diverged. The newer side (by session.updatedAt) sets the order; any item
 * the other side has but the newer lacks (e.g. a turn appended offline on the losing side)
 * is kept, appended after. Wholesale last-write-wins would silently delete the offline
 * turn. Returns `base` unchanged (same ref) when nothing extra needs adding.
 */
export function mergeItems(base: unknown[], other: unknown[]): unknown[] {
  const idOf = (it: unknown) => (it && typeof it === 'object' ? (it as { id?: unknown }).id : undefined);
  const have = new Set(base.map(idOf).filter((x) => typeof x === 'string'));
  const extra = other.filter((it) => {
    const id = idOf(it);
    return typeof id === 'string' && !have.has(id);
  });
  return extra.length ? [...base, ...extra] : base;
}

/**
 * Merge two copies of one conversation for cross-device backup. Items are UNIONED by id so
 * a divergent offline turn on either side is never lost; title/bases follow the newer side.
 * Notes + summaries merge INDEPENDENTLY of session.updatedAt — notes deliberately do NOT
 * bump it (so jotting one never reorders the history list), which means a
 * session.updatedAt-only comparison would silently drop a device's notes when both sides
 * share the same updatedAt. Notes win by their own doc.updatedAt; summaries union (they're
 * append-only per item). Returns `local` unchanged when nothing changed, so the caller only
 * rewrites the file when it actually differs.
 */
/** Số lượt giữ lại trong hội thoại của một lịch (20 lần chạy). Dùng CHUNG với saveScheduledResult
 *  — hai con số lệch nhau là tệp cứ phình rồi bị cắt qua lại mỗi lần đồng bộ. */
export const SCHED_ITEM_CAP = 40;

export function mergeSession(local: StoredSession, remote: StoredSession): StoredSession {
  const remoteNewer = (remote.updatedAt || '') > (local.updatedAt || '');
  const base = remoteNewer ? remote : local;
  const other = remoteNewer ? local : remote;
  let items = mergeItems(base.items ?? [], other.items ?? []);
  // Hội thoại của một LỊCH bị cắt bớt ở máy (giữ 40 lượt gần nhất). Nhưng `mergeItems` là phép
  // HỢP theo id rồi NỐI phần thừa vào CUỐI, nên những lượt vừa bị cắt lại được máy chủ trả về —
  // tệp phình lại như cũ, và lượt CŨ nằm DƯỚI lượt MỚI khi mở hội thoại. Sắp theo `ts` rồi cắt
  // lại ở đây là chỗ DUY NHẤT chặn được cả hai, vì đây là nơi hai bản gặp nhau.
  if ((base.id || local.id || '').startsWith('sched-') && items.length > SCHED_ITEM_CAP) {
    const tsOf = (it: unknown) => Number((it as { ts?: number })?.ts ?? 0);
    items = [...items].sort((a, b) => tsOf(a) - tsOf(b)).slice(-SCHED_ITEM_CAP);
  }
  const notes =
    (remote.notes?.updatedAt || '') > (local.notes?.updatedAt || '') ? remote.notes : local.notes;
  const summaries =
    local.summaries || remote.summaries ? { ...(other.summaries ?? {}), ...(base.summaries ?? {}) } : undefined;
  // No change to the local copy? return it as-is so the caller skips the rewrite.
  if (
    base === local &&
    items === local.items &&
    notes === local.notes &&
    summariesEqual(summaries, local.summaries)
  ) {
    return local;
  }
  return { ...base, items, notes, ...(summaries ? { summaries } : {}) };
}

export function summariesEqual(a?: Record<string, string>, b?: Record<string, string>): boolean {
  const ak = a ? Object.keys(a) : [];
  const bk = b ? Object.keys(b) : [];
  if (ak.length !== bk.length) return false;
  return ak.every((k) => a?.[k] === b?.[k]);
}

/**
 * Merge two copies of the "Đặc tả" doc for cross-device backup. Each Base is re-fetched
 * atomically per sync, so union-by-appToken (newer source.fetchedAt wins the whole Base) is
 * both correct and safe: two devices that synced DIFFERENT Bases keep both; two that synced
 * the same one keep the fresher read. Workflows union by id (newer wins). Insights union by
 * hash (dismissed is sticky). Overview is user-owned → last-write-wins by its own updatedAt.
 * Relations union by (from→to:field). Returns null-safe: either side may be missing.
 */
export function mergeSpec(local: LarkSpecDoc | null, remote: LarkSpecDoc | null): LarkSpecDoc | null {
  if (!local) return remote;
  if (!remote) return local;
  const newerAt = (a?: { fetchedAt?: string }, b?: { fetchedAt?: string }) =>
    (a?.fetchedAt || '') >= (b?.fetchedAt || '');

  const bases = new Map<string, SpecBase>();
  for (const b of local.bases) bases.set(b.appToken, b);
  for (const b of remote.bases) {
    const ex = bases.get(b.appToken);
    if (!ex || !newerAt(ex.source, b.source)) bases.set(b.appToken, b);
  }
  const workflows = new Map<string, SpecWorkflow>();
  for (const w of local.workflows) workflows.set(w.workflowId, w);
  for (const w of remote.workflows) {
    const ex = workflows.get(w.workflowId);
    if (!ex || !newerAt(ex.source, w.source)) workflows.set(w.workflowId, w);
  }
  const insights = new Map<string, SpecInsight>();
  for (const i of [...local.insights, ...remote.insights]) {
    const ex = insights.get(i.hash);
    if (!ex) insights.set(i.hash, i);
    else insights.set(i.hash, { ...ex, dismissed: ex.dismissed || i.dismissed });
  }
  const relations = new Map<string, SpecRelation>();
  for (const r of [...local.relations, ...remote.relations])
    relations.set(`${r.fromTableId}->${r.toTableId}:${r.viaFieldId ?? ''}`, r);
  const syncLog = new Map<string, SpecSyncEntry>();
  for (const e of [...local.syncLog, ...remote.syncLog]) syncLog.set(e.at, e);
  const overview =
    (remote.overview?.updatedAt || '') > (local.overview?.updatedAt || '') ? remote.overview : local.overview;

  return {
    v: 1,
    updatedAt: (remote.updatedAt || '') > (local.updatedAt || '') ? remote.updatedAt : local.updatedAt,
    overview,
    bases: [...bases.values()],
    workflows: [...workflows.values()],
    relations: [...relations.values()],
    insights: [...insights.values()],
    syncLog: [...syncLog.values()].sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, 50),
  };
}
