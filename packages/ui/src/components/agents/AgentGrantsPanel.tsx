'use client';
import { useEffect, useState } from 'react';
import { App, Button, Empty, Grid, Modal, Segmented, Select, Space, Spin, Table, Tag, Tooltip } from 'antd';
import { ShareAltOutlined, StopOutlined, PauseCircleOutlined, PlayCircleOutlined, HistoryOutlined, SafetyOutlined } from '@ant-design/icons';
import { accountApi, type LarkGrant, type LarkGrantCall, type AssistantShareInfo } from '../../account/api';
import { V, BRAND } from '../../theme';
import { useI18n } from '../../i18n';
import { FEATURE_FRIENDS } from '../../features';

interface Friend {
  id: string;
  name?: string;
  email?: string;
}

const STATUS: Record<string, { color: string; label: string }> = {
  pending: { color: 'default', label: 'Chờ nhận' },
  active: { color: 'success', label: 'Đang dùng' },
  suspended: { color: 'warning', label: 'Tạm dừng' },
  revoked: { color: 'error', label: 'Đã thu hồi' },
};

const who = (u?: { name?: string; email?: string } | null) => u?.name || u?.email || 'Người dùng';
const isAgent = (g: LarkGrant) => g.kind === 'agentchat';

/**
 * "Chia sẻ Trợ lý AI" — the owner lets a friend use the general assistant that runs on THIS
 * machine, WITHOUT handing over anything. Every shared turn runs READ-ONLY (the assistant can
 * only read/search/browse — never write files or run commands), and the owner revokes any one
 * person with a single click. Shares the same delegated-grant relay as the Lark connection,
 * distinguished by kind='agentchat'.
 */
export function AgentGrantsPanel({ onChanged }: { onChanged?: () => void }) {
  const { t } = useI18n();
  const screens = Grid.useBreakpoint();
  const { message, modal } = App.useApp();
  const statusLabel: Record<string, string> = {
    pending: t('chat.grantPending', 'Chờ nhận'),
    active: t('chat.grantActive', 'Đang dùng'),
    suspended: t('chat.grantSuspended', 'Tạm dừng'),
    revoked: t('chat.grantRevoked', 'Đã thu hồi'),
  };
  const [loading, setLoading] = useState(true);
  const [mine, setMine] = useState<LarkGrant[]>([]);
  const [received, setReceived] = useState<{ active: LarkGrant[]; pending: LarkGrant[] }>({ active: [], pending: [] });
  const [friends, setFriends] = useState<Friend[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [logFor, setLogFor] = useState<LarkGrant | null>(null);
  const [calls, setCalls] = useState<LarkGrantCall[] | null>(null);
  const [friendId, setFriendId] = useState<string | undefined>();
  const [days, setDays] = useState(7);
  // Public chat-able assistant links (/g/<slug>).
  const [shares, setShares] = useState<AssistantShareInfo[]>([]);
  const shareBase =
    typeof window !== 'undefined' && window.location.hostname.endsWith('toolswave.net') ? window.location.origin : 'https://toolswave.net';
  const loadShares = () => accountApi.assistantShares().then(setShares).catch(() => {});
  const createShare = async () => {
    try {
      await accountApi.assistantShareCreate({});
      await loadShares();
      message.success(t('chat.publicLinkCreated', 'Đã tạo link công khai'));
    } catch (e) {
      message.error((e as Error)?.message || 'Lỗi');
    }
  };
  const toggleShare = async (s: AssistantShareInfo) => {
    await accountApi.assistantShareUpdate(s.id, { enabled: !s.enabled }).catch(() => {});
    await loadShares();
  };
  const deleteShare = (s: AssistantShareInfo) =>
    modal.confirm({
      title: t('chat.deletePublicLink', 'Xoá link công khai này?'),
      content: t('chat.deletePublicLinkNote', 'Liên kết sẽ ngừng hoạt động vĩnh viễn.'),
      okText: t('chat.delete', 'Xoá'),
      okButtonProps: { danger: true },
      cancelText: t('chat.cancel', 'Huỷ'),
      onOk: async () => { await accountApi.assistantShareDelete(s.id).catch(() => {}); await loadShares(); },
    });
  const copyShare = (slug: string) => {
    try { void navigator.clipboard?.writeText(`${shareBase}/g/${slug}`); message.success(t('chat.copied', 'Đã sao chép')); } catch { /* ignore */ }
  };

  const reload = async () => {
    setLoading(true);
    try {
      const [a, b] = await Promise.all([accountApi.larkGrants(), accountApi.larkGrantsReceived()]);
      // Only agentchat grants belong here (Lark grants share the same endpoints).
      setMine(a.filter(isAgent));
      setReceived({ active: b.active.filter(isAgent), pending: b.pending.filter(isAgent) });
    } catch {
      /* offline — panel simply shows empty */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadShares();
    // Phần chia sẻ cho BẠN BÈ (lời mời / người đang dùng) ẩn khi FEATURE_FRIENDS tắt — chỉ còn link công khai.
    if (!FEATURE_FRIENDS) {
      setLoading(false);
      return;
    }
    void reload();
    void accountApi
      .friends()
      .then((f) => setFriends(f as unknown as Friend[]))
      .catch(() => {});
  }, []);

  const create = async () => {
    if (!friendId) return;
    setBusy(true);
    try {
      await accountApi.larkGrantCreate({ inviteeUserId: friendId, kind: 'agentchat', expiresInDays: days, label: 'Trợ lý AI' });
      message.success(t('chat.inviteSent', 'Đã gửi lời mời. Bạn của bạn chỉ cần bấm "Kết nối" trong Larkwave.'));
      setOpen(false);
      setFriendId(undefined);
      await reload();
      onChanged?.();
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('chat.inviteCreateFailed', 'Không tạo được lời mời'));
    } finally {
      setBusy(false);
    }
  };

  const revoke = (g: LarkGrant) =>
    modal.confirm({
      title: `${t('chat.revokeAccessOf', 'Thu hồi quyền của')} ${who(g.grantee)}?`,
      content: t('chat.revokeConfirmContent', 'Người này sẽ mất quyền dùng Trợ lý AI của bạn ngay lập tức. Những người khác KHÔNG bị ảnh hưởng.'),
      okText: t('chat.revoke', 'Thu hồi'),
      okButtonProps: { danger: true },
      cancelText: t('chat.cancel', 'Huỷ'),
      onOk: async () => {
        await accountApi.larkGrantRevoke(g.id);
        await reload();
        onChanged?.();
      },
    });

  const claim = async (g: LarkGrant) => {
    try {
      await accountApi.larkGrantClaim(g.id);
      message.success(`${t('chat.connectedAssistantOf', 'Đã kết nối Trợ lý AI của')} ${who(g.owner)}`);
      await reload();
      onChanged?.();
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('chat.claimFailed', 'Không nhận được lời mời'));
    }
  };

  const showLog = async (g: LarkGrant) => {
    setLogFor(g);
    setCalls(null);
    try {
      setCalls(await accountApi.larkGrantCalls(g.id, 200));
    } catch {
      setCalls([]);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 30 }}><Spin /></div>;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {/* Public chat-able link (/g/<slug>) — anyone can chat; runs on hosted MAIC, metered to YOU. */}
      <div style={{ padding: '12px 14px', borderRadius: 10, background: V.surfaceAlt, border: `1px solid ${V.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <ShareAltOutlined style={{ color: BRAND }} />
          <span style={{ fontWeight: 700, color: V.text }}>{t('chat.publicLinkTitle', 'Link công khai (ai cũng chat được)')}</span>
        </div>
        <div style={{ fontSize: 12.5, color: V.textSub, marginBottom: 10, lineHeight: 1.5 }}>
          {t('chat.publicLinkNote', 'Bất kỳ ai có link đều chat được với trợ lý của bạn. Chạy trên máy chủ (hosted), tính vào hạn mức của BẠN, chỉ đọc, có giới hạn tần suất.')}
        </div>
        {shares.map((s) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: `1px solid ${V.borderSub}`, flexWrap: 'wrap' }}>
            <Tag bordered={false} color={s.enabled ? 'success' : 'default'}>{s.enabled ? t('chat.on', 'Bật') : t('chat.off', 'Tắt')}</Tag>
            <span style={{ flex: 1, minWidth: 120, fontSize: 12.5, color: V.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {`${shareBase}/g/${s.slug}`}
            </span>
            <span style={{ fontSize: 11.5, color: V.textFaint }}>{s.usesTotal} {t('chat.uses', 'lượt')}</span>
            <Button size="small" onClick={() => copyShare(s.slug)}>{t('chat.copyLink', 'Copy link')}</Button>
            <Button size="small" onClick={() => void toggleShare(s)}>{s.enabled ? t('chat.disable', 'Tắt') : t('chat.enable', 'Bật')}</Button>
            <Button size="small" danger onClick={() => deleteShare(s)}>{t('chat.delete', 'Xoá')}</Button>
          </div>
        ))}
        <Button type="primary" ghost size="small" icon={<ShareAltOutlined />} onClick={() => void createShare()} style={{ marginTop: shares.length ? 10 : 0 }}>
          {t('chat.createPublicLink', 'Tạo link công khai')}
        </Button>
      </div>

      {FEATURE_FRIENDS && (<>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: '10px 12px',
          borderRadius: 10,
          background: V.surfaceAlt,
          border: `1px solid ${V.border}`,
        }}
      >
        <SafetyOutlined style={{ color: BRAND, fontSize: 16, marginTop: 2 }} />
        <div style={{ fontSize: 12.5, color: V.textSub, lineHeight: 1.5 }}>
          Người bạn cấp quyền dùng được Trợ lý AI (hỏi–đáp, viết, lập trình, tra web) bằng <b>tài khoản Claude của bạn</b> —
          họ <b>không tốn phí</b>, <b>không cần máy của họ bật</b>. Chạy ở <b>chế độ AN TOÀN</b>: chỉ hỏi–đáp + tra web,
          không đọc/sửa tệp hay chạy lệnh trên máy. Thu hồi từng người bằng một nút.
          <div style={{ marginTop: 6, color: V.textFaint }}>
            Câu hỏi của họ chạy khi máy bạn đang mở. Muốn phục vụ <b>24/7 không cần bật máy cá nhân</b>, dựng
            “máy chủ Trợ lý AI” (tw-agent-host) trên một VM bằng Claude CLI của bạn — xem hướng dẫn trong tw-agent-host/README.
          </div>
        </div>
      </div>

      {received.pending.length > 0 && (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color: V.text }}>{t('chat.invitesForYou', 'Lời mời dành cho bạn')}</div>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {received.pending.map((g) => (
              <div
                key={g.id}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: `1px solid ${V.border}`, background: V.surface }}
              >
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: V.text }}>
                  <b>{who(g.owner)}</b> {t('chat.sharesAssistantWithYou', 'chia sẻ Trợ lý AI với bạn')}
                  <div style={{ fontSize: 11.5, color: V.textSub, marginTop: 2 }}>
                    {t('chat.safeQaWeb', 'An toàn · hỏi–đáp + tra web')}{g.expiresAt ? ` · ${t('chat.expires', 'hết hạn')} ${new Date(g.expiresAt).toLocaleDateString('vi-VN')}` : ''}
                  </div>
                </div>
                <Button type="primary" onClick={() => void claim(g)}>{t('chat.connect', 'Kết nối')}</Button>
              </div>
            ))}
          </Space>
        </div>
      )}

      {received.active.length > 0 && (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color: V.text }}>{t('chat.assistantsSharedWithYou', 'Trợ lý được chia sẻ với bạn')}</div>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {received.active.map((g) => (
              <div
                key={g.id}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: `1px solid ${V.border}`, background: V.surface }}
              >
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: V.text }}>
                  {t('chat.assistantOf', 'Trợ lý AI của')} <b>{who(g.owner)}</b>
                  <div style={{ fontSize: 11.5, color: V.textSub, marginTop: 2 }}>
                    {t('chat.safe', 'An toàn')}{g.status === 'suspended' ? ` · ${t('chat.paused', 'đang tạm dừng')}` : ''} · {t('chat.askInAssistantChat', 'hỏi ở khung chat "Trợ lý AI" (chọn nguồn)')}
                  </div>
                </div>
                <Tag color="blue">{t('chat.safe', 'An toàn')}</Tag>
              </div>
            ))}
          </Space>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: V.text }}>{t('chat.peopleUsingYourAssistant', 'Người đang dùng trợ lý của bạn')}</div>
        <div style={{ flex: 1, minWidth: 12 }} />
        <Button type="primary" icon={<ShareAltOutlined />} onClick={() => setOpen(true)}>{t('chat.shareAssistant', 'Chia sẻ Trợ lý AI')}</Button>
      </div>

      {mine.length === 0 ? (
        <Empty description={t('chat.notSharedYet', 'Chưa chia sẻ với ai')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <Table<LarkGrant>
          size="small"
          rowKey="id"
          dataSource={mine}
          pagination={false}
          scroll={{ x: 'max-content' }}
          columns={[
            {
              title: t('chat.userCol', 'Người dùng'),
              render: (_, g) => (
                <span style={{ fontSize: 13 }}>
                  {g.grantee ? who(g.grantee) : <span style={{ color: V.textFaint }}>{t('chat.notClaimed', 'chưa nhận lời mời')}</span>}
                </span>
              ),
            },
            { title: t('chat.permissionCol', 'Quyền'), render: () => <Tag color="blue">{t('chat.safe', 'An toàn')}</Tag> },
            { title: t('chat.statusCol', 'Trạng thái'), render: (_, g) => <Tag color={STATUS[g.status]?.color}>{statusLabel[g.status] ?? g.status}</Tag> },
            {
              title: t('chat.expiresCol', 'Hết hạn'),
              render: (_, g) => (
                <span style={{ fontSize: 12, color: V.textSub }}>
                  {g.expiresAt ? new Date(g.expiresAt).toLocaleDateString('vi-VN') : t('chat.unlimited', 'không giới hạn')}
                </span>
              ),
            },
            {
              title: '',
              render: (_, g) => (
                <Space size={2}>
                  <Tooltip title={t('chat.accessLog', 'Nhật ký truy cập')}>
                    <Button type="text" size="small" icon={<HistoryOutlined />} onClick={() => void showLog(g)} />
                  </Tooltip>
                  <Tooltip title={g.status === 'suspended' ? t('chat.resumeAction', 'Cho dùng lại') : t('chat.pauseAction', 'Tạm dừng')}>
                    <Button
                      type="text"
                      size="small"
                      icon={g.status === 'suspended' ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
                      onClick={async () => {
                        await accountApi.larkGrantSuspend(g.id, g.status !== 'suspended');
                        await reload();
                      }}
                    />
                  </Tooltip>
                  <Tooltip title={t('chat.revoke', 'Thu hồi')}>
                    <Button type="text" size="small" danger icon={<StopOutlined />} onClick={() => revoke(g)} />
                  </Tooltip>
                </Space>
              ),
            },
          ]}
        />
      )}

      <Modal
        open={open}
        title={t('chat.shareAssistantWithFriends', 'Chia sẻ Trợ lý AI với bạn bè')}
        onCancel={() => setOpen(false)}
        onOk={() => void create()}
        okText={t('chat.sendInvite', 'Gửi lời mời')}
        cancelText={t('chat.cancel', 'Huỷ')}
        confirmLoading={busy}
        okButtonProps={{ disabled: !friendId }}
      >
        <Space direction="vertical" size={14} style={{ width: '100%', marginTop: 8 }}>
          <div style={{ fontSize: 11.5, color: V.textSub }}>
            {t('chat.shareModalPre', 'Người bạn chọn sẽ dùng Trợ lý AI bằng')} <b>{t('chat.yourClaudeAccount', 'tài khoản Claude của bạn')}</b>{' '}
            {t('chat.shareModalPost', '(chế độ AN TOÀN: hỏi–đáp + tra web, không đọc/sửa gì trên máy). Câu hỏi chạy khi máy bạn đang mở — hoặc 24/7 nếu bạn dựng “máy chủ Trợ lý AI” trên VM.')}
          </div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>{t('chat.shareWith', 'Chia sẻ với')}</div>
            <Select
              style={{ width: '100%' }}
              placeholder={t('chat.selectFriend', 'Chọn một người bạn')}
              value={friendId}
              onChange={setFriendId}
              showSearch
              optionFilterProp="label"
              options={friends.map((f) => ({ value: f.id, label: who(f) }))}
              notFoundContent={t('chat.noFriendsYet', 'Chưa có bạn bè nào — kết bạn trong mục Bạn bè trước')}
            />
          </div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>{t('chat.expiresAfter', 'Hết hạn sau')}</div>
            <Segmented
              value={days}
              onChange={(v) => setDays(Number(v))}
              options={[
                { label: t('chat.days7', '7 ngày'), value: 7 },
                { label: t('chat.days30', '30 ngày'), value: 30 },
                { label: t('chat.unlimitedOpt', 'Không giới hạn'), value: 0 },
              ]}
            />
          </div>
        </Space>
      </Modal>
      </>)}

      <Modal open={!!logFor} title={`${t('chat.logTitle', 'Nhật ký')} — ${who(logFor?.grantee)}`} footer={null} onCancel={() => setLogFor(null)} width={screens.md ? 720 : '94vw'}>
        {calls === null ? (
          <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
        ) : calls.length === 0 ? (
          <Empty description={t('chat.noActivity', 'Chưa có hoạt động nào')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Table<LarkGrantCall>
            size="small"
            rowKey="id"
            dataSource={calls}
            pagination={{ pageSize: 20 }}
            scroll={{ x: 'max-content' }}
            columns={[
              { title: t('chat.timeCol', 'Thời gian'), render: (_, c) => <span style={{ fontSize: 12 }}>{new Date(c.createdAt).toLocaleString('vi-VN')}</span> },
              { title: t('chat.toolCol', 'Công cụ'), dataIndex: 'tool', render: (v: string) => <span style={{ fontSize: 12, fontFamily: 'monospace' }}>{v}</span> },
              {
                title: t('chat.resultCol', 'Kết quả'),
                render: (_, c) => (
                  <Tag color={c.decision === 'allowed' ? 'success' : c.decision === 'error' ? 'error' : 'warning'}>
                    {c.decision === 'allowed' ? t('chat.allow', 'Cho phép') : c.decision.startsWith('denied') ? t('chat.deny', 'Từ chối') : c.decision}
                  </Tag>
                ),
              },
            ]}
          />
        )}
      </Modal>
    </Space>
  );
}
