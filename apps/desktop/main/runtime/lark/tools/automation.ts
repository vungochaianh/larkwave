import type { LarkToolDef } from './types';
import { str } from './types';
import { getAgentScheduler } from '../scheduleBridge';

/**
 * Auto-scheduling tool: lets the Lark agent set up a recurring run of ITSELF when the user's
 * message expresses scheduling intent ("mỗi ngày…", "tự động chạy… định kỳ…"), instead of the
 * user opening Cài đặt → Tự động hoá by hand. Gated (write) → the bridge asks for confirmation.
 */
export const automationTools: LarkToolDef[] = [
  {
    name: 'schedule_agent_job',
    description:
      'LÊN LỊCH tự động chạy một câu lệnh cho CHÍNH BẠN (agent) theo thời gian. Gọi tool này khi người dùng muốn ' +
      'một việc lặp lại tự động — vd "mỗi ngày 9h chạy PBTTCN", "tự động đối chiếu công nợ hàng ngày", "cứ 2 tiếng chạy 1 lần". ' +
      '`prompt` = TOÀN BỘ việc cần chạy mỗi lần (viết đầy đủ, tự chứa, vì lúc chạy sẽ là phiên mới không có ngữ cảnh hội thoại này). ' +
      'Lịch: mode="daily" + atHour/atMinute (+days: 0=CN..6=T7, bỏ trống = mỗi ngày) HOẶC mode="interval" + intervalSec (>=60). ' +
      'Tuỳ chọn postToChatId = chat_id nhóm Lark để tự gửi báo cáo mỗi lần. Đây là hành động GHI (tạo lịch) — sẽ hỏi xác nhận. ' +
      'Tool này CHỈ tạo lịch, KHÔNG chạy việc ngay bây giờ. ' +
      'Lịch chạy ở chế độ THỰC THI (được ghi dữ liệu) trừ khi đặt readOnly=true.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['prompt'],
      properties: {
        prompt: str('Câu lệnh agent sẽ chạy mỗi lần tới lịch — viết đầy đủ, tự chứa (vd nội dung PBTTCN hoàn chỉnh).'),
        name: str('Tên lịch ngắn gọn (tuỳ chọn), vd "PBTTCN hằng ngày".'),
        mode: {
          type: 'string',
          enum: ['daily', 'interval'],
          description: 'daily = mỗi ngày vào giờ:phút; interval = mỗi intervalSec giây. Mặc định daily.',
        },
        atHour: { type: 'number', description: 'daily: giờ 0-23 (mặc định 9).' },
        atMinute: { type: 'number', description: 'daily: phút 0-59 (mặc định 0).' },
        days: {
          type: 'array',
          items: { type: 'number' },
          description: 'daily: các thứ chạy 0(CN)-6(T7); bỏ trống = chạy mỗi ngày.',
        },
        intervalSec: { type: 'number', description: 'interval: số giây giữa 2 lần chạy (>=60).' },
        postToChatId: str('chat_id nhóm Lark để gửi báo cáo mỗi lần chạy (tuỳ chọn).'),
        readOnly: {
          type: 'boolean',
          description:
            'Mặc định false = lịch được GHI dữ liệu (thực thi). Đặt true CHỈ KHI việc đó thuần đọc ' +
            '(vd báo cáo số liệu rồi gửi tin nhắn) — lúc đó lịch sẽ không ghi được gì.',
        },
        input_files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Việc ĐỌC TỆP: đường dẫn các tệp trong hội thoại (người dùng đã gửi) → chép vào "Tệp nguồn" của quy tắc; mỗi lần chạy đọc thư mục đó.',
        },
        sources: {
          type: 'array',
          description: 'Nguồn Lark tải MỚI mỗi lần chạy: [{kind:"drive"|"sheet"|"attachment", url, field? (cột đính kèm), table?, record_id?}].',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'url'],
            properties: {
              kind: { type: 'string', enum: ['drive', 'sheet', 'attachment'] },
              url: str('Link Drive …/file/<token> | Lark Sheets …/sheets/<token> | Base …/base/<token>?table=…'),
              field: str('attachment: TÊN cột Tệp đính kèm'),
              table: str('attachment: tên bảng / table_id (bỏ trống = theo ?table= trong link)'),
              record_id: str('attachment: chỉ tệp của bản ghi này'),
            },
          },
        },
        only_new_files: { type: 'boolean', description: 'Chỉ xử lý tệp MỚI (theo nội dung) — mặc định true khi có tệp nguồn/nguồn Lark.' },
        keep_outputs: { type: 'number', description: 'Giữ kết quả N lần chạy gần nhất (mặc định 10).' },
        permissions: {
          type: 'object',
          additionalProperties: false,
          description: 'Quyền khi chạy tự động — CHỈ bật thứ người dùng đã đồng ý rõ ràng. Thao tác cộng thêm không cần quyền.',
          properties: {
            overwrite_cells: { type: 'boolean', description: 'Sửa bản ghi có sẵn / ghi theo khoá có dòng phải sửa.' },
            replace_attachments: { type: 'boolean', description: 'Đính thay tệp (xoá tệp cũ).' },
            send_messages: { type: 'boolean', description: 'Gửi tin / tệp vào nhóm.' },
            delete_records: { type: 'boolean', description: 'Xoá bản ghi/bảng/cột.' },
          },
        },
        run_on: { type: 'string', enum: ['auto', 'desktop'], description: '"desktop" = chỉ chạy ở app trên máy này (cần phiên Lark web / tệp trên máy). Mặc định "desktop" khi có tệp nguồn.' },
      },
    },
    gated: true,
    exec: async (input) => {
      const schedule = getAgentScheduler();
      if (!schedule) throw new Error('Chức năng lên lịch chưa sẵn sàng (cần bản desktop mới hơn).');
      const prompt = String(input.prompt || '').trim();
      if (!prompt) throw new Error('Thiếu nội dung việc cần lên lịch (prompt).');
      return schedule({
        prompt,
        name: input.name ? String(input.name) : undefined,
        mode: input.mode === 'interval' ? 'interval' : 'daily',
        atHour: typeof input.atHour === 'number' ? input.atHour : undefined,
        atMinute: typeof input.atMinute === 'number' ? input.atMinute : undefined,
        days: Array.isArray(input.days) ? input.days.filter((d) => typeof d === 'number') : undefined,
        intervalSec: typeof input.intervalSec === 'number' ? input.intervalSec : undefined,
        postToChatId: input.postToChatId ? String(input.postToChatId) : undefined,
        saveConversation: true,
        notify: true,
        mode2: input.readOnly === true ? 'ask' : 'build',
        ...(() => {
          const inputFiles = Array.isArray(input.input_files) ? input.input_files.map(String).filter(Boolean).slice(0, 20) : [];
          const sources = Array.isArray(input.sources)
            ? (input.sources as Record<string, unknown>[])
                .filter((x) => x && typeof x.url === 'string' && ['drive', 'sheet', 'attachment'].includes(String(x.kind)))
                .slice(0, 10)
                .map((x, k) => ({
                  id: `src${k + 1}`,
                  kind: String(x.kind) as 'drive' | 'sheet' | 'attachment',
                  url: String(x.url),
                  ...(x.field ? { field: String(x.field) } : {}),
                  ...(x.table ? { table: String(x.table) } : {}),
                  ...(x.record_id ? { recordId: String(x.record_id) } : {}),
                }))
            : [];
          const fileDriven = inputFiles.length > 0 || sources.length > 0;
          const p = (input.permissions ?? {}) as Record<string, unknown>;
          return {
            inputFiles,
            files: { sources, onlyNewFiles: input.only_new_files !== undefined ? input.only_new_files === true : fileDriven, keepOutputs: typeof input.keep_outputs === 'number' ? input.keep_outputs : 10 },
            permissions: { overwriteCells: p.overwrite_cells === true, replaceAttachments: p.replace_attachments === true, sendMessages: p.send_messages === true, deleteRecords: p.delete_records === true },
            runOn: input.run_on === 'auto' ? ('auto' as const) : input.run_on === 'desktop' || fileDriven ? ('desktop' as const) : ('auto' as const),
          };
        })(),
      });
    },
  },
];
