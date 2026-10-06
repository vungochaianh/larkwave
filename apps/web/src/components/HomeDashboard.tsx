"use client";

/**
 * The web "Tổng quan" dashboard — mirrors the desktop Overview (HomeOverview):
 * gradient hero + KPI strip + budget, quick-action chips, an attention band, a
 * rewards/community row and a weekly-activity card. Kept OFF the builder home so
 * that page stays clean; this is its own screen, the way the desktop separates
 * "Tổng quan" from the builder.
 */

import {
  ApiOutlined,
  AppstoreAddOutlined,
  ArrowRightOutlined,
  BugOutlined,
  CheckCircleFilled,
  CloudDownloadOutlined,
  CloudServerOutlined,
  CompassOutlined,
  ExperimentOutlined,
  GiftOutlined,
  PlusOutlined,
  ReloadOutlined,
  RobotOutlined,
  RocketOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  TrophyOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { Button, Card, Empty, Grid, Progress, Skeleton, Space, theme, Tooltip, Typography } from "antd";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type {
  App as AppEntity,
  LeaderboardResponse,
  MeActivity,
  MeSubscription,
  MyFeedbackResponse,
  Track,
} from "@larkwave/shared";
import { StreakRow, ContributionGraph, useI18n } from "@larkwave/ui";
import { formatTokens, refPercent } from "@/lib/formatTokens";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { AGENTS, BRAND, BRAND_GRADIENT, CARD_SHADOW } from "@/lib/theme";
import AppPreviewCard from "@/components/AppPreviewCard";
import { tenGoi } from "@/lib/billing";

const { Title, Text } = Typography;

const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")} đ`;

function HeroStat({
  v,
  l,
  first,
  isMobile,
  href,
}: {
  v: ReactNode;
  l: string;
  first?: boolean;
  isMobile: boolean;
  href?: string;
}) {
  const body = (
    <>
      <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, letterSpacing: -0.5, fontVariantNumeric: "tabular-nums" }}>{v}</div>
      <div style={{ fontSize: 10.5, letterSpacing: 0.5, textTransform: "uppercase", color: "rgba(255,255,255,.8)", fontWeight: 600, marginTop: 2 }}>{l}</div>
    </>
  );
  const style: CSSProperties = {
    flex: "1 1 120px",
    padding: isMobile ? "11px 16px" : "13px 22px",
    borderLeft: first ? "none" : "1px solid rgba(255,255,255,.16)",
    color: "#fff",
  };
  return href ? (
    <Link href={href} style={{ ...style, display: "block" }}>
      {body}
    </Link>
  ) : (
    <div style={style}>{body}</div>
  );
}

function HeroBanner({ isMobile, refreshTick, onRefresh }: { isMobile: boolean; refreshTick: number; onRefresh: () => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const greetingName = user?.name?.trim() || t("home.greetingGuest", "bạn");
  const [stats, setStats] = useState<{ apps: number; builds: number; live: number } | null>(null);
  const [sub, setSub] = useState<MeSubscription | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [apps, builds, live] = await Promise.all([
          api.listApps({ pageSize: 1 }),
          api.listBuilds({ pageSize: 1 }),
          api.listDeployments({ pageSize: 1, status: "live" }),
        ]);
        if (!cancelled) setStats({ apps: apps.total, builds: builds.total, live: live.total });
      } catch {
        if (!cancelled) setStats({ apps: 0, builds: 0, live: 0 });
      }
      try {
        const s = await api.subscription();
        if (!cancelled) setSub(s);
      } catch {
        /* budget cell just hides */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  const dash = stats === null ? "—" : undefined;

  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 20, background: BRAND_GRADIENT, color: "#fff", boxShadow: CARD_SHADOW }}>
      <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 130% at 88% -10%, rgba(255,255,255,.26), transparent 55%)", pointerEvents: "none" }} />
      <div aria-hidden style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,.16) 1px, transparent 1.6px)", backgroundSize: "20px 20px", WebkitMaskImage: "linear-gradient(115deg,#000, transparent 62%)", maskImage: "linear-gradient(115deg,#000, transparent 62%)", pointerEvents: "none" }} />
      <ThunderboltOutlined aria-hidden style={{ position: "absolute", right: -16, bottom: -64, fontSize: 200, color: "rgba(255,255,255,.10)", transform: "rotate(-12deg)", pointerEvents: "none" }} />
      <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, flexWrap: "wrap", padding: isMobile ? "20px 18px 14px" : "24px 28px 18px" }}>
        <div style={{ minWidth: 0, flex: "1 1 340px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 10.5, fontWeight: 700, letterSpacing: 1.3, textTransform: "uppercase", background: "rgba(255,255,255,.16)", padding: "4px 11px", borderRadius: 999 }}>
            <ThunderboltOutlined /> {t("home.dashboard", "Bảng điều khiển")}
          </span>
          <Title level={2} style={{ color: "#fff", margin: isMobile ? "10px 0 4px" : "12px 0 4px", fontWeight: 800, letterSpacing: -0.4, fontSize: isMobile ? 22 : undefined }}>
            {t("home.hello", "Xin chào")}, {greetingName} 👋
          </Title>
          <Text style={{ color: "rgba(255,255,255,.86)", fontSize: isMobile ? 13 : 14.5 }}>
            {t("home.tagline", "Mô tả ý tưởng — Larkwave sinh code, build, preview và deploy ra liên kết công khai.")}
          </Text>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Link href="/">
            <Button size="large" icon={<PlusOutlined />} style={{ background: "#fff", color: BRAND, border: "none", fontWeight: 700, boxShadow: "0 8px 20px rgba(0,0,0,.16)" }}>
              {t("home.createNew", "Tạo app mới")}
            </Button>
          </Link>
          <Link href="/import">
            <Button size="large" ghost icon={<CloudDownloadOutlined />} style={{ borderColor: "rgba(255,255,255,.5)", color: "#fff" }}>
              {t("home.importGit", "Nhập từ Git")}
            </Button>
          </Link>
          <Tooltip title={t("home.refresh", "Làm mới")}>
            <Button type="text" shape="circle" icon={<ReloadOutlined />} onClick={onRefresh} aria-label={t("home.refresh", "Làm mới")} style={{ color: "#fff" }} />
          </Tooltip>
        </div>
      </div>
      <div style={{ position: "relative", display: "flex", flexWrap: "wrap", background: "rgba(255,255,255,.12)", borderTop: "1px solid rgba(255,255,255,.2)", backdropFilter: "blur(6px)" }}>
        <HeroStat first isMobile={isMobile} href="/apps" v={dash ?? stats!.apps} l={t("home.statApps", "Tổng apps")} />
        <HeroStat isMobile={isMobile} href="/apps" v={dash ?? stats!.builds} l={t("home.statBuilds", "Tổng builds")} />
        <HeroStat isMobile={isMobile} href="/apps" v={dash ?? stats!.live} l={t("home.statLive", "Đang live")} />
        {sub && (
          <Link href="/billing" style={{ flex: "1 1 150px", padding: isMobile ? "11px 16px" : "13px 22px", borderLeft: "1px solid rgba(255,255,255,.16)", color: "#fff", display: "block" }}>
            <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, letterSpacing: -0.5, fontVariantNumeric: "tabular-nums", display: "flex", alignItems: "center", gap: 8 }}>
              {sub.unlimited ? "∞" : `${Math.round(sub.percentUsed)}%`}
              {sub.unlimited ? (
                /* Nền tím nên dùng biến thể sắc trắng; mép nhoè để "∞" và thanh nói cùng một điều. */
                <span className="tw-bar-unl tw-bar-onbrand" style={{ flex: 1, maxWidth: 64, height: 5 }}>
                  <i style={{ width: `${Math.min(100, Math.max(8, refPercent(sub.tokensUsed, sub.tokensLimit)))}%` }} />
                </span>
              ) : (
                <span style={{ flex: 1, maxWidth: 64, height: 5, borderRadius: 999, background: "rgba(255,255,255,.25)", overflow: "hidden" }}>
                  <span style={{ display: "block", width: `${Math.min(100, sub.percentUsed)}%`, height: "100%", borderRadius: 999, background: sub.percentUsed >= 100 ? "#FF6B6B" : sub.percentUsed >= 80 ? "#FFC107" : "#fff" }} />
                </span>
              )}
            </div>
            <div style={{ fontSize: 10.5, letterSpacing: 0.5, textTransform: "uppercase", color: "rgba(255,255,255,.8)", fontWeight: 600, marginTop: 2 }}>
              {sub.unlimited
                ? `${formatTokens(sub.tokensUsed)} token · ${tenGoi(t, sub.plan, sub.planLabel)}`
                : `${t("home.budget", "Ngân sách")} · ${tenGoi(t, sub.plan, sub.planLabel)}`}
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}

const QUICK_ACTIONS: { key: string; href: string; icon: ReactNode; color: string; bg: string; label: string; labelKey: string }[] = [
  { key: "agentsChat", href: "/agents-chat", icon: <RobotOutlined />, color: AGENTS, bg: "rgba(37,99,235,0.12)", label: "Agents Chat", labelKey: "nav.agentsChat" },
  { key: "skills", href: "/skills", icon: <ExperimentOutlined />, color: "#16B98D", bg: "rgba(22,185,141,0.14)", label: "Skills", labelKey: "nav.skills" },
  { key: "remote", href: "/remote/chat", icon: <CloudServerOutlined />, color: "#4FB6FF", bg: "rgba(79,182,255,0.16)", label: "Trò chuyện", labelKey: "nav.remote.chat" },
  { key: "explore", href: "/explore", icon: <CompassOutlined />, color: BRAND, bg: "rgba(108,92,231,0.12)", label: "Khám phá", labelKey: "nav.explore" },
  { key: "integrations", href: "/integrations", icon: <ApiOutlined />, color: "#4FB6FF", bg: "rgba(79,182,255,0.16)", label: "Integrations", labelKey: "nav.integrations" },
];

function QuickActions() {
  const { t } = useI18n();
  const { token } = theme.useToken();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
      {QUICK_ACTIONS.map((a) => (
        <Link key={a.key} href={a.href} className="tw-lift" style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "8px 15px 8px 9px", borderRadius: 12, background: token.colorBgContainer, border: `1px solid ${token.colorBorderSecondary}`, boxShadow: CARD_SHADOW, color: token.colorText, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
          <span style={{ display: "inline-flex", width: 30, height: 30, minWidth: 30, borderRadius: 9, alignItems: "center", justifyContent: "center", fontSize: 15, background: a.bg, color: a.color }}>{a.icon}</span>
          {t(a.labelKey, a.label)}
        </Link>
      ))}
    </div>
  );
}

function AttentionBand({ refreshTick }: { refreshTick: number }) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(0);
  const [pendingReward, setPendingReward] = useState(0);
  const [invites, setInvites] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [apps, fb, reqs] = await Promise.allSettled([
        api.listApps({ status: "failed", pageSize: 1 }),
        api.myFeedback(),
        api.friendRequests(),
      ]);
      if (cancelled) return;
      if (apps.status === "fulfilled") setFailed(apps.value.total);
      if (fb.status === "fulfilled") setPendingReward(Math.max(0, fb.value.totalRewardVnd - fb.value.paidRewardVnd));
      if (reqs.status === "fulfilled") setInvites(reqs.value.length);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  const rows: { key: string; icon: ReactNode; color: string; text: string; href: string }[] = [
    ...(failed > 0 ? [{ key: "failed", icon: <WarningOutlined />, color: "#FF6B6B", text: `${failed} ${t("home.attnFailed", "app đang gặp lỗi")}`, href: "/apps" }] : []),
    ...(pendingReward > 0 ? [{ key: "reward", icon: <GiftOutlined />, color: "#16B98D", text: `${t("home.attnReward", "Thưởng báo lỗi chờ chi")}: ${vnd(pendingReward)}`, href: "/reports" }] : []),
    ...(invites > 0 ? [{ key: "invite", icon: <TeamOutlined />, color: "#4FB6FF", text: `${invites} ${t("home.attnInvite", "lời mời kết bạn")}`, href: "/friends" }] : []),
  ];
  if (!rows.length) return null;

  return (
    <Card styles={{ body: { padding: "6px 8px" } }} style={{ borderRadius: 14, border: "1px solid rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.06)", boxShadow: CARD_SHADOW }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px 4px" }}>
        <WarningOutlined style={{ color: "#F59E0B" }} />
        <Text strong style={{ fontSize: 13.5 }}>{t("home.attention", "Cần xử lý")}</Text>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {rows.map((r) => (
          <Link key={r.key} href={r.href} className="tw-lift" style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, color: "inherit" }}>
            <span style={{ color: r.color, fontSize: 15, display: "inline-flex" }}>{r.icon}</span>
            <Text style={{ flex: 1, fontSize: 13 }}>{r.text}</Text>
            <span style={{ fontSize: 12, fontWeight: 600, color: BRAND, whiteSpace: "nowrap" }}>{t("home.view", "Xem")} <ArrowRightOutlined style={{ fontSize: 10 }} /></span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

function RewardsStrip({ refreshTick }: { refreshTick: number }) {
  const { t } = useI18n();
  const [me, setMe] = useState<LeaderboardResponse["me"]>(null);
  const [fb, setFb] = useState<MyFeedbackResponse | null>(null);
  const [invites, setInvites] = useState(0);
  const [referrals, setReferrals] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [lb, f, reqs, ref] = await Promise.allSettled([
        api.leaderboard(1),
        api.myFeedback(),
        api.friendRequests(),
        api.getReferral(),
      ]);
      if (cancelled) return;
      if (lb.status === "fulfilled") setMe(lb.value.me);
      if (f.status === "fulfilled") setFb(f.value);
      if (reqs.status === "fulfilled") setInvites(reqs.value.length);
      if (ref.status === "fulfilled") setReferrals(ref.value.referrals);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  const pendingReward = fb ? Math.max(0, fb.totalRewardVnd - fb.paidRewardVnd) : 0;
  const cards: { key: string; icon: ReactNode; color: string; bg: string; value: string; label: string; hint: string; href: string }[] = [
    ...(me ? [{ key: "xp", icon: <TrophyOutlined />, color: "#F59E0B", bg: "rgba(245,158,11,0.14)", value: me.xp.toLocaleString("vi-VN"), label: t("home.rwXp", "Điểm XP"), hint: `${t("home.rwLevel", "Cấp")} ${me.level} · ${t("home.rwRank", "Hạng")} #${me.rank}`, href: "/profile" }] : []),
    ...(fb ? [{ key: "reports", icon: <BugOutlined />, color: "#FF6B6B", bg: "rgba(255,107,107,0.14)", value: String(fb.totalReports), label: t("home.rwReports", "Báo lỗi hợp lệ"), hint: pendingReward > 0 ? `${t("home.rwRewardPending", "Thưởng chờ")}: ${vnd(pendingReward)}` : `${fb.totalPoints} ${t("home.rwPoints", "điểm")}`, href: "/reports" }] : []),
    ...(invites > 0 ? [{ key: "invite", icon: <TeamOutlined />, color: "#4FB6FF", bg: "rgba(79,182,255,0.16)", value: String(invites), label: t("home.rwInvites", "Lời mời kết bạn"), hint: t("home.rwInvitesHint", "Chờ phản hồi"), href: "/friends" }] : []),
    ...(referrals > 0 ? [{ key: "ref", icon: <GiftOutlined />, color: "#16B98D", bg: "rgba(22,185,141,0.14)", value: String(referrals), label: t("home.rwReferrals", "Đã giới thiệu"), hint: t("home.rwReferralsHint", "Mời bạn → nhận thưởng"), href: "/profile" }] : []),
  ];
  if (!cards.length) return null;

  return (
    <div>
      <Title level={5} style={{ margin: "0 0 14px" }}>{t("home.rewards", "Thưởng & cộng đồng")}</Title>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))", gap: 14 }}>
        {cards.map((c) => (
          <Link key={c.key} href={c.href}>
            <Card className="tw-lift" style={{ boxShadow: CARD_SHADOW, borderRadius: 14, cursor: "pointer" }} styles={{ body: { padding: 16 } }}>
              <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
                <span style={{ display: "inline-flex", width: 44, height: 44, minWidth: 44, borderRadius: 13, alignItems: "center", justifyContent: "center", fontSize: 19, background: c.bg, color: c.color, flexShrink: 0 }}>{c.icon}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{c.value}</div>
                  <Text type="secondary" style={{ fontSize: 12.5, display: "block" }}>{c.label}</Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>{c.hint}</Text>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

function ActivityCard({ refreshTick }: { refreshTick: number }) {
  const { t } = useI18n();
  const [activity, setActivity] = useState<MeActivity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .meActivity(365)
      .then((a) => {
        if (!cancelled) {
          setActivity(a);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  if (!loading && (!activity || activity.total === 0)) return null;

  return (
    <div>
      <Title level={5} style={{ margin: "0 0 14px" }}>{t("home.activity", "Hoạt động")}</Title>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <StreakRow activity={activity} loading={loading} />
        {activity && activity.days.length > 0 && (
          <Card styles={{ body: { padding: 18 } }} style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }}>
            <ContributionGraph days={activity.days} />
          </Card>
        )}
      </div>
    </div>
  );
}

/** "Tiếp tục làm việc" — recent apps grid (desktop parity). */
function RecentAppsGrid() {
  const { t } = useI18n();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [apps, setApps] = useState<AppEntity[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    api.listApps({ pageSize: 6 }).then((r) => { if (!cancelled) setApps(r.items); }).catch(() => { if (!cancelled) setApps([]); });
    return () => { cancelled = true; };
  }, []);
  const handleDeleted = (id: string) => setApps((prev) => (prev ? prev.filter((a) => a.id !== id) : prev));
  const grid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 240px), 1fr))", gap: isMobile ? 12 : 16 };
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <Title level={5} style={{ margin: 0 }}>{t("home.continue", "Tiếp tục làm việc")}</Title>
        <Link href="/apps" style={{ fontWeight: 600 }}>{t("home.viewAll", "Xem tất cả")} <ArrowRightOutlined style={{ fontSize: 11 }} /></Link>
      </div>
      {apps === null ? (
        <div style={grid}>{[0, 1, 2].map((i) => <Card key={i} style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }}><Skeleton active paragraph={{ rows: 2 }} /></Card>)}</div>
      ) : apps.length === 0 ? (
        <Card style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("home.emptyApps", "Chưa có app nào — hãy tạo app đầu tiên!")}>
            <Link href="/"><Button icon={<RocketOutlined />}>{t("home.createNew", "Tạo app mới")}</Button></Link>
          </Empty>
        </Card>
      ) : (
        <div style={grid}>{apps.map((a) => <AppPreviewCard key={a.id} app={a} onDeleted={handleDeleted} />)}</div>
      )}
    </div>
  );
}

/** "Bắt đầu" — web onboarding checklist with a progress ring (the web-native
 *  counterpart of the desktop's CLI/VM "Sức khỏe hệ thống" card). */
function OnboardingCard({ refreshTick }: { refreshTick: number }) {
  const { t } = useI18n();
  const [apps, setApps] = useState<number | null>(null);
  const [live, setLive] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([api.listApps({ pageSize: 1 }), api.listDeployments({ pageSize: 1, status: "live" })]).then(([a, l]) => {
      if (cancelled) return;
      if (a.status === "fulfilled") setApps(a.value.total);
      if (l.status === "fulfilled") setLive(l.value.total);
    });
    return () => { cancelled = true; };
  }, [refreshTick]);
  const steps = [
    { key: "app", label: t("home.obApp", "Tạo app đầu tiên"), done: (apps ?? 0) > 0, href: "/", icon: <ThunderboltOutlined /> },
    { key: "live", label: t("home.obLive", "Deploy 1 app live"), done: (live ?? 0) > 0, href: "/apps", icon: <CloudServerOutlined /> },
    { key: "int", label: t("home.obIntegration", "Kết nối 1 tích hợp"), done: false, href: "/integrations", icon: <ApiOutlined /> },
    { key: "friend", label: t("home.obFriend", "Mời 1 người bạn"), done: false, href: "/friends", icon: <TeamOutlined /> },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);
  return (
    <Card styles={{ body: { padding: 16 } }} style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <Progress type="circle" percent={pct} size={44} strokeColor={BRAND} />
        <div>
          <Text strong style={{ fontSize: 14, display: "block" }}>{t("home.getStarted", "Bắt đầu")}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{doneCount}/{steps.length} {t("home.stepsDone", "bước hoàn tất")}</Text>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {steps.map((s) => (
          <Link key={s.key} href={s.href} className="tw-lift" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 9, color: "inherit" }}>
            <span style={{ color: s.done ? "#16B98D" : "#B7BECC", fontSize: 16, display: "inline-flex" }}>{s.done ? <CheckCircleFilled /> : s.icon}</span>
            <Text style={{ flex: 1, fontSize: 13, textDecoration: s.done ? "line-through" : "none", color: s.done ? "#9AA3B5" : undefined }}>{s.label}</Text>
            {!s.done && <ArrowRightOutlined style={{ fontSize: 10, color: BRAND }} />}
          </Link>
        ))}
      </div>
    </Card>
  );
}

/**
 * Sáu thẻ "Gợi ý bắt đầu" ở trang tổng quan.
 *
 * `catKey`/`titleKey`/`descKey` là khoá dịch; ba chuỗi tiếng Việt giữ nguyên làm chuỗi dự phòng —
 * đúng quy ước t("khoá", "chuỗi Việt") của cả kho, và giống cách QUICK_ACTIONS ở trên đang làm.
 * `prompt` thì KHÔNG dịch: nó là yêu cầu gửi cho bộ sinh code, không phải chữ cho người đọc.
 */
const TEMPLATE_CATS: { cat: string; catKey: string; catColor: string; title: string; titleKey: string; desc: string; descKey: string; prompt: string; track: Track }[] = [
  { cat: "Tasks & Workflows", catKey: "home.tpl.kanbanCat", catColor: "#6C5CE7", title: "Quản lý công việc (Kanban)", titleKey: "home.tpl.kanbanTitle", desc: "Bảng Kanban kéo-thả: Cần làm / Đang làm / Xong.", descKey: "home.tpl.kanbanDesc", prompt: "Dashboard quản lý công việc dạng Kanban kéo thả với các cột Cần làm/Đang làm/Xong", track: "web" },
  { cat: "Content & Sites", catKey: "home.tpl.landingCat", catColor: "#16B98D", title: "Landing page sản phẩm", titleKey: "home.tpl.landingTitle", desc: "Hero, tính năng, bảng giá, form đăng ký.", descKey: "home.tpl.landingDesc", prompt: "Landing page giới thiệu sản phẩm: hero, tính năng, bảng giá, form đăng ký", track: "web" },
  { cat: "CRM & Sales", catKey: "home.tpl.crmCat", catColor: "#F59E0B", title: "CRM khách hàng đơn giản", titleKey: "home.tpl.crmTitle", desc: "Danh sách khách, thêm/sửa, trạng thái phễu.", descKey: "home.tpl.crmDesc", prompt: "CRM khách hàng đơn giản: danh sách khách, thêm/sửa/xoá, trạng thái phễu bán hàng, tìm kiếm", track: "web" },
  { cat: "Finance", catKey: "home.tpl.invoiceCat", catColor: "#4FB6FF", title: "Tạo hoá đơn", titleKey: "home.tpl.invoiceTitle", desc: "Nhập sản phẩm, số lượng, tự tính tổng + thuế.", descKey: "home.tpl.invoiceDesc", prompt: "App tạo hoá đơn: nhập sản phẩm, số lượng, tự tính tổng + thuế, in/xuất hoá đơn", track: "web" },
  { cat: "Booking", catKey: "home.tpl.bookingCat", catColor: "#EC4899", title: "Đặt lịch hẹn", titleKey: "home.tpl.bookingTitle", desc: "Chọn dịch vụ, ngày/giờ trống, xác nhận.", descKey: "home.tpl.bookingDesc", prompt: "App đặt lịch hẹn: chọn dịch vụ, chọn ngày/giờ trống, xác nhận đặt lịch", track: "web" },
  { cat: "Trò chơi", catKey: "home.tpl.gameCat", catColor: "#8B5CF6", title: "Game bắn gạch", titleKey: "home.tpl.gameTitle", desc: "Bóng nảy phá gạch, điểm số, thắng/thua.", descKey: "home.tpl.gameDesc", prompt: "Game bắn gạch: bóng nảy phá gạch, thanh đỡ điều khiển chuột/phím, điểm số, thắng/thua, chơi lại", track: "game" },
];

/** "Gợi ý bắt đầu" — category-labeled starter cards → open the builder prefilled. */
function TemplateCategories() {
  const { t } = useI18n();
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <Title level={5} style={{ margin: 0 }}>{t("home.startSuggest", "Gợi ý bắt đầu")}</Title>
        <Link href="/templates" style={{ fontWeight: 600 }}>{t("home.allTemplates", "Tất cả mẫu")} <ArrowRightOutlined style={{ fontSize: 11 }} /></Link>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 240px), 1fr))", gap: isMobile ? 12 : 14 }}>
        {TEMPLATE_CATS.map((c) => (
          <Card
            key={c.title}
            className="tw-lift"
            style={{ boxShadow: CARD_SHADOW, borderRadius: 14, cursor: "pointer" }}
            styles={{ body: { padding: 16 } }}
            onClick={() => router.push(`/?${c.track !== "web" ? `track=${c.track}&` : ""}prompt=${encodeURIComponent(c.prompt)}`)}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: c.catColor, background: `${c.catColor}18`, padding: "3px 9px", borderRadius: 999 }}>{t(c.catKey, c.cat)}</span>
              <span style={{ fontSize: 11, color: "#9AA3B5" }}>{c.track === "game" ? "Game" : "Web"}</span>
            </div>
            <Text strong style={{ fontSize: 14, display: "block", marginBottom: 4 }}>{t(c.titleKey, c.title)}</Text>
            <Text type="secondary" style={{ fontSize: 12.5, lineHeight: 1.45 }}>{t(c.descKey, c.desc)}</Text>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function HomeDashboard() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const wide = !!screens.xl;
  const [refreshTick, setRefreshTick] = useState(0);

  return (
    <Space direction="vertical" size={isMobile ? 16 : 22} style={{ width: "100%" }}>
      <HeroBanner isMobile={isMobile} refreshTick={refreshTick} onRefresh={() => setRefreshTick((n) => n + 1)} />
      <AttentionBand refreshTick={refreshTick} />
      <QuickActions />
      {wide ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: 22, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 22, minWidth: 0 }}>
            <RecentAppsGrid />
            <RewardsStrip refreshTick={refreshTick} />
            <TemplateCategories />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, position: "sticky", top: 8 }}>
            <OnboardingCard refreshTick={refreshTick} />
            <ActivityCard refreshTick={refreshTick} />
          </div>
        </div>
      ) : (
        <>
          <RecentAppsGrid />
          <OnboardingCard refreshTick={refreshTick} />
          <RewardsStrip refreshTick={refreshTick} />
          <ActivityCard refreshTick={refreshTick} />
          <TemplateCategories />
        </>
      )}
    </Space>
  );
}
