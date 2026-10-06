'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { App as AntApp, Button, Empty, Input, Segmented, Spin, Table, Tag, Tooltip } from 'antd';
import { DeleteOutlined, DownloadOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import { accountApi, ApiError, type UploadListItem } from '../account/api';
import { AttachmentPreview } from './AttachmentPreview';
import { useI18n } from '../i18n';
import { V, BRAND, OK, WARN, ERR, BLUE } from '../theme';

/** Số ngày giữ tệp — phải khớp RETENTION_DAYS ở apps/api/src/uploads/uploads.service.ts. */
const RETENTION_DAYS = 30;

const fmtSize = (n: number): string => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/** Còn bao nhiêu ngày nữa thì bị xoá (âm = đã quá hạn). */
const daysLeft = (iso: string): number => Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);

type Filter = 'all' | 'image' | 'doc' | 'expired';

const extOf = (name: string): string => (name.split('.').pop() || '').toLowerCase();

/** base64 → tải về máy. Không dùng link trực tiếp vì endpoint cần header Authorization. */
function saveBase64(dataBase64: string, name: string, mime: string): void {
  const bin = atob(dataBase64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime || 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name || 'file';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * "Tệp đã tải lên" — mọi tệp người dùng đã gửi lên, xem lại và tải về.
 *
 * Nguồn là MÁY CHỦ, không phải thư viện IndexedDB của trình duyệt: thư viện đó chỉ có trên đúng
 * một máy và một trình duyệt, nên không trả lời được câu hỏi "tôi đã gửi những gì". Đổi lại, danh
 * sách này chỉ có tệp đi qua máy chủ — bản desktop chạy CLI cục bộ ghi thẳng ra ổ đĩa, nên tệp
 * đính kèm ở đó sẽ không xuất hiện; màn hình nói rõ điều này thay vì để trống một cách khó hiểu.
 */
export function UploadsScreen() {
  const { t: tr } = useI18n();
  const { message, modal } = AntApp.useApp();
  const [rows, setRows] = useState<UploadListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ name: string; mime: string; dataBase64: string; isImage: boolean; uploadId: string } | null>(null);

  const load = useCallback(
    async (more = false) => {
      setLoading(true);
      setFailed(null);
      try {
        const page = await accountApi.listUploads({ limit: 50, ...(more && cursor ? { cursor } : {}) });
        setRows((prev) => (more ? [...prev, ...page.items] : page.items));
        setCursor(page.nextCursor);
      } catch (e) {
        setFailed((e as Error).message || tr('files.loadFailed', 'Không tải được danh sách tệp.'));
      } finally {
        setLoading(false);
      }
    },
    [cursor, tr],
  );

  useEffect(() => {
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (needle && !r.name.toLowerCase().includes(needle)) return false;
      if (filter === 'image') return r.kind === 'image';
      if (filter === 'doc') return r.kind !== 'image';
      if (filter === 'expired') return r.expired;
      return true;
    });
  }, [rows, filter, q]);

  const download = async (r: UploadListItem) => {
    setBusyId(r.id);
    try {
      const f = await accountApi.uploadRaw(r.id);
      saveBase64(f.dataBase64, f.name, f.mime);
    } catch (e) {
      // 410 = tệp từng tồn tại và đã bị xoá theo hạn. Thông điệp của máy chủ đã nói rõ lý do,
      // nên hiện nguyên văn thay vì thay bằng một câu chung chung.
      message.error((e as ApiError).message || tr('files.downloadFailed', 'Không tải được tệp.'));
      if ((e as ApiError).statusCode === 410) void load(false); // hàng đã đổi trạng thái → nạp lại
    } finally {
      setBusyId(null);
    }
  };

  const openPreview = async (r: UploadListItem) => {
    setBusyId(r.id);
    try {
      const f = await accountApi.uploadRaw(r.id);
      setPreview({ name: f.name, mime: f.mime, dataBase64: f.dataBase64, isImage: r.kind === 'image', uploadId: r.id });
    } catch (e) {
      message.error((e as ApiError).message || tr('files.previewFailed', 'Không xem được tệp.'));
      if ((e as ApiError).statusCode === 410) void load(false);
    } finally {
      setBusyId(null);
    }
  };

  const remove = (r: UploadListItem) => {
    modal.confirm({
      title: tr('files.deleteTitle', 'Xoá tệp này?'),
      content: tr('files.deleteBody', '"{name}" sẽ bị xoá vĩnh viễn. Không khôi phục được.', { name: r.name }),
      okText: tr('files.delete', 'Xoá'),
      okButtonProps: { danger: true },
      cancelText: tr('files.cancel', 'Huỷ'),
      onOk: async () => {
        await accountApi.deleteUpload(r.id);
        setRows((prev) => prev.filter((x) => x.id !== r.id));
      },
    });
  };

  const columns = [
    {
      title: tr('files.name', 'Tên tệp'),
      dataIndex: 'name',
      render: (_: unknown, r: UploadListItem) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
          <span
            style={{
              flex: '0 0 auto', width: 30, height: 30, borderRadius: 8, display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700,
              background: `${r.kind === 'image' ? BRAND : r.kind === 'pdf' ? ERR : BLUE}1f`,
              color: r.kind === 'image' ? BRAND : r.kind === 'pdf' ? ERR : BLUE,
              textTransform: 'uppercase', opacity: r.expired ? 0.45 : 1,
            }}
          >
            {extOf(r.name).slice(0, 4) || '?'}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: r.expired ? V.textFaint : V.text, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: r.expired ? 'line-through' : undefined }}>
              {r.name}
            </div>
            <div style={{ color: V.textFaint, fontSize: 11.5 }}>{fmtSize(r.size)} · {fmtDate(r.createdAt)}</div>
          </div>
        </div>
      ),
    },
    {
      title: tr('files.status', 'Hạn lưu'),
      dataIndex: 'expiresAt',
      width: 190,
      render: (_: unknown, r: UploadListItem) => {
        if (r.expired) return <Tag color="default">{tr('files.expired', 'Đã xoá — hết hạn')}</Tag>;
        // Không có hạn = tệp KHÔNG thuộc diện tự dọn (ảnh báo lỗi, ảnh nguồn marketing). Nói thẳng,
        // vì trước đây chúng hiện một ngày xoá không bao giờ tới và người dùng chờ vô ích.
        if (!r.expiresAt) {
          return (
            <Tooltip title={tr('files.keptForeverTip', 'Tệp này không tự xoá. Bạn có thể xoá thủ công bất cứ lúc nào.')}>
              <span style={{ color: V.textSub, fontSize: 12.5 }}>{tr('files.keptForever', 'Giữ vĩnh viễn')}</span>
            </Tooltip>
          );
        }
        const d = daysLeft(r.expiresAt);
        // Cảnh báo sớm ở 7 ngày: đủ để người dùng kịp tải về thứ họ còn cần.
        const color = d <= 3 ? ERR : d <= 7 ? WARN : OK;
        return (
          <Tooltip title={tr('files.willDelete', 'Tự động xoá lúc {when}', { when: fmtDate(r.expiresAt) })}>
            <span style={{ color, fontSize: 12.5 }}>
              {d <= 0 ? tr('files.expiringNow', 'Sắp bị xoá') : tr('files.daysLeft', 'còn {n} ngày', { n: String(d) })}
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: '',
      width: 140,
      align: 'right' as const,
      render: (_: unknown, r: UploadListItem) => (
        <div style={{ display: 'inline-flex', gap: 2 }}>
          <Tooltip
            title={
              r.expired
                ? tr('files.expiredTip', 'Tệp đã bị xoá vì quá {n} ngày', { n: String(RETENTION_DAYS) })
                : r.downloadable
                  ? tr('files.preview', 'Xem trước')
                  : tr('files.noOriginal', 'Tệp này tải lên trước khi hệ thống lưu bản gốc')
            }
          >
            {/* span bọc ngoài để Tooltip vẫn hiện khi nút bị vô hiệu hoá — đúng lúc người dùng
                cần biết TẠI SAO không bấm được. */}
            <span>
              <Button type="text" size="small" icon={<EyeOutlined />} disabled={!r.downloadable} loading={busyId === r.id} onClick={() => void openPreview(r)} />
            </span>
          </Tooltip>
          <Tooltip title={tr('files.download', 'Tải xuống')}>
            <span>
              <Button type="text" size="small" icon={<DownloadOutlined />} disabled={!r.downloadable} loading={busyId === r.id} onClick={() => void download(r)} />
            </span>
          </Tooltip>
          <Tooltip title={tr('files.delete', 'Xoá')}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => remove(r)} />
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '18px 20px 28px', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 20, color: V.text, flex: 1, minWidth: 180 }}>
          {tr('files.title', 'Tệp đã tải lên')}
        </h2>
        <Button size="small" icon={<ReloadOutlined />} onClick={() => void load(false)} loading={loading}>
          {tr('files.refresh', 'Làm mới')}
        </Button>
      </div>
      <p style={{ margin: '0 0 14px', color: V.textSub, fontSize: 13 }}>
        {tr('files.subtitle', 'Tệp bạn gửi kèm trong hội thoại được giữ {n} ngày, sau đó hệ thống tự xoá.', { n: String(RETENTION_DAYS) })}
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <Segmented
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          options={[
            { label: tr('files.all', 'Tất cả'), value: 'all' },
            { label: tr('files.images', 'Ảnh'), value: 'image' },
            { label: tr('files.docs', 'Tài liệu'), value: 'doc' },
            { label: tr('files.expiredTab', 'Đã hết hạn'), value: 'expired' },
          ]}
        />
        <Input.Search
          allowClear
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tr('files.search', 'Tìm theo tên tệp')}
          style={{ maxWidth: 260 }}
        />
      </div>

      {failed ? (
        <div style={{ color: ERR, fontSize: 13 }}>{failed}</div>
      ) : loading && !rows.length ? (
        <div style={{ padding: '48px 0', textAlign: 'center' }}><Spin /></div>
      ) : !rows.length ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <span style={{ color: V.textSub, fontSize: 13 }}>
              {tr('files.empty', 'Chưa có tệp nào. Tệp bạn đính kèm khi trò chuyện sẽ xuất hiện ở đây.')}
            </span>
          }
        />
      ) : (
        <>
          <Table
            size="small"
            rowKey="id"
            columns={columns}
            dataSource={shown}
            pagination={false}
            showHeader
          />
          {cursor && (
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <Button size="small" loading={loading} onClick={() => void load(true)}>
                {tr('files.loadMore', 'Tải thêm')}
              </Button>
            </div>
          )}
        </>
      )}

      <AttachmentPreview
        att={preview ? { name: preview.name, mime: preview.mime, dataBase64: preview.dataBase64, isImage: preview.isImage, uploadId: preview.uploadId } : null}
        open={!!preview}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}
