'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  Empty,
  Row,
  Segmented,
  Skeleton,
  Space,
  Statistic,
  Table,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  BarChartOutlined,
  DesktopOutlined,
  ExportOutlined,
  GlobalOutlined,
  MobileOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { apiFetch } from './api';
import { CARD_SHADOW } from '../theme';

const { Title, Text } = Typography;

/* ───────────────────────── local types ───────────────────────── */
interface AnalyticsDay {
  /** "YYYY-MM-DD" (UTC). */
  day: string;
  count: number;
}
interface AppAnalytics {
  /** Window length in days. */
  rangeDays: number;
  /** Total pageviews in the window. */
  total: number;
  /** Chronological daily series (missing days filled with 0). */
  days: AnalyticsDay[];
  /** Top referrer hosts in the window. */
  referrers: { host: string; count: number }[];
  /** Device split. */
  devices: { mobile: number; desktop: number };
}

const RANGE_OPTIONS = [
  { label: '7 ngày', value: 7 },
  { label: '30 ngày', value: 30 },
  { label: '90 ngày', value: 90 },
];

/** Native desktop port of the builder's per-app Analytics panel (visit analytics). */
export function AnalyticsView({ appId }: { appId: string }) {
  const { message } = App.useApp();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AppAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (d: number) => {
      setLoading(true);
      try {
        setData(await apiFetch<AppAnalytics>(`/apps/${appId}/analytics`, { query: { days: d } }));
      } catch (e) {
        message.error((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [appId, message],
  );

  useEffect(() => {
    void load(days);
  }, [load, days]);

  const deviceTotal = data ? data.devices.mobile + data.devices.desktop : 0;
  const mobilePct = deviceTotal ? Math.round((data!.devices.mobile / deviceTotal) * 100) : 0;
  const desktopPct = deviceTotal ? Math.round((data!.devices.desktop / deviceTotal) * 100) : 0;
  const avgPerDay = data && data.rangeDays ? Math.round(data.total / data.rangeDays) : 0;

  // Recent days first (most recent at top), with a small "bar" cell for quick eyeballing.
  const recentDays = data ? [...data.days].reverse() : [];
  const maxCount = data ? Math.max(1, ...data.days.map((d) => d.count)) : 1;

  const dayColumns: ColumnsType<AnalyticsDay> = [
    { title: 'Ngày', dataIndex: 'day', key: 'day', width: 140, render: (v: string) => <Text style={{ fontSize: 13 }}>{v}</Text> },
    {
      title: 'Lượt xem',
      dataIndex: 'count',
      key: 'count',
      width: 100,
      align: 'right',
      sorter: (a, b) => a.count - b.count,
      render: (c: number) => <Text strong>{c.toLocaleString('vi-VN')}</Text>,
    },
    {
      title: '',
      key: 'bar',
      render: (_, r) => (
        <div style={{ height: 8, borderRadius: 999, background: '#EEF0F6', minWidth: 60 }}>
          <div
            style={{
              height: '100%',
              width: `${Math.max(r.count ? 4 : 0, (r.count / maxCount) * 100)}%`,
              borderRadius: 999,
              background: r.count ? 'linear-gradient(90deg,#8A7FE0,#6C5CE7)' : 'transparent',
            }}
          />
        </div>
      ),
    },
  ];

  const refColumns: ColumnsType<{ host: string; count: number }> = [
    { title: 'Nguồn', dataIndex: 'host', key: 'host', ellipsis: true, render: (v: string) => <Text style={{ fontSize: 13 }}>{v}</Text> },
    {
      title: 'Lượt',
      dataIndex: 'count',
      key: 'count',
      width: 80,
      align: 'right',
      render: (c: number) => <Text strong>{c.toLocaleString('vi-VN')}</Text>,
    },
  ];

  const openWebConsole = () => window.open(`https://toolswave.net/apps/${appId}`, '_blank', 'noopener');

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            <BarChartOutlined style={{ color: '#6C5CE7', marginInlineEnd: 8 }} />
            Lượt xem
          </Title>
          <Text type="secondary">
            Lượt xem của app đã deploy (gửi từ trang công khai). Dữ liệu xuất hiện sau khi app được truy cập.
          </Text>
        </div>
        <Space wrap>
          <Segmented value={days} onChange={(v) => setDays(v as number)} options={RANGE_OPTIONS} />
          <Button icon={<ReloadOutlined />} onClick={() => void load(days)} loading={loading}>
            Tải lại
          </Button>
        </Space>
      </div>

      {loading ? (
        <Card style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }}>
          <Skeleton active paragraph={{ rows: 5 }} />
        </Card>
      ) : !data || data.total === 0 ? (
        <Card style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Chưa có lượt xem nào trong khoảng này. Deploy app và chia sẻ liên kết để bắt đầu thu thập."
          >
            <Button icon={<ExportOutlined />} onClick={openWebConsole}>
              Mở console web
            </Button>
          </Empty>
        </Card>
      ) : (
        <>
          {/* KPI tiles */}
          <Row gutter={[16, 16]}>
            <Col xs={12} md={6}>
              <Card size="small" style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }}>
                <Statistic
                  title={`Tổng lượt xem (${days} ngày)`}
                  value={data.total}
                  valueStyle={{ color: '#6C5CE7' }}
                />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card size="small" style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }}>
                <Statistic title="Trung bình / ngày" value={avgPerDay} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card size="small" style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }}>
                <Statistic
                  title="Mobile"
                  value={mobilePct}
                  suffix="%"
                  prefix={<MobileOutlined style={{ color: '#16B98D' }} />}
                  valueStyle={{ color: '#16B98D' }}
                />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card size="small" style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }}>
                <Statistic
                  title="Desktop"
                  value={desktopPct}
                  suffix="%"
                  prefix={<DesktopOutlined style={{ color: '#F59E0B' }} />}
                  valueStyle={{ color: '#F59E0B' }}
                />
              </Card>
            </Col>
          </Row>

          {/* Daily series table */}
          <Card
            title="Lượt xem theo ngày"
            style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }}
            styles={{ body: { padding: 0 } }}
          >
            <Table<AnalyticsDay>
              rowKey="day"
              size="small"
              columns={dayColumns}
              dataSource={recentDays}
              pagination={{ pageSize: 12, hideOnSinglePage: true, size: 'small' }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có dữ liệu" /> }}
            />
          </Card>

          <Row gutter={[16, 16]}>
            {/* Top referrers */}
            <Col xs={24} md={12}>
              <Card
                title={
                  <span>
                    <GlobalOutlined style={{ marginInlineEnd: 8 }} />
                    Nguồn truy cập
                  </span>
                }
                style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }}
                styles={{ body: { padding: data.referrers.length === 0 ? 16 : 0 } }}
              >
                {data.referrers.length === 0 ? (
                  <Text type="secondary">Chưa có dữ liệu nguồn.</Text>
                ) : (
                  <Table<{ host: string; count: number }>
                    rowKey="host"
                    size="small"
                    columns={refColumns}
                    dataSource={data.referrers}
                    pagination={{ pageSize: 8, hideOnSinglePage: true, size: 'small' }}
                  />
                )}
              </Card>
            </Col>

            {/* Devices */}
            <Col xs={24} md={12}>
              <Card title="Thiết bị" style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }} styles={{ body: { padding: 16 } }}>
                <Space direction="vertical" size={14} style={{ width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <MobileOutlined style={{ color: '#16B98D', fontSize: 18 }} />
                    <Text style={{ flex: 1 }}>Mobile</Text>
                    <Text strong>{data.devices.mobile.toLocaleString('vi-VN')}</Text>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <DesktopOutlined style={{ color: '#F59E0B', fontSize: 18 }} />
                    <Text style={{ flex: 1 }}>Desktop</Text>
                    <Text strong>{data.devices.desktop.toLocaleString('vi-VN')}</Text>
                  </div>
                </Space>
              </Card>
            </Col>
          </Row>
        </>
      )}
    </Space>
  );
}
