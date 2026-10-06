"use client";

import {
  ApiOutlined,
  AppstoreOutlined,
  DatabaseOutlined,
  GlobalOutlined,
  MessageOutlined,
  RocketOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import type { ReactNode } from "react";

/**
 * Landing feature grid with real library (Ant Design) icons instead of emoji.
 * A client component so the welcome page stays a server component (keeps its
 * `metadata` export for SEO).
 */
const ICONS: Record<string, ReactNode> = {
  ai: <ThunderboltOutlined />,
  db: <DatabaseOutlined />,
  deploy: <RocketOutlined />,
  manage: <ApiOutlined />,
  chat: <MessageOutlined />,
  multi: <GlobalOutlined />,
};

export default function LandingFeatures({
  items,
}: {
  items: { icon: string; title: string; desc: string }[];
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))", gap: 18 }}>
      {items.map((f) => (
        <div
          key={f.title}
          style={{
            padding: "22px 22px 24px",
            border: "1px solid #F1F2F7",
            borderRadius: 16,
            background: "#FBFBFE",
            boxShadow: "0 1px 3px rgba(17,24,39,0.05)",
          }}
        >
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 12,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              color: "#6C5CE7",
              background: "rgba(108,92,231,0.10)",
              marginBottom: 12,
            }}
          >
            {ICONS[f.icon] ?? <AppstoreOutlined />}
          </div>
          <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 8px" }}>{f.title}</h3>
          <p style={{ color: "#5B6478", fontSize: 14.5, lineHeight: 1.55, margin: 0 }}>{f.desc}</p>
        </div>
      ))}
    </div>
  );
}
