'use client'

import LogsTable from '@/components/LogsTable'
import { Button, Card, Input, InputNumber, Popconfirm, Select, Space, message } from 'antd'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { getLogs, deleteLogs, deleteAllLogs, cleanupLogs } from '@/lib/api'
import type { ExecutionLog } from '@/lib/types'
import { ClearOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons'

function LogsContent() {
  const searchParams = useSearchParams()

  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<ExecutionLog[]>([])
  const [status, setStatus] = useState<'success' | 'error' | undefined>(undefined)
  const [jobId, setJobId] = useState(searchParams.get('jobId') ?? '')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [total, setTotal] = useState(0)
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([])
  const [deleting, setDeleting] = useState(false)
  const [cleanupDays, setCleanupDays] = useState(7)

  async function load(p = page, l = limit) {
    setLoading(true)
    try {
      const res = await getLogs({
        page: p, limit: l, status,
        jobId: jobId.trim() || undefined,
        order: 'desc', sortBy: 'timestamp',
      })
      if (!res.success) throw new Error(res.error || 'Load logs failed')
      setRows(res.data || [])
      setTotal(res.pagination?.total ?? 0)
      setPage(res.pagination?.page ?? p)
      setLimit(res.pagination?.limit ?? l)
      setSelectedKeys([])
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(1, limit) }, [status])

  function handleClear() {
    setJobId('')
    setStatus(undefined)
    load(1, limit)
  }

  async function handleDeleteSelected() {
    if (selectedKeys.length === 0) return
    setDeleting(true)
    try {
      const res = await deleteLogs(selectedKeys as string[])
      message.success(`Deleted ${res.data?.deletedCount ?? selectedKeys.length} log(s)`)
      await load(1, limit)
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setDeleting(false)
    }
  }

  async function handleDeleteAll() {
    setDeleting(true)
    try {
      const res = await deleteAllLogs(jobId.trim() || undefined)
      message.success(`Deleted ${res.data?.deletedCount ?? 0} log(s)`)
      await load(1, limit)
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setDeleting(false)
    }
  }

  async function handleCleanup() {
    setDeleting(true)
    try {
      const res = await cleanupLogs(cleanupDays)
      message.success(`Cleaned up ${res.data?.deletedCount ?? 0} old log(s) (older than ${cleanupDays} days)`)
      await load(1, limit)
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <div className="text-base font-semibold text-neutral-700 mb-2">
        Execution Logs{total > 0 ? ` (${total} total)` : ''}
      </div>

      {/* Filters */}
      <Card className="mb-3">
        <div className="flex flex-wrap gap-2 items-center">
          <Select
            allowClear
            placeholder="Filter by status"
            style={{ width: 160 }}
            value={status}
            onChange={(v) => setStatus(v)}
            options={[
              { value: 'success', label: '✅ Success' },
              { value: 'error', label: '❌ Error' },
            ]}
          />
          <Input
            placeholder="Filter by Job ID (optional)"
            className="w-72 font-mono text-xs"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            onPressEnter={() => load(1, limit)}
            allowClear
          />
          <Space>
            <Button type="primary" icon={<ReloadOutlined />} onClick={() => load(1, limit)} loading={loading}>
              Search
            </Button>
            <Button icon={<ClearOutlined />} onClick={handleClear}>
              Clear
            </Button>
          </Space>
        </div>
      </Card>

      {/* Bulk actions */}
      <Card className="mb-3" size="small">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-neutral-500">
            {selectedKeys.length > 0 ? `${selectedKeys.length} selected` : 'Select rows to delete'}
          </span>

          <Popconfirm
            title={`Delete ${selectedKeys.length} selected log(s)?`}
            onConfirm={handleDeleteSelected}
            disabled={selectedKeys.length === 0}
            okText="Delete" cancelText="Cancel" okButtonProps={{ danger: true }}
          >
            <Button
              danger
              icon={<DeleteOutlined />}
              disabled={selectedKeys.length === 0}
              loading={deleting}
              size="small"
            >
              Delete selected ({selectedKeys.length})
            </Button>
          </Popconfirm>

          <Popconfirm
            title={jobId.trim() ? `Delete ALL logs for this job?` : 'Delete ALL logs in the database?'}
            description="This cannot be undone."
            onConfirm={handleDeleteAll}
            okText="Delete all" cancelText="Cancel" okButtonProps={{ danger: true }}
          >
            <Button danger icon={<DeleteOutlined />} loading={deleting} size="small">
              {jobId.trim() ? 'Delete all (this job)' : 'Delete all logs'}
            </Button>
          </Popconfirm>

          <div className="flex items-center gap-1 ml-auto">
            <span className="text-xs text-neutral-400">Cleanup older than</span>
            <InputNumber
              min={1} max={365} value={cleanupDays}
              onChange={(v) => setCleanupDays(v ?? 7)}
              style={{ width: 70 }} size="small"
            />
            <span className="text-xs text-neutral-400">days</span>
            <Popconfirm
              title={`Delete logs older than ${cleanupDays} days?`}
              onConfirm={handleCleanup}
              okText="Cleanup" cancelText="Cancel" okButtonProps={{ danger: true }}
            >
              <Button size="small" loading={deleting}>Cleanup</Button>
            </Popconfirm>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card>
        <LogsTable
          data={rows}
          loading={loading}
          selectedRowKeys={selectedKeys}
          onSelectionChange={(keys) => setSelectedKeys(keys)}
          onDeleted={(id) => {
            setRows(prev => prev.filter(r => r._id !== id))
            setTotal(prev => prev - 1)
            setSelectedKeys(prev => prev.filter(k => k !== id))
          }}
          pagination={{
            current: page, pageSize: limit, total,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: (t: number) => `Total ${t} logs`,
          }}
          onChange={(pg) => {
            const nextPage = pg.current || 1
            const nextSize = pg.pageSize || limit
            setPage(nextPage)
            setLimit(nextSize)
            load(nextPage, nextSize)
          }}
        />
      </Card>
    </div>
  )
}

export default function LogsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-neutral-400">Loading logs…</div>}>
      <LogsContent />
    </Suspense>
  )
}
