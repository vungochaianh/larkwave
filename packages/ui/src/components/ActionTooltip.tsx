'use client';
import { forwardRef, useState, type ReactElement, type ReactNode } from 'react';
import { Tooltip } from 'antd';

/**
 * Tooltip cho NÚT HÀNH ĐỘNG — tự tắt ngay khi bấm.
 *
 * Vì sao cần: con trỏ vẫn nằm trên nút sau cú bấm, nên tooltip của antd cứ đứng nguyên và nổi lên
 * TRÊN hộp xác nhận vừa mở ("Xoá app này?"). Nhãn "Xoá" lơ lửng cạnh nút "Xoá" trong hộp thoại
 * khiến chính người dùng phân vân đang bấm cái nào.
 *
 * Hai điều bắt buộc, thiếu một là hỏng:
 *  1. PHẢI chuyển tiếp mọi prop + ref xuống DOM. `Popconfirm` bọc ngoài sẽ nhân bản con của nó và
 *     gắn `onClick`/`ref` vào đó — thành phần nào nuốt mất là hộp xác nhận KHÔNG BAO GIỜ mở ra
 *     (đúng lỗi bản đầu của file này).
 *  2. Bộ xử lý chuột của riêng ta phải nằm ở lớp TRONG. `Tooltip` cũng nhân bản con và gắn
 *     onMouseEnter/onMouseLeave của nó — đặt cùng chỗ thì handler của ta bị ghi đè.
 */
interface ActionTooltipProps {
  title: ReactNode;
  children: ReactElement;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

export const ActionTooltip = forwardRef<HTMLSpanElement, ActionTooltipProps>(function ActionTooltip(
  props,
  ref,
) {
  // `rest` là những prop do Popconfirm/Dropdown tiêm vào lúc nhân bản (onClick, aria-*, …) —
  // không khai báo trước được, nên tách ra rồi chuyển tiếp nguyên vẹn.
  const { title, children, placement, ...rest } = props as ActionTooltipProps &
    Record<string, unknown>;
  const [suppressed, setSuppressed] = useState(false);
  return (
    <Tooltip title={title} placement={placement} open={suppressed ? false : undefined}>
      {/* Lớp NGOÀI: nơi Popconfirm/Tooltip gắn prop của chúng. */}
      <span {...rest} ref={ref} style={{ display: 'inline-flex' }}>
        {/* Lớp TRONG: handler của ta, không bị ai nhân bản đè lên.
            `onClickCapture` chạy trước handler của nút nên tooltip tắt ngay ở khung hình mở hộp
            xác nhận — không kịp nhấp nháy. */}
        <span
          style={{ display: 'inline-flex' }}
          onClickCapture={() => setSuppressed(true)}
          onMouseLeave={() => setSuppressed(false)}
        >
          {children}
        </span>
      </span>
    </Tooltip>
  );
});
