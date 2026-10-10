'use client';
/**
 * Phần "Tệp & quyền" của việc "Chạy AI agent" trong màn sửa quy tắc tự động hoá, và biên bản một lần
 * chạy trong lịch sử.
 *
 *  - Thư mục RIÊNG của quy tắc (`lark/automations/<id>/`): "Tệp nguồn" chép vào inputs/, nguồn Lark tải
 *    TƯƠI mỗi lần chạy (Drive / Lark Sheets / ô đính kèm Base), "chỉ xử lý tệp mới", giữ N lần kết quả.
 *  - "Quyền khi chạy tự động": không ai bấm "Cho phép" trong lượt tự động → ghi đè / thay tệp / gửi /
 *    xoá chỉ chạy khi được cấp ở đây; thao tác cộng thêm không cần.
 *  - "Chạy ở": máy chạy hộ (VM) không có phiên Lark web và không thấy thư mục trên máy này → cảnh báo.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Checkbox, Input, InputNumber, Popconfirm, Segmented, Select, Space, Tag, Tooltip, Typography } from 'antd';
import { DeleteOutlined, FolderOpenOutlined, LinkOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import type { LarkAutoFileSource, LarkAutoPermissions, LarkAutoRunReport, LarkAutomationFolderInfo, RuntimeAdapter } from '@larkwave/core';
import { V } from '../../theme';
import { FileCard } from './FileCard';

const { Text } = Typography;

export interface AutoFilesValue {
  sources: LarkAutoFileSource[];
  onlyNewFiles: boolean;
  keepOutputs: number;
  perms: LarkAutoPermissions;
  runOn: 'auto' | 'desktop';
}

export const PERM_ITEMS: { key: keyof LarkAutoPermissions; label: string; hint: string }[] = [
  { key: 'overwriteCells', label: 'Ghi đè ô / sửa bản ghi có sẵn', hint: 'Sửa ô đã có giá trị, cập nhật dòng khi ghi theo khoá, ghi vùng Lark Sheets có sẵn.' },
  { key: 'replaceAttachments', label: 'Đính thay tệp (xoá tệp cũ trong ô)', hint: 'Mặc định đính tệp là GHI THÊM — chỉ bật nếu việc cần thay tệp cũ.' },
  { key: 'sendMessages', label: 'Gửi tin nhắn / gửi tệp vào nhóm', hint: 'Cần custom app (Lark Bot). Ô "Gửi báo cáo vào nhóm" bên trên luôn được gửi.' },
  { key: 'deleteRecords', label: 'Xoá bản ghi / bảng / cột', hint: 'Nguy hiểm — chỉ bật khi việc thật sự cần xoá.' },
];

const KIND_LABEL: Record<LarkAutoFileSource['kind'], string> = { drive: 'Tệp Drive', sheet: 'Lark Sheets', attachment: 'Ô đính kèm Base' };

/** Việc này cần phiên Lark web / thư mục trên máy (máy chạy hộ không làm được)? Đoán từ cấu hình + câu lệnh. */
export function needsDesktop(v: Pick<AutoFilesValue, 'sources'>, inputs: number, prompt: string): boolean {
  if (inputs > 0 || v.sources.length > 0) return true;
  return /(đính|đính kèm|tệp|file|excel|xlsx|csv|drive|lark sheets|sheet|docs|tài liệu|thư mục|lark_web_)/i.test(prompt || '');
}

const sizeText = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function readAsBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || '').replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}

export function AutomationFilesSection({
  runtime,
  ruleId,
  value,
  onChange,
  legacy,
  hostedOn,
  prompt,
  writeMode,
}: {
  runtime: RuntimeAdapter;
  /** Id quy tắc (hoặc id nháp sinh sẵn cho quy tắc mới — thêm tệp trước khi lưu lần đầu). */
  ruleId: string;
  value: AutoFilesValue;
  onChange: (v: AutoFilesValue) => void;
  /** Quy tắc cũ chưa có mục quyền (đang giữ sự cho phép cũ). */
  legacy: boolean;
  /** Đã bật "Để Larkwave chạy lịch hộ" (máy chạy hộ có thể giành lượt chạy). */
  hostedOn: boolean;
  prompt: string;
  /** Lịch được ghi dữ liệu (chế độ thực thi) — quyền chỉ có nghĩa khi bật. */
  writeMode: boolean;
}) {
  const { message } = App.useApp();
  const [info, setInfo] = useState<LarkAutomationFolderInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const supported = !!runtime.larkAutomationFolder;

  const load = useCallback(() => {
    if (!supported || !ruleId) return;
    runtime.larkAutomationFolder!(ruleId).then(setInfo).catch(() => setInfo(null));
  }, [runtime, ruleId, supported]);
  useEffect(load, [load]);

  if (!supported) return null;
  const patch = (p: Partial<AutoFilesValue>) => onChange({ ...value, ...p });
  const setSource = (i: number, p: Partial<LarkAutoFileSource>) => patch({ sources: value.sources.map((s, k) => (k === i ? { ...s, ...p } : s)) });

  const addFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    try {
      let last: LarkAutomationFolderInfo | null = null;
      for (const f of Array.from(list).slice(0, 20)) {
        last = await runtime.larkAutomationAddInput!(ruleId, { name: f.name, dataBase64: await readAsBase64(f) });
      }
      if (last) setInfo(last);
      message.success('Đã thêm tệp nguồn vào thư mục của quy tắc.');
    } catch (e) {
      message.error((e as Error)?.message || 'Không thêm được tệp.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const desk = needsDesktop(value, info?.inputs.length ?? 0, prompt);

  return (
    <div style={{ border: `1px solid ${V.borderSub}`, borderRadius: 8, padding: 10, marginTop: 6 }}>
      <Text strong style={{ fontSize: 12 }}>Tệp nguồn & thư mục của quy tắc</Text>
      <div style={{ fontSize: 11, color: V.textFaint, margin: '2px 0 6px', wordBreak: 'break-all' }}>
        {info?.root || '…/lark/automations/<quy tắc>'} — mỗi lần chạy đọc <code>inputs/</code> + nguồn Lark (tải mới), kết quả lưu ở <code>outputs/&lt;lần chạy&gt;/</code>.
      </div>
      <Space size={6} wrap>
        <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={(e) => void addFiles(e.target.files)} />
        <Button size="small" icon={<UploadOutlined />} loading={busy} onClick={() => fileRef.current?.click()}>
          Thêm tệp nguồn
        </Button>
        {runtime.larkAutomationRevealFolder && (
          <Button size="small" icon={<FolderOpenOutlined />} onClick={() => void runtime.larkAutomationRevealFolder!(ruleId)}>
            Mở thư mục
          </Button>
        )}
        {!!info?.processedCount && runtime.larkAutomationResetProcessed && (
          <Popconfirm title="Quên các tệp đã xử lý? Lần chạy sau xử lý lại TẤT CẢ tệp." okText="Quên" cancelText="Huỷ" onConfirm={() => void runtime.larkAutomationResetProcessed!(ruleId).then(setInfo)}>
            <Button size="small" type="text">Đã xử lý {info.processedCount} tệp · đặt lại</Button>
          </Popconfirm>
        )}
      </Space>
      {!!info?.inputs.length && (
        <div style={{ marginTop: 6 }}>
          {info.inputs.map((f) => (
            <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              <span style={{ color: V.textFaint }}>{sizeText(f.bytes)}</span>
              {f.processed && <Tag style={{ margin: 0, fontSize: 10 }}>đã xử lý</Tag>}
              <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => void runtime.larkAutomationRemoveInput!(ruleId, f.name).then(setInfo)} />
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 8 }}>
        <Text style={{ fontSize: 12 }}>Nguồn Lark (tải mới mỗi lần chạy):</Text>
        {value.sources.map((s, i) => (
          <Space.Compact key={s.id} style={{ width: '100%', marginTop: 4 }}>
            <Select size="small" style={{ width: 150 }} value={s.kind} onChange={(k) => setSource(i, { kind: k })} options={(Object.keys(KIND_LABEL) as LarkAutoFileSource['kind'][]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
            <Input size="small" placeholder={s.kind === 'attachment' ? 'Link Base …/base/<token>?table=…' : s.kind === 'sheet' ? 'Link …/sheets/<token>' : 'Link …/file/<token>'} value={s.url} onChange={(e) => setSource(i, { url: e.target.value })} />
            {s.kind === 'attachment' && <Input size="small" style={{ width: 130 }} placeholder="Cột đính kèm" value={s.field} onChange={(e) => setSource(i, { field: e.target.value })} />}
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => patch({ sources: value.sources.filter((_, k) => k !== i) })} />
          </Space.Compact>
        ))}
        <Button
          size="small"
          type="dashed"
          icon={<PlusOutlined />}
          style={{ marginTop: 4 }}
          onClick={() => patch({ sources: [...value.sources, { id: `src${Date.now().toString(36)}`, kind: 'drive', url: '' }] })}
        >
          Thêm nguồn Lark
        </Button>
      </div>

      <Space size={16} wrap style={{ marginTop: 8 }}>
        <Tooltip title="Bỏ qua tệp có NỘI DUNG đã xử lý ở lần chạy thành công trước (đổi tên không tính là mới). Không có tệp mới thì không chạy agent.">
          <Checkbox checked={value.onlyNewFiles} onChange={(e) => patch({ onlyNewFiles: e.target.checked })}>
            Chỉ xử lý tệp mới
          </Checkbox>
        </Tooltip>
        <span style={{ fontSize: 12 }}>
          Giữ kết quả <InputNumber size="small" min={1} max={100} value={value.keepOutputs} onChange={(n) => patch({ keepOutputs: Math.max(1, Number(n) || 10) })} style={{ width: 60 }} /> lần chạy gần nhất
        </span>
      </Space>

      <div style={{ marginTop: 10 }}>
        <Text strong style={{ fontSize: 12 }}>Quyền khi chạy tự động</Text>
        <div style={{ fontSize: 11, color: V.textFaint, marginBottom: 4 }}>
          Không ai bấm "Cho phép" trong lượt tự động. Thao tác CỘNG THÊM (thêm bản ghi mới, đính tệp ghi thêm, tải lên Drive, nhập thành Sheet/Doc) luôn chạy; thao tác dưới đây chỉ chạy khi được bật — không thì bị BỎ QUA và ghi vào lịch sử chạy.
        </div>
        {PERM_ITEMS.map((p) => (
          <div key={p.key}>
            <Tooltip title={p.hint}>
              <Checkbox disabled={!writeMode} checked={!!value.perms[p.key]} onChange={(e) => patch({ perms: { ...value.perms, [p.key]: e.target.checked } })}>
                <span style={{ fontSize: 12 }}>{p.label}</span>
              </Checkbox>
            </Tooltip>
          </div>
        ))}
        {legacy && (
          <Alert style={{ marginTop: 4 }} type="info" showIcon message="Quy tắc tạo trước khi có mục quyền: đang giữ sự cho phép cũ (mọi thao tác ghi). Lưu lại để chỉ cấp đúng các quyền đã tích." />
        )}
      </div>

      <div style={{ marginTop: 10 }}>
        <Text strong style={{ fontSize: 12 }}>Chạy ở</Text>
        <Segmented
          size="small"
          style={{ marginLeft: 8 }}
          value={value.runOn}
          onChange={(v) => patch({ runOn: v as AutoFilesValue['runOn'] })}
          options={[
            { value: 'auto', label: 'Máy giữ quyền chạy lịch' },
            { value: 'desktop', label: 'Chỉ trên máy này' },
          ]}
        />
        {hostedOn && value.runOn !== 'desktop' && desk && (
          <Alert
            style={{ marginTop: 6 }}
            type="warning"
            showIcon
            message="Việc này dùng tệp trên máy / phiên Lark web — máy chạy hộ (VM) KHÔNG có hai thứ đó (chỉ có Open API)."
            description='Chọn "Chỉ trên máy này" để lịch luôn chạy ở app Larkwave trên máy bạn.'
          />
        )}
      </div>
    </div>
  );
}

/** Biên bản một lần chạy (lịch sử): tệp vào, đã đọc, đã ghi (+ link), đọc lại, bị bỏ qua, tệp kết quả. */
export function RunReportView({ report, runtime }: { report: LarkAutoRunReport; runtime: RuntimeAdapter }) {
  const open = (u?: string) => u && runtime.openExternal?.(u);
  return (
    <div style={{ fontSize: 11.5, color: V.text, margin: '4px 0 6px 14px', display: 'flex', flexDirection: 'column', gap: 3 }}>
      {report.note && <div style={{ color: V.textFaint }}>{report.note}</div>}
      {!!report.inputs?.length && (
        <div>
          <b>Tệp vào:</b> {report.inputs.map((x) => `${x.name}${x.rows !== undefined ? ` (${x.rows} dòng)` : ''}`).join(' · ')}
          {report.skippedInputs ? <span style={{ color: V.textFaint }}> · {report.skippedInputs} tệp đã xử lý trước đó</span> : null}
        </div>
      )}
      {!!report.sourceErrors?.length && <div style={{ color: '#cf1322' }}><b>Lỗi nguồn Lark:</b> {report.sourceErrors.join(' | ')}</div>}
      {!!report.read?.length && (
        <div>
          <b>Đã đọc:</b> {report.read.map((x) => `${x.what}${x.rows !== undefined ? ` — ${x.rows} dòng` : ''}`).join(' · ')}
        </div>
      )}
      {!!report.written?.length && (
        <div>
          <b>Đã ghi:</b>
          {report.written.map((w, i) => (
            <div key={i} style={{ marginLeft: 8 }}>
              {w.target || w.tool}:{' '}
              {[w.created !== undefined ? `${w.created} mới` : '', w.updated !== undefined ? `${w.updated} sửa` : '', w.unchanged !== undefined ? `${w.unchanged} không đổi` : '', w.count !== undefined ? `${w.count} thao tác` : '']
                .filter(Boolean)
                .join(' · ')}
              {w.verified === true && <Tag color="green" style={{ marginLeft: 4, fontSize: 10 }}>đọc lại khớp</Tag>}
              {w.verified === false && <Tag color="red" style={{ marginLeft: 4, fontSize: 10 }}>CHƯA khớp</Tag>}
              {w.url && (
                <Button type="link" size="small" icon={<LinkOutlined />} style={{ padding: 0, height: 16, fontSize: 11 }} onClick={() => open(w.url)}>
                  mở
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      {report.verify && (
        <div>
          <b>Đọc lại:</b> {report.verify.ok} khớp{report.verify.failed ? <span style={{ color: '#cf1322' }}> · {report.verify.failed} lệch</span> : ''}
        </div>
      )}
      {!!report.skipped?.length && (
        <div style={{ color: '#d46b08' }}>
          <b>Bị bỏ qua (thiếu quyền):</b>
          {report.skipped.map((s, i) => (
            <div key={i} style={{ marginLeft: 8 }}>
              {s.reason || s.tool}
            </div>
          ))}
        </div>
      )}
      {!!report.outputs?.length && (
        <div>
          <b>Tệp kết quả:</b>
          {report.outputs.map((o) => (
            <div key={o.path} style={{ marginTop: 4 }}>
              <FileCard item={{ kind: 'file', id: o.path, name: o.name, path: o.path, mime: o.mime, bytes: o.bytes }} runtime={runtime} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
