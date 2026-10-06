'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { App as AntApp, Button, Popover, Tag, Badge } from 'antd';
import { LoadingOutlined, ThunderboltOutlined, RobotOutlined, MobileOutlined, StopOutlined, ClockCircleOutlined, ToolOutlined } from '@ant-design/icons';
import { useRuntime } from '../RuntimeProvider';
import { useAgentBusy } from '../useAgentBusy';
import { useFixQueue } from '../fixQueue';
import { V, BRAND } from '../theme';

const KIND: Record<string, { icon: ReactNode; label: string }> = {
  build: { icon: <ThunderboltOutlined />, label: 'Dựng / sửa app' },
  lark: { icon: <RobotOutlined />, label: 'Lark × Agents' },
  relay: { icon: <MobileOutlined />, label: 'Điều khiển từ xa' },
};

/**
 * Header indicator for AI activity — shows the RUNNING agent/session (build / Lark / remote) from
 * the shared turn-lock PLUS the quick-fix queue (apps WAITING their turn), a live timer, and a
 * one-click "Dừng". The app runs one AI turn at a time, so extra work queues; this makes both the
 * active session and the waiting list visible. Hidden when nothing is running or queued.
 */
export function AgentActivity() {
  const runtime = useRuntime();
  const { message } = AntApp.useApp();
  const owner = useAgentBusy();
  const fixes = useFixQueue();
  const [now, setNow] = useState(() => Date.now());
  const [stopping, setStopping] = useState(false);

  const runningFix = fixes.filter((f) => f.phase === 'running');
  const queuedFix = fixes.filter((f) => f.phase === 'queued');
  const active = !!owner || runningFix.length > 0;
  const showBadge = queuedFix.length;

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  if (!active && !queuedFix.length) return null;

  const k = owner ? (KIND[owner.kind] || { icon: <ThunderboltOutlined />, label: owner.kind }) : { icon: <ToolOutlined />, label: 'Sửa app' };
  const elapsed = owner ? Math.max(0, Math.floor((now - owner.startedAt) / 1000)) : 0;
  const mmss = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
  const pillText = owner ? `${k.label}${elapsed ? ` · ${mmss}` : ''}` : queuedFix.length ? 'Đang chờ AI…' : 'Đang chạy';

  const stop = async () => {
    setStopping(true);
    try { await runtime.agentUnlock?.(); message.success('Đã dừng phiên AI.'); }
    catch (e) { message.error((e as Error).message); }
    finally { setStopping(false); }
  };

  const content = (
    <div style={{ width: 260 }}>
      {owner && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ display: 'inline-flex', width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', color: BRAND, background: `${BRAND}1f` }}>{k.icon}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{k.label}</div>
              <div style={{ fontSize: 12, color: V.textFaint }}>Đang chạy · {mmss}</div>
            </div>
          </div>
          {owner.label && <div style={{ fontSize: 12.5, color: V.textSub, marginBottom: 4 }}>Phiên: <b style={{ color: V.text }}>{owner.label}</b></div>}
          {owner.appId && <div style={{ fontSize: 11.5, color: V.textFaint, wordBreak: 'break-all' }}>app: {owner.appId}</div>}
          {owner.sessionId && <div style={{ fontSize: 11.5, color: V.textFaint, wordBreak: 'break-all' }}>hội thoại: {owner.sessionId}</div>}
          <Button danger size="small" block icon={<StopOutlined />} loading={stopping} onClick={() => void stop()} style={{ margin: '10px 0' }}>
            Dừng phiên đang chạy
          </Button>
        </>
      )}
      {(runningFix.length > 0 || queuedFix.length > 0) && (
        <div style={{ borderTop: owner ? `1px solid ${V.borderSub}` : 'none', paddingTop: owner ? 8 : 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: V.textFaint, marginBottom: 6 }}>Hàng đợi sửa app</div>
          {runningFix.map((f) => (
            <div key={f.appId} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '3px 0' }}>
              <LoadingOutlined style={{ color: '#F59E0B' }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              <span style={{ color: V.textFaint, fontSize: 11 }}>{f.note || 'đang sửa'}</span>
            </div>
          ))}
          {queuedFix.map((f, i) => (
            <div key={f.appId} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '3px 0', color: V.textSub }}>
              <ClockCircleOutlined style={{ color: V.textFaint }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              <span style={{ color: V.textFaint, fontSize: 11 }}>chờ #{i + 1}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 11, color: V.textFaint, marginTop: 8, lineHeight: 1.5 }}>AI chạy một phiên tại một thời điểm — việc khác xếp hàng chờ.</div>
    </div>
  );

  return (
    <Popover trigger="click" placement="bottomRight" title="AI đang chạy" content={content}>
      <Badge count={showBadge} size="small" offset={[-2, 2]}>
        <Tag color="processing" icon={<LoadingOutlined />} style={{ cursor: 'pointer', margin: 0, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, fontWeight: 600 }}>
          {pillText}
        </Tag>
      </Badge>
    </Popover>
  );
}
