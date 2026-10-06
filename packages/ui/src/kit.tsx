'use client';
import type { CSSProperties, ReactNode } from 'react';
import { Button, Typography } from 'antd';
import { ArrowRightOutlined, CheckCircleFilled, SyncOutlined, ExclamationCircleFilled, EditOutlined } from '@ant-design/icons';
import { V, BRAND, OK, WARN, ERR, CARD_SHADOW } from './theme';

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
