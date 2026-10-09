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
];
const BY_NAME = new Map(ALL.map((t) => [t.name, t]));

/** Every built-in Lark tool (read + gated writes). Used in Build mode. */
export const allTools = (): LarkToolDef[] => ALL;
/** Only the non-destructive read tools. Used in Ask (Q&A) mode. */
export const readOnlyTools = (): LarkToolDef[] => ALL.filter((t) => !t.gated);
/**
 * Bộ công cụ của chế độ "Tạo workflow": chạy bằng PHIÊN LARK WEB (không cần App ID) — liệt kê/quét
 * Base, tra schema chính thức, tạo automation TẮT, và tự lái trình soạn của Lark (lark_ui_*) cho
 * loại bước chưa tạo thẳng được. Cố ý KHÔNG gồm tool Open API (cần token của custom app) — trừ khi
 * người dùng đã kết nối app (`withOpenApi`), khi đó thêm đường v3 làm phương án phụ.
 */
export const WORKFLOW_MODE_TOOL_NAMES = [
  'lark_web_list_bases',
  'lark_web_scan_base',
  'lark_web_read_automations',
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
const OPEN_API_WORKFLOW = ['bitable_scan_base', 'bitable_workflow_validate', 'bitable_workflow_create'];
export function workflowModeTools(withOpenApi = false): LarkToolDef[] {
  const names = new Set<string>([...WORKFLOW_MODE_TOOL_NAMES, ...(withOpenApi ? OPEN_API_WORKFLOW : [])]);
  return ALL.filter((t) => names.has(t.name));
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
