// ── Shared types for all base-designer sub-pages ──────────────────────────

export type LarkBase    = { appToken: string; name: string; url: string }
export type LarkTable   = { tableId: string; name: string }
export type LarkAccount = { _id: string; name: string; appId: string; appType: string; domain: string; isDefault: boolean; status: string }
export type StoredAIConfig = { _id: string; name: string; provider: string; model: string; status: string; isDefault: boolean }

export type LarkField = {
  fieldId: string; name: string; type: number; typeName: string
  isPrimary: boolean; description: string; property: any
  editName?: string; editDescription?: string; dirty?: boolean
}

export type EnrichedField = {
  name: string; type: number; typeName: string
  description: string; isPrimary: boolean
  options?: string[]
}

export type CtxTable = {
  key: string
  appToken: string
  tableId: string
  baseName: string
  tableName: string
  fields?: EnrichedField[]
  fieldsLoading?: boolean
}

export type GeneratedField = {
  name: string; type: number; typeName: string; description: string
  isPrimary?: boolean
  options?: string[]
  linkTable?: string
}
export type GeneratedTable  = { name: string; fields: GeneratedField[] }
export type GeneratedSchema = { baseName: string; summary: string; tables: GeneratedTable[] }

export type AILogEntry = {
  id: string; timestamp: number; step: string
  status: 'running' | 'success' | 'error'
  inputSummary: string; outputSummary: string
  durationMs?: number; error?: string
}

export type ExecStep = { name: string; ms: number }
export type ExecTiming = { startedAt: number | null; steps: ExecStep[]; endedAt: number | null }

export type ChatMsg = { role: 'user' | 'assistant'; content: string }

export type TableDiff = {
  newTables:    string[]
  addedFields:  { table: string; fields: string[] }[]
  unchangedTables: string[]
}

// Extract AI: diff per table for name/description changes
export type ExtractFieldPatch = {
  fieldId: string
  oldName: string; newName?: string
  oldDescription: string; newDescription?: string
  changed: boolean
}
export type ExtractTablePatch = {
  tableId: string; tableName: string
  fields: ExtractFieldPatch[]
  hasChanges: boolean
}
