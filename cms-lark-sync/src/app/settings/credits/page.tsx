'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Alert, Badge, Button, Card, DatePicker, Empty,
  Progress, Select, Space, Spin, Statistic,
  Table, Tabs, Tag, Tooltip, Typography, message,
} from 'antd'
import {
  ArrowDownOutlined, ArrowUpOutlined, BarChartOutlined, CloudOutlined,
  DollarOutlined, HistoryOutlined, InfoCircleOutlined, ReloadOutlined,
  RobotOutlined, ThunderboltOutlined, WalletOutlined, WarningOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import useLang from '@/store/language'
import TourGuide from '@/components/TourGuide'
import { tourSteps } from '@/lib/tourSteps'

const { Title, Text, Paragraph } = Typography
const { RangePicker } = DatePicker

const _base       = process.env.NEXT_PUBLIC_API_BASE || 'https://apihoanam.toolswave.net/api'
const CREDITS_API = `${_base}/ai-credits`
const CONFIGS_API = `${_base}/ai-configs`

// ── Types ──────────────────────────────────────────────────────────────────────

type AIConfigInfo = {
  _id: string; name: string; provider: string; model: string; status: string
  totalInputTokens: number; totalOutputTokens: number; totalCostUsd: number
  isDefault: boolean; inputPricePerM: number; outputPricePerM: number
}
type CreditAccount = {
  _id: string
  aiConfigId: { _id: string; name: string; provider: string; model: string }
  balance: number; totalDeposited: number; totalUsed: number
  blockOnZero: boolean; alertThreshold: number
}
type Transaction = {
  _id: string; type: string; amount: number; balance: number; description: string
  metadata: { agentName?: string; model?: string; inputTokens?: number; outputTokens?: number; costUsd?: number; [k: string]: unknown }
  createdAt: string
}
type MonthlyData = { month: string; monthKey: string; deposited: number; used: number; txnCount: number }
type MergedRow = {
  key: string; configId: string; configName: string; provider: string; model: string
  status: string; isDefault: boolean; inputPricePerM: number; outputPricePerM: number
  balance?: number; totalDeposited?: number; totalUsed?: number
  blockOnZero?: boolean; alertThreshold?: number
  totalInputTokens: number; totalOutputTokens: number; totalCostUsd: number
  hasCreditAccount: boolean
}
type SummaryData = { totalAccounts: number; totalBalance: number; totalDeposited: number; totalUsed: number; lowBalanceCount: number }

const PC: Record<string, string> = { openai: 'green', anthropic: 'purple', google: 'blue', groq: 'orange', mistral: 'cyan', nvidia: 'lime', ollama: 'magenta', custom: 'default' }
const TC: Record<string, string> = { deposit: 'green', usage: 'red', adjustment: 'blue', refund: 'cyan' }
const TL: Record<string, Record<string, string>> = {
  vi: { deposit: 'Nap', usage: 'Su dung', adjustment: 'Dieu chinh', refund: 'Hoan' },
  en: { deposit: 'Deposit', usage: 'Usage', adjustment: 'Adjust', refund: 'Refund' },
}

// ── SVG Bar Chart ──────────────────────────────────────────────────────────────

function SvgBarChart({ data, height = 120, label }: { data: { label: string; value: number; secondary?: number }[]; height?: number; label?: string }) {
  if (!data.length) return null
  const max = Math.max(...data.map(d => Math.max(d.value, d.secondary ?? 0)), 0.001)
  const w = data.length * 40
  const barW = data.length > 12 ? 14 : 20
  const gap = data.length > 12 ? 3 : 6

  return (
    <div>
      {label && <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}><BarChartOutlined className="mr-1" />{label}</div>}
      <div style={{ overflowX: 'auto' }}>
        <svg width={Math.max(w, 200)} height={height + 24} style={{ display: 'block', minWidth: '100%' }}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(f => (
            <line key={f} x1={0} y1={height - f * height} x2="100%" y2={height - f * height}
              stroke="var(--border-light)" strokeDasharray={f === 0 ? 'none' : '3 3'} />
          ))}
          {/* Bars */}
          {data.map((d, i) => {
            const x = i * (barW + gap) + gap
            const h1 = (d.value / max) * (height - 4)
            const h2 = d.secondary != null ? (d.secondary / max) * (height - 4) : 0
            return (
              <g key={i}>
                <Tooltip title={`${d.label}: Chi $${d.value.toFixed(4)}${d.secondary != null ? ` | Nap $${d.secondary.toFixed(2)}` : ''}`}>
                  <rect x={x} y={height - h1} width={barW / 2 - 1} height={Math.max(h1, 1)} rx={2}
                    fill="var(--accent-color)" opacity={0.8} style={{ cursor: 'pointer' }}>
                    <animate attributeName="height" from="0" to={Math.max(h1, 1)} dur="0.4s" />
                    <animate attributeName="y" from={height} to={height - h1} dur="0.4s" />
                  </rect>
                </Tooltip>
                {d.secondary != null && (
                  <Tooltip title={`${d.label}: Nap $${d.secondary.toFixed(2)}`}>
                    <rect x={x + barW / 2} y={height - h2} width={barW / 2 - 1} height={Math.max(h2, 1)} rx={2}
                      fill="var(--success-text)" opacity={0.6} style={{ cursor: 'pointer' }}>
                      <animate attributeName="height" from="0" to={Math.max(h2, 1)} dur="0.4s" />
                      <animate attributeName="y" from={height} to={height - h2} dur="0.4s" />
                    </rect>
                  </Tooltip>
                )}
                <text x={x + barW / 2 - 1} y={height + 14} textAnchor="middle"
                  style={{ fontSize: 9, fill: 'var(--text-tertiary)' }}>{d.label}</text>
              </g>
            )
          })}
        </svg>
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--accent-color)', marginRight: 4 }} />Cost</span>
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--success-text)', marginRight: 4 }} />Deposit</span>
      </div>
    </div>
  )
}

// ── Main ────────────────────────────────────────────────────────────────────────

export default function CreditsPage() {
  const { lang } = useLang()
  const l = (lang as 'vi' | 'en') || 'vi'

  const [rows, setRows]               = useState<MergedRow[]>([])
  const [loading, setLoading]         = useState(true)
  const [summary, setSummary]         = useState<SummaryData | null>(null)
  const [monthly, setMonthly]         = useState<MonthlyData[]>([])
  const [selected, setSelected]       = useState<MergedRow | null>(null)
  const [txns, setTxns]               = useState<Transaction[]>([])
  const [txnTotal, setTxnTotal]       = useState(0)
  const [txnPage, setTxnPage]         = useState(1)
  const [txnLoading, setTxnLoading]   = useState(false)
  const [txnFilter, setTxnFilter]     = useState('')
  const [dateRange, setDateRange]     = useState<[string, string] | null>(null)
  const [providerData, setProviderData] = useState<any>(null)
  const [providerLoading, setProviderLoading] = useState(false)

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [cfgRes, creditRes, summaryRes, monthlyRes] = await Promise.all([
        fetch(CONFIGS_API, { cache: 'no-store' }).then(r => r.json()).catch(() => ({ success: false })),
        fetch(CREDITS_API, { cache: 'no-store' }).then(r => r.json()).catch(() => ({ success: false })),
        fetch(`${CREDITS_API}/summary`, { cache: 'no-store' }).then(r => r.json()).catch(() => ({ success: false })),
        fetch(`${CREDITS_API}/monthly?months=6`, { cache: 'no-store' }).then(r => r.json()).catch(() => ({ success: false })),
      ])
      if (summaryRes.success) setSummary(summaryRes.data)
      if (monthlyRes.success) setMonthly(monthlyRes.data ?? [])

      const configs: AIConfigInfo[] = cfgRes.success ? (cfgRes.data ?? []) : []
      const credits: CreditAccount[] = creditRes.success ? (creditRes.data ?? []) : []
      const creditMap: Record<string, CreditAccount> = {}
      for (const c of credits) { const id = c.aiConfigId?._id || String(c.aiConfigId); if (id) creditMap[id] = c }

      const merged: MergedRow[] = configs.map(cfg => {
        const cr = creditMap[cfg._id]
        return {
          key: cfg._id, configId: cfg._id, configName: cfg.name,
          provider: cfg.provider, model: cfg.model, status: cfg.status,
          isDefault: cfg.isDefault, inputPricePerM: cfg.inputPricePerM, outputPricePerM: cfg.outputPricePerM,
          totalInputTokens: cfg.totalInputTokens || 0, totalOutputTokens: cfg.totalOutputTokens || 0, totalCostUsd: cfg.totalCostUsd || 0,
          hasCreditAccount: !!cr,
          ...(cr ? { balance: cr.balance, totalDeposited: cr.totalDeposited, totalUsed: cr.totalUsed, blockOnZero: cr.blockOnZero, alertThreshold: cr.alertThreshold } : {}),
        }
      })
      setRows(merged)
      return merged
    } catch { message.error('Failed') }
    finally { setLoading(false) }
    return []
  }, [])

  const loadTxns = useCallback(async (row: MergedRow, type = '', page = 1, dates?: [string, string] | null) => {
    if (!row.hasCreditAccount) return
    setTxnLoading(true)
    try {
      let url = `${CREDITS_API}/${row.configId}/transactions?limit=30&page=${page}`
      if (type) url += `&type=${type}`
      if (dates?.[0]) url += `&startDate=${dates[0]}`
      if (dates?.[1]) url += `&endDate=${dates[1]}`
      const res = await fetch(url, { cache: 'no-store' }).then(r => r.json())
      if (res.success) { setTxns(res.data ?? []); setTxnTotal(res.pagination?.total ?? 0); setTxnPage(page) }
    } catch { /* */ }
    finally { setTxnLoading(false) }
  }, [])

  const loadProvider = useCallback(async (row: MergedRow) => {
    setProviderLoading(true); setProviderData(null)
    try {
      const res = await fetch(`${CONFIGS_API}/${row.configId}/provider-usage`, { cache: 'no-store' }).then(r => r.json())
      if (res.success) setProviderData(res.data)
    } catch { /* */ }
    finally { setProviderLoading(false) }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  function selectConfig(row: MergedRow) {
    setSelected(row); setTxnFilter(''); setDateRange(null); setTxnPage(1)
    loadTxns(row, '', 1, null); loadProvider(row)
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  const totalCost    = rows.reduce((s, r) => s + r.totalCostUsd, 0)
  const totalTokens  = rows.reduce((s, r) => s + r.totalInputTokens + r.totalOutputTokens, 0)
  const totalBalance = summary?.totalBalance ?? rows.reduce((s, r) => s + (r.balance ?? 0), 0)
  const thisMonthCost = monthly.length > 0 ? monthly[monthly.length - 1]?.used ?? 0 : 0

  const chartData = useMemo(() => monthly.map(m => ({
    label: m.month.replace('thg ', 'T').replace(', ', '/'),
    value: m.used,
    secondary: m.deposited,
  })), [monthly])

  // ── Columns ───────────────────────────────────────────────────────────────

  const cols: ColumnsType<MergedRow> = [
    {
      title: 'Provider', key: 'p',
      render: (_, r) => (
        <div data-tour="credits-provider">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="font-medium text-sm">{r.configName}</span>
            {r.isDefault && <Tag color="blue" style={{ fontSize: 9, lineHeight: '16px' }}>Default</Tag>}
            <Tag color={r.status === 'active' ? 'green' : 'default'} style={{ fontSize: 9, lineHeight: '16px' }}>{r.status}</Tag>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <Tag color={PC[r.provider]} style={{ fontSize: 10, margin: 0 }}>{r.provider}</Tag>
            <span className="font-mono text-xs" style={{ color: 'var(--text-tertiary)' }}>{r.model}</span>
          </div>
        </div>
      ),
    },
    {
      title: <Tooltip title={l === 'vi' ? 'Tong chi phi AI tinh tu du lieu noi bo' : 'Total AI cost from internal tracking'}><span>{l === 'vi' ? 'Chi phi' : 'Cost'} <InfoCircleOutlined style={{ fontSize: 10 }} /></span></Tooltip>,
      key: 'cost', width: 110, align: 'right' as const,
      sorter: (a, b) => a.totalCostUsd - b.totalCostUsd,
      render: (_, r) => (
        <span className="font-bold font-mono" data-tour="credits-cost"
          style={{ color: r.totalCostUsd > 0 ? 'var(--warning-text)' : 'var(--text-muted)' }}>
          ${r.totalCostUsd.toFixed(4)}
        </span>
      ),
    },
    {
      title: 'Tokens', key: 't', width: 130, align: 'right' as const,
      sorter: (a, b) => (a.totalInputTokens + a.totalOutputTokens) - (b.totalInputTokens + b.totalOutputTokens),
      render: (_, r) => {
        const t = r.totalInputTokens + r.totalOutputTokens
        if (!t) return <span style={{ color: 'var(--text-muted)' }}>--</span>
        return (
          <div className="text-xs" data-tour="credits-tokens">
            <div className="font-semibold font-mono">{t.toLocaleString()}</div>
            <div style={{ color: 'var(--text-tertiary)' }}>
              <span style={{ color: 'var(--success-text)' }}>{r.totalInputTokens.toLocaleString()}</span>
              {' / '}
              <span style={{ color: 'var(--error-text)' }}>{r.totalOutputTokens.toLocaleString()}</span>
            </div>
          </div>
        )
      },
    },
    {
      title: <Tooltip title={l === 'vi' ? 'So du credit con lai (neu da nap)' : 'Remaining credit balance'}><span>{l === 'vi' ? 'So du' : 'Balance'} <InfoCircleOutlined style={{ fontSize: 10 }} /></span></Tooltip>,
      key: 'b', width: 100, align: 'right' as const,
      render: (_, r) => {
        if (!r.hasCreditAccount) return <span style={{ color: 'var(--text-muted)' }}>--</span>
        const low = (r.balance ?? 0) <= (r.alertThreshold ?? 5)
        return (
          <div data-tour="credits-balance">
            <span className={`font-bold font-mono ${low ? 'text-[var(--error-text)]' : 'text-[var(--success-text)]'}`}>
              ${(r.balance ?? 0).toFixed(2)}
            </span>
            {low && <WarningOutlined style={{ fontSize: 10, marginLeft: 3, color: 'var(--warning-text)' }} />}
          </div>
        )
      },
    },
    {
      title: '', key: 'a', width: 80,
      render: (_, r) => (
        <Button size="small" type={selected?.configId === r.configId ? 'primary' : 'default'}
          icon={<BarChartOutlined />} onClick={() => selectConfig(r)} data-tour="credits-detail-btn">
          {l === 'vi' ? 'Xem' : 'View'}
        </Button>
      ),
    },
  ]

  const txnCols: ColumnsType<Transaction> = [
    { title: l === 'vi' ? 'Loai' : 'Type', key: 'ty', width: 75, render: (_, t) => <Tag color={TC[t.type] || 'default'} style={{ fontSize: 10 }}>{TL[l]?.[t.type] || t.type}</Tag> },
    { title: l === 'vi' ? 'So tien' : 'Amount', key: 'am', width: 100, align: 'right' as const,
      render: (_, t) => <span className={`font-mono text-sm font-semibold ${t.amount >= 0 ? 'text-[var(--success-text)]' : 'text-[var(--error-text)]'}`}>{t.amount >= 0 ? '+' : ''}${t.amount.toFixed(6)}</span> },
    { title: l === 'vi' ? 'So du sau' : 'After', key: 'ba', width: 90, align: 'right' as const,
      render: (_, t) => <span className="font-mono text-xs" style={{ color: 'var(--text-tertiary)' }}>${t.balance.toFixed(4)}</span> },
    { title: l === 'vi' ? 'Chi tiet' : 'Details', key: 'de',
      render: (_, t) => <div className="text-xs"><div>{t.description}</div>{t.metadata?.agentName && <div style={{ color: 'var(--text-tertiary)' }}>Agent: {t.metadata.agentName}</div>}</div> },
    { title: 'Tokens', key: 'to', width: 90, align: 'right' as const,
      render: (_, t) => { const i = Number(t.metadata?.inputTokens || 0), o = Number(t.metadata?.outputTokens || 0); if (!i && !o) return null; return <span className="text-xs font-mono" style={{ color: 'var(--text-tertiary)' }}>{i.toLocaleString()}/{o.toLocaleString()}</span> } },
    { title: l === 'vi' ? 'Thoi gian' : 'Time', dataIndex: 'createdAt', key: 'ti', width: 130,
      render: (v: string) => <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{new Date(v).toLocaleString(l === 'vi' ? 'vi-VN' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span> },
  ]

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div data-tour="credits-header">
          <Title level={4} className="!mb-0">
            <ThunderboltOutlined className="mr-2" style={{ color: 'var(--accent-color)' }} />
            AI Usage Dashboard
          </Title>
          <Paragraph type="secondary" className="!mb-0 text-xs">
            {l === 'vi' ? 'Thong ke chi phi, token va lich su su dung AI theo tung provider.' : 'Track costs, tokens, and usage history per AI provider.'}
          </Paragraph>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => { loadAll(); if (selected) { loadTxns(selected, txnFilter, 1, dateRange); loadProvider(selected) } }} loading={loading} />
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }} data-tour="credits-summary">
        <Card size="small" style={{ borderTop: '3px solid var(--warning-text)' }}>
          <Statistic title={l === 'vi' ? 'Tong chi phi AI' : 'Total AI Cost'} value={totalCost} precision={4} prefix="$"
            valueStyle={{ color: 'var(--warning-text)', fontSize: 22, fontFamily: 'monospace' }} />
        </Card>
        <Card size="small" style={{ borderTop: '3px solid var(--accent-color)' }}>
          <Statistic title={l === 'vi' ? 'Thang nay' : 'This Month'} value={thisMonthCost} precision={4} prefix="$"
            valueStyle={{ color: 'var(--accent-color)', fontSize: 22, fontFamily: 'monospace' }} />
        </Card>
        <Card size="small" style={{ borderTop: '3px solid var(--accent-color)' }}>
          <Statistic title={l === 'vi' ? 'Tong tokens' : 'Total Tokens'} value={totalTokens}
            valueStyle={{ fontSize: 22, fontFamily: 'monospace' }} formatter={v => Number(v).toLocaleString()} />
        </Card>
        <Card size="small" style={{ borderTop: '3px solid var(--success-text)' }}>
          <Statistic title={l === 'vi' ? 'So du con lai' : 'Credit Balance'} value={totalBalance} precision={4} prefix="$"
            valueStyle={{ color: totalBalance > 0 ? 'var(--success-text)' : 'var(--error-text)', fontSize: 22, fontFamily: 'monospace' }} />
        </Card>
      </div>

      {/* Monthly chart */}
      {chartData.length > 1 && (
        <Card size="small" data-tour="credits-chart">
          <SvgBarChart data={chartData} height={100}
            label={l === 'vi' ? 'Chi phi & Nap theo thang (6 thang gan nhat)' : 'Monthly cost & deposits (last 6 months)'} />
        </Card>
      )}

      {/* Provider table */}
      <Card size="small" data-tour="credits-table" title={
        <Space><RobotOutlined /><span>AI Providers</span><Badge count={rows.length} color="var(--accent-color)" /></Space>
      }>
        <Table dataSource={rows} columns={cols} rowKey="key" loading={loading}
          pagination={false} size="small"
          rowClassName={r => r.key === selected?.key ? 'bg-blue-50 dark:bg-blue-950' : ''}
          locale={{ emptyText: l === 'vi' ? 'Chua co AI config. Vao Settings > AI de them.' : 'No AI configs. Go to Settings > AI to add one.' }} />
      </Card>

      {/* Detail panel */}
      {selected && (
        <Card size="small" data-tour="credits-detail" title={
          <Space>
            <Tag color={PC[selected.provider]}>{selected.provider}</Tag>
            <span className="font-semibold">{selected.configName}</span>
            <span className="font-mono text-xs" style={{ color: 'var(--text-tertiary)' }}>{selected.model}</span>
          </Space>
        }>
          <Tabs defaultActiveKey="stats" items={[
            {
              key: 'stats',
              label: <span><BarChartOutlined /> {l === 'vi' ? 'Thong ke' : 'Stats'}</span>,
              children: (
                <div className="space-y-4">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
                    {[
                      { label: l === 'vi' ? 'Chi phi tich luy' : 'Total Cost', value: `$${selected.totalCostUsd.toFixed(4)}`, color: 'var(--warning-text)' },
                      { label: 'Input tokens', value: selected.totalInputTokens.toLocaleString(), sub: `$${selected.inputPricePerM}/M` },
                      { label: 'Output tokens', value: selected.totalOutputTokens.toLocaleString(), sub: `$${selected.outputPricePerM}/M` },
                      ...(selected.hasCreditAccount ? [
                        { label: l === 'vi' ? 'So du credit' : 'Credit Balance', value: `$${(selected.balance ?? 0).toFixed(4)}`, color: (selected.balance ?? 0) > 0 ? 'var(--success-text)' : 'var(--error-text)' },
                        { label: l === 'vi' ? 'Da nap' : 'Deposited', value: `$${(selected.totalDeposited ?? 0).toFixed(2)}`, color: 'var(--success-text)' },
                        { label: l === 'vi' ? 'Da tru credit' : 'Credit Used', value: `$${(selected.totalUsed ?? 0).toFixed(4)}`, color: 'var(--error-text)' },
                      ] : []),
                    ].map((item, i) => (
                      <div key={i} className="p-3 rounded-lg" style={{ background: 'var(--bg-secondary)', borderLeft: item.color ? `3px solid ${item.color}` : undefined }}>
                        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{item.label}</div>
                        <div className="text-base font-bold font-mono" style={{ color: item.color || 'var(--text-color)' }}>{item.value}</div>
                        {item.sub && <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{item.sub}</div>}
                      </div>
                    ))}
                  </div>

                  {providerLoading ? (
                    <div className="text-center p-3"><Spin size="small" /><span className="text-xs ml-2" style={{ color: 'var(--text-tertiary)' }}>Loading provider data...</span></div>
                  ) : providerData?.note && (
                    <Alert type="info" showIcon icon={<CloudOutlined />} message={<span className="text-xs">{providerData.note}</span>} style={{ borderRadius: 8 }} />
                  )}
                </div>
              ),
            },
            {
              key: 'history',
              label: <span><HistoryOutlined /> {l === 'vi' ? 'Lich su' : 'History'} {txnTotal > 0 && <Badge count={txnTotal} size="small" style={{ marginLeft: 4 }} />}</span>,
              children: selected.hasCreditAccount ? (
                <div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                    <Select size="small" style={{ width: 120 }} placeholder={l === 'vi' ? 'Loai' : 'Type'} allowClear
                      value={txnFilter || undefined}
                      onChange={v => { setTxnFilter(v ?? ''); loadTxns(selected, v ?? '', 1, dateRange) }}
                      options={Object.entries(TL[l] || {}).map(([k, v]) => ({ value: k, label: v }))} />
                    <RangePicker size="small" style={{ width: 240 }}
                      onChange={(_, strings) => { const r = strings[0] && strings[1] ? [strings[0], strings[1]] as [string, string] : null; setDateRange(r); loadTxns(selected, txnFilter, 1, r) }} />
                    <Button size="small" icon={<ReloadOutlined />} onClick={() => loadTxns(selected, txnFilter, txnPage, dateRange)} loading={txnLoading} />
                  </div>
                  {txns.length === 0 && !txnLoading
                    ? <Empty description={l === 'vi' ? 'Chua co giao dich' : 'No transactions'} />
                    : <Table dataSource={txns} columns={txnCols} rowKey="_id" loading={txnLoading}
                        size="small" scroll={{ x: 600 }}
                        pagination={{ current: txnPage, pageSize: 30, total: txnTotal, showSizeChanger: false,
                          showTotal: t => <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{t} {l === 'vi' ? 'giao dich' : 'txns'}</span>,
                          onChange: p => loadTxns(selected, txnFilter, p, dateRange) }} />}
                </div>
              ) : <Empty description={l === 'vi' ? 'Provider nay chua co credit account. Lich su se co khi credit duoc tao.' : 'No credit account yet.'} />,
            },
          ]} />
        </Card>
      )}

      <TourGuide pageKey="settings-credits" steps={tourSteps['settings-credits'] || []} />
    </div>
  )
}
