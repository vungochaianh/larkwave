'use client'

import React, { useEffect, useState } from 'react'
import {
  Alert, Badge, Button, Card, Divider, Form, Input,
  InputNumber, Modal, Popconfirm, Select, Space, Switch,
  Table, Tag, Tooltip, Typography, message,
} from 'antd'
import {
  ApiOutlined,
  DollarOutlined,
  EditOutlined, PlusOutlined, ReloadOutlined, RobotOutlined, StarFilled, StarOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import TourGuide from '@/components/TourGuide'
import { tourSteps } from '@/lib/tourSteps'

const { Text, Title } = Typography

const _base   = (process.env.NEXT_PUBLIC_API_BASE || 'https://apihoanam.toolswave.net/api')
const API     = `${_base}/ai-configs`
const CREDITS = `${_base}/ai-credits`

type AIConfig = {
  _id:             string
  name:            string
  provider:        string
  apiKey:          string  // masked
  baseUrl:         string
  model:           string
  isDefault:       boolean
  status:          'active' | 'inactive'
  notes:           string
  inputPricePerM:  number
  outputPricePerM: number
  totalInputTokens:  number
  totalOutputTokens: number
  totalCostUsd:    number
  createdAt:       string
  // v3.x Vertex AI (Google Cloud) fields
  gcpProjectId?:         string
  gcpLocation?:          string
  gcpServiceAccountJson?: string  // masked
}

type Presets = Record<string, { inputPricePerM: number; outputPricePerM: number; models: string[]; pricing?: Record<string, { input: number; output: number }> }>

type CreditSummary = {
  balance: number
  totalDeposited: number
  totalUsed: number
  blockOnZero: boolean
  alertThreshold: number
}

const PROVIDER_COLORS: Record<string, string> = {
  // v2.x providers
  openai: 'green', anthropic: 'purple', google: 'blue',
  groq: 'orange', mistral: 'cyan', nvidia: 'lime', ollama: 'magenta',
  // v3.x providers (UI scaffolded ahead of backend)
  vertex: 'geekblue', alibaba: 'red', cerebras: 'gold',
  together: 'volcano', fireworks: 'magenta', replicate: 'purple',
  custom: 'default',
}
const PROVIDER_ICONS: Record<string, string> = {
  openai: '🟢', anthropic: '🟣', google: '🔵', groq: '🟠', mistral: '🔷',
  nvidia: '🟢', ollama: '🦙',
  vertex: '☁️', alibaba: '🐉', cerebras: '⚡', together: '🤝',
  fireworks: '🎆', replicate: '🔁',
  custom: '⚙️',
}

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${API}${path}`, { cache: 'no-store', ...opts })
  return r.json()
}

export default function AIConfigPage() {
  const [configs,  setConfigs]  = useState<AIConfig[]>([])
  const [presets,  setPresets]  = useState<Presets>({})
  const [loading,  setLoading]  = useState(true)
  const [credits,  setCredits]  = useState<Record<string, CreditSummary>>({})
  const [modal,    setModal]    = useState<{ open: boolean; editing?: AIConfig }>({ open: false })
  const [depositModal, setDepositModal] = useState<{ open: boolean; configId?: string; configName?: string }>({ open: false })
  const [depositAmount, setDepositAmount] = useState<number>(10)
  const [form]    = Form.useForm()
  const [saving,   setSaving]   = useState(false)

  useEffect(() => {
    load()
    apiFetch('/presets').then(r => { if (r.success) setPresets(r.data ?? {}) })
  }, [])

  async function load() {
    setLoading(true)
    try {
      const [cfgRes, creditRes] = await Promise.all([
        apiFetch('/'),
        fetch(`${CREDITS}`, { cache: 'no-store' }).then(r => r.json()).catch(() => ({ success: false })),
      ])
      if (cfgRes.success) setConfigs(cfgRes.data ?? [])
      if (creditRes.success) {
        const map: Record<string, CreditSummary> = {}
        for (const c of (creditRes.data ?? [])) {
          const cfgId = c.aiConfigId?._id || c.aiConfigId
          if (cfgId) map[cfgId] = { balance: c.balance, totalDeposited: c.totalDeposited, totalUsed: c.totalUsed, blockOnZero: c.blockOnZero, alertThreshold: c.alertThreshold }
        }
        setCredits(map)
      }
    } catch { message.error('Không thể tải cấu hình AI') }
    finally  { setLoading(false) }
  }

  async function handleDeposit() {
    if (!depositModal.configId || !depositAmount || depositAmount <= 0) return
    try {
      const res = await fetch(`${CREDITS}/${depositModal.configId}/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: depositAmount, description: 'Manual deposit from Settings' }),
      }).then(r => r.json())
      if (!res.success) throw new Error(res.error)
      message.success(`Đã nạp $${depositAmount} thành công!`)
      setDepositModal({ open: false })
      load()
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Deposit failed')
    }
  }

  async function handleToggleBlockOnZero(configId: string, currentValue: boolean) {
    try {
      // Find or create the credit account then update blockOnZero
      // We use a custom fetch since the API uses findOne + save
      const res = await fetch(`${CREDITS}/${configId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockOnZero: !currentValue }),
      }).then(r => r.json())
      if (res.success) {
        message.success(!currentValue ? 'Đã bật chặn khi hết số dư' : 'Đã tắt chặn khi hết số dư')
        load()
      } else {
        // If no credit account yet, create one first via deposit $0
        message.info('Cần nạp credit trước khi cấu hình blockOnZero')
      }
    } catch { /* ignore */ }
  }

  function openCreate() {
    form.resetFields()
    form.setFieldsValue({ provider: 'openai', status: 'active', isDefault: false })
    setModal({ open: true })
  }

  function openEdit(cfg: AIConfig) {
    form.setFieldsValue({ ...cfg, apiKey: '' })
    setModal({ open: true, editing: cfg })
  }

  async function handleSave() {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const res = modal.editing
        ? await apiFetch(`/${modal.editing._id}`, { method: 'PUT',  headers: {'Content-Type':'application/json'}, body: JSON.stringify(values) })
        : await apiFetch('/',                     { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(values) })
      if (!res.success) throw new Error(res.error)
      message.success(modal.editing ? 'Đã cập nhật' : 'Đã thêm AI config')
      setModal({ open: false })
      load()
    } catch (e: any) { message.error(e.message) }
    finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    await apiFetch(`/${id}`, { method: 'DELETE' })
    load()
  }

  async function handleSetDefault(id: string) {
    const res = await apiFetch(`/${id}/default`, { method: 'PATCH' })
    if (res.success) { message.success('Đã đặt làm mặc định'); load() }
    else message.error(res.error)
  }

  // When provider changes, auto-fill pricing presets and model options
  const watchedProvider = Form.useWatch('provider', form)
  const modelOptions = presets[watchedProvider]?.models?.map(m => ({ label: m, value: m })) ?? []

  function onProviderChange(p: string) {
    const pr = presets[p]
    if (pr) {
      const firstModel = pr.models[0] ?? ''
      const modelPrice = firstModel && pr.pricing?.[firstModel]
      form.setFieldsValue({
        model: firstModel,
        inputPricePerM:  modelPrice ? modelPrice.input  : pr.inputPricePerM,
        outputPricePerM: modelPrice ? modelPrice.output : pr.outputPricePerM,
      })
    }
  }

  function onModelChange(model: string) {
    const provider = form.getFieldValue('provider')
    const pr = presets[provider]
    if (pr?.pricing?.[model]) {
      form.setFieldsValue({
        inputPricePerM:  pr.pricing[model].input,
        outputPricePerM: pr.pricing[model].output,
      })
    } else if (pr) {
      form.setFieldsValue({ inputPricePerM: pr.inputPricePerM, outputPricePerM: pr.outputPricePerM })
    }
  }

  function resetPriceToPreset() {
    const provider = form.getFieldValue('provider')
    const model    = form.getFieldValue('model')
    const pr = presets[provider]
    if (!pr) return
    const modelPrice = model && pr.pricing?.[model]
    form.setFieldsValue({
      inputPricePerM:  modelPrice ? modelPrice.input  : pr.inputPricePerM,
      outputPricePerM: modelPrice ? modelPrice.output : pr.outputPricePerM,
    })
  }

  const columns: ColumnsType<AIConfig> = [
    {
      title: 'Tên / Provider',
      key:   'name',
      render: (_, cfg) => (
        <div className="flex items-center gap-2">
          {cfg.isDefault && <StarFilled className="text-yellow-400 text-xs" />}
          <div>
            <div className="font-medium text-sm">{cfg.name}</div>
            <Tag color={PROVIDER_COLORS[cfg.provider]} className="text-xs mt-0.5">
              {PROVIDER_ICONS[cfg.provider]} {cfg.provider}
            </Tag>
          </div>
        </div>
      ),
    },
    {
      title: 'Model',
      dataIndex: 'model',
      key:   'model',
      render: m => m ? <code className="text-xs bg-[var(--bg-secondary)] px-1 rounded">{m}</code> : <span className="text-neutral-300">—</span>,
    },
    {
      title: 'Giá (USD / 1M tokens)',
      key:   'price',
      width: 180,
      render: (_, cfg) => (
        <div className="text-xs space-y-0.5">
          <div><span className="text-neutral-400">Input:</span> <span className="font-mono">${cfg.inputPricePerM}</span></div>
          <div><span className="text-neutral-400">Output:</span> <span className="font-mono">${cfg.outputPricePerM}</span></div>
        </div>
      ),
    },
    {
      title: 'Chi phí tích lũy',
      key:   'cost',
      width: 140,
      render: (_, cfg) => (
        <div className="text-xs">
          <div className="font-semibold text-orange-600">${cfg.totalCostUsd.toFixed(4)}</div>
          <div className="text-neutral-400">{(cfg.totalInputTokens + cfg.totalOutputTokens).toLocaleString()} tokens</div>
        </div>
      ),
    },
    {
      title: <Space size={4}><WalletOutlined /> Credit</Space>,
      key:   'credit',
      width: 160,
      render: (_, cfg) => {
        const cr = credits[cfg._id]
        if (!cr) return <Tooltip title="Chưa có credit account — nhấn Nạp để tạo"><Tag>—</Tag></Tooltip>
        const isLow = cr.balance <= cr.alertThreshold
        return (
          <div className="text-xs space-y-1">
            <div className={`font-semibold ${isLow ? 'text-red-500' : 'text-green-600'}`}>
              ${cr.balance.toFixed(4)}
              {isLow && <Tooltip title="Số dư thấp"><span className="ml-1 text-red-400">⚠</span></Tooltip>}
            </div>
            <div className="text-neutral-400">Dùng: ${cr.totalUsed.toFixed(4)}</div>
            <Tooltip title={cr.blockOnZero ? 'Chặn khi hết số dư — nhấn để tắt' : 'Không chặn — nhấn để bật chặn'}>
              <Switch
                size="small"
                checked={cr.blockOnZero}
                checkedChildren="Chặn"
                unCheckedChildren="Tự do"
                onChange={() => handleToggleBlockOnZero(cfg._id, cr.blockOnZero)}
              />
            </Tooltip>
          </div>
        )
      },
    },
    {
      title: 'Trạng thái',
      key:   'status',
      width: 90,
      render: (_, cfg) => <Badge status={cfg.status === 'active' ? 'success' : 'default'} text={cfg.status} />,
    },
    {
      title: '',
      key:   'actions',
      width: 160,
      render: (_, cfg) => (
        <Space wrap size={4}>
          {!cfg.isDefault && (
            <Tooltip title="Đặt làm mặc định">
              <Button size="small" icon={<StarOutlined />} onClick={() => handleSetDefault(cfg._id)} />
            </Tooltip>
          )}
          <Tooltip title="Nạp credit">
            <Button size="small" icon={<DollarOutlined />} onClick={() => { setDepositAmount(10); setDepositModal({ open: true, configId: cfg._id, configName: cfg.name }) }} />
          </Tooltip>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(cfg)}>Sửa</Button>
          <Popconfirm title="Xoá config này?" okText="Xoá" cancelText="Huỷ" okButtonProps={{ danger: true }} onConfirm={() => handleDelete(cfg._id)}>
            <Button size="small" danger>Xoá</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const defaultCfg = configs.find(c => c.isDefault)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <RobotOutlined className="text-xl text-purple-500" />
          <div>
            <Title level={4} className="!mb-0">Quản lý AI API</Title>
            <Text className="text-neutral-400 text-xs">Cấu hình nhiều provider AI — OpenAI, Anthropic, Google, Groq…</Text>
          </div>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading} />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Thêm provider</Button>
        </Space>
      </div>

      {defaultCfg && (
        <div className="mb-4">
          <Card size="small" title={<Space><StarFilled className="text-yellow-400" /><span>Provider mặc định</span></Space>}>
            <div className="space-y-1">
              <div className="font-medium">{defaultCfg.name}</div>
              <Tag color={PROVIDER_COLORS[defaultCfg.provider]}>{PROVIDER_ICONS[defaultCfg.provider]} {defaultCfg.provider}</Tag>
              {defaultCfg.model && <code className="text-xs bg-[var(--bg-secondary)] px-1 rounded block w-fit">{defaultCfg.model}</code>}
              <Text className="text-xs text-neutral-400 block">
                Tổng chi phí: <span className="text-orange-600 font-semibold">${defaultCfg.totalCostUsd.toFixed(4)}</span>
              </Text>
            </div>
          </Card>
        </div>
      )}

      <Card>
        <Table
          dataSource={configs}
          columns={columns}
          rowKey="_id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          rowClassName={r => r.isDefault ? 'bg-yellow-50' : ''}
          locale={{ emptyText: 'Chưa có AI config. Nhấn "Thêm provider" để bắt đầu.' }}
        />
      </Card>

      {/* Create / Edit Modal */}
      <Modal
        title={modal.editing ? `Sửa: ${modal.editing.name}` : 'Thêm AI Provider'}
        open={modal.open}
        onCancel={() => setModal({ open: false })}
        onOk={handleSave}
        okText={modal.editing ? 'Cập nhật' : 'Thêm'}
        confirmLoading={saving}
        width={560}
        forceRender
      >
        <Form form={form} layout="vertical" size="small" className="mt-4">
          <Form.Item name="name" label="Tên hiển thị" rules={[{ required: true }]}>
            <Input placeholder="VD: OpenAI Production, Anthropic Dev…" />
          </Form.Item>

          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="provider" label="Provider" rules={[{ required: true }]}>
              <Select
                options={Object.keys(presets).length > 0
                  ? Object.keys(presets).map(p => ({ label: `${PROVIDER_ICONS[p]} ${p}`, value: p }))
                  : ['openai','anthropic','google','groq','mistral','nvidia','ollama','vertex','alibaba','cerebras','together','fireworks','replicate','custom'].map(p => ({ label: `${PROVIDER_ICONS[p] ?? '⚙️'} ${p}`, value: p }))
                }
                onChange={onProviderChange}
              />
            </Form.Item>
            <Form.Item name="model" label="Model mặc định">
              {modelOptions.length > 0
                ? <Select options={modelOptions} allowClear showSearch onChange={onModelChange} />
                : <Input placeholder="gpt-4o, claude-3-5-sonnet…" />
              }
            </Form.Item>
          </div>

          <Form.Item
            name="apiKey" label="API Key"
            tooltip={modal.editing ? 'Để trống = giữ nguyên key hiện tại' : undefined}
          >
            <Input.Password placeholder={modal.editing ? '(giữ nguyên nếu để trống)' : 'sk-…'} className="font-mono" />
          </Form.Item>

          <Form.Item
            name="baseUrl"
            label="Base URL (tuỳ chọn, cho self-hosted)"
            tooltip="Ollama: http://ollama:11434/v1 (docker) hoặc http://localhost:11434/v1 (local dev). NVIDIA NIM: https://integrate.api.nvidia.com/v1"
          >
            <Input placeholder="https://api.openai.com/v1" className="font-mono" />
          </Form.Item>

          {/* Vertex AI — Google Cloud service account auth (roadmap Giai đoạn 2) */}
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.provider !== cur.provider}>
            {({ getFieldValue }) => getFieldValue('provider') === 'vertex' && (
              <div className="rounded border border-dashed p-3 mb-3" style={{ borderColor: 'var(--border-color)' }}>
                <div className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                  ☁️ Vertex AI dùng GCP service account thay vì API key. Giai đoạn 2 roadmap.
                </div>
                <Form.Item name="gcpProjectId" label="GCP Project ID" className="!mb-2">
                  <Input placeholder="my-gcp-project-123456" className="font-mono" />
                </Form.Item>
                <Form.Item name="gcpLocation" label="Region" className="!mb-2">
                  <Input placeholder="us-central1 / asia-southeast1 / europe-west4" className="font-mono" />
                </Form.Item>
                <Form.Item
                  name="gcpServiceAccountJson"
                  label="Service Account JSON"
                  tooltip="Paste toàn bộ JSON từ GCP Console → IAM → Service Accounts → Keys → Add key → JSON. Sẽ được encrypt ở Giai đoạn 10."
                  className="!mb-0"
                >
                  <Input.TextArea rows={4} placeholder='{"type": "service_account", "project_id": "...", ...}' className="font-mono text-xs" />
                </Form.Item>
              </div>
            )}
          </Form.Item>

          <Divider className="my-2">
            <Space size={4}>
              <span className="text-xs text-neutral-500">Giá (USD per 1M tokens)</span>
              <Tooltip title="Reset về giá preset theo model/provider đang chọn">
                <Button size="small" type="link" className="text-xs !px-0" onClick={resetPriceToPreset}>
                  Reset to preset
                </Button>
              </Tooltip>
            </Space>
          </Divider>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="inputPricePerM" label="Input price">
              <InputNumber min={0} step={0.01} precision={4} prefix="$" className="w-full" />
            </Form.Item>
            <Form.Item name="outputPricePerM" label="Output price">
              <InputNumber min={0} step={0.01} precision={4} prefix="$" className="w-full" />
            </Form.Item>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="status" label="Trạng thái">
              <Select options={[{ label: 'Active', value: 'active' }, { label: 'Inactive', value: 'inactive' }]} />
            </Form.Item>
            <Form.Item name="isDefault" label="Mặc định" valuePropName="checked">
              <Switch checkedChildren="Mặc định" unCheckedChildren="Phụ" />
            </Form.Item>
          </div>

          <Form.Item name="notes" label="Ghi chú">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
      {/* Deposit Modal */}
      <Modal
        title={<Space><DollarOutlined className="text-green-500" />Nạp Credit — {depositModal.configName}</Space>}
        open={depositModal.open}
        onCancel={() => setDepositModal({ open: false })}
        onOk={handleDeposit}
        okText="Nạp tiền"
        okButtonProps={{ icon: <DollarOutlined /> }}
        width={360}
        forceRender
      >
        <div className="space-y-3 mt-3">
          <div className="text-sm text-neutral-500">
            Nhập số tiền (USD) để nạp vào credit account. Số dư sẽ được trừ dần theo lượng token AI sử dụng.
          </div>
          <div>
            <div className="text-xs font-medium mb-1">Số tiền (USD)</div>
            <InputNumber
              min={0.01} step={1} precision={2} prefix="$"
              value={depositAmount}
              onChange={v => setDepositAmount(v ?? 0)}
              className="w-full"
              size="large"
            />
          </div>
          <Space className="flex flex-wrap gap-1">
            {[5, 10, 20, 50, 100].map(amt => (
              <Button key={amt} size="small" onClick={() => setDepositAmount(amt)}>${amt}</Button>
            ))}
          </Space>
          {credits[depositModal.configId ?? ''] && (
            <Alert
              type="info"
              showIcon
              message={`Số dư hiện tại: $${credits[depositModal.configId!].balance.toFixed(4)}`}
            />
          )}
        </div>
      </Modal>

      <TourGuide pageKey="settings-ai" steps={tourSteps['settings-ai']} />
    </div>
  )
}
