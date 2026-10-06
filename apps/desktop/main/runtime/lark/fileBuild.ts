/**
 * Dựng tệp Office/CSV để agent GỬI TRẢ người dùng — nửa còn thiếu của `ooxml.ts`.
 *
 * `ooxml.ts` chỉ biết GIẢI NÉN để đọc tệp người ta gửi tới. Chiều ngược lại chưa có gì cả: không
 * bộ ghi, không lời gọi upload, và lượt Lark cũng không được cấp `Write`/`Bash` của CLI. Nên dù
 * người dùng có train kiểu gì, agent cũng không tạo nổi một `.xlsx` để đưa lại.
 *
 * KHÔNG THÊM THƯ VIỆN. `.xlsx` và `.docx` chỉ là ZIP chứa vài phần XML, mà Node có sẵn
 * `deflateRawSync`. Thêm `exceljs`/`docx` vào đây là kéo vài chục MB phụ thuộc vào bản cài desktop
 * cho một việc mà phần khó duy nhất là viết đúng bảng ZIP trung tâm — chuyện làm một lần.
 *
 * PDF KHÔNG nằm ở đây: dựng PDF từ số không thì chữ Việt và bảng biểu đều tệ. Bản desktop có
 * Electron nên `printToPDF` cho kết quả thật; nó cần `electron` nên ở riêng `filePdf.ts`, để
 * module này vẫn dùng được ở bản chạy nền trên VM (chỗ không có Electron).
 */
import { deflateRawSync } from 'node:zlib';

export type FileFormat = 'xlsx' | 'docx' | 'csv' | 'md' | 'txt' | 'html';

/** Bảng cho `.xlsx`/`.csv`: hàng đầu là tiêu đề cột. Ô để trống được, không cần đủ cột. */
export interface SheetData {
  /** Tên sheet trong Excel. Excel cấm : \ / ? * [ ] và giới hạn 31 ký tự. */
  name?: string;
  rows: (string | number | null | undefined)[][];
}

// ── ZIP ────────────────────────────────────────────────────────────────────────────────
// Chỉ dùng DEFLATE (8) — cùng thứ mà chính Office phát ra, và là thứ `ooxml.ts` đọc được.

const SIG_LFH = 0x04034b50;
const SIG_CDH = 0x02014b50;
const SIG_EOCD = 0x06054b50;

/**
 * CRC-32 (IEEE). ZIP bắt buộc có, và sai thì Excel báo "tệp hỏng" chứ không mở chế độ sửa —
 * nên đây là chỗ không được phép làm ẩu.
 */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

interface ZipItem {
  path: string;
  data: Buffer;
}

/**
 * Gói các phần thành một ZIP hợp lệ.
 *
 * Mốc thời gian để CỐ ĐỊNH (1980-01-01) chứ không lấy giờ hiện tại: cùng dữ liệu vào phải ra
 * cùng byte, nếu không thì không bài kiểm nào so được kết quả, và hai lần chạy cùng một báo cáo
 * lại ra hai tệp khác nhau.
 */
export function zip(items: ZipItem[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const it of items) {
    const name = Buffer.from(it.path, 'utf8');
    const crc = crc32(it.data);
    const deflated = deflateRawSync(it.data);
    // Nén mà PHÌNH ra thì lưu nguyên (STORE) — gặp ở tệp bé, và `ooxml.ts` đọc được cả hai.
    const useStore = deflated.length >= it.data.length;
    const body = useStore ? it.data : deflated;
    const method = useStore ? 0 : 8;

    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(SIG_LFH, 0);
    lfh.writeUInt16LE(20, 4); // cần bản 2.0 để đọc
    lfh.writeUInt16LE(0x0800, 6); // cờ: tên tệp là UTF-8
    lfh.writeUInt16LE(method, 8);
    lfh.writeUInt16LE(0, 10); // giờ
    lfh.writeUInt16LE(33, 12); // ngày = 1980-01-01
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(body.length, 18);
    lfh.writeUInt32LE(it.data.length, 22);
    lfh.writeUInt16LE(name.length, 26);
    lfh.writeUInt16LE(0, 28);
    locals.push(lfh, name, body);

    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(SIG_CDH, 0);
    cdh.writeUInt16LE(20, 4);
    cdh.writeUInt16LE(20, 6);
    cdh.writeUInt16LE(0x0800, 8);
    cdh.writeUInt16LE(method, 10);
    cdh.writeUInt16LE(0, 12);
    cdh.writeUInt16LE(33, 14);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(body.length, 20);
    cdh.writeUInt32LE(it.data.length, 24);
    cdh.writeUInt16LE(name.length, 28);
    cdh.writeUInt32LE(0, 38); // thuộc tính ngoài
    cdh.writeUInt32LE(offset, 42);
    centrals.push(cdh, name);

    offset += lfh.length + name.length + body.length;
  }

  const central = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(SIG_EOCD, 0);
  eocd.writeUInt16LE(items.length, 8);
  eocd.writeUInt16LE(items.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, eocd]);
}

// ── XML ────────────────────────────────────────────────────────────────────────────────

/**
 * Thoát ký tự cho XML, và BỎ các ký tự điều khiển XML 1.0 không cho phép.
 *
 * Dữ liệu ở đây tới từ ô Lark Base do người dùng gõ — chỉ cần một ký tự 0x0B lọt vào là Excel
 * từ chối mở cả tệp, mà lỗi nó báo thì không hề nhắc tới ký tự nào.
 */
export function xmlEscape(s: string): string {
  return String(s)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Tên sheet hợp lệ với Excel: bỏ ký tự cấm, cắt 31, rỗng thì đặt tên mặc định. */
export function safeSheetName(name: string | undefined): string {
  const s = String(name ?? '').replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31);
  return s || 'Sheet1';
}

/** Cột 0 → "A", 25 → "Z", 26 → "AA". */
export function colName(i: number): string {
  let n = i;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

// ── .xlsx ──────────────────────────────────────────────────────────────────────────────

/**
 * Dựng `.xlsx` một sheet.
 *
 * Dùng inline string (`t="inlineStr"`) chứ không dùng bảng sharedStrings: sharedStrings tiết kiệm
 * dung lượng khi có nhiều ô lặp, nhưng thêm một phần XML nữa phải giữ đồng bộ chỉ số — đổi lấy
 * một lớp sai lệch âm thầm (lệch chỉ số thì ô hiện SAI CHỮ chứ không báo lỗi) để tiết kiệm vài
 * chục KB. Báo cáo ở đây tính bằng nghìn dòng, không phải triệu.
 */
export function buildXlsx(sheet: SheetData): Buffer {
  const rows = sheet.rows ?? [];
  const body = rows
    .map((row, r) => {
      const cells = (row ?? [])
        .map((v, c) => {
          if (v === null || v === undefined || v === '') return '';
          const ref = `${colName(c)}${r + 1}`;
          // Số phải vào ô dạng SỐ, không phải chữ — nếu không thì Excel không cộng được, và đó
          // đúng là việc người ta mở báo cáo ra để làm. Chuỗi "007" hay "0123456789" thì giữ
          // nguyên dạng chữ: ép thành số là mất số 0 đầu (mã khách, số điện thoại).
          const isNum =
            typeof v === 'number' ||
            (/^-?\d+(\.\d+)?$/.test(String(v)) && !/^0\d/.test(String(v)) && Number.isFinite(Number(v)));
          return isNum
            ? `<c r="${ref}"><v>${Number(v)}</v></c>`
            : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(v))}</t></is></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');

  const sheetXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetData>${body}</sheetData></worksheet>`;

  const name = xmlEscape(safeSheetName(sheet.name));
  return zip([
    {
      path: '[Content_Types].xml',
      data: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
          '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
          '</Types>',
        'utf8',
      ),
    },
    {
      path: '_rels/.rels',
      data: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
          '</Relationships>',
        'utf8',
      ),
    },
    {
      path: 'xl/workbook.xml',
      data: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
          'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
          `<sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
        'utf8',
      ),
    },
    {
      path: 'xl/_rels/workbook.xml.rels',
      data: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
          '</Relationships>',
        'utf8',
      ),
    },
    { path: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheetXml, 'utf8') },
  ]);
}

// ── .docx ──────────────────────────────────────────────────────────────────────────────

/**
 * Dựng `.docx` từ văn bản thuần (hoặc Markdown rất nhẹ: `# `, `## `, `- `).
 *
 * Không cố dựng lại Markdown đầy đủ. Thứ agent trả về là báo cáo — tiêu đề, đoạn văn, gạch đầu
 * dòng. Bảng phức tạp thì đã có `.xlsx`, chỗ nó vốn thuộc về.
 */
export function buildDocx(text: string): Buffer {
  const paras = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      const h1 = /^#\s+(.*)$/.exec(line);
      const h2 = /^##\s+(.*)$/.exec(line);
      const li = /^[-*]\s+(.*)$/.exec(line);
      const raw = h1?.[1] ?? h2?.[1] ?? li?.[1] ?? line;
      const runProps = h1 ? '<w:rPr><w:b/><w:sz w:val="32"/></w:rPr>' : h2 ? '<w:rPr><w:b/><w:sz w:val="26"/></w:rPr>' : '';
      const body = li ? `• ${raw}` : raw;
      return (
        '<w:p>' +
        (h1 || h2 ? '' : '') +
        `<w:r>${runProps}<w:t xml:space="preserve">${xmlEscape(body)}</w:t></w:r>` +
        '</w:p>'
      );
    })
    .join('');

  return zip([
    {
      path: '[Content_Types].xml',
      data: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
          '</Types>',
        'utf8',
      ),
    },
    {
      path: '_rels/.rels',
      data: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
          '</Relationships>',
        'utf8',
      ),
    },
    {
      path: 'word/document.xml',
      data: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
          `<w:body>${paras}</w:body></w:document>`,
        'utf8',
      ),
    },
  ]);
}

// ── .csv ───────────────────────────────────────────────────────────────────────────────

/**
 * CSV kèm BOM UTF-8. BOM là bắt buộc trên thực tế: thiếu nó thì Excel trên Windows đọc CSV theo
 * bảng mã địa phương và mọi chữ tiếng Việt thành ký tự lạ — người dùng sẽ báo "tệp hỏng".
 */
export function buildCsv(rows: (string | number | null | undefined)[][]): Buffer {
  const body = (rows ?? [])
    .map((r) =>
      (r ?? [])
        .map((v) => {
          const s = v === null || v === undefined ? '' : String(v);
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(','),
    )
    .join('\r\n');
  return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(body, 'utf8')]);
}

// ── HTML (dùng cho PDF, và tự nó cũng là một định dạng trả về được) ────────────────────

/** Trang HTML tự chứa để `printToPDF` dựng thành PDF, hoặc trả thẳng cho người dùng. */
export function buildHtml(title: string, bodyText: string, table?: SheetData): string {
  const esc = (s: string) => xmlEscape(s);
  const rows = table?.rows ?? [];
  const tableHtml = rows.length
    ? '<table>' +
      rows
        .map((r, i) => {
          const tag = i === 0 ? 'th' : 'td';
          return `<tr>${(r ?? []).map((c) => `<${tag}>${esc(String(c ?? ''))}</${tag}>`).join('')}</tr>`;
        })
        .join('') +
      '</table>'
    : '';
  const paras = String(bodyText ?? '')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => `<p>${esc(l)}</p>`)
    .join('');
  return (
    '<!doctype html><html lang="vi"><head><meta charset="utf-8">' +
    `<title>${esc(title)}</title><style>` +
    // Bộ chữ hệ thống có dấu tiếng Việt đầy đủ; không tải phông từ mạng vì lượt chạy có thể
    // diễn ra lúc không có mạng, và một trang chờ phông sẽ in ra PDF trống.
    'body{font:13px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;margin:32px;color:#111}' +
    'h1{font-size:19px;margin:0 0 14px}p{margin:0 0 8px}' +
    'table{border-collapse:collapse;width:100%;margin-top:12px}' +
    'th,td{border:1px solid #d0d5dd;padding:6px 8px;text-align:left;vertical-align:top}' +
    'th{background:#f4f6f8;font-weight:600}' +
    '</style></head><body>' +
    `<h1>${esc(title)}</h1>${paras}${tableHtml}</body></html>`
  );
}

/** Đuôi tệp + kiểu MIME cho mỗi định dạng — dùng chung khi upload lên Lark. */
export const FORMAT_META: Record<FileFormat | 'pdf', { ext: string; mime: string }> = {
  xlsx: { ext: '.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  docx: { ext: '.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  pdf: { ext: '.pdf', mime: 'application/pdf' },
  csv: { ext: '.csv', mime: 'text/csv' },
  md: { ext: '.md', mime: 'text/markdown' },
  txt: { ext: '.txt', mime: 'text/plain' },
  html: { ext: '.html', mime: 'text/html' },
};

/**
 * Tên tệp an toàn cho mọi hệ điều hành, GIỮ dấu tiếng Việt.
 *
 * Không bỏ dấu: người dùng đặt tên "Báo cáo thu tiền tháng 9" thì tệp nhận được phải đọc được
 * như thế. Chỉ bỏ các ký tự mà Windows/macOS thật sự cấm, và chặn `..`/dấu phân cách để một cái
 * tên do model sinh ra không trỏ ra ngoài thư mục.
 */
export function safeFileName(name: string, fallback = 'ket-qua'): string {
  const base = String(name ?? '')
    .replace(/[ -<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 120)
    .trim();
  return base || fallback;
}

// ── Nhận ra tệp CLI vừa tạo trong thư mục làm việc ────────────────────────────────────

/** Đuôi tệp đáng đưa lên hội thoại. Danh sách CHO PHÉP, không phải danh sách cấm: CLI hay để lại
 *  đủ thứ rác trong thư mục làm việc (.tmp, .log, script nháp), và mỗi thứ đó thành một thẻ tải
 *  thì hội thoại loạn hơn là hữu ích. */
const DELIVERABLE = /\.(xlsx|xls|docx|doc|pptx|pdf|csv|md|txt|json|html?|png|jpe?g|svg|zip)$/i;
/** Tệp lớn hơn thì gần như chắc chắn không phải thứ người dùng muốn nhận qua hội thoại. */
const MAX_DELIVER_BYTES = 50 * 1024 * 1024;
/** Trần số thẻ mỗi lượt — một lượt lỡ sinh 200 tệp thì hội thoại không dùng được nữa. */
const MAX_DELIVER_COUNT = 10;

/** Ảnh chụp thư mục: tên tệp → thời điểm sửa (ms). Chỉ một cấp, không đệ quy. */
export async function snapshotDir(dir: string): Promise<Map<string, number>> {
  const { readdir, stat } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const out = new Map<string, number>();
  try {
    for (const name of await readdir(dir)) {
      try {
        const st = await stat(join(dir, name));
        if (st.isFile()) out.set(name, st.mtimeMs);
      } catch {
        /* biến mất giữa chừng — coi như chưa có */
      }
    }
  } catch {
    /* chưa có thư mục */
  }
  return out;
}

/**
 * Tệp MỚI hoặc ĐÃ ĐỔI kể từ ảnh chụp.
 *
 * Xét cả tệp đã đổi chứ không chỉ tệp mới: người dùng bảo "sửa lại cột ngày trong file vừa rồi"
 * thì agent ghi đè đúng tệp cũ — chỉ xét tên mới thì bản sửa không bao giờ hiện ra, và người dùng
 * tải lại đúng bản chưa sửa.
 */
export async function newFilesSince(
  dir: string,
  before: Map<string, number>,
): Promise<{ name: string; path: string; mime: string; bytes: number }[]> {
  const { readdir, stat } = await import('node:fs/promises');
  const { extname, join } = await import('node:path');
  const out: { name: string; path: string; mime: string; bytes: number }[] = [];
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return out;
  }
  for (const name of names.sort()) {
    if (out.length >= MAX_DELIVER_COUNT) break;
    if (name.startsWith('.') || !DELIVERABLE.test(name)) continue;
    try {
      const p = join(dir, name);
      const st = await stat(p);
      if (!st.isFile() || st.size === 0 || st.size > MAX_DELIVER_BYTES) continue;
      const was = before.get(name);
      if (was !== undefined && was >= st.mtimeMs) continue; // có từ trước và không đổi
      const ext = extname(name).slice(1).toLowerCase() as keyof typeof FORMAT_META;
      out.push({ name, path: p, mime: FORMAT_META[ext]?.mime ?? 'application/octet-stream', bytes: st.size });
    } catch {
      /* bỏ qua tệp đọc không được */
    }
  }
  return out;
}
