import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { RemoteTaskEventItem } from '@larkwave/shared';

/** `POST /v1/agent/tasks` (phone JWT) + `POST /v1/agent/webhook` (Apikey) body.
 *  Implements the shared `CreateRemoteTaskRequest` shape. */
export class CreateRemoteTaskDto {
  @IsString()
  @MinLength(1, { message: 'Prompt trống' })
  @MaxLength(20000)
  prompt!: string;

  /** CLI runner id (default 'claude'). Validated as a free string; the service
   *  casts it to RunnerId. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  runner?: string;

  /** Model id within the runner. */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  model?: string;

  /** Target a specific device; default = the user's most-recently-seen online one. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  deviceId?: string;

  /** File this task under a named conversation (default = unfiled). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  conversationId?: string;
}

/** `POST /v1/agent/conversations` + `PATCH /v1/agent/conversations/:id` body. */
export class ConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  title?: string;
}

/** `POST /v1/agent/tokens` body — create a named webhook token. */
export class CreateAgentTokenDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;
}

/** `PUT /v1/agent/tokens/:id/notify` body — set a token's outbound notify target.
 *  Omitted field = leave unchanged; empty string = clear. */
export class UpdateTokenNotifyDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notifyLarkWebhookUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  notifyTelegramChatId?: string;
}

/** `PUT /v1/agent/telegram/admin` body — set/clear the platform Telegram bot token. */
export class SetTelegramBotDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  botToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  botUsername?: string;
}

/** `POST /v1/agent/lark-login/qr` body — desktop relays the login QR image / outcome. */
export class LarkQrDto {
  @IsString()
  requestId!: string;

  @IsString()
  status!: string;

  /** data:image/…;base64 screenshot (can be a few hundred KB — the route raises the body limit). */
  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

/** `POST /v1/agent/cms-sync/run` (phone/web) — run these CMS Bitable jobs on the desktop. */
export class CmsSyncRunDto {
  @IsArray()
  @IsString({ each: true })
  jobIds!: string[];
}

/** `POST /v1/agent/cms-sync/result` (desktop → server) — relay live progress / final tally. */
export class CmsSyncResultDto {
  @IsString()
  requestId!: string;

  @IsString()
  kind!: string; // 'progress' | 'done'

  @IsOptional()
  @IsInt()
  done?: number;

  @IsOptional()
  @IsInt()
  total?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  name?: string;

  @IsOptional()
  @IsInt()
  ok?: number;

  @IsOptional()
  @IsInt()
  failed?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lines?: string[];
}

// ── Chat-over-relay: phone/web CHAT turn driven by this user's desktop CLI ────

class LarkChatBaseDto {
  @IsString()
  @MaxLength(200)
  appToken!: string;

  @IsString()
  @MaxLength(200)
  name!: string;
}

/** `POST /v1/agent/lark-chat/run` (phone/web) — run a chat turn on the desktop.
 *  Implements the shared `LarkChatRelayInput` shape. */
export class LarkChatRunDto {
  @IsString()
  @MinLength(1, { message: 'Prompt trống' })
  @MaxLength(20000)
  prompt!: string;

  /** 'ask' = read-only Q&A; 'build' = writes allowed (each write confirmed on the phone). */
  @IsString()
  mode!: string;

  /** 'general' = the standalone Trợ lý AI (no Lark); omit for a Lark-connected chat. */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  scope?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LarkChatBaseDto)
  activeBases?: LarkChatBaseDto[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  runner?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  sessionId?: string;

  @IsOptional()
  resume?: boolean;
}

/** `POST /v1/agent/lark-chat/confirm` (phone/web) — allow/deny a gated write. */
export class LarkChatConfirmDto {
  @IsString()
  requestId!: string;

  @IsString()
  callId!: string;

  @IsString()
  decision!: string; // 'allow' | 'deny'
}

/** `POST /v1/agent/lark-chat/answer` (phone/web) — reply to an ask_user prompt. */
export class LarkChatAnswerDto {
  @IsString()
  requestId!: string;

  @IsString()
  callId!: string;

  @IsString()
  @MaxLength(20000)
  answer!: string;
}

/** `POST /v1/agent/lark-chat/cancel` (phone/web) — stop the running turn. */
export class LarkChatCancelDto {
  @IsString()
  requestId!: string;
}

/** `POST /v1/agent/maic-chat/run` — run a general Trợ lý AI turn SERVER-SIDE via MAIC (hosted
 *  Claude), no desktop needed. Typed (never unknown[]) so ValidationPipe keeps every field. */
export class MaicChatRunDto {
  @IsString()
  @MinLength(1, { message: 'Prompt trống' })
  @MaxLength(20000)
  prompt!: string;

  /** 'ask' | 'build' — Phase 1 is ask-only (no tools); kept for shape parity. */
  @IsOptional()
  @IsString()
  @MaxLength(16)
  mode?: string;

  /** 'general' for the standalone Trợ lý AI (the only MAIC chat scope in Phase 1). */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  scope?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  model?: string;

  /** Client conversation id — mapped to MAIC's own sessionId server-side for multi-turn memory. */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  sessionId?: string;

  /** Continue the mapped MAIC session (resend its sessionId) instead of starting fresh. */
  @IsOptional()
  resume?: boolean;

  /**
   * Uploads (`POST /v1/uploads`) to attach to this turn.
   *
   * Until now the web assistant NEVER sent attachments — the bubble rendered the file from local
   * browser storage while the server saw text only, so a skill told to "read the attached
   * contract" found nothing, tried to shell out, and leaked raw tool JSON into the chat. Images
   * in particular cannot ride `/v1/ask` at all (no image channel), so a turn carrying them is
   * routed through the agentic run instead, with the files seeded into its workspace.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  attachmentIds?: string[];
}

export class MaicChatCancelDto {
  @IsString()
  requestId!: string;
}

/** `POST /v1/agent/lark-chat/event` (desktop → server) — relay one chat stream event. */
export class LarkChatEventDto {
  @IsString()
  requestId!: string;

  @IsObject()
  event!: Record<string, unknown>;
}

// ── AgentChat ("Trợ lý AI") history sync ─────────────────────────────────────

/** One conversation's META. Implements the shared `AgentChatConvMeta`. */
export class AgentChatConvMetaDto {
  @IsString()
  @MaxLength(128)
  id!: string;

  @IsString()
  @MaxLength(300)
  title!: string;

  @IsString()
  @MaxLength(128)
  sessionId!: string;

  @IsNumber()
  updatedAt!: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  projectId?: string;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}

export class AgentChatProjectDto {
  @IsString()
  @MaxLength(128)
  id!: string;

  @IsString()
  @MaxLength(200)
  name!: string;
}

/** `PUT /v1/agent/chat/index` — upsert the user's conversation META (bodies untouched). */
export class AgentChatIndexPushDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgentChatConvMetaDto)
  conversations!: AgentChatConvMetaDto[];
}

/** `PUT /v1/agent/chat/projects` — replace the user's projects. */
export class AgentChatProjectsPushDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgentChatProjectDto)
  projects!: AgentChatProjectDto[];
}

/** `PATCH /v1/agent/chat/projects/:id` — edit a project's name / custom instructions. */
export class UpdateChatProjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  instructions?: string;
}

/** `PUT /v1/agent/chat/body/:id` — upsert one conversation fully (meta + text-only body). */
export class AgentChatBodyPushDto {
  @ValidateNested()
  @Type(() => AgentChatConvMetaDto)
  meta!: AgentChatConvMetaDto;

  /** Item[] — messages + tool lines, text-only. Typed `unknown` (NOT `unknown[]`) ON PURPOSE: the
   *  global ValidationPipe (transform + whitelist) EMPTIES nested objects inside an untyped
   *  `unknown[]` array field, but a single `unknown` survives intact. Guarded with Array.isArray downstream. */
  @IsOptional()
  body?: unknown;
}

// ── Lark RPC over relay (full-parity LarkChat on the web) ────────────────────

/** `POST /v1/agent/lark-rpc` (web) — run one allow-listed Lark runtime method on the desktop. */
export class LarkRpcRunDto {
  @IsString()
  @MaxLength(64)
  method!: string;

  // Typed `unknown` (NOT `unknown[]`) ON PURPOSE: the ValidationPipe empties nested objects inside an
  // untyped `unknown[]` array field (the relay session-save bug — items became {}), but a single
  // `unknown` survives intact. args is an opaque relay payload; Array.isArray-guarded in the service.
  @IsOptional()
  args?: unknown;
}

/** `POST /v1/agent/lark-rpc/result` (desktop → server) — relay the method's result to the web SSE. */
export class LarkRpcResultDto {
  @IsString()
  requestId!: string;

  @IsBoolean()
  ok!: boolean;

  @IsOptional()
  result?: unknown;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  error?: string;
}

/** `POST /v1/agent/tasks/:id/events` (desktop → server) body. Implements the
 *  shared `PostRemoteTaskEvent` shape. */
export class PostRemoteTaskEventDto {
  @IsString()
  kind!: RemoteTaskEventItem['kind'];

  @IsObject()
  payload!: Record<string, unknown>;
}

/** Một công cụ khai cho MAIC — JSON Schema y như Messages API. */
export class MaicToolDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** Lược đồ tham số. `@IsObject` giữ nguyên cây bên trong — whitelist chỉ lột ở cấp class. */
  @IsObject()
  inputSchema!: object;
}

/**
 * Thân request mở một lượt chạy MAIC CÓ CÔNG CỤ.
 *
 * `tools` là JSON Schema y như Messages API — không kiểm sâu ở đây vì MAIC tự kiểm và trả 400 kèm
 * lý do rõ hơn ta có thể viết lại; ta chỉ chặn hình dạng thô để không đẩy rác qua mạng.
 */
export class MaicToolsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100_000)
  prompt!: string;

  /**
   * PHẢI có `@ValidateNested` + `@Type`, không được để `@IsArray()` trần.
   *
   * `ValidationPipe({ whitelist: true })` lột mọi thuộc tính không được khai báo — và với một
   * mảng khai trần thì nó lột sạch khoá của TỪNG PHẦN TỬ. Tool đi tới MAIC với `name` rỗng và
   * MAIC từ chối bằng một câu nói về tên công cụ, chẳng liên quan gì tới nguyên nhân thật.
   * Đây là lần thứ ba cùng một lớp lỗi trong dự án: danh sách trắng nuốt im lặng.
   */
  @IsArray()
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => MaicToolDto)
  tools!: MaicToolDto[];

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(480)
  toolTimeoutSec?: number;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(3600)
  timeoutSec?: number;
}
