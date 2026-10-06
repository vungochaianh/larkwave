'use client'

import {
  Alert, Avatar, Button, Card, Checkbox, Col, Collapse, Empty, Input,
  Row, Segmented, Select, Skeleton, Space, Spin, Steps, Tag, Tooltip, Typography, message,
} from 'antd'
import {
  BookOutlined, BulbOutlined, CheckCircleOutlined, CloseCircleOutlined,
  CopyOutlined, DatabaseOutlined, FileTextOutlined, LinkOutlined,
  LoadingOutlined, LoginOutlined, PlusOutlined, ReloadOutlined,
  RobotOutlined, SaveOutlined, SendOutlined, TableOutlined,
} from '@ant-design/icons'
import { useEffect, useRef, useState } from 'react'
import {
  getLarkFields, getLarkTables, buildLarkSchema,
} from '@/lib/api'
import { useCommon } from '../_lib/useCommon'
import {
  parseAISchema, STREAM_ERROR_SENTINEL, AI_LOG_STORAGE_KEY, AI_LOG_MAX_ENTRIES, persistAILog,
  countTokens, PROVIDER_PRICING, findClose, closeUnclosed, readUtf8Stream,
} from '../_lib/utils'
import { DOMAINS, REQUIREMENTS, TABLE_COUNT_OPTIONS, API_BASE, API_ORIGIN } from '../_lib/constants'
import type {
  CtxTable, EnrichedField, GeneratedSchema, GeneratedField, GeneratedTable,
  AILogEntry, ExecStep, ExecTiming, ChatMsg, TableDiff, StoredAIConfig,
} from '../_lib/types'
import { TYPE_COLOR, FIELD_TYPES } from '../_lib/constants'
import TourGuide from '@/components/TourGuide'
import { tourSteps } from '@/lib/tourSteps'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

export default function ComposePage() {
  const {
    userToken, userName, userAvatar, appId, setAppId, sessionExpired, setSessionExpired,
    larkAccounts, selectedAccountId, setSelectedAccountId,
    aiConfigs, selectedAiConfigId, setSelectedAiConfigId, getAIParams,
    bases, loadingBases, basesError, setBasesError, loadBases, basesLoadedAt,
    handleLogin, handleLogout, isAuthError,
  } = useCommon()

  // ── Source panel ────────────────────────────────────────────────────────────
  const [srcExpanded,    setSrcExpanded]    = useState<Set<string>>(new Set())
  const [srcTables,      setSrcTables]      = useState<Record<string, { tableId: string; name: string }[]>>({})
  const [srcLoading,     setSrcLoading]     = useState<Record<string, boolean>>({})
  const [srcError,       setSrcError]       = useState<Record<string, string | null>>({})
  const [ctxTables,      setCtxTables]      = useState<CtxTable[]>([])

  // ── Destination ─────────────────────────────────────────────────────────────
  const [destMode,       setDestMode]       = useState<'new' | 'existing'>('new')
  const [destToken,      setDestToken]      = useState<string>('')
  const [destTables,     setDestTables]     = useState<{ tableId: string; name: string }[]>([])
  const [newBaseName,    setNewBaseName]    = useState('')

  // ── Compose sub-mode ────────────────────────────────────────────────────────
  const [composeSubMode, setComposeSubMode] = useState<'create' | 'improve'>('create')

  // ── Improve mode ────────────────────────────────────────────────────────────
  const [improveBase,       setImproveBase]       = useState<{ appToken: string; name: string; url: string } | null>(null)
  const [improveFullSchema, setImproveFullSchema] = useState<{ tableId: string; name: string; fields: any[] }[]>([])
  const [improveLoading,    setImproveLoading]    = useState(false)
  const [improveApplyMode,  setImproveApplyMode]  = useState<'create-new' | 'add-fields'>('create-new')
  const [improveError,      setImproveError]      = useState<string | null>(null)
  const [improveRetryInfo,  setImproveRetryInfo]  = useState<string | null>(null)
  const [improveWizardStep, setImproveWizardStep] = useState<'input' | 'understanding' | 'schema'>('input')
  const [aiUnderstanding,   setAiUnderstanding]   = useState<any>(null)
  const [understandingLoading, setUnderstandingLoading] = useState(false)
  const [understandingStream,  setUnderstandingStream]  = useState('')
  const [understandingError,   setUnderstandingError]   = useState<string | null>(null)

  // ── Schema + generation ─────────────────────────────────────────────────────
  const [schema,         setSchema]         = useState<GeneratedSchema | null>(null)
  const [composeLoading, setComposeLoading] = useState(false)
  const [composeError,   setComposeError]   = useState<string | null>(null)
  const [composeStep,    setComposeStep]    = useState(0)
  const [streamText,     setStreamText]     = useState('')
  const [streamDarkMode, setStreamDarkMode] = useState(true)

  // ── Creation progress ───────────────────────────────────────────────────────
  const [creating,      setCreating]      = useState(false)
  const [createLog,     setCreateLog]     = useState<{ msg: string; ok: boolean }[]>([])
  const [fieldResults,  setFieldResults]  = useState<{ field: string; table: string; success?: boolean; error?: string }[]>([])
  const [createdBase,   setCreatedBase]   = useState<{ appToken: string; url: string | null; name: string } | null>(null)
  const [schemaDiff,    setSchemaDiff]    = useState<TableDiff | null>(null)
  const [improveApplying, setImproveApplying] = useState(false)

  // ── Docs + sample data ──────────────────────────────────────────────────────
  const [viDocs,        setViDocs]        = useState('')
  const [viDocsLoading, setViDocsLoading] = useState(false)
  const [docsCopied,    setDocsCopied]    = useState(false)
  const [sampleData,        setSampleData]        = useState<{ name: string; records: any[] }[]>([])
  const [sampleDataLoading, setSampleDataLoading] = useState(false)
  const [insertLog,         setInsertLog]         = useState<{ table: string; count: number; error?: string }[]>([])
  const [insertingRecords,  setInsertingRecords]  = useState(false)
  const [pushingDoc, setPushingDoc] = useState(false)
  const [docUrl,     setDocUrl]     = useState<string | null>(null)
  const [docError,   setDocError]   = useState<string | null>(null)
  const [docsPermError, setDocsPermError] = useState(false)

  // ── Chat ────────────────────────────────────────────────────────────────────
  const [chatHistory, setChatHistory] = useState<ChatMsg[]>([])
  const [chatInput,   setChatInput]   = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatError,   setChatError]   = useState<string | null>(null)
  const [chatStream,  setChatStream]  = useState('')
  const chatBottomRef = useRef<HTMLDivElement>(null)

  // ── Prompt builder ──────────────────────────────────────────────────────────
  const [promptDomains,      setPromptDomains]      = useState<string[]>([])
  const [promptRequirements, setPromptRequirements] = useState<string[]>([])
  const [promptLanguage,     setPromptLanguage]     = useState<'vi' | 'en'>('vi')
  const [promptTableCount,   setPromptTableCount]   = useState<string>('auto')
  const [showPromptBuilder,  setShowPromptBuilder]  = useState(false)
  const [composePrompt,      setComposePrompt]      = useState('')

  // ── Exec timing ─────────────────────────────────────────────────────────────
  const [execTiming, setExecTiming] = useState<ExecTiming>({ startedAt: null, steps: [], endedAt: null })

  // ── AI log ──────────────────────────────────────────────────────────────────
  const aiLogRef  = useRef<AILogEntry[]>([])
  const [aiLogTick, setAiLogTick] = useState(0)

  // ── Schema diff ─────────────────────────────────────────────────────────────
  function computeSchemaDiff(existing: { name: string; fields: { name: string }[] }[], improved: GeneratedTable[]): TableDiff {
    const existingByName = new Map(existing.map(t => [t.name, new Set(t.fields.map(f => f.name))]))
    const newTables: string[] = [], addedFields: { table: string; fields: string[] }[] = [], unchangedTables: string[] = []
    for (const t of improved) {
      if (!existingByName.has(t.name)) { newTables.push(t.name) }
      else {
        const ex = existingByName.get(t.name)!
        const added = t.fields.filter(f => !f.isPrimary && !ex.has(f.name)).map(f => f.name)
        if (added.length > 0) addedFields.push({ table: t.name, fields: added })
        else unchangedTables.push(t.name)
      }
    }
    return { newTables, addedFields, unchangedTables }
  }

  // ── Exec timing helpers ─────────────────────────────────────────────────────
  function startExec() { const now = Date.now(); setExecTiming({ startedAt: now, steps: [], endedAt: null }); return now }
  function markExecStep(name: string, startedAt: number) {
    setExecTiming(prev => ({ ...prev, steps: [...prev.steps, { name, ms: Date.now() - startedAt }] }))
  }
  function endExec() { setExecTiming(prev => ({ ...prev, endedAt: Date.now() })) }

  // ── AI log helpers ──────────────────────────────────────────────────────────
  function logAIOp(step: string, inputSummary: string): string {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const entry: AILogEntry = { id, timestamp: Date.now(), step, status: 'running', inputSummary, outputSummary: '' }
    aiLogRef.current = [...aiLogRef.current, entry]; setAiLogTick(t => t + 1); return id
  }
  function finishAIOp(id: string, ok: boolean, outputSummary: string, error?: string) {
    aiLogRef.current = aiLogRef.current.map(e => e.id !== id ? e : { ...e, status: ok ? 'success' : 'error', outputSummary, durationMs: Date.now() - e.timestamp, error })
    setAiLogTick(t => t + 1)
    persistAILog(aiLogRef.current.filter(e => e.status !== 'running'))
  }

  // ── Prompt builder helpers ──────────────────────────────────────────────────
  function buildStructuredPrompt(freeText: string): string {
    const parts: string[] = []
    if (promptDomains.length)      parts.push(`Lĩnh vực: ${promptDomains.join(', ')}`)
    if (promptRequirements.length) parts.push(`Yêu cầu chức năng: ${promptRequirements.join(', ')}`)
    if (promptLanguage)            parts.push(`Ngôn ngữ: ${promptLanguage === 'vi' ? 'Tiếng Việt' : 'English'}`)
    return parts.length ? parts.join('\n') + (freeText.trim() ? `\n\nMô tả chi tiết:\n${freeText}` : '') : freeText
  }
  function getMaxTables(): number {
    if (promptTableCount === 'auto') return composeSubMode === 'improve' ? 50 : 4
    return parseInt(promptTableCount, 10) || 4
  }
  function calcTokenEstimate(inputText: string, estimatedOutputTokens: number) {
    const provider = aiConfigs.find(c => c._id === selectedAiConfigId)?.provider ?? 'anthropic'
    const pricing  = PROVIDER_PRICING[provider] ?? PROVIDER_PRICING.anthropic
    const inputTokens = 600 + countTokens(inputText)
    const costUSD = (inputTokens * pricing.input + estimatedOutputTokens * pricing.output) / 1_000_000
    return { inputTokens, outputTokens: estimatedOutputTokens, costUSD }
  }

  // handleLoadBases is kept for compatibility with existing onClick references
  async function handleLoadBases() { if (!userToken) return; await loadBases() }

  // ── Load full schema (improve mode) ────────────────────────────────────────
  async function loadFullBaseSchema(base: { appToken: string; name: string; url: string }) {
    setImproveLoading(true); setImproveError(null); setImproveFullSchema([])
    try {
      const tablesRes = await getLarkTables(base.appToken)
      const tables = tablesRes.data
      if (!tables.length) { setImproveError('Base không có bảng nào'); return }
      const BATCH = 5; const result: any[] = []
      for (let i = 0; i < tables.length; i += BATCH) {
        const batch = tables.slice(i, i + BATCH)
        const fieldsArr = await Promise.all(batch.map(t =>
          getLarkFields(base.appToken, t.tableId).then(r => r.data.map((f: any) => ({
            fieldId: f.fieldId, name: f.name, type: f.type, typeName: f.typeName,
            isPrimary: f.isPrimary, description: f.description,
            options: (f.type === 3 || f.type === 4) ? ((f.property?.options || []) as any[]).map((o: any) => o.name).filter(Boolean) : undefined,
            linkTable: f.property?.table_id ? '(linked)' : undefined,
          })))
        ))
        batch.forEach((t, bi) => result.push({ tableId: t.tableId, name: t.name, fields: fieldsArr[bi] }))
      }
      setImproveFullSchema(result)
    } catch (e: any) { setImproveError(e.message || 'Tải schema thất bại') }
    finally { setImproveLoading(false) }
  }

  // ── Source panel ────────────────────────────────────────────────────────────
  async function toggleSrcBase(base: { appToken: string; name: string; url: string }) {
    const isOpen = srcExpanded.has(base.appToken)
    setSrcExpanded(prev => { const n = new Set(prev); isOpen ? n.delete(base.appToken) : n.add(base.appToken); return n })
    if (!isOpen && !srcTables[base.appToken]) {
      setSrcLoading(p => ({ ...p, [base.appToken]: true }))
      try { const res = await getLarkTables(base.appToken); setSrcTables(p => ({ ...p, [base.appToken]: res.data })) }
      catch (e: any) { setSrcError(p => ({ ...p, [base.appToken]: e.message })) }
      finally { setSrcLoading(p => ({ ...p, [base.appToken]: false })) }
    }
  }

  async function loadCtxFields(appToken: string, tableId: string, key: string) {
    try {
      const res = await getLarkFields(appToken, tableId)
      const enriched: EnrichedField[] = res.data.map((f: any) => ({
        name: f.name, type: f.type, typeName: f.typeName, description: f.description, isPrimary: f.isPrimary,
        options: (f.type === 3 || f.type === 4) ? ((f.property?.options || []) as any[]).map((o: any) => o.name).filter(Boolean) : undefined,
      }))
      setCtxTables(prev => prev.map(c => c.key === key ? { ...c, fields: enriched, fieldsLoading: false } : c))
    } catch { setCtxTables(prev => prev.map(c => c.key === key ? { ...c, fieldsLoading: false } : c)) }
  }

  async function toggleCtx(base: { appToken: string; name: string }, table: { tableId: string; name: string }) {
    const key = `${base.appToken}:${table.tableId}`
    if (ctxTables.find(c => c.key === key)) { setCtxTables(prev => prev.filter(c => c.key !== key)); return }
    const newCtx: CtxTable = { key, appToken: base.appToken, tableId: table.tableId, baseName: base.name, tableName: table.name, fieldsLoading: true }
    setCtxTables(prev => [...prev, newCtx])
    loadCtxFields(base.appToken, table.tableId, key)
  }

  async function toggleSelectAll(base: { appToken: string; name: string }) {
    const tbls = srcTables[base.appToken] || []
    if (!tbls.length) return
    const allSelected = tbls.every(t => ctxTables.some(c => c.key === `${base.appToken}:${t.tableId}`))
    if (allSelected) { setCtxTables(prev => prev.filter(c => c.appToken !== base.appToken)); return }
    const toAdd = tbls.filter(t => !ctxTables.some(c => c.key === `${base.appToken}:${t.tableId}`))
      .map(t => ({ key: `${base.appToken}:${t.tableId}`, appToken: base.appToken, tableId: t.tableId, baseName: base.name, tableName: t.name, fieldsLoading: true } as CtxTable))
    setCtxTables(prev => [...prev, ...toAdd])
    toAdd.forEach(c => loadCtxFields(c.appToken, c.tableId, c.key))
  }

  function isCtxSelected(appToken: string, tableId: string) {
    return ctxTables.some(c => c.key === `${appToken}:${tableId}`)
  }

  async function handleDestChange(token: string) {
    setDestToken(token); setDestTables([])
    if (!token) return
    try { const res = await getLarkTables(token); setDestTables(res.data) }
    catch { message.error('Failed to load tables for target base') }
  }

  // ── Schema inline editing ───────────────────────────────────────────────────
  function updateField(ti: number, fi: number, patch: Partial<GeneratedField>) {
    setSchema(s => !s ? s : { ...s, tables: s.tables.map((t, i) => i !== ti ? t : { ...t, fields: t.fields.map((f, j) => j !== fi ? f : { ...f, ...patch }) }) })
  }
  function removeField(ti: number, fi: number) {
    setSchema(s => !s ? s : { ...s, tables: s.tables.map((t, i) => i !== ti ? t : { ...t, fields: t.fields.filter((_, j) => j !== fi) }) })
  }
  function removeTable(ti: number) { setSchema(s => !s ? s : { ...s, tables: s.tables.filter((_, i) => i !== ti) }) }
  function addField(ti: number) {
    setSchema(s => !s ? s : { ...s, tables: s.tables.map((t, i) => i !== ti ? t : { ...t, fields: [...t.fields, { name: 'New Field', type: 1, typeName: 'Text', description: '', isPrimary: false }] }) })
  }

  // ── Generate schema (create mode, streaming) ────────────────────────────────
  async function generateSchema() {
    if (!ctxTables.length && !composePrompt.trim()) { message.warning('Chọn bảng nguồn hoặc nhập mô tả yêu cầu'); return }
    if (destMode === 'new' && !newBaseName.trim()) { message.warning('Nhập tên cho base mới'); return }
    if (!selectedAiConfigId) { message.error('Chưa chọn AI config'); return }

    setComposeLoading(true); setComposeError(null); setSchema(null)
    setStreamText(''); setComposeStep(1)
    setCreatedBase(null); setCreateLog([]); setFieldResults([]); setViDocs('')
    const opId = logAIOp('compose-schema', `${ctxTables.length} source tables, maxTables=${getMaxTables()}`)

    try {
      const sources = ctxTables.map(ctx => ({
        baseName: ctx.baseName, tableId: ctx.tableId, tableName: ctx.tableName,
        fields: (ctx.fields || []).map(f => ({ name: f.name, type: f.type, typeName: f.typeName, description: f.description, isPrimary: f.isPrimary, ...(f.options?.length ? { options: f.options } : {}) })),
      }))
      const res = await fetch(`${API_ORIGIN}/api/ai/compose-stream`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources, newBaseName, prompt: buildStructuredPrompt(composePrompt), maxTables: getMaxTables(), ...getAIParams() }),
      })
      if (!res.ok || !res.body) { const e = await res.text().catch(() => ''); throw new Error(JSON.parse(e)?.error || e) }
      const full = await readUtf8Stream(res.body, (_, acc) => setStreamText(acc))
      if (!full.trim()) throw new Error('AI không trả về nội dung')
      if (full.startsWith(STREAM_ERROR_SENTINEL)) throw new Error(full.slice(STREAM_ERROR_SENTINEL.length))
      const parsed = parseAISchema(full)
      if (!parsed?.tables?.length) throw new Error('Schema không hợp lệ từ AI')
      const tableNameSet = new Set(parsed.tables.map((t: any) => t.name as string))
      for (const table of parsed.tables) for (const field of table.fields || []) {
        if ((field.type === 18 || field.type === 21) && field.linkTable && !tableNameSet.has(field.linkTable)) { delete field.linkTable; field.type = 1; field.typeName = 'Text' }
      }
      setSchema(parsed); setComposeStep(2)
      if (parsed.baseName && !newBaseName) setNewBaseName(parsed.baseName)
      finishAIOp(opId, true, `${parsed.tables.length} bảng, baseName="${parsed.baseName}"`)
    } catch (e: any) { finishAIOp(opId, false, '', e.message); setComposeError(e.message); setComposeStep(0) }
    finally { setComposeLoading(false) }
  }

  // ── Analyze base (improve mode pre-step) ────────────────────────────────────
  async function analyzeBase() {
    if (!improveFullSchema.length) { message.warning('Tải schema trước'); return }
    if (!selectedAiConfigId) { message.error('Chưa chọn AI config'); return }
    setUnderstandingLoading(true); setUnderstandingError(null); setAiUnderstanding(null); setUnderstandingStream('')
    const opId = logAIOp('analyze-schema', `${improveFullSchema.length} tables from "${improveBase?.name}"`)
    try {
      const res = await fetch(`${API_ORIGIN}/api/ai/understand-stream`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tables: improveFullSchema, prompt: buildStructuredPrompt(composePrompt), language: promptLanguage, ...getAIParams() }),
      })
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
      const full = await readUtf8Stream(res.body, (_, acc) => setUnderstandingStream(acc))
      setUnderstandingStream('')
      if (full.startsWith(STREAM_ERROR_SENTINEL)) throw new Error(full.slice(STREAM_ERROR_SENTINEL.length))
      let parsed: any = null
      const stripped = full.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
      try { parsed = JSON.parse(stripped) } catch { }
      if (!parsed) { const fb = stripped.indexOf('{'); if (fb >= 0) { const end = findClose(stripped, fb); try { parsed = JSON.parse(end >= 0 ? stripped.slice(fb, end + 1) : closeUnclosed(stripped.slice(fb))) } catch { } } }
      if (!parsed) throw new Error('AI không trả về phân tích hợp lệ')
      setAiUnderstanding(parsed); setImproveWizardStep('understanding')
      finishAIOp(opId, true, `domain="${parsed.domain}", health=${parsed.overallHealth}`)
    } catch (e: any) { finishAIOp(opId, false, '', e.message); setUnderstandingError(e.message) }
    finally { setUnderstandingLoading(false) }
  }

  // ── Generate improve schema ─────────────────────────────────────────────────
  async function generateImproveSchema() {
    if (!improveFullSchema.length) { message.warning('Tải schema trước'); return }
    if (!selectedAiConfigId) { message.error('Chưa chọn AI config'); return }
    setComposeLoading(true); setComposeError(null); setSchema(null)
    setStreamText(''); setComposeStep(1); setImproveRetryInfo(null)
    setCreatedBase(null); setCreateLog([]); setFieldResults([]); setViDocs('')
    setSampleData([]); setInsertLog([]); setDocUrl(null); setDocError(null)
    setChatHistory([]); setChatInput('')
    const inputTableCount = improveFullSchema.length
    const opId = logAIOp('improve-schema', `${inputTableCount} tables from "${improveBase?.name}"`)
    const MAX_ATTEMPTS = 3; let allTables: any[] = []; let baseName = ''; let summary = ''
    try {
      const finalPrompt = buildStructuredPrompt(composePrompt)
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        let requestTables = improveFullSchema; let requestPrompt = finalPrompt
        if (attempt > 1 && allTables.length > 0) {
          const returnedNames = new Set(allTables.map((t: any) => t.name as string))
          const missingTables = improveFullSchema.filter(t => !returnedNames.has(t.name))
          if (missingTables.length === 0) break
          setImproveRetryInfo(`Lần ${attempt}: Thiếu ${missingTables.length}/${inputTableCount} bảng — đang bổ sung…`)
          requestTables = missingTables
          requestPrompt = finalPrompt + `\n\nCRITICAL — Generate ONLY these missing tables (${missingTables.length} total):\n` +
            missingTables.map(t => `- "${t.name}"`).join('\n') +
            `\n\nDo NOT repeat: ${allTables.map((t: any) => `"${t.name}"`).join(', ')}`
          await new Promise(r => setTimeout(r, 800))
        }
        const res = await fetch(`${API_ORIGIN}/api/ai/improve-stream`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tables: requestTables, prompt: requestPrompt, requirements: promptRequirements, language: promptLanguage, ...getAIParams() }),
        })
        if (!res.ok || !res.body) { const e = await res.text().catch(() => ''); let em = e; try { em = JSON.parse(e)?.error || e } catch { }; throw new Error(em) }
        const fullText = await readUtf8Stream(res.body, attempt === 1 ? ((_, acc) => setStreamText(acc)) : undefined)
        if (!fullText.trim()) throw new Error('AI không trả về nội dung')
        if (fullText.startsWith(STREAM_ERROR_SENTINEL)) throw new Error(fullText.slice(STREAM_ERROR_SENTINEL.length))
        const parsed = parseAISchema(fullText)
        if (!parsed?.tables?.length) throw new Error('Schema không hợp lệ từ AI')
        if (attempt === 1) { baseName = parsed.baseName || ''; summary = parsed.summary || ''; allTables = parsed.tables }
        else { const ex = new Set(allTables.map((t: any) => t.name as string)); for (const t of parsed.tables) { if (!ex.has(t.name)) { allTables.push(t); ex.add(t.name) } } }
        const returnedNames = new Set(allTables.map((t: any) => t.name as string))
        if (improveFullSchema.every(t => returnedNames.has(t.name))) break
      }
      const returnedNames = new Set(allTables.map((t: any) => t.name as string))
      const missingNames = improveFullSchema.filter(t => !returnedNames.has(t.name)).map(t => t.name)
      if (missingNames.length > 0) {
        setImproveRetryInfo(`Cảnh báo: ${missingNames.length} bảng vắng sau 3 lần — ${missingNames.slice(0, 3).join(', ')}${missingNames.length > 3 ? '…' : ''}`)
        message.warning(`${missingNames.length} bảng chưa được AI trả về`)
      } else { setImproveRetryInfo(null) }
      const tableNameSet = new Set(allTables.map((t: any) => t.name as string))
      for (const table of allTables) for (const field of table.fields || []) {
        if ((field.type === 18 || field.type === 21) && field.linkTable && !tableNameSet.has(field.linkTable)) { delete field.linkTable; field.type = 1; field.typeName = 'Text' }
      }
      const merged: GeneratedSchema = { baseName: baseName || `${improveBase?.name ?? 'Base'} (Improved)`, summary, tables: allTables }
      setSchema(merged); setComposeStep(2); setImproveWizardStep('schema')
      finishAIOp(opId, true, `${allTables.length}/${inputTableCount} bảng`)
      if (merged.baseName && !newBaseName) setNewBaseName(merged.baseName)
    } catch (e: any) { finishAIOp(opId, false, '', e.message); setComposeError(e.message); setComposeStep(0) }
    finally { setComposeLoading(false) }
  }

  // ── Apply add-fields (improve → patch existing base) ───────────────────────
  async function applyAddFields() {
    if (!schema || !improveBase) return
    setImproveApplying(true); setCreateLog([]); setFieldResults([]); setComposeStep(3); setSchemaDiff(null)
    const log = (msg: string, ok = true) => setCreateLog(p => [...p, { msg, ok }])
    const opId = logAIOp('apply-add-fields', `Patch "${improveBase.name}"`)
    try {
      log(`Đang áp dụng cải tiến vào "${improveBase.name}"…`)
      const res = await fetch(`${API_ORIGIN}/api-base/lark/v2/patch-schema`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
        body: JSON.stringify({ appToken: improveBase.appToken, existingTables: improveFullSchema, improvedTables: schema.tables }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Patch failed')
      const results = data.data.results || []
      results.forEach((r: any) => log(`${r.table}: ${r.created ?? 0} cột mới${r.errors?.length ? `, ${r.errors.length} lỗi` : ''}`, !r.errors?.length))
      setSchemaDiff(computeSchemaDiff(improveFullSchema, schema.tables))
      setCreatedBase({ appToken: improveBase.appToken, url: improveBase.url, name: improveBase.name })
      setComposeStep(6); finishAIOp(opId, true, `${results.length} tables patched`)
      message.success('Đã áp dụng cải tiến vào base hiện có!')
    } catch (e: any) { finishAIOp(opId, false, '', e.message); log(e.message, false); setComposeStep(2) }
    finally { setImproveApplying(false) }
  }

  // ── Create base ─────────────────────────────────────────────────────────────
  async function createBase() {
    if (!schema) return
    setCreating(true); setCreateLog([]); setCreatedBase(null); setFieldResults([]); setViDocs(''); setComposeStep(3)
    setSampleData([]); setInsertLog([]); setDocUrl(null); setDocError(null); setDocsPermError(false); setSchemaDiff(null)
    setChatHistory([]); setChatInput('')
    const log = (msg: string, ok = true) => setCreateLog(p => [...p, { msg, ok }])
    const startedAt = startExec()
    const opId = logAIOp('create-base', `${schema.tables.length} tables`)
    try {
      const linkMap: Record<string, string> = {}
      if (destMode === 'existing') destTables.forEach(t => { linkMap[t.name] = t.tableId })
      log(destMode === 'new' ? `Đang tạo base "${schema.baseName}"…` : `Đang thêm bảng vào base hiện có…`)
      const res = await buildLarkSchema({
        userToken: userToken!,
        tables: schema.tables.map(t => ({ name: t.name, fields: t.fields.map(f => ({ name: f.name, type: f.type, description: f.description, isPrimary: f.isPrimary, ...(f.options?.length ? { options: f.options } : {}), ...(f.linkTable ? { linkTable: f.linkTable } : {}) })) })),
        linkMap: Object.keys(linkMap).length ? linkMap : undefined,
        ...(destMode === 'existing' ? { targetAppToken: destToken } : { name: schema.baseName }),
      })
      if (!res.success) throw new Error(res.error || 'Create failed')
      if (destMode === 'new') log(`Base "${res.data.name}" đã tạo thành công`)
      res.data.tables.forEach((t: any) => log(`Bảng "${t.name}" — ${t.fieldCount} cột`))
      const allFields = res.data.fieldResults || []; setFieldResults(allFields)
      const okCount = allFields.filter((r: any) => !r.error).length; const failCount = allFields.filter((r: any) => r.error).length
      if (okCount) log(`${okCount} cột tạo thành công`); if (failCount) log(`${failCount} cột thất bại`, false)
      markExecStep('Tạo base & fields', startedAt)
      setCreatedBase({ appToken: res.data.appToken, url: res.data.url ?? null, name: res.data.name ?? 'Base' })
      finishAIOp(opId, true, `${res.data.tables.length} bảng`)
      message.success(destMode === 'new' ? 'Base created!' : 'Tables added!')
      setComposeStep(4)
      await generateAndInsertSampleData(schema, res.data.appToken, res.data.tables)
      markExecStep('Dữ liệu mẫu', startedAt)
      setComposeStep(5); generateViDocs(schema)
    } catch (e: any) { log(e.message, false); finishAIOp(opId, false, '', e.message); endExec(); setComposeStep(2) }
    finally { setCreating(false) }
  }

  // ── Sample data ─────────────────────────────────────────────────────────────
  async function generateAndInsertSampleData(schemaData: GeneratedSchema, appToken: string, createdTables: any[]) {
    setSampleDataLoading(true); setSampleData([])
    try {
      const res = await fetch(`${API_ORIGIN}/api/ai/sample-data-stream`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schema: schemaData, ...getAIParams() }),
      })
      if (!res.ok || !res.body) throw new Error(`API error: HTTP ${res.status}`)
      const full = await readUtf8Stream(res.body)
      if (full.startsWith(STREAM_ERROR_SENTINEL)) throw new Error(full.slice(STREAM_ERROR_SENTINEL.length))
      let parsed: any = null
      try { parsed = JSON.parse(full) } catch { const s = full.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim(); try { parsed = JSON.parse(s) } catch { } }
      if (!parsed?.tables?.length) return
      setSampleData(parsed.tables)
      setInsertingRecords(true)
      const payload = parsed.tables.map((t: any) => { const c = createdTables.find((x: any) => x.name === t.name); if (!c || !t.records?.length) return null; return { tableId: c.tableId, name: t.name, records: t.records } }).filter(Boolean)
      if (payload.length) {
        const insertRes = await fetch(`${API_ORIGIN}/api-base/lark/v2/insert-records`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` }, body: JSON.stringify({ appToken, tables: payload }) })
        const insertData = await insertRes.json(); if (insertData.results) setInsertLog(insertData.results)
      }
    } catch { } finally { setSampleDataLoading(false); setInsertingRecords(false) }
  }

  // ── Vietnamese docs ─────────────────────────────────────────────────────────
  async function generateViDocs(schemaData: GeneratedSchema) {
    setViDocsLoading(true); setViDocs('')
    try {
      const res = await fetch(`${API_ORIGIN}/api/ai/docs-stream`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schema: schemaData, ...getAIParams() }) })
      if (!res.ok || !res.body) throw new Error(`API error: HTTP ${res.status}`)
      const full = await readUtf8Stream(res.body, (_, acc) => setViDocs(acc))
      if (!full.startsWith(STREAM_ERROR_SENTINEL)) { setComposeStep(6); markExecStep('Tài liệu VI', execTiming.startedAt ?? Date.now()); endExec() }
    } catch { endExec() } finally { setViDocsLoading(false) }
  }

  function copyDocs() { navigator.clipboard.writeText(viDocs).then(() => { setDocsCopied(true); setTimeout(() => setDocsCopied(false), 2000) }) }

  async function pushToLarkDoc() {
    if (!viDocs || !userToken) return
    setPushingDoc(true); setDocError(null); setDocUrl(null); setDocsPermError(false)
    const opId = logAIOp('push-lark-doc', `${viDocs.length} chars`)
    try {
      const res = await fetch(`${API_ORIGIN}/api-base/lark/v2/push-doc`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` }, body: JSON.stringify({ title: schema?.baseName ? `Hướng dẫn: ${schema.baseName}` : 'Tài liệu Lark Base', content: viDocs }) })
      const data = await res.json()
      if (!data.success) { if (data.permissionError) setDocsPermError(true); throw new Error(data.error || 'Push failed') }
      setDocUrl(data.data.url); finishAIOp(opId, true, `documentId=${data.data.documentId}`); message.success('Đã tạo Lark Doc!')
    } catch (e: any) { finishAIOp(opId, false, '', e.message); setDocError(e.message) } finally { setPushingDoc(false) }
  }

  // ── AI enhance chat ─────────────────────────────────────────────────────────
  async function sendEnhance() {
    const msg = chatInput.trim(); if (!msg || !schema) return
    setChatLoading(true); setChatError(null); setChatStream('')
    const newHistory: ChatMsg[] = [...chatHistory, { role: 'user', content: msg }]
    setChatHistory(newHistory); setChatInput('')
    try {
      const res = await fetch(`${API_ORIGIN}/api/ai/enhance-stream`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schema, viDocs, history: chatHistory, userMessage: msg, ...getAIParams() }) })
      if (!res.ok || !res.body) throw new Error('Enhance request failed')
      const full = await readUtf8Stream(res.body, (_, acc) => setChatStream(acc))
      setChatStream('')
      if (full.startsWith(STREAM_ERROR_SENTINEL)) throw new Error(full.slice(STREAM_ERROR_SENTINEL.length))
      const DOCS_SEP = '===DOCS==='; const sepIdx = full.indexOf(DOCS_SEP)
      let schemaText = '', docsText = ''
      if (sepIdx !== -1) { schemaText = full.slice(0, sepIdx).trim(); docsText = full.slice(sepIdx + DOCS_SEP.length).trim() }
      else if (full.trim().startsWith('{')) { schemaText = full.trim() } else { docsText = full.trim() }
      let aiReplyParts: string[] = []
      if (schemaText) { const parsed = parseAISchema(schemaText); if (parsed?.tables?.length) { setSchema(parsed); aiReplyParts.push(`Schema cập nhật: ${parsed.tables.length} bảng`) } else { aiReplyParts.push('Schema không parse được — giữ nguyên') } }
      if (docsText) { setViDocs(docsText); aiReplyParts.push('Tài liệu đã cập nhật') }
      if (!aiReplyParts.length) aiReplyParts = [full.trim() || '(không có cập nhật)']
      setChatHistory([...newHistory, { role: 'assistant', content: aiReplyParts.join(' · ') }])
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    } catch (e: any) { setChatError(e.message || 'Enhance failed') } finally { setChatLoading(false) }
  }

  const schemaTableNames = new Set(schema?.tables.map(t => t.name) ?? [])

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <Title level={4} className="!mb-0">Compose New Base</Title>
          <Text className="text-neutral-500 text-sm">Tạo Base mới hoặc cải thiện Base hiện có với AI</Text>
        </div>
        <Space wrap>
          <Select size="small" placeholder="Chọn AI config" value={selectedAiConfigId || undefined}
            onChange={setSelectedAiConfigId} style={{ minWidth: 160 }}
            options={aiConfigs.map(c => ({ label: `${c.name} (${c.provider})`, value: c._id }))}
            notFoundContent={<span className="text-xs text-neutral-400">Chưa có — vào <a href="/settings/ai">Cài đặt → AI</a></span>}
          />
          {userToken ? (
            <Space>
              {userAvatar && <Avatar src={userAvatar} size="small" />}
              <Text className="text-sm">{userName || 'Lark User'}</Text>
              <Button size="small" danger onClick={handleLogout}>Logout</Button>
            </Space>
          ) : (
            <Button type="primary" size="small" icon={<LoginOutlined />} onClick={handleLogin}>Login Lark</Button>
          )}
        </Space>
      </div>

      {sessionExpired && (
        <Alert type="warning" showIcon className="mb-4" message="Session hết hạn"
          action={<Button size="small" type="primary" icon={<LoginOutlined />} onClick={handleLogin}>Re-login</Button>}
          closable onClose={() => setSessionExpired(false)} />
      )}

      {/* Login card */}
      {!userToken && !sessionExpired && (
        <Card>
          <div className="text-center py-8">
            <LoginOutlined className="text-5xl text-blue-300 mb-4" />
            <Title level={4}>Kết nối tài khoản Lark</Title>
            <Space direction="vertical" className="w-80">
              {larkAccounts.length > 0 ? (
                <Select className="w-full" placeholder="Chọn Lark App…" value={selectedAccountId || undefined}
                  onChange={id => { setSelectedAccountId(id); const acc = larkAccounts.find(a => a._id === id); if (acc) { setAppId(acc.appId); localStorage.setItem('lark_app_id', acc.appId) } }}
                  options={larkAccounts.map(a => ({ value: a._id, label: `${a.isDefault ? '⭐ ' : ''}${a.name} (${a.appId})` }))} />
              ) : (
                <Input placeholder="App ID (cli_…)" value={appId} onChange={e => setAppId(e.target.value)} />
              )}
              <Button type="primary" block icon={<LoginOutlined />} onClick={handleLogin}>Login với Lark OAuth</Button>
            </Space>
          </div>
        </Card>
      )}

      {userToken && (
        <>
          {/* Sub-mode selector */}
          <div className="mb-4 flex items-center gap-4 flex-wrap">
            <Segmented value={composeSubMode}
              onChange={v => { setComposeSubMode(v as 'create' | 'improve'); setSchema(null); setComposeError(null) }}
              options={[{ label: 'Tạo Base Mới từ Đầu', value: 'create' }, { label: 'Cải Thiện Base Hiện Có', value: 'improve' }]}
            />
            <Tooltip title={basesLoadedAt ? `Cập nhật lúc ${basesLoadedAt.toLocaleTimeString()} · Tự động load khi đăng nhập` : 'Tải danh sách bases'}>
              <Button size="small" icon={<ReloadOutlined />} onClick={handleLoadBases} loading={loadingBases}>
                {bases.length ? `Reload (${bases.length})` : 'Load Bases'}
              </Button>
            </Tooltip>
          </div>

          {basesError && <Alert type="error" showIcon closable className="mb-3" message="Failed to load bases" description={basesError} onClose={() => setBasesError(null)} />}

          <Row gutter={[16, 16]}>
            {/* Source panel (create mode) */}
            {composeSubMode === 'create' && (
              <Col xs={24} lg={10}>
                <Card size="small"
                  title={<Space><TableOutlined /><span>Source Bases</span>{ctxTables.length > 0 && <Tag color="blue">{ctxTables.length} bảng chọn</Tag>}</Space>}
                  extra={<Text className="text-xs text-neutral-400">Expand → chọn bảng làm AI context</Text>}
                >
                  {bases.length === 0 && !loadingBases && (
                    <Empty description={<span className="text-xs">Bấm Reload để tải danh sách bases</span>} imageStyle={{ height: 40 }} className="py-4" />
                  )}
                  {loadingBases && (
                    <div className="flex flex-col gap-2 py-2">
                      {[1,2,3].map(i => <Skeleton.Input key={i} active size="small" style={{ width: '100%' }} />)}
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5">
                    {bases.map(base => {
                      const expanded = srcExpanded.has(base.appToken)
                      const loading  = srcLoading[base.appToken]
                      const error    = srcError[base.appToken]
                      const tbls     = srcTables[base.appToken] || []
                      const selCount = ctxTables.filter(c => c.appToken === base.appToken).length
                      const allSel   = tbls.length > 0 && tbls.every(t => isCtxSelected(base.appToken, t.tableId))
                      return (
                        <div key={base.appToken} className="rounded border border-neutral-200 overflow-hidden">
                          <div className="flex items-center gap-2 px-2 py-1.5 bg-neutral-50 hover:bg-blue-50 cursor-pointer" onClick={() => toggleSrcBase(base)}>
                            <span className="text-neutral-400 text-xs w-3">{expanded ? '▼' : '▶'}</span>
                            <span className="text-sm font-medium flex-1 truncate">{base.name}</span>
                            {expanded && tbls.length > 0 && (
                              <Button size="small" type={allSel ? 'primary' : 'default'} className="text-xs"
                                onClick={e => { e.stopPropagation(); toggleSelectAll(base) }}>
                                {allSel ? 'Deselect All' : 'Select All'}
                              </Button>
                            )}
                            {selCount > 0 && <Tag color="blue" className="text-xs">{selCount} sel</Tag>}
                          </div>
                          {expanded && (
                            <div className="border-t border-neutral-100">
                              {loading && <div className="flex justify-center py-2"><Spin size="small" /></div>}
                              {error && <Alert type="error" showIcon className="m-2 text-xs" message={error} />}
                              {!loading && !error && tbls.length === 0 && <div className="text-center py-2 text-neutral-400 text-xs">No tables</div>}
                              {tbls.map(t => {
                                const checked = isCtxSelected(base.appToken, t.tableId)
                                const ctx     = ctxTables.find(c => c.key === `${base.appToken}:${t.tableId}`)
                                return (
                                  <div key={t.tableId}>
                                    <div className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer ${checked ? 'bg-green-50 hover:bg-green-100' : 'hover:bg-neutral-50'}`}
                                      onClick={() => toggleCtx(base, t)}>
                                      <Checkbox checked={checked} />
                                      <span className={`text-sm flex-1 ${checked ? 'text-green-700 font-medium' : ''}`}>{t.name}</span>
                                      {ctx?.fieldsLoading && <Spin size="small" />}
                                      {ctx?.fields && <Text className="text-xs text-neutral-400">{ctx.fields.length} fields</Text>}
                                    </div>
                                    {checked && ctx?.fields && (
                                      <div className="ml-8 mr-2 mb-2 pl-2 border-l-2 border-green-200 flex flex-col gap-0.5">
                                        {ctx.fields.slice(0, 5).map((f, fi) => (
                                          <div key={fi} className="flex items-center gap-1 text-xs">
                                            <Tag color={TYPE_COLOR[f.type] ?? 'default'} className="text-xs leading-none m-0">{f.typeName}</Tag>
                                            <span className="text-neutral-600 truncate">{f.name}</span>
                                          </div>
                                        ))}
                                        {ctx.fields.length > 5 && <Text className="text-xs text-neutral-400">+{ctx.fields.length - 5} more</Text>}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </Card>
              </Col>
            )}

            {/* Improve: base selector */}
            {composeSubMode === 'improve' && (
              <Col xs={24} lg={10}>
                <Card size="small" title={<Space><TableOutlined /><span>Chọn Base để Cải Thiện</span></Space>}
                  extra={improveBase && <Button size="small" icon={<ReloadOutlined />} loading={improveLoading} onClick={() => loadFullBaseSchema(improveBase)}>Tải lại</Button>}
                >
                  <Select style={{ width: '100%' }} placeholder="Chọn base cần cải thiện…" value={improveBase?.appToken}
                    onChange={val => { const b = bases.find(b => b.appToken === val); if (!b) return; setImproveBase(b); setImproveFullSchema([]); setImproveWizardStep('input'); setAiUnderstanding(null); setUnderstandingError(null); setImproveRetryInfo(null); loadFullBaseSchema(b) }}
                    options={bases.map(b => ({ value: b.appToken, label: b.name }))}
                  />
                  {improveLoading && (
                    <div className="mt-3 flex flex-col gap-2">
                      <Skeleton.Input active size="small" style={{ width: '80%' }} />
                      <Skeleton active paragraph={{ rows: 4 }} title={false} />
                    </div>
                  )}
                  {improveError && <Alert type="error" showIcon className="mt-2 text-xs" message={improveError} closable onClose={() => setImproveError(null)} />}
                  {improveFullSchema.length > 0 && (
                    <div className="mt-3">
                      <Text className="text-xs font-semibold text-neutral-600 block mb-2">{improveFullSchema.length} bảng — {improveFullSchema.reduce((n, t) => n + t.fields.length, 0)} cột</Text>
                      <div className="max-h-60 overflow-y-auto flex flex-col gap-1">
                        {improveFullSchema.map(t => (
                          <div key={t.tableId} className="flex items-center gap-2 px-2 py-1 rounded bg-neutral-50 border border-neutral-200 text-xs">
                            <TableOutlined className="text-blue-400" />
                            <span className="flex-1 font-medium truncate">{t.name}</span>
                            <Tag color="default" className="text-xs m-0">{t.fields.length} cột</Tag>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              </Col>
            )}

            {/* Composer panel */}
            <Col xs={24} lg={14}>
              {/* Destination (create mode) */}
              {composeSubMode === 'create' && (
                <Card size="small" className="mb-3" title="Destination">
                  <Segmented value={destMode} onChange={v => setDestMode(v as 'new' | 'existing')} className="mb-3"
                    options={[{ label: 'Tạo Base Mới', value: 'new' }, { label: 'Thêm vào Base Hiện Có', value: 'existing' }]} />
                  {destMode === 'existing' && (
                    <div>
                      <Text className="text-sm text-neutral-500 block mb-1">Chọn base đích — bảng mới sẽ được thêm vào đây</Text>
                      <Select style={{ width: '100%' }} placeholder="Chọn base…" value={destToken || undefined} onChange={handleDestChange}
                        options={bases.map(b => ({ value: b.appToken, label: b.name }))} />
                      {destTables.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {destTables.map(t => <Tag key={t.tableId} color="default" className="text-xs"><LinkOutlined className="mr-1" />{t.name}</Tag>)}
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              )}

              {/* AI Understanding (improve mode) */}
              {composeSubMode === 'improve' && (understandingLoading || aiUnderstanding || understandingError) && (
                <Card size="small" className="mb-3"
                  title={<Space><BulbOutlined className="text-yellow-500" /><span>AI Phân tích Schema</span>{aiUnderstanding?.overallHealth && <Tag color={aiUnderstanding.overallHealth === 'good' ? 'green' : aiUnderstanding.overallHealth === 'fair' ? 'orange' : 'red'}>{aiUnderstanding.overallHealth === 'good' ? 'Tốt' : aiUnderstanding.overallHealth === 'fair' ? 'Trung bình' : 'Cần cải thiện'}</Tag>}</Space>}
                  extra={aiUnderstanding && <Button size="small" type="text" onClick={() => { setAiUnderstanding(null); setImproveWizardStep('input') }}>Xóa</Button>}
                >
                  {understandingLoading && (
                    <div>
                      <div className="text-xs text-neutral-400 mb-2 flex items-center gap-2">
                        <span className="inline-block w-1.5 h-1.5 bg-yellow-400 rounded-full animate-bounce" />
                        Đang phân tích {improveFullSchema.length} bảng…
                      </div>
                      {understandingStream
                        ? <div className="bg-neutral-900 rounded p-2 max-h-24 overflow-y-auto"><Text className="text-xs text-green-400 font-mono whitespace-pre-wrap">{understandingStream.slice(0, 400)}</Text></div>
                        : <Skeleton active paragraph={{ rows: 3 }} title={false} />
                      }
                    </div>
                  )}
                  {understandingError && <Alert type="error" showIcon className="text-xs" message={understandingError} closable onClose={() => setUnderstandingError(null)} />}
                  {aiUnderstanding && !understandingLoading && (
                    <div className="flex flex-col gap-2">
                      {aiUnderstanding.domain && <Tag color="blue">{aiUnderstanding.domain}</Tag>}
                      {aiUnderstanding.summary && <Text className="text-xs text-neutral-600">{aiUnderstanding.summary}</Text>}
                      {(aiUnderstanding.topImprovements || []).length > 0 && (
                        <div>
                          <Text className="text-xs font-semibold text-neutral-500 block mb-1">Cải tiến quan trọng:</Text>
                          {(aiUnderstanding.topImprovements as string[]).map((imp, i) => (
                            <div key={i} className="flex items-start gap-1.5 text-xs"><span className="text-green-500">▸</span><span>{imp}</span></div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              )}

              {/* Apply mode (improve mode) */}
              {composeSubMode === 'improve' && improveFullSchema.length > 0 && (
                <Card size="small" className="mb-3" title="Cách áp dụng cải tiến">
                  <Segmented value={improveApplyMode} onChange={v => setImproveApplyMode(v as 'create-new' | 'add-fields')} className="mb-3"
                    options={[{ label: 'Tạo Base Mới (an toàn)', value: 'create-new' }, { label: 'Thêm vào Base Hiện Có', value: 'add-fields' }]} />
                  {improveApplyMode === 'create-new' && <Alert type="info" showIcon className="text-xs" message="Tạo base hoàn toàn mới. Base cũ không bị thay đổi." />}
                  {improveApplyMode === 'add-fields' && <Alert type="warning" showIcon className="text-xs" message="Thêm cột mới vào bảng hiện có. Không xóa dữ liệu cũ." />}
                </Card>
              )}

              {/* Context summary (create mode) */}
              {composeSubMode === 'create' && ctxTables.length > 0 && (
                <Card size="small" className="mb-3" title={`AI Context — ${ctxTables.length} bảng`} extra={<Button size="small" type="text" danger onClick={() => setCtxTables([])}>Clear all</Button>}>
                  <div className="flex flex-wrap gap-1">
                    {ctxTables.map(c => (
                      <Tag key={c.key} color="blue" closable onClose={() => setCtxTables(p => p.filter(x => x.key !== c.key))}>
                        {c.baseName} / {c.tableName}
                        {c.fields && <span className="ml-1 opacity-60">({c.fields.length}f)</span>}
                        {c.fieldsLoading && <Spin size="small" className="ml-1" />}
                      </Tag>
                    ))}
                  </div>
                </Card>
              )}

              {/* Progress steps */}
              {composeStep > 0 && (
                <Card size="small" className="mb-3"
                  title={<Space><RobotOutlined className="text-purple-500" /><span>Tiến trình</span>
                    {execTiming.startedAt && <Tag color="blue" className="text-xs font-mono">{execTiming.endedAt ? `${((execTiming.endedAt - execTiming.startedAt) / 1000).toFixed(1)}s` : `${((Date.now() - execTiming.startedAt) / 1000).toFixed(0)}s…`}</Tag>}
                  </Space>}
                >
                  <Steps size="small" current={composeStep - 1} status={composeError ? 'error' : composeStep >= 6 ? 'finish' : 'process'}
                    items={[
                      { title: 'AI tạo schema',   icon: composeStep === 1 ? <LoadingOutlined /> : undefined },
                      { title: 'Schema sẵn sàng', icon: composeStep === 2 && !creating ? <CheckCircleOutlined className="text-green-500" /> : undefined },
                      { title: 'Tạo trong Lark',  icon: composeStep === 3 ? <LoadingOutlined /> : undefined },
                      { title: 'Dữ liệu mẫu',     icon: composeStep === 4 ? <LoadingOutlined /> : undefined },
                      { title: 'Tài liệu VI',      icon: composeStep === 5 ? <LoadingOutlined /> : undefined },
                      { title: 'Hoàn thành',       icon: composeStep >= 6 ? <CheckCircleOutlined className="text-green-500" /> : undefined },
                    ]}
                  />
                  {execTiming.steps.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {execTiming.steps.map((s, i) => <Tag key={i} color="default" className="text-xs font-mono">{s.name}: {(s.ms / 1000).toFixed(1)}s</Tag>)}
                      {execTiming.endedAt && execTiming.startedAt && <Tag color="green" className="text-xs font-mono font-semibold">Tổng: {((execTiming.endedAt - execTiming.startedAt) / 1000).toFixed(1)}s</Tag>}
                    </div>
                  )}
                  {composeStep === 1 && streamText && (
                    <div className={`mt-3 rounded p-3 max-h-48 overflow-y-auto ${streamDarkMode ? 'bg-neutral-900' : 'bg-neutral-50 border'}`}>
                      <div className="flex justify-end mb-1">
                        <Button size="small" type="text" className={streamDarkMode ? 'text-neutral-400' : 'text-neutral-500'} onClick={() => setStreamDarkMode(v => !v)}>{streamDarkMode ? '☀ Light' : '🌙 Dark'}</Button>
                      </div>
                      <Text className={`text-xs font-mono whitespace-pre-wrap break-all ${streamDarkMode ? 'text-green-400' : 'text-neutral-700'}`}>{streamText}</Text>
                    </div>
                  )}
                </Card>
              )}

              {/* Generate card */}
              <Card size="small" className="mb-3"
                title={<><RobotOutlined className="text-purple-500 mr-1" />{composeSubMode === 'improve' ? 'Cải Thiện Schema với AI' : 'Generate Schema với AI'}</>}
              >
                <div className="flex flex-col gap-3">
                  {composeSubMode === 'create' && destMode === 'new' && (
                    <div>
                      <Text className="text-sm font-medium block mb-1">Tên base mới *</Text>
                      <Input placeholder="VD: Hệ thống CRM, Quản lý nhân sự…" value={newBaseName} onChange={e => setNewBaseName(e.target.value)} />
                    </div>
                  )}
                  {/* Prompt builder */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Text className="text-sm font-medium">Prompt Builder</Text>
                      <Button size="small" type="text" onClick={() => setShowPromptBuilder(v => !v)}>{showPromptBuilder ? '▲ Thu gọn' : '▼ Mở trợ lý'}</Button>
                    </div>
                    {showPromptBuilder && (
                      <div className="border border-neutral-200 rounded p-3 bg-neutral-50 flex flex-col gap-3">
                        <div>
                          <Text className="text-xs font-medium text-neutral-600 block mb-1">Lĩnh vực</Text>
                          <Select mode="multiple" style={{ width: '100%' }} size="small" placeholder="Chọn lĩnh vực…" value={promptDomains} onChange={setPromptDomains} options={DOMAINS.map(d => ({ value: d, label: d }))} />
                        </div>
                        <div>
                          <Text className="text-xs font-medium text-neutral-600 block mb-1">Yêu cầu chức năng</Text>
                          <div className="flex flex-wrap gap-1.5">
                            {REQUIREMENTS.map(r => (
                              <Tag.CheckableTag key={r} checked={promptRequirements.includes(r)} onChange={checked => setPromptRequirements(prev => checked ? [...prev, r] : prev.filter(x => x !== r))}>{r}</Tag.CheckableTag>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-3 flex-wrap">
                          <div className="flex-1 min-w-[130px]">
                            <Text className="text-xs font-medium text-neutral-600 block mb-1">Ngôn ngữ</Text>
                            <Segmented size="small" value={promptLanguage} onChange={v => setPromptLanguage(v as 'vi' | 'en')} options={[{ label: '🇻🇳 Tiếng Việt', value: 'vi' }, { label: '🇬🇧 English', value: 'en' }]} />
                          </div>
                          {composeSubMode === 'create' && (
                            <div className="flex-1 min-w-[160px]">
                              <Text className="text-xs font-medium text-neutral-600 block mb-1">Số bảng</Text>
                              <Select size="small" style={{ width: '100%' }} value={promptTableCount} onChange={setPromptTableCount} options={[{ value: 'auto', label: 'Tự động (2–4)' }, ...TABLE_COUNT_OPTIONS]} />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div>
                    <Text className="text-sm font-medium block mb-1">{composeSubMode === 'improve' ? 'Mô tả cải tiến mong muốn' : 'Mô tả chi tiết yêu cầu'}</Text>
                    <TextArea rows={4} value={composePrompt} onChange={e => setComposePrompt(e.target.value)}
                      placeholder={composeSubMode === 'improve'
                        ? 'VD: "Thêm trường theo dõi trạng thái thanh toán. Chuẩn hóa options cho tất cả các trường Select."'
                        : 'Mô tả hệ thống bạn muốn xây dựng. VD: "CRM bán hàng: Khách hàng, Đơn hàng liên kết Khách hàng, Sản phẩm."'}
                    />
                  </div>
                  {/* Buttons */}
                  {composeSubMode === 'create' ? (
                    <Button type="primary" icon={<RobotOutlined />} block loading={composeLoading} onClick={generateSchema}
                      disabled={destMode === 'new' && !newBaseName.trim()}
                      className="bg-purple-600 hover:!bg-purple-700 border-purple-600">
                      {composeLoading ? 'Đang tạo schema…' : 'Generate Schema'}
                    </Button>
                  ) : (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      {improveWizardStep === 'input' && (
                        <Button icon={<BulbOutlined />} block loading={understandingLoading} onClick={analyzeBase} disabled={!improveFullSchema.length} style={{ borderColor: '#a855f7', color: '#a855f7' }}>
                          {understandingLoading ? 'Đang phân tích…' : `Phân tích nhanh ${improveFullSchema.length} bảng (tuỳ chọn)`}
                        </Button>
                      )}
                      <Button type="primary" icon={<RobotOutlined />} block loading={composeLoading} onClick={generateImproveSchema}
                        disabled={!improveFullSchema.length}
                        className="bg-purple-600 hover:!bg-purple-700 border-purple-600">
                        {composeLoading ? `Đang cải thiện ${improveFullSchema.length} bảng…` : `Tạo Schema Cải Thiện (${improveFullSchema.length} bảng)`}
                      </Button>
                    </Space>
                  )}
                  {improveRetryInfo && <Alert type="warning" showIcon className="text-xs" message={improveRetryInfo} />}
                  {composeError && <Alert type="error" showIcon closable message="Generation failed" description={composeError} onClose={() => setComposeError(null)} />}
                </div>
              </Card>

              {/* Generated schema */}
              {schema && (
                <Card size="small" className="mb-3"
                  title={<Space><BulbOutlined className="text-yellow-500" />{destMode === 'new' ? <Input value={schema.baseName} onChange={e => setSchema(s => s ? { ...s, baseName: e.target.value } : s)} className="font-semibold w-48" size="small" placeholder="Base name" /> : <span>Tables to add</span>}</Space>}
                  extra={
                    <Space>
                      <Button size="small" type="primary"
                        loading={creating || improveApplying}
                        onClick={composeSubMode === 'improve' && improveApplyMode === 'add-fields' ? applyAddFields : createBase}
                        icon={<SaveOutlined />}
                        className="bg-green-600 hover:!bg-green-700 border-green-600">
                        {creating || improveApplying ? 'Đang tạo…' : composeSubMode === 'improve' && improveApplyMode === 'add-fields' ? 'Áp dụng vào Base' : 'Tạo trong Lark'}
                      </Button>
                    </Space>
                  }
                >
                  {schema.summary && <Alert type="info" showIcon className="mb-3 text-xs" message={schema.summary} />}
                  <div className="flex flex-col gap-3">
                    {schema.tables.map((table, ti) => (
                      <div key={ti} className={`border rounded overflow-hidden ${!schemaTableNames.has(table.name) ? 'border-green-300' : 'border-neutral-200'}`}>
                        <div className={`px-3 py-2 flex items-center gap-2 ${!schemaTableNames.has(table.name) ? 'bg-green-50' : 'bg-neutral-50'}`}>
                          <Input size="small" value={table.name} onChange={e => setSchema(s => !s ? s : { ...s, tables: s.tables.map((t, i) => i !== ti ? t : { ...t, name: e.target.value }) })} className="font-semibold flex-1 max-w-[220px]" />
                          <Button size="small" icon={<PlusOutlined />} onClick={() => addField(ti)}>Field</Button>
                          <Button size="small" danger icon={<CloseCircleOutlined />} onClick={() => removeTable(ti)} />
                        </div>
                        <div className="divide-y divide-neutral-100">
                          {table.fields.map((field, fi) => (
                            <div key={fi} className="flex items-center gap-2 px-3 py-1.5">
                              {field.isPrimary && <Tag color="gold" className="text-xs m-0 shrink-0">PK</Tag>}
                              <Select size="small" value={field.type} style={{ width: 110 }}
                                onChange={v => { const ft = FIELD_TYPES.find(t => t.value === v)!; updateField(ti, fi, { type: v, typeName: ft.label }) }}
                                options={FIELD_TYPES.map(t => ({ value: t.value, label: t.label }))} />
                              <Input size="small" value={field.name} className="flex-1 font-medium" onChange={e => updateField(ti, fi, { name: e.target.value })} />
                              <Input size="small" value={field.description} placeholder="Description" style={{ width: 140 }} onChange={e => updateField(ti, fi, { description: e.target.value })} />
                              {!field.isPrimary && <Button size="small" type="text" danger icon={<CloseCircleOutlined />} onClick={() => removeField(ti, fi)} />}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Create log */}
              {createLog.length > 0 && (
                <Card size="small" className="mb-3"
                  title={<Space>{creating || improveApplying ? <><LoadingOutlined className="text-blue-500" /><span>Đang xử lý…</span></> : <><CheckCircleOutlined className="text-green-500" /><span>Kết quả</span></>}</Space>}
                  extra={createdBase?.url && <a href={createdBase.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600">Mở Base →</a>}
                >
                  <div className="flex flex-col gap-1">
                    {createLog.map((l, i) => (
                      <div key={i} className={`text-xs flex items-start gap-1.5 ${l.ok ? 'text-neutral-700' : 'text-red-600'}`}>
                        <span className="flex-shrink-0">{l.ok ? '✓' : '✗'}</span><span>{l.msg}</span>
                      </div>
                    ))}
                  </div>
                  {fieldResults.filter(r => r.error).length > 0 && (
                    <Collapse size="small" ghost className="mt-2">
                      <Collapse.Panel key="err" header={<Text className="text-xs text-red-500">{fieldResults.filter(r => r.error).length} cột lỗi chi tiết</Text>}>
                        {fieldResults.filter(r => r.error).map((r, i) => (
                          <div key={i} className="text-xs text-red-600">✗ [{r.table}] {r.field}: {r.error}</div>
                        ))}
                      </Collapse.Panel>
                    </Collapse>
                  )}
                  {schemaDiff && (
                    <div className="mt-3 flex flex-col gap-2 text-xs">
                      {schemaDiff.newTables.length > 0 && <div><Text className="font-semibold">+ Bảng mới:</Text> {schemaDiff.newTables.join(', ')}</div>}
                      {schemaDiff.addedFields.length > 0 && schemaDiff.addedFields.map(({ table, fields }) => <div key={table}><Tag color="blue" className="text-xs">{table}</Tag> + {fields.join(', ')}</div>)}
                      {schemaDiff.unchangedTables.length > 0 && <Text className="text-neutral-400">{schemaDiff.unchangedTables.length} bảng không thay đổi</Text>}
                    </div>
                  )}
                </Card>
              )}

              {/* Sample data */}
              {(sampleDataLoading || sampleData.length > 0) && createdBase && (
                <Card size="small" className="mb-3" title={sampleDataLoading ? <><LoadingOutlined className="text-blue-500 mr-1" />Đang tạo dữ liệu mẫu…</> : <><DatabaseOutlined className="text-green-600 mr-1" />Dữ liệu mẫu</>}>
                  {sampleDataLoading && !sampleData.length && (
                    <div className="flex flex-col gap-2"><Skeleton active paragraph={{ rows: 3 }} /></div>
                  )}
                  {sampleData.length > 0 && sampleData.map((table, ti) => (
                    <div key={ti} className="mb-3">
                      <Text className="text-xs font-semibold text-neutral-600 block mb-1">
                        {table.name}
                        {insertLog.find(l => l.table === table.name) && <Tag color={insertLog.find(l => l.table === table.name)?.error ? 'red' : 'green'} className="ml-2 text-xs">{insertLog.find(l => l.table === table.name)?.error ? 'Lỗi' : `${insertLog.find(l => l.table === table.name)?.count ?? 0} records`}</Tag>}
                      </Text>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead><tr className="bg-neutral-100">{table.records[0] && Object.keys(table.records[0]).map(k => <th key={k} className="px-2 py-1 border border-neutral-200 text-left font-medium text-neutral-600 whitespace-nowrap">{k}</th>)}</tr></thead>
                          <tbody>{table.records.map((rec, ri) => <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}>{Object.values(rec).map((v: any, vi) => <td key={vi} className="px-2 py-1 border border-neutral-200 text-neutral-700 max-w-[180px] truncate">{Array.isArray(v) ? v.join(', ') : String(v ?? '')}</td>)}</tr>)}</tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </Card>
              )}

              {/* Vietnamese docs */}
              {(viDocs || viDocsLoading) && (
                <Card size="small" className="mb-3"
                  title={viDocsLoading ? <><LoadingOutlined className="text-purple-500 mr-1" />Đang tạo tài liệu…</> : <><BookOutlined className="text-green-600 mr-1" />Tài liệu hướng dẫn</>}
                  extra={viDocs && !viDocsLoading && (
                    <Space size="small">
                      <Button size="small" icon={<CopyOutlined />} type={docsCopied ? 'primary' : 'default'} onClick={copyDocs}>{docsCopied ? 'Đã copy' : 'Copy'}</Button>
                      <Button size="small" icon={<FileTextOutlined />} loading={pushingDoc} onClick={pushToLarkDoc}>{docUrl ? 'Đã tạo Doc' : 'Push to Lark Doc'}</Button>
                    </Space>
                  )}
                >
                  {viDocsLoading && !viDocs && <Skeleton active paragraph={{ rows: 5 }} />}
                  {viDocs && (
                    <div className="bg-neutral-50 rounded p-3 max-h-96 overflow-y-auto font-mono text-xs leading-relaxed whitespace-pre-wrap text-neutral-800 border border-neutral-200">
                      {viDocs}{viDocsLoading && <span className="animate-pulse text-purple-400">▌</span>}
                    </div>
                  )}
                  {docError && !docsPermError && <Alert type="error" showIcon className="mt-2 text-xs" message={docError} />}
                  {docUrl && <a href={docUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline mt-2 block">Mở Lark Doc →</a>}
                </Card>
              )}

              {/* AI enhance chat */}
              {schema && (
                <Card size="small"
                  title={<Space><RobotOutlined className="text-purple-500" /><span>Cải thiện Schema / Tài liệu</span>{chatHistory.length > 0 && <Tag color="purple">{Math.ceil(chatHistory.length / 2)} lượt</Tag>}</Space>}
                  extra={chatHistory.length > 0 && <Button size="small" type="text" danger onClick={() => { setChatHistory([]); setChatError(null) }}>Xóa lịch sử</Button>}
                >
                  {chatHistory.length > 0 && (
                    <div className="max-h-64 overflow-y-auto flex flex-col gap-2 mb-3 p-2 bg-neutral-50 rounded border">
                      {chatHistory.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] rounded px-2.5 py-1.5 text-xs leading-relaxed whitespace-pre-wrap ${msg.role === 'user' ? 'bg-purple-600 text-white' : 'bg-white border text-neutral-700'}`}>{msg.content}</div>
                        </div>
                      ))}
                      {chatLoading && chatStream && <div className="flex justify-start"><div className="max-w-[85%] bg-white border border-purple-200 rounded px-2.5 py-1.5 text-xs"><span className="text-neutral-500 whitespace-pre-wrap">{chatStream.slice(0, 400)}</span><span className="animate-pulse text-purple-400">▌</span></div></div>}
                      {chatLoading && !chatStream && <div className="flex justify-start"><div className="bg-white border rounded px-3 py-2"><Spin size="small" /></div></div>}
                      <div ref={chatBottomRef} />
                    </div>
                  )}
                  {chatError && <Alert type="error" showIcon closable className="mb-2 text-xs" message={chatError} onClose={() => setChatError(null)} />}
                  {chatHistory.length === 0 && (
                    <div className="mb-2">
                      <div className="text-xs text-neutral-400 mb-1.5">Gợi ý:</div>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          'Thêm bảng Báo cáo liên kết với bảng chính',
                          'Cải thiện mô tả tất cả field cho người dùng mới',
                          'Thêm field trạng thái (Status) vào các bảng chính',
                          'Tạo lại tài liệu hướng dẫn chi tiết hơn',
                        ].map(q => (
                          <button key={q} type="button"
                            className="text-xs border border-dashed border-purple-300 rounded px-2 py-0.5 text-purple-600 hover:bg-purple-50 transition-colors text-left"
                            onClick={() => setChatInput(q)}>
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <Space.Compact style={{ width: '100%' }}>
                    <Input value={chatInput} onChange={e => setChatInput(e.target.value)} onPressEnter={e => { if (!e.shiftKey) sendEnhance() }} placeholder="Mô tả cải tiến bạn muốn…" disabled={chatLoading} />
                    <Button type="primary" icon={<SendOutlined />} onClick={sendEnhance} loading={chatLoading} disabled={!chatInput.trim()} className="bg-purple-600 hover:!bg-purple-700 border-purple-600">Gửi</Button>
                  </Space.Compact>
                </Card>
              )}
            </Col>
          </Row>
        </>
      )}
      <TourGuide pageKey="compose-new" steps={tourSteps['compose-new']} />
    </div>
  )
}
