'use client'

/**
 * ChatPanel — GPT-style chat panel embedded inside the Agent page.
 *
 * UX highlights:
 *  - Double-click any conversation or group name → inline rename
 *  - Drag a conversation → drop onto a group (or the "Recent" area) to move it
 *  - Drop zone highlights when dragging over a valid target
 *  - Right-click or ⋯ menu for delete / advanced move
 *  - + icon inside each group header to create a new chat directly in that group
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Button, Drawer, Dropdown, Input, message,
  Modal, Popconfirm, Spin, Switch, Tooltip,
} from 'antd'
import {
  BulbOutlined, CloseOutlined, CopyOutlined, DeleteOutlined,
  EditOutlined, FolderAddOutlined, FolderOutlined, FolderOpenOutlined,
  GlobalOutlined, LinkOutlined, LoadingOutlined, LockOutlined,
  MenuOutlined, MessageOutlined, MoreOutlined, PictureOutlined, PlusOutlined,
  RobotOutlined, SendOutlined, SettingOutlined, UserOutlined,
} from '@ant-design/icons'

const { TextArea } = Input

// ─── Backend URLs ──────────────────────────────────────────────────────────────
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'https://apihoanam.toolswave.net/api'

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  // Sidebar
  sidebarBg:     'var(--bg-color)',
  sidebarBorder: 'var(--border-color)',
  activeRowBg:   'var(--sidebar-active-bg)',
  hoverRowBg:    'var(--sidebar-hover-bg)',

  // Text
  textPrimary:   'var(--text-color)',
  textSecondary: 'var(--text-secondary)',
  textMuted:     'var(--text-tertiary)',
  textLight:     'var(--text-tertiary)',

  // Bubbles
  userGradient:  'linear-gradient(135deg, var(--blue-primary) 0%, var(--accent-color) 100%)',
  aiBg:          'var(--bg-color)',
  aiBorder:      'var(--border-color)',
  aiShadow:      'var(--shadow-sm)',

  // Chat area
  chatBg:        'var(--bg-secondary)',

  // Input
  inputBg:       'var(--bg-color)',
  inputBorder:   'var(--border-color)',
  inputFocus:    'var(--accent-color)',

  // Accent
  accent1: 'var(--accent-color)',
  accent2: 'var(--accent-color)',
  accent3: 'var(--accent-color)',
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Agent {
  _id: string
  name: string
  welcomeMessage: string
  knowledgeIds: unknown[]
}

interface ChatGroup {
  _id: string
  name: string
  agentId: string
  color: string
}

interface Conversation {
  _id: string
  title: string
  agentId: string
  groupId: string | null
  lastMessage: string
  isPublic: boolean
  shareToken: string | null
  createdAt: string
  updatedAt: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  imageData?: string | null    // base64 (for sending)
  imagePreview?: string | null // data-URI (for display)
  mimeType?: string | null
  timestamp?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GROUP_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#06b6d4',
]

function timeAgo(dateStr?: string): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'vừa xong'
  if (m < 60) return `${m} phút trước`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} giờ trước`
  const d = Math.floor(h / 24)
  if (d < 7)  return `${d} ngày trước`
  return new Date(dateStr).toLocaleDateString('vi-VN')
}

function timeShort(dateStr?: string): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

// ─── InlineEdit helper ────────────────────────────────────────────────────────

function InlineEdit({
  value, onSave, style, placeholder, dark,
}: {
  value: string; onSave: (v: string) => void
  style?: React.CSSProperties; placeholder?: string; dark?: boolean
}) {
  const [val, setVal] = useState(value)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { ref.current?.select() }, [])

  function submit() { if (val.trim()) onSave(val.trim()) }

  return (
    <input
      ref={ref} value={val}
      onChange={e => setVal(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onSave(value) }}
      onBlur={submit}
      onClick={e => e.stopPropagation()}
      placeholder={placeholder}
      style={{
        flex: 1, fontSize: 12,
        background: dark ? 'var(--accent-light)' : 'var(--accent-light)',
        border: '1.5px solid var(--accent-color)',
        borderRadius: 6, color: dark ? 'var(--bg-color)' : C.textPrimary,
        padding: '2px 7px', outline: 'none', minWidth: 0,
        ...style,
      }}
    />
  )
}

// ─── ConvRow ──────────────────────────────────────────────────────────────────

function ConvRow({
  conv, active, groups, isDragging, isDropTarget,
  onSelect, onRename, onDelete, onMove,
  onDragStart, onDragEnd,
}: {
  conv: Conversation; active: boolean; groups: ChatGroup[]
  isDragging: boolean; isDropTarget: boolean
  onSelect: () => void; onRename: (t: string) => void
  onDelete: () => void; onMove: (gid: string | null) => void
  onDragStart: () => void; onDragEnd: () => void
}) {
  const [editing, setEditing] = useState(false)

  const menuItems = [
    { key: 'r', label: 'Đổi tên', icon: <EditOutlined />, onClick: () => setEditing(true) },
    {
      key: 'm', label: 'Chuyển nhóm', icon: <FolderOutlined />,
      children: [
        { key: 'none', label: '— Không có nhóm', onClick: () => onMove(null) },
        ...groups.map(g => ({
          key: g._id,
          label: <><span style={{ color: g.color, marginRight: 5 }}>●</span>{g.name}</>,
          onClick: () => onMove(g._id),
        })),
      ],
    },
    { type: 'divider' as const },
    {
      key: 'd',
      label: <span style={{ color: 'var(--error-text)' }}>Xóa</span>,
      icon: <DeleteOutlined style={{ color: 'var(--error-text)' }} />,
      onClick: () => Modal.confirm({
        title: 'Xóa cuộc trò chuyện?', okText: 'Xóa', okType: 'danger', onOk: onDelete,
      }),
    },
  ]

  return (
    <div
      draggable
      onDragStart={e => { e.stopPropagation(); onDragStart() }}
      onDragEnd={onDragEnd}
      onClick={() => { if (!editing) onSelect() }}
      onDoubleClick={e => { e.stopPropagation(); setEditing(true) }}
      className="cp-conv-row"
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '7px 10px', borderRadius: 8, cursor: 'grab',
        marginBottom: 2,
        background: active ? C.activeRowBg : isDropTarget ? C.hoverRowBg : 'transparent',
        borderLeft: active ? '3px solid var(--accent-color)' : '3px solid transparent',
        opacity: isDragging ? 0.4 : 1,
        transition: 'all .18s ease',
        userSelect: 'none',
      }}
    >
      <MessageOutlined style={{
        fontSize: 12, flexShrink: 0,
        color: active ? 'var(--accent-color)' : 'var(--text-tertiary)',
        transition: 'color .18s',
      }} />

      {editing ? (
        <InlineEdit
          value={conv.title}
          onSave={v => { onRename(v); setEditing(false) }}
          placeholder="Tên cuộc trò chuyện…"
        />
      ) : (
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12.5,
            color: active ? 'var(--accent-color)' : C.textPrimary,
            fontWeight: active ? 600 : 400,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {conv.isPublic && <GlobalOutlined style={{ fontSize: 9, marginRight: 4, opacity: 0.7 }} />}
            {conv.title}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1 }}>
            {timeAgo(conv.updatedAt)}
          </div>
        </div>
      )}

      {!editing && (
        <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
          <button
            className="cp-more"
            onClick={e => e.stopPropagation()}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-tertiary)', padding: '0 2px',
              opacity: 0, transition: 'opacity .12s', lineHeight: 1,
            }}
          >
            <MoreOutlined style={{ fontSize: 13 }} />
          </button>
        </Dropdown>
      )}
    </div>
  )
}

// ─── GroupSection ─────────────────────────────────────────────────────────────

function GroupSection({
  group, convs, activeConvId, groups,
  draggingConvId, onDropConv,
  onSelect, onRename, onDelete,
  onRenameGroup, onDeleteGroup, onMove,
  onNewConvInGroup, onDragStart, onDragEnd,
}: {
  group: ChatGroup; convs: Conversation[]; activeConvId: string | null; groups: ChatGroup[]
  draggingConvId: string | null
  onDropConv: (groupId: string | null) => void
  onSelect: (id: string) => void; onRename: (id: string, t: string) => void
  onDelete: (id: string) => void; onRenameGroup: (id: string, n: string) => void
  onDeleteGroup: (id: string) => void; onMove: (id: string, gid: string | null) => void
  onNewConvInGroup: (groupId: string) => void
  onDragStart: (id: string) => void; onDragEnd: () => void
}) {
  const [open, setOpen]         = useState(true)
  const [editing, setEditing]   = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const gItems = [
    { key: 'r', label: 'Đổi tên nhóm', icon: <EditOutlined />, onClick: () => setEditing(true) },
    { type: 'divider' as const },
    {
      key: 'd', label: <span style={{ color: 'var(--error-text)' }}>Xóa nhóm</span>,
      icon: <DeleteOutlined style={{ color: 'var(--error-text)' }} />,
      onClick: () => Modal.confirm({
        title: `Xóa nhóm "${group.name}"?`,
        content: 'Các cuộc trò chuyện sẽ chuyển về mục Gần đây.',
        okText: 'Xóa', okType: 'danger', onOk: () => onDeleteGroup(group._id),
      }),
    },
  ]

  return (
    <div
      style={{ marginBottom: 4 }}
      onDragOver={e => { if (draggingConvId) { e.preventDefault(); setDragOver(true) } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={() => { setDragOver(false); if (draggingConvId) onDropConv(group._id) }}
    >
      {/* Group header */}
      <div
        className="cp-group-hdr"
        onClick={() => { if (!editing) setOpen(o => !o) }}
        onDoubleClick={e => { e.stopPropagation(); setEditing(true) }}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 8px', borderRadius: 9, cursor: 'pointer', userSelect: 'none',
          background: dragOver ? `${group.color}18` : 'transparent',
          border: `1px solid ${dragOver ? group.color + '55' : 'transparent'}`,
          transition: 'all .15s',
        }}
      >
        {/* Color dot */}
        <span style={{
          width: 8, height: 8, borderRadius: '50%', background: group.color,
          flexShrink: 0, boxShadow: `0 0 5px ${group.color}80`,
        }} />

        {open
          ? <FolderOpenOutlined style={{ color: group.color, fontSize: 12, flexShrink: 0 }} />
          : <FolderOutlined     style={{ color: group.color, fontSize: 12, flexShrink: 0 }} />
        }

        {editing ? (
          <InlineEdit
            value={group.name}
            onSave={v => { onRenameGroup(group._id, v); setEditing(false) }}
            placeholder="Tên nhóm…"
            style={{ fontSize: 11 }}
          />
        ) : (
          <span style={{
            flex: 1, fontSize: 11, fontWeight: 700,
            color: dragOver ? group.color : C.textSecondary,
            textTransform: 'uppercase', letterSpacing: '.06em',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {group.name}
            {convs.length > 0 && (
              <span style={{ marginLeft: 5, fontSize: 10, opacity: 0.6, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                {convs.length}
              </span>
            )}
          </span>
        )}

        {!editing && (
          <div style={{ display: 'flex', gap: 1, flexShrink: 0 }}>
            <Tooltip title="Chat mới trong nhóm">
              <button
                onClick={e => { e.stopPropagation(); onNewConvInGroup(group._id) }}
                className="cp-group-btn"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: group.color, padding: '0 2px', lineHeight: 1,
                  opacity: 0, transition: 'opacity .12s',
                }}
              >
                <PlusOutlined style={{ fontSize: 11 }} />
              </button>
            </Tooltip>
            <Dropdown menu={{ items: gItems }} trigger={['click']} placement="bottomRight">
              <button
                onClick={e => e.stopPropagation()}
                className="cp-group-btn"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-tertiary)', padding: '0 2px', lineHeight: 1,
                  opacity: 0, transition: 'opacity .12s',
                }}
              >
                <MoreOutlined style={{ fontSize: 13 }} />
              </button>
            </Dropdown>
          </div>
        )}
      </div>

      {/* Conversations in group */}
      {open && (
        <div style={{ paddingLeft: 16, paddingTop: 2 }}>
          {dragOver && draggingConvId && (
            <div style={{
              height: 30, borderRadius: 8, border: `1.5px dashed ${group.color}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, color: group.color, marginBottom: 3,
              background: `${group.color}08`,
            }}>
              ↓ Thả vào "{group.name}"
            </div>
          )}
          {convs.length === 0 && !dragOver ? (
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', padding: '3px 8px', fontStyle: 'italic' }}>
              Trống — kéo chat vào đây
            </div>
          ) : (
            convs.map(c => (
              <ConvRow key={c._id} conv={c}
                active={c._id === activeConvId} groups={groups}
                isDragging={draggingConvId === c._id} isDropTarget={false}
                onSelect={() => onSelect(c._id)}
                onRename={t => onRename(c._id, t)}
                onDelete={() => onDelete(c._id)}
                onMove={gid => onMove(c._id, gid)}
                onDragStart={() => onDragStart(c._id)}
                onDragEnd={onDragEnd}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Source type badges ─────────────────────────────────────────────────────────
const SRC_COLORS: Record<string, string> = {
  doc: '#10b981', bitable: '#3b82f6', manual: '#6b7280',
  qa: '#8b5cf6', wiki: '#a855f7', drive: '#f97316', upload: '#06b6d4',
}

function SourceBadge({ type }: { type: string }) {
  const color = SRC_COLORS[type] || '#6b7280'
  return (
    <span style={{
      display: 'inline-block', padding: '1px 8px', borderRadius: 99,
      background: color + '15', color, border: `1px solid ${color}40`,
      fontSize: 10, fontWeight: 700, letterSpacing: '.03em',
      marginRight: 4, verticalAlign: 'middle', lineHeight: 1.8,
    }}>{type}</span>
  )
}

// ── Markdown renderer ──────────────────────────────────────────────────────────
function renderInline(text: string, isUser = false): React.ReactNode {
  const parts: React.ReactNode[] = []
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[(doc|bitable|manual|qa|wiki|drive|upload)\])/g
  let last = 0, m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    if      (m[2]) parts.push(<strong key={m.index}>{m[2]}</strong>)
    else if (m[3]) parts.push(<em key={m.index}>{m[3]}</em>)
    else if (m[4]) parts.push(
      <code key={m.index} style={{
        background: isUser ? 'rgba(255,255,255,.22)' : 'var(--chat-bot-bg)',
        color: isUser ? '#fff' : 'var(--text-secondary)',
        padding: '1px 6px', borderRadius: 4, fontSize: '0.88em', fontFamily: 'monospace',
      }}>{m[4]}</code>
    )
    else if (m[5]) parts.push(<SourceBadge key={m.index} type={m[5]} />)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

function renderMarkdown(content: string, isUser: boolean): React.ReactNode {
  const lines     = content.split('\n')
  const result: React.ReactNode[] = []
  let i = 0
  const textColor = isUser ? '#fff' : 'var(--text-color)'

  while (i < lines.length) {
    const line = lines[i]

    // Source-type card line
    const srcMatch = line.match(/^\[(doc|bitable|manual|qa|wiki|drive|upload)\]\s*(.*)/)
    if (srcMatch && !isUser) {
      const type  = srcMatch[1]
      const rest  = srcMatch[2]
      const color = SRC_COLORS[type] || '#6b7280'
      result.push(
        <div key={i} style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
          padding: '7px 11px', marginBottom: 5, borderRadius: 10,
          background: color + '0d', border: `1px solid ${color}28`,
        }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', padding: '2px 10px',
            borderRadius: 99, background: color + '18', color,
            border: `1px solid ${color}45`, fontSize: 10, fontWeight: 700,
            flexShrink: 0, letterSpacing: '.03em', marginTop: 1,
          }}>{type}</span>
          <span style={{ fontSize: 13, color: 'var(--text-color)', lineHeight: 1.6 }}>{renderInline(rest)}</span>
        </div>
      )
      i++; continue
    }

    // Fenced code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) { code.push(lines[i]); i++ }
      result.push(
        <pre key={i} style={{
          background: 'var(--code-bg)', color: 'var(--code-text)', borderRadius: 10,
          padding: '12px 16px', fontSize: 12.5, overflowX: 'auto',
          margin: '8px 0', fontFamily: '"Fira Code","Cascadia Code",monospace',
          border: '1px solid var(--border-color)',
        }}>
          {lang && <div style={{ color: 'var(--text-tertiary)', fontSize: 11, marginBottom: 6, fontFamily: 'sans-serif' }}>{lang}</div>}
          {code.join('\n')}
        </pre>
      )
      i++; continue
    }

    // Markdown table
    if (line.startsWith('|')) {
      const tLines: string[] = []
      while (i < lines.length && lines[i].startsWith('|')) { tLines.push(lines[i]); i++ }
      const rows = tLines
        .filter(l => !/^\|[\s\-|:]+\|$/.test(l))
        .map(l => l.replace(/^\||\|$/g, '').split('|').map(c => c.trim()))
      if (rows.length) {
        result.push(
          <div key={i} style={{ overflowX: 'auto', margin: '8px 0', borderRadius: 10, border: '1px solid var(--border-color)' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
              <thead>
                <tr>{rows[0].map((h, ci) => <th key={ci} style={{ border: '1px solid var(--border-color)', padding: '7px 12px', background: 'var(--chat-bot-bg)', textAlign: 'left', whiteSpace: 'nowrap', fontWeight: 700, color: 'var(--text-color)' }}>{renderInline(h)}</th>)}</tr>
              </thead>
              <tbody>
                {rows.slice(1).map((row, ri) => (
                  <tr key={ri} style={{ background: ri % 2 === 0 ? 'var(--bg-color)' : 'var(--bg-tertiary)' }}>
                    {row.map((cell, ci) => <td key={ci} style={{ border: '1px solid var(--border-color)', padding: '6px 12px', color: 'var(--text-color)', verticalAlign: 'top' }}>{renderInline(cell)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
      continue
    }

    // HR
    if (/^---+$/.test(line.trim())) {
      result.push(<hr key={i} style={{ border: 'none', borderTop: `1px solid ${isUser ? 'rgba(255,255,255,.3)' : 'var(--border-color)'}`, margin: '10px 0' }} />)
      i++; continue
    }

    // Headings
    const hMatch = line.match(/^(#{1,4})\s+(.+)/)
    if (hMatch) {
      const level = hMatch[1].length
      const sz = [19, 16, 14, 13][level - 1]
      const clr = isUser ? '#fff' : 'var(--text-color)'
      result.push(
        <div key={i} style={{
          fontSize: sz, fontWeight: 700, color: clr,
          margin: '12px 0 5px', lineHeight: 1.4,
          borderBottom: level === 1 ? `1px solid ${isUser ? 'rgba(255,255,255,.25)' : 'var(--border-color)'}` : 'none',
          paddingBottom: level === 1 ? 5 : 0,
        }}>
          {renderInline(hMatch[2], isUser)}
        </div>
      )
      i++; continue
    }

    // Blockquote
    if (line.startsWith('> ')) {
      result.push(
        <blockquote key={i} style={{
          borderLeft: `3px solid ${isUser ? 'rgba(255,255,255,.5)' : 'var(--accent-color)'}`,
          paddingLeft: 12, margin: '5px 0',
          color: isUser ? 'rgba(255,255,255,.85)' : 'var(--text-secondary)',
          fontStyle: 'italic', fontSize: 13,
          background: isUser ? 'rgba(255,255,255,.07)' : 'var(--bg-tertiary)',
          borderRadius: '0 6px 6px 0', padding: '5px 12px',
        }}>
          {renderInline(line.slice(2), isUser)}
        </blockquote>
      )
      i++; continue
    }

    // Bulleted list
    if (/^[-*]\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s/.test(lines[i])) { items.push(lines[i].replace(/^[-*]\s/, '')); i++ }
      result.push(
        <ul key={i} style={{ margin: '5px 0 5px 8px', paddingLeft: 16, color: textColor }}>
          {items.map((it, idx) => (
            <li key={idx} style={{ fontSize: 13.5, lineHeight: 1.75, marginBottom: 2 }}>
              {renderInline(it, isUser)}
            </li>
          ))}
        </ul>
      )
      continue
    }

    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) { items.push(lines[i].replace(/^\d+\.\s/, '')); i++ }
      result.push(
        <ol key={i} style={{ margin: '5px 0 5px 8px', paddingLeft: 20, color: textColor }}>
          {items.map((it, idx) => (
            <li key={idx} style={{ fontSize: 13.5, lineHeight: 1.75, marginBottom: 2 }}>
              {renderInline(it, isUser)}
            </li>
          ))}
        </ol>
      )
      continue
    }

    // Empty line
    if (!line.trim()) { result.push(<div key={i} style={{ height: 7 }} />); i++; continue }

    // Normal paragraph
    result.push(<p key={i} style={{ margin: '2px 0', lineHeight: 1.75, fontSize: 13.5, color: textColor }}>{renderInline(line, isUser)}</p>)
    i++
  }
  return <>{result}</>
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function Bubble({ msg, isStreaming }: { msg: ChatMessage; isStreaming?: boolean }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{
      display: 'flex', flexDirection: isUser ? 'row-reverse' : 'row',
      gap: 10, marginBottom: 20, alignItems: 'flex-end',
    }}>
      {/* Avatar */}
      <div style={{
        width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: isUser
          ? 'linear-gradient(135deg, var(--blue-primary), var(--accent-color))'
          : 'var(--avatar-bg)',
        boxShadow: 'var(--shadow-sm)',
        fontSize: 15, color: '#fff',
      }}>
        {isUser ? <UserOutlined /> : <RobotOutlined />}
      </div>

      {/* Bubble content */}
      <div style={{ maxWidth: '72%' }}>
        <div style={{
          background:   isUser ? C.userGradient : C.aiBg,
          color:        isUser ? 'var(--bg-color)' : C.textPrimary,
          padding:      '11px 15px',
          borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          boxShadow:    isUser ? 'var(--shadow-sm)' : C.aiShadow,
          border:       isUser ? 'none' : `1px solid ${C.aiBorder}`,
          wordBreak: 'break-word',
        }}>
          {/* Image preview (sent image) */}
          {msg.imagePreview && (
            <div style={{ marginBottom: msg.content ? 10 : 0 }}>
              <img
                src={msg.imagePreview} alt="Ảnh đính kèm"
                style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 10, display: 'block', objectFit: 'contain' }}
              />
            </div>
          )}
          {isStreaming ? (
            <span style={{ fontSize: 13.5, lineHeight: 1.75, whiteSpace: 'pre-wrap', color: C.textPrimary }}>
              {msg.content}
              <span style={{
                display: 'inline-block', width: 7, height: 14,
                background: 'var(--accent-color)',
                marginLeft: 3, borderRadius: 2,
                animation: 'cpBlink 1s step-end infinite',
              }} />
            </span>
          ) : msg.content ? (
            renderMarkdown(msg.content, isUser)
          ) : null}
        </div>

        {/* Meta row: timestamp + copy */}
        <div style={{
          marginTop: 4, display: 'flex', alignItems: 'center', gap: 8,
          justifyContent: isUser ? 'flex-end' : 'flex-start',
        }}>
          {msg.timestamp && (
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{timeShort(msg.timestamp)}</span>
          )}
          {!isStreaming && msg.content && (
            <button
              className="cp-copy-btn"
              onClick={() => { navigator.clipboard.writeText(msg.content); message.success('Đã copy!') }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 11, padding: '1px 4px',
                display: 'flex', alignItems: 'center', gap: 3,
                borderRadius: 4,
              }}
            >
              <CopyOutlined /> copy
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main ChatPanel ───────────────────────────────────────────────────────────

export default function ChatPanel({ agent }: { agent: Agent }) {
  const [groups,        setGroups]        = useState<ChatGroup[]>([])
  const [convList,      setConvList]      = useState<Conversation[]>([])
  const [activeConvId,  setActiveConvId]  = useState<string | null>(null)
  const [messages,      setMessages]      = useState<ChatMessage[]>([])
  const [streamMsg,     setStreamMsg]     = useState('')
  const [streaming,     setStreaming]     = useState(false)
  const [loadingMsgs,   setLoadingMsgs]  = useState(false)
  const [input,         setInput]         = useState('')

  // Drag state
  const [draggingConvId,    setDraggingConvId]    = useState<string | null>(null)
  const [ungroupedDragOver, setUngroupedDragOver] = useState(false)

  // New group modal
  const [groupModal, setGroupModal] = useState(false)
  const [groupName,  setGroupName]  = useState('')
  const [groupColor, setGroupColor] = useState(GROUP_COLORS[0])

  // Image upload
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageBase64,  setImageBase64]  = useState<string | null>(null)
  const [imageMime,    setImageMime]    = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Privacy settings
  const [privacyOpen,   setPrivacyOpen]   = useState(false)
  const [savingPrivacy, setSavingPrivacy] = useState(false)

  // Responsive
  const [isMobile,          setIsMobile]          = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  // Suggestions
  const [suggestions, setSuggestions] = useState<string[]>([])

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<any>(null)
  const abortRef  = useRef<AbortController | null>(null)

  // ── Responsive detection ──────────────────────────────────────────────────────
  useEffect(() => {
    function check() { setIsMobile(window.innerWidth < 768) }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // ── Load sidebar ─────────────────────────────────────────────────────────────
  const loadSidebar = useCallback(async () => {
    const [gRes, cRes] = await Promise.all([
      fetch(`${API_BASE}/chat-groups?agentId=${agent._id}`).then(r => r.json()),
      fetch(`${API_BASE}/chat-conversations?agentId=${agent._id}&limit=100`).then(r => r.json()),
    ])
    if (gRes.success) setGroups(gRes.data)
    if (cRes.success) setConvList(cRes.data)
  }, [agent._id])

  useEffect(() => {
    setActiveConvId(null); setMessages([]); setStreamMsg('')
    setGroups([]); setConvList([])
    loadSidebar()
  }, [agent._id, loadSidebar])

  // ── Auto-scroll ───────────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamMsg])

  // ── Open conversation ─────────────────────────────────────────────────────────
  async function openConv(id: string) {
    if (id === activeConvId) return
    setActiveConvId(id); setMessages([]); setStreamMsg(''); setSuggestions([]); setLoadingMsgs(true)
    setMobileSidebarOpen(false)
    try {
      const data = await fetch(`${API_BASE}/chat-conversations/${id}`).then(r => r.json())
      if (data.success) setMessages(data.data.messages ?? [])
    } finally {
      setLoadingMsgs(false)
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }

  // ── New conversation ──────────────────────────────────────────────────────────
  async function newConv(groupId: string | null = null) {
    const data = await fetch(`${API_BASE}/chat-conversations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: agent._id, groupId }),
    }).then(r => r.json())
    if (data.success) {
      setConvList(prev => [data.data, ...prev])
      setActiveConvId(data.data._id); setMessages([]); setStreamMsg('')
      setMobileSidebarOpen(false)
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }

  // ── Rename / delete conversation ──────────────────────────────────────────────
  async function renameConv(id: string, title: string) {
    await fetch(`${API_BASE}/chat-conversations/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
    setConvList(prev => prev.map(c => c._id === id ? { ...c, title } : c))
  }

  async function deleteConv(id: string) {
    await fetch(`${API_BASE}/chat-conversations/${id}`, { method: 'DELETE' })
    setConvList(prev => prev.filter(c => c._id !== id))
    if (activeConvId === id) { setActiveConvId(null); setMessages([]) }
  }

  // ── Group CRUD ────────────────────────────────────────────────────────────────
  async function createGroup() {
    if (!groupName.trim()) return
    const data = await fetch(`${API_BASE}/chat-groups`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: agent._id, name: groupName.trim(), color: groupColor }),
    }).then(r => r.json())
    if (data.success) {
      setGroups(prev => [data.data, ...prev])
      setGroupModal(false); setGroupName('')
    }
  }

  async function renameGroup(id: string, name: string) {
    await fetch(`${API_BASE}/chat-groups/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    setGroups(prev => prev.map(g => g._id === id ? { ...g, name } : g))
  }

  async function deleteGroup(id: string) {
    await fetch(`${API_BASE}/chat-groups/${id}`, { method: 'DELETE' })
    setGroups(prev => prev.filter(g => g._id !== id))
    setConvList(prev => prev.map(c => c.groupId === id ? { ...c, groupId: null } : c))
  }

  // ── Move conversation ─────────────────────────────────────────────────────────
  async function moveConv(id: string, groupId: string | null) {
    await fetch(`${API_BASE}/chat-conversations/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId }),
    })
    setConvList(prev => prev.map(c => c._id === id ? { ...c, groupId } : c))
  }

  // ── Drag handlers ─────────────────────────────────────────────────────────────
  function handleDrop(groupId: string | null) {
    if (!draggingConvId) return
    moveConv(draggingConvId, groupId)
    setDraggingConvId(null); setUngroupedDragOver(false)
  }

  // ── Image file selection ─────────────────────────────────────────────────────
  function handleImageFile(file: File) {
    const reader = new FileReader()
    reader.onload = e => {
      const dataUri = e.target?.result as string
      setImagePreview(dataUri)
      // strip data-URI prefix for API
      const b64 = dataUri.split(',')[1]
      setImageBase64(b64)
      setImageMime(file.type)
    }
    reader.readAsDataURL(file)
  }

  function clearImage() {
    setImagePreview(null); setImageBase64(null); setImageMime(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Privacy save ─────────────────────────────────────────────────────────────
  async function savePrivacy(isPublic: boolean) {
    if (!activeConvId) return
    setSavingPrivacy(true)
    try {
      const data = await fetch(`${API_BASE}/chat-conversations/${activeConvId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic }),
      }).then(r => r.json())
      if (data.success) {
        setConvList(prev => prev.map(c => c._id === activeConvId
          ? { ...c, isPublic: data.data.isPublic, shareToken: data.data.shareToken }
          : c
        ))
        message.success(isPublic ? 'Đã đặt công khai!' : 'Đã đặt riêng tư!')
      }
    } finally {
      setSavingPrivacy(false)
    }
  }

  // ── Starter suggestions (shown when conversation is empty) ───────────────────
  const STARTER_SUGGESTIONS = [
    'Bạn có thể giúp tôi tìm hiểu gì?',
    'Tóm tắt kiến thức chính cho tôi',
    'Hướng dẫn tôi bắt đầu từ đâu',
    'Có những tài liệu nào liên quan?',
  ]

  // ── Generate follow-up suggestions from AI response ──────────────────────────
  function generateFollowUp(aiResponse: string, userQuery: string): string[] {
    const suggestions: string[] = []
    const lower = aiResponse.toLowerCase()

    // Pattern: if AI mentions multiple items/steps, suggest asking about details
    if (/\d+\.\s/.test(aiResponse) || /^[-*]\s/m.test(aiResponse)) {
      suggestions.push('Giải thích chi tiết hơn từng bước')
    }

    // Pattern: if AI mentions a concept or term
    const conceptMatch = aiResponse.match(/\*\*([^*]+)\*\*/g)
    if (conceptMatch && conceptMatch.length > 1) {
      const first = conceptMatch[0].replace(/\*/g, '')
      suggestions.push(`${first} hoạt động như thế nào?`)
    }

    // Pattern: if AI gives examples
    if (lower.includes('ví dụ') || lower.includes('example') || lower.includes('chẳng hạn')) {
      suggestions.push('Cho tôi thêm ví dụ cụ thể')
    }

    // Pattern: if AI mentions code or technical terms
    if (aiResponse.includes('```') || lower.includes('api') || lower.includes('function')) {
      suggestions.push('Giải thích code/kỹ thuật dễ hiểu hơn')
    }

    // Pattern: comparison or alternatives
    if (lower.includes('so sánh') || lower.includes('khác nhau') || lower.includes('compare')) {
      suggestions.push('So sánh ưu nhược điểm chi tiết hơn')
    }

    // Generic follow-ups based on the user's question
    if (userQuery.length > 10) {
      suggestions.push('Còn câu hỏi liên quan nào khác không?')
    }

    // Always add a "go deeper" option
    if (suggestions.length < 2) {
      suggestions.push('Phân tích sâu hơn về vấn đề này')
    }

    // Limit to 3 suggestions
    return suggestions.slice(0, 3)
  }

  // ── Send message ──────────────────────────────────────────────────────────────
  async function send() {
    const text = input.trim()
    if ((!text && !imageBase64) || streaming || !activeConvId) return
    const sentImage = imagePreview
    setInput(''); clearImage(); setStreaming(true); setStreamMsg(''); setSuggestions([])
    setMessages(prev => [...prev, { role: 'user', content: text, imagePreview: sentImage ?? undefined }])

    abortRef.current = new AbortController()
    try {
      const res = await fetch(`${API_BASE}/chat-conversations/${activeConvId}/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          ...(imageBase64 ? { imageData: imageBase64, mimeType: imageMime } : {}),
        }),
        signal: abortRef.current.signal,
      })
      // Check HTTP status before reading stream
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        const errMsg = errBody.errorCode === 'INSUFFICIENT_CREDIT'
          ? (errBody.error || 'Số dư AI đã hết. Vui lòng nạp thêm credit.')
          : (errBody.error || `Lỗi: HTTP ${res.status}`)
        throw new Error(errMsg)
      }
      const reader  = res.body!.getReader()
      const decoder = new TextDecoder()
      let accum = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accum += decoder.decode(value, { stream: true })
        setStreamMsg(accum)
      }
      if (accum) {
        setMessages(prev => [...prev, { role: 'assistant', content: accum }])
        // Generate follow-up suggestions
        setSuggestions(generateFollowUp(accum, text))
      }
      const displayText = text || '📷 Ảnh'
      setConvList(prev => {
        const isFirst = prev.find(c => c._id === activeConvId)?.lastMessage === ''
        return prev
          .map(c => c._id !== activeConvId ? c : {
            ...c, updatedAt: new Date().toISOString(), lastMessage: displayText,
            title: isFirst ? displayText.slice(0, 55) + (displayText.length > 55 ? '…' : '') : c.title,
          })
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      })
    } catch (e: any) {
      if (e.name !== 'AbortError')
        setMessages(prev => [...prev, { role: 'assistant', content: `Lỗi: ${e.message}` }])
    } finally {
      setStreamMsg(''); setStreaming(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (input.trim() || imageBase64) send() }
  }

  function handleSuggestionClick(text: string) {
    setInput(text)
    setSuggestions([])
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  // ── Partition conversations ───────────────────────────────────────────────────
  const byGroup: Record<string, Conversation[]> = {}
  const ungrouped: Conversation[] = []
  for (const c of convList) {
    if (c.groupId) {
      byGroup[c.groupId] = byGroup[c.groupId] ?? []
      byGroup[c.groupId].push(c)
    } else {
      ungrouped.push(c)
    }
  }

  const activeConv = convList.find(c => c._id === activeConvId)
  const PANEL_H = isMobile ? 'calc(100dvh - 52px)' : '100%'

  // ── Sidebar JSX ───────────────────────────────────────────────────────────────
  const sidebarJSX = (
    <div style={{
      width: isMobile ? '100%' : 260, flexShrink: 0,
      background: C.sidebarBg,
      display: 'flex', flexDirection: 'column',
      height: isMobile ? '100%' : undefined,
      borderRight: isMobile ? 'none' : `1px solid ${C.sidebarBorder}`,
    }}>
      {/* Sidebar header */}
      <div style={{
        padding: '14px 12px 10px',
        borderBottom: `1px solid ${C.sidebarBorder}`,
      }}>
        {/* Agent name pill */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
            background: 'var(--avatar-bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <RobotOutlined style={{ color: '#fff', fontSize: 14 }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {agent.name}
            </div>
            {(agent.knowledgeIds?.length ?? 0) > 0 && (
              <div style={{ fontSize: 10, color: C.textMuted }}>
                {agent.knowledgeIds.length} tài liệu
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => newConv(null)}
            style={{
              flex: 1, padding: '7px 10px',
              background: 'var(--accent-color)',
              border: 'none', borderRadius: 8, cursor: 'pointer',
              color: '#fff', fontSize: 12, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              boxShadow: 'var(--shadow-sm)',
            }}
            className="cp-opacity-btn"
          >
            <PlusOutlined style={{ fontSize: 11 }} /> Chat mới
          </button>
          <Tooltip title="Tạo nhóm mới">
            <button
              onClick={() => setGroupModal(true)}
              style={{
                width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                cursor: 'pointer', color: C.accent1, fontSize: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              className="cp-btn-ghost"
            >
              <FolderAddOutlined />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Drag hint */}
      {draggingConvId && (
        <div style={{
          padding: '4px 12px', fontSize: 11, color: C.accent1,
          background: 'var(--bg-secondary)', borderBottom: `1px solid ${C.sidebarBorder}`,
          textAlign: 'center',
        }}>
          Kéo thả vào nhóm bất kỳ
        </div>
      )}

      {/* Conversation tree */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 12px', scrollbarWidth: 'thin', scrollbarColor: 'var(--border-color) transparent' }}>
        {convList.length === 0 && groups.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 16px', color: C.textMuted }}>
            <RobotOutlined style={{ fontSize: 28, marginBottom: 8, display: 'block', opacity: 0.4 }} />
            <div style={{ fontSize: 12 }}>Chưa có cuộc trò chuyện.</div>
            <div style={{ fontSize: 11, marginTop: 4, opacity: 0.7 }}>Nhấn "+ Chat mới" để bắt đầu.</div>
          </div>
        ) : (
          <>
            {groups.map(g => (
              <GroupSection
                key={g._id} group={g} convs={byGroup[g._id] ?? []}
                activeConvId={activeConvId} groups={groups}
                draggingConvId={draggingConvId}
                onDropConv={handleDrop}
                onSelect={openConv} onRename={renameConv} onDelete={deleteConv}
                onRenameGroup={renameGroup} onDeleteGroup={deleteGroup} onMove={moveConv}
                onNewConvInGroup={newConv}
                onDragStart={id => setDraggingConvId(id)}
                onDragEnd={() => setDraggingConvId(null)}
              />
            ))}

            {ungrouped.length > 0 && (
              <div
                style={{ marginTop: groups.length > 0 ? 10 : 0 }}
                onDragOver={e => { if (draggingConvId) { e.preventDefault(); setUngroupedDragOver(true) } }}
                onDragLeave={() => setUngroupedDragOver(false)}
                onDrop={() => { setUngroupedDragOver(false); handleDrop(null) }}
              >
                {groups.length > 0 && (
                  <div style={{
                    fontSize: 10, fontWeight: 700, color: ungroupedDragOver ? C.accent1 : C.textMuted,
                    padding: '3px 8px 5px', textTransform: 'uppercase', letterSpacing: '.06em',
                    background: ungroupedDragOver ? 'var(--bg-secondary)' : 'transparent',
                    borderRadius: 6, border: `1px solid ${ungroupedDragOver ? 'var(--border-color)' : 'transparent'}`,
                    transition: 'all .12s', marginBottom: 3,
                  }}>
                    {ungroupedDragOver ? '↓ Thả vào Gần đây' : 'Gần đây'}
                  </div>
                )}
                {ungrouped.map(c => (
                  <ConvRow key={c._id} conv={c}
                    active={c._id === activeConvId} groups={groups}
                    isDragging={draggingConvId === c._id} isDropTarget={false}
                    onSelect={() => openConv(c._id)}
                    onRename={t => renameConv(c._id, t)}
                    onDelete={() => deleteConv(c._id)}
                    onMove={gid => moveConv(c._id, gid)}
                    onDragStart={() => setDraggingConvId(c._id)}
                    onDragEnd={() => setDraggingConvId(null)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes cpBlink { 0%,100%{opacity:1} 50%{opacity:0} }
        .cp-conv-row:hover .cp-more { opacity: 1 !important; }
        .cp-conv-row:hover { background: var(--sidebar-hover-bg) !important; }
        .cp-group-hdr:hover .cp-group-btn { opacity: 1 !important; }
        .cp-input-box:focus-within { border-color: var(--accent-color) !important; box-shadow: 0 0 0 3px var(--accent-light) !important; }
        .cp-suggest-chip { transition: all .18s ease; }
        .cp-suggest-chip:hover { background: var(--accent-light) !important; border-color: var(--accent-color) !important; color: var(--accent-color) !important; transform: translateY(-1px); }
        .cp-btn-ghost { transition: background .18s, color .18s, opacity .18s; }
        .cp-btn-ghost:hover { background: var(--sidebar-hover-bg); color: var(--accent-color); }
        .cp-btn-danger { transition: background .18s, color .18s; color: var(--text-tertiary); }
        .cp-btn-danger:hover { background: var(--error-bg); color: var(--error-text); }
        .cp-copy-btn { transition: color .15s; color: var(--text-tertiary); }
        .cp-copy-btn:hover { color: var(--text-secondary); }
        .cp-opacity-btn { transition: opacity .15s; }
        .cp-opacity-btn:hover { opacity: 0.85; }
      `}</style>

      {/* Mobile sidebar drawer */}
      {isMobile && (
        <Drawer
          open={mobileSidebarOpen}
          onClose={() => setMobileSidebarOpen(false)}
          placement="left"
          width={280}
          styles={{ body: { padding: 0, background: C.sidebarBg, height: '100%' }, header: { display: 'none' } }}
        >
          {sidebarJSX}
        </Drawer>
      )}

      <div style={{
        display: 'flex', height: PANEL_H,
        borderRadius: 0,
        overflow: 'hidden',
      }}>
        {/* Desktop sidebar */}
        {!isMobile && sidebarJSX}

        {/* ── Main chat area ───────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: C.chatBg, minWidth: 0 }}>

          {/* Chat header */}
          <div style={{
            padding: '0 16px', height: 52,
            display: 'flex', alignItems: 'center', gap: 10,
            borderBottom: `1px solid ${C.sidebarBorder}`,
            flexShrink: 0,
            background: 'var(--bg-color)',
          }}>
            {/* Mobile toggle */}
            {isMobile && (
              <button
                onClick={() => setMobileSidebarOpen(true)}
                style={{
                  border: 'none', cursor: 'pointer',
                  width: 32, height: 32, borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: C.accent1, fontSize: 16,
                  background: 'var(--chat-bot-bg)',
                }}
              >
                <MenuOutlined />
              </button>
            )}

            {activeConv ? (
              <>
                <div style={{
                  width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                  background: 'var(--avatar-bg)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <MessageOutlined style={{ color: '#fff', fontSize: 13 }} />
                </div>
                <span style={{
                  fontSize: 14, fontWeight: 600, flex: 1, color: C.textPrimary,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {activeConv.title}
                </span>
                <Tooltip title="Cài đặt chia sẻ">
                  <button
                    onClick={() => setPrivacyOpen(true)}
                    style={{
                      background: activeConv.isPublic ? 'var(--bg-secondary)' : 'none',
                      border: activeConv.isPublic ? '1px solid var(--border-color)' : 'none',
                      cursor: 'pointer',
                      color: activeConv.isPublic ? C.accent1 : 'var(--text-tertiary)', fontSize: 15,
                      padding: '4px 6px', borderRadius: 6, transition: 'all .15s',
                    }}
                    className="cp-btn-ghost"
                  >
                    {activeConv.isPublic ? <GlobalOutlined /> : <LockOutlined />}
                  </button>
                </Tooltip>
                <Popconfirm title="Xóa cuộc trò chuyện này?" okText="Xóa" okType="danger" onConfirm={() => deleteConv(activeConv._id)}>
                  <button style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--error-color, #fca5a5)', fontSize: 15, padding: '4px 6px', borderRadius: 6,
                    transition: 'all .15s',
                  }}
                    className="cp-btn-danger"
                  >
                    <DeleteOutlined />
                  </button>
                </Popconfirm>
              </>
            ) : (
              <span style={{
                fontSize: 13, color: C.textMuted, fontStyle: 'italic',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <RobotOutlined style={{ opacity: 0.5 }} />
                Chọn hoặc tạo cuộc trò chuyện mới
              </span>
            )}
          </div>

          {/* Messages area */}
          <div style={{
            flex: 1, overflowY: 'auto',
            padding: isMobile ? '16px 12px' : '28px 10%',
            scrollbarWidth: 'thin', scrollbarColor: 'var(--border-color) transparent',
          }}>
            {!activeConvId ? (
              /* Welcome state */
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', height: '100%', gap: 16,
              }}>
                <div style={{
                  width: 72, height: 72, borderRadius: 20,
                  background: 'var(--avatar-bg)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: 'var(--shadow-lg)',
                }}>
                  <RobotOutlined style={{ fontSize: 34, color: 'var(--bg-color)' }} />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: C.textPrimary, marginBottom: 6 }}>
                    Chat với {agent.name}
                  </div>
                  <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 16 }}>
                    Hỏi bất cứ điều gì. AI sẽ trả lời dựa trên knowledge base.
                  </div>
                  {(agent.knowledgeIds?.length ?? 0) > 0 && (
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      background: 'var(--chat-bot-bg)', borderRadius: 99, padding: '4px 12px',
                      fontSize: 12, color: C.accent2, fontWeight: 600,
                      marginBottom: 16,
                    }}>
                      📚 {agent.knowledgeIds.length} tài liệu trong knowledge base
                    </div>
                  )}
                  <div>
                    <button
                      onClick={() => newConv(null)}
                      style={{
                        padding: '10px 24px',
                        background: 'var(--accent-color)',
                        border: 'none', borderRadius: 99, cursor: 'pointer',
                        color: '#fff', fontSize: 13.5, fontWeight: 600,
                        boxShadow: 'var(--shadow-md)',
                      }}
                      className="cp-opacity-btn"
                    >
                      + Bắt đầu chat
                    </button>
                  </div>
                </div>
              </div>
            ) : loadingMsgs ? (
              <div style={{ textAlign: 'center', padding: 60 }}>
                <Spin indicator={<LoadingOutlined spin style={{ color: C.accent1, fontSize: 28 }} />} />
              </div>
            ) : (
              <>
                {messages.length === 0 && !streaming && agent.welcomeMessage && (
                  <Bubble msg={{ role: 'assistant', content: agent.welcomeMessage }} />
                )}
                {/* Starter suggestions for new conversation */}
                {messages.length === 0 && !streaming && (
                  <div style={{
                    display: 'flex', flexWrap: 'wrap', gap: 8,
                    justifyContent: 'center',
                    padding: '8px 0 16px', maxWidth: 520, margin: '0 auto',
                  }}>
                    {STARTER_SUGGESTIONS.map((s, i) => (
                      <button key={i} className="cp-suggest-chip" onClick={() => handleSuggestionClick(s)} style={{
                        padding: '8px 16px', borderRadius: 20,
                        background: 'var(--bg-color)', border: '1px solid var(--border-color)',
                        cursor: 'pointer', fontSize: 12.5, color: 'var(--text-secondary)',
                        display: 'flex', alignItems: 'center', gap: 6,
                        boxShadow: 'var(--shadow-sm)',
                      }}>
                        <BulbOutlined style={{ fontSize: 13, color: 'var(--accent-color)' }} />
                        {s}
                      </button>
                    ))}
                  </div>
                )}
                {messages.map((m, idx) => <Bubble key={idx} msg={m} />)}
                {/* Follow-up suggestions after AI response */}
                {!streaming && suggestions.length > 0 && messages.length > 0 && (
                  <div style={{
                    display: 'flex', flexWrap: 'wrap', gap: 8,
                    padding: '4px 0 12px 44px',
                    animation: 'pageFadeIn 0.3s ease',
                  }}>
                    {suggestions.map((s, i) => (
                      <button key={i} className="cp-suggest-chip" onClick={() => handleSuggestionClick(s)} style={{
                        padding: '6px 14px', borderRadius: 18,
                        background: 'var(--bg-color)', border: '1px solid var(--border-color)',
                        cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)',
                        display: 'flex', alignItems: 'center', gap: 5,
                        boxShadow: 'var(--shadow-sm)',
                      }}>
                        <BulbOutlined style={{ fontSize: 11, color: 'var(--accent-color)' }} />
                        {s}
                      </button>
                    ))}
                  </div>
                )}
                {streaming && streamMsg && <Bubble msg={{ role: 'assistant', content: streamMsg }} isStreaming />}
                {streaming && !streamMsg && (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%',
                      background: 'var(--avatar-bg)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <RobotOutlined style={{ color: '#fff', fontSize: 15 }} />
                    </div>
                    <div style={{
                      background: 'var(--bg-color)', padding: '12px 18px',
                      borderRadius: '18px 18px 18px 4px',
                      border: `1px solid ${C.aiBorder}`,
                      boxShadow: C.aiShadow,
                      display: 'flex', gap: 6, alignItems: 'center',
                    }}>
                      {[0, 1, 2].map(j => (
                        <span key={j} style={{
                          width: 7, height: 7, borderRadius: '50%',
                          background: 'var(--accent-color)',
                          display: 'inline-block',
                          animation: `cpBlink 1.3s ease-in-out ${j * 0.22}s infinite`,
                        }} />
                      ))}
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </>
            )}
          </div>

          {/* Input area */}
          {activeConvId && (
            <div style={{
              padding: isMobile ? '10px 12px 14px' : '12px 10% 18px',
              flexShrink: 0,
              background: C.chatBg,
            }}>
              {/* Image preview above input */}
              {imagePreview && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  marginBottom: 8, padding: '8px 10px',
                  background: 'var(--chat-bot-bg)', borderRadius: 10,
                  border: `1px solid ${C.sidebarBorder}`,
                }}>
                  <img
                    src={imagePreview} alt="preview"
                    style={{ height: 72, maxWidth: 120, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: C.textSecondary, fontWeight: 600 }}>Ảnh đính kèm</div>
                    <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{imageMime}</div>
                  </div>
                  <button
                    onClick={clearImage}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-tertiary)', fontSize: 14, padding: 2, lineHeight: 1,
                      flexShrink: 0,
                    }}
                    className="cp-btn-danger"
                  >
                    <CloseOutlined />
                  </button>
                </div>
              )}

              <input
                ref={fileInputRef} type="file" accept="image/*"
                style={{ display: 'none' }}
                onChange={e => { if (e.target.files?.[0]) handleImageFile(e.target.files[0]) }}
              />

              <div
                className="cp-input-box"
                style={{
                  display: 'flex', gap: 10, alignItems: 'flex-end',
                  background: C.inputBg,
                  border: `1.5px solid ${C.inputBorder}`,
                  borderRadius: 14, padding: '10px 10px 10px 16px',
                  transition: 'border-color .2s, box-shadow .2s',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <TextArea
                  ref={inputRef} value={input}
                  onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
                  placeholder={streaming ? 'Đang trả lời…' : 'Nhập tin nhắn… (Enter gửi, Shift+Enter xuống dòng)'}
                  autoSize={{ minRows: 1, maxRows: 6 }}
                  disabled={streaming}
                  style={{
                    flex: 1, resize: 'none', border: 'none',
                    background: 'transparent', fontSize: 13.5, color: C.textPrimary,
                    boxShadow: 'none', padding: 0,
                  }}
                />
                {/* Image attach button */}
                <Tooltip title="Đính kèm ảnh">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={streaming}
                    style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      background: imagePreview ? 'var(--bg-secondary)' : 'var(--chat-bot-bg)',
                      border: imagePreview ? `1.5px solid ${C.accent1}` : `1px solid ${C.sidebarBorder}`,
                      cursor: streaming ? 'not-allowed' : 'pointer',
                      color: imagePreview ? C.accent1 : C.textMuted, fontSize: 15,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all .2s',
                    }}
                    className="cp-btn-ghost"
                  >
                    <PictureOutlined />
                  </button>
                </Tooltip>
                {streaming ? (
                  <button
                    onClick={() => abortRef.current?.abort()}
                    style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      background: 'var(--bg-secondary)', border: '1px solid var(--error-color, #fecaca)', cursor: 'pointer',
                      color: 'var(--error-color, #ef4444)', fontSize: 15,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <CloseOutlined />
                  </button>
                ) : (
                  <button
                    onClick={send} disabled={!input.trim() && !imageBase64}
                    style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      background: (input.trim() || imageBase64)
                        ? 'var(--accent-color)'
                        : 'var(--bg-secondary)',
                      border: 'none', cursor: (input.trim() || imageBase64) ? 'pointer' : 'not-allowed',
                      color: (input.trim() || imageBase64) ? '#fff' : 'var(--text-tertiary)',
                      fontSize: 15,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: (input.trim() || imageBase64) ? 'var(--shadow-sm)' : 'none',
                      transition: 'all .2s',
                    }}
                  >
                    <SendOutlined />
                  </button>
                )}
              </div>
              <div style={{
                fontSize: 11, color: 'var(--text-tertiary)',
                textAlign: 'center', marginTop: 6,
              }}>
                Enter gửi · Shift+Enter xuống dòng · Double-click đổi tên
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Privacy settings modal */}
      <Modal
        open={privacyOpen}
        onCancel={() => setPrivacyOpen(false)}
        footer={null}
        title={<span style={{ color: C.textPrimary }}><SettingOutlined style={{ color: C.accent1, marginRight: 8 }} />Cài đặt chia sẻ</span>}
      >
        {activeConv && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 12 }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', borderRadius: 12,
              background: activeConv.isPublic ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
              border: `1px solid ${activeConv.isPublic ? 'var(--border-color)' : 'var(--border-color)'}`,
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary, display: 'flex', alignItems: 'center', gap: 7 }}>
                  {activeConv.isPublic ? <GlobalOutlined style={{ color: C.accent1 }} /> : <LockOutlined style={{ color: C.textMuted }} />}
                  {activeConv.isPublic ? 'Đang công khai' : 'Đang riêng tư'}
                </div>
                <div style={{ fontSize: 12, color: C.textMuted, marginTop: 3 }}>
                  {activeConv.isPublic
                    ? 'Bất kỳ ai có link đều có thể xem cuộc trò chuyện này.'
                    : 'Chỉ bạn mới xem được cuộc trò chuyện này.'}
                </div>
              </div>
              <Switch
                checked={activeConv.isPublic}
                loading={savingPrivacy}
                onChange={savePrivacy}
                style={{ background: activeConv.isPublic ? C.accent1 : undefined }}
              />
            </div>

            {activeConv.isPublic && activeConv.shareToken && (
              <div style={{
                padding: '12px 14px', borderRadius: 10,
                background: 'var(--chat-bot-bg)', border: `1px solid ${C.sidebarBorder}`,
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.textSecondary, marginBottom: 8 }}>
                  <LinkOutlined style={{ marginRight: 5 }} />Link chia sẻ
                </div>
                <div style={{
                  display: 'flex', gap: 8, alignItems: 'center',
                }}>
                  <div style={{
                    flex: 1, fontSize: 12, color: C.textPrimary,
                    background: 'var(--bg-color)', border: `1px solid ${C.sidebarBorder}`,
                    borderRadius: 8, padding: '6px 10px',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    fontFamily: 'monospace',
                  }}>
                    {typeof window !== 'undefined'
                      ? `${window.location.origin}/share/${activeConv.shareToken}`
                      : `/share/${activeConv.shareToken}`}
                  </div>
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}/share/${activeConv.shareToken}`
                      navigator.clipboard.writeText(url)
                      message.success('Đã copy link!')
                    }}
                    style={{
                      flexShrink: 0, padding: '6px 14px', borderRadius: 8,
                      background: 'var(--accent-color)',
                      border: 'none', cursor: 'pointer', color: '#fff',
                      fontSize: 12, fontWeight: 600,
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}
                  >
                    <CopyOutlined /> Copy
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* New group modal */}
      <Modal
        open={groupModal} onCancel={() => setGroupModal(false)} onOk={createGroup}
        title={<span style={{ color: C.textPrimary }}><FolderAddOutlined style={{ color: C.accent1, marginRight: 8 }} />Tạo nhóm chat</span>}
        okText="Tạo"
        okButtonProps={{ style: { background: 'var(--accent-color)', border: 'none', borderRadius: 8 } }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
          <div>
            <label style={{ fontSize: 13, color: C.textPrimary, display: 'block', marginBottom: 6, fontWeight: 500 }}>Tên nhóm</label>
            <Input
              autoFocus value={groupName}
              onChange={e => setGroupName(e.target.value)} onPressEnter={createGroup}
              placeholder="VD: Dự án Alpha, Hỗ trợ KH…"
              style={{ borderRadius: 8 }}
            />
          </div>
          <div>
            <label style={{ fontSize: 13, color: C.textPrimary, display: 'block', marginBottom: 8, fontWeight: 500 }}>Màu sắc</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {GROUP_COLORS.map(col => (
                <div key={col} onClick={() => setGroupColor(col)} style={{
                  width: 28, height: 28, borderRadius: '50%', background: col,
                  cursor: 'pointer',
                  border: groupColor === col ? `3px solid ${C.textPrimary}` : '3px solid transparent',
                  outline: groupColor === col ? `2px solid ${col}` : 'none',
                  outlineOffset: 2, transition: 'all .15s',
                  boxShadow: groupColor === col ? `0 0 8px ${col}80` : 'none',
                }} />
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </>
  )
}
