import { getApiKey, getApiKeySync, authHeaders, authHeadersNoContentType } from './authKey';
export { authHeaders };

// Same-origin proxy via Next.js rewrites (next.config.ts → agents-admin API)
const API_BASE = '';

// ─── Types ─────────────────────────────────────────────────────────────

export interface Sheet {
  name: string;
  columns: Column[];
  header_row: number;
  group_row?: number;
  data_start_row: number;
  total_rows?: number;
  total_cols?: number;
}

export interface Column {
  letter: string;
  index: number;
  header: string;
  group?: string;
  has_formula: boolean;
  formula_pattern?: string;
}

export interface Template {
  id: string;
  _id?: string;
  name: string;
  description: string;
  filename: string;
  original_filename: string;
  stored_filename: string;
  file_id: string;
  file_size: number;
  parsed: { sheets: Sheet[] };
  parsed_sheets?: Sheet[];
  status: string;
  created_at: string;
}

/** Get the usable ID from a template (backend returns 'id', not '_id') */
export function templateId(t: Template): string {
  return t._id || t.id || '';
}

export interface LarkField {
  field_id: string;
  field_name: string;
  type: number;
  type_name: string;
  is_primary: boolean;
  // legacy aliases
  field_type?: number;
  field_type_label?: string;
}

export interface Connection {
  _id: string;
  id?: string;
  name: string;
  lark_app_id: string;
  app_token: string;
  table_id: string;
  cached_fields: LarkField[];
  status: string;
  created_at?: string;
}

export interface ConnectionCreate {
  name: string;
  lark_app_id: string;
  lark_app_secret: string;
  app_token: string;
  table_id: string;
}

export interface FieldMap {
  lark_field: string;
  excel_column: string;
  excel_header: string;
  map_type: string;
  expression: string | null;
  scope: string;
}

export interface Mapping {
  _id: string;
  name: string;
  connection_id: string;
  template_id: string;
  target_sheet: string;
  field_maps: FieldMap[];
  created_at?: string;
}

export interface MappingCreate {
  name: string;
  connection_id: string;
  template_id: string;
  target_sheet: string;
  field_maps: FieldMap[];
}

export interface FilterCondition {
  field: string;
  operator: string;
  value: string;
  value_from_field?: string;
}

export interface RuleTrigger {
  type: string;
  filter_field: string;
  filter_value: string;
  filter_value_from_field?: string;
  filters: FilterCondition[];
  group_by_field: string;
}

export interface RuleOutput {
  type: string;
  lark_webhook_url: string;
  include_pdf: boolean;
}

export interface Rule {
  _id: string;
  name: string;
  connection_id: string;
  template_id: string;
  mapping_id: string;
  trigger: RuleTrigger;
  output: RuleOutput;
  debounce_seconds: number;
  enabled: boolean;
  created_at?: string;
}

export interface RuleCreate {
  name: string;
  connection_id: string;
  template_id: string;
  mapping_id: string;
  trigger: RuleTrigger;
  output: RuleOutput;
  debounce_seconds: number;
  enabled: boolean;
}

export interface Step {
  step: string;
  status: string;
  duration_ms: number;
  error: string | null;
}

export interface Execution {
  _id: string;
  rule_id: string;
  rule_name: string;
  group_key: string;
  steps: Step[];
  records_count: number;
  success: boolean;
  started_at: string;
  duration_ms?: number;
}

export interface ExecutionStats {
  total: number;
  success: number;
  failed: number;
  today: number;
  avg_duration_ms: number;
}

// ─── Templates ─────────────────────────────────────────────────────────

/** Parse xlsx with full styles via backend (openpyxl). Returns fortune-sheet compatible data. */
export async function parseXlsxWithStyles(file: File): Promise<unknown[]> {
  const headers = await authHeadersNoContentType();
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/api/n8n/templates/parse-xlsx`, {
    method: 'POST', headers, body: formData,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.data || [];
}

/** Patch cells in original xlsx — preserves formulas, merged cells, styles. */
export async function patchTemplateCells(
  templateId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sheets: any[],
  deleteSheets?: string[],
): Promise<{ patched_cells: number; deleted_sheets: string[] }> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/n8n/templates/${templateId}/patch`, {
    method: 'POST', headers,
    body: JSON.stringify({ sheets, delete_sheets: deleteSheets || [] }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.data;
}

/** Save Fortune Sheet data → xlsx (create new or overwrite existing template). */
export async function saveTemplateXlsx(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sheets: any[],
  templateId?: string,
  description?: string,
): Promise<{ id: string; name: string }> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/n8n/templates/create-xlsx`, {
    method: 'POST', headers,
    body: JSON.stringify({ name, sheets, template_id: templateId || '', description: description || '' }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.data;
}

export async function listTemplates(): Promise<Template[]> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/n8n/templates`, { headers, cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.data || [];
}

export async function uploadTemplate(file: File, name: string, description: string): Promise<Template> {
  const headers = await authHeadersNoContentType();
  const formData = new FormData();
  formData.append('file', file);
  formData.append('name', name);
  formData.append('description', description);
  const res = await fetch(`${API_BASE}/api/n8n/templates`, {
    method: 'POST',
    headers,
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.detail || `HTTP ${res.status}`);
  }
  const d = await res.json();
  return d.data || d;
}

export async function getTemplate(id: string): Promise<Template> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/n8n/templates/${id}`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return d.data || d;
}

export async function updateTemplate(id: string, data: Partial<Template>): Promise<Template> {
  const res = await fetch(`${API_BASE}/api/n8n/templates/${id}/update`, {
    method: 'POST', headers: await authHeaders(), body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Update failed');
  const d = await res.json();
  return d.data || d;
}

export async function seedHoadonTemplate(): Promise<Template> {
  const res = await fetch(`${API_BASE}/api/n8n/templates/seed-hoadon`, {
    method: 'POST', headers: await authHeaders(),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Seed failed');
  const d = await res.json();
  return d.data || d;
}

export async function deleteTemplate(id: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/n8n/templates/${id}/delete`, { method: 'POST', headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function downloadTemplateUrl(id: string): Promise<string> {
  const key = await getApiKey();
  return `${API_BASE}/api/n8n/templates/${id}/download${key ? `?api_key=${key}` : ''}`;
}

/** Sync version for href attributes (uses cached key) */
export function downloadTemplateUrlSync(id: string): string {
  const k = getApiKeySync();
  return `${API_BASE}/api/n8n/templates/${id}/download${k ? `?api_key=${k}` : ''}`;
}

const WEBHOOK_BASE_API = process.env.NEXT_PUBLIC_WEBHOOK_BASE || 'https://agents-lark-webhooks.toolswave.net';

/** Get PDF download URL for a template (converted via webhook service) */
export function downloadTemplatePdfUrl(id: string): string {
  return `${WEBHOOK_BASE_API}/template-pdf/${id}`;
}

/** Load stored Fortune Sheet state from MongoDB (single source of truth).
 *  Falls back to re-parsing xlsx on the server if no stored state exists. */
export async function getTemplateSheets(id: string): Promise<unknown[]> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/n8n/templates/${id}/sheets`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.data || [];
}

// ─── Lark Apps — re-exported from shared ────────────────────────────

export {
  listLarkApps, createLarkApp, getLarkApp, updateLarkApp, deleteLarkApp,
  type LarkApp, type LarkAppCreate,
} from './sharedApi';

// ─── Connections ────────────────────────────────────────────────────────

export async function listConnections(): Promise<Connection[]> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/n8n/connections`, { headers, cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.data || [];
}

export async function createConnection(data: ConnectionCreate): Promise<Connection> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/n8n/connections`, {
    method: 'POST', headers, body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.detail || `HTTP ${res.status}`);
  }
  const d = await res.json();
  return d.data || d;
}

export async function testConnection(data: ConnectionCreate): Promise<{ fields: LarkField[] }> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/n8n/connections/test`, {
    method: 'POST', headers, body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.detail || `HTTP ${res.status}`);
  }
  const json = await res.json();
  return json.data || json;
}

export async function refreshFields(id: string): Promise<{ fields: LarkField[] }> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/n8n/connections/${id}/refresh-fields`, {
    method: 'POST', headers,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data || json;
}

/** Get single connection — reveal=true returns unmasked secrets for editing */
export async function getConnection(id: string, reveal = false): Promise<Connection> {
  const headers = await authHeaders();
  const qs = reveal ? '?reveal=true' : '';
  const res = await fetch(`${API_BASE}/api/n8n/connections/${id}${qs}`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data || json;
}

export async function updateConnection(id: string, data: Partial<Connection>): Promise<Connection> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/n8n/connections/${id}/update`, {
    method: 'POST', headers, body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return d.data || d;
}

export async function deleteConnection(id: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/n8n/connections/${id}/delete`, { method: 'POST', headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function sampleRecords(connectionId: string, limit = 5): Promise<Record<string, unknown>[]> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/n8n/connections/${connectionId}/sample-records?limit=${limit}`, {
    method: 'POST', headers,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.data?.records || [];
}

// ─── Mappings ───────────────────────────────────────────────────────────

export async function listMappings(): Promise<Mapping[]> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/n8n/mappings`, { headers, cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.data || [];
}

export async function createMapping(data: MappingCreate): Promise<Mapping> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/n8n/mappings`, {
    method: 'POST', headers, body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.detail || `HTTP ${res.status}`);
  }
  const d = await res.json();
  return d.data || d;
}

export async function getMapping(id: string): Promise<Mapping> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/n8n/mappings/${id}`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return d.data || d;
}

export async function updateMapping(id: string, data: Partial<Mapping>): Promise<Mapping> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/n8n/mappings/${id}/update`, {
    method: 'POST', headers, body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return d.data || d;
}

export async function deleteMapping(id: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/n8n/mappings/${id}/delete`, { method: 'POST', headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// ─── Rules ──────────────────────────────────────────────────────────────

export async function listRules(): Promise<Rule[]> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/n8n/rules`, { headers, cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.data || [];
}

export async function createRule(data: RuleCreate): Promise<Rule> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/n8n/rules`, {
    method: 'POST', headers, body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.detail || `HTTP ${res.status}`);
  }
  const d = await res.json();
  return d.data || d;
}

export async function getRule(id: string): Promise<Rule> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/n8n/rules/${id}`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return d.data || d;
}

export async function updateRule(id: string, data: Partial<Rule>): Promise<Rule> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/n8n/rules/${id}/update`, {
    method: 'POST', headers, body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return d.data || d;
}

export async function toggleRule(id: string): Promise<Rule> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/n8n/rules/${id}/toggle`, {
    method: 'POST', headers,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return d.data || d;
}

export async function deleteRule(id: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/n8n/rules/${id}/delete`, { method: 'POST', headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// ─── Executions ─────────────────────────────────────────────────────────

export async function listExecutions(page = 1, limit = 20): Promise<{ executions: Execution[]; total: number }> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/n8n/executions?page=${page}&limit=${limit}`, { headers, cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return {
    executions: data.executions || data.data || [],
    total: data.total || data.pagination?.total || 0,
  };
}

export async function getExecution(id: string): Promise<Execution> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/n8n/executions/${id}`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return d.data || d;
}

export async function deleteExecution(id: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/n8n/executions/${id}/delete`, { method: 'POST', headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function getExecutionStats(): Promise<ExecutionStats> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/n8n/executions/stats`, { headers, cache: 'no-store' });
  if (!res.ok) return { total: 0, success: 0, failed: 0, today: 0, avg_duration_ms: 0 };
  const data = await res.json();
  // Backend may wrap in { data: {...} } or return flat
  return data.data || data;
}
