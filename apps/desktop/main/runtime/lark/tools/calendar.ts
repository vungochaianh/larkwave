import { type LarkToolDef, enc, str } from './types';

/** Calendar — list calendars/events (read) + create event (gated). */
export const calendarTools: LarkToolDef[] = [
  {
    name: 'calendar_list_calendars',
    description: 'Liệt kê các lịch (calendars) mà app truy cập được.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { page_size: { type: 'integer', description: 'Số lịch tối đa (mặc định 50)' } },
    },
    gated: false,
    exec: (i, c) => c.request('GET', '/open-apis/calendar/v4/calendars', { params: { page_size: i.page_size ?? 50 } }),
  },
  {
    name: 'calendar_list_events',
    description: 'Liệt kê sự kiện trong một lịch theo calendar_id.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        calendar_id: str('calendar_id'),
        page_size: { type: 'integer' },
        page_token: str('Token trang tiếp theo'),
      },
      required: ['calendar_id'],
    },
    gated: false,
    exec: (i, c) =>
      c.request('GET', `/open-apis/calendar/v4/calendars/${enc(i.calendar_id)}/events`, {
        params: { page_size: i.page_size ?? 50, page_token: i.page_token },
      }),
  },
  {
    name: 'calendar_create_event',
    description:
      'Tạo sự kiện mới trong một lịch. Hành động GHI — sẽ hỏi xác nhận. start_time/end_time là mốc epoch (giây) dạng chuỗi.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        calendar_id: str('calendar_id'),
        summary: str('Tiêu đề sự kiện'),
        start_time: str('Bắt đầu — epoch giây'),
        end_time: str('Kết thúc — epoch giây'),
      },
      required: ['calendar_id', 'summary', 'start_time', 'end_time'],
    },
    gated: true,
    exec: (i, c) =>
      c.request('POST', `/open-apis/calendar/v4/calendars/${enc(i.calendar_id)}/events`, {
        data: {
          summary: i.summary,
          start_time: { timestamp: String(i.start_time) },
          end_time: { timestamp: String(i.end_time) },
        },
      }),
  },
];
