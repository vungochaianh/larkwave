"use client";

import { useMemo } from "react";
import { RuntimeProvider, SkillsScreen, WebRuntimeAdapter } from "@larkwave/ui";
import { getToken, API_BASE } from "@/lib/api";

/**
 * "Skills" on the website — the SAME shared SkillsScreen as the desktop, but wired to a
 * WebRuntimeAdapter whose skill methods hit the server-side `/skills` API. Every ENABLED skill
 * is injected into the hosted "Trợ lý AI" (MAIC) system prompt server-side, so skills work here
 * with no desktop and no local CLI. (Folder-import stays desktop-only; the web uses the author
 * flow — SkillsScreen hides "import folder" when the runtime lacks it.)
 */
export default function SkillsPage() {
  const runtime = useMemo(() => new WebRuntimeAdapter(API_BASE, getToken), []);
  return (
    <RuntimeProvider runtime={runtime}>
      {/* Constrain the width like the desktop shell does — the (builder) content area is full-width,
          which left the Skills page stretched edge-to-edge. */}
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <SkillsScreen />
      </div>
    </RuntimeProvider>
  );
}
