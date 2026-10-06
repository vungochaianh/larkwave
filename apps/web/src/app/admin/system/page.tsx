"use client";

import {
  ApiOutlined,
  CloudServerOutlined,
  CodeOutlined,
  DatabaseOutlined,
  RocketOutlined,
} from "@ant-design/icons";
import { App, Button, Card, Space, Tag, Timeline, Typography } from "antd";
import { useState, type ReactNode } from "react";
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
      { name: "Cloudflare Pages + Functions", version: "—" },
      { name: "Cloudflare D1 (SQLite)", version: "—" },
      { name: "Cloudflare Tunnel", version: "—" },
      { name: "Anthropic Claude", version: "Opus 4.8" },
      { name: "Vite (app sinh ra)", version: "5.x" },
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
    version: "1.6.0",
    date: "13/06/2026",
    title: "Quản trị backend & ổn định codegen",
    color: BRAND,
    items: [
      "Workspace: thêm tab Dữ liệu (quản trị D1 — xem/sửa/thêm/xoá bản ghi) và tab API (xem endpoint + mã nguồn).",
      "Codegen ổn định: sinh theo đợt (batched) + cache prompt, sửa kiểu delta (không rớt backend), tự bù backend (ensureBackend), auto-rollback khi lỗi.",
      "Timeout cho mọi lệnh gọi AI (hết treo); spec chuyển streaming (nhanh hơn nhiều).",
      "Trang Gói & Thanh toán gộp làm một; chiến dịch giảm 50% tự duyệt thanh toán.",
      "Admin: Báo cáo lỗi build (xem mọi build lỗi + log). Landing page SEO cho toolswave.net.",
      "Bố cục full-width + lưới; /explore vào trong sidebar.",
    ],
  },
  {
    version: "1.5.0",
    date: "12/06/2026",
    title: "Gamification",
    items: ["XP, cấp độ, bảng xếp hạng — thưởng khi tạo app, build thành công, deploy, thu hút lượt xem."],
  },
  {
    version: "1.4.0",
    date: "12/06/2026",
    title: "Cộng tác dự án",
    items: ["Mời thành viên xem / đồng chỉnh sửa một app (viewer / editor)."],
  },
  {
    version: "1.3.0",
    date: "12/06/2026",
    title: "Bạn bè & nhắn tin",
    items: ["Kết bạn và nhắn tin trực tiếp (DM) giữa người dùng."],
  },
  {
    version: "1.2.0",
    date: "11/06/2026",
    title: "Showcase công khai",
    items: ["Trang Khám phá (/explore) + trang app công khai /app/<slug> — chia sẻ không cần đăng nhập."],
  },
  {
    version: "1.1.0",
    date: "11/06/2026",
    title: "Đính kèm tài liệu",
    items: ["Tải lên PDF/DOCX/PPTX + ảnh mockup làm ngữ cảnh; dán dữ liệu lớn → thành tệp đính kèm."],
  },
  {
    version: "1.0.0",
    date: "10/06/2026",
    title: "Lõi prompt-to-app",
    items: ["Mô tả → blueprint → sinh code → build → preview → deploy ra Cloudflare Pages. Web · Mobile (Expo) · Extension."],
  },
];

// Derive the header badge from the latest changelog entry so they can't drift.
const VERSION = RELEASES[0].version;
const RELEASED = RELEASES[0].date;

/** Maintenance: reclaim Cloudflare D1 slots (free plan caps at 10/account). */
function D1CleanupCard() {
  const { message, modal } = App.useApp();
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);

  const run = () => {
    modal.confirm({
      title: "Dọn database D1 mồ côi?",
      icon: <DatabaseOutlined style={{ color: BRAND }} />,
      content:
        "Xoá mọi database tên tw-* trên Cloudflare KHÔNG còn app nào tham chiếu (do build lỗi / app đã xoá). App đang hoạt động được giữ nguyên. Thao tác này không thể hoàn tác.",
      okText: "Dọn ngay",
      cancelText: "Huỷ",
      okButtonProps: { danger: true },
      onOk: async () => {
        setBusy(true);
        try {
          const r = await api.cleanupOrphanD1();
          const summary =
            r.deleted > 0
              ? `Đã xoá ${r.deleted}/${r.total} database mồ côi. Còn lại ${r.kept}.`
              : `Không có database mồ côi. Tổng ${r.total} database đang dùng.`;
          setLast(`${summary}${r.names.length ? " (" + r.names.join(", ") + ")" : ""}`);
          message.success(summary);
        } catch (e) {
          message.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      },
    });
  };

  return (
    <Card title="Bảo trì hạ tầng">
      <Space direction="vertical" size={10} style={{ width: "100%" }}>
        <Text type="secondary" style={{ fontSize: 13.5 }}>
          Cloudflare free plan giới hạn <Text strong>10 database D1/tài khoản</Text>. Khi build full-stack
          lỗi hoặc app bị xoá, đôi khi còn sót database mồ côi chiếm chỗ. Bấm để thu hồi.
        </Text>
        <div>
          <Button icon={<DatabaseOutlined />} loading={busy} onClick={run}>
            Dọn D1 mồ côi
          </Button>
        </div>
        {last && (
          <Text style={{ fontSize: 12.5, color: V.text }}>{last}</Text>
        )}
      </Space>
    </Card>
  );
}

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

      {/* Maintenance */}
      <D1CleanupCard />

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
