"use client";

import {
  BellOutlined,
  BugOutlined,
  CheckOutlined,
  InfoCircleOutlined,
  MessageOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { Badge, Button, Empty, List, Popover, Typography } from "antd";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { AppNotification, NotificationType } from "@larkwave/shared";
import { useI18n } from "@larkwave/ui";
import { api, streamNotifications } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fromNow } from "@/lib/format";
import { normalizeNotificationLink } from "@/lib/notificationLink";

const { Text } = Typography;

const TYPE_ICON: Record<NotificationType, ReactNode> = {
  message: <MessageOutlined style={{ color: "#6C5CE7" }} />,
  feedback: <BugOutlined style={{ color: "#EF4444" }} />,
  build: <ThunderboltOutlined style={{ color: "#16B98D" }} />,
  system: <InfoCircleOutlined style={{ color: "#9AA3B5" }} />,
};

/** Header bell: realtime unread badge + a popover of recent notifications. */
export default function NotificationBell() {
  const { t } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.notifications();
      setItems(r.items);
      setUnread(r.unread);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void load();
    // Realtime: prepend new notifications + bump the badge.
    const stop = streamNotifications((ev) => {
      if (ev.type === "notification" && ev.notification) {
        const n = ev.notification;
        setItems((prev) => [n, ...prev.filter((x) => x.id !== n.id)].slice(0, 50));
        setUnread((u) => u + 1);
      }
    });
    return stop;
  }, [user, load]);

  if (!user) return null;

  const openItem = (n: AppNotification) => {
    setOpen(false);
    if (!n.read) {
      setItems((p) => p.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      void api.markNotificationRead(n.id).catch(() => {});
    }
    // Link cũ trong CSDL có thể trỏ vào trang đã dời chỗ — nắn lại thay vì đẩy thẳng ra 404.
    if (n.link) router.push(normalizeNotificationLink(n.link));
  };

  const markAll = () => {
    setItems((p) => p.map((x) => ({ ...x, read: true })));
    setUnread(0);
    void api.markAllNotificationsRead().catch(() => {});
  };

  const content = (
    <div style={{ width: 340, maxWidth: "calc(100vw - 32px)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "4px 4px 8px",
        }}
      >
        <Text strong>{t("wcomp.notifTitle", "Thông báo")}</Text>
        {unread > 0 && (
          <Button type="link" size="small" icon={<CheckOutlined />} onClick={markAll}>
            {t("wcomp.notifMarkAllRead", "Đánh dấu đã đọc")}
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("wcomp.notifEmpty", "Chưa có thông báo")} />
      ) : (
        <List
          size="small"
          dataSource={items.slice(0, 8)}
          style={{ maxHeight: 380, overflowY: "auto" }}
          renderItem={(n) => (
            <List.Item
              onClick={() => openItem(n)}
              style={{
                cursor: "pointer",
                background: n.read ? "transparent" : "rgba(108,92,231,0.06)",
                borderRadius: 8,
                padding: "8px 10px",
              }}
            >
              <List.Item.Meta
                avatar={TYPE_ICON[n.type]}
                title={
                  <Text style={{ fontSize: 13, fontWeight: n.read ? 400 : 600 }}>{n.title}</Text>
                }
                description={
                  <span style={{ fontSize: 12, wordBreak: "break-word" }}>
                    {n.body ? <span>{n.body} · </span> : null}
                    <Text type="secondary" style={{ fontSize: 11.5 }}>
                      {fromNow(n.createdAt)}
                    </Text>
                  </span>
                }
              />
            </List.Item>
          )}
        />
      )}
      <div style={{ textAlign: "center", paddingTop: 6 }}>
        <Button
          type="link"
          size="small"
          onClick={() => {
            setOpen(false);
            router.push("/notifications");
          }}
        >
          {t("wcomp.notifViewAll", "Xem tất cả")}
        </Button>
      </div>
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) void load();
      }}
      placement="bottomRight"
      arrow={false}
    >
      <Badge count={unread} size="small" offset={[-2, 2]}>
        <Button type="text" shape="circle" icon={<BellOutlined style={{ fontSize: 18 }} />} aria-label={t("wcomp.notifTitle", "Thông báo")} />
      </Badge>
    </Popover>
  );
}
