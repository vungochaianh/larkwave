'use client';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { Button, Typography } from 'antd';
import { ArrowRightOutlined, CheckCircleFilled, SyncOutlined, ExclamationCircleFilled, EditOutlined, InfoCircleOutlined, DownOutlined, RightOutlined } from '@ant-design/icons';
import { V, BRAND, OK, WARN, ERR, CARD_SHADOW } from './theme';
import { useRuntime } from './RuntimeProvider';
import { useI18n } from './i18n';

const { Title, Text } = Typography;

/**
 * Shared design-language kit — the hub primitives (previously private to HomeOverview) extracted so
 * every screen speaks ONE visual language: tinted IconTiles, section headers with an action link,
 * uniform stat cards, accent-tinted status pills, and a branded empty state. Accent hexes come from
 * theme.ts (single source of truth) — no local re-declarations, no drift.
 */

/** Big tabular number (stat values). */
export const NUM: CSSProperties = { fontVariantNumeric: 'tabular-nums', letterSpacing: -0.5, fontWeight: 800, color: V.text, lineHeight: 1.1 };
/** Small uppercase label under a stat. */
export const MICRO: CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: V.textSub };

/** A tinted rounded chip holding an accent-colored icon. */
export function IconTile({ icon, color, size = 26, radius = 9, fontSize = 14 }: { icon: ReactNode; color: string; size?: number; radius?: number; fontSize?: number }) {
  return (
    <span style={{ display: 'inline-flex', width: size, height: size, minWidth: size, borderRadius: radius, alignItems: 'center', justifyContent: 'center', color, background: `${color}1f`, fontSize }}>
      {icon}
    </span>
  );
}

/** A section band header: IconTile + title + optional right-aligned action link. */
export function SectionHeader({ icon, color = BRAND, title, actionLabel, onAction }: { icon: ReactNode; color?: string; title: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <IconTile icon={icon} color={color} />
      <Title level={4} style={{ margin: 0, flex: 1 }}>{title}</Title>
      {actionLabel && onAction && (
        <Button type="link" size="small" style={{ padding: 0 }} onClick={onAction}>
          {actionLabel} <ArrowRightOutlined style={{ fontSize: 11 }} />
        </Button>
      )}
    </div>
  );
}

/** A uniform stat tile: tinted icon + big number + uppercase label; hoverable + deep-linkable. */
export function StatCard({ icon, color = BRAND, value, label, onClick, loading }: { icon: ReactNode; color?: string; value: ReactNode; label: string; onClick?: () => void; loading?: boolean }) {
  return (
    <div
      className={onClick ? 'tw-stat-card' : undefined}
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 12, background: V.surface, border: `1px solid ${V.border}`, borderRadius: 14, padding: '14px 16px', boxShadow: CARD_SHADOW, cursor: onClick ? 'pointer' : 'default' }}
    >
      <IconTile icon={icon} color={color} size={40} radius={11} fontSize={19} />
      <div style={{ minWidth: 0 }}>
        <div style={{ ...NUM, fontSize: 22 }}>{loading ? '—' : value}</div>
        <div style={{ ...MICRO, marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

/** An accent-tinted on/off (or connected/disconnected) status pill. */
export function StatusPill({ on, onWord, offWord, icon }: { on: boolean; onWord: string; offWord: string; icon?: ReactNode }) {
  const color = on ? OK : ERR;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color, fontWeight: 600 }}>
      {icon && <span style={{ fontSize: 12 }}>{icon}</span>}
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      {on ? onWord : offWord}
    </span>
  );
}

/** A branded empty/zero state: IconTile + title + text + optional primary/secondary actions. */
export function EmptyState({ icon, title, description, actionLabel, onAction, secondaryLabel, onSecondary }: { icon: ReactNode; title: string; description?: string; actionLabel?: string; onAction?: () => void; secondaryLabel?: string; onSecondary?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', background: V.surfaceMuted, border: `1px dashed ${V.border}`, borderRadius: 16, padding: 24 }}>
      <IconTile icon={icon} color={BRAND} size={44} radius={12} fontSize={20} />
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontWeight: 600, color: V.text }}>{title}</div>
        {description && <Text type="secondary" style={{ fontSize: 13 }}>{description}</Text>}
      </div>
      {secondaryLabel && onSecondary && <Button onClick={onSecondary}>{secondaryLabel}</Button>}
      {actionLabel && onAction && <Button type="primary" onClick={onAction}>{actionLabel}</Button>}
    </div>
  );
}

export type Status = { color: string; icon: ReactNode; word: string };
/** Map an app/build status string → color + icon + Vietnamese word. */
export function statusMeta(s?: string): Status {
  const k = (s || '').toLowerCase();
  if (k === 'live') return { color: OK, icon: <CheckCircleFilled />, word: 'Đang chạy' };
  if (k === 'ready') return { color: OK, icon: <CheckCircleFilled />, word: 'Sẵn sàng' };
  if (k === 'building' || k === 'deploying') return { color: WARN, icon: <SyncOutlined spin />, word: 'Đang dựng' };
  if (k === 'error' || k === 'failed') return { color: ERR, icon: <ExclamationCircleFilled />, word: 'Lỗi' };
  return { color: V.textFaint, icon: <EditOutlined />, word: 'Nháp' };
}

/**
 * Khung trang DÙNG CHUNG cho mọi màn không phải chat (quy tắc A, 07/10/2026).
 *
 * Trước đây mỗi màn tự chọn bề rộng: Tổng quan trải hết, Tự động hoá là hộp 900px ở giữa, Dung
 * lượng/Cài đặt bám trái hoặc là một cột hẹp — đặt cạnh nhau ở 1920/2560 thì không màn nào thẳng
 * hàng với màn nào. Một khung: căn giữa, tối đa 1440px, lề ngang 24px (32px từ 1600px). Màn chat
 * (Lark × Agents, Trợ lý AI) dùng `full` — trải hết bề rộng và tự bố cục bên trong.
 */
export const PAGE_MAX = 1440;
const PAGE_CSS = `
.lw-page{ width:100%; max-width:${PAGE_MAX}px; margin:0 auto; padding:24px 24px 64px; box-sizing:border-box; }
.lw-page--full{ max-width:none; }
/* 8 ô thống kê: luôn chia hết (2 → 4 → 8 cột theo bề rộng khung), không bao giờ để một ô mồ côi. */
.lw-grid-8wrap{ container-type:inline-size; }
.lw-grid-8{ display:grid; gap:14px; grid-template-columns:repeat(2, minmax(0,1fr)); }
@container (min-width:620px){ .lw-grid-8{ grid-template-columns:repeat(4, minmax(0,1fr)); } }
@container (min-width:1240px){ .lw-grid-8{ grid-template-columns:repeat(8, minmax(0,1fr)); } }
@media (min-width:1600px){ .lw-page{ padding-left:32px; padding-right:32px; } }
.lw-grid-cards{ display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px; }
.lw-grid-sections{ display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 420px), 1fr)); gap:16px; align-items:start; }
`;
export function PageContainer({ children, full }: { children: ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'lw-page lw-page--full' : 'lw-page'}>
      <style>{PAGE_CSS}</style>
      {children}
    </div>
  );
}

/**
 * Đầu trang DÙNG MỘT LẦN mỗi trang (quy tắc B): mô tả một dòng (mờ) bên trái, nút thao tác bên phải.
 *
 * Trên desktop thanh trên cùng ĐÃ là tiêu đề trang, nên `title` chỉ hiện ở bản web (nơi khung
 * trang của web không in tiêu đề màn) — lặp tiêu đề thêm một lần nữa trong một thẻ to chính là thứ
 * đã làm màn Đồng bộ Bitable có bốn đoạn chữ trước khi tới được nút đầu tiên.
 */
export function PageHeader({ title, description, actions, meta }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; meta?: ReactNode }) {
  const runtime = useRuntime();
  const showTitle = !!title && runtime.kind !== 'desktop';
  if (!showTitle && !description && !actions && !meta) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, rowGap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
      <div style={{ flex: '1 1 320px', minWidth: 0 }}>
        {showTitle && <Title level={4} style={{ margin: '0 0 2px' }}>{title}</Title>}
        {(description || meta) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', color: V.textSub, fontSize: 13.5, lineHeight: 1.5 }}>
            {description && <span style={{ minWidth: 0 }}>{description}</span>}
            {meta}
          </div>
        )}
      </div>
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  );
}

/** "Cách hoạt động" — phần giải thích dài, ĐÓNG sẵn (quy tắc B). Một dòng khi đóng. */
export function HowItWorks({ title, children, defaultOpen = false, style }: { title?: ReactNode; children: ReactNode; defaultOpen?: boolean; style?: CSSProperties }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: V.surface, border: `1px solid ${V.border}`, borderRadius: 12, ...style }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{ width: '100%', border: 'none', background: 'none', padding: '10px 14px', cursor: 'pointer', color: V.text, fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left' }}
      >
        <InfoCircleOutlined style={{ color: BRAND }} />
        <span style={{ flex: 1 }}>{title ?? t('ui.howItWorks', 'Cách hoạt động')}</span>
        {open ? <DownOutlined style={{ fontSize: 10, color: V.textFaint }} /> : <RightOutlined style={{ fontSize: 10, color: V.textFaint }} />}
      </button>
      {open && <div style={{ padding: '0 14px 12px 36px', fontSize: 12.5, color: V.textSub, lineHeight: 1.65 }}>{children}</div>}
    </div>
  );
}
