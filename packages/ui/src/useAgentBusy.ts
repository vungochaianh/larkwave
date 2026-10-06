'use client';
import { useEffect, useState } from 'react';
import type { AgentBusyOwner } from '@larkwave/core';
import { useRuntime } from './RuntimeProvider';

/**
 * Mirror of the main-process shared AI turn-lock. Every tab subscribes, so while one tab
 * (or the phone relay) is mid-answer, the others can truthfully show a blocked composer
 * instead of silently failing on send. Returns null when no turn is running, or on web /
 * an older main process without the channel.
 */
export function useAgentBusy(): AgentBusyOwner | null {
  const runtime = useRuntime();
  const [owner, setOwner] = useState<AgentBusyOwner | null>(null);
  useEffect(() => {
    if (!runtime.onAgentBusy) return;
    let alive = true;
    // Pull the CURRENT owner first — the push only fires on CHANGE, so a tab mounting
    // mid-turn would otherwise show Send enabled until the running turn ends.
    void runtime.agentBusyNow?.().then((o) => {
      if (alive) setOwner(o);
    });
    const off = runtime.onAgentBusy(setOwner);
    return () => {
      alive = false;
      off();
    };
  }, [runtime]);
  return owner;
}
