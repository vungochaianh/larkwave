"use client";

import {
  ApiOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  DatabaseOutlined,
  DeleteOutlined,
  DollarOutlined,
  EyeOutlined,
  FolderOutlined,
  MessageOutlined,
  PushpinFilled,
  ReloadOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  WarningFilled,
} from "@ant-design/icons";
import {
  App,
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Modal,
  Row,
  Segmented,
  Skeleton,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import type { ClaudeDataOverview, ClaudeReport, ClaudeUserData, ReportPeriod } from "@larkwave/shared";
import { api } from "@/lib/api";
import { BRAND } from "@/lib/theme";
import { OK, WARN, BLUE } from "@larkwave/ui";
const { Title, Text } = Typography;

const PERIOD_OPTIONS: { label: string; value: ReportPeriod }[] = [
  { label: "Hôm nay", value: "today" },
  { label: "7 ngày", value: "7d" },
  { label: "30 ngày", value: "30d" },
  { label: "Tất cả", value: "all" },
];

/** Friendly label per MaicUsage.kind. */
const KIND_LABEL: Record<string, string> = {
  ask: "Trò chuyện (Trợ lý AI)",
  scheduled: "Tác vụ định kỳ",
  share: "Link công khai (/g)",
};
const kindLabel = (k: string) => KIND_LABEL[k] ?? k;
const KIND_COLOR: Record<string, string> = { ask: BRAND, scheduled: BLUE, share: OK };

const usd = (n: number) =>
  "$" + new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n || 0);
const num = (n: number) => new Intl.NumberFormat("vi-VN").format(n || 0);

/** Compact token count: 1234567 → "1,23 Tr" / 12345 → "12,3 N". */
function tokens(n: number): string {
  if (!n) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2).replace(".", ",") + " Tr";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(".", ",") + " N";
  return num(n);
}

function StatCard({
  title,
  icon,
  color,
  loading,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  color: string;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card styles={{ body: { padding: 20 } }}>
      {loading ? (
        <Skeleton active paragraph={{ rows: 1 }} title={{ width: "55%" }} />
      ) : (
        <>
          <Space size={8} style={{ marginBottom: 6 }}>
            <span
              style={{
                display: "inline-flex",
                width: 32,
                height: 32,
                borderRadius: 9,
                alignItems: "center",
                justifyContent: "center",
                background: `${color}1A`,
                color,
                fontSize: 16,
              }}
            >
              {icon}
            </span>
            <Text type="secondary" style={{ fontSize: 13, fontWeight: 600 }}>
              {title}
            </Text>
          </Space>
          {children}
        </>
      )}
    </Card>
  );
}

/** Single-metric daily bar chart (tokens/day), no chart deps. */
function SeriesChart({ report }: { report: ClaudeReport }) {
  const series = report.series ?? [];
  if (series.length === 0) return <Empty description="Chưa có dữ liệu theo ngày" />;
  const max = Math.max(1, ...series.map((p) => p.tokens));
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: series.length > 45 ? 1 : 4,
        height: 180,
        padding: "0 2px",
        overflowX: "auto",
      }}
    >
      {series.map((p) => {
        const h = Math.round((p.tokens / max) * 168);
        return (
          <Tooltip
            key={p.date}
            title={
              <div style={{ fontSize: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>{p.date}</div>
                <div>Lượt: {num(p.requests)}</div>
                <div>Token: {tokens(p.tokens)}</div>
                <div>Chi phí: {usd(p.costUsd)}</div>
              </div>
            }
          >
            <div
              style={{
                flex: "1 1 0",
                minWidth: 5,
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                height: "100%",
                cursor: "default",
              }}
            >
              <span
                style={{
                  flex: 1,
                  maxWidth: 14,
                  height: Math.max(2, h),
                  background: BRAND,
                  borderRadius: "3px 3px 0 0",
                }}
              />
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
}

/** Live MAIC gateway health banner. */
function GatewayHealth({ g }: { g: ClaudeReport["gateway"] }) {
  if (!g.enabled) {
    return (
      <Alert
        type="warning"
        showIcon
        message="MAIC chưa được bật"
        description="Chưa cấu hình MAIC_URL / MAIC_TOKEN trên máy chủ — Trợ lý AI hosted đang tắt."
      />
    );
  }
  if (!g.reachable) {
    return (
      <Alert
        type="error"
        showIcon
        icon={<CloseCircleFilled />}
        message="Không kết nối được cổng MAIC"
        description={g.message || "Cổng MAIC không phản hồi khi kiểm tra sức khoẻ."}
      />
    );
  }
  const ok = g.available !== false;
  const rl = g.rateLimit;
  return (
    <Alert
      type={ok ? "success" : "warning"}
      showIcon
      icon={ok ? <CheckCircleFilled /> : <WarningFilled />}
      message={
        <Space wrap size={8}>
          <Text strong>{ok ? "Cổng MAIC đang hoạt động" : "Cổng MAIC đang bận / hết lượt tạm thời"}</Text>
          {g.state && <Tag bordered={false}>state: {g.state}</Tag>}
          {g.mode && <Tag bordered={false}>mode: {g.mode}</Tag>}
          {rl?.isUsingOverage && <Tag bordered={false} color="orange">đang dùng overage</Tag>}
        </Space>
      }
      description={
        rl?.resetsAt || rl?.status || g.message ? (
          <Text type="secondary" style={{ fontSize: 12.5 }}>
            {rl?.status ? `Rate limit: ${rl.status}. ` : ""}
            {rl?.resetsAt ? `Mở lại lúc ${new Date(rl.resetsAt).toLocaleString("vi-VN")}. ` : ""}
            {g.message || ""}
          </Text>
        ) : undefined
      }
    />
  );
}

const dt = (s: string | null) => (s ? new Date(s).toLocaleString("vi-VN") : "—");

export default function AdminClaudePage() {
  const { message, modal } = App.useApp();
  const [period, setPeriod] = useState<ReportPeriod>("all");
  const [report, setReport] = useState<ClaudeReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (p: ReportPeriod) => {
      setLoading(true);
      try {
        setReport(await api.adminClaude(p));
      } catch (e) {
        message.error((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [message],
  );

  useEffect(() => {
    void load(period);
  }, [load, period]);

  // ── Data volume + per-account management (all-time state, not period-scoped) ──
  const [dataOv, setDataOv] = useState<ClaudeDataOverview | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [drill, setDrill] = useState<ClaudeUserData | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillOpen, setDrillOpen] = useState(false);

  const loadData = useCallback(async () => {
    setDataLoading(true);
    try {
      setDataOv(await api.adminClaudeData());
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setDataLoading(false);
    }
  }, [message]);
  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openUser = useCallback(
    async (id: string) => {
      setDrillOpen(true);
      setDrill(null);
      setDrillLoading(true);
      try {
        setDrill(await api.adminClaudeUser(id));
      } catch (e) {
        message.error((e as Error).message);
      } finally {
        setDrillLoading(false);
      }
    },
    [message],
  );

  const delConv = (convId: string, title: string) => {
    modal.confirm({
      title: "Xoá hội thoại này?",
      content: `"${title || "(không tên)"}" sẽ bị xoá khỏi máy chủ. Lưu ý: thiết bị của người dùng có thể đồng bộ lại nếu bản cục bộ còn.`,
      okText: "Xoá",
      okButtonProps: { danger: true },
      cancelText: "Huỷ",
      onOk: async () => {
        try {
          await api.adminClaudeDeleteConv(convId);
          message.success("Đã xoá");
          if (drill) await openUser(drill.userId);
          void loadData();
        } catch (e) {
          message.error((e as Error).message);
        }
      },
    });
  };

  // ── data-by-account table ──
  const dataColumns: ColumnsType<ClaudeDataOverview["byUser"][number]> = [
    {
      title: "Người dùng",
      dataIndex: "name",
      key: "name",
      render: (_: string, r) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name || r.email}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>{r.email}</Text>
        </div>
      ),
    },
    { title: "Gói", dataIndex: "plan", key: "plan", render: (p: string) => <Tag bordered={false}>{p}</Tag> },
    { title: "Hội thoại", dataIndex: "conversations", key: "conversations", align: "right", render: (v: number) => num(v), sorter: (a, b) => a.conversations - b.conversations },
    { title: "Dự án", dataIndex: "projects", key: "projects", align: "right", render: (v: number) => num(v) },
    { title: "Hoạt động gần nhất", dataIndex: "lastActivityAt", key: "lastActivityAt", render: (s: string | null) => <Text type="secondary" style={{ fontSize: 12.5 }}>{dt(s)}</Text> },
    {
      title: "",
      key: "action",
      align: "right",
      render: (_: unknown, r) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => openUser(r.userId)}>Xem</Button>
      ),
    },
  ];

  // ── by-kind table ──
  const kindColumns: ColumnsType<ClaudeReport["byKind"][number]> = [
    {
      title: "Loại",
      dataIndex: "kind",
      key: "kind",
      render: (k: string) => (
        <Tag bordered={false} color={KIND_COLOR[k] ?? "default"} style={{ fontWeight: 600 }}>
          {kindLabel(k)}
        </Tag>
      ),
    },
    { title: "Lượt", dataIndex: "requests", key: "requests", align: "right", render: (v: number) => num(v) },
    { title: "Token", dataIndex: "tokens", key: "tokens", align: "right", render: (v: number) => tokens(v) },
    {
      title: "Chi phí (USD)",
      dataIndex: "costUsd",
      key: "costUsd",
      align: "right",
      render: (v: number) => <Text strong>{usd(v)}</Text>,
    },
  ];

  // ── top-users table ──
  const userColumns: ColumnsType<ClaudeReport["topUsers"][number]> = [
    {
      title: "Người dùng",
      dataIndex: "name",
      key: "name",
      render: (_: string, r) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {r.name || r.email}
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>{r.email}</Text>
        </div>
      ),
    },
    { title: "Gói", dataIndex: "plan", key: "plan", render: (p: string) => <Tag bordered={false}>{p}</Tag> },
    { title: "Lượt", dataIndex: "requests", key: "requests", align: "right", render: (v: number) => num(v) },
    { title: "Token", dataIndex: "tokens", key: "tokens", align: "right", render: (v: number) => tokens(v) },
    {
      title: "Chi phí",
      dataIndex: "costUsd",
      key: "costUsd",
      align: "right",
      render: (v: number) => <Text strong>{usd(v)}</Text>,
    },
  ];

  const convDrillColumns: ColumnsType<ClaudeUserData["conversations"][number]> = [
    {
      title: "Tiêu đề",
      dataIndex: "title",
      key: "title",
      render: (t: string, r) => (
        <Space size={6} wrap>
          {r.pinned && <PushpinFilled style={{ color: WARN, fontSize: 12 }} />}
          <span style={{ fontWeight: 500 }}>{t || "(không tên)"}</span>
          {r.projectName && <Tag bordered={false} color="blue">{r.projectName}</Tag>}
        </Space>
      ),
    },
    { title: "Tin nhắn", dataIndex: "messages", key: "messages", align: "right", render: (v: number) => num(v) },
    { title: "Cập nhật", dataIndex: "updatedAt", key: "updatedAt", render: (s: string) => <Text type="secondary" style={{ fontSize: 12 }}>{dt(s)}</Text> },
    {
      title: "",
      key: "del",
      align: "right",
      render: (_: unknown, r) => <Button size="small" danger icon={<DeleteOutlined />} onClick={() => delConv(r.id, r.title)} />,
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Claude — Trợ lý AI (hosted)
          </Title>
          <Text type="secondary">
            Lượng dùng &amp; chi phí Claude qua cổng MAIC (chat /claude, desktop, tác vụ định kỳ)
          </Text>
        </div>
        <Space wrap>
          <Segmented<ReportPeriod> value={period} onChange={(v) => setPeriod(v)} options={PERIOD_OPTIONS} />
          <Button icon={<ReloadOutlined />} onClick={() => load(period)} loading={loading}>
            Tải lại
          </Button>
        </Space>
      </div>

      {/* Gateway health */}
      {loading ? <Skeleton active paragraph={{ rows: 1 }} /> : report ? <GatewayHealth g={report.gateway} /> : null}

      {/* KPI cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <StatCard title="Tổng lượt" icon={<MessageOutlined />} color={BRAND} loading={loading}>
            <Title level={3} style={{ margin: 0 }}>{num(report?.totals.requests ?? 0)}</Title>
            <Text type="secondary" style={{ fontSize: 12.5 }}>lượt hỏi–đáp hosted</Text>
          </StatCard>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard title="Tổng token" icon={<ThunderboltOutlined />} color={WARN} loading={loading}>
            <Title level={3} style={{ margin: 0, color: WARN }}>{tokens(report?.totals.tokens ?? 0)}</Title>
            <Text type="secondary" style={{ fontSize: 12.5 }}>vào + ra (gộp)</Text>
          </StatCard>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard title="Chi phí" icon={<DollarOutlined />} color={OK} loading={loading}>
            <Title level={3} style={{ margin: 0, color: OK }}>{usd(report?.totals.costUsd ?? 0)}</Title>
            <Text type="secondary" style={{ fontSize: 12.5 }}>ước tính theo cổng MAIC</Text>
          </StatCard>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard title="Người dùng" icon={<TeamOutlined />} color={BLUE} loading={loading}>
            <Title level={3} style={{ margin: 0 }}>{num(report?.totals.users ?? 0)}</Title>
            <Text type="secondary" style={{ fontSize: 12.5 }}>có ít nhất 1 lượt</Text>
          </StatCard>
        </Col>
      </Row>

      {/* Daily chart */}
      <Card title="Token theo ngày">
        {loading ? <Skeleton active paragraph={{ rows: 4 }} /> : report ? <SeriesChart report={report} /> : null}
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card title="Theo loại">
            <Table
              rowKey="kind"
              loading={loading}
              columns={kindColumns}
              dataSource={report?.byKind ?? []}
              pagination={false}
              size="middle"
              locale={{ emptyText: <Empty description="Chưa có dữ liệu" /> }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card title="Top người dùng" extra={<Text type="secondary" style={{ fontSize: 12 }}>theo token</Text>}>
            <Table
              rowKey="userId"
              loading={loading}
              columns={userColumns}
              dataSource={report?.topUsers ?? []}
              pagination={false}
              size="middle"
              scroll={{ x: 520 }}
              locale={{ emptyText: <Empty description="Chưa có dữ liệu" /> }}
            />
          </Card>
        </Col>
      </Row>

      {/* Data management by account (all-time state) */}
      <Card
        title={
          <Space size={8}>
            <DatabaseOutlined />
            <span>Dữ liệu theo tài khoản</span>
          </Space>
        }
        extra={
          dataOv ? (
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              {num(dataOv.totals.conversations)} hội thoại · {num(dataOv.totals.projects)} dự án · {num(dataOv.totals.usersWithData)} tài khoản
            </Text>
          ) : null
        }
      >
        <Table
          rowKey="userId"
          loading={dataLoading}
          columns={dataColumns}
          dataSource={dataOv?.byUser ?? []}
          size="middle"
          scroll={{ x: 640 }}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          locale={{ emptyText: <Empty description="Chưa có dữ liệu hội thoại" /> }}
        />
      </Card>

      {/* Per-account drill-down */}
      <Modal
        open={drillOpen}
        onCancel={() => setDrillOpen(false)}
        footer={null}
        width={860}
        title={drill ? `Dữ liệu của ${drill.name || drill.email}` : "Dữ liệu tài khoản"}
        destroyOnClose
      >
        {drillLoading || !drill ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : (
          <Space direction="vertical" size="large" style={{ width: "100%" }}>
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              {drill.email} · {drill.plan} · {num(drill.conversations.length)} hội thoại · {num(drill.projects.length)} dự án
            </Text>

            {drill.projects.length > 0 && (
              <div>
                <Text strong>Dự án</Text>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                  {drill.projects.map((p) => (
                    <Tag key={p.id} bordered={false} icon={<FolderOutlined />} style={{ padding: "4px 10px" }}>
                      {p.name || "(không tên)"} · {num(p.conversations)} hội thoại
                    </Tag>
                  ))}
                </div>
              </div>
            )}

            <div>
              <Text strong>Hội thoại</Text>
              <Table
                style={{ marginTop: 8 }}
                rowKey="id"
                size="small"
                columns={convDrillColumns}
                dataSource={drill.conversations}
                pagination={{ pageSize: 8, hideOnSinglePage: true }}
                scroll={{ x: 560 }}
                locale={{ emptyText: <Empty description="Chưa có hội thoại" /> }}
              />
            </div>
          </Space>
        )}
      </Modal>

      {/* Coverage caveat */}
      {!loading && report && report.unmeteredSurfaces.length > 0 && (
        <Alert
          type="info"
          showIcon
          icon={<ApiOutlined />}
          message="Phạm vi đo lường"
          description={
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              Báo cáo này gồm các lượt Claude hosted được ghi vào MaicUsage (chat + tác vụ định kỳ). Các luồng MAIC sau
              hiện <b>chưa được ghi nhận</b> nên không xuất hiện ở đây: {report.unmeteredSurfaces.join(", ")}. Lợi nhuận tổng
              xem ở <b>Báo cáo lợi nhuận</b>.
            </Text>
          }
        />
      )}
    </Space>
  );
}
