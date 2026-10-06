'use client'

import JobForm from '@/components/JobForm'
import {
  Button,
  Card,
  Divider,
  Input,
  Popconfirm,
  Space,
  Table,
  Tag,
  Tooltip,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import {
  createJob,
  deleteJob,
  executeJob,
  getJobs,
  toggleJob,
  updateJob,
} from '@/lib/api'
import type { CurlJob } from '@/lib/types'
import Link from 'next/link'
import {
  DeleteOutlined,
  EditOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  PoweroffOutlined,
  ReloadOutlined,
} from '@ant-design/icons'

export default function JobsPage() {
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<CurlJob[]>([])
  const [search, setSearch] = useState('')
  const [openCreate, setOpenCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<CurlJob | null>(null)

  async function load(q = search) {
    setLoading(true)
    try {
      const res = await getJobs({ search: q.trim() || undefined })
      if (!res.success) throw new Error(res.error || 'Load jobs failed')
      setRows(res.data || [])
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = rows

  async function handleExecute(r: CurlJob) {
    try {
      await executeJob(r._id)
      message.success(`Job "${r.name}" triggered`)
    } catch (e: any) {
      message.error(e.message)
    }
  }

  async function handleToggle(r: CurlJob) {
    try {
      await toggleJob(r._id)
      message.success(r.enabled ? 'Job disabled' : 'Job enabled')
      load()
    } catch (e: any) {
      message.error(e.message)
    }
  }

  async function handleDelete(r: CurlJob, deleteLogs: boolean) {
    try {
      await deleteJob(r._id, deleteLogs)
      message.success(deleteLogs ? 'Job and logs deleted' : 'Job deleted')
      load()
    } catch (e: any) {
      message.error(e.message)
    }
  }

  const cols: ColumnsType<CurlJob> = [
    {
      title: 'Name',
      dataIndex: 'name',
      render: (_, r) => (
        <Link
          className="font-semibold text-blue-600 hover:underline"
          href={`/sync/jobs/${r._id}`}
        >
          {r.name}
        </Link>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      render: (v) => (
        <Tooltip title={v}>
          <span className="text-xs text-neutral-500 line-clamp-1">{v || '—'}</span>
        </Tooltip>
      ),
    },
    {
      title: 'Interval',
      dataIndex: 'intervalMinutes',
      width: 100,
      render: (v) => <span className="font-mono text-xs">{v}m</span>,
    },
    {
      title: 'Status',
      width: 160,
      render: (_, r) => (
        <Space size={4}>
          <Tag color={r.enabled ? 'green' : 'default'}>{r.enabled ? 'ON' : 'OFF'}</Tag>
          <Tag color={r.isRunning ? 'blue' : 'default'}>
            {r.isRunning ? 'RUNNING' : 'IDLE'}
          </Tag>
        </Space>
      ),
    },
    {
      title: 'Last Result',
      dataIndex: 'lastStatus',
      width: 110,
      render: (v) => {
        const color =
          v === 'success' ? 'green' : v === 'error' ? 'red' : 'default'
        return <Tag color={color}>{String(v || 'pending').toUpperCase()}</Tag>
      },
    },
    {
      title: 'Last Run',
      dataIndex: 'lastExecuted',
      width: 170,
      render: (v) =>
        v ? (
          <span className="text-xs">{dayjs(v).format('YYYY-MM-DD HH:mm:ss')}</span>
        ) : (
          '—'
        ),
    },
    {
      title: 'Runs',
      dataIndex: 'executionCount',
      width: 70,
      align: 'right',
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 240,
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="Run now">
            <Button
              size="small"
              icon={<PlayCircleOutlined />}
              onClick={() => handleExecute(r)}
            />
          </Tooltip>

          <Tooltip title={r.enabled ? 'Disable' : 'Enable'}>
            <Button
              size="small"
              icon={<PoweroffOutlined />}
              onClick={() => handleToggle(r)}
            />
          </Tooltip>

          <Tooltip title="Edit">
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => setEditTarget(r)}
            />
          </Tooltip>

          <Popconfirm
            title="Delete job?"
            description="Logs will be kept."
            okText="Delete"
            cancelText="Cancel"
            onConfirm={() => handleDelete(r, false)}
          >
            <Tooltip title="Delete job (keep logs)">
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>

          <Popconfirm
            title="Delete job + all logs?"
            okText="Delete All"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(r, true)}
          >
            <Tooltip title="Delete job + logs">
              <Button size="small" danger type="primary">
                +Logs
              </Button>
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between my-2">
        <span className="text-base font-semibold text-neutral-700">
          Jobs ({filtered.length})
        </span>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => load()} loading={loading}>
            Refresh
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setOpenCreate(true)}
          >
            New Job
          </Button>
        </Space>
      </div>

      <Card>
        {/* Search */}
        <Input.Search
          placeholder="Search by name or description…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onSearch={(v) => load(v)}
          onClear={() => { setSearch(''); load('') }}
          allowClear
          enterButton
          className="max-w-sm"
        />

        <Divider />

        <Table
          rowKey="_id"
          loading={loading}
          columns={cols}
          dataSource={filtered}
          pagination={{ pageSize: 15, showSizeChanger: true }}
          size="small"
        />
      </Card>

      {/* Create */}
      <JobForm
        open={openCreate}
        title="Create Job"
        onClose={() => setOpenCreate(false)}
        onSubmit={async (payload) => {
          const res = await createJob(payload)
          if (!res.success) throw new Error(res.error || 'Create failed')
          message.success('Job created')
          setOpenCreate(false)
          load()
        }}
      />

      {/* Edit (inline on list page) */}
      {editTarget && (
        <JobForm
          open
          title={`Edit — ${editTarget.name}`}
          initial={editTarget}
          onClose={() => setEditTarget(null)}
          onSubmit={async (payload) => {
            const res = await updateJob(editTarget._id, payload)
            if (!res.success) throw new Error(res.error || 'Update failed')
            message.success('Job updated')
            setEditTarget(null)
            load()
          }}
        />
      )}
    </div>
  )
}
