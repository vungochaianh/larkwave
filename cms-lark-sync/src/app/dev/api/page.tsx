'use client'

import React, { useState, useRef, useCallback } from 'react'
import {
  Alert, Badge, Button, Card, Collapse, Divider, Input, Select,
  Space, Tag, Tooltip, Typography, Spin, Empty, Switch, Tabs,
} from 'antd'
import {
  ApiOutlined, BookOutlined, BellOutlined, CheckCircleOutlined,
  ClockCircleOutlined, CloseCircleOutlined, CopyOutlined, DatabaseOutlined,
  FileTextOutlined, HistoryOutlined, KeyOutlined, PlayCircleOutlined,
  RobotOutlined, SafetyOutlined, SendOutlined, TeamOutlined,
  ThunderboltOutlined, UserOutlined, WarningOutlined,
} from '@ant-design/icons'
import type { EndpointDef, GroupDef } from '@/lib/apiDefs'
import { API_GROUPS } from '@/lib/apiDefs'
import useLang from '@/store/language'
import TourGuide from '@/components/TourGuide'
import { tourSteps } from '@/lib/tourSteps'

const { Text, Title, Paragraph } = Typography
const { TextArea } = Input

// ─── helpers ─────────────────────────────────────────────────────────────────

const METHOD_COLORS: Record<string, string> = {
  GET: '#52c41a', POST: '#1677ff', PUT: '#fa8c16',
  PATCH: '#fadb14', DELETE: '#ff4d4f',
}
const METHOD_BG: Record<string, string> = {
  GET: 'var(--success-bg)', POST: 'var(--info-bg)', PUT: 'var(--warning-bg)',
  PATCH: 'var(--warning-bg)', DELETE: 'var(--error-bg)',
}

const ICON_MAP: Record<string, React.ReactNode> = {
  KeyOutlined:        <KeyOutlined />,
  DatabaseOutlined:   <DatabaseOutlined />,
  FileTextOutlined:   <FileTextOutlined />,
  TeamOutlined:       <TeamOutlined />,
  SafetyOutlined:     <SafetyOutlined />,
  ClockCircleOutlined:<ClockCircleOutlined />,
  BellOutlined:       <BellOutlined />,
  ApiOutlined:        <ApiOutlined />,
  ThunderboltOutlined:<ThunderboltOutlined />,
  RobotOutlined:      <RobotOutlined />,
  BookOutlined:       <BookOutlined />,
  HistoryOutlined:    <HistoryOutlined />,
  UserOutlined:       <UserOutlined />,
  PlayCircleOutlined: <PlayCircleOutlined />,
}

function MethodBadge({ method }: { method: string }) {
  return (
    <Tag
      style={{
        background: METHOD_BG[method],
        color: METHOD_COLORS[method],
        border: `1px solid ${METHOD_COLORS[method]}44`,
        fontWeight: 700,
        fontSize: 11,
        letterSpacing: 0.5,
        minWidth: 54,
        textAlign: 'center',
      }}
    >
      {method}
    </Tag>
  )
}

function JsonViewer({ data }: { data: unknown }) {
  const str = JSON.stringify(data, null, 2)
  function copy() { navigator.clipboard.writeText(str) }
  return (
    <div style={{ position: 'relative' }}>
      <pre style={{
        background: 'var(--code-bg)',
        color: 'var(--code-text)',
        padding: '12px 16px',
        borderRadius: 8,
        fontSize: 12,
        lineHeight: 1.6,
        overflowX: 'auto',
        maxHeight: 320,
        margin: 0,
      }}>
        {str}
      </pre>
      <Button
        size="small"
        icon={<CopyOutlined />}
        onClick={copy}
        style={{ position: 'absolute', top: 8, right: 8, opacity: 0.7 }}
      />
    </div>
  )
}

// ─── Try-It panel ─────────────────────────────────────────────────────────────

interface TryState {
  pathValues: Record<string, string>
  queryValues: Record<string, string>
  headerValues: Record<string, string>
  bodyText: string
  response: string
  responseStatus: number | null
  loading: boolean
  error: string
}

function TryItPanel({
  endpoint,
  globalToken,
  baseUrl,
}: {
  endpoint: EndpointDef
  globalToken: string
  baseUrl: string
}) {
  const pathParams   = endpoint.params?.filter(p => p.in === 'path')   ?? []
  const queryParams  = endpoint.params?.filter(p => p.in === 'query')  ?? []
  const headerParams = endpoint.params?.filter(p => p.in === 'header') ?? []

  const [state, setState] = useState<TryState>({
    pathValues:   Object.fromEntries(pathParams.map(p => [p.name, p.example ?? ''])),
    queryValues:  Object.fromEntries(queryParams.map(p => [p.name, p.example ?? ''])),
    headerValues: Object.fromEntries(headerParams.map(p => [p.name, p.name === 'Authorization' ? `Bearer ${globalToken}` : ''])),
    bodyText:     endpoint.bodyExample ? JSON.stringify(endpoint.bodyExample, null, 2) : '',
    response:     '',
    responseStatus: null,
    loading:      false,
    error:        '',
  })

  // Update auth header when global token changes
  const setField = (key: keyof TryState, val: unknown) =>
    setState(s => ({ ...s, [key]: val }))

  function buildUrl() {
    let path = endpoint.path
    Object.entries(state.pathValues).forEach(([k, v]) => {
      path = path.replace(`:${k}`, encodeURIComponent(v || `:${k}`))
    })
    const qs = Object.entries(state.queryValues)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&')
    return `${baseUrl}${path}${qs ? '?' + qs : ''}`
  }

  async function send() {
    setField('loading', true)
    setField('error', '')
    setField('response', '')
    setField('responseStatus', null)
    try {
      const url = buildUrl()
      const headers: Record<string, string> = { ...state.headerValues }
      if (globalToken && !headers['Authorization']) {
        headers['Authorization'] = `Bearer ${globalToken}`
      }
      const hasBody = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(endpoint.method) && state.bodyText
      if (hasBody) headers['Content-Type'] = 'application/json'

      const fetchOpts: RequestInit = {
        method: endpoint.method,
        headers,
        ...(hasBody ? { body: state.bodyText } : {}),
      }

      if (endpoint.streaming) {
        const res = await fetch(url, fetchOpts)
        setField('responseStatus', res.status)
        if (!res.body) { setField('response', '(no stream body)'); return }
        const reader  = res.body.getReader()
        const decoder = new TextDecoder('utf-8', { fatal: false })
        let acc = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          acc += decoder.decode(value, { stream: true })
          setField('response', acc)
        }
      } else {
        const res  = await fetch(url, fetchOpts)
        const text = await res.text()
        setField('responseStatus', res.status)
        try {
          setField('response', JSON.stringify(JSON.parse(text), null, 2))
        } catch {
          setField('response', text)
        }
      }
    } catch (e: any) {
      setField('error', e.message)
    } finally {
      setField('loading', false)
    }
  }

  const url = buildUrl()
  const statusColor = state.responseStatus
    ? state.responseStatus < 300 ? '#52c41a' : state.responseStatus < 500 ? '#fa8c16' : '#ff4d4f'
    : undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* URL preview */}
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: 8,
        padding: '8px 12px',
        fontFamily: 'monospace',
        fontSize: 12,
        wordBreak: 'break-all',
        color: 'var(--text-color)',
      }}>
        <MethodBadge method={endpoint.method} />
        {' '}{url}
      </div>

      {/* Path params */}
      {pathParams.length > 0 && (
        <div>
          <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Path</Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
            {pathParams.map(p => (
              <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text code style={{ minWidth: 120, fontSize: 12 }}>{p.name}</Text>
                <Input
                  size="small"
                  placeholder={p.description}
                  value={state.pathValues[p.name] ?? ''}
                  onChange={e => setField('pathValues', { ...state.pathValues, [p.name]: e.target.value })}
                  style={{ flex: 1 }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Query params */}
      {queryParams.length > 0 && (
        <div>
          <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Query</Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
            {queryParams.map(p => (
              <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text code style={{ minWidth: 120, fontSize: 12 }}>{p.name}</Text>
                <Input
                  size="small"
                  placeholder={p.description}
                  value={state.queryValues[p.name] ?? ''}
                  onChange={e => setField('queryValues', { ...state.queryValues, [p.name]: e.target.value })}
                  style={{ flex: 1 }}
                />
                {!p.required && <Tag color="default" style={{ fontSize: 10 }}>optional</Tag>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Request body */}
      {['POST', 'PUT', 'PATCH'].includes(endpoint.method) && (
        <div>
          <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Body (JSON)</Text>
          <TextArea
            value={state.bodyText}
            onChange={e => setField('bodyText', e.target.value)}
            rows={6}
            style={{ fontFamily: 'monospace', fontSize: 12, marginTop: 4 }}
          />
        </div>
      )}

      {/* Send button */}
      <Button
        type="primary"
        icon={<SendOutlined />}
        onClick={send}
        loading={state.loading}
        style={{ alignSelf: 'flex-start' }}
      >
        Send Request
      </Button>

      {/* Error */}
      {state.error && <Alert type="error" message={state.error} showIcon />}

      {/* Response */}
      {(state.response || state.responseStatus !== null) && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Response</Text>
            {state.responseStatus && (
              <Tag color={state.responseStatus < 300 ? 'success' : 'error'}>
                {state.responseStatus}
              </Tag>
            )}
            {endpoint.streaming && <Tag color="blue">Streaming</Tag>}
          </div>
          <pre style={{
            background: 'var(--code-bg)',
            color: 'var(--code-text)',
            padding: '12px 16px',
            borderRadius: 8,
            fontSize: 12,
            lineHeight: 1.6,
            overflowX: 'auto',
            maxHeight: 360,
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {state.response}
          </pre>
        </div>
      )}
    </div>
  )
}

// ─── Endpoint card ────────────────────────────────────────────────────────────

function EndpointCard({
  endpoint,
  globalToken,
  baseUrl,
  lang,
}: {
  endpoint: EndpointDef
  globalToken: string
  baseUrl: string
  lang: 'vi' | 'en'
}) {
  const [open, setOpen] = useState(false)

  const labels = {
    tryIt: lang === 'vi' ? 'Thử ngay' : 'Try It',
    docs:  lang === 'vi' ? 'Tài liệu' : 'Docs',
    example: lang === 'vi' ? 'Ví dụ Body' : 'Body Example',
    response: lang === 'vi' ? 'Ví dụ Response' : 'Response Example',
    streaming: lang === 'vi' ? 'Streaming' : 'Streaming',
    params: lang === 'vi' ? 'Tham số' : 'Parameters',
    required: lang === 'vi' ? 'Bắt buộc' : 'Required',
  }

  const tabItems = [
    {
      key: 'try',
      label: <span><SendOutlined /> {labels.tryIt}</span>,
      children: <TryItPanel endpoint={endpoint} globalToken={globalToken} baseUrl={baseUrl} />,
    },
    {
      key: 'docs',
      label: <span><FileTextOutlined /> {labels.docs}</span>,
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {endpoint.description && (
            <Paragraph style={{ margin: 0 }}>{endpoint.description}</Paragraph>
          )}
          {endpoint.streaming && (
            <Alert type="info" showIcon message="Streaming endpoint — returns text/event-stream chunks" />
          )}
          {endpoint.params && endpoint.params.length > 0 && (
            <div>
              <Text strong style={{ display: 'block', marginBottom: 6 }}>{labels.params}</Text>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)' }}>
                    {['Name', 'In', 'Type', labels.required, 'Description'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid var(--border-color)', color: 'var(--text-color)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {endpoint.params?.map(p => (
                    <tr key={p.name} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '6px 10px' }}><Text code style={{ fontSize: 11 }}>{p.name}</Text></td>
                      <td style={{ padding: '6px 10px' }}><Tag style={{ fontSize: 10 }}>{p.in}</Tag></td>
                      <td style={{ padding: '6px 10px' }}><Text type="secondary" style={{ fontSize: 11 }}>{p.type}</Text></td>
                      <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                        {p.required ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : <Text type="secondary">—</Text>}
                      </td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-color)' }}>{p.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {endpoint.bodyExample && (
            <div>
              <Text strong style={{ display: 'block', marginBottom: 6 }}>{labels.example}</Text>
              <JsonViewer data={endpoint.bodyExample} />
            </div>
          )}
          {endpoint.responseExample && (
            <div>
              <Text strong style={{ display: 'block', marginBottom: 6 }}>{labels.response}</Text>
              <JsonViewer data={endpoint.responseExample} />
            </div>
          )}
        </div>
      ),
    },
  ]

  return (
    <div style={{
      border: '1px solid var(--border-color)',
      borderRadius: 10,
      overflow: 'hidden',
      marginBottom: 8,
      background: 'var(--bg-color)',
    }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 16px',
          cursor: 'pointer',
          userSelect: 'none',
          background: open ? 'var(--bg-secondary)' : 'var(--bg-color)',
          transition: 'background 0.2s',
        }}
      >
        <MethodBadge method={endpoint.method} />
        <Text code style={{ fontSize: 13, flex: 1, color: 'var(--text-color)' }}>
          {endpoint.path}
        </Text>
        <Text style={{ color: 'var(--text-color)', fontSize: 13 }}>{endpoint.summary}</Text>
        {endpoint.streaming && <Tag color="blue" style={{ fontSize: 10 }}>SSE</Tag>}
        {endpoint.authRequired && <Tag color="orange" style={{ fontSize: 10 }}>Auth</Tag>}
      </div>
      {open && (
        <div style={{ padding: '16px', borderTop: '1px solid var(--border-color)' }}>
          <Tabs size="small" items={tabItems} />
        </div>
      )}
    </div>
  )
}

// ─── Sidebar group link ───────────────────────────────────────────────────────

function GroupSidebar({
  groups,
  active,
  onSelect,
  lang,
}: {
  groups: GroupDef[]
  active: string
  onSelect: (id: string) => void
  lang: 'vi' | 'en'
}) {
  return (
    <div style={{
      position: 'sticky',
      top: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      {groups.map(g => (
        <div
          key={g.id}
          onClick={() => onSelect(g.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 12px',
            borderRadius: 8,
            cursor: 'pointer',
            background: active === g.id ? `${g.color}18` : 'transparent',
            borderLeft: active === g.id ? `3px solid ${g.color}` : '3px solid transparent',
            transition: 'all 0.15s',
          }}
        >
          <span style={{ color: g.color, fontSize: 16 }}>{ICON_MAP[g.icon]}</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-color)' }}>{g.label[lang]}</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary, #888)' }}>{g.endpoints.length} endpoints</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ApiExplorerPage() {
  const { lang } = useLang()
  const [activeGroup, setActiveGroup] = useState(API_GROUPS[0].id)
  const [globalToken, setGlobalToken] = useState('')
  const [baseUrl, setBaseUrl] = useState(
    typeof window !== 'undefined'
      ? (process.env.NEXT_PUBLIC_API_BASE?.replace(/\/api$/, '') || 'https://apihoanam.toolswave.net')
      : 'https://apihoanam.toolswave.net',
  )
  const [search, setSearch] = useState('')

  const currentGroup = API_GROUPS.find(g => g.id === activeGroup) ?? API_GROUPS[0]

  const filteredEndpoints = search
    ? currentGroup.endpoints.filter(e =>
        e.summary.toLowerCase().includes(search.toLowerCase()) ||
        e.path.toLowerCase().includes(search.toLowerCase()) ||
        e.method.toLowerCase().includes(search.toLowerCase()),
      )
    : currentGroup.endpoints

  const tr = {
    title:        lang === 'vi' ? 'API Explorer'           : 'API Explorer',
    subtitle:     lang === 'vi' ? 'Khám phá và test toàn bộ API của hệ thống Hoa Nam' : 'Explore and test all Hoa Nam system APIs',
    baseUrl:      lang === 'vi' ? 'Base URL'               : 'Base URL',
    authToken:    lang === 'vi' ? 'Auth Token (Bearer)'    : 'Auth Token (Bearer)',
    authHint:     lang === 'vi' ? 'Token này được điền tự động vào header Authorization cho tất cả request' : 'Token applied to Authorization header for all requests',
    search:       lang === 'vi' ? 'Tìm endpoint...'        : 'Search endpoints...',
    noResult:     lang === 'vi' ? 'Không tìm thấy endpoint' : 'No endpoints found',
    totalGroups:  lang === 'vi' ? 'nhóm'                   : 'groups',
    totalEp:      lang === 'vi' ? 'endpoints'              : 'endpoints',
  }

  const totalEndpoints = API_GROUPS.reduce((s, g) => s + g.endpoints.length, 0)

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>
          <ApiOutlined style={{ color: '#1677ff', marginRight: 10 }} />
          {tr.title}
        </Title>
        <Text type="secondary">{tr.subtitle}</Text>
        <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
          <Tag>{API_GROUPS.length} {tr.totalGroups}</Tag>
          <Tag>{totalEndpoints} {tr.totalEp}</Tag>
        </div>
      </div>

      {/* Global config */}
      <Card
        size="small"
        style={{ marginBottom: 20, borderRadius: 12 }}
        bodyStyle={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}
      >
        <div style={{ flex: 1, minWidth: 220 }}>
          <Text strong style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>{tr.baseUrl}</Text>
          <Input
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            placeholder="https://apihoanam.toolswave.net"
            style={{ fontFamily: 'monospace', fontSize: 12 }}
          />
        </div>
        <div style={{ flex: 2, minWidth: 300 }}>
          <Text strong style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>{tr.authToken}</Text>
          <Input.Password
            value={globalToken}
            onChange={e => setGlobalToken(e.target.value)}
            placeholder="u-xxxxxxxxxxxxxxxxxxxxxxxx"
            style={{ fontFamily: 'monospace', fontSize: 12 }}
          />
          <Text type="secondary" style={{ fontSize: 11 }}>{tr.authHint}</Text>
        </div>
      </Card>

      {/* Layout: sidebar + main */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* Sidebar */}
        <div style={{ width: 220, flexShrink: 0 }}>
          <GroupSidebar
            groups={API_GROUPS}
            active={activeGroup}
            onSelect={id => { setActiveGroup(id); setSearch('') }}
            lang={lang}
          />
        </div>

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Group header */}
          <div style={{
            padding: '16px 20px',
            background: `${currentGroup.color}0f`,
            border: `1px solid ${currentGroup.color}33`,
            borderRadius: 12,
            marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: currentGroup.color, fontSize: 22 }}>{ICON_MAP[currentGroup.icon]}</span>
              <div>
                <Title level={5} style={{ margin: 0, color: currentGroup.color }}>
                  {currentGroup.label[lang]}
                </Title>
                <Text type="secondary" style={{ fontSize: 13 }}>{currentGroup.description[lang]}</Text>
              </div>
              <Tag style={{ marginLeft: 'auto', background: `${currentGroup.color}22`, color: currentGroup.color, border: 'none' }}>
                {currentGroup.endpoints.length} endpoints
              </Tag>
            </div>
          </div>

          {/* Search */}
          <Input.Search
            placeholder={tr.search}
            value={search}
            onChange={e => setSearch(e.target.value)}
            allowClear
            style={{ marginBottom: 12 }}
          />

          {/* Endpoints */}
          {filteredEndpoints.length === 0
            ? <Empty description={tr.noResult} />
            : filteredEndpoints.map(ep => (
                <EndpointCard
                  key={ep.id}
                  endpoint={ep}
                  globalToken={globalToken}
                  baseUrl={baseUrl}
                  lang={lang}
                />
              ))
          }
        </div>
      </div>
      <TourGuide pageKey="dev-api" steps={tourSteps['dev-api']} />
    </div>
  )
}
