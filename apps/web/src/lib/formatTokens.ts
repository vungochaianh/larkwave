/**
 * Số token viết gọn cho những chỗ chật (thanh bên, ô thống kê ở trang chủ): 1.234.567 → "1,2M".
 *
 * Dùng dấu phẩy thập phân kiểu Việt. Dưới 1.000 thì in đủ số — ở khoảng đó "0,8K" khó đọc hơn
 * chính con số.
 */
export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0).replace(".", ",")}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(n < 10_000 ? 1 : 0).replace(".", ",")}K`;
  }
  return n.toLocaleString("vi-VN");
}

/**
 * Tỉ lệ so với mức gói danh nghĩa — CHỈ dùng làm mốc tham chiếu cho tài khoản không giới hạn,
 * không phải hạn mức. Có thể vượt 100: bên gọi tự quyết cắt hay không.
 */
export function refPercent(used: number, limit: number): number {
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return 0;
  return (used / limit) * 100;
}
