import { Injectable, Logger } from '@nestjs/common';
import { GeneratedFile } from '@larkwave/shared';
import { AppConfigService } from '../config/app-config.service';

export type GitProvider = 'gitlab' | 'github';

/** Normalised repo shape returned to the web app from either provider. */
export interface GitRepo {
  id: string;
  fullName: string;
  name: string;
  defaultBranch: string;
  private: boolean;
  webUrl: string;
  updatedAt: string | null;
}

/** Profile resolved from a provider after the OAuth token exchange. */
export interface GitProfile {
  username: string;
  email: string | null;
}

/** An OAuth token set. GitLab tokens expire + carry a (rotating) refresh token. */
export interface GitToken {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
}

// Import safety caps — never pull binaries or huge trees. Raised so full
// multi-package repos import completely (the old 300/3MB caps silently
// truncated large monorepos). `truncated` is reported back when a cap is hit.
const MAX_FILE_BYTES = 512 * 1024; // ~512KB per file
const MAX_FILES = 2000;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024; // ~25MB total
const SKIP_DIRS = ['node_modules/', '.git/', 'dist/', 'build/', '.next/', 'out/', 'coverage/', '.cache/'];
const BINARY_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'tif', 'tiff', 'avif',
  'mp4', 'mov', 'avi', 'webm', 'mkv', 'mp3', 'wav', 'ogg', 'flac',
  'woff', 'woff2', 'ttf', 'eot', 'otf',
  'zip', 'gz', 'tar', 'rar', '7z', 'pdf', 'exe', 'dll', 'so', 'dylib', 'bin',
  'wasm', 'class', 'jar', 'psd', 'sketch', 'ai',
]);

// Binary ASSETS we DO import (as base64) so an imported site keeps its real images +
// fonts. Everything else in BINARY_EXT (video/archives/binaries) is still skipped.
const ASSET_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'avif', 'tif', 'tiff',
  'woff', 'woff2', 'ttf', 'eot', 'otf',
]);
// Assets can exceed the 512KB text cap (logos/hero images) — allow up to 4MB each.
const ASSET_MAX_BYTES = 4 * 1024 * 1024;

const GH = 'https://api.github.com';

/**
 * Per-USER GitLab/GitHub integration: OAuth (token exchange + profile), repo
 * listing, repo import (API tree + raw files -> GeneratedFile[]), and committing
 * the app's current files back to the user's repo via each provider's Commit /
 * Git Data API. Uses the user's own OAuth access token (NOT the platform token).
 *
 * Every method degrades gracefully when OAuth creds are absent: `isEnabled`
 * drives the 503 / hidden-button behaviour; token-bearing calls just fail when
 * the user hasn't connected. Tokens are never logged.
 */
@Injectable()
export class GitProvidersService {
  private readonly logger = new Logger(GitProvidersService.name);

  constructor(private readonly config: AppConfigService) {}

  // -- feature flags ----------------------------------------------------------

  isEnabled(provider: GitProvider): boolean {
    const e = this.config.env;
    return provider === 'gitlab'
      ? Boolean(e.GITLAB_OAUTH_CLIENT_ID && e.GITLAB_OAUTH_CLIENT_SECRET)
      : Boolean(e.GITHUB_OAUTH_CLIENT_ID && e.GITHUB_OAUTH_CLIENT_SECRET);
  }

  /** { gitlab, github } booleans for GET /auth/config. */
  get flags(): { gitlab: boolean; github: boolean } {
    return { gitlab: this.isEnabled('gitlab'), github: this.isEnabled('github') };
  }

  // -- OAuth: consent URL -----------------------------------------------------

  /** Build the provider consent URL (caller has already checked isEnabled). */
  buildConsentUrl(provider: GitProvider, state: string): string {
    const e = this.config.env;
    if (provider === 'gitlab') {
      const params = new URLSearchParams({
        client_id: e.GITLAB_OAUTH_CLIENT_ID,
        redirect_uri: e.GITLAB_OAUTH_REDIRECT,
        response_type: 'code',
        // 'api' alone grants user read + repo read/write; requesting 'read_user'
        // too fails with "scope invalid" when the OAuth app wasn't granted it.
        scope: 'api',
        state,
      });
      return `https://gitlab.com/oauth/authorize?${params.toString()}`;
    }
    const params = new URLSearchParams({
      client_id: e.GITHUB_OAUTH_CLIENT_ID,
      redirect_uri: e.GITHUB_OAUTH_REDIRECT,
      scope: 'read:user user:email repo',
      state,
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  // -- OAuth: code -> access token --------------------------------------------

  /** Exchange the OAuth `code` for the user's access token. Throws on failure. */
  async exchangeCode(provider: GitProvider, code: string): Promise<GitToken> {
    const e = this.config.env;
    if (provider === 'gitlab') {
      const res = await fetch('https://gitlab.com/oauth/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: e.GITLAB_OAUTH_CLIENT_ID,
          client_secret: e.GITLAB_OAUTH_CLIENT_SECRET,
          code,
          grant_type: 'authorization_code',
          redirect_uri: e.GITLAB_OAUTH_REDIRECT,
        }),
      });
      if (!res.ok) throw new Error(`GitLab token exchange failed: ${res.status}`);
      const json = (await res.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      };
      if (!json.access_token) throw new Error('GitLab token response missing access_token');
      return {
        accessToken: json.access_token,
        refreshToken: json.refresh_token ?? null,
        expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null,
      };
    }
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({
        client_id: e.GITHUB_OAUTH_CLIENT_ID,
        client_secret: e.GITHUB_OAUTH_CLIENT_SECRET,
        code,
        redirect_uri: e.GITHUB_OAUTH_REDIRECT,
      }),
    });
    if (!res.ok) throw new Error(`GitHub token exchange failed: ${res.status}`);
    const json = (await res.json()) as { access_token?: string; error?: string };
    if (!json.access_token) {
      throw new Error(`GitHub token response missing access_token${json.error ? `: ${json.error}` : ''}`);
    }
    // GitHub OAuth-App tokens don't expire → no refresh needed.
    return { accessToken: json.access_token, refreshToken: null, expiresAt: null };
  }

  /** Refresh an expired GitLab access token using its (rotating) refresh token. */
  async refreshGitlabToken(refreshToken: string): Promise<GitToken | null> {
    const e = this.config.env;
    try {
      const res = await fetch('https://gitlab.com/oauth/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: e.GITLAB_OAUTH_CLIENT_ID,
          client_secret: e.GITLAB_OAUTH_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
          redirect_uri: e.GITLAB_OAUTH_REDIRECT,
        }),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      };
      if (!json.access_token) return null;
      return {
        accessToken: json.access_token,
        // GitLab rotates the refresh token — keep the new one (fall back to the old).
        refreshToken: json.refresh_token ?? refreshToken,
        expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null,
      };
    } catch {
      return null;
    }
  }

  // -- OAuth: token -> profile ------------------------------------------------

  /** Fetch the authenticated user's username + primary email using their token. */
  async fetchProfile(provider: GitProvider, token: string): Promise<GitProfile> {
    if (provider === 'gitlab') {
      const res = await fetch('https://gitlab.com/api/v4/user', {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`GitLab /user failed: ${res.status}`);
      const u = (await res.json()) as { username?: string; email?: string };
      return { username: u.username ?? '', email: u.email?.toLowerCase().trim() || null };
    }
    const res = await fetch(`${GH}/user`, { headers: this.ghHeaders(token) });
    if (!res.ok) throw new Error(`GitHub /user failed: ${res.status}`);
    const u = (await res.json()) as { login?: string; email?: string | null };
    let email = u.email?.toLowerCase().trim() || null;
    if (!email) {
      // public email may be null -> fetch from /user/emails (primary, verified).
      try {
        const er = await fetch(`${GH}/user/emails`, { headers: this.ghHeaders(token) });
        if (er.ok) {
          const emails = (await er.json()) as { email: string; primary: boolean; verified: boolean }[];
          const primary = emails.find((x) => x.primary && x.verified) ?? emails.find((x) => x.verified);
          email = primary?.email?.toLowerCase().trim() || null;
        }
      } catch {
        /* best-effort */
      }
    }
    return { username: u.login ?? '', email };
  }

  // -- repos ------------------------------------------------------------------

  /** List the user's repos (search by `q`, paged), normalised across providers. */
  async listRepos(
    provider: GitProvider,
    token: string,
    q: string,
    page = 1,
  ): Promise<{ repos: GitRepo[]; hasMore: boolean }> {
    const perPage = 30;
    const p = Math.max(1, Math.floor(page) || 1);
    if (provider === 'gitlab') {
      const params = new URLSearchParams({
        membership: 'true',
        simple: 'true',
        per_page: String(perPage),
        page: String(p),
        order_by: 'last_activity_at',
      });
      if (q) params.set('search', q);
      const res = await fetch(`https://gitlab.com/api/v4/projects?${params.toString()}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`GitLab projects failed: ${res.status}`);
      const hasMore = Boolean(res.headers.get('x-next-page'));
      const rows = (await res.json()) as {
        id: number;
        path_with_namespace: string;
        name: string;
        default_branch?: string;
        visibility?: string;
        web_url?: string;
        last_activity_at?: string;
      }[];
      return {
        hasMore,
        repos: rows.map((r) => ({
          id: String(r.id),
          fullName: r.path_with_namespace,
          name: r.name,
          defaultBranch: r.default_branch ?? 'main',
          private: r.visibility !== 'public',
          webUrl: r.web_url ?? `https://gitlab.com/${r.path_with_namespace}`,
          updatedAt: r.last_activity_at ?? null,
        })),
      };
    }
    const res = await fetch(`${GH}/user/repos?per_page=${perPage}&page=${p}&sort=updated`, {
      headers: this.ghHeaders(token),
    });
    if (!res.ok) throw new Error(`GitHub repos failed: ${res.status}`);
    let rows = (await res.json()) as {
      id: number;
      full_name: string;
      name: string;
      default_branch?: string;
      private?: boolean;
      html_url?: string;
      updated_at?: string;
    }[];
    const hasMore = rows.length === perPage; // a full page → likely more
    if (q) {
      const needle = q.toLowerCase();
      rows = rows.filter((r) => r.full_name.toLowerCase().includes(needle));
    }
    return {
      hasMore,
      repos: rows.map((r) => ({
        id: String(r.id),
        fullName: r.full_name,
        name: r.name,
        defaultBranch: r.default_branch ?? 'main',
        private: Boolean(r.private),
        webUrl: r.html_url ?? `https://github.com/${r.full_name}`,
        updatedAt: r.updated_at ?? null,
      })),
    };
  }

  // -- import: download tree + text files -> GeneratedFile[] ------------------

  /**
   * Download a repo's text/code files via the provider API (NOT a full clone of
   * binaries). Skips node_modules/.git/dist/build, binaries and files >256KB,
   * caps ~300 files / ~3MB. Returns { files, branch }.
   */
  async importRepoFiles(
    provider: GitProvider,
    token: string,
    repo: string,
    branch?: string,
  ): Promise<{ files: GeneratedFile[]; branch: string; truncated: boolean }> {
    return provider === 'gitlab'
      ? this.importGitlab(token, repo, branch)
      : this.importGithub(token, repo, branch);
  }

  private extOf(path: string): string {
    const p = path.replace(/^\/+/, '');
    return p.includes('.') ? p.slice(p.lastIndexOf('.') + 1).toLowerCase() : '';
  }
  /** Binary image/font asset we import as base64 (kept, not skipped). */
  private isAsset(path: string): boolean {
    return ASSET_EXT.has(this.extOf(path));
  }

  private shouldSkip(path: string): boolean {
    const p = path.replace(/^\/+/, '');
    if (SKIP_DIRS.some((d) => p === d.slice(0, -1) || p.startsWith(d) || p.includes(`/${d}`))) return true;
    const ext = this.extOf(p);
    // Skip binaries EXCEPT image/font assets, which we import as base64 so the site
    // keeps its real images/fonts.
    if (ext && BINARY_EXT.has(ext) && !ASSET_EXT.has(ext)) return true;
    // lockfiles are huge & regenerated on install — skip.
    if (/(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(p)) return true;
    return false;
  }

  /** Heuristic: content with a NUL byte (U+0000) is binary -> drop it. */
  private looksBinary(content: string): boolean {
    return content.indexOf(String.fromCharCode(0)) !== -1;
  }

  private async importGitlab(
    token: string,
    repo: string,
    branch?: string,
  ): Promise<{ files: GeneratedFile[]; branch: string; truncated: boolean }> {
    const enc = encodeURIComponent(repo);
    const headers = { authorization: `Bearer ${token}` };

    // Resolve the branch (fall back to the project's default).
    let ref = branch?.trim() || '';
    if (!ref) {
      const pr = await fetch(`https://gitlab.com/api/v4/projects/${enc}`, { headers });
      if (!pr.ok) throw new Error(`GitLab project lookup failed: ${pr.status}`);
      const proj = (await pr.json()) as { default_branch?: string };
      ref = proj.default_branch ?? 'main';
    }

    // Walk the (paginated) recursive tree (up to 30 pages × 100 = 3000 entries).
    const blobs: string[] = [];
    let truncated = false;
    for (let page = 1; page <= 30; page += 1) {
      const url = `https://gitlab.com/api/v4/projects/${enc}/repository/tree?recursive=true&per_page=100&page=${page}&ref=${encodeURIComponent(ref)}`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        if (page === 1) throw new Error(`GitLab tree failed: ${res.status}`);
        break;
      }
      const items = (await res.json()) as { type: string; path: string }[];
      for (const it of items) if (it.type === 'blob' && !this.shouldSkip(it.path)) blobs.push(it.path);
      if (!res.headers.get('x-next-page')) break;
      if (page === 30) truncated = true; // more pages remain
    }

    const files: GeneratedFile[] = [];
    let totalBytes = 0;
    for (const path of blobs) {
      if (files.length >= MAX_FILES || totalBytes >= MAX_TOTAL_BYTES) {
        truncated = true;
        break;
      }
      const raw = `https://gitlab.com/api/v4/projects/${enc}/repository/files/${encodeURIComponent(path)}/raw?ref=${encodeURIComponent(ref)}`;
      const res = await fetch(raw, { headers });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      const asset = this.isAsset(path);
      if (buf.byteLength > (asset ? ASSET_MAX_BYTES : MAX_FILE_BYTES)) continue;
      if (asset) {
        files.push({ path, content: buf.toString('base64'), encoding: 'base64' });
      } else {
        const content = buf.toString('utf8');
        if (this.looksBinary(content)) continue;
        files.push({ path, content });
      }
      totalBytes += buf.byteLength;
    }
    if (!files.length) throw new Error('Repo khong co file van ban nao de import');
    return { files, branch: ref, truncated };
  }

  private async importGithub(
    token: string,
    repo: string,
    branch?: string,
  ): Promise<{ files: GeneratedFile[]; branch: string; truncated: boolean }> {
    const headers = this.ghHeaders(token);

    let ref = branch?.trim() || '';
    if (!ref) {
      const pr = await fetch(`${GH}/repos/${repo}`, { headers });
      if (!pr.ok) throw new Error(`GitHub repo lookup failed: ${pr.status}`);
      const r = (await pr.json()) as { default_branch?: string };
      ref = r.default_branch ?? 'main';
    }

    const treeRes = await fetch(
      `${GH}/repos/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
      { headers },
    );
    if (!treeRes.ok) throw new Error(`GitHub tree failed: ${treeRes.status}`);
    const tree = (await treeRes.json()) as {
      tree: { path: string; type: string; size?: number }[];
      truncated?: boolean;
    };
    let truncated = Boolean(tree.truncated);
    const blobs = (tree.tree ?? []).filter(
      (t) =>
        t.type === 'blob' &&
        !this.shouldSkip(t.path) &&
        (t.size ?? 0) <= (this.isAsset(t.path) ? ASSET_MAX_BYTES : MAX_FILE_BYTES),
    );

    const files: GeneratedFile[] = [];
    let totalBytes = 0;
    for (const b of blobs) {
      if (files.length >= MAX_FILES || totalBytes >= MAX_TOTAL_BYTES) {
        truncated = true;
        break;
      }
      const raw = await fetch(`${GH}/repos/${repo}/contents/${b.path}?ref=${encodeURIComponent(ref)}`, {
        headers: { ...headers, accept: 'application/vnd.github.raw' },
      });
      if (!raw.ok) continue;
      const buf = Buffer.from(await raw.arrayBuffer());
      const asset = this.isAsset(b.path);
      if (buf.byteLength > (asset ? ASSET_MAX_BYTES : MAX_FILE_BYTES)) continue;
      if (asset) {
        files.push({ path: b.path, content: buf.toString('base64'), encoding: 'base64' });
      } else {
        const content = buf.toString('utf8');
        if (this.looksBinary(content)) continue;
        files.push({ path: b.path, content });
      }
      totalBytes += buf.byteLength;
    }
    if (!files.length) throw new Error('Repo khong co file van ban nao de import');
    return { files, branch: ref, truncated };
  }

  // -- push: commit the app's current files back to the repo ------------------

  /**
   * Commit `files` back to `repo`@`branch` on the user's behalf. Creates/updates
   * each file via the provider Commit / Git Data API. Returns a commit URL on
   * success (best-effort). Throws on hard failure.
   */
  async pushFiles(
    provider: GitProvider,
    token: string,
    repo: string,
    branch: string,
    files: GeneratedFile[],
    message: string,
  ): Promise<{ commitUrl?: string }> {
    if (!files.length) throw new Error('Khong co file nao de day');
    return provider === 'gitlab'
      ? this.pushGitlab(token, repo, branch, files, message)
      : this.pushGithub(token, repo, branch, files, message);
  }

  private async pushGitlab(
    token: string,
    repo: string,
    branch: string,
    files: GeneratedFile[],
    message: string,
  ): Promise<{ commitUrl?: string }> {
    const enc = encodeURIComponent(repo);
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

    // Which paths already exist on the branch -> choose create vs update.
    const existing = new Set<string>();
    for (let page = 1; page <= 10; page += 1) {
      const url = `https://gitlab.com/api/v4/projects/${enc}/repository/tree?recursive=true&per_page=100&page=${page}&ref=${encodeURIComponent(branch)}`;
      const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
      if (!res.ok) break;
      const items = (await res.json()) as { type: string; path: string }[];
      for (const it of items) if (it.type === 'blob') existing.add(it.path);
      if (!res.headers.get('x-next-page')) break;
    }

    const actions = files.map((f) => {
      const fp = f.path.replace(/^\/+/, '');
      return {
        action: existing.has(fp) ? 'update' : 'create',
        file_path: fp,
        content: f.content,
        // base64 assets must be committed as base64, else the image is corrupted.
        ...(f.encoding === 'base64' ? { encoding: 'base64' } : {}),
      };
    });
    const res = await fetch(`https://gitlab.com/api/v4/projects/${enc}/repository/commits`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ branch, commit_message: message, actions }),
    });
    if (!res.ok) throw new Error(`GitLab commit failed: ${res.status}`);
    const commit = (await res.json()) as { web_url?: string; id?: string };
    return {
      commitUrl:
        commit.web_url ?? (commit.id ? `https://gitlab.com/${repo}/-/commit/${commit.id}` : undefined),
    };
  }

  private async pushGithub(
    token: string,
    repo: string,
    branch: string,
    files: GeneratedFile[],
    message: string,
  ): Promise<{ commitUrl?: string }> {
    const headers = { ...this.ghHeaders(token), 'content-type': 'application/json' };

    // Git Data API: build a tree off the branch head, create one commit, move ref.
    const refRes = await fetch(`${GH}/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
      headers: this.ghHeaders(token),
    });
    if (!refRes.ok) throw new Error(`GitHub ref lookup failed: ${refRes.status}`);
    const ref = (await refRes.json()) as { object: { sha: string } };
    const baseSha = ref.object.sha;

    const commitRes = await fetch(`${GH}/repos/${repo}/git/commits/${baseSha}`, {
      headers: this.ghHeaders(token),
    });
    if (!commitRes.ok) throw new Error(`GitHub base commit lookup failed: ${commitRes.status}`);
    const baseCommit = (await commitRes.json()) as { tree: { sha: string } };

    // Blob per file -> tree.
    const treeItems: { path: string; mode: '100644'; type: 'blob'; sha: string }[] = [];
    for (const f of files) {
      const blobRes = await fetch(`${GH}/repos/${repo}/git/blobs`, {
        method: 'POST',
        headers,
        // base64 assets must be committed as base64, else the image is corrupted.
        body: JSON.stringify({ content: f.content, encoding: f.encoding === 'base64' ? 'base64' : 'utf-8' }),
      });
      if (!blobRes.ok) throw new Error(`GitHub blob create failed: ${blobRes.status}`);
      const blob = (await blobRes.json()) as { sha: string };
      treeItems.push({ path: f.path.replace(/^\/+/, ''), mode: '100644', type: 'blob', sha: blob.sha });
    }

    const treeRes = await fetch(`${GH}/repos/${repo}/git/trees`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: treeItems }),
    });
    if (!treeRes.ok) throw new Error(`GitHub tree create failed: ${treeRes.status}`);
    const newTree = (await treeRes.json()) as { sha: string };

    const newCommitRes = await fetch(`${GH}/repos/${repo}/git/commits`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, tree: newTree.sha, parents: [baseSha] }),
    });
    if (!newCommitRes.ok) throw new Error(`GitHub commit create failed: ${newCommitRes.status}`);
    const newCommit = (await newCommitRes.json()) as { sha: string; html_url?: string };

    const updateRes = await fetch(`${GH}/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ sha: newCommit.sha, force: false }),
    });
    if (!updateRes.ok) throw new Error(`GitHub ref update failed: ${updateRes.status}`);
    return { commitUrl: newCommit.html_url ?? `https://github.com/${repo}/commit/${newCommit.sha}` };
  }

  private ghHeaders(token: string): Record<string, string> {
    return {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'Larkwave',
      'x-github-api-version': '2022-11-28',
    };
  }
}
