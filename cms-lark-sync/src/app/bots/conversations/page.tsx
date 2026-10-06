'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Card, Button, Space, Typography, Empty, Tag, Tabs, message, Input,
  Table, Drawer, Badge, Select, Tooltip, Modal, Descriptions, List, Segmented,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  MessageOutlined, UserOutlined, ReloadOutlined, SearchOutlined,
  TagOutlined, EditOutlined, SaveOutlined, CloseOutlined,
  RobotOutlined, PhoneOutlined, ShopOutlined, EnvironmentOutlined,
  BarChartOutlined, CommentOutlined, TeamOutlined,
} from '@ant-design/icons';
import { api } from '@/lib/api';

const { Text, Title } = Typography;

// ═══ Types ═══

interface CustomerProfile {
  _id: string;
  agentId: { _id: string; name: string } | string;
  channel: string;
  senderId: string;
  chatId: string;
  name: string;
  phone: string;
  customerCode: string;
  company: string;
  email: string;
  source: string;
  primaryRoute: string;
  goodsTypes: string[];
  serviceType: string;
  avgWeight: string;
  priceLevel: string;
  tags: string[];
  notes: string;
  tier: string;
  conversationSummary: string;
  recentInteractions: { date: string; channel: string; summary: string; intent: string; resolved: boolean }[];
  totalInteractions: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

interface Session {
  _id: string;
  channel: string;
  chatId: string;
  senderId: string;
  agentId: { _id: string; name: string } | string;
  messages: { role: string; content: string; timestamp: string }[];
  lastActiveAt: string;
  customerName: string;
  customerPhone: string;
  customerTags: string[];
  customerTier: string;
  messageCount: number;
  lastMessage: { role: string; content: string; timestamp: string } | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ═══ Helpers ═══

const CHANNEL_COLORS: Record<string, string> = {
  lark: '#3370ff', telegram: '#0088cc', zalo: '#0068ff',
  messenger: '#006aff', slack: '#4a154b', whatsapp: '#25d366',
};

const TIER_COLORS: Record<string, string> = {
  new: 'default', regular: 'blue', vip: 'gold', enterprise: 'purple',
};

const TIER_LABELS: Record<string, string> = {
  new: 'Mới', regular: 'Thường', vip: 'VIP', enterprise: 'Doanh nghiệp',
};

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  if (diff < 60_000) return 'vừa xong';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} phút`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} giờ`;
  return `${Math.floor(diff / 86400_000)} ngày`;
}

// ═══ Conversations Tab ═══

function ConversationsTab() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 30, total: 0, totalPages: 0 });
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const loadSessions = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const { data } = await api.get('/bot-customers/sessions/list', { params: { page, limit: 30 } });
      setSessions(data.data || []);
      setPagination(data.pagination || { page, limit: 30, total: 0, totalPages: 0 });
    } catch { message.error('Không tải được sessions'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const openSession = async (session: Session) => {
    try {
      const { data } = await api.get(`/bot-customers/sessions/${session._id}`);
      setSelectedSession(data.data);
      setDrawerOpen(true);
    } catch { message.error('Không mở được session'); }
  };

  const columns: ColumnsType<Session> = [
    {
      title: 'Khách', dataIndex: 'customerName', width: 140,
      render: (name: string, r) => (
        <div>
          <Text strong style={{ fontSize: 13 }}>{name || r.senderId?.slice(0, 12) || '(ẩn danh)'}</Text>
          {r.customerTier && r.customerTier !== 'new' && (
            <Tag color={TIER_COLORS[r.customerTier]} style={{ fontSize: 9, marginLeft: 4 }}>{TIER_LABELS[r.customerTier]}</Tag>
          )}
        </div>
      ),
    },
    {
      title: 'Kênh', dataIndex: 'channel', width: 80,
      render: (ch: string) => <Tag color={CHANNEL_COLORS[ch] || 'default'} style={{ fontSize: 10 }}>{ch}</Tag>,
    },
    {
      title: 'Agent', width: 120,
      render: (_, r) => <Text style={{ fontSize: 12 }}>{typeof r.agentId === 'object' ? r.agentId.name : '—'}</Text>,
    },
    {
      title: 'Tin nhắn cuối', width: 280,
      render: (_, r) => r.lastMessage ? (
        <Tooltip title={r.lastMessage.content}>
          <Text style={{ fontSize: 12, color: r.lastMessage.role === 'user' ? 'var(--text-color)' : 'var(--accent-color)' }}>
            {r.lastMessage.role === 'user' ? '👤 ' : '🤖 '}
            {r.lastMessage.content.slice(0, 60)}{r.lastMessage.content.length > 60 ? '...' : ''}
          </Text>
        </Tooltip>
      ) : <Text type="secondary" style={{ fontSize: 11 }}>—</Text>,
    },
    {
      title: 'Msgs', dataIndex: 'messageCount', width: 60, align: 'center',
      render: (c: number) => <Badge count={c} showZero color="var(--accent-color)" />,
    },
    {
      title: 'Lần cuối', dataIndex: 'lastActiveAt', width: 90,
      render: (d: string) => <Text type="secondary" style={{ fontSize: 11 }}>{timeAgo(d)}</Text>,
    },
    {
      title: '', width: 40,
      render: (_, r) => <Button type="link" size="small" icon={<MessageOutlined />} onClick={() => openSession(r)} />,
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>{pagination.total} hội thoại đang hoạt động</Text>
        <Button size="small" icon={<ReloadOutlined />} onClick={() => loadSessions()}>Refresh</Button>
      </div>
      <Table<Session>
        columns={columns} dataSource={sessions} rowKey="_id"
        loading={loading} size="small"
        pagination={{
          current: pagination.page, pageSize: pagination.limit, total: pagination.total,
          onChange: p => loadSessions(p), showSizeChanger: false, size: 'small',
        }}
        onRow={r => ({ onClick: () => openSession(r), style: { cursor: 'pointer' } })}
      />

      {/* Session detail drawer */}
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} width={480}
        title={<Space><MessageOutlined /> Hội thoại {selectedSession?.customerName && `— ${selectedSession.customerName}`}</Space>}>
        {selectedSession && (
          <div>
            <div style={{ marginBottom: 12, padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 6 }}>
              <Space wrap>
                <Tag color={CHANNEL_COLORS[selectedSession.channel]}>{selectedSession.channel}</Tag>
                <Text style={{ fontSize: 11 }}>Agent: {typeof selectedSession.agentId === 'object' ? selectedSession.agentId.name : '—'}</Text>
                <Text type="secondary" style={{ fontSize: 11 }}>{selectedSession.messageCount} tin nhắn</Text>
              </Space>
            </div>
            <List
              dataSource={selectedSession.messages || []}
              renderItem={(msg) => (
                <div style={{
                  display: 'flex', justifyContent: msg.role === 'user' ? 'flex-start' : 'flex-end',
                  marginBottom: 8,
                }}>
                  <div style={{
                    maxWidth: '80%', padding: '8px 12px', borderRadius: 12,
                    background: msg.role === 'user' ? 'var(--bg-tertiary)' : 'var(--accent-color)',
                    color: msg.role === 'user' ? 'var(--text-color)' : '#fff',
                  }}>
                    <Text style={{ fontSize: 13, color: 'inherit', whiteSpace: 'pre-wrap' }}>{msg.content}</Text>
                    <div style={{ fontSize: 10, opacity: 0.6, textAlign: 'right', marginTop: 2 }}>
                      {new Date(msg.timestamp).toLocaleTimeString('vi')}
                    </div>
                  </div>
                </div>
              )}
            />
          </div>
        )}
      </Drawer>
    </div>
  );
}

// ═══ Customers Tab ═══

function CustomersTab() {
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 30, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfile | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<Partial<CustomerProfile>>({});
  const [saving, setSaving] = useState(false);

  const loadCustomers = useCallback(async (page = 1, q = '') => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: 30 };
      if (q) params.search = q;
      const { data } = await api.get('/bot-customers', { params });
      setCustomers(data.data || []);
      setPagination(data.pagination || { page, limit: 30, total: 0, totalPages: 0 });
    } catch { message.error('Không tải được khách hàng'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  const openCustomer = async (id: string) => {
    try {
      const { data } = await api.get(`/bot-customers/${id}`);
      setSelectedCustomer(data.data);
      setEditMode(false);
    } catch { message.error('Không mở được hồ sơ'); }
  };

  const saveCustomer = async () => {
    if (!selectedCustomer) return;
    setSaving(true);
    try {
      const { data } = await api.put(`/bot-customers/${selectedCustomer._id}`, editData);
      setSelectedCustomer(data.data);
      setEditMode(false);
      message.success('Đã lưu');
      loadCustomers(pagination.page, search);
    } catch { message.error('Lưu thất bại'); }
    finally { setSaving(false); }
  };

  const columns: ColumnsType<CustomerProfile> = [
    {
      title: 'Khách hàng', width: 180,
      render: (_, r) => (
        <div>
          <Text strong style={{ fontSize: 13 }}>{r.name || '(chưa biết tên)'}</Text>
          {r.tier !== 'new' && <Tag color={TIER_COLORS[r.tier]} style={{ fontSize: 9, marginLeft: 4 }}>{TIER_LABELS[r.tier]}</Tag>}
          {r.phone && <div><PhoneOutlined style={{ fontSize: 10 }} /> <Text style={{ fontSize: 11 }}>{r.phone}</Text></div>}
        </div>
      ),
    },
    {
      title: 'Kênh', dataIndex: 'channel', width: 70,
      render: (ch: string) => <Tag color={CHANNEL_COLORS[ch]} style={{ fontSize: 10 }}>{ch}</Tag>,
    },
    {
      title: 'Dịch vụ', width: 100,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          {r.serviceType && <Tag style={{ fontSize: 10 }}>{r.serviceType}</Tag>}
          {r.primaryRoute && <Text style={{ fontSize: 10 }}><EnvironmentOutlined /> {r.primaryRoute}</Text>}
        </Space>
      ),
    },
    {
      title: 'Tags', dataIndex: 'tags', width: 160,
      render: (tags: string[]) => tags?.map(t => <Tag key={t} color="blue" style={{ fontSize: 9, marginBottom: 2 }}>{t}</Tag>),
    },
    {
      title: 'Tương tác', dataIndex: 'totalInteractions', width: 70, align: 'center',
      render: (c: number) => <Badge count={c} showZero color="#8b5cf6" />,
    },
    {
      title: 'Lần cuối', dataIndex: 'lastSeenAt', width: 90,
      render: (d: string) => <Text type="secondary" style={{ fontSize: 11 }}>{d ? timeAgo(d) : '—'}</Text>,
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Input.Search placeholder="Tìm tên, SĐT, mã KH..." size="small" allowClear
          style={{ width: 280 }} onSearch={v => { setSearch(v); loadCustomers(1, v); }}
          prefix={<SearchOutlined />} />
        <Button size="small" icon={<ReloadOutlined />} onClick={() => loadCustomers(1, search)}>Refresh</Button>
        <Text type="secondary" style={{ fontSize: 12, lineHeight: '24px' }}>{pagination.total} khách</Text>
      </div>
      <Table<CustomerProfile>
        columns={columns} dataSource={customers} rowKey="_id"
        loading={loading} size="small"
        pagination={{
          current: pagination.page, pageSize: pagination.limit, total: pagination.total,
          onChange: p => loadCustomers(p, search), showSizeChanger: false, size: 'small',
        }}
        onRow={r => ({ onClick: () => openCustomer(r._id), style: { cursor: 'pointer' } })}
      />

      {/* Customer detail modal */}
      <Modal open={!!selectedCustomer} onCancel={() => setSelectedCustomer(null)} width={640}
        title={<Space><UserOutlined /> {selectedCustomer?.name || 'Khách hàng'}</Space>}
        footer={editMode ? (
          <Space>
            <Button icon={<CloseOutlined />} onClick={() => setEditMode(false)}>Huỷ</Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={saveCustomer}>Lưu</Button>
          </Space>
        ) : (
          <Button icon={<EditOutlined />} onClick={() => { setEditData({ ...selectedCustomer }); setEditMode(true); }}>Sửa</Button>
        )}
      >
        {selectedCustomer && !editMode && (
          <div>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="Tên">{selectedCustomer.name || '—'}</Descriptions.Item>
              <Descriptions.Item label="SĐT">{selectedCustomer.phone || '—'}</Descriptions.Item>
              <Descriptions.Item label="Mã KH">{selectedCustomer.customerCode || '—'}</Descriptions.Item>
              <Descriptions.Item label="Công ty">{selectedCustomer.company || '—'}</Descriptions.Item>
              <Descriptions.Item label="Email">{selectedCustomer.email || '—'}</Descriptions.Item>
              <Descriptions.Item label="Nguồn">{selectedCustomer.source || '—'}</Descriptions.Item>
              <Descriptions.Item label="Kênh"><Tag color={CHANNEL_COLORS[selectedCustomer.channel]}>{selectedCustomer.channel}</Tag></Descriptions.Item>
              <Descriptions.Item label="Phân hạng"><Tag color={TIER_COLORS[selectedCustomer.tier]}>{TIER_LABELS[selectedCustomer.tier]}</Tag></Descriptions.Item>
              <Descriptions.Item label="Dịch vụ">{selectedCustomer.serviceType || '—'}</Descriptions.Item>
              <Descriptions.Item label="Tuyến">{selectedCustomer.primaryRoute || '—'}</Descriptions.Item>
              <Descriptions.Item label="Hàng hay gửi" span={2}>{selectedCustomer.goodsTypes?.join(', ') || '—'}</Descriptions.Item>
              <Descriptions.Item label="Tags" span={2}>
                {selectedCustomer.tags?.map(t => <Tag key={t} color="blue">{t}</Tag>) || '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Ghi chú" span={2}>{selectedCustomer.notes || '—'}</Descriptions.Item>
              <Descriptions.Item label="Tóm tắt AI" span={2}>
                <Text style={{ fontSize: 12 }}>{selectedCustomer.conversationSummary || '—'}</Text>
              </Descriptions.Item>
            </Descriptions>

            <div style={{ marginTop: 16 }}>
              <Text strong style={{ fontSize: 13 }}>Lịch sử tương tác ({selectedCustomer.totalInteractions} lần)</Text>
              {selectedCustomer.recentInteractions?.length > 0 ? (
                <List size="small" style={{ marginTop: 8 }}
                  dataSource={selectedCustomer.recentInteractions.slice().reverse()}
                  renderItem={item => (
                    <List.Item style={{ padding: '4px 0' }}>
                      <div style={{ display: 'flex', gap: 8, width: '100%', alignItems: 'center' }}>
                        <Text type="secondary" style={{ fontSize: 10, whiteSpace: 'nowrap' }}>{new Date(item.date).toLocaleDateString('vi')}</Text>
                        {item.intent && <Tag style={{ fontSize: 9, margin: 0 }}>{item.intent}</Tag>}
                        <Text style={{ fontSize: 12, flex: 1 }}>{item.summary}</Text>
                      </div>
                    </List.Item>
                  )}
                />
              ) : <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>Chưa có</Text>}
            </div>
          </div>
        )}

        {selectedCustomer && editMode && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <Text style={{ fontSize: 11 }}>Tên</Text>
              <Input size="small" value={editData.name || ''} onChange={e => setEditData(d => ({ ...d, name: e.target.value }))} />
            </div>
            <div>
              <Text style={{ fontSize: 11 }}>SĐT</Text>
              <Input size="small" value={editData.phone || ''} onChange={e => setEditData(d => ({ ...d, phone: e.target.value }))} />
            </div>
            <div>
              <Text style={{ fontSize: 11 }}>Mã KH</Text>
              <Input size="small" value={editData.customerCode || ''} onChange={e => setEditData(d => ({ ...d, customerCode: e.target.value }))} />
            </div>
            <div>
              <Text style={{ fontSize: 11 }}>Công ty</Text>
              <Input size="small" value={editData.company || ''} onChange={e => setEditData(d => ({ ...d, company: e.target.value }))} />
            </div>
            <div>
              <Text style={{ fontSize: 11 }}>Email</Text>
              <Input size="small" value={editData.email || ''} onChange={e => setEditData(d => ({ ...d, email: e.target.value }))} />
            </div>
            <div>
              <Text style={{ fontSize: 11 }}>Nguồn</Text>
              <Input size="small" value={editData.source || ''} onChange={e => setEditData(d => ({ ...d, source: e.target.value }))} />
            </div>
            <div>
              <Text style={{ fontSize: 11 }}>Dịch vụ</Text>
              <Select size="small" style={{ width: '100%' }} value={editData.serviceType || ''}
                onChange={v => setEditData(d => ({ ...d, serviceType: v }))}
                options={[{ value: '', label: '—' }, { value: 'ký gửi', label: 'Ký gửi' }, { value: 'order', label: 'Order' }, { value: 'ủy thác', label: 'Ủy thác NK' }]} />
            </div>
            <div>
              <Text style={{ fontSize: 11 }}>Tuyến</Text>
              <Select size="small" style={{ width: '100%' }} value={editData.primaryRoute || ''}
                onChange={v => setEditData(d => ({ ...d, primaryRoute: v }))}
                options={[{ value: '', label: '—' }, { value: 'HN', label: 'Hà Nội' }, { value: 'HCM', label: 'TP.HCM' }]} />
            </div>
            <div>
              <Text style={{ fontSize: 11 }}>Phân hạng</Text>
              <Select size="small" style={{ width: '100%' }} value={editData.tier || 'new'}
                onChange={v => setEditData(d => ({ ...d, tier: v }))}
                options={Object.entries(TIER_LABELS).map(([k, v]) => ({ value: k, label: v }))} />
            </div>
            <div>
              <Text style={{ fontSize: 11 }}>Tags (dấu phẩy)</Text>
              <Input size="small" value={(editData.tags || []).join(', ')}
                onChange={e => setEditData(d => ({ ...d, tags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <Text style={{ fontSize: 11 }}>Ghi chú</Text>
              <Input.TextArea rows={2} value={editData.notes || ''}
                onChange={e => setEditData(d => ({ ...d, notes: e.target.value }))} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ═══ Stats Tab ═══

function StatsTab() {
  const [customerStats, setCustomerStats] = useState<{ total: number; recentActive: number; byTier: Record<string, number>; byChannel: Record<string, number> } | null>(null);
  const [sessionStats, setSessionStats] = useState<{ activeSessions: number; totalMessages: number; byChannel: Record<string, number> } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/bot-customers/stats').then(r => setCustomerStats(r.data.data)).catch(() => {}),
      api.get('/bot-customers/sessions/stats').then(r => setSessionStats(r.data.data)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  if (loading) return <Card loading />;

  const statCard = (label: string, value: string | number, color: string, sub?: string) => (
    <div style={{ background: 'var(--bg-tertiary)', borderRadius: 8, padding: '12px 16px', borderLeft: `4px solid ${color}`, flex: '1 1 160px' }}>
      <Text style={{ fontSize: 24, fontWeight: 700, color, display: 'block', lineHeight: 1.2 }}>{value}</Text>
      <Text style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</Text>
      {sub && <Text style={{ fontSize: 10, color: 'var(--text-tertiary)', display: 'block' }}>{sub}</Text>}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {statCard('Khách hàng', customerStats?.total || 0, '#6366f1')}
        {statCard('Hoạt động 7 ngày', customerStats?.recentActive || 0, '#22c55e')}
        {statCard('Sessions đang mở', sessionStats?.activeSessions || 0, '#f59e0b')}
        {statCard('Tổng tin nhắn', sessionStats?.totalMessages || 0, '#ec4899')}
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {customerStats?.byTier && Object.keys(customerStats.byTier).length > 0 && (
          <Card size="small" title="Phân hạng khách" style={{ flex: '1 1 240px' }}>
            {Object.entries(customerStats.byTier).map(([tier, count]) => (
              <div key={tier} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <Tag color={TIER_COLORS[tier]}>{TIER_LABELS[tier] || tier}</Tag>
                <Text strong>{count}</Text>
              </div>
            ))}
          </Card>
        )}
        {customerStats?.byChannel && Object.keys(customerStats.byChannel).length > 0 && (
          <Card size="small" title="Theo kênh" style={{ flex: '1 1 240px' }}>
            {Object.entries(customerStats.byChannel).map(([ch, count]) => (
              <div key={ch} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <Tag color={CHANNEL_COLORS[ch]}>{ch}</Tag>
                <Text strong>{count}</Text>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}

// ═══ Main Page ═══

export default function BotConversationsPage() {
  return (
    <div style={{ padding: '16px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <CommentOutlined style={{ fontSize: 20, color: 'var(--accent-color)' }} />
        <Title level={4} style={{ margin: 0 }}>Hội thoại & Khách hàng</Title>
      </div>

      <Tabs defaultActiveKey="conversations" items={[
        {
          key: 'conversations',
          label: <Space size={4}><MessageOutlined />Hội thoại</Space>,
          children: <ConversationsTab />,
        },
        {
          key: 'customers',
          label: <Space size={4}><TeamOutlined />Khách hàng</Space>,
          children: <CustomersTab />,
        },
        {
          key: 'stats',
          label: <Space size={4}><BarChartOutlined />Thống kê</Space>,
          children: <StatsTab />,
        },
      ]} />
    </div>
  );
}
