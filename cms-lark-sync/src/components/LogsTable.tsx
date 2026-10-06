'use client'

import type { ExecutionLog } from '@/lib/types'
import { Table, Tag, Typography, Collapse, Popconfirm, Button, message } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import type { ColumnsType, TableRowSelection } from 'antd/es/table/interface'
import dayjs from 'dayjs'
import { deleteLog } from '@/lib/api'
import { useState } from 'react'

const { Text } = Typography

function ExpandedRow({ record }: { record: ExecutionLog }) {
  const items = []

  if (record.response) {
    const body =
      typeof record.response.data === 'string'
        ? record.response.data
        : JSON.stringify(record.response.data, null, 2)

    items.push({
      key: 'response',
      label: 'Response body',
      children: (
        <pre className="text-xs font-mono whitespace-pre-wrap bg-neutral-50 rounded p-2 max-h-60 overflow-auto">
          {body || '(empty)'}
        </pre>
      ),
    })
  }

  if (record.error) {
    items.push({
      key: 'error',
      label: 'Error detail',
      children: (
        <pre className="text-xs font-mono text-red-600 whitespace-pre-wrap bg-red-50 rounded p-2">
          {record.error}
        </pre>
      ),
    })
  }

  if (!items.length) return <span className="text-neutral-400 text-xs">No detail available</span>

  return <Collapse size="small" ghost items={items} defaultActiveKey={['response', 'error']} />
}

export default function LogsTable({
  data,
  loading,
  pagination,
  onChange,
  selectedRowKeys,
  onSelectionChange,
  onDeleted,
}: {
  data: ExecutionLog[]
  loading?: boolean
  pagination?: any
  onChange?: (p: any) => void
  selectedRowKeys?: React.Key[]
  onSelectionChange?: (keys: React.Key[], rows: ExecutionLog[]) => void
  onDeleted?: (id: string) => void
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const res = await deleteLog(id)
      if (!res.success) throw new Error((res as any).error || 'Delete failed')
      message.success('Log deleted')
      onDeleted?.(id)
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setDeletingId(null)
    }
  }

  const cols: ColumnsType<ExecutionLog> = [
    {
      title: 'Time',
      dataIndex: 'timestamp',
      width: 170,
      render: (v) => (
        <span className="text-xs font-mono">{dayjs(v).format('YYYY-MM-DD HH:mm:ss')}</span>
      ),
    },
    {
      title: 'Job',
      dataIndex: 'jobName',
      width: 200,
      render: (v) => <Text strong className="text-sm">{v}</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 110,
      render: (v) => (
        <Tag color={v === 'success' ? 'green' : 'red'}>{String(v).toUpperCase()}</Tag>
      ),
    },
    {
      title: 'HTTP',
      key: 'http',
      width: 90,
      render: (_, r) => {
        const code = r.response?.statusCode
        if (!code) return <span className="text-neutral-400">—</span>
        const ok = code >= 200 && code < 300
        return <Tag color={ok ? 'green' : 'red'}>{code}</Tag>
      },
    },
    {
      title: 'Duration',
      dataIndex: 'executionTime',
      width: 100,
      render: (v) =>
        typeof v === 'number' ? (
          <span className="font-mono text-xs">{v}ms</span>
        ) : (
          <span className="text-neutral-400">—</span>
        ),
    },
    {
      title: 'Summary',
      key: 'result',
      render: (_, r) => {
        if (r.status === 'error') {
          return (
            <span className="text-red-500 text-xs line-clamp-1">
              {r.error || 'Error'}
            </span>
          )
        }
        const preview =
          typeof r.response?.data === 'string'
            ? r.response.data
            : JSON.stringify(r.response?.data ?? {})
        return (
          <span className="text-xs text-neutral-500 line-clamp-1 font-mono">
            {preview}
          </span>
        )
      },
    },
    {
      title: '',
      key: 'actions',
      width: 48,
      render: (_, r) => (
        <Popconfirm
          title="Delete this log?"
          okText="Delete"
          okButtonProps={{ danger: true }}
          cancelText="Cancel"
          onConfirm={() => handleDelete(r._id)}
        >
          <Button
            type="text"
            danger
            size="small"
            icon={<DeleteOutlined />}
            loading={deletingId === r._id}
          />
        </Popconfirm>
      ),
    },
  ]

  const rowSelection: TableRowSelection<ExecutionLog> | undefined =
    onSelectionChange
      ? {
          selectedRowKeys,
          onChange: onSelectionChange,
          selections: [
            Table.SELECTION_ALL,
            Table.SELECTION_INVERT,
            Table.SELECTION_NONE,
          ],
        }
      : undefined

  return (
    <Table
      rowKey="_id"
      loading={loading}
      columns={cols}
      dataSource={data}
      pagination={pagination}
      onChange={(pg) => onChange?.(pg)}
      size="small"
      rowSelection={rowSelection}
      expandable={{
        expandedRowRender: (record) => <ExpandedRow record={record} />,
        rowExpandable: (r) => !!(r.response?.data || r.error),
      }}
    />
  )
}
