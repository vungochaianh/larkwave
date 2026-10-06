'use client'

/**
 * Lark Automation — Hướng dẫn tích hợp đầy đủ
 *
 * Bố cục tài liệu (scrollable):
 *   1. Tổng quan hệ thống
 *   2. Webhook — thiết lập & bảo mật
 *   3. Format request / response
 *   4. Bộ lọc & định tuyến
 *   5. Định dạng tin nhắn (Telegram & Lark)
 *   6. Template {{field}}
 *   7. Kịch bản sử dụng
 *   8. Lưu trạng thái vào Lark Base
 *   9. Lịch sử nhận webhook (live)
 */

import {
  Alert, Badge, Button, Card, Col, Collapse, Divider, Row,
  Space, Tag, Tooltip, Typography, message,
} from 'antd'
import {
  ApiOutlined, BellOutlined, CheckCircleOutlined, ClockCircleOutlined,
  CodeOutlined, CopyOutlined, DatabaseOutlined, EditOutlined,
  FilterOutlined, HistoryOutlined, LinkOutlined, PlayCircleOutlined,
  ReloadOutlined, SafetyOutlined, ThunderboltOutlined,
} from '@ant-design/icons'
import { useEffect, useRef, useState } from 'react'

const { Title, Text, Paragraph } = Typography

// ── Types ──────────────────────────────────────────────────────────────────────

type WebhookEvent = {
  id:          string
  receivedAt:  string
  table:       string
  event:       string
  fieldCount:  number
  body:        Record<string, unknown>
  dispatched?: { telegram: boolean; lark: boolean }
  error?:      string
}

// ── Shared components ──────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Tooltip title={copied ? 'Đã copy!' : 'Copy'}>
      <Button size="small" icon={<CopyOutlined />} type={copied ? 'primary' : 'default'}
        onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }) }}
      />
    </Tooltip>
  )
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative group rounded-lg overflow-hidden">
      <pre className="bg-neutral-900 text-green-300 p-4 text-xs font-mono leading-relaxed overflow-x-auto whitespace-pre">{code}</pre>
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <CopyButton text={code} />
      </div>
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 items-start">
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-500 text-white text-xs font-bold shrink-0 mt-0.5">{n}</span>
      <div className="min-w-0">
        <div className="text-sm font-semibold mb-1">{title}</div>
        <div className="text-xs text-neutral-600">{children}</div>
      </div>
    </div>
  )
}

function SectionTitle({ icon, title, id }: { icon: React.ReactNode; title: string; id: string }) {
  return (
    <div id={id} className="flex items-center gap-2 mb-3 pt-2">
      <span className="text-lg">{icon}</span>
      <Title level={5} className="!mb-0">{title}</Title>
    </div>
  )
}

// ── Live history panel ─────────────────────────────────────────────────────────

function HistoryPanel({ backendOrigin }: { backendOrigin: string }) {
  const [events,     setEvents]     = useState<WebhookEvent[]>([])
  const [loading,    setLoading]    = useState(false)
  const [expanded,   setExpanded]   = useState<string | null>(null)
  const [configReady, setConfigReady] = useState(false)
  const [configAgeS,  setConfigAgeS]  = useState<number | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function load() {
    setLoading(true)
    try {
      const apiOrigin = (process.env.NEXT_PUBLIC_API_BASE || 'https://apihoanam.toolswave.net/api').replace(/\/api$/, '')
      const res  = await fetch(`${apiOrigin}/api-base/lark/v2/webhook`, { cache: 'no-store' })
      const data = await res.json()
      if (Array.isArray(data.events)) setEvents(data.events)
      setConfigReady(data.configReady ?? false)
      setConfigAgeS(data.configAgeS)
    } catch { /* silent */ }
    finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    pollRef.current = setInterval(load, 8_000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  function evColor(ev = '') {
    if (ev.includes('created'))   return 'green'
    if (ev.includes('deleted'))   return 'red'
    if (ev.includes('updated'))   return 'orange'
    if (ev.includes('scheduled')) return 'purple'
    return 'blue'
  }

  return (
    <Card size="small"
      title={
        <Space>
          <HistoryOutlined className="text-purple-500" />
          <span>Lịch sử Webhook nhận được</span>
          {events.length > 0 && <Tag color="purple">{events.length} events</Tag>}
          <Badge
            status={configReady ? 'success' : 'default'}
            text={<span className="text-xs text-neutral-400">{configReady ? `config cached (${configAgeS}s)` : 'config chưa load'}</span>}
          />
        </Space>
      }
      extra={<Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={load}>Refresh</Button>}
    >
      {events.length === 0 ? (
        <div className="text-center py-10 text-neutral-400 bg-neutral-50 rounded border border-dashed border-neutral-200">
          <HistoryOutlined className="text-3xl mb-2 block" />
          <div className="text-sm">Chưa nhận webhook nào.</div>
          <div className="text-xs mt-1">
            Trigger từ Lark Base Automation hoặc dùng{' '}
            <a href="/sync/notify" className="text-blue-500 underline">Test Now</a> tại trang Thông báo.
          </div>
        </div>
      ) : (
        <div className="border border-neutral-200 rounded overflow-hidden text-xs">
          <table className="w-full">
            <thead>
              <tr className="bg-neutral-50 text-neutral-500">
                <th className="py-2 px-2 text-left font-medium">Thời gian</th>
                <th className="py-2 px-2 text-left font-medium">Bảng</th>
                <th className="py-2 px-2 text-left font-medium">Sự kiện</th>
                <th className="py-2 px-2 text-center font-medium">Fields</th>
                <th className="py-2 px-2 text-center font-medium">✈ Tg</th>
                <th className="py-2 px-2 text-center font-medium">🤖 Lk</th>
                <th className="py-2 px-2 text-left font-medium">Lỗi</th>
                <th className="py-2 px-2 text-center font-medium">Body</th>
              </tr>
            </thead>
            <tbody>
              {events.map(ev => (
                <>
                  <tr key={ev.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                    <td className="py-1.5 px-2 font-mono text-neutral-400 whitespace-nowrap">
                      {ev.receivedAt?.split(' ').slice(-1)[0] ?? ev.receivedAt}
                    </td>
                    <td className="py-1.5 px-2 font-medium text-neutral-700 max-w-28 truncate" title={ev.table}>
                      {ev.table || <span className="text-neutral-300">—</span>}
                    </td>
                    <td className="py-1.5 px-2">
                      {ev.event
                        ? <Tag color={evColor(ev.event)} className="text-xs m-0">{ev.event.replace('record_', '')}</Tag>
                        : <span className="text-neutral-300">—</span>}
                    </td>
                    <td className="py-1.5 px-2 text-center text-neutral-400">{ev.fieldCount ?? '—'}</td>
                    <td className="py-1.5 px-2 text-center">
                      {ev.dispatched
                        ? <span className={ev.dispatched.telegram ? 'text-green-600 font-bold' : 'text-neutral-300'}>{ev.dispatched.telegram ? '✓' : '—'}</span>
                        : <span className="text-neutral-300 animate-pulse">…</span>}
                    </td>
                    <td className="py-1.5 px-2 text-center">
                      {ev.dispatched
                        ? <span className={ev.dispatched.lark ? 'text-green-600 font-bold' : 'text-neutral-300'}>{ev.dispatched.lark ? '✓' : '—'}</span>
                        : <span className="text-neutral-300 animate-pulse">…</span>}
                    </td>
                    <td className="py-1.5 px-2 text-red-400 max-w-36 truncate" title={ev.error}>{ev.error ?? ''}</td>
                    <td className="py-1.5 px-2 text-center">
                      <Button size="small" type="link" onClick={() => setExpanded(expanded === ev.id ? null : ev.id)}>
                        {expanded === ev.id ? 'Ẩn' : 'Xem'}
                      </Button>
                    </td>
                  </tr>
                  {expanded === ev.id && (
                    <tr key={`${ev.id}-body`} className="bg-neutral-950">
                      <td colSpan={8} className="px-3 py-2">
                        <pre className="text-green-300 text-xs font-mono whitespace-pre-wrap">
                          {JSON.stringify(ev.body, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-2 text-xs text-neutral-400 flex items-center gap-1">
        <ClockCircleOutlined />
        <span>Tự động refresh mỗi 8 giây · Lưu 50 events gần nhất trong bộ nhớ server</span>
      </div>
    </Card>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function LarkAutomationPage() {
  const [backendOrigin, setBackendOrigin] = useState('')
  const webhookUrl = backendOrigin
    ? `${backendOrigin}/api-base/lark/v2/webhook`
    : '…/api-base/lark/v2/webhook'

  useEffect(() => {
    const base = (process.env.NEXT_PUBLIC_API_BASE || 'https://apihoanam.toolswave.net/api')
    try { setBackendOrigin(new URL(base).origin) } catch { setBackendOrigin(base) }
  }, [])

  const requestExample = JSON.stringify({
    table: 'Đơn hàng', event: 'record_created',
    record_id: '{{record_id}}',
    customer: '{{Khách hàng}}', amount: '{{Giá trị}}', product: '{{Sản phẩm}}',
  }, null, 2)

  const responseExample = JSON.stringify({
    success: true, status: '✅ Đã nhận', id: 'abc12345',
    received: '14:32:01 19/03/2026', fields: 5,
  }, null, 2)

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* ── Tiêu đề ─────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <LinkOutlined className="text-2xl text-purple-500 mt-1" />
        <div>
          <Title level={4} className="!mb-0">Hướng dẫn Lark Base Automation</Title>
          <Text className="text-neutral-500 text-sm">
            Tài liệu đầy đủ — kết nối Lark Base Automation với hệ thống thông báo CMS
          </Text>
        </div>
      </div>

      {/* ── 1. Tổng quan hệ thống ────────────────────────────────────── */}
      <Card size="small">
        <SectionTitle icon={<ThunderboltOutlined className="text-yellow-500" />} title="1. Tổng quan hệ thống" id="overview" />
        <Row gutter={[16, 12]}>
          {[
            { icon: '📥', title: 'Nhận webhook từ Lark', desc: 'Lark Base Automation gửi HTTP POST khi có sự kiện (thêm/sửa/xoá record, theo lịch)' },
            { icon: '🔀', title: 'Định tuyến thông minh', desc: 'Lọc theo event type, field condition (AND). Mỗi webhook entry có token riêng, gửi đến các bot khác nhau.' },
            { icon: '✈', title: 'Gửi Telegram', desc: 'Hỗ trợ nhiều bot, template {{field}}, ảnh/video inline, tự động fallback nếu URL không hợp lệ.' },
            { icon: '🤖', title: 'Gửi Lark Bot', desc: '3 định dạng: Card (lark_md, 2-col layout), Post (rich text), Text. Visual template builder.' },
            { icon: '💾', title: 'Lưu trạng thái', desc: 'CMS trả về JSON ngay lập tức (<5ms). Dùng Update Record trong Automation để ghi status vào Base record.' },
            { icon: '⚡', title: 'Hiệu năng', desc: 'Lark timeout 5s. CMS ack ngay, xử lý async. Ring buffer 50 events. Config cache 60s.' },
          ].map(f => (
            <Col key={f.title} xs={24} sm={12} lg={8}>
              <div className="flex gap-2 p-3 rounded border border-neutral-100 bg-neutral-50 h-full">
                <span className="text-xl shrink-0">{f.icon}</span>
                <div>
                  <div className="text-xs font-semibold text-neutral-800 mb-0.5">{f.title}</div>
                  <div className="text-xs text-neutral-500">{f.desc}</div>
                </div>
              </div>
            </Col>
          ))}
        </Row>
      </Card>

      {/* ── 2. Webhook — URL & bảo mật ──────────────────────────────── */}
      <Card size="small">
        <SectionTitle icon={<SafetyOutlined className="text-orange-500" />} title="2. Webhook URL & Bảo mật" id="webhook" />
        <div className="space-y-4">
          <div>
            <Text className="text-xs text-neutral-500 block mb-1">URL cơ bản (không token — chỉ dùng trong mạng nội bộ)</Text>
            <div className="flex gap-2 items-center">
              <code className="flex-1 bg-neutral-50 border border-neutral-200 rounded px-3 py-1.5 text-xs font-mono text-neutral-700 break-all">
                {webhookUrl}
              </code>
              <CopyButton text={webhookUrl} />
            </div>
          </div>
          <div>
            <Text className="text-xs text-neutral-500 block mb-1">URL với secret token (khuyến nghị)</Text>
            <div className="flex gap-2 items-center">
              <code className="flex-1 bg-neutral-50 border border-neutral-200 rounded px-3 py-1.5 text-xs font-mono text-neutral-500 break-all">
                {webhookUrl}?token=YOUR_SECRET_TOKEN
              </code>
              <CopyButton text={`${webhookUrl}?token=YOUR_SECRET_TOKEN`} />
            </div>
          </div>
          <Alert type="info" showIcon className="text-xs"
            message={<>Tạo và quản lý Secret Token tại <a href="/sync/notify" className="text-blue-500 underline">Sync → Thông báo → Lark Base Webhook</a>. Mỗi webhook entry có token riêng biệt.</>}
          />
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <div className="text-xs font-semibold mb-1">Qua URL query param (khuyến nghị)</div>
              <CodeBlock code={`${webhookUrl}?token=abc123xyz`} />
            </Col>
            <Col xs={24} md={12}>
              <div className="text-xs font-semibold mb-1">Qua HTTP Header (tuỳ chọn)</div>
              <CodeBlock code={`X-Secret-Token: abc123xyz\n# hoặc\nX-Webhook-Token: abc123xyz`} />
            </Col>
          </Row>
        </div>
      </Card>

      {/* ── 3. Format Request / Response ────────────────────────────── */}
      <Card size="small">
        <SectionTitle icon={<CodeOutlined className="text-green-500" />} title="3. Format Request & Response" id="format" />
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <div className="text-xs font-semibold mb-1">Request Body (JSON từ Lark Automation)</div>
            <CodeBlock code={requestExample} />
            <div className="mt-2 space-y-1 text-xs text-neutral-500">
              <div>• <code>table</code>, <code>event</code> — tuỳ chọn nhưng khuyến nghị</div>
              <div>• <code>record_id</code> — dùng <code>{'{{record_id}}'}</code></div>
              <div>• Các field khác — dùng <code>{'{{Tên cột}}'}</code> trong Lark Automation</div>
              <div>• Field có ký tự đặc biệt, khoảng trắng: đặt key tùy ý, value dùng variable</div>
            </div>
          </Col>
          <Col xs={24} lg={12}>
            <div className="text-xs font-semibold mb-1">Response JSON (dùng để Update Record)</div>
            <CodeBlock code={responseExample} />
            <div className="mt-2">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-neutral-50">
                    <th className="border border-neutral-200 px-2 py-1 text-left">Field</th>
                    <th className="border border-neutral-200 px-2 py-1 text-left">Mô tả</th>
                    <th className="border border-neutral-200 px-2 py-1 text-left">Lưu vào</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { f: 'status',   d: 'Chuỗi trạng thái đẹp',  t: 'Text' },
                    { f: 'success',  d: 'true / false',            t: 'Checkbox' },
                    { f: 'id',       d: 'ID event duy nhất',       t: 'Text' },
                    { f: 'received', d: 'Thời gian nhận (VN)',     t: 'Text' },
                    { f: 'fields',   d: 'Số field nhận được',      t: 'Number' },
                  ].map(r => (
                    <tr key={r.f} className="hover:bg-neutral-50">
                      <td className="border border-neutral-200 px-2 py-1 font-mono text-blue-700">{r.f}</td>
                      <td className="border border-neutral-200 px-2 py-1">{r.d}</td>
                      <td className="border border-neutral-200 px-2 py-1 text-neutral-400">{r.t}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Col>
        </Row>
      </Card>

      {/* ── 4. Bộ lọc & định tuyến ──────────────────────────────────── */}
      <Card size="small">
        <SectionTitle icon={<FilterOutlined className="text-cyan-500" />} title="4. Bộ lọc & Định tuyến" id="filter" />
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <div className="text-xs font-semibold mb-2">Lọc theo Event Type</div>
            <div className="space-y-1.5 text-xs">
              {[
                { ev: 'record_created', color: 'green',  desc: 'Khi thêm record mới' },
                { ev: 'record_updated', color: 'orange', desc: 'Khi cập nhật record' },
                { ev: 'record_deleted', color: 'red',    desc: 'Khi xoá record' },
                { ev: '(trống)',        color: 'default',desc: 'Không chọn = tất cả event pass' },
              ].map(r => (
                <div key={r.ev} className="flex items-center gap-2">
                  <Tag color={r.color} className="text-xs m-0 shrink-0">{r.ev}</Tag>
                  <span className="text-neutral-500">{r.desc}</span>
                </div>
              ))}
            </div>
          </Col>
          <Col xs={24} md={12}>
            <div className="text-xs font-semibold mb-2">Lọc theo Field (AND logic)</div>
            <div className="space-y-1 text-xs text-neutral-600">
              <div>Tất cả điều kiện field phải đúng (AND). Các toán tử:</div>
              <div className="grid grid-cols-2 gap-1 mt-1">
                {[
                  ['contains', 'chứa chuỗi'],
                  ['eq',       'bằng chính xác'],
                  ['neq',      'khác'],
                  ['regex',    'khớp regex (i flag)'],
                  ['exists',   'field không rỗng'],
                ].map(([op, desc]) => (
                  <div key={op} className="flex gap-1">
                    <code className="bg-neutral-100 px-1 rounded shrink-0">{op}</code>
                    <span className="text-neutral-400">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </Col>
        </Row>
        <Alert type="info" showIcon className="mt-3 text-xs"
          message="Cấu hình bộ lọc tại Sync → Thông báo → Lark Base Webhook → Sửa → Lọc sự kiện / Điều kiện field"
        />
      </Card>

      {/* ── 5. Định dạng tin nhắn ───────────────────────────────────── */}
      <Card size="small">
        <SectionTitle icon={<BellOutlined className="text-purple-500" />} title="5. Định dạng tin nhắn Bot" id="format-msg" />
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <div className="text-xs font-semibold mb-2">✈ Telegram</div>
            <div className="space-y-1 text-xs text-neutral-600">
              <div>• Parse mode: <Tag className="text-xs">Markdown</Tag></div>
              <div>• Ảnh/Video: gửi riêng qua <code>sendPhoto</code>/<code>sendVideo</code></div>
              <div>• Nếu URL bị reject → tự động fallback thành link text</div>
              <div>• Giới hạn 4096 ký tự, tự động cắt nếu vượt</div>
              <div>• Nhiều bot: gửi song song (Promise.all)</div>
            </div>
          </Col>
          <Col xs={24} md={12}>
            <div className="text-xs font-semibold mb-2">🤖 Lark Bot — 3 định dạng</div>
            <div className="space-y-2 text-xs">
              {[
                { fmt: 'card', label: '🃏 Card', desc: 'Interactive card: header màu, 2-column layout, lark_md markdown, action buttons. Mặc định.' },
                { fmt: 'post', label: '📄 Post', desc: 'Rich text: tiêu đề + rows inline (text bold/link). Hỗ trợ link nhúng.' },
                { fmt: 'text', label: '💬 Text', desc: 'Plain text với lark_md. Nhẹ nhất, dễ đọc.' },
              ].map(r => (
                <div key={r.fmt} className="border border-neutral-200 rounded p-2">
                  <div className="font-semibold text-neutral-800 mb-0.5">{r.label}</div>
                  <div className="text-neutral-500">{r.desc}</div>
                </div>
              ))}
            </div>
          </Col>
        </Row>
      </Card>

      {/* ── 6. Template {{field}} ────────────────────────────────────── */}
      <Card size="small">
        <SectionTitle icon={<EditOutlined className="text-blue-500" />} title="6. Template {{field}}" id="template" />
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <div className="text-xs font-semibold mb-2">✈ Template Telegram</div>
            <CodeBlock code={`🆕 Đơn hàng mới\nKhách: {{customer}}\nSản phẩm: {{product}}\nGiá trị: {{amount}}\nThời gian: {{timestamp}}`} />
            <div className="mt-2 text-xs text-neutral-500">
              Để trống = tự động format toàn bộ field từ payload. Hỗ trợ các placeholder:
              <code className="ml-1">{'{{table}}'}</code> <code>{'{{event}}'}</code> <code>{'{{timestamp}}'}</code> + bất kỳ key nào trong body.
            </div>
          </Col>
          <Col xs={24} md={12}>
            <div className="text-xs font-semibold mb-2">🤖 Template Lark (Text / Post)</div>
            <div className="space-y-1 text-xs text-neutral-600">
              <div>• Chỉ áp dụng cho format <Tag className="text-xs">text</Tag> và <Tag className="text-xs">post</Tag></div>
              <div>• Format <Tag className="text-xs">card</Tag>: dùng Visual Builder → thiết kế trực quan từng element</div>
              <div>• Visual Builder: dán JSON mẫu → click field để chèn placeholder</div>
              <div>• Post template: mỗi dòng = 1 row trong rich text</div>
            </div>
            <Alert type="info" showIcon className="mt-2 text-xs"
              message={<>Cấu hình template tại <a href="/sync/notify" className="text-blue-500 underline">Sync → Thông báo → Webhook → Sửa → Template</a></>}
            />
          </Col>
        </Row>
      </Card>

      {/* ── 7. Kịch bản sử dụng ──────────────────────────────────────── */}
      <Card size="small">
        <SectionTitle icon={<PlayCircleOutlined className="text-green-500" />} title="7. Kịch bản sử dụng" id="scenarios" />
        <div className="space-y-3">
          {[
            {
              icon: '🆕', color: 'bg-green-500', title: 'Auto-sync khi thêm record',
              trigger: 'When adding a new record', useCase: 'Sync cơ hội kinh doanh mới, phân công tự động',
              body: JSON.stringify({ table: 'Đơn hàng', event: 'record_created', record_id: '{{record_id}}', customer: '{{Khách hàng}}', value: '{{Giá trị}}' }, null, 2),
            },
            {
              icon: '🔄', color: 'bg-blue-500', title: 'Auto-sync khi cập nhật record',
              trigger: 'When a record changes → chọn field → Confirmed', useCase: 'Xác nhận đơn hàng, cập nhật tiến độ',
              body: JSON.stringify({ table: 'Tiến độ', event: 'record_updated', record_id: '{{record_id}}', customer: '{{Khách hàng}}', status: '{{Trạng thái}}' }, null, 2),
            },
            {
              icon: '⏰', color: 'bg-purple-500', title: 'Báo cáo định kỳ',
              trigger: 'At scheduled time (hằng ngày / tuần / tháng)', useCase: 'Báo cáo doanh thu, tóm tắt tiến độ',
              body: JSON.stringify({ table: 'Báo cáo', event: 'scheduled', week: '{{Tuần}}', total: '{{Tổng đơn}}', revenue: '{{Doanh thu}}' }, null, 2),
            },
          ].map(s => (
            <div key={s.title} className="border border-neutral-200 rounded overflow-hidden">
              <div className={`${s.color} text-white px-3 py-1.5 text-sm font-semibold flex items-center gap-2`}>
                <span>{s.icon}</span><span>{s.title}</span>
              </div>
              <div className="p-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="space-y-1.5 text-xs">
                  <div><span className="font-semibold text-neutral-600">Ứng dụng: </span>{s.useCase}</div>
                  <div><span className="font-semibold text-neutral-600">Trigger: </span><code>{s.trigger}</code></div>
                  <div><span className="font-semibold text-neutral-600">Action: </span>Send HTTP Request → POST → Webhook URL</div>
                  <div><span className="font-semibold text-neutral-600">Response body: </span><Tag className="text-xs">JSON</Tag> (để dùng Update Record)</div>
                </div>
                <Collapse size="small"
                  items={[{ key: '1', label: <span className="text-xs">Request Body JSON</span>, children: <CodeBlock code={s.body} /> }]}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── 8. Lưu trạng thái vào Base ──────────────────────────────── */}
      <Card size="small">
        <SectionTitle icon={<DatabaseOutlined className="text-orange-500" />} title="8. Lưu trạng thái vào Lark Base" id="status" />
        <div className="space-y-3">
          <Alert type="success" showIcon
            message="Lark Base Automation hỗ trợ Update Record sau bước HTTP Request"
            description="Dùng response của CMS để ghi lại trạng thái giao nhận trực tiếp vào record. Không cần code."
          />
          <div className="space-y-3">
            <Step n={1} title='Thêm field "Trạng thái gửi" vào bảng'>
              Trong Lark Base, thêm column kiểu <Tag color="blue" className="text-xs">Text</Tag> đặt tên <strong>Trạng thái gửi</strong> hoặc <strong>Delivery Status</strong>.
            </Step>
            <Step n={2} title='Trong HTTP Request step → bật Response body = JSON'>
              Phần Configure responses: <Tag color="green" className="text-xs">Response body: JSON</Tag>.
              Bật để Automation có thể đọc response JSON từ CMS.
            </Step>
            <Step n={3} title='Thêm action "Update Record" sau bước HTTP Request'>
              <div className="space-y-1">
                <div>Click <strong>Add action → Update record</strong></div>
                <div>Select record: <Tag className="text-xs">Record from step 1</Tag></div>
                <div>Field: <Tag color="orange" className="text-xs">Trạng thái gửi</Tag> → Value: <strong>Results from previous actions → Response step 2 → status</strong></div>
                <div>Kết quả field sẽ hiển thị: <Tag color="green" className="text-xs">✅ Đã nhận</Tag></div>
              </div>
            </Step>
            <Step n={4} title='Kiểm tra'>
              Trigger automation thử → xem column <strong>Trạng thái gửi</strong> trong Base được điền tự động.
              Kiểm tra lịch sử tại mục bên dưới.
            </Step>
          </div>
        </div>
      </Card>

      {/* ── 9. Lịch sử nhận webhook (live) ─────────────────────────── */}
      <div id="history">
        <SectionTitle icon={<HistoryOutlined className="text-purple-500" />} title="9. Lịch sử Webhook (Live)" id="history-title" />
        <HistoryPanel backendOrigin={backendOrigin} />
      </div>

    </div>
  )
}
