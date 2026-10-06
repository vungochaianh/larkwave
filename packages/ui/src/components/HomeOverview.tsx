'use client';
import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { Card, Typography, Button, Input, Tag, Tooltip } from 'antd';
import {
  PlusOutlined,
  FolderOpenOutlined,
  AppstoreAddOutlined,
  CheckCircleFilled,
  RobotOutlined,
  ThunderboltOutlined,
  CoffeeOutlined,
  BulbOutlined,
  CloudDownloadOutlined,
  ExperimentOutlined,
  SyncOutlined,
  HistoryOutlined,
  ArrowRightOutlined,
  RightOutlined,
  CaretRightOutlined,
  GlobalOutlined,
  MobileOutlined,
  ChromeOutlined,
  RocketOutlined,
  ReloadOutlined,
  DatabaseOutlined,
  MessageOutlined,
  PartitionOutlined,
  ApiOutlined,
  CloudServerOutlined,
  FireOutlined,
  EditOutlined,
  ExclamationCircleFilled,
  WarningOutlined,
  TrophyOutlined,
  BugOutlined,
  TeamOutlined,
  GiftOutlined,
} from '@ant-design/icons';
import type { AppSummary, PromptTemplate } from '@larkwave/core';
import { useRuntime } from '../RuntimeProvider';
import { V, BRAND, BRAND_GRADIENT, CARD_SHADOW, OK, WARN, ERR, BLUE } from '../theme';
import { AppThumb } from './AppThumb';
import { HubLeaderboard, HubPeople } from './HubCommunity';
import { AttentionApps } from './AttentionApps';
import { useAccountAuth } from '../account/auth';
import { accountApi, formatDate, type MeSubscription, type MeActivity, type MeOverview, type MyFeedbackResponse, type LeaderboardEntry, type Referral } from '../account/api';
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

function hostOf(url?: string): string {
  if (!url) return '';
  try { return new URL(url).host; } catch { return ''; }
}
function relTime(iso?: string): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.floor(h / 24)} ngày trước`;
}
function vnd(n: number): string { return n.toLocaleString('vi-VN') + 'đ'; }

type Status = { color: string; icon: ReactNode; word: string };
function statusMeta(s?: string): Status {
  const k = (s || '').toLowerCase();
  if (k === 'live') return { color: OK, icon: <CheckCircleFilled />, word: 'Đang chạy' };
  if (k === 'ready') return { color: OK, icon: <CheckCircleFilled />, word: 'Sẵn sàng' };
  if (k === 'building' || k === 'deploying') return { color: WARN, icon: <SyncOutlined spin />, word: 'Đang dựng' };
  if (k === 'error' || k === 'failed') return { color: ERR, icon: <ExclamationCircleFilled />, word: 'Lỗi' };
  return { color: V.textFaint, icon: <EditOutlined />, word: 'Nháp' };
}
function trackMeta(t?: string): { icon: ReactNode; label: string } | null {
  if (t === 'mobile') return { icon: <MobileOutlined />, label: 'Mobile' };
  if (t === 'extension') return { icon: <ChromeOutlined />, label: 'Tiện ích' };
  if (t === 'web') return { icon: <GlobalOutlined />, label: 'Web' };
  return null;
}

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

const SHOT_BATCH = 5;

/**
 * "Tổng quan" — the cross-product HUB. Aggregates every pillar: a gradient hero with a live
 * stat strip incl. the token-budget meter; a "Cần xử lý" attention band (problems across
 * apps/Lark/CMS/rewards); recent apps (uniform covers); a rewards & community strip; and an
 * instrument rail (system-health ring + Lark/CMS state + real contribution activity from the
 * account API). Everything is feature-gated + alive-guarded and deep-links to its screen.
 */
export function HomeOverview({
  onNav,
  onCreate,
  onOpenApp,
  onUseTemplate,
  onBrowseTemplates,
  onImportFolder,
  onImportGit,
  cmsAllowed,
  displayName,
}: {
  onNav?: (v: View) => void;
  onCreate?: () => void;
  onOpenApp?: (app: AppSummary) => void;
  onUseTemplate?: (prompt: string) => void;
  onBrowseTemplates?: () => void;
  onImportFolder?: () => void;
  onImportGit?: () => void;
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
  const [showErr, setShowErr] = useState(false); // expand the error-apps cards in "Cần xử lý"
  // Quick-create bar (mirrors the web home's landing composer): type an idea →
  // hand off to the full builder (onUseTemplate fills the draft + navigates there).
  const [quickPrompt, setQuickPrompt] = useState('');

  // ── local apps + covers ───────────────────────────────────────────────────
  const [apps, setApps] = useState<AppSummary[] | null>(null);
  const [running, setRunning] = useState<number | null>(null);
  const [runnersReady, setRunnersReady] = useState<number | null>(null);
  const [runnersTotal, setRunnersTotal] = useState<number>(0);
  const [shots, setShots] = useState<Record<string, string>>({});
  const [refreshTick, setRefreshTick] = useState(0);
  useEffect(() => {
    let alive = true;
    runtime.listApps().then((a) => {
      if (!alive) return;
      setApps(a);
      const rec = [...a].sort(byUpdated).slice(0, SHOT_BATCH);
      if (runtime.appScreenshot) {
        Promise.allSettled(rec.map((x) => runtime.appScreenshot?.(x.id))).then((res) => {
          if (!alive) return;
          const next: Record<string, string> = {};
          res.forEach((r, i) => { if (r.status === 'fulfilled' && r.value?.dataUrl) next[rec[i].id] = r.value.dataUrl; });
          if (Object.keys(next).length) setShots((prev) => ({ ...prev, ...next }));
        });
      }
    }).catch(() => alive && setApps([]));
    runtime.listRunningPreviews?.().then((r) => alive && setRunning(r.length)).catch(() => alive && setRunning(0));
    if (runtime.runners) {
      runtime.runners.list().then((l) => { if (alive) { setRunnersReady(l.filter((r) => r.ready).length); setRunnersTotal(l.length); } }).catch(() => alive && setRunnersReady(0));
    } else if (alive) { setRunnersReady(0); setRunnersTotal(0); } // no runners on this host → don't spin forever
    return () => { alive = false; };
  }, [runtime, refreshTick]);

  // ── templates ─────────────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  useEffect(() => {
    let alive = true;
    Promise.resolve(runtime.templates?.() ?? []).then((t) => alive && setTemplates(t)).catch(() => alive && setTemplates([]));
    return () => { alive = false; };
  }, [runtime]);

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
  }, [hasLark, runtime]);

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
  const [fb, setFb] = useState<MyFeedbackResponse | null>(null);
  const [lbMe, setLbMe] = useState<LeaderboardEntry | null>(null);
  const [reqIn, setReqIn] = useState<number>(0);
  const [ref, setRef] = useState<Referral | null>(null);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    accountApi.subscription().then((v) => alive && setSub(v)).catch(() => {});
    accountApi.meActivity(365).then((v) => alive && setAct(v)).catch(() => {});
    accountApi.meOverview().then((v) => alive && setOv(v)).catch(() => {});
    accountApi.myFeedback().then((v) => alive && setFb(v)).catch(() => {});
    accountApi.leaderboard(1).then((v) => alive && setLbMe(v.me)).catch(() => {});
    accountApi.friendRequests().then((v) => alive && setReqIn(v.filter((r) => r.direction === 'incoming').length)).catch(() => {});
    accountApi.getReferral().then((v) => alive && setRef(v)).catch(() => {});
    return () => { alive = false; };
    // key on user.id (not the object): useAccountAuth mints a new User on every window
    // focus-refresh, which would otherwise re-fire all 7 calls needlessly.
  }, [user?.id, refreshTick]);

  // ── derived ────────────────────────────────────────────────────────────────
  const appsLoading = apps === null;
  const list = apps ?? [];
  const readyCount = list.filter((a) => { const k = (a.status || '').toLowerCase(); return k === 'ready' || k === 'live'; }).length;
  const errApps = list.filter((a) => { const k = (a.status || '').toLowerCase(); return k === 'error' || k === 'failed'; });
  // Fill the wide layout with FULL rows only (no lone orphan card, no thin single row):
  // compute the main column's column count and show the largest multiple of it, up to 2 rows.
  const mainW = wide ? Math.max(320, w - 356) : w; // 340 rail + 16 gap
  const colsFor = (min: number) => Math.max(1, Math.floor((mainW + 12) / (min + 12)));
  const fullRows = (n: number, c: number, maxRows = 2) => (n >= c ? Math.min(n - (n % c), c * maxRows) : n);
  const recCols = colsFor(230);
  const recent = [...list].sort(byUpdated).slice(0, fullRows(Math.min(list.length, recCols * 2), recCols));
  const tplCols = colsFor(240);

  const hr = new Date().getHours();
  const greeting = hr < 11 ? 'Chào buổi sáng' : hr < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  const greetIcon = hr < 11 ? <CoffeeOutlined /> : hr < 18 ? <ThunderboltOutlined /> : <BulbOutlined />;
  const nav = (v: View) => onNav?.(v);
  const pendingReward = fb ? Math.max(0, fb.totalRewardVnd - fb.paidRewardVnd) : 0;

  // real 7-day activity from the account API (fallback: local updatedAt buckets)
  const dayMs = 86400000;
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  let bars: { count: number; label: string }[];
  if (act) {
    bars = act.days.slice(-7).map((d) => ({ count: d.count, label: weekdayLabel(Date.parse(d.date + 'T00:00:00')) }));
  } else {
    const local = [0, 0, 0, 0, 0, 0, 0];
    for (const a of list) {
      if (!a.updatedAt) continue;
      const t = Date.parse(a.updatedAt); if (Number.isNaN(t)) continue;
      const d = new Date(t); d.setHours(0, 0, 0, 0);
      const idx = Math.floor((startToday.getTime() - d.getTime()) / dayMs);
      if (idx >= 0 && idx < 7) local[idx]++;
    }
    bars = local.map((c, i) => ({ count: c, label: i === 0 ? weekdayLabel(Date.now()) : weekdayLabel(Date.now() - i * dayMs) })).reverse();
  }
  const weekTotal = bars.reduce((s, b) => s + b.count, 0);
  const maxBar = Math.max(1, ...bars.map((b) => b.count));

  // ── health rows ─────────────────────────────────────────────────────────────
  type HealthRow = { key: string; icon: ReactNode; label: string; done: boolean; loading: boolean; sub: string; cta: string; onClick: () => void };
  const healthRows: HealthRow[] = [
    { key: 'ai', icon: <RobotOutlined />, label: 'Trình AI (CLI)', loading: runnersReady === null, done: (runnersReady ?? 0) > 0, sub: (runnersReady ?? 0) > 0 ? `${runnersReady}/${runnersTotal} CLI sẵn sàng` : 'Chưa kết nối AI nào', cta: 'Kết nối', onClick: () => nav('settings') },
    ...(hasLark ? [{ key: 'lark', icon: <ApiOutlined />, label: 'Lark', loading: lark === null, done: !!lark?.connected, sub: lark?.connected ? (lark.apiMode ? 'API trực tiếp' : 'Phiên web đang hoạt động') : 'Chưa kết nối', cta: 'Kết nối', onClick: () => nav('lark') } as HealthRow] : []),
    ...(hasCms ? [{ key: 'keeper', icon: <CloudServerOutlined />, label: 'Máy VM giữ phiên', loading: cms === null, done: !!cms?.keeperOnline, sub: cms?.keeperOnline ? 'Đang chạy 24/7' : 'Ngoại tuyến', cta: 'Mở', onClick: () => nav('cms-sync') } as HealthRow] : []),
    { key: 'app', icon: <RocketOutlined />, label: 'App đầu tiên', loading: appsLoading, done: list.length > 0, sub: list.length > 0 ? `${list.length} app` : 'Chưa có app nào', cta: 'Tạo ngay', onClick: () => onCreate?.() },
  ];
  const healthDone = healthRows.filter((r) => r.done).length;
  const healthTotal = healthRows.length;

  // ── attention band (problems that need action, aggregated across pillars) ──
  type Alert = { key: string; color: string; icon: ReactNode; text: string; cta: string; onClick: () => void };
  const alerts: Alert[] = [
    ...(hasCms && cms && cms.errored > 0 ? [{ key: 'cmsjob', color: ERR, icon: <SyncOutlined />, text: `${cms.errored} job đồng bộ CMS lỗi`, cta: 'Mở', onClick: () => nav('cms-sync') } as Alert] : []),
    ...(hasCms && cms && cms.keeperOnline === false ? [{ key: 'keeper', color: WARN, icon: <CloudServerOutlined />, text: 'Máy VM giữ phiên đang ngoại tuyến', cta: 'Mở', onClick: () => nav('cms-sync') } as Alert] : []),
    ...(hasLark && lark && !lark.connected ? [{ key: 'lark', color: WARN, icon: <ApiOutlined />, text: 'Lark chưa kết nối', cta: 'Kết nối', onClick: () => nav('lark') } as Alert] : []),
    ...(pendingReward > 0 ? [{ key: 'reward', color: OK, icon: <GiftOutlined />, text: `Thưởng báo lỗi chờ chi: ${vnd(pendingReward)}`, cta: 'Xem', onClick: () => nav('reports') } as Alert] : []),
    ...(reqIn > 0 ? [{ key: 'invite', color: BLUE, icon: <TeamOutlined />, text: `${reqIn} lời mời kết bạn`, cta: 'Xem', onClick: () => nav('profile') } as Alert] : []),
  ];

  // ── quick-launch chips ──────────────────────────────────────────────────────
  type QA = { key: string; icon: ReactNode; color: string; title: string; onClick: () => void };
  const chips: QA[] = [
    ...(runtime.gitImportLocal ? [{ key: 'git', icon: <CloudDownloadOutlined />, color: OK, title: 'Nhập từ Git', onClick: () => onImportGit?.() } as QA] : []),
    { key: 'skills', icon: <ExperimentOutlined />, color: WARN, title: 'Kỹ năng', onClick: () => nav('skills') },
    ...(hasLark ? [{ key: 'lark', icon: <RobotOutlined />, color: BLUE, title: 'Lark × Agents', onClick: () => nav('lark') } as QA] : []),
    ...(hasCms ? [{ key: 'cms', icon: <SyncOutlined />, color: OK, title: 'Đồng bộ CMS', onClick: () => nav('cms-sync') } as QA] : []),
    { key: 'explore', icon: <AppstoreAddOutlined />, color: BRAND, title: 'Khám phá', onClick: () => nav('explore') },
    { key: 'integrations', icon: <ApiOutlined />, color: BLUE, title: 'Tích hợp', onClick: () => nav('integrations') },
  ];

  // ── rewards & community tiles ────────────────────────────────────────────────
  type Reward = { key: string; icon: ReactNode; color: string; value: ReactNode; label: string; hint?: string; onClick: () => void };
  const rewards: Reward[] = [
    ...(lbMe ? [{ key: 'xp', icon: <TrophyOutlined />, color: WARN, value: lbMe.xp.toLocaleString('vi-VN'), label: 'Điểm XP', hint: `Cấp ${lbMe.level} · Hạng #${lbMe.rank}`, onClick: () => nav('profile') } as Reward] : []),
    ...(fb ? [{ key: 'tester', icon: <BugOutlined />, color: ERR, value: fb.totalReports, label: 'Báo lỗi hợp lệ', hint: pendingReward > 0 ? `Thưởng chờ: ${vnd(pendingReward)}` : `${fb.totalPoints} điểm`, onClick: () => nav('reports') } as Reward] : []),
    ...(reqIn > 0 ? [{ key: 'invite', icon: <TeamOutlined />, color: BLUE, value: reqIn, label: 'Lời mời kết bạn', hint: 'Chờ phản hồi', onClick: () => nav('profile') } as Reward] : []),
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
          <Text style={{ color: 'rgba(255,255,255,.86)', fontSize: 14.5 }}>Mô tả một ý tưởng — AI trên máy bạn dựng, build và preview app ngay. Tự động hoá Lark &amp; Bitable cùng một chỗ.</Text>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button size="large" icon={<PlusOutlined />} onClick={() => onCreate?.()} style={{ background: '#fff', color: BRAND, border: 'none', fontWeight: 700, boxShadow: '0 8px 20px rgba(0,0,0,.16)' }}>Tạo app mới</Button>
          {runtime.importLocalFolder && <Button size="large" ghost icon={<FolderOpenOutlined />} onClick={() => onImportFolder?.()} style={{ borderColor: 'rgba(255,255,255,.5)', color: '#fff' }}>Nhập thư mục</Button>}
          <Tooltip title="Làm mới">
            <Button type="text" shape="circle" icon={<ReloadOutlined />} onClick={() => setRefreshTick((n) => n + 1)} style={{ color: '#fff' }} aria-label="Làm mới" />
          </Tooltip>
        </div>
      </div>
      {/* integrated stat strip */}
      <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', background: 'rgba(255,255,255,.12)', borderTop: '1px solid rgba(255,255,255,.2)', backdropFilter: 'blur(6px)' }}>
        <HeroStat v={appsLoading ? '—' : list.length} l="Tổng app" onClick={() => nav('apps')} />
        <HeroStat v={appsLoading ? '—' : readyCount} l="Sẵn sàng" dot={OK} onClick={() => nav('apps')} />
        <HeroStat v={running ?? '—'} l="Preview chạy" />
        <HeroStat v={runnersReady === null ? '—' : <>{runnersReady}<span style={{ fontSize: 14, opacity: .7, fontWeight: 600 }}>/{runnersTotal}</span></>} l="AI sẵn sàng" onClick={() => nav('settings')} />
        {sub ? (
          <Tooltip title={sub.resetAt ? `Ngân sách token làm mới ${formatDate(sub.resetAt)}` : 'Ngân sách token theo gói'}>
          <div onClick={() => nav('profile')} style={{ flex: '1 1 150px', padding: '13px 20px', borderLeft: '1px solid rgba(255,255,255,.14)', cursor: 'pointer' }}>
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

  const attnCount = (errApps.length ? 1 : 0) + alerts.length;
  const attnEl = attnCount ? (
    <Card styles={{ body: { padding: '8px 10px' } }} style={{ borderRadius: 14, border: `1px solid ${WARN}55`, background: `${WARN}0f`, boxShadow: CARD_SHADOW }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px 4px' }}>
        <WarningOutlined style={{ color: WARN }} />
        <Text strong style={{ fontSize: 13.5 }}>Cần xử lý</Text>
        <Tag bordered={false} style={{ margin: 0, background: `${WARN}22`, color: WARN, fontWeight: 700 }}>{attnCount}</Tag>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {errApps.length > 0 && (
          <div>
            <div className="tw-attn-row" onClick={() => setShowErr((s) => !s)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 10, cursor: 'pointer' }}>
              <span style={{ color: ERR, fontSize: 15, display: 'inline-flex' }}><ExclamationCircleFilled /></span>
              <Text style={{ flex: 1, fontSize: 13, color: V.text }}>{errApps.length} app đang gặp lỗi</Text>
              <Button type="link" size="small" style={{ padding: 0 }}>{showErr ? 'Ẩn' : 'Xem'} <RightOutlined style={{ fontSize: 10, transform: showErr ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} /></Button>
            </div>
            {showErr && (
              <div style={{ padding: '2px 10px 10px' }}>
                <Text style={{ fontSize: 11.5, color: V.textFaint, display: 'block', marginBottom: 8 }}>Bấm "Sửa nhanh" để AI chẩn đoán &amp; sửa ngay tại đây (không cần mở app).</Text>
                <AttentionApps apps={errApps} onOpen={onOpenApp} />
              </div>
            )}
          </div>
        )}
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

  // ── quick-create bar (web-home parity) ──────────────────────────────────────
  // Type an idea right on the dashboard → hand off to the full builder with the
  // prompt prefilled (onUseTemplate = setDraft + go to 'apps' view + scroll).
  const quickStarters: { label: string; prompt: string }[] = [
    { label: 'Landing quán cà phê', prompt: 'Trang landing cho quán cà phê với menu và form đặt bàn' },
    { label: 'Bảng Kanban công việc', prompt: 'Dashboard quản lý công việc dạng Kanban kéo thả' },
    { label: 'App ghi chú', prompt: 'App ghi chú nhanh có tìm kiếm và tag' },
    { label: 'Game bắn gạch', prompt: 'Game bắn gạch: bóng nảy phá gạch, thanh đỡ điều khiển chuột/phím, có điểm số, thắng/thua và chơi lại' },
  ];
  const submitQuick = () => {
    const v = quickPrompt.trim();
    if (v) { onUseTemplate?.(v); setQuickPrompt(''); }
    else onCreate?.();
  };
  const quickCreateEl = onUseTemplate ? (
    <Card styles={{ body: { padding: '16px 18px' } }} style={{ borderRadius: 16, border: `1px solid ${V.border}`, background: V.surface, boxShadow: CARD_SHADOW }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span style={{ display: 'inline-flex', width: 40, height: 40, minWidth: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#fff', background: BRAND_GRADIENT, marginTop: 2 }}>
          <ThunderboltOutlined />
        </span>
        <Input.TextArea
          value={quickPrompt}
          onChange={(e) => setQuickPrompt(e.target.value)}
          variant="borderless"
          autoSize={{ minRows: 1, maxRows: 6 }}
          placeholder="Mô tả app bạn muốn tạo — AI sẽ dựng, build & preview ngay…"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitQuick(); } }}
          style={{ fontSize: 15, paddingTop: 7, resize: 'none', color: V.text }}
        />
        <Button type="primary" icon={<ThunderboltOutlined />} onClick={submitQuick}>Tạo app</Button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${V.border}` }}>
        <Text style={{ fontSize: 12.5, color: V.textFaint, alignSelf: 'center' }}>Gợi ý nhanh:</Text>
        {quickStarters.map((s) => (
          <button
            key={s.label}
            type="button"
            title={s.prompt}
            onClick={() => onUseTemplate?.(s.prompt)}
            style={{ cursor: 'pointer', fontSize: 12.5, color: BRAND, background: `${BRAND}14`, border: `1px solid ${BRAND}33`, borderRadius: 999, padding: '4px 12px', lineHeight: 1.3 }}
          >
            {s.label}
          </button>
        ))}
      </div>
    </Card>
  ) : null;

  const recentEl = (
    <div>
      <SectionHeader icon={<HistoryOutlined />} color={BRAND} title="Tiếp tục làm việc" actionLabel="Xem tất cả app" onAction={() => nav('apps')} />
      {appsLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px,1fr))', gap: 12 }}>
          {[0, 1, 2, 3].map((i) => <div key={i} style={{ height: 176, borderRadius: 14, background: V.surfaceMuted }} />)}
        </div>
      ) : recent.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: V.surfaceMuted, border: `1px dashed ${V.border}`, borderRadius: 16, padding: 24 }}>
          <IconTile icon={<RocketOutlined />} color={BRAND} size={44} radius={12} fontSize={20} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: V.text }}>Chưa có app nào</div>
            <Text type="secondary" style={{ fontSize: 13 }}>Mô tả ý tưởng để AI dựng app đầu tiên của bạn.</Text>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => onCreate?.()}>Tạo app mới</Button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${recCols}, 1fr)`, gap: 12 }}>
          {recent.map((a) => <RecentCard key={a.id} app={a} src={shots[a.id]} onOpen={onOpenApp} />)}
        </div>
      )}
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

  const templatesEl = templates.length ? (
    <div>
      <SectionHeader icon={<BulbOutlined />} color={WARN} title="Gợi ý bắt đầu" actionLabel={onBrowseTemplates ? 'Xem tất cả mẫu' : undefined} onAction={onBrowseTemplates} />
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${tplCols}, 1fr)`, gap: 12 }}>
        {templates.slice(0, fullRows(Math.min(templates.length, tplCols * 2), tplCols)).map((t) => {
          const tk = trackMeta(t.track);
          return (
            <Card key={t.id} hoverable size="small" className="tw-tpl-card" onClick={() => onUseTemplate?.(t.prompt)} styles={{ body: { padding: '14px 16px' } }} style={{ position: 'relative', overflow: 'hidden', borderRadius: 14, cursor: 'pointer' }}>
              <div aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: t.accent || BRAND }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                {t.category && <span style={{ background: V.chipBg, color: V.chipText, fontSize: 11, padding: '2px 8px', borderRadius: 999, fontWeight: 600 }}>{t.category}</span>}
                <div style={{ flex: 1 }} />
                {tk && <Tag bordered={false} style={{ margin: 0, fontSize: 11 }} icon={tk.icon}>{tk.label}</Tag>}
              </div>
              <div style={{ fontWeight: 700, fontSize: 14, color: V.text, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t.title}</div>
              {t.description && <div style={{ color: V.textSub, fontSize: 12.5, marginTop: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t.description}</div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, color: V.textFaint, fontSize: 11.5, fontWeight: 600 }}>Dùng mẫu này <ArrowRightOutlined className="tw-tpl-arrow" style={{ fontSize: 11, transition: 'transform .15s ease, color .15s ease' }} /></div>
            </Card>
          );
        })}
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
            <Tooltip key={i} title={`${b.count} build · ${i === bars.length - 1 ? 'hôm nay' : b.label}`}>
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
          { v: ov ? ov.totalBuilds : weekTotal, l: ov ? 'tổng build' : 'build/tuần' },
          { v: readyCount, l: 'sẵn sàng' },
          { v: ov ? ov.totalVisits.toLocaleString('vi-VN') : (running ?? 0), l: ov ? 'lượt xem' : 'đang chạy' },
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
      {quickCreateEl}
      {attnEl}
      {chipsEl}
      {wide ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 16, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
            {recentEl}
            {rewardsEl}
            {templatesEl}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 8 }}>
            {healthEl}
            {pillarEl}
            {activityEl}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {healthEl}
          {recentEl}
          {rewardsEl}
          {templatesEl}
          {pillarEl}
          {activityEl}
        </div>
      )}
      {/* Cộng đồng — Xếp hạng + Người dùng, moved here from the Khám phá tabs. */}
      {user && (
        <div style={{ display: 'grid', gridTemplateColumns: wide ? '1fr 1fr' : '1fr', gap: 16, alignItems: 'stretch' }}>
          <HubLeaderboard />
          <HubPeople />
        </div>
      )}
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

function byUpdated(a: AppSummary, b: AppSummary): number {
  return (Date.parse(b.updatedAt || '') || 0) - (Date.parse(a.updatedAt || '') || 0);
}
function weekdayLabel(ms: number): string {
  const names = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? '' : names[d.getDay()];
}

/** A recent-app card: uniform screenshot cover + status pill + hover play-overlay. */
function RecentCard({ app, src, onOpen }: { app: AppSummary; src?: string; onOpen?: (a: AppSummary) => void }) {
  const st = statusMeta(app.status);
  const tk = trackMeta(app.track);
  const building = (app.status || '').toLowerCase() === 'building';
  return (
    <Card
      hoverable
      className="tw-recent-card"
      onClick={() => onOpen?.(app)}
      styles={{ body: { padding: '10px 13px' } }}
      style={{ borderRadius: 14, overflow: 'hidden', cursor: 'pointer' }}
      cover={
        <div style={{ position: 'relative' }}>
          <AppThumb src={src} name={app.name} seed={app.id} host={hostOf(app.url)} height={120} compact />
          <span style={{ position: 'absolute', top: 8, right: 8, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, color: '#fff', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.color, animation: building ? 'tw-pulse 1.2s ease-in-out infinite' : undefined }} />
            {st.word}
          </span>
          <div className="tw-recent-play" aria-hidden style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(17,24,39,0.34)', opacity: 0, transition: 'opacity .15s ease' }}>
            <span style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.92)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#1E2230', fontSize: 18 }}>
              <CaretRightOutlined />
            </span>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <Text strong ellipsis style={{ fontSize: 14, flex: 1 }}>{app.name}</Text>
        {tk && <Tag bordered={false} style={{ margin: 0, fontSize: 11 }} icon={tk.icon}>{tk.label}</Tag>}
      </div>
      <Text style={{ color: V.textFaint, fontSize: 12 }}>{relTime(app.updatedAt)}</Text>
    </Card>
  );
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
