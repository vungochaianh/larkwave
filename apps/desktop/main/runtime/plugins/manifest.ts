/**
 * Plugin manifest = the entire plugin. A plugin contributes Lark tools as DATA:
 * each tool names a Lark Open API endpoint (method + path) that Claude may call.
 * There is NO executable code — the host runs the declared call through the same
 * LarkClient, scoped to the plugin's granted permissions. This is why installing/
 * enabling a plugin can never run arbitrary code (no eval, no bundled JS).
 */

export interface PluginToolDecl {
  /** Tool name (a-z0-9_); surfaced to Claude as `plugin_<id>__<name>`. */
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Destructive write → user confirmation required. */
  gated?: boolean;
  /** The Lark endpoint this tool calls. `path` may contain `{param}` placeholders. */
  lark: { method: string; path: string };
}

/**
 * A no-code UI panel: a form the host renders from the referenced tool's input
 * schema and runs directly against Lark. Pure data — no code, no custom JS.
 */
export interface PanelDecl {
  id: string;
  title: string;
  /** Name of a tool (within this manifest) the form submits to. */
  tool: string;
  description?: string;
  submitLabel?: string;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  /** Permission scopes; each tool's path must fall under a granted scope. */
  permissions: string[];
  tools: PluginToolDecl[];
  /** Optional declarative form panels surfaced in the UI. */
  panels?: PanelDecl[];
  /** Optional provenance: publisher label + base64 Ed25519 signature. */
  publisher?: string;
  signature?: string;
}

/** Permission scope → the only Open API path prefix it unlocks. */
export const PERMISSION_PREFIX: Record<string, string> = {
  'lark:bitable': '/open-apis/bitable/',
  'lark:im': '/open-apis/im/',
  'lark:docx': '/open-apis/docx/',
  'lark:contact': '/open-apis/contact/',
  'lark:calendar': '/open-apis/calendar/',
  'lark:approval': '/open-apis/approval/',
  'lark:sheets': '/open-apis/sheets/',
  'lark:drive': '/open-apis/drive/',
  'lark:wiki': '/open-apis/wiki/',
};

const KNOWN_PERMISSIONS = new Set(Object.keys(PERMISSION_PREFIX));
const METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']);

/** True if `path` is unlocked by at least one of the granted permissions. */
export function pathAllowed(path: string, permissions: string[]): boolean {
  if (!path.startsWith('/open-apis/')) return false; // no absolute URLs / SSRF
  return permissions.some((p) => {
    const prefix = PERMISSION_PREFIX[p];
    return prefix && path.startsWith(prefix);
  });
}

export interface ValidateResult {
  ok: boolean;
  manifest?: PluginManifest;
  error?: string;
}

/** Validate an untrusted parsed manifest. Rejects anything outside the contract. */
export function validateManifest(obj: unknown): ValidateResult {
  const m = obj as Partial<PluginManifest>;
  if (!m || typeof m !== 'object') return { ok: false, error: 'Manifest không hợp lệ.' };
  if (typeof m.id !== 'string' || !/^[a-z0-9][a-z0-9-]{1,38}$/.test(m.id))
    return { ok: false, error: 'id phải dạng a-z0-9- (2–39 ký tự).' };
  if (typeof m.name !== 'string' || !m.name.trim()) return { ok: false, error: 'Thiếu name.' };
  if (typeof m.version !== 'string' || !m.version.trim()) return { ok: false, error: 'Thiếu version.' };
  if (!Array.isArray(m.permissions) || m.permissions.some((p) => !KNOWN_PERMISSIONS.has(p)))
    return { ok: false, error: 'permissions chứa scope không hợp lệ.' };
  if (!Array.isArray(m.tools) || m.tools.length === 0) return { ok: false, error: 'Cần ít nhất 1 tool.' };

  for (const t of m.tools) {
    if (!t || typeof t.name !== 'string' || !/^[a-z0-9_]{1,48}$/.test(t.name))
      return { ok: false, error: `Tên tool không hợp lệ: ${t?.name}` };
    if (typeof t.description !== 'string' || !t.description.trim())
      return { ok: false, error: `Tool ${t.name} thiếu description.` };
    if (!t.inputSchema || typeof t.inputSchema !== 'object')
      return { ok: false, error: `Tool ${t.name} thiếu inputSchema.` };
    if (!t.lark || !METHODS.has(String(t.lark.method).toUpperCase()))
      return { ok: false, error: `Tool ${t.name} có method không hợp lệ.` };
    if (typeof t.lark.path !== 'string' || !pathAllowed(t.lark.path, m.permissions))
      return { ok: false, error: `Tool ${t.name} gọi endpoint ngoài quyền đã cấp: ${t.lark?.path}` };
  }

  if (m.panels !== undefined) {
    if (!Array.isArray(m.panels)) return { ok: false, error: 'panels phải là mảng.' };
    const toolNames = new Set(m.tools.map((t) => t.name));
    for (const p of m.panels) {
      if (!p || typeof p.id !== 'string' || !/^[a-z0-9_-]{1,48}$/.test(p.id))
        return { ok: false, error: `Panel id không hợp lệ: ${p?.id}` };
      if (typeof p.title !== 'string' || !p.title.trim())
        return { ok: false, error: `Panel ${p.id} thiếu title.` };
      if (typeof p.tool !== 'string' || !toolNames.has(p.tool))
        return { ok: false, error: `Panel ${p.id} trỏ tới tool không tồn tại: ${p.tool}` };
    }
  }
  return { ok: true, manifest: m as PluginManifest };
}

/** Stable JSON (sorted keys) for signing/verification. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = sortKeys((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}
