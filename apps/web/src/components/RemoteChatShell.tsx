"use client";

import type { ReactNode } from "react";
import type { RuntimeAdapter } from "@larkwave/core";
import { RuntimeProvider, AccountAuthProvider, V } from "@larkwave/ui";

/**
 * Shell for the remote-chat pages (`/remote/lark-chat`, `/remote/chat`). Theming is now global —
 * the root `providers.tsx` owns `ThemeProvider` + antd's light/dark algorithm, and `AppShell`'s
 * header carries the light/dark toggle — so this only has to provide the runtime + account context
 * and a full-height flex container (the shared LarkChat/AgentChat components are already themed via
 * the `--tw-*` tokens). The `100dvh - 60px` height accounts for AppShell's 60px sticky header.
 */
export function RemoteChatShell({ runtime, children, fill }: { runtime: RuntimeAdapter; children: ReactNode; fill?: boolean }) {
  return (
    <RuntimeProvider runtime={runtime}>
      <AccountAuthProvider>
        <div
          style={{
            // `fill` (embedded in the /agents-chat workspace) → fill the parent flex slot exactly, with no
            // magic offset. Standalone /remote pages sit under AppShell's 60px header → subtract it.
            height: fill ? "100%" : "calc(100dvh - 60px)",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            background: V.layer,
          }}
        >
          {children}
        </div>
      </AccountAuthProvider>
    </RuntimeProvider>
  );
}
