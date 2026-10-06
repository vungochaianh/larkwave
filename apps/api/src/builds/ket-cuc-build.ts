/**
 * Một build ĐÃ NGÃ VỀ KẾT CỤC chưa — hay nó chỉ đang tạm dừng?
 *
 * Vì sao nó là một hàm có tên, có bài kiểm, thay vì một phép so sánh nằm giữa thân hàm: chỗ này
 * phân biệt "xong rồi" với "đang đợi người dùng", và nhầm hai thứ đó đã phá một bộ site thật.
 *
 * Đo ngày 23/09/2026 trên tài khoản của một người dùng:
 *
 *   04:13:22.947  build site API DỪNG ở cổng duyệt thiết kế (preset "Kỹ" ⇒ autoApprove = false)
 *   04:13:22.958  ← 11 mili giây sau: cms và portal bị ghi 'failed', startedAt = null, mọi bước
 *                  còn 'pending' — chúng chưa chạy một dòng nào
 *
 * Nguyên nhân: `pump()` đọc trạng thái đã lưu rồi coi MỌI thứ khác 'succeeded' là thất bại, nên
 * một lần TẠM DỪNG do chính hệ thống mời người dùng thực hiện bị tính là hỏng, và `releaseSuite`
 * đánh hỏng toàn bộ tầng sau kèm câu "Một site mà các site này dựa vào đã dựng không thành công".
 * Người dùng đặt bốn site, nhận về ba site chết và một site đứng chờ — với một lời giải thích
 * SAI SỰ THẬT về chính cái build đang đợi họ bấm duyệt.
 *
 * 'awaiting_approval' KHÔNG có trong danh sách này, và đó là toàn bộ điểm của tệp này.
 */
const KET_CUC = new Set(['succeeded', 'failed', 'canceled']);

export function laKetCucBuild(status: string): boolean {
  return KET_CUC.has(status.trim().toLowerCase());
}
