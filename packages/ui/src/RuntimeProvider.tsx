'use client';
import { createContext, useContext, type ReactNode } from 'react';
import type { RuntimeAdapter } from '@larkwave/core';

const RuntimeContext = createContext<RuntimeAdapter | null>(null);

/**
 * Wrap the app once with the platform's adapter. Web passes WebRuntimeAdapter;
 * the desktop renderer passes IpcRuntimeAdapter. Everything below is identical.
 */
export function RuntimeProvider({
  runtime,
  children,
}: {
  runtime: RuntimeAdapter;
  children: ReactNode;
}) {
  return <RuntimeContext.Provider value={runtime}>{children}</RuntimeContext.Provider>;
}

export function useRuntime(): RuntimeAdapter {
  const r = useContext(RuntimeContext);
  if (!r) throw new Error('useRuntime() must be used inside <RuntimeProvider>');
  return r;
}
