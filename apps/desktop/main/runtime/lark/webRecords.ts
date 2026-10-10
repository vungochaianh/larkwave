/**
 * Đọc ĐỦ và ghi bản ghi Bitable qua PHIÊN LARK WEB (không cần App ID). THUẦN — kiểm bằng fixture.
 * Đo thật trên Base Test ngày 10/10/2026 (docs/lark-web-api.md mục 13):
 *
 *   Đọc theo trang  GET  /space/api/v1/bitable/:token/records?tableID=&viewID=&offset=&limit=&removeFmlExtra=true
 *                   → data {encoding 0 (gzip+base64) | 17 (JSON), records} → {recordMap, groupList[0].recordIDList,
 *                     tableRecordNum, viewRecordNum, …}. Trang Lark chia đôi khi lỗi, nên limit ≤ 1000.
 *   Đọc đúng id     POST /space/api/v2/bitable/records/ {token, tableId, historyLevel:0, payload: JSON({rec:{}}), removeFmlExtra}
 *                   → data.gzipRecords (recordMap) — dùng để ĐỌC LẠI sau khi ghi.
 *   Ghi             lớp lệnh trong trang: `tableOperate.addRecords({tableId, count})` → [{recordId}];
 *                   `tableOperate.setRecords({tableId, data:{rec:{fld:{type, value}}}})` → result 2.
 */
import type { EncField } from './bitableEncode';

/* eslint-disable @typescript-eslint/no-explicit-any */
type J = any;

export const RECORDS_PAGE_SIZE = 1000;
/** Trần an toàn: bảng lớn hơn thì báo rõ (không im lặng cắt). */
export const RECORDS_MAX = 200_000;

export function recordsPagePath(token: string, tableId: string, offset: number, limit = RECORDS_PAGE_SIZE, viewId = ''): string {
  const q = new URLSearchParams({ tableID: tableId, viewID: viewId, offset: String(offset), limit: String(limit), viewLazyLoad: 'true', removeFmlExtra: 'true' });
  return `/space/api/v1/bitable/${encodeURIComponent(token)}/records?${q}`;
}

export const RECORDS_BY_ID_PATH = '/space/api/v2/bitable/records/';
export function recordsByIdBody(token: string, tableId: string, ids: string[]): J {
  return { token, tableId, historyLevel: 0, payload: JSON.stringify(Object.fromEntries(ids.map((id) => [id, {}]))), removeFmlExtra: true };
}

export interface RecordsPage {
  recordMap: Record<string, Record<string, J>>;
  /** Thứ tự bản ghi của trang (theo view), nếu máy chủ trả. */
  order: string[];
  /** Tổng số bản ghi máy chủ báo (của view nếu có view, không thì của bảng). */
  total: number | null;
}

/** `records` đã giải (JSON) → trang. */
export function parseRecordsPage(rec: J, viewId = ''): RecordsPage {
  const rm = rec?.recordMap && typeof rec.recordMap === 'object' ? rec.recordMap : {};
  const order: string[] = [];
  for (const g of Array.isArray(rec?.groupList) ? rec.groupList : []) for (const id of Array.isArray(g?.recordIDList) ? g.recordIDList : []) if (rm[id] && !order.includes(id)) order.push(id);
  for (const id of Object.keys(rm)) if (!order.includes(id)) order.push(id);
  const viewNum = typeof rec?.viewRecordNum === 'number' && rec.viewRecordNum > 0 ? rec.viewRecordNum : null;
  const tableNum = typeof rec?.tableRecordNum === 'number' ? rec.tableRecordNum : null;
  return { recordMap: rm, order, total: viewId && viewNum !== null ? viewNum : tableNum ?? viewNum };
}

export interface AllRecords {
  ids: string[];
  recordMap: Record<string, Record<string, J>>;
  total: number | null;
  pages: number;
}

/**
 * Đọc HẾT các trang tới khi đủ số máy chủ báo. Không bao giờ dừng im lặng ở 100/500: thiếu thì NÉM
 * lỗi kèm số đã đọc / tổng — người dùng phải biết báo cáo của họ đang thiếu dòng.
 */
export async function readAllRecords(fetchPage: (offset: number, limit: number) => Promise<RecordsPage>, opts: { pageSize?: number; max?: number } = {}): Promise<AllRecords> {
  const size = Math.max(50, Math.min(RECORDS_PAGE_SIZE, opts.pageSize ?? RECORDS_PAGE_SIZE));
  const max = opts.max ?? RECORDS_MAX;
  const ids: string[] = [];
  const seen = new Set<string>();
  const recordMap: Record<string, Record<string, J>> = {};
  let total: number | null = null;
  let pages = 0;
  for (let offset = 0; ; offset += size) {
    const p = await fetchPage(offset, size);
    pages++;
    if (p.total !== null) total = p.total;
    let fresh = 0;
    for (const id of p.order) {
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
      recordMap[id] = p.recordMap[id];
      fresh++;
    }
    if (total !== null && ids.length >= total) break;
    if (!p.order.length || fresh === 0) break; // máy chủ hết dữ liệu
    if (ids.length >= max) throw new Error(`Bảng có hơn ${max} bản ghi — quá lớn để đọc một lần qua phiên web; lọc theo view hoặc chia nhỏ.`);
  }
  if (total !== null && ids.length !== total) {
    throw new Error(`Đọc thiếu dữ liệu: mới lấy được ${ids.length}/${total} bản ghi (sau ${pages} trang). Không dựng báo cáo/tệp trên dữ liệu thiếu — thử lại.`);
  }
  return { ids, recordMap, total, pages };
}

/** Bảng đầy đủ → hàng cho tệp (hàng đầu là tên cột). Kiểm số dòng nguồn = số dòng dữ liệu trong tệp. */
export function rowsForFile(
  fields: EncField[],
  all: AllRecords,
  toSimple: (f: EncField, v: J) => unknown,
  opts: { fieldNames?: string[]; withRecordId?: boolean } = {},
): { rows: unknown[][]; sourceRows: number; fileRows: number } {
  const cols = opts.fieldNames?.length ? opts.fieldNames.map((n) => fields.find((f) => f.name === n || f.id === n)).filter((f): f is EncField => !!f) : fields;
  const header = [...(opts.withRecordId ? ['record_id'] : []), ...cols.map((f) => f.name)];
  const rows: unknown[][] = [header];
  for (const id of all.ids) {
    const r = all.recordMap[id] || {};
    rows.push([...(opts.withRecordId ? [id] : []), ...cols.map((f) => {
      const cell = r[f.id];
      return toSimple(f, cell && typeof cell === 'object' && 'value' in cell ? cell.value : cell);
    })]);
  }
  const fileRows = rows.length - 1;
  if (fileRows !== all.ids.length) throw new Error(`Lệch số dòng: ${all.ids.length} dòng nguồn → ${fileRows} dòng trong tệp.`);
  return { rows, sourceRows: all.ids.length, fileRows };
}

// ── đoạn chạy TRONG trang Base ─────────────────────────────────────────────────────────────────

const CTX_JS = `
  var ctxs = window.bitableConnectContexts ? Array.from(window.bitableConnectContexts) : [];
  var c = null;
  for (var i = 0; i < ctxs.length; i++) { try { if (ctxs[i].base && ctxs[i].base.getToken && ctxs[i].base.getToken() === OP.token) c = ctxs[i]; } catch (e) {} }
  if (!c) return { ok: false, error: 'no-context', hint: 'Trang Lark chưa mở đúng Base này.' };
  var to = c.operate.tableOperate;
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  // BẢNG PHẢI ĐƯỢC TẢI trước khi ghi. Đo 10/10/2026: bảng đích không phải bảng đang mở thì addRecords
  // vẫn tạo dòng nhưng setRecords ngay sau trả 0 (không đổi gì) vì trang đang tải bảng chen giữa —
  // dòng mới bị trống. Tải bảng trước (fetchTable, đúng việc loadRecords của Lark làm) thì ghi đủ.
  var mt0 = to.base.getTableById(OP.tableId);
  if (!mt0) return { ok: false, error: 'no-table', hint: 'Base không có bảng ' + OP.tableId };
  if (!mt0.tableLoaded) { try { await to.getBaseOperate().fetchTable(OP.tableId); } catch (e) {} }
  for (var w = 0; w < 40 && !(to.base.getTableById(OP.tableId) || {}).tableLoaded; w++) await sleep(250);
  var allNull = function (cells) { return Object.keys(cells).every(function (k) { return cells[k] && (cells[k].value === null || cells[k].value === undefined); }); };
  var setWithRetry = async function (data, okWhenZero) {
    var r = null;
    for (var t = 0; t < 4; t++) {
      r = await to.setRecords({ tableId: OP.tableId, data: data }, {});
      if (r && (r.result === 2 || (r.result === 0 && okWhenZero))) return r;
      await sleep(700);
    }
    return r;
  };`;

/**
 * Ghi bản ghi: tạo MỚI (`creates`, theo lô 100: addRecords rồi setRecords) và/hoặc sửa ô của bản ghi
 * có sẵn (`updates`). Giá trị đã là ô NỘI BỘ ({type, value}) — mã hoá ở main (bitableEncode).
 */
export function writeRecordsScript(op: { token: string; tableId: string; creates: Record<string, J>[]; updates: { recordId: string; cells: Record<string, J> }[] }): string {
  return `(async () => {
  var OP = ${JSON.stringify(op)};
  var out = { ok: true, created: [], updated: [], errors: [] };
  try {${CTX_JS}
    var BATCH = 100;
    for (var s = 0; s < OP.creates.length; s += BATCH) {
      var part = OP.creates.slice(s, s + BATCH);
      var ra = await to.addRecords({ tableId: OP.tableId, count: part.length }, {});
      if (!ra || ra.result !== 2 || !Array.isArray(ra.data) || ra.data.length !== part.length) { out.ok = false; out.errors.push({ step: 'addRecords', at: s, result: ra && ra.result, reason: ra && ra.reason }); break; }
      var data = {}, empty = true;
      for (var k = 0; k < part.length; k++) { data[ra.data[k].recordId] = part[k]; if (!allNull(part[k])) empty = false; }
      var rs = await setWithRetry(data, empty);
      if (!rs || (rs.result !== 2 && !(rs.result === 0 && empty))) { out.ok = false; out.errors.push({ step: 'setRecords(new)', at: s, result: rs && rs.result, reason: rs && rs.reason }); }
      for (var k2 = 0; k2 < part.length; k2++) out.created.push(ra.data[k2].recordId);
    }
    for (var u = 0; u < OP.updates.length; u += BATCH) {
      var upart = OP.updates.slice(u, u + BATCH);
      var udata = {};
      for (var q = 0; q < upart.length; q++) udata[upart[q].recordId] = upart[q].cells;
      // Sửa: 0 = "không đổi gì" (giá trị đã đúng như vậy) là hợp lệ — đọc lại ở main sẽ xác nhận.
      var ru = await setWithRetry(udata, true);
      if (!ru || (ru.result !== 2 && ru.result !== 0)) { out.ok = false; out.errors.push({ step: 'setRecords(update)', at: u, result: ru && ru.result, reason: ru && ru.reason }); continue; }
      for (var q2 = 0; q2 < upart.length; q2++) out.updated.push(upart[q2].recordId);
    }
    return out;
  } catch (e) { out.ok = false; out.errors.push({ step: 'exception', error: String(e && e.message || e) }); return out; }
})()`;
}

/** Thêm lựa chọn vào cột chọn (chỉ cộng thêm) — dùng khi người dùng CHO PHÉP tạo lựa chọn còn thiếu. */
export function addOptionsScript(op: { token: string; tableId: string; adds: { fieldId: string; names: string[] }[] }): string {
  return `(async () => {
  var OP = ${JSON.stringify(op)};
  var out = { ok: true, steps: [] };
  try {${CTX_JS}
    for (var i2 = 0; i2 < OP.adds.length; i2++) {
      var r = await to.addSelectFieldOption({ tableId: OP.tableId, fieldId: OP.adds[i2].fieldId, names: OP.adds[i2].names });
      out.steps.push({ fieldId: OP.adds[i2].fieldId, result: r && r.result, reason: r && r.reason });
      if (!r || (r.result !== 2 && r.result !== 0)) out.ok = false;
    }
    return out;
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
})()`;
}

/** Mục đính kèm (đúng khuôn trang Lark tạo sau khi tải lên). */
export function attachmentItem(f: { token: string; name: string; size: number; mime: string }, now = Date.now()): J {
  return { id: f.token, attachmentToken: f.token, name: f.name, text: f.name, size: f.size, mimeType: f.mime, timeStamp: now };
}

/**
 * Đính tệp vào ô Tệp đính kèm: GHI THÊM vào sau các tệp đang có (mặc định) — chỉ thay hết khi
 * `replace` (người dùng nói rõ). `current` = ô đọc từ máy chủ ngay trước khi ghi. Trả danh sách token
 * trước/sau để main đối chiếu với bản đọc lại.
 */
export function attachScript(op: { token: string; tableId: string; recordId: string; fieldId: string; items: J[]; replace?: boolean; current: J[] }): string {
  return `(async () => {
  var OP = ${JSON.stringify(op)};
  try {${CTX_JS}
    var mt = to.base.getTableById(OP.tableId);
    if (!mt) return { ok: false, error: 'no-table' };
    // Giá trị hiện tại lấy từ MÁY CHỦ (main đọc trước) — bảng lớn tải từng phần nên mô hình trong
    // trang có thể chưa có bản ghi này; dựa vào nó là ghi đè mất tệp cũ. Gộp thêm bản trong trang.
    var cur = null; try { cur = mt.getCellValue(OP.recordId, OP.fieldId); } catch (e) {}
    var before = (Array.isArray(OP.current) ? OP.current : []).slice();
    (Array.isArray(cur) ? cur : []).forEach(function (x) { if (x && !before.some(function (b) { return b && b.attachmentToken === x.attachmentToken; })) before.push(x); });
    var next = OP.replace ? OP.items.slice() : before.concat(OP.items.filter(function (x) { return !before.some(function (b) { return b && b.attachmentToken === x.attachmentToken; }); }));
    var data = {}; data[OP.recordId] = {}; data[OP.recordId][OP.fieldId] = { type: 17, value: next };
    var r = await setWithRetry(data, false);
    return { ok: !!r && r.result === 2, result: r && r.result, reason: r && r.reason, before: before.map(function (b) { return b && b.attachmentToken; }), after: next.map(function (b) { return b.attachmentToken; }) };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
})()`;
}

/** So từng ô đã ghi với bản đọc lại từ máy chủ. */
export function compareWritten(
  fields: EncField[],
  wrote: { recordId: string; cells: Record<string, { type: number; value: J }> }[],
  back: Record<string, Record<string, J>>,
  matches: (f: EncField, expected: J, actual: J) => boolean,
): { checked: number; mismatches: { record_id: string; field: string; expected: J; actual: J }[]; missing: string[] } {
  const mismatches: { record_id: string; field: string; expected: J; actual: J }[] = [];
  const missing: string[] = [];
  let checked = 0;
  for (const w of wrote) {
    const row = back[w.recordId];
    if (!row) {
      missing.push(w.recordId);
      continue;
    }
    for (const [fid, cell] of Object.entries(w.cells)) {
      const f = fields.find((x) => x.id === fid);
      if (!f) continue;
      checked++;
      const got = row[fid];
      const actual = got && typeof got === 'object' && 'value' in got ? got.value : got;
      if (!matches(f, cell.value, actual)) mismatches.push({ record_id: w.recordId, field: f.name, expected: cell.value, actual: actual ?? null });
    }
  }
  return { checked, mismatches, missing };
}

/** Luật gộp tệp đính kèm (cùng luật với attachScript): thêm vào sau, bỏ trùng token; `replace` = thay hết. */
export function mergeAttachments(current: J[], items: J[], replace = false): J[] {
  if (replace) return items.slice();
  const out = (Array.isArray(current) ? current : []).filter((x) => x && x.attachmentToken);
  for (const it of items) if (!out.some((b) => b.attachmentToken === it.attachmentToken)) out.push(it);
  return out;
}
