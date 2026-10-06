'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { App as AntApp, ConfigProvider, Layout, Menu, Button, Dropdown, Tooltip, Modal, Tag, Input, Badge, Drawer, Typography } from 'antd';
import { DashboardOutlined, AppstoreOutlined, CompassOutlined, ApiOutlined, BulbOutlined, NodeIndexOutlined, BugOutlined, UserOutlined, SettingOutlined, ThunderboltOutlined, RobotOutlined, MessageOutlined, PartitionOutlined, CloudServerOutlined, MenuOutlined, PlusOutlined, LogoutOutlined, PushpinOutlined, PushpinFilled, CommentOutlined, NotificationOutlined, VideoCameraOutlined, FileImageOutlined, ReadOutlined, GlobalOutlined, MobileOutlined, DesktopOutlined, PlayCircleOutlined, ChromeOutlined, TeamOutlined, TrophyOutlined, CrownOutlined, FieldTimeOutlined, FolderOpenOutlined } from '@ant-design/icons';
import type { AppSummary, ClaudeStatus, RunnerStatusInfo } from '@larkwave/core';
import { lightTheme, darkTheme, BRAND_GRADIENT, BRAND, V } from '../theme';
import { ThemeProvider, useThemeMode } from '../ThemeProvider';
import { useI18n, type Locale } from '../i18n';
import { useRuntime } from '../RuntimeProvider';
import { loadCats, onCatsChange, isPinned, togglePin, type CatStore } from '../convCategories';
import { onAppsChange, mergeOptimistic } from '../appEvents';
import { useRunningPreviews } from '../useRunningPreviews';
import { MessengerWidget } from '../account/MessengerWidget';
import { RunningPreviews } from './RunningPreviews';
import { UpdateBanner } from './UpdateBanner';
import { VersionFooter } from './VersionFooter';
import { AgentGuideModal } from './AgentGuideModal';
import { AgentActivity } from './AgentActivity';
import { NetworkBanner } from './NetworkBanner';
import { useAccountAuth } from '../account/auth';
import { UserAvatar } from '../account/UserAvatar';

const { Sider, Header, Content } = Layout;

// "Tổng quan" is a STANDALONE top-level item (first) — it aggregates data from EVERYTHING
// (apps + Lark + CMS), so it doesn't belong inside the Vibe Coding group.
const OVERVIEW_ITEM = { key: 'tw-composer', label: 'Tổng quan', icon: <DashboardOutlined /> };
// "Làm app" cluster — one entry per app TYPE (each presets the builder's Loại app + filters the
// library). "Tất cả app" is the unfiltered library. Khám phá/Integrations moved out (standalone).
const APP_NAV = [
  { key: 'tw-apps', label: 'Tất cả app', icon: <AppstoreOutlined /> },
  { key: 'tw-app-web', label: 'Website', icon: <GlobalOutlined /> },
  { key: 'tw-app-mobile', label: 'App mobile', icon: <MobileOutlined /> },
  { key: 'tw-app-desktop', label: 'App desktop', icon: <DesktopOutlined /> },
  { key: 'tw-app-game', label: 'Game', icon: <PlayCircleOutlined /> },
  { key: 'tw-app-extension', label: 'Tiện ích', icon: <ChromeOutlined /> },
];
// Standalone community/integration items (were inside the old Vibe group).
const EXTRA_NAV = [
  { key: 'tw-explore', label: 'Khám phá', icon: <CompassOutlined /> },
  { key: 'tw-friends', label: 'Bạn bè', icon: <TeamOutlined /> },
  { key: 'tw-leaderboard', label: 'Xếp hạng', icon: <TrophyOutlined /> },
  { key: 'tw-integrations', label: 'Integrations', icon: <ApiOutlined /> },
];
// Top-level items outside any group.
const TOP_NAV = [
  { key: 'tw-reports', label: 'Báo lỗi', icon: <BugOutlined /> },
  { key: 'tw-pricing', label: 'Gói & Thanh toán', icon: <CrownOutlined /> },
  // Đặt cạnh Gói & Thanh toán: dung lượng cũng là thứ tính theo gói và mua thêm được.
  { key: 'tw-storage', label: 'Dung lượng', icon: <CloudServerOutlined /> },
  { key: 'tw-profile', label: 'Hồ sơ', icon: <UserOutlined /> },
];

function scrollTo(id: string) {
  if (typeof document !== 'undefined') document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
}

/** Crescent moon (light mode → click to go dark). currentColor so antd tints it. */
function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ verticalAlign: '-0.125em' }}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

/** Sun (dark mode → click to go light). */
function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ verticalAlign: '-0.125em' }}>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2v2.5M12 19.5V22M4.22 4.22l1.77 1.77M18.01 18.01l1.77 1.77M2 12h2.5M19.5 12H22M4.22 19.78l1.77-1.77M18.01 5.99l1.77-1.77" />
    </svg>
  );
}

function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <span
      style={{
        display: 'inline-flex', minWidth: size, width: size, height: size, borderRadius: size * 0.32,
        alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.5), color: '#fff',
        background: BRAND_GRADIENT, boxShadow: '0 6px 16px rgba(108,92,231,0.30)',
      }}
    >
      <ThunderboltOutlined />
    </span>
  );
}

/** Larkwave account (Google/email login) shown in sidebar for desktop. Primary identity. */
function UserBlock({ collapsed }: { collapsed: boolean }) {
  const { user, logout } = useAccountAuth();
  if (!user) return null;

  const doLogout = () => {
    logout();
    if (typeof window !== 'undefined') window.location.reload();
  };

  const menu = {
    items: [
      { key: 'who', disabled: true, label: user.email },
      { type: 'divider' as const },
      { key: 'logout', icon: <LogoutOutlined />, danger: true, label: 'Đăng xuất', onClick: doLogout },
    ],
  };

  return (
    <div style={{ padding: collapsed ? 8 : 12, borderTop: `1px solid ${V.borderSub}` }}>
      <Dropdown menu={menu} placement="topLeft" trigger={['click']}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: collapsed ? '8px 0' : '8px 10px', borderRadius: 12, cursor: 'pointer', justifyContent: collapsed ? 'center' : 'flex-start' }}>
          <UserAvatar name={user.name} avatarUrl={user.avatarUrl} size={34} />
          {!collapsed && (
            <div style={{ minWidth: 0, lineHeight: 1.25, flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: V.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.name || user.email?.split('@')[0] || 'Người dùng'}
              </div>
              <div style={{ marginTop: 2, fontSize: 11, color: V.textSub }}>{user.email}</div>
            </div>
          )}
        </div>
      </Dropdown>
    </div>
  );
}

/** Multi-agents status in sidebar footer. Shows main user above, then list of connected agents (Claude/Grok/etc) so user knows what they have.
 *  Quick hint for settings/skills of agents.
 */
function AgentsBlock({ collapsed }: { collapsed: boolean }) {
  const runtime = useRuntime();
  const [runners, setRunners] = useState<RunnerStatusInfo[]>([]);
  /** The agent whose setup-guide modal is open (click a tag → guide). */
  const [guide, setGuide] = useState<RunnerStatusInfo | null>(null);

  useEffect(() => {
    if (!runtime.runners) return;
    let alive = true;
    runtime.runners.list().then((list) => { if (alive) setRunners(list); }).catch(() => {});
    return () => { alive = false; };
  }, [runtime]);

  if (!runtime.runners || runners.length === 0) return null;

  const readyCount = runners.filter(r => r.ready).length;
  // Collapsed sidebar is ~72px — full labels ("Claude CLI") overflow/wrap ugly. Show a
  // 2-char abbreviation instead; the tooltip still carries the full name + status.
  const shortLabel = (id: string): string =>
    (({ claude: 'Cl', grok: 'Gk', gemini: 'Gm', codex: 'Cx' } as Record<string, string>)[id] ?? id.slice(0, 2));

  return (
    <div style={{ padding: collapsed ? 8 : 12, borderTop: `1px solid ${V.borderSub}` }}>
      {!collapsed && (
        <div style={{ fontSize: 11, fontWeight: 600, color: V.textSub, marginBottom: 6, paddingLeft: 4 }}>
          Agents ({readyCount}/{runners.length} sẵn sàng)
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: collapsed ? 'center' : 'flex-start' }}>
        {runners.map((r) => (
          <Tooltip key={r.id} title={`${r.label} — ${r.ready ? 'Sẵn sàng' : r.installed ? (r.loggedIn ? 'Thiếu model/key' : 'Cần key') : 'Chưa cài'} · bấm để xem hướng dẫn`}>
            <Tag
              onClick={() => setGuide(r)}
              style={{
                margin: 0,
                fontSize: collapsed ? 9 : 10,
                cursor: 'pointer',
                padding: collapsed ? '0 5px' : undefined,
                lineHeight: collapsed ? '18px' : undefined,
              }}
              color={r.ready ? 'success' : r.installed ? (r.loggedIn ? 'warning' : 'default') : 'default'}
            >
              {collapsed ? shortLabel(r.id) : r.label}
            </Tag>
          </Tooltip>
        ))}
      </div>
      {!collapsed && (
        <div style={{ fontSize: 10, color: V.textFaint, marginTop: 6, paddingLeft: 4 }}>
          Bấm một agent để xem <b>hướng dẫn cài đặt</b> · hoặc vào <b>Cài đặt</b> / <b>Kỹ năng</b>
        </div>
      )}
      <AgentGuideModal
        runtime={runtime}
        runner={guide}
        onClose={() => setGuide(null)}
        onChanged={(list) => {
          setRunners(list);
          setGuide((g) => (g ? list.find((x) => x.id === g.id) ?? g : null));
        }}
      />
    </div>
  );
}

/**
 * GPT-style conversation organizer in the sidebar: conversations (= local apps) grouped into
 * CATEGORIES (folders) you create; double-click to rename a conversation; drag a conversation into
 * a folder. Click opens it (onOpenApp). Categories are a per-machine localStorage layer shared with
 * the "App của tôi" grid.
 */
function SidebarRecent({
  collapsed,
  refreshKey,
  onOpenApp,
  onSeeAll,
}: {
  collapsed: boolean;
  refreshKey?: number;
  onOpenApp?: (app: AppSummary) => void;
  onSeeAll?: () => void;
}) {
  const runtime = useRuntime();
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [store, setStore] = useState<CatStore>(loadCats);
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');

  useEffect(() => {
    let alive = true;
    const load = () =>
      runtime.listApps().then((a) => alive && setApps(mergeOptimistic(a))).catch(() => alive && setApps([]));
    void load();
    const off = onAppsChange(load); // live cross-tab sync of the conversation list
    return () => {
      alive = false;
      off();
    };
  }, [runtime, refreshKey]);
  useEffect(() => onCatsChange(() => setStore(loadCats())), []);

  if (collapsed) return null;

  const saveRename = async (a: AppSummary) => {
    const name = editVal.trim().slice(0, 80);
    setEditId(null);
    if (!name || name === a.name || !runtime.renameApp) return;
    try {
      await runtime.renameApp(a.id, name);
      setApps((p) => p.map((x) => (x.id === a.id ? { ...x, name } : x)));
    } catch {
      /* ignore */
    }
  };

  // Sidebar shows a compact list: PINNED first, then most-recent. Capped at 5 (pinned always
  // shown even beyond the cap). Full organization (folders/drag) lives in the "App của tôi" grid.
  const byRecent = (x: AppSummary, y: AppSummary) =>
    (Date.parse(y.updatedAt || '') || 0) - (Date.parse(x.updatedAt || '') || 0);
  const pinnedApps = apps.filter((a) => isPinned(store, a.id)).sort(byRecent);
  const restApps = apps.filter((a) => !isPinned(store, a.id)).sort(byRecent);
  const LIMIT = 5;
  const visible = [...pinnedApps, ...restApps].slice(0, Math.max(LIMIT, pinnedApps.length));
  const hiddenCount = apps.length - visible.length;

  const convRow = (a: AppSummary) => {
    const pinned = isPinned(store, a.id);
    return (
      <div
        key={a.id}
        onClick={() => editId !== a.id && onOpenApp?.(a)}
        onDoubleClick={() => {
          if (runtime.renameApp) {
            setEditId(a.id);
            setEditVal(a.name || '');
          }
        }}
        title={runtime.renameApp ? `${a.name} — double-click để đổi tên` : a.name}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 8, cursor: 'pointer', color: V.textSub }}
      >
        <span style={{ width: 18, height: 18, minWidth: 18, borderRadius: 6, background: 'rgba(108,92,231,0.12)', color: BRAND, fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          {(a.name || 'A').charAt(0).toUpperCase()}
        </span>
        {editId === a.id ? (
          <Input
            size="small"
            autoFocus
            value={editVal}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setEditVal(e.target.value)}
            onPressEnter={() => void saveRename(a)}
            onBlur={() => void saveRename(a)}
            style={{ height: 22, fontSize: 12, padding: '0 6px' }}
          />
        ) : (
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {a.name}
          </span>
        )}
        <button
          type="button"
          title={pinned ? 'Bỏ ghim' : 'Ghim lên đầu'}
          onClick={(e) => {
            e.stopPropagation();
            togglePin(a.id);
            setStore(loadCats());
          }}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: pinned ? BRAND : V.textFaint, padding: 0, fontSize: 12, lineHeight: 1, opacity: pinned ? 1 : 0.55 }}
        >
          {pinned ? <PushpinFilled /> : <PushpinOutlined />}
        </button>
      </div>
    );
  };

  return (
    <div style={{ padding: '10px 10px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 6px 6px' }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', color: V.textFaint, flex: 1 }}>
          Hội thoại
        </span>
      </div>
      {!apps.length && (
        <div style={{ fontSize: 11.5, color: V.textFaint, padding: '2px 8px' }}>Chưa có hội thoại nào.</div>
      )}
      {visible.map(convRow)}
      {hiddenCount > 0 && (
        <div
          onClick={() => onSeeAll?.()}
          style={{ padding: '6px 8px 2px', fontSize: 12, color: BRAND, cursor: 'pointer', fontWeight: 600 }}
        >
          Xem tất cả ({apps.length}) →
        </div>
      )}
    </div>
  );
}

const NAV_TITLE: Record<string, string> = {
  'tw-composer': 'Tổng quan',
  'tw-agents': 'Trợ lý AI',
  'tw-lark': 'Lark × Agents',
  'tw-lark-spec': 'Đặc tả hệ thống',
  'tw-lark-files': 'Tệp đã gửi cho Lark Agents',
  'tw-lark-auto': 'Tự động hoá (lịch)',
  'tw-cms-sync': 'Đồng bộ Bitable (CMS)',
  'tw-skills': 'Kỹ năng (Skills)',
  'tw-skills-cross': 'Kỹ năng chéo (kiểm chéo liên tục)',
  'tw-apps': 'App của tôi',
  'tw-explore': 'Khám phá',
  'tw-friends': 'Bạn bè',
  'tw-leaderboard': 'Xếp hạng',
  'tw-integrations': 'Integrations',
  'tw-reports': 'Báo lỗi',
  'tw-pricing': 'Gói & Thanh toán',
  'tw-storage': 'Dung lượng',
  'tw-profile': 'Hồ sơ & Gói',
  'tw-settings': 'Cài đặt',
};

/** Nav item key → i18n message key (translate the SIDEBAR menu labels at render; the raw
 *  Vietnamese label is passed as the fallback so it never renders blank before the dictionary
 *  is merged). Module-scope consts (OVERVIEW_ITEM/VIBE_NAV/TOP_NAV) + inline string labels. */
const NAV_I18N: Record<string, string> = {
  'tw-composer': 'app.nav.overview',
  'grp-app': 'nav.makeApp',
  'tw-apps': 'app.nav.myApps',
  'tw-explore': 'app.nav.explore',
  'tw-integrations': 'app.nav.integrations',
  'tw-agents': 'app.nav.assistant',
  'grp-lark': 'app.nav.lark',
  'tw-lark': 'app.nav.larkAgents',
  'tw-lark-spec': 'app.nav.larkSpec',
  'tw-lark-files': 'app.nav.larkFiles',
  'tw-cms-sync': 'app.nav.cmsSync',
  'tw-skills': 'app.nav.skills',
  'tw-skills-cross': 'app.nav.skillsCross',
  'tw-reports': 'app.nav.reports',
  'tw-profile': 'app.nav.profile',
  'tw-settings': 'app.nav.settings',
};

/** Selected nav key → i18n message key for the HEADER section title (some titles differ from the
 *  sidebar label, e.g. "Đặc tả hệ thống" vs "Đặc tả"). */
const NAV_TITLE_I18N: Record<string, string> = {
  'tw-composer': 'app.nav.overview',
  'tw-agents': 'app.nav.assistant',
  'tw-lark': 'app.nav.larkAgents',
  'tw-lark-spec': 'app.title.larkSpec',
  'tw-cms-sync': 'app.title.cmsSync',
  'tw-skills': 'app.title.skills',
  'tw-skills-cross': 'app.title.skillsCross',
  'tw-apps': 'app.nav.myApps',
  'tw-explore': 'app.nav.explore',
  'tw-integrations': 'app.nav.integrations',
  'tw-reports': 'app.nav.reports',
  'tw-profile': 'app.nav.profile',
  'tw-settings': 'app.nav.settings',
};

/**
 * Watches for the main-process "Lark web session expired" push and raises a persistent,
 * app-wide notification with a one-click re-login — so the user is told the moment the
 * session dies (not silently, and not only after opening a panel). Mounted inside <AntApp>.
 */
function SessionDeadWatcher() {
  const runtime = useRuntime();
  const { notification } = AntApp.useApp();
  useEffect(() => {
    if (!runtime.onLarkWebSessionDead) return;
    return runtime.onLarkWebSessionDead(() => {
      notification.warning({
        key: 'lark-web-session-dead',
        message: 'Phiên Lark web đã hết hạn',
        description: 'Cần đăng nhập lại để tiếp tục đồng bộ Bitable / tự động hoá.',
        duration: 0,
        btn: (
          <Button
            type="primary"
            size="small"
            onClick={() => {
              notification.destroy('lark-web-session-dead');
              runtime.larkWebConnect?.();
            }}
          >
            Đăng nhập lại Lark
          </Button>
        ),
      });
    });
  }, [runtime, notification]);
  return null;
}

/**
 * Full dashboard shell (sidebar + header) — mirrors the website's AppShell.
 * `onSelect` (desktop) turns the sidebar into a real VIEW SWITCHER: the parent
 * decides what to render per nav key. Without it (web), nav scrolls in-page.
 */
export function AppShell(props: Parameters<typeof AppShellInner>[0]) {
  // ThemeProvider owns the light/dark choice (persisted + mirrored onto <html data-theme>);
  // AppShellInner reads it to pick the matching antd ThemeConfig.
  return (
    <ThemeProvider>
      <AppShellInner {...props} />
    </ThemeProvider>
  );
}

function AppShellInner({
  children,
  sectionTitle = 'Tổng quan',
  refreshKey,
  onSelect,
  cmsAllowed = false,
  activeKey,
  activeAppId,
  onOpenApp,
  tabBar,
  headerExtra,
}: {
  children: ReactNode;
  sectionTitle?: string;
  refreshKey?: number;
  onSelect?: (key: string) => void;
  /** Show the "Đồng bộ Bitable (CMS)" entry — admins + an email allowlist (jobs are backend-global). */
  cmsAllowed?: boolean;
  /** Controlled sidebar selection (desktop) — lets the parent navigate
   *  programmatically (e.g. clicking a KPI tile) and keep the rail in sync. */
  activeKey?: string;
  /** The project the user is currently looking at (desktop tabs). Only used to mark "hiện tại"
   *  in the running-ports panel and to split its count into "of this project" vs the global total. */
  activeAppId?: string | null;
  /** Open a conversation (app) from the sidebar organizer — desktop wires this to its tabs. */
  onOpenApp?: (app: AppSummary) => void;
  /** Open-project tab strip, rendered sticky under the header on every view. */
  tabBar?: ReactNode;
  /** Extra controls rendered in the header toolbar (right side) — e.g. the "Báo lỗi" button. */
  headerExtra?: ReactNode;
}) {
  const runtime = useRuntime();
  const { mode, toggle } = useThemeMode();
  const { t, locale, setLocale } = useI18n();
  // Nav rail DEFAULTS to collapsed (focused view); the user opens it if they want, and it persists.
  const [collapsed, setCollapsed] = useState(true);
  const applyCollapsed = (next: boolean) => {
    setCollapsed(next);
    try {
      localStorage.setItem('tw_nav_collapsed', next ? '1' : '0');
    } catch {
      /* ignore */
    }
  };
  useEffect(() => {
    try {
      const v = localStorage.getItem('tw_nav_collapsed');
      if (v !== null) setCollapsed(v === '1');
    } catch {
      /* ignore */
    }
  }, []);
  const [internalSelected, setInternalSelected] = useState('tw-composer');
  const selected = activeKey ?? internalSelected;
  // In-app friend DMs — header inbox button drives the list; MessengerWidget owns the chat windows.
  const isDesktop = runtime.kind === 'desktop';
  const [msgOpen, setMsgOpen] = useState(false);
  const [msgUnread, setMsgUnread] = useState(0);
  // Local dev servers running right now (shared 4s poll — the drawer reuses this one timer).
  const { rows: runningRows } = useRunningPreviews();
  const [portsOpen, setPortsOpen] = useState(false);
  const [portsApps, setPortsApps] = useState<AppSummary[]>([]);
  const showPorts = isDesktop && !!runtime.listRunningPreviews;

  // Names for the ports panel — listApps() is a readdir + N meta.json reads, so only while open.
  useEffect(() => {
    if (!portsOpen) return;
    let alive = true;
    runtime.listApps().then((a) => alive && setPortsApps(a)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [portsOpen, runtime, refreshKey]);

  // Stable identity: the panel treats a passed map as "the host owns the names" and skips its own fetch.
  const portsNames = useMemo(() => Object.fromEntries(portsApps.map((a) => [a.id, a.name])), [portsApps]);
  /** The panel hands back an appId; the tab API wants the AppSummary, so resolve it here. */
  const openAppById = (id: string) => {
    const app = portsApps.find((a) => a.id === id);
    if (!app) return;
    setPortsOpen(false);
    onOpenApp?.(app);
  };
  const mineCount = activeAppId ? runningRows.filter((r) => r.appId === activeAppId).length : 0;

  const go = (key: string) => {
    setInternalSelected(key);
    if (key === 'pricing' && !onSelect) {
      // Web has no view switcher — open the hosted pricing page.
      runtime.openExternal?.('https://toolswave.net/pricing');
      return;
    }
    if (onSelect) onSelect(key); // parent switches the view (desktop)
    else scrollTo(key); // in-page scroll (web)
  };

  const sidebar = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, height: 60, padding: collapsed ? 0 : '0 18px', justifyContent: collapsed ? 'center' : 'flex-start', borderBottom: `1px solid ${V.borderSub}` }}>
        <LogoMark />
        {!collapsed && <span style={{ fontWeight: 800, letterSpacing: 1, fontSize: 16, color: V.text }}>TOOLSWAVE</span>}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', paddingTop: 10 }}>
        <Menu
          mode="inline"
          selectedKeys={[selected]}
          style={{ borderInlineEnd: 'none', background: 'transparent' }}
          onClick={({ key }) => go(key)}
          defaultOpenKeys={['grp-app', 'grp-lark']}
          items={(() => {
            type NavNode = { key: string; label: ReactNode; icon: ReactNode; children?: NavNode[] };
            // "Vibe Coding" GROUP: apps + explore + integrations (Tổng quan is top-level; Skills is
            // its own standalone item — categorized by free-form tags, shared by app-building + Lark).
            const vibeGroup: NavNode = { key: 'grp-app', label: 'Làm app', icon: <ThunderboltOutlined />, children: [...APP_NAV] };
            // "Lark" GROUP: chat, living spec, CMS sync.
            const larkChildren: NavNode[] = [];
            if (runtime.larkChat) {
              larkChildren.push({ key: 'tw-lark', label: 'Lark × Agents', icon: <MessageOutlined /> });
              larkChildren.push({ key: 'tw-lark-spec', label: 'Đặc tả', icon: <PartitionOutlined /> });
              // Kho tệp đính kèm — chỉ hiện khi lõi có hỗ trợ (bản cài cũ chưa có kênh này).
              if (runtime.larkListFiles)
                larkChildren.push({ key: 'tw-lark-files', label: 'Tệp đã gửi', icon: <FolderOpenOutlined /> });
              if (runtime.larkListAutomations) larkChildren.push({ key: 'tw-lark-auto', label: 'Tự động hoá', icon: <FieldTimeOutlined /> });
            }
            // The CMS sync jobs live on a shared backend with no per-user scoping. Visible to admins
            // + a specific email allowlist — they all see the SAME global jobs.
            if (cmsAllowed && runtime.cmsSyncListJobs) larkChildren.push({ key: 'tw-cms-sync', label: 'Đồng bộ Bitable', icon: <CloudServerOutlined /> });
            const list: NavNode[] = [OVERVIEW_ITEM, vibeGroup];
            // General "Agents chat" — a capable assistant (desktop CLI). Standalone, top-level.
            //
            // ẨN Ở BẢN DESKTOP (yêu cầu của người dùng): ở đó mọi việc đã đi qua nhóm Lark, nên một
            // ô chat đa năng thứ hai chỉ làm người dùng phải chọn giữa hai cửa vào mà không có gì
            // nói cho họ biết nên vào cửa nào. Trên WEB thì giữ — ở đó không có nhóm Lark, đây là
            // đường trò chuyện duy nhất.
            //
            // Chỉ gỡ khỏi MENU, KHÔNG xoá `AgentChat`: màn hình vẫn dựng được khi `view === 'agents'`,
            // nên bản web dùng nguyên như cũ và bật lại ở desktop chỉ là bỏ một điều kiện.
            if (runtime.larkChat && runtime.kind !== 'desktop')
              list.push({
                key: 'tw-agents',
                icon: <CommentOutlined style={{ color: BRAND }} />,
                label: (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontWeight: 600 }}>{t('app.nav.assistant', 'Trợ lý AI')}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.3, color: '#fff', background: BRAND_GRADIENT, padding: '1px 6px', borderRadius: 6, lineHeight: '14px' }}>{t('app.nav.assistantBadge', 'ĐA NĂNG')}</span>
                  </span>
                ),
              });
            // Kỹ năng vào THẲNG nhóm Lark, và tách làm hai mục.
            //
            // Vì sao tách: hai thứ này chạy theo hai luồng khác hẳn nhau. "Kỹ năng" là quy tắc rời,
            // AI tự áp khi yêu cầu khớp mô tả — không có thứ tự, không ai chờ ai. "Kỹ năng chéo" là
            // một bộ nối nhau bằng khoá, chạy theo thứ tự suy ra từ dữ liệu và kiểm chéo sau mỗi
            // bước. Gộp chung một danh sách thì mọi câu hướng dẫn đều phải nói "nếu là loại A
            // thì…, nếu loại B thì…", và người dùng phải tự phân loại trước khi hiểu được gì.
            if (runtime.listSkills) {
              larkChildren.push({ key: 'tw-skills', label: 'Kỹ năng', icon: <BulbOutlined /> });
              larkChildren.push({ key: 'tw-skills-cross', label: 'Kỹ năng chéo', icon: <NodeIndexOutlined /> });
            }
            if (larkChildren.length) list.push({ key: 'grp-lark', label: 'Lark', icon: <RobotOutlined />, children: larkChildren });
            list.push(...EXTRA_NAV);
            list.push(...TOP_NAV);
            // Desktop only: an "AI runners + remote control" settings entry at the end.
            if (runtime.runners) list.push({ key: 'tw-settings', label: 'Cài đặt', icon: <SettingOutlined /> });
            // Translate string labels via NAV_I18N (JSX labels — e.g. the "Trợ lý AI" badge item —
            // are already localized inline and pass through untouched). Raw label = the fallback.
            const navLabel = (node: NavNode): ReactNode =>
              NAV_I18N[node.key] && typeof node.label === 'string' ? t(NAV_I18N[node.key], node.label) : node.label;
            return list.map((n) => ({
              key: n.key,
              icon: n.icon,
              label: navLabel(n),
              ...(n.children ? { children: n.children.map((c) => ({ ...c, label: navLabel(c) })) } : {}),
            }));
          })()}
        />
        <SidebarRecent collapsed={collapsed} refreshKey={refreshKey} onOpenApp={onOpenApp} onSeeAll={() => go('tw-apps')} />
      </div>
      {isDesktop && <UserBlock collapsed={collapsed} />}
      <AgentsBlock collapsed={collapsed} />
      <VersionFooter collapsed={collapsed} />
    </div>
  );

  return (
    <ConfigProvider theme={mode === 'dark' ? darkTheme : lightTheme}>
      <AntApp message={{ maxCount: 3 }} notification={{ placement: 'topRight' }}>
        <SessionDeadWatcher />
        <Layout style={{ minHeight: '100vh', background: V.layer }}>
          <Sider width={248} collapsedWidth={72} collapsible collapsed={collapsed} trigger={null}
            style={{ position: 'sticky', top: 0, height: '100vh', background: V.surface, borderRight: `1px solid ${V.border}` }}>
            {sidebar}
          </Sider>
          <Layout style={{ background: 'transparent' }}>
            <Header style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 14, padding: '0 20px', height: 60, background: mode === 'dark' ? 'rgba(24,27,36,0.82)' : 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)', borderBottom: `1px solid ${V.border}` }}>
              <Tooltip title={collapsed ? 'Mở rộng' : 'Thu gọn'}>
                <Button type="text" icon={<MenuOutlined />} onClick={() => applyCollapsed(!collapsed)} />
              </Tooltip>
              <span style={{ fontWeight: 700, fontSize: 16, color: V.text }}>
                {onSelect
                  ? NAV_TITLE[selected]
                    ? t(NAV_TITLE_I18N[selected] ?? '', NAV_TITLE[selected])
                    : sectionTitle
                  : sectionTitle}
              </span>
              <div style={{ flex: 1 }} />
              {headerExtra}
              <Tooltip title={locale === 'en' ? 'Chuyển sang Tiếng Việt' : 'Switch to English'}>
                <Button
                  type="text"
                  aria-label={t('app.lang.label', 'Ngôn ngữ')}
                  onClick={() => setLocale((locale === 'en' ? 'vi' : 'en') as Locale)}
                  style={{ fontWeight: 700, fontSize: 12.5, minWidth: 40 }}
                >
                  {locale === 'en' ? 'EN' : 'VI'}
                </Button>
              </Tooltip>
              <Tooltip title={mode === 'dark' ? 'Chuyển chế độ sáng' : 'Chuyển chế độ tối'}>
                <Button
                  type="text"
                  aria-label="Chế độ sáng/tối"
                  icon={mode === 'dark' ? <SunIcon /> : <MoonIcon />}
                  onClick={toggle}
                />
              </Tooltip>
              {isDesktop && (
                <Tooltip title="Tin nhắn">
                  <Badge count={msgUnread} size="small" offset={[-2, 4]}>
                    <Button type="text" icon={<MessageOutlined />} onClick={() => setMsgOpen((o) => !o)} />
                  </Badge>
                </Tooltip>
              )}
              {showPorts && (
                <Tooltip
                  title={
                    mineCount > 0
                      ? `Cổng đang chạy — ${runningRows.length} dev server (${mineCount} của dự án này)`
                      : 'Cổng đang chạy'
                  }
                >
                  <Badge count={runningRows.length} size="small" offset={[-2, 4]}>
                    <Button type="text" aria-label="Cổng đang chạy" icon={<ApiOutlined />} onClick={() => setPortsOpen(true)} />
                  </Badge>
                </Tooltip>
              )}
              <AgentActivity />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => go('tw-apps')}
                style={{ background: BRAND_GRADIENT, border: 'none', fontWeight: 600, boxShadow: '0 6px 16px rgba(108,92,231,0.35)' }}
              >
                Tạo app
              </Button>
            </Header>
            {/* Open-project tab strip — sticky just under the header, visible on EVERY view
                so switching to Settings/Hồ sơ never hides your tabs. Empty on web. */}
            {tabBar && (
              <div style={{ position: 'sticky', top: 60, zIndex: 19 }}>{tabBar}</div>
            )}
            <Content className="tw-grid-bg" style={{ background: V.layer }}>
              {/* Left-aligned, fills the frame (just padding) — no centered max-width
                  cap that leaves big empty gutters on wide screens. Animated caro grid matches the web. */}
              <div style={{ padding: '24px 32px 64px' }}>
                <NetworkBanner />
                <UpdateBanner />
                {children}
              </div>
              {isDesktop && <MessengerWidget listOpen={msgOpen} onCloseList={() => setMsgOpen(false)} onUnread={setMsgUnread} />}
              {/* Ports panel as a DRAWER, not a modal: stopping/restarting can take seconds and the
                  header must stay usable meanwhile. */}
              {showPorts && (
                <Drawer
                  title="Cổng đang chạy"
                  placement="right"
                  width={560}
                  open={portsOpen}
                  onClose={() => setPortsOpen(false)}
                  destroyOnClose
                >
                  <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
                    Dev server đang chạy trên máy này. Khác với “đang live” ở Hồ sơ — đó là số app đã
                    xuất bản lên cloud.
                  </Typography.Text>
                  <RunningPreviews
                    currentAppId={activeAppId ?? undefined}
                    appNames={portsNames}
                    onOpenApp={onOpenApp ? openAppById : undefined}
                  />
                </Drawer>
              )}
            </Content>
          </Layout>
        </Layout>
      </AntApp>
    </ConfigProvider>
  );
}
