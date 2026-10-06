"use client";

import {
  CheckOutlined,
  CloseOutlined,
  MessageOutlined,
  UserAddOutlined,
  UserDeleteOutlined,
} from "@ant-design/icons";
import {
  App,
  Badge,
  Button,
  Card,
  Empty,
  Input,
  List,
  Popconfirm,
  Skeleton,
  Space,
  Spin,
  Tabs,
  Tag,
  Typography,
} from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DiscoverUser, Friend, FriendRequest } from "@larkwave/shared";
import { useI18n } from "@larkwave/ui";
import { api } from "@/lib/api";
import { fromNow } from "@/lib/format";
import { openMessenger } from "@/lib/messenger";
import { CARD_SHADOW } from "@/lib/theme";
import { UserAvatar } from "@/components/UserAvatar";

const { Title, Text } = Typography;

export default function FriendsPage() {
  const { message } = App.useApp();
  const { t } = useI18n();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [discover, setDiscover] = useState<DiscoverUser[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(true);

  const loadDiscover = useCallback(async (q?: string) => {
    setDiscoverLoading(true);
    try {
      const res = await api.discoverUsers(q, 1, 24);
      setDiscover(res.items);
    } catch {
      /* non-fatal */
    } finally {
      setDiscoverLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDiscover();
  }, [loadDiscover]);

  const patchDiscover = (id: string, friendStatus: DiscoverUser["friendStatus"]) =>
    setDiscover((xs) => xs.map((x) => (x.id === id ? { ...x, friendStatus } : x)));

  const addById = async (u: DiscoverUser) => {
    try {
      const r = await api.sendFriendRequestById(u.id);
      message.success(
        r.status === "accepted"
          ? t("social.nowFriends", "Đã kết bạn!")
          : t("social.inviteSent", "Đã gửi lời mời."),
      );
      patchDiscover(u.id, r.status === "accepted" ? "friends" : "pending_out");
      void load();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const load = useCallback(async () => {
    try {
      const [f, r] = await Promise.all([api.friends(), api.friendRequests()]);
      setFriends(f);
      setRequests(r);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  // Deep-link from a notification: /friends?chat=<friendId> pops that chat window.
  const chatDeepLinked = useRef(false);
  useEffect(() => {
    if (chatDeepLinked.current || !friends.length || typeof window === "undefined") return;
    const target = new URLSearchParams(window.location.search).get("chat");
    if (!target) return;
    const f = friends.find((x) => x.id === target);
    if (f) {
      openMessenger(f);
      chatDeepLinked.current = true;
    }
  }, [friends]);

  const addFriend = async () => {
    const e = email.trim();
    if (!e) return;
    setAdding(true);
    try {
      const r = await api.sendFriendRequest(e);
      message.success(
        r.status === "accepted"
          ? t("social.nowFriends", "Đã kết bạn!")
          : t("social.friendInviteSent", "Đã gửi lời mời kết bạn."),
      );
      setEmail("");
      void load();
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setAdding(false);
    }
  };

  const accept = async (userId: string): Promise<boolean> => {
    try {
      await api.acceptFriend(userId);
      message.success(t("social.requestAccepted", "Đã chấp nhận lời mời."));
      void load();
      return true;
    } catch (e) {
      message.error((e as Error).message);
      return false;
    }
  };

  const remove = async (userId: string, label: string) => {
    try {
      await api.removeFriend(userId);
      message.success(label);
      void load();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const incoming = requests.filter((r) => r.direction === "incoming");
  const outgoing = requests.filter((r) => r.direction === "outgoing");

  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <div>
        <Title level={3} style={{ margin: 0 }}>
          {t("social.friends", "Bạn bè")}
        </Title>
        <Text type="secondary">
          {t("social.friendsSubtitle.lw", "Kết bạn, nhắn tin và cùng nhau làm việc trên Larkwave.")}
        </Text>
      </div>

      <Space direction="vertical" size={20} style={{ width: "100%" }}>
        {/* Add friend */}
        <Card style={{ boxShadow: CARD_SHADOW }} styles={{ body: { padding: 16 } }}>
          <Space.Compact style={{ width: "100%", maxWidth: 460 }}>
            <Input
              placeholder={t("social.emailPlaceholder", "Nhập email người bạn muốn kết bạn…")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onPressEnter={() => void addFriend()}
              prefix={<UserAddOutlined style={{ color: "#9AA3B5" }} />}
            />
            <Button type="primary" loading={adding} onClick={() => void addFriend()}>
              {t("social.sendInvite", "Gửi lời mời")}
            </Button>
          </Space.Compact>
        </Card>

        {/* Discover users (all non-private accounts) */}
        <Card
          title={t("social.discoverTitle", "Khám phá người dùng")}
          style={{ boxShadow: CARD_SHADOW }}
          styles={{ body: { padding: 16 } }}
        >
          <Input.Search
            placeholder={t("social.searchNameEmail", "Tìm theo tên hoặc email…")}
            allowClear
            style={{ maxWidth: 460, marginBottom: 14 }}
            onSearch={(v) => void loadDiscover(v.trim() || undefined)}
            name="tw-user-search"
            autoComplete="off"
            data-1p-ignore=""
            data-lpignore="true"
            data-form-type="other"
          />
          {discoverLoading ? (
            <Skeleton active paragraph={{ rows: 2 }} />
          ) : discover.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t("social.noUsersFound", "Không tìm thấy người dùng nào.")}
            />
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(min(240px, 100%), 1fr))",
                gap: 12,
              }}
            >
              {discover.map((u) => (
                <div
                  key={u.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 10px",
                    border: "1px solid #ECEDF3",
                    borderRadius: 10,
                  }}
                >
                  <UserAvatar name={u.name} avatarUrl={u.avatarUrl} size={38} />
                  <Text strong ellipsis style={{ flex: 1, minWidth: 0 }}>
                    {u.name || t("social.userFallback", "Người dùng")}
                  </Text>
                  {u.friendStatus === "friends" ? (
                    <Tag color="success" bordered={false}>
                      {t("social.friends", "Bạn bè")}
                    </Tag>
                  ) : u.friendStatus === "pending_out" ? (
                    <Tag bordered={false}>{t("social.sent", "Đã gửi")}</Tag>
                  ) : u.friendStatus === "pending_in" ? (
                    <Button
                      type="primary"
                      icon={<CheckOutlined />}
                      onClick={() => {
                        // Patch the card to "friends" ONLY after the request
                        // succeeds, so a failed accept doesn't show a false state.
                        void accept(u.id).then((ok) => {
                          if (ok) patchDiscover(u.id, "friends");
                        });
                      }}
                    >
                      {t("social.accept", "Chấp nhận")}
                    </Button>
                  ) : (
                    <Button
                      icon={<UserAddOutlined />}
                      onClick={() => void addById(u)}
                    >
                      {t("social.addFriend", "Kết bạn")}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card style={{ boxShadow: CARD_SHADOW }} styles={{ body: { padding: 8 } }}>
        <Tabs
          items={[
            {
              key: "friends",
              label: `${t("social.friends", "Bạn bè")} (${friends.length})`,
              children: loading ? (
                <Spin style={{ display: "block", margin: "32px auto" }} />
              ) : friends.length === 0 ? (
                <Empty description={t("social.noFriends", "Chưa có bạn bè nào — gửi lời mời ở trên nhé!")} />
              ) : (
                <List
                  grid={{ gutter: 16, xs: 1, sm: 1, md: 2, lg: 2, xl: 2, xxl: 3 }}
                  dataSource={friends}
                  renderItem={(f) => (
                    <List.Item
                      actions={[
                        <Button
                          key="chat"
                          type="primary"
                          ghost
                          icon={<MessageOutlined />}
                          onClick={() => openMessenger(f)}
                        >
                          {t("social.message", "Nhắn tin")}
                        </Button>,
                        <Popconfirm
                          key="rm"
                          title={t("social.unfriendQ", "Huỷ kết bạn?")}
                          okText={t("social.unfriend", "Huỷ kết bạn")}
                          cancelText={t("social.no", "Không")}
                          onConfirm={() => void remove(f.id, t("social.unfriended", "Đã huỷ kết bạn."))}
                        >
                          <Button type="text" danger aria-label={t("social.unfriend", "Huỷ kết bạn")} icon={<UserDeleteOutlined />} />
                        </Popconfirm>,
                      ]}
                    >
                      <List.Item.Meta
                        avatar={<UserAvatar name={f.name} avatarUrl={f.avatarUrl} size={42} />}
                        title={f.name || f.email}
                        description={f.email}
                      />
                    </List.Item>
                  )}
                />
              ),
            },
            {
              key: "requests",
              label: (
                <Badge count={incoming.length} size="small" offset={[10, -2]}>
                  {t("social.requests", "Lời mời")}
                </Badge>
              ),
              children:
                incoming.length === 0 && outgoing.length === 0 ? (
                  <Empty description={t("social.noRequests", "Không có lời mời nào.")} />
                ) : (
                  <Space direction="vertical" size={16} style={{ width: "100%" }}>
                    {incoming.length > 0 && (
                      <div>
                        <Text type="secondary" style={{ fontSize: 12.5, fontWeight: 600 }}>
                          {t("social.incomingRequests", "LỜI MỜI ĐẾN")}
                        </Text>
                        <List
                          grid={{ gutter: 16, xs: 1, sm: 1, md: 2, lg: 2, xl: 2, xxl: 3 }}
                          dataSource={incoming}
                          renderItem={(r) => (
                            <List.Item
                              actions={[
                                <Button
                                  key="ok"
                                  type="primary"
                                  icon={<CheckOutlined />}
                                  onClick={() => void accept(r.user.id)}
                                >
                                  {t("social.accept", "Chấp nhận")}
                                </Button>,
                                <Button
                                  key="no"
                                  aria-label={t("social.reject", "Từ chối lời mời")}
                                  icon={<CloseOutlined />}
                                  onClick={() => void remove(r.user.id, t("social.requestRejected", "Đã từ chối lời mời."))}
                                />,
                              ]}
                            >
                              <List.Item.Meta
                                avatar={<UserAvatar name={r.user.name} avatarUrl={r.user.avatarUrl} size={42} />}
                                title={r.user.name || r.user.email}
                                description={`${r.user.email} · ${fromNow(r.createdAt)}`}
                              />
                            </List.Item>
                          )}
                        />
                      </div>
                    )}
                    {outgoing.length > 0 && (
                      <div>
                        <Text type="secondary" style={{ fontSize: 12.5, fontWeight: 600 }}>
                          {t("social.sentRequests", "ĐÃ GỬI")}
                        </Text>
                        <List
                          grid={{ gutter: 16, xs: 1, sm: 1, md: 2, lg: 2, xl: 2, xxl: 3 }}
                          dataSource={outgoing}
                          renderItem={(r) => (
                            <List.Item
                              actions={[
                                <Tag key="p" color="warning">
                                  {t("social.pending", "Đang chờ")}
                                </Tag>,
                                <Button
                                  key="cancel"
                                  type="text"
                                  danger
                                  onClick={() => void remove(r.user.id, t("social.inviteCancelled", "Đã huỷ lời mời."))}
                                >
                                  {t("social.cancel", "Huỷ")}
                                </Button>,
                              ]}
                            >
                              <List.Item.Meta
                                avatar={<UserAvatar name={r.user.name} avatarUrl={r.user.avatarUrl} size={42} />}
                                title={r.user.name || r.user.email}
                                description={r.user.email}
                              />
                            </List.Item>
                          )}
                        />
                      </div>
                    )}
                  </Space>
                ),
            },
            ]}
          />
        </Card>
      </Space>
    </Space>
  );
}
