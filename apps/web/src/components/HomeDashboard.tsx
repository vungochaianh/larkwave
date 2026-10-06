"use client";

/**
 * The web "Tổng quan" dashboard — mirrors the desktop Overview (HomeOverview):
 * gradient hero + KPI strip + budget, quick-action chips, an attention band, a
 * rewards/community row and an activity card — centred on the AI assistant, Lark and
 * remote control.
 */

import { ApiOutlined, ArrowRightOutlined, BugOutlined, CheckCircleFilled, CloudServerOutlined, ExperimentOutlined, GiftOutlined, PlusOutlined, ReloadOutlined, RobotOutlined, TeamOutlined, ThunderboltOutlined, WarningOutlined } from "@ant-design/icons";
import { Button, Card, Grid, Progress, Space, theme, Tooltip, Typography } from "antd";
import Link from "next/link";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { MeActivity, MeSubscription, MyFeedbackResponse } from "@larkwave/shared";
import { StreakRow, ContributionGraph, useI18n } from "@larkwave/ui";
import { formatTokens, refPercent } from "@/lib/formatTokens";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { AGENTS, BRAND, BRAND_GRADIENT, CARD_SHADOW } from "@/lib/theme";
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
  const [stats, setStats] = useState<{ aiRuns: number; remoteTasks: number; skills: number } | null>(null);
  const [sub, setSub] = useState<MeSubscription | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ov = await api.meOverview();
        if (!cancelled) setStats({ aiRuns: ov.aiRuns, remoteTasks: ov.remoteTasks, skills: ov.skills });
      } catch {
        if (!cancelled) setStats({ aiRuns: 0, remoteTasks: 0, skills: 0 });
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
            {t("home.tagline.lw", "Hỏi Trợ lý AI, làm việc với dữ liệu Lark và điều khiển máy desktop của bạn — tất cả ở một chỗ.")}
          </Text>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Link href="/agents-chat/new">
            <Button size="large" icon={<PlusOutlined />} style={{ background: "#fff", color: BRAND, border: "none", fontWeight: 700, boxShadow: "0 8px 20px rgba(0,0,0,.16)" }}>
              {t("comp.shell.newChat", "Trò chuyện mới")}
            </Button>
          </Link>
          <Link href="/remote/chat">
            <Button size="large" ghost icon={<CloudServerOutlined />} style={{ borderColor: "rgba(255,255,255,.5)", color: "#fff" }}>
              {t("home.remoteDesktop", "Điều khiển máy desktop")}
            </Button>
          </Link>
          <Tooltip title={t("home.refresh", "Làm mới")}>
            <Button type="text" shape="circle" icon={<ReloadOutlined />} onClick={onRefresh} aria-label={t("home.refresh", "Làm mới")} style={{ color: "#fff" }} />
          </Tooltip>
        </div>
      </div>
      <div style={{ position: "relative", display: "flex", flexWrap: "wrap", background: "rgba(255,255,255,.12)", borderTop: "1px solid rgba(255,255,255,.2)", backdropFilter: "blur(6px)" }}>
        <HeroStat first isMobile={isMobile} href="/agents-chat" v={dash ?? stats!.aiRuns} l={t("home.statAiRuns", "Lượt AI")} />
        <HeroStat isMobile={isMobile} href="/remote/agent" v={dash ?? stats!.remoteTasks} l={t("home.statRemote", "Tác vụ từ xa")} />
        <HeroStat isMobile={isMobile} href="/skills" v={dash ?? stats!.skills} l={t("home.statSkills", "Kỹ năng")} />
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
  { key: "lark", href: "/remote/lark-chat", icon: <ApiOutlined />, color: BRAND, bg: "rgba(108,92,231,0.12)", label: "Lark × Agents", labelKey: "nav.remote.lark" },
  { key: "community", href: "/community", icon: <TeamOutlined />, color: "#4FB6FF", bg: "rgba(79,182,255,0.16)", label: "Cộng đồng", labelKey: "nav.community" },
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
  const [pendingReward, setPendingReward] = useState(0);
  const [invites, setInvites] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [fb, reqs] = await Promise.allSettled([api.myFeedback(), api.friendRequests()]);
      if (cancelled) return;
      if (fb.status === "fulfilled") setPendingReward(Math.max(0, fb.value.totalRewardVnd - fb.value.paidRewardVnd));
      if (reqs.status === "fulfilled") setInvites(reqs.value.length);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  const rows: { key: string; icon: ReactNode; color: string; text: string; href: string }[] = [
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
  const [fb, setFb] = useState<MyFeedbackResponse | null>(null);
  const [invites, setInvites] = useState(0);
  const [referrals, setReferrals] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [f, reqs, ref] = await Promise.allSettled([
        api.myFeedback(),
        api.friendRequests(),
        api.getReferral(),
      ]);
      if (cancelled) return;
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

/** "Bắt đầu" — web onboarding checklist with a progress ring (the web-native
 *  counterpart of the desktop's CLI/VM "Sức khỏe hệ thống" card). */
function OnboardingCard({ refreshTick }: { refreshTick: number }) {
  const { t } = useI18n();
  const [ov, setOv] = useState<{ aiRuns: number; remoteTasks: number; skills: number } | null>(null);
  const [friends, setFriends] = useState(0);
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([api.meOverview(), api.friends()]).then(([o, f]) => {
      if (cancelled) return;
      if (o.status === "fulfilled") setOv({ aiRuns: o.value.aiRuns, remoteTasks: o.value.remoteTasks, skills: o.value.skills });
      if (f.status === "fulfilled") setFriends(f.value.length);
    });
    return () => { cancelled = true; };
  }, [refreshTick]);
  const steps = [
    { key: "chat", label: t("home.obChat", "Trò chuyện với Trợ lý AI"), done: (ov?.aiRuns ?? 0) > 0, href: "/agents-chat/new", icon: <ThunderboltOutlined /> },
    { key: "skill", label: t("home.obSkill", "Tạo kỹ năng đầu tiên"), done: (ov?.skills ?? 0) > 0, href: "/skills", icon: <ExperimentOutlined /> },
    { key: "desktop", label: t("home.obDesktop", "Cài app desktop (Lark × Agents)"), done: (ov?.remoteTasks ?? 0) > 0, href: "/download", icon: <CloudServerOutlined /> },
    { key: "friend", label: t("home.obFriend", "Mời 1 người bạn"), done: friends > 0, href: "/friends", icon: <TeamOutlined /> },
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
            <RewardsStrip refreshTick={refreshTick} />
            <ActivityCard refreshTick={refreshTick} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, position: "sticky", top: 8 }}>
            <OnboardingCard refreshTick={refreshTick} />
          </div>
        </div>
      ) : (
        <>
          <OnboardingCard refreshTick={refreshTick} />
          <RewardsStrip refreshTick={refreshTick} />
          <ActivityCard refreshTick={refreshTick} />
        </>
      )}
    </Space>
  );
}
