"use client";

import { BugOutlined, DollarOutlined, ReloadOutlined, StarOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Card,
  Col,
  Empty,
  Grid,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import type { Feedback, FeedbackSeverity, FeedbackStatus, MyFeedbackResponse } from "@larkwave/shared";
import { SEVERITY_LABEL } from "@larkwave/shared";
import { useI18n } from "@larkwave/ui";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import FeedbackAttachments from "@/components/FeedbackAttachments";

const { Title, Text, Paragraph } = Typography;

const STATUS_META: Record<FeedbackStatus, { label: string; color: string }> = {
  open: { label: "Đang chờ", color: "gold" },
  resolved: { label: "Đã sửa", color: "green" },
  duplicate: { label: "Trùng lặp", color: "default" },
  rejected: { label: "Từ chối", color: "red" },
};
const SEVERITY_COLOR: Record<FeedbackSeverity, string> = {
  low: "blue",
  medium: "gold",
  high: "orange",
  critical: "red",
};
const vnd = (n: number) => `${(n || 0).toLocaleString("vi-VN")}đ`;

export default function MyReportsPage() {
  const { message } = App.useApp();
  const { t } = useI18n();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [data, setData] = useState<MyFeedbackResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.myFeedback());
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: ColumnsType<Feedback> = [
    {
      title: t("money.colContent", "Nội dung"),
      dataIndex: "message",
      key: "message",
      render: (v: string) => (
        <Text style={{ fontSize: 13 }}>{v.length > 90 ? v.slice(0, 90) + "…" : v}</Text>
      ),
    },
    {
      title: t("money.colSeverity", "Mức độ"),
      dataIndex: "severity",
      key: "severity",
      width: 120,
      render: (s: FeedbackSeverity | null) =>
        s ? (
          <Tag color={SEVERITY_COLOR[s]} bordered={false}>
            {t(`money.severity.${s}`, SEVERITY_LABEL[s])}
          </Tag>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>
            —
          </Text>
        ),
    },
    {
      title: t("money.colPoints", "Điểm"),
      dataIndex: "points",
      key: "points",
      width: 80,
      render: (p: number) => <Text strong>{p || 0}</Text>,
    },
    {
      title: t("money.colReward", "Thưởng"),
      key: "reward",
      width: 150,
      render: (_, r) =>
        r.rewardVnd > 0 ? (
          <Space direction="vertical" size={0}>
            <Text strong style={{ fontSize: 13 }}>
              {vnd(r.rewardVnd)}
            </Text>
            <Tag color={r.rewardPaid ? "green" : "gold"} bordered={false} style={{ marginInlineEnd: 0 }}>
              {r.rewardPaid ? t("money.paidStatus", "Đã thanh toán") : t("money.pendingStatus", "Chờ thanh toán")}
            </Tag>
          </Space>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>
            —
          </Text>
        ),
    },
    {
      title: t("money.colStatus", "Trạng thái"),
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (s: FeedbackStatus) => (
        <Tag color={STATUS_META[s].color} bordered={false}>
          {t(`money.status.${s}`, STATUS_META[s].label)}
        </Tag>
      ),
    },
    {
      title: t("money.colSubmittedAt", "Gửi lúc"),
      dataIndex: "createdAt",
      key: "createdAt",
      width: 140,
      render: (v) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {formatDate(v)}
        </Text>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={isMobile ? 16 : "large"} style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ minWidth: 0, flex: "1 1 220px" }}>
          <Title level={3} style={{ margin: 0, fontSize: isMobile ? 20 : undefined }}>
            <BugOutlined style={{ color: "#6C5CE7", marginInlineEnd: 8 }} />
            {t("money.reportsTitle", "Báo lỗi của tôi")}
          </Title>
          <Text type="secondary">
            {t(
              "money.reportsSubtitle",
              "Bạn là tester của Larkwave — báo lỗi hợp lệ được tính điểm & thưởng. Lỗi trùng sẽ ghi nhận cho người báo đầu tiên.",
            )}
          </Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
          {t("money.reload", "Tải lại")}
        </Button>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title={t("money.totalPoints", "Tổng điểm")}
              value={data?.totalPoints ?? 0}
              prefix={<StarOutlined style={{ color: "#6C5CE7" }} />}
              valueStyle={{ fontSize: isMobile ? 18 : undefined }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title={t("money.resolvedCount", "Lỗi đã được sửa")}
              value={data?.resolvedCount ?? 0}
              valueStyle={{ fontSize: isMobile ? 18 : undefined }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title={t("money.totalReward", "Tổng thưởng")}
              value={vnd(data?.totalRewardVnd ?? 0)}
              prefix={<DollarOutlined style={{ color: "#16B98D" }} />}
              valueStyle={{ fontSize: isMobile ? 18 : undefined }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title={t("money.paidReward", "Đã nhận")}
              value={vnd(data?.paidRewardVnd ?? 0)}
              valueStyle={{ color: "#16B98D", fontSize: isMobile ? 18 : undefined }}
            />
          </Card>
        </Col>
      </Row>

      <Table<Feedback>
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={data?.items ?? []}
        scroll={{ x: 720 }}
        locale={{ emptyText: <Empty description={t("money.reportsEmpty", "Bạn chưa gửi báo lỗi nào")} /> }}
        expandable={{
          expandedRowRender: (r) => (
            <Space direction="vertical" size={10} style={{ width: "100%" }}>
              <Paragraph style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", marginBottom: 0 }}>{r.message}</Paragraph>
              {r.url && (
                <Text type="secondary" style={{ fontSize: 12, wordBreak: "break-all" }}>
                  {t("money.pageLabel", "Trang")}: {r.url}
                </Text>
              )}
              {r.attachments.length > 0 && (
                <FeedbackAttachments
                  attachments={r.attachments}
                  fetcher={(uploadId) => api.getFeedbackAttachment(r.id, uploadId)}
                />
              )}
              {r.adminNote && (
                <div>
                  <Text strong style={{ fontSize: 12.5 }}>
                    {t("money.adminReply", "Phản hồi của admin")}:{" "}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12.5 }}>
                    {r.adminNote}
                  </Text>
                </div>
              )}
            </Space>
          ),
        }}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
      />
    </Space>
  );
}
