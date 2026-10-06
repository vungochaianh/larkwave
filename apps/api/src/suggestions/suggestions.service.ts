import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { AppSuggestion, Paginated, SuggestionRunEntry, Track } from '@larkwave/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.service';
import { AuditService } from '../audit/audit.service';
import { AnthropicService } from '../engine/anthropic.service';
import { MaicService } from '../maic/maic.service';

const TRACKS = ['web', 'mobile', 'extension'];
const DAY_MS = 24 * 60 * 60 * 1000;

/** Fallback shown before the first AI run completes (and if generation fails). */
const DEFAULT_SUGGESTIONS: AppSuggestion[] = [
  { label: 'Landing quán cà phê', prompt: 'Trang landing cho quán cà phê với menu và form đặt bàn', track: 'web' },
  { label: 'Bảng Kanban công việc', prompt: 'Dashboard quản lý công việc dạng Kanban kéo thả', track: 'web' },
  { label: 'App ghi chú', prompt: 'App ghi chú nhanh có tìm kiếm và tag', track: 'web' },
  { label: 'Extension Pomodoro', prompt: 'Extension Chrome đếm ngược thời gian tập trung', track: 'extension' },
];

/**
 * Daily AI-generated app-idea suggestions for the builder home. A scheduler
 * refreshes them once a day (generating ~20 trending ideas via Claude); the most
 * recent run is served to users, and every run is kept for admin history.
 */
@Injectable()
export class SuggestionsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SuggestionsService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly anthropic: AnthropicService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
    private readonly maic: MaicService,
  ) {}

  onModuleInit(): void {
    // Refresh shortly after boot if the set is stale, then once a day.
    setTimeout(() => void this.refreshIfStale(), 20_000);
    this.timer = setInterval(() => void this.refreshIfStale(), DAY_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** The current suggestions users see (latest run, or the built-in defaults). */
  async current(): Promise<AppSuggestion[]> {
    const latest = await this.prisma.suggestionRun.findFirst({ orderBy: { createdAt: 'desc' } });
    const items = (latest?.items as AppSuggestion[] | undefined) ?? [];
    return items.length ? items : DEFAULT_SUGGESTIONS;
  }

  /** Run history (admin). */
  async listRuns(page = 1, pageSize = 20): Promise<Paginated<SuggestionRunEntry>> {
    const p = Math.max(1, page);
    const ps = Math.min(Math.max(1, pageSize), 100);
    const [rows, total] = await Promise.all([
      this.prisma.suggestionRun.findMany({ orderBy: { createdAt: 'desc' }, skip: (p - 1) * ps, take: ps }),
      this.prisma.suggestionRun.count(),
    ]);
    return { items: rows.map((r) => this.toEntry(r)), total, page: p, pageSize: ps };
  }

  private async refreshIfStale(): Promise<void> {
    try {
      const latest = await this.prisma.suggestionRun.findFirst({ orderBy: { createdAt: 'desc' } });
      const stale = !latest || Date.now() - latest.createdAt.getTime() > 20 * 60 * 60 * 1000;
      if (stale) await this.generate(null);
    } catch (e) {
      this.logger.warn(`suggestions refresh error: ${String(e)}`);
    }
  }

  /** Generate a fresh batch of ~20 suggestions via Claude and store the run. */
  async generate(actor: { id: string; email: string } | null): Promise<SuggestionRunEntry> {
    const today = new Date().toISOString().slice(0, 10);
    const tool = {
      name: 'emit_suggestions',
      description: 'Emit trending app-idea suggestions for a Vietnamese no-code app builder.',
      input_schema: {
        type: 'object',
        properties: {
          suggestions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', description: 'Tên ngắn ≤ 40 ký tự' },
                prompt: { type: 'string', description: 'Mô tả tiếng Việt đủ chi tiết để dán vào builder' },
                track: { type: 'string', enum: ['web', 'mobile', 'extension'] },
              },
              required: ['label', 'prompt'],
            },
          },
        },
        required: ['suggestions'],
      },
    };
    const prompt =
      `Hôm nay là ${today}. Đề xuất 20 ý tưởng app ĐA DẠNG, HIỆN ĐẠI, đang được quan tâm để người dùng ` +
      `dựng trên nền tảng no-code (Larkwave). Mỗi ý tưởng: label (tên ngắn ≤40 ký tự), prompt (mô tả TIẾNG VIỆT ` +
      `đủ chi tiết để dán vào builder dựng được ngay), track (web/mobile/extension — ưu tiên web). Trải đều: ` +
      `kinh doanh, năng suất, mạng xã hội, công cụ, giáo dục, tài chính, sức khoẻ, thương mại điện tử, AI, giải trí. ` +
      `Đa dạng theo ngày, tránh trùng lặp, hấp dẫn và khả thi.`;

    // MAIC-only: generate via the hosted gateway (jsonSchema → structured), fallback to Anthropic.
    // Creative brainstorm, not reasoning → effort:'low' keeps it well under MAIC's ask timeout
    // (20 rich structured items overran the 120s default at normal effort); raise timeoutSec for headroom.
    let value: { suggestions?: AppSuggestion[] };
    if (this.maic.enabled) {
      const res = await this.maic.ask({
        prompt, jsonSchema: tool.input_schema, effort: 'low', timeoutSec: 240,
        // actor rỗng khi cron chạy — lúc đó không quy về ai, đúng bản chất.
        endUser: actor ? { id: actor.id } : undefined,
      });
      value = (res.structured as { suggestions?: AppSuggestion[] }) ?? {};
    } else {
      ({ value } = await this.anthropic.toolJson<{ suggestions?: AppSuggestion[] }>(prompt, tool, {
        maxTokens: 4000,
      }));
    }
    const items: AppSuggestion[] = (value.suggestions ?? [])
      .filter((s) => s && s.label && s.prompt)
      .slice(0, 20)
      .map((s) => ({
        label: String(s.label).slice(0, 60),
        prompt: String(s.prompt).slice(0, 400),
        ...(TRACKS.includes(s.track as string) ? { track: s.track as Track } : {}),
      }));
    if (!items.length) throw new Error('Không sinh được gợi ý');

    const row = await this.prisma.suggestionRun.create({
      data: {
        items: items as unknown as object,
        count: items.length,
        model: this.config.env.ANTHROPIC_MODEL,
      },
    });
    await this.audit.log(actor?.id ?? null, actor?.email ?? null, 'suggestions.generate', row.id, {
      count: items.length,
    });
    this.logger.log(`suggestions: generated ${items.length}`);
    return this.toEntry(row);
  }

  private toEntry(r: {
    id: string;
    items: unknown;
    count: number;
    model: string;
    createdAt: Date;
  }): SuggestionRunEntry {
    return {
      id: r.id,
      items: (r.items as AppSuggestion[]) ?? [],
      count: r.count,
      model: r.model,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
