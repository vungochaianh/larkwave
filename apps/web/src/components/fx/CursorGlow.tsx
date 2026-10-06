"use client";

import { useEffect, useRef } from "react";
import { FxStyles } from "./FxStyles";
import { useFinePointer, useReducedMotion } from "./useFxPrefs";

/**
 * Đèn rọi bám con trỏ, phủ toàn khung nhìn (position: fixed), `pointer-events: none` nên không
 * chắn thao tác nào bên dưới.
 *
 * Hai lớp: một quầng RỘNG mờ (như đèn phòng) và một LÕI nhỏ sáng (đèn rọi). Lõi đuổi nhanh, quầng
 * đuổi chậm hơn một nhịp — chênh lệch đó đọc là "ánh sáng có quán tính", không phải con trỏ thứ
 * hai. Đợt trước quầng để alpha "rất thấp" nên gần như vô hình; giờ trên nền tối lõi ở alpha ~.5
 * với blend `screen`, người dùng thấy ngay ở cú rê chuột đầu tiên.
 *
 * Vòng rAF chỉ chạy khi còn đang đuổi; đứng yên là dừng hẳn, không tốn CPU lúc nhàn rỗi.
 * Trên cảm ứng và khi giảm chuyển động: không render gì cả (không có con trỏ để đi theo).
 */
export default function CursorGlow({
  size = 900,
  coreSize = 260,
  zIndex = 0,
}: {
  /** Đường kính quầng rộng (px). */
  size?: number;
  /** Đường kính lõi sáng (px). */
  coreSize?: number;
  /**
   * Nằm TRÊN nội dung (z-index ≥ 0) — cố ý: đặt dưới thì nền đặc của `<main>` che mất. Nhờ blend
   * `screen` (tối) / `multiply` (sáng) nó cộng/nhân sáng vào thứ nó đi qua thay vì phủ lên.
   */
  zIndex?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const finePointer = useFinePointer();
  const reduced = useReducedMotion();
  const enabled = finePointer && !reduced;

  useEffect(() => {
    const wrap = ref.current;
    if (!wrap || !enabled) return;
    const wide = wrap.children[0] as HTMLElement | undefined;
    const core = wrap.children[1] as HTMLElement | undefined;
    if (!wide || !core) return;

    let raf = 0;
    let tx = -size;
    let ty = -size;
    let wx = tx;
    let wy = ty;
    let cx = tx;
    let cy = ty;
    const hw = size / 2;
    const hc = coreSize / 2;

    const tick = () => {
      raf = 0;
      cx += (tx - cx) * 0.22;
      cy += (ty - cy) * 0.22;
      wx += (tx - wx) * 0.08;
      wy += (ty - wy) * 0.08;
      core.style.transform = `translate3d(${(cx - hc).toFixed(1)}px,${(cy - hc).toFixed(1)}px,0)`;
      wide.style.transform = `translate3d(${(wx - hw).toFixed(1)}px,${(wy - hw).toFixed(1)}px,0)`;
      // Còn cách đích hơn nửa pixel thì đuổi tiếp; gần rồi thì dừng vòng lặp.
      if (Math.abs(tx - wx) > 0.5 || Math.abs(ty - wy) > 0.5 || Math.abs(tx - cx) > 0.5 || Math.abs(ty - cy) > 0.5) {
        raf = requestAnimationFrame(tick);
      }
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType && e.pointerType !== "mouse") return;
      tx = e.clientX;
      ty = e.clientY;
      wrap.classList.add("tw-fx-on");
      if (!raf) raf = requestAnimationFrame(tick);
    };
    // Chuột rời khỏi cửa sổ trình duyệt → đèn mờ đi, thay vì đứng chết ở mép màn hình.
    const onOut = (e: MouseEvent) => {
      if (e.relatedTarget === null) wrap.classList.remove("tw-fx-on");
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("mouseout", onOut);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("mouseout", onOut);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [enabled, size, coreSize]);

  if (!enabled) return null;
  return (
    <div ref={ref} className="tw-fx-glow" style={{ zIndex }} aria-hidden="true">
      <i className="tw-fx-glow-wide" style={{ width: size, height: size }} />
      <i className="tw-fx-glow-core" style={{ width: coreSize, height: coreSize }} />
      <FxStyles />
    </div>
  );
}
