/**
 * Complete API definition catalogue for api-lark-all backend.
 * Used by the API Explorer page (/dev/api).
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface ParamDef {
  name: string
  in: 'path' | 'query' | 'body' | 'header'
  required: boolean
  type: string
  description: string
  example?: string
}

export interface EndpointDef {
  id: string
  method: HttpMethod
  path: string          // full path including base
  summary: string
  description?: string
  params?: ParamDef[]
  bodyExample?: Record<string, unknown>
  responseExample?: Record<string, unknown> | unknown[]
  streaming?: boolean
  authRequired?: boolean
}

export interface GroupDef {
  id: string
  label: { vi: string; en: string }
  description: { vi: string; en: string }
  color: string
  icon: string
  endpoints: EndpointDef[]
}

// ─────────────────────────────────────────────────────────────────────────────

export const API_GROUPS: GroupDef[] = [
  // ── 1. Lark OAuth & Auth ───────────────────────────────────────────────────
  {
    id: 'lark-oauth',
    label:       { vi: 'Lark OAuth & Auth', en: 'Lark OAuth & Auth' },
    description: { vi: 'Đăng nhập Lark, lấy user token và tenant token', en: 'Lark OAuth login, user token and tenant token management' },
    color: '#0081FF',
    icon: 'KeyOutlined',
    endpoints: [
      {
        id: 'oauth-url',
        method: 'GET',
        path: '/api-base/lark/v2/oauth/url',
        summary: 'Build Lark OAuth redirect URL',
        description: 'Tạo URL để redirect người dùng sang Lark OAuth login.',
        params: [
          { name: 'appId',       in: 'query', required: true,  type: 'string', description: 'Lark App ID' },
          { name: 'redirectUri', in: 'query', required: true,  type: 'string', description: 'Callback URL sau khi login' },
          { name: 'state',       in: 'query', required: false, type: 'string', description: 'CSRF state token' },
          { name: 'preset',      in: 'query', required: false, type: 'string', description: 'Preset scope key' },
        ],
        responseExample: { success: true, url: 'https://open.larksuite.com/open-apis/authen/v1/authorize?...', preset: 'default', scopeCount: 5 },
      },
      {
        id: 'oauth-token',
        method: 'POST',
        path: '/api-base/lark/v2/oauth/token',
        summary: 'Exchange auth code for user token',
        description: 'Đổi auth code (từ OAuth callback) thành user access token.',
        bodyExample: { code: 'auth_code_from_callback', appId: 'cli_xxxxxx', appSecret: 'xxxxxxxx' },
        responseExample: { success: true, data: { accessToken: 'u-xxx', refreshToken: 'r-xxx', expiresIn: 7200, name: 'Nguyen Van A', openId: 'ou_xxx' } },
      },
      {
        id: 'lark-me',
        method: 'GET',
        path: '/api-base/lark/v2/me',
        summary: 'Get current user info',
        authRequired: true,
        params: [{ name: 'Authorization', in: 'header', required: true, type: 'string', description: 'Bearer {userToken}' }],
        responseExample: { success: true, data: { name: 'Nguyen Van A', avatarUrl: '...', openId: 'ou_xxx' } },
      },
      {
        id: 'tenant-token-get',
        method: 'GET',
        path: '/api-base/lark/v2/tenant-token',
        summary: 'Get cached tenant token',
        responseExample: { code: 0, token: 't-xxx', expire_in: 7200 },
      },
      {
        id: 'tenant-token-post',
        method: 'POST',
        path: '/api-base/lark/v2/tenant-token',
        summary: 'Fetch & cache new tenant token',
        bodyExample: { appId: 'cli_xxxxxx', appSecret: 'xxxxxxxx' },
        responseExample: { code: 0, token: 't-xxx', expire_in: 7200 },
      },
    ],
  },

  // ── 2. Lark Bitable ───────────────────────────────────────────────────────
  {
    id: 'lark-bitable',
    label:       { vi: 'Lark Bitable', en: 'Lark Bitable' },
    description: { vi: 'Quản lý Bitable: bases, tables, fields, records và schema operations', en: 'Manage Bitable: bases, tables, fields, records and schema operations' },
    color: '#00B96B',
    icon: 'DatabaseOutlined',
    endpoints: [
      {
        id: 'bases-list',
        method: 'GET',
        path: '/api-base/lark/v2/bases',
        summary: 'List all Bitable bases',
        authRequired: true,
        params: [
          { name: 'Authorization', in: 'header', required: true, type: 'string', description: 'Bearer {userToken}' },
          { name: 'folderToken',   in: 'query',  required: false, type: 'string', description: 'Lọc theo folder' },
        ],
        responseExample: { success: true, data: [{ appToken: 'bascXXX', name: 'HR Database', url: '...' }], total: 1 },
      },
      {
        id: 'bases-create',
        method: 'POST',
        path: '/api-base/lark/v2/bases',
        summary: 'Create new Bitable base',
        authRequired: true,
        bodyExample: { name: 'New Database', folderToken: 'fldXXX' },
        responseExample: { success: true, data: { appToken: 'bascXXX', name: 'New Database', url: '...' } },
      },
      {
        id: 'tables-list',
        method: 'GET',
        path: '/api-base/lark/v2/bases/:appToken/tables',
        summary: 'List tables in a base',
        authRequired: true,
        params: [
          { name: 'appToken',      in: 'path',   required: true, type: 'string', description: 'Bitable base token' },
          { name: 'Authorization', in: 'header', required: true, type: 'string', description: 'Bearer {userToken}' },
        ],
        responseExample: { success: true, data: [{ tableId: 'tblXXX', name: 'Employees', revision: 1 }] },
      },
      {
        id: 'fields-list',
        method: 'GET',
        path: '/api-base/lark/v2/bases/:appToken/tables/:tableId/fields',
        summary: 'List fields in a table',
        authRequired: true,
        params: [
          { name: 'appToken', in: 'path', required: true, type: 'string', description: 'Base token' },
          { name: 'tableId',  in: 'path', required: true, type: 'string', description: 'Table ID' },
          { name: 'Authorization', in: 'header', required: true, type: 'string', description: 'Bearer {userToken}' },
        ],
        responseExample: { success: true, data: [{ fieldId: 'fldXXX', name: 'Name', type: 1, typeName: 'Text', isPrimary: true }] },
      },
      {
        id: 'fields-update',
        method: 'PUT',
        path: '/api-base/lark/v2/bases/:appToken/tables/:tableId/fields/:fieldId',
        summary: 'Update a single field',
        authRequired: true,
        bodyExample: { name: 'New Field Name', description: 'Field description' },
        responseExample: { success: true, data: { fieldId: 'fldXXX', name: 'New Field Name' } },
      },
      {
        id: 'fields-batch-update',
        method: 'PUT',
        path: '/api-base/lark/v2/bases/:appToken/tables/:tableId/fields',
        summary: 'Batch update multiple fields',
        authRequired: true,
        bodyExample: { updates: [{ fieldId: 'fldXXX', name: 'New Name', description: 'Desc' }] },
        responseExample: { success: true, results: [{ fieldId: 'fldXXX', success: true }] },
      },
      {
        id: 'records-fetch',
        method: 'POST',
        path: '/api-base/lark/v2/records',
        summary: 'Fetch all records (auto-paginate)',
        bodyExample: { token: 'u-xxx', appToken: 'bascXXX', tableId: 'tblXXX', viewId: '' },
        responseExample: { items: [{ record_id: 'recXXX', fields: { Name: 'John', Age: 30 } }] },
      },
      {
        id: 'records-insert',
        method: 'POST',
        path: '/api-base/lark/v2/bases/insert-records',
        summary: 'Insert sample records into tables',
        bodyExample: { appToken: 'bascXXX', tables: [{ tableId: 'tblXXX', name: 'Test', records: [{ Name: 'Alice' }] }] },
        responseExample: { success: true, results: [{ table: 'Test', count: 1 }] },
      },
      {
        id: 'build-schema',
        method: 'POST',
        path: '/api-base/lark/v2/bases/build-from-schema',
        summary: 'Create base + tables + fields from schema',
        description: 'Tạo toàn bộ Bitable base từ schema JSON (tạo tables + fields tự động).',
        bodyExample: { name: 'HR System', tables: [{ name: 'Employees', fields: [{ name: 'Name', type: 'text' }] }], folderToken: '' },
        responseExample: { success: true, data: { appToken: 'bascXXX', url: '...', name: 'HR System', tables: [] } },
      },
      {
        id: 'patch-schema',
        method: 'POST',
        path: '/api-base/lark/v2/bases/patch-schema',
        summary: 'Apply AI-improved schema non-destructively',
        description: 'Cập nhật schema hiện tại theo gợi ý AI. An toàn, không xoá dữ liệu cũ.',
        bodyExample: { appToken: 'bascXXX', existingTables: [], improvedTables: [] },
        responseExample: { success: true, data: { results: [], summary: { ok: 5, fail: 0 } } },
      },
    ],
  },

  // ── 3. Lark Docs ──────────────────────────────────────────────────────────
  {
    id: 'lark-docs',
    label:       { vi: 'Lark Docs', en: 'Lark Docs' },
    description: { vi: 'Tạo và quản lý Lark Docs từ Markdown', en: 'Create and manage Lark Docs from Markdown content' },
    color: '#722ED1',
    icon: 'FileTextOutlined',
    endpoints: [
      {
        id: 'docs-create',
        method: 'POST',
        path: '/api-base/lark/v2/docs',
        summary: 'Create Lark Doc from Markdown',
        authRequired: true,
        bodyExample: { title: 'My Document', content: '# Heading\n\nContent here...', folderToken: '' },
        responseExample: { success: true, data: { documentId: 'doxcXXX', url: '...', insertedCount: 5 } },
      },
    ],
  },

  // ── 4. Lark Workspace Users ────────────────────────────────────────────────
  {
    id: 'lark-users',
    label:       { vi: 'Workspace Users', en: 'Workspace Users' },
    description: { vi: 'Lấy danh sách người dùng trong tổ chức Lark', en: 'Fetch users and departments in the Lark workspace' },
    color: '#FA8C16',
    icon: 'TeamOutlined',
    endpoints: [
      {
        id: 'workspace-users',
        method: 'POST',
        path: '/api-base/lark/v2/users',
        summary: 'List all workspace users',
        bodyExample: { appId: 'cli_xxxxxx', appSecret: 'xxxxxxxx' },
        responseExample: [{ name: 'Nguyen Van A', openId: 'ou_xxx', email: 'a@company.com' }],
      },
      {
        id: 'dept-users',
        method: 'GET',
        path: '/api-base/lark/v2/department-users',
        summary: 'List users in a department',
        authRequired: true,
        params: [
          { name: 'department_id', in: 'query', required: true,  type: 'string', description: 'Department ID' },
          { name: 'fetch_child',   in: 'query', required: false, type: 'boolean', description: 'Include sub-departments' },
          { name: 'Authorization', in: 'header', required: true, type: 'string', description: 'Bearer {token}' },
        ],
      },
    ],
  },

  // ── 5. Lark Accounts ─────────────────────────────────────────────────────
  {
    id: 'lark-accounts',
    label:       { vi: 'Lark Accounts', en: 'Lark Accounts' },
    description: { vi: 'Quản lý nhiều Lark App credentials (multi-account)', en: 'Multi-account Lark App credential management' },
    color: '#13C2C2',
    icon: 'SafetyOutlined',
    endpoints: [
      { id: 'accounts-list',   method: 'GET',    path: '/api/lark-accounts',               summary: 'List all Lark accounts',
        params: [{ name: 'q', in: 'query', required: false, type: 'string', description: 'Search by name/appId' }],
        responseExample: { success: true, data: [{ name: 'Main App', appId: 'cli_xxx', status: 'active' }], total: 1 } },
      { id: 'accounts-create', method: 'POST',   path: '/api/lark-accounts',               summary: 'Create new Lark account',
        bodyExample: { name: 'Production App', appId: 'cli_xxx', appSecret: 'xxx', appType: 'internal', domain: 'larksuite.com' },
        responseExample: { success: true, data: { _id: 'xxx', name: 'Production App' } } },
      { id: 'accounts-get',    method: 'GET',    path: '/api/lark-accounts/:id',           summary: 'Get single account' },
      { id: 'accounts-update', method: 'PUT',    path: '/api/lark-accounts/:id',           summary: 'Update account',
        bodyExample: { name: 'Updated Name', isDefault: true } },
      { id: 'accounts-delete', method: 'DELETE', path: '/api/lark-accounts/:id',           summary: 'Delete account' },
      { id: 'accounts-default',method: 'PATCH',  path: '/api/lark-accounts/:id/default',  summary: 'Set as default account' },
      { id: 'accounts-fetch-token', method: 'POST', path: '/api/lark-accounts/:id/fetch-token', summary: 'Fetch/refresh tenant access token',
        responseExample: { success: true, token: 't-xxx', expire_in: 7200 } },
      { id: 'accounts-get-token', method: 'GET', path: '/api/lark-accounts/:id/token',    summary: 'Get cached tenant token',
        responseExample: { success: true, token: 't-xxx', valid: true, expire_in: 6800 } },
    ],
  },

  // ── 6. Jobs (Curl Scheduler) ──────────────────────────────────────────────
  {
    id: 'jobs',
    label:       { vi: 'Curl Job Scheduler', en: 'Curl Job Scheduler' },
    description: { vi: 'Lên lịch và chạy các curl/API job tự động theo interval', en: 'Schedule and run curl/API jobs automatically on a time interval' },
    color: '#EB2F96',
    icon: 'ClockCircleOutlined',
    endpoints: [
      { id: 'jobs-list',    method: 'GET',    path: '/api/jobs',              summary: 'List all jobs',
        params: [{ name: 'search', in: 'query', required: false, type: 'string', description: 'Search jobs' }],
        responseExample: { success: true, count: 2, data: [{ name: 'Sync Employees', intervalMinutes: 30, enabled: true }] } },
      { id: 'jobs-create',  method: 'POST',   path: '/api/jobs',              summary: 'Create new job',
        bodyExample: { name: 'Daily Sync', curlCommand: 'curl -X POST https://api.example.com/sync', intervalMinutes: 60, enabled: true },
        responseExample: { success: true, data: { _id: 'xxx', name: 'Daily Sync', enabled: true } } },
      { id: 'jobs-get',     method: 'GET',    path: '/api/jobs/:id',          summary: 'Get single job' },
      { id: 'jobs-update',  method: 'PUT',    path: '/api/jobs/:id',          summary: 'Update job',
        bodyExample: { intervalMinutes: 120, enabled: false } },
      { id: 'jobs-delete',  method: 'DELETE', path: '/api/jobs/:id',          summary: 'Delete job' },
      { id: 'jobs-toggle',  method: 'PATCH',  path: '/api/jobs/:id/toggle',   summary: 'Toggle job enabled/disabled',
        responseExample: { success: true, message: 'Job enabled', data: { enabled: true } } },
      { id: 'jobs-execute', method: 'POST',   path: '/api/jobs/:id/execute',  summary: 'Execute job immediately',
        responseExample: { success: true, message: 'Executed', data: { status: 'success', executionTime: 432 } } },
      { id: 'jobs-stats',   method: 'GET',    path: '/api/jobs/:id/stats',    summary: 'Get job statistics',
        responseExample: { success: true, data: { totalExecutions: 100, successRate: 98.5, avgExecutionTime: 320 } } },
      { id: 'logs-list',    method: 'GET',    path: '/api/logs',              summary: 'List execution logs',
        params: [
          { name: 'jobId',  in: 'query', required: false, type: 'string', description: 'Filter by job' },
          { name: 'status', in: 'query', required: false, type: 'string', description: 'success | error' },
          { name: 'page',   in: 'query', required: false, type: 'number', description: 'Page number' },
        ] },
      { id: 'logs-delete',   method: 'DELETE', path: '/api/logs',             summary: 'Bulk delete logs by IDs',
        bodyExample: { ids: ['logId1', 'logId2'] } },
      { id: 'logs-cleanup',  method: 'DELETE', path: '/api/logs/cleanup',     summary: 'Delete old logs',
        params: [{ name: 'days', in: 'query', required: false, type: 'number', description: 'Delete logs older than N days (default 7)', example: '7' }] },
    ],
  },

  // ── 7. Notifications ──────────────────────────────────────────────────────
  {
    id: 'notify',
    label:       { vi: 'Notifications', en: 'Notifications' },
    description: { vi: 'Gửi thông báo qua Telegram Bot và Lark Webhook', en: 'Send notifications via Telegram Bot and Lark Webhook' },
    color: '#F5222D',
    icon: 'BellOutlined',
    endpoints: [
      { id: 'notify-config-get', method: 'GET', path: '/api/notify/config',   summary: 'Get notification config',
        responseExample: { success: true, data: { telegram: {}, lark: {}, larkBaseWebhooks: [] } } },
      { id: 'notify-config-put', method: 'PUT', path: '/api/notify/config',   summary: 'Update notification config',
        bodyExample: { telegram: { botToken: 'xxx', chatId: '-100xxx' }, lark: { webhookUrl: 'https://...' } } },
      { id: 'notify-test-tg',    method: 'POST', path: '/api/notify/test/telegram', summary: 'Test send Telegram message',
        bodyExample: { botToken: 'xxx', chatId: '-100xxx' } },
      { id: 'notify-test-lark',  method: 'POST', path: '/api/notify/test/lark',    summary: 'Test send Lark message' },
      { id: 'webhooks-list',     method: 'GET',  path: '/api/notify/webhooks', summary: 'List all webhook entries',
        responseExample: { success: true, data: [{ name: 'HR Sync', enabled: true }], count: 1 } },
      { id: 'webhooks-create',   method: 'POST', path: '/api/notify/webhooks', summary: 'Create webhook entry',
        bodyExample: { name: 'New Webhook', enabled: true, notifyTelegram: true, notifyLark: false } },
      { id: 'webhooks-update',   method: 'PUT',  path: '/api/notify/webhooks/:id', summary: 'Update webhook entry' },
      { id: 'webhooks-delete',   method: 'DELETE', path: '/api/notify/webhooks/:id', summary: 'Delete webhook entry' },
      { id: 'notify-send',       method: 'POST', path: '/api/notify/send',    summary: 'Send message to Lark custom bot',
        bodyExample: { webhookUrl: 'https://open.larksuite.com/open-apis/bot/v2/hook/xxx', type: 'card', title: 'Alert', content: 'Something happened', color: 'red' },
        responseExample: { success: true } },
    ],
  },

  // ── 8. Webhook ────────────────────────────────────────────────────────────
  {
    id: 'webhook',
    label:       { vi: 'Lark Webhook', en: 'Lark Webhook' },
    description: { vi: 'Nhận và xử lý sự kiện từ Lark Bitable Automation', en: 'Receive and process events from Lark Bitable Automation' },
    color: '#D46B08',
    icon: 'ApiOutlined',
    endpoints: [
      { id: 'webhook-receive', method: 'POST', path: '/api-base/lark/v2/webhook', summary: 'Receive Lark Automation event',
        description: 'Endpoint nhận event từ Lark Bitable Automation. Yêu cầu token xác thực.',
        params: [
          { name: 'token', in: 'query', required: false, type: 'string', description: 'Auth token (hoặc dùng header x-webhook-token)' },
        ],
        responseExample: { success: true, status: 'processed', received: {} } },
      { id: 'webhook-log', method: 'GET', path: '/api-base/lark/v2/webhook', summary: 'View recent webhook event log',
        responseExample: { success: true, count: 5, events: [], configReady: true } },
      { id: 'webhook-test', method: 'POST', path: '/api-base/lark/v2/webhook-test', summary: 'Simulate webhook dispatch (no auth)',
        bodyExample: { webhookToken: 'xxx', data: { fields: { Name: 'Test' } } },
        responseExample: { success: true, telegram: 'ok', lark: 'ok', errors: [] } },
    ],
  },

  // ── 9. AI Config ──────────────────────────────────────────────────────────
  {
    id: 'ai-config',
    label:       { vi: 'AI Config (API Keys)', en: 'AI Config (API Keys)' },
    description: { vi: 'Quản lý API keys cho các AI provider: Anthropic, OpenAI, Groq,...', en: 'Manage AI provider API keys: Anthropic, OpenAI, Groq, and more' },
    color: '#531DAB',
    icon: 'ThunderboltOutlined',
    endpoints: [
      { id: 'ai-presets',  method: 'GET',    path: '/api/ai-configs/presets', summary: 'Get provider pricing presets',
        responseExample: { success: true, data: { anthropic: { inputPricePerM: 3, outputPricePerM: 15 } } } },
      { id: 'ai-list',     method: 'GET',    path: '/api/ai-configs',         summary: 'List all AI configs',
        responseExample: { success: true, data: [{ name: 'Main Claude', provider: 'anthropic', model: 'claude-sonnet-4-6', isDefault: true }], total: 1 } },
      { id: 'ai-create',   method: 'POST',   path: '/api/ai-configs',         summary: 'Create AI config',
        bodyExample: { name: 'Claude Sonnet', provider: 'anthropic', apiKey: 'sk-ant-xxx', model: 'claude-sonnet-4-6', isDefault: true } },
      { id: 'ai-get',      method: 'GET',    path: '/api/ai-configs/:id',     summary: 'Get config (masked key)' },
      { id: 'ai-update',   method: 'PUT',    path: '/api/ai-configs/:id',     summary: 'Update config',
        bodyExample: { model: 'claude-opus-4-6', isDefault: false } },
      { id: 'ai-delete',   method: 'DELETE', path: '/api/ai-configs/:id',     summary: 'Delete config' },
      { id: 'ai-default',  method: 'PATCH',  path: '/api/ai-configs/:id/default', summary: 'Set as default config' },
      { id: 'ai-test',     method: 'POST',   path: '/api/ai-configs/:id/test', summary: 'Test API key connectivity',
        responseExample: { success: true, message: 'Connection OK' } },
    ],
  },

  // ── 10. AI Agent ──────────────────────────────────────────────────────────
  {
    id: 'ai-agent',
    label:       { vi: 'AI Agent', en: 'AI Agent' },
    description: { vi: 'Tạo và quản lý AI Agent với RAG, chat streaming và Lark Bot webhook', en: 'Create and manage AI Agents with RAG, streaming chat, and Lark Bot webhook' },
    color: '#6366F1',
    icon: 'RobotOutlined',
    endpoints: [
      { id: 'agent-list',    method: 'GET',    path: '/api/ai-agents',                      summary: 'List all agents',
        responseExample: { success: true, data: [{ name: 'HR Bot', model: 'claude-sonnet-4-6', isActive: true, stats: { totalChats: 42 } }] } },
      { id: 'agent-create',  method: 'POST',   path: '/api/ai-agents',                      summary: 'Create agent',
        bodyExample: { name: 'HR Support', systemPrompt: 'Bạn là trợ lý HR...', provider: 'anthropic', model: 'claude-sonnet-4-6', knowledgeIds: [] } },
      { id: 'agent-get',     method: 'GET',    path: '/api/ai-agents/:id',                  summary: 'Get agent details' },
      { id: 'agent-update',  method: 'PUT',    path: '/api/ai-agents/:id',                  summary: 'Update agent',
        bodyExample: { isActive: false, knowledgeIds: ['knowledgeId1'] } },
      { id: 'agent-delete',  method: 'DELETE', path: '/api/ai-agents/:id',                  summary: 'Delete agent' },
      { id: 'agent-regen',   method: 'POST',   path: '/api/ai-agents/:id/regen-token',      summary: 'Regenerate webhook token',
        responseExample: { success: true, webhookToken: 'new-token-hex' } },
      { id: 'agent-chat',    method: 'POST',   path: '/api/ai-agents/:id/chat',             summary: 'Chat with agent (RAG + streaming)',
        streaming: true,
        description: 'Stream chat với agent. Trả về text/event-stream chunks. Sử dụng RAG từ knowledge base của agent.',
        bodyExample: { message: 'Chính sách nghỉ phép của công ty là gì?', history: [{ role: 'user', content: '...' }, { role: 'assistant', content: '...' }] },
        responseExample: { _note: 'Streaming response — text chunks streamed directly' } },
      { id: 'agent-webhook', method: 'POST',   path: '/api/ai-agents/webhook/:webhookToken', summary: 'Lark Bot webhook receiver',
        description: 'Endpoint cho Lark Bot gửi events. Tự động verify URL + trả lời tin nhắn.',
        bodyExample: { type: 'url_verification', challenge: 'xxx' },
        responseExample: { challenge: 'xxx' } },
    ],
  },

  // ── 11. Knowledge Base ────────────────────────────────────────────────────
  {
    id: 'knowledge',
    label:       { vi: 'Knowledge Base', en: 'Knowledge Base' },
    description: { vi: 'Lưu trữ tài liệu cho AI Agent RAG (Lark Doc, Bitable, Wiki, thủ công)', en: 'Store documents for AI Agent RAG from Lark Docs, Bitable, Wiki, or manual input' },
    color: '#2F54EB',
    icon: 'BookOutlined',
    endpoints: [
      { id: 'know-list',    method: 'GET',    path: '/api/agent-knowledge',              summary: 'List knowledge items',
        params: [
          { name: 'search',     in: 'query', required: false, type: 'string', description: 'Keyword search with relevance scoring' },
          { name: 'sourceType', in: 'query', required: false, type: 'string', description: 'Filter: bitable | doc | wiki | manual' },
          { name: 'limit',      in: 'query', required: false, type: 'number', description: 'Max results (default 50, max 200)' },
        ],
        responseExample: { success: true, data: [{ title: 'HR Policy', sourceType: 'doc', summary: '...' }], total: 1 } },
      { id: 'know-create',  method: 'POST',   path: '/api/agent-knowledge',              summary: 'Create manual knowledge item',
        bodyExample: { title: 'Company Policy', content: 'Full policy text here...', sourceType: 'manual', tags: ['hr', 'policy'] } },
      { id: 'know-update',  method: 'PUT',    path: '/api/agent-knowledge/:id',          summary: 'Update knowledge item',
        bodyExample: { title: 'Updated Title', content: 'Updated content...' } },
      { id: 'know-delete',  method: 'DELETE', path: '/api/agent-knowledge/:id',          summary: 'Delete knowledge item' },
      { id: 'know-doc',     method: 'POST',   path: '/api/agent-knowledge/index-doc',    summary: 'Index Lark Doc',
        bodyExample: { documentId: 'doxcXXX', userToken: 'u-xxx', title: 'HR Handbook' },
        responseExample: { success: true, data: { title: 'HR Handbook', metadata: { wordCount: 2500 } }, isUpdate: false } },
      { id: 'know-wiki',    method: 'POST',   path: '/api/agent-knowledge/index-wiki-node', summary: 'Index Wiki node',
        bodyExample: { nodeToken: 'wikbcXXX', spaceId: 'spcXXX', userToken: 'u-xxx' } },
      { id: 'know-bitable', method: 'POST',   path: '/api/agent-knowledge/index-bitable', summary: 'Index Bitable table',
        bodyExample: { appToken: 'bascXXX', tableId: 'tblXXX', tableName: 'Products', userToken: 'u-xxx' },
        responseExample: { success: true, data: { metadata: { recordCount: 150 } }, isUpdate: false } },
    ],
  },

  // ── 12. Extract Chat ──────────────────────────────────────────────────────
  {
    id: 'extract-chat',
    label:       { vi: 'Extract Chat Sessions', en: 'Extract Chat Sessions' },
    description: { vi: 'Lưu lịch sử hội thoại AI cho tính năng Extract & Schema Designer', en: 'Persist AI conversation history for Extract & Schema Designer feature' },
    color: '#08979C',
    icon: 'HistoryOutlined',
    endpoints: [
      { id: 'chat-list',   method: 'GET',    path: '/api/extract-chats',     summary: 'List chat sessions',
        params: [{ name: 'baseToken', in: 'query', required: true, type: 'string', description: 'Bitable base token' }],
        responseExample: { success: true, data: [{ baseName: 'HR System', messages: [], createdAt: '...' }] } },
      { id: 'chat-create', method: 'POST',   path: '/api/extract-chats',     summary: 'Create chat session',
        bodyExample: { baseToken: 'bascXXX', baseName: 'HR System', schemaSnapshot: {}, messages: [] } },
      { id: 'chat-patch',  method: 'PATCH',  path: '/api/extract-chats/:id', summary: 'Append messages or save docs',
        bodyExample: { messages: [{ role: 'user', content: 'Cải thiện schema...' }], docsContent: '# SCHEMA_DOCS\n...' } },
      { id: 'chat-delete', method: 'DELETE', path: '/api/extract-chats/:id', summary: 'Delete session' },
    ],
  },

  // ── 13. System Users ──────────────────────────────────────────────────────
  {
    id: 'system-users',
    label:       { vi: 'System Users (CMS)', en: 'System Users (CMS)' },
    description: { vi: 'Quản lý tài khoản đăng nhập CMS', en: 'Manage CMS login accounts' },
    color: '#7CB305',
    icon: 'UserOutlined',
    endpoints: [
      { id: 'users-list',   method: 'GET',    path: '/api/system-users',         summary: 'List users',
        params: [{ name: 'q', in: 'query', required: false, type: 'string', description: 'Search by name/email' }] },
      { id: 'users-create', method: 'POST',   path: '/api/system-users',         summary: 'Create user',
        bodyExample: { name: 'Admin User', email: 'admin@company.com', password: 'secret', status: 'active' } },
      { id: 'users-login',  method: 'POST',   path: '/api/system-users/login',   summary: 'Login (CMS auth)',
        bodyExample: { email: 'admin@company.com', password: 'secret' },
        responseExample: { success: true, data: { _id: 'xxx', name: 'Admin User', email: 'admin@company.com' } } },
      { id: 'users-get',    method: 'GET',    path: '/api/system-users/:id',     summary: 'Get user' },
      { id: 'users-update', method: 'PUT',    path: '/api/system-users/:id',     summary: 'Update user',
        bodyExample: { name: 'New Name', status: 'inactive' } },
      { id: 'users-delete', method: 'DELETE', path: '/api/system-users/:id',     summary: 'Delete user' },
    ],
  },
]
