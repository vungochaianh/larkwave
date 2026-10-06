import {
  App as PApp,
  AuditLog as PAuditLog,
  Build as PBuild,
  Deployment as PDeployment,
  User as PUser,
} from '@prisma/client';
import {
  App,
  AuditLogEntry,
  Blueprint,
  Build,
  BuildResult,
  Deployment,
  GeneratedFile,
  LogLine,
  ModelChoice,
  StageState,
  TokenUsage,
  User,
} from '@larkwave/shared';

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export function toUser(u: PUser & { _count?: { apps?: number } }): User {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    status: u.status,
    plan: u.plan,
    avatarUrl: u.avatarUrl ?? null,
    discoverable: u.discoverable,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
    ...(u._count?.apps !== undefined ? { appsCount: u._count.apps } : {}),
  };
}

export function toApp(
  a: PApp & {
    owner?: Pick<PUser, 'id' | 'email' | 'name'>;
    _count?: { builds?: number; deployments?: number };
    /** Bản dựng gần nhất — chỉ để lấy điểm độ giống của bản sao. Kiểu lỏng vì mỗi chỗ gọi
     *  `select` một tập trường khác nhau. */
    builds?: Record<string, unknown>[];
  },
): App {
  return {
    id: a.id,
    ownerId: a.ownerId,
    owner: a.owner ? { id: a.owner.id, email: a.owner.email, name: a.owner.name } : undefined,
    name: a.name,
    slug: a.slug,
    track: a.track,
    description: a.description,
    status: a.status,
    suspendReason: a.suspendReason,
    pagesProject: a.pagesProject,
    currentUrl: a.currentUrl,
    currentDeploymentId: a.currentDeploymentId,
    backendKind: a.backendKind,
    cms: a.cms ?? false,
    seo: (a.seo as App['seo']) ?? null,
    gitProvider: (a.gitProvider as App['gitProvider']) ?? null,
    gitRepo: a.gitRepo ?? null,
    gitBranch: a.gitBranch ?? null,
    gitImported: a.gitImported,
    parentId: a.parentId ?? null,
    servicePath: a.servicePath ?? null,
    suiteId: a.suiteId ?? null,
    surface: (a.surface as App['surface']) ?? null,
    suitePrimary: a.suitePrimary ?? false,
    pinned: a.pinned ?? false,
    sourceUrl: a.sourceUrl ?? null,
    // Điểm độ giống nằm trong `result.fidelity` của bản dựng gần nhất. Đưa ra ngoài để danh sách
    // app hiện được ngay — trước đó chỉ ai mở log build mới thấy, tức gần như không ai thấy.
    cloneScore: (() => {
      if (!a.sourceUrl) return null;
      const r = a.builds?.[0]?.result as { fidelity?: { score?: number } } | null | undefined;
      const sc = r?.fidelity?.score;
      return typeof sc === 'number' ? sc : null;
    })(),
    published: a.published ?? false,
    visits: a.visits ?? 0,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    ...(a._count?.builds !== undefined ? { buildsCount: a._count.builds } : {}),
    ...(a._count?.deployments !== undefined ? { deploymentsCount: a._count.deployments } : {}),
  };
}

export function toBuild(
  b: PBuild & { blueprint?: { spec: unknown } | null },
  opts: { withLogs?: boolean; withFiles?: boolean } = {},
): Build {
  return {
    id: b.id,
    appId: b.appId,
    ownerId: b.ownerId,
    prompt: b.prompt,
    name: b.name,
    track: b.track,
    status: b.status,
    mode: (b.mode as Build['mode']) ?? null,
    model: (b.model as ModelChoice) ?? 'opus',
    primaryColor: b.primaryColor ?? null,
    style: b.style ?? null,
    stages: (b.stages as unknown as StageState[]) ?? [],
    spec: b.spec,
    attachments: (b.attachments as unknown as Build['attachments']) ?? [],
    blueprint: (b.blueprint?.spec as unknown as Blueprint) ?? null,
    result: (b.result as unknown as BuildResult) ?? null,
    usage: (b.usage as unknown as TokenUsage) ?? null,
    error: b.error,
    ...(opts.withLogs ? { logs: (b.logs as unknown as LogLine[]) ?? [] } : {}),
    ...(opts.withFiles ? { files: (b.files as unknown as GeneratedFile[]) ?? [] } : {}),
    createdAt: b.createdAt.toISOString(),
    startedAt: iso(b.startedAt),
    finishedAt: iso(b.finishedAt),
  };
}

export function toDeployment(d: PDeployment): Deployment {
  return {
    id: d.id,
    appId: d.appId,
    buildId: d.buildId,
    url: d.url,
    previewUrl: d.previewUrl,
    pagesProject: d.pagesProject,
    pagesDeploymentId: d.pagesDeploymentId,
    status: d.status,
    createdAt: d.createdAt.toISOString(),
  };
}

export function toAudit(a: PAuditLog): AuditLogEntry {
  return {
    id: a.id,
    actorId: a.actorId,
    actorEmail: a.actorEmail,
    action: a.action,
    target: a.target,
    meta: (a.meta as Record<string, unknown>) ?? null,
    createdAt: a.createdAt.toISOString(),
  };
}
