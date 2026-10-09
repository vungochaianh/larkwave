import { randomBytes } from 'node:crypto';
import type { WebTable } from './larkWebApi';

/**
 * Dựng CẤU TRÚC Base (thêm bảng / cột / lựa chọn) qua phiên Lark web — THUẦN (không electron), để
 * kiểm bằng fixture.
 *
 * Vì sao không phải một endpoint HTTP: đo ngày 09/10/2026 trên Base Test, thêm bảng/cột trên Lark
 * web KHÔNG đi qua HTTP. Trang gửi một changeset cộng tác (`USER_CHANGES`, `operations` nén gzip)
 * qua websocket "frontier", kèm `member_id`, `user_ticket`, `localRev` — tự dựng lại là phải giữ
 * đúng số phiên bản của chính trang (lệch là `accept_commit_error_rev`). Thay vào đó, ta gọi đúng
 * LỚP LỆNH mà giao diện Lark gọi khi người dùng bấm (đo bằng cách bọc các hàm này rồi thao tác tay):
 *
 *   ctx = [...window.bitableConnectContexts].find(c => c.base.getToken() === <token>)
 *   ctx.operate.baseOperate.addTable({ sourceTableId: null, parentId: null, exInfo: { contentCreation: false } })
 *       → { result: 2, data: { tableId }, operation: { actions: [{ data: { snapshot: { recordMap } } }] } }
 *   ctx.operate.baseOperate.setBlock({ id: tableId, name })                    (đổi tên bảng)
 *   ctx.operate.tableOperate.addField({ tableId, data: { type, name, property, fieldUIType, exInfo } })
 *       → { result: 2, data: { fieldId } }
 *   ctx.operate.tableOperate.setField({ tableId, fieldId, data: { ...field, name } })   (đổi tên cột chính)
 *   ctx.operate.tableOperate.addSelectFieldOption({ tableId, fieldId, names: [...] })
 *   ctx.operate.tableOperate.delRecords({ tableId, recordIds })               (CHỈ dòng trống vừa tạo)
 *
 * `result`: 2 = thành công, 0 = không có gì đổi, 1 = lỗi (kèm `reason`). Trang tự lo phiên bản,
 * đồng bộ và lưu — y như người bấm. Sau đó ta ĐỌC LẠI bằng clientvars (HTTP) để xác minh.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type J = any;

/** Loại cột agent được tạo. Mỗi loại = đúng `type`/`fieldUIType`/`property` trang Lark gửi (đo). */
export const FIELD_KINDS: Record<string, { type: number; ui: string; label: string; property?: (s: FieldSpec) => J }> = {
  text: { type: 1, ui: 'Text', label: 'Văn bản' },
  number: { type: 2, ui: 'Number', label: 'Số', property: () => ({ formatter: '0' }) },
  single_select: { type: 3, ui: 'SingleSelect', label: 'Chọn một', property: (s) => ({ options: optionList(s.options), optionsType: 0 }) },
  multi_select: { type: 4, ui: 'MultiSelect', label: 'Chọn nhiều', property: (s) => ({ options: optionList(s.options), optionsType: 0 }) },
  date: {
    type: 5,
    ui: 'DateTime',
    label: 'Ngày',
    property: (s) => ({ autoFill: false, dateFormat: 'yyyy/MM/dd', timeFormat: s.with_time ? 'HH:mm' : '' }),
  },
  checkbox: { type: 7, ui: 'Checkbox', label: 'Hộp kiểm' },
  person: { type: 11, ui: 'User', label: 'Người', property: (s) => ({ multiple: !!s.multiple }) },
  phone: { type: 13, ui: 'Phone', label: 'Số điện thoại' },
  url: { type: 15, ui: 'Url', label: 'Liên kết URL' },
  attachment: { type: 17, ui: 'Attachment', label: 'Tệp đính kèm' },
};

/** Tên gọi khác agent hay dùng → loại chuẩn. */
const KIND_ALIAS: Record<string, string> = {
  string: 'text',
  'văn bản': 'text',
  select: 'single_select',
  singleselect: 'single_select',
  single_option: 'single_select',
  option: 'single_select',
  'chọn một': 'single_select',
  multiselect: 'multi_select',
  'chọn nhiều': 'multi_select',
  datetime: 'date',
  'ngày': 'date',
  user: 'person',
  'người': 'person',
  bool: 'checkbox',
  boolean: 'checkbox',
  link: 'url',
  file: 'attachment',
};

export interface FieldSpec {
  name: string;
  type: string;
  options?: string[];
  multiple?: boolean;
  with_time?: boolean;
}

const fold = (s: string) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();

const rid = (p: string) => p + randomBytes(9).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 7);

function optionList(names?: string[]): { name: string; color: number; id: string }[] {
  const seen = new Set<string>();
  const out: { name: string; color: number; id: string }[] = [];
  for (const n of names || []) {
    const name = String(n ?? '').trim();
    if (!name || seen.has(fold(name))) continue;
    seen.add(fold(name));
    out.push({ name, color: out.length % 54, id: rid('opt') });
  }
  return out;
}

export function kindOf(t: unknown): string | null {
  const k = fold(String(t ?? '')).replace(/[\s-]+/g, '_');
  if (FIELD_KINDS[k]) return k;
  const raw = fold(String(t ?? ''));
  const a = Object.entries(KIND_ALIAS).find(([key]) => fold(key) === raw || fold(key).replace(/\s+/g, '_') === k)?.[1];
  return a && FIELD_KINDS[a] ? a : null;
}

/** Một cột cần tạo → `data` cho tableOperate.addField (đúng khuôn trang Lark gửi). */
export function fieldData(spec: FieldSpec): { ok: true; data: J } | { ok: false; error: string } {
  const name = String(spec?.name ?? '').trim();
  if (!name) return { ok: false, error: 'Cột thiếu tên.' };
  if (name.length > 100) return { ok: false, error: `Tên cột «${name.slice(0, 30)}…» dài quá 100 ký tự.` };
  const k = kindOf(spec?.type || 'text');
  if (!k) return { ok: false, error: `Cột «${name}»: chưa hỗ trợ loại «${spec?.type}». Được: ${Object.keys(FIELD_KINDS).join(', ')}.` };
  const K = FIELD_KINDS[k];
  if ((k === 'single_select' || k === 'multi_select') && !(spec.options || []).some((o) => String(o ?? '').trim()))
    return { ok: false, error: `Cột «${name}» (${K.label}) cần ít nhất một lựa chọn trong \`options\`.` };
  return {
    ok: true,
    data: {
      type: K.type,
      name,
      property: K.property ? K.property(spec) : null,
      fieldUIType: K.ui,
      exInfo: { disableCredential: true, colOrCustomRowType: 'custom', customRows: 5 },
      defaultValueRule: null,
    },
  };
}

export interface StructurePlan {
  /** Cột sẽ tạo (data cho addField). */
  add: J[];
  /** Cột đã có cùng tên — bỏ qua (KHÔNG ghi đè, không đổi kiểu). */
  skipped: string[];
  /** Thêm lựa chọn vào cột chọn ĐÃ CÓ: chỉ những tên chưa có. */
  addOptions: { fieldId: string; fieldName: string; names: string[] }[];
  errors: string[];
}

/**
 * Lập kế hoạch thêm cột/lựa chọn vào một bảng (đã có hoặc vừa tạo) — chỉ CỘNG THÊM: cột trùng tên
 * thì bỏ qua (kèm ghi chú), lựa chọn đã có thì bỏ qua. Không bao giờ đổi kiểu hay xoá gì.
 */
export function planFields(table: Pick<WebTable, 'fields'> | null, specs: FieldSpec[], addOptions: { field_name: string; options: string[] }[] = []): StructurePlan {
  const plan: StructurePlan = { add: [], skipped: [], addOptions: [], errors: [] };
  const existing = table?.fields || [];
  const names = new Set(existing.map((f) => fold(f.name)));
  for (const s of specs || []) {
    if (names.has(fold(s?.name))) {
      plan.skipped.push(String(s.name));
      continue;
    }
    const r = fieldData(s);
    if ('error' in r) plan.errors.push(r.error);
    else {
      plan.add.push(r.data);
      names.add(fold(s.name));
    }
  }
  for (const a of addOptions || []) {
    const f = existing.find((x) => fold(x.name) === fold(a?.field_name));
    if (!f) {
      plan.errors.push(`Không thấy cột «${a?.field_name}» để thêm lựa chọn.`);
      continue;
    }
    if (f.type !== 3 && f.type !== 4) {
      plan.errors.push(`Cột «${f.name}» là ${f.typeName}, không phải cột chọn — không thêm lựa chọn được.`);
      continue;
    }
    const have = new Set((f.options || []).map((o) => fold(o.name)));
    const fresh = [...new Set((a.options || []).map((o) => String(o ?? '').trim()).filter((o) => o && !have.has(fold(o))))];
    if (fresh.length) plan.addOptions.push({ fieldId: f.id, fieldName: f.name, names: fresh });
  }
  return plan;
}

/**
 * Đoạn JS chạy TRONG trang Base của Lark: tìm ngữ cảnh của đúng Base, chạy lần lượt các lệnh và
 * trả kết quả từng lệnh. Không bao giờ ném — lỗi nằm trong kết quả.
 *
 * `removePlaceholders`: Lark tự thêm 5 dòng TRỐNG khi tạo bảng (thấy trong snapshot của addTable).
 * Chỉ xoá những dòng có id nằm trong snapshot của CHÍNH lần tạo bảng này VÀ vẫn hoàn toàn trống
 * lúc xoá — không đụng tới bất kỳ dòng nào khác.
 */
export function structureScript(op: {
  token: string;
  createTable?: { name: string; primaryFieldName?: string; removePlaceholders?: boolean };
  tableId?: string;
  fields: J[];
  addOptions: { fieldId: string; names: string[] }[];
}): string {
  return `(async () => {
  var OP = ${JSON.stringify(op)};
  var out = { ok: true, steps: [] };
  function rs(r) { return r ? { result: r.result, reason: r.reason, data: r.data } : null; }
  try {
    var ctxs = window.bitableConnectContexts ? Array.from(window.bitableConnectContexts) : [];
    var c = null;
    for (var i = 0; i < ctxs.length; i++) { try { if (ctxs[i].base && ctxs[i].base.getToken && ctxs[i].base.getToken() === OP.token) c = ctxs[i]; } catch (e) {} }
    if (!c) return { ok: false, error: 'no-context', hint: 'Trang Lark chưa mở đúng Base này.' };
    var bo = c.operate.baseOperate, to = c.operate.tableOperate;
    var tid = OP.tableId, placeholders = [];
    if (OP.createTable) {
      var r = await bo.addTable({ sourceTableId: null, parentId: null, exInfo: { contentCreation: false } });
      out.steps.push({ op: 'addTable', r: rs(r) });
      if (!r || r.result !== 2 || !r.data || !r.data.tableId) return Object.assign(out, { ok: false, error: 'add-table-failed' });
      tid = r.data.tableId; out.tableId = tid;
      try { var acts = (r.operation && r.operation.actions) || []; for (var a = 0; a < acts.length; a++) { var snap = acts[a].data && acts[a].data.snapshot; if (snap && snap.recordMap) placeholders = placeholders.concat(Object.keys(snap.recordMap)); } } catch (e) {}
      var rn = await bo.setBlock({ id: tid, name: OP.createTable.name });
      out.steps.push({ op: 'renameTable', r: rs(rn) });
      if (OP.createTable.primaryFieldName) {
        try {
          var tb = c.base.getTable(tid), pf = tb.getPrimaryField().toJSON();
          if (pf.name !== OP.createTable.primaryFieldName) {
            var rp = await to.setField({ tableId: tid, fieldId: pf.id, data: Object.assign({}, pf, { name: OP.createTable.primaryFieldName }) }, {});
            out.steps.push({ op: 'renamePrimary', r: rs(rp) });
          }
        } catch (e) { out.steps.push({ op: 'renamePrimary', error: String(e && e.message || e) }); }
      }
    }
    if (!tid) return { ok: false, error: 'no-table' };
    out.added = [];
    for (var f = 0; f < OP.fields.length; f++) {
      var rf = await to.addField({ tableId: tid, data: OP.fields[f] }, {});
      out.steps.push({ op: 'addField', name: OP.fields[f].name, r: rs(rf) });
      if (rf && rf.result === 2 && rf.data && rf.data.fieldId) out.added.push({ name: OP.fields[f].name, fieldId: rf.data.fieldId });
      else out.ok = false;
    }
    for (var o = 0; o < OP.addOptions.length; o++) {
      var ro = await to.addSelectFieldOption({ tableId: tid, fieldId: OP.addOptions[o].fieldId, names: OP.addOptions[o].names });
      out.steps.push({ op: 'addOptions', fieldId: OP.addOptions[o].fieldId, r: rs(ro) });
      if (!ro || (ro.result !== 2 && ro.result !== 0)) out.ok = false;
    }
    if (OP.createTable && OP.createTable.removePlaceholders !== false && placeholders.length) {
      try {
        var tb2 = c.base.getTable(tid), current = tb2.getRecordIdList(), empty = [];
        for (var p = 0; p < placeholders.length; p++) {
          var id = placeholders[p];
          if (current.indexOf(id) < 0) continue;
          var d = tb2.getRecordDataById(id) || {};
          var blank = true;
          for (var k in d) { var v = d[k]; var val = v && typeof v === 'object' && 'value' in v ? v.value : v; if (val !== null && val !== undefined && val !== '' && !(Array.isArray(val) && !val.length)) { blank = false; break; } }
          if (blank) empty.push(id);
        }
        if (empty.length) { var rd = await to.delRecords({ tableId: tid, recordIds: empty }, {}); out.steps.push({ op: 'removePlaceholders', count: empty.length, r: rs(rd) }); out.removedPlaceholders = (rd && rd.result === 2) ? empty.length : 0; }
      } catch (e) { out.steps.push({ op: 'removePlaceholders', error: String(e && e.message || e) }); }
    }
    return out;
  } catch (e) { return Object.assign(out, { ok: false, error: String(e && e.message || e) }); }
})()`;
}

/** Đọc lại sau khi dựng: bảng có đúng tên, cột cần có đều có với đúng kiểu. */
export function verifyStructure(table: WebTable | null, want: { name?: string; fields: J[] }): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  if (!table) return { ok: false, problems: ['Không thấy bảng khi đọc lại cấu trúc Base.'] };
  if (want.name && fold(table.name) !== fold(want.name)) problems.push(`Tên bảng đọc lại là «${table.name}», không phải «${want.name}».`);
  for (const f of want.fields) {
    const got = table.fields.find((x) => fold(x.name) === fold(f.name));
    if (!got) problems.push(`Thiếu cột «${f.name}» khi đọc lại.`);
    else if (got.type !== f.type) problems.push(`Cột «${f.name}» đọc lại là kiểu ${got.typeName}, không phải kiểu đã tạo.`);
  }
  return { ok: !problems.length, problems };
}
