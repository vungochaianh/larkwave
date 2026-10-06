"use client";

import { CrownFilled, DeleteOutlined, UserAddOutlined } from "@ant-design/icons";
import { App, Button, Empty, Input, List, Popconfirm, Select, Space, Spin, Tag, Typography } from "antd";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { App as AppEntity, AppMemberEntry, AppMemberRole, Friend } from "@larkwave/shared";
import { useI18n } from "@larkwave/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { UserAvatar } from "@/components/UserAvatar";

const { Title, Text, Paragraph } = Typography;

/**
 * Project collaboration panel: the owner invites members by email (editor /
 * viewer) and manages roles; members see the roster and can leave.
 */
export default function MembersSection({
  app,
  onChanged,
}: {
  app: AppEntity;
  onChanged?: () => void;
}) {
  const { message } = App.useApp();
  const { t } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const isOwner = !app.role || app.role === "owner";

  const [members, setMembers] = useState<AppMemberEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppMemberRole>("editor");
  const [inviting, setInviting] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendBusy, setFriendBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMembers(await api.appMembers(app.id));
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [app.id, message]);

  useEffect(() => {
    void load();
  }, [load]);

  // Owner: load the friends list so they can invite a friend in one click.
  useEffect(() => {
    if (!isOwner) return;
    api.friends().then(setFriends).catch(() => setFriends([]));
  }, [isOwner]);

  const inviteFriend = async (f: Friend) => {
    setFriendBusy(f.id);
    try {
      await api.addAppMember(app.id, f.email, role);
      message.success(`${t("build.invited", "Đã mời")} ${f.name || f.email}.`);
      void load();
      onChanged?.();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setFriendBusy(null);
    }
  };

  const invite = async () => {
    const e = email.trim();
    if (!e) return;
    setInviting(true);
    try {
      await api.addAppMember(app.id, e, role);
      message.success(t("build.memberAdded", "Đã thêm thành viên."));
      setEmail("");
      void load();
      onChanged?.();
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setInviting(false);
    }
  };

  const changeRole = async (userId: string, r: AppMemberRole) => {
    try {
      await api.updateAppMember(app.id, userId, r);
      void load();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const remove = async (userId: string) => {
    try {
      await api.removeAppMember(app.id, userId);
      void load();
      onChanged?.();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const leave = async () => {
    if (!user) return;
    try {
      await api.removeAppMember(app.id, user.id);
      message.success(t("build.leftProject", "Đã rời dự án."));
      router.push("/apps");
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <div>
        <Title level={4} style={{ margin: 0 }}>
          {t("build.collaborate", "Cộng tác")}
        </Title>
        <Paragraph type="secondary" style={{ margin: "4px 0 0" }}>
          {isOwner
            ? t("build.collabOwnerDesc", "Mời bạn bè cùng xem hoặc chỉnh sửa dự án này.")
            : t("build.collabMemberDesc", "Bạn là thành viên của dự án này.")}
        </Paragraph>
      </div>

      {isOwner && (
        <Space.Compact style={{ width: "100%" }}>
          <Input
            placeholder={t("build.collabEmailPlaceholder", "Email người cộng tác…")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onPressEnter={() => void invite()}
            prefix={<UserAddOutlined style={{ color: "#9AA3B5" }} />}
          />
          <Select<AppMemberRole>
            value={role}
            onChange={setRole}
            style={{ width: 130 }}
            options={[
              { value: "editor", label: t("build.roleEditor", "Chỉnh sửa") },
              { value: "viewer", label: t("build.roleViewer", "Chỉ xem") },
            ]}
          />
          <Button type="primary" loading={inviting} onClick={() => void invite()}>
            {t("build.invite", "Mời")}
          </Button>
        </Space.Compact>
      )}

      {/* Quick-invite from your friends list (owner only). */}
      {isOwner &&
        (() => {
          const memberEmails = new Set(members.map((m) => m.user.email));
          const invitable = friends.filter((f) => !memberEmails.has(f.email));
          if (invitable.length === 0) return null;
          return (
            <div>
              <Text type="secondary" style={{ fontSize: 12.5, fontWeight: 600 }}>
                {t("build.inviteFromFriends", "MỜI TỪ BẠN BÈ")}
              </Text>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                {invitable.map((f) => (
                  <Button
                    key={f.id}
                    size="small"
                    icon={<UserAddOutlined />}
                    loading={friendBusy === f.id}
                    onClick={() => void inviteFriend(f)}
                  >
                    {f.name || f.email}
                  </Button>
                ))}
              </div>
            </div>
          );
        })()}

      {/* Owner row */}
      <List
        header={<Text type="secondary" style={{ fontSize: 12.5, fontWeight: 600 }}>{t("build.membersHeader", "THÀNH VIÊN")}</Text>}
        loading={loading && { indicator: <Spin /> }}
        locale={{ emptyText: <Empty description={t("build.noCollaborators", "Chưa có cộng tác viên nào.")} /> }}
        dataSource={members}
        renderItem={(m) => (
          <List.Item
            actions={
              isOwner
                ? [
                    <Select
                      key="role"
                      size="small"
                      value={m.role}
                      style={{ width: 120 }}
                      onChange={(r) => void changeRole(m.user.id, r)}
                      options={[
                        { value: "editor", label: t("build.roleEditor", "Chỉnh sửa") },
                        { value: "viewer", label: t("build.roleViewer", "Chỉ xem") },
                      ]}
                    />,
                    <Popconfirm
                      key="rm"
                      title={t("build.removeMemberConfirm", "Gỡ thành viên?")}
                      okText={t("build.remove", "Gỡ")}
                      cancelText={t("build.cancel", "Huỷ")}
                      onConfirm={() => void remove(m.user.id)}
                    >
                      <Button type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>,
                  ]
                : [
                    <Tag key="role">
                      {m.role === "editor"
                        ? t("build.roleEditor", "Chỉnh sửa")
                        : t("build.roleViewer", "Chỉ xem")}
                    </Tag>,
                  ]
            }
          >
            <List.Item.Meta
              avatar={<UserAvatar name={m.user.name} avatarUrl={m.user.avatarUrl} size={38} />}
              title={m.user.name || m.user.email}
              description={m.user.email}
            />
          </List.Item>
        )}
      />

      {!isOwner && (
        <Popconfirm title={t("build.leaveProjectConfirm", "Rời khỏi dự án này?")} okText={t("build.leave", "Rời")} cancelText={t("build.cancel", "Huỷ")} onConfirm={() => void leave()}>
          <Button danger block>
            {t("build.leaveProject", "Rời dự án")}
          </Button>
        </Popconfirm>
      )}

      <Text type="secondary" style={{ fontSize: 12 }}>
        <CrownFilled style={{ color: "#F59E0B", marginInlineEnd: 6 }} />
        {t("build.owner", "Chủ sở hữu")}: {app.owner?.name || app.owner?.email || "—"}.{" "}
        {t(
          "build.ownerNote",
          'Thành viên "Chỉnh sửa" có thể tạo build & sửa app; "Chỉ xem" chỉ xem code và bản chạy.',
        )}
      </Text>
    </Space>
  );
}
