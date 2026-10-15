/**
 * Mô hình của THANH ĐẦU hội thoại Lark × Agents (một dải ~44px) — hàm THUẦN để kiểm bằng node.
 *
 * Trước đây đầu hội thoại xếp liền: chọn runner, chọn model, một dòng cam dài "Claude CLI đã cũ
 * (… → …) — … Cập nhật: npm i -g …", hai ⓘ, ba nút nguồn chạy, Ghi chú, Chia sẻ, rồi cả một hàng Base.
 * Nay gom về: [tiêu đề + chip Base] … [chip ĐỘNG CƠ] [Tự động] [⋯]. Chip động cơ chỉ hiện "Claude ·
 * Fable" + một CHẤM cảnh báo khi có chuyện; chi tiết (nguồn chạy, runner, model, lệnh cập nhật để
 * sao chép) nằm trong popover của nó.
 */

export interface RunnerLite {
  id: string;
  label: string;
  installed?: boolean;
  ready?: boolean;
  outdated?: boolean;
  version?: string;
  latestVersion?: string;
  installHint?: string;
  models?: { id: string; label: string }[];
}

export type RunSource = 'cli' | 'api' | 'maic';

export interface EngineInput {
  runners: RunnerLite[];
  runnerId: string;
  model?: string;
  runSource: RunSource;
  apiKeyReady: boolean;
  maicAvailable: boolean;
  /** Đã kết nối Lark Bot (App ID) chưa. Đường "API trực tiếp" cần nó để gọi công cụ Lark; thiếu thì lượt
   *  chạy bằng CLI trên máy (vẫn tiêm API key đã lưu). Không truyền = không biết ⇒ không báo. */
  appConnected?: boolean;
}

export type EngineWarnKind = 'notInstalled' | 'needsLogin' | 'outdated' | 'apiNoKey' | 'apiNeedsApp' | 'maicOff';

export interface EngineWarn {
  kind: EngineWarnKind;
  /** Một câu ngắn (tooltip của chip + dòng đầu trong popover). */
  text: string;
  /** Lệnh sao chép được (chỉ khi CLI cũ / chưa cài). */
  command?: string;
  /** 'warn' = vẫn chạy được (CLI cũ); 'error' = lượt sẽ hỏng (chưa cài, thiếu key). */
  level: 'warn' | 'error';
}

export interface EngineModel {
  /** Chữ trên chip: "Claude · Fable" (nguồn khác CLI thì thêm hậu tố ngắn). */
  label: string;
  runnerLabel: string;
  modelLabel: string;
  sourceLabel: string;
  warn: EngineWarn | null;
  /** Hiện chấm cảnh báo trên chip. */
  dot: 'warn' | 'error' | null;
}

export const SOURCE_LABEL: Record<RunSource, string> = { cli: 'CLI trên máy', api: 'API riêng', maic: 'Gói Larkwave' };
const SOURCE_SHORT: Record<RunSource, string> = { cli: '', api: 'API', maic: 'Gói' };
const DEFAULT_UPDATE = 'npm i -g @anthropic-ai/claude-code';

/** "Claude Fable (mới nhất)" → "Fable"; "Claude Opus 4.6" → "Opus 4.6"; "grok-4" → "grok-4". */
export function shortModelLabel(label: string | undefined, runnerLabel = ''): string {
  let s = String(label || '').trim();
  if (!s) return '';
  s = s.replace(/\s*[(（][^)）]*[)）]\s*/g, ' ').trim();
  const brand = runnerLabel.replace(/\s*(CLI|Code)\s*$/i, '').trim();
  if (brand && s.toLowerCase().startsWith(brand.toLowerCase() + ' ')) s = s.slice(brand.length).trim();
  else if (/^claude\s+/i.test(s)) s = s.replace(/^claude\s+/i, '');
  return s;
}

/** "Claude CLI" → "Claude". */
export function shortRunnerLabel(label: string | undefined): string {
  return String(label || '').replace(/\s*(CLI|Code)\s*$/i, '').trim() || String(label || '');
}

export function engineModel(i: EngineInput): EngineModel {
  const r = i.runners.find((x) => x.id === i.runnerId);
  const runnerLabel = r?.label || i.runnerId || 'AI';
  const models = r?.models || [];
  const m = models.find((x) => x.id === i.model) || (i.model ? { id: i.model, label: i.model } : models[0]);
  const modelLabel = shortModelLabel(m?.label, runnerLabel);
  const head = [shortRunnerLabel(runnerLabel), modelLabel].filter(Boolean).join(' · ');
  const label = SOURCE_SHORT[i.runSource] ? `${head} · ${SOURCE_SHORT[i.runSource]}` : head;
  const warn = engineWarn(i, r, runnerLabel);
  return { label, runnerLabel, modelLabel, sourceLabel: SOURCE_LABEL[i.runSource], warn, dot: warn ? warn.level : null };
}

/**
 * Chuyện cần báo trên chip — đúng một cái, theo NGUỒN đang chạy (nguồn API không quan tâm CLI cũ,
 * và ngược lại). Thứ tự: lượt sẽ HỎNG (error) trước, rồi mới tới "vẫn chạy nhưng nên cập nhật".
 */
export function engineWarn(i: EngineInput, r: RunnerLite | undefined, runnerLabel: string): EngineWarn | null {
  if (i.runSource === 'api') {
    if (!i.apiKeyReady) return { kind: 'apiNoKey', level: 'error', text: `Chưa có API key cho ${runnerLabel} — dán key ở cài đặt agent (sidebar trái).` };
    if (i.appConnected === false)
      return {
        kind: 'apiNeedsApp',
        level: 'warn',
        text: `"API trực tiếp" cần kết nối Lark Bot (App ID) để gọi công cụ Lark. Chưa kết nối nên lượt chat chạy bằng ${shortRunnerLabel(runnerLabel)} CLI trên máy — vẫn dùng API key bạn đã lưu.`,
      };
    return null;
  }
  if (i.runSource === 'maic') return i.maicAvailable ? null : { kind: 'maicOff', level: 'error', text: 'Gói Larkwave cần đăng nhập tài khoản Larkwave.' };
  if (!r) return null;
  if (!r.installed) return { kind: 'notInstalled', level: 'error', text: `Chưa cài ${r.label}.`, command: r.installHint || (r.id === 'claude' ? DEFAULT_UPDATE : undefined) };
  if (!r.ready) return { kind: 'needsLogin', level: 'error', text: `${r.label} cần đăng nhập/key.` };
  if (r.outdated && r.latestVersion)
    return {
      kind: 'outdated',
      level: 'warn',
      text: `${r.label} đã cũ (${r.version || '?'} → ${r.latestVersion}) — model mới nhất chỉ chạy khi CLI đủ mới.`,
      command: r.installHint || DEFAULT_UPDATE,
    };
  return null;
}

/** Tooltip của công tắc "Tự động". */
export function autoTip(on: boolean): string {
  return on
    ? 'Tự động: tạo workflow/automation (luôn TẮT), thêm bảng/cột/bản ghi mới chạy ngay không hỏi. Xoá, sửa, ghi đè, gửi tin vẫn hỏi. Không bao giờ tự bật workflow.'
    : 'Hỏi trước khi ghi: mọi thao tác ghi đều hiện hộp xác nhận vẽ sẵn thiết kế.';
}

/** Sự kiện cửa sổ khi API key vừa được thêm / xoá / đổi key đang dùng — màn chat nghe để làm mới chip. */
export const API_KEYS_CHANGED_EVENT = 'larkwave:api-keys-changed';

/**
 * Nguồn "API trực tiếp" đã có key chưa. Lõi ≤0.1.4 KHÔNG trả `apiKeyReady` khi chưa kết nối Lark Bot
 * (App ID) — thiếu trường ⇒ chip cũ báo "chưa có API key" dù key đã lưu (gặp thật 15/10/2026). Claude: hỏi
 * thẳng kho key nhóm (đúng kho lõi tiêm vào lượt chạy). Runner khác: tin lõi; lõi không nói ⇒ không biết ⇒
 * KHÔNG báo lỗi giả (lượt chạy tự báo nếu thật sự thiếu).
 */
export function apiKeyReadyFrom(statusReady: boolean | undefined, runnerId: string, claudeKeys: { keys: { active: boolean }[] } | null | undefined): boolean {
  if (runnerId === 'claude' && claudeKeys) return claudeKeys.keys.some((k) => k.active);
  if (typeof statusReady === 'boolean') return statusReady;
  return true;
}
