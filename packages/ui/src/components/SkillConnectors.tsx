'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, App as AntApp, Button, Input, Tag, Typography } from 'antd';
import { ApiOutlined, DeleteOutlined, LogoutOutlined, MailOutlined, MessageOutlined, QrcodeOutlined, ReloadOutlined } from '@ant-design/icons';
import type { GmailConnectorAccount, RuntimeAdapter, ZaloConnectorStatus, ZaloQrSnapshot } from '@larkwave/core';
import { useI18n } from '../i18n';
import { OK, V, WARN } from '../theme';

const { Text } = Typography;

/** Trạng thái QR còn đang chạy (cần hỏi lại để thấy ảnh mã mới / kết quả quét). */
const QR_LIVE = new Set(['starting', 'awaiting-scan', 'scanned', 'authenticating']);

/**
 * "Kết nối cho kỹ năng": Zalo cá nhân (quét QR) và Gmail (mật khẩu ứng dụng). Chỉ NGƯỜI DÙNG kết nối ở
 * đây; agent không tự thao tác — nó chỉ dùng kết nối qua công cụ zalo_ / gmail_ BÊN TRONG một kỹ năng
 * (bộ dựng sẵn "Zalo & Gmail" hoặc kỹ năng tự soạn), và lần gửi nào cũng hỏi.
 */
export function SkillConnectors({
  runtime,
  only,
  autoQr,
  onConnected,
}: {
  runtime: RuntimeAdapter;
  /** Chỉ hiện một phần, mở sẵn, không đầu mục — dùng trong modal "sửa nhanh" (FixCenter). */
  only?: 'zalo' | 'gmail';
  /** Zalo: mở là tạo mã QR luôn (người dùng bấm "Kết nối Zalo" từ thông báo / thẻ lỗi). */
  autoQr?: boolean;
  /** Vừa kết nối xong (Zalo sẵn sàng / thêm được Gmail). */
  onConnected?: (what: 'zalo' | 'gmail') => void;
}) {
  const { t } = useI18n();
  const { message } = AntApp.useApp();
  const call = runtime.connectorsCall?.bind(runtime);
  const [zalo, setZalo] = useState<ZaloConnectorStatus | null>(null);
  const [gmail, setGmail] = useState<GmailConnectorAccount[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [name, setName] = useState('');
  const [open, setOpen] = useState(!!only);
  const autoStarted = useRef(false);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!call) return;
    try {
      const [z, g] = await Promise.all([call('zaloStatus') as Promise<ZaloConnectorStatus>, call('gmailList') as Promise<GmailConnectorAccount[]>]);
      setZalo(z);
      setGmail(g || []);
    } catch {
      /* lõi tạm bận — lần sau hỏi lại */
    }
  }, [call]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Mở từ "sửa nhanh": chưa có tài khoản Zalo sẵn sàng và chưa có mã ⇒ tạo QR ngay, khỏi bấm thêm.
  useEffect(() => {
    if (!autoQr || only !== 'zalo' || !call || !zalo || autoStarted.current) return;
    autoStarted.current = true;
    const ready = zalo.accounts.some((a) => a.status === 'ready');
    if (!ready && !QR_LIVE.has(zalo.qr.state)) void call('zaloQrStart').then(() => refresh()).catch(() => undefined);
  }, [autoQr, only, call, zalo, refresh]);

  // Báo cho modal biết đã kết nối xong (đóng modal / kiểm lại).
  const wasReady = useRef<boolean | null>(null);
  useEffect(() => {
    if (!onConnected || !zalo) return;
    const ready = zalo.accounts.some((a) => a.status === 'ready');
    if (wasReady.current === false && ready) onConnected('zalo');
    wasReady.current = ready;
  }, [zalo, onConnected]);

  // Trong lúc mã QR còn sống: hỏi trạng thái mỗi 1,5 giây (ảnh mã đổi khi hết hạn, kết quả quét…).
  const qrState = zalo?.qr.state;
  useEffect(() => {
    if (!call || !qrState || !QR_LIVE.has(qrState)) return;
    poll.current = setInterval(() => void refresh(), 1500);
    return () => {
      if (poll.current) clearInterval(poll.current);
    };
  }, [call, qrState, refresh]);

  if (!call) {
    return (
      <Alert
        style={{ marginBottom: 12 }}
        type="info"
        showIcon
        message={t('skills.conn.needCore', 'Kỹ năng Zalo & Gmail cần bản cài Larkwave mới (0.1.5 trở lên) — tải ở toolswave.net/larkwave.')}
      />
    );
  }

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) message.success(ok);
    } catch (e) {
      message.error((e as Error)?.message || t('skills.conn.failed', 'Không thực hiện được.'));
    } finally {
      setBusy(null);
      void refresh();
    }
  };

  const qr: ZaloQrSnapshot | undefined = zalo?.qr;
  const zaloAccounts = zalo?.accounts ?? [];
  const showQr = !!qr && (QR_LIVE.has(qr.state) || ['expired', 'declined', 'error'].includes(qr.state));

  return (
    <div style={only ? undefined : { border: `1px solid ${V.borderSub}`, borderRadius: 12, padding: '12px 14px', marginBottom: 12, background: V.surface }}>
      {!only && (<>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <ApiOutlined style={{ color: V.textFaint }} />
        <Text strong>{t('skills.conn.title', 'Kết nối cho kỹ năng: Zalo · Gmail')}</Text>
        {zaloAccounts.some((a) => a.status === 'ready') && <Tag color="green">Zalo</Tag>}
        {gmail.length > 0 && <Tag color="green">Gmail</Tag>}
        <div style={{ flex: 1 }} />
        <Button size="small" type="text" onClick={() => setOpen((o) => !o)}>
          {open ? t('skills.conn.hide', 'Thu gọn') : t('skills.conn.show', 'Mở')}
        </Button>
      </div>
      <Text type="secondary" style={{ fontSize: 12.5, display: 'block', marginTop: 4 }}>
        {t(
          'skills.conn.desc',
          'Kết nối do app giữ (mã hoá trên máy). Agent KHÔNG tự thao tác Zalo/Gmail: chỉ dùng trong các kỹ năng "Đọc tin Zalo", "Gửi tin Zalo", "Đọc thư Gmail", "Gửi thư Gmail" (hoặc kỹ năng bạn tự soạn có dùng công cụ zalo_/gmail_), chỉ trong cuộc trò chuyện của bạn — và lần gửi nào cũng hỏi bạn trước.',
        )}
      </Text>
      </>)}

      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: only ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginTop: only ? 0 : 12 }}>
          {/* ── Zalo ── */}
          {only !== 'gmail' && (
          <div style={{ border: `1px solid ${V.borderSub}`, borderRadius: 10, padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <MessageOutlined />
              <Text strong>Zalo</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>{t('skills.conn.zaloKind', 'tài khoản cá nhân')}</Text>
            </div>
            {zaloAccounts.map((a) => (
              <div key={a.accountId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: `1px dashed ${V.borderSub}` }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: a.status === 'ready' ? OK : WARN, flex: 'none' }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.label}</div>
                  <Text type="secondary" style={{ fontSize: 12 }}>{a.message}</Text>
                </div>
                <Button size="small" icon={<LogoutOutlined />} loading={busy === `zl:${a.accountId}`} onClick={() => void run(`zl:${a.accountId}`, () => call('zaloLogout', { accountId: a.accountId }), t('skills.conn.zaloOut', 'Đã đăng xuất Zalo.'))}>
                  {t('skills.conn.logout', 'Đăng xuất')}
                </Button>
              </div>
            ))}
            {showQr && qr && (
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                {qr.image && QR_LIVE.has(qr.state) ? (
                  <img alt="Zalo QR" src={`data:image/png;base64,${qr.image}`} style={{ width: 200, height: 200, borderRadius: 8, border: `1px solid ${V.borderSub}`, background: '#fff' }} />
                ) : null}
                <div style={{ fontSize: 13, marginTop: 6 }}>{qr.scannedName ? `${qr.message} — ${qr.scannedName}` : qr.message}</div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 8 }}>
                  {['expired', 'declined', 'error'].includes(qr.state) && (
                    <Button size="small" icon={<ReloadOutlined />} onClick={() => void run('zqr', () => (qr.state === 'expired' ? call('zaloQrRetry') : call('zaloQrStart')))}>
                      {t('skills.conn.qrNew', 'Tạo mã mới')}
                    </Button>
                  )}
                  {QR_LIVE.has(qr.state) && (
                    <Button size="small" onClick={() => void run('zqa', () => call('zaloQrAbort'))}>
                      {t('skills.conn.cancel', 'Huỷ')}
                    </Button>
                  )}
                </div>
              </div>
            )}
            {!showQr && (
              <Button style={{ marginTop: 8 }} icon={<QrcodeOutlined />} loading={busy === 'zqs'} onClick={() => void run('zqs', () => call('zaloQrStart'))}>
                {zaloAccounts.length ? t('skills.conn.zaloAdd', 'Thêm tài khoản Zalo (quét QR)') : t('skills.conn.zaloConnect', 'Kết nối Zalo (quét QR)')}
              </Button>
            )}
            <Text type="secondary" style={{ fontSize: 11.5, display: 'block', marginTop: 8 }}>
              {t('skills.conn.zaloNote2', 'Quét bằng app Zalo trên điện thoại. Đọc được tin nhóm gần đây và tin 1-1 Zalo đồng bộ/đến trong lúc app mở. Gửi: không giới hạn số tin — nhưng Zalo có thể hạn chế/khoá tài khoản cá nhân gửi dày, gửi nội dung lặp lại hay nhắn người lạ; bạn tự cân nhắc.')}
            </Text>
          </div>

          )}

          {/* ── Gmail ── */}
          {only !== 'zalo' && (
          <div style={{ border: `1px solid ${V.borderSub}`, borderRadius: 10, padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <MailOutlined />
              <Text strong>Gmail</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>{t('skills.conn.gmailKind', 'mật khẩu ứng dụng')}</Text>
            </div>
            {gmail.map((g) => (
              <div key={g.email} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: `1px dashed ${V.borderSub}` }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: OK, flex: 'none' }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.email}</div>
                  {!g.encrypted && <Text type="warning" style={{ fontSize: 12 }}>{t('skills.conn.plain', 'Máy không có kho khoá — mật khẩu lưu dạng thường')}</Text>}
                </div>
                <Button size="small" danger icon={<DeleteOutlined />} loading={busy === `gr:${g.email}`} onClick={() => void run(`gr:${g.email}`, () => call('gmailRemove', { email: g.email }), t('skills.conn.gmailOut', 'Đã gỡ Gmail.'))}>
                  {t('skills.conn.remove', 'Gỡ')}
                </Button>
              </div>
            ))}
            <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
              <Input size="small" placeholder="ban@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
              <Input.Password size="small" placeholder={t('skills.conn.appPass', 'Mật khẩu ứng dụng (16 ký tự)')} value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" />
              <Input size="small" placeholder={t('skills.conn.fromName', 'Tên hiện khi gửi (tuỳ chọn)')} value={name} onChange={(e) => setName(e.target.value)} />
              <Button
                type="primary"
                size="small"
                loading={busy === 'ga'}
                disabled={!email.trim() || pass.replace(/\s/g, '').length < 12}
                onClick={() =>
                  void run(
                    'ga',
                    async () => {
                      await call('gmailAdd', { email: email.trim(), appPassword: pass, name: name.trim() || undefined });
                      setPass('');
                      onConnected?.('gmail');
                    },
                    t('skills.conn.gmailOk', 'Đã kết nối Gmail (đã kiểm gửi + đọc).'),
                  )
                }
              >
                {t('skills.conn.gmailConnect', 'Kết nối Gmail')}
              </Button>
            </div>
            <Text type="secondary" style={{ fontSize: 11.5, display: 'block', marginTop: 8 }}>
              {t('skills.conn.gmailNote', 'Tạo mật khẩu ứng dụng ở myaccount.google.com/apppasswords (tài khoản phải bật xác thực 2 bước) — KHÔNG dùng mật khẩu Gmail thường. App kiểm gửi (SMTP) + đọc (IMAP) trước khi lưu; đọc thư không đánh dấu đã đọc.')}
            </Text>
          </div>
          )}
        </div>
      )}
    </div>
  );
}
