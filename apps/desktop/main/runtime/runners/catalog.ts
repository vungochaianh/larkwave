import type { RunnerCatalogEntry, RunnerId } from '@larkwave/shared';

/**
 * Local mirror of @larkwave/shared's RUNNER_CATALOG (a runtime VALUE). The
 * desktop main process is bundled by webpack, which only resolves the workspace
 * packages symlinked into node_modules (@larkwave/core, @larkwave/ui) — NOT
 * @larkwave/shared. So we re-state the catalog data here (kept in sync with
 * shared) and import only its TYPES (`RunnerId`, `RunnerCatalogEntry`) which erase
 * at compile time. Keep this identical to shared's RUNNER_CATALOG.
 */
export const RUNNER_CATALOG: readonly RunnerCatalogEntry[] = [
  {
    id: 'claude',
    label: 'Claude CLI',
    bin: 'claude',
    installHint: 'npm i -g @anthropic-ai/claude-code',
    // BÍ DANH, không phải id đầy đủ. `opus` luôn trỏ tới bản Opus mới nhất mà CLI ĐANG CÀI biết —
    // nên không phải sửa danh sách này mỗi lần Anthropic ra model mới, nhưng đổi lại: máy cài CLI
    // cũ sẽ lặng lẽ chạy model đời trước. Đó là lý do có cờ `outdated` ở RunnerStatusInfo.
    models: [
      { id: 'fable', label: 'Claude Fable (mới nhất)' },
      { id: 'opus', label: 'Claude Opus (mạnh)' },
      { id: 'sonnet', label: 'Claude Sonnet (cân bằng)' },
      { id: 'haiku', label: 'Claude Haiku (nhanh, rẻ)' },
    ],
  },
  {
    id: 'grok',
    label: 'Grok CLI',
    bin: 'grok',
    installHint: 'npm i -g @vibe-kit/grok-cli',
    models: [
      { id: 'grok-composer-2.5-fast', label: 'Grok Composer 2.5 Fast' },
      { id: 'grok-build', label: 'Grok Build' },
    ],
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    bin: 'gemini',
    installHint: 'npm i -g @google/gemini-cli',
    // Tên model của Gemini CLI 0.34 (core/config/models.js). `auto` = CLI tự chọn giữa 3.1 Pro và Flash
    // theo độ khó (đo: `-m auto` → `auto-gemini-3`). Đường "API trực tiếp" đổi id không phải `gemini-…`
    // về model mặc định của API (resolveApiModel). Model mới hơn bản CLI đã cài ⇒ `brew upgrade gemini-cli`.
    models: [
      { id: 'auto', label: 'Gemini · Tự chọn (3.x)' },
      { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (preview)' },
      { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro (preview)' },
      { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (preview)' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    ],
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    bin: 'codex',
    installHint: 'npm i -g @openai/codex',
    models: [
      { id: 'gpt-5-codex', label: 'GPT-5 Codex' },
      { id: 'gpt-5', label: 'GPT-5' },
    ],
  },
];

export const RUNNER_IDS: readonly RunnerId[] = ['claude', 'grok', 'gemini', 'codex'];

export function catalogEntry(id: RunnerId): RunnerCatalogEntry {
  return RUNNER_CATALOG.find((r) => r.id === id) ?? RUNNER_CATALOG[0];
}
