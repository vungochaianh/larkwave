'use client'

import React, { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  Alert, Badge, Button, Card, Descriptions, Divider, Drawer, Empty, Form, Input,
  InputNumber, List, message, Modal, Popconfirm, Radio, Select, Space, Switch,
  Table, Tag, Tooltip, Typography,
} from 'antd'
import {
  RobotOutlined, ArrowLeftOutlined, EditOutlined, DeleteOutlined,
  ExperimentOutlined, CopyOutlined, PlusOutlined, LinkOutlined, SendOutlined,
  ClockCircleOutlined, BugOutlined,
} from '@ant-design/icons'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

const _base = (process.env.NEXT_PUBLIC_API_BASE || 'https://apihoanam.toolswave.net/api')
const BOTS_API     = `${_base}/bots`
const COMMANDS_API = `${_base}/bot-commands`

type BotCredentials = {
  telegramBotToken?: string; telegramBotUsername?: string
  larkAppId?: string; larkAppSecret?: string; larkAccountId?: string
  slackBotToken?: string; slackSigningSecret?: string
  zaloAccessToken?: string
}
type Bot = {
  _id: string; name: string; description: string; platform: string; isActive: boolean
  agentId: { _id: string; name: string } | string | null
  credentials: BotCredentials
  stats: { totalMessages: number; lastMessageAt: string | null; errorCount: number; lastError: string; lastErrorAt: string | null }
  notes: string
  commandCount?: number
  createdAt: string; updatedAt: string
}
type BotCommand = {
  _id: string; agentId: string; botId: string | null
  trigger: string; triggerType: 'prefix'|'exact'|'contains'|'regex'
  caseSensitive: boolean
  responseType: 'text'|'llm-prompt'|'reset'|'no-op'
  responseText: string; systemPromptOverride: string
  description: string; enabled: boolean; order: number
  scope?: 'agent'|'bot'
}
type SimulateResult = {
  matched: boolean; source: 'custom'|'builtin'|'llm-fallback'
  reply?: string; action?: string
  command?: { trigger: string; desc: string }
  note?: string
  debug: { text: string; agent: { id: string; name: string }; bot: { id: string; name: string; platform: string } }
}

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

export default function BotDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const botId  = params?.id as string

  const [bot, setBot]             = useState<Bot | null>(null)
  const [commands, setCommands]   = useState<BotCommand[]>([])
  const [loading, setLoading]     = useState(true)
  const [webhookUrl, setWebhookUrl] = useState('')

  // Test drawer
  const [testOpen, setTestOpen]     = useState(false)
  const [testText, setTestText]     = useState('')
  const [testLog, setTestLog]       = useState<Array<{ text: string; result: SimulateResult; at: string }>>([])
  const [testing, setTesting]       = useState(false)

  // Command modal
  const [cmdModal, setCmdModal] = useState<{ open: boolean; editing?: BotCommand }>({ open: false })
  const [cmdForm]               = Form.useForm()
  const [cmdSaving, setCmdSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [botRes, cmdRes] = await Promise.all([
        apiFetch(`${BOTS_API}/${botId}`),
        apiFetch(`${BOTS_API}/${botId}/commands`),
      ])
      if (botRes.success) {
        setBot(botRes.data)
        // Compute webhook URL
        const apiOrigin = _base.replace(/\/api$/, '')
        const urlRes = await apiFetch(`${BOTS_API}/${botId}/webhook-url?origin=${encodeURIComponent(apiOrigin)}`)
        if (urlRes.success) setWebhookUrl(urlRes.data.url)
      }
      if (cmdRes.success) setCommands(cmdRes.data ?? [])
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Load failed')
    } finally { setLoading(false) }
  }, [botId])

  useEffect(() => { if (botId) load() }, [botId, load])

  async function runTest() {
    if (!testText.trim()) return
    setTesting(true)
    try {
      const r = await apiFetch(`${BOTS_API}/${botId}/simulate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: testText }),
      })
      if (!r.success) throw new Error(r.error)
      setTestLog(log => [{ text: testText, result: r.data, at: new Date().toLocaleTimeString() }, ...log])
      setTestText('')
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Test failed')
    } finally { setTesting(false) }
  }

  function openNewCmd() {
    cmdForm.resetFields()
    cmdForm.setFieldsValue({
      triggerType: 'prefix',
      responseType: 'text',
      enabled: true,
      order: 0,
      scope: 'bot',
    })
    setCmdModal({ open: true })
  }

  function openEditCmd(cmd: BotCommand) {
    cmdForm.resetFields()
    cmdForm.setFieldsValue({
      trigger: cmd.trigger,
      triggerType: cmd.triggerType,
      caseSensitive: cmd.caseSensitive,
      responseType: cmd.responseType,
      responseText: cmd.responseText,
      systemPromptOverride: cmd.systemPromptOverride,
      description: cmd.description,
      enabled: cmd.enabled,
      order: cmd.order,
      scope: cmd.botId ? 'bot' : 'agent',
    })
    setCmdModal({ open: true, editing: cmd })
  }

  async function handleSaveCmd() {
    try {
      setCmdSaving(true)
      const values = await cmdForm.validateFields()
      const agentIdStr = typeof bot?.agentId === 'object' && bot?.agentId ? bot.agentId._id : (bot?.agentId as string)
      const body = {
        agentId: agentIdStr,
        botId: values.scope === 'bot' ? botId : null,
        trigger: values.trigger,
        triggerType: values.triggerType,
        caseSensitive: !!values.caseSensitive,
        responseType: values.responseType,
        responseText: values.responseText || '',
        systemPromptOverride: values.systemPromptOverride || '',
        description: values.description || '',
        enabled: values.enabled !== false,
        order: values.order ?? 0,
      }
      const url = cmdModal.editing ? `${COMMANDS_API}/${cmdModal.editing._id}` : COMMANDS_API
      const method = cmdModal.editing ? 'PUT' : 'POST'
      const r = await apiFetch(url, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!r.success) throw new Error(r.error)
      message.success(cmdModal.editing ? 'Command updated' : 'Command created')
      setCmdModal({ open: false })
      load()
    } catch (e: unknown) {
      if (e instanceof Error) message.error(e.message)
    } finally { setCmdSaving(false) }
  }

  async function handleToggleCmd(cmd: BotCommand) {
    try {
      const r = await apiFetch(`${COMMANDS_API}/${cmd._id}/toggle`, { method: 'PATCH' })
      if (!r.success) throw new Error(r.error)
      load()
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Toggle failed')
    }
  }

  async function handleDeleteCmd(id: string) {
    try {
      const r = await apiFetch(`${COMMANDS_API}/${id}`, { method: 'DELETE' })
      if (!r.success) throw new Error(r.error)
      message.success('Deleted')
      load()
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  async function handleDeleteBot() {
    try {
      const r = await apiFetch(`${BOTS_API}/${botId}`, { method: 'DELETE' })
      if (!r.success) throw new Error(r.error)
      message.success('Bot deleted')
      router.push('/bots')
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  async function copyUrl() {
    if (!webhookUrl) return
    await navigator.clipboard.writeText(webhookUrl)
    message.success('Webhook URL copied')
  }

  if (loading || !bot) {
    return <div className="p-6"><Empty description={loading ? 'Loading…' : 'Bot not found'} /></div>
  }

  const plat = PLATFORM_META[bot.platform]
  const agentName = typeof bot.agentId === 'object' && bot.agentId ? bot.agentId.name : '—'

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <Space>
          <Link href="/bots"><Button icon={<ArrowLeftOutlined />}>Back</Button></Link>
          <Title level={3} className="!mb-0">
            <RobotOutlined className="mr-2" />
            {bot.name}
          </Title>
          <Tag color={plat?.color}>{plat?.icon} {plat?.label}</Tag>
          {bot.isActive ? <Badge status="success" text="Active" /> : <Badge status="default" text="Inactive" />}
        </Space>
        <Space>
          <Button icon={<ExperimentOutlined />} onClick={() => setTestOpen(true)}>Test chat</Button>
          <Popconfirm title="Delete this bot?" onConfirm={handleDeleteBot}>
            <Button danger icon={<DeleteOutlined />}>Delete</Button>
          </Popconfirm>
        </Space>
      </div>

      <Card size="small" title="Webhook URL">
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message={
              <Space>
                <Text copyable={{ text: webhookUrl }} className="font-mono">{webhookUrl || '—'}</Text>
                <Button size="small" icon={<CopyOutlined />} onClick={copyUrl}>Copy</Button>
              </Space>
            }
            description={
              bot.platform === 'telegram'
                ? 'Paste this URL into @BotFather → Bot Settings → Webhook. Or use the Telegram API setWebhook method with your bot token.'
                : bot.platform === 'lark'
                  ? 'Paste this URL into your Lark app → Event Subscriptions → Request URL.'
                  : bot.platform === 'slack'
                    ? 'Paste this URL into Slack App → Event Subscriptions → Request URL.'
                    : 'Paste this URL into your Zalo OA webhook config.'
            }
          />
        </Space>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card size="small" title="Bot info">
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Description">{bot.description || '—'}</Descriptions.Item>
            <Descriptions.Item label="Linked agent">
              <Link href={`/lark/agent?tab=agents`}>{agentName}</Link>
            </Descriptions.Item>
            <Descriptions.Item label="Created">{new Date(bot.createdAt).toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="Updated">{new Date(bot.updatedAt).toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="Notes">{bot.notes || '—'}</Descriptions.Item>
          </Descriptions>
        </Card>

        <Card size="small" title="Stats">
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Total messages">{bot.stats.totalMessages}</Descriptions.Item>
            <Descriptions.Item label="Last message">
              {bot.stats.lastMessageAt ? new Date(bot.stats.lastMessageAt).toLocaleString() : 'never'}
            </Descriptions.Item>
            <Descriptions.Item label="Errors">
              {bot.stats.errorCount > 0
                ? <Tag color="red">{bot.stats.errorCount} — {bot.stats.lastError}</Tag>
                : 0}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      </div>

      <Card
        size="small"
        title={<Space><ApiIcon /> Commands ({commands.length})</Space>}
        extra={<Button size="small" type="primary" icon={<PlusOutlined />} onClick={openNewCmd}>Add command</Button>}
      >
        {commands.length === 0 ? (
          <Empty description="No custom commands yet. Add one to override built-ins or create new bot actions." />
        ) : (
          <Table
            rowKey="_id"
            size="small"
            dataSource={commands}
            pagination={false}
            columns={[
              {
                title: 'Trigger', dataIndex: 'trigger', key: 'trigger',
                render: (v: string, r) => (
                  <Space>
                    <Text code>{v}</Text>
                    <Tag>{r.triggerType}</Tag>
                    {r.scope === 'bot' ? <Tag color="blue">bot</Tag> : <Tag color="purple">agent</Tag>}
                  </Space>
                ),
              },
              { title: 'Response', dataIndex: 'responseType', key: 'responseType', width: 120, render: v => <Tag>{v}</Tag> },
              {
                title: 'Preview', dataIndex: 'responseText', key: 'preview',
                render: (v: string) => <Text type="secondary" ellipsis style={{ maxWidth: 300 }}>{v || '—'}</Text>,
              },
              {
                title: 'Enabled', dataIndex: 'enabled', key: 'enabled', width: 80,
                render: (v: boolean, r) => <Switch size="small" checked={v} onChange={() => handleToggleCmd(r)} />,
              },
              {
                title: '', key: 'actions', width: 100,
                render: (_: unknown, r) => (
                  <Space size={4}>
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEditCmd(r)} />
                    <Popconfirm title="Delete?" onConfirm={() => handleDeleteCmd(r._id)}>
                      <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                ),
              },
            ]}
          />
        )}
      </Card>

      {/* ─── Test drawer ─── */}
      <Drawer
        title={<Space><ExperimentOutlined /> Live chat test — {bot.name}</Space>}
        open={testOpen}
        onClose={() => setTestOpen(false)}
        width={520}
      >
        <Alert
          type="warning"
          showIcon
          message="Dry-run mode"
          description="This runs the command dispatcher only — no real messages are sent to the platform and no LLM is called. Useful for debugging command patterns."
          className="mb-3"
        />
        <Space.Compact style={{ width: '100%' }}>
          <Input
            placeholder="Type a message as if from a user…"
            value={testText}
            onChange={e => setTestText(e.target.value)}
            onPressEnter={runTest}
            disabled={testing}
          />
          <Button type="primary" icon={<SendOutlined />} onClick={runTest} loading={testing}>Send</Button>
        </Space.Compact>

        <Divider>Test log</Divider>

        {testLog.length === 0 ? (
          <Empty description="No tests run yet" />
        ) : (
          <List
            size="small"
            dataSource={testLog}
            renderItem={(item) => (
              <List.Item>
                <div style={{ width: '100%' }}>
                  <div className="flex items-center justify-between mb-1">
                    <Space size={4}>
                      <ClockCircleOutlined style={{ fontSize: 11 }} />
                      <Text type="secondary" style={{ fontSize: 11 }}>{item.at}</Text>
                      <Tag color={
                        item.result.source === 'custom' ? 'green' :
                        item.result.source === 'builtin' ? 'blue' :
                        'default'
                      }>{item.result.source}</Tag>
                    </Space>
                  </div>
                  <div><Text strong>You:</Text> {item.text}</div>
                  {item.result.reply && (
                    <div className="mt-1"><Text strong>Bot:</Text> <Text>{item.result.reply}</Text></div>
                  )}
                  {item.result.action && (
                    <div className="mt-1"><Tag icon={<BugOutlined />}>action: {item.result.action}</Tag></div>
                  )}
                  {item.result.note && (
                    <div className="mt-1"><Text type="secondary" italic>{item.result.note}</Text></div>
                  )}
                  {item.result.command && (
                    <div className="mt-1"><Text type="secondary">Matched: <Text code>{item.result.command.trigger}</Text> — {item.result.command.desc}</Text></div>
                  )}
                </div>
              </List.Item>
            )}
          />
        )}
      </Drawer>

      {/* ─── Command form modal ─── */}
      <Modal
        open={cmdModal.open}
        title={cmdModal.editing ? 'Edit command' : 'New command'}
        onCancel={() => setCmdModal({ open: false })}
        onOk={handleSaveCmd}
        confirmLoading={cmdSaving}
        width={640}
      >
        <Form form={cmdForm} layout="vertical" size="small" className="mt-4">
          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="trigger" label="Trigger" rules={[{ required: true }]}>
              <Input placeholder="!weather, hello, ^!w.*$ …" />
            </Form.Item>
            <Form.Item name="triggerType" label="Match type">
              <Select
                options={[
                  { value: 'prefix', label: 'Prefix (first word must match)' },
                  { value: 'exact',  label: 'Exact (whole message equals)' },
                  { value: 'contains', label: 'Contains' },
                  { value: 'regex',  label: 'Regular expression' },
                ]}
              />
            </Form.Item>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="caseSensitive" label="Case sensitive" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="scope" label="Scope">
              <Radio.Group>
                <Radio value="bot">This bot only</Radio>
                <Radio value="agent">Shared (all bots of agent)</Radio>
              </Radio.Group>
            </Form.Item>
          </div>
          <Form.Item name="responseType" label="Response type">
            <Select
              options={[
                { value: 'text',       label: 'Static text (template)' },
                { value: 'llm-prompt', label: 'LLM with custom system prompt' },
                { value: 'reset',      label: 'Reset session (built-in action)' },
                { value: 'no-op',      label: 'Silent (do nothing)' },
              ]}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(a, b) => a.responseType !== b.responseType}>
            {({ getFieldValue }) => {
              const t = getFieldValue('responseType')
              if (t === 'text') return (
                <Form.Item
                  name="responseText"
                  label="Response text"
                  tooltip="Supports variables: {{text}} (user message), {{senderName}}, {{chatId}}, {{botName}}"
                >
                  <TextArea rows={4} placeholder="Xin chào {{senderName}}! Bạn đã nói: {{text}}" />
                </Form.Item>
              )
              if (t === 'llm-prompt') return (
                <Form.Item
                  name="systemPromptOverride"
                  label="System prompt override"
                  tooltip="This replaces the agent's system prompt for this command. RAG + conversation history still apply."
                >
                  <TextArea rows={6} placeholder="You are an expert SQL tutor. When the user asks…" />
                </Form.Item>
              )
              return null
            }}
          </Form.Item>
          <Form.Item name="description" label="Description (shown in docs)">
            <Input placeholder="Short explanation of what this command does" />
          </Form.Item>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="enabled" label="Enabled" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="order" label="Order (lower = checked first)">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  )
}

// Tiny inline icon to avoid extra imports
function ApiIcon() { return <span style={{ fontSize: 14 }}>⚡</span> }
