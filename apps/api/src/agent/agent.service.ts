import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { Response } from 'express';
import { Prisma } from '@prisma/client';
import type {
  AgentDevice as PAgentDevice,
  RemoteTask as PRemoteTask,
  RemoteTaskEvent as PRemoteTaskEvent,
} from '@prisma/client';
import type {
  AgentCommand,
  AgentConversation,
  AgentDevice,
  AgentTokenResponse,
  AgentWebhookTokenInfo,
  CmsSyncStreamEvent,
  LarkQrStreamEvent,
  LarkChatRelayInput,
  LarkChatStreamEvent,
  LarkRpcResultEvent,
  AgentChatIndex,
  AssistantShareInfo,
  CreateRemoteTaskResponse,
  PublicAssistantInfo,
  PublicChatConv,
  RemoteTask,
  RemoteTaskEventItem,
  RemoteTaskStatus,
  RemoteTaskStreamEvent,
  RunnerId,
  TelegramBindingInfo,
  TelegramLinkResponse,
  TokenTestResult,
} from '@larkwave/shared';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { TelegramService } from './telegram.service';
import { MaicService } from '../maic/maic.service';
import { MaicUsageService } from '../maic/maic-usage.service';
import { SkillsService } from '../skills/skills.service';
import { UploadsService } from '../uploads/uploads.service';
import type { AuthUser } from '../common/auth-user';
import type { MaicChatRunDto } from './agent.dto';
import type {
  AgentChatBodyPushDto,
  AgentChatIndexPushDto,
  AgentChatProjectsPushDto,
  CmsSyncResultDto,
  CreateRemoteTaskDto,
  LarkChatAnswerDto,
  LarkChatConfirmDto,
  LarkChatEventDto,
  LarkChatRunDto,
  LarkRpcResultDto,
  LarkRpcRunDto,
  PostRemoteTaskEventDto,
  UpdateTokenNotifyDto,
} from './agent.dto';

/** The shared CMS connector backend the desktop's "Đồng bộ Bitable (CMS)" screen drives. The web
 *  lists jobs through us (server-side) so it avoids CORS + never hardcodes the base. */
const CMS_SYNC_BASE = (process.env.CMS_SYNC_BASE || 'https://apihoanam.toolswave.net/api').replace(/\/+$/, '');

/** A device is "online" if it was seen within this window (heartbeat ~15s). */
const ONLINE_WINDOW_MS = 45_000;

/** System steering for the hosted "Trợ lý AI" (MAIC) turns — a capable, friendly Vietnamese
 *  assistant, mirroring the desktop generalMode persona. Kept concise (MAIC is Claude already). */
const MAIC_ASSISTANT_SYSTEM_PROMPT = [
  'Bạn là Trợ lý AI của Larkwave — thông minh, thân thiện, trả lời bằng tiếng Việt (trừ khi người dùng dùng ngôn ngữ khác).',
  'Trả lời rõ ràng, chính xác, đi thẳng vấn đề; dùng markdown (danh sách, bảng, tiêu đề, khối mã) khi hữu ích.',
  '',
  'TRÌNH BÀY TRỰC QUAN — giao diện chat RENDER SỐNG các khối mã dưới đây, hãy chủ động dùng khi phù hợp:',
  '- Khi cần MINH HOẠ / VẼ / TRỰC QUAN HOÁ (sơ đồ, biểu đồ, mô hình, hình học, hoạt hoạ, mô phỏng, giao diện mẫu…): xuất MỘT khối ```html TỰ CHỨA (được phép có CSS/JS/SVG/canvas nội tuyến) — nó sẽ chạy trong khung iframe cách ly. Ưu tiên HTML cho mọi hình vẽ đẹp/tương tác. Ví dụ "vẽ mô hình xoắn ốc" → xuất ```html vẽ bằng canvas/SVG.',
  '- Hình vector tĩnh đơn giản: dùng khối ```svg.',
  '- Sơ đồ luồng/tuần tự/lớp/gantt/quan hệ: dùng khối ```mermaid.',
  '- Mã nguồn thông thường: khối ```<ngôn-ngữ> (sẽ được tô màu cú pháp).',
  'Khung KHÔNG có mạng — KHÔNG tải thư viện/CDN/ảnh ngoài; vẽ bằng HTML/CSS/SVG/canvas/JS thuần, tự chứa. Có thể kèm 1-2 câu giải thích ngắn quanh khối.',
  '',
  'Nếu không chắc, hãy nói rõ thay vì bịa.',
].join('\n');

/** Extra context carried from a trigger into `enqueue` (source + outbound targets). */
interface EnqueueContext {
  source?: 'phone' | 'webhook' | 'telegram' | 'lark';
  notifyLarkWebhookUrl?: string | null;
  notifyTelegramChatId?: string | null;
}

/** The subset of a Telegram `Update.message` we read. */
interface TelegramMessage {
  text?: string;
  chat?: {
    id: number | string;
    title?: string;
    first_name?: string;
    last_name?: string;
  };
}

/**
 * A leading "/word" that matches no skill must never reach the hosted assistant as-is.
 *
 * The assistant is a Claude Code CLI, and a prompt starting with "/" is parsed as one of ITS OWN
 * slash commands — so a typo, or `/contract` when the skill is `/contract-cn`, came back as the
 * CLI's "Unknown command: /contract" with nothing on our side explaining it.
 *
 * Prepending whitespace does NOT work (measured against production: the gateway trims before the
 * CLI sees it). So we rewrite the turn into an ordinary question that cannot be parsed as a
 * command, and use it to give the user something useful — the nearest command they actually own.
 */
function rewriteUnknownCommand(prompt: string, known: string[]): string {
  const m = /^\s*\/([^\s/]+)([\s\S]*)$/.exec(prompt);
  if (!m) return prompt;
  const typed = m[1];
  const rest = m[2].trim();
  const list = known.length ? known.map((c) => `/${c}`).join(', ') : '(chưa có lệnh nào)';
  return (
    `Người dùng vừa gõ lệnh nhanh "/${typed}" nhưng lệnh này KHÔNG tồn tại. ` +
    `Các lệnh họ đang có: ${list}. ` +
    `Hãy trả lời NGẮN bằng tiếng Việt: báo lệnh đó không có, gợi ý lệnh gần đúng nhất trong danh sách ` +
    `(nếu có), và nhắc họ có thể tạo lệnh mới ở màn hình Skills.` +
    (rest ? `\n\nPhần còn lại họ viết: ${rest}` : '')
  );
}

/**
 * Does this failure mean "the conversation we tried to resume is gone"?
 *
 * MAIC resumes by handing the CLI a session id; once that conversation no longer exists the run
 * fails with "No conversation found with session ID …" (the gateway wraps it in Vietnamese as
 * `Phiên "…" không còn tồn tại`). Because the id stays in our MaicSession table, EVERY later turn
 * of that conversation retries the same dead id and fails identically — the user is stuck until
 * they start a brand-new chat. Matching either wording lets us drop the mapping and retry clean.
 */
function isDeadMaicSession(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err ?? '');
  return /no conversation found|không còn tồn tại|session .*not found/i.test(m);
}

/**
 * Did the agentic run actually ANSWER, or did it only narrate what it was about to do?
 *
 * A run that ends right after "Tôi kiểm tra thư mục làm việc trước khi bắt đầu." produces text —
 * so an emptiness check passes it through and the user is shown a sentence about our internals
 * as though it were the reply. Anything this short is narration, not an answer.
 */
/** Câu mở đầu kiểu tường thuật mà agent hay thốt ra trước khi làm việc thật. */
const NARRATION_RE =
  /^(tôi (sẽ|đang|kiểm tra|khảo sát|mở|đọc)|mình (sẽ|đang|kiểm tra|mở|đọc)|để (tôi|mình)|i(\'| a)?ll |let me |checking |i'm |first,? )/i;

/**
 * Bỏ phần tường thuật ở ĐẦU rồi mới chấm — không chấm cả cục.
 *
 * Bản cũ chỉ so đầu chuỗi, nên một câu trả lời ĐÚNG mà lỡ mở đầu bằng "I'll look at the image
 * first." sẽ bị kết luận là không có nội dung. Đo thật: agent đọc ảnh ra đúng "Dương lịch:
 * 5-9-2026 (Thứ Bảy) · Âm lịch: 24-7-2026", tổng 145 ký tự — dưới ngưỡng 160 và khớp tiền tố
 * tường thuật, nên người dùng nhận được câu trả lời ĐÚNG kèm dòng cảnh báo "chưa đọc xong file".
 * Sai kiểu này đắt gấp đôi: vừa làm người dùng nghi ngờ một kết quả đúng, vừa chặn việc lưu bối
 * cảnh cho lượt sau.
 */
function strippedAnswer(answer: string): string {
  const lines = (answer || '').split('\n');
  let i = 0;
  while (i < lines.length && (!lines[i].trim() || NARRATION_RE.test(lines[i].trim()))) i += 1;
  const rest = lines.slice(i).join('\n').trim();
  if (rest) return rest;
  // Tường thuật và nội dung có thể dính chung MỘT dòng ("I'll look first.- Dương lịch: …").
  // Cắt ở dấu KẾT CÂU đầu tiên, không phải ở tiền tố: bỏ mỗi tiền tố thì "Tôi sẽ kiểm tra thư
  // mục làm việc." còn lại "kiểm tra thư mục làm việc." — vẫn là tường thuật, mà đủ dài để bị
  // chấm nhầm là có nội dung.
  const one = (answer || '').trim();
  if (!NARRATION_RE.test(one)) return one;
  const end = /[.!?…]\s*/.exec(one);
  return end ? one.slice(end.index + end[0].length).replace(/^[^\p{L}\p{N}]+/u, '').trim() : '';
}

function isSubstantiveAnswer(answer: string): boolean {
  const t = (answer || '').trim();
  if (t.length >= 160) return true; // long enough to be real content whatever it says
  return strippedAnswer(t).length >= 24;
}

/** Where a chat turn's attachments are seeded inside the agentic run workspace. */
const CHAT_ATTACH_DIR = '.attachments';

/** Nơi ghi tệp đính kèm CỦA SKILL trong workspace của lượt chạy (mẫu, cấu hình ví dụ…). */
const SKILL_ASSET_DIR = '.skill-files';

/** Keep the attachment's own name (so the agent can match it to what the user called it) but
 *  strip anything that could escape the folder or confuse a shell. */
function safeFileName(name: string): string {
  const base = (name || 'tep').replace(/[/\\]/g, '_').replace(/[^\p{L}\p{N}._ -]/gu, '').trim();
  return (base || 'tep').slice(0, 80);
}

/** `image/png` → `png`. Unknown types keep a generic extension; the agent reads by path anyway. */
function attachExt(mime: string, name: string): string {
  const fromName = /\.([a-z0-9]{1,5})$/i.exec(name || '')?.[1];
  if (fromName) return fromName.toLowerCase();
  const m = /\/(png|jpe?g|webp|gif|pdf)/i.exec(mime || '');
  return m ? (m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase()) : 'bin';
}

/**
 * Pull the assistant's visible text out of an agentic run's event stream.
 *
 * `MaicRunResult` carries only files, so a chat turn has to read its answer from the `assistant`
 * events — the same shape the chat progress logger consumes. Tool-use blocks are
 * skipped on purpose: surfacing them is exactly the bug being fixed here, where a raw
 * `{"name":"Bash", …}` JSON blob was shown to the user as if it were the reply.
 */
/**
 * Cắt bỏ phần đánh dấu LỆNH CÔNG CỤ lỡ nằm trong khối văn bản.
 *
 * Khối tool_use đúng chuẩn đã bị assistantTextFromEvent bỏ qua (chỉ lấy type==='text'). Nhưng model
 * đôi khi VIẾT lệnh gọi công cụ như văn bản thường — khi đó không ai lọc, và người dùng nhận được
 * nguyên một dòng `{"command": "find / -name 'template.xlsx'"}` làm câu trả lời. Đã xảy ra thật,
 * hai lần, trên hội thoại của người dùng.
 *
 * Cắt từ chỗ bắt đầu phần rác trở đi thay vì chỉ xoá đoạn khớp: một lệnh gọi bị viết dở thường
 * KHÔNG có mốc đóng, nên xoá theo cặp sẽ bỏ sót đúng trường hợp hay gặp nhất.
 */
/**
 * Những chuỗi có thể MỞ ĐẦU một lệnh gọi công cụ. Dùng cho cả việc cắt (khi đã đủ) lẫn việc giữ
 * lại phần đuôi (khi mới có một phần).
 */
const TOOL_OPEN_LITERALS = ['<function_calls>', '<invoke ', '<tool_use>', '<|tool_use|>', '**Tool Use:'];

/**
 * Tách chuỗi đang stream thành phần AN TOÀN để phát ra và phần ĐUÔI phải giữ lại.
 *
 * Vì sao cần: bộ lọc chỉ nhận ra "<invoke name=" khi mốc mở đã ĐỦ. Nhưng stream cắt tuỳ ý — người
 * dùng nhìn thấy đúng chuỗi "<inv" nằm chỏng chơ ở cuối câu trả lời, vì mảnh đó tới trước và chưa
 * khớp, phát ra rồi mới tới phần còn lại. Giữ lại mọi hậu tố CÓ THỂ là khởi đầu của một mốc mở
 * cho tới khi biết chắc: hoặc nó thành mốc thật (bị cắt), hoặc là chữ bình thường (phát nốt).
 */
function splitSafeTail(clean: string): { safe: string; pending: string } {
  let keep = 0;
  for (const lit of TOOL_OPEN_LITERALS) {
    for (let n = Math.min(lit.length - 1, clean.length); n > 0; n -= 1) {
      if (clean.slice(-n).toLowerCase() === lit.slice(0, n).toLowerCase()) {
        keep = Math.max(keep, n);
        break;
      }
    }
  }
  return keep ? { safe: clean.slice(0, clean.length - keep), pending: clean.slice(-keep) } : { safe: clean, pending: '' };
}

export function stripLeakedToolCalls(text: string): string {
  let out = text || '';
  // Các mốc mở của một lệnh gọi công cụ, ở mọi kiểu viết đã gặp.
  const OPENERS = [
    /<function_calls>/i,
    /<invoke\s+name=/i,
    /\uFE4Dtool_use\uFE4D/i,
    /[\u0640\u2014_-]{2}tool_use[\u0640\u2014_-]{2}/i,
    /<\|?tool_use\|?>/i,
    // Dạng markdown mà chính gateway dựng ra: "**Tool Use: Bash**" rồi một khối ```json.
    // Đây không phải model tự bịa — nó là cách MAIC hiển thị lệnh gọi khi kênh tool_use không
    // được dùng, và nó đi thẳng vào luồng text nên không bộ lọc nào cũ bắt được.
    /\*\*Tool Use:/i,
    /(^|\n)Tool Use:\s*\w+/,
  ];
  for (const re of OPENERS) {
    const m = re.exec(out);
    if (m) out = out.slice(0, m.index);
  }
  // Đuôi JSON của một lệnh gọi bị cắt ngang: `…"command": "…", "description": "…"}}`
  // Chỉ cắt khi đoạn đó THỰC SỰ giống JSON — có dấu `}` hoặc từ hai cặp "khoá": trở lên. Nếu chỉ
  // cần một khoá thì một câu trả lời hợp lệ kết thúc bằng `path: "/api/x"` cũng bị xoá oan.
  out = out.replace(/\n?\s*"?(command|file_path|path|description)"?\s*:\s*"[\s\S]*$/i, (frag) => {
    const jsonish = frag.includes('}') || (frag.match(/"[a-z_]+"\s*:/gi) || []).length >= 2;
    return jsonish && !/[.!?…]\s*$/.test(frag) ? '' : frag;
  });
  return out.trimEnd();
}

/** Chữ THÔ từ một event, CHƯA lọc — nơi gọi phải ghép lại rồi mới lọc (xem stripLeakedToolCalls). */
function rawAssistantText(e: { type?: string; message?: unknown }): string {
  if (e?.type !== 'assistant') return '';
  const content = (e.message as { content?: unknown } | undefined)?.content;
  if (!Array.isArray(content)) return '';
  let out = '';
  for (const c of content as { type?: string; text?: string }[]) {
    if (c?.type === 'text' && typeof c.text === 'string') out += c.text;
  }
  return out;
}

function assistantTextFromEvent(e: { type?: string; message?: unknown }): string {
  if (e?.type !== 'assistant') return '';
  const content = (e.message as { content?: unknown } | undefined)?.content;
  if (!Array.isArray(content)) return '';
  let out = '';
  for (const c of content as { type?: string; text?: string }[]) {
    if (c?.type === 'text' && typeof c.text === 'string') out += c.text;
  }
  return stripLeakedToolCalls(out);
}

/**
 * Tệp agent VIẾT RA trong workspace → lưu thành Upload để người dùng tải về.
 *
 * Bỏ những gì chính ta seed vào (tệp người dùng gửi lên, tệp mẫu của skill): trả lại đúng thứ họ
 * vừa đưa cho ta thì chỉ làm rối danh sách. Chỉ giữ thứ agent TẠO MỚI.
 */
function isSeededPath(path: string): boolean {
  const p = path.replace(/^\.\//, '');
  return p.startsWith(`${CHAT_ATTACH_DIR}/`) || p.startsWith(`${SKILL_ASSET_DIR}/`) || p === 'GHI-CHU.md';
}

@Injectable()
export class AgentService {
  private readonly log = new Logger('AgentService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly telegram: TelegramService,
    private readonly maic: MaicService,
    private readonly maicUsage: MaicUsageService,
    private readonly skills: SkillsService,
    private readonly uploads: UploadsService,
  ) {}

  /** In-flight MAIC turns → their AbortController, so `maicChatCancel` can stop one. */
  private readonly maicAborts = new Map<string, AbortController>();

  /**
   * Resolve any `/command` skill shortcut the user typed into the hosted-assistant prompt.
   *
   * Slash commands are an EXPLICIT invocation, so the skill applies for that turn even when it is
   * disabled — that is the whole point of the shortcut, and `maicSystemFor` only carries the
   * enabled ones. Never throws: a lookup failure degrades to the prompt as typed.
   */
  private async expandSkillCommands(
    userId: string,
    prompt: string,
  ): Promise<{ prompt: string; skillIds: string[] }> {
    const r = await this.skills.expandCommands(userId, prompt).catch(() => null);
    const applied = r?.applied || [];
    if (applied.length) return { prompt: r?.prompt || prompt, skillIds: applied.map((a) => a.id) };
    // Nothing matched. If it still LOOKS like a command, rewrite it — see rewriteUnknownCommand.
    if (!/^\s*\//.test(prompt)) return { prompt, skillIds: [] };
    const known = await this.skills.commands(userId).catch(() => []);
    return { prompt: rewriteUnknownCommand(prompt, known.map((c) => c.command)), skillIds: [] };
  }

  /** The hosted-assistant system prompt for THIS user = base persona + the conversation's PROJECT
   *  custom instructions (if any) + any enabled skills. `convId` = the client conversation id. */
  private async maicSystemFor(
    userId: string,
    convId?: string,
    projectIdOverride?: string,
    /** Skills a `/command` already inlined into the user prompt — skipped so they aren't sent twice. */
    skipSkillIds?: readonly string[],
  ): Promise<string> {
    const skillBlock = await this.skills.enabledPromptBlock(userId, skipSkillIds).catch(() => '');
    let projectBlock = '';
    let projectId = projectIdOverride;
    if (!projectId && convId) {
      const conv = await this.prisma.agentChatConversation
        .findFirst({ where: { id: convId, userId }, select: { projectId: true } })
        .catch(() => null);
      projectId = conv?.projectId || undefined;
    }
    if (projectId) {
      const proj = await this.prisma.agentChatProject
        .findFirst({ where: { id: projectId, userId }, select: { name: true, instructions: true } })
        .catch(() => null);
      if (proj?.instructions?.trim()) {
        projectBlock = `\n---\nHƯỚNG DẪN DỰ ÁN “${proj.name}” (áp dụng cho hội thoại này):\n${proj.instructions.trim()}`;
      }
    }
    return `${MAIC_ASSISTANT_SYSTEM_PROMPT}${projectBlock}${skillBlock ? `\n${skillBlock}` : ''}`;
  }

  // ── admin: Telegram bot token (set without a redeploy) ───────────────────────

  /** `GET /v1/agent/telegram/admin` (admin) — non-secret bot status. */
  telegramAdminStatus() {
    return this.telegram.status();
  }

  /** `PUT /v1/agent/telegram/admin` (admin) — set/clear the bot token; re-registers
   *  the webhook immediately. Empty token clears back to the env fallback. */
  telegramAdminSet(dto: { botToken?: string; botUsername?: string }) {
    return this.telegram.setBot({ botToken: dto.botToken ?? '', botUsername: dto.botUsername });
  }

  // ── mappers ────────────────────────────────────────────────────────────────

  /** Prisma row → shared RemoteTask (ISO timestamps, runner cast to RunnerId). */
  private toRemoteTask(
    row: PRemoteTask & {
      events?: PRemoteTaskEvent[];
      device?: { id: string; name: string } | null;
    },
    opts?: { events?: boolean; device?: boolean },
  ): RemoteTask {
    const task: RemoteTask = {
      id: row.id,
      deviceId: row.deviceId,
      runner: row.runner as RunnerId,
      model: row.model,
      prompt: row.prompt,
      status: row.status as RemoteTaskStatus,
      result: row.result,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      startedAt: row.startedAt ? row.startedAt.toISOString() : null,
      finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
      conversationId: row.conversationId,
    };
    if (opts?.events) {
      task.events = (row.events ?? []).map((e) => this.toEventItem(e));
    }
    if (opts?.device) {
      task.device = row.device ?? null;
    }
    return task;
  }

  private toEventItem(e: PRemoteTaskEvent): RemoteTaskEventItem {
    return {
      id: e.id,
      kind: e.kind as RemoteTaskEventItem['kind'],
      payload: (e.payload ?? {}) as Record<string, unknown>,
      createdAt: e.createdAt.toISOString(),
    };
  }

  private isOnline(lastSeenAt: Date): boolean {
    return Date.now() - lastSeenAt.getTime() < ONLINE_WINDOW_MS;
  }

  // ── desktop SSE command stream ───────────────────────────────────────────────

  /** `GET /v1/agent/stream` — the DESKTOP holds this open. Upserts a device for
   *  this machine, streams AgentCommands, refreshes lastSeenAt each heartbeat,
   *  and flushes any queued tasks on connect. */
  async streamCommands(
    userId: string,
    name: string,
    platform: string,
    res: Response,
  ): Promise<void> {
    // Upsert the device (match by userId + name; create if none).
    const deviceName = (name || 'Máy của tôi').slice(0, 200);
    const existing = await this.prisma.agentDevice.findFirst({
      where: { userId, name: deviceName },
    });
    const device = existing
      ? await this.prisma.agentDevice.update({
          where: { id: existing.id },
          data: { lastSeenAt: new Date(), platform: platform || existing.platform },
        })
      : await this.prisma.agentDevice.create({
          data: { userId, name: deviceName, platform: platform || '' },
        });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    res.write(': connected\n\n');

    const write = (cmd: AgentCommand): void => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(cmd)}\n\n`);
    };

    // Heartbeat: keep the connection warm AND keep this device "online" by
    // refreshing lastSeenAt while it stays connected.
    const heartbeat = setInterval(() => {
      if (res.writableEnded) return;
      res.write(': ping\n\n');
      void this.prisma.agentDevice
        .update({ where: { id: device.id }, data: { lastSeenAt: new Date() } })
        .catch(() => undefined);
    }, 15000);

    const unsubscribe = this.events.subscribeAgent(userId, (payload) => {
      write(payload as AgentCommand);
    });

    const cleanup = (): void => {
      clearInterval(heartbeat);
      unsubscribe();
      // Leave lastSeenAt at its last value — "online" naturally expires.
      if (!res.writableEnded) res.end();
    };
    res.on('close', cleanup);

    await this.flushQueued(userId, device.id, write);
  }

  /** Bao lâu thì một tác vụ đang xếp hàng coi như quá hạn, không đẩy xuống nữa. */
  private static readonly TASK_STALE_MS = 24 * 60 * 60 * 1000;
  /** Sau khi đã đẩy, chờ bằng này rồi mới đẩy LẠI (desktop chưa kịp báo "running"). */
  private static readonly TASK_REDELIVER_MS = 90_000;

  /**
   * Đẩy các tác vụ còn xếp hàng xuống desktop vừa nối lại.
   *
   * Trước đây chỗ này gửi lại TOÀN BỘ hàng đợi mỗi lần SSE nối lại — mà SSE thì rớt và nối lại
   * liên tục. Hai hậu quả thật:
   *   1. Chạy trùng: giữa lúc đẩy và lúc desktop báo "running" chỉ cần rớt kết nối một nhịp là
   *      cùng một tác vụ chạy hai lần (mà tác vụ ở đây là chạy CLI — có thể sửa file, deploy).
   *   2. Tác vụ chết đội mồ sống dậy: mở máy sau một tuần thì việc gửi từ hôm kia mới chạy.
   * Nay: đánh dấu `deliveredAt` khi đẩy, chỉ đẩy lại sau TASK_REDELIVER_MS (desktop nhận rồi thì
   * đã chuyển sang 'running' và không còn nằm trong truy vấn này), và quá TASK_STALE_MS thì đóng
   * tác vụ lại kèm lý do rõ ràng thay vì im lặng chạy muộn.
   */
  private async flushQueued(
    userId: string,
    deviceId: string,
    write: (cmd: AgentCommand) => void,
  ): Promise<void> {
    const now = Date.now();
    const staleCutoff = new Date(now - AgentService.TASK_STALE_MS);
    const mine = { userId, status: 'queued', OR: [{ deviceId: null }, { deviceId }] };

    const expired = await this.prisma.remoteTask.updateMany({
      where: { ...mine, createdAt: { lt: staleCutoff } },
      data: {
        status: 'error',
        error: 'Quá hạn: máy tính không kết nối trong 24 giờ nên tác vụ không được chạy.',
        finishedAt: new Date(),
      },
    });
    if (expired.count) {
      this.log.log(`flushQueued: đóng ${expired.count} tác vụ quá hạn (user ${userId})`);
    }

    const queued = await this.prisma.remoteTask.findMany({
      where: {
        ...mine,
        createdAt: { gte: staleCutoff },
        OR: [
          { deliveredAt: null },
          { deliveredAt: { lt: new Date(now - AgentService.TASK_REDELIVER_MS) } },
        ],
        AND: [{ OR: [{ deviceId: null }, { deviceId }] }],
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!queued.length) return;

    await this.prisma.remoteTask.updateMany({
      where: { id: { in: queued.map((t) => t.id) } },
      data: { deliveredAt: new Date() },
    });
    for (const t of queued) {
      write({ type: 'task', task: this.toRemoteTask(t) });
    }
  }

  // ── enqueue (phone + webhook share this) ─────────────────────────────────────

  /** Resolve the target device: explicit id, else the most-recently-seen ONLINE
   *  device. Returns null when none is online. */
  private async resolveDevice(
    userId: string,
    deviceId?: string,
  ): Promise<PAgentDevice | null> {
    if (deviceId) {
      const d = await this.prisma.agentDevice.findFirst({
        where: { id: deviceId, userId },
      });
      return d ?? null;
    }
    const recent = await this.prisma.agentDevice.findFirst({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' },
    });
    if (recent && this.isOnline(recent.lastSeenAt)) return recent;
    return null;
  }

  /** Core enqueue shared by `POST /tasks` (phone JWT), `POST /webhook`, Telegram + Lark.
   *  `ctx` carries the trigger source + optional outbound notify targets stamped onto
   *  the task so `recordEvent` can push a summary when it finishes. */
  async enqueue(
    userId: string,
    dto: CreateRemoteTaskDto,
    ctx: EnqueueContext = {},
  ): Promise<CreateRemoteTaskResponse> {
    const device = await this.resolveDevice(userId, dto.deviceId);
    // Only file under a conversation the caller actually owns (else leave unfiled).
    let conversationId: string | null = null;
    if (dto.conversationId) {
      const conv = await this.prisma.agentConversation.findFirst({
        where: { id: dto.conversationId, userId },
        select: { id: true },
      });
      conversationId = conv?.id ?? null;
    }
    const task = await this.prisma.remoteTask.create({
      data: {
        userId,
        deviceId: device?.id ?? null,
        runner: dto.runner ?? 'claude',
        model: dto.model ?? null,
        prompt: dto.prompt,
        status: 'queued',
        source: ctx.source ?? 'phone',
        notifyLarkWebhookUrl: ctx.notifyLarkWebhookUrl ?? null,
        notifyTelegramChatId: ctx.notifyTelegramChatId ?? null,
        conversationId,
      },
    });
    if (conversationId) {
      // Bump the conversation so the sidebar can sort by most-recent activity.
      await this.prisma.agentConversation
        .update({ where: { id: conversationId }, data: { updatedAt: new Date() } })
        .catch(() => undefined);
    }
    const mapped = this.toRemoteTask(task);
    const deviceOnline = !!device && this.isOnline(device.lastSeenAt);
    if (deviceOnline) {
      // Push straight to the connected desktop's command stream.
      this.events.publishAgent(userId, { type: 'task', task: mapped } satisfies AgentCommand);
      // Đẩy thẳng cũng LÀ một lần giao: không đánh dấu thì lần SSE nối lại ngay sau đó sẽ gửi lại.
      await this.prisma.remoteTask
        .update({ where: { id: task.id }, data: { deliveredAt: new Date() } })
        .catch(() => undefined);
    }
    return { task: mapped, deviceOnline };
  }

  // ── desktop posts progress ───────────────────────────────────────────────────

  /** `POST /v1/agent/tasks/:id/events` — DESKTOP posts a progress event. Persists
   *  it, advances the task, and fans out to the user's MESSAGE SSE. */
  async recordEvent(
    userId: string,
    taskId: string,
    dto: PostRemoteTaskEventDto,
  ): Promise<{ ok: true }> {
    const task = await this.prisma.remoteTask.findFirst({
      where: { id: taskId, userId },
    });
    if (!task) throw new NotFoundException('Không tìm thấy tác vụ');

    const event = await this.prisma.remoteTaskEvent.create({
      data: {
        taskId,
        kind: dto.kind,
        payload: dto.payload as Prisma.InputJsonValue,
      },
    });

    // Derive the task update from this event.
    const now = new Date();
    const update: Record<string, unknown> = {};
    const isTerminal = (s: string): boolean => s === 'done' || s === 'error' || s === 'canceled';

    if (dto.kind === 'status') {
      const s = dto.payload.status;
      if (s === 'running') {
        update.status = 'running';
        if (!task.startedAt) update.startedAt = now;
      } else if (s === 'succeeded') {
        update.status = 'done';
        update.finishedAt = now;
      } else if (s === 'failed') {
        update.status = 'error';
        update.finishedAt = now;
      } else if (s === 'canceled') {
        update.status = 'canceled';
        update.finishedAt = now;
      }
    } else if (dto.kind === 'result') {
      update.result =
        typeof dto.payload.result === 'string' ? dto.payload.result : task.result;
      if (!isTerminal(task.status)) {
        update.status = 'done';
        update.finishedAt = now;
      }
    } else if (dto.kind === 'error') {
      update.status = 'error';
      update.error = String(dto.payload.message ?? 'unknown');
      update.finishedAt = now;
    }

    const updated = Object.keys(update).length
      ? await this.prisma.remoteTask.update({ where: { id: taskId }, data: update })
      : task;

    const stream: RemoteTaskStreamEvent = {
      type: 'remoteTask',
      taskId,
      status: updated.status as RemoteTaskStatus,
      event: this.toEventItem(event),
      result: updated.result,
      error: updated.error,
    };
    this.events.publishUser(userId, stream);

    // F4 — OUTBOUND notify: fire once, exactly on the transition INTO a terminal state.
    // Claim atomically (updateMany on notifiedAt: null) so two of the user's desktops
    // both terminalizing this task can't send duplicate notifications.
    if (!isTerminal(task.status) && isTerminal(updated.status)) {
      const claim = await this.prisma.remoteTask.updateMany({
        where: { id: taskId, notifiedAt: null },
        data: { notifiedAt: now },
      });
      if (claim.count === 1) {
        void this.notifyTaskDone(updated).catch((e) =>
          this.log.warn(`notifyTaskDone failed: ${(e as Error).message}`),
        );
      }
    }
    return { ok: true };
  }

  /** Push a one-line completion summary to whatever outbound targets the task carries
   *  (Telegram chat and/or a Lark custom-bot webhook). Best-effort. */
  private async notifyTaskDone(task: PRemoteTask): Promise<void> {
    const tgChat = task.notifyTelegramChatId;
    const larkUrl = task.notifyLarkWebhookUrl;
    if (!tgChat && !larkUrl) return;

    const ok = task.status === 'done';
    const icon = ok ? '✅' : task.status === 'canceled' ? '⏹️' : '❌';
    const head = ok ? 'Xong' : task.status === 'canceled' ? 'Đã huỷ' : 'Lỗi';
    const promptLine = task.prompt.length > 160 ? `${task.prompt.slice(0, 160)}…` : task.prompt;
    const body = ok
      ? task.result || 'Hoàn tất.'
      : task.error || 'Thất bại.';
    const bodyLine = body.length > 800 ? `${body.slice(0, 800)}…` : body;
    const text = `${icon} ${head} — ${promptLine}\n\n${bodyLine}`;

    // Plain text (no HTML parse mode): the body is arbitrary user content — unescaped
    // `< > &` would otherwise make Telegram reject + silently drop the message.
    if (tgChat) await this.telegram.sendMessage(tgChat, text, { html: false }).catch(() => undefined);
    if (larkUrl) await this.sendLarkWebhook(larkUrl, text).catch(() => undefined);
  }

  /** Post to a Lark custom-bot incoming webhook (text message). Best-effort. */
  private async sendLarkWebhook(url: string, text: string): Promise<void> {
    if (!/^https:\/\/(open\.larksuite\.com|open\.feishu\.cn)\//.test(url)) return;
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ msg_type: 'text', content: { text } }),
    }).catch(() => undefined);
  }

  // ── queries ──────────────────────────────────────────────────────────────────

  /** `GET /v1/agent/tasks` — recent tasks (no events), device populated. Optionally
   *  scoped to a conversation: an id filters to it, 'none' = the unfiled thread. */
  async listTasks(userId: string, conversationId?: string): Promise<RemoteTask[]> {
    const where: Record<string, unknown> = { userId };
    if (conversationId === 'none') where.conversationId = null;
    else if (conversationId) where.conversationId = conversationId;
    const rows = await this.prisma.remoteTask.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { device: { select: { id: true, name: true } } },
    });
    return rows.map((r) => this.toRemoteTask(r, { device: true }));
  }

  // ── named conversations (the "Máy của tôi" sidebar) ──────────────────────────

  private toConversation(c: {
    id: string;
    title: string;
    createdAt: Date;
    updatedAt: Date;
    _count?: { tasks: number };
  }): AgentConversation {
    return {
      id: c.id,
      title: c.title,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      taskCount: c._count?.tasks,
    };
  }

  /** `GET /v1/agent/conversations` — the user's conversations, most-recent first. */
  async listConversations(userId: string): Promise<AgentConversation[]> {
    const rows = await this.prisma.agentConversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { tasks: true } } },
    });
    return rows.map((c) => this.toConversation(c));
  }

  /** `POST /v1/agent/conversations` — create a new named conversation. */
  async createConversation(userId: string, title?: string): Promise<AgentConversation> {
    const row = await this.prisma.agentConversation.create({
      data: { userId, title: (title || 'Hội thoại mới').trim().slice(0, 80) || 'Hội thoại mới' },
      include: { _count: { select: { tasks: true } } },
    });
    return this.toConversation(row);
  }

  /** `PATCH /v1/agent/conversations/:id` — rename. */
  async renameConversation(userId: string, id: string, title: string): Promise<AgentConversation> {
    const clean = (title || '').trim().slice(0, 80);
    if (!clean) throw new NotFoundException('Tên hội thoại trống');
    const res = await this.prisma.agentConversation.updateMany({ where: { id, userId }, data: { title: clean } });
    if (!res.count) throw new NotFoundException('Không tìm thấy hội thoại');
    const row = await this.prisma.agentConversation.findFirst({
      where: { id, userId },
      include: { _count: { select: { tasks: true } } },
    });
    return this.toConversation(row!);
  }

  /** `DELETE /v1/agent/conversations/:id` — remove the conversation (its tasks become
   *  unfiled via onDelete: SetNull, so history isn't lost). */
  async deleteConversation(userId: string, id: string): Promise<{ ok: boolean }> {
    await this.prisma.agentConversation.deleteMany({ where: { id, userId } });
    return { ok: true };
  }

  /** `GET /v1/agent/tasks/:id` — task detail WITH events for replay. */
  async getTask(userId: string, taskId: string): Promise<RemoteTask> {
    const row = await this.prisma.remoteTask.findFirst({
      where: { id: taskId, userId },
      include: {
        device: { select: { id: true, name: true } },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!row) throw new NotFoundException('Không tìm thấy tác vụ');
    return this.toRemoteTask(row, { events: true, device: true });
  }

  /** `GET /v1/agent/devices` — the user's devices with derived `online`. */
  async listDevices(userId: string): Promise<AgentDevice[]> {
    const rows = await this.prisma.agentDevice.findMany({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' },
    });
    return rows.map((d) => ({
      id: d.id,
      name: d.name,
      platform: d.platform,
      online: this.isOnline(d.lastSeenAt),
      lastSeenAt: d.lastSeenAt.toISOString(),
      createdAt: d.createdAt.toISOString(),
    }));
  }

  // ── webhook token ──────────────────────────────────────────────────────────

  private sha256(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** `POST /v1/agent/token` — legacy single-token (re)generate. Kept for backward-compat. */
  async generateToken(userId: string): Promise<AgentTokenResponse> {
    const token = `twa_${randomBytes(24).toString('hex')}`;
    await this.prisma.user.update({
      where: { id: userId },
      data: { agentTokenHash: this.sha256(token) },
    });
    return { token };
  }

  private tokenInfo(t: {
    id: string;
    name: string;
    tokenPrefix: string;
    createdAt: Date;
    lastUsedAt: Date | null;
    notifyLarkWebhookUrl?: string | null;
    notifyTelegramChatId?: string | null;
  }): AgentWebhookTokenInfo {
    return {
      id: t.id,
      name: t.name,
      tokenPrefix: t.tokenPrefix,
      createdAt: t.createdAt.toISOString(),
      lastUsedAt: t.lastUsedAt ? t.lastUsedAt.toISOString() : null,
      notifyLarkWebhookUrl: t.notifyLarkWebhookUrl ?? null,
      notifyTelegramChatId: t.notifyTelegramChatId ?? null,
    };
  }

  /** `POST /v1/agent/tokens/:id/test` — is this token usable + is a device ready to run?
   *  A true end-to-end check without running anything: the token must exist for the user,
   *  and at least one device must be online (the same signal the webhook uses to deliver). */
  async testToken(userId: string, id: string): Promise<TokenTestResult> {
    const tok = await this.prisma.agentWebhookToken.findFirst({ where: { id, userId } });
    if (!tok) return { tokenValid: false, deviceOnline: false, deviceName: null, lastSeenSec: null };
    const device = await this.prisma.agentDevice.findFirst({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' },
    });
    const online = !!device && this.isOnline(device.lastSeenAt);
    const lastSeenSec = device ? Math.round((Date.now() - device.lastSeenAt.getTime()) / 1000) : null;
    return {
      tokenValid: true,
      deviceOnline: online,
      deviceName: device?.name ?? null,
      lastSeenSec,
    };
  }

  /** `PUT /v1/agent/tokens/:id/notify` — set/clear a token's outbound notify target. */
  async updateTokenNotify(
    userId: string,
    id: string,
    dto: UpdateTokenNotifyDto,
  ): Promise<AgentWebhookTokenInfo> {
    const data: { notifyLarkWebhookUrl?: string | null; notifyTelegramChatId?: string | null } = {};
    if (dto.notifyLarkWebhookUrl !== undefined)
      data.notifyLarkWebhookUrl = dto.notifyLarkWebhookUrl.trim() || null;
    if (dto.notifyTelegramChatId !== undefined) {
      const chatId = dto.notifyTelegramChatId.trim();
      // A token may only notify a Telegram chat that the OWNER has bound (the shared
      // platform bot must not become a spam relay to arbitrary chats).
      if (chatId) {
        const bound = await this.prisma.telegramBinding.findFirst({ where: { chatId, userId } });
        if (!bound)
          throw new ForbiddenException('Chat Telegram này chưa được nối với tài khoản của bạn.');
      }
      data.notifyTelegramChatId = chatId || null;
    }
    const res = await this.prisma.agentWebhookToken.updateMany({ where: { id, userId }, data });
    if (!res.count) throw new NotFoundException('Không tìm thấy token');
    const row = await this.prisma.agentWebhookToken.findFirst({ where: { id, userId } });
    return this.tokenInfo(row!);
  }

  /** `POST /v1/agent/tokens` — create a NAMED webhook token (returned raw once). */
  async createToken(userId: string, name: string): Promise<AgentTokenResponse> {
    const token = `twa_${randomBytes(24).toString('hex')}`;
    const row = await this.prisma.agentWebhookToken.create({
      data: {
        userId,
        name: (name || 'Token').trim().slice(0, 60) || 'Token',
        tokenHash: this.sha256(token),
        tokenPrefix: `${token.slice(0, 10)}…`,
      },
    });
    return { token, id: row.id, name: row.name };
  }

  /** `GET /v1/agent/tokens` — list this user's named tokens (never the raw token). */
  async listTokens(userId: string): Promise<AgentWebhookTokenInfo[]> {
    const rows = await this.prisma.agentWebhookToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.tokenInfo(r));
  }

  /** `DELETE /v1/agent/tokens/:id` — revoke one named token (scoped to the owner). */
  async deleteToken(userId: string, id: string): Promise<{ ok: boolean }> {
    await this.prisma.agentWebhookToken.deleteMany({ where: { id, userId } });
    return { ok: true };
  }

  // ── Telegram bridge (chat → remote run) ──────────────────────────────────────

  /** `POST /v1/agent/telegram/link` — mint a one-time bind code + deep link. The user
   *  sends the bot `/start <code>` from the chat they want to control the machine from. */
  async telegramLink(userId: string): Promise<TelegramLinkResponse> {
    const configured = this.telegram.isConfigured();
    const code = randomBytes(5).toString('hex'); // 10 hex chars
    // Keep only the newest few codes per user tidy; then store this one.
    await this.prisma.telegramLinkCode.create({ data: { code, userId } }).catch(() => undefined);
    const username = configured ? await this.telegram.botUsername() : null;
    return {
      code,
      botConfigured: configured,
      botUsername: username,
      deepLink: username ? `https://t.me/${username}?start=${code}` : null,
    };
  }

  /** `GET /v1/agent/telegram/bindings` — chats currently bound to this user. */
  async listTelegramBindings(userId: string): Promise<TelegramBindingInfo[]> {
    const rows = await this.prisma.telegramBinding.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      chatId: r.chatId,
      chatTitle: r.chatTitle,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** `DELETE /v1/agent/telegram/bindings/:id` — unbind a chat. */
  async deleteTelegramBinding(userId: string, id: string): Promise<{ ok: boolean }> {
    await this.prisma.telegramBinding.deleteMany({ where: { id, userId } });
    return { ok: true };
  }

  /** `POST /v1/agent/telegram/webhook` (PUBLIC) — Telegram delivers updates here.
   *  Handles `/start <code>` (bind chat→user) and plain text (enqueue a remote run,
   *  replying into the same chat when the task finishes). Always resolves ok=true so
   *  Telegram doesn't retry-storm. */
  async handleTelegramUpdate(
    secretHeader: string | undefined,
    body: unknown,
  ): Promise<{ ok: true }> {
    if (!this.telegram.verifySecret(secretHeader)) return { ok: true };
    const msg = (body as { message?: TelegramMessage })?.message;
    const chat = msg?.chat;
    const text = (msg?.text ?? '').trim();
    if (!chat?.id || !text) return { ok: true };
    const chatId = String(chat.id);
    const chatTitle = chat.title ?? [chat.first_name, chat.last_name].filter(Boolean).join(' ') ?? null;

    // /start <code> → bind this chat to the code's user.
    const startMatch = text.match(/^\/start(?:@\w+)?\s+([a-f0-9]{6,})$/i);
    if (startMatch) {
      await this.bindTelegramChat(startMatch[1], chatId, chatTitle);
      return { ok: true };
    }
    if (/^\/start\b/i.test(text)) {
      await this.telegram.sendMessage(
        chatId,
        'Chào! Để nối chat này với máy của bạn: mở app Larkwave → Cài đặt → Điều khiển từ xa → "Nối Telegram", rồi bấm link hoặc gửi lệnh /start &lt;mã&gt; ở đây.',
      );
      return { ok: true };
    }

    // Resolve the bound user for this chat.
    const binding = await this.prisma.telegramBinding.findUnique({ where: { chatId } });
    if (!binding) {
      await this.telegram.sendMessage(
        chatId,
        'Chat này chưa được nối với tài khoản nào. Mở app Larkwave → Điều khiển từ xa → "Nối Telegram" để lấy mã, rồi gửi /start &lt;mã&gt;.',
      );
      return { ok: true };
    }

    // A plain message (or /run <prompt>) → enqueue a remote coding task on the machine.
    const prompt = text.replace(/^\/(run|chay|task)(?:@\w+)?\s*/i, '').trim();
    if (!prompt) return { ok: true };
    const res = await this.enqueue(
      binding.userId,
      { prompt },
      { source: 'telegram', notifyTelegramChatId: chatId },
    );
    await this.telegram.sendMessage(
      chatId,
      res.deviceOnline
        ? '⏳ Đã nhận — máy đang chạy, xong sẽ báo lại ở đây.'
        : '⚠️ Đã ghi nhận nhưng máy đang offline. Mở app Larkwave trên máy để nó chạy.',
    );
    return { ok: true };
  }

  /** Consume a link code (if fresh, ≤15 min) and bind the chat to its user. */
  private async bindTelegramChat(code: string, chatId: string, chatTitle: string | null): Promise<void> {
    const row = await this.prisma.telegramLinkCode.findUnique({ where: { code } });
    if (!row || Date.now() - row.createdAt.getTime() > 15 * 60_000) {
      await this.telegram.sendMessage(chatId, '⚠️ Mã nối không hợp lệ hoặc đã hết hạn. Lấy mã mới trong app.');
      return;
    }
    // Don't let a member of a shared/group chat silently re-bind it away from another
    // account. Only rebind if the chat is unbound or already the same user's.
    const existing = await this.prisma.telegramBinding.findUnique({ where: { chatId } });
    if (existing && existing.userId !== row.userId) {
      await this.prisma.telegramLinkCode.delete({ where: { code } }).catch(() => undefined);
      await this.telegram.sendMessage(
        chatId,
        '⚠️ Chat này đang nối với một tài khoản khác. Chủ hiện tại cần huỷ liên kết trong app trước.',
      );
      return;
    }
    await this.prisma.telegramBinding.upsert({
      where: { chatId },
      create: { userId: row.userId, chatId, chatTitle },
      update: { userId: row.userId, chatTitle },
    });
    await this.prisma.telegramLinkCode.delete({ where: { code } }).catch(() => undefined);
    await this.telegram.sendMessage(
      chatId,
      '✅ Đã nối! Nhắn thẳng nội dung (hoặc <code>/run &lt;yêu cầu&gt;</code>) vào chat này là máy của bạn sẽ chạy.',
    );
  }

  // ── phone → desktop Lark re-login relay ────────────────────────────────────

  /** `POST /v1/agent/lark-login` (phone) — ask this user's desktop to open its Lark login window
   *  and stream the QR back. Returns a requestId the phone matches larkQr events against. */
  async startLarkLogin(userId: string): Promise<{ requestId: string }> {
    const requestId = randomBytes(8).toString('hex');
    this.events.publishAgent(userId, { type: 'larkLogin', requestId } satisfies AgentCommand);
    return { requestId };
  }

  /** `POST /v1/agent/lark-login/qr` (desktop) — relay the QR image / outcome to the phone's SSE. */
  async relayLarkQr(
    userId: string,
    dto: { requestId: string; status: string; image?: string; message?: string },
  ): Promise<{ ok: boolean }> {
    this.events.publishUser(userId, {
      type: 'larkQr',
      requestId: dto.requestId,
      status: (dto.status as LarkQrStreamEvent['status']) || 'qr',
      image: dto.image,
      message: dto.message,
    } satisfies LarkQrStreamEvent);
    return { ok: true };
  }

  // ── CMS Bitable sync via the desktop relay ─────────────────────────────────

  /** `GET /v1/agent/cms-sync/jobs` — list the CMS connector jobs (server-side fetch of the shared
   *  CMS backend, so the web avoids CORS and never sees the base URL). Best-effort → [] on failure. */
  async listCmsSyncJobs(): Promise<{ jobs: unknown[] }> {
    try {
      const r = await fetch(`${CMS_SYNC_BASE}/bitable-sync`, { headers: { accept: 'application/json' } });
      const j = (await r.json().catch(() => null)) as unknown;
      const arr = Array.isArray(j)
        ? j
        : ((j as { data?: unknown[]; jobs?: unknown[] })?.data ?? (j as { jobs?: unknown[] })?.jobs ?? []);
      return { jobs: Array.isArray(arr) ? arr : [] };
    } catch {
      return { jobs: [] };
    }
  }

  /** `POST /v1/agent/cms-sync/run` (phone/web) — ask this user's desktop to run these CMS jobs with
   *  its LIVE Lark session (Approach B); progress streams back as `cmsSync` events. */
  async startCmsSyncRun(userId: string, jobIds: string[]): Promise<{ requestId: string }> {
    const requestId = randomBytes(8).toString('hex');
    this.events.publishAgent(userId, { type: 'cmsSyncRun', requestId, jobIds } satisfies AgentCommand);
    return { requestId };
  }

  /** `POST /v1/agent/cms-sync/result` (desktop) — relay live progress / final tally to the web SSE. */
  async relayCmsSync(userId: string, dto: CmsSyncResultDto): Promise<{ ok: boolean }> {
    this.events.publishUser(userId, {
      type: 'cmsSync',
      requestId: dto.requestId,
      kind: (dto.kind as CmsSyncStreamEvent['kind']) || 'progress',
      done: dto.done,
      total: dto.total,
      name: dto.name,
      ok: dto.ok,
      failed: dto.failed,
      lines: dto.lines,
    } satisfies CmsSyncStreamEvent);
    return { ok: true };
  }

  // ── Chat-over-relay: phone/web CHAT turn driven by the desktop CLI ──────────

  /** `POST /v1/agent/lark-chat/run` (phone/web) — ask this user's desktop to run a chat turn
   *  (Trợ lý AI general chat, or a Lark-connected chat) with its local CLI; events stream back
   *  as `larkChatEvent`. Returns a requestId the phone matches those events against. */
  async startLarkChat(userId: string, dto: LarkChatRunDto): Promise<{ requestId: string }> {
    const requestId = randomBytes(8).toString('hex');
    const input: LarkChatRelayInput = {
      // The "/" menu on the phone/web lists the user's SERVER-side skills, but the turn runs on the
      // desktop's own registry — so expand server commands here, before the prompt leaves us. The
      // matched token is stripped, so the desktop then only expands commands that are local to it.
      prompt: (await this.expandSkillCommands(userId, dto.prompt)).prompt,
      mode: dto.mode === 'build' ? 'build' : 'ask',
      scope: dto.scope === 'general' ? 'general' : undefined,
      activeBases: dto.activeBases?.map((b) => ({ appToken: b.appToken, name: b.name })),
      runner: dto.runner,
      model: dto.model,
      sessionId: dto.sessionId,
      resume: dto.resume === true,
    };
    this.events.publishAgent(userId, { type: 'larkChatRun', requestId, input } satisfies AgentCommand);
    return { requestId };
  }

  /** `POST /v1/agent/lark-chat/confirm` (phone/web) — allow/deny a gated write on the running turn. */
  async larkChatConfirm(userId: string, dto: LarkChatConfirmDto): Promise<{ ok: boolean }> {
    this.events.publishAgent(userId, {
      type: 'larkChatConfirm',
      requestId: dto.requestId,
      callId: dto.callId,
      decision: dto.decision === 'allow' ? 'allow' : 'deny',
    } satisfies AgentCommand);
    return { ok: true };
  }

  /** `POST /v1/agent/lark-chat/answer` (phone/web) — reply to an ask_user prompt. */
  async larkChatAnswer(userId: string, dto: LarkChatAnswerDto): Promise<{ ok: boolean }> {
    this.events.publishAgent(userId, {
      type: 'larkChatAnswer',
      requestId: dto.requestId,
      callId: dto.callId,
      answer: dto.answer,
    } satisfies AgentCommand);
    return { ok: true };
  }

  /** `POST /v1/agent/lark-chat/cancel` (phone/web) — stop the running turn. */
  async larkChatCancel(userId: string, requestId: string): Promise<{ ok: boolean }> {
    this.events.publishAgent(userId, { type: 'larkChatCancel', requestId } satisfies AgentCommand);
    return { ok: true };
  }

  // ── MAIC: hosted Claude (no local CLI, no desktop) — runs the turn SERVER-SIDE ────────

  /** `GET /v1/agent/maic/status` — is the hosted (MAIC) assistant configured on this server?
   *  The web uses it to decide between the hosted runtime and the desktop-relay runtime. */
  maicStatus(): { enabled: boolean } {
    return { enabled: this.maic.enabled };
  }

  /**
   * `POST /v1/agent/maic-chat/run` — run a general "Trợ lý AI" turn through the Larkwave-hosted
   * MAIC gateway, entirely server-side. Unlike startLarkChat (which relays to the desktop CLI),
   * this needs NO desktop and NO local Claude — so the web works standalone. Events stream back on
   * the SAME message SSE as `larkChatEvent` (so the shared AgentChat renders unchanged). Gated by
   * the user's % budget up front (402 on empty budget); metered after success. Returns a requestId.
   */
  async startMaicChat(user: AuthUser, dto: MaicChatRunDto): Promise<{ requestId: string }> {
    if (!this.maic.enabled) {
      throw new ServiceUnavailableException('Trợ lý AI (hosted) chưa được cấu hình.');
    }
    // Gate BEFORE any hosted call — throws 402 (QUOTA_EXCEEDED / FREE_PLAN_DISABLED) to the caller.
    await this.maicUsage.assertMaicAllowed(user);
    const requestId = randomBytes(8).toString('hex');
    void this.runMaicTurn(user.id, requestId, dto);
    return { requestId };
  }

  /** Drive one MAIC /v1/ask turn and stream it to the web as larkChatEvents, then meter its cost. */
  private async runMaicTurn(userId: string, requestId: string, dto: MaicChatRunDto): Promise<void> {
    const emit = (event: Record<string, unknown>): void => {
      this.events.publishUser(userId, {
        type: 'larkChatEvent',
        requestId,
        event,
      } satisfies LarkChatStreamEvent);
    };
    const abort = new AbortController();
    this.maicAborts.set(requestId, abort);
    try {
      // Gateway health preflight (global pool health, NOT per-user budget — that was gated above).
      const usage = await this.maic.usage(abort.signal).catch(() => null);
      if (usage && usage.available === false) {
        emit({ type: 'error', message: 'Trợ lý AI đang bận/hết lượt tạm thời. Thử lại sau ít phút nhé.' });
        emit({ type: 'done' });
        return;
      }
      // Multi-turn memory: map the client conversation id ↔ MAIC's own sessionId.
      const convId = dto.sessionId || requestId;
      const priorSession = dto.resume === true ? await this.maicUsage.getMaicSessionId(userId, convId) : null;
      // Stream token deltas to the UI. When the gateway ISN'T streaming yet it returns the whole
      // answer as one big delta — we reveal that in ~word chunks so it "types out" like Claude
      // (a purely cosmetic reveal). Real SSE tokens (small deltas) pass straight through untouched,
      // so this automatically becomes true token streaming once MAIC ships SSE.
      const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
      const invoked = await this.expandSkillCommands(userId, dto.prompt);

      // ATTACHMENTS. `/v1/ask` has no image channel, so a turn carrying images must go through the
      // agentic run, which takes a real workspace. Text/PDF attachments still ride `ask` (their
      // text is inlined below) — only images force the heavier path.
      const attach = dto.attachmentIds?.length
        ? await this.uploads.resolveForPrompt(userId, dto.attachmentIds).catch(() => null)
        : null;
      // Skill CÓ TỆP ĐÍNH KÈM cũng phải chạy ở đường agentic, dù người dùng không gửi tệp nào.
      //
      // Đường chữ thuần không có workspace: skill bảo "dùng biểu mẫu template_CI-PL.xlsx" thì
      // model không có gì để mở, nên nó đi tìm bằng Bash, lệnh rò ra chat và lượt chết giữa chừng.
      // Đường agentic thì tệp của skill được ghi ra THẬT (xem SKILL_ASSET_DIR) và nó tạo được file
      // kết quả để trả về. Skill chỉ có chữ hướng dẫn vẫn đi đường nhanh như cũ.
      const skillAssets = invoked.skillIds.length
        ? await this.skills.attachmentsFor(userId, invoked.skillIds).catch(() => [])
        : [];
      let lastTool = '';
      const hasUserFiles = !!(attach && (attach.images.length > 0 || attach.texts.length > 0));
      // ĐÃ VÀO VIỆC THÌ Ở LẠI. Người dùng gửi PI (agentic) rồi nhắn "không cần form mẫu, hãy tự
      // tạo" — lượt đó không đính kèm gì nên rơi về đường chữ thuần, nơi model VẪN gọi công cụ mà
      // KHÔNG BAO GIỜ nhận được kết quả: lượt chết ngay sau câu "Tôi kiểm tra môi trường trước.".
      const stickyAgentic = await this.maicUsage.isAgentic(userId, convId).catch(() => false);
      if (hasUserFiles || skillAssets.length > 0 || stickyAgentic) {
        if (!stickyAgentic) await this.maicUsage.markAgentic(userId, convId).catch(() => undefined);
        // Lượt có file cũng phải mang theo bối cảnh của lượt có file TRƯỚC ĐÓ: gửi hai tệp trong
        // hai tin nhắn liên tiếp là chuyện thường, và nếu không đọc ở đây thì tệp đầu biến mất.
        const priorFiles = (await this.maicUsage.takeCarryOver(userId, convId)) || '';
        const withPrior = priorFiles
          ? { ...invoked, prompt: `${priorFiles}\n\n[TIN NHẮN MỚI]\n${invoked.prompt}` }
          : invoked;
        const r = await this.runMaicChatWithFiles(
          userId,
          dto,
          withPrior,
          attach ?? { images: [], texts: [] },
          (d) => emit({ type: 'text', delta: d }),
          abort.signal,
          (name, detail) => {
            // Đóng bước trước rồi mở bước mới: chip đang chạy luôn là bước HIỆN TẠI, nên người
            // dùng thấy nó nhúc nhích chứ không phải một danh sách tĩnh.
            if (lastTool) emit({ type: 'tool_result', callId: lastTool, ok: true });
            lastTool = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
            emit({ type: 'tool_call', callId: lastTool, name, input: detail, gated: false });
          },
        );
        if (lastTool) emit({ type: 'tool_result', callId: lastTool, ok: true });
        // BỐI CẢNH CHO LƯỢT SAU. Lượt có file chạy qua agentic run, thứ KHÔNG có sessionId để nối
        // lại — nên nếu không ghi gì ở đây thì mọi thứ model vừa đọc được từ file biến mất ngay ở
        // tin nhắn kế tiếp. Với một tấm ẢNH thì bản ghi duy nhất về nội dung của nó chính là CÂU
        // TRẢ LỜI của model (ví dụ: 14 dòng hàng đọc từ ảnh PI) — nên lưu đúng thứ đó.
        // Điều kiện RỘNG hơn cái dùng để hiển thị: lưu bối cảnh là việc rẻ và im lặng, còn mất
        // bối cảnh thì lượt sau người dùng nghe "mình không nhận được ảnh nào". Sai về phía LƯU.
        const userSentFiles = !!(attach && (attach.images.length > 0 || attach.texts.length > 0));
        // Chỉ ghi bối cảnh khi NGƯỜI DÙNG thực sự gửi tệp. Lượt chỉ có tệp của skill mà vẫn ghi
        // "người dùng đã gửi kèm tệp" là nói dối với chính mình ở lượt sau.
        if (userSentFiles && r.status === 'succeeded' && strippedAnswer(r.answer).length >= 24) {
          // `images` chỉ có {mime,data} — tên tệp nằm ở `texts`. Ảnh thì mô tả theo số lượng.
          const names = [
            ...(attach?.images?.length ? [`${attach.images.length} ảnh`] : []),
            ...(attach?.texts ?? []).map((t) => t.name),
          ]
            .filter(Boolean)
            .join(', ');
          await this.maicUsage.saveCarryOver(
            userId,
            convId,
            `[LƯỢT TRƯỚC — người dùng đã gửi kèm tệp: ${names || 'tệp đính kèm'}]\n` +
              `Họ hỏi: ${invoked.prompt.slice(0, 1500)}\n` +
              `Bạn đã trả lời (đây là TOÀN BỘ những gì bạn còn nhớ về các tệp đó — bản thân tệp KHÔNG ` +
              `còn trong phiên này nữa, ĐỪNG nói là bạn không thấy tệp, hãy dùng lại dữ liệu dưới đây):\n` +
              r.answer.slice(0, 12000),
          );
        }
        if (r.status !== 'succeeded') {
          emit({ type: 'error', message: `Trợ lý AI không hoàn tất (${r.status}): ${r.error ?? 'không rõ lỗi'}` });
        } else if (!r.answer.trim()) {
          emit({
            type: 'text',
            delta:
              'Lượt này mình lỡ trả lời bằng lệnh nội bộ thay vì nội dung, nên không có gì để hiển thị. ' +
              'Bạn nhắn lại giúp mình nhé — nếu vẫn lặp, hãy mở một hội thoại MỚI.',
          });
        } else if (!isSubstantiveAnswer(r.answer)) {
          // The run can end after nothing but tool narration ("Tôi kiểm tra thư mục làm việc…"),
          // which is non-empty and so used to be shown as if it were the answer — the user got a
          // sentence about our internals and no result, with nothing saying it had gone wrong.
          emit({
            type: 'text',
            delta:
              '\n\n_(Chưa đọc xong file đính kèm nên chưa có kết quả. Bạn gửi lại tin nhắn giúp mình, ' +
              'hoặc nói rõ cần lấy thông tin gì trong file.)_',
          });
        }
        const made = await this.saveProducedFiles(userId, r.producedFiles);
        if (made.length) emit({ type: 'files', files: made });
        emit({ type: 'done' });
        return;
      }
      const attachedText = attach?.text ? `\n\n[Nội dung file đính kèm]\n${attach.text}` : '';
      // Bối cảnh từ một lượt có file trước đó — đọc RỒI XOÁ, vì từ lượt này trở đi nó đã nằm
      // trong phiên MAIC bình thường và không cần nhắc lại nữa.
      //
      // LUÔN đọc, KHÔNG phụ thuộc priorSession. Bản đầu tôi viết `priorSession ? '' : …` vì tưởng
      // có phiên cũ nghĩa là phiên đó đã biết mọi thứ. SAI: nếu hội thoại đã có một lượt CHỮ trước
      // lượt gửi file, phiên cũ vẫn tồn tại — nhưng nó chưa bao giờ thấy tệp, vì lượt file chạy ở
      // agentic run tách biệt. Kết quả là đúng cái ca người dùng gặp: bối cảnh bị bỏ, phiên cũ
      // được nối lại, AI nói chưa từng thấy tệp nào. Test của tôi bắt đầu NGAY bằng lượt file nên
      // không có phiên cũ và không lộ ra lỗi này.
      const carried = (await this.maicUsage.takeCarryOver(userId, convId)) || '';
      const carryText = carried ? `${carried}\n\n[TIN NHẮN MỚI]\n` : '';

      let rawSeen = '';
      let cleanSent = 0;
      // Cổng đầu: khi lượt này NỐI TIẾP một phiên (priorSession), giữ lại vài chục ký tự đầu TRƯỚC khi
      // phát — để kịp nhận ra nếu cả câu trả lời chỉ là lời nhắc "Phiên … không còn tồn tại … gọi lại
      // KHÔNG kèm sessionId" mà gateway trả về (HTTP 200, KHÔNG ném). Nếu đúng vậy thì NÉM để rơi vào
      // nhánh catch: dọn phiên chết + báo gọn, thay vì phun nguyên lời nhắc tiếng máy ra cho người dùng.
      // Không có phiên cũ ⇒ không cần cổng (phát ngay như thường).
      let headReleased = !priorSession;
      const res = await this.maic.askStream(
        {
          prompt: carryText + invoked.prompt + attachedText,
          model: dto.model,
          systemPrompt: await this.maicSystemFor(userId, dto.sessionId, undefined, invoked.skillIds),
          sessionId: priorSession || undefined,
          // Rich HTML/SVG artifacts can take a while to generate — allow beyond the 120s default.
          timeoutSec: 240,
          endUser: { id: userId },
        },
        async (delta) => {
          // Lọc rò lệnh công cụ Ở ĐÂY NỮA. Bản trước tôi chỉ gắn vào đường CÓ TỆP ĐÍNH KÈM, nên
          // một lượt chữ thuần — đúng lượt người dùng gặp — vẫn đẩy nguyên khối <invoke name="Bash">
          // ra màn hình. Lọc trên chuỗi TÍCH LUỸ vì một lệnh gọi dài bị cắt qua nhiều delta.
          rawSeen += delta;
          if (!headReleased) {
            // "không còn tồn tại" xuất hiện rất sớm trong lời nhắc → bắt được trước ngưỡng 160.
            if (rawSeen.length < 400 && isDeadMaicSession(rawSeen)) {
              throw new Error(`MAIC phiên đã chết: ${rawSeen.slice(0, 160)}`);
            }
            if (rawSeen.length < 160) return; // chưa đủ để loại trừ lời nhắc → giữ lại, chưa phát
            headReleased = true; // đủ dài mà không khớp ⇒ là câu trả lời thật, mở cổng
          }
          // Giữ lại phần đuôi có thể là khởi đầu một mốc mở: nếu không, người dùng nhìn thấy đúng
          // chuỗi "<inv" chỏng chơ ở cuối câu trả lời — mảnh đó tới trước khi mốc đủ để nhận ra.
          const { safe } = splitSafeTail(stripLeakedToolCalls(rawSeen));
          if (safe.length <= cleanSent) return;
          delta = safe.slice(cleanSent);
          cleanSent = safe.length;
          if (delta.length <= 80) {
            emit({ type: 'text', delta });
            return;
          }
          // Split into prose vs. complete fenced ```code``` blocks. Prose reveals ~word-by-word (the
          // "typing" feel); fenced blocks are emitted WHOLE so live artifacts (html/svg/mermaid)
          // render complete instead of flickering half-parsed during the reveal.
          for (const seg of delta.split(/(```[\s\S]*?```)/g)) {
            if (abort.signal.aborted) break;
            if (!seg) continue;
            if (seg.startsWith('```')) {
              emit({ type: 'text', delta: seg });
              continue;
            }
            const parts = seg.match(/\S+\s*/g) || [seg];
            for (let k = 0; k < parts.length; k += 4) {
              if (abort.signal.aborted) break;
              emit({ type: 'text', delta: parts.slice(k, k + 4).join('') });
              await sleep(16);
            }
          }
        },
        abort.signal,
      );
      if (res.sessionId) await this.maicUsage.saveMaicSessionId(userId, convId, res.sessionId);
      // KHÔNG BAO GIỜ để bong bóng trống. Nếu cả câu trả lời chỉ là lệnh gọi công cụ bị rò (bộ lọc
      // cắt sạch), người dùng nhìn thấy… không gì cả — tệ hơn cả nhìn thấy rác, vì họ không biết
      // đã có chuyện gì hay tin nhắn chưa gửi đi. Đo thật: người dùng hỏi lại và không nhận được
      // response nào.
      // Phát nốt phần đuôi đã giữ lại (nếu hoá ra chỉ là chữ thường).
      const finalClean = stripLeakedToolCalls(rawSeen);
      if (finalClean.length > cleanSent) {
        emit({ type: 'text', delta: finalClean.slice(cleanSent) });
        cleanSent = finalClean.length;
      }
      // Bị cắt vì lệnh rò ⇒ câu trả lời DANG DỞ. Nói ra, đừng để người dùng nhìn một câu cụt và
      // tưởng hệ thống hỏng — đo thật: họ thấy "Kiểm tra công cụ trước." rồi hết.
      if (cleanSent > 0 && finalClean.trimEnd().length < rawSeen.trimEnd().length) {
        emit({
          type: 'text',
          delta:
            '\n\n_(Lượt này mình dừng giữa chừng vì lỡ gọi lệnh nội bộ. Bạn nhắn lại giúp mình — ' +
            'nếu lặp lại, hãy mở hội thoại MỚI: phiên này đã ghi nhớ lối làm sai đó.)_',
        });
      }
      if (cleanSent === 0 && rawSeen.trim()) {
        emit({
          type: 'text',
          delta:
            'Lượt này mình lỡ trả lời bằng lệnh nội bộ thay vì nội dung, nên không có gì để hiển thị. ' +
            'Bạn nhắn lại giúp mình nhé — nếu vẫn lặp, hãy mở một hội thoại MỚI: hội thoại này đã ghi ' +
            'nhớ lối trả lời sai đó và có xu hướng lặp lại.',
        });
      }
      emit({ type: 'done' });
      // Meter AFTER success by REAL tokens (fallback to costUsd); idempotent per runId.
      await this.maicUsage.meterMaic(userId, {
        runId: res.runId,
        kind: 'ask',
        inputTokens: res.inputTokens,
        outputTokens: res.outputTokens,
        costUsd: res.costUsd,
      });
    } catch (e) {
      // A stored session that no longer exists fails this conversation FOREVER — the same dead id
      // is resent on every later turn. Drop it and tell the user to send again, rather than
      // surfacing the gateway's raw "Phiên … không còn tồn tại" with no way out. Nhờ CỔNG ĐẦU ở
      // trên, ca phiên-chết tới đây mà CHƯA phát gì ra client (lời nhắc bị giữ lại rồi ném) — nên
      // người dùng chỉ thấy thông báo gọn này, không thấy lời nhắc tiếng máy; lần gửi kế mở hội thoại mới.
      const msg = (e as Error)?.message || 'Lỗi khi chạy Trợ lý AI.';
      if (isDeadMaicSession(e)) {
        await this.maicUsage.clearMaicSessionId(userId, dto.sessionId || requestId);
        emit({
          type: 'error',
          message: 'Hội thoại cũ không còn trên máy chủ nên không nối tiếp được. Đã dọn — hãy gửi lại tin nhắn, lượt tới sẽ mở hội thoại mới.',
        });
        emit({ type: 'done' });
        return;
      }
      emit({ type: 'error', message: /aborted/i.test(msg) ? 'Đã dừng.' : msg });
      emit({ type: 'done' });
    } finally {
      this.maicAborts.delete(requestId);
    }
  }

  /**
   * A hosted chat turn that carries IMAGES.
   *
   * `/v1/ask` takes no image blocks, so the only way the model can actually SEE an attached
   * screenshot is the agentic run: seed the files into its workspace and tell it to Read them.
   * Without this the web assistant silently discarded every attachment — the chat bubble showed
   * the file (rendered from browser-local storage) while the server sent text only, so a skill
   * told to "read the attached contract" found nothing, tried to shell out, and its raw
   * `{"name":"Bash", …}` tool JSON was rendered to the user as the answer.
   *
   * `returnFiles: 'none'` — this is a conversation; we want the reply, not a diff.
   */
  private async runMaicChatWithFiles(
    userId: string,
    dto: MaicChatRunDto,
    invoked: { prompt: string; skillIds: string[] },
    attach: {
      text?: string;
      images?: { mime: string; data: string; name?: string }[];
      texts?: { name: string; content: string }[];
    },
    onDelta?: (delta: string) => void,
    signal?: AbortSignal,
    /** Báo mỗi bước công cụ agent thực hiện, để giao diện có gì đó hiện ra trong lúc chờ. */
    onTool?: (name: string, detail: string) => void,
  ): Promise<{
    answer: string;
    producedFiles: { path: string; content: string; encoding?: 'base64' }[];
    runId: string;
    status: string;
    error?: string;
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
  }> {
    const images = attach.images ?? [];
    const files: { path: string; content: string; encoding?: 'base64' }[] = images.map((img, i) => ({
      path: `${CHAT_ATTACH_DIR}/anh-${i + 1}.${attachExt(img.mime, img.name ?? '')}`,
      content: img.data,
      encoding: 'base64' as const,
    }));
    // Office/text attachments: uploads.service stores only their EXTRACTED TEXT, never the original
    // .xlsx/.docx bytes — so write that text out under the original filename + `.txt`. Seeding it as
    // a REAL file is the whole point: a skill saying "đọc file PI đính kèm" was sending the agent to
    // `ls` an empty working directory, and its raw tool call leaked into the chat as the answer.
    for (const t of attach.texts ?? []) {
      files.push({ path: `${CHAT_ATTACH_DIR}/${safeFileName(t.name)}.txt`, content: t.content });
    }
    // TỆP CỦA SKILL, ghi ra thành TỆP THẬT.
    //
    // expandCommands chỉ nhét nội dung chúng vào prompt dưới dạng chữ, nhưng chỉ dẫn của skill lại
    // nói với model như thể đó là một TỆP ("dùng mẫu template_CI-PL.xlsx"). Trong một agentic run
    // có Bash, model đi tìm nó trên ổ đĩa — đo thật trên hội thoại của người dùng: nó chạy
    // `find / -name 'template_CI-PL.xlsx'` và lệnh đó RÒ RA CHAT dưới dạng chữ, trở thành thứ
    // người dùng nhận được thay cho câu trả lời. Có tệp thật thì không phải đi tìm.
    const skillFiles = await this.skills.attachmentsFor(userId, invoked.skillIds).catch(() => []);
    for (const f of skillFiles) {
      files.push({ path: `${SKILL_ASSET_DIR}/${safeFileName(f.name)}`, content: f.content });
    }
    // MAIC từ chối một lượt chạy có workspace RỖNG ("workspace.files rỗng", 400). Nhưng một lượt
    // giữa chừng của công việc ("không cần form mẫu, hãy tự tạo") không đính kèm gì mà vẫn cần
    // công cụ để dựng ra tệp. Gieo một ghi chú tối thiểu để lượt chạy hợp lệ — và tiện thể nói
    // luôn cho agent biết đây là thư mục trống, đừng đi tìm tệp cũ.
    if (!files.length) {
      files.push({
        path: 'GHI-CHU.md',
        content:
          '# Thư mục làm việc\n\nLượt này người dùng không đính kèm tệp nào. Thư mục trống là đúng ' +
          '— đừng đi tìm tệp của các lượt trước, dữ liệu đó nằm trong lịch sử hội thoại. Bạn cứ tạo ' +
          'tệp mới ngay tại đây.\n',
      });
    }

    const userFiles = files.filter((f) => !f.path.startsWith(`${SKILL_ASSET_DIR}/`));
    const list = userFiles.map((f) => f.path).join(', ');
    const skillList = files
      .filter((f) => f.path.startsWith(`${SKILL_ASSET_DIR}/`))
      .map((f) => f.path)
      .join(', ');
    const system = await this.maicSystemFor(userId, dto.sessionId, undefined, invoked.skillIds);
    const prompt =
      `${system}\n\n` +
      (userFiles.length
        ? `NGƯỜI DÙNG ĐÍNH KÈM ${userFiles.length} FILE trong thư mục làm việc: ${list}. ` +
          `BẮT BUỘC dùng công cụ Read để MỞ và ĐỌC từng file trước khi trả lời — đó là dữ liệu chính ` +
          `của yêu cầu này.\n`
        : `Lượt này người dùng KHÔNG đính kèm tệp mới. Thư mục làm việc TRỐNG (ngoài tệp của skill ` +
          `nếu có) — đừng đi tìm tệp cũ, dữ liệu của các lượt trước nằm trong lịch sử hội thoại.\n`) +
      (skillList
        ? `TỆP CỦA SKILL (mẫu/cấu hình mà chỉ dẫn nhắc tới) đã có sẵn tại: ${skillList}. ` +
          `Dùng Read để mở chúng — TUYỆT ĐỐI KHÔNG đi tìm bằng find/ls ở nơi khác, không có bản nào khác.\n`
        : '') +
      `Trả lời bằng VĂN BẢN cho người dùng, ĐÚNG ngôn ngữ họ đang dùng (mặc định tiếng Việt). ` +
      `KHÔNG tạo/sửa file, KHÔNG in JSON công cụ ra câu trả lời, KHÔNG mô tả thao tác của mình.` +
      (attach.text ? `\n\n[Nội dung file dạng chữ]\n${attach.text}` : '') +
      `\n\n[Yêu cầu của người dùng]\n${invoked.prompt}`;

    // Lọc trên chuỗi TÍCH LUỸ chứ không phải từng mảnh stream.
    //
    // Bản trước lọc mỗi mảnh: khi model viết một lệnh gọi công cụ dài, nó bị cắt qua nhiều mảnh —
    // mảnh đầu có mốc mở nên bị chặn, các mảnh sau không có mốc nào nên đi thẳng ra màn hình.
    // Đo thật trên hội thoại người dùng: vẫn thấy nguyên khối <invoke name="Bash">. Ghép lại rồi
    // mới cắt, và chỉ phát ra PHẦN THÊM sau khi cắt, thì một lệnh gọi rò ra sẽ im hẳn từ ký tự
    // đầu tiên của nó.
    let raw = '';
    let shown = '';
    const res = await this.maic.runAgent(
      {
        prompt,
        files,
        // Tệp agent tạo ra phải mang về. `'none'` nghĩa là mọi hợp đồng .xlsx / báo cáo .pdf nó
        // viết ra đều bị xoá cùng workspace, và người dùng chỉ nhận được lời mô tả một tệp không
        // hề tồn tại — đúng thứ họ so sánh với claude.ai và thấy thiếu.
        returnFiles: 'all',
        // 'acceptEdits' CHẶN mọi lệnh chạy, nên trợ lý không thể tạo ra tệp: nó đọc được ảnh rồi
        // báo "mọi lệnh Python đều bị chặn và cần phê duyệt thủ công". Đó cũng là lý do những lần
        // nó thử `ls`/`find` bị chặn giữa chừng và phần lệnh dở dang rò ra chat.
        // Mặc định của MAIC là 'bypassPermissions'; workspace là thư mục tạm riêng cho từng lượt
        // chạy, nên đây không mở rộng phạm vi rủi ro.
        permissionMode: 'bypassPermissions',
        // Tạo một tệp .xlsx/.pdf tốn hơn hẳn một câu trả lời chữ.
        timeoutSec: 900,
        model: dto.model,
        endUser: { id: userId },
      },
      {
        signal,
        onEvent: (e) => {
          // Bước công cụ → giao diện. Không có kênh này thì một lượt chạy 5 phút chỉ hiện đúng câu
          // "I'll read the attached file first." rồi im lặng, người dùng không biết nó còn sống.
          if (onTool) {
            try {
              const content = ((e as { message?: { content?: unknown } })?.message?.content ?? []) as {
                type?: string;
                name?: string;
                input?: Record<string, unknown>;
              }[];
              if (Array.isArray(content)) {
                for (const c of content) {
                  if (c?.type !== 'tool_use') continue;
                  const d = c.input?.file_path ?? c.input?.path ?? c.input?.command ?? '';
                  onTool(String(c.name ?? 'tool'), String(d).slice(0, 80));
                }
              }
            } catch {
              /* event lạ — bỏ qua, không được làm hỏng lượt chạy */
            }
          }
          const t = rawAssistantText(e as { type?: string; message?: unknown });
          if (!t) return;
          raw += t;
          const { safe } = splitSafeTail(stripLeakedToolCalls(raw));
          if (safe.length > shown.length) {
            onDelta?.(safe.slice(shown.length));
            shown = safe;
          }
        },
      },
    );
    if (res.status === 'succeeded') {
      await this.maicUsage.meterMaic(userId, {
        runId: res.runId,
        kind: 'ask',
        inputTokens: res.inputTokens,
        outputTokens: res.outputTokens,
        costUsd: res.costUsd,
      });
    }
    return {
      answer: stripLeakedToolCalls(raw),
      producedFiles: res.files ?? [],
      runId: res.runId,
      status: res.status,
      error: res.error,
      inputTokens: res.inputTokens,
      outputTokens: res.outputTokens,
      costUsd: res.costUsd,
    };
  }


  /**
   * Lưu các tệp agent tạo ra thành Upload (purpose 'chat') để người dùng tải về.
   * Mọi lỗi đều nuốt: câu trả lời đã có rồi, không được để việc lưu tệp làm hỏng cả lượt.
   */
  private async saveProducedFiles(
    userId: string,
    produced: { path: string; content: string; encoding?: 'base64' }[],
  ): Promise<{ uploadId: string; name: string; size: number; mime: string }[]> {
    const out: { uploadId: string; name: string; size: number; mime: string }[] = [];
    // Ghi lại ĐƯỜNG DẪN THẬT: nếu agent nói đã tạo tệp mà danh sách trả về rỗng, đây là chỗ duy
    // nhất nhìn ra được nó đã ghi vào đâu — không có dòng này thì chỉ còn cách đoán.
    this.log.log(`run tạo ra ${produced?.length ?? 0} tệp: ${(produced ?? []).map((x) => x.path).join(', ').slice(0, 300)}`);
    const all = produced ?? [];
    for (const f of all.slice(0, 8)) {
      if (!f?.path || isSeededPath(f.path)) continue;
      try {
        // Không còn đoán gì nữa. `fetchRunFiles` đọc byte thật và gắn cờ `encoding` khi nội dung
        // không phải UTF-8 hợp lệ, nên ở đây chỉ việc giải mã đúng cờ đó.
        //
        // Trước đây chỗ này phải đoán giữa latin1/base64/utf8 rồi kiểm chữ ký ZIP, và vẫn sai đủ
        // nhiều để phải bắt model ghi kèm một tệp ".b64" thủ công. Cả hai thứ đó nay đã bỏ.
        const name = f.path.split('/').pop() || 'ket-qua';
        const buf = Buffer.from(f.content, f.encoding === 'base64' ? 'base64' : 'utf8');

        const ref = await this.uploads.storeGenerated(userId, name, buf);
        out.push({ uploadId: ref.id, name: ref.name, size: ref.size, mime: ref.mime });
      } catch (e) {
        // Nói ra lý do. Nuốt im lặng thì một tệp biến mất mà không ai biết tại sao — đúng cái đã
        // xảy ra: agent báo đã tạo lich.xlsx, danh sách trả về rỗng, không có manh mối nào.
        this.log.warn(`không lưu được tệp "${f.path}": ${(e as Error).message}`);
      }
    }
    return out;
  }

  /** `POST /v1/agent/maic-chat/cancel` — stop an in-flight MAIC turn. */
  maicChatCancel(_userId: string, requestId: string): { ok: boolean } {
    this.maicAborts.get(requestId)?.abort();
    return { ok: true };
  }

  /**
   * `POST /v1/agent/maic-tools` — mở một lượt chạy MAIC CÓ CÔNG CỤ, phát SSE về cho desktop.
   *
   * Vì sao phải đi vòng qua máy chủ thay vì desktop gọi thẳng MAIC: `MAIC_TOKEN` là khoá của cả
   * nền tảng. Đưa nó xuống máy người dùng là bất kỳ ai cũng gọi được MAIC bằng hạn mức chung.
   * Ở đây máy chủ giữ khoá, chặn theo gói của CHÍNH người dùng, và đo đúng vào sổ của họ.
   *
   * Công cụ thì ngược lại: chúng chạy TRÊN MÁY NGƯỜI DÙNG. MAIC chỉ hỏi "gọi tool này với tham
   * số này", desktop tự thực thi bằng kết nối Lark của họ rồi trả kết quả. Nên App Secret và
   * token cá nhân Lark không bao giờ đi qua máy chủ này.
   */
  async maicToolsStream(
    user: AuthUser,
    dto: {
      prompt: string;
      tools: { name: string; description?: string; inputSchema: object }[];
      model?: string;
      sessionId?: string;
      toolTimeoutSec?: number;
      timeoutSec?: number;
    },
    res: Response,
  ): Promise<void> {
    if (!this.maic.enabled) {
      res.status(503).json({ message: 'Trợ lý AI (hosted) chưa được cấu hình.' });
      return;
    }
    await this.maicUsage.assertMaicAllowed(user);
    if (!dto.prompt?.trim()) {
      res.status(400).json({ message: 'Thiếu prompt' });
      return;
    }
    if (!Array.isArray(dto.tools) || dto.tools.length === 0) {
      res.status(400).json({ message: 'Thiếu danh sách công cụ' });
      return;
    }

    // Desktop bỏ đi ⇒ phải CẮT kết nối lên MAIC, không chỉ ngừng ghi xuống.
    //
    // Đây chính là chỗ 900 giây bị đốt. `res.write()` vào một Express response đã chết KHÔNG ném
    // lỗi, nên vòng `for await` bên dưới cứ đọc tiếp và kết nối lên MAIC vẫn mở. MAIC chỉ huỷ lượt
    // chạy khi SSE của nó đóng, mà nó không bao giờ đóng. Trong khi đó model đang đứng chờ kết quả
    // của một công cụ sẽ KHÔNG BAO GIỜ tới, vì máy chạy công cụ đã tắt.
    //
    // Đo trên MAIC (10 ngày, 29/09/2026): 5209 lượt agent xong trung bình 52s, và 7 lượt hết đúng
    // 900s với `num_turns` rỗng — không turn nào, không token nào. Đúng hình dạng đứng chờ.
    const boCuoc = new AbortController();
    res.on('close', () => boCuoc.abort());

    const upstream = await this.maic.agentStream({
      prompt: dto.prompt,
      tools: dto.tools.slice(0, 64),
      endUser: { id: user.id, plan: 'pro' },
      ...(dto.model ? { model: dto.model } : {}),
      ...(dto.sessionId ? { sessionId: dto.sessionId } : {}),
      // Công cụ Lark chậm nhất đo được là TẢI TỆP (90 giây); mặc định 120 của MAIC vừa đủ nhưng
      // không có biên nào, và `listAllTables` còn bò nhiều trang nối nhau. Xin 180.
      toolTimeoutSec: dto.toolTimeoutSec ?? 180,
      ...(dto.timeoutSec ? { timeoutSec: dto.timeoutSec } : {}),
    }, boCuoc.signal);
    if (!upstream.ok || !upstream.body) {
      const t = await upstream.text().catch(() => '');
      res.status(upstream.status === 429 ? 429 : 502).json({ message: t.slice(0, 300) || 'MAIC từ chối' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    // Chuyển tiếp NGUYÊN VĂN từng dòng SSE, đồng thời tự đọc sự kiện `done` để ghi sổ hạn mức.
    // Không parse lại rồi dựng lại — làm thế là đẻ ra một hợp đồng thứ hai sẽ trôi lệch với MAIC.
    const dec = new TextDecoder();
    let buf = '';
    let runId = '';
    let daThayDone = false;
    try {
      for await (const chunk of upstream.body as unknown as AsyncIterable<Uint8Array>) {
        const text = dec.decode(chunk, { stream: true });
        res.write(text);
        buf += text;
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const ln of lines) {
          if (!ln.startsWith('data: ')) continue;
          try {
            const ev = JSON.parse(ln.slice(6)) as Record<string, unknown>;
            if (ev.type === 'run' && typeof ev.runId === 'string') runId = ev.runId;
            if (ev.type === 'done') {
              daThayDone = true;
              await this.maicUsage.meterMaic(user.id, {
                runId: runId || `agent-${Date.now()}`,
                kind: 'lark-agent',
                inputTokens: Number(ev.inputTokens) || 0,
                outputTokens: Number(ev.outputTokens) || 0,
                costUsd: Number(ev.costUsd) || 0,
              });
            }
          } catch {
            /* dòng không phải JSON — cứ chuyển tiếp, không chặn luồng */
          }
        }
      }
    } catch (e) {
      // Headers đã gửi rồi nên ném tiếp không tạo ra phản hồi HTTP nào có ích — ghi lại là đủ.
      // Abort do chính ta bắn ra khi desktop bỏ đi thì không phải lỗi, đừng làm ồn.
      if (!boCuoc.signal.aborted) {
        this.log.warn(`maic-tools ${runId || '?'} đứt luồng: ${(e as Error).message}`);
      }
    } finally {
      res.end();
      // Điều kiện cũ là `!res.writableEnded` đặt NGAY SAU `res.end()` — tức LUÔN LUÔN false, nên
      // `cancelRun` ở đây chưa từng chạy một lần nào kể từ lúc được viết ra. Chú thích cũ nói
      // "MAIC cũng tự huỷ khi mất SSE" là đúng, nhưng SSE đó không mất: nó nằm giữa MÁY CHỦ NÀY
      // và MAIC, còn thứ mất là kết nối xuống desktop.
      //
      // Mốc đúng là "đã thấy sự kiện `done` chưa", không phải trạng thái của response.
      if (runId && !daThayDone) {
        await this.maic.cancelRun(runId, 'Máy khách ngắt kết nối').catch(() => undefined);
      }
    }
  }

  /** Chuyển tiếp kết quả một lời gọi công cụ (desktop đã tự chạy) về lượt chạy MAIC đang chờ. */
  async maicToolResult(
    user: AuthUser,
    runId: string,
    payload: { toolUseId: string; content: string; isError?: boolean },
  ): Promise<{ ok: boolean; status: number }> {
    if (!this.maic.enabled) throw new ServiceUnavailableException('Trợ lý AI (hosted) chưa được cấu hình.');
    // Không cần kiểm quyền theo runId: runId do MAIC sinh, không đoán được, và lượt chạy chỉ sống
    // trong lúc kết nối SSE của chính người dùng còn mở.
    const r = await this.maic.toolResult(runId, payload);
    if (!r.ok) this.log.warn(`tool-result ${runId} → ${r.status}: ${r.body.slice(0, 160)} (user ${user.id})`);
    return { ok: r.ok, status: r.status };
  }

  /**
   * `POST /v1/agent/maic-ask` — SYNCHRONOUS hosted Trợ lý AI turn (no SSE). Used by the DESKTOP
   * hosted-mode path: the desktop main process POSTs and gets the answer back directly (simpler than
   * consuming the message SSE). Same gate + meter + multi-turn mapping as startMaicChat. `sessionId`
   * is the caller's stable conversation id (mapped to MAIC's own sessionId server-side).
   */
  async maicAsk(
    user: AuthUser,
    dto: MaicChatRunDto,
  ): Promise<{
    answer: string;
    sessionId: string;
    costUsd: number;
    runId: string;
    /** Tệp trợ lý tạo ra trong lượt này (rỗng ở lượt chữ thuần). */
    files?: { uploadId: string; name: string; size: number; mime: string }[];
  }> {
    if (!this.maic.enabled) {
      throw new ServiceUnavailableException('Trợ lý AI (hosted) chưa được cấu hình.');
    }
    await this.maicUsage.assertMaicAllowed(user);
    const convId = dto.sessionId || randomBytes(8).toString('hex');
    const prior = dto.resume === true ? await this.maicUsage.getMaicSessionId(user.id, convId) : null;
    const invoked = await this.expandSkillCommands(user.id, dto.prompt);
    // Images can't ride /v1/ask (no image channel) — route those turns through the agentic run so
    // the model can actually open the file. Same reason as the streaming path.
    const attach = dto.attachmentIds?.length
      ? await this.uploads.resolveForPrompt(user.id, dto.attachmentIds).catch(() => null)
      : null;
    // Cùng luật như đường streaming: skill CÓ TỆP ĐÍNH KÈM phải chạy ở đường agentic, dù người
    // dùng không gửi tệp nào — đường chữ thuần không có workspace để mở biểu mẫu của skill.
    const skillAssetsSync = invoked.skillIds.length
      ? await this.skills.attachmentsFor(user.id, invoked.skillIds).catch(() => [])
      : [];
    const stickySync = await this.maicUsage.isAgentic(user.id, convId).catch(() => false);
    if ((attach && (attach.images.length > 0 || attach.texts.length > 0)) || skillAssetsSync.length > 0 || stickySync) {
      if (!stickySync) await this.maicUsage.markAgentic(user.id, convId).catch(() => undefined);
      // Cùng cơ chế mang-bối-cảnh như đường streaming. Đường ĐỒNG BỘ này là đường bản desktop
      // dùng, và trước đây nó không lưu cũng không đọc gì — tức bản desktop quên y hệt.
      const priorFiles = (await this.maicUsage.takeCarryOver(user.id, convId)) || '';
      const withPrior = priorFiles
        ? { ...invoked, prompt: `${priorFiles}\n\n[TIN NHẮN MỚI]\n${invoked.prompt}` }
        : invoked;
      const r = await this.runMaicChatWithFiles(user.id, dto, withPrior, attach ?? { images: [], texts: [] });
      if (r.status !== 'succeeded') {
        throw new ServiceUnavailableException(`Trợ lý AI không hoàn tất (${r.status}): ${r.error ?? 'không rõ lỗi'}`);
      }
      // Chỉ ghi bối cảnh khi NGƯỜI DÙNG thực sự gửi tệp (xem đường streaming).
      if (attach && (attach.images.length > 0 || attach.texts.length > 0) && strippedAnswer(r.answer).length >= 24) {
        const names = [
          ...(attach?.images?.length ? [`${attach.images.length} ảnh`] : []),
          ...(attach?.texts ?? []).map((t) => t.name),
        ]
          .filter(Boolean)
          .join(', ');
        await this.maicUsage.saveCarryOver(
          user.id,
          convId,
          `[LƯỢT TRƯỚC — người dùng đã gửi kèm tệp: ${names || 'tệp đính kèm'}]\n` +
            `Họ hỏi: ${invoked.prompt.slice(0, 1500)}\n` +
            `Bạn đã trả lời (đây là TOÀN BỘ những gì bạn còn nhớ về các tệp đó — bản thân tệp KHÔNG ` +
            `còn trong phiên này nữa, ĐỪNG nói là bạn không thấy tệp, hãy dùng lại dữ liệu dưới đây):\n` +
            r.answer.slice(0, 12000),
        );
      }
      const made = await this.saveProducedFiles(user.id, r.producedFiles);
      return { answer: r.answer, sessionId: convId, costUsd: r.costUsd ?? 0, runId: r.runId, files: made };
    }
    const attachedText = attach?.text ? `\n\n[Nội dung file đính kèm]\n${attach.text}` : '';
    const carried = (await this.maicUsage.takeCarryOver(user.id, convId)) || '';
    const carryText = carried ? `${carried}\n\n[TIN NHẮN MỚI]\n` : '';
    const systemPrompt = await this.maicSystemFor(user.id, dto.sessionId, undefined, invoked.skillIds);
    const askOnce = (sessionId?: string) =>
      this.maic.ask({
        prompt: carryText + invoked.prompt + attachedText,
        model: dto.model,
        systemPrompt,
        sessionId,
        // Rich HTML/SVG artifacts can take a while to generate — allow beyond the 120s default.
        timeoutSec: 240,
        endUser: { id: user.id },
      });
    let res: Awaited<ReturnType<typeof this.maic.ask>>;
    try {
      res = await askOnce(prior || undefined);
    } catch (e) {
      // A dead stored session would otherwise fail this conversation forever — drop it and open
      // a fresh one. The user loses the prior context, which beats losing the assistant entirely.
      if (!prior || !isDeadMaicSession(e)) throw e;
      await this.maicUsage.clearMaicSessionId(user.id, convId);
      res = await askOnce(undefined);
    }
    // MAIC KHÔNG phải lúc nào cũng NÉM khi phiên đã chết: nhiều khi nó trả HTTP 200 với `answer` chính
    // là lời nhắc "Phiên … không còn tồn tại … gọi lại KHÔNG kèm sessionId". Try/catch ở trên không
    // bắt được ca này → người dùng nhận nguyên lời nhắc đó làm câu trả lời. Bắt luôn: chỉ khi ta có
    // gửi phiên (prior) và answer NGẮN đúng dạng lời nhắc (chặn dương-tính-giả với câu trả lời dài vô
    // tình nhắc tới "không còn tồn tại") → dọn phiên chết, chạy lại KHÔNG kèm phiên để mở hội thoại mới.
    if (prior && res.answer && res.answer.length < 600 && isDeadMaicSession(res.answer)) {
      await this.maicUsage.clearMaicSessionId(user.id, convId);
      res = await askOnce(undefined);
    }
    await this.maicUsage.saveMaicSessionId(user.id, convId, res.sessionId);
    await this.maicUsage.meterMaic(user.id, {
      runId: res.runId,
      kind: 'ask',
      inputTokens: res.inputTokens,
      outputTokens: res.outputTokens,
      costUsd: res.costUsd,
    });
    return { answer: res.answer, sessionId: convId, costUsd: res.costUsd, runId: res.runId };
  }

  /** `POST /v1/agent/lark-chat/event` (desktop → server) — relay one chat stream event to the web SSE. */
  async relayLarkChatEvent(userId: string, dto: LarkChatEventDto): Promise<{ ok: boolean }> {
    this.events.publishUser(userId, {
      type: 'larkChatEvent',
      requestId: dto.requestId,
      event: dto.event,
    } satisfies LarkChatStreamEvent);
    return { ok: true };
  }

  // ── Lark RPC over relay: web runs one allow-listed Lark method on the desktop ──

  /** `POST /v1/agent/lark-rpc` (web) — ask the desktop to run one Lark runtime method; the result
   *  comes back on the message SSE as `larkRpcResult`. The desktop enforces the method allow-list. */
  async startLarkRpc(userId: string, dto: LarkRpcRunDto): Promise<{ requestId: string }> {
    const requestId = randomBytes(8).toString('hex');
    this.events.publishAgent(userId, {
      type: 'larkRpc',
      requestId,
      method: dto.method,
      args: Array.isArray(dto.args) ? dto.args : [],
    } satisfies AgentCommand);
    return { requestId };
  }

  /** `POST /v1/agent/lark-rpc/result` (desktop → server) — relay one Lark RPC result to the web SSE. */
  async relayLarkRpcResult(userId: string, dto: LarkRpcResultDto): Promise<{ ok: boolean }> {
    this.events.publishUser(userId, {
      type: 'larkRpcResult',
      requestId: dto.requestId,
      ok: dto.ok,
      result: dto.result,
      error: dto.error,
    } satisfies LarkRpcResultEvent);
    return { ok: true };
  }

  // ── AgentChat ("Trợ lý AI") history sync — desktop ↔ server ↔ web ───────────

  /** `GET /v1/agent/chat/index` — the user's conversation META + projects (bodies fetched per-id). */
  async getChatIndex(userId: string): Promise<AgentChatIndex> {
    const [convs, projects] = await Promise.all([
      this.prisma.agentChatConversation.findMany({
        where: { userId },
        select: { id: true, title: true, sessionId: true, clientTs: true, projectId: true, pinned: true },
        orderBy: { clientTs: 'desc' },
        take: 200,
      }),
      this.prisma.agentChatProject.findMany({ where: { userId }, orderBy: { ord: 'asc' }, select: { id: true, name: true } }),
    ]);
    return {
      conversations: convs.map((c) => ({
        id: c.id,
        title: c.title,
        sessionId: c.sessionId,
        updatedAt: c.clientTs,
        ...(c.projectId ? { projectId: c.projectId } : {}),
        ...(c.pinned ? { pinned: true } : {}),
      })),
      projects: projects.map((p) => ({ id: p.id, name: p.name })),
    };
  }

  /** `GET /v1/agent/chat/body/:id` — one conversation's text-only body (null if not found/owned). */
  async getChatBody(userId: string, id: string): Promise<{ body: unknown[] | null }> {
    const row = await this.prisma.agentChatConversation.findFirst({ where: { id, userId }, select: { body: true } });
    return { body: row ? (row.body as unknown[]) : null };
  }

  /** `PUT /v1/agent/chat/index` — upsert conversation META (newest `updatedAt` wins; bodies untouched). */
  async pushChatIndex(userId: string, dto: AgentChatIndexPushDto): Promise<{ ok: boolean }> {
    const list = dto.conversations.slice(0, 200);
    const ids = list.map((c) => c.id);
    const existing = await this.prisma.agentChatConversation.findMany({
      where: { id: { in: ids } },
      select: { id: true, userId: true, clientTs: true },
    });
    const map = new Map(existing.map((e) => [e.id, e]));
    const writes = list
      .filter((c) => {
        const e = map.get(c.id);
        if (e && e.userId !== userId) return false; // never touch another user's row
        if (e && c.updatedAt < e.clientTs) return false; // keep the newer copy
        return true;
      })
      .map((c) => {
        const meta = {
          title: c.title,
          sessionId: c.sessionId,
          projectId: c.projectId ?? null,
          pinned: c.pinned ?? false,
          clientTs: c.updatedAt,
        };
        return this.prisma.agentChatConversation.upsert({
          where: { id: c.id },
          create: { id: c.id, userId, body: [], ...meta },
          update: meta,
        });
      });
    if (writes.length) await this.prisma.$transaction(writes);
    return { ok: true };
  }

  /** `PUT /v1/agent/chat/body/:id` — upsert one conversation fully (meta + body); newest wins. */
  async pushChatBody(userId: string, id: string, dto: AgentChatBodyPushDto): Promise<{ ok: boolean }> {
    const existing = await this.prisma.agentChatConversation.findUnique({
      where: { id },
      select: { userId: true, clientTs: true },
    });
    if (existing && existing.userId !== userId) return { ok: false };
    const ts = dto.meta.updatedAt;
    if (existing && ts < existing.clientTs) return { ok: true }; // a newer copy already stored
    const data = {
      userId,
      title: dto.meta.title,
      sessionId: dto.meta.sessionId,
      projectId: dto.meta.projectId ?? null,
      pinned: dto.meta.pinned ?? false,
      clientTs: ts,
      body: (dto.body ?? []) as Prisma.InputJsonValue,
    };
    await this.prisma.agentChatConversation.upsert({ where: { id }, create: { id, ...data }, update: data });
    return { ok: true };
  }

  /** `PUT /v1/agent/chat/projects` — sync the user's projects (UPSERT name+ord, PRESERVE each
   *  project's custom `instructions`; delete only the projects the client removed). */
  async pushChatProjects(userId: string, dto: AgentChatProjectsPushDto): Promise<{ ok: boolean }> {
    const projects = dto.projects.slice(0, 100);
    const keepIds = projects.map((p) => p.id);
    await this.prisma.$transaction([
      this.prisma.agentChatProject.deleteMany({
        where: { userId, id: { notIn: keepIds.length ? keepIds : ['__none__'] } },
      }),
      ...projects.map((p, i) =>
        this.prisma.agentChatProject.upsert({
          where: { id: p.id },
          create: { id: p.id, userId, name: p.name, ord: i },
          update: { name: p.name, ord: i }, // instructions untouched
        }),
      ),
    ]);
    return { ok: true };
  }

  /** `GET /v1/agent/chat/projects` — the user's projects WITH their custom instructions. */
  async listChatProjects(
    userId: string,
  ): Promise<{ id: string; name: string; instructions: string; ord: number }[]> {
    return this.prisma.agentChatProject.findMany({
      where: { userId },
      orderBy: { ord: 'asc' },
      select: { id: true, name: true, instructions: true, ord: true },
    });
  }

  /** `PATCH /v1/agent/chat/projects/:id` — edit a project's name / custom instructions. */
  async updateChatProject(
    userId: string,
    id: string,
    patch: { name?: string; instructions?: string },
  ): Promise<{ id: string; name: string; instructions: string; ord: number }> {
    const owned = await this.prisma.agentChatProject.findFirst({ where: { id, userId }, select: { id: true } });
    if (!owned) throw new NotFoundException('Dự án không tồn tại');
    const row = await this.prisma.agentChatProject.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name.trim().slice(0, 120) } : {}),
        ...(patch.instructions !== undefined ? { instructions: patch.instructions.slice(0, 8000) } : {}),
      },
      select: { id: true, name: true, instructions: true, ord: true },
    });
    return row;
  }

  /** `DELETE /v1/agent/chat/:id` — remove one conversation (own rows only). */
  async deleteChatConv(userId: string, id: string): Promise<{ ok: boolean }> {
    await this.prisma.agentChatConversation.deleteMany({ where: { id, userId } });
    return { ok: true };
  }

  // ── Public conversation share (read-only transcript at /s/<slug>) ──

  private shareSlug(): string {
    return randomBytes(8).toString('base64url').slice(0, 12);
  }

  /** Make a conversation public (idempotent) → its share slug. */
  async shareChatConv(userId: string, id: string): Promise<{ slug: string }> {
    const conv = await this.prisma.agentChatConversation.findFirst({ where: { id, userId }, select: { shareSlug: true } });
    if (!conv) throw new NotFoundException('Không tìm thấy hội thoại.');
    if (conv.shareSlug) return { slug: conv.shareSlug };
    const slug = this.shareSlug();
    await this.prisma.agentChatConversation.update({ where: { id }, data: { shareSlug: slug } });
    return { slug };
  }

  async unshareChatConv(userId: string, id: string): Promise<{ ok: boolean }> {
    await this.prisma.agentChatConversation.updateMany({ where: { id, userId }, data: { shareSlug: null } });
    return { ok: true };
  }

  /** PUBLIC read-only transcript (text-only user/assistant messages). */
  async getPublicChatConv(slug: string): Promise<PublicChatConv> {
    const conv = await this.prisma.agentChatConversation.findFirst({
      where: { shareSlug: slug },
      select: { title: true, body: true, updatedAt: true, user: { select: { name: true, email: true } } },
    });
    if (!conv) throw new NotFoundException('Liên kết không tồn tại hoặc đã được gỡ.');
    const raw = Array.isArray(conv.body) ? (conv.body as Array<Record<string, unknown>>) : [];
    const messages = raw
      .filter(
        (it) =>
          it && it.kind === 'msg' && (it.role === 'user' || it.role === 'assistant') && typeof it.text === 'string' && (it.text as string).trim(),
      )
      .map((it) => ({ role: it.role as 'user' | 'assistant', text: String(it.text) }));
    return {
      title: conv.title || 'Cuộc trò chuyện',
      author: conv.user?.name || conv.user?.email?.split('@')[0] || 'Larkwave',
      updatedAt: conv.updatedAt.toISOString(),
      messages,
    };
  }

  // ── Public chat-able assistant links (/g/<slug>) — hosted MAIC, metered to the OWNER ──

  private assistantShareInfo(r: {
    id: string; slug: string; label: string; enabled: boolean; projectId: string | null;
    turnsPerDay: number; usesTotal: number; lastUsedAt: Date | null; createdAt: Date;
  }): AssistantShareInfo {
    return {
      id: r.id, slug: r.slug, label: r.label, enabled: r.enabled, projectId: r.projectId || undefined,
      turnsPerDay: r.turnsPerDay, usesTotal: r.usesTotal, lastUsedAt: r.lastUsedAt?.toISOString() || null,
      createdAt: r.createdAt.toISOString(),
    };
  }

  async listAssistantShares(userId: string): Promise<AssistantShareInfo[]> {
    const rows = await this.prisma.assistantShare.findMany({ where: { ownerId: userId }, orderBy: { createdAt: 'desc' } });
    return rows.map((r) => this.assistantShareInfo(r));
  }

  async createAssistantShare(userId: string, dto: { label?: string; projectId?: string }): Promise<AssistantShareInfo> {
    const r = await this.prisma.assistantShare.create({
      data: { ownerId: userId, slug: this.shareSlug(), label: (dto.label || 'Trợ lý AI').slice(0, 60), projectId: dto.projectId || null },
    });
    return this.assistantShareInfo(r);
  }

  async updateAssistantShare(userId: string, id: string, dto: { enabled?: boolean; label?: string }): Promise<{ ok: boolean }> {
    await this.prisma.assistantShare.updateMany({
      where: { id, ownerId: userId },
      data: {
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.label !== undefined ? { label: dto.label.slice(0, 60) } : {}),
      },
    });
    return { ok: true };
  }

  async deleteAssistantShare(userId: string, id: string): Promise<{ ok: boolean }> {
    await this.prisma.assistantShare.deleteMany({ where: { id, ownerId: userId } });
    return { ok: true };
  }

  /** PUBLIC metadata for /g/<slug>. */
  async getPublicAssistant(slug: string): Promise<PublicAssistantInfo> {
    const r = await this.prisma.assistantShare.findUnique({
      where: { slug },
      select: { slug: true, label: true, enabled: true, owner: { select: { name: true, email: true } } },
    });
    if (!r) throw new NotFoundException('Liên kết không tồn tại.');
    return {
      slug: r.slug,
      label: r.label || 'Trợ lý AI',
      owner: r.owner?.name || r.owner?.email?.split('@')[0] || 'Larkwave',
      enabled: r.enabled,
    };
  }

  /** PUBLIC: one anonymous read-only turn against a public assistant, streamed as SSE.
   *  Runs on hosted MAIC, metered to the OWNER's % budget; rate-limited per-slug (day/hour) + per-IP. */
  async publicAssistantAsk(slug: string, prompt: string, ip: string, res: Response): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    const send = (o: Record<string, unknown>): void => { res.write(`data: ${JSON.stringify(o)}\n\n`); };
    const fail = (message: string): void => { send({ type: 'error', message }); send({ type: 'done' }); res.end(); };
    try {
      const share = await this.prisma.assistantShare.findUnique({ where: { slug } });
      if (!share || !share.enabled) return fail('Liên kết không khả dụng.');
      const clean = (prompt || '').trim().slice(0, 4000);
      if (!clean) return fail('Nội dung trống.');
      if (!this.maic.enabled) return fail('Trợ lý AI (hosted) chưa được cấu hình.');

      const now = Date.now();
      const [inDay, inHour, ipHour] = await Promise.all([
        this.prisma.assistantShareHit.count({ where: { shareId: share.id, createdAt: { gt: new Date(now - 86_400_000) } } }),
        this.prisma.assistantShareHit.count({ where: { shareId: share.id, createdAt: { gt: new Date(now - 3_600_000) } } }),
        this.prisma.assistantShareHit.count({ where: { shareId: share.id, ip, createdAt: { gt: new Date(now - 3_600_000) } } }),
      ]);
      if (inDay >= share.turnsPerDay) return fail('Link đã đạt giới hạn lượt/ngày. Thử lại sau.');
      if (inHour >= share.turnsPerHour) return fail('Đang quá tải (giới hạn theo giờ). Thử lại sau ít phút.');
      if (ipHour >= Math.max(5, Math.ceil(share.turnsPerHour / 3))) return fail('Bạn gửi quá nhanh. Thử lại sau ít phút.');

      // Owner-budget gate (fetch role so an admin owner isn't wrongly blocked).
      const owner = await this.prisma.user.findUnique({ where: { id: share.ownerId }, select: { role: true } });
      try {
        await this.maicUsage.assertMaicAllowed({ id: share.ownerId, role: owner?.role } as AuthUser);
      } catch {
        return fail('Chủ trợ lý đã dùng hết hạn mức tháng này.');
      }

      // Count the hit up front (rate-limit accounting).
      await this.prisma.assistantShareHit.create({ data: { shareId: share.id, ip } }).catch(() => undefined);

      const abort = new AbortController();
      res.on('close', () => abort.abort());
      const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
      const result = await this.maic.askStream(
        {
          prompt: clean,
          systemPrompt: await this.maicSystemFor(share.ownerId, undefined, share.projectId || undefined),
          timeoutSec: 180,
          // Khách vãng lai dùng link chia sẻ — tính vào hạn mức của CHỦ share,
          // đúng người mà meterMaic bên dưới đang trừ.
          endUser: { id: share.ownerId },
        },
        async (delta) => {
          if (delta.length <= 80) { send({ type: 'text', delta }); return; }
          for (const seg of delta.split(/(```[\s\S]*?```)/g)) {
            if (abort.signal.aborted) break;
            if (!seg) continue;
            if (seg.startsWith('```')) { send({ type: 'text', delta: seg }); continue; }
            const parts = seg.match(/\S+\s*/g) || [seg];
            for (let k = 0; k < parts.length; k += 4) {
              if (abort.signal.aborted) break;
              send({ type: 'text', delta: parts.slice(k, k + 4).join('') });
              await sleep(16);
            }
          }
        },
        abort.signal,
      );
      send({ type: 'done' });
      await this.maicUsage
        .meterMaic(share.ownerId, { runId: result.runId || randomBytes(8).toString('hex'), kind: 'share', inputTokens: result.inputTokens, outputTokens: result.outputTokens, costUsd: result.costUsd })
        .catch(() => undefined);
      await this.prisma.assistantShare.update({ where: { id: share.id }, data: { usesTotal: { increment: 1 }, lastUsedAt: new Date() } }).catch(() => undefined);
    } catch (e) {
      const msg = (e as Error)?.message || 'Lỗi khi chạy Trợ lý AI.';
      send({ type: 'error', message: /aborted/i.test(msg) ? 'Đã dừng.' : msg.slice(0, 200) });
      send({ type: 'done' });
    } finally {
      res.end();
    }
  }

  /** `POST /v1/agent/webhook` — resolve the user by Apikey then enqueue. Mirrors
   *  the SePay `Authorization: Apikey <token>` parsing. Checks the NAMED tokens first
   *  (stamping lastUsedAt), then falls back to the legacy single User.agentTokenHash. */
  async webhookEnqueue(
    authHeader: string | undefined,
    dto: CreateRemoteTaskDto,
  ): Promise<CreateRemoteTaskResponse> {
    const header = (authHeader ?? '').trim();
    const [scheme, ...rest] = header.split(/\s+/);
    const token = rest.join(' ');
    if (scheme.toLowerCase() !== 'apikey' || !token) {
      throw new UnauthorizedException('Sai webhook API key');
    }
    const hash = this.sha256(token);
    const named = await this.prisma.agentWebhookToken.findUnique({
      where: { tokenHash: hash },
      select: { id: true, userId: true, notifyLarkWebhookUrl: true, notifyTelegramChatId: true },
    });
    if (named) {
      await this.prisma.agentWebhookToken
        .update({ where: { id: named.id }, data: { lastUsedAt: new Date() } })
        .catch(() => undefined);
      return this.enqueue(named.userId, dto, {
        source: 'webhook',
        notifyLarkWebhookUrl: named.notifyLarkWebhookUrl,
        notifyTelegramChatId: named.notifyTelegramChatId,
      });
    }
    const user = await this.prisma.user.findFirst({
      where: { agentTokenHash: hash },
      select: { id: true },
    });
    if (!user) throw new UnauthorizedException('Sai webhook API key');
    return this.enqueue(user.id, dto, { source: 'webhook' });
  }
}
