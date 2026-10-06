"use client";

import { ChromeOutlined, GlobalOutlined, MobileOutlined } from "@ant-design/icons";
import type { ReactNode } from "react";
import { LiveThumb } from "@/lib/thumbnail";

const TRACK_ICON: Record<string, ReactNode> = {
  web: <GlobalOutlined />,
  mobile: <MobileOutlined />,
  extension: <ChromeOutlined />,
};

/** Stable two-stop gradient derived from a seed — every app gets a distinct cover. */
function coverGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `linear-gradient(135deg, hsl(${hue} 72% 60%) 0%, hsl(${(hue + 38) % 360} 68% 48%) 100%)`;
}

/** The gradient + faux-browser-chrome app cover used on /apps and /explore cards. */
export default function AppCover({
  seed,
  name,
  track,
  host,
  chips,
  liveUrl,
}: {
  seed: string;
  name: string;
  track?: string | null;
  host?: string | null;
  chips?: ReactNode;
  /** Deployed public URL → renders a live screenshot over the gradient cover. */
  liveUrl?: string | null;
}) {
  return (
    <div
      style={{
        position: "relative",
        aspectRatio: "16 / 10",
        background: coverGradient(seed),
        overflow: "hidden",
      }}
    >
      {/* Centered system glyph + name */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          color: "rgba(255,255,255,0.92)",
        }}
      >
        <span style={{ fontSize: 40, opacity: 0.95 }}>
          {(track && TRACK_ICON[track]) ?? <GlobalOutlined />}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.3, opacity: 0.9 }}>
          {(name || "?").slice(0, 22)}
        </span>
      </div>

      {/* Live screenshot of the deployed app (web only); falls back to the cover. */}
      {track === "web" && liveUrl ? <LiveThumb url={liveUrl} alt={name} /> : null}

      {/* Faux browser chrome bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 26,
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "0 10px",
          background: "rgba(255,255,255,0.78)",
          backdropFilter: "blur(4px)",
          borderBottom: "1px solid rgba(0,0,0,0.05)",
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: 999, background: "#FF5F57" }} />
        <span style={{ width: 8, height: 8, borderRadius: 999, background: "#FEBC2E" }} />
        <span style={{ width: 8, height: 8, borderRadius: 999, background: "#28C840" }} />
        <span
          style={{
            marginLeft: 6,
            flex: 1,
            minWidth: 0,
            fontSize: 10.5,
            color: "#6B7280",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {host ?? ""}
        </span>
      </div>

      {chips && (
        <div style={{ position: "absolute", left: 10, bottom: 10, display: "flex", gap: 6 }}>
          {chips}
        </div>
      )}
    </div>
  );
}
