'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { App as AntApp, Button, Input, Empty } from 'antd';
import { TeamOutlined, UserAddOutlined, MessageOutlined, CheckOutlined } from '@ant-design/icons';
import { V, BRAND, CARD_SHADOW } from '../theme';
import { UserAvatar } from '../account/UserAvatar';
import { accountApi, type DiscoverUser, type FriendRequest } from '../account/api';
import { openMessenger } from '../account/messenger';

const NUM = { fontVariantNumeric: 'tabular-nums' as const, fontWeight: 800, letterSpacing: -0.3, color: V.text };
const OK = '#16B98D';

function nameOf(u: { name?: string | null; email: string }): string {
  return (u.name || u.email.split('@')[0] || 'Người dùng').trim();
}

function PanelHead({ icon, color, title, sub, right }: { icon: ReactNode; color: string; title: string; sub?: string; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <span style={{ display: 'inline-flex', width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', color, background: `${color}1f`, fontSize: 15 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: V.textFaint }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

/** Discover users + friend requests + add-by-email — the "Người dùng" view, on the hub. */
export function HubPeople() {
  const { message } = AntApp.useApp();
  const [discover, setDiscover] = useState<DiscoverUser[] | null>(null);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);

  const loadReqs = () => accountApi.friendRequests().then(setRequests).catch(() => {});
  useEffect(() => {
    let alive = true;
    accountApi.discoverUsers(undefined, 1, 12).then((r) => alive && setDiscover(r.items)).catch(() => alive && setDiscover([]));
    accountApi.friendRequests().then((r) => alive && setRequests(r)).catch(() => {});
    return () => { alive = false; };
  }, []);

  const patch = (id: string, friendStatus: DiscoverUser['friendStatus']) =>
    setDiscover((xs) => xs?.map((x) => (x.id === id ? { ...x, friendStatus } : x)) ?? xs);

  const addById = async (u: DiscoverUser) => {
    try {
      const r = await accountApi.sendFriendRequestById(u.id);
      message.success(r.status === 'accepted' ? 'Đã kết bạn!' : 'Đã gửi lời mời.');
      patch(u.id, r.status === 'accepted' ? 'friends' : 'pending_out');
    } catch (e) { message.error((e as Error).message); }
  };
  const addByEmail = async () => {
    const e = email.trim();
    if (!e) return;
    setAdding(true);
    try {
      const r = await accountApi.sendFriendRequest(e);
      message.success(r.status === 'accepted' ? 'Đã kết bạn!' : 'Đã gửi lời mời kết bạn.');
      setEmail('');
    } catch (err) { message.error((err as Error).message); }
    finally { setAdding(false); }
  };
  const accept = async (userId: string) => {
    try { await accountApi.acceptFriend(userId); message.success('Đã chấp nhận.'); void loadReqs(); }
    catch (e) { message.error((e as Error).message); }
  };

  const incoming = requests.filter((r) => r.direction === 'incoming');

  return (
    <div style={{ background: V.surface, border: `1px solid ${V.border}`, borderRadius: 16, boxShadow: CARD_SHADOW, padding: 16, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <PanelHead icon={<TeamOutlined />} color="#4FB6FF" title="Người dùng" sub="Kết bạn, nhắn tin, cùng nhau vibe code" />
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <Input value={email} onChange={(e) => setEmail(e.target.value)} onPressEnter={() => void addByEmail()} placeholder="Kết bạn qua email…" prefix={<UserAddOutlined style={{ color: V.textFaint }} />} style={{ flex: 1 }} />
        <Button type="primary" loading={adding} onClick={() => void addByEmail()}>Mời</Button>
      </div>

      {incoming.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: V.textFaint, marginBottom: 6 }}>Lời mời ({incoming.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {incoming.map((r) => (
              <div key={r.user.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', borderRadius: 10, background: V.surfaceAlt }}>
                <UserAvatar name={r.user.name} avatarUrl={r.user.avatarUrl} size={30} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(r.user)}</span>
                <Button type="primary" size="small" icon={<CheckOutlined />} onClick={() => void accept(r.user.id)}>Chấp nhận</Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: V.textFaint, marginBottom: 8 }}>Gợi ý kết bạn</div>
      {discover === null ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 10 }}>{[0, 1, 2, 3].map((i) => <div key={i} style={{ height: 56, borderRadius: 12, background: V.surfaceMuted }} />)}</div>
      ) : discover.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có gợi ý" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))', gap: 10, alignContent: 'start' }}>
          {discover.map((u) => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 12, border: `1px solid ${V.border}` }}>
              <UserAvatar name={u.name} avatarUrl={u.avatarUrl} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(u)}</div>
                {u.friendStatus === 'friends' ? (
                  <button onClick={() => openMessenger(u)} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: BRAND, fontSize: 11.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}><MessageOutlined /> Nhắn tin</button>
                ) : u.friendStatus === 'pending_out' ? (
                  <span style={{ fontSize: 11.5, color: V.textFaint }}>Đã gửi lời mời</span>
                ) : u.friendStatus === 'pending_in' ? (
                  <button onClick={() => void accept(u.id)} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: OK, fontSize: 11.5, fontWeight: 600 }}>Chấp nhận</button>
                ) : (
                  <button onClick={() => void addById(u)} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: BRAND, fontSize: 11.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}><UserAddOutlined /> Kết bạn</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
