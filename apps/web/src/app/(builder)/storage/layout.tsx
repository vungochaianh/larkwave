import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Dung lượng lưu trữ",
  description: "Xem dữ liệu bạn đang lưu trên Larkwave và dọn thứ không còn cần.",
  // Trang cá nhân sau đăng nhập — không có nội dung để xếp hạng, và không nên vào chỉ mục.
  robots: { index: false, follow: false },
};

export default function StorageLayout({ children }: { children: ReactNode }) {
  return children;
}
