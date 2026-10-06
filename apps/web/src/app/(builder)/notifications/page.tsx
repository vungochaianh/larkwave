"use client";

import {
  BellOutlined,
  BugOutlined,
  CheckOutlined,
  InfoCircleOutlined,
  MessageOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { App, Button, Empty, List, Space, Tag, Typography } from "antd";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { AppNotification, NotificationType } from "@larkwave/shared";
import { useI18n } from "@larkwave/ui";
import { api, streamNotifications } from "@/lib/api";
import { fromNow } from "@/lib/format";
import { normalizeNotificationLink } from "@/lib/notificationLink";

const { Title, Text } = Typography;

const TYPE_ICON: Record<NotificationType, ReactNode> = {
  message: <MessageOutlined style={{ color: "#6C5CE7" }} />,
  feedback: <BugOutlined style={{ color: "#EF4444" }} />,
  build: <ThunderboltOutlined style={{ color: "#16B98D" }} />,
  system: <InfoCircleOutlined style={{ color: "#9AA3B5" }} />,
};
const TYPE_LABEL: Record<NotificationType, { key: string; vi: string }> = {
  message: { key: "social.notifMessage", vi: "Tin nhắn" },
  feedback: { key: "social.notifFeedback", vi: "Báo lỗi" },
  build: { key: "social.notifBuild", vi: "Build" },
  system: { key: "social.notifSystem", vi: "Hệ thống" },
};

export default function NotificationsPage() {
  const { message } = App.useApp();
  const { t } = useI18n();
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.notifications();
      setItems(r.items);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
    const stop = streamNotifications((ev) => {
      if (ev.type === "notification" && ev.notification) {
        const n = ev.notification;
        // Cap the live-streamed list so a long-lived session doesn't grow unbounded.
        setItems((prev) => [n, ...prev.filter((x) => x.id !== n.id)].slice(0, 200));
      }
    });
    return stop;
  }, [load]);

  const open = (n: AppNotification) => {
    if (!n.read) {
      setItems((p) => p.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      void api.markNotificationRead(n.id).catch(() => {});
    }
    // Link cũ trong CSDL có thể trỏ vào trang đã dời chỗ — nắn lại thay vì đẩy thẳng ra 404.
    if (n.link) router.push(normalizeNotificationLink(n.link));
  };

  const markAll = async () => {
    setItems((p) => p.map((x) => ({ ...x, read: true })));
    try {
      await api.markAllNotificationsRead();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const unread = items.filter((n) => !n.read).length;

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ minWidth: 0, maxWidth: "100%" }}>
          <Title level={3} style={{ margin: 0 }}>
            <BellOutlined style={{ color: "#6C5CE7", marginInlineEnd: 8 }} />
            {t("social.notifications", "Thông báo")}
          </Title>
          <Text type="secondary">{t("social.notificationsSubtitle", "Tin nhắn, báo lỗi, app build xong… — bấm để mở đúng nội dung.")}</Text>
        </div>
        {unread > 0 && (
          <Button icon={<CheckOutlined />} onClick={() => void markAll()}>
            {t("social.markAllRead", "Đánh dấu tất cả đã đọc")}
          </Button>
        )}
      </div>

      <List
        loading={loading}
        locale={{ emptyText: <Empty description={t("social.noNotifications", "Chưa có thông báo nào")} /> }}
        dataSource={items}
        renderItem={(n) => (
          <List.Item
            onClick={() => open(n)}
            style={{
              cursor: "pointer",
              background: n.read ? "#fff" : "rgba(108,92,231,0.06)",
              border: "1px solid #ECEDF3",
              borderRadius: 12,
              marginBottom: 8,
              padding: "12px 16px",
            }}
          >
            <List.Item.Meta
              avatar={TYPE_ICON[n.type]}
              title={
                <Space size={8} wrap style={{ maxWidth: "100%" }}>
                  <Text style={{ fontWeight: n.read ? 400 : 600, wordBreak: "break-word" }}>{n.title}</Text>
                  <Tag bordered={false} style={{ marginInlineEnd: 0 }}>{t(TYPE_LABEL[n.type].key, TYPE_LABEL[n.type].vi)}</Tag>
                </Space>
              }
              description={
                <span style={{ wordBreak: "break-word" }}>
                  {n.body ? <Text style={{ fontSize: 13, wordBreak: "break-word" }}>{n.body}</Text> : null}
                  <Text type="secondary" style={{ fontSize: 12, marginInlineStart: n.body ? 8 : 0 }}>
                    {fromNow(n.createdAt)}
                  </Text>
                </span>
              }
            />
          </List.Item>
        )}
      />
    </Space>
  );
}
