import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { Automation as PAutomation } from '@prisma/client';
import type { Automation, UpsertAutomationRequest } from '@larkwave/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppAccessService } from '../common/app-access.service';
import type { AuthUser } from '../common/auth-user';

const ALLOWED_INTERVALS = [15, 60, 360, 1440, 10080];
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const MAX_PER_APP = 20;
const RUN_TIMEOUT_MS = 15_000;

@Injectable()
export class AutomationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomationsService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AppAccessService,
  ) {}

  onModuleInit(): void {
    // Single API instance → a simple in-process tick is enough. nextRunAt lives in
    // the DB so a restart resumes cleanly (no double-runs).
    this.timer = setInterval(() => void this.runDue().catch(() => undefined), 60_000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private toDto(a: PAutomation): Automation {
    return {
      id: a.id,
      appId: a.appId,
      name: a.name,
      enabled: a.enabled,
      intervalMinutes: a.intervalMinutes,
      method: a.method,
      path: a.path,
      body: a.body ?? null,
      nextRunAt: a.nextRunAt.toISOString(),
      lastRunAt: a.lastRunAt ? a.lastRunAt.toISOString() : null,
      lastStatus: a.lastStatus,
      lastError: a.lastError ?? null,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    };
  }

  private clean(dto: UpsertAutomationRequest): {
    name: string;
    enabled: boolean;
    intervalMinutes: number;
    method: string;
    path: string;
    body: string | null;
  } {
    const name = String(dto.name ?? '').trim().slice(0, 80) || 'Tác vụ';
    const intervalMinutes = ALLOWED_INTERVALS.includes(Number(dto.intervalMinutes))
      ? Number(dto.intervalMinutes)
      : 1440;
    const method = ALLOWED_METHODS.includes(String(dto.method).toUpperCase())
      ? String(dto.method).toUpperCase()
      : 'GET';
    // Path stays on the app's OWN host (we concatenate base+path). Strip the host /
    // scheme + leading slashes so it can never point elsewhere (SSRF-safe).
    let path = String(dto.path ?? '/').trim();
    if (/:\/\/|\s/.test(path)) path = '/';
    path = '/' + path.replace(/^\/+/, '').slice(0, 500);
    const body = dto.body ? String(dto.body).slice(0, 8000) : null;
    return { name, enabled: dto.enabled !== false, intervalMinutes, method, path, body };
  }

  async list(user: AuthUser, appId: string): Promise<Automation[]> {
    if (!(await this.access.canRead(user, appId))) {
      throw new ForbiddenException('App không thuộc về bạn');
    }
    const rows = await this.prisma.automation.findMany({
      where: { appId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async create(user: AuthUser, appId: string, dto: UpsertAutomationRequest): Promise<Automation> {
    if (!(await this.access.canWrite(user, appId))) {
      throw new ForbiddenException('App không thuộc về bạn');
    }
    const count = await this.prisma.automation.count({ where: { appId } });
    if (count >= MAX_PER_APP) {
      throw new ForbiddenException(`Tối đa ${MAX_PER_APP} tác vụ cho mỗi app`);
    }
    const c = this.clean(dto);
    const row = await this.prisma.automation.create({
      data: { appId, ...c, nextRunAt: new Date(Date.now() + c.intervalMinutes * 60_000) },
    });
    return this.toDto(row);
  }

  /** Load an automation + verify the caller can write its app. */
  private async owned(user: AuthUser, id: string): Promise<PAutomation> {
    const row = await this.prisma.automation.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Không tìm thấy tác vụ');
    if (!(await this.access.canWrite(user, row.appId))) {
      throw new ForbiddenException('App không thuộc về bạn');
    }
    return row;
  }

  async update(user: AuthUser, id: string, dto: UpsertAutomationRequest): Promise<Automation> {
    await this.owned(user, id);
    const c = this.clean(dto);
    const row = await this.prisma.automation.update({ where: { id }, data: c });
    return this.toDto(row);
  }

  async remove(user: AuthUser, id: string): Promise<{ ok: true }> {
    await this.owned(user, id);
    await this.prisma.automation.delete({ where: { id } });
    return { ok: true };
  }

  async runNow(user: AuthUser, id: string): Promise<Automation> {
    const row = await this.owned(user, id);
    await this.runOne(row);
    const fresh = await this.prisma.automation.findUnique({ where: { id } });
    return this.toDto(fresh ?? row);
  }

  /** Scheduler tick: fire every enabled automation whose nextRunAt has passed. */
  private async runDue(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.prisma.automation.findMany({
        where: { enabled: true, nextRunAt: { lte: new Date() } },
        take: 25,
      });
      for (const a of due) await this.runOne(a);
    } finally {
      this.running = false;
    }
  }

  /** Call the app's own URL + path. Records status/error + schedules the next run. */
  private async runOne(a: PAutomation): Promise<void> {
    const next = new Date(Date.now() + a.intervalMinutes * 60_000);
    const app = await this.prisma.app.findUnique({
      where: { id: a.appId },
      select: { currentUrl: true },
    });
    if (!app?.currentUrl) {
      await this.prisma.automation
        .update({
          where: { id: a.id },
          data: { nextRunAt: next, lastRunAt: new Date(), lastStatus: 0, lastError: 'App chưa deploy' },
        })
        .catch(() => undefined);
      return;
    }
    const url = app.currentUrl.replace(/\/+$/, '') + a.path;
    let status = 0;
    let error: string | null = null;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), RUN_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: a.method,
        signal: ctrl.signal,
        ...(a.body && a.method !== 'GET'
          ? { body: a.body, headers: { 'content-type': 'application/json' } }
          : {}),
      });
      status = res.status;
    } catch (e) {
      error = ((e as Error).message ?? 'error').slice(0, 300);
    } finally {
      clearTimeout(t);
    }
    await this.prisma.automation
      .update({
        where: { id: a.id },
        data: { nextRunAt: next, lastRunAt: new Date(), lastStatus: status, lastError: error },
      })
      .catch(() => undefined);
    this.logger.log(`automation ${a.id} → ${a.method} ${url} = ${status}${error ? ` (${error})` : ''}`);
  }
}
