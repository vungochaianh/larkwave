'use client';
/**
 * Thẻ TỆP agent vừa dựng — trong hội thoại Lark × Agents.
 *
 * Cho thấy NGAY bên trong có gì (bản xem trước do main đọc lại từ chính tệp: sheet nào, bao nhiêu dòng
 * × cột, vài dòng đầu; Word thì các đoạn đầu; PDF bao nhiêu trang) — người dùng không phải mở tệp mới
 * biết agent làm đủ hay thiếu. Kèm các nút: Mở · Hiện trong thư mục · Lưu về… · Đưa lên Lark ▾
 * (Drive / thành Lark Sheets / thành Lark Docs / đính vào ô Bitable…).
 *
 * Hộp thoại lưu của hệ điều hành CHỈ mở khi người dùng bấm "Lưu về…". Đưa lên Lark chạy ở main bằng
 * phiên Lark web và đọc lại kết quả; link nhận được lưu vào chính mục tệp (đi theo hội thoại).
 */
import { useState } from 'react';
import { App, Button, Dropdown, Input, Modal, Segmented, Space, Tooltip, Typography } from 'antd';
import type { MenuProps } from 'antd';
import {
  CloudUploadOutlined,
  DownOutlined,
  ExportOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  FileWordOutlined,
  FolderOpenOutlined,
  LinkOutlined,
  PaperClipOutlined,
  SaveOutlined,
  TableOutlined,
} from '@ant-design/icons';
import type { LarkFileActionInput, LarkFilePreview, RuntimeAdapter } from '@larkwave/core';
import { accountApi } from '../../account/api';
import { V } from '../../theme';

const { Text } = Typography;

export interface FileCardItem {
  kind: 'file';
  id: string;
  name: string;
  path: string;
  mime: string;
  bytes: number;
  uploadId?: string;
  ts?: number;
  preview?: LarkFilePreview;
  /** Đã đưa lên Lark (link mở được) — lưu cùng hội thoại. */
  larkLinks?: { kind: 'drive_file' | 'sheet' | 'docx'; url: string; at: number; verified?: string }[];
}

const ext = (n: string) => (n.split('.').pop() || '').toLowerCase();

function iconFor(name: string) {
  const e = ext(name);
  if (e === 'xlsx' || e === 'xls' || e === 'csv') return <FileExcelOutlined style={{ fontSize: 22, color: '#1f9d55' }} />;
  if (e === 'docx' || e === 'doc') return <FileWordOutlined style={{ fontSize: 22, color: '#2b6cdf' }} />;
  if (e === 'pdf') return <FilePdfOutlined style={{ fontSize: 22, color: '#d64545' }} />;
  return <FileTextOutlined style={{ fontSize: 22, color: '#6C5CE7' }} />;
}

const sizeText = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

const LINK_LABEL: Record<string, string> = { drive_file: 'Lark Drive', sheet: 'Lark Sheets', docx: 'Lark Docs' };

function PreviewTable({ head }: { head: string[][] }) {
  if (!head.length) return <Text type="secondary" style={{ fontSize: 12 }}>(trống)</Text>;
  return (
    <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 12, color: V.text }}>
        <tbody>
          {head.map((row, r) => (
            <tr key={r} style={{ background: r === 0 ? V.surfaceAlt : undefined }}>
              {row.map((c, k) => (
                <td key={k} style={{ border: `1px solid ${V.borderSub}`, padding: '3px 8px', whiteSpace: 'nowrap', fontWeight: r === 0 ? 600 : 400, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FileCard({
  item,
  runtime,
  onUpdate,
  onAskAgent,
}: {
  item: FileCardItem;
  runtime: RuntimeAdapter;
  /** Ghi đè một phần mục tệp (vd thêm link Lark) — LarkChat lưu cùng hội thoại. */
  onUpdate?: (patch: Partial<FileCardItem>) => void;
  /** Điền sẵn một câu cho agent (vd "đính tệp này vào ô Bitable …") để người dùng hoàn tất. */
  onAskAgent?: (text: string) => void;
}) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [ask, setAsk] = useState<null | { action: 'drive' | 'sheet' | 'doc' }>(null);
  const [folder, setFolder] = useState('');
  const pv = item.preview;
  const e = ext(item.name);
  const canSheet = e === 'xlsx' || e === 'xls' || e === 'csv';
  const canDoc = e === 'docx' || e === 'md' || e === 'txt';
  const hasActions = !!runtime.larkFileAction;

  /** Mở: ưu tiên bản trên máy; không có (mở hội thoại ở máy khác) thì tải bản sao lưu từ máy chủ. */
  const open = async () => {
    setBusy('open');
    try {
      if (runtime.openLocalFile) {
        const r = await runtime.openLocalFile(item.path);
        if (r.ok) return;
        if (!item.uploadId) return void message.error(r.error || 'Không mở được tệp.');
      }
      if (!item.uploadId) return void message.info('Bản này chưa mở được tệp từ hội thoại.');
      const raw = await accountApi.uploadRaw(item.uploadId);
      const bin = atob(raw.dataBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: raw.mime || item.mime }));
      const a = document.createElement('a');
      a.href = url;
      a.download = raw.name || item.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      message.error((err as Error).message || 'Không mở được tệp.');
    } finally {
      setBusy(null);
    }
  };

  const act = async (input: LarkFileActionInput) => {
    if (!runtime.larkFileAction) return;
    setBusy(input.action);
    try {
      const r = await runtime.larkFileAction(input);
      if (input.action === 'reveal') {
        if (!r.ok) message.error(r.error || 'Không mở được thư mục.');
        return;
      }
      if (input.action === 'saveAs') {
        if (r.ok && r.savedTo) message.success(`Đã lưu: ${r.savedTo}`);
        else if (r.error && r.error !== 'cancelled') message.error(r.error);
        return;
      }
      if (r.ok && r.url && r.kind) {
        message.success(`Đã đưa lên ${LINK_LABEL[r.kind]}${r.verified ? ` — ${r.verified}` : ''}`);
        onUpdate?.({ larkLinks: [...(item.larkLinks || []), { kind: r.kind, url: r.url, at: Date.now(), ...(r.verified ? { verified: r.verified } : {}) }] });
      } else message.error(r.error || 'Chưa đưa lên Lark được.');
    } catch (err) {
      message.error((err as Error).message || 'Thao tác thất bại.');
    } finally {
      setBusy(null);
    }
  };

  const larkMenu: MenuProps['items'] = [
    { key: 'drive', icon: <CloudUploadOutlined />, label: 'Lưu lên Lark Drive…' },
    ...(canSheet ? [{ key: 'sheet', icon: <TableOutlined />, label: 'Tạo Lark Sheets từ tệp này…' }] : []),
    ...(canDoc ? [{ key: 'doc', icon: <FileWordOutlined />, label: 'Tạo Lark Docs từ tệp này…' }] : []),
    ...(onAskAgent ? [{ key: 'bitable', icon: <PaperClipOutlined />, label: 'Đính vào ô Bitable…' }] : []),
  ];
  const onLarkMenu: MenuProps['onClick'] = ({ key }) => {
    if (key === 'bitable') {
      onAskAgent?.(`Đính tệp «${item.name}» (đường dẫn: ${item.path}) vào ô Tệp đính kèm của bản ghi … trong bảng … (ghi thêm, không xoá tệp cũ).`);
      return;
    }
    setFolder('');
    setAsk({ action: key as 'drive' | 'sheet' | 'doc' });
  };

  const sheets = pv?.sheets || [];
  const curSheet = sheets[Math.min(sheetIdx, Math.max(0, sheets.length - 1))];
  const rowsShown = expanded ? curSheet?.head : curSheet?.head.slice(0, 5);

  return (
    <div
      data-testid="lark-file-card"
      style={{ alignSelf: 'flex-start', maxWidth: '94%', minWidth: 280, padding: '10px 14px', border: `1px solid ${V.border}`, borderRadius: 12, background: V.surface }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: busy ? 'progress' : 'pointer' }} onClick={busy ? undefined : open}>
        {iconFor(item.name)}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: V.text, wordBreak: 'break-word' }}>{item.name}</div>
          <div style={{ fontSize: 11.5, color: V.textSub }}>
            {sizeText(item.bytes)}
            {pv?.summary ? ` · ${pv.summary}` : ''}
          </div>
        </div>
      </div>

      {pv && (pv.kind === 'xlsx' || pv.kind === 'csv') && curSheet && (
        <div style={{ marginTop: 8 }} data-testid="lark-file-preview">
          {sheets.length > 1 && (
            <Segmented
              size="small"
              value={sheetIdx}
              onChange={(v) => setSheetIdx(Number(v))}
              options={sheets.map((s, i) => ({ value: i, label: `${s.name} (${Math.max(0, s.rows - 1)})` }))}
              style={{ marginBottom: 6, maxWidth: '100%', overflowX: 'auto' }}
            />
          )}
          <PreviewTable head={rowsShown || []} />
          {(curSheet.head.length > 5 || curSheet.rows > curSheet.head.length) && (
            <Button type="link" size="small" style={{ padding: 0, height: 22 }} onClick={() => setExpanded((x) => !x)}>
              {expanded ? 'Thu gọn' : `Xem ${Math.min(10, curSheet.rows)} dòng đầu`}
              {curSheet.rows > 10 ? ` / ${curSheet.rows} dòng` : ''}
            </Button>
          )}
        </div>
      )}
      {pv && (pv.kind === 'docx' || pv.kind === 'text') && !!pv.head?.length && (
        <div data-testid="lark-file-preview" style={{ marginTop: 8, fontSize: 12.5, color: V.textSub, borderLeft: `3px solid ${V.borderSub}`, paddingLeft: 8 }}>
          {(expanded ? pv.head : pv.head.slice(0, 3)).map((p, i) => (
            <div key={i} style={{ marginBottom: 2 }}>
              {p}
            </div>
          ))}
          {pv.head.length > 3 && (
            <Button type="link" size="small" style={{ padding: 0, height: 22 }} onClick={() => setExpanded((x) => !x)}>
              {expanded ? 'Thu gọn' : 'Xem thêm'}
            </Button>
          )}
        </div>
      )}

      {!!item.larkLinks?.length && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {item.larkLinks.map((l, i) => (
            <a
              key={i}
              href={l.url}
              onClick={(ev) => {
                ev.preventDefault();
                runtime.openExternal?.(l.url);
              }}
              style={{ fontSize: 12.5 }}
            >
              <LinkOutlined /> {LINK_LABEL[l.kind]}: {l.url}
            </a>
          ))}
        </div>
      )}

      <Space size={4} wrap style={{ marginTop: 8 }}>
        <Button size="small" icon={<ExportOutlined />} loading={busy === 'open'} onClick={open}>
          Mở
        </Button>
        {hasActions && (
          <>
            <Tooltip title="Mở thư mục chứa tệp trên máy">
              <Button size="small" icon={<FolderOpenOutlined />} loading={busy === 'reveal'} onClick={() => act({ action: 'reveal', path: item.path })}>
                Hiện trong thư mục
              </Button>
            </Tooltip>
            <Button size="small" icon={<SaveOutlined />} loading={busy === 'saveAs'} onClick={() => act({ action: 'saveAs', path: item.path })}>
              Lưu về…
            </Button>
            <Dropdown menu={{ items: larkMenu, onClick: onLarkMenu }} trigger={['click']}>
              <Button size="small" icon={<CloudUploadOutlined />} loading={busy === 'drive' || busy === 'sheet' || busy === 'doc'}>
                Đưa lên Lark <DownOutlined />
              </Button>
            </Dropdown>
          </>
        )}
      </Space>

      <Modal
        open={!!ask}
        title={ask?.action === 'sheet' ? 'Tạo Lark Sheets từ tệp này' : ask?.action === 'doc' ? 'Tạo Lark Docs từ tệp này' : 'Lưu lên Lark Drive'}
        okText={ask?.action === 'drive' ? 'Tải lên' : 'Tạo'}
        cancelText="Huỷ"
        onCancel={() => setAsk(null)}
        onOk={() => {
          const a = ask;
          setAsk(null);
          if (a) void act({ action: a.action, path: item.path, folder: folder.trim() || undefined });
        }}
      >
        <div style={{ fontSize: 13, marginBottom: 6 }}>Thư mục Drive đích (dán link …/drive/folder/…). Bỏ trống = "Không gian của tôi".</div>
        <Input placeholder="https://…/drive/folder/…" value={folder} onChange={(ev) => setFolder(ev.target.value)} />
        <div style={{ fontSize: 12, color: V.textSub, marginTop: 8 }}>
          Chạy bằng phiên Lark web đang đăng nhập; xong sẽ đọc lại để kiểm và hiện link ngay trên thẻ này.
        </div>
      </Modal>
    </div>
  );
}
