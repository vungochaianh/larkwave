/**
 * cmsSyncService — the desktop's client for the cms-lark-sync backend (Bitable connector sync).
 *
 * Why this exists: the CMS's "connector" sync replays an internal Lark endpoint
 * (`/space/api/bitable/connector/sync`) using a captured BROWSER SESSION (cookies + csrf). That
 * session expires whenever Lark rotates it, forcing a manual re-capture via the browser extension
 * and a full re-setup — the user's main pain. The desktop already holds a PERSISTENT, per-account,
 * auto-reconnecting Lark web session, so it can supply a FRESH connector session on demand and keep
 * the CMS jobs alive forever. This client lists/creates jobs and, crucially, PUSHES a fresh session
 * into them (`PUT /bitable-sync/:id { connector }`) on a schedule + on failure.
 *
 * The backend keeps doing the actual Lark call (approach A) — the desktop only feeds it a live
 * session + lets the user pick Bases.
 */
export interface ConnectorSession {
  domain: string;
  cookies: string;
  csrfToken: string;
  hostId: string;
  hostType: string;
}

export interface CmsConnector {
  domain?: string;
  docToken?: string;
  tableIds?: string[];
  cookies?: string;
  csrfToken?: string;
  hostId?: string;
  hostType?: string;
}

export interface CmsSyncJob {
  _id?: string;
  id?: string;
  name: string;
  syncMode?: 'read_only' | 'mirror' | 'connector';
  appToken?: string;
  tableId?: string;
  enabled?: boolean;
  connector?: CmsConnector;
  intervalSeconds?: number;
  lastSyncAt?: string;
  lastRunAt?: string;
  lastStatus?: string;
  lastError?: string;
  [k: string]: unknown;
}

export const CMS_SYNC_DEFAULT_BASE = 'https://apihoanam.toolswave.net/api';

/** Process-wide CMS base URL so a Lark TOOL (which only gets the LarkClient, not the store) can
 *  reach the same backend the UI configured. Kept in sync by LarkService. */
let _sharedBaseUrl = CMS_SYNC_DEFAULT_BASE;
export function setSharedCmsBaseUrl(u?: string): void {
  _sharedBaseUrl = (u || '').trim() || CMS_SYNC_DEFAULT_BASE;
}
export function getSharedCmsBaseUrl(): string {
  return _sharedBaseUrl;
}

interface Deps {
  /** A FRESH connector session from the persistent Lark web window (null when not connected). */
  connectorSession: () => Promise<ConnectorSession | null>;
  /** The configured backend base URL (e.g. https://apihoanam.toolswave.net/api). */
  baseUrl: () => string;
  /** Approach B: trigger Lark's connector sync DIRECTLY from the logged-in window (returns the
   *  REAL result — throws on a genuine failure). Optional so callers without a web window degrade
   *  to the backend /execute. */
  syncConnectorTable?: (
    docToken: string,
    tableID: string,
    hostId?: string,
    hostType?: string,
    domain?: string,
  ) => Promise<{ ok: boolean; skipped?: boolean; code?: number; msg?: string; raw?: string }>;
}

export class CmsSyncService {
  constructor(private readonly deps: Deps) {}

  private base(): string {
    return (this.deps.baseUrl() || CMS_SYNC_DEFAULT_BASE).replace(/\/+$/, '');
  }

  private async req<T = unknown>(path: string, method: string, body?: unknown): Promise<T> {
    const r = await fetch(`${this.base()}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let j: unknown = null;
    try {
      j = await r.json();
    } catch {
      /* non-JSON */
    }
    const obj = (j ?? {}) as { success?: boolean; error?: string; message?: string; data?: T };
    if (!r.ok || obj.success === false) {
      throw new Error(obj.error || obj.message || `Máy chủ CMS trả HTTP ${r.status}`);
    }
    return (obj.data ?? (j as T)) as T;
  }

  /** List all Bitable-sync jobs on the CMS. */
  async listJobs(): Promise<CmsSyncJob[]> {
    const data = await this.req<CmsSyncJob[] | { jobs?: CmsSyncJob[] }>('/bitable-sync', 'GET');
    if (Array.isArray(data)) return data;
    return (data as { jobs?: CmsSyncJob[] })?.jobs ?? [];
  }

  private jobId(j: CmsSyncJob): string {
    return String(j._id || j.id || '');
  }

  /** Create a connector-mode job from a Base + one-or-more selected tables (the executor loops
   *  over connector.tableIds), with a fresh session attached. */
  async createConnectorJob(input: {
    name: string;
    appToken: string;
    tableIds: string[];
    enabled?: boolean;
    intervalSeconds?: number;
  }): Promise<CmsSyncJob> {
    const tableIds = (input.tableIds || []).filter(Boolean);
    if (tableIds.length === 0) throw new Error('Chọn ít nhất một bảng để đồng bộ.');
    const sess = await this.deps.connectorSession();
    if (!sess) throw new Error('Chưa kết nối Lark web — vào Lark × Agents → Cài đặt → "Kết nối Lark web" trước.');
    const connector: CmsConnector = {
      domain: sess.domain,
      docToken: input.appToken,
      tableIds,
      cookies: sess.cookies,
      csrfToken: sess.csrfToken,
      hostId: sess.hostId,
      hostType: sess.hostType,
    };
    return this.req<CmsSyncJob>('/bitable-sync', 'POST', {
      name: input.name,
      syncMode: 'connector',
      appToken: input.appToken,
      tableId: tableIds[0], // required by the backend; the full set lives in connector.tableIds
      enabled: input.enabled ?? true,
      ...(input.intervalSeconds ? { intervalSeconds: input.intervalSeconds } : {}),
      connector,
    });
  }

  /** Edit a job's config (name, poll interval, auto-schedule, enabled) — like the web Edit form.
   *  Backend accepts a partial PUT; we only send the connector-relevant knobs. */
  async updateJob(
    jobId: string,
    patch: {
      name?: string;
      description?: string;
      intervalSeconds?: number;
      enabled?: boolean;
      ignoreSchedule?: boolean;
      schedule?: { activeHoursStart?: number; activeHoursEnd?: number; activeDays?: number[]; timezone?: string };
      errorNotify?: { enabled?: boolean; larkWebhookUrl?: string; chatId?: string };
    },
  ): Promise<CmsSyncJob> {
    const body: Record<string, unknown> = {};
    if (patch.name !== undefined) body.name = patch.name;
    if (patch.description !== undefined) body.description = patch.description;
    if (patch.intervalSeconds !== undefined) body.intervalSeconds = patch.intervalSeconds;
    if (patch.enabled !== undefined) body.enabled = patch.enabled;
    if (patch.ignoreSchedule !== undefined) body.ignoreSchedule = patch.ignoreSchedule;
    if (patch.schedule !== undefined) {
      body.schedule = { timezone: 'Asia/Ho_Chi_Minh', ...patch.schedule };
    }
    if (patch.errorNotify !== undefined) {
      body.errorNotify = {
        enabled: !!patch.errorNotify.enabled,
        larkWebhookUrl: (patch.errorNotify.larkWebhookUrl || '').trim(),
        chatId: (patch.errorNotify.chatId || '').trim(),
      };
    }
    return this.req<CmsSyncJob>(`/bitable-sync/${jobId}`, 'PUT', body);
  }

  /** Read the aggregate ("tổng") Lark error-report config from the backend. */
  async getErrorReport(): Promise<{ enabled: boolean; larkWebhookUrl: string; chatId: string }> {
    const d = await this.req<{ enabled?: boolean; larkWebhookUrl?: string; chatId?: string }>('/bitable-sync/error-report', 'GET');
    return { enabled: !!d?.enabled, larkWebhookUrl: d?.larkWebhookUrl || '', chatId: d?.chatId || '' };
  }

  /** Write the aggregate error-report config (webhook and/or chat). */
  async setErrorReport(cfg: { enabled: boolean; larkWebhookUrl: string; chatId: string }): Promise<{ enabled: boolean; larkWebhookUrl: string; chatId: string }> {
    const d = await this.req<{ enabled?: boolean; larkWebhookUrl?: string; chatId?: string }>('/bitable-sync/error-report', 'PUT', {
      enabled: !!cfg.enabled,
      larkWebhookUrl: (cfg.larkWebhookUrl || '').trim(),
      chatId: (cfg.chatId || '').trim(),
    });
    return { enabled: !!d?.enabled, larkWebhookUrl: d?.larkWebhookUrl || '', chatId: d?.chatId || '' };
  }

  /** Liveness of the external VM session-keeper (tw-cms-keeper), stored by the
   *  backend from the keeper's heartbeat. Empty object if the endpoint is absent. */
  async getKeeperStatus(): Promise<Record<string, unknown>> {
    try {
      const d = await this.req<Record<string, unknown>>('/bitable-sync/keeper-status', 'GET');
      return d || {};
    } catch {
      return { present: false, online: false };
    }
  }

  /** List Lark groups the bot is a member of (for the "chọn nhóm" dropdown). */
  async listLarkChats(): Promise<{ chatId: string; name: string }[]> {
    const d = await this.req<{ chatId: string; name: string }[]>('/bitable-sync/lark-chats', 'GET');
    return Array.isArray(d) ? d : [];
  }

  /** Create a new Lark group (bot as owner); the backend adds members best-effort (by email — the
   *  reliable cross-app path — plus any open_ids). Returns how many were actually added. */
  async createLarkChat(
    name: string,
    memberOpenIds: string[],
    memberEmails: string[],
  ): Promise<{ chatId: string; name: string; addedMembers: number; joinLink?: string; memberError?: string }> {
    const d = await this.req<{ chatId?: string; name?: string; addedMembers?: number; joinLink?: string; memberError?: string }>(
      '/bitable-sync/lark-chats',
      'POST',
      {
        name: name.trim(),
        memberOpenIds: (memberOpenIds || []).filter(Boolean),
        memberEmails: (memberEmails || []).filter(Boolean),
      },
    );
    return {
      chatId: d?.chatId || '',
      name: d?.name || name.trim(),
      addedMembers: d?.addedMembers || 0,
      joinLink: d?.joinLink || undefined,
      memberError: d?.memberError,
    };
  }

  /** Send a test card to a webhook and/or chat. */
  async testErrorReport(target: { larkWebhookUrl?: string; chatId?: string }): Promise<{
    ok: boolean;
    results: { target: string; ok: boolean; error?: string }[];
  }> {
    const d = await this.req<{ ok?: boolean; results?: { target: string; ok: boolean; error?: string }[] }>(
      '/bitable-sync/error-report/test',
      'POST',
      { larkWebhookUrl: (target.larkWebhookUrl || '').trim(), chatId: (target.chatId || '').trim() },
    );
    return { ok: !!d?.ok, results: d?.results || [] };
  }

  /** Change which tables a connector job syncs (+ refresh its session in the same write). */
  async setJobTables(jobId: string, tableIds: string[]): Promise<CmsSyncJob> {
    const ids = (tableIds || []).filter(Boolean);
    if (ids.length === 0) throw new Error('Chọn ít nhất một bảng.');
    const jobs = await this.listJobs();
    const job = jobs.find((j) => this.jobId(j) === jobId);
    if (!job) throw new Error('Không tìm thấy job.');
    const sess = await this.deps.connectorSession();
    const prev = job.connector || {};
    const connector: CmsConnector = {
      ...prev,
      tableIds: ids,
      // refresh the session opportunistically if web is connected
      ...(sess
        ? { domain: prev.domain || sess.domain, cookies: sess.cookies, csrfToken: sess.csrfToken, hostId: sess.hostId || prev.hostId || '', hostType: sess.hostType || prev.hostType || 'Wiki' }
        : {}),
    };
    return this.req<CmsSyncJob>(`/bitable-sync/${jobId}`, 'PUT', { tableId: ids[0], connector });
  }

  /** Refresh one job's session by its id (for the per-job "Làm mới session" button). */
  async refreshJobById(jobId: string): Promise<CmsSyncJob> {
    const jobs = await this.listJobs();
    const job = jobs.find((j) => this.jobId(j) === jobId);
    if (!job) throw new Error('Không tìm thấy job.');
    return this.refreshJob(job);
  }

  /** Push a FRESH session into one job (preserving its domain/docToken/tableIds). */
  async refreshJob(job: CmsSyncJob): Promise<CmsSyncJob> {
    const sess = await this.deps.connectorSession();
    if (!sess) throw new Error('Chưa kết nối Lark web — không lấy được session mới.');
    const prev = job.connector || {};
    const connector: CmsConnector = {
      ...prev,
      domain: prev.domain || sess.domain,
      cookies: sess.cookies,
      csrfToken: sess.csrfToken,
      hostId: sess.hostId || prev.hostId || '',
      hostType: sess.hostType || prev.hostType || 'Wiki',
    };
    return this.req<CmsSyncJob>(`/bitable-sync/${this.jobId(job)}`, 'PUT', { connector });
  }

  /**
   * A connector job counts as AUTO-disabled by the backend (its session expired → larkCode 99991668)
   * — as opposed to the user cleanly turning it off — when it is disabled AND its last run left a
   * session/auth-shaped error. We only ever resurrect THESE: a job the user disabled has no error
   * signal, so it's left untouched. The marker set is broad on purpose (the backend's exact field/
   * text lives off-repo and is unverified), but every marker is session/auth-specific so a cleanly
   * user-disabled job never matches.
   */
  private isSessionExpiryDisabled(job: CmsSyncJob): boolean {
    if (job.enabled !== false) return false;
    const sig = [job.lastError, job.lastSyncError, job.lastStatus, job.lastSyncStatus, job.disableReason, job.autoDisableReason]
      .map((x) => (typeof x === 'string' ? x : ''))
      .join(' ')
      .toLowerCase();
    // NEVER resurrect a job the backend flagged as needing a MANUAL fix — permission (1254302),
    // base/table deleted (1254001 "AppTokenNotFound", 1254004), synced-table/field errors — those
    // carry "cần fix thủ công" and re-enabling only thrashes (it re-fails then re-disables).
    if (/cần fix thủ công|can fix thu cong|không tự khắc phục|khong tu khac phuc/.test(sig)) return false;
    // Re-enable ONLY session/token-EXPIRY disables (larkCode 99991668/99991663 → hint "Token
    // invalid/expired — Token đã hết hạn"). Deliberately NOT a bare "token": that would match
    // "AppTokenNotFound" (1254001 = base deleted), a manual-fix error, not a session one.
    return /99991668|99991663|token invalid|token expired|token đã hết hạn|hết hạn|het han|\bsession\b|expired|expire|unauthor|csrf|\bcookie\b|đăng nhập|dang nhap|\blogin\b|\b401\b/.test(sig);
  }

  /** Refresh the session on EVERY connector job AND revive any the backend auto-disabled when its
   *  session died (the 30-min + startup + on-demand path). Best-effort: a per-job failure doesn't
   *  abort the rest. Returns counts + errors for the UI. */
  async refreshAll(): Promise<{ total: number; refreshed: number; reenabled: number; failed: number; errors: string[] }> {
    // Fetch one fresh session up-front so we don't re-open the window per job.
    const sess = await this.deps.connectorSession();
    if (!sess) throw new Error('Chưa kết nối Lark web — không lấy được session mới.');
    // Cover ALL connector jobs, INCLUDING disabled ones — the backend auto-disables a job when its
    // session expires (larkCode 99991668), so the jobs that most need a refresh are the disabled ones.
    const jobs = (await this.listJobs()).filter((j) => j.syncMode === 'connector');
    let refreshed = 0;
    let reenabled = 0;
    const errors: string[] = [];
    for (const job of jobs) {
      try {
        const prev = job.connector || {};
        const connector: CmsConnector = {
          ...prev,
          domain: prev.domain || sess.domain,
          cookies: sess.cookies,
          csrfToken: sess.csrfToken,
          hostId: sess.hostId || prev.hostId || '',
          hostType: sess.hostType || prev.hostType || 'Wiki',
        };
        // Push the fresh session; if the backend auto-disabled this job when its session died,
        // flip enabled back on in the SAME write now that it has a live session again. This closes
        // the "auto-disabled while the desktop was closed, never re-enabled" gap that silently
        // stops the CMS's scheduled re-runs (refreshAll used to push cookies but never re-enable).
        const revive = this.isSessionExpiryDisabled(job);
        await this.req(`/bitable-sync/${this.jobId(job)}`, 'PUT', revive ? { connector, enabled: true } : { connector });
        refreshed += 1;
        if (revive) reenabled += 1;
      } catch (e) {
        errors.push(`${job.name}: ${(e as Error)?.message || 'lỗi'}`);
      }
    }
    return { total: jobs.length, refreshed, reenabled, failed: errors.length, errors };
  }

  /**
   * Run a job NOW. Approach B first: trigger Lark's connector sync DIRECTLY from the logged-in
   * window (live session, real result — so a wrong docToken / dead session is visible instead of a
   * fake "success"). Falls back to the backend /execute only when the web window isn't available.
   */
  async execute(jobId: string): Promise<{
    ok: boolean;
    synced?: number;
    total?: number;
    failed?: string[];
    details?: string[];
    viaLocal?: boolean;
    error?: string;
  }> {
    const jobs = await this.listJobs();
    const job = jobs.find((j) => this.jobId(j) === jobId);
    if (!job) return { ok: false, error: 'Không tìm thấy job.' };

    // Approach B — desktop calls Lark itself (only for connector jobs + when we have the window).
    if (job.syncMode === 'connector' && this.deps.syncConnectorTable) {
      const docToken = job.connector?.docToken || job.appToken || '';
      const tableIds =
        (job.connector?.tableIds && job.connector.tableIds.length ? job.connector.tableIds : job.tableId ? [job.tableId] : []) || [];
      if (!docToken || tableIds.length === 0) return { ok: false, error: 'Job thiếu docToken/bảng.' };
      // A wiki-hosted base needs docs-host-id (the wiki node) + docs-host-type — the job's stored
      // connector carries them (the extension captured the right one per base).
      const hostId = job.connector?.hostId;
      const hostType = job.connector?.hostType;
      const domain = job.connector?.domain;
      let synced = 0;
      const failed: string[] = [];
      const details: string[] = [];
      for (const tid of tableIds) {
        try {
          const r = await this.deps.syncConnectorTable(docToken, tid, hostId, hostType, domain);
          details.push(`${tid}: code ${r.code ?? '?'} · ${r.msg || ''}${r.skipped ? ' (đang đồng bộ)' : ''} · ${r.raw || ''}`);
          if (r.ok) synced += 1;
          else failed.push(`${tid}: code ${r.code} — ${r.msg || 'không rõ'}`);
        } catch (e) {
          const m = (e as Error)?.message || 'lỗi';
          details.push(`${tid}: ${m}`);
          failed.push(`${tid}: ${m}`);
        }
      }
      // Log the honest result back to the CMS (best-effort; ignored if the endpoint is absent).
      await this.req(`/bitable-sync/${jobId}/log`, 'POST', {
        status: failed.length ? 'error' : 'success',
        synced,
        total: tableIds.length,
        errors: failed,
      }).catch(() => undefined);
      return { ok: failed.length === 0, synced, total: tableIds.length, failed, details, viaLocal: true };
    }

    // Fallback — backend executes (Approach A). Refresh the session once then retry on failure.
    try {
      await this.req(`/bitable-sync/${jobId}/execute`, 'POST');
      return { ok: true };
    } catch (firstErr) {
      try {
        if (job.syncMode === 'connector') await this.refreshJob(job);
        await this.req(`/bitable-sync/${jobId}/execute`, 'POST');
        return { ok: true };
      } catch (retryErr) {
        return { ok: false, error: (retryErr as Error)?.message || (firstErr as Error)?.message || 'Chạy thất bại' };
      }
    }
  }

  async toggle(jobId: string): Promise<CmsSyncJob> {
    return this.req<CmsSyncJob>(`/bitable-sync/${jobId}/toggle`, 'PATCH');
  }

  async deleteJob(jobId: string): Promise<void> {
    await this.req(`/bitable-sync/${jobId}`, 'DELETE');
  }
}
