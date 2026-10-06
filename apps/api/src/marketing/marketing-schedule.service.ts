import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { CronExpressionParser } from 'cron-parser';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MarketingDeliveryService, type DeliverItem } from '../delivery/marketing-delivery.service';
import { VideoService } from '../video/video.service';
import { PictureService } from '../picture/picture.service';
import { MakeBlogService } from '../makeblog/makeblog.service';
import { BlogService } from '../blog/blog.service';
import { deriveSeoTitle, deriveSeoDescription, deriveTags } from '@larkwave/shared';

export type MarketingKind = 'video' | 'picture' | 'blog';

export interface MarketingScheduleDto {
  id: string;
  kind: string;
  title: string;
  template: string;
  palette: string;
  character: string;
  count: number;
  categoryId: string | null;
  aspect: string;
  voiceId: string;
  topic: string;
  cron: string;
  timezone: string;
  telegramChatId: string | null;
  /** blog only: có tự đăng bài lên site blog công khai hay không. */
  publishToBlog: boolean;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastItemId: string | null;
  lastError: string | null;
  runCount: number;
  createdAt: string;
}

interface RawSchedule {
  id: string;
  userId: string;
  kind: string;
  title: string;
  template: string;
  palette: string;
  character: string;
  count: number;
  categoryId: string | null;
  aspect: string;
  voiceId: string;
  topic: string;
  cron: string;
  timezone: string;
  telegramChatId: string | null;
  publishToBlog: boolean;
  enabled: boolean;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  lastItemId: string | null;
  lastError: string | null;
  runCount: number;
  createdAt: Date;
}

export interface CreateMarketingScheduleInput {
  kind: MarketingKind;
  title?: string;
  template?: string;
  palette?: string;
  character?: string;
  count?: number;
  categoryId?: string | null;
  aspect?: string;
  voiceId?: string;
  topic: string;
  cron: string;
  timezone?: string;
  telegramChatId?: string | null;
  /** blog only: tự đăng bài sinh ra lên site blog công khai. Mặc định tắt. */
  publishToBlog?: boolean;
  enabled?: boolean;
}

const SELECT = {
  id: true,
  userId: true,
  kind: true,
  title: true,
  template: true,
  palette: true,
  character: true,
  count: true,
  categoryId: true,
  aspect: true,
  voiceId: true,
  topic: true,
  cron: true,
  timezone: true,
  telegramChatId: true,
  publishToBlog: true,
  enabled: true,
  nextRunAt: true,
  lastRunAt: true,
  lastItemId: true,
  lastError: true,
  runCount: true,
  createdAt: true,
} as const;

function toDto(s: RawSchedule): MarketingScheduleDto {
  return {
    id: s.id,
    kind: s.kind,
    title: s.title,
    template: s.template,
    palette: s.palette,
    character: s.character,
    count: s.count,
    categoryId: s.categoryId,
    aspect: s.aspect,
    voiceId: s.voiceId,
    topic: s.topic,
    cron: s.cron,
    timezone: s.timezone,
    telegramChatId: s.telegramChatId,
    publishToBlog: s.publishToBlog,
    enabled: s.enabled,
    nextRunAt: s.nextRunAt ? s.nextRunAt.toISOString() : null,
    lastRunAt: s.lastRunAt ? s.lastRunAt.toISOString() : null,
    lastItemId: s.lastItemId,
    lastError: s.lastError,
    runCount: s.runCount,
    createdAt: s.createdAt.toISOString(),
  };
}

const KINDS: MarketingKind[] = ['video', 'picture', 'blog'];

/**
 * Generic in-process cron runner for all Marketing tools (video/picture/blog). One tick a minute
 * (single api instance under systemd). Each due schedule generates a fresh item via the matching
 * service and delivers it to the user's Telegram (TelegramDeliveryService) in a kind-specific format.
 */
@Injectable()
export class MarketingScheduleService implements OnModuleInit {
  private readonly log = new Logger(MarketingScheduleService.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private ticking = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly video: VideoService,
    private readonly picture: PictureService,
    private readonly blog: MakeBlogService,
    // Đặt tên `sitePost` cho khác `blog` ở trên: một cái SINH bài, một cái ĐĂNG lên site.
    private readonly sitePost: BlogService,
    private readonly delivery: MarketingDeliveryService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), 60_000);
    setTimeout(() => void this.tick(), 20_000);
  }

  private nextRun(cron: string, timezone: string, from = new Date()): Date {
    return CronExpressionParser.parse(cron, { currentDate: from, tz: timezone }).next().toDate();
  }
  private validateCron(cron: string, timezone: string): void {
    try {
      this.nextRun(cron, timezone);
    } catch {
      throw new BadRequestException('Biểu thức lịch (cron) không hợp lệ.');
    }
  }

  list(userId: string, kind?: string): Promise<MarketingScheduleDto[]> {
    return this.prisma.marketingSchedule
      .findMany({
        where: { userId, ...(kind && KINDS.includes(kind as MarketingKind) ? { kind } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: SELECT,
      })
      .then((rows) => rows.map(toDto));
  }

  async create(userId: string, dto: CreateMarketingScheduleInput): Promise<MarketingScheduleDto> {
    const kind: MarketingKind = KINDS.includes(dto.kind) ? dto.kind : 'video';
    const topic = (dto.topic || '').trim();
    if (topic.length < 3) throw new BadRequestException('Thiếu chủ đề.');
    const cron = (dto.cron || '').trim();
    const timezone = dto.timezone || 'Asia/Ho_Chi_Minh';
    this.validateCron(cron, timezone);
    const enabled = dto.enabled ?? true;
    const row = await this.prisma.marketingSchedule.create({
      data: {
        userId,
        kind,
        title: (dto.title || topic).slice(0, 80),
        template: dto.template || '',
        palette: dto.palette || 'auto',
        character: dto.character || 'none',
        count: Math.min(10, Math.max(1, Math.round(dto.count || 1))),
        categoryId: dto.categoryId || null,
        aspect: dto.aspect || (kind === 'picture' ? '1:1' : '9:16'),
        voiceId: dto.voiceId || '',
        topic,
        cron,
        timezone,
        telegramChatId: (dto.telegramChatId || '').trim() || null,
        // Chỉ có nghĩa với kind 'blog'; các kind khác để nguyên false.
        publishToBlog: dto.kind === 'blog' && !!dto.publishToBlog,
        enabled,
        nextRunAt: enabled ? this.nextRun(cron, timezone) : null,
      },
      select: SELECT,
    });
    return toDto(row);
  }

  async update(userId: string, id: string, patch: Partial<CreateMarketingScheduleInput>): Promise<MarketingScheduleDto> {
    const cur = await this.prisma.marketingSchedule.findFirst({ where: { id, userId }, select: SELECT });
    if (!cur) throw new NotFoundException('Không tìm thấy lịch.');
    const cron = patch.cron?.trim() || cur.cron;
    const timezone = patch.timezone || cur.timezone;
    if (patch.cron || patch.timezone) this.validateCron(cron, timezone);
    const enabled = patch.enabled ?? cur.enabled;
    const scheduleChanged = cron !== cur.cron || timezone !== cur.timezone || enabled !== cur.enabled;
    const nextRunAt = enabled ? (scheduleChanged ? this.nextRun(cron, timezone) : cur.nextRunAt) : null;
    const row = await this.prisma.marketingSchedule.update({
      where: { id },
      data: {
        ...(patch.title !== undefined ? { title: patch.title.slice(0, 80) } : {}),
        ...(patch.template !== undefined ? { template: patch.template } : {}),
        ...(patch.palette !== undefined ? { palette: patch.palette } : {}),
        ...(patch.character !== undefined ? { character: patch.character } : {}),
        ...(patch.count !== undefined ? { count: Math.min(10, Math.max(1, Math.round(patch.count))) } : {}),
        ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId || null } : {}),
        ...(patch.aspect !== undefined ? { aspect: patch.aspect } : {}),
        ...(patch.voiceId !== undefined ? { voiceId: patch.voiceId } : {}),
        ...(patch.topic !== undefined ? { topic: patch.topic.trim() } : {}),
        ...(patch.telegramChatId !== undefined ? { telegramChatId: (patch.telegramChatId || '').trim() || null } : {}),
        ...(patch.publishToBlog !== undefined ? { publishToBlog: !!patch.publishToBlog } : {}),
        cron,
        timezone,
        enabled,
        nextRunAt,
      },
      select: SELECT,
    });
    return toDto(row);
  }

  async remove(userId: string, id: string): Promise<{ ok: true }> {
    await this.prisma.marketingSchedule.deleteMany({ where: { id, userId } });
    return { ok: true };
  }

  async runNow(userId: string, id: string): Promise<{ ok: true }> {
    const s = await this.prisma.marketingSchedule.findFirst({ where: { id, userId }, select: SELECT });
    if (!s) throw new NotFoundException('Không tìm thấy lịch.');
    void this.runSchedule(s as RawSchedule, { advanceSchedule: false }).catch((e) =>
      this.log.warn(`runNow ${id} failed: ${(e as Error).message}`),
    );
    return { ok: true };
  }

  private async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const due = await this.prisma.marketingSchedule.findMany({
        where: { enabled: true, nextRunAt: { not: null, lte: new Date() } },
        orderBy: { nextRunAt: 'asc' },
        take: 4,
        select: SELECT,
      });
      for (const s of due) await this.runSchedule(s as RawSchedule, { advanceSchedule: true });
    } catch (e) {
      this.log.warn(`tick failed: ${String(e)}`);
    } finally {
      this.ticking = false;
    }
  }

  private async runSchedule(s: RawSchedule, opts: { advanceSchedule: boolean }): Promise<void> {
    const now = new Date();
    let nextRunAt: Date | null = s.nextRunAt;
    if (opts.advanceSchedule) {
      try {
        nextRunAt = this.nextRun(s.cron, s.timezone);
      } catch {
        nextRunAt = null;
      }
    }

    try {
      const built = await this.generate(s);
      if (built.status !== 'done') {
        await this.prisma.marketingSchedule.update({
          where: { id: s.id },
          data: { lastRunAt: now, lastItemId: built.id, lastError: built.error?.slice(0, 500) || 'Tạo nội dung thất bại.', nextRunAt },
        });
        return;
      }

      const chatId = s.telegramChatId || undefined;
      const deliverErr = await this.deliver(s, built, chatId);
      // Đăng lên site và gửi Telegram là HAI việc ĐỘC LẬP. Hỏng cái này không được kéo đổ cái kia:
      // bài đã lên site rồi mà báo lỗi chung chung thì người ta đăng lại, thành hai bài trùng.
      const published = await this.publishToSiteBlog(s, built);
      const publishErr = published && 'error' in published ? published.error : null;

      await this.prisma.marketingSchedule.update({
        where: { id: s.id },
        data: {
          lastRunAt: now,
          lastItemId: built.id,
          lastError: [deliverErr, publishErr].filter(Boolean).join(' | ') || null,
          runCount: { increment: 1 },
          nextRunAt,
        },
      });

      const parts: string[] = [deliverErr ? 'chưa gửi được Telegram' : 'đã gửi Telegram'];
      if (published) parts.push('error' in published ? 'chưa đăng được lên site' : `đã đăng /blog/${published.slug}`);
      await this.notifications
        .notify(
          s.userId,
          'system',
          `${kindEmoji(s.kind)} ${built.title}`,
          `Đã tạo — ${parts.join(', ')}.`,
          published && 'slug' in published ? `/blog/${published.slug}` : libraryLink(s.kind, built.id),
        )
        .catch(() => undefined);
    } catch (e) {
      await this.prisma.marketingSchedule.update({
        where: { id: s.id },
        data: { lastRunAt: now, lastError: (e as Error).message?.slice(0, 500) || 'Lỗi khi chạy lịch.', nextRunAt },
      });
    }
  }

  /**
   * Đăng bài vừa sinh lên SITE BLOG công khai (/blog/:slug), kèm trường SEO.
   *
   * Trang /blog/[slug] đã có sẵn generateMetadata + JSON-LD BlogPosting + canonical + OG/Twitter, và
   * sitemap.ts tự nạp mọi bài ĐÃ ĐĂNG. Bộ máy SEO đó không thiếu gì — trước đây nó chạy trên
   * RỖNG, vì bài sinh ra nằm trong blogProject rồi đi thẳng sang Telegram, không ai đăng lên site.
   *
   * Trả về slug khi đăng được, { error } khi hỏng, null khi lịch không bật cờ.
   */
  private async publishToSiteBlog(
    s: RawSchedule,
    built: Record<string, unknown> & { title: string },
  ): Promise<{ slug: string } | { error: string } | null> {
    if (s.kind !== 'blog' || !s.publishToBlog) return null;

    const body = String(built.body ?? '');
    const caption = String(built.caption ?? '');
    // Thà không đăng còn hơn đăng một trang rỗng: trang mỏng bị đánh giá thấp và kéo tụt cả site.
    if (!body.trim()) return { error: 'Bài sinh ra rỗng — không đăng lên site.' };

    const description = deriveSeoDescription(caption, body);
    try {
      const post = await this.sitePost.createFromSchedule(s.userId, 'Larkwave', {
        title: built.title,
        content: body,
        excerpt: description || undefined,
        coverImage: String(built.coverUrl ?? '') || undefined,
        status: 'published',
        tags: deriveTags(s.topic, built.title, s.template),
        seoTitle: deriveSeoTitle(built.title),
        seoDescription: description || undefined,
      });
      return { slug: post.slug };
    } catch (e) {
      return { error: (e as Error).message?.slice(0, 200) || 'Đăng lên site blog thất bại.' };
    }
  }

  /** Generate a fresh item for the schedule's kind. */
  private async generate(s: RawSchedule): Promise<{ id: string; status: string; title: string; error: string | null } & Record<string, unknown>> {
    if (s.kind === 'picture') {
      return this.picture.createAndAwait(s.userId, { topic: s.topic, template: s.template, palette: s.palette, character: s.character, count: s.count, categoryId: s.categoryId ?? undefined, aspect: s.aspect, title: s.title });
    }
    if (s.kind === 'blog') {
      return this.blog.createAndAwait(s.userId, { topic: s.topic, template: s.template, palette: s.palette, character: s.character, count: s.count, categoryId: s.categoryId ?? undefined, title: s.title });
    }
    return this.video.createAndAwait(s.userId, { topic: s.topic, template: s.template, palette: s.palette, character: s.character, categoryId: s.categoryId ?? undefined, aspect: s.aspect, voiceId: s.voiceId, title: s.title });
  }

  /** Deliver a built item to the schedule's Category channels (or legacy config). Error string | null. */
  private async deliver(s: RawSchedule, item: Record<string, unknown>, chatId?: string): Promise<string | null> {
    const di: DeliverItem = {
      title: String(item.title || ''),
      caption: String(item.caption || ''),
      videoUrl: item.videoUrl ? String(item.videoUrl) : undefined,
      thumbnailUrl: item.thumbnailUrl ? String(item.thumbnailUrl) : undefined,
      imageUrl: item.imageUrl ? String(item.imageUrl) : undefined,
      imageUrls: Array.isArray(item.imageUrls) ? (item.imageUrls as string[]) : undefined,
      coverUrl: item.coverUrl ? String(item.coverUrl) : undefined,
      body: item.body ? String(item.body) : undefined,
    };
    const res = await this.delivery.deliver(s.userId, s.categoryId, s.kind as MarketingKind, di, { legacyChatId: chatId ?? null });
    if (res.sent === 0) {
      const e = res.errors[0];
      return e === 'no-telegram'
        ? 'Chưa cấu hình kênh Telegram cho danh mục (hoặc Telegram mặc định) — nội dung đã tạo nhưng chưa gửi.'
        : e || 'Gửi Telegram thất bại.';
    }
    return res.errors.length ? res.errors.join('; ').slice(0, 300) : null;
  }
}

function kindEmoji(kind: string): string {
  return kind === 'picture' ? '🖼️' : kind === 'blog' ? '📝' : '🎬';
}
function libraryLink(kind: string, id: string): string {
  return `/marketing/${kind}/library?id=${id}`;
}
