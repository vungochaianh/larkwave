"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Spin } from "antd";
import { createRelayRuntime, createHostedRuntime } from "@/lib/relayRuntime";
import { RemoteChatShell } from "@/components/RemoteChatShell";
import { useDesktopOnline } from "@/lib/useDesktopOnline";
import { apiFetch } from "@/lib/api";

const OFFLINE_MSG =
  "Máy tính chưa online — hãy mở app Larkwave trên máy (đăng nhập cùng tài khoản), rồi thử lại. Trợ lý AI cần máy tính bật khi máy chủ chưa bật chế độ hosted.";

/** AgentChat is a browser-only, storage-driven component (localStorage/IndexedDB history + server
 *  sync) — load it client-side only (matches the Monaco pattern) so `next build` never SSRs it. */
const AgentChat = dynamic(() => import("@larkwave/ui").then((m) => m.AgentChat), {
  ssr: false,
  loading: () => (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 240 }}>
      <Spin />
    </div>
  ),
});

/**
 * "Trợ lý AI" — the shared ChatGPT/Claude-style chatbot surface. Runs HOSTED by default (turns
 * execute SERVER-SIDE on Larkwave's hosted Claude / MAIC — no desktop needed, metered against the
 * user's monthly % plan); degrades to the desktop-relay path if the server has no hosted assistant.
 *
 * Reused by BOTH the standalone /assistant page and the /agents-chat workspace. The `embedded` +
 * `initialConversationId` props let the /agents-chat rail drive it (hide AgentChat's own sidebar and
 * open a deep-linked conversation).
 */
export default function AssistantChat({
  embedded,
  initialConversationId,
  initialPrompt,
}: {
  embedded?: boolean;
  initialConversationId?: string;
  /** Câu đổ sẵn vào ô soạn cho cuộc trò chuyện mới — xem ghi chú ở AgentChat. */
  initialPrompt?: string;
} = {}) {
  // Default to the relay runtime so the chat renders IMMEDIATELY — never block the whole page on the
  // status fetch. Upgrade to hosted (server-side MAIC) only once maicStatus() confirms enabled:true.
  const [hosted, setHosted] = useState<boolean>(false);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const delays = [1500, 3000, 6000, 10000]; // backoff while the API is down (deploy)
    let attempt = 0;

    const load = () => {
      const controller = new AbortController();
      const abortTimer = setTimeout(() => controller.abort(), 5000);
      apiFetch<{ enabled: boolean }>("/agent/maic/status", { signal: controller.signal })
        .then((r) => {
          if (!alive) return;
          setHosted(!!r.enabled);
        })
        .catch(() => {
          if (!alive) return;
          if (attempt < delays.length) {
            timer = setTimeout(load, delays[attempt]);
            attempt += 1;
          }
        })
        .finally(() => clearTimeout(abortTimer));
    };
    load();

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const runtime = useMemo(() => (hosted ? createHostedRuntime() : createRelayRuntime()), [hosted]);
  const { online, checked } = useDesktopOnline();
  const blocked = hosted ? null : checked && !online ? OFFLINE_MSG : null;

  return (
    <RemoteChatShell runtime={runtime} fill={embedded}>
      <AgentChat blocked={blocked} fill embedded={embedded} initialConversationId={initialConversationId} initialPrompt={initialPrompt} />
    </RemoteChatShell>
  );
}
