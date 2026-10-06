'use client'

import {
  Alert, Badge, Button, Card, Col, Collapse, Divider, Drawer, Empty, Form,
  Input, InputNumber, List, message, Modal, Popconfirm, Row, Select, Space,
  Spin, Switch, Tag, Tooltip, Typography,
} from 'antd'
import {
  ApartmentOutlined, ArrowDownOutlined, BellOutlined, ClockCircleOutlined,
  CopyOutlined, DeleteOutlined, EditOutlined, ExportOutlined,
  FieldTimeOutlined, FileTextOutlined, FilterOutlined, GlobalOutlined,
  MinusCircleOutlined, PlusOutlined, ReloadOutlined, SaveOutlined,
  SearchOutlined, ThunderboltOutlined,
} from '@ant-design/icons'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCommon } from '../_lib/useCommon'
import { FIELD_TYPES, TYPE_COLOR, API_BASE } from '../_lib/constants'
import type { LarkBase } from '../_lib/types'
import { getLarkTables, getLarkFields } from '@/lib/api'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input
const { Panel } = Collapse

// ── Constants ────────────────────────────────────────────────────────────────

const WF_API = `${API_BASE}/workflow-drafts`

const TRIGGER_TYPES = [
  { value: 'record_created', label: 'Khi tạo record mới', icon: <PlusOutlined /> },
  { value: 'record_updated', label: 'Khi cập nhật record', icon: <EditOutlined /> },
  { value: 'field_changed', label: 'Khi field thay đổi', icon: <FieldTimeOutlined /> },
  { value: 'record_deleted', label: 'Khi xóa record', icon: <DeleteOutlined /> },
  { value: 'schedule', label: 'Theo lịch trình', icon: <ClockCircleOutlined /> },
  { value: 'button_click', label: 'Khi nhấn nút', icon: <ThunderboltOutlined /> },
]

const ACTION_TYPES = [
  { value: 'update_record', label: 'Cập nhật record' },
  { value: 'create_record', label: 'Tạo record mới' },
  { value: 'find_and_update', label: 'Tìm & cập nhật' },
  { value: 'send_notification', label: 'Gửi thông báo' },
  { value: 'call_webhook', label: 'Gọi webhook' },
  { value: 'delay', label: 'Chờ (delay)' },
  { value: 'condition_branch', label: 'Rẽ nhánh điều kiện' },
]

const OPERATORS_BY_TYPE: Record<string, { value: string; label: string }[]> = {
  Text: [
    { value: 'eq', label: '=' }, { value: 'neq', label: '≠' },
    { value: 'contains', label: 'Chứa' }, { value: 'not_contains', label: 'Không chứa' },
    { value: 'starts_with', label: 'Bắt đầu bằng' }, { value: 'ends_with', label: 'Kết thúc bằng' },
    { value: 'is_empty', label: 'Trống' }, { value: 'is_not_empty', label: 'Không trống' },
  ],
  Number: [
    { value: 'eq', label: '=' }, { value: 'neq', label: '≠' },
    { value: 'gt', label: '>' }, { value: 'gte', label: '≥' },
    { value: 'lt', label: '<' }, { value: 'lte', label: '≤' },
    { value: 'between', label: 'Trong khoảng' },
    { value: 'is_empty', label: 'Trống' }, { value: 'is_not_empty', label: 'Không trống' },
  ],
  'Single select': [
    { value: 'eq', label: '=' }, { value: 'neq', label: '≠' },
    { value: 'in', label: 'Thuộc' }, { value: 'not_in', label: 'Không thuộc' },
    { value: 'is_empty', label: 'Trống' }, { value: 'is_not_empty', label: 'Không trống' },
  ],
  'Multi select': [
    { value: 'has_any', label: 'Có ít nhất 1' }, { value: 'has_all', label: 'Có tất cả' },
    { value: 'is_empty', label: 'Trống' }, { value: 'is_not_empty', label: 'Không trống' },
  ],
  Date: [
    { value: 'eq', label: '=' }, { value: 'before', label: 'Trước' }, { value: 'after', label: 'Sau' },
    { value: 'between', label: 'Trong khoảng' }, { value: 'is_today', label: 'Là hôm nay' },
    { value: 'in_last_n_days', label: 'Trong N ngày qua' },
    { value: 'is_empty', label: 'Trống' }, { value: 'is_not_empty', label: 'Không trống' },
  ],
  Checkbox: [
    { value: 'is_true', label: 'Có' }, { value: 'is_false', label: 'Không' },
  ],
  Person: [
    { value: 'eq', label: '=' }, { value: 'is_current_user', label: 'Là người hiện tại' },
    { value: 'is_empty', label: 'Trống' }, { value: 'is_not_empty', label: 'Không trống' },
  ],
  _default: [
    { value: 'eq', label: '=' }, { value: 'neq', label: '≠' },
    { value: 'is_empty', label: 'Trống' }, { value: 'is_not_empty', label: 'Không trống' },
  ],
}

const NO_VALUE_OPS = ['is_empty', 'is_not_empty', 'is_today', 'is_true', 'is_false', 'is_current_user']

const CHANNEL_OPTIONS = [
  { value: 'lark_bot', label: 'Lark Bot' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'email', label: 'Email' },
  { value: 'webhook', label: 'Webhook' },
]

const STATUS_COLORS: Record<string, string> = {
  draft: 'blue', reviewed: 'green', archived: 'default',
}

// ── Types ────────────────────────────────────────────────────────────────────

type SchemaField = { name: string; type: number; typeName: string; isPrimary: boolean }
type SchemaTable = { tableName: string; tableId: string; fields: SchemaField[] }
type ConditionRule = { field: string; fieldType: string; operator: string; value: any; value2?: any }
type ConditionGroup = { logic: 'AND' | 'OR'; rules: ConditionRule[] }
type FieldMapping = { field: string; value: string }
type WfAction = {
  _id?: string; type: string; label: string; order: number
  targetTable: string; fieldMappings: FieldMapping[]
  findCondition: ConditionGroup | null
  channel: string; template: string
  webhookUrl: string; webhookMethod: string; webhookPayload: string
  delayMinutes: number
  branches: any[]
}
type WfTrigger = {
  type: string; tableName: string; tableId: string
  watchFields: string[]; schedule: string; description: string
}
type Workflow = {
  _id?: string; name: string; description: string; status: string
  appToken: string; baseName: string; accountId: string | null
  schemaSnapshot: SchemaTable[]
  trigger: WfTrigger
  conditions: ConditionGroup[]
  actions: WfAction[]
  notes: string; tags: string[]
  createdAt?: string; updatedAt?: string
}

const emptyTrigger = (): WfTrigger => ({
  type: 'record_created', tableName: '', tableId: '', watchFields: [], schedule: '', description: '',
})
const emptyConditionGroup = (): ConditionGroup => ({ logic: 'AND', rules: [] })
const emptyRule = (): ConditionRule => ({ field: '', fieldType: '', operator: 'eq', value: '' })
const emptyAction = (order: number): WfAction => ({
  type: 'update_record', label: '', order,
  targetTable: '', fieldMappings: [],
  findCondition: null,
  channel: '', template: '',
  webhookUrl: '', webhookMethod: 'POST', webhookPayload: '',
  delayMinutes: 0, branches: [],
})
const emptyWorkflow = (): Workflow => ({
  name: '', description: '', status: 'draft',
  appToken: '', baseName: '', accountId: null,
  schemaSnapshot: [],
  trigger: emptyTrigger(),
  conditions: [],
  actions: [],
  notes: '', tags: [],
})

// ── Component ────────────────────────────────────────────────────────────────

export default function WorkflowsPage() {
  const {
    userToken, bases, loadingBases, basesError,
    larkAccounts, selectedAccountId, setSelectedAccountId,
    handleLogin, handleLogout,
  } = useCommon()

  // ── List state ─────────────────────────────────────────────────────────────
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(false)
  const [filterBase, setFilterBase] = useState<string>('')
  const [search, setSearch] = useState('')

  // ── Editor state ───────────────────────────────────────────────────────────
  const [editing, setEditing] = useState<Workflow | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // ── Schema loading ─────────────────────────────────────────────────────────
  const [schemaLoading, setSchemaLoading] = useState(false)
  const [tables, setTables] = useState<{ tableId: string; name: string }[]>([])

  // ── Export ─────────────────────────────────────────────────────────────────
  const [exportText, setExportText] = useState('')
  const [exportModal, setExportModal] = useState(false)

  // ── Load workflows ─────────────────────────────────────────────────────────
  const loadWorkflows = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterBase) params.set('appToken', filterBase)
      const res = await fetch(`${WF_API}?${params}`)
      const json = await res.json()
      if (json.success) setWorkflows(json.data)
      else message.error(json.error)
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [filterBase])

  useEffect(() => { loadWorkflows() }, [loadWorkflows])

  // ── Schema helpers ─────────────────────────────────────────────────────────
  const loadSchemaForBase = useCallback(async (appToken: string) => {
    if (!appToken) return
    setSchemaLoading(true)
    try {
      const tablesRes = await getLarkTables(appToken)
      const tbls = tablesRes.data as { tableId: string; name: string }[]
      setTables(tbls)

      const snapshot: SchemaTable[] = []
      for (const tbl of tbls) {
        try {
          const fieldsRes = await getLarkFields(appToken, tbl.tableId)
          snapshot.push({
            tableName: tbl.name,
            tableId: tbl.tableId,
            fields: (fieldsRes.data || []).map((f: any) => ({
              name: f.name || f.field_name,
              type: f.type,
              typeName: FIELD_TYPES.find(ft => ft.value === f.type)?.label || `Type ${f.type}`,
              isPrimary: f.isPrimary || f.is_primary || false,
            })),
          })
        } catch {
          snapshot.push({ tableName: tbl.name, tableId: tbl.tableId, fields: [] })
        }
      }
      return snapshot
    } catch (e: any) {
      message.error(`Lỗi tải schema: ${e.message}`)
      return []
    } finally {
      setSchemaLoading(false)
    }
  }, [])

  // ── All fields from schema snapshot (for condition/action pickers) ────────
  const allFields = useMemo(() => {
    if (!editing?.schemaSnapshot) return []
    return editing.schemaSnapshot.flatMap(t =>
      t.fields.map(f => ({ ...f, tableName: t.tableName }))
    )
  }, [editing?.schemaSnapshot])

  const tableNames = useMemo(() => {
    if (!editing?.schemaSnapshot) return []
    return editing.schemaSnapshot.map(t => t.tableName)
  }, [editing?.schemaSnapshot])

  const fieldsForTable = useCallback((tableName: string) => {
    if (!editing?.schemaSnapshot) return []
    const tbl = editing.schemaSnapshot.find(t => t.tableName === tableName)
    return tbl?.fields || []
  }, [editing?.schemaSnapshot])

  const getOperators = useCallback((typeName: string) => {
    return OPERATORS_BY_TYPE[typeName] || OPERATORS_BY_TYPE._default
  }, [])

  // ── CRUD ───────────────────────────────────────────────────────────────────
  const openNew = () => {
    setEditing(emptyWorkflow())
    setDrawerOpen(true)
  }

  const openEdit = async (wf: Workflow) => {
    // Load full data with schema
    try {
      const res = await fetch(`${WF_API}/${wf._id}`)
      const json = await res.json()
      if (json.success) {
        setEditing(json.data)
        setDrawerOpen(true)
      }
    } catch (e: any) {
      message.error(e.message)
    }
  }

  const saveWorkflow = async () => {
    if (!editing) return
    if (!editing.name.trim()) return message.warning('Cần nhập tên workflow')
    setSaving(true)
    try {
      const isNew = !editing._id
      const url = isNew ? WF_API : `${WF_API}/${editing._id}`
      const method = isNew ? 'POST' : 'PUT'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      })
      const json = await res.json()
      if (json.success) {
        message.success(isNew ? 'Tạo workflow thành công' : 'Đã lưu')
        setEditing(json.data)
        loadWorkflows()
      } else {
        message.error(json.error)
      }
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const deleteWorkflow = async (id: string) => {
    try {
      const res = await fetch(`${WF_API}/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.success) {
        message.success('Đã xóa')
        loadWorkflows()
        if (editing?._id === id) { setEditing(null); setDrawerOpen(false) }
      }
    } catch (e: any) {
      message.error(e.message)
    }
  }

  const duplicateWorkflow = async (id: string) => {
    try {
      const res = await fetch(`${WF_API}/${id}/duplicate`, { method: 'POST' })
      const json = await res.json()
      if (json.success) {
        message.success('Đã nhân bản')
        loadWorkflows()
      }
    } catch (e: any) {
      message.error(e.message)
    }
  }

  const exportSingle = async (id: string) => {
    try {
      const res = await fetch(`${WF_API}/${id}/export-text`)
      const json = await res.json()
      if (json.success) {
        setExportText(json.data.text)
        setExportModal(true)
      }
    } catch (e: any) {
      message.error(e.message)
    }
  }

  const exportBatch = async () => {
    if (!filterBase) return message.warning('Chọn base để export tất cả workflows')
    try {
      const res = await fetch(`${WF_API}/export-text/batch?appToken=${filterBase}`)
      const json = await res.json()
      if (json.success) {
        setExportText(json.data.text)
        setExportModal(true)
      }
    } catch (e: any) {
      message.error(e.message)
    }
  }

  // ── Editor helpers ─────────────────────────────────────────────────────────
  const updateEditing = (patch: Partial<Workflow>) => {
    setEditing(prev => prev ? { ...prev, ...patch } : prev)
  }

  const updateTrigger = (patch: Partial<WfTrigger>) => {
    setEditing(prev => prev ? { ...prev, trigger: { ...prev.trigger, ...patch } } : prev)
  }

  const updateConditionGroup = (gi: number, patch: Partial<ConditionGroup>) => {
    setEditing(prev => {
      if (!prev) return prev
      const groups = [...prev.conditions]
      groups[gi] = { ...groups[gi], ...patch }
      return { ...prev, conditions: groups }
    })
  }

  const updateRule = (gi: number, ri: number, patch: Partial<ConditionRule>) => {
    setEditing(prev => {
      if (!prev) return prev
      const groups = [...prev.conditions]
      const rules = [...groups[gi].rules]
      rules[ri] = { ...rules[ri], ...patch }
      groups[gi] = { ...groups[gi], rules }
      return { ...prev, conditions: groups }
    })
  }

  const addConditionGroup = () => {
    setEditing(prev => prev ? { ...prev, conditions: [...prev.conditions, emptyConditionGroup()] } : prev)
  }

  const removeConditionGroup = (gi: number) => {
    setEditing(prev => {
      if (!prev) return prev
      return { ...prev, conditions: prev.conditions.filter((_, i) => i !== gi) }
    })
  }

  const addRule = (gi: number) => {
    setEditing(prev => {
      if (!prev) return prev
      const groups = [...prev.conditions]
      groups[gi] = { ...groups[gi], rules: [...groups[gi].rules, emptyRule()] }
      return { ...prev, conditions: groups }
    })
  }

  const removeRule = (gi: number, ri: number) => {
    setEditing(prev => {
      if (!prev) return prev
      const groups = [...prev.conditions]
      groups[gi] = { ...groups[gi], rules: groups[gi].rules.filter((_, i) => i !== ri) }
      return { ...prev, conditions: groups }
    })
  }

  const updateAction = (ai: number, patch: Partial<WfAction>) => {
    setEditing(prev => {
      if (!prev) return prev
      const actions = [...prev.actions]
      actions[ai] = { ...actions[ai], ...patch }
      return { ...prev, actions }
    })
  }

  const addAction = () => {
    setEditing(prev => {
      if (!prev) return prev
      return { ...prev, actions: [...prev.actions, emptyAction(prev.actions.length)] }
    })
  }

  const removeAction = (ai: number) => {
    setEditing(prev => {
      if (!prev) return prev
      return { ...prev, actions: prev.actions.filter((_, i) => i !== ai) }
    })
  }

  const addFieldMapping = (ai: number) => {
    setEditing(prev => {
      if (!prev) return prev
      const actions = [...prev.actions]
      actions[ai] = { ...actions[ai], fieldMappings: [...actions[ai].fieldMappings, { field: '', value: '' }] }
      return { ...prev, actions }
    })
  }

  const updateFieldMapping = (ai: number, fi: number, patch: Partial<FieldMapping>) => {
    setEditing(prev => {
      if (!prev) return prev
      const actions = [...prev.actions]
      const fms = [...actions[ai].fieldMappings]
      fms[fi] = { ...fms[fi], ...patch }
      actions[ai] = { ...actions[ai], fieldMappings: fms }
      return { ...prev, actions }
    })
  }

  const removeFieldMapping = (ai: number, fi: number) => {
    setEditing(prev => {
      if (!prev) return prev
      const actions = [...prev.actions]
      actions[ai] = { ...actions[ai], fieldMappings: actions[ai].fieldMappings.filter((_, i) => i !== fi) }
      return { ...prev, actions }
    })
  }

  // ── Ctrl+S ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && drawerOpen && editing) {
        e.preventDefault()
        saveWorkflow()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen, editing])

  // ── Filtered list ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = workflows
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(w => w.name.toLowerCase().includes(q) || w.description?.toLowerCase().includes(q))
    }
    return list
  }, [workflows, search])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <Title level={3} style={{ margin: 0 }}>
        <ApartmentOutlined /> Workflow & Automation Builder
      </Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
        Phác thảo workflows giống Lark — lưu persistent, xuất text làm prompt/đặc tả
      </Text>

      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <Row gutter={12} style={{ marginBottom: 16 }} align="middle">
        <Col flex="auto">
          <Space wrap>
            <Select
              allowClear
              showSearch
              placeholder="Lọc theo Base"
              style={{ minWidth: 240 }}
              value={filterBase || undefined}
              onChange={v => setFilterBase(v || '')}
              optionFilterProp="label"
              options={bases.map(b => ({ value: b.appToken, label: b.name }))}
            />
            <Input
              prefix={<SearchOutlined />}
              placeholder="Tìm workflow..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: 220 }}
              allowClear
            />
          </Space>
        </Col>
        <Col>
          <Space>
            {filterBase && (
              <Button icon={<ExportOutlined />} onClick={exportBatch}>
                Export tất cả
              </Button>
            )}
            <Button icon={<ReloadOutlined />} onClick={loadWorkflows} />
            <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>
              Tạo workflow
            </Button>
          </Space>
        </Col>
      </Row>

      {/* ── List ─────────────────────────────────────────────────────────────── */}
      <Spin spinning={loading}>
        {filtered.length === 0 && !loading ? (
          <Empty description="Chưa có workflow nào" style={{ marginTop: 60 }}>
            <Button type="primary" onClick={openNew}>Tạo workflow đầu tiên</Button>
          </Empty>
        ) : (
          <List
            grid={{ gutter: 16, xs: 1, sm: 1, md: 2, lg: 2, xl: 3, xxl: 3 }}
            dataSource={filtered}
            renderItem={wf => (
              <List.Item>
                <Card
                  hoverable
                  size="small"
                  style={{ borderLeft: `3px solid var(--accent-color)` }}
                  title={
                    <Space>
                      <ApartmentOutlined />
                      <Text strong style={{ maxWidth: 180 }} ellipsis={{ tooltip: wf.name }}>{wf.name}</Text>
                      <Tag color={STATUS_COLORS[wf.status]}>{wf.status}</Tag>
                    </Space>
                  }
                  extra={
                    <Space size={4}>
                      <Tooltip title="Sửa">
                        <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(wf)} />
                      </Tooltip>
                      <Tooltip title="Nhân bản">
                        <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => duplicateWorkflow(wf._id!)} />
                      </Tooltip>
                      <Tooltip title="Export text">
                        <Button size="small" type="text" icon={<FileTextOutlined />} onClick={() => exportSingle(wf._id!)} />
                      </Tooltip>
                      <Popconfirm title="Xóa workflow này?" onConfirm={() => deleteWorkflow(wf._id!)}>
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  }
                >
                  {wf.baseName && <div><Text type="secondary" style={{ fontSize: 12 }}>Base: {wf.baseName}</Text></div>}
                  {wf.description && <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ fontSize: 13, margin: '4px 0' }}>{wf.description}</Paragraph>}
                  <Space size={4} wrap style={{ marginTop: 4 }}>
                    <Tag color="blue">{TRIGGER_TYPES.find(t => t.value === wf.trigger?.type)?.label || wf.trigger?.type}</Tag>
                    {wf.trigger?.tableName && <Tag>{wf.trigger.tableName}</Tag>}
                    {(wf as any).actions?.length > 0 && <Tag color="green">{(wf as any).actions.length} action(s)</Tag>}
                  </Space>
                  {wf.tags?.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      {wf.tags.map(t => <Tag key={t} style={{ fontSize: 11 }}>{t}</Tag>)}
                    </div>
                  )}
                  <div style={{ marginTop: 6 }}>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      Cập nhật: {wf.updatedAt ? new Date(wf.updatedAt).toLocaleString('vi') : '—'}
                    </Text>
                  </div>
                </Card>
              </List.Item>
            )}
          />
        )}
      </Spin>

      {/* ── Editor Drawer ─────────────────────────────────────────────────────── */}
      <Drawer
        title={editing?._id ? `Sửa: ${editing.name}` : 'Tạo Workflow mới'}
        placement="right"
        width={Math.min(800, typeof window !== 'undefined' ? window.innerWidth - 40 : 800)}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        extra={
          <Space>
            <Tooltip title="Ctrl+S">
              <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={saveWorkflow}>
                Lưu
              </Button>
            </Tooltip>
          </Space>
        }
        styles={{ body: { paddingBottom: 80, background: 'var(--bg-color)' } }}
      >
        {editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* ── Basic info ──────────────────────────────────────────────────── */}
            <Card size="small" title="Thông tin cơ bản">
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                <Input
                  placeholder="Tên workflow *"
                  value={editing.name}
                  onChange={e => updateEditing({ name: e.target.value })}
                  size="large"
                  style={{ fontWeight: 600 }}
                />
                <TextArea
                  placeholder="Mô tả workflow (tùy chọn)"
                  value={editing.description}
                  onChange={e => updateEditing({ description: e.target.value })}
                  autoSize={{ minRows: 1, maxRows: 3 }}
                />
                <Row gutter={8}>
                  <Col span={16}>
                    <Select
                      showSearch
                      allowClear
                      placeholder="Chọn Base (tùy chọn — hoặc nhập thủ công)"
                      style={{ width: '100%' }}
                      value={editing.appToken || undefined}
                      optionFilterProp="label"
                      options={bases.map(b => ({ value: b.appToken, label: b.name }))}
                      onChange={async (v) => {
                        const base = bases.find(b => b.appToken === v)
                        updateEditing({ appToken: v || '', baseName: base?.name || '' })
                        if (v) {
                          const snapshot = await loadSchemaForBase(v)
                          if (snapshot) updateEditing({ schemaSnapshot: snapshot, appToken: v, baseName: base?.name || '' })
                        }
                      }}
                    />
                  </Col>
                  <Col span={8}>
                    <Select
                      value={editing.status}
                      onChange={v => updateEditing({ status: v })}
                      style={{ width: '100%' }}
                      options={[
                        { value: 'draft', label: 'Draft' },
                        { value: 'reviewed', label: 'Reviewed' },
                        { value: 'archived', label: 'Archived' },
                      ]}
                    />
                  </Col>
                </Row>
                {!editing.appToken && (
                  <Input
                    placeholder="Hoặc nhập tên base thủ công"
                    value={editing.baseName}
                    onChange={e => updateEditing({ baseName: e.target.value })}
                  />
                )}
                {schemaLoading && <Spin size="small"><Text type="secondary">Đang tải schema...</Text></Spin>}
                {editing.schemaSnapshot.length > 0 && (
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Schema: {editing.schemaSnapshot.length} bảng, {editing.schemaSnapshot.reduce((s, t) => s + t.fields.length, 0)} fields
                    </Text>
                  </div>
                )}
              </Space>
            </Card>

            {/* ── Trigger ─────────────────────────────────────────────────────── */}
            <Card
              size="small"
              title={<><ThunderboltOutlined style={{ color: 'var(--accent-color)' }} /> Trigger</>}
            >
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                <Select
                  value={editing.trigger.type}
                  onChange={v => updateTrigger({ type: v })}
                  style={{ width: '100%' }}
                  options={TRIGGER_TYPES.map(t => ({ value: t.value, label: t.label }))}
                />
                <Select
                  showSearch
                  allowClear
                  placeholder="Bảng trigger"
                  style={{ width: '100%' }}
                  value={editing.trigger.tableName || undefined}
                  onChange={v => updateTrigger({ tableName: v || '' })}
                  optionFilterProp="label"
                >
                  {tableNames.map(tn => (
                    <Select.Option key={tn} value={tn} label={tn}>{tn}</Select.Option>
                  ))}
                  {/* Allow manual input if no schema loaded */}
                  {editing.trigger.tableName && !tableNames.includes(editing.trigger.tableName) && (
                    <Select.Option key="__custom" value={editing.trigger.tableName} label={editing.trigger.tableName}>
                      {editing.trigger.tableName} (thủ công)
                    </Select.Option>
                  )}
                </Select>
                {/* Allow typing custom table name */}
                {tableNames.length === 0 && (
                  <Input
                    placeholder="Nhập tên bảng trigger (thủ công)"
                    value={editing.trigger.tableName}
                    onChange={e => updateTrigger({ tableName: e.target.value })}
                  />
                )}
                {editing.trigger.type === 'field_changed' && (
                  <Select
                    mode="tags"
                    placeholder="Fields theo dõi"
                    style={{ width: '100%' }}
                    value={editing.trigger.watchFields}
                    onChange={v => updateTrigger({ watchFields: v })}
                    options={
                      fieldsForTable(editing.trigger.tableName).map(f => ({ value: f.name, label: `${f.name} (${f.typeName})` }))
                    }
                  />
                )}
                {editing.trigger.type === 'schedule' && (
                  <Input
                    placeholder="Cron expression (VD: 0 9 * * 1-5)"
                    value={editing.trigger.schedule}
                    onChange={e => updateTrigger({ schedule: e.target.value })}
                  />
                )}
                <Input
                  placeholder="Ghi chú trigger (tùy chọn)"
                  value={editing.trigger.description}
                  onChange={e => updateTrigger({ description: e.target.value })}
                />
              </Space>
            </Card>

            {/* ── Conditions ──────────────────────────────────────────────────── */}
            <Card
              size="small"
              title={<><FilterOutlined style={{ color: '#faad14' }} /> Điều kiện</>}
              extra={<Button size="small" icon={<PlusOutlined />} onClick={addConditionGroup}>Thêm nhóm</Button>}
            >
              {editing.conditions.length === 0 && (
                <Text type="secondary" style={{ fontSize: 13 }}>Không có điều kiện — workflow chạy với mọi record</Text>
              )}
              {editing.conditions.map((group, gi) => (
                <div key={gi} style={{ marginBottom: 12, padding: 12, background: 'var(--bg-secondary)', borderRadius: 8 }}>
                  <Row justify="space-between" align="middle" style={{ marginBottom: 8 }}>
                    <Space>
                      <Select
                        size="small" value={group.logic}
                        onChange={v => updateConditionGroup(gi, { logic: v })}
                        options={[{ value: 'AND', label: 'VÀ (AND)' }, { value: 'OR', label: 'HOẶC (OR)' }]}
                        style={{ width: 120 }}
                      />
                      <Text type="secondary" style={{ fontSize: 12 }}>Nhóm {gi + 1}</Text>
                    </Space>
                    <Button size="small" danger type="text" icon={<DeleteOutlined />} onClick={() => removeConditionGroup(gi)} />
                  </Row>
                  {group.rules.map((rule, ri) => (
                    <Row key={ri} gutter={6} style={{ marginBottom: 6 }} align="middle">
                      <Col flex="auto">
                        <Space size={4} wrap style={{ width: '100%' }}>
                          <Select
                            showSearch allowClear size="small"
                            placeholder="Field" style={{ minWidth: 140 }}
                            value={rule.field || undefined}
                            onChange={v => {
                              const f = allFields.find(af => af.name === v)
                              updateRule(gi, ri, { field: v || '', fieldType: f?.typeName || '' })
                            }}
                            optionFilterProp="label"
                          >
                            {editing.schemaSnapshot.map(t => (
                              <Select.OptGroup key={t.tableName} label={t.tableName}>
                                {t.fields.map(f => (
                                  <Select.Option key={`${t.tableName}.${f.name}`} value={f.name} label={f.name}>
                                    {f.name} <Text type="secondary" style={{ fontSize: 11 }}>({f.typeName})</Text>
                                  </Select.Option>
                                ))}
                              </Select.OptGroup>
                            ))}
                          </Select>
                          <Select
                            size="small" style={{ minWidth: 100 }}
                            value={rule.operator}
                            onChange={v => updateRule(gi, ri, { operator: v })}
                            options={getOperators(rule.fieldType)}
                          />
                          {!NO_VALUE_OPS.includes(rule.operator) && (
                            <Input
                              size="small" style={{ width: 140 }}
                              placeholder="Giá trị"
                              value={rule.value}
                              onChange={e => updateRule(gi, ri, { value: e.target.value })}
                            />
                          )}
                          {rule.operator === 'between' && (
                            <Input
                              size="small" style={{ width: 100 }}
                              placeholder="Giá trị 2"
                              value={rule.value2 ?? ''}
                              onChange={e => updateRule(gi, ri, { value2: e.target.value })}
                            />
                          )}
                        </Space>
                      </Col>
                      <Col>
                        <Button size="small" type="text" danger icon={<MinusCircleOutlined />} onClick={() => removeRule(gi, ri)} />
                      </Col>
                    </Row>
                  ))}
                  {/* Manual rule input if no schema */}
                  {editing.schemaSnapshot.length === 0 && group.rules.map((rule, ri) => null)}
                  <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => addRule(gi)} style={{ marginTop: 4 }}>
                    Thêm rule
                  </Button>
                </div>
              ))}
            </Card>

            {/* ── Actions ─────────────────────────────────────────────────────── */}
            <Card
              size="small"
              title={<><ApartmentOutlined style={{ color: '#52c41a' }} /> Hành động ({editing.actions.length})</>}
              extra={<Button size="small" icon={<PlusOutlined />} onClick={addAction}>Thêm action</Button>}
            >
              {editing.actions.length === 0 && (
                <Text type="secondary" style={{ fontSize: 13 }}>Chưa có action nào</Text>
              )}
              {editing.actions.map((action, ai) => (
                <div key={ai} style={{ marginBottom: 12, padding: 12, background: 'var(--bg-secondary)', borderRadius: 8 }}>
                  <Row justify="space-between" align="middle" style={{ marginBottom: 8 }}>
                    <Space>
                      <Tag color="green">{ai + 1}</Tag>
                      <Select
                        size="small" value={action.type}
                        onChange={v => updateAction(ai, { type: v })}
                        options={ACTION_TYPES}
                        style={{ width: 180 }}
                      />
                    </Space>
                    <Button size="small" danger type="text" icon={<DeleteOutlined />} onClick={() => removeAction(ai)} />
                  </Row>

                  <Input
                    size="small" placeholder="Mô tả hành động (tùy chọn)"
                    value={action.label}
                    onChange={e => updateAction(ai, { label: e.target.value })}
                    style={{ marginBottom: 8 }}
                  />

                  {/* update_record / create_record / find_and_update */}
                  {['update_record', 'create_record', 'find_and_update'].includes(action.type) && (
                    <>
                      <Select
                        showSearch allowClear size="small"
                        placeholder="Bảng đích"
                        style={{ width: '100%', marginBottom: 8 }}
                        value={action.targetTable || undefined}
                        onChange={v => updateAction(ai, { targetTable: v || '' })}
                        optionFilterProp="label"
                      >
                        {tableNames.map(tn => (
                          <Select.Option key={tn} value={tn}>{tn}</Select.Option>
                        ))}
                      </Select>
                      {tableNames.length === 0 && (
                        <Input
                          size="small" placeholder="Nhập tên bảng đích (thủ công)"
                          value={action.targetTable}
                          onChange={e => updateAction(ai, { targetTable: e.target.value })}
                          style={{ marginBottom: 8 }}
                        />
                      )}
                      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                        Field mappings (dùng {'{{FieldName}}'} để tham chiếu):
                      </Text>
                      {action.fieldMappings.map((fm, fi) => (
                        <Row key={fi} gutter={6} style={{ marginBottom: 4 }} align="middle">
                          <Col span={8}>
                            <Select
                              showSearch allowClear size="small"
                              placeholder="Field"
                              style={{ width: '100%' }}
                              value={fm.field || undefined}
                              onChange={v => updateFieldMapping(ai, fi, { field: v || '' })}
                              optionFilterProp="label"
                            >
                              {fieldsForTable(action.targetTable).map(f => (
                                <Select.Option key={f.name} value={f.name}>{f.name}</Select.Option>
                              ))}
                            </Select>
                            {tableNames.length === 0 && (
                              <Input
                                size="small" placeholder="Field"
                                value={fm.field}
                                onChange={e => updateFieldMapping(ai, fi, { field: e.target.value })}
                              />
                            )}
                          </Col>
                          <Col span={1} style={{ textAlign: 'center' }}>←</Col>
                          <Col flex="auto">
                            <Input
                              size="small" placeholder="Giá trị hoặc {{FieldRef}}"
                              value={fm.value}
                              onChange={e => updateFieldMapping(ai, fi, { value: e.target.value })}
                            />
                          </Col>
                          <Col>
                            <Button size="small" type="text" danger icon={<MinusCircleOutlined />}
                              onClick={() => removeFieldMapping(ai, fi)} />
                          </Col>
                        </Row>
                      ))}
                      <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => addFieldMapping(ai)} style={{ marginTop: 4 }}>
                        Thêm field
                      </Button>
                    </>
                  )}

                  {/* send_notification */}
                  {action.type === 'send_notification' && (
                    <>
                      <Select
                        size="small" placeholder="Kênh thông báo"
                        style={{ width: '100%', marginBottom: 8 }}
                        value={action.channel || undefined}
                        onChange={v => updateAction(ai, { channel: v })}
                        options={CHANNEL_OPTIONS}
                      />
                      <TextArea
                        size="small" placeholder="Nội dung (dùng {{FieldName}} để chèn giá trị)"
                        value={action.template}
                        onChange={e => updateAction(ai, { template: e.target.value })}
                        autoSize={{ minRows: 2, maxRows: 5 }}
                      />
                    </>
                  )}

                  {/* call_webhook */}
                  {action.type === 'call_webhook' && (
                    <>
                      <Row gutter={6} style={{ marginBottom: 6 }}>
                        <Col span={6}>
                          <Select
                            size="small" value={action.webhookMethod}
                            onChange={v => updateAction(ai, { webhookMethod: v })}
                            options={[{ value: 'GET' }, { value: 'POST' }, { value: 'PUT' }]}
                            style={{ width: '100%' }}
                          />
                        </Col>
                        <Col flex="auto">
                          <Input
                            size="small" placeholder="URL webhook"
                            value={action.webhookUrl}
                            onChange={e => updateAction(ai, { webhookUrl: e.target.value })}
                          />
                        </Col>
                      </Row>
                      <TextArea
                        size="small" placeholder="Payload JSON (tùy chọn)"
                        value={action.webhookPayload}
                        onChange={e => updateAction(ai, { webhookPayload: e.target.value })}
                        autoSize={{ minRows: 2, maxRows: 5 }}
                      />
                    </>
                  )}

                  {/* delay */}
                  {action.type === 'delay' && (
                    <InputNumber
                      size="small" placeholder="Phút" min={0}
                      value={action.delayMinutes}
                      onChange={v => updateAction(ai, { delayMinutes: v || 0 })}
                      addonAfter="phút"
                      style={{ width: 200 }}
                    />
                  )}

                  {/* condition_branch — simplified text description */}
                  {action.type === 'condition_branch' && (
                    <TextArea
                      size="small" placeholder="Mô tả logic rẽ nhánh (VD: Nếu Trạng thái = Mới → ... / Nếu khác → ...)"
                      value={action.label}
                      onChange={e => updateAction(ai, { label: e.target.value })}
                      autoSize={{ minRows: 3, maxRows: 8 }}
                    />
                  )}
                </div>
              ))}
            </Card>

            {/* ── Schema snapshot preview ──────────────────────────────────────── */}
            {editing.schemaSnapshot.length > 0 && (
              <Card size="small" title="Schema snapshot" style={{ fontSize: 12 }}>
                <Collapse ghost size="small">
                  {editing.schemaSnapshot.map(tbl => (
                    <Panel
                      key={tbl.tableId || tbl.tableName}
                      header={<><Text strong>{tbl.tableName}</Text> <Text type="secondary">({tbl.fields.length} fields)</Text></>}
                    >
                      {tbl.fields.map(f => (
                        <div key={f.name} style={{ display: 'flex', gap: 8, padding: '2px 0' }}>
                          <Tag color={TYPE_COLOR[f.type] || 'default'} style={{ fontSize: 11, minWidth: 70, textAlign: 'center' }}>
                            {f.typeName}
                          </Tag>
                          <Text style={{ fontSize: 12 }}>{f.name}</Text>
                          {f.isPrimary && <Tag color="red" style={{ fontSize: 10 }}>PK</Tag>}
                        </div>
                      ))}
                    </Panel>
                  ))}
                </Collapse>
                <Button
                  size="small" icon={<ReloadOutlined />} style={{ marginTop: 8 }}
                  loading={schemaLoading}
                  onClick={async () => {
                    if (editing.appToken) {
                      const snapshot = await loadSchemaForBase(editing.appToken)
                      if (snapshot) updateEditing({ schemaSnapshot: snapshot })
                    }
                  }}
                >
                  Làm mới schema
                </Button>
              </Card>
            )}

            {/* ── Manual schema input (when no base linked) ───────────────────── */}
            {editing.schemaSnapshot.length === 0 && !editing.appToken && (
              <Card size="small" title="Schema thủ công">
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                  Chọn Base ở trên để tự động tải schema, hoặc bạn có thể mô tả schema trong ghi chú bên dưới.
                </Text>
              </Card>
            )}

            {/* ── Notes & Tags ─────────────────────────────────────────────────── */}
            <Card size="small" title="Ghi chú & Tags">
              <TextArea
                placeholder="Ghi chú tổng thể, context, lý do thiết kế..."
                value={editing.notes}
                onChange={e => updateEditing({ notes: e.target.value })}
                autoSize={{ minRows: 2, maxRows: 8 }}
                style={{ marginBottom: 8 }}
              />
              <Select
                mode="tags"
                placeholder="Tags (nhập và Enter)"
                style={{ width: '100%' }}
                value={editing.tags}
                onChange={v => updateEditing({ tags: v })}
              />
            </Card>
          </div>
        )}
      </Drawer>

      {/* ── Export Modal ───────────────────────────────────────────────────────── */}
      <Modal
        title="Export Workflow Text"
        open={exportModal}
        onCancel={() => setExportModal(false)}
        width={700}
        footer={
          <Space>
            <Button onClick={() => {
              navigator.clipboard.writeText(exportText)
              message.success('Đã copy!')
            }} icon={<CopyOutlined />}>
              Copy
            </Button>
            <Button onClick={() => setExportModal(false)}>Đóng</Button>
          </Space>
        }
      >
        <TextArea
          value={exportText}
          readOnly
          autoSize={{ minRows: 10, maxRows: 30 }}
          style={{ fontFamily: 'monospace', fontSize: 13 }}
        />
      </Modal>
    </div>
  )
}
