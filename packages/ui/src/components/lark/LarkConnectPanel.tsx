'use client';
import { useCallback, useEffect, useState } from 'react';
import { App, Alert, Button, Card, Input, List, Space, Tag, Typography } from 'antd';
import {
  ApiOutlined,
  DisconnectOutlined,
  CheckCircleFilled,
  ExportOutlined,
  QrcodeOutlined,
  UserOutlined,
  LogoutOutlined,
  SwapOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { LarkAppRef, LarkConnection, RuntimeAdapter } from '@larkwave/core';
import { useI18n } from '../../i18n';

const { Text, Link, Paragraph } = Typography;

/** Redirect URL the user must register in their Lark app for the QR login (intercepted, never loaded). */
const LARK_REDIRECT = 'https://toolswave.net/lark/callback';

/** Connect / test / disconnect a Lark custom app (app_id + app_secret), with a saved-app history. */
export function LarkConnectPanel({
  runtime,
  connection,
  onChange,
}: {
  runtime: RuntimeAdapter;
  connection: LarkConnection | null;
  onChange: (c: LarkConnection) => void;
}) {
  const { t } = useI18n();
  const { message } = App.useApp();
  const [appId, setAppId] = useState(connection?.appId ?? '');
  const [appSecret, setAppSecret] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [apps, setApps] = useState<LarkAppRef[]>([]);
  /** appId being renamed inline, or null. */
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const connected = !!connection?.connected;
  const open = (url: string) => (runtime.openExternal ? runtime.openExternal(url) : window.open(url, '_blank'));

  const loadApps = useCallback(() => {
    runtime.larkListApps?.().then(setApps).catch(() => setApps([]));
  }, [runtime]);
  useEffect(() => {
    loadApps();
  }, [loadApps, connection?.appId, connection?.connected]);

  const connect = async () => {
    if (!appId.trim() || !appSecret.trim()) {
      message.warning(t('chat.enterAppIdSecret', 'Nhập App ID và App Secret.'));
      return;
    }
    setBusy(true);
    try {
      const c = await runtime.larkConnect!({ appId, appSecret, name: name.trim() || undefined });
      if (c.connected) {
        message.success(t('chat.larkConnected', 'Đã kết nối Lark.'));
        setAppSecret('');
        setName('');
        onChange(c);
        loadApps();
      } else {
        message.error(c.error || t('chat.connectFailed', 'Kết nối thất bại.'));
      }
    } catch (e) {
      message.error((e as Error)?.message || t('chat.connectFailed', 'Kết nối thất bại.'));
    } finally {
      setBusy(false);
    }
  };

  /** Reconnect to a remembered app (no secret re-entry). */
  const switchApp = async (id: string) => {
    setBusy(true);
    try {
      const c = await runtime.larkConnectSaved!(id);
      if (c.connected) {
        onChange(c);
        loadApps();
        message.success(t('chat.switchedApp', 'Đã chuyển sang app đã lưu.'));
      } else {
        message.error(c.error || t('chat.reconnectFailedSecret', 'Không kết nối lại được — hãy nhập lại App Secret.'));
      }
    } catch (e) {
      message.error((e as Error)?.message || t('chat.reconnectFailed', 'Không kết nối lại được.'));
    } finally {
      setBusy(false);
    }
  };

  const forgetApp = async (id: string) => {
    try {
      const next = await runtime.larkForgetApp!(id);
      setApps(next);
      if (id === connection?.appId) onChange({ connected: false });
      message.success(t('chat.appRemoved', 'Đã xoá app khỏi lịch sử.'));
    } catch (e) {
      message.error((e as Error)?.message || t('chat.removeFailed', 'Không xoá được.'));
    }
  };

  const saveRename = async (id: string) => {
    const nm = editName.trim();
    setEditId(null);
    if (!nm) return;
    try {
      setApps(await runtime.larkRenameApp!(id, nm));
    } catch {
      /* ignore */
    }
  };

  /** Re-validate the active connection (real token mint) — surfaces + clears an expiry. */
  const recheck = async () => {
    setChecking(true);
    try {
      const c = await runtime.larkCheckConnection!();
      onChange(c);
      if (c.tokenValid === false) message.warning(t('chat.stillInvalidSecret', 'Kết nối vẫn chưa hợp lệ — hãy nhập lại App Secret.'));
      else if (c.userTokenExpired) message.warning(t('chat.userSessionExpiredQr', 'Phiên tài khoản Lark đã hết hạn — hãy đăng nhập lại (quét QR).'));
      else message.success(t('chat.connectionValid', 'Kết nối Lark còn hiệu lực.'));
    } catch (e) {
      message.error((e as Error)?.message || t('chat.checkConnectionFailed', 'Không kiểm tra được kết nối.'));
    } finally {
      setChecking(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await runtime.larkDisconnect!();
      setAppSecret('');
      onChange({ connected: false });
      loadApps();
      message.success(t('chat.larkDisconnected', 'Đã ngắt kết nối Lark.'));
    } finally {
      setBusy(false);
    }
  };

  const userLogin = async () => {
    setBusy(true);
    try {
      const c = await runtime.larkUserLogin!();
      onChange(c);
      if (c.userLoggedIn) message.success(`${t('chat.loggedInColon', 'Đã đăng nhập')}: ${c.userName || t('chat.larkAccount', 'tài khoản Lark')}`);
      else if (c.error) message.error(c.error);
    } catch (e) {
      message.error((e as Error)?.message || t('chat.loginFailed', 'Đăng nhập thất bại.'));
    } finally {
      setBusy(false);
    }
  };

  const userLogout = async () => {
    setBusy(true);
    try {
      const c = await runtime.larkUserLogout!();
      onChange(c);
      message.success(t('chat.larkLoggedOut', 'Đã đăng xuất tài khoản Lark.'));
    } finally {
      setBusy(false);
    }
  };

  /** Saved-app history list (switch / rename / forget) — shown in both states. */
  const savedApps = apps.length > 0 && (
    <div style={{ borderTop: connected ? '1px solid #F0F1F5' : undefined, paddingTop: connected ? 10 : 0 }}>
      <Text strong style={{ fontSize: 13 }}>
        {t('chat.savedLarkApps', 'App Lark đã lưu')} ({apps.length})
      </Text>
      <Paragraph type="secondary" style={{ fontSize: 12, margin: '4px 0 6px' }}>
        {t('chat.savedAppsHint', 'Chọn để chuyển nhanh giữa các app đã kết nối — không cần nhập lại App Secret.')}
      </Paragraph>
      <List
        size="small"
        dataSource={apps}
        renderItem={(a) =>
          editId === a.appId ? (
            <List.Item>
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  size="small"
                  autoFocus
                  value={editName}
                  placeholder={t('chat.nameToRemember', 'Đặt tên để ghi nhớ')}
                  onChange={(e) => setEditName(e.target.value)}
                  onPressEnter={() => saveRename(a.appId)}
                  onBlur={() => saveRename(a.appId)}
                />
              </Space.Compact>
            </List.Item>
          ) : (
            <List.Item
              actions={[
                a.active ? (
                  <Tag key="on" color="success" style={{ marginInlineEnd: 0 }}>
                    {t('chat.inUse', 'Đang dùng')}
                  </Tag>
                ) : (
                  <Button
                    key="s"
                    type="text"
                    size="small"
                    icon={<SwapOutlined />}
                    title={t('chat.switchToThisApp', 'Chuyển sang app này')}
                    loading={busy}
                    onClick={() => switchApp(a.appId)}
                  />
                ),
                <Button
                  key="e"
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  title={t('chat.setName', 'Đặt tên')}
                  onClick={() => {
                    setEditId(a.appId);
                    setEditName(a.name || '');
                  }}
                />,
                <Button
                  key="d"
                  type="text"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  title={t('chat.removeFromHistory', 'Xoá khỏi lịch sử')}
                  onClick={() => forgetApp(a.appId)}
                />,
              ]}
            >
              <List.Item.Meta
                title={
                  <Text style={{ fontSize: 13 }}>
                    {a.name || a.tenantName || a.appId}
                  </Text>
                }
                description={
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {a.tenantName ? `${a.tenantName} · ` : ''}
                    {a.appId}
                  </Text>
                }
              />
            </List.Item>
          )
        }
      />
    </div>
  );

  return (
    <Card
      size="small"
      title={
        <span>
          <ApiOutlined /> {t('chat.larkConnectTitle', 'Kết nối Lark (Custom App)')}
        </span>
      }
    >
      {connected ? (
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          {/* Token expired / invalid → prompt a reconnect. */}
          {connection?.tokenValid === false ? (
            <Alert
              type="error"
              showIcon
              icon={<WarningOutlined />}
              message={t('chat.connExpiredTitle', 'Kết nối Lark đã hết hạn hoặc không còn hợp lệ')}
              description={
                <Space direction="vertical" size={6} style={{ fontSize: 12 }}>
                  <span>
                    {t('chat.connExpiredDesc', 'Token của app không dùng được (có thể app_secret đã đổi/thu hồi, hoặc lâu không dùng). Hãy thử lại, hoặc nhập lại App Secret rồi kết nối.')}
                  </span>
                  <Space size={6}>
                    <Button size="small" icon={<ReloadOutlined />} loading={checking} onClick={recheck}>
                      {t('chat.retry', 'Thử lại')}
                    </Button>
                    <Button size="small" danger icon={<DisconnectOutlined />} loading={busy} onClick={disconnect}>
                      {t('chat.reenterInfo', 'Nhập lại thông tin')}
                    </Button>
                  </Space>
                </Space>
              }
            />
          ) : (
            <Alert
              type="success"
              showIcon
              icon={<CheckCircleFilled />}
              message={`${t('chat.connected', 'Đã kết nối')}${connection?.tenantName ? `: ${connection.tenantName}` : ''}`}
              description={
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    App ID: {connection?.appId}
                  </Text>
                  <Button size="small" type="link" style={{ padding: 0, height: 'auto', fontSize: 12 }} icon={<ReloadOutlined />} loading={checking} onClick={recheck}>
                    {t('chat.checkConnection', 'Kiểm tra kết nối')}
                  </Button>
                </Space>
              }
            />
          )}
          {connection?.userTokenExpired && (
            <Alert
              type="warning"
              showIcon
              message={t('chat.userSessionExpiredTitle', 'Phiên đăng nhập tài khoản Lark đã hết hạn')}
              description={t('chat.userSessionExpiredDesc', 'Hãy đăng nhập lại (quét QR) để agent tiếp tục thao tác với tư cách bạn.')}
            />
          )}
          {connection?.claudeAvailable === false && (
            <Alert
              type="warning"
              showIcon
              message={t('chat.noClaudeCli', 'Chưa có Claude CLI')}
              description={t('chat.noClaudeCliDesc', 'Nếu chọn Claude làm agent, cần đăng nhập CLI — vào Trang chủ để kết nối. Grok/Gemini/Codex dùng key riêng.')}
            />
          )}

          {/* Personal-account login (user_access_token → full access AS the user). */}
          {runtime.larkUserLogin && (
            <div style={{ borderTop: '1px solid #F0F1F5', paddingTop: 10 }}>
              <Text strong style={{ fontSize: 13 }}>
                <UserOutlined /> {t('chat.loginWithLarkFull', 'Đăng nhập bằng tài khoản Lark (toàn quyền)')}
              </Text>
              <Paragraph type="secondary" style={{ fontSize: 12, margin: '4px 0 8px' }}>
                {t('chat.qrLoginPre', 'Quét QR / đăng nhập bằng tài khoản Lark cá nhân để agent thao tác')} <b>{t('chat.asYou', 'với tư cách bạn')}</b> {t('chat.qrLoginPost', '— truy cập mọi Base, Docs, Sheets, Wiki, Drive, tin nhắn bạn thấy (không cần add từng Base vào app).')}
              </Paragraph>
              {connection?.userLoggedIn ? (
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Alert
                    type="success"
                    showIcon
                    icon={<CheckCircleFilled />}
                    message={`${t('chat.loggedInColon', 'Đã đăng nhập')}: ${connection.userName || t('chat.larkAccount', 'tài khoản Lark')}`}
                  />
                  <Button size="small" icon={<LogoutOutlined />} loading={busy} onClick={userLogout}>
                    {t('chat.logoutAccount', 'Đăng xuất tài khoản')}
                  </Button>
                </Space>
              ) : (
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Alert
                    type="warning"
                    showIcon
                    message={t('chat.configOnceTitle', 'Cấu hình app Lark 1 lần (BẮT BUỘC trước khi quét QR)')}
                    description={
                      <Space direction="vertical" size={5} style={{ fontSize: 12 }}>
                        <span>
                          {t('chat.redirectStep1Pre', '1. Vào')} <b>{t('chat.redirectStep1Bold', 'Developer Console → app của bạn → Security Settings → Redirect URL')}</b>{t('chat.redirectStep1Post', ', thêm CHÍNH XÁC URL này:')}
                          <br />
                          <Text code copyable>
                            {LARK_REDIRECT}
                          </Text>
                        </span>
                        <span>
                          {t('chat.redirectStep2', '2. Bật scopes (Permissions) cho phần bạn cần + thêm')} <Text code>offline_access</Text>.
                        </span>
                        <span style={{ color: '#cf1322' }}>
                          ⚠️ {t('chat.redirectErrPre', 'Báo')} <b>{t('chat.redirectErrBold', '“Invalid redirect URL” (lỗi 20029)')}</b> {t('chat.redirectErrPost', '= bước 1 CHƯA làm — URL trên chưa được thêm vào danh sách Redirect URL của app.')}
                        </span>
                        <Button size="small" icon={<ExportOutlined />} onClick={() => open('https://open.larksuite.com/app')}>
                          {t('chat.openDevConsole', 'Mở Developer Console')}
                        </Button>
                      </Space>
                    }
                  />
                  <Button type="primary" icon={<QrcodeOutlined />} loading={busy} onClick={userLogin} block>
                    {t('chat.loginLarkQr', 'Đăng nhập Lark (quét QR)')}
                  </Button>
                </Space>
              )}
            </div>
          )}

          {savedApps}

          <Button danger icon={<DisconnectOutlined />} loading={busy} onClick={disconnect}>
            {t('chat.disconnect', 'Ngắt kết nối')}
          </Button>
        </Space>
      ) : (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {savedApps}

          <Alert
            type="info"
            showIcon
            message={t('chat.createAppOnce', 'Tạo app Lark một lần (~1 phút)')}
            description={t('chat.createAppOnceDesc', 'Kết nối xong, desktop sẽ ghi nhớ (mã hoá) — lần sau mở app không phải nhập lại. Bạn có thể lưu NHIỀU app và đặt tên để chuyển nhanh.')}
          />

          <div>
            <Text strong style={{ fontSize: 13 }}>
              {t('chat.step1CreateApp', '1. Tạo Custom App')}
            </Text>
            <div style={{ marginTop: 6 }}>
              <Button size="small" icon={<ExportOutlined />} onClick={() => open('https://open.larksuite.com/app')}>
                {t('chat.openLarkDeveloper', 'Mở Lark Developer')}
              </Button>{' '}
              <Text type="secondary" style={{ fontSize: 12 }}>
                → “Create custom app”
              </Text>
            </div>
          </div>

          <div>
            <Text strong style={{ fontSize: 13 }}>
              {t('chat.step2Permissions', '2. Bật quyền (Permissions & Scopes)')}
            </Text>
            <Paragraph type="secondary" style={{ fontSize: 12, margin: '4px 0 6px' }}>
              {t('chat.permHint', 'Tìm và thêm quyền (đọc/ghi) cho các mục bạn cần:')}
            </Paragraph>
            <Space wrap size={[4, 4]}>
              {['bitable', 'im', 'docx', 'contact', 'calendar', 'wiki', 'sheets', 'drive'].map((s) => (
                <Tag key={s} style={{ marginInlineEnd: 0 }}>
                  {s}
                </Tag>
              ))}
            </Space>
          </div>

          <div>
            <Text strong style={{ fontSize: 13 }}>
              {t('chat.step3Credentials', '3. Lấy App ID + App Secret')}
            </Text>
            <Paragraph type="secondary" style={{ fontSize: 12, margin: '4px 0 0' }}>
              {t('chat.credHint', 'Mục “Credentials & Basic Info” → copy 2 giá trị, dán dưới đây.')}
            </Paragraph>
          </div>

          <Input placeholder="App ID (cli_xxx)" value={appId} onChange={(e) => setAppId(e.target.value)} />
          <Input.Password
            placeholder="App Secret"
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
            onPressEnter={connect}
          />
          <Input
            placeholder={t('chat.nameHintPlaceholder', 'Tên gợi nhớ (tuỳ chọn) — vd “Công ty A”, “Workspace bán hàng”')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onPressEnter={connect}
            maxLength={60}
          />
          <Button type="primary" loading={busy} onClick={connect} block>
            {t('chat.connect', 'Kết nối')}
          </Button>
        </Space>
      )}
    </Card>
  );
}
