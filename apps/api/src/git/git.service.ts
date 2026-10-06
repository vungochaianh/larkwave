import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  App,
  AppServicesResponse,
  GeneratedFile,
  GitImportResponse,
  Track,
} from '@larkwave/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EventsService } from '../events/events.service';
import { toApp } from '../common/mappers';
import { AuthUser } from '../common/auth-user';
import { GitProvider, GitProvidersService, GitRepo } from '../engine/git-providers.service';
import { BuildsService } from '../builds/builds.service';
import { buildConfigFor, classifyImport, detectPlatform, detectServices, extractService } from './classify';

/** Either the user's connected repos, or a flag telling the UI to connect first. */
export type ReposResult =
  | { connected: true; repos: GitRepo[]; hasMore: boolean }
  | { connected: false };

@Injectable()
export class GitService {
  private readonly logger = new Logger(GitService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly git: GitProvidersService,
    private readonly builds: BuildsService,
    private readonly events: EventsService,
  ) {}

  /** Publish a live progress log to a build's event stream (mirrors pipeline.log). */
  private emit(buildId: string, msg: string): void {
    this.events.publish(buildId, {
      type: 'log',
      line: { ts: Date.now(), level: 'info', msg, stage: 'intake' },
    });
  }

  /** The stored per-user OAuth token for `provider`, or null when not connected.
   *  For GitLab, transparently refreshes an expired access token (so the user
   *  doesn't have to re-authorize each visit). */
  private async tokenFor(userId: string, provider: GitProvider): Promise<string | null> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        gitlabToken: true,
        githubToken: true,
        gitlabRefreshToken: true,
        gitlabTokenExpiresAt: true,
      },
    });
    if (!u) throw new NotFoundException('Không tìm thấy người dùng');
    if (provider === 'github') return u.githubToken || null;

    if (!u.gitlabToken) return null;
    const expiringSoon =
      !!u.gitlabTokenExpiresAt && u.gitlabTokenExpiresAt.getTime() < Date.now() + 60_000;
    if (expiringSoon && u.gitlabRefreshToken) {
      const refreshed = await this.git.refreshGitlabToken(u.gitlabRefreshToken);
      if (refreshed) {
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            gitlabToken: refreshed.accessToken,
            gitlabRefreshToken: refreshed.refreshToken,
            gitlabTokenExpiresAt: refreshed.expiresAt,
          },
        });
        return refreshed.accessToken;
      }
      return null; // refresh failed → treat as disconnected (user re-authorizes once)
    }
    return u.gitlabToken;
  }

  /** A 6-char readable code (no ambiguous chars), first char a letter. */
  private randomCode(n: number): string {
    const letters = 'abcdefghijkmnpqrstuvwxyz';
    const alnum = letters + '23456789';
    const b = randomBytes(n);
    let s = letters[b[0] % letters.length];
    for (let i = 1; i < n; i += 1) s += alnum[b[i] % alnum.length];
    return s;
  }

  /**
   * A short, unique 6-char HASH slug → `<slug>.toolswave.net`. Mirrors
   * BuildsService.uniqueSlug so imported apps share the SAME URL convention as
   * prompt-created ones (hash, not the repo name). The repo name stays as the app's
   * display name; only the public slug/URL is the hash.
   */
  private async uniqueSlug(): Promise<string> {
    for (let i = 0; i < 60; i += 1) {
      const code = this.randomCode(6);
      // eslint-disable-next-line no-await-in-loop
      if (!(await this.prisma.app.findUnique({ where: { slug: code } }))) return code;
    }
    return this.randomCode(10);
  }

  // ── repos ──────────────────────────────────────────────────────────────────

  /** List the user's repos for `provider` (paged). {connected:false} if no token. */
  async listRepos(
    user: AuthUser,
    provider: GitProvider,
    q: string,
    page = 1,
  ): Promise<ReposResult> {
    const token = await this.tokenFor(user.id, provider);
    if (!token) return { connected: false };
    try {
      const { repos, hasMore } = await this.git.listRepos(provider, token, q, page);
      return { connected: true, repos, hasMore };
    } catch (err) {
      // 401 from the provider => token revoked/expired: tell the UI to reconnect.
      this.logger.warn(`listRepos ${provider} failed: ${String(err)}`);
      return { connected: false };
    }
  }

  // ── services (sub-projects of an imported monorepo) ─────────────────────────

  /** Detect the sub-projects of an imported app (reads its latest stored files). */
  async listServices(user: AuthUser, appId: string): Promise<AppServicesResponse> {
    const files = await this.latestFiles(user, appId);
    return { services: detectServices(files) };
  }

  /**
   * Build + deploy ONE sub-project of an imported repo as its own new app. Only
   * frontend/static services are buildable (we host Cloudflare Pages, not
   * servers). Returns the new app + its streaming build.
   */
  async buildService(user: AuthUser, appId: string, servicePath: string): Promise<GitImportResponse> {
    const parent = await this.prisma.app.findUnique({ where: { id: appId } });
    if (!parent) throw new NotFoundException('Không tìm thấy app');
    if (parent.ownerId !== user.id && user.role !== 'admin') {
      throw new ForbiddenException('App không thuộc về bạn');
    }
    const files = await this.latestFiles(user, appId);
    const svc = detectServices(files).find((s) => s.path === servicePath);
    if (!svc) throw new BadRequestException('Không tìm thấy phần dự án này');
    if (!svc.buildable) {
      throw new BadRequestException(
        'Phần này (backend) chưa deploy được trên Cloudflare Pages. Mã nguồn đã có sẵn để tải hoặc đẩy về repo.',
      );
    }
    if (!extractService(files, svc.path).length) throw new BadRequestException('Phần dự án rỗng');
    return this.buildOrStoreService(user, parent, svc, files);
  }

  /**
   * Create (or reuse) the child app for a service and either build+deploy it
   * (frontend/static) or store its source (backend/other). No credit is charged
   * — the source is the user's own imported code, not AI generation.
   */
  private async buildOrStoreService(
    user: AuthUser,
    parent: { id: string; name: string; gitRepo: string | null },
    svc: { path: string; name: string; type: string; framework: string | null; buildable: boolean },
    allFiles: GeneratedFile[],
  ): Promise<GitImportResponse> {
    const sub = extractService(allFiles, svc.path);
    const child = await this.getOrCreateServiceApp(user, parent, svc);
    const label = `${svc.path || 'root'} (${svc.framework ?? svc.type})`;

    if (svc.buildable && sub.length) {
      const { buildId } = await this.builds.create(
        user,
        { appId: child.id, prompt: `Build phần ${label}`, track: 'web', files: sub },
        { skipCredits: true },
      );
      await this.audit.log(user.id, user.email, 'git.service.build', child.id, {
        from: parent.id,
        service: svc.path,
        files: sub.length,
      });
      return { appId: child.id, buildId, kind: 'web-single', fileCount: sub.length, buildable: true, truncated: false };
    }
    // Backend / non-buildable → store source only (viewable / downloadable).
    const { buildId } = await this.builds.importOnly(user, child.id, sub, `Nguồn phần ${label}`, 'web');
    return { appId: child.id, buildId, kind: 'backend', fileCount: sub.length, buildable: false, truncated: false };
  }

  /** Find the existing child app for a service (by parent + path), or create it. */
  private async getOrCreateServiceApp(
    user: AuthUser,
    parent: { id: string; name: string; gitRepo: string | null },
    svc: { path: string; name: string; type: string; framework: string | null },
  ) {
    const existing = await this.prisma.app.findFirst({
      where: { parentId: parent.id, servicePath: svc.path },
    });
    if (existing) return existing;
    const slug = await this.uniqueSlug();
    return this.prisma.app.create({
      data: {
        ownerId: user.id,
        name: `${parent.name}/${svc.name}`,
        slug,
        track: 'web',
        description: `Phần "${svc.path}" (${svc.type}${svc.framework ? '/' + svc.framework : ''}) — tách từ ${parent.gitRepo ?? parent.name}`,
        status: 'draft',
        parentId: parent.id,
        servicePath: svc.path,
      },
    });
  }

  /** Child apps (services) of a workspace — the system control view. */
  async listChildren(user: AuthUser, appId: string): Promise<App[]> {
    const parent = await this.prisma.app.findUnique({ where: { id: appId } });
    if (!parent) throw new NotFoundException('Không tìm thấy app');
    if (parent.ownerId !== user.id && user.role !== 'admin') {
      throw new ForbiddenException('App không thuộc về bạn');
    }
    const rows = await this.prisma.app.findMany({
      where: { parentId: appId },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { builds: true, deployments: true } } },
    });
    return rows.map((a) => toApp(a));
  }

  /** The most recent build's stored files for an app (owner-or-admin gated). */
  private async latestFiles(user: AuthUser, appId: string): Promise<GeneratedFile[]> {
    const app = await this.prisma.app.findUnique({ where: { id: appId } });
    if (!app) throw new NotFoundException('Không tìm thấy app');
    if (app.ownerId !== user.id && user.role !== 'admin') {
      throw new ForbiddenException('App không thuộc về bạn');
    }
    const build = await this.prisma.build.findFirst({
      // `files: { not: undefined }` là NO-OP của Prisma — nó bị bỏ qua hoàn toàn, nên câu này
      // thực ra là "build mới nhất" kể cả build HỎNG hay đang chạy. Đẩy lên Git một build hỏng
      // là chuyện lặng lẽ và khó lần ra nhất.
      where: { appId, status: 'succeeded', NOT: { files: { equals: Prisma.DbNull } } },
      orderBy: { createdAt: 'desc' },
    });
    return (build?.files as unknown as GeneratedFile[]) ?? [];
  }

  // ── import ─────────────────────────────────────────────────────────────────

  /**
   * Import a connected repo as a new Larkwave app: download ALL its text files,
   * create the App, then CLASSIFY the repo. A single web app is auto-built +
   * deployed via the EDIT pipeline. A monorepo / backend / multi-service repo is
   * imported faithfully into an import-only build (full source stored, nothing
   * deployed) so the codegen build-fix loop can't rewrite it into a tiny app.
   */
  async importRepo(
    user: AuthUser,
    provider: GitProvider,
    repo: string,
    branch?: string,
  ): Promise<GitImportResponse> {
    const token = await this.tokenFor(user.id, provider);
    if (!token) {
      throw new BadRequestException(`Chưa kết nối ${provider}. Hãy kết nối tài khoản trước.`);
    }

    // Create the app + a QUEUED import build shell and return IMMEDIATELY. The slow
    // clone + classify + build runs in the BACKGROUND (processImport) and streams
    // real progress to this buildId — so a big repo no longer blocks the import
    // request, and the workspace shows a live process instead of a dead spinner.
    const repoName = repo.split('/').pop() || repo;
    const slug = await this.uniqueSlug();
    const app = await this.prisma.app.create({
      data: {
        ownerId: user.id,
        name: repoName,
        slug,
        track: 'web',
        description: `Imported from ${provider}: ${repo}`,
        status: 'building',
        gitProvider: provider,
        gitRepo: repo,
        gitBranch: branch ?? null,
        gitImported: true,
      },
    });
    const buildId = await this.builds.createImportShell(
      user,
      app.id,
      `Import ${provider} repo ${repo}`,
    );
    // Fire-and-forget: the request returns now; progress streams to `buildId`.
    void this.processImport(user, app.id, buildId, provider, repo, branch);
    return { appId: app.id, buildId, pending: true };
  }

  /**
   * Re-pull the latest code from an imported app's linked repo INTO the same app
   * (keeps its id/URL/history) — re-classifies + re-derives the .toolswave config and
   * refreshes the stored files, exactly like a fresh import but without creating a new
   * app. Lets a user who fixed their repo pick up the change without re-importing.
   */
  async resyncRepo(user: AuthUser, appId: string): Promise<GitImportResponse> {
    const app = await this.prisma.app.findUnique({ where: { id: appId } });
    if (!app) throw new NotFoundException('Không tìm thấy app');
    if (app.ownerId !== user.id && user.role !== 'admin') {
      throw new ForbiddenException('App không thuộc về bạn');
    }
    if (!app.gitImported || !app.gitProvider || !app.gitRepo) {
      throw new BadRequestException('App này không được import từ Git nên không thể đồng bộ lại.');
    }
    const provider = app.gitProvider as GitProvider;
    const token = await this.tokenFor(user.id, provider);
    if (!token) {
      throw new BadRequestException(`Chưa kết nối ${provider}. Hãy kết nối lại tài khoản rồi thử lại.`);
    }
    // Don't race an in-flight build for this app (they'd fight over files + deploy).
    const inflight = await this.prisma.build.count({
      where: { appId, status: { in: ['queued', 'running', 'awaiting_approval'] } },
    });
    if (inflight > 0) {
      throw new ConflictException('Đang có build chạy cho app này — hãy đợi nó xong rồi đồng bộ lại.');
    }
    await this.prisma.app.update({ where: { id: appId }, data: { status: 'building' } });
    const buildId = await this.builds.createImportShell(
      user,
      appId,
      `Đồng bộ lại từ ${provider}: ${app.gitRepo}`,
    );
    // Reuse the SAME background flow as a fresh import — fetch + classify + derive
    // config + route to deploy or import-only — but against the existing app.
    void this.processImport(user, appId, buildId, provider, app.gitRepo, app.gitBranch ?? undefined);
    return { appId, buildId, pending: true };
  }

  /**
   * BACKGROUND import job: clone the repo, classify it, then either promote the
   * build to a deploy (genuine single web app) or finalize it as import-only
   * (complex / multi-service repo kept as one workspace). Streams progress to the
   * build's event stream so the workspace shows a live process. Never throws —
   * a failure marks the build failed so the user sees a clear error, not a hang.
   */
  private async processImport(
    user: AuthUser,
    appId: string,
    buildId: string,
    provider: GitProvider,
    repo: string,
    branch?: string,
  ): Promise<void> {
    try {
      this.events.publish(buildId, { type: 'status', status: 'running' });
      this.emit(buildId, `Kết nối ${provider} & tải mã nguồn từ ${repo}…`);
      const token = await this.tokenFor(user.id, provider);
      if (!token) throw new Error(`Chưa kết nối ${provider}.`);

      const out = await this.git.importRepoFiles(provider, token, repo, branch);
      const files = out.files;
      this.emit(buildId, `Đã tải ${files.length} file. Đang phân tích & phân loại dự án…`);
      if (out.truncated) {
        this.emit(buildId, 'Repo rất lớn — một số file vượt giới hạn nhập đã được bỏ qua.');
      }

      // Chặn NỀN TẢNG trước mọi thứ khác: website chỉ chạy được thứ chạy trong trình duyệt. Repo
      // nhắm điện thoại / máy tính / tiện ích cần cài phụ thuộc gốc rồi đóng gói trên máy — nhập
      // vào đây chỉ đẻ ra một app không bao giờ chạy được, lại chiếm dung lượng và làm rối danh
      // sách app. Dừng ở đây, nói rõ lý do, và chỉ sang app desktop.
      const plat = detectPlatform(files);
      if (plat.platform !== 'web') {
        const name =
          plat.platform === 'mobile'
            ? 'app điện thoại'
            : plat.platform === 'desktop'
              ? 'app máy tính'
              : 'tiện ích trình duyệt';
        await this.audit.log(user.id, user.email, 'git.import.rejected', appId, {
          provider,
          repo,
          platform: plat.platform,
          evidence: plat.evidence,
        });
        throw new Error(
          `Đây là dự án ${name} (dấu hiệu: ${plat.evidence}) — website chỉ chạy được ứng dụng ` +
            `trong trình duyệt, nên không nhập. Hãy mở repo này bằng app Larkwave cho máy tính: ` +
            `nó cài phụ thuộc, chạy và đóng gói ngay trên máy bạn.`,
        );
      }

      const cls = classifyImport(files);
      await this.prisma.app.update({
        where: { id: appId },
        data: { track: cls.track, gitBranch: out.branch },
      });
      this.logger.log(
        `git.import ${repo}: ${files.length} files, kind=${cls.kind}, buildable=${cls.buildable}, truncated=${out.truncated}`,
      );
      await this.audit.log(user.id, user.email, 'git.import', appId, {
        provider,
        repo,
        branch: out.branch,
        files: files.length,
        kind: cls.kind,
        buildable: cls.buildable,
        truncated: out.truncated,
      });

      // A directly-deployable repo gets a persisted .toolswave build/deploy config
      // (derived from the framework, a plain static site, or a repo-provided
      // `.toolswave/config.json`). We then build + deploy via the NO-LLM config path
      // — zero AI tokens now AND on every re-run/redeploy. Null = import-only.
      const cfg = buildConfigFor(files, cls);
      if (cfg) {
        const how =
          cfg.source === 'toolswave-file'
            ? 'cấu hình .toolswave có sẵn trong repo'
            : cfg.buildCommand
              ? `web app (${cfg.framework})`
              : 'site tĩnh (HTML/CSS/JS)';
        this.emit(buildId, `Phát hiện ${how}. Build & deploy trực tiếp — không tốn token AI…`);
        await this.prisma.app.update({
          where: { id: appId },
          data: { buildConfig: cfg as unknown as object },
        });
        await this.builds.startImportedBuild(buildId, files, cls.track, cfg);
      } else {
        const services = detectServices(files);
        this.logger.log(`workspace ${repo}: ${services.length} service(s) kept in one app`);
        // cls.buildable but no derived config = a buildable framework we DECLINED to
        // static-build (e.g. a Next.js SSR app with no `output: 'export'`). Say so
        // clearly + point to the server, instead of the generic "complex project".
        this.emit(
          buildId,
          cls.buildable
            ? `Phát hiện app SSR (vd Next.js dùng dữ liệu động / không cấu hình xuất tĩnh) — ` +
                `KHÔNG deploy tĩnh được. Đã nhập đầy đủ; hãy dùng "Chạy trên Server (Docker)" để chạy.`
            : `Dự án phức tạp (${cls.kind}, ${files.length} file) — giữ làm một workspace để xem/tải/đẩy lại; ` +
                `chạy bằng "Chạy trên Server".`,
        );
        await this.builds.finishImportOnly(buildId, files, cls.track);
        this.events.publish(buildId, { type: 'status', status: 'succeeded' });
        await this.prisma.app
          .update({ where: { id: appId }, data: { status: 'draft' } })
          .catch(() => undefined);
      }
    } catch (err) {
      const msg = String((err as Error).message ?? err);
      this.logger.error(`git.import failed ${repo}: ${msg}`);
      this.emit(buildId, `Lỗi nhập repo: ${msg}`);
      await this.builds.failImport(buildId, `Không import được repo: ${msg}`);
      this.events.publish(buildId, { type: 'status', status: 'failed' });
      await this.prisma.app
        .update({ where: { id: appId }, data: { status: 'draft' } })
        .catch(() => undefined);
    }
  }

  // ── push ───────────────────────────────────────────────────────────────────

  /**
   * Push the app's CURRENT files (latest build's files) back to its linked repo
   * on the user's behalf. Requires the app to be gitImported and a stored token
   * for that provider. Audits 'git.push'. Returns { ok, commitUrl? }.
   */
  async push(
    user: AuthUser,
    appId: string,
    message?: string,
  ): Promise<{ ok: true; commitUrl?: string }> {
    const app = await this.prisma.app.findUnique({ where: { id: appId } });
    if (!app) throw new NotFoundException('Không tìm thấy app');
    if (app.ownerId !== user.id && user.role !== 'admin') {
      throw new ForbiddenException('App không thuộc về bạn');
    }
    if (!app.gitImported || !app.gitProvider || !app.gitRepo) {
      throw new BadRequestException('App này chưa liên kết với repo git nào');
    }
    const provider = app.gitProvider as GitProvider;
    const token = await this.tokenFor(app.ownerId, provider);
    if (!token) {
      throw new BadRequestException(`Chưa kết nối ${provider} hoặc token đã hết hạn.`);
    }

    // Current files = the most recent build that produced files for this app.
    const build = await this.prisma.build.findFirst({
      // `files: { not: undefined }` là NO-OP của Prisma — nó bị bỏ qua hoàn toàn, nên câu này
      // thực ra là "build mới nhất" kể cả build HỎNG hay đang chạy. Đẩy lên Git một build hỏng
      // là chuyện lặng lẽ và khó lần ra nhất.
      where: { appId, status: 'succeeded', NOT: { files: { equals: Prisma.DbNull } } },
      orderBy: { createdAt: 'desc' },
    });
    const files = (build?.files as unknown as GeneratedFile[]) ?? [];
    if (!files.length) throw new BadRequestException('App chưa có file nào để đẩy');

    const branch = app.gitBranch || 'main';
    const commitMessage = message?.trim() || `Larkwave: update ${app.name}`;
    let commitUrl: string | undefined;
    try {
      const out = await this.git.pushFiles(provider, token, app.gitRepo, branch, files, commitMessage);
      commitUrl = out.commitUrl;
    } catch (err) {
      throw new BadRequestException(`Đẩy code thất bại: ${String((err as Error).message ?? err)}`);
    }

    await this.audit.log(user.id, user.email, 'git.push', appId, {
      provider,
      repo: app.gitRepo,
      branch,
      files: files.length,
    });
    return { ok: true, ...(commitUrl ? { commitUrl } : {}) };
  }
}
