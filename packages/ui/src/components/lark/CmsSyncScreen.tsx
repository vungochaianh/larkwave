'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Alert, Button, Card, Checkbox, Collapse, Divider, Empty, Input, InputNumber, Modal, Popconfirm, Popover, QRCode, Select, Space, Spin, Switch, Table, Tag, Tooltip, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import {
  SyncOutlined,
  ReloadOutlined,
  PlayCircleOutlined,
  DeleteOutlined,
  DatabaseOutlined,
  CloudServerOutlined,
  PlusOutlined,
  TableOutlined,
  LoginOutlined,
  SearchOutlined,
  EditOutlined,
  SendOutlined,
  FileTextOutlined,
  CheckCircleFilled,
  WarningFilled,
  QrcodeOutlined,
} from '@ant-design/icons';
import type { CmsSyncJob, CmsSyncJobPatch, CmsKeeperStatus, LarkBaseRef, LarkReloginEntry, LarkTableRef } from '@larkwave/core';
import { BRAND, BRAND_GRADIENT, V } from '../../theme';
import { useRuntime } from '../../RuntimeProvider';
import { LarkSessionsPanel } from './LarkSessionsPanel';
import { useI18n } from '../../i18n';

const { Title, Text, Paragraph } = Typography;

const HOUR_OPTS = Array.from({ length: 24 }, (_, i) => ({ value: i, label: `${String(i).padStart(2, '0')}:00` }));
const HOUR_OPTS_END = Array.from({ length: 25 }, (_, i) => ({ value: i, label: `${String(i).padStart(2, '0')}:00` }));
const DAY_OPTS = [
  { label: 'CN', value: 0 },
  { label: 'T2', value: 1 },
  { label: 'T3', value: 2 },
  { label: 'T4', value: 3 },
  { label: 'T5', value: 4 },
  { label: 'T6', value: 5 },
  { label: 'T7', value: 6 },
];

/** Human "x phút trước" / date for a last-sync timestamp. */
function fmtWhen(ts: string | number): string {
  const t = typeof ts === 'number' ? ts : Date.parse(ts);
  if (!t || Number.isNaN(t)) return String(ts);
  const diff = Date.now() - t;
  if (diff < 60_000) return 'vừa xong';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} phút trước`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} giờ trước`;
  return new Date(t).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** True when a connector run stored status:"success" but noted "still syncing" — a large table's
 *  previous sync is still running (busy/in-progress), which is NOT an error. */
function jobIsBusy(job: CmsSyncJob): boolean {
  const status = String(job.lastSyncStatus || job.lastStatus || '');
  const err = String(job.lastSyncError || job.lastError || '');
  return !!err && !/err|fail|lỗi/i.test(status) && /skipp|still syncing|syncing|đang đồng bộ|busy/i.test(err);
}

/**
 * "Đồng bộ Bitable (CMS)" — drives the cms-lark-sync backend's connector jobs, but keeps the
 * connector SESSION (cookies/csrf) fresh automatically from the desktop's persistent Lark web
 * session. So the user never re-captures a session via the browser extension: pick the Base once,
 * the desktop keeps it alive (6h + on-error + on demand). The server still calls Lark (approach A).
 */
export function CmsSyncScreen({ onOpenChat }: { onOpenChat?: () => void }) {
  const runtime = useRuntime();
  const { t: tr } = useI18n();
  const { message, modal } = App.useApp();
  const dayOptsT = [
    { label: tr('chat.daySun', 'CN'), value: 0 },
    { label: tr('chat.dayMon', 'T2'), value: 1 },
    { label: tr('chat.dayTue', 'T3'), value: 2 },
    { label: tr('chat.dayWed', 'T4'), value: 3 },
    { label: tr('chat.dayThu', 'T5'), value: 4 },
    { label: tr('chat.dayFri', 'T6'), value: 5 },
    { label: tr('chat.daySat', 'T7'), value: 6 },
  ];
  const [loading, setLoading] = useState(true);
  const [baseUrl, setBaseUrl] = useState('');
  const [webConnected, setWebConnected] = useState(false);
  const [webHost, setWebHost] = useState<string | undefined>();
  const [connecting, setConnecting] = useState(false);
  const [jobs, setJobs] = useState<CmsSyncJob[]>([]);
  // Per-job timestamp we first saw it "still syncing", so the row can show a live "đang đồng bộ ~N phút".
  const [busySince, setBusySince] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null); // jobId currently acting, or 'refresh'/'create'
  const [error, setError] = useState('');
  const [runDetail, setRunDetail] = useState(''); // raw per-table Lark response of the last run
  const [search, setSearch] = useState('');
  const [baseFilter, setBaseFilter] = useState<string | undefined>();
  // Bulk enable/disable (multi-select)
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  // Live progress while a bulk "Chạy test" runs jobs one-by-one.
  const [bulkRunProgress, setBulkRunProgress] = useState<{ done: number; total: number; name: string } | null>(null);
  // Bulk CONFIG modal — apply interval / schedule / error-notify to all selected (per-section opt-in
  // so unchecked sections are left untouched, not clobbered).
  const [bulkCfgOpen, setBulkCfgOpen] = useState(false);
  const [bcSaving, setBcSaving] = useState(false);
  const [bcApplyInterval, setBcApplyInterval] = useState(false);
  const [bcInterval, setBcInterval] = useState(60);
  const [bcApplySchedule, setBcApplySchedule] = useState(false);
  const [bc247, setBc247] = useState(false);
  const [bcStart, setBcStart] = useState(6);
  const [bcEnd, setBcEnd] = useState(20);
  const [bcDays, setBcDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [bcApplyNotify, setBcApplyNotify] = useState(false);
  const [bcErrEnabled, setBcErrEnabled] = useState(false);
  const [bcErrUrl, setBcErrUrl] = useState('');
  const [bcErrChat, setBcErrChat] = useState('');

  // Create form
  const [bases, setBases] = useState<LarkBaseRef[]>([]);
  const [name, setName] = useState('');
  const [srcApp, setSrcApp] = useState<string | undefined>();
  const [tables, setTables] = useState<LarkTableRef[]>([]);
  const [srcTables, setSrcTables] = useState<string[]>([]);
  // Per-job "edit tables" modal
  const [editJob, setEditJob] = useState<CmsSyncJob | null>(null);
  const [editTables, setEditTables] = useState<LarkTableRef[]>([]);
  const [editSel, setEditSel] = useState<string[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  // Per-job "config" modal (name, interval, auto-schedule) — like the web Edit form
  const [cfgJob, setCfgJob] = useState<CmsSyncJob | null>(null);
  const [cfgName, setCfgName] = useState('');
  const [cfgInterval, setCfgInterval] = useState<number>(60);
  const [cfg247, setCfg247] = useState(false);
  const [cfgStart, setCfgStart] = useState(6);
  const [cfgEnd, setCfgEnd] = useState(20);
  const [cfgDays, setCfgDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [cfgErrEnabled, setCfgErrEnabled] = useState(false);
  const [cfgErrUrl, setCfgErrUrl] = useState('');
  const [cfgErrChat, setCfgErrChat] = useState('');
  const [cfgSaving, setCfgSaving] = useState(false);
  // Aggregate ("tổng") Lark error-report target (backend NotifyConfig)
  const [errEnabled, setErrEnabled] = useState(false);
  const [errUrl, setErrUrl] = useState('');
  const [errChat, setErrChat] = useState('');
  const [errSaving, setErrSaving] = useState(false);
  const [testingErr, setTestingErr] = useState(false);
  // Create-group modal
  const [createOpen, setCreateOpen] = useState(false);
  const [newChatName, setNewChatName] = useState('');
  const [creatingChat, setCreatingChat] = useState(false);
  // Lark groups the bot is in (for the "chọn nhóm" dropdowns)
  const [larkChats, setLarkChats] = useState<{ chatId: string; name: string }[]>([]);
  // Lark web re-login history (local button + remote phone-QR), newest first.
  const [loginHistory, setLoginHistory] = useState<LarkReloginEntry[]>([]);
  // External VM session-keeper (tw-cms-keeper) liveness — so you can check the VM without SSH.
  const [keeper, setKeeper] = useState<CmsKeeperStatus | null>(null);

  const loadLoginHistory = useCallback(async () => {
    try {
      setLoginHistory((await runtime.cmsSyncLoginHistory?.()) ?? []);
    } catch {
      /* old build — ignore */
    }
  }, [runtime]);

  const loadJobs = useCallback(async () => {
    try {
      const list = (await runtime.cmsSyncListJobs?.()) ?? [];
      setJobs(list);
      setError('');
      // Track how long each table has been "still syncing" so the row shows a live "~N phút"; keep the
      // first-seen time while it stays busy, drop it once it clears. Best-effort (resets on restart).
      setBusySince((prev) => {
        const now = Date.now();
        const next: Record<string, number> = {};
        for (const job of list) {
          const id = String(job._id || job.id);
          if (jobIsBusy(job)) next[id] = prev[id] ?? now;
        }
        return next;
      });
    } catch (e) {
      setError((e as Error)?.message || tr('chat.loadJobsFailed', 'Không tải được danh sách job từ máy chủ CMS.'));
    }
  }, [runtime]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const cfg = (await runtime.cmsSyncConfig?.()) ?? { baseUrl: '', webReady: false };
        if (!alive) return;
        setBaseUrl(cfg.baseUrl);
        const st = await runtime.larkWebStatus?.();
        if (!alive) return;
        setWebConnected(!!st?.connected);
        setWebHost(st?.host);
        await loadJobs();
        await loadLoginHistory();
        const bs = (await runtime.larkListBases?.()) ?? [];
        if (alive) setBases(bs);
        try {
          const er = await runtime.cmsSyncGetErrorReport?.();
          if (alive && er) {
            setErrEnabled(er.enabled);
            setErrUrl(er.larkWebhookUrl);
            setErrChat(er.chatId || '');
          }
        } catch {
          /* backend may be old — ignore */
        }
        try {
          const chats = (await runtime.cmsSyncListLarkChats?.()) ?? [];
          if (alive) setLarkChats(chats);
        } catch {
          /* bot may not be in any chat / old backend — ignore */
        }
        try {
          const ks = (await runtime.cmsSyncKeeperStatus?.()) ?? null;
          if (alive) setKeeper(ks);
        } catch {
          /* old backend / no keeper — ignore */
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [runtime, loadJobs, loadLoginHistory]);

  // Live status: re-poll the job list every 30s while the screen is visible, so a "đang đồng bộ" job
  // (large table still syncing) flips back to green on its own when it finishes — and the "~N phút"
  // ticks — without a manual reload. Pauses when the window/tab is hidden.
  useEffect(() => {
    const t = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        void loadJobs();
        runtime
          .cmsSyncKeeperStatus?.()
          .then((ks) => setKeeper(ks))
          .catch(() => {});
      }
    }, 30_000);
    return () => clearInterval(t);
  }, [loadJobs, runtime]);

  // Load tables when a source Base is picked.
  useEffect(() => {
    if (!srcApp) {
      setTables([]);
      setSrcTables([]);
      return;
    }
    let alive = true;
    runtime
      .larkListTables?.(srcApp)
      .then((t) => alive && setTables(t ?? []))
      .catch(() => alive && setTables([]));
    return () => {
      alive = false;
    };
  }, [srcApp, runtime]);

  // Open the VISIBLE Lark web window so the user (re)logs in → fresh live session → then push the
  // fresh cookies into all jobs. This is what "refresh session" really needs: the persistent
  // cookies expire, and only a real login refills them.
  const connectWeb = useCallback(async () => {
    setConnecting(true);
    try {
      const info = await runtime.larkWebConnect?.(webHost);
      setWebConnected(!!info?.connected);
      setWebHost(info?.host || webHost);
      if (info?.connected) {
        message.success(tr('chat.larkWebLoggedInRefreshing', 'Đã đăng nhập Lark web — đang làm mới session cho các job…'));
        try {
          const r = await runtime.cmsSyncRefreshAll?.();
          if (r) message.success(`${tr('chat.refreshedSessionFor', 'Đã làm mới session cho')} ${r.refreshed}/${r.total} job.${r.reenabled ? ` ${tr('chat.reenabledJobs', 'Bật lại')} ${r.reenabled} ${tr('chat.jobsDisabledBySession', 'job bị tắt do hết session.')}` : ''}`);
        } catch {
          /* refresh is best-effort; the login itself succeeded */
        }
        await loadJobs();
      } else {
        message.warning(tr('chat.larkWebLoginFailed', 'Chưa đăng nhập được Lark web (cửa sổ đóng hoặc phiên hết hạn). Thử lại.'));
      }
      await loadLoginHistory();
    } catch (e) {
      message.error((e as Error)?.message || tr('chat.cantOpenLarkWeb', 'Không mở được Lark web.'));
    } finally {
      setConnecting(false);
    }
  }, [runtime, webHost, message, loadJobs, loadLoginHistory]);

  const refreshAll = useCallback(async () => {
    setBusy('refresh');
    try {
      const r = await runtime.cmsSyncRefreshAll?.();
      if (r) {
        if (r.total === 0) message.info(tr('chat.noJobsToRefresh', 'Không có job connector nào để làm mới.'));
        else message.success(`${tr('chat.refreshedSessionFor', 'Đã làm mới session cho')} ${r.refreshed}/${r.total} job.${r.reenabled ? ` ${tr('chat.reenabledJobs', 'Bật lại')} ${r.reenabled} ${tr('chat.jobsDisabledBySession', 'job bị tắt do hết session.')}` : ''}`);
        if (r.failed) message.warning(`${r.failed} ${tr('chat.jobsErrored', 'job lỗi')}: ${r.errors.slice(0, 2).join('; ')}`);
      }
      await loadJobs();
    } catch (e) {
      message.error((e as Error)?.message || tr('chat.refreshSessionFailed', 'Làm mới session thất bại.'));
    } finally {
      setBusy(null);
    }
  }, [runtime, message, loadJobs]);

  const refreshOne = useCallback(
    async (job: CmsSyncJob) => {
      const id = String(job._id || job.id);
      setBusy(id);
      try {
        await runtime.cmsSyncRefreshJob?.(id);
        message.success(tr('chat.jobSessionRefreshed', 'Đã làm mới session cho job này.'));
        await loadJobs();
      } catch (e) {
        message.error((e as Error)?.message || tr('chat.refreshSessionFailed', 'Làm mới session thất bại.'));
      } finally {
        setBusy(null);
      }
    },
    [runtime, message, loadJobs],
  );

  const runJob = useCallback(
    async (job: CmsSyncJob) => {
      const id = String(job._id || job.id);
      setBusy(id);
      try {
        const r = await runtime.cmsSyncExecute?.(id);
        // Always surface the raw per-table response (code + msg) so a "success that didn't sync" is
        // diagnosable — this is what Lark actually returned for each table.
        const detailLines = r?.details?.length ? r.details.join('\n') : r?.failed?.length ? r.failed.join('\n') : r?.error || '';
        setRunDetail(detailLines ? `${tr('chat.runVerb', 'Chạy')} "${job.name}" (${r?.ok ? tr('chat.okCaps', 'OK') : tr('chat.errCaps', 'LỖI')}):\n${detailLines}` : '');
        if (r?.ok) {
          message.success(
            typeof r.total === 'number' ? `${tr('chat.calledSync', 'Đã gọi đồng bộ')} ${r.synced ?? r.total}/${r.total} ${tr('chat.tablesUnit', 'bảng')} — ${tr('chat.seeLarkResponse', 'xem phản hồi Lark bên dưới.')}` : tr('chat.ran', 'Đã chạy.'),
          );
        } else {
          message.error(tr('chat.runFailedSeeDetail', 'Chạy thất bại — xem chi tiết bên dưới.'));
        }
        await loadJobs();
      } catch (e) {
        message.error((e as Error)?.message || tr('chat.runFailed', 'Chạy thất bại.'));
      } finally {
        setBusy(null);
      }
    },
    [runtime, message, loadJobs],
  );

  const toggleJob = useCallback(
    async (job: CmsSyncJob) => {
      const id = String(job._id || job.id);
      setBusy(id);
      try {
        await runtime.cmsSyncToggle?.(id);
        await loadJobs();
      } catch (e) {
        message.error((e as Error)?.message || tr('chat.toggleStatusFailed', 'Đổi trạng thái thất bại.'));
      } finally {
        setBusy(null);
      }
    },
    [runtime, message, loadJobs],
  );

  // Bulk enable/disable the SELECTED jobs. Uses cmsSyncUpdateJob({enabled}) — a TARGETED set (not
  // toggle, which would flip already-correct rows). Sequential (one HTTP call per job to the shared
  // backend) with per-job catch. Confirms first because the jobs are backend-GLOBAL (see below).
  const bulkSetEnabled = useCallback(
    (enabled: boolean) => {
      const ids = [...selectedKeys];
      if (!ids.length) return;
      const run = async () => {
        setBulkBusy(true);
        let done = 0;
        const errors: string[] = [];
        for (const id of ids) {
          try {
            await runtime.cmsSyncUpdateJob?.(id, { enabled });
            done++;
          } catch (e) {
            errors.push((e as Error)?.message || id);
          }
        }
        setBulkBusy(false);
        await loadJobs();
        setSelectedKeys([]);
        if (errors.length) message.warning(`${tr('chat.doneVerb', 'Đã')} ${enabled ? tr('chat.enabledLower', 'bật') : tr('chat.disabledLower', 'tắt')} ${done}/${ids.length} job — ${errors.length} ${tr('chat.errorsUnit', 'lỗi')}.`);
        else message.success(`${tr('chat.doneVerb', 'Đã')} ${enabled ? tr('chat.enabledCapsWord', 'BẬT') : tr('chat.disabledCapsWord', 'TẮT')} ${done} job.`);
      };
      modal.confirm({
        title: `${enabled ? tr('chat.enableWord', 'Bật') : tr('chat.disableWord', 'Tắt')} ${ids.length} ${tr('chat.jobsSelectedQ', 'job đã chọn?')}`,
        content: (
          <span style={{ fontSize: 13 }}>
            {tr('chat.bulkWarn1', 'Các job CMS')} <b>{tr('chat.bulkWarn2', 'dùng chung một máy chủ')}</b> {tr('chat.bulkWarn3', '(không tách theo tài khoản) — thao tác này áp dụng cho')} <b>{tr('chat.bulkWarn4', 'MỌI tài khoản')}</b>{' '}
            {tr('chat.bulkWarn5', 'nhìn thấy màn này và')} {enabled ? tr('chat.bulkWarnEnable', 'BẬT lại lịch chạy nền') : tr('chat.bulkWarnDisable', 'DỪNG lịch chạy nền')} {tr('chat.bulkWarn6', 'trên server cho tất cả.')}
          </span>
        ),
        okText: enabled ? tr('chat.bulkEnable', 'Bật hàng loạt') : tr('chat.bulkDisable', 'Tắt hàng loạt'),
        okButtonProps: enabled ? undefined : { danger: true },
        cancelText: tr('chat.cancel', 'Huỷ'),
        onOk: run,
      });
    },
    [selectedKeys, runtime, loadJobs, message, modal, tr],
  );

  // "Chạy test hàng loạt" — trigger the connector sync for many jobs at once. `ids` empty = ALL
  // (filtered) jobs, else the selected ones. SEQUENTIAL: Approach B replays Lark through ONE shared
  // hidden window, so parallel runs would thrash-navigate it — one job at a time, with live progress
  // + an aggregated per-job result in the "chi tiết" panel. A big table saying "đang đồng bộ" (busy)
  // is NOT a failure (its previous sync is still running).
  const bulkRun = useCallback(
    (targets: string[], isAll: boolean) => {
      if (!targets.length) {
        message.info(tr('chat.noJobsToRun', 'Không có job nào để chạy.'));
        return;
      }
      const run = async () => {
        setBulkBusy(true);
        let ok = 0;
        let failed = 0;
        const lines: string[] = [];
        for (let i = 0; i < targets.length; i++) {
          const id = targets[i];
          const name = jobs.find((j) => String(j._id || j.id) === id)?.name || id;
          setBulkRunProgress({ done: i, total: targets.length, name });
          try {
            const r = await runtime.cmsSyncExecute?.(id);
            const detail = r?.details?.length ? r.details.join(' · ') : r?.error || '';
            if (r?.ok) {
              ok++;
              lines.push(`✔ ${name}${detail ? ` — ${detail}` : ''}`);
            } else {
              failed++;
              lines.push(`✘ ${name} — ${detail || tr('chat.errorsUnit', 'lỗi')}`);
            }
          } catch (e) {
            failed++;
            lines.push(`✘ ${name} — ${(e as Error)?.message || tr('chat.errorsUnit', 'lỗi')}`);
          }
        }
        setBulkRunProgress(null);
        setBulkBusy(false);
        setRunDetail(`${tr('chat.runTest', 'Chạy test')} ${targets.length} job — ${ok} OK, ${failed} ${tr('chat.errorsUnit', 'lỗi')}:\n${lines.join('\n')}`);
        if (failed) message.warning(`${tr('chat.ranDone', 'Chạy xong')} ${targets.length} job — ${ok} OK, ${failed} ${tr('chat.errorsUnit', 'lỗi')}. ${tr('chat.seeDetailBelow', 'Xem chi tiết bên dưới.')}`);
        else message.success(`${tr('chat.testRan', 'Đã chạy test')} ${targets.length} job — ${tr('chat.allOk', 'tất cả OK.')}`);
        await loadJobs();
      };
      modal.confirm({
        title: `${tr('chat.runTest', 'Chạy test')} ${targets.length} job${isAll ? tr('chat.allSuffix', ' (tất cả)') : tr('chat.selectedSuffix', ' đã chọn')}?`,
        content: (
          <span style={{ fontSize: 13 }}>
            {tr('chat.bulkRunWarn1', 'Gọi đồng bộ')} <b>{tr('chat.bulkRunWarn2', 'lần lượt')}</b> {tr('chat.bulkRunWarn3', 'từng job (không chạy song song). Bảng lớn có thể báo')} <b>{tr('chat.bulkRunWarn4', '“đang đồng bộ”')}</b> {tr('chat.bulkRunWarn5', '(đang bận) — đó KHÔNG phải lỗi.')}
          </span>
        ),
        okText: tr('chat.runTest', 'Chạy test'),
        cancelText: tr('chat.cancel', 'Huỷ'),
        onOk: run,
      });
    },
    [jobs, runtime, loadJobs, message, modal, tr],
  );

  // Apply the CHECKED config sections to every selected job (leaves unchecked sections untouched).
  const applyBulkConfig = useCallback(async () => {
    const ids = [...selectedKeys];
    if (!ids.length) return;
    const patch: CmsSyncJobPatch = {};
    if (bcApplyInterval) patch.intervalSeconds = bcInterval;
    if (bcApplySchedule) {
      patch.ignoreSchedule = bc247;
      if (!bc247) patch.schedule = { activeHoursStart: bcStart, activeHoursEnd: bcEnd, activeDays: bcDays };
    }
    if (bcApplyNotify) patch.errorNotify = { enabled: bcErrEnabled, larkWebhookUrl: bcErrUrl.trim(), chatId: bcErrChat };
    if (!Object.keys(patch).length) {
      message.warning(tr('chat.selectSectionToApply', 'Chọn ít nhất một mục (chu kỳ / lịch / báo lỗi) để áp dụng.'));
      return;
    }
    setBcSaving(true);
    let done = 0;
    const errors: string[] = [];
    for (const id of ids) {
      try {
        await runtime.cmsSyncUpdateJob?.(id, patch);
        done++;
      } catch (e) {
        errors.push((e as Error)?.message || id);
      }
    }
    setBcSaving(false);
    setBulkCfgOpen(false);
    await loadJobs();
    setSelectedKeys([]);
    if (errors.length) message.warning(`${tr('chat.appliedTo', 'Áp dụng cho')} ${done}/${ids.length} job — ${errors.length} ${tr('chat.errorsUnit', 'lỗi')}.`);
    else message.success(`${tr('chat.appliedConfigTo', 'Đã áp dụng cấu hình cho')} ${done} job.`);
  }, [
    selectedKeys, bcApplyInterval, bcInterval, bcApplySchedule, bc247, bcStart, bcEnd, bcDays,
    bcApplyNotify, bcErrEnabled, bcErrUrl, bcErrChat, runtime, message, loadJobs,
  ]);

  // Clear selection when the filter changes so a bulk action can't hit rows the user can't see.
  useEffect(() => {
    setSelectedKeys([]);
  }, [search, baseFilter]);

  const deleteJob = useCallback(
    async (job: CmsSyncJob) => {
      const id = String(job._id || job.id);
      setBusy(id);
      try {
        await runtime.cmsSyncDeleteJob?.(id);
        message.success(tr('chat.jobDeleted', 'Đã xoá job.'));
        await loadJobs();
      } catch (e) {
        message.error((e as Error)?.message || tr('chat.deleteFailed', 'Xoá thất bại.'));
      } finally {
        setBusy(null);
      }
    },
    [runtime, message, loadJobs],
  );

  const createJob = useCallback(async () => {
    if (!name.trim() || !srcApp || srcTables.length === 0) {
      message.warning(tr('chat.enterNameBaseTable', 'Nhập tên + chọn Base + ít nhất một bảng.'));
      return;
    }
    setBusy('create');
    try {
      await runtime.cmsSyncCreateJob?.({ name: name.trim(), appToken: srcApp, tableIds: srcTables, enabled: true });
      message.success(`${tr('chat.createdSyncJob', 'Đã tạo job đồng bộ')} ${srcTables.length} ${tr('chat.tablesFreshSession', 'bảng (session tươi đã gắn).')}`);
      setName('');
      setSrcApp(undefined);
      setSrcTables([]);
      await loadJobs();
    } catch (e) {
      message.error((e as Error)?.message || tr('chat.createJobFailed', 'Tạo job thất bại.'));
    } finally {
      setBusy(null);
    }
  }, [name, srcApp, srcTables, runtime, message, loadJobs, tr]);

  // Open the per-job "edit tables" modal: load that Base's tables + preselect the job's current set.
  const openEditTables = useCallback(
    async (job: CmsSyncJob) => {
      setEditJob(job);
      setEditSel((job.connector?.tableIds as string[]) || (job.tableId ? [job.tableId] : []));
      setEditTables([]);
      const appToken = job.appToken || job.connector?.docToken;
      if (appToken) {
        try {
          setEditTables((await runtime.larkListTables?.(appToken)) ?? []);
        } catch {
          setEditTables([]);
        }
      }
    },
    [runtime],
  );
  const saveEditTables = useCallback(async () => {
    if (!editJob || editSel.length === 0) {
      message.warning(tr('chat.selectAtLeastTable', 'Chọn ít nhất một bảng.'));
      return;
    }
    setEditSaving(true);
    try {
      await runtime.cmsSyncSetJobTables?.(String(editJob._id || editJob.id), editSel);
      message.success(`${tr('chat.updatedTablesFor', 'Đã cập nhật')} ${editSel.length} ${tr('chat.tablesForJob', 'bảng cho job.')}`);
      setEditJob(null);
      await loadJobs();
    } catch (e) {
      message.error((e as Error)?.message || tr('chat.updateTablesFailed', 'Cập nhật bảng thất bại.'));
    } finally {
      setEditSaving(false);
    }
  }, [editJob, editSel, runtime, message, loadJobs, tr]);

  // Open the per-job config modal, prefilling from the job's current settings.
  const openEditConfig = useCallback((job: CmsSyncJob) => {
    setCfgJob(job);
    setCfgName(job.name || '');
    setCfgInterval(job.intervalSeconds || 60);
    setCfg247(!!job.ignoreSchedule);
    setCfgStart(job.schedule?.activeHoursStart ?? 6);
    setCfgEnd(job.schedule?.activeHoursEnd ?? 20);
    setCfgDays(job.schedule?.activeDays ?? [1, 2, 3, 4, 5, 6]);
    setCfgErrEnabled(!!job.errorNotify?.enabled);
    setCfgErrUrl(job.errorNotify?.larkWebhookUrl ?? '');
    setCfgErrChat(job.errorNotify?.chatId ?? '');
  }, []);
  const saveConfig = useCallback(async () => {
    if (!cfgJob) return;
    if (!cfgName.trim()) {
      message.warning(tr('chat.enterJobName', 'Nhập tên job.'));
      return;
    }
    setCfgSaving(true);
    try {
      await runtime.cmsSyncUpdateJob?.(String(cfgJob._id || cfgJob.id), {
        name: cfgName.trim(),
        intervalSeconds: cfgInterval,
        ignoreSchedule: cfg247,
        schedule: { activeHoursStart: cfgStart, activeHoursEnd: cfgEnd, activeDays: cfgDays },
        errorNotify: { enabled: cfgErrEnabled, larkWebhookUrl: cfgErrUrl.trim(), chatId: cfgErrChat },
      });
      message.success(tr('chat.jobConfigSaved', 'Đã lưu cấu hình job.'));
      setCfgJob(null);
      await loadJobs();
    } catch (e) {
      message.error((e as Error)?.message || tr('chat.saveConfigFailed', 'Lưu cấu hình thất bại.'));
    } finally {
      setCfgSaving(false);
    }
  }, [cfgJob, cfgName, cfgInterval, cfg247, cfgStart, cfgEnd, cfgDays, cfgErrEnabled, cfgErrUrl, cfgErrChat, runtime, message, loadJobs, tr]);

  // Persist the aggregate error-report config. `silent` = auto-save (no toast) — used when the
  // user flips the switch or picks a group, so the setting sticks WITHOUT a separate "Lưu" click
  // (that was the "bật rồi mở lại bị tắt" bug: the toggle only set local state).
  const persistError = useCallback(
    async (cfg: { enabled: boolean; larkWebhookUrl: string; chatId: string }, silent = false) => {
      setErrSaving(true);
      try {
        const r = await runtime.cmsSyncSetErrorReport?.(cfg);
        if (r) {
          setErrEnabled(r.enabled);
          setErrUrl(r.larkWebhookUrl);
          setErrChat(r.chatId || '');
        }
        if (!silent) message.success(tr('chat.errReportSaved', 'Đã lưu cấu hình báo lỗi tổng.'));
      } catch (e) {
        message.error((e as Error)?.message || tr('chat.errReportSaveFailed', 'Lưu cấu hình báo lỗi thất bại.'));
      } finally {
        setErrSaving(false);
      }
    },
    [runtime, message, tr],
  );
  const saveErrorReport = useCallback(
    () => persistError({ enabled: errEnabled, larkWebhookUrl: errUrl.trim(), chatId: errChat }),
    [persistError, errEnabled, errUrl, errChat],
  );

  const createChat = useCallback(async () => {
    if (!newChatName.trim()) {
      message.warning(tr('chat.enterGroupName', 'Nhập tên nhóm.'));
      return;
    }
    setCreatingChat(true);
    try {
      const c = await runtime.cmsSyncCreateLarkChat?.(newChatName.trim());
      if (c?.chatId) {
        setCreateOpen(false);
        setNewChatName('');
        const chats = (await runtime.cmsSyncListLarkChats?.()) ?? [];
        setLarkChats(chats);
        setErrChat(c.chatId);
        setErrEnabled(true);
        // PERSIST the new group as the target (setErrChat only sets local state — without this the
        // config isn't saved to the backend, so revisiting the page shows no group).
        void persistError({ enabled: true, larkWebhookUrl: errUrl.trim(), chatId: c.chatId }, true);
        if (c.addedMembers > 0) {
          message.success(`${tr('chat.createdGroup', 'Đã tạo nhóm')} "${c.name}" ${tr('chat.groupBotYouTarget', '(có bot + bạn) và chọn làm nơi nhận báo lỗi.')}`);
        } else if (c.joinLink) {
          // Couldn't auto-add (cross-app identity) → open a JOIN LINK so the user gets in with one tap.
          runtime.openExternal?.(c.joinLink);
          modal.info({
            title: tr('chat.groupCreatedJoin', 'Đã tạo nhóm — bấm "Tham gia" để vào'),
            width: 520,
            content: (
              <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                <p>
                  {tr('chat.groupWord', 'Nhóm')} <b>“{c.name}”</b> {tr('chat.groupCreatedForErr', 'đã tạo (bot đã ở trong để gửi báo lỗi). Mình vừa mở')} <b>{tr('chat.groupInvite', 'lời mời vào nhóm')}</b> {tr('chat.inLarkTapJoin', 'trong Lark — bấm')} <b>{tr('chat.joinBold', '“Tham gia”')}</b> {tr('chat.joinToGetErr', 'để vào nhóm là bạn sẽ nhận được báo lỗi.')}
                </p>
                <p style={{ margin: 0, color: V.textFaint }}>
                  {tr('chat.copyLinkOpenInLark', 'Nếu không thấy Lark tự mở, copy link này mở trong Lark:')}
                  <br />
                  <a href={c.joinLink} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>
                    {c.joinLink}
                  </a>
                </p>
              </div>
            ),
          });
        } else {
          // No join link + not added → honest fallback guidance.
          modal.info({
            title: tr('chat.groupCreatedNotAdded', 'Nhóm đã tạo nhưng chưa thêm được bạn'),
            width: 520,
            content: (
              <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                <p>
                  {tr('chat.groupWord', 'Nhóm')} <b>“{c.name}”</b> {tr('chat.groupOnlyBot', 'đã tạo nhưng')} <b>{tr('chat.onlyBotNow', 'hiện chỉ có bot')}</b> {tr('chat.noAutoInvite', 'và không tạo được lời mời tự động. Cách chắc chắn:')}
                </p>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  <li>{tr('chat.pickExistingGroup1', 'Chọn một')} <b>{tr('chat.existingGroupBold', 'nhóm CÓ SẴN')}</b> {tr('chat.pickExistingGroup2', 'ở ô “Chọn nhóm” (bạn và bot đã cùng nhóm), rồi Gửi tin test.')}</li>
                  <li>{tr('chat.orCreateGroupManually', 'Hoặc tự tạo nhóm trong Lark, thêm bot Larkwave, rồi bấm nút Làm mới để nó hiện trong danh sách.')}</li>
                </ul>
              </div>
            ),
          });
        }
      } else {
        message.error(tr('chat.createGroupNoChatId', 'Tạo nhóm thất bại (không nhận được chat_id).'));
      }
    } catch (e) {
      message.error((e as Error)?.message || tr('chat.createGroupFailed2', 'Tạo nhóm thất bại.'));
    } finally {
      setCreatingChat(false);
    }
  }, [newChatName, runtime, message, persistError, errUrl, modal, tr]);

  const reloadChats = useCallback(async () => {
    try {
      const chats = (await runtime.cmsSyncListLarkChats?.()) ?? [];
      setLarkChats(chats);
      message.success(`${tr('chat.refreshedDash', 'Đã làm mới —')} ${chats.length} ${tr('chat.botGroupsIn', 'nhóm bot đang ở trong.')}`);
    } catch (e) {
      message.error((e as Error)?.message || tr('chat.loadGroupsFailed', 'Không tải được danh sách nhóm.'));
    }
  }, [runtime, message, tr]);

  const testErr = useCallback(
    async (larkWebhookUrl: string, chatId: string) => {
      setTestingErr(true);
      try {
        const r = await runtime.cmsSyncTestErrorReport?.({ larkWebhookUrl: larkWebhookUrl.trim(), chatId });
        if (r?.ok) message.success(tr('chat.testSent', 'Đã gửi tin test — mở Lark kiểm tra xem nhận được chưa.'));
        else {
          const bad = r?.results?.find((x) => !x.ok);
          message.error(`${tr('chat.testNotSent', 'Test chưa gửi được')}${bad?.error ? `: ${bad.error}` : ''}.`);
        }
      } catch (e) {
        message.error((e as Error)?.message || tr('chat.testSendFailed', 'Gửi test thất bại.'));
      } finally {
        setTestingErr(false);
      }
    },
    [runtime, message, tr],
  );

  const connectorJobs = useMemo(() => jobs.filter((j) => j.syncMode === 'connector'), [jobs]);
  const stats = useMemo(() => {
    const enabled = connectorJobs.filter((j) => j.enabled).length;
    const tables = connectorJobs.reduce(
      (n, j) => n + ((j.connector?.tableIds as string[])?.length || (j.tableId ? 1 : 0)),
      0,
    );
    const errored = connectorJobs.filter((j) => (j.lastSyncStatus || j.lastStatus) === 'error').length;
    const records = connectorJobs.reduce((n, j) => n + (j.lastSyncStats?.total || 0), 0);
    return { total: connectorJobs.length, enabled, tables, errored, records };
  }, [connectorJobs]);

  // Base filter options — distinct bases referenced by the jobs, labelled with the Base name.
  const baseOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const j of connectorJobs) {
      const tok = j.appToken || j.connector?.docToken;
      if (!tok || seen.has(tok)) continue;
      seen.set(tok, bases.find((b) => b.appToken === tok)?.name || tok);
    }
    return Array.from(seen, ([value, label]) => ({ value, label }));
  }, [connectorJobs, bases]);

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return connectorJobs.filter((j) => {
      if (baseFilter && (j.appToken || j.connector?.docToken) !== baseFilter) return false;
      if (q && !String(j.name || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [connectorJobs, search, baseFilter]);

  // Dropdown options for the error-report "chọn nhóm" Select. Ensures the CURRENTLY-SELECTED
  // chat still shows even if the list hasn't returned it yet (e.g. a just-created group), so the
  // saved group never appears blank on reload.
  const chatOptionsWith = useCallback(
    (selected: string) => {
      const opts = larkChats.map((c) => ({ label: c.name, value: c.chatId }));
      if (selected && !larkChats.some((c) => c.chatId === selected)) {
        return [{ label: `${selected} ${tr('chat.selectedGroup', '(nhóm đã chọn)')}`, value: selected }, ...opts];
      }
      return opts;
    },
    [larkChats],
  );

  const columns: TableColumnsType<CmsSyncJob> = [
    {
      title: tr('chat.jobNameCol', 'Tên job'),
      key: 'name',
      render: (_, job) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: V.text }}>
            <DatabaseOutlined style={{ color: BRAND }} />
            {job.name}
          </span>
          {job.connector?.domain && <span style={{ fontSize: 11, color: V.textFaint }}>{job.connector.domain}</span>}
        </div>
      ),
    },
    {
      title: tr('chat.tableLabel', 'Bảng'),
      key: 'tables',
      align: 'center',
      width: 70,
      render: (_, job) => (job.connector?.tableIds as string[])?.length || (job.tableId ? 1 : 0),
    },
    {
      title: tr('chat.statusCol', 'Trạng thái'),
      key: 'status',
      render: (_, job) => {
        const status = String(job.lastSyncStatus || job.lastStatus || '');
        const st = job.lastSyncStats;
        const isConnector = job.syncMode === 'connector';
        const rawErr = String(job.lastSyncError || job.lastError || '');
        // A connector run stores status:"success" + a NOTE ("N triggered, M skipped (still syncing)")
        // when Lark is STILL SYNCING a large table's previous batch — it is NOT an error (the data IS
        // syncing, just slowly), and the skip count is mapped into stats.deleted. Show it as an
        // informational "đang đồng bộ", never a red "lỗi:".
        const isBusyNote = jobIsBusy(job);
        const isRealError = !!rawErr && !isBusyNote;
        const busyCount = isBusyNote ? st?.deleted || 0 : 0;
        const bs = busySince[String(job._id || job.id)];
        const busyMins = isBusyNote && bs ? Math.floor((Date.now() - bs) / 60000) : 0;
        // For connector jobs the stats mean tables/triggered/busy — NOT record counts; relabel so the
        // user doesn't read a healthy "still syncing" run as "-1 records / lỗi".
        const stParts = st
          ? (isConnector
              ? [
                  st.added ? `▶ ${st.added} ${tr('chat.tablesTriggered', 'bảng đã kích hoạt')}` : '',
                  busyCount ? `⏳ ${busyCount} ${tr('chat.syncing2', 'đang đồng bộ')}` : st.deleted && !isBusyNote ? `-${st.deleted}` : '',
                ]
              : [
                  st.total != null ? `${st.total} ${tr('chat.recordsUnit', 'bản ghi')}` : '',
                  st.added ? `+${st.added}` : '',
                  st.updated ? `~${st.updated}` : '',
                  st.deleted ? `-${st.deleted}` : '',
                ]
            )
              .filter(Boolean)
              .join(' ')
          : '';
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
            {status ? (
              <Tag
                color={/err|fail|lỗi/i.test(status) ? 'error' : isBusyNote || status === 'pending' ? 'processing' : 'success'}
                style={{ marginInlineEnd: 0 }}
              >
                {isBusyNote ? tr('chat.syncing2', 'đang đồng bộ') : status}
              </Tag>
            ) : (
              <span style={{ color: V.textFaint }}>—</span>
            )}
            {stParts && <span style={{ fontSize: 12, color: isBusyNote ? '#2F80ED' : '#16B98D' }}>{stParts}</span>}
            {isBusyNote && (
              <Tooltip title={rawErr}>
                <span style={{ fontSize: 11, color: '#2F80ED', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  ⏳ {tr('chat.syncing2', 'đang đồng bộ')}{busyMins >= 1 ? ` ~${busyMins} ${tr('chat.minutesUnit', 'phút')}` : ''} {tr('chat.bigTableAuto', '— bảng lớn, sẽ tự xong')}
                </span>
              </Tooltip>
            )}
            {isRealError && (
              <Tooltip title={rawErr}>
                <span
                  style={{
                    fontSize: 11,
                    color: '#EF4444',
                    maxWidth: 200,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tr('chat.errorsUnit', 'lỗi')}: {rawErr}
                </span>
              </Tooltip>
            )}
          </div>
        );
      },
    },
    {
      title: tr('chat.lastSyncCol', 'Đồng bộ gần nhất'),
      key: 'lastAt',
      render: (_, job) => {
        const lastAt = job.lastSyncAt || job.lastRunAt;
        const iv = job.intervalSeconds;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {lastAt ? (
              <span style={{ fontSize: 12, color: V.textSub }}>{fmtWhen(lastAt)}</span>
            ) : (
              <span style={{ color: V.textFaint }}>—</span>
            )}
            {iv ? (
              <span style={{ fontSize: 11, color: V.textFaint }}>
                {tr('chat.every', 'mỗi')} {iv >= 60 ? `${Math.round(iv / 60)} ${tr('chat.minutesUnit', 'phút')}` : `${iv}s`}
                {job.ignoreSchedule ? ' · 24/7' : ''}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      title: tr('chat.onLabel', 'Bật'),
      key: 'enabled',
      align: 'center',
      width: 64,
      render: (_, job) => {
        const id = String(job._id || job.id);
        return (
          <Switch
            size="small"
            checked={!!job.enabled}
            loading={busy === id}
            disabled={bulkBusy}
            onChange={() => toggleJob(job)}
            checkedChildren={tr('chat.enabledLower', 'bật')}
            unCheckedChildren={tr('chat.off', 'tắt')}
          />
        );
      },
    },
    {
      title: tr('chat.actionsCol', 'Thao tác'),
      key: 'actions',
      align: 'right',
      render: (_, job) => {
        const id = String(job._id || job.id);
        const acting = busy === id;
        return (
          <Space size={4} wrap>
            <Tooltip title={tr('chat.configTip', 'Cấu hình: tên, tần suất, lịch tự động')}>
              <Button size="small" icon={<EditOutlined />} loading={acting} onClick={() => openEditConfig(job)} />
            </Tooltip>
            <Tooltip title={tr('chat.pumpCookieTip', 'Bơm cookie/csrf mới cho job này (kể cả khi đã tắt)')}>
              <Button size="small" icon={<ReloadOutlined />} loading={acting} onClick={() => refreshOne(job)} />
            </Tooltip>
            <Tooltip title={tr('chat.reselectTablesTip', 'Chọn lại các bảng đồng bộ trong Base này')}>
              <Button size="small" icon={<TableOutlined />} loading={acting} onClick={() => openEditTables(job)} />
            </Tooltip>
            <Tooltip title={tr('chat.refreshRunTip', 'Làm mới session + chạy đồng bộ ngay')}>
              <Button size="small" type="primary" icon={<PlayCircleOutlined />} loading={acting} onClick={() => runJob(job)} />
            </Tooltip>
            <Popconfirm title={tr('chat.deleteJobQ', 'Xoá job này?')} okText={tr('chat.delete', 'Xoá')} cancelText={tr('chat.cancel', 'Huỷ')} onConfirm={() => deleteJob(job)}>
              <Button size="small" danger icon={<DeleteOutlined />} loading={acting} />
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  if (loading)
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spin />
      </div>
    );

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 16,
          padding: '18px 20px',
          borderRadius: 14,
          background: V.surface,
          border: `1px solid ${V.border}`,
        }}
      >
        <span
          style={{
            width: 48,
            height: 48,
            minWidth: 48,
            borderRadius: 13,
            background: BRAND_GRADIENT,
            color: '#fff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
          }}
        >
          <CloudServerOutlined />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Title level={4} style={{ margin: 0, color: V.text }}>
            {tr('chat.cmsSyncTitle', 'Đồng bộ Bitable (CMS)')}
          </Title>
          <Paragraph style={{ margin: '6px 0 0', color: V.textSub, fontSize: 13, lineHeight: 1.6 }}>
            {tr('chat.cmsIntro1', 'Giữ')} <b>{tr('chat.cmsIntro2', 'session connector luôn tươi')}</b> {tr('chat.cmsIntro3', 'từ phiên Lark web đã lưu.')} <b>{tr('chat.cmsIntro4', 'Session Lark hết hạn theo thời gian')}</b> {tr('chat.cmsIntro5', '— khi đó bấm')} <b>{tr('chat.reloginLarkWebQuoted', '“Đăng nhập lại Lark web”')}</b> {tr('chat.cmsIntro6', 'để mở cửa sổ Lark, đăng nhập lại (lấy session mới) → app tự bơm cookie mới cho tất cả job. “Chạy ngay” sẽ gọi Lark trực tiếp bằng session sống này.')}
          </Paragraph>
          <Paragraph style={{ margin: '4px 0 0', color: V.textFaint, fontSize: 12, lineHeight: 1.6 }}>
            {tr('chat.cmsAuto1', 'Khi app mở, nó')} <b>{tr('chat.cmsAuto2', 'tự làm mới session mỗi 30 phút và ngay lúc mở app')}</b> {tr('chat.cmsAuto3', '— đồng thời')} <b>{tr('chat.cmsAuto4', 'tự BẬT LẠI')}</b> {tr('chat.cmsAuto5', 'các job bị máy chủ tắt do hết session (để lịch đồng bộ tự chạy lại). Job bạn tự tắt tay thì không bị đụng tới.')}
          </Paragraph>
          <div style={{ marginTop: 6, fontSize: 12 }}>
            <Tag color={webConnected ? 'green' : 'red'}>{webConnected ? tr('chat.larkWebConnectedTag', 'Lark web: đã kết nối') : tr('chat.larkWebNotConnectedTag', 'Lark web: chưa kết nối')}</Tag>
            {webHost && <span style={{ color: V.textFaint }}>{webHost.replace(/^https?:\/\//, '')}</span>}
          </div>
        </div>
        <Space direction="vertical" size={8} style={{ alignItems: 'stretch' }}>
          <Button
            icon={<LoginOutlined />}
            loading={connecting}
            onClick={connectWeb}
            type="primary"
            style={{ background: BRAND_GRADIENT, border: 'none', fontWeight: 600 }}
          >
            {webConnected ? tr('chat.reloginLarkWeb', 'Đăng nhập lại Lark web') : tr('chat.loginLarkWeb', 'Đăng nhập Lark web')}
          </Button>
          <Button icon={<ReloadOutlined spin={busy === 'refresh'} />} loading={busy === 'refresh'} onClick={refreshAll}>
            {tr('chat.refreshSessionAll', 'Làm mới session (tất cả)')}
          </Button>
          <Popover
            trigger="click"
            placement="bottomRight"
            title={tr('chat.reloginFromPhone', 'Đăng nhập lại từ điện thoại')}
            content={
              <div style={{ width: 220, textAlign: 'center' }}>
                <div style={{ background: '#fff', padding: 10, borderRadius: 12, display: 'inline-block', lineHeight: 0, boxShadow: '0 1px 6px rgba(0,0,0,0.12)' }}>
                  <QRCode value="https://toolswave.net/remote/lark" size={150} bordered={false} />
                </div>
                <div style={{ fontSize: 12, color: V.textSub, margin: '10px 0 6px', lineHeight: 1.5 }}>
                  {tr('chat.scanWith', 'Quét bằng')} <b>{tr('chat.phoneCamera', 'camera điện thoại')}</b> {tr('chat.toOpenReloginPage', 'để mở trang đăng nhập lại Lark cho máy (khi bạn không ở cạnh máy).')}
                </div>
                <Text copyable={{ text: 'https://toolswave.net/remote/lark' }} style={{ fontSize: 11, color: V.textSub }}>
                  toolswave.net/remote/lark
                </Text>
                <Button
                  size="small"
                  block
                  style={{ marginTop: 8 }}
                  onClick={() => runtime.openExternal?.('https://toolswave.net/remote/lark')}
                >
                  {tr('chat.openOnThisMachine', 'Mở trên máy này')}
                </Button>
              </div>
            }
          >
            <Button icon={<QrcodeOutlined />}>{tr('chat.fromPhoneQr', 'Từ điện thoại (QR)')}</Button>
          </Popover>
        </Space>
      </div>

      {/* Transparent VM session + per-host/account mapping + how-it-works + multi-account note. */}
      <LarkSessionsPanel
        jobs={jobs}
        keeper={keeper}
        webConnected={webConnected}
        webHost={webHost}
        connecting={connecting}
        onRelogin={connectWeb}
        onRefresh={refreshAll}
        refreshing={busy === 'refresh'}
        openExternal={runtime.openExternal}
      />

      {/* Lịch sử đăng nhập lại Lark (local + remote QR) — collapsible */}
      <Collapse
        size="small"
        style={{ background: V.surface }}
        items={[
          {
            key: 'lichsu',
            label: (
              <span style={{ color: V.text, fontWeight: 600 }}>
                <LoginOutlined /> {tr('chat.reloginHistory', 'Lịch sử đăng nhập lại Lark')}
                {loginHistory.length > 0 && (
                  <Text type="secondary" style={{ fontSize: 12, marginLeft: 6 }}>({loginHistory.length})</Text>
                )}
              </span>
            ),
            extra: (
              <ReloadOutlined
                onClick={(e) => {
                  e.stopPropagation();
                  void loadLoginHistory();
                }}
                style={{ color: V.textSub }}
              />
            ),
            children: (
              <>
                {loginHistory.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={tr('chat.noReloginYet', 'Chưa có lần đăng nhập lại nào.')} />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {loginHistory.map((h, i) => (
                      <div
                        key={`${h.at}-${i}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '7px 2px',
                          borderTop: i === 0 ? 'none' : `1px solid ${V.border}`,
                          fontSize: 12.5,
                        }}
                      >
                        <Tag color={h.source === 'remote' ? 'blue' : 'default'} style={{ margin: 0 }}>
                          {h.source === 'remote' ? tr('chat.remoteQr', '📱 Từ xa (QR)') : tr('chat.atMachine', '🖥 Tại máy')}
                        </Tag>
                        <Tag
                          color={h.outcome === 'success' ? 'green' : h.outcome === 'timeout' ? 'orange' : 'red'}
                          style={{ margin: 0 }}
                        >
                          {h.outcome === 'success' ? tr('chat.success', 'Thành công') : h.outcome === 'timeout' ? tr('chat.timedOut', 'Hết giờ') : tr('chat.failed', 'Thất bại')}
                        </Tag>
                        <span style={{ flex: 1 }} />
                        <span style={{ color: V.textFaint, whiteSpace: 'nowrap' }}>
                          {new Date(h.at).toLocaleString('vi-VN')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
                  {tr('chat.reloginHistoryDesc', 'Ghi lại mỗi lần đăng nhập lại phiên Lark web — tại máy (nút trên) hoặc từ điện thoại (quét QR).')}
                </Text>
              </>
            ),
          },
        ]}
      />

      {!webConnected && (
        <Alert
          type="warning"
          showIcon
          message={tr('chat.larkWebNotConnected2', 'Chưa kết nối Lark web')}
          description={tr('chat.larkWebNotConnectedDesc', 'Cần đăng nhập Lark web để lấy session. Bấm “Đăng nhập Lark web” ở trên — cửa sổ Lark sẽ mở để bạn đăng nhập.')}
          action={
            <Button size="small" type="primary" icon={<LoginOutlined />} loading={connecting} onClick={connectWeb}>
              {tr('chat.loginLarkWeb', 'Đăng nhập Lark web')}
            </Button>
          }
        />
      )}

      {/* VM session-keeper (tw-cms-keeper) — check the always-on VM without SSH */}
      {keeper && keeper.present !== false && (
        <Card
          size="small"
          style={{ background: V.surface, borderColor: keeper.online ? undefined : '#EF4444' }}
          styles={{ body: { padding: '12px 16px' } }}
        >
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
              <Space size={8} wrap>
                <CloudServerOutlined style={{ color: keeper.online ? '#16B98D' : '#EF4444' }} />
                <Text strong>{tr('chat.vmKeeper247', 'Máy VM giữ phiên (24/7)')}</Text>
                <Tag color={keeper.online ? 'green' : 'red'}>{keeper.online ? tr('chat.vmRunning', 'Đang chạy') : tr('chat.vmOffline2', 'Ngoại tuyến')}</Tag>
                {keeper.online && (
                  <Tag color={keeper.loggedIn ? 'green' : 'orange'}>
                    {keeper.loggedIn ? tr('chat.larkLoggedInTag', 'Đã đăng nhập Lark') : tr('chat.sessionExpiredTag', 'Phiên hết hạn')}
                  </Tag>
                )}
              </Space>
              {keeper.online && keeper.loggedIn && keeper.lastRefresh && (
                <Text type="secondary" style={{ fontSize: 12.5 }}>
                  {tr('chat.lastSessionPush', 'Đẩy session lần cuối')}: {keeper.lastRefresh.refreshed}/{keeper.lastRefresh.total}
                  {keeper.at ? ` · ${fmtWhen(keeper.at)}` : ''}
                </Text>
              )}
            </Space>
            {!keeper.online && (
              <Text type="secondary" style={{ fontSize: 12.5 }}>
                {tr('chat.noVmSignal', 'Không nhận được tín hiệu từ máy VM')}
                {keeper.ageSec != null ? ` (${Math.round(keeper.ageSec / 60)} ${tr('chat.minutesAgo', 'phút trước')})` : ''}. {tr('chat.checkKeeperSvc', 'Kiểm tra dịch vụ keeper trên VM.')}
              </Text>
            )}
            {keeper.online && !keeper.loggedIn && keeper.reloginUrl && (
              <Alert
                type="warning"
                showIcon
                message={tr('chat.vmSessionExpiredTitle', 'Phiên Lark trên VM đã hết hạn — CMS sync sẽ dừng')}
                description={tr('chat.scanQrReloginLive', 'Quét QR để đăng nhập lại (mã sống, tự làm mới trong trình duyệt).')}
                action={
                  <Button
                    size="small"
                    type="primary"
                    icon={<QrcodeOutlined />}
                    onClick={() => keeper.reloginUrl && runtime.openExternal?.(keeper.reloginUrl)}
                  >
                    {tr('chat.reloginScanQr', 'Đăng nhập lại (quét QR)')}
                  </Button>
                }
              />
            )}
          </Space>
        </Card>
      )}

      {/* Stats overview — mirrors cmshoanam.toolswave.net/sync/bitable */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: 10,
        }}
      >
        {[
          { label: tr('chat.jobConnector', 'Job connector'), value: stats.total, color: BRAND },
          { label: tr('chat.enabledCount', 'Đang bật'), value: stats.enabled, color: '#16B98D' },
          { label: tr('chat.totalTables', 'Tổng số bảng'), value: stats.tables, color: '#3B82F6' },
          { label: tr('chat.recordsLast', 'Bản ghi (lần cuối)'), value: stats.records, color: '#8B5CF6' },
          { label: tr('chat.erroredCount', 'Đang lỗi'), value: stats.errored, color: stats.errored ? '#EF4444' : V.textSub },
        ].map((s) => (
          <Card key={s.label} size="small" style={{ background: V.surface }} styles={{ body: { padding: '10px 14px' } }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color, lineHeight: 1.2 }}>{s.value}</div>
            <div style={{ fontSize: 12, color: V.textSub, marginTop: 2 }}>{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Nhật ký & báo cáo — last run per job + a focused error report */}
      {jobs.length > 0 && (() => {
        const jid = (j: CmsSyncJob) => String(j._id || j.id);
        const jstatus = (j: CmsSyncJob) => String(j.lastSyncStatus || j.lastStatus || (j.lastSyncAt ? 'success' : 'pending'));
        const jerr = (j: CmsSyncJob) => (j.lastSyncError || j.lastError || '') as string;
        const isErr = (j: CmsSyncJob) => jstatus(j) === 'error' || !!jerr(j);
        const errored = jobs.filter(isErr);
        const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString('vi-VN') : tr('chat.notRunYet', 'chưa chạy'));
        const statLine = (j: CmsSyncJob) => {
          const st = j.lastSyncStats;
          if (!st) return '';
          const parts: string[] = [];
          if (st.added) parts.push(`+${st.added}`);
          if (st.updated) parts.push(`~${st.updated}`);
          if (st.deleted) parts.push(`-${st.deleted}`);
          if (typeof st.total === 'number') parts.push(`/${st.total}`);
          return parts.join(' ');
        };
        return (
          <Collapse
            size="small"
            style={{ background: V.surface }}
            defaultActiveKey={errored.length > 0 ? ['nhatky'] : []}
            items={[{
              key: 'nhatky',
              label: (
                <span style={{ color: V.text, fontWeight: 600 }}>
                  <FileTextOutlined /> {tr('chat.logReport', 'Nhật ký & báo cáo')}
                  {errored.length > 0 && (
                    <Text style={{ fontSize: 12, marginLeft: 6, color: '#EF4444' }}>({errored.length} {tr('chat.errorsUnit', 'lỗi')})</Text>
                  )}
                </span>
              ),
              extra: (
                <ReloadOutlined
                  onClick={(e) => {
                    e.stopPropagation();
                    void loadJobs();
                  }}
                  style={{ color: V.textSub }}
                />
              ),
              children: (
                <>
            {errored.length > 0 ? (
              <Alert
                type="error"
                showIcon
                style={{ marginBottom: 12 }}
                message={`${errored.length}/${jobs.length} ${tr('chat.jobsErroredLastRun', 'job lỗi ở lần chạy gần nhất')}`}
                description={
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                    {errored.map((j) => (
                      <div key={jid(j)} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5 }}>
                        <b style={{ minWidth: 0 }}>{j.name}</b>
                        <span style={{ flex: 1, minWidth: 0, color: '#EF4444', wordBreak: 'break-word' }}>
                          {jerr(j) || tr('chat.unknownError', 'Lỗi không rõ')}
                        </span>
                        <Button
                          size="small"
                          type="link"
                          loading={busy === jid(j)}
                          onClick={() => void runJob(j)}
                          style={{ padding: 0, height: 'auto' }}
                        >
                          {tr('chat.rerun', 'Chạy lại')}
                        </Button>
                      </div>
                    ))}
                  </div>
                }
              />
            ) : (
              <Alert
                type="success"
                showIcon
                style={{ marginBottom: 12 }}
                message={tr('chat.allJobsOk', 'Tất cả job đều ổn ở lần chạy gần nhất.')}
                icon={<CheckCircleFilled />}
              />
            )}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {jobs.map((j, i) => (
                <div
                  key={jid(j)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '7px 2px',
                    borderTop: i === 0 ? 'none' : `1px solid ${V.border}`,
                    fontSize: 12.5,
                  }}
                >
                  {isErr(j) ? (
                    <WarningFilled style={{ color: '#EF4444' }} />
                  ) : jstatus(j) === 'success' ? (
                    <CheckCircleFilled style={{ color: '#16B98D' }} />
                  ) : (
                    <SyncOutlined style={{ color: V.textFaint }} />
                  )}
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: V.text }}>
                    {j.name}
                    {j.enabled === false && <Tag style={{ marginLeft: 6 }}>{tr('chat.off', 'tắt')}</Tag>}
                  </span>
                  <span style={{ color: V.textSub, fontVariantNumeric: 'tabular-nums' }}>{statLine(j)}</span>
                  <span style={{ color: V.textFaint, whiteSpace: 'nowrap' }}>{fmt(j.lastSyncAt || j.lastRunAt)}</span>
                </div>
              ))}
            </div>
                </>
              ),
            }]}
          />
        );
      })()}

      {/* Create job */}
      <Card
        size="small"
        style={{ background: V.surface }}
        title={<span style={{ color: V.text }}>{tr('chat.createSyncJob', 'Tạo job đồng bộ (connector)')}</span>}
      >
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('chat.jobNameExPlaceholder', 'Tên job (ví dụ: Đồng bộ Khách hàng)')} />
          <Space wrap>
            <Select
              placeholder={tr('chat.selectSourceBase', 'Chọn Base nguồn')}
              style={{ minWidth: 220 }}
              value={srcApp}
              onChange={setSrcApp}
              options={bases.map((b) => ({ label: b.name || b.appToken, value: b.appToken }))}
              notFoundContent={tr('chat.noBaseAddInAgents', 'Chưa có Base — thêm ở Lark × Agents')}
            />
            <Select
              mode="multiple"
              placeholder={tr('chat.selectTablesMulti', 'Chọn bảng (nhiều)')}
              style={{ minWidth: 280, maxWidth: 460 }}
              value={srcTables}
              onChange={setSrcTables}
              disabled={!srcApp}
              maxTagCount="responsive"
              options={tables.map((t) => ({ label: t.name, value: t.tableId }))}
              notFoundContent={srcApp ? tr('chat.loading', 'Đang tải…') : tr('chat.selectBaseFirst', 'Chọn Base trước')}
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              loading={busy === 'create'}
              disabled={!webConnected}
              onClick={createJob}
            >
              {tr('chat.createJob', 'Tạo job')}
            </Button>
          </Space>
        </Space>
      </Card>

      {error && (
        <Alert
          type="error"
          showIcon
          closable
          onClose={() => setError('')}
          message={tr('chat.errorDetail', 'Chi tiết lỗi (copy gửi hỗ trợ nếu cần)')}
          description={<pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12 }}>{error}</pre>}
        />
      )}
      {runDetail && (
        <Alert
          type="info"
          showIcon
          closable
          onClose={() => setRunDetail('')}
          message={tr('chat.larkResponseMsg', 'Phản hồi Lark cho lần chạy (copy gửi hỗ trợ)')}
          description={<pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12 }}>{runDetail}</pre>}
        />
      )}

      {/* Aggregate error report — any job error → one Lark bot webhook (runs on the backend, 24/7) */}
      <Card
        size="small"
        style={{ background: V.surface }}
        title={<span style={{ color: V.text }}>{tr('chat.aggErrWebhook', 'Webhook báo lỗi tổng (Lark)')}</span>}
      >
        {!runtime.cmsSyncSetErrorReport ? (
          <Alert
            type="warning"
            showIcon
            message={tr('chat.reinstallForErr', 'Cần cài lại app để dùng báo lỗi')}
            description={tr('chat.reinstallForErrDesc', 'Bản app đang cài chưa hỗ trợ lưu cấu hình báo lỗi (vì vậy bật lên rồi mở lại vẫn tắt). Hãy cài lại bản mới nhất — vào mục phiên bản để tải, hoặc bấm cập nhật.')}
          />
        ) : (
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Switch
              checked={errEnabled}
              loading={errSaving}
              onChange={(v) => {
                setErrEnabled(v);
                void persistError({ enabled: v, larkWebhookUrl: errUrl.trim(), chatId: errChat }, true);
              }}
              checkedChildren={tr('chat.enabledLower', 'bật')}
              unCheckedChildren={tr('chat.off', 'tắt')}
            />
            <span style={{ fontSize: 12, color: V.textSub }}>
              {tr('chat.errWebhookDesc1', 'Bất kỳ job nào LỖI → gửi card vào Lark. Chạy trên máy chủ (kể cả khi tắt app). Bật/chọn nhóm là')} <b>{tr('chat.autoSaves', 'tự lưu')}</b>.
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ flex: 1, minWidth: 220 }}
              disabled={!errEnabled}
              placeholder={larkChats.length ? tr('chat.selectLarkGroup', 'Chọn nhóm Lark (bot đang ở trong)') : tr('chat.noGroupCreate', 'Chưa có nhóm — bấm "Tạo nhóm"')}
              value={errChat || undefined}
              onChange={(v) => {
                const c = v || '';
                setErrChat(c);
                void persistError({ enabled: errEnabled, larkWebhookUrl: errUrl.trim(), chatId: c }, true);
              }}
              options={chatOptionsWith(errChat)}
              notFoundContent={tr('chat.botNoGroup', 'Bot chưa ở trong nhóm nào')}
            />
            <Button icon={<PlusOutlined />} disabled={!errEnabled} onClick={() => setCreateOpen(true)}>
              {tr('chat.createGroup', 'Tạo nhóm')}
            </Button>
            <Tooltip title={tr('chat.reloadGroupsTip', 'Tải lại danh sách nhóm (sau khi thêm bot vào nhóm trong Lark)')}>
              <Button icon={<ReloadOutlined />} disabled={!errEnabled} onClick={reloadChats} />
            </Tooltip>
          </div>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              value={errUrl}
              onChange={(e) => setErrUrl(e.target.value)}
              onBlur={() => void persistError({ enabled: errEnabled, larkWebhookUrl: errUrl.trim(), chatId: errChat }, true)}
              disabled={!errEnabled}
              placeholder={tr('chat.orWebhookUrl', 'hoặc Lark bot webhook URL (…/bot/v2/hook/…)')}
              style={{ background: V.surfaceAlt }}
            />
            <Button type="primary" loading={errSaving} onClick={saveErrorReport}>
              {tr('chat.save', 'Lưu')}
            </Button>
          </Space.Compact>
          <div>
            <Button
              icon={<SendOutlined />}
              loading={testingErr}
              disabled={!errEnabled || (!errUrl.trim() && !errChat)}
              onClick={() => testErr(errUrl, errChat)}
            >
              {tr('chat.sendTestMsg', 'Gửi tin test')}
            </Button>
            <span style={{ fontSize: 11, color: V.textFaint, marginLeft: 8 }}>
              {tr('chat.sendTestDesc', 'Gửi 1 card test vào nhóm/webhook đang chọn để kiểm tra kết nối.')}
            </span>
          </div>
        </Space>
        )}
      </Card>

      {/* Jobs list */}
      {connectorJobs.length === 0 ? (
        <Card style={{ background: V.surface }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={tr('chat.noConnectorJobs', 'Chưa có job connector nào. Tạo ở trên, hoặc job đã tạo trên web sẽ hiện ở đây.')}
          />
        </Card>
      ) : (
        <Card size="small" style={{ background: V.surface }} styles={{ body: { padding: 12 } }}>
          <Space wrap style={{ marginBottom: 12 }} size={8}>
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: V.textFaint }} />}
              placeholder={tr('chat.searchByJobName', 'Tìm theo tên job…')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 240 }}
            />
            <Select
              allowClear
              placeholder={tr('chat.filterByBase', 'Lọc theo Base')}
              style={{ minWidth: 220 }}
              value={baseFilter}
              onChange={(v) => setBaseFilter(v)}
              options={baseOptions}
              notFoundContent={tr('chat.noBaseShort', 'Không có Base')}
            />
            <span style={{ color: V.textFaint, fontSize: 12 }}>
              {filteredJobs.length}/{connectorJobs.length} job
            </span>
            <Tooltip title={tr('chat.runAllTip', 'Gọi đồng bộ lần lượt cho tất cả job đang hiển thị')}>
              <Button
                size="small"
                icon={<PlayCircleOutlined />}
                loading={bulkBusy}
                disabled={!filteredJobs.length}
                onClick={() => bulkRun(filteredJobs.map((j) => String(j._id || j.id)), true)}
              >
                {tr('chat.runTestAll', 'Chạy test tất cả')}
              </Button>
            </Tooltip>
            {bulkRunProgress && (
              <Text style={{ fontSize: 12, color: '#2F80ED' }}>
                {tr('chat.runningWord', 'Đang chạy')} {bulkRunProgress.done + 1}/{bulkRunProgress.total}: {bulkRunProgress.name}…
              </Text>
            )}
            {selectedKeys.length > 0 && (
              <Space size={6} style={{ paddingLeft: 8, marginLeft: 4, borderLeft: `1px solid ${V.border}` }}>
                <Text style={{ fontSize: 12, color: V.textSub }}>{tr('chat.selectedWord', 'Đã chọn')} {selectedKeys.length}</Text>
                <Button size="small" type="primary" loading={bulkBusy} onClick={() => bulkSetEnabled(true)}>
                  {tr('chat.enableWord', 'Bật')}
                </Button>
                <Button size="small" danger loading={bulkBusy} onClick={() => bulkSetEnabled(false)}>
                  {tr('chat.disableWord', 'Tắt')}
                </Button>
                <Button size="small" icon={<EditOutlined />} disabled={bulkBusy} onClick={() => setBulkCfgOpen(true)}>
                  {tr('chat.configWord', 'Cấu hình')}
                </Button>
                <Button size="small" icon={<PlayCircleOutlined />} loading={bulkBusy} onClick={() => bulkRun([...selectedKeys], false)}>
                  {tr('chat.runTest', 'Chạy test')}
                </Button>
                <Button size="small" type="text" disabled={bulkBusy} onClick={() => setSelectedKeys([])}>
                  {tr('chat.deselect', 'Bỏ chọn')}
                </Button>
              </Space>
            )}
          </Space>
          <Table
            rowKey={(job) => String(job._id || job.id)}
            rowSelection={{
              selectedRowKeys: selectedKeys,
              onChange: (keys) => setSelectedKeys(keys.map(String)),
              selections: [Table.SELECTION_ALL, Table.SELECTION_INVERT, Table.SELECTION_NONE],
              getCheckboxProps: () => ({ disabled: bulkBusy }),
            }}
            columns={columns}
            dataSource={filteredJobs}
            size="small"
            pagination={{ pageSize: 10, hideOnSinglePage: true, showSizeChanger: false, showTotal: (t) => `${t} job` }}
            scroll={{ x: 'max-content' }}
            locale={{ emptyText: tr('chat.noJobsMatchFilter', 'Không có job khớp bộ lọc.') }}
          />
        </Card>
      )}

      <Modal
        open={!!editJob}
        onCancel={() => setEditJob(null)}
        onOk={saveEditTables}
        okText={tr('chat.save', 'Lưu')}
        cancelText={tr('chat.cancel', 'Huỷ')}
        confirmLoading={editSaving}
        title={`${tr('chat.editSyncTables', 'Sửa bảng đồng bộ')} — ${editJob?.name ?? ''}`}
      >
        <Paragraph style={{ color: V.textSub, fontSize: 13 }}>
          {tr('chat.editTablesDesc', 'Chọn các bảng trong Base này sẽ được đồng bộ (job sẽ lặp qua từng bảng). Lưu cũng đồng thời làm mới session.')}
        </Paragraph>
        <Select
          mode="multiple"
          style={{ width: '100%' }}
          placeholder={tr('chat.selectTable', 'Chọn bảng')}
          value={editSel}
          onChange={setEditSel}
          maxTagCount="responsive"
          options={editTables.map((t) => ({ label: t.name, value: t.tableId }))}
          notFoundContent={editTables.length === 0 ? tr('chat.loadingTables', 'Đang tải bảng… (cần kết nối được Base)') : undefined}
        />
      </Modal>

      {/* Config modal — mirrors the web /sync/bitable Edit form (name, interval, auto-schedule) */}
      <Modal
        open={!!cfgJob}
        onCancel={() => setCfgJob(null)}
        onOk={saveConfig}
        okText={tr('chat.save', 'Lưu')}
        cancelText={tr('chat.cancel', 'Huỷ')}
        confirmLoading={cfgSaving}
        title={`${tr('chat.configWord', 'Cấu hình')} — ${cfgJob?.name ?? ''}`}
        destroyOnClose
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <div>
            <div style={{ fontSize: 12, color: V.textSub, marginBottom: 4 }}>{tr('chat.jobNameCol', 'Tên job')}</div>
            <Input value={cfgName} onChange={(e) => setCfgName(e.target.value)} placeholder={tr('chat.jobNameCol', 'Tên job')} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: V.textSub, marginBottom: 4 }}>{tr('chat.syncFreqSec', 'Tần suất đồng bộ (giây)')}</div>
            <InputNumber
              min={10}
              max={86400}
              value={cfgInterval}
              onChange={(v) => setCfgInterval(Number(v) || 60)}
              style={{ width: '100%' }}
            />
            <div style={{ fontSize: 11, color: V.textFaint, marginTop: 2 }}>{tr('chat.minFreqHint', 'Tối thiểu 10 giây. Khuyến nghị 60 (1 phút).')}</div>
          </div>

          <Divider plain style={{ margin: '2px 0' }}>
            <span style={{ fontSize: 12, color: V.textSub }}>{tr('chat.autoSchedule', 'Lịch tự động')}</span>
          </Divider>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Switch checked={cfg247} onChange={setCfg247} checkedChildren="24/7" unCheckedChildren={tr('chat.byScheduleSwitch', 'Theo lịch')} />
            <span style={{ fontSize: 12, color: V.textSub }}>
              {cfg247 ? tr('chat.run247', 'Chạy liên tục, bỏ qua giờ/ngày.') : tr('chat.runScheduled', 'Chỉ chạy trong giờ + ngày đã chọn.')}
            </span>
          </div>

          {!cfg247 && (
            <>
              <Space wrap size={12}>
                <div>
                  <div style={{ fontSize: 12, color: V.textSub, marginBottom: 4 }}>{tr('chat.startHour', 'Giờ bắt đầu')}</div>
                  <Select value={cfgStart} onChange={setCfgStart} style={{ width: 120 }} options={HOUR_OPTS} />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: V.textSub, marginBottom: 4 }}>{tr('chat.endHour', 'Giờ kết thúc')}</div>
                  <Select value={cfgEnd} onChange={setCfgEnd} style={{ width: 120 }} options={HOUR_OPTS_END} />
                </div>
              </Space>
              <div>
                <div style={{ fontSize: 12, color: V.textSub, marginBottom: 6 }}>{tr('chat.activeDaysShort', 'Ngày hoạt động')}</div>
                <Checkbox.Group value={cfgDays} onChange={(v) => setCfgDays(v as number[])} options={dayOptsT} />
              </div>
            </>
          )}

          <Divider plain style={{ margin: '2px 0' }}>
            <span style={{ fontSize: 12, color: V.textSub }}>{tr('chat.errNotifyForJob', 'Báo lỗi (Lark) cho job này')}</span>
          </Divider>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Switch checked={cfgErrEnabled} onChange={setCfgErrEnabled} checkedChildren={tr('chat.enabledLower', 'bật')} unCheckedChildren={tr('chat.off', 'tắt')} />
            <span style={{ fontSize: 12, color: V.textSub }}>{tr('chat.errNotifyJobDesc', 'Khi job này lỗi → gửi card vào Lark (chọn nhóm hoặc webhook)')}</span>
          </div>
          {cfgErrEnabled && (
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                style={{ width: '100%' }}
                placeholder={larkChats.length ? tr('chat.selectLarkGroup', 'Chọn nhóm Lark (bot đang ở trong)') : tr('chat.noGroupAddBot', 'Không có nhóm — thêm bot vào nhóm trước')}
                value={cfgErrChat || undefined}
                onChange={(v) => setCfgErrChat(v || '')}
                options={chatOptionsWith(cfgErrChat)}
                notFoundContent={tr('chat.botNoGroup', 'Bot chưa ở trong nhóm nào')}
              />
              <Input
                value={cfgErrUrl}
                onChange={(e) => setCfgErrUrl(e.target.value)}
                placeholder={tr('chat.orWebhookUrl', 'hoặc Lark bot webhook URL (…/bot/v2/hook/…)')}
              />
              <Button
                size="small"
                icon={<SendOutlined />}
                loading={testingErr}
                disabled={!cfgErrUrl.trim() && !cfgErrChat}
                onClick={() => testErr(cfgErrUrl, cfgErrChat)}
              >
                {tr('chat.sendTestMsg', 'Gửi tin test')}
              </Button>
            </Space>
          )}
        </Space>
      </Modal>

      {/* Bulk config — apply chosen sections to every selected job */}
      <Modal
        open={bulkCfgOpen}
        onCancel={() => setBulkCfgOpen(false)}
        onOk={applyBulkConfig}
        okText={`${tr('chat.appliedTo', 'Áp dụng cho')} ${selectedKeys.length} job`}
        okButtonProps={{ disabled: !selectedKeys.length }}
        cancelText={tr('chat.cancel', 'Huỷ')}
        confirmLoading={bcSaving}
        title={tr('chat.bulkConfig', 'Cấu hình hàng loạt')}
        destroyOnClose
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Alert
            type="warning"
            showIcon
            message={tr('chat.bulkCfgWarn', 'Chỉ các mục được TICK mới ghi đè; mục không tick giữ nguyên.')}
            description={tr('chat.bulkCfgDesc', 'Job CMS dùng CHUNG một máy chủ — thay đổi áp dụng cho MỌI tài khoản thấy màn này.')}
            style={{ fontSize: 12 }}
          />
          <div>
            <Checkbox checked={bcApplyInterval} onChange={(e) => setBcApplyInterval(e.target.checked)}>
              <span style={{ fontWeight: 600 }}>{tr('chat.syncFreqSec', 'Tần suất đồng bộ (giây)')}</span>
            </Checkbox>
            <InputNumber
              min={10}
              max={86400}
              value={bcInterval}
              disabled={!bcApplyInterval}
              onChange={(v) => setBcInterval(Number(v) || 60)}
              style={{ width: '100%', marginTop: 6 }}
            />
          </div>
          <div>
            <Checkbox checked={bcApplySchedule} onChange={(e) => setBcApplySchedule(e.target.checked)}>
              <span style={{ fontWeight: 600 }}>{tr('chat.autoSchedule', 'Lịch tự động')}</span>
            </Checkbox>
            {bcApplySchedule && (
              <Space direction="vertical" size={10} style={{ width: '100%', marginTop: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Switch checked={bc247} onChange={setBc247} checkedChildren="24/7" unCheckedChildren={tr('chat.byScheduleSwitch', 'Theo lịch')} />
                  <span style={{ fontSize: 12, color: V.textSub }}>
                    {bc247 ? tr('chat.run247', 'Chạy liên tục, bỏ qua giờ/ngày.') : tr('chat.runScheduled', 'Chỉ chạy trong giờ + ngày đã chọn.')}
                  </span>
                </div>
                {!bc247 && (
                  <>
                    <Space wrap size={12}>
                      <div>
                        <div style={{ fontSize: 12, color: V.textSub, marginBottom: 4 }}>{tr('chat.startHour', 'Giờ bắt đầu')}</div>
                        <Select value={bcStart} onChange={setBcStart} style={{ width: 120 }} options={HOUR_OPTS} />
                      </div>
                      <div>
                        <div style={{ fontSize: 12, color: V.textSub, marginBottom: 4 }}>{tr('chat.endHour', 'Giờ kết thúc')}</div>
                        <Select value={bcEnd} onChange={setBcEnd} style={{ width: 120 }} options={HOUR_OPTS_END} />
                      </div>
                    </Space>
                    <div>
                      <div style={{ fontSize: 12, color: V.textSub, marginBottom: 6 }}>{tr('chat.activeDaysShort', 'Ngày hoạt động')}</div>
                      <Checkbox.Group value={bcDays} onChange={(v) => setBcDays(v as number[])} options={dayOptsT} />
                    </div>
                  </>
                )}
              </Space>
            )}
          </div>
          <div>
            <Checkbox checked={bcApplyNotify} onChange={(e) => setBcApplyNotify(e.target.checked)}>
              <span style={{ fontWeight: 600 }}>{tr('chat.errNotifyForJobBulk', 'Báo lỗi (Lark) cho job')}</span>
            </Checkbox>
            {bcApplyNotify && (
              <Space direction="vertical" size={6} style={{ width: '100%', marginTop: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Switch checked={bcErrEnabled} onChange={setBcErrEnabled} checkedChildren={tr('chat.enabledLower', 'bật')} unCheckedChildren={tr('chat.off', 'tắt')} />
                  <span style={{ fontSize: 12, color: V.textSub }}>{tr('chat.errNotifyBulkDesc', 'Khi job lỗi → gửi card vào Lark')}</span>
                </div>
                {bcErrEnabled && (
                  <>
                    <Select
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      style={{ width: '100%' }}
                      placeholder={larkChats.length ? tr('chat.selectLarkGroup', 'Chọn nhóm Lark (bot đang ở trong)') : tr('chat.noGroupAddBot', 'Không có nhóm — thêm bot vào nhóm trước')}
                      value={bcErrChat || undefined}
                      onChange={(v) => setBcErrChat(v || '')}
                      options={chatOptionsWith(bcErrChat)}
                      notFoundContent={tr('chat.botNoGroup', 'Bot chưa ở trong nhóm nào')}
                    />
                    <Input value={bcErrUrl} onChange={(e) => setBcErrUrl(e.target.value)} placeholder={tr('chat.orWebhookUrl', 'hoặc Lark bot webhook URL (…/bot/v2/hook/…)')} />
                  </>
                )}
              </Space>
            )}
          </div>
        </Space>
      </Modal>

      {/* Create a new Lark group (bot as owner + you) to receive error reports */}
      <Modal
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={createChat}
        okText={tr('chat.createGroup', 'Tạo nhóm')}
        cancelText={tr('chat.cancel', 'Huỷ')}
        confirmLoading={creatingChat}
        title={tr('chat.createNewLarkGroup', 'Tạo nhóm Lark mới')}
        destroyOnClose
      >
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <div style={{ fontSize: 12, color: V.textSub }}>{tr('chat.groupName', 'Tên nhóm')}</div>
          <Input
            value={newChatName}
            onChange={(e) => setNewChatName(e.target.value)}
            placeholder={tr('chat.groupNamePlaceholder', 'vd: Báo lỗi Bitable CMS')}
            onPressEnter={createChat}
            autoFocus
          />
          <div style={{ fontSize: 11, color: V.textFaint }}>
            {tr('chat.newGroupDesc', 'Nhóm mới sẽ có bot Larkwave (để gửi báo lỗi) và tài khoản Lark của bạn (để bạn xem). Tạo xong tự chọn làm nơi nhận báo lỗi tổng.')}
          </div>
        </Space>
      </Modal>
    </Space>
  );
}
