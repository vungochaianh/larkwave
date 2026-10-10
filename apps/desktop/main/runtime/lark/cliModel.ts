/**
 * `--model` cho lượt Claude CLI của Lark × Agents. Thuần → apps/desktop/test/webDelete.cjs.
 *
 * Model NGƯỜI DÙNG CHỌN (hội thoại / mặc định trong Cài đặt) luôn thắng. Lỗi cũ (đến 10/2026): lượt
 * Lark bỏ qua lựa chọn này — chỉ lượt "chung" dùng nó — nên chọn Haiku mà CLI vẫn chạy model mặc
 * định (Sonnet); nhãn câu trả lời đọc từ sự kiện init của CLI nên báo đúng là Sonnet.
 * Không chọn gì: lượt chỉ-đọc ('ask') ghim `sonnet` cho rẻ; lượt build để CLI tự chọn (không đòi
 * một model mà gói của người dùng không có).
 */
export const ASK_MODEL = 'sonnet';

export function claudeModelArgs(o: { mode: 'ask' | 'build'; generalMode?: boolean; model?: string | null }): string[] {
  const m = (o.model || '').trim() || (o.mode === 'ask' && !o.generalMode ? ASK_MODEL : '');
  return m ? ['--model', m] : [];
}
