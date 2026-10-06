'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Spin, Card, Typography, Space, Tag, Button, Popover, QRCode, Modal, Input, Grid } from 'antd';
import { ThunderboltOutlined, SyncOutlined, RocketOutlined, ExportOutlined, CheckCircleOutlined, CloudDownloadOutlined, MobileOutlined, FolderOpenOutlined, ApartmentOutlined, CloseCircleOutlined } from '@ant-design/icons';
import type { AppSummary, CreateBuildInput, PromptTemplate } from '@larkwave/core';
import { AppShell } from './AppShell';
import { FixQueueDriver } from '../fixQueue';
import { WorkspaceTabStrip } from './WorkspaceTabStrip';
import { upsertOptimisticApp, dropOptimisticApp, notifyAppsChanged } from '../appEvents';
import { Composer } from './Composer';
import { TemplateThumb } from './TemplateThumb';
import { AppsGrid } from './AppsGrid';
import { AppWorkspace } from './AppWorkspace';
import { GitImportModal } from './GitImportModal';
import { SyncToPhoneModal } from './SyncToPhoneModal';
import { LarkScreen } from './LarkScreen';
import { AutomationsPanel } from './lark/AutomationsPanel';
import { AgentChat } from './agents/AgentChat';
import { useGrantGateway } from './lark/useGrantGateway';
import { LarkFilesScreen } from './lark/LarkFilesScreen';
import { SpecScreen } from './lark/SpecScreen';
import { CmsSyncScreen } from './lark/CmsSyncScreen';
import { SkillsScreen } from './SkillsScreen';
import { StorageScreen } from '../account/StorageScreen';
import { SettingsScreen } from './SettingsScreen';
import { FeedbackButton } from './FeedbackButton';
import { useRuntime } from '../RuntimeProvider';
import { useRunningPreviews } from '../useRunningPreviews';
import { BRAND, BRAND_GRADIENT, V } from '../theme';
import { AccountAuthProvider, useAccountAuth } from '../account/auth';
import { LoginView } from '../account/LoginView';
import { ExploreView } from '../account/ExploreView';
import { ReportsView } from '../account/ReportsView';
import { IntegrationsView } from '../account/IntegrationsView';
import { ProfileView } from '../account/ProfileView';
import { LeaderboardView } from '../account/LeaderboardView';
import { FriendsView } from '../account/FriendsView';
import { PricingView } from '../account/PricingView';
import { HomeOverview } from './HomeOverview';
import { useI18n } from '../i18n';

/** Account pages that require a logged-in Larkwave account (not just Claude). */
// 'apps' ("App của tôi") is a LOCAL view (shows on-disk apps → in-app AppWorkspace), NOT an
// account/server view. Friends/Xếp hạng are now merged INTO 'explore' (tabs); Gói is merged
// INTO 'profile'; admin UI was removed (use the CMS); 'templates' merged into 'apps'.
type AccountView = 'explore' | 'integrations' | 'reports' | 'profile' | 'leaderboard' | 'friends' | 'pricing' | 'storage';
const ACCOUNT_VIEWS: AccountView[] = ['explore', 'integrations', 'reports', 'profile', 'leaderboard', 'friends', 'pricing', 'storage'];

const VIEW_BY_KEY: Record<string, View> = {
  'tw-agents': 'agents',
  'tw-app-web': 'apps',
  'tw-app-mobile': 'apps',
  'tw-app-desktop': 'apps',
  'tw-app-game': 'apps',
  'tw-app-extension': 'apps',
  'tw-lark': 'lark',
  'tw-lark-spec': 'spec',
  'tw-lark-files': 'lark-files',
  'tw-lark-auto': 'lark-auto',
  'tw-cms-sync': 'cms-sync',
  'tw-skills': 'skills',
  'tw-skills-cross': 'skills-cross',
  'tw-settings': 'settings',
  'tw-apps': 'apps',
  'tw-explore': 'explore',
  'tw-integrations': 'integrations',
  'tw-reports': 'reports',
  'tw-profile': 'profile',
  'tw-leaderboard': 'leaderboard',
  'tw-friends': 'friends',
  'tw-pricing': 'pricing',
  'tw-storage': 'storage',
};

const WEB_URL: Record<string, string> = {
  explore: 'https://toolswave.net/explore',
  integrations: 'https://toolswave.net/integrations',
  reports: 'https://toolswave.net/reports',
  profile: 'https://toolswave.net/profile',
  leaderboard: 'https://toolswave.net/leaderboard',
  friends: 'https://toolswave.net/friends',
  pricing: 'https://toolswave.net/pricing',
  storage: 'https://toolswave.net/storage',
};

export type View = 'home' | 'apps' | 'agents' | 'lark' | 'spec' | 'lark-files' | 'lark-auto' | 'cms-sync' | 'skills' | 'skills-cross' | 'settings' | AccountView;

/** Reverse of VIEW_BY_KEY — lets the parent drive the sidebar selection when
 *  navigating programmatically (e.g. clicking a KPI tile). */
const KEY_BY_VIEW: Record<View, string> = {
  home: 'tw-composer',
  agents: 'tw-agents',
  lark: 'tw-lark',
  spec: 'tw-lark-spec',
  'lark-files': 'tw-lark-files',
  'cms-sync': 'tw-cms-sync',
  'lark-auto': 'tw-lark-auto',
  skills: 'tw-skills',
  'skills-cross': 'tw-skills-cross',
  settings: 'tw-settings',
  apps: 'tw-apps',
  explore: 'tw-explore',
  integrations: 'tw-integrations',
  reports: 'tw-reports',
  profile: 'tw-profile',
  leaderboard: 'tw-leaderboard',
  friends: 'tw-friends',
  pricing: 'tw-pricing',
  storage: 'tw-storage',
};

const { Title, Text } = Typography;

/** Mirror of the main-process slugName: diacritic-stripped, spaces → '-', ≤30 chars. */
function slugify30(name: string): string {
  const s = (name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
    .replace(/-+$/g, '');
  return s || 'du-an';
}

/** Shown only when the API is unreachable (offline), so the rail is never empty. */
const FALLBACK_TEMPLATES: PromptTemplate[] = [
  { id: 'cafe', title: 'Landing quán cà phê', category: 'Landing', accent: BRAND, prompt: 'Trang landing quán cà phê có menu, hình ảnh không gian và form đặt bàn, giao diện ấm áp, responsive.' },
  { id: 'kanban', title: 'Bảng công việc Kanban', category: 'Công cụ', accent: '#3FB8A0', prompt: 'Dashboard quản lý công việc dạng Kanban kéo thả với 3 cột Cần làm / Đang làm / Xong, thêm sửa xoá task, lưu localStorage.' },
  { id: 'notes', title: 'App ghi chú nhanh', category: 'Công cụ', accent: '#6C5CE7', prompt: 'App ghi chú nhanh có tìm kiếm, tag và ghim, lưu localStorage, giao diện tối giản.' },
  { id: 'course', title: 'Bán khoá học online', category: 'Bán hàng', accent: '#E8915D', prompt: 'Trang bán khoá học online có danh sách khoá học, chi tiết, giỏ hàng và thanh toán.' },
  { id: 'portfolio', title: 'Portfolio cá nhân', category: 'Cá nhân', accent: '#1E2230', prompt: 'Trang portfolio cá nhân tối giản, dark mode, có giới thiệu, dự án và liên hệ.' },
];

/**
 * Prompt-template gallery — fetches the SAME catalogue the website uses from the
 * App Builder API (api.toolswave.net `/templates`) via `runtime.templates()`.
 * Each card is clickable: it fills the composer with the template prompt so the
 * user can build right away. Falls back to built-in examples when offline.
 */
function TemplateGallery({ onUse, compact }: { onUse: (prompt: string) => void; compact?: boolean }) {
  const runtime = useRuntime();
  const { t: tr } = useI18n();
  const screens = Grid.useBreakpoint();
  const [items, setItems] = useState<PromptTemplate[] | null>(null);
  const [templateCat, setTemplateCat] = useState<string>('Tất cả');
  const [templatePreview, setTemplatePreview] = useState<PromptTemplate | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.resolve(runtime.templates?.() ?? [])
      .then((t) => { if (alive) setItems(t.length ? t : FALLBACK_TEMPLATES); })
      .catch(() => { if (alive) setItems(FALLBACK_TEMPLATES); });
    return () => { alive = false; };
  }, [runtime]);

  const header = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><RocketOutlined /> {tr('ui.home.promptTemplates', 'Mẫu prompt')}</span>
  );

  if (items === null) {
    return (
      <Card title={header} size="small">
        <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
      </Card>
    );
  }

  // COMPACT (home dashboard rail): keep the fast quick-pick list.
  if (compact) {
    return (
      <Card title={header} size="small" extra={<Text type="secondary" style={{ fontSize: 12 }}>{tr('ui.home.clickToUse', 'Bấm để dùng nhanh')}</Text>}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          {items.slice(0, 6).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onUse(t.prompt)}
              title={tr('ui.home.useThisTemplate', 'Dùng mẫu này')}
              style={{
                width: '100%', textAlign: 'left', cursor: 'pointer', padding: '10px 12px', borderRadius: 10,
                border: `1px solid ${V.border}`, borderLeft: `3px solid ${t.accent || BRAND}`, background: V.surface,
                transition: 'background .15s ease, border-color .15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = V.surfaceAlt; e.currentTarget.style.borderColor = 'rgba(108,92,231,0.35)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = V.surface; e.currentTarget.style.borderColor = V.border; }}
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ width: 40, height: 40, minWidth: 40, borderRadius: 8, background: `linear-gradient(135deg, ${t.accent || BRAND}, ${(t.accent || BRAND)}AA)`, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16 }}>
                  {(t.title || 'A').charAt(0).toUpperCase()}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: V.text }}>{t.title}</span>
                    {t.category && <Tag color="default" style={{ margin: 0, fontSize: 11 }}>{t.category}</Tag>}
                  </div>
                  {t.description && <div style={{ fontSize: 12, color: V.textSub, marginTop: 3, lineHeight: 1.45 }}>{t.description.length > 110 ? t.description.slice(0, 110) + '…' : t.description}</div>}
                </div>
              </div>
            </button>
          ))}
        </Space>
      </Card>
    );
  }

  // FULL page: category filter + a card GRID with synthesized layout previews; click a card
  // (or "Xem trước") to open a larger preview, then "Dùng mẫu".
  const ALL = 'Tất cả';
  const cats = [ALL, ...Array.from(new Set(items.map((t) => t.category).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b))];
  const list = templateCat === ALL ? items : items.filter((t) => t.category === templateCat);

  return (
    <Space direction="vertical" size={18} style={{ width: '100%' }}>
      <div>
        <Title level={3} style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}><RocketOutlined style={{ color: BRAND }} />{tr('ui.home.templateLibrary', 'Thư viện mẫu')}</Title>
        <Text type="secondary">{tr('ui.home.templateLibraryHint', 'Bắt đầu nhanh từ một mẫu có sẵn — bấm vào thẻ để xem trước bố cục rồi tạo app.')}</Text>
      </div>
      <Space wrap size={[8, 8]}>
        {cats.map((cat) => (
          <Tag.CheckableTag
            key={cat}
            checked={cat === templateCat}
            onChange={() => setTemplateCat(cat)}
            style={{
              padding: '5px 14px', fontSize: 13, borderRadius: 999,
              border: `1px solid ${cat === templateCat ? 'rgba(108,92,231,0.45)' : V.border}`,
              background: cat === templateCat ? 'rgba(108,92,231,0.12)' : V.surface,
              color: cat === templateCat ? V.chipText : V.textSub,
            }}
          >
            {cat === ALL ? tr('ui.home.allCategories', 'Tất cả') : cat}
          </Tag.CheckableTag>
        ))}
      </Space>
      {list.length === 0 ? (
        <Text type="secondary">{tr('ui.home.noTemplatesInGroup', 'Chưa có mẫu nào trong nhóm này.')}</Text>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))', gap: 16 }}>
          {list.map((t) => (
            <div
              key={t.id}
              className="tw-lift"
              onClick={() => setTemplatePreview(t)}
              style={{ border: `1px solid ${V.border}`, borderRadius: 14, overflow: 'hidden', background: V.surface, cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
            >
              <TemplateThumb accent={t.accent} category={t.category} track={t.track} />
              <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                {t.category && <Tag bordered={false} style={{ background: V.chipBg, color: V.chipText, borderRadius: 6, margin: 0, alignSelf: 'flex-start' }}>{t.category}</Tag>}
                <span style={{ fontWeight: 700, fontSize: 14, color: V.text }}>{t.title}</span>
                {t.description && <span style={{ fontSize: 12.5, color: V.textSub, lineHeight: 1.5, minHeight: 38 }}>{t.description.length > 96 ? t.description.slice(0, 96) + '…' : t.description}</span>}
                <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                  <Button size="small" onClick={(e) => { e.stopPropagation(); setTemplatePreview(t); }}>{tr('ui.home.preview', 'Xem trước')}</Button>
                  <Button size="small" type="primary" icon={<ThunderboltOutlined />} onClick={(e) => { e.stopPropagation(); onUse(t.prompt); }}>{tr('ui.home.useTemplate', 'Dùng mẫu')}</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal
        open={!!templatePreview}
        onCancel={() => setTemplatePreview(null)}
        title={templatePreview?.title}
        width={screens.md ? 640 : '94vw'}
        footer={[
          <Button key="close" onClick={() => setTemplatePreview(null)}>{tr('ui.home.close', 'Đóng')}</Button>,
          <Button key="use" type="primary" icon={<ThunderboltOutlined />} onClick={() => { if (templatePreview) onUse(templatePreview.prompt); setTemplatePreview(null); }}>{tr('ui.home.useThisTemplateBtn', 'Dùng mẫu này')}</Button>,
        ]}
      >
        {templatePreview && (
          <>
            <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${V.border}` }}>
              <TemplateThumb accent={templatePreview.accent} category={templatePreview.category} track={templatePreview.track} height={230} windowMaxWidth={430} />
            </div>
            <Space size={6} wrap style={{ margin: '14px 0 8px' }}>
              {templatePreview.category && <Tag bordered={false} style={{ background: V.chipBg, color: V.chipText, borderRadius: 6, margin: 0 }}>{templatePreview.category}</Tag>}
              {templatePreview.track && <Tag color="blue">{templatePreview.track}</Tag>}
            </Space>
            <div style={{ color: V.textSub, lineHeight: 1.6 }}>{templatePreview.description}</div>
          </>
        )}
      </Modal>
    </Space>
  );
}

export function HomeScreen() {
  return (
    <AccountAuthProvider>
      <HomeShell />
    </AccountAuthProvider>
  );
}

/** Placeholder for an account page whose native desktop port is still in progress. */
function ComingSoon({ view }: { view: AccountView }) {
  const runtime = useRuntime();
  const { t } = useI18n();
  const url = WEB_URL[view];
  return (
    <div style={{ maxWidth: 560, margin: '40px auto 0' }}>
      <Card>
        <Space direction="vertical" size={12} style={{ width: '100%', textAlign: 'center' }}>
          <RocketOutlined style={{ color: BRAND, fontSize: 30 }} />
          <Title level={4} style={{ margin: 0 }}>{t('ui.home.movingToDesktop', 'Đang chuyển sang desktop')}</Title>
          <Text type="secondary">
            {t('ui.home.movingToDesktopDesc', 'Trang này đang được dựng lại bản native cho desktop. Trong lúc chờ, bạn có thể mở bản web.')}
          </Text>
          {url && (
            <Button
              type="primary"
              icon={<ExportOutlined />}
              onClick={() => (runtime.openExternal ? runtime.openExternal(url) : window.open(url, '_blank'))}
            >
              {t('ui.home.openWeb', 'Mở bản web')}
            </Button>
          )}
        </Space>
      </Card>
    </div>
  );
}

/** Renders a Larkwave-account page; shows the login gate until signed in. */
function AccountGate({ view, nav, onCreate }: { view: AccountView; nav?: (v: View) => void; onCreate?: () => void }) {
  const { user, loading } = useAccountAuth();
  if (loading) {
    return (
      <div style={{ textAlign: 'center', marginTop: 80 }}>
        <Spin size="large" />
      </div>
    );
  }
  // Khám phá + Integrations are static/public — viewable without a login.
  // Every account screen now interlinks out via onNav (nav) + onCreate (goCompose).
  if (view === 'explore') return <ExploreView onNav={nav} onCreate={onCreate} />;
  if (view === 'integrations') return <IntegrationsView onNav={nav} onCreate={onCreate} />;
  if (!user) return <LoginView />;
  if (view === 'reports') return <ReportsView />;
  // Hồ sơ now also hosts "Bạn bè của tôi" + "Gói & Thanh toán" (with a history modal).
  if (view === 'profile') return <ProfileView onNav={nav} onCreate={onCreate} />;
  // Standalone destinations (also reachable inside Hồ sơ) — surfaced in nav for parity with web.
  if (view === 'leaderboard') return <LeaderboardView />;
  if (view === 'friends') return <FriendsView />;
  if (view === 'pricing') return <PricingView onNav={nav} />;
  // Dung lượng lưu trữ — CÙNG màn hình với web, không dựng bản sao riêng cho desktop.
  if (view === 'storage') return <StorageScreen />;
  return <ComingSoon view={view} />;
}

/**
 * The tab strip, wired to the live dev-server registry so a project that has a preview up gets its
 * running dot. The poll is module-scoped + refcounted (the header's "Cổng đang chạy" badge already
 * subscribes), so this adds no timer — but it DOES set state every 4s, which is why it lives in its
 * own component: subscribing inside HomeShell would re-render every mounted workspace on each poll.
 * `runningIds` is empty on web, where there is no local registry.
 */
function RunningTabStrip(props: Omit<Parameters<typeof WorkspaceTabStrip>[0], 'runningIds'>) {
  const { rows } = useRunningPreviews();
  const runningIds = useMemo(() => new Set(rows.map((r) => r.appId)), [rows]);
  return <WorkspaceTabStrip {...props} runningIds={runningIds} />;
}

/**
 * Full Larkwave home — mirrors the website's BuilderHome (welcome line →
 * prompt-first composer → KPI band → recent apps + template rail). On desktop it
 * gates the BUILDER on the local Claude CLI, and the account pages (Khám phá,
 * Bạn bè, Xếp hạng…) on a Larkwave account. On web it goes straight in.
 */
/** Tab strip for the open app conversations — "Trang chủ" (composer) + one chip per open app.
 *  Each chip switches the active workspace; the × closes that tab. */
// (WorkspaceTabs moved to WorkspaceTabStrip.tsx and enriched — Chrome-like bar)
function HomeShell() {
  const runtime = useRuntime();
  const { t } = useI18n();
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const [importingFolder, setImportingFolder] = useState(false);
  const [syncModal, setSyncModal] = useState(false);
  const { user: accountUser, loading: accountLoading } = useAccountAuth();
  // Desktop drives local AI CLIs (Claude/Grok/Gemini/Codex etc). No longer gate entire UI on Claude only.
  const isDesktop = !!runtime.claude || !!runtime.runners;
  // Owner-side delegated-turn gateway, mounted ONCE app-wide so a friend's shared-Lark or
  // shared-"Trợ lý AI" request runs whenever this desktop is open+signed-in — not only while
  // the sharing panel happens to be on screen. Kind-aware dispatch lives in the hook.
  useGrantGateway(runtime, isDesktop && !!accountUser?.id);
  const [phase, setPhase] = useState<'checking' | 'connect' | 'ready'>(
    (runtime.claude || runtime.runners) ? 'checking' : 'ready',
  );
  const displayName = (accountUser?.name || accountUser?.email?.split('@')[0] || t('ui.home.you', 'bạn')).replace(/\./g, ' ');
  // Who may see the (backend-global) "Đồng bộ Bitable (CMS)" screen: admins + a specific email
  // allowlist. The CMS jobs are shared on one backend — this only widens VISIBILITY of the same
  // jobs to these accounts (no per-account copy exists to make).
  const CMS_ALLOW_EMAILS = ['deveris.vu@gmail.com', 'phuongdang29492@gmail.com', 'dbrainv.ai@gmail.com'];
  const cmsAllowed =
    accountUser?.role === 'admin' || CMS_ALLOW_EMAILS.includes((accountUser?.email || '').trim().toLowerCase());
  const [builtAt, setBuiltAt] = useState(0);
  // Migrate OLD flat apps → named {slug}-workspace/{slug}-home structure (with backup).
  const [migratable, setMigratable] = useState<{ id: string; name: string }[]>([]);
  const [migrateOpen, setMigrateOpen] = useState(false);
  const [migRunning, setMigRunning] = useState(false);
  const [migStatus, setMigStatus] = useState<Record<string, 'pending' | 'running' | 'ok' | 'skip' | 'err'>>({});
  // Short project name per app (≤30 chars → the folder slug). Prefilled from the current name.
  const [migNames, setMigNames] = useState<Record<string, string>>({});
  useEffect(() => {
    let dead = false;
    runtime
      .listMigratableApps?.()
      .then((l) => {
        if (dead) return;
        const list = Array.isArray(l) ? l : [];
        setMigratable(list);
        setMigNames((prev) => {
          const next = { ...prev };
          for (const a of list) if (next[a.id] === undefined) next[a.id] = (a.name || '').slice(0, 30);
          return next;
        });
      })
      .catch(() => !dead && setMigratable([]));
    return () => {
      dead = true;
    };
  }, [runtime, builtAt]);
  const runMigrateAll = async () => {
    if (!runtime.migrateApp || migRunning) return;
    setMigRunning(true);
    const init: Record<string, 'pending' | 'running' | 'ok' | 'skip' | 'err'> = {};
    migratable.forEach((a) => (init[a.id] = 'pending'));
    setMigStatus(init);
    for (const a of migratable) {
      setMigStatus((s) => ({ ...s, [a.id]: 'running' }));
      try {
        const r = await runtime.migrateApp!(a.id, (migNames[a.id] || a.name || '').trim().slice(0, 30));
        setMigStatus((s) => ({ ...s, [a.id]: r.skipped ? 'skip' : r.ok ? 'ok' : 'err' }));
      } catch {
        setMigStatus((s) => ({ ...s, [a.id]: 'err' }));
      }
    }
    setMigRunning(false);
    setBuiltAt(Date.now()); // refresh app grid + the migratable list
  };
  const [draft, setDraft] = useState('');
  const [view, setView] = useState<View>('home');
  // The exact sidebar key last selected — so two keys that map to the SAME view (e.g. the two
  // "Kỹ năng" entries under Vibe Coding vs Lark) highlight the one the user actually clicked.
  const [selKey, setSelKey] = useState<string>('tw-composer');
  /** Preset app type for the builder ('apps' view), driven by the per-type "Làm app" sidebar items. */
  const [builderTrack, setBuilderTrack] = useState<string | undefined>(undefined);
  /** Open app workspaces as TABS — each stays MOUNTED so its build + preview keep running while
   *  you switch between conversations. `activeAppId` null = show the composer/grid. */
  const [openApps, setOpenApps] = useState<AppSummary[]>([]);
  const [activeAppId, setActiveAppId] = useState<string | null>(null);
  /** First builds to run inside freshly-opened workspaces, keyed by appId (composer "Tạo app"). */
  const [initialBuilds, setInitialBuilds] = useState<Record<string, CreateBuildInput>>({});
  /** Pinned tabs — icon-only, sorted first. */
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  /** Recently-closed tabs for "Mở lại" (Cmd/Ctrl+Shift+T). Bounded to 10. */
  const [closedStack, setClosedStack] = useState<{ app: AppSummary; idx: number }[]>([]);

  // Open an app in a tab (focus it if already open) + run its first build if given.
  const openTab = useCallback((app: AppSummary, build?: CreateBuildInput) => {
    setOpenApps((prev) => (prev.some((a) => a.id === app.id) ? prev.map((a) => (a.id === app.id ? app : a)) : [...prev, app]));
    if (build) {
      setInitialBuilds((prev) => ({ ...prev, [app.id]: build }));
      // Composer navigates here BEFORE createBuild writes the app dir, so a plain refresh
      // would miss it. Publish the placeholder now → every other tab's list shows the new
      // project in the same frame; AppWorkspace drops it once listApps() has the real id.
      upsertOptimisticApp(app);
    }
    setActiveAppId(app.id);
    setView('apps');
  }, []);
  // Reliable folder import. The native OS folder-sheet (main-process dialog) has been flaky, so we
  // PREFER a renderer `<input webkitdirectory>` picker + resolve the real path via webUtils, then
  // import by path. Falls back to the old dialog only on an older main that lacks those methods.
  const folderInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = folderInputRef.current;
    if (el) { el.setAttribute('webkitdirectory', ''); el.setAttribute('directory', ''); }
  }, []);
  const onImported = useCallback((app: { appId: string; name: string }) => {
    setBuiltAt(Date.now());
    message.success(`${t('ui.home.imported', 'Đã nhập')} "${app.name}" ${t('ui.home.importedSuffix', '— mở workspace để sửa/chạy bằng AI.')}`);
    openTab({ id: app.appId, name: app.name, status: 'ready', updatedAt: new Date().toISOString() });
  }, [message, openTab]);
  // Renderer picker → real path → import by path (no native dialog).
  const onFolderPicked = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const first = e.target.files?.[0];
    e.target.value = '';
    if (!first || !runtime.importLocalFolderPath) return;
    const abs = runtime.pathForFile?.(first);
    if (!abs) { message.error(t('ui.home.noFolderPath', 'Không lấy được đường dẫn thư mục. Thử lại hoặc cập nhật app.')); return; }
    const rel = (first.webkitRelativePath || first.name).replace(/\\/g, '/');
    const seg = rel.split('/')[0];
    const root = abs.slice(0, abs.length - rel.length) + seg; // the selected folder's absolute path
    setImportingFolder(true);
    const hide = message.loading(t('ui.home.importingFolder', 'Đang nhập thư mục dự án…'), 0);
    try {
      const app = await runtime.importLocalFolderPath(root);
      hide();
      if (app) onImported(app);
    } catch (err) {
      hide();
      message.error((err as Error).message);
    } finally {
      setImportingFolder(false);
    }
  }, [runtime, message, onImported]);
  const importFolder = useCallback(async () => {
    // Preferred path: reliable renderer picker (needs the newer main's importLocalFolderPath + webUtils).
    if (runtime.importLocalFolderPath && runtime.pathForFile && folderInputRef.current) {
      folderInputRef.current.value = '';
      folderInputRef.current.click();
      return;
    }
    // Fallback: legacy native-dialog import (older installed .dmg).
    if (!runtime.importLocalFolder) return;
    setImportingFolder(true);
    const hide = message.loading(t('ui.home.openingFolder', 'Đang mở thư mục dự án…'), 0);
    try {
      const app = await Promise.race([
        runtime.importLocalFolder(),
        new Promise<Awaited<ReturnType<NonNullable<typeof runtime.importLocalFolder>>>>((_, rej) =>
          setTimeout(() => rej(new Error('__timeout__')), 180000),
        ),
      ]);
      hide();
      if (app) onImported(app);
    } catch (e) {
      hide();
      message.error(
        (e as Error).message === '__timeout__'
          ? t('ui.home.importTimeout', 'Quá thời gian nhập thư mục (thư mục quá lớn hoặc ổ mạng không phản hồi). Thử thư mục nhỏ hơn hoặc ổ cục bộ.')
          : (e as Error).message,
      );
    } finally {
      setImportingFolder(false);
    }
  }, [runtime, message, onImported]);
  const closeTab = useCallback((id: string) => {
    setOpenApps((prev) => {
      const idx = prev.findIndex((a) => a.id === id);
      if (idx >= 0) setClosedStack((s) => [...s, { app: prev[idx], idx }].slice(-10));
      return prev.filter((a) => a.id !== id);
    });
    setActiveAppId((cur) => (cur === id ? null : cur)); // closing the active tab → back to composer
    setPinned((p) => {
      if (!p.has(id)) return p;
      const n = new Set(p);
      n.delete(id);
      return n;
    });
    setInitialBuilds((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    dropOptimisticApp(id); // if it was never realized on disk, stop showing the placeholder
    setBuiltAt(Date.now());
    notifyAppsChanged();
  }, []);
  /** Show the composer/grid without closing the open tabs. */
  const goCompose = useCallback(() => {
    setActiveAppId(null);
    setView('apps');
  }, []);
  /** Activate a tab; bring the builder back if we're on another view (tabs are hidden there). */
  const activateTab = useCallback((id: string) => {
    setActiveAppId(id);
    setView('apps');
  }, []);
  const reorderTab = useCallback((from: number, to: number) => {
    setOpenApps((prev) => {
      if (from < 0 || to < 0 || from >= prev.length || to >= prev.length || from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);
  const togglePin = useCallback((id: string) => {
    setPinned((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);
  const reopenTab = useCallback(() => {
    setClosedStack((s) => {
      const last = s[s.length - 1];
      if (!last) return s;
      setOpenApps((prev) =>
        prev.some((a) => a.id === last.app.id)
          ? prev
          : (() => {
              const n = [...prev];
              n.splice(Math.min(last.idx, n.length), 0, last.app);
              return n;
            })(),
      );
      setActiveAppId(last.app.id);
      setView('apps');
      return s.slice(0, -1);
    });
  }, []);
  const closeOtherTabs = useCallback(
    (keepId: string) => {
      setOpenApps((prev) => {
        const removed = prev.filter((a) => a.id !== keepId && !pinned.has(a.id));
        if (removed.length)
          setClosedStack((s) =>
            [...s, ...removed.map((a) => ({ app: a, idx: prev.findIndex((x) => x.id === a.id) }))].slice(-10),
          );
        return prev.filter((a) => a.id === keepId || pinned.has(a.id));
      });
      setActiveAppId(keepId);
    },
    [pinned],
  );
  const closeAllTabs = useCallback(() => {
    setOpenApps((prev) => {
      const removed = prev.filter((a) => !pinned.has(a.id));
      if (removed.length)
        setClosedStack((s) =>
          [...s, ...removed.map((a) => ({ app: a, idx: prev.findIndex((x) => x.id === a.id) }))].slice(-10),
        );
      return prev.filter((a) => pinned.has(a.id));
    });
    setActiveAppId(null);
  }, [pinned]);
  // Rename a conversation from its tab — persist (meta.name) + reflect in the open tabs + grids.
  const renameTab = useCallback(
    (id: string, name: string) => {
      if (!runtime.renameApp) return;
      runtime
        .renameApp(id, name)
        .then(() => {
          setOpenApps((prev) => prev.map((a) => (a.id === id ? { ...a, name } : a)));
          setBuiltAt(Date.now());
          notifyAppsChanged(); // rename shows in every tab's list + sidebar
        })
        .catch(() => {});
    },
    [runtime],
  );
  /** "Nhập từ Git" modal (desktop: clone a repo into a local app). */
  const [importOpen, setImportOpen] = useState(false);
  /** Starter-template picker — opened from INSIDE the create flow (composer "Mẫu" button). */
  const [templatesOpen, setTemplatesOpen] = useState(false);

  // Picking a template fills the composer and brings the user back to the
  // builder so they can tweak + create immediately.
  const useTemplate = useCallback((prompt: string) => {
    setDraft(prompt);
    // The composer only renders under the 'apps' view — 'home' is the Overview dashboard,
    // so a prefilled prompt would be invisible there. Land on 'apps' and scroll to it.
    setActiveAppId(null);
    setView('apps');
    setTimeout(() => {
      document.getElementById('tw-composer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }, []);

  // Desktop sidebar is a real view switcher — each tab shows a distinct screen.
  const onSelect = (key: string) => {
    setSelKey(key);
    setActiveAppId(null); // keep tabs open; just switch view (open builds keep running, mounted)
    // Per-type "Làm app" items preset the builder's app type + filter the library.
    if (key.startsWith('tw-app-')) {
      setBuilderTrack(key.slice('tw-app-'.length));
      setView('apps');
      return;
    }
    if (key === 'tw-apps') setBuilderTrack(undefined);
    setView(VIEW_BY_KEY[key] ?? 'home');
  };

  // Programmatic navigation (e.g. clicking a KPI tile) — keeps the sidebar in sync
  // via the controlled `activeKey` below.
  const navigate = useCallback((v: View) => {
    setActiveAppId(null);
    setView(v);
    setSelKey(KEY_BY_VIEW[v]);
  }, []);
  // Which sidebar key to highlight: the exact clicked key when it still maps to the current
  // view (distinguishes the two "Kỹ năng" entries), otherwise the canonical key for the view.
  const selectedKey = (VIEW_BY_KEY[selKey] ?? 'home') === view ? selKey : KEY_BY_VIEW[view];

  useEffect(() => {
    let alive = true;
    const check = async () => {
      // Prefer any ready runner (support all agents)
      if (runtime.runners) {
        try {
          const list = await runtime.runners.list();
          const hasReady = list.some((r) => r.ready);
          if (alive) setPhase(hasReady ? 'ready' : 'connect');
          return;
        } catch {
          /* fallthrough */
        }
      }
      if (!runtime.claude) {
        if (alive) setPhase('ready');
        return;
      }
      try {
        const s = await runtime.claude.status();
        if (alive) setPhase(s.loggedIn ? 'ready' : 'connect');
      } catch {
        if (alive) setPhase('connect');
      }
    };
    check();
    return () => { alive = false; };
  }, [runtime]);

  // Browser-style tab keyboard shortcuts. Cmd/Ctrl+1..9 select, +9 = last, +T = new,
  // +Shift+T = reopen, Ctrl+Tab cycles. MUST bail while typing so it never eats Cmd+S
  // (CodeView), Cmd+Enter (Composer) or characters in the rename box. Cmd+W is left to
  // the OS on purpose — intercepting it reliably needs an Electron-menu change (deferred),
  // and getting it wrong would close the whole window.
  useEffect(() => {
    if (!isDesktop) return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (typing) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        goCompose();
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        reopenTab();
      } else if (mod && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const n = Number(e.key);
        if (n === 9) {
          if (openApps.length) setActiveAppId(openApps[openApps.length - 1].id);
        } else if (openApps[n - 1]) setActiveAppId(openApps[n - 1].id);
        setView('apps');
      } else if (e.ctrlKey && e.key === 'Tab' && openApps.length > 0) {
        e.preventDefault();
        const cur = openApps.findIndex((a) => a.id === activeAppId);
        const dir = e.shiftKey ? -1 : 1;
        const next = openApps[(cur + dir + openApps.length) % openApps.length];
        if (next) activateTab(next.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDesktop, openApps, activeAppId, goCompose, reopenTab, activateTab]);

  const isAccountView = (ACCOUNT_VIEWS as string[]).includes(view);

  // Desktop (web-parity): require a Larkwave account login BEFORE anything else (Google etc).
  // Until authenticated show OAuth full-screen. Local AI runners (any) are configured after.
  if (isDesktop) {
    // Only the FIRST load may take over the screen. A later `accountLoading` blip (token
    // refresh, while a user is already signed in) used to hit this early return and
    // unmount every open workspace — same damage as the account-view bug: dev server
    // killed, in-flight build abandoned.
    if (accountLoading && !accountUser)
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: V.layer }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: BRAND_GRADIENT, margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <ThunderboltOutlined style={{ fontSize: 28 }} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 18, color: V.text }}>Larkwave</div>
            <Spin size="large" style={{ marginTop: 16 }} />
            <div style={{ marginTop: 8, color: V.textSub }}>{t('ui.home.loadingAccount', 'Đang tải tài khoản...')}</div>
          </div>
        </div>
      );
    if (!accountUser)
      return (
        <div style={{ minHeight: '100vh', overflowY: 'auto', background: V.layer }}>
          <LoginView />
        </div>
      );
  }

  // Show partial app shell early instead of pure full-screen loading — better perceived perf.
  const showLoadingOverlay = !isAccountView && phase === 'checking';

  return (
    <AppShell
      refreshKey={builtAt}
      onSelect={onSelect}
      activeKey={selectedKey}
      cmsAllowed={cmsAllowed}
      onOpenApp={(app) => openTab(app)}
      // Only the builder view ('apps') has a "current project" — it marks that project's rows
      // "hiện tại" in the running-ports panel. ('home' is now the overview dashboard.)
      activeAppId={!isAccountView && view === 'apps' ? activeAppId : null}
      headerExtra={
        <FeedbackButton
          variant="header"
          onOpenReports={() => navigate('reports')}
          page={
            activeAppId && view === 'apps'
              ? `Sửa app: ${openApps.find((a) => a.id === activeAppId)?.name || activeAppId}`
              : String(view)
          }
        />
      }
      tabBar={
        isDesktop && openApps.length > 0 ? (
          <RunningTabStrip
            apps={openApps}
            activeId={!isAccountView && view === 'apps' ? activeAppId : null}
            pinned={pinned}
            onActivate={activateTab}
            onClose={closeTab}
            onHome={goCompose}
            onNew={goCompose}
            onRename={runtime.renameApp ? renameTab : undefined}
            onReorder={reorderTab}
            onTogglePin={togglePin}
            onCloseOthers={closeOtherTabs}
            onCloseAll={closeAllTabs}
            onReopen={reopenTab}
            canReopen={closedStack.length > 0}
          />
        ) : undefined
      }
    >
      <FixQueueDriver />
      {showLoadingOverlay && (
        // zIndex phải CAO HƠN header (20) và thanh tab (19) của AppShell — để 10 thì tiêu đề mục
        // và breadcrumb vẫn hiện xuyên qua màn chờ, trông như trang đã tải xong một nửa.
        <div style={{ position: 'fixed', inset: 0, background: V.layer, zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ textAlign: 'center', pointerEvents: 'auto' }}>
            <Spin size="large" />
            <div style={{ marginTop: 8, fontSize: 13, color: V.textSub }}>{t('ui.home.checkingAgents', 'Đang kiểm tra agents...')}</div>
          </div>
        </div>
      )}
      {isAccountView && <AccountGate view={view as AccountView} nav={navigate} onCreate={goCompose} />}
      {!isAccountView && phase === 'ready' && view === 'agents' && (
        // General "Agents chat" — a capable assistant (attachments + built-in tools). Keyed by
        // account so its per-account conversation resets on a user switch.
        <AgentChat key={accountUser?.id || '_local'} onOpenSkills={() => navigate('skills')} />
      )}
      {!isAccountView && phase === 'ready' && view === 'lark' && (
        // Key by account so switching users fully REMOUNTS the Lark screen — connection,
        // config panels and chat all re-fetch under the new account's per-account scope.
        <LarkScreen key={accountUser?.id || '_local'} onBuildApp={useTemplate} onOpenSkills={() => navigate('skills')} />
      )}
      {!isAccountView && phase === 'ready' && view === 'spec' && (
        <SpecScreen key={accountUser?.id || '_local'} onOpenChat={() => navigate('lark')} />
      )}
      {!isAccountView && phase === 'ready' && view === 'lark-files' && (
        // Khoá theo tài khoản: kho tệp chỉ liệt kê hội thoại của tài khoản đang đăng nhập, nên
        // đổi tài khoản phải gắn lại để không giữ danh sách cũ.
        <LarkFilesScreen key={accountUser?.id || '_local'} runtime={runtime} />
      )}
      {!isAccountView && phase === 'ready' && view === 'lark-auto' && (
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <Title level={4} style={{ margin: '4px 0 6px' }}>Tự động hoá Lark</Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 14 }}>
            Lên lịch chạy tự động: gửi tin nhắn / cập nhật bản ghi / gọi webhook, hoặc <b>Chạy AI agent</b> (vd đối chiếu “PBTTCN” mỗi ngày). Mẹo: trong Lark × Agents chỉ cần nhắn “mỗi ngày 9h chạy …”, agent sẽ tự tạo lịch.
          </Text>
          <AutomationsPanel runtime={runtime} />
        </div>
      )}
      {/* CMS sync runs over the Lark web session + backend, NOT the local AI runner — so it
          does NOT require `phase === 'ready'` (an AI CLI logged in). Allowlisted/admin
          accounts can open it even with no AI configured. */}
      {!isAccountView && view === 'cms-sync' && cmsAllowed && (
        <CmsSyncScreen key={accountUser?.id || '_local'} onOpenChat={() => navigate('lark')} />
      )}
      {/* MỘT màn hình, hai chế độ. Không tách thành hai component vì hai bên dùng chung toàn bộ
          đường tạo/sửa/bật-tắt kỹ năng — tách ra là chép đôi những thứ đó, rồi chúng trôi lệch. */}
      {!isAccountView && phase === 'ready' && (view === 'skills' || view === 'skills-cross') && (
        <SkillsScreen mode={view === 'skills-cross' ? 'cross' : 'plain'} onNav={navigate} onCreate={goCompose} />
      )}
      {!isAccountView && phase === 'ready' && view === 'settings' && <SettingsScreen onNav={navigate} cmsAllowed={cmsAllowed} />}
      {/* Open conversations as TABS — kept MOUNTED whenever any are open, so background builds +
          previews keep running while you switch tabs (or briefly visit another view). Visible only
          in the builder ("App của tôi"); only the ACTIVE workspace is shown. */}
      {/* Mount condition is `openApps.length > 0` ALONE. It used to also require
          `!isAccountView && phase === 'ready'`, so opening Hồ sơ or Gói & Thanh toán
          UNMOUNTED every workspace — which runs AppWorkspace's cleanup, kills the dev
          server via stopPreview and abandons the in-flight build generator (it owns the
          stream and there is no way to re-attach). Visibility is now purely a style, so
          visiting any other view can never destroy running work. */}
      {openApps.length > 0 && (
        <div
          style={{
            position: 'relative',
            display: !isAccountView && phase === 'ready' && view === 'apps' ? 'block' : 'none',
          }}
        >
          {/* The tab strip now lives in the AppShell tab bar (visible on every view). This
              block only holds the mounted workspaces. An inactive tab is hidden with
              visibility:hidden + position:absolute rather than display:none, so its layout
              box (and every inner scroll position) survives a tab switch — display:none
              destroys the layout and would reset the chat/code/preview scroll to the top.
              visibility:hidden does NOT reload the preview iframe. */}
          {openApps.map((app) => {
            const active = app.id === activeAppId;
            return (
              <div
                key={app.id}
                aria-hidden={active ? undefined : 'true'}
                style={
                  active
                    ? undefined
                    : { position: 'absolute', top: 0, left: 0, width: '100%', visibility: 'hidden', pointerEvents: 'none' }
                }
              >
                <AppWorkspace
                  appId={app.id}
                  name={app.name}
                  status={app.status}
                  deployedUrl={app.url}
                  initialBuild={initialBuilds[app.id]}
                  onBack={goCompose}
                  onDeleted={() => closeTab(app.id)}
                />
              </div>
            );
          })}
        </div>
      )}
      {/* "Tổng quan" = the overview/stats dashboard (Lark + vibe-coding apps + CMS). */}
      {!isAccountView && phase === 'ready' && view === 'home' && !activeAppId && (
        <HomeOverview
          onNav={navigate}
          onCreate={goCompose}
          onOpenApp={(app) => openTab(app)}
          onUseTemplate={useTemplate}
          onBrowseTemplates={() => setTemplatesOpen(true)}
          onImportFolder={() => void importFolder()}
          onImportGit={() => setImportOpen(true)}
          cmsAllowed={cmsAllowed}
          displayName={displayName}
        />
      )}
      {/* "App của tôi" — the merged builder: composer + your local apps + templates. Clicking an
          app opens the in-app AppWorkspace (Trò chuyện / Mã nguồn / Cơ sở dữ liệu). */}
      {!isAccountView && phase === 'ready' && view === 'apps' && !activeAppId && (
        <Space direction="vertical" size={20} style={{ width: '100%' }}>
          {/* Welcome + import row */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <Title level={3} style={{ margin: 0 }}>
              {t('ui.home.hello', 'Xin chào')}, {displayName}
            </Title>
            <Text type="secondary" style={{ fontSize: 14 }}>
              {t('ui.home.heroSub', 'Mô tả ý tưởng — AI (Claude/Grok/...) trên máy bạn sinh code, build và preview ngay.')}
            </Text>
            <div style={{ flex: 1 }} />
            <Popover
              trigger="click"
              placement="bottomRight"
              title={t('ui.home.controlFromPhone', 'Điều khiển máy từ điện thoại')}
              content={
                <div style={{ width: 210, textAlign: 'center' }}>
                  <div style={{ background: '#fff', padding: 10, borderRadius: 12, display: 'inline-block', lineHeight: 0, boxShadow: '0 1px 6px rgba(0,0,0,0.12)' }}>
                    <QRCode value="https://toolswave.net/remote/agent" size={148} bordered={false} />
                  </div>
                  <div style={{ fontSize: 12, color: V.textSub, margin: '10px 0 6px', lineHeight: 1.5 }}>
                    {t('ui.home.scanPre', 'Quét bằng')} <b>{t('ui.home.phoneCamera', 'camera điện thoại')}</b> {t('ui.home.scanPost', 'để mở “Máy của tôi” — chọn app + gửi yêu cầu sửa từ xa.')}
                  </div>
                  <Text copyable={{ text: 'https://toolswave.net/remote/agent' }} style={{ fontSize: 11, color: V.textSub }}>
                    toolswave.net/remote/agent
                  </Text>
                </div>
              }
            >
              <Button icon={<MobileOutlined />}>{t('ui.home.controlFromPhoneBtn', 'Điều khiển từ điện thoại')}</Button>
            </Popover>
            {runtime.agent?.syncApps && (
              <Button icon={<SyncOutlined />} onClick={() => setSyncModal(true)}>
                {t('ui.home.syncToPhone', 'Đồng bộ lên điện thoại')}
              </Button>
            )}
            {runtime.importLocalFolder && (
              <Button icon={<FolderOpenOutlined />} loading={importingFolder} onClick={() => void importFolder()}>
                {t('ui.home.importFolder', 'Nhập từ thư mục')}
              </Button>
            )}
            {runtime.gitImportLocal && (
              <Button icon={<CloudDownloadOutlined />} onClick={() => setImportOpen(true)}>
                {t('ui.home.importGit', 'Nhập từ Git')}
              </Button>
            )}
            {runtime.migrateApp && migratable.length > 0 && (
              <Button icon={<ApartmentOutlined />} onClick={() => setMigrateOpen(true)}>
                {t('ui.home.updateStructure', 'Cập nhật cấu trúc')} ({migratable.length})
              </Button>
            )}
          </div>

          <div id="tw-composer">
            <Composer
              promptValue={draft}
              onPromptChange={setDraft}
              initialTrack={builderTrack as ('web' | 'mobile' | 'desktop' | 'game' | 'extension') | undefined}
              onBrowseTemplates={() => setTemplatesOpen(true)}
              onBuilt={() => setBuiltAt(Date.now())}
              onOpenWorkspace={(appId, build) => {
                // Land straight in a NEW workspace tab; it runs the first build itself.
                setDraft('');
                openTab(
                  {
                    id: appId,
                    name: build.projectName
                      ? `${build.projectName}-workspace`
                      : build.prompt.split('\n')[0].slice(0, 50) || t('ui.home.newApp', 'App mới'),
                    status: 'building',
                    updatedAt: new Date().toISOString(),
                  },
                  build,
                );
              }}
            />
          </div>

          {/* Local apps (full list with category folders / drag / rename). Templates are no
              longer a standalone section here — they live INSIDE the create flow (the composer's
              "Mẫu" button opens the picker), so this page reads: toolbar → create → your apps. */}
          <div id="tw-apps">
            <Title level={4} style={{ margin: '4px 0 10px' }}>{t('ui.home.myApps', 'App của tôi')}</Title>
            <AppsGrid refreshKey={builtAt} embedded organizable trackFilter={builderTrack} onOpen={(app) => openTab(app)} />
          </div>
        </Space>
      )}

      {/* Hidden folder picker for "Nhập từ thư mục" — reliable renderer input (not the native
          dialog); onChange resolves the real path + imports by path. */}
      <input ref={folderInputRef} type="file" multiple style={{ display: 'none' }} onChange={onFolderPicked} />

      {/* Starter-template picker — templates now live INSIDE the create flow (opened from the
          composer's "Mẫu" button), instead of a standalone section on "App của tôi". */}
      <Modal
        open={templatesOpen}
        onCancel={() => setTemplatesOpen(false)}
        title={null}
        width={screens.md ? 860 : '94vw'}
        footer={null}
        styles={{ body: { maxHeight: '68vh', overflow: 'auto', paddingTop: 8 } }}
      >
        <TemplateGallery
          onUse={(prompt) => {
            setTemplatesOpen(false);
            useTemplate(prompt);
          }}
        />
      </Modal>

      {/* Git-import modal — outside the view blocks so "Nhập từ Git" works from home AND "App của tôi". */}
      {runtime.gitImportLocal && (
        <GitImportModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onImported={(app) => {
            setImportOpen(false);
            setBuiltAt(Date.now());
            openTab({ id: app.id, name: app.name, status: 'ready', updatedAt: new Date().toISOString() });
          }}
        />
      )}
      {runtime.agent?.syncApps && (
        <SyncToPhoneModal open={syncModal} onClose={() => setSyncModal(false)} />
      )}
      {runtime.migrateApp && (
        <Modal
          open={migrateOpen}
          title={t('ui.home.migrateTitle', 'Cập nhật cấu trúc thư mục cho dự án cũ')}
          onCancel={() => !migRunning && setMigrateOpen(false)}
          width={screens.md ? 520 : '94vw'}
          maskClosable={!migRunning}
          footer={[
            <Button key="close" disabled={migRunning} onClick={() => setMigrateOpen(false)}>
              {t('ui.home.close', 'Đóng')}
            </Button>,
            <Button key="run" type="primary" loading={migRunning} disabled={!migratable.length} onClick={() => void runMigrateAll()}>
              {migRunning ? t('ui.home.updating', 'Đang cập nhật…') : `${t('ui.home.updateAll', 'Cập nhật tất cả')} (${migratable.length})`}
            </Button>,
          ]}
        >
          <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 12 }}>
            {t('ui.home.migrateDesc1', 'Các dự án cũ (lưu phẳng) sẽ được sắp xếp lại thành')} <b>{'{tên}-workspace / {tên}-home'}</b> {t('ui.home.migrateDesc2', '(mã nguồn vào thư mục con). Mỗi dự án được')} <b>{t('ui.home.migrateBackup', 'SAO LƯU')}</b> {t('ui.home.migrateDesc3', 'trước khi đổi nên khôi phục được. App đang mở preview sẽ dừng để sắp xếp.')}
          </Text>
          {migratable.length === 0 ? (
            <Text type="secondary">{t('ui.home.migrateNone', 'Không còn dự án nào cần cập nhật — tất cả đã ở cấu trúc mới.')}</Text>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflow: 'auto' }}>
              {migratable.map((a) => {
                const st = migStatus[a.id];
                const icon =
                  st === 'ok' || st === 'skip' ? (
                    <CheckCircleOutlined style={{ color: '#16B98D' }} />
                  ) : st === 'err' ? (
                    <CloseCircleOutlined style={{ color: '#EF4444' }} />
                  ) : st === 'running' ? (
                    <Spin size="small" />
                  ) : (
                    <ApartmentOutlined style={{ color: V.textFaint }} />
                  );
                const nm = migNames[a.id] ?? a.name ?? '';
                return (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: V.surfaceAlt }}>
                    <span style={{ fontSize: 15 }}>{icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Input
                        size="small"
                        maxLength={30}
                        value={nm}
                        disabled={migRunning}
                        placeholder={t('ui.home.shortName', 'Tên ngắn cho dự án (≤30)')}
                        onChange={(e) => setMigNames((m) => ({ ...m, [a.id]: e.target.value }))}
                      />
                      <div style={{ fontSize: 11, color: V.textFaint, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        → {slugify30(nm)}-workspace / {slugify30(nm)}-home
                      </div>
                    </div>
                    {st === 'err' && <Text type="danger" style={{ fontSize: 11.5 }}>{t('ui.home.migErr', 'lỗi')}</Text>}
                    {st === 'skip' && <Text type="secondary" style={{ fontSize: 11.5 }}>{t('ui.home.migSkip', 'đã có')}</Text>}
                    {st === 'ok' && <Text style={{ fontSize: 11.5, color: '#16B98D' }}>{t('ui.home.migOk', 'xong')}</Text>}
                  </div>
                );
              })}
            </div>
          )}
        </Modal>
      )}
    </AppShell>
  );
}
