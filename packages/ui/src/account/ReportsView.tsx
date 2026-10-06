'use client';
import { useCallback, useEffect, useState } from 'react';
import { App, Button, Card, Col, Empty, Row, Space, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { BugOutlined, DollarOutlined, PaperClipOutlined, PlusOutlined, ReloadOutlined, StarOutlined } from '@ant-design/icons';
import {
  accountApi,
  formatDate,
  SEVERITY_LABEL,
  type Feedback,
  type FeedbackSeverity,
  type FeedbackStatus,
  type MyFeedbackResponse,
} from './api';
import { FeedbackButton } from '../components/FeedbackButton';

const { Title, Text, Paragraph } = Typography;

const STATUS_META: Record<FeedbackStatus, { label: string; color: string }> = {
  open: { label: 'Đang chờ', color: 'gold' },
  resolved: { label: 'Đã sửa', color: 'green' },
  duplicate: { label: 'Trùng lặp', color: 'default' },
  rejected: { label: 'Từ chối', color: 'red' },
};
const SEVERITY_COLOR: Record<FeedbackSeverity, string> = { low: 'blue', medium: 'gold', high: 'orange', critical: 'red' };
const vnd = (n: number) => `${(n || 0).toLocaleString('vi-VN')}đ`;

/** Native desktop port of the website's /reports (my bug reports + tester rewards). */
export function ReportsView() {
  const { message } = App.useApp();
  const [data, setData] = useState<MyFeedbackResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await accountApi.myFeedback());
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: ColumnsType<Feedback> = [
    { title: 'Nội dung', dataIndex: 'message', key: 'message', render: (v: string) => <Text style={{ fontSize: 13 }}>{v.length > 90 ? v.slice(0, 90) + '…' : v}</Text> },
    {
      title: 'Mức độ', dataIndex: 'severity', key: 'severity', width: 120,
      render: (s: FeedbackSeverity | null) =>
        s ? <Tag color={SEVERITY_COLOR[s]} bordered={false}>{SEVERITY_LABEL[s]}</Tag> : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>,
    },
    { title: 'Điểm', dataIndex: 'points', key: 'points', width: 80, render: (p: number) => <Text strong>{p || 0}</Text> },
    {
      title: 'Thưởng', key: 'reward', width: 150,
      render: (_, r) =>
        r.rewardVnd > 0 ? (
          <Space direction="vertical" size={0}>
            <Text strong style={{ fontSize: 13 }}>{vnd(r.rewardVnd)}</Text>
            <Tag color={r.rewardPaid ? 'green' : 'gold'} bordered={false} style={{ marginInlineEnd: 0 }}>{r.rewardPaid ? 'Đã thanh toán' : 'Chờ thanh toán'}</Tag>
          </Space>
        ) : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>,
    },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 120, render: (s: FeedbackStatus) => <Tag color={STATUS_META[s].color} bordered={false}>{STATUS_META[s].label}</Tag> },
    { title: 'Gửi lúc', dataIndex: 'createdAt', key: 'createdAt', width: 140, render: (v) => <Text type="secondary" style={{ fontSize: 12 }}>{formatDate(v)}</Text> },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            <BugOutlined style={{ color: '#6C5CE7', marginInlineEnd: 8 }} />
            Báo lỗi của tôi
          </Title>
          <Text type="secondary">Bạn là tester của Larkwave — báo lỗi hợp lệ được tính điểm &amp; thưởng. Lỗi trùng ghi nhận cho người báo đầu tiên.</Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>Tải lại</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setReportOpen(true)}>Báo lỗi mới</Button>
        </Space>
      </div>

      {/* File-a-bug lives on the bug page itself (was only reachable via the floating FAB before). */}
      <FeedbackButton
        variant="controlled"
        page="reports"
        open={reportOpen}
        onOpenChange={(v) => { setReportOpen(v); if (!v) void load(); }}
      />

      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Tổng điểm" value={data?.totalPoints ?? 0} prefix={<StarOutlined style={{ color: '#6C5CE7' }} />} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Lỗi đã được sửa" value={data?.resolvedCount ?? 0} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Tổng thưởng" value={vnd(data?.totalRewardVnd ?? 0)} prefix={<DollarOutlined style={{ color: '#16B98D' }} />} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Đã nhận" value={vnd(data?.paidRewardVnd ?? 0)} valueStyle={{ color: '#16B98D' }} /></Card></Col>
      </Row>

      <Table<Feedback>
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={data?.items ?? []}
        scroll={{ x: 720 }}
        locale={{ emptyText: <Empty description="Bạn chưa gửi báo lỗi nào"><Button type="primary" icon={<PlusOutlined />} onClick={() => setReportOpen(true)}>Gửi báo lỗi đầu tiên</Button></Empty> }}
        expandable={{
          expandedRowRender: (r) => (
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              <Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{r.message}</Paragraph>
              {r.url && <Text type="secondary" style={{ fontSize: 12 }}>Trang: {r.url}</Text>}
              {r.attachments.length > 0 && (
                <Text type="secondary" style={{ fontSize: 12 }}><PaperClipOutlined /> {r.attachments.length} tệp đính kèm (xem trên web)</Text>
              )}
              {r.adminNote && (
                <div>
                  <Text strong style={{ fontSize: 12.5 }}>Phản hồi của admin: </Text>
                  <Text type="secondary" style={{ fontSize: 12.5 }}>{r.adminNote}</Text>
                </div>
              )}
            </Space>
          ),
        }}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
      />
    </Space>
  );
}
