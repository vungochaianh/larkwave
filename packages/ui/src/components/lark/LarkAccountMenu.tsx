'use client';
import { useCallback, useEffect, useState } from 'react';
import { App, Button, Dropdown, Tooltip, type MenuProps } from 'antd';
import { CheckOutlined, LogoutOutlined, PlusOutlined, UserOutlined } from '@ant-design/icons';
import type { LarkWebAccounts, RuntimeAdapter } from '@larkwave/core';
import { useI18n } from '../../i18n';

/** Tên ngắn của tenant: https://abc.sg.larksuite.com → abc. */
function tenantOf(host?: string): string {
  if (!host) return '';
  try {
    return new URL(host).hostname.split('.')[0];
  } catch {
    return host;
  }
}

/**
 * Tài khoản LARK web trên thanh khung Lark: ai đang đăng nhập, chuyển qua lại giữa các tài khoản đã
 * đăng nhập trên máy, thêm tài khoản (mở trang đăng nhập QR ngay trong khung), đăng xuất cái đang dùng.
 * Mỗi tài khoản một kho cookie nên chuyển không phải đăng nhập lại; đổi tài khoản áp dụng cho mọi tab.
 */
export function LarkAccountMenu({
  runtime,
  connected,
  host,
  onChanged,
}: {
  runtime: RuntimeAdapter;
  connected: boolean;
  host?: string;
  /** Sau khi đổi tài khoản — khung đọc lại trạng thái. */
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const { message, modal } = App.useApp();
  const [acc, setAcc] = useState<LarkWebAccounts | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!runtime.larkWebAccounts) return;
    try {
      setAcc(await runtime.larkWebAccounts());
    } catch {
      /* giữ danh sách cũ */
    }
  }, [runtime]);
  // Đăng nhập xong / đổi tenant → đọc lại (tên người dùng chỉ biết sau khi đăng nhập).
  useEffect(() => {
    void load();
  }, [load, connected, host]);

  const run = async (fn: () => Promise<LarkWebAccounts>, done?: string) => {
    setBusy(true);
    try {
      setAcc(await fn());
      if (done) message.success(done);
    } catch (e) {
      message.error(String((e as Error)?.message || e));
    } finally {
      setBusy(false);
      onChanged();
    }
  };

  if (!runtime.larkWebAccounts) return null;
  const cur = acc?.accounts.find((a) => a.active);
  const label = (a?: { name?: string; host?: string }) => a?.name || tenantOf(a?.host) || t('larkAcc.notLoggedIn', 'Chưa đăng nhập');
  const curLabel = connected ? label(cur) : t('larkAcc.menu', 'Tài khoản Lark');

  const items: MenuProps['items'] = [
    { key: '__title', type: 'group', label: t('larkAcc.groupTitle', 'Tài khoản Lark trên máy này (áp dụng cho mọi tab)') },
    ...(acc?.accounts || []).map((a) => ({
      key: `acc:${a.id}`,
      icon: a.active ? <CheckOutlined /> : <UserOutlined />,
      label: (
        <span>
          {label(a)}
          {a.host && a.name ? <span style={{ opacity: 0.6, marginLeft: 6, fontSize: 12 }}>{tenantOf(a.host)}</span> : null}
        </span>
      ),
      disabled: a.active,
    })),
    { type: 'divider' },
    { key: 'add', icon: <PlusOutlined />, label: t('larkAcc.add', 'Thêm tài khoản Lark') },
    ...(connected || cur?.host ? [{ key: 'logout', icon: <LogoutOutlined />, danger: true, label: t('larkAcc.logout', 'Đăng xuất') + (cur ? ` «${label(cur)}»` : '') }] : []),
  ];

  const onClick: MenuProps['onClick'] = ({ key }) => {
    if (key.startsWith('acc:')) {
      const id = key.slice(4);
      const a = acc?.accounts.find((x) => x.id === id);
      void run(() => runtime.larkWebSwitchAccount!(id), t('larkAcc.switched', 'Đã chuyển sang {name}', { name: label(a) }));
    } else if (key === 'add') {
      void run(() => runtime.larkWebAddAccount!(), t('larkAcc.addHint', 'Quét mã QR trong khung Lark để đăng nhập tài khoản mới.'));
    } else if (key === 'logout') {
      modal.confirm({
        title: t('larkAcc.logoutConfirmTitle', 'Đăng xuất {name}?', { name: label(cur) }),
        content: t(
          'larkAcc.logoutConfirmBody',
          'Larkwave xoá phiên đăng nhập của tài khoản này trên máy (Lark không bị ảnh hưởng). Các tab đang mở chuyển sang tài khoản Lark còn lại, hoặc cần đăng nhập lại.',
        ),
        okText: t('larkAcc.logout', 'Đăng xuất'),
        okButtonProps: { danger: true },
        cancelText: t('common.cancel', 'Huỷ'),
        onOk: () => run(() => runtime.larkWebLogout!(), t('larkAcc.loggedOut', 'Đã đăng xuất tài khoản Lark.')),
      });
    }
  };

  return (
    <Dropdown menu={{ items, onClick }} trigger={['click']} placement="bottomRight">
      <Tooltip title={cur?.host ? `${label(cur)} · ${cur.host}` : t('larkAcc.menu', 'Tài khoản Lark')}>
        <Button size="small" type="text" icon={<UserOutlined />} loading={busy} data-testid="wf-lark-account" style={{ maxWidth: 150 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110, display: 'inline-block', verticalAlign: 'bottom' }}>{curLabel}</span>
        </Button>
      </Tooltip>
    </Dropdown>
  );
}
