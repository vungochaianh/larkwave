'use client';
import { useCallback, useEffect, useState } from 'react';
import type { RunningPreview, RuntimeAdapter } from '@larkwave/core';
import { useRuntime } from './RuntimeProvider';

/**
 * The ONE poll of the main-process preview registry (every dev server running now, across all
 * apps). Both the header "Cổng đang chạy" badge and the open ports panel read it, so the poller
 * is module-scoped and REFCOUNTED — N mounted consumers still means exactly one 4s timer and one
 * IPC round-trip, not one per component (the same single-window reasoning as appEvents.ts).
 *
 * On web `listRunningPreviews` is undefined (previews are server-side): no timer is ever started
 * and the hook reports an empty, settled list so callers can render nothing.
 */

const POLL_MS = 4000;

interface Snapshot {
  rows: RunningPreview[];
  /** True until the first result lands, and during an explicit `reload()`. Background polls
   *  do NOT flip it — otherwise the panel's "Làm mới" button would spin every 4 seconds. */
  loading: boolean;
}

let snapshot: Snapshot = { rows: [], loading: true };
const subs = new Set<(s: Snapshot) => void>();
let timer: ReturnType<typeof setInterval> | null = null;
/** In-flight fetch, so a manual reload during a poll reuses it instead of racing it. */
let pending: Promise<void> | null = null;
/** The live adapter, set by the hook before it subscribes (one runtime per renderer). */
let adapter: RuntimeAdapter | null = null;

function set(next: Snapshot): void {
  snapshot = next;
  for (const cb of [...subs]) cb(next);
}

function refresh(showLoading = false): Promise<void> {
  const list = adapter?.listRunningPreviews?.bind(adapter);
  if (!list) {
    // Web / an older main process without the channel — settle empty, never poll.
    if (snapshot.loading || snapshot.rows.length) set({ rows: [], loading: false });
    return Promise.resolve();
  }
  if (showLoading && !snapshot.loading) set({ ...snapshot, loading: true });
  // Background polls coalesce onto an in-flight fetch. An EXPLICIT reload must not: it is called
  // right after a stop/restart, and a poll started before that mutation would resolve with the
  // pre-stop list — leaving the killed server on screen for another 4s. Chain a fresh one instead.
  if (pending && !showLoading) return pending;
  const next: Promise<void> = (pending ?? Promise.resolve())
    .then(() => list())
    .then((r) => set({ rows: Array.isArray(r) ? r : [], loading: false }))
    .catch(() => set({ rows: [], loading: false }))
    .finally(() => {
      if (pending === next) pending = null;
    });
  pending = next;
  return next;
}

function subscribe(cb: (s: Snapshot) => void): () => void {
  subs.add(cb);
  cb(snapshot);
  if (subs.size === 1) {
    void refresh();
    if (adapter?.listRunningPreviews) timer = setInterval(() => void refresh(), POLL_MS);
  }
  return () => {
    subs.delete(cb);
    if (subs.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export interface RunningPreviewsState {
  /** Every dev server running now, across ALL apps. Empty on web. */
  rows: RunningPreview[];
  loading: boolean;
  /** Refetch immediately — call it right after a stop/restart so the list doesn't lag 4s. */
  reload: () => Promise<void>;
}

export function useRunningPreviews(): RunningPreviewsState {
  const runtime = useRuntime();
  const [state, setState] = useState<Snapshot>(snapshot);

  useEffect(() => {
    adapter = runtime;
    return subscribe(setState);
  }, [runtime]);

  const reload = useCallback(() => refresh(true), []);

  return { rows: state.rows, loading: state.loading, reload };
}
