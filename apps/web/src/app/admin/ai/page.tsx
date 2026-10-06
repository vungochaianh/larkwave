"use client";

import {
  DollarOutlined,
  ReloadOutlined,
  RiseOutlined,
  RobotOutlined,
  SaveOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  Card,
  Col,
  Form,
  InputNumber,
  Row,
  Segmented,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type {
  AdminReport,
  BillingConfig,
  ModelChoice,
  PlatformConfig,
  ReportPeriod,
  ResolvedBillingConfig,
} from "@larkwave/shared";
import { api } from "@/lib/api";
import { BRAND } from "@/lib/theme";
import AiProvidersPanel from "@/components/AiProvidersPanel";
import TelegramBotPanel from "@/components/TelegramBotPanel";
import { V, OK, WARN, BLUE } from "@larkwave/ui";
const { Title, Text, Paragraph } = Typography;

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

const PROMPT_FIELDS: { key: keyof PlatformConfig["prompts"]; label: string }[] = [
  { key: "classify", label: "Phân loại (classify)" },
  { key: "spec", label: "Đặc tả (spec)" },
  { key: "codegen", label: "Sinh code (codegen)" },
  { key: "fix", label: "Sửa lỗi (fix)" },
  { key: "guide", label: "Hướng dẫn (guide)" },
];

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

interface CreditsForm {
  modelCredits: Record<ModelChoice, number>;
}

export default function AdminAiPage() {
  const { message } = App.useApp();
  const [period, setPeriod] = useState<ReportPeriod>("30d");
  const [report, setReport] = useState<AdminReport | null>(null);
  const [config, setConfig] = useState<PlatformConfig | null>(null);
  const [billing, setBilling] = useState<ResolvedBillingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingCredits, setSavingCredits] = useState(false);
  const [creditsForm] = Form.useForm<CreditsForm>();

  const [reloading, setReloading] = useState(false);
  const loadReport = useCallback(
    async (p: ReportPeriod) => {
      setReloading(true);
      try {
        const r = await api.adminReports(p);
        setReport(r);
      } catch (e) {
        message.error((e as Error).message);
      } finally {
        setReloading(false);
      }
    },
    [message],
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [rep, cfg, bill] = await Promise.all([
          api.adminReports("30d"),
          api.getConfig(),
          api.adminGetBilling(),
        ]);
        setReport(rep);
        setConfig(cfg);
        setBilling(bill);
        creditsForm.setFieldsValue({ modelCredits: bill.modelCredits });
      } catch (e) {
        message.error((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [message, creditsForm]);

  // Reload just the report when the period changes (after first load).
  useEffect(() => {
    if (loading) return;
    void loadReport(period);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const saveCredits = async () => {
    if (!billing) return;
    const values = await creditsForm.validateFields();
    setSavingCredits(true);
    try {
      // Merge: send the full resolved billing back, overriding only modelCredits.
      const payload: BillingConfig = {
        vndPerUsd: billing.vndPerUsd,
        plans: billing.plans,
        modelCredits: {
          ...billing.modelCredits,
          ...values.modelCredits,
        },
      };
      const saved = await api.adminSaveBilling(payload);
      setBilling(saved);
      creditsForm.setFieldsValue({ modelCredits: saved.modelCredits });
      message.success("Đã lưu chi phí credit theo model");
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSavingCredits(false);
    }
  };

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

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <AiProvidersPanel />
      <TelegramBotPanel />
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
            Quản lý AI
          </Title>
          <Text type="secondary">
            Sử dụng &amp; chi phí Claude API, chi phí credit, prompt và giới hạn
            vận hành
          </Text>
        </div>
        <Space wrap>
          <Segmented<ReportPeriod>
            value={period}
            onChange={(v) => setPeriod(v)}
            options={PERIOD_OPTIONS}
          />
          <Button
            aria-label="Tải lại báo cáo"
            icon={<ReloadOutlined />}
            onClick={() => loadReport(period)}
            loading={reloading}
            disabled={reloading}
          />
        </Space>
      </div>

      {/* Usage summary cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Chi phí Claude API"
            icon={<DollarOutlined />}
            color={WARN}
            loading={loading}
          >
            <Title level={3} style={{ margin: 0, color: WARN }}>
              {usd(report?.apiCost.totalUsd ?? 0)}
            </Title>
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              đã nạp vào Claude API
            </Text>
          </StatCard>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Builds tính phí"
            icon={<ThunderboltOutlined />}
            color={BRAND}
            loading={loading}
          >
            <Title level={3} style={{ margin: 0 }}>
              {num(report?.apiCost.builds ?? 0)}
            </Title>
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              có bản ghi sử dụng
            </Text>
          </StatCard>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Token vào"
            icon={<RiseOutlined />}
            color={BLUE}
            loading={loading}
          >
            <Title level={3} style={{ margin: 0 }}>
              {tokens(report?.apiCost.inputTokens ?? 0)}
            </Title>
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              tokens gửi đi
            </Text>
          </StatCard>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Token ra"
            icon={<RobotOutlined />}
            color={OK}
            loading={loading}
          >
            <Title level={3} style={{ margin: 0 }}>
              {tokens(report?.apiCost.outputTokens ?? 0)}
            </Title>
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              tokens sinh ra
            </Text>
          </StatCard>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        {/* Usage by model */}
        <Col xs={24} lg={14}>
          <Card
            title="Sử dụng & chi phí theo model"
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                Opus vs Sonnet · đã nạp vào Claude API
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

        {/* Editable model credits */}
        <Col xs={24} lg={10}>
          <Card
            title="Chi phí credit theo model"
            extra={
              <Button
                type="primary"
                size="small"
                icon={<SaveOutlined />}
                loading={savingCredits}
                onClick={saveCredits}
                disabled={loading}
              >
                Lưu
              </Button>
            }
          >
            <Paragraph type="secondary" style={{ fontSize: 12.5, marginTop: -4 }}>
              Số credit trừ vào hạn mức người dùng cho mỗi build. Lưu áp dụng
              ngay (không sửa các gói).
            </Paragraph>
            {loading ? (
              <Skeleton active paragraph={{ rows: 2 }} />
            ) : (
              <Form<CreditsForm>
                form={creditsForm}
                layout="vertical"
                requiredMark={false}
              >
                <Row gutter={[16, 0]}>
                  {(["opus", "sonnet"] as ModelChoice[]).map((m) => (
                    <Col xs={12} key={m}>
                      <Form.Item
                        name={["modelCredits", m]}
                        label={
                          <Tag
                            bordered={false}
                            color={m === "opus" ? "purple" : "blue"}
                          >
                            {MODEL_LABEL[m]}
                          </Tag>
                        }
                        rules={[{ required: true, message: "Bắt buộc" }]}
                      >
                        <InputNumber
                          min={0}
                          step={1}
                          style={{ width: "100%" }}
                          addonAfter="credit"
                        />
                      </Form.Item>
                    </Col>
                  ))}
                </Row>
              </Form>
            )}
            <Text type="secondary" style={{ fontSize: 12 }}>
              Quản lý đầy đủ giá &amp; gói tại{" "}
              <Link href="/admin/billing">Gói &amp; Giá →</Link>
            </Text>
          </Card>
        </Col>
      </Row>

      {/* Prompts + limits */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card
            title="Prompt AI"
            extra={<Link href="/admin/settings">Sửa tại Cấu hình →</Link>}
          >
            {loading || !config ? (
              <Skeleton active paragraph={{ rows: 5 }} />
            ) : (
              <Space direction="vertical" size={12} style={{ width: "100%" }}>
                {PROMPT_FIELDS.map((f) => {
                  const v = config.prompts[f.key] ?? "";
                  return (
                    <div
                      key={f.key}
                      style={{
                        border: `1px solid ${V.border}`,
                        borderRadius: 10,
                        padding: "10px 12px",
                        background: V.surfaceAlt,
                      }}
                    >
                      <Text strong style={{ fontSize: 13 }}>
                        {f.label}
                      </Text>
                      <Paragraph
                        type="secondary"
                        ellipsis={{ rows: 2 }}
                        style={{
                          margin: "4px 0 0",
                          fontFamily: "monospace",
                          fontSize: 12,
                        }}
                      >
                        {v || "—"}
                      </Paragraph>
                    </div>
                  );
                })}
              </Space>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card
            title="Giới hạn AI"
            extra={<Link href="/admin/settings">Cấu hình →</Link>}
          >
            {loading || !config ? (
              <Skeleton active paragraph={{ rows: 3 }} />
            ) : (
              <Space direction="vertical" size={12} style={{ width: "100%" }}>
                {[
                  {
                    label: "Số lần thử sửa lỗi tối đa",
                    value: num(config.limits.maxFixAttempts),
                  },
                  {
                    label: "Giới hạn chi phí mỗi build",
                    value: usd(config.limits.costLimitUsd),
                  },
                  {
                    label: "Job chạy đồng thời tối đa",
                    value: num(config.limits.maxConcurrentJobs),
                  },
                  {
                    label: "Tính năng cốt lõi (v0) tối đa",
                    value: num(config.limits.maxCoreFeaturesV0),
                  },
                ].map((r) => (
                  <div
                    key={r.label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      border: `1px solid ${V.border}`,
                      borderRadius: 10,
                    }}
                  >
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      {r.label}
                    </Text>
                    <Text strong>{r.value}</Text>
                  </div>
                ))}
              </Space>
            )}
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
