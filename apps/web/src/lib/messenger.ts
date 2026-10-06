import type { Friend } from "@larkwave/shared";

/**
 * Tiny global pub/sub so any page (e.g. /friends "Nhắn tin", or a notification
 * deep-link) can pop open a floating Messenger chat window owned by the global
 * <MessengerWidget /> mounted in AppShell.
 */
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
