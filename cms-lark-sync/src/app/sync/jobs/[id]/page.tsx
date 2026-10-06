'use client'

import JobForm from '@/components/JobForm'
import LogsTable from '@/components/LogsTable'
import StatsCard from '@/components/StatsCard'
import {
  Button,
  Card,
  Divider,
  Space,
  Tag,
  Tooltip,
  message,
} from 'antd'
import { useEffect, useState } from 'react'
import {
  executeJob,
  getJob,
  getJobLogs,
  getJobStats,
  toggleJob,
  updateJob,
} from '@/lib/api'
import { buildCurl, copyToClipboard, parseCurl } from '@/lib/curl'
import type { CurlJob, ExecutionLog } from '@/lib/types'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeftOutlined,
  CopyOutlined,
  EditOutlined,
  PlayCircleOutlined,
  PoweroffOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import Link from 'next/link'

export default function JobDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const router = useRouter()

  const [job, setJob] = useState<CurlJob | null>(null)
  const [logs, setLogs] = useState<ExecutionLog[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [openEdit, setOpenEdit] = useState(false)

  async function loadAll() {
    setLoading(true)
    try {
      const [j, l, s] = await Promise.all([
        getJob(id),
        getJobLogs(id, { limit: 50 }),
        getJobStats(id),
      ])
      if (!j.success) throw new Error(j.error || 'Load job failed')
      setJob(j.data)
      setLogs(l.data || [])
      setStats(s.data ?? null)
    } catch (e: any) {
      message.error(e.message)
      router.push('/sync/jobs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function handleRun() {
    try {
      const res = await executeJob(id)
      if (res.data) {
        const log = res.data as any
        const ok  = log.status === 'success'
        message.open({
          type:    ok ? 'success' : 'error',
          content: ok
            ? `Completed in ${log.executionTime}ms — HTTP ${log.response?.statusCode}`
            : `Failed: ${log.error || 'unknown error'}`,
          duration: 5,
        })
      } else {
        message.success('Job triggered')
      }
      loadAll()
    } catch (e: any) {
      message.error(e.message)
    }
  }

  async function handleToggle() {
    try {
      await toggleJob(id)
      message.success(job?.enabled ? 'Job disabled' : 'Job enabled')
      loadAll()
    } catch (e: any) {
      message.error(e.message)
    }
  }

  // Build a formatted (multiline) version of the stored curl for display
  const formattedCurl = (() => {
    if (!job?.curlCommand) return ''
    try {
      const p = parseCurl(job.curlCommand)
      return buildCurl({ ...p, multiline: true })
    } catch {
      return job.curlCommand
    }
  })()

  return (
    <div className="max-w-[1200px] mx-auto">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Link href="/sync/jobs">
            <Button icon={<ArrowLeftOutlined />} size="small" type="text" />
          </Link>
          <div>
            <div className="text-xl font-semibold flex items-center gap-2">
              {job?.name || 'Job'}
              {job && (
                <Tag color={job.enabled ? 'green' : 'default'}>
                  {job.enabled ? 'ON' : 'OFF'}
                </Tag>
              )}
              {job?.isRunning && <Tag color="blue">RUNNING</Tag>}
            </div>
            <div className="text-sm text-neutral-500">{job?.description || '—'}</div>
          </div>
        </div>

        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadAll} loading={loading}>
            Refresh
          </Button>
          <Button icon={<PlayCircleOutlined />} onClick={handleRun}>
            Run now
          </Button>
          <Button icon={<PoweroffOutlined />} onClick={handleToggle}>
            Toggle
          </Button>
          <Button
            type="primary"
            icon={<EditOutlined />}
            onClick={() => setOpenEdit(true)}
          >
            Edit
          </Button>
        </Space>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: curl + logs */}
        <div className="lg:col-span-2 space-y-4">
          <Card
            title="cURL Command"
            extra={
              <Tooltip title="Copy curl to clipboard">
                <Button
                  icon={<CopyOutlined />}
                  size="small"
                  onClick={async () => {
                    const ok = await copyToClipboard(formattedCurl || job?.curlCommand || '')
                    if (ok) message.success('Copied')
                    else message.error('Copy failed')
                  }}
                >
                  Copy
                </Button>
              </Tooltip>
            }
          >
            <pre className="text-xs font-mono whitespace-pre-wrap bg-neutral-50 border rounded-lg p-3 max-h-64 overflow-auto">
              {formattedCurl || job?.curlCommand || (
                <span className="text-neutral-400">No curl command</span>
              )}
            </pre>
          </Card>

          <Card
            title="Recent Logs (last 50)"
            extra={
              <Link href={`/sync/logs?jobId=${id}`}>
                <Button size="small" type="link">
                  See all logs →
                </Button>
              </Link>
            }
          >
            <LogsTable data={logs} loading={loading} />
          </Card>
        </div>

        {/* Right: stats + API docs */}
        <div className="space-y-4">
          <StatsCard job={job} stats={stats} />

          <Divider />

          <Card title="API Reference" size="small">
            <ul className="text-xs list-none space-y-2 text-neutral-700 font-mono">
              {[
                ['POST', `/api/jobs/${id}/execute`],
                ['PATCH', `/api/jobs/${id}/toggle`],
                ['GET', `/api/jobs/${id}/stats`],
                ['GET', `/api/jobs/${id}/logs`],
                ['PUT', `/api/jobs/${id}`],
                ['DELETE', `/api/jobs/${id}`],
              ].map(([verb, path]) => (
                <li key={path} className="flex gap-2 items-start">
                  <Tag
                    className="font-mono text-xs"
                    color={
                      verb === 'POST'
                        ? 'blue'
                        : verb === 'GET'
                        ? 'green'
                        : verb === 'DELETE'
                        ? 'red'
                        : 'orange'
                    }
                  >
                    {verb}
                  </Tag>
                  <code className="text-neutral-500 break-all">{path}</code>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      {/* Edit modal */}
      <JobForm
        open={openEdit}
        title="Edit Job"
        initial={job || undefined}
        onClose={() => setOpenEdit(false)}
        onSubmit={async (payload) => {
          const res = await updateJob(id, payload)
          if (!res.success) throw new Error(res.error || 'Update failed')
          message.success('Job updated')
          setOpenEdit(false)
          loadAll()
        }}
      />
    </div>
  )
}

