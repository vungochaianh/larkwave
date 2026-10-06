'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Card, Table, Button, Tag, Space, Typography, message,
  Row, Col, Select, DatePicker, Progress, Modal, Popconfirm,
} from 'antd';
import {
  ReloadOutlined, HistoryOutlined,
  CheckCircleOutlined, CloseCircleOutlined,
  ClockCircleOutlined, ExpandOutlined,
  DeleteOutlined, LoadingOutlined,
} from '@ant-design/icons';
import {
  listExecutions, listRules, getExecutionStats, deleteExecution,
  type Execution, type Step, type Rule, type ExecutionStats,
} from '@/lib/n8nApi';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

interface DeleteProgress {
  name: string;
  status: 'pending' | 'deleting' | 'done' | 'error';
  error?: string;
}

export default function ExecutionsPage() {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [stats, setStats] = useState<ExecutionStats>({ total: 0, success: 0, failed: 0, today: 0, avg_duration_ms: 0 });
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterRule, setFilterRule] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteItems, setDeleteItems] = useState<DeleteProgress[]>([]);
  const [deleteRunning, setDeleteRunning] = useState(false);
  const cancelRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [execData, rulesData, statsData] = await Promise.all([
        listExecutions(page, 20),
        listRules().catch(() => []),
        getExecutionStats().catch(() => ({ total: 0, success: 0, failed: 0, today: 0, avg_duration_ms: 0 })),
      ]);
      setExecutions(execData.executions);
      setTotal(execData.total);
      setRules(rulesData);
      setStats(statsData);
    } catch {
      message.error('Failed to load executions');
    }
    setLoading(false);
  }, [page]);

  useEffect(() => { load(); }, [load]);

  // Client-side filtering
  const filtered = executions.filter(e => {
    if (filterRule && e.rule_id !== filterRule) return false;
    if (filterStatus === 'success' && !e.success) return false;
    if (filterStatus === 'failed' && e.success) return false;
    return true;
  });

  const runBulkDelete = useCallback(async (items: { name: string; id: string }[]) => {
    cancelRef.current = false;
    const progress: DeleteProgress[] = items.map(i => ({ name: i.name, status: 'pending' }));
    setDeleteItems([...progress]);
    setDeleteModal(true);
    setDeleteRunning(true);

    for (let i = 0; i < items.length; i++) {
      if (cancelRef.current) break;
      progress[i].status = 'deleting';
      setDeleteItems([...progress]);
      try {
        await deleteExecution(items[i].id);
        progress[i].status = 'done';
      } catch (e) {
        progress[i].status = 'error';
        progress[i].error = e instanceof Error ? e.message : 'Failed';
      }
      setDeleteItems([...progress]);
    }

    setDeleteRunning(false);
    setSelectedKeys([]);
    load();
  }, [load]);

  const handleBulkDelete = () => {
    const items = selectedKeys.map(key => {
      const e = executions.find(e => e._id === key);
      return { name: e ? `${e.rule_name} - ${e.group_key || e._id}` : String(key), id: String(key) };
    });
    runBulkDelete(items);
  };

  const handleDeleteAll = () => {
    const items = filtered.map(e => ({
      name: `${e.rule_name} - ${e.group_key || e._id}`,
      id: e._id,
    }));
    runBulkDelete(items);
  };

  const stepStatusColor = (status: string) => {
    if (status === 'success' || status === 'completed') return 'var(--success)';
    if (status === 'failed' || status === 'error') return 'var(--error)';
    if (status === 'running' || status === 'in_progress') return 'var(--warning)';
    return 'var(--text-tertiary)';
  };

  const columns = [
    {
      title: 'Time',
      dataIndex: 'started_at',
      width: 160,
      render: (v: string) => (
        <Text style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {v ? new Date(v).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
        </Text>
      ),
    },
    {
      title: 'Rule',
      dataIndex: 'rule_name',
      render: (v: string) => <Text style={{ color: 'var(--foreground)' }}>{v || '-'}</Text>,
    },
    {
      title: 'Group Key',
      dataIndex: 'group_key',
      responsive: ['md'] as ('md')[],
      render: (v: string) => (
        <Text style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{v || '-'}</Text>
      ),
    },
    {
      title: 'Records',
      dataIndex: 'records_count',
      width: 80,
      render: (v: number) => <Tag>{v || 0}</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'success',
      width: 90,
      render: (v: boolean) => (
        <Tag
          icon={v ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
          color={v ? 'success' : 'error'}
        >
          {v ? 'OK' : 'FAIL'}
        </Tag>
      ),
    },
    {
      title: 'Duration',
      dataIndex: 'duration_ms',
      width: 100,
      responsive: ['sm'] as ('sm')[],
      render: (v: number, r: Execution) => {
        const dur = v || r.steps?.reduce((sum: number, s: Step) => sum + (s.duration_ms || 0), 0) || 0;
        return (
          <Text style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            <ClockCircleOutlined style={{ marginRight: 4 }} />
            {dur ? `${(dur / 1000).toFixed(1)}s` : '-'}
          </Text>
        );
      },
    },
    {
      title: '',
      key: 'expand',
      width: 40,
      render: (_: unknown, r: Execution) => (
        <Button
          type="text"
          size="small"
          icon={<ExpandOutlined />}
          onClick={() => setExpandedId(expandedId === r._id ? null : r._id)}
        />
      ),
    },
  ];

  const successRate = stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0;

  return (
    <div >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <Title level={3} style={{ color: 'var(--foreground)', margin: 0 }}>
          <HistoryOutlined /> Execution History
        </Title>
        <Space wrap>
          {selectedKeys.length > 0 && (
            <Button danger icon={<DeleteOutlined />} onClick={handleBulkDelete}>
              Delete Selected ({selectedKeys.length})
            </Button>
          )}
          <Popconfirm title={`Delete all ${filtered.length} executions shown?`} onConfirm={handleDeleteAll} disabled={filtered.length === 0}>
            <Button danger icon={<DeleteOutlined />} disabled={filtered.length === 0}>Delete All</Button>
          </Popconfirm>
          <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
        </Space>
      </div>

      {/* Stats */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
            <Text style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block' }}>Total</Text>
            <Text strong style={{ fontSize: 20, color: 'var(--foreground)' }}>{stats.total}</Text>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
            <Text style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block' }}>Success Rate</Text>
            <Progress percent={successRate} size="small" strokeColor="var(--success)" />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
            <Text style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block' }}>Today</Text>
            <Text strong style={{ fontSize: 20, color: 'var(--warning)' }}>{stats.today}</Text>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
            <Text style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block' }}>Avg Duration</Text>
            <Text strong style={{ fontSize: 20, color: 'var(--accent)' }}>
              {stats.avg_duration_ms ? `${(stats.avg_duration_ms / 1000).toFixed(1)}s` : '-'}
            </Text>
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Card
        size="small"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', marginBottom: 16 }}
      >
        <Space wrap>
          <Select
            style={{ width: 200 }}
            size="small"
            placeholder="Filter by rule"
            allowClear
            value={filterRule || undefined}
            onChange={v => setFilterRule(v || '')}
            options={rules.map(r => ({ value: r._id, label: r.name }))}
          />
          <Select
            style={{ width: 140 }}
            size="small"
            placeholder="Status"
            allowClear
            value={filterStatus || undefined}
            onChange={v => setFilterStatus(v || '')}
            options={[
              { value: 'success', label: 'Success' },
              { value: 'failed', label: 'Failed' },
            ]}
          />
        </Space>
      </Card>

      {/* Executions Table */}
      <Card
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
        styles={{ body: { padding: 0 } }}
      >
        <Table
          dataSource={filtered}
          columns={columns}
          rowKey="_id"
          rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys }}
          loading={loading}
          size="small"
          scroll={{ x: 600 }}
          pagination={{
            current: page,
            pageSize: 20,
            total,
            onChange: (p) => setPage(p),
            showSizeChanger: false,
            size: 'small',
          }}
          expandable={{
            expandedRowKeys: expandedId ? [expandedId] : [],
            onExpand: (expanded, record) => setExpandedId(expanded ? record._id : null),
            expandedRowRender: (record: Execution) => (
              <div style={{ padding: '8px 16px' }}>
                <Text strong style={{ color: 'var(--foreground)', display: 'block', marginBottom: 8 }}>
                  Step Breakdown
                </Text>
                {(record.steps || []).map((step: Step, idx: number) => {
                  const totalDur = record.steps.reduce((s: number, st: Step) => s + (st.duration_ms || 0), 0);
                  const pct = totalDur > 0 ? Math.round((step.duration_ms / totalDur) * 100) : 0;
                  return (
                    <div key={idx} style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                        <Space>
                          <Tag
                            color={step.status === 'success' || step.status === 'completed' ? 'success' : step.status === 'failed' || step.status === 'error' ? 'error' : 'processing'}
                            style={{ fontSize: 10 }}
                          >
                            {step.status}
                          </Tag>
                          <Text style={{ color: 'var(--foreground)', fontSize: 13 }}>{step.step}</Text>
                        </Space>
                        <Text style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                          {step.duration_ms ? `${step.duration_ms}ms` : '-'}
                        </Text>
                      </div>
                      <div
                        style={{
                          height: 4,
                          borderRadius: 2,
                          background: 'var(--bg-tertiary)',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${pct}%`,
                            background: stepStatusColor(step.status),
                            borderRadius: 2,
                            transition: 'width 0.3s ease',
                          }}
                        />
                      </div>
                      {step.error && (
                        <Text style={{ fontSize: 11, color: 'var(--error)', display: 'block', marginTop: 2 }}>
                          Error: {step.error}
                        </Text>
                      )}
                    </div>
                  );
                })}
              </div>
            ),
            showExpandColumn: false,
          }}
        />
      </Card>

      {/* ── Delete Progress Modal ── */}
      <Modal
        title={<span><DeleteOutlined style={{ color: 'var(--error)', marginRight: 8 }} />Deleting Executions</span>}
        open={deleteModal}
        onCancel={() => { if (!deleteRunning) setDeleteModal(false); }}
        closable={!deleteRunning}
        maskClosable={false}
        footer={
          deleteRunning ? (
            <Button danger onClick={() => { cancelRef.current = true; }}>Cancel</Button>
          ) : (
            <Button type="primary" onClick={() => setDeleteModal(false)}>Done</Button>
          )
        }
        width={500}
      >
        {(() => {
          const done = deleteItems.filter(i => i.status === 'done').length;
          const fail = deleteItems.filter(i => i.status === 'error').length;
          const tot = deleteItems.length;
          const pct = tot > 0 ? Math.round(((done + fail) / tot) * 100) : 0;
          return (
            <>
              <Progress
                percent={pct}
                status={deleteRunning ? 'active' : fail > 0 ? 'exception' : 'success'}
                format={() => `${done + fail} / ${tot}`}
                style={{ marginBottom: 12 }}
              />
              <div style={{ fontSize: 12, marginBottom: 8, color: 'var(--text-secondary)' }}>
                <Tag color="green">{done} done</Tag>
                {fail > 0 && <Tag color="red">{fail} failed</Tag>}
                {deleteRunning && <Tag color="blue">processing...</Tag>}
              </div>
              <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 6 }}>
                {deleteItems.map((item, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                    borderBottom: i < deleteItems.length - 1 ? '1px solid var(--border-color)' : undefined,
                    background: item.status === 'deleting' ? 'var(--bg-tertiary)' : undefined,
                  }}>
                    {item.status === 'pending' && <span style={{ width: 16, textAlign: 'center', color: 'var(--text-tertiary)' }}>-</span>}
                    {item.status === 'deleting' && <LoadingOutlined style={{ color: 'var(--info)', fontSize: 14 }} />}
                    {item.status === 'done' && <CheckCircleOutlined style={{ color: 'var(--success)', fontSize: 14 }} />}
                    {item.status === 'error' && <CloseCircleOutlined style={{ color: 'var(--error)', fontSize: 14 }} />}
                    <Text style={{
                      fontSize: 11, flex: 1,
                      color: item.status === 'error' ? 'var(--error)' : undefined,
                      textDecoration: item.status === 'done' ? 'line-through' : undefined,
                      opacity: item.status === 'done' ? 0.5 : 1,
                    }}>
                      {item.name}
                    </Text>
                    {item.error && <Text type="danger" style={{ fontSize: 10 }}>{item.error}</Text>}
                  </div>
                ))}
              </div>
            </>
          );
        })()}
      </Modal>
    </div>
  );
}
