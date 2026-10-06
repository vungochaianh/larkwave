"use client";

import dynamic from "next/dynamic";

/**
 * "Tệp đã tải lên" trong không gian /agents-chat.
 *
 * ssr:false vì màn hình đọc dữ liệu bằng token trong localStorage — dựng sẵn trên máy chủ chỉ
 * cho ra một khung rỗng rồi nháy khi hydrate. Cùng cách mà AssistantChat đang làm.
 */
const UploadsScreen = dynamic(() => import("@larkwave/ui").then((m) => m.UploadsScreen), {
  ssr: false,
});

export default function AgentsChatFiles() {
  return <UploadsScreen />;
}
