'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { App as AntApp, Button, Card, Empty, Input, Popconfirm, Segmented, Skeleton, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  AppstoreOutlined, ArrowLeftOutlined, ClockCircleOutlined, CodeOutlined, DeleteOutlined, DeploymentUnitOutlined,
  ExportOutlined, EyeOutlined, GlobalOutlined, LineChartOutlined, LockOutlined, ReloadOutlined, RiseOutlined,
  SearchOutlined, TeamOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import { useRuntime } from '../RuntimeProvider';
import { CARD_SHADOW } from '../theme';
import { accountApi, formatDate, type App, type Build, type Deployment } from './api';
import { MembersView } from './MembersView';
import { SeoView } from './SeoView';
import { SecurityView } from './SecurityView';
import { AnalyticsView } from './AnalyticsView';
import { AutomationsView } from './AutomationsView';

const { Title, Text, Paragraph } = Typography;
const WEB_APP = 'https://toolswave.net';

const STATUS_COLOR: Record<string, string> = {
  live: 'green', building: 'blue', draft: 'default', failed: 'red', archived: 'default', suspended: 'red',
  succeeded: 'green', queued: 'gold', running: 'blue', canceled: 'default',
};
const TRACK_LABEL: Record<string, string> = { web: 'Website', mobile: 'Mobile', extension: 'Extension' };

/** Native desktop port (core) of the website's /apps list + /apps/:id console. */
export function AppsConsoleView() {
  const [selected, setSelected] = useState<string | null>(null);
  return selected ? (
    <AppDetail id={selected} onBack={() => setSelected(null)} />
  ) : (
    <AppsList onOpen={setSelected} />
  );
}

function StatusTag({ status }: { status: string }) {
  return <Tag color={STATUS_COLOR[status] ?? 'default'} bordered={false}>{status}</Tag>;
}

function AppsList({ onOpen }: { onOpen: (id: string) => void }) {
  const { message } = AntApp.useApp();
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');

  const load = useCallback(async (search: string) => {
    setLoading(true);
    try {
      const res = await accountApi.appsList({ pageSize: 60, ...(search ? { q: search } : {}) });
      setApps(res.items);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load(query);
  }, [load, query]);

  return (
    <Space direction="vertical" size={18} style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            <AppstoreOutlined style={{ color: '#6C5CE7', marginInlineEnd: 8 }} />
            App của tôi
          </Title>
          <Text type="secondary">Quản lý các app đã tạo trên Larkwave — preview, build, deploy.</Text>
        </div>
        <Space>
          <Input allowClear prefix={<SearchOutlined style={{ color: '#9AA3B5' }} />} placeholder="Tìm app…" value={q}
            onChange={(e) => setQ(e.target.value)} onPressEnter={() => setQuery(q.trim())} onBlur={() => setQuery(q.trim())} style={{ width: 220 }} />
          <Button icon={<ReloadOutlined />} onClick={() => void load(query)} />
        </Space>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} styles={{ body: { padding: 16 } }}><Skeleton active paragraph={{ rows: 2 }} /></Card>
          ))}
        </div>
      ) : apps.length === 0 ? (
        <Empty description="Chưa có app nào. Hãy tạo app ở Trang chủ!" style={{ padding: '56px 0' }} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {apps.map((a) => (
            <Card key={a.id} hoverable styles={{ body: { padding: 16 } }} style={{ boxShadow: CARD_SHADOW }} onClick={() => onOpen(a.id)}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Title level={5} style={{ margin: 0 }} ellipsis={{ rows: 1 }}>{a.name}</Title>
                <StatusTag status={a.status} />
              </div>
              <Text type="secondary" style={{ fontSize: 12.5, display: 'block', marginTop: 4 }}>
                {TRACK_LABEL[a.track] ?? a.track}{a.backendKind === 'fullstack' ? ' · full-stack' : ''}
              </Text>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                <Text type="secondary" style={{ fontSize: 11.5 }}>Cập nhật {formatDate(a.updatedAt)}</Text>
                {a.published && <Tag color="purple" bordered={false} style={{ margin: 0 }}>Public</Tag>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </Space>
  );
}

type DetailView =
  | 'preview' | 'overview' | 'builds' | 'deployments'
  | 'analytics' | 'members' | 'seo' | 'security' | 'automations';

function AppDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { message } = AntApp.useApp();
  const runtime = useRuntime();
  const [app, setApp] = useState<App | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<DetailView>('preview');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setApp(await accountApi.getApp(id));
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const openExternal = (url: string) => (runtime.openExternal ? runtime.openExternal(url) : window.open(url, '_blank'));

  const togglePublished = async () => {
    if (!app) return;
    try {
      const updated = await accountApi.updateApp(app.id, { published: !app.published });
      setApp(updated);
      message.success(updated.published ? 'Đã công khai app.' : 'Đã ẩn app.');
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const remove = async () => {
    try {
      await accountApi.deleteApp(id);
      message.success('Đã xoá app.');
      onBack();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  if (loading || !app) {
    return (
      <div>
        <Button icon={<ArrowLeftOutlined />} onClick={onBack} style={{ marginBottom: 16 }}>App của tôi</Button>
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    );
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Button icon={<ArrowLeftOutlined />} onClick={onBack}>App của tôi</Button>
        <Title level={4} style={{ margin: 0 }} ellipsis={{ rows: 1 }}>{app.name}</Title>
        <StatusTag status={app.status} />
        <div style={{ flex: 1 }} />
        <Space wrap>
          {app.currentUrl && <Button icon={<GlobalOutlined />} onClick={() => openExternal(app.currentUrl!)}>Mở live</Button>}
          <Button icon={<EyeOutlined />} onClick={() => openExternal(`${WEB_APP}/apps/${app.id}`)}>Mở console web <ExportOutlined style={{ fontSize: 11 }} /></Button>
          <Button onClick={togglePublished}>{app.published ? 'Ẩn' : 'Công khai'}</Button>
          <Popconfirm title="Xoá app này?" okText="Xoá" cancelText="Huỷ" okButtonProps={{ danger: true }} onConfirm={remove}>
            <Button danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      </div>

      <div style={{ overflowX: 'auto', paddingBottom: 2 }}>
        <Segmented
          value={view}
          onChange={(v) => setView(v as DetailView)}
          options={[
            { label: 'Preview', value: 'preview', icon: <EyeOutlined /> },
            { label: 'Tổng quan', value: 'overview', icon: <AppstoreOutlined /> },
            { label: 'Builds', value: 'builds', icon: <ThunderboltOutlined /> },
            { label: 'Deployments', value: 'deployments', icon: <DeploymentUnitOutlined /> },
            { label: 'Thống kê', value: 'analytics', icon: <LineChartOutlined /> },
            { label: 'Thành viên', value: 'members', icon: <TeamOutlined /> },
            { label: 'SEO', value: 'seo', icon: <RiseOutlined /> },
            { label: 'Bảo mật', value: 'security', icon: <LockOutlined /> },
            { label: 'Tự động hoá', value: 'automations', icon: <ClockCircleOutlined /> },
          ]}
        />
      </div>

      {view === 'preview' && <PreviewPane app={app} onOpen={openExternal} />}
      {view === 'overview' && <Overview app={app} />}
      {view === 'builds' && <BuildsTab id={id} />}
      {view === 'deployments' && <DeploymentsTab id={id} />}
      {view === 'analytics' && <AnalyticsView appId={id} />}
      {view === 'members' && <MembersView appId={id} />}
      {view === 'seo' && <SeoView appId={id} />}
      {view === 'security' && <SecurityView appId={id} />}
      {view === 'automations' && <AutomationsView appId={id} />}

      <Card styles={{ body: { padding: 14 } }} style={{ boxShadow: CARD_SHADOW }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
          <Text type="secondary"><CodeOutlined /> Sửa code &amp; cơ sở dữ liệu trong console đầy đủ trên web.</Text>
          <Button icon={<ExportOutlined />} onClick={() => openExternal(`${WEB_APP}/apps/${app.id}`)}>Mở console đầy đủ</Button>
        </Space>
      </Card>
    </Space>
  );
}

function PreviewPane({ app, onOpen }: { app: App; onOpen: (url: string) => void }) {
  if (!app.currentUrl) {
    return (
      <Card style={{ boxShadow: CARD_SHADOW }}>
        <Empty description="App chưa được deploy — chưa có bản preview trực tiếp." style={{ padding: '48px 0' }}>
          <Button icon={<EyeOutlined />} onClick={() => onOpen(`${WEB_APP}/apps/${app.id}`)}>Mở trong console web</Button>
        </Empty>
      </Card>
    );
  }
  return (
    <Card styles={{ body: { padding: 0 } }} style={{ boxShadow: CARD_SHADOW, overflow: 'hidden' }}
      title={<Space><GlobalOutlined style={{ color: '#16B98D' }} /><Text style={{ fontSize: 13 }}>{app.currentUrl}</Text></Space>}
      extra={<Button size="small" icon={<ExportOutlined />} onClick={() => onOpen(app.currentUrl!)}>Mở</Button>}>
      <iframe title={app.name} src={app.currentUrl} style={{ width: '100%', height: 560, border: 'none', display: 'block' }} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
    </Card>
  );
}

function Overview({ app }: { app: App }) {
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: 'Trạng thái', value: <StatusTag status={app.status} /> },
    { label: 'Loại', value: TRACK_LABEL[app.track] ?? app.track },
    { label: 'Backend', value: app.backendKind === 'fullstack' ? 'Full-stack (DB + API)' : 'Tĩnh (static)' },
    { label: 'URL', value: app.currentUrl || '—' },
    { label: 'Git', value: app.gitRepo ? `${app.gitProvider ?? ''} ${app.gitRepo}` : '—' },
    { label: 'Lượt xem', value: app.visits ?? 0 },
    { label: 'Số builds', value: app.buildsCount ?? '—' },
    { label: 'Số deployments', value: app.deploymentsCount ?? '—' },
    { label: 'Tạo lúc', value: formatDate(app.createdAt) },
    { label: 'Cập nhật', value: formatDate(app.updatedAt) },
  ];
  return (
    <Card style={{ boxShadow: CARD_SHADOW }} styles={{ body: { padding: 20 } }}>
      {app.description && <Paragraph type="secondary" style={{ marginTop: 0 }}>{app.description}</Paragraph>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        {rows.map((r) => (
          <div key={r.label} style={{ padding: '10px 12px', border: '1px solid #ECEDF3', borderRadius: 10 }}>
            <div style={{ fontSize: 12, color: '#9AA3B5' }}>{r.label}</div>
            <div style={{ fontSize: 13.5, color: '#1E2230', marginTop: 2, wordBreak: 'break-all' }}>{r.value}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function BuildsTab({ id }: { id: string }) {
  const [items, setItems] = useState<Build[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    accountApi.appBuilds(id, { pageSize: 50 }).then((r) => alive && setItems(r.items)).catch(() => alive && setItems([])).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id]);
  const cols: ColumnsType<Build> = [
    { title: 'Prompt', dataIndex: 'prompt', key: 'prompt', render: (v: string | null) => <Text style={{ fontSize: 13 }}>{v ? (v.length > 80 ? v.slice(0, 80) + '…' : v) : '—'}</Text> },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 130, render: (s: string) => <StatusTag status={s} /> },
    { title: 'Lúc', dataIndex: 'createdAt', key: 'createdAt', width: 150, render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{formatDate(v)}</Text> },
  ];
  return (
    <Card style={{ boxShadow: CARD_SHADOW }} styles={{ body: { padding: 8 } }}>
      <Table<Build> rowKey="id" size="small" loading={loading} columns={cols} dataSource={items} pagination={{ pageSize: 12, hideOnSinglePage: true }} locale={{ emptyText: 'Chưa có build nào' }} />
    </Card>
  );
}

function DeploymentsTab({ id }: { id: string }) {
  const [items, setItems] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    accountApi.appDeployments(id, { pageSize: 50 }).then((r) => alive && setItems(r.items)).catch(() => alive && setItems([])).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id]);
  const cols: ColumnsType<Deployment> = [
    { title: 'URL', dataIndex: 'url', key: 'url', render: (v: string | null) => v ? <Text style={{ fontSize: 13 }}>{v}</Text> : <Text type="secondary">—</Text> },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 130, render: (s: string) => <StatusTag status={s} /> },
    { title: 'Lúc', dataIndex: 'createdAt', key: 'createdAt', width: 150, render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{formatDate(v)}</Text> },
  ];
  return (
    <Card style={{ boxShadow: CARD_SHADOW }} styles={{ body: { padding: 8 } }}>
      <Table<Deployment> rowKey="id" size="small" loading={loading} columns={cols} dataSource={items} pagination={{ pageSize: 12, hideOnSinglePage: true }} locale={{ emptyText: 'Chưa có deployment nào' }} />
    </Card>
  );
}
