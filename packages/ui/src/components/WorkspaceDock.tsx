'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Collapse,
  Empty,
  Input,
  Segmented,
  Spin,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import {
  MinusOutlined,
  SendOutlined,
  StopOutlined,
  ShrinkOutlined,
  ArrowsAltOutlined,
  SyncOutlined,
  HistoryOutlined,
  FlagOutlined,
} from '@ant-design/icons';
import type {
  AppCheckpoint,
  AppMode,
  AppSessionArchive,
  BuildEvent,
  ConvMessage,
} from '@larkwave/core';
import { BRAND, V } from '../theme';
import { BuildProgress } from './BuildProgress';
import { ChatMarkdown } from './ChatMarkdown';
import { RunnerModelPicker } from './RunnerModelPicker';
import { WorkspaceModeSelect } from './WorkspaceModeSelect';

const { Text } = Typography;

type Turn = { user: ConvMessage; assistant?: ConvMessage };

function groupTurns(conv: ConvMessage[]): Turn[] {
  const turns: Turn[] = [];
  for (let i = 0; i < conv.length; i++) {
    if (conv[i].role === 'user') {
      const assistant = conv[i + 1]?.role === 'assistant' ? conv[i + 1] : undefined;
      turns.push({ user: conv[i], assistant });
      if (assistant) i += 1;
    } else if (conv[i].role === 'assistant') {
      turns.push({ user: { role: 'user', content: '(không có yêu cầu)', at: conv[i].at }, assistant: conv[i] });
    }
  }
  return turns;
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

const STATUS_COLOR: Record<AppCheckpoint['status'], string> = {
  success: 'green',
  failed: 'red',
  interrupted: 'orange',
};

/**
 * Redesigned workspace side dock: agent/model picker, mode, tabbed history
 * (current turns · archived sessions · checkpoints), and compose area.
 */
export function WorkspaceDock({
  conv,
  loading,
  running,
  blockedByOther,
  blockedLabel,
  onUnlock,
  buildFailed,
  events,
  mode,
  onModeChange,
  prompt,
  onPromptChange,
  onSend,
  onCancel,
  chatMode,
  onChatModeChange,
  helpMsgs,
  helpPrompt,
  onHelpPromptChange,
  onHelpSend,
  helpRunning,
  runnerLabel,
  onRunnerChange,
  loadSessions,
  loadCheckpoints,
  chatOpen,
  onChatOpenChange,
  chatW,
  onChatWChange,
  onStartDrag,
  dragging,
}: {
  conv: ConvMessage[];
  loading: boolean;
  running: boolean;
  /** Another tab/turn holds the shared AI lock — block this dock's Send too. */
  blockedByOther?: boolean;
  blockedLabel?: string;
  onUnlock?: () => void;
  buildFailed: boolean;
  events: BuildEvent[];
  mode: AppMode;
  onModeChange: (m: AppMode) => void;
  prompt: string;
  onPromptChange: (v: string) => void;
  onSend: () => void;
  /** Abort the in-flight build/turn (SIGTERMs the CLI via runtime.cancelBuild). */
  onCancel?: () => void;
  chatMode: 'build' | 'help';
  onChatModeChange: (m: 'build' | 'help') => void;
  helpMsgs: ConvMessage[];
  helpPrompt: string;
  onHelpPromptChange: (v: string) => void;
  onHelpSend: () => void;
  helpRunning: boolean;
  runnerLabel: string;
  onRunnerChange?: () => void;
  loadSessions?: () => Promise<AppSessionArchive[]>;
  loadCheckpoints?: () => Promise<AppCheckpoint[]>;
  chatOpen: boolean;
  onChatOpenChange: (v: boolean) => void;
  chatW: number;
  onChatWChange: (w: number | ((prev: number) => number)) => void;
  onStartDrag: (e: React.PointerEvent) => void;
  dragging: boolean;
}) {
  const [histTab, setHistTab] = useState<'turns' | 'sessions' | 'checkpoints'>('turns');
  const [sessions, setSessions] = useState<AppSessionArchive[]>([]);
  const [checkpoints, setCheckpoints] = useState<AppCheckpoint[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [viewSession, setViewSession] = useState<AppSessionArchive | null>(null);

  const turns = useMemo(() => groupTurns(conv), [conv]);
  const collapseKeys = turns.length ? [String(turns.length - 1)] : [];

  useEffect(() => {
    if (histTab === 'sessions' && loadSessions) {
      setHistLoading(true);
      loadSessions()
        .then(setSessions)
        .catch(() => setSessions([]))
        .finally(() => setHistLoading(false));
    }
  }, [histTab, loadSessions, conv.length, running]);

  useEffect(() => {
    if (histTab === 'checkpoints' && loadCheckpoints) {
      setHistLoading(true);
      loadCheckpoints()
        .then(setCheckpoints)
        .catch(() => setCheckpoints([]))
        .finally(() => setHistLoading(false));
    }
  }, [histTab, loadCheckpoints, conv.length, running]);

  if (!chatOpen) {
    return (
      <button
        type="button"
        title="Mở trò chuyện"
        onClick={() => onChatOpenChange(true)}
        style={{
          flexShrink: 0,
          width: 46,
          border: 'none',
          borderLeft: `1px solid ${V.border}`,
          background: 'rgba(108,92,231,0.06)',
          color: BRAND,
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
        }}
      >
        <HistoryOutlined style={{ fontSize: 18 }} />
        <span style={{ writingMode: 'vertical-rl', fontSize: 12, fontWeight: 600 }}>Agent</span>
        {running && <SyncOutlined spin />}
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', flexShrink: 0, position: 'relative' }}>
      <div
        onPointerDown={onStartDrag}
        title="Kéo để đổi rộng"
        style={{ width: 6, flexShrink: 0, cursor: 'col-resize', background: dragging ? BRAND : V.borderSub }}
      />
      {dragging && <div style={{ position: 'absolute', inset: 0, zIndex: 5, cursor: 'col-resize' }} />}
      <div style={{ width: chatW, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0, borderLeft: `1px solid ${V.border}`, background: V.surfaceAlt }}>
        {/* Header */}
        <div style={{ padding: '8px 10px', borderBottom: `1px solid ${V.border}`, background: V.surface }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Segmented
              size="small"
              value={chatMode}
              onChange={(v) => onChatModeChange(v as 'build' | 'help')}
              options={[
                { label: 'Chỉnh sửa', value: 'build' },
                { label: 'Hỏi', value: 'help' },
              ]}
            />
            {running && <SyncOutlined spin style={{ color: BRAND }} />}
            <div style={{ flex: 1 }} />
            <Button
              size="small"
              type="text"
              title={chatW >= 520 ? 'Thu hẹp' : 'Mở rộng'}
              icon={chatW >= 520 ? <ShrinkOutlined /> : <ArrowsAltOutlined />}
              onClick={() => onChatWChange((w) => (w >= 520 ? 400 : 560))}
            />
            <Button size="small" type="text" icon={<MinusOutlined />} title="Thu gọn" onClick={() => onChatOpenChange(false)} />
          </div>
          {chatMode === 'build' && (
            <RunnerModelPicker compact onChange={() => onRunnerChange?.()} />
          )}
        </div>

        {chatMode === 'build' ? (
          <>
            {/* History tabs */}
            <div style={{ padding: '6px 10px 0', borderBottom: `1px solid ${V.borderSub}` }}>
              <Segmented
                size="small"
                block
                value={histTab}
                onChange={(v) => {
                  setHistTab(v as typeof histTab);
                  setViewSession(null);
                }}
                options={[
                  { label: `Lượt (${turns.length})`, value: 'turns' },
                  { label: 'Phiên cũ', value: 'sessions' },
                  { label: 'Checkpoint', value: 'checkpoints' },
                ]}
              />
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 10px' }}>
              {loading ? (
                <div style={{ textAlign: 'center', marginTop: 40 }}><Spin /></div>
              ) : histTab === 'turns' ? (
                turns.length === 0 ? (
                  <Text type="secondary" style={{ fontSize: 13 }}>Chưa có lượt chỉnh sửa. Gửi yêu cầu bên dưới.</Text>
                ) : (
                  <Collapse
                    size="small"
                    accordion={false}
                    defaultActiveKey={collapseKeys}
                    items={turns.map((t, i) => ({
                      key: String(i),
                      label: (
                        <span style={{ fontSize: 12 }}>
                          <Text strong>Lượt {i + 1}</Text>
                          <Text type="secondary" style={{ marginLeft: 8, fontSize: 11 }}>{fmtTime(t.user.at)}</Text>
                        </span>
                      ),
                      children: (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ padding: '6px 10px', borderRadius: 8, background: BRAND, color: '#fff', fontSize: 12, whiteSpace: 'pre-wrap' }}>
                            {t.user.content}
                          </div>
                          {t.assistant && (
                            <div style={{ padding: '6px 10px', borderRadius: 8, background: V.surface, border: `1px solid ${V.border}`, fontSize: 12 }}>
                              <ChatMarkdown content={t.assistant.content} />
                            </div>
                          )}
                        </div>
                      ),
                    }))}
                  />
                )
              ) : histTab === 'sessions' ? (
                histLoading ? (
                  <Spin />
                ) : viewSession ? (
                  <div>
                    <Button size="small" type="link" onClick={() => setViewSession(null)} style={{ padding: 0, marginBottom: 8 }}>
                      ← Quay lại
                    </Button>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
                      {fmtTime(viewSession.at)} · {viewSession.turnCount} lượt
                    </Text>
                    {groupTurns(viewSession.messages).map((t, i) => (
                      <div key={i} style={{ marginBottom: 10 }}>
                        <Tag>{`Lượt ${i + 1}`}</Tag>
                        <div style={{ fontSize: 12, marginTop: 4, whiteSpace: 'pre-wrap' }}>{t.user.content}</div>
                        {t.assistant && <div style={{ fontSize: 12, marginTop: 4, color: V.text }}>{t.assistant.content.slice(0, 500)}…</div>}
                      </div>
                    ))}
                  </div>
                ) : sessions.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có phiên đã lưu. Dùng ⋯ → Tóm tắt & phiên mới." />
                ) : (
                  sessions.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => setViewSession(s)}
                      style={{
                        padding: '8px 10px',
                        marginBottom: 6,
                        borderRadius: 8,
                        border: `1px solid ${V.border}`,
                        background: V.surface,
                        cursor: 'pointer',
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: 600 }}>{s.preview || '(không có tiêu đề)'}</Text>
                      <div>
                        <Text type="secondary" style={{ fontSize: 11 }}>{fmtTime(s.at)} · {s.turnCount} lượt</Text>
                      </div>
                    </div>
                  ))
                )
              ) : histLoading ? (
                <Spin />
              ) : checkpoints.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có checkpoint — sẽ tạo sau mỗi lần gửi." />
              ) : (
                <Timeline
                  items={checkpoints.map((cp) => ({
                    color: STATUS_COLOR[cp.status],
                    dot: <FlagOutlined style={{ fontSize: 12 }} />,
                    children: (
                      <div style={{ fontSize: 12 }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                          <Tag color={STATUS_COLOR[cp.status]}>{cp.status === 'success' ? 'OK' : cp.status === 'failed' ? 'Lỗi' : 'Gián đoạn'}</Tag>
                          <Tag>{cp.runnerLabel ?? cp.runner}</Tag>
                          {cp.model && <Tag>{cp.model}</Tag>}
                          <Text type="secondary" style={{ fontSize: 11 }}>{fmtTime(cp.at)}</Text>
                        </div>
                        <Text style={{ display: 'block' }}>{cp.prompt}</Text>
                        {cp.summary && (
                          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
                            {cp.summary.slice(0, 180)}{cp.summary.length > 180 ? '…' : ''}
                          </Text>
                        )}
                      </div>
                    ),
                  }))}
                />
              )}
              {(running || buildFailed) && events.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <BuildProgress events={events} />
                </div>
              )}
            </div>

            {/* Compose */}
            <div style={{ borderTop: `1px solid ${V.border}`, padding: 10, background: V.surface }}>
              {blockedByOther && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 12.5, color: V.textSub }}>
                  <span style={{ flex: 1 }}>
                    ⏳ Đang chờ AI trả lời ở <b>{blockedLabel || 'tab khác'}</b> — soạn trước được, gửi lại khi xong.
                  </span>
                  {onUnlock && (
                    <Button size="small" type="link" onClick={onUnlock}>
                      Mở khoá nếu treo
                    </Button>
                  )}
                </div>
              )}
              <div style={{ marginBottom: 8 }}>
                <WorkspaceModeSelect value={mode} onChange={onModeChange} />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <Input.TextArea
                  value={prompt}
                  onChange={(e) => onPromptChange(e.target.value)}
                  placeholder="Yêu cầu chỉnh sửa app…"
                  autoSize={{ minRows: 2, maxRows: 5 }}
                  disabled={running}
                  onPressEnter={(e) => {
                    if (!e.shiftKey) {
                      e.preventDefault();
                      onSend();
                    }
                  }}
                />
                {running ? (
                  // Stop the in-flight generation so the user can revise the prompt + resend
                  // (instead of waiting for it to finish). SIGTERMs the CLI via cancelBuild.
                  <Button danger icon={<StopOutlined />} onClick={() => onCancel?.()}>
                    Dừng
                  </Button>
                ) : (
                  <Button type="primary" icon={<SendOutlined />} disabled={blockedByOther} onClick={onSend}>
                    {blockedByOther ? 'Đang chờ tab khác…' : 'Gửi'}
                  </Button>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 10px' }}>
              {helpMsgs.length === 0 ? (
                <Text type="secondary" style={{ fontSize: 13 }}>
                  Hỏi về app — cách sửa, deploy, lỗi… Chỉ trả lời, không sửa file.
                </Text>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {helpMsgs.map((m, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                      <div
                        style={{
                          maxWidth: '92%',
                          padding: '8px 12px',
                          borderRadius: 12,
                          fontSize: 13,
                          lineHeight: 1.5,
                          background: m.role === 'user' ? BRAND : V.surface,
                          color: m.role === 'user' ? '#fff' : V.text,
                          border: m.role === 'user' ? 'none' : `1px solid ${V.border}`,
                          whiteSpace: m.role === 'user' ? 'pre-wrap' : 'normal',
                        }}
                      >
                        {m.role === 'assistant' ? <ChatMarkdown content={m.content} /> : m.content}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ borderTop: `1px solid ${V.border}`, padding: 10, background: V.surface, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <Input.TextArea
                value={helpPrompt}
                onChange={(e) => onHelpPromptChange(e.target.value)}
                placeholder="Hỏi về app…"
                autoSize={{ minRows: 1, maxRows: 4 }}
                disabled={helpRunning}
                onPressEnter={(e) => {
                  if (!e.shiftKey) {
                    e.preventDefault();
                    onHelpSend();
                  }
                }}
              />
              <Button type="primary" icon={<SendOutlined />} loading={helpRunning} onClick={onHelpSend}>
                Hỏi
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}