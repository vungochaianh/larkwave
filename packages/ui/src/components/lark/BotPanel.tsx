'use client';
import { useEffect, useState } from 'react';
import { App, Alert, Button, Card, Input, InputNumber, Space, Switch, Tag, Typography } from 'antd';
import { RobotOutlined, TeamOutlined } from '@ant-design/icons';
import type { LarkBotStatus, RuntimeAdapter } from '@larkwave/core';
import { RunnerModelPicker } from '../RunnerModelPicker';
import { useI18n } from '../../i18n';

const { Text, Paragraph } = Typography;

/**
 * Configure the Lark bot (Event Subscription). The desktop runs a local listener;
 * the user tunnels it (cloudflared/ngrok) and sets the public URL as the app's
 * Event Subscription Request URL. The bot replies inside Lark in READ-ONLY mode.
 */
export function BotPanel({ runtime }: { runtime: RuntimeAdapter }) {
  const { t } = useI18n();
  const { message, modal } = App.useApp();
  const [status, setStatus] = useState<LarkBotStatus | null>(null);
  const [port, setPort] = useState(3017);
  const [encryptKey, setEncryptKey] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [tunnel, setTunnel] = useState(false);
  const [runnerId, setRunnerId] = useState('claude');
  const [runnerModel, setRunnerModel] = useState('');
  const [busy, setBusy] = useState(false);
  const [creatingChat, setCreatingChat] = useState(false);

  const createBotChat = async () => {
    if (!runtime.larkBotCreateChat) return;
    setCreatingChat(true);
    try {
      const c = await runtime.larkBotCreateChat('Chat với AI (Larkwave)');
      if (c?.joinLink) runtime.openExternal?.(c.joinLink);
      modal.info({
        title: t('chat.botChatCreated', 'Đã tạo nhóm chat với Bot'),
        width: 520,
        content: (
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            <p>
              {t('chat.groupWord', 'Nhóm')} <b>“{c.name}”</b> {t('chat.groupCreatedMid', 'đã tạo (bot đã ở trong).')} {c.joinLink ? t('chat.openedInviteInLark', 'Mình vừa mở LỜI MỜI trong Lark — bấm ') : ''}
              {c.joinLink ? <b>{t('chat.joinBold', '“Tham gia”')}</b> : t('chat.openLarkFindGroup', 'Mở Lark, tìm nhóm và tham gia')} {t('chat.groupCreatedPost', 'để vào nhóm rồi')} <b>{t('chat.messageAI', 'nhắn cho AI')}</b> {t('chat.rightThere', 'ngay ở đó.')}
            </p>
            {c.joinLink && (
              <p style={{ margin: 0, color: '#8a8a8a', wordBreak: 'break-all' }}>
                {t('chat.notOpenedLink', 'Không thấy Lark tự mở? Mở link:')}{' '}
                <a href={c.joinLink} target="_blank" rel="noreferrer">
                  {c.joinLink}
                </a>
              </p>
            )}
          </div>
        ),
      });
    } catch (e) {
      message.error((e as Error)?.message || t('chat.createGroupFailed', 'Tạo nhóm thất bại (kiểm tra app Lark đã bật quyền im:chat + đang kết nối).'));
    } finally {
      setCreatingChat(false);
    }
  };

  const applyStatus = (s: LarkBotStatus) => {
    setStatus(s);
    setPort(s.port);
    setEnabled(s.enabled);
    setTunnel(!!s.tunnel);
    if (s.runner) setRunnerId(s.runner);
    if (s.model !== undefined) setRunnerModel(s.model);
  };

  useEffect(() => {
    runtime
      .larkBotStatus?.()
      .then((s) => {
        if (s) applyStatus(s);
      })
      .catch(() => {});
  }, [runtime]);

  const refresh = async () => {
    try {
      const s = await runtime.larkBotStatus?.();
      if (s) applyStatus(s);
    } catch {
      /* ignore */
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const s = await runtime.larkBotConfigure!({
        enabled,
        port,
        encryptKey: encryptKey || undefined,
        verificationToken: verificationToken || undefined,
        runner: runnerId,
        model: runnerModel || undefined,
        tunnel,
      });
      applyStatus(s);
      setEncryptKey('');
      setVerificationToken('');
      if (s.error) message.error(s.error);
      else message.success(enabled ? (s.running ? t('chat.botRunning', 'Bot đang chạy.') : t('chat.saved', 'Đã lưu.')) : t('chat.botOff', 'Đã tắt bot.'));
    } catch (e) {
      message.error((e as Error)?.message || t('chat.botSaveFailed', 'Lỗi khi lưu cấu hình bot.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      size="small"
      title={
        <span>
          <RobotOutlined /> {t('chat.botInLark', 'Bot trong Lark')}
        </span>
      }
      extra={
        <Space size={6}>
          <Button size="small" type="text" onClick={refresh}>
            {t('chat.refresh', 'Làm mới')}
          </Button>
          {status?.running ? <Tag color="success">{t('chat.running', 'đang chạy')}</Tag> : <Tag>{t('chat.off', 'tắt')}</Tag>}
        </Space>
      }
    >
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
          {t('chat.botIntro', 'Nhắn với AI agent ngay trong Lark (trả lời chế độ chỉ-đọc). Máy này lắng nghe cục bộ, cần một URL công khai để Lark gọi vào (webhook).')}
        </Paragraph>

        <Alert
          type="info"
          showIcon
          message={t('chat.botSetupTitle', 'Cách thiết lập Bot (6 bước)')}
          description={
            <div style={{ fontSize: 12.5, lineHeight: 1.7 }}>
              <ol style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                <li>
                  Đã kết nối app Lark ở <b>Lark × Agents</b>. Vào <b>Lark Developer Console</b> (open.larksuite.com) → app
                  của bạn → bật tính năng <b>Bot</b> + quyền <Text code>im:chat</Text>, <Text code>im:message</Text>.
                </li>
                <li>
                  Ở dưới: bật công tắc <b>“Bật bot”</b> + bật <b>“Tự tạo URL công khai (cloudflared)”</b> (cần cài
                  cloudflared) để có URL — hoặc tự chạy cloudflared/ngrok.
                </li>
                <li>
                  Copy <b>URL công khai</b> (hiện ở khung xanh) → dán vào <b>Event Subscription → Request URL</b> trong
                  Console.
                </li>
                <li>
                  Trong Console, đăng ký sự kiện <Text code>im.message.receive_v1</Text>.
                </li>
                <li>
                  (Nên có) Đặt <b>Encrypt Key</b> + <b>Verification Token</b> trong Console → dán vào 2 ô ở dưới → Lưu.
                </li>
                <li>
                  Bấm <b>“Tạo nhóm chat với Bot”</b> (nút bên dưới) → Tham gia nhóm → nhắn cho AI. Hoặc nhắn trực tiếp cho
                  bot (chat 1-1).
                </li>
              </ol>
            </div>
          }
        />

        {runtime.larkBotCreateChat && (
          <Button icon={<TeamOutlined />} loading={creatingChat} onClick={createBotChat}>
            {t('chat.createBotChatBtn', 'Tạo nhóm chat với Bot (tự động + link tham gia)')}
          </Button>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 12 }}>{t('chat.agentReplies', 'Agent trả lời')}</Text>
          <RunnerModelPicker
            compact
            storageKeyRunner="tw_lark_bot_runner"
            storageKeyModel="tw_lark_bot_model"
            initialRunner={status?.runner}
            initialModel={status?.model}
            onChange={(id, m) => {
              setRunnerId(id);
              setRunnerModel(m || '');
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, minWidth: 46 }}>{t('chat.port', 'Cổng')}</Text>
          <InputNumber
            min={1024}
            max={65535}
            value={port}
            onChange={(v) => setPort(Number(v) || 3017)}
            style={{ width: 110 }}
          />
          {status?.localUrl && (
            <Text copyable={{ text: status.localUrl }} type="secondary" style={{ fontSize: 11 }}>
              {status.localUrl}
            </Text>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Switch checked={tunnel} onChange={setTunnel} />
          <Text style={{ fontSize: 12 }}>{t('chat.autoPublicUrl', 'Tự tạo URL công khai (cloudflared)')}</Text>
          {status?.tunnelRunning && status.publicUrl && (
            <Tag color="processing" style={{ margin: 0 }}>
              {t('chat.tunnelOn', 'tunnel bật')}
            </Tag>
          )}
        </div>
        {tunnel && status?.publicUrl && (
          <Alert
            type="success"
            showIcon
            message={t('chat.publicUrlMsg', 'URL công khai (dán vào Event Subscription → Request URL của app Lark)')}
            description={
              <Text copyable={{ text: `${status.publicUrl}/` }} style={{ fontSize: 12, wordBreak: 'break-all' }}>
                {status.publicUrl}/
              </Text>
            }
          />
        )}
        {tunnel && status?.tunnelError && !status?.publicUrl && (
          <Alert type="warning" showIcon message={`Tunnel: ${status.tunnelError}`} />
        )}
        <Input.Password
          placeholder={status?.encryptKeySet ? t('chat.encryptKeySaved', 'Encrypt Key (đã lưu — để trống nếu giữ)') : t('chat.encryptKeyRec', 'Encrypt Key (khuyến nghị)')}
          value={encryptKey}
          onChange={(e) => setEncryptKey(e.target.value)}
        />
        <Input.Password
          placeholder={status?.verificationTokenSet ? t('chat.verifyTokenSaved', 'Verification Token (đã lưu)') : 'Verification Token'}
          value={verificationToken}
          onChange={(e) => setVerificationToken(e.target.value)}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Switch checked={enabled} onChange={setEnabled} />
          <Text style={{ fontSize: 13 }}>{enabled ? t('chat.enableBot', 'Bật bot') : t('chat.disableBot', 'Tắt bot')}</Text>
          <span style={{ flex: 1 }} />
          <Button type="primary" loading={busy} onClick={save}>
            {t('chat.save', 'Lưu')}
          </Button>
        </div>
        {status?.error && <Alert type="error" showIcon message={status.error} />}
        {status?.running && status.activity && (
          <div style={{ fontSize: 12, color: '#5B6478', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <span>📥 {t('chat.receivedWord', 'nhận')} {status.activity.received}</span>
            <span>💬 {t('chat.repliedWord', 'trả lời')} {status.activity.processed}</span>
            {status.activity.deduped > 0 && <span>♻️ {t('chat.dupWord', 'trùng')} {status.activity.deduped}</span>}
            {status.activity.failed > 0 && (
              <span style={{ color: '#D4380D' }}>⚠️ {t('chat.errorsUnit', 'lỗi')} {status.activity.failed}</span>
            )}
            {status.activity.lastMessageAt && (
              <span>🕒 {new Date(status.activity.lastMessageAt).toLocaleTimeString()}</span>
            )}
          </div>
        )}
        {status?.running && status.activity?.lastError && (
          <Alert type="warning" showIcon message={`${t('chat.lastError', 'Lỗi gần nhất')}: ${status.activity.lastError}`} />
        )}
      </Space>
    </Card>
  );
}