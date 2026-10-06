"use client";

import { ArrowDownOutlined, ArrowUpOutlined, DollarOutlined, FlagOutlined, RiseOutlined, ThunderboltOutlined, UserOutlined } from "@ant-design/icons";
import { App, Card, Col, Empty, Row, Skeleton, Space, Tag, Tooltip, Typography } from "antd";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { AdminReport, AuditLogEntry } from "@larkwave/shared";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { BRAND } from "@/lib/theme";
import { V, OK, WARN, ERR, BLUE } from "@larkwave/ui";
const { Title, Text } = Typography;

const vnd = (n: number) =>
  new Intl.NumberFormat("vi-VN").format(Math.round(n || 0)) + " đ";
const usd = (n: number) =>
  "$" + new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n || 0);
const num = (n: number) => new Intl.NumberFormat("vi-VN").format(n || 0);

/** Compact KPI tile, mirrors the Reports StatCard look. */
function Kpi({
  title,
  icon,
  color,
  loading,
  value,
  sub,
}: {
  title: string;
  icon: React.ReactNode;
  color: string;
  loading: boolean;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <Card styles={{ body: { padding: 18 } }}>
      {loading ? (
        <Skeleton active paragraph={{ rows: 1 }} title={{ width: "55%" }} />
      ) : (
        <>
          <Space size={8} style={{ marginBottom: 6 }}>
            <span
              style={{
                display: "inline-flex",
                width: 30,
                height: 30,
                borderRadius: 9,
                alignItems: "center",
                justifyContent: "center",
                background: `${color}1A`,
                color,
                fontSize: 15,
              }}
            >
              {icon}
            </span>
            <Text type="secondary" style={{ fontSize: 12.5, fontWeight: 600 }}>
              {title}
            </Text>
          </Space>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.15 }}>
            {value}
          </div>
          {sub ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {sub}
            </Text>
          ) : null}
        </>
      )}
    </Card>
  );
}

/** Lightweight dual-bar mini-chart (revenue vs API cost), no chart deps. */
function MiniChart({ report }: { report: AdminReport }) {
  const series = report.series ?? [];
  if (series.length === 0) {
    return <Empty description="Chưa có dữ liệu theo ngày" />;
  }
  const vndPerUsd = report.profit.revenueUsd
    ? report.profit.revenueVnd / report.profit.revenueUsd
    : 25000;
  const points = series.map((p) => ({
    date: p.date,
    revenueVnd: p.revenueVnd,
    costVnd: p.apiCostUsd * vndPerUsd,
    costUsd: p.apiCostUsd,
  }));
  const max = Math.max(1, ...points.map((p) => Math.max(p.revenueVnd, p.costVnd)));

  return (
    <div>
      <Space size={18} style={{ marginBottom: 12 }}>
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
          height: 140,
          padding: "0 2px",
          overflowX: "auto",
        }}
      >
        {points.map((p) => {
          const rh = Math.round((p.revenueVnd / max) * 128);
          const ch = Math.round((p.costVnd / max) * 128);
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
                  minWidth: 5,
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
                    maxWidth: 10,
                    height: Math.max(2, rh),
                    background: BRAND,
                    borderRadius: "3px 3px 0 0",
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    maxWidth: 10,
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

interface Counts {
  users: number;
  aiRunsToday: number;
  openFeedback: number;
}

/** Human label for the common audit actions surfaced on the dashboard. */
function auditLabel(action: string): string {
  const map: Record<string, string> = {
    "user.update": "Cập nhật người dùng",
    "settings.update": "Cập nhật cấu hình",
    "billing.update": "Cập nhật gói & giá",
  };
  return map[action] ?? action;
}

export default function AdminDashboard() {
  const { message } = App.useApp();
  const [report, setReport] = useState<AdminReport | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [recentAudit, setRecentAudit] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const todayIso = new Date();
        todayIso.setHours(0, 0, 0, 0);
        const [rep, users, openFeedback, today, audit] = await Promise.all([
          api.adminReports("30d"),
          api.listUsers({ pageSize: 1 }),
          api.adminFeedback({ status: "open", pageSize: 1 }),
          api.adminReports("today"),
          api.listAudit({ pageSize: 8 }),
        ]);
        setReport(rep);
        setCounts({
          users: users.total,
          aiRunsToday: today.apiCost.runs,
          openFeedback: openFeedback.total,
        });
        setRecentAudit(audit.items);
      } catch (e) {
        message.error((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [message]);

  const profitUp = (report?.profit.profitVnd ?? 0) >= 0;
  const profitColor = profitUp ? OK : ERR;


  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <div>
        <Title level={3} style={{ margin: 0 }}>
          Tổng quan
        </Title>
        <Text type="secondary">
          Hiệu suất nền tảng 30 ngày gần nhất — doanh thu, chi phí AI và vận hành
        </Text>
      </div>

      {/* KPI row */}
      <Row gutter={[16, 16]}>
        <Col xs={12} md={8} xl={4}>
          <Kpi
            title="Doanh thu (30N)"
            icon={<DollarOutlined />}
            color={OK}
            loading={loading}
            value={
              <span style={{ color: OK }}>
                {vnd(report?.revenue.totalVnd ?? 0)}
              </span>
            }
            sub={`${num(report?.revenue.paidCount ?? 0)} đơn`}
          />
        </Col>
        <Col xs={12} md={8} xl={4}>
          <Kpi
            title="Lợi nhuận (30N)"
            icon={profitUp ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
            color={profitColor}
            loading={loading}
            value={
              <span style={{ color: profitColor }}>
                {vnd(report?.profit.profitVnd ?? 0)}
              </span>
            }
            sub={`Biên ${new Intl.NumberFormat("vi-VN", {
              maximumFractionDigits: 1,
            }).format(report?.profit.marginPct ?? 0)}%`}
          />
        </Col>
        <Col xs={12} md={8} xl={4}>
          <Kpi
            title="Chi phí AI (30N)"
            icon={<RiseOutlined />}
            color={WARN}
            loading={loading}
            value={
              <span style={{ color: WARN }}>
                {usd(report?.apiCost.totalUsd ?? 0)}
              </span>
            }
            sub={`${num(report?.apiCost.runs ?? 0)} lượt AI tính phí`}
          />
        </Col>
        <Col xs={12} md={8} xl={4}>
          <Kpi
            title="Người dùng"
            icon={<UserOutlined />}
            color={BLUE}
            loading={loading}
            value={num(counts?.users ?? 0)}
            sub="tổng tài khoản"
          />
        </Col>
        <Col xs={12} md={8} xl={4}>
          <Kpi
            title="Lượt AI hôm nay"
            icon={<ThunderboltOutlined />}
            color={BRAND}
            loading={loading}
            value={num(counts?.aiRunsToday ?? 0)}
            sub="trong ngày (MAIC)"
          />
        </Col>
      </Row>

      {/* Chart + review/activity column */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={15}>
          <Card
            title="Doanh thu & chi phí theo ngày"
            extra={<Link href="/admin/reports">Báo cáo đầy đủ →</Link>}
            styles={{ body: { paddingTop: 16 } }}
          >
            {loading ? (
              <Skeleton active paragraph={{ rows: 4 }} />
            ) : report ? (
              <MiniChart report={report} />
            ) : null}
          </Card>
        </Col>
        <Col xs={24} lg={9}>
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            {/* Needs review */}
            <Card styles={{ body: { padding: 18 } }}>
              <Space
                align="start"
                style={{ width: "100%", justifyContent: "space-between" }}
              >
                <div>
                  <Space size={8} style={{ marginBottom: 4 }}>
                    <span
                      style={{
                        display: "inline-flex",
                        width: 30,
                        height: 30,
                        borderRadius: 9,
                        alignItems: "center",
                        justifyContent: "center",
                        background: "rgba(239,68,68,0.12)",
                        color: ERR,
                        fontSize: 15,
                      }}
                    >
                      <FlagOutlined />
                    </span>
                    <Text type="secondary" style={{ fontSize: 12.5, fontWeight: 600 }}>
                      Cần xem xét
                    </Text>
                  </Space>
                  <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1 }}>
                    {loading ? "—" : num(counts?.openFeedback ?? 0)}
                  </div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    báo lỗi chưa xử lý
                  </Text>
                </div>
                <Link href="/admin/feedback">Báo lỗi →</Link>
              </Space>
            </Card>

            {/* Recent activity */}
            <Card
              title="Hoạt động gần đây"
              extra={<Link href="/admin/audit">Nhật ký →</Link>}
              styles={{ body: { padding: "8px 0" } }}
            >
              {loading ? (
                <div style={{ padding: 16 }}>
                  <Skeleton active paragraph={{ rows: 4 }} />
                </div>
              ) : recentAudit.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="Chưa có hoạt động"
                  style={{ margin: "16px 0" }}
                />
              ) : (
                <div>
                  {recentAudit.map((a) => (
                    <div
                      key={a.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "9px 16px",
                        borderTop: `1px solid ${V.layer}`,
                      }}
                    >
                      <Tag
                        bordered={false}
                        color="purple"
                        style={{ margin: 0, fontSize: 11.5 }}
                      >
                        {auditLabel(a.action)}
                      </Tag>
                      <Text
                        type="secondary"
                        style={{ fontSize: 12, flex: 1, minWidth: 0 }}
                        ellipsis
                      >
                        {a.actorEmail ?? "hệ thống"}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>
                        {formatDate(a.createdAt)}
                      </Text>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </Space>
        </Col>
      </Row>

    </Space>
  );
}
