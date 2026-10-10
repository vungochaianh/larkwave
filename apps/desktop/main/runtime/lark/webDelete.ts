/**
 * XOÁ bảng / automation / khối Workflow của một Base qua PHIÊN LARK WEB — phần THUẦN (không Electron):
 * tìm đúng đồ cần xoá theo tên hoặc id, dựng mã chạy trong trang, và đối chiếu sau khi xoá.
 * Test: apps/desktop/test/webDelete.cjs.
 *
 * Đo thật 10/10/2026 trên Base Test (đồ thử do chính Larkwave tạo, xoá xong không còn gì):
 *  - BẢNG: `baseOperate.delBlock({ id: tbl… })` → `result 2`; bảng rời `blocks` của clientvars và nằm
 *    trong `trashBlockMap` → KHÔI PHỤC được từ thùng rác của Base. (Lệnh nội bộ `_delTable` cũng có,
 *    nhưng `delBlock` là đường trình soạn của Lark dùng cho mọi khối, kể cả bảng — loại khối BITABLE_TABLE.)
 *  - KHỐI WORKFLOW: `delBlock({ id: wkf… })` (vào thùng rác) + `POST …/workflow/disable` cho workflowID của
 *    nó — đúng hai bước Lark làm khi người dùng xoá khối (docs/lark-web-api.md §11).
 *  - AUTOMATION: `POST /space/api/bitable/automation/delete { token, workflowID }` → `code 0`, biến khỏi
 *    `automation/list`. Chưa thấy chỗ khôi phục → coi là XOÁ HẲN.
 */
type J = any;

export interface DeleteCatalog {
  tables: { id: string; name: string; records?: number }[];
  automations: { workflowId: string; title: string; enabled?: boolean }[];
  workflows: { blockId: string; workflowId: string; name: string }[];
}

export interface DeletePlan {
  tables: { id: string; name: string; records?: number }[];
  automations: { workflowId: string; title: string; enabled?: boolean }[];
  workflows: { blockId: string; workflowId: string; name: string }[];
}

export interface DeleteRequest {
  tables?: unknown;
  automations?: unknown;
  workflows?: unknown;
}

const norm = (s: unknown) =>
  String(s ?? '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

function list(v: unknown): string[] {
  if (v == null) return [];
  const a = Array.isArray(v) ? v : [v];
  return a.map((x) => String(x ?? '').trim()).filter(Boolean);
}

/**
 * Ghép yêu cầu (tên hoặc id; `"*"` = cả nhóm đó) với những gì Base đang có. Không khớp / khớp nhiều
 * hơn một → lỗi, KHÔNG đoán: xoá nhầm một bảng là mất dữ liệu thật.
 */
export function resolveDeleteTargets(req: DeleteRequest, cat: DeleteCatalog): { ok: true; plan: DeletePlan } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const plan: DeletePlan = { tables: [], automations: [], workflows: [] };

  const pick = <T,>(
    wanted: string[],
    items: T[],
    ids: (t: T) => string[],
    label: (t: T) => string,
    kind: string,
    into: T[],
  ) => {
    if (wanted.includes('*')) {
      for (const it of items) if (!into.includes(it)) into.push(it);
      return;
    }
    for (const w of wanted) {
      const byId = items.filter((t) => ids(t).includes(w));
      const hits = byId.length ? byId : items.filter((t) => norm(label(t)) === norm(w));
      if (!hits.length) errors.push(`Không thấy ${kind} «${w}» trong Base (tên phải đúng như trong Lark, hoặc dùng id).`);
      else if (hits.length > 1) errors.push(`Có ${hits.length} ${kind} cùng tên «${w}» — dùng id để chọn đúng cái: ${hits.map(ids).map((x) => x[0]).join(', ')}.`);
      else if (!into.includes(hits[0])) into.push(hits[0]);
    }
  };

  pick(list(req.tables), cat.tables, (t) => [t.id], (t) => t.name, 'bảng', plan.tables);
  pick(list(req.automations), cat.automations, (a) => [a.workflowId], (a) => a.title, 'automation', plan.automations);
  pick(list(req.workflows), cat.workflows, (w) => [w.blockId, w.workflowId], (w) => w.name, 'workflow', plan.workflows);

  if (errors.length) return { ok: false, errors };
  if (!plan.tables.length && !plan.automations.length && !plan.workflows.length) return { ok: false, errors: ['Chưa nêu thứ gì để xoá (tables / automations / workflows).'] };
  return { ok: true, plan };
}

/** Dòng tóm tắt cho hộp xác nhận + câu trả lời: mỗi thứ một dòng, có số bản ghi và có khôi phục được không. */
export function describePlan(plan: DeletePlan): { tables: string[]; automations: string[]; workflows: string[]; records: number } {
  const records = plan.tables.reduce((n, t) => n + (t.records ?? 0), 0);
  return {
    tables: plan.tables.map((t) => `«${t.name}»${t.records !== undefined ? ` — ${t.records.toLocaleString('vi-VN')} bản ghi` : ''}`),
    automations: plan.automations.map((a) => `«${a.title}»${a.enabled ? ' (đang BẬT)' : ''}`),
    workflows: plan.workflows.map((w) => `«${w.name}»`),
    records,
  };
}

/**
 * JS chạy trong trang Base: gỡ từng khối (bảng hoặc khối Workflow) bằng `delBlock`, như người dùng bấm
 * Xoá. Kiểm loại khối TRƯỚC khi xoá — id của bảng mà trỏ vào khối khác (hay ngược lại) thì bỏ qua.
 * Không ném; trả từng kết quả để nơi gọi đối chiếu với máy chủ.
 */
export function deleteBlocksScript(op: { token: string; blocks: { id: string; kind: 'table' | 'workflow'; workflowId?: string }[] }): string {
  return `(async () => {
  var OP = ${JSON.stringify(op)};
  var out = { ok: true, results: [] };
  try {
    var ctxs = window.bitableConnectContexts ? Array.from(window.bitableConnectContexts) : [];
    var c = null;
    for (var i = 0; i < ctxs.length; i++) { try { if (ctxs[i].base && ctxs[i].base.getToken() === OP.token) c = ctxs[i]; } catch (e) {} }
    if (!c) return { ok: false, error: 'no-context', hint: 'Trang Lark chưa mở đúng Base này.' };
    for (var k = 0; k < OP.blocks.length; k++) {
      var it = OP.blocks[k], res = { id: it.id, kind: it.kind };
      try {
        var b = c.base.getBlock(it.id), type = b && b.getType ? b.getType() : null;
        var good = it.kind === 'table' ? type === 'BITABLE_TABLE' : (type === 'WORKFLOW' && (!it.workflowId || String(b.getToken()) === it.workflowId));
        if (!b) { res.ok = false; res.error = 'not-found'; }
        else if (!good) { res.ok = false; res.error = 'wrong-type'; res.type = type; }
        else {
          var r = await c.operate.baseOperate.delBlock({ id: it.id }, {});
          res.ok = !!r && r.result === 2;
          if (!res.ok) { res.error = 'lark-refused'; res.reason = r ? r.reason : null; }
        }
      } catch (e) { res.ok = false; res.error = String(e && e.message || e); }
      if (!res.ok) out.ok = false;
      out.results.push(res);
    }
    return out;
  } catch (e) { return { ok: false, error: String(e && e.message || e), results: out.results }; }
})()`;
}

/** Sau khi xoá: đọc lại (meta mới + automation/list mới) → từng thứ đã thật sự biến mất chưa. */
export function verifyDeleted(
  plan: DeletePlan,
  after: { tableIds: string[]; workflowBlockIds: string[]; automationIds: string[] },
): { verified: boolean; stillThere: string[] } {
  const stillThere: string[] = [];
  for (const t of plan.tables) if (after.tableIds.includes(t.id)) stillThere.push(`bảng «${t.name}»`);
  for (const w of plan.workflows) if (after.workflowBlockIds.includes(w.blockId)) stillThere.push(`workflow «${w.name}»`);
  for (const a of plan.automations) if (after.automationIds.includes(a.workflowId)) stillThere.push(`automation «${a.title}»`);
  return { verified: stillThere.length === 0, stillThere };
}

/** Lý do Lark từ chối → câu người đọc được (lý do mã hoá của Lark giữ nguyên ở cuối). */
export function refusalText(r: J): string {
  if (!r) return 'không rõ lý do';
  if (r.error === 'not-found') return 'không còn trong Base (có thể đã bị xoá trước đó)';
  if (r.error === 'wrong-type') return `id này không phải ${r.kind === 'table' ? 'bảng' : 'khối workflow'} (loại ${r.type})`;
  if (r.error === 'lark-refused') return `Lark từ chối${r.reason != null ? ` (${typeof r.reason === 'object' ? JSON.stringify(r.reason) : r.reason})` : ''}`;
  return String(r.error || 'lỗi không rõ');
}
