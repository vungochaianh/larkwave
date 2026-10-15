'use client';
import { useCallback, useEffect, useState } from 'react';
import { Card, Typography, Input, Button, Table, Tag, Alert, Space, Radio, Popconfirm, App as AntApp } from 'antd';
import { KeyOutlined, CheckCircleFilled, SafetyCertificateOutlined } from '@ant-design/icons';
import type { ApiKeyEntry, ApiKeyList, KeyValidation } from '@larkwave/core';
import { useRuntime } from '../RuntimeProvider';
import { V } from '../theme';
import { useI18n } from '../i18n';

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
  const { message } = AntApp.useApp();

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
      setCheck(await claude.validateKey!(k));
    } finally {
      setChecking(false);
    }
  };

  const doAdd = async () => {
    const k = key.trim();
    if (!k) return;
    setAdding(true);
    try {
      const next = await claude.addKey!({ label: label.trim(), key: k });
      setList(next);
      setLabel('');
      setKey('');
      setCheck(null);
      message.success(t('ui.keys.added', 'Đã thêm API key.'));
      onActiveChange?.();
    } catch (e) {
      message.error((e as Error)?.message || t('ui.keys.addFailed', 'Không thêm được key.'));
    } finally {
      setAdding(false);
    }
  };

  const makeActive = async (id: string) => {
    setBusyId(id);
    try {
      setList(await claude.setActiveKey!(id));
      onActiveChange?.();
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try {
      setList(await claude.removeKey!(id));
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
