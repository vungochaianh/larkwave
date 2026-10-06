/**
 * cms.js — client for the Larkwave CMS Bitable-sync backend (apihoanam).
 *
 * This is a faithful, dependency-free port of the desktop's cmsSyncService
 * refresh path (apps/desktop/main/runtime/lark/cmsSyncService.ts). The backend
 * takes a partial PUT of the connector session; there is no auth header.
 *
 * ONE deliberate difference from desktop refreshAll(): here we prefer each
 * job's OWN stored hostId/hostType (`prev.hostId || sess.hostId`) instead of
 * letting a single freshly-captured, base-specific hostId override every job.
 * hostId is per-base, so preserving the job's own value avoids pushing a wrong
 * host to a different base. cookies + csrfToken are always taken fresh — those
 * are the values that actually expire.
 */

async function req(base, pathname, method, body) {
  const r = await fetch(`${base.replace(/\/+$/, '')}${pathname}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let j = null;
  try {
    j = await r.json();
  } catch {
    /* non-JSON */
  }
  const obj = j ?? {};
  if (!r.ok || obj.success === false) {
    throw new Error(obj.error || obj.message || `CMS backend HTTP ${r.status}`);
  }
  return obj.data ?? j;
}

export async function listJobs(base) {
  const data = await req(base, '/bitable-sync', 'GET');
  if (Array.isArray(data)) return data;
  return data?.jobs ?? [];
}

/**
 * Decide whether a connector job belongs to a given Lark account, so a multi-account
 * keeper pushes each account's OWN session only to its own jobs (never one account's
 * cookies onto another account's base). `match` is the account's rule from config:
 *   { larkAccountId?, domains?: string[], appTokens?: string[], jobIds?: string[] }
 * A null/empty match matches EVERYTHING (the single-account default — unchanged behavior).
 * Precedence: explicit job.larkAccountId (set by the desktop on create) wins; otherwise
 * fall back to jobId / appToken / domain matching so EXISTING un-tagged jobs still route.
 */
export function jobMatchesAccount(job, match) {
  if (!match) return true;
  // 1) Explicit tag set by the desktop when the job was created.
  if (match.larkAccountId && job.larkAccountId) {
    return String(job.larkAccountId) === String(match.larkAccountId);
  }
  const c = job.connector || {};
  const jid = String(job._id || job.id || '');
  const appToken = job.appToken || c.docToken || '';
  const domain = c.domain || '';
  const has = (arr, v) => Array.isArray(arr) && v && arr.map(String).includes(String(v));
  // 2) Fallbacks for un-tagged jobs — any listed identifier claims the job.
  if (has(match.jobIds, jid)) return true;
  if (has(match.appTokens, appToken)) return true;
  if (has(match.domains, domain)) return true;
  // If the account declared ANY rule but none matched, it's not this account's job.
  const declaredAny = (match.jobIds && match.jobIds.length) || (match.appTokens && match.appTokens.length) || (match.domains && match.domains.length) || match.larkAccountId;
  return declaredAny ? false : true;
}

/**
 * Report the keeper's liveness to the backend so the desktop app can show VM
 * status without SSH. Best-effort: the endpoint may not exist on older backends
 * (404 is fine) — never throw.
 */
export async function postHeartbeat(base, payload) {
  try {
    await fetch(`${base.replace(/\/+$/, '')}/bitable-sync/keeper-heartbeat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    /* backend down / endpoint absent — ignore */
  }
}

/**
 * Pull the freshest stored connector session (cookies + domain) straight from
 * the backend, so a fresh VM can bootstrap WITHOUT any manual login: whatever
 * session the desktop last pushed is already sitting on every job. Returns null
 * when no job carries cookies. All connector jobs share one pushed session, so
 * any is fine — we take the one with the most complete cookie string.
 */
export async function fetchStoredSession(base) {
  const jobs = (await listJobs(base)).filter(
    (j) => j.syncMode === 'connector' && j.connector && j.connector.cookies,
  );
  if (!jobs.length) return null;
  let best = null;
  for (const j of jobs) {
    const len = (j.connector.cookies || '').length;
    if (!best || len > best.len) best = { len, c: j.connector };
  }
  const c = best.c;
  return {
    domain: c.domain || '',
    cookies: c.cookies || '',
    csrfToken: c.csrfToken || '',
    hostId: c.hostId || '',
    hostType: c.hostType || 'Wiki',
  };
}

function jobId(j) {
  return String(j._id || j.id || '');
}

/**
 * A connector job counts as AUTO-disabled by the backend (session expired →
 * larkCode 99991668) when it is disabled AND its last run left a session/auth
 * error. We only ever resurrect THESE — never a job the user cleanly disabled,
 * and never one flagged "cần fix thủ công" (permission / base deleted), which
 * only thrashes on re-enable. Ported verbatim from cmsSyncService.ts.
 */
function isSessionExpiryDisabled(job) {
  if (job.enabled !== false) return false;
  const sig = [
    job.lastError,
    job.lastSyncError,
    job.lastStatus,
    job.lastSyncStatus,
    job.disableReason,
    job.autoDisableReason,
  ]
    .map((x) => (typeof x === 'string' ? x : ''))
    .join(' ')
    .toLowerCase();
  if (/cần fix thủ công|can fix thu cong|không tự khắc phục|khong tu khac phuc/.test(sig)) return false;
  return /99991668|99991663|token invalid|token expired|token đã hết hạn|hết hạn|het han|\bsession\b|expired|expire|unauthor|csrf|\bcookie\b|đăng nhập|dang nhap|\blogin\b|\b401\b/.test(
    sig,
  );
}

/**
 * Push a fresh session into EVERY connector job, reviving any the backend
 * auto-disabled on session expiry. Best-effort: a per-job failure doesn't abort
 * the rest. Returns counts + errors.
 */
export async function refreshAll(base, sess, match = null) {
  const jobs = (await listJobs(base)).filter((j) => j.syncMode === 'connector' && jobMatchesAccount(j, match));
  let refreshed = 0;
  let reenabled = 0;
  const errors = [];
  for (const job of jobs) {
    try {
      const prev = job.connector || {};
      const connector = {
        ...prev,
        domain: prev.domain || sess.domain,
        cookies: sess.cookies,
        csrfToken: sess.csrfToken,
        hostId: prev.hostId || sess.hostId || '',
        hostType: prev.hostType || sess.hostType || 'Wiki',
      };
      const revive = isSessionExpiryDisabled(job);
      await req(base, `/bitable-sync/${jobId(job)}`, 'PUT', revive ? { connector, enabled: true } : { connector });
      refreshed += 1;
      if (revive) reenabled += 1;
    } catch (e) {
      errors.push(`${job.name}: ${e?.message || 'lỗi'}`);
    }
  }
  return { total: jobs.length, refreshed, reenabled, failed: errors.length, errors };
}
