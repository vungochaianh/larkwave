'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Card, Table, Tag, Select, Input, Button, Space, Typography, message, Tooltip } from 'antd';
import {
  CheckCircleOutlined, ClockCircleOutlined, SyncOutlined,
  ExclamationCircleOutlined, MinusCircleOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { api } from '@/lib/api';

const { Title, Text } = Typography;

interface PageStatus {
  _id: string;
  path: string;
  status: string;
  note: string;
  updatedBy: string;
  updatedAt: string;
}

const STATUSES = [
  { value: 'untested', label: 'Chưa test', color: 'default', icon: <ClockCircleOutlined /> },
  { value: 'testing', label: 'Đang test', color: 'processing', icon: <SyncOutlined /> },
  { value: 'needFix', label: 'Cần sửa', color: 'error', icon: <ExclamationCircleOutlined /> },
  { value: 'ready', label: 'Sẵn sàng', color: 'success', icon: <CheckCircleOutlined /> },
  { value: 'notNeeded', label: 'Không cần', color: 'default', icon: <MinusCircleOutlined /> },
];

// All known pages grouped
const ALL_PAGES = [
  { path: '/ba', label: 'BA Dashboard', group: 'BA' },
  { path: '/ba/bases', label: 'Bases', group: 'BA' },
  { path: '/ba/docs', label: 'Documents', group: 'BA' },
  { path: '/ba/analyst', label: 'Analyst Manual', group: 'BA' },
  { path: '/ba/analyses', label: 'Analyses (Dev)', group: 'BA' },
  { path: '/lark/accounts', label: 'Accounts', group: 'Lark' },
  { path: '/lark/automation', label: 'Automation', group: 'Lark' },
  { path: '/lark/agent', label: 'AI Agent', group: 'Lark' },
  { path: '/lark/base-designer', label: 'Base Designer', group: 'Base Designer' },
  { path: '/lark/base-designer/compose', label: 'Compose', group: 'Base Designer' },
  { path: '/lark/base-designer/extract', label: 'Extract AI', group: 'Base Designer' },
  { path: '/lark/base-designer/history', label: 'AI History', group: 'Base Designer' },
  { path: '/lark/base-designer/workflows', label: 'Workflows', group: 'Base Designer' },
  { path: '/sync/bitable', label: 'Bitable Sync', group: 'Sync' },
  { path: '/sync/notify', label: 'Notifications', group: 'Sync' },
  { path: '/settings/ai', label: 'AI Config', group: 'Settings' },
  { path: '/settings/credits', label: 'Credits', group: 'Settings' },
  { path: '/settings/users', label: 'Users', group: 'Settings' },
  { path: '/settings/integrations', label: 'Integrations', group: 'Settings' },
  { path: '/chatbot', label: 'Chatbot', group: 'Demo' },
  { path: '/n8n/templates', label: 'Templates', group: 'N8N' },
  { path: '/n8n/connections', label: 'Connections', group: 'N8N' },
  { path: '/n8n/mappings', label: 'Mappings', group: 'N8N' },
  { path: '/n8n/rules', label: 'Rules', group: 'N8N' },
  { path: '/n8n/executions', label: 'Executions', group: 'N8N' },
  { path: '/n8n/lark-apps', label: 'Lark Apps', group: 'N8N' },
  { path: '/docs/base-extensions', label: 'Base Extensions', group: 'Docs' },
  { path: '/contact/manage', label: 'Contact Manage', group: 'Contact' },
  { path: '/dev/features', label: 'Features', group: 'Dev' },
  { path: '/dev/api', label: 'API', group: 'Dev' },
  { path: '/dev/status', label: 'Page Status', group: 'Dev' },
];

export default function PageStatusPage() {
  const [statuses, setStatuses] = useState<PageStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [author, setAuthor] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') setAuthor(localStorage.getItem('ba_author') || '');
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: res } = await api.get('/page-status');
      if (res.success) setStatuses(res.data);
    } catch { message.error('Load failed'); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (path: string, status: string, note?: string) => {
    try {
      await api.put(`/page-status${path}`, { status, note: note ?? '', updatedBy: author });
      load();
    } catch { message.error('Update failed'); }
  };

  // Merge known pages with saved statuses
  const tableData = ALL_PAGES.map(p => {
    const saved = statuses.find(s => s.path === p.path);
    return {
      key: p.path,
      path: p.path,
      label: p.label,
      group: p.group,
      status: saved?.status || 'untested',
      note: saved?.note || '',
      updatedBy: saved?.updatedBy || '',
      updatedAt: saved?.updatedAt || '',
    };
  });

  const stats = {
    total: tableData.length,
    ready: tableData.filter(d => d.status === 'ready').length,
    testing: tableData.filter(d => d.status === 'testing').length,
    needFix: tableData.filter(d => d.status === 'needFix').length,
    untested: tableData.filter(d => d.status === 'untested').length,
    notNeeded: tableData.filter(d => d.status === 'notNeeded').length,
  };

  // Group stats
  const groups = [...new Set(ALL_PAGES.map(p => p.group))];
  const groupStats = groups.map(g => {
    const items = tableData.filter(d => d.group === g);
    return {
      group: g,
      total: items.length,
      ready: items.filter(d => d.status === 'ready').length,
      needFix: items.filter(d => d.status === 'needFix').length,
      testing: items.filter(d => d.status === 'testing').length,
    };
  });

  return (
    <div style={{ padding: '16px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Title level={4} style={{ margin: 0 }}><CheckCircleOutlined /> Page Status</Title>
          <Space size={4}>
            <Tag color="success">{stats.ready} ready</Tag>
            <Tag color="processing">{stats.testing} testing</Tag>
            <Tag color="error">{stats.needFix} fix</Tag>
            <Tag>{stats.untested} untested</Tag>
          </Space>
        </div>
        <Space>
          <Input size="small" placeholder="Tên" value={author} style={{ width: 100 }}
            onChange={e => { setAuthor(e.target.value); localStorage.setItem('ba_author', e.target.value); }} />
          <Button size="small" icon={<ReloadOutlined />} onClick={load} />
        </Space>
      </div>

      {/* Progress bar */}
      <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 16, background: 'var(--bg-tertiary)' }}>
        {stats.ready > 0 && <Tooltip title={`${stats.ready} sẵn sàng`}><div style={{ width: `${(stats.ready / stats.total) * 100}%`, background: '#52c41a', transition: 'width 0.3s' }} /></Tooltip>}
        {stats.testing > 0 && <Tooltip title={`${stats.testing} đang test`}><div style={{ width: `${(stats.testing / stats.total) * 100}%`, background: '#1677ff', transition: 'width 0.3s' }} /></Tooltip>}
        {stats.needFix > 0 && <Tooltip title={`${stats.needFix} cần sửa`}><div style={{ width: `${(stats.needFix / stats.total) * 100}%`, background: '#ff4d4f', transition: 'width 0.3s' }} /></Tooltip>}
        {stats.notNeeded > 0 && <Tooltip title={`${stats.notNeeded} không cần`}><div style={{ width: `${(stats.notNeeded / stats.total) * 100}%`, background: '#8c8c8c', transition: 'width 0.3s' }} /></Tooltip>}
      </div>

      {/* Group stats */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {groupStats.map(g => {
          const GROUP_COLORS: Record<string, string> = {
            BA: '#6366f1', Lark: '#22c55e', 'Base Designer': '#8b5cf6', Sync: '#f59e0b',
            Settings: '#64748b', N8N: '#ec4899', Demo: '#14b8a6', Docs: '#3b82f6',
            Contact: '#f97316', Dev: '#ef4444',
          };
          const color = GROUP_COLORS[g.group] || '#8b8b8b';
          const pct = g.total > 0 ? Math.round((g.ready / g.total) * 100) : 0;
          return (
            <Card key={g.group} size="small" style={{ minWidth: 130, borderTop: `3px solid ${color}` }}
              styles={{ body: { padding: '8px 12px' } }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text strong style={{ fontSize: 12, color }}>{g.group}</Text>
                <Text style={{ fontSize: 11, fontWeight: 700, color: pct === 100 ? '#52c41a' : 'var(--text-secondary)' }}>{pct}%</Text>
              </div>
              <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 6, background: 'var(--bg-tertiary)' }}>
                {g.ready > 0 && <div style={{ width: `${(g.ready / g.total) * 100}%`, background: '#52c41a' }} />}
                {g.testing > 0 && <div style={{ width: `${(g.testing / g.total) * 100}%`, background: '#1677ff' }} />}
                {g.needFix > 0 && <div style={{ width: `${(g.needFix / g.total) * 100}%`, background: '#ff4d4f' }} />}
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                {g.ready > 0 && <Tag color="success" style={{ fontSize: 9, margin: 0 }}>{g.ready}</Tag>}
                {g.testing > 0 && <Tag color="processing" style={{ fontSize: 9, margin: 0 }}>{g.testing}</Tag>}
                {g.needFix > 0 && <Tag color="error" style={{ fontSize: 9, margin: 0 }}>{g.needFix}</Tag>}
                <Text type="secondary" style={{ fontSize: 10 }}>{g.total} pages</Text>
              </div>
            </Card>
          );
        })}
      </div>

      <Table
        dataSource={tableData}
        loading={loading}
        size="small"
        pagination={false}
        rowClassName={(record) => {
          const bg: Record<string, string> = { ready: 'status-ready', needFix: 'status-fix', notNeeded: 'status-hidden' };
          return bg[record.status] || '';
        }}
        style={{ marginTop: 0 }}
        // inject row styles
        components={{ body: { wrapper: (props: React.HTMLAttributes<HTMLTableSectionElement>) => (<><style>{`
          .status-ready td { background: rgba(82, 196, 26, 0.04) !important; }
          .status-fix td { background: rgba(255, 77, 79, 0.04) !important; }
          .status-hidden td { opacity: 0.5; }
        `}</style><tbody {...props} /></>) } }}
        columns={[
          {
            title: '#', dataIndex: 'key', width: 40,
            render: (_: string, __: unknown, index: number) => <Text type="secondary" style={{ fontSize: 11 }}>{index + 1}</Text>,
          },
          {
            title: 'Trang', dataIndex: 'path', width: 220,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            render: (path: string, record: any) => (
              <a href={path} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>
                <Text strong style={{ fontSize: 12 }}>{record.label}</Text>
                <br /><Text type="secondary" style={{ fontSize: 10 }}>{path}</Text>
              </a>
            ),
          },
          {
            title: 'Group', dataIndex: 'group', width: 100,
            render: (g: string) => {
              const colors: Record<string, string> = {
                BA: 'purple', Lark: 'green', 'Base Designer': 'geekblue', Sync: 'orange',
                Settings: 'default', N8N: 'magenta', Demo: 'cyan', Docs: 'blue',
                Contact: 'volcano', Dev: 'red',
              };
              return <Tag color={colors[g] || 'default'} style={{ fontSize: 10, margin: 0 }}>{g}</Tag>;
            },
            filters: groups.map(g => ({ text: g, value: g })),
            onFilter: (value, record) => record.group === value,
          },
          {
            title: 'Status', dataIndex: 'status', width: 160,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            render: (status: string, record: any) => (
              <Select size="small" value={status} style={{ width: 140 }}
                onChange={v => updateStatus(record.path, v)}>
                {STATUSES.map(s => (
                  <Select.Option key={s.value} value={s.value}>
                    <Tag color={s.color} icon={s.icon} style={{ margin: 0 }}>{s.label}</Tag>
                  </Select.Option>
                ))}
              </Select>
            ),
            filters: STATUSES.map(s => ({ text: s.label, value: s.value })),
            onFilter: (value, record) => record.status === value,
          },
          {
            title: 'Ghi chú', dataIndex: 'note',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            render: (note: string, record: any) => (
              <Input size="small" value={note} placeholder="Ghi chú..."
                onBlur={e => { if (e.target.value !== note) updateStatus(record.path, record.status, e.target.value); }}
                onPressEnter={e => updateStatus(record.path, record.status, (e.target as HTMLInputElement).value)} />
            ),
          },
          {
            title: 'Cập nhật', dataIndex: 'updatedAt', width: 120,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            render: (v: string, record: any) => v ? (
              <Tooltip title={record.updatedBy}>
                <Text type="secondary" style={{ fontSize: 11 }}>{record.updatedBy && `${record.updatedBy} · `}{new Date(v).toLocaleDateString('vi')}</Text>
              </Tooltip>
            ) : null,
          },
        ]}
      />
    </div>
  );
}
