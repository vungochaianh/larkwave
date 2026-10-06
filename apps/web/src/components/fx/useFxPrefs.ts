"use client";

import { useEffect, useState } from "react";

/**
 * Theo dõi một media query và trả về kết quả hiện tại.
 *
 * Giá trị khởi tạo LUÔN là `false` ở cả server lẫn lần render đầu trên client — cố ý, để HTML
 * hydrate khớp nhau. Hệ quả: hiệu ứng theo chuột chỉ được gắn SAU khi mount, tức là trang tĩnh
 * trước rồi mới "sống" — đúng thứ tự ta muốn, vì nội dung hiện được trước hiệu ứng.
 */
function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setMatches(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [query]);
  return matches;
}

/**
 * Người dùng bật "giảm chuyển động" ở hệ điều hành. Có người thật sự chóng mặt vì parallax,
 * nên mọi hiệu ứng trong bộ fx phải coi cờ này là lệnh tắt hẳn, không phải "làm nhẹ đi".
 * Phần CSS cũng tự gác bằng `@media (prefers-reduced-motion)` cho khung hình đầu tiên (trước
 * khi hook này kịp chạy); hook chỉ cần cho phần JS/rAF.
 */
export function useReducedMotion(): boolean {
  return useMedia("(prefers-reduced-motion: reduce)");
}

/**
 * Thiết bị có con trỏ "thật" (chuột/trackpad) — tức là hover có ý nghĩa. Trên màn cảm ứng
 * hover-effect kẹt lại ở trạng thái cuối cùng sau lần chạm và trông như lỗi, nên mọi hiệu ứng
 * theo chuột chỉ được gắn khi cờ này đúng. `pointer: fine` loại luôn bút/màn hình có chuột ảo.
 */
export function useFinePointer(): boolean {
  return useMedia("(hover: hover) and (pointer: fine)");
}
