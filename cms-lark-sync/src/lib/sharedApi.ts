/**
 * Shared API — resources used across multiple modules (N8N, BA, etc.)
 *
 * Currently shared: Lark App credentials (used by N8N connections + BA bases)
 */

import { authHeaders } from './authKey';

// Same-origin proxy via Next.js rewrites (next.config.ts → agents-admin API)
const API_BASE = '';

// ─── Lark App Types ────────────────────────────────────────────────────

export interface LarkApp {
  _id: string;
  id?: string;
  name: string;
  lark_app_id: string;
  lark_app_secret?: string;
  description?: string;
  status: string;
  created_at?: string;
}

export interface LarkAppCreate {
  name: string;
  lark_app_id: string;
  lark_app_secret: string;
  description?: string;
}

// ─── Lark App CRUD ─────────────────────────────────────────────────────

export async function listLarkApps(): Promise<LarkApp[]> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/n8n/lark-apps`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data || [];
}

export async function createLarkApp(data: LarkAppCreate): Promise<LarkApp> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/n8n/lark-apps`, {
    method: 'POST', headers, body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data || json;
}

export async function getLarkApp(id: string, reveal = false): Promise<LarkApp> {
  const headers = await authHeaders();
  const qs = reveal ? '?reveal=true' : '';
  const res = await fetch(`${API_BASE}/api/n8n/lark-apps/${id}${qs}`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data || json;
}

export async function updateLarkApp(id: string, data: Partial<LarkApp>): Promise<LarkApp> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/n8n/lark-apps/${id}/update`, {
    method: 'POST', headers, body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data || json;
}

export async function deleteLarkApp(id: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/n8n/lark-apps/${id}/delete`, { method: 'POST', headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}
