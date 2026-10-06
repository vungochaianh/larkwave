'use client'

/**
 * Commands matrix — rows = commands, cols = bots.
 *
 * Each cell shows whether a command applies to a bot:
 *   - Agent-scoped commands (botId=null) apply to ALL bots of that agent → shown with a 👥 icon
 *   - Bot-scoped commands apply only to the bot matching botId → single checkmark
 *
 * Users pick an agent from a dropdown. This page is per-agent because commands
 * are always owned by an agent (bots of different agents don't share commands).
 */

import React, { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Alert, Button, Card, Empty, Select, Space, Switch, Table, Tag, Tooltip, Typography, message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ArrowLeftOutlined, ReloadOutlined, TeamOutlined, RobotOutlined } from '@ant-design/icons'

const { Title, Text, Paragraph } = Typography

const _base = (process.env.NEXT_PUBLIC_API_BASE || 'https://apihoanam.toolswave.net/api')
const COMMANDS_API = `${_base}/bot-commands`
const AGENTS_API   = `${_base}/ai-agents`

type AgentLite = { _id: string; name: string }
type BotLite = { _id: string; name: string; platform: string; isActive: boolean }
type Command = {
  _id: string; agentId: string; botId: string | null
  trigger: string; triggerType: string; responseType: string
  enabled: boolean; description: string; order: number
}

const PLATFORM_ICON: Record<string, string> = {
  lark: '💼', telegram: '✈️', slack: '💬', zalo: '📱',
}

async function apiFetch(url: string, opts: RequestInit = {}) {
  const r = await fetch(url, { cache: 'no-store', ...opts })
  return r.json()
}

export default function CommandsMatrixPage() {
  const [agents, setAgents]     = useState<AgentLite[]>([])
  const [agentId, setAgentId]   = useState<string | undefined>()
  const [bots, setBots]         = useState<BotLite[]>([])
  const [commands, setCommands] = useState<Command[]>([])
  const [loading, setLoading]   = useState(false)

  useEffect(() => {
    apiFetch(AGENTS_API).then(r => {
      if (r.success) {
        const list = (r.data ?? []).map((a: { _id: string; name: string }) => ({ _id: a._id, name: a.name }))
        setAgents(list)
        if (list.length > 0 && !agentId) setAgentId(list[0]._id)
      }
    })
  }, [agentId])

  const load = useCallback(async () => {
    if (!agentId) return
    setLoading(true)
    try {
      const r = await apiFetch(`${COMMANDS_API}/matrix?agentId=${agentId}`)
      if (r.success) {
        setBots(r.data.bots ?? [])
        setCommands(r.data.commands ?? [])
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Load failed')
    } finally { setLoading(false) }
  }, [agentId])

  useEffect(() => { load() }, [load])

  async function toggleEnabled(cmd: Command) {
    try {
      const r = await apiFetch(`${COMMANDS_API}/${cmd._id}/toggle`, { method: 'PATCH' })
      if (!r.success) throw new Error(r.error)
      load()
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Toggle failed')
    }
  }

  async function moveToBot(cmd: Command, newBotId: string | null) {
    try {
      const r = await apiFetch(`${COMMANDS_API}/${cmd._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId: newBotId }),
      })
      if (!r.success) throw new Error(r.error)
      message.success(newBotId ? 'Scoped to bot' : 'Scoped to agent (shared by all bots)')
      load()
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Update failed')
    }
  }

  const columns: ColumnsType<Command> = [
    {
      title: 'Command', dataIndex: 'trigger', key: 'trigger', fixed: 'left', width: 220,
      render: (v: string, r) => (
        <Space direction="vertical" size={0}>
          <Space size={4}>
            <Text code>{v}</Text>
            <Tag color="default">{r.triggerType}</Tag>
          </Space>
          {r.description && <Text type="secondary" style={{ fontSize: 11 }}>{r.description}</Text>}
        </Space>
      ),
    },
    {
      title: 'Type', dataIndex: 'responseType', key: 'responseType', width: 110,
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      title: 'Enabled', dataIndex: 'enabled', key: 'enabled', width: 90,
      render: (v: boolean, r) => <Switch size="small" checked={v} onChange={() => toggleEnabled(r)} />,
    },
    {
      title: <Space><TeamOutlined /> Shared (all bots)</Space>,
      key: 'shared', width: 140, align: 'center',
      render: (_: unknown, r) => {
        const isShared = r.botId === null
        return (
          <Tooltip title={isShared ? 'Applies to every bot of this agent' : 'Click to make this a shared command'}>
            <Switch
              checked={isShared}
              onChange={val => moveToBot(r, val ? null : (bots[0]?._id ?? null))}
              disabled={bots.length === 0}
            />
          </Tooltip>
        )
      },
    },
    ...bots.map<ColumnsType<Command>[number]>(bot => ({
      title: (
        <Space direction="vertical" size={0} className="text-center">
          <Link href={`/bots/${bot._id}`}>
            <Space size={4}>
              <span>{PLATFORM_ICON[bot.platform] || '🤖'}</span>
              <Text strong style={{ fontSize: 12 }}>{bot.name}</Text>
            </Space>
          </Link>
          {!bot.isActive && <Tag color="default">inactive</Tag>}
        </Space>
      ),
      key: `bot-${bot._id}`,
      width: 120,
      align: 'center',
      render: (_: unknown, cmd: Command) => {
        // Applies to this bot if:
        //   - command is agent-scoped (botId = null) → applies to ALL bots
        //   - command is bot-scoped and botId matches
        const isShared = cmd.botId === null
        const isThisBot = cmd.botId === bot._id
        const applies = isShared || isThisBot
        if (isShared) return <Tooltip title="Inherited via shared scope"><TeamOutlined style={{ color: 'var(--text-tertiary)' }} /></Tooltip>
        if (isThisBot) return <Tag color="blue">✓</Tag>
        return (
          <Tooltip title={applies ? '' : 'Click to move this command to this bot (becomes bot-scoped)'}>
            <Button size="small" type="text" onClick={() => moveToBot(cmd, bot._id)}>—</Button>
          </Tooltip>
        )
      },
    })),
  ]

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <Space>
          <Link href="/bots"><Button icon={<ArrowLeftOutlined />}>Back to bots</Button></Link>
          <Title level={3} className="!mb-0">
            <RobotOutlined className="mr-2" />
            Commands matrix
          </Title>
        </Space>
        <Space>
          <Select
            placeholder="Select agent"
            style={{ width: 260 }}
            value={agentId}
            onChange={setAgentId}
            options={agents.map(a => ({ value: a._id, label: a.name }))}
            showSearch
            optionFilterProp="label"
          />
          <Button icon={<ReloadOutlined />} onClick={load}>Reload</Button>
        </Space>
      </div>

      <Alert
        type="info"
        showIcon
        message="How the matrix works"
        description={
          <ul className="!mb-0 !pl-5">
            <li><b>Shared</b> commands (toggle in &quot;Shared&quot; column) apply to every bot of the selected agent — useful for core commands like <Text code>!help</Text>.</li>
            <li>Bot-scoped commands appear with a <Tag color="blue">✓</Tag> only in that bot&apos;s column. Click the <Text code>—</Text> in another bot&apos;s column to MOVE the command there.</li>
            <li>Create / edit command bodies on the bot detail page (<Text code>/bots/[id]</Text>).</li>
          </ul>
        }
      />

      <Card size="small">
        {commands.length === 0 ? (
          <Empty description="No commands yet for this agent. Add one from a bot detail page." />
        ) : (
          <Table
            rowKey="_id"
            columns={columns}
            dataSource={commands}
            loading={loading}
            size="small"
            scroll={{ x: 800 }}
            pagination={false}
          />
        )}
      </Card>

      <Paragraph type="secondary" className="text-xs">
        Command precedence: bot-scoped &gt; agent-scoped &gt; built-in (<Text code>!learn</Text>, <Text code>!qa</Text>, <Text code>!help</Text>, <Text code>!reset</Text>, <Text code>!feedback</Text>, <Text code>!status</Text>) &gt; LLM fallback.
      </Paragraph>
    </div>
  )
}
