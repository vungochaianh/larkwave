type Listener = () => void;

/**
 * GÓI hoặc MỨC DÙNG vừa đổi.
 *
 * Vì sao cần: sau khi người dùng thanh toán xong trong bảng gói, thanh bên vẫn hiện phần trăm và
 * tên gói CŨ cho tới khi có người tải lại trang — họ vừa trả tiền và giao diện nói như chưa có gì
 * xảy ra. Ba chỗ đang tự gọi `api.subscription()` độc lập (SidebarQuotas, UsageWidget,
 * HomeDashboard) nên không có cách nào khác để chúng biết.
 */
const nguoiNgheGoi = new Set<Listener>();

/** Báo cho mọi nơi rằng gói / hạn mức vừa đổi (thanh toán xong, hạ gói, vừa đo lại). */
export function emitGoiChanged(): void {
  nguoiNgheGoi.forEach((l) => l());
}

/** Nghe sự kiện gói đổi; trả về hàm huỷ nghe. */
export function onGoiChanged(listener: Listener): () => void {
  nguoiNgheGoi.add(listener);
  return () => {
    nguoiNgheGoi.delete(listener);
  };
}
