import React from 'react';
import { BRAND_GRADIENT } from '../theme';

/**
 * Larkwave logo glyph: a lark in flight above a wave (viewBox 24×24, currentColor).
 * Sized like an antd icon (1em by default), so it drops in where the old
 * `<ThunderboltOutlined />` brand mark was and inherits font-size + color.
 * The full app icon (glyph in the gradient square) lives at apps/desktop/resources/icon.svg.
 */
export const BRAND_GLYPH_BIRD =
  'M12 12.2C10.6 8.4 8.4 5.6 6 5.6C4.4 5.6 3.2 6.8 2.2 8.8C3.8 8 5.1 7.8 6.2 8.1C8 8.6 9.6 10.4 10.7 13Q12 15.2 13.3 13C14.4 10.4 16 8.6 17.8 8.1C18.9 7.8 20.2 8 21.8 8.8C20.8 6.8 19.6 5.6 18 5.6C15.6 5.6 13.4 8.4 12 12.2Z';
export const BRAND_GLYPH_WAVE = 'M3 19c1.5-2.2 3-2.2 4.5 0s3 2.2 4.5 0 3-2.2 4.5 0 3 2.2 4.5 0';

export function BrandGlyph({
  size = '1em',
  style,
  className,
  title,
}: {
  size?: number | string;
  style?: React.CSSProperties;
  className?: string;
  /** Accessible name; without it the glyph is decorative (aria-hidden). */
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={{ display: 'inline-block', verticalAlign: '-0.125em', flexShrink: 0, ...style }}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <path fill="currentColor" d={BRAND_GLYPH_BIRD} />
      <path d={BRAND_GLYPH_WAVE} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
    </svg>
  );
}

/** Full logo mark: white glyph inside the brand-gradient rounded square. */
export function BrandMark({
  size = 30,
  radius,
  shadow = true,
  style,
}: {
  size?: number;
  /** Corner radius in px (default ≈ 0.32 × size). */
  radius?: number;
  shadow?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <span
      style={{
        display: 'inline-flex', minWidth: size, width: size, height: size,
        borderRadius: radius ?? size * 0.32, alignItems: 'center', justifyContent: 'center',
        fontSize: Math.round(size * 0.56), color: '#fff', background: BRAND_GRADIENT,
        boxShadow: shadow ? '0 6px 16px rgba(108,92,231,0.30)' : undefined, flexShrink: 0,
        ...style,
      }}
    >
      <BrandGlyph />
    </span>
  );
}
