"use client";

import { DollarOutlined, ReloadOutlined, RiseOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { App, Button, Card, Col, Row, Segmented, Skeleton, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import type { AdminReport, ReportPeriod } from "@larkwave/shared";
import { api } from "@/lib/api";
import { BRAND } from "@/lib/theme";
import AiProvidersPanel from "@/components/AiProvidersPanel";
import TelegramBotPanel from "@/components/TelegramBotPanel";
import { OK, WARN, BLUE } from "@larkwave/ui";
const { Title, Text } = Typography;

const PERIOD_OPTIONS: { label: string; value: ReportPeriod }[] = [
  { label: "Hôm nay", value: "today" },
  { label: "7 ngày", value: "7d" },
  { label: "30 ngày", value: "30d" },
  { label: "Tất cả", value: "all" },
];

/** MaicUsage.kind → nhãn đọc được. */
const KIND_LABEL: Record<string, string> = {
  ask: "Trợ lý AI (hosted)",
  run: "Chạy có tệp đính kèm",
  lark: "Lark chạy hộ",
  scheduled: "Tác vụ định kỳ",
};

const usd = (n: number) =>
  "$" + new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n || 0);
const num = (n: number) => new Intl.NumberFormat("vi-VN").format(n || 0);

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

export default function AdminAiPage() {
  const { message } = App.useApp();
  const [period, setPeriod] = useState<ReportPeriod>("30d");
  const [report, setReport] = useState<AdminReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);

  const loadReport = useCallback(
    async (p: ReportPeriod) => {
      setReloading(true);
      try {
        setReport(await api.adminReports(p));
      } catch (e) {
        message.error((e as Error).message);
      } finally {
        setReloading(false);
        setLoading(false);
      }
    },
    [message],
  );

  useEffect(() => {
    void loadReport(period);
  }, [period, loadReport]);

  const kindRows = Object.entries(report?.byKind ?? {})
    .map(([kind, b]) => ({ key: kind, kind, ...b }))
    .sort((a, b) => b.usd - a.usd);

  const kindColumns: ColumnsType<(typeof kindRows)[number]> = [
    {
      title: "Loại",
      dataIndex: "kind",
      key: "kind",
      render: (k: string) => (
        <Tag bordered={false} color="purple" style={{ fontWeight: 600 }}>
          {KIND_LABEL[k] ?? k}
        </Tag>
      ),
    },
    { title: "Lượt chạy", dataIndex: "runs", key: "runs", align: "right", render: (v: number) => num(v) },
    { title: "Token", dataIndex: "tokens", key: "tokens", align: "right", render: (v: number) => tokens(v) },
    {
      title: "Chi phí (USD)",
      dataIndex: "usd",
      key: "usd",
      align: "right",
      render: (v: number) => <Text strong>{usd(v)}</Text>,
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <AiProvidersPanel />
      <TelegramBotPanel />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Quản lý AI
          </Title>
          <Text type="secondary">Sử dụng &amp; chi phí AI (MAIC) theo loại lượt chạy</Text>
        </div>
        <Space wrap>
          <Segmented<ReportPeriod> value={period} onChange={(v) => setPeriod(v)} options={PERIOD_OPTIONS} />
          <Button
            aria-label="Tải lại báo cáo"
            icon={<ReloadOutlined />}
            onClick={() => loadReport(period)}
            loading={reloading}
            disabled={reloading}
          />
        </Space>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={8}>
          <StatCard title="Chi phí AI" icon={<DollarOutlined />} color={WARN} loading={loading}>
            <Title level={3} style={{ margin: 0, color: WARN }}>
              {usd(report?.apiCost.totalUsd ?? 0)}
            </Title>
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              theo sổ MAIC
            </Text>
          </StatCard>
        </Col>
        <Col xs={24} sm={12} xl={8}>
          <StatCard title="Lượt chạy tính phí" icon={<ThunderboltOutlined />} color={BRAND} loading={loading}>
            <Title level={3} style={{ margin: 0 }}>
              {num(report?.apiCost.runs ?? 0)}
            </Title>
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              có bản ghi sử dụng
            </Text>
          </StatCard>
        </Col>
        <Col xs={24} sm={12} xl={8}>
          <StatCard title="Token" icon={<RiseOutlined />} color={BLUE} loading={loading}>
            <Title level={3} style={{ margin: 0, color: OK }}>
              {tokens(report?.apiCost.tokens ?? 0)}
            </Title>
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              quy đổi từ chi phí
            </Text>
          </StatCard>
        </Col>
      </Row>

      <Card title="Sử dụng & chi phí theo loại">
        <Table
          size="middle"
          loading={loading}
          columns={kindColumns}
          dataSource={kindRows}
          pagination={false}
          locale={{ emptyText: "Chưa có lượt chạy nào trong kỳ này." }}
        />
      </Card>
    </Space>
  );
}
