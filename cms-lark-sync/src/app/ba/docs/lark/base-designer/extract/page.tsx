'use client'

import {
  Alert, Avatar, Badge, Button, Card, Col, Empty,
  Input, Modal, Popconfirm, Row, Select, Skeleton, Space,
  Tag, Tooltip, Typography, message,
} from 'antd'
import {
  BranchesOutlined, CheckCircleOutlined, ClockCircleOutlined, CopyOutlined,
  DatabaseOutlined, DeleteOutlined, DownOutlined, DownloadOutlined,
  FileTextOutlined, HistoryOutlined, LoginOutlined, PlusOutlined,
  ReloadOutlined, RobotOutlined, SaveOutlined, SendOutlined, UpOutlined,
} from '@ant-design/icons'
import React, { useCallback, useRef, useState } from 'react'
import { getLarkFields, getLarkTables, batchUpdateLarkFields } from '@/lib/api'
import { useCommon } from '../_lib/useCommon'
import {
  generateMermaid, utf8ToBase64, parseAISchema, STREAM_ERROR_SENTINEL,
  persistAILog, readUtf8Stream, decodeUnicodeEscapes, parseSimpleMarkdown,
} from '../_lib/utils'
import { TYPE_COLOR } from '../_lib/constants'
import type { AILogEntry, ChatMsg, ExtractFieldPatch, ExtractTablePatch } from '../_lib/types'

const { Title, Text } = Typography
const { TextArea } = Input

// ─── Backend URLs ──────────────────────────────────────────────────────────────
const API_BASE   = process.env.NEXT_PUBLIC_API_BASE || 'https://apihoanam.toolswave.net/api'
const API_ORIGIN = API_BASE.replace(/\/api$/, '')

/** Separator the AI must write between its explanation and the JSON schema */
const SCHEMA_SEP = '\n---SCHEMA---\n'

type ExtractTable = { tableId: string; name: string; fields: any[] }

interface ChatSession {
  _id: string
  baseToken: string
  baseName: string
  messages: Array<{ role: string; content: string; patch?: ExtractTablePatch[] | null; timestamp: string }>
  docsContent?: string | null
  updatedAt: string
}

// ── Markdown renderer ─────────────────────────────────────────────────────────
function MdText({ text, className }: { text: string; className?: string }) {
  const tokens = parseSimpleMarkdown(decodeUnicodeEscapes(text))
  return (
    <span className={className}>
      {tokens.map((tok, i) => {
        if (tok.type === 'br')     return <br key={i} />
        if (tok.type === 'bold')   return <strong key={i}>{tok.value}</strong>
        if (tok.type === 'italic') return <em key={i}>{tok.value}</em>
        if (tok.type === 'code')
          return <code key={i} className="bg-black/10 rounded px-0.5 font-mono text-[10px]">{tok.value}</code>
        return <React.Fragment key={i}>{tok.value}</React.Fragment>
      })}
    </span>
  )
}

// ── Typing dots ───────────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <span className="inline-flex gap-0.5 ml-1">
      {[0, 150, 300].map(d => (
        <span key={d}
          className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce"
          style={{ animationDelay: `${d}ms` }} />
      ))}
    </span>
  )
}

// ── Streaming bubble — shows readable Vietnamese text as it arrives ────────────
function StreamingBubble({ textPart, isBeforeSchema }: { textPart: string; isBeforeSchema: boolean }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] rounded-2xl rounded-bl-none px-3 py-2.5 text-xs leading-relaxed bg-white border border-purple-100 shadow-sm">
        {textPart ? (
          <>
            <MdText text={textPart} />
            {isBeforeSchema && <TypingDots />}
            {!isBeforeSchema && (
              <span className="text-purple-400 italic ml-1 text-[10px]">
                đang xử lý schema…
              </span>
            )}
          </>
        ) : (
          <div className="flex items-center gap-1.5 text-neutral-400">
            <RobotOutlined className="text-purple-400" />
            <span>AI đang phân tích schema</span>
            <TypingDots />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Follow-up prompt chips ────────────────────────────────────────────────────
function getFollowUps(lastPatch: ExtractTablePatch[] | null, turns: number): string[] {
  if (lastPatch?.length) return [
    'Giải thích thêm lý do của từng thay đổi',
    'Có field nào nên thêm vào để hoàn thiện hơn không?',
    'Thêm mô tả chi tiết hơn cho tất cả field',
    'Tối ưu thêm kiểu dữ liệu các field còn lại',
  ]
  if (turns > 1) return [
    'Tổng kết lại tất cả cải tiến đã đề xuất',
    'Có điều gì chưa được cải thiện trong schema không?',
    'Đề xuất thêm bảng hoặc field còn thiếu',
    'Phân tích lại mối quan hệ giữa các bảng',
  ]
  return [
    'Phân tích schema và cho biết có thể cải thiện gì',
    'Đổi tên tất cả field sang tiếng Việt rõ nghĩa hơn',
    'Thêm mô tả cho tất cả field chưa có description',
    'Chuẩn hóa tên field theo convention camelCase',
    'Đặt lại tên field bằng tiếng Anh chuyên nghiệp',
    'Thêm link field kết nối các bảng có liên quan',
  ]
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ExtractPage() {
  const {
    userToken, userName, userAvatar, appId, setAppId, sessionExpired, setSessionExpired,
    larkAccounts, selectedAccountId, setSelectedAccountId,
    aiConfigs, selectedAiConfigId, setSelectedAiConfigId, getAIParams,
    bases, loadingBases, basesError, setBasesError, loadBases, basesLoadedAt,
    handleLogin, handleLogout,
  } = useCommon()

  // ── Extract state ─────────────────────────────────────────────────────────
  const [extractBase,    setExtractBase]    = useState<{ appToken: string; name: string; url: string } | null>(null)
  const [extractSchema,  setExtractSchema]  = useState<ExtractTable[]>([])
  const [extractLoading, setExtractLoading] = useState(false)
  const [extractError,   setExtractError]   = useState<string | null>(null)
  const [extractedAt,    setExtractedAt]    = useState<Date | null>(null)

  const [collapsedTables, setCollapsedTables] = useState<Set<string>>(new Set())
  const [tableSearch,     setTableSearch]     = useState('')

  // ── Chat state ────────────────────────────────────────────────────────────
  const [chatHistory,     setChatHistory]    = useState<ChatMsg[]>([])
  const [chatInput,       setChatInput]      = useState('')
  const [chatLoading,     setChatLoading]    = useState(false)
  const [chatError,       setChatError]      = useState<string | null>(null)
  const [isStreaming,     setIsStreaming]     = useState(false)
  /** readable Vietnamese text received so far (before ---SCHEMA--- separator) */
  const [streamTextPart,  setStreamTextPart] = useState('')
  /** true while we're still in the text part of the stream */
  const [beforeSchema,    setBeforeSchema]   = useState(true)
  const [lastPatch,       setLastPatch]      = useState<ExtractTablePatch[] | null>(null)
  const chatBottomRef = useRef<HTMLDivElement>(null)

  // ── Patch state ───────────────────────────────────────────────────────────
  const [pendingPatch, setPendingPatch] = useState<ExtractTablePatch[] | null>(null)
  const [applying,     setApplying]     = useState(false)
  const [applyLog,     setApplyLog]     = useState<{ table: string; ok: number; fail: number }[]>([])

  // ── Import state ──────────────────────────────────────────────────────────
  const [aiImprovedSchema, setAiImprovedSchema] = useState<any>(null)
  const [importModalOpen,  setImportModalOpen]  = useState(false)
  const [importMode,       setImportMode]       = useState<'patch-existing' | 'create-new'>('patch-existing')
  const [importing,        setImporting]        = useState(false)
  const [importLog,        setImportLog]        = useState<{ msg: string; ok: boolean }[]>([])
  const [importDone,       setImportDone]       = useState(false)

  // ── Docs state ────────────────────────────────────────────────────────────
  const [docsContent,    setDocsContent]    = useState<string | null>(null)
  const [docsModalOpen,  setDocsModalOpen]  = useState(false)
  const [docsGenerating, setDocsGenerating] = useState(false)
  const [docsLiveText,   setDocsLiveText]   = useState('')

  // ── Session DB state ──────────────────────────────────────────────────────
  const [sessions,        setSessions]        = useState<ChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [sessionsLoading, setSessionsLoading] = useState(false)

  const aiLogRef = useRef<AILogEntry[]>([])
  function logAIOp(step: string, inputSummary: string): string {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    aiLogRef.current = [...aiLogRef.current, { id, timestamp: Date.now(), step, status: 'running', inputSummary, outputSummary: '' }]
    return id
  }
  function finishAIOp(id: string, ok: boolean, outputSummary: string, error?: string) {
    aiLogRef.current = aiLogRef.current.map(e => e.id !== id ? e : {
      ...e, status: ok ? 'success' : 'error', outputSummary,
      durationMs: Date.now() - e.timestamp, error,
    })
    persistAILog(aiLogRef.current.filter(e => e.status !== 'running'))
  }

  // ── Sessions ──────────────────────────────────────────────────────────────
  const loadSessions = useCallback(async (baseToken: string) => {
    setSessionsLoading(true)
    try {
      const res  = await fetch(`${API_BASE}/extract-chats?baseToken=${encodeURIComponent(baseToken)}`)
      const data = await res.json()
      if (data.success) setSessions(data.data ?? [])
    } catch { /* ignore */ }
    finally { setSessionsLoading(false) }
  }, [])

  function restoreSession(session: ChatSession) {
    setChatHistory(session.messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })))
    const lastAI = [...session.messages].reverse().find(m => m.role === 'assistant' && m.patch?.length)
    if (lastAI?.patch) { setPendingPatch(lastAI.patch as ExtractTablePatch[]); setLastPatch(lastAI.patch as ExtractTablePatch[]) }
    if (session.docsContent) setDocsContent(session.docsContent)
    setActiveSessionId(session._id)
    setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    message.success('Đã khôi phục hội thoại')
  }

  async function saveSession(newMsgs: Array<{ role: string; content: string; patch?: ExtractTablePatch[] | null }>) {
    if (!extractBase) return
    try {
      if (activeSessionId) {
        await fetch(`${API_BASE}/extract-chats/${activeSessionId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: newMsgs }),
        })
      } else {
        const res  = await fetch(`${API_BASE}/extract-chats`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ baseToken: extractBase.appToken, baseName: extractBase.name, schemaSnapshot: extractSchema, messages: newMsgs }),
        })
        const data = await res.json()
        if (data.success) setActiveSessionId(data.data._id)
      }
    } catch { /* non-critical */ }
  }

  async function saveDocsToSession(docs: string) {
    if (!activeSessionId) return
    try {
      await fetch(`${API_BASE}/extract-chats/${activeSessionId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docsContent: docs }),
      })
    } catch { /* non-critical */ }
  }

  // ── Extract schema from Lark ──────────────────────────────────────────────
  async function loadExtractSchema() {
    if (!extractBase) { message.warning('Chọn Base trước'); return }
    setExtractLoading(true); setExtractError(null); setExtractSchema([])
    setPendingPatch(null); setApplyLog([]); setChatHistory([]); setChatError(null)
    setCollapsedTables(new Set()); setTableSearch(''); setLastPatch(null)
    setAiImprovedSchema(null); setImportLog([]); setImportDone(false)
    setActiveSessionId(null); setDocsContent(null)
    try {
      const tablesRes = await getLarkTables(extractBase.appToken)
      const tables = tablesRes.data
      if (!tables.length) { setExtractError('Base không có bảng nào'); return }
      const BATCH = 5
      const result: ExtractTable[] = []
      for (let i = 0; i < tables.length; i += BATCH) {
        const batch = tables.slice(i, i + BATCH)
        const fieldsArr = await Promise.all(batch.map(t =>
          getLarkFields(extractBase.appToken, t.tableId).then(r => r.data.map((f: any) => ({
            fieldId: f.fieldId, name: f.name, type: f.type, typeName: f.typeName,
            isPrimary: f.isPrimary, description: f.description ?? '',
            options: (f.type === 3 || f.type === 4)
              ? ((f.property?.options || []) as any[]).map((o: any) => o.name).filter(Boolean)
              : undefined,
            linkTableId: f.property?.table_id ?? null,
          })))
        ))
        batch.forEach((t, bi) => result.push({ tableId: t.tableId, name: t.name, fields: fieldsArr[bi] }))
      }
      setExtractSchema(result)
      setExtractedAt(new Date())
      message.success(`Đã extract ${result.length} bảng, ${result.reduce((n, t) => n + t.fields.length, 0)} cột`)
      await loadSessions(extractBase.appToken)
    } catch (e: any) {
      setExtractError(e.message || 'Tải schema thất bại')
    } finally {
      setExtractLoading(false)
    }
  }

  // ── Build patch from improved schema ─────────────────────────────────────
  function buildPatch(improved: any, current: ExtractTable[]): ExtractTablePatch[] {
    return current.flatMap(cur => {
      const imp = (improved.tables ?? []).find((t: any) => t.name === cur.name)
      if (!imp) return []
      const fields: ExtractFieldPatch[] = cur.fields.flatMap(cf => {
        const ifld = (imp.fields ?? []).find((f: any) => f.fieldId === cf.fieldId || f.name === cf.name)
        if (!ifld) return []
        const nameChanged = ifld.name && ifld.name !== cf.name && !cf.isPrimary && cf.type < 1001
        const descChanged = ifld.description !== undefined && ifld.description !== cf.description
        return (nameChanged || descChanged) ? [{
          fieldId: cf.fieldId, oldName: cf.name,
          newName: nameChanged ? ifld.name : undefined,
          oldDescription: cf.description,
          newDescription: descChanged ? ifld.description : undefined,
          changed: true,
        }] : []
      })
      return fields.length ? [{ tableId: cur.tableId, tableName: cur.name, fields, hasChanges: true }] : []
    })
  }

  // ── Send chat — uses hybrid endpoint ─────────────────────────────────────
  async function sendChat() {
    const msg = chatInput.trim()
    if (!msg || !extractSchema.length) return
    if (!selectedAiConfigId) { message.error('Chưa chọn AI config'); return }

    setChatLoading(true); setChatError(null)
    setIsStreaming(true); setStreamTextPart(''); setBeforeSchema(true)
    const newHistory: ChatMsg[] = [...chatHistory, { role: 'user', content: msg }]
    setChatHistory(newHistory); setChatInput('')
    setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)

    const opId = logAIOp('extract-chat', `"${msg.slice(0, 80)}", schema ${extractSchema.length} tables`)
    let fullResponse = ''
    try {
      const res = await fetch(`${API_ORIGIN}/api/ai/extract-chat-stream`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tables:   extractSchema,
          prompt:   msg,
          history:  chatHistory.slice(-8).map(m => ({ role: m.role, content: m.content.slice(0, 400) })),
          language: 'vi',
          ...getAIParams(),
        }),
      })
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

      // ── Stream: track text part and schema part separately ───────────────
      fullResponse = await readUtf8Stream(res.body, (_, accumulated) => {
        const sepIdx = accumulated.indexOf(SCHEMA_SEP)
        if (sepIdx === -1) {
          // Still reading the explanation text → show it directly
          setStreamTextPart(decodeUnicodeEscapes(accumulated))
          setBeforeSchema(true)
        } else {
          // Past the separator → show the text part, indicate schema is loading
          setStreamTextPart(decodeUnicodeEscapes(accumulated.slice(0, sepIdx).trim()))
          setBeforeSchema(false)
        }
        chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      })

      setIsStreaming(false); setStreamTextPart('')

      if (fullResponse.startsWith(STREAM_ERROR_SENTINEL)) {
        throw new Error(decodeUnicodeEscapes(fullResponse.slice(STREAM_ERROR_SENTINEL.length)))
      }

      // ── Split text part and schema part ──────────────────────────────────
      const sepIdx = fullResponse.indexOf(SCHEMA_SEP)
      const textPart   = sepIdx !== -1
        ? decodeUnicodeEscapes(fullResponse.slice(0, sepIdx).trim())
        : decodeUnicodeEscapes(fullResponse.trim())
      const schemaPart = sepIdx !== -1 ? fullResponse.slice(sepIdx + SCHEMA_SEP.length).trim() : ''

      // The chat message = readable explanation
      const aiReply = textPart || '(AI không trả về nội dung)'

      // Try parsing schema JSON from the second part
      let patch: ExtractTablePatch[] | null = null
      if (schemaPart) {
        const parsed = parseAISchema(schemaPart)
        if (parsed?.tables?.length) {
          setAiImprovedSchema(parsed)
          patch = buildPatch(parsed, extractSchema)
          setLastPatch(patch.length ? patch : null)
          setPendingPatch(patch.length ? patch : null)
        }
      }

      finishAIOp(opId, true, aiReply.slice(0, 100))
      const finalHistory: ChatMsg[] = [...newHistory, { role: 'assistant', content: aiReply }]
      setChatHistory(finalHistory)

      await saveSession([
        { role: 'user',      content: msg },
        { role: 'assistant', content: aiReply, patch },
      ])

      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    } catch (e: any) {
      setIsStreaming(false); setStreamTextPart('')
      finishAIOp(opId, false, '', e.message)
      const errMsg = decodeUnicodeEscapes(e.message || 'AI request failed')
      setChatError(errMsg)
      setChatHistory([...newHistory, { role: 'assistant', content: `Lỗi: ${errMsg}` }])
    } finally {
      setChatLoading(false)
    }
  }

  // ── Apply patch ───────────────────────────────────────────────────────────
  async function applyPatch() {
    if (!pendingPatch?.length || !extractBase) return
    setApplying(true); setApplyLog([])
    try {
      const results: { table: string; ok: number; fail: number }[] = []
      for (const tp of pendingPatch) {
        const updates = tp.fields
          .map(fp => ({ fieldId: fp.fieldId, name: fp.newName, description: fp.newDescription }))
          .filter(u => u.name !== undefined || u.description !== undefined)
        if (!updates.length) continue
        try {
          const res = await batchUpdateLarkFields(extractBase.appToken, tp.tableId, updates)
          results.push({ table: tp.tableName, ok: (res.results||[]).filter((r:any)=>r.success).length, fail: (res.results||[]).filter((r:any)=>!r.success).length })
        } catch {
          results.push({ table: tp.tableName, ok: 0, fail: updates.length })
        }
      }
      setApplyLog(results)
      const totalOk = results.reduce((n,r) => n+r.ok, 0), totalFail = results.reduce((n,r) => n+r.fail, 0)
      if (totalFail === 0) { message.success(`Áp dụng thành công ${totalOk} cập nhật!`); setPendingPatch(null); await loadExtractSchema() }
      else message.warning(`${totalOk} thành công, ${totalFail} thất bại`)
    } finally { setApplying(false) }
  }

  // ── Full import ───────────────────────────────────────────────────────────
  async function runImport() {
    if (!aiImprovedSchema || !extractBase || !userToken) return
    setImporting(true); setImportLog([]); setImportDone(false)
    const log = (msg: string, ok = true) => setImportLog(p => [...p, { msg, ok }])
    try {
      if (importMode === 'patch-existing') {
        log('Đang áp dụng schema cải tiến vào base hiện có…')
        const res  = await fetch(`${API_ORIGIN}/api-base/lark/v2/patch-schema`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
          body: JSON.stringify({ appToken: extractBase.appToken, existingTables: extractSchema, improvedTables: aiImprovedSchema.tables }),
        })
        const data = await res.json()
        if (!data.success) throw new Error(data.error || 'Import failed')
        const results: any[] = data.data.results ?? []
        const created = results.filter(r => r.action === 'created')
        const added   = results.filter(r => r.action === 'added' && r.success)
        const failed  = results.filter(r => !r.success)
        if (created.length) log(`${created.length} bảng mới: ${created.map((r:any)=>r.table).join(', ')}`)
        if (added.length)   log(`${added.length} field mới được thêm`)
        if (failed.length)  log(`${failed.length} thao tác thất bại`, false)
        log(`Hoàn thành! ${data.data.summary.ok} thành công, ${data.data.summary.fail} lỗi`)
      } else {
        log(`Đang tạo base mới "${aiImprovedSchema.baseName || 'Improved Base'}"…`)
        const res  = await fetch(`${API_ORIGIN}/api-base/lark/v2/bases/build-from-schema`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
          body: JSON.stringify({ userToken, name: aiImprovedSchema.baseName || `${extractBase.name} (Improved)`, tables: aiImprovedSchema.tables }),
        })
        const data = await res.json()
        if (!data.success) throw new Error(data.error || 'Create failed')
        log(`Base "${data.data.name}" đã tạo thành công`)
        data.data.tables?.forEach((t: any) => log(`Bảng "${t.name}" — ${t.fieldCount} cột`))
        if (data.data.url) log(`Mở base: ${data.data.url}`)
      }
      setImportDone(true); message.success('Hoàn thành!')
      await loadExtractSchema()
    } catch (e: any) {
      log(e.message || 'Thất bại', false)
    } finally { setImporting(false) }
  }

  // ── Generate schema docs ──────────────────────────────────────────────────
  async function generateDocs() {
    if (!extractSchema.length || !selectedAiConfigId) { message.warning('Cần extract schema và chọn AI config trước'); return }
    setDocsGenerating(true); setDocsLiveText(''); setDocsModalOpen(true)
    try {
      const res = await fetch(`${API_ORIGIN}/api/ai/schema-docs-stream`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseName:    extractBase?.name ?? 'Base',
          tables:      aiImprovedSchema?.tables ?? extractSchema,
          summary:     aiImprovedSchema?.summary ?? '',
          chatHistory: chatHistory.slice(-6),
          ...getAIParams(),
        }),
      })
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
      const full = await readUtf8Stream(res.body, (_, acc) => setDocsLiveText(decodeUnicodeEscapes(acc)))
      const decoded = decodeUnicodeEscapes(full)
      setDocsContent(decoded); setDocsLiveText('')
      await saveDocsToSession(decoded)
      message.success('Đã tạo tài liệu schema!')
    } catch (e: any) {
      message.error(`Lỗi tạo docs: ${e.message}`); setDocsModalOpen(false)
    } finally { setDocsGenerating(false) }
  }

  function downloadDocs() {
    if (!docsContent) return
    const name = `${extractBase?.name ?? 'Base'}__SCHEMA_DOCS`
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([docsContent], { type: 'text/markdown' })),
      download: `${name}.md`,
    })
    a.click(); URL.revokeObjectURL(a.href)
  }

  // ── Table helpers ─────────────────────────────────────────────────────────
  function toggleTable(id: string) {
    setCollapsedTables(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  const collapseAll = () => setCollapsedTables(new Set(extractSchema.map(t => t.tableId)))
  const expandAll   = () => setCollapsedTables(new Set())

  const filteredTables = tableSearch.trim()
    ? extractSchema.filter(t =>
        t.name.toLowerCase().includes(tableSearch.toLowerCase()) ||
        t.fields.some((f: any) => f.name.toLowerCase().includes(tableSearch.toLowerCase())))
    : extractSchema

  const mermaid   = extractSchema.length ? generateMermaid(extractSchema) : ''
  const liveUrl   = mermaid ? `https://mermaid.live/edit#base64:${utf8ToBase64(mermaid)}` : ''
  const totalCols = extractSchema.reduce((n, t) => n + t.fields.length, 0)
  const totalPatchChanges = pendingPatch?.reduce((n, t) => n + t.fields.length, 0) ?? 0
  const docName   = `${extractBase?.name ?? 'Base'}__SCHEMA_DOCS`
  const turns     = Math.ceil(chatHistory.length / 2)

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 max-w-6xl mx-auto">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <Title level={4} className="!mb-0">Extract Schema & AI</Title>
          <Text className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Xem cấu trúc Base · hỏi AI để cải thiện · cập nhật thẳng vào Lark
          </Text>
        </div>
        <Space wrap>
          <Select size="small" placeholder="Chọn AI config" value={selectedAiConfigId || undefined}
            onChange={setSelectedAiConfigId} style={{ minWidth: 170 }}
            options={aiConfigs.map(c => ({ label: `${c.name} (${c.provider})`, value: c._id }))}
            notFoundContent={<span className="text-xs text-neutral-400">Chưa có — <a href="/settings/ai">Cài đặt AI</a></span>}
          />
          {userToken ? (
            <Space size={4}>
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

      {/* ── Login card ──────────────────────────────────────────────────────── */}
      {!userToken && !sessionExpired && (
        <Card>
          <div className="text-center py-10">
            <LoginOutlined className="text-5xl text-blue-300 mb-4" />
            <Title level={4}>Kết nối tài khoản Lark</Title>
            <Space direction="vertical" className="w-80">
              {larkAccounts.length > 0 ? (
                <Select className="w-full" placeholder="Chọn Lark App…" value={selectedAccountId || undefined}
                  onChange={id => {
                    setSelectedAccountId(id)
                    const acc = larkAccounts.find(a => a._id === id)
                    if (acc) { setAppId(acc.appId); localStorage.setItem('lark_app_id', acc.appId) }
                  }}
                  options={larkAccounts.map(a => ({ value: a._id, label: `${a.isDefault ? '⭐ ' : ''}${a.name} (${a.appId})` }))}
                />
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
          {/* ── Base selector ────────────────────────────────────────────────── */}
          <Card size="small" className="mb-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Tooltip title={basesLoadedAt ? `Cập nhật lúc ${basesLoadedAt.toLocaleTimeString()}` : 'Tải bases'}>
                <Button icon={<ReloadOutlined />} onClick={loadBases} loading={loadingBases} size="small">
                  {bases.length ? `Reload (${bases.length})` : 'Load Bases'}
                </Button>
              </Tooltip>
              <Select
                placeholder="Chọn Base…" value={extractBase?.appToken || undefined}
                onChange={tok => {
                  setExtractBase(bases.find(b => b.appToken === tok) ?? null)
                  setExtractSchema([]); setExtractedAt(null)
                  setSessions([]); setActiveSessionId(null)
                  setChatHistory([]); setPendingPatch(null); setLastPatch(null)
                  setAiImprovedSchema(null); setDocsContent(null)
                }}
                options={bases.map(b => ({ label: b.name, value: b.appToken }))}
                showSearch filterOption={(s, o) => (o?.label as string ?? '').toLowerCase().includes(s.toLowerCase())}
                style={{ minWidth: 260 }}
                notFoundContent={bases.length === 0 ? 'Bấm Load Bases trước' : 'Không tìm thấy'}
              />
              <Button type="primary" icon={<DatabaseOutlined />} loading={extractLoading}
                disabled={!extractBase || loadingBases} onClick={loadExtractSchema}>
                {extractLoading ? 'Đang extract…' : 'Load & Extract Schema'}
              </Button>
              {extractSchema.length > 0 && (
                <Space size={4}>
                  <Tag color="green">{extractSchema.length} bảng · {totalCols} cột</Tag>
                  {extractedAt && (
                    <Tag icon={<ClockCircleOutlined />} color="default" className="cursor-default">
                      {extractedAt.toLocaleTimeString()}
                    </Tag>
                  )}
                </Space>
              )}
            </div>
            {basesError   && <Alert type="error" showIcon className="mt-2" message={basesError}   closable onClose={() => setBasesError(null)} />}
            {extractError && <Alert type="error" showIcon className="mt-2" message={extractError} closable onClose={() => setExtractError(null)} />}
          </Card>

          {/* ── Skeleton ─────────────────────────────────────────────────────── */}
          {extractLoading && (
            <Row gutter={[16,16]}>
              <Col xs={24} lg={10}>
                <Card size="small" title="Đang tải schema…">
                  {[1,2,3].map(i => <div key={i} className="mb-4"><Skeleton.Input active size="small" style={{width:'60%'}} className="mb-2"/><Skeleton active paragraph={{rows:3}} title={false}/></div>)}
                </Card>
              </Col>
              <Col xs={24} lg={14}><Card size="small" title="AI Chat"><Skeleton active paragraph={{rows:5}}/></Card></Col>
            </Row>
          )}

          {/* ── Main 2-col layout ────────────────────────────────────────────── */}
          {extractSchema.length > 0 && !extractLoading && (
            <Row gutter={[16,16]}>

              {/* LEFT: schema viewer */}
              <Col xs={24} lg={10}>
                <Card size="small" className="mb-3"
                  title={<Space><DatabaseOutlined /><span>Cấu trúc bảng</span><Badge count={extractSchema.length} color="blue" /></Space>}
                  extra={<Space size={4}><Button size="small" type="text" onClick={expandAll}>Mở tất</Button><Button size="small" type="text" onClick={collapseAll}>Thu tất</Button></Space>}
                >
                  {extractSchema.length > 3 && (
                    <Input.Search size="small" className="mb-2" placeholder="Tìm bảng hoặc cột…"
                      value={tableSearch} onChange={e => setTableSearch(e.target.value)} allowClear />
                  )}
                  <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                    {filteredTables.length === 0
                      ? <Empty description="Không tìm thấy" imageStyle={{height:40}} />
                      : filteredTables.map(table => {
                        const collapsed = collapsedTables.has(table.tableId)
                        const patchForTable = pendingPatch?.find(p => p.tableId === table.tableId)
                        return (
                          <div key={table.tableId} className="border rounded-lg overflow-hidden shadow-sm" style={{borderColor:'var(--border-color)'}}>
                            <button type="button" onClick={() => toggleTable(table.tableId)}
                              className="w-full px-3 py-2 border-b flex items-center justify-between transition-colors"
                              style={{background:'linear-gradient(135deg,#eff6ff,#eef2ff)',borderColor:'var(--border-color)'}}>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm text-blue-800">{table.name}</span>
                                <span className="text-xs text-blue-400 bg-blue-100 rounded px-1">{table.fields.length}f</span>
                                {patchForTable && <Badge count={patchForTable.fields.length} size="small" color="orange" />}
                              </div>
                              {collapsed ? <DownOutlined className="text-xs text-blue-400" /> : <UpOutlined className="text-xs text-blue-400" />}
                            </button>
                            {!collapsed && (
                              <div className="divide-y" style={{borderColor:'var(--border-color)'}}>
                                {table.fields.map((f: any) => (
                                  <div key={f.fieldId} className="px-3 py-1.5 flex items-center gap-2 text-xs transition-colors hover:bg-black/5">
                                    {f.isPrimary && <Tag color="gold" className="text-xs m-0 shrink-0">PK</Tag>}
                                    {f.type >= 1001 && <Tag color="default" className="text-xs m-0 shrink-0">SYS</Tag>}
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium truncate">{f.name}</div>
                                      {f.description && <div className="truncate text-xs" style={{color:'var(--text-secondary)'}}>{f.description}</div>}
                                    </div>
                                    <Tag color={TYPE_COLOR[f.type] ?? 'default'} className="text-xs m-0 shrink-0">{f.typeName}</Tag>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })
                    }
                  </div>
                </Card>

                {/* Mermaid diagram */}
                <Card size="small"
                  title={<Space><BranchesOutlined />Class Diagram</Space>}
                  extra={
                    <Space size={4}>
                      <Button size="small" icon={<CopyOutlined />}
                        onClick={() => navigator.clipboard.writeText(mermaid).then(() => message.success('Đã copy!'))}>Copy</Button>
                      <Button size="small" type="link" href={liveUrl} target="_blank" rel="noopener noreferrer">mermaid.live →</Button>
                    </Space>
                  }
                >
                  <pre className="bg-neutral-900 text-green-300 rounded-lg p-3 text-xs font-mono overflow-x-auto max-h-64 overflow-y-auto leading-relaxed whitespace-pre">
                    {mermaid}
                  </pre>
                </Card>
              </Col>

              {/* RIGHT: AI chat + patches */}
              <Col xs={24} lg={14}>

                {/* Previous sessions */}
                {sessions.length > 0 && chatHistory.length === 0 && (
                  <Card size="small" className="mb-3"
                    title={<Space><HistoryOutlined /><span>Hội thoại trước</span><Badge count={sessions.length} color="blue" /></Space>}
                  >
                    {sessionsLoading ? <Skeleton active paragraph={{rows:2}} /> : (
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {sessions.map(s => (
                          <div key={s._id}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-lg border cursor-pointer transition-colors hover:border-blue-300 hover:bg-blue-50"
                            style={{borderColor:'var(--border-color)'}}
                            onClick={() => restoreSession(s)}>
                            <HistoryOutlined className="text-blue-400 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs truncate">{s.messages.find(m=>m.role==='user')?.content.slice(0,80) || '(Không có nội dung)'}</div>
                              <div className="text-xs flex items-center gap-2" style={{color:'var(--text-secondary)'}}>
                                <span>{s.messages.length} tin · {new Date(s.updatedAt).toLocaleString()}</span>
                                {s.docsContent && <Tag color="cyan" className="m-0 text-xs">Có docs</Tag>}
                              </div>
                            </div>
                            <Popconfirm title="Xóa hội thoại này?" okText="Xóa" cancelText="Hủy" okButtonProps={{danger:true}}
                              onConfirm={async e => {
                                e?.stopPropagation()
                                await fetch(`${API_BASE}/extract-chats/${s._id}`, {method:'DELETE'})
                                setSessions(prev => prev.filter(x => x._id !== s._id))
                              }}>
                              <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={e=>e.stopPropagation()} />
                            </Popconfirm>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                )}

                {/* Pending patch card */}
                {pendingPatch && pendingPatch.length > 0 && (
                  <Card size="small" className="mb-3"
                    style={{borderColor:'#f59e0b', background:'linear-gradient(135deg,#fffbeb,#fff8f0)'}}
                    title={<Space><CheckCircleOutlined className="text-green-500" /><span>Thay đổi AI đề xuất</span><Tag color="orange">{totalPatchChanges} cập nhật · {pendingPatch.length} bảng</Tag></Space>}
                    extra={
                      <Space size={4}>
                        <Button size="small" onClick={() => setPendingPatch(null)}>Bỏ qua</Button>
                        {aiImprovedSchema && (
                          <Button size="small" icon={<PlusOutlined />}
                            onClick={() => { setImportModalOpen(true); setImportLog([]); setImportDone(false) }}>
                            Import đầy đủ
                          </Button>
                        )}
                        <Popconfirm title={`Áp dụng ${totalPatchChanges} thay đổi?`} description="Cập nhật tên và mô tả field trực tiếp trên Lark."
                          onConfirm={applyPatch} okText="Áp dụng" cancelText="Hủy">
                          <Button type="primary" size="small" icon={<SaveOutlined />} loading={applying}
                            style={{background:'#16a34a', borderColor:'#16a34a'}}>
                            Áp dụng vào Lark
                          </Button>
                        </Popconfirm>
                      </Space>
                    }
                  >
                    <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                      {pendingPatch.map(tp => (
                        <div key={tp.tableId}>
                          <div className="font-semibold text-sm text-blue-700 mb-1.5 flex items-center gap-1">
                            <DatabaseOutlined className="text-xs" />{tp.tableName}
                          </div>
                          <div className="space-y-1">
                            {tp.fields.map(fp => (
                              <div key={fp.fieldId} className="bg-white rounded-lg p-2 text-xs border border-amber-200 shadow-sm">
                                {fp.newName && fp.newName !== fp.oldName && (
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <Tag color="blue" className="m-0 text-xs">Tên</Tag>
                                    <span className="line-through text-neutral-400">{fp.oldName}</span>
                                    <span className="text-neutral-400">→</span>
                                    <span className="text-green-700 font-semibold">{fp.newName}</span>
                                  </div>
                                )}
                                {fp.newDescription !== undefined && fp.newDescription !== fp.oldDescription && (
                                  <div className="flex items-start gap-1.5 mt-1">
                                    <Tag color="purple" className="m-0 text-xs shrink-0">Mô tả</Tag>
                                    <span className="text-green-700 break-words">{fp.newDescription || '(xóa mô tả)'}</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Apply result log */}
                {applyLog.length > 0 && (
                  <Card size="small" className="mb-3" title="Kết quả áp dụng"
                    extra={<Button size="small" type="text" onClick={() => setApplyLog([])}>Đóng</Button>}>
                    <div className="space-y-1">
                      {applyLog.map((r,i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="font-medium flex-1">{r.table}</span>
                          {r.ok   > 0 && <Tag color="green" className="m-0">{r.ok} ✓</Tag>}
                          {r.fail > 0 && <Tag color="red"   className="m-0">{r.fail} ✗</Tag>}
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* ── AI Chat card ──────────────────────────────────────────── */}
                <Card size="small"
                  title={
                    <Space>
                      <RobotOutlined className="text-purple-500" />
                      <span>Hỏi AI về Schema</span>
                      {turns > 0 && <Tag color="purple">{turns} lượt</Tag>}
                      {activeSessionId && <Tag color="blue" icon={<HistoryOutlined />}>Đã lưu</Tag>}
                    </Space>
                  }
                  extra={
                    <Space size={4}>
                      <Tooltip title={`Tạo tài liệu "${docName}"`}>
                        <Button size="small" icon={<FileTextOutlined />} loading={docsGenerating}
                          onClick={() => docsContent ? setDocsModalOpen(true) : generateDocs()}
                          style={{borderColor:'#06b6d4', color:'#06b6d4'}}>
                          {docsContent ? 'Xem Docs' : 'Tạo Docs'}
                        </Button>
                      </Tooltip>
                      {chatHistory.length > 0 && (
                        <Button size="small" type="text" onClick={() => {
                          setChatHistory([]); setChatError(null); setPendingPatch(null)
                          setLastPatch(null); setActiveSessionId(null); setAiImprovedSchema(null)
                        }}>Mới</Button>
                      )}
                    </Space>
                  }
                >
                  {/* Initial prompt chips */}
                  {chatHistory.length === 0 && !isStreaming && (
                    <div className="mb-3">
                      <Text className="text-xs block mb-1.5" style={{color:'var(--text-secondary)'}}>Gợi ý câu hỏi:</Text>
                      <div className="flex flex-wrap gap-1.5">
                        {getFollowUps(null, 0).map(q => (
                          <button key={q} type="button"
                            className="text-xs border border-dashed border-purple-300 rounded-full px-2.5 py-0.5 text-purple-600 hover:bg-purple-50 hover:border-purple-500 transition-colors"
                            onClick={() => setChatInput(q)}>{q}</button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Chat thread */}
                  {(chatHistory.length > 0 || isStreaming) && (
                    <div className="max-h-[420px] overflow-y-auto flex flex-col gap-2.5 mb-3 p-2.5 rounded-xl border"
                      style={{background:'var(--bg-secondary)', borderColor:'var(--border-color)'}}>
                      {chatHistory.map((msg, i) => {
                        const isLast      = i === chatHistory.length - 1
                        const isAssistant = msg.role === 'assistant'
                        return (
                          <React.Fragment key={i}>
                            <div className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}>
                              <div className={`max-w-[90%] rounded-2xl px-3 py-2.5 text-xs leading-relaxed break-words ${
                                isAssistant
                                  ? 'rounded-bl-none shadow-sm bg-white border'
                                  : 'rounded-br-none shadow text-white'
                              }`}
                                style={isAssistant
                                  ? {borderColor:'var(--border-color)'}
                                  : {background:'linear-gradient(135deg,#7c3aed,#6d28d9)'}}>
                                <MdText text={msg.content} />
                                {isAssistant && (
                                  <button
                                    className="mt-1.5 flex items-center gap-1 transition-colors"
                                    style={{color:'var(--text-secondary)', fontSize:10}}
                                    onClick={() => navigator.clipboard.writeText(msg.content).then(() => message.success('Đã copy'))}>
                                    <CopyOutlined style={{fontSize:9}} /> copy
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Follow-up chips after last assistant message */}
                            {isAssistant && isLast && !chatLoading && (
                              <div className="pl-1">
                                <Text className="text-xs block mb-1" style={{color:'var(--text-secondary)'}}>Tiếp tục:</Text>
                                <div className="flex flex-wrap gap-1">
                                  {getFollowUps(lastPatch, turns).map(q => (
                                    <button key={q} type="button"
                                      className="text-xs border border-dashed border-purple-200 rounded-full px-2 py-0.5 text-purple-500 hover:bg-purple-50 hover:border-purple-400 transition-colors"
                                      onClick={() => setChatInput(q)}>{q}</button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </React.Fragment>
                        )
                      })}

                      {/* Live streaming bubble — shows Vietnamese text, NOT raw JSON */}
                      {isStreaming && (
                        <StreamingBubble textPart={streamTextPart} isBeforeSchema={beforeSchema} />
                      )}

                      <div ref={chatBottomRef} />
                    </div>
                  )}

                  {chatError && (
                    <Alert type="error" showIcon closable className="mb-2 text-xs" message={chatError} onClose={() => setChatError(null)} />
                  )}
                  {!selectedAiConfigId && (
                    <Alert type="warning" showIcon className="mb-2 text-xs"
                      message={<span>Chưa chọn AI config — <a href="/settings/ai">Cài đặt → AI</a></span>} />
                  )}

                  <Space.Compact style={{width:'100%'}}>
                    <TextArea
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onPressEnter={e => { if (!e.shiftKey) { e.preventDefault(); sendChat() } }}
                      placeholder="Nhập yêu cầu cải thiện schema… (Enter gửi · Shift+Enter xuống dòng)"
                      disabled={chatLoading || !selectedAiConfigId}
                      autoSize={{minRows:2, maxRows:5}}
                      style={{borderRadius:'8px 0 0 8px'}}
                    />
                    <Button type="primary" icon={<SendOutlined />} onClick={sendChat}
                      loading={chatLoading} disabled={!chatInput.trim() || !selectedAiConfigId}
                      style={{height:'auto', borderRadius:'0 8px 8px 0', background:'#7c3aed', borderColor:'#7c3aed'}}>
                      Gửi
                    </Button>
                  </Space.Compact>
                </Card>
              </Col>
            </Row>
          )}

          {/* Empty state */}
          {!extractLoading && extractSchema.length === 0 && (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} className="py-16"
              description={
                <div>
                  <div className="mb-1" style={{color:'var(--text-secondary)'}}>
                    {extractBase ? 'Bấm "Load & Extract Schema" để tải cấu trúc' : 'Chọn Base để bắt đầu'}
                  </div>
                  <div className="text-xs text-neutral-400">Sau khi extract, hỏi AI để cải thiện schema và áp dụng thẳng vào Lark</div>
                </div>
              }
            />
          )}
        </>
      )}

      {/* ── Import Modal ─────────────────────────────────────────────────────── */}
      <Modal open={importModalOpen} onCancel={() => { if (!importing) setImportModalOpen(false) }}
        title={<Space><PlusOutlined className="text-green-500" /><span>Import Schema vào Lark</span></Space>}
        footer={null} width={620} maskClosable={!importing}>
        <div className="flex flex-col gap-4">
          <div>
            <Text className="text-sm font-medium block mb-2">Chọn cách import:</Text>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'patch-existing' as const, label: 'Cập nhật Base hiện có', desc: 'Thêm bảng/field mới. Dữ liệu cũ không bị xóa.', border: 'border-blue-400 bg-blue-50' },
                { value: 'create-new'     as const, label: 'Tạo Base mới hoàn toàn', desc: 'Tạo Lark Base mới với toàn bộ schema AI đề xuất.', border: 'border-green-400 bg-green-50' },
              ].map(opt => (
                <button key={opt.value} type="button" onClick={() => setImportMode(opt.value)}
                  className={`text-left p-3 rounded-xl border-2 transition-all ${importMode === opt.value ? opt.border : 'border-neutral-200 hover:border-neutral-300'}`}>
                  <div className="font-semibold text-sm mb-1">{opt.label}</div>
                  <div className="text-xs text-neutral-500">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {aiImprovedSchema?.tables && (
            <div>
              <Text className="text-xs block mb-1" style={{color:'var(--text-secondary)'}}>
                Schema sẽ import: <strong>{aiImprovedSchema.baseName || extractBase?.name}</strong>
              </Text>
              <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                {aiImprovedSchema.tables.map((t: any) => {
                  const isNew = !extractSchema.find(e => e.name === t.name)
                  return <Tag key={t.name} color={isNew ? 'green' : 'blue'} className="text-xs">{isNew ? <PlusOutlined className="mr-0.5" /> : null}{t.name} ({t.fields?.length ?? 0}f)</Tag>
                })}
              </div>
              {aiImprovedSchema.summary && (
                <div className="mt-2 text-xs rounded-lg p-2 border" style={{background:'var(--bg-secondary)', borderColor:'var(--border-color)'}}>
                  {decodeUnicodeEscapes(aiImprovedSchema.summary)}
                </div>
              )}
            </div>
          )}

          {importMode === 'patch-existing' && <Alert type="info"    showIcon className="text-xs" message={`Áp dụng vào "${extractBase?.name}" — không xóa dữ liệu cũ.`} />}
          {importMode === 'create-new'     && <Alert type="warning" showIcon className="text-xs" message="Sẽ tạo base hoàn toàn mới trên Lark. Base cũ không bị ảnh hưởng." />}

          {importLog.length > 0 && (
            <div className="bg-neutral-900 rounded-lg p-3 max-h-44 overflow-y-auto">
              {importLog.map((l,i) => (
                <div key={i} className={`text-xs font-mono flex items-start gap-1.5 mb-0.5 ${l.ok ? 'text-green-400' : 'text-red-400'}`}>
                  <span className="shrink-0">{l.ok ? '✓' : '✗'}</span><span>{l.msg}</span>
                </div>
              ))}
              {importing && <span className="text-yellow-400 text-xs animate-pulse">Đang xử lý…</span>}
            </div>
          )}

          {importDone && <Alert type="success" showIcon message="Import hoàn thành! Bạn có thể đóng cửa sổ này." />}

          <div className="flex justify-end gap-2">
            <Button onClick={() => setImportModalOpen(false)} disabled={importing}>Đóng</Button>
            <Button type="primary" icon={<SaveOutlined />} loading={importing} disabled={importDone} onClick={runImport}
              style={importMode === 'create-new' ? {background:'#16a34a', borderColor:'#16a34a'} : {}}>
              {importMode === 'patch-existing' ? 'Cập nhật Base hiện có' : 'Tạo Base mới'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Schema Docs Modal ─────────────────────────────────────────────────── */}
      <Modal open={docsModalOpen} onCancel={() => { if (!docsGenerating) setDocsModalOpen(false) }}
        title={<Space><FileTextOutlined className="text-cyan-500" /><span>{docName}</span>{docsContent && <Tag color="cyan" className="text-xs">Đã lưu DB</Tag>}</Space>}
        footer={
          <Space>
            <Button onClick={() => setDocsModalOpen(false)}>Đóng</Button>
            <Button icon={<ReloadOutlined />} loading={docsGenerating} onClick={generateDocs}>Tạo lại</Button>
            {docsContent && (
              <Button type="primary" icon={<DownloadOutlined />} onClick={downloadDocs}
                style={{background:'#06b6d4', borderColor:'#06b6d4'}}>Tải về .md</Button>
            )}
          </Space>
        }
        width={800} maskClosable={!docsGenerating}>
        <div className="max-h-[60vh] overflow-y-auto">
          {docsGenerating && !docsLiveText && (
            <div className="text-center py-8" style={{color:'var(--text-secondary)'}}>
              <RobotOutlined className="text-3xl mb-2 animate-pulse text-cyan-400" />
              <div className="text-sm">Đang tạo tài liệu schema…</div>
            </div>
          )}
          {(docsLiveText || docsContent) && (
            <pre className="rounded-lg p-4 text-xs font-mono leading-relaxed whitespace-pre-wrap border"
              style={{background:'var(--bg-secondary)', color:'var(--text-color)', borderColor:'var(--border-color)'}}>
              {docsGenerating ? docsLiveText : docsContent}
              {docsGenerating && <span className="inline-block w-1.5 h-3 bg-cyan-400 animate-pulse ml-0.5 align-middle" />}
            </pre>
          )}
        </div>
        <div className="mt-3 text-xs rounded-lg p-2 border" style={{background:'var(--bg-secondary)', borderColor:'var(--border-color)', color:'var(--text-secondary)'}}>
          <strong>Naming convention:</strong> <code>{docName}</code> — AI đọc lại file này để hiểu logic bảng khi cập nhật trong tương lai.
        </div>
      </Modal>
    </div>
  )
}
