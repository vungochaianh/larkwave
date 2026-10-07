'use client';

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { App, Button, Modal, Progress, Table, Tag, Tooltip } from 'antd';
import { DeleteOutlined, ReloadOutlined, CloudServerOutlined } from '@ant-design/icons';
import { accountApi, type StorageBucket, type StorageCategory, type StorageItem, type StorageOrder, type StorageUsage } from './api';
import { BRAND, STORAGE_COLORS, STORAGE_COLOR_FALLBACK, V } from '../theme';
import { useI18n } from '../i18n';
import { PageHeader } from '../kit';

/** Đổi byte sang chuỗi người đọc được. Dùng 1024 vì đây là dung lượng lưu trữ, không phải tốc độ. */
export function formatBytes(n: number): string {
  if (!n) return '0 MB';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v >= 100 || i <= 1 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/**
 * Trang "Dung lượng lưu trữ" — dùng chung cho web và app máy tính.
 *
 * Nguyên tắc: con số phải THẬT. Dung lượng được cộng từ cả hai nơi dữ liệu thực sự nằm (cơ sở dữ
 * liệu và tệp trên máy chủ), và nút xoá phải giải phóng chỗ thật — kể cả tệp trên đĩa — chứ không
 * chỉ giấu bản ghi đi. Một trang báo "đã dọn" mà đĩa không vơi thì tệ hơn là không có trang nào.
 */
export function StorageScreen(): ReactElement {
  const { t } = useI18n();
  const { message, modal } = App.useApp();
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<StorageBucket | null>(null);
  const [items, setItems] = useState<StorageItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [order, setOrder] = useState<StorageOrder | null>(null);
  const [buying, setBuying] = useState(false);

  const load = useCallback(async () => {
    try {
      setUsage(await accountApi.storageUsage());
      setFailed(false);
    } catch {
      // Giữ số liệu cũ nếu có: xoá sạch màn hình khi mất mạng là kiểu lỗi "ẩn cho tới khi tải xong".
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openBucket = async (b: StorageBucket) => {
    setOpen(b);
    setItemsLoading(true);
    try {
      setItems(await accountApi.storageItems(b.category));
    } catch {
      setItems([]);
      message.error(t('storage.loadItemsFailed', 'Không tải được danh sách. Thử lại sau.'));
    } finally {
      setItemsLoading(false);
    }
  };

  const remove = (category: StorageCategory, it: StorageItem) => {
    modal.confirm({
      title: t('storage.confirmTitle', 'Xoá vĩnh viễn?'),
      content: `${it.name} — ${formatBytes(it.bytes)}. ${t(
        'storage.confirmBody',
        'Thao tác này không hoàn tác được.',
      )}`,
      okText: t('storage.confirmOk', 'Xoá'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel', 'Huỷ'),
      onOk: async () => {
        try {
          const r = await accountApi.storageRemove(category, it.id);
          message.success(
            `${t('storage.freed', 'Đã giải phóng')} ${formatBytes(r.freedBytes)}`,
          );
          setItems((prev) => prev.filter((x) => x.id !== it.id));
          void load();
        } catch (e) {
          // Máy chủ từ chối có lý do thật (vd bản dựng đang phục vụ app) — hiện nguyên văn.
          message.error((e as Error)?.message || t('storage.deleteFailed', 'Không xoá được.'));
        }
      },
    });
  };

  const quotaMb = usage ? usage.includedMb + usage.bonusMb : 0;
  // Không giới hạn thì không bao giờ "vượt" — và cũng không hiện thanh phần trăm.
  const over = !!usage && !usage.unlimited && usage.totalBytes > usage.quotaBytes;

  return (
    // Khung trang chung đã lo bề rộng/lề (quy tắc A) — không còn cột 900px riêng.
    <div style={{ width: '100%', paddingBottom: 32 }}>
      <PageHeader
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <CloudServerOutlined style={{ color: BRAND }} /> {t('storage.title', 'Dung lượng lưu trữ')}
          </span>
        }
        description={t('storage.subShort', 'Dữ liệu bạn đang lưu trên Larkwave. Bấm vào từng nhóm để xem chi tiết và xoá thứ không còn cần.')}
        actions={<Button icon={<ReloadOutlined />} onClick={() => void load()}>{t('ui.action.refresh', 'Làm mới')}</Button>}
      />

      {failed && !usage && (
        <div style={{ padding: 14, border: `1px solid ${V.border}`, borderRadius: 10, color: V.textSub }}>
          {t('storage.loadFailed', 'Chưa tải được số liệu (lỗi mạng).')}{' '}
          <a onClick={() => void load()} style={{ color: BRAND }}>
            {t('common.retry', 'Thử lại')}
          </a>
        </div>
      )}

      {usage && (
        <>
          <div
            style={{
              border: `1px solid ${over ? '#EF4444' : V.border}`,
              borderRadius: 14,
              padding: 18,
              background: V.surface,
              marginBottom: 18,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>
                {formatBytes(usage.totalBytes)}
                {!usage.unlimited && (
                  <span style={{ fontSize: 14, fontWeight: 500, color: V.textSub }}>
                    {' / '}
                    {quotaMb >= 1024 ? `${(quotaMb / 1024).toFixed(quotaMb % 1024 ? 1 : 0)} GB` : `${quotaMb} MB`}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13, color: V.textSub }}>
                {usage.unlimited ? (
                  <Tag color="purple" style={{ margin: 0 }}>
                    {t('storage.unlimited', 'Không giới hạn (Admin)')}
                  </Tag>
                ) : (
                  <>
                    {t('storage.included', 'Gói tặng')} {usage.includedMb} MB
                    {usage.bonusMb > 0 ? ` · ${t('storage.bought', 'mua thêm')} ${usage.bonusMb} MB` : ''}
                  </>
                )}
              </div>
            </div>
            {/* Không giới hạn thì KHÔNG có mẫu số, nên thanh phần trăm là vô nghĩa. Nhưng bỏ trống
                chỗ này thì thẻ trông như hỏng — thay bằng thanh THÀNH PHẦN: tỉ trọng giữa các
                nhóm dữ liệu. Nó luôn đầy khung nên không thể bị đọc thành "sắp hết", mà vẫn nói
                đúng một điều quản trị viên cần: dung lượng đang nằm ở đâu. */}
            {usage.unlimited ? (
              usage.totalBytes > 0 && (
                <div style={{ margin: '12px 0 4px' }}>
                  <div className="tw-bar-mix">
                    {usage.buckets
                      .filter((b) => b.bytes > 0)
                      .map((b) => (
                        <i
                          key={b.category}
                          style={{
                            width: `${(b.bytes / usage.totalBytes) * 100}%`,
                            background: STORAGE_COLORS[b.category] ?? STORAGE_COLOR_FALLBACK,
                          }}
                        />
                      ))}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '4px 14px',
                      marginTop: 9,
                      fontSize: 12,
                      color: V.textSub,
                    }}
                  >
                    {usage.buckets
                      .filter((b) => b.bytes > 0)
                      .map((b) => (
                        <span key={b.category} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <i
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 2,
                              background: STORAGE_COLORS[b.category] ?? STORAGE_COLOR_FALLBACK,
                            }}
                          />
                          {b.label} · {formatBytes(b.bytes)}
                        </span>
                      ))}
                  </div>
                </div>
              )
            ) : (
              <Progress
                percent={usage.percentUsed}
                showInfo={false}
                strokeColor={over ? '#EF4444' : BRAND}
                style={{ margin: '10px 0 4px' }}
              />
            )}
            {over && (
              <div style={{ color: '#EF4444', fontSize: 13 }}>
                {t(
                  'storage.over',
                  'Bạn đã vượt hạn mức. Hãy xoá bớt dữ liệu không dùng, hoặc mua thêm dung lượng.',
                )}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              {!usage.unlimited && (
              <Button
                type={over ? 'primary' : 'default'}
                loading={buying}
                onClick={async () => {
                  setBuying(true);
                  try {
                    setOrder(await accountApi.storageBuy(1));
                  } catch (e) {
                    message.error((e as Error)?.message || t('storage.buyFailed', 'Chưa tạo được đơn.'));
                  } finally {
                    setBuying(false);
                  }
                }}
              >
                {t('storage.buy', 'Mua thêm 1 GB — 100.000₫/tháng')}
              </Button>
              )}
              {usage.bonusUntil && (
                <span style={{ fontSize: 12.5, color: V.textSub }}>
                  {t('storage.bonusUntil', 'Phần mua thêm có hiệu lực tới')}{' '}
                  {new Date(usage.bonusUntil).toLocaleDateString('vi-VN')}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            {usage.buckets.map((b) => (
              <div
                key={b.category}
                onClick={() => void openBucket(b)}
                style={{
                  border: `1px solid ${V.border}`,
                  borderRadius: 12,
                  padding: 14,
                  background: V.surfaceAlt,
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600 }}>{b.label}</span>
                  <Tag>{b.count}</Tag>
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, margin: '6px 0 2px' }}>{formatBytes(b.bytes)}</div>
                {b.hint && <div style={{ fontSize: 12, color: V.textFaint, lineHeight: 1.5 }}>{b.hint}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      <Modal
        open={!!order}
        title={t('storage.orderTitle', 'Mua thêm dung lượng')}
        onCancel={() => setOrder(null)}
        footer={null}
        width={420}
      >
        {order && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: V.textSub, fontSize: 13.5, marginTop: 0 }}>
              {t('storage.orderBody', 'Quét mã để chuyển khoản. Dung lượng được cộng ngay khi ngân hàng báo có.')}
            </p>
            {/* Ảnh QR do VietQR sinh — cùng đường mà luồng mua gói đang dùng. */}
            <img src={order.qrUrl} alt="VietQR" style={{ width: 240, maxWidth: '100%', borderRadius: 12 }} />
            <div style={{ marginTop: 10, fontSize: 14 }}>
              <div>
                <b>{order.storageGb} GB</b> · {order.amountVnd.toLocaleString('vi-VN')}₫ /{' '}
                {t('storage.month', 'tháng')}
              </div>
              <div style={{ color: V.textSub, fontSize: 12.5, marginTop: 4 }}>
                {t('storage.transferContent', 'Nội dung chuyển khoản')}: <b>{order.transferContent}</b>
              </div>
              <div style={{ color: V.textFaint, fontSize: 12, marginTop: 6 }}>
                {order.bank.name} · {order.bank.account} · {order.bank.holder}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!open}
        title={open?.label}
        onCancel={() => setOpen(null)}
        footer={null}
        width={720}
      >
        <Table<StorageItem>
          rowKey="id"
          size="small"
          loading={itemsLoading}
          dataSource={items}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          locale={{ emptyText: t('storage.empty', 'Nhóm này chưa có dữ liệu nào.') }}
          columns={[
            { title: t('storage.colName', 'Tên'), dataIndex: 'name', ellipsis: true },
            {
              title: t('storage.colSize', 'Dung lượng'),
              dataIndex: 'bytes',
              width: 110,
              align: 'right',
              render: (n: number) => formatBytes(n),
              sorter: (a, b) => a.bytes - b.bytes,
              defaultSortOrder: 'descend',
            },
            {
              title: '',
              width: 48,
              render: (_, it) =>
                it.lockedReason ? (
                  <Tooltip title={it.lockedReason}>
                    <Button size="small" type="text" icon={<DeleteOutlined />} disabled />
                  </Tooltip>
                ) : (
                  <Button
                    size="small"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => open && remove(open.category, it)}
                  />
                ),
            },
          ]}
        />
      </Modal>
    </div>
  );
}
