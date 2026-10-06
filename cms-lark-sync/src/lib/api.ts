import axios, { type AxiosError } from 'axios'
import type { ApiResp, CurlJob, ExecutionLog, BitableSyncJob, BitableSyncResult, BitableSyncLog } from './types'

// Configured via NEXT_PUBLIC_API_BASE in .env; falls back to production URL
const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE || 'https://apihoanam.toolswave.net/api'

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
})

// ── Response interceptor: normalise errors ────────────────────────────────
api.interceptors.response.use(
  (res) => res,
  (err: AxiosError<{ error?: string; message?: string }>) => {
    const serverMsg =
      err.response?.data?.error ??
      err.response?.data?.message ??
      err.message ??
      'Unknown error'
    return Promise.reject(new Error(serverMsg))
  },
)

// ── Jobs ──────────────────────────────────────────────────────────────────

export async function getJobs(params?: {
  search?: string
  enabled?: boolean
  sortBy?: string
  order?: 'asc' | 'desc'
}): Promise<ApiResp<CurlJob[]>> {
  const { data } = await api.get('/jobs', { params })
  return data
}

export async function getJob(id: string): Promise<ApiResp<CurlJob>> {
  const { data } = await api.get(`/jobs/${id}`)
  return data
}

export async function createJob(payload: {
  name: string
  description?: string
  curlCommand: string
  intervalMinutes: number
  enabled?: boolean
}): Promise<ApiResp<CurlJob>> {
  const { data } = await api.post('/jobs', payload)
  return data
}

export async function updateJob(
  id: string,
  payload: Partial<{
    name: string
    description: string
    curlCommand: string
    intervalMinutes: number
    enabled: boolean
  }>,
): Promise<ApiResp<CurlJob>> {
  const { data } = await api.put(`/jobs/${id}`, payload)
  return data
}

export async function deleteJob(
  id: string,
  deleteLogs = false,
): Promise<ApiResp<null>> {
  const { data } = await api.delete(`/jobs/${id}`, {
    params: { deleteLogs: deleteLogs ? 'true' : 'false' },
  })
  return data
}

export async function toggleJob(id: string): Promise<ApiResp<CurlJob>> {
  const { data } = await api.patch(`/jobs/${id}/toggle`)
  return data
}

export async function executeJob(id: string): Promise<ApiResp<ExecutionLog>> {
  const { data } = await api.post(`/jobs/${id}/execute`)
  return data
}

export async function getJobStats(id: string): Promise<ApiResp<{
  totalExecutions: number
  successCount: number
  errorCount: number
  successRate: string
  avgExecutionTime: string
}>> {
  const { data } = await api.get(`/jobs/${id}/stats`)
  return data
}

// ── Logs ──────────────────────────────────────────────────────────────────

export async function getLogs(params?: {
  page?: number
  limit?: number
  status?: 'success' | 'error'
  jobId?: string
  sortBy?: string
  order?: 'asc' | 'desc'
}): Promise<ApiResp<ExecutionLog[]>> {
  const { data } = await api.get('/logs', { params })
  return data
}

export async function getJobLogs(
  id: string,
  params?: { page?: number; limit?: number },
): Promise<ApiResp<ExecutionLog[]>> {
  const { data } = await api.get(`/jobs/${id}/logs`, { params })
  return data
}

// ── Quick Send (direct HTTP from browser) ────────────────────────────────

export type QuickSendInput = {
  method: string
  url: string
  headers: { key: string; value: string }[]
  body?: string
}

export type QuickSendResult = {
  ok: boolean
  status: number
  statusText: string
  data: unknown
  durationMs: number
}

/**
 * Send a request directly from the browser without going through the backend.
 * Useful for previewing what a curl job will do.
 */
export async function quickSend(input: QuickSendInput): Promise<QuickSendResult> {
  const headers: Record<string, string> = {}
  for (const h of input.headers) {
    if (h.key?.trim()) headers[h.key.trim()] = h.value ?? ''
  }

  const t0 = performance.now()
  const res = await fetch(input.url, {
    method: input.method,
    headers,
    body: input.body?.trim() || undefined,
    // Note: no credentials / cookies forwarded — browser security applies
  })

  const durationMs = Math.round(performance.now() - t0)
  let data: unknown
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('json')) {
    data = await res.json().catch(() => null)
  } else {
    data = await res.text().catch(() => '')
  }

  return { ok: res.ok, status: res.status, statusText: res.statusText, data, durationMs }
}

// ── Log deletion ──────────────────────────────────────────────────────────────

export async function deleteLog(id: string): Promise<ApiResp<{ deletedCount: number }>> {
  const { data } = await api.delete(`/logs/${id}`)
  return data
}

export async function deleteLogs(ids: string[]): Promise<ApiResp<{ deletedCount: number }>> {
  const { data } = await api.delete('/logs', { data: { ids } })
  return data
}

export async function deleteAllLogs(jobId?: string): Promise<ApiResp<{ deletedCount: number }>> {
  const { data } = await api.delete('/logs/all', { params: jobId ? { jobId } : undefined })
  return data
}

export async function cleanupLogs(days = 7): Promise<ApiResp<{ deletedCount: number }>> {
  const { data } = await api.delete('/logs/cleanup', { params: { days } })
  return data
}

// ── Bitable Sync ─────────────────────────────────────────────────────────────

export async function getBitableSyncs(params?: {
  search?: string
  enabled?: boolean
}): Promise<ApiResp<BitableSyncJob[]>> {
  const { data } = await api.get('/bitable-sync', { params })
  return data
}

export async function getBitableSync(id: string): Promise<ApiResp<BitableSyncJob>> {
  const { data } = await api.get(`/bitable-sync/${id}`)
  return data
}

export async function createBitableSync(payload: {
  name: string
  description?: string
  accountId?: string | null
  appToken: string
  tableId: string
  viewId?: string
  intervalSeconds?: number
  enabled?: boolean
  webhookUrl?: string
  notify?: BitableSyncJob['notify']
}): Promise<ApiResp<BitableSyncJob>> {
  const { data } = await api.post('/bitable-sync', payload)
  return data
}

export async function updateBitableSync(
  id: string,
  payload: Partial<{
    name: string
    description: string
    accountId: string | null
    appToken: string
    tableId: string
    viewId: string
    intervalSeconds: number
    enabled: boolean
    webhookUrl: string
    notify: BitableSyncJob['notify']
  }>,
): Promise<ApiResp<BitableSyncJob>> {
  const { data } = await api.put(`/bitable-sync/${id}`, payload)
  return data
}

export async function deleteBitableSync(id: string): Promise<ApiResp<null>> {
  const { data } = await api.delete(`/bitable-sync/${id}`)
  return data
}

export async function toggleBitableSync(id: string): Promise<ApiResp<BitableSyncJob>> {
  const { data } = await api.patch(`/bitable-sync/${id}/toggle`)
  return data
}

export async function executeBitableSync(id: string): Promise<ApiResp<BitableSyncResult>> {
  const { data } = await api.post(`/bitable-sync/${id}/execute`)
  return data
}

export async function getBitableSyncSnapshot(id: string): Promise<ApiResp<{
  recordCount: number
  recordIds: string[]
  lastSyncAt: string | null
  lastSyncStats: BitableSyncJob['lastSyncStats']
}>> {
  const { data } = await api.get(`/bitable-sync/${id}/snapshot`)
  return data
}

export async function getBitableSyncLogs(
  syncId: string,
  params?: { page?: number; limit?: number; status?: string },
): Promise<ApiResp<BitableSyncLog[]>> {
  const { data } = await api.get(`/bitable-sync/${syncId}/logs`, { params })
  return data
}

export async function getAllBitableSyncLogs(
  params?: { page?: number; limit?: number; status?: string; syncId?: string },
): Promise<ApiResp<BitableSyncLog[]>> {
  const { data } = await api.get('/bitable-sync/logs/all', { params })
  return data
}

export async function deleteBitableSyncLog(logId: string): Promise<ApiResp<null>> {
  const { data } = await api.delete(`/bitable-sync/logs/${logId}`)
  return data
}

export async function deleteBitableSyncJobLogs(syncId: string): Promise<ApiResp<{ deletedCount: number }>> {
  const { data } = await api.delete(`/bitable-sync/${syncId}/logs`)
  return data
}

export async function parseSyncCurl(curl: string): Promise<ApiResp<{
  domain: string
  docToken: string
  tableIds: string[]
  cookies: string
  csrfToken: string
  hostId: string
  hostType: string
}>> {
  const { data } = await api.post('/bitable-sync/parse-curl', { curl })
  return data
}

export async function resolveBitableUrl(
  url: string,
  userToken?: string,
  accountId?: string,
): Promise<ApiResp<{
  appToken: string
  tableId: string
  viewId: string
  source: 'base_url' | 'wiki_resolved'
  nodeToken?: string
  title?: string
}>> {
  const { data } = await api.post('/bitable-sync/resolve-url', {
    url,
    ...(userToken ? { userToken } : {}),
    ...(accountId ? { accountId } : {}),
  })
  return data
}

// ── Lark API (all Lark logic lives in api-lark-all backend) ──────────────────
//
// The frontend calls the Express backend directly.
// CORS on the backend is set to ALLOWED_ORIGIN (defaults to "*") so this works
// in both dev (localhost:8080 → localhost:3000) and production.
//
// Base URL derived from NEXT_PUBLIC_API_BASE:
//   http://localhost:3000/api  →  http://localhost:3000/api-base/lark/v2
//   https://apihoanam.toolswave.net/api  →  https://apihoanam.toolswave.net/api-base/lark/v2

export const LARK_V2_BASE_URL: string = (() => {
  try {
    const origin = new URL(
      process.env.NEXT_PUBLIC_API_BASE || 'https://apihoanam.toolswave.net/api',
    ).origin
    return `${origin}/api-base/lark/v2`
  } catch {
    return 'https://apihoanam.toolswave.net/api-base/lark/v2'
  }
})()

const larkApi = axios.create({
  baseURL: LARK_V2_BASE_URL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
})

// Auto-inject Lark user token from localStorage on every request.
// This ensures any page that calls a Lark API works even if setLarkToken()
// was never explicitly called in the current session.
larkApi.interceptors.request.use((config) => {
  if (!config.headers['Authorization'] && typeof window !== 'undefined') {
    const token = localStorage.getItem('lark_user_token')
    if (token) config.headers['Authorization'] = `Bearer ${token}`
  }
  return config
})

larkApi.interceptors.response.use(
  (res) => res,
  (err: AxiosError<{ error?: string; message?: string; lark?: { code?: number; msg?: string } }>) => {
    // Try to surface the real Lark error message from the backend response
    const serverMsg =
      err.response?.data?.error ??
      err.response?.data?.message ??
      err.message ??
      'Unknown error'
    const larkCode = err.response?.data?.lark?.code
    const detail   = larkCode ? ` (Lark code ${larkCode})` : ''
    return Promise.reject(new Error(serverMsg + detail))
  },
)

/** Set the Lark user OAuth token for subsequent user-level API calls. */
export function setLarkToken(token: string) {
  larkApi.defaults.headers.common['Authorization'] = `Bearer ${token}`
}

// ── Tenant token (app-level) ──────────────────────────────────────────────────

export async function getTenantToken(): Promise<{ code: number; token?: string; expire_in?: number }> {
  const { data } = await larkApi.get('/tenant-token')
  return data
}

export async function refreshTenantToken(appId: string, appSecret: string): Promise<{ code: number; token?: string; expire_in?: number }> {
  const { data } = await larkApi.post('/tenant-token', { appId, appSecret })
  return data
}

// ── Workspace users ───────────────────────────────────────────────────────────

export async function getLarkWorkspaceUsers(appId: string, appSecret: string): Promise<any[]> {
  const { data } = await larkApi.post('/users', { appId, appSecret })
  return data
}

// ── Contact (tenant-level — pass tenant token explicitly) ─────────────────────

export async function getLarkScopes(tenantToken: string): Promise<any> {
  const { data } = await larkApi.get('/scopes', {
    headers: { Authorization: `Bearer ${tenantToken}` },
  })
  return data
}

export async function getDepartmentUsers(tenantToken: string, departmentId: string): Promise<any> {
  const { data } = await larkApi.get('/department-users', {
    params:  { department_id: departmentId },
    headers: { Authorization: `Bearer ${tenantToken}` },
  })
  return data
}

// ── OAuth ────────────────────────────────────────────────────────────────────

export async function getLarkOAuthUrl(params: {
  appId: string
  redirectUri: string
  state?: string
}): Promise<{ success: boolean; url: string }> {
  const { data } = await larkApi.get('/oauth/url', { params })
  return data
}

export async function exchangeLarkOAuthToken(params: {
  code: string
  appId: string
  appSecret: string
}): Promise<{
  success: boolean
  data: { accessToken: string; refreshToken: string; expiresIn: number; name: string; avatarUrl: string; openId: string }
}> {
  const { data } = await larkApi.post('/oauth/token', params)
  return data
}

// ── Bitable bases / tables / fields ──────────────────────────────────────────

export async function getLarkBases(params?: { folderToken?: string }): Promise<{
  success: boolean
  data: { appToken: string; name: string; url: string; createdTime?: number; modifiedTime?: number }[]
  total: number
}> {
  const { data } = await larkApi.get('/bases', { params })
  return data
}

export async function getLarkTables(appToken: string): Promise<{
  success: boolean
  data: { tableId: string; name: string }[]
}> {
  const { data } = await larkApi.get(`/bases/${appToken}/tables`)
  return data
}

export async function getLarkFields(appToken: string, tableId: string): Promise<{
  success: boolean
  data: { fieldId: string; name: string; type: number; typeName: string; isPrimary: boolean; description: string; property: any }[]
}> {
  const { data } = await larkApi.get(`/bases/${appToken}/tables/${tableId}/fields`)
  return data
}

export async function updateLarkField(
  appToken: string, tableId: string, fieldId: string,
  payload: { name?: string; description?: string; property?: any },
): Promise<{ success: boolean; data: any }> {
  const { data } = await larkApi.put(`/bases/${appToken}/tables/${tableId}/fields/${fieldId}`, payload)
  return data
}

export async function createLarkBase(payload: {
  name: string
  folderToken?: string
}): Promise<{ success: boolean; data: { appToken: string; name: string; url: string } }> {
  const { data } = await larkApi.post('/bases', payload)
  return data
}

export type SchemaField = {
  name: string
  type: number
  description?: string
  isPrimary?: boolean
  /** Select options — for Single/Multi select (type 3/4). Backend seeds Lark option list. */
  options?: string[]
  /** Link target table NAME — for OneWayLink (type 18). Backend resolves to table_id. */
  linkTable?: string
}

export type SchemaTable = {
  name: string
  fields: SchemaField[]
}

export type BuildSchemaResult = {
  success: boolean
  error?: string
  data: {
    appToken: string
    url: string | null
    name?: string
    tables: { tableId: string; name: string; fieldCount: number }[]
    fieldResults: { field: string; table: string; success?: boolean; error?: string }[]
  }
}

export async function createLarkBaseFromSchema(payload: {
  name?: string
  tables: SchemaTable[]
  folderToken?: string
  /** If set: add tables to this existing base instead of creating a new one. */
  targetAppToken?: string
  /** Pre-existing table name → tableId for link field resolution across source bases. */
  linkMap?: Record<string, string>
}): Promise<BuildSchemaResult> {
  const { data } = await larkApi.post('/bases/build-from-schema', payload)
  return data
}

/**
 * Build a Lark Bitable base from a schema using the local Next.js route.
 *
 * This calls /api/lark/build-schema which implements the Lark API correctly:
 *  - field_name key (not name)
 *  - property.options objects for select fields
 *  - two-pass link field creation (needs all table IDs first)
 *  - 350ms delays to respect the 10 req/sec field-creation rate limit
 *  - deletes the auto-created default table after our tables exist
 */
export async function buildLarkSchema(payload: {
  name?:           string
  tables:          SchemaTable[]
  folderToken?:    string
  targetAppToken?: string
  linkMap?:        Record<string, string>
  userToken:       string   // lark user_access_token
}): Promise<BuildSchemaResult> {
  const { userToken, ...rest } = payload
  const { data } = await axios.post('/api/lark/build-schema', rest, {
    headers: {
      Authorization:  `Bearer ${userToken}`,
      'Content-Type': 'application/json',
    },
    timeout: 120_000,  // schema creation can take 30-60 s for large schemas
  })
  return data
}

export async function batchUpdateLarkFields(
  appToken: string, tableId: string,
  updates: { fieldId: string; name?: string; description?: string; property?: any }[],
): Promise<{ success: boolean; results: any[] }> {
  const { data } = await larkApi.put(`/bases/${appToken}/tables/${tableId}/fields`, { updates })
  return data
}

// ── Bitable records ───────────────────────────────────────────────────────────

export async function getAllBitableRecords(
  token: string, appToken: string, tableId: string, viewId?: string,
): Promise<{ items: any[] }> {
  const { data } = await larkApi.post('/records', { token, appToken, tableId, viewId })
  return data
}

// ── Bitable Search & Batch operations ─────────────────────────────────────────

export type SearchFilter = {
  conjunction: 'and' | 'or'
  conditions: {
    field_name: string
    operator: 'is' | 'isNot' | 'contains' | 'doesNotContain' | 'isEmpty' | 'isNotEmpty' | 'isGreater' | 'isGreaterEqual' | 'isLess' | 'isLessEqual'
    value?: string[]
  }[]
}

export async function searchBitableRecords(params: {
  appToken: string
  tableId: string
  filter?: SearchFilter
  sort?: { field_name: string; desc?: boolean }[]
  field_names?: string[]
  view_id?: string
  automatic_fields?: boolean
  page_size?: number
  page_token?: string
  fetchAll?: boolean
}): Promise<{
  success: boolean
  data: any[]
  has_more?: boolean
  page_token?: string | null
  total: number
  error?: string
}> {
  const { data } = await larkApi.post('/records/search', params)
  return data
}

export async function batchCreateRecords(params: {
  appToken: string
  tableId: string
  records: { fields: Record<string, any> }[]
  client_token?: string
}): Promise<{ success: boolean; data: any[]; count: number; error?: string }> {
  const { data } = await larkApi.post('/records/batch-create', params)
  return data
}

export async function batchUpdateRecords(params: {
  appToken: string
  tableId: string
  records: { record_id: string; fields: Record<string, any> }[]
}): Promise<{ success: boolean; data: any[]; count: number; error?: string }> {
  const { data } = await larkApi.post('/records/batch-update', params)
  return data
}

export async function batchDeleteRecords(params: {
  appToken: string
  tableId: string
  record_ids: string[]
}): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  const { data } = await larkApi.post('/records/batch-delete', params)
  return data
}

// ── Notifications ─────────────────────────────────────────────────────────────

export type TelegramBot = {
  id:       string
  name:     string
  botToken: string   // masked when fetched from server
  chatId:   string
  enabled:  boolean
}

export type LarkBot = {
  id:         string
  name:       string
  webhookUrl: string  // masked when fetched from server
  enabled:    boolean
}

export type NotifyConfig = {
  /** Legacy single telegram config (backward compat) */
  telegram: {
    enabled: boolean; botToken: string; chatId: string
    notifyOnSuccess: boolean; notifyOnError: boolean
  }
  /** Legacy single lark config (backward compat) */
  lark: {
    enabled: boolean; webhookUrl: string; cmsBaseUrl: string
    notifyOnSuccess: boolean; notifyOnError: boolean
  }
  /** Multiple Telegram bots — each has its own token + chatId */
  telegramBots?: TelegramBot[]
  /** Multiple Lark Custom Bots — each has its own webhookUrl */
  larkBots?: LarkBot[]
  /** Single legacy webhook (kept for backward compat) */
  larkBaseWebhook?: WebhookEntry
  /** Multiple independent webhooks — each has its own token + routing */
  larkBaseWebhooks?: WebhookEntry[]
}

export type FilterFieldRule = {
  field: string
  op:    'contains' | 'eq' | 'neq' | 'regex' | 'exists'
  value: string
}

/** One independent Lark Base → HTTP Request webhook endpoint. */
export type WebhookEntry = {
  id:              string
  name:            string
  enabled:         boolean
  secretToken:     string
  /** Legacy: single telegram on/off. Use telegramBotIds for multi-bot. */
  notifyTelegram:  boolean
  /** Legacy: single lark on/off. Use larkBotIds for multi-bot. */
  notifyLark:      boolean
  /** IDs referencing telegramBots[] — which bots this webhook sends to */
  telegramBotIds:  string[]
  /** IDs referencing larkBots[] — which bots this webhook sends to */
  larkBotIds:      string[]
  /** Telegram template with {{field}} placeholders. Empty = auto-format. */
  messageTemplate: string
  /** Lark template with {{field}} placeholders — applies to text/post formats. Empty = auto-format. */
  larkTemplate:    string
  /** Only dispatch for these Lark event types. Empty = all events. */
  filterEvents:    string[]
  /** Field-level filter conditions (AND logic). */
  filterFields:    FilterFieldRule[]
  /** Lark Bot message format: 'card' (default) | 'text' | 'post' */
  larkMsgFormat:   'card' | 'text' | 'post'
  /** Persisted after each real dispatch from Lark Base Automation. */
  lastRun?: {
    at:         string
    table:      string
    event:      string
    dispatched: { telegram: boolean; lark: boolean }
    error:      string
  }
}

export async function getNotifyConfig(): Promise<ApiResp<NotifyConfig>> {
  const { data } = await api.get('/notify/config')
  return data
}

export async function updateNotifyConfig(payload: Partial<NotifyConfig>): Promise<ApiResp<NotifyConfig>> {
  const { data } = await api.put('/notify/config', payload)
  return data
}

export async function testTelegram(params?: { botToken?: string; chatId?: string }): Promise<ApiResp<null>> {
  const { data } = await api.post('/notify/test/telegram', params || {})
  return data
}

export async function testLark(params?: { webhookUrl?: string; cmsBaseUrl?: string }): Promise<ApiResp<null>> {
  const { data } = await api.post('/notify/test/lark', params || {})
  return data
}

// ── Telegram/Lark bot CRUD ────────────────────────────────────────────────────

export async function addTelegramBot(bot: Omit<TelegramBot, 'id'>): Promise<ApiResp<TelegramBot>> {
  const { data } = await api.post('/notify/telegram-bots', bot)
  return data
}

export async function updateTelegramBot(id: string, bot: Partial<TelegramBot>): Promise<ApiResp<TelegramBot>> {
  const { data } = await api.put(`/notify/telegram-bots/${id}`, bot)
  return data
}

export async function deleteTelegramBot(id: string): Promise<ApiResp<null>> {
  const { data } = await api.delete(`/notify/telegram-bots/${id}`)
  return data
}

export async function addLarkBot(bot: Omit<LarkBot, 'id'>): Promise<ApiResp<LarkBot>> {
  const { data } = await api.post('/notify/lark-bots', bot)
  return data
}

export async function updateLarkBot(id: string, bot: Partial<LarkBot>): Promise<ApiResp<LarkBot>> {
  const { data } = await api.put(`/notify/lark-bots/${id}`, bot)
  return data
}

export async function deleteLarkBot(id: string): Promise<ApiResp<null>> {
  const { data } = await api.delete(`/notify/lark-bots/${id}`)
  return data
}

