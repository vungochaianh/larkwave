'use client';
import { useState } from 'react';
import { App, Button, Input, Modal, Spin, Typography } from 'antd';
import { CheckCircleFilled, CloseCircleFilled, LoadingOutlined, CopyOutlined, KeyOutlined } from '@ant-design/icons';

export interface OAuthState {
  phase: 'idle' | 'waiting' | 'success' | 'error';
  provider?: string;
  error?: string;
  /** The authorize URL we opened — offered for copy/paste when the hand-off fails. */
  url?: string;
}

const PROVIDER_LABEL: Record<string, string> = { google: 'Google', github: 'GitHub', gitlab: 'GitLab' };

const ERROR_LABEL: Record<string, string> = {
  timeout: 'Hết thời gian chờ — bạn chưa hoàn tất đăng nhập trên trình duyệt.',
  cancelled: 'Đăng nhập đã bị huỷ trên trình duyệt.',
  token: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng thử lại.',
  google: 'Google từ chối đăng nhập (sai tài khoản hoặc chưa cấp quyền).',
  github: 'GitHub từ chối đăng nhập (sai tài khoản hoặc chưa cấp quyền).',
  gitlab: 'GitLab từ chối đăng nhập (sai tài khoản hoặc chưa cấp quyền).',
  provider: 'Nhà cung cấp không hợp lệ.',
};

/**
 * App-wide modal that tracks a desktop OAuth round-trip: waiting (browser open) →
 * success (auto-closes) or error (with the reason). Rendered by AccountAuthProvider
 * so it covers both login (LoginView) and git-connect (IntegrationsView).
 */
export function OAuthStatusModal({
  state,
  onClose,
  email,
  onPasteToken,
}: {
  state: OAuthState;
  onClose: () => void;
  email?: string;
  /** Manual recovery: sign in with a token pasted from the browser. */
  onPasteToken?: (token: string) => Promise<unknown>;
}) {
  const { message } = App.useApp();
  const provider = state.provider ? (PROVIDER_LABEL[state.provider] ?? state.provider) : '';
  const [showManual, setShowManual] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [applying, setApplying] = useState(false);

  const copyUrl = async () => {
    if (!state.url) return;
    try {
      await navigator.clipboard.writeText(state.url);
      message.success('Đã sao chép link — dán vào trình duyệt bất kỳ để đăng nhập');
    } catch {
      message.error('Không sao chép được. Bạn có thể bôi đen link ở trên để copy tay.');
    }
  };

  const applyToken = async () => {
    const t = manualToken.trim();
    if (!t || !onPasteToken) return;
    setApplying(true);
    try {
      await onPasteToken(t);
      setManualToken('');
      setShowManual(false);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Token không hợp lệ hoặc đã hết hạn');
    } finally {
      setApplying(false);
    }
  };

  /** Shown while waiting AND after an error — both are moments the redirect failed. */
  const fallbacks = (
    <div style={{ marginTop: 18, textAlign: 'left' }}>
      {state.url && (
        <>
          <Typography.Text style={{ fontSize: 12, fontWeight: 600 }}>
            Trình duyệt không mở, hoặc mở nhầm trình duyệt?
          </Typography.Text>
          <Input.TextArea
            value={state.url}
            readOnly
            autoSize={{ minRows: 2, maxRows: 3 }}
            onFocus={(e) => e.currentTarget.select()}
            style={{ fontSize: 11, marginTop: 6, fontFamily: 'ui-monospace, Menlo, monospace' }}
          />
          <Button size="small" icon={<CopyOutlined />} onClick={() => void copyUrl()} style={{ marginTop: 6 }} block>
            Sao chép link đăng nhập
          </Button>
        </>
      )}
      {onPasteToken && (
        <>
          <Button
            size="small"
            type="link"
            icon={<KeyOutlined />}
            onClick={() => setShowManual((v) => !v)}
            style={{ marginTop: 8, paddingLeft: 0 }}
          >
            {showManual ? 'Ẩn' : 'Đăng nhập không tự nhảy về? Dán token thủ công'}
          </Button>
          {showManual && (
            <>
              <Typography.Paragraph type="secondary" style={{ fontSize: 11.5, margin: '2px 0 6px' }}>
                Sau khi đăng nhập trên web, mở trang <b>toolswave.net/auth/callback</b> và sao chép mã hiển thị
                (hoặc phần <code>token=</code> trên thanh địa chỉ), rồi dán vào đây.
              </Typography.Paragraph>
              <Input.TextArea
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                autoSize={{ minRows: 2, maxRows: 4 }}
                placeholder="Dán token vào đây…"
                style={{ fontSize: 11, fontFamily: 'ui-monospace, Menlo, monospace' }}
              />
              <Button
                size="small"
                type="primary"
                loading={applying}
                disabled={!manualToken.trim()}
                onClick={() => void applyToken()}
                style={{ marginTop: 6 }}
                block
              >
                Đăng nhập bằng token
              </Button>
            </>
          )}
        </>
      )}
    </div>
  );
  return (
    <Modal
      open={state.phase !== 'idle'}
      onCancel={onClose}
      footer={null}
      centered
      width={400}
      maskClosable={false}
      closable={state.phase !== 'waiting'}
    >
      <div style={{ textAlign: 'center', padding: '20px 8px 8px' }}>
        {state.phase === 'waiting' && (
          <>
            <Spin indicator={<LoadingOutlined style={{ fontSize: 40 }} spin />} />
            <Typography.Title level={4} style={{ marginTop: 20, marginBottom: 6 }}>
              Đang đăng nhập{provider ? ` với ${provider}` : ''}…
            </Typography.Title>
            <Typography.Text type="secondary">
              Hoàn tất đăng nhập trên trình duyệt vừa mở. App sẽ tự cập nhật khi xong.
            </Typography.Text>
            {fallbacks}
            <div style={{ marginTop: 18 }}>
              <Button onClick={onClose}>Huỷ</Button>
            </div>
          </>
        )}
        {state.phase === 'success' && (
          <>
            <CheckCircleFilled style={{ fontSize: 48, color: '#22c55e' }} />
            <Typography.Title level={4} style={{ marginTop: 16, marginBottom: 4 }}>
              Đăng nhập thành công
            </Typography.Title>
            {email && <Typography.Text type="secondary">{email}</Typography.Text>}
          </>
        )}
        {state.phase === 'error' && (
          <>
            <CloseCircleFilled style={{ fontSize: 48, color: '#ef4444' }} />
            <Typography.Title level={4} style={{ marginTop: 16, marginBottom: 4 }}>
              Đăng nhập không thành công
            </Typography.Title>
            <Typography.Text type="secondary">
              {(state.error && ERROR_LABEL[state.error]) || 'Đã có lỗi xảy ra. Vui lòng thử lại.'}
            </Typography.Text>
            {fallbacks}
            <div style={{ marginTop: 18 }}>
              <Button type="primary" onClick={onClose}>
                Đóng
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
