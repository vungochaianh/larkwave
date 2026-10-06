/**
 * api.js — the backend calls the host makes AS THE ADMIN (the grant owner).
 *
 * Reuses the SAME delegated-grant relay the desktop app uses: the server queues the turns
 * granted users submit, the owner (here: the admin, via this host) pulls them, runs them,
 * and reports the result. No new backend endpoints — this host is just an always-on "owner".
 */
import { config } from './config.js';

let token = config.adminToken || '';

async function req(path, opts = {}) {
  return fetch(`${config.apiBase}${path}`, {
    ...opts,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
}

/** Get / refresh the admin token. Returns true when authenticated. */
export async function login() {
  if (config.adminToken) {
    token = config.adminToken;
    return true;
  }
  try {
    const r = await fetch(`${config.apiBase}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: config.adminEmail, password: config.adminPassword }),
    });
    if (!r.ok) return false;
    const j = await r.json().catch(() => ({}));
    token = j.token || j.accessToken || j.access_token || '';
    return !!token;
  } catch {
    return false;
  }
}

/** Pull whatever shared-assistant turns are queued for the admin's grants. */
export async function queuedTurns() {
  try {
    const r = await req('/me/lark-grants/queued/turns');
    if (r.status === 401) {
      token = '';
      return { auth: false, turns: [] };
    }
    if (!r.ok) return { auth: true, turns: [] };
    const arr = await r.json().catch(() => []);
    return { auth: true, turns: Array.isArray(arr) ? arr : [] };
  } catch {
    return { auth: true, turns: [] };
  }
}

/** Report a turn's progress/result back to the server (the grantee polls for it). */
export async function reportTurn(turnId, body) {
  try {
    await req(`/me/lark-grants/turns/${turnId}/report`, { method: 'POST', body: JSON.stringify(body) });
  } catch {
    /* best-effort — a failed report leaves the turn queued for a retry */
  }
}
