'use client';
import { useEffect, useState } from 'react';
import { Badge, Button, Tooltip } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import { FIX_ISSUES_EVENT, openFix } from './fixRules';

/** Nút "Kiểm tra" trên thanh đầu: số việc cần sửa (FixCenter đếm) — bấm là mở danh sách, sửa ngay từ đó. */
export function FixBadge() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const on = (e: Event) => setCount(Number((e as CustomEvent<number>).detail) || 0);
    window.addEventListener(FIX_ISSUES_EVENT, on);
    return () => window.removeEventListener(FIX_ISSUES_EVENT, on);
  }, []);
  return (
    <Tooltip title={count ? `${count} việc cần sửa — bấm để sửa ngay` : 'Kiểm tra sẵn sàng (Claude, API key, Zalo, Gmail…)'}>
      <Badge count={count} size="small" offset={[-2, 4]}>
        <Button type="text" aria-label="Kiểm tra sẵn sàng" icon={<SafetyCertificateOutlined />} onClick={() => openFix('checklist')} />
      </Badge>
    </Tooltip>
  );
}
