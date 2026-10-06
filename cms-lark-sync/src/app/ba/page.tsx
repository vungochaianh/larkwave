'use client';

import React, { useEffect, useState } from 'react';
import {
  Card, Table, Button, Tag, Space, Typography, Row, Col, Statistic, message,
} from 'antd';
import {
  FileSearchOutlined, DatabaseOutlined, PlayCircleOutlined,
  ReloadOutlined, CheckCircleOutlined, CloseCircleOutlined,
  ClockCircleOutlined, PlusOutlined, RocketOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import {
  listBases, listAnalyses, getAnalysisStats,
  type BaseReg, type Analysis, type AnalysisStats,
} from '@/lib/baApi';

const { Title, Text } = Typography;

export default function BADashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [bases, setBases] = useState<BaseReg[]>([]);
  const [recentAnalyses, setRecentAnalyses] = useState<Analysis[]>([]);
  const [stats, setStats] = useState<AnalysisStats>({ total: 0, completed: 0, failed: 0, in_progress: 0, avg_duration_ms: 0 });

  const load = async () => {
    setLoading(true);
    try {
      const [b, a, s] = await Promise.all([
        listBases().catch(() => []),
        listAnalyses('', 1, 10).catch(() => ({ analyses: [], total: 0 })),
        getAnalysisStats().catch(() => ({ total: 0, completed: 0, failed: 0, in_progress: 0, avg_duration_ms: 0 })),
      ]);
      setBases(b);
      setRecentAnalyses(a.analyses);
      setStats(s);
    } catch {
      message.error('Failed to load dashboard');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const statusColor: Record<string, string> = {
    completed: 'success', failed: 'error', pending: 'default',
    fetching: 'processing', analyzing: 'processing', generating: 'processing',
  };

  const analysisColumns = [
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
      title: 'Base',
      dataIndex: 'base_name',
      render: (v: string) => <Text style={{ color: 'var(--foreground)' }}>{v || '-'}</Text>,
    },
    {
      title: 'Tables',
      dataIndex: 'tables_count',
      width: 80,
      render: (v: number) => v || 0,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 110,
      render: (v: string) => {
        const icon = v === 'completed' ? <CheckCircleOutlined /> :
                     v === 'failed' ? <CloseCircleOutlined /> :
                     <ClockCircleOutlined />;
        return <Tag icon={icon} color={statusColor[v] || 'default'}>{v?.toUpperCase()}</Tag>;
      },
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
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <Title level={3} style={{ color: 'var(--foreground)', margin: 0 }}>
          <FileSearchOutlined /> BA Analyzer
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
              title={<span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Registered Bases</span>}
              value={bases.length}
              prefix={<DatabaseOutlined style={{ color: 'var(--accent)' }} />}
              valueStyle={{ color: 'var(--foreground)', fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
            <Statistic
              title={<span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Total Analyses</span>}
              value={stats.total}
              prefix={<FileSearchOutlined style={{ color: 'var(--info)' }} />}
              valueStyle={{ color: 'var(--foreground)', fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
            <Statistic
              title={<span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>In Progress</span>}
              value={stats.in_progress}
              prefix={<PlayCircleOutlined style={{ color: 'var(--warning)' }} />}
              valueStyle={{ color: 'var(--warning)', fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
            <Statistic
              title={<span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Avg Duration</span>}
              value={stats.avg_duration_ms ? `${(stats.avg_duration_ms / 1000).toFixed(1)}s` : '-'}
              prefix={<ClockCircleOutlined style={{ color: 'var(--success)' }} />}
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
          <Button icon={<PlusOutlined />} onClick={() => router.push('/ba/bases')}>
            Register Base
          </Button>
          <Button type="primary" icon={<RocketOutlined />} onClick={() => router.push('/ba/analyses')}>
            View Analyses
          </Button>
          <Button icon={<FileSearchOutlined />} onClick={() => router.push('/ba/docs')}>
            Documentation
          </Button>
        </Space>
      </Card>

      {/* Recent Analyses */}
      <Card
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text strong style={{ color: 'var(--foreground)' }}>Recent Analyses</Text>
            <Button size="small" type="link" onClick={() => router.push('/ba/analyses')}>
              View All
            </Button>
          </div>
        }
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
        styles={{ body: { padding: 0 } }}
      >
        <Table
          dataSource={recentAnalyses}
          columns={analysisColumns}
          rowKey="_id"
          loading={loading}
          pagination={false}
          size="small"
        />
      </Card>
    </div>
  );
}
