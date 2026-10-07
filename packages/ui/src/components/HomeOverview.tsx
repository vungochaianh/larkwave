'use client';
import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { Card, Typography, Button, Tag, Tooltip } from 'antd';
import { PlusOutlined, FieldTimeOutlined, CheckCircleFilled, RobotOutlined, ThunderboltOutlined, CoffeeOutlined, BulbOutlined, ExperimentOutlined, SyncOutlined, ArrowRightOutlined, RightOutlined, ReloadOutlined, DatabaseOutlined, MessageOutlined, PartitionOutlined, ApiOutlined, CloudServerOutlined, FireOutlined, ExclamationCircleFilled, WarningOutlined, TrophyOutlined, TeamOutlined, GiftOutlined } from '@ant-design/icons';
import { useRuntime } from '../RuntimeProvider';
import { V, BRAND, BRAND_GRADIENT, CARD_SHADOW, OK, WARN, ERR, BLUE } from '../theme';
import { HubPeople } from './HubCommunity';
import { FEATURE_FRIENDS } from '../features';
import { PROFILE_PLAN_ANCHOR } from '../account/ProfileView';
import { useAccountAuth } from '../account/auth';
import { accountApi, formatDate, type MeSubscription, type MeActivity, type MeOverview, type Referral } from '../account/api';
import type { View } from './HomeScreen';

const { Title, Text } = Typography;

/** Hover / keyframe rules that inline styles can't express — injected once. */
const OVERVIEW_CSS = `
@keyframes tw-pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
.tw-ql-chip{ transition:transform .14s ease, box-shadow .14s ease, border-color .14s ease; }
.tw-ql-chip:hover{ transform:translateY(-2px); box-shadow:0 10px 26px rgba(17,24,39,.12); border-color:${BRAND}66; }
.tw-recent-card{ transition:transform .15s ease, box-shadow .15s ease; }
.tw-recent-card:hover{ transform:translateY(-2px); box-shadow:0 12px 30px rgba(17,24,39,.14); }
.tw-recent-card:hover .tw-recent-play{ opacity:1; }
.tw-tpl-card{ transition:transform .15s ease, box-shadow .15s ease; }
.tw-tpl-card:hover{ transform:translateY(-2px); box-shadow:0 8px 20px rgba(17,24,39,.10); }
.tw-tpl-card:hover .tw-tpl-arrow{ transform:translateX(3px); color:${BRAND}; }
.tw-stat-card{ transition:transform .14s ease, box-shadow .14s ease; }
.tw-stat-card:hover{ transform:translateY(-2px); box-shadow:0 10px 24px rgba(17,24,39,.12); }
.tw-health-row{ transition:background .12s ease; }
.tw-health-row:hover{ background:${V.surfaceAlt}; }
.tw-attn-row{ transition:background .12s ease; }
.tw-attn-row:hover{ background:${V.surfaceAlt}; }
`;

const NUM: CSSProperties = { fontVariantNumeric: 'tabular-nums', letterSpacing: -0.5, fontWeight: 800, color: V.text, lineHeight: 1.1 };
const MICRO: CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: V.textSub };


function IconTile({ icon, color, size = 26, radius = 9, fontSize = 14 }: { icon: ReactNode; color: string; size?: number; radius?: number; fontSize?: number }) {
  return (
    <span style={{ display: 'inline-flex', width: size, height: size, minWidth: size, borderRadius: radius, alignItems: 'center', justifyContent: 'center', color, background: `${color}1f`, fontSize }}>
      {icon}
    </span>
  );
}
function SectionHeader({ icon, color, title, actionLabel, onAction }: { icon: ReactNode; color: string; title: string; actionLabel?: string; onAction?: () => void }) {
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

/**
 * "Tổng quan" — the cross-product HUB. Aggregates every pillar: a gradient hero with a live
 * stat strip incl. the token-budget meter; a "Cần xử lý" attention band (problems across
 * Lark/CMS/rewards); a rewards & community strip; and an instrument rail (system-health ring +
 * Lark/CMS state + real AI activity from the account API). Everything is feature-gated +
 * alive-guarded and deep-links to its screen.
 */
export function HomeOverview({
  onNav,
  cmsAllowed,
  displayName,
}: {
  onNav?: (v: View) => void;
  cmsAllowed?: boolean;
  displayName?: string;
}) {
  const runtime = useRuntime();
  const { user } = useAccountAuth();

  // ── responsive ──────────────────────────────────────────────────────────
  const rootRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(1200);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => setW(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const wide = w >= 960;
  const [runnersReady, setRunnersReady] = useState<number | null>(null);
  const [runnersTotal, setRunnersTotal] = useState<number>(0);
  const [refreshTick, setRefreshTick] = useState(0);
  useEffect(() => {
    let alive = true;
    if (runtime.runners) {
      runtime.runners.list().then((l) => { if (alive) { setRunnersReady(l.filter((r) => r.ready).length); setRunnersTotal(l.length); } }).catch(() => alive && setRunnersReady(0));
    } else if (alive) { setRunnersReady(0); setRunnersTotal(0); } // no runners on this host → don't spin forever
    return () => { alive = false; };
  }, [runtime, refreshTick]);

  // ── Lark ──────────────────────────────────────────────────────────────────
  const hasLark = !!runtime.larkStatus;
  const [lark, setLark] = useState<{ connected: boolean; apiMode?: boolean; bases?: number; sessions?: number; autos?: number } | null>(null);
  const [larkLoading, setLarkLoading] = useState(hasLark);
  useEffect(() => {
    if (!hasLark) return;
    let alive = true;
    (async () => {
      try {
        const st = await runtime.larkStatus!();
        const [bases, sessions, autos] = await Promise.all([
          runtime.larkListBases?.().then((b) => b.length).catch(() => undefined),
          runtime.larkSessions?.().then((s) => s.length).catch(() => undefined),
          runtime.larkListAutomations?.().then((a) => a.length).catch(() => undefined),
        ]);
        if (alive) setLark({ connected: !!st?.connected, apiMode: !!st?.apiMode, bases, sessions, autos });
      } catch { if (alive) setLark({ connected: false }); }
      finally { if (alive) setLarkLoading(false); }
    })();
    return () => { alive = false; };
  }, [hasLark, runtime, refreshTick]);

  // ── CMS sync ────────────────────────────────────────────────────────────────
  const hasCms = !!cmsAllowed && !!runtime.cmsSyncListJobs;
  const [cms, setCms] = useState<{ jobs: number; enabled: number; errored: number; keeperOnline?: boolean } | null>(null);
  useEffect(() => {
    if (!hasCms) return;
    let alive = true;
    (async () => {
      try {
        const jobs = (await runtime.cmsSyncListJobs!().catch(() => [])) as { enabled?: boolean; lastSyncStatus?: string; lastSyncError?: string }[];
        const ks = await runtime.cmsSyncKeeperStatus?.().catch(() => undefined);
        if (alive) setCms({
          jobs: jobs.length,
          enabled: jobs.filter((j) => j.enabled !== false).length,
          errored: jobs.filter((j) => j.lastSyncStatus === 'error' || !!j.lastSyncError).length,
          keeperOnline: ks?.online,
        });
      } catch { if (alive) setCms({ jobs: 0, enabled: 0, errored: 0 }); }
    })();
    return () => { alive = false; };
  }, [hasCms, runtime]);

  // ── account universe (the aggregation that was missing) ───────────────────
  const [sub, setSub] = useState<MeSubscription | null>(null);
  const [act, setAct] = useState<MeActivity | null>(null);
  const [ov, setOv] = useState<MeOverview | null>(null);
  const [reqIn, setReqIn] = useState<number>(0);
  const [ref, setRef] = useState<Referral | null>(null);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    accountApi.subscription().then((v) => alive && setSub(v)).catch(() => {});
    accountApi.meActivity(365).then((v) => alive && setAct(v)).catch(() => {});
    accountApi.meOverview().then((v) => alive && setOv(v)).catch(() => {});
    // Bạn bè tạm ẩn (FEATURE_FRIENDS) → không có lời mời nào để nhắc.
    if (FEATURE_FRIENDS) accountApi.friendRequests().then((v) => alive && setReqIn(v.filter((r) => r.direction === 'incoming').length)).catch(() => {});
    accountApi.getReferral().then((v) => alive && setRef(v)).catch(() => {});
    return () => { alive = false; };
    // key on user.id (not the object): useAccountAuth mints a new User on every window
    // focus-refresh, which would otherwise re-fire all 6 calls needlessly.
  }, [user?.id, refreshTick]);

  // ── derived ────────────────────────────────────────────────────────────────
  const hr = new Date().getHours();
  const greeting = hr < 11 ? 'Chào buổi sáng' : hr < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  const greetIcon = hr < 11 ? <CoffeeOutlined /> : hr < 18 ? <ThunderboltOutlined /> : <BulbOutlined />;
  const nav = (v: View) => onNav?.(v);
  // Gói & hạn mức nằm trong Hồ sơ (không còn màn "Gói & Thanh toán" riêng): mở Hồ sơ rồi cuộn tới phần gói.
  const goPlan = () => {
    nav('profile');
    setTimeout(() => document.getElementById(PROFILE_PLAN_ANCHOR)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
  };

  // real 7-day AI activity from the account API
  const bars: { count: number; label: string }[] = act
    ? act.days.slice(-7).map((d) => ({ count: d.count, label: weekdayLabel(Date.parse(d.date + 'T00:00:00')) }))
    : [];
  const weekTotal = bars.reduce((s, b) => s + b.count, 0);
  const maxBar = Math.max(1, ...bars.map((b) => b.count));

  // ── health rows ─────────────────────────────────────────────────────────────
  type HealthRow = { key: string; icon: ReactNode; label: string; done: boolean; loading: boolean; sub: string; cta: string; onClick: () => void };
  const healthRows: HealthRow[] = [
    { key: 'ai', icon: <RobotOutlined />, label: 'Trình AI (CLI)', loading: runnersReady === null, done: (runnersReady ?? 0) > 0, sub: (runnersReady ?? 0) > 0 ? `${runnersReady}/${runnersTotal} CLI sẵn sàng` : 'Chưa kết nối AI nào', cta: 'Kết nối', onClick: () => nav('settings') },
    ...(hasLark ? [{ key: 'lark', icon: <ApiOutlined />, label: 'Lark', loading: lark === null, done: !!lark?.connected, sub: lark?.connected ? (lark.apiMode ? 'API trực tiếp' : 'Phiên web đang hoạt động') : 'Chưa kết nối', cta: 'Kết nối', onClick: () => nav('lark') } as HealthRow] : []),
    ...(hasCms ? [{ key: 'keeper', icon: <CloudServerOutlined />, label: 'Máy VM giữ phiên', loading: cms === null, done: !!cms?.keeperOnline, sub: cms?.keeperOnline ? 'Đang chạy 24/7' : 'Ngoại tuyến', cta: 'Mở', onClick: () => nav('cms-sync') } as HealthRow] : []),
    ...(user ? [{ key: 'skill', icon: <ExperimentOutlined />, label: 'Kỹ năng đầu tiên', loading: ov === null, done: (ov?.skills ?? 0) > 0, sub: (ov?.skills ?? 0) > 0 ? `${ov?.skills} kỹ năng` : 'Chưa có kỹ năng nào', cta: 'Tạo', onClick: () => nav('skills') } as HealthRow] : []),
  ];
  const healthDone = healthRows.filter((r) => r.done).length;
  const healthTotal = healthRows.length;

  // ── attention band (problems that need action, aggregated across pillars) ──
  type Alert = { key: string; color: string; icon: ReactNode; text: string; cta: string; onClick: () => void };
  const alerts: Alert[] = [
    ...(hasCms && cms && cms.errored > 0 ? [{ key: 'cmsjob', color: ERR, icon: <SyncOutlined />, text: `${cms.errored} job đồng bộ CMS lỗi`, cta: 'Mở', onClick: () => nav('cms-sync') } as Alert] : []),
    ...(hasCms && cms && cms.keeperOnline === false ? [{ key: 'keeper', color: WARN, icon: <CloudServerOutlined />, text: 'Máy VM giữ phiên đang ngoại tuyến', cta: 'Mở', onClick: () => nav('cms-sync') } as Alert] : []),
    ...(hasLark && lark && !lark.connected ? [{ key: 'lark', color: WARN, icon: <ApiOutlined />, text: 'Lark chưa kết nối', cta: 'Kết nối', onClick: () => nav('lark') } as Alert] : []),
    ...(FEATURE_FRIENDS && reqIn > 0 ? [{ key: 'invite', color: BLUE, icon: <TeamOutlined />, text: `${reqIn} lời mời kết bạn`, cta: 'Xem', onClick: () => nav('profile') } as Alert] : []),
  ];

  // ── quick-launch chips ──────────────────────────────────────────────────────
  type QA = { key: string; icon: ReactNode; color: string; title: string; onClick: () => void };
  const chips: QA[] = [
    ...(runtime.kind !== 'desktop' ? [{ key: 'agents', icon: <MessageOutlined />, color: BRAND, title: 'Trợ lý AI', onClick: () => nav('agents') } as QA] : []),
    { key: 'skills', icon: <ExperimentOutlined />, color: WARN, title: 'Kỹ năng', onClick: () => nav('skills') },
    ...(hasLark ? [{ key: 'lark', icon: <RobotOutlined />, color: BLUE, title: 'Lark × Agents', onClick: () => nav('lark') } as QA] : []),
    ...(hasLark ? [{ key: 'spec', icon: <PartitionOutlined />, color: BRAND, title: 'Đặc tả', onClick: () => nav('spec') } as QA] : []),
    ...(hasCms ? [{ key: 'cms', icon: <SyncOutlined />, color: OK, title: 'Đồng bộ CMS', onClick: () => nav('cms-sync') } as QA] : []),
    ...(FEATURE_FRIENDS ? [{ key: 'friends', icon: <TeamOutlined />, color: BLUE, title: 'Bạn bè', onClick: () => nav('friends') } as QA] : []),
  ];

  // ── rewards & community tiles ────────────────────────────────────────────────
  type Reward = { key: string; icon: ReactNode; color: string; value: ReactNode; label: string; hint?: string; onClick: () => void };
  const rewards: Reward[] = [
    // Thẻ "Báo lỗi hợp lệ / điểm / thưởng chờ" bỏ cùng chương trình thưởng báo lỗi (07/10/2026).
    ...(FEATURE_FRIENDS && reqIn > 0 ? [{ key: 'invite', icon: <TeamOutlined />, color: BLUE, value: reqIn, label: 'Lời mời kết bạn', hint: 'Chờ phản hồi', onClick: () => nav('profile') } as Reward] : []),
    ...(ref ? [{ key: 'ref', icon: <GiftOutlined />, color: OK, value: ref.referrals, label: 'Đã giới thiệu', hint: 'Mời bạn → nhận thưởng', onClick: () => nav('profile') } as Reward] : []),
  ];

  const budgetColor = sub ? (sub.percentUsed >= 100 ? ERR : sub.percentUsed >= 80 ? WARN : '#fff') : '#fff';

  // ═══════════════════════ modules ═══════════════════════

  const heroEl = (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 20, background: BRAND_GRADIENT, color: '#fff', boxShadow: CARD_SHADOW }}>
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 130% at 88% -10%, rgba(255,255,255,.26), transparent 55%)', pointerEvents: 'none' }} />
      <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,.16) 1px, transparent 1.6px)', backgroundSize: '20px 20px', WebkitMaskImage: 'linear-gradient(115deg,#000, transparent 62%)', maskImage: 'linear-gradient(115deg,#000, transparent 62%)', pointerEvents: 'none' }} />
      <ThunderboltOutlined aria-hidden style={{ position: 'absolute', right: -16, bottom: -68, fontSize: 220, color: 'rgba(255,255,255,.10)', transform: 'rotate(-12deg)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, flexWrap: 'wrap', padding: '24px 28px 18px' }}>
        <div style={{ minWidth: 0, flex: '1 1 340px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 10.5, fontWeight: 700, letterSpacing: 1.3, textTransform: 'uppercase', background: 'rgba(255,255,255,.16)', padding: '4px 11px', borderRadius: 999 }}>
            {greetIcon} Bảng điều khiển
          </span>
          <Title level={2} style={{ color: '#fff', margin: '12px 0 4px', fontWeight: 800, letterSpacing: -0.4 }}>{greeting}{displayName ? `, ${displayName}` : ''}</Title>
          <Text style={{ color: 'rgba(255,255,255,.86)', fontSize: 14.5 }}>Hỏi AI về dữ liệu Lark của bạn — Bitable, Docs, Sheets, Lịch, tin nhắn — và tự động hoá cùng một chỗ.</Text>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {runtime.larkChat && (
            <Button size="large" icon={<PlusOutlined />} onClick={() => nav(runtime.kind === 'desktop' ? 'lark' : 'agents')} style={{ background: '#fff', color: BRAND, border: 'none', fontWeight: 700, boxShadow: '0 8px 20px rgba(0,0,0,.16)' }}>Trò chuyện mới</Button>
          )}
          {hasLark && <Button size="large" ghost icon={<FieldTimeOutlined />} onClick={() => nav('lark-auto')} style={{ borderColor: 'rgba(255,255,255,.5)', color: '#fff' }}>Tự động hoá</Button>}
          <Tooltip title="Làm mới">
            <Button type="text" shape="circle" icon={<ReloadOutlined />} onClick={() => setRefreshTick((n) => n + 1)} style={{ color: '#fff' }} aria-label="Làm mới" />
          </Tooltip>
        </div>
      </div>
      {/* integrated stat strip */}
      <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', background: 'rgba(255,255,255,.12)', borderTop: '1px solid rgba(255,255,255,.2)', backdropFilter: 'blur(6px)' }}>
        <HeroStat v={hasLark ? (larkLoading ? '—' : (lark?.bases ?? 0)) : '—'} l="Bases" dot={lark?.connected ? OK : undefined} onClick={() => nav('lark')} />
        <HeroStat v={hasLark ? (larkLoading ? '—' : (lark?.sessions ?? 0)) : '—'} l="Hội thoại" onClick={() => nav('lark')} />
        <HeroStat v={hasLark ? (larkLoading ? '—' : (lark?.autos ?? 0)) : '—'} l="Tự động" onClick={() => nav('lark-auto')} />
        <HeroStat v={runnersReady === null ? '—' : <>{runnersReady}<span style={{ fontSize: 14, opacity: .7, fontWeight: 600 }}>/{runnersTotal}</span></>} l="AI sẵn sàng" onClick={() => nav('settings')} />
        {sub ? (
          <Tooltip title={sub.resetAt ? `Ngân sách token làm mới ${formatDate(sub.resetAt)}` : 'Ngân sách token theo gói'}>
          <div onClick={goPlan} style={{ flex: '1 1 150px', padding: '13px 20px', borderLeft: '1px solid rgba(255,255,255,.14)', cursor: 'pointer' }}>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums', display: 'flex', alignItems: 'center', gap: 8 }}>
              {sub.unlimited ? '∞' : `${Math.round(sub.percentUsed)}%`}
              {!sub.unlimited && (
                <span style={{ flex: 1, maxWidth: 70, height: 5, borderRadius: 999, background: 'rgba(255,255,255,.25)', overflow: 'hidden' }}>
                  <span style={{ display: 'block', width: `${Math.min(100, sub.percentUsed)}%`, height: '100%', background: budgetColor === '#fff' ? '#fff' : budgetColor, borderRadius: 999 }} />
                </span>
              )}
            </div>
            <div style={{ fontSize: 10.5, letterSpacing: .5, textTransform: 'uppercase', color: 'rgba(255,255,255,.78)', fontWeight: 600, marginTop: 2 }}>Ngân sách · {sub.planLabel}</div>
          </div>
          </Tooltip>
        ) : (
          <HeroStat v={hasLark ? (lark?.connected ? 'ON' : '—') : '—'} l="Ngân sách" />
        )}
      </div>
    </div>
  );

  const attnCount = alerts.length;
  const attnEl = attnCount ? (
    <Card styles={{ body: { padding: '8px 10px' } }} style={{ borderRadius: 14, border: `1px solid ${WARN}55`, background: `${WARN}0f`, boxShadow: CARD_SHADOW }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px 4px' }}>
        <WarningOutlined style={{ color: WARN }} />
        <Text strong style={{ fontSize: 13.5 }}>Cần xử lý</Text>
        <Tag bordered={false} style={{ margin: 0, background: `${WARN}22`, color: WARN, fontWeight: 700 }}>{attnCount}</Tag>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {alerts.map((a) => (
          <div key={a.key} className="tw-attn-row" onClick={a.onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 10, cursor: 'pointer' }}>
            <span style={{ color: a.color, fontSize: 15, display: 'inline-flex' }}>{a.icon}</span>
            <Text style={{ flex: 1, fontSize: 13, color: V.text }}>{a.text}</Text>
            <Button type="link" size="small" style={{ padding: 0 }}>{a.cta} <RightOutlined style={{ fontSize: 10 }} /></Button>
          </div>
        ))}
      </div>
    </Card>
  ) : null;

  const chipsEl = (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {chips.map((c) => (
        <div key={c.key} className="tw-ql-chip" onClick={c.onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '9px 14px 9px 10px', borderRadius: 11, background: V.surface, border: `1px solid ${V.border}`, boxShadow: CARD_SHADOW, cursor: 'pointer', fontWeight: 600, fontSize: 13.5, color: V.text }}>
          <IconTile icon={c.icon} color={c.color} size={30} radius={8} fontSize={16} /> {c.title}
        </div>
      ))}
    </div>
  );

  const rewardsEl = rewards.length ? (
    <div>
      <SectionHeader icon={<TrophyOutlined />} color={WARN} title="Thưởng & cộng đồng" actionLabel="Hồ sơ" onAction={() => nav('profile')} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px,1fr))', gap: 12 }}>
        {rewards.map((r) => (
          <Card key={r.key} hoverable className="tw-stat-card" onClick={r.onClick} styles={{ body: { padding: 14 } }} style={{ borderRadius: 14, cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <IconTile icon={r.icon} color={r.color} size={38} radius={11} fontSize={17} />
              <div style={{ minWidth: 0 }}>
                <div style={{ ...NUM, fontSize: 22 }}>{r.value}</div>
                <div style={MICRO}>{r.label}</div>
              </div>
            </div>
            {r.hint && <div style={{ fontSize: 12, color: V.textFaint, marginTop: 8 }}>{r.hint}</div>}
          </Card>
        ))}
      </div>
    </div>
  ) : null;

  const healthEl = (
    <Card styles={{ body: { padding: '16px 8px 8px' } }} style={{ borderRadius: 16, border: `1px solid ${V.border}`, boxShadow: CARD_SHADOW }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 8px 12px' }}>
        <HealthRing done={healthDone} total={healthTotal} />
        <div style={{ minWidth: 0 }}>
          <Title level={5} style={{ margin: 0 }}>Sức khỏe hệ thống</Title>
          <Text style={{ color: V.textSub, fontSize: 12.5 }}>{healthDone}/{healthTotal} mục đã sẵn sàng</Text>
        </div>
      </div>
      <div>
        {healthRows.map((r, i) => {
          const color = r.loading ? V.textFaint : r.done ? OK : WARN;
          return (
            <div key={r.key} className="tw-health-row" onClick={r.onClick} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 12, cursor: 'pointer', borderBottom: i < healthRows.length - 1 ? `1px solid ${V.borderSub}` : 'none' }}>
              <span aria-hidden style={{ width: 9, height: 9, minWidth: 9, borderRadius: '50%', background: color, boxShadow: `0 0 0 4px ${color}22` }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: V.text, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ color: V.textFaint, fontSize: 13 }}>{r.icon}</span>{r.label}
                </div>
                {r.loading ? <div style={{ width: 90, height: 11, borderRadius: 5, background: V.surfaceMuted, marginTop: 5 }} /> : <Text style={{ color: V.textFaint, fontSize: 12 }}>{r.sub}</Text>}
              </div>
              {!r.loading && !r.done ? <Button type="link" size="small" style={{ padding: 0 }}>{r.cta} <RightOutlined style={{ fontSize: 10 }} /></Button> : <RightOutlined style={{ color: V.textFaint, fontSize: 11 }} />}
            </div>
          );
        })}
      </div>
    </Card>
  );

  const pillarEl = (hasLark || hasCms) ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {hasLark && (
        <Card hoverable size="small" onClick={() => nav('lark')} styles={{ body: { padding: 16 } }} style={{ borderRadius: 16, cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <IconTile icon={<RobotOutlined />} color={BLUE} />
            <Text strong style={{ flex: 1 }}>Lark × Agents</Text>
            <StatusPill on={!!lark?.connected} onWord="Đã kết nối" offWord="Chưa kết nối" />
          </div>
          <MiniStats loading={larkLoading} items={[
            { icon: <DatabaseOutlined />, value: lark?.bases, label: 'Bases' },
            { icon: <MessageOutlined />, value: lark?.sessions, label: 'Hội thoại' },
            { icon: <PartitionOutlined />, value: lark?.autos, label: 'Tự động' },
          ]} />
        </Card>
      )}
      {hasCms && (
        <Card hoverable size="small" onClick={() => nav('cms-sync')} styles={{ body: { padding: 16 } }} style={{ borderRadius: 16, cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <IconTile icon={<SyncOutlined />} color={OK} />
            <Text strong style={{ flex: 1 }}>Đồng bộ CMS</Text>
            <StatusPill on={!!cms?.keeperOnline} onWord="VM đang chạy" offWord="Ngoại tuyến" icon={<CloudServerOutlined />} />
          </div>
          <MiniStats loading={cms === null} items={[
            { icon: <SyncOutlined />, value: cms?.jobs, label: 'Job' },
            { icon: <CheckCircleFilled />, value: cms?.enabled, label: 'Đang bật', color: (cms?.enabled ?? 0) > 0 ? OK : undefined },
            ...(cms && cms.errored > 0 ? [{ icon: <ExclamationCircleFilled />, value: cms.errored, label: 'Lỗi', color: ERR }] : []),
          ]} />
        </Card>
      )}
    </div>
  ) : null;

  const activityEl = (
    <Card styles={{ body: { padding: 16 } }} style={{ borderRadius: 16, border: `1px solid ${V.border}`, boxShadow: CARD_SHADOW }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <IconTile icon={<FireOutlined />} color={WARN} />
        <Title level={5} style={{ margin: 0, flex: 1 }}>Hoạt động</Title>
        {act && act.currentStreak > 0 && <Tag bordered={false} style={{ margin: 0, background: `${WARN}1f`, color: WARN, fontWeight: 700 }}>chuỗi {act.currentStreak} ngày</Tag>}
      </div>
      {weekTotal === 0 ? (
        <Text style={{ color: V.textFaint, fontSize: 13 }}>Chưa có hoạt động trong tuần này.</Text>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 52, borderBottom: `1px solid ${V.borderSub}`, paddingBottom: 4 }}>
          {bars.map((b, i) => (
            <Tooltip key={i} title={`${b.count} lượt AI · ${i === bars.length - 1 ? 'hôm nay' : b.label}`}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ width: '100%', height: Math.max(4, Math.round(40 * b.count / maxBar)), background: BRAND, opacity: i === bars.length - 1 ? 1 : 0.45, borderRadius: '4px 4px 0 0' }} />
                <span style={{ fontSize: 10, color: i === bars.length - 1 ? BRAND : V.textFaint, fontWeight: i === bars.length - 1 ? 600 : 400 }}>{i === bars.length - 1 ? 'T.nay' : b.label}</span>
              </div>
            </Tooltip>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        {[
          { v: ov ? ov.aiRuns : weekTotal, l: ov ? 'lượt AI' : 'lượt/tuần' },
          { v: ov ? ov.remoteTasks : '—', l: 'tác vụ từ xa' },
          { v: ov ? ov.artifacts : '—', l: 'artifacts' },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, borderLeft: i ? `1px solid ${V.borderSub}` : 'none', paddingLeft: i ? 12 : 0 }}>
            <div style={{ ...NUM, fontSize: 20 }}>{s.v}</div>
            <div style={MICRO}>{s.l}</div>
          </div>
        ))}
      </div>
    </Card>
  );

  // ═══════════════════════ layout ═══════════════════════
  return (
    <div ref={rootRef} style={{ display: 'flex', flexDirection: 'column', gap: 18, width: '100%' }}>
      <style>{OVERVIEW_CSS}</style>
      {heroEl}
      {attnEl}
      {chipsEl}
      {wide ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 16, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            {pillarEl}
            {rewardsEl}
            {activityEl}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 8 }}>
            {healthEl}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {healthEl}
          {pillarEl}
          {rewardsEl}
          {activityEl}
        </div>
      )}
      {/* Cộng đồng — gợi ý kết bạn + lời mời. Toàn bộ là Bạn bè → ẩn theo FEATURE_FRIENDS. */}
      {user && FEATURE_FRIENDS && <HubPeople />}
    </div>
  );
}

function HeroStat({ v, l, dot, onClick }: { v: ReactNode; l: string; dot?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} style={{ flex: '1 1 120px', padding: '13px 20px', borderLeft: '1px solid rgba(255,255,255,.14)', cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums', display: 'flex', alignItems: 'center', gap: 7 }}>
        {dot && <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot }} />}{v}
      </div>
      <div style={{ fontSize: 10.5, letterSpacing: .5, textTransform: 'uppercase', color: 'rgba(255,255,255,.78)', fontWeight: 600, marginTop: 2 }}>{l}</div>
    </div>
  );
}

function weekdayLabel(ms: number): string {
  const names = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? '' : names[d.getDay()];
}

function HealthRing({ done, total }: { done: number; total: number }) {
  const R = 19.5;
  const C = 2 * Math.PI * R;
  const frac = total ? done / total : 0;
  const full = done === total && total > 0;
  const stroke = full ? BRAND : OK;
  return (
    <div style={{ position: 'relative', width: 44, height: 44 }}>
      <svg width={44} height={44} viewBox="0 0 44 44">
        <circle cx={22} cy={22} r={R} fill="none" stroke={V.borderSub} strokeWidth={5} />
        <g transform="rotate(-90 22 22)">
          <circle cx={22} cy={22} r={R} fill="none" stroke={stroke} strokeWidth={5} strokeLinecap="round" strokeDasharray={`${(C * frac).toFixed(2)} ${C.toFixed(2)}`} />
        </g>
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, ...NUM }}>
        {full ? <CheckCircleFilled style={{ color: OK, fontSize: 16 }} /> : done}
      </div>
    </div>
  );
}

function StatusPill({ on, onWord, offWord, icon }: { on: boolean; onWord: string; offWord: string; icon?: ReactNode }) {
  const color = on ? OK : ERR;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color, fontWeight: 600 }}>
      {icon && <span style={{ fontSize: 12 }}>{icon}</span>}
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      {on ? onWord : offWord}
    </span>
  );
}

function MiniStats({ items, loading }: { items: { icon: ReactNode; value?: number | string; label: string; color?: string }[]; loading?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {items.map((it, i) => (
        <div key={i} style={{ flex: 1, borderLeft: i ? `1px solid ${V.borderSub}` : 'none', paddingLeft: i ? 12 : 0 }}>
          <div style={{ ...NUM, fontSize: 18, color: it.color || V.text }}>{loading ? '—' : (it.value ?? 0)}</div>
          <div style={MICRO}><span style={{ marginRight: 4 }}>{it.icon}</span>{it.label}</div>
        </div>
      ))}
    </div>
  );
}
