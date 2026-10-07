'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, App, Badge, Button, Card, Form, Input, List, Modal, Popconfirm, Skeleton, Space, Switch, Tag, Typography, Upload } from 'antd';
import type { UploadProps } from 'antd';
import { AppstoreOutlined, ArrowLeftOutlined, CalendarOutlined, CheckCircleOutlined, CheckOutlined, CloseOutlined, CloudServerOutlined, CopyOutlined, DeleteOutlined, DeploymentUnitOutlined, EditOutlined, FireOutlined, GiftOutlined, LockOutlined, MailOutlined, MessageOutlined, TeamOutlined, ThunderboltOutlined, TrophyOutlined, UploadOutlined } from '@ant-design/icons';
import { BLUE, BRAND, CARD_SHADOW, OK, V, WARN } from '../theme';
import { IconTile, StatCard } from '../kit';
import { useAccountAuth } from './auth';
import { accountApi, ApiError, formatDate, fromNow, type Friend, type FriendRequest, type MeActivity, type MeOverview, type Referral, type User } from './api';
import { AchievementsCard } from './Achievements';
import { ContributionGraph } from './ActivityCards';
import { openMessenger } from './messenger';
import { PricingView } from './PricingView';
import { FEATURE_FRIENDS } from '../features';
import { UserAvatar } from './UserAvatar';
import type { View } from '../components/HomeScreen';

const { Title, Text } = Typography;

/** Enables the kit StatCard hover-lift on the deep-linkable tiles (the rule normally lives in HomeOverview). */
const STAT_HOVER_CSS = '.tw-stat-card{transition:transform .14s ease, box-shadow .14s ease}.tw-stat-card:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(17,24,39,.12)}';

function PlanBadge({ plan }: { plan?: string | null }) {
  const p = (plan || 'free').toLowerCase();
  if (p === 'free') return <Tag bordered={false}>Free</Tag>;
  const color = p === 'max' ? 'gold' : 'purple';
  return <Tag color={color} bordered={false}>{p.toUpperCase()}</Tag>;
}

/** Native desktop port (core) of the website's /profile. */
/** Mốc cuộn tới phần Gói & Thanh toán trong Hồ sơ. */
export const PROFILE_PLAN_ANCHOR = 'tw-profile-plan';

export function ProfileView({ onNav }: { onNav?: (v: View) => void }) {
  const { user } = useAccountAuth();
  const { message } = App.useApp();
  const [overview, setOverview] = useState<MeOverview | null>(null);
  const [activity, setActivity] = useState<MeActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // The activity endpoint is newer than the rest of /me — the renderer code-pushes ahead of
        // the API deploy, so tolerate its absence instead of blanking the whole profile. Every
        // consumer below already renders a skeleton for `activity === null`.
        const [ov, act] = await Promise.all([accountApi.meOverview(), accountApi.meActivity(365).catch(() => null)]);
        if (cancelled) return;
        setOverview(ov);
        setActivity(act);
      } catch (e) {
        if (!cancelled) message.error((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [message]);

  const joinedAt = overview?.joinedAt ?? user?.createdAt ?? null;

  return (
    <>
      <style>{STAT_HOVER_CSS}</style>
      <Space direction="vertical" size={20} style={{ width: '100%' }}>
        <ProfileHeader user={user} joinedAt={joinedAt} onEdit={() => setEditOpen(true)} onChangePassword={() => setPwdOpen(true)} onNav={onNav} />
        <EditProfileModal open={editOpen} onClose={() => setEditOpen(false)} />
        <ChangePasswordModal open={pwdOpen} onClose={() => setPwdOpen(false)} />

        {/* One uniform stat band: overview counters + streak metrics, single idiom (kit StatCard). */}
        <StatBand overview={overview} activity={activity} loading={loading} onNav={onNav} />

        <Card styles={{ body: { padding: 20 } }} style={{ boxShadow: CARD_SHADOW }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <IconTile icon={<CalendarOutlined />} color={BRAND} />
            <Title level={5} style={{ margin: 0, flex: 1 }}>Hoạt động đóng góp</Title>
            {activity && <Text type="secondary" style={{ fontSize: 12.5 }}>{activity.total} lượt đóng góp trong 12 tháng qua</Text>}
          </div>
          {loading || !activity ? <Skeleton active paragraph={{ rows: 4 }} /> : <ContributionGraph days={activity.days} />}
        </Card>

        <AchievementsCard overview={overview} activity={activity} plan={user?.plan ?? undefined} joinedAt={joinedAt} loading={loading} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, alignItems: 'start' }}>
          {/* Bạn bè tạm ẩn (FEATURE_FRIENDS) — FriendsCard giữ nguyên để bật lại. */}
          {FEATURE_FRIENDS && <FriendsCard />}
          <ReferralCard />
        </div>

        {/* Gói & Thanh toán folded in as one page (UI-8). Đây là chỗ DUY NHẤT xem/nâng gói trong
            app (không còn mục "Gói & Thanh toán" riêng) — Tổng quan cuộn thẳng tới mốc này. */}
        <div id={PROFILE_PLAN_ANCHOR} style={{ scrollMarginTop: 80 }}>
          <PricingView onNav={onNav} />
        </div>
      </Space>
    </>
  );
}

/** Overview counters + streak metrics as ONE uniform grid of kit StatCards (one gap, equal size). */
function StatBand({ overview, activity, loading, onNav }: { overview: MeOverview | null; activity: MeActivity | null; loading: boolean; onNav?: (v: View) => void }) {
  const go = (v: View) => (onNav ? () => onNav(v) : undefined);
  const tiles: { key: string; label: string; value: ReactNode; icon: ReactNode; color: string; onClick?: () => void }[] = [
    { key: 'ai', label: 'Lượt AI', value: overview?.aiRuns, icon: <ThunderboltOutlined />, color: BRAND },
    { key: 'remote', label: 'Tác vụ từ xa', value: overview?.remoteTasks, icon: <CloudServerOutlined />, color: BLUE },
    { key: 'skills', label: 'Kỹ năng', value: overview?.skills, icon: <AppstoreOutlined />, color: WARN, onClick: go('skills') },
    { key: 'artifacts', label: 'Artifacts', value: overview?.artifacts, icon: <DeploymentUnitOutlined />, color: OK },
    { key: 'scheduled', label: 'Tác vụ định kỳ', value: overview?.scheduledTasks, icon: <CheckCircleOutlined />, color: OK },
    { key: 'streak', label: 'Chuỗi hiện tại', value: activity?.currentStreak ?? 0, icon: <FireOutlined />, color: WARN },
    { key: 'longest', label: 'Chuỗi dài nhất', value: activity?.longestStreak ?? 0, icon: <TrophyOutlined />, color: BRAND },
    { key: 'contrib', label: 'Tổng đóng góp', value: activity?.total ?? 0, icon: <ThunderboltOutlined />, color: OK },
  ];
  return (
    <div className="lw-grid-8wrap">
      <div className="lw-grid-8">
        {tiles.map((t) => (
          <StatCard key={t.key} icon={t.icon} color={t.color} value={t.value} label={t.label} loading={loading || t.value === undefined} onClick={t.onClick} />
        ))}
      </div>
    </div>
  );
}

function FriendsCard() {
  const { message } = App.useApp();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    let alive = true;
    setLoading(true);
    // Incoming friend requests must surface everywhere the friends list appears (audited gap).
    Promise.all([
      accountApi.friends().catch(() => [] as Friend[]),
      accountApi.friendRequests().catch(() => [] as FriendRequest[]),
    ]).then(([fl, rl]) => { if (alive) { setFriends(fl); setRequests(rl); setLoading(false); } });
    return () => { alive = false; };
  };

  useEffect(() => load(), []);

  const incoming = requests.filter((r) => r.direction === 'incoming');

  const accept = async (userId: string) => {
    try { await accountApi.acceptFriend(userId); message.success('Đã chấp nhận lời mời.'); load(); }
    catch (e) { message.error((e as Error).message); }
  };

  const reject = async (userId: string) => {
    try { await accountApi.removeFriend(userId); message.success('Đã từ chối lời mời.'); load(); }
    catch (e) { message.error((e as Error).message); }
  };

  const remove = async (f: Friend) => {
    try {
      await accountApi.removeFriend(f.id);
      message.success('Đã xoá bạn.');
      load();
    } catch (e) { message.error((e as Error).message); }
  };

  return (
    <Card styles={{ body: { padding: 20 } }} style={{ boxShadow: CARD_SHADOW }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <IconTile icon={<TeamOutlined />} color={BRAND} />
        <Title level={5} style={{ margin: 0, flex: 1 }}>Bạn bè của tôi ({friends.length})</Title>
      </div>

      {loading ? (
        <Skeleton active paragraph={{ rows: 2 }} />
      ) : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {incoming.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Text strong style={{ fontSize: 13, color: V.text }}>Lời mời kết bạn</Text>
                <Badge count={incoming.length} style={{ backgroundColor: BLUE }} />
              </div>
              <List
                dataSource={incoming}
                renderItem={(r) => (
                  <List.Item
                    actions={[
                      <Button key="ok" type="primary" size="small" icon={<CheckOutlined />} onClick={() => accept(r.user.id)}>Chấp nhận</Button>,
                      <Button key="no" size="small" icon={<CloseOutlined />} onClick={() => reject(r.user.id)}>Từ chối</Button>,
                    ]}
                  >
                    <List.Item.Meta
                      avatar={<UserAvatar name={r.user.name} avatarUrl={r.user.avatarUrl} size={40} />}
                      title={<span style={{ color: V.text }}>{r.user.name || 'Người dùng'}</span>}
                      description={<span style={{ color: V.textSub }}>{r.user.email}{r.createdAt ? ` · ${fromNow(r.createdAt)}` : ''}</span>}
                    />
                  </List.Item>
                )}
              />
            </div>
          )}

          {friends.length === 0 ? (
            <Text type="secondary">Chưa có bạn bè nào.</Text>
          ) : (
            <List
              dataSource={friends}
              renderItem={(f) => (
                <List.Item
                  actions={[
                    <Button key="msg" type="link" icon={<MessageOutlined />} onClick={() => openMessenger(f)} style={{ padding: 0 }}>Nhắn tin</Button>,
                    <Popconfirm key="rm" title="Xoá bạn này?" okText="Xoá" cancelText="Huỷ" okButtonProps={{ danger: true }} onConfirm={() => remove(f)}>
                      <Button type="link" danger icon={<DeleteOutlined />} style={{ padding: 0 }}>Xoá</Button>
                    </Popconfirm>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={<UserAvatar name={f.name} avatarUrl={f.avatarUrl} size={40} />}
                    title={<span style={{ color: V.text }}>{f.name || 'Người dùng'}</span>}
                    description={<span style={{ color: V.textSub }}>{f.email}</span>}
                  />
                </List.Item>
              )}
            />
          )}
        </Space>
      )}
    </Card>
  );
}

function ProfileHeader({ user, joinedAt, onEdit, onChangePassword, onNav }: { user: User | null; joinedAt: string | null; onEdit: () => void; onChangePassword: () => void; onNav?: (v: View) => void }) {
  const name = user?.name || 'Người dùng';
  return (
    <Card styles={{ body: { padding: 22 } }} style={{ boxShadow: CARD_SHADOW }}>
      {onNav && (
        <div style={{ marginBottom: 14 }}>
          <Button type="link" size="small" icon={<ArrowLeftOutlined />} onClick={() => onNav('home')} style={{ padding: 0 }}>Tổng quan</Button>
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 18 }}>
        <UserAvatar name={name} avatarUrl={user?.avatarUrl} size={76} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Title level={3} style={{ margin: 0 }} ellipsis={{ rows: 1 }}>{name}</Title>
            {user?.role === 'admin' && <Tag color="red" bordered={false}>Admin</Tag>}
            <PlanBadge plan={user?.plan} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 6, color: V.textSub, fontSize: 13.5 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><MailOutlined style={{ color: V.textFaint }} />{user?.email}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><CalendarOutlined style={{ color: V.textFaint }} />Tham gia {joinedAt ? formatDate(joinedAt) : '—'}</span>
          </div>
        </div>
        <Space wrap size={8}>
          <Button icon={<LockOutlined />} onClick={onChangePassword}>Đổi mật khẩu</Button>
          <Button icon={<EditOutlined />} onClick={onEdit}>Sửa hồ sơ</Button>
        </Space>
      </div>
    </Card>
  );
}

const AVATAR_MAX_BYTES = 3 * 1024 * 1024;
const AVATAR_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

function EditProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, applyUser, refresh } = useAccountAuth();
  const { message } = App.useApp();
  const [form] = Form.useForm<{ name: string; discoverable: boolean }>();
  const [savingName, setSavingName] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);

  useEffect(() => {
    if (open) form.setFieldsValue({ name: user?.name ?? '', discoverable: user?.discoverable !== false });
  }, [open, user?.name, user?.discoverable, form]);

  const handleAvatarUpload: UploadProps['beforeUpload'] = (file) => {
    if (!AVATAR_MIME.includes(file.type)) { message.error('Chỉ chấp nhận ảnh PNG, JPEG, WEBP hoặc GIF.'); return Upload.LIST_IGNORE; }
    if (file.size > AVATAR_MAX_BYTES) { message.error('Ảnh phải nhỏ hơn 3MB.'); return Upload.LIST_IGNORE; }
    setAvatarBusy(true);
    accountApi.uploadAvatar(file as File)
      .then((updated) => { applyUser(updated); message.success('Đã cập nhật ảnh đại diện.'); })
      .catch((e) => message.error((e as Error).message))
      .finally(() => setAvatarBusy(false));
    return Upload.LIST_IGNORE;
  };

  const clearAvatar = async () => {
    setAvatarBusy(true);
    try { const updated = await accountApi.setAvatarUrl(null); applyUser(updated); message.success('Đã xoá ảnh đại diện.'); }
    catch (e) { message.error((e as Error).message); }
    finally { setAvatarBusy(false); }
  };

  const saveName = async () => {
    let values: { name: string; discoverable?: boolean };
    try { values = await form.validateFields(); } catch { return; }
    setSavingName(true);
    try {
      const updated = await accountApi.updateProfile({ name: values.name.trim(), discoverable: values.discoverable });
      applyUser(updated);
      message.success('Đã lưu hồ sơ.');
      void refresh();
      onClose();
    } catch (e) { message.error((e as Error).message); }
    finally { setSavingName(false); }
  };

  return (
    <Modal open={open} onCancel={onClose} title="Sửa hồ sơ" okText="Lưu" cancelText="Đóng" confirmLoading={savingName} onOk={saveName} destroyOnHidden>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '8px 0 20px' }}>
        <UserAvatar name={user?.name} avatarUrl={user?.avatarUrl} size={64} />
        <Space direction="vertical" size={8} style={{ flex: 1 }}>
          <Space wrap size={8}>
            <Upload accept={AVATAR_MIME.join(',')} showUploadList={false} beforeUpload={handleAvatarUpload} disabled={avatarBusy}>
              <Button icon={<UploadOutlined />} loading={avatarBusy}>Đổi ảnh</Button>
            </Upload>
            {user?.avatarUrl && <Button icon={<DeleteOutlined />} onClick={clearAvatar} disabled={avatarBusy}>Xoá ảnh</Button>}
          </Space>
          <Text type="secondary" style={{ fontSize: 12.5 }}>PNG, JPEG, WEBP hoặc GIF, tối đa 3MB.</Text>
        </Space>
      </div>
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item name="name" label="Tên" rules={[{ required: true, message: 'Vui lòng nhập tên.' }, { max: 60, message: 'Tên tối đa 60 ký tự.' }]}>
          <Input placeholder="Tên hiển thị" maxLength={60} allowClear />
        </Form.Item>
        <Form.Item name="discoverable" label="Cho phép người khác tìm thấy tôi" valuePropName="checked" tooltip="Bật: hồ sơ hiện trong mục Khám phá người dùng. Tắt: chỉ ai biết email mới mời được bạn." style={{ marginBottom: 0 }}>
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}

const PWD_RESEND_COOLDOWN = 60;

function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ code: string; newPassword: string }>();
  const [codeSent, setCodeSent] = useState(false);
  const [sentTo, setSentTo] = useState('');
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (open) { setCodeSent(false); setSentTo(''); setSending(false); setSaving(false); setServerError(null); setCooldown(0); form.resetFields(); }
  }, [open, form]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const requestCode = async (isResend: boolean) => {
    setSending(true); setServerError(null);
    try {
      const res = await accountApi.requestPasswordCode();
      setSentTo(res.sentTo); setCodeSent(true); setCooldown(PWD_RESEND_COOLDOWN);
      message.success(isResend ? 'Đã gửi lại mã' : `Đã gửi mã tới ${res.sentTo}`);
    } catch (e) { message.error((e as Error).message); }
    finally { setSending(false); }
  };

  const submit = async () => {
    let values: { code: string; newPassword: string };
    try { values = await form.validateFields(); } catch { return; }
    setSaving(true); setServerError(null);
    try { await accountApi.changePassword(values.code, values.newPassword); message.success('Đã đổi mật khẩu'); onClose(); }
    catch (e) {
      if (e instanceof ApiError && e.statusCode === 400) { setServerError(e.message); form.setFieldValue('code', ''); }
      else message.error((e as Error).message);
    } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onCancel={onClose} title="Đổi mật khẩu" cancelText="Đóng" okText="Đổi mật khẩu" okButtonProps={{ disabled: !codeSent }} confirmLoading={saving} onOk={submit} destroyOnHidden>
      {!codeSent ? (
        <div style={{ margin: '8px 0' }}>
          <Text type="secondary" style={{ fontSize: 13.5, display: 'block', marginBottom: 14 }}>
            Chúng tôi sẽ gửi một mã xác thực 6 số tới email của bạn. Nhập mã đó cùng mật khẩu mới để hoàn tất.
          </Text>
          <Button type="primary" icon={<MailOutlined />} block loading={sending} onClick={() => requestCode(false)}>Gửi mã xác thực</Button>
        </div>
      ) : (
        <>
          <Alert type="success" showIcon message={`Đã gửi mã tới ${sentTo}`} description="Kiểm tra hộp thư (cả Spam). Mã có hiệu lực trong 10 phút." style={{ margin: '8px 0 18px' }} />
          {serverError && <Alert type="error" showIcon message={serverError} style={{ marginBottom: 16 }} />}
          <Form form={form} layout="vertical" requiredMark={false}>
            <Form.Item name="code" label="Mã xác thực" rules={[{ required: true, message: 'Vui lòng nhập mã 6 số' }, { pattern: /^\d{6}$/, message: 'Mã gồm 6 chữ số' }]} style={{ marginBottom: 18 }}>
              <Input.OTP length={6} inputMode="numeric" />
            </Form.Item>
            <Form.Item name="newPassword" label="Mật khẩu mới" rules={[{ required: true, message: 'Vui lòng nhập mật khẩu' }, { min: 8, message: 'Mật khẩu tối thiểu 8 ký tự' }, { max: 128, message: 'Mật khẩu tối đa 128 ký tự' }]} hasFeedback>
              <Input.Password prefix={<LockOutlined />} placeholder="••••••••" autoComplete="new-password" />
            </Form.Item>
            <Form.Item name="confirm" label="Xác nhận mật khẩu" dependencies={['newPassword']} hasFeedback rules={[
              { required: true, message: 'Vui lòng xác nhận mật khẩu' },
              ({ getFieldValue }) => ({ validator(_, value) { return !value || getFieldValue('newPassword') === value ? Promise.resolve() : Promise.reject(new Error('Mật khẩu xác nhận không khớp')); } }),
            ]}>
              <Input.Password prefix={<LockOutlined />} placeholder="••••••••" autoComplete="new-password" />
            </Form.Item>
          </Form>
          <div style={{ fontSize: 13.5, color: V.textSub }}>
            Không nhận được mã?{' '}
            <Button type="link" onClick={() => requestCode(true)} disabled={cooldown > 0 || sending} loading={sending} style={{ padding: 0, height: 'auto', fontWeight: 600 }}>
              {cooldown > 0 ? `Gửi lại mã (${cooldown}s)` : 'Gửi lại mã'}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

function ReferralCard() {
  const { message } = App.useApp();
  const [ref, setRef] = useState<Referral | null>(null);

  useEffect(() => {
    accountApi.getReferral().then(setRef).catch(() => setRef(null));
  }, []);

  const copy = async () => {
    if (!ref) return;
    try { await navigator.clipboard.writeText(ref.link); message.success('Đã sao chép liên kết giới thiệu.'); }
    catch { message.error('Không sao chép được.'); }
  };

  return (
    <Card styles={{ body: { padding: 20 } }} style={{ boxShadow: CARD_SHADOW }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <IconTile icon={<GiftOutlined />} color={BRAND} />
        <Title level={5} style={{ margin: 0, flex: 1 }}>Giới thiệu bạn bè</Title>
      </div>
      {!ref ? (
        <Skeleton active paragraph={{ rows: 1 }} />
      ) : (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Text type="secondary">
            Mời bạn bè qua liên kết của bạn — mỗi người đăng ký, bạn được cộng thêm {ref.rewardPerReferral} credit thưởng. Đã giới thiệu: <Text strong>{ref.referrals}</Text>.
          </Text>
          <Space.Compact style={{ width: '100%', maxWidth: 520 }}>
            <Input readOnly value={ref.link} />
            <Button type="primary" icon={<CopyOutlined />} onClick={copy}>Sao chép</Button>
          </Space.Compact>
        </Space>
      )}
    </Card>
  );
}
