import type { LarkToolDef } from './types';
import { bitableTools } from './bitable';
import { bitablePermissionTools } from './bitablePermissions';
import { messagingTools } from './messaging';
import { docsTools } from './docs';
import { contactsTools } from './contacts';
import { calendarTools } from './calendar';
import { wikiTools } from './wiki';
import { sheetsTools } from './sheets';
import { driveTools } from './drive';
import { attachmentTools } from './attachments';
import { fileTools } from './files';

/**
 * Bộ công cụ cho máy chạy nền (VM) — KHÔNG đi qua `tools/index.ts`.
 *
 * Hai nhóm bị loại, mỗi nhóm một lý do khác nhau:
 *  • `larkUi` (lark_ui_*) cần một trình duyệt thật để bấm hộ trên giao diện Lark. VM headless
 *    không có, và quan trọng hơn: nó kéo theo `larkWebSession` → `electron`, nên chỉ cần nó nằm
 *    trong cây import là cả bản dựng cho VM hỏng.
 *  • `cmsSync` cũng kéo theo `larkWebSession`, và việc đó đã có `tw-cms-keeper` lo rồi.
 *  • `workflows` (bitable_create_workflow) cũng vậy — nó dựng quy trình bằng cách điều khiển giao
 *    diện Lark qua phiên web. Không có trình duyệt thì không làm được, và import nó vào là kéo
 *    `electron` theo y hệt hai nhóm trên.
 *
 * Cố ý KHÔNG viết dưới dạng `ALL.filter(...)`: lọc sau khi import thì `tools/index.ts` vẫn nằm
 * trong cây phụ thuộc và vẫn kéo `electron` vào bundle. Phải không import mới là loại.
 */
const HEADLESS: LarkToolDef[] = [
  ...bitableTools,
  ...bitablePermissionTools,
  ...messagingTools,
  ...docsTools,
  ...contactsTools,
  ...calendarTools,
  ...wikiTools,
  ...sheetsTools,
  ...driveTools,
  ...attachmentTools,
  // `files.ts` chỉ chạm `node:fs`/`node:path` — không kéo electron, nên máy chạy nền dùng được.
  // PDF thì tự tắt ở đó vì `setPdfMaker` không bao giờ được gọi; `create_file` nói thẳng lý do
  // và đề nghị .docx thay vì để agent thử lại tới lúc hết giờ.
  ...fileTools,
];

/** Mọi công cụ chạy được không cần giao diện (đọc + ghi). */
export const headlessTools = (): LarkToolDef[] => HEADLESS;

/** Chỉ công cụ đọc — dùng cho lịch đặt ở chế độ chỉ-đọc. */
export const headlessReadOnlyTools = (): LarkToolDef[] => HEADLESS.filter((t) => !t.gated);

/** Tra một công cụ theo tên (nơi gọi tự quyết định bộ nào). */
export function findHeadlessTool(name: string): LarkToolDef | undefined {
  return HEADLESS.find((t) => t.name === name);
}
