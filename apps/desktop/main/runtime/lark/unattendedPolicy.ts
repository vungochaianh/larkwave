/**
 * LUẬT DUYỆT của lượt chạy KHÔNG NGƯỜI TRÔNG (tự động hoá theo lịch, máy chạy hộ trên VM).
 *
 * Không ai ngồi đó bấm "Cho phép". Trước đây chế độ thực thi tự duyệt MỌI thao tác ghi — kể cả xoá, ghi
 * đè, gửi tin vào nhóm — chỉ vì người dùng đã chọn "Cho phép ghi dữ liệu". Nay:
 *   - Thao tác CỘNG THÊM (thêm bản ghi mới, đính tệp ghi thêm, tải lên Drive, nhập thành Sheet/Doc,
 *     thêm bảng/cột…; xem cờ `additive`/`additiveWhen`/`additiveCheck`) chạy như chế độ "Tự động".
 *   - Thao tác có thể PHÁ dữ liệu hay đi RA NGOÀI chỉ chạy khi quy tắc đã được cấp ĐÚNG quyền đó trong
 *     "Quyền khi chạy tự động"; không có thì BỎ QUA và ghi rõ vào lịch sử chạy (không âm thầm).
 *   - Một số loại KHÔNG BAO GIỜ chạy không người trông (phân quyền Base, bật/sửa workflow, tạo lịch/kỹ
 *     năng, lái giao diện) — không có ô nào cấp được.
 *
 * Thuần (không electron, không I/O) — dùng chung cho app desktop và tw-lark-runner.
 */

export interface UnattendedPerms {
  /** Ghi đè ô / sửa bản ghi có sẵn / ghi vùng Sheet có sẵn / đổi cột-Base. */
  overwriteCells?: boolean;
  /** Đính THAY tệp (xoá tệp cũ trong ô đính kèm). */
  replaceAttachments?: boolean;
  /** Gửi tin nhắn / gửi tệp vào nhóm chat / mời lịch. */
  sendMessages?: boolean;
  /** Xoá bản ghi / bảng / cột / view. */
  deleteRecords?: boolean;
}

export type GatedCategory = 'additive' | 'overwrite' | 'replace_attachment' | 'send' | 'delete' | 'never';

/** Tên hiển thị của từng quyền (giao diện + lịch sử chạy dùng chung). */
export const PERM_LABEL: Record<Exclude<GatedCategory, 'additive' | 'never'>, string> = {
  overwrite: 'Ghi đè ô / sửa bản ghi có sẵn',
  replace_attachment: 'Đính thay tệp (xoá tệp cũ trong ô)',
  send: 'Gửi tin nhắn / gửi tệp vào nhóm',
  delete: 'Xoá bản ghi / bảng / cột',
};

const PERM_KEY: Record<Exclude<GatedCategory, 'additive' | 'never'>, keyof UnattendedPerms> = {
  overwrite: 'overwriteCells',
  replace_attachment: 'replaceAttachments',
  send: 'sendMessages',
  delete: 'deleteRecords',
};

const SEND = new Set(['messaging_send_message', 'messaging_send_rich', 'messaging_create_chat', 'calendar_create_event']);
const OVERWRITE = new Set([
  'lark_web_update_records',
  'bitable_update_record',
  'bitable_batch_update_records',
  'lark_web_sheet_write_range',
  'sheets_write_range',
  'bitable_update_field',
  'bitable_update_app',
  'drive_move_file',
]);
/** Không bao giờ chạy khi không có người: phân quyền, workflow (sửa/bật/dựng qua giao diện), tự nhân bản. */
const NEVER = new Set([
  'bitable_add_role_member',
  'bitable_create_role',
  'bitable_update_role',
  'bitable_delete_role',
  'bitable_remove_role_member',
  'bitable_workflow_update',
  'bitable_create_workflow',
  'bitable_delete_workflow',
  'schedule_agent_job',
  'create_skill',
  'update_skill',
  'skill_save',
  'cms_create_bitable_sync',
  'lark_ui_template_apply',
  // Xoá cả BẢNG / automation / khối Workflow: chỉ khi có người bấm duyệt — không quyền nào của quy tắc mở được.
  'lark_web_delete',
  // Gửi tin Zalo / thư Gmail bằng tài khoản cá nhân: chỉ trong lượt trò chuyện có người bấm duyệt.
  // (Công cụ ĐỌC Zalo/Gmail cũng bị chặn ở lượt không người trông — connectorGate trong tools/connectors.ts.)
  'zalo_send_text',
  'gmail_send',
]);

/**
 * Loại của một lời gọi GHI (tool `gated`). `dynamicAdditive` = kết quả `additiveCheck` của lần gọi
 * (vd ghi theo khoá: có dòng phải sửa → false).
 */
export function gatedCategory(
  tool: { name: string; additive?: boolean; additiveWhen?: (i: Record<string, any>) => boolean },
  input: Record<string, any> | null | undefined,
  dynamicAdditive?: boolean,
): GatedCategory {
  const name = tool.name;
  const i = input ?? {};
  if (NEVER.has(name) || name.startsWith('lark_ui_')) return 'never';
  if (/delete|remove/.test(name)) return 'delete';
  if (SEND.has(name)) return 'send';
  if (name === 'send_file') return String(i.to || '') === 'chat' ? 'send' : 'additive';
  if (name === 'lark_web_attach_file' && i.replace === true) return 'replace_attachment';
  let additive = !!tool.additive;
  if (additive && tool.additiveWhen) {
    try {
      additive = tool.additiveWhen(i) === true;
    } catch {
      additive = false;
    }
  }
  if (dynamicAdditive !== undefined) additive = !!tool.additive && dynamicAdditive;
  if (additive) return 'additive';
  if (OVERWRITE.has(name) || name === 'lark_web_write_records' || name === 'bitable_batch_create_records') return 'overwrite';
  return 'never';
}

export interface UnattendedDecision {
  allow: boolean;
  category: GatedCategory;
  /** Lý do bỏ qua (khi allow=false) — đi thẳng vào lịch sử chạy và kết quả trả về cho agent. */
  reason?: string;
}

/** Quyết định cho MỘT lời gọi ghi trong lượt không người trông. */
export function unattendedDecision(
  tool: { name: string; additive?: boolean; additiveWhen?: (i: Record<string, any>) => boolean },
  input: Record<string, any> | null | undefined,
  perms: UnattendedPerms | null | undefined,
  dynamicAdditive?: boolean,
): UnattendedDecision {
  const category = gatedCategory(tool, input, dynamicAdditive);
  if (category === 'additive') return { allow: true, category };
  if (category === 'never') {
    return { allow: false, category, reason: `«${tool.name}» không bao giờ chạy trong lượt tự động (cần người duyệt trực tiếp).` };
  }
  const key = PERM_KEY[category];
  if (perms?.[key]) return { allow: true, category };
  return {
    allow: false,
    category,
    reason: `Bỏ qua «${tool.name}»: cần quyền "${PERM_LABEL[category]}" trong mục "Quyền khi chạy tự động" của quy tắc.`,
  };
}

/**
 * Quyền hiệu lực của một quy tắc. Quy tắc tạo TRƯỚC khi có mục "Quyền khi chạy tự động" (không có
 * trường `permissions`) mà đặt chế độ THỰC THI: người dùng khi đó đã đồng ý rõ ràng ("agent được thêm/
 * sửa/xoá dữ liệu Lark… KHÔNG hỏi xác nhận") → giữ đúng sự đồng ý đó, để lịch đang chạy không hỏng
 * ngầm. Quy tắc mới mặc định KHÔNG cấp gì.
 */
export function effectivePerms(rule: { permissions?: UnattendedPerms; action?: { type?: string; mode?: string } } | null | undefined): {
  perms: UnattendedPerms;
  legacy: boolean;
} {
  if (rule?.permissions) return { perms: { ...rule.permissions }, legacy: false };
  const build = rule?.action?.type === 'run_agent' && rule.action.mode !== 'ask';
  return build
    ? { perms: { overwriteCells: true, replaceAttachments: true, sendMessages: true, deleteRecords: true }, legacy: true }
    : { perms: {}, legacy: false };
}

/** Tool nào KHÔNG được đưa vào lượt không người trông (tạo lịch/kỹ năng = tự nhân bản; lái giao diện). */
export function excludedFromUnattended(name: string): boolean {
  return name === 'schedule_agent_job' || name === 'create_skill' || name === 'update_skill' || name === 'skill_save' || name.startsWith('lark_ui_');
}
