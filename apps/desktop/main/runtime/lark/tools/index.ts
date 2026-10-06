import type { LarkToolDef } from './types';
import { bitableTools } from './bitable';
import { bitablePermissionTools } from './bitablePermissions';
import { workflowTools } from './workflows';
import { larkUiTools } from './larkUi';
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
