'use client';

import React, { useEffect, useState } from 'react';
import {
  Card, Table, Button, Tag, Space, Typography, Row, Col, Statistic, message,
} from 'antd';
import {
  FileExcelOutlined, LinkOutlined, ThunderboltOutlined,
  PlayCircleOutlined, PlusOutlined, UploadOutlined,
  ReloadOutlined, CheckCircleOutlined, CloseCircleOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import {
  listTemplates, listConnections, listRules, listExecutions,
  getExecutionStats,
  type Template, type Connection, type Rule, type Execution, type ExecutionStats,
} from '@/lib/n8nApi';

const { Title, Text } = Typography;

export default function N8nDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [recentExecs, setRecentExecs] = useState<Execution[]>([]);
  const [stats, setStats] = useState<ExecutionStats>({ total: 0, success: 0, failed: 0, today: 0, avg_duration_ms: 0 });

  const load = async () => {
    setLoading(true);
    try {
      const [tpl, conn, rl, exec, st] = await Promise.all([
        listTemplates().catch(() => []),
        listConnections().catch(() => []),
        listRules().catch(() => []),
        listExecutions(1, 10).catch(() => ({ executions: [], total: 0 })),
        getExecutionStats().catch(() => ({ total: 0, success: 0, failed: 0, today: 0, avg_duration_ms: 0 })),
      ]);
      setTemplates(tpl);
      setConnections(conn);
      setRules(rl);
      setRecentExecs(exec.executions);
      setStats(st);
    } catch {
      message.error('Failed to load dashboard');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const activeRules = rules.filter(r => r.enabled).length;

  const execColumns = [
    {
      title: 'Time',
      dataIndex: 'started_at',
      width: 160,
      render: (v: string) => (
        <Text style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {v ? new Date(v).toLocaleString('vi-VN') : '-'}
        </Text>
      ),
    },
    {
      title: 'Rule',
      dataIndex: 'rule_name',
      render: (v: string) => <Text style={{ color: 'var(--foreground)' }}>{v || '-'}</Text>,
    },
    {
      title: 'Group',
      dataIndex: 'group_key',
      responsive: ['md'] as ('md')[],
      render: (v: string) => <Text style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{v || '-'}</Text>,
    },
    {
      title: 'Records',
      dataIndex: 'records_count',
      width: 80,
      render: (v: number) => v || 0,
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
      render: (v: number) => (
        <Text style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          {v ? `${(v / 1000).toFixed(1)}s` : '-'}
        </Text>
      ),
    },
  ];

  return (
    <div >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <Title level={3} style={{ color: 'var(--foreground)', margin: 0 }}>
          <ThunderboltOutlined /> N8N Webhooks
        </Title>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
        </Space>
      </div>

      {/* Stats */}
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
            <Statistic
              title={<span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Templates</span>}
              value={templates.length}
              prefix={<FileExcelOutlined style={{ color: 'var(--accent)' }} />}
              valueStyle={{ color: 'var(--foreground)', fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
            <Statistic
              title={<span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Connections</span>}
              value={connections.length}
              prefix={<LinkOutlined style={{ color: 'var(--info)' }} />}
              valueStyle={{ color: 'var(--foreground)', fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
            <Statistic
              title={<span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Active Rules</span>}
              value={activeRules}
              prefix={<PlayCircleOutlined style={{ color: 'var(--success)' }} />}
              valueStyle={{ color: 'var(--success)', fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
            <Statistic
              title={<span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Today Executions</span>}
              value={stats.today}
              prefix={<ThunderboltOutlined style={{ color: 'var(--warning)' }} />}
              valueStyle={{ color: 'var(--foreground)', fontSize: 20 }}
            />
          </Card>
        </Col>
      </Row>

      {/* Quick Actions */}
      <Card
        size="small"
        title={<Text strong style={{ color: 'var(--foreground)' }}>Quick Actions</Text>}
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', marginBottom: 20 }}
      >
        <Space wrap>
          <Button icon={<UploadOutlined />} onClick={() => router.push('/n8n/templates')}>
            Upload Template
          </Button>
          <Button icon={<PlusOutlined />} onClick={() => router.push('/n8n/connections')}>
            Add Connection
          </Button>
          <Button type="primary" icon={<ThunderboltOutlined />} onClick={() => router.push('/n8n/rules')}>
            Create Rule
          </Button>
        </Space>
      </Card>

      {/* Recent Executions */}
      <Card
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text strong style={{ color: 'var(--foreground)' }}>Recent Executions</Text>
            <Button size="small" type="link" onClick={() => router.push('/n8n/executions')}>
              View All
            </Button>
          </div>
        }
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
        styles={{ body: { padding: 0 } }}
      >
        <Table
          dataSource={recentExecs}
          columns={execColumns}
          rowKey="_id"
          loading={loading}
          pagination={false}
          size="small"
        />
      </Card>
    </div>
  );
}
