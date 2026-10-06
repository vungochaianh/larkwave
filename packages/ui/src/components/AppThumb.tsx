'use client';
import { useState } from 'react';
import { ThunderboltOutlined } from '@ant-design/icons';
import { BRAND_GRADIENT, V } from '../theme';

/** Stable two-stop gradient derived from a seed — every app gets a distinct cover. */
function coverGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `linear-gradient(135deg, hsl(${hue} 72% 60%) 0%, hsl(${(hue + 38) % 360} 68% 48%) 100%)`;
}

/** macOS window-control dots — the same three colours in light AND dark, so they are
 *  window chrome, not theme surfaces (nothing to tokenize). */
const TRAFFIC = ['#FF5F57', '#FEBC2E', '#28C840'];

/**
 * An app card's cover: the latest screenshot of the app's own views over a seeded
 * gradient, under a faux browser chrome bar.
 *
 * `src` is a `data:` URL from `runtime.appScreenshot?.(appId)` (the renderer origin is
 * `app://./home`, so a `file://` src would never load). It is missing on web and on any
 * app that was never captured — then the Larkwave mark + name shows through, exactly as
 * it does when the image itself fails to decode.
 */
export function AppThumb({
  src,
  name,
  seed,
  host,
  height,
  compact,
}: {
  /** `data:` URL of the app's cover screenshot. Null/undefined → brand fallback. */
  src?: string | null;
  name: string;
  /** Anything stable per app (its id) — picks the gradient hue. */
  seed: string;
  /** Shown in the faux address bar. */
  host?: string | null;
  /** Fixed cover height in px. Defaults to 96 when `compact`, else 16:10 of the card width. */
  height?: number;
  /** Short cover for narrow rails (the Trang chủ column). */
  compact?: boolean;
}) {
  // Keyed by url so a NEW screenshot after a build gets a fresh attempt, not the stale failure.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const fixed = height ?? (compact ? 96 : undefined);
  const barH = compact ? 20 : 26;
  const mark = compact ? 26 : 38;
  const showImg = !!src && src !== failedSrc;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        ...(fixed ? { height: fixed } : { aspectRatio: '16 / 10' }),
        background: coverGradient(seed),
        overflow: 'hidden',
      }}
    >
      {/* Fallback layer: the Larkwave mark + the app name (mirrors AppShell's LogoMark). */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: compact ? 4 : 8,
          padding: `${barH}px 12px 0`,
          color: 'rgba(255,255,255,0.94)',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            width: mark,
            height: mark,
            minWidth: mark,
            borderRadius: mark * 0.32,
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: mark * 0.5,
            color: '#fff',
            background: BRAND_GRADIENT,
            boxShadow: '0 6px 16px rgba(108,92,231,0.30)',
          }}
        >
          <ThunderboltOutlined />
        </span>
        <span
          style={{
            maxWidth: '100%',
            fontSize: compact ? 11.5 : 13,
            fontWeight: 700,
            letterSpacing: 0.3,
            opacity: 0.92,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name || 'App'}
        </span>
      </div>

      {/* The screenshot itself. Renders nothing when it fails → the brand layer shows through. */}
      {showImg && (
        <img
          src={src as string}
          alt={name}
          loading="lazy"
          onError={() => setFailedSrc(src ?? null)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'top center',
          }}
        />
      )}

      {/* Faux browser chrome bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: barH,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 10px',
          background: V.surface,
          opacity: 0.86,
          borderBottom: `1px solid ${V.borderSub}`,
        }}
      >
        {TRAFFIC.map((c) => (
          <span key={c} style={{ width: 8, height: 8, borderRadius: 999, background: c, flexShrink: 0 }} />
        ))}
        <span
          style={{
            marginLeft: 6,
            flex: 1,
            minWidth: 0,
            fontSize: 10.5,
            color: V.textSub,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {host ?? ''}
        </span>
      </div>
    </div>
  );
}
