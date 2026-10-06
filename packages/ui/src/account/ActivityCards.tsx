'use client';
import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { Card, Skeleton, Tooltip, Typography } from 'antd';
import { FireOutlined, ThunderboltOutlined, TrophyOutlined } from '@ant-design/icons';
import { CARD_SHADOW, V } from '../theme';
import type { ActivityDay, MeActivity } from './api';

const { Text } = Typography;

/* ────────────────────────────────────────────────────────────────────────────
 * Streak tiles + the GitHub-style contribution heatmap. Ported from the website's
 * /profile page (they were private components there). The heatmap's markup used
 * the `.tw-contrib*` rules from apps/web's globals.css, which the desktop renderer
 * never loads — every rule is inlined below so it renders identically in both apps.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Chuỗi hiện tại / dài nhất / tổng đóng góp — three gradient stat tiles. */
export function StreakRow({ activity, loading }: { activity: MeActivity | null; loading: boolean }) {
  const cards: {
    label: string;
    value: number | undefined;
    suffix: string;
    icon: ReactNode;
    gradient: string;
  }[] = [
    {
      label: 'Chuỗi hiện tại',
      value: activity?.currentStreak,
      suffix: 'ngày',
      icon: <FireOutlined />,
      gradient: 'linear-gradient(135deg, #FF7A59 0%, #FF4D6D 100%)',
    },
    {
      label: 'Chuỗi dài nhất',
      value: activity?.longestStreak,
      suffix: 'ngày',
      icon: <TrophyOutlined />,
      gradient: 'linear-gradient(135deg, #6C5CE7 0%, #A66BFF 100%)',
    },
    {
      label: 'Tổng đóng góp',
      value: activity?.total,
      suffix: 'build',
      icon: <ThunderboltOutlined />,
      gradient: 'linear-gradient(135deg, #16B98D 0%, #4FB6FF 100%)',
    },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
      {cards.map((c) => (
        <Card key={c.label} styles={{ body: { padding: 18 } }} style={{ boxShadow: CARD_SHADOW }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span
              style={{
                display: 'inline-flex',
                width: 50,
                height: 50,
                minWidth: 50,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 23,
                color: '#fff', // sits on the gradient chip — fixed in both themes
                background: c.gradient,
                flexShrink: 0,
              }}
            >
              {c.icon}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, color: V.textSub }}>{c.label}</div>
              {loading || c.value === undefined ? (
                <Skeleton.Button active size="small" style={{ width: 70, height: 28 }} />
              ) : (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 28, fontWeight: 800, color: V.text }}>{c.value}</span>
                  <span style={{ fontSize: 13, color: V.textFaint }}>{c.suffix}</span>
                </div>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

const WEEKDAY_LABELS = ['', 'T2', '', 'T4', '', 'T6', ''];
const MONTH_LABELS = ['Th1', 'Th2', 'Th3', 'Th4', 'Th5', 'Th6', 'Th7', 'Th8', 'Th9', 'Th10', 'Th11', 'Th12'];

/** Heat ramp, level 0 → 4. Level 0 is a theme token so the empty grid stays subtle
 *  in dark mode; 1–4 are brand violet tints (artwork, identical in both themes). */
const LEVEL_BG = [V.surfaceMuted, '#d6cffb', '#b3a4f5', '#8b73ef', '#6c5ce7'];

const CELL = 12;
const CELL_GAP = 3;

/** Base cell style (was `.tw-contrib-cell`). */
const cellStyle = (level: number): CSSProperties => ({
  width: CELL,
  height: CELL,
  borderRadius: 3,
  background: LEVEL_BG[level],
  outline: '1px solid rgba(17,24,39,0.04)',
  outlineOffset: -1,
  transition: 'transform .1s ease',
});

/** Padding cell before the window starts (was `.tw-contrib-cell.is-empty`). */
const EMPTY_CELL: CSSProperties = {
  width: CELL,
  height: CELL,
  borderRadius: 3,
  background: 'transparent',
};

// `.tw-contrib-cell:hover { transform: scale(1.22) }` — inline styles have no :hover,
// so nudge the node directly (the AppsGrid idiom) instead of re-rendering 365 cells.
const growCell = (e: { currentTarget: HTMLElement }) => {
  e.currentTarget.style.transform = 'scale(1.22)';
};
const resetCell = (e: { currentTarget: HTMLElement }) => {
  e.currentTarget.style.transform = '';
};

/** Map a day count to a 0–4 heat level (0 = none, 4 = most). */
function levelFor(count: number, max: number): number {
  if (count <= 0) return 0;
  if (max <= 0) return 1;
  const ratio = count / max;
  if (ratio > 0.75) return 4;
  if (ratio > 0.5) return 3;
  if (ratio > 0.25) return 2;
  return 1;
}

interface Week {
  /** 7 cells, index 0 = Monday … 6 = Sunday; null = padding before the window. */
  cells: (ActivityDay | null)[];
  /** Month label to show above this week column, or "" for none. */
  monthLabel: string;
}

/**
 * GitHub-style contribution heatmap built from a flat ascending list of days.
 * Columns are weeks (Mon→Sun), padded so the first column starts on a Monday.
 */
export function ContributionGraph({ days }: { days: ActivityDay[] }) {
  const { weeks, max } = useMemo(() => {
    if (days.length === 0) return { weeks: [] as Week[], max: 0 };

    const maxCount = days.reduce((m, d) => Math.max(m, d.count), 0);

    // Weekday index with Monday = 0 … Sunday = 6.
    const mondayIndex = (date: string): number => {
      const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0=Sun … 6=Sat
      return (dow + 6) % 7;
    };

    // Pad the front so the first real day lands on its correct weekday row.
    const padded: (ActivityDay | null)[] = [];
    const firstPad = mondayIndex(days[0].date);
    for (let i = 0; i < firstPad; i++) padded.push(null);
    padded.push(...days);

    const built: Week[] = [];
    let lastMonth = -1;
    for (let i = 0; i < padded.length; i += 7) {
      const cells = padded.slice(i, i + 7);
      while (cells.length < 7) cells.push(null);

      // Use the first real day in the column to decide the month label.
      const firstReal = cells.find((c): c is ActivityDay => c !== null);
      let monthLabel = '';
      if (firstReal) {
        const m = new Date(`${firstReal.date}T00:00:00Z`).getUTCMonth();
        if (m !== lastMonth) {
          monthLabel = MONTH_LABELS[m];
          lastMonth = m;
        }
      }
      built.push({ cells, monthLabel });
    }
    return { weeks: built, max: maxCount };
  }, [days]);

  if (weeks.length === 0) {
    return <Text type="secondary">Chưa có hoạt động nào trong khoảng thời gian này.</Text>;
  }

  return (
    /* was .tw-contrib-scroll */
    <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
      <div style={{ display: 'inline-flex', alignItems: 'flex-start' }}>
        {/* Weekday labels column (was .tw-contrib-weekdays / .tw-contrib-weekday) */}
        <div style={{ paddingTop: 16 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateRows: `repeat(7, 1fr)`,
              gap: CELL_GAP,
              fontSize: 10.5,
              color: V.textFaint,
              paddingRight: 6,
            }}
          >
            {WEEKDAY_LABELS.map((w, i) => (
              <div key={i} style={{ height: CELL, lineHeight: `${CELL}px`, textAlign: 'right' }}>
                {w}
              </div>
            ))}
          </div>
        </div>

        <div>
          {/* Month labels aligned over the columns (was .tw-contrib-months) */}
          <div
            style={{
              display: 'grid',
              gridAutoFlow: 'column',
              gridTemplateColumns: `repeat(${weeks.length}, ${CELL}px)`,
              gap: CELL_GAP,
              fontSize: 11,
              color: V.textFaint,
              height: 16,
            }}
          >
            {weeks.map((w, i) => (
              <span key={i}>{w.monthLabel}</span>
            ))}
          </div>

          {/* The heatmap grid (was .tw-contrib) */}
          <div
            style={{
              display: 'inline-grid',
              gridAutoFlow: 'column',
              gridTemplateRows: 'repeat(7, 1fr)',
              gap: CELL_GAP,
            }}
          >
            {weeks.map((week, wi) =>
              week.cells.map((cell, di) => {
                if (!cell) return <span key={`${wi}-${di}`} style={EMPTY_CELL} />;
                const lvl = levelFor(cell.count, max);
                return (
                  <Tooltip key={`${wi}-${di}`} title={`${cell.count} build · ${cell.date}`} mouseEnterDelay={0.05}>
                    <span style={cellStyle(lvl)} onMouseEnter={growCell} onMouseLeave={resetCell} />
                  </Tooltip>
                );
              }),
            )}
          </div>

          {/* Legend */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 12,
              fontSize: 11.5,
              color: V.textFaint,
            }}
          >
            <span style={{ marginRight: 2 }}>Ít</span>
            {[0, 1, 2, 3, 4].map((l) => (
              <span key={l} style={cellStyle(l)} />
            ))}
            <span style={{ marginLeft: 2 }}>Nhiều</span>
          </div>
        </div>
      </div>
    </div>
  );
}
