'use client'

import React, { useCallback, useEffect, useRef, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  Alert, Avatar, Badge, Button, Card, Col, Divider, Drawer, Dropdown,
  Empty, Form, Input, message, Modal, Popconfirm, Row, Select,
  Spin, Switch, Table, Tag, Tabs, Tooltip, Typography, Upload,
} from 'antd'
import ChatPanel from './ChatPanel'
import {
  BookOutlined, BulbOutlined, CheckCircleOutlined, CloseCircleOutlined, CopyOutlined,
  DatabaseOutlined, DeleteOutlined, EditOutlined, ExclamationCircleOutlined, EyeOutlined,
  FileTextOutlined, FolderOutlined, KeyOutlined, LoadingOutlined, LoginOutlined,
  MessageOutlined, PlusOutlined, ReloadOutlined, RobotOutlined, SendOutlined, ShareAltOutlined,
  SyncOutlined, ThunderboltOutlined, WarningOutlined,
} from '@ant-design/icons'
import { buildLarkOAuthUrl, isLarkTokenValid, clearLarkSession } from '@/lib/larkOAuth'
import TourGuide from '@/components/TourGuide'
import { tourSteps } from '@/lib/tourSteps'

// ─── Backend URLs ──────────────────────────────────────────────────────────────
const API_BASE   = process.env.NEXT_PUBLIC_API_BASE || 'https://apihoanam.toolswave.net/api'
const API_ORIGIN = API_BASE.replace(/\/api$/, '')

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

// ─── Types ────────────────────────────────────────────────────────────────────

interface LarkAccount {
  _id: string
  name: string
  appId: string
  domain: string
  status: string
  isDefault: boolean
}

interface AIConfigOption {
  _id: string
  name: string
  provider: string
  model: string
  isDefault: boolean
  status: string
}

interface KnowledgeItem {
  _id: string
  title: string
  sourceType: 'bitable' | 'doc' | 'wiki' | 'drive' | 'manual'
  summary: string
  content: string
  metadata: Record<string, unknown>
  tags: string[]
  syncStatus: 'ok' | 'error' | 'syncing' | 'pending'
  syncError?: string
  updatedAt: string
  indexedAt?: string
}

interface AIAgent {
  _id: string
  name: string
  description: string
  systemPrompt: string
  welcomeMessage: string
  knowledgeIds: KnowledgeItem[]
  aiConfigId: string | null
  provider: string
  model: string
  webhookToken: string
  larkAccountId: string | null
  larkAppId: string | null
  larkAppSecret: string | null
  isActive: boolean
  stats: { totalChats: number; lastChatAt: string | null }
  createdAt: string
}

interface ChatMsg { role: 'user' | 'assistant'; content: string }

const SOURCE_COLORS: Record<string, string> = {
  bitable: 'blue', doc: 'green', wiki: 'purple', drive: 'orange', manual: 'default',
}

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: '#CC6633', openai: '#00A67E', google: '#4285F4',
  groq: '#F55036', mistral: '#7C3AED',
  nvidia: '#76B900', ollama: '#000000',
}

// ─── hooks ────────────────────────────────────────────────────────────────────

function useLarkAccounts() {
  const [accounts, setAccounts] = useState<LarkAccount[]>([])
  useEffect(() => {
    fetch(`${API_BASE}/lark-accounts?limit=100`).then(r => r.json()).then(d => {
      if (d.success) setAccounts(d.data)
    }).catch(() => {})
  }, [])
  return accounts
}

function useAIConfigs() {
  const [configs, setConfigs] = useState<AIConfigOption[]>([])
  useEffect(() => {
    fetch(`${API_BASE}/ai-configs?status=active`).then(r => r.json()).then(d => {
      if (d.success) setConfigs(d.data)
    }).catch(() => {})
  }, [])
  return configs
}

// Kiểm tra và lấy OAuth user token từ localStorage (cùng cơ chế base-designer)
function getStoredUserToken(): string | null {
  if (typeof window === 'undefined') return null
  if (!isLarkTokenValid()) return null
  return localStorage.getItem('lark_user_token')
}

// ─── Inline markdown helper ───────────────────────────────────────────────
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g
  let last = 0, m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    if (m[2]) parts.push(<strong key={m.index}>{m[2]}</strong>)
    else if (m[3]) parts.push(<em key={m.index}>{m[3]}</em>)
    else if (m[4]) parts.push(<code key={m.index} style={{ background: 'var(--bg-secondary)', padding: '1px 5px', borderRadius: 3, fontSize: '0.88em', fontFamily: 'monospace' }}>{m[4]}</code>)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length ? <>{parts}</> : <>{text}</>
}

// ─── Document content renderer ────────────────────────────────────────────────
function renderDocContent(content: string): React.ReactNode {
  const lines = content.split('\n')

  // ── Detect bitable format: multiple lines with " | " separators (field: val | field: val)
  const bitableStart = lines.findIndex(l => /^##\s*Bảng:/.test(l))
  if (bitableStart !== -1) {
    // Find record lines: lines that contain " | " (but not the header lines)
    const headerLines = lines.slice(bitableStart, bitableStart + 3)
    const tableName   = (headerLines[0] || '').replace(/^##\s*Bảng:\s*/, '').trim()
    const countLine   = (headerLines[1] || '').trim()

    const recordLines = lines.filter(l => l.includes(' | ') && !l.startsWith('##') && !l.startsWith('Tổng số'))

    // Parse records: split by " | " then split each part by first ": "
    const records: Record<string, string>[] = recordLines.map(line => {
      const obj: Record<string, string> = {}
      line.split(' | ').forEach(part => {
        const colon = part.indexOf(': ')
        if (colon === -1) return
        obj[part.slice(0, colon).trim()] = part.slice(colon + 2).trim()
      })
      return obj
    })

    // Collect columns from all records
    const colSet = new Set<string>()
    records.forEach(r => Object.keys(r).forEach(k => colSet.add(k)))
    const cols = Array.from(colSet)

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Tag color="blue" style={{ fontSize: 12 }}>Bảng Bitable</Tag>
          <strong style={{ fontSize: 14 }}>{tableName}</strong>
          <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{countLine}</span>
        </div>
        {cols.length === 0 ? (
          <p style={{ color: 'var(--text-tertiary)' }}>Không có dữ liệu.</p>
        ) : (
          <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border-color)' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5, minWidth: 600 }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  <th style={{ border: '1px solid var(--border-color)', padding: '7px 10px', textAlign: 'center', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: 11, width: 40 }}>#</th>
                  {cols.map(c => (
                    <th key={c} style={{ border: '1px solid var(--border-color)', padding: '7px 12px', textAlign: 'left', whiteSpace: 'nowrap', fontWeight: 600, color: 'var(--text-color)' }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((rec, ri) => (
                  <tr key={ri} style={{ background: ri % 2 === 0 ? 'var(--bg-color)' : 'var(--bg-secondary)' }}>
                    <td style={{ border: '1px solid var(--border-color)', padding: '6px 10px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 11 }}>{ri + 1}</td>
                    {cols.map(c => (
                      <td key={c} style={{ border: '1px solid var(--border-color)', padding: '6px 12px', verticalAlign: 'top', maxWidth: 260, wordBreak: 'break-word' }}>{rec[c] ?? ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  // ── Standard markdown rendering ───────────────────────────────────────────
  const result: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Markdown table
    if (line.startsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].startsWith('|')) { tableLines.push(lines[i]); i++ }
      const dataRows = tableLines
        .filter(l => !/^\|[\s\-|:]+\|$/.test(l))
        .map(l => l.replace(/^\||\|$/g, '').split('|').map(c => c.trim()))
      if (dataRows.length > 0) {
        result.push(
          <div key={result.length} style={{ overflowX: 'auto', margin: '12px 0', borderRadius: 8, border: '1px solid var(--border-color)' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13.5 }}>
              <thead>
                <tr>
                  {dataRows[0].map((h, ci) => (
                    <th key={ci} style={{ border: '1px solid var(--border-color)', padding: '8px 12px', background: 'var(--bg-secondary)', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>{renderInline(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.slice(1).map((row, ri) => (
                  <tr key={ri} style={{ background: ri % 2 === 0 ? 'var(--bg-color)' : 'var(--bg-secondary)' }}>
                    {row.map((cell, ci) => (
                      <td key={ci} style={{ border: '1px solid var(--border-color)', padding: '7px 12px', fontSize: 13.5, verticalAlign: 'top' }}>{renderInline(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
      continue
    }

    // Fenced code block
    if (line.startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++ }
      i++
      result.push(
        <pre key={result.length} style={{ background: 'var(--code-bg)', color: 'var(--code-text)', borderRadius: 6, padding: '12px 16px', fontSize: 12.5, overflowX: 'auto', margin: '8px 0', fontFamily: '"Fira Code", "Consolas", monospace' }}>
          {codeLines.join('\n')}
        </pre>
      )
      continue
    }

    // Headings
    if (line.startsWith('# ')) {
      result.push(<h2 key={result.length} style={{ fontSize: 20, fontWeight: 700, margin: '20px 0 8px', color: 'var(--text-color)', borderBottom: '2px solid var(--border-color)', paddingBottom: 6 }}>{renderInline(line.slice(2))}</h2>)
    } else if (line.startsWith('## ')) {
      result.push(<h3 key={result.length} style={{ fontSize: 16, fontWeight: 600, margin: '16px 0 6px', color: 'var(--text-color)' }}>{renderInline(line.slice(3))}</h3>)
    } else if (line.startsWith('### ')) {
      result.push(<h4 key={result.length} style={{ fontSize: 14, fontWeight: 600, margin: '12px 0 4px', color: 'var(--text-color)' }}>{renderInline(line.slice(4))}</h4>)
    } else if (line.startsWith('#### ')) {
      result.push(<h5 key={result.length} style={{ fontSize: 13.5, fontWeight: 600, margin: '8px 0 4px', color: 'var(--text-secondary)' }}>{renderInline(line.slice(5))}</h5>)

    // Lists
    } else if (/^[-*]\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s/.test(lines[i])) { items.push(lines[i].replace(/^[-*]\s/, '')); i++ }
      result.push(
        <ul key={result.length} style={{ paddingLeft: 20, margin: '4px 0' }}>
          {items.map((it, idx) => <li key={idx} style={{ lineHeight: 1.8, fontSize: 14 }}>{renderInline(it)}</li>)}
        </ul>
      )
      continue
    } else if (/^\d+\.\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) { items.push(lines[i].replace(/^\d+\.\s/, '')); i++ }
      result.push(
        <ol key={result.length} style={{ paddingLeft: 22, margin: '4px 0' }}>
          {items.map((it, idx) => <li key={idx} style={{ lineHeight: 1.8, fontSize: 14 }}>{renderInline(it)}</li>)}
        </ol>
      )
      continue
    } else if (line.startsWith('☐ ')) {
      result.push(
        <div key={result.length} style={{ display: 'flex', gap: 8, paddingLeft: 12, lineHeight: 1.8, fontSize: 14 }}>
          <span style={{ color: 'var(--text-tertiary)' }}>☐</span><span>{renderInline(line.slice(2))}</span>
        </div>
      )
    } else if (line.startsWith('> ')) {
      result.push(<blockquote key={result.length} style={{ borderLeft: '3px solid var(--quote-border)', paddingLeft: 12, margin: '4px 0 4px 4px', color: 'var(--text-secondary)', fontSize: 13.5, fontStyle: 'italic' }}>{renderInline(line.slice(2))}</blockquote>)
    } else if (line.startsWith('💡 ')) {
      result.push(<div key={result.length} style={{ background: 'var(--note-bg)', borderLeft: '4px solid #eab308', padding: '8px 14px', borderRadius: 4, fontSize: 13.5, margin: '6px 0', color: 'var(--note-text)' }}>{renderInline(line.slice(3))}</div>)
    } else if (/^---+$/.test(line.trim())) {
      result.push(<hr key={result.length} style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '12px 0' }} />)
    } else if (!line.trim()) {
      result.push(<div key={result.length} style={{ height: 6 }} />)
    } else {
      result.push(<p key={result.length} style={{ margin: '1px 0', lineHeight: 1.8, fontSize: 14 }}>{renderInline(line)}</p>)
    }

    i++
  }

  return <>{result}</>
}

// ─── Resource browser types ───────────────────────────────────────────────────

interface LarkBase   { appToken: string; name: string; url?: string }
interface LarkTable  { tableId: string;  name: string; appToken: string; baseName: string }
interface LarkDoc    { token: string;    name: string; type: string; url?: string }
interface WikiSpace  { spaceId: string;  name: string; description?: string }
interface WikiNode   { nodeToken: string; objToken: string; title: string; objType: string; spaceId: string; hasChildren: boolean }

type SelectKey = string  // unique key per selectable item

interface SelectedItem {
  key: SelectKey
  type: 'bitable' | 'doc' | 'wiki'
  label: string
  // bitable
  appToken?: string; tableId?: string; tableName?: string
  // doc
  documentId?: string
  // wiki
  nodeToken?: string; objToken?: string; spaceId?: string; objType?: string
}

// ─── Index Knowledge Browser ──────────────────────────────────────────────────

function IndexKnowledgeModal({
  open, onClose, onSuccess, larkAccounts,
}: {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  larkAccounts: LarkAccount[]
}) {
  const [accountId, setAccountId] = useState<string>('')
  const [activeTab, setActiveTab] = useState('bitable')

  // OAuth user token (cùng cơ chế với base-designer)
  const [userToken, setUserToken] = useState<string | null>(null)

  // Fetched resources
  const [bases,      setBases]      = useState<LarkBase[]>([])
  const [tables,     setTables]     = useState<Record<string, LarkTable[]>>({})
  const [docs,       setDocs]       = useState<LarkDoc[]>([])
  const [spaces,     setSpaces]     = useState<WikiSpace[]>([])
  const [nodes,      setNodes]      = useState<Record<string, WikiNode[]>>({})

  // Loading states
  const [loadingBases,  setLoadingBases]  = useState(false)
  const [loadingDocs,   setLoadingDocs]   = useState(false)
  const [loadingSpaces, setLoadingSpaces] = useState(false)
  const [loadingTables, setLoadingTables] = useState<Record<string, boolean>>({})
  const [loadingNodes,  setLoadingNodes]  = useState<Record<string, boolean>>({})

  const [selected,    setSelected]   = useState<Map<SelectKey, SelectedItem>>(new Map())
  const [importing,   setImporting]  = useState(false)
  const [importResult, setImportResult] = useState<{ok: number; fail: number; errors: string[]} | null>(null)

  const [manualForm] = Form.useForm()

  // Kiểm tra OAuth token khi mở drawer
  useEffect(() => {
    if (open) {
      const t = getStoredUserToken()
      setUserToken(t)
    }
  }, [open])

  // Auto-select default account
  useEffect(() => {
    if (larkAccounts.length && !accountId) {
      setAccountId(larkAccounts.find(a => a.isDefault)?._id ?? larkAccounts[0]._id)
    }
  }, [larkAccounts, accountId])

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setBases([]); setDocs([]); setSpaces([])
      setTables({}); setNodes({})
      setSelected(new Map())
      setImportResult(null)
    }
  }, [open])

  // Auto-load khi có token
  useEffect(() => {
    if (userToken && open) loadAll(userToken)
  }, [userToken, open])

  function getSelectedAccount() {
    return larkAccounts.find(a => a._id === accountId)
  }

  function handleLoginLark() {
    const acc = getSelectedAccount()
    if (!acc?.appId) { message.warning('Chọn tài khoản Lark để đăng nhập'); return }
    // Lưu accountId và return path — callback sẽ dùng secret từ DB
    sessionStorage.setItem('lark_account_id',   acc._id)
    sessionStorage.setItem('lark_oauth_return', window.location.pathname)
    window.location.href = buildLarkOAuthUrl(acc.appId, 'standard', ['wiki:wiki:readonly'])
  }

  function handleLogoutLark() {
    clearLarkSession()
    setUserToken(null)
    setBases([]); setDocs([]); setSpaces([])
    setTables({}); setNodes({})
  }

  async function loadAll(token: string) {
    setBases([]); setDocs([]); setSpaces([])
    setTables({}); setNodes({})
    const auth = `Bearer ${token}`
    await Promise.all([
      loadBases(auth),
      loadDocs(auth),
      loadSpaces(auth),
    ])
  }

  async function loadBases(auth: string) {
    setLoadingBases(true)
    try {
      const res  = await fetch(`${API_ORIGIN}/api-base/lark/v2/bases`, { headers: { Authorization: auth } })
      const data = await res.json()
      if (data.success) setBases(data.data ?? [])
      else message.warning(`Bases: ${data.error}`)
    } finally { setLoadingBases(false) }
  }

  async function loadTables(base: LarkBase) {
    if (tables[base.appToken]) return
    if (!userToken) return
    setLoadingTables(p => ({ ...p, [base.appToken]: true }))
    try {
      const res  = await fetch(`${API_ORIGIN}/api-base/lark/v2/bases/${base.appToken}/tables`, { headers: { Authorization: `Bearer ${userToken}` } })
      const data = await res.json()
      if (data.success) {
        setTables(p => ({
          ...p,
          [base.appToken]: (data.data ?? []).map((t: any) => ({
            tableId: t.tableId, name: t.name, appToken: base.appToken, baseName: base.name,
          })),
        }))
      }
    } finally { setLoadingTables(p => ({ ...p, [base.appToken]: false })) }
  }

  async function loadDocs(auth: string) {
    setLoadingDocs(true)
    try {
      const res  = await fetch(`${API_ORIGIN}/api-base/lark/v2/drive/files`, { headers: { Authorization: auth } })
      const data = await res.json()
      if (data.success) setDocs((data.data ?? []).filter((f: LarkDoc) => f.type === 'docx' || f.type === 'doc'))
      else message.warning(`Docs: ${data.error}`)
    } finally { setLoadingDocs(false) }
  }

  async function loadSpaces(auth: string) {
    setLoadingSpaces(true)
    try {
      const res  = await fetch(`${API_ORIGIN}/api-base/lark/v2/wiki/spaces`, { headers: { Authorization: auth } })
      const data = await res.json()
      if (data.success) setSpaces(data.data ?? [])
    } finally { setLoadingSpaces(false) }
  }

  async function loadNodes(space: WikiSpace) {
    if (nodes[space.spaceId]) return
    if (!userToken) return
    setLoadingNodes(p => ({ ...p, [space.spaceId]: true }))
    try {
      const res  = await fetch(`${API_ORIGIN}/api-base/lark/v2/wiki/spaces/${space.spaceId}/nodes`, { headers: { Authorization: `Bearer ${userToken}` } })
      const data = await res.json()
      if (data.success) setNodes(p => ({ ...p, [space.spaceId]: data.data ?? [] }))
      else message.warning(`Wiki nodes: ${data.error}`)
    } finally { setLoadingNodes(p => ({ ...p, [space.spaceId]: false })) }
  }

  // ── selection helpers ─────────────────────────────────────────────────────

  function toggle(item: SelectedItem) {
    setSelected(prev => {
      const next = new Map(prev)
      if (next.has(item.key)) next.delete(item.key)
      else next.set(item.key, item)
      return next
    })
  }

  function toggleAll(items: SelectedItem[]) {
    setSelected(prev => {
      const next = new Map(prev)
      const allSelected = items.every(i => next.has(i.key))
      if (allSelected) items.forEach(i => next.delete(i.key))
      else items.forEach(i => next.set(i.key, i))
      return next
    })
  }

  // ── import ────────────────────────────────────────────────────────────────

  async function handleImport() {
    if (selected.size === 0) { message.warning('Chưa chọn tài liệu nào'); return }
    if (!userToken) { message.error('Chưa đăng nhập Lark'); return }
    setImporting(true)
    setImportResult(null)
    try {
      const token = userToken
      const items = Array.from(selected.values()).map(s => ({
        type:       s.type,
        userToken:  token,
        title:      s.label,
        ...(s.type === 'bitable' ? { appToken: s.appToken, tableId: s.tableId, tableName: s.tableName } : {}),
        ...(s.type === 'doc'     ? { documentId: s.documentId } : {}),
        ...(s.type === 'wiki'    ? { nodeToken: s.nodeToken, objToken: s.objToken, objType: s.objType, spaceId: s.spaceId } : {}),
      }))
      const res  = await fetch(`${API_BASE}/agent-knowledge/index-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, userToken: token }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      const errors = (data.results ?? []).filter((r: any) => !r.success).map((r: any) => r.error || r.title)
      setImportResult({ ok: data.summary.ok, fail: data.summary.fail, errors })
      message.success(`Đã import ${data.summary.ok}/${data.summary.total} tài liệu!`)
      onSuccess()
      if (data.summary.fail === 0) {
        setSelected(new Map())
        onClose()
      }
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setImporting(false)
    }
  }

  async function handleManual() {
    const vals = await manualForm.validateFields()
    try {
      const res  = await fetch(`${API_BASE}/agent-knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: vals.title, content: vals.content, sourceType: 'manual', tags: [] }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      message.success('Đã thêm tài liệu thủ công!')
      manualForm.resetFields()
      onSuccess()
    } catch (e: any) {
      message.error(e.message)
    }
  }

  // ── sub-components ────────────────────────────────────────────────────────

  function ResourceRow({
    checked, onToggle, icon, label, sub, tag, tagColor,
  }: {
    checked: boolean
    onToggle: () => void
    icon: React.ReactNode
    label: string
    sub?: string
    tag?: string
    tagColor?: string
  }) {
    return (
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
          background: checked ? 'color-mix(in srgb, var(--accent-color) 7%, transparent)' : 'transparent',
          border: `1px solid ${checked ? 'color-mix(in srgb, var(--accent-color) 20%, transparent)' : 'transparent'}`,
          transition: 'all 0.12s', marginBottom: 4,
        }}
      >
        <div style={{
          width: 18, height: 18, borderRadius: 4,
          border: `2px solid ${checked ? 'var(--accent-color)' : 'var(--border-color)'}`,
          background: checked ? 'var(--accent-color)' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, transition: 'all 0.12s',
        }}>
          {checked && <CheckCircleOutlined style={{ color: '#fff', fontSize: 11 }} />}
        </div>
        <span style={{ color: 'var(--accent-color)', fontSize: 16, flexShrink: 0 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--text-color)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
          {sub && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{sub}</div>}
        </div>
        {tag && <Tag color={tagColor} style={{ fontSize: 10, flexShrink: 0 }}>{tag}</Tag>}
      </div>
    )
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={<span><BookOutlined style={{ marginRight: 8 }} />Thêm vào Knowledge Base</span>}
      width={620}
      extra={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {selected.size > 0 && (
            <Tag color="purple">{selected.size} đã chọn</Tag>
          )}
          <Button
            type="primary"
            onClick={handleImport}
            loading={importing}
            disabled={selected.size === 0 || !userToken}
            style={{ background: 'var(--accent-color)', border: 'none' }}
          >
            Import {selected.size > 0 ? `(${selected.size})` : ''}
          </Button>
        </div>
      }
    >
      {/* Auth section — dùng OAuth user token giống base-designer */}
      <div style={{ marginBottom: 16 }}>
        {userToken ? (
          <Alert
            type="success"
            showIcon
            message={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Đã đăng nhập Lark — đang dùng tài khoản của bạn</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button size="small" icon={<SyncOutlined />} onClick={() => loadAll(userToken)}>Tải lại</Button>
                  <Button size="small" danger onClick={handleLogoutLark}>Đăng xuất</Button>
                </div>
              </div>
            }
            style={{ marginBottom: 0 }}
          />
        ) : (
          <div style={{
            padding: '16px', borderRadius: 10,
            background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <WarningOutlined style={{ color: '#faad14', fontSize: 16 }} />
              <Text strong>Cần đăng nhập Lark để xem tài liệu của bạn</Text>
            </div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
              Lark yêu cầu user token (OAuth) để liệt kê Bitable, Docs và Wiki — khác với tenant token của app.
            </Text>
            {larkAccounts.length === 0 ? (
              <Alert type="warning" showIcon message="Chưa có tài khoản Lark. Thêm tại Lark → Tài khoản Lark." />
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Select
                  value={accountId}
                  onChange={setAccountId}
                  style={{ flex: 1 }}
                  placeholder="Chọn tài khoản Lark..."
                  options={larkAccounts.map(a => ({
                    label: (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{a.name}</span>
                        <Text type="secondary" style={{ fontSize: 11 }}>{a.appId}</Text>
                        {a.isDefault && <Tag color="blue" style={{ fontSize: 10 }}>Mặc định</Tag>}
                      </div>
                    ),
                    value: a._id,
                  }))}
                />
                <Button
                  type="primary"
                  icon={<LoginOutlined />}
                  onClick={handleLoginLark}
                  style={{ background: '#0081FF', border: 'none' }}
                >
                  Đăng nhập Lark
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Import result */}
      {importResult && (
        <Alert
          type={importResult.fail === 0 ? 'success' : 'warning'}
          showIcon
          message={`Import: ${importResult.ok} thành công, ${importResult.fail} lỗi`}
          description={importResult.errors.length ? importResult.errors.join(' · ') : undefined}
          style={{ marginBottom: 12 }}
          closable
          onClose={() => setImportResult(null)}
        />
      )}

      {/* Tabs */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        size="small"
        items={[
          // ── Bitable ───────────────────────────────────────────────────────
          {
            key: 'bitable',
            label: <span><DatabaseOutlined /> Bitable</span>,
            children: (
              <div style={{ height: 480, overflowY: 'auto', paddingRight: 4 }}>
                {loadingBases ? (
                  <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
                ) : bases.length === 0 ? (
                  <Empty description="Không tìm thấy Bitable nào" style={{ padding: 40 }} />
                ) : (
                  bases.map(base => {
                    const tbls   = tables[base.appToken] ?? []
                    const isOpen = !!tables[base.appToken]
                    const allSel = tbls.length > 0 && tbls.every(t => selected.has(`bt:${base.appToken}:${t.tableId}`))
                    return (
                      <div key={base.appToken} style={{ marginBottom: 8 }}>
                        {/* Base header */}
                        <div
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '8px 12px', borderRadius: 8,
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)',
                            cursor: 'pointer',
                          }}
                          onClick={() => loadTables(base)}
                        >
                          <FolderOutlined style={{ color: '#0081FF' }} />
                          <Text strong style={{ flex: 1, fontSize: 13 }}>{base.name}</Text>
                          <Text type="secondary" style={{ fontSize: 11 }}>{base.appToken.slice(0, 8)}…</Text>
                          {loadingTables[base.appToken] && <Spin size="small" />}
                          {tbls.length > 0 && (
                            <Tag
                              color="blue"
                              style={{ cursor: 'pointer', fontSize: 10 }}
                              onClick={e => { e.stopPropagation(); toggleAll(tbls.map(t => ({ key: `bt:${base.appToken}:${t.tableId}`, type: 'bitable', label: `${base.name} / ${t.name}`, appToken: base.appToken, tableId: t.tableId, tableName: t.name }))) }}
                            >
                              {allSel ? '✕ Bỏ chọn' : '✓ Chọn tất cả'}
                            </Tag>
                          )}
                        </div>
                        {/* Tables */}
                        {tbls.map(t => {
                          const key  = `bt:${base.appToken}:${t.tableId}`
                          return (
                            <div key={t.tableId} style={{ paddingLeft: 20, marginTop: 2 }}>
                              <ResourceRow
                                checked={selected.has(key)}
                                onToggle={() => toggle({ key, type: 'bitable', label: `${base.name} / ${t.name}`, appToken: base.appToken, tableId: t.tableId, tableName: t.name })}
                                icon={<DatabaseOutlined />}
                                label={t.name}
                                sub={t.tableId}
                                tag="table"
                                tagColor="blue"
                              />
                            </div>
                          )
                        })}
                        {isOpen && tbls.length === 0 && !loadingTables[base.appToken] && (
                          <Text type="secondary" style={{ paddingLeft: 20, fontSize: 12 }}>Không có bảng</Text>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            ),
          },

          // ── Lark Docs ─────────────────────────────────────────────────────
          {
            key: 'docs',
            label: <span><FileTextOutlined /> Docs</span>,
            children: (
              <div style={{ height: 480, overflowY: 'auto', paddingRight: 4 }}>
                {loadingDocs ? (
                  <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
                ) : docs.length === 0 ? (
                  <Empty description="Không tìm thấy tài liệu nào" style={{ padding: 40 }} />
                ) : (
                  <>
                    <div style={{ marginBottom: 8 }}>
                      <Button
                        size="small"
                        onClick={() => toggleAll(docs.map(d => ({ key: `doc:${d.token}`, type: 'doc' as const, label: d.name, documentId: d.token })))}
                      >
                        {docs.every(d => selected.has(`doc:${d.token}`)) ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                      </Button>
                    </div>
                    {docs.map(d => {
                      const key = `doc:${d.token}`
                      return (
                        <ResourceRow
                          key={d.token}
                          checked={selected.has(key)}
                          onToggle={() => toggle({ key, type: 'doc', label: d.name, documentId: d.token })}
                          icon={<FileTextOutlined />}
                          label={d.name}
                          sub={d.token}
                          tag="docx"
                          tagColor="green"
                        />
                      )
                    })}
                  </>
                )}
              </div>
            ),
          },

          // ── Wiki ──────────────────────────────────────────────────────────
          {
            key: 'wiki',
            label: <span><FolderOutlined /> Wiki</span>,
            children: (
              <div style={{ height: 480, overflowY: 'auto', paddingRight: 4 }}>
                {loadingSpaces ? (
                  <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
                ) : spaces.length === 0 ? (
                  <Empty description="Không tìm thấy Wiki space nào" style={{ padding: 40 }} />
                ) : (
                  spaces.map(space => {
                    const nds    = nodes[space.spaceId] ?? []
                    const allSel = nds.length > 0 && nds.every(n => selected.has(`wiki:${n.nodeToken}`))
                    return (
                      <div key={space.spaceId} style={{ marginBottom: 8 }}>
                        <div
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '8px 12px', borderRadius: 8,
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)',
                            cursor: 'pointer',
                          }}
                          onClick={() => loadNodes(space)}
                        >
                          <FolderOutlined style={{ color: '#722ED1' }} />
                          <Text strong style={{ flex: 1, fontSize: 13 }}>{space.name}</Text>
                          {loadingNodes[space.spaceId] && <Spin size="small" />}
                          {nds.length > 0 && (
                            <Tag
                              color="purple"
                              style={{ cursor: 'pointer', fontSize: 10 }}
                              onClick={e => { e.stopPropagation(); toggleAll(nds.map(n => ({ key: `wiki:${n.nodeToken}`, type: 'wiki' as const, label: n.title, nodeToken: n.nodeToken, objToken: n.objToken, objType: n.objType, spaceId: space.spaceId }))) }}
                            >
                              {allSel ? '✕ Bỏ chọn' : '✓ Chọn tất cả'}
                            </Tag>
                          )}
                        </div>
                        {nds.map(n => {
                          const key = `wiki:${n.nodeToken}`
                          return (
                            <div key={n.nodeToken} style={{ paddingLeft: 20, marginTop: 2 }}>
                              <ResourceRow
                                checked={selected.has(key)}
                                onToggle={() => toggle({ key, type: 'wiki', label: n.title, nodeToken: n.nodeToken, objToken: n.objToken, objType: n.objType, spaceId: space.spaceId })}
                                icon={<FileTextOutlined />}
                                label={n.title}
                                sub={n.nodeToken}
                                tag={n.objType}
                                tagColor="purple"
                              />
                            </div>
                          )
                        })}
                      </div>
                    )
                  })
                )}
              </div>
            ),
          },

          // ── Manual ───────────────────────────────────────────────────────
          {
            key: 'manual',
            label: <span><EditOutlined /> Thủ công</span>,
            children: (
              <Form form={manualForm} layout="vertical" style={{ paddingTop: 8 }}>
                <Form.Item name="title" label="Tiêu đề" rules={[{ required: true }]}>
                  <Input placeholder="VD: Quy định nghỉ phép" />
                </Form.Item>
                <Form.Item name="content" label="Nội dung" rules={[{ required: true }]}>
                  <TextArea rows={12} placeholder="Nhập nội dung văn bản..." />
                </Form.Item>
                <Button type="primary" onClick={handleManual}>Thêm tài liệu này</Button>
              </Form>
            ),
          },
        ]}
      />
    </Drawer>
  )
}

// ─── Agent edit drawer ────────────────────────────────────────────────────────

function AgentDrawer({
  agent, allKnowledge, larkAccounts, aiConfigs, open, onClose, onSaved,
}: {
  agent: AIAgent | null
  allKnowledge: KnowledgeItem[]
  larkAccounts: LarkAccount[]
  aiConfigs: AIConfigOption[]
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [form]    = Form.useForm()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    form.setFieldsValue(agent ? {
      name:          agent.name,
      description:   agent.description,
      systemPrompt:  agent.systemPrompt,
      welcomeMessage: agent.welcomeMessage,
      aiConfigId:    agent.aiConfigId ?? undefined,
      knowledgeIds:  agent.knowledgeIds?.map((k: any) => k._id ?? k),
      larkAccountId: agent.larkAccountId ?? undefined,
      isActive:      agent.isActive,
    } : {
      welcomeMessage: 'Xin chào! Tôi có thể giúp gì cho bạn?',
      isActive:       true,
      knowledgeIds:   [],
      aiConfigId:     aiConfigs.find(c => c.isDefault)?._id,
      larkAccountId:  larkAccounts.find(a => a.isDefault)?._id,
    })
  }, [open, agent, form, aiConfigs, larkAccounts])

  async function handleSave() {
    const vals = await form.validateFields()
    setSaving(true)
    try {
      const url    = agent ? `${API_BASE}/ai-agents/${agent._id}` : `${API_BASE}/ai-agents`
      const method = agent ? 'PUT' : 'POST'
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vals),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      message.success(agent ? 'Đã cập nhật!' : 'Đã tạo agent mới!')
      onSaved()
      onClose()
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const selectedConfig = Form.useWatch('aiConfigId', form)
  const configInfo     = aiConfigs.find(c => c._id === selectedConfig)

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <RobotOutlined style={{ color: 'var(--accent-color)' }} />
          {agent ? `Chỉnh sửa: ${agent.name}` : 'Tạo AI Agent mới'}
        </div>
      }
      width={540}
      extra={<Button type="primary" onClick={handleSave} loading={saving}>Lưu</Button>}
    >
      <Form form={form} layout="vertical" requiredMark={false}>

        {/* Basic info */}
        <Form.Item name="name" label="Tên Agent" rules={[{ required: true, message: 'Nhập tên agent' }]}>
          <Input placeholder="VD: HR Support Bot" />
        </Form.Item>
        <Form.Item name="description" label="Mô tả ngắn">
          <Input placeholder="Ngắn gọn về chức năng" />
        </Form.Item>
        <Form.Item name="welcomeMessage" label="Tin nhắn chào">
          <Input placeholder="Xin chào! Tôi có thể giúp gì cho bạn?" />
        </Form.Item>
        <Form.Item name="systemPrompt" label="System Prompt">
          <TextArea
            rows={5}
            placeholder="Bạn là trợ lý AI của công ty. Trả lời bằng tiếng Việt, ngắn gọn và chuyên nghiệp..."
          />
        </Form.Item>

        <Divider orientation="left" plain style={{ fontSize: 12 }}>
          <ThunderboltOutlined style={{ marginRight: 4 }} />AI Config
        </Divider>

        {/* AI Config — pick from configured options */}
        <Form.Item name="aiConfigId" label="AI Provider Config">
          {aiConfigs.length === 0 ? (
            <Alert type="warning" showIcon message="Chưa có AI config. Vào Settings → AI API Keys để thêm." />
          ) : (
            <Select
              placeholder="Chọn AI config..."
              allowClear
              options={aiConfigs.map(c => ({
                label: (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Tag color={PROVIDER_COLORS[c.provider]} style={{ fontSize: 10, margin: 0 }}>{c.provider}</Tag>
                    <span>{c.name}</span>
                    <Text type="secondary" style={{ fontSize: 11 }}>{c.model}</Text>
                    {c.isDefault && <Tag color="gold" style={{ fontSize: 10 }}>Mặc định</Tag>}
                  </div>
                ),
                value: c._id,
              }))}
            />
          )}
        </Form.Item>
        {configInfo && (
          <div style={{
            padding: '8px 12px', borderRadius: 8,
            background: `${PROVIDER_COLORS[configInfo.provider]}12`,
            border: `1px solid ${PROVIDER_COLORS[configInfo.provider]}33`,
            marginBottom: 16, fontSize: 12,
          }}>
            <Tag color={PROVIDER_COLORS[configInfo.provider]}>{configInfo.provider}</Tag>
            Model: <Text code style={{ fontSize: 11 }}>{configInfo.model}</Text>
          </div>
        )}

        <Divider orientation="left" plain style={{ fontSize: 12 }}>
          <BookOutlined style={{ marginRight: 4 }} />Knowledge Base
        </Divider>

        <Form.Item name="knowledgeIds" label="Tài liệu cho agent">
          <Select
            mode="multiple"
            placeholder="Chọn tài liệu..."
            optionFilterProp="label"
            options={allKnowledge.map(k => ({
              label: `[${k.sourceType}] ${k.title}`,
              value: k._id,
            }))}
          />
        </Form.Item>

        <Divider orientation="left" plain style={{ fontSize: 12 }}>
          <KeyOutlined style={{ marginRight: 4 }} />Lark Bot (tuỳ chọn)
        </Divider>

        {/* Lark account — pick from configured accounts */}
        <Form.Item name="larkAccountId" label="Tài khoản Lark">
          {larkAccounts.length === 0 ? (
            <Alert type="warning" showIcon message="Chưa có tài khoản Lark. Thêm tại Lark → Tài khoản Lark." />
          ) : (
            <Select
              placeholder="Chọn tài khoản Lark..."
              allowClear
              options={larkAccounts.map(a => ({
                label: (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{a.name}</span>
                    <Text type="secondary" style={{ fontSize: 11 }}>{a.appId}</Text>
                    {a.isDefault && <Tag color="blue" style={{ fontSize: 10 }}>Mặc định</Tag>}
                  </div>
                ),
                value: a._id,
              }))}
            />
          )}
        </Form.Item>
        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: -12, marginBottom: 16 }}>
          Agent sẽ dùng App ID + Secret của tài khoản này để gửi reply qua Lark Bot
        </Text>

        <Form.Item name="isActive" label="Kích hoạt" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Drawer>
  )
}

// ─── Chat test panel ──────────────────────────────────────────────────────────

function ChatTestPanel({ agent }: { agent: AIAgent }) {
  const [msgs, setMsgs]   = useState<ChatMsg[]>([
    { role: 'assistant', content: agent.welcomeMessage || 'Xin chào! Tôi có thể giúp gì cho bạn?' },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const decoder   = useRef(new TextDecoder('utf-8', { fatal: false }))

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  async function send() {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    const history = msgs.slice(-8)
    setMsgs(prev => [...prev, { role: 'user', content: userMsg }, { role: 'assistant', content: '' }])
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/ai-agents/${agent._id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg, history }),
      })
      if (!res.body) throw new Error('No stream')
      const reader = res.body.getReader()
      let acc = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        acc += decoder.current.decode(value, { stream: true })
        setMsgs(prev => {
          const copy = [...prev]
          copy[copy.length - 1] = { role: 'assistant', content: acc }
          return copy
        })
      }
    } catch (e: any) {
      setMsgs(prev => {
        const copy = [...prev]
        copy[copy.length - 1] = { role: 'assistant', content: `❌ Lỗi: ${e.message}` }
        return copy
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 500 }}>
      <div style={{
        flex: 1, overflowY: 'auto', padding: '12px 16px',
        background: 'var(--bg-secondary)', borderRadius: 12, marginBottom: 12,
      }}>
        {msgs.map((m, i) => (
          <div key={i} style={{
            display: 'flex',
            justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
            marginBottom: 10,
          }}>
            {m.role === 'assistant' && (
              <Avatar size={28} icon={<RobotOutlined />} style={{ background: 'var(--accent-color)', marginRight: 8, flexShrink: 0, alignSelf: 'flex-end' }} />
            )}
            <div style={{
              maxWidth: '78%',
              background: m.role === 'user' ? 'linear-gradient(135deg, var(--accent-color), #8b5cf6)' : 'var(--bg-color)',
              color: m.role === 'user' ? '#fff' : 'var(--text-color)',
              padding: '10px 14px',
              borderRadius: m.role === 'user' ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
              boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
              whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.65,
            }}>
              {!m.content && m.role === 'assistant' && loading
                ? <span style={{ opacity: 0.5 }}>Đang trả lời…</span>
                : m.content}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          onPressEnter={send}
          placeholder="Nhập câu hỏi để test agent..."
          disabled={loading}
          style={{ borderRadius: 20, flex: 1 }}
        />
        <Button type="primary" icon={<SendOutlined />} onClick={send} loading={loading} shape="circle" />
      </div>
    </div>
  )
}

// ─── Deploy panel ─────────────────────────────────────────────────────────────

function DeployPanel({
  agent, larkAccounts, onRegenToken,
}: {
  agent: AIAgent
  larkAccounts: LarkAccount[]
  onRegenToken: () => void
}) {
  const BACKEND    = process.env.NEXT_PUBLIC_API_BASE?.replace(/\/api$/, '') || 'https://apihoanam.toolswave.net'
  const webhookUrl = `${BACKEND}/api/ai-agents/webhook/${agent.webhookToken}`
  const linkedAcc  = larkAccounts.find(a => a._id === agent.larkAccountId)

  function copy(text: string) {
    navigator.clipboard.writeText(text)
    message.success('Đã copy!')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Alert
        type="info" showIcon
        message="Webhook URL cho Lark Bot"
        description={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <Text code style={{ flex: 1, fontSize: 12, wordBreak: 'break-all' }}>{webhookUrl}</Text>
            <Button size="small" icon={<CopyOutlined />} onClick={() => copy(webhookUrl)}>Copy</Button>
          </div>
        }
      />

      <Card size="small" title="Tài khoản Lark liên kết" style={{ borderRadius: 10 }}>
        {linkedAcc ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <CheckCircleOutlined style={{ color: 'var(--success-text)', fontSize: 20 }} />
            <div>
              <Text strong>{linkedAcc.name}</Text>
              <div><Text type="secondary" style={{ fontSize: 12 }}>{linkedAcc.appId}</Text></div>
            </div>
            {linkedAcc.isDefault && <Tag color="blue">Mặc định</Tag>}
          </div>
        ) : (
          <Text type="secondary">Chưa liên kết — Chỉnh sửa agent để chọn tài khoản Lark</Text>
        )}
      </Card>

      <Card size="small" title="Webhook Token" style={{ borderRadius: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text code style={{ flex: 1, wordBreak: 'break-all', fontSize: 12 }}>{agent.webhookToken}</Text>
          <Tooltip title="Copy token">
            <Button size="small" icon={<CopyOutlined />} onClick={() => copy(agent.webhookToken)} />
          </Tooltip>
          <Popconfirm
            title="Tạo token mới?"
            description="Token cũ sẽ không dùng được nữa. Cập nhật URL trong Lark App sau khi tạo."
            onConfirm={onRegenToken}
          >
            <Button size="small" icon={<ReloadOutlined />} danger>Tạo mới</Button>
          </Popconfirm>
        </div>
      </Card>

      <Card size="small" title="Thống kê" style={{ borderRadius: 10 }}>
        <div style={{ display: 'flex', gap: 32 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent-color)' }}>{agent.stats?.totalChats ?? 0}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>Tổng tin nhắn</Text>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {agent.stats?.lastChatAt ? new Date(agent.stats.lastChatAt).toLocaleDateString('vi-VN') : '—'}
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>Lần cuối</Text>
          </div>
          <div>
            <div style={{ fontSize: 14 }}>
              <Tag color={agent.isActive ? 'green' : 'default'}>{agent.isActive ? 'Đang hoạt động' : 'Tắt'}</Tag>
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>Trạng thái</Text>
          </div>
        </div>
      </Card>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

function AIAgentPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const larkAccounts = useLarkAccounts()
  const aiConfigs    = useAIConfigs()

  const [isMobile, setIsMobile] = useState(false)

  const [agents, setAgents]           = useState<AIAgent[]>([])
  const [knowledge, setKnowledge]     = useState<KnowledgeItem[]>([])
  const [loadingAgents, setLoadingAgents] = useState(false)
  const [loadingKnow, setLoadingKnow] = useState(false)
  const activeTab = searchParams.get('tab') || 'agents'
  const setActiveTab = (tab: string) => {
    if (tab === 'trainer') return router.push('/lark/agent/trainer', { scroll: false })
    if (tab === 'cskh') return router.push('/lark/agent/cskh', { scroll: false })
    router.push(`/lark/agent?tab=${tab}`, { scroll: false })
  }
  const [drawerOpen, setDrawerOpen]   = useState(false)
  const [editAgent, setEditAgent]     = useState<AIAgent | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<AIAgent | null>(null)
  const [indexOpen, setIndexOpen]     = useState(false)
  const [searchK, setSearchK]         = useState('')
  const [syncingIds, setSyncingIds]   = useState<Set<string>>(new Set())
  const [syncingAll, setSyncingAll]   = useState(false)
  const [trainingForm]                = Form.useForm()
  const [submittingTraining, setSubmittingTraining] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [editingQA, setEditingQA]     = useState<KnowledgeItem | null>(null)
  const [editQAForm]                  = Form.useForm()
  const [savingQA, setSavingQA]       = useState(false)
  const [viewItem, setViewItem]       = useState<KnowledgeItem | null>(null)
  const [knowledgeModal, setKnowledgeModal] = useState<{ agent: AIAgent; items: KnowledgeItem[] } | null>(null)
  const [loadingView, setLoadingView] = useState(false)

  async function openViewItem(item: KnowledgeItem) {
    setViewItem(item)
    setLoadingView(true)
    try {
      const res  = await fetch(`${API_BASE}/agent-knowledge/${item._id}`)
      const data = await res.json()
      if (data.success) setViewItem(data.data)
    } catch { /* keep showing cached version */ }
    finally { setLoadingView(false) }
  }

  const fetchAgents = useCallback(async () => {
    setLoadingAgents(true)
    try {
      const res  = await fetch(`${API_BASE}/ai-agents`)
      const data = await res.json()
      if (data.success) setAgents(data.data)
    } finally {
      setLoadingAgents(false)
    }
  }, [])

  const fetchKnowledge = useCallback(async () => {
    setLoadingKnow(true)
    try {
      const qs  = searchK ? `?search=${encodeURIComponent(searchK)}` : ''
      const res  = await fetch(`${API_BASE}/agent-knowledge${qs}`)
      const data = await res.json()
      if (data.success) setKnowledge(data.data)
    } finally {
      setLoadingKnow(false)
    }
  }, [searchK])

  useEffect(() => { fetchAgents() }, [fetchAgents])
  useEffect(() => { fetchKnowledge() }, [fetchKnowledge])

  useEffect(() => {
    function check() { setIsMobile(window.innerWidth < 768) }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  async function resyncItem(id: string) {
    const token = getStoredUserToken()
    if (!token) { message.warning('Cần đăng nhập Lark (OAuth) để đồng bộ. Vào tab Knowledge → Thêm tài liệu để đăng nhập.'); return }
    setSyncingIds(prev => new Set(prev).add(id))
    try {
      const res  = await fetch(`${API_BASE}/agent-knowledge/re-sync/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userToken: token }),
      })
      const data = await res.json()
      if (data.success) { message.success('Đã đồng bộ!'); fetchKnowledge() }
      else message.error(data.error)
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setSyncingIds(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  async function resyncAll() {
    const token = getStoredUserToken()
    if (!token) { message.warning('Cần đăng nhập Lark (OAuth) để đồng bộ.'); return }
    const syncable = knowledge.filter(k => k.sourceType !== 'manual')
    if (!syncable.length) { message.info('Không có tài liệu nào cần đồng bộ'); return }
    setSyncingAll(true)
    let ok = 0; let fail = 0
    for (const item of syncable) {
      try {
        const res  = await fetch(`${API_BASE}/agent-knowledge/re-sync/${item._id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userToken: token }),
        })
        const data = await res.json()
        if (data.success) ok++; else fail++
      } catch { fail++ }
    }
    setSyncingAll(false)
    message.success(`Đồng bộ xong: ${ok} thành công, ${fail} lỗi`)
    fetchKnowledge()
  }

  async function submitTraining(vals: { question: string; answer: string; agentId?: string }) {
    const agentId = vals.agentId || selectedAgent?._id
    if (!agentId) { message.warning('Chọn Agent trước khi lưu Q&A'); return }
    setSubmittingTraining(true)
    try {
      const res  = await fetch(`${API_BASE}/agent-knowledge/from-qa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: vals.question, answer: vals.answer, agentId }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      message.success('Đã lưu vào Knowledge Base!')
      trainingForm.resetFields()
      fetchKnowledge()
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setSubmittingTraining(false)
    }
  }

  async function uploadKnowledgeFile(file: File) {
    if (!selectedAgent) { message.warning('Chọn Agent trước'); return false }
    setUploadingFile(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('agentId', selectedAgent._id)
      const res  = await fetch(`${API_BASE}/agent-knowledge/upload`, { method: 'POST', body: fd })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      message.success(`Đã upload "${file.name}" vào Knowledge Base!`)
      fetchKnowledge()
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setUploadingFile(false)
    }
    return false // prevent antd default upload
  }

  async function updateQA(vals: { question: string; answer: string }) {
    if (!editingQA) return
    setSavingQA(true)
    try {
      const res  = await fetch(`${API_BASE}/agent-knowledge/${editingQA._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: vals.question, answer: vals.answer }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      message.success('Đã cập nhật Q&A!')
      setEditingQA(null)
      fetchKnowledge()
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setSavingQA(false)
    }
  }

  async function deleteAgent(id: string) {
    const res  = await fetch(`${API_BASE}/ai-agents/${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (data.success) { message.success('Đã xoá agent'); fetchAgents() }
    else message.error(data.error)
  }

  async function deleteKnowledge(id: string) {
    const res  = await fetch(`${API_BASE}/agent-knowledge/${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (data.success) { message.success('Đã xoá tài liệu'); fetchKnowledge() }
    else message.error(data.error)
  }

  async function regenToken(agentId: string) {
    const res  = await fetch(`${API_BASE}/ai-agents/${agentId}/regen-token`, { method: 'POST' })
    const data = await res.json()
    if (data.success) {
      message.success('Đã tạo webhook token mới!')
      fetchAgents()
      if (selectedAgent?._id === agentId)
        setSelectedAgent(prev => prev ? { ...prev, webhookToken: data.webhookToken } : null)
    } else {
      message.error(data.error)
    }
  }

  const SYNC_STATUS: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    ok:      { color: 'green',   icon: <CheckCircleOutlined />,      label: 'OK' },
    error:   { color: 'red',     icon: <ExclamationCircleOutlined />, label: 'Lỗi' },
    syncing: { color: 'blue',    icon: <SyncOutlined spin />,         label: 'Đang sync' },
    pending: { color: 'orange',  icon: <LoadingOutlined />,           label: 'Chờ' },
  }

  const knowledgeCols = [
    {
      title: 'Tài liệu',
      dataIndex: 'title',
      render: (v: string, r: KnowledgeItem) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Text strong style={{ fontSize: 13 }}>{v}</Text>
            {r.tags?.includes('training') && <Tag color="purple" style={{ fontSize: 10 }}>training</Tag>}
          </div>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {r.summary?.slice(0, 100)}{(r.summary?.length ?? 0) > 100 ? '…' : ''}
          </Text>
          {r.syncStatus === 'error' && r.syncError && (
            <div style={{ color: 'var(--error-color, #ff4d4f)', fontSize: 11, marginTop: 2 }}>⚠ {r.syncError}</div>
          )}
        </div>
      ),
    },
    {
      title: 'Loại', dataIndex: 'sourceType', width: 80,
      render: (v: string) => <Tag color={SOURCE_COLORS[v]}>{v}</Tag>,
    },
    {
      title: 'Thông tin', width: 110,
      render: (_: unknown, r: KnowledgeItem) => (
        <div style={{ fontSize: 11 }}>
          {r.metadata?.wordCount ? <div>{r.metadata.wordCount as number} từ</div> : null}
          {r.metadata?.recordCount ? <div>{r.metadata.recordCount as number} bản ghi</div> : null}
          <Text type="secondary">{new Date(r.updatedAt).toLocaleDateString('vi-VN')}</Text>
        </div>
      ),
    },
    {
      title: 'Sync', dataIndex: 'syncStatus', width: 70,
      render: (v: string) => {
        const s = SYNC_STATUS[v] ?? SYNC_STATUS.ok
        return <Tag color={s.color} icon={s.icon} style={{ fontSize: 10 }}>{s.label}</Tag>
      },
    },
    {
      title: '', width: 95,
      render: (_: unknown, r: KnowledgeItem) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <Tooltip title="Xem nội dung">
            <Button size="small" icon={<EyeOutlined />} onClick={() => openViewItem(r)} />
          </Tooltip>
          {r.sourceType !== 'manual' && (
            <Tooltip title="Đồng bộ lại từ Lark">
              <Button
                size="small" icon={<SyncOutlined />}
                loading={syncingIds.has(r._id)}
                onClick={() => resyncItem(r._id)}
              />
            </Tooltip>
          )}
          <Popconfirm title="Xoá tài liệu này?" onConfirm={() => deleteKnowledge(r._id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </div>
      ),
    },
  ]

  const agentCols = [
    {
      title: 'Agent', dataIndex: 'name',
      render: (v: string, r: AIAgent) => {
        const acc = larkAccounts.find(a => a._id === r.larkAccountId)
        const cfg = aiConfigs.find(c => c._id === r.aiConfigId)
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <RobotOutlined style={{ color: 'var(--accent-color)' }} />
              <Text strong>{v}</Text>
              {!r.isActive && <Tag color="default">Tắt</Tag>}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
              {cfg && <Tag color={PROVIDER_COLORS[cfg.provider] as any} style={{ fontSize: 10 }}>{cfg.name}</Tag>}
              {acc && <Tag color="cyan" style={{ fontSize: 10 }}><KeyOutlined /> {acc.name}</Tag>}
            </div>
          </div>
        )
      },
    },
    {
      title: 'Knowledge', dataIndex: 'knowledgeIds', width: 100,
      render: (ids: unknown[], r: AIAgent) => (
        <span
          style={{ cursor: ids?.length ? 'pointer' : 'default' }}
          onClick={() => {
            if (!ids?.length) return;
            const items = knowledge.filter(k => (ids as string[]).includes(k._id));
            setKnowledgeModal({ agent: r, items });
          }}
        >
          <Badge count={ids?.length ?? 0} showZero style={{ backgroundColor: ids?.length ? 'var(--accent-color)' : 'var(--text-tertiary)' }}>
            <BookOutlined style={{ fontSize: 18, padding: 4 }} />
          </Badge>
        </span>
      ),
    },
    {
      title: 'Chats', dataIndex: 'stats', width: 70,
      render: (s: AIAgent['stats']) => <Text strong>{s?.totalChats ?? 0}</Text>,
    },
    {
      title: '', width: 120,
      render: (_: unknown, r: AIAgent) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="small" icon={<SendOutlined />}
            onClick={() => { setSelectedAgent(r); setActiveTab('test') }} />
          <Button size="small" icon={<ShareAltOutlined />}
            onClick={() => { setSelectedAgent(r); setActiveTab('deploy') }} />
          <Button size="small" icon={<EditOutlined />}
            onClick={() => { setEditAgent(r); setDrawerOpen(true) }} />
          <Popconfirm title="Xoá agent này?" onConfirm={() => deleteAgent(r._id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </div>
      ),
    },
  ]

  // Sync selectedAgent when agents list refreshes
  useEffect(() => {
    if (selectedAgent) {
      const updated = agents.find(a => a._id === selectedAgent._id)
      if (updated) setSelectedAgent(updated)
    }
  }, [agents])

  // ── Nav items definition ────────────────────────────────────────────────────
  const trainingCount = knowledge.filter(k => k.tags?.includes('training')).length
  const syncErrCount  = knowledge.filter(k => k.syncStatus === 'error').length

  const NAV = [
    { key: 'agents',   icon: <RobotOutlined />,     label: 'Agents',      count: agents.length },
    { key: 'knowledge',icon: <BookOutlined />,       label: 'Knowledge',   count: knowledge.length, warn: syncErrCount > 0 },
    { key: 'training', icon: <BulbOutlined />,       label: 'Huấn luyện',  count: trainingCount },
    { key: 'test',     icon: <MessageOutlined />,    label: 'Chat' },
    { key: 'deploy',   icon: <ShareAltOutlined />,   label: 'Deploy' },
    { key: 'trainer',  icon: <ThunderboltOutlined />, label: 'Auto Trainer' },
    { key: 'cskh',     icon: <MessageOutlined />,     label: 'CSKH Inbox' },
  ]

  // ── Settings dropdown ────────────────────────────────────────────────────────
  const settingsItems = [
    {
      key: 'header-cfg', type: 'group' as const,
      label: <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>Cấu hình</span>,
      children: [
        {
          key: 'ai-configs',
          label: (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ThunderboltOutlined style={{ color: '#8b5cf6' }} />
              <span>AI Configs</span>
              <span style={{ marginLeft: 'auto', background: 'var(--bg-secondary)', borderRadius: 10, padding: '1px 8px', fontSize: 11, color: 'var(--text-secondary)' }}>
                {aiConfigs.filter((c: any) => c.status === 'active').length} active
              </span>
            </div>
          ),
          onClick: () => {
            Modal.info({
              title: 'AI Configs',
              width: 560,
              content: (
                <div style={{ marginTop: 12 }}>
                  {aiConfigs.length === 0
                    ? <Empty description="Chưa có AI config" />
                    : aiConfigs.map((c: any) => (
                      <div key={c._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--bg-secondary)' }}>
                        <Tag color={c.status === 'active' ? 'green' : 'default'}>{c.status}</Tag>
                        <span style={{ flex: 1, fontWeight: 500 }}>{c.name}</span>
                        <Tag>{c.provider}</Tag>
                        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{c.model}</span>
                        {c.isDefault && <Tag color="blue">Default</Tag>}
                      </div>
                    ))
                  }
                </div>
              ),
              okText: 'Đóng',
            })
          },
        },
        {
          key: 'lark-accounts',
          label: (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <KeyOutlined style={{ color: '#0081FF' }} />
              <span>Lark Accounts</span>
              <span style={{ marginLeft: 'auto', background: 'var(--bg-secondary)', borderRadius: 10, padding: '1px 8px', fontSize: 11, color: 'var(--text-secondary)' }}>
                {larkAccounts.length}
              </span>
            </div>
          ),
          onClick: () => {
            Modal.info({
              title: 'Lark Accounts',
              width: 520,
              content: (
                <div style={{ marginTop: 12 }}>
                  {larkAccounts.length === 0
                    ? <Empty description="Chưa có Lark account" />
                    : larkAccounts.map((a: any) => (
                      <div key={a._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--bg-secondary)' }}>
                        <Tag color={a.status === 'active' ? 'green' : 'default'}>{a.status}</Tag>
                        <span style={{ flex: 1, fontWeight: 500 }}>{a.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{a.appId}</span>
                        {a.isDefault && <Tag color="blue">Default</Tag>}
                      </div>
                    ))
                  }
                </div>
              ),
              okText: 'Đóng',
            })
          },
        },
      ],
    },
    { type: 'divider' as const },
    {
      key: 'reload',
      label: <span><ReloadOutlined style={{ marginRight: 6 }} />Tải lại tất cả</span>,
      onClick: () => { fetchAgents(); fetchKnowledge() },
    },
  ]

  // ── Content per section ──────────────────────────────────────────────────────
  function renderSection() {
    const noAgent = (label: string) => (
      <Empty description={`Chọn một agent để ${label}`} style={{ padding: 80 }}>
        <Button onClick={() => setActiveTab('agents')}>Chọn Agent</Button>
      </Empty>
    )

    if (activeTab === 'agents') return isMobile ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loadingAgents
          ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
          : agents.length === 0
            ? <Empty description="Chưa có agent. Tạo agent đầu tiên!" style={{ padding: 40 }} />
            : agents.map(r => {
                const acc = larkAccounts.find(a => a._id === r.larkAccountId)
                const cfg = aiConfigs.find(c => c._id === r.aiConfigId)
                return (
                  <Card key={r._id} size="small" style={{ borderRadius: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <RobotOutlined style={{ color: 'var(--accent-color)' }} />
                          <Text strong style={{ fontSize: 14 }}>{r.name}</Text>
                          {!r.isActive && <Tag color="default" style={{ fontSize: 10 }}>Tắt</Tag>}
                        </div>
                        {r.description && <Text type="secondary" style={{ fontSize: 12 }}>{r.description.slice(0, 80)}</Text>}
                        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                          {cfg && <Tag color={PROVIDER_COLORS[cfg.provider] as any} style={{ fontSize: 10 }}>{cfg.name}</Tag>}
                          {acc && <Tag color="cyan" style={{ fontSize: 10 }}><KeyOutlined /> {acc.name}</Tag>}
                          <Tag color="geekblue" style={{ fontSize: 10 }}>{r.knowledgeIds?.length ?? 0} docs</Tag>
                          <Tag style={{ fontSize: 10 }}>{r.stats?.totalChats ?? 0} chats</Tag>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <Button size="small" icon={<SendOutlined />} onClick={() => { setSelectedAgent(r); setActiveTab('test') }} />
                        <Button size="small" icon={<EditOutlined />} onClick={() => { setEditAgent(r); setDrawerOpen(true) }} />
                        <Popconfirm title="Xoá agent này?" onConfirm={() => deleteAgent(r._id)}>
                          <Button size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      </div>
                    </div>
                  </Card>
                )
              })
        }
      </div>
    ) : (
      <Card styles={{ body: { padding: 0 } }} style={{ borderRadius: 12 }}>
        <Table
          dataSource={agents} columns={agentCols} rowKey="_id"
          loading={loadingAgents}
          locale={{ emptyText: <Empty description="Chưa có agent. Tạo agent đầu tiên!" /> }}
          pagination={{ pageSize: 12, showSizeChanger: false }}
        />
      </Card>
    )

    if (activeTab === 'knowledge') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input.Search
            placeholder="Tìm tài liệu..." allowClear value={searchK}
            onChange={e => setSearchK(e.target.value)} onSearch={fetchKnowledge}
            style={{ maxWidth: 240 }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setIndexOpen(true)}>
            Thêm từ Lark
          </Button>
          <Button icon={<SyncOutlined />} onClick={resyncAll} loading={syncingAll}>
            Sync tất cả
          </Button>
          <Button icon={<ReloadOutlined />} onClick={fetchKnowledge} loading={loadingKnow} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {knowledge.filter(k => k.sourceType !== 'manual').length} từ Lark ·{' '}
              {trainingCount} training
              {syncErrCount > 0 && <span style={{ color: 'var(--error-color, #ff4d4f)' }}> · {syncErrCount} lỗi sync</span>}
            </Text>
            <Upload
              accept=".txt,.md,.markdown,.json,.csv"
              showUploadList={false}
              beforeUpload={uploadKnowledgeFile}
            >
              <Button size="small" icon={<PlusOutlined />} loading={uploadingFile}>
                Upload tài liệu
              </Button>
            </Upload>
          </div>
        </div>
        {isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {loadingKnow
              ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
              : knowledge.length === 0
                ? <Empty description="Chưa có tài liệu." style={{ padding: 40 }} />
                : knowledge.map(r => {
                    const s = SYNC_STATUS[r.syncStatus] ?? SYNC_STATUS.ok
                    return (
                      <Card key={r._id} size="small" style={{ borderRadius: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                              <Tag color={SOURCE_COLORS[r.sourceType]} style={{ fontSize: 10 }}>{r.sourceType}</Tag>
                              <Tag color={s.color} icon={s.icon} style={{ fontSize: 10 }}>{s.label}</Tag>
                              {r.tags?.includes('training') && <Tag color="purple" style={{ fontSize: 10 }}>training</Tag>}
                            </div>
                            <Text strong style={{ fontSize: 13 }}>{r.title}</Text>
                            {r.summary && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>{r.summary.slice(0, 100)}</div>}
                            {r.syncStatus === 'error' && r.syncError && (
                              <div style={{ color: 'var(--error-color, #ff4d4f)', fontSize: 11, marginTop: 2 }}>⚠ {r.syncError}</div>
                            )}
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                              {r.metadata?.wordCount ? `${r.metadata.wordCount} từ · ` : ''}
                              {new Date(r.updatedAt).toLocaleDateString('vi-VN')}
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                            <Button size="small" icon={<EyeOutlined />} onClick={() => openViewItem(r)} />
                            {r.sourceType !== 'manual' && (
                              <Button size="small" icon={<SyncOutlined />} loading={syncingIds.has(r._id)} onClick={() => resyncItem(r._id)} />
                            )}
                            <Popconfirm title="Xoá tài liệu này?" onConfirm={() => deleteKnowledge(r._id)}>
                              <Button size="small" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                          </div>
                        </div>
                      </Card>
                    )
                  })
            }
          </div>
        ) : (
          <Card styles={{ body: { padding: 0 } }} style={{ borderRadius: 12 }}>
            <Table
              dataSource={knowledge} columns={knowledgeCols} rowKey="_id"
              loading={loadingKnow}
              locale={{ emptyText: <Empty description="Chưa có tài liệu. Thêm từ Lark hoặc nhập thủ công." /> }}
              pagination={{ pageSize: 15, showSizeChanger: false }}
            />
          </Card>
        )}
      </div>
    )

    if (activeTab === 'training') {
      const trainingItems = knowledge.filter(k => k.tags?.includes('training'))
      return (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={10}>
              <Card
                title={<span><BulbOutlined style={{ color: 'var(--accent-color)', marginRight: 6 }} />Thêm Q&A mới</span>}
                style={{ borderRadius: 12 }} size="small"
              >
                <Alert type="info" showIcon style={{ marginBottom: 12, fontSize: 12 }}
                  message="AI sẽ ưu tiên trả lời theo đúng Q&A đã huấn luyện khi câu hỏi khớp."
                />
                <Form form={trainingForm} layout="vertical" onFinish={submitTraining} requiredMark={false}
                  initialValues={{ agentId: selectedAgent?._id }}>
                  <Form.Item name="agentId" label="Agent" rules={[{ required: true, message: 'Chọn Agent' }]}>
                    <Select placeholder="Chọn agent..." options={agents.map(a => ({ label: a.name, value: a._id }))} />
                  </Form.Item>
                  <Form.Item name="question" label="Câu hỏi mẫu" rules={[{ required: true, message: 'Nhập câu hỏi' }]}>
                    <Input.TextArea rows={3} placeholder="VD: Xin chào bạn" />
                  </Form.Item>
                  <Form.Item name="answer" label="Câu trả lời mẫu" rules={[{ required: true, message: 'Nhập câu trả lời' }]}>
                    <Input.TextArea rows={5} placeholder="VD: Xin chào! Tôi có thể giúp gì cho bạn?" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" loading={submittingTraining} icon={<PlusOutlined />} block
                    style={{ background: 'linear-gradient(135deg, var(--accent-color), #8b5cf6)', border: 'none' }}>
                    Lưu vào Knowledge Base
                  </Button>
                </Form>
                <Divider style={{ margin: '16px 0' }}><Text type="secondary" style={{ fontSize: 12 }}>Huấn luyện qua Lark Bot</Text></Divider>
                <div style={{ padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 12 }}>
                  <Text strong style={{ display: 'block', marginBottom: 6 }}>Cú pháp !learn:</Text>
                  <Text code style={{ display: 'block', marginBottom: 4 }}>!learn Tiêu đề | Nội dung kiến thức</Text>
                  <Text type="secondary">Gửi đến Lark Bot → Bot tự động ghi nhớ và xác nhận.</Text>
                </div>
              </Card>
            </Col>
            <Col xs={24} md={14}>
              <Card
                title={<span>Danh sách Q&A đã huấn luyện <Tag color="purple">{trainingCount}</Tag></span>}
                style={{ borderRadius: 12 }} size="small"
                extra={<Button size="small" icon={<ReloadOutlined />} onClick={fetchKnowledge}>Làm mới</Button>}
              >
                <div style={{ maxHeight: 'calc(100dvh - 380px)', overflowY: 'auto', paddingRight: 2 }}>
                  {trainingItems.length === 0
                    ? <Empty description="Chưa có Q&A nào. Thêm ở bên trái." style={{ padding: 40 }} />
                    : trainingItems.map(item => {
                        const q = (item.metadata?.question as string) || item.title.replace(/^Q:\s*/, '')
                        const a = (item.metadata?.answer as string) || item.content.replace(/^Câu hỏi:[\s\S]*?\n\nTrả lời:\s*/, '')
                        return (
                          <div key={item._id} style={{
                            padding: '12px 14px', marginBottom: 8, borderRadius: 10,
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)',
                          }}>
                            {/* Header row */}
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                              <div style={{ flex: 1 }}>
                                <Tag color="blue" style={{ fontSize: 10, marginBottom: 4 }}>Câu hỏi</Tag>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-color)', lineHeight: 1.5 }}>{q}</div>
                              </div>
                              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                <Tooltip title="Chỉnh sửa">
                                  <Button size="small" icon={<EditOutlined />}
                                    onClick={() => { setEditingQA(item); editQAForm.setFieldsValue({ question: q, answer: a }) }}
                                  />
                                </Tooltip>
                                <Popconfirm title="Xoá Q&A này?" okText="Xoá" okType="danger" onConfirm={() => deleteKnowledge(item._id)}>
                                  <Button size="small" danger icon={<DeleteOutlined />} />
                                </Popconfirm>
                              </div>
                            </div>
                            {/* Answer */}
                            <div>
                              <Tag color="green" style={{ fontSize: 10, marginBottom: 4 }}>Trả lời mẫu</Tag>
                              <div style={{
                                fontSize: 12.5, color: 'var(--text-color)', lineHeight: 1.6,
                                background: 'var(--success-bg, #f0fdf4)', padding: '6px 10px',
                                borderRadius: 6, border: '1px solid var(--success-border, #bbf7d0)',
                                whiteSpace: 'pre-wrap',
                              }}>
                                {a.length > 200 ? a.slice(0, 200) + '…' : a}
                              </div>
                            </div>
                            {/* Footer meta */}
                            <div style={{ display: 'flex', gap: 12, marginTop: 8, alignItems: 'center' }}>
                              {item.tags?.filter(t => t !== 'training' && t !== 'qa').map(t => (
                                <Tag key={t} style={{ fontSize: 10 }}>{t}</Tag>
                              ))}
                              <Text type="secondary" style={{ fontSize: 10, marginLeft: 'auto' }}>
                                Tạo: {new Date(item.updatedAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}
                              </Text>
                              {typeof item.metadata?.wordCount === 'number' && (
                                <Text type="secondary" style={{ fontSize: 10 }}>{item.metadata.wordCount} từ</Text>
                              )}
                            </div>
                          </div>
                        )
                      })
                  }
                </div>
              </Card>
            </Col>
          </Row>

          {/* Edit Q&A Modal */}
          <Modal
            open={!!editingQA}
            title={<span><EditOutlined style={{ color: 'var(--accent-color)', marginRight: 8 }} />Chỉnh sửa Q&A</span>}
            onCancel={() => setEditingQA(null)}
            onOk={() => editQAForm.submit()}
            okText="Lưu thay đổi"
            okButtonProps={{ loading: savingQA, style: { background: 'var(--accent-color)', border: 'none' } }}
            width={600}
          >
            <Form form={editQAForm} layout="vertical" onFinish={updateQA} requiredMark={false} style={{ marginTop: 16 }}>
              <Form.Item name="question" label="Câu hỏi mẫu" rules={[{ required: true, message: 'Nhập câu hỏi' }]}>
                <Input.TextArea rows={3} placeholder="Người dùng hay hỏi gì?" />
              </Form.Item>
              <Form.Item name="answer" label="Câu trả lời mẫu" rules={[{ required: true, message: 'Nhập câu trả lời' }]}>
                <Input.TextArea rows={6} placeholder="Agent nên trả lời như thế nào?" />
              </Form.Item>
            </Form>
          </Modal>
        </>
      )
    }

    if (activeTab === 'test') return selectedAgent
      ? <ChatPanel key={selectedAgent._id} agent={selectedAgent} />
      : noAgent('chat')

    if (activeTab === 'deploy') return selectedAgent ? (
      <Card style={{ borderRadius: 12 }} title={`Deploy: ${selectedAgent.name}`}>
        <DeployPanel agent={selectedAgent} larkAccounts={larkAccounts} onRegenToken={() => regenToken(selectedAgent._id)} />
      </Card>
    ) : noAgent('deploy')

    return null
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-secondary)' }}>

      {/* ── Compact toolbar: agent selector + actions ─────────────────────── */}
      <div style={{
        height: 44, flexShrink: 0, padding: '0 16px',
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'var(--bg-color)',
        borderBottom: '1px solid var(--border-color)',
      }}>
        <RobotOutlined style={{ color: 'var(--accent-color)', fontSize: 15 }} />
        <Select
          value={selectedAgent?._id}
          onChange={id => setSelectedAgent(agents.find(a => a._id === id) ?? null)}
          options={agents.map(a => ({
            value: a._id,
            label: <span style={{ fontSize: 12 }}>{a.isActive ? '🟢' : '⚫'} {a.name}</span>,
          }))}
          placeholder="Chọn agent…"
          style={{ width: isMobile ? 140 : 200 }}
          size="small"
        />

        <div style={{ flex: 1 }} />

        <Dropdown menu={{ items: settingsItems }} trigger={['click']} placement="bottomRight">
          <Button type="text" size="small" icon={<ThunderboltOutlined />}
            style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            {!isMobile && 'Cấu hình'}
          </Button>
        </Dropdown>

        <Button type="primary" size="small"
          icon={<PlusOutlined />}
          style={{ background: 'var(--accent-color)', border: 'none', borderRadius: 6, fontSize: 12 }}
          onClick={() => { setEditAgent(null); setDrawerOpen(true) }}
        >
          {!isMobile && 'Tạo Agent'}
        </Button>
      </div>

      {/* ── Content area ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: activeTab === 'test' ? 'hidden' : 'auto', padding: activeTab === 'test' ? '0' : (isMobile ? '12px 10px' : '16px 20px') }}>
        {renderSection()}
      </div>

      {/* ── Modals & Drawers ──────────────────────────────────────────────── */}
      <AgentDrawer
        open={drawerOpen} agent={editAgent} allKnowledge={knowledge}
        larkAccounts={larkAccounts} aiConfigs={aiConfigs}
        onClose={() => setDrawerOpen(false)} onSaved={fetchAgents}
      />

      <IndexKnowledgeModal
        open={indexOpen} onClose={() => setIndexOpen(false)}
        onSuccess={fetchKnowledge} larkAccounts={larkAccounts}
      />

      {/* Knowledge list modal */}
      <Modal
        open={!!knowledgeModal} onCancel={() => setKnowledgeModal(null)}
        title={<span><BookOutlined style={{ marginRight: 8 }} />Knowledge — {knowledgeModal?.agent.name} ({knowledgeModal?.items.length})</span>}
        footer={<Button onClick={() => setKnowledgeModal(null)}>Đóng</Button>}
        width={700}
      >
        <div style={{ maxHeight: 500, overflow: 'auto' }}>
          {knowledgeModal?.items.length === 0 ? <Empty description="Không có knowledge" /> : knowledgeModal?.items.map(k => (
            <Card key={k._id} size="small" style={{ marginBottom: 8, cursor: 'pointer' }}
              onClick={() => { setKnowledgeModal(null); openViewItem(k); }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text strong style={{ fontSize: 13 }}>{k.title}</Text>
                  <div style={{ marginTop: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {k.content?.slice(0, 150)}{k.content?.length > 150 ? '...' : ''}
                    </Text>
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {k.tags?.slice(0, 5).map(t => <Tag key={t} style={{ fontSize: 10, margin: 0 }}>{t}</Tag>)}
                  </div>
                </div>
                <Tag color={k.sourceType === 'manual' ? 'blue' : 'green'} style={{ fontSize: 10, flexShrink: 0, marginLeft: 8 }}>{k.sourceType}</Tag>
              </div>
            </Card>
          ))}
        </div>
      </Modal>

      {/* View item detail modal */}
      <Modal
        open={!!viewItem} onCancel={() => setViewItem(null)}
        width={900} footer={null}
        title={viewItem && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileTextOutlined style={{ color: 'var(--accent-color)' }} />
            <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{viewItem.title}</span>
            <Tag color={SOURCE_COLORS[viewItem.sourceType]}>{viewItem.sourceType}</Tag>
          </div>
        )}
      >
        {viewItem && (
          <div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap', fontSize: 12, alignItems: 'center' }}>
              {viewItem.metadata?.wordCount !== undefined && <Text type="secondary">{viewItem.metadata.wordCount as number} từ</Text>}
              {viewItem.metadata?.recordCount !== undefined && <Text type="secondary">{viewItem.metadata.recordCount as number} bản ghi</Text>}
              {viewItem.metadata?.blockCount !== undefined && <Text type="secondary">{viewItem.metadata.blockCount as number} blocks</Text>}
              <Text type="secondary">Cập nhật: {new Date(viewItem.updatedAt).toLocaleString('vi-VN')}</Text>
              {viewItem.syncStatus === 'error' && <Tag color="red" icon={<ExclamationCircleOutlined />}>Lỗi sync: {viewItem.syncError}</Tag>}
              {viewItem.tags?.length > 0 && viewItem.tags.map(t => <Tag key={t} style={{ fontSize: 10 }}>{t}</Tag>)}
            </div>
            <Spin spinning={loadingView}>
              <div style={{ background: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '20px 28px', maxHeight: 560, overflowY: 'auto', fontFamily: '"Segoe UI","Inter",-apple-system,sans-serif', fontSize: 14, lineHeight: 1.8, color: 'var(--text-color)' }}>
                {!viewItem.content
                  ? <Text type="secondary" italic>Không có nội dung. Hãy đồng bộ lại tài liệu.</Text>
                  : renderDocContent(viewItem.content)}
              </div>
            </Spin>
            <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {viewItem.sourceType !== 'manual' && (
                <Button icon={<SyncOutlined />} loading={syncingIds.has(viewItem._id)} onClick={() => resyncItem(viewItem._id)}>Đồng bộ lại</Button>
              )}
              <Button icon={<CopyOutlined />} onClick={() => { navigator.clipboard.writeText(viewItem.content); message.success('Đã copy!') }}>Copy</Button>
              <Button onClick={() => setViewItem(null)}>Đóng</Button>
            </div>
          </div>
        )}
      </Modal>
      <TourGuide pageKey="ai-agent" steps={tourSteps['ai-agent']} />
    </div>
  )
}

// Wrap with Suspense for useSearchParams
export default function AIAgentPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}><Spin size="large" /></div>}>
      <AIAgentPageInner />
    </Suspense>
  )
}
