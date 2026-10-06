'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Button, Card, Input, Pagination, Segmented, Tag, Typography } from 'antd';
import { CompassOutlined, SearchOutlined, GlobalOutlined, MobileOutlined, ChromeOutlined, EyeOutlined, PlusOutlined, RocketOutlined } from '@ant-design/icons';
import { useRuntime } from '../RuntimeProvider';
import { V, BRAND } from '../theme';
import { IconTile, EmptyState } from '../kit';
import { accountApi, fromNow, type PublicApp } from './api';
import { AppThumb } from '../components/AppThumb';
import type { View } from '../components/HomeScreen';

const { Title, Text } = Typography;
const PAGE_SIZE = 24;
const WEB_APP = 'https://toolswave.net';

function hostOf(url?: string | null): string {
  if (!url) return '';
  try { return new URL(url).host; } catch { return ''; }
}
function trackMeta(t?: string): { icon: ReactNode; label: string } | null {
  if (t === 'mobile') return { icon: <MobileOutlined />, label: 'Mobile' };
  if (t === 'extension') return { icon: <ChromeOutlined />, label: 'Tiện ích' };
  if (t === 'web') return { icon: <GlobalOutlined />, label: 'Web' };
  return null;
}

/**
 * "Khám phá" — community public-apps showcase only. (The old "Người dùng" + "Xếp hạng" tabs
 * were removed; that content now lives on the Tổng quan hub.) Cards match the hub's app cards.
 */
export function ExploreView({ onNav, onCreate }: { onNav?: (v: View) => void; onCreate?: () => void }) {
  const [items, setItems] = useState<PublicApp[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [track, setTrack] = useState('all');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p: number, tr: string, search: string) => {
    setLoading(true);
    try {
      const res = await accountApi.publicApps({
        page: p,
        pageSize: PAGE_SIZE,
        ...(tr !== 'all' ? { track: tr } : {}),
        ...(search ? { q: search } : {}),
      });
      setItems(res.items);
      setTotal(res.total);
      setPage(p);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(1, track, query); }, [load, track, query]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <IconTile icon={<CompassOutlined />} color={BRAND} size={28} radius={9} fontSize={15} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <Title level={4} style={{ margin: 0 }}>App cộng đồng</Title>
            {!loading && total > 0 && <Text style={{ color: V.textSub, fontSize: 13, fontWeight: 600 }}>{total} app</Text>}
          </div>
          <Text type="secondary" style={{ fontSize: 13 }}>App tạo bằng AI trên Larkwave — mở chạy thử, lấy cảm hứng rồi dựng app của bạn.</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => onCreate?.()}>Tạo app mới</Button>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <Segmented
          value={track}
          onChange={(v) => setTrack(v as string)}
          options={[
            { label: 'Tất cả', value: 'all' },
            { label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><GlobalOutlined /> Web</span>, value: 'web' },
            { label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><MobileOutlined /> Mobile</span>, value: 'mobile' },
            { label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ChromeOutlined /> Tiện ích</span>, value: 'extension' },
          ]}
        />
        <Input
          allowClear
          prefix={<SearchOutlined style={{ color: V.textFaint }} />}
          placeholder="Tìm app…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onPressEnter={() => setQuery(q.trim())}
          onBlur={() => setQuery(q.trim())}
          onClear={() => setQuery('')}
          style={{ maxWidth: 280 }}
        />
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
          {Array.from({ length: 10 }).map((_, i) => <div key={i} style={{ height: 176, borderRadius: 14, background: V.surfaceMuted }} />)}
        </div>
      ) : items.length === 0 ? (
        (q || track !== 'all') ? (
          <EmptyState
            icon={<CompassOutlined />}
            title="Không tìm thấy app phù hợp"
            description="Thử từ khóa khác hoặc xóa bộ lọc để xem tất cả app cộng đồng."
            secondaryLabel="Xóa bộ lọc"
            onSecondary={() => { setQ(''); setQuery(''); setTrack('all'); }}
          />
        ) : (
          <EmptyState
            icon={<RocketOutlined />}
            title="Chưa có app công khai nào"
            description="Hãy là người đầu tiên chia sẻ một app tạo bằng AI với cộng đồng."
            actionLabel="Tạo app mới"
            onAction={() => onCreate?.()}
          />
        )
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
          {items.map((a) => <AppCard key={a.slug} app={a} />)}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
          <Pagination current={page} pageSize={PAGE_SIZE} total={total} showSizeChanger={false} onChange={(p) => void load(p, track, query)} />
        </div>
      )}
    </div>
  );
}

/** Community app card — same visual language as the hub's "Tiếp tục làm việc" cards. */
function AppCard({ app }: { app: PublicApp }) {
  const runtime = useRuntime();
  const tk = trackMeta(app.track);
  const open = () => {
    const url = app.url || `${WEB_APP}/app/${app.slug}`;
    if (runtime.openExternal) runtime.openExternal(url);
    else window.open(url, '_blank');
  };
  return (
    <Card
      hoverable
      onClick={open}
      styles={{ body: { padding: '10px 13px' } }}
      style={{ borderRadius: 14, overflow: 'hidden', cursor: 'pointer' }}
      cover={<AppThumb name={app.name} seed={app.slug} host={hostOf(app.url)} height={120} compact />}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <Text strong ellipsis style={{ fontSize: 14, flex: 1 }}>{app.name}</Text>
        {tk && <Tag bordered={false} style={{ margin: 0, fontSize: 11 }} icon={tk.icon}>{tk.label}</Tag>}
      </div>
      {app.description && (
        <div style={{ color: V.textSub, fontSize: 12.5, marginTop: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{app.description}</div>
      )}
      <Text style={{ color: V.textFaint, fontSize: 12, marginTop: 4, display: 'block' }}>
        bởi {app.author} · <EyeOutlined /> {app.visits} · {fromNow(app.updatedAt)}
      </Text>
    </Card>
  );
}
