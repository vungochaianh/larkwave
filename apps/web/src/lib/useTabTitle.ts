"use client";

import { useEffect } from "react";

/**
 * ĐẶT TIÊU ĐỀ TAB CHO CÁC TRANG SAU ĐĂNG NHẬP.
 *
 * Những trang này không khai metadata riêng nên thừa hưởng tiêu đề mặc định của layout gốc — một
 * câu quảng bá tiếng Việt, hiện nguyên như thế kể cả khi người dùng đang để site tiếng Anh, và
 * giống hệt nhau ở mọi trang nên mở mười tab thì cả mười tab không phân biệt nổi.
 *
 * VÌ SAO ĐẶT Ở TRÌNH DUYỆT CHỨ KHÔNG PHẢI MÁY CHỦ. Cách "đúng bài" là cho layout gốc đọc ngôn ngữ
 * rồi sinh metadata — nhưng layout gốc bao TRỌN site, và đọc cookie trong đó sẽ biến **cả 58 trang
 * đang dựng sẵn thành dựng lại theo từng lượt truy cập**, kể cả những trang công khai không liên
 * quan. Cái giá đó không đáng, vì các trang ở đây nằm sau đăng nhập: máy tìm kiếm không vào được
 * (proxy trả 307 về /login), nên tiêu đề của chúng chỉ phục vụ mắt người.
 *
 * Nhãn truyền vào lấy từ chính mục điều hướng đang mở, thứ mỗi vỏ đã tự tính sẵn để vẽ tiêu đề
 * trên màn hình — nên không có bản đồ route→nhãn thứ hai để trôi lệch.
 */
export function useTabTitle(label: string | undefined | null): void {
  useEffect(() => {
    const s = (label ?? "").trim();
    // Không nối "· Larkwave" khi nhãn đã là "Larkwave" — tránh "Larkwave · Larkwave".
    document.title = !s || s === "Larkwave" ? "Larkwave" : `${s} · Larkwave`;
  }, [label]);
}

/**
 * Nhãn của mục điều hướng khớp `pathname` sâu nhất.
 *
 * Khớp sâu nhất chứ không phải khớp đầu tiên: `/marketing/video/library` phải ra "Thư viện", mà
 * `/marketing/video` cũng là tiền tố hợp lệ của nó.
 */
export function nhanTheoDuongDan(
  pathname: string,
  muc: { key: string; label: string }[],
): string | undefined {
  let tot: { key: string; label: string } | undefined;
  for (const m of muc) {
    if (!m.key.startsWith("/")) continue;
    if (pathname === m.key || pathname.startsWith(`${m.key}/`)) {
      if (!tot || m.key.length > tot.key.length) tot = m;
    }
  }
  return tot?.label;
}
