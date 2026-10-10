/**
 * Bản XEM TRƯỚC thật của một tệp agent vừa dựng — để thẻ tệp trong hội thoại cho thấy NGAY bên trong
 * có gì (sheet nào, bao nhiêu dòng × cột, vài dòng đầu; Word thì các đoạn đầu; PDF bao nhiêu trang),
 * thay vì chỉ một cái tên. Người dùng không phải mở tệp mới biết agent làm đủ hay thiếu.
 *
 * THUẦN (không electron) — dùng lại bộ đọc Office có sẵn (`ooxml.ts`, đã chuẩn hoá ngày/số/cột thưa)
 * và bộ giải nén của `fileBuild.ts`. Lỗi đọc thì trả null: xem trước là phụ, không được làm hỏng thẻ.
 */
import { extractOfficeText } from './ooxml';
import { unzip } from './fileBuild';

export interface FilePreviewSheet {
  name: string;
  /** Số dòng CÓ DỮ LIỆU (kể cả hàng tiêu đề). */
  rows: number;
  cols: number;
  head: string[][];
}

export interface FilePreview {
  kind: 'xlsx' | 'csv' | 'docx' | 'pdf' | 'text';
  /** Một dòng tóm tắt (cũng là thứ được giữ lại làm trí nhớ của hội thoại). */
  summary: string;
  sheets?: FilePreviewSheet[];
  paragraphs?: number;
  pages?: number;
  head?: string[];
}

export const PREVIEW_ROWS = 10;
export const PREVIEW_COLS = 12;
const CELL_MAX = 60;
const MAX_BYTES = 15 * 1024 * 1024;

const cut = (s: string, n = CELL_MAX) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** CSV → hàng (đúng chuẩn RFC 4180: ngoặc kép, dấu phẩy/xuống dòng trong ngoặc). Bỏ BOM. Giữ nguyên chữ (số 0 đầu). */
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  const delim = (() => {
    const first = s.split(/\r?\n/, 1)[0] || '';
    return (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : first.includes('\t') && !first.includes(',') ? '\t' : ',';
  })();
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') q = true;
    else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  // Bỏ dòng TRỐNG HẲN (không có cả dấu phân cách); dòng ",,," là một bản ghi rỗng thật — vẫn đếm, để
  // số dòng của thẻ tệp khớp "N dòng nguồn → N dòng trong tệp" của bộ xuất.
  return rows.filter((r) => r.length > 1 || r[0] !== '');
}

function sheetFromRows(name: string, rows: string[][]): FilePreviewSheet {
  const cols = rows.reduce((m, r) => Math.max(m, r.length), 0);
  return {
    name,
    rows: rows.length,
    cols,
    head: rows.slice(0, PREVIEW_ROWS).map((r) => r.slice(0, PREVIEW_COLS).map((c) => cut(String(c ?? '')))),
  };
}

const unesc = (v: string) => v.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");

/**
 * Các sheet theo thứ tự trong workbook (kể cả sheet trống — bộ trích chữ bỏ qua chúng) + số dòng THẬT
 * của từng sheet = chỉ số `<row r>` lớn nhất (dòng trống vẫn là một dòng — bản ghi rỗng xuất ra tệp).
 */
function workbookSheets(buf: Buffer): { name: string; maxRow: number }[] {
  try {
    const parts = unzip(buf);
    const wb = parts.find((x) => x.path === 'xl/workbook.xml');
    if (!wb) return [];
    const rels = parts.find((x) => x.path === 'xl/_rels/workbook.xml.rels');
    const target = new Map<string, string>();
    if (rels) {
      const re = /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g;
      let m: RegExpExecArray | null;
      const xml = rels.data.toString('utf8');
      while ((m = re.exec(xml))) target.set(m[1], 'xl/' + m[2].replace(/^\/?(xl\/)?/, ''));
    }
    const out: { name: string; maxRow: number }[] = [];
    const re = /<sheet\b([^>]*)\/?>/g;
    let m: RegExpExecArray | null;
    const xml = wb.data.toString('utf8');
    while ((m = re.exec(xml))) {
      const name = unesc(/name="([^"]*)"/.exec(m[1])?.[1] ?? '');
      const rid = /r:id="([^"]+)"/.exec(m[1])?.[1] ?? '';
      const part = parts.find((x) => x.path === target.get(rid));
      let maxRow = 0;
      if (part) {
        const sx = part.data.toString('utf8');
        const rr = /<row\b[^>]*\br="(\d+)"/g;
        let k: RegExpExecArray | null;
        while ((k = rr.exec(sx))) maxRow = Math.max(maxRow, Number(k[1]));
      }
      out.push({ name, maxRow });
    }
    return out;
  } catch {
    return [];
  }
}

export function previewXlsx(buf: Buffer): FilePreview {
  const text = extractOfficeText(buf, 'xlsx');
  const byName = new Map<string, string[][]>();
  for (const block of text.split(/\n\n(?=# Sheet: )/)) {
    const m = /^# Sheet: (.*)\n?([\s\S]*)$/.exec(block);
    if (!m) continue;
    byName.set(m[1], m[2] ? m[2].split('\n').map((l) => l.split('\t')) : []);
  }
  const wbs = workbookSheets(buf);
  const order = wbs.length ? wbs : [...byName.keys()].map((name) => ({ name, maxRow: 0 }));
  const sheets = order.map((w) => {
    const sh = sheetFromRows(w.name, byName.get(w.name) || []);
    // Có dữ liệu thì số dòng = phạm vi thật của sheet (gồm cả dòng trống ở giữa/cuối).
    return sh.rows ? { ...sh, rows: Math.max(sh.rows, w.maxRow) } : sh;
  });
  const summary = `${sheets.length} sheet · ${sheets.map((s) => `«${s.name}» ${Math.max(0, s.rows - 1)} dòng × ${s.cols} cột`).join(', ')}`;
  return { kind: 'xlsx', summary, sheets };
}

export function previewCsv(buf: Buffer): FilePreview {
  const rows = parseCsv(buf.toString('utf8'));
  const sh = sheetFromRows('CSV', rows);
  return { kind: 'csv', summary: `${Math.max(0, sh.rows - 1)} dòng dữ liệu × ${sh.cols} cột (dòng đầu là tiêu đề)`, sheets: [sh] };
}

export function previewDocx(buf: Buffer): FilePreview {
  const text = extractOfficeText(buf, 'docx');
  const paras = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  let pages: number | undefined;
  try {
    const app = unzip(buf).find((x) => x.path === 'docProps/app.xml');
    const m = app ? /<Pages>(\d+)<\/Pages>/.exec(app.data.toString('utf8')) : null;
    if (m) pages = Number(m[1]);
  } catch {
    /* tuỳ chọn */
  }
  return {
    kind: 'docx',
    summary: `${paras.length} đoạn${pages ? ` · ${pages} trang` : ''}${paras[0] ? ` · mở đầu: «${cut(paras[0], 80)}»` : ''}`,
    paragraphs: paras.length,
    ...(pages ? { pages } : {}),
    head: paras.slice(0, 6).map((p) => cut(p, 220)),
  };
}

/** Số trang PDF: đếm đối tượng `/Type /Page` (không tính `/Pages`), đối chiếu `/Count` của gốc. */
export function pdfPageCount(buf: Buffer): number {
  const s = buf.toString('latin1');
  const pages = (s.match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
  let count = 0;
  const re = /\/Type\s*\/Pages\b[\s\S]{0,400}?\/Count\s+(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) count = Math.max(count, Number(m[1]));
  return Math.max(pages, count);
}

export function previewPdf(buf: Buffer): FilePreview {
  const pages = pdfPageCount(buf);
  return { kind: 'pdf', summary: `${pages} trang`, pages };
}

export function previewText(buf: Buffer): FilePreview {
  const lines = buf.toString('utf8').replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trimEnd());
  const nonEmpty = lines.filter((l) => l.trim());
  return { kind: 'text', summary: `${nonEmpty.length} dòng`, head: nonEmpty.slice(0, 8).map((l) => cut(l, 200)), paragraphs: nonEmpty.length };
}

/** Xem trước theo đuôi tệp. null = không xem trước được (tệp lạ, quá lớn, hỏng). */
export function buildFilePreview(name: string, buf: Buffer): FilePreview | null {
  if (!buf || !buf.length || buf.length > MAX_BYTES) return null;
  const ext = (String(name).split('.').pop() || '').toLowerCase();
  try {
    if (ext === 'xlsx') return previewXlsx(buf);
    if (ext === 'csv' || ext === 'tsv') return previewCsv(buf);
    if (ext === 'docx') return previewDocx(buf);
    if (ext === 'pdf') return previewPdf(buf);
    if (ext === 'md' || ext === 'txt' || ext === 'json') return previewText(buf);
    if (ext === 'html' || ext === 'htm') {
      const plain = buf.toString('utf8').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '\n');
      return { ...previewText(Buffer.from(plain, 'utf8')), summary: `trang HTML · ${previewText(Buffer.from(plain, 'utf8')).summary}` };
    }
  } catch {
    return null;
  }
  return null;
}
