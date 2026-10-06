'use client'

import { Button, Card, Input, Popconfirm, Space, Statistic, Tag, Tooltip, Typography } from 'antd'
import {
  CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined,
  DeleteOutlined, DownloadOutlined, FileTextOutlined, ReloadOutlined,
} from '@ant-design/icons'
import { useCallback, useEffect, useState } from 'react'
import { AI_LOG_STORAGE_KEY } from '../_lib/utils'
import type { AILogEntry } from '../_lib/types'

const { Title, Text } = Typography

type Filter = 'all' | 'success' | 'error'

function loadFromStorage(): AILogEntry[] {
  try {
    const saved = localStorage.getItem(AI_LOG_STORAGE_KEY)
    return saved ? (JSON.parse(saved) as AILogEntry[]) : []
  } catch { return [] }
}

export default function HistoryPage() {
  const [entries,    setEntries]    = useState<AILogEntry[]>([])
  const [filter,     setFilter]     = useState<Filter>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const refresh = useCallback(() => {
    setEntries(loadFromStorage())
    setLastRefresh(new Date())
  }, [])

  // ── Load on mount ────────────────────────────────────────────────────────────
  useEffect(() => { refresh() }, [refresh])

  // ── Auto-refresh when window gains focus ─────────────────────────────────────
  useEffect(() => {
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [refresh])

  // ── Actions ──────────────────────────────────────────────────────────────────
  function exportJSON() {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url
    a.download = `ai-debug-log-${new Date().toISOString().slice(0,10)}.json`; a.click()
    URL.revokeObjectURL(url)
  }

  function clearLog() {
    try { localStorage.removeItem(AI_LOG_STORAGE_KEY) } catch { }
    setEntries([])
  }

  // ── Derived ──────────────────────────────────────────────────────────────────
  const errorCount   = entries.filter(e => e.status === 'error').length
  const successCount = entries.filter(e => e.status === 'success').length
  const avgDuration  = (() => {
    const completed = entries.filter(e => e.durationMs !== undefined)
    if (!completed.length) return null
    return completed.reduce((s, e) => s + (e.durationMs ?? 0), 0) / completed.length / 1000
  })()

  const filtered = [...entries]
    .filter(e => filter === 'all' || e.status === filter)
    .filter(e => !searchTerm ||
      e.step.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.inputSummary.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.outputSummary.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.error ?? '').toLowerCase().includes(searchTerm.toLowerCase()))
    .reverse()

  const errorRate = entries.length > 0 ? Math.round(errorCount / entries.length * 100) : 0

  return (
    <div className="p-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <Title level={4} className="!mb-0">AI Operation History</Title>
          <Text className="text-neutral-500 text-sm">
            Lịch sử tất cả AI operations — lưu trong localStorage
          </Text>
        </div>
        <Space wrap>
          <Tooltip title={`Cập nhật lúc ${lastRefresh.toLocaleTimeString()} · Tự động refresh khi focus tab`}>
            <Button size="small" icon={<ReloadOutlined />} onClick={refresh}>
              Refresh
            </Button>
          </Tooltip>
          <Button size="small" icon={<DownloadOutlined />} onClick={exportJSON} disabled={!entries.length}>
            Export JSON
          </Button>
          <Popconfirm
            title="Xóa toàn bộ log?"
            description="Thao tác này không thể hoàn tác."
            onConfirm={clearLog}
            okText="Xóa" cancelText="Hủy" okButtonProps={{ danger: true }}>
            <Button size="small" danger icon={<DeleteOutlined />} disabled={!entries.length}>
              Xóa log
            </Button>
          </Popconfirm>
        </Space>
      </div>

      {/* Stats row */}
      {entries.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <Card size="small" className="text-center">
            <Statistic title="Tổng operations" value={entries.length} prefix={<FileTextOutlined />} />
          </Card>
          <Card size="small" className="text-center">
            <Statistic title="Thành công" value={successCount}
              prefix={<CheckCircleOutlined className="text-green-500" />}
              valueStyle={{ color: 'var(--success-text)' }} />
          </Card>
          <Card size="small" className="text-center">
            <Statistic title="Lỗi" value={errorCount}
              prefix={<CloseCircleOutlined className="text-red-500" />}
              valueStyle={{ color: errorCount > 0 ? 'var(--error-text)' : undefined }} />
          </Card>
          <Card size="small" className="text-center">
            <Statistic title="TB thời gian" value={avgDuration !== null ? `${avgDuration.toFixed(1)}s` : '—'}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ fontSize: 20 }} />
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="mb-3 flex items-center gap-3 flex-wrap">
        <Space size={4}>
          {(['all', 'success', 'error'] as Filter[]).map(f => (
            <button key={f} type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded text-xs border transition-colors ${
                filter === f
                  ? f === 'error' ? 'bg-red-500 text-white border-red-500'
                    : f === 'success' ? 'bg-green-500 text-white border-green-500'
                    : 'bg-blue-500 text-white border-blue-500'
                  : 'bg-white text-neutral-600 border-neutral-300 hover:border-neutral-400'
              }`}>
              {f === 'all' ? `Tất cả (${entries.length})` : f === 'success' ? `✓ OK (${successCount})` : `✗ Lỗi (${errorCount})`}
            </button>
          ))}
        </Space>

        <Input.Search
          size="small"
          placeholder="Tìm step, input, output…"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          onSearch={() => {}}
          allowClear
          style={{ maxWidth: 280 }}
        />

        {(filter !== 'all' || searchTerm) && (
          <Text className="text-xs text-neutral-400">{filtered.length} kết quả</Text>
        )}
      </div>

      {/* Content */}
      {entries.length === 0 ? (
        <Card>
          <div className="text-center py-16 text-neutral-400">
            <FileTextOutlined className="text-5xl block mb-3 opacity-30" />
            <div className="text-base mb-1">Chưa có AI operation nào</div>
            <div className="text-xs">Thực hiện Generate Schema, Analyze hoặc Extract AI để ghi log.</div>
            <div className="text-xs mt-1 text-neutral-300">Log tự động refresh khi bạn quay lại tab này.</div>
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <div className="text-center py-10 text-neutral-400 text-sm">
            Không có kết quả khớp với bộ lọc hiện tại.{' '}
            <button type="button" className="text-blue-500 underline" onClick={() => { setFilter('all'); setSearchTerm('') }}>
              Xóa filter
            </button>
          </div>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded shadow-sm">
          <table className="w-full text-xs border-collapse bg-white">
            <thead>
              <tr className="bg-neutral-100 text-neutral-600 sticky top-0 z-10">
                {['Thời gian', 'Step', 'Status', 'Thời lượng', 'Input', 'Output / Error'].map(h => (
                  <th key={h} className="px-3 py-2 border border-neutral-200 text-left font-semibold whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry, i) => (
                <tr key={entry.id}
                  className={`${i % 2 === 0 ? 'bg-white' : 'bg-neutral-50'} hover:bg-blue-50 transition-colors`}>
                  <td className="px-3 py-1.5 border border-neutral-200 text-neutral-400 whitespace-nowrap font-mono">
                    <div>{new Date(entry.timestamp).toLocaleTimeString()}</div>
                    <div className="text-xs opacity-60">{new Date(entry.timestamp).toLocaleDateString()}</div>
                  </td>
                  <td className="px-3 py-1.5 border border-neutral-200 font-mono font-medium text-blue-700 whitespace-nowrap">
                    {entry.step}
                  </td>
                  <td className="px-3 py-1.5 border border-neutral-200 whitespace-nowrap">
                    <Tag
                      color={entry.status === 'success' ? 'green' : entry.status === 'error' ? 'red' : 'blue'}
                      icon={entry.status === 'success' ? <CheckCircleOutlined /> : entry.status === 'error' ? <CloseCircleOutlined /> : undefined}
                      className="text-xs m-0">
                      {entry.status === 'running' ? 'running…' : entry.status === 'success' ? 'OK' : 'lỗi'}
                    </Tag>
                  </td>
                  <td className="px-3 py-1.5 border border-neutral-200 font-mono whitespace-nowrap text-neutral-500">
                    {entry.durationMs !== undefined ? (
                      <span className={entry.durationMs > 30000 ? 'text-orange-500' : ''}>
                        {(entry.durationMs / 1000).toFixed(1)}s
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-1.5 border border-neutral-200 text-neutral-600 max-w-[240px]">
                    <Tooltip title={entry.inputSummary} placement="top">
                      <div className="truncate cursor-default">{entry.inputSummary}</div>
                    </Tooltip>
                  </td>
                  <td className={`px-3 py-1.5 border border-neutral-200 max-w-[280px] ${entry.status === 'error' ? 'text-red-600' : 'text-green-700'}`}>
                    <Tooltip title={entry.error ?? entry.outputSummary} placement="top">
                      <div className="truncate cursor-default">{entry.error ?? entry.outputSummary}</div>
                    </Tooltip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="bg-neutral-50 border border-t-0 border-neutral-200 rounded-b px-3 py-1.5 text-xs text-neutral-400 flex justify-between">
            <span>{filtered.length} / {entries.length} entries</span>
            <span>Cập nhật: {lastRefresh.toLocaleTimeString()}</span>
          </div>
        </div>
      )}
    </div>
  )
}
