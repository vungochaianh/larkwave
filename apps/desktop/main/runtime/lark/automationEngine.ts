import { randomUUID } from 'node:crypto';
import type { LarkAutoCondition, LarkAutomationInput, LarkAutomationRun, LarkAutomationRunResult, LarkAutoRunReport } from '@larkwave/core';
import type { LarkClient } from './larkClient';
import type { StoredAutomation } from './secretStore';

/**
 * "Tự động hoá (Larkwave)" — a local rule engine that works AROUND Lark's missing
 * "create automation" API. It POLLS a Base table on an interval; when a record matches
 * the rule's condition, it runs an action (send message / update record / call webhook)
 * using the SAME Lark tools the chat agent uses. Runs only while the desktop app is open
 * (a 24/7 variant would move this to the server — deferred).
 *
 * Dedup: each record fires an action AT MOST ONCE per rule (tracked in `firedRecordIds`).
 * By default a new rule is "seeded" — existing matches are recorded WITHOUT firing, so
 * only records that match AFTER creation trigger the action (avoids a spam storm). Set
 * `fireExisting` to also act on current matches.
 */

const MIN_INTERVAL = 30; // seconds
const MASTER_TICK_MS = 10_000; // scheduler granularity
const MAX_FIRED_IDS = 5000; // cap the dedup set so the file can't grow unbounded
const PAGE_SIZE = 200; // one page per tick (MVP); note in UI if a table is larger

/** Flatten a Lark field value to a plain string (for message/webhook templating). */
function fieldText(v: unknown): string {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(fieldText).filter(Boolean).join(', ');
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return String(o.text ?? o.name ?? o.en_name ?? o.link ?? o.value ?? '');
  }
  return String(v);
}
/** Replace `{Column}` placeholders in a template with the record's field values. */
function render(tpl: string, fields: Record<string, unknown>): string {
  return (tpl || '').replace(/\{([^}]+)\}/g, (_m, k: string) => fieldText(fields[k.trim()]));
}

/** Map a rule condition to a Lark server-side search filter. */
function toFilter(c: LarkAutoCondition): Record<string, unknown> {
  const noValue = c.op === 'isEmpty' || c.op === 'isNotEmpty';
  return {
    conjunction: 'and',
    conditions: [{ field_name: c.field, operator: c.op, value: noValue ? [] : [c.value ?? ''] }],
  };
}

interface Rec {
  record_id: string;
  fields: Record<string, unknown>;
}

/**
 * Gộp các LỊCH trùng nhau (cùng nội dung chạy + cùng nhịp) thành một.
 *
 * Giữ bản có lịch sử chạy — `lastRunAt` là thứ ngăn một lịch bắn lại khung giờ đã chạy, nên bỏ
 * nhầm bản có nó là mời thêm một lần chạy thừa ngay hôm đó.
 *
 * Chỉ đụng tới rule `schedule` chạy agent. Rule theo bảng Base có thể trùng tên một cách hợp lệ
 * (hai quy tắc khác điều kiện trên cùng một bảng) nên không được gộp.
 */
export function dedupeSchedules(list: StoredAutomation[]): StoredAutomation[] {
  const seen = new Map<string, number>();
  const out: StoredAutomation[] = [];
  for (const r of list) {
    const act = r.action;
    if (r.triggerType !== 'schedule' || act?.type !== 'run_agent') {
      out.push(r);
      continue;
    }
    const key = `${(act.prompt || '').trim()}::${JSON.stringify(r.schedule ?? null)}`;
    const at = seen.get(key);
    if (at === undefined) {
      seen.set(key, out.length);
      out.push(r);
      continue;
    }
    const kept = out[at]!;
    // Bản nào đã chạy thì bản đó là bản thật; giữ mốc chạy MUỘN NHẤT của cả hai.
    const keptMs = kept.lastRunAt ? Date.parse(kept.lastRunAt) : 0;
    const dupMs = r.lastRunAt ? Date.parse(r.lastRunAt) : 0;
    out[at] = {
      ...kept,
      lastRunAt: dupMs > keptMs ? r.lastRunAt : kept.lastRunAt,
      runCount: (kept.runCount ?? 0) + (r.runCount ?? 0),
      // Còn bật ở bất kỳ bản nào thì mục gộp vẫn bật.
      enabled: kept.enabled || r.enabled,
    };
  }
  return out;
}

export class AutomationEngine {
  private timer: ReturnType<typeof setInterval> | null = null;
  /** In-memory authority (loaded once) so the tick never re-reads the file. */
  private rules: StoredAutomation[] | null = null;
  /** Rule ids currently executing (prevents overlapping runs of the same rule). */
  private readonly running = new Set<string>();

  constructor(
    private readonly getClient: () => LarkClient | null,
    private readonly load: () => StoredAutomation[],
    private readonly persist: (list: StoredAutomation[]) => void,
    /** Runs a Lark-agent prompt (with Lark tools) on the owner's machine + delivers the result.
     *  Optional so the engine still works if the agent host isn't wired. */
    /** Máy này có đang là chủ chạy lịch không (null = không kiểm, luôn chạy). */
    private readonly isRunner?: () => Promise<boolean>,
    private readonly agent?: {
      run: (
        prompt: string,
        mode: 'ask' | 'build',
        /** `report` do nơi chạy điền (đọc gì / ghi gì / đọc lại / bỏ qua / tệp kết quả) — vào lịch sử chạy. */
        stats: { tools: number; writes: number; report?: LarkAutoRunReport },
        /** Quy tắc đang chạy: thư mục tệp, quyền khi chạy tự động, nguồn Lark… */
        rule: StoredAutomation,
      ) => Promise<string>;
      /** `ruleId` để mọi lần chạy của MỘT lịch gom vào MỘT hội thoại, thay vì đẻ một cái mới mỗi lần. */
      save?: (ruleId: string, ruleName: string, prompt: string, result: string) => Promise<void>;
      notify?: (title: string, body: string) => void;
    },
    /**
     * Tra công cụ theo tên. TIÊM VÀO chứ không import cứng `./tools`.
     *
     * Import cứng kéo theo `tools/index.ts`, mà file đó import `larkUi`/`cmsSync` → `larkWebSession`
     * → `electron`. Bản dựng cho VM (tw-lark-runner) vì thế lôi luôn cả electron vào bundle và chết
     * ngay lúc khởi động với một lỗi `__dirname is not defined` chẳng liên quan gì tới nguyên nhân.
     * Ai gọi thì tự đưa bộ tra phù hợp với môi trường của mình.
     */
    private readonly resolveTool?: (name: string) => { exec: (i: Record<string, unknown>, c: LarkClient) => Promise<unknown> } | undefined,
    /**
     * Chạy một BỘ KỸ NĂNG có hợp đồng rồi ghi kết quả về. Tuỳ chọn, cùng lý do với `agent`: bản
     * dựng cho VM không nhất thiết có đường ghi này, và thiếu nó thì quy tắc phải báo lỗi rõ ràng
     * chứ không phải im lặng coi như đã chạy.
     */
    private readonly skills?: {
      runSet: (
        skillId: string,
        seedFacts: Record<string, string | number | boolean | null>,
        opts: {
          writeBack?: 'target' | 'record' | 'none';
          writeMap?: Record<string, string>;
          record?: { appToken: string; tableId: string; recordId: string };
        },
      ) => Promise<{ summary: string; writes: number }>;
    },
    /**
     * Môi trường chạy. `env:'hosted'` (máy chạy hộ trên VM) BỎ QUA quy tắc `runOn:'desktop'` (cần phiên
     * Lark web / thư mục trên máy người dùng); app desktop thì chạy chúng KỂ CẢ khi không giữ quyền chạy
     * lịch (máy chạy hộ đã bỏ qua nên không thể chạy trùng). `canRunWithoutClient`: chưa kết nối custom
     * app vẫn chạy được việc "Chạy AI agent" theo giờ bằng phiên Lark web.
     */
    private readonly opts: { env?: 'desktop' | 'hosted'; canRunWithoutClient?: () => boolean } = {},
  ) {}

  /** Quy tắc chạy được KHÔNG cần custom app: lịch theo giờ chạy AI agent (công cụ phiên Lark web). */
  private static clientless(rule: StoredAutomation): boolean {
    return rule.triggerType === 'schedule' && rule.action?.type === 'run_agent';
  }

  private ensure(): StoredAutomation[] {
    if (!this.rules) {
      const loaded = this.load();
      const merged = dedupeSchedules(loaded);
      this.rules = merged;
      // Dọn ngay lần tải đầu: chống trùng ở `upsert` chỉ ngăn mục MỚI, còn những mục đã nhân bản
      // trước đó vẫn nằm đó và vẫn chạy song song — mỗi lần tới giờ là hai lượt agent và hai bản
      // báo cáo giống hệt nhau gửi vào nhóm. Người dùng không có cách nào biết mục nào là thật.
      if (merged.length !== loaded.length) this.persist(merged);
    }
    return this.rules;
  }
  private flush(): void {
    if (this.rules) this.persist(this.rules);
  }

  /** Begin the polling scheduler (idempotent). */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), MASTER_TICK_MS);
  }
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  list(): StoredAutomation[] {
    return this.ensure();
  }

  upsert(input: LarkAutomationInput): StoredAutomation[] {
    const list = this.ensure();
    const isSchedule = input.triggerType === 'schedule';
    const clean = {
      name: (input.name || '').trim() || 'Quy tắc',
      enabled: !!input.enabled,
      appToken: input.appToken,
      tableId: input.tableId,
      condition: input.condition && input.condition.field ? input.condition : undefined,
      action: input.action,
      intervalSec: Math.max(MIN_INTERVAL, Math.floor(Number(input.intervalSec) || 60)),
      fireExisting: !!input.fireExisting,
      triggerType: (isSchedule ? 'schedule' : 'record') as 'schedule' | 'record',
      schedule: isSchedule ? input.schedule : undefined,
      // Thư mục/nguồn tệp + quyền khi chạy tự động + nơi chạy. `permissions` chỉ ghi khi giao diện gửi lên
      // (không gửi = giữ nguyên, kể cả trạng thái "quy tắc cũ" — xem unattendedPolicy.effectivePerms).
      ...(input.files ? { files: input.files } : {}),
      ...(input.permissions ? { permissions: input.permissions } : {}),
      ...(input.runOn ? { runOn: input.runOn } : {}),
    };
    if (input.id) {
      const idx = list.findIndex((r) => r.id === input.id);
      if (idx < 0 && /^[A-Za-z0-9_-]{6,64}$/.test(input.id)) {
        // Id do giao diện sinh trước (để thêm tệp nguồn trước khi lưu lần đầu) — tạo mới với đúng id đó.
        list.push({ ...clean, id: input.id, seeded: clean.fireExisting, runCount: 0, createdAt: new Date().toISOString(), firedRecordIds: [] });
      }
      if (idx >= 0) {
        const prev = list[idx];
        // Changing the target table/condition invalidates the baseline → re-seed.
        const reseed =
          prev.appToken !== clean.appToken ||
          prev.tableId !== clean.tableId ||
          JSON.stringify(prev.condition ?? null) !== JSON.stringify(clean.condition ?? null);
        list[idx] = {
          ...prev,
          ...clean,
          id: prev.id,
          seeded: reseed ? clean.fireExisting : prev.seeded,
          firedRecordIds: reseed ? [] : prev.firedRecordIds,
        };
      }
    } else {
      // CHỐNG TRÙNG cho lịch chạy agent.
      //
      // Không có `id` thì trước đây LUÔN thêm mới, nên mỗi lần người dùng nhắc lại yêu cầu ("mỗi
      // ngày 9h chạy PBTTCN") — hoặc model gọi tool hai lần trong cùng một lượt — là một mục nữa
      // hiện ra ở trang Tự động hoá, chạy song song và gửi báo cáo trùng nhau. Người dùng không
      // có cách nào biết mục nào là mục thật.
      //
      // Chỉ áp cho rule 'schedule': rule theo bảng Base có thể trùng tên một cách hợp lệ (hai quy
      // tắc khác điều kiện trên cùng một bảng), còn hai lịch cùng nội dung + cùng nhịp thì không
      // bao giờ là chủ ý.
      const same =
        clean.triggerType === 'schedule'
          ? list.findIndex(
              (r) =>
                r.triggerType === 'schedule' &&
                r.action?.type === 'run_agent' &&
                clean.action?.type === 'run_agent' &&
                (r.action.prompt || '').trim() === (clean.action.prompt || '').trim() &&
                JSON.stringify(r.schedule ?? null) === JSON.stringify(clean.schedule ?? null),
            )
          : -1;
      if (same >= 0) {
        // Cập nhật tại chỗ và GIỮ NGUYÊN lastRunAt: nếu xoá đi thì lịch vừa "được tạo lại" sẽ
        // coi khung giờ hôm nay là chưa chạy và bắn thêm một lần nữa.
        list[same] = { ...list[same], ...clean, id: list[same].id };
      } else {
        list.push({
          ...clean,
          id: randomUUID(),
          // fireExisting → start "seeded" so the first run acts on current matches.
          seeded: clean.fireExisting,
          runCount: 0,
          createdAt: new Date().toISOString(),
          firedRecordIds: [],
        });
      }
    }
    this.flush();
    this.start();
    return list;
  }

  remove(id: string): StoredAutomation[] {
    this.rules = this.ensure().filter((r) => r.id !== id);
    this.flush();
    return this.rules;
  }

  setEnabled(id: string, on: boolean): StoredAutomation[] {
    const list = this.ensure();
    const r = list.find((x) => x.id === id);
    if (r) r.enabled = on;
    this.flush();
    this.start();
    return list;
  }

  private async tick(): Promise<void> {
    const client = this.getClient();
    const webOnly = !client && !!this.opts.canRunWithoutClient?.();
    if (!client && !webOnly) return;
    const env = this.opts.env ?? 'desktop';
    // CHỦ CHẠY LỊCH. Lịch có thể chạy ở hai nơi — máy này và một máy chạy nền (VM). Không hỏi
    // trước thì mỗi lịch chạy hai lần, và với lịch GHI dữ liệu đó là hai bản ghi trùng trong Base
    // thật của khách, lặp lại mỗi chu kỳ. Không trả lời được (mất mạng) thì CỨ CHẠY: thà trùng
    // một lúc còn hơn lịch của người dùng đứng im vì một lời gọi phụ hỏng.
    // Quy tắc 'desktop' thì máy chạy hộ luôn bỏ qua → app desktop chạy chúng kể cả khi không giữ quyền.
    const mine = !this.isRunner || (await this.isRunner()) !== false;
    const nowMs = Date.now();
    for (const rule of this.ensure()) {
      if (!rule.enabled || this.running.has(rule.id)) continue;
      const desktopOnly = rule.runOn === 'desktop';
      if (env === 'hosted' && desktopOnly) continue;
      if (!mine && !(env === 'desktop' && desktopOnly)) continue;
      if (webOnly && !AutomationEngine.clientless(rule)) continue;
      const due = rule.triggerType === 'schedule' ? this.scheduleDue(rule, nowMs) : this.recordDue(rule, nowMs);
      if (!due) continue;
      void this.execute(rule.id, client ?? undefined);
    }
  }

  /** Record-poll rules: due once the poll interval elapsed since the last run. */
  private recordDue(rule: StoredAutomation, nowMs: number): boolean {
    const dueMs = rule.lastRunAt ? Date.parse(rule.lastRunAt) + rule.intervalSec * 1000 : 0;
    return nowMs >= dueMs;
  }

  /** Time-schedule rules: interval = every intervalSec; daily = once at atHour:atMinute on an
   *  active weekday (catches up same-day if the app opened late; never fires twice for a slot). */
  private scheduleDue(rule: StoredAutomation, nowMs: number): boolean {
    const sch = rule.schedule;
    if (!sch) return false;
    // MỐC SÀN = lần chạy gần nhất, HOẶC lúc tạo rule nếu chưa chạy lần nào.
    //
    // Trước đây rule mới có lastRunAt rỗng ⇒ mốc = 0 ⇒ mọi khung giờ trong quá khứ đều "chưa
    // chạy". Hậu quả: người dùng nói "mỗi ngày 9h chạy PBTTCN" lúc 14h chiều thì rule chạy NGAY
    // LẬP TỨC — 9h sáng nay được coi là một khung bị lỡ, dù lúc 9h sáng rule còn chưa tồn tại.
    // Người dùng thấy app tự mở một hội thoại mới và tự hỏi lại chính câu vừa gõ.
    //
    // Lấy `createdAt` làm sàn sửa đúng chỗ đó mà KHÔNG phá ý đồ "bắt kịp khi app mở muộn": ca ấy
    // là rule CŨ (createdAt từ hôm trước, lastRunAt từ lần chạy trước), nên sàn vẫn nằm trước
    // khung hôm nay và nó vẫn chạy bù.
    const lastMs = rule.lastRunAt ? Date.parse(rule.lastRunAt) : 0;
    const bornMs = rule.createdAt ? Date.parse(rule.createdAt) : 0;
    const floorMs = Math.max(lastMs, bornMs);
    if (sch.mode === 'interval') {
      // Cùng lý do: rule "mỗi 2 tiếng" vừa tạo phải đợi đủ 2 tiếng, không chạy ngay khi bấm lưu.
      const iv = Math.max(MIN_INTERVAL, rule.intervalSec || 60) * 1000;
      return nowMs - floorMs >= iv;
    }
    const now = new Date(nowMs);
    const days = sch.days && sch.days.length ? sch.days : [0, 1, 2, 3, 4, 5, 6];
    if (!days.includes(now.getDay())) return false;
    const sched = new Date(now);
    sched.setHours(sch.atHour ?? 9, sch.atMinute ?? 0, 0, 0);
    const schedMs = sched.getTime();
    if (nowMs < schedMs) return false; // chưa tới khung giờ hôm nay
    if (floorMs >= schedMs) return false; // đã chạy khung này rồi, HOẶC rule sinh ra sau khung đó
    return true;
  }

  /**
   * Ghi một lần chạy vào lịch sử của quy tắc.
   *
   * `lastRunAt`/`runCount` chỉ nói được "lần cuối là khi nào" — không đủ để rà lại một lịch chạy
   * tự động không ai trông. Cái người dùng cần là: lần nào đã GHI, ghi bao nhiêu thao tác, và kết
   * quả ra sao. Giữ 20 lần gần nhất; cũ hơn thì rơi ra, vì một lịch chạy mỗi giờ suốt một năm mà
   * không cắt sẽ phình tệp cấu hình tới mức mở màn Tự động hoá là khựng.
   */
  private recordRun(rule: StoredAutomation, entry: LarkAutomationRun): void {
    rule.runs = [...(rule.runs ?? []), entry].slice(-20);
  }

  /** Run a rule once now (scheduler tick OR a manual "test" from the UI). */
  async execute(id: string, client?: LarkClient): Promise<LarkAutomationRunResult> {
    const list = this.ensure();
    const rule = list.find((r) => r.id === id);
    if (!rule) return { matched: 0, fired: 0, error: 'Không tìm thấy quy tắc.' };
    const c = client ?? this.getClient();
    // Chưa có custom app: chỉ việc "Chạy AI agent" theo giờ chạy được (bằng phiên Lark web).
    if (!c && !(AutomationEngine.clientless(rule) && this.opts.canRunWithoutClient?.())) {
      return {
        matched: 0,
        fired: 0,
        error: AutomationEngine.clientless(rule)
          ? 'Chưa đăng nhập Lark web (và chưa kết nối custom app) — mở khung Lark, đăng nhập rồi chạy lại.'
          : 'Chưa kết nối Lark (quy tắc theo bảng / gửi tin cần custom app).',
      };
    }
    if (this.running.has(id)) return { matched: 0, fired: 0, error: 'Quy tắc đang chạy.' };

    this.running.add(id);
    let matched = 0;
    let fired = 0;
    let error: string | undefined;
    const beganMs = Date.now();
    try {
      // Time-schedule rule: no Base record — just fire the action once with the static template.
      if (rule.triggerType === 'schedule') {
        await this.runAction(rule, { record_id: 'schedule', fields: {} }, c as LarkClient);
        matched = 1;
        fired = 1;
        rule.lastRunAt = new Date().toISOString();
        rule.lastError = undefined;
        rule.runCount = (rule.runCount ?? 0) + 1;
        this.flush();
        return { matched, fired };
      }
      const recs = await this.matchingRecords(rule, c as LarkClient);
      matched = recs.length;
      const firedSet = new Set(rule.firedRecordIds ?? []);
      if (!rule.seeded) {
        // Baseline pass: remember current matches, fire nothing.
        for (const r of recs) firedSet.add(r.record_id);
      } else {
        for (const r of recs) {
          if (firedSet.has(r.record_id)) continue;
          await this.runAction(rule, r, c as LarkClient);
          firedSet.add(r.record_id);
          fired++;
        }
      }
      const ids = [...firedSet];
      rule.seeded = true;
      rule.firedRecordIds = ids.length > MAX_FIRED_IDS ? ids.slice(ids.length - MAX_FIRED_IDS) : ids;
      rule.lastRunAt = new Date().toISOString();
      rule.lastError = undefined;
      rule.runCount = (rule.runCount ?? 0) + 1;
      this.flush();
    } catch (e) {
      error = (e as Error)?.message || 'Lỗi khi chạy quy tắc.';
      rule.lastRunAt = new Date().toISOString();
      rule.lastError = error;
      rule.runCount = (rule.runCount ?? 0) + 1;
      // Lần HỎNG cũng phải vào lịch sử — đó mới là lúc người ta mở ra xem. Ghi ở đây chứ không ở
      // runAction: lỗi có thể xảy ra trước khi runAction kịp chạy (mất kết nối Lark chẳng hạn).
      // (Nhánh "Chạy AI agent" đã tự ghi kèm biên bản thì không ghi lần hai.)
      if (!(e as { __recorded?: boolean })?.__recorded) {
        this.recordRun(rule, {
          at: new Date(beganMs).toISOString(),
          ms: Date.now() - beganMs,
          ok: false,
          summary: error.slice(0, 300),
        });
      }
      this.flush();
    } finally {
      this.running.delete(id);
    }
    return { matched, fired, error };
  }

  private async matchingRecords(rule: StoredAutomation, client: LarkClient): Promise<Rec[]> {
    const tool = this.resolveTool?.('bitable_search_records');
    if (!tool) throw new Error('Thiếu tool tìm bản ghi.');
    const res = (await tool.exec(
      {
        app_token: rule.appToken,
        table_id: rule.tableId,
        page_size: PAGE_SIZE,
        ...(rule.condition ? { filter: toFilter(rule.condition) } : {}),
      },
      client,
    )) as { items?: Rec[] };
    return Array.isArray(res.items) ? res.items : [];
  }

  private async runAction(rule: StoredAutomation, rec: Rec, client: LarkClient): Promise<void> {
    const a = rule.action;
    if (a.type === 'send_message') {
      const tool = this.resolveTool?.('messaging_send_message');
      if (!tool) throw new Error('Thiếu tool gửi tin nhắn.');
      await tool.exec(
        { receive_id_type: a.receiveIdType, receive_id: a.receiveId, text: render(a.text, rec.fields) },
        client,
      );
    } else if (a.type === 'update_record') {
      const tool = this.resolveTool?.('bitable_update_record');
      if (!tool) throw new Error('Thiếu tool cập nhật bản ghi.');
      await tool.exec(
        {
          app_token: rule.appToken,
          table_id: rule.tableId,
          record_id: rec.record_id,
          fields: { [a.field]: render(a.value, rec.fields) },
        },
        client,
      );
    } else if (a.type === 'webhook') {
      await fetch(a.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleId: rule.id, ruleName: rule.name, recordId: rec.record_id, fields: rec.fields }),
      });
    } else if (a.type === 'run_skill_set') {
      if (!this.skills?.runSet) throw new Error('Chức năng chạy bộ kỹ năng theo lịch chưa sẵn sàng.');
      // Dòng vừa kích hoạt → bảng khoá đầu vào. `fieldText` làm phẳng đúng như các việc làm khác
      // dùng, nên một ô người-liên-hệ hay ô nhiều lựa chọn không lọt vào dạng object mà hợp đồng
      // không đọc nổi. Ô rỗng bị bỏ: một khoá rỗng vẫn là "đã có khoá", và luật bỏ-qua-khoá-có-sẵn
      // sẽ nghĩ dữ liệu đã đủ rồi không chạy kỹ năng đáng ra phải chạy.
      const seed: Record<string, string | number | boolean | null> = {};
      for (const [column, key] of Object.entries(a.seedFrom ?? {})) {
        const v = fieldText(rec.fields[column]);
        if (v !== '') seed[key] = v;
      }
      const startedMs = Date.now();
      const r = await this.skills.runSet(a.skillId, seed, {
        writeBack: a.writeBack,
        writeMap: a.writeMap,
        // Lịch theo GIỜ không có dòng nào — `runSkillSetForAutomation` báo rõ điều đó thay vì ghi bừa.
        ...(rule.triggerType === 'schedule'
          ? {}
          : { record: { appToken: rule.appToken, tableId: rule.tableId, recordId: rec.record_id } }),
      });
      this.recordRun(rule, {
        at: new Date(startedMs).toISOString(),
        ms: Date.now() - startedMs,
        ok: true,
        mode: 'build',
        writes: r.writes,
        summary: r.summary.slice(0, 300),
      });
      if (a.postToChatId) {
        const tool = this.resolveTool?.('messaging_send_message');
        if (tool) {
          await tool.exec(
            { receive_id_type: 'chat_id', receive_id: a.postToChatId, text: `🧩 ${rule.name}\n\n${r.summary}`.slice(0, 9000) },
            client,
          );
        }
      }
      if (a.notify) this.agent?.notify?.(rule.name, r.summary.slice(0, 220));
    } else if (a.type === 'run_agent') {
      // Run the saved Lark-agent prompt on the owner's machine (Lark tools) → deliver the report.
      if (!this.agent?.run) throw new Error('Chức năng chạy agent theo lịch chưa sẵn sàng.');
      // MẶC ĐỊNH 'build': đặt một lịch là để nó LÀM việc đó, không phải để nó giải thích vì sao
      // không làm được. Lịch cũ (chưa có trường này) cũng lên thực thi — chúng vốn được đặt ra
      // với kỳ vọng ấy, và suốt thời gian qua chỉ chạy chỉ-đọc một cách im lặng.
      const runMode: 'ask' | 'build' = a.mode === 'ask' ? 'ask' : 'build';
      const stats: { tools: number; writes: number; report?: LarkAutoRunReport } = { tools: 0, writes: 0 };
      const startedMs = Date.now();
      let text: string;
      try {
        text = (await this.agent.run(a.prompt, runMode, stats, rule)) || '(agent không trả về nội dung)';
      } catch (e) {
        // Lần hỏng vẫn mang BIÊN BẢN (đã đọc gì, thao tác nào bị bỏ qua…) — đó là lúc người ta cần nó nhất.
        this.recordRun(rule, {
          at: new Date(startedMs).toISOString(),
          ms: Date.now() - startedMs,
          ok: false,
          mode: runMode,
          tools: stats.tools,
          writes: stats.writes,
          summary: String((e as Error)?.message || e).slice(0, 300),
          ...(stats.report ? { report: stats.report } : {}),
        });
        throw Object.assign(e instanceof Error ? e : new Error(String(e)), { __recorded: true });
      }
      this.recordRun(rule, {
        at: new Date(startedMs).toISOString(),
        ms: Date.now() - startedMs,
        ok: true,
        mode: runMode,
        tools: stats.tools,
        writes: stats.writes,
        summary: text.slice(0, 300),
        ...(stats.report ? { report: stats.report } : {}),
      });
      // Gửi báo cáo vào nhóm: người dùng đã đặt rõ nhóm nhận ở quy tắc (đó là sự cho phép gửi). Cần
      // custom app — chạy bằng phiên web (không có client) thì bỏ qua và ghi chú vào biên bản.
      if (a.postToChatId && client) {
        const tool = this.resolveTool?.('messaging_send_message');
        if (tool) {
          await tool.exec(
            { receive_id_type: 'chat_id', receive_id: a.postToChatId, text: `📋 ${rule.name}\n\n${text}`.slice(0, 9000) },
            client,
          );
        }
      } else if (a.postToChatId && stats.report) {
        stats.report.note = [stats.report.note, 'Chưa gửi báo cáo vào nhóm: cần kết nối custom app (Lark Bot).'].filter(Boolean).join(' ');
      }
      if (a.saveConversation) await this.agent.save?.(rule.id, rule.name, a.prompt, text);
      if (a.notify) this.agent.notify?.(rule.name, text.slice(0, 220));
    }
  }
}
