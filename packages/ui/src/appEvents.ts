'use client';
import type { AppSummary } from '@larkwave/core';

/**
 * A same-window change bus so every MOUNTED tab reflects data changes instantly — tab 2
 * creates a project and tab 1's list shows it in the same frame. There is exactly ONE
 * renderer BrowserWindow, so a module-scoped CustomEvent is enough (the same idiom as
 * convCategories.ts / larkFold.ts):
 *   - NOT the `storage` event: it doesn't fire in the window that wrote it.
 *   - NOT BroadcastChannel: there are no other windows to reach.
 *   - NOT React context: the only place to host it is HomeShell, and changing a context
 *     value re-renders every mounted AppWorkspace — exactly what tabs must NOT do.
 *
 * The source of truth stays `runtime.listApps()`. The optimistic layer below only bridges
 * the gap between "user started a build" and "meta.json exists on disk", because Composer
 * navigates away before createBuild writes the app dir — so a bare refresh would re-read a
 * list that doesn't contain the new app yet and lose the race.
 */

const EVT = 'tw-apps-changed';

/** Optimistic apps not yet returned by listApps(), keyed by id. Module-scoped, no storage. */
const optimistic = new Map<string, AppSummary>();

let coalesceTimer: ReturnType<typeof setTimeout> | null = null;

/** Broadcast "apps changed" to every mounted subscriber. Coalesced (~250ms): one build
 *  streams many events, and each listApps() on desktop is a readdir + N meta.json reads. */
export function notifyAppsChanged(): void {
  if (typeof window === 'undefined') return;
  if (coalesceTimer) return;
  coalesceTimer = setTimeout(() => {
    coalesceTimer = null;
    try {
      window.dispatchEvent(new Event(EVT));
    } catch {
      /* ignore */
    }
  }, 250);
}

export function onAppsChange(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVT, cb);
  return () => window.removeEventListener(EVT, cb);
}

/** Record an app that a tab just started creating, before it exists on disk. */
export function upsertOptimisticApp(app: AppSummary): void {
  optimistic.set(app.id, app);
  notifyAppsChanged();
}

/** Drop the placeholder once the real app is on disk (or the create was abandoned). */
export function dropOptimisticApp(id: string): void {
  if (optimistic.delete(id)) notifyAppsChanged();
}

/**
 * Merge pending placeholders into a freshly-fetched list. A placeholder is dropped the
 * moment listApps() returns its real id (disk is now authoritative for it); the rest are
 * appended so a just-created project shows immediately in every tab's grid + sidebar.
 */
export function mergeOptimistic(apps: AppSummary[]): AppSummary[] {
  if (optimistic.size === 0) return apps;
  const real = new Set(apps.map((a) => a.id));
  let changed = false;
  for (const id of optimistic.keys()) {
    if (real.has(id)) {
      optimistic.delete(id);
      changed = true;
    }
  }
  if (changed && optimistic.size === 0) return apps;
  const extra = [...optimistic.values()].filter((a) => !real.has(a.id));
  return extra.length ? [...extra, ...apps] : apps;
}
