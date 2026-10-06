'use client';
import { useMemo, useState } from 'react';
import { App, Alert, Button, Card, Empty, Input, Modal, Space, Tag, Typography } from 'antd';
import { ApiOutlined, CloudDownloadOutlined, GithubFilled, GitlabFilled, SearchOutlined, LockOutlined, SafetyCertificateOutlined, RobotOutlined, SyncOutlined, PlusOutlined, AppstoreOutlined, ExperimentOutlined, ArrowRightOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useRuntime } from '../RuntimeProvider';
import { useAccountAuth } from './auth';
import { API_BASE } from './api';
import { brandLogo } from './logos';
import { GitImportModal } from '../components/GitImportModal';
import { IconTile, SectionHeader } from '../kit';
import { BRAND, V, OK, BLUE, WARN, CARD_SHADOW } from '../theme';
import type { View } from '../components/HomeScreen';

const { Title, Paragraph, Text } = Typography;
const WEB_APP = 'https://toolswave.net';

interface Integration {
  id: string;
  name: string;
  avatar: string;
  accent: string;
  description: string;
  howto: string;
  /** The EXACT env-var name the app's code reads this secret from (shown in the how-to modal).
   *  Hand-set per service — deriving `${id}_API_KEY` produced wrong names (STRIPE_API_KEY,
   *  REST_API_API_KEY, and *_API_KEY for OAuth-only Google services). */
  envKey: string;
  /** Simple Icons slug for the real platform logo (falls back to `avatar` emoji). */
  slug?: string;
}

/** Render a platform's real logo, falling back to the emoji avatar. The logo is fetched from
 *  a remote CDN (simpleicons) which is often unreachable on VN networks — when it fails we must
 *  render the emoji, NOT just hide the <img> (that left a blank box before). */
function IntegrationLogo({ item, size = 22 }: { item: Integration; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (item.slug && !failed) {
    return (
      <img
        src={brandLogo(item.slug)}
        alt={item.name}
        width={size}
        height={size}
        style={{ objectFit: 'contain' }}
        onError={() => setFailed(true)}
      />
    );
  }
  return <span style={{ fontSize: size }}>{item.avatar}</span>;
}

const INTEGRATIONS: Integration[] = [
  { id: 'stripe', name: 'Stripe', avatar: '💳', slug: 'stripe', accent: '#635bff', envKey: 'STRIPE_SECRET_KEY', description: 'Nhận thanh toán, đăng ký và hoá đơn trực tuyến.', howto: 'Tạo Secret Key trong Dashboard Stripe, thêm vào cấu hình app (biến môi trường STRIPE_SECRET_KEY) rồi gọi Stripe API để tạo Checkout Session hoặc PaymentIntent.' },
  { id: 'salesforce', name: 'Salesforce', avatar: '☁️', slug: 'salesforce', accent: '#00a1e0', envKey: 'SF_ACCESS_TOKEN', description: 'Đồng bộ khách hàng tiềm năng và dữ liệu CRM.', howto: 'Tạo Connected App trong Salesforce để lấy Client ID/Secret, xác thực qua OAuth2, sau đó gọi REST API (/services/data) từ code của app.' },
  { id: 'slack', name: 'Slack', avatar: '💬', slug: 'slack', accent: '#4a154b', envKey: 'SLACK_BOT_TOKEN', description: 'Gửi thông báo và tin nhắn vào kênh Slack.', howto: 'Tạo Incoming Webhook hoặc Bot Token trong Slack App, lưu vào cấu hình app, rồi POST nội dung tới webhook URL để gửi tin nhắn.' },
  { id: 'notion', name: 'Notion', avatar: '📝', slug: 'notion', accent: '#111827', envKey: 'NOTION_TOKEN', description: 'Đọc/ghi dữ liệu vào database Notion.', howto: 'Tạo Internal Integration trong Notion, lấy Integration Token, share database với integration, rồi gọi Notion API (/v1/pages, /v1/databases).' },
  { id: 'google-calendar', name: 'Google Calendar', avatar: '📅', slug: 'googlecalendar', accent: '#4285f4', envKey: 'GOOGLE_OAUTH_TOKEN', description: 'Tạo và quản lý sự kiện lịch.', howto: 'Bật Google Calendar API trong Google Cloud Console, tạo OAuth credentials, xác thực người dùng, rồi gọi events.insert/list để thao tác sự kiện.' },
  { id: 'google-drive', name: 'Google Drive', avatar: '📁', slug: 'googledrive', accent: '#0f9d58', envKey: 'GOOGLE_OAUTH_TOKEN', description: 'Lưu trữ và truy xuất tệp trên Drive.', howto: 'Bật Drive API, dùng OAuth2 để cấp quyền, rồi gọi files.create/list/get với access token để upload và đọc tệp.' },
  { id: 'gmail', name: 'Gmail', avatar: '✉️', slug: 'gmail', accent: '#ea4335', envKey: 'GOOGLE_OAUTH_TOKEN', description: 'Gửi email giao dịch qua tài khoản Gmail.', howto: 'Bật Gmail API trong Google Cloud, xác thực OAuth2 với scope gmail.send, rồi gọi users.messages.send với nội dung email đã mã hoá base64.' },
  { id: 'google-sheets', name: 'Google Sheets', avatar: '📊', slug: 'googlesheets', accent: '#0f9d58', envKey: 'GOOGLE_OAUTH_TOKEN', description: 'Đọc/ghi bảng tính như một cơ sở dữ liệu nhẹ.', howto: 'Bật Sheets API, dùng Service Account hoặc OAuth2, share sheet với tài khoản, rồi gọi spreadsheets.values.get/update để đọc ghi dữ liệu.' },
  { id: 'hubspot', name: 'HubSpot', avatar: '🟠', slug: 'hubspot', accent: '#ff7a59', envKey: 'HUBSPOT_ACCESS_TOKEN', description: 'Quản lý contact, deal và marketing.', howto: 'Tạo Private App trong HubSpot để lấy Access Token, thêm vào cấu hình, rồi gọi CRM API (/crm/v3/objects) để tạo/cập nhật contact và deal.' },
  { id: 'openai', name: 'OpenAI', avatar: '🤖', slug: 'openai', accent: '#10a37f', envKey: 'OPENAI_API_KEY', description: 'Thêm tính năng AI: chat, tóm tắt, sinh nội dung.', howto: 'Lấy API Key tại platform.openai.com, lưu vào biến môi trường OPENAI_API_KEY, rồi gọi endpoint chat/completions từ backend của app.' },
  { id: 'webhook', name: 'Webhook', avatar: '🔗', accent: '#6C5CE7', envKey: 'WEBHOOK_SECRET', description: 'Nhận hoặc gửi sự kiện realtime qua HTTP.', howto: 'Cấu hình một URL nhận trong app, hoặc POST payload JSON tới URL đích khi có sự kiện. Xác thực bằng secret/signature trong header.' },
  { id: 'rest-api', name: 'REST API', avatar: '🌐', accent: '#6c5ce7', envKey: 'API_KEY', description: 'Kết nối tới bất kỳ dịch vụ REST nào.', howto: 'Khai báo base URL và API key của dịch vụ trong cấu hình app, rồi dùng fetch/axios để gọi các endpoint với header Authorization phù hợp.' },
];

/** Native desktop port of the website's /integrations (service catalogue + Git import). */
export function IntegrationsView({ onNav, onCreate }: { onNav?: (v: View) => void; onCreate?: () => void } = {}) {
  const runtime = useRuntime();
  const { message } = App.useApp();
  const { token, beginOAuth } = useAccountAuth();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<Integration | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const openWeb = (path: string) => {
    const url = `${WEB_APP}${path}`;
    if (runtime.openExternal) runtime.openExternal(url);
    else window.open(url, '_blank');
  };

  // Connect GitLab/GitHub via the SAME OAuth as the website, in the user's REAL
  // browser (existing GitHub/GitLab session — no re-login). `link=<current JWT>`
  // connects the provider to the logged-in account; the server returns to a
  // loopback http://127.0.0.1 callback (larkwave:// when packaged) that the app
  // catches → AccountAuthProvider re-logs-in with the freshly-linked account.
  const connectGit = async (p: 'gitlab' | 'github') => {
    // Desktop: REAL browser (existing GitHub/GitLab session — no re-login) + the API 302s the
    // JWT back to the app's loopback (larkwave://auth as fallback). `link=<JWT>` connects the
    // provider to the logged-in account; AccountAuthProvider re-logs-in with the linked account.
    const params = new URLSearchParams();
    if (runtime.kind === 'desktop') {
      let redirect = 'larkwave://auth';
      try {
        if (runtime.startAuthLoopback) redirect = (await runtime.startAuthLoopback()).redirect;
      } catch {
        /* fall back to the deep link */
      }
      params.set('redirect', redirect);
    }
    if (token) params.set('link', token);
    const url = `${API_BASE}/auth/${p}?${params.toString()}`;
    if (runtime.kind === 'desktop') beginOAuth(p); // open the status modal
    if (runtime.openExternal) runtime.openExternal(url);
    else window.open(url, '_blank');
    if (runtime.kind !== 'desktop') message.info('Đang mở trình duyệt để kết nối — app sẽ tự cập nhật khi xong.');
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return INTEGRATIONS;
    return INTEGRATIONS.filter((i) => i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q));
  }, [query]);

  return (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      <div>
        <Space align="center" size="middle">
          <IconTile icon={<ApiOutlined />} color={BRAND} size={38} radius={10} fontSize={18} />
          <Title level={2} style={{ margin: 0 }}>Tích hợp</Title>
        </Space>
        <Paragraph type="secondary" style={{ marginTop: 10, marginBottom: 0, maxWidth: 680 }}>
          Kết nối app của bạn với các dịch vụ phổ biến. Xem hướng dẫn để biết cách thêm API key và gọi API ngay trong code của app.
        </Paragraph>
      </div>

      {/* Secure integration policy — how a secret is handled end-to-end. */}
      <Alert
        type="info"
        showIcon
        icon={<SafetyCertificateOutlined />}
        message="Chính sách tích hợp an toàn (khoá không bao giờ lộ)"
        description={
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            <div>
              <b>1.</b> Bạn dán API key/secret →{' '}
              <Tag color="purple" style={{ marginInlineEnd: 0 }}>
                <LockOutlined /> mã hoá &amp; lưu trên server Larkwave
              </Tag>{' '}
              (AES-256-GCM). Sau khi lưu, giao diện chỉ hiển thị 4 ký tự cuối — không bao giờ trả lại khoá thật.
            </div>
            <div>
              <b>2.</b> Khi bạn nhờ AI dựng/sửa app, agent chỉ nhận <b>TÊN biến</b> (vd <Text code>STRIPE_SECRET_KEY</Text>), <b>không</b> thấy giá trị thật → khoá không lọt vào hội thoại/LLM.
            </div>
            <div>
              <b>3.</b> Khi <b>deploy</b>, server giải mã và bơm khoá vào biến môi trường của app → app chạy được, còn trình duyệt và AI chưa từng cầm khoá thật.
            </div>
          </div>
        }
      />

      {/* Tích hợp có sẵn — Larkwave's own first-party integrations (deep-link to their screens). */}
      <div>
        <SectionHeader icon={<ApiOutlined />} color={BRAND} title="Tích hợp có sẵn" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          <Card hoverable onClick={() => onNav?.('lark')} styles={{ body: { padding: 18 } }} style={{ borderRadius: 14, boxShadow: CARD_SHADOW, cursor: 'pointer' }}>
            <Space align="start" size={12}>
              <IconTile icon={<RobotOutlined />} color={BLUE} size={42} radius={11} fontSize={20} />
              <div style={{ minWidth: 0 }}>
                <Title level={5} style={{ margin: 0 }}>Lark × Agents</Title>
                <Text type="secondary" style={{ fontSize: 13, lineHeight: 1.5 }}>Kết nối Lark, cho agent chạy trên Bitable và tự động hoá quy trình ngay trong app.</Text>
              </div>
            </Space>
          </Card>
          <Card hoverable onClick={() => onNav?.('cms-sync')} styles={{ body: { padding: 18 } }} style={{ borderRadius: 14, boxShadow: CARD_SHADOW, cursor: 'pointer' }}>
            <Space align="start" size={12}>
              <IconTile icon={<SyncOutlined />} color={OK} size={42} radius={11} fontSize={20} />
              <div style={{ minWidth: 0 }}>
                <Title level={5} style={{ margin: 0 }}>Đồng bộ Bitable (CMS)</Title>
                <Text type="secondary" style={{ fontSize: 13, lineHeight: 1.5 }}>Đồng bộ dữ liệu Bitable với CMS, giữ phiên chạy 24/7 trên máy VM.</Text>
              </div>
            </Space>
          </Card>
        </div>
      </div>

      <div>
        <SectionHeader icon={<CloudDownloadOutlined />} color={BRAND} title="Kết nối kho mã (Git)" />
        <Card styles={{ body: { padding: 20 } }} style={{ border: `1px solid ${BRAND}4d` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <IconTile icon={<CloudDownloadOutlined />} color={BRAND} size={46} radius={12} fontSize={22} />
          <div style={{ minWidth: 0, flex: '1 1 260px' }}>
            <Title level={5} style={{ margin: 0 }}>Nhập từ Git</Title>
            <Text type="secondary" style={{ fontSize: 13 }}>Kết nối GitLab/GitHub, nhập một repository và đẩy thay đổi ngược lại repo.</Text>
          </div>
          <Space wrap>
            <Button icon={<GitlabFilled style={{ color: '#FC6D26' }} />} onClick={() => connectGit('gitlab')}>Kết nối GitLab</Button>
            <Button icon={<GithubFilled style={{ color: V.text }} />} onClick={() => connectGit('github')}>Kết nối GitHub</Button>
            <Button type="primary" icon={<CloudDownloadOutlined />} onClick={() => (runtime.gitImportLocal ? setImportOpen(true) : openWeb('/import'))}>Nhập repo</Button>
          </Space>
        </div>
      </Card>
      </div>

      <div>
        <SectionHeader icon={<ApiOutlined />} color={BRAND} title="Danh mục dịch vụ" />
        <Input size="large" allowClear prefix={<SearchOutlined style={{ color: V.textFaint }} />} placeholder="Tìm dịch vụ… (Stripe, Slack, OpenAI…)" value={query} onChange={(e) => setQuery(e.target.value)} style={{ maxWidth: 440, marginBottom: 16 }} />
        {filtered.length === 0 ? (
          <Empty description="Không tìm thấy dịch vụ" style={{ padding: '48px 0' }} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {filtered.map((i) => (
              <Card key={i.id} hoverable styles={{ body: { padding: 18, flex: 1, display: 'flex', flexDirection: 'column' } }} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, width: '100%' }}>
                  <Space align="center" size={12}>
                    <span style={{ display: 'inline-flex', width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', fontSize: 22, background: `${i.accent}14`, border: `1px solid ${i.accent}33` }}>
                      <IntegrationLogo item={i} size={24} />
                    </span>
                    <Title level={5} style={{ margin: 0 }}>{i.name}</Title>
                  </Space>
                  <Text type="secondary" style={{ fontSize: 13.5, lineHeight: 1.5, flex: 1 }}>{i.description}</Text>
                  <Button block style={{ marginTop: 'auto' }} onClick={() => setActive(i)}>Hướng dẫn</Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Interlinks — where to go next from Integrations. */}
      <div>
        <SectionHeader icon={<ThunderboltOutlined />} color={BRAND} title="Tiếp theo" />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { key: 'create', icon: <PlusOutlined />, color: BRAND, title: 'Tạo app mới', onClick: () => onCreate?.() },
            { key: 'apps', icon: <AppstoreOutlined />, color: BLUE, title: 'App của tôi', onClick: () => onNav?.('apps') },
            { key: 'skills', icon: <ExperimentOutlined />, color: WARN, title: 'Kỹ năng', onClick: () => onNav?.('skills') },
          ].map((c) => (
            <div key={c.key} className="tw-stat-card" onClick={c.onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '9px 14px 9px 10px', borderRadius: 11, background: V.surface, border: `1px solid ${V.border}`, boxShadow: CARD_SHADOW, cursor: 'pointer', fontWeight: 600, fontSize: 13.5, color: V.text }}>
              <IconTile icon={c.icon} color={c.color} size={30} radius={8} fontSize={16} /> {c.title}
            </div>
          ))}
        </div>
      </div>

      <Modal
        open={!!active}
        onCancel={() => setActive(null)}
        title={active ? <Space><IntegrationLogo item={active} size={20} /><span>Hướng dẫn dùng {active.name}</span></Space> : null}
        footer={<Button type="primary" onClick={() => setActive(null)}>Đã hiểu</Button>}
      >
        {active && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <Text strong>Cách kết nối</Text>
              <Paragraph style={{ marginTop: 4, marginBottom: 0 }}>{active.howto}</Paragraph>
            </div>
            <div>
              <Text strong>Dùng trong app</Text>
              <Paragraph style={{ marginTop: 4, marginBottom: 0 }}>
                Trong prompt, mô tả tích hợp này để AI sinh code gọi API — code sẽ tham chiếu khoá qua biến môi trường, ví dụ{' '}
                <Text code>{active.envKey}</Text>. Bạn dán khoá thật vào phần cấu hình app một lần; khoá được mã hoá &amp; lưu server, agent chỉ thấy tên biến.
              </Paragraph>
            </div>
            <Alert
              type="success"
              showIcon
              icon={<LockOutlined />}
              style={{ padding: '8px 12px' }}
              message={
                <span style={{ fontSize: 12.5 }}>
                  Khoá của bạn được mã hoá trên server và chỉ giải mã lúc app chạy — không hiện lại trên giao diện, không lộ cho AI.
                </span>
              }
            />
          </Space>
        )}
      </Modal>

      {runtime.gitImportLocal && (
        <GitImportModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onImported={() => {
            setImportOpen(false);
            message.success({
              duration: 6,
              content: onNav ? (
                <span>
                  Đã nhập repo.{' '}
                  <Button type="link" size="small" style={{ padding: 0 }} onClick={() => { message.destroy(); onNav('apps'); }}>
                    Mở App của tôi <ArrowRightOutlined style={{ fontSize: 11 }} />
                  </Button>
                </span>
              ) : 'Đã nhập repo — mở ở App của tôi để chỉnh sửa.',
            });
          }}
        />
      )}
    </Space>
  );
}
