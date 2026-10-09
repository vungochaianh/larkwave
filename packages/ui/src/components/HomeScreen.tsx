'use client';
import { useCallback, useEffect, useState } from 'react';
import { App as AntApp, App, Spin, Card, Typography, Space, Button } from 'antd';
import { RocketOutlined, ExportOutlined } from '@ant-design/icons';
import { AppShell } from './AppShell';
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
import { BRAND, BRAND_GRADIENT, V } from '../theme';
import { AccountAuthProvider, useAccountAuth } from '../account/auth';
import { LoginView } from '../account/LoginView';
import { ProfileView } from '../account/ProfileView';
import { FriendsView } from '../account/FriendsView';
import { FEATURE_FRIENDS } from '../features';
import { HomeOverview } from './HomeOverview';
import { BrandGlyph } from './BrandMark';
import { useI18n } from '../i18n';
import { PageHeader } from '../kit';

/**
 * Account pages that require a logged-in Larkwave account (not just a local AI runner).
 * 07/10/2026: bỏ 'reports' ("Báo lỗi của tôi" — đi cùng chương trình thưởng báo lỗi) và 'pricing'
 * (Gói & Thanh toán đã nằm trong Hồ sơ). 'friends' vẫn còn nhưng ẩn sau FEATURE_FRIENDS.
 */
type AccountView = 'profile' | 'friends' | 'storage';
const ACCOUNT_VIEWS: AccountView[] = ['profile', 'friends', 'storage'];

const VIEW_BY_KEY: Record<string, View> = {
  'tw-agents': 'agents',
  'tw-lark': 'lark',
  'tw-lark-spec': 'spec',
  'tw-lark-files': 'lark-files',
  'tw-lark-auto': 'lark-auto',
  'tw-cms-sync': 'cms-sync',
  // Mục cũ 'Trình duyệt Lark' đã gộp vào Lark × Agents → Tạo workflow: liên kết cũ rơi về Lark.
  'tw-lark-browser': 'lark',
  'tw-skills': 'skills',
  'tw-skills-cross': 'skills-cross',
  'tw-settings': 'settings',
  'tw-profile': 'profile',
  'tw-friends': 'friends',
  'tw-storage': 'storage',
};

const WEB_URL: Record<string, string> = {
  profile: 'https://toolswave.net/profile',
  friends: 'https://toolswave.net/friends',
  storage: 'https://toolswave.net/storage',
};

export type View = 'home' | 'agents' | 'lark' | 'spec' | 'lark-files' | 'lark-auto' | 'cms-sync' | 'skills' | 'skills-cross' | 'settings' | AccountView;

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
  profile: 'tw-profile',
  friends: 'tw-friends',
  storage: 'tw-storage',
};

const { Title, Text } = Typography;

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
function AccountGate({ view, nav }: { view: AccountView; nav?: (v: View) => void }) {
  const { user, loading } = useAccountAuth();
  if (loading) {
    return (
      <div style={{ textAlign: 'center', marginTop: 80 }}>
        <Spin size="large" />
      </div>
    );
  }
  if (!user) return <LoginView />;
  // Hồ sơ also hosts "Bạn bè của tôi" + "Gói & Thanh toán" (with a history modal).
  if (view === 'profile') return <ProfileView onNav={nav} />;
  // Bạn bè tắt → mọi lối vào đã ẩn; nếu vẫn lọt tới đây (điều hướng cũ) thì về Hồ sơ.
  if (view === 'friends') return FEATURE_FRIENDS ? <FriendsView /> : <ProfileView onNav={nav} />;
  // Dung lượng lưu trữ — CÙNG màn hình với web, không dựng bản sao riêng cho desktop.
  if (view === 'storage') return <StorageScreen />;
  return <ComingSoon view={view} />;
}

/**
 * Full Larkwave home: Tổng quan dashboard, Trợ lý AI, Lark × Agents (chat, Đặc tả, tệp, tự động
 * hoá, CMS), kỹ năng, cài đặt and the account pages. On desktop it gates the AI screens on a
 * local AI runner (Claude/Grok/Gemini/Codex) and everything on a Larkwave account.
 */
function HomeShell() {
  const runtime = useRuntime();
  const { t } = useI18n();
  App.useApp();
  const { user: accountUser, loading: accountLoading } = useAccountAuth();
  // Desktop drives local AI CLIs (Claude/Grok/Gemini/Codex etc).
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
  const [view, setView] = useState<View>('home');
  // The exact sidebar key last selected — so two keys that map to the SAME view (e.g. the two
  // "Kỹ năng" entries) highlight the one the user actually clicked.
  const [selKey, setSelKey] = useState<string>('tw-composer');

  // Desktop sidebar is a real view switcher — each tab shows a distinct screen.
  const onSelect = (key: string) => {
    setSelKey(key);
    setView(VIEW_BY_KEY[key] ?? 'home');
  };

  // Programmatic navigation (e.g. clicking a KPI tile) — keeps the sidebar in sync
  // via the controlled `activeKey` below.
  const navigate = useCallback((v: View) => {
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

  const isAccountView = (ACCOUNT_VIEWS as string[]).includes(view);

  // Desktop (web-parity): require a Larkwave account login BEFORE anything else (Google etc).
  // Until authenticated show OAuth full-screen. Local AI runners (any) are configured after.
  if (isDesktop) {
    // Only the FIRST load may take over the screen. A later `accountLoading` blip (token
    // refresh, while a user is already signed in) must not unmount the open screens.
    if (accountLoading && !accountUser)
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: V.layer }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: BRAND_GRADIENT, margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <BrandGlyph style={{ fontSize: 32 }} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 18, color: V.text }}>Larkwave</div>
            <Spin size="large" style={{ marginTop: 16 }} />
            <div style={{ marginTop: 8, color: V.textSub }}>{t('ui.home.loadingAccount', 'Đang tải tài khoản...')}</div>
          </div>
        </div>
      );
    if (!accountUser)
      return (
        // LoginView dùng App.useApp() cho thông báo; màn đăng nhập toàn trang này nằm NGOÀI AppShell
        // (nơi đặt <AntApp>), nên thiếu lớp bọc thì đăng nhập xong vẫn ném "message.error is not a function".
        <AntApp>
          <div style={{ minHeight: '100vh', overflowY: 'auto', background: V.layer }}>
            <LoginView />
          </div>
        </AntApp>
      );
  }

  // Show partial app shell early instead of pure full-screen loading — better perceived perf.
  const showLoadingOverlay = !isAccountView && phase === 'checking';

  return (
    <AppShell
      onSelect={onSelect}
      activeKey={selectedKey}
      cmsAllowed={cmsAllowed}
      fullBleed={view === 'lark' || view === 'agents'}
      headerExtra={
        <FeedbackButton variant="header" page={String(view)} />
      }
    >
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
      {isAccountView && <AccountGate view={view as AccountView} nav={navigate} />}
      {!isAccountView && phase === 'ready' && view === 'agents' && (
        // General "Agents chat" — a capable assistant (attachments + built-in tools). Keyed by
        // account so its per-account conversation resets on a user switch.
        <AgentChat key={accountUser?.id || '_local'} onOpenSkills={() => navigate('skills')} />
      )}
      {!isAccountView && phase === 'ready' && view === 'lark' && (
        // Key by account so switching users fully REMOUNTS the Lark screen — connection,
        // config panels and chat all re-fetch under the new account's per-account scope.
        <LarkScreen key={accountUser?.id || '_local'} onOpenSkills={() => navigate('skills')} />
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
        <div>
          <PageHeader
            title={t('app.title.larkAuto', 'Tự động hoá (lịch)')}
            description={<>Lên lịch gửi tin nhắn, cập nhật bản ghi, gọi webhook hoặc <b>chạy AI agent</b>. Mẹo: trong Lark × Agents chỉ cần nhắn “mỗi ngày 9h chạy …”.</>}
          />
          <AutomationsPanel runtime={runtime} page />
        </div>
      )}
      {/* CMS sync runs over the Lark web session + backend, NOT the local AI runner — so it
          does NOT require `phase === 'ready'` (an AI CLI logged in). Allowlisted/admin
          accounts can open it even with no AI configured. */}
      {!isAccountView && view === 'cms-sync' && cmsAllowed && (
        <CmsSyncScreen key={accountUser?.id || '_local'} onOpenChat={() => navigate('lark')} />
      )}
      {/* "Trình duyệt Lark" runs on the Lark web session, not the AI runner → no phase gate. Keyed by
          account: each account has its own Lark web partition. */}
      {/* MỘT màn hình, hai chế độ. Không tách thành hai component vì hai bên dùng chung toàn bộ
          đường tạo/sửa/bật-tắt kỹ năng — tách ra là chép đôi những thứ đó, rồi chúng trôi lệch. */}
      {!isAccountView && phase === 'ready' && (view === 'skills' || view === 'skills-cross') && (
        <SkillsScreen mode={view === 'skills-cross' ? 'cross' : 'plain'} onNav={navigate} />
      )}
      {!isAccountView && phase === 'ready' && view === 'settings' && <SettingsScreen onNav={navigate} cmsAllowed={cmsAllowed} />}
      {/* "Tổng quan" = the overview/stats dashboard (Lark + Trợ lý AI + CMS). */}
      {!isAccountView && phase === 'ready' && view === 'home' && (
        <HomeOverview onNav={navigate} cmsAllowed={cmsAllowed} displayName={displayName} />
      )}
    </AppShell>
  );
}
