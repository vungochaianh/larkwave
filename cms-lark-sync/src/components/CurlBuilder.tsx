'use client'

import {
  buildCurl,
  buildCurlOneLine,
  parseCurl,
  prettyBody,
  copyToClipboard,
  type HeaderKV,
} from '@/lib/curl'
import { quickSend, type QuickSendResult } from '@/lib/api'
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  Select,
  Spin,
  Tabs,
  Tag,
  Tooltip,
  message,
} from 'antd'
import {
  CopyOutlined,
  SendOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
} from '@ant-design/icons'
import HeadersEditor from './HeadersEditor'
import { useEffect, useMemo, useState } from 'react'

const { TextArea } = Input

export type BuilderValue = {
  mode: 'builder' | 'raw'
  method: string
  url: string
  headers: HeaderKV[]
  body: string
  rawCurl: string
}

/** Convert an existing curl command string into a BuilderValue */
export function builderFromCurl(curlCommand?: string): BuilderValue {
  if (!curlCommand?.trim()) {
    return {
      mode: 'builder',
      method: 'GET',
      url: '',
      headers: [{ key: '', value: '' }],
      body: '',
      rawCurl: '',
    }
  }
  const p = parseCurl(curlCommand)
  return {
    mode: 'builder',
    method: p.method || 'GET',
    url: p.url || '',
    headers: p.headers?.length ? p.headers : [{ key: '', value: '' }],
    body: p.body || '',
    rawCurl: curlCommand,
  }
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'green',
  POST: 'blue',
  PUT: 'orange',
  PATCH: 'purple',
  DELETE: 'red',
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick Send result panel
// ─────────────────────────────────────────────────────────────────────────────

function QuickSendPanel({ result }: { result: QuickSendResult }) {
  const [showRaw, setShowRaw] = useState(false)
  const statusColor = result.ok ? 'success' : 'error'

  const bodyText = useMemo(() => {
    if (typeof result.data === 'string') return result.data
    return JSON.stringify(result.data, null, 2)
  }, [result.data])

  return (
    <Alert
      type={statusColor}
      className="mt-3"
      message={
        <span className="flex items-center gap-2 font-semibold">
          <Tag color={result.ok ? 'green' : 'red'}>
            {result.status} {result.statusText}
          </Tag>
          <span className="text-xs font-normal text-neutral-500">
            {result.durationMs}ms
          </span>
        </span>
      }
      description={
        <div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-neutral-500">Response body</span>
            <div className="flex gap-1">
              <Button
                size="small"
                type="text"
                icon={showRaw ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                onClick={() => setShowRaw(!showRaw)}
              >
                {showRaw ? 'Formatted' : 'Raw'}
              </Button>
              <Button
                size="small"
                type="text"
                icon={<CopyOutlined />}
                onClick={async () => {
                  await copyToClipboard(bodyText)
                  message.success('Copied')
                }}
              />
            </div>
          </div>
          <pre className="text-xs whitespace-pre-wrap bg-white/60 border rounded p-2 mt-1 max-h-48 overflow-auto">
            {showRaw ? bodyText : (() => {
              try { return JSON.stringify(JSON.parse(bodyText), null, 2) }
              catch { return bodyText }
            })()}
          </pre>
        </div>
      }
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function CurlBuilder({
  value,
  onChange,
}: {
  value: BuilderValue
  onChange: (v: BuilderValue) => void
}) {
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<QuickSendResult | null>(null)

  // Build the human-readable (multiline) curl from builder fields
  const curlPreview = useMemo(() => {
    return buildCurl({
      method: value.method,
      url: value.url,
      headers: value.headers,
      body: value.body,
      multiline: true,
    })
  }, [value.method, value.url, value.headers, value.body])

  // Keep rawCurl in sync when in builder mode so JobForm always reads the correct value
  useEffect(() => {
    if (value.mode === 'builder') {
      const oneLine = buildCurlOneLine({
        method: value.method,
        url: value.url,
        headers: value.headers,
        body: value.body,
      })
      if (oneLine !== value.rawCurl) {
        onChange({ ...value, rawCurl: oneLine })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curlPreview, value.mode])

  async function handleSend() {
    const input =
      value.mode === 'raw'
        ? parseCurl(value.rawCurl)
        : { method: value.method, url: value.url, headers: value.headers, body: value.body }

    if (!input.url?.trim()) {
      message.warning('URL is required')
      return
    }

    setSending(true)
    setSendResult(null)
    try {
      const result = await quickSend(input)
      setSendResult(result)
      message.success(`${result.status} — ${result.durationMs}ms`)
    } catch (e: any) {
      message.error(e.message || 'Request failed')
      setSendResult(null)
    } finally {
      setSending(false)
    }
  }

  async function handleCopy(text: string) {
    const ok = await copyToClipboard(text)
    if (ok) message.success('Copied to clipboard')
    else message.error('Copy failed — please select and copy manually')
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Card className="bg-white" styles={{ body: { padding: 12 } }}>
      <Tabs
        activeKey={value.mode}
        onChange={(k) => {
          // When switching to builder mode, parse the raw curl to populate fields
          if (k === 'builder' && value.mode === 'raw' && value.rawCurl?.trim()) {
            const parsed = parseCurl(value.rawCurl)
            onChange({
              ...value,
              mode: 'builder',
              method: parsed.method,
              url: parsed.url,
              headers: parsed.headers.length ? parsed.headers : [{ key: '', value: '' }],
              body: parsed.body,
            })
          } else {
            onChange({ ...value, mode: k as 'builder' | 'raw' })
          }
        }}
        items={[
          // ── Builder tab ─────────────────────────────────────────────────
          {
            key: 'builder',
            label: 'Builder',
            children: (
              <div className="space-y-3">
                {/* Method + URL row */}
                <div className="flex gap-2">
                  <Select
                    className="w-36"
                    value={value.method}
                    onChange={(m) => onChange({ ...value, method: m })}
                    options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((x) => ({
                      value: x,
                      label: (
                        <Tag color={METHOD_COLORS[x]} className="font-mono text-xs">
                          {x}
                        </Tag>
                      ),
                    }))}
                  />
                  <Input
                    placeholder="https://api.example.com/resource"
                    value={value.url}
                    onChange={(e) => onChange({ ...value, url: e.target.value })}
                    className="font-mono text-xs"
                  />
                  <Tooltip title="Send request from browser">
                    <Button
                      type="primary"
                      icon={<SendOutlined />}
                      loading={sending}
                      onClick={handleSend}
                      disabled={!value.url?.trim()}
                    >
                      Send
                    </Button>
                  </Tooltip>
                </div>

                {/* Headers */}
                <div>
                  <div className="text-sm font-medium mb-1">
                    Headers{' '}
                    <Badge
                      count={value.headers.filter((h) => h.key?.trim()).length}
                      color="blue"
                      size="small"
                    />
                  </div>
                  <HeadersEditor
                    value={value.headers}
                    onChange={(headers) => onChange({ ...value, headers })}
                  />
                </div>

                {/* Body */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">Body (raw JSON / text)</span>
                    {value.body?.trim() && (
                      <Button
                        size="small"
                        type="text"
                        onClick={() =>
                          onChange({ ...value, body: prettyBody(value.body) })
                        }
                      >
                        Prettify JSON
                      </Button>
                    )}
                  </div>
                  <TextArea
                    rows={6}
                    value={value.body}
                    onChange={(e) => onChange({ ...value, body: e.target.value })}
                    placeholder={'{\n  "key": "value"\n}'}
                    className="font-mono text-xs"
                  />
                </div>

                {/* Generated curl preview */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">Generated curl</span>
                    <Tooltip title="Copy curl to clipboard">
                      <Button
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={() => handleCopy(curlPreview)}
                      >
                        Copy
                      </Button>
                    </Tooltip>
                  </div>
                  <pre className="text-xs font-mono whitespace-pre-wrap bg-neutral-50 border rounded-lg p-3 max-h-40 overflow-auto">
                    {curlPreview || <span className="text-neutral-400">Fill in the fields above…</span>}
                  </pre>
                </div>

                {/* Quick-send result */}
                {sending && (
                  <div className="flex items-center gap-2 text-sm text-neutral-500">
                    <Spin size="small" /> Sending request…
                  </div>
                )}
                {sendResult && <QuickSendPanel result={sendResult} />}
              </div>
            ),
          },

          // ── Raw cURL tab ─────────────────────────────────────────────────
          {
            key: 'raw',
            label: 'Raw cURL',
            children: (
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">Paste or type a curl command</span>
                  <div className="flex gap-1">
                    <Tooltip title="Copy curl">
                      <Button
                        size="small"
                        icon={<CopyOutlined />}
                        disabled={!value.rawCurl?.trim()}
                        onClick={() => handleCopy(value.rawCurl)}
                      >
                        Copy
                      </Button>
                    </Tooltip>
                    <Tooltip title="Send request from browser">
                      <Button
                        size="small"
                        type="primary"
                        icon={<SendOutlined />}
                        loading={sending}
                        disabled={!value.rawCurl?.trim()}
                        onClick={handleSend}
                      >
                        Send
                      </Button>
                    </Tooltip>
                  </div>
                </div>

                <TextArea
                  rows={12}
                  value={value.rawCurl}
                  onChange={(e) => onChange({ ...value, rawCurl: e.target.value })}
                  placeholder={
                    "curl 'https://api.example.com/resource' \\\n  -X POST \\\n  -H 'Content-Type: application/json' \\\n  --data-raw '{\"key\":\"value\"}'"
                  }
                  className="font-mono text-xs"
                />

                <div className="text-xs text-neutral-500">
                  Tip: Paste a curl command from your terminal. Backslash line
                  continuations (<code>\</code>) are supported. Switch to{' '}
                  <strong>Builder</strong> tab to parse and edit fields visually.
                </div>

                {/* Quick-send result */}
                {sending && (
                  <div className="flex items-center gap-2 text-sm text-neutral-500">
                    <Spin size="small" /> Sending request…
                  </div>
                )}
                {sendResult && <QuickSendPanel result={sendResult} />}
              </div>
            ),
          },
        ]}
      />
    </Card>
  )
}
