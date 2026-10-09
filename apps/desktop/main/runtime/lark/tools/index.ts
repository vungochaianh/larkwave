import type { LarkToolDef } from './types';
import { bitableTools } from './bitable';
import { bitablePermissionTools } from './bitablePermissions';
import { workflowTools } from './workflows';
import { workflowV3Tools } from './workflowsV3';
import { larkUiTools } from './larkUi';
import { larkWebTools } from './larkWeb';
import { messagingTools } from './messaging';
import { docsTools } from './docs';
import { contactsTools } from './contacts';
import { calendarTools } from './calendar';
import { wikiTools } from './wiki';
import { sheetsTools } from './sheets';
import { driveTools } from './drive';
import { cmsSyncTools } from './cmsSync';
import { automationTools } from './automation';
import { attachmentTools } from './attachments';
import { skillTools } from './skills';
import { fileTools } from './files';

/**
 * Ghi CỘNG THÊM của đường Open API (tạo bản ghi/bảng/cột/view mới, tạo workflow v3 — luôn TẮT):
 * không phá gì đang có → công tắc "Tự động" được tự duyệt, như các tool phiên web có cờ `additive`.
 * Gửi tin nhắn / sửa / xoá KHÔNG nằm đây — luôn hỏi.
 */
const ADDITIVE_OPEN_API = new Set([
  'bitable_create_record',
  'bitable_batch_create_records',
  'bitable_create_table',
  'bitable_create_field',
  'bitable_create_view',
  'bitable_workflow_create',
]);

const ALL: LarkToolDef[] = [
  ...automationTools,
  ...skillTools,
  ...attachmentTools,
  ...fileTools,
  ...bitableTools,
  ...bitablePermissionTools,
  ...larkWebTools,
  ...workflowV3Tools,
  ...workflowTools,
  ...larkUiTools,
  ...cmsSyncTools,
  ...messagingTools,
  ...docsTools,
  ...contactsTools,
  ...calendarTools,
  ...wikiTools,
  ...sheetsTools,
  ...driveTools,
].map((t) => (t.gated && ADDITIVE_OPEN_API.has(t.name) ? { ...t, additive: true } : t));
const BY_NAME = new Map(ALL.map((t) => [t.name, t]));

/** Every built-in Lark tool (read + gated writes). Used in Build mode. */
export const allTools = (): LarkToolDef[] => ALL;
/** Only the non-destructive read tools. Used in Ask (Q&A) mode. */
export const readOnlyTools = (): LarkToolDef[] => ALL.filter((t) => !t.gated);
/**
 * Công cụ chạy bằng PHIÊN LARK WEB (không cần App ID): liệt kê/quét Base, đọc automation/quy trình,
 * tạo KHỐI Workflow / automation TẮT, dựng bảng/cột, tra schema chính thức, và lái giao diện Lark
 * (lark_ui_*) cho loại bước chưa tạo thẳng được.
 */
export const WORKFLOW_MODE_TOOL_NAMES = [
  'lark_web_list_bases',
  'lark_web_scan_base',
  'lark_web_read_automations',
  'lark_web_create_workflows',
  'lark_web_create_automation',
  'lark_web_create_automations',
  'lark_web_add_table',
  'lark_web_add_fields',
  'bitable_workflow_schema',
  'lark_ui_health',
  'lark_ui_dismiss',
  'lark_ui_open',
  'lark_ui_snapshot',
  'lark_ui_act',
  'lark_ui_wait',
  'lark_ui_drag',
  'lark_ui_saved',
  'lark_ui_template_list',
  'lark_ui_template_apply',
] as const;
/** Tool không cần client Open API: phiên web + dựng tệp cục bộ. */
const CLIENTLESS = new Set<string>([...WORKFLOW_MODE_TOOL_NAMES, 'create_file', 'fill_xlsx']);

/**
 * BỘ CÔNG CỤ HỢP NHẤT của Lark × Agents (một agent cho cả "Lark × Agents" và "Tạo workflow" — hai
 * màn chỉ là hai bố cục của cùng hội thoại):
 *   - Có custom app (`withOpenApi`): mọi tool (Open API + phiên web + giao diện).
 *   - Chưa có: chỉ tool phiên web + tệp cục bộ (CLIENTLESS) — không bày tool sẽ chết vì thiếu client.
 *   - `mode: 'ask'` (lượt cũ từ relay/bản cũ còn gửi): bỏ mọi tool ghi.
 * Ghi chép duyệt KHÔNG nằm ở đây: needsConfirmation (larkToolExec) quyết định — tool `additive` chạy
 * luôn khi công tắc "Tự động" BẬT, xoá/sửa/gửi tin luôn hỏi.
 */
export function agentTools(opts: { withOpenApi: boolean; mode?: 'ask' | 'build' }): LarkToolDef[] {
  const base = opts.withOpenApi ? ALL : ALL.filter((t) => CLIENTLESS.has(t.name));
  return opts.mode === 'ask' ? base.filter((t) => !t.gated) : base;
}
/** Tên cũ (chế độ "Tạo workflow" trước khi hợp nhất) — giữ cho nơi gọi/test cũ. */
export function workflowModeTools(withOpenApi = false): LarkToolDef[] {
  return withOpenApi ? ALL.filter((t) => CLIENTLESS.has(t.name) || ['bitable_scan_base', 'bitable_workflow_validate', 'bitable_workflow_create'].includes(t.name)) : agentTools({ withOpenApi: false });
}
/** Resolve a tool by name (for the MCP bridge dispatcher). */
export const resolveTool = (name: string): LarkToolDef | undefined => BY_NAME.get(name);

export type { LarkToolDef } from './types';

/**
 * Tên công cụ này có GHI dữ liệu không?
 *
 * Nguồn sự thật là chính cờ `gated` trong khai báo tool — chỗ duy nhất quyết định thao tác nào
 * cần người dùng duyệt. Tra theo tên để nơi gọi khỏi phải giữ một danh sách thứ hai rồi trôi lệch.
 */
export function isWriteTool(name: string): boolean {
  return !!ALL.find((t) => t.name === name)?.gated;
}

/**
 * Tool này có phải thao tác ghi CỘNG THÊM (không phá gì của người dùng) không — chỉ những tool này
 * được công tắc "Tự động" của Tạo workflow tự duyệt. Tra theo cờ `additive` của chính khai báo tool.
 */
export function isAdditiveTool(name: string): boolean {
  const t = ALL.find((x) => x.name === name);
  return !!(t?.gated && t.additive);
}
