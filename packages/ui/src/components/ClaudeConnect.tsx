'use client';
import { useCallback, useEffect, useState } from 'react';
import { Card, Button, Typography, Steps, Alert, Space, Spin, Divider, Input, Collapse } from 'antd';
import { CheckCircleFilled, CloudOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ClaudeStatus } from '@larkwave/core';
import { useRuntime } from '../RuntimeProvider';
import { ClaudeKeyManager } from './ClaudeKeyManager';
import { BRAND_GRADIENT, V } from '../theme';
import { useI18n } from '../i18n';

const { Title, Text, Paragraph, Link } = Typography;

function open(runtime: ReturnType<typeof useRuntime>, url: string) {
  if (runtime.openExternal) runtime.openExternal(url);
  else window.open(url, '_blank');
}

/**
 * Gate shown until the local Claude CLI is installed + logged in. Mirrors the
 * `claude` / `/login` flow but as a recognizable GUI: status → login (opens the
 * browser OAuth) → done. Calls `onReady` once connected.
 */
export function ClaudeConnect({ onReady }: { onReady: () => void }) {
  const runtime = useRuntime();
  const { t } = useI18n();
  const [st, setSt] = useState<ClaudeStatus | null>(null);
  const [logging, setLogging] = useState(false);
  const [authUrl, setAuthUrl] = useState('');
  const [logLine, setLogLine] = useState('');
  const [token, setToken] = useState('');
  const [savingToken, setSavingToken] = useState(false);

  const refresh = useCallback(async () => {
    const s = await runtime.claude!.status().catch(() => null);
    setSt(s);
    if (s?.loggedIn) onReady();
    return s;
  }, [runtime, onReady]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Auto-reload when the user comes back to the app — e.g. right after finishing
  // the Claude OAuth flow in their browser. Without this the gate would stay on
  // "Đăng nhập" until a manual "Kiểm tra lại". Stops once logged in.
  useEffect(() => {
    if (st?.loggedIn) return;
    const recheck = () => {
      if (document.visibilityState !== 'hidden') void refresh();
    };
    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', recheck);
    return () => {
      window.removeEventListener('focus', recheck);
      document.removeEventListener('visibilitychange', recheck);
    };
  }, [refresh, st?.loggedIn]);

  const login = async () => {
    setLogging(true);
    setAuthUrl('');
    try {
      for await (const ev of runtime.claude!.login()) {
        if (ev.type === 'url') {
          setAuthUrl(ev.url);
          open(runtime, ev.url);
        } else if (ev.type === 'log') setLogLine(ev.message);
        else if (ev.type === 'done') {
          setSt(ev.status);
          if (ev.status.loggedIn) onReady();
        } else if (ev.type === 'error') setLogLine(ev.message);
      }
    } finally {
      setLogging(false);
      // The CLI can finish writing credentials a moment after the login process
      // exits — poll briefly so the UI advances on its own once logged in.
      for (let i = 0; i < 6; i++) {
        const s = await refresh();
        if (s?.loggedIn) break;
        await new Promise((r) => setTimeout(r, 1200));
      }
    }
  };

  const saveToken = async () => {
    const tok = token.trim();
    if (!tok) return;
    setSavingToken(true);
    try {
      const s = await runtime.claude!.setToken(tok);
      setSt(s);
      setToken('');
      if (s.loggedIn) onReady();
    } catch (e) {
      setLogLine((e as Error)?.message || t('ui.claude.saveTokenFailed', 'Không lưu được token.'));
    } finally {
      setSavingToken(false);
    }
  };

  const clearToken = async () => {
    const s = await runtime.claude!.clearToken().catch(() => null);
    if (s) setSt(s);
  };

  const step = !st ? 0 : !st.installed ? 0 : !st.loggedIn ? 1 : 2;

  return (
    <div style={{ maxWidth: 560, margin: '40px auto 0' }}>
      <Card>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: BRAND_GRADIENT, margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 26 }}>
            <CloudOutlined />
          </div>
          <Title level={4} style={{ margin: 0 }}>{t('ui.claude.connectTitle', 'Kết nối Claude (CLI) trên máy bạn')}</Title>
          <Text type="secondary">{t('ui.claude.connectDesc', 'Desktop dùng Claude CLI của bạn (hoặc runner khác trong Cài đặt) để chạy Lark × Agents — không tốn phí token của Larkwave.')}</Text>
        </div>

        <Steps
          size="small"
          current={step}
          style={{ marginBottom: 18 }}
          items={[{ title: t('ui.claude.stepInstall', 'Cài Claude CLI') }, { title: t('ui.claude.stepLogin', 'Đăng nhập') }, { title: t('ui.claude.stepReady', 'Sẵn sàng') }]}
        />

        {!st && <div style={{ textAlign: 'center', padding: 16 }}><Spin /> {t('ui.claude.checking', 'Đang kiểm tra…')}</div>}

        {st && !st.installed && (
          <Alert
            type="warning"
            showIcon
            message={t('ui.claude.notFound', 'Chưa tìm thấy Claude CLI')}
            description={
              <Space direction="vertical" size={4}>
                <Text>{t('ui.claude.installCmd', 'Cài bằng lệnh:')}</Text>
                <Text code copyable>npm i -g @anthropic-ai/claude-code</Text>
                <Link onClick={() => open(runtime, 'https://docs.claude.com/claude-code')}>{t('ui.claude.installGuide', 'Hướng dẫn cài đặt →')}</Link>
                <Button icon={<ReloadOutlined />} onClick={refresh}>{t('ui.claude.recheck', 'Kiểm tra lại')}</Button>
              </Space>
            }
          />
        )}

        {st && st.installed && !st.loggedIn && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {t('ui.claude.loginDescPre', 'Đăng nhập bằng tài khoản Claude (Pro/Max) của bạn. Nút dưới sẽ chạy')} <Text code>claude auth login</Text> {t('ui.claude.loginDescPost', 'và mở trình duyệt để xác thực.')}
            </Paragraph>
            <Button type="primary" size="large" block loading={logging} onClick={login}>
              {t('ui.claude.loginBtn', 'Đăng nhập bằng Claude')}
            </Button>
            {authUrl && (
              <Alert type="info" showIcon message={t('ui.claude.openLinkIfNeeded', 'Mở liên kết này nếu trình duyệt chưa tự mở:')} description={<Link onClick={() => open(runtime, authUrl)}>{authUrl}</Link>} />
            )}
            {logLine && <Text type="secondary" style={{ fontSize: 12 }}>{logLine}</Text>}
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('ui.claude.orTerminalPre', 'Hoặc mở terminal, gõ')} <Text code>claude</Text> {t('ui.claude.orTerminalMid', 'rồi')} <Text code>/login</Text>{t('ui.claude.orTerminalPost', ', sau đó bấm')}{' '}
              <a onClick={refresh}>{t('ui.claude.recheck', 'Kiểm tra lại')}</a>.
            </Text>

            <Divider plain style={{ margin: '4px 0', fontSize: 12, color: V.textFaint }}>{t('ui.claude.orPasteToken', 'hoặc dán token')}</Divider>
            <Input.Password
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onPressEnter={() => void saveToken()}
              placeholder={t('ui.claude.tokenPlaceholder', 'sk-ant-api… (API key) hoặc sk-ant-oat… (token đăng nhập)')}
              autoComplete="off"
            />
            <Button block loading={savingToken} disabled={!token.trim()} onClick={saveToken}>
              {t('ui.claude.saveToken', 'Lưu token')}
            </Button>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('ui.claude.keyHelpPre', 'API key lấy ở')} <Link onClick={() => open(runtime, 'https://console.anthropic.com/settings/keys')}>console.anthropic.com</Link> {t('ui.claude.keyHelpMid', '(tính phí theo token). Token đăng nhập (dùng gói Pro/Max) tạo bằng')} <Text code>claude setup-token</Text>{t('ui.claude.keyHelpPost', '. Token được mã hoá & lưu trên máy bạn.')}
            </Text>
          </Space>
        )}

        {st && st.loggedIn && (
          <Alert
            type="success"
            showIcon
            icon={<CheckCircleFilled />}
            message={
              st.authMethod === 'token'
                ? `${t('ui.claude.connectedToken', 'Đã kết nối bằng token')}${st.plan ? ` · ${st.plan}` : ''}`
                : `${t('ui.claude.connected', 'Đã kết nối:')} ${st.email}${st.plan ? ` · ${st.plan}` : ''}`
            }
            action={
              <Space>
                {st.authMethod === 'token' && <Button onClick={clearToken}>{t('ui.claude.clearToken', 'Xoá token')}</Button>}
                <Button type="primary" onClick={onReady}>{t('ui.claude.start', 'Bắt đầu')}</Button>
              </Space>
            }
          />
        )}

      </Card>

      <Collapse
        ghost
        style={{ marginTop: 8 }}
        items={[
          {
            key: 'keys',
            label: t('ui.claude.manageTeamKeys', 'Quản lý API key của nhóm (cho nhiều người dùng chung)'),
            children: <ClaudeKeyManager embedded onActiveChange={refresh} />,
          },
        ]}
      />
    </div>
  );
}
