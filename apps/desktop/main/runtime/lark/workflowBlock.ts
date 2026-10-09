import type { WebBaseMeta, WebTable } from './larkWebApi';
import { outlineSignature } from './workflowInternal';

/**
 * Khối **Quy trình làm việc (Workflow)** của Base — KHÁC "Tự động hoá" (Automation).
 *
 * Trên Lark Base có hai thứ hoạt động gần giống nhau nhưng khác hẳn về hình thức:
 *   - **Tự động hoá** (Automation): danh sách quy tắc trong "Trung tâm tự động hoá" của Base.
 *   - **Quy trình làm việc** (Workflow): một KHỐI nằm ở thanh bên của Base (cạnh các bảng), mở ra là
 *     một CANVAS sơ đồ các bước nối nhau. Đây là cái người dùng muốn thấy khi nói "workflow".
 *
 * Đọc từ mã trình soạn của Lark (bundle `vb_31004…` / `__viewpack__default_bundle`, hàm
 * `handleAddWorkFlow` của thanh bên + `createBlockWorkflow` của base-workflow-service) và đo thật
 * trên Base Test ngày 09/10/2026 — xem docs/lark-web-api.md mục 11. Luồng bấm "+ Mới → Workflow":
 *
 *   1. `POST /space/api/bitable/:token/workflow/create`
 *        `{ token, draft, extra, triggerName, source: "workflow_block", bizType: "2" }` → `data.workflowID`
 *      (`bizType: "2"` do hàm `yL` của Lark gắn vào MỌI request khi ở chế độ Workflow builder.)
 *   2. Lớp lệnh trong trang: `ctx.operate.baseOperate.addBlock({ type: "WORKFLOW", parentId, token: workflowID, name })`
 *        → `{ result: 2, data: { id: "wkf…" } }` — khối hiện ở thanh bên (blockType 86, blockToken = workflowID).
 *
 * `draft` của khối có CÙNG khuôn bước với Automation (`steps` + bí danh `ref_<tbl>` / `ref_<tbl>_<fld>`),
 * không có `title` (tên là tên khối), thêm `extensionI18nMap` và `tabldFieldMap` (Lark viết sai chính
 * tả "tabld" — giữ nguyên): `{ <tbl>: { <fld>: { type } } }` của các bảng được tham chiếu. Tạo mới không
 * gửi `status` ⇒ máy chủ để TẮT (status 0). Larkwave không có đường nào bật.
 *
 * Module này THUẦN (không electron) để kiểm bằng fixture.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type J = any;

export const WORKFLOW_BLOCK_TYPE = 'WORKFLOW';
export const WORKFLOW_BLOCK_SOURCE = 'workflow_block';

/** Bản nháp Automation (từ v3ToInternal) → bản nháp của KHỐI Workflow. */
export function toWorkflowBlockDraft(draft: J, extra: J, tables: Pick<WebTable, 'id' | 'fields'>[]): { draft: J; extra: J } {
  const steps: J[] = Array.isArray(draft?.steps) ? draft.steps : [];
  const map: Record<string, Record<string, { type: number }>> = {};
  const TableMap = extra?.TableMap && typeof extra.TableMap === 'object' ? extra.TableMap : {};
  for (const ref of Object.keys(TableMap)) {
    const tid = String(TableMap[ref]?.TableID || '');
    const t = tables.find((x) => x.id === tid);
    if (!t) continue;
    map[tid] = Object.fromEntries(t.fields.map((f) => [f.id, { type: f.type }]));
  }
  return {
    draft: { steps, extensionI18nMap: {}, tabldFieldMap: map },
    extra: { TableMap, BlockMap: extra?.BlockMap || {}, BtnTrigger: extra?.BtnTrigger || { TableID: '', FieldID: '' } },
  };
}

/** Body của `POST /space/api/bitable/:token/workflow/create` — KHÔNG có `status` (máy chủ để tắt). */
export function workflowCreateBody(token: string, p: { draft: J; extra: J; triggerName: string }): J {
  return {
    token,
    draft: typeof p.draft === 'string' ? p.draft : JSON.stringify(p.draft),
    extra: typeof p.extra === 'string' ? p.extra : JSON.stringify(p.extra),
    triggerName: p.triggerName || '',
    source: WORKFLOW_BLOCK_SOURCE,
    bizType: '2',
  };
}

/** Đường đọc chi tiết một khối Workflow (draft/extra/status). */
export const workflowDetailPath = (token: string, workflowID: string) =>
  `/space/api/bitable/${encodeURIComponent(token)}/workflow/detail?workflowID=${encodeURIComponent(workflowID)}&bizType=2`;

/** Trích workflowID từ phản hồi của workflow/create. */
export function parseCreateResponse(j: J): { ok: true; workflowID: string } | { ok: false; error: string } {
  if (!j || typeof j !== 'object') return { ok: false, error: 'Lark không trả JSON.' };
  if (j.code !== 0) return { ok: false, error: `Lark từ chối tạo workflow (mã ${j.code}: ${j.msg || 'không rõ'}).` };
  const id = j.data?.workflowID ?? j.data?.workflowId ?? j.data?.workflow?.workflowID;
  if (!id) return { ok: false, error: 'Lark báo tạo xong nhưng không trả workflowID.' };
  return { ok: true, workflowID: String(id) };
}

/**
 * JS chạy TRONG trang Base: gắn workflow vừa tạo thành một KHỐI ở thanh bên — đúng lệnh thanh bên của
 * Lark gọi (`baseOperate.addBlock({type:"WORKFLOW", parentId, token, name})`). Không ném.
 */
export function addWorkflowBlockScript(op: { token: string; workflowID: string; name: string }): string {
  return `(async () => {
  var OP = ${JSON.stringify(op)};
  try {
    var ctxs = window.bitableConnectContexts ? Array.from(window.bitableConnectContexts) : [];
    var c = null;
    for (var i = 0; i < ctxs.length; i++) { try { if (ctxs[i].base && ctxs[i].base.getToken() === OP.token) c = ctxs[i]; } catch (e) {} }
    if (!c) return { ok: false, error: 'no-context', hint: 'Trang Lark chưa mở đúng Base này.' };
    var r = await c.operate.baseOperate.addBlock({ type: ${JSON.stringify(WORKFLOW_BLOCK_TYPE)}, parentId: null, token: OP.workflowID, name: OP.name }, {});
    var res = r ? { result: r.result, reason: r.reason, data: r.data } : null;
    if (!r || r.result !== 2 || !r.data || !r.data.id) return { ok: false, error: 'add-block-failed', r: res };
    return { ok: true, blockId: String(r.data.id), r: res };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
})()`;
}

/**
 * JS gỡ một khối Workflow (đưa vào thùng rác của Base, như người dùng bấm Xoá). CHỈ dùng để dọn
 * khối do chính Larkwave vừa tạo hỏng / khối thử — KHÔNG có tool nào cho agent gọi cái này.
 */
export function deleteWorkflowBlockScript(op: { token: string; blockId: string; workflowID: string }): string {
  return `(async () => {
  var OP = ${JSON.stringify(op)};
  try {
    var ctxs = window.bitableConnectContexts ? Array.from(window.bitableConnectContexts) : [];
    var c = null;
    for (var i = 0; i < ctxs.length; i++) { try { if (ctxs[i].base && ctxs[i].base.getToken() === OP.token) c = ctxs[i]; } catch (e) {} }
    if (!c) return { ok: false, error: 'no-context' };
    var b = c.base.getBlock(OP.blockId);
    if (!b || b.getType() !== ${JSON.stringify(WORKFLOW_BLOCK_TYPE)} || String(b.getToken()) !== OP.workflowID) return { ok: false, error: 'not-our-block' };
    var r = await c.operate.baseOperate.delBlock({ id: OP.blockId }, {});
    return { ok: !!r && r.result === 2, r: r ? { result: r.result, reason: r.reason } : null };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
})()`;
}

/**
 * Đọc lại sau khi tạo: khối có trong thanh bên (blockType 86, đúng workflowID), bản nháp đã lưu
 * đúng số/loại bước, và ĐANG TẮT. Không tin "code 0" suông.
 */
export function verifyWorkflowBlock(
  meta: Pick<WebBaseMeta, 'workflowBlocks'> | null,
  detail: J,
  expected: { workflowID: string; steps: J[]; name?: string },
): { ok: boolean; blockId?: string; enabled: boolean; problems: string[] } {
  const problems: string[] = [];
  const blk = meta?.workflowBlocks.find((b) => b.workflowId === expected.workflowID);
  if (!blk) problems.push('Chưa thấy khối Workflow ở thanh bên của Base khi đọc lại.');
  else if (expected.name && blk.name !== expected.name) problems.push(`Khối đọc lại tên «${blk.name}», không phải «${expected.name}».`);
  const w = detail?.workflow ?? detail;
  if (!w || typeof w !== 'object') problems.push('Không đọc lại được chi tiết workflow.');
  const enabled = Number(w?.status) === 1;
  let draft: J = w?.draft;
  if (typeof draft === 'string') {
    try {
      draft = JSON.parse(draft);
    } catch {
      draft = null;
    }
  }
  // So CẤU TRÚC cây (loại bước + cạnh rẽ nhánh/lặp + độ sâu), không chỉ danh sách loại.
  const got = outlineSignature(draft);
  const want = outlineSignature({ steps: expected.steps });
  if (w && got !== want) problems.push(`Cây bước đã lưu (${got || 'trống'}) khác bản gửi (${want}).`);
  if (enabled) problems.push('Workflow đang BẬT — Larkwave không bao giờ bật; kiểm tra ngay trong Lark.');
  return { ok: !problems.length, blockId: blk?.blockId, enabled, problems };
}

/** Link mở thẳng khối Workflow (canvas) trong Base. */
export function workflowBlockUrl(host: string, token: string, blockId: string): string {
  return `${host.replace(/\/$/, '')}/base/${encodeURIComponent(token)}?table=${encodeURIComponent(blockId)}`;
}

/**
 * JS chạy TRONG trang đang mở canvas của khối: dùng CHÍNH bộ kiểm của trình soạn Lark (`window.workflow`
 * — đối tượng workflow của canvas) để soi cấu hình từng bước (`getIsConfigNotReady/getIsConfigError` +
 * danh sách lỗi) và thử dựng `toSchema()` — thứ Lark tính khi BẬT (lỗi 800004006 cũ nằm ở đây). Chỉ
 * TÍNH TOÁN cục bộ, không lưu, không bật. `expectWorkflowID` để chắc đang soi đúng khối.
 */
export function canvasSelfCheckScript(expectWorkflowID: string): string {
  return `(async () => {
  var W = window.workflow;
  if (!W) return { ok: false, error: 'no-canvas' };
  var wid = String(W.id || W.workflowID || W.workflowId || (W.config && W.config.workflowID) || '');
  if (wid && wid !== ${JSON.stringify(expectWorkflowID)}) return { ok: false, error: 'other-workflow', wid: wid };
  var steps = [];
  try { steps = W.getAllSteps ? W.getAllSteps() : []; } catch (e) {}
  if (!Array.isArray(steps)) steps = Object.values(steps || {});
  var bad = [];
  // Trình soạn gọi các hàm kiểm với ngữ cảnh có getMaxFlowLimit (vd Loop đọc maxLoopNum) — đưa đúng thứ đó.
  var CTX = { getMaxFlowLimit: function () { return (W.config && W.config.limits) || { maxLoopNum: 5000 }; } };
  for (var i = 0; i < steps.length; i++) {
    var s = steps[i], r = { id: s.id, type: s.type, title: s.stepTitle || '' }, isBad = false;
    ['getIsConfigNotReady', 'getIsConfigError', 'getIsTaskConfigError', 'getIsTaskConfigNotReady'].forEach(function (f) {
      try { if (s[f] && s[f](CTX)) { r[f] = true; isBad = true; } } catch (e) { r[f] = 'ERR ' + (e && e.message); isBad = true; }
    });
    ['getConfigErrorInfoList', 'getConfigNotReadyErrorInfoList', 'getTaskConfigErrorInfoList', 'getTaskConfigNotReadyErrorInfoList'].forEach(function (f) {
      try { var v = s[f] && s[f](CTX); if (v && v.length) { r[f] = JSON.stringify(v).slice(0, 300); isBad = true; } } catch (e) {}
    });
    if (isBad) bad.push(r);
  }
  var schema = null, schemaError = null;
  try { var sc = await W.toSchema(); schema = sc ? JSON.stringify(sc).length : 0; } catch (e) { schemaError = String(e && e.message || e); }
  return { ok: bad.length === 0 && !schemaError, steps: steps.length, bad: bad, schemaBytes: schema, schemaError: schemaError };
})()`;
}
