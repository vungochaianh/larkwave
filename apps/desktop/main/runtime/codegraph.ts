import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { claudeEnv } from './claudeRunner';

/**
 * OPTIONAL CodeGraph integration (npm: @colbymchenry/codegraph). CodeGraph is a LOCAL,
 * user-installed MCP server that builds a tree-sitter knowledge graph of a codebase and
 * exposes `codegraph_explore` / `codegraph_node`: one call returns the relevant symbols'
 * verbatim source + call-paths + blast-radius — so when ITERATING on an existing app the
 * agent stops burning tool calls + the user's Claude tokens on grep + repeated Reads.
 *
 * Like the `claude` CLI itself, this is a dependency the USER installs — we can't bundle
 * or auto-install it. So EVERYTHING here degrades gracefully:
 *   - not on PATH  → codegen runs exactly as before (no MCP, no error);
 *   - only wired into ITERATE runs (the app dir already has code to graph), never the
 *     first generation (empty dir → nothing to index).
 *
 * Detection + spawning reuse `claudeEnv()` so `codegraph` is found on the SAME login-shell
 * PATH as `claude` (both live in the user's nvm/homebrew/npm-global bin). Telemetry is
 * forced OFF for the user's privacy.
 *
 * Install hint surfaced in the UI when missing: `npm i -g @colbymchenry/codegraph`
 */

/** Spawn env: the claude login-shell PATH + CodeGraph telemetry disabled. */
const cgEnv = (): NodeJS.ProcessEnv => ({ ...claudeEnv(), CODEGRAPH_TELEMETRY: '0' });

/** True if a usable `codegraph` binary is on PATH (mirrors `claudeAvailable`). */
export async function codegraphAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn('codegraph', ['--version'], { stdio: 'ignore', env: cgEnv() });
    p.on('error', () => resolve(false));
    p.on('close', (code) => resolve(code === 0));
  });
}

/** `codegraph --version` string, or null if unavailable (for the UI status). */
export async function codegraphVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    const p = spawn('codegraph', ['--version'], { stdio: ['ignore', 'pipe', 'ignore'], env: cgEnv() });
    let out = '';
    p.stdout?.on('data', (c: Buffer) => (out += c.toString('utf8')));
    p.on('error', () => resolve(null));
    p.on('close', (code) => resolve(code === 0 ? (out.match(/[\d.]+/) || [])[0] || null : null));
  });
}

/** Install state for the UI (one spawn): `{installed, version}`. */
export async function codegraphStatus(): Promise<{ installed: boolean; version?: string }> {
  const version = await codegraphVersion();
  return { installed: !!version, version: version ?? undefined };
}

/**
 * Make sure the app dir is indexed before an iterate run: `init` the first time (builds
 * `.codegraph/`, which self-gitignores), else `sync` (incremental). Bounded + best-effort —
 * a failure just means the run proceeds without a fresh graph. ~0.2–2s for a typical app.
 */
export function ensureIndexed(cwd: string): void {
  try {
    const indexed = existsSync(join(cwd, '.codegraph'));
    spawnSync('codegraph', [indexed ? 'sync' : 'init', cwd], {
      cwd,
      env: cgEnv(),
      stdio: 'ignore',
      timeout: 60_000,
    });
  } catch {
    /* best-effort: codegen continues without the graph */
  }
}

/**
 * Write a temp MCP config exposing CodeGraph over stdio for `cwd`, returning its path to
 * pass as `claude -p --mcp-config <path>`. `--no-watch` keeps the one-shot run from leaving
 * a file-watcher daemon behind (we pre-index via ensureIndexed instead). Caller removes the
 * file after the run.
 */
export async function writeCodegraphMcpConfig(cwd: string): Promise<{ path: string; dir: string }> {
  const dir = join(tmpdir(), `tw-codegraph-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  const path = join(dir, 'mcp.json');
  const config = {
    mcpServers: {
      codegraph: { type: 'stdio', command: 'codegraph', args: ['serve', '--mcp', '--path', cwd, '--no-watch'] },
    },
  };
  await writeFile(path, JSON.stringify(config));
  return { path, dir };
}

/** System-prompt steering so the agent USES codegraph instead of grep + sequential Reads. */
export const CODEGRAPH_SYSTEM_PROMPT =
  'Dự án này đã bật CodeGraph (MCP). TRƯỚC khi sửa/đọc code, hãy gọi mcp__codegraph ' +
  '(codegraph_explore để lấy mã nguồn liên quan + sơ đồ phụ thuộc; codegraph_node để xem 1 symbol + caller/callee) ' +
  'trong MỘT lần — KHÔNG grep hay đọc lần lượt nhiều file. Nguồn codegraph trả về là bản on-disk hiện tại, ' +
  'đã đánh số dòng — coi như đã Read, ĐỪNG Read lại các file đó.';
