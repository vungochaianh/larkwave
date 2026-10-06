'use client';
import { Avatar } from 'antd';
import { BRAND_GRADIENT } from '../theme';

/** Avatar with image when available, else a coloured initial — matches the web. */
export function UserAvatar({
  name,
  avatarUrl,
  size = 34,
}: {
  name?: string | null;
  avatarUrl?: string | null;
  size?: number;
}) {
  if (avatarUrl) return <Avatar src={avatarUrl} size={size} />;
  const initial = (name?.trim()?.[0] || 'U').toUpperCase();
  return (
    <Avatar size={size} style={{ background: BRAND_GRADIENT, color: '#fff', fontWeight: 700 }}>
      {initial}
    </Avatar>
  );
}
