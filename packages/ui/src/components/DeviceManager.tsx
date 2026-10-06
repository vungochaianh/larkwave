'use client';
import { useCallback, useEffect, useState } from 'react';
import { App as AntApp, Button, Spin, Tag, Tooltip } from 'antd';
import {
  DesktopOutlined,
  GlobalOutlined,
  LaptopOutlined,
  LogoutOutlined,
  MobileOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { accountApi, type LoginDevice } from '../account/api';
import { useI18n } from '../i18n';
import { V, BRAND } from '../theme';

type TFn = (key: string, fallback?: string, vars?: Record<string, string | number>) => string;

const MAX_DEVICES = 3;

const kindIcon = (k: string) =>
  k === 'phone' ? <MobileOutlined /> : k === 'desktop' ? <LaptopOutlined /> : <GlobalOutlined />;
const kindLabel = (k: string, t: TFn) =>
  k === 'phone'
    ? t('device.kind.phone', 'Điện thoại')
    : k === 'desktop'
      ? t('device.kind.desktop', 'Máy tính (app)')
      : t('device.kind.web', 'Trình duyệt web');

/** "x phút trước" / "hôm nay 14:05" style relative time. */
function relTime(iso: string, t: TFn): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  if (diff < 60_000) return t('device.time.justNow', 'vừa xong');
  if (diff < 3_600_000) return t('device.time.minsAgo', '{n} phút trước', { n: Math.floor(diff / 60_000) });
  if (diff < 86_400_000) return t('device.time.hoursAgo', '{n} giờ trước', { n: Math.floor(diff / 3_600_000) });
  const d = Math.floor(diff / 86_400_000);
  if (d < 30) return t('device.time.daysAgo', '{n} ngày trước', { n: d });
  return new Date(iso).toLocaleDateString('vi-VN');
}

/**
 * Device manager — lists the account's signed-in devices (login sessions) and lets the user log any
 * of them out. Max 3 devices per account: a 4th login automatically boots the least-recently-used
 * one. Shared by the web Settings page and the desktop Settings screen (uses accountApi).
 */
export function DeviceManager() {
  const { t } = useI18n();
  const { message, modal } = AntApp.useApp();
  const [loading, setLoading] = useState(true);
  const [devices, setDevices] = useState<LoginDevice[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await accountApi.listDevices();
      setDevices(r.devices);
      setCurrent(r.current);
    } catch {
      message.error(t('device.loadFailed', 'Không tải được danh sách thiết bị'));
    } finally {
      setLoading(false);
    }
  }, [message, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = (d: LoginDevice) => {
    const isCurrent = d.id === current;
    modal.confirm({
      title: isCurrent
        ? t('device.confirm.titleCurrent', 'Đăng xuất thiết bị NÀY?')
        : t('device.confirm.title', 'Đăng xuất thiết bị này?'),
      icon: null,
      content: isCurrent
        ? t('device.confirm.contentCurrent', 'Bạn sẽ bị đăng xuất khỏi thiết bị đang dùng ngay bây giờ.')
        : t('device.confirm.content', '"{label}" sẽ bị đăng xuất ở lần dùng tiếp theo.', { label: d.label }),
      okText: t('device.confirm.ok', 'Đăng xuất'),
      okButtonProps: { danger: true },
      cancelText: t('device.confirm.cancel', 'Huỷ'),
      onOk: async () => {
        setBusyId(d.id);
        try {
          await accountApi.revokeDevice(d.id);
          message.success(t('device.revoked', 'Đã đăng xuất thiết bị'));
          if (isCurrent && typeof window !== 'undefined') {
            setTimeout(() => window.location.reload(), 600);
            return;
          }
          await load();
        } catch {
          message.error(t('device.revokeFailed', 'Không đăng xuất được'));
        } finally {
          setBusyId(null);
        }
      },
    });
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <DesktopOutlined style={{ color: BRAND, fontSize: 18 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: V.text }}>{t('device.title', 'Thiết bị đăng nhập')}</div>
          <div style={{ fontSize: 12.5, color: V.textSub }}>
            {t('device.limitPrefix', 'Mỗi tài khoản dùng tối đa ')}
            <b>{t('device.limitBold', '{max} thiết bị', { max: MAX_DEVICES })}</b>
            {t('device.limitSuffix', ' (điện thoại + 2 máy tính). Đăng nhập thiết bị thứ 4 sẽ tự đăng xuất thiết bị cũ ít dùng nhất.')}
          </div>
        </div>
        <Tooltip title={t('device.reload', 'Tải lại')}>
          <Button size="small" icon={<ReloadOutlined />} onClick={() => void load()} loading={loading} />
        </Tooltip>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 28 }}>
          <Spin />
        </div>
      ) : devices.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', color: V.textFaint, fontSize: 13 }}>{t('device.empty', 'Chưa có thiết bị nào.')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {devices.map((d) => {
            const isCurrent = d.id === current;
            return (
              <div
                key={d.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '11px 13px',
                  borderRadius: 12,
                  border: `1px solid ${isCurrent ? BRAND : V.border}`,
                  background: isCurrent ? `${BRAND}0d` : V.surface,
                }}
              >
                <span
                  style={{
                    width: 38,
                    height: 38,
                    minWidth: 38,
                    borderRadius: 10,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                    color: BRAND,
                    background: V.surfaceMuted,
                  }}
                >
                  {kindIcon(d.kind)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: V.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.label || kindLabel(d.kind, t)}
                    </span>
                    {isCurrent && <Tag color="purple" style={{ margin: 0 }}>{t('device.thisDevice', 'Thiết bị này')}</Tag>}
                  </div>
                  <div style={{ fontSize: 12, color: V.textSub, marginTop: 2 }}>
                    {kindLabel(d.kind, t)} · {t('device.active', 'Hoạt động')} {relTime(d.lastSeenAt, t)}
                    {d.ip ? ` · ${d.ip}` : ''}
                  </div>
                </div>
                <Button
                  danger
                  size="small"
                  icon={<LogoutOutlined />}
                  loading={busyId === d.id}
                  onClick={() => revoke(d)}
                >
                  {isCurrent ? t('device.btnLogout', 'Đăng xuất') : t('device.btnRemove', 'Gỡ')}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
