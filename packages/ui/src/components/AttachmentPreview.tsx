'use client';
import { useEffect, useMemo, useState } from 'react';
import { App as AntApp, Modal, Segmented, Spin } from 'antd';
import { accountApi } from '../account/api';
import { useI18n } from '../i18n';
import { V, BRAND } from '../theme';
import { parseSheets, columnLabel, type ParsedSheet } from './sheetText';

/** The minimum an attachment needs to be previewable here. */
export interface PreviewableAttachment {
  name: string;
  mime: string;
  /** Raw file bytes, base64, as the composer holds them before sending. */
  dataBase64: string;
  isImage: boolean;
  /** Set once the file has been uploaded, so we don't upload it twice to preview it. */
  uploadId?: string;
}

/** Text-ish types the browser can decode on its own — no round-trip needed. */
const TEXT_LIKE = /^(text\/|application\/(json|xml|x-yaml|yaml|javascript|typescript|sql))/i;
/** Office documents: the browser cannot read these (they are zip archives), but the SERVER already
 *  extracted their text at upload time, so we fetch that instead of trying to parse here. */
const OFFICE_EXT = /\.(xlsx|xls|docx|doc|pptx|ppt|csv)$/i;

/** base64 → string, tolerating the UTF-8 the browser's atob() does not decode by itself. */
function decodeBase64Text(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

/** base64 → File, so an office doc can be uploaded on demand to read its extracted text. */
function toFile(att: PreviewableAttachment): File {
  const bin = atob(att.dataBase64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], att.name || 'file', { type: att.mime || '' });
}

/** Bảng tính dựng lại: tiêu đề cột A/B/C, số hàng, hàng đầu dính khi cuộn — như mở trong Excel. */
function SheetTable({ sheet }: { sheet: ParsedSheet }) {
  const width = Math.max(...sheet.rows.map((r) => r.length));
  const cols = Array.from({ length: width }, (_, i) => i);
  const th: React.CSSProperties = {
    position: 'sticky',
    top: 0,
    zIndex: 1,
    background: V.surfaceMuted,
    borderRight: `1px solid ${V.border}`,
    borderBottom: `1px solid ${V.border}`,
    padding: '4px 8px',
    fontWeight: 600,
    color: V.textFaint,
    fontSize: 11,
    textAlign: 'center',
  };
  return (
    <div style={{ overflow: 'auto', maxHeight: '56vh', border: `1px solid ${V.border}`, borderRadius: 10 }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 12.5, tableLayout: 'auto', minWidth: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...th, left: 0, zIndex: 2, minWidth: 34 }} />
            {cols.map((c) => (
              <th key={c} style={th}>
                {columnLabel(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sheet.rows.map((row, r) => (
            <tr key={r}>
              <td
                style={{
                  position: 'sticky',
                  left: 0,
                  background: V.surfaceMuted,
                  borderRight: `1px solid ${V.border}`,
                  borderBottom: `1px solid ${V.border}`,
                  padding: '3px 8px',
                  color: V.textFaint,
                  fontSize: 11,
                  textAlign: 'right',
                  whiteSpace: 'nowrap',
                }}
              >
                {r + 1}
              </td>
              {cols.map((c) => {
                const v = row[c] ?? '';
                // Căn phải cho số — mắt người dò cột tiền theo hàng đơn vị, y như trong Excel.
                const numeric = !!v && /^-?[\d.,]+%?$/.test(v.trim());
                return (
                  <td
                    key={c}
                    title={v.length > 60 ? v : undefined}
                    style={{
                      borderRight: `1px solid ${V.border}`,
                      borderBottom: `1px solid ${V.border}`,
                      padding: '3px 8px',
                      color: v ? V.text : V.textFaint,
                      textAlign: numeric ? 'right' : 'left',
                      whiteSpace: 'nowrap',
                      maxWidth: 320,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      fontVariantNumeric: numeric ? 'tabular-nums' : undefined,
                    }}
                  >
                    {v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Preview ANY attachment, not just images.
 *
 * Before this, an attached .xlsx/.docx was a filename and nothing else — the user could not check
 * they had picked the right file, or that the system could actually read it, until the whole turn
 * came back wrong. Three sources, cheapest first:
 *   image      → render the bytes we already hold, no network;
 *   text-like  → decode in the browser, no network;
 *   office/pdf → the browser cannot parse these, but the upload endpoint extracts their text, so
 *                upload once (reusing `uploadId` when the file has already been sent) and show it.
 *
 * The extracted text is exactly what the assistant will see, which makes this a real check of
 * "will the AI be able to read my file?" rather than a decorative thumbnail.
 */
export function AttachmentPreview({
  att,
  open,
  onClose,
  onUploaded,
}: {
  att: PreviewableAttachment | null;
  open: boolean;
  onClose: () => void;
  /** Report the id back so a later preview (or the send itself) can skip re-uploading. */
  onUploaded?: (uploadId: string) => void;
}) {
  const { t: tr } = useI18n();
  const { message } = AntApp.useApp();
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [raw, setRaw] = useState(false);

  // Bảng dựng từ CHÍNH chuỗi chữ ở trên, nên hai chế độ xem không bao giờ nói khác nhau.
  const sheets = useMemo(() => (text ? parseSheets(text, att?.name ?? '') : null), [text, att]);

  useEffect(() => {
    if (!open || !att) return;
    setText(null);
    setFailed(null);
    setSheetIdx(0);
    setRaw(false);
    if (att.isImage) return; // rendered directly below

    // Browser-readable → decode locally, instantly.
    if (TEXT_LIKE.test(att.mime) || (!OFFICE_EXT.test(att.name) && !/pdf/i.test(att.mime))) {
      try {
        setText(decodeBase64Text(att.dataBase64));
        return;
      } catch {
        /* fall through to the server path */
      }
    }

    // Office/PDF → ask the server for the text it extracted.
    let alive = true;
    setLoading(true);
    void (async () => {
      try {
        const id = att.uploadId || (await accountApi.uploadFile(toFile(att), 'chat')).id;
        if (!att.uploadId) onUploaded?.(id);
        const full = await accountApi.getUpload(id);
        if (!alive) return;
        setText(
          full.kind === 'pdf'
            ? tr('chat.previewPdf', 'Đây là file PDF. AI đọc trực tiếp được nội dung, nhưng bản xem trước dạng chữ thì không hiển thị ở đây.')
            : full.data,
        );
      } catch (e) {
        // 410 = tệp từng tồn tại và đã bị xoá theo hạn lưu trữ. Thông điệp của máy chủ đã nêu rõ
        // tên tệp và lý do, nên giữ nguyên văn thay vì thay bằng "không đọc được".
        if (alive) setFailed((e as Error).message || tr('chat.previewFailed', 'Không đọc được nội dung tệp.'));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, att, onUploaded, tr]);

  if (!att) return null;
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={sheets && !raw ? 1180 : 880}
      title={<span style={{ fontSize: 15 }}>{att.name}</span>}
      styles={{ body: { maxHeight: '68vh', overflow: 'auto' } }}
    >
      {att.isImage ? (
        <img
          src={`data:${att.mime || 'image/png'};base64,${att.dataBase64}`}
          alt={att.name}
          style={{ maxWidth: '100%', borderRadius: 10, display: 'block' }}
        />
      ) : loading ? (
        <div style={{ padding: '38px 0', textAlign: 'center' }}>
          <Spin />
          <div style={{ marginTop: 10, color: V.textSub, fontSize: 13 }}>
            {tr('chat.previewReading', 'Đang đọc nội dung tệp…')}
          </div>
        </div>
      ) : failed ? (
        <div style={{ color: V.textSub, fontSize: 13.5 }}>
          {tr('chat.previewFailed', 'Không đọc được nội dung tệp.')}
          <div style={{ marginTop: 6, color: V.textFaint, fontSize: 12 }}>{failed}</div>
        </div>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              marginBottom: 8,
              fontSize: 12,
              color: V.textFaint,
            }}
          >
            <span style={{ flex: 1, minWidth: 200 }}>
              {tr('chat.previewNote', 'Đây đúng là phần nội dung AI sẽ đọc được từ tệp này.')}
            </span>
            {!!sheets && (
              <Segmented
                size="small"
                value={raw ? 'raw' : 'grid'}
                onChange={(v) => setRaw(v === 'raw')}
                options={[
                  { label: tr('chat.previewGrid', 'Bảng'), value: 'grid' },
                  { label: tr('chat.previewRaw', 'Văn bản'), value: 'raw' },
                ]}
              />
            )}
          </div>
          {!!sheets && !raw && sheets.length > 1 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {sheets.map((sh, i) => (
                <button
                  key={`${sh.name}-${i}`}
                  type="button"
                  onClick={() => setSheetIdx(i)}
                  style={{
                    cursor: 'pointer',
                    padding: '3px 11px',
                    borderRadius: 7,
                    fontSize: 12,
                    border: `1px solid ${i === sheetIdx ? BRAND : V.border}`,
                    background: i === sheetIdx ? BRAND : 'transparent',
                    color: i === sheetIdx ? '#fff' : V.textSub,
                  }}
                >
                  {sh.name || tr('chat.previewSheetN', 'Sheet {n}', { n: String(i + 1) })}
                </button>
              ))}
            </div>
          )}
          {!!sheets && !raw ? (
            <SheetTable sheet={sheets[Math.min(sheetIdx, sheets.length - 1)]} />
          ) : (
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
              margin: 0,
              fontSize: 12.5,
              lineHeight: 1.6,
              color: V.text,
              background: V.surfaceMuted,
              border: `1px solid ${V.border}`,
              borderRadius: 10,
              padding: 12,
            }}
          >
            {text ?? ''}
          </pre>
          )}
          {!!text && (
            <div style={{ marginTop: 8, fontSize: 12, color: V.textFaint }}>
              {sheets && !raw
                ? tr('chat.previewGridSize', '{r} hàng × {c} cột', {
                    r: String(sheets[Math.min(sheetIdx, sheets.length - 1)].rows.length),
                    c: String(
                      Math.max(...sheets[Math.min(sheetIdx, sheets.length - 1)].rows.map((x) => x.length)),
                    ),
                  })
                : tr('chat.previewChars', '{n} ký tự', { n: String(text.length) })}
            </div>
          )}
        </>
      )}
      {!att.isImage && !loading && !failed && !text && (
        <div style={{ color: BRAND, fontSize: 13 }}>{tr('chat.previewEmpty', 'Tệp này không có nội dung dạng chữ.')}</div>
      )}
    </Modal>
  );
}
