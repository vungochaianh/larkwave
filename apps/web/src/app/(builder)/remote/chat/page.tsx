"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Spin } from "antd";
import { createRelayRuntime, createHostedRuntime } from "@/lib/relayRuntime";
import { RemoteChatShell } from "@/components/RemoteChatShell";
import { useDesktopOnline } from "@/lib/useDesktopOnline";
import { api } from "@/lib/api";
import { useI18n } from "@larkwave/ui";

const OFFLINE_MSG =
  "Máy tính chưa online — hãy mở app Larkwave trên máy (đăng nhập cùng tài khoản), rồi thử lại. Chat từ xa cần máy tính bật để chạy.";

/** AgentChat is a browser-only, storage-driven component (localStorage/IndexedDB history) — load
 *  it client-side only (matches the Monaco pattern) so `next build` never SSRs it. */
const AgentChat = dynamic(() => import("@larkwave/ui").then((m) => m.AgentChat), {
  ssr: false,
  loading: () => (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 240 }}>
      <Spin />
    </div>
  ),
});

/**
 * "Điều khiển từ xa → Trò chuyện": the SAME Trợ lý AI as the desktop (shared `AgentChat`).
 *
 * Two backends, chosen by whether the server has the HOSTED assistant (MAIC) configured:
 *  - HOSTED (MAIC on): turns run SERVER-SIDE via Larkwave's hosted Claude — NO desktop, NO local
 *    Claude needed. Metered against the user's monthly % plan (Free plan = the trial).
 *  - RELAY (MAIC off): turns run on the signed-in desktop's local CLI (the original behavior),
 *    which requires the desktop app open + online.
 */
export default function RemoteChatPage() {
  const { t } = useI18n();
  // null = still deciding which backend to use.
  const [hosted, setHosted] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .maicStatus()
      .then((r) => alive && setHosted(!!r.enabled))
      .catch(() => alive && setHosted(false)); // any error → fall back to the relay path
    return () => {
      alive = false;
    };
  }, []);

  const runtime = useMemo(() => (hosted ? createHostedRuntime() : createRelayRuntime()), [hosted]);
  const { online, checked } = useDesktopOnline();
  // Hosted needs no desktop; the relay path keeps the offline gate.
  const blocked = hosted ? null : checked && !online ? t("remote.chat.offline", OFFLINE_MSG) : null;

  if (hosted === null) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60dvh" }}>
        <Spin />
      </div>
    );
  }

  return (
    <RemoteChatShell runtime={runtime}>
      <AgentChat blocked={blocked} fill />
    </RemoteChatShell>
  );
}
