'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { App, Button, Checkbox, Dropdown, Input, Popover, Select, Switch, Tooltip, Typography, type MenuProps } from 'antd';
import {
  CopyOutlined,
  DatabaseOutlined,
  DownOutlined,
  EllipsisOutlined,
  LayoutOutlined,
  ExpandOutlined,
  CompressOutlined,
  PlusOutlined,
  SearchOutlined,
  SyncOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { LarkBaseRef, RunnerStatusInfo, RuntimeAdapter } from '@larkwave/core';
import { BRAND, ERR, WARN, V, tint } from '../../theme';
import { useI18n } from '../../i18n';
import { autoTip, engineModel, SOURCE_LABEL, type RunSource } from './engineChip';
import type { LarkFrameCtl } from './larkLayout';
import { filterBaseOptions, mergeBaseOptions, toggleBase, type BaseOption } from './larkConversations';

const { Text } = Typography;

/** Base thấy qua phiên Lark web — cache cấp module để nhiều tab/hai màn không quét lại liên tục. */
let webBaseCache: { at: number; list: { token: string; name: string; url?: string; isWiki?: boolean }[] } | null = null;
const WEB_TTL = 5 * 60_000;

/** Bộ chọn Base dùng chung: TẤT CẢ Base (phiên web + custom app), tìm kiếm, đếm, quét lại. */
export function useBaseOptions(runtime: RuntimeAdapter, enabled: boolean) {
  const [web, setWeb] = useState(webBaseCache?.list ?? []);
  const [registered, setRegistered] = useState<LarkBaseRef[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const load = useCallback(
    async (opts?: { force?: boolean; query?: string }) => {
      runtime.larkListBases?.().then((b) => setRegistered(b || [])).catch(() => undefined);
      if (!runtime.larkWebListBases) return;
      if (!opts?.force && !opts?.query && webBaseCache && Date.now() - webBaseCache.at < WEB_TTL) {
        setWeb(webBaseCache.list);
        return;
      }
      setBusy(true);
      try {
        const list = await runtime.larkWebListBases(opts?.query ? { query: opts.query } : undefined);
        const merged = opts?.query ? [...(webBaseCache?.list ?? []), ...list.filter((b) => !(webBaseCache?.list ?? []).some((x) => x.token === b.token))] : list;
        webBaseCache = { at: Date.now(), list: merged };
        setWeb(merged);
        setErr('');
      } catch (e) {
        setErr(String((e as Error)?.message || e));
      } finally {
        setBusy(false);
      }
    },
    [runtime],
  );
  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);
  const options = useMemo(() => mergeBaseOptions(web, registered), [web, registered]);
  return { options, busy, err, load };
}

function BasePickerPanel({
  options,
  selected,
  busy,
  err,
  onToggle,
  onRefresh,
  onSearchRemote,
}: {
  options: BaseOption[];
  selected: LarkBaseRef[];
  busy: boolean;
  err: string;
  onToggle: (b: BaseOption) => void;
  onRefresh: () => void;
  onSearchRemote: (q: string) => void;
}) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sel = selected.map((b) => b.appToken);
  const list = filterBaseOptions(options, q, sel);
  return (
    <div data-testid="lark-base-picker" style={{ width: 320 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Input
          size="small"
          allowClear
          autoFocus
          prefix={<SearchOutlined style={{ color: V.textFaint }} />}
          placeholder={t('chat.searchBase', 'Tìm Base…')}
          value={q}
          onChange={(e) => {
            const v = e.target.value;
            setQ(v);
            if (timer.current) clearTimeout(timer.current);
            if (v.trim().length >= 2 && !filterBaseOptions(options, v, []).length) timer.current = setTimeout(() => onSearchRemote(v.trim()), 450);
          }}
        />
        <Tooltip title={t('wf.rescan', 'Quét lại danh sách Base')}>
          <Button size="small" type="text" icon={<SyncOutlined spin={busy} />} onClick={onRefresh} />
        </Tooltip>
      </div>
      <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {list.map((b) => {
          const on = sel.includes(b.appToken);
          return (
            <label key={b.appToken} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', borderRadius: 6, cursor: 'pointer', background: on ? tint(BRAND, '12') : 'transparent' }}>
              <Checkbox checked={on} onChange={() => onToggle(b)} />
              <DatabaseOutlined style={{ color: BRAND, flex: 'none' }} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>{b.name}</span>
              {b.isWiki && <span style={{ fontSize: 10, color: V.textFaint }}>Wiki</span>}
            </label>
          );
        })}
        {!list.length && (
          <Text type="secondary" style={{ fontSize: 12, padding: 6 }}>
            {busy ? t('wf.searching', 'Đang tìm…') : err ? err.slice(0, 120) : t('wf.noBase', 'Không thấy Base nào')}
          </Text>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, paddingTop: 6, borderTop: `1px solid ${V.borderSub}`, fontSize: 11.5, color: V.textFaint }}>
        <span data-testid="lark-base-count">
          {options.length} Base{sel.length ? ` · ${sel.length} ${t('chat.selected', 'đang chọn')}` : ''}
        </span>
        <span>{t('chat.baseFirstIsMain', 'Base đầu = Base chính')}</span>
      </div>
    </div>
  );
}

/**
 * THANH ĐẦU hội thoại (~44px): [lối vào phụ] [tiêu đề] [chip Base] … [chip động cơ] [Tự động] [Khung Lark] [⋯].
 * `density="compact"` (hội thoại thu nhỏ ở màn Tạo workflow): chỉ tiêu đề + biểu tượng Base + chấm động
 * cơ + ⋯ (Tự động chuyển vào menu ⋯).
 */
export function LarkChatToolbar({
  runtime,
  title,
  density = 'normal',
  leading,
  convBases,
  onBasesChange,
  runnerId,
  model,
  onRunnerChange,
  runSource,
  onRunSource,
  apiKeyReady,
  maicAvailable,
  autoMode,
  onAuto,
  frame,
  menuItems,
  onMenu,
  badges,
  basesEnabled = true,
}: {
  runtime: RuntimeAdapter;
  title: string;
  density?: 'normal' | 'compact';
  leading?: ReactNode;
  convBases: LarkBaseRef[];
  onBasesChange: (next: LarkBaseRef[], added?: BaseOption) => void;
  runnerId: string;
  model: string;
  onRunnerChange: (id: string, model?: string) => void;
  runSource: RunSource;
  onRunSource: (s: RunSource) => void;
  apiKeyReady: boolean;
  maicAvailable: boolean;
  autoMode: boolean | null;
  onAuto: (on: boolean) => void;
  /** Bố cục chat: nút mở/đóng khung Lark bên phải. */
  frame?: LarkFrameCtl;
  menuItems: MenuProps['items'];
  onMenu: (key: string) => void;
  badges?: ReactNode;
  basesEnabled?: boolean;
}) {
  const { t } = useI18n();
  const { message } = App.useApp();
  const compact = density === 'compact';
  const [pickerOpen, setPickerOpen] = useState(false);
  // Bề rộng thật của thanh: hẹp (cột hội thoại ở màn Tạo workflow, cửa sổ 1366px) thì rút chữ trước,
  // giữ đủ nút — tên hội thoại co trước, rồi chữ "Tự động", rồi tên runner trên chip động cơ.
  const barRef = useRef<HTMLDivElement | null>(null);
  const [barW, setBarW] = useState(900);
  useEffect(() => {
    const el = barRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setBarW(el.getBoundingClientRect().width || 900));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const tight = !compact && barW < 640;
  const { options, busy, err, load } = useBaseOptions(runtime, basesEnabled);

  const [runners, setRunners] = useState<RunnerStatusInfo[]>([]);
  useEffect(() => {
    let alive = true;
    runtime.runners
      ?.list()
      .then((l) => alive && setRunners(l))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [runtime]);
  const eng = engineModel({ runners, runnerId, model, runSource, apiKeyReady, maicAvailable });
  const active = runners.find((r) => r.id === runnerId);

  const toggle = (b: BaseOption) => {
    const ref: LarkBaseRef = { appToken: b.appToken, name: b.name };
    const next = toggleBase(convBases, ref);
    onBasesChange(next, next.length > convBases.length ? b : undefined);
  };

  const picker = (
    <BasePickerPanel
      options={options}
      selected={convBases}
      busy={busy}
      err={err}
      onToggle={toggle}
      onRefresh={() => void load({ force: true })}
      onSearchRemote={(q) => void load({ query: q })}
    />
  );

  const copy = async (s: string) => {
    try {
      await navigator.clipboard.writeText(s);
      message.success(t('chat.copiedDot', 'Đã sao chép.'));
    } catch {
      message.info(s);
    }
  };

  const enginePanel = (
    <div data-testid="lark-engine-panel" style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: V.textFaint, marginBottom: 4 }}>{t('chat.engineSource', 'NGUỒN CHẠY')}</div>
        {(['cli', 'api', 'maic'] as RunSource[]).map((s) => {
          const dis = s === 'maic' && !maicAvailable;
          const on = runSource === s;
          return (
            <div
              key={s}
              role="button"
              tabIndex={0}
              data-testid={`lark-src-${s}`}
              onClick={() => !dis && onRunSource(s)}
              onKeyDown={(e) => e.key === 'Enter' && !dis && onRunSource(s)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 8, cursor: dis ? 'not-allowed' : 'pointer', opacity: dis ? 0.5 : 1, background: on ? tint(BRAND, '14') : 'transparent' }}
            >
              <span style={{ width: 10, height: 10, borderRadius: '50%', border: `2px solid ${on ? BRAND : V.border}`, background: on ? BRAND : 'transparent', flex: 'none' }} />
              <span style={{ flex: 1, fontSize: 13 }}>
                {SOURCE_LABEL[s]}
                {s === 'api' && !apiKeyReady ? <span style={{ color: V.textFaint }}> · {t('chat.noKey', 'thiếu key')}</span> : null}
              </span>
            </div>
          );
        })}
      </div>
      {runSource !== 'maic' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <Select
            size="small"
            value={runnerId}
            onChange={(id) => {
              const r = runners.find((x) => x.id === id);
              onRunnerChange(id, r?.models?.[0]?.id);
            }}
            options={runners.map((r) => ({ value: r.id, disabled: !r.installed, label: r.ready ? r.label : r.installed ? `${r.label} · ${t('ui.runnerPicker.missingKey', 'thiếu key')}` : `${r.label} · ${t('ui.runnerPicker.notInstalledShort', 'chưa cài')}` }))}
            popupMatchSelectWidth={220}
            getPopupContainer={(n) => n.parentElement || document.body}
          />
          <Select
            size="small"
            value={model || active?.models?.[0]?.id}
            disabled={!active?.models?.length}
            onChange={(m) => onRunnerChange(runnerId, m)}
            options={(active?.models || []).map((m) => ({ value: m.id, label: m.label }))}
            popupMatchSelectWidth={240}
            getPopupContainer={(n) => n.parentElement || document.body}
          />
        </div>
      )}
      {eng.warn && (
        <div data-testid="lark-engine-warn" style={{ borderRadius: 8, padding: '8px 10px', background: tint(eng.warn.level === 'error' ? ERR : WARN, '14'), border: `1px solid ${tint(eng.warn.level === 'error' ? ERR : WARN, '55')}`, fontSize: 12.5, lineHeight: 1.45 }}>
          <div>{eng.warn.text}</div>
          {eng.warn.command && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <code style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11.5, padding: '3px 6px', borderRadius: 6, background: V.surfaceMuted, border: `1px solid ${V.borderSub}` }}>{eng.warn.command}</code>
              <Button size="small" icon={<CopyOutlined />} onClick={() => void copy(eng.warn!.command!)}>
                {t('chat.copy', 'Chép')}
              </Button>
            </div>
          )}
        </div>
      )}
      <Text type="secondary" style={{ fontSize: 11.5 }}>
        {t('chat.switchAgentTip', 'Đổi agent giữa chừng: lịch sử chat giữ nguyên; ngữ cảnh CLI được nối lại từ transcript.')}
      </Text>
    </div>
  );

  const dotColor = eng.dot === 'error' ? ERR : eng.dot === 'warn' ? WARN : null;
  const engineBtn = (
    <Popover trigger="click" placement="bottomRight" content={enginePanel} arrow={false}>
      <Tooltip title={eng.warn ? eng.warn.text : `${eng.runnerLabel}${eng.modelLabel ? ` · ${eng.modelLabel}` : ''} · ${eng.sourceLabel}`}>
        <Button data-testid="lark-engine-chip" size="small" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, paddingInline: compact ? 6 : 10, maxWidth: compact ? 34 : 220 }}>
          <span style={{ position: 'relative', display: 'inline-flex' }}>
            <ThunderboltOutlined style={{ color: BRAND }} />
            {dotColor && <span data-testid="lark-engine-dot" style={{ position: 'absolute', top: -3, right: -4, width: 7, height: 7, borderRadius: '50%', background: dotColor, boxShadow: `0 0 0 2px ${V.surface}` }} />}
          </span>
          {!compact && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5 }}>{tight ? eng.modelLabel || eng.label : eng.label}</span>}
          {!compact && <DownOutlined style={{ fontSize: 9, color: V.textFaint }} />}
        </Button>
      </Tooltip>
    </Popover>
  );

  const shown = convBases.slice(0, compact ? 0 : 2);
  const more = convBases.length - shown.length;
  const baseChips = (
    <Popover trigger="click" placement="bottomLeft" open={pickerOpen} onOpenChange={setPickerOpen} content={picker} arrow={false}>
      <button
        type="button"
        data-testid="lark-base-chip"
        title={convBases.map((b) => b.name).join(', ') || t('chat.pickBase', 'Chọn Base')}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: compact ? 0 : 96, maxWidth: compact ? 60 : tight ? 200 : 380, flex: '0 1 auto', height: 26, padding: '0 9px', borderRadius: 999, cursor: 'pointer', border: convBases.length ? `1px solid ${tint(BRAND, '55')}` : `1px dashed ${V.border}`, background: convBases.length ? tint(BRAND, '10') : V.surface, color: convBases.length ? V.text : V.textSub, fontSize: 12.5 }}
      >
        <DatabaseOutlined style={{ color: BRAND, flex: 'none' }} />
        {compact ? (
          convBases.length ? <span>{convBases.length}</span> : <PlusOutlined style={{ fontSize: 10 }} />
        ) : convBases.length ? (
          <>
            {shown.map((b, i) => (
              <span key={b.appToken} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150, fontWeight: i === 0 ? 600 : 400 }}>
                {b.name}
                {i < shown.length - 1 ? ',' : ''}
              </span>
            ))}
            {more > 0 && <span style={{ color: V.textFaint, flex: 'none' }}>+{more}</span>}
          </>
        ) : (
          <span>{t('chat.pickBase', 'Chọn Base')}</span>
        )}
        <DownOutlined style={{ fontSize: 9, color: V.textFaint, flex: 'none' }} />
      </button>
    </Popover>
  );

  const items: MenuProps['items'] = compact && autoMode !== null
    ? [{ key: '__auto', label: `${autoMode ? '✓ ' : ''}${t('wf.auto', 'Tự động')} — ${autoMode ? t('wf.autoOnShort', 'không hỏi lại') : t('wf.askShort', 'đang hỏi trước khi ghi')}` }, { type: 'divider' }, ...(menuItems || [])]
    : menuItems;

  return (
    <div
      ref={barRef}
      data-testid="lark-chat-toolbar"
      style={{ display: 'flex', alignItems: 'center', gap: 8, height: 44, minHeight: 44, padding: compact ? '0 2px' : '0 2px 0 0', borderBottom: `1px solid ${V.borderSub}`, marginBottom: 6, minWidth: 0 }}
    >
      {leading}
      <Text strong data-testid="lark-chat-title" style={{ fontSize: compact ? 13 : 14, minWidth: 40, flex: '0 1 auto', maxWidth: compact ? undefined : tight ? 120 : 280 }} ellipsis title={title}>
        {title}
      </Text>
      {basesEnabled && baseChips}
      <span style={{ flex: 1, minWidth: 4 }} />
      {badges}
      {engineBtn}
      {!compact && autoMode !== null && (
        <Tooltip title={autoTip(autoMode)}>
          <span data-testid="wf-auto-toggle" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: 'none' }}>
            <Switch size="small" checked={autoMode} onChange={onAuto} />
            {!tight && <Text style={{ fontSize: 12.5, color: V.textSub }}>{t('wf.auto', 'Tự động')}</Text>}
          </span>
        </Tooltip>
      )}
      {frame?.expand && (
        <Tooltip title={frame.frameFirst ? t('wf.chatFirst', 'Ưu tiên hội thoại — khung Lark về ngăn phụ bên phải') : t('wf.frameFirst', 'Mở rộng khung Lark — khung lớn, hội thoại gắn trái (thu nhỏ được)')}>
          <Button data-testid="lark-layout-switch" size="small" type="text" icon={frame.frameFirst ? <CompressOutlined /> : <ExpandOutlined />} onClick={frame.expand} />
        </Tooltip>
      )}
      {frame && (
        <Tooltip title={frame.open ? t('wf.closePane', 'Đóng khung Lark') : t('wf.showPane', 'Mở khung Lark')}>
          <Button data-testid="lark-open-frame" size="small" type={frame.open ? 'primary' : 'default'} ghost={frame.open} icon={<LayoutOutlined />} onClick={frame.toggle}>
            {tight ? null : t('wf.frameBtn', 'Khung Lark')}
          </Button>
        </Tooltip>
      )}
      <Dropdown trigger={['click']} placement="bottomRight" menu={{ items, onClick: ({ key }) => (key === '__auto' ? onAuto(!autoMode) : onMenu(key)) }}>
        <Button data-testid="lark-chat-more" size="small" type="text" icon={<EllipsisOutlined style={{ fontSize: 18 }} />} />
      </Dropdown>
    </div>
  );
}
