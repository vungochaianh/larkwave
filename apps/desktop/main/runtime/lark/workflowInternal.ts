import { randomBytes } from 'node:crypto';
import type { WebField, WebTable } from './larkWebApi';

/**
 * Thiết kế `steps` CHÍNH THỨC (Base v3 — thứ agent dựng, bộ kiểm workflowV3 kiểm) → bản nháp NỘI BỘ mà
 * trình soạn Workflow/Automation của Lark web lưu (`draft.steps` + `extra.TableMap`).
 *
 * Nguồn của từng khuôn (đo 09/10/2026, xem docs/lark-web-api.md mục 12):
 *   1. ĐỌC hơn 360 workflow/automation THẬT trong các Base của người dùng (workflow/detail +
 *      automation/list, chỉ đọc) — mọi loại bước dưới đây trừ Delay/GenerateAiText đều có mẫu thật.
 *   2. Mã trình soạn của Lark (bundle `vb_19231…`): mỗi lớp bước có `fromAgentData()` — CHÍNH bộ chuyển
 *      "Agent Data" (= thiết kế v3 viết camelCase) → dữ liệu nội bộ mà Lark dùng cho cảnh WORKFLOW_CLI.
 *      Từ đó lấy luật giá trị theo kiểu cột (`uA`), toán tử (`AS`), khuôn ref (`$I`/`II`), Delay, Timer…
 *
 * Khuôn chung của một bước nội bộ: `{ id, type, data, stepTitle, next: [{ ids:[…], condition? }], version? }`.
 * Bảng/cột viết bằng bí danh `ref_<tbl>` / `ref_<tbl>_<fld>`, `extra.TableMap` ánh xạ bí danh → id thật.
 * Liên kết rẽ nhánh/lặp KHÔNG nằm ở `next` mà trong `data`:
 *   IfElseBranch  → data.meetConditionStepId / notMeetConditionStepId (null khi nhánh trống)
 *   SwitchBranch  → data.childBranchList[i].entryChildStepId + data.defaultBranchInfo.entryStepId
 *   Loop          → data.startChildStepId
 * còn `next` của nhánh/lặp là bước SAU khi hội tụ / hết vòng. Mỗi chuỗi con kết thúc bằng `next: []`.
 *
 * Module THUẦN (không electron, không mạng) để kiểm bằng fixture (test/workflowInternal.cjs).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type J = any;

export const WEB_SUPPORTED_TYPES = [
  'AddRecordTrigger',
  'SetRecordTrigger',
  'ChangeRecordTrigger',
  'TimerTrigger',
  'ReminderTrigger',
  'ButtonTrigger',
  'AddRecordAction',
  'SetRecordAction',
  'FindRecordAction',
  'LarkMessageAction',
  'HTTPClientAction',
  'Delay',
  'GenerateAiTextAction',
  'IfElseBranch',
  'SwitchBranch',
  'Loop',
] as const;
/** Có trong schema v3 nhưng chưa tạo thẳng được (cần id nhóm chat / cấu hình AI riêng) → trình soạn Lark. */
export const WEB_UI_ONLY_TYPES = ['LarkMessageTrigger', 'AIAnalysisAction', 'AIClassificationBranch'] as const;

export interface WebUser {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface ConvertOptions {
  /** Múi giờ của Base (clientvars base.timezone) — giờ của TimerTrigger tính theo múi này. */
  timezone?: string;
  /** "Bây giờ" (ms) — để kiểm cố định thời gian. */
  now?: number;
}

export interface ConvertResult {
  ok: boolean;
  draft?: J;
  extra?: J;
  triggerName?: string;
  errors: string[];
  unsupported?: string[];
  /** id thiết kế → id nội bộ (để báo cáo / đọc lại). */
  idMap?: Record<string, string>;
}

const rid = (p: string) => p + randomBytes(8).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 8);
const rnum = () => 10000 + Math.floor(Math.random() * 80000);
export const fold = (s: string) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();

/** `triggerName` của workflow/create — bảng `_n` trong mã trình soạn Lark. */
export const TRIGGER_NAME: Record<string, string> = {
  AddRecordTrigger: 'addRecord',
  SetRecordTrigger: 'setRecord',
  ChangeRecordTrigger: 'changeRecord',
  TimerTrigger: 'cron',
  ReminderTrigger: 'datetimeField',
  ButtonTrigger: 'buttonField',
  LarkMessageTrigger: 'larkMessage',
};

const RECORD_TRIGGERS = new Set(['AddRecordTrigger', 'SetRecordTrigger', 'ChangeRecordTrigger', 'ReminderTrigger', 'ButtonTrigger']);
const RECORD_ACTIONS = new Set(['AddRecordAction', 'SetRecordAction']);
const SELECT_TYPES = new Set([3, 4, 24]); // 24 = Stage (tiến trình) — Lark xử lý như chọn một
const PERSON_TYPES = new Set([11, 1003, 1004, 19]);
const READONLY_TYPES = new Set([19, 20, 1001, 1002, 1003, 1004, 1005, 3001]);
const DEFAULT_ADD_CONTROLS = ['pasteUpdate', 'automationBatchUpdate', 'appendImport', 'openAPIBatchUpdate'];
const DEFAULT_SET_CONTROLS = ['pasteUpdate', 'automationBatchUpdate', 'openAPIBatchUpdate'];
/** Toán tử thiết kế → nội bộ trong ĐIỀU KIỆN NHÁNH (hàm `AS` của Lark). */
const BRANCH_OP: Record<string, string> = { containsAll: 'contains', doesNotContainAll: 'doesNotContain' };
/** Toán tử thiết kế → nội bộ trong BỘ LỌC bản ghi / điều kiện trigger (dữ liệu thật dùng contains/doesNotContain cho nhiều lựa chọn). */
const FILTER_OP: Record<string, string> = { containsAny: 'contains', doesNotContainAny: 'doesNotContain', containsAll: 'contains', doesNotContainAll: 'doesNotContain' };
const EMPTY_OPS = new Set(['isEmpty', 'isNotEmpty']);
const REMINDER_UNIT: Record<string, number> = { MINUTE: 1, HOUR: 2, DAY: 3, WEEK: 4, MONTH: 5 };

/** Giờ treo tường "yyyy-MM-dd HH:mm" (hoặc "/") ở múi `tz` → mili giây UTC. */
export function wallTimeToMs(s: string, tz?: string): number | null {
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(String(s || '').trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = [+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0)];
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  if (!tz) return asUtc - 7 * 3600_000; // mặc định Asia/Ho_Chi_Minh
  try {
    const off = (t: number) => {
      const p = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
          .formatToParts(new Date(t))
          .map((x) => [x.type, x.value]),
      ) as Record<string, string>;
      return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - t;
    };
    let t = asUtc - off(asUtc);
    t = asUtc - off(t);
    return t;
  } catch {
    return asUtc - 7 * 3600_000;
  }
}

/** Thứ trong tuần (0 = CN) của một mốc ms ở múi `tz`. */
function weekdayAt(ms: number, tz?: string): number {
  try {
    const w = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'Asia/Ho_Chi_Minh', weekday: 'short' }).format(new Date(ms));
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(w);
  } catch {
    return new Date(ms + 7 * 3600_000).getUTCDay();
  }
}

interface Node {
  s: J; // bước thiết kế
  id: string; // id nội bộ
  depth: number; // 0-based theo cây (trigger = 0)
}

/**
 * Chuyển `steps` v3 → draft/extra nội bộ. `me` = người đang đăng nhập Lark web (người nhận "tôi").
 * Người nhận v3 dạng open_id `ou_…` KHÔNG dùng được ở phiên web (id nội bộ là số).
 */
export function v3ToInternal(input: { title: string; steps: J[] }, tables: WebTable[], me: WebUser | null, opts: ConvertOptions = {}): ConvertResult {
  const errors: string[] = [];
  const steps: J[] = Array.isArray(input?.steps) ? input.steps : [];
  if (!steps.length) return { ok: false, errors: ['Thiết kế không có bước nào.'] };
  const ui = [...new Set(steps.map((s) => String(s?.type)).filter((t) => (WEB_UI_ONLY_TYPES as readonly string[]).includes(t) || !(WEB_SUPPORTED_TYPES as readonly string[]).includes(t)))];
  if (ui.length) return { ok: false, errors: [`Chưa tạo thẳng được qua phiên web: ${ui.join(', ')} — dựng bước này trong trình soạn Lark (lark_ui_*), phần còn lại vẫn tạo được nếu bỏ bước đó.`], unsupported: ui };

  const byId = new Map<string, J>();
  for (const s of steps) {
    const k = String(s?.id ?? '');
    if (!k) return { ok: false, errors: ['Mỗi bước phải có `id`.'] };
    if (byId.has(k)) return { ok: false, errors: [`id bước «${k}» bị trùng.`] };
    byId.set(k, s);
  }
  const trigger = steps[0];
  if (!/Trigger$/.test(String(trigger?.type))) return { ok: false, errors: ['Bước đầu tiên phải là trigger.'] };
  if (steps.slice(1).some((s) => /Trigger$/.test(String(s?.type)))) return { ok: false, errors: ['Chỉ được MỘT trigger (bước đầu).'] };

  const prefix = (t: string) => (/Trigger$/.test(t) ? 'trig' : /Branch$/.test(t) ? 'branch' : t === 'Loop' ? 'system' : 'act');
  const idMap = new Map<string, string>();
  for (const s of steps) idMap.set(String(s.id), rid(prefix(String(s.type))));
  const iid = (k: unknown) => (k == null || k === '' ? null : idMap.get(String(k)) ?? null);

  // ── Cây: duyệt từ trigger theo next + children.links → thứ tự DFS + độ sâu (Lark: stepNum = depth+1) ──
  const linksOf = (s: J): J[] => (Array.isArray(s?.children?.links) ? s.children.links : []);
  const order: Node[] = [];
  const seen = new Set<string>();
  /** Bước nằm TRƯỚC trên đường từ trigger tới bước này (chỉ những bước đó mới ref được). */
  const ancestors = new Map<string, Set<string>>();
  const walk = (k: string | null | undefined, depth: number, anc0: string[] = []) => {
    let cur = k == null ? null : String(k);
    let d = depth;
    let anc = anc0;
    while (cur) {
      if (seen.has(cur)) {
        errors.push(`Bước «${cur}» được trỏ tới hai lần (mỗi bước chỉ có một chỗ đứng trong cây).`);
        return;
      }
      const s = byId.get(cur);
      if (!s) {
        errors.push(`Không có bước id «${cur}» (được trỏ tới từ next/children).`);
        return;
      }
      seen.add(cur);
      ancestors.set(cur, new Set(anc));
      order.push({ s, id: idMap.get(cur)!, depth: d });
      for (const l of linksOf(s)) walk(l?.to, d + 1, [...anc, cur]);
      anc = [...anc, cur];
      cur = s.next == null || s.next === '' ? null : String(s.next);
      d += 1;
    }
  };
  walk(String(trigger.id), 0);
  for (const s of steps) if (!seen.has(String(s.id))) errors.push(`Bước «${s.id}» (${s.type}) không nối vào cây (không ai trỏ tới qua next/children).`);
  if (errors.length) return { ok: false, errors };
  const nodeOf = new Map(order.map((n) => [String(n.s.id), n]));
  const num = (k: string) => (nodeOf.get(k)?.depth ?? 0) + 1;

  // ── Bảng / cột ───────────────────────────────────────────────────────────────────────────────
  const tableByName = (n: unknown) => tables.find((t) => fold(t.name) === fold(String(n ?? ''))) || tables.find((t) => t.id === n);
  const TableMap: Record<string, { TableID: string; FieldMap: Record<string, string>; ViewMap: Record<string, string> }> = {};
  const tref = (t: WebTable) => {
    const k = `ref_${t.id}`;
    if (!TableMap[k]) TableMap[k] = { TableID: t.id, FieldMap: {}, ViewMap: {} };
    return k;
  };
  const fref = (t: WebTable, fieldId: string) => {
    const k = `ref_${t.id}_${fieldId}`;
    TableMap[tref(t)].FieldMap[k] = fieldId;
    return k;
  };
  const fieldByName = (t: WebTable, n: unknown) => t.fields.find((f) => fold(f.name) === fold(String(n ?? ''))) || t.fields.find((f) => f.id === n);
  /** Bảng mà bước (thiết kế) đọc/ghi — để ref tới cột của nó. */
  const stepTable = new Map<string, WebTable>();
  for (const s of steps) {
    const tn = s?.data?.table_name;
    if (tn != null && tn !== '') {
      const t = tableByName(tn);
      if (t) stepTable.set(String(s.id), t);
      else if (s.type !== 'ButtonTrigger' || s?.data?.button_type !== 'buttonElement') errors.push(`${s.type} «${s.id}»: không thấy bảng «${tn}» trong Base.`);
    }
  }
  if (errors.length) return { ok: false, errors };

  // Loop → bảng của bản ghi đang lặp (nguồn = FindRecord.fieldRecords).
  const loopTable = new Map<string, WebTable>();
  for (const s of steps) {
    if (s.type !== 'Loop') continue;
    const src = (Array.isArray(s?.data?.data) ? s.data.data : [])[0];
    const m = /^\$\.([^.]+)\.fieldRecords$/.exec(String(src?.value ?? ''));
    if (m && stepTable.get(m[1])) loopTable.set(String(s.id), stepTable.get(m[1])!);
  }
  /** FindRecordAction → các cột cần lấy thêm vì bước sau tham chiếu tới (Lark: addFindFieldFromMCPOutputRef). */
  const findExtra = new Map<string, Set<string>>();

  // ── Ref "$.<bước>.<đường>" → thẻ ref nội bộ ─────────────────────────────────────────────────────
  const fail = (where: string, msg: string): null => {
    errors.push(`${where}: ${msg}`);
    return null;
  };
  // `anc` phải đứng TRƯỚC `of` trên đường đi trong cây (Lark chỉ cho ref bước trước; bước ở nhánh
  // anh em hay trong thân vòng lặp không phải "trước" của bước sau khi hội tụ).
  const isAncestor = (anc: string, of: string): boolean => !!ancestors.get(of)?.has(anc);
  const fieldTag = (srcKey: string, src: J, t: WebTable, f: WebField, recordInfo: J | undefined, withExtra: boolean): J => {
    const sid = idMap.get(srcKey)!;
    return {
      fields: [{ fieldId: fref(t, f.id), type: f.type }],
      id: `${sid}-${t.id}-${f.id}-${rnum()}`,
      stepId: sid,
      stepNum: num(srcKey),
      stepType: String(src.type),
      tableId: tref(t),
      tagType: 'step',
      type: 'ref',
      value: 'step',
      recordInfo: recordInfo ?? {},
      ...(withExtra ? { extra: {} } : {}),
    };
  };
  interface RefOut {
    tag: J;
    /** Kiểu cột (mã số) mà ref trỏ tới, nếu biết — để chọn khuôn so sánh / kiểm người nhận. */
    fieldType?: number;
    kind: 'field' | 'user' | 'time' | 'text' | 'number' | 'records' | 'link' | 'item' | 'other';
  }
  const resolveRef = (raw: unknown, where: string, cur: string, o: { richText?: boolean } = {}): RefOut | null => {
    const v = String(raw ?? '');
    const m = /^\$\.([^.]+)(?:\.(.+))?$/.exec(v);
    if (!m) return fail(where, `ref «${v}» sai dạng (cần "$.<id bước>.<đường>").`);
    const srcKey = m[1];
    const path = m[2] ? m[2].split('.') : [];
    const src = byId.get(srcKey);
    if (!src) return fail(where, `ref «${v}» trỏ tới bước không tồn tại «${srcKey}».`);
    if (srcKey !== cur && !isAncestor(srcKey, cur)) return fail(where, `ref «${v}»: bước «${srcKey}» không đứng trước «${cur}» trong luồng.`);
    const sid = idMap.get(srcKey)!;
    const stepNum = num(srcKey);
    const type = String(src.type);
    const t = stepTable.get(srcKey);
    const head = path[0] ?? '';
    const ex = o.richText ? { extra: {} } : {};
    const recAttr = (attribute: string, recordInfo: J = {}): J => ({ id: `${sid}-${attribute}${rnum()}`, value: '', attribute, stepId: sid, tagType: 'RecordAttribute', stepType: type, recordInfo, stepNum, type: 'ref' });
    const fieldOf = (tb: WebTable, fid: string) => tb.fields.find((f) => f.id === fid);
    if (RECORD_TRIGGERS.has(type) || RECORD_ACTIONS.has(type)) {
      if (!t) return fail(where, `ref «${v}»: bước «${srcKey}» không gắn bảng.`);
      if (/^fld/.test(head)) {
        const f = fieldOf(t, head);
        if (!f) return fail(where, `ref «${v}»: bảng «${t.name}» không có cột ${head}.`);
        if (path.length > 1) return fail(where, `ref «${v}»: chưa hỗ trợ khoan sâu thuộc tính cột (${path.slice(1).join('.')}) qua phiên web — dùng chính cột.`);
        return { tag: fieldTag(srcKey, src, t, f, undefined, !!o.richText), fieldType: f.type, kind: PERSON_TYPES.has(f.type) ? 'user' : 'field' };
      }
      if (head === 'recordId') return { tag: { ...recAttr('recordId'), ...ex }, kind: 'text' };
      if (head === 'recordLink') {
        TableMap[tref(t)].FieldMap[`${tref(t)}_`] = '';
        return { tag: { id: `${sid}-${t.id}-recordUrl1100`, type: 'ref', tagType: 'stepLink', stepId: sid, stepType: type, tableId: tref(t), isShortcut: true, fieldId: `${tref(t)}_`, viewId: '', value: '', stepNum, ...ex }, kind: 'link' };
      }
      if (head === 'recordCreatedUser' || head === 'recordModifiedUser')
        return { tag: { id: `${sid}-object${rnum()}`, path: [], value: head, valueType: 'object', structureType: 'user', stepId: sid, stepNum, type: 'ref', tagType: 'stepPureValue', stepType: type, ...ex }, kind: 'user' };
      if (head === 'recordCreatedTime' || head === 'recordModifiedTime')
        return { tag: { id: `${sid}-timestamp${rnum()}`, path: [], value: head, valueType: 'timestamp', stepId: sid, stepNum, type: 'ref', tagType: 'stepPureValue', stepType: type, ...ex }, kind: 'time' };
      if (head === 'startTime' && RECORD_TRIGGERS.has(type))
        return { tag: { id: `${sid}-start-time${rnum()}`, tagType: 'stepAttribute', stepId: sid, stepType: type, stepNum, value: '', type: 'ref', stepAttr: 'startTime', ...ex }, kind: 'time' };
      return fail(where, `ref «${v}»: đường «${path.join('.')}» chưa hỗ trợ (được: <field_id>, recordId, recordLink, recordCreatedUser/Time, recordModifiedUser/Time, startTime).`);
    }
    if (type === 'TimerTrigger') {
      if (head === 'scheduleTime' || head === '') return { tag: { id: `timer-${sid}-${rnum()}`, tagType: 'stepAttribute', stepId: sid, stepType: type, stepNum, value: '', type: 'ref', stepAttr: 'startTime', ...ex }, kind: 'time' };
      return fail(where, `ref «${v}»: TimerTrigger chỉ có scheduleTime.`);
    }
    if (type === 'FindRecordAction') {
      if (!t) return fail(where, `ref «${v}»: bước tìm bản ghi không gắn bảng.`);
      if (head === 'fieldRecords')
        return { tag: { id: `${sid}-stepRecord${rnum()}`, type: 'ref', tagType: 'stepRecordFields', stepType: type, stepNum, stepId: sid, fields: [], tableId: tref(t), isAllFields: true, recordInfo: { displayType: 'list' }, ...ex }, kind: 'records' };
      if (head === 'recordNum') return { tag: { ...recAttr('recordNum'), ...ex }, kind: 'number', fieldType: 2 };
      const first = head === 'firstfieldsRecord';
      const rest = first || head === 'fields' ? path.slice(1) : path;
      const fid = rest[0] ?? '';
      if (fid === 'recordId') return { tag: { ...recAttr('recordId', first ? { type: 'firstRecord' } : {}), ...ex }, kind: 'text' };
      if (/^fld/.test(fid)) {
        const f = fieldOf(t, fid);
        if (!f) return fail(where, `ref «${v}»: bảng «${t.name}» không có cột ${fid}.`);
        if (!findExtra.has(srcKey)) findExtra.set(srcKey, new Set());
        findExtra.get(srcKey)!.add(f.id);
        return { tag: fieldTag(srcKey, src, t, f, first ? { type: 'firstRecord' } : {}, !!o.richText), fieldType: f.type, kind: PERSON_TYPES.has(f.type) ? 'user' : 'field' };
      }
      return fail(where, `ref «${v}»: FindRecordAction có fieldRecords, recordNum, firstfieldsRecord.<field_id>, fields.<field_id>.`);
    }
    if (type === 'Loop') {
      const id = (x: string) => `loop-tag-segment-${sid}-${x}-${rnum()}`;
      if (head === 'index') return { tag: { stepId: sid, id: id(''), tagType: 'loop', type: 'ref', value: '', loopValue: 'index', path: [], stepNum, ...ex }, kind: 'number', fieldType: 2 };
      if (head !== 'item') return fail(where, `ref «${v}»: Loop chỉ có item, item.<field_id>, index.`);
      const fid = path[1];
      if (!fid) return { tag: { stepId: sid, id: id(''), tagType: 'loop', type: 'ref', value: '', loopValue: 'item', path: [], stepNum, ...ex }, kind: 'item' };
      const lt = loopTable.get(srcKey);
      const f = lt?.fields.find((x) => x.id === fid);
      if (!lt || !f) return fail(where, `ref «${v}»: không biết cột ${fid} của bản ghi đang lặp (nguồn lặp phải là $.<tìm bản ghi>.fieldRecords và cột thuộc bảng đó).`);
      // Cột của bản ghi lặp phải được bước tìm lấy về.
      const findKey = /^\$\.([^.]+)\./.exec(String((src.data?.data ?? [])[0]?.value ?? ''))?.[1];
      if (findKey) {
        if (!findExtra.has(findKey)) findExtra.set(findKey, new Set());
        findExtra.get(findKey)!.add(f.id);
      }
      fref(lt, f.id);
      return { tag: { stepId: sid, id: id(f.id), tagType: 'loop', type: 'ref', value: '', loopValue: 'item', path: [{ type: 'Field', value: f.id }], stepNum, ...ex }, fieldType: f.type, kind: PERSON_TYPES.has(f.type) ? 'user' : 'field' };
    }
    if (type === 'HTTPClientAction') {
      if (String(src.data?.response_type ?? 'json') === 'none') return fail(where, `ref «${v}»: HTTPClientAction «${srcKey}» có response_type none — không có đầu ra.`);
      const p: J[] = [{ type: 'step', text: `${stepNum}. ${src.title || 'Yêu cầu HTTP'}`, stepId: sid }];
      for (const x of path) p.push({ type: 'json', text: x });
      const valueType = head === 'status_code' ? 'number' : path.length >= 2 ? 'string' : 'json_string';
      return { tag: { id: `json-${rnum()}`, path: p, value: '', valueType, stepId: sid, stepNum, tagType: 'stepPureValue', stepType: type, type: 'ref', ...ex }, kind: valueType === 'number' ? 'number' : 'text' };
    }
    if (type === 'GenerateAiTextAction') {
      if (path.length) return fail(where, `ref «${v}»: GenerateAiTextAction chỉ tham chiếu được cả kết quả ($.${srcKey}).`);
      return { tag: { id: `${sid}-string${rnum()}`, stepId: sid, stepType: type, stepNum, tagType: 'stepPureValue', type: 'ref', value: '', valueType: 'string', path: [], ...ex }, kind: 'text' };
    }
    return fail(where, `ref «${v}»: bước ${type} không có đầu ra tham chiếu được.`);
  };

  /** ValueInfo[] chữ/ref → đoạn nội bộ [{type:'text',text}|ref]. */
  const segments = (items: unknown, where: string, cur: string, o: { richText?: boolean } = {}): J[] => {
    const out: J[] = [];
    for (const it of Array.isArray(items) ? items : []) {
      if (it?.value_type === 'text' || it?.value_type === 'number' || it?.value_type === 'boolean') out.push({ type: 'text', text: String(it.value ?? ''), ...(o.richText ? { extra: {} } : {}) });
      else if (it?.value_type === 'ref') {
        const r = resolveRef(it.value, where, cur, o);
        if (r) out.push(r.tag);
      } else fail(where, `value_type «${it?.value_type}» không dùng được ở đây (chỉ text/ref).`);
    }
    return out;
  };

  const optionId = (f: WebField, v: J, where: string): string | null => {
    const name = v && typeof v === 'object' ? v.name ?? v.id : v;
    const o = f.options?.find((x) => x.id === (v && typeof v === 'object' ? v.id : v) || fold(x.name) === fold(String(name ?? '')));
    if (!o) {
      fail(where, `cột «${f.name}» không có lựa chọn «${name}» (có: ${(f.options || []).map((x) => x.name).join(' | ') || 'trống'}).`);
      return null;
    }
    return o.id;
  };
  const userTag = (u: WebUser): J => ({ type: 'ref', avatarUrl: u.avatarUrl || '', id: u.id, entityId: u.id, value: u.name, tagType: 'user', owner_type: 0, department: '' });
  const userOf = (v: J): WebUser | null => {
    const id = String(v && typeof v === 'object' ? v.id ?? '' : v ?? '');
    const name = String(v && typeof v === 'object' ? v.name ?? '' : '');
    if (me && (!id || id === 'me' || id === me.id || (name && fold(name) === fold(me.name)))) return me;
    if (/^\d{6,}$/.test(id)) return { id, name: name || id };
    return null;
  };

  /**
   * Giá trị gán cho một cột (AddRecord/SetRecord/nút setRecord) — luật `uA` của Lark theo kiểu cột:
   * chữ → đoạn; số/ô tích → hằng (hoặc ref); chọn một → id lựa chọn; chọn nhiều → mảng id; người →
   * {userId,name,…}; ngày → ms; liên kết/tệp → chỉ ref.
   */
  const fieldValue = (f: WebField, items: J[], where: string, cur: string): { valueType: 'ref' | 'value'; value: J } | null => {
    const w = `${where} «${f.name}»`;
    if (READONLY_TYPES.has(f.type)) return fail(w, `cột ${f.typeName} không ghi được (tự tính).`);
    const list = Array.isArray(items) ? items : [];
    const hasRef = list.some((x) => x?.value_type === 'ref');
    const refs = () => list.filter((x) => x?.value_type === 'ref').map((x) => resolveRef(x.value, w, cur)?.tag).filter(Boolean);
    switch (f.type) {
      case 1:
      case 22: // Text, Location — Lark tự lưu valueType 'ref' kể cả khi toàn chữ (mẫu thật)
        return { valueType: 'ref', value: segments(list, w, cur) };
      case 13: {
        if (hasRef) return { valueType: 'ref', value: segments(list, w, cur) };
        return { valueType: 'value', value: list.map((x) => ({ fullPhoneNum: String(x?.value ?? '') })) };
      }
      case 15: {
        const l = list[0];
        if (l?.value_type === 'ref') return { valueType: 'ref', value: refs()[0] ?? null };
        if (l?.value_type === 'link') return { valueType: 'value', value: { text: segments(l.value?.text, w, cur), link: segments(l.value?.link, w, cur) } };
        if (l?.value_type === 'text') return { valueType: 'value', value: { text: [{ type: 'text', text: String(l.value) }], link: [{ type: 'text', text: String(l.value) }] } };
        return fail(w, 'cột URL cần value_type link {text,link} hoặc ref.');
      }
      case 18:
      case 21:
      case 17:
        if (!hasRef) return fail(w, `cột ${f.typeName} chỉ gán được bằng ref (bản ghi/tệp từ bước trước).`);
        return { valueType: 'ref', value: refs() };
      case 11: {
        const out: J[] = [];
        for (const x of list) {
          if (x?.value_type === 'ref') {
            const r = resolveRef(x.value, w, cur);
            if (r) out.push(r.tag);
          } else if (x?.value_type === 'user') {
            const u = userOf(x.value);
            if (!u) fail(w, `người «${x.value?.name || x.value?.id}» chưa tra được qua phiên web (dùng "me", id nội bộ dạng số, hoặc ref tới cột Người).`);
            else out.push({ userId: u.id, name: u.name, enName: u.name, avatarUrl: u.avatarUrl || '', not_notify: false });
          } else fail(w, 'cột Người cần value_type user hoặc ref.');
        }
        return { valueType: hasRef ? 'ref' : 'value', value: out };
      }
      case 2: {
        if (hasRef) return { valueType: 'ref', value: refs() };
        const n = Number(list[0]?.value);
        if (!Number.isFinite(n)) return fail(w, 'cột Số cần value_type number.');
        return { valueType: 'value', value: n };
      }
      case 7: {
        if (hasRef) return { valueType: 'ref', value: refs() };
        return { valueType: 'value', value: list[0]?.value === true || list[0]?.value === 'true' };
      }
      case 3:
      case 24: {
        if (hasRef) return { valueType: 'ref', value: refs() };
        const id = optionId(f, list[0]?.value, w);
        return id ? { valueType: 'value', value: id } : null;
      }
      case 4: {
        if (hasRef) return { valueType: 'ref', value: refs() };
        const ids = list.map((x) => optionId(f, x?.value, w)).filter(Boolean);
        return { valueType: 'value', value: ids };
      }
      case 5: {
        if (hasRef) return { valueType: 'ref', value: refs() };
        const raw = String(list[0]?.value ?? '');
        if (/^now$/i.test(raw)) return { valueType: 'value', value: [{ id: `now-${rnum()}`, value: 'Thời gian hành động', type: 'ref', tagType: 'time', time: 'now' }] };
        const ms = wallTimeToMs(raw, opts.timezone);
        if (ms == null) return fail(w, `ngày «${raw}» sai dạng (yyyy/MM/dd [HH:mm] hoặc "now").`);
        return { valueType: 'value', value: ms };
      }
      default:
        return fail(w, `chưa hỗ trợ ghi cột kiểu ${f.typeName} qua phiên web.`);
    }
  };

  /** Danh sách {field_name, value} → values nội bộ. */
  const fieldValues = (t: WebTable, list: unknown, where: string, cur: string): J[] => {
    const out: J[] = [];
    for (const fv of Array.isArray(list) ? list : []) {
      const f = fieldByName(t, fv?.field_name);
      if (!f) {
        fail(where, `bảng «${t.name}» không có cột «${fv?.field_name}».`);
        continue;
      }
      const v = fieldValue(f, Array.isArray(fv?.value) ? fv.value : [], where, cur);
      if (v) out.push({ fieldId: fref(t, f.id), ...v });
    }
    return out;
  };

  /** Điều kiện TRÊN CỘT (lọc bản ghi, điều kiện trigger) — khuôn {fieldId, fieldType, operator, value, conditionId}. */
  const fieldCondition = (t: WebTable, c: J, where: string, cur: string, idStyle: 'con' | 'field'): J | null => {
    const f = fieldByName(t, c?.field_name);
    if (!f) return fail(where, `bảng «${t.name}» không có cột «${c?.field_name}».`);
    const op = FILTER_OP[String(c?.operator)] ?? String(c?.operator || 'is');
    const conditionId = idStyle === 'field' ? `${f.id}-${c?.operator || op}` : rid('con').slice(0, 10);
    const base = { fieldId: fref(t, f.id), fieldType: f.type, operator: op, conditionId };
    if (EMPTY_OPS.has(op)) return { ...base, value: null };
    const vals: J[] = Array.isArray(c?.value) ? c.value : [];
    const out: J[] = [];
    for (const x of vals) {
      if (x?.value_type === 'ref') {
        const r = resolveRef(x.value, where, cur);
        if (r) out.push(r.tag);
      } else if (SELECT_TYPES.has(f.type) || (f.options?.length && x?.value_type === 'option')) {
        const id = optionId(f, x?.value, `${where} «${f.name}»`);
        if (id) out.push(id);
      } else if (f.type === 7) out.push(x?.value === true || x?.value === 'true');
      else if (f.type === 2 || x?.value_type === 'number') out.push(Number(x?.value));
      else out.push({ text: String(x?.value ?? ''), type: 'text' });
    }
    return { ...base, value: out };
  };
  /** condition_list v3 ([{conjunction:'and', conditions:[…]}], các nhóm OR nhau) → điều kiện nội bộ của next[0]. */
  const triggerCondition = (t: WebTable, list: unknown, where: string, cur: string): J | null => {
    const groups: J[] = Array.isArray(list) ? list : [];
    if (!groups.length) return null;
    return {
      conjunction: 'or',
      conditions: groups.map((g) => ({ conjunction: 'and', conditions: (Array.isArray(g?.conditions) ? g.conditions : []).map((c: J) => fieldCondition(t, c, where, cur, 'con')).filter(Boolean) })),
    };
  };
  const recordFilter = (t: WebTable, fi: J, where: string, cur: string): J => ({
    conjunction: 'and',
    conditions: (Array.isArray(fi?.conditions) ? fi.conditions : []).map((c: J) => fieldCondition(t, c, where, cur, 'con')).filter(Boolean),
  });

  /** OrGroup v3 của nhánh → {conjunction:'Or', conditions:[{conjunction:'And', conditions:[{leftValue,operator,rightValue}]}]}. */
  const branchCondition = (cond: J, where: string, cur: string): J => {
    const groups: J[] = Array.isArray(cond?.conditions) ? cond.conditions : [];
    if (!groups.length) fail(where, 'điều kiện trống.');
    const item = (c: J): J | null => {
      const lv = c?.left_value;
      if (lv?.value_type !== 'ref') return fail(where, 'left_value phải là ref tới đầu ra bước trước.');
      const left = resolveRef(lv.value, where, cur);
      if (!left) return null;
      const op = BRANCH_OP[String(c?.operator)] ?? String(c?.operator || 'is');
      if (EMPTY_OPS.has(op)) return { leftValue: left.tag, operator: op, rightValue: null };
      const rv: J[] = Array.isArray(c?.right_value) ? c.right_value : [];
      const out: J[] = [];
      // Chọn khuôn vế phải theo KIỂU của vế trái (luật cO/pO/dO/hO của Lark).
      const lf = left.fieldType;
      const leftField = (() => {
        // cột lựa chọn (để đổi tên → id)
        const m = /^\$\.([^.]+)\.(?:firstfieldsRecord\.|fields\.|item\.)?(fld[A-Za-z0-9]+)/.exec(String(lv.value));
        if (!m) return null;
        const t = stepTable.get(m[1]) || loopTable.get(m[1]);
        return t?.fields.find((x) => x.id === m[2]) || null;
      })();
      for (const x of rv) {
        if (x?.value_type === 'ref') {
          const r = resolveRef(x.value, where, cur);
          if (r) out.push(r.tag);
        } else if (lf != null && SELECT_TYPES.has(lf) && leftField) {
          const id = optionId(leftField, x?.value, where);
          if (id) out.push(id);
        } else if (lf === 2 || left.kind === 'number' || x?.value_type === 'number') {
          const n = Number(x?.value);
          if (Number.isFinite(n)) out.push(n);
          else fail(where, `«${x?.value}» không phải số.`);
        } else if (lf === 7 || x?.value_type === 'boolean') out.push(x?.value === true || x?.value === 'true');
        else if (x?.value_type === 'user') {
          const u = userOf(x.value);
          if (u) out.push(userTag(u));
          else fail(where, `người «${x.value?.name || x.value?.id}» chưa tra được qua phiên web.`);
        } else if (x?.value_type === 'date') {
          const ms = wallTimeToMs(String(x.value), opts.timezone);
          if (ms == null) fail(where, `ngày «${x.value}» sai dạng.`);
          else out.push(ms);
        } else {
          const text = x?.value && typeof x.value === 'object' ? x.value.name ?? x.value.id : x?.value;
          out.push({ text: String(text ?? ''), type: 'text' });
        }
      }
      return { leftValue: left.tag, operator: op, rightValue: out };
    };
    return {
      conjunction: 'Or',
      conditions: groups.map((g) => ({ conjunction: 'And', conditions: (Array.isArray(g?.conditions) ? g.conditions : []).map(item).filter(Boolean) })),
    };
  };

  // ── Từng bước ──────────────────────────────────────────────────────────────────────────────────
  const out: J[] = [];
  const nextOf = (s: J, extra?: J) => {
    const n = iid(s?.next);
    return n ? [{ ids: [n], ...(extra ? { condition: extra } : {}) }] : [];
  };
  let btnTrigger = { TableID: '', FieldID: '' };
  for (const node of order) {
    const s = node.s;
    const k = String(s.id);
    const id = node.id;
    const d = s.data || {};
    const type = String(s.type);
    const where = `${type} «${k}»`;
    const stepTitle = String(s.title || '');
    const t = stepTable.get(k);
    const push = (data: J, next: J[] = nextOf(s), more: J = {}) => out.push({ id, type, data, stepTitle, next, ...more });
    const needTable = () => (t ? true : (fail(where, 'cần table_name.'), false));
    switch (type) {
      case 'AddRecordTrigger': {
        if (!needTable()) break;
        const watched = d.watched_field_name ? fieldByName(t!, d.watched_field_name) : t!.fields.find((f) => f.isPrimary) || t!.fields[0];
        if (!watched) fail(where, `không thấy cột «${d.watched_field_name}» trong bảng «${t!.name}».`);
        push(
          {
            tableId: tref(t!),
            ...(watched ? { watchedFieldId: fref(t!, watched.id) } : {}),
            triggerControlList: Array.isArray(d.trigger_control_list) && d.trigger_control_list.length ? d.trigger_control_list : DEFAULT_ADD_CONTROLS,
          },
          nextOf(s, triggerCondition(t!, d.condition_list, where, k)),
        );
        break;
      }
      case 'SetRecordTrigger': {
        if (!needTable()) break;
        const watch: J[] = Array.isArray(d.field_watch_info) ? d.field_watch_info : [];
        if (!watch.length) fail(where, 'cần field_watch_info (cột nào đổi).');
        const fields: J[] = [];
        for (const w of watch) {
          const f = fieldByName(t!, w?.field_name);
          if (!f) {
            fail(where, `không thấy cột «${w?.field_name}».`);
            continue;
          }
          const vals: J[] = Array.isArray(w?.value) ? w.value : [];
          if (!w?.operator && !vals.length) {
            fields.push({ fieldId: fref(t!, f.id), fieldType: f.type });
            continue;
          }
          const c = fieldCondition(t!, { field_name: f.name, operator: w?.operator || (vals.length ? 'is' : 'isNotEmpty'), value: vals }, where, k, 'field');
          if (c) {
            delete c.conditionId; // field_watch_info thật không có conditionId
            if (SELECT_TYPES.has(f.type) || f.type === 2 || f.type === 7) fields.push(c);
            else if (EMPTY_OPS.has(c.operator)) fields.push(c);
            else fail(where, `lọc theo giá trị chỉ hỗ trợ cột lựa chọn/số/ô tích (cột «${f.name}» là ${f.typeName}) — bỏ value hoặc dùng isNotEmpty.`);
          }
        }
        const rw: J[] = Array.isArray(d.record_watch_info) ? d.record_watch_info : [];
        const filterInfo = rw.length ? { conjunction: d.record_watch_conjunction === 'or' ? 'or' : 'and', conditions: rw.map((c) => fieldCondition(t!, c, where, k, 'con')).filter(Boolean) } : null;
        push(
          { tableId: tref(t!), recordType: filterInfo ? 'Filter' : 'All', filterInfo, fields, triggerControlList: Array.isArray(d.trigger_control_list) && d.trigger_control_list.length ? d.trigger_control_list : DEFAULT_SET_CONTROLS },
          nextOf(s, triggerCondition(t!, d.condition_list, where, k)),
        );
        break;
      }
      case 'ChangeRecordTrigger': {
        if (!needTable()) break;
        const groups: J[] = Array.isArray(d.condition_list) ? d.condition_list : [];
        if (!groups.length) fail(where, 'condition_list không được trống.');
        const flat: J[] = [];
        const cond = {
          conjunction: 'or',
          conditions: groups.map((g) => {
            const cs = (Array.isArray(g?.conditions) ? g.conditions : []).map((c: J) => fieldCondition(t!, c, where, k, 'field')).filter(Boolean);
            flat.push(...cs);
            return { conjunction: 'and', conditions: cs };
          }),
        };
        push({ tableId: tref(t!), fields: flat, triggerControlList: Array.isArray(d.trigger_control_list) && d.trigger_control_list.length ? d.trigger_control_list : DEFAULT_SET_CONTROLS }, nextOf(s, cond));
        break;
      }
      case 'TimerTrigger': {
        const rule = String(d.rule || 'DAILY').toUpperCase();
        let start = d.start_time ? wallTimeToMs(String(d.start_time), opts.timezone) : null;
        if (start == null) {
          if (d.start_time) fail(where, `start_time «${d.start_time}» sai dạng (yyyy-MM-dd HH:mm).`);
          start = wallTimeToMs(new Date((opts.now ?? Date.now()) + 7 * 3600_000).toISOString().slice(0, 10) + ' 09:00', opts.timezone)!;
        }
        const data: J = { startTime: start, rule };
        const sub: number[] = Array.isArray(d.sub_unit) ? d.sub_unit.map(Number).filter((x: number) => Number.isFinite(x)) : [];
        if (rule === 'WEEKLY' && sub.length === 1) {
          // Lark lặp hằng tuần vào ĐÚNG thứ của startTime — dời ngày bắt đầu tới thứ cần (giữ giờ).
          let guard = 0;
          while (weekdayAt(start, opts.timezone) !== ((sub[0] % 7) + 7) % 7 && guard++ < 7) start += 86_400_000;
          data.startTime = start;
        } else if (rule === 'WEEKLY' && sub.length > 1) {
          Object.assign(data, { rule: 'CUSTOM', interval: 1, unit: 'WEEK', subUnit: sub, isNeverEnd: true });
        } else if (rule === 'CUSTOM') {
          const unit = String(d.unit || 'DAY').toUpperCase();
          if (!['HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR'].includes(unit)) fail(where, `unit «${unit}» chưa hỗ trợ (HOUR/DAY/WEEK/MONTH/YEAR).`);
          const iv = Math.max(1, Math.min(30, Number(d.interval) || 1));
          Object.assign(data, { interval: iv, unit });
          if ((unit === 'WEEK' || unit === 'MONTH') && sub.length) data.subUnit = sub;
          const never = d.is_never_end !== false || !d.end_time;
          data.isNeverEnd = never;
          if (!never) data.endTime = wallTimeToMs(String(d.end_time), opts.timezone);
        }
        if (opts.timezone) data.timezone = opts.timezone;
        push(data);
        break;
      }
      case 'ReminderTrigger': {
        if (!needTable()) break;
        const f = fieldByName(t!, d.field_name);
        if (!f) {
          fail(where, `không thấy cột ngày «${d.field_name}».`);
          break;
        }
        if (![5, 1001, 1002, 19, 20].includes(f.type)) fail(where, `cột «${f.name}» không phải cột ngày.`);
        const unit = REMINDER_UNIT[String(d.unit || 'DAY').toUpperCase()];
        if (!unit) fail(where, `unit «${d.unit}» không hợp lệ (MINUTE/HOUR/DAY/WEEK/MONTH).`);
        push(
          { tableId: tref(t!), fieldId: fref(t!, f.id), offset: Number(d.offset) || 0, unit: unit || 3, hour: Number.isFinite(Number(d.hour)) ? Number(d.hour) : 9, minute: Number(d.minute) || 0 },
          nextOf(s, triggerCondition(t!, d.condition_list, where, k)),
        );
        break;
      }
      case 'ButtonTrigger': {
        const bt = d.button_type === 'buttonElement' ? 'buttonElement' : 'buttonField';
        if (bt === 'buttonField') {
          if (!needTable()) break;
          btnTrigger = { TableID: t!.id, FieldID: '' };
          push({ tableId: tref(t!), buttonType: bt }, nextOf(s), { version: '2.0.0' });
        } else push({ buttonType: bt }, nextOf(s), { version: '2.0.0' });
        break;
      }
      case 'AddRecordAction': {
        if (!needTable()) break;
        push({ tableId: tref(t!), values: fieldValues(t!, d.field_values, where, k) });
        break;
      }
      case 'SetRecordAction': {
        if (!needTable()) break;
        const values = fieldValues(t!, d.field_values, where, k);
        let rec: J;
        if (d.ref_info?.step_id) {
          const sk = String(d.ref_info.step_id);
          const rs = byId.get(sk);
          if (!rs) fail(where, `ref_info.step_id «${sk}» không tồn tại.`);
          else if (!isAncestor(sk, k)) fail(where, `ref_info.step_id «${sk}» phải là bước đứng trước.`);
          else if (stepTable.get(sk) && stepTable.get(sk)!.id !== t!.id && rs.type !== 'Loop') fail(where, `ref_info trỏ tới bản ghi bảng «${stepTable.get(sk)!.name}», khác bảng cần cập nhật «${t!.name}».`);
          rec = { recordType: 'Ref', recordInfo: { stepId: iid(sk), stepNum: num(sk) - 1 } };
        } else if (d.filter_info) rec = { recordType: 'Filter', recordInfo: recordFilter(t!, d.filter_info, where, k) };
        else {
          fail(where, 'cần ref_info {step_id} (bản ghi của bước trước, vd trigger) hoặc filter_info.');
          rec = {};
        }
        push({ tableId: tref(t!), values, ...rec, maxSetRecordNum: Math.max(1, Math.min(15000, Number(d.max_set_record_num) || 100)) });
        break;
      }
      case 'FindRecordAction': {
        if (!needTable()) break;
        const names: J[] = Array.isArray(d.field_names) ? d.field_names : [];
        const ids: string[] = [];
        for (const n of names) {
          const f = fieldByName(t!, n);
          if (!f) fail(where, `bảng «${t!.name}» không có cột «${n}».`);
          else if (!ids.includes(f.id)) ids.push(f.id);
        }
        let rec: J;
        if (d.ref_info?.step_id) {
          const sk = String(d.ref_info.step_id);
          if (!byId.get(sk) || !isAncestor(sk, k)) fail(where, `ref_info.step_id «${sk}» phải là bước đứng trước.`);
          rec = { recordType: 'Ref', recordInfo: { stepId: iid(sk), stepNum: num(sk) - 1 } };
        } else rec = { recordType: 'Filter', recordInfo: recordFilter(t!, d.filter_info || {}, where, k) };
        // `fieldIds` hoàn tất sau khi duyệt xong (bước sau có thể ref thêm cột) — xem vòng chốt bên dưới.
        push({ tableId: tref(t!), fieldIds: ids, fieldsMap: {}, ...rec, shouldProceedWithNoResults: d.should_proceed_when_no_results !== false });
        break;
      }
      case 'LarkMessageAction': {
        const persons: J[] = [];
        for (const r of Array.isArray(d.receiver) ? d.receiver : []) {
          const v = r?.value && typeof r.value === 'object' ? r.value : {};
          const rawId = String(typeof r?.value === 'string' ? r.value : v.id ?? '');
          if (r?.value_type === 'ref' || /^\$\./.test(rawId)) {
            const rf = resolveRef(r?.value_type === 'ref' ? r.value : rawId, `${where} người nhận`, k);
            if (!rf) continue;
            if (rf.kind !== 'user') {
              fail(where, `người nhận «${rawId || r.value}» không phải cột Người (đang là ${rf.fieldType != null ? rf.fieldType : rf.kind}) — không dùng làm người nhận được.`);
              continue;
            }
            const { extra: _x, ...tag } = rf.tag;
            void _x;
            persons.push(tag);
            continue;
          }
          if (r?.value_type === 'group') {
            if (/^\d{6,}$/.test(rawId)) persons.push({ id: rawId, type: 'ref', tagType: 'user', value: String(v.name || rawId), entityId: rawId, avatarUrl: '', owner_type: 1 });
            else fail(where, `nhóm chat «${v.name || rawId}»: cần id nội bộ dạng số của nhóm (chat_id oc_… không dùng được qua phiên web) — hoặc dựng người nhận nhóm trong trình soạn Lark.`);
            continue;
          }
          const u = r?.value_type === 'user' ? userOf(r.value) : null;
          if (u) persons.push(userTag(u));
          else
            fail(
              where,
              `người nhận «${v.name || rawId || r?.value_type}» chưa hỗ trợ qua phiên web (được: "tôi" {value_type:"user",value:{id:"me"}}, id người dùng nội bộ dạng số, cột Người qua ref "$.<bước>.<field_id>", nhóm chat bằng id số).`,
            );
        }
        if (!persons.length && !errors.length) fail(where, 'cần ít nhất một người nhận.');
        if (d.send_to_everyone === true) fail(where, 'send_to_everyone chưa hỗ trợ qua phiên web.');
        const titleSegs = segments(d.title, `${where} tiêu đề`, k);
        const paragraph = segments(d.content, `${where} nội dung`, k, { richText: true });
        if (!paragraph.length) fail(where, 'nội dung tin nhắn trống.');
        const btns: J[] = Array.isArray(d.btn_list) ? d.btn_list : [];
        const btnList: J[] = [];
        for (const b of btns) {
          const action = String(b?.btn_action || 'openLink');
          const base = { btnKey: rid('message_btn_'), btnStyle: 'primary', text: String(b?.text || 'Xem bản ghi') };
          if (action === 'openLink') {
            const link = segments(b?.link, `${where} nút`, k);
            btnList.push({ ...base, btnAction: 'openLink', link });
          } else if (action === 'setRecord' || action === 'addRecord') {
            const bt = tableByName(b?.table_name) || stepTable.get(String(trigger.id));
            if (!bt) {
              fail(where, `nút ${action}: không thấy bảng «${b?.table_name}».`);
              continue;
            }
            const recordValues = fieldValues(bt, b?.record_values, `${where} nút`, k);
            btnList.push({
              ...base,
              btnAction: action,
              notRepeateClick: true,
              recordValues,
              tableId: tref(bt),
              ...(action === 'setRecord' ? { recordType: 'Ref', recordInfo: { stepId: idMap.get(String(trigger.id)), stepNum: 0 } } : {}),
            });
          } else fail(where, `btn_action «${action}» không hợp lệ.`);
        }
        const titleText = titleSegs.filter((x) => x.type === 'text');
        push(
          {
            notifyIdentity: 'mixed',
            robotType: 'baseApp',
            persons,
            // Mọi bản Lark lưu: `groups` là BẢN SAO của `persons`.
            groups: JSON.parse(JSON.stringify(persons)),
            title: titleSegs.length ? titleSegs.map((x) => (x.type === 'text' ? { text: x.text, type: 'text' } : x)) : titleText,
            titleTemplateColor: 'blue',
            content: [],
            btnList,
            needBtn: btnList.length > 0,
            needTopBase: false,
            needCompress: true,
            sendMsgScene: 'send',
            senders: [],
            senderType: 4,
            attachments: [],
            contentType: 'rich_text',
            richTextContent: [{ type: 'paragraph', lineMarkerList: [], value: paragraph }],
            buttonConfig: { notRepeatClickMode: 'AllUser', mutualExclusion: false },
          },
          nextOf(s),
          { version: '1.1.0' },
        );
        if (!stepTitle) out[out.length - 1].stepTitle = 'Gửi tin nhắn Lark';
        break;
      }
      case 'HTTPClientAction': {
        const method = String(d.method || 'POST').toUpperCase();
        const url = segments(d.url, `${where} url`, k);
        if (!url.length) fail(where, 'cần url.');
        const kv = (list: unknown, w: string) => (Array.isArray(list) ? list : []).map((x: J) => ({ key: String(x?.key ?? ''), value: segments(x?.value, w, k) }));
        const bodyType = String(d.body_type || (method === 'GET' ? 'none' : 'raw'));
        if (!['none', 'raw'].includes(bodyType)) fail(where, `body_type «${bodyType}» chưa hỗ trợ qua phiên web (none/raw).`);
        const responseType = String(d.response_type || 'json');
        if (responseType === 'json' && !d.response_value) fail(where, 'response_type json cần response_value (JSON mẫu).');
        push({
          method,
          url,
          queries: kv(d.queries, `${where} queries`),
          headers: kv(d.headers, `${where} headers`),
          responseType,
          responseValue: responseType === 'json' ? String(d.response_value || '') : '',
          bodyType,
          rawBody: bodyType === 'raw' ? segments(d.raw_body, `${where} raw_body`, k) : [{ text: '{}', type: 'text' }],
          formBody: [],
        });
        break;
      }
      case 'Delay': {
        const dur = Math.floor(Number(d.duration));
        if (!Number.isFinite(dur) || dur < 1 || dur > 120) fail(where, 'duration phải trong [1, 120] phút.');
        push({ duration: dur, unit: 'minute' });
        break;
      }
      case 'GenerateAiTextAction': {
        const prompt = segments(d.prompt, `${where} prompt`, k);
        if (!prompt.length) fail(where, 'prompt trống.');
        push({ prompt, promptType: 'customize' });
        break;
      }
      case 'IfElseBranch': {
        const links = linksOf(s);
        const yes = links.find((l) => l?.kind === 'if_true');
        const no = links.find((l) => l?.kind === 'if_false');
        if (!yes) fail(where, 'cần children.links có if_true.');
        push({ condition: branchCondition(d.condition, where, k), meetConditionStepId: iid(yes?.to), notMeetConditionStepId: iid(no?.to) });
        break;
      }
      case 'SwitchBranch': {
        const list: J[] = Array.isArray(d.child_branch_list) ? d.child_branch_list : [];
        const cases = linksOf(s).filter((l) => l?.kind === 'case');
        if (!list.length) fail(where, 'cần child_branch_list.');
        const entryFor = (i: number, name: string) => {
          const l = cases.find((x) => x?.label === `branch_${i + 1}`) || cases.find((x) => x?.desc && fold(x.desc) === fold(name)) || cases.filter((x) => x?.label !== 'default')[i];
          return iid(l?.to);
        };
        const parallel = String(d.mode || 'exclusive') === 'parallel';
        const def = cases.find((x) => x?.label === 'default');
        push({
          mode: parallel ? 'Parallel' : 'Exclusive',
          childBranchList: list.map((b, i) => ({ entryChildStepId: entryFor(i, String(b?.name || '')), name: String(b?.name || `Nhánh ${i + 1}`), condition: branchCondition(b?.condition, `${where} nhánh ${i + 1}`, k) })),
          ...(parallel
            ? { failMode: d.fail_mode === 'fail' ? 'Fail' : 'PartialSuccess', matchMode: d.match_mode === 'noneMatchFail' ? 'NoneMatchFail' : 'NoneMatchSkip' }
            : { defaultBranchInfo: { entryStepId: iid(def?.to), mode: d.no_match_action === 'fail' ? 'Fail' : 'Execute' } }),
        });
        break;
      }
      case 'Loop': {
        const start = linksOf(s).find((l) => l?.kind === 'loop_start');
        if (!start) fail(where, 'cần children.links có loop_start.');
        const src = (Array.isArray(d.data) ? d.data : [])[0];
        if (src?.value_type !== 'ref') fail(where, 'data phải là MỘT ref (vd $.<tìm bản ghi>.fieldRecords).');
        const r = src?.value_type === 'ref' ? resolveRef(src.value, `${where} data`, k) : null;
        push({ loopType: 'forEach', loopData: r?.tag ?? null, maxLoopTimes: Math.max(1, Math.min(1000, Number(d.max_loop_times) || 1000)), loopMode: d.loop_mode === 'end' ? 1 : 2, startChildStepId: iid(start?.to) ?? '' });
        break;
      }
      default:
        fail(where, 'loại bước chưa hỗ trợ.');
    }
  }
  // Chốt FindRecordAction: thêm các cột mà bước sau tham chiếu, và fieldsMap {fld:{type}}.
  for (const st of out) {
    if (st.type !== 'FindRecordAction') continue;
    const key = [...idMap.entries()].find(([, v]) => v === st.id)?.[0] ?? '';
    const t = stepTable.get(key)!;
    const ids: string[] = [...st.data.fieldIds, ...(findExtra.get(key) ?? [])].filter((x, i, a) => a.indexOf(x) === i);
    if (!ids.length) {
      const pf = t.fields.find((f) => f.isPrimary) || t.fields[0];
      if (pf) ids.push(pf.id);
    }
    st.data.fieldIds = ids.map((f) => fref(t, f));
    st.data.fieldsMap = Object.fromEntries(ids.map((f) => [f, { type: t.fields.find((x) => x.id === f)?.type }]));
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    draft: { steps: out, title: String(input.title || 'Workflow') },
    extra: { TableMap, BlockMap: {}, BtnTrigger: btnTrigger },
    triggerName: TRIGGER_NAME[String(trigger.type)] || '',
    errors: [],
    idMap: Object.fromEntries(idMap),
  };
}

// ── Đọc ngược: bản nháp nội bộ → cây (để kiểm cấu trúc đọc lại + vẽ thiết kế) ───────────────────────

export interface OutlineNode {
  type: string;
  title: string;
  /** Nhãn cạnh từ cha: 'yes' | 'no' | 'case:<tên>' | 'default' | 'loop' | undefined (tuần tự). */
  edge?: string;
  depth: number;
}

/** Duyệt `draft.steps` nội bộ theo next + liên kết rẽ nhánh/lặp → danh sách nút theo thứ tự cây. */
export function internalOutline(draft: J): { nodes: OutlineNode[]; problems: string[] } {
  let d = draft;
  if (typeof d === 'string') {
    try {
      d = JSON.parse(d);
    } catch {
      d = null;
    }
  }
  const steps: J[] = Array.isArray(d?.steps) ? d.steps : [];
  const byId = new Map(steps.map((s) => [String(s?.id), s]));
  const nodes: OutlineNode[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  const nextIds = (s: J): string[] => (Array.isArray(s?.next) ? s.next.flatMap((n: J) => (Array.isArray(n?.ids) ? n.ids.map(String) : [])) : []);
  const chain = (start: string | null | undefined, depth: number, edge?: string) => {
    let cur = start ? String(start) : '';
    let e = edge;
    while (cur) {
      if (seen.has(cur)) {
        problems.push(`vòng/lặp lại ở ${cur}`);
        return;
      }
      const s = byId.get(cur);
      if (!s) {
        problems.push(`trỏ tới bước không có: ${cur}`);
        return;
      }
      seen.add(cur);
      nodes.push({ type: String(s.type), title: String(s.stepTitle || ''), edge: e, depth });
      e = undefined;
      const dt = s.data || {};
      if (s.type === 'IfElseBranch') {
        chain(dt.meetConditionStepId, depth + 1, 'yes');
        chain(dt.notMeetConditionStepId, depth + 1, 'no');
      } else if (s.type === 'SwitchBranch' || s.type === 'AIClassificationBranch') {
        for (const b of Array.isArray(dt.childBranchList) ? dt.childBranchList : []) chain(b?.entryChildStepId, depth + 1, `case:${typeof b?.name === 'string' ? b.name : ''}`);
        chain(dt.defaultBranchInfo?.entryStepId, depth + 1, 'default');
      } else if (s.type === 'Loop') chain(dt.startChildStepId, depth + 1, 'loop');
      const nx = nextIds(s);
      cur = nx[0] || '';
    }
  };
  chain(steps[0]?.id, 0);
  for (const s of steps) if (!seen.has(String(s?.id))) problems.push(`bước mồ côi: ${s?.type} ${s?.id}`);
  return { nodes, problems };
}

/** Chữ ký cấu trúc (loại + cạnh + độ sâu) — so bản gửi với bản đọc lại. */
export function outlineSignature(draft: J): string {
  return internalOutline(draft)
    .nodes.map((n) => `${n.depth}:${n.edge ?? ''}:${n.type}`)
    .join('|');
}

const TYPE_VI: Record<string, string> = {
  AddRecordTrigger: 'Khi thêm bản ghi',
  SetRecordTrigger: 'Khi sửa bản ghi',
  ChangeRecordTrigger: 'Khi bản ghi thoả điều kiện',
  TimerTrigger: 'Theo lịch',
  ReminderTrigger: 'Nhắc theo ngày',
  ButtonTrigger: 'Khi bấm nút',
  LarkMessageTrigger: 'Khi nhận tin nhắn',
  AddRecordAction: 'Thêm bản ghi',
  SetRecordAction: 'Cập nhật bản ghi',
  FindRecordAction: 'Tìm bản ghi',
  LarkMessageAction: 'Gửi tin nhắn Lark',
  HTTPClientAction: 'Gọi HTTP',
  Delay: 'Chờ',
  GenerateAiTextAction: 'AI tạo văn bản',
  IfElseBranch: 'Nếu / Nếu không',
  SwitchBranch: 'Nhiều nhánh',
  Loop: 'Vòng lặp',
};
const EDGE_VI = (e?: string) => (!e ? '' : e === 'yes' ? '[Nếu đúng] ' : e === 'no' ? '[Nếu không] ' : e === 'loop' ? '[Mỗi vòng] ' : e === 'default' ? '[Còn lại] ' : `[${e.slice(5)}] `);

/** Cây đọc được (dạng chữ) của bản nháp nội bộ — để báo cáo "Lark đã lưu đúng cây này". */
export function internalTreeText(draft: J): string {
  return internalOutline(draft)
    .nodes.map((n) => `${'  '.repeat(n.depth)}• ${EDGE_VI(n.edge)}${n.title || TYPE_VI[n.type] || n.type}`)
    .join('\n');
}
