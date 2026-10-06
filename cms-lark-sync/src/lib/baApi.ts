import { authHeaders } from './authKey';

// Same-origin proxy via Next.js rewrites (next.config.ts → /api-agents/* → agents-admin API)
const API_BASE = '';

// ─── Types ─────────────────────────────────────────────────────────────

export interface BaseReg {
  _id: string;
  id?: string;
  name: string;
  lark_app_config_id: string;
  lark_app_id: string;
  lark_app_secret: string;
  app_token: string;
  description: string;
  schedule: string;
  enabled: boolean;
  status: string;
  tables_count: number;
  fields_count: number;
  last_analysis_at: string | null;
  webhook_url?: string;
  notify_on_complete?: boolean;
  notify_on_fail?: boolean;
  notify_template?: string;
  wiki_space_id?: string;
  wiki_doc_token?: string;
  wiki_auto_publish?: boolean;
  created_at: string;
  updated_at: string;
}

export interface BaseRegCreate {
  name: string;
  lark_app_config_id?: string;
  lark_app_id?: string;
  lark_app_secret?: string;
  app_token?: string;
  description?: string;
  schedule?: string;
  enabled?: boolean;
  webhook_url?: string;
  notify_on_complete?: boolean;
  notify_on_fail?: boolean;
  notify_template?: string;
  wiki_space_id?: string;
  wiki_doc_token?: string;
  wiki_auto_publish?: boolean;
}

export interface Analysis {
  _id: string;
  id?: string;
  base_id: string;
  base_name: string;
  app_token: string;
  trigger: string;
  status: string;
  snapshot_id: string;
  chunks_analyzed: number;
  chunks_total: number;
  mermaid_erd: string;
  documentation_md: string;
  system_summary: string;
  tables_count: number;
  fields_count: number;
  started_at: string;
  finished_at: string | null;
  duration_ms: number;
  error: string;
}

export interface AnalysisStats {
  total: number;
  completed: number;
  failed: number;
  in_progress: number;
  avg_duration_ms: number;
}

export interface Snapshot {
  _id: string;
  id?: string;
  base_id: string;
  app_token: string;
  tables_count: number;
  fields_count: number;
  schema_hash: string;
  tables_summary: { table_id: string; name: string; fields_count: number }[];
  created_at: string;
}

export interface SnapshotDetail extends Snapshot {
  schema_data: {
    tables: {
      table_id: string;
      name: string;
      fields: { field_id: string; field_name: string; type: number; type_name: string; is_primary: boolean }[];
      views: { view_id: string; view_name: string }[];
    }[];
    relationships: { from_table_name: string; from_field: string; to_table_name: string; link_type: string }[];
  };
}

export interface SchemaPreview {
  app_token: string;
  tables_count: number;
  fields_count: number;
  tables: { table_id: string; name: string; fields: unknown[]; views?: { view_id: string; view_name: string; view_type: string }[] }[];
  relationships: unknown[];
  external_tables?: { table_id: string; name: string; is_external: boolean; linked_from_tables?: string[]; fields: unknown[]; fields_count: number; views?: unknown[] }[];
  external_tables_count?: number;
  workflows?: { workflow_id: string; title: string; status: string }[];
  workflows_count?: number;
  workflows_error?: string;
  automations?: { workflow_id: string; title: string; status: string }[];
  automations_count?: number;
  automations_error?: string;
}

// ─── Lark Apps — re-exported from shared ────────────────────────────

export { listLarkApps, type LarkApp } from './sharedApi';

// ─── Bases ─────────────────────────────────────────────────────────────

export async function listBases(): Promise<BaseReg[]> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/api/ba/bases`, { headers: h });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return d.data || [];
}

export async function createBase(data: BaseRegCreate): Promise<BaseReg> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/api/ba/bases`, {
    method: 'POST', headers: h, body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  const d = await res.json();
  return d.data;
}

export async function getBase(id: string, reveal = false): Promise<BaseReg> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/api/ba/bases/${id}?reveal=${reveal}`, { headers: h });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return d.data;
}

export async function updateBase(id: string, data: Partial<BaseRegCreate>): Promise<BaseReg> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/api/ba/bases/${id}/update`, {
    method: 'POST', headers: h, body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return d.data;
}

export async function deleteBase(id: string): Promise<void> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/api/ba/bases/${id}/delete`, { method: 'POST', headers: h });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function fetchBaseSchema(id: string, refresh = false): Promise<SchemaPreview & { cached?: boolean }> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/api/ba/bases/${id}/fetch-schema?refresh=${refresh}`, {
    method: 'POST', headers: h,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return { ...d.data, cached: d.cached };
}

export async function uploadSchema(id: string, file: globalThis.File): Promise<SchemaPreview> {
  const h = await authHeaders();
  // Remove Content-Type so browser sets multipart boundary
  delete (h as Record<string, string>)['Content-Type'];
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API_BASE}/api/ba/bases/${id}/upload-schema`, {
    method: 'POST', headers: h, body: fd,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  const d = await res.json();
  return d.data;
}

// ─── Analyses ──────────────────────────────────────────────────────────

export interface AnalysisConfig {
  ai_provider?: 'auto' | 'ollama' | 'claude' | 'openai';
  ai_model?: string;
  include_sample_data?: boolean;
}

export async function triggerAnalysis(baseId: string, config?: AnalysisConfig): Promise<{ analysis_id: string; status?: string; error?: string }> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/api/ba/analyses`, {
    method: 'POST', headers: h, body: JSON.stringify({
      base_id: baseId,
      ...config,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || `HTTP ${res.status}`);
  }
  const d = await res.json();
  return d.data;
}

export async function listAnalyses(baseId = '', page = 1, limit = 20): Promise<{ analyses: Analysis[]; total: number }> {
  const h = await authHeaders();
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (baseId) params.set('base_id', baseId);
  const res = await fetch(`${API_BASE}/api/ba/analyses?${params}`, { headers: h });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return { analyses: d.data || [], total: d.pagination?.total || 0 };
}

export async function getAnalysis(id: string): Promise<Analysis> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/api/ba/analyses/${id}`, { headers: h });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return d.data;
}

export async function cancelAnalysis(id: string): Promise<void> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/api/ba/analyses/${id}/cancel`, { method: 'POST', headers: h });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export interface ProgressEvent {
  event: string;
  step: string;
  detail: string;
  progress: number;
  elapsed_ms?: number;
  tables_count?: number;
  fields_count?: number;
  chunks_done?: number;
  chunks_total?: number;
  duration_ms?: number;
  system_summary?: string;
}

export function streamAnalysis(id: string, onEvent: (event: ProgressEvent) => void, onDone?: () => void): () => void {
  const es = new EventSource(`${API_BASE}/api/ba/analyses/${id}/stream`);

  const handler = (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data) as ProgressEvent;
      onEvent(data);
      if (data.event === 'completed' || data.event === 'failed') {
        es.close();
        onDone?.();
      }
    } catch { /* ignore parse errors */ }
  };

  es.addEventListener('progress', handler);
  es.addEventListener('completed', handler);
  es.addEventListener('failed', handler);
  es.onerror = () => { es.close(); onDone?.(); };

  // Return cleanup function
  return () => es.close();
}

export async function deleteAnalysis(id: string): Promise<void> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/api/ba/analyses/${id}/delete`, { method: 'POST', headers: h });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function getAnalysisStats(): Promise<AnalysisStats> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/api/ba/analyses/stats`, { headers: h });
  if (!res.ok) return { total: 0, completed: 0, failed: 0, in_progress: 0, avg_duration_ms: 0 };
  const d = await res.json();
  return d.data;
}

export async function publishToWiki(analysisId: string): Promise<{ success: boolean; doc_token?: string; error?: string }> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/api/ba/analyses/${analysisId}/publish-wiki`, {
    method: 'POST', headers: h,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  const d = await res.json();
  return d.data || d;
}

// ─── Snapshots ─────────────────────────────────────────────────────────

export async function listSnapshots(baseId: string): Promise<Snapshot[]> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/api/ba/snapshots?base_id=${baseId}`, { headers: h });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return d.data || [];
}

export async function getSnapshot(id: string): Promise<SnapshotDetail> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/api/ba/snapshots/${id}`, { headers: h });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return d.data;
}

export async function getSnapshotDiff(id: string): Promise<{ diff: { added_tables: unknown[]; removed_tables: unknown[]; modified_tables: unknown[]; has_changes: boolean } }> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/api/ba/snapshots/${id}/diff`, { headers: h });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return d.data;
}

// ─── Documents ─────────────────────────────────────────────────────────

export interface BADocument {
  id: string;
  _id: string;
  base_id: string;
  folder: string;
  filename: string;
  file_ext: string;
  file_size: number;
  version: number;
  diff_summary: string;
  uploaded_at: string;
  text_content?: string;
  author?: string;
  edit_source?: string;
  tags?: string[];
  contributor?: string;
  has_rendered_image?: boolean;
  rendered_at?: string;
}

export interface BAAnnotationReply {
  reply_id: string;
  author: string;
  content: string;
  created_at: string;
}

export interface BAAnnotation {
  id: string;
  _id: string;
  doc_id: string;
  base_id: string;
  folder: string;
  filename: string;
  quote: string;
  prefix: string;
  suffix: string;
  author: string;
  content: string;
  status: 'open' | 'resolved';
  resolved_by: string;
  resolved_at: string | null;
  replies: BAAnnotationReply[];
  created_at: string;
  updated_at: string;
}

export async function listDocuments(baseId = ''): Promise<BADocument[]> {
  const h = await authHeaders();
  const params = baseId ? `?base_id=${baseId}` : '';
  const res = await fetch(`${API_BASE}/api/ba/documents${params}`, { headers: h });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return d.data || [];
}

export async function getDocument(id: string): Promise<BADocument> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/api/ba/documents/${id}`, { headers: h });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return d.data;
}

export async function uploadDocument(file: globalThis.File, baseId = '', folder = ''): Promise<BADocument> {
  const h = await authHeaders();
  delete (h as Record<string, string>)['Content-Type'];
  const fd = new FormData();
  fd.append('file', file);
  const params = new URLSearchParams();
  if (baseId) params.set('base_id', baseId);
  if (folder) params.set('folder', folder);
  const qs = params.toString() ? `?${params}` : '';
  const res = await fetch(`${API_BASE}/api/ba/documents/upload${qs}`, {
    method: 'POST', headers: h, body: fd,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  const d = await res.json();
  return d.data;
}

export function getDocumentDownloadUrl(id: string): string {
  return `${API_BASE}/api/ba/documents/${id}/download`;
}

export async function getDocumentDiff(id: string, compareToId?: string): Promise<{ has_diff: boolean; lines: string[] }> {
  const h = await authHeaders();
  const params = compareToId ? `?compare_to=${compareToId}` : '';
  const res = await fetch(`${API_BASE}/api/ba/documents/${id}/diff${params}`, { headers: h });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return d.data;
}

export async function deleteDocument(id: string): Promise<void> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/api/ba/documents/${id}/delete`, { method: 'POST', headers: h });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function saveDocumentEdit(docId: string, textContent: string, author: string): Promise<BADocument> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/api/ba/documents/save-edit`, {
    method: 'POST', headers: h, body: JSON.stringify({ doc_id: docId, text_content: textContent, author }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  const d = await res.json();
  return d.data;
}

export async function listDocumentVersions(baseId: string, folder: string, filename: string): Promise<BADocument[]> {
  const h = await authHeaders();
  const params = new URLSearchParams({ base_id: baseId, folder, filename });
  const res = await fetch(`${API_BASE}/api/ba/documents/versions?${params}`, { headers: h });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return d.data || [];
}

// ─── Rendered Image Cache ─────────────────────────────────────────────

export interface RenderedImageData {
  image_base64: string;
  content_type: string;
  size: number;
  rendered_at: string;
}

export async function getRenderedImage(docId: string): Promise<RenderedImageData | null> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/api/ba/documents/${docId}/rendered-image`, { headers: h });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return d.data || null;
}

export function getRenderedImageRawUrl(docId: string): string {
  return `${API_BASE}/api/ba/documents/${docId}/rendered-image/raw`;
}

export async function uploadRenderedSvg(docId: string, svg: string): Promise<void> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/api/ba/documents/${docId}/rendered-image/upload-svg`, {
    method: 'POST', headers: h, body: JSON.stringify({ svg }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
}

export async function deleteRenderedImage(docId: string): Promise<void> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/api/ba/documents/${docId}/rendered-image/delete`, { method: 'POST', headers: h });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// ─── Annotations ──────────────────────────────────────────────────────

export async function listAnnotations(baseId: string, folder: string, filename: string, status = 'all'): Promise<BAAnnotation[]> {
  const h = await authHeaders();
  const params = new URLSearchParams({ base_id: baseId, folder, filename, status });
  const res = await fetch(`${API_BASE}/api/ba/annotations?${params}`, { headers: h });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return d.data || [];
}

export async function createAnnotation(data: {
  doc_id: string; base_id: string; folder: string; filename: string;
  quote: string; prefix: string; suffix: string; author: string; content: string;
}): Promise<BAAnnotation> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/api/ba/annotations`, {
    method: 'POST', headers: h, body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  const d = await res.json();
  return d.data;
}

export async function addAnnotationReply(annotationId: string, author: string, content: string): Promise<BAAnnotation> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/api/ba/annotations/${annotationId}/reply`, {
    method: 'POST', headers: h, body: JSON.stringify({ author, content }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return d.data;
}

export async function resolveAnnotation(annotationId: string, resolved: boolean, author: string): Promise<void> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/api/ba/annotations/${annotationId}/resolve`, {
    method: 'POST', headers: h, body: JSON.stringify({ resolved, author }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function deleteAnnotation(annotationId: string): Promise<void> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/api/ba/annotations/${annotationId}/delete`, { method: 'POST', headers: h });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// ─── Staging & Commits ────────────────────────────────────────────────

export interface StagedChange {
  action: 'edit' | 'rename' | 'delete' | 'create';
  doc_id?: string;
  filename?: string;
  folder?: string;
  new_filename?: string;
  new_folder?: string;
  text_content?: string;
}

export interface BACommit {
  id: string;
  _id: string;
  base_id: string;
  message: string;
  author: string;
  changes: { action: string; filename?: string; folder?: string; old_path?: string; new_path?: string; diff_summary?: string }[];
  files_changed: number;
  created_at: string;
}

export async function renameDocument(docId: string, newFilename?: string, newFolder?: string): Promise<BADocument> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/api/ba/documents/${docId}/rename`, {
    method: 'POST', headers: h, body: JSON.stringify({ doc_id: docId, new_filename: newFilename, new_folder: newFolder }),
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || `HTTP ${res.status}`); }
  const d = await res.json();
  return d.data;
}

export async function createCommit(baseId: string, message: string, author: string, changes: StagedChange[]): Promise<BACommit> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/api/ba/commits`, {
    method: 'POST', headers: h, body: JSON.stringify({ base_id: baseId, message, author, changes }),
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || `HTTP ${res.status}`); }
  const d = await res.json();
  return d.data;
}

export async function listCommits(baseId: string, page = 1, limit = 20): Promise<{ commits: BACommit[]; total: number }> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/api/ba/commits?base_id=${baseId}&page=${page}&limit=${limit}`, { headers: h });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return { commits: d.data || [], total: d.total || 0 };
}

// ─── Tags ────────────────────────────────────────────────────────────

export interface BATag {
  id: string;
  name: string;
  color: string;
  description: string;
  category: 'general' | 'contributor' | 'status' | 'custom';
}

export async function listTags(): Promise<BATag[]> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/api/ba/tags`, { headers: h });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return d.data || [];
}

export async function createTag(data: { name: string; color?: string; description?: string; category?: string }): Promise<BATag> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/api/ba/tags`, { method: 'POST', headers: h, body: JSON.stringify(data) });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || `HTTP ${res.status}`); }
  const d = await res.json();
  return d.data;
}

export async function updateTag(id: string, data: { name?: string; color?: string; description?: string; category?: string }): Promise<BATag> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/api/ba/tags/${id}/update`, { method: 'POST', headers: h, body: JSON.stringify(data) });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || `HTTP ${res.status}`); }
  const d = await res.json();
  return d.data;
}

export async function deleteTag(id: string): Promise<void> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/api/ba/tags/${id}/delete`, { method: 'POST', headers: h });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// ─── Batch Upload ────────────────────────────────────────────────────

export interface BatchUploadResult {
  uploaded: number;
  documents: { id: string; filename: string; folder: string; version: number; diff_summary: string }[];
  commit_id: string;
}

export async function batchUploadDocuments(
  baseId: string, documents: { filename: string; folder: string; content: string; tags?: string[] }[],
  contributor = 'user', tags: string[] = [], commitMessage = '',
): Promise<BatchUploadResult> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/api/ba/documents/batch-upload`, {
    method: 'POST', headers: h,
    body: JSON.stringify({ base_id: baseId, documents, contributor, tags, commit_message: commitMessage }),
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || `HTTP ${res.status}`); }
  return await res.json();
}

// ─── Push to Lark DocX ──────────────────────────────────────────────

export async function pushDocToLark(docId: string): Promise<{ wiki_doc_url: string; blocks_inserted: number }> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/api/ba/documents/${docId}/push-to-lark`, {
    method: 'POST', headers: h,
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || `HTTP ${res.status}`); }
  return (await res.json()).data;
}

export async function pushAllDocsToLark(baseId: string): Promise<{ wiki_doc_url: string; docs_pushed: number }> {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}/api/ba/bases/${baseId}/push-all-to-lark`, {
    method: 'POST', headers: h,
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || `HTTP ${res.status}`); }
  return (await res.json()).data;
}

