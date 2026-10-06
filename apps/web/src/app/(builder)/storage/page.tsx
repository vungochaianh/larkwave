"use client";

import dynamic from "next/dynamic";

/**
 * Trang "Dung lượng lưu trữ".
 *
 * Đặt trong nhóm (builder) để dùng chung khung điều hướng đã đăng nhập, và ssr:false vì màn hình
 * đọc dữ liệu bằng token trong localStorage — dựng sẵn trên máy chủ chỉ cho ra khung rỗng rồi
 * nháy khi hydrate. Cùng cách /agents-chat/files đang làm.
 */
const StorageScreen = dynamic(() => import("@larkwave/ui").then((m) => m.StorageScreen), {
  ssr: false,
});

export default function StoragePage() {
  return <StorageScreen />;
}
