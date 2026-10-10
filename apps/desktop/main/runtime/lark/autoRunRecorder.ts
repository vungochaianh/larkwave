/**
 * BIÊN BẢN một lần chạy tự động hoá: bọc từng công cụ để ghi lại ĐÃ ĐỌC gì (bảng/tệp + số dòng), ĐÃ GHI
 * gì (bao nhiêu dòng mới / sửa / không đổi, link), kết quả ĐỌC LẠI (mọi tool ghi đều tự đọc lại và trả
 * `verified`). Lịch sử chạy hiện đúng những thứ này — "✓ · 12 thao tác ghi" không nói được lần chạy đó đã
 * ghi gì, vào đâu, và có chắc không.
 *
 * Thuần (không electron) — dùng chung cho app desktop và tw-lark-runner.
 */
import type { LarkAutoRunReport } from '@larkwave/core';
import type { LarkToolDef } from './tools/types';

type J = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const len = (v: unknown): number | undefined => (Array.isArray(v) ? v.length : undefined);

function push<K extends keyof LarkAutoRunReport>(r: LarkAutoRunReport, k: K, v: NonNullable<LarkAutoRunReport[K]> extends (infer T)[] ? T : never): void {
  const list = ((r[k] as unknown[]) ?? []) as unknown[];
  list.push(v);
  (r as Record<string, unknown>)[k] = list.slice(-40);
}

/** Ghi một kết quả công cụ (thành công) vào biên bản. */
export function noteToolResult(report: LarkAutoRunReport, name: string, input: Record<string, J>, data: J): void {
  if (!data || typeof data !== 'object') return;
  const d = data as J;
  if (typeof d.verified === 'boolean') {
    report.verify = report.verify ?? { ok: 0, failed: 0 };
    if (d.verified) report.verify.ok++;
    else report.verify.failed++;
  }
  switch (name) {
    case 'lark_web_read_records':
      push(report, 'read', { what: `bảng «${d.table ?? input.table ?? ''}»`, rows: num(d.total) ?? num(d.returned) });
      return;
    case 'lark_export_table_file':
      push(report, 'read', { what: `bảng «${input.table ?? ''}» → ${d.file_name ?? 'tệp'}`, rows: num(d.source_rows) });
      return;
    case 'bitable_search_records':
    case 'bitable_list_records':
      push(report, 'read', { what: `bảng ${input.table_id ?? input.table ?? ''}`, rows: num(d.total) ?? len(d.items) });
      return;
    case 'lark_read_attachment':
      push(report, 'read', { what: `tệp đính kèm ${d.name ?? input.name ?? input.file_token ?? ''}` });
      return;
    case 'prepare_local_file': {
      const rows = Array.isArray(d.preview?.sheets) ? d.preview.sheets.reduce((n: number, sh: J) => n + (num(sh?.rows) ?? 0), 0) : undefined;
      push(report, 'read', { what: `tệp ${d.file_name ?? input.path ?? ''}`, rows });
      return;
    }
    case 'lark_web_write_records':
    case 'bitable_batch_create_records':
    case 'bitable_create_record': {
      const created = num(d.created) ?? len(d.created_record_ids) ?? len(d.records) ?? (d.record ? 1 : undefined);
      push(report, 'written', {
        tool: name,
        target: String(d.table ?? input.table ?? input.table_id ?? ''),
        created,
        ...(num(d.updated) !== undefined ? { updated: num(d.updated) } : {}),
        ...(num(d.unchanged) !== undefined ? { unchanged: num(d.unchanged) } : {}),
        ...(d.url ? { url: String(d.url) } : {}),
        ...(typeof d.verified === 'boolean' ? { verified: d.verified } : {}),
      });
      return;
    }
    case 'lark_web_update_records':
    case 'bitable_update_record':
    case 'bitable_batch_update_records':
      push(report, 'written', {
        tool: name,
        target: String(d.table ?? input.table ?? input.table_id ?? ''),
        updated: len(d.updated_record_ids) ?? len(d.records) ?? 1,
        ...(d.url ? { url: String(d.url) } : {}),
        ...(typeof d.verified === 'boolean' ? { verified: d.verified } : {}),
      });
      return;
    case 'lark_web_attach_file':
      push(report, 'written', {
        tool: name,
        target: `ô «${d.field ?? input.field ?? ''}» · ${d.record_id ?? input.record_id ?? ''} · ${d.file_name ?? ''}`,
        count: 1,
        ...(d.url ? { url: String(d.url) } : {}),
        ...(typeof d.verified === 'boolean' ? { verified: d.verified } : {}),
      });
      return;
    case 'lark_web_drive_upload':
    case 'lark_web_import_as_sheet':
    case 'lark_web_import_as_doc':
      push(report, 'written', {
        tool: name,
        target: String(d.title ?? d.kind ?? input.path ?? ''),
        count: 1,
        ...(d.url ? { url: String(d.url) } : {}),
        verified: d.ok === true,
      });
      return;
    case 'lark_web_sheet_write_range':
    case 'sheets_write_range':
      push(report, 'written', { tool: name, target: String(d.sheet ?? input.sheet ?? ''), count: num(d.written), ...(d.url ? { url: String(d.url) } : {}), ...(typeof d.verified === 'boolean' ? { verified: d.verified } : {}) });
      return;
    case 'send_file':
    case 'messaging_send_message':
    case 'messaging_send_rich':
      push(report, 'written', { tool: name, target: String(d.chat_id ?? input.receive_id ?? input.chat_id ?? d.sent_to ?? ''), count: 1 });
      return;
    default:
      return;
  }
}

/** Bọc bộ công cụ: mỗi lần thực thi THÀNH CÔNG được ghi vào biên bản (giữ nguyên mọi cờ của tool). */
export function wrapToolsForReport(tools: LarkToolDef[], report: LarkAutoRunReport): LarkToolDef[] {
  return tools.map((t) => ({
    ...t,
    exec: async (input, client) => {
      const data = await t.exec(input, client);
      try {
        if (!(data && typeof data === 'object' && (data as J).ok === false)) noteToolResult(report, t.name, input, data);
      } catch {
        /* biên bản là phụ — không được làm hỏng thao tác */
      }
      return data;
    },
  }));
}

/** Một dòng tóm tắt biên bản (thông báo / tin nhắn). */
export function reportLine(r: LarkAutoRunReport): string {
  const parts: string[] = [];
  if (r.inputs?.length) parts.push(`${r.inputs.length} tệp vào`);
  const w = r.written ?? [];
  const created = w.reduce((n, x) => n + (x.created ?? 0), 0);
  const updated = w.reduce((n, x) => n + (x.updated ?? 0), 0);
  const other = w.reduce((n, x) => n + (x.count ?? 0), 0);
  if (created || updated || other) parts.push(`ghi: ${created} mới · ${updated} sửa${other ? ` · ${other} thao tác khác` : ''}`);
  if (r.verify) parts.push(`đọc lại ${r.verify.ok} khớp${r.verify.failed ? ` · ${r.verify.failed} LỆCH` : ''}`);
  if (r.skipped?.length) parts.push(`${r.skipped.length} thao tác bị bỏ qua (thiếu quyền)`);
  if (r.outputs?.length) parts.push(`${r.outputs.length} tệp kết quả`);
  return parts.join(' · ');
}
