import type { BuildEvent, RunnerStatusInfo } from '@larkwave/core';
import {
  claudeAvailable,
  claudeStatus,
  clearClaudeToken,
  runClaude,
  setClaudeToken,
} from '../claudeRunner';
import { catalogEntry } from './catalog';
import { resolveBinPath, runnerEnv } from './runnerCore';
import type { CliRunner, RunnerRunOptions } from './types';

const CAT = catalogEntry('claude');

/**
 * The Claude runner — a thin CliRunner wrapper that DELEGATES to the existing
 * `runClaude` so Claude's behaviour (stream-json, CodeGraph, permission modes)
 * stays byte-identical. Only the status mapping is new (ClaudeStatus → RunnerStatusInfo).
 */
/**
 * Bản `@anthropic-ai/claude-code` mới nhất trên npm — tra MỘT LẦN rồi nhớ trong 6 giờ.
 *
 * Vì sao cần: model được chọn bằng BÍ DANH (`opus`, `fable`), và bí danh chỉ trỏ tới model mới
 * khi CLI đủ mới. Máy cài CLI cũ vẫn chạy ngon lành — chỉ là chạy model đời trước, không lỗi,
 * không cảnh báo, và không ai hiểu vì sao kết quả kém hơn máy bên cạnh.
 *
 * Nuốt mọi lỗi: không có mạng thì bỏ qua, KHÔNG được làm hỏng việc liệt kê runner. Một lời khuyên
 * cập nhật không đáng để đánh đổi lấy màn hình trắng.
 */
let npmLatest: { at: number; version: string } | null = null;
async function latestClaudeCliVersion(): Promise<string | undefined> {
  if (npmLatest && Date.now() - npmLatest.at < 6 * 3600_000) return npmLatest.version;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 4000);
    const r = await fetch('https://registry.npmjs.org/@anthropic-ai/claude-code/latest', { signal: ac.signal });
    clearTimeout(t);
    if (!r.ok) return npmLatest?.version;
    const j = (await r.json()) as { version?: string };
    if (typeof j?.version === 'string' && j.version) {
      npmLatest = { at: Date.now(), version: j.version };
      return j.version;
    }
  } catch {
    /* mất mạng / npm chậm — dùng lại giá trị cũ nếu có */
  }
  return npmLatest?.version;
}

/** So hai chuỗi phiên bản kiểu `2.1.220`. Trả về true khi `a` CŨ HƠN `b`. */
export function olderVersion(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const pa = a.split('.').map((x) => Number(x.replace(/\D.*$/, '')) || 0);
  const pb = b.split('.').map((x) => Number(x.replace(/\D.*$/, '')) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0;
  }
  return false;
}

export const claudeRunnerEntry: CliRunner = {
  id: 'claude',
  label: CAT.label,
  bin: CAT.bin,
  installHint: CAT.installHint,
  models: CAT.models.map((m) => ({ id: m.id, label: m.label })),

  available: () => claudeAvailable(),

  async status(): Promise<RunnerStatusInfo> {
    const s = await claudeStatus();
    const binPath = s.installed ? await resolveBinPath(CAT.bin, runnerEnv('claude')) : undefined;
    // Chỉ tra npm khi CLI thật sự có trên máy — máy chưa cài thì lời khuyên "cập nhật" vô nghĩa.
    const latest = s.installed ? await latestClaudeCliVersion() : undefined;
    return {
      id: 'claude',
      label: CAT.label,
      bin: CAT.bin,
      binPath,
      installed: s.installed,
      loggedIn: s.loggedIn,
      ready: s.installed && s.loggedIn,
      version: s.version,
      ...(latest ? { latestVersion: latest, outdated: olderVersion(s.version, latest) } : {}),
      authMethod: s.authMethod,
      models: CAT.models.map((m) => ({ id: m.id, label: m.label })),
      installHint: CAT.installHint,
    };
  },

  async setToken(token: string): Promise<void> {
    await setClaudeToken(token);
  },
  async clearToken(): Promise<void> {
    await clearClaudeToken();
  },

  run(opts: RunnerRunOptions): AsyncGenerator<BuildEvent> {
    // Delegate verbatim — keep Claude's path (incl. CodeGraph) unchanged.
    return runClaude({
      prompt: opts.prompt,
      mode: opts.mode,
      cwd: opts.cwd,
      appendSystemPrompt: opts.appendSystemPrompt,
      model: opts.model,
      signal: opts.signal,
    });
  },
};
