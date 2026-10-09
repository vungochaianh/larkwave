import type { LarkChatEvent, LarkChatMode } from '@larkwave/core';
import type { RunnerId } from '@larkwave/shared';
import { allTools, readOnlyTools, type LarkToolDef } from './tools';
import { ASK_USER_TOOL_NAME, executeLarkTool, toolsSchemaBlock } from './larkToolExec';
import { runRunnerOnce } from './larkRunnerOnce';
import type { LarkAgentDeps } from './larkAgent';

const MAX_TOOL_ROUNDS = 12;

const ORCHESTRATOR_RULES = [
  'Bạn là agent Lark × Larkwave. Bạn có các TOOL Lark bên dưới.',
  'Khi cần đọc/ghi Lark: trả lời CHỈ bằng một khối <tool_call>…</tool_call> chứa JSON {"name":"…","input":{…}}.',
  'Khi đã đủ thông tin để trả lời người dùng: trả lời bằng văn bản thường (KHÔNG dùng <tool_call>).',
  `Khi cần hỏi người dùng: dùng tool "${ASK_USER_TOOL_NAME}" với {"question":"…","choices":["…"]}.`,
  'Sau mỗi kết quả tool bạn sẽ nhận [tool_result] — tiếp tục cho đến khi hoàn tất.',
  'Trả lời ngắn gọn, rõ ràng bằng tiếng Việt.',
].join('\n');

const ASK_USER_SCHEMA = {
  name: ASK_USER_TOOL_NAME,
  description: 'Hỏi người dùng khi thiếu thông tin hoặc cần quyết định.',
  inputSchema: {
    type: 'object',
    properties: {
      question: { type: 'string' },
      choices: { type: 'array', items: { type: 'string' } },
    },
    required: ['question'],
  },
  gated: false,
};

/** Agent loop for Grok / Gemini / Codex — Larkwave executes Lark tools in-process. */
export async function* runLarkOrchestrator(
  prompt: string,
  mode: LarkChatMode,
  deps: LarkAgentDeps,
): AsyncGenerator<LarkChatEvent> {
  const runnerId = (deps.runner || 'grok') as RunnerId;
  if (runnerId === 'claude') {
    yield { type: 'error', message: 'Orchestrator không dùng cho Claude.' };
    yield { type: 'done' };
    return;
  }

  const extra = deps.extraTools ?? [];
  // toolsOverride (lượt uỷ quyền, chế độ Tạo workflow) phải được tôn trọng ở CẢ đường này — trước
  // đây chỉ runLarkChat (claude) đọc nó, nên đổi runner là lọt ra bộ công cụ đầy đủ.
  const tools: LarkToolDef[] =
    deps.toolsOverride ??
    (mode === 'ask'
      ? [...readOnlyTools(), ...extra.filter((t) => !t.gated)]
      : [...allTools(), ...extra]);

  const toolCtx = {
    tools,
    client: deps.client!, // orchestrator only runs Lark turns (runner !== claude) → client is set
    emit: (ev: LarkChatEvent) => queue.push(ev),
    confirm: deps.awaitConfirm,
    ask: deps.awaitAsk,
    autoApprove: deps.autoApprove,
    allowVersionHint: deps.allowVersionHint,
  };

  const queue: LarkChatEvent[] = [];
  let wake: (() => void) | null = null;
  let ended = false;
  const pushDone = () => {
    queue.push({ type: 'done' });
    ended = true;
    wake?.();
  };

  const history = deps.transcript?.trim() ? `\n\n[Lịch sử hội thoại gần đây]\n${deps.transcript.trim()}` : '';
  const switchNote = deps.runnerSwitchNote?.trim()
    ? `\n\n[Đổi agent — tiếp tục từ lịch sử UI, không có session CLI cũ]\n${deps.runnerSwitchNote.trim()}`
    : '';

  let conversation = [
    `${ORCHESTRATOR_RULES}`,
    '',
    '[SYSTEM / Lark]',
    deps.systemPrompt,
    '',
    '[TOOLS — gọi bằng <tool_call>{"name","input"}</tool_call>]',
    toolsSchemaBlock(tools),
    JSON.stringify(ASK_USER_SCHEMA),
    history,
    switchNote,
    '',
    '[USER]',
    prompt,
  ].join('\n');

  void (async () => {
    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const raw = await runRunnerOnce({
          runnerId,
          prompt: conversation,
          model: deps.model,
        });
        const calls = parseToolCalls(raw);
        if (!calls.length) {
          const text = stripToolArtifacts(raw).trim() || raw.trim();
          if (text) {
            const chunk = 120;
            for (let i = 0; i < text.length; i += chunk) {
              queue.push({ type: 'text', delta: text.slice(i, i + chunk) });
            }
          }
          break;
        }
        for (const call of calls) {
          const result = await executeLarkTool(call.name, call.input, toolCtx);
          conversation += `\n\n[assistant tool_call]\n${JSON.stringify(call)}\n[tool_result]\n${result.text}`;
          if (!result.ok && call.name !== ASK_USER_TOOL_NAME) {
            conversation += '\n[Hãy thử cách khác hoặc giải thích lỗi cho người dùng.]';
          }
        }
      }
    } catch (e) {
      queue.push({ type: 'error', message: (e as Error).message || 'Lỗi orchestrator.' });
    } finally {
      pushDone();
    }
  })();

  try {
    while (!ended || queue.length) {
      if (!queue.length) {
        await new Promise<void>((r) => (wake = r));
        continue;
      }
      yield queue.shift()!;
    }
  } finally {
    /* orchestrator owns no child besides runRunnerOnce spawns */
  }
}

function parseToolCalls(text: string): { name: string; input: Record<string, unknown> }[] {
  const out: { name: string; input: Record<string, unknown> }[] = [];
  const tagRe = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(text))) {
    const parsed = parseToolJson(m[1]);
    if (parsed) out.push(parsed);
  }
  if (out.length) return out;
  // Fallback: fenced json with name/tool field
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  while ((m = fenceRe.exec(text))) {
    const parsed = parseToolJson(m[1]);
    if (parsed) out.push(parsed);
  }
  return out;
}

function parseToolJson(raw: string): { name: string; input: Record<string, unknown> } | null {
  try {
    const o = JSON.parse(raw.trim()) as Record<string, unknown>;
    const name = String(o.name ?? o.tool ?? '').trim();
    if (!name) return null;
    const input = (o.input && typeof o.input === 'object' ? o.input : o) as Record<string, unknown>;
    if (input.name) delete input.name;
    if (input.tool) delete input.tool;
    return { name, input };
  } catch {
    return null;
  }
}

function stripToolArtifacts(text: string): string {
  return text.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '').replace(/```[\s\S]*?```/g, '').trim();
}