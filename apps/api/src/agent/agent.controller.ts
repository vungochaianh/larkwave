import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Ip,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type {
  AgentChatIndex,
  AgentConversation,
  AgentDevice,
  AgentTokenResponse,
  AgentWebhookTokenInfo,
  AssistantShareInfo,
  CreateRemoteTaskResponse,
  PublicAssistantInfo,
  PublicChatConv,
  RemoteAppInfo,
  RemoteTask,
  TelegramBindingInfo,
  TelegramLinkResponse,
  TokenTestResult,
} from '@larkwave/shared';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { AgentService } from './agent.service';
import {
  AgentChatBodyPushDto,
  AgentChatIndexPushDto,
  AgentChatProjectsPushDto,
  UpdateChatProjectDto,
  CmsSyncResultDto,
  CmsSyncRunDto,
  ConversationDto,
  CreateAgentTokenDto,
  CreateRemoteTaskDto,
  LarkChatAnswerDto,
  LarkChatCancelDto,
  MaicChatRunDto,
  MaicChatCancelDto,
  LarkChatConfirmDto,
  LarkChatEventDto,
  LarkChatRunDto,
  LarkRpcResultDto,
  LarkRpcRunDto,
  LarkQrDto,
  PostRemoteTaskEventDto,
  SetTelegramBotDto,
  SyncAppsDto,
  UpdateTokenNotifyDto,
  MaicToolsDto,
} from './agent.dto';

@Controller('agent')
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  /** SSE: the DESKTOP holds this open to receive AgentCommands + flush queued
   *  tasks on connect. Consumed via fetch streaming with the Bearer header. */
  @Get('stream')
  stream(
    @CurrentUser() user: AuthUser,
    @Query('name') name: string | undefined,
    @Query('platform') platform: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    return this.agent.streamCommands(user.id, name ?? '', platform ?? '', res);
  }

  /** PHONE enqueues a remote coding task on an online device. */
  @Post('tasks')
  enqueue(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateRemoteTaskDto,
  ): Promise<CreateRemoteTaskResponse> {
    return this.agent.enqueue(user.id, dto);
  }

  /** DESKTOP posts a progress event for a task it owns. */
  @Post('tasks/:id/events')
  recordEvent(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: PostRemoteTaskEventDto,
  ): Promise<{ ok: true }> {
    return this.agent.recordEvent(user.id, id, dto);
  }

  /** List the user's recent tasks (no events). Optional `?conversationId=` (or `none`). */
  @Get('tasks')
  listTasks(
    @CurrentUser() user: AuthUser,
    @Query('conversationId') conversationId?: string,
  ): Promise<RemoteTask[]> {
    return this.agent.listTasks(user.id, conversationId);
  }

  // ── named conversations ──────────────────────────────────────────────────────

  @Get('conversations')
  listConversations(@CurrentUser() user: AuthUser): Promise<AgentConversation[]> {
    return this.agent.listConversations(user.id);
  }

  @Post('conversations')
  createConversation(
    @CurrentUser() user: AuthUser,
    @Body() dto: ConversationDto,
  ): Promise<AgentConversation> {
    return this.agent.createConversation(user.id, dto?.title);
  }

  @Patch('conversations/:id')
  renameConversation(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ConversationDto,
  ): Promise<AgentConversation> {
    return this.agent.renameConversation(user.id, id, dto?.title ?? '');
  }

  @Delete('conversations/:id')
  deleteConversation(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<{ ok: boolean }> {
    return this.agent.deleteConversation(user.id, id);
  }

  /** Task detail INCLUDING events for replay. */
  @Get('tasks/:id')
  getTask(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<RemoteTask> {
    return this.agent.getTask(user.id, id);
  }

  /** The user's registered devices with derived `online`. */
  @Get('devices')
  devices(@CurrentUser() user: AuthUser): Promise<AgentDevice[]> {
    return this.agent.listDevices(user.id);
  }

  /** DESKTOP pushes its local app list so the phone can list + send follow-ups. */
  @Post('apps')
  @HttpCode(200)
  syncApps(@CurrentUser() user: AuthUser, @Body() dto: SyncAppsDto): Promise<{ ok: boolean; count: number }> {
    return this.agent.syncApps(user.id, dto?.deviceName, dto?.apps);
  }

  /** PHONE lists the apps synced from the user's device(s). */
  @Get('apps')
  listApps(@CurrentUser() user: AuthUser): Promise<RemoteAppInfo[]> {
    return this.agent.listRemoteApps(user.id);
  }

  /** (Re)generate the legacy single per-user webhook token (returned once). */
  @Post('token')
  token(@CurrentUser() user: AuthUser): Promise<AgentTokenResponse> {
    return this.agent.generateToken(user.id);
  }

  /** List the user's NAMED webhook tokens (never the raw token). */
  @Get('tokens')
  listTokens(@CurrentUser() user: AuthUser): Promise<AgentWebhookTokenInfo[]> {
    return this.agent.listTokens(user.id);
  }

  /** Create a NAMED webhook token (e.g. per project) — the raw token is returned ONCE. */
  @Post('tokens')
  createToken(@CurrentUser() user: AuthUser, @Body() dto: CreateAgentTokenDto): Promise<AgentTokenResponse> {
    return this.agent.createToken(user.id, dto?.name ?? '');
  }

  /** Revoke one named token. */
  @Delete('tokens/:id')
  deleteToken(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: boolean }> {
    return this.agent.deleteToken(user.id, id);
  }

  /** Test a token: is it usable + is a device online right now (no task is run). */
  @Post('tokens/:id/test')
  @HttpCode(200)
  testToken(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<TokenTestResult> {
    return this.agent.testToken(user.id, id);
  }

  /** Set/clear a token's OUTBOUND notify target (Lark webhook and/or Telegram chat). */
  @Put('tokens/:id/notify')
  updateTokenNotify(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTokenNotifyDto,
  ): Promise<AgentWebhookTokenInfo> {
    return this.agent.updateTokenNotify(user.id, id, dto);
  }

  // ── Telegram bridge ──────────────────────────────────────────────────────────

  /** Mint a one-time code + deep link to bind a Telegram chat to this account. */
  @Post('telegram/link')
  telegramLink(@CurrentUser() user: AuthUser): Promise<TelegramLinkResponse> {
    return this.agent.telegramLink(user.id);
  }

  /** Chats currently bound to this user. */
  @Get('telegram/bindings')
  telegramBindings(@CurrentUser() user: AuthUser): Promise<TelegramBindingInfo[]> {
    return this.agent.listTelegramBindings(user.id);
  }

  /** Unbind a Telegram chat. */
  @Delete('telegram/bindings/:id')
  deleteTelegramBinding(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<{ ok: boolean }> {
    return this.agent.deleteTelegramBinding(user.id, id);
  }

  /** PUBLIC — Telegram delivers bot updates here (secret-token verified in the service). */
  @Public()
  @Post('telegram/webhook')
  @HttpCode(200)
  telegramWebhook(
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() body: unknown,
  ): Promise<{ ok: true }> {
    return this.agent.handleTelegramUpdate(secret, body);
  }

  /** ADMIN — bot token status (no raw token). */
  @Roles('admin')
  @Get('telegram/admin')
  telegramAdminStatus() {
    return this.agent.telegramAdminStatus();
  }

  /** ADMIN — set/clear the platform Telegram bot token (no redeploy; re-registers webhook). */
  @Roles('admin')
  @Put('telegram/admin')
  telegramAdminSet(@Body() dto: SetTelegramBotDto) {
    return this.agent.telegramAdminSet(dto);
  }

  /** Phone → ask this user's desktop to open its Lark login window + stream the QR. */
  @Post('lark-login')
  startLarkLogin(@CurrentUser() user: AuthUser): Promise<{ requestId: string }> {
    return this.agent.startLarkLogin(user.id);
  }

  /** Desktop → relay the QR image / outcome to the phone's message SSE. */
  @Post('lark-login/qr')
  @HttpCode(200)
  relayLarkQr(@CurrentUser() user: AuthUser, @Body() dto: LarkQrDto): Promise<{ ok: boolean }> {
    return this.agent.relayLarkQr(user.id, dto);
  }

  /** Web/phone → list the CMS Bitable connector jobs (server-side fetch of the CMS backend). */
  @Get('cms-sync/jobs')
  listCmsSyncJobs(): Promise<{ jobs: unknown[] }> {
    return this.agent.listCmsSyncJobs();
  }

  /** Web/phone → ask this user's desktop to RUN these CMS jobs with its live Lark session. */
  @Post('cms-sync/run')
  startCmsSyncRun(@CurrentUser() user: AuthUser, @Body() dto: CmsSyncRunDto): Promise<{ requestId: string }> {
    return this.agent.startCmsSyncRun(user.id, dto.jobIds);
  }

  /** Desktop → relay CMS sync progress / final tally to the web's message SSE. */
  @Post('cms-sync/result')
  @HttpCode(200)
  relayCmsSync(@CurrentUser() user: AuthUser, @Body() dto: CmsSyncResultDto): Promise<{ ok: boolean }> {
    return this.agent.relayCmsSync(user.id, dto);
  }

  // ── Chat-over-relay: run any chat (Trợ lý AI / Lark) on this user's desktop CLI ──

  /** Web/phone → run a chat turn on the desktop; events arrive on the message SSE as `larkChatEvent`. */
  @Post('lark-chat/run')
  startLarkChat(@CurrentUser() user: AuthUser, @Body() dto: LarkChatRunDto): Promise<{ requestId: string }> {
    return this.agent.startLarkChat(user.id, dto);
  }

  /** Web/phone → allow/deny a gated write on the running turn (build mode). */
  @Post('lark-chat/confirm')
  @HttpCode(200)
  larkChatConfirm(@CurrentUser() user: AuthUser, @Body() dto: LarkChatConfirmDto): Promise<{ ok: boolean }> {
    return this.agent.larkChatConfirm(user.id, dto);
  }

  /** Web/phone → reply to an ask_user prompt on the running turn. */
  @Post('lark-chat/answer')
  @HttpCode(200)
  larkChatAnswer(@CurrentUser() user: AuthUser, @Body() dto: LarkChatAnswerDto): Promise<{ ok: boolean }> {
    return this.agent.larkChatAnswer(user.id, dto);
  }

  /** Web/phone → stop the running turn. */
  @Post('lark-chat/cancel')
  @HttpCode(200)
  larkChatCancel(@CurrentUser() user: AuthUser, @Body() dto: LarkChatCancelDto): Promise<{ ok: boolean }> {
    return this.agent.larkChatCancel(user.id, dto.requestId);
  }

  /** Web → is the hosted (MAIC) assistant configured? Picks hosted vs desktop-relay runtime. */
  @Get('maic/status')
  maicStatus(): { enabled: boolean } {
    return this.agent.maicStatus();
  }

  /** Web/phone → run a general Trợ lý AI turn via the HOSTED MAIC gateway (server-side, no desktop
   *  and no local Claude). Events arrive on the message SSE as `larkChatEvent`, same as lark-chat. */
  @Post('maic-chat/run')
  startMaicChat(@CurrentUser() user: AuthUser, @Body() dto: MaicChatRunDto): Promise<{ requestId: string }> {
    return this.agent.startMaicChat(user, dto);
  }

  /** Web/phone → stop an in-flight hosted (MAIC) turn. */
  @Post('maic-chat/cancel')
  @HttpCode(200)
  maicChatCancel(@CurrentUser() user: AuthUser, @Body() dto: MaicChatCancelDto): { ok: boolean } {
    return this.agent.maicChatCancel(user.id, dto.requestId);
  }

  /**
   * Desktop → mở lượt chạy MAIC CÓ CÔNG CỤ (SSE). Công cụ chạy trên máy người dùng: máy chủ chỉ
   * giữ khoá MAIC, chặn theo gói của họ và ghi sổ token. Bí mật Lark không đi qua đây.
   */
  @Post('maic-tools')
  maicToolsStream(
    @CurrentUser() user: AuthUser,
    @Body() dto: MaicToolsDto,
    @Res() res: Response,
  ): Promise<void> {
    return this.agent.maicToolsStream(user, dto, res);
  }

  /** Desktop → trả kết quả một lời gọi công cụ về lượt chạy MAIC đang chờ. */
  @Post('maic-tools/:runId/result')
  @HttpCode(200)
  maicToolResult(
    @CurrentUser() user: AuthUser,
    @Param('runId') runId: string,
    @Body() body: { toolUseId: string; content: string; isError?: boolean },
  ): Promise<{ ok: boolean; status: number }> {
    return this.agent.maicToolResult(user, runId, body);
  }

  /** Desktop hosted mode → run ONE hosted Trợ lý AI turn synchronously (no SSE); returns the answer.
   *  Same gate/meter/multi-turn as maic-chat, but the desktop gets the reply directly. */
  @Post('maic-ask')
  maicAsk(
    @CurrentUser() user: AuthUser,
    @Body() dto: MaicChatRunDto,
  ): Promise<{ answer: string; sessionId: string; costUsd: number; runId: string }> {
    return this.agent.maicAsk(user, dto);
  }

  /** Desktop → relay one chat stream event (text delta / tool_call / ask_user / done) to the web SSE. */
  @Post('lark-chat/event')
  @HttpCode(200)
  relayLarkChatEvent(@CurrentUser() user: AuthUser, @Body() dto: LarkChatEventDto): Promise<{ ok: boolean }> {
    return this.agent.relayLarkChatEvent(user.id, dto);
  }

  // ── Lark RPC over relay: web runs one allow-listed Lark method on the desktop ──

  /** Web → run one Lark runtime method on the desktop; result arrives on the SSE as `larkRpcResult`. */
  @Post('lark-rpc')
  startLarkRpc(@CurrentUser() user: AuthUser, @Body() dto: LarkRpcRunDto): Promise<{ requestId: string }> {
    return this.agent.startLarkRpc(user.id, dto);
  }

  /** Desktop → relay one Lark RPC result back to the web SSE. */
  @Post('lark-rpc/result')
  @HttpCode(200)
  relayLarkRpcResult(@CurrentUser() user: AuthUser, @Body() dto: LarkRpcResultDto): Promise<{ ok: boolean }> {
    return this.agent.relayLarkRpcResult(user.id, dto);
  }

  // ── AgentChat ("Trợ lý AI") history sync: desktop ↔ server ↔ web ──

  /** The user's conversation META + projects (bodies fetched per-id). */
  @Get('chat/index')
  getChatIndex(@CurrentUser() user: AuthUser): Promise<AgentChatIndex> {
    return this.agent.getChatIndex(user.id);
  }

  /** One conversation's text-only body. */
  @Get('chat/body/:id')
  getChatBody(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ body: unknown[] | null }> {
    return this.agent.getChatBody(user.id, id);
  }

  /** Upsert conversation META (newest updatedAt wins; bodies untouched). */
  @Put('chat/index')
  pushChatIndex(@CurrentUser() user: AuthUser, @Body() dto: AgentChatIndexPushDto): Promise<{ ok: boolean }> {
    return this.agent.pushChatIndex(user.id, dto);
  }

  /** Replace the user's projects. */
  @Put('chat/projects')
  pushChatProjects(@CurrentUser() user: AuthUser, @Body() dto: AgentChatProjectsPushDto): Promise<{ ok: boolean }> {
    return this.agent.pushChatProjects(user.id, dto);
  }

  /** Projects WITH their custom instructions (for the /projects manager). */
  @Get('chat/projects')
  listChatProjects(
    @CurrentUser() user: AuthUser,
  ): Promise<{ id: string; name: string; instructions: string; ord: number }[]> {
    return this.agent.listChatProjects(user.id);
  }

  /** Edit a project's name / custom instructions (like Claude Projects). */
  @Patch('chat/projects/:id')
  updateChatProject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateChatProjectDto,
  ): Promise<{ id: string; name: string; instructions: string; ord: number }> {
    return this.agent.updateChatProject(user.id, id, dto);
  }

  /** Upsert one conversation fully (meta + body). */
  @Put('chat/body/:id')
  pushChatBody(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AgentChatBodyPushDto,
  ): Promise<{ ok: boolean }> {
    return this.agent.pushChatBody(user.id, id, dto);
  }

  /** Remove one conversation. */
  @Delete('chat/:id')
  deleteChatConv(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: boolean }> {
    return this.agent.deleteChatConv(user.id, id);
  }

  // ── Public conversation share (read-only transcript at /s/<slug>) ──

  /** Make a conversation PUBLIC (read-only) → returns/creates its share slug. */
  @Post('chat/:id/share')
  shareChatConv(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ slug: string }> {
    return this.agent.shareChatConv(user.id, id);
  }

  /** Stop sharing a conversation. */
  @Delete('chat/:id/share')
  unshareChatConv(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: boolean }> {
    return this.agent.unshareChatConv(user.id, id);
  }

  /** PUBLIC read-only transcript by share slug. */
  @Public()
  @Get('chat/public/:slug')
  getPublicChatConv(@Param('slug') slug: string): Promise<PublicChatConv> {
    return this.agent.getPublicChatConv(slug);
  }

  // ── Public chat-able assistant links (/g/<slug>) ──

  @Get('public-assistant')
  listAssistantShares(@CurrentUser() user: AuthUser): Promise<AssistantShareInfo[]> {
    return this.agent.listAssistantShares(user.id);
  }

  @Post('public-assistant')
  createAssistantShare(@CurrentUser() user: AuthUser, @Body() dto: { label?: string; projectId?: string }): Promise<AssistantShareInfo> {
    return this.agent.createAssistantShare(user.id, dto || {});
  }

  @Patch('public-assistant/:id')
  updateAssistantShare(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: { enabled?: boolean; label?: string },
  ): Promise<{ ok: boolean }> {
    return this.agent.updateAssistantShare(user.id, id, dto || {});
  }

  @Delete('public-assistant/:id')
  deleteAssistantShare(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: boolean }> {
    return this.agent.deleteAssistantShare(user.id, id);
  }

  /** PUBLIC metadata for /g/<slug>. */
  @Public()
  @Get('public-assistant/s/:slug')
  getPublicAssistant(@Param('slug') slug: string): Promise<PublicAssistantInfo> {
    return this.agent.getPublicAssistant(slug);
  }

  /** PUBLIC: run one anonymous read-only turn (SSE stream), metered to the owner. */
  @Public()
  @Post('public-assistant/s/:slug/ask')
  publicAssistantAsk(
    @Param('slug') slug: string,
    @Body() dto: { prompt?: string },
    @Ip() ip: string,
    @Res() res: Response,
  ): Promise<void> {
    return this.agent.publicAssistantAsk(slug, dto?.prompt || '', ip || '', res);
  }

  /**
   * External enqueue webhook. PUBLIC (no JWT). Trust is the `Apikey` header:
   * `Authorization: Apikey <agent token>` (mirrors the SePay webhook).
   */
  @Public()
  @Post('webhook')
  @HttpCode(200)
  webhook(
    @Headers('authorization') authHeader: string | undefined,
    @Body() dto: CreateRemoteTaskDto,
  ): Promise<CreateRemoteTaskResponse> {
    return this.agent.webhookEnqueue(authHeader, dto);
  }
}
