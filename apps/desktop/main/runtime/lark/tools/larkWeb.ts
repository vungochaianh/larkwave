import { workflowDesignText } from '@larkwave/core';
import { type LarkToolDef, str } from './types';
import { getLarkWebSession } from '../larkWebSession';
import { baseTokenFromUrl, type WebAutomation, type WebTable } from '../larkWebApi';
import { formatIssues, normalizeWorkflowInput, validateWorkflowBody } from '../workflowV3';
import { internalTreeText, profileFromWebTables, v3ToInternal, verifyReadBack, WEB_SUPPORTED_TYPES, WEB_UI_ONLY_TYPES } from '../webAutomation';
import { FIELD_KINDS, planFields, structureScript, verifyStructure, type FieldSpec } from '../baseStructure';
import { clientVarsPath, decodeLarkGz, parseTableSchema } from '../larkWebApi';
import { translateWebWorkflows } from './workflows';
import { toWorkflowBlockDraft, verifyWorkflowBlock } from '../workflowBlock';

/**
 * Công cụ "Tạo workflow" chạy bằng PHIÊN LARK WEB đang đăng nhập — KHÔNG cần App ID/App Secret.
 *
 *   lark_web_list_bases  → mọi Base người dùng thấy (Drive + Wiki, + ô tìm kiếm của Drive)
 *   lark_web_scan_base   → bảng/cột/kiểu/lựa chọn/view/bản ghi mẫu + automation & workflow đã có
 *   lark_web_read_automations → cây logic đầy đủ của automation/quy trình đang có (chỉ đọc)
 *   lark_web_create_automation (GHI, hỏi xác nhận) → thiết kế `steps` chính thức (cùng bộ kiểm
 *       bitable_workflow_validate) → bản nháp NỘI BỘ → POST automation/create status 0 → đọc lại.
 *
 * Loại bước chưa có khuôn nội bộ đã đo → trả `kind:"unsupported"` và agent dựng trong trình soạn của
 * chính Lark bằng lark_ui_* (khung Chromium hiện cạnh hội thoại). Không có công cụ bật/xoá.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type J = any;

/** Cache quét gần nhất theo token — create kiểm lại theo đúng hồ sơ người dùng vừa xem. */
const scanCache = new Map<string, { at: number; tables: WebTable[]; name: string; timezone?: string }>();
const SCAN_TTL = 10 * 60_000;

function tokenOf(i: J): string {
  const raw = String(i.app_token || i.base_token || i.url || '').trim();
  if (!raw) throw new Error('Thiếu Base: truyền `app_token` (token Base đã chọn ở đầu hội thoại) hoặc link Base.');
  if (/^https?:/i.test(raw)) {
    const r = baseTokenFromUrl(raw);
    if (r.token) return r.token;
    throw new Error('Link Wiki: hãy dùng token Base trong danh sách lark_web_list_bases (trường token), không phải token nút wiki.');
  }
  return raw;
}

function tableLine(t: WebTable): J {
  return {
    table_id: t.id,
    name: t.name,
    ...(t.recordCount != null ? { records: t.recordCount } : {}),
    fields: t.fields.map(
      (f) =>
        `${f.id} · ${f.name} · ${f.typeName}${f.isPrimary ? ' (cột chính)' : ''}${f.options?.length ? `: ${f.options.slice(0, 12).map((o) => o.name).join(' | ')}${f.options.length > 12 ? ' …' : ''}` : ''}${f.linkTable ? ` → ${f.linkTable}` : ''}`,
    ),
    views: t.views.map((v) => `${v.id} · ${v.name}`),
    ...(t.samples.length ? { samples: t.samples } : {}),
  };
}

function autoLine(a: WebAutomation): string {
  return `${a.kind === 'workflow' ? 'Quy trình' : 'Automation'} «${a.title}» [${a.enabled ? 'đang BẬT' : 'tắt'}] #${a.workflowId}: ${a.steps.map((s) => s.label + (s.table ? ` (${s.table})` : '')).join(' → ') || '(trống)'}`;
}

async function tablesFor(token: string): Promise<{ tables: WebTable[]; name: string; timezone?: string }> {
  const c = scanCache.get(token);
  if (c && Date.now() - c.at < SCAN_TTL) return c;
  const r = await getLarkWebSession().scanWebBase(token, { samples: 0 });
  const v = { at: Date.now(), tables: r.tables, name: r.meta.name, timezone: r.meta.timezone };
  scanCache.set(token, v);
  return v;
}

/** Kiểm thiết kế (cấu trúc + đối chiếu Base thật) rồi chuyển sang bản nháp nội bộ. */
async function prepare(i: J): Promise<J> {
  const token = tokenOf(i);
  const { body, notes } = normalizeWorkflowInput(i);
  if (!body.title || !String(body.title).trim()) return { ok: false, kind: 'invalid', error: 'Thiếu `title` (tên automation).' };
  const { tables, name, timezone } = await tablesFor(token);
  const r = validateWorkflowBody(body, { mode: 'create', profile: profileFromWebTables(tables) });
  // Người nhận "tôi" ở phiên web không phải open_id ou_… — bỏ đúng lỗi đó, phần còn lại giữ nguyên.
  const errors = r.errors.filter((e) => !/receiver|open_?id|ou_/i.test(`${e.path} ${e.message}`));
  if (errors.length) return { ok: false, kind: 'invalid', errors: formatIssues({ errors, warnings: [] }), hint: 'Sửa thiết kế theo các lỗi trên rồi gọi lại.' };
  const me = await getLarkWebSession().webMe();
  const conv = v3ToInternal({ title: String(body.title), steps: body.steps as J[] }, tables, me, { timezone });
  if (!conv.ok) {
    return conv.unsupported?.length
      ? {
          ok: false,
          kind: 'unsupported',
          error: conv.errors.join(' '),
          supported: WEB_SUPPORTED_TYPES,
          ui_only: conv.unsupported,
          next: `Bỏ bước ${conv.unsupported.join(', ')} khỏi thiết kế để tạo thẳng phần còn lại, rồi bổ sung bước đó trong trình soạn của Lark: lark_ui_open({app_token:"${token}"}) → mở "Tự động hoá" → thêm bước bằng lark_ui_snapshot/act/wait; luôn để TẮT; lark_ui_saved để xác nhận Lark đã lưu.`,
        }
      : { ok: false, kind: 'invalid', errors: conv.errors };
  }
  return { ok: true, token, baseName: name, body, notes, conv, me, warnings: r.warnings.map((w) => w.message) };
}

/** fld… → tên cột (mọi bảng trong lần quét gần nhất) — cho hộp xác nhận và design_text đọc được. */
async function fieldNamesFor(token: string): Promise<Record<string, string>> {
  try {
    const { tables } = await tablesFor(token);
    const out: Record<string, string> = {};
    for (const t of tables) for (const f of t.fields) out[f.id] = f.name;
    return out;
  } catch {
    return {};
  }
}

/** Tạo MỘT automation đã qua prepare(): gửi create (status 0) → đọc lại → kết quả gọn. */
async function createPrepared(p: J, fieldNames: Record<string, string>): Promise<J> {
  const web = getLarkWebSession();
  const created = await web.createWebAutomation(p.token, { draft: JSON.stringify(p.conv.draft), extra: JSON.stringify(p.conv.extra), triggerName: p.conv.triggerName || '' });
  let saved: J = null;
  let verifyNote = '';
  try {
    saved = await web.readWebAutomation(p.token, created.workflowID);
  } catch (e) {
    verifyNote = String((e as Error)?.message || e);
  }
  const v = verifyReadBack(saved, p.conv.draft);
  return {
    ok: v.ok,
    workflow_id: created.workflowID,
    title: p.body.title,
    verified: v.ok,
    status_text: v.enabled ? 'ĐANG BẬT (bất thường — kiểm tra ngay)' : 'đang TẮT — chờ người dùng xem lại và tự bật',
    ...(v.problems.length ? { problems: v.problems } : {}),
    ...(verifyNote ? { verify_note: verifyNote } : {}),
    design_text: workflowDesignText(p.body.steps, { fieldNames }),
    ...(p.warnings.length ? { warnings: p.warnings } : {}),
  };
}

/**
 * Đọc lại cho tới khi khớp: clientvars của máy chủ trễ vài giây sau khi trang lưu (đo 09/10/2026:
 * đọc ngay sau addField chưa thấy cột, 20 giây sau thì có). Thử lại tối đa ~15 giây rồi mới kết luận.
 */
async function readBackUntil<T>(read: () => Promise<WebTable | null>, check: (t: WebTable | null) => { ok: boolean } & T): Promise<{ table: WebTable | null; v: { ok: boolean } & T }> {
  let table = await read();
  let v = check(table);
  for (let k = 0; k < 10 && !v.ok; k++) {
    await new Promise((r) => setTimeout(r, 1500));
    table = await read();
    v = check(table);
  }
  return { table, v };
}

/** Bảng của Base đọc lại TƯƠI (bỏ cache) — sau khi dựng cấu trúc. */
async function freshTable(token: string, tableId: string, name?: string): Promise<WebTable | null> {
  try {
    const j = await getLarkWebSession().webJson(clientVarsPath(token, tableId, 0));
    if (j?.code !== 0) return null;
    return parseTableSchema(decodeLarkGz(j.data?.table), name, 0);
  } catch {
    return null;
  }
}

/** Tạo lần lượt các KHỐI Workflow (đã qua prepare) → đọc lại từng cái → mở canvas khối đầu. */
export async function createWorkflowBlocks(i: J): Promise<J> {
  const token = tokenOf(i);
  const list: J[] = (Array.isArray(i.workflows) ? i.workflows : []).slice(0, 8);
  const fieldNames = await fieldNamesFor(token);
  const web = getLarkWebSession();
  const items: J[] = [];
  for (const w of list) {
    try {
      const p = await prepare({ app_token: token, title: w?.title, steps: w?.steps });
      if (!p.ok) {
        items.push({ title: w?.title, ...p, ...(p.kind === 'unsupported' ? { next: String(p.next || '').replace('mở "Tự động hoá"', 'mở khối Workflow (canvas)') } : {}) });
        continue;
      }
      const { tables } = await tablesFor(token);
      const blk = toWorkflowBlockDraft(p.conv.draft, p.conv.extra, tables);
      const name = String(p.body.title).trim().slice(0, 100);
      const created = await web.createWorkflowBlock(token, { name, draft: blk.draft, extra: blk.extra, triggerName: p.conv.triggerName || '' });
      const back = await web.readWorkflowBlockBack(token, created.workflowID).catch(() => ({ meta: null, detail: null }));
      const v = verifyWorkflowBlock(back.meta, back.detail, { workflowID: created.workflowID, steps: blk.draft.steps, name });
      // Soi bằng CHÍNH bộ kiểm của trình soạn Lark trên canvas vừa mở (cấu hình từng bước + schema lúc bật).
      const check = await web.selfCheckWorkflowBlock(token, created.blockId, created.workflowID).catch(() => null);
      const checkProblems: string[] =
        check && check.ok === false && !check.error
          ? (check.bad || [])
              .map((b: J) => `Lark báo bước «${b.title || b.type}» chưa hợp lệ: ${b.getConfigErrorInfoList || b.getTaskConfigErrorInfoList || b.getConfigNotReadyErrorInfoList || b.getTaskConfigNotReadyErrorInfoList || 'cấu hình chưa đủ'}`)
              .concat(check.schemaError ? [`Lark không dựng được schema lúc bật: ${check.schemaError}`] : [])
          : [];
      const savedDraft = back.detail?.draft ?? blk.draft;
      items.push({
        ok: v.ok && !checkProblems.length,
        kind: 'workflow',
        workflow_id: created.workflowID,
        block_id: created.blockId,
        title: name,
        verified: v.ok,
        status_text: v.enabled ? 'ĐANG BẬT (bất thường — kiểm tra ngay)' : 'đang TẮT — chờ người dùng xem lại và tự bật',
        ...(v.problems.length || checkProblems.length ? { problems: [...v.problems, ...checkProblems] } : {}),
        lark_check: check ? (check.error ? `không soi được (${check.error})` : check.ok ? `đạt — trình soạn Lark thấy ${check.steps} bước hợp lệ và dựng được schema lúc bật` : 'có lỗi (xem problems)') : 'không soi được',
        saved_tree: internalTreeText(savedDraft),
        design_text: workflowDesignText(p.body.steps, { fieldNames }),
        ...(p.warnings.length ? { warnings: p.warnings } : {}),
      });
    } catch (e) {
      items.push({ title: w?.title, ok: false, kind: 'error', error: String((e as Error)?.message || e) });
    }
  }
  const first = items.find((x) => x.ok && x.block_id) || items.find((x) => x.block_id);
  if (first) await web.showWorkflowBlock(token, first.block_id);
  else void web.showBase(token);
  const okN = items.filter((x) => x.ok).length;
  return {
    // Lỗi MỘT PHẦN vẫn là ok:true ở cấp lượt gọi — các khối đã tạo là thật; mục lỗi nằm trong items.
    ok: okN > 0,
    created: okN,
    failed: items.length - okN,
    items,
    ...(okN < items.length ? { next: 'Sửa các mục ok:false theo lỗi của chúng rồi gọi lại CHỈ với các mục đó (mục ok đã được tạo — đừng tạo trùng).' } : {}),
    review: 'Tất cả đang TẮT. Khung Lark đang mở canvas của workflow vừa tạo — người dùng xem lại từng khối ở thanh bên Base và tự bật.',
  };
}

const FIELD_SPEC_SCHEMA = {
  type: 'array',
  description: `Các cột. Mỗi cột {name, type, options?, multiple?, with_time?}. type: ${Object.keys(FIELD_KINDS).join(' | ')}. single_select/multi_select cần options. person: multiple=true cho nhiều người. date: with_time=true để có giờ.`,
  items: {
    type: 'object',
    additionalProperties: false,
    properties: {
      name: { type: 'string' },
      type: { type: 'string' },
      options: { type: 'array', items: { type: 'string' } },
      multiple: { type: 'boolean' },
      with_time: { type: 'boolean' },
    },
    required: ['name', 'type'],
  },
};

function specsOf(v: unknown): FieldSpec[] {
  return (Array.isArray(v) ? v : []).filter((x) => x && typeof x === 'object').map((x: J) => ({ name: String(x.name ?? ''), type: String(x.type ?? 'text'), options: Array.isArray(x.options) ? x.options.map(String) : undefined, multiple: !!x.multiple, with_time: !!x.with_time }));
}

export const larkWebTools: LarkToolDef[] = [
  {
    name: 'lark_web_list_bases',
    gated: false,
    description:
      'LIỆT KÊ mọi Base người dùng thấy được (Drive + Base trong Wiki) qua phiên Lark web đang đăng nhập — KHÔNG cần App ID. Truyền `query` để tìm thêm cả Base lâu chưa mở. Trả [{token, name, url, is_wiki}] — `token` là app_token dùng cho các tool lark_web_*.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { query: str('Từ khoá tên Base (tuỳ chọn)'), limit: { type: 'integer', description: 'Tối đa bao nhiêu kết quả (mặc định 60)' } },
      required: [],
    },
    exec: async (i) => {
      const all = await getLarkWebSession().listWebBases({ query: i.query ? String(i.query) : undefined });
      const lim = Math.max(1, Math.min(300, Number(i.limit) || 60));
      return { count: all.length, bases: all.slice(0, lim).map((b) => ({ token: b.token, name: b.name, url: b.url, is_wiki: b.isWiki || undefined })) };
    },
  },
  {
    name: 'lark_web_scan_base',
    gated: false,
    description:
      'QUÉT một Base (CHỈ ĐỌC) qua phiên Lark web: mọi bảng → mỗi cột "field_id · tên · kiểu[: lựa chọn…]" → view → bản ghi mẫu → automation/quy trình ĐANG CÓ (tên, bật/tắt, các bước). GỌI ĐẦU TIÊN trong chế độ Tạo workflow, trước khi thiết kế. field_id dùng cho ref "$.<bước>.<field_id>".',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        app_token: str('Token Base (đã chọn ở đầu hội thoại)'),
        url: str('Hoặc link …/base/<token>'),
        sample_records: { type: 'integer', description: 'Số bản ghi mẫu mỗi bảng (0–5, mặc định 3)' },
      },
      required: [],
    },
    exec: async (i) => {
      const token = tokenOf(i);
      const r = await getLarkWebSession().scanWebBase(token, { samples: i.sample_records === undefined ? 3 : Number(i.sample_records) });
      scanCache.set(token, { at: Date.now(), tables: r.tables, name: r.meta.name });
      return {
        base: { token, name: r.meta.name, timezone: r.meta.timezone },
        tables: r.tables.map(tableLine),
        automations: r.automations.map(autoLine),
        workflows: r.workflows.map(autoLine),
        ...(r.errors.length ? { errors: r.errors } : {}),
        next:
          'Thiếu bảng/cột → lark_web_add_table / lark_web_add_fields (không bấm giao diện). Thiết kế theo `steps` chính thức (bitable_workflow_schema để tra) → viết thiết kế ra chat bằng tiếng Việt → tạo ngay bằng lark_web_create_automations (một lần cho cả bộ). ' +
          `Tạo thẳng được: ${WEB_SUPPORTED_TYPES.join(', ')}; chỉ ${WEB_UI_ONLY_TYPES.join(', ')} phải dựng trong trình soạn Lark bằng lark_ui_*.`,
      };
    },
  },
  {
    name: 'lark_web_read_automations',
    gated: false,
    description:
      'ĐỌC CHI TIẾT (CHỈ ĐỌC) mọi Automation + Quy trình của một Base qua phiên Lark web — KHÔNG cần App ID. ' +
      'Khác lark_web_scan_base (chỉ tóm tắt tên bước): mỗi mục có `logic` là cây đã dịch sang tiếng Việt — trigger (bảng/cột/điều kiện) → nhánh Nếu/Nếu không → hành động, kể cả NGƯỜI NHẬN và nội dung tin nhắn; tên bảng/cột/lựa chọn để trong «…». ' +
      'Dùng khi cần giải thích, soát lỗi, hoặc sửa automation đang có. Truyền `workflow_id` để đọc một cái.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        app_token: str('Token Base (đã chọn ở đầu hội thoại)'),
        url: str('Hoặc link …/base/<token>'),
        workflow_id: str('Chỉ đọc một automation/quy trình (bỏ trống = tất cả)'),
      },
      required: [],
    },
    exec: async (i) => {
      const token = tokenOf(i);
      const { tables } = await tablesFor(token);
      const r = await getLarkWebSession().readWebAutomationsRaw(token);
      const want = i.workflow_id ? String(i.workflow_id) : '';
      const items = [
        ...r.automations.map((raw) => ({ raw, kind: 'Automation', fallbackTitle: '' })),
        ...r.blocks.map((b) => ({ raw: { ...b.raw, workflowID: b.raw?.workflowID || b.workflowId }, kind: 'Quy trình', fallbackTitle: b.name })),
      ].filter((x) => !want || String(x.raw?.workflowID || x.raw?.workflowId || '') === want);
      const translated = await translateWebWorkflows(items, tables, r.users);
      return {
        count: translated.length,
        workflows: translated.map((t, n) => ({ kind: items[n].kind, ...t })),
        ...(r.errors.length ? { errors: r.errors } : {}),
        ...(translated.length ? {} : { note: want ? `Không thấy automation ${want} trong Base này.` : 'Base này chưa có automation/quy trình nào.' }),
      };
    },
  },
  {
    name: 'lark_web_create_automation',
    gated: true,
    additive: true,
    description:
      'TẠO một Automation MỚI trong Base qua phiên Lark web (KHÔNG cần App ID) — luôn ở trạng thái TẮT, người dùng tự bật trong Lark. Có từ 2 automation trở lên → dùng lark_web_create_automations (một lần gọi). ' +
      'Gọi SAU khi: lark_web_scan_base → dựng `title` + `steps` theo schema chính thức → viết thiết kế ra chat. ' +
      `Hỗ trợ: ${WEB_SUPPORTED_TYPES.join(', ')} — cả rẽ nhánh (IfElseBranch/SwitchBranch qua children.links) và vòng lặp (Loop). Bảng/cột theo TÊN (table_name/field_name/watched_field_name); nội dung tin nhắn: [{value_type:"text",value:"…"},{value_type:"ref",value:"$.<id trigger>.<field_id>"}]; ` +
      'người nhận: "tôi" = {value_type:"user",value:{id:"me"}}; CỘT NGƯỜI của bản ghi (vd «Sales phụ trách») = {value_type:"ref",value:"$.<id trigger>.<field_id cột Người>"}; nút mở bản ghi: btn_list:[{text:"Xem bản ghi",btn_action:"openLink",link:[{value_type:"ref",value:"$.<id trigger>.recordLink"}]}]. Loại khác → kind "unsupported" kèm cách dựng bằng lark_ui_*. Tool tự kiểm, tạo, rồi ĐỌC LẠI để xác minh.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        app_token: str('Token Base (đã chọn ở đầu hội thoại)'),
        title: str('Tên automation (ngắn, nói rõ việc nó làm)'),
        steps: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Mảng bước theo schema chính thức; bước đầu là trigger' },
      },
      required: ['app_token', 'title', 'steps'],
    },
    preview: async (i) => ({ fieldNames: await fieldNamesFor(tokenOf(i)) }),
    preflight: async (i) => {
      try {
        const p = await prepare(i);
        return p.ok ? null : p;
      } catch (e) {
        return { ok: false, kind: 'error', error: String((e as Error)?.message || e) };
      }
    },
    exec: async (i) => {
      const p = await prepare(i);
      if (!p.ok) return p;
      const r = await createPrepared(p, await fieldNamesFor(p.token));
      // Cho người dùng thấy ngay trong khung Lark bên cạnh.
      void getLarkWebSession().showBase(p.token);
      return { ...r, base: p.baseName, review: `Trong khung Lark bên phải: mở "Tự động hoá" → «${p.body.title}» → kiểm từng bước → TỰ BẬT khi thấy đúng. Larkwave không bật automation.` };
    },
  },
  {
    name: 'lark_web_create_automations',
    gated: true,
    additive: true,
    description:
      'TẠO NHIỀU Automation MỚI một lần (cùng một Base) — dùng khi thiết kế có từ 2 automation trở lên: một lần gọi, người dùng (nếu đang ở chế độ hỏi trước) chỉ duyệt MỘT lần cho cả bộ. Mỗi mục {title, steps} theo đúng luật của lark_web_create_automation. ' +
      'Tạo LẦN LƯỢT, luôn TẮT, đọc lại từng cái; mục lỗi KHÔNG làm dừng các mục khác — kết quả trả từng mục (ok / lỗi + lý do). Sửa mục lỗi rồi gọi lại CHỈ với các mục đó (đừng tạo lại mục đã ok).',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        app_token: str('Token Base (đã chọn ở đầu hội thoại)'),
        workflows: {
          type: 'array',
          description: 'Các automation cần tạo (tối đa 12)',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: { title: { type: 'string' }, steps: { type: 'array', items: { type: 'object', additionalProperties: true } } },
            required: ['title', 'steps'],
          },
        },
      },
      required: ['app_token', 'workflows'],
    },
    preview: async (i) => ({ fieldNames: await fieldNamesFor(tokenOf(i)) }),
    preflight: async (i) => {
      try {
        const list: J[] = Array.isArray(i.workflows) ? i.workflows : [];
        if (!list.length) return { ok: false, kind: 'invalid', error: 'Thiếu `workflows` (mảng {title, steps}).' };
        if (list.length > 12) return { ok: false, kind: 'invalid', error: 'Tối đa 12 automation mỗi lần gọi — chia làm nhiều lần.' };
        // Chỉ chặn trước khi TẤT CẢ đều hỏng — có mục hợp lệ thì vẫn cho duyệt, mục hỏng báo trong kết quả.
        const preps = await Promise.all(list.map((w) => prepare({ app_token: i.app_token, url: i.url, title: w?.title, steps: w?.steps }).catch((e) => ({ ok: false, kind: 'error', error: String((e as Error)?.message || e) }))));
        if (preps.some((p: J) => p.ok)) return null;
        return { ok: false, kind: 'invalid', error: 'Không automation nào hợp lệ — sửa theo lỗi từng mục rồi gọi lại.', items: preps.map((p: J, k) => ({ title: list[k]?.title, ...p })) };
      } catch (e) {
        return { ok: false, kind: 'error', error: String((e as Error)?.message || e) };
      }
    },
    exec: async (i) => {
      const token = tokenOf(i);
      const list: J[] = (Array.isArray(i.workflows) ? i.workflows : []).slice(0, 12);
      const fieldNames = await fieldNamesFor(token);
      const items: J[] = [];
      for (const w of list) {
        try {
          const p = await prepare({ app_token: token, title: w?.title, steps: w?.steps });
          if (!p.ok) {
            items.push({ title: w?.title, ...p });
            continue;
          }
          items.push(await createPrepared(p, fieldNames));
        } catch (e) {
          items.push({ title: w?.title, ok: false, kind: 'error', error: String((e as Error)?.message || e) });
        }
      }
      void getLarkWebSession().showBase(token);
      const okN = items.filter((x) => x.ok).length;
      return {
        // Lỗi MỘT PHẦN vẫn là ok:true ở cấp lượt gọi — các mục đã tạo là thật; mục lỗi nằm trong items.
        ok: okN > 0,
        created: okN,
        failed: items.length - okN,
        items,
        ...(okN < items.length ? { next: 'Sửa các mục ok:false theo lỗi của chúng rồi gọi lại CHỈ với các mục đó (mục ok đã được tạo — đừng tạo trùng).' } : {}),
        review: 'Tất cả đang TẮT. Người dùng mở "Tự động hoá" trong khung Lark bên phải, xem lại từng cái và tự bật.',
      };
    },
  },
  {
    name: 'lark_web_create_workflows',
    gated: true,
    additive: true,
    description:
      'TẠO một hay nhiều KHỐI "Quy trình làm việc" (WORKFLOW — hiện ở thanh bên của Base cạnh các bảng, mở ra là CANVAS sơ đồ các bước) qua phiên Lark web, KHÔNG cần App ID. ' +
      'ĐÂY LÀ MẶC ĐỊNH khi người dùng nói "workflow"/"quy trình". Chỉ dùng lark_web_create_automation(s) khi họ nói rõ "tự động hoá"/"automation". ' +
      'Mỗi mục {title, steps} theo ĐÚNG luật thiết kế của lark_web_create_automation (cùng schema `steps` chính thức, cùng bộ kiểm). ' +
      `Tạo thẳng ĐỦ bộ bước: ${WEB_SUPPORTED_TYPES.join(', ')} — gồm rẽ nhánh IfElseBranch (children.links if_true/if_false), SwitchBranch (case label branch_1…/default), Loop (loop_start, data = $.<tìm bản ghi>.fieldRecords; trong thân lặp ref $.<loop>.item.<field_id>). ` +
      'Ref hợp lệ: $.<trigger bản ghi>.<field_id>|recordId|recordLink|recordCreatedTime…; $.<tìm>.fieldRecords|recordNum|firstfieldsRecord.<field_id>; $.<loop>.item.<field_id>; $.<http>.body.<khoá>|status_code; $.<AI tạo văn bản>. ' +
      'SetRecordAction cập nhật bản ghi trigger: ref_info:{step_id:"<id trigger>"}; giá trị cột chọn = {value_type:"option",value:{name:"…"}}. ' +
      `Chỉ ${WEB_UI_ONLY_TYPES.join(', ')} và nhóm chat (cần id nội bộ) mới phải dựng trong trình soạn Lark (lark_ui_*). ` +
      'Tạo LẦN LƯỢT, luôn TẮT; đọc lại từng khối (thanh bên + chi tiết, so CẤU TRÚC cây) rồi soi bằng chính bộ kiểm của trình soạn Lark (lark_check); trả saved_tree = cây Lark đã lưu. Mục lỗi không làm dừng mục khác. ' +
      'Xong thì khung Lark mở canvas của khối đầu tiên để người dùng xem; họ tự bật trong Lark.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        app_token: str('Token Base (đã chọn ở đầu hội thoại)'),
        workflows: {
          type: 'array',
          description: 'Các workflow cần tạo (1–8). title = tên khối ở thanh bên Base.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: { title: { type: 'string' }, steps: { type: 'array', items: { type: 'object', additionalProperties: true } } },
            required: ['title', 'steps'],
          },
        },
      },
      required: ['app_token', 'workflows'],
    },
    preview: async (i) => ({ fieldNames: await fieldNamesFor(tokenOf(i)) }),
    preflight: async (i) => {
      try {
        const list: J[] = Array.isArray(i.workflows) ? i.workflows : [];
        if (!list.length) return { ok: false, kind: 'invalid', error: 'Thiếu `workflows` (mảng {title, steps}).' };
        if (list.length > 8) return { ok: false, kind: 'invalid', error: 'Tối đa 8 workflow mỗi lần gọi — chia làm nhiều lần.' };
        const preps = await Promise.all(list.map((w) => prepare({ app_token: i.app_token, url: i.url, title: w?.title, steps: w?.steps }).catch((e) => ({ ok: false, kind: 'error', error: String((e as Error)?.message || e) }))));
        if (preps.some((p: J) => p.ok)) return null;
        return { ok: false, kind: preps.every((p: J) => p.kind === 'unsupported') ? 'unsupported' : 'invalid', error: 'Không workflow nào hợp lệ — sửa theo lỗi từng mục rồi gọi lại.', items: preps.map((p: J, k) => ({ title: list[k]?.title, ...p })) };
      } catch (e) {
        return { ok: false, kind: 'error', error: String((e as Error)?.message || e) };
      }
    },
    exec: async (i) => createWorkflowBlocks(i),
  },
  {
    name: 'lark_web_add_table',
    gated: true,
    additive: true,
    description:
      'TẠO một BẢNG MỚI trong Base (qua chính lớp lệnh của trang Lark — không bấm giao diện, nhanh và chắc), đặt tên, đổi tên cột chính, thêm các cột (Văn bản/Số/Chọn một/Chọn nhiều/Ngày/Hộp kiểm/Người/SĐT/URL/Tệp) kèm lựa chọn. ' +
      'Lark tự thêm 5 dòng trống khi tạo bảng — tool tự xoá đúng 5 dòng đó nếu chúng vẫn trống (không đụng dòng nào khác). Đọc lại để xác minh. Dùng THAY cho việc tự bấm trong lark_ui_*. Bảng trùng tên đã có → báo lỗi (không ghi đè).',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        app_token: str('Token Base'),
        name: str('Tên bảng mới'),
        primary_field_name: str('Tên cột chính (cột đầu tiên, kiểu Văn bản) — vd "Mã lô"'),
        fields: FIELD_SPEC_SCHEMA,
      },
      required: ['app_token', 'name'],
    },
    preflight: async (i) => {
      try {
        const token = tokenOf(i);
        const name = String(i.name ?? '').trim();
        if (!name) return { ok: false, kind: 'invalid', error: 'Thiếu `name` (tên bảng).' };
        const { tables } = await tablesFor(token);
        if (tables.some((t) => t.name.trim().toLowerCase() === name.toLowerCase())) return { ok: false, kind: 'exists', error: `Base đã có bảng «${name}» — dùng lark_web_add_fields để thêm cột vào bảng đó.` };
        const plan = planFields(null, specsOf(i.fields));
        return plan.errors.length ? { ok: false, kind: 'invalid', errors: plan.errors } : null;
      } catch (e) {
        return { ok: false, kind: 'error', error: String((e as Error)?.message || e) };
      }
    },
    exec: async (i) => {
      const token = tokenOf(i);
      const name = String(i.name ?? '').trim();
      const plan = planFields(null, specsOf(i.fields));
      if (plan.errors.length) return { ok: false, kind: 'invalid', errors: plan.errors };
      const primary = i.primary_field_name ? String(i.primary_field_name).trim() : '';
      const r = await getLarkWebSession().runBaseStructure(token, structureScript({ token, createTable: { name, primaryFieldName: primary || undefined, removePlaceholders: true }, fields: plan.add, addOptions: [] }));
      scanCache.delete(token);
      if (!r?.tableId) return { ok: false, error: r?.error || 'Không tạo được bảng.', ...(r?.hint ? { hint: r.hint } : {}), steps: r?.steps };
      const { table: t, v } = await readBackUntil(() => freshTable(token, r.tableId, name), (x) => {
        const b = verifyStructure(x, { fields: plan.add });
        if (x && primary && !x.fields.some((f) => f.isPrimary && f.name === primary)) b.problems.push(`Cột chính chưa đổi tên thành «${primary}» khi đọc lại.`);
        return { ok: !b.problems.length, problems: b.problems };
      });
      return {
        ok: !!r.ok && v.ok,
        table_id: r.tableId,
        name,
        fields: t ? t.fields.map((f) => `${f.id} · ${f.name} · ${f.typeName}${f.options?.length ? `: ${f.options.map((o) => o.name).join(' | ')}` : ''}`) : undefined,
        removed_placeholder_rows: r.removedPlaceholders ?? 0,
        ...(v.problems.length ? { problems: v.problems } : {}),
        ...(r.ok ? {} : { steps: r.steps }),
        next: 'Dùng field_id ở trên cho ref "$.<trigger>.<field_id>" khi thiết kế automation (không cần quét lại).',
      };
    },
  },
  {
    name: 'lark_web_add_fields',
    gated: true,
    additive: true,
    description:
      'THÊM CỘT vào một bảng ĐÃ CÓ và/hoặc THÊM LỰA CHỌN vào cột chọn đã có (qua lớp lệnh của trang Lark — không bấm giao diện). Chỉ CỘNG THÊM: cột trùng tên được BỎ QUA (không đổi kiểu, không ghi đè), lựa chọn đã có được bỏ qua. Đọc lại để xác minh.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        app_token: str('Token Base'),
        table_name: str('Tên bảng (hoặc table_id)'),
        fields: FIELD_SPEC_SCHEMA,
        add_options: {
          type: 'array',
          description: 'Thêm lựa chọn vào cột chọn đã có: [{field_name, options:[…]}]',
          items: { type: 'object', additionalProperties: false, properties: { field_name: { type: 'string' }, options: { type: 'array', items: { type: 'string' } } }, required: ['field_name', 'options'] },
        },
      },
      required: ['app_token', 'table_name'],
    },
    preflight: async (i) => {
      try {
        const token = tokenOf(i);
        const { tables } = await tablesFor(token);
        const t = tables.find((x) => x.id === i.table_name || x.name.trim().toLowerCase() === String(i.table_name ?? '').trim().toLowerCase());
        if (!t) return { ok: false, kind: 'invalid', error: `Không thấy bảng «${i.table_name}» trong Base.` };
        const plan = planFields(t, specsOf(i.fields), Array.isArray(i.add_options) ? i.add_options : []);
        if (plan.errors.length) return { ok: false, kind: 'invalid', errors: plan.errors };
        return null;
      } catch (e) {
        return { ok: false, kind: 'error', error: String((e as Error)?.message || e) };
      }
    },
    exec: async (i) => {
      const token = tokenOf(i);
      scanCache.delete(token);
      const { tables } = await tablesFor(token);
      const t = tables.find((x) => x.id === i.table_name || x.name.trim().toLowerCase() === String(i.table_name ?? '').trim().toLowerCase());
      if (!t) return { ok: false, error: `Không thấy bảng «${i.table_name}» trong Base.` };
      const plan = planFields(t, specsOf(i.fields), Array.isArray(i.add_options) ? i.add_options : []);
      if (plan.errors.length) return { ok: false, kind: 'invalid', errors: plan.errors };
      if (!plan.add.length && !plan.addOptions.length) return { ok: true, skipped: plan.skipped, note: 'Không có gì mới để thêm.' };
      const r = await getLarkWebSession().runBaseStructure(token, structureScript({ token, tableId: t.id, fields: plan.add, addOptions: plan.addOptions }));
      scanCache.delete(token);
      const { table: fresh, v } = await readBackUntil(
        () => freshTable(token, t.id, t.name),
        (x) => {
          const base = verifyStructure(x, { fields: plan.add });
          for (const a of plan.addOptions) {
            const f = x?.fields.find((y) => y.id === a.fieldId);
            for (const n of a.names) if (!f?.options?.some((o) => o.name === n)) base.problems.push(`Cột «${a.fieldName}» chưa có lựa chọn «${n}» khi đọc lại.`);
          }
          return { ok: !base.problems.length, problems: base.problems };
        },
      );
      const problems = v.problems;
      return {
        ok: !!r?.ok && !problems.length,
        table_id: t.id,
        added: r?.added ?? [],
        ...(plan.skipped.length ? { skipped_existing: plan.skipped } : {}),
        ...(plan.addOptions.length ? { options_added: plan.addOptions.map((a) => `${a.fieldName}: ${a.names.join(' | ')}`) } : {}),
        fields: fresh ? fresh.fields.map((f) => `${f.id} · ${f.name} · ${f.typeName}`) : undefined,
        ...(problems.length ? { problems } : {}),
        ...(r?.ok ? {} : { error: r?.error, hint: r?.hint, steps: r?.steps }),
      };
    },
  },
];
