/** Một sheet đã dựng lại từ phần chữ trích xuất được. */
export interface ParsedSheet {
  name: string;
  rows: string[][];
}

/** "A" cho cột 0, "AB" cho cột 27 — đúng như thanh tiêu đề của Excel. */
export function columnLabel(i: number): string {
  let s = '';
  let n = i;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

/** Tách một dòng CSV, tôn trọng dấu nháy kép và "" thoát bên trong. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/**
 * Dựng lại bảng từ phần chữ mà máy chủ đã trích ra.
 *
 * Máy chủ trích xlsx thành TSV có mốc `# Sheet: <tên>`, giữ nguyên ô trống nên vị trí cột là
 * thật. Hàm này chỉ ĐỌC LẠI đúng chuỗi đó — không phân tích lại tệp — nên bảng hiện ra và
 * phần AI đọc luôn là một, không thể lệch nhau. Trả về null khi nội dung không phải dạng bảng
 * (văn bản Word, ghi chú…), lúc đó cứ hiển thị chữ như cũ.
 */
export function parseSheets(text: string, fileName = ''): ParsedSheet[] | null {
  if (!text) return null;
  const isCsv = /\.csv$/i.test(fileName);
  const lines = text.replace(/\r\n?/g, '\n').split('\n');

  const sheets: ParsedSheet[] = [];
  let cur: ParsedSheet | null = null;
  for (const line of lines) {
    // Chấp nhận cả `# Sheet 1` — dạng cũ, vẫn nằm trong các tệp đã tải lên trước đây.
    const marker = /^# Sheet:? ?(.*)$/.exec(line);
    if (marker) {
      cur = { name: marker[1].trim() || 'Sheet', rows: [] };
      sheets.push(cur);
      continue;
    }
    if (!cur) {
      cur = { name: '', rows: [] };
      sheets.push(cur);
    }
    // Dòng trắng giữa hai sheet là dấu ngăn, không phải một hàng rỗng của bảng.
    if (!line && !cur.rows.length) continue;
    cur.rows.push(isCsv ? splitCsvLine(line) : line.split('\t'));
  }

  for (const s of sheets) while (s.rows.length && s.rows[s.rows.length - 1].every((c) => !c)) s.rows.pop();
  const kept = sheets.filter((s) => s.rows.length);
  if (!kept.length) return null;

  // Chỉ coi là bảng khi thực sự có nhiều cột. Một tệp .txt hay .md không có tab sẽ ra bảng
  // một cột — vô nghĩa và khó đọc hơn chữ thường, nên trả null để hiển thị nguyên văn.
  const widest = Math.max(...kept.flatMap((s) => s.rows.map((r) => r.length)));
  if (widest < 2) return null;
  return kept;
}
