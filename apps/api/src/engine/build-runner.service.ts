import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import archiver from 'archiver';
import { GeneratedFile } from '@larkwave/shared';
import { AppConfigService } from '../config/app-config.service';

export interface RunResult {
  code: number;
  out: string;
  /** True when the process was SIGKILL'd by the timeout (vs a real non-zero exit). */
  timedOut?: boolean;
}
export interface BuildResult extends RunResult {
  distDir: string | null;
}

const DIST_CANDIDATES = ['dist', 'build', 'out', '.output/public'];

/** Materialises generated files to disk and runs npm install + build. */
@Injectable()
export class BuildRunnerService {
  private readonly logger = new Logger(BuildRunnerService.name);

  constructor(private readonly config: AppConfigService) {}

  private get workspaceRoot(): string {
    return path.resolve(this.config.env.WORKSPACE_DIR);
  }
  private get artifactsRoot(): string {
    return path.resolve(this.config.env.ARTIFACTS_DIR);
  }

  private safeJoin(dir: string, rel: string): string {
    const target = path.resolve(dir, rel.replace(/^\/+/, ''));
    if (target !== dir && !target.startsWith(dir + path.sep)) {
      throw new Error(`Đường dẫn không hợp lệ: ${rel}`);
    }
    return target;
  }

  async materialize(buildId: string, files: GeneratedFile[]): Promise<string> {
    const dir = path.join(this.workspaceRoot, buildId);
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });
    for (const f of files) {
      const target = this.safeJoin(dir, f.path);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(
        target,
        f.encoding === 'base64' ? Buffer.from(f.content, 'base64') : f.content,
      );
    }
    return dir;
  }

  async writeFiles(dir: string, files: GeneratedFile[]): Promise<void> {
    for (const f of files) {
      const target = this.safeJoin(dir, f.path);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(
        target,
        f.encoding === 'base64' ? Buffer.from(f.content, 'base64') : f.content,
      );
    }
  }

  async install(dir: string, onLog?: (l: string) => void, signal?: AbortSignal): Promise<RunResult> {
    // --include=dev so build tooling (vite, etc.) installs even though the API
    // process runs with NODE_ENV=production (which npm would otherwise honour).
    return this.run(
      'npm',
      ['install', '--include=dev', '--no-audit', '--no-fund', '--no-progress', '--loglevel=warn'],
      dir,
      onLog,
      360_000,
      signal,
    );
  }

  async build(dir: string, onLog?: (l: string) => void, signal?: AbortSignal): Promise<BuildResult> {
    const res = await this.run('npm', ['run', 'build'], dir, onLog, 360_000, signal);
    const distDir = res.code === 0 ? await this.findDist(dir) : null;
    return { ...res, distDir };
  }

  /**
   * Run an arbitrary install/build command (from a persisted BuildConfig) in `dir`.
   * Splits the command string on whitespace (our presets + repo configs use simple
   * `cmd arg arg` forms, no shell quoting). Same 360s timeout as install/build.
   */
  async runCommand(
    dir: string,
    command: string,
    onLog?: (l: string) => void,
    signal?: AbortSignal,
  ): Promise<RunResult> {
    const parts = command.trim().split(/\s+/);
    const [cmd, ...args] = parts;
    return this.run(cmd, args, dir, onLog, 360_000, signal);
  }

  /** Public wrapper: the first dist/build/out/.output/public dir under `dir` with an index.html. */
  async findDistPublic(dir: string): Promise<string | null> {
    return this.findDist(dir);
  }

  /** Public wrapper: does this directory contain a root index.html? */
  async hasIndexHtmlPublic(dir: string): Promise<boolean> {
    return this.hasIndexHtml(dir);
  }

  private async findDist(dir: string): Promise<string | null> {
    for (const candidate of DIST_CANDIDATES) {
      const full = path.join(dir, candidate);
      try {
        const stat = await fs.stat(full);
        // MUST contain a root index.html — a dir that merely exists (e.g. a CRA-style
        // "build" folder that isn't the real static output, or an SSR framework's
        // intermediate dir) would deploy "successfully" yet 404 at the root. Skipping
        // it lets the build fail loudly (codegen → fix loop; import → clean error)
        // instead of shipping a broken site.
        if (stat.isDirectory() && (await this.hasIndexHtml(full))) return full;
      } catch {
        /* not present */
      }
    }
    return null;
  }

  private async hasIndexHtml(dir: string): Promise<boolean> {
    try {
      await fs.stat(path.join(dir, 'index.html'));
      return true;
    } catch {
      return false;
    }
  }

  /** Zips a project directory into the artifacts dir; returns the zip path. */
  async zipProject(id: string, dir: string): Promise<string> {
    await fs.mkdir(this.artifactsRoot, { recursive: true });
    const zipPath = path.join(this.artifactsRoot, `${id}.zip`);
    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      output.on('close', () => resolve());
      archive.on('error', reject);
      archive.pipe(output);
      archive.glob('**/*', { cwd: dir, ignore: ['node_modules/**', 'dist/**', '.git/**'] });
      void archive.finalize();
    });
    return zipPath;
  }

  async cleanup(dir: string): Promise<void> {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }

  private run(
    cmd: string,
    args: string[],
    cwd: string,
    onLog: ((l: string) => void) | undefined,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<RunResult> {
    return new Promise((resolve) => {
      // NODE_ENV=development ensures npm installs devDependencies for the
      // generated project; `vite build` still emits a production bundle.
      const child = spawn(cmd, args, {
        cwd,
        env: { ...process.env, NODE_ENV: 'development', CI: '1' },
      });
      let out = '';
      let timedOut = false;
      const onAbort = () => {
        out += '\n[canceled] đã dừng tiến trình';
        child.kill('SIGKILL');
      };
      if (signal) {
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort, { once: true });
      }
      const timer = setTimeout(() => {
        timedOut = true;
        out += `\n[timeout] killed after ${timeoutMs}ms`;
        child.kill('SIGKILL');
      }, timeoutMs);
      const handle = (buf: Buffer) => {
        const s = buf.toString();
        out += s;
        if (onLog)
          s.split('\n')
            .map((l) => l.trimEnd())
            .filter(Boolean)
            .forEach(onLog);
      };
      child.stdout.on('data', handle);
      child.stderr.on('data', handle);
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code: code ?? 1, out, timedOut });
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        out += String(err);
        resolve({ code: 1, out });
      });
    });
  }
}
