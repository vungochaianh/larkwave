'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { App as AntApp, Button, Empty, Input, Popconfirm, Skeleton, Tag, Tooltip } from 'antd';
import { DeleteOutlined, FileOutlined, FolderOpenOutlined, ReloadOutlined } from '@ant-design/icons';
import type { RuntimeAdapter } from '@larkwave/core';
import { V } from '../../theme';
import { PageHeader } from '../../kit';
import { AttachmentPreview, type PreviewableAttachment } from '../AttachmentPreview';

interface Group {
  convId: string;
  title: string;
  files: { name: string; size: number; mtime: number }[];
}

const MIME_BY_EXT: Record<string, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  csv: 'text/csv',
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
};
const mimeOf = (name: string) => MIME_BY_EXT[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';

function human(n: number): string {
  if (n < 1024) return `${n} B`;
  const u = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
}

/**
 * Kho tệp của Lark Agents — CHỈ trên máy này.
 *
 * Tệp bạn đính kèm vào hội thoại được ghi vào thư mục làm việc của chính hội thoại đó và ở lại
 * đấy (agent còn phải đọc lại ở các lượt sau). Trước màn hình này thì chúng vô hình: không biết
 * đang chiếm bao nhiêu, không xoá được cái nào, và cũng không xem lại được mình đã gửi gì.
 *
 * Gom theo HỘI THOẠI chứ không phải một danh sách phẳng — người ta nhớ tệp qua cuộc trò chuyện
 * đã gửi nó, không qua tên tệp.
 */
export function LarkFilesScreen({ runtime }: { runtime: RuntimeAdapter }) {
  const { message } = AntApp.useApp();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [q, setQ] = useState('');
  const [preview, setPreview] = useState<PreviewableAttachment | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!runtime.larkListFiles) {
      setGroups([]);
      return;
    }
    try {
      setGroups((await runtime.larkListFiles()) as Group[]);
    } catch {
      setGroups([]);
    }
  }, [runtime]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle || !groups) return groups ?? [];
    return groups
      .map((g) => ({ ...g, files: g.files.filter((f) => f.name.toLowerCase().includes(needle)) }))
      .filter((g) => g.files.length > 0 || g.title.toLowerCase().includes(needle));
  }, [groups, q]);

  const totals = useMemo(() => {
    const all = (groups ?? []).flatMap((g) => g.files);
    return { count: all.length, bytes: all.reduce((s, f) => s + f.size, 0) };
  }, [groups]);

  const open = async (convId: string, name: string) => {
    setBusy(true);
    try {
      const r = await runtime.larkReadFile?.(convId, name);
      if (!r) {
        message.error('Không mở được tệp (quá lớn hoặc đã bị xoá).');
        return;
      }
      const mime = mimeOf(name);
      setPreview({ name, mime, dataBase64: r.dataBase64, isImage: mime.startsWith('image/') });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (convId: string, name: string) => {
    const r = await runtime.larkDeleteFile?.(convId, name);
    if (!r?.ok) {
      message.error('Chưa xoá được tệp.');
      return;
    }
    setGroups((prev) =>
      (prev ?? [])
        .map((g) => (g.convId === convId ? { ...g, files: g.files.filter((f) => f.name !== name) } : g))
        .filter((g) => g.files.length > 0),
    );
  };

  return (
    <div style={{ width: '100%', paddingBottom: 32 }}>
      <PageHeader
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><FolderOpenOutlined style={{ color: '#6C5CE7' }} /> Tệp đã gửi cho Lark Agents</span>}
        description="Tệp đính kèm được giữ trên MÁY NÀY để trợ lý đọc lại ở các lượt sau. Xoá ở đây là xoá hẳn khỏi đĩa."
        actions={<Button icon={<ReloadOutlined />} onClick={() => void load()}>Làm mới</Button>}
      />

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <Input.Search
          placeholder="Tìm theo tên tệp…"
          allowClear
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        {groups && (
          <Tag color="purple">
            {totals.count} tệp · {human(totals.bytes)}
          </Tag>
        )}
      </div>

      {groups === null ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : filtered.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có tệp nào được gửi" />
      ) : (
        filtered.map((g) => (
          <div key={g.convId} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: V.textSub, marginBottom: 6 }}>
              {g.title} · {g.files.length} tệp
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {g.files.map((f) => (
                <div
                  key={f.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    border: `1px solid ${V.border}`,
                    borderRadius: 10,
                    background: V.surface,
                  }}
                >
                  <FileOutlined style={{ color: V.textFaint }} />
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={() => void open(g.convId, f.name)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                      textDecoration: 'underline dotted',
                    }}
                  >
                    {f.name}
                  </span>
                  <span style={{ fontSize: 12, color: V.textFaint, whiteSpace: 'nowrap' }}>{human(f.size)}</span>
                  <span style={{ fontSize: 12, color: V.textFaint, whiteSpace: 'nowrap' }}>
                    {new Date(f.mtime).toLocaleDateString('vi-VN')}
                  </span>
                  <Popconfirm
                    title="Xoá tệp này?"
                    description="Xoá hẳn khỏi máy. Trợ lý sẽ không đọc lại được nữa."
                    okText="Xoá"
                    okButtonProps={{ danger: true }}
                    cancelText="Huỷ"
                    onConfirm={() => void remove(g.convId, f.name)}
                  >
                    <Tooltip title="Xoá">
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} loading={busy} />
                    </Tooltip>
                  </Popconfirm>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      <AttachmentPreview att={preview} open={!!preview} onClose={() => setPreview(null)} />
    </div>
  );
}
