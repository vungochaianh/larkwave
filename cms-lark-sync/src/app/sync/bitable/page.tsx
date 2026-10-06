'use client'

import {
  Alert,
  Button,
  Card,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
  Select,
  Checkbox,
  Descriptions,
  Modal,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import {
  createBitableSync,
  deleteBitableSync,
  executeBitableSync,
  getBitableSyncs,
  toggleBitableSync,
  updateBitableSync,
  getBitableSyncSnapshot,
  getBitableSyncLogs,
  deleteBitableSyncJobLogs,
  resolveBitableUrl,
  parseSyncCurl,
} from '@/lib/api'
import type { BitableSyncJob, BitableSyncResult, BitableSyncLog } from '@/lib/types'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  HistoryOutlined,
  LinkOutlined,
  LoadingOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  PoweroffOutlined,
  ReloadOutlined,
  SyncOutlined,
  ThunderboltOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import TourGuide from '@/components/TourGuide'
import { tourSteps } from '@/lib/tourSteps'

const { Text } = Typography

// ── Client-side Lark URL parser ─────────────────────────────────────────────
// No API call needed — works instantly for /base/ URLs.
// For /wiki/ URLs, extracts the wiki token so the backend can resolve it.

type ParsedLarkUrl =
  | { type: 'base'; appToken: string; tableId: string; viewId: string }
  | { type: 'wiki'; wikiToken: string; tableId: string; viewId: string }

function parseLarkUrlClient(raw: string): ParsedLarkUrl | null {
  try {
    let urlObj: URL
    if (raw.startsWith('http')) {
      urlObj = new URL(raw)
    } else {
      urlObj = new URL(raw, 'https://placeholder.larksuite.com')
    }

    const pathname = urlObj.pathname
    const tableId = urlObj.searchParams.get('table') || ''
    const viewId = urlObj.searchParams.get('view') || ''

    // /base/{appToken} or /{spaceId}/base/{appToken}
    const baseMatch = pathname.match(/\/base\/([A-Za-z0-9_-]+)/)
    if (baseMatch) {
      // Also check for tableId in path: /base/{appToken}/{tableId}
      const parts = pathname.split('/').filter(Boolean)
      const idx = parts.indexOf(baseMatch[1])
      let pathTableId = ''
      if (idx >= 0 && idx + 1 < parts.length) {
        const next = parts[idx + 1]
        if (next.startsWith('tbl')) pathTableId = next
      }
      return {
        type: 'base',
        appToken: baseMatch[1],
        tableId: tableId || pathTableId,
        viewId,
      }
    }

    // /wiki/{wikiToken} or /{spaceId}/wiki/{wikiToken}
    const wikiMatch = pathname.match(/\/wiki\/([A-Za-z0-9_-]+)/)
    if (wikiMatch) {
      return { type: 'wiki', wikiToken: wikiMatch[1], tableId, viewId }
    }

    return null
  } catch {
    return null
  }
}

// ── Lark Accounts fetcher ───────────────────────────────────────────────────

type LarkAccountOption = {
  _id: string
  name: string
  appId: string
  domain: string
  status: string
  isDefault: boolean
}

const ACCOUNTS_API = (() => {
  const base = process.env.NEXT_PUBLIC_API_BASE || 'https://apihoanam.toolswave.net/api'
  return `${base}/lark-accounts`
})()

async function fetchLarkAccounts(): Promise<LarkAccountOption[]> {
  const res = await fetch(`${ACCOUNTS_API}?status=active`, { cache: 'no-store' })
  const json = await res.json()
  return (json.data ?? []).map((a: any) => ({
    _id: a._id,
    name: a.name,
    appId: a.appId,
    domain: a.domain,
    status: a.status,
    isDefault: a.isDefault,
  }))
}

// ── Sync Form Drawer ────────────────────────────────────────────────────────

function SyncForm({
  open,
  title,
  initial,
  onClose,
  onSubmit,
}: {
  open: boolean
  title: string
  initial?: BitableSyncJob | null
  onClose: () => void
  onSubmit: (values: any) => Promise<void>
}) {
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [resolveStatus, setResolveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [resolveMsg, setResolveMsg] = useState('')
  // Dest URL resolver
  const [destResolving, setDestResolving] = useState(false)
  const [destResolveStatus, setDestResolveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [destResolveMsg, setDestResolveMsg] = useState('')
  // Curl parse
  const [parsingCurl, setParsingCurl] = useState(false)
  const [curlParseMsg, setCurlParseMsg] = useState('')
  const [accounts, setAccounts] = useState<LarkAccountOption[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(false)

  // Load Lark accounts when drawer opens
  useEffect(() => {
    if (open) {
      setLoadingAccounts(true)
      fetchLarkAccounts()
        .then(setAccounts)
        .catch(() => setAccounts([]))
        .finally(() => setLoadingAccounts(false))
    }
  }, [open])

  useEffect(() => {
    if (open) {
      setResolveStatus('idle')
      setResolveMsg('')

      // Resolve initial accountId — could be a populated object or string
      const initialAccountId = initial?.accountId
        ? (typeof initial.accountId === 'object' ? initial.accountId._id : initial.accountId)
        : null

      form.setFieldsValue(
        initial
          ? {
              name: initial.name,
              description: initial.description || '',
              accountId: initialAccountId || null,
              syncMode: initial.syncMode || 'read_only',
              larkUrl: '',
              appToken: initial.appToken,
              tableId: initial.tableId,
              viewId: initial.viewId || '',
              destAppToken: initial.destAppToken || '',
              destTableId: initial.destTableId || '',
              destAccountId: initial.destAccountId || null,
              deleteOrphans: initial.mirrorOptions?.deleteOrphans ?? false,
              curlCommand: '',
              connectorDomain: initial.connector?.domain || '',
              connectorDocToken: initial.connector?.docToken || '',
              connectorTableIds: initial.connector?.tableIds?.join(', ') || '',
              connectorCookies: initial.connector?.cookies || '',
              connectorCsrfToken: initial.connector?.csrfToken || '',
              connectorHostId: initial.connector?.hostId || '',
              connectorHostType: initial.connector?.hostType || 'Wiki',
              intervalSeconds: initial.intervalSeconds,
              ignoreSchedule: initial.ignoreSchedule ?? false,
              scheduleActiveHoursStart: initial.schedule?.activeHoursStart ?? 6,
              scheduleActiveHoursEnd: initial.schedule?.activeHoursEnd ?? 20,
              scheduleActiveDays: initial.schedule?.activeDays ?? [1, 2, 3, 4, 5, 6],
              webhookUrl: initial.webhookUrl || '',
              notifyOnNew: initial.notify?.onNewRecords ?? false,
              notifyOnUpdate: initial.notify?.onUpdatedRecords ?? false,
              notifyOnDelete: initial.notify?.onDeletedRecords ?? false,
              notifyChannels: initial.notify?.channels ?? [],
            }
          : {
              name: '',
              description: '',
              accountId: null,
              syncMode: 'read_only',
              larkUrl: '',
              appToken: '',
              tableId: '',
              viewId: '',
              destAppToken: '',
              destTableId: '',
              destAccountId: null,
              deleteOrphans: false,
              curlCommand: '',
              connectorDomain: '',
              connectorDocToken: '',
              connectorTableIds: '',
              connectorCookies: '',
              connectorCsrfToken: '',
              connectorHostId: '',
              connectorHostType: 'Wiki',
              intervalSeconds: 60,
              ignoreSchedule: false,
              scheduleActiveHoursStart: 6,
              scheduleActiveHoursEnd: 20,
              scheduleActiveDays: [1, 2, 3, 4, 5, 6],
              webhookUrl: '',
              notifyOnNew: false,
              notifyOnUpdate: false,
              notifyOnDelete: false,
              notifyChannels: [],
            },
      )
    }
  }, [open, initial, form])

  /**
   * Parse URL client-side first. Only call backend API for wiki URLs
   * that need Lark API to resolve wiki_token → appToken.
   */
  async function handleResolveUrl() {
    const raw = form.getFieldValue('larkUrl')?.trim()
    if (!raw) {
      message.warning('Hãy paste URL của Lark vào trước')
      return
    }

    setResolveStatus('idle')
    setResolveMsg('')

    // ── Step 1: Client-side parse ────────────────────────────────────────
    const parsed = parseLarkUrlClient(raw)

    if (!parsed) {
      setResolveStatus('error')
      setResolveMsg('Không nhận diện được URL. Cần dạng /base/... hoặc /wiki/...')
      return
    }

    // Direct base URL → fill immediately, no API call needed
    if (parsed.type === 'base') {
      form.setFieldsValue({
        appToken: parsed.appToken,
        tableId: parsed.tableId || form.getFieldValue('tableId'),
        viewId: parsed.viewId || form.getFieldValue('viewId'),
      })
      setResolveStatus('success')
      setResolveMsg(`Base URL parsed → ${parsed.appToken}`)
      message.success(`App Token: ${parsed.appToken}`)
      return
    }

    // ── Step 2: Wiki URL → need API to resolve ──────────────────────────
    setResolving(true)
    try {
      // Send user's Lark OAuth token if available (fallback for when app
      // doesn't have wiki:wiki:readonly permission)
      const userToken = typeof window !== 'undefined'
        ? localStorage.getItem('lark_user_token') || ''
        : ''

      const selectedAccountId = form.getFieldValue('accountId') || undefined
      const res = await resolveBitableUrl(raw, userToken, selectedAccountId)
      if (!res.success) throw new Error(res.error || 'Resolve failed')

      form.setFieldsValue({
        appToken: res.data.appToken,
        tableId: res.data.tableId || parsed.tableId || form.getFieldValue('tableId'),
        viewId: res.data.viewId || parsed.viewId || form.getFieldValue('viewId'),
      })

      const label = res.data.title
        ? `Wiki → "${res.data.title}" → ${res.data.appToken}`
        : `Wiki resolved → ${res.data.appToken}`
      setResolveStatus('success')
      setResolveMsg(label)
      message.success(`App Token: ${res.data.appToken}`)
    } catch (e: any) {
      // Wiki resolve failed — still fill tableId/viewId if we got them from URL
      if (parsed.tableId) {
        form.setFieldsValue({
          tableId: parsed.tableId,
          viewId: parsed.viewId || form.getFieldValue('viewId'),
        })
      }
      setResolveStatus('error')
      setResolveMsg(e.message)
      // Show detailed help in a modal
      Modal.warning({
        title: 'Không thể resolve Wiki URL',
        width: 520,
        content: (
          <div className="mt-2 space-y-2 text-sm">
            <p><strong>Lỗi:</strong> {e.message}</p>
            <p><strong>Cách khắc phục:</strong></p>
            <ol className="list-decimal ml-5 space-y-1">
              <li>Đăng nhập Lark ở trang <strong>Lark Accounts</strong> để hệ thống dùng user token</li>
              <li>Hoặc thêm quyền <code>wiki:wiki:readonly</code> cho Lark App trong Developer Console</li>
              <li>Hoặc thêm Lark App vào Wiki space (Wiki Settings → Thêm App)</li>
            </ol>
            <p className="mt-3"><strong>Cách lấy App Token thủ công:</strong></p>
            <ol className="list-decimal ml-5 space-y-1">
              <li>Mở Bitable trong Wiki</li>
              <li>Nhấn nút <strong>"..."</strong> (menu) → <strong>"Copy link"</strong> hoặc <strong>"Open in new tab"</strong></li>
              <li>URL mới sẽ có dạng <code>/base/bascnXXX?table=tblXXX</code></li>
              <li>Copy mã <code>bascnXXX</code> vào ô App Token bên dưới</li>
            </ol>
          </div>
        ),
      })
    } finally {
      setResolving(false)
    }
  }

  /** Parse curl command → auto-fill connector config */
  async function handleParseCurl() {
    const curl = form.getFieldValue('curlCommand')?.trim()
    if (!curl) { message.warning('Paste curl command trước'); return }

    setParsingCurl(true)
    setCurlParseMsg('')
    try {
      const res = await parseSyncCurl(curl)
      if (!res.success) throw new Error(res.error)

      form.setFieldsValue({
        connectorDomain: res.data.domain,
        connectorDocToken: res.data.docToken,
        connectorTableIds: res.data.tableIds.join(', '),
        connectorCookies: res.data.cookies,
        connectorCsrfToken: res.data.csrfToken,
        connectorHostId: res.data.hostId,
        connectorHostType: res.data.hostType,
        // Also fill appToken/tableId for display
        appToken: res.data.docToken,
        tableId: res.data.tableIds[0] || '',
      })

      setCurlParseMsg(`Parsed: ${res.data.domain} — ${res.data.tableIds.length} table(s)`)
      message.success('Curl parsed thành công!')
    } catch (e: any) {
      setCurlParseMsg(e.message)
      message.error(e.message)
    } finally {
      setParsingCurl(false)
    }
  }

  /** Resolve destination URL — same logic as source but fills dest fields */
  async function handleResolveDestUrl() {
    const raw = form.getFieldValue('destLarkUrl')?.trim()
    if (!raw) { message.warning('Hãy paste URL bảng đích'); return }

    setDestResolveStatus('idle')
    setDestResolveMsg('')

    const parsed = parseLarkUrlClient(raw)
    if (!parsed) {
      setDestResolveStatus('error')
      setDestResolveMsg('Không nhận diện được URL')
      return
    }

    // Base URL → fill immediately
    if (parsed.type === 'base') {
      form.setFieldsValue({
        destAppToken: parsed.appToken,
        destTableId: parsed.tableId || form.getFieldValue('destTableId'),
      })
      setDestResolveStatus('success')
      setDestResolveMsg(`Base URL → ${parsed.appToken}`)
      message.success(`Dest App Token: ${parsed.appToken}`)
      return
    }

    // Wiki URL → need API
    setDestResolving(true)
    try {
      const userToken = typeof window !== 'undefined'
        ? localStorage.getItem('lark_user_token') || '' : ''
      const selectedAccountId = form.getFieldValue('destAccountId') || form.getFieldValue('accountId') || undefined
      const res = await resolveBitableUrl(raw, userToken, selectedAccountId)
      if (!res.success) throw new Error(res.error || 'Resolve failed')

      form.setFieldsValue({
        destAppToken: res.data.appToken,
        destTableId: res.data.tableId || parsed.tableId || form.getFieldValue('destTableId'),
      })
      const label = res.data.title
        ? `Wiki → "${res.data.title}" → ${res.data.appToken}`
        : `Wiki → ${res.data.appToken}`
      setDestResolveStatus('success')
      setDestResolveMsg(label)
      message.success(`Dest App Token: ${res.data.appToken}`)
    } catch (e: any) {
      if (parsed.tableId) form.setFieldsValue({ destTableId: parsed.tableId })
      setDestResolveStatus('error')
      setDestResolveMsg(e.message)
    } finally {
      setDestResolving(false)
    }
  }

  async function handleFinish(values: any) {
    setSubmitting(true)
    try {
      await onSubmit({
        name: values.name,
        description: values.description,
        accountId: values.accountId || null,
        syncMode: values.syncMode || 'read_only',
        appToken: values.appToken,
        tableId: values.tableId,
        viewId: values.viewId || '',
        // Mirror mode destination
        destAppToken: values.destAppToken || '',
        destTableId: values.destTableId || '',
        destAccountId: values.destAccountId || null,
        mirrorOptions: {
          deleteOrphans: values.deleteOrphans || false,
          fieldNames: [],
        },
        connector: values.syncMode === 'connector' ? {
          domain: values.connectorDomain || '',
          docToken: values.connectorDocToken || '',
          tableIds: (values.connectorTableIds || '').split(',').map((s: string) => s.trim()).filter(Boolean),
          cookies: values.connectorCookies || '',
          csrfToken: values.connectorCsrfToken || '',
          hostId: values.connectorHostId || '',
          hostType: values.connectorHostType || 'Wiki',
        } : undefined,
        intervalSeconds: values.intervalSeconds,
        ignoreSchedule: values.ignoreSchedule ?? false,
        schedule: {
          activeHoursStart: values.scheduleActiveHoursStart ?? 6,
          activeHoursEnd: values.scheduleActiveHoursEnd ?? 20,
          activeDays: values.scheduleActiveDays ?? [1, 2, 3, 4, 5, 6],
          timezone: 'Asia/Ho_Chi_Minh',
        },
        webhookUrl: values.webhookUrl || '',
        notify: {
          onNewRecords: values.notifyOnNew,
          onUpdatedRecords: values.notifyOnUpdate,
          onDeletedRecords: values.notifyOnDelete,
          channels: values.notifyChannels || [],
        },
      })
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Drawer
      open={open}
      title={title}
      width={520}
      onClose={onClose}
      forceRender
      extra={
        <Button type="primary" loading={submitting} onClick={() => form.submit()}>
          Save
        </Button>
      }
    >
      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item name="name" label="Name" rules={[{ required: true }]}>
          <Input placeholder="e.g. Inventory Sync" />
        </Form.Item>

        <Form.Item name="description" label="Description">
          <Input.TextArea rows={2} placeholder="What this sync does..." />
        </Form.Item>

        <Divider orientation="left" plain>
          Lark Account &amp; Target
        </Divider>

        <Form.Item
          name="accountId"
          label="Tài khoản Lark"
          extra="Chọn tài khoản Lark có quyền truy cập Bitable/Wiki này. Để trống = dùng tài khoản mặc định."
        >
          <Select
            placeholder="Chọn tài khoản Lark..."
            allowClear
            loading={loadingAccounts}
            showSearch
            optionFilterProp="label"
            options={accounts.map((a) => ({
              value: a._id,
              label: `${a.name}${a.isDefault ? ' ★' : ''} (${a.appId})`,
            }))}
            notFoundContent={loadingAccounts ? 'Đang tải...' : 'Chưa có tài khoản nào'}
          />
        </Form.Item>

        <Form.Item
          name="syncMode"
          label="Chế độ đồng bộ"
          extra={
            <Text type="secondary" className="text-xs">
              <Text strong>Read Only</Text>: chỉ đọc + phát hiện thay đổi. <Text strong>Mirror</Text>: đọc → ghi vào bảng đích. <Text strong>Connector</Text>: trigger sync Lark (nhấn nút "Đồng bộ hóa" tự động).
            </Text>
          }
        >
          <Select
            options={[
              { label: 'Read Only — Chỉ đọc & phát hiện thay đổi', value: 'read_only' },
              { label: 'Mirror — Đồng bộ Source → Destination (bảng thường)', value: 'mirror' },
              { label: 'Connector — Trigger đồng bộ Lark (synced table)', value: 'connector' },
            ]}
          />
        </Form.Item>

        <Divider orientation="left" plain>
          Source (Bảng nguồn — đọc từ đây)
        </Divider>

        {/* URL Resolver — paste any Lark URL (base or wiki) */}
        <Form.Item
          name="larkUrl"
          label={
            <Space>
              <LinkOutlined />
              <span>Paste Lark URL (Base hoặc Wiki)</span>
            </Space>
          }
          extra={
            resolveStatus === 'success' ? (
              <Text type="success" className="text-xs">
                <CheckCircleOutlined /> {resolveMsg}
              </Text>
            ) : resolveStatus === 'error' ? (
              <Text type="danger" className="text-xs">{resolveMsg}</Text>
            ) : (
              <Text type="secondary" className="text-xs">
                Hỗ trợ cả URL dạng /base/... và /wiki/... — tự động resolve App Token
              </Text>
            )
          }
        >
          <Input.Search
            placeholder="https://xxx.larksuite.com/wiki/wikcnXXX hoặc /base/bascnXXX?table=..."
            enterButton={
              resolving ? <LoadingOutlined /> : 'Resolve'
            }
            onSearch={handleResolveUrl}
            loading={resolving}
            allowClear
          />
        </Form.Item>

        <Form.Item
          name="appToken"
          label="App Token (Base ID)"
          rules={[{ required: true }]}
          extra="Tự động điền khi resolve URL, hoặc nhập thủ công"
        >
          <Input placeholder="bascnXXXXXXXX" />
        </Form.Item>

        <Form.Item name="tableId" label="Table ID" rules={[{ required: true }]}>
          <Input placeholder="tblXXXXXXXX" />
        </Form.Item>

        <Form.Item
          name="viewId"
          label="View ID (optional)"
          extra="Để trống = fetch tất cả records trong table"
        >
          <Input placeholder="vewXXXXXXXX" />
        </Form.Item>

        {/* ── Destination (Mirror mode only) ─────────────────────── */}
        <Form.Item noStyle shouldUpdate={(prev, cur) => prev.syncMode !== cur.syncMode}>
          {({ getFieldValue }) =>
            getFieldValue('syncMode') === 'mirror' ? (
              <>
                <Divider orientation="left" plain>
                  Destination (Bảng đích — ghi vào đây)
                </Divider>

                <Alert
                  type="warning"
                  showIcon
                  className="mb-3"
                  icon={<WarningOutlined />}
                  message="Bảng đích phải là bảng thường"
                  description="Bảng đồng bộ (synced table) của Lark là READ-ONLY — không ghi được qua API. Destination phải là bảng thường có cùng cấu trúc field với Source."
                />

                {/* Dest URL Resolver */}
                <Form.Item
                  name="destLarkUrl"
                  label={
                    <Space>
                      <LinkOutlined />
                      <span>Paste URL bảng đích</span>
                    </Space>
                  }
                  extra={
                    destResolveStatus === 'success' ? (
                      <Text type="success" className="text-xs">
                        <CheckCircleOutlined /> {destResolveMsg}
                      </Text>
                    ) : destResolveStatus === 'error' ? (
                      <Text type="danger" className="text-xs">{destResolveMsg}</Text>
                    ) : (
                      <Text type="secondary" className="text-xs">
                        Paste URL bảng đích (base hoặc wiki) → tự phân tích App Token + Table ID
                      </Text>
                    )
                  }
                >
                  <Input.Search
                    placeholder="https://xxx.larksuite.com/wiki/... hoặc /base/..."
                    enterButton={destResolving ? <LoadingOutlined /> : 'Resolve'}
                    onSearch={handleResolveDestUrl}
                    loading={destResolving}
                    allowClear
                  />
                </Form.Item>

                <Form.Item
                  name="destAppToken"
                  label="Dest App Token"
                  rules={[{ required: true, message: 'Cần App Token bảng đích' }]}
                  extra="Tự động điền khi resolve URL, hoặc nhập thủ công"
                >
                  <Input placeholder="bascnYYYYYYYY" />
                </Form.Item>

                <Form.Item
                  name="destTableId"
                  label="Dest Table ID"
                  rules={[{ required: true, message: 'Cần Table ID bảng đích' }]}
                >
                  <Input placeholder="tblYYYYYYYY" />
                </Form.Item>

                <Form.Item
                  name="destAccountId"
                  label="Tài khoản Lark cho Destination (optional)"
                  extra="Để trống = dùng cùng tài khoản với Source"
                >
                  <Select
                    placeholder="Cùng tài khoản Source..."
                    allowClear
                    loading={loadingAccounts}
                    showSearch
                    optionFilterProp="label"
                    options={accounts.map((a) => ({
                      value: a._id,
                      label: `${a.name}${a.isDefault ? ' ★' : ''} (${a.appId})`,
                    }))}
                  />
                </Form.Item>

                <Form.Item
                  name="deleteOrphans"
                  valuePropName="checked"
                  extra="Khi record bị xoá ở Source → xoá ở Destination"
                >
                  <Switch checkedChildren="Xoá records orphan" unCheckedChildren="Giữ records orphan" />
                </Form.Item>
              </>
            ) : null
          }
        </Form.Item>

        {/* ── Connector mode ─────────────────────────────────────── */}
        <Form.Item noStyle shouldUpdate={(prev, cur) => prev.syncMode !== cur.syncMode}>
          {({ getFieldValue }) =>
            getFieldValue('syncMode') === 'connector' ? (
              <>
                <Divider orientation="left" plain>
                  Connector — Paste curl từ DevTools
                </Divider>

                <Alert
                  type="info"
                  showIcon
                  className="mb-3"
                  message="Cách lấy curl command"
                  description={
                    <ol className="list-decimal ml-4 mt-1 space-y-1 text-xs">
                      <li>Mở Base trên Lark (Chrome)</li>
                      <li>Mở DevTools (F12) → tab <strong>Network</strong></li>
                      <li>Nhấn nút <strong>"Đồng bộ hóa dữ liệu"</strong> trên synced table</li>
                      <li>Trong Network, tìm request <code>connector/sync</code></li>
                      <li>Click phải → <strong>Copy as cURL</strong></li>
                      <li>Paste vào ô bên dưới → nhấn <strong>Parse</strong></li>
                    </ol>
                  }
                />

                <Form.Item
                  name="curlCommand"
                  label="Paste curl command"
                  extra={curlParseMsg && (
                    <Text type={curlParseMsg.startsWith('Parsed') ? 'success' : 'danger'} className="text-xs">
                      {curlParseMsg}
                    </Text>
                  )}
                >
                  <Input.TextArea
                    rows={4}
                    placeholder="curl 'https://xxx.larksuite.com/space/api/bitable/connector/sync' -H '...' -b '...' --data-raw '...'"
                    className="font-mono text-xs"
                  />
                </Form.Item>
                <Button
                  type="primary"
                  loading={parsingCurl}
                  onClick={handleParseCurl}
                  className="mb-4"
                  block
                >
                  Parse curl → Auto-fill config
                </Button>

                <Form.Item name="connectorDomain" label="Domain" rules={[{ required: true }]}>
                  <Input placeholder="lsgav2gopb4m.sg.larksuite.com" className="font-mono text-xs" />
                </Form.Item>

                <Form.Item name="connectorDocToken" label="Doc Token" rules={[{ required: true }]}>
                  <Input placeholder="XOuLbxUfva4ue3sja9ulARvcgId" className="font-mono text-xs" />
                </Form.Item>

                <Form.Item
                  name="connectorTableIds"
                  label="Table IDs (phân cách bằng dấu phẩy)"
                  rules={[{ required: true }]}
                  extra="Có thể sync nhiều table cùng lúc"
                >
                  <Input placeholder="tblRX4rg1ljrFaEx, tblABC123" className="font-mono text-xs" />
                </Form.Item>

                <Form.Item name="connectorHostId" label="Host ID">
                  <Input placeholder="PSxJwYgO8iZPsnksN8ilzjWOghd" className="font-mono text-xs" />
                </Form.Item>

                <Form.Item name="connectorHostType" label="Host Type">
                  <Select options={[
                    { label: 'Wiki', value: 'Wiki' },
                    { label: 'Base', value: 'Base' },
                  ]} />
                </Form.Item>

                <Form.Item name="connectorCsrfToken" label="CSRF Token">
                  <Input placeholder="Auto-filled từ curl" className="font-mono text-xs" />
                </Form.Item>

                <Form.Item
                  name="connectorCookies"
                  label="Session Cookies"
                  rules={[{ required: true }]}
                  extra={
                    <Text type="warning" className="text-xs">
                      Cookies sẽ hết hạn sau ~12-24h. Khi sync báo lỗi session expired, cần paste curl mới.
                    </Text>
                  }
                >
                  <Input.TextArea rows={3} placeholder="Auto-filled từ curl" className="font-mono text-xs" />
                </Form.Item>
              </>
            ) : null
          }
        </Form.Item>

        <Divider orientation="left" plain>
          Schedule
        </Divider>

        <Form.Item
          name="intervalSeconds"
          label="Poll Interval (seconds)"
          rules={[{ required: true }]}
          extra="Tối thiểu 10 giây. Khuyến nghị: 60 (1 phút)"
        >
          <InputNumber min={10} max={86400} style={{ width: '100%' }} />
        </Form.Item>

        <Divider orientation="left" plain>
          Lịch trình tự động / Auto Schedule
        </Divider>

        <Card size="small" className="mb-4">
          <Form.Item
            name="ignoreSchedule"
            label="Chạy 24/7 (bỏ qua lịch trình)"
            valuePropName="checked"
            extra="Bật để job chạy liên tục không phụ thuộc giờ/ngày. Hữu ích cho dev/test."
          >
            <Switch checkedChildren="24/7" unCheckedChildren="Theo lịch" />
          </Form.Item>

          <Form.Item
            name="scheduleActiveHoursStart"
            label="Giờ bắt đầu (Active Hours Start)"
          >
            <Select
              options={Array.from({ length: 24 }, (_, i) => ({
                value: i,
                label: `${String(i).padStart(2, '0')}:00`,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="scheduleActiveHoursEnd"
            label="Giờ kết thúc (Active Hours End)"
          >
            <Select
              options={Array.from({ length: 25 }, (_, i) => ({
                value: i,
                label: `${String(i).padStart(2, '0')}:00`,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="scheduleActiveDays"
            label="Ngày hoạt động (Active Days)"
          >
            <Checkbox.Group
              options={[
                { label: 'CN', value: 0 },
                { label: 'T2', value: 1 },
                { label: 'T3', value: 2 },
                { label: 'T4', value: 3 },
                { label: 'T5', value: 4 },
                { label: 'T6', value: 5 },
                { label: 'T7', value: 6 },
              ]}
            />
          </Form.Item>

          <Alert
            type="info"
            showIcon
            message="Sync chi chay trong khoang thoi gian va ngay da cau hinh. Ngoai khoang thoi gian nay, job se tam dung tu dong."
          />
        </Card>

        <Divider orientation="left" plain>
          Webhook (optional)
        </Divider>

        <Form.Item
          name="webhookUrl"
          label="Webhook URL"
          extra="POST changes (added/updated/deleted records) tới URL này"
        >
          <Input placeholder="https://your-api.com/webhook/bitable" />
        </Form.Item>

        <Divider orientation="left" plain>
          Notifications
        </Divider>

        <Space direction="vertical" className="w-full" size={8}>
          <div className="flex items-center gap-2">
            <Form.Item name="notifyOnNew" valuePropName="checked" noStyle>
              <Switch size="small" />
            </Form.Item>
            <Text>Thông báo khi có record mới</Text>
          </div>

          <div className="flex items-center gap-2">
            <Form.Item name="notifyOnUpdate" valuePropName="checked" noStyle>
              <Switch size="small" />
            </Form.Item>
            <Text>Thông báo khi record thay đổi</Text>
          </div>

          <div className="flex items-center gap-2">
            <Form.Item name="notifyOnDelete" valuePropName="checked" noStyle>
              <Switch size="small" />
            </Form.Item>
            <Text>Thông báo khi record bị xóa</Text>
          </div>
        </Space>

        <Form.Item name="notifyChannels" label="Channels" className="mt-4">
          <Select
            mode="multiple"
            placeholder="Chọn kênh thông báo"
            options={[
              { label: 'Telegram', value: 'telegram' },
              { label: 'Lark Bot', value: 'lark' },
            ]}
          />
        </Form.Item>
      </Form>
    </Drawer>
  )
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function BitableSyncPage() {
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<BitableSyncJob[]>([])
  const [search, setSearch] = useState('')
  const [openCreate, setOpenCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<BitableSyncJob | null>(null)
  const [execResult, setExecResult] = useState<BitableSyncResult | null>(null)
  // History
  const [historyTarget, setHistoryTarget] = useState<BitableSyncJob | null>(null)
  const [historyLogs, setHistoryLogs] = useState<BitableSyncLog[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyPage, setHistoryPage] = useState(1)
  const [historyTotal, setHistoryTotal] = useState(0)

  async function load(q = search) {
    setLoading(true)
    try {
      const res = await getBitableSyncs({ search: q.trim() || undefined })
      if (!res.success) throw new Error(res.error || 'Load failed')
      setRows(res.data || [])
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadHistory(job: BitableSyncJob, page = 1) {
    setHistoryTarget(job)
    setHistoryLoading(true)
    setHistoryPage(page)
    try {
      const res = await getBitableSyncLogs(job._id, { page, limit: 20 })
      if (!res.success) throw new Error(res.error)
      setHistoryLogs(res.data || [])
      setHistoryTotal(res.pagination?.total ?? 0)
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setHistoryLoading(false)
    }
  }

  async function handleClearHistory(syncId: string) {
    try {
      const res = await deleteBitableSyncJobLogs(syncId)
      message.success(`Deleted ${res.data?.deletedCount ?? 0} logs`)
      if (historyTarget) loadHistory(historyTarget, 1)
    } catch (e: any) {
      message.error(e.message)
    }
  }

  async function handleExecute(r: BitableSyncJob) {
    const hide = message.loading(`Syncing "${r.name}"...`, 0)
    try {
      const res = await executeBitableSync(r._id)
      hide()
      if (res.data?.success) {
        message.success(
          `Synced! Total: ${res.data.stats?.total}, +${res.data.stats?.added} ~${res.data.stats?.updated} -${res.data.stats?.deleted} (${res.data.duration}ms)`,
        )
        setExecResult(res.data)
      } else {
        message.error(res.data?.error || 'Sync failed')
      }
    } catch (e: any) {
      hide()
      message.error(e.message)
    } finally {
      await load()
    }
  }

  async function handleToggle(r: BitableSyncJob) {
    try {
      await toggleBitableSync(r._id)
      message.success(r.enabled ? 'Sync disabled' : 'Sync enabled')
      load()
    } catch (e: any) {
      message.error(e.message)
    }
  }

  async function handleDelete(r: BitableSyncJob) {
    try {
      await deleteBitableSync(r._id)
      message.success('Sync job deleted')
      load()
    } catch (e: any) {
      message.error(e.message)
    }
  }

  async function handleViewSnapshot(r: BitableSyncJob) {
    try {
      const res = await getBitableSyncSnapshot(r._id)
      if (!res.success) throw new Error(res.error)
      Modal.info({
        title: `Snapshot: ${r.name}`,
        width: 500,
        content: (
          <Descriptions column={1} size="small" bordered className="mt-3">
            <Descriptions.Item label="Records">{res.data.recordCount}</Descriptions.Item>
            <Descriptions.Item label="Last Sync">
              {res.data.lastSyncAt
                ? dayjs(res.data.lastSyncAt).format('YYYY-MM-DD HH:mm:ss')
                : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Added">{res.data.lastSyncStats?.added ?? 0}</Descriptions.Item>
            <Descriptions.Item label="Updated">{res.data.lastSyncStats?.updated ?? 0}</Descriptions.Item>
            <Descriptions.Item label="Deleted">{res.data.lastSyncStats?.deleted ?? 0}</Descriptions.Item>
          </Descriptions>
        ),
      })
    } catch (e: any) {
      message.error(e.message)
    }
  }

  function formatInterval(s: number): string {
    if (s < 60) return `${s}s`
    if (s < 3600) return `${Math.round(s / 60)}m`
    return `${(s / 3600).toFixed(1)}h`
  }

  const cols: ColumnsType<BitableSyncJob> = [
    {
      title: 'Name',
      dataIndex: 'name',
      render: (_, r) => {
        const acc = r.accountId && typeof r.accountId === 'object' ? r.accountId : null
        return (
          <div>
            <div className="flex items-center gap-1">
              <span className="font-semibold">{r.name}</span>
              <Tag
                color={r.syncMode === 'connector' ? 'orange' : r.syncMode === 'mirror' ? 'purple' : 'default'}
                className="text-[10px] leading-tight"
              >
                {r.syncMode === 'connector' ? 'CONNECTOR' : r.syncMode === 'mirror' ? 'MIRROR' : 'READ'}
              </Tag>
            </div>
            {acc && (
              <div className="text-xs text-blue-400">
                {acc.name}{acc.isDefault ? ' ★' : ''}
              </div>
            )}
            {r.description && (
              <div className="text-xs text-neutral-400 line-clamp-1">{r.description}</div>
            )}
          </div>
        )
      },
    },
    {
      title: 'Target',
      key: 'target',
      width: 200,
      render: (_, r) => (
        <Tooltip title={`App: ${r.appToken}\nTable: ${r.tableId}${r.viewId ? `\nView: ${r.viewId}` : ''}`}>
          <div className="font-mono text-xs">
            <div className="truncate max-w-[180px]">{r.appToken}</div>
            <div className="text-neutral-400 truncate max-w-[180px]">{r.tableId}</div>
          </div>
        </Tooltip>
      ),
    },
    {
      title: 'Interval',
      dataIndex: 'intervalSeconds',
      width: 90,
      render: (v) => <span className="font-mono text-xs">{formatInterval(v)}</span>,
    },
    {
      title: 'Status',
      width: 160,
      render: (_, r) => (
        <Space size={4}>
          <Tag color={r.enabled ? 'green' : 'default'}>{r.enabled ? 'ON' : 'OFF'}</Tag>
          <Tag color={r.isRunning ? 'blue' : 'default'}>
            {r.isRunning ? 'RUNNING' : 'IDLE'}
          </Tag>
        </Space>
      ),
    },
    {
      title: 'Last Sync',
      width: 200,
      render: (_, r) => (
        <div className="text-xs">
          <div>
            {r.lastSyncAt ? dayjs(r.lastSyncAt).format('YYYY-MM-DD HH:mm:ss') : '—'}
          </div>
          {r.lastSyncStatus === 'success' && r.lastSyncStats && (
            <div className="text-neutral-400">
              {r.lastSyncStats.total} records
              {(r.lastSyncStats.added > 0 || r.lastSyncStats.updated > 0 || r.lastSyncStats.deleted > 0) && (
                <span>
                  {' '}(+{r.lastSyncStats.added} ~{r.lastSyncStats.updated} -{r.lastSyncStats.deleted})
                </span>
              )}
            </div>
          )}
          {r.lastSyncStatus === 'error' && (
            <Tooltip
              title={
                <div className="text-xs whitespace-pre-wrap max-w-xs">{r.lastSyncError}</div>
              }
              overlayStyle={{ maxWidth: 400 }}
            >
              <Tag color="red" className="text-xs cursor-help">ERROR</Tag>
            </Tooltip>
          )}
        </div>
      ),
    },
    {
      title: 'Syncs',
      dataIndex: 'syncCount',
      width: 70,
      align: 'right',
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 250,
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="Sync now">
            <Button size="small" icon={<ThunderboltOutlined />} onClick={() => handleExecute(r)} />
          </Tooltip>
          <Tooltip title={r.enabled ? 'Disable' : 'Enable'}>
            <Button size="small" icon={<PoweroffOutlined />} onClick={() => handleToggle(r)} />
          </Tooltip>
          <Tooltip title="View snapshot">
            <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewSnapshot(r)} />
          </Tooltip>
          <Tooltip title="Sync history">
            <Button size="small" icon={<HistoryOutlined />} onClick={() => loadHistory(r)} />
          </Tooltip>
          <Tooltip title="Edit">
            <Button size="small" icon={<EditOutlined />} onClick={() => setEditTarget(r)} />
          </Tooltip>
          <Popconfirm
            title="Delete this sync job?"
            okText="Delete"
            cancelText="Cancel"
            onConfirm={() => handleDelete(r)}
          >
            <Tooltip title="Delete">
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div className="mx-4">
      {/* Header */}
      <div className="flex items-center justify-between my-2">
        <Space>
          <SyncOutlined className="text-lg text-blue-500" />
          <span className="text-base font-semibold text-neutral-700">
            Bitable Sync ({rows.length})
          </span>
        </Space>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => load()} loading={loading}>
            Refresh
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpenCreate(true)}>
            New Sync
          </Button>
        </Space>
      </div>

      {/* Info banner */}
      <Card size="small" className="mb-3" style={{ background: 'var(--bg-secondary)' }}>
        <Text type="secondary" className="text-xs">
          Bitable Sync polls Lark Bitable tables directly via <code>tenant_access_token</code> (app-level).
          No session dependency — works with intervals as low as 10 seconds.
          Changes (added/updated/deleted records) are detected by comparing field hashes.
        </Text>
      </Card>

      <Card>
        <Input.Search
          placeholder="Search by name, description, or app token..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onSearch={(v) => load(v)}
          onClear={() => { setSearch(''); load('') }}
          allowClear
          enterButton
          className="max-w-sm"
        />

        <Divider />

        <Table
          rowKey="_id"
          loading={loading}
          columns={cols}
          dataSource={rows}
          pagination={{ pageSize: 15, showSizeChanger: true }}
          size="small"
        />
      </Card>

      {/* Create */}
      <SyncForm
        open={openCreate}
        title="Create Bitable Sync"
        onClose={() => setOpenCreate(false)}
        onSubmit={async (payload) => {
          const res = await createBitableSync(payload)
          if (!res.success) throw new Error(res.error || 'Create failed')
          message.success('Sync job created')
          setOpenCreate(false)
          load()
        }}
      />

      {/* Edit */}
      {editTarget && (
        <SyncForm
          open
          title={`Edit — ${editTarget.name}`}
          initial={editTarget}
          onClose={() => setEditTarget(null)}
          onSubmit={async (payload) => {
            const res = await updateBitableSync(editTarget._id, payload)
            if (!res.success) throw new Error(res.error || 'Update failed')
            message.success('Sync job updated')
            setEditTarget(null)
            load()
          }}
        />
      )}

      {/* Execution result modal */}
      <Modal
        open={!!execResult}
        title="Sync Result"
        onCancel={() => setExecResult(null)}
        footer={<Button onClick={() => setExecResult(null)}>Close</Button>}
        forceRender
      >
        {execResult && (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Status">
              <Tag color={execResult.success ? 'green' : 'red'}>
                {execResult.success ? 'SUCCESS' : 'ERROR'}
              </Tag>
            </Descriptions.Item>
            {execResult.stats && (
              <>
                <Descriptions.Item label="Total Records">{execResult.stats.total}</Descriptions.Item>
                <Descriptions.Item label="Added">{execResult.stats.added}</Descriptions.Item>
                <Descriptions.Item label="Updated">{execResult.stats.updated}</Descriptions.Item>
                <Descriptions.Item label="Deleted">{execResult.stats.deleted}</Descriptions.Item>
              </>
            )}
            <Descriptions.Item label="Duration">{execResult.duration}ms</Descriptions.Item>
            {execResult.error && (
              <Descriptions.Item label="Error">
                <Text type="danger">{execResult.error}</Text>
              </Descriptions.Item>
            )}
            {(execResult as any).errorHint && (
              <Descriptions.Item label="Hint">
                <Text type="warning" className="text-xs whitespace-pre-wrap">
                  <WarningOutlined className="mr-1" />
                  {(execResult as any).errorHint}
                </Text>
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>

      {/* ── Sync History Drawer ──────────────────────────────────────────── */}
      <Drawer
        open={!!historyTarget}
        title={
          <Space>
            <HistoryOutlined />
            <span>Sync History — {historyTarget?.name}</span>
          </Space>
        }
        width={640}
        onClose={() => setHistoryTarget(null)}
        forceRender
        extra={
          historyTarget && (
            <Popconfirm
              title="Xoá tất cả logs?"
              okText="Xoá"
              cancelText="Huỷ"
              onConfirm={() => handleClearHistory(historyTarget._id)}
            >
              <Button size="small" danger icon={<DeleteOutlined />}>
                Clear
              </Button>
            </Popconfirm>
          )
        }
      >
        <Table<BitableSyncLog>
          rowKey="_id"
          loading={historyLoading}
          dataSource={historyLogs}
          size="small"
          pagination={{
            current: historyPage,
            total: historyTotal,
            pageSize: 20,
            onChange: (p) => historyTarget && loadHistory(historyTarget, p),
            showTotal: (t) => `${t} logs`,
            size: 'small',
          }}
          columns={[
            {
              title: 'Time',
              dataIndex: 'timestamp',
              width: 160,
              render: (v) => (
                <span className="text-xs font-mono">
                  {dayjs(v).format('MM-DD HH:mm:ss')}
                </span>
              ),
            },
            {
              title: 'Status',
              dataIndex: 'status',
              width: 80,
              render: (v) => (
                <Tag color={v === 'success' ? 'green' : 'red'} className="text-xs">
                  {v === 'success' ? 'OK' : 'ERR'}
                </Tag>
              ),
            },
            {
              title: 'Records',
              key: 'stats',
              width: 140,
              render: (_, log) =>
                log.status === 'success' && log.stats ? (
                  <span className="text-xs font-mono">
                    {log.stats.total}
                    <span className="text-green-500 ml-1">+{log.stats.added}</span>
                    <span className="text-yellow-500 ml-1">~{log.stats.updated}</span>
                    <span className="text-red-400 ml-1">-{log.stats.deleted}</span>
                  </span>
                ) : (
                  <span className="text-xs text-neutral-400">—</span>
                ),
            },
            {
              title: 'Duration',
              dataIndex: 'durationMs',
              width: 80,
              render: (v) => <span className="text-xs font-mono">{v}ms</span>,
            },
            {
              title: 'Error / Hint',
              key: 'error',
              render: (_, log) => {
                if (log.status === 'success') return <span className="text-xs text-neutral-400">—</span>
                return (
                  <div className="text-xs">
                    <Text type="danger" className="line-clamp-2">{log.error}</Text>
                    {log.errorHint && (
                      <div className="mt-1 text-yellow-600">
                        <WarningOutlined className="mr-1" />
                        <span className="line-clamp-2">{log.errorHint}</span>
                      </div>
                    )}
                  </div>
                )
              },
            },
          ]}
          expandable={{
            expandedRowRender: (log) => (
              <div className="text-xs space-y-1 p-2">
                {log.error && (
                  <div>
                    <Text strong>Error: </Text>
                    <Text type="danger" className="whitespace-pre-wrap">{log.error}</Text>
                  </div>
                )}
                {log.errorHint && (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded">
                    <WarningOutlined className="mr-1 text-yellow-500" />
                    <Text className="whitespace-pre-wrap">{log.errorHint}</Text>
                  </div>
                )}
                {log.diff && (log.diff.added.length > 0 || log.diff.updated.length > 0 || log.diff.deleted.length > 0) && (
                  <div className="mt-2">
                    {log.diff.added.length > 0 && (
                      <div><Text type="success">Added:</Text> {log.diff.added.join(', ')}</div>
                    )}
                    {log.diff.updated.length > 0 && (
                      <div><Text type="warning">Updated:</Text> {log.diff.updated.join(', ')}</div>
                    )}
                    {log.diff.deleted.length > 0 && (
                      <div><Text type="danger">Deleted:</Text> {log.diff.deleted.join(', ')}</div>
                    )}
                  </div>
                )}
              </div>
            ),
            rowExpandable: (log) =>
              !!(log.error || log.errorHint || (log.diff && (log.diff.added.length + log.diff.updated.length + log.diff.deleted.length) > 0)),
          }}
        />
      </Drawer>
      <TourGuide pageKey="sync-bitable" steps={tourSteps['sync-bitable']} />
    </div>
  )
}
