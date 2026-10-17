import { APIA_BASE } from '@larkwave/core';
import type { LarkChatEvent, LarkChatMode } from '@larkwave/core';
import type { LarkClient } from './larkClient';
import type { LarkToolDef } from './tools/types';
import { createToolBridge } from './larkApiAgent';
import { allTools, readOnlyTools } from './tools';
import type { TurnFileContext } from './fileContext';

/**
 * Chạy một lượt Lark agent bằng GÓI LARKWAVE (MAIC), không cần CLI cài trên máy và không cần
 * khoá API riêng của người dùng.
 *
 * Ba bên, mỗi bên giữ đúng một thứ:
 *   • MAIC nghĩ và quyết định gọi tool nào — nó KHÔNG có mã thực thi cho tool Lark của ta.
 *   • Máy chủ Larkwave giữ khoá MAIC, chặn theo gói của người dùng và ghi sổ token.
 *   • Máy này thực thi tool bằng kết nối Lark của chính người dùng — App Secret không rời máy.
 *
 * Vì sao không tự dựng vòng lặp trên `/v1/ask` + jsonSchema (bản thử đầu tiên): đo cùng một tác
 * vụ ba bước, vòng lặp tự chế mất 52,7 giây và $0,0675 mà mới chỉ QUYẾT ĐỊNH, chưa thực thi gì;
 * đường này mất 14,4 giây và $0,0397 cho cả ba bước kể cả hai lần ghi. Cả tác vụ nằm trong MỘT
 * tiến trình nên không phải gửi lại bối cảnh mỗi bước.
 */
export interface LarkMaicAgentDeps {
  client: LarkClient;
  systemPrompt: string;
  /** Token tài khoản Larkwave — máy chủ dùng nó để chặn hạn mức và ghi sổ đúng người. */
  accountToken: string;
  model?: string;
  sessionId?: string;
  extraTools?: LarkToolDef[];
  autoApprove: boolean;
  /** Công tắc "Tự động" của hội thoại Lark: 'all' = mọi thao tác ghi chạy luôn, trừ xoá (needsConfirmation). */
  autoApproveTool?: (name: string) => boolean | 'all';
  awaitConfirm(callId: string, name: string, input: unknown): Promise<boolean>;
  allowVersionHint?: boolean;
  signal?: AbortSignal;
  /** Thư mục tệp của lượt (xem fileContext) — truyền thẳng vào createToolBridge. */
  files?: TurnFileContext;
}

export async function* runLarkMaicAgent(
  prompt: string,
  mode: LarkChatMode,
  deps: LarkMaicAgentDeps,
): AsyncGenerator<LarkChatEvent> {
  // Hàng đợi sự kiện: `execTool` phát sự kiện giao diện (tool_call / tool_result / tool_denied)
  // trong lúc ta còn đang đọc SSE, nên không thể yield thẳng từ trong đó.
  const queue: LarkChatEvent[] = [];
  const sig: { wake: (() => void) | null } = { wake: null };
  const push = (e: LarkChatEvent) => {
    queue.push(e);
    sig.wake?.();
  };
  const { registry, execTool } = createToolBridge(
    mode,
    // Chạy trên MÁY NGƯỜI DÙNG nên dùng bộ công cụ đầy đủ, y như đường CLI và API trực tiếp.
    { ...deps, baseTools: (m) => (m === 'ask' ? readOnlyTools() : allTools()) },
    push,
  );

  const tools = [...registry.values()].map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema as object,
  }));
  if (!tools.length) {
    yield { type: 'error', message: 'Không có công cụ Lark nào khả dụng cho chế độ này.' };
    return;
  }

  let res: Response;
  try {
    res = await fetch(`${APIA_BASE}/agent/maic-tools`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${deps.accountToken}`,
        'content-type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        prompt: `${deps.systemPrompt}\n\n───\n\n${prompt}`.slice(0, 100_000),
        tools,
        ...(deps.model ? { model: deps.model } : {}),
        ...(deps.sessionId ? { sessionId: deps.sessionId } : {}),
      }),
      signal: deps.signal,
    });
  } catch (e) {
    yield { type: 'error', message: `Không gọi được máy chủ Larkwave: ${(e as Error)?.message || 'lỗi mạng'}` };
    return;
  }

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => '');
    yield {
      type: 'error',
      message:
        res.status === 402
          ? 'Bạn đã dùng hết hạn mức gói tháng này. Nâng gói để tiếp tục dùng agent theo gói Larkwave.'
          : res.status === 401
            ? 'Chưa đăng nhập tài khoản Larkwave.'
            : `Máy chủ trả lỗi ${res.status}: ${body.slice(0, 200)}`,
    };
    return;
  }

  let runId = '';
  let buf = '';
  let done = false;
  const dec = new TextDecoder();

  // Đọc SSE ở một tác vụ nền, đẩy sự kiện vào hàng đợi; vòng dưới rút ra và yield.
  const pump = (async () => {
    try {
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        buf += dec.decode(chunk, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const ln of lines) {
          if (!ln.startsWith('data: ')) continue;
          let ev: Record<string, unknown>;
          try {
            ev = JSON.parse(ln.slice(6)) as Record<string, unknown>;
          } catch {
            continue; // dòng không phải JSON (keepalive) — bỏ qua, đừng chặn luồng
          }
          if (ev.type === 'run' && typeof ev.runId === 'string') runId = ev.runId;
          else if (ev.type === 'delta' && typeof ev.text === 'string') push({ type: 'text', delta: ev.text });
          else if (ev.type === 'tool_use') {
            const name = String(ev.name || '');
            const input = (ev.input ?? {}) as Record<string, unknown>;
            let content: string;
            let isError = false;
            try {
              content = JSON.stringify(await execTool(name, input));
            } catch (e) {
              // Công cụ hỏng thì VẪN phải trả kết quả, kèm cờ lỗi: model đọc được rồi tự xoay.
              // Im lặng thì nó chỉ biết chờ tới hết giờ — cả lượt chạy treo vì một tool hỏng.
              content = (e as Error)?.message || 'lỗi công cụ';
              isError = true;
            }
            await fetch(`${APIA_BASE}/agent/maic-tools/${encodeURIComponent(runId)}/result`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${deps.accountToken}`, 'content-type': 'application/json' },
              body: JSON.stringify({ toolUseId: String(ev.id || ''), content: content.slice(0, 200_000), isError }),
            }).catch(() => undefined);
          } else if (ev.type === 'error') {
            push({ type: 'error', message: String(ev.message || 'Lỗi từ trợ lý') });
          }
        }
      }
    } catch (e) {
      if (!deps.signal?.aborted) push({ type: 'error', message: (e as Error)?.message || 'Mất kết nối tới trợ lý' });
    } finally {
      done = true;
      sig.wake?.();
    }
  })();

  while (true) {
    while (queue.length) yield queue.shift()!;
    if (done) break;
    await new Promise<void>((resolve) => {
      sig.wake = () => {
        sig.wake = null;
        resolve();
      };
    });
  }
  await pump.catch(() => undefined);
  while (queue.length) yield queue.shift()!;
  yield { type: 'done' };
}
