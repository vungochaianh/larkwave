'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Card, Table, Button, Tag, Space, Typography, Modal, Tabs, Select,
  Popconfirm, message, Descriptions, Empty, Steps, Alert, Progress,
} from 'antd';
import {
  FileSearchOutlined, ReloadOutlined, DeleteOutlined,
  CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined,
  EyeOutlined, CopyOutlined, LoadingOutlined,
  CloudDownloadOutlined, ThunderboltOutlined, FileTextOutlined,
  ApartmentOutlined, DatabaseOutlined, SendOutlined,
} from '@ant-design/icons';
import {
  listBases, listAnalyses, getAnalysis, deleteAnalysis, cancelAnalysis,
  streamAnalysis, publishToWiki,
  type BaseReg, type Analysis, type ProgressEvent,
} from '@/lib/baApi';

const { Title, Text, Paragraph } = Typography;

const STATUS_MAP: Record<string, { color: string; icon: React.ReactNode; label: string; step: number }> = {
  pending:    { color: 'default',    icon: <ClockCircleOutlined />,   label: 'Waiting',     step: 0 },
  fetching:   { color: 'processing', icon: <LoadingOutlined spin />,  label: 'Fetching',    step: 1 },
  analyzing:  { color: 'processing', icon: <LoadingOutlined spin />,  label: 'Analyzing',   step: 2 },
  generating: { color: 'processing', icon: <LoadingOutlined spin />,  label: 'Generating',  step: 3 },
  completed:  { color: 'success',    icon: <CheckCircleOutlined />,   label: 'Completed',   step: 4 },
  failed:     { color: 'error',      icon: <CloseCircleOutlined />,   label: 'Failed',      step: -1 },
};

const FLOW_STEPS = [
  { title: 'Pending', description: 'Waiting to start' },
  { title: 'Fetching', description: 'Reading schema from Lark Base API' },
  { title: 'Analyzing', description: 'AI analyzes each table (L1), relationships (L2), overview (L3)' },
  { title: 'Generating', description: 'Creating ERD diagram + documentation' },
  { title: 'Done', description: 'Results saved, notification sent' },
];

function formatETA(elapsedMs: number, progress: number): string {
  if (progress <= 0.05 || elapsedMs < 2000) return 'Calculating...';
  const totalEstMs = elapsedMs / progress;
  const remainMs = totalEstMs - elapsedMs;
  if (remainMs <= 0) return 'Almost done...';
  const secs = Math.ceil(remainMs / 1000);
  if (secs < 60) return `~${secs}s remaining`;
  return `~${Math.ceil(secs / 60)}m remaining`;
}

export default function AnalysesPage() {
  const [bases, setBases] = useState<BaseReg[]>([]);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filterBaseId, setFilterBaseId] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<Analysis | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // SSE streaming state
  const [streamProgress, setStreamProgress] = useState<ProgressEvent | null>(null);
  const streamCleanupRef = useRef<(() => void) | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, a] = await Promise.all([
        listBases().catch(() => []),
        listAnalyses(filterBaseId, page, 20).catch(() => ({ analyses: [], total: 0 })),
      ]);
      setBases(b);
      setAnalyses(a.analyses);
      setTotal(a.total);
    } catch {
      message.error('Failed to load');
    }
    setLoading(false);
  }, [filterBaseId, page]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh when there are in-progress analyses (fallback for SSE)
  useEffect(() => {
    const hasInProgress = analyses.some(a =>
      ['pending', 'fetching', 'analyzing', 'generating'].includes(a.status)
    );
    if (!hasInProgress) return;
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, [analyses, load]);

  // Cleanup SSE on unmount or modal close
  useEffect(() => {
    return () => { streamCleanupRef.current?.(); };
  }, []);

  const startStream = (analysisId: string) => {
    streamCleanupRef.current?.();
    setStreamProgress(null);

    const cleanup = streamAnalysis(
      analysisId,
      (event) => {
        setStreamProgress(event);
        // Update detail in realtime
        if (event.tables_count || event.fields_count || event.chunks_done !== undefined) {
          setDetail(prev => prev ? {
            ...prev,
            status: event.step === 'completed' ? 'completed' : event.step === 'failed' ? 'failed' : prev.status,
            tables_count: event.tables_count ?? prev.tables_count,
            fields_count: event.fields_count ?? prev.fields_count,
            chunks_analyzed: event.chunks_done ?? prev.chunks_analyzed,
            chunks_total: event.chunks_total ?? prev.chunks_total,
            duration_ms: event.duration_ms ?? prev.duration_ms,
            system_summary: event.system_summary ?? prev.system_summary,
          } : prev);
        }
      },
      () => {
        // Stream ended — reload data
        load();
      },
    );
    streamCleanupRef.current = cleanup;
  };

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    setDetailOpen(true);
    setDetail(null);
    setStreamProgress(null);
    try {
      const a = await getAnalysis(id);
      setDetail(a);
      // Start SSE if analysis is in progress
      if (['pending', 'fetching', 'analyzing', 'generating'].includes(a.status)) {
        startStream(id);
      }
    } catch {
      message.error('Failed to load analysis');
    }
    setDetailLoading(false);
  };

  const closeDetail = () => {
    setDetailOpen(false);
    streamCleanupRef.current?.();
    streamCleanupRef.current = null;
    setStreamProgress(null);
  };

  const handleCancel = async (id: string) => {
    try {
      await cancelAnalysis(id);
      message.success('Analysis cancelled');
      load();
    } catch {
      message.error('Cancel failed');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAnalysis(id);
      message.success('Deleted');
      load();
    } catch {
      message.error('Delete failed');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => message.success('Copied'));
  };

  // Derive current status from SSE or detail
  const currentStatus = streamProgress?.step || detail?.status || 'pending';
  const isRunningDetail = ['pending', 'fetching', 'analyzing', 'generating'].includes(currentStatus);

  const columns = [
    {
      title: 'Time',
      dataIndex: 'started_at',
      width: 150,
      render: (v: string) => (
        <Text style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {v ? new Date(v).toLocaleString('vi-VN') : '-'}
        </Text>
      ),
    },
    {
      title: 'Base',
      dataIndex: 'base_name',
      render: (v: string) => <Text style={{ color: 'var(--foreground)' }}>{v || '-'}</Text>,
    },
    {
      title: 'Trigger',
      dataIndex: 'trigger',
      width: 90,
      responsive: ['md'] as ('md')[],
      render: (v: string) => <Tag color={v === 'scheduled' ? 'blue' : 'default'}>{v}</Tag>,
    },
    {
      title: 'Tables',
      dataIndex: 'tables_count',
      width: 70,
      render: (v: number) => v || 0,
    },
    {
      title: 'Progress',
      width: 100,
      responsive: ['md'] as ('md')[],
      render: (_: unknown, r: Analysis) => {
        if (r.status === 'completed') return <Text style={{ fontSize: 12, color: 'var(--success)' }}>{r.chunks_analyzed}/{r.chunks_total} analyzed</Text>;
        if (r.status === 'failed') return <Text style={{ fontSize: 12, color: 'var(--error)' }}>Failed</Text>;
        return <Text style={{ fontSize: 12, color: 'var(--warning)' }}>{(STATUS_MAP[r.status] || STATUS_MAP.pending).label}...</Text>;
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 110,
      render: (v: string) => {
        const s = STATUS_MAP[v] || STATUS_MAP.pending;
        return <Tag icon={s.icon} color={s.color}>{s.label}</Tag>;
      },
    },
    {
      title: 'Duration',
      dataIndex: 'duration_ms',
      width: 80,
      responsive: ['sm'] as ('sm')[],
      render: (v: number) => v ? `${(v / 1000).toFixed(1)}s` : '-',
    },
    {
      title: '',
      width: 180,
      render: (_: unknown, r: Analysis) => {
        const isRunning = ['pending', 'fetching', 'analyzing', 'generating'].includes(r.status);
        return (
          <Space size="small">
            <Button
              size="small"
              type={r.status === 'completed' ? 'primary' : 'default'}
              icon={isRunning ? <LoadingOutlined spin /> : <EyeOutlined />}
              onClick={() => openDetail(r._id)}
            >
              {r.status === 'completed' ? 'View' : isRunning ? 'Progress' : 'Detail'}
            </Button>
            {isRunning && (
              <Popconfirm title="Stop this analysis?" onConfirm={() => handleCancel(r._id)}>
                <Button size="small" danger>Stop</Button>
              </Popconfirm>
            )}
            {!isRunning && (
              <Popconfirm title="Delete this analysis and its chunks?" onConfirm={() => handleDelete(r._id)}>
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <Title level={3} style={{ color: 'var(--foreground)', margin: 0 }}>
          <FileSearchOutlined /> Analyses
        </Title>
        <Space>
          <Button size="small" type="link" onClick={() => setShowHelp(!showHelp)}>
            {showHelp ? 'Hide' : 'How it works?'}
          </Button>
          <Select
            allowClear
            placeholder="Filter by base"
            style={{ width: 200 }}
            value={filterBaseId || undefined}
            onChange={(v) => { setFilterBaseId(v || ''); setPage(1); }}
          >
            {bases.map(b => (
              <Select.Option key={b._id} value={b._id}>{b.name}</Select.Option>
            ))}
          </Select>
          <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
        </Space>
      </div>

      {/* How it works */}
      {showHelp && (
        <Alert
          type="info"
          showIcon
          closable
          onClose={() => setShowHelp(false)}
          style={{ marginBottom: 16 }}
          message="Analysis Flow"
          description={
            <div>
              <Steps
                size="small"
                direction="vertical"
                items={[
                  { title: 'Fetch Schema', description: 'Đọc tất cả tables, fields, views, relationships từ Lark Base API', icon: <CloudDownloadOutlined /> },
                  { title: 'Save Snapshot', description: 'Lưu phiên bản schema để so sánh thay đổi. Bỏ qua nếu không thay đổi.', icon: <DatabaseOutlined /> },
                  { title: 'AI Analysis (3 cấp)', description: 'L1: Ollama/Claude phân tích từng bảng. L2: Claude phân tích quan hệ. L3: Claude viết tổng quan. Bảng không đổi dùng cache.', icon: <ThunderboltOutlined /> },
                  { title: 'Generate Docs', description: 'Tạo Mermaid ERD diagram + tài liệu Markdown đầy đủ', icon: <FileTextOutlined /> },
                  { title: 'Notify', description: 'Gửi Lark card tóm tắt + link đến trang Documentation', icon: <ApartmentOutlined /> },
                ]}
              />
              <Text style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, display: 'block' }}>
                Typical duration: 10-30s for small bases, 1-3 min for large bases (50+ tables).
                Re-analysis is faster because unchanged tables use cached results.
              </Text>
            </div>
          }
        />
      )}

      <Card style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }} styles={{ body: { padding: 0 } }}>
        <Table
          dataSource={analyses}
          columns={columns}
          rowKey="_id"
          loading={loading}
          size="small"
          scroll={{ x: 600 }}
          pagination={{
            current: page,
            total,
            pageSize: 20,
            onChange: (p) => setPage(p),
            showSizeChanger: false,
            size: 'small',
          }}
        />
      </Card>

      {/* Detail Modal */}
      <Modal
        title={detail ? `Analysis — ${detail.base_name}` : 'Analysis Detail'}
        open={detailOpen}
        onCancel={closeDetail}
        footer={null}
        width="95vw"
        style={{ maxWidth: 900 }}
      >
        {detailLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div>
        ) : detail ? (
          <div>
            {/* Progress steps */}
            <Steps
              size="small"
              current={currentStatus === 'failed' ? undefined : (STATUS_MAP[currentStatus]?.step ?? 0)}
              status={currentStatus === 'failed' ? 'error' : undefined}
              style={{ marginBottom: 20 }}
              items={FLOW_STEPS.map(s => ({ title: s.title }))}
            />

            {/* Live progress bar + ETA (only when running) */}
            {isRunningDetail && streamProgress && (
              <div style={{ marginBottom: 16, padding: '12px 16px', background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 13, color: 'var(--foreground)' }}>
                    {streamProgress.detail || (STATUS_MAP[currentStatus]?.label + '...')}
                  </Text>
                  <Text style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {formatETA(streamProgress.elapsed_ms || 0, streamProgress.progress)}
                  </Text>
                </div>
                <Progress
                  percent={Math.round(streamProgress.progress * 100)}
                  size="small"
                  status="active"
                  strokeColor="#6366f1"
                />
                {streamProgress.elapsed_ms && (
                  <Text style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    Elapsed: {(streamProgress.elapsed_ms / 1000).toFixed(1)}s
                    {streamProgress.chunks_done !== undefined && streamProgress.chunks_total
                      ? ` · Tables: ${streamProgress.chunks_done}/${streamProgress.chunks_total}`
                      : ''}
                  </Text>
                )}
              </div>
            )}

            <Descriptions size="small" column={{ xs: 1, sm: 2 }} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Base">{detail.base_name}</Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={STATUS_MAP[currentStatus]?.color}>{STATUS_MAP[currentStatus]?.label}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Tables">{detail.tables_count}</Descriptions.Item>
              <Descriptions.Item label="Fields">{detail.fields_count}</Descriptions.Item>
              <Descriptions.Item label="Analyzed">{detail.chunks_analyzed} / {detail.chunks_total} tables</Descriptions.Item>
              <Descriptions.Item label="Duration">
                {detail.duration_ms
                  ? `${(detail.duration_ms / 1000).toFixed(1)}s`
                  : streamProgress?.elapsed_ms
                    ? `${(streamProgress.elapsed_ms / 1000).toFixed(1)}s (running)`
                    : 'In progress...'}
              </Descriptions.Item>
              <Descriptions.Item label="Started">{detail.started_at ? new Date(detail.started_at).toLocaleString('vi-VN') : '-'}</Descriptions.Item>
              <Descriptions.Item label="Trigger"><Tag color={detail.trigger === 'scheduled' ? 'blue' : 'default'}>{detail.trigger}</Tag></Descriptions.Item>
            </Descriptions>

            {detail.error && (
              <Alert type="error" message="Error" description={detail.error} style={{ marginBottom: 16 }} showIcon />
            )}

            {detail.status === 'completed' && (
              <Tabs
                items={[
                  {
                    key: 'summary',
                    label: 'Summary',
                    children: detail.system_summary ? (
                      <Paragraph style={{ color: 'var(--foreground)', whiteSpace: 'pre-wrap' }}>
                        {detail.system_summary}
                      </Paragraph>
                    ) : <Empty description="No summary available" />,
                  },
                  {
                    key: 'diagram',
                    label: 'ERD Diagram',
                    children: detail.mermaid_erd ? (
                      <div>
                        <Button
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => copyToClipboard(detail.mermaid_erd)}
                          style={{ marginBottom: 12 }}
                        >
                          Copy Mermaid
                        </Button>
                        <Text style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 8 }}>
                          Paste into mermaid.live to render
                        </Text>
                        <pre style={{
                          background: 'var(--bg-tertiary)', padding: 16, borderRadius: 8,
                          overflow: 'auto', maxHeight: 500, fontSize: 12,
                          color: 'var(--foreground)', border: '1px solid var(--border-color)',
                        }}>
                          {detail.mermaid_erd}
                        </pre>
                      </div>
                    ) : <Empty description="No diagram generated" />,
                  },
                  {
                    key: 'docs',
                    label: 'Documentation',
                    children: detail.documentation_md ? (
                      <div>
                        <Space style={{ marginBottom: 12 }}>
                          <Button
                            size="small"
                            icon={<CopyOutlined />}
                            onClick={() => copyToClipboard(detail.documentation_md)}
                          >
                            Copy Markdown
                          </Button>
                          <Button
                            size="small"
                            type="primary"
                            icon={<SendOutlined />}
                            onClick={async () => {
                              try {
                                const r = await publishToWiki(detail._id);
                                if (r.success) {
                                  message.success(`Published to Lark Wiki! (${r.doc_token})`);
                                } else {
                                  message.error(r.error || 'Publish failed');
                                }
                              } catch (e) {
                                message.error(e instanceof Error ? e.message : 'Publish failed');
                              }
                            }}
                          >
                            Publish to Wiki
                          </Button>
                        </Space>
                        <pre style={{
                          background: 'var(--bg-tertiary)', padding: 16, borderRadius: 8,
                          overflow: 'auto', maxHeight: 600, fontSize: 12,
                          color: 'var(--foreground)', border: '1px solid var(--border-color)',
                          whiteSpace: 'pre-wrap', lineHeight: 1.6,
                        }}>
                          {detail.documentation_md}
                        </pre>
                      </div>
                    ) : <Empty description="No documentation generated" />,
                  },
                ]}
              />
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
