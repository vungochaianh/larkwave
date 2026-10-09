'use client';
import { useEffect, useState } from 'react';
import { Alert, Button, Card, Spin, Tag, Typography } from 'antd';
import { MessageOutlined, RobotOutlined } from '@ant-design/icons';
import type { LarkConnection } from '@larkwave/core';
import { useRuntime } from '../../RuntimeProvider';
import { useAccountAuth } from '../../account/auth';
import { PageHeader } from '../../kit';
import { FEATURE_FRIENDS } from '../../features';
import { V } from '../../theme';
import { LarkConnectPanel } from './LarkConnectPanel';
import { LarkGrantsPanel } from './LarkGrantsPanel';
import { BasesPanel } from './BasesPanel';
import { BotPanel } from './BotPanel';
import { PluginsPanel } from './PluginsPanel';
import { PluginPanelsCard } from './PluginPanelsCard';
import { LarkWebPanel } from './LarkWebPanel';

const { Text } = Typography;

/**
 * "Lark Bot (App ID)" — phần của Lark Agents cũ CHỈ cần khi người dùng muốn năng lực của BOT (custom app):
 * kết nối App ID/App Secret, bot + webhook/đường hầm, plugin/kỹ năng của bot, Base dùng qua Open API,
 * chia sẻ. KHÔNG có ô chat riêng — trò chuyện vẫn là MỘT agent ở "Lark × Agents"; khi đã kết nối app, agent
 * đó tự có thêm các tool Open API (bitable v1, workflow v3, tin nhắn, lịch…).
 */
export function LarkBotScreen({ onOpenChat }: { onOpenChat?: () => void }) {
  const runtime = useRuntime();
  const { user } = useAccountAuth();
  const [conn, setConn] = useState<LarkConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const supported = !!runtime.larkChat;

  useEffect(() => {
    if (!supported) return void setLoading(false);
    let alive = true;
    void (async () => {
      await runtime.larkSetAccount?.(user?.id ?? null).catch(() => undefined);
      const c = await runtime.larkStatus?.().catch(() => ({ connected: false }) as LarkConnection);
      if (!alive) return;
      setConn(c ?? { connected: false });
      setLoading(false);
      if (c?.connected && runtime.larkCheckConnection) {
        const h = await runtime.larkCheckConnection().catch(() => null);
        if (alive && h) setConn(h);
      }
    })();
    return () => {
      alive = false;
    };
  }, [runtime, supported, user?.id]);

  if (!supported) return <Alert type="info" showIcon message="Lark Bot chỉ khả dụng trên bản Desktop" />;

  return (
    <div data-testid="lark-bot-screen" style={{ maxWidth: 1100, margin: '0 auto' }}>
      <PageHeader
        title="Lark Bot (App ID)"
        description={
          <>
            Chỉ cần khi bạn muốn <b>năng lực của bot</b>: bot trả lời trong nhóm/chat Lark, webhook, gửi tin & lịch qua Open API, ghi bản ghi bằng API. Trò chuyện, quét Base và tạo workflow{' '}
            <b>không cần</b> App ID — dùng ở Lark × Agents.
          </>
        }
        actions={
          onOpenChat ? (
            <Button icon={<MessageOutlined />} onClick={onOpenChat}>
              Mở Lark × Agents
            </Button>
          ) : undefined
        }
      />
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 14, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <LarkConnectPanel runtime={runtime} connection={conn} onChange={setConn} />
            <Card size="small" title={<span><RobotOutlined /> Bot dùng được gì khi đã kết nối</span>}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: V.textSub }}>
                <div>
                  <Tag color={conn?.connected ? 'green' : 'default'}>{conn?.connected ? 'đã kết nối' : 'chưa kết nối'}</Tag>
                  {conn?.tenantName ? <Text>{conn.tenantName}</Text> : null}
                </div>
                <div>• Bitable Open API (v1): đọc/ghi bản ghi, bảng, cột, view, quyền.</div>
                <div>• Workflow Open API (v3): tạo/sửa khối Workflow bằng API chính thức (cần quyền base:workflow:*).</div>
                <div>• Bot: trả lời trong nhóm/chat, webhook qua đường hầm, plugin/kỹ năng của bot.</div>
                <div>• Tin nhắn, lịch, danh bạ, Docs/Wiki qua Open API.</div>
                <div style={{ marginTop: 4 }}>Agent ở Lark × Agents tự có thêm các công cụ này khi app đã kết nối — không phải chuyển màn.</div>
              </div>
            </Card>
            {!conn?.connected && FEATURE_FRIENDS && <LarkGrantsPanel runtime={runtime} mode="receive" />}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {conn?.connected ? (
              <>
                <BotPanel runtime={runtime} />
                <PluginsPanel runtime={runtime} />
                <PluginPanelsCard runtime={runtime} />
                <BasesPanel runtime={runtime} />
                <LarkWebPanel runtime={runtime} />
                {FEATURE_FRIENDS && <LarkGrantsPanel runtime={runtime} mode="all" />}
              </>
            ) : (
              <Alert
                type="info"
                showIcon
                message="Kết nối custom app để bật bot"
                description="Nhập App ID / App Secret của custom app ở thẻ bên trái. Sau khi kết nối, phần bot, webhook, plugin và Base dùng qua Open API hiện ở đây."
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
