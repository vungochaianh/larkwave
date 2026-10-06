'use client';
import { useCallback, useEffect, useState } from 'react';
import { App, Badge, Button, Card, Empty, Input, List, Popconfirm, Skeleton, Space, Spin, Tabs, Tag, Typography } from 'antd';
import { CheckOutlined, CloseOutlined, MessageOutlined, UserAddOutlined, UserDeleteOutlined } from '@ant-design/icons';
import { CARD_SHADOW, V } from '../theme';
import { accountApi, fromNow, type DiscoverUser, type Friend, type FriendRequest } from './api';
import { UserAvatar } from './UserAvatar';
import { openMessenger } from './messenger';

const { Title, Text } = Typography;

/**
 * Native desktop port of the website's /friends — friends list, requests, and
 * user discovery. Direct messaging opens the IN-APP messenger (MessengerWidget).
 */
export function FriendsView() {
  const { message } = App.useApp();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [discover, setDiscover] = useState<DiscoverUser[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(true);

  // Open the in-app DM window (no longer shells out to the website).
  const openChat = (f: Friend) => openMessenger(f);

  const loadDiscover = useCallback(async (q?: string) => {
    setDiscoverLoading(true);
    try {
      const res = await accountApi.discoverUsers(q, 1, 24);
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

  const patchDiscover = (id: string, friendStatus: DiscoverUser['friendStatus']) =>
    setDiscover((xs) => xs.map((x) => (x.id === id ? { ...x, friendStatus } : x)));

  const load = useCallback(async () => {
    try {
      const [f, r] = await Promise.all([accountApi.friends(), accountApi.friendRequests()]);
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

  const addById = async (u: DiscoverUser) => {
    try {
      const r = await accountApi.sendFriendRequestById(u.id);
      message.success(r.status === 'accepted' ? 'Đã kết bạn!' : 'Đã gửi lời mời.');
      patchDiscover(u.id, r.status === 'accepted' ? 'friends' : 'pending_out');
      void load();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const addFriend = async () => {
    const e = email.trim();
    if (!e) return;
    setAdding(true);
    try {
      const r = await accountApi.sendFriendRequest(e);
      message.success(r.status === 'accepted' ? 'Đã kết bạn!' : 'Đã gửi lời mời kết bạn.');
      setEmail('');
      void load();
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setAdding(false);
    }
  };

  const accept = async (userId: string): Promise<boolean> => {
    try {
      await accountApi.acceptFriend(userId);
      message.success('Đã chấp nhận lời mời.');
      void load();
      return true;
    } catch (e) {
      message.error((e as Error).message);
      return false;
    }
  };

  const remove = async (userId: string, label: string) => {
    try {
      await accountApi.removeFriend(userId);
      message.success(label);
      void load();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const incoming = requests.filter((r) => r.direction === 'incoming');
  const outgoing = requests.filter((r) => r.direction === 'outgoing');

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <div>
        <Title level={3} style={{ margin: 0 }}>Bạn bè</Title>
        <Text type="secondary">Kết bạn, nhắn tin và cùng nhau vibe code trên Larkwave.</Text>
      </div>

      <Space direction="vertical" size={20} style={{ width: '100%' }}>
        <Card style={{ boxShadow: CARD_SHADOW }} styles={{ body: { padding: 16 } }}>
          <Space.Compact style={{ width: '100%', maxWidth: 460 }}>
            <Input
              placeholder="Nhập email người bạn muốn kết bạn…"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onPressEnter={() => void addFriend()}
              prefix={<UserAddOutlined style={{ color: V.textFaint }} />}
            />
            <Button type="primary" loading={adding} onClick={() => void addFriend()}>Gửi lời mời</Button>
          </Space.Compact>
        </Card>

        <Card title="Khám phá người dùng" style={{ boxShadow: CARD_SHADOW }} styles={{ body: { padding: 16 } }}>
          <Input.Search
            placeholder="Tìm theo tên hoặc email…"
            allowClear
            style={{ maxWidth: 460, marginBottom: 14 }}
            onSearch={(v) => void loadDiscover(v.trim() || undefined)}
            autoComplete="off"
          />
          {discoverLoading ? (
            <Skeleton active paragraph={{ rows: 2 }} />
          ) : discover.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không tìm thấy người dùng nào." />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {discover.map((u) => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: `1px solid ${V.border}`, borderRadius: 10 }}>
                  <UserAvatar name={u.name} avatarUrl={u.avatarUrl} size={38} />
                  <Text strong ellipsis style={{ flex: 1, minWidth: 0 }}>{u.name || 'Người dùng'}</Text>
                  {u.friendStatus === 'friends' ? (
                    <Tag color="success" bordered={false}>Bạn bè</Tag>
                  ) : u.friendStatus === 'pending_out' ? (
                    <Tag bordered={false}>Đã gửi</Tag>
                  ) : u.friendStatus === 'pending_in' ? (
                    <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => void accept(u.id).then((ok) => ok && patchDiscover(u.id, 'friends'))}>Chấp nhận</Button>
                  ) : (
                    <Button size="small" icon={<UserAddOutlined />} onClick={() => void addById(u)}>Kết bạn</Button>
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
                key: 'friends',
                label: `Bạn bè (${friends.length})`,
                children: loading ? (
                  <Spin style={{ display: 'block', margin: '32px auto' }} />
                ) : friends.length === 0 ? (
                  <Empty description="Chưa có bạn bè nào — gửi lời mời ở trên nhé!" />
                ) : (
                  <List
                    grid={{ gutter: 16, xs: 1, sm: 1, md: 2, lg: 2, xl: 2, xxl: 3 }}
                    dataSource={friends}
                    renderItem={(f) => (
                      <List.Item
                        actions={[
                          <Button key="chat" type="primary" ghost icon={<MessageOutlined />} onClick={() => openChat(f)}>Nhắn tin</Button>,
                          <Popconfirm key="rm" title="Huỷ kết bạn?" okText="Huỷ kết bạn" cancelText="Không" onConfirm={() => void remove(f.id, 'Đã huỷ kết bạn.')}>
                            <Button type="text" danger aria-label="Huỷ kết bạn" icon={<UserDeleteOutlined />} />
                          </Popconfirm>,
                        ]}
                      >
                        <List.Item.Meta avatar={<UserAvatar name={f.name} avatarUrl={f.avatarUrl} size={42} />} title={f.name || f.email} description={f.email} />
                      </List.Item>
                    )}
                  />
                ),
              },
              {
                key: 'requests',
                label: <Badge count={incoming.length} size="small" offset={[10, -2]}>Lời mời</Badge>,
                children:
                  incoming.length === 0 && outgoing.length === 0 ? (
                    <Empty description="Không có lời mời nào." />
                  ) : (
                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                      {incoming.length > 0 && (
                        <div>
                          <Text type="secondary" style={{ fontSize: 12.5, fontWeight: 600 }}>LỜI MỜI ĐẾN</Text>
                          <List
                            grid={{ gutter: 16, xs: 1, sm: 1, md: 2, lg: 2, xl: 2, xxl: 3 }}
                            dataSource={incoming}
                            renderItem={(r) => (
                              <List.Item
                                actions={[
                                  <Button key="ok" type="primary" icon={<CheckOutlined />} onClick={() => void accept(r.user.id)}>Chấp nhận</Button>,
                                  <Button key="no" aria-label="Từ chối lời mời" icon={<CloseOutlined />} onClick={() => void remove(r.user.id, 'Đã từ chối lời mời.')} />,
                                ]}
                              >
                                <List.Item.Meta avatar={<UserAvatar name={r.user.name} avatarUrl={r.user.avatarUrl} size={42} />} title={r.user.name || r.user.email} description={`${r.user.email} · ${fromNow(r.createdAt)}`} />
                              </List.Item>
                            )}
                          />
                        </div>
                      )}
                      {outgoing.length > 0 && (
                        <div>
                          <Text type="secondary" style={{ fontSize: 12.5, fontWeight: 600 }}>ĐÃ GỬI</Text>
                          <List
                            grid={{ gutter: 16, xs: 1, sm: 1, md: 2, lg: 2, xl: 2, xxl: 3 }}
                            dataSource={outgoing}
                            renderItem={(r) => (
                              <List.Item
                                actions={[
                                  <Tag key="p" color="warning">Đang chờ</Tag>,
                                  <Button key="cancel" type="text" danger onClick={() => void remove(r.user.id, 'Đã huỷ lời mời.')}>Huỷ</Button>,
                                ]}
                              >
                                <List.Item.Meta avatar={<UserAvatar name={r.user.name} avatarUrl={r.user.avatarUrl} size={42} />} title={r.user.name || r.user.email} description={r.user.email} />
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
