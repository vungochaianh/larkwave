import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  AppMemberEntry,
  AppMemberRole,
  Friend,
  SuiteMemberInfo,
} from '@larkwave/shared';
import {
  App,
  AppSecretItem,
  AppSecretsResponse,
  AppSeo,
  Build,
  Deployment,
  DEFAULT_BANNED_KEYWORDS,
  Paginated,
} from '@larkwave/shared';
import { AppConfigService } from '../config/app-config.service';
import { decryptJson, encryptJson } from '../common/secret-crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PipelineService } from '../pipeline/pipeline.service';
import { AuditService } from '../audit/audit.service';
import { CloudflarePagesService } from '../engine/cloudflare-pages.service';
import { ServerDeployService } from '../server-deploy/server-deploy.service';
import { PlatformConfigService } from '../config/platform-config.service';
import { AuthUser } from '../common/auth-user';
import { AppAccessService } from '../common/app-access.service';
import { toApp, toBuild, toDeployment } from '../common/mappers';
import { PaginationDto } from '../common/dto/pagination.dto';
import { AppQueryDto, SuspendAppDto, UpdateAppDto } from './apps.dto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { chonDaiDienMoi } from '../builds/suite';

@Injectable()
export class AppsService {
  private readonly logger = new Logger(AppsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly pages: CloudflarePagesService,
    private readonly config: PlatformConfigService,
    private readonly access: AppAccessService,
    private readonly serverDeploy: ServerDeployService,
    private readonly appConfig: AppConfigService,
    private readonly pipeline: PipelineService,
  ) {}

  /**
   * DỰNG LẠI app mà KHÔNG sinh code — chỉ build + deploy lại từ file của bản dựng gần nhất.
   *
   * Vì sao cần một đường riêng. Mỗi lượt deploy, pipeline ghi vào app những thứ của NỀN TẢNG chứ
   * không phải của người dùng: header bảo mật (`_headers`), đoạn đếm lượt xem, huy hiệu "Tạo bằng
   * Larkwave", thẻ SEO. Chúng bị NƯỚNG VÀO artifact đã deploy — nên khi nền tảng đổi (ngày
   * 22/09/2026 hai hệ hoán đổi tên miền), mọi app đã deploy trước đó vẫn mang giá trị cũ. Đo ngày
   * 23/09 trên 12 app live: 9 app còn CSP trỏ tên miền cũ nên preview trong console bị chặn trắng,
   * 10 app còn URL đếm lượt xem cũ nên mọi lượt truy cập trả 404 và thống kê chết câm.
   *
   * KHÔNG dùng `rerun()` cho việc này: rerun chạy lại từ prompt, tức sinh code MỚI bằng AI — app
   * của người dùng có thể ra khác hẳn bản họ đang chạy. Ở đây phải giữ nguyên từng file.
   *
   * Không tính hạn mức: build không gọi AI, và đây là việc của nền tảng chứ không phải của chủ app.
   */
  async redeployLatest(appId: string, actor?: AuthUser): Promise<{ buildId: string }> {
    const app = await this.prisma.app.findUnique({
      where: { id: appId },
      select: { id: true, ownerId: true, track: true, name: true, slug: true },
    });
    if (!app) throw new NotFoundException('Không tìm thấy app');
    const last = await this.prisma.build.findFirst({
      where: { appId, status: 'succeeded', NOT: { files: { equals: Prisma.DbNull } } },
      orderBy: { createdAt: 'desc' },
      select: {
        prompt: true,
        primaryColor: true,
        style: true,
        model: true,
        preset: true,
        files: true,
        buildConfig: true,
      },
    });
    if (!last) throw new BadRequestException('App chưa có bản dựng thành công nào để dựng lại');

    const build = await this.prisma.build.create({
      data: {
        appId: app.id,
        ownerId: app.ownerId,
        prompt: last.prompt,
        name: app.name,
        track: app.track,
        status: 'queued',
        // `edit` = bỏ qua sinh code, dùng thẳng `files`. Đây là chỗ bảo đảm app không đổi nội dung.
        mode: 'edit',
        model: last.model,
        primaryColor: last.primaryColor,
        style: last.style,
        autoApprove: true,
        preset: last.preset,
        files: last.files as object,
        ...(last.buildConfig ? { buildConfig: last.buildConfig as object } : {}),
      },
      select: { id: true },
    });
    await this.audit.log(actor?.id ?? app.ownerId, actor?.email ?? null, 'app.redeploy', app.id, {
      buildId: build.id,
      slug: app.slug,
    });
    this.pipeline.enqueue(build.id);
    return { buildId: build.id };
  }

  /**
   * Deploy a DESKTOP-built app to Cloudflare Pages. The desktop builds the app
   * locally (vite → dist/) and uploads the static file set (base64); we never
   * ship CF credentials to the client. Project name is namespaced by the user so
   * re-deploys of the same app update the same site. Returns the public URL.
   */
  async desktopDeploy(
    user: AuthUser,
    body: { slug?: string; name?: string; files?: { path?: string; content?: string }[] },
  ): Promise<{ url: string }> {
    const files = Array.isArray(body?.files) ? body.files : [];
    if (!files.length) throw new BadRequestException('Không có file để xuất bản');
    if (files.length > 1000) throw new BadRequestException('Quá nhiều file (>1000)');

    // Stable, user-namespaced Cloudflare Pages project name (lowercase, a–z0–9-).
    const safe = String(body.slug || 'app')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 28) || 'app';
    const project = `twd-${user.id.slice(0, 8)}-${safe}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 54);

    const dir = await mkdtemp(join(tmpdir(), 'tw-deploy-'));
    try {
      let total = 0;
      let written = 0;
      for (const f of files) {
        // Reject path traversal / absolute paths — files must stay under `dir`.
        const rel = String(f?.path || '').replace(/\\/g, '/').replace(/^\/+/, '');
        if (!rel || rel.split('/').some((seg) => seg === '..' || seg === '')) continue;
        const buf = Buffer.from(String(f?.content || ''), 'base64');
        total += buf.length;
        if (total > 30 * 1024 * 1024) throw new BadRequestException('Bản build quá lớn (>30MB)');
        const dest = join(dir, rel);
        if (dest !== dir && !dest.startsWith(dir + sep)) continue; // defence-in-depth
        await mkdir(dirname(dest), { recursive: true });
        await writeFile(dest, buf);
        written++;
      }
      if (!written) throw new BadRequestException('Không có file hợp lệ để xuất bản');
      const res = await this.pages.deploy(project, dir);
      // Prefer the STABLE project URL (immediately live + permanent) over the
      // per-deployment hash URL, which has DNS-propagation lag on first deploy.
      return { url: res.url || res.previewUrl || '' };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /** Resolve the admin-editable banned-keyword list (lowercased), with defaults. */
  private async bannedKeywords(): Promise<string[]> {
    const cfg = await this.config.get().catch(() => null);
    const list = cfg?.moderation?.bannedKeywords ?? [...DEFAULT_BANNED_KEYWORDS];
    return list.map((k) => k.toLowerCase()).filter(Boolean);
  }

  /** Flag heuristic: does any banned keyword appear in name/description/prompt? */
  private isFlagged(haystacks: (string | null | undefined)[], banned: string[]): boolean {
    const text = haystacks.filter(Boolean).join(' ').toLowerCase();
    return banned.some((k) => text.includes(k));
  }

  private scope(user: AuthUser, ownerId?: string) {
    if (user.role === 'admin') return ownerId ? { ownerId } : {};
    return { ownerId: user.id };
  }

  async list(user: AuthUser, q: AppQueryDto): Promise<Paginated<App>> {
    const isAdmin = user.role === 'admin';
    // `flagged` moderation is an admin-only concern; ignore it for owners.
    const wantFlagged = isAdmin && q.flagged === true;
    const where = {
      ...this.scope(user, q.ownerId),
      // Hide service "child" apps from the main list — they are PARTS of a
      // workspace app, managed inside it (Cấu trúc dự án), not standalone apps.
      parentId: null,
      ...(q.status ? { status: q.status } : {}),
      ...(q.track ? { track: q.track } : {}),
      ...(q.pinned !== undefined ? { pinned: q.pinned } : {}),
      // Hai điều kiện dạng OR nên PHẢI nằm trong `AND`, không phải hai khoá `OR` cạnh nhau: trong
      // một object literal, khoá `OR` sau ghi đè khoá `OR` trước, nên bộ lọc bộ site sẽ lặng lẽ
      // biến mất đúng lúc người dùng gõ tìm kiếm — và không có gì báo là nó đã biến mất.
      AND: [
        // "Bộ site": bốn site của MỘT hệ thống chỉ hiện MỘT thẻ (site đại diện), các site còn
        // lại nằm bên trong nó. Lọc ở tầng SQL chứ không gom sau khi lấy trang về — phân trang
        // và đếm tổng đều ở SQL, gom sau sẽ ra những trang thiếu thẻ và tổng số nói dối.
        { OR: [{ suiteId: null }, { suitePrimary: true }] },
        ...(q.q
          ? [
              {
                OR: [
                  { name: { contains: q.q, mode: 'insensitive' as const } },
                  { slug: { contains: q.q, mode: 'insensitive' as const } },
                ],
              },
            ]
          : []),
      ],
    };

    // The `flagged=true` filter is computed (name/description/latest prompt vs
    // banned keywords) so it can't be a SQL WHERE — fetch the matching page,
    // annotate, then filter+repaginate the flagged subset in-memory.
    if (wantFlagged) {
      const banned = await this.bannedKeywords();
      const rows = await this.prisma.app.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        include: {
          owner: { select: { id: true, email: true, name: true } },
          _count: { select: { builds: true, deployments: true } },
          builds: { orderBy: { createdAt: 'desc' }, take: 1, select: { prompt: true } },
        },
      });
      const flagged = rows.filter((a) =>
        this.isFlagged([a.name, a.description, a.builds[0]?.prompt], banned),
      );
      const page = flagged.slice(q.skip, q.skip + q.pageSize);
      return {
        items: page.map((a) => ({ ...toApp(a), flagged: true })),
        total: flagged.length,
        page: q.page,
        pageSize: q.pageSize,
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.app.findMany({
        where,
        // Pinned apps float to the top of the owner's list.
        orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
        skip: q.skip,
        take: q.pageSize,
        include: {
          owner: { select: { id: true, email: true, name: true } },
          _count: { select: { builds: true, deployments: true } },
          // Bản dựng gần nhất: admin cần `prompt` để lọc từ khoá cấm, còn MỌI người cần `result`
          // để lấy điểm độ giống của app bản sao. Lấy chung một lượt, không truy vấn thêm.
          builds: {
            orderBy: { createdAt: 'desc' as const },
            take: 1,
            select: { result: true, ...(isAdmin ? { prompt: true } : {}) },
          },
        },
      }),
      this.prisma.app.count({ where }),
    ]);

    const members = await this.suiteMembersFor(items);

    if (isAdmin) {
      const banned = await this.bannedKeywords();
      const mapped = items.map((a) => ({
        ...toApp(a),
        ...(members.get(a.suiteId ?? '') ? { suiteMembers: members.get(a.suiteId ?? '') } : {}),
        flagged: this.isFlagged(
          [a.name, a.description, (a as { builds?: { prompt: string }[] }).builds?.[0]?.prompt],
          banned,
        ),
      }));
      return { items: mapped, total, page: q.page, pageSize: q.pageSize };
    }
    return {
      items: items.map((a) => ({
        ...toApp(a),
        ...(members.get(a.suiteId ?? '') ? { suiteMembers: members.get(a.suiteId ?? '') } : {}),
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  /**
   * Các site anh em của mỗi "bộ site" có mặt trong trang này.
   *
   * MỘT truy vấn cho cả trang chứ không phải mỗi thẻ một truy vấn: danh sách app là màn hình mở
   * nhiều nhất trong toàn bộ sản phẩm, và một bộ có tới bốn site.
   */
  private async suiteMembersFor(
    items: { suiteId: string | null }[],
  ): Promise<Map<string, SuiteMemberInfo[]>> {
    const ids = [...new Set(items.map((a) => a.suiteId).filter((x): x is string => !!x))];
    const out = new Map<string, SuiteMemberInfo[]>();
    if (!ids.length) return out;
    const rows = await this.prisma.app.findMany({
      where: { suiteId: { in: ids } },
      select: {
        id: true,
        name: true,
        slug: true,
        surface: true,
        status: true,
        currentUrl: true,
        suiteId: true,
        suitePrimary: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    for (const r of rows) {
      if (!r.suiteId) continue;
      const list = out.get(r.suiteId) ?? [];
      list.push({
        id: r.id,
        name: r.name,
        slug: r.slug,
        surface: r.surface as SuiteMemberInfo['surface'],
        status: r.status,
        currentUrl: r.currentUrl,
        primary: r.suitePrimary,
      });
      out.set(r.suiteId, list);
    }
    return out;
  }

  private async load(user: AuthUser, id: string) {
    const app = await this.prisma.app.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, email: true, name: true } },
        _count: { select: { builds: true, deployments: true } },
      },
    });
    if (!app) throw new NotFoundException('Không tìm thấy app');
    if (app.ownerId !== user.id && user.role !== 'admin') {
      throw new ForbiddenException('App không thuộc về bạn');
    }
    return app;
  }

  async get(user: AuthUser, id: string): Promise<App> {
    const role = await this.access.roleOf(user, id);
    if (!role) {
      // Distinguish missing vs forbidden without leaking existence to randoms.
      const exists = await this.prisma.app.findUnique({ where: { id }, select: { id: true } });
      throw exists
        ? new ForbiddenException('App không thuộc về bạn')
        : new NotFoundException('Không tìm thấy app');
    }
    const app = await this.prisma.app.findUniqueOrThrow({
      where: { id },
      include: {
        owner: { select: { id: true, email: true, name: true } },
        _count: { select: { builds: true, deployments: true } },
      },
    });
    // App thuộc một "bộ site" thì luôn kèm các site anh em: tab "Các site trong bộ" cần chúng, và
    // một lượt truy vấn thêm ở màn CHI TIẾT thì không đáng kể (khác hẳn danh sách).
    const members = app.suiteId ? await this.suiteMembersFor([app]) : null;
    return {
      ...toApp(app),
      ...(members?.get(app.suiteId ?? '') ? { suiteMembers: members.get(app.suiteId ?? '') } : {}),
      role,
      shared: role !== 'owner',
    };
  }

  // ── Collaboration: members ────────────────────────────────────────────────

  private toMemberFriend(u: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  }): Friend {
    return { id: u.id, name: u.name, email: u.email, avatarUrl: u.avatarUrl };
  }

  /** List collaborators of an app (any member or the owner may view). */
  async members(user: AuthUser, id: string): Promise<AppMemberEntry[]> {
    if (!(await this.access.canRead(user, id))) {
      throw new ForbiddenException('App không thuộc về bạn');
    }
    const rows = await this.prisma.appMember.findMany({
      where: { appId: id },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      user: this.toMemberFriend(r.user),
      role: r.role as AppMemberRole,
    }));
  }

  /** Owner invites a collaborator by email. */
  async addMember(
    user: AuthUser,
    id: string,
    email: string,
    role: AppMemberRole,
  ): Promise<AppMemberEntry> {
    const app = await this.load(user, id); // owner/admin only
    const target = await this.prisma.user.findFirst({
      where: { email: { equals: email.trim(), mode: 'insensitive' } },
      select: { id: true, name: true, email: true, avatarUrl: true },
    });
    if (!target) throw new NotFoundException('Không tìm thấy người dùng với email này');
    if (target.id === app.ownerId) {
      throw new BadRequestException('Người này đã là chủ sở hữu dự án');
    }
    const member = await this.prisma.appMember.upsert({
      where: { appId_userId: { appId: id, userId: target.id } },
      create: { appId: id, userId: target.id, role },
      update: { role },
    });
    await this.audit.log(user.id, user.email, 'app.member.add', id, {
      memberId: target.id,
      role,
    });
    return { user: this.toMemberFriend(target), role: member.role as AppMemberRole };
  }

  /** Owner changes a collaborator's role. */
  async updateMember(
    user: AuthUser,
    id: string,
    memberId: string,
    role: AppMemberRole,
  ): Promise<{ ok: true }> {
    await this.load(user, id); // owner/admin only
    await this.prisma.appMember.update({
      where: { appId_userId: { appId: id, userId: memberId } },
      data: { role },
    });
    return { ok: true };
  }

  /** Owner removes a collaborator, or a member removes themselves (leave). */
  async removeMember(user: AuthUser, id: string, memberId: string): Promise<{ ok: true }> {
    const isSelf = memberId === user.id;
    if (!isSelf) {
      await this.load(user, id); // only the owner may remove others
    }
    await this.prisma.appMember.deleteMany({ where: { appId: id, userId: memberId } });
    await this.audit.log(user.id, user.email, 'app.member.remove', id, { memberId });
    return { ok: true };
  }

  /** Apps shared WITH the current user (they're a collaborator, not the owner). */
  async listShared(user: AuthUser): Promise<App[]> {
    const rows = await this.prisma.appMember.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        app: {
          include: {
            owner: { select: { id: true, email: true, name: true } },
            _count: { select: { builds: true, deployments: true } },
          },
        },
      },
    });
    return rows.map((r) => ({
      ...toApp(r.app),
      role: r.role as AppMemberRole,
      shared: true,
    }));
  }

  async update(user: AuthUser, id: string, dto: UpdateAppDto): Promise<App> {
    await this.load(user, id);
    const app = await this.prisma.app.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.pinned !== undefined ? { pinned: dto.pinned } : {}),
        ...(dto.published !== undefined ? { published: dto.published } : {}),
      },
      include: {
        owner: { select: { id: true, email: true, name: true } },
        _count: { select: { builds: true, deployments: true } },
      },
    });
    await this.audit.log(user.id, user.email, 'app.update', id, { ...dto });
    return toApp(app);
  }

  /** Update an app's SEO & GEO config (owner or editor). Applied at next deploy. */
  async updateSeo(user: AuthUser, id: string, seo: AppSeo): Promise<App> {
    if (!(await this.access.canWrite(user, id))) {
      throw new ForbiddenException('App không thuộc về bạn');
    }
    // Whitelist + bound the shape — never persist arbitrary client JSON.
    const s = seo ?? {};
    const clean: AppSeo = {
      enabled: s.enabled !== false,
      ...(s.title ? { title: String(s.title).slice(0, 200) } : {}),
      ...(s.description ? { description: String(s.description).slice(0, 500) } : {}),
      ...(s.keywords ? { keywords: String(s.keywords).slice(0, 300) } : {}),
      ...(s.ogImage ? { ogImage: String(s.ogImage).slice(0, 1000) } : {}),
      index: s.index !== false,
      sitemap: s.sitemap !== false,
      robots: s.robots !== false,
      aiDiscovery: s.aiDiscovery !== false,
    };
    const app = await this.prisma.app.update({
      where: { id },
      data: { seo: clean as unknown as object },
      include: {
        owner: { select: { id: true, email: true, name: true } },
        _count: { select: { builds: true, deployments: true } },
      },
    });
    await this.audit.log(user.id, user.email, 'app.seo', id, { enabled: clean.enabled });
    return toApp(app);
  }

  /** Read an app's secrets/env vars (owner or editor). Returned decrypted to the owner. */
  async getSecrets(user: AuthUser, id: string): Promise<AppSecretsResponse> {
    if (!(await this.access.canWrite(user, id))) {
      throw new ForbiddenException('App không thuộc về bạn');
    }
    const app = await this.prisma.app.findUnique({ where: { id }, select: { secretsEnc: true } });
    if (!app) throw new NotFoundException('Không tìm thấy app');
    const map =
      decryptJson<Record<string, string>>(app.secretsEnc, this.appConfig.env.JWT_SECRET) ?? {};
    return { secrets: Object.entries(map).map(([key, value]) => ({ key, value })) };
  }

  /** Replace an app's secrets/env vars (owner or editor). Applied at next deploy. */
  async setSecrets(user: AuthUser, id: string, items: AppSecretItem[]): Promise<AppSecretsResponse> {
    if (!(await this.access.canWrite(user, id))) {
      throw new ForbiddenException('App không thuộc về bạn');
    }
    const map: Record<string, string> = {};
    for (const it of items ?? []) {
      const key = String(it?.key ?? '').trim();
      // Valid POSIX env var name; silently skip invalid keys.
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key)) continue;
      map[key] = String(it?.value ?? '').slice(0, 4000);
      if (Object.keys(map).length >= 50) break;
    }
    const enc = Object.keys(map).length
      ? encryptJson(map, this.appConfig.env.JWT_SECRET)
      : null;
    await this.prisma.app.update({ where: { id }, data: { secretsEnc: enc } });
    await this.audit.log(user.id, user.email, 'app.secrets', id, { count: Object.keys(map).length });
    return { secrets: Object.entries(map).map(([key, value]) => ({ key, value })) };
  }

  async remove(user: AuthUser, id: string): Promise<{ ok: true }> {
    const app = await this.load(user, id);
    // Tên dự án Pages = `pagesProject`, và khi trường đó rỗng thì rơi về SLUG — dự án luôn được
    // đặt tên theo slug. Đo trên dữ liệu thật: 3/28 app đang chạy có `pagesProject` rỗng, nên
    // nhánh `if (app.pagesProject)` cũ bỏ qua hẳn bước dọn và để trang web sống tiếp sau khi xoá.
    const project = app.pagesProject || app.slug;
    let siteRemains: string | null = null;
    if (project) {
      try {
        await this.pages.deleteProject(project);
      } catch (e) {
        // KHÔNG nuốt im lặng. Vẫn xoá bản ghi (chặn lại thì người dùng kẹt với một app hỏng),
        // nhưng ghi rõ vào nhật ký để lần quét dự án mồ côi dọn nốt — và để có dấu vết khi ai đó
        // hỏi "sao xoá rồi mà trang vẫn vào được".
        siteRemains = String((e as Error)?.message ?? e).slice(0, 300);
        this.logger.error(`app.delete ${app.slug}: KHÔNG xoá được trang web — ${siteRemains}`);
      }
    }
    // Delete the app's D1 (may hold user/session/password-hash tables) so it isn't
    // orphaned + re-bound to a future app reusing a freed name (cross-tenant leak).
    if (app.d1DatabaseId) {
      await this.pages.deleteD1(app.d1DatabaseId).catch(() => undefined);
    }
    // Tear down any Docker server-deploy footprint (containers + nginx vhosts) on
    // the host so deleting an app doesn't leak running containers / routes.
    await this.serverDeploy.teardown(id).catch(() => undefined);
    await this.pages.deleteAppDomain(app.slug).catch(() => undefined);
    await this.prisma.app.delete({ where: { id } });

    // Xoá SITE ĐẠI DIỆN của một bộ thì phải trao lại vai đó, nếu không cả bộ biến mất.
    //
    // Danh sách app chỉ hiện app đứng một mình HOẶC app đại diện của bộ (xem `list`). Bộ mất đại
    // diện thì những site còn lại vẫn tồn tại, vẫn tính vào hạn mức, nhưng KHÔNG còn đường nào mở
    // ra. Mà khi một tầng hỏng, `releaseSuite` bảo họ "Hãy chạy lại site đó trước, rồi dựng
    // lại các site này" — một việc không làm được, vì site đó cũng đang ẩn.
    //
    // Đo ngày 23/09/2026 trên một tài khoản thật: xoá site đại diện lúc 04:29:42 để lại ba site
    // api/cms/portal mồ côi. Người dùng báo "dựng lại bao nhiêu lần cũng failed" — đúng, vì thứ
    // cần dựng lại đã bị xoá, và ba site kia thì họ còn chẳng nhìn thấy để mà xoá đi làm lại.
    let daiDienMoi: string | null = null;
    if (app.suiteId && app.suitePrimary) {
      const conLai = await this.prisma.app.findMany({
        where: { suiteId: app.suiteId },
        select: { id: true, surface: true },
      });
      daiDienMoi = chonDaiDienMoi(conLai);
      if (daiDienMoi) {
        await this.prisma.app.update({ where: { id: daiDienMoi }, data: { suitePrimary: true } });
      }
    }

    await this.audit.log(user.id, user.email, 'app.delete', id, {
      slug: app.slug,
      project,
      ...(app.suiteId ? { suiteId: app.suiteId, surface: app.surface } : {}),
      ...(daiDienMoi ? { daiDienMoi } : {}),
      ...(siteRemains ? { siteRemains } : {}),
    });
    return { ok: true };
  }

  /**
   * Dự án Cloudflare Pages KHÔNG còn app nào trỏ tới — tức trang web của một app đã bị xoá mà
   * vẫn công khai truy cập được.
   *
   * Hai bước tách rời (liệt kê rồi mới xoá) là CỐ Ý: tên dự án Pages là slug ngẫu nhiên, không có
   * tiền tố nhận dạng như D1 (`tw-`), nên không có cách nào chắc chắn 100% phân biệt "trang của
   * app đã xoá" với "dự án hạ tầng của chính Larkwave". Xoá nhầm là mất một trang đang phục vụ
   * thật. Vì vậy phải nhìn danh sách trước.
   */
  private static readonly PROTECTED_PAGES = new Set([
    'toolswave-guides',
    'twd-desktop-renderer',
    'toolswave-web',
  ]);

  async listOrphanPages(): Promise<{ orphans: string[]; total: number; kept: number }> {
    const all = await this.pages.listProjects();
    const apps = await this.prisma.app.findMany({ select: { slug: true, pagesProject: true } });
    const referenced = new Set<string>();
    for (const a of apps) {
      if (a.slug) referenced.add(a.slug);
      if (a.pagesProject) referenced.add(a.pagesProject);
    }
    const orphans = all.filter(
      (n) => !referenced.has(n) && !AppsService.PROTECTED_PAGES.has(n),
    );
    return { orphans, total: all.length, kept: all.length - orphans.length };
  }

  /** Xoá các dự án mồ côi. Chỉ nhận đúng những tên do `listOrphanPages` trả về ở lần gọi này —
   *  không xoá theo tên người gọi tự đưa, để một yêu cầu cũ không xoá nhầm app vừa được tạo. */
  async cleanupOrphanPages(): Promise<{ deleted: string[]; failed: { name: string; error: string }[] }> {
    const { orphans } = await this.listOrphanPages();
    const deleted: string[] = [];
    const failed: { name: string; error: string }[] = [];
    for (const name of orphans) {
      try {
        await this.pages.deleteProject(name);
        deleted.push(name);
      } catch (e) {
        failed.push({ name, error: String((e as Error)?.message ?? e).slice(0, 200) });
      }
    }
    this.logger.log(`cleanupOrphanPages: xoá ${deleted.length}, hỏng ${failed.length}`);
    return { deleted, failed };
  }

  /**
   * Free Cloudflare D1 slots (free plan caps at 10/account). Deletes every
   * `tw-*` database NOT referenced by a live app — matched by stored uuid OR by
   * the deterministic name `tw-<slug>-db` (covers apps whose build failed before
   * d1DatabaseId was persisted). Non-`tw-` databases are never touched.
   */
  async cleanupOrphanD1(): Promise<{ total: number; deleted: number; kept: number; names: string[] }> {
    const all = await this.pages.listD1();
    const apps = await this.prisma.app.findMany({ select: { slug: true, d1DatabaseId: true } });
    const refUuids = new Set(apps.map((a) => a.d1DatabaseId).filter((x): x is string => !!x));
    const refNames = new Set(apps.map((a) => `tw-${a.slug}-db`));
    const deleted: string[] = [];
    for (const db of all) {
      if (!db.name.startsWith('tw-')) continue; // only our naming convention — never other projects'
      if (refUuids.has(db.uuid) || refNames.has(db.name)) continue; // belongs to a live app
      await this.pages.deleteD1(db.uuid);
      deleted.push(db.name);
    }
    return { total: all.length, deleted: deleted.length, kept: all.length - deleted.length, names: deleted };
  }

  /**
   * Admin moderation: take a policy-violating app offline without deleting it.
   * Sets status=suspended + records the reason, pulls the branded
   * `<slug>.toolswave.net` DNS (best-effort), and supersedes live deployments.
   */
  async suspend(user: AuthUser, id: string, dto: SuspendAppDto): Promise<App> {
    const existing = await this.load(user, id);
    // Best-effort: take the public URL offline.
    await this.pages.deleteAppDomain(existing.slug).catch(() => undefined);
    await this.prisma.deployment.updateMany({
      where: { appId: id, status: 'live' },
      data: { status: 'superseded' },
    });
    const app = await this.prisma.app.update({
      where: { id },
      data: { status: 'suspended', suspendReason: dto.reason },
      include: {
        owner: { select: { id: true, email: true, name: true } },
        _count: { select: { builds: true, deployments: true } },
      },
    });
    await this.audit.log(user.id, user.email, 'app.suspend', id, {
      slug: existing.slug,
      reason: dto.reason,
    });
    return toApp(app);
  }

  /**
   * Admin moderation: lift a suspension. Restores status to 'live' if the app
   * ever had a deployment, else 'draft'; best-effort recreates the branded DNS.
   */
  async unsuspend(user: AuthUser, id: string): Promise<App> {
    const existing = await this.load(user, id);
    if (existing.status !== 'suspended') {
      throw new BadRequestException('App không ở trạng thái tạm khóa');
    }
    const restored = existing.currentDeploymentId ? 'live' : 'draft';
    // Best-effort: bring the branded URL back.
    if (restored === 'live') {
      await this.pages.ensureProxiedDomain(existing.slug).catch(() => undefined);
    }
    const app = await this.prisma.app.update({
      where: { id },
      data: { status: restored, suspendReason: null },
      include: {
        owner: { select: { id: true, email: true, name: true } },
        _count: { select: { builds: true, deployments: true } },
      },
    });
    await this.audit.log(user.id, user.email, 'app.unsuspend', id, {
      slug: existing.slug,
      status: restored,
    });
    return toApp(app);
  }

  async builds(user: AuthUser, id: string, q: PaginationDto): Promise<Paginated<Build>> {
    if (!(await this.access.canRead(user, id))) {
      throw new ForbiddenException('App không thuộc về bạn');
    }
    const where = { appId: id };
    const [items, total] = await Promise.all([
      // KHÔNG lấy cột `files`: mỗi bản ghi chứa toàn bộ mã nguồn của app, và danh sách này chỉ
      // hiện tên + trạng thái + thời gian. Trước đây mở workspace một app đã build nhiều lần là
      // kéo hàng trăm bản chụp mã nguồn từ Postgres rồi vứt gần hết — càng dùng càng chậm.
      this.prisma.build.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: q.skip,
        take: q.pageSize,
        omit: { files: true },
      }),
      this.prisma.build.count({ where }),
    ]);
    // toBuild yêu cầu trường `files` tồn tại trong kiểu dù nó KHÔNG dùng tới (withFiles mặc định
    // false) — trả mảng rỗng cho đúng kiểu, đúng với việc ta cố tình không đọc cột đó.
    return {
      items: items.map((b) => toBuild({ ...b, files: [] })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async deployments(user: AuthUser, id: string, q: PaginationDto): Promise<Paginated<Deployment>> {
    if (!(await this.access.canRead(user, id))) {
      throw new ForbiddenException('App không thuộc về bạn');
    }
    const where = { appId: id };
    const [items, total] = await Promise.all([
      this.prisma.deployment.findMany({ where, orderBy: { createdAt: 'desc' }, skip: q.skip, take: q.pageSize }),
      this.prisma.deployment.count({ where }),
    ]);
    return { items: items.map(toDeployment), total, page: q.page, pageSize: q.pageSize };
  }
}
