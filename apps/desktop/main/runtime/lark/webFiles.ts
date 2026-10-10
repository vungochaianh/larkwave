/**
 * Đưa TỆP lên Lark qua PHIÊN WEB (không cần App ID): tải lên Drive / ô đính kèm Bitable, nhập
 * xlsx/csv thành Lark Sheets và docx thành Lark Docs, đọc lại để xác minh. THUẦN — kiểm bằng fixture.
 *
 * Đo thật trên tenant ngày 10/10/2026 (docs/lark-web-api.md mục 14), đọc từ chính bộ tải lên của Lark
 * (`bitable_upload_sdk` → `directUpload`, `createImportTask`, `importStatusCheck`):
 *
 *   Tải lên     POST /space/api/box/stream/upload/all/?name&size&checksum(adler32)&mount_point&mount_node_token
 *               [&ext[extra]] — multipart `file`, header `biz-ua-type: Web`, `biz-scene: file_upload`, x-csrftoken.
 *               → {code:0, data:{file_token, extra:{node_token?}}}. Cùng origin tenant chạy được (khỏi CORS).
 *     mount_point: `explorer` (Drive, node = token thư mục), `bitable_file`/`bitable_image` (ô đính kèm, node =
 *     app_token của Base), `ccm_import` (nguồn để nhập, ext[extra] = {"obj_type","file_extension"}).
 *   Nhập        POST /space/api/import/create/ JSON {file_token, type: sheet|docx, file_extension, point:{mount_type:1,
 *               mount_key:<thư mục>}, event_source, client_token, passback} → {data:{ticket}}. THIẾU event_source là
 *               "Parameter Error" (code 2).
 *   Kết quả     GET /space/api/import/result/<ticket>/?token=<thư mục> → data.result {job_status 0 = xong, ≥3 = lỗi,
 *               token, url, type}. docx tối giản (thiếu styles/settings/docProps) → job_status 129 "save_as_import".
 *   Thư mục     POST /space/api/explorer/v2/create/folder/ (form) {parent_token, name, source:0} → data.node_list[0].
 *   Tệp trong   GET /space/api/explorer/v2/children/list/?token=<thư mục>
 */
import { extname } from 'node:path';

/* eslint-disable @typescript-eslint/no-explicit-any */
type J = any;

/** Trần cho tải lên một lần (đường "upload/all" — Lark dùng tải theo khối cho tệp lớn hơn). */
export const WEB_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;

/** Adler-32 — đúng hàm `Ei` của bộ tải lên Lark (tham số `checksum`, chuỗi thập phân). */
export function adler32(buf: Uint8Array): number {
  let a = 1;
  let b = 0;
  const MOD = 65521;
  for (let i = 0; i < buf.length; ) {
    const end = Math.min(i + 3800, buf.length);
    for (; i < end; i++) {
      a += buf[i]!;
      b += a;
    }
    a %= MOD;
    b %= MOD;
  }
  return ((b << 16) | a) >>> 0;
}

export type MountPoint = 'explorer' | 'bitable_file' | 'bitable_image' | 'ccm_import';

export function uploadQuery(o: { name: string; size: number; checksum: number; mountPoint: MountPoint; mountNode: string; extra?: string }): string {
  const q = new URLSearchParams({
    name: o.name,
    size: String(o.size),
    checksum: String(o.checksum),
    mount_point: o.mountPoint,
    mount_node_token: o.mountNode,
    push_open_history_record: '0',
  });
  if (o.extra) q.set('ext[extra]', o.extra);
  return `/space/api/box/stream/upload/all/?${q}`;
}

/** Đoạn chạy trong trang: dựng File từ base64 rồi POST multipart cùng origin. */
export function uploadScript(o: { path: string; b64: string; name: string; mime: string }): string {
  return `(async () => {
  try {
    var bin = atob(${JSON.stringify(o.b64)});
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    var fd = new FormData();
    fd.append('file', new File([u8], ${JSON.stringify(o.name)}, { type: ${JSON.stringify(o.mime || 'application/octet-stream')} }));
    var m = document.cookie.match(/(?:^|; )_csrf_token=([^;]+)/);
    var r = await fetch(${JSON.stringify(o.path)}, { method: 'POST', credentials: 'include', headers: { 'x-csrftoken': m ? decodeURIComponent(m[1]) : '', 'biz-ua-type': 'Web', 'biz-scene': 'file_upload' }, body: fd });
    var t = await r.text(); var j = null; try { j = JSON.parse(t); } catch (e) {}
    return { status: r.status, json: j, snippet: j ? null : t.slice(0, 300) };
  } catch (e) { return { error: String(e && e.message || e) }; }
})()`;
}

/**
 * Đường TẢI XUỐNG một tệp Drive / tệp đính kèm Base qua phiên web (đo 10/10/2026, xem docs/lark-web-api.md
 * mục 17). Tệp ở ô đính kèm của Base bật quyền nâng cao cần `extra={"bitablePerm":{tableId, attachments:
 * {<fld>:{<rec>:[<token>]}}}}` (CHUỖI JSON) — cùng bẫy với đường Open API.
 */
export function downloadPaths(host: string, fileToken: string, o: { mountPoint?: 'explorer' | 'bitable_file' | 'bitable_image'; extra?: Record<string, unknown> } = {}): string[] {
  const q = new URLSearchParams();
  if (o.mountPoint && o.mountPoint !== 'explorer') q.set('mount_point', o.mountPoint);
  if (o.extra) q.set('extra', JSON.stringify(o.extra));
  const qs = q.toString() ? `?${q}` : '';
  const rel = `/space/api/box/stream/download/all/${encodeURIComponent(fileToken)}/${qs}`;
  const out = [rel];
  // Lark web tải tệp qua tên miền luồng riêng của vùng (vd internal-api-drive-stream-sg.larksuite.com);
  // cùng cookie phiên (CORS có credentials). Thử sau đường cùng origin.
  const m = /^https:\/\/[^/]+\.(sg\.|jp\.|us\.)?(larksuite\.com|feishu\.cn)/i.exec(host || '');
  if (m) {
    const region = m[1] ? `-${m[1].replace('.', '')}` : '';
    out.push(`https://internal-api-drive-stream${region}.${m[2]}${rel}`);
  }
  return out;
}

/** Đoạn chạy trong trang: GET nhị phân (cookie + csrf), trả base64 + kiểu + tên tệp từ Content-Disposition. */
export function downloadScript(paths: string[], maxBytes: number): string {
  return `(async () => {
  var m = document.cookie.match(/(?:^|; )_csrf_token=([^;]+)/);
  var tried = [];
  for (var k = 0; k < ${JSON.stringify(paths)}.length; k++) {
    var url = ${JSON.stringify(paths)}[k];
    try {
      var r = await fetch(url, { credentials: 'include', headers: { 'x-csrftoken': m ? decodeURIComponent(m[1]) : '' } });
      var ct = r.headers.get('content-type') || '';
      if (!r.ok || /json|html/i.test(ct)) { var t = ''; try { t = (await r.text()).slice(0, 200); } catch (e) {} tried.push(url.split('?')[0].slice(0, 90) + ' → HTTP ' + r.status + ' ' + t); continue; }
      var buf = await r.arrayBuffer();
      if (buf.byteLength > ${maxBytes}) return { error: 'too-big', bytes: buf.byteLength };
      var u8 = new Uint8Array(buf), bin = '', CH = 0x8000;
      for (var i = 0; i < u8.length; i += CH) bin += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
      return { ok: true, b64: btoa(bin), mime: ct, disposition: r.headers.get('content-disposition') || '', via: url.split('?')[0] };
    } catch (e) { tried.push(url.split('?')[0].slice(0, 90) + ' → ' + String(e && e.message || e)); }
  }
  return { error: 'all-failed', tried: tried };
})()`;
}

/** Tên tệp từ Content-Disposition (filename*=UTF-8''… hoặc filename="…"). */
export function filenameFromDisposition(d: string): string {
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(d || '');
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''));
    } catch {
      /* rơi xuống */
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/.exec(d || '');
  if (plain) {
    try {
      return decodeURIComponent(plain[1].trim());
    } catch {
      return plain[1].trim();
    }
  }
  return '';
}

export function parseUploadResponse(res: J): { ok: true; fileToken: string; nodeToken?: string } | { ok: false; error: string } {
  if (res?.error) return { ok: false, error: `tải lên lỗi: ${res.error}` };
  const j = res?.json;
  if (!j) return { ok: false, error: `tải lên trả về không phải JSON (HTTP ${res?.status ?? '?'}): ${String(res?.snippet || '').slice(0, 120)}` };
  if (j.code !== 0) return { ok: false, error: `Lark từ chối tải lên (mã ${j.code}: ${j.message || j.msg || 'không rõ'})` };
  const ft = j.data?.file_token;
  if (!ft) return { ok: false, error: 'Lark báo tải lên xong nhưng không trả file_token.' };
  const node = j.data?.extra?.node_token;
  return { ok: true, fileToken: String(ft), ...(node ? { nodeToken: String(node) } : {}) };
}

/** Đuôi tệp → loại tài liệu trực tuyến khi NHẬP (đúng bảng `Hi` của Lark, chọn Docs mới cho docx). */
export function importTargetFor(name: string): { type: 'sheet' | 'docx'; ext: string } | null {
  const ext = extname(name).replace(/^\./, '').toLowerCase();
  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') return { type: 'sheet', ext };
  if (ext === 'docx' || ext === 'doc' || ext === 'md' || ext === 'markdown' || ext === 'txt') return { type: 'docx', ext };
  return null;
}

export function importUploadExtra(t: { type: string; ext: string }): string {
  return JSON.stringify({ obj_type: t.type, file_extension: t.ext });
}

export const IMPORT_CREATE_PATH = '/space/api/import/create/';
export function importCreateBody(o: { fileToken: string; type: string; ext: string; folderToken: string; clientToken: string; timeZone?: string }): J {
  return {
    file_token: o.fileToken,
    type: o.type,
    file_extension: o.ext,
    point: { mount_type: 1, mount_key: o.folderToken },
    event_source: 1,
    client_token: o.clientToken,
    passback: JSON.stringify({ time_zone: o.timeZone || 'Asia/Saigon' }),
  };
}
export function importResultPath(ticket: string, folderToken: string): string {
  return `/space/api/import/result/${encodeURIComponent(ticket)}/?token=${encodeURIComponent(folderToken)}`;
}

export type ImportPoll = { state: 'done'; token: string; url: string; type: string } | { state: 'running' } | { state: 'failed'; error: string; status?: number };

/** job_status: 0 xong; 1/2 đang chạy; ≥3 lỗi (129 = tệp không chuyển được). */
export function parseImportResult(j: J): ImportPoll {
  if (!j || j.code !== 0) return { state: 'failed', error: `Lark báo lỗi khi xem kết quả nhập (mã ${j?.code ?? '?'}: ${j?.msg || 'không rõ'})` };
  const r = j.data?.result;
  if (!r) return { state: 'running' };
  const st = Number(r.job_status);
  if (st === 0 && r.token) return { state: 'done', token: String(r.token), url: String(r.url || ''), type: String(r.type || '') };
  if (st >= 3) {
    const hint = st === 129 ? ' — tệp không đúng chuẩn Office (thiếu phần styles/settings) hoặc bị hỏng' : '';
    return { state: 'failed', status: st, error: `Lark không nhập được tệp (job_status ${st}: ${r.job_error_msg || 'không rõ'}${hint}).` };
  }
  return { state: 'running' };
}

export const CREATE_FOLDER_PATH = '/space/api/explorer/v2/create/folder/';
export function parseCreateFolder(j: J): { ok: true; token: string; url?: string } | { ok: false; error: string } {
  if (!j || j.code !== 0) return { ok: false, error: `Lark từ chối tạo thư mục (mã ${j?.code ?? '?'}: ${j?.msg || 'không rõ'})` };
  const token = j.data?.node_list?.[0];
  if (!token) return { ok: false, error: 'Lark không trả token thư mục.' };
  const url = j.data?.entities?.nodes?.[token]?.url;
  return { ok: true, token: String(token), ...(url ? { url: String(url) } : {}) };
}

export function childrenPath(folderToken: string): string {
  return `/space/api/explorer/v2/children/list/?token=${encodeURIComponent(folderToken)}&length=200`;
}
/** Danh sách con của thư mục: [{node, name, type, obj_token, url}] (bỏ chính thư mục). */
export function parseChildren(j: J, folderToken: string): { node: string; name: string; type: number; objToken: string; url?: string }[] {
  const nodes = j?.data?.entities?.nodes || {};
  const list: string[] = Array.isArray(j?.data?.node_list) ? j.data.node_list : Object.keys(nodes);
  return list
    .filter((k) => k !== folderToken && nodes[k])
    .map((k) => ({ node: k, name: String(nodes[k].name || ''), type: Number(nodes[k].type), objToken: String(nodes[k].obj_token || ''), ...(nodes[k].url ? { url: String(nodes[k].url) } : {}) }));
}

/** Token thư mục từ link `…/drive/folder/<token>` (hoặc chính token). */
export function folderTokenFrom(v: string): string {
  const s = String(v || '').trim();
  const m = /\/drive\/folder\/([A-Za-z0-9]+)/.exec(s);
  return m ? m[1] : /^[A-Za-z0-9]{10,}$/.test(s) ? s : '';
}
/** Token bảng tính từ link `…/sheets/<token>` (hoặc chính token). */
export function sheetTokenFrom(v: string): string {
  const s = String(v || '').trim();
  const m = /\/sheets\/([A-Za-z0-9]+)/.exec(s);
  return m ? m[1] : /^[A-Za-z0-9]{10,}$/.test(s) ? s : '';
}

export function driveFileUrl(host: string, fileToken: string): string {
  return `${host.replace(/\/$/, '')}/file/${fileToken}`;
}

// ── Sheets: đọc / ghi trong trang (window.spread) ─────────────────────────────────────────────

/** "B3" → {row:2, col:1} (0-based). */
export function parseA1(a1: string): { row: number; col: number } | null {
  const m = /^\s*([A-Za-z]{1,3})(\d{1,7})\s*$/.exec(String(a1 || ''));
  if (!m) return null;
  let col = 0;
  for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { row: Number(m[2]) - 1, col: col - 1 };
}

export function colLetter(i: number): string {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Đọc lại bảng tính: tên + id các sheet, và dữ liệu (số dòng/cột có dữ liệu + vài dòng đầu) của sheet
 * ĐANG MỞ. Lark Sheets chỉ tải dữ liệu của sheet đang mở (đo 10/10/2026: sheet thứ hai đọc ra trống,
 * mở bằng `?sheet=<id>` thì có đủ, còn sheet đầu lại trống) — main đọc từng sheet bằng cách mở `?sheet=`.
 */
export function sheetReadScript(o: { maxRows?: number; maxCols?: number; scanRows?: number } = {}): string {
  return `(async () => {
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  for (var k = 0; k < 60; k++) { if (window.spread && window.spread.sheets && window.spread.sheets.length) break; await sleep(500); }
  if (!(window.spread && window.spread.sheets)) return { ok: false, error: 'sheet-not-ready' };
  await sleep(1200);
  var MR = ${o.maxRows ?? 10}, MC = ${o.maxCols ?? 12}, SCAN = ${o.scanRows ?? 2000};
  var readSheet = function (sh) {
    var rows = 0, cols = 0, head = [];
    var rc = Math.min(sh.getRowCount ? sh.getRowCount() : 0, SCAN), cc = Math.min(sh.getColumnCount ? sh.getColumnCount() : 0, 200);
    for (var r = 0; r < rc; r++) {
      var line = [], has = false, last = -1;
      for (var c = 0; c < cc; c++) { var v = null; try { v = sh.getValue(r, c); } catch (e) {} if (v !== null && v !== undefined && v !== '') { has = true; last = c; } line.push(v === null || v === undefined ? '' : v); }
      if (has) { rows = r + 1; cols = Math.max(cols, last + 1); }
      if (r < MR) head.push(line.slice(0, MC));
    }
    return { rows: rows, cols: cols, head: head.slice(0, Math.min(MR, rows)).map(function (l) { return l.slice(0, Math.min(MC, cols)); }) };
  };
  var active = window.spread._activeSheetIndex || 0;
  var out = window.spread.sheets.map(function (sh, i) {
    var base = { name: sh.name ? sh.name() : '', id: sh.id ? sh.id() : '', active: i === active };
    return i === active ? Object.assign(base, readSheet(sh), { loaded: true }) : Object.assign(base, { rows: 0, cols: 0, head: [], loaded: false });
  });
  return { ok: true, sheets: out };
})()`;
}

/**
 * Ghi một vùng vào bảng tính ĐANG CÓ: từng ô bằng `setCellValue` (đúng lệnh EDIT_CELL khi người dùng
 * gõ). Chữ ghi nguyên văn (giữ số 0 đầu: autoFormat=false + dontParseNumber), số ghi số, chuỗi bắt
 * đầu "=" là công thức. Đọc lại ngay để đối chiếu.
 */
export function sheetWriteScript(o: { sheetName?: string; row: number; col: number; values: unknown[][] }): string {
  return `(async () => {
  for (var k = 0; k < 60; k++) { if (window.spread && window.spread.sheets && window.spread.sheets.length) break; await new Promise(function (r) { setTimeout(r, 500); }); }
  if (!(window.spread && window.spread.sheets)) return { ok: false, error: 'sheet-not-ready' };
  var OP = ${JSON.stringify(o)};
  var sh = OP.sheetName ? window.spread.sheets.find(function (s) { return s.name && s.name() === OP.sheetName; }) : window.spread.sheets[window.spread._activeSheetIndex || 0];
  if (!sh) return { ok: false, error: 'no-sheet', sheets: window.spread.sheets.map(function (s) { return s.name(); }) };
  var written = 0, failed = [];
  for (var r = 0; r < OP.values.length; r++) {
    for (var c = 0; c < OP.values[r].length; c++) {
      var v = OP.values[r][c], rr = OP.row + r, cc = OP.col + c, ok;
      if (v === null || v === undefined || v === '') ok = sh.setCellValue(rr, cc, '');
      else if (typeof v === 'number') ok = sh.setCellValue(rr, cc, String(v));
      else if (typeof v === 'boolean') ok = sh.setCellValue(rr, cc, v ? 'TRUE' : 'FALSE');
      else if (String(v).charAt(0) === '=') ok = sh.setCellValue(rr, cc, String(v));
      else ok = sh.setCellValue(rr, cc, String(v), false, undefined, true);
      if (ok === false) failed.push([rr, cc]); else written++;
    }
  }
  await new Promise(function (r) { setTimeout(r, 1500); });
  var back = [];
  for (var r2 = 0; r2 < OP.values.length; r2++) { var line = []; for (var c2 = 0; c2 < OP.values[r2].length; c2++) { var x = null; try { x = sh.getValue(OP.row + r2, OP.col + c2); } catch (e) {} line.push(x === undefined ? null : x); } back.push(line); }
  return { ok: failed.length === 0, sheet: sh.name(), written: written, failed: failed, back: back, protectedSheet: !!(sh.options && sh.options.isProtected) };
})()`;
}

/** Đối chiếu vùng vừa ghi với bản đọc lại (công thức so bằng việc ô có giá trị, số so theo số). */
export function compareSheetBack(values: unknown[][], back: unknown[][]): { ok: boolean; mismatches: { cell: string; expected: unknown; actual: unknown }[] } {
  const mismatches: { cell: string; expected: unknown; actual: unknown }[] = [];
  values.forEach((row, r) =>
    row.forEach((v, c) => {
      const a = back?.[r]?.[c];
      if (typeof v === 'string' && v.startsWith('=')) return; // công thức: giá trị do Lark tính
      const exp = v === null || v === undefined ? '' : v;
      const act = a === null || a === undefined ? '' : a;
      const same = typeof exp === 'number' ? Number(act) === exp : typeof exp === 'boolean' ? String(act).toUpperCase() === String(exp).toUpperCase() : String(act) === String(exp);
      if (!same) mismatches.push({ cell: `${r},${c}`, expected: exp, actual: act });
    }),
  );
  return { ok: !mismatches.length, mismatches };
}

/** Đọc lại tài liệu Docs: tiêu đề + các đoạn đầu (từ chính trang đã mở). */
export function docReadScript(o: { maxParas?: number } = {}): string {
  return `(async () => {
  var root = null;
  for (var k = 0; k < 60; k++) { root = document.querySelector('.root-render-unit-container') || document.querySelector('[data-block-type="page"]') || document.querySelector('.page-block'); if (root && (root.innerText || '').trim().length > 0) break; await new Promise(function (r) { setTimeout(r, 500); }); }
  var clean = function (s) { return String(s || '').replace(/[\\u200b-\\u200f\\u2060-\\u2064\\ufeff\\u202a-\\u202e]/g, '').trim(); };
  var title = clean(document.title).replace(/\\s*-\\s*Lark Docs\\s*$/i, '');
  var text = clean(root ? root.innerText : document.body.innerText);
  var lines = text.split(/\\n+/).map(clean).filter(function (l) { return l && !/^(Add Icon|Add Cover|Show Document Details|Thêm biểu tượng|Thêm ảnh bìa)$/i.test(l); });
  return { ok: !!lines.length, title: title, paragraphs: lines.length, head: lines.slice(0, ${o.maxParas ?? 8}) };
})()`;
}
