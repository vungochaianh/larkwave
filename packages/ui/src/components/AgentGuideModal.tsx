'use client';
import { useState } from 'react';
import { App, Alert, Button, Input, Modal, Space, Tag, Typography } from 'antd';
import { CheckCircleFilled, KeyOutlined, ExportOutlined, CopyOutlined } from '@ant-design/icons';
import type { RunnerStatusInfo, RuntimeAdapter } from '@larkwave/core';

const { Text, Paragraph } = Typography;

/** Per-provider setup guidance: how to log the CLI in, and which API key to paste. */
const GUIDE: Record<
  string,
  { login: string; keyLabel: string; keyPlaceholder: string; keyDocs?: string; keyDocsLabel?: string }
> = {
  claude: {
    login: 'claude    →  rồi gõ /login (đăng nhập gói Claude của bạn)',
    keyLabel: 'Anthropic API key (hoặc token đăng nhập)',
    keyPlaceholder: 'sk-ant-api… / sk-ant-usr… hoặc sk-ant-oat…',
    keyDocs: 'https://console.anthropic.com/settings/keys',
    keyDocsLabel: 'Lấy Anthropic API key',
  },
  grok: {
    login: 'grok    →  đăng nhập bằng tài khoản grok.com',
    keyLabel: 'xAI API key',
    keyPlaceholder: 'xai-…',
    keyDocs: 'https://console.x.ai',
    keyDocsLabel: 'Lấy xAI API key',
  },
  gemini: {
    login: 'gemini    →  chọn "Login with Google" rồi đăng nhập (xong gõ /quit)',
    keyLabel: 'Google Gemini API key',
    keyPlaceholder: 'AIza…',
    keyDocs: 'https://aistudio.google.com/apikey',
    keyDocsLabel: 'Lấy Gemini API key',
  },
  codex: {
    login: 'codex    →  đăng nhập bằng tài khoản ChatGPT/OpenAI',
    keyLabel: 'OpenAI API key',
    keyPlaceholder: 'sk-…',
    keyDocs: 'https://platform.openai.com/api-keys',
    keyDocsLabel: 'Lấy OpenAI API key',
  },
};

/** Setup guidance for one CLI agent — install, log in (CLI), or paste an API key. */
export function AgentGuideModal({
  runtime,
  runner,
  onClose,
  onChanged,
}: {
  runtime: RuntimeAdapter;
  runner: RunnerStatusInfo | null;
  onClose: () => void;
  onChanged: (list: RunnerStatusInfo[]) => void;
}) {
  const { message } = App.useApp();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);

  if (!runner) return null;
  const g = GUIDE[runner.id] ?? GUIDE.claude;
  const installHint = runner.installHint ?? `cài ${runner.bin}`;
  const open = (url: string) => (runtime.openExternal ? runtime.openExternal(url) : window.open(url, '_blank'));
  const copy = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      message.success('Đã copy.');
    } catch {
      message.info(t);
    }
  };

  const status = runner.ready
    ? { type: 'success' as const, text: 'Sẵn sàng — agent này dùng được ngay.' }
    : !runner.installed
      ? { type: 'warning' as const, text: 'Chưa cài CLI trên máy. Làm bước 1 rồi mở lại app.' }
      : { type: 'warning' as const, text: 'Đã cài CLI nhưng chưa có đăng nhập/API key. Làm bước 2.' };

  const saveKey = async () => {
    const k = key.trim();
    if (!k || !runtime.runners) return;
    setBusy(true);
    try {
      const list = await runtime.runners.setToken(runner.id, k);
      onChanged(list);
      setKey('');
      const now = list.find((r) => r.id === runner.id);
      message.success(now?.ready ? `${runner.label} đã sẵn sàng.` : 'Đã lưu API key.');
    } catch (e) {
      message.error((e as Error)?.message || 'Không lưu được key.');
    } finally {
      setBusy(false);
    }
  };

  const clearKey = async () => {
    if (!runtime.runners) return;
    setBusy(true);
    try {
      onChanged(await runtime.runners.clearToken(runner.id));
      message.success('Đã xoá API key đã lưu.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onCancel={onClose} footer={null} width={560} title={`Cài đặt ${runner.label}`}>
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        <Alert
          type={status.type}
          showIcon
          icon={runner.ready ? <CheckCircleFilled /> : undefined}
          message={status.text}
          description={
            runner.version || runner.authMethod ? (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {runner.installed ? `Đã cài${runner.version ? ` v${runner.version}` : ''}` : 'Chưa cài'}
                {runner.authMethod ? ` · đăng nhập: ${runner.authMethod}` : ''}
              </Text>
            ) : undefined
          }
        />

        {/* Step 1 — install the CLI */}
        <div>
          <Text strong style={{ fontSize: 13 }}>
            1. Cài CLI {runner.installed && <Tag color="success" style={{ marginInlineStart: 6 }}>đã cài</Tag>}
          </Text>
          <Paragraph type="secondary" style={{ fontSize: 12, margin: '4px 0 6px' }}>
            Mở Terminal chạy lệnh sau (cần Node.js):
          </Paragraph>
          <Input
            readOnly
            value={installHint}
            addonAfter={<CopyOutlined style={{ cursor: 'pointer' }} onClick={() => copy(installHint)} />}
          />
        </div>

        {/* Step 2 — login OR API key */}
        <div>
          <Text strong style={{ fontSize: 13 }}>
            2. Đăng nhập <Text type="secondary" style={{ fontWeight: 400 }}>— chọn 1 trong 2 cách</Text>
          </Text>

          <Paragraph type="secondary" style={{ fontSize: 12, margin: '6px 0 4px' }}>
            <b>Cách A — đăng nhập CLI</b> (dùng gói/subscription của bạn, chi phí ~$0):
          </Paragraph>
          <Input
            readOnly
            value={g.login}
            addonAfter={<CopyOutlined style={{ cursor: 'pointer' }} onClick={() => copy(g.login.split('→')[0].trim())} />}
          />

          <Paragraph type="secondary" style={{ fontSize: 12, margin: '10px 0 4px' }}>
            <b>Cách B — dán API key</b> ({g.keyLabel}). Trả phí theo lượng token dùng.
          </Paragraph>
          <Space.Compact style={{ width: '100%' }}>
            <Input.Password placeholder={g.keyPlaceholder} value={key} onChange={(e) => setKey(e.target.value)} onPressEnter={saveKey} />
            <Button type="primary" icon={<KeyOutlined />} loading={busy} onClick={saveKey}>
              Lưu key
            </Button>
          </Space.Compact>
          <div style={{ marginTop: 6, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {g.keyDocs && (
              <Button size="small" type="link" style={{ padding: 0 }} icon={<ExportOutlined />} onClick={() => open(g.keyDocs!)}>
                {g.keyDocsLabel}
              </Button>
            )}
            {runner.authMethod && (
              <Button size="small" type="link" danger style={{ padding: 0 }} onClick={clearKey}>
                Xoá key đã lưu
              </Button>
            )}
          </div>
        </div>

        <Alert
          type="info"
          showIcon
          message="API key hiện dùng QUA CLI"
          description="API key ở trên được đưa vào CLI đã cài (bước 1) — vẫn cần cài CLI. Bản chạy THẲNG API (không cần cài CLI) đang được bổ sung."
        />
      </Space>
    </Modal>
  );
}
