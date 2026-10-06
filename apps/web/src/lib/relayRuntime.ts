import type { LarkChatEvent, LarkChatInput, RuntimeAdapter } from "@larkwave/core";
import type { LarkChatRelayInput } from "@larkwave/shared";
import { WebRuntimeAdapter } from "@larkwave/ui";
import { api, streamLarkChat, streamLarkRpc, API_BASE, getToken } from "@/lib/api";

/** How long to wait for a Lark RPC result before failing (desktop offline / slow). */
const RPC_TIMEOUT_MS = 30000;

/**
 * Lark RPC bridge: run an allow-listed Lark runtime method on the desktop and await its result.
 * One shared SSE demuxes results by requestId, so the shared LarkChat screen can call desktop Lark
 * methods (base picker, sessions, prefs…) over the relay exactly as if they were local.
 */
function makeRpc() {
  const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  // A FAST desktop method (delete/rename/switch) can post its result BEFORE this side has registered
  // the pending handler (the result races ahead of `await larkRpcRun` returning the requestId). Buffer
  // any such early result so the pending, once registered, claims it instead of timing out.
  const early = new Map<string, { ok: boolean; result?: unknown; error?: string }>();
  const settle = (requestId: string, ev: { ok: boolean; result?: unknown; error?: string }) => {
    const p = pending.get(requestId);
    if (!p) {
      // Result arrived before the caller registered → buffer briefly (auto-expire to avoid a leak).
      early.set(requestId, ev);
      setTimeout(() => early.delete(requestId), RPC_TIMEOUT_MS);
      return;
    }
    pending.delete(requestId);
    clearTimeout(p.timer);
    if (ev.ok) p.resolve(ev.result);
    else p.reject(new Error(ev.error || "Lark RPC lỗi"));
  };
  let started = false;
  const ensureStream = () => {
    if (started) return;
    started = true;
    streamLarkRpc((ev) => settle(ev.requestId, ev));
  };
  return async (method: string, args: unknown[] = []): Promise<unknown> => {
    ensureStream();
    const { requestId } = await api.larkRpcRun(method, args);
    // Already back (raced ahead of us)? Resolve immediately.
    const pre = early.get(requestId);
    if (pre) {
      early.delete(requestId);
      if (pre.ok) return pre.result;
      throw new Error(pre.error || "Lark RPC lỗi");
    }
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error("Máy tính không phản hồi — hãy mở app trên máy, đăng nhập cùng tài khoản + đã kết nối Lark."));
      }, RPC_TIMEOUT_MS);
      pending.set(requestId, { resolve, reject, timer });
      // Final guard against the race: a result may have landed between the await above and here.
      const late = early.get(requestId);
      if (late) {
        early.delete(requestId);
        settle(requestId, late);
      }
    });
  };
}

/**
 * Bridge the callback-based relay SSE (`streamLarkChat`) into the `AsyncIterable<LarkChatEvent>`
 * that `AgentChat` consumes — so the relay looks EXACTLY like a local runtime to the shared UI.
 * `onReq` hands the started turn's requestId back to the adapter (for confirm/answer/cancel).
 */
function relayLarkChat(input: LarkChatInput, onReq: (id: string) => void): AsyncIterable<LarkChatEvent> {
  return {
    async *[Symbol.asyncIterator]() {
      const relayInput: LarkChatRelayInput = {
        prompt: input.prompt,
        mode: input.mode === "build" ? "build" : "ask",
        scope: input.scope,
        activeBases: input.activeBases?.map((b) => ({ appToken: b.appToken, name: b.name })),
        runner: input.runner,
        model: input.model,
        sessionId: input.sessionId,
        resume: input.resume,
      };
      // NOTE: attachments (base64 files) are NOT relayed yet — the desktop AgentChat handles them
      // locally; the web relay path is text-only for now (Step 1).
      const { requestId } = await api.larkChatRun(relayInput);
      onReq(requestId);
      yield* bridgeChatStream(requestId);
    },
  };
}

/** Bridge the message SSE (filtered by requestId) into an AsyncIterable<LarkChatEvent> the shared
 *  AgentChat/LarkChat consume. Shared by the desktop-relay path and the hosted-MAIC path. */
function bridgeChatStream(requestId: string): AsyncIterable<LarkChatEvent> {
  return {
    async *[Symbol.asyncIterator]() {
      const queue: LarkChatEvent[] = [];
      let wake: (() => void) | null = null;
      let closed = false;
      const wakeUp = () => {
        const w = wake;
        wake = null;
        w?.();
      };
      const stop = streamLarkChat((ev) => { queue.push(ev.event as unknown as LarkChatEvent); wakeUp(); }, {
        requestId,
        onError: () => { closed = true; wakeUp(); },
        onClose: () => { closed = true; wakeUp(); },
      });
      try {
        for (;;) {
          if (queue.length) {
            const ev = queue.shift()!;
            yield ev;
            if (ev.type === "done" || ev.type === "error") return;
            continue;
          }
          if (closed) return;
          await new Promise<void>((r) => { wake = r; });
        }
      } finally {
        stop();
      }
    },
  };
}

/** Đuôi tệp → mime, cho những tệp mà trình duyệt không khai báo kiểu. */
const EXT_MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
  pdf: "application/pdf", csv: "text/csv", json: "application/json", md: "text/markdown", txt: "text/plain",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/**
 * base64 (dạng AgentChat đang giữ) → File để gửi lên endpoint uploads.
 *
 * PHẢI đặt `type`: `new File([bytes], name)` không kèm type sẽ ra application/octet-stream, và
 * máy chủ chỉ nhận ảnh theo danh sách mime chính xác — nên ẢNH ĐÍNH KÈM Ở /agents-chat TRƯỚC GIỜ BỊ
 * TỪ CHỐI IM LẶNG (lỗi bị nuốt ở vòng lặp bên dưới) và chưa bao giờ đến được model.
 */
function base64ToFile(dataBase64: string, name: string, mime?: string): File | null {
  try {
    const bin = atob(dataBase64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const ext = /\.([a-z0-9]+)$/i.exec(name || "")?.[1]?.toLowerCase();
    const type = mime || (ext ? EXT_MIME[ext] : undefined) || "";
    return new File([buf], name || "file", type ? { type } : undefined);
  } catch {
    return null;
  }
}

/**
 * Hosted (MAIC) general chat: the turn runs SERVER-SIDE via `/agent/maic-chat/run` (Larkwave's
 * hosted Claude) — NO desktop and NO local CLI. Events arrive on the SAME message SSE, so the
 * shared AgentChat renders identically to the relay path.
 */
function hostedMaicChat(input: LarkChatInput, onReq: (id: string) => void): AsyncIterable<LarkChatEvent> {
  return {
    async *[Symbol.asyncIterator]() {
      // Attachments used to stop at the browser: the chat bubble rendered them from local storage
      // while the server received text only, so anything asking the assistant to READ the file
      // failed with no explanation. Upload them first and pass the ids; a failed upload degrades
      // to a text-only turn rather than losing the whole message.
      const attachmentIds: string[] = [];
      for (const a of input.attachments ?? []) {
        try {
          const file = base64ToFile(a.dataBase64, a.name, a.mime);
          if (file) attachmentIds.push((await api.uploadFile(file, "chat")).id);
        } catch {
          /* skip this one — the turn still goes through */
        }
      }
      const { requestId } = await api.maicChatRun({
        prompt: input.prompt,
        mode: input.mode === "build" ? "build" : "ask",
        scope: input.scope,
        model: input.model,
        sessionId: input.sessionId,
        resume: input.resume,
        ...(attachmentIds.length ? { attachmentIds } : {}),
      });
      onReq(requestId);
      yield* bridgeChatStream(requestId);
    },
  };
}

/**
 * A web `RuntimeAdapter` whose chat runs on the signed-in DESKTOP's local CLI via the relay,
 * while everything else (skills, uploads…) keeps using the normal web API (WebRuntimeAdapter). Passing this to
 * `<RuntimeProvider>` lets the shared `AgentChat` render on the web with full parity — the
 * ChatGPT-style history/sidebar is the component's own; turns execute on the desktop.
 */
export function createRelayRuntime(): RuntimeAdapter {
  const adapter: RuntimeAdapter = new WebRuntimeAdapter(API_BASE, getToken);
  let activeReq: string | null = null;
  adapter.larkChat = (input) => relayLarkChat(input, (id) => { activeReq = id; });
  adapter.larkConfirmTool = async (callId, decision) => {
    if (activeReq) await api.larkChatConfirm(activeReq, callId, decision).catch(() => undefined);
  };
  adapter.larkAnswerAsk = async (callId, answer) => {
    if (activeReq) await api.larkChatAnswer(activeReq, callId, answer).catch(() => undefined);
  };
  // AgentChat / LarkChat "Stop" → cancel the running relay turn on the desktop.
  adapter.agentUnlock = async () => {
    const id = activeReq;
    activeReq = null;
    if (id) await api.larkChatCancel(id).catch(() => undefined);
  };

  // Full-parity LarkChat screen: every Lark read/config method runs on the desktop via RPC. Types
  // resolve structurally (JSON round-trips the same shapes); the double cast bridges the generic
  // Promise<unknown> to the adapter's precise method signatures.
  const rpc = makeRpc();
  Object.assign(adapter, {
    larkStatus: () => rpc("larkStatus"),
    larkCheckConnection: () => rpc("larkCheckConnection"),
    larkListBases: () => rpc("larkListBases"),
    larkListTables: (appToken: string) => rpc("larkListTables", [appToken]),
    larkAddBase: (...a: unknown[]) => rpc("larkAddBase", a),
    larkBaseSnapshot: (...a: unknown[]) => rpc("larkBaseSnapshot", a),
    larkSessions: () => rpc("larkSessions"),
    larkNewSession: (...a: unknown[]) => rpc("larkNewSession", a),
    larkSwitchSession: (...a: unknown[]) => rpc("larkSwitchSession", a),
    larkSaveSession: (...a: unknown[]) => rpc("larkSaveSession", a),
    larkDeleteSession: (...a: unknown[]) => rpc("larkDeleteSession", a),
    larkShareSession: (...a: unknown[]) => rpc("larkShareSession", a),
    larkUnshareSession: (...a: unknown[]) => rpc("larkUnshareSession", a),
    larkHandoffSession: (...a: unknown[]) => rpc("larkHandoffSession", a),
    larkSetAgentPrefs: (...a: unknown[]) => rpc("larkSetAgentPrefs", a),
    larkSetAutoApprove: (...a: unknown[]) => rpc("larkSetAutoApprove", a),
    larkSaveNotes: (...a: unknown[]) => rpc("larkSaveNotes", a),
    larkSummarize: (...a: unknown[]) => rpc("larkSummarize", a),
    larkBackupSync: (...a: unknown[]) => rpc("larkBackupSync", a),
    // Links open in the web browser, not the desktop.
    openExternal: async (url: string) => {
      if (typeof window !== "undefined") window.open(url, "_blank", "noopener");
    },
  } as unknown as Partial<RuntimeAdapter>);

  return adapter;
}

/**
 * A web `RuntimeAdapter` whose general "Trợ lý AI" chat runs SERVER-SIDE via the hosted MAIC gateway
 * (no desktop, no local Claude). Used by `/remote/chat` so the assistant works standalone for users
 * on a Larkwave plan/trial. Everything else still uses the normal web API (WebRuntimeAdapter). There is
 * no Lark RPC here — hosted chat is scope='general' only (Lark tool turns still need the desktop).
 */
export function createHostedRuntime(): RuntimeAdapter {
  const adapter: RuntimeAdapter = new WebRuntimeAdapter(API_BASE, getToken);
  let activeReq: string | null = null;
  adapter.larkChat = (input) => hostedMaicChat(input, (id) => { activeReq = id; });
  // "Stop" → cancel the in-flight hosted turn.
  adapter.agentUnlock = async () => {
    const id = activeReq;
    activeReq = null;
    if (id) await api.maicChatCancel(id).catch(() => undefined);
  };
  return adapter;
}
