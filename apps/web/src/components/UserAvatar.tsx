"use client";

import { Tag } from "antd";
import { useI18n } from "@larkwave/ui";
import { BRAND_GRADIENT } from "@/lib/theme";

/**
 * Shared avatar that prefers `user.avatarUrl` (an API-served image at
 * api.toolswave.net/uploads/...) and gracefully falls back to a gradient
 * circle showing the user's first initial.
 *
 * Uses a plain <img> on purpose — the avatar host is NOT registered in
 * next/image remotePatterns, and a bare <img> avoids any build/runtime
 * optimisation issues with the dynamic uploads origin.
 */
export function UserAvatar({
  name,
  avatarUrl,
  size = 36,
  fontScale = 0.42,
  style,
}: {
  name?: string | null;
  avatarUrl?: string | null;
  size?: number;
  /** Initial font size as a fraction of `size` (default 0.42). */
  fontScale?: number;
  style?: React.CSSProperties;
}) {
  const letter = (name?.trim()?.[0] ?? "U").toUpperCase();
  const base: React.CSSProperties = {
    width: size,
    height: size,
    minWidth: size,
    borderRadius: "50%",
    flexShrink: 0,
    objectFit: "cover",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    ...style,
  };

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={name || "avatar"}
        width={size}
        height={size}
        style={{ ...base, background: "#F1F2F7" }}
      />
    );
  }

  return (
    <span
      aria-label={name || "avatar"}
      style={{
        ...base,
        background: BRAND_GRADIENT,
        color: "#fff",
        fontWeight: 800,
        fontSize: Math.round(size * fontScale),
        lineHeight: 1,
        userSelect: "none",
      }}
    >
      {letter}
    </span>
  );
}

interface PlanMeta {
  key: string;
  label: string;
  color: string;
}

/** Plan tier → i18n key + Vietnamese fallback label + AntD Tag colour. */
const PLAN_META: Record<string, PlanMeta> = {
  free: { key: "wcomp.planFree", label: "Miễn phí", color: "default" },
  starter: { key: "wcomp.planStarter", label: "Khởi đầu", color: "blue" },
  pro: { key: "wcomp.planPro", label: "Chuyên nghiệp", color: "purple" },
  enterprise: { key: "wcomp.planEnterprise", label: "Doanh nghiệp", color: "gold" },
};

/**
 * Compact plan-tier chip shown next to the user's name. Falls back to a plain
 * grey chip echoing the raw plan id for any unknown/future tier.
 */
export function PlanBadge({
  plan,
  style,
}: {
  plan?: string | null;
  style?: React.CSSProperties;
}) {
  const { t } = useI18n();
  if (!plan) return null;
  const meta = PLAN_META[plan];
  const label = meta ? t(meta.key, meta.label) : plan;
  return (
    <Tag
      color={meta?.color ?? "default"}
      bordered={false}
      style={{
        margin: 0,
        fontSize: 11,
        lineHeight: "18px",
        padding: "0 7px",
        fontWeight: 600,
        ...style,
      }}
    >
      {label}
    </Tag>
  );
}

/** Violet "Admin" badge for staff accounts. */
export function AdminBadge({ style }: { style?: React.CSSProperties }) {
  return (
    <Tag
      color="purple"
      bordered={false}
      style={{
        margin: 0,
        fontSize: 11,
        lineHeight: "18px",
        padding: "0 7px",
        fontWeight: 700,
        ...style,
      }}
    >
      Admin
    </Tag>
  );
}
