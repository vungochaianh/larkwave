'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { App, Button, Tooltip, Typography } from 'antd';
import { ArrowLeftOutlined, ReloadOutlined, LoginOutlined, StopOutlined, RobotOutlined, CaretRightOutlined, GlobalOutlined, CloseOutlined, HomeOutlined, QrcodeOutlined, MailOutlined } from '@ant-design/icons';
import type { LarkBrowserState, RuntimeAdapter } from '@larkwave/core';
import { BRAND, BRAND_GRADIENT, OK, WARN, ERR, V, tint } from '../../theme';
import { EmptyState } from '../../kit';
import { useI18n } from '../../i18n';
import { dockDecision, overlayHitsPane, OVERLAY_SELECTOR, shouldAutoOpen, ZERO_RECT } from './larkDock';
import { isLarkLoginPage, loginUrlFor, loginViewFromUrl, type LarkLoginView } from './larkLoginUrl';
import { LarkAccountMenu } from './LarkAccountMenu';

const { Text } = Typography;

/**
 * Trạng thái khung Lark (poll 1s) — dùng chung cho màn và cho khung. `lane` = id hội thoại của tab đang
 * xem: mỗi hội thoại có TRANG Lark riêng, nên trạng thái (địa chỉ, AI đang thao tác…) là của trang đó.
 */
export function useLarkBrowserState(runtime: RuntimeAdapter, lane?: string | null): [LarkBrowserState | null, () => Promise<void>, (s: LarkBrowserState) => void] {
  const [st, setSt] = useState<LarkBrowserState | null>(null);
  const refresh = useCallback(async () => {
    if (!runtime.larkBrowserState) return;
    try {
      setSt(await runtime.larkBrowserState(lane || undefined));
    } catch {
      /* giữ trạng thái cũ */
    }
  }, [runtime, lane]);
  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 1000);
    return () => clearInterval(id);
  }, [refresh]);
  return [st, refresh, setSt];
}

/** Gọi khi khung nên TỰ MỞ (AI bắt đầu thao tác / cần đăng nhập) — mỗi lần chuyển trạng thái một lần. */
export function useAutoOpen(st: LarkBrowserState | null, open: () => void) {
  const wasActive = useRef(false);
  useEffect(() => {
    if (shouldAutoOpen(st, wasActive.current)) open();
    wasActive.current = !!st?.ai?.active;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st]);
}

/** Đường dẫn ngắn của trang Lark (host bỏ, query bỏ) cho dải trên cùng. */
function crumb(url?: string): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    const p = u.pathname.replace(/\/+$/, '');
    if (/^\/base\//.test(p)) return `Base · ${u.searchParams.get('table') || p.split('/')[2]?.slice(0, 8) || ''}`;
    return p || '/';
  } catch {
    return url;
  }
}

/**
 * KHUNG LARK thật (native WebContentsView của tiến trình chính) gắn vào một ô của trang. Dải trên cùng
 * TỐI GIẢN: chấm phiên + đường dẫn + Quay lại/Tải lại (+ nút đóng khi là ngăn phụ); dải "AI đang thao
 * tác … Dừng" CHỈ hiện khi AI đang chạy. Native view vẽ đè mọi thứ → có hộp thoại thì giấu, lớp nổi
 * (popover/menu) chỉ giấu khi thực sự đè lên ô này; rời màn thì tháo (phiên vẫn chạy).
 */
export function LarkFramePane({
  runtime,
  st,
  setSt,
  refresh,
  onClose,
  homeUrl,
  lane,
  style,
}: {
  runtime: RuntimeAdapter;
  st: LarkBrowserState | null;
  setSt: (s: LarkBrowserState) => void;
  refresh: () => Promise<void>;
  /** Có = ngăn phụ đóng được (bố cục chat). */
  onClose?: () => void;
  /** Nút "nhà": mở Base của hội thoại (bỏ trống = trang chủ Lark). */
  homeUrl?: string;
  /** Hội thoại của tab đang xem — khung hiện TRANG Lark riêng của hội thoại này. */
  lane?: string | null;
  style?: React.CSSProperties;
}) {
  const { message } = App.useApp();
  const { t } = useI18n();
  const holder = useRef<HTMLDivElement | null>(null);
  const hasWindow = !!st?.hasWindow;
  const laneId = lane || undefined;
  const [busy, setBusy] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!runtime.larkBrowserAttach) return;
    let raf = 0;
    const push = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = holder.current;
        const r = el ? el.getBoundingClientRect() : null;
        const pane = r ? { x: r.left, y: r.top, width: r.width, height: r.height } : null;
        const modal = !!document.querySelector('.ant-modal-wrap:not([style*="display: none"]) .ant-modal, .ant-drawer-open');
        const rects = Array.from(document.querySelectorAll(OVERLAY_SELECTOR)).map((n) => {
          const b = (n as HTMLElement).getBoundingClientRect();
          return { x: b.left, y: b.top, width: b.width, height: b.height };
        });
        const d = dockDecision({ visible: !!el && el.offsetParent !== null, paneOpen: true, overlayOpen: modal || overlayHitsPane(rects, pane), hasWindow, rect: pane });
        if (d.kind === 'attach') void runtime.larkBrowserAttach!(d.rect, laneId).catch(() => undefined);
        else if (d.kind === 'hide') void runtime.larkBrowserAttach!(ZERO_RECT, laneId).catch(() => undefined);
        else void runtime.larkBrowserDetach?.().catch(() => undefined);
      });
    };
    push();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(push) : null;
    if (ro && holder.current) ro.observe(holder.current);
    window.addEventListener('resize', push);
    const tick = setInterval(push, 400); // lớp nổi mở/đóng + layout dịch mà observer không thấy
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('resize', push);
      clearInterval(tick);
      // Ô này rời trang (đóng ngăn / chuyển màn): giấu view — màn cha tháo hẳn khi rời màn.
      void runtime.larkBrowserAttach?.(ZERO_RECT, laneId).catch(() => undefined);
    };
  }, [runtime, hasWindow, laneId]);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      message.error(String((e as Error)?.message || e));
    } finally {
      setBusy(null);
      void refresh();
    }
  };
  const relogin = () =>
    run('login', async () => {
      const info = await runtime.larkWebConnect!();
      if (info.connected) message.success(t('larkBrowser.loggedIn', 'Đã đăng nhập Lark.'));
      else if (info.error) message.warning(info.error);
    });
  const nav = (input: { url?: string; action?: 'back' | 'forward' | 'reload' | 'home' | 'stop' | 'loginQr' | 'loginForm' }) =>
    run('nav', async () => setSt(await runtime.larkBrowserNavigate!({ ...input, ...(laneId ? { lane: laneId } : {}) })));

  // Trang đăng nhập Lark: mặc định MÃ QR, có nút đổi sang email/SSO. Lõi 0.1.1+ (`loginSwitch`) tự bật
  // QR và có action riêng. Lõi cũ (0.1.0) chỉ biết "mở URL Lark" → đổi bằng tham số URL (larkLoginUrl):
  // đường duy nhất mà một bản code-push giao diện với tới được trên bản cài cũ.
  const legacyLogin = !st?.loginSwitch && isLarkLoginPage(st?.url);
  const loginView: LarkLoginView | undefined = st?.loginSwitch ? st.loginView : legacyLogin ? (loginViewFromUrl(st?.url) ?? 'form') : undefined;
  const preferForm = useRef(false); // người dùng đã chọn email/SSO → không tự bật lại QR
  const rewritten = useRef<string | null>(null);
  useEffect(() => {
    if (st?.connected) preferForm.current = false; // đăng nhập xong → lần sau lại mặc định QR
  }, [st?.connected]);
  useEffect(() => {
    const url = st?.url;
    if (!legacyLogin || st?.loading || !url || preferForm.current || loginViewFromUrl(url)) return;
    if (rewritten.current === url) return; // mỗi URL một lần — không bao giờ tải lại vòng tròn
    rewritten.current = url;
    void runtime.larkBrowserNavigate?.({ url: loginUrlFor(url, 'qr'), ...(laneId ? { lane: laneId } : {}) }).catch(() => undefined);
  }, [legacyLogin, st?.url, st?.loading, runtime]);
  const switchLogin = (to: LarkLoginView) => {
    preferForm.current = to === 'form';
    if (st?.loginSwitch) nav({ action: to === 'qr' ? 'loginQr' : 'loginForm' });
    else if (st?.url) nav({ url: loginUrlFor(st.url, to) });
  };

  const ai = st?.ai;
  const dead = st?.health === 'dead';
  const pill = st?.loginPending
    ? { color: WARN, text: t('larkBrowser.waitingLogin', 'Đang chờ đăng nhập') }
    : dead
      ? { color: ERR, text: t('larkBrowser.expired', 'Hết phiên') }
      : st?.connected
        ? { color: OK, text: t('larkBrowser.connected', 'Đã đăng nhập') }
        : { color: V.textFaint, text: t('larkBrowser.notConnected', 'Chưa đăng nhập') };
  const needLogin = dead || !st?.connected;
  const lastSave = ai?.saves?.length ? ai.saves[ai.saves.length - 1] : null;

  return (
    <section data-testid="wf-lark-pane" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, gap: 6, ...style }}>
      {/* Dải trên cùng — một hàng 32px. */}
      <div data-testid="wf-lark-strip" style={{ display: 'flex', alignItems: 'center', gap: 4, height: 32, minWidth: 0 }}>
        <Tooltip title={`${pill.text}${st?.host ? ` · ${st.host}` : ''}`}>
          <span data-testid="wf-session-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: pill.color, flex: 'none', margin: '0 6px 0 4px' }} />
        </Tooltip>
        <Tooltip title={t('larkBrowser.back', 'Quay lại')}>
          <Button size="small" type="text" icon={<ArrowLeftOutlined />} disabled={!st?.canGoBack} onClick={() => nav({ action: 'back' })} />
        </Tooltip>
        <Tooltip title={t('larkBrowser.reload', 'Tải lại')}>
          <Button size="small" type="text" icon={<ReloadOutlined spin={!!st?.loading} />} disabled={!hasWindow} onClick={() => nav({ action: st?.loading ? 'stop' : 'reload' })} />
        </Tooltip>
        <Tooltip title={homeUrl ? t('wf.openBase', 'Mở Base của hội thoại') : t('larkBrowser.home', 'Trang chủ Lark')}>
          <Button size="small" type="text" icon={<HomeOutlined />} disabled={!hasWindow} onClick={() => nav(homeUrl ? { url: homeUrl } : { action: 'home' })} />
        </Tooltip>
        <Tooltip title={st?.url || ''}>
          <Text type="secondary" style={{ fontSize: 12, flex: 1, minWidth: 0, padding: '0 6px' }} ellipsis>
            {st?.title ? `${st.title}` : crumb(st?.url)}
          </Text>
        </Tooltip>
        {/* Trang đăng nhập Lark: đổi giữa mã QR (mặc định) và email/SSO. Ở khung hẹp Lark giấu nút
            chuyển của chính nó, nên nút này là đường duy nhất để đổi. */}
        {loginView && (
          <Tooltip
            title={
              loginView === 'qr'
                ? t('larkBrowser.loginFormTip', 'Đăng nhập bằng email, số điện thoại, SSO, Google hoặc Apple')
                : t('larkBrowser.loginQrTip', 'Hiện mã QR để quét bằng app Lark trên điện thoại')
            }
          >
            <Button
              size="small"
              data-testid="wf-login-view"
              icon={loginView === 'qr' ? <MailOutlined /> : <QrcodeOutlined />}
              loading={busy === 'nav'}
              onClick={() => switchLogin(loginView === 'qr' ? 'form' : 'qr')}
            >
              {loginView === 'qr' ? t('larkBrowser.loginForm', 'Email / SSO') : t('larkBrowser.loginQr', 'Quét mã QR')}
            </Button>
          </Tooltip>
        )}
        <LarkAccountMenu runtime={runtime} connected={!!st?.connected && !dead} host={st?.host} onChanged={() => void refresh()} />
        {needLogin && (
          <Button size="small" type="primary" icon={<LoginOutlined />} loading={busy === 'login'} onClick={relogin} style={{ background: BRAND_GRADIENT, border: 'none' }}>
            {t('larkBrowser.login', 'Đăng nhập Lark')}
          </Button>
        )}
        {onClose && (
          <Tooltip title={t('wf.closePane', 'Đóng khung Lark')}>
            <Button size="small" type="text" icon={<CloseOutlined />} onClick={onClose} />
          </Tooltip>
        )}
      </div>

      {ai && (ai.active || ai.stopped) && (
        <div data-testid="wf-ai-strip" style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 10, padding: '4px 8px', background: ai.stopped ? tint(ERR, '14') : tint(BRAND, '14'), border: `1px solid ${ai.stopped ? tint(ERR, '55') : tint(BRAND, '55')}`, minWidth: 0 }}>
          <RobotOutlined style={{ color: ai.stopped ? ERR : BRAND }} />
          <Text strong style={{ fontSize: 12.5, flex: 'none' }}>{ai.stopped ? t('larkBrowser.aiStopped', 'Đã dừng AI') : t('larkBrowser.aiWorking', 'AI đang thao tác')}</Text>
          <Text style={{ fontSize: 12.5, color: V.textSub, flex: 1, minWidth: 0 }} ellipsis>
            {ai.step || '…'} · {ai.actions}/{ai.cap}
            {lastSave ? ` · Lark ${lastSave.op}${lastSave.ok ? ' ✓' : ' ✗'}` : ''}
          </Text>
          {ai.stopped ? (
            <Button size="small" icon={<CaretRightOutlined />} onClick={() => run('resume', async () => setSt(await runtime.larkBrowserResumeAi!(laneId)))}>
              {t('larkBrowser.resume', 'Cho AI tiếp tục')}
            </Button>
          ) : (
            <Button size="small" danger type="primary" icon={<StopOutlined />} loading={busy === 'stop'} onClick={() => run('stop', async () => setSt(await runtime.larkBrowserStopAi!(laneId)))}>
              {t('larkBrowser.stop', 'Dừng')}
            </Button>
          )}
        </div>
      )}

      <div ref={holder} data-testid="wf-lark-holder" style={{ flex: 1, minHeight: 0, borderRadius: 12, border: `1px solid ${V.border}`, background: '#ffffff', overflow: 'hidden', position: 'relative' }}>
        {!hasWindow && (
          <div style={{ padding: 20, background: V.surface, height: '100%', boxSizing: 'border-box' }}>
            <EmptyState
              icon={<GlobalOutlined />}
              title={t('larkBrowser.emptyTitle', 'Chưa có phiên Lark web')}
              description={t('wf.loginDesc', 'Đăng nhập Lark ngay trong khung này (QR / SSO) — không cần App ID/App Secret. Larkwave quét Base từ phiên này, AI tạo workflow và thao tác ngay tại đây cho bạn xem.')}
              actionLabel={t('larkBrowser.login', 'Đăng nhập Lark')}
              onAction={relogin}
            />
          </div>
        )}
        {st?.hidden && <div style={{ position: 'absolute', left: 8, bottom: 8, fontSize: 11, color: V.textFaint }}>LARKWAVE_HIDDEN</div>}
      </div>
    </section>
  );
}
