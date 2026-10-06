/**
 * Tiny global pub/sub for "an app changed" (pinned/unpinned, archived, deleted,
 * renamed, published). Lets cross-component views that cache an app list — chiefly
 * the sidebar's pinned-apps strip in <AppShell> — refresh immediately instead of
 * only on navigation (which is why pinning used to need an F5 to show up).
 */
type Listener = () => void;

const listeners = new Set<Listener>();

/** Notify all subscribers that an app's state changed. */
export function emitAppsChanged(): void {
  listeners.forEach((l) => l());
}

/** Subscribe to app-change events; returns an unsubscribe fn. */
export function onAppsChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Sự kiện thứ hai, tách hẳn khỏi "app đổi": GÓI hoặc MỨC DÙNG vừa đổi.
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
