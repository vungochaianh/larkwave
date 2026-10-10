import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { LarkChatEvent } from '@larkwave/core';
import type { LarkToolDef } from './tools';
import { LarkApiError, type LarkClient } from './larkClient';
import {
  failureText,
  isFailurePayload,
  isSelfDeclaredFailure,
  suspectAppBugError,
  tierForError,
  tierForPayload,
  versionNote,
  withVersionNote, fileEventFor, runPreflight, needsConfirmation, previewFor, summarizeTool, memoForTool } from './larkToolExec';

/**
 * A minimal in-process MCP server (Streamable HTTP, JSON responses) that exposes
 * the Lark tools to the LOCAL `claude` CLI. The CLI is launched with
 * `--mcp-config` pointing here; it calls our tools, and because the handler runs
 * inside Electron's main process it has the connected LarkClient, can stream
 * tool-call events to the UI, and can PAUSE a gated (destructive) call until the
 * user confirms — none of which is possible if we let the CLI run a closed loop.
 *
 * Hand-rolled (no @modelcontextprotocol/sdk) to keep the desktop bundle
 * dependency-free; the surface is tiny: initialize / tools/list / tools/call.
 * Bound to 127.0.0.1 on an ephemeral port and guarded by a per-turn bearer token
 * so no other local process can drive it.
 */

const DEFAULT_PROTOCOL = '2025-06-18';

export interface McpToolContext {
  tools: LarkToolDef[];
  client: LarkClient;
  /** Emit a UI event (tool_call / tool_result / tool_denied / ask_user). */
  emit(ev: LarkChatEvent): void;
  /** For a gated tool: resolves true (allow) / false (deny). */
  confirm(callId: string, name: string, input: unknown): Promise<boolean>;
  /** For the `ask_user` tool: resolves with the user's answer text. */
  ask(callId: string, question: string, choices?: string[]): Promise<string>;
  /** When true, writes run WITHOUT the per-tool confirm (the tool_call is emitted
   *  as non-gated so the UI shows no modal). */
  autoApprove?: boolean;
  /** Xem ToolExecContext.autoApproveTool / needsConfirmation. */
  autoApproveTool?: (name: string) => boolean;
  /** Nhịp giữ kết nối SSE khi tools/call đang chờ (mặc định MCP_HEARTBEAT_MS) — test đặt ngắn. */
  heartbeatMs?: number;
  /** Xem ToolExecContext.allowVersionHint — mặc định KHÔNG nhắc. */
  allowVersionHint?: boolean;
}

/**
 * A built-in tool letting Claude ask the user for help/clarification (which Base, a missing
 * id, a decision, a permission/config problem it can't solve). Exposed in EVERY mode so the
 * agent escalates to a human instead of guessing or failing silently.
 */
const ASK_USER_TOOL = {
  name: 'ask_user',
  description:
    'Hỏi người dùng (chủ tài khoản Lark) khi cần làm rõ hoặc cần trợ giúp: thiếu thông tin (Base/bảng/ID nào), cần một quyết định, hoặc gặp lỗi quyền/cấu hình Lark mà chỉ họ xử lý được. Trả về câu trả lời của người dùng. Hãy DÙNG tool này khi không chắc, thay vì đoán.',
  inputSchema: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'Câu hỏi rõ ràng, ngắn gọn bằng tiếng Việt.' },
      choices: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tuỳ chọn: các lựa chọn gợi ý để người dùng bấm nhanh (tối đa ~6).',
      },
    },
    required: ['question'],
  },
} as const;

export interface McpBridge {
  url: string;
  token: string;
  close(): Promise<void>;
}

export function startMcpBridge(ctx: McpToolContext): Promise<McpBridge> {
  const token = randomUUID();
  const byName = new Map(ctx.tools.map((t) => [t.name, t]));

  const server = createServer((req, res) => {
    handle(req, res).catch(() => endError(res, null, -32603, 'internal error'));
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method === 'GET') {
      // Some MCP clients open a GET stream; we are request/response only.
      res.writeHead(405).end();
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405).end();
      return;
    }
    if ((req.headers['x-tw-token'] || '') !== token) {
      res.writeHead(401).end();
      return;
    }
    const raw = await readBody(req);
    let msg: { id?: unknown; method?: string; params?: any };
    try {
      msg = JSON.parse(raw);
    } catch {
      endError(res, null, -32700, 'parse error');
      return;
    }
    // Notifications (no id) — ack with 202, no body.
    if (msg.id === undefined || msg.id === null) {
      res.writeHead(202).end();
      return;
    }
    // tools/call có thể đứng chờ NGƯỜI (hộp xác nhận / ask_user) nhiều phút. Nếu client nhận được
    // SSE (Streamable HTTP cho phép trả lời POST bằng một luồng sự kiện), mở luồng ngay và gửi nhịp
    // giữ kết nối + tiến độ trong lúc chờ, để không có tầng mạng/proxy nào coi kết nối là chết.
    // Client chỉ nhận JSON thì giữ đường cũ.
    if (msg.method === 'tools/call' && /text\/event-stream/i.test(String(req.headers.accept || ''))) {
      await streamToolCall(res, msg.id, msg.params);
      return;
    }
    const result = await dispatch(msg.method, msg.params);
    if (result === undefined) {
      // No defined method returns undefined → unknown method.
      endError(res, msg.id, -32601, `method not found: ${msg.method}`);
      return;
    }
    endResult(res, msg.id, result);
  }

  async function streamToolCall(res: ServerResponse, id: unknown, params: any): Promise<void> {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    const token = params?._meta?.progressToken;
    let n = 0;
    const beat = setInterval(() => {
      n++;
      try {
        if (token !== undefined && token !== null)
          res.write(sseData({ jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken: token, progress: n, message: 'Đang chờ…' } }));
        else res.write(': keepalive\n\n');
      } catch {
        /* client đã đóng */
      }
    }, ctx.heartbeatMs ?? MCP_HEARTBEAT_MS);
    try {
      const result = await callTool(params?.name, params?.arguments ?? {});
      res.end(sseData({ jsonrpc: '2.0', id, result }));
    } catch {
      res.end(sseData({ jsonrpc: '2.0', id: id ?? null, error: { code: -32603, message: 'internal error' } }));
    } finally {
      clearInterval(beat);
    }
  }

  async function dispatch(method: string | undefined, params: any): Promise<unknown> {
    switch (method) {
      case 'initialize':
        return {
          protocolVersion: typeof params?.protocolVersion === 'string' ? params.protocolVersion : DEFAULT_PROTOCOL,
          capabilities: { tools: {} },
          serverInfo: { name: 'toolswave-lark', version: '1.0.0' },
        };
      case 'ping':
        return {};
      case 'tools/list':
        return {
          tools: [
            ...ctx.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
            ASK_USER_TOOL,
          ],
        };
      case 'tools/call':
        return callTool(params?.name, params?.arguments ?? {});
      default:
        return undefined;
    }
  }

  async function callTool(name: string, input: Record<string, any>): Promise<unknown> {
    // Built-in: Claude asks the user for help/clarification. Pauses the loop (like a gated
    // write) until the renderer answers via larkAnswerAsk, then returns the answer to Claude.
    if (name === 'ask_user') {
      const callId = `ask_${randomUUID()}`;
      const question = String(input?.question ?? '').trim() || 'Bạn có thể làm rõ giúp tôi không?';
      const choices = Array.isArray(input?.choices) ? input.choices.map(String).slice(0, 8) : undefined;
      ctx.emit({ type: 'ask_user', callId, question, choices });
      const ASK_TIMEOUT_MS = 10 * 60_000;
      let timer: NodeJS.Timeout | undefined;
      const answer = await Promise.race<string>([
        ctx.ask(callId, question, choices),
        new Promise<string>((res) => {
          timer = setTimeout(() => res('[hết thời gian chờ — người dùng chưa trả lời]'), ASK_TIMEOUT_MS);
        }),
      ]);
      if (timer) clearTimeout(timer);
      return { content: [{ type: 'text', text: answer }] };
    }

    const tool = byName.get(name);
    // Chữ ký kinh điển của bản cài cũ — xem larkToolExec (kể cả lý do phải PHÁT sự kiện).
    if (!tool) {
      const missId = `lt_${randomUUID()}`;
      ctx.emit({ type: 'tool_call', callId: missId, name, input, gated: false });
      ctx.emit({
        type: 'tool_result',
        callId: missId,
        ok: false,
        error: `Không tìm thấy tool ${name} trong bản cài này.`,
        suspectAppBug: true,
        tier: 'error',
      });
      return toolError(`Không tìm thấy tool ${name}.` + (await versionNote(ctx.allowVersionHint)));
    }
    const callId = `lt_${randomUUID()}`;
    // Auto-approve ⇒ the write needs NO confirmation: mark the event non-gated so the
    // UI shows no modal, and run it straight through (the gated flag is the single
    // source of truth the renderer keys off).
    // Kiểm trước hộp xác nhận — xem LarkToolDef.preflight / runPreflight.
    const pre = await runPreflight(tool, input, ctx.client);
    const needsConfirm = needsConfirmation(tool, ctx, !!pre, input);
    ctx.emit({ type: 'tool_call', callId, name, input, gated: needsConfirm, ...(needsConfirm ? await previewFor(tool, input) : {}) });

    if (needsConfirm) {
      // Don't let a never-answered confirmation strand the Claude CLI forever — auto-deny
      // after a generous window. (Disconnect / new chat already deny via clearPending.)
      const CONFIRM_TIMEOUT_MS = 10 * 60_000;
      let timer: NodeJS.Timeout | undefined;
      const ok = await Promise.race<boolean>([
        ctx.confirm(callId, name, input),
        new Promise<boolean>((res) => {
          timer = setTimeout(() => res(false), CONFIRM_TIMEOUT_MS);
        }),
      ]);
      if (timer) clearTimeout(timer);
      if (!ok) {
        ctx.emit({ type: 'tool_denied', callId });
        return toolError('Thao tác bị từ chối hoặc hết thời gian chờ xác nhận.');
      }
    }
    try {
      const data = pre ?? (await tool.exec(input, ctx.client));
      // Xem larkToolExec: thất bại tự khai báo cũng phải hiện ra là lỗi.
      ctx.emit(
        isSelfDeclaredFailure(data)
          ? {
              type: 'tool_result',
              callId,
              ok: false,
              error: failureText(data),
              suspectAppBug: isFailurePayload(data),
              tier: tierForPayload(data, name),
            }
          : { type: 'tool_result', callId, ok: true, summary: summarizeTool(name, data), memo: memoForTool(name, data) || undefined },
      );
      // THẺ TỆP. Đây là đường lượt Lark thật sự đi qua (Claude CLI ⇄ cầu MCP), nên thiếu ở đây là
      // thiếu ở mọi lượt chat Lark — dù `toolBridge` có phát đúng thì cũng không ai thấy.
      const fe = fileEventFor(name, data);
      if (fe && !isSelfDeclaredFailure(data)) ctx.emit(fe);
      // Thất bại tự khai báo (`{ok:false}`) cũng là thất bại — xem larkToolExec.
      return { content: [{ type: 'text', text: await withVersionNote(data, ctx.allowVersionHint) }] };
    } catch (e) {
      const message = e instanceof LarkApiError ? e.message : String((e as Error)?.message ?? e);
      // Xem larkToolExec: nhánh ném cũng phải qua bộ phân loại.
      const suspect = suspectAppBugError(e);
      ctx.emit({ type: 'tool_result', callId, ok: false, error: message, suspectAppBug: suspect, tier: tierForError(e) });
      return toolError(message + (suspect ? await versionNote(ctx.allowVersionHint) : ''));
    }
  }

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}/mcp`,
        token,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

/** Nhịp giữ kết nối khi một tools/call đang chờ người dùng (xem streamToolCall). */
export const MCP_HEARTBEAT_MS = 15_000;

function sseData(obj: unknown): string {
  return `event: message\ndata: ${JSON.stringify(obj)}\n\n`;
}

function toolError(text: string) {
  return { content: [{ type: 'text', text }], isError: true };
}


function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c: Buffer) => (data += c.toString('utf8')));
    req.on('end', () => resolve(data));
    req.on('error', () => resolve(''));
  });
}

function endResult(res: ServerResponse, id: unknown, result: unknown): void {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
}

function endError(res: ServerResponse, id: unknown, code: number, message: string): void {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }));
}
