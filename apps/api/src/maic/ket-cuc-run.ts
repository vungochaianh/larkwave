/**
 * Một lượt chạy MAIC ĐÃ XONG chưa — tức còn gì để chờ nữa không?
 *
 * Vì sao nó là một hàm có tên, có bài kiểm: khi luồng sự kiện đứt giữa chừng, chỏ này quyết
 * định chúng ta HỎI LẠI tới khi nào. Trả lời sai theo chiều “chưa xong” là treo người dùng hàng
 * chục phút cho một lượt đã chết; sai theo chiều “xong rồi” là ném bỏ một lượt sắp trả bài.
 *
 * `interrupted` là kết cục — nhưng là kết cục TẠM THỜI: MAIC ghi trạng thái này khi tiến trình
 * maic-api khởi động lại giữa lượt chạy (đo ngày 23/09/2026: ba lần tạo lại container trong hai
 * ngày). Phần “thử lại được” do `loiTamThoi` ở pipeline trả lời, không phải chỗ này.
 */
const KET_CUC = new Set([
  'succeeded',
  'failed',
  'cancelled',
  'canceled',
  'interrupted',
  'timeout',
  'timed_out',
  'error',
]);

export function laKetCucRun(status: string): boolean {
  return KET_CUC.has(status.trim().toLowerCase());
}
