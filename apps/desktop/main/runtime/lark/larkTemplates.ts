import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * "Làm mẫu một lần → dùng lại" — turn ONE automation/workflow the user built by hand in Lark into a
 * reusable TEMPLATE, then replay it as a NEW DISABLED draft on another table/base.
 *
 * Why this works where `bitable_create_workflow` fails (800004006): the body we replay is Lark's OWN
 * captured save request (draft + extra + nodeSchema, whatever Lark put in it) — we never author the
 * undocumented schema. We only swap IDs: every table/field/view/option/user/chat id found in the
 * captured payload becomes a VARIABLE (`{{tbl_1}}`, `{{fld_2}}`…); applying = substitute → create a
 * fresh shell → POST the filled body with status 0 (draft, never enabled).
 *
 * Pure (fs only, no Electron) → covered by apps/desktop/test/larkTemplates.cjs.
 */

export type TemplateVarKind = 'table' | 'field' | 'view' | 'option' | 'user' | 'chat' | 'department';

export interface TemplateVar {
  /** Placeholder key, e.g. "tbl_1" → appears as {{tbl_1}} in the body template. */
  key: string;
  kind: TemplateVarKind;
  /** The id in the hand-made original (default value when replaying on the SAME base). */
  original: string;
  /** For fields/views/options: the table variable they belong to (from extra.TableMap). */
  table?: string;
  /** Human hint (e.g. a field name seen next to the id in the payload). */
  hint?: string;
}

export interface UiTemplate {
  id: string;
  name: string;
  description?: string;
  /** 'automation' (Tự động hoá, classic) | 'workflow' (Quy trình, node-flow). */
  kind: 'automation' | 'workflow';
  createdAt: string;
  /** Base the template was recorded on (the `token` of the captured body). */
  sourceBase: string;
  /** Root-relative endpoint of the captured save (e.g. /space/api/bitable/automation/update). */
  endpoint: string;
  /** Captured body with ids replaced by {{key}} placeholders, minus token/workflowID/status. */
  bodyTemplate: string;
  vars: TemplateVar[];
  /** Fields present in Lark's captured body (draft/extra/nodeSchema/…) — for the UI. */
  fields: string[];
  triggerName?: string;
  source?: string;
  bizType?: string;
  title?: string;
}

/** Ids by kind. Matched only inside string VALUES and `ref_…` alias KEYS (never ordinary JSON keys
 *  like "optionList"), with a left boundary that allows `_` (so `ref_tblX_fldY` aliases match). */
const ID_PATTERNS: { kind: TemplateVarKind; prefix: string; re: RegExp }[] = [
  { kind: 'table', prefix: 'tbl', re: /(?<![A-Za-z0-9])tbl[A-Za-z0-9]{6,}/g },
  { kind: 'field', prefix: 'fld', re: /(?<![A-Za-z0-9])fld[A-Za-z0-9]{6,}/g },
  { kind: 'view', prefix: 'vew', re: /(?<![A-Za-z0-9])vew[A-Za-z0-9]{6,}/g },
  { kind: 'option', prefix: 'opt', re: /(?<![A-Za-z0-9])opt[A-Za-z0-9]{6,}/g },
  { kind: 'user', prefix: 'ou', re: /(?<![A-Za-z0-9])ou_[a-f0-9]{16,}/g },
  { kind: 'chat', prefix: 'oc', re: /(?<![A-Za-z0-9])oc_[a-f0-9]{16,}/g },
  { kind: 'department', prefix: 'od', re: /(?<![A-Za-z0-9])od-[a-f0-9]{16,}/g },
];

/** Body keys we ALWAYS set on apply (never templated). */
const OWN_KEYS = ['token', 'workflowID', 'workflowId', 'status'];

/** Only ids made of these characters may be substituted (they land inside nested JSON strings). */
export const SAFE_ID = /^[A-Za-z0-9_-]{3,80}$/;

function scanString(text: string, found: Map<string, TemplateVarKind>): void {
  for (const p of ID_PATTERNS) {
    for (const m of text.matchAll(p.re)) {
      // `ref_tblA_fldB` → the greedy [A-Za-z0-9] stops at `_`, so each segment is its own id.
      if (!found.has(m[0])) found.set(m[0], p.kind);
    }
  }
}

/** Walk a value (parsing nested JSON strings such as `draft`/`extra`) and collect ids. */
function collectIdsDeep(v: unknown, found = new Map<string, TemplateVarKind>(), depth = 0): Map<string, TemplateVarKind> {
  if (depth > 60 || v == null) return found;
  if (typeof v === 'string') {
    const t = v.trim();
    if ((t.startsWith('{') || t.startsWith('[')) && t.length > 1) {
      const j = tryJson(t);
      if (j && typeof j === 'object') return collectIdsDeep(j, found, depth + 1);
    }
    scanString(v, found);
    return found;
  }
  if (Array.isArray(v)) {
    for (const x of v) collectIdsDeep(x, found, depth + 1);
    return found;
  }
  if (typeof v === 'object') {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (k.startsWith('ref_')) scanString(k, found);
      collectIdsDeep(x, found, depth + 1);
    }
  }
  return found;
}

/** Ids in a plain string (used for alias keys / hints). */
function collectIds(text: string): Map<string, TemplateVarKind> {
  const found = new Map<string, TemplateVarKind>();
  scanString(text, found);
  return found;
}

function tryJson(s: unknown): unknown {
  if (typeof s !== 'string') return s;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** field/view/option id → owning table id, from extra.TableMap[*].{TableID, FieldMap, ViewMap}. */
function ownership(extra: unknown): Map<string, string> {
  const own = new Map<string, string>();
  const tm = (extra as { TableMap?: Record<string, { TableID?: string; FieldMap?: Record<string, string>; ViewMap?: Record<string, string> }> })?.TableMap;
  if (!tm || typeof tm !== 'object') return own;
  for (const [alias, t] of Object.entries(tm)) {
    const tbl = t?.TableID || alias.replace(/^ref_/, '');
    for (const m of [t?.FieldMap, t?.ViewMap]) {
      if (!m || typeof m !== 'object') continue;
      for (const [k, v] of Object.entries(m)) {
        if (typeof v === 'string') own.set(v, tbl);
        for (const id of collectIds(k).keys()) if (!id.startsWith('tbl')) own.set(id, tbl);
      }
    }
  }
  return own;
}

/** A field name sitting next to the id in the draft (`{fieldId:"…", fieldName:"…"}`), if any. */
function hintsFrom(draft: unknown): Map<string, string> {
  const hints = new Map<string, string>();
  const walk = (o: unknown, depth: number): void => {
    if (!o || typeof o !== 'object' || depth > 40) return;
    if (Array.isArray(o)) return o.forEach((x) => walk(x, depth + 1));
    const r = o as Record<string, unknown>;
    const name = ['fieldName', 'name', 'tableName', 'title'].map((k) => r[k]).find((v) => typeof v === 'string' && v.trim()) as string | undefined;
    if (name) {
      for (const k of ['fieldId', 'tableId', 'id', 'viewId']) {
        const v = r[k];
        if (typeof v === 'string') for (const id of collectIds(v).keys()) if (!hints.has(id)) hints.set(id, name.slice(0, 60));
      }
    }
    for (const v of Object.values(r)) walk(v, depth + 1);
  };
  walk(draft, 0);
  return hints;
}

/**
 * Build a template from a captured VALID save body (the object Lark POSTed). Every distinct id
 * becomes a variable; the rest of Lark's bytes are kept verbatim.
 */
export function extractTemplate(
  body: Record<string, unknown>,
  meta: { name: string; description?: string; endpoint: string; now?: Date; id?: string },
): UiTemplate {
  if (!body || typeof body.draft !== 'string') throw new Error('Gói đã bắt không có `draft` — không phải một lần lưu automation hợp lệ.');
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (!OWN_KEYS.includes(k)) rest[k] = v;
  let text = JSON.stringify(rest);
  const ids = collectIdsDeep(rest);
  const own = ownership(tryJson(body.extra));
  const hints = hintsFrom(tryJson(body.draft));

  const counters: Record<string, number> = {};
  const keyOf = new Map<string, string>();
  const vars: TemplateVar[] = [];
  // Tables first so fields can point at their table variable.
  const ordered = [...ids.entries()].sort((a, b) => (a[1] === 'table' ? -1 : 0) - (b[1] === 'table' ? -1 : 0));
  for (const [id, kind] of ordered) {
    const prefix = ID_PATTERNS.find((p) => p.kind === kind)!.prefix;
    counters[prefix] = (counters[prefix] || 0) + 1;
    const key = `${prefix}_${counters[prefix]}`;
    keyOf.set(id, key);
    vars.push({ key, kind, original: id });
  }
  for (const v of vars) {
    const t = own.get(v.original);
    if (t && keyOf.has(t) && v.kind !== 'table') v.table = keyOf.get(t);
    const h = hints.get(v.original);
    if (h) v.hint = h;
  }
  // Replace longest ids first so an id that is a prefix of another can't corrupt it.
  for (const id of [...keyOf.keys()].sort((a, b) => b.length - a.length)) {
    text = text.split(id).join(`{{${keyOf.get(id)}}}`);
  }
  let title = '';
  try {
    title = String((JSON.parse(String(body.draft)) as { title?: string })?.title || '');
  } catch {
    /* best-effort */
  }
  const source = typeof body.source === 'string' ? body.source : undefined;
  const bizType = body.bizType != null ? String(body.bizType) : undefined;
  const kind: UiTemplate['kind'] = /workflow/i.test(meta.endpoint) || source === 'workflow_block' || bizType === '2' ? 'workflow' : 'automation';
  return {
    id: meta.id || randomUUID(),
    name: meta.name.trim().slice(0, 80) || 'Mẫu không tên',
    description: meta.description?.slice(0, 300),
    kind,
    createdAt: (meta.now || new Date()).toISOString(),
    sourceBase: typeof body.token === 'string' ? body.token : '',
    endpoint: meta.endpoint,
    bodyTemplate: text,
    vars,
    fields: Object.keys(body),
    triggerName: typeof body.triggerName === 'string' ? body.triggerName : undefined,
    source,
    bizType,
    title: title.slice(0, 120) || undefined,
  };
}

const KIND_RE: Record<TemplateVarKind, RegExp> = {
  table: /^tbl[A-Za-z0-9]+$/,
  field: /^fld[A-Za-z0-9]+$/,
  view: /^vew[A-Za-z0-9]+$/,
  option: /^opt[A-Za-z0-9]+$/,
  user: /^ou_[a-f0-9]+$/,
  chat: /^oc_[a-f0-9]+$/,
  department: /^od-[a-f0-9]+$/,
};

/**
 * Fill a template → the body to POST (minus token/workflowID/status, which the caller sets).
 * Rules (fail-closed):
 *   • every value must look like an id of its kind (no JSON-breaking characters can be injected);
 *   • on a DIFFERENT base, every table/field/view/option variable must be given (those ids don't
 *     exist elsewhere); users/chats default to the originals;
 *   • on the SAME base, missing values default to the originals (= clone);
 *   • no `{{…}}` may remain.
 */
export function fillTemplate(
  tpl: UiTemplate,
  values: Record<string, string>,
  targetBase: string,
): { body: Record<string, unknown>; missing: string[] } {
  if (!SAFE_ID.test(targetBase)) throw new Error('base không hợp lệ.');
  const sameBase = !!tpl.sourceBase && targetBase === tpl.sourceBase;
  const missing: string[] = [];
  const final = new Map<string, string>();
  for (const v of tpl.vars) {
    const given = values[v.key] != null ? String(values[v.key]).trim() : '';
    if (given) {
      if (!SAFE_ID.test(given) || !KIND_RE[v.kind].test(given)) throw new Error(`Giá trị cho ${v.key} (${v.kind}) không hợp lệ: "${given.slice(0, 40)}".`);
      final.set(v.key, given);
    } else if (sameBase || v.kind === 'user' || v.kind === 'chat' || v.kind === 'department') {
      final.set(v.key, v.original);
    } else {
      missing.push(v.key);
    }
  }
  if (missing.length) return { body: {}, missing };
  let text = tpl.bodyTemplate;
  for (const [k, id] of final) text = text.split(`{{${k}}}`).join(id);
  if (/\{\{[a-z]+_\d+\}\}/.test(text)) throw new Error('Mẫu còn biến chưa điền.');
  const body = JSON.parse(text) as Record<string, unknown>;
  return { body, missing: [] };
}

// ── Store (one JSON file per account scope in userData) ──────────────────────────────────────

export function loadTemplates(file: string): UiTemplate[] {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(raw) ? (raw as UiTemplate[]).filter((t) => t && t.id && t.bodyTemplate) : [];
  } catch {
    return [];
  }
}

export function saveTemplates(file: string, list: UiTemplate[]): void {
  try {
    mkdirSync(dirname(file), { recursive: true });
  } catch {
    /* exists */
  }
  writeFileSync(file, JSON.stringify(list.slice(0, 200), null, 1));
}

/** Public view for UI / agent (no body bytes). */
export function templateSummary(t: UiTemplate): Omit<UiTemplate, 'bodyTemplate'> {
  const { bodyTemplate: _b, ...rest } = t;
  return rest;
}
