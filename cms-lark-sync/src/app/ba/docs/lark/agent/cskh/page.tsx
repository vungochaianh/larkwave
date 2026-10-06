'use client';

import React, { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Button, Space, Typography, Tag, Select, Input, Badge, Popconfirm,
  Segmented, Rate, Tooltip, Dropdown, message, Empty, Spin, InputNumber, Modal,
} from 'antd';
import {
  RobotOutlined, UserOutlined, StarOutlined, PlayCircleOutlined,
  PauseCircleOutlined, ThunderboltOutlined, ReloadOutlined,
  CheckOutlined, CloseCircleOutlined, EditOutlined, SaveOutlined,
  SendOutlined, MoreOutlined, ExperimentOutlined,
} from '@ant-design/icons';
import { api } from '@/lib/api';

const { Text } = Typography;
const { TextArea } = Input;

// ─── Design tokens ───────────────────────────────────────────────────────────

const C = {
  sidebarBg: 'var(--bg-color)',
  sidebarBorder: 'var(--border-color)',
  activeRowBg: 'var(--sidebar-active-bg)',
  hoverRowBg: 'var(--sidebar-hover-bg)',
  textPrimary: 'var(--text-color)',
  textSecondary: 'var(--text-secondary)',
  textMuted: 'var(--text-tertiary)',
  userGradient: 'linear-gradient(135deg, var(--blue-primary) 0%, var(--accent-color) 100%)',
  aiBg: 'var(--bg-color)',
  aiBorder: 'var(--border-color)',
  chatBg: 'var(--bg-secondary)',
  inputBg: 'var(--bg-color)',
  inputBorder: 'var(--border-color)',
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface Agent { _id: string; name: string }

interface InboxItem {
  _id: string;
  mode: 'lark' | 'cms';
  status: 'running' | 'completed' | 'reviewed' | 'approved' | 'rejected';
  scenario: { category: string; difficulty: string; description: string; customerPersona: string };
  evaluation: { overallScore: number | null; passed: boolean | null } | null;
  lastTurnPreview: string;
  lastTurnAt: string;
  turnCount: number;
  staffRepliedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Turn {
  role: 'customer' | 'bot' | 'evaluator';
  content: string;
  editedContent?: string | null;
  timestamp: string;
  score?: number;
  issues?: string[];
}

interface Session {
  _id: string;
  mode: 'lark' | 'cms';
  agentId: string;
  scenario: { category: string; difficulty: string; description: string; customerPersona: string };
  turns: Turn[];
  evaluation: { overallScore: number | null; passed: boolean | null; summary: string; weaknesses: string[] };
  status: string;
  learnedIds: unknown[];
  createdAt: string;
}

interface LoopStatus {
  running: boolean;
  mode: 'lark' | 'cms' | null;
  agentId: string | null;
  larkChatId: string | null;
  sessionsToday: number;
  maxPerDay: number;
  waitingForHuman: boolean;
  currentSessionId: string | null;
  lastSessionAt: string | null;
  nextRunAt: string | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CAT: Record<string, string> = {
  pricing: 'Báo giá', shipping: 'Vận chuyển', tracking: 'Tra cứu đơn',
  services: 'Dịch vụ', complaint: 'Khiếu nại', new_customer: 'Khách mới',
  prohibited: 'Hàng cấm', payment: 'Thanh toán', warehouse: 'Kho bãi',
};

const STATUS_COLOR: Record<string, string> = {
  running: 'processing', completed: 'default', reviewed: 'blue',
  approved: 'success', rejected: 'error',
};

const STATUS_LABEL: Record<string, string> = {
  running: 'Đang chạy', completed: 'Hoàn thành', reviewed: 'Đã review',
  approved: 'Đã duyệt', rejected: 'Từ chối',
};

const DIFF_COLOR: Record<string, string> = { easy: 'green', medium: 'orange', hard: 'red' };

function timeAgo(date: string): string {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return 'vừa xong';
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  return `${Math.floor(s / 86400)} ngày trước`;
}

// ─── Inner component (uses useSearchParams) ──────────────────────────────────

function CSKHInboxInner() {
  const searchParams = useSearchParams();

  // ── State ──────────────────────────────────────────────────────────────────
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState<string>('');
  const [modeFilter, setModeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [loopStatus, setLoopStatus] = useState<LoopStatus | null>(null);

  // Edit state
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editBuffer, setEditBuffer] = useState('');
  const [pendingEdits, setPendingEdits] = useState<Map<number, string>>(new Map());
  const [pendingScores, setPendingScores] = useState<Map<number, number>>(new Map());

  // Reply
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  // Action loading
  const [actionLoading, setActionLoading] = useState('');

  // Lark modal
  const [larkModalOpen, setLarkModalOpen] = useState(false);
  const [larkChatIdInput, setLarkChatIdInput] = useState('');
  const [larkAction, setLarkAction] = useState<'run-one' | 'start-loop'>('run-one');

  // Loop config modal
  const [loopModalOpen, setLoopModalOpen] = useState(false);
  const [loopMode, setLoopMode] = useState<'cms' | 'lark'>('cms');
  const [loopInterval, setLoopInterval] = useState(5);
  const [loopMaxPerDay, setLoopMaxPerDay] = useState(20);
  const [loopLarkChatId, setLoopLarkChatId] = useState('');

  const chatEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load agents ────────────────────────────────────────────────────────────
  useEffect(() => {
    api.get('/ai-agents').then(r => {
      if (r.data?.success) {
        setAgents(r.data.data || []);
        if (!agentId) {
          setAgentId('_all');
        }
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load loop status ──────────────────────────────────────────────────────
  const loadLoopStatus = useCallback(() => {
    api.get('/ai-agents/trainer/status').then(r => {
      if (r.data?.success) setLoopStatus(r.data.data);
    }).catch(() => {});
  }, []);

  useEffect(() => { loadLoopStatus(); }, [loadLoopStatus]);

  // ── Load inbox ─────────────────────────────────────────────────────────────
  const loadInbox = useCallback(async () => {
    if (!agentId) return;
    setInboxLoading(true);
    try {
      const params: Record<string, string> = { limit: '50' };
      if (agentId && agentId !== '_all') params.agentId = agentId;
      if (modeFilter !== 'all') params.mode = modeFilter;
      if (statusFilter === 'needs_review') {
        params.status = 'completed';
      } else if (statusFilter !== 'all') {
        params.status = statusFilter;
      }
      if (search.trim()) params.search = search.trim();
      const r = await api.get('/ai-agents/trainer/sessions/inbox', { params });
      if (r.data?.success) setInbox(r.data.data || []);
    } catch {
      // silent
    } finally {
      setInboxLoading(false);
    }
  }, [agentId, modeFilter, statusFilter, search]);

  useEffect(() => { loadInbox(); }, [loadInbox]);

  // ── Polling ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      loadInbox();
      loadLoopStatus();
    }, 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadInbox, loadLoopStatus]);

  // ── Deep link: auto-select session + switch agent ──────────────────────────
  useEffect(() => {
    const sid = searchParams.get('session');
    if (sid && !selectedId) {
      setSelectedId(sid);
      // Load session to get agentId and auto-switch
      api.get(`/ai-agents/trainer/sessions/${sid}`).then(r => {
        if (r.data?.success && r.data.data?.agentId) {
          setAgentId(r.data.data.agentId);
        }
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ── Load session detail ────────────────────────────────────────────────────
  const loadSession = useCallback(async (id: string) => {
    setSessionLoading(true);
    setEditingIdx(null);
    setPendingEdits(new Map());
    setPendingScores(new Map());
    try {
      const r = await api.get(`/ai-agents/trainer/sessions/${id}`);
      if (r.data?.success) setSession(r.data.data);
    } catch {
      message.error('Không thể tải phiên hội thoại');
    } finally {
      setSessionLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) loadSession(selectedId);
    else setSession(null);
  }, [selectedId, loadSession]);

  // ── Scroll to bottom on new turns ──────────────────────────────────────────
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [session?.turns?.length]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const sendReply = async () => {
    if (!selectedId || !replyText.trim()) return;
    setSending(true);
    try {
      const r = await api.post(`/ai-agents/trainer/sessions/${selectedId}/reply`, {
        content: replyText.trim(), role: 'bot',
      });
      if (r.data?.success) {
        setReplyText('');
        setSession(r.data.data);
        loadInbox();
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Lỗi gửi tin nhắn');
    } finally {
      setSending(false);
    }
  };

  const approveSession = async () => {
    if (!selectedId) return;
    setActionLoading('approve');
    try {
      const r = await api.post(`/ai-agents/trainer/sessions/${selectedId}/approve`);
      if (r.data?.success) {
        message.success(`Đã duyệt và học ${r.data.data?.learnedCount || 0} mục Q&A`);
        loadSession(selectedId);
        loadInbox();
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Lỗi duyệt Q&A');
    } finally {
      setActionLoading('');
    }
  };

  const rejectSession = async () => {
    if (!selectedId) return;
    setActionLoading('reject');
    try {
      await api.patch(`/ai-agents/trainer/sessions/${selectedId}`, { status: 'rejected' });
      message.success('Đã từ chối phiên');
      loadSession(selectedId);
      loadInbox();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Lỗi từ chối');
    } finally {
      setActionLoading('');
    }
  };

  const saveEdits = async () => {
    if (!selectedId || (pendingEdits.size === 0 && pendingScores.size === 0)) return;
    setActionLoading('save');
    try {
      const turns: { index: number; editedContent?: string; score?: number }[] = [];
      pendingEdits.forEach((content, idx) => {
        turns.push({ index: idx, editedContent: content });
      });
      pendingScores.forEach((score, idx) => {
        const existing = turns.find(t => t.index === idx);
        if (existing) existing.score = score;
        else turns.push({ index: idx, score });
      });
      await api.patch(`/ai-agents/trainer/sessions/${selectedId}`, { turns });
      message.success('Đã lưu chỉnh sửa');
      setPendingEdits(new Map());
      setPendingScores(new Map());
      setEditingIdx(null);
      loadSession(selectedId);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Lỗi lưu');
    } finally {
      setActionLoading('');
    }
  };

  const runOneCms = async () => {
    if (!agentId) return;
    setActionLoading('run-one-cms');
    try {
      await api.post('/ai-agents/trainer/run-one-cms', { agentId });
      message.success('Đã tạo 1 hội thoại CMS');
      setTimeout(loadInbox, 2000);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setActionLoading('');
    }
  };

  const runOneLark = async () => {
    if (!agentId || !larkChatIdInput.trim()) return;
    setActionLoading('run-one-lark');
    try {
      await api.post('/ai-agents/trainer/run-one-lark', { agentId, larkChatId: larkChatIdInput.trim() });
      message.success('Đã gửi 1 câu hỏi Lark');
      setLarkModalOpen(false);
      setTimeout(loadInbox, 2000);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setActionLoading('');
    }
  };

  const startLoop = async () => {
    if (!agentId) return;
    setActionLoading('start-loop');
    try {
      if (loopMode === 'cms') {
        await api.post('/ai-agents/trainer/start-cms', {
          agentId, intervalMinutes: loopInterval, maxPerDay: loopMaxPerDay,
        });
      } else {
        if (!loopLarkChatId.trim()) { message.warning('Cần nhập Lark Chat ID'); return; }
        await api.post('/ai-agents/trainer/start-lark', {
          agentId, larkChatId: loopLarkChatId.trim(),
          intervalMinutes: loopInterval, maxPerDay: loopMaxPerDay,
        });
      }
      message.success(`Đã bắt đầu ${loopMode.toUpperCase()} loop`);
      setLoopModalOpen(false);
      loadLoopStatus();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Lỗi bắt đầu loop');
    } finally {
      setActionLoading('');
    }
  };

  const stopLoop = async () => {
    setActionLoading('stop-loop');
    try {
      await api.post('/ai-agents/trainer/stop');
      message.success('Đã dừng loop');
      loadLoopStatus();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Lỗi dừng loop');
    } finally {
      setActionLoading('');
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  const isUnread = (item: InboxItem) => !item.staffRepliedAt && item.status === 'completed';
  const hasPendingChanges = pendingEdits.size > 0 || pendingScores.size > 0;
  const canAct = session && !['approved', 'rejected'].includes(session.status);

  // ── Render: Sidebar session row ────────────────────────────────────────────

  const renderSessionRow = (item: InboxItem) => {
    const active = item._id === selectedId;
    const unread = isUnread(item);
    const persona = item.scenario?.customerPersona || 'Khách hàng';
    const category = item.scenario?.category || '';
    const score = item.evaluation?.overallScore;

    return (
      <div
        key={item._id}
        onClick={() => setSelectedId(item._id)}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: '12px 14px',
          cursor: 'pointer',
          background: active ? C.activeRowBg : 'transparent',
          borderLeft: active ? '3px solid var(--accent-color)' : '3px solid transparent',
          borderBottom: `1px solid ${C.sidebarBorder}`,
          transition: 'background 0.15s',
          position: 'relative',
        }}
        onMouseEnter={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = C.hoverRowBg; }}
        onMouseLeave={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
      >
        {/* Avatar */}
        <div style={{
          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: item.mode === 'cms'
            ? 'linear-gradient(135deg, var(--purple-bg, #f0e6ff) 0%, var(--accent-color) 100%)'
            : 'linear-gradient(135deg, var(--blue-bg, #e6f0ff) 0%, var(--blue-primary, #3b82f6) 100%)',
          color: '#fff', fontSize: 16,
        }}>
          {item.mode === 'cms' ? <RobotOutlined /> : <UserOutlined />}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{
              fontWeight: unread ? 600 : 400,
              color: C.textPrimary,
              fontSize: 13,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 130,
            }}>
              {persona.length > 18 ? persona.slice(0, 18) + '...' : persona}
            </span>
            <Tag
              style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}
              color={item.mode === 'cms' ? 'purple' : 'blue'}
            >
              {item.mode === 'cms' ? 'AI trả lời' : 'Bạn trả lời'}
            </Tag>
            {category && (
              <Tag
                style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}
                color={DIFF_COLOR[item.scenario?.difficulty] || 'default'}
              >
                {CAT[category] || category}
              </Tag>
            )}
          </div>
          <div style={{
            fontSize: 12, color: C.textMuted,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {item.lastTurnPreview || 'Chưa có tin nhắn'}
          </div>
        </div>

        {/* Right column */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
          gap: 4, flexShrink: 0, minWidth: 64,
        }}>
          <span style={{ fontSize: 11, color: C.textMuted }}>
            {item.lastTurnAt ? timeAgo(item.lastTurnAt) : timeAgo(item.createdAt)}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Tag
              color={STATUS_COLOR[item.status] || 'default'}
              style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}
            >
              {STATUS_LABEL[item.status] || item.status}
            </Tag>
            {score != null && (
              <span style={{ fontSize: 11, color: 'var(--warning-color, #f59e0b)' }}>
                <StarOutlined style={{ marginRight: 2 }} />{score.toFixed(1)}
              </span>
            )}
          </div>
          {unread && (
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: 'var(--primary-color)', position: 'absolute',
              top: 14, right: 14,
            }} />
          )}
        </div>
      </div>
    );
  };

  // ── Render: Chat bubble ────────────────────────────────────────────────────

  const renderTurn = (turn: Turn, idx: number) => {
    const isCustomer = turn.role === 'customer';
    const isBot = turn.role === 'bot';
    const isEvaluator = turn.role === 'evaluator';
    const isEditing = editingIdx === idx;
    const displayContent = pendingEdits.get(idx) ?? turn.editedContent ?? turn.content;
    const currentScore = pendingScores.get(idx) ?? turn.score;

    if (isEvaluator) {
      return (
        <div key={idx} style={{
          display: 'flex', justifyContent: 'center', margin: '12px 0',
        }}>
          <div style={{
            maxWidth: 500, padding: '8px 14px', borderRadius: 8,
            background: 'var(--bg-tertiary)', fontSize: 12, color: C.textMuted,
            textAlign: 'center', lineHeight: 1.5,
          }}>
            <ExperimentOutlined style={{ marginRight: 6 }} />
            <strong>Đánh giá:</strong>{' '}
            {turn.content.length > 200 ? turn.content.slice(0, 200) + '...' : turn.content}
            {turn.score != null && (
              <Tag color="gold" style={{ marginLeft: 8 }}>{turn.score}/10</Tag>
            )}
          </div>
        </div>
      );
    }

    return (
      <div key={idx} style={{
        display: 'flex',
        flexDirection: isCustomer ? 'row' : 'row-reverse',
        alignItems: 'flex-start',
        gap: 8, margin: '8px 0', padding: '0 16px',
      }}>
        {/* Avatar */}
        <div style={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, color: '#fff',
          background: isCustomer ? C.userGradient : 'var(--bg-tertiary)',
          ...(isBot ? { color: C.textSecondary } : {}),
        }}>
          {isCustomer ? <UserOutlined /> : <RobotOutlined />}
        </div>

        {/* Bubble */}
        <div style={{ maxWidth: '70%', minWidth: 80 }}>
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 2 }}>
            {isCustomer ? 'Khách hàng (AI)' : (session?.mode === 'lark' ? 'Bạn (Nhân viên)' : 'Bot CSKH (AI)')}
            <span style={{ marginLeft: 8 }}>
              {turn.timestamp ? timeAgo(turn.timestamp) : ''}
            </span>
          </div>
          <div style={{
            padding: '10px 14px',
            borderRadius: isCustomer ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
            background: isCustomer ? C.userGradient : C.aiBg,
            color: isCustomer ? '#fff' : C.textPrimary,
            border: isBot ? `1px solid ${C.aiBorder}` : 'none',
            fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {isEditing ? (
              <TextArea
                value={editBuffer}
                onChange={e => setEditBuffer(e.target.value)}
                autoSize={{ minRows: 2, maxRows: 10 }}
                style={{ background: C.inputBg, color: C.textPrimary, border: `1px solid ${C.inputBorder}` }}
              />
            ) : (
              displayContent
            )}
          </div>

          {/* Bot turn actions */}
          {isBot && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              {canAct && !isEditing && (
                <Tooltip title="Chỉnh sửa">
                  <Button
                    type="text" size="small" icon={<EditOutlined />}
                    onClick={() => { setEditingIdx(idx); setEditBuffer(displayContent); }}
                    style={{ color: C.textMuted, fontSize: 12 }}
                  />
                </Tooltip>
              )}
              {isEditing && (
                <Space size={4}>
                  <Button
                    size="small" type="primary" icon={<CheckOutlined />}
                    onClick={() => {
                      const next = new Map(pendingEdits);
                      next.set(idx, editBuffer);
                      setPendingEdits(next);
                      setEditingIdx(null);
                    }}
                  >Xong</Button>
                  <Button
                    size="small"
                    onClick={() => setEditingIdx(null)}
                  >Huỷ</Button>
                </Space>
              )}
              {canAct && (
                <Rate
                  count={10}
                  value={currentScore || 0}
                  onChange={v => {
                    const next = new Map(pendingScores);
                    next.set(idx, v);
                    setPendingScores(next);
                  }}
                  style={{ fontSize: 12 }}
                />
              )}
              {currentScore != null && currentScore > 0 && (
                <Tag color="gold" style={{ fontSize: 11 }}>{currentScore}/10</Tag>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Render: Header actions dropdown ────────────────────────────────────────

  const actionMenuItems = [
    {
      key: 'run-one-cms',
      icon: <ThunderboltOutlined />,
      label: 'Chạy 1 hội thoại CMS',
      onClick: runOneCms,
      disabled: !agentId || actionLoading === 'run-one-cms',
    },
    {
      key: 'run-one-lark',
      icon: <SendOutlined />,
      label: 'Gửi 1 câu hỏi Lark',
      onClick: () => { setLarkAction('run-one'); setLarkModalOpen(true); },
      disabled: !agentId,
    },
    { type: 'divider' as const },
    ...(loopStatus?.running ? [{
      key: 'stop-loop',
      icon: <PauseCircleOutlined />,
      label: 'Dừng loop',
      danger: true,
      onClick: stopLoop,
    }] : [{
      key: 'start-loop',
      icon: <PlayCircleOutlined />,
      label: 'Bắt đầu loop...',
      onClick: () => setLoopModalOpen(true),
      disabled: !agentId,
    }]),
  ];

  // ─── Main render ───────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
      {/* ── Header bar ──────────────────────────────────────────────────────── */}
      <div style={{
        height: 48, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 16px',
        background: C.sidebarBg,
        borderBottom: `1px solid ${C.sidebarBorder}`,
      }}>
        <Select
          value={agentId || undefined}
          onChange={v => { setAgentId(v); setSelectedId(null); }}
          placeholder="Chọn agent"
          style={{ width: 180 }}
          options={[
            { value: '_all', label: 'Tất cả agent' },
            ...agents.map(a => ({ value: a._id, label: a.name })),
          ]}
          size="small"
        />

        <Segmented
          value={modeFilter}
          onChange={v => setModeFilter(v as string)}
          options={[
            { value: 'all', label: 'Tất cả' },
            { value: 'cms', label: 'AI tự trả lời (Đánh giá)' },
            { value: 'lark', label: 'Bạn trả lời' },
            { value: 'needs_review', label: 'Cần review' },
          ]}
          size="small"
        />

        <div style={{ flex: 1 }} />

        {/* Loop status badge */}
        {loopStatus && (
          <Tooltip title={
            loopStatus.running
              ? `${(loopStatus.mode || '').toUpperCase()} loop: ${loopStatus.sessionsToday}/${loopStatus.maxPerDay} phien hom nay`
              : 'Loop dang dung'
          }>
            <Badge
              status={loopStatus.running ? 'processing' : 'default'}
              text={
                <span style={{ fontSize: 12, color: C.textSecondary }}>
                  {loopStatus.running
                    ? `${(loopStatus.mode || '').toUpperCase()} ${loopStatus.sessionsToday}/${loopStatus.maxPerDay}`
                    : 'Dung'
                  }
                </span>
              }
            />
          </Tooltip>
        )}

        <Tooltip title="Tải lại">
          <Button
            type="text" size="small" icon={<ReloadOutlined />}
            onClick={() => { loadInbox(); loadLoopStatus(); if (selectedId) loadSession(selectedId); }}
          />
        </Tooltip>

        <Dropdown menu={{ items: actionMenuItems }} trigger={['click']}>
          <Button type="primary" size="small" icon={<ThunderboltOutlined />}>
            Hanh dong <MoreOutlined />
          </Button>
        </Dropdown>
      </div>

      {/* ── Body: Sidebar + Chat ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <div style={{
          width: 320, flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          background: C.sidebarBg,
          borderRight: `1px solid ${C.sidebarBorder}`,
        }}>
          {/* Search */}
          <div style={{ padding: '10px 12px', borderBottom: `1px solid ${C.sidebarBorder}` }}>
            <Input
              placeholder="Tìm kiếm..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              allowClear
              size="small"
              style={{ background: C.inputBg }}
            />
          </div>

          {/* Session list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {inboxLoading && inbox.length === 0 ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                <Spin size="small" />
              </div>
            ) : inbox.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={<span style={{ color: C.textMuted }}>Chua co hoi thoai</span>}
                style={{ marginTop: 60 }}
              />
            ) : (
              inbox.map(renderSessionRow)
            )}
          </div>

          {/* Sidebar footer: count */}
          <div style={{
            padding: '8px 14px', fontSize: 11, color: C.textMuted,
            borderTop: `1px solid ${C.sidebarBorder}`,
          }}>
            {inbox.length} hoi thoai
            {inbox.filter(isUnread).length > 0 && (
              <Badge
                count={inbox.filter(isUnread).length}
                size="small"
                style={{ marginLeft: 8, backgroundColor: 'var(--primary-color)' }}
              />
            )}
          </div>
        </div>

        {/* ── Chat area ───────────────────────────────────────────────────── */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          background: C.chatBg, overflow: 'hidden',
        }}>
          {!selectedId ? (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 12,
            }}>
              <RobotOutlined style={{ fontSize: 48, color: C.textMuted }} />
              <Text style={{ color: C.textMuted, fontSize: 14 }}>
                Chon hoi thoai ben trai de bat dau
              </Text>
            </div>
          ) : sessionLoading ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Spin />
            </div>
          ) : session ? (
            <>
              {/* Chat header */}
              <div style={{
                padding: '10px 16px',
                borderBottom: `1px solid ${C.sidebarBorder}`,
                background: C.sidebarBg,
                display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Text strong style={{ color: C.textPrimary, fontSize: 14 }}>
                      {session.scenario?.customerPersona || 'Khách hàng'}
                    </Text>
                    <Tag color={DIFF_COLOR[session.scenario?.difficulty] || 'default'}>
                      {session.scenario?.difficulty}
                    </Tag>
                    <Tag>
                      {CAT[session.scenario?.category] || session.scenario?.category}
                    </Tag>
                    <Tag color={STATUS_COLOR[session.status] || 'default'}>
                      {STATUS_LABEL[session.status] || session.status}
                    </Tag>
                    {session.evaluation?.overallScore != null && (
                      <Tag color="gold" icon={<StarOutlined />}>
                        {session.evaluation.overallScore.toFixed(1)}/10
                      </Tag>
                    )}
                    <Tag color={session.mode === 'cms' ? 'purple' : 'blue'}>
                      {session.mode === 'cms' ? 'AI tự trả lời — Bạn đánh giá' : 'Bạn trả lời'}
                    </Tag>
                  </div>
                  <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                    {session.scenario?.description}
                  </div>
                </div>
              </div>

              {/* Evaluation summary if exists */}
              {session.evaluation?.summary && (
                <div style={{
                  padding: '8px 16px', fontSize: 12, color: C.textSecondary,
                  background: 'var(--bg-tertiary)',
                  borderBottom: `1px solid ${C.sidebarBorder}`,
                  flexShrink: 0,
                }}>
                  <strong>Tong ket:</strong> {session.evaluation.summary}
                  {session.evaluation.weaknesses?.length > 0 && (
                    <span style={{ marginLeft: 8, color: 'var(--primary-color)' }}>
                      | Diem yeu: {session.evaluation.weaknesses.join(', ')}
                    </span>
                  )}
                </div>
              )}

              {/* Chat messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
                {session.turns?.map((turn, idx) => renderTurn(turn, idx))}
                <div ref={chatEndRef} />
              </div>

              {/* Action bar */}
              <div style={{
                padding: '10px 16px',
                borderTop: `1px solid ${C.sidebarBorder}`,
                background: C.sidebarBg,
                flexShrink: 0,
              }}>
                {/* Pending edits save bar */}
                {hasPendingChanges && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    marginBottom: 8, padding: '6px 10px',
                    background: 'var(--bg-tertiary)', borderRadius: 6,
                    fontSize: 12,
                  }}>
                    <EditOutlined style={{ color: 'var(--warning-color, #f59e0b)' }} />
                    <span style={{ color: C.textSecondary }}>
                      {pendingEdits.size} chinh sua, {pendingScores.size} diem chua luu
                    </span>
                    <div style={{ flex: 1 }} />
                    <Button
                      size="small" type="primary"
                      icon={<SaveOutlined />}
                      loading={actionLoading === 'save'}
                      onClick={saveEdits}
                    >
                      Luu chinh sua
                    </Button>
                  </div>
                )}

                {/* Reply input + action buttons */}
                {canAct && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <TextArea
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      placeholder="Nhập trả lời..."
                      autoSize={{ minRows: 1, maxRows: 4 }}
                      style={{
                        flex: 1, background: C.inputBg,
                        border: `1px solid ${C.inputBorder}`, borderRadius: 8,
                      }}
                      onPressEnter={e => {
                        if (!e.shiftKey) { e.preventDefault(); sendReply(); }
                      }}
                    />
                    <Space direction="vertical" size={4}>
                      <Button
                        type="primary" icon={<SendOutlined />}
                        loading={sending}
                        disabled={!replyText.trim()}
                        onClick={sendReply}
                        size="small"
                      >Gui</Button>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <Popconfirm
                          title="Duyệt và học Q&A từ phiên này?"
                          onConfirm={approveSession}
                          okText="Duyet"
                          cancelText="Huy"
                        >
                          <Button
                            size="small" type="primary"
                            icon={<CheckOutlined />}
                            loading={actionLoading === 'approve'}
                            style={{ background: 'var(--success-color, #22c55e)', borderColor: 'var(--success-color, #22c55e)' }}
                          >Duyet Q&A</Button>
                        </Popconfirm>
                        <Popconfirm
                          title="Từ chối phiên này?"
                          onConfirm={rejectSession}
                          okText="Tu choi"
                          cancelText="Huy"
                        >
                          <Button
                            size="small" danger
                            icon={<CloseCircleOutlined />}
                            loading={actionLoading === 'reject'}
                          >Tu choi</Button>
                        </Popconfirm>
                      </div>
                    </Space>
                  </div>
                )}

                {/* Read-only status for approved/rejected */}
                {session && ['approved', 'rejected'].includes(session.status) && (
                  <div style={{
                    textAlign: 'center', padding: '8px 0',
                    fontSize: 13, color: C.textMuted,
                  }}>
                    {session.status === 'approved'
                      ? 'Phien da duoc duyet va hoc Q&A'
                      : 'Phien da bi tu choi'
                    }
                    {session.learnedIds?.length > 0 && (
                      <span style={{ marginLeft: 6 }}>
                        ({session.learnedIds.length} muc da hoc)
                      </span>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* ── Lark chat ID modal ──────────────────────────────────────────────── */}
      <Modal
        title="Nhập Lark Chat ID"
        open={larkModalOpen}
        onCancel={() => setLarkModalOpen(false)}
        onOk={runOneLark}
        confirmLoading={actionLoading === 'run-one-lark'}
        okText="Gui"
        cancelText="Huy"
      >
        <Input
          placeholder="oc_xxxxxxxxx"
          value={larkChatIdInput}
          onChange={e => setLarkChatIdInput(e.target.value)}
          style={{ marginTop: 8 }}
        />
        <div style={{ marginTop: 8, fontSize: 12, color: C.textMuted }}>
          Chat ID cua nhom Lark (bat dau voi oc_). Bot se gui cau hoi vao nhom nay.
        </div>
      </Modal>

      {/* ── Loop config modal ───────────────────────────────────────────────── */}
      <Modal
        title="Cấu hình loop tự động"
        open={loopModalOpen}
        onCancel={() => setLoopModalOpen(false)}
        onOk={startLoop}
        confirmLoading={actionLoading === 'start-loop'}
        okText="Bat dau"
        cancelText="Huy"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
          <div>
            <Text style={{ fontSize: 13 }}>Che do:</Text>
            <Segmented
              value={loopMode}
              onChange={v => setLoopMode(v as 'cms' | 'lark')}
              options={[
                { value: 'cms', label: 'CMS (mô phỏng)' },
                { value: 'lark', label: 'Lark (gửi vào nhóm)' },
              ]}
              style={{ marginLeft: 8 }}
              size="small"
            />
          </div>
          {loopMode === 'lark' && (
            <div>
              <Text style={{ fontSize: 13 }}>Lark Chat ID:</Text>
              <Input
                placeholder="oc_xxxxxxxxx"
                value={loopLarkChatId}
                onChange={e => setLoopLarkChatId(e.target.value)}
                style={{ marginTop: 4 }}
                size="small"
              />
            </div>
          )}
          <div style={{ display: 'flex', gap: 16 }}>
            <div>
              <Text style={{ fontSize: 13 }}>Khoang cach (phut):</Text>
              <InputNumber
                min={1} max={60} value={loopInterval}
                onChange={v => setLoopInterval(v || 5)}
                size="small" style={{ display: 'block', marginTop: 4, width: 100 }}
              />
            </div>
            <div>
              <Text style={{ fontSize: 13 }}>Toi da/ngay:</Text>
              <InputNumber
                min={1} max={100} value={loopMaxPerDay}
                onChange={v => setLoopMaxPerDay(v || 20)}
                size="small" style={{ display: 'block', marginTop: 4, width: 100 }}
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Page wrapper with Suspense ──────────────────────────────────────────────

export default function CSKHInboxPage() {
  return (
    <Suspense fallback={
      <div style={{
        height: 'calc(100vh - 64px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Spin size="large" />
      </div>
    }>
      <CSKHInboxInner />
    </Suspense>
  );
}
