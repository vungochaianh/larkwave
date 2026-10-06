import {
  HttpException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { laKetCucRun } from './ket-cuc-run';

/**
 * Who this call is on behalf of. Larkwave is a MAIC *reseller*: MAIC meters and
 * caps per end user, so it needs a stable id for the person the turn belongs to.
 * We send our own `User.id` — never an email or a real name, since MAIC only
 * needs an opaque handle and a leak of one should reveal nothing.
 */
export interface MaicEndUserRef {
  id: string;
  /** Optional display label for the MAIC operator console. Not required. */
  label?: string;
  /** Our plan id ('free' | 'starter' | 'pro' | 'enterprise'), shown in that console. */
  plan?: string;
}

/** POST /v1/ask input — one-shot Q&A (no tools/files). */
export interface MaicAskInput {
  /** Attribute + cap this turn against a Larkwave user. Omit only for system calls. */
  endUser?: MaicEndUserRef;
  prompt: string;
  model?: string;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  systemPrompt?: string;
  /** When set, the real result comes back in `structured` (NOT `answer`). */
  jsonSchema?: unknown;
  /** Resend the prior turn's sessionId to continue a conversation (MAIC is stateless). */
  sessionId?: string;
  timeoutSec?: number;
}

export interface MaicAskResult {
  answer: string;
  sessionId: string;
  costUsd: number;
  durationMs: number;
  runId: string;
  /** Real token usage (MAIC returns these on /v1/ask now) — meter by these, not by costUsd. */
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  /** Present only when the request sent a jsonSchema. */
  structured?: unknown;
}

export interface MaicUsageResult {
  available: boolean;
  state?: string;
  mode?: string;
  message?: string;
  /** Real Claude-subscription rate-limit signal (present once ≥1 run happened). */
  rateLimit?: { status?: string; type?: string; resetsAt?: string; isUsingOverage?: boolean };
}

/** A file seeded into a `/v1/runs` workspace. `encoding:'base64'` for binary. */
export interface MaicRunFile {
  path: string;
  content: string;
  encoding?: 'base64';
}

export interface MaicRunInput {
  /** Attribute + cap this run against a Larkwave user. Omit only for system calls. */
  endUser?: MaicEndUserRef;
  prompt: string;
  /** Seed the ephemeral workspace with these files (attachments + skill assets). */
  files?: MaicRunFile[];
  /** Advanced: pass a raw workspace object (tarballBase64 / git) instead of inline files. */
  workspace?: unknown;
  model?: string;
  permissionMode?: 'plan' | 'acceptEdits' | 'bypassPermissions';
  timeoutSec?: number;
  returnFiles?: 'changed' | 'all' | 'none';
}

/** One normalized SSE event line from a run (shape varies by `type`). */
export interface MaicRunEvent {
  type: string;
  [k: string]: unknown;
}

export interface MaicRunResult {
  runId: string;
  status: string; // succeeded | failed | timeout | cancelled | interrupted
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  error?: string;
  /**
   * Tệp trong workspace sau khi agent chạy. `encoding: 'base64'` khi nội dung KHÔNG phải UTF-8
   * hợp lệ (xlsx, pdf, png…) — người dùng phải giải mã trước khi ghi ra đĩa. Không có trường đó
   * thì `content` là chữ thường, dùng thẳng.
   */
  files: { path: string; content: string; encoding?: 'base64' }[];
}

/**
 * Server-only client for MAIC — the Larkwave-hosted "Claude Code over HTTP" gateway.
 * The MAIC_TOKEN lives ONLY here (apps/api env); it is never returned to the web/desktop
 * client and never logged. Every agent surface that wants CLI-less Claude routes through
 * this service. Retries ONLY on 429/network (honoring Retry-After) — any other 4xx is a
 * request bug and retrying just burns the shared quota.
 */
@Injectable()
export class MaicService implements OnModuleInit {
  private readonly logger = new Logger(MaicService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Khi API khởi động, mọi lượt chạy MAIC còn "mở" trong sổ đều là MỒ CÔI: tiến trình giữ chúng
   * đã chết (deploy giữa chừng, crash), không còn ai đọc kết quả — nhưng trên MAIC chúng vẫn chạy
   * tới hết và vẫn đốt hạn ngạch dùng chung. Huỷ hết.
   *
   * Chỉ đúng khi API chạy MỘT tiến trình duy nhất (ci-deploy.sh bảo đảm; cùng lý do với bộ hẹn giờ
   * chạy trong tiến trình). Nếu sau này chạy nhiều instance, chỗ này phải đổi sang lọc theo instance.
   */
  async onModuleInit(): Promise<void> {
    if (!this.enabled) return;
    try {
      const open = await this.prisma.maicRun.findMany({ where: { closedAt: null } });
      for (const r of open) {
        await this.cancelRun(r.id, 'Máy chủ Larkwave khởi động lại — lượt chạy mất chủ');
        await this.closeRun(r.id);
      }
      if (open.length) {
        // Ghi rõ ĐÂY LÀ VIỆC ĐANG CHẠY BỊ GIẾT, không phải rác. Trước đây log gọi chúng là "mồ
        // côi" nên mỗi lần deploy đè lên một build thật, dòng log lại trông như dọn dẹp bình
        // thường — không ai đi tìm nguyên nhân nữa. Cổng chặn trong ci-deploy.sh sinh ra để con
        // số này về 0; nếu nó khác 0 thì cổng đã bị bỏ qua (DEPLOY_FORCE) hoặc máy chủ tự chết.
        this.logger.warn(
          `Khởi động lại đã GIẾT ${open.length} lượt chạy MAIC đang dở (${open.map((r) => `${r.id}:${r.kind}`).join(', ')})`,
        );
      }
    } catch (e) {
      this.logger.error(`dọn lượt chạy MAIC mồ côi thất bại: ${String(e)}`);
    }
  }

  /** Ghi sổ một lượt chạy vừa mở. Lỗi ghi sổ KHÔNG được làm hỏng lượt chạy. */
  private async openRun(runId: string, kind: string, userId?: string): Promise<void> {
    await this.prisma.maicRun
      .create({ data: { id: runId, kind, userId: userId ?? null } })
      .catch(() => undefined);
  }

  /** Đóng sổ: lượt chạy đã kết thúc (thành công, lỗi hay đã huỷ đều như nhau). */
  private async closeRun(runId: string): Promise<void> {
    await this.prisma.maicRun
      .update({ where: { id: runId }, data: { closedAt: new Date() } })
      .catch(() => undefined);
  }

  /** Live only when BOTH the gateway URL and token are configured. */
  get enabled(): boolean {
    return !!(this.config.env.MAIC_URL && this.config.env.MAIC_TOKEN);
  }

  private get base(): string {
    return this.config.env.MAIC_URL.replace(/\/+$/, '');
  }

  /**
   * Turn MAIC's per-end-user refusals into OUR error contract.
   *
   * MAIC caps each Larkwave user independently (see MaicAdminService). Left raw, those
   * refusals surface as `Error: MAIC ask 402: {...}` → a 500 with gateway internals in the
   * message. The web and desktop UIs already know how to handle a Larkwave 402 (they route
   * to /pricing), so translating here lights that path up on both surfaces at once.
   *
   * Returns `null` when the response is not one of these, leaving the caller's own handling.
   */
  private resellerError(status: number, text: string): HttpException | null {
    let code = '';
    try {
      code = String((JSON.parse(text) as { error?: string }).error || '');
    } catch {
      return null;
    }
    if (code === 'end_user_quota_exceeded') {
      return new HttpException(
        {
          message: 'Bạn đã dùng hết hạn mức gói tháng này. Nâng gói để tiếp tục dùng AI.',
          code: 'QUOTA_EXCEEDED',
          percentUsed: 100,
        },
        402,
      );
    }
    if (code === 'end_user_blocked') {
      return new HttpException(
        {
          message: 'Tài khoản của bạn đang bị tạm khoá dùng AI. Liên hệ hỗ trợ để mở lại.',
          code: 'ACCOUNT_BLOCKED',
        },
        403,
      );
    }
    if (code === 'end_user_too_many_runs') {
      return new HttpException(
        {
          message: 'Bạn đang chạy quá nhiều lượt cùng lúc. Đợi một lượt xong rồi thử lại.',
          code: 'TOO_MANY_RUNS',
        },
        429,
      );
    }
    // Token của ta chưa được bật vai trò đại lý bên MAIC. Đây là lỗi cấu hình của
    // CHÚNG TA, không phải của người dùng — nói rõ để người trực biết phải làm gì.
    if (code === 'not_reseller') {
      this.logger.error(
        'MAIC từ chối trường endUser: token Larkwave chưa được nâng vai trò đại lý. '
        + 'Vào màn quản trị MAIC → Token → "Nâng thành đại lý".',
      );
      return null;
    }
    return null;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.env.MAIC_TOKEN}`,
      'content-type': 'application/json',
    };
  }

  /** GET /v1/usage — gateway health preflight. available=false ⇒ stop sending. NOTE: this
   *  is keyed to the ONE shared MAIC token (a GLOBAL pool), so it says the gateway is up —
   *  NOT whether a given user has budget. Per-user gating comes from the % model. */
  async usage(signal?: AbortSignal): Promise<MaicUsageResult> {
    const r = await fetch(`${this.base}/v1/usage`, { headers: this.headers(), signal });
    if (!r.ok) throw new Error(`MAIC usage ${r.status}`);
    return (await r.json()) as MaicUsageResult;
  }

  /**
   * fetch CÓ THỬ LẠI, chỉ cho lỗi tầng kết nối.
   *
   * "fetch failed" của Node là lỗi mạng thô: DNS chớp, kết nối bị đóng, MAIC vừa khởi động lại.
   * Nó hầu như luôn hết sau một hai giây — nhưng trước đây nó giết cả một lượt dựng app: đo ngày
   * 23/09/2026, bước "Sinh code" chết ngay giây đầu với đúng hai chữ "fetch failed", người dùng
   * mất toàn bộ tiến trình và không có nút nào để bấm.
   *
   * CHỈ thử lại khi `fetch` NÉM, tức chưa có phản hồi nào: lúc đó chắc chắn chưa đọc byte nào của
   * luồng, nên gọi lại là an toàn. Đã nhận được phản hồi rồi (kể cả 5xx) thì để người gọi quyết —
   * thử lại một lượt đã chạy dở có thể tính tiền hai lần.
   *
   * KHÔNG BAO GIỜ thử lại khi người dùng bấm huỷ (AbortError) — đó là ý muốn của họ, không phải lỗi.
   */
  private async fetchThuLai(
    url: string,
    init: RequestInit,
    signal?: AbortSignal,
    soLuot = 3,
  ): Promise<Response> {
    for (let luot = 1; ; luot += 1) {
      try {
        return await fetch(url, init);
      } catch (e) {
        const err = e as Error;
        if (err?.name === 'AbortError' || signal?.aborted || luot >= soLuot) throw err;
        await this.sleep(luot * 1000, signal);
      }
    }
  }

  /** POST /v1/ask — one-shot Q&A. Multi-turn = pass the prior sessionId. */
  async ask(input: MaicAskInput, signal?: AbortSignal): Promise<MaicAskResult> {
    const body = JSON.stringify(input);
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let res: Response;
      try {
        res = await fetch(`${this.base}/v1/ask`, {
          method: 'POST',
          headers: this.headers(),
          body,
          signal,
        });
      } catch (e) {
        // Network error / abort. Retry network errors; never retry an abort.
        if ((e as Error)?.name === 'AbortError' || attempt >= maxAttempts) throw e;
        await this.sleep(attempt * 1000, signal);
        continue;
      }
      if (res.status === 402 || res.status === 403 || res.status === 429) {
        // Per-end-user refusals are decided, not transient: retrying just delays the
        // message the user needs to see. Check before the generic 429 backoff below.
        const peek = await res.clone().text().catch(() => '');
        const mapped = this.resellerError(res.status, peek);
        if (mapped) throw mapped;
      }
      if (res.status === 429) {
        // Rate limited — respect Retry-After, then retry.
        if (attempt >= maxAttempts) throw new Error('MAIC 429 (đang quá tải, thử lại sau)');
        const retryAfter = Number(res.headers.get('retry-after')) || attempt * 2;
        await this.sleep(retryAfter * 1000, signal);
        continue;
      }
      if (!res.ok) {
        // Any other non-2xx = request/server error — do NOT retry (would just burn quota).
        const text = await res.text().catch(() => '');
        throw new Error(`MAIC ask ${res.status}: ${text.slice(0, 300)}`);
      }
      return (await res.json()) as MaicAskResult;
    }
    throw new Error('MAIC ask failed');
  }

  /**
   * Streaming variant of ask(): POST /v1/ask with `stream:true` + Accept: text/event-stream and
   * emit incremental text via `onDelta`. FORWARD-COMPATIBLE: if the gateway doesn't stream yet (it
   * returns normal JSON instead of an event-stream), the whole answer is delivered as one delta —
   * so this is safe to ship NOW and lights up automatically once MAIC adds SSE streaming.
   *
   * Expected SSE line shape (see docs/maic-upgrade-request.md): `data: {json}` where json is
   *  - { type:'delta', text }      incremental token chunk
   *  - { type:'done', sessionId, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, costUsd, runId, durationMs }
   *  - { type:'error', message }
   */
  async askStream(
    input: MaicAskInput,
    onDelta: (text: string) => void | Promise<void>,
    signal?: AbortSignal,
  ): Promise<MaicAskResult> {
    const res = await this.fetchThuLai(`${this.base}/v1/ask`, {
      method: 'POST',
      headers: { ...this.headers(), Accept: 'text/event-stream' },
      body: JSON.stringify({ ...input, stream: true }),
      signal,
    }, signal);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const mapped = this.resellerError(res.status, text);
      if (mapped) throw mapped;
      throw new Error(`MAIC ask(stream) ${res.status}: ${text.slice(0, 300)}`);
    }
    const ctype = res.headers.get('content-type') || '';
    // Fallback: gateway ignored stream:true (no streaming yet) → one-shot JSON, deliver as one delta.
    if (!ctype.includes('text/event-stream') || !res.body) {
      const r = (await res.json()) as MaicAskResult;
      if (r.answer) await onDelta(r.answer);
      return r;
    }
    // Parse SSE (`data: {json}` events separated by blank lines).
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let answer = '';
    let terminal: Record<string, unknown> = {};
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buf.indexOf('\n\n')) !== -1) {
        const frame = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        const dataLine = frame.split('\n').find((l) => l.startsWith('data:'));
        if (!dataLine) continue;
        const json = dataLine.slice(5).trim();
        if (!json || json === '[DONE]') continue;
        let ev: Record<string, unknown>;
        try {
          ev = JSON.parse(json) as Record<string, unknown>;
        } catch {
          continue;
        }
        const t = ev.type;
        if (t === 'delta' || t === 'text') {
          const piece = (ev.text ?? ev.delta ?? '') as string;
          if (piece) {
            answer += piece;
            await onDelta(piece);
          }
        } else if (t === 'done' || t === 'finished') {
          terminal = ev;
        } else if (t === 'error') {
          throw new Error((ev.message as string) || 'MAIC stream error');
        }
      }
    }
    return {
      answer: (terminal.answer as string) || answer,
      sessionId: (terminal.sessionId as string) || '',
      costUsd: (terminal.costUsd as number) ?? 0,
      durationMs: (terminal.durationMs as number) ?? 0,
      runId: (terminal.runId as string) || '',
      inputTokens: terminal.inputTokens as number | undefined,
      outputTokens: terminal.outputTokens as number | undefined,
      cacheReadTokens: terminal.cacheReadTokens as number | undefined,
      cacheCreationTokens: terminal.cacheCreationTokens as number | undefined,
    };
  }

  // ── /v1/runs — agent làm việc trong workspace tạm (chat có tệp đính kèm) ─────────────────────────

  /** One file seeded into a run's workspace. */
  private static toRunFiles(files: MaicRunFile[]): MaicRunFile[] {
    return files.map((f) => ({ path: f.path, content: f.content, ...(f.encoding ? { encoding: f.encoding } : {}) }));
  }

  /**
   * Run an agentic turn: seed an EPHEMERAL workspace with `files`, let the MAIC agent work (read /
   * run scripts / produce files), stream progress via `onEvent`, then fetch the final files back.
   * No pre-created project needed. Returns status + real token usage + the resulting files.
   */
  async runAgent(
    input: MaicRunInput,
    opts: {
      onEvent?: (e: MaicRunEvent) => void;
      signal?: AbortSignal;
      /** Gọi ngay khi biết runId — để người gọi LƯU lại, còn huỷ được sau khi máy chủ khởi động lại. */
      onStart?: (runId: string) => void;
      /** Bề mặt gọi, chỉ để đọc log sau này (vd. agent). */
      kind?: string;
    } = {},
  ): Promise<MaicRunResult> {
    // 0) Preflight the shared Claude quota (per the MAIC operator's guidance): fail fast with a
    //    clear message instead of starting a run that dies mid-way when the 5-hour window is spent.
    const u = await this.usage(opts.signal).catch(() => null);
    if (u && u.available === false) {
      const why = u.rateLimit?.status || u.state || 'rate_limited';
      // Nói đúng, và KHÔNG hứa quá.
      //
      // Hai lần sai liên tiếp ở đúng câu này, đáng ghi lại:
      //  1. Bản đầu luôn kết bằng "thử lại sau ít phút" kèm một dấu thời gian ISO thô. Trên ca
      //     thật đầu tiên dấu thời gian đó cách 5 NGÀY, nên người dùng bấm lại suốt tuần.
      //  2. Bản sửa đổi sang "mở lại vào <ngày>, thử lại sớm hơn sẽ vẫn báo lỗi này" — cũng SAI,
      //     theo chiều ngược lại. `resetsAt` của `type: 'seven_day'` là mốc đặt lại CỬA SỔ TUẦN,
      //     không phải mốc gỡ chặn. Đo thật: ngay sau một build chết vì lý do này, /v1/usage trả
      //     `available: true, status: 'allowed_warning'` — tức vẫn dùng được. Câu "chờ tới ngày
      //     đó" sẽ khiến người dùng bỏ cuộc trong khi họ bấm lại là chạy.
      //
      // Nên: mốc cửa sổ chỉ được nêu như THÔNG TIN, còn lời khuyên luôn là thử lại sau ít phút.
      const retry = ((): string => {
        const at = u.rateLimit?.resetsAt ? new Date(u.rateLimit.resetsAt) : null;
        if (!at || Number.isNaN(at.getTime())) return 'Hãy thử lại sau vài phút.';
        const mins = Math.round((at.getTime() - Date.now()) / 60_000);
        const when = at.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        if (mins <= 0) return 'Hãy thử lại ngay bây giờ.';
        if (mins < 90) return `Cửa sổ hạn mức đặt lại sau khoảng ${mins} phút (${when}) — thử lại sau ít phút.`;
        return `Hãy thử lại sau vài phút — thường là dùng lại được ngay. (Cửa sổ hạn mức đặt lại vào ${when}.)`;
      })();
      const reset = '';
      // 503 chứ KHÔNG phải Error thường: một Error trần biến thành "500 Internal server error" ở
      // đường đồng bộ, tức người dùng nhận một lỗi hệ thống vô nghĩa cho một tình huống hoàn toàn
      // bình thường và có thể chờ được. ServiceUnavailableException giữ nguyên câu tiếng Việt và
      // được người gọi coi là "thử lại được".
      throw new ServiceUnavailableException(
        `Trợ lý AI đang hết lượt dùng chung (${why})${reset}. Đây KHÔNG phải lỗi tài khoản của bạn. ${retry}`,
      );
    }
    // 1) Start the run (workspace = inline files).
    const started = await this.startRun(input, opts.signal);
    const runId = started.runId;
    opts.onStart?.(runId);
    await this.openRun(runId, opts.kind ?? 'agent', input.endUser?.id);
    // 2) Stream events until maic.finished; capture the terminal event.
    //
    // Huỷ phía Larkwave (abort signal) chỉ CẮT luồng sự kiện — lượt chạy trên MAIC vẫn tiếp tục
    // tới hết và vẫn đốt hạn ngạch dùng chung. `cancelRun` đã có sẵn nhưng trước đây KHÔNG ai gọi.
    // Nay mọi đường thoát bất thường đều đi qua đây và huỷ thật lượt chạy từ xa.
    let finished: MaicRunEvent | null = null;
    try {
      await this.streamRunEvents(runId, (ev) => {
        opts.onEvent?.(ev);
        if (ev.type === 'maic.finished') finished = ev;
      }, opts.signal);
    } catch (e) {
      // LUỒNG ĐỨT KHÔNG CÓ NGHĨA LƯỢT CHẠY ĐÃ CHẾT — phải HỎI MAIC trước khi tuyên bố thất bại.
      //
      // "terminated" không phải trạng thái của MAIC. Nó là message nguyên văn của undici khi thân
      // phản hồi bị cắt giữa chừng (`TypeError: terminated`) — tức một lỗi Ở PHÍA CHÚNG TA ĐỌC,
      // được báo cho người dùng như thể là kết cục của lượt chạy.
      //
      // Đo ngày 23/09/2026, một tài khoản thực, hai build cuối của một bộ site:
      //
      //   ta ghi:   error "terminated", usage 0 token, không mời "Thử lại"
      //   MAIC ghi: status `interrupted`, "Tiến trình maic-api khởi động lại khi lượt chạy chưa xong"
      //
      // Câu của MAIC nói đúng chuyện gì đã xảy ra và là lỗi TẠM THỜI; câu của ta thì vô nghĩa và
      // bị đóng dấu vĩnh viễn. Chúng ta không bao giờ đọc tại câu đó, vì đã ném lỗi trước khi kịp
      // hỏi. MAIC chạy trong Docker và được tạo lại ba lần trong hai ngày đó; mỗi lần như vậy mọi
      // SSE đang mở đều rụng. (Phía MAIC nay có cổng chặn `cho-luot-chay-xong.sh` để không tạo lại
      // container khi còn lượt đang bay.)
      //
      // CẢNH BÁO CHO NGƯỜI ĐỌC SAU: bản đầu của chú thích này ghi rằng MAIC trả `succeeded` cho
      // chính hai lượt đó, kèm 51404 và 44801 token và $5.45 "đã đốt rồi bị ném đi". SAI. Hai
      // lượt `succeeded` đó thuộc hai build THÀNH CÔNG khác của cùng bộ (mặt api và mặt site, đã
      // được đo đúng vào hạn mức: quotaUsed = 54136 + 47473 = 101609, khớp từng token). Phép nối
      // run↔build theo cửa sổ thời gian ±25 phút đã gắn sai. Muốn biết lượt nào thuộc build nào
      // thì so `Build.usage` với usage của run, hoặc so mốc đóng/mở, đừng suy từ khoảng thời gian.
      //
      // Hai cái sai được sửa ở đây: kể đúng lý do MAIC đưa ra thay vì message của undici, và không
      // huỷ một lượt đã xong. Thêm một khả năng: nếu MAIC thật sự trả `succeeded` sau khi luồng
      // đứt, ta LẤY ĐƯỢC file thay vì ném bỏ — ca đó chưa đo được lần nào, nhưng nó rất rẻ.
      //
      // Người dùng tự huỷ thì KHÔNG cứu: họ vừa dừng, cứu về là làm ngược ý họ.
      if (!finished && !opts.signal?.aborted) {
        // Nói ra, chặng để màn hình đứng im: chờ ở đây có thể tới hàng chục phút, mà luồng đã đứt
        // nên không còn sự kiện nào khác chạy qua nữa.
        opts.onEvent?.({ type: 'maic.reconnecting', runId });
        const ketCuc = await this.doiKetCucCuaRun(runId, opts.signal);
        if (ketCuc) finished = { type: 'maic.finished', ...ketCuc } as MaicRunEvent;
      }
      if (!finished) {
        await this.cancelRun(runId);
        await this.closeRun(runId);
        throw e;
      }
    }
    // Luồng có thể kết thúc "bình thường" ngay sau khi abort mà không ném lỗi.
    if (opts.signal?.aborted && !finished) await this.cancelRun(runId);
    await this.closeRun(runId);
    // 3) Resolve terminal status/tokens (prefer the finished event; fall back to a status poll).
    let fin = finished as MaicRunEvent | null;
    if (!fin) {
      const r = await this.getRun(runId).catch(() => null);
      fin = r ? ({ type: 'maic.finished', ...r } as MaicRunEvent) : null;
    }
    const status = String((fin?.status as string) || 'failed');
    const result: MaicRunResult = {
      runId,
      status,
      inputTokens: typeof fin?.inputTokens === 'number' ? (fin.inputTokens as number) : undefined,
      outputTokens: typeof fin?.outputTokens === 'number' ? (fin.outputTokens as number) : undefined,
      costUsd: typeof fin?.costUsd === 'number' ? (fin.costUsd as number) : undefined,
      error: typeof fin?.error === 'string' ? (fin.error as string) : undefined,
      files: [],
    };
    // 4) On success, fetch the resulting files (unless the caller asked for none).
    if (status === 'succeeded' && input.returnFiles !== 'none') {
      result.files = await this.fetchRunFiles(runId, opts.signal);
    }
    return result;
  }

  /** POST /v1/runs with an inline-files workspace → { runId, streamUrl, filesUrl, archiveUrl }. */
  async startRun(
    input: MaicRunInput,
    signal?: AbortSignal,
  ): Promise<{ runId: string; streamUrl: string; filesUrl: string; archiveUrl: string }> {
    const body = JSON.stringify({
      prompt: input.prompt,
      workspace: input.files ? { files: MaicService.toRunFiles(input.files) } : input.workspace,
      model: input.model,
      permissionMode: input.permissionMode ?? 'bypassPermissions',
      returnFiles: input.returnFiles ?? 'all',
      timeoutSec: input.timeoutSec ?? 1200,
      endUser: input.endUser,
    });
    // Khởi chạy: chưa có gì xảy ra ở phía MAIC nên một lỗi mạng ở đây thử lại được vô hại.
    const res = await this.fetchThuLai(`${this.base}/v1/runs`, { method: 'POST', headers: this.headers(), body, signal }, signal);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const mapped = this.resellerError(res.status, text);
      if (mapped) throw mapped;
      throw new Error(`MAIC runs ${res.status}: ${text.slice(0, 300)}`);
    }
    const j = (await res.json()) as { run?: { id?: string }; streamUrl?: string; filesUrl?: string; archiveUrl?: string };
    const runId = j.run?.id;
    if (!runId) throw new Error('MAIC runs: thiếu run.id trong phản hồi');
    return {
      runId,
      streamUrl: j.streamUrl ?? `/v1/runs/${runId}/events`,
      filesUrl: j.filesUrl ?? `/v1/runs/${runId}/files`,
      archiveUrl: j.archiveUrl ?? `/v1/runs/${runId}/archive`,
    };
  }

  /** Consume the run's SSE (`data: <JSON>` per line) → call onEvent per event. Returns when the
   *  stream closes (MAIC closes it on terminal state, so this doesn't hang). */
  async streamRunEvents(runId: string, onEvent: (e: MaicRunEvent) => void, signal?: AbortSignal): Promise<void> {
    // Mở luồng: lượt này chưa đọc byte nào nên mở lại được. Lỗi GIỮA luồng thì không đi qua đây —
    // runAgent bắt và hỏi trạng thái run bằng getRun(), đúng cách vì lượt chạy vẫn sống ở MAIC.
    const res = await this.fetchThuLai(
      `${this.base}/v1/runs/${encodeURIComponent(runId)}/events`,
      { headers: this.headers(), signal },
      signal,
    );
    if (!res.ok || !res.body) throw new Error(`MAIC run events ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const json = trimmed.slice(5).trim();
        if (!json) continue;
        try {
          onEvent(JSON.parse(json) as MaicRunEvent);
        } catch {
          /* ignore a non-JSON keep-alive line */
        }
      }
    }
  }

  /** GET /v1/runs/:id — poll terminal status + token usage. */
  async getRun(runId: string): Promise<{ status: string; inputTokens?: number; outputTokens?: number; costUsd?: number; error?: string }> {
    const res = await fetch(`${this.base}/v1/runs/${encodeURIComponent(runId)}`, { headers: this.headers() });
    if (!res.ok) throw new Error(`MAIC get run ${res.status}`);
    const j = (await res.json()) as { run?: Record<string, unknown> } & Record<string, unknown>;
    const r = (j.run ?? j) as Record<string, unknown>;
    return {
      status: String(r.status ?? 'failed'),
      inputTokens: typeof r.inputTokens === 'number' ? r.inputTokens : undefined,
      outputTokens: typeof r.outputTokens === 'number' ? r.outputTokens : undefined,
      costUsd: typeof r.costUsd === 'number' ? r.costUsd : undefined,
      error: typeof r.error === 'string' ? r.error : undefined,
    };
  }

  /** GET /v1/runs/:id/files (list) then fetch each file's raw content. Skips deleted entries. */
  async fetchRunFiles(
    runId: string,
    signal?: AbortSignal,
  ): Promise<{ path: string; content: string; encoding?: 'base64' }[]> {
    const listRes = await fetch(`${this.base}/v1/runs/${encodeURIComponent(runId)}/files`, {
      headers: this.headers(),
      signal,
    });
    if (!listRes.ok) throw new Error(`MAIC run files ${listRes.status}`);
    const list = (await listRes.json()) as { files?: { path: string }[] };
    const paths = (list.files ?? []).map((f) => f.path).filter(Boolean);
    const out: { path: string; content: string; encoding?: 'base64' }[] = [];
    for (const p of paths) {
      const r = await fetch(
        `${this.base}/v1/runs/${encodeURIComponent(runId)}/files?path=${encodeURIComponent(p)}`,
        { headers: this.headers(), signal },
      );
      if (!r.ok) continue; // lỗi HTTP cho MỘT tệp không được làm hỏng cả lượt chạy
      // ĐỌC BYTE, KHÔNG ĐỌC CHỮ.
      //
      // MAIC phục vụ nguyên byte (`application/octet-stream` + `createReadStream`). `r.text()`
      // giải mã chúng theo UTF-8, nên mọi chuỗi byte không hợp lệ UTF-8 bị thay bằng U+FFFD:
      // một .xlsx/.pdf/.png về tới đây là đã hỏng KHÔNG THỂ CỨU. Đo được hồi đó: tệp thật 3614
      // byte, về tới nơi 4509–6025 byte, ZIP hỏng ở central directory.
      //
      // Hỏng là do DÒNG MÃ NÀY, không phải do MAIC. Cả cơ chế tệp phụ ".b64" — bắt model tự ghi
      // thêm bản base64 của tệp nó vừa tạo — từng được dựng lên chỉ để đi vòng qua chỗ này.
      const buf = Buffer.from(await r.arrayBuffer());
      const text = buf.toString('utf8');
      // Vòng ngược khớp TỪNG BYTE mới là UTF-8 hợp lệ. Đây là phép kiểm chính xác, không phải
      // đoán theo đuôi tệp: chữ thì đi nguyên như cũ, còn lại mới bọc base64.
      const laChu = !buf.includes(0) && Buffer.from(text, 'utf8').equals(buf);
      out.push(
        laChu
          ? { path: p, content: text }
          : { path: p, content: buf.toString('base64'), encoding: 'base64' as const },
      );
    }
    return out;
  }

  /**
   * `POST /v1/agent` — lượt chạy có CÔNG CỤ DO CLIENT THỰC THI (SSE).
   *
   * Khác `/v1/ask` ở chỗ quyết định: model gọi tool nào thì MAIC dừng lại và hỏi ngược về đây;
   * công cụ chạy trên máy người dùng, MAIC chỉ chuyển tiếp. Nhờ vậy bí mật Lark (App Secret,
   * token cá nhân) không bao giờ rời khỏi máy họ — MAIC không có mã thực thi cho tool của ta.
   *
   * Vì sao dùng nó thay cho vòng lặp tự chế trên `/v1/ask` + jsonSchema: đo thật cùng một tác vụ
   * ba bước — vòng lặp tự chế mất 52,7 giây và $0,0675 mà MỚI CHỈ quyết định, chưa thực thi gì;
   * còn đường này mất 14,4 giây và $0,0397 cho cả ba bước KỂ CẢ hai lần ghi. Lý do là cả tác vụ
   * nằm trong MỘT tiến trình nên không phải gửi lại bối cảnh mỗi bước.
   *
   * Trả về `Response` thô để nơi gọi tự đọc SSE — không gói lại, vì giữa chừng MAIC còn hỏi ngược.
   */
  async agentStream(body: {
    prompt: string;
    tools: { name: string; description?: string; inputSchema: object }[];
    endUser?: MaicEndUserRef;
    model?: string;
    sessionId?: string;
    toolTimeoutSec?: number;
    timeoutSec?: number;
  }, signal?: AbortSignal): Promise<Response> {
    // `signal` KHÔNG phải tuỳ chọn cho vui: MAIC huỷ lượt chạy khi SSE của nó đóng
    // (`reply.raw.on('close')` trong /v1/agent). Người gọi không cắt kết nối này thì lượt chạy
    // bên đó sống tới hết trần thời gian dù chẳng còn ai nghe.
    return fetch(`${this.base}/v1/agent`, {
      method: 'POST',
      headers: { ...this.headers(), Accept: 'text/event-stream' },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
  }

  /** `POST /v1/runs/:id/tool-result` — trả kết quả một lời gọi công cụ về cho lượt chạy đang chờ. */
  async toolResult(
    runId: string,
    payload: { toolUseId: string; content: string; isError?: boolean },
  ): Promise<{ ok: boolean; status: number; body: string }> {
    const r = await fetch(`${this.base}/v1/runs/${encodeURIComponent(runId)}/tool-result`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
    return { ok: r.ok, status: r.status, body: await r.text().catch(() => '') };
  }

  /**
   * POST /v1/runs/:id/cancel — stop a run (best-effort).
   *
   * `reason` được gửi kèm để bên MAIC khỏi báo nhầm. Cảnh báo của MAIC ghi "Người dùng đã huỷ"
   * cho MỌI lượt bị huỷ, kể cả khi thật ra là chính chúng ta dọn rác lúc khởi động lại. Nhìn từ
   * ngoài thì thành ra người dùng tự huỷ — sai hẳn, và làm mất luôn manh mối thật (một lần deploy
   * đè lên việc đang chạy). MAIC có bỏ qua trường này thì cũng không hại gì; phía ta vẫn ghi log.
   */
  async cancelRun(runId: string, reason?: string): Promise<void> {
    // Huỷ phải THẬT SỰ tới nơi. Nuốt mọi lỗi rồi coi như xong nghĩa là một build bị huỷ vẫn đốt
    // hạn ngạch dùng chung tới hết lượt — người dùng bấm Huỷ, thấy nó dừng, mà tiền vẫn chạy.
    // Thử lại một lần rồi ghi log nếu vẫn hỏng: ít nhất có dấu vết để lần ra.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const res = await fetch(`${this.base}/v1/runs/${encodeURIComponent(runId)}/cancel`, {
          method: 'POST',
          headers: { ...this.headers(), 'Content-Type': 'application/json' },
          ...(reason ? { body: JSON.stringify({ reason }) } : {}),
        });
        if (res.ok || res.status === 404) return; // 404 = lượt chạy đã kết thúc, coi như đã huỷ
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 800));
          continue;
        }
        this.logger.warn(`không huỷ được lượt chạy MAIC ${runId} (HTTP ${res.status}) — hạn ngạch vẫn đang chạy`);
      } catch (e) {
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 800));
          continue;
        }
        this.logger.warn(`không huỷ được lượt chạy MAIC ${runId}: ${(e as Error).message}`);
      }
    }
  }

  /**
   * Luồng sự kiện đứt rồi: hỏi trạng thái lượt chạy cho tới khi nó ngã về một kết cục.
   *
   * Hai tình huống đều phải đúng:
   *  • maic-api vừa được tạo lại — vài giây đầu không hỏi được gì cả, nên lỗi gọi liên tiếp
   *    không được coi là câu trả lời; chỉ bỏ cuộc sau ~2 phút liền không hỏi được.
   *  • luồng đứt vì lý do khác mà lượt chạy VẪN ĐANG CHẠY — chờ nó xong rồi lấy kết quả, thay
   *    vì bỏ một lượt sắp trả bài. Hạn chờ đặt theo `timeoutSec` mặc định của một lượt.
   *
   * Trả `null` khi hết hạn, bị huỷ, hoặc không còn hỏi được — lúc đó người gọi ném lỗi như cũ.
   */
  private async doiKetCucCuaRun(
    runId: string,
    signal?: AbortSignal,
  ): Promise<{ status: string; inputTokens?: number; outputTokens?: number; costUsd?: number; error?: string } | null> {
    const NHIP_MS = 5_000;
    const hetHan = Date.now() + 20 * 60_000;
    let loiLienTiep = 0;
    for (;;) {
      if (signal?.aborted) return null;
      const r = await this.getRun(runId).catch(() => null);
      if (r) {
        loiLienTiep = 0;
        if (laKetCucRun(r.status)) return r;
      } else if (++loiLienTiep >= 24) {
        return null;
      }
      if (Date.now() >= hetHan) return null;
      try {
        await this.sleep(NHIP_MS, signal);
      } catch {
        return null; // bị huỷ giữa lúc chờ
      }
    }
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(t);
          reject(new Error('aborted'));
        },
        { once: true },
      );
    });
  }
}
