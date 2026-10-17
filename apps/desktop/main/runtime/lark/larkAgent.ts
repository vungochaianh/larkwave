import { spawn, type ChildProcess } from 'node:child_process';
import { writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { claudeModelArgs } from './cliModel';
import type { LarkChatEvent, LarkChatMode } from '@larkwave/core';
import { contextUsageFromResult } from '../contextBudget';
import type { LarkClient } from './larkClient';
import { claudeEnv } from '../claudeRunner';
import { allTools, readOnlyTools, type LarkToolDef } from './tools';
import { startMcpBridge } from './mcpServer';
import type { TurnFileContext } from './fileContext';
import { rescueClaudeSession } from '../claudeSessions';

/**
 * Prompt dài hơn mức này đi qua STDIN thay vì argv. Lịch sử nối lại (re-seed) có thể tới hàng trăm
 * nghìn ký tự: argv bị trần của hệ điều hành (macOS ~1 MB cho cả argv + env, Linux 128 KB MỖI tham
 * số, Windows 32 K ký tự cả dòng lệnh) — vượt là lượt chết với E2BIG trước khi CLI kịp chạy.
 * `claude -p` không có tham số prompt thì đọc prompt từ stdin.
 */
export const STDIN_PROMPT_MIN_CHARS = 60_000;

/**
 * Turn a raw CLI/provider error into a clear, actionable Vietnamese message. Crucially it
 * REASSURES that the conversation is kept: the chat is session-based (`--resume`), so after the
 * user fixes the cause (top up credit / switch runner / wait) the NEXT message continues the SAME
 * conversation — nothing is lost. Unknown errors pass through verbatim.
 */
function friendlyRunnerError(errText: string): string {
  const t = (errText || '').toLowerCase();
  const keep = ' Hội thoại vẫn được giữ — xử lý xong rồi gửi lại tin nhắn là chạy tiếp.';
  if (/credit balance is too low|insufficient.*credit|billing|quota.*exceed|payment required|\b402\b/.test(t)) {
    return 'Hết credit API của Claude (tài khoản API đang dùng đã cạn số dư).' + keep + ' Cách khắc phục: nạp credit cho tài khoản Anthropic của key đang dùng, hoặc đăng nhập Claude bằng thuê bao (Pro/Max), hoặc đổi sang runner/API key khác trong Cài đặt.';
  }
  if (/prompt is too long|context.*(too long|window|exceed|limit)|maximum.*context|too many tokens|input length/.test(t)) {
    return 'Hội thoại đã dài, chạm giới hạn ngữ cảnh của model.' + keep + ' Gửi tiếp một tin nhắn (Claude sẽ tự tóm tắt phần cũ và chạy tiếp), hoặc mở phiên mới nếu muốn bắt đầu lại ngữ cảnh.';
  }
  if (/overloaded|\b529\b|service unavailable|\b503\b/.test(t)) {
    return 'Máy chủ Claude đang quá tải.' + keep + ' Chờ ít phút rồi gửi lại.';
  }
  if (/rate limit|too many requests|\b429\b/.test(t)) {
    return 'Bị giới hạn tần suất (rate limit).' + keep + ' Chờ một lát rồi gửi lại.';
  }
  if (/unauthor|authenticate|authentication|invalid.*api.*key|api key is invalid|\b401\b|\b403\b|not logged in|login/.test(t)) {
    return (
      'Xác thực Claude CLI thất bại (token/API key không hợp lệ hoặc chưa đăng nhập) — KHÔNG phải lỗi tài khoản Larkwave.' +
      keep +
      ' Cách sửa: mở Cài đặt → mục Claude để đăng nhập lại hoặc dán lại API key; nếu dùng API key, kiểm tra còn hiệu lực + còn credit tại console.anthropic.com; hoặc cập nhật CLI: npm i -g @anthropic-ai/claude-code.'
    );
  }
  return errText || 'Phiên Claude kết thúc với lỗi.';
}

/**
 * Runs ONE Lark chat turn by driving the user's local `claude` CLI and bridging
 * our Lark tools in over MCP. The CLI runs the agent loop under the user's own
 * Claude subscription (no separate API key); our MCP bridge executes each Lark
 * tool call in-process — streaming tool-call events to the UI and pausing gated
 * writes for confirmation. Text from Claude is forwarded as it arrives.
 *
 * Model: the user's pick (`deps.model`) always wins. With no pick, Ask mode forces `sonnet`
 * (cheap Q&A) and Build mode leaves the model to the CLI default (the user's strongest
 * available) so we never request a model their plan lacks.
 */


export interface LarkAgentDeps {
  /** The Lark client — required for Lark turns; omitted for generalMode (no Lark bridge). */
  client?: LarkClient;
  systemPrompt: string;
  /** CLI runner (default claude). */
  runner?: string;
  model?: string;
  /** Recent UI transcript for non-Claude runners (no --resume). */
  transcript?: string;
  /** Note injected once after switching runner mid-session. */
  runnerSwitchNote?: string;
  /** Conversation session: a stable UUID; `resume` continues a prior turn. */
  session: { id: string; resume: boolean };
  /** Extra tools contributed by enabled plugins. */
  extraTools?: LarkToolDef[];
  /** Replace the ENTIRE toolset for this turn. Used by delegated (shared-connection)
   *  turns, where the caller must be confined to a wrapped, scope-checked tool list —
   *  enforcement has to happen at the tool layer, not by hinting in the prompt. */
  toolsOverride?: LarkToolDef[];
  /** Register a pending gated tool call; resolves allow(true)/deny(false). */
  awaitConfirm(callId: string, name: string, input: unknown): Promise<boolean>;
  /** Register a pending `ask_user`; resolves with the user's answer text. */
  awaitAsk(callId: string, question: string, choices?: string[]): Promise<string>;
  /** When true, gated writes run WITHOUT a per-tool confirm: the bridge emits the
   *  tool_call as non-gated so the UI shows no modal. */
  /**
   * Có được nhắc "cài lại bản mới" trong lượt này không. MẶC ĐỊNH KHÔNG — chỉ bật cho lượt trò
   * chuyện của chính người đang ngồi trước máy (xem ToolExecContext.allowVersionHint).
   */
  allowVersionHint?: boolean;
  /**
   * Lượt này có được dùng công cụ ĐỌC TỆP trên máy (Read/Grep) hay không. MẶC ĐỊNH KHÔNG.
   *
   * Chỉ lượt trò chuyện của CHÍNH CHỦ MÁY mới được. Lượt bot Lark trả lời trong nhóm là do NGƯỜI
   * LẠ gửi tới nhưng chạy trên máy chủ sở hữu — cấp Read ở đó nghĩa là bất kỳ ai nhắn được cho bot
   * đều có thể nhờ nó đọc tệp trong máy. (Lượt uỷ quyền cho bạn bè đi nhánh generalMode+readOnly
   * nên vốn đã bị chặn bằng --tools/--disallowedTools, xem RO_DENY.)
   */
  allowFileTools?: boolean;
  autoApprove?: boolean;
  /** Tự duyệt theo từng tool — xem needsConfirmation (chỉ tool `additive` mới được). */
  autoApproveTool?: (name: string) => boolean | 'all';
  /** Temp dir holding the turn's attachments; when set, the CLI runs there with the
   *  Read tool enabled so Claude can read + analyse the files. */
  attachDir?: string;
  attachNames?: string[];
  /** GENERAL "Agents chat" mode: NOT a Lark turn. Skips the Lark MCP bridge entirely and runs the
   *  Claude CLI with its built-in tools (Read/Write/Edit/Bash/WebSearch/WebFetch/Glob/Grep) in a
   *  private scratch workspace — a capable ChatGPT/Claude-style assistant. Every field below stays
   *  undefined for real Lark turns, so the Lark path is unaffected. */
  generalMode?: boolean;
  /** READ-ONLY generalMode (used by delegated "shared assistant" turns a friend runs on the
   *  owner's machine). Confines the CLI to read/search/browse tools ONLY — no Bash, Write or
   *  Edit — so a grantee can never mutate the owner's disk or run commands. Enforced at the
   *  tool-availability layer (--tools whitelist) AND with an explicit --disallowedTools deny. */
  readOnly?: boolean;
  /** Working dir for generalMode (defaults to a fresh scratch temp dir). Attachments land here. */
  cwd?: string;
  /** Run against the user's OWN `claude` login (subscription), NOT any injected stored API key —
   *  used to retry a turn after a depleted stored key caused a credit error. */
  preferSubscription?: boolean;
  /** Abort the turn. Kills the CLI child SYNCHRONOUSLY (independent of the generator's
   *  finally, which can't run while the generator is parked awaiting silent CLI output). */
  signal?: AbortSignal;
  /**
   * Thư mục tệp của lượt (thư mục ghi, thư mục đính kèm, thư mục tự động hoá). Mỗi lần thực thi công
   * cụ chạy trong ngữ cảnh này — hai lượt song song không ghi đè thư mục của nhau (xem fileContext).
   */
  fileContext?: TurnFileContext;
}

/** Route to Claude MCP, Gemini MCP, or the multi-runner orchestrator (grok/codex). */
export async function* runLarkAgent(
  prompt: string,
  mode: LarkChatMode,
  deps: LarkAgentDeps,
): AsyncGenerator<LarkChatEvent> {
  const runner = deps.runner || 'claude';
  // SECURITY: a delegated READ-ONLY turn (generalMode+readOnly, run for a friend on the owner's
  // machine) must NEVER reach the multi-runner orchestrator — the other CLIs (codex/grok/gemini)
  // spawn with --dangerously-bypass-approvals-and-sandbox / --yolo / --always-approve, which
  // would run the friend's prompt fully unsandboxed. The --tools/--disallowedTools read-only
  // whitelist lives ONLY in runLarkChat (the claude path), so force any readOnly turn there
  // regardless of the owner's active runner. (runAgentGrantTurn also pins runner='claude'.)
  // Gemini CLI đi CÙNG cầu MCP Lark với Claude (công cụ gọi thật, stream chữ, --resume, không --yolo)
  // thay vì vòng orchestrator văn bản — xem larkGeminiAgent.ts / geminiCli.ts.
  if (runner === 'gemini' && !deps.generalMode) {
    const { runLarkGemini } = await import('./larkGeminiAgent');
    yield* runLarkGemini(prompt, mode, deps);
    return;
  }
  if (runner !== 'claude' && !(deps.generalMode && deps.readOnly)) {
    const { runLarkOrchestrator } = await import('./larkOrchestrator');
    yield* runLarkOrchestrator(prompt, mode, deps);
    return;
  }
  yield* runLarkChat(prompt, mode, deps);
}

/**
 * Hạn chờ một lần gọi tool Lark của Claude CLI: phải DÀI HƠN hạn chờ người dùng ở phía ta
 * (CONFIRM/ASK 10 phút trong mcpServer) để người bấm muộn vẫn kịp, và phía ta luôn là bên trả lời
 * trước (từ chối khi hết giờ) thay vì CLI tự cắt rồi gỡ server.
 */
export const MCP_TOOL_WAIT_MS = 15 * 60_000;

/**
 * Biến môi trường cho lượt có cầu MCP Lark. Đọc thẳng từ mã CLI đã cài (2.1.286):
 *  - `MCP_TOOL_TIMEOUT` — hạn mỗi lần gọi (mặc định 60s với HTTP). Ghi thêm cạnh `timeout` trong
 *    cấu hình server để bản CLI cũ chưa đọc trường đó vẫn ăn.
 *  - `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT` — hạn "im lặng" (mặc định 5 phút với HTTP), bị kẹp bởi
 *    hạn trên; đặt bằng nhau để lần chờ duyệt dài không bị cắt vì im lặng.
 */
export function mcpWaitEnv(): Record<string, string> {
  return { MCP_TOOL_TIMEOUT: String(MCP_TOOL_WAIT_MS), CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT: String(MCP_TOOL_WAIT_MS) };
}

export async function* runLarkChat(
  prompt: string,
  mode: LarkChatMode,
  deps: LarkAgentDeps,
): AsyncGenerator<LarkChatEvent> {
  const generalMode = !!deps.generalMode;
  const extra = deps.extraTools ?? [];
  const tools = generalMode
    ? [] // general chat uses the CLI's built-in tools, not the Lark MCP toolset
    : deps.toolsOverride ??
      (mode === 'ask'
        ? [...readOnlyTools(), ...extra.filter((t) => !t.gated)] // Q&A: read-only plugin tools too
        : [...allTools(), ...extra]);

  // Single queue fed by BOTH the MCP tool handlers (emit) and the CLI stream.
  const queue: LarkChatEvent[] = [];
  let wake: (() => void) | null = null;
  let ended = false;
  const push = (e: LarkChatEvent) => {
    queue.push(e);
    wake?.();
    wake = null;
  };

  // Lark turns bridge Lark tools over an in-process MCP server. GENERAL turns skip it entirely
  // (built-in CLI tools only) — no client, no bridge, no MCP config.
  const bridge = generalMode
    ? null
    : await startMcpBridge({
        tools,
        client: deps.client!, // set for every Lark turn (only path that reaches the bridge)
        emit: push,
        confirm: deps.awaitConfirm,
        ask: deps.awaitAsk,
        autoApprove: deps.autoApprove,
        autoApproveTool: deps.autoApproveTool,
        allowVersionHint: deps.allowVersionHint,
        files: deps.fileContext,
      });

  // Write the MCP config to a temp file (a path is accepted by every Claude Code
  // version; an inline JSON string is not). 0600 so the per-turn bearer token
  // isn't world-readable.
  let mcpConfigPath = '';
  if (bridge) {
    mcpConfigPath = join(tmpdir(), `tw-lark-mcp-${randomUUID()}.json`);
    await writeFile(
      mcpConfigPath,
      // `timeout`: hạn cho MỖI lần gọi tool của server này. Mặc định của CLI với HTTP chỉ 60 giây
      // (đo trong bản 2.1.286: fetch bọc AbortSignal 60s → "The operation timed out"), trong khi một
      // tool ghi có thể đứng chờ người dùng duyệt tới 10 phút — lỗi đó còn làm CLI GỠ luôn server
      // ("MCP server lark is not connected"). Xem MCP_TOOL_WAIT_MS.
      JSON.stringify({ mcpServers: { lark: { type: 'http', url: bridge.url, headers: { 'x-tw-token': bridge.token }, timeout: MCP_TOOL_WAIT_MS } } }),
      { mode: 0o600 },
    );
  }

  // Attachments: prepend a read-first instruction + enable the built-in Read tool
  // (Read handles images/PDF/text); the CLI runs in the dir holding the files.
  const hasAttach = !!(deps.attachDir && deps.attachNames?.length);
  const finalPrompt = hasAttach
    ? `[Người dùng đính kèm ${deps.attachNames!.length} file trong THƯ MỤC LÀM VIỆC hiện tại: ${deps.attachNames!.join(', ')}. ` +
      'Hãy DÙNG tool Read để ĐỌC + phân tích từng file TRƯỚC, rồi mới thực hiện yêu cầu bên dưới. ' +
      'Với file Office (.xlsx/.docx/.pptx) thì ĐỌC file "<tên>.txt" đi kèm — đó là phần chữ đã được ' +
      'trích sẵn; bản gốc là nhị phân nên Read không mở được. TUYỆT ĐỐI KHÔNG dùng lark_read_attachment ' +
      'cho các file này: công cụ đó chỉ dành cho tệp nằm trong Bitable/Drive, không phải file trong thư mục làm việc.]\n\n' +
      prompt
    : prompt;

  // Working dir. `deps.cwd` is the caller's STABLE per-conversation directory and must win for
  // EVERY turn: Claude Code stores its sessions per-cwd, so running one turn elsewhere (a temp
  // attachment dir, or the inherited process cwd) means the next `--resume` looks in a bucket that
  // never saw it → the conversation silently forks and loses that turn's memory. The attachment
  // dir and the per-turn scratch dir remain only as fallbacks when no conversation dir was passed;
  // general mode still gets a PRIVATE scratch workspace in that case (Bash/Write sandboxed).
  let scratchDir: string | null = null; // set only when WE create it (→ clean up in finally)
  const workCwd =
    deps.cwd ||
    (hasAttach ? deps.attachDir : undefined) ||
    (generalMode ? (scratchDir = join(tmpdir(), `tw-agent-${randomUUID()}`)) : undefined);
  if (scratchDir) await mkdir(scratchDir, { recursive: true });

  // DELEGATED "shared assistant" turn: this runs on the OWNER's machine for a FRIEND, so it
  // gets WEB + KNOWLEDGE only — deliberately NO filesystem access. Read/Glob/Grep are excluded
  // on purpose: a friend must never be able to ask the assistant to read the owner's private
  // files (~/.ssh, .env, or grants.json which holds Lark app_tokens) and relay them back. The
  // relay carries text only (no attachments cross it), so file tools add zero value and pure
  // exfiltration risk. `--tools` is a WHITELIST of available built-in tools, so everything not
  // listed (Bash/Write/Edit AND Read/Glob/Grep) literally does not exist for this turn;
  // `--disallowedTools` is a belt-and-suspenders DENY (deny always wins in Claude Code) in case
  // a future CLI changes --tools semantics; `--allowedTools` pre-approves the web tools so they
  // run headlessly (no interactive approver). NOTE: each tool is its OWN argv element —
  // `--tools <tools...>` is variadic space-separated, so a comma-joined value would be one
  // bogus tool name.
  // WebSearch ONLY — NOT WebFetch: WebFetch would let a friend fetch the owner's localhost/LAN/
  // internal HTTPS services (SSRF + an attributed outbound-request proxy on the owner's machine).
  // WebSearch goes through a search provider, so it can't be pointed at the owner's own hosts.
  // Công cụ đọc tệp cho lượt Lark: chỉ mở cho lượt của chính chủ máy, hoặc khi chính người dùng
  // vừa đính kèm tệp vào lượt đó (thư mục làm việc là của họ).
  const fileTools = deps.allowFileTools || hasAttach ? ['Read', 'Grep'] : [];

  const RO_TOOLS = ['WebSearch'];
  const RO_DENY = ['Bash', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Read', 'Glob', 'Grep', 'WebFetch'];

  // General chat = the CLI's DEFAULT built-in tools (read/write/bash/web), like a plain CLI session
  // runner (runClaude). We do NOT pass --tools/--allowedTools (a comma list there breaks the
  // spawn); instead bypassPermissions auto-approves every tool headlessly (there's no in-chat
  // permission prompt) so the assistant can actually read attachments + run tools. --add-dir
  // grants the scratch workspace.
  const baseArgs = generalMode && deps.readOnly
    ? [
        '-p',
        finalPrompt,
        '--output-format',
        'stream-json',
        '--verbose',
        '--include-partial-messages',
        // Isolate the owner's globally-configured MCP servers: --tools/--disallowedTools only
        // govern BUILT-IN tools, so without this a friend could call the owner's mcp__filesystem
        // (or any other) MCP tool. We pass no --mcp-config, so strict mode = ZERO MCP servers.
        '--strict-mcp-config',
        '--tools',
        ...RO_TOOLS,
        '--allowedTools',
        ...RO_TOOLS,
        '--disallowedTools',
        ...RO_DENY,
        '--permission-mode',
        'acceptEdits',
        '--add-dir',
        workCwd || '.',
        '--append-system-prompt',
        deps.systemPrompt,
      ]
    : generalMode
    ? [
        '-p',
        finalPrompt,
        '--output-format',
        'stream-json',
        '--verbose',
        '--include-partial-messages',
        '--permission-mode',
        'bypassPermissions',
        '--add-dir',
        workCwd || '.',
        '--append-system-prompt',
        deps.systemPrompt,
      ]
    : [
        '-p',
        finalPrompt,
        '--output-format',
        'stream-json',
        '--verbose',
        // Token-level streaming: emit content_block_delta chunks as they arrive.
        '--include-partial-messages',
        // Only OUR Lark MCP server (ignore the user's other global MCP servers).
        '--strict-mcp-config',
        // Built-in tools: Read + Grep — CHỈ khi lượt này được phép (xem allowFileTools), cộng Lark MCP.
        //
        // Vì sao cần Read: `lark_read_attachment` tải ảnh/PDF về đĩa rồi bảo model "dùng Read với
        // đường dẫn này"; không có Read thì cả nhánh ảnh/PDF là ngõ cụt. Grep để đọc tiếp phần chữ
        // dài đã ghi ra .txt.
        // Vì sao phải GIỚI HẠN: lượt bot Lark trong nhóm do NGƯỜI LẠ gửi tới nhưng chạy trên máy
        // chủ sở hữu — cấp Read ở đó là cho bất kỳ ai nhắn được cho bot đọc tệp trong máy.
        // Vẫn KHÔNG có Bash/Write/Edit ở bất kỳ lượt Lark nào.
        ...(fileTools.length ? ['--tools', ...fileTools] : ['--tools', '']),
        '--permission-mode',
        'acceptEdits',
        // Our gated tools self-confirm in-process; allow the whole lark server at CLI level.
        '--allowedTools',
        fileTools.length ? `mcp__lark,${fileTools.join(',')}` : 'mcp__lark',
        '--mcp-config',
        mcpConfigPath,
        '--append-system-prompt',
        deps.systemPrompt,
      ];
  // Model người dùng chọn luôn thắng (xem cliModel.ts — lỗi cũ: lượt Lark bỏ qua nó, chạy Sonnet).
  baseArgs.push(...claudeModelArgs({ mode, generalMode, model: deps.model }));

  let streamedChars = 0; // text already streamed for the in-flight message (dedup)
  let cliModel: string | undefined; // model id from the stream-json init event → context window
  // Usage của LẦN GỌI MODEL CUỐI — đó mới là cỡ ngữ cảnh thật. `result.usage` là TỔNG CỘNG DỒN mọi
  // lần gọi trong lượt (mỗi bước công cụ đọc lại cả ngữ cảnh), nên một lượt nhiều bước công cụ báo
  // ~86% dù ngữ cảnh thật nhỏ hơn nhiều (gặp thật 09/10/2026). claudeRunner đã sửa y hệt từ trước.
  let lastAssistantUsage: any = null;
  // Ref object (not a bare `let`): TS won't narrow a property to its initializer, so the
  // in-closure assignment below is still visible to the finally-block cleanup.
  const childRef: { current: ChildProcess | null } = { current: null };

  // Run the CLI once. Resolves 'resume-missing' when we tried to --resume a session
  // the local CLI doesn't have (restored from server backup, synced from another
  // device, or pruned) so the caller can retry fresh; otherwise 'ok'.
  const runOnce = (sessionArgs: string[], promptOverride?: string) =>
    new Promise<'ok' | 'resume-missing'>((resolve) => {
      // baseArgs[0..1] are ['-p', finalPrompt]; swap in a seeded prompt when re-seeding context.
      const promptText = promptOverride ?? finalPrompt;
      // Prompt rất dài (lịch sử nối lại) → stdin, không nhồi vào argv (xem STDIN_PROMPT_MIN_CHARS).
      const viaStdin = promptText.length > STDIN_PROMPT_MIN_CHARS;
      const args = viaStdin ? ['-p', ...baseArgs.slice(2)] : promptOverride ? ['-p', promptOverride, ...baseArgs.slice(2)] : baseArgs;
      const child = spawn('claude', [...args, ...sessionArgs], {
        stdio: [viaStdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
        env: bridge ? { ...claudeEnv({ noKey: deps.preferSubscription }), ...mcpWaitEnv() } : claudeEnv({ noKey: deps.preferSubscription }),
        cwd: workCwd,
      });
      if (viaStdin && child.stdin) {
        child.stdin.on('error', () => undefined); // CLI thoát sớm → EPIPE, đừng làm sập tiến trình chính
        child.stdin.end(promptText, 'utf8');
      }
      childRef.current = child;
      // Kill the child the instant an abort is requested — SYNCHRONOUSLY, not via this
      // generator's finally (which is queued behind the parked next() while the CLI is
      // silent, so a hung child would otherwise never receive SIGTERM).
      if (deps.signal) {
        if (deps.signal.aborted) {
          try {
            child.kill('SIGTERM');
          } catch {
            /* already gone */
          }
        } else {
          deps.signal.addEventListener(
            'abort',
            () => {
              try {
                child.kill('SIGTERM');
              } catch {
                /* already gone */
              }
            },
            { once: true },
          );
        }
      }
      let buf = '';
      let resumeMissing = false;
      child.stdout!.on('data', (chunk: Buffer) => {
        buf += chunk.toString('utf8');
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let obj: any;
          try {
            obj = JSON.parse(line);
          } catch {
            continue;
          }
          // The init event names the model the CLI actually ran → context window.
          if (obj?.type === 'system' && obj.subtype === 'init' && typeof obj.model === 'string') {
            cliModel = obj.model;
            continue;
          }
          // ── Token-level streaming (--include-partial-messages) ──────────────────
          if (obj?.type === 'stream_event') {
            const ev = obj.event;
            if (ev?.type === 'message_start') {
              streamedChars = 0;
            } else if (
              ev?.type === 'content_block_delta' &&
              ev.delta?.type === 'text_delta' &&
              typeof ev.delta.text === 'string' &&
              ev.delta.text
            ) {
              streamedChars += ev.delta.text.length;
              push({ type: 'text', delta: ev.delta.text });
            }
            continue;
          }
          // The final assembled assistant message usually DUPLICATES the streamed text
          // → skip it, unless streaming somehow didn't cover it (defensive fallback).
          if (obj?.type === 'assistant' && obj.message?.usage && typeof obj.message.usage === 'object') {
            lastAssistantUsage = obj.message.usage;
          }
          if (obj?.type === 'assistant' && obj.message?.content) {
            const full = obj.message.content
              .filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
              .map((b: any) => b.text)
              .join('');
            if (full.trim() && streamedChars < Math.floor(full.trim().length * 0.5)) {
              push({ type: 'text', delta: full });
            }
            continue;
          }
          if (obj?.type === 'result') {
            // Context telemetry — how full the resumed conversation is. The renderer warns
            // + offers a fresh session as this approaches the model window.
            const usage = contextUsageFromResult(lastAssistantUsage ? { usage: lastAssistantUsage } : obj, cliModel);
            if (usage) {
              push({
                type: 'usage',
                contextTokens: usage.contextTokens,
                windowTokens: usage.windowTokens,
                percentUsed: usage.percentUsed,
                // Id model THẬT (vd `claude-opus-5-5`), không phải bí danh người dùng chọn.
                ...(cliModel ? { model: cliModel } : {}),
              });
            }
            if (obj.is_error) {
              // "Session not found" arrives in obj.errors[] (NOT obj.error) — detect it so
              // the driver can transparently restart instead of failing the whole chat.
              // Lỗi có thể nằm ở `errors[]` (vd "no conversation found"), ở `error`, HOẶC ở `result`
              // (vd "Failed to authenticate. API Error: 401 API key is invalid.") — CLI đặt chữ lỗi
              // vào `result` khi is_error. Thiếu nhánh `result` thì errText rỗng → chỉ ra lỗi chung
              // chung, mất luôn thông tin để nhận ra đây là lỗi xác thực.
              const errText = Array.isArray(obj.errors)
                ? obj.errors.join('; ')
                : typeof obj.error === 'string'
                  ? obj.error
                  : typeof obj.result === 'string'
                    ? obj.result
                    : '';
              if (/no conversation found/i.test(errText)) {
                resumeMissing = true;
              } else {
                push({ type: 'error', message: friendlyRunnerError(errText) });
              }
            }
          }
        }
      });
      child.stderr!.on('data', () => {
        /* CLI diagnostics — ignored; errors surface via the result event / close code */
      });
      child.on('error', (err: NodeJS.ErrnoException) => {
        // ENOENT = the `claude` binary isn't on PATH → give an actionable message instead
        // of the opaque "spawn claude ENOENT".
        const message =
          err.code === 'ENOENT'
            ? 'Không tìm thấy Claude CLI. Hãy cài đặt (npm i -g @anthropic-ai/claude-code) rồi đăng nhập, hoặc dán token trong phần cài đặt Claude.'
            : `Không gọi được Claude CLI: ${err.message}`;
        push({ type: 'error', message });
        resolve('ok'); // spawn failure — nothing to retry
      });
      child.on('close', () => resolve(resumeMissing ? 'resume-missing' : 'ok'));
    });

  const finish = () => {
    push({ type: 'done' });
    ended = true;
    wake?.();
  };

  // Prior-conversation context used ONLY to re-seed a session Claude can't --resume (gone locally:
  // restored from server backup / another device / reinstall / CLI prune) OR a fresh session made
  // by switching runner into claude. On the NORMAL --resume path this is NOT injected (the CLI
  // already holds the native context) so there is no double context on the happy path.
  const historyForSeed = (deps.runnerSwitchNote || deps.transcript || '').trim();
  const seededPrompt = historyForSeed
    ? `[Lịch sử hội thoại trước đó — hãy TIẾP TỤC cùng ngữ cảnh này; đừng hỏi lại những gì đã có ở trên]\n${historyForSeed}\n\n[Yêu cầu mới của người dùng]\n${finalPrompt}`
    : finalPrompt;

  // Drive the CLI. Multi-turn: first turn pins a session id, later turns --resume it for context.
  // If the resumed session is gone locally, restart it as a fresh session (same id) AND re-seed the
  // conversation from the renderer transcript so the agent keeps the conversation's memory instead
  // of starting blank (the visible history lives in the renderer; Claude's own context had reset).
  void (async () => {
    if (deps.session.resume) {
      let status = await runOnce(['--resume', deps.session.id]);
      if (status === 'resume-missing') {
        // CỨU PHIÊN GỐC trước khi đành nhồi lại lịch sử: Claude CLI cất phiên theo thư mục làm việc,
        // nên hội thoại nhập từ Toolswave / chuyển thư mục / khôi phục từ máy khác vẫn còn nguyên bản
        // ghi `<id>.jsonl` — chỉ là ở thư mục dự án KHÁC. Đúng id đó (không bao giờ id khác), bản mới
        // nhất, chép sang thư mục của cwd này rồi `--resume` lại một lần. Nhớ trọn, kể cả kết quả công cụ.
        const rescued = await rescueClaudeSession(deps.session.id, workCwd || process.cwd(), claudeEnv({ noKey: deps.preferSubscription })).catch(() => null);
        if (rescued) status = await runOnce(['--resume', deps.session.id]);
      }
      if (status === 'resume-missing') {
        if (historyForSeed) push({ type: 'text', delta: '_(Khôi phục ngữ cảnh hội thoại trên máy này…)_\n\n' });
        await runOnce(['--session-id', deps.session.id], historyForSeed ? seededPrompt : undefined);
      }
    } else {
      // Fresh session. When we carried a transcript (e.g. switched runner → claude), seed it so the
      // new session continues the SAME conversation instead of starting empty.
      await runOnce(['--session-id', deps.session.id], historyForSeed ? seededPrompt : undefined);
    }
    finish();
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
    try {
      childRef.current?.kill('SIGTERM');
    } catch {
      /* already gone */
    }
    await bridge?.close().catch(() => {});
    if (mcpConfigPath) await rm(mcpConfigPath, { force: true }).catch(() => {});
    // Only remove a scratch dir WE created (never deps.cwd/attachDir — the caller owns those).
    if (scratchDir) await rm(scratchDir, { recursive: true, force: true }).catch(() => {});
  }
}

