"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AssistantChat from "@/components/AssistantChat";
import AgentsChatLauncher from "@/components/AgentsChatLauncher";

/**
 * The "Chat" surface of the /agents-chat workspace. Reads the conversation deep link from the URL:
 *   - `?c=<id>` opens that saved conversation
 *   - `?n=<nonce>` (New chat) forces a fresh conversation
 * The `key` remounts AssistantChat on either change so AgentChat's mount effect opens the right one.
 */
function AgentsChatChatInner() {
  const sp = useSearchParams();
  const c = sp.get("c") || "";
  const n = sp.get("n") || "";
  // `q` — câu do màn /agents-chat/new chuyền sang, ĐỔ SẴN vào ô soạn chứ không tự gửi.
  // Bỏ qua `q` khi đang mở một hội thoại cũ (`c`): chen chữ vào ô soạn của một cuộc đang dở là
  // ghi đè lên thứ người dùng có thể đang gõ.
  const q = sp.get("q") || "";

  // Đường dẫn trần, không ?c= cũng không ?n= → hiện màn mở đầu, ĐÚNG màn mà /agents-chat/new hiện.
  // Người gõ tay địa chỉ không nên thấy một giao diện khác người bấm nút chỉ vì thiếu "/new".
  if (!c && !n) return <AgentsChatLauncher />;

  const key = c ? `c:${c}` : `n:${n || "0"}`;
  return (
    <AssistantChat
      key={key}
      embedded
      initialConversationId={c || undefined}
      initialPrompt={c ? undefined : q || undefined}
    />
  );
}

export default function AgentsChatChatPage() {
  return (
    <Suspense fallback={null}>
      <AgentsChatChatInner />
    </Suspense>
  );
}
