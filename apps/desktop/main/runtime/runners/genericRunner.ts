import type { BuildEvent, RunnerStatusInfo } from '@larkwave/core';
import type { RunnerId } from '@larkwave/shared';
import { catalogEntry } from './catalog';
import { binAvailable, binProbe, genericRun, probeProviderAuth, resolveBinPath, runnerEnv } from './runnerCore';
import { removeProviderKey, setProviderKey } from './runnerTokenStore';
import type { CliRunner, RunnerRunOptions } from './types';

/**
 * Prefix a hard SCOPE BOUNDARY ahead of the system + user prompt for non-Claude
 * CLIs. codex/gemini/grok run headless with auto-approve (--dangerously-bypass /
 * --yolo / auto-apply) and read NO write-jail flag, so — unlike the Claude runner,
 * which the desktop confines structurally — nothing stops them writing outside the
 * app dir. This prompt backstop is the cheap, contract-safe guard; a real sandbox
 * needs per-CLI flags verified against the installed version (follow-up).
 */
export function scopedPrompt(opts: RunnerRunOptions): string {
  if (opts.fullPrompt) return opts.fullPrompt;
  const backstop =
    `GIỚI HẠN PHẠM VI: chỉ tạo/sửa file BÊN TRONG "${opts.cwd}". ` +
    `TUYỆT ĐỐI KHÔNG ghi/xoá file ngoài thư mục này, KHÔNG chạy lệnh hệ thống ngoài việc tạo/sửa file của app.`;
  return [backstop, opts.appendSystemPrompt, opts.prompt].filter(Boolean).join('\n\n');
}

/**
 * Build a CliRunner for a non-Claude CLI (grok/gemini/codex). They aren't
 * stream-json, so `parseLine` just emits plain log lines (the shared
 * <BuildProgress/> renders those). `buildArgs` is the per-CLI headless,
 * auto-accept invocation.
 */
export function makeGenericRunner(
  id: RunnerId,
  buildArgs: (opts: RunnerRunOptions) => string[],
): CliRunner {
  const CAT = catalogEntry(id);
  const env = () => runnerEnv(id);

  return {
    id,
    label: CAT.label,
    bin: CAT.bin,
    installHint: CAT.installHint,
    models: CAT.models.map((m) => ({ id: m.id, label: m.label })),

    available: () => binAvailable(CAT.bin, env()),

    async status(): Promise<RunnerStatusInfo> {
      const e = env();
      // One `--version` spawn for BOTH installed + version (was two identical spawns).
      const { installed, version } = await binProbe(CAT.bin, e);
      const [binPath, auth] = await Promise.all([
        installed ? resolveBinPath(CAT.bin, e) : Promise.resolve(undefined),
        probeProviderAuth(id, CAT.bin, e),
      ]);
      return {
        id,
        label: CAT.label,
        bin: CAT.bin,
        binPath,
        installed,
        loggedIn: auth.loggedIn,
        ready: installed && auth.loggedIn,
        authMethod: auth.authMethod,
        version,
        models: CAT.models.map((m) => ({ id: m.id, label: m.label })),
        installHint: CAT.installHint,
      };
    },

    async setToken(token: string): Promise<void> {
      setProviderKey(id, token);
    },
    async clearToken(): Promise<void> {
      removeProviderKey(id);
    },

    run(opts: RunnerRunOptions): AsyncGenerator<BuildEvent> {
      return genericRun({
        bin: CAT.bin,
        args: buildArgs(opts),
        cwd: opts.cwd,
        env: env(),
        signal: opts.signal,
        stageName: `Khởi động ${CAT.label}`,
        parseLine: (line) => [{ type: 'log', level: 'info', message: line.slice(0, 400) }],
      });
    },
  };
}
