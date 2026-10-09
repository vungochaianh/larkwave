import { gunzipSync } from 'node:zlib';

/**
 * Lớp dữ liệu "API nội bộ của trang Lark web" — THUẦN (không electron), để kiểm được bằng fixture.
 *
 * Mọi thứ ở đây đã đo trên tenant thật (09/10/2026), xem docs/lark-web-api.md:
 *   • Danh sách Base: GET /space/api/explorer/recent/list/ (đúng bộ tham số trang Drive gửi) —
 *     THIẾU header `x-csrftoken` là HTTP 500. obj_type=8 trả cả Base nằm trong Wiki (type 16,
 *     extra.wiki_subtype = 8, token thật ở extra.wiki_sub_token).
 *   • Tìm Base cũ: GET /space/api/search/refine_search/?query=…&obj_types=8.
 *   • Cấu trúc Base: GET /space/api/v1/bitable/:token/clientvars?tableID=… → `data.base` và
 *     `data.table` là JSON NÉN gzip + base64 ("H4sI…").
 *   • Automation: GET /space/api/bitable/:token/automation/list → data.workflowList[] (draft/extra
 *     là CHUỖI JSON). Workflow dạng khối (blockType 86) nằm trong base.blockInfos, chi tiết qua
 *     /workflow/detail?workflowID=…&bizType=2.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type J = any;

// ── Gọi fetch TRONG trang (cookie + x-csrftoken như chính app Lark) ────────────────────────────

/**
 * Dựng đoạn JS chạy trong trang Lark: fetch cùng origin, `credentials:'include'`, LUÔN gắn
 * `x-csrftoken` lấy từ cookie `_csrf_token` (kể cả GET — recent/list không có nó là HTTP 500,
 * tablesv3 không có nó là 403 "csrf token error"). Trả {status, json|snippet, finalUrl, pageUrl}.
 */
export function pageFetchJs(path: string, method = 'GET', body?: unknown, extraHeaders?: Record<string, string>): string {
  const hasBody = body !== undefined;
  return `(async () => {
    try {
      var m = document.cookie.match(/(?:^|; )_csrf_token=([^;]+)/);
      var headers = Object.assign({ 'accept': 'application/json, text/plain, */*' }, ${JSON.stringify(extraHeaders || {})});
      if (m) headers['x-csrftoken'] = decodeURIComponent(m[1]);
      ${hasBody ? `headers['content-type'] = 'application/json';` : ''}
      var opts = { method: ${JSON.stringify(method)}, headers: headers, credentials: 'include' };
      ${hasBody ? `opts.body = ${JSON.stringify(JSON.stringify(body))};` : ''}
      var r = await fetch(${JSON.stringify(path)}, opts);
      var text = await r.text();
      var json = null; try { json = JSON.parse(text); } catch (e) {}
      return { status: r.status, finalUrl: r.url, redirected: r.redirected, pageUrl: location.href, json: json, snippet: json ? null : text.slice(0, 300) };
    } catch (e) { return { error: String((e && e.message) || e), pageUrl: location.href }; }
  })()`;
}

// ── Danh sách Base ────────────────────────────────────────────────────────────────────────────

/** Một Base người dùng thấy được (Drive riêng hoặc trong Wiki). `token` = app_token thật. */
export interface WebBase {
  token: string;
  name: string;
  url: string;
  isWiki: boolean;
  /** Token nút wiki (link /wiki/…) khi Base nằm trong Wiki. */
  wikiToken?: string;
  /** Giây epoch (Lark trả giây). */
  editTime?: number;
  openTime?: number;
  wikiSpace?: string;
}

/** obj_type của Lark: 8 = Bitable/Base, 16 = nút Wiki. */
export const OBJ_BITABLE = 8;
export const OBJ_WIKI = 16;

/** Đúng bộ tham số trang Drive dùng (đo từ request của chính trang). */
export function recentListPath(opts: { types?: number[]; length?: number; lastLabel?: string } = {}): string {
  const q = new URLSearchParams();
  q.append('length', String(Math.min(50, Math.max(1, opts.length ?? 50))));
  q.append('thumbnail_width', '1028');
  q.append('thumbnail_height', '1028');
  q.append('thumbnail_policy', '4');
  for (const t of opts.types ?? [OBJ_BITABLE]) q.append('obj_type', String(t));
  q.append('type_opt', '1');
  q.append('rank', '6');
  q.append('thumbnail_mode', '0');
  if (opts.lastLabel) q.append('last_label', opts.lastLabel);
  return `/space/api/explorer/recent/list/?${q.toString()}`;
}

/** Một nút trong `data.entities.nodes` → WebBase, hoặc null nếu không phải Base. */
export function nodeToBase(n: J): WebBase | null {
  if (!n || typeof n !== 'object') return null;
  const type = Number(n.type);
  const ex = n.extra && typeof n.extra === 'object' ? n.extra : {};
  if (type === OBJ_BITABLE) {
    const token = String(n.obj_token || n.token || '');
    if (!token) return null;
    return {
      token,
      name: String(n.name || '').trim() || 'Base chưa đặt tên',
      url: String(n.url || ''),
      isWiki: false,
      editTime: num(n.edit_time),
      openTime: num(n.open_time),
    };
  }
  if (type === OBJ_WIKI && Number(ex.wiki_subtype) === OBJ_BITABLE) {
    const token = String(ex.wiki_sub_token || '');
    if (!token) return null;
    return {
      token,
      name: String(n.name || '').trim() || 'Base chưa đặt tên',
      url: String(n.url || ''),
      isWiki: true,
      wikiToken: String(n.obj_token || n.token || '') || undefined,
      editTime: num(n.edit_time),
      openTime: num(n.open_time),
      wikiSpace: ex.wiki_space_name ? String(ex.wiki_space_name) : undefined,
    };
  }
  return null;
}

/** Phân tích một trang recent/list → Base + phân trang. Ném lỗi khi code ≠ 0. */
export function parseRecentList(json: J): { bases: WebBase[]; hasMore: boolean; lastLabel?: string } {
  if (!json || typeof json !== 'object') throw new Error('recent/list: không phải JSON');
  if (json.code !== 0) throw new Error(`recent/list: Lark báo lỗi ${json.code}: ${json.msg || ''}`.trim());
  const d = json.data || {};
  const nodes = d.entities?.nodes || {};
  const order: string[] = Array.isArray(d.node_list) ? d.node_list : Object.keys(nodes);
  const bases: WebBase[] = [];
  for (const id of order) {
    const b = nodeToBase(nodes[id]);
    if (b) bases.push(b);
  }
  return { bases, hasMore: !!d.has_more, lastLabel: d.last_label ? String(d.last_label) : undefined };
}

export function searchPath(query: string, opts: { offset?: number; count?: number } = {}): string {
  const q = new URLSearchParams();
  q.append('query', query);
  q.append('offset', String(opts.offset ?? 0));
  q.append('count', String(Math.min(50, opts.count ?? 50)));
  q.append('obj_types', String(OBJ_BITABLE));
  return `/space/api/search/refine_search/?${q.toString()}`;
}

const stripEm = (s: string) => s.replace(/<\/?em>/gi, '');

/** Phân tích refine_search → Base (type 8; Base trong wiki có wiki_infos[]). */
export function parseSearch(json: J): { bases: WebBase[]; hasMore: boolean; total: number } {
  if (!json || typeof json !== 'object') throw new Error('search: không phải JSON');
  if (json.code !== 0) throw new Error(`search: Lark báo lỗi ${json.code}: ${json.msg || ''}`.trim());
  const d = json.data || {};
  const objs = d.entities?.objs || {};
  const order: string[] = Array.isArray(d.tokens) ? d.tokens : Object.keys(objs);
  const bases: WebBase[] = [];
  for (const tok of order) {
    const o = objs[tok];
    if (!o || Number(o.type) !== OBJ_BITABLE) continue;
    const wiki = Array.isArray(o.wiki_infos) && o.wiki_infos[0] ? o.wiki_infos[0] : null;
    bases.push({
      token: String(o.token || tok),
      name: stripEm(String(o.title || '')).trim() || 'Base chưa đặt tên',
      url: String(o.url || wiki?.wiki_url || ''),
      isWiki: !!wiki,
      wikiToken: wiki?.wiki_token ? String(wiki.wiki_token) : undefined,
      editTime: num(o.edit_time),
      openTime: num(o.open_time),
      wikiSpace: wiki?.space_name ? String(wiki.space_name) : undefined,
    });
  }
  return { bases, hasMore: !!d.has_more, total: Number(d.total) || bases.length };
}

/** Gộp nhiều nguồn, khử trùng theo token (giữ bản đầu — recent đi trước nên thứ tự "mới mở" giữ). */
export function mergeBases(...lists: WebBase[][]): WebBase[] {
  const out = new Map<string, WebBase>();
  for (const l of lists)
    for (const b of l) {
      const prev = out.get(b.token);
      if (!prev) out.set(b.token, b);
      else if (!prev.url && b.url) out.set(b.token, { ...prev, url: b.url });
    }
  return [...out.values()];
}

// ── Cấu trúc Base ─────────────────────────────────────────────────────────────────────────────

/** Giải "H4sI…" (gzip+base64) → object. Chuỗi không nén → JSON.parse thẳng; object → giữ nguyên. */
export function decodeLarkGz(v: unknown): J {
  if (v == null) return null;
  if (typeof v !== 'string') return v;
  const s = v.trim();
  if (s.startsWith('H4sI')) return JSON.parse(gunzipSync(Buffer.from(s, 'base64')).toString('utf8'));
  return JSON.parse(s);
}

export function clientVarsPath(token: string, tableId?: string, recordLimit = 3): string {
  const q = new URLSearchParams();
  if (tableId) {
    q.append('tableID', tableId);
    q.append('viewID', '');
  }
  q.append('recordLimit', String(recordLimit));
  q.append('ondemandLimit', String(recordLimit));
  q.append('needBase', 'true');
  q.append('viewLazyLoad', 'true');
  q.append('ondemandVer', '2');
  q.append('openType', '0');
  q.append('noMissCS', 'true');
  q.append('optimizationFlag', '1');
  q.append('removeFmlExtra', 'true');
  return `/space/api/v1/bitable/${encodeURIComponent(token)}/clientvars?${q.toString()}`;
}

/** Mã kiểu cột nội bộ → tên dễ đọc (cùng bảng mã với Open API). */
export const FIELD_TYPE_VI: Record<number, string> = {
  1: 'Văn bản',
  2: 'Số',
  3: 'Chọn một',
  4: 'Chọn nhiều',
  5: 'Ngày',
  7: 'Hộp kiểm',
  11: 'Người',
  13: 'Số điện thoại',
  15: 'Liên kết URL',
  17: 'Tệp đính kèm',
  18: 'Liên kết bảng (một chiều)',
  19: 'Tra cứu',
  20: 'Công thức',
  21: 'Liên kết hai chiều',
  22: 'Vị trí',
  23: 'Nhóm chat',
  1001: 'Ngày tạo',
  1002: 'Ngày sửa',
  1003: 'Người tạo',
  1004: 'Người sửa',
  1005: 'Số tự tăng',
  3001: 'Nút bấm',
};

export interface WebField {
  id: string;
  name: string;
  type: number;
  typeName: string;
  uiType?: string;
  isPrimary?: boolean;
  options?: { id: string; name: string }[];
  linkTable?: string;
}
export interface WebTable {
  id: string;
  name: string;
  fields: WebField[];
  views: { id: string; name: string; type: number }[];
  recordCount?: number;
  /** Vài bản ghi mẫu: tên cột → giá trị đã làm phẳng. */
  samples: Record<string, string>[];
}
export interface WebWorkflowBlock {
  blockId: string;
  name: string;
  workflowId: string;
}
export interface WebBaseMeta {
  token: string;
  name: string;
  tables: { id: string; name: string }[];
  workflowBlocks: WebWorkflowBlock[];
  timezone?: string;
  isManager?: boolean;
}

/** `data.base` (đã giải nén) → tên, danh sách bảng (theo thứ tự `blocks`), khối workflow (86). */
export function parseBaseMeta(base: J): WebBaseMeta {
  if (!base || typeof base !== 'object') throw new Error('clientvars: thiếu data.base');
  const infos = base.blockInfos && typeof base.blockInfos === 'object' ? base.blockInfos : {};
  const trash = base.trashBlockMap || {};
  const order: string[] = Array.isArray(base.blocks) ? base.blocks : Object.keys(infos);
  const tables: { id: string; name: string }[] = [];
  const workflowBlocks: WebWorkflowBlock[] = [];
  for (const id of order) {
    if (trash[id]) continue;
    const b = infos[id] || { id };
    if (Number(b.blockType) === 86 && b.blockToken) {
      workflowBlocks.push({ blockId: String(id), name: String(b.name || 'Quy trình'), workflowId: String(b.blockToken) });
    } else if (/^tbl/.test(String(id)) && !b.blockType) {
      tables.push({ id: String(id), name: String(b.name || id) });
    }
  }
  return {
    token: String(base.token || ''),
    name: String(base.name || ''),
    tables,
    workflowBlocks,
    timezone: base.timezone ? String(base.timezone) : undefined,
    isManager: typeof base.isBaseManager === 'boolean' ? base.isBaseManager : undefined,
  };
}

/** Làm phẳng một giá trị ô nội bộ thành chữ ngắn (cho bản ghi mẫu). */
export function flattenCell(v: J, f?: WebField): string {
  if (v == null) return '';
  if (typeof v === 'string') {
    const o = f?.options?.find((x) => x.id === v);
    return o ? o.name : v;
  }
  if (typeof v === 'number') return f && (f.type === 5 || f.type === 1001 || f.type === 1002) ? new Date(v).toISOString().slice(0, 10) : String(v);
  if (typeof v === 'boolean') return v ? '✓' : '';
  if (Array.isArray(v))
    return v
      .map((x) => (typeof x === 'string' ? (f?.options?.find((o) => o.id === x)?.name ?? x) : x?.text ?? x?.name ?? x?.link ?? ''))
      .filter(Boolean)
      .join(', ');
  if (typeof v === 'object') return String(v.text ?? v.name ?? v.link ?? '');
  return String(v);
}

/** `data.table` (đã giải nén) hoặc một mục tablesv3 → bảng có cột/view/bản ghi mẫu. */
export function parseTableSchema(t: J, name?: string, maxSamples = 3): WebTable {
  if (!t || typeof t !== 'object') throw new Error('Không đọc được cấu trúc bảng');
  const fm = t.fieldMap && typeof t.fieldMap === 'object' ? t.fieldMap : {};
  const viewOrder: string[] = Array.isArray(t.views) ? t.views : Object.keys(t.viewMap || {});
  const firstView = viewOrder[0] ? t.viewMap?.[viewOrder[0]] : null;
  const fieldOrder: string[] = Array.isArray(firstView?.property?.fields) ? firstView.property.fields : Object.keys(fm);
  const ids = [...fieldOrder.filter((id) => fm[id]), ...Object.keys(fm).filter((id) => !fieldOrder.includes(id))];
  const fields: WebField[] = ids.map((id) => {
    const f = fm[id];
    const type = Number(f.type);
    const opts = Array.isArray(f.property?.options) ? f.property.options.map((o: J) => ({ id: String(o.id), name: String(o.name) })) : undefined;
    return {
      id,
      name: String(f.name || id),
      type,
      typeName: FIELD_TYPE_VI[type] || String(f.fieldUIType || type),
      uiType: f.fieldUIType ? String(f.fieldUIType) : undefined,
      ...(f.isPrimary || t.primaryKey === id ? { isPrimary: true } : {}),
      ...(opts?.length ? { options: opts } : {}),
      ...(f.property?.tableId ? { linkTable: String(f.property.tableId) } : {}),
    };
  });
  const views = viewOrder
    .map((id) => t.viewMap?.[id])
    .filter(Boolean)
    .map((v: J) => ({ id: String(v.id), name: String(v.name || v.id), type: Number(v.type) || 1 }));
  const samples: Record<string, string>[] = [];
  const rm = t.recordMap && typeof t.recordMap === 'object' ? t.recordMap : {};
  for (const rid of Object.keys(rm).slice(0, maxSamples)) {
    const row: Record<string, string> = {};
    for (const f of fields) {
      const cell = rm[rid]?.[f.id];
      const s = flattenCell(cell && typeof cell === 'object' && 'value' in cell ? cell.value : cell, f);
      if (s) row[f.name] = s.slice(0, 120);
    }
    samples.push(row);
  }
  return {
    id: String(t.meta?.id || ''),
    name: name || String(t.meta?.name || t.meta?.id || ''),
    fields,
    views,
    recordCount: typeof t.meta?.recordsNum === 'number' ? t.meta.recordsNum : typeof t.recordCount === 'number' ? t.recordCount : undefined,
    samples,
  };
}

// ── Automation / Workflow có sẵn ──────────────────────────────────────────────────────────────

/** Tên tiếng Việt của các loại bước NỘI BỘ hay gặp. */
export const STEP_VI: Record<string, string> = {
  AddRecordTrigger: 'Khi thêm bản ghi',
  SetRecordTrigger: 'Khi bản ghi được sửa',
  ChangeRecordTrigger: 'Khi bản ghi thoả điều kiện',
  ButtonTrigger: 'Khi bấm nút',
  TimerTrigger: 'Theo lịch',
  ScheduledTrigger: 'Theo lịch',
  ReminderTrigger: 'Nhắc theo ngày',
  LarkMessageTrigger: 'Khi nhận tin nhắn',
  LarkMessageAction: 'Gửi tin nhắn Lark',
  SendMessageAction: 'Gửi tin nhắn',
  AddRecordAction: 'Thêm bản ghi',
  SetRecordAction: 'Cập nhật bản ghi',
  FindRecordAction: 'Tìm bản ghi',
  DeleteRecordAction: 'Xoá bản ghi',
  HTTPClientAction: 'Gọi HTTP',
  WebhookAction: 'Gọi webhook',
  IfElseBranch: 'Rẽ nhánh Nếu/Thì',
  SwitchBranch: 'Rẽ nhiều nhánh',
  Loop: 'Lặp',
  Delay: 'Chờ',
};

export interface WebAutomation {
  workflowId: string;
  title: string;
  /** 1 = đang bật, 0 = tắt. */
  status: number;
  enabled: boolean;
  kind: 'automation' | 'workflow';
  source?: number;
  steps: { id: string; type: string; label: string; title?: string; table?: string }[];
  updateTime?: number;
}

function safeJson(s: unknown): J {
  if (s == null) return null;
  if (typeof s === 'object') return s;
  try {
    return JSON.parse(String(s));
  } catch {
    return null;
  }
}

/** Một bản ghi workflow nội bộ (list item hoặc detail.workflow) → tóm tắt đọc được. */
export function summarizeWorkflow(w: J, kind: 'automation' | 'workflow', tableNames: Record<string, string> = {}, fallbackTitle = ''): WebAutomation {
  const draft = safeJson(w?.draft) || {};
  const extra = safeJson(w?.extra) || {};
  const tmap = extra.TableMap || {};
  const realTable = (ref: unknown): string | undefined => {
    const r = String(ref || '');
    if (!r) return undefined;
    const id = tmap[r]?.TableID || r.replace(/^ref_/, '');
    return tableNames[id] || id;
  };
  const steps = (Array.isArray(draft.steps) ? draft.steps : []).map((s: J) => ({
    id: String(s?.id || ''),
    type: String(s?.type || ''),
    label: STEP_VI[String(s?.type || '')] || String(s?.type || ''),
    ...(s?.stepTitle ? { title: String(s.stepTitle) } : {}),
    ...(s?.data?.tableId ? { table: realTable(s.data.tableId) } : {}),
  }));
  const status = Number(w?.status) || 0;
  return {
    workflowId: String(w?.workflowID || w?.workflowId || ''),
    title: String(draft.title || fallbackTitle || (kind === 'workflow' ? 'Quy trình' : 'Tự động hoá')),
    status,
    enabled: status === 1,
    kind,
    ...(w?.source != null ? { source: Number(w.source) } : {}),
    steps,
    ...(w?.updateTime ? { updateTime: Number(w.updateTime) } : {}),
  };
}

/** automation/list → danh sách Automation (Trung tâm tự động hoá). */
export function parseAutomationList(json: J, tableNames: Record<string, string> = {}): WebAutomation[] {
  if (!json || typeof json !== 'object') throw new Error('automation/list: không phải JSON');
  if (json.code !== 0) throw new Error(`automation/list: Lark báo lỗi ${json.code}: ${json.msg || ''}`.trim());
  const list = json.data?.workflowList;
  return Array.isArray(list) ? list.map((w: J) => summarizeWorkflow(w, 'automation', tableNames)) : [];
}

/** Gợi ý "Larkwave Test" trong danh sách: so khớp tên không phân biệt hoa thường/dấu cách. */
export function findBaseByName(bases: WebBase[], name: string): WebBase | undefined {
  const norm = (s: string) => s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
  const n = norm(name);
  return bases.find((b) => norm(b.name) === n);
}

/** Lấy app_token từ link Base/Wiki dán vào (chỉ phần dạng /base/<token>; wiki cần tra thêm). */
export function baseTokenFromUrl(url: string): { token?: string; wikiToken?: string } {
  const b = url.match(/\/(?:base|bitable)\/([A-Za-z0-9]{10,})/);
  if (b) return { token: b[1] };
  const w = url.match(/\/wiki\/([A-Za-z0-9]{10,})/);
  if (w) return { wikiToken: w[1] };
  return {};
}

function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
