'use client';
import type { ReactNode } from 'react';
import { Segmented, Tooltip } from 'antd';
import { BulbOutlined, ThunderboltOutlined, MessageOutlined, RocketOutlined } from '@ant-design/icons';
import type { AppMode } from '@larkwave/core';
import { useI18n } from '../i18n';

const MODES: { value: AppMode; label: string; icon: ReactNode; hint: string }[] = [
  {
    value: 'plan',
    label: 'Lên kế hoạch',
    icon: <BulbOutlined />,
    hint: 'AI đọc & đề xuất kế hoạch trước, chưa sửa gì (Claude plan mode).',
  },
  {
    value: 'ask',
    label: 'Giải thích & sửa',
    icon: <MessageOutlined />,
    hint: 'Claude giải thích rồi tự áp dụng thay đổi. Bản desktop chạy nền nên không hỏi popup giữa chừng — muốn xem trước mà chưa đụng file thì chọn "Lên kế hoạch".',
  },
  {
    value: 'build',
    label: 'Tự sửa',
    icon: <ThunderboltOutlined />,
    hint: 'Tự áp dụng các thay đổi file (Claude acceptEdits — edit automatically).',
  },
  {
    value: 'auto',
    label: 'Auto',
    icon: <RocketOutlined />,
    hint: 'Tự chủ hoàn toàn — tự sửa file & chạy lệnh để kiểm thử, không hỏi gì (Claude bypassPermissions). Nhanh nhất, ít kiểm soát hơn.',
  },
];

/**
 * The recognizable GUI replacement for Claude Code's TUI mode cycling.
 * On desktop, the chosen mode maps to `claude --permission-mode <x>`.
 */
export function ModeSelector({
  value,
  onChange,
}: {
  value: AppMode;
  onChange: (m: AppMode) => void;
}) {
  const { t } = useI18n();
  return (
    <Segmented
      value={value}
      onChange={(v) => onChange(v as AppMode)}
      options={MODES.map((m) => ({
        value: m.value,
        label: (
          <Tooltip title={t(`ui.mode.${m.value}.hint`, m.hint)}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {m.icon} {t(`ui.mode.${m.value}.label`, m.label)}
            </span>
          </Tooltip>
        ),
      }))}
    />
  );
}
