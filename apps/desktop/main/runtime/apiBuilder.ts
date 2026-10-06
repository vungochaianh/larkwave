/**
 * Direct-API codegen path — the CLI-less "Tạo app" engine.
 *
 * The CLI runners (claude/grok/…) ship their OWN coding tools + base system prompt; the
 * direct-API path has neither, so this module supplies a small coding agent: five local
 * file/shell tools (write/read/edit/list/run) confined to the app directory, plus a
 * preamble that teaches the model to USE them. It reuses `runApiAgent` (the same
 * multi-provider tool-use loop the Lark agent uses) and adapts its events to the
 * `BuildEvent` stream `createBuild` already consumes — so status/finalize/checkpoint
 * logic is unchanged.
 *
 * Security: every path is resolved and confined under `cwd` (no escaping the app dir).
 * `run_command` executes arbitrary shell — same trust model as the CLIs it replaces (the
 * user's own machine, their own codegen intent), but never outside the project directory.
 */
import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import type { BuildEvent } from '@larkwave/core';
import { runApiAgent, type ApiTool } from './apiRunner';

export interface RunApiBuildOptions {
  runner: string; // claude | grok | gemini | codex
  apiKey: string;
  model?: string;
  /** Larkwave build rules (BUILD_SYSTEM_PROMPT) — prepended with the tool preamble. */
  system: string;
  /** Composed user body (or a full-prompt override). */
  prompt: string;
  /** The app directory the agent writes into. */
  cwd: string;
  signal?: AbortSignal;
}

const CODING_PREAMBLE = [
  'Bạn là một agent lập trình chạy TRỰC TIẾP trong thư mục dự án của người dùng. Bạn KHÔNG trả lời suông —',
  'bạn PHẢI dùng các công cụ bên dưới để tạo/sửa file và chạy lệnh cho tới khi ứng dụng hoàn chỉnh, chạy được.',
  '',
  'Công cụ:',
  '- write_file(path, content): tạo hoặc GHI ĐÈ một file (đường dẫn tương đối từ gốc dự án). Ghi TRỌN VẸN nội dung, KHÔNG để "// ..." hay bỏ lửng.',
  '- read_file(path): đọc nội dung một file trước khi sửa.',
  '- edit_file(path, old_string, new_string): thay một đoạn text (old_string phải khớp CHÍNH XÁC và DUY NHẤT; thêm replace_all:true nếu muốn thay mọi chỗ).',
  '- list_files(dir): liệt kê file trong dự án để nắm cấu trúc hiện có.',
  '- run_command(command): chạy lệnh shell TRONG thư mục dự án (vd: npm install, npm run build). Dùng để cài phụ thuộc và kiểm tra build.',
  '',
  'Quy tắc:',
  '- LUÔN tạo file bằng write_file — ĐỪNG chỉ in code ra chat.',
  '- Trước khi sửa file có sẵn, hãy list_files/read_file để không phá vỡ code hiện tại.',
  '- Sau khi viết xong, nếu có bước cài đặt/build hãy run_command để đảm bảo chạy được; nếu lỗi thì SỬA rồi chạy lại.',
  '- Viết code THẬT, đầy đủ, chạy được — không rút gọn, không placeholder.',
  '- Khi hoàn tất, tóm tắt ngắn gọn (tiếng Việt) những gì đã làm.',
].join('\n');

const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', '.next', '.turbo', 'build', '.cache']);
const MAX_READ = 20000;
const MAX_CMD_OUT = 20000;
const DEFAULT_CMD_TIMEOUT = 180000;

/** Build the confined file/shell toolset for `cwd`. `emit` receives `file` BuildEvents. */
function codingTools(cwd: string, emit: (e: BuildEvent) => void) {
  const root = resolve(cwd);
  const safe = (p: string): string => {
    const abs = resolve(root, p ?? '.');
    if (abs !== root && !abs.startsWith(root + sep)) throw new Error(`Đường dẫn ngoài phạm vi dự án: ${p}`);
    return abs;
  };
  const rel = (abs: string) => relative(root, abs) || '.';

  const impl: Record<string, { def: ApiTool; run: (input: Record<string, unknown>) => Promise<string> }> = {
    write_file: {
      def: {
        name: 'write_file',
        description: 'Tạo hoặc ghi đè một file trong dự án (đường dẫn tương đối). Dùng để viết code.',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string', description: 'Đường dẫn tương đối' }, content: { type: 'string' } },
          required: ['path', 'content'],
        },
      },
      run: async ({ path, content }) => {
        const abs = safe(String(path));
        await mkdir(dirname(abs), { recursive: true });
        const body = typeof content === 'string' ? content : String(content ?? '');
        await writeFile(abs, body, 'utf8');
        const bytes = Buffer.byteLength(body, 'utf8');
        emit({ type: 'file', path: rel(abs), bytes });
        return `Đã ghi ${bytes} bytes vào ${rel(abs)}`;
      },
    },
    read_file: {
      def: {
        name: 'read_file',
        description: 'Đọc nội dung một file trong dự án.',
        parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      },
      run: async ({ path }) => {
        const txt = await readFile(safe(String(path)), 'utf8');
        return txt.length > MAX_READ ? txt.slice(0, MAX_READ) + '\n… (đã cắt bớt)' : txt;
      },
    },
    edit_file: {
      def: {
        name: 'edit_file',
        description: 'Thay một đoạn text trong file. old_string phải khớp chính xác và duy nhất (trừ khi replace_all).',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            old_string: { type: 'string' },
            new_string: { type: 'string' },
            replace_all: { type: 'boolean' },
          },
          required: ['path', 'old_string', 'new_string'],
        },
      },
      run: async ({ path, old_string, new_string, replace_all }) => {
        const abs = safe(String(path));
        const txt = await readFile(abs, 'utf8');
        const oldS = String(old_string ?? '');
        const newS = typeof new_string === 'string' ? new_string : String(new_string ?? '');
        if (!oldS) throw new Error('old_string trống.');
        const count = txt.split(oldS).length - 1;
        if (count === 0) throw new Error('Không tìm thấy old_string trong file.');
        if (count > 1 && !replace_all)
          throw new Error(`old_string xuất hiện ${count} lần — thêm ngữ cảnh cho duy nhất, hoặc đặt replace_all:true.`);
        const next = replace_all ? txt.split(oldS).join(newS) : txt.replace(oldS, newS);
        await writeFile(abs, next, 'utf8');
        emit({ type: 'file', path: rel(abs), bytes: Buffer.byteLength(next, 'utf8') });
        return `Đã sửa ${rel(abs)} (${replace_all ? count : 1} vị trí).`;
      },
    },
    list_files: {
      def: {
        name: 'list_files',
        description: 'Liệt kê file trong dự án (bỏ qua node_modules/.git/dist). Đường dẫn thư mục tùy chọn.',
        parameters: { type: 'object', properties: { dir: { type: 'string' } } },
      },
      run: async ({ dir }) => {
        const start = safe(dir ? String(dir) : '.');
        const out: string[] = [];
        const walk = async (d: string) => {
          if (out.length >= 400) return;
          let entries;
          try {
            entries = await readdir(d, { withFileTypes: true });
          } catch {
            return;
          }
          for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
            if (out.length >= 400) break;
            if (e.name.startsWith('.') && e.name !== '.env.example') continue;
            const abs = join(d, e.name);
            if (e.isDirectory()) {
              if (IGNORE_DIRS.has(e.name)) {
                out.push(rel(abs) + '/ (bỏ qua)');
                continue;
              }
              out.push(rel(abs) + '/');
              await walk(abs);
            } else {
              out.push(rel(abs));
            }
          }
        };
        await walk(start);
        return out.length ? out.join('\n') + (out.length >= 400 ? '\n… (đã cắt bớt)' : '') : '(thư mục trống)';
      },
    },
    run_command: {
      def: {
        name: 'run_command',
        description: 'Chạy một lệnh shell trong thư mục dự án (vd: npm install, npm run build). Trả về exit code + output.',
        parameters: {
          type: 'object',
          properties: { command: { type: 'string' }, timeout_ms: { type: 'number' } },
          required: ['command'],
        },
      },
      run: ({ command, timeout_ms }) =>
        runShell(root, String(command ?? ''), typeof timeout_ms === 'number' ? timeout_ms : DEFAULT_CMD_TIMEOUT),
    },
  };

  return { apiTools: Object.values(impl).map((t) => t.def), run: async (name: string, input: Record<string, unknown>) => {
    const t = impl[name];
    // KHÔNG nhắc chuyện phiên bản ở đây. Ở đường Lark, "không có công cụ X" là chữ ký của bản cài
    // cũ vì prompt đi theo giao diện (code-push) còn tool nằm ở lõi. File này thì ngược lại:
    // CODING_PREAMBLE liệt kê đúng 5 tool ngay bên trên `impl`, cùng một bundle, nên chúng không
    // thể lệch phiên bản. Nguyên nhân thật là model gọi tên một tool không tồn tại — nên câu trả
    // lời hữu ích nhất là LIỆT KÊ tên đúng để nó tự sửa ngay ở lượt sau.
    if (!t) throw new Error(`Không có công cụ ${name}. Các công cụ hợp lệ: ${Object.keys(impl).join(', ')}.`);
    return t.run(input);
  } };
}

/** Run a shell command in the project dir via a login shell (so PATH sees node/npm/nvm). */
function runShell(cwd: string, command: string, timeoutMs: number): Promise<string> {
  return new Promise((resolveP) => {
    if (!command.trim()) return resolveP('(lệnh trống)');
    const shell = process.env.SHELL || (process.platform === 'win32' ? 'cmd.exe' : '/bin/zsh');
    const args = process.platform === 'win32' ? ['/c', command] : ['-lc', command];
    let out = '';
    let done = false;
    const finish = (tail: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const trimmed = out.length > MAX_CMD_OUT ? out.slice(0, MAX_CMD_OUT) + '\n… (đã cắt bớt)' : out;
      resolveP(`${tail}\n${trimmed}`.trim());
    };
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(shell, args, { cwd, env: process.env });
    } catch (e) {
      return resolveP(`Không chạy được lệnh: ${(e as Error)?.message}`);
    }
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* gone */
      }
      finish(`⏱️ Lệnh vượt quá ${Math.round(timeoutMs / 1000)}s — đã dừng.`);
    }, timeoutMs);
    child.stdout?.on('data', (c: Buffer) => {
      out += c.toString('utf8');
    });
    child.stderr?.on('data', (c: Buffer) => {
      out += c.toString('utf8');
    });
    child.on('error', (e) => finish(`Lỗi khi chạy lệnh: ${e.message}`));
    child.on('close', (code) => finish(`exit ${code ?? 0}`));
  });
}

/** Short label for a coding tool call, shown as a build stage. */
function stageLabel(name: string, input: Record<string, unknown>): string {
  const p = typeof input.path === 'string' ? input.path : '';
  switch (name) {
    case 'write_file':
      return `📝 Ghi ${p}`;
    case 'read_file':
      return `👀 Đọc ${p}`;
    case 'edit_file':
      return `✏️ Sửa ${p}`;
    case 'list_files':
      return `📂 Liệt kê file`;
    case 'run_command':
      return `⚙️ ${String(input.command ?? '').slice(0, 60)}`;
    default:
      return `🔧 ${name}`;
  }
}

/**
 * Drive ONE codegen turn via the direct provider API, yielding `BuildEvent`s that
 * `createBuild` already knows how to consume (log/file/stage/error). Mirrors the CLI
 * runner's event contract so the finalize/checkpoint logic is unchanged.
 */
export async function* runApiBuild(opts: RunApiBuildOptions): AsyncGenerator<BuildEvent> {
  const queue: BuildEvent[] = [];
  const sig: { wake: (() => void) | null } = { wake: null };
  let finished = false;
  const push = (e: BuildEvent) => {
    queue.push(e);
    sig.wake?.();
    sig.wake = null;
  };

  const { apiTools, run } = codingTools(opts.cwd, push);

  // execTool wraps each tool call with a running→done/error stage, and surfaces the tool
  // result text back to the agent loop.
  const execTool = async (name: string, input: Record<string, unknown>): Promise<unknown> => {
    const label = stageLabel(name, input);
    push({ type: 'stage', name: label, state: 'running' });
    try {
      const text = await run(name, input);
      push({ type: 'stage', name: label, state: 'done' });
      return text;
    } catch (e) {
      push({ type: 'stage', name: label, state: 'error' });
      push({ type: 'log', level: 'warn', message: `${label}: ${(e as Error)?.message || 'lỗi'}` });
      throw e;
    }
  };

  void (async () => {
    try {
      for await (const ev of runApiAgent({
        runnerId: opts.runner,
        apiKey: opts.apiKey,
        model: opts.model,
        system: `${CODING_PREAMBLE}\n\n${opts.system}`,
        prompt: opts.prompt,
        tools: apiTools,
        execTool,
        maxRounds: 40,
        maxTokens: 16000,
        signal: opts.signal,
      })) {
        if (ev.type === 'text') push({ type: 'log', level: 'info', message: ev.delta });
        else if (ev.type === 'error') {
          push({ type: 'log', level: 'error', message: ev.message });
          push({ type: 'error', message: ev.message });
          push({ type: 'status', status: 'failed' });
        }
        // ev.type === 'tool' is already surfaced by execTool's stage events.
      }
    } catch (e) {
      const message = (e as Error)?.message || 'Lỗi khi chạy API.';
      push({ type: 'error', message });
      push({ type: 'status', status: 'failed' });
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
}
