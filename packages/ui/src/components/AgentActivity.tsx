'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { App as AntApp, Button, Popover, Tag } from 'antd';
import { LoadingOutlined, ThunderboltOutlined, RobotOutlined, MobileOutlined, StopOutlined } from '@ant-design/icons';
import { useRuntime } from '../RuntimeProvider';
import { useAgentBusy } from '../useAgentBusy';
import { V, BRAND } from '../theme';

const KIND: Record<string, { icon: ReactNode; label: string }> = {
  lark: { icon: <RobotOutlined />, label: 'Lark × Agents' },
  relay: { icon: <MobileOutlined />, label: 'Điều khiển từ xa' },
};

/**
 * Header indicator for AI activity — shows the RUNNING agent session (Lark / remote) from the
 * shared turn-lock, a live timer, and a one-click "Dừng". Hidden when nothing is running.
 */
export function AgentActivity() {
  const runtime = useRuntime();
  const { message } = AntApp.useApp();
  const owner = useAgentBusy();
  const [now, setNow] = useState(() => Date.now());
  const [stopping, setStopping] = useState(false);

  const active = !!owner;

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  if (!owner) return null;

  const k = KIND[owner.kind] || { icon: <ThunderboltOutlined />, label: owner.kind };
  const elapsed = Math.max(0, Math.floor((now - owner.startedAt) / 1000));
  const mmss = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
  const pillText = `${k.label}${elapsed ? ` · ${mmss}` : ''}`;

  const stop = async () => {
    setStopping(true);
    try { await runtime.agentUnlock?.(); message.success('Đã dừng phiên AI.'); }
    catch (e) { message.error((e as Error).message); }
    finally { setStopping(false); }
  };

  const content = (
    <div style={{ width: 260 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ display: 'inline-flex', width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', color: BRAND, background: `${BRAND}1f` }}>{k.icon}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{k.label}</div>
          <div style={{ fontSize: 12, color: V.textFaint }}>Đang chạy · {mmss}</div>
        </div>
      </div>
      {owner.label && <div style={{ fontSize: 12.5, color: V.textSub, marginBottom: 4 }}>Phiên: <b style={{ color: V.text }}>{owner.label}</b></div>}
      {owner.sessionId && <div style={{ fontSize: 11.5, color: V.textFaint, wordBreak: 'break-all' }}>hội thoại: {owner.sessionId}</div>}
      <Button danger size="small" block icon={<StopOutlined />} loading={stopping} onClick={() => void stop()} style={{ margin: '10px 0' }}>
        Dừng phiên đang chạy
      </Button>
    </div>
  );

  return (
    <Popover trigger="click" placement="bottomRight" title="AI đang chạy" content={content}>
      <Tag color="processing" icon={<LoadingOutlined />} style={{ cursor: 'pointer', margin: 0, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, fontWeight: 600 }}>
        {pillText}
      </Tag>
    </Popover>
  );
}
