"use client";

import {
  AppstoreOutlined,
  BugOutlined,
  BuildOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloudDownloadOutlined,
  CloudUploadOutlined,
  CrownOutlined,
  ExperimentOutlined,
  EyeOutlined,
  FireFilled,
  FireOutlined,
  GlobalOutlined,
  HeartFilled,
  LockOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
  ShareAltOutlined,
  StarFilled,
  TeamOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  TrophyOutlined,
} from "@ant-design/icons";
import { Card, Progress, Tag, Tooltip, Typography } from "antd";
import { useEffect, useId, useState, type ReactNode } from "react";
import type { MeActivity, MeOverview } from "@larkwave/shared";
import { TESTER_RANKS } from "@larkwave/shared";
import { useI18n } from "@larkwave/ui";
import { api } from "@/lib/api";
import { CARD_SHADOW } from "@/lib/theme";

const { Text } = Typography;

/* ────────────────────────────────────────────────────────────────────────────
 * Achievement badges — a Discord-style emblem collection. Each badge is a glossy
 * hexagonal medal whose gradient encodes its rarity tier, with a glyph in the
 * centre. Earned badges glow in full colour; locked ones are desaturated with a
 * lock. Earn state is computed client-side from the user's existing stats — no
 * backend needed — so the collection lights up immediately.
 * ──────────────────────────────────────────────────────────────────────────── */

export type AchievementTier = "common" | "rare" | "epic" | "legendary" | "mythic";

const TIER: Record<
  AchievementTier,
  { from: string; to: string; ring: string; glow: string; label: string }
> = {
  common: {
    from: "#C2CAD6",
    to: "#8A93A6",
    ring: "#E2E6EE",
    glow: "rgba(138,147,166,0.30)",
    label: "Thường",
  },
  rare: {
    from: "#5BC0FF",
    to: "#2D7FF9",
    ring: "#B6E0FF",
    glow: "rgba(45,127,249,0.40)",
    label: "Hiếm",
  },
  epic: {
    from: "#B98BFF",
    to: "#6C5CE7",
    ring: "#DCC9FF",
    glow: "rgba(108,92,231,0.45)",
    label: "Sử thi",
  },
  legendary: {
    from: "#FFD56B",
    to: "#FF9F43",
    ring: "#FFE9B0",
    glow: "rgba(255,159,67,0.50)",
    label: "Huyền thoại",
  },
  mythic: {
    from: "#FF8FB1",
    to: "#FF4D6D",
    ring: "#FFC8D6",
    glow: "rgba(255,77,109,0.50)",
    label: "Thần thoại",
  },
};

/**
 * One badge emblem. A glossy hexagon filled with the tier gradient + a centred
 * glyph. `earned=false` renders it greyscale + dimmed with a small lock.
 */
export function AchievementBadge({
  icon,
  tier,
  earned = true,
  size = 76,
}: {
  icon: ReactNode;
  tier: AchievementTier;
  earned?: boolean;
  size?: number;
}) {
  const uid = useId().replace(/:/g, "");
  const t = TIER[tier];
  const from = earned ? t.from : "#C9CDD6";
  const to = earned ? t.to : "#A7ADBA";
  const ring = earned ? t.ring : "#E5E7EE";
  const w = size;
  const h = size * 1.12;

  return (
    <div
      style={{
        position: "relative",
        width: w,
        height: h,
        filter: earned
          ? `drop-shadow(0 6px 14px ${t.glow})`
          : "grayscale(0.25)",
        opacity: earned ? 1 : 0.62,
        transition: "transform .15s ease",
      }}
    >
      <svg width={w} height={h} viewBox="0 0 100 112" fill="none">
        <defs>
          <linearGradient id={`g-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={from} />
            <stop offset="1" stopColor={to} />
          </linearGradient>
          <linearGradient id={`s-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.45" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Outer ring */}
        <polygon
          points="50,2 95,28 95,84 50,110 5,84 5,28"
          fill={ring}
        />
        {/* Gradient face */}
        <polygon
          points="50,8 89,30.5 89,81.5 50,104 11,81.5 11,30.5"
          fill={`url(#g-${uid})`}
        />
        {/* Top gloss highlight */}
        <polygon
          points="50,8 89,30.5 89,46 50,26 11,46 11,30.5"
          fill={`url(#s-${uid})`}
        />
      </svg>
      {/* Glyph */}
      <span
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontSize: size * 0.38,
          textShadow: "0 1px 2px rgba(0,0,0,0.18)",
          paddingBottom: size * 0.02,
        }}
      >
        {icon}
      </span>
      {/* Lock chip for unearned */}
      {!earned && (
        <span
          style={{
            position: "absolute",
            right: -2,
            bottom: size * 0.08,
            width: size * 0.3,
            height: size * 0.3,
            borderRadius: "50%",
            background: "#fff",
            border: "1px solid #E5E7EE",
            boxShadow: "0 2px 6px rgba(17,24,39,0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#9AA3B5",
            fontSize: size * 0.16,
          }}
        >
          <LockOutlined />
        </span>
      )}
    </div>
  );
}

/* ── Catalog ─────────────────────────────────────────────────────────────── */

export interface AchievementInput {
  totalApps: number;
  liveApps: number;
  totalBuilds: number;
  succeededBuilds: number;
  totalDeployments: number;
  longestStreak: number;
  plan: string;
  joinedAt: string | null;
  /** Valid (non-rejected) bug reports — drives the tester danh hiệu badges. */
  bugReports: number;
}

interface AchievementDef {
  id: string;
  name: string;
  /** How to earn it (shown in the tooltip). */
  desc: string;
  tier: AchievementTier;
  icon: ReactNode;
  /** Future feature — always locked for now, shown as “Sắp ra mắt”. */
  upcoming?: boolean;
  earned?: (s: AchievementInput) => boolean;
  /** Optional numeric progress toward a threshold. */
  progress?: (s: AchievementInput) => { cur: number; target: number };
}

const PAID = (p: string) => p !== "free" && !!p;
const daysSince = (iso: string | null) =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : 0;

/** Early-adopter cutoff: everyone who joined before this is a “Pioneer”. */
const PIONEER_CUTOFF = new Date("2026-09-01T00:00:00Z").getTime();

/** Tester "danh hiệu" badges — generated from the shared rank thresholds (by bug
 *  count). Uses AntD icons (consistent with the other achievement medals). */
const TESTER_ICON: Record<string, ReactNode> = {
  rookie: <BugOutlined />,
  reporter: <ExperimentOutlined />,
  hunter: <EyeOutlined />,
  expert: <SafetyCertificateOutlined />,
  master: <StarFilled />,
  legend: <CrownOutlined />,
};
const TESTER_ACHIEVEMENTS: AchievementDef[] = TESTER_RANKS.map((r) => ({
  id: `tester-${r.key}`,
  name: r.title,
  desc: `Báo ${r.minBugs} lỗi hợp lệ.`,
  tier: r.tier,
  icon: TESTER_ICON[r.key] ?? <BugOutlined />,
  earned: (s: AchievementInput) => s.bugReports >= r.minBugs,
  progress: (s: AchievementInput) => ({ cur: s.bugReports, target: r.minBugs }),
}));

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "first-app",
    name: "App đầu tay",
    desc: "Tạo app đầu tiên của bạn.",
    tier: "common",
    icon: <ThunderboltOutlined />,
    earned: (s) => s.totalApps >= 1,
    progress: (s) => ({ cur: s.totalApps, target: 1 }),
  },
  {
    id: "tinkerer",
    name: "Thợ mày mò",
    desc: "Tạo 10 app.",
    tier: "rare",
    icon: <AppstoreOutlined />,
    earned: (s) => s.totalApps >= 10,
    progress: (s) => ({ cur: s.totalApps, target: 10 }),
  },
  {
    id: "architect",
    name: "Kiến trúc sư",
    desc: "Tạo 50 app.",
    tier: "epic",
    icon: <BuildOutlined />,
    earned: (s) => s.totalApps >= 50,
    progress: (s) => ({ cur: s.totalApps, target: 50 }),
  },
  {
    id: "first-deploy",
    name: "Lên sóng",
    desc: "Deploy app đầu tiên ra liên kết công khai.",
    tier: "rare",
    icon: <GlobalOutlined />,
    earned: (s) => s.totalDeployments >= 1 || s.liveApps >= 1,
    progress: (s) => ({ cur: Math.max(s.totalDeployments, s.liveApps), target: 1 }),
  },
  {
    id: "shipmaster",
    name: "Bậc thầy xuất bản",
    desc: "Thực hiện 10 lần deploy.",
    tier: "epic",
    icon: <CloudUploadOutlined />,
    earned: (s) => s.totalDeployments >= 10,
    progress: (s) => ({ cur: s.totalDeployments, target: 10 }),
  },
  {
    id: "grinder",
    name: "Cày cuốc",
    desc: "Chạy 50 lượt build.",
    tier: "rare",
    icon: <ToolOutlined />,
    earned: (s) => s.totalBuilds >= 50,
    progress: (s) => ({ cur: s.totalBuilds, target: 50 }),
  },
  {
    id: "centurion",
    name: "Bách chiến",
    desc: "Chạy 100 lượt build.",
    tier: "epic",
    icon: <RocketOutlined />,
    earned: (s) => s.totalBuilds >= 100,
    progress: (s) => ({ cur: s.totalBuilds, target: 100 }),
  },
  {
    id: "flawless",
    name: "Tay nghề cứng",
    desc: "Có 20 lượt build thành công.",
    tier: "rare",
    icon: <CheckCircleOutlined />,
    earned: (s) => s.succeededBuilds >= 20,
    progress: (s) => ({ cur: s.succeededBuilds, target: 20 }),
  },
  {
    id: "streak-7",
    name: "Chuỗi lửa",
    desc: "Dựng app 7 ngày liên tiếp.",
    tier: "rare",
    icon: <FireOutlined />,
    earned: (s) => s.longestStreak >= 7,
    progress: (s) => ({ cur: s.longestStreak, target: 7 }),
  },
  {
    id: "streak-30",
    name: "Không ngừng nghỉ",
    desc: "Dựng app 30 ngày liên tiếp.",
    tier: "legendary",
    icon: <FireFilled />,
    earned: (s) => s.longestStreak >= 30,
    progress: (s) => ({ cur: s.longestStreak, target: 30 }),
  },
  {
    id: "supporter",
    name: "Nhà tài trợ",
    desc: "Nâng cấp lên một gói trả phí.",
    tier: "rare",
    icon: <HeartFilled />,
    earned: (s) => PAID(s.plan),
  },
  {
    id: "pro-member",
    name: "Chuyên nghiệp",
    desc: "Sở hữu gói Chuyên nghiệp trở lên.",
    tier: "epic",
    icon: <CrownOutlined />,
    earned: (s) => s.plan === "pro" || s.plan === "enterprise",
  },
  {
    id: "enterprise",
    name: "Doanh nhân",
    desc: "Sở hữu gói Doanh nghiệp.",
    tier: "legendary",
    icon: <TrophyOutlined />,
    earned: (s) => s.plan === "enterprise",
  },
  {
    id: "veteran",
    name: "Kỳ cựu",
    desc: "Đồng hành cùng Larkwave 90 ngày.",
    tier: "epic",
    icon: <ClockCircleOutlined />,
    earned: (s) => daysSince(s.joinedAt) >= 90,
    progress: (s) => ({ cur: Math.min(daysSince(s.joinedAt), 90), target: 90 }),
  },
  {
    id: "pioneer",
    name: "Tiên phong",
    desc: "Thành viên thuở sơ khai của Larkwave.",
    tier: "mythic",
    icon: <StarFilled />,
    earned: (s) => !!s.joinedAt && new Date(s.joinedAt).getTime() < PIONEER_CUTOFF,
  },
  // ── Upcoming (đợt sau) — shown locked so the collection feels complete ──
  {
    id: "importer",
    name: "Nhập khẩu",
    desc: "Nhập một repo từ Git (GitLab/GitHub).",
    tier: "common",
    icon: <CloudDownloadOutlined />,
    upcoming: true,
  },
  {
    id: "publisher",
    name: "Người chia sẻ",
    desc: "Đăng một app lên trang công khai.",
    tier: "rare",
    icon: <ShareAltOutlined />,
    upcoming: true,
  },
  {
    id: "star-app",
    name: "Ngôi sao",
    desc: "Một app đạt 100 lượt truy cập.",
    tier: "epic",
    icon: <EyeOutlined />,
    upcoming: true,
  },
  ...TESTER_ACHIEVEMENTS,
  {
    id: "connector",
    name: "Kết nối",
    desc: "Mời và kết bạn với người dùng khác.",
    tier: "common",
    icon: <TeamOutlined />,
    upcoming: true,
  },
];

/* ── Showcase card ───────────────────────────────────────────────────────── */

export function AchievementsCard({
  overview,
  activity,
  plan,
  joinedAt,
  loading,
}: {
  overview: MeOverview | null;
  activity: MeActivity | null;
  plan: string | undefined;
  joinedAt: string | null;
  loading: boolean;
}) {
  const { t: tr } = useI18n();
  // Bug-report count for the tester danh hiệu badges (fetched once).
  const [bugReports, setBugReports] = useState(0);
  useEffect(() => {
    let on = true;
    api
      .myFeedback()
      .then((r) => {
        if (on) setBugReports(r.totalReports);
      })
      .catch(() => {});
    return () => {
      on = false;
    };
  }, []);

  const input: AchievementInput = {
    totalApps: overview?.totalApps ?? 0,
    liveApps: overview?.liveApps ?? 0,
    totalBuilds: overview?.totalBuilds ?? 0,
    succeededBuilds: overview?.succeededBuilds ?? 0,
    totalDeployments: overview?.totalDeployments ?? 0,
    longestStreak: activity?.longestStreak ?? 0,
    plan: plan ?? "free",
    joinedAt,
    bugReports,
  };

  const evaluated = ACHIEVEMENTS.map((a) => ({
    def: a,
    earned: !a.upcoming && !!a.earned?.(input),
    progress: a.progress?.(input),
  }));
  const achievable = evaluated.filter((e) => !e.def.upcoming);
  const earnedCount = achievable.filter((e) => e.earned).length;
  const pct = achievable.length
    ? Math.round((earnedCount / achievable.length) * 100)
    : 0;

  return (
    <Card
      styles={{ body: { padding: 20 } }}
      style={{ boxShadow: CARD_SHADOW }}
      title={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <TrophyOutlined style={{ color: "#F59E0B" }} />
          {tr("wcomp.achvCardTitle", "Huy hiệu thành tựu")}
        </span>
      }
      extra={
        !loading && (
          <Text type="secondary" style={{ fontSize: 12.5 }}>
            {tr("wcomp.achvUnlocked", "Đã mở")} {earnedCount}/{achievable.length}
          </Text>
        )
      }
    >
      {!loading && (
        <Progress
          percent={pct}
          showInfo={false}
          strokeColor={{ "0%": "#6C5CE7", "100%": "#A66BFF" }}
          style={{ marginBottom: 16 }}
        />
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
          gap: 14,
          justifyItems: "center",
        }}
      >
        {evaluated.map(({ def, earned, progress }) => {
          const t = TIER[def.tier];
          const showProgress =
            !earned && !def.upcoming && progress && progress.target > 1;
          return (
            <Tooltip
              key={def.id}
              title={
                <div style={{ maxWidth: 220 }}>
                  <div style={{ fontWeight: 700, marginBottom: 2 }}>
                    {tr(`wcomp.achv.${def.id}.name`, def.name)}{" "}
                    <Tag
                      bordered={false}
                      style={{
                        marginInlineStart: 4,
                        color: "#fff",
                        background: `linear-gradient(135deg, ${t.from}, ${t.to})`,
                        fontSize: 10,
                        lineHeight: "16px",
                        padding: "0 6px",
                      }}
                    >
                      {tr(`wcomp.tier.${def.tier}`, t.label)}
                    </Tag>
                  </div>
                  <div style={{ fontSize: 12.5, opacity: 0.9 }}>
                    {tr(`wcomp.achv.${def.id}.desc`, def.desc)}
                  </div>
                  {def.upcoming && (
                    <div style={{ fontSize: 11.5, marginTop: 4, opacity: 0.75 }}>
                      {tr("wcomp.achvUpcoming", "🔒 Sắp ra mắt")}
                    </div>
                  )}
                  {showProgress && (
                    <div style={{ fontSize: 11.5, marginTop: 4, opacity: 0.85 }}>
                      {tr("wcomp.achvProgress", "Tiến độ:")} {Math.min(progress!.cur, progress!.target)}/
                      {progress!.target}
                    </div>
                  )}
                  {earned && (
                    <div style={{ fontSize: 11.5, marginTop: 4, color: "#7CF0C6" }}>
                      {tr("wcomp.achvUnlockedCheck", "✓ Đã mở khoá")}
                    </div>
                  )}
                </div>
              }
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  cursor: "default",
                }}
              >
                <AchievementBadge icon={def.icon} tier={def.tier} earned={earned} size={72} />
                <Text
                  style={{
                    fontSize: 11.5,
                    textAlign: "center",
                    lineHeight: 1.25,
                    color: earned ? "#1E2230" : "#9AA3B5",
                    fontWeight: earned ? 600 : 400,
                  }}
                >
                  {tr(`wcomp.achv.${def.id}.name`, def.name)}
                </Text>
              </div>
            </Tooltip>
          );
        })}
      </div>
    </Card>
  );
}
