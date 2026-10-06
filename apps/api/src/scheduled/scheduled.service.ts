import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { CronExpressionParser } from 'cron-parser';
import { PrismaService } from '../prisma/prisma.service';
import { MaicService } from '../maic/maic.service';
import { MaicUsageService } from '../maic/maic-usage.service';
import { SkillsService } from '../skills/skills.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { CreateScheduledTaskDto, UpdateScheduledTaskDto, ScheduledTaskDto } from './scheduled.dto';

type RawTask = {
  id: string;
  userId: string;
  name: string;
  prompt: string;
  cron: string;
  timezone: string;
  enabled: boolean;
  deliver: string;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  lastResult: string | null;
  lastError: string | null;
  runCount: number;
  createdAt: Date;
};

const SCHEDULED_SYSTEM = [
  'Bạn là Trợ lý AI của Larkwave đang chạy một TÁC VỤ ĐỊNH KỲ tự động (người dùng KHÔNG có mặt để trả lời).',
  'Hãy tự hoàn thành yêu cầu và trình bày kết quả rõ ràng bằng markdown, tiếng Việt (trừ khi yêu cầu bằng ngôn ngữ khác).',
  'KHÔNG hỏi lại; nếu thiếu dữ liệu, hãy nêu giả định rồi vẫn cho ra kết quả hữu ích.',
].join('\n');

function toDto(t: RawTask): ScheduledTaskDto {
  return {
    id: t.id,
    name: t.name,
    prompt: t.prompt,
    cron: t.cron,
    timezone: t.timezone,
    enabled: t.enabled,
    deliver: t.deliver,
    nextRunAt: t.nextRunAt ? t.nextRunAt.toISOString() : null,
    lastRunAt: t.lastRunAt ? t.lastRunAt.toISOString() : null,
    lastResult: t.lastResult,
    lastError: t.lastError,
    runCount: t.runCount,
    createdAt: t.createdAt.toISOString(),
  };
}

const SELECT = {
  id: true,
  userId: true,
  name: true,
  prompt: true,
  cron: true,
  timezone: true,
  enabled: true,
  deliver: true,
  nextRunAt: true,
  lastRunAt: true,
  lastResult: true,
  lastError: true,
  runCount: true,
  createdAt: true,
} as const;

@Injectable()
export class ScheduledService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('ScheduledService');
  private timer: ReturnType<typeof setInterval> | undefined;
  private ticking = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly maic: MaicService,
    private readonly maicUsage: MaicUsageService,
    private readonly skills: SkillsService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    // In-process scheduler: one tick a minute (single api instance under systemd — no multi-node race).
    this.timer = setInterval(() => void this.tick(), 60_000);
    // A short warm-up tick so newly-due tasks fire soon after a deploy/restart.
    setTimeout(() => void this.tick(), 15_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Next fire time for a cron in a timezone. Throws BadRequest on an invalid expression. */
  private nextRun(cron: string, timezone: string, from: Date = new Date()): Date {
    try {
      return CronExpressionParser.parse(cron, { currentDate: from, tz: timezone }).next().toDate();
    } catch {
      throw new BadRequestException('Biểu thức lịch (cron) không hợp lệ.');
    }
  }

  async list(userId: string): Promise<ScheduledTaskDto[]> {
    const rows = await this.prisma.scheduledTask.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: SELECT,
    });
    return rows.map(toDto);
  }

  async get(userId: string, id: string): Promise<ScheduledTaskDto> {
    const t = await this.prisma.scheduledTask.findFirst({ where: { id, userId }, select: SELECT });
    if (!t) throw new NotFoundException('Tác vụ không tồn tại');
    return toDto(t);
  }

  async create(userId: string, dto: CreateScheduledTaskDto): Promise<ScheduledTaskDto> {
    const timezone = dto.timezone?.trim() || 'Asia/Ho_Chi_Minh';
    const enabled = dto.enabled ?? true;
    const next = this.nextRun(dto.cron, timezone); // validates the cron
    const t = await this.prisma.scheduledTask.create({
      data: {
        userId,
        name: dto.name.trim() || 'Tác vụ',
        prompt: dto.prompt,
        cron: dto.cron.trim(),
        timezone,
        deliver: dto.deliver ?? 'notification',
        enabled,
        nextRunAt: enabled ? next : null,
      },
      select: SELECT,
    });
    return toDto(t);
  }

  async update(userId: string, id: string, patch: UpdateScheduledTaskDto): Promise<ScheduledTaskDto> {
    const cur = await this.prisma.scheduledTask.findFirst({ where: { id, userId }, select: SELECT });
    if (!cur) throw new NotFoundException('Tác vụ không tồn tại');
    const cron = patch.cron?.trim() ?? cur.cron;
    const timezone = patch.timezone?.trim() ?? cur.timezone;
    const enabled = patch.enabled ?? cur.enabled;
    // Recompute the next fire time whenever the schedule or enabled state changes.
    const scheduleChanged = patch.cron !== undefined || patch.timezone !== undefined || patch.enabled !== undefined;
    const nextRunAt = enabled ? (scheduleChanged ? this.nextRun(cron, timezone) : cur.nextRunAt) : null;
    const t = await this.prisma.scheduledTask.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name.trim() || 'Tác vụ' } : {}),
        ...(patch.prompt !== undefined ? { prompt: patch.prompt } : {}),
        ...(patch.cron !== undefined ? { cron } : {}),
        ...(patch.timezone !== undefined ? { timezone } : {}),
        ...(patch.deliver !== undefined ? { deliver: patch.deliver } : {}),
        ...(patch.enabled !== undefined ? { enabled } : {}),
        nextRunAt,
      },
      select: SELECT,
    });
    return toDto(t);
  }

  async remove(userId: string, id: string): Promise<{ ok: true }> {
    await this.prisma.scheduledTask.deleteMany({ where: { id, userId } });
    return { ok: true };
  }

  /** Run a task NOW (manual), without shifting its regular schedule. */
  async runNow(userId: string, id: string): Promise<ScheduledTaskDto> {
    const t = await this.prisma.scheduledTask.findFirst({ where: { id, userId }, select: SELECT });
    if (!t) throw new NotFoundException('Tác vụ không tồn tại');
    await this.runTask(t, { advanceSchedule: false });
    return this.get(userId, id);
  }

  // ── Runner ──────────────────────────────────────────────────────────────────
  private async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const due = await this.prisma.scheduledTask.findMany({
        where: { enabled: true, nextRunAt: { not: null, lte: new Date() } },
        orderBy: { nextRunAt: 'asc' },
        take: 20,
        select: SELECT,
      });
      // Sequential — bounds MAIC concurrency from the scheduler.
      for (const t of due) {
        await this.runTask(t, { advanceSchedule: true }).catch((e) =>
          this.log.warn(`run ${t.id} failed: ${String(e)}`),
        );
      }
    } catch (e) {
      this.log.warn(`tick failed: ${String(e)}`);
    } finally {
      this.ticking = false;
    }
  }

  private async runTask(t: RawTask, opts: { advanceSchedule: boolean }): Promise<void> {
    const now = new Date();
    // Compute the next fire BEFORE running so a long run / crash can't cause a tight re-run loop.
    const nextRunAt = opts.advanceSchedule ? this.safeNext(t) : t.nextRunAt;

    // Quota / plan gate — mirror the interactive assistant.
    const user = await this.prisma.user.findUnique({
      where: { id: t.userId },
      select: { id: true, email: true, role: true },
    });
    if (!user) return;
    try {
      await this.maicUsage.assertMaicAllowed({ id: user.id, email: user.email, role: user.role });
    } catch (e) {
      await this.prisma.scheduledTask.update({
        where: { id: t.id },
        data: { lastRunAt: now, lastError: (e as Error).message?.slice(0, 500) || 'Không đủ quyền/hạn mức', nextRunAt },
      });
      return;
    }

    if (!this.maic.enabled) {
      await this.prisma.scheduledTask.update({
        where: { id: t.id },
        data: { lastRunAt: now, lastError: 'Trợ lý AI (hosted) chưa được cấu hình.', nextRunAt },
      });
      return;
    }

    try {
      const skillBlock = await this.skills.enabledPromptBlock(t.userId).catch(() => '');
      const systemPrompt = skillBlock ? `${SCHEDULED_SYSTEM}\n${skillBlock}` : SCHEDULED_SYSTEM;
      const res = await this.maic.ask({
        prompt: t.prompt, systemPrompt, timeoutSec: 240,
        endUser: { id: t.userId },
      });
      await this.maicUsage
        .meterMaic(t.userId, { runId: res.runId, kind: 'scheduled', costUsd: res.costUsd })
        .catch(() => undefined);

      await this.prisma.scheduledTask.update({
        where: { id: t.id },
        data: { lastRunAt: now, lastResult: res.answer.slice(0, 20000), lastError: null, runCount: { increment: 1 }, nextRunAt },
      });

      // Deliver: an in-app notification linking to the task (the full result is stored on it).
      const snippet = res.answer.replace(/\s+/g, ' ').trim().slice(0, 180);
      await this.notifications.notify(
        t.userId,
        'system',
        `✅ ${t.name}`,
        snippet || 'Tác vụ định kỳ đã chạy xong.',
        `/scheduled?task=${t.id}`,
      );
    } catch (e) {
      await this.prisma.scheduledTask.update({
        where: { id: t.id },
        data: { lastRunAt: now, lastError: (e as Error).message?.slice(0, 500) || 'Lỗi khi chạy', nextRunAt },
      });
    }
  }

  private safeNext(t: RawTask): Date | null {
    try {
      return this.nextRun(t.cron, t.timezone);
    } catch {
      return null; // invalid cron → stop scheduling (leave null); user can fix it
    }
  }
}
