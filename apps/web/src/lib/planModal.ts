/**
 * Mở bảng "Gói & mức dùng" từ BẤT KỲ ĐÂU — kể cả từ mã không phải React.
 *
 * Vì sao là pub/sub ở tầng module chứ không phải một React context: chỗ cần mở nó nhất là
 * `handleQuotaError` trong `lib/billing.ts` — một hàm thường, được gọi trong khối catch của một
 * lần bấm, không có hook nào ở đó. Trước đây chỗ ấy chỉ biết `router.push('/pricing')`, tức ném
 * người dùng ra khỏi bảng điều khiển đúng lúc họ vừa bấm dựng một app.
 *
 * `moBangGoi` trả về `false` khi KHÔNG có ai đang nghe (ví dụ trang công khai không mặc vỏ
 * dashboard, nên không có `<PlanModal/>` nào được gắn). Nơi gọi đọc giá trị đó để rơi về đường cũ
 * — điều hướng sang /pricing — thay vì bấm mà không có gì xảy ra.
 */
export type LyDoMoGoi = 'het-han-muc' | 'tat-goi-mien-phi' | 'tu-nguoi-dung';

type Listener = (lyDo: LyDoMoGoi) => void;

const listeners = new Set<Listener>();

/** Yêu cầu mở bảng gói. Trả về false nếu không có chỗ nào nghe — hãy tự lo đường khác. */
export function moBangGoi(lyDo: LyDoMoGoi = 'tu-nguoi-dung'): boolean {
  if (!listeners.size) return false;
  listeners.forEach((l) => l(lyDo));
  return true;
}

/** Nghe yêu cầu mở bảng gói; trả về hàm huỷ nghe. */
export function onMoBangGoi(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
