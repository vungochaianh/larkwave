/**
 * Chuyển một câu hỏi sẵn sang màn hình Trợ lý Lark.
 *
 * Vì sao là một biến ở tầng module chứ không phải prop hay context: hai màn hình này KHÔNG nằm
 * cùng một cây React — màn hình Kỹ năng bị gỡ khỏi DOM đúng lúc màn hình Lark được dựng. Luồn qua
 * props thì phải kéo một prop xuyên qua mọi tầng ở giữa, mà chúng chẳng liên quan gì tới việc này;
 * context cũng không sống sót qua lần gỡ đó.
 *
 * LẤY MỘT LẦN RỒI XOÁ. Để lại thì mỗi lần người dùng quay về màn hình Lark, ô soạn lại tự điền câu
 * cũ — họ gửi nhầm mà không hiểu vì sao.
 */
let pending: string | null = null;

/** Đặt câu hỏi sẽ điền sẵn vào ô soạn của màn hình Lark kế tiếp. */
export function setLarkPrompt(text: string): void {
  pending = text.trim() || null;
}

/** Lấy và XOÁ. Gọi một lần lúc màn hình Lark dựng xong. */
export function takeLarkPrompt(): string | null {
  const v = pending;
  pending = null;
  return v;
}
