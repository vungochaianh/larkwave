'use client';
import { useEffect, useState } from 'react';
import { App, Button, Empty, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { ReloadOutlined, PoweroffOutlined, RedoOutlined, MessageOutlined } from '@ant-design/icons';
import type { RunningPreview } from '@larkwave/core';
import { useRuntime } from '../RuntimeProvider';
import { useRunningPreviews } from '../useRunningPreviews';
import { V } from '../theme';

function svcColor(name?: string): string {
  if (!name) return 'default';
  if (/api/i.test(name)) return 'geekblue';
  if (/cms|admin/i.test(name)) return 'gold';
  return 'green';
}

/** Restart is bundled in the preload, so a code-pushed renderer can meet an older main process.
 *  `ipcAdapter.restartPreview` rejects with exactly this string when the channel is missing. */
const NEEDS_INSTALL = 'Cần bản cài mới (.dmg).';

/** Global "running sites/ports" manager — every dev server across ALL apps (home/cms/api), with a
 *  Stop / Restart / open-the-conversation for each (and per-app stop-all). Data + kill go through
 *  the main-process preview registry; the poll itself is shared with the header badge. */
export function RunningPreviews({
  currentAppId,
  onOpenApp,
  appNames,
}: {
  currentAppId?: string;
  /** Jump to the app's conversation — on desktop an app IS its conversation, so the registry
   *  key is the tab key. Hidden when the host has nowhere to jump to. */
  onOpenApp?: (appId: string) => void;
  /** id → project name, when the host already has the list. Omitted → we load it ourselves. */
  appNames?: Record<string, string>;
}) {
  const runtime = useRuntime();
  const { message } = App.useApp();
  const { rows, loading, reload } = useRunningPreviews();
  const [busy, setBusy] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});

  // Raw ids ("app-mslcazpa") are unreadable — resolve the project names unless the host passed them.
  useEffect(() => {
    if (appNames) return;
    let alive = true;
    runtime
      .listApps()
      .then((list) => {
        if (alive) setNames(Object.fromEntries(list.map((a) => [a.id, a.name])));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [runtime, appNames]);

  const keyOf = (appId: string, service?: string) => appId + '::' + (service || '*');
  const nameOf = (appId: string) => appNames?.[appId] || names[appId] || '';

  const stop = async (appId: string, service?: string) => {
    setBusy(keyOf(appId, service));
    try {
      await runtime.stopPreview?.(appId, service);
      message.success('Đã dừng.');
      await reload();
    } catch (e) {
      message.error((e as Error)?.message || 'Không dừng được.');
    } finally {
      setBusy(null);
    }
  };

  const restart = async (appId: string, service?: string) => {
    setBusy(keyOf(appId, service));
    try {
      try {
        if (!runtime.restartPreview) throw new Error(NEEDS_INSTALL);
        await runtime.restartPreview(appId, service);
      } catch (e) {
        // Older installed main process: compose the restart in the renderer instead. It reboots the
        // WHOLE workspace (there is no start-one-service), so the api may land on a new port.
        if ((e as Error)?.message !== NEEDS_INSTALL) throw e;
        await runtime.stopPreview?.(appId, service);
        await runtime.preview(appId, 'desktop');
      }
      message.success('Đã khởi động lại.');
      await reload();
    } catch (e) {
      message.error((e as Error)?.message || 'Không khởi động lại được.');
    } finally {
      setBusy(null);
    }
  };

  const apps = Array.from(new Set(rows.map((r) => r.appId)));

  const columns: TableColumnsType<RunningPreview> = [
    {
      title: 'Dự án',
      dataIndex: 'appId',
      render: (v: string) => {
        const name = nameOf(v);
        return (
          <div style={{ lineHeight: 1.3, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: V.text }}>
              {name || v}
              {v === currentAppId ? <Tag color="purple" style={{ marginLeft: 6 }}>hiện tại</Tag> : null}
            </div>
            {name ? <div style={{ fontSize: 11, color: V.textFaint }}>{v}</div> : null}
          </div>
        );
      },
    },
    { title: 'Dịch vụ', dataIndex: 'service', width: 96, render: (v?: string) => <Tag color={svcColor(v)} style={{ margin: 0 }}>{v || 'app'}</Tag> },
    {
      title: 'Cổng',
      dataIndex: 'port',
      width: 132,
      // Expo in QR mode has no local http URL (Metro serves the phone over exp://), so there is
      // nothing to show or copy — say so instead of rendering an empty cell with a copy button
      // that puts an empty string on the clipboard.
      render: (v: number, r: RunningPreview) =>
        r.url ? (
          <Typography.Text copyable={{ text: r.url, tooltips: ['Sao chép', 'Đã sao chép'] }} style={{ fontSize: 12 }}>
            {v || r.url.replace(/^https?:\/\//, '')}
          </Typography.Text>
        ) : (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>Expo (QR)</Typography.Text>
        ),
    },
    {
      title: '',
      key: 'act',
      width: 132,
      render: (_: unknown, r: RunningPreview) => {
        const spinning = busy === keyOf(r.appId, r.service);
        return (
          <Space size={4}>
            {onOpenApp && (
              <Tooltip title="Mở hội thoại">
                <Button
                  size="small"
                  aria-label="Mở hội thoại"
                  icon={<MessageOutlined />}
                  onClick={() => onOpenApp(r.appId)}
                />
              </Tooltip>
            )}
            <Tooltip title="Khởi động lại">
              <Button
                size="small"
                aria-label="Khởi động lại"
                icon={<RedoOutlined />}
                loading={spinning}
                onClick={() => void restart(r.appId, r.service)}
              />
            </Tooltip>
            <Tooltip title="Dừng">
              <Button
                size="small"
                danger
                aria-label="Dừng"
                icon={<PoweroffOutlined />}
                loading={spinning}
                onClick={() => void stop(r.appId, r.service)}
              />
            </Tooltip>
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 10 }} wrap>
        <Button size="small" icon={<ReloadOutlined />} onClick={() => void reload()} loading={loading}>Làm mới</Button>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{rows.length} dịch vụ đang chạy (mọi app)</Typography.Text>
        {apps.length > 1 &&
          apps.map((a) => (
            <Button key={a} size="small" danger onClick={() => void stop(a)} loading={busy === keyOf(a)}>
              Dừng hết: {nameOf(a) || a}
            </Button>
          ))}
      </Space>
      {rows.length === 0 && !loading ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có dev server nào đang chạy." />
      ) : (
        <Table
          rowKey={(r) => r.appId + '::' + (r.service || '') + ':' + r.port}
          columns={columns}
          dataSource={rows}
          size="small"
          pagination={false}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: 'Không có dev server nào đang chạy.' }}
        />
      )}
    </div>
  );
}
