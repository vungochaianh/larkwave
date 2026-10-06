import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { LarkGrantService, type CreateGrantInput } from './lark-grant.service';

/**
 * Delegated Lark access. Every route is authenticated and scoped to the caller — an
 * invitation is a row keyed to one user, so there is no token or link to guess.
 */
@Controller('me/lark-grants')
export class LarkGrantController {
  constructor(private readonly svc: LarkGrantService) {}

  /** Grants I own (people I shared my Lark connection with). */
  @Get()
  listMine(@CurrentUser() user: AuthUser) {
    return this.svc.listMine(user.id);
  }

  /** Grants shared WITH me, plus invitations awaiting one click. */
  @Get('received')
  listReceived(@CurrentUser() user: AuthUser) {
    return this.svc.listReceived(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateGrantInput) {
    return this.svc.create(user.id, body);
  }

  /** One click, empty body — the caller's own JWT is the entire proof. */
  @Post(':id/claim')
  claim(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.claim(user.id, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: Partial<CreateGrantInput>) {
    return this.svc.update(user.id, id, body);
  }

  @Post(':id/suspend')
  suspend(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { on?: boolean }) {
    return this.svc.suspend(user.id, id, body?.on !== false);
  }

  @Delete(':id')
  revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.revoke(user.id, id);
  }

  // ── Delegated turns: the server queues + relays, it never runs anything ──────
  /** The owner's desktop pulls anything still queued (recovers a missed SSE push). */
  @Get('queued/turns')
  queued(@CurrentUser() user: AuthUser) {
    return this.svc.queuedTurns(user.id);
  }

  /** Poll one turn — the grantee who asked, or the owner. */
  @Get('turns/:turnId')
  getTurn(@CurrentUser() user: AuthUser, @Param('turnId') turnId: string) {
    return this.svc.getTurn(user.id, turnId);
  }

  /** The owner's desktop reports progress/outcome. Only the owner may write. */
  @Post('turns/:turnId/report')
  reportTurn(
    @CurrentUser() user: AuthUser,
    @Param('turnId') turnId: string,
    @Body() body: { status: 'running' | 'succeeded' | 'failed' | 'denied'; result?: string; error?: string },
  ) {
    return this.svc.reportTurn(user.id, turnId, body);
  }

  /** A grantee asks the owner's desktop to run a turn. */
  @Post(':id/turns')
  submitTurn(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { prompt: string }) {
    return this.svc.submitTurn(user.id, id, body?.prompt);
  }

  @Get(':id/turns')
  turns(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('limit') limit?: string) {
    return this.svc.turns(user.id, id, Number(limit) || 50);
  }

  /** Per-person access log — what this friend actually touched. */
  @Get(':id/calls')
  calls(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('limit') limit?: string) {
    return this.svc.calls(user.id, id, Number(limit) || 100);
  }

  /** The owner's desktop reports an executed tool call. */
  @Post(':id/calls')
  logCall(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body()
    body: { actorId?: string; tool: string; targetName?: string; decision: string; latencyMs?: number; conversationId?: string },
  ) {
    return this.svc.logCall(user.id, id, body);
  }
}
