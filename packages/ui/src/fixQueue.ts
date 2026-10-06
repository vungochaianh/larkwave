'use client';
import { useEffect, useRef, useState } from 'react';
import { App as AntApp } from 'antd';
import { useRuntime } from './RuntimeProvider';
import { useAgentBusy } from './useAgentBusy';
import { desktopRunnerPrefs } from './runnerPrefs';
import { notifyAppsChanged } from './appEvents';

/**
 * Global "quick-fix" queue for the Tổng quan "Cần xử lý" band. Diagnose-and-fix builds share the
 * app's single AI turn-lock, so we QUEUE them and run ONE AT A TIME. The queue lives in a module
 * store (survives view navigation) driven by a single always-mounted <FixQueueDriver/>, and is read
 * by both the error-app cards and the header "AI đang chạy" indicator (running + waiting).
 */
export type FixPhase = 'queued' | 'running' | 'done' | 'error';
export interface FixItem {
  appId: string;
  name: string;
  phase: FixPhase;
  note?: string;
}

const FIX_PROMPT =
  'App này đang bị đánh dấu LỖI (lần dựng trước có thể bị GIÁN ĐOẠN hoặc thiếu file). Hãy CHẨN ĐOÁN rồi SỬA: ' +
  'kiểm tra app chạy được local — package.json có script "dev" + đủ dependencies; đủ file khởi động (Vite cần index.html + src/main + src/App + src/index.css); ' +
  'không còn import mồ côi. Nếu thiếu/hỏng thì SỬA cho chạy được; nếu app đã ổn thì xác nhận và KHÔNG đổi gì thừa.';

let items: FixItem[] = [];
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

/** Add an app to the fix queue (no-op if already queued/running). */
export function enqueueFix(appId: string, name: string): void {
  const cur = items.find((i) => i.appId === appId);
  if (cur && (cur.phase === 'queued' || cur.phase === 'running')) return;
  items = [...items.filter((i) => i.appId !== appId), { appId, name, phase: 'queued' }];
  emit();
}
function setPhase(appId: string, phase: FixPhase, note?: string): void {
  items = items.map((i) => (i.appId === appId ? { ...i, phase, note } : i));
  emit();
}

/** Live view of the queue (re-renders on change). */
export function useFixQueue(): FixItem[] {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((x) => x + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return items;
}

/**
 * Always-mounted driver (rendered once inside the app shell) that processes the queue serially:
 * start the next queued fix only when nothing of ours runs AND the shared AI lock is free.
 */
export function FixQueueDriver(): null {
  const runtime = useRuntime();
  const { message } = AntApp.useApp();
  const owner = useAgentBusy();
  const list = useFixQueue();
  const busyRef = useRef(false);

  useEffect(() => {
    if (busyRef.current) return;
    if (items.some((i) => i.phase === 'running')) return;
    const next = items.find((i) => i.phase === 'queued');
    if (!next) return;
    if (owner) return; // wait for the shared AI lock (another tab/composer/Lark is running)
    busyRef.current = true;
    setPhase(next.appId, 'running', 'Đang chẩn đoán…');
    void (async () => {
      let ok = true;
      try {
        for await (const ev of runtime.createBuild({ prompt: FIX_PROMPT, mode: 'build', appId: next.appId, ...desktopRunnerPrefs() })) {
          if (ev.type === 'error') ok = false;
          else if (ev.type === 'status' && ev.status === 'failed') ok = false;
          else if (ev.type === 'progress' && ev.note) setPhase(next.appId, 'running', ev.note.slice(0, 48));
          else if (ev.type === 'stage' && ev.state === 'running') setPhase(next.appId, 'running', ev.name.slice(0, 48));
        }
      } catch (e) {
        ok = false;
        message.error((e as Error).message);
      }
      setPhase(next.appId, ok ? 'done' : 'error');
      notifyAppsChanged();
      message[ok ? 'success' : 'error'](ok ? `Đã sửa "${next.name}"` : `Chưa sửa được "${next.name}" — mở app để xem chi tiết.`);
      busyRef.current = false; // → store emit already re-ran the effect; pick up the next queued
    })();
  }, [list, owner, runtime, message]);

  return null;
}
