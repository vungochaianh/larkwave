/**
 * Next.js instrumentation — runs once when the server starts.
 *
 * Node.js 25+ exposes a broken `localStorage` global (object exists but
 * methods like getItem/setItem are undefined when --localstorage-file is
 * missing). This causes 'use client' components that reference localStorage
 * to crash during SSR.  We patch it with a no-op shim so SSR proceeds
 * without errors — client-side hydration will use the real browser
 * localStorage as usual.
 */
export function register() {
  if (typeof window === 'undefined') {
    const store = new Map<string, string>();
    const shim = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, String(v)); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
      get length() { return store.size; },
      key: (i: number) => [...store.keys()][i] ?? null,
    };
    // Replace the entire global — Node 25's localStorage is a frozen Proxy
    Object.defineProperty(globalThis, 'localStorage', {
      value: shim,
      writable: true,
      configurable: true,
    });
  }
}
