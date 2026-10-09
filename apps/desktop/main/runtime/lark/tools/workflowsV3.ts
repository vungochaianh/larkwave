import { randomUUID } from 'node:crypto';
import { workflowDesignText } from '@larkwave/core';
import { type LarkToolDef, enc, str } from './types';
import type { LarkClient } from '../larkClient';
import {
  SCHEMA_TOPICS,
  baseUrl,
  compactBaseProfile,
  formatIssues,
  mapWorkflowError,
  normalizeWorkflowInput,
  parseBaseRef,
  schemaSection,
  validateWorkflowBody,
  validationProfileFrom,
  type RawScan,
  type RawScanTable,
  type ValidationProfile,
  type WorkflowOp,
} from '../workflowV3';

/**
 * Workflow Lark Base qua Open API CHÍNH THỨC (Base v3) + quét Base để thiết kế.
 *
 * Luồng "một câu lệnh → workflow": bitable_scan_base (Base có gì) → bitable_workflow_schema (tra
 * cấu trúc bước khi cần) → bitable_workflow_validate (kiểm, không ghi) → bitable_workflow_create
 * (hỏi xác nhận, tạo ở trạng thái TẮT, đọc lại để xác minh). KHÔNG có tool bật workflow: bật là việc
 * của người dùng trong Lark, sau khi họ đã xem tận mắt.
 *
 * Đường cũ (API nội bộ qua phiên Lark web, lái giao diện, mẫu) vẫn giữ nhưng chỉ là DỰ PHÒNG khi
 * API này báo không hỗ trợ / thiếu quyền mà người dùng không tự cấp được.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type J = any;

const v3 = (token: string) => `/open-apis/base/v3/bases/${enc(token)}`;
const v1 = (token: string) => `/open-apis/bitable/v1/apps/${enc(token)}`;

const baseInputProps = {
  url: str('Link Base hoặc Wiki chứa Base (…/base/<token>, …/wiki/<node>) — người dùng dán gì thì truyền nguyên văn'),
  app_token: str('app_token của Base (thay cho url; có sẵn trong danh sách Base đã đăng ký)'),
};

// ── Base: link/token → app_token ───────────────────────────────────────────────
export interface ResolvedBase {
  token: string;
  origin?: string;
  name?: string;
  tableId?: string;
  kind: 'base' | 'wiki';
}

/** Một resolver cho mọi tool: link Base, link Wiki (tra node → obj_token), hoặc token trần. */
export async function resolveBaseInput(c: LarkClient, i: { url?: unknown; app_token?: unknown }): Promise<ResolvedBase> {
  const raw = String(i.app_token || i.url || '').trim();
  if (!raw) throw new Error('Thiếu Base: truyền `url` (link Base/Wiki) hoặc `app_token`.');
  const ref = parseBaseRef(raw);
  if (!ref) throw new Error('Không nhận ra Base từ giá trị này — cần link …/base/<token>, …/wiki/<node>, hoặc app_token.');
  if (ref.kind === 'base') return { token: ref.token, origin: ref.origin, tableId: ref.tableId, kind: 'base' };
  const r = await c.request<{ node?: { obj_token?: string; obj_type?: string; title?: string } }>('GET', '/open-apis/wiki/v2/spaces/get_node', {
    params: { token: ref.node, obj_type: 'wiki' },
  });
  const node = r?.node;
  if (!node?.obj_token)
    throw new Error('Không lấy được app_token từ link Wiki — có thể chưa có quyền xem trang này, hoặc app/tài khoản thiếu scope wiki:wiki. Cách khác: mở Base → ••• → Development Tool để copy app_token.');
  if (node.obj_type && node.obj_type !== 'bitable') throw new Error(`Trang Wiki này là "${node.obj_type}", không phải Bitable Base.`);
  return { token: node.obj_token, origin: ref.origin, name: node.title, tableId: ref.tableId, kind: 'wiki' };
}

// ── Đọc Base ───────────────────────────────────────────────────────────────────
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (idx < items.length) {
        const cur = idx++;
        out[cur] = await fn(items[cur]);
      }
    }),
  );
  return out;
}

async function listFieldsRaw(c: LarkClient, token: string, tableId: string): Promise<J[]> {
  const all: J[] = [];
  let pageToken: string | undefined;
  let guard = 0;
  do {
    const d = await c.request<{ items?: J[]; has_more?: boolean; page_token?: string }>('GET', `${v1(token)}/tables/${enc(tableId)}/fields`, {
      params: { page_size: 100, page_token: pageToken },
    });
    if (Array.isArray(d?.items)) all.push(...d.items);
    pageToken = d?.has_more ? d.page_token : undefined;
  } while (pageToken && ++guard < 10);
  return all;
}

/** Hồ sơ dùng để kiểm, nhớ ngắn hạn (quét xong rồi tạo ngay thì khỏi tải lại). */
const PROFILE_TTL_MS = 3 * 60_000;
const profileCache = new Map<string, { at: number; tables: RawScanTable[] }>();

function cacheTables(token: string, tables: RawScanTable[]) {
  profileCache.set(token, { at: Date.now(), tables: tables.map((t) => ({ table_id: t.table_id, name: t.name, fields: t.fields })) });
  if (profileCache.size > 20) profileCache.delete(profileCache.keys().next().value as string);
}

/** Danh sách bảng + cột của ĐÚNG các bảng `names` (bảng khác chỉ có tên — đủ để gợi ý "có phải ý bạn là"). */
async function loadValidationProfile(c: LarkClient, token: string, names: string[]): Promise<ValidationProfile> {
  const hit = profileCache.get(token);
  const fresh = hit && Date.now() - hit.at < PROFILE_TTL_MS;
  // Đủ dùng khi mọi bảng được nhắc tới hoặc KHÔNG có trong Base (sẽ báo lỗi tên), hoặc đã có cột.
  if (fresh && names.every((n) => { const t = hit.tables.find((x) => x.name === n); return !t || !!t.fields; }))
    return validationProfileFrom({ tables: hit.tables });
  const { items } = await c.listAllTables(token);
  const want = new Set(names);
  const tables: RawScanTable[] = await mapLimit(items, 5, async (t) => {
    if (!want.has(t.name)) return { table_id: t.table_id, name: t.name };
    try {
      return { table_id: t.table_id, name: t.name, fields: await listFieldsRaw(c, token, t.table_id) };
    } catch {
      return { table_id: t.table_id, name: t.name };
    }
  });
  const merged = hit ? tables.map((t) => (t.fields ? t : { ...t, fields: hit.tables.find((h) => h.table_id === t.table_id)?.fields })) : tables;
  cacheTables(token, merged);
  return validationProfileFrom({ tables: merged });
}

const isEnabled = (s: unknown) => /^(enabled?|on|true|1|active)$/i.test(String(s ?? ''));
const statusVi = (s: unknown) => (isEnabled(s) ? 'ĐANG BẬT' : 'đang TẮT');

async function listWorkflowsV3(c: LarkClient, token: string, status?: string): Promise<J[]> {
  const all: J[] = [];
  let pageToken: string | undefined;
  let guard = 0;
  do {
    const d = await c.request<{ items?: J[]; has_more?: boolean; page_token?: string }>('POST', `${v3(token)}/workflows/list`, {
      data: { page_size: 100, ...(pageToken ? { page_token: pageToken } : {}), ...(status ? { status } : {}) },
    });
    if (Array.isArray(d?.items)) all.push(...d.items);
    pageToken = d?.has_more ? d.page_token : undefined;
  } while (pageToken && ++guard < 10);
  return all;
}

async function getWorkflowV3(c: LarkClient, token: string, id: string): Promise<J> {
  const d = await c.request<J>('GET', `${v3(token)}/workflows/${enc(id)}`);
  return d?.workflow && typeof d.workflow === 'object' ? d.workflow : d;
}

async function scanBase(c: LarkClient, b: ResolvedBase, o: { samples: number; workflows: boolean; maxTables: number }): Promise<RawScan> {
  const { items } = await c.listAllTables(b.token);
  let name = b.name;
  if (!name) {
    try {
      name = (await c.getBaseApp(b.token))?.app?.name;
    } catch {
      /* tên Base chỉ để hiển thị */
    }
  }
  const detail = items.slice(0, o.maxTables);
  const tables: RawScanTable[] = await mapLimit(detail, 5, async (t) => {
    const out: RawScanTable = { table_id: t.table_id, name: t.name };
    try {
      out.fields = await listFieldsRaw(c, b.token, t.table_id);
    } catch (e) {
      out.error = `không đọc được cột: ${(e as Error)?.message ?? e}`.slice(0, 200);
    }
    try {
      const v = await c.request<{ items?: J[] }>('GET', `${v1(b.token)}/tables/${enc(t.table_id)}/views`, { params: { page_size: 50 } });
      out.views = v?.items ?? [];
    } catch {
      /* view chỉ là ngữ cảnh phụ */
    }
    try {
      const r = await c.request<{ items?: J[]; total?: number }>('POST', `${v1(b.token)}/tables/${enc(t.table_id)}/records/search`, {
        params: { page_size: Math.max(1, o.samples) },
        data: {},
      });
      out.records = { items: o.samples > 0 ? r?.items ?? [] : [], total: r?.total };
    } catch {
      /* bảng không có quyền đọc bản ghi → bỏ mẫu */
    }
    return out;
  });
  cacheTables(b.token, tables);
  const raw: RawScan = { token: b.token, name, origin: b.origin, tables, skipped: items.slice(o.maxTables).map((t) => t.name) };
  if (o.workflows) {
    try {
      raw.workflows = await listWorkflowsV3(c, b.token);
      raw.workflowSteps = {};
      for (const w of raw.workflows.slice(0, 10)) {
        const id = String(w?.workflow_id ?? '');
        if (!id) continue;
        try {
          const full = await getWorkflowV3(c, b.token, id);
          if (Array.isArray(full?.steps)) raw.workflowSteps[id] = full.steps;
        } catch {
          /* một workflow đọc lỗi không làm hỏng cả lượt quét */
        }
      }
    } catch (e) {
      const m = mapWorkflowError(e, 'list');
      raw.workflowsError = m.kind === 'scope' ? `${m.error} ${m.fix?.[1] ?? ''}`.trim() : m.error;
    }
  }
  return raw;
}

// ── Chuẩn bị create/update (dùng chung cho preflight và exec) ──────────────────
interface Prepared {
  ok: true;
  base: ResolvedBase;
  body: { title: string; steps: J[] };
  warnings: string[];
  notes: string[];
  existing?: J;
  fieldNames: Record<string, string>;
}
type PrepareResult = Prepared | (Record<string, unknown> & { ok: false });

const PREP_TTL_MS = 60_000;
const prepCache = new Map<string, { at: number; r: PrepareResult }>();

function invalidPayload(errors: string[], warnings: string[], notes: string[]) {
  return {
    ok: false as const,
    kind: 'invalid',
    error: `Thiết kế workflow chưa hợp lệ (${errors.length} lỗi) — CHƯA gửi gì lên Lark. Sửa đúng các chỗ dưới đây rồi gọi lại.`,
    errors,
    ...(warnings.length ? { warnings } : {}),
    ...(notes.length ? { notes } : {}),
    hint: 'Tra cấu trúc bằng bitable_workflow_schema (topic = loại bước, "refs", "conditions"…); tên bảng/cột + field_id lấy từ bitable_scan_base.',
  };
}

/**
 * Preflight và exec cùng cần kết quả chuẩn bị (resolve Base + tải cột + kiểm). Chỉ nhớ kết quả
 * HỢP LỆ, và exec lấy ra là xoá (`consume`) — nhớ cả kết quả hỏng thì "tôi tắt workflow rồi, thử
 * lại đi" sẽ nhận lại đúng lời từ chối cũ trong một phút.
 */
async function prepare(i: J, c: LarkClient, mode: 'create' | 'update', consume = false): Promise<PrepareResult> {
  const key = `${mode}:${JSON.stringify(i ?? {})}`;
  const hit = prepCache.get(key);
  if (hit && Date.now() - hit.at < PREP_TTL_MS) {
    if (consume) prepCache.delete(key);
    return hit.r;
  }
  const r = await prepareUncached(i, c, mode);
  if (r.ok && !consume) {
    prepCache.set(key, { at: Date.now(), r });
    if (prepCache.size > 30) prepCache.delete(prepCache.keys().next().value as string);
  }
  return r;
}

async function prepareUncached(i: J, c: LarkClient, mode: 'create' | 'update'): Promise<PrepareResult> {
  const op: WorkflowOp = mode;
  let base: ResolvedBase;
  try {
    base = await resolveBaseInput(c, i);
  } catch (e) {
    return { ok: false, kind: 'base', error: (e as Error)?.message ?? String(e) };
  }
  const { body, notes } = normalizeWorkflowInput(i);

  let existing: J;
  if (mode === 'update') {
    const id = String(i?.workflow_id ?? '').trim();
    if (!id) return { ok: false, kind: 'invalid', error: 'Thiếu `workflow_id` (dạng "wkf…", lấy bằng bitable_workflow_list).' };
    if (!/^wkf/.test(id)) return { ok: false, kind: 'invalid', error: `workflow_id "${id}" không đúng — phải bắt đầu bằng "wkf" (đừng truyền table_id "tbl…").` };
    try {
      existing = await getWorkflowV3(c, base.token, id);
    } catch (e) {
      return mapWorkflowError(e, 'get') as unknown as PrepareResult;
    }
    // Sửa một workflow ĐANG CHẠY là đổi hành vi thật của Base ngay lập tức — để người dùng tắt trước.
    if (isEnabled(existing?.status))
      return {
        ok: false,
        kind: 'enabled',
        error: `Workflow «${existing?.title ?? id}» đang BẬT — Larkwave không sửa workflow đang chạy. Nhờ người dùng TẮT nó trong Lark trước (Base → Tự động hoá → tắt công tắc), rồi gọi lại.`,
      };
    if (body.title === undefined) body.title = String(existing?.title ?? '');
  }

  // Lượt 1 không có hồ sơ: lấy danh sách bảng được nhắc tới. Lượt 2: kiểm đủ với cột thật.
  const pass1 = validateWorkflowBody(body, { mode });
  let profile: ValidationProfile | undefined;
  try {
    profile = await loadValidationProfile(c, base.token, pass1.tables);
  } catch (e) {
    const m = mapWorkflowError(e, op);
    if (m.kind === 'permission' || m.kind === 'not_found' || m.kind === 'auth') return m as unknown as PrepareResult;
    notes.push('Không tải được cột của Base để đối chiếu — chỉ kiểm cấu trúc.');
  }
  const res = profile ? validateWorkflowBody(body, { mode, profile }) : pass1;
  const warnings = res.warnings.map((w) => `${w.path}${w.step ? ` [${w.step}]` : ''}: ${w.message}`);
  if (!res.ok) return invalidPayload(formatIssues(res), warnings, notes) as unknown as PrepareResult;

  const fieldNames: Record<string, string> = {};
  for (const t of profile?.tables ?? []) for (const f of t.fields ?? []) fieldNames[f.field_id] = f.name;
  return { ok: true, base, body: body as { title: string; steps: J[] }, warnings, notes, existing, fieldNames };
}

/** Sau khi ghi: đọc lại để chắc Lark đã lưu đúng, và giữ nó TẮT. */
interface VerifyResult {
  verified: boolean;
  status?: string;
  steps_saved?: number;
  verify_warning?: string;
  verify_note?: string;
  note_disabled?: string;
}
async function verifyAfterWrite(c: LarkClient, token: string, id: string, expectSteps: number): Promise<VerifyResult> {
  try {
    const wf = await getWorkflowV3(c, token, id);
    let status = wf?.status;
    let disabledNow = false;
    if (isEnabled(status)) {
      // Không bao giờ nên xảy ra (tạo mới luôn TẮT, sửa thì đã chặn workflow đang bật) — nếu có, tắt lại.
      try {
        await c.request('PATCH', `${v3(token)}/workflows/${enc(id)}/disable`);
        status = 'disabled';
        disabledNow = true;
      } catch {
        /* thiếu scope update — báo cho người dùng ở dưới */
      }
    }
    const steps = Array.isArray(wf?.steps) ? wf.steps.length : undefined;
    return {
      verified: true,
      status: String(status ?? ''),
      steps_saved: steps,
      ...(steps !== undefined && steps !== expectSteps ? { verify_warning: `Lark lưu ${steps} bước, thiết kế gửi ${expectSteps} bước — mở Lark kiểm lại.` } : {}),
      ...(disabledNow ? { note_disabled: 'Lark trả về trạng thái BẬT — Larkwave đã tắt lại.' } : {}),
      ...(isEnabled(status) ? { verify_warning: 'Workflow đang BẬT và Larkwave không tắt được — nhờ người dùng kiểm tra ngay trong Lark.' } : {}),
    };
  } catch (e) {
    const m = mapWorkflowError(e, 'get');
    return { verified: false, verify_note: `Đã ghi nhưng chưa đọc lại được để xác minh: ${m.error}${m.kind === 'scope' ? ' (thêm scope base:workflow:read)' : ''}` };
  }
}

const reviewText = (title: string) =>
  `Mở Base → "Tự động hoá / Workflow" → «${title}» → kiểm tra từng bước → TỰ BẬT khi thấy đúng. Larkwave không bật workflow.`;

// ── Tools ──────────────────────────────────────────────────────────────────────
export const workflowV3Tools: LarkToolDef[] = [
  {
    name: 'bitable_scan_base',
    description:
      'QUÉT một Base để THIẾT KẾ (automation/workflow, bổ sung bảng…). GỌI ĐẦU TIÊN mỗi khi người dùng muốn tạo/thiết kế tự động hoá — kể cả khi họ chỉ tả "base có bảng X, Y…". ' +
      'Trả về hồ sơ gọn: mọi bảng (table_id, tên, số bản ghi) → mỗi cột MỘT dòng "field_id · tên · kiểu[: lựa chọn…] [→ bảng liên kết]" → view → ≤3 bản ghi mẫu → các workflow đang có (tên, trạng thái, tóm tắt bước). ' +
      'Nhận link Base, link Wiki hoặc app_token. field_id ở đây là thứ cần cho ref "$.<bước>.<field_id>" trong steps.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...baseInputProps,
        sample_records: { type: 'integer', description: 'Số bản ghi mẫu mỗi bảng (0–3, mặc định 3).' },
        include_workflows: { type: 'boolean', description: 'Kèm danh sách workflow có sẵn (mặc định true).' },
        max_tables: { type: 'integer', description: 'Quét chi tiết tối đa bao nhiêu bảng (mặc định 40, tối đa 100); bảng còn lại chỉ có tên.' },
      },
      required: [],
    },
    gated: false,
    exec: async (i, c) => {
      const b = await resolveBaseInput(c, i);
      const samples = i.sample_records === undefined ? 3 : Math.max(0, Math.min(3, Math.trunc(Number(i.sample_records)) || 0));
      const raw = await scanBase(c, b, {
        samples,
        workflows: i.include_workflows !== false,
        maxTables: Math.max(1, Math.min(100, Math.trunc(Number(i.max_tables ?? 40)) || 40)),
      });
      return {
        ...compactBaseProfile(raw, { describe: (s) => workflowDesignText(s) }),
        next: 'Thiết kế workflow: bitable_workflow_schema(topic) để tra cấu trúc bước → bitable_workflow_validate → trình bày thiết kế → bitable_workflow_create.',
      };
    },
  },
  {
    name: 'bitable_workflow_schema',
    description:
      'TRA tài liệu CHÍNH THỨC về cấu trúc `steps` của workflow Lark Base (SSOT của larksuite/cli). Gọi TRƯỚC khi dựng steps cho loại bước mình chưa chắc — đừng đoán type/data/next/children. ' +
      'topic: một loại bước (vd "AddRecordTrigger", "SetRecordAction", "LarkMessageAction", "IfElseBranch", "Loop" — trả cả cấu hình data LẪN đầu ra ref được) | "overview" (khung bước, children/links, danh sách loại) | "triggers" | "actions" | "branches" | "loop" | "values" (ValueInfo) | "refs" (mọi đầu ra tham chiếu được) | "conditions" (điều kiện/lọc) | "errors" (lỗi hay gặp) | "examples" | "example1"…"example7" (ví dụ đầy đủ). Tài liệu gốc viết tiếng Trung.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { topic: { type: 'string', enum: SCHEMA_TOPICS, description: 'Chủ đề cần tra' } },
      required: ['topic'],
    },
    gated: false,
    exec: async (i) => {
      const s = schemaSection(String(i.topic ?? ''));
      if (!s) return { error: `Không có chủ đề "${i.topic}".`, topics: SCHEMA_TOPICS };
      return s;
    },
  },
  {
    name: 'bitable_workflow_list',
    description: 'Liệt kê workflow/automation của một Base qua Open API chính thức (v3): workflow_id (wkf…), tên, trạng thái. Cần scope base:workflow:read.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { ...baseInputProps, status: { type: 'string', enum: ['enabled', 'disabled'], description: 'Lọc theo trạng thái (bỏ trống = tất cả)' } },
      required: [],
    },
    gated: false,
    exec: async (i, c) => {
      const b = await resolveBaseInput(c, i);
      try {
        const items = await listWorkflowsV3(c, b.token, i.status ? String(i.status) : undefined);
        return {
          count: items.length,
          items: items.map((w) => ({ workflow_id: w?.workflow_id, title: w?.title, status: w?.status, status_text: statusVi(w?.status) })),
          base_url: baseUrl(b.token, b.origin),
        };
      } catch (e) {
        return mapWorkflowError(e, 'list');
      }
    },
  },
  {
    name: 'bitable_workflow_get',
    description:
      'Đọc ĐẦY ĐỦ một workflow (v3): tên, trạng thái, `steps` theo schema chính thức + `design_text` (cây tiếng Việt). Gọi trước khi sửa (bitable_workflow_update thay TOÀN BỘ steps) hoặc khi người dùng hỏi một workflow làm gì. Cần scope base:workflow:read.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { ...baseInputProps, workflow_id: str('workflow_id (bắt đầu bằng "wkf")') },
      required: ['workflow_id'],
    },
    gated: false,
    exec: async (i, c) => {
      const b = await resolveBaseInput(c, i);
      const id = String(i.workflow_id ?? '').trim();
      if (!/^wkf/.test(id)) return { ok: false, kind: 'invalid', error: `workflow_id "${id}" không đúng — phải bắt đầu bằng "wkf" (lấy bằng bitable_workflow_list).` };
      try {
        const wf = await getWorkflowV3(c, b.token, id);
        const steps = Array.isArray(wf?.steps) ? wf.steps : [];
        return {
          workflow_id: wf?.workflow_id ?? id,
          title: wf?.title,
          status: wf?.status,
          status_text: statusVi(wf?.status),
          steps,
          design_text: workflowDesignText(steps),
          base_url: baseUrl(b.token, b.origin),
        };
      } catch (e) {
        return mapWorkflowError(e, 'get');
      }
    },
  },
  {
    name: 'bitable_workflow_validate',
    description:
      'KIỂM một thiết kế workflow (title + steps) với Base thật — KHÔNG ghi gì. Bắt: id trùng, next/links trỏ sai, loại bước sai, thiếu cấu hình bắt buộc, bảng/cột không có (kèm gợi ý tên gần đúng), ref dùng tên thay vì field_id, ref tới bước sau, cột lựa chọn gán chữ trơn… ' +
      'Gọi sau khi dựng steps và lặp lại tới khi valid=true, rồi mới bitable_workflow_create/update. Trả `design_text` để trình bày cho người dùng.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...baseInputProps,
        title: str('Tên workflow'),
        steps: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Mảng bước theo schema chính thức (bitable_workflow_schema)' },
      },
      required: ['steps'],
    },
    gated: false,
    exec: async (i, c) => {
      const b = await resolveBaseInput(c, i);
      const { body, notes } = normalizeWorkflowInput(i);
      const pass1 = validateWorkflowBody(body, { mode: 'create' });
      let profile: ValidationProfile | undefined;
      try {
        profile = await loadValidationProfile(c, b.token, pass1.tables);
      } catch {
        notes.push('Không tải được cột của Base — chỉ kiểm cấu trúc.');
      }
      const r = profile ? validateWorkflowBody(body, { mode: 'create', profile }) : pass1;
      const fieldNames: Record<string, string> = {};
      for (const t of profile?.tables ?? []) for (const f of t.fields ?? []) fieldNames[f.field_id] = f.name;
      // Cố ý KHÔNG trả `ok:false`: đây là kết quả một phép kiểm, không phải công cụ hỏng.
      return {
        valid: r.ok,
        errors: formatIssues(r),
        warnings: r.warnings.map((w) => `${w.path}${w.step ? ` [${w.step}]` : ''}: ${w.message}`),
        ...(notes.length ? { notes } : {}),
        ...(Array.isArray(body.steps) ? { design_text: workflowDesignText(body.steps, { fieldNames }) } : {}),
      };
    },
  },
  {
    name: 'bitable_workflow_create',
    description:
      'TẠO workflow/automation MỚI trong Base qua Open API CHÍNH THỨC (v3). GHI — người dùng sẽ thấy hộp xác nhận vẽ sẵn thiết kế. Luôn tạo ở trạng thái TẮT; KHÔNG có cách bật từ đây (người dùng tự bật trong Lark). ' +
      'Trước khi gọi: bitable_scan_base → dựng steps theo bitable_workflow_schema → bitable_workflow_validate (valid=true) → trình bày thiết kế bằng tiếng Việt. Tool tự kiểm lại lần nữa (không hợp lệ thì không hỏi, không gửi), tự thêm client_token, rồi đọc lại để xác minh. ' +
      'steps: table_name/field_name theo TÊN; ref "$.<id bước trước>.<field_id>"; người = open_id ou_…; nhóm = chat_id oc_…; cột lựa chọn dùng value_type "option". Cần scope base:workflow:create.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...baseInputProps,
        title: str('Tên workflow (ngắn, nói rõ việc nó làm)'),
        steps: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Mảng bước theo schema chính thức; bước đầu là trigger' },
      },
      required: ['title', 'steps'],
    },
    gated: true,
    preflight: async (i, c) => {
      const p = await prepare(i, c, 'create');
      return p.ok ? null : (p as Record<string, unknown>);
    },
    exec: async (i, c) => {
      const p = await prepare(i, c, 'create', true);
      if (!p.ok) return p;
      const body = { client_token: randomUUID(), title: p.body.title, steps: p.body.steps };
      let created: J;
      try {
        created = await c.request<J>('POST', `${v3(p.base.token)}/workflows`, { data: body });
      } catch (e) {
        return mapWorkflowError(e, 'create');
      }
      const id = String(created?.workflow_id ?? created?.workflow?.workflow_id ?? '');
      if (!id) return { ok: false, kind: 'unknown', error: 'Lark báo tạo thành công nhưng không trả workflow_id — mở Lark kiểm tra danh sách workflow.', lark_response: created };
      const v = await verifyAfterWrite(c, p.base.token, id, p.body.steps.length);
      return {
        ok: true,
        workflow_id: id,
        title: p.body.title,
        ...v,
        status_text: isEnabled(v.status) ? 'ĐANG BẬT (bất thường — kiểm tra ngay)' : 'đang TẮT — chờ người dùng xem lại và tự bật',
        base_url: baseUrl(p.base.token, p.base.origin),
        review: reviewText(p.body.title),
        design_text: workflowDesignText(p.body.steps, { fieldNames: p.fieldNames }),
        ...(p.warnings.length ? { warnings: p.warnings } : {}),
        ...(p.notes.length ? { notes: p.notes } : {}),
      };
    },
  },
  {
    name: 'bitable_workflow_update',
    description:
      'SỬA một workflow có sẵn (v3) — THAY TOÀN BỘ title + steps (bước nào không gửi sẽ BỊ XOÁ). GHI — hỏi xác nhận. Chỉ sửa workflow đang TẮT (đang bật thì tool từ chối: nhờ người dùng tắt trước). Không đổi trạng thái bật/tắt. ' +
      'Cách làm: bitable_workflow_get → sửa trên `steps` trả về (giữ nguyên những bước không đổi) → bitable_workflow_validate → gọi tool này. Cần scope base:workflow:update.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...baseInputProps,
        workflow_id: str('workflow_id cần sửa (wkf…)'),
        title: str('Tên mới (bỏ trống = giữ tên cũ)'),
        steps: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'TOÀN BỘ mảng bước mới' },
      },
      required: ['workflow_id', 'steps'],
    },
    gated: true,
    preflight: async (i, c) => {
      const p = await prepare(i, c, 'update');
      return p.ok ? null : (p as Record<string, unknown>);
    },
    exec: async (i, c) => {
      const p = await prepare(i, c, 'update', true);
      if (!p.ok) return p;
      const id = String(i.workflow_id).trim();
      try {
        await c.request('PUT', `${v3(p.base.token)}/workflows/${enc(id)}`, { data: { title: p.body.title, steps: p.body.steps } });
      } catch (e) {
        return mapWorkflowError(e, 'update');
      }
      const v = await verifyAfterWrite(c, p.base.token, id, p.body.steps.length);
      return {
        ok: true,
        workflow_id: id,
        title: p.body.title,
        ...v,
        status_text: isEnabled(v.status) ? 'ĐANG BẬT (bất thường — kiểm tra ngay)' : 'đang TẮT — chờ người dùng xem lại và tự bật',
        steps_before: Array.isArray(p.existing?.steps) ? p.existing.steps.length : undefined,
        base_url: baseUrl(p.base.token, p.base.origin),
        review: reviewText(p.body.title),
        design_text: workflowDesignText(p.body.steps, { fieldNames: p.fieldNames }),
        ...(p.warnings.length ? { warnings: p.warnings } : {}),
        ...(p.notes.length ? { notes: p.notes } : {}),
      };
    },
  },
];
