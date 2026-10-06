"use client";

import { ArrowLeftOutlined, LoginOutlined, MessageOutlined, ReloadOutlined } from "@ant-design/icons";
import { App, Button, Card, Space, Statistic, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { User } from "@larkwave/shared";
import { api, APP_BASE_URL, type AdminUserSupportSummary, type RunnerErrorRow } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { RoleTag, UserStatusTag } from "@/components/StatusTags";
import MessageUserDrawer from "@/components/admin/MessageUserDrawer";
import { OK, ERR } from "@larkwave/ui";

const { Title, Text } = Typography;

const ellipsis = (s: string, n = 80) => (s && s.length > n ? s.slice(0, n) + "…" : s || "—");

/**
 * Admin support drill-down for ONE user — profile + activity counts (hosted AI runs, remote
 * tasks, payments, reports) + the runner errors they hit. Opening it calls the AUDITED
 * support-summary (logs "admin viewed this user").
 */
export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { message, modal } = App.useApp();

  const [user, setUser] = useState<User | null>(null);
  const [summary, setSummary] = useState<AdminUserSupportSummary | null>(null);
  const [errors, setErrors] = useState<RunnerErrorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [nhanMo, setNhanMo] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [u, s] = await Promise.all([api.getUser(id), api.getUserSupportSummary(id).catch(() => null)]);
      setUser(u);
      setSummary(s);
      // Lỗi runner lọc theo email (endpoint chỉ có ô tìm kiếm `q`).
      const rep = await api.adminRunnerErrors({ days: 90, q: u.email, limit: 50 }).catch(() => null);
      setErrors((rep?.items ?? []).filter((r) => r.userId === u.id));
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
      content: `Mở phiên của ${user.email} (tab mới) để xem hội thoại & chẩn đoán lỗi. Hành động này được ghi log.`,
      okText: "Vào tài khoản",
      cancelText: "Huỷ",
      onOk: async () => {
        try {
          const res = await api.impersonateUser(user.id);
          const url = `${APP_BASE_URL}/auth/callback?token=${encodeURIComponent(res.token)}&imp=1&next=${encodeURIComponent("/overview")}`;
          window.open(url, "_blank", "noopener,noreferrer");
          message.success(`Đang mở phiên của ${user.email}…`);
        } catch (e) {
          message.error((e as Error).message);
        }
      },
    });
  };

  const errorCols: ColumnsType<RunnerErrorRow> = [
    { title: "Runner", dataIndex: "runner", key: "runner", width: 110, render: (v: string) => <Tag bordered={false}>{v}</Tag> },
    { title: "Loại", dataIndex: "kind", key: "kind", width: 120, render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
    { title: "Lỗi", dataIndex: "message", key: "message", render: (v: string) => <Text type="danger" style={{ fontSize: 12.5 }}>{ellipsis(v, 120)}</Text> },
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
          <Button icon={<MessageOutlined />} onClick={() => setNhanMo(true)} disabled={!user}>Nhắn tin</Button>
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
        {stat("Lượt AI (hosted)", summary?.aiRuns ?? 0)}
        {stat("Tác vụ từ xa", summary?.remoteTasks ?? 0, OK)}
        {stat("Tác vụ lỗi", summary?.failedRemoteTasks ?? 0, ERR)}
        {stat("Thanh toán", summary?.payments ?? 0)}
        {stat("Báo lỗi", summary?.feedback ?? 0)}
      </div>

      <Card title={`Lỗi runner 90 ngày (${errors.length})`}>
        <Table<RunnerErrorRow>
          rowKey="id"
          loading={loading}
          columns={errorCols}
          dataSource={errors}
          size="small"
          scroll={{ x: 640 }}
          pagination={{ pageSize: 15, hideOnSinglePage: true }}
          locale={{ emptyText: "Không có lỗi" }}
        />
      </Card>

      {user && (
        <MessageUserDrawer
          open={nhanMo}
          userId={user.id}
          email={user.email}
          name={user.name}
          onClose={() => setNhanMo(false)}
        />
      )}
    </Space>
  );
}
