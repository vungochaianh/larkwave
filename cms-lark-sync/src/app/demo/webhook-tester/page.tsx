'use client'

import { useState } from 'react'
import { Card, Input, Button, Select, Space, Typography, Tag, message, Divider, Alert, Tabs, Descriptions, Empty, Collapse } from 'antd'
import { SendOutlined, ApiOutlined, CheckCircleOutlined, CloseCircleOutlined, CopyOutlined, PlusOutlined, DeleteOutlined, ThunderboltOutlined, ClockCircleOutlined } from '@ant-design/icons'
import useLang from '@/store/language'
import TourGuide from '@/components/TourGuide'
import { tourSteps } from '@/lib/tourSteps'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

interface HistoryItem {
  id: string
  method: string
  url: string
  status: number | null
  duration: number
  responseBody: string
  requestBody: string
  timestamp: string
  error?: string
}

export default function WebhookTesterPage() {
  const { lang } = useLang()
  const [method, setMethod] = useState('POST')
  const [url, setUrl] = useState('')
  const [body, setBody] = useState('{\n  "text": "Hello from CMS Hoa Nam!"\n}')
  const [headers, setHeaders] = useState<{ key: string; value: string }[]>([
    { key: 'Content-Type', value: 'application/json' },
  ])
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState<{ status: number; body: string; duration: number } | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])

  // Presets
  const presets = [
    {
      label: { vi: 'Lark Custom Bot', en: 'Lark Custom Bot' },
      url: '',
      body: '{\n  "msg_type": "text",\n  "content": {\n    "text": "Test message from CMS Hoa Nam"\n  }\n}',
      headers: [{ key: 'Content-Type', value: 'application/json' }],
    },
    {
      label: { vi: 'Telegram Bot', en: 'Telegram Bot' },
      url: 'https://api.telegram.org/bot{TOKEN}/sendMessage',
      body: '{\n  "chat_id": "{CHAT_ID}",\n  "text": "Test message from CMS Hoa Nam",\n  "parse_mode": "Markdown"\n}',
      headers: [{ key: 'Content-Type', value: 'application/json' }],
    },
    {
      label: { vi: 'Generic Webhook', en: 'Generic Webhook' },
      url: '',
      body: '{\n  "event": "test",\n  "data": {\n    "message": "Hello World"\n  },\n  "timestamp": "' + new Date().toISOString() + '"\n}',
      headers: [{ key: 'Content-Type', value: 'application/json' }],
    },
  ]

  function applyPreset(idx: number) {
    const p = presets[idx]
    if (p.url) setUrl(p.url)
    setBody(p.body)
    setHeaders([...p.headers])
  }

  function addHeader() {
    setHeaders(prev => [...prev, { key: '', value: '' }])
  }

  function removeHeader(idx: number) {
    setHeaders(prev => prev.filter((_, i) => i !== idx))
  }

  function updateHeader(idx: number, field: 'key' | 'value', val: string) {
    setHeaders(prev => prev.map((h, i) => i === idx ? { ...h, [field]: val } : h))
  }

  async function handleSend() {
    if (!url.trim()) {
      message.warning(lang === 'vi' ? 'Nhập URL webhook' : 'Enter webhook URL')
      return
    }

    setLoading(true)
    setResponse(null)
    const start = Date.now()

    try {
      const hdrs: Record<string, string> = {}
      headers.filter(h => h.key.trim()).forEach(h => { hdrs[h.key] = h.value })

      const fetchOpts: RequestInit = {
        method,
        headers: hdrs,
      }
      if (method !== 'GET' && method !== 'HEAD') {
        fetchOpts.body = body
      }

      const res = await fetch(url, fetchOpts)
      const duration = Date.now() - start
      let resBody = ''
      try { resBody = await res.text() } catch {}

      // Try to format JSON
      try {
        const parsed = JSON.parse(resBody)
        resBody = JSON.stringify(parsed, null, 2)
      } catch {}

      setResponse({ status: res.status, body: resBody, duration })

      // Add to history
      setHistory(prev => [{
        id: Date.now().toString(),
        method,
        url,
        status: res.status,
        duration,
        responseBody: resBody.slice(0, 2000),
        requestBody: body.slice(0, 500),
        timestamp: new Date().toLocaleTimeString(),
      }, ...prev].slice(0, 20))

    } catch (err: any) {
      const duration = Date.now() - start
      setResponse({ status: 0, body: err.message, duration })
      setHistory(prev => [{
        id: Date.now().toString(),
        method,
        url,
        status: null,
        duration,
        responseBody: '',
        requestBody: body.slice(0, 500),
        timestamp: new Date().toLocaleTimeString(),
        error: err.message,
      }, ...prev].slice(0, 20))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Title level={3} className="!mb-0">
          <ApiOutlined className="mr-2" />
          {lang === 'vi' ? 'Webhook Tester' : 'Webhook Tester'}
        </Title>
        <Space>
          {presets.map((p, i) => (
            <Button key={i} size="small" onClick={() => applyPreset(i)}>
              {p.label[lang as 'vi' | 'en'] || p.label.en}
            </Button>
          ))}
        </Space>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Left: Request builder */}
        <div className="space-y-3">
          <Card size="small" title={lang === 'vi' ? 'Request' : 'Request'}>
            <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
              <Select value={method} onChange={setMethod} style={{ width: 100 }}
                options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => ({ value: m, label: m }))} />
              <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." style={{ flex: 1 }} />
              <Button type="primary" icon={<SendOutlined />} onClick={handleSend} loading={loading}>
                {lang === 'vi' ? 'Gửi' : 'Send'}
              </Button>
            </Space.Compact>

            <Divider style={{ margin: '8px 0' }}>{lang === 'vi' ? 'Headers' : 'Headers'}</Divider>
            {headers.map((h, i) => (
              <Space key={i} style={{ width: '100%', marginBottom: 4 }}>
                <Input size="small" value={h.key} onChange={e => updateHeader(i, 'key', e.target.value)} placeholder="Key" style={{ width: 150 }} />
                <Input size="small" value={h.value} onChange={e => updateHeader(i, 'value', e.target.value)} placeholder="Value" style={{ flex: 1 }} />
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeHeader(i)} />
              </Space>
            ))}
            <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={addHeader} block style={{ marginTop: 4 }}>
              {lang === 'vi' ? 'Thêm Header' : 'Add Header'}
            </Button>

            {method !== 'GET' && (
              <>
                <Divider style={{ margin: '8px 0' }}>Body</Divider>
                <TextArea value={body} onChange={e => setBody(e.target.value)} rows={8}
                  style={{ fontFamily: 'monospace', fontSize: 13 }} />
              </>
            )}
          </Card>
        </div>

        {/* Right: Response + History */}
        <div className="space-y-3">
          <Card size="small" title={
            <Space>
              {lang === 'vi' ? 'Response' : 'Response'}
              {response && (
                <>
                  <Tag color={response.status >= 200 && response.status < 300 ? 'green' : response.status === 0 ? 'red' : 'orange'}>
                    {response.status || 'Error'}
                  </Tag>
                  <Tag icon={<ClockCircleOutlined />}>{response.duration}ms</Tag>
                </>
              )}
            </Space>
          }
          extra={response && <Button size="small" icon={<CopyOutlined />} onClick={() => { navigator.clipboard.writeText(response.body); message.success('Copied!') }}>Copy</Button>}
          >
            {response ? (
              <pre style={{
                background: 'var(--code-bg)', color: 'var(--code-text)',
                padding: 12, borderRadius: 6, fontSize: 12,
                maxHeight: 300, overflow: 'auto', margin: 0,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {response.body || '(empty response)'}
              </pre>
            ) : (
              <Empty description={lang === 'vi' ? 'Gửi request để xem kết quả' : 'Send a request to see results'}
                image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>

          <Card size="small" title={<Space><ClockCircleOutlined />{lang === 'vi' ? `Lịch sử (${history.length})` : `History (${history.length})`}</Space>}>
            {history.length ? (
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {history.map(h => (
                  <div key={h.id} style={{
                    padding: '6px 8px', marginBottom: 4, borderRadius: 4,
                    background: 'var(--bg-secondary)', fontSize: 12, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                  onClick={() => { setUrl(h.url); setMethod(h.method); setBody(h.requestBody) }}>
                    <Tag color={h.method === 'GET' ? 'green' : h.method === 'POST' ? 'blue' : 'orange'} style={{ fontSize: 10 }}>{h.method}</Tag>
                    <Text ellipsis style={{ flex: 1, fontSize: 11 }}>{h.url}</Text>
                    {h.status && <Tag color={h.status < 300 ? 'green' : 'red'} style={{ fontSize: 10 }}>{h.status}</Tag>}
                    {h.error && <Tag color="red" style={{ fontSize: 10 }}>ERR</Tag>}
                    <Text type="secondary" style={{ fontSize: 10 }}>{h.duration}ms</Text>
                  </div>
                ))}
              </div>
            ) : (
              <Empty description={lang === 'vi' ? 'Chưa có lịch sử' : 'No history yet'} image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </div>
      </div>

      <TourGuide pageKey="demo-webhook-tester" steps={tourSteps['demo-webhook-tester'] || []} />
    </div>
  )
}
