/**
 * Rút NÚT HÀNH ĐỘNG từ câu trả lời của trợ lý.
 *
 * Vì sao cần: trợ lý hay kết thúc bằng một câu hỏi lựa chọn ("(a) dừng và để agent Thực thi xử lý
 * toàn bộ, hay (b) tôi phân tích mẫu cho vài MKH bạn chỉ định?") hoặc bằng một lời nhắc đổi chế độ
 * ("Tôi đang ở chế độ Hỏi đáp (chỉ đọc) … bạn bật chế độ Thực thi"). Cả hai đều bắt người dùng làm
 * lại bằng tay: gõ lại "a", hoặc đi tìm cái công tắc nằm tận dưới khung soạn. Ở đây ta đọc câu trả
 * lời và biến chúng thành nút bấm ngay dưới bong bóng.
 *
 * Nguyên tắc bắt: THÀ BỎ SÓT CÒN HƠN BẮT NHẦM. Một nút hiện sai chỗ sẽ gửi đi một câu người dùng
 * không hề định gửi — tệ hơn hẳn việc họ phải gõ tay như cũ.
 */

export interface AnswerChoice {
  /** Nhãn ngắn hiện trên nút, vd "a". */
  key: string;
  /** Nội dung lựa chọn, dùng làm nhãn nút và làm câu gửi đi. */
  text: string;
}

/** Dấu hiệu trợ lý đang bị chặn vì chỉ có quyền đọc. */
const NEEDS_WRITE =
  /(bật|chuyển(?:\s+sang)?|dùng)\s+(?:chế\s*độ\s*)?thực\s*thi|chế\s*độ\s*(?:hỏi\s*đáp|chỉ\s*đọc)|quyền\s+(?:ghi|tạo|thực\s*thi)|không\s+(?:có\s+)?(?:quyền|thể)\s+(?:ghi|tạo|create|write)/i;

/**
 * Câu trả lời có đang nói "tôi cần quyền ghi mới làm được" không?
 *
 * Chỉ nhìn chữ, KHÔNG đoán ý: cụm "chế độ Thực thi" / "chỉ đọc" / "không có quyền ghi" là do chính
 * prompt hệ thống dạy trợ lý nói, nên chúng ổn định. Nơi gọi còn phải kiểm chế độ HIỆN TẠI là 'ask'
 * trước khi hiện nút — đang ở Thực thi rồi mà vẫn mời bật Thực thi thì vô nghĩa.
 */
export function needsExecuteMode(text: string): boolean {
  // Bỏ đánh dấu markdown TRƯỚC khi khớp. Trợ lý gần như luôn in đậm đúng những cụm này
  // ("bật **chế độ Thực thi**"), và dấu `*` chen vào giữa làm mọi mẫu có khoảng trắng trượt hết.
  return NEEDS_WRITE.test((text || '').replace(/[*_`]+/g, ''));
}

/** Bỏ đánh dấu markdown ở hai đầu cho nhãn nút đọc được. */
function clean(s: string): string {
  return s
    .replace(/\*\*|__|`/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[,;:\-–—\s]+/, '')
    .replace(/[,;:\s]+$/, '');
}

/**
 * Rút các lựa chọn từ CÂU HỎI CUỐI của câu trả lời.
 *
 * Chỉ xét đoạn cuối và bắt buộc đoạn đó kết thúc bằng "?" — đó là điều phân biệt một câu hỏi lựa
 * chọn thật với một đoạn kỹ thuật tình cờ có "(a)" trong đó. Không có dấu hỏi thì không có nút.
 */
export function extractChoices(text: string): AnswerChoice[] {
  const src = (text || '').trim();
  if (!src) return [];
  // Đoạn cuối = khối chữ sau dấu xuống dòng kép cuối cùng. Câu hỏi chốt gần như luôn đứng riêng.
  const tail = src.split(/\n\s*\n/).pop()!.trim();
  if (!tail.endsWith('?')) return [];
  // Quá dài thì gần như chắc chắn không phải câu hỏi chốt mà là một đoạn phân tích.
  if (tail.length > 700) return [];

  const labels = [...tail.matchAll(/\((a|b|c|d|[1-4])\)/gi)];
  if (labels.length < 2) return [];

  const out: AnswerChoice[] = [];
  for (let i = 0; i < labels.length; i += 1) {
    const m = labels[i]!;
    const from = m.index! + m[0].length;
    const to = i + 1 < labels.length ? labels[i + 1]!.index! : tail.length;
    // Bỏ liên từ nối giữa hai lựa chọn ("…, hay (b) …") khỏi phần đuôi của lựa chọn TRƯỚC.
    const body = clean(tail.slice(from, to).replace(/[,;]?\s*(hay|hoặc|or)\s*$/i, ''));
    // Chỉ loại lựa chọn RỖNG. Bản đầu loại luôn body dưới 2 ký tự và thế là "(a) A, (b) B?" —
    // một câu hỏi lựa chọn hoàn toàn hợp lệ — bị vứt cả cụm.
    if (!body) return [];
    out.push({ key: m[1]!.toLowerCase(), text: body.replace(/\?+$/, '').trim() });
  }
  // Nhãn phải là một dãy liên tiếp (a,b,c…) — "(a) … (a) …" là trích dẫn, không phải lựa chọn.
  const keys = out.map((o) => o.key);
  if (new Set(keys).size !== keys.length) return [];
  return out.slice(0, 4);
}

/** Đích "sửa nhanh" mà một câu trả lời đang nhắc tới (khớp FixTarget của fix/fixRules — giữ tệp này thuần). */
export type AnswerConnect = 'zalo' | 'zaloWeb' | 'gmail' | 'claude' | 'claudeKeys' | 'zaloSync';

/**
 * Câu trả lời đang nói về CỬA SỔ ZALO WEB (nơi đăng nhập Zalo duy nhất từ 0.1.9). Khi đó TUYỆT ĐỐI không
 * gắn nút "Kết nối Zalo (quét QR)" của thanh bên: đó là phiên zca RIÊNG, quét ở đó sẽ đá văng đăng nhập của
 * cửa sổ → người dùng quay vòng mãi (lỗi thật 18/10/2026). Chỉ gắn nút mở chính cửa sổ đó.
 */
const WEB_WINDOW = /cửa\s*sổ\s*zalo\s*web|zalo\s*web/i;

const CONNECT_RULES: [AnswerConnect, RegExp][] = [
  // Nói tới cửa sổ Zalo Web ⇒ mở thẳng cửa sổ đó (một đăng nhập duy nhất).
  ['zaloWeb', WEB_WINDOW],
  // "chưa có tài khoản Zalo nào được kết nối", "Kỹ năng → Kết nối → Zalo", "quét mã QR … Zalo", "Zalo mất kết nối".
  // KHÔNG áp dụng khi câu trả lời đang nói về cửa sổ Zalo Web (xem WEB_WINDOW).
  ['zalo', /(kết\s*nối|đăng\s*nhập|quét(?:\s*(?:lại|mã))*\s*QR)[^.\n]{0,60}\bzalo\b|\bzalo\b[^.\n]{0,60}(chưa[^.\n]{0,25}kết\s*nối|mất\s*kết\s*nối|quét(?:\s*(?:lại|mã))*\s*QR|đăng\s*nhập\s*lại)/i],
  ['gmail', /(kết\s*nối|đăng\s*nhập)[^.\n]{0,60}\bgmail\b|\bgmail\b[^.\n]{0,60}(chưa[^.\n]{0,25}kết\s*nối|từ\s*chối\s*đăng\s*nhập|mật\s*khẩu\s*ứng\s*dụng)/i],
  ['claude', /đăng\s*nhập(?:\s*lại)?\s*claude|claude(?:\s*cli)?[^.\n]{0,30}chưa\s*đăng\s*nhập/i],
  ['claudeKeys', /(credit\s*balance\s*is\s*too\s*low|hết\s*credit|chưa\s*(?:có|nạp)[^.\n]{0,20}credit)/i],
  // "đồng bộ từ điện thoại", "đồng bộ tin nhắn cũ Zalo", "Cài đặt → Đồng bộ tin Zalo".
  ['zaloSync', /đồng\s*bộ[^.\n]{0,40}(từ\s*điện\s*thoại|tin(?:\s*nhắn)?(?:\s*cũ)?[^.\n]{0,10}\bzalo\b|lịch\s*sử[^.\n]{0,20}\bzalo\b)|đồng\s*bộ\s*tin\s*zalo/i],
];

/**
 * Câu trả lời đang bảo người dùng KẾT NỐI / ĐĂNG NHẬP một thứ (Zalo, Gmail, Claude…) ⇒ nút mở THẲNG modal
 * đó (FixCenter) ngay dưới câu trả lời. Lỗi thật 17/10/2026: hỏi "add zalo như thế nào", trợ lý kiểm
 * (zalo_status trả danh sách rỗng — không phải lỗi, nên thẻ công cụ không có nút) rồi trả lời bằng chữ
 * "mở Kỹ năng → Kết nối → Zalo". Nút ở đây chỉ MỞ modal, không gửi gì đi — bắt nhầm cũng vô hại.
 */
export function connectActions(text: string): AnswerConnect[] {
  const src = (text || '').replace(/[*_`]+/g, '');
  const hit = CONNECT_RULES.filter(([, re]) => re.test(src)).map(([k]) => k);
  // Một đăng nhập duy nhất: đã có nút mở cửa sổ Zalo Web thì BỎ nút quét-QR của thanh bên (phiên khác, đá nhau).
  return hit.includes('zaloWeb') ? hit.filter((k) => k !== 'zalo') : hit;
}

