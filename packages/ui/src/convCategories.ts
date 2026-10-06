// Conversation categories — a renderer-only organizational layer over the local apps. Apps ARE the
// conversations; a category groups them. Persisted per-machine in localStorage and broadcast so the
// sidebar organizer + the "App của tôi" grid stay in sync live.

export const CATS_KEY = 'tw-conv-categories-v1';
export const UNCAT = '__uncat__';
const EVT = 'tw-conv-categories-changed';

export interface Category {
  id: string;
  name: string;
}
export interface CatStore {
  categories: Category[];
  appCat: Record<string, string>; // appId → categoryId
  pinned?: Record<string, boolean>; // appId → pinned (sidebar: pinned-first, always visible)
}

export function loadCats(): CatStore {
  if (typeof window === 'undefined') return { categories: [], appCat: {}, pinned: {} };
  try {
    const s = JSON.parse(localStorage.getItem(CATS_KEY) || 'null');
    if (s && Array.isArray(s.categories)) return { categories: s.categories, appCat: s.appCat || {}, pinned: s.pinned || {} };
  } catch {
    /* ignore */
  }
  return { categories: [], appCat: {}, pinned: {} };
}

/** True if the app is pinned in the sidebar (per-machine). */
export function isPinned(store: CatStore, appId: string): boolean {
  return !!store.pinned?.[appId];
}

/** Toggle an app's pinned state + persist + broadcast (sidebar re-renders via onCatsChange). */
export function togglePin(appId: string): void {
  const s = loadCats();
  const pinned = { ...(s.pinned || {}) };
  if (pinned[appId]) delete pinned[appId];
  else pinned[appId] = true;
  saveCats({ ...s, pinned });
}

export function saveCats(s: CatStore): void {
  try {
    localStorage.setItem(CATS_KEY, JSON.stringify(s));
    window.dispatchEvent(new Event(EVT)); // notify the other organizer view
  } catch {
    /* ignore */
  }
}

/** Subscribe to category changes (from any view). Returns an unsubscribe fn. */
export function onCatsChange(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const h = () => cb();
  window.addEventListener(EVT, h);
  return () => window.removeEventListener(EVT, h);
}

export function newCategoryId(): string {
  // No Math.random/Date in some sandboxes — but this runs in the browser where both exist.
  return `c-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
}
