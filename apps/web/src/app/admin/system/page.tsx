"use client";

import { ApiOutlined, CloudServerOutlined, CodeOutlined, RocketOutlined } from "@ant-design/icons";
import { App, Card, Space, Tag, Timeline, Typography } from "antd";
import { type ReactNode } from "react";
import { api } from "@/lib/api";
import { V, BRAND } from "@larkwave/ui";

const { Title, Text, Paragraph } = Typography;

interface StackGroup {
  icon: ReactNode;
  title: string;
  items: { name: string; version: string }[];
}

const STACK: StackGroup[] = [
  {
    icon: <CodeOutlined />,
    title: "Frontend (Web)",
    items: [
      { name: "TypeScript", version: "5.x" },
      { name: "Next.js (App Router)", version: "16.2" },
      { name: "React", version: "19.2" },
      { name: "Ant Design", version: "5.29" },
    ],
  },
  {
    icon: <ApiOutlined />,
    title: "Backend (API)",
    items: [
      { name: "TypeScript", version: "5.x" },
      { name: "NestJS", version: "11.0" },
      { name: "Prisma ORM", version: "6.3" },
      { name: "PostgreSQL", version: "—" },
      { name: "class-validator", version: "0.14" },
    ],
  },
  {
    icon: <CloudServerOutlined />,
    title: "Hạ tầng & AI",
    items: [
      { name: "Cloudflare Tunnel", version: "—" },
      { name: "MAIC (Claude hosted)", version: "—" },
      { name: "Lark Open Platform", version: "—" },
      { name: "Electron / Nextron (desktop)", version: "33" },
    ],
  },
];

interface Release {
  version: string;
  date: string;
  title: string;
  items: string[];
  color?: string;
}

const RELEASES: Release[] = [
  {
    version: "1.0.0",
    date: "06/10/2026",
    title: "Larkwave tách khỏi Toolswave",
    color: BRAND,
    items: [
      "Sản phẩm riêng cho Lark × Agents + Trợ lý AI: bỏ toàn bộ phần dựng app (codegen, build, deploy, cửa hàng, blog, Developer API).",
      "Giữ: tài khoản, gói & thanh toán SePay, MAIC, kỹ năng, tác vụ định kỳ, artifacts, điều khiển từ xa, cộng đồng, báo lỗi.",
    ],
  },
];

// Derive the header badge from the latest changelog entry so they can't drift.
const VERSION = RELEASES[0].version;
const RELEASED = RELEASES[0].date;

export default function AdminSystemPage() {
  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <div>
        <Title level={3} style={{ margin: 0 }}>
          <RocketOutlined style={{ color: BRAND, marginInlineEnd: 8 }} />
          Tổng quan hệ thống &amp; Changelog
        </Title>
        <Space size={10} style={{ marginTop: 6 }} wrap>
          <Tag color="purple" style={{ fontWeight: 600 }}>
            Phiên bản v{VERSION}
          </Tag>
          <Text type="secondary">Phát hành {RELEASED}</Text>
          <Tag bordered={false}>Monorepo: web · api · shared</Tag>
        </Space>
      </div>

      {/* Tech stack */}
      <Card title="Công nghệ &amp; ngôn ngữ sử dụng">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18 }}>
          {STACK.map((g) => (
            <div key={g.title}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, color: BRAND, fontWeight: 600 }}>
                <span>{g.icon}</span> {g.title}
              </div>
              <Space direction="vertical" size={6} style={{ width: "100%" }}>
                {g.items.map((it) => (
                  <div key={it.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", borderRadius: 8, background: V.surfaceAlt, border: `1px solid ${V.borderSub}` }}>
                    <Text style={{ fontSize: 13.5 }}>{it.name}</Text>
                    <Tag bordered={false} style={{ margin: 0, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11.5 }}>
                      {it.version}
                    </Tag>
                  </div>
                ))}
              </Space>
            </div>
          ))}
        </div>
      </Card>

      {/* Changelog */}
      <Card title="Lịch sử phiên bản (Changelog)">
        <Timeline
          items={RELEASES.map((r) => ({
            color: r.color ?? V.textFaint,
            children: (
              <div style={{ paddingBottom: 6 }}>
                <Space size={8} wrap style={{ marginBottom: 4 }}>
                  <Tag color={r.color ? "purple" : "default"} bordered={false} style={{ fontWeight: 600 }}>
                    v{r.version}
                  </Tag>
                  <Text strong>{r.title}</Text>
                  <Text type="secondary" style={{ fontSize: 12.5 }}>
                    {r.date}
                  </Text>
                </Space>
                <ul style={{ margin: "2px 0 0", paddingInlineStart: 18 }}>
                  {r.items.map((it, i) => (
                    <li key={i} style={{ fontSize: 13.5, color: V.text, lineHeight: 1.6 }}>
                      {it}
                    </li>
                  ))}
                </ul>
              </div>
            ),
          }))}
        />
      </Card>

      <Paragraph type="secondary" style={{ fontSize: 12.5 }}>
        Cập nhật phiên bản &amp; changelog tại{" "}
        <Text code>apps/web/src/app/admin/system/page.tsx</Text>. Mỗi lần ra tính năng lớn, thêm một mục
        ở đầu danh sách và tăng số phiên bản.
      </Paragraph>
    </Space>
  );
}
