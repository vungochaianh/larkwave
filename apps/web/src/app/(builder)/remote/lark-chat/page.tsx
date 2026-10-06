"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Spin } from "antd";
import { createRelayRuntime } from "@/lib/relayRuntime";
import { RemoteChatShell } from "@/components/RemoteChatShell";
import { useDesktopOnline } from "@/lib/useDesktopOnline";

const OFFLINE_MSG = "Máy tính chưa online — hãy mở app Larkwave trên máy (đăng nhập cùng tài khoản + đã kết nối Lark), rồi thử lại. Lark × Agents chạy trên máy tính của bạn.";
// Desktop is online but Lark itself isn't connected / is missing scope → the tools
// would fail silently. Gate with a clear message (parity with the desktop LarkScreen
// connect gate; the user can only (re)connect Lark on the desktop app).
const LARK_DISCONNECTED_MSG = "Máy tính đã online nhưng CHƯA kết nối Lark — mở app Larkwave trên máy, vào “Lark × Agents” và đăng nhập / kết nối Lark, rồi thử lại.";
const LARK_SCOPE_MSG = "Phiên Lark đang thiếu quyền Bitable (bitable:app) — vào app trên máy, kết nối lại Lark và cấp đủ quyền, rồi thử lại.";

/** The SAME "Lark × Agents" screen as the desktop (shared `LarkChat` — base picker, sessions,
 *  auto-approve, notes…), but every Lark method + chat turn runs on the signed-in desktop's local
 *  CLI via the relay. Browser-only (storage-driven) → load client-side, like AgentChat. */
const LarkChat = dynamic(() => import("@larkwave/ui").then((m) => m.LarkChat), {
  ssr: false,
  loading: () => (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 240 }}>
      <Spin />
    </div>
  ),
});

/**
 * "Điều khiển từ xa → Lark × Agents": full-parity Lark screen on the web (themed like the desktop via
 * RemoteChatShell). Requires the desktop app open + signed in with the same account + connected to Lark.
 */
export default function RemoteLarkChatPage() {
  const runtime = useMemo(() => createRelayRuntime(), []);
  const { online, checked } = useDesktopOnline();
  // Once the desktop is confirmed online, verify Lark is actually connected on it —
  // otherwise the chat's Lark tools fail with no visible reason.
  const [larkBlocked, setLarkBlocked] = useState<string | null>(null);

  useEffect(() => {
    if (!checked || !online) {
      setLarkBlocked(null);
      return;
    }
    let cancelled = false;
    runtime
      .larkStatus?.()
      .then((st) => {
        if (cancelled) return;
        if (!st?.connected) setLarkBlocked(LARK_DISCONNECTED_MSG);
        else if (st.userBitableScopeMissing) setLarkBlocked(LARK_SCOPE_MSG);
        else setLarkBlocked(null);
      })
      .catch(() => {
        // Leave ungated on a status-probe error — the chat itself will surface any
        // real transport failure; we don't want a flaky probe to block a working session.
      });
    return () => {
      cancelled = true;
    };
  }, [checked, online, runtime]);

  const blocked = checked && !online ? OFFLINE_MSG : larkBlocked;
  return (
    <RemoteChatShell runtime={runtime}>
      <LarkChat runtime={runtime} blocked={blocked} />
    </RemoteChatShell>
  );
}
