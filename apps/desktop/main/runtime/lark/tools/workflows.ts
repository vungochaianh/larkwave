import { type LarkToolDef, enc, str } from './types';
import type { LarkClient } from '../larkClient';
import { getLarkWebSession } from '../larkWebSession';

/**
 * bitable_read_workflows — READ + TRANSLATE a Base's Automations/Workflows.
 *
 * Lark's Open API can't read workflow LOGIC, so this goes through the EXPERIMENTAL Lark web
 * session (see larkWebSession.ts) to hit the internal `/space/api/bitable/{base}/…` endpoints.
 * The list/detail responses embed the full step graph as a `draft` JSON string (+ an `extra`
 * that maps the draft's `ref_<alias>` ids to REAL table/field ids). We parse that and render it
 * into readable Vietnamese: trigger → (edge conditions) → actions, loops and branches, resolving
 * field/option/table ids to names via the Open API when an app_token is given.
 *
 * The real draft schema (verified against live data):
 *   step = { id, type, data, stepTitle, next: [{ ids:[...], condition? }] }
 *   triggers:  SetRecordTrigger | AddRecordTrigger | ButtonTrigger | ScheduledTrigger
 *   actions:   FindRecordAction | AddRecordAction | SetRecordAction | DeleteRecordAction |
 *              ExtensionAction | SendMessageAction | WebhookAction
 *   control:   Loop { data.startChildStepId, data.loopData.stepId } |
 *              SwitchBranch { data.childBranchList:[{name, condition, entryChildStepId}], defaultBranchInfo }
 *   refs:      "ref_<tableAlias>_<fieldId>" resolved via extra.TableMap[tableAlias].{TableID,FieldMap}
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type J = any;

// ── Resolve a base_id for the internal API from a pasted URL ─────────────────
async function resolveBaseId(url: string, client: LarkClient): Promise<string> {
  const direct = url.match(/\/(?:base|bitable)\/([A-Za-z0-9]{10,})/);
  if (direct) return direct[1];
  const wiki = url.match(/\/wiki\/([A-Za-z0-9]{10,})/);
  if (wiki) {
    const r = await client.request<{ node?: { obj_token?: string } }>('GET', '/open-apis/wiki/v2/spaces/get_node', {
      params: { token: wiki[1], obj_type: 'wiki' },
    });
    if (r?.node?.obj_token) return r.node.obj_token;
  }
  throw new Error('Không lấy được base_id từ URL — dán link Base/Wiki hợp lệ, hoặc truyền base_id/app_token.');
}

/** base_id from any of base_id / url / app_token (for the internal API). */
async function resolveBase(i: J, client: LarkClient): Promise<string> {
  const id = i.base_id ? String(i.base_id) : i.url ? await resolveBaseId(String(i.url), client) : i.app_token ? String(i.app_token) : '';
  if (!id) throw new Error('Thiếu Base: truyền app_token (dễ nhất), hoặc url, hoặc base_id.');
  return id;
}

// ── ID → name resolver (Open API — RAW so option ids + table names survive) ──
class NameResolver {
  private cache = new Map<
    string,
    {
      fields: Record<string, string>;
      options: Record<string, Record<string, string>>; // fieldId → { optId → name }
      optionsByName: Record<string, Record<string, string>>; // fieldId → { name → optId }
      types: Record<string, number>; // fieldId → numeric field type
    }
  >();
  private tables = new Map<string, string>();
  private tablesLoaded = false;
  constructor(private client: LarkClient, private appToken: string) {}

  /** Load every table's name (id → name) once, for readable "bảng «…»" output. */
  async loadTables(): Promise<void> {
    if (this.tablesLoaded) return;
    this.tablesLoaded = true;
    try {
      let pageToken: string | undefined;
      do {
        const d = await this.client.request<{ items?: { table_id?: string; name?: string }[]; page_token?: string; has_more?: boolean }>(
          'GET',
          `/open-apis/bitable/v1/apps/${enc(this.appToken)}/tables`,
          { params: { page_size: 100, ...(pageToken ? { page_token: pageToken } : {}) } },
        );
        for (const t of d?.items ?? []) if (t.table_id && t.name) this.tables.set(t.table_id, t.name);
        pageToken = d?.has_more ? d?.page_token : undefined;
      } while (pageToken);
    } catch {
      /* base not reachable via Open API (wrong app_token) → fall back to raw table ids */
    }
  }

  async load(tableId: string): Promise<void> {
    if (this.cache.has(tableId)) return;
    const fields: Record<string, string> = {};
    const options: Record<string, Record<string, string>> = {};
    const optionsByName: Record<string, Record<string, string>> = {};
    const types: Record<string, number> = {};
    try {
      const d = await this.client.request<{ items?: RawField[] }>(
        'GET',
        `/open-apis/bitable/v1/apps/${enc(this.appToken)}/tables/${enc(tableId)}/fields`,
        { params: { page_size: 200 } },
      );
      for (const f of d?.items ?? []) {
        if (f.field_id && f.field_name) fields[f.field_id] = f.field_name;
        if (f.field_id && typeof f.type === 'number') types[f.field_id] = f.type;
        const opts = f.property?.options;
        if (f.field_id && Array.isArray(opts)) {
          options[f.field_id] = {};
          optionsByName[f.field_id] = {};
          for (const o of opts) {
            if (o?.id && o?.name) {
              options[f.field_id][o.id] = o.name;
              optionsByName[f.field_id][o.name] = o.id;
            }
          }
        }
      }
    } catch {
      /* fall back to raw ids */
    }
    this.cache.set(tableId, { fields, options, optionsByName, types });
  }

  tableName(tableId: string): string {
    return this.tables.get(tableId) || tableId;
  }
  field(tableId: string, fieldId: string): string {
    return this.cache.get(tableId)?.fields[fieldId] || fieldId;
  }
  option(tableId: string, fieldId: string, optId: string): string {
    return this.cache.get(tableId)?.options[fieldId]?.[optId] || optId;
  }
  /** numeric field type (Open API) — used to detect select fields (3=single, 4=multi). */
  fieldType(tableId: string, fieldId: string): number | undefined {
    return this.cache.get(tableId)?.types[fieldId];
  }
  /** option NAME → option ID (for turning "Hoàn thành" into "optXXX" in a draft). */
  optionId(tableId: string, fieldId: string, name: string): string | undefined {
    return this.cache.get(tableId)?.optionsByName[fieldId]?.[name];
  }
}
interface RawField {
  field_id?: string;
  field_name?: string;
  type?: number;
  property?: { options?: { id?: string; name?: string }[] };
}

// ── Translation context ──────────────────────────────────────────────────────
interface Ctx {
  byId: Map<string, J>;
  tableMap: Record<string, { TableID?: string; FieldMap?: Record<string, string> }>;
  res: NameResolver;
  users: Record<string, J>;
}

/** ref_<tableAlias>_<fieldId> → real { tableId, fieldId } via extra.TableMap (the alias in the ref
 *  is NOT the real table id — it must be mapped). */
function refParts(ctx: Ctx, fieldRef: string): { tableId: string; fieldId: string } {
  const s = String(fieldRef || '');
  const tableRef = s.split('_fld')[0]; // "ref_tblXXX"
  const tm = ctx.tableMap[tableRef];
  const tableId = tm?.TableID || tableRef.replace(/^ref_/, '');
  const fieldId = (tm?.FieldMap && tm.FieldMap[s]) || (s.includes('_fld') ? 'fld' + s.split('_fld')[1] : s);
  return { tableId, fieldId };
}
function fldName(ctx: Ctx, fieldRef: string): string {
  const { tableId, fieldId } = refParts(ctx, fieldRef);
  return `«${ctx.res.field(tableId, fieldId)}»`;
}
function tblName(ctx: Ctx, tableRef: string): string {
  if (!tableRef) return '';
  const tm = ctx.tableMap[tableRef];
  const tableId = tm?.TableID || String(tableRef).replace(/^ref_/, '');
  return `«${ctx.res.tableName(tableId)}»`;
}
function optName(ctx: Ctx, fieldRef: string, optId: string): string {
  const { tableId, fieldId } = refParts(ctx, fieldRef);
  return ctx.res.option(tableId, fieldId, optId);
}
function stepTitleOf(ctx: Ctx, stepId?: string): string {
  const s = stepId ? ctx.byId.get(stepId) : undefined;
  return (s?.stepTitle && String(s.stepTitle)) || (s?.type && String(s.type)) || String(stepId || '?');
}

const OP_VI: Record<string, string> = {
  is: 'là', isNot: 'không phải', contains: 'chứa', doesNotContain: 'không chứa',
  isEmpty: 'để trống', isNotEmpty: 'có giá trị', isGreater: '>', isGreaterEqual: '≥',
  isLess: '<', isLessEqual: '≤', isGreaterThan: '>', isLessThan: '<', equal: '=', notEqual: '≠',
};
const op = (o?: string): string => OP_VI[o || ''] || o || '?';

/** Render an atom's `value` array → option names / literals / "giá trị từ bước N". */
function renderValue(ctx: Ctx, atom: J): string {
  const v = atom?.value;
  if (!Array.isArray(v) || !v.length) return '';
  return v
    .map((x: J) => {
      if (x && typeof x === 'object') {
        if (x.tagType === 'loop') return 'mỗi bản ghi trong vòng lặp';
        if (x.type === 'ref' || x.tagType === 'step' || x.tagType === 'stepRecordFields') {
          const f = Array.isArray(x.fields) && x.fields[0];
          const fn = f?.fieldId ? fldName(ctx, f.fieldId) : '';
          return `giá trị ${fn ? fn + ' ' : ''}từ bước ${x.stepNum ?? '?'}`.trim();
        }
        return '';
      }
      if (typeof x === 'string' && /^opt/.test(x) && atom?.fieldId) return optName(ctx, atom.fieldId, x);
      return String(x);
    })
    .filter(Boolean)
    .join(', ');
}

/** Render a condition group ({conjunction, conditions:[atom|group]}). */
function renderGroup(ctx: Ctx, g: J): string {
  if (!g || !Array.isArray(g.conditions) || !g.conditions.length) return '';
  const join = /or/i.test(g.conjunction || 'and') ? ' HOẶC ' : ' VÀ ';
  return g.conditions
    .map((c: J) => (c && Array.isArray(c.conditions) ? `(${renderGroup(ctx, c)})` : renderAtom(ctx, c)))
    .filter(Boolean)
    .join(join);
}
function renderAtom(ctx: Ctx, a: J): string {
  if (!a) return '';
  // leftValue/rightValue shape (field-vs-field, field-vs-literal, or an attribute like recordNum).
  if (a.leftValue !== undefined || a.rightValue !== undefined) {
    const l = renderOperand(ctx, a.leftValue);
    const r = renderOperand(ctx, a.rightValue);
    return `${l} ${op(a.operator)}${r ? ' ' + r : ''}`.trim();
  }
  // Field condition ({fieldId, operator, value:[…]}).
  if (a.fieldId) {
    const val = renderValue(ctx, a);
    return `${fldName(ctx, a.fieldId)} ${op(a.operator)}${val ? ' ' + val : ''}`.trim();
  }
  return '';
}

/** Render a condition OPERAND: a field ref, an attribute (recordNum), a literal, or an array. */
function renderOperand(ctx: Ctx, operand: J): string {
  if (operand === undefined || operand === null) return '';
  if (Array.isArray(operand)) return operand.map((o) => renderOperand(ctx, o)).filter(Boolean).join(', ');
  if (typeof operand === 'object') {
    if (operand.attribute === 'recordNum') return `số bản ghi tìm được ở "${stepTitleOf(ctx, operand.stepId)}"`;
    const f = Array.isArray(operand.fields) && operand.fields[0];
    if (f?.fieldId) return `${fldName(ctx, f.fieldId)}${operand.stepNum ? ` (bước ${operand.stepNum})` : ''}`;
    if (operand.attribute) return String(operand.attribute);
    if (typeof operand.value === 'string' || typeof operand.value === 'number') return String(operand.value);
    return '';
  }
  return String(operand);
}

/** Render an Add/SetRecord action's `values` → "đặt «field» = <desc>". */
function renderSetValues(ctx: Ctx, values: J): string {
  if (!Array.isArray(values) || !values.length) return '';
  const parts = values.map((v: J) => `${fldName(ctx, v.fieldId)} = ${describeValue(ctx, v.value, v.fieldId)}`);
  return ' — đặt ' + parts.join('; ');
}
function describeValue(ctx: Ctx, valArr: J, fieldRef: string): string {
  if (!Array.isArray(valArr) || !valArr.length) return '(giá trị)';
  const out = valArr
    .map((x: J) => {
      if (x && typeof x === 'object') {
        if (x.tagType === 'loop') return 'bản ghi trong vòng lặp';
        if (x.structureType === 'attachment' || JSON.stringify(x.path || '').includes('attachment')) return 'tệp đính kèm từ bước trước';
        const f = Array.isArray(x.fields) && x.fields[0];
        if (f?.fieldId) return `${fldName(ctx, f.fieldId)} (bước ${x.stepNum ?? '?'})`;
        if (x.tagType === 'stepRecordFields' || x.type === 'ref') return `bản ghi từ bước ${x.stepNum ?? '?'}`;
        return '';
      }
      if (typeof x === 'string' && /^opt/.test(x) && fieldRef) return optName(ctx, fieldRef, x);
      return String(x);
    })
    .filter(Boolean)
    .join(', ');
  return out || '(giá trị)';
}

/** Extension action label from its params (e.g. DocuGenius template name). */
function extLabel(d: J): string {
  const ep = d?.extraParams;
  if (ep && typeof ep === 'object') {
    const bits: string[] = [];
    for (const k of Object.keys(ep)) {
      const a = ep[k];
      if (Array.isArray(a) && a[0]?.label) bits.push(String(a[0].label));
    }
    if (bits.length) return ` (${bits.join(', ')})`;
  }
  return '';
}

/** The one-line headline for a step. */
function headline(ctx: Ctx, step: J): string {
  const d = step.data || {};
  switch (step.type) {
    case 'AddRecordTrigger':
    case 'RecordCreatedTrigger':
      return `⚡ Khi THÊM bản ghi mới vào bảng ${tblName(ctx, d.tableId)}`;
    case 'SetRecordTrigger':
    case 'UpdateRecordTrigger':
    case 'RecordEditedTrigger': {
      const f = Array.isArray(d.fields) && d.fields[0];
      if (f?.fieldId) return `⚡ Khi bản ghi bảng ${tblName(ctx, d.tableId)} có cột ${fldName(ctx, f.fieldId)} ${op(f.operator)} ${renderValue(ctx, f)}`.trim();
      return `⚡ Khi CẬP NHẬT bản ghi trong bảng ${tblName(ctx, d.tableId)}`;
    }
    case 'ButtonTrigger':
      return `⚡ Khi BẤM NÚT trên bản ghi (bảng ${tblName(ctx, d.tableId)})`;
    case 'ScheduledTrigger':
    case 'TimerTrigger':
      return `⚡ Theo LỊCH`;
    case 'FindRecordAction': {
      let s = `🔍 Tìm bản ghi trong bảng ${tblName(ctx, d.tableId)}`;
      const c = renderGroup(ctx, d.recordInfo);
      if (c) s += ` — điều kiện: ${c}`;
      if (d.shouldProceedWithNoResults) s += ` (tiếp tục kể cả khi không tìm thấy)`;
      return s;
    }
    case 'AddRecordAction':
    case 'CreateRecordAction':
      return `➕ Thêm bản ghi mới vào bảng ${tblName(ctx, d.tableId)}${renderSetValues(ctx, d.values)}`;
    case 'SetRecordAction':
    case 'UpdateRecordAction':
      return `✏️ Cập nhật bản ghi (bảng ${tblName(ctx, d.tableId)})${renderSetValues(ctx, d.values)}`;
    case 'DeleteRecordAction':
      return `🗑️ Xoá bản ghi (bảng ${tblName(ctx, d.tableId)})`;
    case 'ExtensionAction':
      return `🧩 Chạy tiện ích: ${step.stepTitle || 'Extension'}${extLabel(d)}`;
    case 'SendMessageAction':
    case 'SendLarkMessageAction':
      return `✉️ Gửi tin nhắn`;
    case 'WebhookAction':
      return `🔗 Gọi webhook`;
    case 'Loop':
      return `🔁 Lặp qua từng bản ghi tìm được ở bước "${stepTitleOf(ctx, d.loopData?.stepId)}"`;
    case 'SwitchBranch':
      return `🔀 Rẽ nhánh (chạy nhánh ĐẦU TIÊN thoả điều kiện):`;
    case 'IfElseBranch':
      return `🔀 Kiểm tra điều kiện (Nếu / Nếu không):`;
    default:
      return `• ${step.stepTitle || step.type}`;
  }
}

/** Walk the step graph from `id`, producing indented readable lines. */
function walk(id: string | undefined, ctx: Ctx, depth: number, seen: Set<string>): string[] {
  if (!id) return [];
  const step = ctx.byId.get(id);
  if (!step || seen.has(id)) return [];
  seen.add(id);
  const pad = '  '.repeat(depth);
  const lines: string[] = [`${pad}• ${headline(ctx, step)}`];
  const d = step.data || {};

  if (step.type === 'Loop') {
    lines.push(...walk(d.startChildStepId, ctx, depth + 1, seen));
  } else if (step.type === 'SwitchBranch') {
    for (const b of d.childBranchList || []) {
      const c = renderGroup(ctx, b?.condition);
      lines.push(`${pad}  ┗ Nhánh "${b?.name || ''}"${c ? `: NẾU ${c}` : ''} →`);
      lines.push(...walk(b?.entryChildStepId, ctx, depth + 2, seen));
    }
    const def = d.defaultBranchInfo?.entryStepId;
    if (def) {
      lines.push(`${pad}  ┗ Mặc định (không nhánh nào thoả) →`);
      lines.push(...walk(def, ctx, depth + 2, seen));
    }
  } else if (step.type === 'IfElseBranch') {
    // Classic If/Else: data.condition gates meetConditionStepId (true) vs notMeetConditionStepId.
    const c = renderGroup(ctx, d.condition);
    if (c) lines[0] = `${pad}• 🔀 NẾU ${c}:`;
    if (d.meetConditionStepId) {
      lines.push(`${pad}  ┗ ✔ ĐÚNG →`);
      lines.push(...walk(d.meetConditionStepId, ctx, depth + 2, seen));
    }
    if (d.notMeetConditionStepId) {
      lines.push(`${pad}  ┗ ✗ NGƯỢC LẠI →`);
      lines.push(...walk(d.notMeetConditionStepId, ctx, depth + 2, seen));
    }
  }

  for (const edge of step.next || []) {
    let extra = 0;
    if (edge?.condition) {
      const c = renderGroup(ctx, edge.condition);
      if (c) {
        lines.push(`${pad}  ↳ chỉ chạy tiếp NẾU ${c}:`);
        extra = 1;
      }
    }
    for (const nid of edge?.ids || []) lines.push(...walk(nid, ctx, depth + extra, seen));
  }
  return lines;
}

function jparse(s: unknown): J {
  if (typeof s !== 'string') return s && typeof s === 'object' ? s : {};
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

/** Translate one workflow object (a list item OR detail.workflow) into a readable summary. */
async function translateItem(wf: J, res: NameResolver, users: Record<string, J>): Promise<J> {
  const draft = jparse(wf?.draft);
  const extra = jparse(wf?.extra);
  const steps: J[] = Array.isArray(draft?.steps) ? draft.steps : [];
  const tableMap = (extra?.TableMap && typeof extra.TableMap === 'object' ? extra.TableMap : {}) as Ctx['tableMap'];

  // Preload names: every real table referenced by the draft + the base's table titles.
  await res.loadTables();
  for (const k of Object.keys(tableMap)) {
    const tid = tableMap[k]?.TableID;
    if (tid) await res.load(tid);
  }

  const ctx: Ctx = { byId: new Map(steps.map((s) => [s.id, s])), tableMap, res, users };
  const triggerId = wf?.nodeSchema?.triggerStepId || steps.find((s) => /Trigger$/.test(s?.type || ''))?.id;
  const lines = walk(triggerId, ctx, 0, new Set());

  const title = (typeof draft?.title === 'string' && draft.title.trim()) ? draft.title.trim() : String(wf?.title || '(không tên)');
  const status = wf?.status;
  const createdBy = wf?.createUID && users?.[wf.createUID]?.name ? String(users[wf.createUID].name) : undefined;
  return {
    workflow_id: String(wf?.workflowID || wf?.workflowId || ''),
    name: title,
    status_text: status === 1 ? 'đang bật' : status === 0 ? 'đang tắt' : '',
    ...(createdBy ? { created_by: createdBy } : {}),
    logic: lines.join('\n') || '(không đọc được nội dung workflow)',
  };
}

/** Open API status string → Vietnamese ('' if unknown, so the internal numeric status can win). */
function statusStr(s: unknown): string {
  const v = String(s ?? '');
  if (/disable|disabled|off|inactive|closed|paused|^0$/i.test(v)) return 'đang tắt';
  if (/enable|enabled|on|active|open|running|^1$/i.test(v)) return 'đang bật';
  return '';
}

/**
 * List EVERY workflow of a Base via the DOCUMENTED Open API (OAuth Bearer — no cookies): both
 * `/workflows` (classic automations) AND `/block_workflows` (node-flow "Workflow" items — the ones
 * the internal /automation/list never returns). Each item = {workflow_id, title, status}. This is
 * how we finally enumerate + NAME the flowchart workflows. Returns [] on missing scope / error.
 */
async function fetchOpenApiWorkflows(client: LarkClient, appToken: string): Promise<{ workflow_id: string; title: string; status: string }[]> {
  const out: { workflow_id: string; title: string; status: string }[] = [];
  const seen = new Set<string>();
  for (const resource of ['workflows', 'block_workflows']) {
    try {
      let pageToken: string | undefined;
      let guard = 0;
      do {
        const d = await client.request<{ workflows?: J[]; page_token?: string; has_more?: boolean }>(
          'GET',
          `/open-apis/bitable/v1/apps/${enc(appToken)}/${resource}`,
          { params: { page_size: 100, ...(pageToken ? { page_token: pageToken } : {}) } },
        );
        for (const w of d?.workflows ?? []) {
          const id = String(w?.workflow_id ?? w?.workflowID ?? '');
          if (id && !seen.has(id)) {
            seen.add(id);
            out.push({ workflow_id: id, title: String(w?.title ?? ''), status: String(w?.status ?? '') });
          }
        }
        pageToken = d?.has_more ? d?.page_token : undefined;
      } while (pageToken && ++guard < 20);
    } catch {
      /* endpoint unavailable / no scope → skip, other resource + internal fallback still run */
    }
  }
  return out;
}

// ── WRITE helpers (create workflow) ──────────────────────────────────────────
/** Lark's `triggerName` field expected by automation/update, derived from the trigger step type. */
const TRIGGER_NAME: Record<string, string> = {
  AddRecordTrigger: 'addRecordV2',
  RecordCreatedTrigger: 'addRecordV2',
  SetRecordTrigger: 'setRecord',
  UpdateRecordTrigger: 'setRecord',
  RecordEditedTrigger: 'setRecord',
  ChangeRecordTrigger: 'changeRecord',
  ButtonTrigger: 'buttonField',
  ScheduledTrigger: 'datetimeField',
  TimerTrigger: 'cron',
  WebhookTrigger: 'webhook',
};

/** Build `extra` (TableMap etc.) purely from the `ref_<tbl>_<fld>` / `ref_<tbl>` references that
 *  appear anywhere in the draft — so the caller only supplies `steps` and we wire the rest. */
function deriveExtra(draftObj: J): J {
  const TableMap: Record<string, J> = {};
  const json = JSON.stringify(draftObj);
  const ensure = (tbl: string) => (TableMap[`ref_${tbl}`] ||= { TableID: tbl, FieldMap: {}, ViewMap: {} });
  let m: RegExpExecArray | null;
  const fieldRe = /ref_(tbl[A-Za-z0-9]+)_(fld[A-Za-z0-9]+)/g;
  while ((m = fieldRe.exec(json))) ensure(m[1]).FieldMap[`ref_${m[1]}_${m[2]}`] = m[2];
  const tableRe = /ref_(tbl[A-Za-z0-9]+)(?!_fld)/g;
  while ((m = tableRe.exec(json))) ensure(m[1]);
  return { TableMap, BlockMap: {}, WorkflowMap: {}, RelationInfo: {} };
}

// `ref_<tbl>_<fld>` → { tableId, fieldId } (for writes the alias == the real id).
function toRealRef(ref: unknown): { tableId: string; fieldId: string } | null {
  const m = /^ref_(tbl[A-Za-z0-9]+)_(fld[A-Za-z0-9]+)$/.exec(String(ref || ''));
  return m ? { tableId: m[1], fieldId: m[2] } : null;
}
function idPrefix(type: string): string {
  if (/Trigger$/.test(type)) return 'trig';
  if (type === 'Loop') return 'loop';
  if (/Branch$/.test(type)) return 'branch';
  return 'act';
}
function randSuffix(): string {
  // App main process — Math.random is allowed here (unlike workflow scripts).
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Make an AI-built `draft` schema-VALID for Lark (else enable → 800004006 "flow schema is invalid").
 * Confident, verified-from-real-data transforms: (1) step ids MUST start with trig/act/branch/loop
 * → regenerate + rewrite every reference; (2) single/multi-select values MUST be option IDs (opt…),
 * not names → resolve via Open API; (3) repair REFOBJ ids to Lark's `<stepId>-<tbl>-<fld>-<rand>`
 * form. Then validate the graph. (Constant text/number formatting is left as-is — still unverified.)
 */
async function normalizeDraft(draftObj: J, res: NameResolver): Promise<void> {
  const steps: J[] = Array.isArray(draftObj?.steps) ? draftObj.steps : [];
  if (!steps.length) throw new Error('Draft không có bước nào.');

  // Preload field metadata for every table referenced (so we can resolve options + types).
  const tableIds = new Set<string>();
  JSON.stringify(draftObj).replace(/ref_(tbl[A-Za-z0-9]+)/g, (_m, t) => (tableIds.add(t), _m));
  await res.loadTables();
  for (const t of tableIds) await res.load(t);

  // STAGE 1 — regenerate ids with the required category prefix.
  const idMap: Record<string, string> = {};
  for (const s of steps) {
    const nid = idPrefix(String(s?.type || '')) + randSuffix();
    if (s?.id) idMap[s.id] = nid;
    s.id = nid;
  }
  const sw = (id: unknown) => (typeof id === 'string' && idMap[id]) || id;

  // STAGE 2 — rewrite EVERY reference (structural, no blind substring replace).
  const rewriteDeep = (node: J) => {
    if (Array.isArray(node)) return node.forEach(rewriteDeep);
    if (!node || typeof node !== 'object') return;
    if (typeof node.stepId === 'string') node.stepId = sw(node.stepId);
    if (typeof node.id === 'string' && node.id.includes('-')) {
      const seg = node.id.split('-');
      if (idMap[seg[0]]) { seg[0] = idMap[seg[0]]; node.id = seg.join('-'); }
    }
    for (const k of Object.keys(node)) rewriteDeep(node[k]);
  };
  for (const s of steps) {
    for (const e of s.next || []) if (Array.isArray(e?.ids)) e.ids = e.ids.map(sw);
    const d = s.data || {};
    for (const key of ['meetConditionStepId', 'notMeetConditionStepId', 'startChildStepId'] as const) if (d[key]) d[key] = sw(d[key]);
    if (d.loopData?.stepId) d.loopData.stepId = sw(d.loopData.stepId);
    if (d.defaultBranchInfo?.entryStepId) d.defaultBranchInfo.entryStepId = sw(d.defaultBranchInfo.entryStepId);
    for (const b of d.childBranchList || []) if (b?.entryChildStepId) b.entryChildStepId = sw(b.entryChildStepId);
    rewriteDeep(d);
  }

  // STAGE 3 — repair REFOBJs (references to a record field) + resolve select NAMES → option IDs.
  const fix = (node: J) => {
    if (Array.isArray(node)) return node.forEach(fix);
    if (!node || typeof node !== 'object') return;
    // REFOBJ: give it Lark's canonical id/value shape.
    if (node.type === 'ref' && node.tagType === 'step' && Array.isArray(node.fields) && node.stepId) {
      const p = toRealRef(node.fields[0]?.fieldId);
      if (p) node.id = `${node.stepId}-${p.tableId}-${p.fieldId}-${Math.floor(Math.random() * 90000) + 10000}`;
      if (node.value === undefined) node.value = 'step';
      if (node.recordInfo === undefined) node.recordInfo = {};
    }
    // select value arrays: {fieldId, value:[…]} and {leftValue:{fields:[{fieldId}]}, rightValue:[…]}
    if (typeof node.fieldId === 'string' && Array.isArray(node.value)) node.value = mapSelect(res, node.fieldId, node.value);
    if (node.leftValue && Array.isArray(node.rightValue)) {
      const fid = node.leftValue?.fields?.[0]?.fieldId;
      if (fid) node.rightValue = mapSelect(res, fid, node.rightValue);
    }
    for (const k of Object.keys(node)) fix(node[k]);
  };
  for (const s of steps) fix(s.data || {});

  // STAGE 4 — validate the graph before we ever POST (fail with a precise message).
  const ids = new Set(steps.map((s) => s.id));
  const refIds: string[] = [];
  for (const s of steps) {
    for (const e of s.next || []) for (const id of e?.ids || []) refIds.push(id);
    const d = s.data || {};
    for (const key of ['meetConditionStepId', 'notMeetConditionStepId', 'startChildStepId'] as const) if (d[key]) refIds.push(d[key]);
    for (const b of d.childBranchList || []) if (b?.entryChildStepId) refIds.push(b.entryChildStepId);
    if (d.defaultBranchInfo?.entryStepId) refIds.push(d.defaultBranchInfo.entryStepId);
  }
  const dangling = refIds.filter((id) => id && !ids.has(id));
  if (dangling.length) throw new Error('Draft có tham chiếu tới bước không tồn tại: ' + dangling.join(', '));
  if (!steps.some((s) => /Trigger$/.test(String(s?.type || '')))) throw new Error('Draft thiếu bước trigger.');
}

/** Turn select-field option NAMES into option IDs; leave non-selects + already-opt values alone. */
function mapSelect(res: NameResolver, ref: string, arr: J[]): J[] {
  const p = toRealRef(ref);
  if (!p) return arr;
  const ft = res.fieldType(p.tableId, p.fieldId);
  if (ft !== 3 && ft !== 4) return arr; // 3=single-select, 4=multi-select
  return arr.map((v) => (typeof v === 'string' && !/^opt/.test(v) ? res.optionId(p.tableId, p.fieldId, v) || v : v));
}

export const workflowTools: LarkToolDef[] = [
  {
    name: 'bitable_read_workflows',
    description:
      'ƯU TIÊN bitable_workflow_list / bitable_workflow_get (Open API chính thức v3, đọc được đủ steps). Tool này là DỰ PHÒNG khi v3 báo thiếu quyền/không hỗ trợ, hoặc khi cần định dạng `logic` cây đọc sẵn. ' +
      'Đọc + GIẢI THÍCH các Automation/Workflow (tự động hoá) của một Lark Base qua phiên Lark web. ' +
      '(Thử nghiệm, dùng phiên "Lark web" — người dùng phải Kết nối Lark web trong Cài đặt trước.) ' +
      'Trả về từng workflow đã dịch sang tiếng Việt: trigger → điều kiện (Nếu/nhánh) → hành động (kể cả vòng lặp, rẽ nhánh). ' +
      'CÁCH DỄ NHẤT: truyền `app_token` của Base ĐÃ ĐĂNG KÝ (base_id nội bộ thường TRÙNG app_token; cũng để dịch id cột/tuỳ chọn/bảng → tên) — hoặc `url` của Base. ' +
      'Truyền workflow_id để đọc 1 cái, bỏ trống = đọc tất cả.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        app_token: str('app_token Open API của Base đã đăng ký (cách dễ nhất — thường trùng base_id nội bộ; cũng để dịch id→tên)'),
        url: str('URL Base/Wiki (tự resolve ra base_id) — thay cho app_token/base_id'),
        base_id: str('id Base trong URL nội bộ (đoạn sau /space/api/bitable/) — nếu app_token/url không đúng'),
        workflow_id: str('workflowID cụ thể (bỏ trống = đọc tất cả)'),
        raw: { type: 'boolean', description: 'Kèm `raw_draft` (JSON schema THÔ của mỗi workflow) để COPY đúng khuôn values/recordType/recordInfo khi tạo workflow mới (tránh lỗi 800004006). Nên dùng với 1 workflow_id cụ thể.' },
        debug: { type: 'boolean', description: 'Chỉ trả về các endpoint nội bộ mà app đã "bắt" được (để gỡ lỗi tìm endpoint danh sách/cây-node)' },
      },
      required: [],
    },
    gated: false,
    exec: async (i, client) => {
      const web = getLarkWebSession();
      const baseId = i.base_id
        ? String(i.base_id)
        : i.url
          ? await resolveBaseId(String(i.url), client)
          : i.app_token
            ? String(i.app_token)
            : '';
      if (!baseId) throw new Error('Thiếu Base: truyền app_token (dễ nhất), hoặc url, hoặc base_id.');

      // Debug: reveal what the sniffer captured so we can locate the base's node-tree LIST endpoint.
      if (i.debug) {
        return {
          base_id: baseId,
          captured_endpoints: web.capturedInfo(),
          captured_workflow_ids: web.capturedWorkflowIds(),
          note: 'Danh sách endpoint app đã bắt được trong cửa sổ Lark. Tìm dòng liệt kê tất cả node/workflow của base (thường KHÔNG có workflowID= trong URL).',
        };
      }

      const res = new NameResolver(client, String(i.app_token || baseId));

      // Single workflow.
      if (i.workflow_id) {
        const detail = (await web.readWorkflowDetail(baseId, String(i.workflow_id))) as { workflow?: J };
        const wf = detail?.workflow || {};
        return { workflows: [await translateItem(wf, res, {})] };
      }

      const appToken = String(i.app_token || baseId);
      const out: J[] = [];
      const seenIds = new Set<string>();

      // 1) ENUMERATE + NAME every workflow via the Open API (classic /workflows + node-flow
      //    /block_workflows). This is the reliable list Lark's internal API never exposed.
      const openList = await fetchOpenApiWorkflows(client, appToken);

      // 2) Internal /automation/list → embedded drafts (translate without an extra detail call) +
      //    the user id→name map. Best-effort (needs the Lark web session).
      const embedded = new Map<string, J>();
      let users: Record<string, J> = {};
      let internalErr = '';
      try {
        const r = await web.readWorkflowList(baseId);
        users = r.users || {};
        for (const w of r.workflows || []) {
          const id = String((w as J)?.workflowID || (w as J)?.workflowId || '');
          if (id) embedded.set(id, w);
        }
      } catch (e) {
        internalErr = (e as Error)?.message || '';
      }

      if (openList.length) {
        // Preferred: iterate the Open API list (has NAMES + all ids). Logic from embedded draft
        // if present, else an internal /workflow/detail call (needs Lark web).
        for (const wf of openList.slice(0, 200)) {
          const id = wf.workflow_id;
          if (seenIds.has(id)) continue;
          seenIds.add(id);
          const name = wf.title || '(không tên)';
          const stText = statusStr(wf.status);
          try {
            let obj = embedded.get(id);
            if (!obj) {
              const d = (await web.readWorkflowDetail(baseId, id)) as { workflow?: J };
              obj = d?.workflow;
            }
            const t = await translateItem(obj || {}, res, users);
            out.push({
              workflow_id: id,
              name,
              status_text: stText || t.status_text,
              ...(t.created_by ? { created_by: t.created_by } : {}),
              logic: t.logic,
              // raw=true → the exact draft JSON, so the agent can COPY the real values/recordType/
              // recordInfo schema when CREATING a similar workflow (fixes the 800004006 guessing).
              ...(i.raw && obj?.draft ? { raw_draft: typeof obj.draft === 'string' ? obj.draft.slice(0, 6000) : JSON.stringify(obj.draft).slice(0, 6000) } : {}),
            });
          } catch (e) {
            const msg = (e as Error)?.message || '';
            out.push({
              workflow_id: id,
              name,
              status_text: stText,
              note: /kết nối Lark web|Lark web/i.test(msg) ? 'Chưa đọc được logic — vào Cài đặt → "Kết nối Lark web" để xem chi tiết trigger/điều kiện/hành động.' : `Chưa đọc được logic: ${msg}`,
            });
          }
        }
      } else {
        // Fallback: no Open API access → internal-list-only (names may be blank).
        for (const w of embedded.values()) {
          const t = await translateItem(w, res, users);
          if (t.workflow_id) seenIds.add(t.workflow_id);
          out.push(t);
        }
      }

      // 3) Safety net: any flowchart Workflow the user opened in-app (sniffer captured its detail).
      for (const id of web.capturedWorkflowIds()) {
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        try {
          const d = (await web.readWorkflowDetail(baseId, id)) as { workflow?: J };
          const t = await translateItem(d?.workflow || {}, res, users);
          t.source_hint = 'đã mở trong cửa sổ Lark';
          out.push(t);
        } catch {
          /* skip */
        }
      }

      if (!out.length) {
        if (internalErr && !openList.length) throw new Error(internalErr);
        return { count: 0, workflows: [], note: 'Không tìm thấy workflow nào (Open API + nội bộ đều rỗng).' };
      }
      return {
        count: out.length,
        workflows: out,
        ...(openList.length ? {} : { list_warning: internalErr || 'Chưa liệt kê được qua Open API (thiếu quyền?) — chỉ hiện các workflow đã mở trong cửa sổ Lark.' }),
      };
    },
  },
  {
    name: 'bitable_create_workflow',
    description:
      'DỰ PHÒNG — KHÔNG dùng mặc định: tạo workflow dùng bitable_workflow_create (Open API chính thức v3). Chỉ dùng tool này khi bitable_workflow_create trả kind "unsupported", hoặc thiếu quyền mà người dùng xác nhận KHÔNG cấp được. ' +
      '(THỬ NGHIỆM — GHI) TẠO một Automation/Workflow MỚI trong Lark Base qua API nội bộ (cần Kết nối Lark web). ' +
      'Mặc định tạo ở trạng thái TẮT (enable=false) để người dùng xem lại trong Lark trước khi bật — LUÔN khuyên test trên bảng nháp. ' +
      'Truyền `steps` (mảng bước) + `title`; tool tự dựng extra.TableMap từ các ref và lo phần tạo/lưu/CSRF. ' +
      'Schema mỗi step: {id, type, data, stepTitle, next:[{ids:[<id kế>], condition?}]}. Dùng ĐÚNG tableId(tbl…)/fieldId(fld…) THẬT của base. ' +
      'TRIGGER: AddRecordTrigger data:{tableId:"ref_<tbl>", watchedFieldId?:"ref_<tbl>_<fld>", triggerControlList:["pasteUpdate","automationBatchUpdate","appendImport","openAPIBatchUpdate"]} | SetRecordTrigger (khi cột đổi) data:{tableId,recordType:"All",fields:[{fieldId:"ref_<tbl>_<fld>",fieldType:<n>,operator:"is",value:[...]}]} | ButtonTrigger data:{tableId,buttonType:"buttonField"}. ' +
      'HÀNH ĐỘNG: SetRecordAction data:{tableId:"ref_<tbl>", values:[{fieldId:"ref_<tbl>_<fld>", valueType:"ref", value:[<ref>]}], recordType:"Ref", recordInfo:{stepId:"<triggerId>",stepNum:0}, maxSetRecordNum:100} | AddRecordAction | FindRecordAction data:{tableId,recordInfo:{conjunction:"and",conditions:[…]},shouldProceedWithNoResults:true} | IfElseBranch data:{condition:{conjunction:"Or",conditions:[{conjunction:"And",conditions:[{leftValue:<ref hoặc {attribute:"recordNum",stepId}>,operator:"isGreater",rightValue:[0]}]}]}, meetConditionStepId:"<id>", notMeetConditionStepId:"<id>|null"} | SwitchBranch data:{mode:"Exclusive",childBranchList:[{name,condition,entryChildStepId}],defaultBranchInfo:{entryStepId:null,mode:"Execute"}}. ' +
      'REF tới cột của bản ghi trigger: {fields:[{fieldId:"ref_<tbl>_<fld>",type:<fieldType>}],id:"<duy nhất>",stepId:"<triggerId>",stepNum:1,stepType:"<LoạiTrigger>",tableId:"ref_<tbl>",tagType:"step",type:"ref",value:"step",recordInfo:{}}. ' +
      '⚠️ GIÁ TRỊ HẰNG (text/số/ngày) trong SetRecord + cách tham chiếu "bản ghi trigger" (recordType/recordInfo) là schema NỘI BỘ Lark, rất DỄ SAI (lỗi 800004006 "flow schema is invalid" khi bật). NẾU workflow có set field bằng GIÁ TRỊ HẰNG hoặc cập nhật chính bản ghi trigger: TRƯỚC TIÊN gọi bitable_read_workflows với `raw:true` (+ workflow_id của một workflow CÓ SẴN tương tự trong base hoặc base khác) để lấy `raw_draft` — rồi COPY Y NGUYÊN khuôn `values`/`recordType`/`recordInfo` từ đó (chuyển id thật → ref_<tbl>_<fld> tương ứng). ĐỪNG tự đoán format hằng. Nếu base chưa có workflow mẫu, hãy đề nghị người dùng tạo tay 1 cái trong Lark (set 1 field text) để lấy khuôn. ' +
      'Nâng cao: có thể truyền thẳng `raw_draft` (chuỗi JSON {steps,title}) và/hoặc `raw_extra`.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        app_token: str('app_token/base_id của Base (thường trùng nhau)'),
        url: str('URL Base/Wiki (thay cho app_token)'),
        base_id: str('base_id nội bộ (nếu khác app_token)'),
        title: str('Tên workflow'),
        steps: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Mảng các bước theo schema ở description' },
        raw_draft: str('(nâng cao) chuỗi JSON draft đầy đủ {steps,title} — thay cho title+steps'),
        raw_extra: str('(nâng cao) chuỗi JSON extra — bỏ trống = tự dựng từ ref'),
        trigger_name: str('(tùy chọn) triggerName cho automation/update — bỏ trống = tự suy từ loại step trigger'),
        enable: { type: 'boolean', description: 'Bật ngay? Mặc định false = tạo ở trạng thái TẮT để xem lại trước.' },
      },
      required: [],
    },
    gated: true,
    exec: async (i, client) => {
      const web = getLarkWebSession();
      const baseId = await resolveBase(i, client);

      let draftObj: J;
      if (i.raw_draft) {
        draftObj = jparse(i.raw_draft);
      } else {
        const steps: J[] = Array.isArray(i.steps) ? (i.steps as J[]) : Array.isArray(jparse(i.steps)) ? jparse(i.steps) : [];
        if (!steps.length) throw new Error('Cần `steps` (mảng bước, ít nhất 1 trigger) hoặc `raw_draft`.');
        draftObj = { steps, title: String(i.title || 'Automation mới'), extensionI18nMap: {} };
      }
      // Normalize AI-built steps into a schema-VALID draft (id prefixes + reference rewrite +
      //  select-name→option-id + REFOBJ repair + validation). Skipped when raw_draft is supplied.
      const res = new NameResolver(client, String(i.app_token || baseId));
      if (!i.raw_draft) await normalizeDraft(draftObj, res);

      const steps: J[] = Array.isArray(draftObj?.steps) ? draftObj.steps : [];
      if (!steps.length) throw new Error('Draft không có bước nào.');
      const trigger = steps.find((s) => /Trigger$/.test(String(s?.type || '')));
      const triggerName = String(i.trigger_name || (trigger && TRIGGER_NAME[trigger.type]) || '');
      const extraObj = i.raw_extra ? jparse(i.raw_extra) : deriveExtra(draftObj);
      const draft = JSON.stringify(draftObj);
      const extra = JSON.stringify(extraObj);

      const trim = (x: unknown) => JSON.stringify(x ?? null).slice(0, 700);
      const created = await web.createWorkflow(baseId, { triggerName });
      const workflowID = created.workflowID;

      // TRUE validation: save WITH status=1 (enable). Lark validates the schema ONLY on enable
      // (status=0 silently accepts an invalid draft). Event triggers don't fire retroactively, so
      // enabling to validate is safe — a schema error surfaces HERE instead of a fake "saved".
      try {
        await web.saveWorkflow(baseId, { workflowID, draft, extra, triggerName, status: 1 });
      } catch (e) {
        try {
          await web.disableWorkflow(baseId, workflowID);
        } catch {
          /* cleanup best-effort */
        }
        throw new Error(
          'Workflow KHÔNG hợp lệ — Lark từ chối khi bật để kiểm: ' + ((e as Error)?.message || e) +
            '. CÁCH TIN CẬY NHẤT (khỏi đoán schema nội bộ): vào Cài đặt → "Kết nối Lark web" → mục "Tạo workflow bằng cách điều khiển Lark": bấm ① tạo tay 1 workflow tương tự trong cửa sổ Lark, ② Lưu bản ghi, ③ Tạo lại — app dùng ĐÚNG gói request Lark đã chấp nhận nên luôn hợp lệ. ' +
            '(Cách thủ công khác: bitable_read_workflows đọc 1 workflow CÓ SẴN rồi COPY Y NGUYÊN `values`/`recordType`/`recordInfo`.)' +
            ' [DEV: create=' + trim(created.raw) + ' | draft=' + draft.slice(0, 700) + ']',
        );
      }

      // Valid + enabled. If the caller wanted it OFF, turn it back off (re-send the same draft).
      if (!i.enable) {
        try {
          await web.saveWorkflow(baseId, { workflowID, draft, extra, triggerName, status: 0 });
        } catch {
          /* leave enabled if the toggle-off fails */
        }
      }

      return {
        workflow_id: workflowID,
        title: String(draftObj?.title || ''),
        status_text: i.enable ? 'đang bật (đã kiểm hợp lệ)' : 'đã kiểm HỢP LỆ, hiện đang TẮT (mở Lark bật khi cần)',
        verified: true,
        note: 'Đã tạo + Lark xác nhận schema HỢP LỆ (bật thử thành công). API nội bộ (thử nghiệm).',
      };
    },
  },
  {
    name: 'bitable_delete_workflow',
    description: '(THỬ NGHIỆM — GHI) XOÁ/TẮT một workflow trong Lark Base theo workflow_id (cần Kết nối Lark web).',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        app_token: str('app_token/base_id của Base'),
        url: str('URL Base/Wiki (thay cho app_token)'),
        base_id: str('base_id nội bộ (nếu khác app_token)'),
        workflow_id: str('workflowID cần xoá/tắt'),
      },
      required: [],
    },
    gated: true,
    exec: async (i, client) => {
      const web = getLarkWebSession();
      const baseId = await resolveBase(i, client);
      if (!i.workflow_id) throw new Error('Thiếu workflow_id.');
      await web.disableWorkflow(baseId, String(i.workflow_id));
      return { workflow_id: String(i.workflow_id), result: 'đã xoá/tắt workflow' };
    },
  },
];
