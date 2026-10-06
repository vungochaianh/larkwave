/**
 * Nhận ra khi trợ lý ĐANG HỎI một loạt thông tin, để dựng biểu mẫu điền nhanh ngay dưới câu
 * trả lời — thay vì bắt người dùng tự gõ lại "1. …, 2. …, 3. …".
 *
 * Cố tình DÈ DẶT. Nhận nhầm một danh sách bình thường thành biểu mẫu sẽ nhét một khối input vô
 * duyên vào giữa câu trả lời, nên thà bỏ sót còn hơn: phải có tiêu đề báo hiệu đang thiếu thông
 * tin, và phải có ít nhất 2 mục đánh số nằm SAU tiêu đề đó.
 */
export interface AskedField {
  /** Số thứ tự như trong câu trả lời — để câu trả lời của người dùng khớp lại được. */
  no: number;
  label: string;
}

/** Tiêu đề báo hiệu "tôi đang cần bạn cung cấp". Có dấu và không dấu đều bắt. */
const ASKING_RE =
  /(còn (thiếu|cần)|cần (bạn|anh|chị|bên bạn)?\s*(cung cấp|cấp|bổ sung|điền)|thiếu thông tin|nhờ (bạn|anh\/chị|anh|chị)\s*(cung cấp|cấp)|vui lòng (cung cấp|cấp|bổ sung)|missing|please provide|need from you)/i;

/** Một dòng đánh số: "1. …", "2) …", "**3.** …" */
const NUMBERED_RE = /^\s{0,3}(?:\*\*)?(\d{1,2})(?:\*\*)?[.)]\s+(.{3,160})$/;

/** Bỏ đánh dấu markdown khỏi nhãn — nhãn nằm cạnh ô nhập, không phải trong khối markdown. */
function plain(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseAskedFields(answer: string, userAsk = ''): AskedField[] {
  const lines = (answer || '').split('\n');
  let from = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (ASKING_RE.test(lines[i])) from = i;
  }
  // Dấu hiệu thứ hai: CHÍNH CÂU HỎI của người dùng đã nói là muốn biết còn thiếu gì. Khi đó câu
  // trả lời thường là một danh sách TRẦN, không kèm tiêu đề nào — đo thật: "Hãy liệt kê các mục
  // thông tin còn thiếu" cho ra đúng 5 dòng đánh số và không một chữ dẫn nào. Vẫn không nới cho
  // trường hợp chung: phải là NGƯỜI DÙNG hỏi, chứ không phải đoán từ hình dạng danh sách — "3
  // bước để làm X" cũng là danh sách đánh số và tuyệt đối không phải biểu mẫu.
  if (from < 0 && ASKING_RE.test(userAsk || '')) from = -1 + 0; // bắt đầu từ dòng đầu tiên
  else if (from < 0) return [];

  const out: AskedField[] = [];
  const seen = new Set<number>();
  for (let i = from + 1; i < lines.length; i += 1) {
    const m = NUMBERED_RE.exec(lines[i]);
    if (!m) continue;
    const no = Number(m[1]);
    if (seen.has(no)) continue;
    seen.add(no);
    const label = plain(m[2]).replace(/[—–-]\s*$/, '').slice(0, 140);
    if (label) out.push({ no, label });
    if (out.length >= 8) break;
  }
  // Danh sách phải bắt đầu từ 1 và có ít nhất 2 mục — một dòng "1." lẻ loi thường chỉ là câu văn.
  if (out.length < 2 || out[0].no !== 1) return [];
  return out;
}
