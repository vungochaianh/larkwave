import { randomUUID } from 'node:crypto';
import type { LarkChatEvent, LarkChatMode } from '@larkwave/core';
import type { LarkClient } from './larkClient';
import { allTools, readOnlyTools, type LarkToolDef } from './tools';
import { runApiAgent, type ApiTool } from '../apiRunner';
import {
  failureText,
  isFailurePayload,
  isSelfDeclaredFailure,
  suspectAppBugError,
  tierForError,
  tierForPayload,
  versionNote,
} from './larkToolExec';

/**
 * Run ONE Lark chat turn via the DIRECT provider API (no local CLI). Reuses the same
 * Lark tool registry the CLI path uses, drives the tool-use loop with `runApiAgent`,
 * and adapts everything to the shared `LarkChatEvent` stream — including gated-write
 * confirmation (same `awaitConfirm` machinery as the CLI/MCP path). Ask mode exposes
 * only read-only tools; Build mode exposes the full set.
 */
export interface LarkApiAgentDeps {
  client: LarkClient;
  systemPrompt: string;
  runner: string; // claude | grok | gemini | codex
  model?: string;
  /** Provider API key (Anthropic / xAI / Gemini / OpenAI). */
  apiKey: string;
  /** Prior turns (user/assistant text) for context. */
  history?: { role: 'user' | 'assistant'; text: string }[];
  extraTools?: LarkToolDef[];
  /**
   * Có được nhắc "cài lại bản mới" trong lượt này không. MẶC ĐỊNH KHÔNG — chỉ bật cho lượt trò
   * chuyện của chính người đang ngồi trước máy (xem ToolExecContext.allowVersionHint).
   */
  allowVersionHint?: boolean;
  autoApprove?: boolean;
  /** Công tắc "Tự động" của hội thoại Lark: 'all' = mọi thao tác ghi chạy luôn, trừ xoá (needsConfirmation). */
  autoApproveTool?: (name: string) => boolean | 'all';
  awaitConfirm(callId: string, name: string, input: unknown): Promise<boolean>;
  signal?: AbortSignal;
  /** Thư mục tệp của lượt (xem fileContext) — truyền thẳng vào createToolBridge. */
  files?: TurnFileContext;
}

/** Short human summary of a tool result for the UI card. */
function summarize(data: unknown): string {
  try {
    if (data && typeof data === 'object') {
      const o = data as Record<string, unknown>;
      if (Array.isArray(o.items)) return `${o.items.length} mục`;
      if (Array.isArray((o as { records?: unknown[] }).records)) return `${(o as { records: unknown[] }).records.length} bản ghi`;
      const keys = Object.keys(o);
      return keys.length ? `${keys.length} trường` : 'OK';
    }
    return String(data ?? 'OK').slice(0, 80);
  } catch {
    return 'OK';
  }
}


import { createToolBridge } from './toolBridge';
import type { TurnFileContext } from './fileContext';
export { createToolBridge };

export async function* runLarkApiAgent(
  prompt: string,
  mode: LarkChatMode,
  deps: LarkApiAgentDeps,
): AsyncGenerator<LarkChatEvent> {

  // Bridge: execTool pushes UI events onto a queue (so we can gate + emit tool_call
  // BEFORE running the tool), while runApiAgent's text/error events push too. The
  // generator below drains the queue.
  const queue: LarkChatEvent[] = [];
  const sig: { wake: (() => void) | null } = { wake: null };
  let finished = false;
  const push = (e: LarkChatEvent) => {
    queue.push(e);
    sig.wake?.();
    sig.wake = null;
  };

  const { registry, execTool } = createToolBridge(
    mode,
    // Đường DESKTOP: bộ công cụ đầy đủ + ghi chú phiên bản. Máy nền tự đưa bộ của nó.
    { ...deps, baseTools: (m: LarkChatMode) => (m === 'ask' ? readOnlyTools() : allTools()), versionNote },
    push,
  );
  const apiTools: ApiTool[] = [...registry.values()].map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.inputSchema as Record<string, unknown>,
  }));

  // Kick off the API agent loop concurrently; it feeds text/error into the queue and
  // calls execTool (which feeds tool events). We drain the queue until it signals done.
  void (async () => {
    try {
      for await (const ev of runApiAgent({
        runnerId: deps.runner,
        apiKey: deps.apiKey,
        model: deps.model,
        system: deps.systemPrompt,
        prompt,
        history: deps.history,
        tools: apiTools,
        execTool,
        signal: deps.signal,
      })) {
        if (ev.type === 'text') push({ type: 'text', delta: ev.delta });
        else if (ev.type === 'error') push({ type: 'error', message: ev.message });
        // ev.type === 'tool' is handled by execTool's own events above.
      }
    } catch (e) {
      push({ type: 'error', message: (e as Error)?.message || 'Lỗi khi chạy API.' });
    } finally {
      finished = true;
      sig.wake?.();
      sig.wake = null;
    }
  })();

  while (!finished || queue.length) {
    if (!queue.length) {
      await new Promise<void>((r) => {
        sig.wake = () => r();
      });
      continue;
    }
    yield queue.shift()!;
  }
  yield { type: 'done' };
}
