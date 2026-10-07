'use client';
import { useEffect, useState } from 'react';
import { Alert, App, Button, Card, Divider, Form, Input, Segmented, Space, Typography } from 'antd';
import { GoogleOutlined, GithubOutlined, GitlabOutlined, LockOutlined, MailOutlined, UserOutlined } from '@ant-design/icons';
import { useRuntime } from '../RuntimeProvider';
import { BRAND_GRADIENT } from '../theme';
import { accountApi, oauthUrl, ApiError, type AuthConfig } from './api';
import { useAccountAuth } from './auth';
import { useI18n } from '../i18n';

const { Title, Text, Link } = Typography;

// Cache the last-known-good OAuth provider config so the Google/GitHub/GitLab
// buttons survive the ~30–60s the API restarts during a deploy: we paint the
// cached value immediately on mount and, on a FAILED fetch, keep those buttons
// on screen while retrying with backoff instead of hiding them.
const AUTH_CFG_CACHE_KEY = 'tw_account_auth_providers';

function readCachedCfg(): AuthConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(AUTH_CFG_CACHE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<AuthConfig>;
    return { google: !!v.google, gitlab: !!v.gitlab, github: !!v.github };
  } catch {
    return null;
  }
}

/**
 * Login/registration gate for the desktop's Larkwave-account pages (Friends,
 * Leaderboard, Explore…). Email/password works inline; OAuth opens the user's
 * browser (the desktop picks the session back up on focus once the cookie/token
 * is set). Mirrors the website's auth options.
 */
export function LoginView() {
  const runtime = useRuntime();
  const { t } = useI18n();
  const { message } = App.useApp();
  const { login, register, beginOAuth } = useAccountAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [busy, setBusy] = useState(false);
  const [cfg, setCfg] = useState<AuthConfig | null>(null);
  /**
   * Phần lõi ĐÃ CÀI cũ hơn giao diện, và nó chặn địa chỉ máy chủ mới ngay trong máy.
   *
   * Vì sao cần một trạng thái RIÊNG thay vì gộp vào lỗi mạng thường: renderer đi qua cầu
   * `accountFetch` của phần lõi (origin của renderer không nằm trong CORS_ORIGINS nên gọi thẳng
   * bị chặn). Phần lõi đối chiếu URL với `API_BASE` của CHÍNH NÓ rồi trả `status: 0` — không có
   * gói tin nào rời khỏi máy. Sau lần hoán đổi tên miền 22/09/2026, bản cài cũ chốt `apia` còn
   * giao diện mới hỏi `api`, nên mọi lời gọi account chết tại chỗ.
   *
   * Không có cách nào chữa bằng code-push: cứ gửi địa chỉ cũ cho vừa lòng phần lõi thì nó gọi
   * sang một hệ thống khác và nhận 404. Việc duy nhất làm được là NÓI RA — nếu không, màn đăng
   * nhập chỉ đơn giản thiếu mất cụm nút OAuth, trông y như tính năng bị cắt bỏ.
   */
  const [coreStale, setCoreStale] = useState(false);

  // Paint the last-known-good config immediately so the OAuth buttons don't
  // vanish while the fetch is in flight (or the API is mid-deploy).
  useEffect(() => {
    const cached = readCachedCfg();
    if (cached && (cached.google || cached.github || cached.gitlab)) setCfg(cached);
  }, []);

  // Refresh from the backend; on failure KEEP the cached buttons and retry with
  // bounded backoff so they self-heal once the API answers, rather than hiding.
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const delays = [1500, 3000, 6000, 10000]; // backoff while the API is down (deploy)
    let attempt = 0;

    const load = () => {
      accountApi
        .authConfig()
        .then((next) => {
          if (!active) return;
          setCfg(next);
          if (typeof window !== 'undefined') {
            try {
              window.localStorage.setItem(AUTH_CFG_CACHE_KEY, JSON.stringify(next));
            } catch {
              /* ignore quota / private-mode storage errors */
            }
          }
        })
        .catch((e: unknown) => {
          if (!active) return;
          // PHẢI xét cả lời nhắn, KHÔNG chỉ `status: 0`. Cầu nối trả 0 cho CẢ HAI trường hợp:
          // bị chặn origin, và lỗi mạng thường (máy bay, rớt wifi). Nhầm hai thứ này là bảo một
          // người đang mất mạng đi tải bộ cài 214 MB — vô nghĩa đúng lúc họ không tải được.
          // Chuỗi dưới đây là hằng số đã NƯỚNG SẴN trong các bản cài cũ (background.ts), tức
          // đúng tập máy mà cảnh báo này nhắm tới; nó không thể đổi nữa nên khớp thẳng là an toàn.
          if (e instanceof ApiError && e.statusCode === 0 && /origin/i.test(e.message)) {
            setCoreStale(true);
            return; // thử lại cũng vô ích: phần lõi sẽ chặn y như vậy
          }
          // Transient failure (API restarting mid-deploy): don't overwrite the
          // cached config with null — retry with backoff until it comes back.
          if (attempt < delays.length) {
            timer = setTimeout(load, delays[attempt]);
            attempt += 1;
          }
        });
    };
    load();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const onFinish = async (v: { email: string; password: string; name?: string }) => {
    setBusy(true);
    try {
      if (mode === 'login') await login(v.email.trim(), v.password);
      else await register(v.email.trim(), v.password, v.name?.trim());
      message.success(mode === 'login' ? t('login2.signedIn', 'Đã đăng nhập') : t('login2.accountCreated', 'Đã tạo tài khoản'));
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const openOAuth = async (provider: 'google' | 'gitlab' | 'github') => {
    let openUrl = oauthUrl(provider);
    // Desktop: open OAuth in the user's REAL browser (where they're already signed into
    // Google/GitHub — NO re-login), and have the API 302 the issued JWT back to a transient
    // loopback http://127.0.0.1:<port>/cb the app catches (the deep link larkwave://auth is
    // the fallback when the loopback can't bind). The loopback server then focuses the app +
    // hands the token to AccountAuthProvider (authDeepLink) → auto-login, no manual switch.
    if (runtime.kind === 'desktop') {
      let redirect = 'larkwave://auth';
      try {
        if (runtime.startAuthLoopback) redirect = (await runtime.startAuthLoopback()).redirect;
      } catch {
        /* fall back to the deep link */
      }
      openUrl = `${oauthUrl(provider)}?redirect=${encodeURIComponent(redirect)}`;
      // Open the "đang đăng nhập…" modal AFTER openUrl is final, so the copy-link and
      // manual-token fallbacks inside it point at the URL we actually opened.
      beginOAuth(provider, openUrl);
    }
    if (runtime.openExternal) runtime.openExternal(openUrl);
    else window.open(openUrl, '_blank');
    if (runtime.kind !== 'desktop') message.info(t('login2.browserHint', 'Hoàn tất đăng nhập trên trình duyệt — app sẽ tự đăng nhập khi xong.'));
  };

  return (
    <div style={{ maxWidth: 440, margin: '32px auto 0' }}>
      <Card>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ width: 52, height: 52, borderRadius: 15, background: BRAND_GRADIENT, margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 24 }}>
            <UserOutlined />
          </div>
          <Title level={4} style={{ margin: 0 }}>{t('login2.title', 'Tài khoản Larkwave')}</Title>
          <Text type="secondary">{t('login2.subtitle', 'Đăng nhập để dùng Lark × Agents, Trợ lý AI, Kỹ năng, Hồ sơ…')}</Text>
        </div>

        <Segmented
          block
          value={mode}
          onChange={(v) => setMode(v as 'login' | 'register')}
          options={[{ label: t('login2.tabLogin', 'Đăng nhập'), value: 'login' }, { label: t('login2.tabRegister', 'Đăng ký'), value: 'register' }]}
          style={{ marginBottom: 16 }}
        />

        <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
          {mode === 'register' && (
            <Form.Item name="name" label={t('login2.nameLabel', 'Tên hiển thị')}>
              <Input size="large" prefix={<UserOutlined />} placeholder={t('login2.namePlaceholder', 'Tên của bạn')} />
            </Form.Item>
          )}
          <Form.Item name="email" label={t('login2.emailLabel', 'Email')} rules={[{ required: true, type: 'email', message: t('login2.emailInvalid', 'Email không hợp lệ') }]}>
            <Input size="large" prefix={<MailOutlined />} placeholder="ban@email.com" autoComplete="email" />
          </Form.Item>
          <Form.Item name="password" label={t('login2.passwordLabel', 'Mật khẩu')} rules={[{ required: true, min: 6, message: t('login2.passwordMin', 'Tối thiểu 6 ký tự') }]}>
            <Input.Password size="large" prefix={<LockOutlined />} placeholder="••••••••" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </Form.Item>
          <Button type="primary" size="large" block htmlType="submit" loading={busy}>
            {mode === 'login' ? t('login2.tabLogin', 'Đăng nhập') : t('login2.submitCreate', 'Tạo tài khoản')}
          </Button>
        </Form>

        {coreStale && (
          <Alert
            type="warning"
            showIcon
            style={{ marginTop: 14 }}
            message={t('login2.coreStale.title', 'Bản cài đã cũ — cần cài lại')}
            description={
              <span style={{ fontSize: 12.5 }}>
                {t(
                  'login2.coreStale.desc',
                  'Máy chủ đã đổi địa chỉ. Phần lõi của bản đang cài chặn địa chỉ mới ngay trong máy, nên đăng nhập và các nút Google/GitHub/GitLab đều không dùng được. Cập nhật giao diện không sửa được chỗ này.',
                )}{' '}
                <Typography.Link
                  onClick={() =>
                    runtime.openExternal?.('https://toolswave.net/download')
                  }
                >
                  {t('login2.coreStale.link', 'Tải bản cài mới')}
                </Typography.Link>
              </span>
            }
          />
        )}

        {cfg && (cfg.google || cfg.github || cfg.gitlab) && (
          <>
            <Divider plain style={{ color: '#9AA3B5', fontSize: 12 }}>{t('login2.or', 'hoặc')}</Divider>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              {cfg.google && <Button block icon={<GoogleOutlined />} onClick={() => openOAuth('google')}>{t('login2.continueGoogle', 'Tiếp tục với Google')}</Button>}
              {cfg.github && <Button block icon={<GithubOutlined />} onClick={() => openOAuth('github')}>{t('login2.continueGithub', 'Tiếp tục với GitHub')}</Button>}
              {cfg.gitlab && <Button block icon={<GitlabOutlined />} onClick={() => openOAuth('gitlab')}>{t('login2.continueGitlab', 'Tiếp tục với GitLab')}</Button>}
            </Space>
          </>
        )}

        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('login2.forgot', 'Quên mật khẩu?')}{' '}
            <Link onClick={() => runtime.openExternal?.('https://toolswave.net/forgot')}>{t('login2.recoverWeb', 'Khôi phục trên web')}</Link>
          </Text>
        </div>
      </Card>
    </div>
  );
}
