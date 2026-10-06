'use client';
import { useEffect, useRef } from 'react';
import type { RuntimeAdapter } from '@larkwave/core';
import { accountApi } from '../../account/api';

/**
 * The OWNER's side of delegated access: poll for turns friends have queued, execute each
 * one locally under this machine's copy of the policy, and report the result back.
 *
 * Polling (not SSE) because the desktop reaches the API through the main-process
 * accountFetch proxy, which buffers — the same reason the DM inbox polls. It is also why
 * nothing here needs new auth plumbing in main: the renderer already holds the token.
 *
 * Execution is strictly one-at-a-time so a burst of requests can't spawn parallel agents
 * on the owner's machine.
 */
export function useGrantGateway(runtime: RuntimeAdapter, enabled: boolean) {
  const running = useRef(false);

  useEffect(() => {
    // Either executor being present means this is a desktop that can run delegated turns.
    if (!enabled || (!runtime.larkRunGrantTurn && !runtime.larkRunAgentGrantTurn)) return;
    let dead = false;

    const tick = async () => {
      if (dead || running.current) return;
      // Claim the slot BEFORE the first await. Setting it after the fetch let two
      // overlapping ticks read the same queue and execute every turn twice — double
      // token spend, and duplicate writes once write mode exists.
      running.current = true;
      let queued: { id: string; grantId: string; prompt: string; kind?: 'lark' | 'agentchat' }[] = [];
      try {
        queued = await accountApi.larkGrantQueuedTurns();
      } catch {
        running.current = false;
        return; // offline / not signed in — try again next tick
      }
      if (!queued.length) {
        running.current = false;
        return;
      }
      try {
        // Small batch per tick: the next tick re-fetches, so a pause or revoke lands
        // within seconds instead of after a long pre-fetched run.
        for (const t of queued.slice(0, 3)) {
          if (dead) break;
          // Route by kind: a shared "Trợ lý AI" (agentchat) turn runs the READ-ONLY general
          // assistant; a Lark grant runs under this machine's Lark connection + policy. An
          // OLD main that lacks the needed executor leaves the turn queued (skipped here).
          const exec =
            t.kind === 'agentchat' ? runtime.larkRunAgentGrantTurn : runtime.larkRunGrantTurn;
          if (!exec) continue;
          try {
            await accountApi.larkGrantReportTurn(t.id, { status: 'running' });
            const r = await exec(t.grantId, t.prompt);
            await accountApi.larkGrantReportTurn(t.id, {
              // A policy miss is a DENY, not a failure: the owner simply never granted
              // this scope on this machine.
              status: r.ok ? 'succeeded' : 'denied',
              result: r.ok ? r.text : undefined,
              error: r.ok ? undefined : r.error,
            });
          } catch (e) {
            try {
              await accountApi.larkGrantReportTurn(t.id, {
                status: 'failed',
                error: e instanceof Error ? e.message : 'Lỗi không xác định',
              });
            } catch {
              /* the turn stays queued and will be retried */
            }
          }
        }
      } finally {
        running.current = false;
      }
    };

    void tick();
    const iv = setInterval(() => void tick(), 6000);
    return () => {
      dead = true;
      clearInterval(iv);
    };
  }, [runtime, enabled]);
}
