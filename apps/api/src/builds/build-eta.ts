/**
 * Dự đoán thời gian một bản dựng — tính từ LỊCH SỬ THẬT, không phải con số cắm cứng.
 *
 * Đo trên dữ liệu production (2026-09-10): website thường p50 ~8,7 phút / p80 ~15 phút; bản sao
 * p50 ~15 phút / p80 ~38 phút; sửa app ~43 giây. Chênh lệch giữa các loại lớn tới mức một con số
 * chung là vô dụng — nói "khoảng 10 phút" cho một lượt clone rồi bắt người ta chờ 40 phút thì thà
 * đừng nói.
 */
export type BuildKind = 'clone' | 'codegen' | 'edit' | 'other';

export interface EtaStat {
  kind: BuildKind;
  /** Số mẫu dùng để tính. Ít mẫu quá thì rơi về mặc định đo sẵn. */
  samples: number;
  /** Giây — mốc "thường xong quanh đây". */
  p50: number;
  /** Giây — mốc "chậm thì tới đây", dùng làm cận trên của khoảng. */
  p80: number;
}

/**
 * Mặc định khi chưa đủ lịch sử. Lấy đúng số đo được ở trên chứ không ước lượng: một mặc định bịa
 * ra sẽ sai ngay từ ngày đầu và không ai biết để sửa.
 */
const FALLBACK: Record<BuildKind, { p50: number; p80: number }> = {
  clone: { p50: 890, p80: 2260 },
  codegen: { p50: 520, p80: 905 },
  edit: { p50: 45, p80: 60 },
  other: { p50: 520, p80: 905 },
};

/** Cần ít nhất chừng này mẫu mới tin lịch sử hơn mặc định. */
const MIN_SAMPLES = 5;

export function kindOf(input: { mode: string | null; hasSourceUrl: boolean }): BuildKind {
  if (input.mode === 'edit') return 'edit';
  if (input.mode !== 'codegen') return 'other';
  return input.hasSourceUrl ? 'clone' : 'codegen';
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!;
}

/**
 * `durations` = thời lượng (giây) của các bản dựng THÀNH CÔNG cùng loại, mới nhất trước.
 * Chỉ lấy bản thành công: một build thất bại ở phút thứ 2 sẽ kéo dự đoán xuống sai lệch.
 */
export function etaFor(kind: BuildKind, durations: number[]): EtaStat {
  const clean = durations.filter((d) => Number.isFinite(d) && d > 0).sort((a, b) => a - b);
  if (clean.length < MIN_SAMPLES) {
    return { kind, samples: clean.length, ...FALLBACK[kind] };
  }
  return { kind, samples: clean.length, p50: percentile(clean, 0.5), p80: percentile(clean, 0.8) };
}

/**
 * Còn bao lâu nữa, tính từ lúc bắt đầu. Không bao giờ trả số ÂM và không bao giờ tụt về 0 khi đã
 * quá hạn: một thanh đếm ngược đứng ở 0 phút trong khi build vẫn chạy còn khó chịu hơn không có.
 */
export function remainingSec(eta: EtaStat, elapsedSec: number): { remain: number; overdue: boolean } {
  const remain = eta.p50 - elapsedSec;
  if (remain > 0) return { remain, overdue: false };
  // Quá mốc p50 → chuyển sang nói theo p80; quá cả p80 thì thú nhận là không đoán được nữa.
  const remain80 = eta.p80 - elapsedSec;
  return { remain: Math.max(0, remain80), overdue: remain80 <= 0 };
}
