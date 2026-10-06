'use client';
import type { ReactNode } from 'react';
import { Select, Tooltip } from 'antd';
import { BulbOutlined, ThunderboltOutlined, MessageOutlined, RocketOutlined } from '@ant-design/icons';
import type { AppMode } from '@larkwave/core';

const MODES: { value: AppMode; label: string; icon: ReactNode; hint: string }[] = [
  { value: 'plan', label: 'Lên kế hoạch', icon: <BulbOutlined />, hint: 'Đọc & đề xuất — chưa sửa file' },
  { value: 'ask', label: 'Giải thích & sửa', icon: <MessageOutlined />, hint: 'Giải thích rồi áp dụng thay đổi' },
  { value: 'build', label: 'Tự sửa', icon: <ThunderboltOutlined />, hint: 'Tự áp dụng sửa file (mặc định)' },
  { value: 'auto', label: 'Auto', icon: <RocketOutlined />, hint: 'Tự chủ hoàn toàn — nhanh nhất' },
];

/** Compact mode picker for the narrow workspace dock (dropdown instead of wide Segmented). */
export function WorkspaceModeSelect({ value, onChange }: { value: AppMode; onChange: (m: AppMode) => void }) {
  const cur = MODES.find((m) => m.value === value) ?? MODES[2];
  return (
    <Tooltip title={cur.hint}>
      <Select
        size="small"
        style={{ width: '100%' }}
        value={value}
        onChange={onChange}
        options={MODES.map((m) => ({
          value: m.value,
          label: (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {m.icon} {m.label}
            </span>
          ),
        }))}
      />
    </Tooltip>
  );
}