/**
 * Bridge so the `schedule_agent_job` Lark tool can create a scheduled automation WITHOUT the
 * tool layer importing AutomationEngine/larkService (tools only receive a LarkClient). larkService
 * registers the creator at startup; the tool calls getAgentScheduler() at exec time.
 */
export interface ScheduleAgentInput {
  /** The agent prompt to run each time the schedule fires (e.g. a full "PBTTCN" reconciliation). */
  prompt: string;
  /** Short human name for the rule. */
  name?: string;
  /** daily = fire at atHour:atMinute on `days`; interval = every intervalSec. Default daily. */
  mode?: 'daily' | 'interval';
  atHour?: number;
  atMinute?: number;
  /** daily weekdays 0(Sun)-6(Sat); empty = every day. */
  days?: number[];
  intervalSec?: number;
  /** Post the report to this Lark chat_id (optional). */
  postToChatId?: string;
  saveConversation?: boolean;
  notify?: boolean;
  /** Chế độ chạy mỗi lần tới lịch: 'build' (thực thi — mặc định) hoặc 'ask' (chỉ đọc, cho lịch báo cáo). */
  mode2?: 'ask' | 'build';
  /** Thư mục/nguồn tệp của quy tắc (việc đọc tệp → ghi Base). */
  files?: { sources?: { id: string; kind: 'drive' | 'sheet' | 'attachment'; url: string; table?: string; field?: string; recordId?: string; label?: string }[]; onlyNewFiles?: boolean; keepOutputs?: number };
  /** Đường dẫn tệp trong hội thoại → chép vào "Tệp nguồn" (inputs/) của quy tắc. */
  inputFiles?: string[];
  /** Quyền khi chạy tự động — CHỈ những gì người dùng đồng ý (công cụ đặt lịch luôn hỏi duyệt). */
  permissions?: { overwriteCells?: boolean; replaceAttachments?: boolean; sendMessages?: boolean; deleteRecords?: boolean };
  runOn?: 'auto' | 'desktop';
  /** Chạy đủ N lần thì tự tắt (vd "30 lần là dừng"). Bỏ trống = không giới hạn. */
  maxRuns?: number;
}

export interface ScheduleAgentResult {
  id: string;
  name: string;
  /** Human-readable cadence, e.g. "mỗi ngày 09:00". */
  when: string;
  /** Thư mục của quy tắc + tệp nguồn đã chép vào. */
  folder?: string;
  inputs?: string[];
  inputErrors?: string[];
  /** Số lần chạy tối đa (nếu có). */
  maxRuns?: number;
  /** Công cụ Zalo/Gmail lịch được dùng (chỉ khi tạo từ hội thoại của chủ máy). */
  connectorTools?: string[];
  /** Quyền đã cấp cho lịch (để agent nói đúng với người dùng). */
  permissions?: ScheduleAgentInput['permissions'];
}

type Creator = (input: ScheduleAgentInput) => Promise<ScheduleAgentResult>;

let creator: Creator | null = null;

/** larkService wires this at startup (it owns the AutomationEngine). */
export function setAgentScheduler(fn: Creator | null): void {
  creator = fn;
}

export function getAgentScheduler(): Creator | null {
  return creator;
}
