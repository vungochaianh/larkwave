'use client';
import { useEffect, useState } from 'react';
import { Select, Tooltip, Typography } from 'antd';
import type { RunnerStatusInfo } from '@larkwave/core';
import { useRuntime } from '../RuntimeProvider';
import { desktopRunnerPrefs, setDesktopRunnerPrefs } from '../runnerPrefs';
import { useI18n } from '../i18n';

const { Text } = Typography;

/** Compact runner + model picker — shared by Composer and workspace dock. */
export function RunnerModelPicker({
  compact,
  onChange,
  storageKeyRunner = 'tw_runner',
  storageKeyModel = 'tw_runner_model',
  initialRunner,
  initialModel,
}: {
  /** Narrow layout: stack vertically. */
  compact?: boolean;
  onChange?: (runner: string, model?: string) => void;
  storageKeyRunner?: string;
  storageKeyModel?: string;
  /** Sync picker when parent loads persisted prefs (e.g. bot config). */
  initialRunner?: string;
  initialModel?: string;
}) {
  const runtime = useRuntime();
  const { t } = useI18n();
  const [runners, setRunners] = useState<RunnerStatusInfo[]>([]);
  const readPrefs = () => {
    if (typeof window === 'undefined') return { runner: 'claude', model: '' };
    return {
      runner: localStorage.getItem(storageKeyRunner) || 'claude',
      model: localStorage.getItem(storageKeyModel) || '',
    };
  };
  const prefs = readPrefs();
  const [runnerId, setRunnerId] = useState(prefs.runner);
  const [runnerModel, setRunnerModel] = useState(prefs.model);

  useEffect(() => {
    if (!runtime.runners) return;
    let alive = true;
    runtime.runners
      .list()
      .then((list) => alive && setRunners(list))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [runtime]);

  useEffect(() => {
    if (!initialRunner) return;
    setRunnerId(initialRunner);
    if (typeof window !== 'undefined') localStorage.setItem(storageKeyRunner, initialRunner);
  }, [initialRunner, storageKeyRunner]);

  useEffect(() => {
    if (initialModel === undefined) return;
    setRunnerModel(initialModel);
    if (typeof window !== 'undefined') {
      if (initialModel) localStorage.setItem(storageKeyModel, initialModel);
      else localStorage.removeItem(storageKeyModel);
    }
  }, [initialModel, storageKeyModel]);

  const active = runners.find((r) => r.id === runnerId);
  const models = active?.models ?? [];
  const modelVal = runnerModel || models[0]?.id || '';

  const pickRunner = (id: string) => {
    setRunnerId(id);
    const r = runners.find((x) => x.id === id);
    const first = r?.models[0]?.id ?? '';
    setRunnerModel(first);
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKeyRunner, id);
      if (first) localStorage.setItem(storageKeyModel, first);
      else localStorage.removeItem(storageKeyModel);
    }
    if (storageKeyRunner === 'tw_runner') setDesktopRunnerPrefs(id, first || undefined);
    onChange?.(id, first || undefined);
  };

  const pickModel = (m: string) => {
    setRunnerModel(m);
    if (typeof window !== 'undefined') localStorage.setItem(storageKeyModel, m);
    if (storageKeyRunner === 'tw_runner') setDesktopRunnerPrefs(runnerId, m);
    onChange?.(runnerId, m);
  };

  if (!runtime.runners || runners.length === 0) return null;

  const runnerOpts = runners.map((r) => ({
    value: r.id,
    label: r.ready
      ? r.label
      : r.installed
        ? `${r.label} ${t('ui.runnerPicker.missingKey', '· thiếu key')}`
        : `${r.label} ${t('ui.runnerPicker.notInstalledShort', '· chưa cài')}`,
    disabled: !r.installed,
  }));

  /**
   * CLI ĐÃ CŨ — phải nói ra, vì nó không tự lộ.
   *
   * Model chọn bằng BÍ DANH (`opus`, `fable`), và bí danh chỉ trỏ tới model mới khi CLI đủ mới.
   * Máy cài CLI cũ vẫn chạy bình thường, không lỗi, chỉ là chạy model đời trước — và người dùng
   * không có cách nào biết, ngoài việc thấy kết quả kém hơn máy bên cạnh.
   */
  const stale = !!(active?.installed && active.outdated && active.latestVersion);
  const warn =
    active && !active.installed
      ? `${t('ui.runnerPicker.notInstalled', 'Chưa cài')} ${active.label}`
      : active?.installed && !active.ready
        ? `${active.label} ${t('ui.runnerPicker.needsLogin', 'cần đăng nhập/key')}`
        : stale
          ? `${active!.label} ${t('ui.runnerPicker.outdated', 'đã cũ')} (${active!.version} → ${active!.latestVersion}) — ` +
            t('ui.runnerPicker.outdatedWhy', 'model mới nhất chỉ chạy khi CLI đủ mới. Cập nhật:') +
            ` ${active!.installHint || 'npm i -g @anthropic-ai/claude-code'}`
          : '';

  return (
    <div style={{ display: 'flex', flexDirection: compact ? 'column' : 'row', gap: compact ? 6 : 8, minWidth: 0 }}>
      <Tooltip title={warn || t('ui.runnerPicker.pick', 'Chọn CLI agent')}>
        <Select
          size="small"
          style={{ width: compact ? '100%' : 130, minWidth: 0 }}
          value={runnerId}
          onChange={pickRunner}
          options={runnerOpts}
          popupMatchSelectWidth={220}
        />
      </Tooltip>
      {models.length > 0 && (
        <Select
          size="small"
          style={{ width: compact ? '100%' : 150, minWidth: 0 }}
          value={modelVal}
          onChange={pickModel}
          options={models.map((m) => ({ value: m.id, label: m.label }))}
          popupMatchSelectWidth={240}
        />
      )}
      {warn && (
        <Text type="warning" style={{ fontSize: 11, lineHeight: 1.3 }}>
          {warn}
        </Text>
      )}
    </div>
  );
}