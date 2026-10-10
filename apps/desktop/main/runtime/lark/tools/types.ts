import { randomUUID } from 'node:crypto';
import type { LarkClient } from '../larkClient';

/**
 * One tool Claude may call against the connected Lark workspace. `gated: true`
 * marks a destructive write (create/update/delete/send) that the MCP bridge pauses
 * for user confirmation before executing. The same registry powers both the chat
 * agent loop and (later) the curated-plugin tools.
 */
export interface LarkToolDef {
  name: string;
  /** Prescriptive "call this when…" description — recent Opus under-reaches without it. */
  description: string;
  /** JSON Schema for the tool input (advertised over MCP). */
  inputSchema: Record<string, unknown>;
  /** Destructive write → confirmation required. */
  gated: boolean;
  /**
   * Ghi CỘNG THÊM, không phá gì của người dùng: tạo automation TẮT, thêm bảng/cột/lựa chọn mới.
   * Ở chế độ "Tạo workflow" với công tắc "Tự động (không hỏi lại)" đang bật, tool gated có cờ này
   * chạy luôn không hỏi. Xoá / ghi đè / sửa cái đang có / bật automation thì KHÔNG BAO GIỜ được
   * gắn cờ này — chúng vẫn luôn hỏi (xem needsConfirmation trong larkToolExec).
   */
  additive?: boolean;
  /**
   * Cờ `additive` chỉ đúng với MỘT SỐ input (vd đính tệp: ghi thêm = cộng thêm, `replace:true` = ghi
   * đè). Có hàm này thì tool chỉ được tự duyệt khi nó trả true cho input của lần gọi đó.
   */
  additiveWhen?(input: Record<string, any>): boolean;
  /**
   * Bản dễ đọc của input cho hộp xác nhận (vd thay `fld…` bằng tên cột). Chỉ để HIỂN THỊ — lỗi ở
   * đây không được chặn thao tác (nơi gọi nuốt lỗi).
   */
  preview?(input: Record<string, any>): Promise<unknown>;
  /**
   * Kiểm TRƯỚC hộp xác nhận (chỉ có nghĩa với tool gated). Trả một payload `{ok:false,…}` thì
   * KHÔNG hỏi người dùng và KHÔNG chạy exec — kết quả đó đi thẳng về model như kết quả của tool.
   * Trả null = hợp lệ, hỏi xác nhận như thường. Lý do: không bắt người dùng duyệt một thiết kế mà
   * máy chủ chắc chắn sẽ từ chối (workflow sai schema).
   */
  preflight?(input: Record<string, any>, client: LarkClient): Promise<Record<string, unknown> | null>;
  exec(input: Record<string, any>, client: LarkClient): Promise<unknown>;
}

export const enc = encodeURIComponent;
export const uuid = () => randomUUID();

/** Small helper for a described string schema property. */
export const str = (description: string) => ({ type: 'string', description });
