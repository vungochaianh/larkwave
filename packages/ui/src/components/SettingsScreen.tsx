'use client';
import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Card, Typography, Space, Tag, Button, Input, Switch, Alert, List, Modal, Popconfirm, Spin, Tooltip, message, Grid } from 'antd';
import { ApiOutlined, CheckCircleFilled, ReloadOutlined, CloudServerOutlined, CopyOutlined, MobileOutlined, ReadOutlined } from '@ant-design/icons';
import type { AgentClientStatus, AgentWebhookTokenInfo, RunnerStatusInfo, TelegramLinkResponse } from '@larkwave/core';
import { useRuntime } from '../RuntimeProvider';
import { ClaudeConnect } from './ClaudeConnect';
import { ClaudeKeyManager } from './ClaudeKeyManager';
import { DeviceManager } from './DeviceManager';
import { BRAND, V, OK, WARN, BLUE, CARD_SHADOW } from '../theme';
import { IconTile, MICRO } from '../kit';
import type { View } from './HomeScreen';
import { useI18n } from '../i18n';

const { Title, Text, Paragraph } = Typography;

/** Hub-style card header: tinted IconTile + label, used in every Card `title` band here. */
function CardTitle({ icon, color, children }: { icon: ReactNode; color: string; children: ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <IconTile icon={icon} color={color} />
      <span style={{ fontWeight: 600, color: V.text }}>{children}</span>
    </span>
  );
}

/** Reusable card chrome so every Settings card shares the hub look (radius 16 + soft shadow). */
const CARD_STYLE: CSSProperties = { borderRadius: 16, boxShadow: CARD_SHADOW };

/** Paste-key row for one non-Claude runner (Grok/Gemini/Codex). */
function RunnerRow({
  r,
  onChanged,
}: {
  r: RunnerStatusInfo;
  onChanged: (list: RunnerStatusInfo[]) => void;
}) {
  const runtime = useRuntime();
  const { t } = useI18n();
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const k = key.trim();
    if (!k || !runtime.runners) return;
    setSaving(true);
    try {
      const list = await runtime.runners.setToken(r.id, k);
      onChanged(list);
      setKey('');
      message.success(`${t('ui.runner.savedKeyFor', 'Đã lưu API key cho')} ${r.label}.`);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const clear = async () => {
    if (!runtime.runners) return;
    try {
      onChanged(await runtime.runners.clearToken(r.id));
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <List.Item>
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <Space wrap>
          <Text strong>{r.label}</Text>
          <Tag color={r.ready ? 'success' : r.installed ? 'processing' : 'default'}>
            {r.ready
              ? `${t('ui.runner.ready', 'Sẵn sàng')}${r.version ? ` · v${r.version}` : ''}`
              : r.installed
                ? `${t('ui.runner.installed', 'Đã cài')}${r.version ? ` v${r.version}` : ''} ${t('ui.runner.missingKeyLogin', '· thiếu key/đăng nhập')}`
                : t('ui.runner.notInstalledOnMachine', 'Chưa cài trên máy')}
          </Tag>
          {r.loggedIn && (
            <Tag color="blue" icon={<CheckCircleFilled />}>
              {r.authMethod === 'grok.com'
                ? t('ui.runner.grokLogin', 'Đăng nhập grok.com')
                : r.authMethod === 'env'
                  ? t('ui.runner.apiKeyEnv', 'API key từ shell/env')
                  : r.authMethod === 'api_key'
                    ? t('ui.runner.apiKeySaved', 'API key đã lưu')
                    : t('ui.runner.hasKeyLogin', 'Đã có key/đăng nhập')}
            </Tag>
          )}
        </Space>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {t('ui.runner.command', 'Lệnh:')} <Text code>{r.bin}</Text>
          {r.binPath ? (
            <>
              {' '}
              → <Text code copyable={{ text: r.binPath }}>{r.binPath}</Text>
            </>
          ) : null}
        </Text>
        {!r.installed && r.installHint && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('ui.runner.installWith', 'Cài bằng:')} <Text code copyable>{r.installHint}</Text>
          </Text>
        )}
        {r.id === 'grok' && r.loggedIn && r.authMethod === 'grok.com' && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('ui.runner.grokLoggedInPre', 'Đã đăng nhập qua')} <Text code>grok login</Text> {t('ui.runner.grokLoggedInPost', 'trên terminal — không cần dán API key thêm (trừ khi bạn muốn dùng XAI_API_KEY riêng).')}
          </Text>
        )}
        <Space.Compact style={{ width: '100%', maxWidth: 520 }}>
          <Input.Password
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onPressEnter={save}
            placeholder={`${t('ui.runner.pasteKeyFor', 'Dán API key cho')} ${r.label}…`}
            autoComplete="off"
          />
          <Button type="primary" loading={saving} disabled={!key.trim()} onClick={save}>
            {t('ui.runner.saveKey', 'Lưu key')}
          </Button>
          {r.loggedIn && <Button onClick={clear}>{t('ui.runner.clearKey', 'Xoá key')}</Button>}
        </Space.Compact>
      </Space>
    </List.Item>
  );
}

/** "AI / CLI" section — all runners support API key / login management. Claude has richer UI + team keys; others have paste-key rows. */
function RunnersPanel() {
  const runtime = useRuntime();
  const { t } = useI18n();
  const [list, setList] = useState<RunnerStatusInfo[] | null>(null);

  const refresh = useCallback(() => {
    if (!runtime.runners) return;
    runtime.runners
      .list()
      .then(setList)
      .catch(() => setList([]));
  }, [runtime]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!runtime.runners) return null;
  const others = (list ?? []).filter((r) => r.id !== 'claude');

  return (
    <Card
      title={<CardTitle icon={<ApiOutlined />} color={BLUE}>{t('ui.runners.title', 'Trình AI / CLI')}</CardTitle>}
      style={CARD_STYLE}
      extra={<Button size="small" icon={<ReloadOutlined />} onClick={refresh}>{t('ui.action.refresh', 'Làm mới')}</Button>}
    >
      <Paragraph type="secondary" style={{ marginTop: 0 }}>
        {t('ui.runners.desc', 'Larkwave desktop điều khiển các CLI AI chạy trên máy (Claude/Grok/Gemini/Codex…). Mỗi runner có phần nhập API key / đăng nhập riêng để quản lý.')}
      </Paragraph>

      {list && list.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {list.map((r) => (
            <Tag
              key={r.id}
              color={r.ready ? 'success' : r.installed ? 'processing' : 'default'}
              style={{ margin: 0, padding: '4px 10px' }}
            >
              {r.label}
              {r.ready ? ' ✓' : r.installed ? (r.loggedIn ? '' : ` ${t('ui.runner.missingKeyShort', '(thiếu key)')}`) : ` ${t('ui.runner.notInstalledShort', '(chưa cài)')}`}
              {r.version ? ` · ${r.version}` : ''}
            </Tag>
          ))}
        </div>
      )}

      {/* Claude keeps its richer connect/login UI. */}
      <ClaudeConnect onReady={refresh} />

      <Title level={5} style={{ marginTop: 18 }}>{t('ui.runners.others', 'Các trình khác')}</Title>
      {list === null ? (
        <div style={{ textAlign: 'center', padding: 16 }}>
          <Spin />
        </div>
      ) : (
        <List
          dataSource={others}
          renderItem={(r) => <RunnerRow r={r} onChanged={setList} />}
          locale={{ emptyText: t('ui.runners.noOthers', 'Không có trình AI nào khác.') }}
        />
      )}
    </Card>
  );
}

/** In-app usage guide for "Điều khiển từ xa" — opened from the panel's "Hướng dẫn" button. */
function RemoteGuide({ open, onClose, onNav }: { open: boolean; onClose: () => void; onNav?: (v: View) => void }) {
  const { t } = useI18n();
  const screens = Grid.useBreakpoint();
  const codeBox: CSSProperties = {
    fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
    fontSize: 12,
    background: V.surfaceMuted,
    border: `1px solid ${V.border}`,
    color: V.text,
    borderRadius: 8,
    padding: '10px 12px',
    overflowX: 'auto',
    whiteSpace: 'pre',
    margin: '6px 0 0',
  };
  const H = ({ children }: { children: ReactNode }) => (
    <Text strong style={{ fontSize: 13.5, display: 'block', marginTop: 16, marginBottom: 4 }}>
      {children}
    </Text>
  );
  return (
    <Modal open={open} onCancel={onClose} footer={null} width={screens.md ? 640 : '94vw'} title={t('ui.guide.title', 'Hướng dẫn — Điều khiển từ xa')}>
      <div style={{ maxHeight: '68vh', overflowY: 'auto', paddingRight: 6, fontSize: 13.5, lineHeight: 1.65 }}>
        <Paragraph type="secondary" style={{ fontSize: 13 }}>
          Máy này đóng vai “thợ chạy”: bạn gửi yêu cầu từ bên ngoài, máy chạy Trợ lý AI cục bộ (chỉ đọc — không tự ghi dữ liệu) rồi trả câu trả lời về.
          Có <b>2 kênh gọi vào</b> (Webhook API, Telegram) — kết quả luôn hiện ở tab <b>“Máy của tôi”</b> trên web,
          và có thể gửi thêm ra Telegram/Lark.
        </Paragraph>

        <H>{t('ui.guide.h1', '1) Chuẩn bị (một lần)')}</H>
        Bật công tắc ở trên đến khi hiện <b>“Đã kết nối máy chủ”</b> → ở mục <b>Token webhook</b> đặt tên rồi <b>Tạo token</b>
        (token hiện <b>một lần</b>, sao chép ngay).

        <H>{t('ui.guide.h2', '2) Kênh Webhook API — gọi bằng curl/n8n/cron')}</H>
        <div style={codeBox}>{`curl -X POST https://api.toolswave.net/v1/agent/webhook \\
  -H "Authorization: Apikey twa_xxxxxxxx" \\
  -H "content-type: application/json" \\
  -d '{"prompt":"Tóm tắt tin tức AI hôm nay trong 5 gạch đầu dòng"}'`}</div>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
          Header dùng chữ <Text code>Apikey</Text> (không phải Bearer). Máy offline thì lệnh được xếp hàng, chạy khi kết nối lại.
        </Text>

        <H>{t('ui.guide.h3', '3) Kênh Telegram — nhắn là chạy')}</H>
        <Text style={{ fontSize: 13 }}>
          <b>Admin (một lần):</b> tạo bot ở <Text code>@BotFather</Text> → <Text code>/newbot</Text> → dán token vào{' '}
          <b>toolswave.net/admin/ai</b> (thẻ “Bot Telegram”). Áp dụng ngay, không cần deploy lại.
          <br />
          <b>Người dùng:</b> bấm <b>“Nối Telegram”</b> ở dưới → lấy mã → gửi <Text code>/start &lt;mã&gt;</Text> cho bot trong
          chat/nhóm → xong, nhắn thẳng nội dung là máy chạy.
        </Text>

        <H>{t('ui.guide.h4', '4) Trong Lark — nhắn Bot')}</H>
        <Text style={{ fontSize: 13 }}>
          Bot trong Lark trả lời câu hỏi (chỉ đọc) ngay trong chat/nhóm Lark — bật ở tab <b>“Bot trong Lark”</b> (nên đặt{' '}
          <b>Encrypt Key</b>).
        </Text>
        {onNav && (
          <Button
            type="link"
            size="small"
            style={{ padding: 0, marginTop: 2 }}
            onClick={() => { onClose(); onNav('lark'); }}
          >
            {t('ui.remote.openLarkBotTab', 'Mở tab Bot trong Lark →')}
          </Button>
        )}

        <H>{t('ui.guide.h5', '5) Nút “Test” & “Báo KQ” (mỗi token)')}</H>
        <Text style={{ fontSize: 13 }}>
          <b>Test</b>: kiểm token còn dùng được + máy có online không (không chạy gì). <b>Báo KQ</b>: khi tác vụ xong, tự gửi
          tóm tắt ra chat Telegram (đã nối) hoặc webhook nhóm Lark.
        </Text>

        <Alert
          type="info"
          showIcon
          style={{ marginTop: 16 }}
          message={t('ui.guide.remember', 'Ghi nhớ')}
          description={
            <span style={{ fontSize: 12.5 }}>
              Token chỉ hiện một lần — lộ thì <b>Xoá</b> rồi tạo mới. Mọi kênh đều đẩy lệnh về máy đang online của bạn.
            </span>
          }
        />
      </div>
    </Modal>
  );
}

function RemoteControlPanel({ onNav }: { onNav?: (v: View) => void }) {
  const runtime = useRuntime();
  const { t: tr } = useI18n();
  const screens = Grid.useBreakpoint();
  const [st, setSt] = useState<AgentClientStatus | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [regen, setRegen] = useState(false);
  const [tokenName, setTokenName] = useState('');
  const [testingId, setTestingId] = useState<string | null>(null);
  // F4 — per-token outbound notify config modal.
  const [notifyFor, setNotifyFor] = useState<AgentWebhookTokenInfo | null>(null);
  const [notifyLark, setNotifyLark] = useState('');
  const [notifyTg, setNotifyTg] = useState('');
  const [notifySaving, setNotifySaving] = useState(false);
  // F2 — Telegram link (one-time code) + busy flags.
  const [tgLink, setTgLink] = useState<TelegramLinkResponse | null>(null);
  const [tgBusy, setTgBusy] = useState(false);
  const [tgRefreshing, setTgRefreshing] = useState(false);
  useEffect(() => {
    if (!runtime.agent) return;
    runtime.agent
      .status()
      .then(setSt)
      .catch(() => {});
    // Load the named-token list from the server.
    runtime.agent
      .listTokens?.()
      .then((s) => s && setSt(s))
      .catch(() => {});
    // Live updates: connection up/down + task started/finished.
    const off = runtime.agent.onEvent((s) => setSt(s));
    return off;
  }, [runtime]);

  if (!runtime.agent) return null;

  const toggle = (on: boolean) => {
    if (!runtime.agent) return;
    // IMPORTANT: agent.setEnabled(true) does NOT resolve while the SSE stream stays open (the main
    // process awaits the read loop), so we must NOT block the switch on it — that left the toggle
    // stuck "loading" forever even after it connected. Fire it, update optimistically, and let the
    // real connection status flow in via onEvent. (setEnabled(false)/not-signed-in resolve normally.)
    runtime.agent
      .setEnabled(on)
      .then((s) => setSt(s))
      .catch((e) => {
        message.error((e as Error).message);
        setSt((s) => (s ? { ...s, enabled: !on } : s)); // revert optimistic flip on failure
      });
    setSt((s) => (s ? { ...s, enabled: on, connected: on ? s.connected : false, error: undefined } : s));
  };
  const createTok = async () => {
    if (!runtime.agent?.createToken) return;
    setRegen(true);
    try {
      const s = await runtime.agent.createToken(tokenName.trim() || 'Token');
      setSt(s);
      setTokenName('');
      if (s.webhookToken) message.success(tr('ui.remote.tokenCreated', 'Đã tạo token — sao chép ngay (chỉ hiện một lần).'));
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setRegen(false);
    }
  };
  const deleteTok = async (id: string) => {
    if (!runtime.agent?.deleteToken) return;
    try {
      setSt(await runtime.agent.deleteToken(id));
      message.success(tr('ui.remote.tokenDeleted', 'Đã xoá token.'));
    } catch (e) {
      message.error((e as Error).message);
    }
  };
  // F1 — test a token (no task is run): valid + a device online now.
  const testTok = async (id: string) => {
    if (!runtime.agent?.testToken) return;
    setTestingId(id);
    try {
      const r = await runtime.agent.testToken(id);
      if (!r.tokenValid) {
        message.error(tr('ui.remote.tokenInvalid', 'Token không hợp lệ (đã bị xoá?).'));
      } else if (r.deviceOnline) {
        message.success(`✓ ${tr('ui.remote.tokenOkMachine', 'Token OK · máy')} “${r.deviceName ?? ''}” ${tr('ui.remote.onlineSeen', 'đang online (thấy')} ${r.lastSeenSec ?? 0}s ${tr('ui.remote.agoClose', 'trước).')}`);
      } else {
        message.warning(tr('ui.remote.tokenOkNoDevice', 'Token OK nhưng chưa có máy nào online. Mở app + bật Điều khiển từ xa trên máy đích.'));
      }
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setTestingId(null);
    }
  };
  // F4 — open the per-token notify editor.
  const openNotify = (t: AgentWebhookTokenInfo) => {
    setNotifyFor(t);
    setNotifyLark(t.notifyLarkWebhookUrl ?? '');
    setNotifyTg(t.notifyTelegramChatId ?? '');
  };
  const saveNotify = async () => {
    if (!runtime.agent?.updateTokenNotify || !notifyFor) return;
    setNotifySaving(true);
    try {
      setSt(await runtime.agent.updateTokenNotify(notifyFor.id, {
        notifyLarkWebhookUrl: notifyLark.trim(),
        notifyTelegramChatId: notifyTg.trim(),
      }));
      message.success(tr('ui.remote.notifySaved', 'Đã lưu nơi báo kết quả.'));
      setNotifyFor(null);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setNotifySaving(false);
    }
  };
  // F2 — mint a Telegram bind code + deep link.
  const linkTelegram = async () => {
    if (!runtime.agent?.telegramLink) return;
    setTgBusy(true);
    try {
      const r = await runtime.agent.telegramLink();
      setTgLink(r);
      if (!r.botConfigured) message.warning(tr('ui.remote.tgBotNotConfigured', 'Bot Telegram chưa được cấu hình trên máy chủ (thiếu TELEGRAM_BOT_TOKEN).'));
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setTgBusy(false);
    }
  };
  const refreshTgBindings = async () => {
    if (!runtime.agent?.listTelegramBindings) return;
    setTgRefreshing(true);
    try {
      setSt(await runtime.agent.listTelegramBindings());
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setTgRefreshing(false);
    }
  };
  const unbindTelegram = async (id: string) => {
    if (!runtime.agent?.deleteTelegramBinding) return;
    try {
      setSt(await runtime.agent.deleteTelegramBinding(id));
      message.success(tr('ui.remote.tgUnlinked', 'Đã huỷ liên kết Telegram.'));
    } catch (e) {
      message.error((e as Error).message);
    }
  };
  return (
    <Card
      title={<CardTitle icon={<MobileOutlined />} color={WARN}>{tr('ui.remote.title', 'Điều khiển từ xa')}</CardTitle>}
      style={CARD_STYLE}
      extra={
        <Button size="small" icon={<ReadOutlined />} onClick={() => setGuideOpen(true)}>
          {tr('ui.remote.guide', 'Hướng dẫn')}
        </Button>
      }
    >
      <RemoteGuide open={guideOpen} onClose={() => setGuideOpen(false)} onNav={onNav} />
      <Paragraph type="secondary" style={{ marginTop: 0 }}>
        {tr('ui.remote.desc', 'Bật để điều khiển máy này từ điện thoại: bạn gửi câu hỏi/yêu cầu từ xa, máy này chạy Trợ lý AI cục bộ và gửi câu trả lời về điện thoại. Cần mở app + đăng nhập tài khoản Larkwave.')}
      </Paragraph>

      {!st ? (
        <div style={{ textAlign: 'center', padding: 16 }}>
          <Spin />
        </div>
      ) : (
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <Space wrap align="center">
            <Switch checked={st.enabled} onChange={toggle} />
            <Text strong>{st.enabled ? tr('ui.remote.on', 'Đang bật') : tr('ui.remote.off', 'Đang tắt')}</Text>
            {st.enabled &&
              (st.connected ? (
                <Tag color="green" icon={<CheckCircleFilled />}>
                  {tr('ui.remote.connected', 'Đã kết nối máy chủ')}
                </Tag>
              ) : (
                <Tag color="orange">{tr('ui.remote.connecting', 'Đang kết nối…')}</Tag>
              ))}
            <Tag icon={<CloudServerOutlined />}>{st.deviceName}</Tag>
            {!st.signedIn && <Tag color="red">{tr('ui.remote.notSignedIn', 'Chưa đăng nhập Larkwave')}</Tag>}
          </Space>

          {st.error && <Alert type="warning" showIcon message={st.error} />}
          {!st.signedIn && (
            <Alert
              type="info"
              showIcon
              message={tr('ui.remote.needSignIn', 'Cần đăng nhập tài khoản Larkwave để kết nối điều khiển từ xa.')}
            />
          )}

          <Alert
            type="info"
            showIcon
            message={tr('ui.remote.howToTitle', 'Cách điều khiển máy này từ điện thoại')}
            description={
              <div style={{ fontSize: 12.5, lineHeight: 1.7 }}>
                <ol style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  <li>
                    Máy này: <b>mở app</b> + <b>đăng nhập Larkwave</b>, công tắc ở trên <b>đang bật</b> và hiện{' '}
                    <b>“Đã kết nối máy chủ”</b> (thẻ xanh).
                  </li>
                  <li>
                    Trên <b>điện thoại</b>, mở trình duyệt vào <b>toolswave.net/agent</b> và đăng nhập{' '}
                    <b>CÙNG tài khoản Larkwave</b>.
                  </li>
                  <li>
                    Chọn thiết bị <b>“{st.deviceName}”</b> (đang <b>online</b>) trong danh sách thiết bị.
                  </li>
                  <li>
                    Gõ câu hỏi/yêu cầu rồi <b>Gửi</b> → máy này chạy Trợ lý AI cục bộ, kết quả hiện ngay trên điện thoại.
                  </li>
                </ol>
                <div style={{ marginTop: 6, color: V.textSub }}>
                  Máy tắt/mất mạng: lệnh được xếp hàng, chạy khi máy kết nối lại. Đóng app hoặc tắt công tắc thì máy sẽ
                  không nhận lệnh.
                </div>
              </div>
            }
          />

          <div>
            <Text style={{ fontSize: 12.5, fontWeight: 600, color: V.textSub, display: 'block', marginBottom: 8 }}>
              {tr('ui.remote.webhookTokensLabel', 'Token webhook (gọi từ dịch vụ ngoài) — tạo nhiều token, mỗi cái một tên/dự án')}
            </Text>
            {/* Create a NEW named token */}
            <Space.Compact style={{ width: '100%', maxWidth: 520 }}>
              <Input
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                onPressEnter={createTok}
                placeholder={tr('ui.remote.tokenNamePlaceholder', 'Tên token (vd: Dự án A, n8n, Zapier…)')}
                maxLength={60}
              />
              <Button type="primary" loading={regen} disabled={!st.signedIn} onClick={createTok}>
                {tr('ui.remote.createToken', 'Tạo token')}
              </Button>
            </Space.Compact>
            {/* One-time reveal of the raw token just created */}
            {st.webhookToken && (
              <Alert
                type="success"
                showIcon
                style={{ marginTop: 8, maxWidth: 520 }}
                message={tr('ui.remote.newTokenOnce', 'Token mới (chỉ hiện MỘT LẦN — sao chép ngay)')}
                description={
                  <Space.Compact style={{ width: '100%' }}>
                    <Input readOnly value={st.webhookToken} />
                    <Button
                      icon={<CopyOutlined />}
                      onClick={() => {
                        navigator.clipboard?.writeText(st.webhookToken ?? '');
                        message.success(tr('ui.remote.tokenCopied', 'Đã sao chép token.'));
                      }}
                    >
                      {tr('ui.remote.copy', 'Sao chép')}
                    </Button>
                  </Space.Compact>
                }
              />
            )}
            {/* List of existing named tokens */}
            {st.webhookTokens && st.webhookTokens.length > 0 && (
              <List
                size="small"
                style={{ marginTop: 8, maxWidth: 640 }}
                dataSource={st.webhookTokens}
                renderItem={(t) => (
                  <List.Item
                    actions={[
                      <Tooltip key="test" title={tr('ui.remote.testTooltip', 'Kiểm tra token + máy có online không (không chạy gì)')}>
                        <Button
                          type="text"
                          size="small"
                          loading={testingId === t.id}
                          onClick={() => testTok(t.id)}
                        >
                          {tr('ui.remote.test', 'Test')}
                        </Button>
                      </Tooltip>,
                      <Button key="notify" type="text" size="small" onClick={() => openNotify(t)}>
                        {tr('ui.remote.notifyBtn', 'Báo KQ')}
                      </Button>,
                      <Popconfirm
                        key="del"
                        title={`${tr('ui.remote.deleteTokenTitle', 'Xoá token')} "${t.name}"?`}
                        okText={tr('ui.action.delete', 'Xoá')}
                        cancelText={tr('ui.action.cancel', 'Huỷ')}
                        onConfirm={() => deleteTok(t.id)}
                      >
                        <Button type="text" danger size="small">
                          {tr('ui.action.delete', 'Xoá')}
                        </Button>
                      </Popconfirm>,
                    ]}
                  >
                    <Space direction="vertical" size={0}>
                      <Text style={{ fontSize: 13 }}>
                        {t.name} <Text type="secondary" style={{ fontSize: 11 }}>{t.tokenPrefix}</Text>
                        {(t.notifyLarkWebhookUrl || t.notifyTelegramChatId) && (
                          <Tag color="geekblue" style={{ marginLeft: 6, fontSize: 10 }}>
                            {tr('ui.remote.notifyTag', 'báo')}{t.notifyTelegramChatId ? ' TG' : ''}{t.notifyLarkWebhookUrl ? ' Lark' : ''}
                          </Tag>
                        )}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {tr('ui.remote.created', 'Tạo')} {new Date(t.createdAt).toLocaleDateString('vi-VN')}
                        {t.lastUsedAt ? ` ${tr('ui.remote.lastUsed', '· dùng gần nhất')} ${new Date(t.lastUsedAt).toLocaleDateString('vi-VN')}` : ` ${tr('ui.remote.neverUsed', '· chưa dùng')}`}
                      </Text>
                    </Space>
                  </List.Item>
                )}
              />
            )}
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 6 }}>
              {tr('ui.remote.webhookHelp1', 'Gọi bằng header')} <Text code>Authorization: Apikey &lt;token&gt;</Text> {tr('ui.remote.webhookHelp2', 'tới')} <Text code>/agent/webhook</Text>.{' '}
              {tr('ui.remote.webhookHelp3', 'Mọi token đều đẩy lệnh về máy đang online của bạn. Bấm')} <b>{tr('ui.remote.test', 'Test')}</b> {tr('ui.remote.webhookHelp4', 'để kiểm tra,')} <b>{tr('ui.remote.notifyBtn', 'Báo KQ')}</b> {tr('ui.remote.webhookHelp5', 'để gửi kết quả ra Telegram/Lark khi xong.')}
            </Text>
          </div>

          {/* F2 — chat channel that triggers a remote run (Telegram + Lark) */}
          <div>
            <Text style={{ fontSize: 12.5, fontWeight: 600, color: V.textSub, display: 'block', marginBottom: 4 }}>
              {tr('ui.remote.chatControlLabel', 'Điều khiển bằng chat (nhắn → máy chạy)')}
            </Text>
            <Paragraph type="secondary" style={{ fontSize: 12, margin: '0 0 8' }}>
              {tr('ui.remote.chatControlDesc', 'Nối một chat/nhóm với máy này: nhắn nội dung là máy chạy rồi trả kết quả về chính chat đó.')}
            </Paragraph>
            <Space wrap>
              <Button onClick={linkTelegram} loading={tgBusy} disabled={!st.signedIn}>
                {tr('ui.remote.linkTelegram', 'Nối Telegram')}
              </Button>
              <Button size="small" icon={<ReloadOutlined />} onClick={refreshTgBindings} loading={tgRefreshing}>
                {tr('ui.action.refresh', 'Làm mới')}
              </Button>
            </Space>
            {tgLink && (
              <Alert
                type={tgLink.botConfigured ? 'info' : 'warning'}
                showIcon
                style={{ marginTop: 8, maxWidth: 560 }}
                message={tgLink.botConfigured ? tr('ui.remote.tgLinkTitle', 'Nối Telegram — mở bot rồi bấm Start') : tr('ui.remote.tgNotConfigured', 'Bot Telegram chưa cấu hình trên máy chủ')}
                description={
                  <div style={{ fontSize: 12.5, lineHeight: 1.7 }}>
                    {tgLink.botConfigured ? (
                      <>
                        <div>
                          1. Mở bot:{' '}
                          {tgLink.deepLink ? (
                            <a href={tgLink.deepLink} target="_blank" rel="noreferrer">
                              {tgLink.deepLink}
                            </a>
                          ) : (
                            <Text code>@{tgLink.botUsername}</Text>
                          )}
                        </div>
                        <div>
                          2. Bấm <b>Start</b> (hoặc gửi <Text code>/start {tgLink.code}</Text>) trong chat/nhóm bạn muốn dùng.
                        </div>
                        <div>3. Xong — nhắn thẳng nội dung vào chat đó là máy chạy.</div>
                      </>
                    ) : (
                      <>
                        Tạo bot ở <b>@BotFather</b> rồi đưa token cho quản trị để đặt{' '}
                        <Text code>TELEGRAM_BOT_TOKEN</Text> trên máy chủ. Mã nối của bạn:{' '}
                        <Text code>/start {tgLink.code}</Text> (hết hạn sau 15 phút).
                      </>
                    )}
                  </div>
                }
              />
            )}
            {st.telegramBindings && st.telegramBindings.length > 0 && (
              <List
                size="small"
                style={{ marginTop: 8, maxWidth: 560 }}
                dataSource={st.telegramBindings}
                renderItem={(b) => (
                  <List.Item
                    actions={[
                      <Popconfirm
                        key="u"
                        title={tr('ui.remote.unlinkChatTitle', 'Huỷ liên kết chat này?')}
                        okText={tr('ui.remote.unlink', 'Huỷ liên kết')}
                        cancelText={tr('ui.remote.dismiss', 'Thôi')}
                        onConfirm={() => unbindTelegram(b.id)}
                      >
                        <Button type="text" danger size="small">
                          {tr('ui.action.cancel', 'Huỷ')}
                        </Button>
                      </Popconfirm>,
                    ]}
                  >
                    <Space direction="vertical" size={0}>
                      <Text style={{ fontSize: 13 }}>{b.chatTitle || `Chat ${b.chatId}`}</Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        Telegram ID {b.chatId} {tr('ui.remote.linkedOn', '· nối')} {new Date(b.createdAt).toLocaleDateString('vi-VN')}
                      </Text>
                    </Space>
                  </List.Item>
                )}
              />
            )}
          </div>

          <div>
            <Text style={{ fontSize: 12.5, fontWeight: 600, color: V.textSub, display: 'block', marginBottom: 8 }}>
              {tr('ui.remote.recentTasks', 'Tác vụ gần đây')}
            </Text>
            <List
              size="small"
              dataSource={st.recent}
              locale={{ emptyText: tr('ui.remote.noRemoteTasks', 'Chưa có tác vụ từ xa nào.') }}
              renderItem={(t) => (
                <List.Item>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Text ellipsis style={{ maxWidth: screens.md ? 360 : 180, minWidth: 0 }}>
                      {t.prompt}
                    </Text>
                    <Tag
                      color={
                        t.status === 'done'
                          ? 'green'
                          : t.status === 'error'
                            ? 'red'
                            : t.status === 'running'
                              ? 'blue'
                              : 'default'
                      }
                    >
                      {t.status}
                    </Tag>
                  </Space>
                </List.Item>
              )}
            />
          </div>

          {/* F4 — per-token outbound notify editor */}
          <Modal
            open={!!notifyFor}
            title={`${tr('ui.remote.notifyTitlePre', 'Báo kết quả cho token')} “${notifyFor?.name ?? ''}”`}
            width={screens.md ? 520 : '94vw'}
            onCancel={() => setNotifyFor(null)}
            onOk={saveNotify}
            confirmLoading={notifySaving}
            okText={tr('ui.remote.save', 'Lưu')}
            cancelText={tr('ui.remote.closeModal', 'Đóng')}
          >
            <Paragraph type="secondary" style={{ fontSize: 12.5 }}>
              {tr('ui.remote.notifyDescPre', 'Khi một tác vụ chạy từ token này')} <b>{tr('ui.remote.notifyDescBold', 'kết thúc')}</b>{tr('ui.remote.notifyDescPost', ', gửi tóm tắt kết quả tới (để trống = tắt):')}
            </Paragraph>
            <Text style={{ fontSize: 12 }}>{tr('ui.remote.tgChatIdLabel', 'Chat Telegram (chat ID)')}</Text>
            <Input
              value={notifyTg}
              onChange={(e) => setNotifyTg(e.target.value)}
              placeholder="vd: -1001234567890"
              style={{ marginBottom: 12, marginTop: 2 }}
            />
            <Text style={{ fontSize: 12 }}>{tr('ui.remote.larkWebhookLabel', 'Webhook bot Lark (URL)')}</Text>
            <Input
              value={notifyLark}
              onChange={(e) => setNotifyLark(e.target.value)}
              placeholder="https://open.larksuite.com/open-apis/bot/v2/hook/…"
              style={{ marginTop: 2 }}
            />
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
              {tr('ui.remote.notifyHelp', 'Chat ID Telegram: nối Telegram ở mục trên → chat hiện kèm ID. Lark: thêm “Bot tuỳ chỉnh” vào nhóm để lấy URL webhook.')}
            </Text>
          </Modal>
        </Space>
      )}
    </Card>
  );
}

/**
 * Desktop "Cài đặt" screen — the AI runner connections (Claude + Grok/Gemini/Codex)
 * and the remote-control ("Điều khiển từ xa") agent client, in one place.
 */
export function SettingsScreen({ onNav, cmsAllowed }: { onNav?: (v: View) => void; cmsAllowed?: boolean } = {}) {
  const { t } = useI18n();
  // Responsive: collapse the 2-col grid to a single column below ~900px.
  const [narrow, setNarrow] = useState(false);
  // "Làm mới" for the API-Keys card must NOT reload the window (that destroys every mounted
  // screen + in-flight AI turns). Instead we bump this key so ONLY the
  // <ClaudeKeyManager> remounts and re-fetches on mount.
  const [keyReload, setKeyReload] = useState(0);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width:900px)');
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, []);
  const cols = narrow ? 1 : 2;

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', width: '100%' }}>
      {/* Header stays full-width above the grid */}
      <div style={{ marginBottom: 18 }}>
        <Title level={3} style={{ margin: 0 }}>
          {t('ui.settings.title', 'Cài đặt')}
        </Title>
        <Text type="secondary" style={{ fontSize: 13.5 }}>
          {t('ui.settings.subtitle', 'Kết nối các trình AI/CLI chạy trên máy bạn và bật điều khiển từ xa qua điện thoại.')}
        </Text>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: cols === 2 ? 'repeat(2, minmax(0,1fr))' : '1fr',
          gap: 18,
          alignItems: 'start',
        }}
      >
        {/* API section: team/shared API keys (Anthropic etc) — different from personal CLI login tokens */}
        <Card
          title={<CardTitle icon={<ApiOutlined />} color={BRAND}>{t('ui.settings.apiKeysTitle', 'API Keys (Quản lý API)')}</CardTitle>}
          style={CARD_STYLE}
          extra={
            <Button size="small" icon={<ReloadOutlined />} onClick={() => setKeyReload((n) => n + 1)}>
              {t('ui.action.refresh', 'Làm mới')}
            </Button>
          }
        >
          <Paragraph type="secondary" style={{ marginTop: 0, fontSize: 12.5 }}>
            {t('ui.settings.apiKeysDesc', 'API keys dùng chung cho nhóm (khác với token đăng nhập CLI cá nhân của bạn). Dùng cho Claude khi cần chia sẻ quota an toàn.')}
          </Paragraph>
          <ClaudeKeyManager key={keyReload} embedded />
        </Card>

        {/* Compact card paired with API Keys on the same 2-col row */}

        {/* Device manager — login sessions, max 3 per account (phone + 2 computers) */}
        <div style={{ gridColumn: '1 / -1' }}>
          <Card style={CARD_STYLE}>
            <DeviceManager />
          </Card>
        </div>

        {/* Tall panels each get their own full-width row */}
        <div style={{ gridColumn: '1 / -1' }}>
          <RunnersPanel />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <RemoteControlPanel onNav={onNav} />
        </div>

        {/* Interlink footer — jump to related screens (replaces the old decorative divider). */}
        {onNav && (
          <div
            style={{
              gridColumn: '1 / -1',
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 2,
              paddingTop: 10,
              marginTop: 2,
              borderTop: `1px solid ${V.borderSub}`,
            }}
          >
            <span style={{ ...MICRO, marginRight: 6 }}>{t('ui.settings.goTo', 'Đi tới')}</span>
            <Button type="link" size="small" onClick={() => onNav('home')}>{t('ui.settings.overview', 'Tổng quan →')}</Button>
            <Button type="link" size="small" onClick={() => onNav('lark')}>{t('ui.settings.openLark', 'Mở Lark →')}</Button>
            {cmsAllowed && <Button type="link" size="small" onClick={() => onNav('cms-sync')}>{t('ui.settings.openCms', 'Mở Đồng bộ CMS →')}</Button>}
            <Button type="link" size="small" onClick={() => onNav('skills')}>{t('ui.settings.skills', 'Kỹ năng →')}</Button>
          </div>
        )}
      </div>
    </div>
  );
}
