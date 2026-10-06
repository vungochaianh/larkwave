"use client";

import { InfoCircleOutlined, ReloadOutlined, SaveOutlined } from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
  Form,
  Input,
  InputNumber,
  Row,
  Space,
  Switch,
  Tag,
  Typography,
} from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useCallback, useEffect, useState } from "react";
import type {
  BillingConfig,
  PlanId,
  ResolvedBillingConfig,
} from "@larkwave/shared";
import { api } from "@/lib/api";
import { FullPageSpinner } from "@/components/AuthGuard";
import { V, BRAND, BLUE } from "@larkwave/ui";

const { Title, Text } = Typography;

const PLANS: { id: PlanId; label: string; color: string }[] = [
  { id: "free", label: "Miễn phí", color: V.textFaint },
  { id: "starter", label: "Khởi đầu", color: BLUE },
  { id: "pro", label: "Chuyên nghiệp", color: BRAND },
  { id: "enterprise", label: "Doanh nghiệp", color: "#FF7AB6" },
];


interface BillingForm {
  vndPerUsd: number;
  plans: Record<PlanId, { priceVnd: number; monthlyTokens: number }>;
  freePlanEnabled: boolean;
  discount: { percent: number; until: Dayjs | null; label: string };
}

export default function AdminBillingPage() {
  const { message } = App.useApp();
  const [form] = Form.useForm<BillingForm>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const apply = useCallback(
    (cfg: ResolvedBillingConfig) => {
      form.setFieldsValue({
        vndPerUsd: cfg.vndPerUsd,
        plans: cfg.plans,
        freePlanEnabled: cfg.freePlanEnabled,
        discount: {
          percent: cfg.discount?.percent ?? 0,
          until: cfg.discount?.until ? dayjs(cfg.discount.until) : null,
          label: cfg.discount?.label ?? "",
        },
      });
    },
    [form],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = await api.adminGetBilling();
      apply(cfg);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [apply, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      // PUT accepts a partial BillingConfig; we send the full edited shape.
      const payload: BillingConfig = {
        vndPerUsd: values.vndPerUsd,
        plans: values.plans,
        freePlanEnabled: values.freePlanEnabled,
        discount: {
          percent: values.discount?.percent ?? 0,
          until: values.discount?.until ? values.discount.until.toISOString() : null,
          label: values.discount?.label?.trim() || null,
        },
      };
      const saved = await api.adminSaveBilling(payload);
      apply(saved);
      message.success("Đã lưu gói & giá");
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <FullPageSpinner tip="Đang tải gói & giá..." />;

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
            Gói & Giá
          </Title>
          <Text type="secondary">Sửa runtime — không cần deploy lại</Text>
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
            Lưu
          </Button>
        </Space>
      </div>

      <Alert
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        message="Thay đổi áp dụng ngay cho hạn mức, giá hiển thị trên /pricing và tính lợi nhuận."
        description="Tính năng của từng gói không sửa ở đây."
      />

      <Form<BillingForm> form={form} layout="vertical" requiredMark={false}>
        {/* Free-plan availability toggle */}
        <Card title="Chế độ miễn phí" style={{ marginBottom: 24 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              flexWrap: "wrap",
            }}
          >
            <Form.Item
              name="freePlanEnabled"
              valuePropName="checked"
              label="Cho phép dùng gói miễn phí"
              style={{ marginBottom: 0 }}
            >
              <Switch checkedChildren="Bật" unCheckedChildren="Tắt" />
            </Form.Item>
            <Text type="secondary" style={{ fontSize: 12.5, maxWidth: 560 }}>
              Khi <Text strong>TẮT</Text>: người dùng gói miễn phí không tạo được
              app (bị nhắc nâng cấp), và gói miễn phí hiển thị “tạm ngưng” trên
              trang giá. Admin không bị ảnh hưởng. Áp dụng ngay, không cần deploy.
            </Text>
          </div>
        </Card>

        {/* Promotional discount campaign */}
        <Card title="Chiến dịch khuyến mãi (giảm giá)" style={{ marginBottom: 24 }}>
          <Row gutter={[16, 8]}>
            <Col xs={12} sm={6}>
              <Form.Item
                name={["discount", "percent"]}
                label="Giảm giá (%)"
                tooltip="0 = tắt. Áp dụng cho TẤT CẢ gói trả phí."
              >
                <InputNumber min={0} max={90} step={5} style={{ width: "100%" }} addonAfter="%" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={10}>
              <Form.Item
                name={["discount", "until"]}
                label="Kết thúc lúc"
                tooltip="Để trống = không giới hạn thời gian."
              >
                <DatePicker
                  showTime
                  format="DD/MM/YYYY HH:mm"
                  style={{ width: "100%" }}
                  placeholder="Không giới hạn"
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name={["discount", "label"]} label="Nhãn (tuỳ chọn)">
                <Input placeholder="vd: Ưu đãi ra mắt" maxLength={60} />
              </Form.Item>
            </Col>
          </Row>
          <Text type="secondary" style={{ fontSize: 12.5 }}>
            Khi bật, trang <Text strong>/pricing</Text> hiện banner đếm ngược + giá gạch ngang, và số
            tiền thanh toán (mã QR) tự giảm theo. SePay khớp đúng số tiền đã giảm để{" "}
            <Text strong>tự động duyệt gói</Text>.
          </Text>
        </Card>

        {/* Exchange rate */}
        <Card title="Tỷ giá" style={{ marginBottom: 24 }}>
          <Row gutter={[16, 8]}>
            <Col xs={24} sm={8}>
              <Form.Item
                name="vndPerUsd"
                label="Tỷ giá (VND / 1 USD)"
                rules={[{ required: true, message: "Bắt buộc" }]}
                tooltip="Dùng để quy đổi doanh thu (đ) ↔ chi phí API (USD)"
              >
                <InputNumber
                  min={1}
                  step={500}
                  style={{ width: "100%" }}
                  addonAfter="đ"
                  formatter={(v) =>
                    `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
                  }
                  parser={(v) => Number(`${v}`.replace(/\./g, "")) as 1}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={16}>
              <Text type="secondary" style={{ fontSize: 13 }}>
                Hạn mức mỗi gói tính theo <Text strong>token/tháng</Text> (= 100% của gói). Mỗi
                lượt AI hosted trừ % theo token thực dùng — chỉnh ở phần “Cấu hình gói” bên dưới.
              </Text>
            </Col>
          </Row>
        </Card>

        {/* Per-plan editor */}
        <Card title="Cấu hình gói">
          {PLANS.map((p, i) => (
            <div key={p.id}>
              {i > 0 && <Divider style={{ margin: "8px 0 20px" }} />}
              <Space align="center" style={{ marginBottom: 12 }}>
                <Tag bordered={false} color={p.color} style={{ fontWeight: 600 }}>
                  {p.label}
                </Tag>
                <Text type="secondary" style={{ fontSize: 12.5 }}>
                  ({p.id})
                </Text>
              </Space>
              <Row gutter={[16, 0]}>
                <Col xs={24} sm={8}>
                  <Form.Item
                    name={["plans", p.id, "priceVnd"]}
                    label="Giá (VND / tháng)"
                    rules={[{ required: true, message: "Bắt buộc" }]}
                  >
                    <InputNumber
                      min={0}
                      step={10000}
                      style={{ width: "100%" }}
                      addonAfter="đ"
                      formatter={(v) =>
                        `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
                      }
                      parser={(v) => Number(`${v}`.replace(/\./g, "")) as 0}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={16}>
                  <Form.Item
                    name={["plans", p.id, "monthlyTokens"]}
                    label="Hạn mức token / tháng (= 100%)"
                    rules={[{ required: true, message: "Bắt buộc" }]}
                    tooltip="100% của gói. Mỗi lượt AI trừ % = token thực dùng ÷ hạn mức."
                  >
                    <InputNumber
                      min={0}
                      step={100000}
                      style={{ width: "100%" }}
                      formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
                      parser={(v) => Number(`${v}`.replace(/\./g, "")) as 0}
                    />
                  </Form.Item>
                </Col>
              </Row>
            </div>
          ))}
        </Card>
      </Form>
    </Space>
  );
}
