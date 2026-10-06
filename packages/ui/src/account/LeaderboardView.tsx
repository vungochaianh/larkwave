'use client';
import { useCallback, useEffect, useState } from 'react';
import { App, Button, Card, Empty, Grid, Skeleton, Space, Tag, Typography } from 'antd';
import { CrownFilled, ReloadOutlined, TrophyOutlined } from '@ant-design/icons';
import { CARD_SHADOW, V } from '../theme';
import { accountApi, type LeaderboardEntry, type LeaderboardResponse } from './api';
import { UserAvatar } from './UserAvatar';

const { Title, Text } = Typography;
const MEDAL = ['🥇', '🥈', '🥉'];

/** Native desktop port of the website's /leaderboard page (Top 100 by XP). */
export function LeaderboardView() {
  const { message } = App.useApp();
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await accountApi.leaderboard(100));
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  const entries = data?.entries ?? [];
  const meInTop = data?.me ? entries.some((e) => e.isMe) : false;

  const screens = Grid.useBreakpoint();
  const twoCol = !!screens.lg && entries.length > 8;
  const mid = Math.ceil(entries.length / 2);
  const leftEntries = twoCol ? entries.slice(0, mid) : entries;
  const rightEntries = twoCol ? entries.slice(mid) : [];

  return (
    <Space direction="vertical" size={18} style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            <TrophyOutlined style={{ color: '#F59E0B', marginInlineEnd: 8 }} />
            Bảng xếp hạng · Top 100
          </Title>
          <Text type="secondary">Kiếm XP bằng cách tạo app, build thành công, deploy và thu hút lượt xem.</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>Tải lại</Button>
      </div>

      {data?.me && !meInTop && (
        <Card style={{ boxShadow: CARD_SHADOW }} styles={{ body: { padding: 12 } }}>
          <Row entry={data.me} highlight />
        </Card>
      )}

      <Card style={{ boxShadow: CARD_SHADOW }} styles={{ body: { padding: 8 } }}>
        {loading ? (
          <Skeleton active paragraph={{ rows: 6 }} style={{ padding: 16 }} />
        ) : entries.length === 0 ? (
          <Empty description="Chưa có ai trên bảng xếp hạng. Hãy là người đầu tiên!" style={{ padding: '40px 0' }} />
        ) : twoCol ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 6 }}>
            <div>{leftEntries.map((e) => <Row key={e.user.id} entry={e} highlight={e.isMe} />)}</div>
            <div>{rightEntries.map((e) => <Row key={e.user.id} entry={e} highlight={e.isMe} />)}</div>
          </div>
        ) : (
          <div>{entries.map((e) => <Row key={e.user.id} entry={e} highlight={e.isMe} />)}</div>
        )}
      </Card>
    </Space>
  );
}

function Row({ entry, highlight }: { entry: LeaderboardEntry; highlight?: boolean }) {
  const medal = entry.rank <= 3 ? MEDAL[entry.rank - 1] : null;
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '10px 12px', borderRadius: 12,
        background: highlight ? 'rgba(108,92,231,0.08)' : undefined,
        border: highlight ? '1px solid rgba(108,92,231,0.25)' : '1px solid transparent',
      }}
    >
      <div style={{ width: 34, textAlign: 'center', fontSize: medal ? 22 : 15, fontWeight: 700, color: V.textSub, flexShrink: 0 }}>
        {medal ?? entry.rank}
      </div>
      <UserAvatar name={entry.user.name} avatarUrl={entry.user.avatarUrl} size={40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text strong ellipsis style={{ flex: 1, minWidth: 0 }}>{entry.user.name || entry.user.email}</Text>
          {highlight && <Tag color="purple" bordered={false}>Bạn</Tag>}
        </div>
        <Text type="secondary" style={{ fontSize: 12.5 }}>
          <CrownFilled style={{ color: '#F59E0B', marginInlineEnd: 5 }} />
          Cấp {entry.level}
        </Text>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 16, color: V.text }}>{entry.xp.toLocaleString('vi-VN')}</div>
        <Text type="secondary" style={{ fontSize: 11 }}>XP</Text>
      </div>
    </div>
  );
}
