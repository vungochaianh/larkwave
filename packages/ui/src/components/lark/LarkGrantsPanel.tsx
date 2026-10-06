'use client';
import { useEffect, useState } from 'react';
import { App, Button, Checkbox, Empty, Input, Modal, Segmented, Select, Space, Spin, Table, Tag, Tooltip } from 'antd';
import { ShareAltOutlined, StopOutlined, PauseCircleOutlined, PlayCircleOutlined, HistoryOutlined, SafetyOutlined } from '@ant-design/icons';
import type { LarkBaseRef, RuntimeAdapter } from '@larkwave/core';
import { accountApi, type LarkGrant, type LarkGrantCall } from '../../account/api';
import { V, BRAND } from '../../theme';
import { SharedConvPanel } from './SharedConvPanel';
import { useI18n } from '../../i18n';

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

/**
 * "Chia sẻ kết nối Lark" — the owner delegates access to a friend WITHOUT ever handing
 * over the app secret. The friend receives a grant tied to their own Larkwave account;
 * the credential and all execution stay on this machine, so revoking one person is a
 * single click and never disturbs anyone else.
 */
/**
 * `mode`:
 *   'share'   — chỉ phần CHIA SẺ (tạo lời mời, thu hồi, nhật ký). Cần chủ sở hữu ĐÃ kết nối Lark.
 *   'receive' — chỉ phần NHẬN (lời mời dành cho bạn + kết nối đang được chia sẻ với bạn).
 *   'all'     — cả hai (mặc định, giữ nguyên cách gọi cũ).
 *
 * Vì sao phải tách: người được mời thường CHƯA có app Lark của riêng họ — đó chính là lý do họ cần
 * được chia sẻ. Nhưng toàn bộ panel này trước đây chỉ mount được sau cổng "đã kết nối Lark", mà đây
 * lại là nơi DUY NHẤT trong cả app gọi được `larkGrantClaim` cho lời mời Lark. Kết quả: người cần
 * nhận nhất thì không bao giờ thấy nút "Kết nối" — tính năng chia sẻ có mà trên thực tế không dùng
 * được. (Phần chia sẻ agentchat đã làm đúng từ đầu: mount không cổng.)
 *
 * Phần NHẬN chỉ gọi `accountApi`, không đụng tới runtime Lark cục bộ, nên chạy được cả khi chưa
 * kết nối gì.
 */
export function LarkGrantsPanel({
  runtime,
  mode = 'all',
}: {
  runtime: RuntimeAdapter;
  mode?: 'share' | 'receive' | 'all';
}) {
  const showShare = mode !== 'receive';
  const showReceive = mode !== 'share';
  const { t } = useI18n();
  const { message, modal } = App.useApp();
  const statusLabel: Record<string, string> = {
    pending: t('chat.grantPending', 'Chờ nhận'),
    active: t('chat.grantActive', 'Đang dùng'),
    suspended: t('chat.grantSuspended', 'Tạm dừng'),
    revoked: t('chat.grantRevoked', 'Đã thu hồi'),
  };
  const [bases, setBases] = useState<LarkBaseRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [mine, setMine] = useState<LarkGrant[]>([]);
  const [received, setReceived] = useState<{ active: LarkGrant[]; pending: LarkGrant[] }>({ active: [], pending: [] });
  const [friends, setFriends] = useState<Friend[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [logFor, setLogFor] = useState<LarkGrant | null>(null);
  const [calls, setCalls] = useState<LarkGrantCall[] | null>(null);

  // create-form state
  const [friendId, setFriendId] = useState<string | undefined>();
  // Grantee-side "ask through someone's connection" state.
  const [askFor, setAskFor] = useState<LarkGrant | null>(null);
  const [askText, setAskText] = useState('');
  const [askBusy, setAskBusy] = useState(false);
  const [askOut, setAskOut] = useState('');
  const [days, setDays] = useState(7);
  /**
   * Quyền theo TỪNG Base: tên Base → 'none' | 'read' | 'write'.
   *
   * Trước đây là một danh sách Base tick chọn + MỘT ô quyền chung cho cả lượt chia sẻ. Nhưng
   * chia sẻ thật gần như luôn không đồng nhất ("sửa được bảng Đơn hàng, chỉ đọc bảng Nhân sự"),
   * và một ô chung buộc người ta chọn giữa mở hết hoặc không mở gì.
   */
  const [scopePerm, setScopePerm] = useState<Record<string, 'none' | 'read' | 'write'>>({});
  const scopeNames = Object.keys(scopePerm).filter((n) => scopePerm[n] !== 'none');

  const reload = async () => {
    setLoading(true);
    try {
      const [a, b] = await Promise.all([accountApi.larkGrants(), accountApi.larkGrantsReceived()]);
      // This panel is ONLY for shared Lark connections. agentchat grants share the same
      // endpoints but belong to the "Trợ lý AI" panel, so filter them out here.
      const lark = (g: LarkGrant) => g.kind !== 'agentchat';
      setMine(a.filter(lark));
      setReceived({ active: b.active.filter(lark), pending: b.pending.filter(lark) });
    } catch {
      /* offline — panel simply shows empty */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // Friends are the only people a connection can be shared with, so the picker never
    // takes a raw email (which would also leak "does this account exist?").
    void accountApi
      .friends()
      .then((f) => setFriends(f as unknown as Friend[]))
      .catch(() => {});
    void runtime
      .larkListBases?.()
      .then((b) => setBases(b || []))
      .catch(() => {});
  }, [runtime]);

  // The delegated-turn gateway is mounted ONCE app-wide (HomeScreen) so turns run even when
  // this panel is closed — do NOT mount a second one here (that double-executes each turn).

  const create = async () => {
    if (!friendId) return;
    setBusy(true);
    try {
      // `mode` của cả grant là hệ quả, không phải lựa chọn riêng: có ít nhất một Base cho ghi
      // thì grant ở chế độ 'build'. Chặn thật vẫn theo TỪNG Base ở `writeTokens`.
      const mode: 'ask' | 'build' = scopeNames.some((n) => scopePerm[n] === 'write') ? 'build' : 'ask';
      const g = await accountApi.larkGrantCreate({
        inviteeUserId: friendId,
        mode,
        expiresInDays: days,
        label: scopeNames.join(', ').slice(0, 120),
        scopes: scopeNames.map((n) => ({ baseName: n })),
      });
      // The server only ever learned the base NAMES. Record the authoritative scope —
      // the app_tokens — on THIS machine, which is what actually gates every tool call.
      const picked = bases.filter((b) => scopeNames.includes(b.name));
      await runtime.larkSetGrantPolicy?.(g.id, {
        appTokens: picked.map((b) => b.appToken),
        mode,
        writeTokens: Object.fromEntries(
          picked.filter((b) => scopePerm[b.name] === 'write').map((b) => [b.appToken, true]),
        ),
        label: scopeNames.join(', '),
      });
      message.success(t('chat.inviteSent', 'Đã gửi lời mời. Bạn của bạn chỉ cần bấm "Kết nối" trong Larkwave.'));
      setOpen(false);
      setFriendId(undefined);
      setScopePerm({});
      await reload();
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('chat.inviteCreateFailed', 'Không tạo được lời mời'));
    } finally {
      setBusy(false);
    }
  };

  const revoke = (g: LarkGrant) =>
    modal.confirm({
      title: `${t('chat.revokeAccessOf', 'Thu hồi quyền của')} ${who(g.grantee)}?`,
      content: t('chat.revokeLarkContent', 'Người này sẽ mất quyền dùng kết nối Lark của bạn ngay lập tức. Những người khác KHÔNG bị ảnh hưởng, và bạn không phải đổi App Secret.'),
      okText: t('chat.revoke', 'Thu hồi'),
      okButtonProps: { danger: true },
      cancelText: t('chat.cancel', 'Huỷ'),
      onOk: async () => {
        await accountApi.larkGrantRevoke(g.id);
        // Drop the local policy too: with no scope on disk the gateway denies the grant
        // even if a stale row somehow survived server-side.
        await runtime.larkSetGrantPolicy?.(g.id, null);
        await reload();
      },
    });

  /** Grantee: send one turn to the owner's machine and wait for the answer. */
  const ask = async () => {
    if (!askFor || !askText.trim()) return;
    setAskBusy(true);
    setAskOut('');
    try {
      const turn = await accountApi.larkGrantSubmitTurn(askFor.id, askText.trim());
      const deadline = Date.now() + 180_000;
      for (;;) {
        await new Promise((r) => setTimeout(r, 2000));
        const s = await accountApi.larkGrantTurn(turn.id);
        if (s.status === 'succeeded') {
          setAskOut(s.result || t('chat.noContent', '(không có nội dung)'));
          break;
        }
        if (s.status === 'failed' || s.status === 'denied') {
          setAskOut(`⚠️ ${s.error || t('chat.rejected', 'Bị từ chối')}`);
          break;
        }
        if (Date.now() > deadline) {
          setAskOut(`⚠️ ${t('chat.timeoutOwnerOff', 'Quá thời gian chờ — máy của chủ sở hữu có thể đang tắt.')}`);
          break;
        }
      }
    } catch (e) {
      setAskOut(`⚠️ ${e instanceof Error ? e.message : t('chat.sendFailed', 'Không gửi được')}`);
    } finally {
      setAskBusy(false);
    }
  };

  const claim = async (g: LarkGrant) => {
    try {
      await accountApi.larkGrantClaim(g.id);
      message.success(`${t('chat.connectedLarkOf', 'Đã kết nối với Lark của')} ${who(g.owner)}`);
      await reload();
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
      {/* Hội thoại dùng chung đứng TRÊN phần quản lý quyền có chủ ý: quyền là thứ người ta dựng
          một lần rồi quên, còn hội thoại là thứ mở ra hằng ngày. */}
      <SharedConvPanel grants={[...mine, ...received.active]} />
      {showShare && (
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
          Bạn bè dùng được Lark của bạn mà <b>KHÔNG nhận App Secret</b> — mọi thao tác chạy trên máy bạn bằng
          kết nối của bạn. Vì thế bạn <b>thu hồi được từng người</b> chỉ bằng một nút, không phải đổi App Secret
          (đổi secret sẽ ngắt kết nối của tất cả mọi người, kể cả bạn).
        </div>
      </div>
      )}

      {showReceive && received.pending.length > 0 && (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color: V.text }}>{t('chat.invitesForYou', 'Lời mời dành cho bạn')}</div>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {received.pending.map((g) => (
              <div
                key={g.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: `1px solid ${V.border}`,
                  background: V.surface,
                }}
              >
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: V.text }}>
                  <b>{who(g.owner)}</b> {t('chat.sharesLarkWithYou', 'chia sẻ kết nối Lark với bạn')}
                  <div style={{ fontSize: 11.5, color: V.textSub, marginTop: 2 }}>
                    {g.mode === 'ask' ? t('chat.readOnlyAsk', 'Chỉ đọc (Hỏi đáp)') : t('chat.editableConfirm', 'Được chỉnh sửa (mỗi thao tác ghi vẫn cần chủ duyệt)')}
                    {g.expiresAt ? ` · ${t('chat.expires', 'hết hạn')} ${new Date(g.expiresAt).toLocaleDateString('vi-VN')}` : ''}
                  </div>
                </div>
                <Button type="primary" onClick={() => void claim(g)}>
                  {t('chat.connect', 'Kết nối')}
                </Button>
              </div>
            ))}
          </Space>
        </div>
      )}

      {showReceive && received.active.length > 0 && (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color: V.text }}>
            {t('chat.connectionsSharedWithYou', 'Kết nối được chia sẻ với bạn')}
          </div>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {received.active.map((g) => (
              <div
                key={g.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: `1px solid ${V.border}`,
                  background: V.surface,
                }}
              >
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: V.text }}>
                  {t('chat.larkOf', 'Lark của')} <b>{who(g.owner)}</b>
                  <div style={{ fontSize: 11.5, color: V.textSub, marginTop: 2 }}>
                    {g.scopes?.map((s) => s.baseName).join(', ') || t('chat.noBaseYet', 'chưa có Base')} ·{' '}
                    {g.mode === 'ask' ? t('chat.readOnly', 'chỉ đọc') : t('chat.editable', 'được chỉnh sửa')}
                    {g.status === 'suspended' ? ` · ${t('chat.paused', 'đang tạm dừng')}` : ''}
                  </div>
                </div>
                <Button
                  disabled={g.status !== 'active'}
                  onClick={() => {
                    setAskFor(g);
                    setAskText('');
                    setAskOut('');
                  }}
                >
                  {t('chat.ask', 'Hỏi')}
                </Button>
              </div>
            ))}
          </Space>
        </div>
      )}

      {showShare && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: V.text }}>{t('chat.peopleUsingConnection', 'Người đang dùng kết nối của bạn')}</div>
        <div style={{ flex: 1 }} />
        <Button type="primary" icon={<ShareAltOutlined />} onClick={() => setOpen(true)}>
          {t('chat.shareConnection', 'Chia sẻ kết nối')}
        </Button>
      </div>
      )}

      {showShare && (mine.length === 0 ? (
        <Empty description={t('chat.notSharedYet', 'Chưa chia sẻ với ai')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <Table<LarkGrant>
          size="small"
          rowKey="id"
          dataSource={mine}
          pagination={false}
          columns={[
            {
              title: t('chat.userCol', 'Người dùng'),
              render: (_, g) => (
                <span style={{ fontSize: 13 }}>
                  {g.grantee ? who(g.grantee) : <span style={{ color: V.textFaint }}>{t('chat.notClaimed', 'chưa nhận lời mời')}</span>}
                </span>
              ),
            },
            {
              title: t('chat.scopeCol', 'Phạm vi'),
              render: (_, g) =>
                g.scopes?.length ? (
                  <span style={{ fontSize: 12 }}>{g.scopes.map((s) => s.baseName).join(', ')}</span>
                ) : (
                  <span style={{ fontSize: 12, color: V.textFaint }}>{t('chat.noBaseSelected', 'Chưa chọn Base')}</span>
                ),
            },
            {
              title: t('chat.permissionCol', 'Quyền'),
              render: (_, g) => <Tag color={g.mode === 'build' ? 'orange' : 'blue'}>{g.mode === 'build' ? t('chat.editShort', 'Chỉnh sửa') : t('chat.readOnlyCap', 'Chỉ đọc')}</Tag>,
            },
            {
              title: t('chat.statusCol', 'Trạng thái'),
              render: (_, g) => <Tag color={STATUS[g.status]?.color}>{statusLabel[g.status] ?? g.status}</Tag>,
            },
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
      ))}

      <Modal
        open={open}
        title={t('chat.shareLarkWithFriends', 'Chia sẻ kết nối Lark với bạn bè')}
        onCancel={() => setOpen(false)}
        onOk={() => void create()}
        okText={t('chat.sendInvite', 'Gửi lời mời')}
        cancelText={t('chat.cancel', 'Huỷ')}
        confirmLoading={busy}
        okButtonProps={{ disabled: !friendId }}
      >
        <Space direction="vertical" size={14} style={{ width: '100%', marginTop: 8 }}>
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
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>{t('chat.whichBase', 'Chia sẻ Base nào?')}</div>
            {bases.length === 0 ? (
              <span style={{ fontSize: 12, color: V.textFaint }}>{t('chat.noBaseRegistered', 'Chưa có Base nào được đăng ký.')}</span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {bases.map((b) => (
                  <div
                    key={b.appToken}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}
                  >
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>
                      {b.name}
                    </span>
                    <Segmented
                      size="small"
                      value={scopePerm[b.name] ?? 'none'}
                      onChange={(v) => setScopePerm((p) => ({ ...p, [b.name]: v as 'none' | 'read' | 'write' }))}
                      options={[
                        { label: t('chat.scopeNone', 'Không'), value: 'none' },
                        { label: t('chat.scopeRead', 'Đọc'), value: 'read' },
                        { label: t('chat.scopeWrite', 'Đọc + ghi'), value: 'write' },
                      ]}
                    />
                  </div>
                ))}
                <div style={{ fontSize: 11.5, color: V.textFaint, lineHeight: 1.5 }}>
                  {t(
                    'chat.scopeHint',
                    'Base để "Không" thì người được chia sẻ không thấy và không hỏi được — kể cả khi biết tên. "Đọc" thì mọi thao tác sửa dữ liệu đều bị từ chối.',
                  )}
                </div>
              </div>
            )}
          </div>
          <div>
            {/* Không còn ô "Quyền" chung: quyền nay chọn theo TỪNG Base ở trên, và mode của cả
                grant chỉ là hệ quả (có Base nào cho ghi thì là 'build'). Để cả hai thì hai chỗ
                nói về cùng một thứ và sẽ mâu thuẫn nhau. */}
            {scopeNames.some((n) => scopePerm[n] === 'write') && (
              <div style={{ fontSize: 11.5, color: '#F59E0B' }}>
                {t('chat.writeApprovalNote', 'Mỗi thao tác GHI vẫn sẽ hiện lên cho bạn duyệt trước khi chạy.')}
              </div>
            )}
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

      <Modal
        open={!!askFor}
        title={`${t('chat.askViaLarkOf', 'Hỏi qua kết nối Lark của')} ${who(askFor?.owner)}`}
        onCancel={() => setAskFor(null)}
        onOk={() => void ask()}
        okText={t('chat.send', 'Gửi')}
        cancelText={t('chat.close', 'Đóng')}
        confirmLoading={askBusy}
        okButtonProps={{ disabled: !askText.trim() }}
        width={640}
      >
        <div style={{ fontSize: 11.5, color: V.textSub, marginBottom: 8 }}>
          {t('chat.askDescPre', 'Câu hỏi chạy trên máy của')} {who(askFor?.owner)} {t('chat.askDescPost', 'bằng kết nối của họ, trong phạm vi Base họ đã cấp. Bạn không nhận credential nào.')}
        </div>
        <Input.TextArea
          value={askText}
          onChange={(e) => setAskText(e.target.value)}
          autoSize={{ minRows: 2, maxRows: 6 }}
          placeholder={t('chat.askExample', 'Ví dụ: Có bao nhiêu đơn chưa thu tiền trong tháng này?')}
        />
        {(askBusy || askOut) && (
          <div
            style={{
              marginTop: 10,
              padding: '10px 12px',
              borderRadius: 8,
              background: V.surfaceAlt,
              border: `1px solid ${V.border}`,
              fontSize: 12.5,
              color: V.text,
              whiteSpace: 'pre-wrap',
              maxHeight: 320,
              overflowY: 'auto',
            }}
          >
            {askBusy && !askOut ? <Spin size="small" /> : askOut}
            {askBusy && !askOut && (
              <span style={{ marginLeft: 8, color: V.textSub }}>{t('chat.waitingMachineOf', 'Đang chờ máy của')} {who(askFor?.owner)} {t('chat.running2', 'chạy…')}</span>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!logFor}
        title={`${t('chat.accessLog', 'Nhật ký truy cập')} — ${who(logFor?.grantee)}`}
        footer={null}
        onCancel={() => setLogFor(null)}
        width={720}
      >
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
            columns={[
              {
                title: t('chat.timeCol', 'Thời gian'),
                render: (_, c) => <span style={{ fontSize: 12 }}>{new Date(c.createdAt).toLocaleString('vi-VN')}</span>,
              },
              { title: t('chat.toolCol', 'Công cụ'), dataIndex: 'tool', render: (v: string) => <span style={{ fontSize: 12, fontFamily: 'monospace' }}>{v}</span> },
              { title: t('chat.targetCol', 'Đối tượng'), dataIndex: 'targetName', render: (v: string) => <span style={{ fontSize: 12 }}>{v || '—'}</span> },
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
