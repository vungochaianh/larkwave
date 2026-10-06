"use client";

/**
 * Trường con trỏ dùng chung cho TiltCard và Magnetic.
 *
 * Vì sao cần: hiệu ứng "viền phát sáng bám chuột" và "lực hút" phải chạy trên MỌI thẻ gần con trỏ,
 * không chỉ thẻ đang hover — nên mỗi thẻ không thể tự gắn pointermove của riêng nó (chỉ nhận khi
 * chuột ở trên). Thay vào đó: MỘT listener trên window, gom về một rAF mỗi khung hình, rồi phát
 * cho mọi thẻ đã đăng ký.
 *
 * Hai pha đo/ghi: mọi thẻ đo `getBoundingClientRect` trước, rồi mới ghi biến CSS. Xen kẽ đo–ghi
 * (thẻ A ghi transform, thẻ B đo) ép trình duyệt tính lại style N lần một khung hình — với 20 thẻ
 * là thấy giật ngay.
 */
export type PointerSub = {
  /** Pha đo: chỉ đọc DOM. `active` = false khi chuột đã rời cửa sổ. */
  measure: (x: number, y: number, active: boolean) => void;
  /** Pha ghi: chỉ ghi DOM. */
  apply: () => void;
};

const subs = new Set<PointerSub>();
let px = -1e4;
let py = -1e4;
let active = false;
let raf = 0;
let bound = false;

function flush() {
  raf = 0;
  subs.forEach((s) => s.measure(px, py, active));
  subs.forEach((s) => s.apply());
}
function schedule() {
  if (!raf) raf = requestAnimationFrame(flush);
}
function onMove(e: PointerEvent) {
  if (e.pointerType && e.pointerType !== "mouse") return;
  px = e.clientX;
  py = e.clientY;
  active = true;
  schedule();
}
/** Chuột rời hẳn cửa sổ → mọi thẻ tắt sáng, thay vì kẹt ở trạng thái cuối. */
function onOut(e: MouseEvent) {
  if (e.relatedTarget === null) {
    active = false;
    schedule();
  }
}
/** Cuộn trang làm thẻ trượt dưới con trỏ đứng yên — vẫn phải tính lại. */
function onScroll() {
  if (active) schedule();
}

function bind() {
  if (bound) return;
  bound = true;
  window.addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("mouseout", onOut);
  window.addEventListener("scroll", onScroll, { passive: true });
}
function unbind() {
  if (!bound) return;
  bound = false;
  window.removeEventListener("pointermove", onMove);
  document.removeEventListener("mouseout", onOut);
  window.removeEventListener("scroll", onScroll);
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

/** Đăng ký một phần tử vào trường; trả về hàm gỡ. Listener chỉ tồn tại khi còn ít nhất một thẻ. */
export function subscribePointer(sub: PointerSub): () => void {
  subs.add(sub);
  bind();
  // Thẻ mới mount lúc chuột đang ở trong trang (điều hướng client-side): cho nó biết ngay.
  if (active) schedule();
  return () => {
    subs.delete(sub);
    if (subs.size === 0) unbind();
  };
}

/** Khoảng cách từ điểm tới hình chữ nhật (0 nếu điểm nằm trong). */
export function distToRect(x: number, y: number, r: DOMRect): number {
  const dx = Math.max(r.left - x, 0, x - r.right);
  const dy = Math.max(r.top - y, 0, y - r.bottom);
  return Math.hypot(dx, dy);
}
