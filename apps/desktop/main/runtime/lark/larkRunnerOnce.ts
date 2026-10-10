import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { RunnerId } from '@larkwave/shared';
import { catalogEntry } from '../runners/catalog';
import { getRunner } from '../runners/registry';
import { runnerEnv, writeRunnerPromptFile } from '../runners/runnerCore';

/**
 * Run one headless turn of a non-Claude CLI and return the combined stdout text.
 * Used by the Lark orchestrator agent loop (grok/gemini/codex).
 */
export async function runRunnerOnce(opts: {
  runnerId: RunnerId;
  prompt: string;
  model?: string;
  cwd?: string;
}): Promise<string> {
  const cat = catalogEntry(opts.runnerId);
  const runner = getRunner(opts.runnerId);
  if (!(await runner.available())) {
    throw new Error(`Chưa tìm thấy ${runner.label} (\`${cat.bin}\`). Cài: ${runner.installHint}`);
  }

  const cwd = opts.cwd || join(tmpdir(), `tw-lark-run-${randomUUID()}`);
  await mkdir(cwd, { recursive: true });
  const env = runnerEnv(opts.runnerId);
  const { args, stdin } = buildArgs(opts.runnerId, opts.prompt, opts.model, cwd);
  const text = await spawnCollect(cat.bin, args, cwd, env, stdin);
  if (opts.cwd !== cwd) await rm(cwd, { recursive: true, force: true }).catch(() => {});
  return text;
}

/**
 * Prompt dài hơn mức này đi qua STDIN (lịch sử hội thoại + bộ công cụ có thể tới hàng trăm nghìn ký
 * tự; argv có trần của hệ điều hành — xem larkAgent.STDIN_PROMPT_MIN_CHARS). Cả hai CLI đều đọc stdin:
 * `codex exec -` lấy toàn bộ chỉ dẫn từ stdin; `gemini -p <x>` nối `<x>` vào SAU nội dung stdin.
 */
export const RUNNER_STDIN_MIN_CHARS = 60_000;

export function buildArgs(runnerId: RunnerId, prompt: string, model: string | undefined, cwd: string): { args: string[]; stdin?: string } {
  const big = prompt.length > RUNNER_STDIN_MIN_CHARS;
  switch (runnerId) {
    case 'grok': {
      const path = writeRunnerPromptFile(cwd, 'lark', prompt);
      const args = ['--prompt-file', path, '--cwd', cwd, '--always-approve'];
      if (model) args.push('-m', model);
      return { args };
    }
    case 'gemini': {
      const args = big ? ['-p', '(Thực hiện đúng yêu cầu [USER] ở cuối nội dung phía trên.)', '--yolo'] : ['-p', prompt, '--yolo'];
      if (model) args.push('-m', model);
      return big ? { args, stdin: prompt } : { args };
    }
    case 'codex': {
      const args = ['exec', big ? '-' : prompt, '--cd', cwd, '--dangerously-bypass-approvals-and-sandbox'];
      if (model) args.push('-m', model);
      return big ? { args, stdin: prompt } : { args };
    }
    default:
      throw new Error(`Runner ${runnerId} không hỗ trợ orchestrator Lark.`);
  }
}

function spawnCollect(bin: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, stdin?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, env, stdio: [stdin !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    if (stdin !== undefined && child.stdin) {
      child.stdin.on('error', () => undefined);
      child.stdin.end(stdin, 'utf8');
    }
    let out = '';
    child.stdout!.on('data', (c: Buffer) => (out += c.toString('utf8')));
    child.stderr!.on('data', (c: Buffer) => (out += c.toString('utf8')));
    child.on('error', (err: NodeJS.ErrnoException) => {
      reject(
        new Error(
          err.code === 'ENOENT'
            ? `Không tìm thấy \`${bin}\` trên PATH.`
            : `Không gọi được ${bin}: ${err.message}`,
        ),
      );
    });
    child.on('close', (code) => {
      const t = out.trim();
      if (!t && code !== 0) reject(new Error(`${bin} thoát với mã ${code ?? '?'}`));
      else resolve(t || '(không có phản hồi)');
    });
  });
}