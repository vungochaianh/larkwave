export type CurlJob = {
  _id: string
  name: string
  curlCommand: string
  intervalMinutes: number
  enabled: boolean
  lastExecuted: string | null
  lastStatus: 'success' | 'error' | 'pending'
  executionCount: number
  description?: string
  createdAt?: string
  updatedAt?: string
  isRunning?: boolean
}

export type ExecutionLog = {
  _id: string
  jobId: string | { _id: string; name?: string; description?: string }
  jobName: string
  status: 'success' | 'error'
  response?: {
    statusCode?: number
    statusText?: string
    data?: any
    headers?: Record<string, any>
  }
  error?: string
  executionTime?: number
  timestamp: string
}

export type BitableSyncJob = {
  _id: string
  name: string
  description?: string
  accountId?: string | { _id: string; name: string; appId: string; domain: string; status: string; isDefault: boolean } | null
  syncMode: 'read_only' | 'mirror' | 'connector'
  // Source
  appToken: string
  tableId: string
  viewId?: string
  // Destination (mirror mode)
  destAppToken?: string
  destTableId?: string
  destAccountId?: string | null
  mirrorOptions?: {
    deleteOrphans: boolean
    fieldNames: string[]
  }
  connector?: {
    domain: string
    docToken: string
    tableIds: string[]
    cookies: string
    csrfToken: string
    hostId: string
    hostType: string
  }
  intervalSeconds: number
  ignoreSchedule?: boolean
  schedule?: {
    activeHoursStart: number
    activeHoursEnd: number
    activeDays: number[]
    timezone?: string
  }
  enabled: boolean
  webhookUrl?: string
  notify?: {
    onNewRecords: boolean
    onUpdatedRecords: boolean
    onDeletedRecords: boolean
    channels: string[]
  }
  lastSyncAt: string | null
  lastSyncStatus: 'success' | 'error' | 'pending'
  lastSyncError?: string
  lastSyncStats?: {
    total: number
    added: number
    updated: number
    deleted: number
  }
  syncCount: number
  isRunning?: boolean
  createdAt?: string
  updatedAt?: string
}

export type BitableSyncResult = {
  success: boolean
  stats?: { total: number; added: number; updated: number; deleted: number }
  diff?: { added: string[]; updated: string[]; deleted: string[] }
  duration?: number
  error?: string
}

export type BitableSyncLog = {
  _id: string
  syncId: string
  syncName: string
  status: 'success' | 'error'
  stats?: { total: number; added: number; updated: number; deleted: number }
  diff?: { added: string[]; updated: string[]; deleted: string[] }
  error?: string
  errorHint?: string
  durationMs: number
  timestamp: string
}

export type ApiResp<T> = {
  success: boolean
  data: T
  message?: string
  error?: string
  count?: number
  pagination?: {
    total: number
    page: number
    limit: number
    pages: number
  }
}
