/**
 * Which assistant answers are COLLAPSED, per Lark session. A view preference, so it
 * lives in localStorage (per machine) — deliberately NOT on ChatItem and NOT in the
 * saved session:
 *   - a flag on ChatItem would ride into the public share payload (the share upload
 *     sends `items` verbatim), making a private view state publicly readable;
 *   - saving per click would bump the session's updatedAt and reorder the history
 *     sidebar every time you folded a paragraph.
 * Mirrors convCategories.ts: versioned key, SSR guard, try/catch on read AND write,
 * shape guard, same-window change event.
 */

export const FOLD_KEY = 'tw-lark-fold-v1';
const EVT = 'tw-lark-fold-changed';

export interface FoldSession {
  /** Last touched, ms — used to prune the store. */
  t: number;
  /** ChatItem ids currently folded. */
  ids: string[];
}

export interface FoldStore {
  v: 1;
  /** Auto-fold long answers when a session is first opened. */
  auto: boolean;
  /** The one-time "answers were folded" hint has been dismissed. */
  hintSeen: boolean;
  sessions: Record<string, FoldSession>;
}

const empty = (): FoldStore => ({ v: 1, auto: false, hintSeen: false, sessions: {} });

export function loadFold(): FoldStore {
  if (typeof window === 'undefined') return empty();
  try {
    const raw = JSON.parse(window.localStorage.getItem(FOLD_KEY) || 'null') as FoldStore | null;
    if (!raw || raw.v !== 1 || typeof raw.sessions !== 'object' || raw.sessions === null) return empty();
    // Shape-guard every entry: a hand-edited or half-written store must not crash the chat.
    const sessions: Record<string, FoldSession> = {};
    for (const [id, s] of Object.entries(raw.sessions)) {
      if (s && Array.isArray(s.ids)) {
        sessions[id] = { t: typeof s.t === 'number' ? s.t : 0, ids: s.ids.filter((x) => typeof x === 'string') };
      }
    }
    return { v: 1, auto: !!raw.auto, hintSeen: !!raw.hintSeen, sessions };
  } catch {
    return empty();
  }
}

export function saveFold(s: FoldStore): void {
  if (typeof window === 'undefined') return;
  // Keep the store small: drop empty entries, then the 40 most recently touched sessions.
  const kept = Object.entries(s.sessions)
    .filter(([, v]) => v.ids.length > 0)
    .sort((a, b) => b[1].t - a[1].t)
    .slice(0, 40);
  const next: FoldStore = { v: 1, auto: s.auto, hintSeen: s.hintSeen, sessions: Object.fromEntries(kept) };
  try {
    window.localStorage.setItem(FOLD_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode — folding still works for this run */
  }
  window.dispatchEvent(new Event(EVT));
}

export function onFoldChange(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVT, cb);
  return () => window.removeEventListener(EVT, cb);
}

/** An answer long enough that folding it by default is a kindness, not a surprise. */
export function isLongAnswer(text: string): boolean {
  return text.length > 1100 || text.split('\n').length > 26;
}
