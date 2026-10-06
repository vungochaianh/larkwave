import type { ReactNode } from "react";
import AuthGuard from "@/components/AuthGuard";
import AgentsChatShell from "@/components/AgentsChatShell";

// Authed workspace — never prerender/cache the HTML (default gave it s-maxage=1y, so a shared cache
// could serve a year-old build referencing stale JS chunks). Force dynamic so every load is fresh.
export const dynamic = "force-dynamic";

// Khu làm việc AI "Agents Chat": Trò chuyện / Dự án / Artifacts / Tác vụ định kỳ trong một vỏ chung.
export default function AgentsChatLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <AgentsChatShell>{children}</AgentsChatShell>
    </AuthGuard>
  );
}
