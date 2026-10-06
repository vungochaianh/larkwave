'use client';
import { useEffect, useState } from 'react';
import { App, Button, Card, Empty, Input, List, Space, Switch, Tag, Tooltip, Typography } from 'antd';
import {
  AppstoreAddOutlined,
  PlusOutlined,
  DeleteOutlined,
  SafetyCertificateFilled,
  WarningOutlined,
} from '@ant-design/icons';
import type { PluginInfo, RuntimeAdapter } from '@larkwave/core';
import { useI18n } from '../../i18n';

const { Text } = Typography;

/**
 * Install / enable / remove curated plugins. A plugin is a manifest.json that
 * adds Lark tools (permission-scoped) to Claude — pure data, never executable
 * code — so it can extend the app post-build without an arbitrary-code-execution
 * risk. Unsigned plugins install with a warning; signed = verified publisher.
 */
export function PluginsPanel({ runtime }: { runtime: RuntimeAdapter }) {
  const { t } = useI18n();
  const { message } = App.useApp();
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [path, setPath] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    runtime.listPlugins?.().then(setPlugins).catch(() => setPlugins([]));
  }, [runtime]);

  const install = async () => {
    const p = path.trim();
    if (!p) return;
    setBusy(true);
    try {
      setPlugins(await runtime.installPlugin!(p));
      setPath('');
      message.success(t('chat.pluginInstalled', 'Đã cài plugin.'));
    } catch (e) {
      message.error((e as Error)?.message || t('chat.pluginInstallFailed', 'Cài plugin thất bại.'));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (id: string, enabled: boolean) => {
    try {
      setPlugins(await runtime.setPluginEnabled!(id, enabled));
    } catch (e) {
      message.error((e as Error)?.message || t('chat.pluginToggleFailed', 'Không đổi được trạng thái.'));
    }
  };

  const remove = async (id: string) => {
    try {
      setPlugins(await runtime.uninstallPlugin!(id));
    } catch {
      /* ignore */
    }
  };

  return (
    <Card
      size="small"
      title={
        <span>
          <AppstoreAddOutlined /> Plugin
        </span>
      }
      extra={
        <Tooltip title={t('chat.pluginTooltip', 'Cài thêm tool Lark cho Claude từ một manifest.json (chỉ là dữ liệu, không chạy code tuỳ ý)')}>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {t('chat.pluginUpgradeLabel', 'nâng cấp hệ thống')}
          </Text>
        </Tooltip>
      }
    >
      <Space.Compact style={{ width: '100%', marginBottom: 8 }}>
        <Input
          placeholder={t('chat.pluginPathPlaceholder', 'Đường dẫn tới manifest.json')}
          value={path}
          onChange={(e) => setPath(e.target.value)}
          onPressEnter={install}
        />
        <Button type="primary" icon={<PlusOutlined />} loading={busy} onClick={install} />
      </Space.Compact>
      {plugins.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('chat.pluginEmpty', 'Chưa có plugin')} />
      ) : (
        <List
          size="small"
          dataSource={plugins}
          renderItem={(p) => (
            <List.Item
              actions={[
                <Switch key="s" size="small" checked={p.enabled} onChange={(v) => toggle(p.id, v)} />,
                <Button
                  key="d"
                  type="text"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() => remove(p.id)}
                />,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space size={6}>
                    <Text style={{ fontSize: 13 }}>{p.name}</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      v{p.version}
                    </Text>
                    {p.signed ? (
                      <Tag color="success" icon={<SafetyCertificateFilled />} style={{ fontSize: 10 }}>
                        {t('chat.signed', 'đã ký')}
                      </Tag>
                    ) : (
                      <Tag color="warning" icon={<WarningOutlined />} style={{ fontSize: 10 }}>
                        {t('chat.unsigned', 'chưa ký')}
                      </Tag>
                    )}
                  </Space>
                }
                description={
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {p.toolCount ?? 0} tool · {(p.permissions ?? []).join(', ')}
                  </Text>
                }
              />
            </List.Item>
          )}
        />
      )}
    </Card>
  );
}
