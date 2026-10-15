import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, readFile, rm, rmdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { LarkChatEvent, LarkChatMode } from '@larkwave/core';
import { allTools, readOnlyTools } from './tools';
import { startMcpBridge } from './mcpServer';
import { MCP_TOOL_WAIT_MS, type LarkAgentDeps } from './larkAgent';
import { runnerEnv } from '../runners/runnerCore';
import {
  GEMINI_SESSION_FILE,
  friendlyGeminiError,
  geminiArgs,
  geminiAttachmentNote,
  geminiPolicyToml,
  geminiSessionExists,
  geminiSystemPreamble,
  geminiWorkspaceSettings,
  isGeminiResumeMissing,
  parseGeminiLine,
  pickGeminiResume,
} from './geminiCli';

/**
 * Một lượt Lark trên Gemini CLI, đi CÙNG cầu MCP Lark với Claude (xem geminiCli.ts cho lý do và các
 * sự thật đo được). Hình dạng giống runLarkChat: một hàng đợi nhận cả sự kiện của cầu MCP (hộp xác
 * nhận, kết quả công cụ) lẫn chữ của CLI; huỷ là giết tiến trình con NGAY.
 *
 * Trí nhớ giữa các lượt: `--resume <id phiên Gemini>`. Id do CLI cấp (sự kiện `init`), lưu trong thư
 * mục hội thoại kèm `agentSessionId` của app — app xoay phiên (đổi runner, nén hội thoại) thì id cũ tự
 * hết hiệu lực. Phiên mất (máy khác, xoá ~/.gemini) ⇒ mở phiên mới và MỒI lại lịch sử từ transcript.
 */
export async function* runLarkGemini(prompt: string, mode: LarkChatMode, deps: LarkAgentDeps): AsyncGenerator<LarkChatEvent> {
  const extra = deps.extraTools ?? [];
  const tools =
    deps.toolsOverride ?? (mode === 'ask' ? [...readOnlyTools(), ...extra.filter((t) => !t.gated)] : [...allTools(), ...extra]);

  const queue: LarkChatEvent[] = [];
  let wake: (() => void) | null = null;
  let ended = false;
  const push = (e: LarkChatEvent) => {
    queue.push(e);
    wake?.();
    wake = null;
  };

  const bridge = await startMcpBridge({
    tools,
    client: deps.client!, // đường này chỉ chạy lượt Lark (generalMode đi đường khác)
    emit: push,
    confirm: deps.awaitConfirm,
    ask: deps.awaitAsk,
    autoApprove: deps.autoApprove,
    autoApproveTool: deps.autoApproveTool,
    allowVersionHint: deps.allowVersionHint,
    files: deps.fileContext,
  });

  const hasAttach = !!(deps.attachDir && deps.attachNames?.length);
  const fileTools = !!(deps.allowFileTools || hasAttach);
  const finalPrompt = hasAttach ? geminiAttachmentNote(deps.attachNames!) + prompt : prompt;

  // Thư mục làm việc ỔN ĐỊNH của hội thoại: Gemini cất phiên theo thư mục, chạy chỗ khác là `--resume`
  // tìm nhầm ngăn. Không có (lượt bot, tóm tắt) thì một thư mục tạm riêng, không nối phiên.
  let scratchDir: string | null = null;
  const workCwd = deps.cwd || (hasAttach ? deps.attachDir! : (scratchDir = join(tmpdir(), `lw-gemini-${randomUUID()}`)));
  await mkdir(workCwd, { recursive: true });

  // Cấu hình theo lượt: settings của thư mục (MCP + danh sách công cụ), policy, lời nhắc hệ thống.
  const settingsPath = join(workCwd, '.gemini', 'settings.json');
  const turnDir = join(tmpdir(), `lw-gemini-turn-${randomUUID()}`);
  const policyPath = join(turnDir, 'policy.toml');
  const systemPath = join(turnDir, 'system.md');
  await mkdir(dirname(settingsPath), { recursive: true });
  await mkdir(turnDir, { recursive: true, mode: 0o700 });
  await writeFile(
    settingsPath,
    JSON.stringify(geminiWorkspaceSettings({ bridgeUrl: bridge.url, bridgeToken: bridge.token, timeoutMs: MCP_TOOL_WAIT_MS, fileTools }), null, 2),
    { mode: 0o600 },
  );
  await writeFile(policyPath, geminiPolicyToml(fileTools), { mode: 0o600 });
  await writeFile(systemPath, `${geminiSystemPreamble(fileTools)}\n${deps.systemPrompt}`, { mode: 0o600 });

  const sessionFile = join(workCwd, GEMINI_SESSION_FILE);
  const saveSession = async (geminiId: string) => {
    if (scratchDir) return; // thư mục tạm bị xoá cuối lượt — không có gì để nối
    await mkdir(dirname(sessionFile), { recursive: true }).catch(() => {});
    await writeFile(sessionFile, JSON.stringify({ agent: deps.session.id, gemini: geminiId }), { mode: 0o600 }).catch(() => {});
  };

  const env: NodeJS.ProcessEnv = { ...runnerEnv('gemini'), GEMINI_SYSTEM_MD: systemPath };
  const childRef: { current: ChildProcess | null } = { current: null };

  /** Chạy CLI một lần. 'resume-missing' = id phiên không còn ⇒ người gọi chạy lại phiên mới. */
  const runOnce = (promptText: string, resumeId?: string) =>
    new Promise<'ok' | 'resume-missing'>((resolve) => {
      const { args, stdin } = geminiArgs({ prompt: promptText, model: deps.model, resumeId, policyPath });
      const child = spawn('gemini', args, { stdio: [stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'], env, cwd: workCwd });
      childRef.current = child;
      if (stdin && child.stdin) {
        child.stdin.on('error', () => undefined); // CLI thoát sớm → EPIPE
        child.stdin.end(stdin, 'utf8');
      }
      // Giết NGAY khi huỷ — finally của generator bị xếp sau next() đang treo nên không kịp.
      const kill = () => {
        try {
          child.kill('SIGTERM');
        } catch {
          /* đã thoát */
        }
      };
      if (deps.signal) {
        if (deps.signal.aborted) kill();
        else deps.signal.addEventListener('abort', kill, { once: true });
      }

      let buf = '';
      let stderr = '';
      let reported = false; // đã báo một lỗi cho người dùng trong lần chạy này
      let resumeMissing = false;
      const report = (message: string, code?: number | null) => {
        // Câu "Error resuming session" có thể tới qua stdout lẫn stderr — đó là tín hiệu chạy lại phiên
        // mới, không phải lỗi để hiện cho người dùng.
        if (resumeId && isGeminiResumeMissing(message, code ?? null)) {
          resumeMissing = true;
          return;
        }
        if (reported) return;
        reported = true;
        push({ type: 'error', message: friendlyGeminiError(message, code) });
      };
      child.stdout!.on('data', (chunk: Buffer) => {
        buf += chunk.toString('utf8');
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const ev = parseGeminiLine(buf.slice(0, nl));
          buf = buf.slice(nl + 1);
          if (!ev) continue;
          if (ev.kind === 'init') void saveSession(ev.sessionId);
          else if (ev.kind === 'text') push({ type: 'text', delta: ev.text });
          else if (ev.kind === 'warning') {
            if (ev.message) push({ type: 'text', delta: `\n\n_(Gemini: ${ev.message})_\n` });
          } else if (ev.kind === 'error') report(ev.message);
          else if (ev.kind === 'result' && !ev.ok) report(ev.message || 'lượt chạy thất bại');
        }
      });
      child.stderr!.on('data', (chunk: Buffer) => {
        stderr = (stderr + chunk.toString('utf8')).slice(-8000);
      });
      child.on('error', (err: NodeJS.ErrnoException) => {
        report(err.code === 'ENOENT' ? 'ENOENT' : err.message);
        resolve('ok');
      });
      child.on('close', (code) => {
        const tail = buf.trim();
        if (tail) {
          const ev = parseGeminiLine(tail);
          if (ev?.kind === 'error') report(ev.message, code);
        }
        if (deps.signal?.aborted) return resolve('ok');
        if (resumeId && (resumeMissing || isGeminiResumeMissing(stderr, code))) return resolve('resume-missing');
        if (code && code !== 0) report(stderr.trim().split('\n').slice(-6).join('\n'), code);
        resolve('ok');
      });
    });

  const finish = () => {
    push({ type: 'done' });
    ended = true;
    wake?.();
  };

  const historyForSeed = (deps.runnerSwitchNote || deps.transcript || '').trim();
  const seededPrompt = historyForSeed
    ? `[Lịch sử hội thoại trước đó — hãy TIẾP TỤC cùng ngữ cảnh này; đừng hỏi lại những gì đã có ở trên]\n${historyForSeed}\n\n[Yêu cầu mới của người dùng]\n${finalPrompt}`
    : finalPrompt;

  void (async () => {
    try {
      let saved: unknown = null;
      if (!scratchDir && deps.session.resume) saved = JSON.parse(await readFile(sessionFile, 'utf8').catch(() => 'null'));
      const resumeId = pickGeminiResume(saved, deps.session.id);
      if (resumeId && geminiSessionExists(workCwd, resumeId)) {
        const st = await runOnce(finalPrompt, resumeId);
        if (st === 'resume-missing' && !deps.signal?.aborted) {
          if (historyForSeed) push({ type: 'text', delta: '_(Khôi phục ngữ cảnh hội thoại trên máy này…)_\n\n' });
          await runOnce(seededPrompt);
        }
      } else {
        // Phiên mới: lượt đầu, đổi runner, hoặc phiên Gemini đã mất ⇒ mồi lịch sử (nếu có).
        await runOnce(seededPrompt);
      }
    } catch (e) {
      push({ type: 'error', message: friendlyGeminiError((e as Error)?.message || String(e)) });
    } finally {
      finish();
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
    try {
      childRef.current?.kill('SIGTERM');
    } catch {
      /* đã thoát */
    }
    await bridge.close().catch(() => {});
    // Khoá của lượt nằm trong settings.json — xoá ngay, và gỡ thư mục .gemini nếu chỉ có nó.
    await rm(settingsPath, { force: true }).catch(() => {});
    await rmdir(dirname(settingsPath)).catch(() => {});
    await rm(turnDir, { recursive: true, force: true }).catch(() => {});
    if (scratchDir) await rm(scratchDir, { recursive: true, force: true }).catch(() => {});
  }
}
