/**
 * Workflow của Lark Base qua Open API CHÍNH THỨC (Base v3) — phần THUẦN (không mạng, không Electron).
 *
 *   POST /open-apis/base/v3/bases/:base_token/workflows                 tạo (base:workflow:create) — luôn TẮT
 *   PUT  /open-apis/base/v3/bases/:base_token/workflows/:workflow_id    THAY TOÀN BỘ (base:workflow:update)
 *   GET  /open-apis/base/v3/bases/:base_token/workflows/:workflow_id    đọc (base:workflow:read)
 *   POST /open-apis/base/v3/bases/:base_token/workflows/list            liệt kê (base:workflow:read)
 *
 * Nguồn sự thật cho `steps`: tài liệu của larksuite/cli (MIT) nhúng ở docs/workflowDocs.ts. Bộ kiểm
 * dưới đây chép lại luật của CLI (workflow_json_validation.go, workflow_ai_*_validate.go) rồi bổ sung
 * phần CLI không làm được vì nó không nhìn thấy Base: tên bảng/cột có thật không, ref có trỏ đúng
 * field_id không, cột lựa chọn có bị gán chữ trơn không. Kiểm TRƯỚC khi gửi để người dùng không phải
 * duyệt một thiết kế mà Lark sẽ trả về "[2200] Internal Error".
 *
 * File này cố ý không import gì có tác dụng phụ — test/workflowV3.cjs biên dịch riêng nó.
 */
import { LARK_DOCS_SOURCE, LARK_WORKFLOW_GUIDE_MD, LARK_WORKFLOW_SCHEMA_MD } from './docs/workflowDocs';

/* eslint-disable @typescript-eslint/no-explicit-any */
type J = any;

// ── Loại bước ──────────────────────────────────────────────────────────────────
export const TRIGGER_TYPES = [
  'AddRecordTrigger',
  'SetRecordTrigger',
  'ChangeRecordTrigger',
  'TimerTrigger',
  'ReminderTrigger',
  'ButtonTrigger',
  'LarkMessageTrigger',
] as const;
export const ACTION_TYPES = [
  'AddRecordAction',
  'SetRecordAction',
  'FindRecordAction',
  'HTTPClientAction',
  'Delay',
  'LarkMessageAction',
  'GenerateAiTextAction',
  'AIAnalysisAction',
] as const;
export const BRANCH_TYPES = ['IfElseBranch', 'SwitchBranch', 'AIClassificationBranch'] as const;
export const SYSTEM_TYPES = ['Loop'] as const;
export const STEP_TYPES: readonly string[] = [...TRIGGER_TYPES, ...ACTION_TYPES, ...BRANCH_TYPES, ...SYSTEM_TYPES];

const TRIGGERS = new Set<string>(TRIGGER_TYPES);
const ACTIONS = new Set<string>(ACTION_TYPES);
const CONTAINERS = new Set<string>([...BRANCH_TYPES, ...SYSTEM_TYPES]);
const KNOWN = new Set<string>(STEP_TYPES);

/** Tên hay bị đoán nhầm (từ schema nội bộ cũ / ngôn ngữ tự nhiên) → tên đúng. */
const TYPE_ALIASES: Record<string, string> = {
  CreateRecordTrigger: 'AddRecordTrigger',
  NewRecordTrigger: 'AddRecordTrigger',
  UpdateRecordTrigger: 'SetRecordTrigger',
  ModifyRecordTrigger: 'SetRecordTrigger',
  ScheduledTrigger: 'TimerTrigger',
  ScheduleTrigger: 'TimerTrigger',
  CronTrigger: 'TimerTrigger',
  DateTrigger: 'ReminderTrigger',
  SendMessageAction: 'LarkMessageAction',
  MessageAction: 'LarkMessageAction',
  WebhookAction: 'HTTPClientAction',
  HttpAction: 'HTTPClientAction',
  HTTPAction: 'HTTPClientAction',
  UpdateRecordAction: 'SetRecordAction',
  CreateRecordAction: 'AddRecordAction',
  QueryRecordAction: 'FindRecordAction',
  SearchRecordAction: 'FindRecordAction',
  DelayAction: 'Delay',
  WaitAction: 'Delay',
  IfBranch: 'IfElseBranch',
  ConditionBranch: 'IfElseBranch',
  Switch: 'SwitchBranch',
  LoopAction: 'Loop',
  ForEach: 'Loop',
};

const LINK_KINDS = new Set(['if_true', 'if_false', 'case', 'loop_start', 'slot']);
const VALUE_TYPES = new Set(['text', 'number', 'boolean', 'date', 'option', 'link', 'user', 'group', 'ref']);
const OPERATORS = new Set([
  'is',
  'isNot',
  'containsAny',
  'doesNotContainAny',
  'containsAll',
  'isEmpty',
  'isNotEmpty',
  'isGreater',
  'isGreaterEqual',
  'isLess',
  'isLessEqual',
]);
const TRIGGER_CONTROLS = new Set(['pasteUpdate', 'automationBatchUpdate', 'syncUpdate', 'appendImport', 'openAPIBatchUpdate']);
const TIMER_RULES = new Set(['NO_REPEAT', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'WORKDAY', 'CUSTOM']);
const TIMER_UNITS = new Set(['SECOND', 'MINUTE', 'HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR']);
const REMINDER_UNITS = new Set(['MINUTE', 'HOUR', 'DAY', 'WEEK', 'MONTH']);

// Đầu ra có thể tham chiếu ($.stepId.<pathId>) theo loại bước — schema mục "ref 引用变量详解".
const RECORD_BUILTINS = new Set([
  'startTime',
  'recordId',
  'recordLink',
  'recordCreatedUser',
  'recordCreatedTime',
  'recordModifiedUser',
  'recordModifiedTime',
]);
const BUTTON_FIELD_BUILTINS = new Set([
  'recordId',
  'recordLink',
  'recordCreatedUser',
  'recordModifiedUser',
  'recordModifiedTime',
  'time',
  'user',
  'buttonName',
]);
const BUTTON_ELEMENT_BUILTINS = new Set(['time', 'user', 'buttonName']);
const LARK_MSG_OUTPUTS = new Set([
  'Sender',
  'AtUser',
  'SenderGroup',
  'MessageSendTime',
  'MessageContent',
  'MessageType',
  'MessageID',
  'MessageLink',
  'ParentID',
  'ThreadID',
  'Attachments',
]);
/** Bước KHÔNG có đầu ra — ref tới chúng chắc chắn hỏng ("does not exist in the output path tree"). */
const NO_OUTPUT = new Set(['Delay', 'LarkMessageAction', 'IfElseBranch', 'SwitchBranch']);

/** Kiểu cột Bitable (mã số) → tên đọc được. */
export const FIELD_TYPE_NAMES: Record<number, string> = {
  1: 'Text',
  2: 'Number',
  3: 'SingleSelect',
  4: 'MultiSelect',
  5: 'DateTime',
  7: 'Checkbox',
  11: 'User',
  13: 'Phone',
  15: 'Url',
  17: 'Attachment',
  18: 'SingleLink',
  19: 'Lookup',
  20: 'Formula',
  21: 'DuplexLink',
  22: 'Location',
  23: 'GroupChat',
  1001: 'CreatedTime',
  1002: 'ModifiedTime',
  1003: 'CreatedUser',
  1004: 'ModifiedUser',
  1005: 'AutoNumber',
  3001: 'Button',
};
const SELECT_TYPES = new Set([3, 4]);
const REMINDER_FIELD_TYPES = new Set([5, 1001, 19, 20]);

// ── Hồ sơ Base dùng để kiểm (chỉ phần cần) ─────────────────────────────────────
export interface ProfileField {
  field_id: string;
  name: string;
  type?: number;
  ui_type?: string;
  /** TOÀN BỘ tên lựa chọn (cột select) — để kiểm giá trị option. */
  options?: string[];
}
export interface ProfileTable {
  table_id: string;
  name: string;
  /** undefined = chưa tải cột của bảng này → bỏ qua phần kiểm cột (không coi là lỗi). */
  fields?: ProfileField[];
}
export interface ValidationProfile {
  tables: ProfileTable[];
}

export interface Issue {
  /** Vị trí kiểu `steps[2].data.field_values[0].field_name`. */
  path: string;
  step?: string;
  message: string;
}
export interface ValidationResult {
  ok: boolean;
  errors: Issue[];
  warnings: Issue[];
  /** Tên bảng mà workflow nhắc tới (để nơi gọi tải đúng cột cần kiểm). */
  tables: string[];
}

// ── Gợi ý "có phải ý bạn là…" ─────────────────────────────────────────────────
const fold = (s: string) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[\s_\-·.]+/g, '');

function lev(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Tối đa 3 tên gần nhất (bỏ dấu, bỏ khoảng trắng; chứa nhau cũng tính là gần). */
export function suggestNames(name: string, candidates: string[], max = 3): string[] {
  const n = fold(name);
  if (!n) return [];
  const scored = candidates
    .map((c) => {
      const f = fold(c);
      let d = lev(n, f);
      if (f === n) d = 0;
      else if (f.includes(n) || n.includes(f)) d = Math.min(d, 1);
      return { c, d, lim: Math.max(2, Math.floor(Math.max(n.length, f.length) * 0.4)) };
    })
    .filter((x) => x.d <= x.lim)
    .sort((a, b) => a.d - b.d);
  return [...new Set(scored.map((x) => x.c))].slice(0, max);
}
const didYouMean = (name: string, cands: string[]) => {
  const s = suggestNames(name, cands);
  return s.length ? ` Có phải ý bạn là ${s.map((x) => `«${x}»`).join(' / ')}?` : '';
};

// ── Bộ kiểm ────────────────────────────────────────────────────────────────────
const isObj = (v: unknown): v is Record<string, J> => !!v && typeof v === 'object' && !Array.isArray(v);
const nonEmptyStr = (v: unknown) => typeof v === 'string' && v.trim() !== '';
const nonEmptyArr = (v: unknown) => Array.isArray(v) && v.length > 0;

/** `$.stepId.a.b` → { step:'stepId', segs:['a','b'] } (null nếu không phải dạng ref). */
export function parseRef(value: unknown): { step: string; segs: string[] } | null {
  const v = String(value ?? '').trim();
  if (!v.startsWith('$.')) return null;
  const parts = v.slice(2).split('.');
  if (!parts[0]) return null;
  return { step: parts[0], segs: parts.slice(1) };
}

export interface ValidateOptions {
  profile?: ValidationProfile;
  /** create: bắt buộc có title + ít nhất 1 bước. */
  mode?: 'create' | 'update';
}

/**
 * Kiểm thân request `{ title, steps }`. Lỗi (`errors`) chặn việc gửi; cảnh báo (`warnings`) chỉ báo.
 * Không ném, không sửa dữ liệu.
 */
export function validateWorkflowBody(body: J, opts: ValidateOptions = {}): ValidationResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const tablesMentioned = new Set<string>();
  const err = (path: string, message: string, step?: string) => errors.push({ path, message, step });
  const warn = (path: string, message: string, step?: string) => warnings.push({ path, message, step });
  const mode = opts.mode ?? 'create';
  const profile = opts.profile;

  if (!isObj(body)) {
    err('body', 'Thân workflow phải là một object { title, steps }.');
    return { ok: false, errors, warnings, tables: [] };
  }
  if (body.title !== undefined && typeof body.title !== 'string') err('title', '`title` phải là chuỗi.');
  if (mode === 'create' && !nonEmptyStr(body.title)) err('title', 'Thiếu `title` (tên workflow).');
  if (!Array.isArray(body.steps)) {
    err('steps', '`steps` phải là một mảng các bước.');
    return { ok: false, errors, warnings, tables: [] };
  }
  const steps: J[] = body.steps;
  if (!steps.length) {
    err('steps', 'Workflow cần ít nhất 1 bước (bước đầu tiên là trigger). Gửi `steps` rỗng sẽ XOÁ HẾT các bước.');
    return { ok: false, errors, warnings, tables: [] };
  }

  // 1) id duy nhất + loại bước hợp lệ.
  const idIndex = new Map<string, number>();
  steps.forEach((s, i) => {
    const p = `steps[${i}]`;
    if (!isObj(s)) {
      err(p, 'Mỗi bước phải là một object.');
      return;
    }
    if (!nonEmptyStr(s.id)) err(`${p}.id`, 'Thiếu `id` của bước (chuỗi tự đặt, vd "step_trigger").');
    else if (idIndex.has(s.id)) err(`${p}.id`, `id "${s.id}" bị trùng với steps[${idIndex.get(s.id)}] — mỗi bước cần id riêng (trùng id là nguyên nhân hay gặp của lỗi [2200] Internal Error).`, s.id);
    else idIndex.set(s.id, i);
    const t = String(s.type ?? '');
    if (!t) err(`${p}.type`, 'Thiếu `type` của bước.', s.id);
    else if (!KNOWN.has(t)) {
      const alias = TYPE_ALIASES[t];
      const near = alias ? [alias] : suggestNames(t, [...STEP_TYPES]);
      err(`${p}.type`, `Loại bước "${t}" không tồn tại (Lark sẽ báo "Undefined Step Type").${near.length ? ` Dùng "${near[0]}".` : ''} Các loại hợp lệ: ${STEP_TYPES.join(', ')}.`, s.id);
    }
    if (!isObj(s.data)) err(`${p}.data`, '`data` (cấu hình của bước) là bắt buộc và phải là object.', s.id);
    if (s.title !== undefined && s.title !== null && typeof s.title !== 'string') err(`${p}.title`, '`title` của bước phải là chuỗi.', s.id);
  });

  // 2) Đúng MỘT trigger, và nó đứng đầu.
  const triggerIdx = steps.map((s, i) => (isObj(s) && TRIGGERS.has(String(s.type)) ? i : -1)).filter((i) => i >= 0);
  if (triggerIdx.length === 0) err('steps', `Workflow phải có đúng 1 trigger (${TRIGGER_TYPES.join(' / ')}) ở bước đầu tiên.`);
  else if (triggerIdx.length > 1) err('steps', `Chỉ được có 1 trigger — đang có ${triggerIdx.length} (steps[${triggerIdx.join('], steps[')}]). Tách thành nhiều workflow nếu cần nhiều cách kích hoạt.`);
  else if (triggerIdx[0] !== 0) err(`steps[${triggerIdx[0]}]`, 'Trigger phải là bước ĐẦU TIÊN trong mảng `steps`.', steps[triggerIdx[0]]?.id);

  // 3) next / children trỏ tới bước có thật.
  const edges = new Map<string, string[]>();
  steps.forEach((s, i) => {
    if (!isObj(s) || !nonEmptyStr(s.id)) return;
    const p = `steps[${i}]`;
    const out: string[] = [];
    const type = String(s.type ?? '');
    if (s.next !== undefined && s.next !== null) {
      if (typeof s.next !== 'string' || !s.next) err(`${p}.next`, '`next` phải là id của bước kế tiếp, hoặc null khi kết thúc.', s.id);
      else if (s.next === s.id) err(`${p}.next`, 'Bước không được trỏ `next` về chính nó.', s.id);
      else if (!idIndex.has(s.next)) err(`${p}.next`, `\`next\` trỏ tới bước "${s.next}" không tồn tại.${didYouMean(s.next, [...idIndex.keys()])}`, s.id);
      else out.push(s.next);
    }
    const links: J[] | null = isObj(s.children) ? (Array.isArray(s.children.links) ? s.children.links : null) : null;
    if (s.children !== undefined && s.children !== null && (!isObj(s.children) || !Array.isArray(s.children.links)))
      err(`${p}.children`, '`children` phải có dạng { "links": [ … ] }.', s.id);
    if ((TRIGGERS.has(type) || ACTIONS.has(type)) && links && links.length)
      err(`${p}.children`, `${type} không được có \`children\` — trigger/hành động chỉ nối bằng \`next\`.`, s.id);
    if (CONTAINERS.has(type) && (!links || !links.length))
      err(`${p}.children.links`, `${type} bắt buộc có \`children.links\` (${type === 'Loop' ? 'một link kind "loop_start" trỏ vào thân vòng lặp' : 'các nhánh'}).`, s.id);
    (links || []).forEach((l, j) => {
      const lp = `${p}.children.links[${j}]`;
      if (!isObj(l)) {
        err(lp, 'Mỗi link phải là object { kind, to }.', s.id);
        return;
      }
      if (!LINK_KINDS.has(String(l.kind))) err(`${lp}.kind`, `kind "${l.kind}" không hợp lệ (if_true / if_false / case / loop_start).`, s.id);
      if (!nonEmptyStr(l.to)) err(`${lp}.to`, '`to` (id bước đích) không được trống.', s.id);
      else if (l.to === s.id) err(`${lp}.to`, 'Link không được trỏ về chính bước này.', s.id);
      else if (!idIndex.has(l.to)) err(`${lp}.to`, `\`to\` trỏ tới bước "${l.to}" không tồn tại.${didYouMean(l.to, [...idIndex.keys()])}`, s.id);
      else out.push(l.to);
    });
    edges.set(s.id, out);
  });

  // 4) Không có vòng (đồ thị phải là DAG) + mọi bước đi tới được từ trigger.
  const color = new Map<string, number>();
  let cycleAt: string | null = null;
  const dfs = (u: string) => {
    if (cycleAt) return;
    color.set(u, 1);
    for (const v of edges.get(u) || []) {
      if (color.get(v) === 1) {
        cycleAt = `${u} → ${v}`;
        return;
      }
      if (!color.get(v)) dfs(v);
    }
    color.set(u, 2);
  };
  for (const id of idIndex.keys()) if (!color.get(id)) dfs(id);
  if (cycleAt) err('steps', `Luồng có VÒNG LẶP vô hạn (${cycleAt}). Muốn lặp thì dùng bước Loop, không nối ngược bằng next.`);
  const start = isObj(steps[0]) && nonEmptyStr(steps[0].id) ? steps[0].id : null;
  if (start && !cycleAt) {
    const reach = new Set<string>([start]);
    const queue = [start];
    while (queue.length) for (const v of edges.get(queue.shift()!) || []) if (!reach.has(v)) (reach.add(v), queue.push(v));
    for (const [id, i] of idIndex) if (!reach.has(id)) warn(`steps[${i}]`, `Bước "${id}" không nối vào luồng từ trigger (không bước nào trỏ \`next\`/\`children\` tới nó) — nó sẽ không bao giờ chạy.`, id);
  }

  // 5) Cấu hình riêng từng loại + bảng/cột + ref.
  const tableOf = (name: string) => profile?.tables.find((t) => t.name === name);
  const stepTable = new Map<string, string>();
  steps.forEach((s) => {
    if (isObj(s) && nonEmptyStr(s.id) && isObj(s.data) && nonEmptyStr(s.data.table_name)) stepTable.set(s.id, s.data.table_name);
  });

  const checkTable = (p: string, name: unknown, stepId?: string): ProfileTable | undefined => {
    if (!nonEmptyStr(name)) return undefined;
    tablesMentioned.add(String(name));
    if (!profile) return undefined;
    const t = tableOf(String(name));
    if (!t) {
      err(p, `Bảng «${name}» không có trong Base.${didYouMean(String(name), profile.tables.map((x) => x.name))}${profile.tables.length <= 30 ? ` Các bảng hiện có: ${profile.tables.map((x) => `«${x.name}»`).join(', ')}.` : ''}`, stepId);
    }
    return t;
  };
  const checkField = (p: string, table: ProfileTable | undefined, name: unknown, stepId?: string): ProfileField | undefined => {
    if (!table?.fields || !nonEmptyStr(name)) return undefined;
    const f = table.fields.find((x) => x.name === name);
    if (f) return f;
    const byId = table.fields.find((x) => x.field_id === name);
    if (byId) {
      err(p, `Ở đây cần TÊN cột, không phải field_id: dùng «${byId.name}» thay cho "${name}".`, stepId);
      return undefined;
    }
    err(p, `Bảng «${table.name}» không có cột «${name}».${didYouMean(String(name), table.fields.map((x) => x.name))}`, stepId);
    return undefined;
  };
  /** value_type phải hợp với kiểu cột (lỗi Lark "valueType 'text' not allowed for fieldType '3'"). */
  const checkValueForField = (p: string, f: ProfileField | undefined, value: J, stepId?: string) => {
    if (!f || !Array.isArray(value)) return;
    if (f.type !== undefined && SELECT_TYPES.has(f.type)) {
      value.forEach((v, k) => {
        if (!isObj(v)) return;
        if (v.value_type === 'text' || v.value_type === 'number')
          err(`${p}[${k}]`, `Cột «${f.name}» là cột LỰA CHỌN — giá trị phải có value_type "option" ({ "value_type":"option", "value":{"name":"…"} }), không phải "${v.value_type}".`, stepId);
        if (v.value_type === 'option' && f.options?.length) {
          const nm = isObj(v.value) ? v.value.name : undefined;
          if (nm && !f.options.includes(nm))
            warn(`${p}[${k}]`, `Cột «${f.name}» chưa có lựa chọn “${nm}”.${didYouMean(String(nm), f.options)}`, stepId);
        }
      });
    }
  };
  /** Điều kiện trên cột của một bảng: { field_name, operator, value }. */
  const checkFieldCond = (p: string, table: ProfileTable | undefined, c: J, stepId?: string, opRequired = true) => {
    if (!isObj(c)) {
      err(p, 'Điều kiện phải là object { field_name, operator, value }.', stepId);
      return;
    }
    if (!nonEmptyStr(c.field_name)) err(`${p}.field_name`, 'Điều kiện thiếu `field_name`.', stepId);
    if (c.operator === undefined) {
      if (opRequired) err(`${p}.operator`, 'Điều kiện thiếu `operator`.', stepId);
    }
    const f = checkField(`${p}.field_name`, table, c.field_name, stepId);
    checkValueForField(`${p}.value`, f, c.value, stepId);
  };
  /** AndCondition[] của trigger: [] là lỗi Lark "recordInfo.conditions must be non-empty". */
  const checkConditionList = (p: string, list: J, table: ProfileTable | undefined, stepId?: string, required = false) => {
    if (list === undefined || list === null) {
      if (required) err(p, '`condition_list` là bắt buộc và không được rỗng với loại trigger này.', stepId);
      return;
    }
    if (!Array.isArray(list)) {
      err(p, '`condition_list` phải là mảng các nhóm { conjunction:"and", conditions:[…] }, hoặc null.', stepId);
      return;
    }
    if (!list.length) {
      err(p, required ? '`condition_list` không được rỗng.' : '`condition_list` rỗng `[]` bị Lark từ chối — dùng null hoặc bỏ hẳn trường này.', stepId);
      return;
    }
    list.forEach((g, k) => {
      const gp = `${p}[${k}]`;
      if (!isObj(g) || !Array.isArray(g.conditions) || !g.conditions.length) {
        err(gp, 'Mỗi nhóm điều kiện cần { conjunction:"and", conditions:[ít nhất 1 điều kiện] }.', stepId);
        return;
      }
      if (g.conjunction !== undefined && String(g.conjunction).toLowerCase() !== 'and')
        err(`${gp}.conjunction`, 'Trong một nhóm, các điều kiện chỉ nối bằng "and" (các nhóm với nhau là HOẶC).', stepId);
      g.conditions.forEach((c: J, m: number) => checkFieldCond(`${gp}.conditions[${m}]`, table, c, stepId));
    });
  };
  /** RecordFilterInfo: conjunction chỉ "and". */
  const checkFilterInfo = (p: string, fi: J, table: ProfileTable | undefined, stepId?: string) => {
    if (!isObj(fi)) {
      err(p, '`filter_info` phải là object { conjunction:"and", conditions:[…] }.', stepId);
      return;
    }
    if (fi.conjunction !== undefined && String(fi.conjunction).toLowerCase() !== 'and')
      err(`${p}.conjunction`, '`filter_info.conjunction` chỉ hỗ trợ "and". Cần "A hoặc B" trên một cột thì dùng operator containsAny.', stepId);
    if (!Array.isArray(fi.conditions)) err(`${p}.conditions`, '`filter_info.conditions` phải là mảng.', stepId);
    else fi.conditions.forEach((c: J, m: number) => checkFieldCond(`${p}.conditions[${m}]`, table, c, stepId));
  };
  /** OrGroup của nhánh: { conjunction:"or", conditions:[ { conjunction:"and", conditions:[ {left_value, operator, right_value} ] } ] }. */
  const checkOrGroup = (p: string, g: J, stepId?: string) => {
    if (!isObj(g) || !Array.isArray(g.conditions) || !g.conditions.length) {
      err(p, 'Điều kiện nhánh phải có dạng { conjunction:"or", conditions:[ { conjunction:"and", conditions:[ { left_value, operator, right_value } ] } ] }.', stepId);
      return;
    }
    g.conditions.forEach((and: J, k: number) => {
      const ap = `${p}.conditions[${k}]`;
      if (!isObj(and) || !Array.isArray(and.conditions) || !and.conditions.length) {
        err(ap, 'Mỗi nhóm "and" cần ít nhất 1 điều kiện.', stepId);
        return;
      }
      and.conditions.forEach((c: J, m: number) => {
        const cp = `${ap}.conditions[${m}]`;
        if (!isObj(c)) return err(cp, 'Điều kiện phải là object.', stepId);
        if (!isObj(c.left_value)) err(`${cp}.left_value`, 'Thiếu `left_value` (thường là một ref tới cột của bước trước).', stepId);
        if (!nonEmptyStr(c.operator)) err(`${cp}.operator`, 'Thiếu `operator`.', stepId);
        else if (c.operator !== 'isEmpty' && c.operator !== 'isNotEmpty' && !nonEmptyArr(c.right_value))
          warn(`${cp}.right_value`, `operator "${c.operator}" thường cần \`right_value\` (mảng ValueInfo).`, stepId);
      });
    });
  };
  const checkValueList = (p: string, v: J, stepId: string | undefined, what: string, required = true) => {
    if (v === undefined || v === null) {
      if (required) err(p, `Thiếu \`${what}\` (mảng ValueInfo, vd [{ "value_type":"text", "value":"…" }]).`, stepId);
      return;
    }
    if (!Array.isArray(v)) err(p, `\`${what}\` phải là MẢNG ValueInfo.`, stepId);
    else if (required && !v.length) err(p, `\`${what}\` không được rỗng.`, stepId);
  };
  const checkFieldValues = (p: string, fv: J, table: ProfileTable | undefined, stepId?: string) => {
    if (!nonEmptyArr(fv)) {
      err(p, '`field_values` phải là mảng KHÔNG rỗng: [{ "field_name":"…", "value":[ValueInfo…] }].', stepId);
      return;
    }
    fv.forEach((x: J, k: number) => {
      const xp = `${p}[${k}]`;
      if (!isObj(x) || !nonEmptyStr(x.field_name)) return err(`${xp}.field_name`, 'Mỗi phần tử cần `field_name` (TÊN cột).', stepId);
      checkValueList(`${xp}.value`, x.value, stepId, 'value');
      const f = checkField(`${xp}.field_name`, table, x.field_name, stepId);
      checkValueForField(`${xp}.value`, f, x.value, stepId);
    });
  };
  const checkLocator = (p: string, d: J, table: ProfileTable | undefined, stepId: string | undefined, idx: number) => {
    const hasF = d.filter_info !== undefined && d.filter_info !== null;
    const hasR = d.ref_info !== undefined && d.ref_info !== null;
    if (!hasF && !hasR) err(p, 'Cần MỘT trong hai: `filter_info` (lọc bản ghi) hoặc `ref_info` ({ "step_id":"<bước trước>" } — dùng bản ghi của bước đó).', stepId);
    if (hasF && hasR) err(p, '`filter_info` và `ref_info` loại trừ nhau — chỉ giữ một.', stepId);
    if (hasF) checkFilterInfo(`${p}.filter_info`, d.filter_info, table, stepId);
    if (hasR) {
      const sid = isObj(d.ref_info) ? d.ref_info.step_id : undefined;
      if (!nonEmptyStr(sid)) err(`${p}.ref_info.step_id`, '`ref_info.step_id` phải là id của một bước trước.', stepId);
      else if (!idIndex.has(sid)) err(`${p}.ref_info.step_id`, `ref_info trỏ tới bước "${sid}" không tồn tại.`, stepId);
      else if (idIndex.get(sid)! >= idx) err(`${p}.ref_info.step_id`, `ref_info phải trỏ tới bước ĐỨNG TRƯỚC ("${sid}" đứng sau).`, stepId);
    }
  };

  steps.forEach((s, i) => {
    if (!isObj(s) || !isObj(s.data)) return;
    const d = s.data;
    const sid: string | undefined = nonEmptyStr(s.id) ? s.id : undefined;
    const p = `steps[${i}].data`;
    const type = String(s.type ?? '');
    const need = (k: string, what = 'chuỗi') => {
      if (d[k] === undefined || d[k] === null || (typeof d[k] === 'string' && !d[k].trim())) err(`${p}.${k}`, `Thiếu \`${k}\` (${what}) cho ${type}.`, sid);
    };
    const T = () => checkTable(`${p}.table_name`, d.table_name, sid);
    const triggerControls = () => {
      if (d.trigger_control_list === undefined || d.trigger_control_list === null) return;
      if (!Array.isArray(d.trigger_control_list)) return err(`${p}.trigger_control_list`, 'phải là mảng.', sid);
      d.trigger_control_list.forEach((c: J, k: number) => {
        if (!TRIGGER_CONTROLS.has(String(c))) err(`${p}.trigger_control_list[${k}]`, `"${c}" không hợp lệ (${[...TRIGGER_CONTROLS].join(' / ')}).`, sid);
      });
    };

    switch (type) {
      case 'AddRecordTrigger': {
        need('table_name', 'tên bảng');
        need('watched_field_name', 'tên cột theo dõi');
        const t = T();
        checkField(`${p}.watched_field_name`, t, d.watched_field_name, sid);
        triggerControls();
        checkConditionList(`${p}.condition_list`, d.condition_list, t, sid);
        break;
      }
      case 'ChangeRecordTrigger': {
        need('table_name', 'tên bảng');
        const t = T();
        triggerControls();
        checkConditionList(`${p}.condition_list`, d.condition_list, t, sid, true);
        break;
      }
      case 'SetRecordTrigger': {
        need('table_name', 'tên bảng');
        const t = T();
        if (!nonEmptyArr(d.field_watch_info)) err(`${p}.field_watch_info`, '`field_watch_info` cần ít nhất 1 cột theo dõi: [{ "field_name":"…" }].', sid);
        else d.field_watch_info.forEach((c: J, k: number) => checkFieldCond(`${p}.field_watch_info[${k}]`, t, c, sid, false));
        if (Array.isArray(d.record_watch_info)) d.record_watch_info.forEach((c: J, k: number) => checkFieldCond(`${p}.record_watch_info[${k}]`, t, c, sid));
        if (d.record_watch_conjunction !== undefined && !['and', 'or'].includes(String(d.record_watch_conjunction)))
          err(`${p}.record_watch_conjunction`, 'chỉ nhận "and" hoặc "or".', sid);
        triggerControls();
        checkConditionList(`${p}.condition_list`, d.condition_list, t, sid);
        break;
      }
      case 'TimerTrigger': {
        if (!TIMER_RULES.has(String(d.rule))) err(`${p}.rule`, `\`rule\` phải là một trong ${[...TIMER_RULES].join(' / ')}.`, sid);
        if (d.start_time !== undefined && d.start_time !== null && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(String(d.start_time)))
          err(`${p}.start_time`, '`start_time` phải có dạng "yyyy-MM-dd HH:mm".', sid);
        if (d.rule === 'CUSTOM') {
          const n = Number(d.interval);
          if (!Number.isInteger(n) || n < 1 || n > 30) err(`${p}.interval`, 'rule CUSTOM cần `interval` nguyên trong [1, 30].', sid);
          if (!TIMER_UNITS.has(String(d.unit))) err(`${p}.unit`, `rule CUSTOM cần \`unit\` (${[...TIMER_UNITS].join(' / ')}).`, sid);
        }
        if (d.sub_unit !== undefined && d.sub_unit !== null) {
          if (!Array.isArray(d.sub_unit)) err(`${p}.sub_unit`, '`sub_unit` phải là mảng số.', sid);
          else if (d.rule === 'WEEKLY' && d.sub_unit.some((x: J) => !Number.isInteger(x) || x < 0 || x > 6)) err(`${p}.sub_unit`, 'WEEKLY: `sub_unit` là thứ trong tuần 0–6.', sid);
          else if (d.rule === 'MONTHLY' && d.sub_unit.some((x: J) => !Number.isInteger(x) || x < 1 || x > 31)) err(`${p}.sub_unit`, 'MONTHLY: `sub_unit` là ngày trong tháng 1–31.', sid);
        }
        break;
      }
      case 'ReminderTrigger': {
        need('table_name', 'tên bảng');
        need('field_name', 'tên cột NGÀY');
        const t = T();
        const f = checkField(`${p}.field_name`, t, d.field_name, sid);
        if (f?.type !== undefined && !REMINDER_FIELD_TYPES.has(f.type)) {
          if (f.type === 1002) warn(`${p}.field_name`, `Cột «${f.name}» là "Ngày sửa" — ReminderTrigger thường dùng cột ngày/ngày tạo/công thức/tra cứu.`, sid);
          else err(`${p}.field_name`, `Cột «${f.name}» (${FIELD_TYPE_NAMES[f.type] ?? f.type}) không phải cột ngày — ReminderTrigger cần cột DateTime / Ngày tạo / Công thức / Tra cứu.`, sid);
        }
        const unit = String(d.unit ?? '');
        if (!REMINDER_UNITS.has(unit)) err(`${p}.unit`, `\`unit\` phải là ${[...REMINDER_UNITS].join(' / ')}.`, sid);
        const off = Number(d.offset);
        if (d.offset === undefined || d.offset === null || !Number.isInteger(off)) err(`${p}.offset`, '`offset` là số nguyên (âm = nhắc TRƯỚC, dương = SAU).', sid);
        else {
          const okOff =
            unit === 'MINUTE'
              ? [0, 5, 15, 30, -5, -15, -30].includes(off)
              : unit === 'HOUR'
                ? off !== 0 && Math.abs(off) <= 6
                : unit === 'DAY'
                  ? Math.abs(off) <= 7
                  : unit === 'WEEK' || unit === 'MONTH'
                    ? off !== 0 && Math.abs(off) <= 7
                    : true;
          if (!okOff) err(`${p}.offset`, `offset ${off} không hợp lệ với unit ${unit} (MINUTE ∈ {0,±5,±15,±30}; HOUR ∈ ±1..6; DAY ∈ -7..7; WEEK/MONTH ∈ ±1..7).`, sid);
        }
        const h = Number(d.hour);
        const m = Number(d.minute);
        if (!Number.isInteger(h) || h < 0 || h > 23) err(`${p}.hour`, '`hour` bắt buộc, 0–23.', sid);
        if (!Number.isInteger(m) || m < 0 || m > 59) err(`${p}.minute`, '`minute` bắt buộc, 0–59.', sid);
        checkConditionList(`${p}.condition_list`, d.condition_list, t, sid);
        break;
      }
      case 'ButtonTrigger': {
        if (!['buttonField', 'buttonElement'].includes(String(d.button_type))) err(`${p}.button_type`, '`button_type` phải là "buttonField" (nút trên bản ghi) hoặc "buttonElement" (nút trên trang/dashboard).', sid);
        if (d.button_type === 'buttonField') {
          if (!nonEmptyStr(d.table_name)) warn(`${p}.table_name`, 'buttonField nên có `table_name` (bảng chứa nút) để dùng được dữ liệu bản ghi.', sid);
          else T();
        }
        break;
      }
      case 'LarkMessageTrigger': {
        if (!['group', 'chat'].includes(String(d.receive_scene))) err(`${p}.receive_scene`, '`receive_scene` phải là "group" hoặc "chat".', sid);
        checkValueList(`${p}.receiver`, d.receiver, sid, 'receiver');
        if (d.receive_scene === 'group' && !['at', 'all'].includes(String(d.scope))) err(`${p}.scope`, 'Nhóm chat cần `scope` "at" (khi @bot) hoặc "all".', sid);
        if (d.receive_scene === 'chat' && d.scope !== undefined) warn(`${p}.scope`, 'Chat riêng không dùng `scope` — nên bỏ.', sid);
        if (!isObj(d.filter)) err(`${p}.filter`, '`filter` (MessageFilter) là bắt buộc, vd { "conjunction":"and", "content_contains":[] }.', sid);
        break;
      }
      case 'AddRecordAction': {
        need('table_name', 'tên bảng');
        const t = T();
        checkFieldValues(`${p}.field_values`, d.field_values, t, sid);
        break;
      }
      case 'SetRecordAction': {
        need('table_name', 'tên bảng');
        const t = T();
        checkFieldValues(`${p}.field_values`, d.field_values, t, sid);
        checkLocator(p, d, t, sid, i);
        if (d.max_set_record_num !== undefined) {
          const n = Number(d.max_set_record_num);
          if (!Number.isInteger(n) || n < 1 || n > 15000) err(`${p}.max_set_record_num`, '`max_set_record_num` trong [1, 15000].', sid);
        }
        break;
      }
      case 'FindRecordAction': {
        need('table_name', 'tên bảng');
        const t = T();
        if (!nonEmptyArr(d.field_names)) err(`${p}.field_names`, '`field_names` cần ít nhất 1 TÊN cột cần lấy.', sid);
        else d.field_names.forEach((n: J, k: number) => checkField(`${p}.field_names[${k}]`, t, n, sid));
        checkLocator(p, d, t, sid, i);
        break;
      }
      case 'HTTPClientAction': {
        checkValueList(`${p}.url`, d.url, sid, 'url');
        if (d.method !== undefined && !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(String(d.method))) err(`${p}.method`, '`method` phải là GET/POST/PUT/PATCH/DELETE.', sid);
        if (d.body_type !== undefined && !['none', 'raw', 'form-data', 'form-urlencoded'].includes(String(d.body_type))) err(`${p}.body_type`, '`body_type` phải là none/raw/form-data/form-urlencoded.', sid);
        const rt = d.response_type ?? 'json';
        if (!['none', 'text', 'json'].includes(String(rt))) err(`${p}.response_type`, '`response_type` phải là none/text/json.', sid);
        if (rt === 'json') {
          if (!nonEmptyStr(d.response_value)) err(`${p}.response_value`, 'response_type "json" (mặc định) bắt buộc có `response_value` — CHUỖI JSON mẫu của phản hồi, vd "{\\"success\\":true}". Không cần đọc phản hồi thì đặt response_type "none".', sid);
          else {
            try {
              JSON.parse(d.response_value);
            } catch {
              err(`${p}.response_value`, '`response_value` phải là chuỗi JSON hợp lệ.', sid);
            }
          }
        }
        break;
      }
      case 'Delay': {
        const n = Number(d.duration);
        if (!Number.isFinite(n) || n < 1 || n > 120) err(`${p}.duration`, '`duration` (phút) bắt buộc, trong [1, 120].', sid);
        break;
      }
      case 'LarkMessageAction': {
        if (typeof d.send_to_everyone !== 'boolean') err(`${p}.send_to_everyone`, '`send_to_everyone` (true/false) là bắt buộc.', sid);
        checkValueList(`${p}.receiver`, d.receiver, sid, 'receiver', d.send_to_everyone !== true);
        checkValueList(`${p}.content`, d.content, sid, 'content');
        if (!Array.isArray(d.btn_list)) err(`${p}.btn_list`, '`btn_list` là bắt buộc — để [] nếu không cần nút.', sid);
        else
          d.btn_list.forEach((b: J, k: number) => {
            const bp = `${p}.btn_list[${k}]`;
            if (!isObj(b)) return err(bp, 'Nút phải là object.', sid);
            if (!['addRecord', 'setRecord', 'openLink'].includes(String(b.btn_action))) err(`${bp}.btn_action`, '`btn_action` phải là addRecord / setRecord / openLink.', sid);
            if (b.btn_action === 'openLink') checkValueList(`${bp}.link`, b.link, sid, 'link');
            if (b.btn_action === 'addRecord') {
              const t = checkTable(`${bp}.table_name`, b.table_name, sid);
              if (Array.isArray(b.record_values)) b.record_values.forEach((x: J, m: number) => checkField(`${bp}.record_values[${m}].field_name`, t, x?.field_name, sid));
            }
          });
        break;
      }
      case 'GenerateAiTextAction':
        checkValueList(`${p}.prompt`, d.prompt, sid, 'prompt');
        break;
      case 'AIAnalysisAction': {
        checkValueList(`${p}.analysis_task`, d.analysis_task, sid, 'analysis_task');
        // Luật của CLI (workflow_ai_analysis_validate.go).
        if (d.analysis_table_names !== undefined) {
          if (!Array.isArray(d.analysis_table_names)) err(`${p}.analysis_table_names`, 'phải là mảng chuỗi (tên bảng).', sid);
          else
            d.analysis_table_names.forEach((n: J, k: number) => {
              if (typeof n !== 'string') err(`${p}.analysis_table_names[${k}]`, 'phải là chuỗi.', sid);
              else checkTable(`${p}.analysis_table_names[${k}]`, n, sid);
            });
        }
        if (!['maker', 'triggerPersonal'].includes(String(d.identity_type))) err(`${p}.identity_type`, '`identity_type` bắt buộc: "maker" hoặc "triggerPersonal".', sid);
        break;
      }
      case 'IfElseBranch': {
        checkOrGroup(`${p}.condition`, d.condition, sid);
        const links: J[] = isObj(s.children) && Array.isArray(s.children.links) ? s.children.links : [];
        const kinds = links.map((l) => l?.kind);
        const t = kinds.filter((k) => k === 'if_true').length;
        const f = kinds.filter((k) => k === 'if_false').length;
        if (links.length && (t !== 1 || f !== 1 || links.length !== 2))
          err(`steps[${i}].children.links`, 'IfElseBranch cần ĐÚNG 2 link: một kind "if_true" và một kind "if_false". 3 nhánh trở lên thì dùng SwitchBranch.', sid);
        break;
      }
      case 'SwitchBranch': {
        const list = d.child_branch_list;
        if (!Array.isArray(list) || list.length < 1 || list.length > 10) err(`${p}.child_branch_list`, '`child_branch_list` cần 1–10 nhánh { name, condition }.', sid);
        else
          list.forEach((b: J, k: number) => {
            if (!isObj(b) || !nonEmptyStr(b.name)) err(`${p}.child_branch_list[${k}].name`, 'Mỗi nhánh cần `name`.', sid);
            checkOrGroup(`${p}.child_branch_list[${k}].condition`, b?.condition, sid);
          });
        if (d.mode !== undefined && !['exclusive', 'parallel'].includes(String(d.mode))) err(`${p}.mode`, '`mode` là "exclusive" hoặc "parallel".', sid);
        if (d.no_match_action !== undefined && !['classifyToOther', 'fail'].includes(String(d.no_match_action))) err(`${p}.no_match_action`, '`no_match_action` là "classifyToOther" hoặc "fail".', sid);
        const links: J[] = isObj(s.children) && Array.isArray(s.children.links) ? s.children.links : [];
        if (links.some((l) => l?.kind !== 'case')) err(`steps[${i}].children.links`, 'Mọi link của SwitchBranch phải có kind "case".', sid);
        if (Array.isArray(list) && links.length) {
          const n = list.length;
          const exclusive = (d.mode ?? 'exclusive') === 'exclusive';
          const action = d.no_match_action ?? 'classifyToOther';
          if (!exclusive && links.length !== n) err(`steps[${i}].children.links`, `Chế độ parallel: cần đúng ${n} link "case" (mỗi nhánh một link).`, sid);
          else if (exclusive && action === 'fail' && links.length !== n) err(`steps[${i}].children.links`, `no_match_action "fail": cần đúng ${n} link "case", không có nhánh "khác".`, sid);
          else if (exclusive && action === 'classifyToOther') {
            if (links.length < n || links.length > n + 1) err(`steps[${i}].children.links`, `Có ${n} nhánh điều kiện → cần ${n} link "case" (+1 link cuối cho nhánh "khác").`, sid);
            else if (links.length === n) warn(`steps[${i}].children.links`, 'no_match_action "classifyToOther" nhưng chưa có link cho nhánh "khác" (link "case" cuối cùng) — bản ghi không khớp nhánh nào sẽ không đi đâu.', sid);
          }
        }
        break;
      }
      case 'AIClassificationBranch':
        validateAIClassification(s, i, idIndex, err);
        break;
      case 'Loop': {
        const links: J[] = isObj(s.children) && Array.isArray(s.children.links) ? s.children.links : [];
        if (links.length && (links.length !== 1 || links[0]?.kind !== 'loop_start'))
          err(`steps[${i}].children.links`, 'Loop cần đúng 1 link kind "loop_start" trỏ vào bước đầu của thân vòng lặp.', sid);
        if (!Array.isArray(d.data) || d.data.length !== 1 || d.data[0]?.value_type !== 'ref')
          err(`${p}.data`, 'Loop.data phải là mảng ĐÚNG 1 phần tử ref, vd [{ "value_type":"ref", "value":"$.<bước tìm bản ghi>.fieldRecords" }].', sid);
        if (d.loop_mode !== undefined && !['end', 'continue'].includes(String(d.loop_mode))) err(`${p}.loop_mode`, '`loop_mode` là "end" hoặc "continue".', sid);
        break;
      }
      default:
        break;
    }

    // ValueInfo + ref + operator ở MỌI chỗ trong data.
    walkValues(d, p, (node, np) => {
      if (Object.prototype.hasOwnProperty.call(node, 'operator') && node.operator !== undefined && !OPERATORS.has(String(node.operator)))
        err(`${np}.operator`, `operator "${node.operator}" không hợp lệ (${[...OPERATORS].join(' / ')}).`, sid);
      if (!Object.prototype.hasOwnProperty.call(node, 'value_type')) return;
      const vt = String(node.value_type);
      if (!VALUE_TYPES.has(vt)) {
        warn(`${np}.value_type`, `value_type "${vt}" không có trong tài liệu (${[...VALUE_TYPES].join(' / ')}).`, sid);
        return;
      }
      if (vt === 'user' && isObj(node.value) && nonEmptyStr(node.value.id) && !/^ou_/.test(node.value.id))
        warn(`${np}.value.id`, `Người dùng phải theo open_id "ou_…" (đang là "${node.value.id}") — lấy bằng contacts_batch_get_id.`, sid);
      if (vt === 'group' && isObj(node.value) && nonEmptyStr(node.value.id) && !/^oc_/.test(node.value.id))
        warn(`${np}.value.id`, `Nhóm chat phải theo chat_id "oc_…" (đang là "${node.value.id}") — lấy bằng messaging_list_chats.`, sid);
      if (vt === 'ref') checkRef(np, node.value, i, sid);
    });
  });

  function checkRef(p: string, value: J, idx: number, sid?: string) {
    const r = parseRef(value);
    if (!r) {
      err(`${p}.value`, `ref phải có dạng "$.<id bước>.<đường dẫn>" (đang là ${JSON.stringify(value)}).`, sid);
      return;
    }
    const at = idIndex.get(r.step);
    if (at === undefined) {
      err(`${p}.value`, `ref "${value}" trỏ tới bước "${r.step}" không tồn tại.${didYouMean(r.step, [...idIndex.keys()])}`, sid);
      return;
    }
    if (at >= idx) {
      err(`${p}.value`, `ref "${value}" phải trỏ tới bước ĐỨNG TRƯỚC (bước "${r.step}" là steps[${at}], còn đây là steps[${idx}]).`, sid);
      return;
    }
    const target = steps[at];
    const tt = String(target?.type ?? '');
    const seg = r.segs[0];
    const bad = (msg: string) => err(`${p}.value`, `ref "${value}": ${msg}`, sid);
    if (NO_OUTPUT.has(tt)) return bad(`bước ${tt} không có đầu ra nào để tham chiếu.`);
    const fieldSeg = (table: string | undefined, s: string | undefined, builtins: Set<string>, label: string) => {
      if (s === undefined) return;
      if (builtins.has(s)) return;
      checkFieldIdSeg(p, value, table, s, label, sid);
    };
    switch (tt) {
      case 'AddRecordTrigger':
      case 'ChangeRecordTrigger':
      case 'SetRecordTrigger':
      case 'ReminderTrigger':
        return fieldSeg(stepTable.get(r.step), seg, RECORD_BUILTINS, 'cột của bản ghi kích hoạt');
      case 'ButtonTrigger':
        if (target?.data?.button_type === 'buttonElement') {
          if (seg !== undefined && !BUTTON_ELEMENT_BUILTINS.has(seg)) bad(`nút buttonElement chỉ có ${[...BUTTON_ELEMENT_BUILTINS].join(' / ')}.`);
          return;
        }
        return fieldSeg(stepTable.get(r.step), seg, BUTTON_FIELD_BUILTINS, 'cột của bản ghi có nút');
      case 'TimerTrigger':
        if (seg !== 'scheduleTime') bad('TimerTrigger chỉ có đầu ra "scheduleTime".');
        return;
      case 'LarkMessageTrigger':
        if (!seg || !LARK_MSG_OUTPUTS.has(seg)) bad(`LarkMessageTrigger có các đầu ra: ${[...LARK_MSG_OUTPUTS].join(', ')}.`);
        return;
      case 'GenerateAiTextAction':
        if (seg !== undefined) bad(`GenerateAiTextAction chỉ tham chiếu được cả khối "$.${r.step}".`);
        return;
      case 'AIAnalysisAction':
        if (seg !== 'analysisResult') bad('AIAnalysisAction chỉ có đầu ra "analysisResult".');
        return;
      case 'HTTPClientAction': {
        const rt = target?.data?.response_type ?? 'json';
        if (rt === 'none') return bad('HTTPClientAction có response_type "none" nên không có đầu ra.');
        if (rt === 'text') {
          if (seg !== undefined) bad(`response_type "text": chỉ tham chiếu được "$.${r.step}".`);
          return;
        }
        if (seg !== 'body' && seg !== 'status_code') return bad('response_type "json": dùng "$.<id>.body", "$.<id>.body.<khoá>" hoặc "$.<id>.status_code".');
        if (seg === 'body' && r.segs[1] !== undefined) {
          let declared: J = null;
          try {
            declared = JSON.parse(String(target?.data?.response_value ?? ''));
          } catch {
            /* response_value hỏng đã báo ở bước HTTP */
          }
          if (isObj(declared) && !Object.prototype.hasOwnProperty.call(declared, r.segs[1]))
            bad(`khoá "${r.segs[1]}" không có trong response_value — chỉ tham chiếu được các khoá đã khai báo (${Object.keys(declared).join(', ') || 'không có'}).`);
        }
        return;
      }
      case 'FindRecordAction': {
        if (!seg || !['fieldRecords', 'firstfieldsRecord', 'fields', 'recordNum'].includes(seg))
          return bad('FindRecordAction có các đầu ra: fieldRecords (cho Loop), firstfieldsRecord(.<field_id>), fields.<field_id>, recordNum.');
        if ((seg === 'firstfieldsRecord' || seg === 'fields') && r.segs[1] !== undefined)
          fieldSeg(stepTable.get(r.step), r.segs[1], new Set(['recordId']), 'cột của bản ghi tìm được');
        return;
      }
      case 'AddRecordAction':
        return fieldSeg(stepTable.get(r.step), seg, new Set(['recordId', 'recordLink']), 'cột của bản ghi vừa thêm');
      case 'SetRecordAction':
        return fieldSeg(stepTable.get(r.step), seg, new Set(['recordId']), 'cột của bản ghi vừa sửa');
      case 'Loop': {
        if (seg !== 'item' && seg !== 'index') return bad('Loop có đầu ra "item" (mục hiện tại) và "index".');
        if (seg === 'item' && r.segs[1] !== undefined) {
          // item của Loop chạy trên fieldRecords của FindRecordAction → cột của bảng đó.
          const src = parseRef(target?.data?.data?.[0]?.value);
          const srcStep = src ? steps[idIndex.get(src.step) ?? -1] : undefined;
          if (srcStep?.type === 'FindRecordAction' && src?.segs[0] === 'fieldRecords')
            fieldSeg(stepTable.get(src.step), r.segs[1], new Set(['recordId']), 'cột của mục đang lặp');
        }
        return;
      }
      default:
        return;
    }
  }

  function checkFieldIdSeg(p: string, value: J, table: string | undefined, s: string, label: string, sid?: string) {
    const t = table ? tableOf(table) : undefined;
    if (t?.fields) {
      if (t.fields.some((f) => f.field_id === s)) return;
      const byName = t.fields.find((f) => f.name === s);
      if (byName) {
        err(`${p}.value`, `ref "${value}" dùng TÊN cột — trong ref phải dùng field_id: thay "${s}" bằng "${byName.field_id}".`, sid);
        return;
      }
      const near = suggestNames(s, t.fields.map((f) => f.name));
      const nearById = t.fields.filter((f) => near.includes(f.name)).map((f) => `${f.field_id} («${f.name}»)`);
      err(`${p}.value`, `ref "${value}": "${s}" không phải ${label} của bảng «${t.name}».${nearById.length ? ` Có phải ý bạn là ${nearById.join(' / ')}?` : ''} (Trong ref dùng field_id fld…, lấy từ bitable_scan_base.)`, sid);
      return;
    }
    // Không có hồ sơ Base: vẫn bắt lỗi kinh điển "dùng tên cột trong ref" (tên có dấu/khoảng trắng).
    if (/[^\x21-\x7e]/.test(s)) err(`${p}.value`, `ref "${value}" có vẻ dùng TÊN cột "${s}" — trong ref phải dùng field_id (fld…).`, sid);
  }

  return { ok: errors.length === 0, errors, warnings, tables: [...tablesMentioned] };
}

/** Đi qua mọi object trong `data` (kể cả lồng trong mảng), gọi `fn` với đường dẫn của nó. */
function walkValues(v: J, path: string, fn: (node: Record<string, J>, path: string) => void, depth = 0) {
  if (depth > 30 || v === null || typeof v !== 'object') return;
  if (Array.isArray(v)) {
    v.forEach((x, i) => walkValues(x, `${path}[${i}]`, fn, depth + 1));
    return;
  }
  fn(v, path);
  for (const [k, x] of Object.entries(v)) if (x && typeof x === 'object') walkValues(x, `${path}.${k}`, fn, depth + 1);
}

/** Luật AIClassificationBranch — chép từ workflow_ai_classification_validate.go của CLI. */
function validateAIClassification(s: J, i: number, idIndex: Map<string, number>, err: (p: string, m: string, step?: string) => void) {
  const p = `steps[${i}]`;
  const sid = s.id;
  const d = s.data;
  if (!isObj(d)) return;
  if (d.mode !== undefined) err(`${p}.data.mode`, 'AIClassificationBranch không nhận `mode` (chỉ có chế độ Exclusive) — bỏ trường này.', sid);
  const classes: string[] = [];
  if (!Array.isArray(d.classes)) err(`${p}.data.classes`, '`classes` phải là mảng.', sid);
  else {
    if (d.classes.length < 2) err(`${p}.data.classes`, '`classes` cần ít nhất 2 loại.', sid);
    const seen = new Map<string, number>();
    d.classes.forEach((c: J, k: number) => {
      const cp = `${p}.data.classes[${k}]`;
      if (!isObj(c)) return err(cp, 'Mỗi loại phải là object { name, desc }.', sid);
      const name = typeof c.name === 'string' ? c.name.trim() : '';
      if (!name) return err(`${cp}.name`, '`name` không được trống.', sid);
      if (/[\r\n]/.test(name)) err(`${cp}.name`, '`name` không được xuống dòng.', sid);
      if (seen.has(name)) err(`${cp}.name`, `trùng tên với classes[${seen.get(name)}].`, sid);
      if (typeof c.desc !== 'string') err(`${cp}.desc`, '`desc` phải là chuỗi (được phép rỗng nhưng phải có).', sid);
      seen.set(name, k);
      classes.push(name);
    });
  }
  if (!Array.isArray(d.content)) err(`${p}.data.content`, '`content` phải là mảng (text/ref).', sid);
  else {
    let has = false;
    d.content.forEach((it: J, k: number) => {
      const ip = `${p}.data.content[${k}]`;
      if (!isObj(it)) return err(ip, 'phải là object.', sid);
      if (it.value_type === 'text') {
        if (String(it.value ?? '').trim()) has = true;
      } else if (it.value_type === 'ref') has = true;
      else err(`${ip}.value_type`, 'chỉ nhận "text" hoặc "ref".', sid);
    });
    if (!has) err(`${p}.data.content`, '`content` cần ít nhất một text không rỗng hoặc một ref.', sid);
  }
  if (d.classification_rule !== undefined && typeof d.classification_rule !== 'string') err(`${p}.data.classification_rule`, 'phải là chuỗi.', sid);
  const action = d.no_match_action === undefined ? 'classifyToOther' : String(d.no_match_action).trim();
  if (d.no_match_action !== undefined && action !== 'classifyToOther' && action !== 'fail')
    err(`${p}.data.no_match_action`, 'chỉ nhận "classifyToOther" hoặc "fail".', sid);

  const links: J[] = isObj(s.children) && Array.isArray(s.children.links) ? s.children.links : [];
  if (!links.length) return;
  let ordinary = 0;
  let defaults = 0;
  const targets = new Map<string, number>();
  links.forEach((l: J, k: number) => {
    const lp = `${p}.children.links[${k}]`;
    if (!isObj(l)) return;
    if (l.kind !== 'case') err(`${lp}.kind`, 'AIClassificationBranch chỉ dùng kind "case".', sid);
    if (l.label === 'other') err(`${lp}.label`, 'nhánh mặc định dùng label "default", không phải "other".', sid);
    const to = String(l.to ?? '').trim();
    if (to && targets.has(to)) err(`${lp}.to`, `trùng đích với links[${targets.get(to)}].`, sid);
    if (to) targets.set(to, k);
    if (l.label === 'default') {
      defaults++;
      return;
    }
    const want = `branch_${ordinary + 1}`;
    if (l.label !== want) err(`${lp}.label`, `label phải là "${want}" (theo thứ tự classes).`, sid);
    if (ordinary < classes.length && l.desc !== classes[ordinary]) err(`${lp}.desc`, `desc phải đúng bằng classes[${ordinary}].name ("${classes[ordinary]}").`, sid);
    ordinary++;
  });
  if (ordinary !== classes.length) err(`${p}.children.links`, `cần đúng ${classes.length} link "case" (mỗi loại một link, theo thứ tự).`, sid);
  if (action === 'classifyToOther' && defaults !== 1) err(`${p}.children.links`, 'no_match_action "classifyToOther" cần ĐÚNG 1 link label "default" (nhánh không khớp loại nào).', sid);
  if (action === 'fail' && defaults !== 0) err(`${p}.children.links`, 'no_match_action "fail" thì KHÔNG được có link "default".', sid);
  void idIndex;
}

/** Bản tóm tắt lỗi một dòng/lỗi cho model và người dùng. */
export function formatIssues(r: Pick<ValidationResult, 'errors' | 'warnings'>, max = 25): string[] {
  const line = (x: Issue) => `${x.path}${x.step ? ` [${x.step}]` : ''}: ${x.message}`;
  return [...r.errors.slice(0, max).map(line), ...(r.errors.length > max ? [`… và ${r.errors.length - max} lỗi khác`] : [])];
}

// ── Chuẩn hoá đầu vào tool ─────────────────────────────────────────────────────
/**
 * Model có lúc gửi `steps` là CHUỖI JSON, có lúc gửi cả `{title, steps}` vào `steps`. Gom về một
 * thân request duy nhất. `status` bị bỏ: tạo luôn TẮT, sửa không đổi trạng thái (bật là việc của
 * người dùng trong Lark).
 */
export function normalizeWorkflowInput(i: J): { body: { title?: string; steps: J }; notes: string[] } {
  const notes: string[] = [];
  let steps: J = i?.steps;
  let title: J = i?.title;
  if (typeof steps === 'string') {
    try {
      steps = JSON.parse(steps);
    } catch {
      notes.push('`steps` là chuỗi nhưng không phải JSON hợp lệ.');
    }
  }
  if (isObj(steps) && Array.isArray(steps.steps)) {
    if (title === undefined && typeof steps.title === 'string') title = steps.title;
    steps = steps.steps;
  }
  if (i?.status !== undefined || (isObj(i?.steps) && i.steps.status !== undefined))
    notes.push('Đã bỏ qua `status`: workflow luôn được tạo/giữ ở trạng thái TẮT — người dùng tự bật trong Lark.');
  return { body: { ...(typeof title === 'string' ? { title: title.trim() } : {}), steps }, notes };
}

// ── Base: URL → token ──────────────────────────────────────────────────────────
export type BaseRef =
  | { kind: 'base'; token: string; origin?: string; tableId?: string }
  | { kind: 'wiki'; node: string; origin?: string; tableId?: string };

/** Nhận link Base (…/base/<token>, …/bitable/<token>), link Wiki (…/wiki/<node>) hoặc token trần. */
export function parseBaseRef(input: unknown): BaseRef | null {
  const s = String(input ?? '').trim();
  if (!s) return null;
  if (/^[A-Za-z0-9]{10,}$/.test(s)) return { kind: 'base', token: s };
  let origin: string | undefined;
  let tableId: string | undefined;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    origin = u.origin;
    tableId = u.searchParams.get('table') || undefined;
  } catch {
    /* không phải URL — thử regex bên dưới */
  }
  const direct = s.match(/\/(?:base|bitable)\/([A-Za-z0-9]{10,})/);
  if (direct) return { kind: 'base', token: direct[1], origin, tableId };
  const wiki = s.match(/\/wiki\/([A-Za-z0-9]{10,})/);
  if (wiki) return { kind: 'wiki', node: wiki[1], origin, tableId };
  return null;
}

/** Link mở Base (giữ đúng tên miền tenant nếu người dùng đã dán link). */
export function baseUrl(token: string, origin?: string): string {
  return `${origin && /larksuite\.com|feishu\.cn|larkoffice\.com/.test(origin) ? origin : 'https://www.larksuite.com'}/base/${token}`;
}

// ── Hồ sơ Base gọn cho model ───────────────────────────────────────────────────
export interface RawScanTable {
  table_id: string;
  name: string;
  fields?: J[];
  views?: J[];
  records?: { items?: J[]; total?: number };
  error?: string;
}
export interface RawScan {
  token: string;
  name?: string;
  origin?: string;
  tables: RawScanTable[];
  /** Bảng có nhưng không quét chi tiết (vượt max_tables). */
  skipped?: string[];
  workflows?: J[];
  workflowsError?: string;
  /** workflow_id → steps (đã GET) */
  workflowSteps?: Record<string, J[]>;
}

const OPT_SAMPLE = 12;
const trimStr = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** Giá trị một ô → chuỗi ngắn (mảng {text}/{name} của Lark gộp lại). */
export function cellText(v: J, n = 60): J {
  if (v == null) return v;
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'string') return trimStr(v, n);
  if (Array.isArray(v)) {
    const s = v
      .slice(0, 6)
      .map((x) => (x == null ? '' : typeof x === 'object' ? String(x.text ?? x.name ?? x.en_name ?? x.file_name ?? x.record_ids ?? '') : String(x)))
      .filter(Boolean)
      .join(', ');
    return trimStr(s, n);
  }
  if (typeof v === 'object') return trimStr(String(v.text ?? v.name ?? v.link ?? v.value ?? ''), n);
  return v;
}

/** Một cột → "fldXXX · Tên · Kiểu[: a|b|c (+n)] [→ bảng liên kết]". */
export function fieldLine(f: J, tableNames: Map<string, string>): string {
  const type = f?.ui_type || FIELD_TYPE_NAMES[Number(f?.type)] || String(f?.type ?? '?');
  let s = `${f?.field_id ?? '?'} · ${f?.field_name ?? '?'} · ${type}`;
  const opts: J[] | undefined = f?.property?.options;
  if (Array.isArray(opts) && opts.length) {
    const names = opts.map((o) => o?.name).filter(Boolean);
    s += `: ${names.slice(0, OPT_SAMPLE).join('|')}${names.length > OPT_SAMPLE ? ` (+${names.length - OPT_SAMPLE})` : ''}`;
  }
  const linked = f?.property?.table_id;
  if (linked && (Number(f?.type) === 18 || Number(f?.type) === 21)) s += ` → «${tableNames.get(linked) ?? linked}»`;
  if (f?.is_primary) s += ' (chính)';
  return s;
}

/**
 * Gọn hoá dữ liệu quét thô thành "hồ sơ Base" cho model: mỗi cột MỘT dòng (id · tên · kiểu · vài
 * lựa chọn), view một dòng, ≤3 bản ghi mẫu đã cắt, workflow có sẵn tóm một dòng.
 */
export function compactBaseProfile(raw: RawScan, opts: { describe?: (steps: J[]) => string } = {}): J {
  const tableNames = new Map(raw.tables.map((t) => [t.table_id, t.name]));
  const tables = raw.tables.map((t) => {
    const fields = Array.isArray(t.fields) ? t.fields : [];
    const idToName = new Map(fields.map((f) => [f?.field_id, f?.field_name]));
    const samples = (t.records?.items || []).slice(0, 3).map((r: J) => {
      const out: Record<string, J> = {};
      for (const [k, v] of Object.entries(r?.fields || {})) {
        const c = cellText(v);
        if (c !== '' && c !== null && c !== undefined) out[idToName.get(k) ?? k] = c;
      }
      return out;
    });
    return {
      table_id: t.table_id,
      name: t.name,
      ...(typeof t.records?.total === 'number' ? { record_count: t.records.total } : {}),
      fields: fields.map((f) => fieldLine(f, tableNames)),
      ...(Array.isArray(t.views) && t.views.length
        ? { views: t.views.slice(0, 15).map((v: J) => `${v?.view_id ?? '?'} · ${v?.view_name ?? '?'} · ${v?.view_type ?? '?'}`) }
        : {}),
      ...(samples.length ? { sample_records: samples } : {}),
      ...(t.error ? { error: t.error } : {}),
    };
  });
  const workflows = Array.isArray(raw.workflows)
    ? raw.workflows.map((w: J) => {
        const id = String(w?.workflow_id ?? '');
        const steps = raw.workflowSteps?.[id];
        return {
          workflow_id: id,
          title: w?.title ?? '',
          status: w?.status ?? '',
          ...(Array.isArray(steps)
            ? { steps: steps.length, design: opts.describe ? trimStr(opts.describe(steps), 700) : undefined }
            : {}),
        };
      })
    : undefined;
  return {
    base: { app_token: raw.token, ...(raw.name ? { name: raw.name } : {}), url: baseUrl(raw.token, raw.origin) },
    table_count: raw.tables.length + (raw.skipped?.length ?? 0),
    tables,
    ...(raw.skipped?.length ? { tables_not_scanned: raw.skipped } : {}),
    ...(workflows ? { workflows } : {}),
    ...(raw.workflowsError ? { workflows_error: raw.workflowsError } : {}),
    legend:
      'Mỗi cột: "field_id · tên · kiểu[: lựa chọn…] [→ bảng liên kết]". Trong steps: table_name/field_name dùng TÊN; ' +
      'ref ("$.<bước>.<…>") dùng field_id fld…; cột lựa chọn gán bằng value_type "option".',
  };
}

/** Hồ sơ dùng cho bộ kiểm, rút từ dữ liệu quét thô (giữ TOÀN BỘ tên lựa chọn). */
export function validationProfileFrom(raw: Pick<RawScan, 'tables' | 'skipped'>): ValidationProfile {
  return {
    tables: [
      ...raw.tables.map((t) => ({
        table_id: t.table_id,
        name: t.name,
        fields: Array.isArray(t.fields)
          ? t.fields.map((f: J) => ({
              field_id: String(f?.field_id ?? ''),
              name: String(f?.field_name ?? ''),
              type: typeof f?.type === 'number' ? f.type : undefined,
              ui_type: f?.ui_type,
              options: Array.isArray(f?.property?.options) ? f.property.options.map((o: J) => String(o?.name ?? '')).filter(Boolean) : undefined,
            }))
          : undefined,
      })),
    ],
  };
}

// ── Lỗi Lark → tiếng Việt ──────────────────────────────────────────────────────
export type WorkflowOp = 'list' | 'get' | 'create' | 'update';
export const SCOPE_FOR: Record<WorkflowOp, string> = {
  list: 'base:workflow:read',
  get: 'base:workflow:read',
  create: 'base:workflow:create',
  update: 'base:workflow:update',
};

export interface MappedWorkflowError {
  ok: false;
  kind: 'scope' | 'auth' | 'permission' | 'not_found' | 'unsupported' | 'schema' | 'rate' | 'network' | 'unknown';
  error: string;
  error_code?: number;
  lark_msg?: string;
  log_id?: string;
  /** Việc người dùng cần làm (đánh số). */
  fix?: string[];
  /** Có nên chuyển sang đường dự phòng (lái giao diện / mẫu) không. */
  fallback?: string;
}

const SCHEMA_HINTS: [RegExp, string][] = [
  [/output path tree|does not exist in the output/i, 'Một ref sai đường dẫn: id bước không có, dùng TÊN cột thay vì field_id, hoặc trỏ tới đầu ra không tồn tại.'],
  [/conditions must be non-empty/i, '`condition_list` đang là [] — đổi thành null hoặc bỏ hẳn.'],
  [/filter info and ref info/i, 'SetRecordAction/FindRecordAction thiếu `filter_info` hoặc `ref_info` (cần đúng một).'],
  [/client token/i, 'Thiếu client_token (Larkwave tự thêm — hãy thử lại).'],
  [/valueType '?(\w+)'? not allowed for fieldType/i, 'Kiểu giá trị không hợp với kiểu cột — cột lựa chọn phải dùng value_type "option".'],
  [/undefined step type/i, 'Có `type` bước không tồn tại — xem danh sách loại bằng bitable_workflow_schema.'],
  [/unknown reference/i, 'Một ref trỏ tới id bước không có trong `steps`.'],
  [/\[2200\]|internal error/i, 'Thường do id bước TRÙNG hoặc `next`/`children.links` trỏ tới bước không tồn tại.'],
  [/table.*(not ?found|not exist)|no such table/i, 'Tên bảng không đúng — dùng đúng tên hiển thị (phân biệt hoa/thường).'],
  [/field.*(not ?found|not exist)|no such field/i, 'Tên cột/field_id không đúng — đối chiếu bitable_scan_base.'],
];

/** Lỗi từ larkClient (LarkApiError/LarkNetworkError, nhận theo hình dạng) → thông báo tiếng Việt có cách sửa. */
export function mapWorkflowError(e: unknown, op: WorkflowOp): MappedWorkflowError {
  const o = (e || {}) as { name?: string; code?: unknown; larkMsg?: string; message?: string; logId?: string };
  const scope = SCOPE_FOR[op];
  if (o.name === 'LarkNetworkError')
    return { ok: false, kind: 'network', error: 'Không kết nối được tới Lark. Kiểm tra mạng rồi thử lại.' };
  const code = typeof o.code === 'number' ? o.code : Number(o.code);
  const msg = String(o.larkMsg ?? o.message ?? e ?? '');
  const base = { error_code: Number.isFinite(code) ? code : undefined, lark_msg: msg.slice(0, 400), ...(o.logId ? { log_id: o.logId } : {}) };

  const listed = [...new Set(msg.match(/base:workflow:[a-z]+/g) || [])];
  if (code === 99991672 || code === 99991679 || code === 99991676 || /scope|access denied|99991672|99991679/i.test(msg)) {
    const scopes = listed.length ? listed : [scope];
    return {
      ok: false,
      kind: 'scope',
      ...base,
      error: `Ứng dụng Lark chưa được cấp quyền ${scopes.map((s) => `\`${s}\``).join(', ')} nên không ${op === 'create' ? 'tạo' : op === 'update' ? 'sửa' : 'đọc'} được workflow.`,
      fix: [
        'Mở Lark Developer Console (https://open.larksuite.com/app) → chọn app tự tạo đang kết nối với Larkwave.',
        `Vào "Permissions & Scopes" → thêm ${scopes.map((s) => `\`${s}\``).join(', ')} (nên thêm đủ base:workflow:read, base:workflow:create, base:workflow:update một lần).`,
        'Vào "Version Management & Release" → tạo phiên bản mới → PHÁT HÀNH (Release). Quyền mới chỉ có hiệu lực sau khi phát hành.',
        'Nếu Larkwave đang dùng đăng nhập tài khoản cá nhân Lark (QR), hãy đăng nhập lại để token mang quyền mới.',
        'Xong thì bảo tôi thử lại.',
      ],
    };
  }
  if (code === 99991663 || code === 99991661 || code === 99991668)
    return { ok: false, kind: 'auth', ...base, error: 'Phiên đăng nhập Lark đã hết hạn hoặc không hợp lệ.', fix: ['Vào Lark × Agents → kết nối lại app Lark (hoặc đăng nhập lại tài khoản Lark), rồi thử lại.'] };
  if (code === 99991400) return { ok: false, kind: 'rate', ...base, error: 'Lark đang giới hạn tần suất gọi. Đợi vài giây rồi thử lại.' };
  if (code === 404 || /404 page not found|no route|not found.*open-apis|unknown (api|path)/i.test(msg))
    return {
      ok: false,
      kind: 'unsupported',
      ...base,
      error: 'Máy chủ Lark của tenant này chưa có API Workflow (Base v3).',
      fix: ['Có thể tenant/khu vực chưa mở API này. Dùng đường dự phòng: dựng workflow bằng phiên Lark web (Lark × Agents → Tạo workflow).'],
      fallback: 'ui',
    };
  if (code === 91403 || code === 1254302 || code === 1254304 || code === 1254301 || /no ?permission|forbidden|permission denied|not have permission/i.test(msg))
    return {
      ok: false,
      kind: 'permission',
      ...base,
      error: 'Ứng dụng/tài khoản Lark chưa có quyền SỬA Base này.',
      fix: [
        'Mở Base trong Lark → nút "•••" (góc trên phải) → "Thêm ứng dụng tài liệu"/"Add document app" → chọn app của Larkwave, quyền "Có thể chỉnh sửa"/"Can edit".',
        'Hoặc chia sẻ Base cho tài khoản Lark đang đăng nhập ở Larkwave với quyền chỉnh sửa.',
        'Xong thì bảo tôi thử lại.',
      ],
    };
  if (code === 1254040 || code === 1254041 || /app ?token.*(invalid|not ?found)|base.*not ?found|workflow.*not ?(found|exist)|notexist/i.test(msg))
    return { ok: false, kind: 'not_found', ...base, error: 'Không tìm thấy Base (hoặc workflow) này — kiểm tra lại link/app_token và workflow_id (bắt đầu bằng "wkf").' };
  const hints = SCHEMA_HINTS.filter(([re]) => re.test(msg)).map(([, h]) => h);
  const stepMatch = msg.match(/steps?\[(\d+)\]|step(?:_id)?[ :=]+"?([A-Za-z0-9_\-]+)"?/i);
  if (hints.length || /schema|invalid|illegal|param|800004006|125400[0-9]/i.test(msg)) {
    return {
      ok: false,
      kind: 'schema',
      ...base,
      error: `Lark từ chối cấu trúc workflow: ${msg.slice(0, 240)}${stepMatch ? ` (vị trí: ${stepMatch[1] !== undefined ? `steps[${stepMatch[1]}]` : `bước "${stepMatch[2]}"`})` : ''}`,
      fix: [...hints, 'Sửa theo gợi ý, chạy bitable_workflow_validate rồi gửi lại. Cần tra cấu trúc: bitable_workflow_schema.'],
    };
  }
  return { ok: false, kind: 'unknown', ...base, error: `Lark báo lỗi${Number.isFinite(code) ? ` ${code}` : ''}: ${msg.slice(0, 300)}` };
}

// ── Tài liệu schema theo chủ đề ────────────────────────────────────────────────
/** Cắt một mục markdown từ dòng tiêu đề `heading` tới tiêu đề cùng/ cao cấp hơn kế tiếp. */
export function mdSection(md: string, heading: string): string {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l.trim() === heading.trim());
  if (start < 0) return '';
  const level = (heading.match(/^#+/) || ['#'])[0].length;
  let end = lines.length;
  let inCode = false;
  for (let k = start + 1; k < lines.length; k++) {
    if (lines[k].startsWith('```')) inCode = !inCode;
    if (inCode) continue;
    const m = lines[k].match(/^(#+)\s/);
    if (m && m[1].length <= level) {
      end = k;
      break;
    }
  }
  return lines.slice(start, end).join('\n').trim();
}

const S = LARK_WORKFLOW_SCHEMA_MD;
const G = LARK_WORKFLOW_GUIDE_MD;

/** Đầu ra (ref) của một loại bước — mục con trong "ref 引用变量详解". */
const OUTPUT_HEADING: Record<string, string> = {
  AddRecordTrigger: '##### 记录触发器（AddRecordTrigger / ChangeRecordTrigger / SetRecordTrigger / ReminderTrigger）',
  ChangeRecordTrigger: '##### 记录触发器（AddRecordTrigger / ChangeRecordTrigger / SetRecordTrigger / ReminderTrigger）',
  SetRecordTrigger: '##### 记录触发器（AddRecordTrigger / ChangeRecordTrigger / SetRecordTrigger / ReminderTrigger）',
  ReminderTrigger: '##### 记录触发器（AddRecordTrigger / ChangeRecordTrigger / SetRecordTrigger / ReminderTrigger）',
  ButtonTrigger: '##### ButtonTrigger（按钮触发器）',
  TimerTrigger: '##### TimerTrigger（定时触发器）',
  LarkMessageTrigger: '##### LarkMessageTrigger（飞书消息触发器）',
  FindRecordAction: '##### FindRecordAction（查找记录）',
  AddRecordAction: '##### AddRecordAction（新增记录）',
  SetRecordAction: '##### SetRecordAction（更新记录）',
  HTTPClientAction: '##### HTTPClientAction（HTTP 请求）',
  GenerateAiTextAction: '##### GenerateAiTextAction（AI 生成文本）',
  AIAnalysisAction: '##### AIAnalysisAction（AI 分析）',
  Loop: '##### Loop（循环）',
};

/**
 * Mục đầu ra của một loại bước. Riêng ButtonTrigger: tài liệu gốc đặt hai mục con của nó ở cấp
 * `####` (CAO hơn chính tiêu đề `#####` của nó), nên cắt theo cấp sẽ dừng ngay dòng đầu — phải cắt
 * tới tiêu đề `#####` kế tiếp.
 */
function outputSection(type: string): string {
  const h = OUTPUT_HEADING[type];
  if (type !== 'ButtonTrigger') return mdSection(S, h);
  const from = S.indexOf(h);
  const to = S.indexOf('##### TimerTrigger', from + h.length);
  return from < 0 ? '' : S.slice(from, to > from ? to : undefined).trim();
}

const EXAMPLE_HEADINGS = [
  '### 示例 1: 新增记录触发 + 发送消息',
  '### 示例 2: 定时触发 + 查找记录 + 循环遍历 + 发送消息',
  '### 示例 3: 条件分支（IfElseBranch）',
  '### 示例 4: 多路分支（SwitchBranch）',
  '### 示例 5: 组合场景（定时+查找+循环+分支+消息）',
  '### 示例 6: 按钮触发 + 调用外部接口 + 写入同步日志',
  '### 示例 7: AI 分类（用户反馈自动分流）',
];

export const SCHEMA_TOPICS = [
  'overview',
  'triggers',
  'actions',
  'branches',
  'loop',
  'values',
  'refs',
  'conditions',
  'errors',
  'examples',
  'example1',
  'example2',
  'example3',
  'example4',
  'example5',
  'example6',
  'example7',
  ...STEP_TYPES,
];

/**
 * Một mục tài liệu theo chủ đề. Chủ đề là một loại bước (vd "SetRecordAction") thì trả cả cấu hình
 * `data` LẪN các đầu ra tham chiếu được của loại đó — hai thứ model luôn cần cùng lúc.
 */
export function schemaSection(topic: string): { topic: string; text: string; source: string } | null {
  const t = String(topic || '').trim();
  const pick = (...hs: string[]) => hs.map((h) => mdSection(S, h) || mdSection(G, h)).filter(Boolean).join('\n\n');
  let text = '';
  const low = t.toLowerCase();
  if (KNOWN.has(t)) {
    text = [mdSection(S, `### ${t}`), OUTPUT_HEADING[t] ? outputSection(t) : NO_OUTPUT.has(t) ? `（${t} 无可引用输出 — không có đầu ra để ref）` : '']
      .filter(Boolean)
      .join('\n\n');
  } else if (low === 'overview') text = pick('## WorkflowStep 基础结构', '## StepChildren 与 ChildLink', '## StepType 枚举');
  else if (low === 'triggers') text = pick('## Trigger data 详细结构');
  else if (low === 'actions') text = pick('## Action data 详细结构');
  else if (low === 'branches') text = pick('## Branch data 详细结构');
  else if (low === 'loop') text = [mdSection(S, '## System data 详细结构'), mdSection(G, '### Loop 构造要点')].filter(Boolean).join('\n\n');
  else if (low === 'values') text = [mdSection(S, '### ValueInfo'), mdSection(S, '### TextRefItem'), mdSection(S, '### RecordFieldValue'), mdSection(G, '### 字段值构造')].filter(Boolean).join('\n\n');
  else if (low === 'refs') text = [mdSection(S, '### ref 引用变量详解')].join('');
  else if (low === 'conditions')
    text = [mdSection(S, '### AndCondition（Trigger 过滤条件）'), mdSection(S, '### OrGroup（Branch 分支条件）'), mdSection(S, '### RecordFilterInfo'), mdSection(S, '### `select` 字段多值匹配'), mdSection(S, '### RefInfo')]
      .filter(Boolean)
      .join('\n\n');
  else if (low === 'errors') text = pick('## 常见错误避免');
  else if (low === 'examples') text = [mdSection(G, '## 场景速查表'), mdSection(G, '### 最简单的 Workflow')].join('\n\n') + '\n\n(Xem ví dụ đầy đủ: topic "example1" … "example7".)';
  else {
    const m = low.match(/^example\s*(\d)$/);
    if (m && EXAMPLE_HEADINGS[Number(m[1]) - 1]) text = mdSection(G, EXAMPLE_HEADINGS[Number(m[1]) - 1]);
  }
  if (!text) return null;
  return { topic: t, text, source: LARK_DOCS_SOURCE };
}
