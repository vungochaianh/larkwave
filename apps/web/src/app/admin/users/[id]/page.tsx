"use client";

import { ArrowLeftOutlined, LoginOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Card,
  Drawer,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { App as AppModel, Build, BuildStatus, Track, User } from "@larkwave/shared";
import { api, APP_BASE_URL, type AdminUserSupportSummary, type BuildErrorEntry } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { RoleTag, UserStatusTag } from "@/components/StatusTags";
import BuildDetail from "@/components/BuildDetail";
import MessageUserDrawer from "@/components/admin/MessageUserDrawer";
import { OK, ERR } from "@larkwave/ui";

const { Title, Text, Paragraph } = Typography;

const STATUS_COLOR: Record<string, string> = {
  succeeded: "green",
  live: "green",
  running: "processing",
  queued: "default",
  awaiting_approval: "gold",
  failed: "error",
  canceled: "default",
  draft: "default",
};
const statusTag = (s?: string | null) =>
  s ? <Tag color={STATUS_COLOR[s] ?? "default"} bordered={false}>{s}</Tag> : <Text type="secondary">—</Text>;

const ellipsis = (s: string, n = 80) => (s && s.length > n ? s.slice(0, n) + "…" : s || "—");

/**
 * Admin support drill-down for ONE user — joins their profile + counts + apps + builds
 * (the codegen "conversations", with logs/errors via BuildDetail) + errored builds in one
 * place. Opening it calls the AUDITED support-summary (logs "admin viewed this user").
 */
export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { message, modal } = App.useApp();

  const [user, setUser] = useState<User | null>(null);
  const [summary, setSummary] = useState<AdminUserSupportSummary | null>(null);
  const [apps, setApps] = useState<AppModel[]>([]);
  const [builds, setBuilds] = useState<Build[]>([]);
  const [errors, setErrors] = useState<BuildErrorEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<{ id: string; track?: Track | null } | null>(null);
  // Trạng thái RIÊNG cho ngăn nhắn tin: `active` là của ngăn xem build, dùng chung là hai thứ
  // đóng mở lẫn nhau.
  const [nhanMo, setNhanMo] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // getUser + support-summary first (support-summary is the audit anchor); the lists tolerate
      // an older backend where ownerId filtering isn't deployed yet (they just return more rows).
      const [u, s, appRes, buildRes, errRes] = await Promise.all([
        api.getUser(id),
        api.getUserSupportSummary(id).catch(() => null),
        api.listApps({ ownerId: id, pageSize: 50 }).catch(() => ({ items: [] as AppModel[] })),
        api.listBuilds({ ownerId: id, pageSize: 50 }).catch(() => ({ items: [] as Build[] })),
        api.adminBuildErrors({ ownerId: id, pageSize: 50 }).catch(() => ({ items: [] as BuildErrorEntry[] })),
      ]);
      setUser(u);
      setSummary(s);
      setApps(appRes.items);
      setBuilds(buildRes.items);
      setErrors(errRes.items);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const impersonate = () => {
    if (!user) return;
    modal.confirm({
      title: "Vào tài khoản người dùng?",
      content: `Mở phiên của ${user.email} ở toolswave.net (tab mới) để xem hội thoại, app & chẩn đoán lỗi. Hành động này được ghi log.`,
      okText: "Vào tài khoản",
      cancelText: "Huỷ",
      onOk: async () => {
        try {
          const res = await api.impersonateUser(user.id);
          const url = `${APP_BASE_URL}/auth/callback?token=${encodeURIComponent(res.token)}&imp=1&next=${encodeURIComponent("/apps")}`;
          window.open(url, "_blank", "noopener,noreferrer");
          message.success(`Đang mở phiên của ${user.email}…`);
        } catch (e) {
          message.error((e as Error).message);
        }
      },
    });
  };

  const buildCols: ColumnsType<Build> = [
    {
      title: "Yêu cầu (prompt)",
      dataIndex: "prompt",
      key: "prompt",
      render: (v: string) => <Text style={{ fontSize: 13 }}>{ellipsis(v, 100)}</Text>,
    },
    { title: "Trạng thái", dataIndex: "status", key: "status", width: 120, render: (v) => statusTag(v) },
    { title: "Track", dataIndex: "track", key: "track", width: 90, render: (v) => <Text type="secondary" style={{ fontSize: 12 }}>{v ?? "—"}</Text> },
    { title: "Model", dataIndex: "model", key: "model", width: 90, render: (v) => <Text type="secondary" style={{ fontSize: 12 }}>{v ?? "—"}</Text> },
    { title: "Lúc", dataIndex: "createdAt", key: "createdAt", width: 150, render: (v) => <Text type="secondary" style={{ fontSize: 12 }}>{formatDate(v)}</Text> },
  ];

  const appCols: ColumnsType<AppModel> = [
    {
      title: "App",
      dataIndex: "name",
      key: "name",
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{r.name || r.slug}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{r.slug}</Text>
        </Space>
      ),
    },
    { title: "Trạng thái", dataIndex: "status", key: "status", width: 120, render: (v) => statusTag(v) },
    { title: "Track", dataIndex: "track", key: "track", width: 90, render: (v) => <Text type="secondary" style={{ fontSize: 12 }}>{v ?? "—"}</Text> },
    { title: "Tạo lúc", dataIndex: "createdAt", key: "createdAt", width: 150, render: (v) => <Text type="secondary" style={{ fontSize: 12 }}>{formatDate(v)}</Text> },
  ];

  const errorCols: ColumnsType<BuildErrorEntry> = [
    { title: "Yêu cầu", dataIndex: "prompt", key: "prompt", render: (v: string) => <Text style={{ fontSize: 13 }}>{ellipsis(v, 70)}</Text> },
    {
      title: "Lỗi",
      dataIndex: "error",
      key: "error",
      render: (v: string | null, r) => (
        <Space direction="vertical" size={0}>
          <Text type="danger" style={{ fontSize: 12.5 }}>{ellipsis(v || "—", 90)}</Text>
          {r.failedStage && <Text type="secondary" style={{ fontSize: 11.5 }}>ở bước: {r.failedStage}</Text>}
        </Space>
      ),
    },
    { title: "Lúc", dataIndex: "createdAt", key: "createdAt", width: 150, render: (v) => <Text type="secondary" style={{ fontSize: 12 }}>{formatDate(v)}</Text> },
  ];

  const stat = (title: string, value: number | string, color?: string) => (
    <Card size="small" style={{ minWidth: 120, flex: "1 1 120px" }}>
      <Statistic title={title} value={value} valueStyle={color ? { color } : undefined} />
    </Card>
  );

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <Space>
          <Link href="/admin/users"><Button icon={<ArrowLeftOutlined />}>Người dùng</Button></Link>
          <Title level={3} style={{ margin: 0 }}>{user ? user.name || user.email : "Người dùng"}</Title>
          {user && <RoleTag role={user.role} />}
          {user && <UserStatusTag status={user.status} />}
        </Space>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading} />
          <Button type="primary" icon={<LoginOutlined />} onClick={impersonate} disabled={!user}>Vào tài khoản</Button>
        </Space>
      </div>

      {user && (
        <Card size="small">
          <Space size="large" wrap>
            <Text type="secondary">Email: <Text>{user.email}</Text></Text>
            <Text type="secondary">Gói: <Tag bordered={false}>{user.plan || "free"}</Tag></Text>
            <Text type="secondary">Tham gia: <Text>{formatDate(user.createdAt)}</Text></Text>
            {summary?.lastActivityAt && <Text type="secondary">Hoạt động gần nhất: <Text>{formatDate(summary.lastActivityAt)}</Text></Text>}
          </Space>
        </Card>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {stat("Apps", summary?.apps ?? apps.length)}
        {stat("Builds", summary?.builds ?? builds.length)}
        {stat("Thành công", summary?.succeededBuilds ?? 0, OK)}
        {stat("Lỗi", summary?.failedBuilds ?? errors.length, ERR)}
        {stat("Deployments", summary?.deployments ?? 0)}
        {stat("Thanh toán", summary?.payments ?? 0)}
        {stat("Báo lỗi", summary?.feedback ?? 0)}
      </div>

      <Tabs
        defaultActiveKey="builds"
        items={[
          {
            key: "builds",
            label: `Hội thoại / Builds (${builds.length})`,
            children: (
              <Table<Build>
                rowKey="id"
                loading={loading}
                columns={buildCols}
                dataSource={builds}
                size="small"
                scroll={{ x: 720 }}
                onRow={(r) => ({ onClick: () => setActive({ id: r.id, track: (r as { track?: Track | null }).track ?? null }), style: { cursor: "pointer" } })}
                pagination={{ pageSize: 15, hideOnSinglePage: true }}
                locale={{ emptyText: "Chưa có build nào" }}
              />
            ),
          },
          {
            key: "errors",
            label: `Lỗi (${errors.length})`,
            children: (
              <Table<BuildErrorEntry>
                rowKey="id"
                loading={loading}
                columns={errorCols}
                dataSource={errors}
                size="small"
                scroll={{ x: 640 }}
                onRow={(r) => ({ onClick: () => setActive({ id: r.id, track: (r.track as Track) ?? null }), style: { cursor: "pointer" } })}
                pagination={{ pageSize: 15, hideOnSinglePage: true }}
                locale={{ emptyText: "Không có lỗi" }}
              />
            ),
          },
          {
            key: "apps",
            label: `App (${apps.length})`,
            children: (
              <Table<AppModel>
                rowKey="id"
                loading={loading}
                columns={appCols}
                dataSource={apps}
                size="small"
                scroll={{ x: 560 }}
                pagination={{ pageSize: 15, hideOnSinglePage: true }}
                locale={{ emptyText: "Chưa có app nào" }}
              />
            ),
          },
        ]}
      />

      {user && (
        <MessageUserDrawer
          open={nhanMo}
          userId={user.id}
          email={user.email}
          name={user.name}
          onClose={() => setNhanMo(false)}
        />
      )}

      <Drawer
        open={!!active}
        onClose={() => setActive(null)}
        width={720}
        title="Chi tiết build (hội thoại codegen + log + lỗi)"
        destroyOnClose
      >
        {active && (
          <>
            <Paragraph type="secondary" style={{ fontSize: 12.5 }}>
              Đây là toàn bộ tiến trình dựng của user: prompt, các bước, log và lỗi.
            </Paragraph>
            <BuildDetail buildId={active.id} track={active.track ?? "web"} />
          </>
        )}
      </Drawer>
    </Space>
  );
}
