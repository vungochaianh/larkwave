'use client';
import { useCallback, useEffect, useState } from 'react';
import { Card, Typography, Input, Button, Table, Tag, Alert, Space, Radio, Popconfirm, App as AntApp } from 'antd';
import { KeyOutlined, CheckCircleFilled, SafetyCertificateOutlined } from '@ant-design/icons';
import type { ApiKeyEntry, ApiKeyList, KeyValidation } from '@larkwave/core';
import { useRuntime } from '../RuntimeProvider';
import { V } from '../theme';
import { useI18n } from '../i18n';
import { API_KEYS_CHANGED_EVENT } from './lark/engineChip';
import { isAnthropicApiKey } from '../claudeKeyKind';

/**
 * Câu từ chối của LÕI ≤0.1.3: nó chỉ nhận đúng tiền tố `sk-ant-api…`, nên từ chối cả API key hợp lệ dạng
 * mới `sk-ant-usr-…` (Console cấp từ 10/2026). Giao diện đi theo code-push nên đã mới, còn lõi chỉ đổi khi
 * cài lại .dmg — người dùng thoát/mở lại app vẫn gặp đúng câu này (gặp thật 15/10/2026).
 */
const OLD_CORE_KEY_REJECT = /Chỉ (chấp nhận|kiểm tra được) API key[\s\S]*sk-ant-api/;

const { Title, Text, Link } = Typography;

/**
 * Manage the Anthropic API keys the team uses to run Claude — the COMPLIANT alternative
 * to handing one person's login token to others. An admin pastes org-provisioned
 * Anthropic API keys (`sk-ant-api03-…`, `sk-ant-usr-…` — see claudeKeyKind.ts), labels them, validates them, and picks the active one (fed to the
 * local Claude CLI). The raw key never leaves the main process — the UI only ever sees
 * the masked form. Renders nothing on a runtime without managed-key support (web / older
 * desktop bundle), so it degrades gracefully.
 */
export function ClaudeKeyManager({
  onActiveChange,
  embedded,
}: {
  onActiveChange?: () => void;
  /** Render without the outer Card (e.g. inside another panel/screen). */
  embedded?: boolean;
}) {
  const runtime = useRuntime();
  const { t } = useI18n();
  const claude = runtime.claude;
  const { message, modal } = AntApp.useApp();

  const [list, setList] = useState<ApiKeyList | null>(null);
  const [label, setLabel] = useState('');
  const [key, setKey] = useState('');
  const [adding, setAdding] = useState(false);
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<KeyValidation | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!claude?.listKeys) return;
    setList(await claude.listKeys().catch(() => ({ keys: [], encrypted: true })));
  }, [claude]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!claude?.listKeys || !claude.addKey) {
    return null; // managed keys are desktop-only; nothing to show otherwise
  }

  const doCheck = async () => {
    const k = key.trim();
    if (!k) return;
    setChecking(true);
    setCheck(null);
    try {
      const res = await claude.validateKey!(k);
      // Lõi cũ không kiểm được key dạng mới — đừng để người dùng tưởng key hỏng.
      if (!res.ok && OLD_CORE_KEY_REJECT.test(res.error || '') && isAnthropicApiKey(k)) {
        setCheck({
          ok: false,
          error: t(
            'ui.keys.oldCoreCheck',
            'Bản cài Larkwave trên máy này còn cũ nên chưa kiểm được API key dạng mới (sk-ant-usr-…). Key có thể vẫn đúng: bấm "Thêm key" để dùng ngay, hoặc cài bản mới nhất ở toolswave.net/larkwave.',
          ),
        });
      } else setCheck(res);
    } finally {
      setChecking(false);
    }
  };

  /**
   * Lõi cũ từ chối key dạng mới vào danh sách nhóm, nhưng ô "Kết nối Claude bằng token" của nó nhận mọi
   * khoá và đưa khoá không phải `sk-ant-oat…` vào ANTHROPIC_API_KEY — dùng được ngay, không cần cài lại.
   * Phải HỎI: nó thay token Claude đã dán trước đó (nếu có) và Claude CLI sẽ chạy bằng API key (tính tiền
   * theo key) thay cho gói đang đăng nhập.
   */
  const offerTokenFallback = (k: string) => {
    modal.confirm({
      title: t('ui.keys.oldCoreTitle', 'Bản cài trên máy này còn cũ'),
      content: t(
        'ui.keys.oldCoreBody',
        'Phần lõi của bản cài này chưa nhận API key dạng mới (sk-ant-usr-…) vào danh sách nhóm. Có thể dùng key này NGAY làm khoá Claude của máy này: Claude CLI sẽ chạy bằng API key này (tính tiền theo key) thay cho tài khoản đang đăng nhập, và thay khoá/token Claude đã dán trước đó (nếu có). Cài bản mới nhất ở toolswave.net/larkwave để quản lý key trong danh sách.',
      ),
      okText: t('ui.keys.oldCoreOk', 'Dùng key này ngay'),
      cancelText: t('ui.keys.oldCoreCancel', 'Để sau'),
      onOk: async () => {
        try {
          await claude.setToken(k);
          setLabel('');
          setKey('');
          setCheck(null);
          window.dispatchEvent(new Event(API_KEYS_CHANGED_EVENT));
          onActiveChange?.();
          message.success(t('ui.keys.oldCoreDone', 'Đã lưu — Claude trên máy này giờ chạy bằng API key này.'));
        } catch (e) {
          message.error((e as Error)?.message || t('ui.keys.addFailed', 'Không thêm được key.'));
        }
      },
    });
  };

  const doAdd = async () => {
    const k = key.trim();
    if (!k) return;
    setAdding(true);
    try {
      const next = await claude.addKey!({ label: label.trim(), key: k });
      setList(next);
      window.dispatchEvent(new Event(API_KEYS_CHANGED_EVENT)); // chip của màn chat làm mới ngay
      setLabel('');
      setKey('');
      setCheck(null);
      message.success(t('ui.keys.added', 'Đã thêm API key.'));
      onActiveChange?.();
    } catch (e) {
      const msg = (e as Error)?.message || '';
      if (OLD_CORE_KEY_REJECT.test(msg) && isAnthropicApiKey(k)) {
        offerTokenFallback(k);
        return;
      }
      message.error(msg || t('ui.keys.addFailed', 'Không thêm được key.'));
    } finally {
      setAdding(false);
    }
  };

  const makeActive = async (id: string) => {
    setBusyId(id);
    try {
      setList(await claude.setActiveKey!(id));
      window.dispatchEvent(new Event(API_KEYS_CHANGED_EVENT)); // chip của màn chat làm mới ngay
      onActiveChange?.();
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try {
      setList(await claude.removeKey!(id));
      window.dispatchEvent(new Event(API_KEYS_CHANGED_EVENT)); // chip của màn chat làm mới ngay
      onActiveChange?.();
    } finally {
      setBusyId(null);
    }
  };

  const columns = [
    {
      title: t('ui.keys.colActive', 'Đang dùng'),
      key: 'active',
      width: 90,
      render: (_: unknown, r: ApiKeyEntry) => (
        <Radio checked={r.active} disabled={busyId === r.id} onChange={() => void makeActive(r.id)} />
      ),
    },
    { title: t('ui.keys.colName', 'Tên'), dataIndex: 'label', key: 'label' },
    {
      title: 'Key',
      dataIndex: 'masked',
      key: 'masked',
      render: (m: string) => <Text code>{m}</Text>,
    },
    {
      title: t('ui.keys.colStatus', 'Trạng thái'),
      key: 'valid',
      render: (_: unknown, r: ApiKeyEntry) =>
        r.valid === undefined ? (
          <Tag>{t('ui.keys.unchecked', 'chưa kiểm tra')}</Tag>
        ) : r.valid ? (
          <Tag color="success">{t('ui.keys.validTag', 'hợp lệ')}</Tag>
        ) : (
          <Tag color="error">{t('ui.keys.invalidTag', 'không hợp lệ')}</Tag>
        ),
    },
    {
      title: '',
      key: 'action',
      width: 80,
      render: (_: unknown, r: ApiKeyEntry) => (
        <Popconfirm title={t('ui.keys.deleteConfirm', 'Xoá key này?')} okText={t('ui.action.delete', 'Xoá')} cancelText={t('ui.action.cancel', 'Huỷ')} onConfirm={() => void remove(r.id)}>
          <Button size="small" danger type="text" loading={busyId === r.id}>
            {t('ui.action.delete', 'Xoá')}
          </Button>
        </Popconfirm>
      ),
    },
  ];

  const body = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <KeyOutlined style={{ fontSize: 20, color: '#7A5AF8' }} />
        <Title level={4} style={{ margin: 0 }}>
          {t('ui.keys.teamTitle', 'API key của nhóm')}
        </Title>
      </div>
      <Text type="secondary">
        {t('ui.keys.teamDescPre', 'Phân phối API key Anthropic (')}<Text code>sk-ant-…</Text>{t('ui.keys.teamDescPost', ') cho cả nhóm dùng chung — cách hợp lệ để nhiều người chạy Claude. Mỗi máy chọn 1 key đang dùng; key được mã hoá & lưu trên máy, không gửi đi đâu.')}
      </Text>

      {list && !list.encrypted && (
        <Alert
          style={{ marginTop: 14 }}
          type="warning"
          showIcon
          message={t('ui.keys.noKeychain', 'Máy này không có keychain để mã hoá')}
          description={t('ui.keys.noKeychainDesc', 'Key sẽ được lưu dạng không mã hoá. Chỉ thêm key trên máy bạn tin tưởng.')}
        />
      )}

      <div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: V.surfaceAlt }}>
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Input
            placeholder={t('ui.keys.labelPlaceholder', 'Tên gợi nhớ (vd: Key chính của team)')}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={40}
          />
          <Input.Password
            placeholder="sk-ant-api03-… / sk-ant-usr-…"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setCheck(null);
            }}
            onPressEnter={() => void doAdd()}
            autoComplete="off"
          />
          {check && (
            <Alert
              type={check.ok ? 'success' : 'error'}
              showIcon
              icon={check.ok ? <CheckCircleFilled /> : undefined}
              message={check.ok ? `${t('ui.keys.validKey', 'Key hợp lệ')}${check.model ? ` (${t('ui.keys.triedModel', 'đã thử')} ${check.model})` : ''}` : check.error}
            />
          )}
          <Space>
            <Button icon={<SafetyCertificateOutlined />} loading={checking} disabled={!key.trim()} onClick={doCheck}>
              {t('ui.keys.check', 'Kiểm tra')}
            </Button>
            <Button type="primary" loading={adding} disabled={!key.trim()} onClick={doAdd}>
              {t('ui.keys.addKey', 'Thêm key')}
            </Button>
          </Space>
        </Space>
      </div>

      <Table
        style={{ marginTop: 16 }}
        size="small"
        rowKey="id"
        pagination={false}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: t('ui.keys.emptyList', 'Chưa có key nào') }}
        columns={columns}
        dataSource={list?.keys ?? []}
      />
    </>
  );

  return embedded ? <div>{body}</div> : <Card style={{ maxWidth: 760, margin: '0 auto' }}>{body}</Card>;
}
