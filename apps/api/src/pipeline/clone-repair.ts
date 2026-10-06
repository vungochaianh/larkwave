/**
 * Quyết định CÓ nên tự sửa một bản sao hay không — tách riêng vì đây là chỗ tốn tiền nếu sai:
 * mỗi lần "có" là một lượt AI cộng một vòng dựng + deploy.
 */
export interface CloneFidelity {
  score: number;
  /** Dòng nội dung của trang gốc không tìm thấy trong bản sao. */
  missingLines: string[];
  missingTables: number;
  /** Mục menu bản sao tự bịa ra. */
  invented: string[];
}

/**
 * Ngưỡng CỐ Ý thấp. Nội dung động (ngày tháng, số liệu đổi theo giờ) khiến điểm gần như không bao
 * giờ chạm 100 — sửa ở mức 85 chỉ là khuấy động một bản sao vốn đã ổn, mà vẫn mất một lượt AI.
 */
export const CLONE_REPAIR_THRESHOLD = 70;

export function shouldRepairClone(
  f: CloneFidelity | undefined,
  opts: { mode: string; alreadyTried: boolean },
): boolean {
  if (!f) return false; // chưa chấm được — sửa mù còn tệ hơn không sửa
  if (opts.mode !== 'codegen') return false; // không đụng vào mã người dùng tự mang tới
  if (opts.alreadyTried) return false; // chỉ MỘT lần: có khoảng cách không bao giờ khép được
  if (f.score >= CLONE_REPAIR_THRESHOLD) return false;
  // Điểm thấp mà không nói được thiếu gì thì lượt sửa chỉ là đoán mò.
  return f.missingLines.length > 0 || f.missingTables > 0 || f.invented.length > 0;
}
