/**
 * GHI vào Lark qua PHIÊN LARK WEB đang đăng nhập — KHÔNG cần App ID (mặc định của Larkwave), có Open API
 * (custom app) làm đường thay thế khi phiên web chưa đăng nhập hoặc hỏng.
 *
 *   lark_web_read_records       đọc bản ghi (đủ trang, báo tổng — không cắt im lặng)
 *   lark_export_table_file      ĐỌC HẾT một bảng → tệp .xlsx/.csv cục bộ ("N dòng nguồn → N dòng trong tệp")
 *   lark_web_write_records      thêm bản ghi MỚI, mã hoá đúng kiểu từng cột, đọc lại từng ô (cộng thêm)
 *   lark_web_update_records     sửa ô của bản ghi CÓ SẴN (ghi đè → luôn hỏi)
 *   lark_web_attach_file        đính tệp vào ô Tệp đính kèm — GHI THÊM, đọc lại token (cộng thêm)
 *   lark_web_drive_upload       tải tệp lên một thư mục Drive (cộng thêm)
 *   lark_web_import_as_sheet    .xlsx/.csv → Lark Sheets MỚI, đọc lại sheet/dòng (cộng thêm)
 *   lark_web_import_as_doc      .docx/.md/.txt → Lark Docs MỚI, đọc lại tiêu đề/đoạn (cộng thêm)
 *   lark_web_sheet_write_range  ghi một vùng vào Lark Sheets CÓ SẴN (ghi đè → luôn hỏi)
 *
 * Gửi tệp/tin vào nhóm chat KHÔNG có ở đây: vẫn là `send_file`/messaging qua Open API và LUÔN hỏi.
 * Đo + khuôn: docs/lark-web-api.md mục 13–15; mã hoá ô: bitableEncode.ts.
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { getLarkWebSession } from '../larkWebSession';
import { baseTokenFromUrl, clientVarsPath, decodeLarkGz, parseBaseMeta, type WebField } from '../larkWebApi';
import { cellMatches, encodeCell, fold, resolveField, simpleValue, type DirectoryUser, type EncField, type EncodeCtx } from '../bitableEncode';
import { addOptionsScript, attachScript, attachmentItem, compareWritten, mergeAttachments, rowsForFile, writeRecordsScript, type AllRecords } from '../webRecords';
import { compareSheetBack, driveFileUrl, folderTokenFrom, importTargetFor, parseA1, sheetTokenFrom } from '../webFiles';
import { buildCsv, buildDocx, buildXlsx, FORMAT_META, safeFileName } from '../fileBuild';
import { buildFilePreview } from '../filePreview';
import { compositeKey, openApiUpsert, openApiUpsertPlan, planSummary, planUpsert, type UpsertPlan } from '../upsertPlan';
import { extractOfficeText } from '../ooxml';
import { resolveToolFile } from '../fileContext';
import { getFileOutDir } from './files';
import { describePlan, resolveDeleteTargets, type DeletePlan } from '../webDelete';
import { enc, str, type LarkToolDef } from './types';
import type { LarkClient } from '../larkClient';

/* eslint-disable @typescript-eslint/no-explicit-any */
type J = any;

const MAX_WRITE_RECORDS = 500;
const MAX_SHEET_CELLS = 5000;

const web = () => getLarkWebSession();
const webReady = () => !!web().webHost();

/**
 * Kế hoạch XOÁ đã tính cho một input (preflight → hộp xác nhận → exec dùng chung, tối đa 15 phút).
 * Exec xoá đúng thứ người dùng đã thấy trong hộp xác nhận — không quét lại rồi tự mở rộng.
 */
const approvedPlans = new Map<string, { at: number; plan: DeletePlan }>();
const PLAN_TTL = 15 * 60_000;
const planKey = (i: J) => JSON.stringify([tokenOf(i), i?.tables ?? null, i?.automations ?? null, i?.workflows ?? null]);
async function planDelete(i: J): Promise<{ ok: true; plan: DeletePlan } | { ok: false; errors: string[] }> {
  const key = planKey(i);
  const hit = approvedPlans.get(key);
  if (hit && Date.now() - hit.at < PLAN_TTL) return { ok: true, plan: hit.plan };
  const token = tokenOf(i);
  if (!token) return { ok: false, errors: ['Thiếu app_token (token hoặc URL của Base).'] };
  const r = resolveDeleteTargets(i ?? {}, await web().deleteCatalog(token));
  if (!('errors' in r)) approvedPlans.set(key, { at: Date.now(), plan: r.plan });
  return r;
}

const MIME: Record<string, string> = {
  ...Object.fromEntries(Object.entries(FORMAT_META).map(([k, v]) => [k, v.mime])),
  xls: 'application/vnd.ms-excel',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  zip: 'application/zip',
  json: 'application/json',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
export const mimeFor = (name: string) => MIME[extname(name).replace(/^\./, '').toLowerCase()] || 'application/octet-stream';

function tokenOf(i: J): string {
  const raw = String(i.app_token || i.base_token || i.url || '').trim();
  if (!raw) throw new Error('Thiếu Base: truyền `app_token` (hoặc link …/base/<token>).');
  if (/^https?:/i.test(raw)) {
    const r = baseTokenFromUrl(raw);
    if (r.token) return r.token;
    throw new Error('Link Wiki: dùng token Base từ lark_web_list_bases (trường token).');
  }
  return raw;
}

/**
 * Tệp cục bộ được phép đưa lên Lark: tệp trong thư mục của hội thoại/lượt này (tệp agent dựng, tệp người
 * dùng đính kèm), thư mục của quy tắc tự động hoá đang chạy, hoặc tệp của hội thoại CŨ nhập từ Toolswave
 * (tự chép sang thư mục hội thoại Larkwave — bản gốc chỉ đọc). `path` tới từ model = dữ liệu không tin
 * được — không chốt là tải được khoá SSH lên Drive. Luật ở filePaths (qua resolveToolFile).
 * `extraRoot` cho đường người dùng bấm trên thẻ tệp (main truyền `userData/lark/work`).
 */
export async function readLocalFile(p: string, extraRoot?: string | null): Promise<{ bytes: Buffer; name: string; mime: string; path: string; copiedFrom?: string }> {
  const asked = String(p || '').trim();
  if (!asked) throw new Error('Thiếu `path` (đường dẫn tệp — lấy nguyên từ kết quả create_file / tệp đính kèm).');
  const r = await resolveToolFile(asked, extraRoot);
  if (r.ok === false) throw new Error(`Chỉ đưa được lên Lark tệp trong thư mục hội thoại / tệp đính kèm / thư mục tự động hoá — ${r.reason}`);
  const st = await stat(r.path).catch(() => null);
  if (!st?.isFile()) throw new Error(`Không tìm thấy tệp: ${basename(r.path)}`);
  const name = basename(r.path);
  return { bytes: await readFile(r.path), name, mime: mimeFor(name), path: r.path, ...(r.copiedFrom ? { copiedFrom: r.copiedFrom } : {}) };
}

const toEnc = (f: WebField): EncField => ({ id: f.id, name: f.name, type: f.type, uiType: f.uiType, isPrimary: f.isPrimary, options: f.options, linkTable: f.linkTable, formatter: f.formatter, multiple: f.multiple });

async function baseMeta(token: string) {
  const j = await web().webJson(clientVarsPath(token, undefined, 0));
  if (j?.code !== 0) throw new Error(`Không đọc được Base (Lark báo ${j?.code}: ${j?.msg || ''}) — kiểm tra quyền xem Base.`);
  return parseBaseMeta(decodeLarkGz(j.data?.base));
}

/** Bảng theo id hoặc TÊN → cấu trúc tươi (cột/kiểu/lựa chọn) + múi giờ của Base. */
export async function tableFor(token: string, key: string): Promise<{ tableId: string; tableName: string; fields: EncField[]; timezone?: string; baseName: string }> {
  const k = String(key ?? '').trim();
  if (!k) throw new Error('Thiếu `table` (tên bảng hoặc table_id).');
  let tableId = /^tbl[A-Za-z0-9]{6,}$/.test(k) ? k : '';
  if (!tableId) {
    const meta = await baseMeta(token);
    const hit = resolveField(meta.tables, k);
    if (!hit) throw new Error(`Không thấy bảng «${k}». Có: ${meta.tables.map((t) => t.name).join(' | ')}.`);
    tableId = hit.id;
  }
  const s = await web().webTableSchema(token, tableId);
  return { tableId, tableName: s.table.name, fields: s.table.fields.map(toEnc), timezone: s.timezone, baseName: s.baseName };
}

function tableUrl(token: string, tableId: string): string {
  const host = web().webHost();
  return host ? `${host}/base/${token}?table=${tableId}` : '';
}

/** Ngữ cảnh mã hoá — chỉ đọc thêm (thành viên, bản ghi bảng liên kết) khi giá trị thật sự cần. */
async function encodeCtxFor(token: string, fields: EncField[], recs: { fields: Record<string, unknown> }[], timezone?: string): Promise<EncodeCtx> {
  const used = new Set<string>();
  for (const r of recs) for (const k of Object.keys(r.fields || {})) {
    const f = resolveField(fields, k);
    if (f) used.add(f.id);
  }
  const usedFields = fields.filter((f) => used.has(f.id));
  const ctx: EncodeCtx = { timezone };
  if (usedFields.some((f) => f.type === 11)) {
    const me = await web().webMe().catch(() => null);
    ctx.me = me ? { id: me.id, name: me.name } : null;
    ctx.users = await web().webMembers(token).catch(() => [] as DirectoryUser[]);
  }
  // Liên kết theo TÊN (không phải rec…) → cần chữ ở cột chính của bảng được liên kết.
  for (const f of usedFields.filter((x) => (x.type === 18 || x.type === 21) && x.linkTable)) {
    const needNames = recs.some((r) => {
      const v = Object.entries(r.fields || {}).find(([k]) => resolveField(fields, k)?.id === f.id)?.[1];
      const list = Array.isArray(v) ? v : v === null || v === undefined ? [] : [v];
      return list.some((x) => !/^rec[A-Za-z0-9]{6,}$/.test(String(x)));
    });
    if (!needNames) continue;
    const lt = await web().webTableSchema(token, f.linkTable!);
    const prim = lt.table.fields.find((x) => x.isPrimary) || lt.table.fields[0];
    const all = await web().webReadAllRecords(token, f.linkTable!);
    ctx.linkRecords = ctx.linkRecords || {};
    ctx.linkRecords[f.linkTable!] = all.ids.map((id) => {
      const c = all.recordMap[id]?.[prim.id];
      return { id, primary: String(simpleValue(toEnc(prim), c && typeof c === 'object' && 'value' in c ? c.value : c, { timezone: lt.timezone }) ?? '') };
    });
  }
  return ctx;
}

interface Prepared {
  ok: true;
  token: string;
  tableId: string;
  tableName: string;
  timezone?: string;
  /** Giá trị THÔ người dùng/model gửi lên của từng dòng (để tính khoá ghi-theo-khoá). */
  raw: Record<string, unknown>[];
  fields: EncField[];
  creates: Record<string, { type: number; value: unknown }>[];
  updates: { recordId: string; cells: Record<string, { type: number; value: unknown }> }[];
  needOptions: { fieldId: string; fieldName: string; names: string[] }[];
}

/** Kiểm + mã hoá TOÀN BỘ trước khi ghi: một ô sai là không ghi gì (không có ghi nửa chừng). */
async function prepareWrite(i: J, mode: 'create' | 'update'): Promise<Prepared | J> {
  const token = tokenOf(i);
  const recs: { record_id?: string; fields: Record<string, unknown> }[] = (Array.isArray(i.records) ? i.records : []).map((r: J) => ({ record_id: r?.record_id ? String(r.record_id) : undefined, fields: r?.fields && typeof r.fields === 'object' ? r.fields : {} }));
  if (!recs.length) return { ok: false, kind: 'invalid', error: 'Thiếu `records` (mảng {fields:{"Tên cột": giá trị}}).' };
  if (recs.length > MAX_WRITE_RECORDS) return { ok: false, kind: 'invalid', error: `Tối đa ${MAX_WRITE_RECORDS} bản ghi mỗi lần gọi — chia nhỏ.` };
  if (mode === 'update' && recs.some((r) => !r.record_id)) return { ok: false, kind: 'invalid', error: 'Sửa bản ghi cần `record_id` cho từng mục.' };
  const t = await tableFor(token, String(i.table ?? i.table_id ?? i.table_name ?? ''));
  const ctx = await encodeCtxFor(token, t.fields, recs, t.timezone);
  const errors: string[] = [];
  const missing = new Map<string, Set<string>>();
  const creates: Prepared['creates'] = [];
  const updates: Prepared['updates'] = [];
  recs.forEach((r, n) => {
    const cells: Record<string, { type: number; value: unknown }> = {};
    for (const [key, val] of Object.entries(r.fields)) {
      const f = resolveField(t.fields, key);
      if (!f) {
        errors.push(`Bản ghi ${n + 1}: không có cột «${key}». Cột có: ${t.fields.map((x) => x.name).join(' | ')}.`);
        continue;
      }
      const e = encodeCell(f, val, ctx);
      if (e.ok) {
        cells[f.id] = e.cell;
        continue;
      }
      const bad = e as { ok: false; error: string; missingOptions?: string[] };
      if (bad.missingOptions?.length && i.create_missing_options === true) {
        if (!missing.has(f.id)) missing.set(f.id, new Set());
        bad.missingOptions.forEach((m) => missing.get(f.id)!.add(m));
      } else errors.push(`Bản ghi ${n + 1}: ${bad.error}${bad.missingOptions?.length ? ' (muốn tạo lựa chọn mới thì người dùng phải yêu cầu; khi đó gọi lại với create_missing_options:true)' : ''}`);
    }
    if (mode === 'create') creates.push(cells);
    else updates.push({ recordId: r.record_id!, cells });
  });
  if (errors.length) return { ok: false, kind: 'invalid', errors: errors.slice(0, 40), hint: 'Sửa giá trị theo lỗi rồi gọi lại — CHƯA ghi gì.' };
  return {
    ok: true,
    token,
    tableId: t.tableId,
    tableName: t.tableName,
    timezone: t.timezone,
    raw: recs.map((r) => r.fields),
    fields: t.fields,
    creates,
    updates,
    needOptions: [...missing.entries()].map(([fieldId, names]) => ({ fieldId, fieldName: t.fields.find((f) => f.id === fieldId)!.name, names: [...names] })),
  };
}

/** Cột khoá của ghi-theo-khoá (`match_by`): mảng tên cột, hoặc một chuỗi. */
export function normMatchBy(v: unknown): string[] {
  const list = Array.isArray(v) ? v : typeof v === 'string' && v.trim() ? [v] : [];
  return [...new Set(list.map((x) => String(x ?? '').trim()).filter(Boolean))].slice(0, 5);
}

const cellVal = (c: J) => (c && typeof c === 'object' && 'value' in c ? c.value : c);

/** Kế hoạch ghi theo khoá trên phiên web — đọc ĐỦ bảng (không ghi gì). */
async function webUpsertPlan(p: Prepared, matchBy: string[]): Promise<{ plan: UpsertPlan } | J> {
  const keyFields = matchBy.map((n) => resolveField(p.fields, n));
  const bad = matchBy.filter((_, k) => !keyFields[k]);
  if (bad.length) return { ok: false, kind: 'invalid', error: `Cột khoá không có trong bảng «${p.tableName}»: ${bad.join(', ')}. Cột có: ${p.fields.map((x) => x.name).join(' | ')}.` };
  const kf = keyFields as EncField[];
  const all = await web().webReadAllRecords(p.token, p.tableId);
  const rawFor = (row: Record<string, unknown>, f: EncField) => Object.entries(row || {}).find(([k]) => resolveField(p.fields, k)?.id === f.id)?.[1];
  const plan = planUpsert(
    all.ids.map((id) => ({ id, key: compositeKey(kf.map((f) => simpleValue(f, cellVal(all.recordMap[id]?.[f.id]), { timezone: p.timezone }))) })),
    p.raw.map((row, n) => ({ key: compositeKey(kf.map((f) => rawFor(row, f))), fields: Object.keys(p.creates[n] || {}) })),
    (n, recId, fid) => {
      const f = p.fields.find((x) => x.id === fid);
      return !!f && cellMatches(f, p.creates[n][fid]?.value, cellVal(all.recordMap[recId]?.[fid]));
    },
  );
  return { plan };
}

/** Ghi (đã qua prepare) → đọc lại TỪNG ô từ máy chủ → kết quả có số liệu kiểm chứng. */
async function execWrite(i: J, mode: 'create' | 'update'): Promise<J> {
  let p = await prepareWrite(i, mode);
  if (!p.ok) return p;
  const matchBy = mode === 'create' ? normMatchBy(i.match_by) : [];
  if (p.needOptions.length) {
    const r = await web().webRunInBase(p.token, addOptionsScript({ token: p.token, tableId: p.tableId, adds: p.needOptions.map((x: J) => ({ fieldId: x.fieldId, names: x.names })) }));
    if (!r?.ok) return { ok: false, error: `Không thêm được lựa chọn mới (${r?.error || JSON.stringify(r?.steps || '').slice(0, 200)}). CHƯA ghi bản ghi nào.` };
    for (let k = 0; k < 8; k++) {
      await new Promise((res) => setTimeout(res, 1500));
      p = await prepareWrite({ ...i, create_missing_options: false }, mode);
      if (p.ok) break;
    }
    if (!p.ok) return { ...p, note: 'Đã thêm lựa chọn nhưng đọc lại cấu trúc chưa thấy — thử lại sau vài giây.' };
  }
  if (mode === 'update') {
    const exist = await web().webRecordsById(p.token, p.tableId, p.updates.map((u: J) => u.recordId));
    const missingIds = p.updates.map((u: J) => u.recordId).filter((id: string) => !exist[id]);
    if (missingIds.length) return { ok: false, error: `Không thấy bản ghi: ${missingIds.slice(0, 10).join(', ')} trong bảng «${p.tableName}». CHƯA ghi gì.` };
  }
  // GHI THEO KHOÁ: dòng có khoá đã có → sửa đúng các ô khác; giống hệt → bỏ qua; chưa có → thêm.
  let plan: UpsertPlan | null = null;
  let creates = p.creates;
  let updates = p.updates;
  if (matchBy.length) {
    const pl = await webUpsertPlan(p, matchBy);
    if (!pl.plan) return pl;
    plan = pl.plan as UpsertPlan;
    creates = plan.creates.map((n) => p.creates[n]);
    updates = plan.updates.map((u) => ({ recordId: u.recordId, cells: Object.fromEntries(u.fields.map((fid) => [fid, p.creates[u.index][fid]])) }));
    if (!creates.length && !updates.length) {
      return {
        ok: !plan.rejected.length,
        via: 'web',
        table: p.tableName,
        table_id: p.tableId,
        match_by: matchBy,
        created: 0,
        updated: 0,
        unchanged: plan.unchanged.length,
        ...(plan.rejected.length ? { rejected: plan.rejected.slice(0, 40) } : {}),
        verified: true,
        url: tableUrl(p.token, p.tableId),
        note: `GHI THEO KHOÁ (${matchBy.join(' + ')}): ${planSummary(plan)} — không có gì cần ghi.`,
      };
    }
  }
  const r = await web().webRunInBase(p.token, writeRecordsScript({ token: p.token, tableId: p.tableId, creates, updates }));
  if (!r || r.error === 'no-context' || r.error === 'base-not-ready') return { ok: false, error: r?.hint || r?.error || 'Trang Base chưa sẵn sàng trong khung Lark.' };
  const wroteCreates = (r.created || []).map((id: string, n: number) => ({ recordId: id, cells: creates[n] }));
  const wroteUpdates = updates.filter((u: J) => (r.updated || []).includes(u.recordId));
  const wrote = mode === 'create' ? [...wroteCreates, ...wroteUpdates] : p.updates.filter((u: J) => (r.updated || []).includes(u.recordId));
  // Đọc lại từ MÁY CHỦ (không tin mô hình trong trang). Đồng bộ trễ vài giây → thử lại.
  let cmp = compareWritten(p.fields, wrote, {}, cellMatches);
  for (let k = 0; k < 8; k++) {
    await new Promise((res) => setTimeout(res, k === 0 ? 1200 : 1800));
    const back = await web().webRecordsById(p.token, p.tableId, wrote.map((w: J) => w.recordId)).catch(() => ({}));
    cmp = compareWritten(p.fields, wrote, back, cellMatches);
    if (!cmp.mismatches.length && !cmp.missing.length) break;
  }
  const want = mode === 'create' ? creates.length + updates.length : p.updates.length;
  const verified = !cmp.mismatches.length && !cmp.missing.length && wrote.length === want;
  return {
    ok: !!r.ok && verified && !plan?.rejected.length,
    via: 'web',
    table: p.tableName,
    table_id: p.tableId,
    written: wrote.length,
    ...(mode === 'create'
      ? { created_record_ids: wroteCreates.map((w: J) => w.recordId), ...(plan ? { updated_record_ids: wroteUpdates.map((w: J) => w.recordId) } : {}) }
      : { updated_record_ids: wrote.map((w: J) => w.recordId) }),
    ...(plan ? { match_by: matchBy, created: wroteCreates.length, updated: wroteUpdates.length, unchanged: plan.unchanged.length, ...(plan.rejected.length ? { rejected: plan.rejected.slice(0, 40) } : {}) } : {}),
    cells_checked: cmp.checked,
    verified,
    ...(cmp.mismatches.length ? { mismatches: cmp.mismatches.slice(0, 20) } : {}),
    ...(cmp.missing.length ? { not_found_on_read_back: cmp.missing } : {}),
    ...(r.errors?.length ? { errors: r.errors } : {}),
    ...(p.needOptions.length ? { options_created: p.needOptions.map((x: J) => `${x.fieldName}: ${x.names.join(' | ')}`) } : {}),
    url: tableUrl(p.token, p.tableId),
    note: verified
      ? `ĐÃ GHI VÀ ĐỌC LẠI KHỚP ${cmp.checked} ô của ${wrote.length} bản ghi${plan ? ` (theo khoá ${matchBy.join(' + ')}: ${planSummary(plan)})` : ''}. Trả lời người dùng kèm link bảng và số dòng/ô đã ghi.`
      : 'CHƯA xác minh được — KHÔNG được nói "đã ghi". Báo người dùng các ô lệch/thiếu ở trên.',
  };
}

// ── Open API (custom app) — đường thay thế ─────────────────────────────────────────────────────

async function openApiCreate(c: LarkClient, i: J): Promise<J> {
  const token = tokenOf(i);
  const table = String(i.table ?? i.table_id ?? '');
  if (!/^tbl/.test(table)) throw new Error('Đường Open API cần `table` là table_id (tbl…).');
  const records = (Array.isArray(i.records) ? i.records : []).map((r: J) => ({ fields: r?.fields || {} }));
  const res = (await c.request('POST', `/open-apis/bitable/v1/apps/${enc(token)}/tables/${enc(table)}/records/batch_create`, { data: { records } })) as J;
  const ids: string[] = (res?.records || []).map((r: J) => r.record_id).filter(Boolean);
  const back = ids.length ? ((await c.request('POST', `/open-apis/bitable/v1/apps/${enc(token)}/tables/${enc(table)}/records/batch_get`, { data: { record_ids: ids } }).catch(() => null)) as J) : null;
  const got = (back?.records || []).length;
  return { ok: ids.length === records.length && got === ids.length, via: 'openapi', written: ids.length, created_record_ids: ids, verified: got === ids.length, note: got === ids.length ? `Đã ghi ${ids.length} bản ghi qua Open API và đọc lại đủ.` : 'Open API: chưa đọc lại đủ bản ghi vừa tạo.' };
}

// ── đọc đủ / xuất tệp ──────────────────────────────────────────────────────────────────────────

/** Đọc HẾT bảng qua Open API (500/trang tới khi has_more = false, đối chiếu `total`). */
async function openApiReadAll(c: LarkClient, token: string, table: string, view?: string): Promise<{ header: string[]; rows: unknown[][]; total: number | null }> {
  const items: J[] = [];
  let pageToken: string | undefined;
  let total: number | null = null;
  for (let page = 0; page < 1000; page++) {
    const d = (await c.request('POST', `/open-apis/bitable/v1/apps/${enc(token)}/tables/${enc(table)}/records/search`, { params: { page_size: 500, ...(pageToken ? { page_token: pageToken } : {}) }, data: view ? { view_id: view } : {} })) as J;
    if (typeof d?.total === 'number') total = d.total;
    items.push(...(d?.items || []));
    if (!d?.has_more || !d?.page_token) break;
    pageToken = d.page_token;
  }
  if (total !== null && items.length !== total) throw new Error(`Đọc thiếu dữ liệu (Open API): ${items.length}/${total} bản ghi.`);
  const header: string[] = [];
  for (const it of items) for (const k of Object.keys(it.fields || {})) if (!header.includes(k)) header.push(k);
  const flat = (v: J): unknown => {
    if (v === null || v === undefined) return null;
    if (typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' && x ? x.text ?? x.name ?? x.link ?? x.record_ids?.join?.(',') ?? x.file_token ?? JSON.stringify(x) : String(x))).join(', ');
    return v.text ?? v.name ?? v.link ?? JSON.stringify(v);
  };
  return { header, rows: items.map((it) => header.map((h) => flat(it.fields?.[h]))), total: total ?? items.length };
}

/** Cột chữ cái của chỉ số cột (0 → A, 26 → AA). */
function colLetter(n: number): string {
  let s = '';
  for (let k = n + 1; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(65 + ((k - 1) % 26)) + s;
  return s;
}

/**
 * Dòng TỔNG cuối bảng: cột đầu "Tổng", cột nào MỌI ô có giá trị đều là số thì cộng (xlsx: công thức =SUM để
 * Excel tự tính lại; csv: số đã cộng). Cột không phải số để trống. Trả cả tên các cột đã cộng (để báo).
 */
export function totalRowFor(rows: unknown[][], format: 'xlsx' | 'csv'): { row: unknown[]; cols: string[] } {
  const header = (rows[0] || []).map((h) => String(h ?? ''));
  const body = rows.slice(1);
  const row: unknown[] = header.map(() => null);
  const cols: string[] = [];
  header.forEach((name, c) => {
    const vals = body.map((r) => r[c]).filter((v) => v !== null && v !== undefined && v !== '');
    if (!vals.length || !vals.every((v) => typeof v === 'number')) return;
    cols.push(name);
    row[c] = format === 'xlsx' ? `=SUM(${colLetter(c)}2:${colLetter(c)}${body.length + 1})` : (vals as number[]).reduce((a, b) => a + b, 0);
  });
  if (header.length) row[0] = row[0] === null ? 'Tổng' : row[0];
  return { row, cols };
}

async function writeLocalFile(name: string, format: 'xlsx' | 'csv', rows: unknown[][], sheetName: string): Promise<{ path: string; fileName: string; bytes: number; mime: string }> {
  const out = getFileOutDir();
  if (!out) throw new Error('Chưa có thư mục ghi tệp cho lượt này.');
  const norm = rows.map((r) => r.map((c) => (c === null || c === undefined ? null : typeof c === 'number' ? c : typeof c === 'boolean' ? (c ? 'TRUE' : 'FALSE') : String(c))));
  const bytes = format === 'xlsx' ? buildXlsx({ name: sheetName, rows: norm }) : buildCsv(norm);
  await mkdir(out, { recursive: true });
  const fileName = `${safeFileName(name, 'du-lieu')}${FORMAT_META[format].ext}`;
  const path = join(out, fileName);
  await writeFile(path, bytes);
  return { path, fileName, bytes: bytes.length, mime: FORMAT_META[format].mime };
}

// ── tệp → Drive / Sheets / Docs (dùng chung cho công cụ và nút trên thẻ tệp) ─────────────────────

/** Thư mục đích: token/link người dùng đưa, hoặc thư mục «Larkwave» trong "Không gian của tôi". */
export async function resolveFolder(folder?: string): Promise<string> {
  const f = String(folder || '').trim();
  if (f) {
    const t = folderTokenFrom(f);
    if (!t) throw new Error(`«${f}» không phải link/token thư mục Drive (…/drive/folder/<token>).`);
    return t;
  }
  return web().webDefaultFolder();
}

export async function uploadToDrive(local: { bytes: Buffer; name: string; mime: string }, folder?: string): Promise<J> {
  const folderToken = await resolveFolder(folder);
  const up = await web().webUpload({ ...local, mountPoint: 'explorer', mountNode: folderToken });
  // Xác minh: tệp có trong thư mục đích.
  let found = false;
  for (let k = 0; k < 5 && !found; k++) {
    const kids = await web().webFolderChildren(folderToken).catch(() => []);
    found = kids.some((x) => x.objToken === up.fileToken || x.node === up.nodeToken);
    if (!found) await new Promise((r) => setTimeout(r, 1200));
  }
  const url = driveFileUrl(web().webHost() || '', up.fileToken);
  return { ok: found, via: 'web', kind: 'drive_file', file_token: up.fileToken, url, folder_token: folderToken, verified: found ? `có trong thư mục ${folderToken}` : 'chưa thấy trong danh sách thư mục', note: found ? `ĐÃ TẢI LÊN và thấy trong thư mục. Gửi người dùng link: ${url}` : 'Tải lên xong nhưng chưa thấy trong thư mục — báo người dùng kiểm tra.' };
}

export async function importAsSheet(local: { bytes: Buffer; name: string; mime: string }, folder?: string): Promise<J> {
  const t = importTargetFor(local.name);
  if (t?.type !== 'sheet') throw new Error('Chỉ nhập .xlsx/.xls/.csv thành Lark Sheets.');
  const folderToken = await resolveFolder(folder);
  const r = await web().webImport({ ...local, folderToken });
  const back = await web().webReadSheet(r.token).catch((e) => ({ ok: false, error: String(e) }));
  const want = buildFilePreview(local.name, local.bytes);
  const gotSheets: J[] = back?.sheets || [];
  const problems: string[] = [];
  if (!back?.ok) problems.push(`không đọc lại được bảng tính (${back?.error || 'không rõ'})`);
  else if (want?.sheets) {
    for (const ws of want.sheets) {
      const g = want.kind === 'csv' ? gotSheets[0] : gotSheets.find((s) => s.name === ws.name);
      if (!g) problems.push(`thiếu sheet «${ws.name}»`);
      else if (g.loaded === false) problems.push(`sheet «${ws.name}»: chưa đọc lại được nội dung`);
      else if (g.rows < ws.rows) problems.push(`sheet «${ws.name}»: Lark có ${g.rows} dòng, tệp có ${ws.rows}`);
    }
  }
  return {
    ok: !problems.length,
    via: 'web',
    kind: 'sheet',
    token: r.token,
    url: r.url,
    ...(back?.title ? { title: back.title } : {}),
    sheets: gotSheets.map((s) => ({ name: s.name, rows: s.rows, cols: s.cols, first_rows: (s.head || []).slice(0, 3) })),
    verified: problems.length ? `lệch: ${problems.join('; ')}` : `đọc lại khớp: ${gotSheets.map((s) => `«${s.name}» ${s.rows} dòng`).join(', ')}`,
    note: problems.length ? 'CHƯA khớp hoàn toàn — báo người dùng.' : `ĐÃ NHẬP thành Lark Sheets và đọc lại khớp. Gửi người dùng link: ${r.url}`,
  };
}

export async function importAsDoc(local: { bytes: Buffer; name: string; mime: string }, folder?: string): Promise<J> {
  const ext = extname(local.name).toLowerCase();
  let file = local;
  if (ext === '.md' || ext === '.txt') {
    // Chuyển sang .docx chuẩn ở máy trước — đường nhập .docx đã đo, đường .md của Lark thì chưa.
    const bytes = buildDocx(local.bytes.toString('utf8'));
    file = { bytes, name: local.name.replace(/\.(md|txt)$/i, '.docx'), mime: FORMAT_META.docx.mime };
  } else if (ext !== '.docx') throw new Error('Chỉ nhập .docx/.md/.txt thành Lark Docs.');
  const folderToken = await resolveFolder(folder);
  const r = await web().webImport({ ...file, folderToken });
  const back = await web().webReadDoc(r.token).catch((e) => ({ ok: false, error: String(e) }));
  const wantFirst = extractOfficeText(file.bytes, 'docx').split(/\n+/).map((x) => x.trim()).filter(Boolean)[0] || '';
  const head: string[] = back?.head || [];
  const okFirst = !wantFirst || head.some((h) => fold(h).includes(fold(wantFirst).slice(0, 40)));
  return {
    ok: !!back?.ok && okFirst,
    via: 'web',
    kind: 'docx',
    token: r.token,
    url: r.url,
    title: back?.title,
    paragraphs: back?.paragraphs,
    first_paragraphs: head.slice(0, 4),
    verified: back?.ok ? (okFirst ? `đọc lại khớp: «${back.title}», ${back.paragraphs} đoạn` : 'đoạn đầu không khớp tệp gốc') : `không đọc lại được (${back?.error || 'không rõ'})`,
    note: back?.ok && okFirst ? `ĐÃ NHẬP thành Lark Docs và đọc lại khớp. Gửi người dùng link: ${r.url}` : 'CHƯA xác minh được nội dung — báo người dùng.',
  };
}

const FOLDER_PROP = str('Thư mục Drive đích: link …/drive/folder/<token> hoặc token. Bỏ trống = thư mục «Larkwave» trong "Không gian của tôi" (tự tạo nếu chưa có).');
const TABLE_PROPS = {
  app_token: str('Token Base (hoặc link …/base/<token>)'),
  table: str('TÊN bảng hoặc table_id (tbl…)'),
};
const RECORDS_SCHEMA = (withId: boolean) => ({
  type: 'array',
  description: withId
    ? 'Các bản ghi cần SỬA: [{record_id:"rec…", fields:{"Tên cột": giá trị}}] — chỉ các cột nêu ra mới đổi.'
    : 'Các bản ghi MỚI: [{fields:{"Tên cột": giá trị}}].',
  items: {
    type: 'object',
    additionalProperties: false,
    properties: { ...(withId ? { record_id: str('id bản ghi (rec…)') } : {}), fields: { type: 'object', additionalProperties: true } },
    required: withId ? ['record_id', 'fields'] : ['fields'],
  },
});
const VALUE_RULES =
  'Giá trị theo kiểu cột (tool tự đổi sang khuôn của Lark và ĐỌC LẠI từng ô): Văn bản/Email = chuỗi; Số/Tiền = số (hoặc "1.500.000"); ' +
  'Phần trăm = 0.25 hoặc "25%"; Chọn một = TÊN lựa chọn có sẵn (đúng chính tả); Chọn nhiều = mảng tên; Ngày = "YYYY-MM-DD" / "YYYY-MM-DD HH:mm" / ' +
  '"DD/MM/YYYY" (hiểu theo múi giờ của Base) hoặc ISO có múi; Hộp kiểm = true/false; Người = "me"/tên/email/user id (tra trong thành viên Base); ' +
  'SĐT = chuỗi số; URL = "https://…" hoặc {text, link}; Liên kết = record_id (rec…) hoặc chữ ở cột chính của bảng được liên kết. ' +
  'Cột công thức/tra cứu/tự tăng/người tạo… KHÔNG ghi được. Tệp đính kèm dùng lark_web_attach_file. ' +
  'Lựa chọn chưa có → lỗi; CHỈ khi người dùng yêu cầu tạo lựa chọn mới mới truyền create_missing_options:true.';

export const larkWebWriteTools: LarkToolDef[] = [
  {
    name: 'lark_web_read_records',
    gated: false,
    description:
      'ĐỌC bản ghi của một bảng qua phiên Lark web (không cần App ID) — đọc ĐỦ MỌI TRANG, trả `total` (số máy chủ báo) và `returned`. ' +
      'Kết quả trả về tối đa `preview_rows` dòng để đọc; muốn XUẤT/BÁO CÁO trên toàn bộ dữ liệu thì dùng lark_export_table_file (không chép bảng qua hội thoại).',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { ...TABLE_PROPS, view_id: str('Chỉ đọc theo một view (tuỳ chọn)'), fields: { type: 'array', items: { type: 'string' }, description: 'Chỉ lấy các cột này (tên)' }, preview_rows: { type: 'integer', description: 'Số dòng trả về để đọc (mặc định 100, tối đa 500)' } },
      required: ['app_token', 'table'],
    },
    exec: async (i) => {
      const token = tokenOf(i);
      const t = await tableFor(token, String(i.table ?? ''));
      const all: AllRecords = await web().webReadAllRecords(token, t.tableId, i.view_id ? String(i.view_id) : '');
      const lim = Math.max(1, Math.min(500, Number(i.preview_rows) || 100));
      const names: string[] = Array.isArray(i.fields) && i.fields.length ? i.fields.map(String) : [];
      const cols = names.length ? names.map((n) => resolveField(t.fields, n)).filter((f): f is EncField => !!f) : t.fields;
      const rows = all.ids.slice(0, lim).map((id) => ({
        record_id: id,
        fields: Object.fromEntries(cols.map((f) => {
          const c = all.recordMap[id]?.[f.id];
          return [f.name, simpleValue(f, c && typeof c === 'object' && 'value' in c ? c.value : c, { timezone: t.timezone })];
        })),
      }));
      return {
        table: t.tableName,
        table_id: t.tableId,
        total: all.total ?? all.ids.length,
        returned: rows.length,
        complete: rows.length === all.ids.length,
        records: rows,
        ...(rows.length < all.ids.length ? { note: `Đây là ${rows.length}/${all.ids.length} dòng. ĐỪNG tổng hợp/xuất tệp từ phần này — dùng lark_export_table_file để có đủ ${all.ids.length} dòng.` } : {}),
      };
    },
  },
  {
    name: 'lark_export_table_file',
    gated: false,
    description:
      'XUẤT TOÀN BỘ một bảng Bitable ra tệp .xlsx hoặc .csv trên máy (thẻ tệp hiện trong hội thoại, có xem trước). Đọc HẾT mọi trang ' +
      '(phiên web, hoặc Open API nếu đã kết nối custom app), giữ đúng kiểu (số là số, mã có số 0 đầu giữ nguyên, ngày theo múi giờ Base, lựa chọn/người ra tên). ' +
      'Kết quả ghi rõ "N dòng nguồn → N dòng trong tệp"; lệch là LỖI (không tạo tệp thiếu). Dùng thay cho việc đọc từng trang rồi tự dựng bảng.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...TABLE_PROPS,
        view_id: str('Chỉ xuất theo một view (tuỳ chọn)'),
        fields: { type: 'array', items: { type: 'string' }, description: 'Chỉ xuất các cột này (tên), theo thứ tự' },
        format: { type: 'string', enum: ['xlsx', 'csv'], description: 'Mặc định xlsx' },
        name: str('Tên tệp (không đuôi). Mặc định = tên bảng'),
        with_record_id: { type: 'boolean', description: 'Thêm cột record_id đầu tiên' },
        total_row: { type: 'boolean', description: 'Thêm DÒNG TỔNG ở cuối: cột đầu "Tổng", mỗi cột số = tổng cột (xlsx: công thức =SUM, csv: số đã cộng). Không tính vào "N dòng nguồn → N dòng".' },
      },
      required: ['app_token', 'table'],
    },
    exec: async (i, client) => {
      const token = tokenOf(i);
      const format = i.format === 'csv' ? 'csv' : 'xlsx';
      let rows: unknown[][];
      let source: number;
      let tableName = String(i.table ?? '');
      let via: 'web' | 'openapi' = 'web';
      if (webReady()) {
        const t = await tableFor(token, String(i.table ?? ''));
        tableName = t.tableName;
        const all = await web().webReadAllRecords(token, t.tableId, i.view_id ? String(i.view_id) : '');
        const built = rowsForFile(t.fields, all, (f, v) => simpleValue(f, v, { timezone: t.timezone }), { fieldNames: Array.isArray(i.fields) ? i.fields.map(String) : undefined, withRecordId: !!i.with_record_id });
        rows = built.rows;
        source = built.sourceRows;
      } else if (client) {
        via = 'openapi';
        const r = await openApiReadAll(client, token, String(i.table ?? ''), i.view_id ? String(i.view_id) : undefined);
        rows = [r.header, ...r.rows];
        source = r.total ?? r.rows.length;
      } else throw new Error('Chưa đăng nhập Lark web (và chưa kết nối custom app) — không đọc được bảng.');
      const fileRows = rows.length - 1;
      if (fileRows !== source) throw new Error(`Lệch số dòng: ${source} dòng nguồn → ${fileRows} dòng trong tệp. Không tạo tệp.`);
      const total = i.total_row === true ? totalRowFor(rows, format) : null;
      const f = await writeLocalFile(String(i.name || tableName), format, total ? [...rows, total.row] : rows, tableName.slice(0, 31) || 'Sheet1');
      return {
        ok: true,
        via,
        file_name: f.fileName,
        path: f.path,
        mime: f.mime,
        bytes: f.bytes,
        source_rows: source,
        file_rows: fileRows,
        columns: (rows[0] || []).length,
        ...(total ? { total_row: { summed_columns: total.cols } } : {}),
        note: `XONG: ${source} dòng nguồn → ${fileRows} dòng trong tệp «${f.fileName}» (${(rows[0] || []).length} cột)${total ? ` + 1 dòng TỔNG cuối (cộng các cột: ${total.cols.join(', ') || 'không có cột số'})` : ''}. Thẻ tệp đã hiện trong hội thoại — nói rõ con số này với người dùng.`,
      };
    },
  },
  {
    name: 'lark_web_download_attachments',
    gated: false,
    description:
      'TẢI VỀ + ĐỌC các tệp trong một cột Tệp đính kèm của Bitable qua phiên Lark web (không cần App ID): mọi bản ghi, hoặc một `record_id`. ' +
      'Tệp lưu vào thư mục hội thoại (đường dẫn trong kết quả); Excel/Word/CSV/text trả kèm CHỮ đã trích; ảnh/PDF thì dùng Read với `path`. ' +
      'Dùng khi người dùng muốn đọc/tóm tắt/trích số liệu từ tệp đính kèm trong Base.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...TABLE_PROPS,
        field: str('TÊN (hoặc id) cột Tệp đính kèm'),
        record_id: str('Chỉ tệp của bản ghi này (tuỳ chọn)'),
        max_files: { type: 'integer', description: 'Tối đa số tệp tải (mặc định 20, tối đa 50)' },
      },
      required: ['app_token', 'table', 'field'],
    },
    exec: async (i) => {
      if (!webReady()) throw new Error('Chưa đăng nhập Lark web — tải tệp đính kèm qua phiên web cần đăng nhập khung Lark (có custom app thì dùng lark_read_attachment).');
      const out = getFileOutDir();
      if (!out) throw new Error('Chưa có thư mục ghi tệp cho lượt này.');
      const token = tokenOf(i);
      const t = await tableFor(token, String(i.table ?? ''));
      const f = resolveField(t.fields, String(i.field ?? ''));
      if (!f) throw new Error(`Không có cột «${i.field}». Cột có: ${t.fields.map((x) => x.name).join(' | ')}.`);
      if (f.type !== 17) throw new Error(`Cột «${f.name}» không phải cột Tệp đính kèm.`);
      const recMap: Record<string, Record<string, J>> = i.record_id ? await web().webRecordsById(token, t.tableId, [String(i.record_id)]) : (await web().webReadAllRecords(token, t.tableId)).recordMap;
      const all: { recordId: string; token: string; name: string; mime: string }[] = [];
      for (const [rid, row] of Object.entries(recMap || {})) {
        const list: J[] = Array.isArray(cellVal(row?.[f.id])) ? cellVal(row[f.id]) : [];
        for (const a of list) if (a?.attachmentToken) all.push({ recordId: rid, token: String(a.attachmentToken), name: String(a.name || a.attachmentToken), mime: String(a.mimeType || '') });
      }
      const max = Math.max(1, Math.min(50, Number(i.max_files) || 20));
      const files: J[] = [];
      const failed: J[] = [];
      let textBudget = 60_000;
      for (const a of all.slice(0, max)) {
        try {
          const r = await web().webDownload(a.token, { mountPoint: /^image\//.test(a.mime) ? 'bitable_image' : 'bitable_file', extra: { bitablePerm: { tableId: t.tableId, attachments: { [f.id]: { [a.recordId]: [a.token] } } } } });
          const dir = join(out, '.lark-files', a.recordId);
          await mkdir(dir, { recursive: true });
          const name = safeFileName(a.name.replace(/\.[^.]+$/, ''), 'tep') + (extname(a.name) || '');
          const path = join(dir, name);
          await writeFile(path, r.bytes);
          let text = '';
          const kind = /\.(xlsx|docx|pptx)$/i.test(name) ? (extname(name).slice(1).toLowerCase() as 'xlsx' | 'docx' | 'pptx') : null;
          if (kind) text = extractOfficeText(r.bytes, kind);
          else if (/\.(csv|txt|md|json|tsv)$/i.test(name)) text = r.bytes.toString('utf8').replace(/^\uFEFF/, '');
          const take = Math.max(0, Math.min(text.length, Math.min(12_000, textBudget)));
          textBudget -= take;
          files.push({ record_id: a.recordId, name: a.name, path, bytes: r.bytes.length, mime: r.mime || a.mime, ...(take ? { text: text.slice(0, take), text_truncated: text.length > take } : {}) });
        } catch (e) {
          failed.push({ record_id: a.recordId, name: a.name, error: String((e as Error)?.message || e).slice(0, 200) });
        }
      }
      return {
        ok: files.length > 0 || all.length === 0,
        table: t.tableName,
        field: f.name,
        total_files: all.length,
        downloaded: files.length,
        files,
        ...(failed.length ? { failed } : {}),
        ...(all.length > max ? { note: `Cột có ${all.length} tệp — mới tải ${max}. Gọi lại với max_files lớn hơn (≤ 50) hoặc theo record_id.` } : {}),
        next: 'Ảnh/PDF: dùng Read với `path`. Báo người dùng đã đọc bao nhiêu tệp / tổng số tệp.',
      };
    },
  },
  {
    name: 'lark_web_write_records',
    gated: true,
    additive: true,
    description:
      'THÊM bản ghi MỚI vào một bảng Bitable qua phiên Lark web (không cần App ID), theo lô; không đụng bản ghi đang có. ' +
      VALUE_RULES +
      ' Tool kiểm TOÀN BỘ trước (một ô sai là không ghi gì), ghi, rồi ĐỌC LẠI từng ô từ máy chủ: chỉ khi `verified:true` mới được nói "đã ghi". Trả link bảng + id bản ghi mới.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...TABLE_PROPS,
        records: RECORDS_SCHEMA(false),
        create_missing_options: { type: 'boolean', description: 'CHỈ khi người dùng yêu cầu: tạo lựa chọn còn thiếu (cộng thêm)' },
        match_by: {
          type: 'array',
          items: { type: 'string' },
          description:
            'GHI THEO KHOÁ (chống TRÙNG khi chạy lại / nhập lại cùng tệp): tên cột khoá, vd ["Mã đơn"]. Dòng có khoá chưa có → THÊM; khoá đã có và ô giống hệt → bỏ qua; khoá đã có nhưng ô khác → SỬA đúng các ô đó (ghi đè → cần duyệt). Bỏ trống = luôn thêm mới.',
        },
      },
      required: ['app_token', 'table', 'records'],
    },
    // Thêm mới thuần = cộng thêm. Có `match_by` thì phải xem dữ liệu mới biết có dòng nào cần SỬA không.
    additiveWhen: (i) => !normMatchBy(i?.match_by).length,
    additiveCheck: async (i, client) => {
      const matchBy = normMatchBy(i?.match_by);
      if (!matchBy.length) return undefined;
      if (webReady()) {
        const p = await prepareWrite(i, 'create');
        if (!p.ok || p.needOptions.length) return undefined;
        const pl = await webUpsertPlan(p, matchBy);
        return pl.plan ? (pl.plan as UpsertPlan).updates.length === 0 : undefined;
      }
      if (!client) return undefined;
      const table = String(i.table ?? i.table_id ?? '');
      if (!/^tbl/.test(table)) return undefined;
      const { plan } = await openApiUpsertPlan(client, tokenOf(i), table, (Array.isArray(i.records) ? i.records : []).map((r: J) => ({ fields: r?.fields || {} })), matchBy);
      return plan.updates.length === 0;
    },
    preflight: async (i) => {
      if (!webReady()) return null; // để exec chọn đường Open API (hoặc báo lỗi rõ)
      try {
        const p = await prepareWrite(i, 'create');
        if (!p.ok) return p;
        const matchBy = normMatchBy(i?.match_by);
        const missing = matchBy.filter((n) => !resolveField(p.fields, n));
        return missing.length ? { ok: false, kind: 'invalid', error: `Cột khoá không có trong bảng «${p.tableName}»: ${missing.join(', ')}.` } : null;
      } catch (e) {
        return { ok: false, kind: 'error', error: String((e as Error)?.message || e) };
      }
    },
    preview: async (i) => {
      const matchBy = normMatchBy(i?.match_by);
      if (!matchBy.length || !webReady()) return undefined;
      const p = await prepareWrite(i, 'create');
      if (!p.ok) return undefined;
      const pl = await webUpsertPlan(p, matchBy);
      return pl.plan ? { upsert: planSummary(pl.plan as UpsertPlan), match_by: matchBy } : undefined;
    },
    exec: async (i, client) => {
      const matchBy = normMatchBy(i?.match_by);
      const viaOpenApi = (c: LarkClient) => {
        if (!matchBy.length) return openApiCreate(c, i);
        const table = String(i.table ?? i.table_id ?? '');
        if (!/^tbl/.test(table)) throw new Error('Đường Open API cần `table` là table_id (tbl…).');
        return openApiUpsert(c, tokenOf(i), table, (Array.isArray(i.records) ? i.records : []).map((r: J) => ({ fields: r?.fields || {} })), matchBy);
      };
      if (webReady()) {
        try {
          return await execWrite(i, 'create');
        } catch (e) {
          if (!client) throw e;
          const r = await viaOpenApi(client);
          return { ...r, web_error: String((e as Error)?.message || e) };
        }
      }
      if (client) return viaOpenApi(client);
      throw new Error('Chưa đăng nhập Lark web — đăng nhập trong khung Lark (hoặc kết nối custom app) rồi thử lại.');
    },
  },
  {
    name: 'lark_web_update_records',
    gated: true,
    description:
      'SỬA ô của bản ghi CÓ SẴN (ghi đè giá trị cũ) qua phiên Lark web — luôn hỏi người dùng trước. Chỉ các cột nêu trong `fields` mới đổi. ' +
      VALUE_RULES +
      ' Kiểm toàn bộ trước, ghi, ĐỌC LẠI từng ô; chỉ `verified:true` mới được báo đã sửa.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { ...TABLE_PROPS, records: RECORDS_SCHEMA(true), create_missing_options: { type: 'boolean', description: 'CHỈ khi người dùng yêu cầu tạo lựa chọn mới' } },
      required: ['app_token', 'table', 'records'],
    },
    preflight: async (i) => {
      if (!webReady()) return { ok: false, kind: 'error', error: 'Chưa đăng nhập Lark web — sửa bản ghi qua phiên web cần đăng nhập trong khung Lark (hoặc dùng bitable_update_record nếu đã kết nối custom app).' };
      try {
        const p = await prepareWrite(i, 'update');
        return p.ok ? null : p;
      } catch (e) {
        return { ok: false, kind: 'error', error: String((e as Error)?.message || e) };
      }
    },
    exec: async (i) => execWrite(i, 'update'),
  },
  {
    name: 'lark_web_attach_file',
    gated: true,
    additive: true,
    additiveWhen: (i) => i?.replace !== true,
    description:
      'ĐÍNH một tệp (tệp agent vừa dựng hoặc tệp người dùng gửi) vào ô Tệp đính kèm của một bản ghi, qua phiên Lark web. MẶC ĐỊNH GHI THÊM vào sau các tệp đang có ' +
      '(không bao giờ xoá tệp cũ); `replace:true` chỉ khi người dùng nói rõ "thay". Tải lên đúng chỗ Base dùng (bitable_file/bitable_image), rồi ĐỌC LẠI ô từ máy chủ để chắc tệp đã nằm trong ô.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...TABLE_PROPS,
        record_id: str('id bản ghi (rec…)'),
        field: str('TÊN (hoặc id) cột Tệp đính kèm'),
        path: str('Đường dẫn tệp, lấy nguyên từ kết quả create_file/fill_xlsx/lark_export_table_file hoặc tệp đính kèm'),
        replace: { type: 'boolean', description: 'Thay toàn bộ tệp trong ô (CHỈ khi người dùng yêu cầu)' },
      },
      required: ['app_token', 'table', 'record_id', 'field', 'path'],
    },
    exec: async (i, client) => {
      const local = await readLocalFile(String(i.path || ''));
      const token = tokenOf(i);
      const recordId = String(i.record_id || '');
      if (!webReady()) {
        if (!client) throw new Error('Chưa đăng nhập Lark web (và chưa kết nối custom app).');
        throw new Error('Phiên Lark web chưa đăng nhập — dùng send_file(to:"bitable") qua custom app.');
      }
      const t = await tableFor(token, String(i.table ?? ''));
      const f = resolveField(t.fields, String(i.field ?? ''));
      if (!f) throw new Error(`Không có cột «${i.field}». Cột có: ${t.fields.map((x) => x.name).join(' | ')}.`);
      if (f.type !== 17) throw new Error(`Cột «${f.name}» không phải cột Tệp đính kèm.`);
      const before = await web().webRecordsById(token, t.tableId, [recordId]);
      if (!before[recordId]) throw new Error(`Không thấy bản ghi ${recordId} trong bảng «${t.tableName}».`);
      const curCell = before[recordId][f.id];
      const current: J[] = Array.isArray(curCell?.value) ? curCell.value : [];
      const isImage = /^image\//.test(local.mime);
      const up = await web().webUpload({ ...local, mountPoint: isImage ? 'bitable_image' : 'bitable_file', mountNode: token });
      const item = attachmentItem({ token: up.fileToken, name: local.name, size: local.bytes.length, mime: local.mime });
      const expected = mergeAttachments(current, [item], i.replace === true);
      const r = await web().webRunInBase(token, attachScript({ token, tableId: t.tableId, recordId, fieldId: f.id, items: [item], replace: i.replace === true, current }));
      if (!r?.ok) throw new Error(`Không gắn được tệp vào ô (${r?.error || r?.reason || r?.result || 'không rõ'}). Tệp đã tải lên (token ${up.fileToken}) nhưng CHƯA nằm trong ô.`);
      let got: string[] = [];
      for (let k = 0; k < 8; k++) {
        await new Promise((res) => setTimeout(res, k === 0 ? 1200 : 1800));
        const back = await web().webRecordsById(token, t.tableId, [recordId]).catch(() => ({}) as J);
        got = (Array.isArray(back?.[recordId]?.[f.id]?.value) ? back[recordId][f.id].value : []).map((x: J) => x.attachmentToken);
        if (expected.every((x: J) => got.includes(x.attachmentToken)) && got.length === expected.length) break;
      }
      const verified = expected.every((x: J) => got.includes(x.attachmentToken)) && got.length === expected.length;
      return {
        ok: verified,
        via: 'web',
        file_token: up.fileToken,
        file_name: local.name,
        ...(local.copiedFrom ? { local_path: local.path, copied_from: local.copiedFrom } : {}),
        field: f.name,
        record_id: recordId,
        kept_existing: i.replace === true ? 0 : current.length,
        files_in_cell: got.length,
        verified,
        url: tableUrl(token, t.tableId),
        note: verified ? `ĐÃ ĐÍNH «${local.name}» vào ô «${f.name}» (giữ ${i.replace === true ? 0 : current.length} tệp cũ, ô nay có ${got.length} tệp) và đọc lại khớp.` : 'CHƯA xác minh được tệp trong ô — KHÔNG được nói đã đính.',
      };
    },
  },
  {
    name: 'lark_web_drive_upload',
    gated: true,
    additive: true,
    description:
      'TẢI một tệp cục bộ (tệp agent dựng / người dùng gửi) lên một thư mục Lark Drive qua phiên Lark web, rồi xác minh tệp có trong thư mục. ' +
      'Chỉ gọi khi người dùng muốn lưu lên Drive. Trả link tệp.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { path: str('Đường dẫn tệp (nguyên từ kết quả create_file …)'), folder: FOLDER_PROP }, required: ['path'] },
    exec: async (i, client) => {
      const local = await readLocalFile(String(i.path || ''));
      if (webReady()) return uploadToDrive(local, i.folder ? String(i.folder) : undefined);
      if (!client) throw new Error('Chưa đăng nhập Lark web (và chưa kết nối custom app).');
      const up = (await client.uploadBinary('/open-apis/drive/v1/files/upload_all', { file_name: local.name, parent_type: 'explorer', parent_node: folderTokenFrom(String(i.folder || '')) || undefined }, { name: local.name, bytes: local.bytes, mime: local.mime })) as J;
      return { ok: !!up?.file_token, via: 'openapi', kind: 'drive_file', file_token: up?.file_token };
    },
  },
  {
    name: 'lark_web_import_as_sheet',
    gated: true,
    additive: true,
    description:
      'NHẬP một tệp .xlsx/.xls/.csv thành Lark Sheets MỚI (đúng luồng "Tải lên → Nhập thành tài liệu trực tuyến") qua phiên Lark web, chờ Lark chuyển xong, ' +
      'rồi ĐỌC LẠI tên sheet + số dòng để so với tệp gốc. Trả link bảng tính. Dùng khi người dùng muốn "tạo sheet", "đưa lên Lark Sheets".',
    inputSchema: { type: 'object', additionalProperties: false, properties: { path: str('Đường dẫn tệp .xlsx/.csv'), folder: FOLDER_PROP }, required: ['path'] },
    exec: async (i) => {
      if (!webReady()) throw new Error('Chưa đăng nhập Lark web — nhập thành Lark Sheets cần phiên web.');
      return importAsSheet(await readLocalFile(String(i.path || '')), i.folder ? String(i.folder) : undefined);
    },
  },
  {
    name: 'lark_web_import_as_doc',
    gated: true,
    additive: true,
    description:
      'NHẬP một tệp .docx (hoặc .md/.txt — tự chuyển sang .docx chuẩn) thành Lark Docs MỚI qua phiên Lark web, chờ xong, rồi ĐỌC LẠI tiêu đề + các đoạn đầu. Trả link tài liệu.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { path: str('Đường dẫn tệp .docx/.md/.txt'), folder: FOLDER_PROP }, required: ['path'] },
    exec: async (i) => {
      if (!webReady()) throw new Error('Chưa đăng nhập Lark web — nhập thành Lark Docs cần phiên web.');
      return importAsDoc(await readLocalFile(String(i.path || '')), i.folder ? String(i.folder) : undefined);
    },
  },
  {
    name: 'lark_web_sheet_write_range',
    gated: true,
    description:
      'GHI một vùng giá trị vào bảng tính Lark Sheets CÓ SẴN (ghi đè ô cũ → luôn hỏi) qua phiên Lark web: mở bảng tính trong khung Lark, ghi từng ô như người gõ ' +
      '(chữ giữ nguyên kể cả số 0 đầu, số là số, "=…" là công thức), rồi ĐỌC LẠI vùng đó để đối chiếu. Bảng tính mới thì dùng lark_web_import_as_sheet.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        sheet: str('Link …/sheets/<token> hoặc token bảng tính'),
        sheet_name: str('Tên sheet (tab). Bỏ trống = sheet đang mở đầu tiên'),
        start_cell: str('Ô góc trên-trái, vd "A1"'),
        values: { type: 'array', items: { type: 'array', items: {} }, description: 'Mảng hàng × cột' },
      },
      required: ['sheet', 'start_cell', 'values'],
    },
    exec: async (i) => {
      if (!webReady()) throw new Error('Chưa đăng nhập Lark web — ghi vào Lark Sheets cần phiên web (hoặc sheets_write_range qua custom app).');
      const token = sheetTokenFrom(String(i.sheet || ''));
      if (!token) throw new Error('`sheet` phải là link …/sheets/<token> hoặc token.');
      const at = parseA1(String(i.start_cell || ''));
      if (!at) throw new Error('`start_cell` phải dạng "A1".');
      const values: unknown[][] = (Array.isArray(i.values) ? i.values : []).map((r: J) => (Array.isArray(r) ? r : [r]));
      const cells = values.reduce((n, r) => n + r.length, 0);
      if (!cells) throw new Error('`values` rỗng.');
      if (cells > MAX_SHEET_CELLS) throw new Error(`Tối đa ${MAX_SHEET_CELLS} ô mỗi lần — chia nhỏ, hoặc nhập thành bảng tính mới.`);
      const r = await web().webWriteSheet(token, { sheetName: i.sheet_name ? String(i.sheet_name) : undefined, row: at.row, col: at.col, values });
      if (!r || r.ok === false && r.error) throw new Error(`Không ghi được vào bảng tính (${r?.error || 'không rõ'}${r?.sheets ? ` — sheet có: ${r.sheets.join(', ')}` : ''}).`);
      const cmp = compareSheetBack(values, r.back || []);
      const host = web().webHost() || '';
      return {
        ok: cmp.ok && !(r.failed || []).length,
        via: 'web',
        sheet: r.sheet,
        written: r.written,
        verified: cmp.ok,
        ...(cmp.mismatches.length ? { mismatches: cmp.mismatches.slice(0, 20) } : {}),
        ...((r.failed || []).length ? { failed_cells: r.failed.slice(0, 20), protected_sheet: !!r.protectedSheet } : {}),
        url: `${host}/sheets/${token}`,
        note: cmp.ok ? `ĐÃ GHI ${r.written} ô vào sheet «${r.sheet}» và đọc lại khớp.` : 'Có ô đọc lại không khớp — báo người dùng, KHÔNG nói đã ghi xong.',
      };
    },
  },
  {
    name: 'lark_web_delete',
    gated: true,
    description:
      'XOÁ bảng / automation / khối Workflow của một Base qua phiên Lark web — MỘT lần gọi cho cả danh sách người dùng muốn xoá. ' +
      'Ứng dụng LUÔN hiện hộp xác nhận liệt kê đủ từng thứ (cả khi công tắc "Tự động" đang bật): đó là lần hỏi DUY NHẤT — KHÔNG xin phép thêm bằng chat hay ask_user, KHÔNG bảo người dùng tự vào Lark xoá. ' +
      'Nêu theo TÊN đúng như trong Lark hoặc id (bảng tbl…; automation = workflow id số; workflow = block id wkf… hoặc workflow id); "*" = cả nhóm đó (vd tables:["*"] = mọi bảng). Quét trước bằng lark_web_scan_base. ' +
      'Bảng và khối Workflow vào THÙNG RÁC của Base (khôi phục được trong Lark); automation XOÁ HẲN. Tự đọc lại sau khi xoá — chỉ nói "đã xoá" với thứ có trong deleted.* ok:true và verified:true; còn sót (still_there) thì nói rõ. ' +
      'Không dùng để xoá bản ghi hay cột.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        app_token: str('Token hoặc URL của Base'),
        tables: { type: 'array', items: { type: 'string' }, description: 'Tên hoặc id các BẢNG cần xoá; ["*"] = mọi bảng của Base' },
        automations: { type: 'array', items: { type: 'string' }, description: 'Tên hoặc workflow id các AUTOMATION cần xoá; ["*"] = mọi automation' },
        workflows: { type: 'array', items: { type: 'string' }, description: 'Tên, block id (wkf…) hoặc workflow id các khối WORKFLOW cần xoá; ["*"] = mọi khối Workflow' },
      },
      required: ['app_token'],
    },
    preflight: async (i) => {
      if (!webReady()) return { ok: false, kind: 'error', error: 'Chưa đăng nhập Lark web — xoá qua phiên web cần đăng nhập trong khung Lark.' };
      try {
        const r = await planDelete(i);
        return !('errors' in r) ? null : { ok: false, kind: 'invalid', errors: r.errors, hint: 'Sửa danh sách theo lỗi (tên phải đúng như trong Base — quét lại bằng lark_web_scan_base) rồi gọi lại.' };
      } catch (e) {
        return { ok: false, kind: 'error', error: String((e as Error)?.message || e) };
      }
    },
    preview: async (i) => {
      const r = await planDelete(i);
      return 'errors' in r ? { deleteErrors: r.errors } : { deletePlan: describePlan(r.plan) };
    },
    exec: async (i) => {
      // Xoá ĐÚNG danh sách đã hiện trong hộp xác nhận (planDelete nhớ kế hoạch theo input), không quét lại
      // rồi tự mở rộng — "*" lúc duyệt là 15 bảng thì lúc chạy cũng chỉ 15 bảng đó.
      const r = await planDelete(i);
      if ('errors' in r) return { ok: false, kind: 'invalid', errors: r.errors };
      const token = tokenOf(i);
      const res = await web().deleteWebItems(token, r.plan);
      approvedPlans.delete(planKey(i));
      const d = describePlan(r.plan);
      return {
        ...res,
        note: res.ok
          ? `ĐÃ XOÁ và đọc lại khớp: ${d.tables.length} bảng (vào thùng rác của Base — khôi phục được trong Lark), ${d.automations.length} automation (xoá hẳn), ${d.workflows.length} workflow (vào thùng rác).`
          : 'CHƯA xoá được hết — báo người dùng đúng thứ nào còn (still_there / deleted.*.error), KHÔNG nói đã xoá xong.',
      };
    },
  },
];

/** Tên các công cụ ghi qua phiên web — để đăng ký vào bộ công cụ không cần custom app. */
export const LARK_WEB_WRITE_TOOL_NAMES = larkWebWriteTools.map((t) => t.name);
