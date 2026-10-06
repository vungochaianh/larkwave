import { type LarkToolDef, enc, str } from './types';

/** Sheets — read a cell range (read) and write a cell range (gated write). */
export const sheetsTools: LarkToolDef[] = [
  {
    name: 'sheets_read_range',
    description:
      'Đọc dữ liệu một vùng (range) của bảng tính, ví dụ range "Sheet1!A1:D10". Trả về mảng 2 chiều các giá trị ô.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        spreadsheet_token: str('spreadsheet token (trong URL bảng tính)'),
        range: str('Vùng cần đọc, ví dụ Sheet1!A1:D10'),
      },
      required: ['spreadsheet_token', 'range'],
    },
    gated: false,
    // Lark wants the range RAW in the path (Sheet1!A1:D10). Percent-encoding the "!"/":"
    // (e.g. via enc()) turns it into Sheet1%21A1%3AD10 and Lark fails the lookup — so only
    // the spreadsheet token is encoded, the range is interpolated verbatim.
    exec: (i, c) =>
      c.request('GET', `/open-apis/sheets/v2/spreadsheets/${enc(i.spreadsheet_token)}/values/${i.range}`),
  },
  {
    name: 'sheets_write_range',
    description:
      'GHI dữ liệu vào một vùng (range) của bảng tính (ghi đè các ô trong vùng). Hành động GHI — sẽ hỏi xác nhận. ' +
      '`values` là MẢNG 2 CHIỀU: mảng các hàng, mỗi hàng là mảng giá trị ô, khớp kích thước range. ' +
      'Ví dụ range "Sheet1!A1:B2", values [["Tên","Tuổi"],["An",30]]. Dùng để lưu kết quả phân tích trở lại bảng tính.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        spreadsheet_token: str('spreadsheet token (trong URL bảng tính)'),
        range: str('Vùng cần ghi, ví dụ Sheet1!A1:B2 — kích thước phải khớp values'),
        values: {
          type: 'array',
          description: 'Mảng 2 chiều [[hàng1...],[hàng2...]] giá trị ô',
          items: { type: 'array' },
        },
      },
      required: ['spreadsheet_token', 'range', 'values'],
    },
    gated: true,
    // The range goes in the BODY (valueRange.range) for this endpoint, so no path-encoding
    // concern here — only the token is in the path.
    exec: (i, c) =>
      c.request('PUT', `/open-apis/sheets/v2/spreadsheets/${enc(i.spreadsheet_token)}/values`, {
        data: { valueRange: { range: i.range, values: i.values } },
      }),
  },
];
