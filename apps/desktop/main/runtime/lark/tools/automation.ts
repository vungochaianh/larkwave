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
      });
    },
  },
];
