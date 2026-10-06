'use client';
/**
 * Native desktop port of the website's app collaboration panel
 * (apps/web/.../MembersSection). The owner invites members by email with a
 * role (editor / viewer) and manages roles; members see the roster and leave.
 * Takes only `appId` — it fetches the app to learn the viewer's role/owner.
 */
import { useCallback, useEffect, useState } from 'react';
import { App, Button, Empty, Input, List, Popconfirm, Select, Space, Spin, Tag, Typography } from 'antd';
import { CrownFilled, DeleteOutlined, ExportOutlined, UserAddOutlined } from '@ant-design/icons';
import { apiFetch } from './api';
import { useAccountAuth } from './auth';
import { UserAvatar } from './UserAvatar';

const { Title, Text, Paragraph } = Typography;

/* ───────────────────────── local types ───────────────────────── */
type AppMemberRole = 'editor' | 'viewer';

interface MemberUser {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
}
interface AppMemberEntry {
  user: MemberUser;
  role: AppMemberRole;
}
interface FriendEntry {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
}
interface AppInfo {
  id: string;
  role?: string | null;
  owner?: { name?: string | null; email?: string | null } | null;
}

const ROLE_LABEL: Record<AppMemberRole, string> = {
  editor: 'Chỉnh sửa',
  viewer: 'Chỉ xem',
};
const ROLE_OPTIONS: { value: AppMemberRole; label: string }[] = [
  { value: 'editor', label: 'Chỉnh sửa' },
  { value: 'viewer', label: 'Chỉ xem' },
];

/** App collaborators/members: list, invite by email + role, change role, remove. */
export function MembersView({ appId }: { appId: string }) {
  const { message } = App.useApp();
  const { user } = useAccountAuth();

  const [app, setApp] = useState<AppInfo | null>(null);
  const [members, setMembers] = useState<AppMemberEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AppMemberRole>('editor');
  const [inviting, setInviting] = useState(false);
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [friendBusy, setFriendBusy] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const isOwner = !app?.role || app.role === 'owner';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [info, list] = await Promise.all([
        apiFetch<AppInfo>(`/apps/${appId}`),
        apiFetch<AppMemberEntry[]>(`/apps/${appId}/members`),
      ]);
      setApp(info);
      setMembers(list);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [appId, message]);

  useEffect(() => {
    void load();
  }, [load]);

  // Owner: load the friends list so they can invite a friend in one click.
  useEffect(() => {
    if (!isOwner) return;
    apiFetch<FriendEntry[]>('/friends')
      .then(setFriends)
      .catch(() => setFriends([]));
  }, [isOwner]);

  const inviteFriend = async (f: FriendEntry) => {
    setFriendBusy(f.id);
    try {
      await apiFetch(`/apps/${appId}/members`, { method: 'POST', body: { email: f.email, role } });
      message.success(`Đã mời ${f.name || f.email}.`);
      void load();
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
      await apiFetch(`/apps/${appId}/members`, { method: 'POST', body: { email: e, role } });
      message.success('Đã thêm thành viên.');
      setEmail('');
      void load();
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setInviting(false);
    }
  };

  const changeRole = async (userId: string, r: AppMemberRole) => {
    try {
      await apiFetch(`/apps/${appId}/members/${userId}`, { method: 'PATCH', body: { role: r } });
      void load();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const remove = async (userId: string) => {
    try {
      await apiFetch(`/apps/${appId}/members/${userId}`, { method: 'DELETE' });
      void load();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const leave = async () => {
    if (!user) return;
    setLeaving(true);
    try {
      await apiFetch(`/apps/${appId}/members/${user.id}`, { method: 'DELETE' });
      message.success('Đã rời dự án.');
      void load();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLeaving(false);
    }
  };

  const memberEmails = new Set(members.map((m) => m.user.email));
  const invitableFriends = friends.filter((f) => !memberEmails.has(f.email));

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            Cộng tác
          </Title>
          <Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
            {isOwner
              ? 'Mời bạn bè cùng xem hoặc chỉnh sửa dự án này.'
              : 'Bạn là thành viên của dự án này.'}
          </Paragraph>
        </div>
        <Button
          icon={<ExportOutlined />}
          onClick={() => window.open(`https://toolswave.net/apps/${appId}`, '_blank')}
        >
          Mở trên web
        </Button>
      </div>

      {isOwner && (
        <Space.Compact style={{ width: '100%' }}>
          <Input
            placeholder="Email người cộng tác…"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onPressEnter={() => void invite()}
            prefix={<UserAddOutlined style={{ color: '#9AA3B5' }} />}
          />
          <Select<AppMemberRole>
            value={role}
            onChange={setRole}
            style={{ width: 130 }}
            options={ROLE_OPTIONS}
          />
          <Button type="primary" loading={inviting} onClick={() => void invite()}>
            Mời
          </Button>
        </Space.Compact>
      )}

      {/* Quick-invite from your friends list (owner only). */}
      {isOwner && invitableFriends.length > 0 && (
        <div>
          <Text type="secondary" style={{ fontSize: 12.5, fontWeight: 600 }}>
            MỜI TỪ BẠN BÈ
          </Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {invitableFriends.map((f) => (
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
      )}

      <List<AppMemberEntry>
        header={<Text type="secondary" style={{ fontSize: 12.5, fontWeight: 600 }}>THÀNH VIÊN</Text>}
        loading={loading && { indicator: <Spin /> }}
        locale={{ emptyText: <Empty description="Chưa có cộng tác viên nào." /> }}
        dataSource={members}
        renderItem={(m) => (
          <List.Item
            actions={
              isOwner
                ? [
                    <Select<AppMemberRole>
                      key="role"
                      size="small"
                      value={m.role}
                      style={{ width: 120 }}
                      onChange={(r) => void changeRole(m.user.id, r)}
                      options={ROLE_OPTIONS}
                    />,
                    <Popconfirm
                      key="rm"
                      title="Gỡ thành viên?"
                      okText="Gỡ"
                      cancelText="Huỷ"
                      onConfirm={() => void remove(m.user.id)}
                    >
                      <Button type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>,
                  ]
                : [<Tag key="role">{ROLE_LABEL[m.role]}</Tag>]
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
        <Popconfirm title="Rời khỏi dự án này?" okText="Rời" cancelText="Huỷ" onConfirm={() => void leave()}>
          <Button danger block loading={leaving}>
            Rời dự án
          </Button>
        </Popconfirm>
      )}

      <Text type="secondary" style={{ fontSize: 12 }}>
        <CrownFilled style={{ color: '#F59E0B', marginInlineEnd: 6 }} />
        Chủ sở hữu: {app?.owner?.name || app?.owner?.email || '—'}. Thành viên &quot;Chỉnh
        sửa&quot; có thể tạo build &amp; sửa app; &quot;Chỉ xem&quot; chỉ xem code và bản chạy.
      </Text>
    </Space>
  );
}
