'use client'

import React from 'react'
import {
  Alert, Badge, Button, Card, Checkbox, Col, Divider, Form, Input,
  Modal, Popconfirm, Radio, Row, Select, Space, Switch, Tag, Tooltip,
  Typography, message,
} from 'antd'
import {
  BellOutlined, CopyOutlined, DeleteOutlined,
  EditOutlined, FilterOutlined, HistoryOutlined, LinkOutlined, PlusOutlined,
  ReloadOutlined, RetweetOutlined, SendOutlined, SettingOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { useEffect, useRef, useState } from 'react'
import {
  getNotifyConfig, updateNotifyConfig,
  addTelegramBot, updateTelegramBot, deleteTelegramBot,
  addLarkBot, updateLarkBot, deleteLarkBot,
  testTelegram, testLark,
} from '@/lib/api'
import type { NotifyConfig, WebhookEntry, FilterFieldRule, TelegramBot, LarkBot } from '@/lib/api'
import { LarkMsgBuilder } from '@/components/LarkMsgBuilder'
import TourGuide from '@/components/TourGuide'
import { tourSteps } from '@/lib/tourSteps'

const { Title, Text } = Typography

// ─── Backend URLs ──────────────────────────────────────────────────────────────
const API_ORIGIN = (process.env.NEXT_PUBLIC_API_BASE || 'https://apihoanam.toolswave.net/api').replace(/\/api$/, '')

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT: NotifyConfig = {
  telegram:       { enabled: false, botToken: '', chatId: '', notifyOnSuccess: false, notifyOnError: true },
  lark:           { enabled: false, webhookUrl: '', cmsBaseUrl: '', notifyOnSuccess: false, notifyOnError: true },
  telegramBots:   [],
  larkBots:       [],
  larkBaseWebhooks: [],
}

const _BACKEND_ORIGIN =
  (process.env.NEXT_PUBLIC_API_BASE || 'https://apihoanam.toolswave.net/api')
    .replace(/\/api$/, '')

const WEBHOOK_BASE       = `${_BACKEND_ORIGIN}/api-base/lark/v2/webhook`
const WEBHOOK_EVENTS_URL = `${_BACKEND_ORIGIN}/api-base/lark/v2/webhook`

// ── Types ─────────────────────────────────────────────────────────────────────

type WebhookEvent = {
  id:           string
  receivedAt:   string
  table:        string
  event:        string
  fieldCount:   number
  webhookName?: string
  dispatched?:  { telegram: boolean; lark: boolean }
  error?:       string
  body?:        Record<string, unknown>
}

type TestResult = {
  success:  boolean
  telegram: boolean
  lark:     boolean
  message:  string
}

// ── Option lists ──────────────────────────────────────────────────────────────

const LARK_EVENT_OPTIONS = [
  { label: '🟢 record_created', value: 'record_created' },
  { label: '🟡 record_updated', value: 'record_updated' },
  { label: '🔴 record_deleted', value: 'record_deleted' },
]

const FILTER_OP_OPTIONS = [
  { label: 'chứa',    value: 'contains' },
  { label: 'bằng',    value: 'eq' },
  { label: 'khác',    value: 'neq' },
  { label: 'regex',   value: 'regex' },
  { label: 'tồn tại', value: 'exists' },
]

const LARK_FORMAT_OPTIONS = [
  { value: 'card', label: '🃏 Card (Interactive)', desc: '2-column layout, media buttons, markdown.' },
  { value: 'post', label: '📄 Post (Rich text)',   desc: 'Structured rows with bold labels and links.' },
  { value: 'text', label: '💬 Text',               desc: 'Simple plain-text with markdown.' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function mediaTypeOf(s: unknown): 'image' | 'video' | 'file' | null {
  if (typeof s !== 'string' || !/^https?:\/\//i.test(s)) return null
  if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|#|$)/i.test(s)) return 'image'
  if (/\.(mp4|mov|avi|mkv|webm|m4v)(\?|#|$)/i.test(s))     return 'video'
  if (/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|7z)(\?|#|$)/i.test(s)) return 'file'
  return null
}

function extractMedia(body: Record<string, unknown>) {
  const items: { key: string; url: string; type: 'image' | 'video' | 'file' }[] = []
  for (const [k, v] of Object.entries(body)) {
    const vals = Array.isArray(v) ? v : [v]
    for (const val of vals) {
      const t = mediaTypeOf(val)
      if (t) items.push({ key: k, url: val as string, type: t })
    }
  }
  return items
}

function genId()    { return Math.random().toString(36).slice(2, 10) }
function genToken() { return (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 24) }

function newEntry(overrides: Partial<WebhookEntry> = {}): WebhookEntry {
  return {
    id:              genId(),
    name:            '',
    enabled:         true,
    secretToken:     genToken(),
    notifyTelegram:  false,
    notifyLark:      false,
    telegramBotIds:  [],
    larkBotIds:      [],
    messageTemplate: '',
    larkTemplate:    '',
    filterEvents:    [],
    filterFields:    [],
    larkMsgFormat:   'card',
    ...overrides,
  }
}

function webhookUrl(entry: WebhookEntry): string {
  return entry.secretToken ? `${WEBHOOK_BASE}?token=${entry.secretToken}` : WEBHOOK_BASE
}

function formatAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000)     return 'vừa xong'
  if (diff < 3_600_000)  return `${Math.floor(diff / 60_000)} phút trước`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} giờ trước`
  return `${Math.floor(diff / 86_400_000)} ngày trước`
}

function previewTemplate(tpl: string, data: Record<string, any>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => String(data[k] ?? `{{${k}}}`))
}

function isMasked(s: string) { return s.includes('•') }

// ── LastRunBadge ──────────────────────────────────────────────────────────────

function LastRunBadge({ lastRun }: { lastRun?: WebhookEntry['lastRun'] }) {
  if (!lastRun?.at) return <span className="text-neutral-300 text-xs">Chưa chạy</span>
  const ok = lastRun.dispatched.telegram || lastRun.dispatched.lark
  return (
    <span className={`text-xs flex items-center gap-1 ${ok ? 'text-green-600' : 'text-red-500'}`}>
      <span>{ok ? '✓' : '✗'}</span>
      <span>{formatAgo(lastRun.at)}</span>
      {lastRun.event && <span className="text-neutral-400">· {lastRun.event.replace('record_', '')}</span>}
      {lastRun.error && <span className="text-red-400 truncate max-w-32" title={lastRun.error}> · {lastRun.error}</span>}
    </span>
  )
}

// ── Bot list card (reusable for Telegram/Lark) ────────────────────────────────

type BotModalState = { open: boolean; editing?: TelegramBot | LarkBot; type: 'telegram' | 'lark' }

// ── TemplateTagBar ────────────────────────────────────────────────────────────

function TemplateTagBar({ tags, onInsert }: { tags: string[]; onInsert: (t: string) => void }) {
  const unique = Array.from(new Set(tags)).slice(0, 12)
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {unique.map(t => (
        <code key={t}
          className="text-xs bg-neutral-100 border border-neutral-200 px-1.5 py-0.5 rounded cursor-pointer hover:bg-blue-50 hover:border-blue-300 select-none"
          onClick={() => onInsert(t)}
        >{t}</code>
      ))}
    </div>
  )
}

// ── WebhookEntryCard ──────────────────────────────────────────────────────────

function WebhookEntryCard({
  entry, index, isEditing, testResult, testLoading,
  telegramBots, larkBots,
  onToggleEdit, onUpdate, onRemove, onTest,
}: {
  entry:        WebhookEntry
  index:        number
  isEditing:    boolean
  testResult:   TestResult | null
  testLoading:  boolean
  telegramBots: TelegramBot[]
  larkBots:     LarkBot[]
  onToggleEdit: () => void
  onUpdate:     (field: keyof WebhookEntry, value: any) => void
  onRemove:     () => void
  onTest:       () => void
}) {
  const [sampleJson,   setSampleJson]   = useState('')
  const [sampleData,   setSampleData]   = useState<Record<string, any>>({})
  const [sampleFields, setSampleFields] = useState<string[]>([])
  const [copied, setCopied] = useState(false)

  function onSampleChange(raw: string) {
    setSampleJson(raw)
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        setSampleData(parsed)
        setSampleFields(Object.keys(parsed))
        return
      }
    } catch { /* not valid yet */ }
    setSampleData({})
    setSampleFields([])
  }

  function copy() {
    navigator.clipboard.writeText(webhookUrl(entry)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const url = webhookUrl(entry)
  const activeTgBots = (entry.telegramBotIds ?? []).filter(id => telegramBots.find(b => b.id === id))
  const activeLkBots = (entry.larkBotIds ?? []).filter(id => larkBots.find(b => b.id === id))

  return (
    <div className={`border rounded-lg overflow-hidden transition-colors ${isEditing ? 'border-blue-300 shadow-sm' : 'border-neutral-200'}`}>

      {/* ── Header ── */}
      <div className={`flex items-center gap-2 px-3 py-2 ${isEditing ? 'bg-blue-50' : 'bg-neutral-50'}`}>
        <Switch size="small" checked={entry.enabled} onChange={v => onUpdate('enabled', v)} />
        <span className={`font-medium text-sm flex-1 ${!entry.name ? 'text-neutral-400 italic' : ''}`}>
          {entry.name || `Webhook ${index + 1}`}
        </span>
        <Tag color={entry.enabled ? 'purple' : 'default'} className="text-xs">{entry.enabled ? 'Bật' : 'Tắt'}</Tag>
        {activeTgBots.length > 0 && (
          <Tag color="blue" className="text-xs">✈ ×{activeTgBots.length}</Tag>
        )}
        {activeLkBots.length > 0 && (
          <Tag color="green" className="text-xs">🤖 ×{activeLkBots.length}</Tag>
        )}
        {(entry.filterEvents?.length > 0 || entry.filterFields?.length > 0) && (
          <Tag color="orange" className="text-xs" icon={<FilterOutlined />}>
            {[
              entry.filterEvents?.length ? entry.filterEvents.map(e => e.replace('record_', '')).join(',') : '',
              entry.filterFields?.length ? `${entry.filterFields.length} cond` : '',
            ].filter(Boolean).join(' · ')}
          </Tag>
        )}
        {entry.larkMsgFormat && entry.larkMsgFormat !== 'card' && (
          <Tag color="cyan" className="text-xs">{entry.larkMsgFormat === 'text' ? '💬' : '📄'}</Tag>
        )}
        <Button size="small" type={isEditing ? 'primary' : 'default'} icon={<EditOutlined />} onClick={onToggleEdit}>
          {isEditing ? 'Xong' : 'Sửa'}
        </Button>
        <Popconfirm
          title="Xoá webhook này?"
          description="Các Lark Base Automation dùng URL này sẽ nhận lỗi 401."
          okText="Xoá" cancelText="Huỷ" okButtonProps={{ danger: true }}
          onConfirm={onRemove}
        >
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </div>

      {/* ── URL row ── */}
      <div className="px-3 py-2 border-t border-neutral-100">
        <Space.Compact style={{ width: '100%' }}>
          <Input readOnly size="small" value={url} className="font-mono text-xs bg-neutral-50" />
          <Tooltip title={copied ? 'Đã copy!' : 'Copy URL'}>
            <Button size="small" icon={<CopyOutlined />} type={copied ? 'primary' : 'default'} onClick={copy} />
          </Tooltip>
          <Tooltip title="Gửi test event">
            <Button size="small" icon={<ThunderboltOutlined />} loading={testLoading} onClick={onTest} disabled={!entry.enabled} />
          </Tooltip>
        </Space.Compact>
        {entry.messageTemplate && (
          <Text className="text-xs text-neutral-400 block mt-1 truncate">📝 {entry.messageTemplate}</Text>
        )}
      </div>

      {/* ── Last run ── */}
      <div className="px-3 py-1.5 border-t border-neutral-100 flex items-center gap-2">
        <span className="text-xs text-neutral-400">Lần chạy cuối:</span>
        <LastRunBadge lastRun={entry.lastRun} />
      </div>

      {/* ── Test result ── */}
      {testResult && (
        <div className={`px-3 py-1.5 border-t text-xs flex items-center gap-2 ${testResult.success ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
          <span>{testResult.success ? '✓' : '✗'}</span>
          <span className="flex-1">{testResult.message}</span>
          {testResult.success && (
            <Space size={4}>
              <Tag color={testResult.telegram ? 'green' : 'default'} className="text-xs m-0">
                {testResult.telegram ? '✓' : '✗'} Tg
              </Tag>
              <Tag color={testResult.lark ? 'green' : 'default'} className="text-xs m-0">
                {testResult.lark ? '✓' : '✗'} Lark
              </Tag>
            </Space>
          )}
        </div>
      )}

      {/* ── Edit form ── */}
      {isEditing && (
        <div className="px-3 pt-3 pb-4 border-t border-blue-200 bg-white">
          <Form layout="vertical" size="small">

            {/* Basic */}
            <Form.Item label="Tên webhook" className="mb-3">
              <Input value={entry.name} onChange={e => onUpdate('name', e.target.value)} placeholder="VD: Đơn hàng, HR, Sales…" />
            </Form.Item>

            <Form.Item label="Secret Token" tooltip="Thêm tự động vào URL. Mỗi Automation dùng URL riêng." className="mb-3">
              <Space.Compact style={{ width: '100%' }}>
                <Input.Password value={entry.secretToken} onChange={e => onUpdate('secretToken', e.target.value)} placeholder="Token…" />
                <Tooltip title="Tạo token mới">
                  <Button icon={<RetweetOutlined />} onClick={() => onUpdate('secretToken', genToken())} />
                </Tooltip>
              </Space.Compact>
              <Text className="text-xs text-neutral-400 mt-1 block font-mono break-all">{url}</Text>
            </Form.Item>

            {/* Routing — multi-bot select */}
            <Divider className="my-2">
              <Space size={4}><span>📬</span><span className="text-xs font-medium">Gửi đến</span></Space>
            </Divider>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <Form.Item label="✈ Telegram bots" className="mb-0">
                <Select
                  mode="multiple"
                  size="small"
                  placeholder={telegramBots.length ? 'Chọn bot…' : 'Chưa có bot'}
                  value={entry.telegramBotIds ?? []}
                  onChange={v => onUpdate('telegramBotIds', v)}
                  options={telegramBots.map(b => ({ label: b.name || b.chatId || b.id, value: b.id }))}
                  disabled={telegramBots.length === 0}
                  notFoundContent={<span className="text-xs text-neutral-400">Thêm bot ở trên</span>}
                />
              </Form.Item>
              <Form.Item label="🤖 Lark bots" className="mb-0">
                <Select
                  mode="multiple"
                  size="small"
                  placeholder={larkBots.length ? 'Chọn bot…' : 'Chưa có bot'}
                  value={entry.larkBotIds ?? []}
                  onChange={v => onUpdate('larkBotIds', v)}
                  options={larkBots.map(b => ({ label: b.name || b.id, value: b.id }))}
                  disabled={larkBots.length === 0}
                  notFoundContent={<span className="text-xs text-neutral-400">Thêm bot ở trên</span>}
                />
              </Form.Item>
            </div>

            {/* Lark message format */}
            <Divider className="my-2">
              <Space size={4}><span>🤖</span><span className="text-xs font-medium">Định dạng Lark Bot</span></Space>
            </Divider>

            <Form.Item className="mb-3">
              <Radio.Group value={entry.larkMsgFormat ?? 'card'} onChange={e => onUpdate('larkMsgFormat', e.target.value)}>
                <div className="space-y-2">
                  {LARK_FORMAT_OPTIONS.map(opt => (
                    <Radio key={opt.value} value={opt.value}>
                      <span className="font-medium">{opt.label}</span>
                      <span className="text-xs text-neutral-400 ml-2">{opt.desc}</span>
                    </Radio>
                  ))}
                </div>
              </Radio.Group>
            </Form.Item>

            {/* Filter rules */}
            <Divider className="my-2">
              <Space size={4}><FilterOutlined /><span className="text-xs font-medium">Lọc sự kiện</span></Space>
            </Divider>

            <Form.Item label="Chỉ xử lý event" tooltip="Không chọn = tất cả event. Chọn để lọc theo loại." className="mb-3">
              <Checkbox.Group options={LARK_EVENT_OPTIONS} value={entry.filterEvents ?? []} onChange={v => onUpdate('filterEvents', v)} />
            </Form.Item>

            <Form.Item label="Điều kiện field (AND)" tooltip="Tất cả điều kiện phải đúng." className="mb-2">
              <div className="space-y-2">
                {(entry.filterFields ?? []).map((rule, i) => (
                  <div key={i} className="flex gap-1 items-center">
                    <Input size="small" placeholder="field" style={{ width: 110 }}
                      value={rule.field}
                      onChange={e => {
                        const rules = [...(entry.filterFields ?? [])]
                        rules[i] = { ...rule, field: e.target.value }
                        onUpdate('filterFields', rules)
                      }}
                    />
                    <Select size="small" style={{ width: 85 }}
                      options={FILTER_OP_OPTIONS}
                      value={rule.op}
                      onChange={v => {
                        const rules = [...(entry.filterFields ?? [])]
                        rules[i] = { ...rule, op: v }
                        onUpdate('filterFields', rules)
                      }}
                    />
                    {rule.op !== 'exists' && (
                      <Input size="small" placeholder="giá trị" style={{ flex: 1 }}
                        value={rule.value}
                        onChange={e => {
                          const rules = [...(entry.filterFields ?? [])]
                          rules[i] = { ...rule, value: e.target.value }
                          onUpdate('filterFields', rules)
                        }}
                      />
                    )}
                    <Button size="small" danger type="text"
                      onClick={() => onUpdate('filterFields', (entry.filterFields ?? []).filter((_, j) => j !== i))}
                    >✕</Button>
                  </div>
                ))}
                <Button size="small" type="dashed" icon={<PlusOutlined />}
                  onClick={() => onUpdate('filterFields', [...(entry.filterFields ?? []), { field: '', op: 'contains', value: '' }])}
                >
                  Thêm điều kiện
                </Button>
              </div>
            </Form.Item>

            {/* Sample JSON + template */}
            <Divider className="my-2">
              <Space size={4}><span>👁</span><span className="text-xs font-medium">Dữ liệu mẫu & xem trước</span></Space>
            </Divider>

            <Form.Item label="JSON mẫu" tooltip="Dán JSON từ Lark Base Automation để xem trước và lấy tên field." className="mb-2">
              <Input.TextArea rows={3} value={sampleJson} onChange={e => onSampleChange(e.target.value)}
                placeholder={'{\n  "table": "Đơn hàng",\n  "event": "record_created",\n  "customer": "Nguyễn A"\n}'}
                className="font-mono text-xs"
              />
            </Form.Item>

            {sampleFields.length > 0 && (
              <div className="mb-3 border border-neutral-200 rounded overflow-hidden text-xs">
                <div className="bg-neutral-50 px-3 py-1.5 font-medium text-neutral-500 border-b border-neutral-200 flex items-center justify-between">
                  <span>Xem trước dữ liệu mẫu</span>
                  <Tag color="default" className="text-xs m-0">{sampleFields.length} fields</Tag>
                </div>
                <div className="p-3 space-y-0.5">
                  {Object.entries(sampleData)
                    .filter(([k]) => !['table', 'tableName', 'event', 'timestamp', 'record_id'].includes(k))
                    .slice(0, 8)
                    .map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <span className="font-semibold text-neutral-600 min-w-24 flex-shrink-0">{k}:</span>
                        <span className="text-neutral-800 truncate">{String(v ?? '')}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Templates */}
            <Divider className="my-2">
              <Space size={4}><span>📝</span><span className="text-xs font-medium">Template (tuỳ chọn)</span></Space>
            </Divider>

            {/* Telegram template */}
            <Form.Item
              label={<span className="text-xs font-medium">✈ Template Telegram</span>}
              tooltip="Dùng {{field}} để chèn giá trị. Để trống = tự động format."
              className="mb-3"
            >
              <Input.TextArea rows={2} value={entry.messageTemplate}
                onChange={e => onUpdate('messageTemplate', e.target.value)}
                placeholder="VD: 🆕 Đơn hàng mới&#10;Khách: {{customer}}&#10;Tổng: {{amount}}"
              />
              <TemplateTagBar
                tags={['{{table}}', '{{event}}', '{{timestamp}}', ...(sampleFields.map(f => `{{${f}}}`))]}
                onInsert={t => onUpdate('messageTemplate', (entry.messageTemplate ?? '') + t)}
              />
            </Form.Item>

            {/* Lark template — visual builder */}
            <Form.Item
              label={<span className="text-xs font-medium">🤖 Template Lark</span>}
              tooltip="Tạo template tuỳ chỉnh cho Lark Bot. Để trống = tự động format toàn bộ field."
              className="mb-0"
            >
              <LarkMsgBuilder
                value={entry.larkTemplate ?? ''}
                onChange={v => onUpdate('larkTemplate', v)}
                format={entry.larkMsgFormat ?? 'card'}
                sampleFields={sampleFields}
                sampleData={sampleData}
              />
            </Form.Item>

          </Form>
        </div>
      )}
    </div>
  )
}

// ── Bot management modal ──────────────────────────────────────────────────────

function TelegramBotModal({
  open, editing, onClose, onSaved,
}: {
  open: boolean
  editing?: TelegramBot
  onClose: () => void
  onSaved: (bot: TelegramBot) => void
}) {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    if (open) {
      form.setFieldsValue(editing ?? { name: '', botToken: '', chatId: '', enabled: true })
    }
  }, [open, editing, form])

  async function handleSave() {
    const values = await form.validateFields()
    setSaving(true)
    try {
      let result: { success: boolean; data?: TelegramBot }
      if (editing) {
        const payload: any = { name: values.name, chatId: values.chatId, enabled: values.enabled }
        if (values.botToken && !isMasked(values.botToken)) payload.botToken = values.botToken
        result = await updateTelegramBot(editing.id, payload)
      } else {
        result = await addTelegramBot(values)
      }
      if (!result.success) throw new Error((result as any).error)
      message.success(editing ? 'Đã cập nhật bot' : 'Đã thêm bot')
      onSaved(result.data!)
      onClose()
    } catch (e: any) { message.error(e.message) }
    finally { setSaving(false) }
  }

  async function handleTest() {
    const values = form.getFieldsValue()
    if (!values.botToken || !values.chatId) { message.error('Nhập bot token và chat ID'); return }
    if (isMasked(values.botToken)) { message.warning('Không thể test với token đã ẩn. Nhập token mới.'); return }
    setTesting(true)
    try {
      const res = await testTelegram({ botToken: values.botToken, chatId: values.chatId })
      if (res.success) message.success('Test thành công ✓')
      else throw new Error((res as any).error)
    } catch (e: any) { message.error(e.message) }
    finally { setTesting(false) }
  }

  return (
    <Modal
      title={editing ? `Sửa: ${editing.name || editing.id}` : '➕ Thêm Telegram Bot'}
      open={open} onCancel={onClose} onOk={handleSave}
      okText={editing ? 'Cập nhật' : 'Thêm'} confirmLoading={saving} forceRender
    >
      <Form form={form} layout="vertical" size="small" className="mt-4">
        <Form.Item name="name" label="Tên bot" rules={[{ required: true, message: 'Nhập tên' }]}>
          <Input placeholder="VD: Bot HR, Bot Sales…" />
        </Form.Item>
        <Form.Item name="botToken" label={editing ? 'Bot Token (để trống = giữ nguyên)' : 'Bot Token'}>
          <Input.Password placeholder={editing ? '(không đổi nếu để trống)' : '1234567890:AAxxxxxx…'} className="font-mono" />
        </Form.Item>
        <Form.Item name="chatId" label="Chat ID" rules={[{ required: true, message: 'Nhập Chat ID' }]}>
          <Input placeholder="-1001234567890" />
        </Form.Item>
        <Form.Item name="enabled" label="Trạng thái" valuePropName="checked">
          <Switch checkedChildren="Bật" unCheckedChildren="Tắt" />
        </Form.Item>
        <Button icon={<SendOutlined />} onClick={handleTest} loading={testing} block>
          Gửi tin nhắn test
        </Button>
      </Form>
    </Modal>
  )
}

function LarkBotModal({
  open, editing, onClose, onSaved,
}: {
  open: boolean
  editing?: LarkBot
  onClose: () => void
  onSaved: (bot: LarkBot) => void
}) {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    if (open) {
      form.setFieldsValue(editing ?? { name: '', webhookUrl: '', enabled: true })
    }
  }, [open, editing, form])

  async function handleSave() {
    const values = await form.validateFields()
    setSaving(true)
    try {
      let result: { success: boolean; data?: LarkBot }
      if (editing) {
        const payload: any = { name: values.name, enabled: values.enabled }
        if (values.webhookUrl && !isMasked(values.webhookUrl)) payload.webhookUrl = values.webhookUrl
        result = await updateLarkBot(editing.id, payload)
      } else {
        result = await addLarkBot(values)
      }
      if (!result.success) throw new Error((result as any).error)
      message.success(editing ? 'Đã cập nhật bot' : 'Đã thêm bot')
      onSaved(result.data!)
      onClose()
    } catch (e: any) { message.error(e.message) }
    finally { setSaving(false) }
  }

  async function handleTest() {
    const values = form.getFieldsValue()
    if (!values.webhookUrl) { message.error('Nhập webhook URL'); return }
    if (isMasked(values.webhookUrl)) { message.warning('Không thể test với URL đã ẩn. Nhập URL mới.'); return }
    setTesting(true)
    try {
      const res = await testLark({ webhookUrl: values.webhookUrl })
      if (res.success) message.success('Test thành công ✓')
      else throw new Error((res as any).error)
    } catch (e: any) { message.error(e.message) }
    finally { setTesting(false) }
  }

  return (
    <Modal
      title={editing ? `Sửa: ${editing.name || editing.id}` : '➕ Thêm Lark Custom Bot'}
      open={open} onCancel={onClose} onOk={handleSave}
      okText={editing ? 'Cập nhật' : 'Thêm'} confirmLoading={saving} forceRender
    >
      <Form form={form} layout="vertical" size="small" className="mt-4">
        <Form.Item name="name" label="Tên bot" rules={[{ required: true, message: 'Nhập tên' }]}>
          <Input placeholder="VD: Bot Kho hàng, Bot Chung…" />
        </Form.Item>
        <Form.Item name="webhookUrl" label={editing ? 'Webhook URL (để trống = giữ nguyên)' : 'Webhook URL'} rules={editing ? [] : [{ required: true }]}>
          <Input.Password placeholder={editing ? '(không đổi nếu để trống)' : 'https://open.larksuite.com/open-apis/bot/v2/hook/…'} className="font-mono" />
        </Form.Item>
        <Form.Item name="enabled" label="Trạng thái" valuePropName="checked">
          <Switch checkedChildren="Bật" unCheckedChildren="Tắt" />
        </Form.Item>
        <Button icon={<SendOutlined />} onClick={handleTest} loading={testing} block>
          Gửi card test
        </Button>
      </Form>
    </Modal>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function NotifySettingsPage() {
  const [cfg, setCfg]         = useState<NotifyConfig>(DEFAULT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)

  // Per-webhook test state
  const [editingId, setEditingId]     = useState<string | null>(null)
  const [testingId, setTestingId]     = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({})

  // Bot modals
  const [tgModal, setTgModal] = useState<{ open: boolean; editing?: TelegramBot }>({ open: false })
  const [lkModal, setLkModal] = useState<{ open: boolean; editing?: LarkBot }>({ open: false })

  // Event log
  const [events, setEvents]               = useState<WebhookEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    load()
    loadEvents()
    let tick = 0
    pollRef.current = setInterval(() => {
      loadEvents()
      tick++
      if (tick % 6 === 0) loadLastRun()
    }, 10_000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Data loaders ────────────────────────────────────────────────────────────

  async function load() {
    setLoading(true)
    try {
      const res = await getNotifyConfig()
      if (res.success && res.data) {
        const data = res.data
        const webhooks: WebhookEntry[] = data.larkBaseWebhooks?.length
          ? data.larkBaseWebhooks
          : data.larkBaseWebhook
            ? [{ ...data.larkBaseWebhook, id: data.larkBaseWebhook.id ?? genId(), name: data.larkBaseWebhook.name ?? 'Webhook mặc định' }]
            : []
        setCfg({
          ...DEFAULT,
          ...data,
          larkBaseWebhooks: webhooks,
          telegramBots: data.telegramBots ?? [],
          larkBots:     data.larkBots ?? [],
        })
      }
    } catch (e: any) { message.error(e.message) }
    finally { setLoading(false) }
  }

  async function loadEvents() {
    setEventsLoading(true)
    try {
      const res = await fetch(WEBHOOK_EVENTS_URL, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (Array.isArray(data.events)) setEvents(data.events)
    } catch (e: any) { console.warn('[loadEvents]', e?.message) }
    finally { setEventsLoading(false) }
  }

  async function loadLastRun() {
    try {
      const res = await getNotifyConfig()
      if (!res.success || !res.data?.larkBaseWebhooks) return
      setCfg(prev => ({
        ...prev,
        larkBaseWebhooks: (prev.larkBaseWebhooks ?? []).map(w => {
          const fresh = res.data!.larkBaseWebhooks!.find(fw => fw.id === w.id)
          return fresh?.lastRun ? { ...w, lastRun: fresh.lastRun } : w
        }),
      }))
    } catch { /* ignore */ }
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  async function save() {
    setSaving(true)
    try {
      const res = await updateNotifyConfig(cfg)
      if (!res.success) throw new Error((res as any).error || 'Save failed')
      message.success('Đã lưu cấu hình thông báo ✓')
    } catch (e: any) { message.error(e.message) }
    finally { setSaving(false) }
  }

  // ── Webhook CRUD ─────────────────────────────────────────────────────────────

  const webhooks = cfg.larkBaseWebhooks ?? []
  const telegramBots = cfg.telegramBots ?? []
  const larkBots = cfg.larkBots ?? []

  function setWebhooks(list: WebhookEntry[]) {
    setCfg(prev => ({ ...prev, larkBaseWebhooks: list }))
  }

  function addWebhook() {
    const entry = newEntry()
    setWebhooks([...webhooks, entry])
    setEditingId(entry.id)
  }

  function updateWebhook(id: string, field: keyof WebhookEntry, value: any) {
    setWebhooks(webhooks.map(w => w.id === id ? { ...w, [field]: value } : w))
  }

  function removeWebhook(id: string) {
    setWebhooks(webhooks.filter(w => w.id !== id))
    if (editingId === id) setEditingId(null)
  }

  async function testWebhook(entry: WebhookEntry) {
    setTestingId(entry.id)
    setTestResults(prev => ({ ...prev, [entry.id]: undefined as any }))
    try {
      const res = await fetch(`${API_ORIGIN}/api-base/lark/v2/webhook-test`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ larkBaseWebhooks: cfg.larkBaseWebhooks, webhookToken: entry.secretToken }),
      })
      const data = await res.json()
      setTestResults(prev => ({
        ...prev,
        [entry.id]: { success: data.success, telegram: data.telegram, lark: data.lark, message: data.message ?? data.error ?? 'Unknown' },
      }))
      setTimeout(loadEvents, 2_000)
    } catch (e: any) {
      setTestResults(prev => ({
        ...prev,
        [entry.id]: { success: false, telegram: false, lark: false, message: e.message },
      }))
    } finally { setTestingId(null) }
  }

  // ── Bot CRUD callbacks ────────────────────────────────────────────────────────

  function onTelegramBotSaved(bot: TelegramBot) {
    setCfg(prev => {
      const bots = prev.telegramBots ?? []
      const idx = bots.findIndex(b => b.id === bot.id)
      return {
        ...prev,
        telegramBots: idx >= 0 ? bots.map(b => b.id === bot.id ? bot : b) : [...bots, bot],
      }
    })
  }

  async function deleteTgBot(id: string) {
    try {
      await deleteTelegramBot(id)
      setCfg(prev => ({
        ...prev,
        telegramBots: (prev.telegramBots ?? []).filter(b => b.id !== id),
        larkBaseWebhooks: (prev.larkBaseWebhooks ?? []).map(w => ({
          ...w, telegramBotIds: (w.telegramBotIds ?? []).filter(bid => bid !== id),
        })),
      }))
      message.success('Đã xoá')
    } catch (e: any) { message.error(e.message) }
  }

  function onLarkBotSaved(bot: LarkBot) {
    setCfg(prev => {
      const bots = prev.larkBots ?? []
      const idx = bots.findIndex(b => b.id === bot.id)
      return {
        ...prev,
        larkBots: idx >= 0 ? bots.map(b => b.id === bot.id ? bot : b) : [...bots, bot],
      }
    })
  }

  async function deleteLkBot(id: string) {
    try {
      await deleteLarkBot(id)
      setCfg(prev => ({
        ...prev,
        larkBots: (prev.larkBots ?? []).filter(b => b.id !== id),
        larkBaseWebhooks: (prev.larkBaseWebhooks ?? []).map(w => ({
          ...w, larkBotIds: (w.larkBotIds ?? []).filter(bid => bid !== id),
        })),
      }))
      message.success('Đã xoá')
    } catch (e: any) { message.error(e.message) }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="mx-4 max-w-5xl">

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BellOutlined className="text-xl text-blue-500" />
          <Title level={4} className="!mb-0">Cài đặt Thông báo</Title>
        </div>
        <Button type="primary" icon={<SettingOutlined />} onClick={save} loading={saving}>
          Lưu tất cả
        </Button>
      </div>

      <Row gutter={[16, 16]}>

        {/* ── Telegram Bots ──────────────────────────────────────────────── */}
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <span>✈ Telegram Bots</span>
                <Tag color={telegramBots.length ? 'blue' : 'default'}>{telegramBots.length} bot</Tag>
              </Space>
            }
            extra={
              <Button type="primary" ghost size="small" icon={<PlusOutlined />} onClick={() => setTgModal({ open: true })}>
                Thêm
              </Button>
            }
            loading={loading}
          >
            {telegramBots.length === 0 ? (
              <div
                className="flex flex-col items-center gap-2 py-6 text-neutral-400 border-2 border-dashed border-neutral-200 rounded-lg cursor-pointer hover:border-blue-300 hover:text-blue-400 transition-colors"
                onClick={() => setTgModal({ open: true })}
              >
                <PlusOutlined className="text-xl" />
                <span className="text-sm">Thêm Telegram bot đầu tiên</span>
              </div>
            ) : (
              <div className="space-y-2">
                {telegramBots.map(bot => (
                  <div key={bot.id} className="flex items-center gap-2 px-3 py-2 border border-neutral-200 rounded-lg">
                    <Badge status={bot.enabled ? 'success' : 'default'} />
                    <span className="font-medium text-sm flex-1">{bot.name}</span>
                    <span className="text-xs text-neutral-400 font-mono">{bot.chatId}</span>
                    <Button size="small" icon={<EditOutlined />} onClick={() => setTgModal({ open: true, editing: bot })} />
                    <Popconfirm title="Xoá bot này?" okText="Xoá" cancelText="Huỷ" okButtonProps={{ danger: true }} onConfirm={() => deleteTgBot(bot.id)}>
                      <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Col>

        {/* ── Lark Custom Bots ───────────────────────────────────────────── */}
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <span>🤖 Lark Custom Bots</span>
                <Tag color={larkBots.length ? 'green' : 'default'}>{larkBots.length} bot</Tag>
              </Space>
            }
            extra={
              <Button type="primary" ghost size="small" icon={<PlusOutlined />} onClick={() => setLkModal({ open: true })}>
                Thêm
              </Button>
            }
            loading={loading}
          >
            {larkBots.length === 0 ? (
              <div
                className="flex flex-col items-center gap-2 py-6 text-neutral-400 border-2 border-dashed border-neutral-200 rounded-lg cursor-pointer hover:border-green-300 hover:text-green-500 transition-colors"
                onClick={() => setLkModal({ open: true })}
              >
                <PlusOutlined className="text-xl" />
                <span className="text-sm">Thêm Lark Custom Bot đầu tiên</span>
              </div>
            ) : (
              <div className="space-y-2">
                {larkBots.map(bot => (
                  <div key={bot.id} className="flex items-center gap-2 px-3 py-2 border border-neutral-200 rounded-lg">
                    <Badge status={bot.enabled ? 'success' : 'default'} />
                    <span className="font-medium text-sm flex-1">{bot.name}</span>
                    <Button size="small" icon={<EditOutlined />} onClick={() => setLkModal({ open: true, editing: bot })} />
                    <Popconfirm title="Xoá bot này?" okText="Xoá" cancelText="Huỷ" okButtonProps={{ danger: true }} onConfirm={() => deleteLkBot(bot.id)}>
                      <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Col>

        {/* ── Lark Base Webhooks ─────────────────────────────────────────── */}
        <Col xs={24}>
          <Card
            title={
              <Space>
                <LinkOutlined className="text-purple-500" />
                <span>Lark Base → HTTP Request Webhooks</span>
                <Tag color="purple">{webhooks.length} webhook{webhooks.length !== 1 ? 's' : ''}</Tag>
              </Space>
            }
            extra={
              <Button type="primary" ghost size="small" icon={<PlusOutlined />} onClick={addWebhook}>
                Thêm webhook
              </Button>
            }
            loading={loading}
          >
            <Alert type="info" showIcon className="mb-4"
              message="Mỗi webhook là một endpoint độc lập"
              description={
                <span className="text-xs">
                  Mỗi webhook có URL riêng, template riêng và chọn được <b>bots Telegram/Lark nào</b> để gửi tới.
                  Dùng nhiều webhook để phân tách theo bảng, team hoặc loại sự kiện.
                </span>
              }
            />

            {webhooks.length === 0 ? (
              <div
                onClick={addWebhook}
                className="flex flex-col items-center gap-2 py-10 text-neutral-400 border-2 border-dashed border-neutral-200 rounded-lg cursor-pointer hover:border-purple-300 hover:text-purple-400 transition-colors"
              >
                <PlusOutlined className="text-2xl" />
                <span className="text-sm">Thêm webhook đầu tiên</span>
                <span className="text-xs">Mỗi webhook kết nối một Lark Base Automation với hệ thống thông báo</span>
              </div>
            ) : (
              <div className="space-y-3">
                {webhooks.map((entry, idx) => (
                  <WebhookEntryCard
                    key={entry.id}
                    entry={entry}
                    index={idx}
                    isEditing={editingId === entry.id}
                    testResult={testResults[entry.id] ?? null}
                    testLoading={testingId === entry.id}
                    telegramBots={telegramBots}
                    larkBots={larkBots}
                    onToggleEdit={() => setEditingId(editingId === entry.id ? null : entry.id)}
                    onUpdate={(field, value) => updateWebhook(entry.id, field, value)}
                    onRemove={() => removeWebhook(entry.id)}
                    onTest={() => testWebhook(entry)}
                  />
                ))}
                <Button icon={<PlusOutlined />} onClick={addWebhook} block type="dashed">
                  Thêm webhook mới
                </Button>
              </div>
            )}

            {/* Event log */}
            <Divider className="mt-6 mb-3" />
            <div className="flex items-center justify-between mb-2">
              <Space>
                <HistoryOutlined className="text-purple-500" />
                <Text className="text-sm font-semibold">Events gần đây</Text>
                {events.length > 0 && <Tag color="purple">{events.length}</Tag>}
              </Space>
              <Button size="small" icon={<ReloadOutlined />} loading={eventsLoading} onClick={loadEvents}>Refresh</Button>
            </div>

            {events.length === 0 ? (
              <div className="text-center text-xs text-neutral-400 py-6 bg-neutral-50 rounded border border-dashed border-neutral-200 space-y-1">
                <div><HistoryOutlined className="mr-1" />Chưa nhận webhook nào từ backend.</div>
                <div>Cấu hình Lark Base Automation POST đến URL webhook ở trên, hoặc nhấn ⚡ Test.</div>
              </div>
            ) : (
              <div className="rounded border border-neutral-100 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-neutral-50 text-neutral-500">
                      <th className="py-2 px-3 text-left font-medium w-6" />
                      <th className="py-2 px-3 text-left font-medium">Thời gian</th>
                      <th className="py-2 px-3 text-left font-medium">Webhook</th>
                      <th className="py-2 px-3 text-left font-medium">Bảng</th>
                      <th className="py-2 px-3 text-left font-medium">Sự kiện</th>
                      <th className="py-2 px-3 text-center font-medium">Tg</th>
                      <th className="py-2 px-3 text-center font-medium">Lark</th>
                      <th className="py-2 px-3 text-left font-medium">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map(ev => {
                      const isExpanded = expandedEventId === ev.id
                      const mediaItems = ev.body ? extractMedia(ev.body) : []
                      return (
                        <React.Fragment key={ev.id}>
                          <tr
                            className={`border-t border-neutral-100 hover:bg-neutral-50 cursor-pointer select-none ${isExpanded ? 'bg-blue-50' : ''}`}
                            onClick={() => setExpandedEventId(isExpanded ? null : ev.id)}
                          >
                            <td className="py-1.5 px-3 text-neutral-400 text-center">
                              <span className="text-xs">{isExpanded ? '▾' : '▸'}</span>
                            </td>
                            <td className="py-1.5 px-3 text-neutral-400 font-mono whitespace-nowrap">
                              {ev.receivedAt?.split(' ').slice(-1)[0] ?? ev.receivedAt}
                            </td>
                            <td className="py-1.5 px-3">
                              {ev.webhookName
                                ? <Tag color="purple" className="text-xs">{ev.webhookName}</Tag>
                                : <span className="text-neutral-300">—</span>}
                            </td>
                            <td className="py-1.5 px-3 font-medium text-neutral-700 max-w-28 truncate" title={ev.table}>
                              {ev.table || <span className="text-neutral-300">—</span>}
                            </td>
                            <td className="py-1.5 px-3">
                              {ev.event ? (
                                <Tag color={ev.event.includes('created') ? 'green' : ev.event.includes('deleted') ? 'red' : 'orange'} className="text-xs">
                                  {ev.event.replace('record_', '')}
                                </Tag>
                              ) : <span className="text-neutral-300">—</span>}
                            </td>
                            <td className="py-1.5 px-3 text-center">
                              {ev.dispatched
                                ? <span className={ev.dispatched.telegram ? 'text-green-500 font-bold' : 'text-neutral-300'}>{ev.dispatched.telegram ? '✓' : '—'}</span>
                                : <span className="text-neutral-300 animate-pulse">…</span>}
                            </td>
                            <td className="py-1.5 px-3 text-center">
                              {ev.dispatched
                                ? <span className={ev.dispatched.lark ? 'text-green-500 font-bold' : 'text-neutral-300'}>{ev.dispatched.lark ? '✓' : '—'}</span>
                                : <span className="text-neutral-300 animate-pulse">…</span>}
                            </td>
                            <td className="py-1.5 px-3 text-red-400 max-w-40 truncate" title={ev.error}>
                              {ev.error ?? ''}
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr className="border-t border-blue-100 bg-blue-50">
                              <td colSpan={8} className="px-4 py-3">
                                {mediaItems.length > 0 && (
                                  <div className="mb-3">
                                    <div className="text-xs font-semibold text-neutral-500 mb-2">Media ({mediaItems.length})</div>
                                    <div className="flex flex-wrap gap-3">
                                      {mediaItems.map((m, i) => (
                                        <div key={i} className="flex flex-col gap-1 items-start">
                                          {m.type === 'image' ? (
                                            <a href={m.url} target="_blank" rel="noopener noreferrer">
                                              {/* eslint-disable-next-line @next/next/no-img-element */}
                                              <img src={m.url} alt={m.key}
                                                className="max-w-48 max-h-36 rounded border border-neutral-200 object-cover hover:opacity-80 transition-opacity"
                                                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                                              />
                                            </a>
                                          ) : m.type === 'video' ? (
                                            <video src={m.url} controls className="max-w-64 max-h-36 rounded border border-neutral-200" />
                                          ) : (
                                            <a href={m.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline">
                                              📎 {m.key}
                                            </a>
                                          )}
                                          <span className="text-xs text-neutral-400">{m.key}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                <div className="text-xs font-semibold text-neutral-500 mb-1">
                                  Raw body <span className="ml-2 font-normal text-neutral-400">({ev.fieldCount} fields)</span>
                                </div>
                                {ev.body ? (
                                  <pre className="text-xs bg-white border border-neutral-200 rounded p-3 overflow-x-auto max-h-64 text-neutral-700 whitespace-pre-wrap break-words">
                                    {JSON.stringify(ev.body, null, 2)}
                                  </pre>
                                ) : (
                                  <div className="text-xs text-neutral-400 italic">Body không có sẵn (event cũ)</div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </Col>

      </Row>

      {/* Setup guides */}
      <Row gutter={[16, 16]} className="mt-4">
        <Col xs={24} lg={12}>
          <Card title="📖 Telegram Setup" size="small">
            <ol className="list-decimal ml-4 text-sm space-y-2 text-neutral-600">
              <li>Mở Telegram → tìm <b>@BotFather</b></li>
              <li>Gửi <code>/newbot</code> → copy <b>bot token</b></li>
              <li>Thêm bot vào group/channel mong muốn</li>
              <li>Lấy <b>Chat ID</b>: forward tin nhắn từ group tới <b>@userinfobot</b></li>
              <li>Group dùng ID âm (VD: <code>-1001234567890</code>)</li>
            </ol>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="📖 Lark Custom Bot Setup" size="small">
            <ol className="list-decimal ml-4 text-sm space-y-2 text-neutral-600">
              <li>Mở Lark group → <b>···</b> → <b>Bots</b> → <b>Add Bot</b> → <b>Custom Bot</b></li>
              <li>Copy <b>Webhook URL</b></li>
              <li>Tuỳ chọn: đặt keyword filter là <code>CMS</code></li>
              <li>Nhấn <b>Gửi card test</b> để kiểm tra</li>
            </ol>
          </Card>
        </Col>
      </Row>

      {/* Bot modals */}
      <TelegramBotModal
        open={tgModal.open}
        editing={tgModal.editing}
        onClose={() => setTgModal({ open: false })}
        onSaved={onTelegramBotSaved}
      />
      <LarkBotModal
        open={lkModal.open}
        editing={lkModal.editing}
        onClose={() => setLkModal({ open: false })}
        onSaved={onLarkBotSaved}
      />
      <TourGuide pageKey="sync-notify" steps={tourSteps['sync-notify']} />
    </div>
  )
}
