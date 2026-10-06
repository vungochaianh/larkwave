import type { ReactNode } from "react";

/**
 * Khung rỗng. Toàn bộ metadata + dữ liệu có cấu trúc đã chuyển sang `app/page.tsx`, vì chúng phải
 * nằm cùng URL mà chúng mô tả — để lại đây thì chúng mô tả một trang chỉ còn làm mỗi việc chuyển
 * hướng đi nơi khác.
 *
 * Giữ FILE lại thay vì xoá: deploy dùng rsync KHÔNG có `--delete`, nên file xoá ở đây vẫn nằm lại
 * trên máy chủ và bản cũ đó sẽ tiếp tục chạy.
 */
export default function WelcomeLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
