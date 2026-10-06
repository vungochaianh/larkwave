'use client'

import React, { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Button, Card, Form, Input, message, Modal, Popconfirm, Select, Space,
  Switch, Table, Tag, Tooltip, Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  RobotOutlined, PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined,
  LinkOutlined, CheckCircleTwoTone, CloseCircleTwoTone, MessageOutlined,
  ApiOutlined,
} from '@ant-design/icons'

const { Title, Text, Paragraph } = Typography

const _base = (process.env.NEXT_PUBLIC_API_BASE || 'https://apihoanam.toolswave.net/api')
const BOTS_API   = `${_base}/bots`
const AGENTS_API = `${_base}/ai-agents`

type Bot = {
  _id: string
  name: string
  description: string
  platform: 'lark' | 'telegram' | 'slack' | 'zalo'
  agentId: { _id: string; name: string; provider?: string; model?: string } | string | null
  isActive: boolean
  stats: { totalMessages: number; lastMessageAt: string | null; errorCount: number; lastError: string; lastErrorAt: string | null }
  credentials: Record<string, string>
  createdAt: string
  updatedAt: string
}
type AgentOption = { _id: string; name: string; isActive: boolean }

const PLATFORM_META: Record<string, { label: string; color: string; icon: string }> = {
  lark:     { label: 'Lark',     color: 'blue',    icon: '💼' },
  telegram: { label: 'Telegram', color: 'cyan',    icon: '✈️' },
  slack:    { label: 'Slack',    color: 'magenta', icon: '💬' },
  zalo:     { label: 'Zalo',     color: 'geekblue', icon: '📱' },
}

async function apiFetch(url: string, opts: RequestInit = {}) {
  const r = await fetch(url, { cache: 'no-store', ...opts })
  return r.json()
}

export default function BotsDashboardPage() {
  const [bots, setBots]       = useState<Bot[]>([])
  const [agents, setAgents]   = useState<AgentOption[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState<{ platform?: string; isActive?: boolean }>({})
  const [modal, setModal]     = useState<{ open: boolean; editing?: Bot }>({ open: false })
  const [saving, setSaving]   = useState(false)
  const [form]                = Form.useForm()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (filter.platform) qs.set('platform', filter.platform)
      if (filter.isActive !== undefined) qs.set('isActive', String(filter.isActive))
      const [botsRes, agentsRes] = await Promise.all([
        apiFetch(`${BOTS_API}${qs.toString() ? '?' + qs.toString() : ''}`),
        apiFetch(AGENTS_API),
      ])
      if (botsRes.success)   setBots(botsRes.data ?? [])
      if (agentsRes.success) setAgents((agentsRes.data ?? []).map((a: { _id: string; name: string; isActive: boolean }) => ({ _id: a._id, name: a.name, isActive: a.isActive })))
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  async function handleToggle(bot: Bot) {
    try {
      const r = await apiFetch(`${BOTS_API}/${bot._id}/toggle`, { method: 'PATCH' })
      if (!r.success) throw new Error(r.error)
      message.success(`Bot ${r.data.isActive ? 'enabled' : 'disabled'}`)
      load()
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Toggle failed')
    }
  }

  async function handleDelete(id: string) {
    try {
      const r = await apiFetch(`${BOTS_API}/${id}`, { method: 'DELETE' })
      if (!r.success) throw new Error(r.error)
      message.success('Deleted')
      load()
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  function openCreate() {
    form.resetFields()
    form.setFieldsValue({ platform: 'telegram', isActive: true })
    setModal({ open: true })
  }

  function openEdit(bot: Bot) {
    form.resetFields()
    form.setFieldsValue({
      name:         bot.name,
      description:  bot.description,
      platform:     bot.platform,
      agentId:      typeof bot.agentId === 'object' && bot.agentId ? bot.agentId._id : bot.agentId,
      isActive:     bot.isActive,
      telegramBotToken: bot.credentials?.telegramBotToken || '',
      telegramBotUsername: bot.credentials?.telegramBotUsername || '',
      larkAppId:    bot.credentials?.larkAppId || '',
      larkAppSecret: bot.credentials?.larkAppSecret || '',
      slackBotToken: bot.credentials?.slackBotToken || '',
      zaloAccessToken: bot.credentials?.zaloAccessToken || '',
    })
    setModal({ open: true, editing: bot })
  }

  async function handleSave() {
    try {
      setSaving(true)
      const values = await form.validateFields()
      const body = {
        name: values.name,
        description: values.description || '',
        platform: values.platform,
        agentId: values.agentId,
        isActive: !!values.isActive,
        credentials: {
          telegramBotToken: values.telegramBotToken || '',
          telegramBotUsername: values.telegramBotUsername || '',
          larkAppId: values.larkAppId || '',
          larkAppSecret: values.larkAppSecret || '',
          slackBotToken: values.slackBotToken || '',
          zaloAccessToken: values.zaloAccessToken || '',
        },
      }
      const url = modal.editing ? `${BOTS_API}/${modal.editing._id}` : BOTS_API
      const method = modal.editing ? 'PUT' : 'POST'
      const r = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.success) throw new Error(r.error)
      message.success(modal.editing ? 'Updated' : 'Created')
      setModal({ open: false })
      load()
    } catch (e: unknown) {
      if (e instanceof Error) message.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function copyWebhookUrl(bot: Bot) {
    try {
      const origin = window.location.origin
      const apiOrigin = _base.replace(/\/api$/, '')
      const r = await apiFetch(`${BOTS_API}/${bot._id}/webhook-url?origin=${encodeURIComponent(apiOrigin || origin)}`)
      if (!r.success) throw new Error(r.error)
      await navigator.clipboard.writeText(r.data.url)
      message.success(`Webhook URL copied: ${r.data.url}`)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Copy failed')
    }
  }

  const columns: ColumnsType<Bot> = [
    {
      title: 'Name', dataIndex: 'name', key: 'name',
      render: (v: string, r) => (
        <Link href={`/bots/${r._id}`}>
          <Space>
            <RobotOutlined style={{ color: 'var(--accent-color)' }} />
            <Text strong>{v}</Text>
          </Space>
        </Link>
      ),
    },
    {
      title: 'Platform', dataIndex: 'platform', key: 'platform', width: 120,
      render: (v: string) => {
        const m = PLATFORM_META[v]
        return <Tag color={m?.color || 'default'}>{m?.icon} {m?.label || v}</Tag>
      },
      filters: Object.entries(PLATFORM_META).map(([k, m]) => ({ text: m.label, value: k })),
      onFilter: (val, r) => r.platform === val,
    },
    {
      title: 'Agent', key: 'agent', width: 180,
      render: (_: unknown, r) => {
        const a = typeof r.agentId === 'object' && r.agentId ? r.agentId : null
        return a ? <Tag color="purple">{a.name}</Tag> : <Text type="secondary">—</Text>
      },
    },
    {
      title: 'Status', dataIndex: 'isActive', key: 'isActive', width: 110,
      render: (v: boolean, r) => (
        <Switch
          checked={v}
          size="small"
          onChange={() => handleToggle(r)}
          checkedChildren={<CheckCircleTwoTone twoToneColor="#52c41a" />}
          unCheckedChildren={<CloseCircleTwoTone twoToneColor="#ff4d4f" />}
        />
      ),
    },
    {
      title: 'Messages', key: 'messages', width: 120,
      render: (_: unknown, r) => (
        <Tooltip title={`Last: ${r.stats.lastMessageAt ? new Date(r.stats.lastMessageAt).toLocaleString() : 'never'}`}>
          <Space size={4}>
            <MessageOutlined />
            <Text>{r.stats.totalMessages}</Text>
          </Space>
        </Tooltip>
      ),
    },
    {
      title: 'Errors', key: 'errors', width: 90,
      render: (_: unknown, r) => r.stats.errorCount > 0
        ? <Tooltip title={r.stats.lastError}><Tag color="red">{r.stats.errorCount}</Tag></Tooltip>
        : <Text type="secondary">0</Text>,
    },
    {
      title: 'Actions', key: 'actions', width: 200, fixed: 'right',
      render: (_: unknown, r) => (
        <Space size={4}>
          <Tooltip title="Copy webhook URL">
            <Button size="small" icon={<LinkOutlined />} onClick={() => copyWebhookUrl(r)} />
          </Tooltip>
          <Tooltip title="Edit">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          </Tooltip>
          <Popconfirm title="Delete this bot?" onConfirm={() => handleDelete(r._id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const activeCount = bots.filter(b => b.isActive).length
  const totalMessages = bots.reduce((s, b) => s + (b.stats.totalMessages || 0), 0)

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Title level={3} className="!mb-0">
            <RobotOutlined className="mr-2" />
            Bots Dashboard
          </Title>
          <Paragraph type="secondary" className="!mb-0">
            Quản lý đa bot (Lark, Telegram, Slack, Zalo) — mỗi bot link tới 1 AI agent, có commands + stats riêng.
          </Paragraph>
        </div>
        <Space>
          <Link href="/bots/commands">
            <Button icon={<ApiOutlined />}>Commands matrix</Button>
          </Link>
          <Button icon={<ReloadOutlined />} onClick={load}>Reload</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>New bot</Button>
        </Space>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card size="small">
          <Text type="secondary">Total bots</Text>
          <Title level={3} className="!mt-1 !mb-0">{bots.length}</Title>
        </Card>
        <Card size="small">
          <Text type="secondary">Active</Text>
          <Title level={3} className="!mt-1 !mb-0" style={{ color: 'var(--accent-color)' }}>{activeCount}</Title>
        </Card>
        <Card size="small">
          <Text type="secondary">Messages processed</Text>
          <Title level={3} className="!mt-1 !mb-0">{totalMessages}</Title>
        </Card>
      </div>

      <Card size="small">
        <Space className="mb-3">
          <Select
            placeholder="All platforms"
            allowClear
            style={{ width: 160 }}
            options={Object.entries(PLATFORM_META).map(([k, m]) => ({ value: k, label: `${m.icon} ${m.label}` }))}
            onChange={v => setFilter(f => ({ ...f, platform: v }))}
          />
          <Select
            placeholder="Status"
            allowClear
            style={{ width: 140 }}
            options={[{ value: true, label: 'Active' }, { value: false, label: 'Inactive' }]}
            onChange={v => setFilter(f => ({ ...f, isActive: v }))}
          />
        </Space>
        <Table
          rowKey="_id"
          columns={columns}
          dataSource={bots}
          loading={loading}
          size="small"
          scroll={{ x: 900 }}
          pagination={{ pageSize: 20 }}
        />
      </Card>

      <Modal
        open={modal.open}
        title={modal.editing ? `Edit ${modal.editing.name}` : 'Create new bot'}
        onCancel={() => setModal({ open: false })}
        onOk={handleSave}
        confirmLoading={saving}
        width={640}
      >
        <Form form={form} layout="vertical" size="small" className="mt-4">
          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="name" label="Display name" rules={[{ required: true }]}>
              <Input placeholder="e.g. Hoa Nam Support Bot" />
            </Form.Item>
            <Form.Item name="platform" label="Platform" rules={[{ required: true }]}>
              <Select
                options={Object.entries(PLATFORM_META).map(([k, m]) => ({ value: k, label: `${m.icon} ${m.label}` }))}
              />
            </Form.Item>
          </div>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} placeholder="What this bot does…" />
          </Form.Item>
          <Form.Item name="agentId" label="Linked AI Agent" rules={[{ required: true }]}>
            <Select
              placeholder="Select agent"
              options={agents.map(a => ({ value: a._id, label: `${a.name} ${a.isActive ? '' : '(inactive)'}` }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.platform !== cur.platform}>
            {({ getFieldValue }) => {
              const platform = getFieldValue('platform')
              if (platform === 'telegram') return (
                <>
                  <Form.Item name="telegramBotToken" label="Telegram Bot Token" tooltip="Get from @BotFather">
                    <Input.Password placeholder="123456:ABC-DEF..." className="font-mono" />
                  </Form.Item>
                  <Form.Item name="telegramBotUsername" label="Telegram Bot Username (display only)">
                    <Input placeholder="@myhoanam_bot" />
                  </Form.Item>
                </>
              )
              if (platform === 'lark') return (
                <>
                  <Form.Item name="larkAppId" label="Lark App ID">
                    <Input placeholder="cli_a1b2c3..." className="font-mono" />
                  </Form.Item>
                  <Form.Item name="larkAppSecret" label="Lark App Secret">
                    <Input.Password placeholder="secret..." className="font-mono" />
                  </Form.Item>
                </>
              )
              if (platform === 'slack') return (
                <Form.Item name="slackBotToken" label="Slack Bot Token">
                  <Input.Password placeholder="xoxb-..." className="font-mono" />
                </Form.Item>
              )
              if (platform === 'zalo') return (
                <Form.Item name="zaloAccessToken" label="Zalo OA Access Token">
                  <Input.Password placeholder="access-token..." className="font-mono" />
                </Form.Item>
              )
              return null
            }}
          </Form.Item>

          <Form.Item name="isActive" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
