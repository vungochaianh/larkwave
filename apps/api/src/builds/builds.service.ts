import { cloneIntentWithoutUrl, cloneUrlFromPrompt } from './clone-intent';
import { etaFor, kindOf, remainingSec, type BuildKind } from './build-eta';
import {
  SURFACE_META,
  THU_TU_MAT_TIEN,
  xepTangBo,
  cleanSuitePrompt,
  normalizeSurfaces,
  surfaceFlags,
  suiteAppName,
  type SuiteMember,
} from './suite';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import archiver from 'archiver';
import {
  Paginated,
  Build,
  BuildConfig,
  BuildPreset,
  BuildStatus,
  Blueprint,
  DEFAULT_BUILD_PRESET,
  GeneratedFile,
  ModelChoice,
  DEFAULT_MODEL,
  PlanId,
  type SiteSurface,
  SseEvent,
  STAGE_ORDER,
  Track,
} from '@larkwave/shared';
import { PrismaService } from '../prisma/prisma.service';

/** One ERRORED build (failed/canceled) for the admin bug/error report. */
export interface BuildErrorEntry {
  id: string;
  appId: string;
  appName: string;
  appSlug: string;
  ownerEmail: string;
  ownerName: string | null;
  prompt: string;
  status: string;
  track: string | null;
  model: string;
  error: string | null;
  failedStage: string | null;
  /** Per-stage run progress (intake→…→deploy) — the conversation's execution trace. */
  stages: { name: string; status: string; detail?: string | null }[];
  createdAt: string;
  /** Last modified (re-run / status change) — "ngày modify". */
  updatedAt: string;
  finishedAt: string | null;
  /** Admin acknowledged/resolved this error in the report. */
  reviewed: boolean;
}
import { EventsService } from '../events/events.service';
import { AuditService } from '../audit/audit.service';
import { PipelineService } from '../pipeline/pipeline.service';
import { AuthUser } from '../common/auth-user';
import { AppAccessService } from '../common/app-access.service';
import { toBuild } from '../common/mappers';
import { normalizePlanId } from '../billing/plans';
import { BillingService } from '../billing/billing.service';
import { BuildQueryDto, CreateBuildDto } from './builds.dto';
import { PaginationDto } from '../common/dto/pagination.dto';

@Injectable()
export class BuildsService {
  private readonly logger = new Logger(BuildsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly audit: AuditService,
    private readonly pipeline: PipelineService,
    private readonly billing: BillingService,
    private readonly access: AppAccessService,
  ) {}

  /**
   * Các bản dựng ĐANG CHẠY của người dùng, kèm dự đoán còn bao lâu.
   *
   * Dự đoán tính từ chính lịch sử của HỌ (cùng loại build), rơi về số đo chung khi chưa đủ mẫu —
   * một người toàn clone site nặng sẽ có mốc khác hẳn người chỉ dựng landing page.
   */
  async running(user: AuthUser): Promise<
    {
      buildId: string;
      appId: string;
      appName: string;
      kind: BuildKind;
      startedAt: string;
      elapsedSec: number;
      etaSec: number;
      overdue: boolean;
      stage: string | null;
    }[]
  > {
    const rows = await this.prisma.build.findMany({
      where: { ownerId: user.id, status: 'running' },
      orderBy: { startedAt: 'asc' },
      select: {
        id: true,
        appId: true,
        mode: true,
        startedAt: true,
        stages: true,
        app: { select: { name: true, sourceUrl: true } },
      },
    });
    if (!rows.length) return [];

    // Lịch sử theo loại, lấy MỘT lượt cho tất cả để không truy vấn lặp trong vòng lặp.
    const done = await this.prisma.build.findMany({
      where: { ownerId: user.id, status: 'succeeded', startedAt: { not: null }, finishedAt: { not: null } },
      orderBy: { finishedAt: 'desc' },
      take: 60,
      select: { mode: true, startedAt: true, finishedAt: true, app: { select: { sourceUrl: true } } },
    });
    const byKind = new Map<BuildKind, number[]>();
    for (const d of done) {
      const k = kindOf({ mode: d.mode, hasSourceUrl: !!d.app?.sourceUrl });
      const sec = Math.round((d.finishedAt!.getTime() - d.startedAt!.getTime()) / 1000);
      byKind.set(k, [...(byKind.get(k) ?? []), sec]);
    }

    const now = Date.now();
    return rows.map((b) => {
      const kind = kindOf({ mode: b.mode, hasSourceUrl: !!b.app?.sourceUrl });
      const eta = etaFor(kind, byKind.get(kind) ?? []);
      const elapsedSec = b.startedAt ? Math.max(0, Math.round((now - b.startedAt.getTime()) / 1000)) : 0;
      const { remain, overdue } = remainingSec(eta, elapsedSec);
      // Giai đoạn đang chạy: bảng `stages` chỉ được ghi khi build KẾT THÚC, nên lúc đang chạy nó
      // thường toàn 'pending' — đừng hứa hẹn gì hơn thế.
      const stages = Array.isArray(b.stages) ? (b.stages as { name?: string; status?: string }[]) : [];
      const stage = stages.find((x) => x?.status === 'running')?.name ?? null;
      return {
        buildId: b.id,
        appId: b.appId,
        appName: b.app?.name ?? '',
        kind,
        startedAt: (b.startedAt ?? new Date()).toISOString(),
        elapsedSec,
        etaSec: remain,
        overdue,
        stage,
      };
    });
  }

  /** A short, URL-safe code (starts with a letter; no ambiguous chars). */
  private randomCode(n: number): string {
    const letters = 'abcdefghijkmnpqrstuvwxyz';
    const alnum = letters + '23456789';
    const b = randomBytes(n);
    let s = letters[b[0] % letters.length];
    for (let i = 1; i < n; i += 1) s += alnum[b[i] % alnum.length];
    return s;
  }

  /** Short 6-char subdomain code (the readable name lives on App.name). */
  private async uniqueSlug(): Promise<string> {
    for (let i = 0; i < 60; i += 1) {
      const code = this.randomCode(6);
      // eslint-disable-next-line no-await-in-loop
      if (!(await this.prisma.app.findUnique({ where: { slug: code } }))) return code;
    }
    return this.randomCode(10);
  }

  /**
   * Tên app, theo thứ tự ưu tiên: tên người dùng GÕ (`name`/`projectName`) → suy từ tên miền
   * nguồn khi sao chép → mấy chữ đầu của mô tả.
   *
   * `projectName` phải đứng trước `deriveName`: người dùng bị BẮT BUỘC gõ ô "Tên dự án" ở
   * Composer, nên bỏ qua nó rồi đặt "Bản sao <host>" là công khai phủ nhận thứ họ vừa gõ.
   */
  private pickName(dto: CreateBuildDto, sourceUrl?: string): string {
    return (
      dto.name?.trim() ||
      dto.projectName?.trim().slice(0, 60) ||
      this.deriveName(dto.prompt, sourceUrl)
    );
  }

  private deriveName(prompt: string, sourceUrl?: string): string {
    // ANY clone build gets named after the source host. This used to require the composer's exact
    // "Sao chép / dựng lại website:" preamble, so a user who simply typed
    // "clone https://x.com  THÀNH PHẦN cần dựng…" ended up with that whole sentence as the app
    // name — and as the page <title> of the site they shipped.
    if (sourceUrl) {
      try {
        const host = new URL(sourceUrl).hostname.replace(/^www\./, '');
        if (host) return `Bản sao ${host}`.slice(0, 60);
      } catch {
        /* fall through to word-based name */
      }
    }
    const words = prompt.trim().split(/\s+/).slice(0, 6).join(' ');
    return (words || 'App').slice(0, 60);
  }

  /**
   * Load the user's monthly QUOTA window. Returns null for admins (unlimited).
   * `tokensUsed` reads 0 when the monthly window has rolled over (a lazy VIEW — the
   * DB row is actually reset on the next metering; see PipelineService.meterBuildTokens).
   */
  private async loadQuotaCtx(
    user: AuthUser,
  ): Promise<{ planId: PlanId; monthlyTokens: number; tokensUsed: number; expired: boolean } | null> {
    if (user.role === 'admin') return null; // unlimited

    const account = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { plan: true, quotaUsed: true, quotaResetAt: true },
    });
    if (!account) throw new NotFoundException('Không tìm thấy người dùng');

    const planId = normalizePlanId(account.plan);
    const monthlyTokens = await this.billing.getMonthlyTokens(planId);
    const expired = !account.quotaResetAt || account.quotaResetAt.getTime() <= Date.now();
    const tokensUsed = expired ? 0 : account.quotaUsed;
    return { planId, monthlyTokens, tokensUsed, expired };
  }

  /**
   * Gate a new build: block (HTTP 402) when the user has already used 100% of their
   * monthly plan. Admins are never gated. Usage is metered AFTER the build from real
   * token usage, so a single in-flight build may push slightly past 100% — the NEXT
   * build is then blocked until the monthly reset or an upgrade.
   */
  private async assertUnderQuota(user: AuthUser): Promise<void> {
    const ctx = await this.loadQuotaCtx(user);
    if (!ctx) return; // admin
    if (ctx.tokensUsed >= ctx.monthlyTokens) {
      throw new HttpException(
        {
          message: 'Bạn đã dùng hết 100% gói tháng này. Nâng gói để tiếp tục tạo app.',
          code: 'QUOTA_EXCEEDED',
          plan: ctx.planId,
          percentUsed: 100,
        },
        402,
      );
    }
  }

  /**
   * Block build creation for free-plan users when the admin has turned the free
   * plan off. Reuses HTTP 402 so the web nudges the user to /pricing. Admins and
   * paid plans are never affected.
   */
  private async assertPlanUsable(user: AuthUser): Promise<void> {
    if (user.role === 'admin') return;
    if (await this.billing.isFreePlanEnabled()) return;
    const account = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { plan: true },
    });
    if (normalizePlanId(account?.plan) === 'free') {
      throw new HttpException(
        {
          message:
            'Chế độ miễn phí đang tạm tắt. Vui lòng nâng cấp lên gói trả phí để tiếp tục tạo app.',
          code: 'FREE_PLAN_DISABLED',
          plan: 'free',
        },
        402,
      );
    }
  }

  async create(
    user: AuthUser,
    dto: CreateBuildDto,
    opts: { skipCredits?: boolean } = {},
  ): Promise<{ buildId: string; appId: string }> {
    await this.assertPlanUsable(user);

    const isEdit = Array.isArray(dto.files) && dto.files.length > 0;
    if (isEdit && !dto.appId) {
      throw new BadRequestException('Sửa code cần appId của app hiện có');
    }

    // Every WEB app is generated full-stack: frontend + backend (D1 + API) + an
    // admin CMS area — no per-surface choice (users shouldn't need to know what an
    // "API" or "CMS" is) and no surcharge. Heavier builds simply meter more of the
    // monthly token budget. Mobile/Extension tracks stay client-only.
    const model: ModelChoice = dto.model ?? DEFAULT_MODEL;
    const isWeb = (dto.track ?? 'web') === 'web';
    // Nhưng KHÔNG áp cho bản sao website. Ép fullstack + CMS sẽ bật chỉ thị bắt buộc phải có
    // schema.sql, thư mục api và một khu quản trị — với một trang nội dung tĩnh thì đó chính là
    // nguồn gốc của những mục menu "Ghi chú" / "Quản trị" mà trang gốc KHÔNG HỀ CÓ. Sao chép một
    // trang nghĩa là chép đúng nó, không phải kèm thêm một hệ quản trị.
    const cloning = !!(dto.sourceUrl || cloneUrlFromPrompt(dto.prompt));
    const effFullstack = isWeb && !cloning;
    const effCms = isWeb && !cloning;

    // WORKFLOW PRESET. No preset ⇒ 'balanced' ⇒ exactly the pipeline we run today.
    // A CLONE (sourceUrl) defaults to 'turbo' instead: the design stage INVENTS its
    // own pages/sections from the prompt and that invented design is what codegen
    // then follows — it actively fights clone fidelity. Skipping it lets the source
    // screenshot + reference drive codegen directly (the reference reaches codegen through
    // `cloneNote`; until 2026-09-05 it reached blueprint ONLY, so skipping blueprint silently
    // threw the whole text reference away). An explicit preset always wins.
    // People type "clone https://x.com" straight into the PROMPT — the dedicated clone field is
    // optional and easy to miss. Before this, that URL was just text: no screenshot, no reference,
    // and the model invented a site that looked nothing like the target, with nothing explaining
    // why. Promote it to a real sourceUrl so the whole capture path engages.
    const sourceUrl = dto.sourceUrl || cloneUrlFromPrompt(dto.prompt);
    const preset: BuildPreset = dto.preset ?? (sourceUrl ? 'turbo' : DEFAULT_BUILD_PRESET);
    // 'thorough' is the ONLY preset that revives the blueprint approval gate. It does so through
    // the EXISTING autoApprove flag, so the pause → edit → approve → resume path
    // keeps working unchanged. Every other preset leaves autoApprove exactly as the
    // caller sent it.
    //
    // KHÔNG còn đúng câu "no UI has been setting, so it is effectively dead today" ở bản trước:
    // Composer có sẵn mục "Kỹ (xem thiết kế trước)" và gửi preset này cùng `surfaces` trong MỘT
    // yêu cầu. Tổ hợp "Kỹ" + bộ site là thao tác thật, và chính nó đã phá một bộ bốn site ngày
    // 23/09/2026 — xem `ket-cuc-build.ts`. Một chú thích nói "coi như đã chết" là lời mời không kiểm
    // nhánh đó nữa.
    const autoApprove = preset === 'thorough' ? false : dto.autoApprove !== false;

    // Usage is METERED AFTER the build from REAL token usage (PipelineService
    // .meterBuildTokens). Up front we only GATE: block a new build when the user has
    // already used 100% of their monthly plan. Admins + edit/rollback (skipCredits)
    // are never gated. The in-flight build may push slightly over 100%; the NEXT one
    // is then blocked until the monthly reset or an upgrade.
    if (!opts.skipCredits) await this.assertUnderQuota(user);

    // "Bộ site": người dùng chọn từ 2 mặt trở lên (website / backoffice / portal / API) ⇒ mỗi mặt
    // là MỘT app riêng với một lượt build riêng, nối nhau qua địa chỉ API dùng chung. Chỉ áp cho
    // app MỚI: chọn mặt lúc đang sửa một app có sẵn thì không còn nghĩa gì.
    const suiteSurfaces = isEdit || dto.appId ? [] : normalizeSurfaces(dto.surfaces);
    if (isWeb && suiteSurfaces.length >= 2) {
      return this.createSuite(user, dto, {
        surfaces: suiteSurfaces,
        model,
        preset,
        autoApprove,
        sourceUrl,
      });
    }

    let appId: string;
    if (dto.appId) {
      const app = await this.prisma.app.findUnique({ where: { id: dto.appId } });
      if (!app) throw new NotFoundException('Không tìm thấy app');
      // Owner, admin, or an editor collaborator may build/iterate.
      if (!(await this.access.canWrite(user, app.id))) {
        throw new ForbiddenException('Bạn không có quyền chỉnh sửa app này');
      }
      // Full-stack apps share ONE Pages project + D1 + a single "live" deployment
      // pointer — two concurrent builds for the same app would race on D1
      // provisioning and the live-pointer flip. Serialize them (web apps are always
      // full-stack now; same guard redeploy() already uses).
      if (effFullstack || app.backendKind === 'fullstack' || app.cms) {
        const inflight = await this.prisma.build.count({
          where: { appId: app.id, status: { in: ['queued', 'running', 'awaiting_approval'] } },
        });
        if (inflight > 0) {
          // Cùng một cái bẫy như ở `rebuildSuite`: build đứng ở cổng duyệt cũng được tính là
          // "đang chạy", mà nó đợi chính người đọc câu này chứ không tự kết thúc.
          const choDuyet = await this.prisma.build.findFirst({
            where: { appId: app.id, status: 'awaiting_approval' },
            select: { id: true },
          });
          throw new ConflictException(
            choDuyet
              ? 'App này đang có một bản thiết kế chờ bạn duyệt. Hãy mở nó để Duyệt hoặc Huỷ, rồi thử lại.'
              : 'Đang có build chạy cho app này — hãy đợi nó kết thúc rồi thử lại.',
          );
        }
      }
      // Web apps are always full-stack + CMS; also persist any newly chosen feature
      // options, MERGED over the app's existing spec so an iterate keeps prior choices.
      const mergedFeatures =
        dto.features !== undefined
          ? { ...((app.featureSpec as object | null) ?? {}), ...dto.features }
          : undefined;
      // Site trong "bộ site" KHÔNG được nâng lên full-stack+CMS. Nhánh này nâng MỌI app web, và
      // đó là đường mà một mặt tiền của bộ bị ghi thành backendKind='fullstack', cms=true chỉ vì
      // người dùng gửi một lời nhắn sửa app. Sau đó chốt chặn ở stageBuildWeb đòi backend, trong
      // khi rào cứng của bộ vừa bỏ đúng những file đó đi — build hỏng mà không ai hiểu vì sao.
      // Đồng thời CHỮA dữ liệu đã lệch: mỗi lượt build là một dịp kéo cờ về đúng vai.
      const suiteFix = surfaceFlags(app);
      const needSurface = isWeb && !suiteFix && (app.backendKind !== 'fullstack' || !app.cms);
      const flagDrift =
        !!suiteFix &&
        (app.backendKind !== suiteFix.backendKind ||
          app.cms !== suiteFix.cms ||
          (suiteFix.d1DatabaseId === null && !!app.d1DatabaseId));
      if (needSurface || flagDrift || mergedFeatures !== undefined || sourceUrl) {
        await this.prisma.app.update({
          where: { id: app.id },
          data: {
            ...(needSurface ? { backendKind: 'fullstack' as const, cms: true } : {}),
            ...(flagDrift ? suiteFix : {}),
            ...(mergedFeatures !== undefined ? { featureSpec: mergedFeatures as object } : {}),
            ...(sourceUrl ? { sourceUrl } : {}),
          },
        });
      }
      appId = app.id;
    } else {
      const name = this.pickName(dto, sourceUrl);
      const slug = await this.uniqueSlug();
      const app = await this.prisma.app.create({
        data: {
          ownerId: user.id,
          name,
          slug,
          description: dto.prompt,
          track: dto.track ?? 'web',
          status: 'draft',
          backendKind: effFullstack ? 'fullstack' : 'static',
          cms: effCms,
          ...(dto.features ? { featureSpec: dto.features as object } : {}),
          // `sourceUrl`, NOT `dto.sourceUrl`: a URL typed into the prompt is promoted above, and
          // reading the raw dto here dropped it on the floor for every NEW app — the build got
          // preset 'turbo' (which the promotion sets) but no source to capture, so it silently
          // fell back to inventing a site.
          ...(sourceUrl ? { sourceUrl } : {}),
        },
      });
      appId = app.id;
    }

    const attachments = await this.resolveAttachments(user.id, dto.attachmentIds);

    // No up-front charge: usage is metered AFTER the build from real token usage
    // (PipelineService.meterBuildTokens on success). The gate above already blocked
    // users who are at 100%.
    const build = await this.prisma.build.create({
      data: {
        appId,
        ownerId: user.id,
        prompt: cleanSuitePrompt(dto.prompt),
        name: dto.name ?? null,
        track: dto.track ?? null,
        status: 'queued',
        mode: isEdit ? 'edit' : 'codegen',
        model,
        autoApprove,
        preset,
        primaryColor: dto.primaryColor ?? null,
        style: dto.style ?? 'auto',
        attachments: attachments as unknown as object,
        ...(isEdit ? { files: dto.files as unknown as object } : {}),
        stages: STAGE_ORDER.map((name) => ({ name, status: 'pending' })) as unknown as object,
      },
    });

    await this.audit.log(user.id, user.email, 'build.create', build.id, { appId });
    this.pipeline.enqueue(build.id);
    return { buildId: build.id, appId };
  }

  /**
   * Resolve attached uploads the user owns into lightweight refs stored on the build
   * (the pipeline loads their content from Upload by id). Shared by the single-app and
   * "bộ site" paths — every site in a suite gets the SAME reference material.
   */
  private async resolveAttachments(
    ownerId: string,
    ids?: string[],
  ): Promise<{ id: string; name: string; kind: string; mime: string }[]> {
    if (!ids?.length) return [];
    const rows = await this.prisma.upload.findMany({
      where: { id: { in: ids }, ownerId },
      select: { id: true, name: true, kind: true, mime: true },
    });
    return rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, mime: r.mime }));
  }

  /**
   * "Bộ site" — một lượt bấm sinh ra NHIỀU site độc lập (xem `builds/suite.ts` để biết vì sao
   * tách site chứ không làm route trong cùng một app).
   *
   * Điểm mấu chốt về thứ tự: cấp `slug` cho TẤT CẢ các site TRƯỚC khi sinh prompt cho bất kỳ site
   * nào. Địa chỉ công khai suy ra từ slug, nên làm vậy thì ngay lượt build đầu tiên mỗi site đã
   * biết địa chỉ THẬT của các site anh em. Nếu tạo lần lượt từng cái một, site dựng trước sẽ phải
   * tự bịa ra một địa chỉ API — và không có lượt nào sau đó quay lại sửa nó.
   *
   * Trả về site "mặt tiền" (website → portal → backoffice → API) để người dùng bấm xong thì rơi
   * vào chỗ có gì đó xem được, chứ không phải trang chỉ mục endpoint của API.
   */
  private async createSuite(
    user: AuthUser,
    dto: CreateBuildDto,
    o: {
      surfaces: SiteSurface[];
      model: ModelChoice;
      preset: BuildPreset;
      autoApprove: boolean;
      sourceUrl?: string;
    },
  ): Promise<{ buildId: string; appId: string }> {
    const baseName = this.pickName(dto, o.sourceUrl);
    const suiteId = randomUUID();

    const members: SuiteMember[] = [];
    for (const surface of o.surfaces) {
      // eslint-disable-next-line no-await-in-loop
      const slug = await this.uniqueSlug();
      members.push({ surface, slug, name: suiteAppName(baseName, surface) });
    }

    // Site ĐẠI DIỆN — cái duy nhất hiện thành thẻ ở danh sách. Chọn mặt tiền trước (website →
    // portal → backoffice → API): người dùng bấm vào bộ thì phải rơi vào chỗ có gì đó xem được,
    // chứ không phải trang chỉ mục endpoint của API.
    // MỘT danh sách thứ tự dùng chung với đường xoá app (xem `THU_TU_MAT_TIEN`): hai bản sao
    // lệch nhau thì bộ site đổi "mặt" sau một lần xoá mà không ai hiểu vì sao.
    const primarySurface = THU_TU_MAT_TIEN.find((sf) => o.surfaces.includes(sf)) ?? o.surfaces[0]!;

    const attachments = await this.resolveAttachments(user.id, dto.attachmentIds);
    const created: { appId: string; buildId: string; surface: SiteSurface }[] = [];

    for (const m of members) {
      const meta = SURFACE_META[m.surface];
      // Sao chép một trang có sẵn chỉ áp cho MẶT TIỀN. Đổ cùng một trang nguồn vào khu quản trị
      // và cổng khách hàng thì ra ba bản sao của cùng một trang, không phải một hệ thống.
      const src = m.surface === 'site' ? o.sourceUrl : undefined;
      // eslint-disable-next-line no-await-in-loop
      const app = await this.prisma.app.create({
        data: {
          ownerId: user.id,
          name: m.name,
          slug: m.slug,
          // Mô tả giữ NGUYÊN câu của người dùng, không phải prompt đã ghép — đây là dòng chữ
          // hiện trên thẻ app, còn phần chỉ dẫn hệ thống thì nằm ở build.
          description: dto.prompt,
          track: 'web',
          status: 'draft',
          // Chỉ site API có cơ sở dữ liệu. Các mặt còn lại là frontend gọi sang nó, nên phải để
          // static — bật fullstack ở đây là `ensureBackend` sẽ đẻ thêm một CSDL riêng cho từng
          // site, đúng thứ mà cả thiết kế này sinh ra để tránh.
          backendKind: meta.fullstack ? ('fullstack' as const) : ('static' as const),
          cms: false,
          suiteId,
          surface: m.surface,
          suitePrimary: m.surface === primarySurface,
          ...(dto.features ? { featureSpec: dto.features as object } : {}),
          ...(src ? { sourceUrl: src } : {}),
        },
      });
      // eslint-disable-next-line no-await-in-loop
      const build = await this.prisma.build.create({
        data: {
          appId: app.id,
          ownerId: user.id,
          // Lưu ĐÚNG câu người dùng gõ. Bản đồ bộ site được pipeline ghép lúc CHẠY (xem
          // `suiteRunNote`) — nhồi nó vào đây làm prompt phình ~2100 ký tự, và lượt "Chạy lại"
          // gửi lại prompt đó thì vượt trần 4000 của DTO rồi nối chồng thêm một bản nữa.
          // Đo thật: một build ra 4568 ký tự với khối bộ site NHÂN BẢN x2.
          prompt: dto.prompt,
          name: m.name,
          track: 'web',
          status: 'queued',
          mode: 'codegen',
          model: o.model,
          autoApprove: o.autoApprove,
          preset: o.preset,
          primaryColor: dto.primaryColor ?? null,
          style: dto.style ?? 'auto',
          attachments: attachments as unknown as object,
          stages: STAGE_ORDER.map((name) => ({ name, status: 'pending' })) as unknown as object,
        },
      });
      created.push({ appId: app.id, buildId: build.id, surface: m.surface });
    }

    await this.audit.log(user.id, user.email, 'build.createSuite', suiteId, {
      surfaces: o.surfaces,
      apps: created.map((c) => c.appId),
    });
    // Mặt API chạy TRƯỚC, các mặt khác đợi nó xong (xem PipelineService.enqueueSuite để biết hai
    // đường hỏng mà chạy song song gây ra). Không có mặt API — không xảy ra với normalizeSurfaces
    // hiện tại, nhưng đừng để một thay đổi sau này biến chỗ này thành hàng chờ đứng im — thì
    // xếp hàng bình thường.
    // TẦNG PHỤ THUỘC, chạy lần lượt (xem PipelineService.enqueueSuite):
    //   1. API      — kho dữ liệu chung, mọi site khác bám vào schema của nó.
    //   2. Website  — mặt DUY NHẤT nhìn thấy trang gốc khi bộ sinh từ lệnh sao chép; nó chốt bản
    //                 sắc giao diện cho cả hệ thống.
    //   3. Backoffice + cổng khách hàng — nhận cả hợp đồng API lẫn bản sắc, và không phụ thuộc nhau.
    const { tangDau, tangSau } = xepTangBo((sf) => created.find((c) => c.surface === sf)?.buildId);
    if (tangDau) {
      this.pipeline.enqueueSuite(tangDau, tangSau);
    } else {
      // normalizeSurfaces luôn kèm 'api', nên nhánh này không xảy ra hôm nay. Để lại để một thay
      // đổi sau này ở đó không biến chỗ này thành một hàng chờ đứng im mà không ai hiểu vì sao.
      for (const c of created) this.pipeline.enqueue(c.buildId);
    }

    const primary = created.find((c) => c.surface === primarySurface) ?? created[0]!;
    return { buildId: primary.buildId, appId: primary.appId };
  }

  /**
   * "Chạy lại" một bản dựng đã có: máy chủ tự đọc yêu cầu gốc, KHÔNG nhận prompt qua HTTP.
   *
   * Vì sao phải là một endpoint riêng thay vì để giao diện gửi lại `build.prompt`: prompt đã lưu
   * có thể dài hơn trần 4000 ký tự mà DTO chấp nhận, và lúc đó nút "Chạy lại" chết ngay ở cổng
   * kiểm tra với câu "prompt must be shorter than or equal to 4000 characters" — người dùng không
   * làm gì được, vì chính hệ thống đã tạo ra cái prompt đó. Đo thật: một build 4568 ký tự do
   * bối cảnh bộ site bị nhồi vào rồi nhân bản.
   *
   * Ở đây prompt không đi qua mạng, và vẫn được làm sạch bằng `cleanSuitePrompt` để bỏ những khối
   * hệ thống ghép vào ở các phiên bản trước.
   */
  async rerun(user: AuthUser, buildId: string): Promise<{ buildId: string; appId: string }> {
    const old = await this.prisma.build.findUnique({
      where: { id: buildId },
      select: {
        appId: true,
        prompt: true,
        primaryColor: true,
        style: true,
        attachments: true,
        mode: true,
        track: true,
        // Loại app phải theo APP, không mặc định 'web'. `create()` dùng `dto.track ?? 'web'`, và
        // nhánh sửa app có sẵn thì `isWeb` bật lên sẽ GHI ĐÈ cột App thành full-stack + CMS. Tức
        // là chạy lại một app mobile/tiện ích/game sẽ biến nó thành web app — hỏng dữ liệu, và
        // hỏng lặng lẽ.
        app: { select: { track: true } },
      },
    });
    if (!old) throw new NotFoundException('Không tìm thấy bản dựng');
    if (!(await this.access.canWrite(user, old.appId))) {
      throw new ForbiddenException('Bạn không có quyền chạy lại bản dựng này');
    }
    const prompt = cleanSuitePrompt(old.prompt).trim();
    if (prompt.length < 3) throw new BadRequestException('Không tìm thấy yêu cầu gốc để chạy lại');
    const attachmentIds = ((old.attachments as unknown as { id: string }[]) ?? []).map((a) => a.id);
    return this.create(user, {
      appId: old.appId,
      track: (old.track ?? old.app.track) as Track,
      // Cắt cho chắc: một prompt NGƯỜI DÙNG gõ dài hơn trần là chuyện khác — nhưng ở đây ta đang
      // chạy lại thứ đã từng chạy, nên thà cắt còn hơn từ chối.
      prompt: prompt.slice(0, 4000),
      ...(attachmentIds.length ? { attachmentIds } : {}),
      ...(old.primaryColor ? { primaryColor: old.primaryColor } : {}),
      ...(old.style && old.style !== 'auto' ? { style: old.style } : {}),
    } as CreateBuildDto);
  }

  /**
   * Dựng lại CẢ BỘ site, đúng thứ tự phụ thuộc.
   *
   * Vì sao cần một nút riêng thay vì bảo người dùng vào từng site bấm "dựng lại": thứ tự mới là
   * thứ quyết định. Chạy backoffice trước site API thì nó lại tự đoán schema; chạy cổng khách
   * trước website mặt tiền thì nó lại không có bản sắc nào để bám. Bắt người dùng nhớ và làm
   * đúng chuỗi đó bằng tay là giao cho họ một việc mà chính hệ thống mới biết cách làm.
   *
   * Prompt lấy từ lần dựng GẦN NHẤT của mỗi site, ĐÃ LÀM SẠCH mọi khối do hệ thống ghép vào —
   * bản đồ bộ site, hợp đồng API, bản sắc giao diện đều được `suiteRunNote` dựng lại lúc chạy từ
   * trạng thái MỚI NHẤT. Giữ lại bản cũ trong prompt là mang theo một tấm bản đồ đóng băng.
   */
  async rebuildSuite(user: AuthUser, appId: string): Promise<{ builds: number }> {
    await this.assertPlanUsable(user);
    const anchorApp = await this.prisma.app.findUnique({
      where: { id: appId },
      select: { suiteId: true, ownerId: true },
    });
    if (!anchorApp?.suiteId) throw new BadRequestException('App này không thuộc bộ site nào');
    if (!(await this.access.canWrite(user, appId))) {
      throw new ForbiddenException('Bạn không có quyền dựng lại bộ site này');
    }
    const apps = await this.prisma.app.findMany({
      where: { suiteId: anchorApp.suiteId },
      select: { id: true, name: true, surface: true, suiteId: true, backendKind: true, cms: true },
    });
    // Đang có lượt nào chạy dở thì dừng: hai lượt cùng dựng một site sẽ tranh nhau D1 và con trỏ
    // bản đang chạy — đúng cái khoá mà đường dựng lại một app vẫn dùng.
    const inflight = await this.prisma.build.count({
      where: { appId: { in: apps.map((a) => a.id) }, status: { in: ['queued', 'running', 'awaiting_approval'] } },
    });
    if (inflight > 0) {
      // Nói ĐÚNG việc cần làm. Một build đứng ở cổng duyệt cũng được tính vào `inflight`, mà nó
      // sẽ KHÔNG bao giờ tự kết thúc — nó đang đợi chính người đọc câu này. Câu cũ ("hãy đợi nó
      // kết thúc") bảo họ đợi một thứ không bao giờ đến. Đo được: 29,2 giờ đứng ở cổng duyệt.
      const choDuyet = await this.prisma.build.findFirst({
        where: { appId: { in: apps.map((a) => a.id) }, status: 'awaiting_approval' },
        select: { id: true, appId: true },
      });
      throw new ConflictException(
        choDuyet
          ? 'Bộ site đang có một bản thiết kế chờ bạn duyệt. Hãy mở nó để Duyệt hoặc Huỷ, rồi thử lại.'
          : 'Bộ site đang có build chạy — hãy đợi nó kết thúc rồi thử lại.',
      );
    }

    // Kéo cờ về đúng VAI trước khi dựng lại. Bộ nào tạo trước khi có rào cứng đều đang mang cờ
    // lệch (đo được: mặt tiền có backendKind='fullstack', cms=true), và dựng lại mà không chữa thì
    // lượt mới lại chết đúng ở chốt chặn cũ.
    for (const a of apps) {
      const want = surfaceFlags(a);
      if (!want) continue;
      // eslint-disable-next-line no-await-in-loop
      await this.prisma.app.update({ where: { id: a.id }, data: want });
    }

    const made = new Map<string, string>();
    for (const a of apps) {
      // eslint-disable-next-line no-await-in-loop
      const last = await this.prisma.build.findFirst({
        where: { appId: a.id, mode: 'codegen' },
        orderBy: { createdAt: 'desc' },
        select: { prompt: true, model: true, preset: true, primaryColor: true, style: true, attachments: true },
      });
      if (!last) continue;
      // Làm sạch bằng ĐÚNG danh sách mốc dùng chung, không cắt tay.
      //
      // Bản trước ở đây cắt tay và chỉ bắt 2 trong 3 mốc — bỏ sót đúng mốc bản đồ bộ site. Và nó
      // không bao giờ có thể đúng: `suitePrompt` phát bản đồ TRƯỚC, còn hợp đồng/bản sắc nối SAU,
      // nên hễ hai lệnh cắt kia thật sự cắt được gì thì bản đồ CHẮC CHẮN còn nguyên. Sau đó
      // `suiteRunNote` nối thêm một bản đồ nữa lúc chạy — tái tạo chính xác lỗi nhân đôi mà cả
      // bản vá này sinh ra để diệt (đo: 2273 → cắt tay còn 2100 → lúc chạy 4182 với 2 bản đồ;
      // qua cleanSuitePrompt còn 17 ký tự, đúng câu gốc).
      const basePrompt = cleanSuitePrompt(last.prompt).trim();
      // Prompt cũ có thể bắt đầu NGAY bằng khối hệ thống (câu gốc rỗng) — lúc đó làm sạch xong
      // còn chuỗi rỗng, và tạo build với prompt rỗng là lặng lẽ sinh ra một lượt chạy vô nghĩa.
      // `rerun()` đã chặn ca này; ở đây trước giờ thì không.
      if (basePrompt.length < 3) continue;
      // eslint-disable-next-line no-await-in-loop
      const b = await this.prisma.build.create({
        data: {
          appId: a.id,
          ownerId: anchorApp.ownerId,
          prompt: basePrompt,
          name: a.name,
          track: 'web',
          status: 'queued',
          mode: 'codegen',
          model: last.model,
          autoApprove: true,
          preset: last.preset,
          primaryColor: last.primaryColor,
          style: last.style,
          attachments: last.attachments as object,
          stages: STAGE_ORDER.map((name) => ({ name, status: 'pending' })) as unknown as object,
        },
      });
      made.set(a.surface ?? a.id, b.id);
    }
    if (!made.size) throw new BadRequestException('Không tìm thấy lần dựng nào trước đó để lặp lại');

    await this.audit.log(user.id, user.email, 'build.rebuildSuite', anchorApp.suiteId, {
      apps: apps.length,
      builds: made.size,
    });
    const { tangDau, tangSau } = xepTangBo((sf) => made.get(sf));
    if (tangDau) this.pipeline.enqueueSuite(tangDau, tangSau);
    else for (const id of made.values()) this.pipeline.enqueue(id);
    return { builds: made.size };
  }

  /**
   * Import-only build: persist the imported files as an already-succeeded build
   * WITHOUT running the codegen/build pipeline and WITHOUT deploying. Used for
   * complex repos (monorepos, backends, multi-service) that must NOT be force-
   * built into a single Vite app — the source stays complete and is viewable /
   * downloadable / pushable. No credit is consumed.
   */
  async importOnly(
    user: AuthUser,
    appId: string,
    files: GeneratedFile[],
    prompt: string,
    track: Track | null,
  ): Promise<{ buildId: string; appId: string }> {
    const now = new Date();
    const build = await this.prisma.build.create({
      data: {
        appId,
        ownerId: user.id,
        prompt,
        track: track ?? null,
        status: 'succeeded',
        mode: 'import',
        model: 'sonnet',
        autoApprove: true,
        files: files as unknown as object,
        stages: [] as unknown as object,
        logs: [] as unknown as object,
        startedAt: now,
        finishedAt: now,
      },
    });
    await this.audit.log(user.id, user.email, 'build.import', build.id, {
      appId,
      files: files.length,
    });
    return { buildId: build.id, appId };
  }

  /**
   * Create a QUEUED "import" build SHELL (no files yet) so the git import can run
   * in the BACKGROUND and stream real progress to this buildId, instead of the
   * import HTTP request blocking on a long clone+classify. A background job fills
   * the shell, then promotes it to a deploy build ({@link startImportedBuild}) or
   * finalizes it as import-only ({@link finishImportOnly}). No credit consumed.
   */
  async createImportShell(user: AuthUser, appId: string, prompt: string): Promise<string> {
    const build = await this.prisma.build.create({
      data: {
        appId,
        ownerId: user.id,
        prompt,
        status: 'queued',
        mode: 'import',
        model: 'sonnet',
        autoApprove: true,
        stages: STAGE_ORDER.map((name) => ({ name, status: 'pending' })) as unknown as object,
      },
    });
    return build.id;
  }

  /**
   * Promote an import shell to a deployable build (mode 'edit' = deploy the files) +
   * enqueue. When a {@link BuildConfig} is supplied (a directly-buildable imported
   * repo), it's snapshotted onto the build so the pipeline builds + deploys via the
   * NO-LLM config path (zero tokens), and stays reproducible on re-run.
   */
  async startImportedBuild(
    buildId: string,
    files: GeneratedFile[],
    track: Track | null,
    cfg?: BuildConfig | null,
  ): Promise<void> {
    await this.prisma.build.update({
      where: { id: buildId },
      data: {
        mode: 'edit',
        track: track ?? null,
        files: files as unknown as object,
        status: 'queued',
        buildConfig: (cfg ?? undefined) as unknown as object,
      },
    });
    this.pipeline.enqueue(buildId);
  }

  /** Finalize an import shell as import-only (stored source, no build/deploy). */
  async finishImportOnly(
    buildId: string,
    files: GeneratedFile[],
    track: Track | null,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.build.update({
      where: { id: buildId },
      data: {
        track: track ?? null,
        files: files as unknown as object,
        status: 'succeeded',
        stages: [] as unknown as object,
        startedAt: now,
        finishedAt: now,
      },
    });
  }

  /** Mark an import shell failed (background fetch/classify error). */
  async failImport(buildId: string, error: string): Promise<void> {
    const now = new Date();
    await this.prisma.build
      .update({
        where: { id: buildId },
        data: { status: 'failed', error: error.slice(0, 2000), startedAt: now, finishedAt: now },
      })
      .catch(() => undefined);
  }

  /**
   * Roll back to a previous build by re-deploying its EXACT files as a new
   * EDIT-mode build (no AI codegen, no credit charge). The new build streams +
   * deploys like any other, so the rollback is itself a versioned entry in the
   * history. Returns the new build to stream.
   */
  async rollback(user: AuthUser, sourceBuildId: string): Promise<{ buildId: string; appId: string }> {
    const src = await this.prisma.build.findUnique({ where: { id: sourceBuildId } });
    if (!src) throw new NotFoundException('Không tìm thấy build');
    if (src.ownerId !== user.id && user.role !== 'admin') {
      throw new ForbiddenException('Build không thuộc về bạn');
    }
    const files = (src.files as unknown as GeneratedFile[] | null) ?? [];
    if (!files.length) {
      throw new BadRequestException('Bản build này không có mã nguồn để khôi phục');
    }
    await this.audit.log(user.id, user.email, 'build.rollback', sourceBuildId, {
      appId: src.appId,
      files: files.length,
    });
    return this.create(
      user,
      {
        appId: src.appId,
        prompt: `Khôi phục phiên bản ${sourceBuildId.slice(-6)}`,
        track: (src.track || undefined) as Track | undefined,
        files,
      },
      { skipCredits: true },
    );
  }

  /**
   * Re-deploy a build's ALREADY-GENERATED source as a fresh EDIT-mode build (no AI
   * codegen, no credit charge). Use when codegen succeeded but the build/deploy
   * stage failed (e.g. a transient Cloudflare error): it rebuilds + redeploys the
   * exact files — no regeneration, no cost. Same safe mechanism as rollback; D1
   * schema re-seeding is already guarded by app.d1Ready in the deploy stage.
   */
  async redeploy(user: AuthUser, sourceBuildId: string): Promise<{ buildId: string; appId: string }> {
    const src = await this.prisma.build.findUnique({
      where: { id: sourceBuildId },
      include: { app: true },
    });
    if (!src) throw new NotFoundException('Không tìm thấy build');
    // Owner, admin, or an editor collaborator may re-deploy.
    if (
      src.ownerId !== user.id &&
      user.role !== 'admin' &&
      !(await this.access.canWrite(user, src.appId))
    ) {
      throw new ForbiddenException('Build không thuộc về bạn');
    }
    // Web-only: only web apps have a Cloudflare Pages deploy that can transiently
    // fail. Mobile/extension just package a ZIP + an AI-generated guide — an edit
    // re-deploy there would re-run that guide (a real model call) for nothing, so
    // steer those to "Tạo lại" instead.
    const track = (src.track as Track | null) ?? (src.app?.track as Track | null) ?? 'web';
    if (track !== 'web') {
      throw new BadRequestException(
        'Chỉ web app mới có bước deploy để triển khai lại. Với mobile/extension hãy dùng “Tạo lại”.',
      );
    }
    const files = (src.files as unknown as GeneratedFile[] | null) ?? [];
    if (!files.length) {
      throw new BadRequestException(
        'Build này chưa có mã nguồn đã tạo để triển khai lại. Hãy dùng “Tạo lại”.',
      );
    }
    // Don't race an in-flight build for this app: they'd both touch the same Pages
    // project / D1 binding and fight over the "live" deployment pointer.
    const inflight = await this.prisma.build.count({
      where: { appId: src.appId, status: { in: ['queued', 'running', 'awaiting_approval'] } },
    });
    if (inflight > 0) {
      throw new ConflictException(
        'Đang có build chạy cho app này — hãy đợi nó kết thúc rồi triển khai lại.',
      );
    }
    await this.audit.log(user.id, user.email, 'build.redeploy', sourceBuildId, {
      appId: src.appId,
      files: files.length,
    });
    return this.create(
      user,
      {
        appId: src.appId,
        prompt: 'Triển khai lại mã nguồn đã tạo',
        track,
        files,
        ...(src.primaryColor ? { primaryColor: src.primaryColor } : {}),
        ...(src.style ? { style: src.style } : {}),
      },
      { skipCredits: true },
    );
  }

  /**
   * Approve the design Blueprint at the gate: consume the (deferred) credit,
   * promote the draft Blueprint to approved, snapshot it onto the App and resume
   * the paused pipeline so codegen runs.
   */
  async approve(user: AuthUser, id: string): Promise<{ ok: true }> {
    const build = await this.prisma.build.findUnique({ where: { id }, include: { blueprint: true } });
    if (!build) throw new NotFoundException('Không tìm thấy build');
    if (build.ownerId !== user.id && user.role !== 'admin') {
      throw new ForbiddenException('Build không thuộc về bạn');
    }
    if (build.status !== 'awaiting_approval') {
      throw new ConflictException('Build không ở trạng thái chờ duyệt');
    }
    const bp = build.blueprint;
    if (!bp) throw new ConflictException('Chưa có thiết kế để duyệt');

    // Atomically CLAIM the gate so two concurrent approves (double-click / retry)
    // can't both charge: only the request that flips awaiting_approval→queued wins.
    const claim = await this.prisma.build.updateMany({
      where: { id: build.id, status: 'awaiting_approval' },
      data: { status: 'queued' },
    });
    if (claim.count === 0) throw new ConflictException('Build đã được duyệt rồi.');

    const blueprint = bp.spec as unknown as Blueprint;
    // Surfaces the approved app will have (forced, or the AI blueprint's choice).
    const cur = await this.prisma.app.findUnique({
      where: { id: build.appId },
      select: { backendKind: true, cms: true },
    });
    const fullstack =
      blueprint?.backend === 'fullstack' || cur?.backendKind === 'fullstack' || !!cur?.cms;

    // No charge at the gate: usage is metered AFTER the build from real token usage
    // (the create() quota gate already blocked users at 100%).
    try {
      await this.prisma.blueprint.update({
        where: { id: bp.id },
        data: { status: 'approved', approvedAt: new Date(), approvedBy: user.id },
      });
      // NEVER DOWNGRADE: if the app is already full-stack / CMS, it stays so even if
      // the (possibly user-edited) blueprint says static. Mirrors the auto-approve
      // path's markBlueprintApproved() so the two never diverge.
      await this.prisma.app.update({
        where: { id: build.appId },
        data: {
          blueprint: bp.spec as unknown as object,
          backendKind: fullstack ? 'fullstack' : 'static',
        },
      });
    } catch (e) {
      // A step failed → the build is stranded 'queued' and the claimed gate blocks a
      // retry. Release the gate (queued→awaiting_approval) so retry works. Usage is
      // metered post-build, so there's nothing to refund here.
      this.logger.error(
        `approve(): post-claim step failed for build ${build.id}, rolling back: ${String(e)}`,
      );
      await this.prisma.build
        .updateMany({ where: { id: build.id, status: 'queued' }, data: { status: 'awaiting_approval' } })
        .catch(() => undefined);
      throw e;
    }
    await this.audit.log(user.id, user.email, 'build.approve', id, { appId: build.appId });
    this.pipeline.resume(id);
    return { ok: true };
  }

  /** Save the user's edits to a draft Blueprint while the build waits at the gate. */
  async updateBlueprint(user: AuthUser, id: string, blueprint: Blueprint): Promise<Build> {
    const build = await this.prisma.build.findUnique({ where: { id }, include: { blueprint: true } });
    if (!build) throw new NotFoundException('Không tìm thấy build');
    if (build.ownerId !== user.id && user.role !== 'admin') {
      throw new ForbiddenException('Build không thuộc về bạn');
    }
    if (build.status !== 'awaiting_approval') {
      throw new ConflictException('Chỉ chỉnh được thiết kế khi đang chờ duyệt');
    }
    if (!build.blueprint) throw new ConflictException('Chưa có thiết kế để chỉnh');
    await this.prisma.blueprint.update({
      where: { id: build.blueprint.id },
      data: { spec: blueprint as unknown as object },
    });
    const updated = await this.prisma.build.findUniqueOrThrow({
      where: { id },
      include: { blueprint: true },
    });
    return toBuild(updated, { withLogs: true });
  }

  async list(user: AuthUser, q: BuildQueryDto): Promise<Paginated<Build>> {
    // When scoped to an app the user can access (owner/member), return ALL of
    // that app's builds (shared history). Otherwise restrict to the user's own.
    const appScoped = q.appId ? await this.access.canRead(user, q.appId) : false;
    const where = {
      ...(appScoped
        ? { appId: q.appId }
        : {
            // Admin may scope to ANY user via ownerId (support/debug); non-admins are
            // always locked to their own builds regardless of what ownerId they send.
            ...(user.role === 'admin' ? (q.ownerId ? { ownerId: q.ownerId } : {}) : { ownerId: user.id }),
            ...(q.appId ? { appId: q.appId } : {}),
          }),
      ...(q.status ? { status: q.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.build.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: q.skip,
        take: q.pageSize,
        // Cùng lý do như apps.service.buildsFor: danh sách build KHÔNG cần cột `files` (toàn bộ
        // mã nguồn của app), và kéo nó về chỉ để vứt đi làm trang chậm dần theo số lần build.
        omit: { files: true },
      }),
      this.prisma.build.count({ where }),
    ]);
    return {
      items: items.map((b) => toBuild({ ...b, files: [] })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  /**
   * Admin bug/error report: every build that ERRORED (failed/canceled) across the
   * whole platform, with the app + owner + the stage that broke + the error — so an
   * admin can triage failed builds without digging through each user. Optional
   * free-text search over prompt / error / app name.
   */
  async errorReport(
    q: PaginationDto,
    includeReviewed = false,
    ownerId?: string,
  ): Promise<{
    items: BuildErrorEntry[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const search = q.q?.trim();
    const where = {
      // A FAILED build is a real platform error. A CANCELED build is almost always
      // a clean user "stop" (no error recorded) — those are NOT failures and only
      // add noise (they used to show as "(no message)" rows the admin can't act
      // on). So include canceled builds ONLY when one actually carries an error.
      AND: [
        {
          OR: [
            { status: 'failed' as BuildStatus },
            { status: 'canceled' as BuildStatus, NOT: { error: null } },
          ],
        },
        // By default only show errors NOT yet acknowledged by an admin, so resolving
        // one clears it from the report (the user's "chuyển trạng thái → passed").
        ...(includeReviewed ? [] : [{ errorReviewed: false }]),
        // Admin support drill-down: scope errored builds to one user.
        ...(ownerId ? [{ ownerId }] : []),
        ...(search
          ? [
              {
                OR: [
                  { prompt: { contains: search } },
                  { error: { contains: search } },
                  { app: { name: { contains: search } } },
                ],
              },
            ]
          : []),
      ],
    };
    const [rows, total] = await Promise.all([
      this.prisma.build.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: q.skip,
        take: q.pageSize,
        include: {
          app: { select: { name: true, slug: true } },
          owner: { select: { email: true, name: true } },
        },
      }),
      this.prisma.build.count({ where }),
    ]);
    const items: BuildErrorEntry[] = rows.map((b) => {
      const stages =
        (b.stages as unknown as { name: string; status: string; detail?: string | null }[]) ?? [];
      return {
        id: b.id,
        appId: b.appId,
        appName: b.app?.name ?? '—',
        appSlug: b.app?.slug ?? '',
        ownerEmail: b.owner?.email ?? '—',
        ownerName: b.owner?.name ?? null,
        prompt: b.prompt,
        status: b.status as string,
        track: (b.track as string | null) ?? null,
        model: (b.model as string) ?? 'opus',
        error: b.error ?? null,
        failedStage: stages.find((s) => s.status === 'error')?.name ?? null,
        stages: stages.map((s) => ({ name: s.name, status: s.status, detail: s.detail ?? null })),
        createdAt: b.createdAt.toISOString(),
        updatedAt: b.updatedAt.toISOString(),
        finishedAt: b.finishedAt ? b.finishedAt.toISOString() : null,
        reviewed: b.errorReviewed ?? false,
      };
    });
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  /** Admin acknowledges (or re-opens) a failed build in the error report. */
  async setErrorReviewed(id: string, reviewed: boolean): Promise<{ ok: true }> {
    const build = await this.prisma.build.findUnique({ where: { id }, select: { id: true } });
    if (!build) throw new NotFoundException('Không tìm thấy build');
    await this.prisma.build.update({ where: { id }, data: { errorReviewed: reviewed } });
    return { ok: true };
  }

  /** Admin marks ALL currently-unresolved errored builds as reviewed (one click). */
  async reviewAllErrors(): Promise<{ count: number }> {
    const r = await this.prisma.build.updateMany({
      where: { status: { in: ['failed', 'canceled'] as BuildStatus[] }, errorReviewed: false },
      data: { errorReviewed: true },
    });
    return { count: r.count };
  }

  async get(user: AuthUser, id: string): Promise<Build> {
    const build = await this.prisma.build.findUnique({ where: { id }, include: { blueprint: true } });
    if (!build) throw new NotFoundException('Không tìm thấy build');
    // The build's creator, an admin, or anyone with access to its app may view.
    if (
      build.ownerId !== user.id &&
      user.role !== 'admin' &&
      !(await this.access.canRead(user, build.appId))
    ) {
      throw new ForbiddenException('Build không thuộc về bạn');
    }
    return toBuild(build, { withLogs: true, withFiles: true });
  }

  async cancel(user: AuthUser, id: string): Promise<{ ok: true }> {
    const build = await this.prisma.build.findUnique({ where: { id } });
    if (!build) throw new NotFoundException('Không tìm thấy build');
    if (build.ownerId !== user.id && user.role !== 'admin') {
      throw new ForbiddenException('Build không thuộc về bạn');
    }
    if (['succeeded', 'failed', 'canceled'].includes(build.status)) {
      throw new ConflictException('Build đã kết thúc, không thể huỷ');
    }
    // running -> abort the live pipeline (kills child processes + fetches)
    const aborted = this.pipeline.cancel(id);
    if (!aborted) {
      // queued (not yet running) -> mark canceled; the pipeline skips it on pump
      await this.prisma.build.update({
        where: { id },
        data: { status: 'canceled', finishedAt: new Date() },
      });
      // Nothing to meter for a canceled build (only succeeded builds consume quota).
      const updated = await this.prisma.build.findUniqueOrThrow({ where: { id } });
      this.events.publish(id, { type: 'status', status: 'canceled' });
      this.events.publish(id, { type: 'done', build: toBuild(updated) });
    }
    await this.audit.log(user.id, user.email, 'build.cancel', id);
    return { ok: true };
  }

  /** Stream the generated project's files as a .zip download. */
  async download(user: AuthUser, id: string, res: Response): Promise<void> {
    const build = await this.prisma.build.findUnique({
      where: { id },
      include: { app: true },
    });
    if (!build) throw new NotFoundException('Không tìm thấy build');
    if (
      build.ownerId !== user.id &&
      user.role !== 'admin' &&
      !(await this.access.canRead(user, build.appId))
    ) {
      throw new ForbiddenException('Build không thuộc về bạn');
    }
    const files = (build.files as unknown as GeneratedFile[]) ?? [];
    if (files.length === 0) throw new NotFoundException('Build chưa có file nào');

    const name = build.app?.slug ?? 'toolswave-app';
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', () => {
      if (!res.headersSent) res.status(500);
      if (!res.writableEnded) res.end();
    });
    archive.pipe(res);
    for (const f of files)
      archive.append(
        f.encoding === 'base64' ? Buffer.from(f.content, 'base64') : f.content,
        { name: f.path },
      );
    await archive.finalize();
  }

  /** Server-Sent Events stream of live pipeline progress. */
  async stream(user: AuthUser, id: string, res: Response): Promise<void> {
    const build = await this.prisma.build.findUnique({ where: { id }, include: { blueprint: true } });
    if (!build) throw new NotFoundException('Không tìm thấy build');
    if (
      build.ownerId !== user.id &&
      user.role !== 'admin' &&
      !(await this.access.canRead(user, build.appId))
    ) {
      throw new ForbiddenException('Build không thuộc về bạn');
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const send = (event: SseEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`);
    send({ type: 'snapshot', build: toBuild(build, { withLogs: true }) });

    const terminal = ['succeeded', 'failed', 'canceled'];
    if (terminal.includes(build.status)) {
      send({ type: 'done', build: toBuild(build) });
      res.end();
      return;
    }

    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': ping\n\n');
    }, 15000);

    let unsubscribe: () => void = () => undefined;
    const cleanup = () => {
      clearInterval(heartbeat);
      unsubscribe();
      if (!res.writableEnded) res.end();
    };
    unsubscribe = this.events.subscribe(id, (event) => {
      send(event);
      if (event.type === 'done' || event.type === 'error') cleanup();
    });
    res.on('close', cleanup);
  }
}
