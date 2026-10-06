"use client";

import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DollarOutlined,
  ReloadOutlined,
  RiseOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  Card,
  Col,
  Empty,
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
import type {
  AdminReport,
  ModelChoice,
  PlanId,
  ReportPeriod,
} from "@larkwave/shared";
import { api } from "@/lib/api";
import { BRAND } from "@/lib/theme";
import { V, OK, WARN, ERR, BLUE } from "@larkwave/ui";
const { Title, Text } = Typography;

const PERIOD_OPTIONS: { label: string; value: ReportPeriod }[] = [
  { label: "Hôm nay", value: "today" },
  { label: "7 ngày", value: "7d" },
  { label: "30 ngày", value: "30d" },
  { label: "Tất cả", value: "all" },
];

const MODEL_LABEL: Record<ModelChoice, string> = {
  opus: "Opus",
  sonnet: "Sonnet",
};

const PLAN_LABEL: Record<PlanId, string> = {
  free: "Miễn phí",
  starter: "Khởi đầu",
  pro: "Chuyên nghiệp",
  enterprise: "Doanh nghiệp",
};

const PLAN_COLOR: Record<PlanId, string> = {
  // Màu NHẬN DIỆN GÓI — cố ý cứng, không theo theme: một gói phải cùng màu ở mọi nền, mọi
  // biểu đồ, mọi trang. Đây là màu mang Ý NGHĨA như đỏ/vàng, không phải màu bề mặt.
  free: "#9AA3B5",
  starter: BLUE,
  pro: BRAND,
  enterprise: "#FF7AB6",
};

const vnd = (n: number) =>
  new Intl.NumberFormat("vi-VN").format(Math.round(n || 0)) + " đ";
const usd = (n: number) =>
  "$" + new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n || 0);
const num = (n: number) => new Intl.NumberFormat("vi-VN").format(n || 0);
const pct = (n: number) =>
  new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(n || 0) + "%";

/** Compact token count: 1234567 → "1,23 Tr" / 12345 → "12,3 N". */
function tokens(n: number): string {
  if (!n) return "0";
  if (n >= 1_000_000)
    return (n / 1_000_000).toFixed(2).replace(".", ",") + " Tr";
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

/** Lightweight dual-bar daily chart (no chart deps) — revenue vs API cost. */
function SeriesChart({ report }: { report: AdminReport }) {
  const series = report.series ?? [];
  if (series.length === 0) {
    return <Empty description="Chưa có dữ liệu theo ngày" />;
  }
  const vndPerUsd = report.profit.revenueUsd
    ? report.profit.revenueVnd / report.profit.revenueUsd
    : 25000;
  // Normalise both metrics to VND so the two bars share one scale.
  const points = series.map((p) => ({
    date: p.date,
    revenueVnd: p.revenueVnd,
    costVnd: p.apiCostUsd * vndPerUsd,
    costUsd: p.apiCostUsd,
  }));
  const max = Math.max(
    1,
    ...points.map((p) => Math.max(p.revenueVnd, p.costVnd)),
  );

  return (
    <div>
      <Space size={18} style={{ marginBottom: 14 }}>
        <Space size={6}>
          <span
            style={{ width: 11, height: 11, borderRadius: 3, background: BRAND, display: "inline-block" }}
          />
          <Text type="secondary" style={{ fontSize: 12.5 }}>
            Doanh thu (đ)
          </Text>
        </Space>
        <Space size={6}>
          <span
            style={{ width: 11, height: 11, borderRadius: 3, background: WARN, display: "inline-block" }}
          />
          <Text type="secondary" style={{ fontSize: 12.5 }}>
            Chi phí API (≈đ)
          </Text>
        </Space>
      </Space>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: points.length > 45 ? 1 : 4,
          height: 180,
          padding: "0 2px",
          overflowX: "auto",
        }}
      >
        {points.map((p) => {
          const rh = Math.round((p.revenueVnd / max) * 168);
          const ch = Math.round((p.costVnd / max) * 168);
          return (
            <Tooltip
              key={p.date}
              title={
                <div style={{ fontSize: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 2 }}>{p.date}</div>
                  <div>Doanh thu: {vnd(p.revenueVnd)}</div>
                  <div>Chi phí API: {usd(p.costUsd)}</div>
                </div>
              }
            >
              <div
                style={{
                  flex: "1 1 0",
                  minWidth: 6,
                  display: "flex",
                  alignItems: "flex-end",
                  justifyContent: "center",
                  gap: 2,
                  height: "100%",
                  cursor: "default",
                }}
              >
                <span
                  style={{
                    flex: 1,
                    maxWidth: 11,
                    height: Math.max(2, rh),
                    background: BRAND,
                    borderRadius: "3px 3px 0 0",
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    maxWidth: 11,
                    height: Math.max(2, ch),
                    background: WARN,
                    borderRadius: "3px 3px 0 0",
                  }}
                />
              </div>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

export default function AdminReportsPage() {
  const { message } = App.useApp();
  const [period, setPeriod] = useState<ReportPeriod>("all");
  const [report, setReport] = useState<AdminReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (p: ReportPeriod) => {
      setLoading(true);
      try {
        const r = await api.adminReports(p);
        setReport(r);
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

  const profitUp = (report?.profit.profitVnd ?? 0) >= 0;
  const profitColor = profitUp ? OK : ERR;

  // ── model breakdown table ──
  const modelRows = (["opus", "sonnet"] as ModelChoice[]).map((m) => ({
    key: m,
    model: m,
    ...(report?.byModel[m] ?? {
      builds: 0,
      usd: 0,
      inputTokens: 0,
      outputTokens: 0,
    }),
  }));
  const modelColumns: ColumnsType<(typeof modelRows)[number]> = [
    {
      title: "Model",
      dataIndex: "model",
      key: "model",
      render: (m: ModelChoice) => (
        <Tag
          bordered={false}
          color={m === "opus" ? "purple" : "blue"}
          style={{ fontWeight: 600 }}
        >
          {MODEL_LABEL[m]}
        </Tag>
      ),
    },
    {
      title: "Builds",
      dataIndex: "builds",
      key: "builds",
      align: "right",
      render: (v: number) => num(v),
    },
    {
      title: "Token vào",
      dataIndex: "inputTokens",
      key: "inputTokens",
      align: "right",
      render: (v: number) => tokens(v),
    },
    {
      title: "Token ra",
      dataIndex: "outputTokens",
      key: "outputTokens",
      align: "right",
      render: (v: number) => tokens(v),
    },
    {
      title: "Chi phí (USD)",
      dataIndex: "usd",
      key: "usd",
      align: "right",
      render: (v: number) => <Text strong>{usd(v)}</Text>,
    },
  ];

  // ── revenue-by-plan table ──
  const paidPlans: Exclude<PlanId, "free">[] = ["starter", "pro", "enterprise"];
  const revenueRows = paidPlans.map((p) => ({
    key: p,
    plan: p,
    count: report?.revenue.byPlan[p]?.count ?? 0,
    vnd: report?.revenue.byPlan[p]?.vnd ?? 0,
  }));
  const revenueColumns: ColumnsType<(typeof revenueRows)[number]> = [
    {
      title: "Gói",
      dataIndex: "plan",
      key: "plan",
      render: (p: PlanId) => (
        <Tag bordered={false} color={PLAN_COLOR[p]} style={{ fontWeight: 600 }}>
          {PLAN_LABEL[p]}
        </Tag>
      ),
    },
    {
      title: "Số đơn",
      dataIndex: "count",
      key: "count",
      align: "right",
      render: (v: number) => num(v),
    },
    {
      title: "Doanh thu",
      dataIndex: "vnd",
      key: "vnd",
      align: "right",
      render: (v: number) => <Text strong>{vnd(v)}</Text>,
    },
  ];

  const allPlans: PlanId[] = ["free", "starter", "pro", "enterprise"];

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Báo cáo lợi nhuận
          </Title>
          <Text type="secondary">
            Doanh thu, chi phí Claude API và lợi nhuận theo thời gian
          </Text>
        </div>
        <Space wrap>
          <Segmented<ReportPeriod>
            value={period}
            onChange={(v) => setPeriod(v)}
            options={PERIOD_OPTIONS}
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={() => load(period)}
            loading={loading}
          >
            Tải lại
          </Button>
        </Space>
      </div>

      {/* Top cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Doanh thu"
            icon={<DollarOutlined />}
            color={OK}
            loading={loading}
          >
            <Title level={3} style={{ margin: 0, color: OK }}>
              {vnd(report?.revenue.totalVnd ?? 0)}
            </Title>
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              {num(report?.revenue.paidCount ?? 0)} đơn đã thanh toán
            </Text>
          </StatCard>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Chi phí Claude API"
            icon={<RiseOutlined />}
            color={WARN}
            loading={loading}
          >
            <Title level={3} style={{ margin: 0, color: WARN }}>
              {usd(report?.apiCost.totalUsd ?? 0)}
            </Title>
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              ≈ {vnd(report?.profit.apiCostUsd ? report.profit.apiCostUsd *
                (report.profit.revenueUsd
                  ? report.profit.revenueVnd / report.profit.revenueUsd
                  : 25000) : 0)}
            </Text>
          </StatCard>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Lợi nhuận"
            icon={profitUp ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
            color={profitColor}
            loading={loading}
          >
            <Title level={3} style={{ margin: 0, color: profitColor }}>
              {vnd(report?.profit.profitVnd ?? 0)}
            </Title>
            <Text style={{ fontSize: 12.5, color: profitColor, fontWeight: 600 }}>
              Biên lợi nhuận {pct(report?.profit.marginPct ?? 0)}
            </Text>
          </StatCard>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Builds"
            icon={<ThunderboltOutlined />}
            color={BRAND}
            loading={loading}
          >
            <Title level={3} style={{ margin: 0 }}>
              {num(report?.builds.total ?? 0)}
            </Title>
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              Tỷ lệ thành công{" "}
              <Text strong style={{ color: OK }}>
                {pct((report?.builds.successRate ?? 0) * 100)}
              </Text>
            </Text>
          </StatCard>
        </Col>
      </Row>

      {/* Chart */}
      <Card title="Doanh thu & chi phí theo ngày">
        {loading ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : report ? (
          <SeriesChart report={report} />
        ) : null}
      </Card>

      <Row gutter={[16, 16]}>
        {/* Model breakdown */}
        <Col xs={24} lg={14}>
          <Card
            title="Chi phí theo model"
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                Đã nạp vào Claude API
              </Text>
            }
          >
            <Table
              rowKey="key"
              loading={loading}
              columns={modelColumns}
              dataSource={modelRows}
              pagination={false}
              size="middle"
              summary={() =>
                report ? (
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0}>
                      <Text strong>Tổng</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={1} align="right">
                      <Text strong>{num(report.apiCost.builds)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={2} align="right">
                      <Text strong>{tokens(report.apiCost.inputTokens)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={3} align="right">
                      <Text strong>{tokens(report.apiCost.outputTokens)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={4} align="right">
                      <Text strong style={{ color: WARN }}>
                        {usd(report.apiCost.totalUsd)}
                      </Text>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                ) : null
              }
            />
          </Card>
        </Col>

        {/* Revenue by plan */}
        <Col xs={24} lg={10}>
          <Card title="Doanh thu theo gói">
            <Table
              rowKey="key"
              loading={loading}
              columns={revenueColumns}
              dataSource={revenueRows}
              pagination={false}
              size="middle"
              summary={() =>
                report ? (
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0}>
                      <Text strong>Tổng</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={1} align="right">
                      <Text strong>{num(report.revenue.paidCount)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={2} align="right">
                      <Text strong style={{ color: OK }}>
                        {vnd(report.revenue.totalVnd)}
                      </Text>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                ) : null
              }
            />
          </Card>
        </Col>
      </Row>

      {/* Users by plan */}
      <Card title="Người dùng theo gói">
        <Row gutter={[16, 16]}>
          {allPlans.map((p) => (
            <Col xs={12} md={6} key={p}>
              <div
                style={{
                  borderRadius: 12,
                  border: `1px solid ${V.border}`,
                  padding: "16px 18px",
                  background: `${PLAN_COLOR[p]}0D`,
                }}
              >
                {loading ? (
                  <Skeleton active paragraph={false} title={{ width: "70%" }} />
                ) : (
                  <>
                    <Tag
                      bordered={false}
                      color={PLAN_COLOR[p]}
                      style={{ fontWeight: 600, marginBottom: 8 }}
                    >
                      {PLAN_LABEL[p]}
                    </Tag>
                    <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1 }}>
                      {num(report?.users.byPlan[p] ?? 0)}
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      người dùng
                    </Text>
                  </>
                )}
              </div>
            </Col>
          ))}
        </Row>
        {!loading && report ? (
          <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 14 }}>
            Tổng cộng {num(report.users.total)} người dùng
          </Text>
        ) : null}
      </Card>
    </Space>
  );
}
