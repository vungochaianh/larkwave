import { inflateRawSync } from 'node:zlib';

/**
 * Minimal, dependency-free reader for the modern Office formats
 * (.docx / .pptx / .xlsx) — each is a ZIP archive of XML parts. We parse the ZIP
 * central directory, inflate the relevant parts with Node's built-in zlib, then
 * strip the XML down to readable text so it can be fed to the model as reference
 * context (the same way uploaded .txt/code files are).
 *
 * Only STORE (0) and DEFLATE (8) entries are supported — which is everything the
 * Office apps emit. Anything we can't read is skipped rather than throwing, so a
 * partially-odd file still yields whatever text we could recover.
 */

// MIME types the Office apps send for the three supported OOXML formats.
export const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';
export const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type OfficeKind = 'docx' | 'pptx' | 'xlsx';

/** Classify an upload as a supported OOXML format by extension or MIME, else null. */
export function officeKindFor(name: string, mime: string): OfficeKind | null {
  const n = name.toLowerCase();
  if (n.endsWith('.docx') || mime === DOCX_MIME) return 'docx';
  if (n.endsWith('.pptx') || mime === PPTX_MIME) return 'pptx';
  if (n.endsWith('.xlsx') || mime === XLSX_MIME) return 'xlsx';
  return null;
}

/** Extract readable text from a docx/pptx/xlsx buffer ('' if nothing recovered). */
export function extractOfficeText(buf: Buffer, kind: OfficeKind): string {
  const entries = readZipEntries(buf);
  if (!entries.length) return '';
  if (kind === 'docx') return extractDocx(buf, entries);
  if (kind === 'pptx') return extractPptx(buf, entries);
  return extractXlsx(buf, entries);
}

// ─────────────────────────────────────────────────────────────────────────────
// ZIP reader (central directory → inflate)
// ─────────────────────────────────────────────────────────────────────────────

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

const SIG_EOCD = 0x06054b50; // End Of Central Directory record
const SIG_CDH = 0x02014b50; // Central Directory file Header
const SIG_LFH = 0x04034b50; // Local File Header

/** Parse a ZIP buffer's central directory into a flat list of entries. */
function readZipEntries(buf: Buffer): ZipEntry[] {
  if (buf.length < 22) return [];
  // Locate the EOCD by scanning backwards — its signature is followed by a
  // variable-length comment (≤ 65535 bytes), so it isn't at a fixed offset.
  let eocd = -1;
  const scanEnd = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= scanEnd; i -= 1) {
    if (buf.readUInt32LE(i) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return [];

  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count && off + 46 <= buf.length; i += 1) {
    if (buf.readUInt32LE(off) !== SIG_CDH) break;
    const method = buf.readUInt16LE(off + 10);
    const compressedSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localHeaderOffset = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    entries.push({ name, method, compressedSize, localHeaderOffset });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Inflate one entry's bytes to a UTF-8 string (best effort; '' on failure). */
function readEntry(buf: Buffer, e: ZipEntry): string {
  try {
    // The local header's name/extra lengths can differ from the central one, so
    // recompute the data offset from the LOCAL header, not the central record.
    const lho = e.localHeaderOffset;
    if (lho + 30 > buf.length || buf.readUInt32LE(lho) !== SIG_LFH) return '';
    const nameLen = buf.readUInt16LE(lho + 26);
    const extraLen = buf.readUInt16LE(lho + 28);
    const start = lho + 30 + nameLen + extraLen;
    const slice = buf.subarray(start, start + e.compressedSize);
    const out = e.method === 0 ? slice : inflateRawSync(slice);
    return out.toString('utf8');
  } catch {
    return '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// XML → text
// ─────────────────────────────────────────────────────────────────────────────

const XML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

function safeCodePoint(cp: number): string {
  try {
    return String.fromCodePoint(cp);
  } catch {
    return '';
  }
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&(?:amp|lt|gt|quot|apos);/g, (m) => XML_ENTITIES[m] ?? m);
}

/**
 * Flatten a Word/PowerPoint XML part to text: tabs/line-breaks/paragraph and
 * table-row boundaries become whitespace, every other tag is dropped, entities
 * decoded. The visible text lives in `<w:t>`/`<a:t>` runs, which survive the
 * tag-strip as their inner text.
 */
function xmlPartToText(xml: string): string {
  return decodeXmlEntities(
    xml
      .replace(/<w:tab\b[^>]*\/?>/g, '\t')
      .replace(/<(?:w|a):br\b[^>]*\/?>/g, '\n')
      .replace(/<\/(?:w:p|a:p|w:tr)>/g, '\n')
      .replace(/<[^>]+>/g, ''),
  );
}

/** Tidy recovered text: drop CRs, trailing spaces, and runs of blank lines. */
function tidy(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function partNum(name: string, re: RegExp): number {
  const m = name.match(re);
  return m ? Number(m[1]) : 0;
}

// ─── Format-specific extraction ───────────────────────────────────────────────

function extractDocx(buf: Buffer, entries: ZipEntry[]): string {
  const doc = entries.find((x) => x.name === 'word/document.xml');
  return doc ? tidy(xmlPartToText(readEntry(buf, doc))) : '';
}

function extractPptx(buf: Buffer, entries: ZipEntry[]): string {
  const slides = entries
    .filter((x) => /^ppt\/slides\/slide\d+\.xml$/.test(x.name))
    .sort((a, b) => partNum(a.name, /slide(\d+)\.xml$/) - partNum(b.name, /slide(\d+)\.xml$/));
  const parts: string[] = [];
  slides.forEach((s, i) => {
    const txt = tidy(xmlPartToText(readEntry(buf, s)));
    if (txt) parts.push(`# Slide ${i + 1}\n${txt}`);
  });
  return parts.join('\n\n');
}

/** "AB12" → 27 (0-based column). Giữ đúng vị trí cột là điều kiện sống còn của một bảng. */
function colIndex(ref: string): number {
  const m = /^([A-Z]+)/i.exec(ref);
  if (!m) return -1;
  let n = 0;
  for (const ch of m[1].toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** numFmtId của kiểu ngày/giờ dựng sẵn trong Excel. */
const BUILTIN_DATE_FMT = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

/**
 * Bản đồ styleIndex → có phải ô ngày/giờ không.
 * Excel lưu ngày dưới dạng SỐ (21/08/2026 = 46255); nếu không tra định dạng thì cả hợp đồng
 * sẽ toàn số sê-ri vô nghĩa. Trả về 'date' | 'datetime' | null cho mỗi cellXf.
 */
function dateStyles(buf: Buffer, entries: ZipEntry[]): (null | 'date' | 'datetime')[] {
  const e = entries.find((x) => x.name === 'xl/styles.xml');
  if (!e) return [];
  const xml = readEntry(buf, e);

  // Định dạng tự đặt: giữ mã để phân biệt có phần giờ hay không.
  const custom = new Map<number, string>();
  const fmtRe = /<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g;
  let fm: RegExpExecArray | null;
  while ((fm = fmtRe.exec(xml))) custom.set(Number(fm[1]), decodeXmlEntities(fm[2]));

  const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
  if (!cellXfs) return [];
  const out: (null | 'date' | 'datetime')[] = [];
  const xfRe = /<xf\b([^>]*)\/?>/g;
  let xm: RegExpExecArray | null;
  while ((xm = xfRe.exec(cellXfs[1]))) {
    const id = Number(/numFmtId="(\d+)"/.exec(xm[1])?.[1] ?? '0');
    const code = custom.get(id);
    if (code) {
      // Bỏ phần literal trong ngoặc kép rồi mới dò, kẻo 'ngày' trong chuỗi bị tính là mã ngày.
      const bare = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '');
      const hasDate = /[dmy]/i.test(bare);
      const hasTime = /[hs]/i.test(bare);
      out.push(hasDate ? (hasTime ? 'datetime' : 'date') : hasTime ? 'datetime' : null);
    } else if (BUILTIN_DATE_FMT.has(id)) {
      out.push(id >= 18 && id <= 21 ? 'datetime' : id >= 45 ? 'datetime' : 'date');
    } else {
      out.push(null);
    }
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Số sê-ri Excel → chuỗi ngày dd/mm/yyyy. */
function serialToDate(serial: number, kind: 'date' | 'datetime'): string {
  // Mốc 1899-12-30 bù cho lỗi năm-nhuận-1900 Excel cố tình giữ lại để tương thích Lotus 1-2-3.
  const ms = Math.round((serial - 25569) * 86400000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return String(serial);
  const day = `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  if (kind === 'date') return day;
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  // Ô chỉ có giờ (sê-ri < 1) thì đừng gắn thêm ngày 30/12/1899 vô nghĩa.
  return serial < 1 ? time : `${day} ${time}`;
}

/**
 * Số thô của Excel → chuỗi người đọc được.
 * Excel ghi giá 0.357 thành `0.35699999999999998` (đúng bản chất double 64-bit), và kết quả
 * công thức 20 × 115.588 thành `2311.7599999999998`. Cả hai đều là rác dấu phẩy động, và một
 * bản hợp đồng in ra `2.1999999999999999E-2` thì không dùng được.
 *
 * Hai bước, đều bám theo hành vi có tài liệu của Excel:
 *  1. toPrecision(15) — Excel CHỈ tính và hiển thị 15 chữ số có nghĩa, nên đây không phải mẹo
 *     làm tròn tuỳ tiện mà là áp đúng độ chính xác của chính công cụ tạo ra tệp. Số nào cần hơn
 *     15 chữ số thì Excel vốn đã không biểu diễn nổi.
 *  2. Number → String — cho biểu diễn ngắn nhất mà vẫn round-trip: "0.357", "2311.76".
 */
function numText(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return String(Number(n.toPrecision(15)));
}

function extractXlsx(buf: Buffer, entries: ZipEntry[]): string {
  // Shared strings table — cells with t="s" hold an index into this list.
  const shared: string[] = [];
  const ss = entries.find((x) => x.name === 'xl/sharedStrings.xml');
  if (ss) {
    const xml = readEntry(buf, ss);
    const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
    let m: RegExpExecArray | null;
    while ((m = siRe.exec(xml))) {
      const runs = m[1].match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) || [];
      shared.push(decodeXmlEntities(runs.map((r) => r.replace(/<[^>]+>/g, '')).join('')));
    }
  }

  const styles = dateStyles(buf, entries);

  // Tên sheet thật, theo đúng thứ tự người dùng thấy trong Excel: workbook.xml cho tên + r:id,
  // file .rels cho r:id → đường dẫn. Tên "Bảng giá" nói được nhiều hơn hẳn "Sheet 1".
  const relTarget = new Map<string, string>();
  const rels = entries.find((x) => x.name === 'xl/_rels/workbook.xml.rels');
  if (rels) {
    const xml = readEntry(buf, rels);
    const re = /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) relTarget.set(m[1], m[2].replace(/^\/?(xl\/)?/, ''));
  }
  const ordered: { name: string; part: string }[] = [];
  const wb = entries.find((x) => x.name === 'xl/workbook.xml');
  if (wb) {
    const xml = readEntry(buf, wb);
    const re = /<sheet\b([^>]*)\/?>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) {
      const name = decodeXmlEntities(/name="([^"]*)"/.exec(m[1])?.[1] ?? '');
      const rid = /r:id="([^"]+)"/.exec(m[1])?.[1] ?? '';
      const target = relTarget.get(rid);
      if (target) ordered.push({ name, part: `xl/${target}` });
    }
  }
  const sheets = ordered.length
    ? ordered
        .map((o) => ({ name: o.name, entry: entries.find((x) => x.name === o.part) }))
        .filter((o): o is { name: string; entry: ZipEntry } => !!o.entry)
    : entries
        .filter((x) => /^xl\/worksheets\/sheet\d+\.xml$/.test(x.name))
        .sort((a, b) => partNum(a.name, /sheet(\d+)\.xml$/) - partNum(b.name, /sheet(\d+)\.xml$/))
        .map((entry, i) => ({ name: `Sheet ${i + 1}`, entry }));

  const out: string[] = [];
  sheets.forEach((sheet, idx) => {
    const xml = readEntry(buf, sheet.entry);
    const rows: string[] = [];
    const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
    let rm: RegExpExecArray | null;
    while ((rm = rowRe.exec(xml))) {
      // Mảng THƯA theo chỉ số cột thật. Bản cũ chỉ push ô nào có giá trị, nên một dòng bỏ trống
      // cột B là mọi thứ phía sau dồn sang trái một ô — bảng vẫn "có dữ liệu" nhưng số tiền
      // nằm dưới nhầm tiêu đề. Sai lặng lẽ kiểu đó nguy hiểm hơn hẳn việc không đọc được.
      const cells: string[] = [];
      let col = -1;
      const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
      let cm: RegExpExecArray | null;
      while ((cm = cellRe.exec(rm[1]))) {
        const attrs = cm[1];
        const inner = cm[2];
        const ref = /\br="([A-Z]+\d+)"/i.exec(attrs)?.[1];
        col = ref ? colIndex(ref) : col + 1; // không có r → ô kế tiếp, đúng theo đặc tả OOXML
        if (col < 0 || col > 1023) continue;

        let val = '';
        if (/\bt="(?:inlineStr|str)"/.test(attrs)) {
          const t = inner.match(/<t\b[^>]*>([\s\S]*?)<\/t>/);
          val = t ? decodeXmlEntities(t[1].replace(/<[^>]+>/g, '')) : '';
        } else {
          const v = inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
          const raw = v ? v[1] : '';
          if (/\bt="s"/.test(attrs)) {
            const i = Number(raw);
            val = Number.isInteger(i) && shared[i] !== undefined ? shared[i] : '';
          } else if (/\bt="b"/.test(attrs)) {
            val = raw === '1' ? 'TRUE' : 'FALSE';
          } else if (/\bt="e"/.test(attrs)) {
            val = decodeXmlEntities(raw); // #N/A, #REF! … giữ nguyên, đó là nội dung thật của ô
          } else if (raw !== '') {
            const sIdx = Number(/\bs="(\d+)"/.exec(attrs)?.[1] ?? '-1');
            const dk = sIdx >= 0 ? styles[sIdx] : null;
            val = dk ? serialToDate(Number(raw), dk) : numText(raw);
          }
        }
        // Tab là dấu phân cột, xuống dòng là dấu phân hàng — ô chứa chúng sẽ phá vỡ bảng.
        if (val) cells[col] = val.replace(/[\t\r\n]+/g, ' ').trim();
      }
      if (cells.length) {
        const line: string[] = [];
        for (let i = 0; i < cells.length; i += 1) line.push(cells[i] ?? '');
        while (line.length && line[line.length - 1] === '') line.pop();
        if (line.length) rows.push(line.join('\t'));
      }
    }
    // Luôn ghi tên sheet, kể cả khi chỉ có một: bản xem trước dựa vào mốc này để dựng lại bảng,
    // và người đọc biết dữ liệu đến từ đâu.
    if (rows.length) out.push(`# Sheet: ${sheet.name || `Sheet ${idx + 1}`}\n` + rows.join('\n'));
  });
  return out.join('\n\n');
}
