'use client';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Modal, Spin, type MenuProps } from 'antd';
import { SettingOutlined, ReadOutlined, TeamOutlined, LoginOutlined, ApiOutlined } from '@ant-design/icons';
import type { LarkBaseRef, LarkConnection } from '@larkwave/core';
import { useRuntime } from '../RuntimeProvider';
import { useAccountAuth } from '../account/auth';
import { LarkConnectPanel } from './lark/LarkConnectPanel';
import { LarkGrantsPanel } from './lark/LarkGrantsPanel';
import { FEATURE_FRIENDS } from '../features';
import { LarkChatShell } from './lark/LarkChatShell';
import { BasesPanel } from './lark/BasesPanel';
import { AutomationsPanel } from './lark/AutomationsPanel';
import { PluginsPanel } from './lark/PluginsPanel';
import { PluginPanelsCard } from './lark/PluginPanelsCard';
import { BotPanel } from './lark/BotPanel';
import { LarkGuideModal } from './lark/LarkGuideModal';
import { LarkWebPanel } from './lark/LarkWebPanel';
import { LarkWorkflowStudio } from './lark/LarkWorkflowStudio';
import { LarkFramePane, useAutoOpen, useLarkBrowserState } from './lark/LarkFramePane';
import { LAYOUT_KEY, parseLayoutPrefs, serializeLayoutPrefs, sidePaneWidth, switchMode, type LayoutPrefs } from './lark/larkLayout';
import { migrateCustomAsks } from './lark/larkConversations';
import { CUSTOM_ASKS_KEYS } from './lark/quickAsks';
import { V } from '../theme';

/** Gộp "Hỏi nhanh của tôi" của màn Tạo workflow cũ vào danh sách chung — một lần, không mất mục nào. */
function migrateAsksOnce() {
  try {
    const merged = migrateCustomAsks(localStorage.getItem(CUSTOM_ASKS_KEYS.chat), localStorage.getItem(CUSTOM_ASKS_KEYS.workflow));
    if (merged !== null) {
      localStorage.setItem(CUSTOM_ASKS_KEYS.chat, merged);
      localStorage.removeItem(CUSTOM_ASKS_KEYS.workflow);
    }
    localStorage.removeItem('larkwave.lark.screenMode'); // nút "Trò chuyện | Tạo workflow" cũ đã gỡ
  } catch {
    /* không có storage */
  }
}

const readPrefs = (): LayoutPrefs => {
  try {
    return parseLayoutPrefs(window.localStorage.getItem(LAYOUT_KEY));
  } catch {
    return parseLayoutPrefs(null);
  }
};

/**
 * "Lark × Agents" (desktop) — MỘT màn, MỘT agent, MỘT danh sách hội thoại, hai cách xếp đổi qua lại
 * ngay trong màn (nút ⤢ trên thanh đầu hội thoại, nhớ riêng máy — larkLayout `mode`):
 *   - 'chat'  : hội thoại là chính; khung Lark là ngăn phụ bên phải, mặc định ĐÓNG (nút "Khung Lark"),
 *     tự mở khi AI thao tác / cần đăng nhập.
 *   - 'frame' : khung Lark lớn, hội thoại gắn trái thu/mở được (LarkWorkflowStudio). Đóng khung (×) là
 *     về cách xếp hội thoại-trước. Mục "Tạo workflow" cũ ở thanh bên đã gộp vào đây.
 * Phần cần App ID/App Secret (bot, webhook, Open API…) nằm ở màn "Lark Bot (App ID)" riêng.
 * Không còn cổng "phải kết nối custom app": agent chạy bằng phiên Lark web khi chưa có App ID.
 * Không còn dòng mô tả / nút chuyển chế độ ở đầu màn — Hướng dẫn, Chia sẻ, Cài đặt nằm trong ⋯ của
 * thanh đầu hội thoại. Trên web (không có `runtime.larkChat`) chỉ hiện thông báo "chỉ có ở desktop".
 */
export function LarkScreen({
  onOpenSkills,
  onOpenBot,
  layout,
}: { onOpenSkills?: () => void; onOpenBot?: () => void; /** Liên kết cũ "Tạo workflow" → mở thẳng cách xếp khung-trước. */ layout?: 'chat' | 'frame' } = {}) {
  const runtime = useRuntime();
  const { user } = useAccountAuth();
  const supported = !!runtime.larkChat;
  // Gate the chat on the account scope being SET in the main process (awaited), so
  // LarkChat never lists/saves a conversation under a stale account during a login/switch.
  const [accountReady, setAccountReady] = useState(!runtime.larkSetAccount);
  const [conn, setConn] = useState<LarkConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  /** Bumped when Bases change so the chat re-loads its Base list immediately. */
  const [basesRev, setBasesRev] = useState(0);
  const webSupported = !!runtime.larkWebListBases && !!runtime.larkBrowserAttach;
  const migrated = useRef(false);
  if (!migrated.current && typeof window !== 'undefined') {
    migrated.current = true;
    migrateAsksOnce();
  }

  useEffect(() => {
    if (!supported) {
      setLoading(false);
      return;
    }
    if (!accountReady) return;
    let alive = true;
    setLoading(true);
    runtime
      .larkStatus?.()
      .then((c) => {
        if (!alive) return;
        setConn(c);
        if (c.connected && runtime.larkCheckConnection) {
          runtime
            .larkCheckConnection()
            .then((h) => alive && setConn(h))
            .catch(() => undefined);
        }
      })
      .catch(() => alive && setConn({ connected: false }))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [runtime, supported, accountReady]);

  // 1. Set the per-account scope (AWAITED) whenever the signed-in account changes, then
  //    2. back up + pull-merge that account's Lark data.
  useEffect(() => {
    if (!supported) return;
    let alive = true;
    if (!runtime.larkSetAccount) {
      runtime.larkBackupSync?.().catch(() => undefined);
      return;
    }
    setAccountReady(false);
    runtime
      .larkSetAccount(user?.id ?? null)
      .catch(() => undefined)
      .then(() => {
        if (!alive) return;
        setAccountReady(true);
        runtime.larkBackupSync?.().catch(() => undefined);
      });
    return () => {
      alive = false;
    };
  }, [runtime, supported, user?.id]);

  // ── Bố cục chat: ngăn khung Lark bên phải (mặc định đóng, nhớ riêng máy) ──
  const [prefs, setPrefsState] = useState<LayoutPrefs>(() => {
    const p = typeof window === 'undefined' ? parseLayoutPrefs(null) : readPrefs();
    return layout ? { ...p, mode: layout } : p;
  });
  const setPrefs = (fn: (p: LayoutPrefs) => LayoutPrefs) =>
    setPrefsState((p) => {
      // Đọc lại bản đang lưu để không đè nấc/bề rộng mà cách xếp khung-trước vừa lưu (chung một khoá).
      const n = fn({ ...readPrefs(), mode: p.mode, sidePaneOpen: p.sidePaneOpen, sidePaneW: p.sidePaneW });
      try {
        window.localStorage.setItem(LAYOUT_KEY, serializeLayoutPrefs(n));
      } catch {
        /* */
      }
      return n;
    });
  const frameFirst = prefs.mode === 'frame' && webSupported;
  const chatLayout = !frameFirst && webSupported;
  // Hội thoại của tab đang xem = LÀN của khung Lark (mỗi hội thoại một trang Lark riêng).
  const [activeLane, setActiveLane] = useState<string | null>(null);
  const [st, refresh, setSt] = useLarkBrowserState(runtime, chatLayout ? activeLane : null);
  useAutoOpen(chatLayout ? st : null, () => setPrefs((p) => ({ ...p, sidePaneOpen: true })));
  useEffect(() => () => void runtime.larkBrowserDetach?.().catch(() => undefined), [runtime]);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [rowW, setRowW] = useState(1200);
  useEffect(() => {
    const el = rowRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setRowW(el.getBoundingClientRect().width || 1200));
    ro.observe(el);
    return () => ro.disconnect();
  });
  const paneW = sidePaneWidth(prefs.sidePaneW, rowW);
  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const r = rowRef.current?.getBoundingClientRect();
    const move = (ev: MouseEvent) => setPrefsState((p) => ({ ...p, sidePaneW: sidePaneWidth((r?.right ?? 1200) - ev.clientX, r?.width ?? 1200) }));
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      setPrefs((p) => p);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  // Nút "nhà" theo Base của TỪNG tab; trang của một tab mở lần đầu tự vào Base của tab đó (một lần —
  // sau đó người dùng tự đi đâu trong trang của tab thì để yên).
  const [homeUrls, setHomeUrls] = useState<Record<string, string | undefined>>({});
  const homeUrl = activeLane ? homeUrls[activeLane] : undefined;
  const homed = useRef<Set<string>>(new Set());
  const baseUrlOf = (b: LarkBaseRef | { appToken: string; url?: string } | undefined) =>
    b ? (b as { url?: string }).url || (st?.host ? `${st.host}/base/${b.appToken}` : undefined) : undefined;
  const goHome = (lane: string, url: string | undefined) => {
    if (!url || !prefs.sidePaneOpen) return;
    homed.current.add(lane);
    void runtime.larkBrowserNavigate?.({ url, lane }).catch(() => undefined);
  };
  useEffect(() => {
    if (!chatLayout || !activeLane || homed.current.has(activeLane) || !st?.connected) return;
    goHome(activeLane, homeUrls[activeLane]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatLayout, activeLane, homeUrls, st?.connected, prefs.sidePaneOpen]);

  if (!supported) {
    return (
      <Alert
        type="info"
        showIcon
        message="Lark × Agents chỉ khả dụng trên bản Desktop"
        description="Mở ứng dụng Larkwave Desktop để kết nối Lark và dùng AI (Claude/Grok/...) tuỳ chỉnh dữ liệu workspace của bạn."
      />
    );
  }

  /** Mục của màn trong menu ⋯ của thanh đầu hội thoại. */
  const extraMenu: { items: NonNullable<MenuProps['items']>; onClick: (key: string) => void } = {
    items: [
      { key: 'x-guide', icon: <ReadOutlined />, label: 'Hướng dẫn' },
      ...(conn?.connected && FEATURE_FRIENDS ? [{ key: 'x-share', icon: <TeamOutlined />, label: 'Chia sẻ Lark × Agents' }] : []),
      { key: 'x-settings', icon: <SettingOutlined />, label: onOpenBot ? 'Lark Bot (App ID) & cài đặt' : conn?.connected ? 'Cài đặt' : 'Kết nối custom app & cài đặt' },
    ],
    onClick: (k) => {
      if (k === 'x-guide') setGuideOpen(true);
      else if (k === 'x-share') setShareOpen(true);
      else if (k === 'x-settings') {
        if (onOpenBot) onOpenBot();
        else setSettingsOpen(true);
      }
    },
  };
  const webConnected = !!st?.connected && st?.health !== 'dead';
  const needLogin = !loading && !conn?.connected && !webConnected && !st?.loginPending;

  const ready = accountReady && !loading;
  return (
    // Fill the content area (viewport − topbar − paddings) so the chat is full-height.
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 108px)', minHeight: 460, marginBottom: -44, gap: 8 }}>
      <LarkGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
      <Modal
        open={FEATURE_FRIENDS && shareOpen}
        onCancel={() => setShareOpen(false)}
        footer={null}
        width={640}
        title="Chia sẻ Lark × Agents cho người khác"
        styles={{ body: { maxHeight: '76vh', overflowY: 'auto' } }}
      >
        <LarkGrantsPanel runtime={runtime} mode="all" />
      </Modal>
      <Modal
        open={settingsOpen}
        onCancel={() => setSettingsOpen(false)}
        footer={null}
        width={580}
        title="Cài đặt Lark × Agents"
        styles={{ body: { maxHeight: '74vh', overflowY: 'auto' } }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!conn?.connected && FEATURE_FRIENDS && <LarkGrantsPanel runtime={runtime} mode="receive" />}
          <LarkConnectPanel runtime={runtime} connection={conn} onChange={setConn} />
          {conn?.connected && (
            <>
              <BasesPanel runtime={runtime} onChanged={() => setBasesRev((k) => k + 1)} />
              <AutomationsPanel runtime={runtime} />
              <LarkWebPanel runtime={runtime} />
              <BotPanel runtime={runtime} />
              <PluginsPanel runtime={runtime} />
              <PluginPanelsCard runtime={runtime} />
            </>
          )}
        </div>
      </Modal>

      {conn?.userBitableScopeMissing && (
        <Alert
          type="warning"
          showIcon
          closable
          message="Tài khoản Lark đang đăng nhập THIẾU quyền Bitable"
          description='Token của bạn chưa có scope "bitable:app" nên đọc/ghi Base qua Open API sẽ trả về rỗng. Bật "bitable:app" trong Lark Developer Console → phát hành lại app → đăng xuất và đăng nhập lại tài khoản Lark trong Cài đặt.'
        />
      )}
      {needLogin && webSupported && (
        <Alert
          type="info"
          showIcon
          data-testid="lark-login-hint"
          message="Đăng nhập Lark để bắt đầu — không cần App ID"
          description="Agent chạy bằng phiên Lark web của bạn: quét Base, hỏi đáp, tạo workflow, ghi bản ghi + đính kèm, đưa tệp lên Drive / nhập thành Sheet hay Doc. Gửi tin nhắn, lịch và Open API thì cần kết nối custom app."
          action={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Button size="small" type="primary" icon={<LoginOutlined />} onClick={() => void runtime.larkWebConnect?.().finally(() => void refresh())}>
                Đăng nhập Lark
              </Button>
              <Button size="small" icon={<ApiOutlined />} onClick={() => (onOpenBot ? onOpenBot() : setSettingsOpen(true))}>
                Kết nối custom app
              </Button>
            </div>
          }
        />
      )}

      {!ready ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spin size="large" />
        </div>
      ) : frameFirst ? (
        <Card size="small" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }} styles={{ body: { padding: 0, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } }}>
          <LarkWorkflowStudio
            key={user?.id || '_local'}
            runtime={runtime}
            onOpenSkills={onOpenSkills}
            extraMenu={extraMenu}
            onToChat={(how) => setPrefs((p) => switchMode(p, 'chat', how))}
          />
        </Card>
      ) : !conn?.connected && !webSupported ? (
        <div style={{ maxWidth: 520, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {FEATURE_FRIENDS && <LarkGrantsPanel runtime={runtime} mode="receive" />}
          <LarkConnectPanel runtime={runtime} connection={conn} onChange={setConn} />
        </div>
      ) : (
        <div ref={rowRef} data-testid="lark-chat-row" style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <Card size="small" style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }} styles={{ body: { padding: '4px 12px 12px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } }}>
            <LarkChatShell
              key={user?.id || '_local'}
              userName={(user?.name || '').trim().split(/\s+/).pop() || undefined}
              runtime={runtime}
              basesRev={basesRev}
              onOpenSkills={onOpenSkills}
              layout="chat"
              extraMenu={extraMenu}
              frame={
                chatLayout
                  ? {
                      open: prefs.sidePaneOpen,
                      toggle: () => setPrefs((p) => ({ ...p, sidePaneOpen: !p.sidePaneOpen })),
                      expand: () => setPrefs((p) => switchMode(p, 'frame')),
                    }
                  : undefined
              }
              onActiveChange={(id, bases) => {
                setActiveLane(id);
                if (id && bases) setHomeUrls((m) => (m[id] ? m : { ...m, [id]: baseUrlOf(bases[0]) }));
              }}
              onBasesChange={(bases, added) => {
                if (!activeLane) return;
                const url = baseUrlOf(added || bases[0]);
                setHomeUrls((m) => ({ ...m, [activeLane]: url }));
                goHome(activeLane, url);
              }}
            />
          </Card>
          {chatLayout && prefs.sidePaneOpen && (
            <>
              <div onMouseDown={startDrag} title="Kéo để đổi bề rộng" style={{ width: 8, flex: '0 0 8px', cursor: 'col-resize', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ width: 2, height: 36, borderRadius: 2, background: V.border }} />
              </div>
              <LarkFramePane
                runtime={runtime}
                st={st}
                setSt={setSt}
                refresh={refresh}
                homeUrl={homeUrl}
                lane={activeLane}
                onClose={() => setPrefs((p) => ({ ...p, sidePaneOpen: false }))}
                style={{ width: paneW, flex: `0 0 ${paneW}px` }}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
