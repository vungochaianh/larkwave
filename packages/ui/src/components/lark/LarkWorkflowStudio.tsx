'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Empty, Input, Tooltip, Typography, type MenuProps } from 'antd';
import {
  DoubleLeftOutlined,
  DoubleRightOutlined,
  HistoryOutlined,
  MessageOutlined,
  PlusOutlined,
  VerticalRightOutlined,
  ApartmentOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons';
import type { LarkBaseRef, RuntimeAdapter } from '@larkwave/core';
import { BRAND, V, tint } from '../../theme';
import { useI18n } from '../../i18n';
import { LarkChat } from './LarkChat';
import { LarkFramePane, useAutoOpen, useLarkBrowserState } from './LarkFramePane';
import { ACTIVE_CONV_KEY, dockWidth, dragDock, LAYOUT_KEY, nextDock, parseLayoutPrefs, serializeLayoutPrefs, type DockAction, type LayoutPrefs } from './larkLayout';
import { unifySessions } from './larkConversations';

const { Text } = Typography;
const ACTIVE_KEY = ACTIVE_CONV_KEY;

const readPrefs = (): LayoutPrefs => {
  try {
    return parseLayoutPrefs(window.localStorage.getItem(LAYOUT_KEY));
  } catch {
    return parseLayoutPrefs(null);
  }
};
const savePrefs = (p: LayoutPrefs) => {
  try {
    window.localStorage.setItem(LAYOUT_KEY, serializeLayoutPrefs(p));
  } catch {
    /* tiện ích riêng máy */
  }
};

type Conv = ReturnType<typeof unifySessions>[number];

/**
 * Màn "Tạo workflow" — BỐ CỤC KHUNG-TRƯỚC của cùng agent/hội thoại với Lark × Agents.
 *
 *   [hội thoại gắn trái: mở rộng 420–560 · thu nhỏ ~300 · dải 48] ║ [KHUNG LARK LỚN + dải tối giản]
 *
 * Khung Lark là chính (người dùng muốn "nhìn rõ giao diện Lark"): canvas workflow vừa tạo mở ngay tại
 * đây. Hội thoại là CÙNG danh sách với màn Lark × Agents (mở hội thoại nào ở màn kia cũng tiếp tục được
 * ở đây). Nấc + bề rộng + danh sách hội thoại mở/đóng nhớ riêng máy này (larkLayout.ts).
 */
export function LarkWorkflowStudio({
  runtime,
  onOpenSkills,
  extraMenu,
  onToChat,
}: {
  runtime: RuntimeAdapter;
  onOpenSkills?: () => void;
  /** Về cách xếp hội thoại-trước: 'toggle' = khung về ngăn phụ, 'closeFrame' = đóng khung. */
  onToChat?: (how: 'toggle' | 'closeFrame') => void;
  extraMenu?: { items: NonNullable<MenuProps['items']>; onClick: (key: string) => void };
}) {
  const { t } = useI18n();
  const supported = !!runtime.larkBrowserAttach && !!runtime.larkWebListBases;

  // ── Bố cục ──
  const [prefs, setPrefsState] = useState<LayoutPrefs>(() => (typeof window === 'undefined' ? parseLayoutPrefs(null) : readPrefs()));
  const setPrefs = (fn: (p: LayoutPrefs) => LayoutPrefs) =>
    setPrefsState((p) => {
      const n = fn(p);
      savePrefs(n);
      return n;
    });
  const act = (a: DockAction) => setPrefs((p) => ({ ...p, dock: nextDock(p.dock, a) }));
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [wrapW, setWrapW] = useState(1200);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setWrapW(el.getBoundingClientRect().width || 1200));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const dock = dockWidth(prefs, wrapW);
  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const left = wrapRef.current?.getBoundingClientRect().left ?? 0;
    const total = wrapRef.current?.getBoundingClientRect().width ?? 1200;
    const move = (ev: MouseEvent) => {
      const l = dragDock(ev.clientX - left, total);
      setPrefsState((p) => ({ ...p, dock: l.dock, ...(l.expandedW ? { expandedW: l.expandedW } : {}) }));
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      setPrefsState((p) => {
        savePrefs(p);
        return p;
      });
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  // ── Hội thoại (CÙNG danh sách với Lark × Agents) ──
  const [sessions, setSessions] = useState<Conv[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(null);
  const setActiveId = (id: string) => {
    setActiveIdState(id);
    try {
      window.localStorage.setItem(ACTIVE_KEY, id);
    } catch {
      /* tiện ích riêng máy */
    }
  };
  const booted = useRef(false);
  const refreshSessions = useCallback(async () => {
    const list = await runtime.larkSessions?.().catch(() => null);
    if (!Array.isArray(list)) return null;
    const all = unifySessions(list);
    setSessions(all);
    return all;
  }, [runtime]);
  const newConversation = async (bases: LarkBaseRef[] = []) => {
    const r = await runtime.larkNewSession?.(bases).catch(() => undefined);
    if (!r?.id) return;
    setActiveId(r.id);
    setPrefs((p) => ({ ...p, historyOpen: false }));
    setTimeout(() => void refreshSessions(), 600);
  };
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void (async () => {
      const all = await refreshSessions();
      let remembered: string | null = null;
      try {
        remembered = window.localStorage.getItem(ACTIVE_KEY);
      } catch {
        /* */
      }
      const pick = (remembered && all?.find((s) => s.id === remembered)) || all?.find((s) => s.origin === 'workflow') || all?.[0];
      if (pick) setActiveId(pick.id);
      else await newConversation([]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const active = sessions.find((s) => s.id === activeId);
  const [title, setTitle] = useState('');

  // ── Khung Lark ──
  // Khung lớn hiện TRANG Lark riêng của hội thoại đang chọn (mỗi hội thoại một trang).
  const [st, refresh, setSt] = useLarkBrowserState(runtime, activeId);
  const webConnected = !!st?.connected && st?.health !== 'dead';
  const [appConnected, setAppConnected] = useState(false);
  useEffect(() => {
    runtime.larkStatus?.().then((c) => setAppConnected(!!c?.connected)).catch(() => undefined);
  }, [runtime]);
  // AI bắt đầu lái khung khi hội thoại đang ở dải 48px → mở về nấc thu nhỏ để người dùng thấy lượt chạy.
  useAutoOpen(st, () => setPrefs((p) => (p.dock === 'rail' ? { ...p, dock: 'collapsed' } : p)));
  useEffect(() => () => void runtime.larkBrowserDetach?.().catch(() => undefined), [runtime]);
  const baseUrl = (b?: { appToken: string; url?: string }) => (b ? b.url || (st?.host ? `${st.host}/base/${b.appToken}` : undefined) : undefined);
  const [homeUrl, setHomeUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    setHomeUrl(baseUrl(active?.bases?.[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, active?.bases?.[0]?.appToken, st?.host]);
  // Trang Lark của một hội thoại mở lần đầu (lane mới, đang ở Drive) → tự vào Base của hội thoại đó, một
  // lần cho mỗi hội thoại; sau đó người dùng tự đi đâu trong trang thì để yên.
  const homed = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!activeId || !homeUrl || !st?.connected || homed.current.has(activeId)) return;
    homed.current.add(activeId);
    void runtime.larkBrowserNavigate?.({ url: homeUrl, lane: activeId }).catch(() => undefined);
  }, [activeId, homeUrl, st?.connected, runtime]);

  // ── Danh sách hội thoại (trong cột trái) ──
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? sessions.filter((s) => (s.title || '').toLowerCase().includes(n) || (s.bases || []).some((b) => (b.name || '').toLowerCase().includes(n))) : sessions;
  }, [sessions, q]);

  if (!supported) return <Empty description={t('wf.needUpdate', '“Tạo workflow” cần bản cài mới (.dmg).')} />;

  const historyPanel = (
    <div data-testid="wf-history" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 44, borderBottom: `1px solid ${V.borderSub}` }}>
        <Tooltip title={t('wf.backToChat', 'Về hội thoại')}>
          <Button size="small" type="text" icon={<ArrowLeftOutlined />} onClick={() => setPrefs((p) => ({ ...p, historyOpen: false }))} />
        </Tooltip>
        <Text strong style={{ flex: 1 }}>{t('wf.history', 'Hội thoại')}</Text>
        <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => void newConversation((active?.bases || []).map((b) => ({ appToken: b.appToken, name: b.name || b.appToken })))}>
          {t('wf.new', 'Mới')}
        </Button>
      </div>
      <Input size="small" allowClear placeholder={t('chat.searchConv', 'Tìm hội thoại / Base…')} value={q} onChange={(e) => setQ(e.target.value)} />
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {!filtered.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('chat.noConversations', 'Chưa có cuộc trò chuyện')} />}
        {filtered.map((s) => (
          <div
            key={s.id}
            role="button"
            tabIndex={0}
            onClick={() => {
              setActiveId(s.id);
              setPrefs((p) => ({ ...p, historyOpen: false }));
            }}
            onKeyDown={(e) => e.key === 'Enter' && setActiveId(s.id)}
            style={{ padding: '7px 8px', borderRadius: 8, cursor: 'pointer', background: s.id === activeId ? tint(BRAND, '14') : 'transparent', fontSize: 13 }}
          >
            <div style={{ fontWeight: s.id === activeId ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title || t('chat.newConversation', 'Cuộc trò chuyện mới')}</div>
            <div style={{ fontSize: 11.5, color: V.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <ApartmentOutlined /> {(s.bases || []).map((b) => b.name).join(', ') || t('wf.noBaseYet', 'chưa chọn Base')}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const collapsed = dock.state === 'collapsed';
  const leading = (
    <span style={{ display: 'inline-flex', flex: 'none' }}>
      <Tooltip title={t('wf.history', 'Hội thoại')}>
        <Button data-testid="wf-history-toggle" size="small" type="text" icon={<HistoryOutlined />} onClick={() => setPrefs((p) => ({ ...p, historyOpen: true }))} />
      </Tooltip>
      {collapsed ? (
        <Tooltip title={t('wf.expandChat', 'Mở rộng hội thoại')}>
          <Button data-testid="wf-dock-expand" size="small" type="text" icon={<DoubleRightOutlined />} onClick={() => act('expand')} />
        </Tooltip>
      ) : (
        <Tooltip title={t('wf.collapseChat', 'Thu nhỏ hội thoại')}>
          <Button data-testid="wf-dock-collapse" size="small" type="text" icon={<DoubleLeftOutlined />} onClick={() => act('collapse')} />
        </Tooltip>
      )}
    </span>
  );
  const blocked = webConnected || appConnected ? null : t('wf.blockedLogin', 'Đăng nhập Lark ở khung bên phải để bắt đầu.');

  return (
    <div ref={wrapRef} data-testid="wf-studio" data-dock={dock.state} style={{ display: 'flex', flex: 1, minHeight: 0, height: '100%' }}>
      {/* Trái: hội thoại gắn cạnh khung */}
      <aside
        data-testid="wf-dock"
        style={{ width: dock.width, flex: `0 0 ${dock.width}px`, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, background: V.surface, borderRight: `1px solid ${V.border}`, borderRadius: '12px 0 0 12px', padding: dock.state === 'rail' ? '8px 4px' : '0 8px 8px', transition: 'width .18s ease' }}
      >
        {dock.state === 'rail' ? (
          <div data-testid="wf-rail" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <Tooltip title={t('wf.openChat', 'Mở hội thoại')} placement="right">
              <Button type="text" icon={<DoubleRightOutlined />} onClick={() => act('collapse')} />
            </Tooltip>
            <Tooltip title={title || t('chat.conversation', 'Cuộc trò chuyện')} placement="right">
              <Badge dot={!!st?.ai?.active} color={BRAND}>
                <Button type="text" icon={<MessageOutlined style={{ color: BRAND }} />} onClick={() => act('collapse')} />
              </Badge>
            </Tooltip>
            <Tooltip title={t('wf.new', 'Hội thoại mới')} placement="right">
              <Button type="text" icon={<PlusOutlined />} onClick={() => void newConversation((active?.bases || []).map((b) => ({ appToken: b.appToken, name: b.name || b.appToken }))).then(() => act('collapse'))} />
            </Tooltip>
            <Tooltip title={t('wf.history', 'Hội thoại')} placement="right">
              <Button type="text" icon={<HistoryOutlined />} onClick={() => setPrefs((p) => ({ ...p, historyOpen: true, dock: 'expanded' }))} />
            </Tooltip>
          </div>
        ) : prefs.historyOpen ? (
          historyPanel
        ) : activeId ? (
          <LarkChat
            key={activeId}
            runtime={runtime}
            pinnedSessionId={activeId}
            hideSessionList
            onOpenSkills={onOpenSkills}
            blocked={blocked}
            layout="frame"
            density={collapsed ? 'compact' : 'normal'}
            leading={leading}
            onTitle={setTitle}
            frame={onToChat ? { open: true, frameFirst: true, toggle: () => onToChat('closeFrame'), expand: () => onToChat('toggle') } : undefined}
            extraMenu={{
              items: [{ key: '__rail', icon: <VerticalRightOutlined />, label: t('wf.toRail', 'Thu thành dải') }, ...(extraMenu?.items || [])],
              onClick: (k) => (k === '__rail' ? act('rail') : extraMenu?.onClick(k)),
            }}
            onBasesChange={(bases, added) => {
              const url = baseUrl(added || bases[0]);
              setHomeUrl(baseUrl(bases[0]));
              if (url) void runtime.larkBrowserNavigate?.({ url, ...(activeId ? { lane: activeId } : {}) }).catch(() => undefined);
              setTimeout(() => void refreshSessions(), 800);
            }}
          />
        ) : (
          <Empty style={{ marginTop: 60 }} />
        )}
      </aside>

      {/* Thanh kéo: kéo hẹp quá ngưỡng → tự về nấc nhỏ hơn; bấm đúp = thu/mở */}
      <div
        data-testid="wf-splitter"
        onMouseDown={startDrag}
        onDoubleClick={() => act('toggle')}
        title={t('wf.resize', 'Kéo để đổi bề rộng · bấm đúp để thu/mở')}
        style={{ width: 8, flex: '0 0 8px', cursor: 'col-resize', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <span style={{ width: 2, height: 36, borderRadius: 2, background: V.border }} />
      </div>

      {/* Phải: KHUNG LARK lớn */}
      <LarkFramePane runtime={runtime} st={st} setSt={setSt} refresh={refresh} homeUrl={homeUrl} lane={activeId} onClose={onToChat ? () => onToChat('closeFrame') : undefined} style={{ flex: 1, paddingTop: 6 }} />
    </div>
  );
}
