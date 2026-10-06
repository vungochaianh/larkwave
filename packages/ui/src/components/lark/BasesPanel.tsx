'use client';
import { useEffect, useState } from 'react';
import { App, Button, Card, Empty, Input, List, Space, Typography } from 'antd';
import { DatabaseOutlined, PlusOutlined, DeleteOutlined, CloudSyncOutlined, EditOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import type { LarkBaseRef, RuntimeAdapter } from '@larkwave/core';
import { useI18n } from '../../i18n';

const { Text } = Typography;

/**
 * Register the Bitable Bases Claude may operate on. There is no "list apps" Open
 * API, so the user supplies each Base by app_token or share URL; we remember them.
 * Each Base can carry an optional DESCRIPTION (what it holds / is used for) — shown
 * here and fed into the agent's system prompt so it understands the data.
 */
export function BasesPanel({ runtime, onChanged }: { runtime: RuntimeAdapter; onChanged?: () => void }) {
  const { t } = useI18n();
  const { message } = App.useApp();
  const [bases, setBases] = useState<LarkBaseRef[]>([]);
  const [value, setValue] = useState('');
  const [descValue, setDescValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  /** app_token being edited inline (name + description), or null. */
  const [editToken, setEditToken] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');

  useEffect(() => {
    runtime.larkListBases?.().then(setBases).catch(() => setBases([]));
  }, [runtime]);

  const add = async () => {
    const v = value.trim();
    if (!v) return;
    setBusy(true);
    try {
      const isUrl = /^https?:\/\//i.test(v);
      const description = descValue.trim() || undefined;
      const next = await runtime.larkAddBase!(isUrl ? { url: v, description } : { appToken: v, description });
      setBases(next);
      setValue('');
      setDescValue('');
      onChanged?.(); // let the chat refresh its Base list immediately
      message.success(t('chat.baseAdded', 'Đã thêm Base.'));
    } catch (e) {
      message.error((e as Error)?.message || t('chat.baseAddFailed', 'Không thêm được Base.'));
    } finally {
      setBusy(false);
    }
  };

  /** Walk the user's Lark Drive (needs the personal login) to auto-register every Base. */
  const discover = async () => {
    setDiscovering(true);
    try {
      const before = bases.length;
      const next = await runtime.larkDiscoverBases!();
      setBases(next);
      onChanged?.();
      const added = next.length - before;
      message.success(
        added > 0
          ? `${t('chat.basesLoaded', 'Đã nạp')} ${next.length} Base (${t('chat.basesAdded', 'thêm')} ${added} ${t('chat.newSuffix', 'mới')}).`
          : `${t('chat.noNewBase', 'Không thấy Base mới')} (${t('chat.totalWord', 'tổng')} ${next.length}).`,
      );
    } catch (e) {
      message.error((e as Error)?.message || t('chat.basesLoadFailed', 'Không nạp được Base.'));
    } finally {
      setDiscovering(false);
    }
  };

  const remove = async (appToken: string) => {
    try {
      setBases(await runtime.larkRemoveBase!(appToken));
      onChanged?.();
    } catch {
      /* ignore */
    }
  };

  const startEdit = (b: LarkBaseRef) => {
    setEditToken(b.appToken);
    setEditName(b.name || '');
    setEditDesc(b.description || '');
  };
  const cancelEdit = () => setEditToken(null);
  const saveEdit = async (appToken: string) => {
    try {
      // Re-add with the same token → upserts the name + description (no re-resolve).
      const next = await runtime.larkAddBase!({
        appToken,
        name: editName.trim() || undefined,
        description: editDesc.trim() || '',
      });
      setBases(next);
      setEditToken(null);
      onChanged?.();
      message.success(t('chat.baseUpdated', 'Đã cập nhật Base.'));
    } catch (e) {
      message.error((e as Error)?.message || t('chat.baseUpdateFailed', 'Không cập nhật được Base.'));
    }
  };

  return (
    <Card
      size="small"
      title={
        <span>
          <DatabaseOutlined /> {t('chat.registeredBases', 'Base đã đăng ký')}
        </span>
      }
    >
      {runtime.larkDiscoverBases && (
        <Button
          icon={<CloudSyncOutlined />}
          loading={discovering}
          onClick={discover}
          block
          style={{ marginBottom: 8 }}
        >
          {t('chat.autoLoadBases', 'Tự động nạp Base của bạn')}
        </Button>
      )}
      <Space direction="vertical" size={6} style={{ width: '100%', marginBottom: 8 }}>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            placeholder={t('chat.baseInputPlaceholder', 'app_token hoặc URL Base')}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onPressEnter={add}
          />
          <Button type="primary" icon={<PlusOutlined />} loading={busy} onClick={add} />
        </Space.Compact>
        <Input
          placeholder={t('chat.baseDescPlaceholder', 'Mô tả (tuỳ chọn) — Base này chứa gì / dùng để làm gì')}
          value={descValue}
          onChange={(e) => setDescValue(e.target.value)}
          onPressEnter={add}
          maxLength={200}
        />
      </Space>
      {bases.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('chat.noBase', 'Chưa có Base')} />
      ) : (
        <List
          size="small"
          dataSource={bases}
          renderItem={(b) =>
            editToken === b.appToken ? (
              <List.Item>
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  <Input
                    size="small"
                    placeholder={t('chat.baseNamePlaceholder', 'Tên Base')}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onPressEnter={() => saveEdit(b.appToken)}
                  />
                  <Input.TextArea
                    size="small"
                    placeholder={t('chat.baseDescShortPlaceholder', 'Mô tả — Base này chứa gì / dùng để làm gì')}
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    autoSize={{ minRows: 1, maxRows: 3 }}
                    maxLength={200}
                  />
                  <Space size={6}>
                    <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => saveEdit(b.appToken)}>
                      {t('chat.save', 'Lưu')}
                    </Button>
                    <Button size="small" icon={<CloseOutlined />} onClick={cancelEdit}>
                      {t('chat.cancel', 'Huỷ')}
                    </Button>
                  </Space>
                </Space>
              </List.Item>
            ) : (
              <List.Item
                actions={[
                  <Button
                    key="e"
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    title={t('chat.editNameDesc', 'Sửa tên / mô tả')}
                    onClick={() => startEdit(b)}
                  />,
                  <Button
                    key="d"
                    type="text"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => remove(b.appToken)}
                  />,
                ]}
              >
                <List.Item.Meta
                  title={<Text style={{ fontSize: 13 }}>{b.name}</Text>}
                  description={
                    <Space direction="vertical" size={2} style={{ width: '100%' }}>
                      {b.description && (
                        <Text style={{ fontSize: 12, color: '#5B4FC2' }}>{b.description}</Text>
                      )}
                      <Text type="secondary" style={{ fontSize: 11 }} copyable>
                        {b.appToken}
                      </Text>
                    </Space>
                  }
                />
              </List.Item>
            )
          }
        />
      )}
    </Card>
  );
}
