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
  const args = buildArgs(opts.runnerId, opts.prompt, opts.model, cwd);
  const text = await spawnCollect(cat.bin, args, cwd, env);
  if (opts.cwd !== cwd) await rm(cwd, { recursive: true, force: true }).catch(() => {});
  return text;
}

function buildArgs(runnerId: RunnerId, prompt: string, model: string | undefined, cwd: string): string[] {
  switch (runnerId) {
    case 'grok': {
      const path = writeRunnerPromptFile(cwd, 'lark', prompt);
      const args = ['--prompt-file', path, '--cwd', cwd, '--always-approve'];
      if (model) args.push('-m', model);
      return args;
    }
    case 'gemini': {
      const args = ['-p', prompt, '--yolo'];
      if (model) args.push('-m', model);
      return args;
    }
    case 'codex': {
      const args = ['exec', prompt, '--cd', cwd, '--dangerously-bypass-approvals-and-sandbox'];
      if (model) args.push('-m', model);
      return args;
    }
    default:
      throw new Error(`Runner ${runnerId} không hỗ trợ orchestrator Lark.`);
  }
}

function spawnCollect(bin: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (c: Buffer) => (out += c.toString('utf8')));
    child.stderr.on('data', (c: Buffer) => (out += c.toString('utf8')));
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