'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Card, Button, Space, Typography, Table, Tag, Drawer, Select, message,
  Statistic, Row, Col, Progress, Badge, Descriptions, Popconfirm,
  Segmented, InputNumber, Alert, List, Input, Rate, Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ThunderboltOutlined, ReloadOutlined, CheckCircleOutlined,
  CloseCircleOutlined, RobotOutlined, UserOutlined, EyeOutlined,
  PlayCircleOutlined, StarOutlined, BarChartOutlined,
  MessageOutlined, ExperimentOutlined, PauseCircleOutlined,
  BookOutlined, DeleteOutlined, BulbOutlined, EditOutlined,
  SaveOutlined, CheckOutlined, CommentOutlined,
} from '@ant-design/icons';
import { api } from '@/lib/api';

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;

// ═══ Types ═══

interface Turn {
  role: 'customer' | 'bot' | 'evaluator';
  content: string;
  editedContent?: string | null;
  timestamp: string;
  score?: number;
  issues?: string[];
}

interface TrainSession {
  _id: string;
  agentId: string;
  scenario: { category: string; difficulty: string; description: string; customerPersona: string };
  turns: Turn[];
  evaluation: { overallScore: number | null; passed: boolean | null; summary: string; strengths: string[]; weaknesses: string[] };
  status: string;
  reviewNote: string;
  batchId: string;
  learnedIds: { _id: string; title: string }[];
  totalInputTokens: number;
  totalOutputTokens: number;
  createdAt: string;
}

interface Agent { _id: string; name: string }

interface LoopStatus {
  running: boolean;
  mode: 'lark' | 'cms' | null;
  agentId: string | null;
  larkChatId: string | null;
  intervalMin: number;
  maxPerDay: number;
  sessionsToday: number;
  currentSessionId: string | null;
  waitingForHuman: boolean;
  startedAt: string | null;
  lastSessionAt: string | null;
  nextRunAt: string | null;
  recentErrors: { time: string; error: string }[];
}

interface Stats {
  overall: {
    total: number; completed: number; approved: number;
    avgScore: number | null; passed: number;
    totalInputTokens: number; totalOutputTokens: number;
  };
  totalLearned: number;
  byCategory: { _id: string; count: number; avgScore: number; passRate: number }[];
  loop: LoopStatus;
}

interface Learning {
  _id: string;
  title: string;
  metadata: { question: string; answer: string };
  tags: string[];
  indexedAt: string;
}

// ═══ Labels tiếng Việt ═══

const CAT: Record<string, string> = {
  pricing: 'Báo giá', shipping: 'Vận chuyển', tracking: 'Tra cứu đơn',
  services: 'Dịch vụ', complaint: 'Khiếu nại', new_customer: 'Khách mới',
  prohibited: 'Hàng cấm', payment: 'Thanh toán', warehouse: 'Kho bãi',
};
const DIFF_COLOR: Record<string, string> = { easy: 'green', medium: 'orange', hard: 'red' };
const STATUS_COLOR: Record<string, string> = {
  running: 'processing', completed: 'default', reviewed: 'blue', approved: 'success', rejected: 'error',
};

// ═══ Component ═══

export default function AutoTrainerPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState('');
  const [sessions, setSessions] = useState<TrainSession[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loopStatus, setLoopStatus] = useState<LoopStatus | null>(null);
  const [learnings, setLearnings] = useState<Learning[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('control');
  const [statusFilter, setStatusFilter] = useState('');
  const [modeFilter, setModeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [session, setSession] = useState<TrainSession | null>(null);
  const [editingTurns, setEditingTurns] = useState<Record<number, string>>({});
  const [editingScores, setEditingScores] = useState<Record<number, number>>({});
  const [saving, setSaving] = useState(false);

  // Config
  const [intervalMin, setIntervalMin] = useState(30);
  const [maxPerDay, setMaxPerDay] = useState(50);
  const [larkChatId, setLarkChatId] = useState('oc_1feca0a3070804996015f648657b0f59');

  // ═══ Data loading ═══

  useEffect(() => {
    api.get('/ai-agents').then(r => {
      if (r.data?.success) setAgents(r.data.data || []);
    }).catch(() => {});
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const r = await api.get('/ai-agents/trainer/status');
      if (r.data?.success) setLoopStatus(r.data.data);
    } catch {}
  }, []);

  const loadSessions = useCallback(async (p = 1) => {
    if (!agentId) return;
    setLoading(true);
    try {
      const params: Record<string, string> = { agentId, page: String(p), limit: '20' };
      if (statusFilter) params.status = statusFilter;
      if (modeFilter) params.mode = modeFilter;
      const r = await api.get('/ai-agents/trainer/sessions', { params });
      if (r.data?.success) { setSessions(r.data.data || []); setPage(p); setTotal(r.data.pagination?.total || 0); }
    } catch {}
    setLoading(false);
  }, [agentId, statusFilter, modeFilter]);

  const loadStats = useCallback(async () => {
    if (!agentId) return;
    try {
      const r = await api.get('/ai-agents/trainer/stats', { params: { agentId } });
      if (r.data?.success) setStats(r.data.data);
    } catch {}
  }, [agentId]);

  const loadLearnings = useCallback(async () => {
    if (!agentId) return;
    try {
      const r = await api.get('/ai-agents/trainer/learnings', { params: { agentId, limit: '100' } });
      if (r.data?.success) setLearnings(r.data.data || []);
    } catch {}
  }, [agentId]);

  useEffect(() => { loadStatus(); const iv = setInterval(loadStatus, 15000); return () => clearInterval(iv); }, [loadStatus]);
  useEffect(() => { if (agentId) { loadSessions(1); loadStats(); loadLearnings(); } }, [agentId, statusFilter, modeFilter]);

  const refresh = () => { loadSessions(1); loadStats(); loadLearnings(); loadStatus(); };

  // ═══ Actions ═══

  const startLark = async () => {
    if (!agentId || !larkChatId) return;
    try {
      const r = await api.post('/ai-agents/trainer/start-lark', { agentId, larkChatId, intervalMinutes: intervalMin, maxPerDay });
      if (r.data?.success) { message.success('Lark training bắt đầu!'); loadStatus(); }
    } catch (e: any) { message.error(e?.response?.data?.error || 'Lỗi'); }
  };

  const startCms = async () => {
    if (!agentId) return;
    try {
      const r = await api.post('/ai-agents/trainer/start-cms', { agentId, intervalMinutes: intervalMin, maxPerDay });
      if (r.data?.success) { message.success('CMS training bắt đầu!'); loadStatus(); }
    } catch (e: any) { message.error(e?.response?.data?.error || 'Lỗi'); }
  };

  const stopLoop = async () => {
    try { await api.post('/ai-agents/trainer/stop'); message.success('Đã dừng'); loadStatus(); } catch {}
  };

  const runOneLark = async () => {
    if (!agentId || !larkChatId) return;
    try {
      await api.post('/ai-agents/trainer/run-one-lark', { agentId, larkChatId });
      message.success('Đang tạo câu hỏi gửi lên Lark...');
      setTimeout(refresh, 10000);
    } catch (e: any) { message.error(e?.response?.data?.error || 'Lỗi'); }
  };

  const runOneCms = async () => {
    if (!agentId) return;
    try {
      await api.post('/ai-agents/trainer/run-one-cms', { agentId });
      message.success('Đang chạy hội thoại AI tự hỏi tự trả lời...');
      setTimeout(refresh, 30000);
    } catch (e: any) { message.error(e?.response?.data?.error || 'Lỗi'); }
  };

  // ═══ Session detail ═══

  const openSession = async (id: string) => {
    try {
      const r = await api.get(`/ai-agents/trainer/sessions/${id}`);
      if (r.data?.success) { setSession(r.data.data); setEditingTurns({}); setEditingScores({}); setDrawerOpen(true); }
    } catch { message.error('Không tải được'); }
  };

  const saveEdits = async () => {
    if (!session) return;
    setSaving(true);
    try {
      const turnMap = new Map<number, { index: number; editedContent?: string; score?: number }>();
      for (const [idx, content] of Object.entries(editingTurns)) {
        const i = Number(idx); turnMap.set(i, { ...(turnMap.get(i) || { index: i }), editedContent: content });
      }
      for (const [idx, score] of Object.entries(editingScores)) {
        const i = Number(idx); turnMap.set(i, { ...(turnMap.get(i) || { index: i }), score });
      }
      const r = await api.patch(`/ai-agents/trainer/sessions/${session._id}`, { turns: Array.from(turnMap.values()), status: 'reviewed' });
      if (r.data?.success) { message.success('Đã lưu'); setSession(r.data.data); setEditingTurns({}); setEditingScores({}); loadSessions(page); }
    } catch { message.error('Lưu thất bại'); }
    setSaving(false);
  };

  const approveSession = async () => {
    if (!session) return;
    try {
      const r = await api.post(`/ai-agents/trainer/sessions/${session._id}/approve`);
      if (r.data?.success) { message.success(`Đã duyệt! ${r.data.data.learnedCount} Q&A đã nạp vào knowledge base`); openSession(session._id); loadSessions(page); loadStats(); loadLearnings(); }
    } catch (e: any) { message.error(e?.response?.data?.error || 'Lỗi'); }
  };

  const rejectSession = async (id: string) => {
    try { await api.patch(`/ai-agents/trainer/sessions/${id}`, { status: 'rejected' }); message.success('Đã từ chối'); loadSessions(page); if (session?._id === id) setDrawerOpen(false); } catch {}
  };

  const deleteLearning = async (id: string) => {
    try { await api.delete(`/ai-agents/trainer/learnings/${id}`); message.success('Đã xoá'); loadLearnings(); loadStats(); } catch {}
  };

  // ═══ Table columns ═══

  const columns: ColumnsType<TrainSession> = [
    { title: 'Chế độ', dataIndex: 'batchId', width: 70,
      render: (v: string) => v?.startsWith('lark') ? <Tag color="blue">Lark</Tag> : <Tag color="purple">CMS</Tag> },
    { title: 'Chủ đề', dataIndex: ['scenario', 'category'], width: 90,
      render: (v: string) => <Tag>{CAT[v] || v}</Tag> },
    { title: 'Độ khó', dataIndex: ['scenario', 'difficulty'], width: 70,
      render: (v: string) => <Tag color={DIFF_COLOR[v]}>{v}</Tag> },
    { title: 'Persona', dataIndex: ['scenario', 'customerPersona'], width: 100, ellipsis: true },
    { title: 'Điểm', dataIndex: ['evaluation', 'overallScore'], width: 60,
      sorter: (a, b) => (a.evaluation?.overallScore || 0) - (b.evaluation?.overallScore || 0),
      render: (v: number | null) => {
        if (v == null) return '-';
        const c = v >= 8 ? '#52c41a' : v >= 6 ? '#faad14' : '#ff4d4f';
        return <Text strong style={{ color: c }}>{v}</Text>;
      } },
    { title: '', dataIndex: ['evaluation', 'passed'], width: 35,
      render: (v: boolean | null) => v == null ? '' : v
        ? <CheckCircleOutlined style={{ color: '#52c41a' }} />
        : <CloseCircleOutlined style={{ color: '#ff4d4f' }} /> },
    { title: 'Trạng thái', dataIndex: 'status', width: 90,
      render: (v: string) => <Badge status={STATUS_COLOR[v] as any} text={v} /> },
    { title: 'Ngày', dataIndex: 'createdAt', width: 110,
      render: (v: string) => new Date(v).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) },
    { title: '', width: 130, render: (_: any, r: TrainSession) => (
      <Space size="small">
        <Button size="small" icon={<EyeOutlined />} onClick={() => openSession(r._id)} />
        {r.status === 'completed' && (
          <>
            <Button size="small" type="primary" icon={<EditOutlined />} onClick={() => openSession(r._id)}>Duyệt</Button>
            <Button size="small" danger icon={<CloseCircleOutlined />} onClick={() => rejectSession(r._id)} />
          </>
        )}
      </Space>
    ) },
  ];

  // ═══ Render ═══

  return (
    <div style={{ padding: 24 }}>
      <Title level={3}><ExperimentOutlined /> Huấn luyện tự động — Bot CSKH</Title>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select placeholder="Chọn Agent" value={agentId || undefined} onChange={setAgentId}
            style={{ width: 280 }} options={agents.map(a => ({ value: a._id, label: a.name }))} />
          <Button icon={<ReloadOutlined />} onClick={refresh} disabled={!agentId}>Làm mới</Button>
        </Space>
      </Card>

      <Segmented value={view} onChange={v => setView(String(v))} style={{ marginBottom: 16 }}
        options={[
          { value: 'control', label: 'Điều khiển', icon: <ThunderboltOutlined /> },
          { value: 'sessions', label: 'Hội thoại', icon: <MessageOutlined /> },
          { value: 'learnings', label: 'Q&A đã học', icon: <BookOutlined /> },
          { value: 'stats', label: 'Thống kê', icon: <BarChartOutlined /> },
        ]} />

      {/* ═══ CONTROL PANEL ═══ */}
      {view === 'control' && (
        <Row gutter={16}>
          {/* Case 1: Lark */}
          <Col span={12}>
            <Card
              title={<Space><CommentOutlined /> Chế độ 1 — Lark (Bạn trả lời)</Space>}
              size="small"
              extra={loopStatus?.running && loopStatus.mode === 'lark'
                ? <Tag color="green" icon={<PlayCircleOutlined />}>ĐANG CHẠY</Tag>
                : null}
            >
              <Paragraph type="secondary">
                AI giả làm khách hàng, gửi câu hỏi lên <b>Lark group</b>.
                Bạn trả lời như nhân viên CSKH thật.
                AI tiếp tục hỏi cho đến khi hội thoại kết thúc tự nhiên.
              </Paragraph>

              <Space wrap style={{ marginBottom: 12 }}>
                <Input
                  value={larkChatId} onChange={e => setLarkChatId(e.target.value)}
                  placeholder="Lark Chat ID" style={{ width: 320 }}
                  addonBefore="Chat ID"
                />
              </Space>
              <br />
              <Space wrap style={{ marginBottom: 12 }}>
                <InputNumber min={1} max={120} value={intervalMin} onChange={v => setIntervalMin(v || 30)} addonBefore="Mỗi" addonAfter="phút" style={{ width: 180 }} />
                <InputNumber min={1} max={200} value={maxPerDay} onChange={v => setMaxPerDay(v || 50)} addonBefore="Tối đa" addonAfter="/ngày" style={{ width: 200 }} />
              </Space>
              <br />
              <Space>
                {loopStatus?.running && loopStatus.mode === 'lark' ? (
                  <Button danger icon={<PauseCircleOutlined />} onClick={stopLoop}>Dừng</Button>
                ) : (
                  <Button type="primary" icon={<PlayCircleOutlined />} onClick={startLark} disabled={!agentId || !larkChatId}>
                    Bắt đầu Lark Training
                  </Button>
                )}
                <Button icon={<ThunderboltOutlined />} onClick={runOneLark} disabled={!agentId || !larkChatId}>
                  Gửi 1 câu hỏi ngay
                </Button>
              </Space>

              {loopStatus?.waitingForHuman && (
                <Alert type="info" showIcon icon={<UserOutlined />} style={{ marginTop: 12 }}
                  message="Đang chờ bạn trả lời trên Lark..." />
              )}
            </Card>
          </Col>

          {/* Case 2: CMS */}
          <Col span={12}>
            <Card
              title={<Space><RobotOutlined /> Chế độ 2 — CMS (AI tự hỏi tự trả lời)</Space>}
              size="small"
              extra={loopStatus?.running && loopStatus.mode === 'cms'
                ? <Tag color="green" icon={<PlayCircleOutlined />}>ĐANG CHẠY</Tag>
                : null}
            >
              <Paragraph type="secondary">
                AI giả làm khách hàng, Bot trả lời qua pipeline thật (RAG + LLM).
                Bạn vào CMS <b>xem lại, chỉnh sửa câu trả lời, chấm điểm</b>,
                rồi duyệt để nạp Q&A vào knowledge base.
              </Paragraph>

              <Space wrap style={{ marginBottom: 12 }}>
                <InputNumber min={1} max={120} value={intervalMin} onChange={v => setIntervalMin(v || 30)} addonBefore="Mỗi" addonAfter="phút" style={{ width: 180 }} />
                <InputNumber min={1} max={200} value={maxPerDay} onChange={v => setMaxPerDay(v || 50)} addonBefore="Tối đa" addonAfter="/ngày" style={{ width: 200 }} />
              </Space>
              <br />
              <Space>
                {loopStatus?.running && loopStatus.mode === 'cms' ? (
                  <Button danger icon={<PauseCircleOutlined />} onClick={stopLoop}>Dừng</Button>
                ) : (
                  <Button type="primary" icon={<PlayCircleOutlined />} onClick={startCms} disabled={!agentId}>
                    Bắt đầu CMS Training
                  </Button>
                )}
                <Button icon={<ThunderboltOutlined />} onClick={runOneCms} disabled={!agentId}>
                  Chạy 1 hội thoại ngay
                </Button>
              </Space>

              {loopStatus?.running && loopStatus.mode === 'cms' && loopStatus.currentSessionId && (
                <Alert type="info" showIcon icon={<RobotOutlined />} style={{ marginTop: 12 }}
                  message="Đang chạy hội thoại..."
                  action={<Button size="small" onClick={() => openSession(loopStatus.currentSessionId!)}>Xem</Button>} />
              )}
            </Card>
          </Col>

          {/* Status */}
          {loopStatus?.running && (
            <Col span={24} style={{ marginTop: 16 }}>
              <Card size="small">
                <Row gutter={16}>
                  <Col span={4}><Statistic title="Hôm nay" value={loopStatus.sessionsToday} suffix={`/ ${loopStatus.maxPerDay}`} /></Col>
                  <Col span={4}><Statistic title="Chế độ" value={loopStatus.mode === 'lark' ? 'Lark' : 'CMS'} /></Col>
                  <Col span={4}><Statistic title="Khoảng cách" value={loopStatus.intervalMin} suffix="phút" /></Col>
                  <Col span={6}><Statistic title="Lần chạy cuối" value={loopStatus.lastSessionAt ? new Date(loopStatus.lastSessionAt).toLocaleTimeString('vi-VN') : '-'} /></Col>
                  <Col span={6}><Statistic title="Lần chạy tiếp" value={loopStatus.nextRunAt ? new Date(loopStatus.nextRunAt).toLocaleTimeString('vi-VN') : '-'} /></Col>
                </Row>
              </Card>
            </Col>
          )}

          {loopStatus?.recentErrors && loopStatus.recentErrors.length > 0 && (
            <Col span={24} style={{ marginTop: 12 }}>
              <Alert type="warning" showIcon message="Lỗi gần đây" description={
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {loopStatus.recentErrors.map((e, i) => (
                    <li key={i}><Text type="secondary">{new Date(e.time).toLocaleTimeString()}</Text> {e.error}</li>
                  ))}
                </ul>
              } />
            </Col>
          )}
        </Row>
      )}

      {/* ═══ SESSIONS ═══ */}
      {view === 'sessions' && (
        <div>
          <Space style={{ marginBottom: 12 }}>
            <Select placeholder="Chế độ" value={modeFilter || undefined} onChange={v => setModeFilter(v || '')}
              allowClear style={{ width: 120 }}
              options={[{ value: 'lark', label: 'Lark' }, { value: 'cms', label: 'CMS' }]} />
            <Select placeholder="Trạng thái" value={statusFilter || undefined} onChange={v => setStatusFilter(v || '')}
              allowClear style={{ width: 140 }}
              options={['running', 'completed', 'reviewed', 'approved', 'rejected'].map(s => ({ value: s, label: s }))} />
          </Space>
          <Table dataSource={sessions} columns={columns} rowKey="_id" loading={loading} size="small"
            pagination={{ current: page, pageSize: 20, total, onChange: loadSessions, showTotal: t => `${t} hội thoại` }} />
        </div>
      )}

      {/* ═══ LEARNED Q&A ═══ */}
      {view === 'learnings' && (
        <Card title={<><BookOutlined /> Q&A đã học ({learnings.length})</>} size="small">
          {!learnings.length ? <Text type="secondary">Chưa có Q&A nào. Bắt đầu training và duyệt sessions!</Text> : (
            <List dataSource={learnings} renderItem={item => (
              <List.Item actions={[
                <Popconfirm key="d" title="Xoá Q&A này?" onConfirm={() => deleteLearning(item._id)}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>,
              ]}>
                <List.Item.Meta
                  title={<Text strong>H: {item.metadata?.question}</Text>}
                  description={<>
                    <Text>Đ: {item.metadata?.answer?.slice(0, 200)}</Text>
                    <br /><Text type="secondary" style={{ fontSize: 11 }}>{new Date(item.indexedAt).toLocaleDateString('vi-VN')}</Text>
                  </>} />
              </List.Item>
            )} />
          )}
        </Card>
      )}

      {/* ═══ STATS ═══ */}
      {view === 'stats' && stats && (
        <div>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={4}><Card size="small"><Statistic title="Tổng cộng" value={stats.overall.total} /></Card></Col>
            <Col span={4}><Card size="small"><Statistic title="Hoàn thành" value={stats.overall.completed} /></Card></Col>
            <Col span={4}><Card size="small"><Statistic title="Q&A đã học" value={stats.totalLearned} prefix={<BookOutlined />} valueStyle={{ color: '#52c41a' }} /></Card></Col>
            <Col span={4}><Card size="small"><Statistic title="Điểm TB" value={stats.overall.avgScore?.toFixed(1) || '-'} suffix="/10" /></Card></Col>
            <Col span={4}><Card size="small"><Statistic title="Tỷ lệ đạt" value={stats.overall.completed ? Math.round(stats.overall.passed / stats.overall.completed * 100) : 0} suffix="%" /></Card></Col>
            <Col span={4}><Card size="small"><Statistic title="Tokens" value={Math.round((stats.overall.totalInputTokens + stats.overall.totalOutputTokens) / 1000)} suffix="K" /></Card></Col>
          </Row>
          <Card title="Theo chủ đề" size="small">
            <Table dataSource={stats.byCategory} rowKey="_id" size="small" pagination={false} columns={[
              { title: 'Chủ đề', dataIndex: '_id', render: (v: string) => CAT[v] || v },
              { title: 'Số lượng', dataIndex: 'count', width: 80 },
              { title: 'Điểm TB', dataIndex: 'avgScore', width: 80, render: (v: number) => v?.toFixed(1) || '-' },
              { title: 'Tỷ lệ đạt', dataIndex: 'passRate', width: 120, render: (v: number) => <Progress percent={Math.round((v || 0) * 100)} size="small" /> },
            ]} />
          </Card>
        </div>
      )}

      {/* ═══ SESSION DETAIL DRAWER ═══ */}
      <Drawer
        title={<Space>
          <ExperimentOutlined /> Chi tiết hội thoại
          {session?.batchId?.startsWith('lark') ? <Tag color="blue">Lark</Tag> : <Tag color="purple">CMS</Tag>}
          {session?.status && <Badge status={STATUS_COLOR[session.status] as any} text={session.status} />}
        </Space>}
        open={drawerOpen} onClose={() => setDrawerOpen(false)} width={750}
        extra={session && session.status !== 'approved' && (
          <Space>
            {Object.keys(editingTurns).length > 0 || Object.keys(editingScores).length > 0 ? (
              <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={saveEdits}>Lưu chỉnh sửa</Button>
            ) : null}
            <Popconfirm title="Duyệt và nạp Q&A vào knowledge base?" onConfirm={approveSession}>
              <Button type="primary" icon={<CheckOutlined />}>Duyệt</Button>
            </Popconfirm>
            <Button danger onClick={() => { rejectSession(session._id); setDrawerOpen(false); }}>Từ chối</Button>
          </Space>
        )}
      >
        {session && (
          <div>
            <Descriptions size="small" column={2} bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Chủ đề"><Tag>{CAT[session.scenario.category] || session.scenario.category}</Tag></Descriptions.Item>
              <Descriptions.Item label="Độ khó"><Tag color={DIFF_COLOR[session.scenario.difficulty]}>{session.scenario.difficulty}</Tag></Descriptions.Item>
              <Descriptions.Item label="Persona">{session.scenario.customerPersona}</Descriptions.Item>
              <Descriptions.Item label="Điểm"><Text strong>{session.evaluation?.overallScore ?? '-'}/10</Text></Descriptions.Item>
              <Descriptions.Item label="Mô tả" span={2}>{session.scenario.description}</Descriptions.Item>
            </Descriptions>

            <Title level={5}>Hội thoại ({session.turns?.filter(t => t.role !== 'evaluator').length || 0} tin nhắn)</Title>
            <Text type="secondary" style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>
              Click vào câu trả lời để chỉnh sửa. Chấm điểm từng lượt bằng ngôi sao.
              Khi duyệt, câu trả lời đã chỉnh sẽ được lưu vào knowledge base.
            </Text>

            <div style={{ maxHeight: 500, overflowY: 'auto', padding: 12, background: 'var(--bg-secondary)', borderRadius: 8, marginBottom: 16 }}>
              {session.turns?.map((turn, i) => (
                <div key={i} style={{
                  marginBottom: 12, padding: 10, borderRadius: 8,
                  background: turn.role === 'customer' ? 'var(--bg-tertiary)' : turn.role === 'bot' ? 'var(--bg-color)' : 'transparent',
                  borderLeft: turn.role === 'evaluator' ? '3px solid var(--warning-color, #faad14)' : undefined,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Space>
                      {turn.role === 'customer' && <Tag icon={<UserOutlined />} color="blue">Khách hàng</Tag>}
                      {turn.role === 'bot' && <Tag icon={<RobotOutlined />} color="green">
                        {session.batchId?.startsWith('lark') ? 'Nhân viên CSKH' : 'Bot'}
                      </Tag>}
                      {turn.role === 'evaluator' && <Tag icon={<StarOutlined />} color="orange">
                        Đánh giá {turn.score ? `(${turn.score}/10)` : ''}
                      </Tag>}
                    </Space>
                    {turn.role === 'bot' && session.status !== 'approved' && (
                      <Tooltip title="Chấm điểm lượt này">
                        <Rate count={10} value={editingScores[i] ?? turn.score ?? 0}
                          onChange={v => setEditingScores(prev => ({ ...prev, [i]: v }))} style={{ fontSize: 12 }} />
                      </Tooltip>
                    )}
                  </div>

                  {turn.role === 'bot' && session.status !== 'approved' ? (
                    <div>
                      {editingTurns[i] !== undefined ? (
                        <TextArea value={editingTurns[i]}
                          onChange={e => setEditingTurns(prev => ({ ...prev, [i]: e.target.value }))}
                          autoSize={{ minRows: 2, maxRows: 8 }} style={{ marginBottom: 4 }} />
                      ) : (
                        <div onClick={() => setEditingTurns(prev => ({ ...prev, [i]: turn.editedContent || turn.content }))}
                          style={{ cursor: 'pointer', whiteSpace: 'pre-wrap', padding: 4, borderRadius: 4, border: '1px dashed transparent' }}
                          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-color)')}
                          onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}>
                          {turn.editedContent || turn.content}
                          {turn.editedContent && <Tag color="blue" style={{ marginLeft: 8 }}>đã sửa</Tag>}
                          <EditOutlined style={{ marginLeft: 8, opacity: 0.4, fontSize: 12 }} />
                        </div>
                      )}
                    </div>
                  ) : (
                    <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{turn.content}</Paragraph>
                  )}

                  {turn.issues && turn.issues.length > 0 && (
                    <Space wrap style={{ marginTop: 4 }}>
                      {turn.issues.map((iss, j) => <Tag key={j} color="red">{iss}</Tag>)}
                    </Space>
                  )}
                </div>
              ))}
            </div>

            {session.evaluation && (
              <Card size="small" title="Đánh giá tổng" style={{ marginBottom: 16 }}>
                <Text>{session.evaluation.summary}</Text>
                {session.evaluation.weaknesses?.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    {session.evaluation.weaknesses.map((w, i) => <Tag key={i} color="red">{w}</Tag>)}
                  </div>
                )}
              </Card>
            )}

            {session.learnedIds?.length > 0 && (
              <Card size="small" title={`Q&A đã học (${session.learnedIds.length})`}>
                {session.learnedIds.map((item: any) => (
                  <Tag key={item._id} color="green" style={{ marginBottom: 4 }}>{item.title || item._id}</Tag>
                ))}
              </Card>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
