'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { App as AntApp, ConfigProvider, Layout, Menu, Button, Dropdown, Tooltip, Badge } from 'antd';
import { DashboardOutlined, BulbOutlined, NodeIndexOutlined, UserOutlined, SettingOutlined, RobotOutlined, MessageOutlined, PartitionOutlined, CloudServerOutlined, MenuOutlined, PlusOutlined, LogoutOutlined, CommentOutlined, TeamOutlined, FieldTimeOutlined, FolderOpenOutlined } from '@ant-design/icons';
import type { RunnerStatusInfo } from '@larkwave/core';
import { lightTheme, darkTheme, BRAND_GRADIENT, BRAND, V } from '../theme';
import { BrandGlyph } from './BrandMark';
import { ThemeProvider, useThemeMode } from '../ThemeProvider';
import { useI18n, type Locale } from '../i18n';
import { useRuntime } from '../RuntimeProvider';
import { MessengerWidget } from '../account/MessengerWidget';
import { FEATURE_FRIENDS } from '../features';
import { UpdateBanner } from './UpdateBanner';
import { VersionFooter } from './VersionFooter';
import { AgentGuideModal } from './AgentGuideModal';
import { AgentActivity } from './AgentActivity';
import { NetworkBanner } from './NetworkBanner';
import { useAccountAuth } from '../account/auth';
import { UserAvatar } from '../account/UserAvatar';
import { PageContainer } from '../kit';

const { Sider, Header, Content } = Layout;

// "Tổng quan" is a STANDALONE top-level item (first) — it aggregates data from EVERYTHING
// (Lark + Trợ lý AI + CMS).
const OVERVIEW_ITEM = { key: 'tw-composer', label: 'Tổng quan', icon: <DashboardOutlined /> };
// Standalone community item. Bạn bè tạm ẩn (FEATURE_FRIENDS) — logic giữ nguyên để bật lại.
const EXTRA_NAV = FEATURE_FRIENDS ? [{ key: 'tw-friends', label: 'Bạn bè', icon: <TeamOutlined /> }] : [];
// Top-level items outside any group.
// KHÔNG còn "Báo lỗi" (trang "Báo lỗi của tôi" bỏ cùng chương trình thưởng, 07/10/2026 — nút gửi
// báo lỗi trên header vẫn còn) và "Gói & Thanh toán" (gói + nâng cấp đã nằm trong Hồ sơ).
//
// 07/10/2026 (quy tắc E): thanh bên chỉ còn TÍNH NĂNG. Ba mục tài khoản (Hồ sơ & Gói, Dung lượng,
// Cài đặt) chuyển vào menu của thẻ người dùng ở đáy thanh bên (bấm avatar). Ở nơi không có thẻ
// người dùng (không phải desktop) chúng vẫn nằm trong thanh bên như cũ, để không mất lối vào.
const TOP_NAV = [
  { key: 'tw-storage', label: 'Dung lượng', icon: <CloudServerOutlined /> },
  { key: 'tw-profile', label: 'Hồ sơ', icon: <UserOutlined /> },
];
/** Các khoá trang tài khoản — mở từ menu thẻ người dùng trên desktop. */
const ACCOUNT_KEYS = ['tw-profile', 'tw-storage', 'tw-settings'];

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
        alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.6), color: '#fff',
        background: BRAND_GRADIENT, boxShadow: '0 6px 16px rgba(108,92,231,0.30)',
      }}
    >
      <BrandGlyph />
    </span>
  );
}

/** Larkwave account (Google/email login) shown in sidebar for desktop. Primary identity. */
function UserBlock({ collapsed, selected, onGo, hasSettings }: { collapsed: boolean; selected: string; onGo: (key: string) => void; hasSettings: boolean }) {
  const { user, logout } = useAccountAuth();
  const { t } = useI18n();
  if (!user) return null;
  const active = ACCOUNT_KEYS.includes(selected);

  const doLogout = () => {
    logout();
    if (typeof window !== 'undefined') window.location.reload();
  };

  const menu = {
    selectedKeys: active ? [selected] : [],
    items: [
      { key: 'who', disabled: true, label: user.email },
      { type: 'divider' as const },
      { key: 'tw-profile', icon: <UserOutlined />, label: t('app.nav.profile', 'Hồ sơ & Gói'), onClick: () => onGo('tw-profile') },
      { key: 'tw-storage', icon: <CloudServerOutlined />, label: t('app.nav.storage', 'Dung lượng'), onClick: () => onGo('tw-storage') },
      ...(hasSettings ? [{ key: 'tw-settings', icon: <SettingOutlined />, label: t('app.nav.settings', 'Cài đặt'), onClick: () => onGo('tw-settings') }] : []),
      { type: 'divider' as const },
      { key: 'logout', icon: <LogoutOutlined />, danger: true, label: t('app.logout', 'Đăng xuất'), onClick: doLogout },
    ],
  };

  return (
    <div style={{ padding: collapsed ? 8 : 12, borderTop: `1px solid ${V.borderSub}` }}>
      <Dropdown menu={menu} placement="topLeft" trigger={['click']}>
        <div
          className="lw-user-card"
          title={t('app.accountMenu', 'Tài khoản: Hồ sơ & Gói, Dung lượng, Cài đặt')}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: collapsed ? '8px 0' : '8px 10px', borderRadius: 12, cursor: 'pointer', justifyContent: collapsed ? 'center' : 'flex-start', background: active ? `${BRAND}14` : undefined }}
        >
          <UserAvatar name={user.name} avatarUrl={user.avatarUrl} size={34} />
          {!collapsed && (
            <div style={{ minWidth: 0, lineHeight: 1.25, flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: V.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.name || user.email?.split('@')[0] || 'Người dùng'}
              </div>
              <div style={{ marginTop: 2, fontSize: 11, color: V.textSub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</div>
            </div>
          )}
          {!collapsed && <SettingOutlined style={{ color: active ? BRAND : V.textFaint, fontSize: 14 }} />}
        </div>
      </Dropdown>
    </div>
  );
}

/**
 * Trạng thái các trình AI ở đáy thanh bên — MỘT dòng (quy tắc E): "AI: 2/4 sẵn sàng" + chấm màu
 * cho từng trình. Bấm dòng → Cài đặt (nơi có đầy đủ phần kết nối); bấm một chấm → hướng dẫn cài
 * trình đó. Trước đây là một khối nhãn + hai dòng gợi ý chiếm ~90px của thanh bên.
 */
function AgentsBlock({ collapsed, onOpenSettings }: { collapsed: boolean; onOpenSettings?: () => void }) {
  const runtime = useRuntime();
  const { t } = useI18n();
  const [runners, setRunners] = useState<RunnerStatusInfo[]>([]);
  /** The agent whose setup-guide modal is open (click a dot → guide). */
  const [guide, setGuide] = useState<RunnerStatusInfo | null>(null);

  useEffect(() => {
    if (!runtime.runners) return;
    let alive = true;
    runtime.runners.list().then((list) => { if (alive) setRunners(list); }).catch(() => {});
    return () => { alive = false; };
  }, [runtime]);

  if (!runtime.runners || runners.length === 0) return null;

  const readyCount = runners.filter(r => r.ready).length;
  const dotColor = (r: RunnerStatusInfo) => (r.ready ? '#16B98D' : r.installed ? '#F59E0B' : V.textFaint);
  const stateWord = (r: RunnerStatusInfo) =>
    r.ready ? t('ui.runner.ready', 'Sẵn sàng') : r.installed ? (r.loggedIn ? t('app.agents.missingModel', 'Thiếu model/key') : t('app.agents.needKey', 'Cần key')) : t('app.agents.notInstalled', 'Chưa cài');

  return (
    <div style={{ padding: collapsed ? '6px 4px' : '6px 12px', borderTop: `1px solid ${V.borderSub}` }}>
      <Tooltip
        placement="right"
        title={
          <div style={{ fontSize: 12 }}>
            {runners.map((r) => (
              <div key={r.id}>{r.label} — {stateWord(r)}</div>
            ))}
            <div style={{ opacity: 0.75, marginTop: 4 }}>{t('app.agents.hint', 'Bấm để mở Cài đặt · bấm một chấm để xem hướng dẫn cài')}</div>
          </div>
        }
      >
        <div
          onClick={onOpenSettings}
          role="button"
          style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: collapsed ? 'center' : 'flex-start', padding: '6px 8px', borderRadius: 10, cursor: onOpenSettings ? 'pointer' : 'default', flexDirection: collapsed ? 'column' : 'row' }}
        >
          <RobotOutlined style={{ color: readyCount ? BRAND : V.textFaint, fontSize: 13 }} />
          {!collapsed && (
            <span style={{ fontSize: 12, fontWeight: 600, color: V.textSub, flex: 1, whiteSpace: 'nowrap' }}>
              {t('app.agents.line', 'AI: {n}/{m} sẵn sàng', { n: readyCount, m: runners.length })}
            </span>
          )}
          <span style={{ display: 'inline-flex', gap: 4 }}>
            {runners.map((r) => (
              <span
                key={r.id}
                aria-label={`${r.label} — ${stateWord(r)}`}
                onClick={(e) => { e.stopPropagation(); setGuide(r); }}
                style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor(r), cursor: 'pointer', boxShadow: `0 0 0 2px ${dotColor(r)}22` }}
              />
            ))}
          </span>
        </div>
      </Tooltip>
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

const NAV_TITLE: Record<string, string> = {
  'tw-composer': 'Tổng quan',
  'tw-agents': 'Trợ lý AI',
  'tw-lark': 'Lark × Agents',
  'tw-lark-bot': 'Lark Bot (App ID)',
  'tw-lark-spec': 'Đặc tả hệ thống',
  'tw-lark-files': 'Tệp đã gửi cho Lark Agents',
  'tw-lark-auto': 'Tự động hoá (lịch)',
  'tw-cms-sync': 'Đồng bộ Bitable (CMS)',
  'tw-skills': 'Kỹ năng (Skills)',
  'tw-skills-cross': 'Kỹ năng chéo (kiểm chéo liên tục)',
  'tw-friends': 'Bạn bè',
  'tw-storage': 'Dung lượng',
  'tw-profile': 'Hồ sơ & Gói',
  'tw-settings': 'Cài đặt',
};

/** Nav item key → i18n message key (translate the SIDEBAR menu labels at render; the raw
 *  Vietnamese label is passed as the fallback so it never renders blank before the dictionary
 *  is merged). Module-scope consts (OVERVIEW_ITEM/TOP_NAV) + inline string labels. */
const NAV_I18N: Record<string, string> = {
  'tw-composer': 'app.nav.overview',
  'tw-agents': 'app.nav.assistant',
  'grp-lark': 'app.nav.lark',
  'tw-lark': 'app.nav.larkAgents',
  'tw-lark-bot': 'app.nav.larkBot',
  'tw-lark-spec': 'app.nav.larkSpec',
  'tw-lark-files': 'app.nav.larkFiles',
  'tw-cms-sync': 'app.nav.cmsSync',
  'tw-skills': 'app.nav.skills',
  'tw-skills-cross': 'app.nav.skillsCross',
  'tw-profile': 'app.nav.profile',
  'tw-storage': 'app.nav.storage',
  'tw-settings': 'app.nav.settings',
};

/** Selected nav key → i18n message key for the HEADER section title (some titles differ from the
 *  sidebar label, e.g. "Đặc tả hệ thống" vs "Đặc tả"). */
const NAV_TITLE_I18N: Record<string, string> = {
  'tw-composer': 'app.nav.overview',
  'tw-agents': 'app.nav.assistant',
  'tw-lark': 'app.nav.larkAgents',
  'tw-lark-bot': 'app.nav.larkBot',
  'tw-lark-spec': 'app.title.larkSpec',
  'tw-cms-sync': 'app.title.cmsSync',
  'tw-skills': 'app.title.skills',
  'tw-skills-cross': 'app.title.skillsCross',
  'tw-lark-auto': 'app.title.larkAuto',
  'tw-profile': 'app.nav.profile',
  'tw-storage': 'app.nav.storage',
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
  onSelect,
  cmsAllowed = false,
  activeKey,
  headerExtra,
  fullBleed = false,
}: {
  children: ReactNode;
  sectionTitle?: string;
  onSelect?: (key: string) => void;
  /** Show the "Đồng bộ Bitable (CMS)" entry — admins + an email allowlist (jobs are backend-global). */
  cmsAllowed?: boolean;
  /** Controlled sidebar selection (desktop) — lets the parent navigate
   *  programmatically (e.g. clicking a KPI tile) and keep the rail in sync. */
  activeKey?: string;
  /** Extra controls rendered in the header toolbar (right side) — e.g. the "Báo lỗi" button. */
  headerExtra?: ReactNode;
  /** Màn chat (Lark × Agents, Trợ lý AI): trải hết bề rộng thay vì khung 1440px. */
  fullBleed?: boolean;
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
        {!collapsed && <span style={{ fontWeight: 800, letterSpacing: 1, fontSize: 16, color: V.text }}>LARKWAVE</span>}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', paddingTop: 10 }}>
        <Menu
          mode="inline"
          selectedKeys={[selected]}
          style={{ borderInlineEnd: 'none', background: 'transparent' }}
          onClick={({ key }) => go(key)}
          items={(() => {
            type NavNode = { key: string; label: ReactNode; icon: ReactNode; children?: NavNode[] };
            // "Lark" GROUP: chat, living spec, CMS sync.
            const larkChildren: NavNode[] = [];
            if (runtime.larkChat) {
              larkChildren.push({ key: 'tw-lark', label: 'Lark × Agents', icon: <MessageOutlined /> });
              // "Tạo workflow" đã gộp vào Lark × Agents (nút ⤢ đổi sang khung Lark lớn). Phần cần App ID
              // (bot, webhook, Open API) ở mục riêng "Lark Bot (App ID)" — chỉ khi cần năng lực bot.
              larkChildren.push({ key: 'tw-lark-bot', label: 'Lark Bot (App ID)', icon: <RobotOutlined /> });
              larkChildren.push({ key: 'tw-lark-spec', label: 'Đặc tả', icon: <PartitionOutlined /> });
              // Kho tệp đính kèm — chỉ hiện khi lõi có hỗ trợ (bản cài cũ chưa có kênh này).
              if (runtime.larkListFiles)
                larkChildren.push({ key: 'tw-lark-files', label: 'Tệp đã gửi', icon: <FolderOpenOutlined /> });
              if (runtime.larkListAutomations) larkChildren.push({ key: 'tw-lark-auto', label: 'Tự động hoá', icon: <FieldTimeOutlined /> });
            }
            // The CMS sync jobs live on a shared backend with no per-user scoping. Visible to admins
            // + a specific email allowlist — they all see the SAME global jobs.
            if (cmsAllowed && runtime.cmsSyncListJobs) larkChildren.push({ key: 'tw-cms-sync', label: 'Đồng bộ Bitable', icon: <CloudServerOutlined /> });
            // "Trình duyệt Lark" đã gộp vào khung Lark của Lark × Agents / Tạo workflow.
            const list: NavNode[] = [OVERVIEW_ITEM];
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
            // PHẲNG, không còn nhóm "Lark" (07/10/2026): ở Larkwave mọi tính năng đều là Lark, nên
            // một nhóm duy nhất chỉ thêm một tầng thụt lề + một cú bấm mở/đóng mà không phân loại
            // được gì. Các mục giữ nguyên thứ tự cũ, đứng ngay dưới Tổng quan.
            list.push(...larkChildren);
            list.push(...EXTRA_NAV);
            // Mục tài khoản: trên desktop nằm trong menu thẻ người dùng (UserBlock) ở đáy.
            if (!isDesktop) {
              list.push(...TOP_NAV);
              if (runtime.runners) list.push({ key: 'tw-settings', label: 'Cài đặt', icon: <SettingOutlined /> });
            }
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
      </div>
      <AgentsBlock collapsed={collapsed} onOpenSettings={runtime.runners ? () => go('tw-settings') : undefined} />
      {isDesktop && <UserBlock collapsed={collapsed} selected={selected} onGo={go} hasSettings={!!runtime.runners} />}
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
              {isDesktop && FEATURE_FRIENDS && (
                <Tooltip title="Tin nhắn">
                  <Badge count={msgUnread} size="small" offset={[-2, 4]}>
                    <Button type="text" icon={<MessageOutlined />} onClick={() => setMsgOpen((o) => !o)} />
                  </Badge>
                </Tooltip>
              )}
              <AgentActivity />
              {onSelect && runtime.larkChat && (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => go(isDesktop ? 'tw-lark' : 'tw-agents')}
                  style={{ background: BRAND_GRADIENT, border: 'none', fontWeight: 600, boxShadow: '0 6px 16px rgba(108,92,231,0.35)' }}
                >
                  {t('app.newChat', 'Trò chuyện mới')}
                </Button>
              )}
            </Header>
            <Content className="tw-grid-bg" style={{ background: V.layer }}>
              {/* MỘT khung trang cho mọi màn (quy tắc A): căn giữa, tối đa 1440px; màn chat trải hết. */}
              <PageContainer full={fullBleed}>
                <NetworkBanner />
                <UpdateBanner />
                {children}
              </PageContainer>
              {isDesktop && FEATURE_FRIENDS && <MessengerWidget listOpen={msgOpen} onCloseList={() => setMsgOpen(false)} onUnread={setMsgUnread} />}
            </Content>
          </Layout>
        </Layout>
      </AntApp>
    </ConfigProvider>
  );
}
