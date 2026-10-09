import { workflowDesignText } from '@larkwave/core';
import { type LarkToolDef, str } from './types';
import { getLarkWebSession } from '../larkWebSession';
import { baseTokenFromUrl, type WebAutomation, type WebTable } from '../larkWebApi';
import { formatIssues, normalizeWorkflowInput, validateWorkflowBody } from '../workflowV3';
import { profileFromWebTables, v3ToInternal, verifyReadBack, WEB_SUPPORTED_TYPES } from '../webAutomation';

/**
 * Công cụ "Tạo workflow" chạy bằng PHIÊN LARK WEB đang đăng nhập — KHÔNG cần App ID/App Secret.
 *
 *   lark_web_list_bases  → mọi Base người dùng thấy (Drive + Wiki, + ô tìm kiếm của Drive)
 *   lark_web_scan_base   → bảng/cột/kiểu/lựa chọn/view/bản ghi mẫu + automation & workflow đã có
 *   lark_web_create_automation (GHI, hỏi xác nhận) → thiết kế `steps` chính thức (cùng bộ kiểm
 *       bitable_workflow_validate) → bản nháp NỘI BỘ → POST automation/create status 0 → đọc lại.
 *
 * Loại bước chưa có khuôn nội bộ đã đo → trả `kind:"unsupported"` và agent dựng trong trình soạn của
 * chính Lark bằng lark_ui_* (khung Chromium hiện cạnh hội thoại). Không có công cụ bật/xoá.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type J = any;

/** Cache quét gần nhất theo token — create kiểm lại theo đúng hồ sơ người dùng vừa xem. */
const scanCache = new Map<string, { at: number; tables: WebTable[]; name: string }>();
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

async function tablesFor(token: string): Promise<{ tables: WebTable[]; name: string }> {
  const c = scanCache.get(token);
  if (c && Date.now() - c.at < SCAN_TTL) return c;
  const r = await getLarkWebSession().scanWebBase(token, { samples: 0 });
  const v = { at: Date.now(), tables: r.tables, name: r.meta.name };
  scanCache.set(token, v);
  return v;
}

/** Kiểm thiết kế (cấu trúc + đối chiếu Base thật) rồi chuyển sang bản nháp nội bộ. */
async function prepare(i: J): Promise<J> {
  const token = tokenOf(i);
  const { body, notes } = normalizeWorkflowInput(i);
  if (!body.title || !String(body.title).trim()) return { ok: false, kind: 'invalid', error: 'Thiếu `title` (tên automation).' };
  const { tables, name } = await tablesFor(token);
  const r = validateWorkflowBody(body, { mode: 'create', profile: profileFromWebTables(tables) });
  // Người nhận "tôi" ở phiên web không phải open_id ou_… — bỏ đúng lỗi đó, phần còn lại giữ nguyên.
  const errors = r.errors.filter((e) => !/receiver|open_?id|ou_/i.test(`${e.path} ${e.message}`));
  if (errors.length) return { ok: false, kind: 'invalid', errors: formatIssues({ errors, warnings: [] }), hint: 'Sửa thiết kế theo các lỗi trên rồi gọi lại.' };
  const me = await getLarkWebSession().webMe();
  const conv = v3ToInternal({ title: String(body.title), steps: body.steps as J[] }, tables, me);
  if (!conv.ok) {
    return conv.unsupported?.length
      ? {
          ok: false,
          kind: 'unsupported',
          error: conv.errors.join(' '),
          supported: WEB_SUPPORTED_TYPES,
          next: `Dựng automation này trong trình soạn của Lark: lark_ui_open({app_token:"${token}"}) → mở "Tự động hoá" → tạo theo thiết kế bằng lark_ui_snapshot/act/wait; luôn để TẮT; lark_ui_saved để xác nhận Lark đã lưu.`,
        }
      : { ok: false, kind: 'invalid', errors: conv.errors };
  }
  return { ok: true, token, baseName: name, body, notes, conv, me, warnings: r.warnings.map((w) => w.message) };
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
          'Thiết kế theo `steps` chính thức (bitable_workflow_schema để tra) → trình bày thiết kế bằng tiếng Việt và CHỜ người dùng đồng ý → lark_web_create_automation. ' +
          `Tạo thẳng được: ${WEB_SUPPORTED_TYPES.join(', ')}; loại khác dựng trong trình soạn Lark bằng lark_ui_*.`,
      };
    },
  },
  {
    name: 'lark_web_create_automation',
    gated: true,
    description:
      'TẠO một Automation MỚI trong Base qua phiên Lark web (KHÔNG cần App ID) — luôn ở trạng thái TẮT, người dùng tự bật trong Lark. GHI: người dùng thấy hộp xác nhận vẽ sẵn thiết kế. ' +
      'Chỉ gọi SAU khi: lark_web_scan_base → dựng `title` + `steps` theo schema chính thức → trình bày thiết kế → người dùng đồng ý. ' +
      `Hỗ trợ: ${WEB_SUPPORTED_TYPES.join(', ')} (luồng thẳng, không rẽ nhánh). Bảng/cột theo TÊN (table_name/field_name/watched_field_name); nội dung tin nhắn: [{value_type:"text",value:"…"},{value_type:"ref",value:"$.<id trigger>.<field_id>"}]; ` +
      'người nhận "tôi" = [{value_type:"user",value:{id:"me"}}]; thêm nút mở bản ghi: btn_list:[{text:"Xem bản ghi",btn_action:"openLink",link:[{value_type:"ref",value:"$.<id trigger>.recordLink"}]}]. Loại khác → trả kind "unsupported" kèm cách dựng bằng lark_ui_*. Tool tự kiểm lại, tạo, rồi ĐỌC LẠI để xác minh.',
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
      const web = getLarkWebSession();
      const draft = JSON.stringify(p.conv.draft);
      const extra = JSON.stringify(p.conv.extra);
      const created = await web.createWebAutomation(p.token, { draft, extra, triggerName: p.conv.triggerName || '' });
      let saved: J = null;
      let verifyNote = '';
      try {
        saved = await web.readWebAutomation(p.token, created.workflowID);
      } catch (e) {
        verifyNote = String((e as Error)?.message || e);
      }
      const v = verifyReadBack(saved, p.conv.draft);
      // Cho người dùng thấy ngay trong khung Lark bên cạnh.
      void web.showBase(p.token);
      return {
        ok: v.ok,
        workflow_id: created.workflowID,
        title: p.body.title,
        base: p.baseName,
        verified: v.ok,
        status_text: v.enabled ? 'ĐANG BẬT (bất thường — kiểm tra ngay)' : 'đang TẮT — chờ người dùng xem lại và tự bật',
        ...(v.problems.length ? { problems: v.problems } : {}),
        ...(verifyNote ? { verify_note: verifyNote } : {}),
        design_text: workflowDesignText(p.body.steps),
        review: `Trong khung Lark bên phải: mở "Tự động hoá" → «${p.body.title}» → kiểm từng bước → TỰ BẬT khi thấy đúng. Larkwave không bật automation.`,
        ...(p.warnings.length ? { warnings: p.warnings } : {}),
      };
    },
  },
];
