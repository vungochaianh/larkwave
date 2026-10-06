'use client'

import React, { useEffect, useState } from 'react'
import {
  Alert, Badge, Button, Card, Divider, Form, Input, Modal,
  Popconfirm, Select, Space, Switch, Table, Tag, Tooltip, Typography, message,
} from 'antd'
import {
  CheckCircleOutlined, CloseCircleOutlined, CopyOutlined,
  DatabaseOutlined, EditOutlined, KeyOutlined, PlusOutlined,
  ReloadOutlined, StarFilled, StarOutlined, SyncOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import TourGuide from '@/components/TourGuide'
import { tourSteps } from '@/lib/tourSteps'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

const { Text, Title } = Typography

const _base = (process.env.NEXT_PUBLIC_API_BASE || 'https://apihoanam.toolswave.net/api')
const API   = `${_base}/lark-accounts`

type LarkAccount = {
  _id:                 string
  name:                string
  appType:             'custom_app' | 'marketplace_app'
  domain:              'larksuite.com' | 'feishu.cn'
  appId:               string
  appSecret:           string  // masked
  tenantToken?:        string  // masked
  tenantTokenExpireAt?: string
  isDefault:           boolean
  status:              'active' | 'inactive'
  notes:               string
  tags:                string[]
  createdAt:           string
  updatedAt:           string
}

type FormValues = Omit<LarkAccount, '_id' | 'tenantToken' | 'tenantTokenExpireAt' | 'createdAt' | 'updatedAt'>

const DOMAIN_OPTIONS = [
  { label: 'Lark Suite (larksuite.com)', value: 'larksuite.com' },
  { label: 'Feishu / China (feishu.cn)',  value: 'feishu.cn' },
]
const APP_TYPE_OPTIONS = [
  { label: 'Custom App',        value: 'custom_app' },
  { label: 'Marketplace App',   value: 'marketplace_app' },
]

// ── API helpers ────────────────────────────────────────────────────────────────

async function apiGet(path = '')                   { const r = await fetch(`${API}${path}`, { cache: 'no-store' }); return r.json() }
async function apiPost(path = '', body: any)        { const r = await fetch(`${API}${path}`, { method: 'POST',  headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) }); return r.json() }
async function apiPut(path: string, body: any)      { const r = await fetch(`${API}${path}`, { method: 'PUT',   headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) }); return r.json() }
async function apiPatch(path: string)               { const r = await fetch(`${API}${path}`, { method: 'PATCH' }); return r.json() }
async function apiDelete(path: string)              { const r = await fetch(`${API}${path}`, { method: 'DELETE' }); return r.json() }

// ── Token status badge ─────────────────────────────────────────────────────────

function TokenBadge({ expireAt }: { expireAt?: string }) {
  if (!expireAt) return <Tag color="default" className="text-xs">Chưa lấy token</Tag>
  const exp  = dayjs(expireAt)
  const diff = exp.diff(dayjs(), 'minute')
  if (diff <= 0) return <Tag color="red" className="text-xs">Hết hạn</Tag>
  if (diff < 10) return <Tag color="orange" className="text-xs">Còn {diff} phút</Tag>
  return <Tag color="green" icon={<CheckCircleOutlined />} className="text-xs">Còn {diff} phút</Tag>
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LarkAccountsPage() {
  const [accounts, setAccounts] = useState<LarkAccount[]>([])
  const [loading,  setLoading]  = useState(true)
  const [modal,    setModal]    = useState<{ open: boolean; editing?: LarkAccount }>({ open: false })
  const [form]    = Form.useForm<FormValues>()
  const [saving,   setSaving]   = useState(false)
  const [fetching, setFetching] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await apiGet()
      if (res.success) setAccounts(res.data ?? [])
    } catch { message.error('Không thể tải danh sách tài khoản') }
    finally  { setLoading(false) }
  }

  function openCreate() {
    form.resetFields()
    form.setFieldsValue({ appType: 'custom_app', domain: 'larksuite.com', status: 'active', isDefault: false, tags: [] })
    setModal({ open: true })
  }

  function openEdit(acc: LarkAccount) {
    form.setFieldsValue({ ...acc, appSecret: '' })  // never pre-fill masked secret
    setModal({ open: true, editing: acc })
  }

  async function handleSave() {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const res = modal.editing
        ? await apiPut(`/${modal.editing._id}`, values)
        : await apiPost('', values)
      if (!res.success) throw new Error(res.error)
      message.success(modal.editing ? 'Đã cập nhật tài khoản' : 'Đã thêm tài khoản')
      setModal({ open: false })
      load()
      // Auto-fetch token for newly created accounts
      if (!modal.editing && res.data?._id) {
        handleFetchToken(res.data._id)
      }
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiDelete(`/${id}`)
      message.success('Đã xoá tài khoản')
      load()
    } catch { message.error('Không thể xoá') }
  }

  async function handleSetDefault(id: string) {
    try {
      const res = await apiPatch(`/${id}/default`)
      if (!res.success) throw new Error(res.error)
      message.success('Đã đặt làm tài khoản mặc định')
      load()
    } catch (e: any) { message.error(e.message) }
  }

  async function handleFetchToken(id: string) {
    setFetching(id)
    try {
      const res = await apiPost(`/${id}/fetch-token`, {})
      if (!res.success) throw new Error(res.error ?? res.message)
      message.success('Đã lấy/làm mới token thành công')
      load()
    } catch (e: any) { message.error('Lỗi lấy token: ' + e.message) }
    finally { setFetching(null) }
  }

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => message.success(`Đã copy ${label}`))
  }

  const columns: ColumnsType<LarkAccount> = [
    {
      title: 'Tài khoản',
      key:   'account',
      render: (_, acc) => (
        <div>
          <div className="flex items-center gap-2">
            {acc.isDefault && <StarFilled className="text-yellow-400 text-xs" />}
            <span className="font-medium">{acc.name}</span>
            <Badge status={acc.status === 'active' ? 'success' : 'default'} />
          </div>
          <Text className="text-xs text-neutral-400">{acc.appId}</Text>
          {acc.notes && <Text className="text-xs text-neutral-300 block">{acc.notes}</Text>}
        </div>
      ),
    },
    {
      title: 'Domain / Type',
      key:   'meta',
      width: 160,
      render: (_, acc) => (
        <div className="space-y-1">
          <Tag color="blue"   className="text-xs">{acc.domain}</Tag>
          <Tag color="purple" className="text-xs">{acc.appType}</Tag>
        </div>
      ),
    },
    {
      title:  'Token',
      key:    'token',
      width:  150,
      render: (_, acc) => <TokenBadge expireAt={acc.tenantTokenExpireAt} />,
    },
    {
      title:  'Cập nhật',
      key:    'updated',
      width:  130,
      render: (_, acc) => <Text className="text-xs text-neutral-400">{dayjs(acc.updatedAt).fromNow()}</Text>,
    },
    {
      title:  '',
      key:    'actions',
      width:  220,
      render: (_, acc) => (
        <Space wrap size={4}>
          <Tooltip title="Lấy / làm mới Tenant Token">
            <Button
              size="small" icon={<KeyOutlined />}
              loading={fetching === acc._id}
              onClick={() => handleFetchToken(acc._id)}
            >
              Token
            </Button>
          </Tooltip>
          {!acc.isDefault && (
            <Tooltip title="Đặt làm tài khoản mặc định">
              <Button size="small" icon={<StarOutlined />} onClick={() => handleSetDefault(acc._id)}>
                Mặc định
              </Button>
            </Tooltip>
          )}
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(acc)}>Sửa</Button>
          <Popconfirm
            title="Xoá tài khoản này?"
            okText="Xoá" cancelText="Huỷ" okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(acc._id)}
          >
            <Button size="small" danger>Xoá</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <DatabaseOutlined className="text-xl text-blue-500" />
          <div>
            <Title level={4} className="!mb-0">Tài khoản Lark</Title>
            <Text className="text-neutral-400 text-xs">Quản lý nhiều Lark App credentials. Token tự động làm mới.</Text>
          </div>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Làm mới</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Thêm tài khoản</Button>
        </Space>
      </div>

      <Alert
        type="info" showIcon className="mb-4"
        message="Cách dùng: thêm nhiều tài khoản Lark App → đặt một tài khoản làm mặc định → hệ thống sẽ tự dùng tài khoản đó cho các API call. Nhấn 'Token' để lấy Tenant Token ngay lập tức."
      />

      <Card>
        <Table
          dataSource={accounts}
          columns={columns}
          rowKey="_id"
          loading={loading}
          pagination={{ pageSize: 10, showTotal: t => `${t} tài khoản` }}
          locale={{ emptyText: 'Chưa có tài khoản nào. Nhấn "Thêm tài khoản" để bắt đầu.' }}
          rowClassName={r => r.isDefault ? 'bg-yellow-50' : ''}
        />
      </Card>

      {/* Create / Edit Modal */}
      <Modal
        title={modal.editing ? `Sửa: ${modal.editing.name}` : 'Thêm tài khoản Lark'}
        open={modal.open}
        onCancel={() => setModal({ open: false })}
        onOk={handleSave}
        okText={modal.editing ? 'Cập nhật' : 'Thêm'}
        confirmLoading={saving}
        width={560}
        forceRender
      >
        <Form form={form} layout="vertical" size="small" className="mt-4">
          <Form.Item name="name" label="Tên hiển thị" rules={[{ required: true, message: 'Nhập tên' }]}>
            <Input placeholder="VD: CMS Production, Dev App…" />
          </Form.Item>

          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="appType" label="App Type">
              <Select options={APP_TYPE_OPTIONS} />
            </Form.Item>
            <Form.Item name="domain" label="Domain">
              <Select options={DOMAIN_OPTIONS} />
            </Form.Item>
          </div>

          <Form.Item name="appId" label="App ID" rules={[{ required: true, message: 'Nhập App ID' }]}>
            <Input placeholder="cli_xxxxxxxxxxxx" className="font-mono" />
          </Form.Item>

          <Form.Item
            name="appSecret" label="App Secret"
            tooltip={modal.editing ? 'Để trống = giữ nguyên secret hiện tại' : undefined}
          >
            <Input.Password placeholder={modal.editing ? '(giữ nguyên nếu để trống)' : 'App Secret'} className="font-mono" />
          </Form.Item>

          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="status" label="Trạng thái">
              <Select options={[{ label: 'Active', value: 'active' }, { label: 'Inactive', value: 'inactive' }]} />
            </Form.Item>
            <Form.Item name="isDefault" label="Mặc định" valuePropName="checked">
              <Switch checkedChildren="Mặc định" unCheckedChildren="Phụ" />
            </Form.Item>
          </div>

          <Form.Item name="notes" label="Ghi chú">
            <Input.TextArea rows={2} placeholder="Mô tả, mục đích sử dụng…" />
          </Form.Item>
        </Form>
      </Modal>
      <TourGuide pageKey="lark-accounts" steps={tourSteps['lark-accounts']} />
    </div>
  )
}
