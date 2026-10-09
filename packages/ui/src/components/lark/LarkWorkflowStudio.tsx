'use client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Empty, Segmented, Select, Tag, Tooltip, Typography } from 'antd';
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ReloadOutlined,
  HomeOutlined,
  LoginOutlined,
  StopOutlined,
  RobotOutlined,
  CheckCircleFilled,
  GlobalOutlined,
  CaretRightOutlined,
  PlusOutlined,
  DatabaseOutlined,
  ApartmentOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import type { LarkBaseRef, LarkBrowserState, LarkSessionMeta, LarkWebBase, RuntimeAdapter } from '@larkwave/core';
import { BRAND, BRAND_GRADIENT, OK, WARN, ERR, V, tint } from '../../theme';
import { EmptyState } from '../../kit';
import { useI18n } from '../../i18n';
import { LarkChat } from './LarkChat';
import { clampPaneWidth, dockDecision, shouldAutoOpen, ZERO_RECT } from './larkDock';

const { Text } = Typography;

/** Bề rộng khung Lark — tiện ích riêng của máy này (localStorage, lỗi thì dùng mặc định). */
const PANE_W_KEY = 'larkwave.wf.paneWidth';
const readNum = (k: string, d: number) => {
  try {
    const v = Number(window.localStorage.getItem(k));
    return Number.isFinite(v) && v > 0 ? v : d;
  } catch {
    return d;
  }
};
const writeNum = (k: string, v: number) => {
  try {
    window.localStorage.setItem(k, String(v));
  } catch {
    /* không có storage */
  }
};


/**
 * "Tạo workflow" — chế độ thứ hai của Lark × Agents.
 *
 *   [Hội thoại workflow] │ [Base ▾ + hội thoại + ô nhập] ║ [Trang Lark thật (Chromium) + AI strip]
 *
 * Không cần App ID/App Secret: mọi thứ chạy bằng phiên Lark web của chính người dùng — danh sách
 * Base quét từ trình duyệt, agent quét Base → thiết kế → tạo automation TẮT (tự động, hoặc hỏi trước nếu người dùng chọn), và khi
 * cần thao tác giao diện thì khung Lark bên phải hiện đúng trang AI đang điều khiển (có nút Dừng).
 * Trang Lark là native view: thu gọn/hộp thoại mở → giấu (vẫn vẽ), rời màn → tháo (phiên vẫn chạy).
 */
export function LarkWorkflowStudio({ runtime, onOpenSkills }: { runtime: RuntimeAdapter; onOpenSkills?: () => void }) {
  const { message } = App.useApp();
  const { t } = useI18n();
  const supported = !!runtime.larkBrowserAttach && !!runtime.larkWebListBases;

  // ── Hội thoại workflow ──
  const [sessions, setSessions] = useState<LarkSessionMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, LarkBaseRef | null>>({});
  const booted = useRef(false);

  const refreshSessions = useCallback(async () => {
    const list = await runtime.larkSessions?.().catch(() => null);
    if (!Array.isArray(list)) return null;
    const wf = list.filter((s) => s.kind === 'workflow');
    setSessions(wf);
    return wf;
  }, [runtime]);

  const newConversation = useCallback(
    async (base?: LarkBaseRef | null) => {
      const r = await runtime.larkNewSession?.(base ? [base] : [], { kind: 'workflow' }).catch(() => undefined);
      if (!r?.id) return;
      setDrafts((d) => ({ ...d, [r.id]: base ?? null }));
      setActiveId(r.id);
    },
    [runtime],
  );

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void (async () => {
      const wf = await refreshSessions();
      if (wf?.length) setActiveId(wf[0].id);
      else await newConversation(null);
    })();
  }, [refreshSessions, newConversation]);

  // ── Base thấy được qua phiên Lark web ──
  const [bases, setBases] = useState<LarkWebBase[]>([]);
  const [basesBusy, setBasesBusy] = useState(false);
  const [basesErr, setBasesErr] = useState('');
  const loadBases = useCallback(
    async (query?: string) => {
      if (!runtime.larkWebListBases) return;
      setBasesBusy(true);
      try {
        const list = await runtime.larkWebListBases(query ? { query } : undefined);
        setBases((prev) => {
          if (!query) return list;
          const seen = new Set(prev.map((b) => b.token));
          return [...prev, ...list.filter((b) => !seen.has(b.token))];
        });
        setBasesErr('');
      } catch (e) {
        setBasesErr(String((e as Error)?.message || e));
      } finally {
        setBasesBusy(false);
      }
    },
    [runtime],
  );

  // ── Công tắc "Tự động (không hỏi lại)" — riêng máy này, lưu ở main (mặc định BẬT) ──
  const [autoMode, setAutoMode] = useState<boolean | null>(null);
  useEffect(() => {
    if (!runtime.larkGetWorkflowAuto) return;
    runtime
      .larkGetWorkflowAuto()
      .then((r) => setAutoMode(!!r?.workflowAuto))
      .catch(() => setAutoMode(null));
  }, [runtime]);
  const changeAuto = async (on: boolean) => {
    setAutoMode(on);
    try {
      const r = await runtime.larkSetWorkflowAuto?.(on);
      if (r) setAutoMode(!!r.workflowAuto);
    } catch {
      message.error(t('wf.autoSaveErr', 'Không lưu được lựa chọn.'));
    }
  };

  // ── Trạng thái khung Lark ──
  const [st, setSt] = useState<LarkBrowserState | null>(null);
  const refreshState = useCallback(async () => {
    if (!runtime.larkBrowserState) return;
    try {
      setSt(await runtime.larkBrowserState());
    } catch {
      /* giữ trạng thái cũ */
    }
  }, [runtime]);
  useEffect(() => {
    void refreshState();
    const id = setInterval(() => void refreshState(), 1000);
    return () => clearInterval(id);
  }, [refreshState]);

  // Danh sách Base: tải khi phiên Lark web đã đăng nhập (và tải lại khi vừa đăng nhập xong).
  const connected = !!st?.connected && st?.health !== 'dead';
  useEffect(() => {
    if (connected) void loadBases();
  }, [connected, loadBases]);

  const activeMeta = sessions.find((s) => s.id === activeId);
  const activeBase: LarkBaseRef | null = activeId
    ? activeId in drafts
      ? drafts[activeId]
      : activeMeta?.bases?.[0] ?? null
    : null;
  const pickBase = (token: string) => {
    if (!activeId) return;
    const b = bases.find((x) => x.token === token);
    if (!b) return;
    setDrafts((d) => ({ ...d, [activeId]: { appToken: b.token, name: b.name } }));
    // Mở luôn Base trong khung Lark để người dùng thấy đúng chỗ AI sẽ làm.
    void runtime.larkBrowserNavigate?.({ url: b.url || undefined }).catch(() => undefined);
    setTimeout(() => void refreshSessions(), 800);
  };

  // ── Khung Lark: mở/thu, bề rộng, gắn native view ──
  const [paneOpen, setPaneOpen] = useState(true);
  const [paneW, setPaneW] = useState(() => (typeof window === 'undefined' ? 560 : readNum(PANE_W_KEY, 560)));
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // Bề rộng thật của màn → cửa sổ hẹp thì thu danh sách hội thoại và kẹp khung Lark (chừa chỗ chat).
  const [wrapW, setWrapW] = useState(1400);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setWrapW(el.getBoundingClientRect().width || 1400));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const asideW = wrapW < 1100 ? 168 : 220;
  const effPaneW = Math.min(clampPaneWidth(paneW, wrapW - asideW, 320, 400), Math.round((wrapW - asideW) * 0.55));
  const holder = useRef<HTMLDivElement | null>(null);
  const wasActive = useRef(false);
  useEffect(() => {
    if (shouldAutoOpen(st, wasActive.current)) setPaneOpen(true);
    wasActive.current = !!st?.ai?.active;
  }, [st]);

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const total = wrapRef.current?.getBoundingClientRect().width ?? 1200;
    const right = wrapRef.current?.getBoundingClientRect().right ?? total;
    const move = (ev: MouseEvent) => setPaneW(clampPaneWidth(right - ev.clientX, total - asideW, 320, 400));
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      setPaneW((w) => {
        writeNum(PANE_W_KEY, w);
        return w;
      });
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const hasWindow = !!st?.hasWindow;
  useLayoutEffect(() => {
    if (!runtime.larkBrowserAttach) return;
    let raf = 0;
    const push = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = holder.current;
        const r = el ? el.getBoundingClientRect() : null;
        // Hộp thoại/menu antd đang mở → native view sẽ che nó → giấu view (vẫn vẽ ở góc).
        const overlayOpen = !!document.querySelector('.ant-modal-wrap:not([style*="display: none"]) .ant-modal, .ant-drawer-open');
        const d = dockDecision({
          visible: !!el && el.offsetParent !== null,
          paneOpen,
          overlayOpen,
          hasWindow,
          rect: r ? { x: r.left, y: r.top, width: r.width, height: r.height } : null,
        });
        if (d.kind === 'attach') void runtime.larkBrowserAttach!(d.rect).catch(() => undefined);
        else if (d.kind === 'hide') void runtime.larkBrowserAttach!(ZERO_RECT).catch(() => undefined);
        else void runtime.larkBrowserDetach?.().catch(() => undefined);
      });
    };
    push();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(push) : null;
    if (ro && holder.current) ro.observe(holder.current);
    window.addEventListener('resize', push);
    const tick = setInterval(push, 600); // hộp thoại mở/đóng + layout dịch chuyển mà observer không thấy
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('resize', push);
      clearInterval(tick);
    };
  }, [runtime, paneOpen, hasWindow, effPaneW]);
  // Rời màn: tháo trang (phiên + AI vẫn chạy ngầm).
  useEffect(() => () => void runtime.larkBrowserDetach?.().catch(() => undefined), [runtime]);

  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      message.error(String((e as Error)?.message || e));
    } finally {
      setBusy(null);
      void refreshState();
    }
  };
  const relogin = () =>
    run('login', async () => {
      const info = await runtime.larkWebConnect!();
      if (info.connected) message.success(t('larkBrowser.loggedIn', 'Đã đăng nhập Lark.'));
      else if (info.error) message.warning(info.error);
    });
  const nav = (input: { url?: string; action?: 'back' | 'forward' | 'reload' | 'home' | 'stop' }) =>
    run('nav', async () => setSt(await runtime.larkBrowserNavigate!(input)));

  const ai = st?.ai;
  const dead = st?.health === 'dead';
  const pill = st?.loginPending
    ? { color: WARN, text: t('larkBrowser.waitingLogin', 'Đang chờ đăng nhập') }
    : dead
      ? { color: ERR, text: t('larkBrowser.expired', 'Hết phiên') }
      : st?.connected
        ? { color: OK, text: t('larkBrowser.connected', 'Đã đăng nhập') }
        : { color: V.textFaint, text: t('larkBrowser.notConnected', 'Chưa đăng nhập') };
  const lastSave = ai?.saves?.length ? ai.saves[ai.saves.length - 1] : null;

  // ── Bộ chọn Base (đầu hội thoại) ──
  const [q, setQ] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearch = (v: string) => {
    setQ(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const s = v.trim();
    if (s.length < 2) return;
    const fold = (x: string) => x.toLowerCase();
    if (bases.some((b) => fold(b.name).includes(fold(s)))) return;
    searchTimer.current = setTimeout(() => void loadBases(s), 450);
  };
  const options = useMemo(
    () =>
      bases.map((b) => ({
        value: b.token,
        label: (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <DatabaseOutlined style={{ color: BRAND, flex: 'none' }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
            {b.isWiki && <Tag style={{ margin: 0, fontSize: 10, lineHeight: '16px' }}>Wiki</Tag>}
          </span>
        ),
        search: `${b.name} ${b.wikiSpace || ''}`.toLowerCase(),
      })),
    [bases],
  );
  const header = (
    <div data-testid="wf-base-picker" style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8, marginBottom: 4, borderBottom: `1px solid ${V.borderSub}`, flexWrap: 'wrap' }}>
      <DatabaseOutlined style={{ color: BRAND }} />
      <Text style={{ fontSize: 13, fontWeight: 600, color: V.textSub }}>Base:</Text>
      <Select
        showSearch
        value={activeBase?.appToken}
        placeholder={connected ? t('wf.pickBase', 'Chọn Base để tạo workflow…') : t('wf.loginFirst', 'Đăng nhập Lark ở khung bên phải trước')}
        disabled={!connected || !activeId}
        loading={basesBusy}
        options={options}
        onChange={pickBase}
        onSearch={onSearch}
        searchValue={q}
        filterOption={(input, opt) => String((opt as { search?: string })?.search || '').includes(input.toLowerCase())}
        notFoundContent={basesBusy ? t('wf.searching', 'Đang tìm…') : t('wf.noBase', 'Không thấy Base nào')}
        style={{ flex: '1 1 280px', minWidth: 220, maxWidth: 520 }}
        popupMatchSelectWidth={false}
        listHeight={360}
      />
      <Tooltip title={t('wf.rescan', 'Quét lại danh sách Base')}>
        <Button size="small" type="text" icon={<SyncOutlined spin={basesBusy} />} disabled={!connected} onClick={() => void loadBases()} />
      </Tooltip>
      <Text type="secondary" style={{ fontSize: 12 }}>
        {bases.length ? `${bases.length} Base` : basesErr ? basesErr.slice(0, 80) : ''}
      </Text>
      {autoMode !== null && (
        <Tooltip
          title={
            autoMode
              ? t('wf.autoTip', 'Tạo bản nháp TẮT, thêm bảng/cột/lựa chọn chạy ngay. Xoá hoặc ghi đè vẫn hỏi. Không bao giờ tự bật automation.')
              : t('wf.askTip', 'Mỗi thao tác ghi đều hiện hộp xác nhận vẽ sẵn thiết kế.')
          }
        >
          <Segmented
            data-testid="wf-auto-toggle"
            size="small"
            style={{ marginLeft: 'auto' }}
            value={autoMode ? 'auto' : 'ask'}
            onChange={(v) => void changeAuto(v === 'auto')}
            options={[
              { label: t('wf.auto', 'Tự động (không hỏi lại)'), value: 'auto' },
              { label: t('wf.ask', 'Hỏi trước khi ghi'), value: 'ask' },
            ]}
          />
        </Tooltip>
      )}
    </div>
  );

  if (!supported) return <Empty description={t('wf.needUpdate', '“Tạo workflow” cần bản cài mới (.dmg).')} />;

  return (
    <div ref={wrapRef} data-testid="wf-studio" style={{ display: 'flex', flex: 1, minHeight: 0, height: '100%', gap: 0 }}>
      {/* Trái: hội thoại workflow */}
      <aside style={{ width: asideW, flex: `0 0 ${asideW}px`, borderRight: `1px solid ${V.border}`, background: V.surface, display: 'flex', flexDirection: 'column', padding: '10px 8px', gap: 6, borderRadius: '12px 0 0 12px' }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => void newConversation(activeBase)} style={{ background: BRAND_GRADIENT, border: 'none' }}>
          {t('wf.new', 'Workflow mới')}
        </Button>
        <Text type="secondary" style={{ fontSize: 11.5, padding: '4px 4px 0' }}>
          {t('wf.history', 'Hội thoại tạo workflow')}
        </Text>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {activeId && !sessions.some((s) => s.id === activeId) && (
            <div style={{ padding: '7px 8px', borderRadius: 8, background: tint(BRAND, '14'), fontSize: 13 }}>
              <div style={{ fontWeight: 600 }}>{t('wf.newConv', 'Workflow mới')}</div>
              <div style={{ fontSize: 11.5, color: V.textSub }}>{activeBase?.name || t('wf.noBaseYet', 'chưa chọn Base')}</div>
            </div>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              role="button"
              tabIndex={0}
              onClick={() => setActiveId(s.id)}
              onKeyDown={(e) => e.key === 'Enter' && setActiveId(s.id)}
              style={{ padding: '7px 8px', borderRadius: 8, cursor: 'pointer', background: s.id === activeId ? tint(BRAND, '14') : 'transparent', fontSize: 13 }}
            >
              <div style={{ fontWeight: s.id === activeId ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title || t('wf.newConv', 'Workflow mới')}</div>
              <div style={{ fontSize: 11.5, color: V.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <ApartmentOutlined /> {s.bases?.[0]?.name || t('wf.noBaseYet', 'chưa chọn Base')}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Giữa: hội thoại */}
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', padding: '8px 10px 0' }}>
        {activeId ? (
          <LarkChat
            key={activeId}
            runtime={runtime}
            pinnedSessionId={activeId}
            hideSessionList
            onOpenSkills={onOpenSkills}
            blocked={connected ? null : t('wf.blockedLogin', 'Đăng nhập Lark ở khung bên phải để bắt đầu.')}
            workflow={{ base: activeBase, header }}
          />
        ) : (
          <Empty style={{ marginTop: 60 }} />
        )}
      </main>

      {/* Thanh kéo đổi bề rộng */}
      {paneOpen && (
        <div
          onMouseDown={startDrag}
          title={t('wf.resize', 'Kéo để đổi bề rộng')}
          style={{ width: 6, flex: '0 0 6px', cursor: 'col-resize', background: V.borderSub }}
        />
      )}

      {/* Phải: trang Lark thật */}
      <section
        data-testid="wf-lark-pane"
        style={{ width: paneOpen ? effPaneW : 44, flex: `0 0 ${paneOpen ? effPaneW : 44}px`, display: 'flex', flexDirection: 'column', gap: 6, padding: paneOpen ? '6px 0 0 8px' : 6, minWidth: 0 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: paneOpen ? 'wrap' : 'nowrap', flexDirection: paneOpen ? 'row' : 'column' }}>
          <Tooltip title={paneOpen ? t('wf.hidePane', 'Thu gọn khung Lark') : t('wf.showPane', 'Mở khung Lark')}>
            <Button size="small" type="text" icon={paneOpen ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => setPaneOpen((v) => !v)} />
          </Tooltip>
          {paneOpen && (
            <>
              <Tooltip title={st?.host || ''}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: pill.color, padding: '2px 8px', borderRadius: 999, background: tint(typeof pill.color === 'string' && pill.color.startsWith('#') ? pill.color : '#94A3B8', '1a') }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: pill.color }} />
                  {pill.text}
                </span>
              </Tooltip>
              <Button size="small" icon={<LoginOutlined />} loading={busy === 'login'} type={dead || !st?.connected ? 'primary' : 'default'} onClick={relogin} style={dead || !st?.connected ? { background: BRAND_GRADIENT, border: 'none' } : undefined}>
                {st?.connected && !dead ? t('larkBrowser.relogin', 'Đăng nhập lại') : t('larkBrowser.login', 'Đăng nhập Lark')}
              </Button>
              <span style={{ flex: 1 }} />
              <Tooltip title={t('larkBrowser.back', 'Quay lại')}>
                <Button size="small" type="text" icon={<ArrowLeftOutlined />} disabled={!st?.canGoBack} onClick={() => nav({ action: 'back' })} />
              </Tooltip>
              <Tooltip title={t('larkBrowser.forward', 'Tiến')}>
                <Button size="small" type="text" icon={<ArrowRightOutlined />} disabled={!st?.canGoForward} onClick={() => nav({ action: 'forward' })} />
              </Tooltip>
              <Tooltip title={t('larkBrowser.reload', 'Tải lại')}>
                <Button size="small" type="text" icon={<ReloadOutlined spin={!!st?.loading} />} disabled={!hasWindow} onClick={() => nav({ action: st?.loading ? 'stop' : 'reload' })} />
              </Tooltip>
              <Tooltip title={activeBase ? t('wf.openBase', 'Mở Base đang chọn') : t('larkBrowser.home', 'Trang chủ Lark')}>
                <Button
                  size="small"
                  type="text"
                  icon={<HomeOutlined />}
                  disabled={!hasWindow}
                  onClick={() => {
                    const b = activeBase ? bases.find((x) => x.token === activeBase.appToken) : null;
                    void nav(b?.url ? { url: b.url } : { action: 'home' });
                  }}
                />
              </Tooltip>
            </>
          )}
        </div>

        {paneOpen && ai && (ai.active || ai.stopped) && (
          <div data-testid="wf-ai-strip" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderRadius: 10, padding: '5px 8px', background: ai.stopped ? tint(ERR, '14') : tint(BRAND, '14'), border: `1px solid ${ai.stopped ? tint(ERR, '55') : tint(BRAND, '55')}` }}>
            <RobotOutlined style={{ color: ai.stopped ? ERR : BRAND }} />
            <Text strong style={{ fontSize: 12.5 }}>{ai.stopped ? t('larkBrowser.aiStopped', 'Đã dừng AI') : t('larkBrowser.aiWorking', 'AI đang thao tác')}</Text>
            <Text style={{ fontSize: 12.5, color: V.textSub, flex: '1 1 140px', minWidth: 0 }} ellipsis>
              {ai.step || '…'}
            </Text>
            <Tag style={{ margin: 0 }}>{ai.actions}/{ai.cap}</Tag>
            {lastSave && (
              <Tag color={lastSave.ok ? 'green' : 'red'} style={{ margin: 0 }}>
                {lastSave.ok ? <CheckCircleFilled /> : null} Lark {lastSave.op}{lastSave.workflowID ? ` #${lastSave.workflowID}` : ''}
              </Tag>
            )}
            {ai.stopped ? (
              <Button size="small" icon={<CaretRightOutlined />} onClick={() => run('resume', async () => setSt(await runtime.larkBrowserResumeAi!()))}>
                {t('larkBrowser.resume', 'Cho AI tiếp tục')}
              </Button>
            ) : (
              <Button size="small" danger type="primary" icon={<StopOutlined />} loading={busy === 'stop'} onClick={() => run('stop', async () => setSt(await runtime.larkBrowserStopAi!()))}>
                {t('larkBrowser.stop', 'Dừng')}
              </Button>
            )}
          </div>
        )}

        {paneOpen && (
          <div
            ref={holder}
            data-testid="wf-lark-holder"
            style={{ flex: 1, minHeight: 0, borderRadius: 12, border: `1px solid ${V.border}`, background: '#ffffff', overflow: 'hidden', position: 'relative' }}
          >
            {!hasWindow && (
              <div style={{ padding: 20, background: V.surface, height: '100%', boxSizing: 'border-box' }}>
                <EmptyState
                  icon={<GlobalOutlined />}
                  title={t('larkBrowser.emptyTitle', 'Chưa có phiên Lark web')}
                  description={t(
                    'wf.loginDesc',
                    'Đăng nhập Lark ngay trong khung này (QR / SSO) — không cần App ID/App Secret. Larkwave quét Base từ phiên này, AI tạo automation và thao tác ngay tại đây cho bạn xem.',
                  )}
                  actionLabel={t('larkBrowser.login', 'Đăng nhập Lark')}
                  onAction={relogin}
                />
              </div>
            )}
            {st?.hidden && <div style={{ position: 'absolute', left: 8, bottom: 8, fontSize: 11, color: V.textFaint }}>LARKWAVE_HIDDEN</div>}
          </div>
        )}
        {!paneOpen && ai?.active && (
          <Tooltip title={t('larkBrowser.aiWorking', 'AI đang thao tác')} placement="left">
            <RobotOutlined style={{ color: BRAND, fontSize: 18, alignSelf: 'center', marginTop: 8 }} />
          </Tooltip>
        )}
      </section>
    </div>
  );
}
