'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { App, Button, Empty, Input, Modal, Popconfirm, Tag, Tooltip, Typography } from 'antd';
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ReloadOutlined,
  HomeOutlined,
  LoginOutlined,
  StopOutlined,
  RobotOutlined,
  SaveOutlined,
  AppstoreOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  CheckCircleFilled,
  GlobalOutlined,
  CaretRightOutlined,
} from '@ant-design/icons';
import type { LarkBrowserState, LarkUiTemplate } from '@larkwave/core';
import { BRAND, BRAND_GRADIENT, OK, WARN, ERR, V, tint } from '../../theme';
import { useRuntime } from '../../RuntimeProvider';
import { EmptyState } from '../../kit';
import { useI18n } from '../../i18n';

const { Text } = Typography;

const ADV_KEY = 'larkwave.larkBrowser.advanced';

const KIND_LABEL: Record<string, string> = { table: 'Bảng', field: 'Cột', view: 'View', option: 'Lựa chọn', user: 'Người', chat: 'Nhóm chat', department: 'Phòng ban' };

/**
 * "Trình duyệt Lark" — the SAME Lark web page (cookies/session) that every background Lark feature
 * uses, shown INSIDE the app: the user logs in / re-logs in here, watches the AI drive Lark's
 * Automation & Workflow editors live (with a Dừng button), and turns one hand-made automation into
 * a reusable template. The page is a native view positioned over the placeholder div below; leaving
 * the screen detaches it (never destroys it), so the session stays warm.
 */
export function LarkBrowserScreen() {
  const runtime = useRuntime();
  const { message } = App.useApp();
  const { t } = useI18n();
  const [st, setSt] = useState<LarkBrowserState | null>(null);
  const [tpls, setTpls] = useState<LarkUiTemplate[]>([]);
  // Mẫu "làm một lần, dùng lại" giờ là đường DỰ PHÒNG (workflow tạo qua Open API v3 trong Lark ×
  // Agents) — ẩn khỏi khung mặc định, mở bằng nút "Nâng cao". Nhớ lựa chọn theo máy (tiện ích riêng).
  const [showTpl, setShowTplState] = useState<boolean>(() => {
    try {
      return typeof window !== 'undefined' && window.localStorage.getItem(ADV_KEY) === '1';
    } catch {
      return false;
    }
  });
  const setShowTpl = (fn: (v: boolean) => boolean) =>
    setShowTplState((v) => {
      const next = fn(v);
      try {
        window.localStorage.setItem(ADV_KEY, next ? '1' : '0');
      } catch {
        /* không có storage — chỉ nhớ trong phiên */
      }
      return next;
    });
  const [addr, setAddr] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [applyTpl, setApplyTpl] = useState<LarkUiTemplate | null>(null);
  const [applyBase, setApplyBase] = useState('');
  const [applyVars, setApplyVars] = useState<Record<string, string>>({});
  const [applyTitle, setApplyTitle] = useState('');
  const [savedCap, setSavedCap] = useState('');
  const holder = useRef<HTMLDivElement | null>(null);
  const modalOpen = saveOpen || !!applyTpl;

  const refresh = useCallback(async () => {
    if (!runtime.larkBrowserState) return;
    try {
      setSt(await runtime.larkBrowserState());
    } catch {
      /* keep last-known state */
    }
  }, [runtime]);

  const loadTpls = useCallback(async () => {
    if (!runtime.larkUiTemplateList) return;
    try {
      setTpls(await runtime.larkUiTemplateList());
    } catch {
      /* ignore */
    }
  }, [runtime]);

  // Poll the live state (session health, URL, AI step) while the screen is open.
  useEffect(() => {
    void refresh();
    void loadTpls();
    const id = setInterval(() => void refresh(), 1000);
    return () => clearInterval(id);
  }, [refresh, loadTpls]);

  // Keep the native Lark view glued to the placeholder. A modal over it → hide the view (a native
  // view always paints ABOVE the page, it would cover the dialog).
  const showView = !!st?.hasWindow && !modalOpen;
  useLayoutEffect(() => {
    if (!runtime.larkBrowserAttach) return;
    let raf = 0;
    const push = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = holder.current;
        const r = el && showView ? el.getBoundingClientRect() : null;
        void runtime
          .larkBrowserAttach!(r ? { x: r.left, y: r.top, width: r.width, height: r.height } : { x: 0, y: 0, width: 0, height: 0 })
          .catch(() => undefined);
      });
    };
    push();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(push) : null;
    if (ro && holder.current) ro.observe(holder.current);
    window.addEventListener('resize', push);
    const tick = setInterval(push, 1500); // layout shifts the observer can't see (sidebar collapse)
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('resize', push);
      clearInterval(tick);
    };
  }, [runtime, showView]);

  // Leaving the screen: detach (the session and any running automation keep going, hidden).
  useEffect(() => () => void runtime.larkBrowserDetach?.().catch(() => undefined), [runtime]);

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

  const nav = (input: { url?: string; action?: 'back' | 'forward' | 'reload' | 'home' | 'stop' }) =>
    run('nav', async () => {
      const s = await runtime.larkBrowserNavigate!(input);
      setSt(s);
    });

  const relogin = () =>
    run('login', async () => {
      const info = await runtime.larkWebConnect!();
      if (info.connected) message.success(t('larkBrowser.loggedIn', 'Đã đăng nhập Lark.'));
      else if (info.error) message.warning(info.error);
    });

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
  const capKey = st?.capturedSave ? `${st.capturedSave.base}|${st.capturedSave.title || ''}|${st.capturedSave.fields.join(',')}` : '';
  const capturedIsNew = !!capKey && capKey !== savedCap;

  if (!runtime.larkBrowserAttach) {
    return <Empty description="“Trình duyệt Lark” cần bản cài mới (.dmg)." />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 108px)', minHeight: 460, marginBottom: -44, gap: 8 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', background: V.surface, border: `1px solid ${V.border}`, borderRadius: 12, padding: '6px 8px' }}>
        <Tooltip title={st?.host || ''}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: pill.color, padding: '2px 8px', borderRadius: 999, background: tint(typeof pill.color === 'string' && pill.color.startsWith('#') ? pill.color : '#94A3B8', '1a') }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: pill.color }} />
            {pill.text}
          </span>
        </Tooltip>
        <Button size="small" icon={<LoginOutlined />} loading={busy === 'login'} type={dead || !st?.connected ? 'primary' : 'default'} onClick={relogin} style={dead || !st?.connected ? { background: BRAND_GRADIENT, border: 'none' } : undefined}>
          {st?.connected && !dead ? t('larkBrowser.relogin', 'Đăng nhập lại') : t('larkBrowser.login', 'Đăng nhập Lark')}
        </Button>
        <span style={{ width: 1, height: 20, background: V.border, margin: '0 2px' }} />
        <Tooltip title={t('larkBrowser.back', 'Quay lại')}>
          <Button size="small" type="text" icon={<ArrowLeftOutlined />} disabled={!st?.canGoBack} onClick={() => nav({ action: 'back' })} />
        </Tooltip>
        <Tooltip title={t('larkBrowser.forward', 'Tiến')}>
          <Button size="small" type="text" icon={<ArrowRightOutlined />} disabled={!st?.canGoForward} onClick={() => nav({ action: 'forward' })} />
        </Tooltip>
        <Tooltip title={t('larkBrowser.reload', 'Tải lại')}>
          <Button size="small" type="text" icon={<ReloadOutlined spin={!!st?.loading} />} disabled={!st?.hasWindow} onClick={() => nav({ action: st?.loading ? 'stop' : 'reload' })} />
        </Tooltip>
        <Tooltip title={t('larkBrowser.home', 'Trang chủ Lark')}>
          <Button size="small" type="text" icon={<HomeOutlined />} disabled={!st?.hasWindow} onClick={() => nav({ action: 'home' })} />
        </Tooltip>
        <Input.Search
          size="small"
          prefix={<GlobalOutlined style={{ color: V.textFaint }} />}
          placeholder={st?.url || t('larkBrowser.pasteUrl', 'Dán link Base / Lark rồi Enter')}
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
          onSearch={(v) => {
            if (!v.trim()) return;
            void nav({ url: v.trim() });
            setAddr('');
          }}
          enterButton={t('larkBrowser.open', 'Mở')}
          disabled={!st?.hasWindow}
          style={{ flex: '1 1 260px', minWidth: 200 }}
        />
        <Tooltip title={t('larkBrowser.advancedHint', 'Mẫu automation làm tay (đường dự phòng). Tạo workflow mặc định: nhờ AI ở Lark × Agents.')}>
          <Button size="small" type={showTpl ? 'primary' : 'text'} ghost={showTpl} icon={<AppstoreOutlined />} onClick={() => setShowTpl((v) => !v)}>
            {t('larkBrowser.advanced', 'Nâng cao')}{tpls.length ? ` (${tpls.length})` : ''}
          </Button>
        </Tooltip>
      </div>

      {/* AI live strip */}
      {ai && (ai.active || ai.stopped) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderRadius: 12, padding: '6px 10px', background: ai.stopped ? tint(ERR, '14') : tint(BRAND, '14'), border: `1px solid ${ai.stopped ? tint(ERR, '55') : tint(BRAND, '55')}` }}>
          <RobotOutlined style={{ color: ai.stopped ? ERR : BRAND }} />
          <Text strong style={{ fontSize: 13 }}>{ai.stopped ? t('larkBrowser.aiStopped', 'Đã dừng AI') : t('larkBrowser.aiWorking', 'AI đang thao tác')}</Text>
          <Text style={{ fontSize: 13, color: V.textSub, flex: '1 1 200px', minWidth: 0 }} ellipsis>
            {ai.step || '…'}
          </Text>
          <Tag style={{ margin: 0 }}>{ai.actions}/{ai.cap} {t('larkBrowser.actions', 'thao tác')}</Tag>
          {lastSave && (
            <Tag color={lastSave.ok ? 'green' : 'red'} style={{ margin: 0 }}>
              {lastSave.ok ? <CheckCircleFilled /> : null} Lark {lastSave.op}{lastSave.workflowID ? ` #${lastSave.workflowID}` : ''}{lastSave.code != null ? ` · code ${lastSave.code}` : ''}
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

      {/* Captured hand-made save → template */}
      {showTpl && capturedIsNew && st?.capturedSave && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderRadius: 12, padding: '6px 10px', background: tint(OK, '12'), border: `1px solid ${tint(OK, '55')}` }}>
          <CheckCircleFilled style={{ color: OK }} />
          <Text style={{ fontSize: 13, flex: '1 1 240px', minWidth: 0 }}>
            {t('larkBrowser.captured', 'Đã bắt được một lần LƯU automation/workflow')}
            {st.capturedSave.title ? ` «${st.capturedSave.title}»` : ''} — {t('larkBrowser.capturedHint', 'lưu thành mẫu để lần sau AI tạo lại chỉ bằng một lệnh.')}
          </Text>
          <Button size="small" type="primary" icon={<SaveOutlined />} onClick={() => { setSaveName(st.capturedSave?.title || ''); setSaveOpen(true); }}>
            {t('larkBrowser.saveTemplate', 'Lưu thành mẫu')}
          </Button>
        </div>
      )}

      {/* View + templates side panel */}
      <div style={{ display: 'flex', gap: 8, flex: 1, minHeight: 0 }}>
        <div
          ref={holder}
          style={{ flex: 1, minWidth: 0, borderRadius: 12, border: `1px solid ${V.border}`, background: '#ffffff', overflow: 'hidden', position: 'relative' }}
        >
          {!st?.hasWindow && (
            <div style={{ padding: 24, background: V.surface, height: '100%', boxSizing: 'border-box' }}>
              <EmptyState
                icon={<GlobalOutlined />}
                title={t('larkBrowser.emptyTitle', 'Chưa có phiên Lark web')}
                description={t('larkBrowser.emptyDesc', 'Đăng nhập Lark ngay trong khung này (QR / SSO). Phiên được giữ riêng cho tài khoản Larkwave này và dùng chung cho Đồng bộ Bitable, đọc workflow và AI điều khiển Lark.')}
                actionLabel={t('larkBrowser.login', 'Đăng nhập Lark')}
                onAction={relogin}
              />
            </div>
          )}
          {st?.hasWindow && modalOpen && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: V.textFaint, fontSize: 13 }}>…</div>
          )}
          {st?.hidden && (
            <div style={{ position: 'absolute', left: 8, bottom: 8, fontSize: 11, color: V.textFaint }}>LARKWAVE_HIDDEN</div>
          )}
        </div>

        {showTpl && (
          <div style={{ width: 300, flex: '0 0 300px', display: 'flex', flexDirection: 'column', gap: 8, background: V.surface, border: `1px solid ${V.border}`, borderRadius: 12, padding: 10, overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <AppstoreOutlined style={{ color: BRAND }} />
              <Text strong>{t('larkBrowser.tplTitle', 'Mẫu — làm một lần, dùng lại')}</Text>
            </div>
            <Text style={{ fontSize: 12, color: V.textSub }}>
              {t('larkBrowser.tplHelp', 'Dựng 1 Tự động hoá / Quy trình bằng tay trong khung bên trái rồi bấm Lưu trong Lark → bấm “Lưu thành mẫu”. Bảng/cột/người trong đó thành biến; AI (hoặc bạn) tạo lại cho bảng khác — luôn là BẢN NHÁP đang tắt.')}
            </Text>
            {tpls.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('larkBrowser.noTpl', 'Chưa có mẫu nào')} />}
            {tpls.map((tp) => (
              <div key={tp.id} style={{ border: `1px solid ${V.borderSub}`, borderRadius: 10, padding: 8, background: V.surfaceMuted }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Text strong ellipsis style={{ flex: 1, minWidth: 0 }}>{tp.name}</Text>
                  <Tag style={{ margin: 0 }} color={tp.kind === 'workflow' ? 'purple' : 'blue'}>{tp.kind === 'workflow' ? 'Quy trình' : 'Tự động hoá'}</Tag>
                </div>
                <div style={{ fontSize: 11.5, color: V.textSub, margin: '4px 0 6px' }}>
                  {tp.vars.length} {t('larkBrowser.vars', 'biến')} · {new Date(tp.createdAt).toLocaleDateString('vi-VN')}
                  {tp.title ? ` · «${tp.title}»` : ''}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button
                    size="small"
                    type="primary"
                    icon={<PlayCircleOutlined />}
                    disabled={!st?.connected}
                    onClick={() => {
                      setApplyTpl(tp);
                      setApplyBase(tp.sourceBase);
                      setApplyVars({});
                      setApplyTitle('');
                    }}
                  >
                    {t('larkBrowser.makeDraft', 'Tạo bản nháp')}
                  </Button>
                  <Popconfirm title={t('larkBrowser.delTpl', 'Xoá mẫu này?')} onConfirm={() => run('del', async () => setTpls(await runtime.larkUiTemplateDelete!(tp.id)))}>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={saveOpen}
        title={t('larkBrowser.saveTemplate', 'Lưu thành mẫu')}
        okText={t('larkBrowser.save', 'Lưu')}
        confirmLoading={busy === 'save'}
        onCancel={() => setSaveOpen(false)}
        onOk={() =>
          run('save', async () => {
            await runtime.larkUiTemplateSave!({ name: saveName.trim() || 'Mẫu mới' });
            setSaveOpen(false);
            setSavedCap(capKey);
            message.success(t('larkBrowser.saved', 'Đã lưu mẫu.'));
            await loadTpls();
          })
        }
      >
        <Input autoFocus value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder={t('larkBrowser.tplName', 'Tên mẫu, vd "Báo nhóm khi có đơn mới"')} maxLength={80} />
      </Modal>

      <Modal
        open={!!applyTpl}
        width={560}
        title={`${t('larkBrowser.makeDraft', 'Tạo bản nháp')} — ${applyTpl?.name || ''}`}
        okText={t('larkBrowser.create', 'Tạo bản nháp (tắt)')}
        confirmLoading={busy === 'apply'}
        onCancel={() => setApplyTpl(null)}
        onOk={() =>
          run('apply', async () => {
            if (!applyTpl) return;
            const r = await runtime.larkUiTemplateApply!({ id: applyTpl.id, baseId: applyBase.trim() || undefined, vars: applyVars, title: applyTitle.trim() || undefined });
            if (!r.ok) {
              message.warning(r.error || 'Thiếu biến: ' + (r.missing || []).join(', '));
              return;
            }
            setApplyTpl(null);
            message.success(`${t('larkBrowser.draftMade', 'Đã tạo bản nháp (đang TẮT)')} #${r.workflowID} — ${t('larkBrowser.reviewEnable', 'mở Lark xem lại rồi tự bật.')}`);
          })
        }
      >
        {applyTpl && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Text style={{ fontSize: 12.5, color: V.textSub }}>
              {t('larkBrowser.applyHelp', 'Cùng Base gốc: để trống = giữ nguyên (nhân bản). Base khác: điền đủ id bảng/cột/view/option mới (tblXXX, fldXXX…).')}
            </Text>
            <Input addonBefore="Base (app_token)" value={applyBase} onChange={(e) => setApplyBase(e.target.value)} />
            <Input addonBefore={t('larkBrowser.newTitle', 'Tên mới')} value={applyTitle} onChange={(e) => setApplyTitle(e.target.value)} placeholder={applyTpl.title || ''} />
            <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {applyTpl.vars.map((v) => (
                <Input
                  key={v.key}
                  size="small"
                  addonBefore={<span style={{ fontSize: 12 }}>{KIND_LABEL[v.kind] || v.kind} {v.key}{v.table ? ` (${v.table})` : ''}</span>}
                  placeholder={`${v.original}${v.hint ? ` · ${v.hint}` : ''}`}
                  value={applyVars[v.key] || ''}
                  onChange={(e) => setApplyVars((m) => ({ ...m, [v.key]: e.target.value }))}
                />
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
