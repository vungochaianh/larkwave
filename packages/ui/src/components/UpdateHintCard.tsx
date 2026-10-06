'use client';

import { useState, type ReactElement } from 'react';
import { Button, Tag } from 'antd';
import { DownloadOutlined, CloseOutlined } from '@ant-design/icons';
import { useRuntime } from '../RuntimeProvider';
import { V } from '../theme';
import { useUpdateStatus } from '../useUpdateStatus';

const DOWNLOAD_PAGE = 'https://toolswave.net/download';
/** Vạch màu cảnh báo bên trái thẻ. */
const WARN = '#F5A524';

/**
 * "Bản cài đang dùng đã cũ" — hiện THẲNG trong khung chat, ngay dưới một công cụ vừa hỏng.
 *
 * Vì sao không chỉ dựa vào trợ lý kể lại: ghi chú phiên bản được gắn vào kết quả tool cho model
 * đọc, nhưng model có thể lờ đi, tóm tắt sai, hoặc chọn không nhắc. Đây là thứ CHẮC CHẮN hiện ra.
 * Ngược lại nó cũng phải biết im: chỉ hiện khi thật sự có bản cài mới hơn mang thay đổi phần LÕI
 * (thứ code-push không với tới), và bỏ qua được.
 *
 * `visible` để nơi gọi quyết định thời điểm (thường là: đã có ít nhất một công cụ hỏng trong
 * cuộc trò chuyện này) — thẻ này không tự dựng chính sách đó.
 */
export function UpdateHintCard({ visible }: { visible: boolean }): ReactElement | null {
  const runtime = useRuntime();
  const { needsReinstall, nativeVersion, latest, notice } = useUpdateStatus();
  const [dismissed, setDismissed] = useState(false);

  if (!visible || !needsReinstall || dismissed) return null;

  const open = (): void => {
    if (runtime.openExternal) void runtime.openExternal(DOWNLOAD_PAGE);
    else window.open(DOWNLOAD_PAGE, '_blank');
  };

  return (
    <div
      style={{
        border: `1px solid ${V.border}`,
        borderLeft: `3px solid ${WARN}`,
        background: V.surfaceAlt,
        borderRadius: 10,
        padding: '10px 12px',
        fontSize: 12.5,
        color: V.textSub,
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ marginBottom: 4 }}>
          <Tag color="warning" style={{ marginInlineEnd: 6 }}>
            Có bản cài mới{latest ? ` (v${latest})` : ''}
          </Tag>
          <span>
            Vừa có công cụ chạy lỗi. Bản cài trên máy{nativeVersion ? ` (v${nativeVersion})` : ''} đã cũ và bản
            mới có sửa phần lõi — lỗi này <b>có thể</b> đã được sửa ở đó. Phần lõi không tự cập nhật được, phải
            tải lại bộ cài.
          </span>
        </div>
        {notice ? <div style={{ color: V.textFaint, marginBottom: 6 }}>{notice}</div> : null}
        <Button size="small" type="primary" icon={<DownloadOutlined />} onClick={open}>
          Tải bản cài mới
        </Button>
      </div>
      <Button
        size="small"
        type="text"
        icon={<CloseOutlined />}
        title="Ẩn"
        onClick={() => setDismissed(true)}
        style={{ color: V.textFaint }}
      />
    </div>
  );
}
