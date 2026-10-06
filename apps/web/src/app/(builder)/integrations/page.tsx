"use client";

import {
  ApiOutlined,
  CloudDownloadOutlined,
  GithubFilled,
  GitlabFilled,
  SearchOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Empty,
  Grid,
  Input,
  Modal,
  Space,
  Typography,
} from "antd";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useI18n } from "@larkwave/ui";

const { Title, Paragraph, Text } = Typography;

interface Integration {
  id: string;
  name: string;
  /** Emoji or single-letter avatar. */
  avatar: string;
  accent: string;
  description: string;
  /** Short "cách dùng" guidance (Vietnamese). */
  howto: string;
}

const INTEGRATIONS: Integration[] = [
  {
    id: "stripe",
    name: "Stripe",
    avatar: "💳",
    accent: "#635bff",
    description: "Nhận thanh toán, đăng ký và hoá đơn trực tuyến.",
    howto: "Tạo Secret Key trong Dashboard Stripe, thêm vào cấu hình app (biến môi trường STRIPE_SECRET_KEY) rồi gọi Stripe API để tạo Checkout Session hoặc PaymentIntent.",
  },
  {
    id: "salesforce",
    name: "Salesforce",
    avatar: "☁️",
    accent: "#00a1e0",
    description: "Đồng bộ khách hàng tiềm năng và dữ liệu CRM.",
    howto: "Tạo Connected App trong Salesforce để lấy Client ID/Secret, xác thực qua OAuth2, sau đó gọi REST API (/services/data) từ code của app.",
  },
  {
    id: "slack",
    name: "Slack",
    avatar: "💬",
    accent: "#4a154b",
    description: "Gửi thông báo và tin nhắn vào kênh Slack.",
    howto: "Tạo Incoming Webhook hoặc Bot Token trong Slack App, lưu vào cấu hình app, rồi POST nội dung tới webhook URL để gửi tin nhắn.",
  },
  {
    id: "notion",
    name: "Notion",
    avatar: "📝",
    accent: "#111827",
    description: "Đọc/ghi dữ liệu vào database Notion.",
    howto: "Tạo Internal Integration trong Notion, lấy Integration Token, share database với integration, rồi gọi Notion API (/v1/pages, /v1/databases).",
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    avatar: "📅",
    accent: "#4285f4",
    description: "Tạo và quản lý sự kiện lịch.",
    howto: "Bật Google Calendar API trong Google Cloud Console, tạo OAuth credentials, xác thực người dùng, rồi gọi events.insert/list để thao tác sự kiện.",
  },
  {
    id: "google-drive",
    name: "Google Drive",
    avatar: "📁",
    accent: "#0f9d58",
    description: "Lưu trữ và truy xuất tệp trên Drive.",
    howto: "Bật Drive API, dùng OAuth2 để cấp quyền, rồi gọi files.create/list/get với access token để upload và đọc tệp.",
  },
  {
    id: "gmail",
    name: "Gmail",
    avatar: "✉️",
    accent: "#ea4335",
    description: "Gửi email giao dịch qua tài khoản Gmail.",
    howto: "Bật Gmail API trong Google Cloud, xác thực OAuth2 với scope gmail.send, rồi gọi users.messages.send với nội dung email đã mã hoá base64.",
  },
  {
    id: "google-sheets",
    name: "Google Sheets",
    avatar: "📊",
    accent: "#0f9d58",
    description: "Đọc/ghi bảng tính như một cơ sở dữ liệu nhẹ.",
    howto: "Bật Sheets API, dùng Service Account hoặc OAuth2, share sheet với tài khoản, rồi gọi spreadsheets.values.get/update để đọc ghi dữ liệu.",
  },
  {
    id: "hubspot",
    name: "HubSpot",
    avatar: "🟠",
    accent: "#ff7a59",
    description: "Quản lý contact, deal và marketing.",
    howto: "Tạo Private App trong HubSpot để lấy Access Token, thêm vào cấu hình, rồi gọi CRM API (/crm/v3/objects) để tạo/cập nhật contact và deal.",
  },
  {
    id: "openai",
    name: "OpenAI",
    avatar: "🤖",
    accent: "#10a37f",
    description: "Thêm tính năng AI: chat, tóm tắt, sinh nội dung.",
    howto: "Lấy API Key tại platform.openai.com, lưu vào biến môi trường OPENAI_API_KEY, rồi gọi endpoint chat/completions từ backend của app.",
  },
  {
    id: "webhook",
    name: "Webhook",
    avatar: "🔗",
    accent: "#6C5CE7",
    description: "Nhận hoặc gửi sự kiện realtime qua HTTP.",
    howto: "Cấu hình một URL nhận trong app, hoặc POST payload JSON tới URL đích khi có sự kiện. Xác thực bằng secret/signature trong header.",
  },
  {
    id: "rest-api",
    name: "REST API",
    avatar: "🌐",
    accent: "#6c5ce7",
    description: "Kết nối tới bất kỳ dịch vụ REST nào.",
    howto: "Khai báo base URL và API key của dịch vụ trong cấu hình app, rồi dùng fetch/axios để gọi các endpoint với header Authorization phù hợp.",
  },
];

export default function IntegrationsPage() {
  const { t } = useI18n();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<Integration | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return INTEGRATIONS;
    return INTEGRATIONS.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <Space direction="vertical" size={24} style={{ width: "100%" }}>
      <div>
        <Space align="center" size="middle">
          <span
            style={{
              display: "inline-flex",
              width: 38,
              height: 38,
              borderRadius: 10,
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(108,92,231,0.12)",
              border: "1px solid rgba(108,92,231,0.30)",
              color: "#6C5CE7",
              fontSize: 18,
            }}
          >
            <ApiOutlined />
          </span>
          <Title level={2} style={{ margin: 0 }}>
            Integrations
          </Title>
        </Space>
        <Paragraph
          type="secondary"
          style={{ marginTop: 10, marginBottom: 0, maxWidth: 640 }}
        >
          {t("social.integrationsSubtitle", "Kết nối app của bạn với các dịch vụ phổ biến. Xem hướng dẫn để biết cách thêm API key và gọi API ngay trong code của app.")}
        </Paragraph>
      </div>

      {/* Nhập từ Git — connect GitLab/GitHub, import a repo, push back. */}
      <Card
        styles={{ body: { padding: isMobile ? 16 : 20 } }}
        style={{ border: "1px solid rgba(108,92,231,0.30)" }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              width: 46,
              height: 46,
              minWidth: 46,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              background: "rgba(108,92,231,0.12)",
              color: "#6C5CE7",
            }}
          >
            <CloudDownloadOutlined />
          </span>
          <div style={{ minWidth: 0, flex: "1 1 260px" }}>
            <Title level={5} style={{ margin: 0 }}>
              {t("social.importFromGit", "Nhập từ Git")}
            </Title>
            <Text type="secondary" style={{ fontSize: 13 }}>
              {t("social.importFromGitDesc", "Kết nối GitLab/GitHub, nhập một repository và đẩy thay đổi ngược lại repo.")}
            </Text>
          </div>
          <Space wrap>
            <Link href="/import?provider=gitlab">
              <Button icon={<GitlabFilled style={{ color: "#FC6D26" }} />}>
                GitLab
              </Button>
            </Link>
            <Link href="/import?provider=github">
              <Button icon={<GithubFilled style={{ color: "#1E2230" }} />}>
                GitHub
              </Button>
            </Link>
            <Link href="/import">
              <Button type="primary" icon={<CloudDownloadOutlined />}>
                {t("social.importRepo", "Nhập repo")}
              </Button>
            </Link>
          </Space>
        </div>
      </Card>

      <Input
        size="large"
        allowClear
        prefix={<SearchOutlined style={{ color: "#9AA3B5" }} />}
        placeholder={t("social.searchService", "Tìm dịch vụ… (Stripe, Slack, OpenAI…)")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ maxWidth: 440 }}
      />

      {filtered.length === 0 ? (
        <Empty description={t("social.noService", "Không tìm thấy dịch vụ")} style={{ padding: "48px 0" }} />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 100%), 1fr))",
            gap: 16,
          }}
        >
          {filtered.map((i) => (
            <Card key={i.id} hoverable styles={{ body: { padding: 18 } }}>
              <Space direction="vertical" size={12} style={{ width: "100%" }}>
                <Space align="center" size={12}>
                  <span
                    style={{
                      display: "inline-flex",
                      width: 42,
                      height: 42,
                      borderRadius: 10,
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 22,
                      background: "#F7F8FC",
                      border: `1px solid ${i.accent}33`,
                    }}
                  >
                    {i.avatar}
                  </span>
                  <Title level={5} style={{ margin: 0 }}>
                    {i.name}
                  </Title>
                </Space>
                <Text
                  type="secondary"
                  style={{ fontSize: 13.5, lineHeight: 1.5, minHeight: 40 }}
                >
                  {t(`social.intg.${i.id}.desc`, i.description)}
                </Text>
                <Button block onClick={() => setActive(i)}>
                  {t("social.guide", "Hướng dẫn")}
                </Button>
              </Space>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!active}
        onCancel={() => setActive(null)}
        width={screens.md ? 520 : "94vw"}
        title={
          active ? (
            <Space>
              <span style={{ fontSize: 20 }}>{active.avatar}</span>
              <span>{t("social.guideFor", "Hướng dẫn dùng")} {active.name}</span>
            </Space>
          ) : null
        }
        footer={
          <Button type="primary" onClick={() => setActive(null)}>
            {t("social.gotIt", "Đã hiểu")}
          </Button>
        }
      >
        {active && (
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Paragraph style={{ marginBottom: 0 }}>{t(`social.intg.${active.id}.howto`, active.howto)}</Paragraph>
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              {t("social.integrationTip", "Mẹo: mô tả tích hợp này trong prompt khi tạo/sửa app để Larkwave tự sinh code gọi API, sau đó dán API key của bạn vào phần cấu hình.")}
            </Text>
          </Space>
        )}
      </Modal>
    </Space>
  );
}
