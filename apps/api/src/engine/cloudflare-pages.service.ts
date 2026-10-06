import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { AppConfigService } from '../config/app-config.service';

const nodeRequire = createRequire(__filename);

export interface PagesDeployResult {
  url: string;
  previewUrl?: string;
}

/**
 * Deploys static builds to Cloudflare Pages. The project must be created via
 * the REST API first (wrangler won't create it non-interactively); then
 * `wrangler pages deploy` uploads the build and the site is live at
 * `https://<project>.pages.dev`.
 */
@Injectable()
export class CloudflarePagesService {
  private readonly logger = new Logger(CloudflarePagesService.name);
  private readonly api = 'https://api.cloudflare.com/client/v4';

  constructor(private readonly config: AppConfigService) {}

  private get account(): string {
    return this.config.env.CF_ACCOUNT_ID;
  }
  private get token(): string {
    return this.config.env.CF_API_TOKEN;
  }

  /**
   * Run a SQL statement against a D1 database via the Cloudflare HTTP API and
   * return the result rows. Used by the in-workspace database admin. Values MUST
   * be passed as `params` (bound `?` placeholders); table/column names are the
   * caller's responsibility to whitelist against the real schema.
   */
  async queryD1(dbId: string, sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
    const res = await fetch(`${this.api}/accounts/${this.account}/d1/database/${dbId}/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, params }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      errors?: { message?: string }[];
      result?: { results?: Record<string, unknown>[] }[];
    };
    if (!data.success) {
      const msg =
        (data.errors ?? []).map((e) => e.message).filter(Boolean).join('; ') ||
        `D1 query thất bại (HTTP ${res.status})`;
      throw new Error(msg);
    }
    return data.result?.[0]?.results ?? [];
  }

  async projectExists(name: string): Promise<boolean> {
    const res = await fetch(`${this.api}/accounts/${this.account}/pages/projects/${name}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    return res.ok;
  }

  /**
   * Create the Pages project (idempotent). The Cloudflare Pages API intermittently
   * returns a bare `8000000` "An unknown error occurred" (and 5xx/429) under load —
   * a transient blip, not a real failure — so we retry those a few times with
   * backoff before giving up, instead of failing the whole build on the first one.
   */
  async ensureProject(name: string): Promise<void> {
    const MAX_RETRIES = 4;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      // A prior attempt may have actually created it despite an error response.
      if (attempt > 0 && (await this.projectExists(name))) return;

      const res = await fetch(`${this.api}/accounts/${this.account}/pages/projects`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, production_branch: 'main' }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        errors?: { code?: number; message?: string }[];
      };
      if (res.ok && data.success) {
        this.logger.log(`Created Pages project ${name}`);
        return;
      }
      // Idempotent: a concurrent/previous create already made it.
      if (await this.projectExists(name)) return;

      lastErr = data.errors ?? data;
      const errs = data.errors ?? [];
      const transient =
        res.status === 429 ||
        res.status >= 500 ||
        errs.some((e) => e.code === 8000000 || e.code === 8000054);
      if (transient && attempt < MAX_RETRIES) {
        const waitMs = Math.min(8000, 800 * 2 ** attempt) * (0.5 + Math.random());
        this.logger.warn(
          `Tạo Pages project ${name} lỗi tạm thời (lần ${attempt + 1}/${MAX_RETRIES}), thử lại: ${JSON.stringify(lastErr)}`,
        );
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      break;
    }
    throw new Error(
      `Tạo project Pages thất bại sau nhiều lần thử (lỗi tạm thời từ Cloudflare): ${JSON.stringify(lastErr)}. ` +
        `Vui lòng bấm “Chạy lại”.`,
    );
  }

  /**
   * Xoá một dự án Pages. NÉM LỖI khi Cloudflare từ chối.
   *
   * Bản cũ nuốt cả lỗi mạng lẫn mã lỗi HTTP (`.catch` + không hề đọc `res.ok`), nên một lần xoá
   * thất bại trông y hệt một lần xoá thành công — app biến mất khỏi danh sách trong khi trang web
   * vẫn công khai truy cập được. Đó là lỗi im lặng tệ nhất: người dùng tin là đã xoá.
   *
   * 404 coi như thành công: dự án không còn thì mục tiêu đã đạt.
   */
  async deleteProject(name: string): Promise<void> {
    const res = await fetch(`${this.api}/accounts/${this.account}/pages/projects/${name}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (res.ok || res.status === 404) return;
    const body = await res.text().catch(() => '');
    throw new Error(`Cloudflare từ chối xoá dự án "${name}" (HTTP ${res.status}) ${body.slice(0, 200)}`);
  }

  /**
   * Mọi dự án Pages trong tài khoản — dùng để dò dự án mồ côi.
   *
   * Hai chi tiết của API Pages phải theo đúng, đo bằng thử thật:
   *  - `per_page` bị TỪ CHỐI (lỗi 8000024 "Invalid list options"); chỉ `page` được chấp nhận.
   *  - Mỗi trang trả về 10 mục, nên phải lặp cho tới khi hết.
   * NÉM LỖI thay vì trả mảng rỗng: một lần liệt kê hỏng mà im lặng sẽ báo "không có dự án mồ côi
   * nào" — kết luận ngược hẳn sự thật, đúng cái bẫy mà hàm xoá vừa được sửa để tránh.
   */
  async listProjects(): Promise<string[]> {
    const out: string[] = [];
    for (let page = 1; page <= 50; page++) {
      const res = await fetch(`${this.api}/accounts/${this.account}/pages/projects?page=${page}`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      if (!res.ok) {
        throw new Error(`Cloudflare từ chối liệt kê dự án Pages (HTTP ${res.status})`);
      }
      const j = (await res.json().catch(() => null)) as
        | { success?: boolean; errors?: { message?: string }[]; result?: { name?: string }[] }
        | null;
      if (!j?.success) {
        throw new Error(
          `Cloudflare từ chối liệt kê dự án Pages: ${j?.errors?.[0]?.message ?? 'không rõ lý do'}`,
        );
      }
      const names = (j.result ?? []).map((r) => r?.name).filter((n): n is string => !!n);
      out.push(...names);
      if (names.length === 0) break;
    }
    return out;
  }

  async deploy(
    name: string,
    distDir: string,
    onLog?: (line: string) => void,
    signal?: AbortSignal,
  ): Promise<PagesDeployResult> {
    await this.ensureProject(name);
    const bin = this.resolveWranglerBin();
    const args = [
      bin,
      'pages',
      'deploy',
      distDir,
      `--project-name=${name}`,
      '--branch=main',
      '--commit-dirty=true',
    ];
    const { code, out } = await this.run('node', args, onLog, signal);
    if (code !== 0) {
      const reason = this.deployFailReason(out);
      throw new Error(`wrangler deploy thất bại (exit ${code})${reason ? `: ${reason}` : ''}`);
    }
    const match = out.match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.pages\.dev/i);
    return { url: `https://${name}.pages.dev`, previewUrl: match?.[0] };
  }

  /**
   * Deploy a FULL-STACK build: the Pages Functions in `<projectRoot>/functions`
   * are bundled automatically when wrangler runs from the PROJECT ROOT. We pass
   * `dist` (relative to that root) as the asset dir so the upload is identical to
   * the static deploy, but the `functions/` bundle is picked up too.
   */
  async deployFullstack(
    name: string,
    projectRootDir: string,
    onLog?: (line: string) => void,
    signal?: AbortSignal,
  ): Promise<PagesDeployResult> {
    await this.ensureProject(name);
    const bin = this.resolveWranglerBin();
    const args = [
      bin,
      'pages',
      'deploy',
      'dist',
      `--project-name=${name}`,
      '--branch=main',
      '--commit-dirty=true',
    ];
    const { code, out } = await this.run('node', args, onLog, signal, projectRootDir);
    if (code !== 0) {
      const reason = this.deployFailReason(out);
      throw new Error(
        `wrangler deploy (full-stack) thất bại (exit ${code})${reason ? `: ${reason}` : ''}`,
      );
    }
    const match = out.match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.pages\.dev/i);
    return { url: `https://${name}.pages.dev`, previewUrl: match?.[0] };
  }

  /**
   * Ensure a D1 database named `dbName` exists; returns its uuid (reused if it
   * already exists). Uses the Pages CF_API_TOKEN. Returns null on hard failure.
   */
  async ensureD1(dbName: string): Promise<string | null> {
    const auth = { Authorization: `Bearer ${this.token}` };
    // Look up an existing DB by exact name. The list endpoint paginates, so ask
    // for a generous page (per_page) — otherwise an already-created DB on a later
    // page is missed, we re-POST, CF rejects "already exists", and the whole
    // full-stack deploy fails even though the DB is right there.
    const findExisting = async (): Promise<string | null> => {
      const list = await fetch(
        `${this.api}/accounts/${this.account}/d1/database?name=${encodeURIComponent(dbName)}&per_page=1000`,
        { headers: auth },
      );
      const ld = (await list.json().catch(() => ({}))) as {
        result?: { uuid?: string; name?: string }[];
      };
      return ld.result?.find((d) => d.name === dbName && d.uuid)?.uuid ?? null;
    };

    const existing = await findExisting();
    if (existing) return existing;

    const res = await fetch(`${this.api}/accounts/${this.account}/d1/database`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: dbName }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      result?: { uuid?: string };
      errors?: { code?: number; message?: string }[];
    };
    if ((res.ok || data.success) && data.result?.uuid) return data.result.uuid;

    // Create failed. Most likely it already exists (race / name collision); re-list
    // once before giving up so a transient collision self-heals.
    const afterFail = await findExisting();
    if (afterFail) return afterFail;

    const errMsg =
      (data.errors ?? [])
        .map((e) => e?.message)
        .filter(Boolean)
        .join('; ') || JSON.stringify(data.errors ?? data);
    this.logger.error(`Tạo D1 ${dbName} thất bại: ${errMsg}`);
    // Surface the REAL Cloudflare reason (e.g. "database limit reached") to the
    // pipeline instead of a generic message — the single caller treats a throw the
    // same as the old null (it wraps it into "Cấp phát D1 thất bại: …").
    throw new Error(errMsg || 'Cloudflare từ chối tạo D1');
  }

  /**
   * Best-effort delete a D1 database by uuid (on app delete). Without this, the
   * app's D1 — which can hold user/session/password-hash tables — is orphaned and
   * could be re-bound to a future app that reuses a freed name → cross-tenant leak.
   */
  async deleteD1(dbId: string): Promise<void> {
    try {
      await fetch(`${this.api}/accounts/${this.account}/d1/database/${dbId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${this.token}` },
        signal: AbortSignal.timeout(20000),
      });
    } catch (err) {
      this.logger.warn(`deleteD1 ${dbId} failed: ${String(err)}`);
    }
  }

  /** List ALL D1 databases on the account (for orphan cleanup). [] on failure. */
  async listD1(): Promise<{ uuid: string; name: string }[]> {
    try {
      const res = await fetch(
        `${this.api}/accounts/${this.account}/d1/database?per_page=1000`,
        { headers: { Authorization: `Bearer ${this.token}` }, signal: AbortSignal.timeout(20000) },
      );
      const data = (await res.json().catch(() => ({}))) as {
        result?: { uuid?: string; name?: string }[];
      };
      return (data.result ?? [])
        .filter((d) => d.uuid && d.name)
        .map((d) => ({ uuid: d.uuid as string, name: d.name as string }));
    } catch (err) {
      this.logger.warn(`listD1 failed: ${String(err)}`);
      return [];
    }
  }

  /**
   * Bind the D1 database (uuid) to the Pages project under the binding name `DB`
   * for both production and preview deployment configs.
   */
  async bindD1(project: string, dbId: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.api}/accounts/${this.account}/pages/projects/${project}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deployment_configs: {
            production: { d1_databases: { DB: { id: dbId } } },
            preview: { d1_databases: { DB: { id: dbId } } },
          },
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        errors?: { code?: number; message?: string }[];
      };
      if (res.ok && data.success) return true;
      this.logger.error(`bindD1 ${project} thất bại: ${JSON.stringify(data.errors ?? data)}`);
      return false;
    } catch (err) {
      this.logger.error(`bindD1 ${project} error: ${String(err)}`);
      return false;
    }
  }

  /**
   * Set the project's environment variables (as encrypted `secret_text`) for both
   * production + preview, so deployed Functions read them via `env.KEY`. Sends ONLY
   * `env_vars` — CF deep-merges deployment_configs so the D1 binding is preserved.
   * Replaces the env_vars set (removed keys drop out). Best-effort.
   */
  async setEnvVars(project: string, vars: Record<string, string>): Promise<boolean> {
    try {
      const env_vars: Record<string, { type: string; value: string }> = {};
      for (const [k, v] of Object.entries(vars)) {
        env_vars[k] = { type: 'secret_text', value: v };
      }
      const res = await fetch(`${this.api}/accounts/${this.account}/pages/projects/${project}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deployment_configs: { production: { env_vars }, preview: { env_vars } },
        }),
      });
      if (res.ok) return true;
      const data = await res.json().catch(() => ({}));
      this.logger.error(`setEnvVars ${project} thất bại: ${JSON.stringify(data)}`);
      return false;
    } catch (err) {
      this.logger.error(`setEnvVars ${project} error: ${String(err)}`);
      return false;
    }
  }

  /**
   * Apply a D1 schema file remotely (run ONCE per database to avoid duplicate
   * seeds). Spawns `wrangler d1 execute <dbName> --remote --file=<path> -y`.
   */
  async runD1Schema(
    dbName: string,
    schemaFilePath: string,
    onLog?: (line: string) => void,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const bin = this.resolveWranglerBin();
    const args = [bin, 'd1', 'execute', dbName, '--remote', `--file=${schemaFilePath}`, '-y'];
    const { code } = await this.run('node', args, onLog, signal);
    if (code !== 0) {
      this.logger.error(`runD1Schema ${dbName} thất bại (exit ${code})`);
      return false;
    }
    return true;
  }

  private readonly RESERVED = new Set([
    'app', 'aapp', 'apia', 'www', 'cms', 'api', 'admin', 'mail', 'root', 'ns1', 'ns2', 'a',
  ]);

  /**
   * Give the app a branded `<slug>.toolswave.net` by pointing a proxied CNAME at
   * OUR apps tunnel (which reverse-proxies to `<slug>.pages.dev`). The DNS target
   * is the tunnel — NOT pages.dev — so there is no cross-account CNAME (error
   * 1014), and single-level hostnames are covered by the free Universal SSL.
   * Returns the https URL, or null (caller falls back to *.pages.dev) when the
   * subdomain is reserved/taken or DNS isn't configured. Idempotent.
   */
  async ensureProxiedDomain(slug: string): Promise<string | null> {
    const dnsToken = this.config.env.CF_DNS_API_TOKEN;
    const zoneId = this.config.env.CF_ZONE_ID;
    const tunnelId = this.config.env.TW_APPS_TUNNEL_ID;
    const domain = this.config.env.DOMAIN_GOC;
    if (!dnsToken || !zoneId || !tunnelId) return null;
    if (this.RESERVED.has(slug)) return null;

    const hostname = `${slug}.${domain}`;
    const target = `${tunnelId}.cfargotunnel.com`;
    const auth = { Authorization: `Bearer ${dnsToken}` };
    try {
      // Don't hijack an existing subdomain that isn't ours.
      const existing = await fetch(
        `${this.api}/zones/${zoneId}/dns_records?name=${encodeURIComponent(hostname)}`,
        { headers: auth },
      );
      const ed = (await existing.json().catch(() => ({}))) as {
        result?: { content?: string }[];
      };
      const rec = ed.result?.[0];
      if (rec) return rec.content === target ? `https://${hostname}` : null;

      const res = await fetch(`${this.api}/zones/${zoneId}/dns_records`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'CNAME', name: hostname, content: target, proxied: true, ttl: 1 }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean };
      if (res.ok || data.success) return `https://${hostname}`;
      return null;
    } catch (err) {
      this.logger.warn(`ensureProxiedDomain ${hostname} error: ${String(err)}`);
      return null;
    }
  }

  private resolveWranglerBin(): string {
    try {
      return nodeRequire.resolve('wrangler/bin/wrangler.js');
    } catch {
      return nodeRequire.resolve('wrangler');
    }
  }

  /** Delete the per-app `<slug>.toolswave.net` CNAME (called on app delete). */
  async deleteAppDomain(slug: string): Promise<void> {
    const dnsToken = this.config.env.CF_DNS_API_TOKEN;
    const zoneId = this.config.env.CF_ZONE_ID;
    if (!dnsToken || !zoneId) return;
    const hostname = `${slug}.${this.config.env.DOMAIN_GOC}`;
    try {
      const res = await fetch(
        `${this.api}/zones/${zoneId}/dns_records?name=${encodeURIComponent(hostname)}`,
        { headers: { Authorization: `Bearer ${dnsToken}` } },
      );
      const data = (await res.json().catch(() => ({}))) as { result?: { id?: string }[] };
      const id = data.result?.[0]?.id;
      if (id) {
        await fetch(`${this.api}/zones/${zoneId}/dns_records/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${dnsToken}` },
        }).catch(() => undefined);
      }
    } catch {
      /* best-effort */
    }
  }

  /**
   * Pull the human-meaningful failure reason out of noisy wrangler/esbuild output
   * so a deploy failure is recorded as e.g. `Could not resolve "uuid"` instead of a
   * useless bare "exit 1" in the admin error report. Strips ANSI, keeps the first
   * few distinct error lines, caps length.
   */
  private deployFailReason(out: string): string {
    const clean = out.replace(/\[[0-9;]*m/g, '');
    const seen = new Set<string>();
    const picks: string[] = [];
    for (const raw of clean.split('\n')) {
      const l = raw.trim();
      if (!l) continue;
      if (!/could not resolve|\[ERROR\]|✘|error:|is not exported|build failed with|exceeded|limit/i.test(l))
        continue;
      const k = l.slice(0, 140);
      if (seen.has(k)) continue;
      seen.add(k);
      picks.push(k);
      if (picks.length >= 3) break;
    }
    return picks.join(' · ').slice(0, 300);
  }

  private run(
    cmd: string,
    args: string[],
    onLog?: (line: string) => void,
    signal?: AbortSignal,
    cwd?: string,
  ): Promise<{ code: number; out: string }> {
    return new Promise((resolve) => {
      const child = spawn(cmd, args, {
        ...(cwd ? { cwd } : {}),
        env: {
          ...process.env,
          CLOUDFLARE_API_TOKEN: this.token,
          CLOUDFLARE_ACCOUNT_ID: this.account,
          WRANGLER_SEND_METRICS: 'false',
          CI: '1',
        },
      });
      if (signal) {
        if (signal.aborted) child.kill('SIGKILL');
        else signal.addEventListener('abort', () => child.kill('SIGKILL'), { once: true });
      }
      let out = '';
      const handle = (buf: Buffer) => {
        const s = buf.toString();
        out += s;
        if (onLog)
          s.split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
            .forEach(onLog);
      };
      child.stdout.on('data', handle);
      child.stderr.on('data', handle);
      child.on('close', (code) => resolve({ code: code ?? 1, out }));
      child.on('error', (err) => {
        out += String(err);
        resolve({ code: 1, out });
      });
    });
  }
}
