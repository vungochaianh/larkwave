'use client'

import type { CurlJob } from '@/lib/types'
import { Card, Descriptions, Progress, Tag, Skeleton } from 'antd'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

type Stats = {
  totalExecutions?: number
  successCount?: number
  errorCount?: number
  successRate?: string | number
  avgExecutionTime?: string | number
}

function parseRate(v: string | number | undefined): number {
  if (v == null) return 0
  const n = parseFloat(String(v).replace('%', ''))
  return isFinite(n) ? Math.min(100, Math.max(0, n)) : 0
}

export default function StatsCard({
  job,
  stats,
}: {
  job: CurlJob | null
  stats: Stats | null
}) {
  if (!job) return <Skeleton active paragraph={{ rows: 6 }} />

  const rate = parseRate(stats?.successRate)
  const statusColor =
    job.lastStatus === 'success'
      ? 'green'
      : job.lastStatus === 'error'
      ? 'red'
      : 'default'

  return (
    <Card title="Statistics" size="small">
      <Descriptions size="small" column={1} bordered>
        <Descriptions.Item label="Enabled">
          <Tag color={job.enabled ? 'green' : 'default'}>
            {job.enabled ? 'ON' : 'OFF'}
          </Tag>
        </Descriptions.Item>

        <Descriptions.Item label="Running">
          <Tag color={job.isRunning ? 'blue' : 'default'}>
            {job.isRunning ? 'RUNNING' : 'IDLE'}
          </Tag>
        </Descriptions.Item>

        <Descriptions.Item label="Interval">
          {job.intervalMinutes} minute{job.intervalMinutes !== 1 ? 's' : ''}
        </Descriptions.Item>

        <Descriptions.Item label="Last Result">
          <Tag color={statusColor}>
            {String(job.lastStatus || 'pending').toUpperCase()}
          </Tag>
        </Descriptions.Item>

        <Descriptions.Item label="Last Run">
          {job.lastExecuted ? (
            <span
              title={dayjs(job.lastExecuted).format('YYYY-MM-DD HH:mm:ss')}
              className="cursor-help"
            >
              {dayjs(job.lastExecuted).fromNow()}
            </span>
          ) : (
            '—'
          )}
        </Descriptions.Item>

        <Descriptions.Item label="Total Runs">
          {stats?.totalExecutions ?? job.executionCount ?? '—'}
        </Descriptions.Item>

        <Descriptions.Item label="Success / Error">
          {stats
            ? `${stats.successCount ?? 0} / ${stats.errorCount ?? 0}`
            : '—'}
        </Descriptions.Item>

        <Descriptions.Item label="Success Rate">
          {stats ? (
            <div className="w-full pr-2">
              <Progress
                percent={Math.round(rate)}
                size="small"
                status={rate === 100 ? 'success' : rate === 0 ? 'exception' : 'normal'}
              />
            </div>
          ) : (
            '—'
          )}
        </Descriptions.Item>

        <Descriptions.Item label="Avg Duration">
          {stats?.avgExecutionTime ?? '—'}
        </Descriptions.Item>
      </Descriptions>
    </Card>
  )
}
