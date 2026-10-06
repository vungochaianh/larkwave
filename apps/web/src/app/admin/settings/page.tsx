"use client";

import { ReloadOutlined, SaveOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Row,
  Space,
  Tag,
  Typography,
} from "antd";
import { useCallback, useEffect, useState } from "react";
import {
  TRACKS,
  type PlatformConfig,
} from "@larkwave/shared";
import { api } from "@/lib/api";
import { FullPageSpinner } from "@/components/AuthGuard";
import { trackColor } from "@/lib/format";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const PROMPT_FIELDS: { key: keyof PlatformConfig["prompts"]; label: string }[] =
  [
    { key: "classify", label: "Phân loại (classify)" },
    { key: "spec", label: "Đặc tả (spec)" },
    { key: "codegen", label: "Sinh code (codegen)" },
    { key: "fix", label: "Sửa lỗi (fix)" },
    { key: "guide", label: "Hướng dẫn (guide)" },
  ];

const LIMIT_FIELDS: {
  key: keyof PlatformConfig["limits"];
  label: string;
}[] = [
  { key: "maxCoreFeaturesV0", label: "Số tính năng cốt lõi (v0) tối đa" },
  { key: "maxFixAttempts", label: "Số lần thử sửa lỗi tối đa" },
  { key: "costLimitUsd", label: "Giới hạn chi phí (USD)" },
  { key: "maxConcurrentJobs", label: "Số job chạy đồng thời tối đa" },
];

export default function AdminSettingsPage() {
  const { message } = App.useApp();
  const [config, setConfig] = useState<PlatformConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = await api.getConfig();
      setConfig(cfg);
      form.setFieldsValue({
        prompts: cfg.prompts,
        limits: cfg.limits,
      });
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [form, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!config) return;
    const values = await form.validateFields();
    setSaving(true);
    try {
      const next: PlatformConfig = {
        ...config,
        prompts: { ...config.prompts, ...values.prompts },
        limits: { ...config.limits, ...values.limits },
      };
      const saved = await api.updateConfig(next);
      setConfig(saved);
      message.success("Đã lưu cấu hình");
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !config) return <FullPageSpinner tip="Đang tải cấu hình..." />;

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
            Cấu hình nền tảng
          </Title>
          <Text type="secondary">Phiên bản {config.version}</Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load}>
            Tải lại
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={save}
          >
            Lưu thay đổi
          </Button>
        </Space>
      </div>

      <Form form={form} layout="vertical">
        <Card title="Mẫu prompt" style={{ marginBottom: 24 }}>
          <Space direction="vertical" size="large" style={{ width: "100%" }}>
            {PROMPT_FIELDS.map((f) => (
              <Form.Item
                key={f.key}
                name={["prompts", f.key]}
                label={f.label}
                style={{ marginBottom: 0 }}
              >
                <TextArea
                  autoSize={{ minRows: 3, maxRows: 10 }}
                  style={{ fontFamily: "monospace", fontSize: 13 }}
                />
              </Form.Item>
            ))}
          </Space>
        </Card>

        <Card title="Giới hạn vận hành" style={{ marginBottom: 24 }}>
          <Row gutter={[16, 8]}>
            {LIMIT_FIELDS.map((f) => (
              <Col xs={24} sm={12} key={f.key}>
                <Form.Item name={["limits", f.key]} label={f.label}>
                  <InputNumber
                    min={0}
                    step={f.key === "costLimitUsd" ? 0.5 : 1}
                    style={{ width: "100%" }}
                  />
                </Form.Item>
              </Col>
            ))}
          </Row>
        </Card>
      </Form>

      <Card title="Tracks (chỉ đọc)">
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          {TRACKS.map((t) => {
            const tc = config.tracks[t];
            return (
              <div key={t}>
                <Space align="center" style={{ marginBottom: 8 }}>
                  <Tag color={trackColor[t]} bordered={false}>
                    {t}
                  </Tag>
                  <Text strong>{tc.label}</Text>
                </Space>
                <Descriptions
                  size="small"
                  column={1}
                  bordered
                  styles={{ label: { width: 160 } }}
                  items={[
                    {
                      key: "stack",
                      label: "Stack",
                      children: (
                        <Space wrap>
                          {Object.entries(tc.stack).map(([k, v]) => (
                            <Tag key={k} bordered={false}>
                              {k}: {v}
                            </Tag>
                          ))}
                        </Space>
                      ),
                    },
                    {
                      key: "keywords",
                      label: "Từ khoá nhận diện",
                      children: (
                        <Space wrap>
                          {tc.triggerKeywords.map((k) => (
                            <Tag key={k} bordered={false}>
                              {k}
                            </Tag>
                          ))}
                        </Space>
                      ),
                    },
                    {
                      key: "output",
                      label: "Kết quả",
                      children: tc.output,
                    },
                  ]}
                />
              </div>
            );
          })}
          <Paragraph type="secondary" style={{ margin: 0, fontSize: 12 }}>
            Quy tắc subdomain: {config.subdomainRules.slugify} ·{" "}
            {config.subdomainRules.onConflict} · SSL tự động:{" "}
            {config.subdomainRules.autoSsl ? "có" : "không"}
          </Paragraph>
        </Space>
      </Card>
    </Space>
  );
}
