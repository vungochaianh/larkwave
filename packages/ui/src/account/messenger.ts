import type { Friend } from './api';

// Tiny global pub/sub so any screen (e.g. FriendsView "Nhắn tin") can pop open a chat window owned
// by the single <MessengerWidget/> mounted in AppShell. Ported from apps/web/src/lib/messenger.ts.
type Listener = (friend: Friend) => void;
const listeners = new Set<Listener>();

/** Open (or focus) a floating chat window for this friend, from anywhere. */
export function openMessenger(friend: Friend): void {
  listeners.forEach((l) => l(friend));
}

/** Subscribe to open requests; returns an unsubscribe fn. */
export function onOpenMessenger(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// How many floating chat windows are open right now, so other fixed/floating UI (e.g. the
// "báo lỗi" FAB) can move out of the way instead of covering the chat.
type CountListener = (n: number) => void;
const countListeners = new Set<CountListener>();
let openWindowCount = 0;

/** MessengerWidget calls this whenever its open-window count changes. */
export function emitMessengerWindows(n: number): void {
  openWindowCount = n;
  countListeners.forEach((l) => l(n));
}

/** Subscribe to the open-window count (fires immediately with the current value). */
export function onMessengerWindows(listener: CountListener): () => void {
  countListeners.add(listener);
  listener(openWindowCount);
  return () => {
    countListeners.delete(listener);
  };
}
