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
}

export interface ScheduleAgentResult {
  id: string;
  name: string;
  /** Human-readable cadence, e.g. "mỗi ngày 09:00". */
  when: string;
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
