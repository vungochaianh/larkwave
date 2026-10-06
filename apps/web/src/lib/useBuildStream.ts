"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  STAGE_ORDER,
  type Blueprint,
  type Build,
  type BuildResult,
  type BuildStatus,
  type LogLine,
  type StageState,
} from "@larkwave/shared";
import { api, streamBuild } from "./api";

export interface BuildStreamState {
  buildId: string | null;
  status: BuildStatus | null;
  stages: StageState[];
  logs: LogLine[];
  result: BuildResult | null;
  /** The design Blueprint (set once the design stage runs; editable at the gate). */
  blueprint: Blueprint | null;
  error: string | null;
  /** True when the failure is transient (network / AI overload) — safe to retry as-is. */
  retryable: boolean;
  /** True while connected to the live stream. */
  streaming: boolean;
  /** Mất kết nối giữa chừng và đang tự nối lại — build vẫn đang chạy trên máy chủ. */
  reconnecting: boolean;
  /** Wall-clock start of this build, as the browser saw it (epoch ms). */
  startedAt: number | null;
  /** Set once the build reaches a terminal status — `finishedAt - startedAt` is what the user waited. */
  finishedAt: number | null;
}

/** Statuses that end a build — used to freeze the elapsed-time clock. */
const TERMINAL = new Set<BuildStatus>(['succeeded', 'failed', 'canceled']);

const initialStages = (): StageState[] =>
  STAGE_ORDER.map((name) => ({ name, status: "pending" }));

const emptyState = (): BuildStreamState => ({
  buildId: null,
  status: null,
  startedAt: null,
  finishedAt: null,
  stages: initialStages(),
  logs: [],
  result: null,
  blueprint: null,
  error: null,
  retryable: false,
  streaming: false,
  reconnecting: false,
});

/**
 * Subscribe to a build's SSE stream and expose reactive pipeline state.
 * Handles snapshot/stage/log/status/result/done/error events.
 */
export function useBuildStream() {
  const [state, setState] = useState<BuildStreamState>(emptyState);
  const stopRef = useRef<(() => void) | null>(null);
  /** Hẹn giờ nối lại đang chờ — phải huỷ khi stop/reset, nếu không nó tự mở lại luồng đã đóng. */
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Số lần nối lại liên tiếp, để giãn dần. Đặt lại về 0 mỗi khi luồng mở được. */
  const attemptRef = useRef(0);
  /** Người dùng chủ động dừng thì KHÔNG nối lại nữa. */
  const abandonedRef = useRef(false);

  const clearRetry = (): void => {
    if (retryRef.current) clearTimeout(retryRef.current);
    retryRef.current = null;
  };

  const stop = useCallback(() => {
    abandonedRef.current = true;
    clearRetry();
    stopRef.current?.();
    stopRef.current = null;
    setState((s) => ({ ...s, streaming: false, reconnecting: false }));
  }, []);

  const reset = useCallback(() => {
    abandonedRef.current = true;
    clearRetry();
    stopRef.current?.();
    stopRef.current = null;
    setState(emptyState());
  }, []);

  const start = useCallback((buildId: string) => {
    // Tear down any existing stream first.
    abandonedRef.current = false;
    attemptRef.current = 0;
    clearRetry();
    stopRef.current?.();
    setState({ ...emptyState(), buildId, streaming: true });
    open(buildId);
  }, []);

  /**
   * Mở luồng SSE cho build này, và TỰ NỐI LẠI khi rớt.
   *
   * Trước đây rớt kết nối chỉ đặt `streaming:false`: trạng thái vẫn là "running", nên màn hình
   * đứng ở "đang dựng app…" vĩnh viễn trong khi máy chủ đã dựng xong từ lâu. Người dùng chỉ cần
   * tải lại trang là thấy — nhưng không có gì nói cho họ biết điều đó.
   *
   * Nay khi rớt: hỏi REST xem build đã xong chưa. Xong rồi thì áp kết quả và dừng hẳn; chưa xong
   * thì mở lại luồng, giãn dần 2s→15s, và bật cờ `reconnecting` để giao diện nói ra là đang nối lại.
   */
  const openRef = useRef<(id: string) => void>(() => undefined);
  const open = (buildId: string): void => openRef.current(buildId);

  const scheduleRetry = (buildId: string): void => {
    if (abandonedRef.current) return;
    attemptRef.current += 1;
    const delay = Math.min(15_000, 2_000 * 2 ** (attemptRef.current - 1));
    setState((s) => ({ ...s, reconnecting: true }));
    clearRetry();
    retryRef.current = setTimeout(() => {
      void (async () => {
        if (abandonedRef.current) return;
        // Hỏi trạng thái thật trước: nếu build đã kết thúc thì không cần luồng nữa.
        const b = await api.getBuild(buildId).catch(() => null);
        if (abandonedRef.current) return;
        if (b && TERMINAL.has(b.status)) {
          setState((s) => ({
            ...s,
            status: b.status,
            stages: b.stages?.length ? b.stages : s.stages,
            logs: b.logs?.length ? b.logs : s.logs,
            result: b.result ?? s.result,
            blueprint: b.blueprint ?? s.blueprint,
            error: b.error ?? s.error,
            finishedAt: s.finishedAt ?? Date.now(),
            streaming: false,
            reconnecting: false,
          }));
          return;
        }
        open(buildId);
      })();
    }, delay);
  };

  const openStream = (buildId: string): void => {
    setState((s) => ({ ...s, streaming: true }));

    const applyStage = (stage: StageState) =>
      setState((s) => {
        const stages = s.stages.some((x) => x.name === stage.name)
          ? s.stages.map((x) => (x.name === stage.name ? stage : x))
          : [...s.stages, stage];
        return { ...s, stages };
      });

    stopRef.current = streamBuild(
      buildId,
      (event) => {
        // Bất kỳ sự kiện nào cũng chứng minh luồng đã sống lại.
        attemptRef.current = 0;
        setState((s) => (s.reconnecting ? { ...s, reconnecting: false } : s));
        switch (event.type) {
          case "snapshot": {
            const b: Build = event.build;
            setState((s) => ({
              ...s,
              status: b.status,
              stages:
                b.stages && b.stages.length ? b.stages : s.stages,
              logs: b.logs ?? s.logs,
              result: b.result ?? s.result,
              blueprint: b.blueprint ?? s.blueprint,
              error: b.error ?? s.error,
            }));
            break;
          }
          case "log":
            setState((s) => ({ ...s, logs: [...s.logs, event.line] }));
            break;
          case "stage":
            applyStage(event.stage);
            break;
          case "status":
            setState((s) => ({
              ...s,
              status: event.status,
              // First sign of life = the clock starts; a terminal status stops it. Both guarded so
              // a repeated event (reconnect, replay) can't restart or extend the measurement.
              startedAt: s.startedAt ?? Date.now(),
              finishedAt: TERMINAL.has(event.status) ? (s.finishedAt ?? Date.now()) : s.finishedAt,
            }));
            break;
          case "blueprint":
            setState((s) => ({ ...s, blueprint: event.blueprint }));
            break;
          case "result":
            setState((s) => ({ ...s, result: event.result }));
            break;
          case "done": {
            const b = event.build;
            setState((s) => ({
              ...s,
              status: b.status,
              stages: b.stages?.length ? b.stages : s.stages,
              result: b.result ?? s.result,
              blueprint: b.blueprint ?? s.blueprint,
              error: b.error ?? s.error,
              streaming: false,
              reconnecting: false,
            }));
            clearRetry();
            abandonedRef.current = true; // build đã kết thúc — không nối lại nữa
            stopRef.current = null;
            break;
          }
          case "error":
            setState((s) => ({
              ...s,
              error: event.message,
              retryable: event.retryable ?? false,
              status: "failed",
              streaming: false,
              reconnecting: false,
            }));
            clearRetry();
            abandonedRef.current = true;
            stopRef.current = null;
            break;
        }
      },
      {
        onError: () => {
          // KHÔNG ghi lỗi mạng vào `error`: đó là chỗ dành cho lỗi BUILD. Rớt kết nối là chuyện
          // của trình duyệt, còn build trên máy chủ vẫn chạy — nói nhầm thành build hỏng là sai.
          setState((s) => ({ ...s, streaming: false }));
          scheduleRetry(buildId);
        },
        onClose: () => {
          setState((s) => {
            if (s.status && TERMINAL.has(s.status)) return { ...s, streaming: false, reconnecting: false };
            return { ...s, streaming: false };
          });
          scheduleRetry(buildId);
        },
      },
    );
  };
  openRef.current = openStream;

  /** Load a terminal build's full detail (logs + stages + result). */
  const loadDetail = useCallback(async (buildId: string) => {
    setState({ ...emptyState(), buildId });
    const b = await api.getBuild(buildId);
    setState({
      buildId: b.id,
      status: b.status,
      stages: b.stages?.length ? b.stages : initialStages(),
      logs: b.logs ?? [],
      result: b.result ?? null,
      blueprint: b.blueprint ?? null,
      error: b.error ?? null,
      retryable: false,
      streaming: false,
      reconnecting: false,
      // A build loaded from history carries the SERVER's own timestamps — more accurate than
      // anything the browser could infer, since it was not watching when the build ran.
      startedAt: b.startedAt ? new Date(b.startedAt).getTime() : null,
      finishedAt: b.finishedAt ? new Date(b.finishedAt).getTime() : null,
    });
    // If still in-flight OR paused at the approval gate, attach the live stream
    // so resume events (after approve) are received.
    if (b.status === "queued" || b.status === "running" || b.status === "awaiting_approval") {
      start(b.id);
    }
  }, [start]);

  useEffect(
    () => () => {
      if (retryRef.current) clearTimeout(retryRef.current);
      stopRef.current?.();
    },
    [],
  );

  return { state, start, stop, reset, loadDetail };
}
