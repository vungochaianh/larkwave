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
import { basename, join } from 'node:path';
import { isInsideDir } from '../filePaths';
import { enc, type LarkToolDef, str } from './types';
import {
  FORMAT_META,
  buildCsv,
  buildDocx,
  buildHtml,
  buildXlsx,
  safeFileName,
  type SheetData,
} from '../fileBuild';

/** Thư mục ghi tệp của lượt hiện tại — cùng cơ chế với `setAttachmentDir`. */
let OUT_DIR: string | null = null;
export function setFileOutDir(dir: string | null): void {
  OUT_DIR = dir;
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
      'Dữ liệu dạng VĂN BẢN (docx/md/txt) thì truyền `text`. PDF và HTML nhận cả hai: `text` làm phần ' +
      'diễn giải, `rows` thành bảng bên dưới. ' +
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
          description: 'Bảng dữ liệu; mỗi phần tử là một hàng. Hàng đầu tiên là TÊN CỘT.',
          items: { type: 'array', items: {} },
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
      if (!OUT_DIR) throw new Error('Chưa có thư mục ghi tệp cho lượt này.');

      const rows = normRows(input.rows);
      const text = typeof input.text === 'string' ? input.text : '';
      if (!rows.length && !text.trim()) {
        throw new Error('Không có nội dung: truyền `rows` (bảng) hoặc `text` (văn bản).');
      }
      const base = safeFileName(String(input.name || ''), 'ket-qua');
      const meta = FORMAT_META[format];
      const sheet: SheetData = { name: String(input.sheet_name || base), rows };

      let bytes: Buffer;
      if (format === 'xlsx') {
        if (!rows.length) throw new Error('Excel cần `rows`. Nội dung chỉ có chữ thì dùng docx/pdf/txt.');
        bytes = buildXlsx(sheet);
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
      const uploadId = UPLOAD ? await UPLOAD({ name: fileName, bytes, mime: meta.mime }).catch(() => null) : null;

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
      const p = String(input.path || '');
      // Chỉ cho gửi tệp NẰM TRONG thư mục của lượt này. Không có chốt này thì một `path` do model
      // sinh ra (hoặc do dữ liệu Base gợi ý) gửi được bất kỳ tệp nào trên máy vào một nhóm Lark.
      // Luật nằm ở `filePaths.isInsideDir` — một chỗ duy nhất, dùng chung với handler IPC mở tệp.
      if (!isInsideDir(OUT_DIR, p)) {
        throw new Error('Chỉ gửi được tệp do create_file vừa tạo trong lượt này.');
      }
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
