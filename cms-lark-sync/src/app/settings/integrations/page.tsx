'use client'

/**
 * /settings/integrations — third-party service keys management.
 *
 * UI scaffolded ahead of backend wiring (per roadmap). Users can save keys
 * for search APIs, email senders, payment providers, monitoring backends,
 * AI safety tools, and object storage — each phase will consume them later.
 *
 * Tabs by category. Each tab lists existing keys and has an "Add new" button
 * that opens a modal with provider-specific fields (read from /presets).
 */

import React, { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Alert, Button, Card, Col, Empty, Form, Input, message, Modal, Popconfirm, Row,
  Select, Space, Switch, Table, Tabs, Tag, Tooltip, Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ApiOutlined, CloudOutlined, DeleteOutlined, DollarOutlined, EditOutlined,
  ExperimentOutlined, MailOutlined, PlusOutlined, ReloadOutlined, SafetyOutlined,
  SearchOutlined, BarChartOutlined, DatabaseOutlined,
} from '@ant-design/icons'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

const _base = (process.env.NEXT_PUBLIC_API_BASE || 'https://apihoanam.toolswave.net/api')
const API   = `${_base}/integrations`

type ProviderMeta = {
  label: string
  fields: string[]
  docsUrl: string
}
type Category = {
  label: string
  providers: Record<string, ProviderMeta>
}
type Presets = Record<string, Category>

type Integration = {
  _id: string
  category: string
  provider: string
  name: string
  credentials: Record<string, string>
  isActive: boolean
  notes: string
  createdAt: string
  updatedAt: string
}

const CATEGORY_META: Record<string, { icon: React.ReactNode; color: string }> = {
  search:     { icon: <SearchOutlined />,    color: '#1890FF' },
  email:      { icon: <MailOutlined />,      color: '#FA8C16' },
  payment:    { icon: <DollarOutlined />,    color: '#FAAD14' },
  monitoring: { icon: <BarChartOutlined />,  color: '#EB2F96' },
  safety:     { icon: <SafetyOutlined />,    color: '#13C2C2' },
  storage:    { icon: <DatabaseOutlined />,  color: '#722ED1' },
}

async function apiFetch(path: string, opts: RequestInit = {}) {
  const r = await fetch(`${API}${path}`, { cache: 'no-store', ...opts })
  return r.json()
}

export default function IntegrationsPage() {
  const [presets, setPresets]         = useState<Presets>({})
  const [items, setItems]             = useState<Integration[]>([])
  const [loading, setLoading]         = useState(true)
  const [activeCategory, setCategory] = useState<string>('search')
  const [modal, setModal]             = useState<{ open: boolean; editing?: Integration }>({ open: false })
  const [saving, setSaving]           = useState(false)
  const [form]                        = Form.useForm()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [presetsRes, itemsRes] = await Promise.all([
        apiFetch('/presets'),
        apiFetch('/'),
      ])
      if (presetsRes.success) setPresets(presetsRes.data ?? {})
      if (itemsRes.success)   setItems(itemsRes.data ?? [])
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Load failed')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Set default tab to first category once presets load
  useEffect(() => {
    const keys = Object.keys(presets)
    if (keys.length > 0 && !keys.includes(activeCategory)) {
      setCategory(keys[0])
    }
  }, [presets, activeCategory])

  function openCreate() {
    form.resetFields()
    const firstProvider = Object.keys(presets[activeCategory]?.providers ?? {})[0]
    form.setFieldsValue({ category: activeCategory, provider: firstProvider, isActive: true })
    setModal({ open: true })
  }

  function openEdit(item: Integration) {
    form.resetFields()
    form.setFieldsValue({
      category:  item.category,
      provider:  item.provider,
      name:      item.name,
      isActive:  item.isActive,
      notes:     item.notes,
      ...item.credentials,
    })
    setModal({ open: true, editing: item })
  }

  async function handleSave() {
    try {
      setSaving(true)
      const values = await form.validateFields()
      const { category, provider, name, isActive, notes, ...credFields } = values

      // Strip fields from other providers (only keep fields declared in current provider's spec)
      const spec = presets[category]?.providers[provider]
      const credentials: Record<string, string> = {}
      for (const field of spec?.fields ?? []) {
        if (credFields[field] !== undefined) credentials[field] = credFields[field]
      }

      const body = { category, provider, name, credentials, isActive: !!isActive, notes }
      const r = modal.editing
        ? await apiFetch(`/${modal.editing._id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : await apiFetch('/',                     { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.success) throw new Error(r.error)
      message.success(modal.editing ? 'Đã cập nhật' : 'Đã lưu integration')
      setModal({ open: false })
      load()
    } catch (e: unknown) {
      if (e instanceof Error) message.error(e.message)
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    try {
      const r = await apiFetch(`/${id}`, { method: 'DELETE' })
      if (!r.success) throw new Error(r.error)
      message.success('Đã xoá')
      load()
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  async function handleToggle(item: Integration) {
    try {
      const r = await apiFetch(`/${item._id}/toggle`, { method: 'PATCH' })
      if (!r.success) throw new Error(r.error)
      load()
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Toggle failed')
    }
  }

  function columnsFor(): ColumnsType<Integration> {
    return [
      {
        title: 'Provider',
        dataIndex: 'provider',
        width: 180,
        render: (v: string, r) => {
          const label = presets[r.category]?.providers[v]?.label ?? v
          return (
            <Space>
              <Text strong>{label}</Text>
              <Tooltip title="Documentation">
                <a href={presets[r.category]?.providers[v]?.docsUrl} target="_blank" rel="noreferrer">
                  <Tag color="blue" style={{ marginLeft: 4 }}>docs ↗</Tag>
                </a>
              </Tooltip>
            </Space>
          )
        },
      },
      {
        title: 'Tên',
        dataIndex: 'name',
        render: (v: string) => v || <Text type="secondary">—</Text>,
      },
      {
        title: 'Credentials',
        dataIndex: 'credentials',
        render: (c: Record<string, string>) => (
          <Space size={4} wrap>
            {Object.entries(c || {}).map(([k, v]) => (
              <Tooltip key={k} title={String(v)}>
                <Tag style={{ fontFamily: 'monospace', fontSize: 10 }}>{k}=…</Tag>
              </Tooltip>
            ))}
          </Space>
        ),
      },
      {
        title: 'Active',
        dataIndex: 'isActive',
        width: 80,
        render: (v: boolean, r) => <Switch size="small" checked={v} onChange={() => handleToggle(r)} />,
      },
      {
        title: 'Actions',
        key: 'actions',
        width: 110,
        render: (_: unknown, r) => (
          <Space size={4}>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
            <Popconfirm title="Xoá integration này?" onConfirm={() => handleDelete(r._id)}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
      },
    ]
  }

  const tabs = Object.entries(presets).map(([categoryKey, category]) => {
    const meta = CATEGORY_META[categoryKey] ?? { icon: <ApiOutlined />, color: '#666' }
    const itemsInCategory = items.filter(i => i.category === categoryKey)
    const providersList   = Object.entries(category.providers)

    return {
      key:   categoryKey,
      label: (
        <Space>
          <span style={{ color: meta.color }}>{meta.icon}</span>
          <span>{category.label}</span>
          {itemsInCategory.length > 0 && (
            <Tag color={meta.color}>{itemsInCategory.length}</Tag>
          )}
        </Space>
      ),
      children: (
        <div className="space-y-3">
          <Card size="small" title={`Providers hỗ trợ (${providersList.length})`}>
            <Row gutter={[8, 8]}>
              {providersList.map(([provKey, prov]) => {
                const count = itemsInCategory.filter(i => i.provider === provKey).length
                return (
                  <Col key={provKey} span={8}>
                    <Card size="small" className="h-full">
                      <Space direction="vertical" size={2} style={{ width: '100%' }}>
                        <Space>
                          <Text strong>{prov.label}</Text>
                          {count > 0 && <Tag color={meta.color}>{count}</Tag>}
                        </Space>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          Fields: {prov.fields.join(', ')}
                        </Text>
                        <a href={prov.docsUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>
                          docs ↗
                        </a>
                      </Space>
                    </Card>
                  </Col>
                )
              })}
            </Row>
          </Card>

          <Card
            size="small"
            title={`Configured keys (${itemsInCategory.length})`}
            extra={
              <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                Add key
              </Button>
            }
          >
            {itemsInCategory.length === 0 ? (
              <Empty description="Chưa có key nào trong category này" />
            ) : (
              <Table
                rowKey="_id"
                size="small"
                pagination={false}
                dataSource={itemsInCategory}
                columns={columnsFor()}
              />
            )}
          </Card>
        </div>
      ),
    }
  })

  const currentCategory = presets[activeCategory]

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Title level={3} className="!mb-0">
            <ApiOutlined className="mr-2" />
            Third-party integrations
          </Title>
          <Paragraph type="secondary" className="!mb-0">
            Quản lý API keys cho các dịch vụ bên thứ 3: search, email, payment, monitoring, safety, storage.
            UI đã scaffold sẵn, có thể add key ngay cả khi backend chưa wire đầy đủ.
          </Paragraph>
        </div>
        <Space>
          <Link href="/docs/roadmap">
            <Button icon={<ExperimentOutlined />}>Xem roadmap</Button>
          </Link>
          <Button icon={<ReloadOutlined />} onClick={load}>Reload</Button>
        </Space>
      </div>

      <Alert
        type="info"
        showIcon
        message="Lưu ý"
        description={
          <>
            <b>AI provider keys</b> (OpenAI, Claude, Gemini, Qwen, Llama, …) dùng trang{' '}
            <Link href="/settings/ai">/settings/ai</Link> riêng.
            Trang này chỉ dành cho <b>non-LLM third-party services</b>.
            Từng category sẽ được consume bởi roadmap phase tương ứng (xem
            {' '}<Link href="/docs/roadmap">roadmap</Link>).
          </>
        }
      />

      <Card>
        <Tabs activeKey={activeCategory} onChange={setCategory} items={tabs} />
      </Card>

      <Modal
        open={modal.open}
        title={modal.editing ? `Edit ${currentCategory?.providers[modal.editing.provider]?.label}` : 'Add integration key'}
        onCancel={() => setModal({ open: false })}
        onOk={handleSave}
        confirmLoading={saving}
        width={640}
        forceRender
      >
        <Form form={form} layout="vertical" size="small" className="mt-4">
          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="category" label="Category" rules={[{ required: true }]}>
              <Select
                disabled={!!modal.editing}
                options={Object.entries(presets).map(([k, v]) => ({
                  value: k, label: v.label,
                }))}
                onChange={() => {
                  // Reset provider when category changes
                  form.setFieldsValue({ provider: undefined })
                }}
              />
            </Form.Item>
            <Form.Item name="provider" label="Provider" rules={[{ required: true }]}>
              <Form.Item noStyle shouldUpdate={(a, b) => a.category !== b.category}>
                {({ getFieldValue }) => {
                  const cat = getFieldValue('category')
                  const providers = presets[cat]?.providers ?? {}
                  return (
                    <Select
                      disabled={!!modal.editing}
                      options={Object.entries(providers).map(([k, v]) => ({
                        value: k, label: v.label,
                      }))}
                    />
                  )
                }}
              </Form.Item>
            </Form.Item>
          </div>

          <Form.Item name="name" label="Display name (optional)">
            <Input placeholder="Ví dụ: Stripe Production, Tavily Dev..." />
          </Form.Item>

          {/* Dynamic fields based on provider */}
          <Form.Item noStyle shouldUpdate={(a, b) => a.category !== b.category || a.provider !== b.provider}>
            {({ getFieldValue }) => {
              const cat  = getFieldValue('category')
              const prov = getFieldValue('provider')
              const spec = presets[cat]?.providers[prov]
              if (!spec) return null
              return (
                <div className="rounded border border-dashed p-3 mb-3" style={{ borderColor: 'var(--border-color)' }}>
                  <div className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                    {spec.label} — <a href={spec.docsUrl} target="_blank" rel="noreferrer">documentation ↗</a>
                  </div>
                  {spec.fields.map(field => {
                    const isSecret = !['fromAddress', 'bucket', 'region', 'domain', 'site', 'dataset', 'projectId', 'accountId', 'partnerCode', 'tmnCode', 'appId', 'clientId', 'publishableKey', 'instanceId', 'otlpEndpoint'].includes(field)
                    const isJson = field === 'serviceAccountJson'
                    return (
                      <Form.Item key={field} name={field} label={field} className="!mb-2">
                        {isJson
                          ? <TextArea rows={4} placeholder='{"type": "service_account", ...}' className="font-mono text-xs" />
                          : isSecret
                            ? <Input.Password placeholder={modal.editing ? '(để trống nếu không đổi)' : ''} className="font-mono" />
                            : <Input placeholder={field} className="font-mono" />
                        }
                      </Form.Item>
                    )
                  })}
                </div>
              )
            }}
          </Form.Item>

          <Form.Item name="notes" label="Notes">
            <TextArea rows={2} placeholder="Ghi chú (optional)" />
          </Form.Item>

          <Form.Item name="isActive" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
