import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { GeneratedFile } from '@larkwave/shared';
import { AppConfigService } from '../config/app-config.service';

/**
 * Pushes generated app source to GitLab. Two modes:
 *  - DEPLOY TOKEN (gldt-) + GITLAB_DEPLOY_USER + GITLAB_MONOREPO: `git push` each
 *    app as a folder into one pre-created monorepo (deploy tokens can push but
 *    can't create repos). Pushes are serialised so each starts from the latest.
 *  - API TOKEN (glpat-): create a repo per app and commit via the REST API.
 * Without a usable config it's a no-op (returns null) and never breaks the build.
 */
@Injectable()
export class GitlabService {
  private readonly logger = new Logger(GitlabService.name);
  private pushChain: Promise<string | null> = Promise.resolve(null);

  constructor(private readonly config: AppConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.env.GITLAB_TOKEN);
  }
  private get host(): string {
    return this.config.env.GITLAB_HOST.replace(/\/$/, '');
  }
  private get token(): string {
    return this.config.env.GITLAB_TOKEN;
  }

  /**
   * @param projectId immutable app id (cuid) — used as the GitLab repo path so a
   *   repo maps 1:1 to an app and never changes (the readable app name is the
   *   GitLab display name).
   */
  async pushApp(projectId: string, name: string, files: GeneratedFile[]): Promise<string | null> {
    if (!files?.length || !this.token) return null;
    const user = this.config.env.GITLAB_DEPLOY_USER;
    const monorepo = this.config.env.GITLAB_MONOREPO;
    if (user && monorepo) {
      // serialise git pushes to the shared monorepo (avoids non-fast-forward)
      const run = () => this.pushToMonorepo(projectId, name, files, user, monorepo);
      this.pushChain = this.pushChain.then(run, run);
      return this.pushChain;
    }
    return this.pushViaApi(projectId, name, files);
  }

  // ── deploy-token mode: git push into a monorepo folder ──────────────────────

  private async pushToMonorepo(
    projectId: string,
    name: string,
    files: GeneratedFile[],
    user: string,
    repoPath: string,
  ): Promise<string | null> {
    const hostNoScheme = this.host.replace(/^https?:\/\//, '');
    const remote = `https://${encodeURIComponent(user)}:${this.token}@${hostNoScheme}/${repoPath}.git`;
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-git-'));
    try {
      const cl = await this.git(['clone', '--depth', '1', remote, tmp]);
      if (cl.code !== 0) {
        this.logger.warn(`GitLab clone ${repoPath} thất bại (repo đã tạo chưa?)`);
        return null;
      }
      const slugDir = path.join(tmp, projectId);
      await fs.rm(slugDir, { recursive: true, force: true });
      for (const f of files) {
        const p = path.join(slugDir, f.path.replace(/^\/+/, ''));
        await fs.mkdir(path.dirname(p), { recursive: true });
        await fs.writeFile(p, f.content, 'utf8');
      }
      await this.git(['-C', tmp, 'config', 'user.email', 'bot@toolswave.net']);
      await this.git(['-C', tmp, 'config', 'user.name', 'Larkwave']);
      await this.git(['-C', tmp, 'add', '-A']);
      const commit = await this.git(['-C', tmp, 'commit', '-m', `Larkwave: ${name} (${projectId})`]);
      if (commit.code !== 0) {
        // nothing changed since last push — still "in GitLab"
        return `${this.host}/${repoPath}/-/tree/main/${projectId}`;
      }
      const push = await this.git(['-C', tmp, 'push', 'origin', 'HEAD:main']);
      if (push.code !== 0) {
        this.logger.warn(`GitLab push ${repoPath} thất bại: ${push.out.slice(-200)}`);
        return null;
      }
      return `${this.host}/${repoPath}/-/tree/main/${projectId}`;
    } catch (err) {
      this.logger.warn(`pushToMonorepo ${projectId} error: ${String(err)}`);
      return null;
    } finally {
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private git(args: string[]): Promise<{ code: number; out: string }> {
    return new Promise((resolve) => {
      const child = spawn('git', args, {
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'true' },
      });
      let out = '';
      const h = (b: Buffer) => (out += b.toString());
      child.stdout.on('data', h);
      child.stderr.on('data', h);
      child.on('close', (code) => resolve({ code: code ?? 1, out }));
      child.on('error', (e) => resolve({ code: 1, out: String(e) }));
    });
  }

  // ── api-token mode: repo per app via the Commit API ─────────────────────────

  private headers(json = false): Record<string, string> {
    return { 'PRIVATE-TOKEN': this.token, ...(json ? { 'Content-Type': 'application/json' } : {}) };
  }
  async hasApiAccess(): Promise<boolean> {
    try {
      const res = await fetch(
        `${this.host}/api/v4/groups/${encodeURIComponent(this.config.env.GITLAB_GROUP)}`,
        { headers: this.headers() },
      );
      return res.ok;
    } catch {
      return false;
    }
  }

  private async pushViaApi(projectId: string, name: string, files: GeneratedFile[]): Promise<string | null> {
    if (!(await this.hasApiAccess())) return null;
    try {
      const group = this.config.env.GITLAB_GROUP;
      const projPath = `${group}/${projectId}`;
      const enc = encodeURIComponent(projPath);
      let projRes = await fetch(`${this.host}/api/v4/projects/${enc}`, { headers: this.headers() });
      if (!projRes.ok) {
        const g = (await (
          await fetch(`${this.host}/api/v4/groups/${encodeURIComponent(group)}`, { headers: this.headers() })
        ).json()) as { id?: number };
        if (!g.id) return null;
        projRes = await fetch(`${this.host}/api/v4/projects`, {
          method: 'POST',
          headers: this.headers(true),
          body: JSON.stringify({
            name, // readable display name
            path: projectId, // immutable URL code (cuid)
            namespace_id: g.id,
            visibility: 'private',
            initialize_with_readme: true,
            default_branch: 'main',
            description: `App sinh bởi Larkwave: ${name}`,
          }),
        });
        if (!projRes.ok) return null;
      }
      const proj = (await projRes.json()) as { id: number; web_url?: string };
      const existing = new Set<string>();
      try {
        const tree = (await (
          await fetch(`${this.host}/api/v4/projects/${proj.id}/repository/tree?recursive=true&per_page=100`, {
            headers: this.headers(),
          })
        ).json()) as { type: string; path: string }[];
        for (const t of Array.isArray(tree) ? tree : []) if (t.type === 'blob') existing.add(t.path);
      } catch {
        /* empty */
      }
      const actions = files.map((f) => ({
        action: existing.has(f.path) ? 'update' : 'create',
        file_path: f.path,
        content: f.content,
      }));
      await fetch(`${this.host}/api/v4/projects/${proj.id}/repository/commits`, {
        method: 'POST',
        headers: this.headers(true),
        body: JSON.stringify({ branch: 'main', commit_message: `Larkwave: ${name}`, actions }),
      });
      return proj.web_url ?? `${this.host}/${projPath}`;
    } catch (err) {
      this.logger.warn(`pushViaApi ${projectId} error: ${String(err)}`);
      return null;
    }
  }
}
