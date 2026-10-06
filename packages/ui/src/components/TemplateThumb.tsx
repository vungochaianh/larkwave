'use client';
import {
  AppstoreOutlined,
  BarChartOutlined,
  ChromeOutlined,
  CompassOutlined,
  ContainerOutlined,
  DashboardOutlined,
  FormOutlined,
  MobileOutlined,
  PlayCircleOutlined,
  ShopOutlined,
  TableOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';

/**
 * Synthesizes an attractive template preview (no real screenshots exist): a soft accent
 * gradient banner + a faux "app window" wireframe that hints at the template type
 * (dashboard / table / form / store / mobile / extension / game / cards). Ported from the
 * website's TemplateThumb; self-contained (inline browser dots, local Track type).
 */
type Track = 'web' | 'mobile' | 'extension' | 'desktop' | 'game' | 'auto';
export type Layout =
  | 'dashboard'
  | 'table'
  | 'form'
  | 'store'
  | 'chart'
  | 'mobile'
  | 'extension'
  | 'game'
  | 'minimal'
  | 'cards';

function pickLayout(category: string, track: Track): { layout: Layout; icon: ReactNode } {
  const c = category.toLowerCase();
  const has = (...keys: string[]) => keys.some((k) => c.includes(k));

  if (track === 'extension') return { layout: 'extension', icon: <ChromeOutlined /> };
  if (track === 'mobile') return { layout: 'mobile', icon: <MobileOutlined /> };
  if (has('game', 'trò chơi', 'tro choi', 'arcade', 'puzzle')) return { layout: 'game', icon: <PlayCircleOutlined /> };
  if (has('dashboard', 'quản lý', 'quan ly', 'admin', 'crm', 'analytics')) return { layout: 'dashboard', icon: <DashboardOutlined /> };
  if (has('thống kê', 'thong ke', 'báo cáo', 'bao cao', 'chart', 'biểu đồ', 'bieu do')) return { layout: 'chart', icon: <BarChartOutlined /> };
  if (has('bảng', 'bang', 'table', 'danh sách', 'danh sach', 'data', 'kanban')) return { layout: 'table', icon: <TableOutlined /> };
  if (has('form', 'đăng ký', 'dang ky', 'khảo sát', 'khao sat', 'liên hệ', 'lien he')) return { layout: 'form', icon: <FormOutlined /> };
  if (has('shop', 'store', 'bán hàng', 'ban hang', 'thương mại', 'thuong mai', 'cửa hàng', 'cua hang', 'menu')) return { layout: 'store', icon: <ShopOutlined /> };
  if (has('landing', 'trang chủ', 'trang chu', 'portfolio', 'giới thiệu', 'gioi thieu')) return { layout: 'cards', icon: <CompassOutlined /> };
  if (has('ghi chú', 'ghi chu', 'note', 'blog', 'nội dung', 'noi dung')) return { layout: 'cards', icon: <ContainerOutlined /> };
  return { layout: 'cards', icon: <AppstoreOutlined /> };
}

/** Mix a hex accent with white to a soft, light tint. */
function tint(hex: string, amount: number): string {
  const m = hex.replace('#', '');
  const full = m.length === 3 ? m.split('').map((ch) => ch + ch).join('') : m;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function Block({ w, h = 8, accent, strong = false, radius = 4 }: { w: number | string; h?: number; accent: string; strong?: boolean; radius?: number }) {
  return (
    <span
      style={{
        display: 'block',
        width: typeof w === 'number' ? `${w}%` : w,
        height: h,
        borderRadius: radius,
        background: strong ? accent : '#E9EBF3',
        opacity: strong ? 0.85 : 1,
      }}
    />
  );
}

function Wireframe({ layout, accent }: { layout: Layout; accent: string }) {
  if (layout === 'dashboard' || layout === 'chart') {
    return (
      <div style={{ display: 'flex', gap: 8, height: '100%' }}>
        <div style={{ width: 26, display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 2 }}>
          <Block w="100%" h={6} accent={accent} strong />
          <Block w="100%" h={6} accent={accent} />
          <Block w="100%" h={6} accent={accent} />
          <Block w="100%" h={6} accent={accent} />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={{ display: 'flex', gap: 7 }}>
            <Block w="33%" h={20} accent={accent} radius={6} />
            <Block w="33%" h={20} accent={tint(accent, 0.45)} strong radius={6} />
            <Block w="33%" h={20} accent={accent} radius={6} />
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 5, padding: '0 2px' }}>
            {[55, 80, 40, 95, 65, 75, 50].map((v, i) => (
              <span key={i} style={{ flex: 1, height: `${v}%`, borderRadius: 3, background: i % 2 === 0 ? accent : tint(accent, 0.45), opacity: 0.85 }} />
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (layout === 'table') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, height: '100%' }}>
        <Block w="40%" h={9} accent={accent} strong />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ width: 12, height: 12, borderRadius: 4, background: i === 0 ? accent : '#E9EBF3', opacity: i === 0 ? 0.85 : 1, flexShrink: 0 }} />
            <Block w="50%" accent={accent} />
            <Block w="22%" accent={accent} />
          </div>
        ))}
      </div>
    );
  }
  if (layout === 'form') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, height: '100%', maxWidth: 160, margin: '0 auto', justifyContent: 'center' }}>
        <Block w="55%" h={9} accent={accent} strong />
        <Block w="100%" h={12} accent="#fff" radius={5} />
        <Block w="100%" h={12} accent="#fff" radius={5} />
        <Block w="100%" h={12} accent="#fff" radius={5} />
        <Block w="42%" h={13} accent={accent} strong radius={6} />
      </div>
    );
  }
  if (layout === 'store') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Block w="34%" h={8} accent={accent} strong />
          <Block w="18%" h={8} accent={accent} />
        </div>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 7 }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} style={{ background: '#fff', borderRadius: 6, padding: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ flex: 1, borderRadius: 4, background: i % 2 ? tint(accent, 0.5) : tint(accent, 0.7) }} />
              <Block w="80%" h={4} accent={accent} />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (layout === 'mobile') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', height: '100%' }}>
        <div style={{ width: 70, background: '#fff', borderRadius: 12, border: '2px solid #E9EBF3', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ width: 22, height: 4, borderRadius: 4, background: '#E9EBF3', margin: '0 auto 2px' }} />
          <Block w="70%" h={7} accent={accent} strong />
          <Block w="100%" h={16} accent={tint(accent, 0.55)} strong radius={6} />
          <Block w="100%" h={6} accent={accent} />
          <Block w="85%" h={6} accent={accent} />
          <Block w="60%" h={6} accent={accent} />
        </div>
      </div>
    );
  }
  if (layout === 'extension') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, height: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
          <span style={{ width: 16, height: 16, borderRadius: 5, background: tint(accent, 0.4) }} />
          <span style={{ width: 16, height: 16, borderRadius: 5, background: accent, opacity: 0.85 }} />
        </div>
        <div style={{ alignSelf: 'flex-end', width: 96, background: '#fff', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 6, boxShadow: '0 4px 12px rgba(17,24,39,0.10)' }}>
          <Block w="60%" h={7} accent={accent} strong />
          <Block w="100%" h={5} accent={accent} />
          <Block w="80%" h={5} accent={accent} />
          <Block w="40%" h={9} accent={accent} strong radius={5} />
        </div>
      </div>
    );
  }
  if (layout === 'game') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, height: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Block w="26%" h={7} accent={accent} strong />
          <Block w="18%" h={7} accent={accent} />
        </div>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gridAutoRows: '1fr', gap: 4 }}>
          {Array.from({ length: 18 }).map((_, i) => (
            <span key={i} style={{ borderRadius: 4, background: [2, 5, 8, 9, 13, 16].includes(i) ? accent : tint(accent, 0.6), opacity: 0.9 }} />
          ))}
        </div>
      </div>
    );
  }
  if (layout === 'minimal') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%', alignItems: 'center', justifyContent: 'center', maxWidth: 170, margin: '0 auto' }}>
        <Block w="62%" h={12} accent={accent} strong />
        <Block w="88%" h={6} accent={accent} />
        <Block w="72%" h={6} accent={accent} />
        <Block w="38%" h={13} accent={accent} strong radius={7} />
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
      <Block w="50%" h={10} accent={accent} strong />
      <Block w="80%" h={6} accent={accent} />
      <div style={{ flex: 1, display: 'flex', gap: 8 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ flex: 1, background: '#fff', borderRadius: 7, padding: 6, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ height: 14, borderRadius: 4, background: i === 1 ? accent : tint(accent, 0.55), opacity: 0.85 }} />
            <Block w="90%" h={4} accent={accent} />
            <Block w="65%" h={4} accent={accent} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TemplateThumb({
  accent,
  category,
  track,
  height = 150,
  layout: layoutOverride,
  windowMaxWidth = 250,
}: {
  accent?: string;
  category?: string;
  track?: Track;
  height?: number;
  layout?: Layout;
  windowMaxWidth?: number | string;
}) {
  const safeAccent = accent || '#6C5CE7';
  const picked = pickLayout(category || '', track || 'web');
  const layout = layoutOverride ?? picked.layout;
  const icon = picked.icon;
  const dot = (bg: string) => <i style={{ width: 8, height: 8, borderRadius: '50%', background: bg, display: 'inline-block' }} />;

  return (
    <div
      style={{
        height,
        position: 'relative',
        overflow: 'hidden',
        background: `linear-gradient(135deg, ${tint(safeAccent, 0.78)} 0%, ${tint(safeAccent, 0.9)} 100%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 18,
      }}
    >
      <span style={{ position: 'absolute', top: -40, right: -30, width: 130, height: 130, borderRadius: '50%', background: safeAccent, opacity: 0.16, filter: 'blur(6px)' }} />
      <span style={{ position: 'absolute', bottom: -14, left: -6, fontSize: 88, color: safeAccent, opacity: 0.1, lineHeight: 1 }}>{icon}</span>
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: windowMaxWidth,
          background: 'rgba(255,255,255,0.72)',
          backdropFilter: 'blur(2px)',
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.9)',
          boxShadow: '0 10px 26px rgba(17,24,39,0.12)',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'rgba(255,255,255,0.85)', borderBottom: '1px solid rgba(17,24,39,0.06)' }}>
          <span style={{ display: 'inline-flex', gap: 4 }}>
            {dot('#FF5F57')}
            {dot('#FEBC2E')}
            {dot('#28C840')}
          </span>
          <span style={{ flex: 1, height: 8, borderRadius: 6, background: 'rgba(17,24,39,0.06)' }} />
          <span style={{ color: safeAccent, fontSize: 11, display: 'inline-flex' }}>{icon}</span>
        </div>
        <div style={{ padding: 12, height: height - 56 }}>
          <Wireframe layout={layout} accent={safeAccent} />
        </div>
      </div>
    </div>
  );
}
