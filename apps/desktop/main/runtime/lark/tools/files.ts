/**
 * `create_file` — agent DỰNG một tệp rồi đưa lại cho người dùng.
 *
 * Trước bản này cả ba tầng đều trống: `ooxml.ts` chỉ giải nén để ĐỌC, client chỉ biết tải XUỐNG,
 * và lượt Lark không được cấp `Write`/`Bash` của CLI. Nên người dùng có train kiểu gì thì agent
 * cũng không tạo nổi một `.xlsx` để gửi trả — nó chỉ dán được bảng dưới dạng chữ trong hội thoại.
 *
 * MẶC ĐỊNH TRẢ VỀ HỘI THOẠI. Tệp ghi ra thư mục của chính lượt chat đó và trả về đường dẫn, để
 * giao diện hiện một thẻ bấm là mở. Chỉ khi người dùng nói rõ ("gửi vào nhóm X", "đính vào dòng
 * này", "lưu lên Drive") thì mới gọi thêm — đó là các thao tác GHI ra ngoài, không được tự ý làm.
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { currentTurnFiles, resolveToolFile, setGlobalOutDir, turnOutDir } from '../fileContext';
import { buildFilePreview } from '../filePreview';
import { extractOfficeText, officeKindFor } from '../ooxml';
import { enc, type LarkToolDef, str } from './types';
import {
  FORMAT_META,
  buildCsv,
  buildDocx,
  buildHtml,
  buildXlsx,
  editXlsx,
  safeFileName,
  type CellEdit,
  type SheetData,
} from '../fileBuild';

/**
 * Thư mục ghi tệp của lượt hiện tại — cùng cơ chế với `setAttachmentDir`. Giá trị đặt ở đây chỉ là
 * DỰ PHÒNG: lượt nào truyền ngữ cảnh tệp (`withTurnFiles`, xem fileContext.ts) thì ngữ cảnh đó thắng,
 * nên hai lượt chạy song song không ghi đè thư mục của nhau.
 */
export function setFileOutDir(dir: string | null): void {
  setGlobalOutDir(dir);
}
/** Thư mục ghi tệp của lượt hiện tại (công cụ đưa tệp lên Lark dùng để chốt đường dẫn). */
export function getFileOutDir(): string | null {
  return turnOutDir();
}

/**
 * Tải tệp lên máy chủ Larkwave — để nó SỐNG như một hội thoại, không chỉ nằm trên một máy.
 *
 * Hội thoại được sao lưu theo tài khoản nên mở ở máy khác vẫn còn; tệp thì trước đây chỉ nằm
 * trong thư mục của máy vừa tạo ra nó. Tiêm từ ngoài vì tầng tool không có token tài khoản
 * (và không nên có) — `larkService` là nơi giữ nó.
 *
 * BEST-EFFORT: hỏng thì vẫn trả tệp cục bộ, không làm hỏng cả lượt. Mất mạng lúc đó không có
 * nghĩa là người dùng mất luôn báo cáo vừa dựng.
 */
type FileUploader = (f: { name: string; bytes: Buffer; mime: string }) => Promise<string | null>;
let UPLOAD: FileUploader | null = null;
export function setFileUploader(fn: FileUploader | null): void {
  UPLOAD = fn;
}

/** PDF cần Electron nên tiêm từ ngoài; bản chạy nền trên VM không đăng ký gì và PDF tự tắt. */
type PdfMaker = (html: string) => Promise<Buffer>;
let PDF: PdfMaker | null = null;
export function setPdfMaker(fn: PdfMaker | null): void {
  PDF = fn;
}

const FORMATS = ['xlsx', 'csv', 'docx', 'pdf', 'md', 'txt', 'html'] as const;
type Format = (typeof FORMATS)[number];

/** Bảng quá lớn thì tệp không mở nổi, và lượt chạy hết giờ trước khi ghi xong. */
const MAX_ROWS = 50_000;
const MAX_COLS = 256;

function normRows(rows: unknown): (string | number | null)[][] {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, MAX_ROWS).map((r) =>
    (Array.isArray(r) ? r : [r]).slice(0, MAX_COLS).map((c) => {
      if (c === null || c === undefined) return null;
      if (typeof c === 'number' || typeof c === 'string') return c;
      if (typeof c === 'boolean') return c ? 'true' : 'false';
      // Ô Bitable có thể là object (người phụ trách, liên kết…). Dán JSON thô vào báo cáo thì
      // người đọc nhận một mớ dấu ngoặc; lấy phần chữ dễ đọc nếu có.
      const o = c as Record<string, unknown>;
      return String(o.text ?? o.name ?? o.value ?? JSON.stringify(c));
    }),
  );
}

export const fileTools: LarkToolDef[] = [
  {
    name: 'create_file',
    description:
      'TẠO một tệp để gửi trả người dùng: Excel (.xlsx), CSV, Word (.docx), PDF, Markdown, text hoặc HTML. ' +
      'GỌI TOOL NÀY mỗi khi người dùng nói "xuất ra Excel", "gửi file", "làm báo cáo PDF", "tải về"… — ' +
      'đừng dán bảng dưới dạng chữ trong hội thoại rồi bảo là đã xuất tệp. ' +
      'Dữ liệu dạng BẢNG (xlsx/csv) thì truyền `rows`, hàng ĐẦU TIÊN là tên cột. ' +
      'Excel NHIỀU SHEET: truyền `sheets` (mỗi phần tử {name, rows, merges}) thay cho `rows`. ' +
      'CÔNG THỨC: để một ô là chuỗi bắt đầu bằng "=" (vd "=SUM(B2:B10)", "=A2*C2") — Excel tự tính khi mở. ' +
      'GỘP Ô: truyền `merges` dạng ["A1:D1"] (vd tiêu đề trải ngang). ' +
      'Dữ liệu dạng VĂN BẢN (docx/md/txt) thì truyền `text`. PDF và HTML nhận cả hai: `text` làm phần ' +
      'diễn giải, `rows` thành bảng bên dưới. ' +
      'ĐIỀN VÀO MẪU có sẵn (file .xlsx người dùng gửi, giữ nguyên form/công thức/định dạng): KHÔNG dùng ' +
      'tool này — dùng `fill_xlsx`. ' +
      'Tệp tạo xong TỰ HIỆN thành thẻ bấm-để-mở ngay trong hội thoại, và được lưu lại cùng hội thoại — ' +
      'người dùng không phải đi tìm ở đâu cả. ' +
      'TUYỆT ĐỐI KHÔNG tự đẩy tệp lên Lark (Drive / Base / nhóm chat) cho "chắc ăn": làm vậy người dùng ' +
      'phải đi lục Lark Drive để tìm thứ đáng lẽ nằm ngay trước mặt, và đó là phàn nàn đã có thật. ' +
      'Cũng KHÔNG tạo Bitable/Sheet mới thay cho việc xuất tệp. ' +
      'Chỉ gọi send_file khi người dùng nói RÕ họ muốn gửi đi đâu.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['format', 'name'],
      properties: {
        format: { type: 'string', enum: [...FORMATS], description: 'Định dạng tệp cần tạo.' },
        name: str('Tên tệp, KHÔNG kèm đuôi. Cứ đặt tiếng Việt có dấu, vd "Báo cáo thu tiền tháng 9".'),
        rows: {
          type: 'array',
          description: 'Bảng dữ liệu; mỗi phần tử là một hàng. Hàng đầu tiên là TÊN CỘT. Ô bắt đầu bằng "=" là CÔNG THỨC.',
          items: { type: 'array', items: {} },
        },
        sheets: {
          type: 'array',
          description:
            'Excel NHIỀU SHEET: mỗi phần tử {name, rows, merges}. Dùng cái này THAY cho `rows` khi cần >1 sheet.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: str('Tên sheet.'),
              rows: { type: 'array', description: 'Hàng của sheet; hàng đầu là tên cột.', items: { type: 'array', items: {} } },
              merges: { type: 'array', description: 'Ô gộp, vd ["A1:D1"].', items: { type: 'string' } },
            },
          },
        },
        merges: {
          type: 'array',
          description: 'Ô gộp cho sheet đơn (khi dùng `rows`), vd ["A1:D1"].',
          items: { type: 'string' },
        },
        text: str('Nội dung văn bản (docx/md/txt), hoặc phần diễn giải đặt trên bảng (pdf/html).'),
        sheet_name: str('Tên sheet trong Excel. Bỏ trống thì lấy theo tên tệp.'),
      },
    },
    // Không gated: chỉ ghi một tệp vào thư mục tạm của lượt chat này, không đụng dữ liệu Lark và
    // không gửi đi đâu. Bắt xác nhận ở đây thì mỗi báo cáo lại chặn một lượt chạy tự động.
    gated: false,
    async exec(input) {
      const format = String(input.format || '').toLowerCase() as Format;
      if (!FORMATS.includes(format)) {
        throw new Error(`Định dạng "${input.format}" không hỗ trợ. Dùng một trong: ${FORMATS.join(', ')}.`);
      }
      const OUT_DIR = getFileOutDir();
      if (!OUT_DIR) throw new Error('Chưa có thư mục ghi tệp cho lượt này.');

      const rows = normRows(input.rows);
      const text = typeof input.text === 'string' ? input.text : '';
      const base = safeFileName(String(input.name || ''), 'ket-qua');
      const meta = FORMAT_META[format];
      const normMerges = (m: unknown): string[] | undefined =>
        Array.isArray(m) ? m.filter((x) => typeof x === 'string') : undefined;
      // Nhiều sheet: mỗi phần tử {name, rows, merges}. Chuẩn hoá y như sheet đơn.
      const multi: SheetData[] = Array.isArray(input.sheets)
        ? (input.sheets as Record<string, unknown>[]).map((s, i) => ({
            name: String(s?.name || `Sheet${i + 1}`),
            rows: normRows(s?.rows),
            merges: normMerges(s?.merges),
          }))
        : [];
      const sheet: SheetData = { name: String(input.sheet_name || base), rows, merges: normMerges(input.merges) };
      const hasTable = rows.length > 0 || multi.some((s) => s.rows.length > 0);
      if (!hasTable && !text.trim()) {
        throw new Error('Không có nội dung: truyền `rows`/`sheets` (bảng) hoặc `text` (văn bản).');
      }

      let bytes: Buffer;
      if (format === 'xlsx') {
        if (!hasTable) throw new Error('Excel cần `rows` hoặc `sheets`. Nội dung chỉ có chữ thì dùng docx/pdf/txt.');
        bytes = buildXlsx(multi.length ? multi : sheet);
      } else if (format === 'csv') {
        if (!rows.length) throw new Error('CSV cần `rows`.');
        bytes = buildCsv(rows);
      } else if (format === 'docx') {
        bytes = buildDocx(text || rows.map((r) => r.join('\t')).join('\n'));
      } else if (format === 'html') {
        bytes = Buffer.from(buildHtml(base, text, sheet), 'utf8');
      } else if (format === 'pdf') {
        if (!PDF) {
          // Nói rõ vì sao và đưa lối đi tiếp, thay vì để agent thử lại PDF mãi rồi hết giờ.
          throw new Error(
            'Bản đang chạy không dựng được PDF (chỉ app desktop mới có). Hãy tạo .docx hoặc .html thay thế.',
          );
        }
        bytes = await PDF(buildHtml(base, text, sheet));
      } else {
        bytes = Buffer.from(text || rows.map((r) => r.join('\t')).join('\n'), 'utf8');
      }

      await mkdir(OUT_DIR, { recursive: true });
      const fileName = `${base}${meta.ext}`;
      const path = join(OUT_DIR, fileName);
      await writeFile(path, bytes);

      // Sao lưu lên máy chủ tài khoản, để tệp mở lại được ở máy khác — giống hệt cách hội thoại
      // đi theo tài khoản. Nuốt lỗi có chủ ý: tệp cục bộ đã ghi xong rồi, một lần mạng chập
      // không được phép biến lượt chạy thành thất bại.
      const uploadId = UPLOAD && !currentTurnFiles()?.noUpload ? await UPLOAD({ name: fileName, bytes, mime: meta.mime }).catch(() => null) : null;

      return {
        ok: true,
        file_name: fileName,
        path,
        ...(uploadId ? { upload_id: uploadId } : {}),
        mime: meta.mime,
        bytes: bytes.length,
        rows: rows.length || undefined,
        // Nói thẳng cho model biết việc đã xong và KHÔNG cần gửi thêm — nếu không nó hay
        // "gửi cho chắc" vào một nhóm Lark mà người dùng chưa hề nhắc tới.
        note:
          'XONG. Tệp đã hiện thành thẻ bấm-để-mở trong hội thoại và được lưu cùng hội thoại' +
          (uploadId ? ' (đã sao lưu lên máy chủ, máy khác mở cũng thấy).' : '.') +
          ' KHÔNG đẩy lên Lark Drive/Base và KHÔNG gửi đi đâu nữa — người dùng đã có tệp rồi.',
      };
    },
  },

  {
    name: 'fill_xlsx',
    description:
      'ĐIỀN dữ liệu vào một file Excel (.xlsx) CÓ SẴN mà người dùng gửi, rồi trả lại file đã điền — ' +
      'GIỮ NGUYÊN form: công thức, định dạng, các sheet khác, ô gộp đều không đụng; chỉ các ô bạn chỉ ' +
      'định mới đổi giá trị. Gọi tool này khi người dùng nói "điền vào file này", "nhập số liệu vào mẫu", ' +
      '"fill đúng theo form tôi gửi"… — ĐỪNG dựng file mới bằng create_file (sẽ mất form của họ). ' +
      'Trước khi điền: hãy ĐỌC file mẫu (Read) để biết ô nào cần điền gì, rồi liệt kê các ô trong `edits`. ' +
      '`source_path` = đường dẫn file mẫu người dùng đính kèm (đúng như đã thấy khi đọc). ' +
      'Mỗi `edits[]` = {cell:"B5", value:…, sheet?:"Sheet1"}. value bắt đầu bằng "=" là công thức. ' +
      'File điền xong tự hiện thành thẻ bấm-để-mở trong hội thoại.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['source_path', 'edits'],
      properties: {
        source_path: str('Đường dẫn file .xlsx mẫu người dùng gửi (lấy từ danh sách tệp đính kèm / lúc bạn Read nó).'),
        edits: {
          type: 'array',
          description: 'Danh sách ô cần điền. Mỗi phần tử {cell, value, sheet?}.',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['cell', 'value'],
            properties: {
              cell: str('Ô cần điền, dạng "B5".'),
              value: { description: 'Giá trị điền (số/chữ). Bắt đầu bằng "=" là công thức. null = xoá ô.' },
              sheet: str('Tên sheet (bỏ trống = sheet đầu tiên).'),
            },
          },
        },
        name: str('Tên file kết quả (không kèm đuôi). Bỏ trống thì lấy theo tên file gốc + " - đã điền".'),
      },
    },
    // Không gated: chỉ ghi một file MỚI vào thư mục tạm của lượt này (không đụng file gốc của người
    // dùng, không gửi đi đâu) — cùng mức rủi ro với create_file.
    gated: false,
    async exec(input) {
      const OUT_DIR = getFileOutDir();
      if (!OUT_DIR) throw new Error('Chưa có thư mục ghi tệp cho lượt này.');
      const asked = String(input.source_path || '').trim();
      if (!asked) throw new Error('Thiếu `source_path` (đường dẫn file mẫu).');
      // Chỉ cho đọc file trong thư mục đính kèm / thư mục kết quả của lượt này, thư mục tự động hoá,
      // hoặc tệp của hội thoại cũ nhập từ Toolswave (tự chép sang Larkwave). `source_path` tới từ
      // model = dữ liệu không tin được; không chốt thì nó đọc được bất kỳ .xlsx nào trên máy. Luật
      // nằm ở filePaths (qua resolveToolFile) — không tự so chuỗi ở đây.
      const r = await resolveToolFile(asked);
      if (r.ok === false) throw new Error(`Chỉ điền được vào file người dùng đính kèm / file trong thư mục hội thoại: ${r.reason}`);
      const src = r.path;
      if (!/\.xlsx$/i.test(src)) throw new Error('fill_xlsx chỉ nhận file .xlsx. File khác thì dùng create_file.');
      const st = await stat(src).catch(() => null);
      if (!st?.isFile()) throw new Error(`Không tìm thấy file mẫu: ${basename(src)}`);

      const editsIn = Array.isArray(input.edits) ? (input.edits as Record<string, unknown>[]) : [];
      const edits: CellEdit[] = editsIn
        .map((e) => ({
          sheet: e?.sheet ? String(e.sheet) : undefined,
          cell: String(e?.cell || '').trim(),
          value:
            e?.value === null || e?.value === undefined
              ? null
              : typeof e.value === 'number'
                ? e.value
                : String(e.value),
        }))
        .filter((e) => /^[A-Za-z]+\d+$/.test(e.cell));
      if (!edits.length) throw new Error('`edits` rỗng hoặc không có ô hợp lệ (dạng {cell:"B5", value:…}).');

      const srcBytes = await readFile(src);
      const outBytes = editXlsx(srcBytes, edits);

      const base = safeFileName(String(input.name || ''), '') || `${safeFileName(basename(src).replace(/\.xlsx$/i, ''), 'ket-qua')} - đã điền`;
      const meta = FORMAT_META.xlsx;
      await mkdir(OUT_DIR, { recursive: true });
      const fileName = `${base}${meta.ext}`;
      const path = join(OUT_DIR, fileName);
      await writeFile(path, outBytes);
      const uploadId = UPLOAD && !currentTurnFiles()?.noUpload ? await UPLOAD({ name: fileName, bytes: outBytes, mime: meta.mime }).catch(() => null) : null;

      return {
        ok: true,
        file_name: fileName,
        path,
        ...(uploadId ? { upload_id: uploadId } : {}),
        mime: meta.mime,
        bytes: outBytes.length,
        filled_cells: edits.length,
        note:
          'XONG. Đã điền ' + edits.length + ' ô vào file mẫu, GIỮ NGUYÊN form/công thức/định dạng. ' +
          'File đã hiện thành thẻ bấm-để-mở trong hội thoại' +
          (uploadId ? ' (đã sao lưu lên máy chủ).' : '.') +
          ' KHÔNG gửi đi đâu nữa — người dùng đã có file rồi.',
      };
    },
  },

  {
    name: 'prepare_local_file',
    description:
      'CHUẨN BỊ + ĐỌC một tệp trên máy theo ĐƯỜNG DẪN trước khi làm gì với nó (đính vào Bitable, đưa lên Drive/Sheets/Docs, ' +
      'nhập vào bảng, điền mẫu…). Dùng khi người dùng/hội thoại nhắc tới một đường dẫn tệp — kể cả đường dẫn CŨ của app ' +
      'Toolswave (…/@toolswave/desktop/lark/work/<hội thoại>/…): tool tự CHÉP tệp đó sang thư mục hội thoại Larkwave (bản gốc ' +
      'giữ nguyên) và trả `path` MỚI — dùng `path` này cho các tool sau. Trả kèm xem trước (sheet/dòng/cột) và phần CHỮ đã trích ' +
      '(Excel/Word/CSV/text) để đọc ngay. Đường dẫn ngoài thư mục hội thoại / tệp đính kèm / thư mục tự động hoá bị từ chối.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['path'],
      properties: {
        path: str('Đường dẫn tệp đúng như người dùng/hội thoại đưa (tuyệt đối, hoặc tên tệp trong thư mục hội thoại).'),
        max_chars: { type: 'integer', description: 'Số ký tự chữ trả về để đọc (mặc định 12000, tối đa 60000).' },
      },
    },
    // Không gated: chỉ ĐỌC, và (khi là tệp Toolswave) chép một bản vào thư mục hội thoại của chính
    // người dùng — không đụng Lark, không gửi đi đâu.
    gated: false,
    async exec(input) {
      const r = await resolveToolFile(String(input.path || ''));
      if (r.ok === false) return { ok: false, error: r.reason };
      const st = await stat(r.path).catch(() => null);
      if (!st?.isFile()) return { ok: false, error: `Không tìm thấy tệp: ${basename(r.path)}` };
      const name = basename(r.path);
      const ext = extname(name).replace(/^\./, '').toLowerCase();
      const bytes = await readFile(r.path);
      const preview = buildFilePreview(name, bytes);
      const max = Math.max(500, Math.min(60_000, Number(input.max_chars) || 12_000));
      let text = '';
      let textPath: string | undefined;
      const kind = officeKindFor(name, '');
      if (kind) text = extractOfficeText(bytes, kind);
      else if (/^(csv|txt|md|json|tsv|xml|html?|log)$/.test(ext)) text = bytes.toString('utf8').replace(/^﻿/, '');
      if (text && text.length > max) {
        // Chữ dài: ghi đủ ra một tệp .txt (thư mục ẩn cạnh tệp) để đọc tiếp bằng Read/Grep.
        try {
          const dir = join(dirname(r.path), '.extract');
          await mkdir(dir, { recursive: true });
          textPath = join(dir, `${name}.txt`);
          await writeFile(textPath, text.slice(0, 2_000_000), 'utf8');
        } catch {
          textPath = undefined;
        }
      }
      return {
        ok: true,
        path: r.path,
        file_name: name,
        bytes: st.size,
        ...(r.copiedFrom ? { copied_from: r.copiedFrom } : {}),
        ...(r.note ? { note: r.note } : {}),
        ...(preview ? { preview } : {}),
        ...(text ? { text: text.slice(0, max), text_truncated: text.length > max } : {}),
        ...(textPath ? { text_path: textPath } : {}),
        next: 'Dùng `path` ở trên (KHÔNG dùng lại đường dẫn cũ) cho lark_web_attach_file / lark_web_drive_upload / lark_web_import_as_sheet / fill_xlsx …',
      };
    },
  },

  {
    name: 'send_file',
    description:
      'GỬI một tệp đã tạo bằng create_file đi nơi khác: vào một nhóm/chat Lark, đính vào ô đính kèm ' +
      'của một dòng Bitable, hoặc lưu lên Lark Drive. ' +
      'CHỈ gọi khi người dùng đã nói rõ muốn gửi đi đâu — mặc định tệp đã hiện sẵn trong hội thoại ' +
      'để họ tải, không cần gửi thêm. Truyền `path` đúng như create_file vừa trả về.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['path', 'to'],
      properties: {
        path: str('Đường dẫn tệp, lấy nguyên từ kết quả của create_file.'),
        to: {
          type: 'string',
          enum: ['chat', 'bitable', 'drive'],
          description: 'chat = gửi vào nhóm Lark; bitable = đính vào ô đính kèm của một dòng; drive = lưu lên Drive.',
        },
        chat_id: str('to=chat: id nhóm/chat nhận tệp (lấy từ messaging_list_chats).'),
        app_token: str('to=bitable: app_token của Base.'),
        table_id: str('to=bitable: table_id của bảng.'),
        record_id: str('to=bitable: id dòng cần đính tệp.'),
        field_name: str('to=bitable: TÊN cột đính kèm sẽ nhận tệp.'),
        folder_token: str('to=drive: token thư mục đích. Bỏ trống thì lưu vào thư mục gốc.'),
      },
    },
    // Gated: đây là thao tác đi RA NGOÀI — tệp xuất hiện trước mặt người khác trong một nhóm, hoặc
    // ghi đè một ô dữ liệu thật. Khác hẳn create_file vốn chỉ ghi vào thư mục tạm của lượt chat.
    gated: true,
    async exec(input, client) {
      const to = String(input.to || '');
      // Chỉ cho gửi tệp NẰM TRONG thư mục được phép của lượt này (thư mục hội thoại/kết quả, tệp đính
      // kèm, thư mục tự động hoá, hoặc bản chép từ hội thoại Toolswave đã nhập). Không có chốt này
      // thì một `path` do model sinh ra (hoặc do dữ liệu Base gợi ý) gửi được bất kỳ tệp nào trên máy
      // vào một nhóm Lark. Luật nằm ở filePaths (qua resolveToolFile) — một chỗ duy nhất.
      const resolved = await resolveToolFile(String(input.path || ''));
      if (resolved.ok === false) {
        throw new Error(`Chỉ gửi được tệp trong thư mục hội thoại / tự động hoá: ${resolved.reason}`);
      }
      const p = resolved.path;
      const st = await stat(p).catch(() => null);
      if (!st?.isFile()) throw new Error(`Không tìm thấy tệp: ${basename(p)}`);
      const bytes = await readFile(p);
      const name = basename(p);
      const mime = FORMAT_META[(name.split('.').pop() || '') as keyof typeof FORMAT_META]?.mime;

      if (to === 'chat') {
        const chatId = String(input.chat_id || '');
        if (!chatId) throw new Error('to=chat cần `chat_id`.');
        // `file_type: 'stream'` là kiểu tổng dùng cho mọi tệp không phải ảnh/audio/video — Lark
        // từ chối nếu khai một kiểu cụ thể mà đuôi tệp không khớp.
        const up = await client.uploadBinary('/open-apis/im/v1/files', { file_type: 'stream', file_name: name }, {
          name,
          bytes,
          ...(mime ? { mime } : {}),
        });
        const fileKey = String(up.file_key || '');
        if (!fileKey) throw new Error('Lark không trả về file_key khi tải tệp lên.');
        await client.request('POST', '/open-apis/im/v1/messages', {
          params: { receive_id_type: 'chat_id' },
          data: { receive_id: chatId, msg_type: 'file', content: JSON.stringify({ file_key: fileKey }) },
        });
        return { ok: true, sent_to: 'chat', chat_id: chatId, file_name: name };
      }

      if (to === 'drive') {
        const folder = String(input.folder_token || '');
        const up = await client.uploadBinary(
          '/open-apis/drive/v1/files/upload_all',
          { file_name: name, parent_type: 'explorer', parent_node: folder || undefined },
          { name, bytes, ...(mime ? { mime } : {}) },
        );
        return { ok: true, sent_to: 'drive', file_token: up.file_token, file_name: name };
      }

      if (to === 'bitable') {
        const appToken = String(input.app_token || '');
        const tableId = String(input.table_id || '');
        const recordId = String(input.record_id || '');
        const field = String(input.field_name || '');
        if (!appToken || !tableId || !recordId || !field) {
          throw new Error('to=bitable cần đủ `app_token`, `table_id`, `record_id`, `field_name`.');
        }
        // `extra` PHẢI là CHUỖI JSON. Đây đúng cái bẫy đã tốn một lần gỡ ở đường TẢI XUỐNG: truyền
        // object vào thì nó bị String() thành "[object Object]" và Lark trả 400 với thông báo
        // không hề nhắc tới `extra`.
        const up = await client.uploadBinary(
          '/open-apis/drive/v1/medias/upload_all',
          {
            file_name: name,
            parent_type: 'bitable_file',
            parent_node: appToken,
            extra: JSON.stringify({ drive_route_token: appToken }),
          },
          { name, bytes, ...(mime ? { mime } : {}) },
        );
        const token = String(up.file_token || '');
        if (!token) throw new Error('Lark không trả về file_token khi tải tệp lên Bitable.');
        // GHI THÊM chứ không ghi đè: ô đính kèm có thể đang giữ tệp khác, và mất tệp cũ của người
        // dùng vì ta vừa thêm một báo cáo là đổi một việc hữu ích thành một sự cố dữ liệu.
        const cur = (await client.request('GET', `/open-apis/bitable/v1/apps/${enc(appToken)}/tables/${enc(tableId)}/records/${enc(recordId)}`)) as {
          record?: { fields?: Record<string, unknown> };
        };
        const existing = Array.isArray(cur.record?.fields?.[field])
          ? (cur.record!.fields![field] as { file_token?: string }[])
              .map((a) => a?.file_token)
              .filter((t): t is string => !!t)
          : [];
        await client.request('PUT', `/open-apis/bitable/v1/apps/${enc(appToken)}/tables/${enc(tableId)}/records/${enc(recordId)}`, {
          data: { fields: { [field]: [...existing, token].map((t) => ({ file_token: t })) } },
        });
        return { ok: true, sent_to: 'bitable', file_token: token, field_name: field, kept_existing: existing.length };
      }

      throw new Error(`Đích "${to}" không hợp lệ. Dùng chat, bitable hoặc drive.`);
    },
  },
];
