import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import type { PreviewTarget } from '@larkwave/core';
import { claudeEnv } from './claudeRunner';
import { detectDevPlan, needsEnvConfig, planDeps } from './detectApp';
import type { DevPlan, PackageManager } from './detectApp';

const IS_WIN = process.platform === 'win32';

/** A running local dev server for an app preview. */
export interface PreviewServer {
  url: string;
  target: PreviewTarget;
  proc: ChildProcess;
  /** 'expo' = a React Native app (preview via Expo Go QR, or web when web-capable). */
  kind?: 'web' | 'expo';
  /** exp://… URL to scan with Expo Go (mobile apps that can't render in an iframe). */
  expoUrl?: string;
}

const running = new Map<string, PreviewServer>();

/**
 * The port the api service of `<appId>` last ran on. Survives a stop, which is the whole point:
 * restarting ONLY the api service used to hand it a brand-new port while the still-running
 * frontends kept the old `VITE_API_URL` (startPreview returns a live server as-is and ignores its
 * extraEnv) — every API call from the UI then 404'd/refused. Re-binding the previous port keeps
 * those frontends correct without restarting them too.
 */
const apiPorts = new Map<string, number>();

/**
 * Spawn a package-manager / CLI command with the right env. On Windows, npm/npx/pnpm/yarn are
 * `.cmd` shims that only run through a shell. `detached` (POSIX only) puts a long-lived dev
 * server in its OWN process group so killProc can later reap the whole tree (the pm wrapper AND
 * the real vite/node child) — without it, SIGTERM hits only the wrapper and the dev server leaks,
 * keeping a port that then serves the WRONG/older app.
 */
function spawnPm(cmd: string, args: string[], cwd: string, detached = false, extraEnv?: Record<string, string>): ChildProcess {
  return spawn(cmd, args, {
    cwd,
    env: { ...claudeEnv(), NODE_ENV: 'development', ...extraEnv },
    shell: IS_WIN,
    detached: detached && !IS_WIN,
  });
}

/** Ask the OS for a guaranteed-free TCP port (listen on 0 → read → close). Used to give each
 *  backend service in a multi-service workspace a distinct, non-conflicting port. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = addr && typeof addr === 'object' ? addr.port : 0;
      srv.close(() => (port ? resolve(port) : reject(new Error('no free port'))));
    });
  });
}

/** Can we still bind `port` on loopback? (Used to re-claim an api service's previous port.) */
function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once('error', () => resolve(false));
    srv.listen(port, '127.0.0.1', () => srv.close(() => resolve(true)));
  });
}

/** The TCP port of a dev-server URL (0 when it isn't a parseable URL). */
function urlPort(url: string): number {
  try {
    return Number(new URL(url).port) || 0;
  } catch {
    return 0;
  }
}

/** Kill a dev-server process AND its descendants. POSIX: negative pid → the whole process group
 *  (the server was spawned detached). Windows: `taskkill /T` walks the child tree. */
function killProc(proc: ChildProcess): void {
  const pid = proc.pid;
  try {
    if (IS_WIN) {
      if (pid) spawn('taskkill', ['/pid', String(pid), '/T', '/F']);
      else proc.kill('SIGTERM');
    } else if (pid) {
      process.kill(-pid, 'SIGTERM'); // negative pid = the process group
    } else {
      proc.kill('SIGTERM');
    }
  } catch {
    try {
      proc.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }
}

/** The package-manager command that ADDS + installs the given packages. */
function addArgs(pm: PackageManager, pkgs: string[]): string[] {
  if (pm === 'npm') return ['install', '--no-audit', '--no-fund', ...pkgs];
  return ['add', ...pkgs]; // pnpm / yarn / bun
}

/** Run `<pm> <args>` to completion; resolves true on exit 0, false otherwise (never throws). */
function runPm(pm: PackageManager, args: string[], cwd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawnPm(pm, args, cwd);
    p.stderr?.on('data', () => {});
    p.on('error', () => resolve(false));
    p.on('close', (code) => resolve(code === 0));
  });
}

/**
 * Install packages the source imports but never declared. Tries one batch first; if that fails
 * (usually one bad/typo name aborts the whole install), retries each individually so the valid
 * ones still land. Returns true if anything was installed. Best-effort — never throws.
 */
async function addDeps(pm: PackageManager, dir: string, pkgs: string[], onLog?: (l: string) => void): Promise<boolean> {
  if (await runPm(pm, addArgs(pm, pkgs), dir)) return true;
  let any = false;
  for (const p of pkgs) {
    if (await runPm(pm, addArgs(pm, [p]), dir)) any = true;
    else onLog?.(`Bỏ qua thư viện không cài được: ${p}`);
  }
  return any;
}

/** Run the project's full install (devDeps included), throwing a clear error on failure. */
function runInstall(plan: DevPlan, dir: string, onLog?: (l: string) => void): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const inst = spawnPm(plan.pm, plan.installArgs, dir);
    let err = '';
    inst.stderr?.on('data', (c: Buffer) => {
      const s = c.toString('utf8');
      err += s;
      onLog?.(s.trim().slice(0, 120));
    });
    inst.on('error', (e: NodeJS.ErrnoException) =>
      reject(
        new Error(
          e.code === 'ENOENT'
            ? `Không tìm thấy "${plan.pm}". Hãy cài ${plan.pm} (hoặc bật corepack) để chạy dự án này.`
            : e.message,
        ),
      ),
    );
    inst.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`Cài thư viện lỗi: ${err.trim().slice(-220) || `exit ${code}`}`)),
    );
  });
}

export interface EnsureDepsResult {
  installedNew: boolean;
  plan: DevPlan;
}

/**
 * Make node_modules satisfy every import BEFORE running the dev server or a production build —
 * the single guard against Vite "Failed to resolve import …". Shared by preview AND deploy so
 * both self-heal identically: reinstall when a declared dep is missing or package.json changed
 * since the last install, then best-effort install undeclared imports. Returns whether anything
 * new was installed (the caller restarts a running server if so).
 */
export async function ensureDeps(dir: string, onLog?: (l: string) => void): Promise<EnsureDepsResult> {
  const plan = detectDevPlan(dir);
  const { reinstall, extra } = planDeps(dir);
  const nodeModules = join(dir, 'node_modules');
  const stamp = join(nodeModules, '.tw-deps-stamp');
  let needInstall = reinstall;
  if (!needInstall && existsSync(nodeModules)) {
    try {
      const pkgMtime = statSync(join(dir, 'package.json')).mtimeMs;
      const stampMtime = existsSync(stamp) ? statSync(stamp).mtimeMs : 0;
      if (pkgMtime > stampMtime) needInstall = true; // package.json changed since the last install
    } catch {
      /* if in doubt, leave node_modules as-is */
    }
  }
  let installedNew = false;
  if (needInstall) {
    onLog?.(`Cài đặt thư viện (${plan.pm} ${plan.installArgs[0]})…`);
    await runInstall(plan, dir, onLog);
    try {
      writeFileSync(stamp, new Date().toISOString());
    } catch {
      /* the install succeeded; the stamp is best-effort */
    }
    installedNew = true;
  }
  // Undeclared imports (`import "x"` with no "x" in package.json) — add them on the fly.
  if (extra.length) {
    onLog?.(`Cài thư viện còn thiếu: ${extra.join(', ')}…`);
    if (await addDeps(plan.pm, dir, extra, onLog)) installedNew = true;
  }
  return { installedNew, plan };
}

// Lines that STATE the real fault. esbuild/Vite/Next print the diagnostic FIRST, then a long
// internal stack — so a plain tail hides the cause (the user only saw the deep esbuild frames).
const ERR_LINE =
  /error|cannot start service|does not match|another platform|not match binary|host version|ENOENT|EADDRINUSE|address already in use|failed to resolve|cannot find (module|package)|module not found|missing script|is not recognized|command not found/i;

/** A short, readable extract of a dev server's boot output: the first fault line (if any) + tail. */
function bootTail(log: string): string {
  const lines = log
    .trim()
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .filter(Boolean);
  if (!lines.length) return '';
  const headErr = lines.find((l) => ERR_LINE.test(l));
  const tail = lines.slice(-6);
  const parts = headErr && !tail.includes(headErr) ? [headErr, '…', ...tail] : tail;
  const t = parts.join('\n').slice(-1000).trim();
  return t ? `\n\n— nhật ký —\n${t}` : '';
}

/** Turn a boot log into an ACTIONABLE Vietnamese hint instead of a generic ".env" guess. */
function diagnose(log: string, dir: string): string {
  if (/does not match|not match binary|host version|another platform|cannot start service|esbuild[^\n]*(ENOENT|install)/i.test(log))
    return 'Lỗi esbuild (bản cài lệch/nhị phân hỏng). Cần CÀI LẠI thư viện: xoá thư mục node_modules của app rồi cài lại.';
  if (/EADDRINUSE|address already in use/i.test(log))
    return 'Cổng đang bị chiếm — đóng tiến trình đang dùng cổng đó rồi chạy lại.';
  if (/cannot find (module|package)|failed to resolve|module not found/i.test(log))
    return 'Thiếu thư viện — cần cài lại dependencies (node_modules).';
  if (/missing script|is not recognized|command not found/i.test(log))
    return 'Thiếu/lỗi script chạy dev trong package.json.';
  if (needsEnvConfig(dir)) return 'Dự án có thể cần tạo file .env (cấu hình) trước khi chạy.';
  return 'Kiểm tra cấu hình dự án hoặc thử cài lại thư viện.';
}

/** Boot output that means esbuild's native binary is broken/mismatched — an incremental install
 *  won't repair it, so we wipe esbuild + reinstall. */
const ESBUILD_BROKEN = /does not match|not match binary|host version|another platform|cannot start service/i;

/** Remove the app's esbuild install (JS wrapper + native binary packages) and reinstall — fixes a
 *  version-mismatched/broken esbuild that a normal install leaves in place. Best-effort. */
async function healEsbuild(dir: string, plan: DevPlan, onLog?: (l: string) => void): Promise<void> {
  const nm = join(dir, 'node_modules');
  for (const p of ['esbuild', '@esbuild', '.bin/esbuild', '.bin/esbuild.cmd']) {
    try {
      rmSync(join(nm, p), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  onLog?.('Cài lại thư viện (sửa esbuild)…');
  await runInstall(plan, dir, onLog);
}

/**
 * Spin up a local dev server for a generated app and return its URL. The desktop
 * app loads this URL in a BrowserView (desktop target) or a phone-sized frame
 * (mobile target) — instant preview, no Cloudflare deploy needed.
 */
export async function startPreview(
  appId: string,
  dir: string,
  target: PreviewTarget,
  onLog?: (line: string) => void,
  /** Multi-service workspace support: run this service under a composite key, with extra env
   *  (PORT / cross-service URLs) and overridden dev args. Omitted = the normal single app. */
  opts?: { key?: string; extraEnv?: Record<string, string>; devArgs?: string[] },
): Promise<PreviewServer> {
  const key = opts?.key ?? appId;
  // An incomplete generation (e.g. a build in "Hỏi/Plan" mode that wrote no files)
  // has no package.json → npm install would fail with a cryptic ENOENT. Surface a
  // clear, actionable message instead.
  if (!existsSync(join(dir, 'package.json'))) {
    throw new Error(
      'App chưa được tạo đầy đủ (thiếu package.json). Lần dựng trước có thể đã lỗi — hãy chạy lại ở chế độ "Tự động sửa" hoặc "Tự động" để AI tạo đủ file (package.json, index.html, src/…).',
    );
  }

  // A project that ships a `.env.example` but no `.env` usually won't boot until it's
  // configured — flag it so the failure (if any) reads as "needs config", not a bug.
  if (needsEnvConfig(dir)) {
    onLog?.('Lưu ý: dự án có .env.example — có thể cần tạo .env trước khi chạy.');
  }

  // Ensure deps BEFORE reusing/starting a server — the guard against "Failed to resolve import …".
  const { installedNew, plan } = await ensureDeps(dir, onLog);

  // Reuse a server already running for this app — UNLESS we just installed packages, in which
  // case it must restart so Vite resolves imports against the refreshed node_modules.
  const existing = running.get(key);
  if (existing) {
    if (!installedNew) return existing;
    killProc(existing.proc);
    running.delete(key);
  }

  if (!plan.devScript) {
    throw new Error('Dự án không có script "dev"/"start" trong package.json — không biết cách chạy local.');
  }
  const devArgs = opts?.devArgs ?? plan.devArgs;

  // The dev server picks a port; we read the first localhost/127.0.0.1/0.0.0.0 URL it
  // prints. Next/Remix/CRA print their own; Vite prints the Local URL. Spawned detached so the
  // whole process group is killable (otherwise the real vite/node child leaks past SIGTERM).
  // One boot attempt. Keeps a rolling tail of output so a crash surfaces the REAL error (the
  // Vite/Next stack), not just "exited". Attaches {bootLog, proc} to the rejection so the caller
  // can decide to self-heal + retry.
  const attemptBoot = (): Promise<{ url: string; proc: ChildProcess; bootLog: string }> => {
    onLog?.(`Khởi động preview (${plan.pm} ${devArgs.join(' ')})…`);
    const proc = spawnPm(plan.pm, devArgs, dir, true, opts?.extraEnv);
    let bootLog = '';
    const capture = (c: Buffer) => {
      bootLog = (bootLog + c.toString('utf8')).slice(-4000);
    };
    proc.stdout?.on('data', capture);
    proc.stderr?.on('data', capture);
    const fail = (msg: string) => Object.assign(new Error(msg), { bootLog, proc });
    return new Promise((resolve, reject) => {
      // Cloned projects (Next, install-on-first-run) can take longer than Vite to boot.
      const timer = setTimeout(
        () => reject(fail(`Preview không khởi động kịp (timeout). ${diagnose(bootLog, dir)}${bootTail(bootLog)}`)),
        90000,
      );
      const scan = (c: Buffer) => {
        const m = c.toString('utf8').match(/https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)/);
        if (m) {
          clearTimeout(timer);
          resolve({ url: `http://127.0.0.1:${m[2]}`, proc, bootLog }); // normalise 0.0.0.0 → loopback
        }
      };
      proc.stdout?.on('data', scan);
      proc.stderr?.on('data', scan); // some frameworks print the URL on stderr
      proc.on('error', (e) => {
        clearTimeout(timer);
        reject(Object.assign(e, { bootLog, proc }));
      });
      // Dev command died before printing a URL (bad config, broken deps) → fail fast with its log.
      proc.on('close', (code) => {
        clearTimeout(timer);
        reject(fail(`Dev server đã thoát (exit ${code}) trước khi sẵn sàng. ${diagnose(bootLog, dir)}${bootTail(bootLog)}`));
      });
    });
  };

  // Expo (React Native): can't render Metro in an iframe. Boot GRACEFULLY (never reject) — capture a
  // web URL if the app is web-capable (→ iframe), and/or the exp:// URL (→ Expo Go QR). The UI shows
  // whichever it has (iframe when web, otherwise a QR + guide). Keep the server running for the phone.
  const attemptExpoBoot = (): Promise<{ url: string; expoUrl?: string; proc: ChildProcess; bootLog: string; died: boolean }> => {
    onLog?.(`Khởi động Expo (${plan.pm} ${devArgs.join(' ')})…`);
    const env = { CI: '1', EXPO_NO_TELEMETRY: '1', BROWSER: 'none', ...(opts?.extraEnv || {}) };
    const proc = spawnPm(plan.pm, devArgs, dir, true, env);
    let bootLog = '';
    let webUrl = '';
    let expoUrl = '';
    const capture = (c: Buffer) => {
      bootLog = (bootLog + c.toString('utf8')).slice(-6000);
    };
    proc.stdout?.on('data', capture);
    proc.stderr?.on('data', capture);
    return new Promise((resolve) => {
      let settled = false;
      // `died` = we settled because the child is GONE, not because it printed a URL. The caller
      // must not register a dead process (see below), so carry the reason out.
      const finish = (died: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ url: webUrl, expoUrl: expoUrl || undefined, proc, bootLog, died });
      };
      const scan = (c: Buffer) => {
        const t = c.toString('utf8');
        if (!webUrl) {
          const m = t.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)/);
          if (m) webUrl = `http://127.0.0.1:${m[1]}`;
        }
        if (!expoUrl) {
          const e = t.match(/exp:\/\/[\w.-]+:\d+/);
          if (e) expoUrl = e[0];
        }
        // Web-capable → wait for the web URL (renders in-frame). QR mode → resolve once exp:// is out.
        if (plan.expoWeb ? webUrl : expoUrl || webUrl) finish(false);
      };
      proc.stdout?.on('data', scan);
      proc.stderr?.on('data', scan);
      proc.on('error', () => finish(true));
      proc.on('close', () => finish(true)); // crashed before printing → report the death, don't cache it
      const timer = setTimeout(() => finish(false), 150000);
    });
  };

  let url: string;
  let proc: ChildProcess;
  let kind: 'web' | 'expo' = 'web';
  let expoUrl: string | undefined;
  if (plan.framework === 'expo') {
    kind = 'expo';
    const b = await attemptExpoBoot();
    // The expo path resolves instead of rejecting, so a crash arrives here as an empty URL with a
    // dead child. It must NOT reach `running.set` below: the evict listeners are attached after the
    // fact, so 'close' has already fired and would never fire again — the corpse would be cached for
    // the rest of the session and startPreview's reuse branch would hand it back on every retry,
    // leaving the user stuck with no way to boot the app. Fail loudly with the boot log instead.
    if (b.died) {
      killProc(b.proc);
      throw new Error(
        `Expo đã thoát (exit ${b.proc.exitCode ?? '?'}) trước khi sẵn sàng. ${diagnose(b.bootLog, dir)}${bootTail(b.bootLog)}`,
      );
    }
    url = b.url;
    proc = b.proc;
    expoUrl = b.expoUrl;
  } else {
    let booted: { url: string; proc: ChildProcess; bootLog: string };
    try {
      booted = await attemptBoot();
    } catch (e) {
      const err = e as Error & { bootLog?: string; proc?: ChildProcess };
      if (err.proc) killProc(err.proc);
      // Self-heal ONCE for a broken esbuild binary (won't fix on incremental install).
      if (ESBUILD_BROKEN.test(err.bootLog || '')) {
        onLog?.('Phát hiện esbuild lỗi — đang cài lại thư viện rồi thử lại…');
        await healEsbuild(dir, plan, onLog);
        try {
          booted = await attemptBoot();
        } catch (e2) {
          const err2 = e2 as Error & { proc?: ChildProcess };
          if (err2.proc) killProc(err2.proc);
          throw err2;
        }
      } else {
        throw err;
      }
    }
    url = booted.url;
    proc = booted.proc;
  }

  const server: PreviewServer = { url, target, proc, kind, expoUrl };
  running.set(key, server);
  // Evict a dead server so a later startPreview never hands back a handle to a closed port (the
  // app crashed, was killed, or exited) → the caller restarts it fresh instead of showing a blank.
  const evict = () => {
    if (running.get(key)?.proc === proc) running.delete(key);
  };
  proc.once('exit', evict);
  proc.once('close', evict);
  return server;
}

export interface WorkspaceService {
  name: string;
  dir: string;
  kind?: 'vite' | 'node';
}
export interface WorkspacePreview {
  url: string;
  target: PreviewTarget;
  services: { name: string; url: string }[];
  kind?: 'web' | 'expo';
  expoUrl?: string;
}

/** Read `.toolswave/services.json` (Phase-A multi-service manifest). [] if absent/invalid, which
 *  keeps every existing single-folder app on the exact current single-server path. */
export function readServices(appDir: string): WorkspaceService[] {
  try {
    const raw = readFileSync(join(appDir, '.toolswave', 'services.json'), 'utf8');
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((s) => s && typeof s.name === 'string' && typeof s.dir === 'string')
      .map((s) => ({ name: String(s.name), dir: String(s.dir), kind: (s.kind === 'node' ? 'node' : 'vite') as 'vite' | 'node' }))
      .slice(0, 6);
  } catch {
    return [];
  }
}

/**
 * The port to run this workspace's api service on. NEVER a fresh port when one is already in
 * play, because the frontends are told the api URL exactly once — at the moment they boot:
 *  1. api still running → its ACTUAL port (a restart of only the frontend must not move the api);
 *  2. api just stopped (a restart) → the port it had, if the OS still lets us bind it, so the
 *     untouched frontends' `VITE_API_URL` keeps pointing at the right place;
 *  3. first run (or the port got taken meanwhile) → a fresh free port.
 */
async function stableApiPort(appId: string, serviceName: string): Promise<number> {
  const live = running.get(`${appId}::${serviceName}`);
  const livePort = live ? urlPort(live.url) : 0;
  const previous = apiPorts.get(appId) ?? 0;
  let port = livePort;
  if (!port && previous && (await portFree(previous))) port = previous;
  if (!port) port = await freePort();
  apiPorts.set(appId, port);
  return port;
}

/**
 * Phase-A: start EVERY service of a multi-service workspace, each on its OWN port. Backend
 * ('node') services get a pre-allocated free PORT (never conflicts); Vite ('vite') services
 * self-allocate a free port via their own `--port 0`. Frontends receive `VITE_API_URL` pointing
 * at the api service. Falls back to the normal single-app preview when there is no manifest, so
 * existing apps are 100% unaffected.
 */
export async function startWorkspacePreview(
  appId: string,
  appDir: string,
  target: PreviewTarget,
  onLog?: (line: string) => void,
): Promise<WorkspacePreview> {
  const services = readServices(appDir);
  // No manifest → an old/flat app: run it at the app root (unchanged behaviour). A manifest
  // with even ONE service → a named workspace: run that service in its sub-folder.
  if (services.length < 1) {
    const s = await startPreview(appId, appDir, target, onLog);
    return { url: s.url, target, services: [], kind: s.kind, expoUrl: s.expoUrl };
  }

  const apiSvc = services.find((s) => s.kind === 'node');
  const apiPort = apiSvc ? await stableApiPort(appId, apiSvc.name) : 0;
  const apiUrl = apiPort ? `http://127.0.0.1:${apiPort}` : '';
  const started: { name: string; url: string }[] = [];

  // Backend first (so the frontend has an API to call), then the rest.
  const ordered = [...services].sort((a, b) => Number(b.kind === 'node') - Number(a.kind === 'node'));
  for (const svc of ordered) {
    const dir = join(appDir, svc.dir);
    if (!existsSync(join(dir, 'package.json'))) {
      onLog?.(`Bỏ qua dịch vụ "${svc.name}" (thiếu package.json ở ${svc.dir}/).`);
      continue;
    }
    const extraEnv: Record<string, string> = {};
    if (svc.kind === 'node' && apiPort) extraEnv.PORT = String(apiPort);
    if (svc.kind !== 'node' && apiUrl) extraEnv.VITE_API_URL = apiUrl;
    onLog?.(`Khởi động dịch vụ "${svc.name}" (${svc.dir}/)…`);
    try {
      const s = await startPreview(appId, dir, target, onLog, { key: `${appId}::${svc.name}`, extraEnv });
      started.push({ name: svc.name, url: s.url });
    } catch (e) {
      onLog?.(`Dịch vụ "${svc.name}" không khởi động được: ${(e as Error).message.slice(0, 160)}`);
    }
  }
  if (!started.length) throw new Error('Không khởi động được dịch vụ nào của workspace.');
  const primary = started.find((s) => s.name === 'home') ?? started[0];
  return { url: primary.url, target, services: started };
}

export async function stopPreview(appId: string, service?: string): Promise<void> {
  // With `service`: stop only that one workspace server. Without: reap the single-app server AND
  // every `${appId}::<service>` server of a workspace.
  const exact = service ? `${appId}::${service}` : null;
  for (const [k, s] of running) {
    const match = exact ? k === exact : k === appId || k.startsWith(`${appId}::`);
    if (match) {
      killProc(s.proc);
      running.delete(k);
    }
  }
}

/**
 * Stop an app's dev server(s) and start them again ("Khởi động lại" in the ports panel). With
 * `service`, only that workspace service is killed — startWorkspacePreview then hands the other,
 * still-running services straight back and boots just this one, on the SAME api port as before
 * (see stableApiPort), so nothing that is already up ends up pointing at a dead URL.
 * Rejects with the boot error when the server won't come back — the caller must surface that.
 */
export async function restartPreview(
  appId: string,
  appDir: string,
  service?: string,
  onLog?: (line: string) => void,
): Promise<void> {
  // Reuse the target the app was previewing on; nothing running (already stopped) → desktop.
  let target: PreviewTarget = 'desktop';
  for (const [k, s] of running) {
    if (k === appId || k.startsWith(`${appId}::`)) {
      target = s.target;
      break;
    }
  }
  await stopPreview(appId, service);
  // The killed process needs a moment to release its port before the new one binds it.
  await new Promise((r) => setTimeout(r, 400));
  await startWorkspacePreview(appId, appDir, target, onLog);
}

/** One running local dev server, flattened for the global "ports" manager. */
export interface RunningPreviewInfo {
  appId: string;
  service?: string;
  url: string;
  port: number;
  pid?: number;
  target: PreviewTarget;
}

/** Every dev server running right now across ALL apps (home/cms/api of every previewed workspace).
 *  Powers the global ports panel — one place to see + stop everything. */
export function listRunningPreviews(): RunningPreviewInfo[] {
  const out: RunningPreviewInfo[] = [];
  for (const [key, s] of running) {
    const i = key.indexOf('::');
    const appId = i >= 0 ? key.slice(0, i) : key;
    const service = i >= 0 ? key.slice(i + 2) : undefined;
    out.push({ appId, service, url: s.url, port: urlPort(s.url), pid: s.proc.pid ?? undefined, target: s.target });
  }
  return out;
}

/** The base URL of an app's running "api" service (for the API tester proxy), or undefined. */
export function apiServiceUrl(appId: string): string | undefined {
  const direct = running.get(`${appId}::api`);
  if (direct) return direct.url;
  for (const [k, s] of running) if (k.startsWith(`${appId}::`) && /api/i.test(k)) return s.url;
  return undefined;
}

/** Kill every running dev server — call on app quit so no node/vite processes are orphaned. */
export function stopAllPreviews(): void {
  for (const s of running.values()) killProc(s.proc);
  running.clear();
}
