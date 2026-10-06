import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type LarkToolDef, str } from './types';
import { extractOfficeText, officeKindFor } from '../ooxml';

/**
 * Thư mục để ghi tệp đính kèm tải về.
 *
 * Đặt ở module vì `exec(input, client)` không nhận thêm gì khác — cùng cách larkWebSession làm.
 * LarkService gọi setAttachmentDir() khi bắt đầu một lượt chat, nên tệp nằm cạnh workspace của
 * đúng cuộc hội thoại đó.
 */
let ATTACH_DIR: string | null = null;
export function setAttachmentDir(dir: string | null): void {
  // Thư mục đổi = sang cuộc hội thoại khác → quên ngữ cảnh Bitable của cuộc trước, để table_id của
  // một Base khác không bị mang nhầm sang đây.
  if (dir !== ATTACH_DIR) resetBitableContext();
  ATTACH_DIR = dir;
}

/** Bao nhiêu chữ trả thẳng vào hội thoại. Nhiều hơn thì agent tự Read tệp đã ghi ra đĩa. */
const MAX_INLINE_TEXT = 20_000;
/** Tệp lớn hơn thì không tải — một lượt chat không phải chỗ để kéo về vài trăm MB. */
const MAX_BYTES = 25 * 1024 * 1024;

const TEXTY = /\.(txt|md|csv|json|ya?ml|xml|html?|log|sql|ts|js|py)$/i;

/**
 * Ngữ cảnh Bitable của lần gọi gần nhất trong CÙNG lượt chat.
 *
 * Vì sao cần: `extra` (xem dưới) đòi table_id, mà kết quả của bitable_search_records KHÔNG lặp lại
 * app_token/table_id — model chỉ biết chúng vì chính nó vừa gõ vào input lượt trước. Sang lượt sau,
 * trí nhớ liên lượt chỉ giữ tên tool + một đoạn ngắn input, nên table_id biến mất. Ghi lại ở đây để
 * khi model quên truyền thì vẫn còn đường tự điền.
 */
let LAST_BITABLE: { appToken?: string; tableId?: string } = {};
export function noteBitableContext(appToken?: string, tableId?: string): void {
  if (appToken) LAST_BITABLE.appToken = appToken;
  if (tableId) LAST_BITABLE.tableId = tableId;
}
export function resetBitableContext(): void {
  LAST_BITABLE = {};
}

/**
 * Dựng tham số `extra` cho endpoint tải media.
 *
 * Bitable BẬT QUYỀN NÂNG CAO thì mọi lượt tải tệp đính kèm phải kèm ngữ cảnh bảng làm tham số truy
 * vấn; thiếu nó Lark trả HTTP 400 với body RỖNG (đúng thứ người dùng gặp: "Tải tệp thất bại (HTTP
 * 400)" ba lần liền). Tài liệu Lark mô tả HAI dạng:
 *   - dạng đặc tả chính thức: {"bitablePerm":{"tableId","attachments":{fieldId:{recordId:[token]}}}}
 *   - dạng máy chủ tự sinh trong trường `url` của bản ghi: {"bitablePerm":{"tableId","rev":<số>}}
 * `rev` không có endpoint nào lấy riêng được, nên ta KHÔNG tự dựng nó; ta dựng dạng chính thức khi
 * biết field/record, và tối thiểu là {tableId} khi không biết.
 *
 * Phải là CHUỖI JSON: qs() gọi String(v), truyền object thô sẽ thành "[object Object]" và lỗi đổi
 * từ "thiếu extra" sang "extra sai định dạng" mà nhìn y hệt nhau.
 */
function buildExtra(a: { tableId?: string; fieldId?: string; recordId?: string; token: string }): string | undefined {
  // `attachments` là THAM SỐ BẮT BUỘC của dạng này — tài liệu Lark ghi rõ: thiếu nó "có thể gây
  // trễ quá lâu, gọi API thất bại". Tức một `extra` chỉ có tableId không phải "bản tối thiểu chấp
  // nhận được" mà là một yêu cầu SAI ĐẶC TẢ, và cái giá là TREO chứ không phải trượt nhanh. Nên
  // không biết đủ field/record thì KHÔNG dựng extra — đã có ba đường khác lo.
  if (!a.tableId || !a.fieldId || !a.recordId) return undefined;
  return JSON.stringify({
    bitablePerm: { tableId: a.tableId, attachments: { [a.fieldId]: { [a.recordId]: [a.token] } } },
  });
}

/**
 * Ghi TRỌN phần chữ đã trích ra đĩa khi nó dài hơn mức nhét thẳng vào hội thoại được.
 *
 * Trả về `{ path, next }` để model biết đọc tiếp ở đâu; im lặng bỏ qua khi chưa có thư mục làm việc
 * (không có gì để mất — phần đầu vẫn được trả về bình thường).
 */
async function spillText(name: string, text: string): Promise<Record<string, string>> {
  if (!ATTACH_DIR) return {};
  try {
    const dir = join(ATTACH_DIR, '.lark-files');
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${name}.txt`);
    await writeFile(path, text, 'utf8');
    return {
      path,
      next: `Chữ quá dài nên chỉ trả về phần đầu. TOÀN BỘ đã ghi ở ${path} — dùng Read/Grep với đường dẫn này để đọc tiếp.`,
    };
  } catch {
    return {};
  }
}

/** Tên tệp an toàn để ghi ra đĩa (bỏ mọi thứ có thể thoát khỏi thư mục). */
function safeName(name: string): string {
  const base = (name || 'tep').replace(/[/\\]/g, '_').replace(/[^\p{L}\p{N}._ -]/gu, '').trim();
  return (base || 'tep').slice(0, 80);
}

/**
 * Đọc nội dung một tệp đính kèm trong Bitable (hoặc bất kỳ file_token nào của Drive).
 *
 * Vì sao cần: trợ lý Lark trước đây CHỈ lấy được link tải — nó tự nói "không có tool nào để tải
 * file đính kèm về máy và mở/đọc nội dung", nên mọi câu hỏi về nội dung một .xlsx/.pdf/ảnh trong
 * Bitable đều tắc, người dùng phải tự tải rồi dán lại vào chat.
 *
 * CÁCH TẢI (thử lần lượt, dừng ở lần đầu thành công) — vì tệp trong Bitable có quyền nâng cao thì
 * KHÔNG tải được bằng URL trần:
 *  1. `url` do chính ô đính kèm trả về — máy chủ Lark đã nhúng sẵn `extra` đúng (kể cả `rev`).
 *     Chắc ăn nhất, nên ưu tiên.
 *  2. Tự dựng `extra` từ table_id (+ field_id/record_id nếu có).
 *  3. URL trần — vẫn đúng cho tệp Drive thường và Base không bật quyền nâng cao.
 *  4. Bí quá thì đọc lại bản ghi để lấy `url` tươi rồi quay về (1).
 *
 * Hai đường ra, tuỳ loại tệp:
 *  - Excel/Word/PowerPoint → trích CHỮ ngay và trả thẳng vào hội thoại (Claude không tự mở nổi
 *    OOXML, nó là file ZIP).
 *  - Ảnh/PDF → GHI RA ĐĨA rồi trả về đường dẫn; Claude đọc ảnh và PDF trực tiếp bằng Read, nên
 *    trả đường dẫn hữu ích hơn hẳn mọi cách mô tả gián tiếp.
 */
export const attachmentTools: LarkToolDef[] = [
  {
    name: 'lark_read_attachment',
    description:
      'ĐỌC NỘI DUNG một tệp đính kèm (Excel/PDF/ảnh/Word/CSV…) trong Bitable hoặc Drive, từ file_token. ' +
      'GỌI TOOL NÀY khi người dùng hỏi về nội dung BÊN TRONG một tệp đính kèm — đừng chỉ đưa link tải. ' +
      'QUAN TRỌNG: ô attachment của Bitable trả về cả `file_token` LẪN `url` — hãy truyền NGUYÊN VĂN ' +
      'cả hai (và table_id của bảng đang đọc). Tệp trong Base bật quyền nâng cao KHÔNG tải được nếu ' +
      'thiếu ngữ cảnh bảng, và `url` là thứ đã có sẵn ngữ cảnh đó. ' +
      'Excel/Word/PowerPoint: trả về chữ đã trích. Ảnh/PDF: ghi ra đĩa và trả về đường dẫn, sau đó ' +
      'hãy dùng công cụ Read với đường dẫn đó để xem nội dung.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['file_token'],
      properties: {
        file_token: str('file_token của tệp đính kèm (lấy từ ô attachment khi đọc bản ghi Bitable)'),
        name: str('Tên tệp (tuỳ chọn — dùng để đặt tên khi ghi ra đĩa và để đoán định dạng)'),
        url: str('NGUYÊN VĂN trường `url` trong ô attachment (nếu có) — đường tải chắc ăn nhất'),
        table_id: str('table_id của bảng chứa bản ghi (rất nên truyền — bắt buộc với Base quyền nâng cao)'),
        record_id: str('record_id của bản ghi chứa tệp (tuỳ chọn, giúp xin quyền chính xác hơn)'),
        field_id: str('field_id của cột đính kèm (tuỳ chọn, đi kèm record_id)'),
        app_token: str('app_token của Base (tuỳ chọn — dùng để đọc lại bản ghi khi các cách trên hỏng)'),
      },
    },
    gated: false,
    exec: async (i, c) => {
      const token = String(i.file_token || '').trim();
      if (!token) throw new Error('Thiếu file_token.');

      const tableId = String(i.table_id || '').trim() || LAST_BITABLE.tableId;
      const appToken = String(i.app_token || '').trim() || LAST_BITABLE.appToken;
      const recordId = String(i.record_id || '').trim() || undefined;
      const fieldId = String(i.field_id || '').trim() || undefined;
      const mediaPath = `/open-apis/drive/v1/medias/${encodeURIComponent(token)}/download`;
      const givenUrl = String(i.url || '').trim();

      /** Mỗi cách tải là một cặp [nhãn, hàm]; nhãn đi vào kết quả để lần sau còn biết cách nào chạy được. */
      const attempts: { via: string; run: () => Promise<{ bytes: Buffer; mime: string; fileName?: string }> }[] = [];
      if (givenUrl) attempts.push({ via: 'url-của-ô-đính-kèm', run: () => c.downloadBinary(givenUrl) });
      if (appToken && tableId && recordId) {
        attempts.push({
          via: 'đọc-lại-bản-ghi',
          run: async () => {
            // Lấy `url` TƯƠI từ chính bản ghi: server nhúng sẵn extra đúng với rev hiện tại.
            const rec = (await c.request(
              'GET',
              `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records/${encodeURIComponent(recordId)}`,
            )) as { record?: { fields?: Record<string, unknown> } };
            const fields = rec?.record?.fields || {};
            for (const val of Object.values(fields)) {
              const arr = Array.isArray(val) ? val : [val];
              for (const cell of arr) {
                const o = cell as { file_token?: string; url?: string } | null;
                if (o && o.file_token === token && o.url) return c.downloadBinary(o.url);
              }
            }
            throw new Error('Không tìm thấy tệp này trong bản ghi (có thể đã bị gỡ khỏi ô đính kèm).');
          },
        });
      }
      // Chỉ dựng extra khi biết ĐỦ field + record (xem buildExtra); và đặt SAU đường đọc-lại-bản-ghi
      // vì `url` do máy chủ sinh luôn đúng hơn bất cứ thứ gì ta tự ghép.
      const extra = buildExtra({ tableId, fieldId, recordId, token });
      if (extra) attempts.push({ via: 'extra-tự-dựng', run: () => c.downloadBinary(mediaPath, { extra }) });
      attempts.push({ via: 'url-trần', run: () => c.downloadBinary(mediaPath) });

      let dl: { bytes: Buffer; mime: string; fileName?: string } | null = null;
      let via = '';
      const tried: string[] = [];
      for (const a of attempts) {
        try {
          dl = await a.run();
          via = a.via;
          break;
        } catch (e) {
          tried.push(`${a.via}: ${(e as Error).message}`);
        }
      }
      if (!dl) {
        return {
          ok: false,
          reason:
            'Không tải được tệp đính kèm. ' +
            (tableId
              ? ''
              : 'Thiếu table_id — hãy gọi lại tool này kèm table_id của bảng (và `url` nguyên văn trong ô đính kèm). ') +
            `Đã thử ${attempts.length} cách: ${tried.join(' | ')}`,
        };
      }
      if (dl.bytes.length > MAX_BYTES) {
        return {
          ok: false,
          reason: `Tệp ${(dl.bytes.length / 1048576).toFixed(1)}MB, vượt giới hạn ${MAX_BYTES / 1048576}MB.`,
        };
      }
      const name = safeName(String(i.name || dl.fileName || 'tep'));

      // OOXML: Claude không mở được (là file ZIP) → trích chữ hộ nó.
      const office = officeKindFor(name, dl.mime);
      if (office) {
        const text = extractOfficeText(dl.bytes, office);
        if (text.trim()) {
          return {
            ok: true,
            name,
            via,
            kind: office,
            size: dl.bytes.length,
            truncated: text.length > MAX_INLINE_TEXT,
            // Cắt mà KHÔNG để lại đường lấy phần còn lại là bỏ rơi model giữa chừng: nhánh này
            // không ghi tệp ra đĩa, nên trước đây "truncated: true" là ngõ cụt. Nay ghi trọn phần
            // chữ ra đĩa để còn Read/Grep tiếp.
            ...(text.length > MAX_INLINE_TEXT ? await spillText(name, text) : {}),
            text: text.slice(0, MAX_INLINE_TEXT),
          };
        }
        // Không trích được chữ (bảng tính chỉ có ảnh chẳng hạn) → vẫn ghi ra đĩa để còn xử lý tiếp.
      }

      // Tệp chữ thuần: trả thẳng, không cần ghi ra đĩa.
      if (TEXTY.test(name) || /^text\//i.test(dl.mime) || /json|xml|csv/i.test(dl.mime)) {
        const text = dl.bytes.toString('utf8');
        return {
          ok: true,
          name,
          via,
          kind: 'text',
          size: dl.bytes.length,
          truncated: text.length > MAX_INLINE_TEXT,
          ...(text.length > MAX_INLINE_TEXT ? await spillText(name, text) : {}),
          text: text.slice(0, MAX_INLINE_TEXT),
        };
      }

      // Ảnh/PDF/khác: ghi ra đĩa, Claude tự Read.
      if (!ATTACH_DIR) {
        return {
          ok: false,
          reason: 'Chưa có thư mục làm việc cho lượt chat này nên không ghi tệp ra đĩa được.',
        };
      }
      const dir = join(ATTACH_DIR, '.lark-files');
      await mkdir(dir, { recursive: true });
      const path = join(dir, name);
      await writeFile(path, dl.bytes);
      return {
        ok: true,
        name,
        via,
        kind: /^image\//i.test(dl.mime) ? 'image' : /pdf/i.test(dl.mime) ? 'pdf' : 'binary',
        mime: dl.mime,
        size: dl.bytes.length,
        path,
        // KHÔNG hứa chắc là có Read: đường "API trực tiếp" (larkApiAgent) chỉ nạp tool Lark, model ở
        // đó không có công cụ đọc tệp nào. Nói đúng khả năng còn hơn dặn một việc không làm được.
        next:
          `Đã tải về ${path}. Nếu bạn có công cụ đọc tệp (Read), hãy dùng nó với ĐÚNG đường dẫn này. ` +
          'Nếu không có công cụ đó, hãy nói với người dùng là tệp đã tải về và đưa đường dẫn cho họ.',
      };
    },
  },
];
