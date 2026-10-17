/**
 * Một lượt chat vừa kết thúc — làm gì tiếp?
 *
 * VẤN ĐỀ THẬT đã gặp: agent gọi một loạt `bitable_create_table` rồi im, ô soạn mở lại như thể
 * xong việc. Người dùng hỏi "xong chưa" thì nó đếm lại và trả lời "chưa, còn 17 bảng". Tức lượt
 * chạy kết thúc mà KHÔNG có kết luận — và nhìn từ ngoài, "dừng giữa chừng" trông y hệt "đã xong".
 *
 * Nguyên nhân gần như luôn là ngữ cảnh đầy: mỗi lượt nối tiếp phiên cũ, tới sát trần thì model chỉ
 * còn chỗ cho vài lời gọi công cụ rồi hết. App cũ chỉ hiện một băng cảnh báo rồi để đấy, nên người
 * dùng vừa phải tự phát hiện vừa phải tự bấm.
 *
 * Để ở `core` chứ không nằm trong component: đây là LUẬT, và luật thì phải kiểm được mà không cần
 * dựng cả màn hình React.
 */

/** Trần số lần tự chạy tiếp cho MỘT yêu cầu của người dùng. */
export const AUTO_CONTINUE_MAX = 3;
/** Từ mức này coi như ngữ cảnh đã đầy: lượt kế tiếp gần như không còn chỗ để làm gì. */
export const CTX_HANDOFF_AT = 0.85;

/**
 * Câu kết luận này có TỰ NÓI là chưa xong không?
 *
 * Lỗ hổng thật: agent kết thúc bằng "Xác nhận: 8/24 bảng đã dựng. Tiếp tục 1.3 và 1.4." — đó LÀ
 * một câu trả lời, nên luật cũ coi lượt đó là xong và dừng. Người dùng nhìn thấy một câu tự tin
 * rồi ngồi chờ, trong khi còn 16 bảng chưa dựng.
 *
 * Dấu hiệu mạnh nhất là PHÂN SỐ TIẾN ĐỘ (`8/24`, `14/31`): nó nói thẳng ra là chưa xong, và gần
 * như không bao giờ xuất hiện trong một câu kết thúc thật. Các cụm chữ thì yếu hơn nên chọn hẹp —
 * "còn 17 bảng", "chưa xong", "tiếp tục …" — chứ không bắt mọi chữ "tiếp theo", vì một báo cáo
 * hoàn chỉnh vẫn hay có mục "bước tiếp theo bạn nên làm".
 */
/**
 * Câu trả lời đang CHỜ NGƯỜI DÙNG làm một việc ngoài tầm với của agent (bấm vào đâu đó, quét mã, bật
 * quyền…). Đó là một KẾT LUẬN hợp lệ — chạy lại chỉ ra y hệt.
 *
 * Lỗi thật 18/10/2026: agent trả lời "bạn bấm vào nhóm … rồi nhắn 'đọc tiếp'", câu đó có chữ "chưa xong"
 * nên bị coi là lượt dở ⇒ tự chạy tiếp 4 lần, lần nào cũng in lại đúng câu đó. Tốn lượt AI, và người dùng
 * thấy app như bị loạn.
 */
export function waitingOnUser(text: string): boolean {
  const t = (text || '').trim();
  if (!t) return false;
  return (
    /\b(bạn|anh|chị)\s+(cần\s+)?(bấm|nhấp|mở|quét|chọn|vào|đăng\s*nhập|bật|cho\s*phép|xác\s*nhận)\b/i.test(t) ||
    /\b(nhờ|chờ|đợi)\s+(bạn|anh|chị)\b/i.test(t) ||
    /\bnhắn\s+(mình|tôi)\s+["“']?(đọc\s*tiếp|tiếp|xong)/i.test(t) ||
    /\brồi\s+nhắn\s+(mình|tôi)\b/i.test(t) ||
    /\b(please|you\s+need\s+to|waiting\s+for\s+you)\b/i.test(t)
  );
}

export function saysUnfinished(text: string): boolean {
  const t = (text || '').trim();
  if (!t) return false;
  // 8/24, 14 / 31 — chỉ tính khi vế trái NHỎ HƠN vế phải.
  for (const m of t.matchAll(/\b(\d{1,5})\s*\/\s*(\d{1,5})\b/g)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (!(b > 0 && a < b)) continue;
    // NGÀY THÁNG kiểu Việt (1/10, 16/10, 5/10/2026) KHÔNG phải tiến độ. Lỗi thật 18/10/2026: câu
    // "còn thiếu từ 1/10 đến 16/10" bị đọc thành "mới xong 1 trên 10" ⇒ tự chạy tiếp vô hạn.
    const at = m.index ?? 0;
    const before = t.slice(Math.max(0, at - 14), at).toLowerCase();
    const after = t.slice(at + m[0].length, at + m[0].length + 14);
    const dateLike = (a <= 31 && b <= 12) || /^\s*\/\s*\d{2,4}/.test(after) || /(ngày|từ|đến|tới|hôm|tháng)\s*$/i.test(before);
    if (!dateLike) return true;
  }
  return (
    /\bcòn\s+(lại\s+)?\d+/i.test(t) ||
    /\bchưa\s+(xong|hoàn\s*tất|hoàn\s*thành|đủ)/i.test(t) ||
    /\b(sẽ\s+)?(tiếp\s+tục|chạy\s+tiếp|làm\s+tiếp|dựng\s+tiếp)\b/i.test(t) ||
    /\b(remaining|still\s+\d+|not\s+(yet\s+)?(done|finished|complete))\b/i.test(t)
  );
}

export interface TurnEndState {
  /** Lượt vừa rồi kết thúc bằng một câu trả lời CÓ CHỮ của agent chưa. */
  hasConclusion: boolean;
  /** Câu kết luận đang CHỜ người dùng thao tác (xem `waitingOnUser`) ⇒ không tự chạy tiếp. */
  conclusionWaitsOnUser?: boolean;
  /** Câu kết luận đó có TỰ NÓI là còn dở không (xem `saysUnfinished`). */
  conclusionSaysUnfinished?: boolean;
  /** Lượt vừa rồi có gọi công cụ nào không. */
  usedTools: boolean;
  /** Tỉ lệ ngữ cảnh đã dùng (0–1), `null` khi chưa đo được. */
  ctxUsed: number | null;
  /** Còn mấy lần tự chạy tiếp. */
  autoLeft: number;
  /** Máy này có chuyển phiên (giữ tóm tắt) được không. */
  canHandoff: boolean;
}

export type TurnNextStep =
  /** Lượt xong tử tế — không làm gì thêm. */
  | 'none'
  /** Chạy tiếp ngay trong phiên hiện tại. */
  | 'continue'
  /**
   * Ngữ cảnh đầy: NÉN lại rồi chạy tiếp.
   *
   * Nén TẠI CHỖ — giữ nguyên cuộc trò chuyện người dùng đang mở, chỉ thay phiên Claude bên dưới
   * và mang theo bản tóm tắt. Đẩy họ sang một hội thoại mới giữa lúc đang làm dở là cắt đôi
   * lịch sử, và đó không phải thứ người ta quen ở Claude.
   * (Bản cài cũ chưa có `larkCompactSession` thì lùi về tạo hội thoại mới — còn hơn kẹt ở trần.)
   */
  | 'handoff-then-continue'
  /**
   * Lượt xong tử tế NHƯNG ngữ cảnh đã gần đầy: nén lại, KHÔNG chạy thêm lượt nào.
   *
   * Nén CHỦ ĐỘNG, không đợi tới lúc hỏng. Trước đây chỉ nén khi một lượt dừng giữa chừng, nên
   * hội thoại cứ ngồi ở 100% suốt: mỗi lượt vẫn chạy được, nhưng model mất dần phần đầu và băng
   * cảnh báo thì nằm đó mãi. Người dùng hỏi đúng chỗ này — Claude không đóng phiên dù đầy, vì nó
   * nén trước khi chạm trần chứ không chờ sự cố.
   */
  | 'compact'
  /** Hết lượt tự chạy mà vẫn chưa có kết luận: NÓI RA cho người dùng biết. */
  | 'warn';

/**
 * Quyết định bước kế tiếp sau một lượt chat.
 *
 * Thứ tự xét có chủ ý:
 *  1. Có kết luận VÀ không tự nhận còn dở → xong. Nhưng nếu ngữ cảnh gần đầy thì vẫn NÉN ngay
 *     (`compact`), vì để nguyên ở trần thì lượt sau mới là lượt hỏng.
 *  2. KHÔNG gọi công cụ nào → một câu trả lời rỗng thật, chạy tiếp chỉ tốn tiền. Ví dụ: người
 *     dùng gõ "ok" rồi agent không nói gì.
 *  3. Hết lượt tự chạy → cảnh báo. Im lặng ở đây chính là lỗi gốc.
 *  4. Ngữ cảnh đầy → chạy tiếp trong phiên cũ cũng vô ích, phải nén trước.
 */
export function nextStepAfterTurn(s: TurnEndState): TurnNextStep {
  // ĐANG CHỜ NGƯỜI DÙNG thì dừng hẳn, dù câu trả lời có nói "chưa xong": chạy lại cũng ra y hệt
  // (xem waitingOnUser). Xét TRƯỚC mọi thứ khác.
  if (s.hasConclusion && s.conclusionWaitsOnUser) return 'none';
  // Có kết luận nhưng chính nó nói còn dở ("8/24 bảng", "còn 17 bảng") thì KHÔNG phải xong.
  // Đây là ca đã lọt lưới một lần: người dùng đọc câu tự tin rồi ngồi chờ, việc thì đứng im.
  if (s.hasConclusion && !s.conclusionSaysUnfinished) {
    // Xong việc, nhưng ngữ cảnh gần đầy → nén NGAY, đừng đợi tới lượt sau mới hỏng. Không chạy
    // thêm lượt nào: người dùng chưa yêu cầu gì, nén là đủ.
    return s.ctxUsed !== null && s.ctxUsed >= CTX_HANDOFF_AT && s.canHandoff ? 'compact' : 'none';
  }
  if (!s.usedTools) return 'none';
  if (s.autoLeft <= 0) return 'warn';
  if (s.ctxUsed !== null && s.ctxUsed >= CTX_HANDOFF_AT && s.canHandoff) return 'handoff-then-continue';
  return 'continue';
}

/**
 * Câu dặn khi tự chạy tiếp.
 *
 * Bắt ĐẾM LẠI THỰC TẾ trước, vì sau một lần sang phiên mới thì trí nhớ của agent chỉ còn bản tóm
 * tắt — mà chính nó đã một lần báo "đã tạo xong" trong khi còn thiếu 17 bảng. Và bắt kết thúc
 * bằng một dòng tổng kết, vì thiếu đúng dòng đó là thứ khiến người dùng tưởng đã xong.
 *
 * KHOÁ PHẠM VI (lỗi "tự nhảy sang việc khác"): lần tự chạy này CHỈ để làm NỐT đúng việc người dùng
 * vừa yêu cầu — không phải cái cớ để agent nhặt các "việc còn treo" nó tự liệt kê rồi làm luôn. Đã
 * gặp thật: làm xong file Excel, lượt tự chạy lại nhảy sang bộ hồ sơ khác. Nên nếu việc ĐÃ xong thì
 * phải DỪNG, tuyệt đối không tự mở việc mới.
 */
export const AUTO_CONTINUE_PROMPT =
  'Chỉ làm NỐT đúng việc tôi vừa yêu cầu ở ngay trên, KHÔNG làm gì khác. ' +
  'Trước tiên KIỂM LẠI THỰC TẾ đã làm tới đâu bằng công cụ (đừng tin trí nhớ). ' +
  'Nếu việc đó ĐÃ XONG: chỉ trả lời MỘT dòng xác nhận đã xong rồi DỪNG — TUYỆT ĐỐI không tự bắt đầu, ' +
  'gợi ý, hay chuyển sang bất kỳ việc khác / việc còn treo / bước tiếp theo nào, kể cả khi bạn vừa ' +
  'liệt kê chúng ở trên. Nếu CHƯA xong: làm nốt phần còn thiếu của ĐÚNG việc đó, rồi kết thúc bằng ' +
  'một dòng tổng kết (đã xong gì, còn thiếu gì).';

/**
 * Một hội thoại CÓ ĐÁNG ghi xuống đĩa chưa?
 *
 * Ba thứ phải cân cùng lúc, và lần trước cân sai một thứ là mất dữ liệu của người dùng:
 *
 *  • Bấm "+" rồi bỏ đó KHÔNG được đẻ ra hội thoại rỗng nằm lại trong "Hội thoại cũ" vĩnh viễn.
 *  • Nhưng GẮN BASE là thao tác có chủ ý — người dùng chọn tay từng Base, có khi năm cái. Vứt nó
 *    đi chỉ vì "chưa có tin nhắn nào" là mất đúng phần công họ vừa bỏ ra.
 *  • Hội thoại đã có trên đĩa thì luôn ghi tiếp, không bàn.
 *
 * Lỗi đã xảy ra: luật cũ chỉ xét tin nhắn, nên gắn 5 Base vào một hội thoại chưa nhắn gì là mất
 * sạch — và mất NGAY ở lần lưu kế tiếp, không cần khởi động lại.
 */
export function shouldPersistSession(s: {
  /** Hội thoại đã có tệp trên đĩa (trong đúng phạm vi tài khoản) chưa. */
  hasExisting: boolean;
  /** Số mục trong hội thoại (tin nhắn, thẻ công cụ, thẻ tệp…). */
  itemCount: number;
  /** Số Base đang gắn cho hội thoại này. */
  basesCount: number;
}): boolean {
  if (s.hasExisting) return true;
  return s.itemCount > 0 || s.basesCount > 0;
}
