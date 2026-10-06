"use client";

import { useEffect } from "react";
import { useFinePointer, useReducedMotion } from "@/components/fx";

/**
 * Nghiêng NHẸ thẻ bấm được theo con trỏ — tối đa `maxTilt` độ (mặc định 4°).
 *
 * Khác TiltCard của trang tiếp thị (18°, lực hút, viền chạy theo chuột trên mọi thẻ gần): đây là
 * mặt làm việc, thẻ chỉ được "đáp lại" đúng cái thẻ đang rê, và chỉ vài độ. Không có lực hút,
 * không quét vệt loé, không đèn rọi.
 *
 * Vì sao là MỘT listener uỷ quyền trên document thay vì bọc từng thẻ bằng component: 27 trang đã
 * viết markup riêng (antd Card hoverable, .tw-lift, .tw-stat-card) — bọc lại là sửa từng trang.
 * Listener tìm thẻ gần nhất bằng `closest(SEL)`, ghi hai biến góc lên chính nó + class
 * `tw-srf-tilt`; công thức transform nằm trong surface.css. Mỗi khung hình chỉ đo MỘT thẻ.
 *
 * Trên cảm ứng hoặc khi giảm chuyển động: không gắn gì (thẻ đứng yên, không phải "nghiêng ít").
 */
const SEL = ".ant-card-hoverable, .tw-lift, .tw-stat-card, [data-tilt]";

export default function SurfaceTilt({ maxTilt = 4 }: { maxTilt?: number }) {
  const finePointer = useFinePointer();
  const reduced = useReducedMotion();
  const enabled = finePointer && !reduced;

  useEffect(() => {
    if (!enabled) return;
    let cur: HTMLElement | null = null;
    let raf = 0;
    let px = 0;
    let py = 0;

    const reset = (el: HTMLElement) => {
      el.classList.remove("tw-srf-tilt");
      el.style.removeProperty("--tw-srf-rx");
      el.style.removeProperty("--tw-srf-ry");
    };
    const tick = () => {
      raf = 0;
      if (!cur) return;
      const r = cur.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const nx = Math.min(1, Math.max(0, (px - r.left) / r.width));
      const ny = Math.min(1, Math.max(0, (py - r.top) / r.height));
      // Trỏ sang phải → xoay quanh trục Y về phía phải; trỏ lên trên → cạnh trên ngả ra sau.
      const ry = (nx - 0.5) * 2 * maxTilt;
      const rx = (0.5 - ny) * 2 * maxTilt;
      cur.style.setProperty("--tw-srf-rx", `${rx.toFixed(2)}deg`);
      cur.style.setProperty("--tw-srf-ry", `${ry.toFixed(2)}deg`);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType && e.pointerType !== "mouse") return;
      const target = e.target instanceof Element ? (e.target.closest(SEL) as HTMLElement | null) : null;
      if (target !== cur) {
        if (cur) reset(cur);
        cur = target;
        if (cur) cur.classList.add("tw-srf-tilt");
      }
      if (!cur) return;
      px = e.clientX;
      py = e.clientY;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    // Chuột rời hẳn cửa sổ → thẻ về vị trí, thay vì kẹt ở góc cuối.
    const onOut = (e: MouseEvent) => {
      if (e.relatedTarget === null && cur) {
        reset(cur);
        cur = null;
      }
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("mouseout", onOut);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("mouseout", onOut);
      if (raf) cancelAnimationFrame(raf);
      if (cur) reset(cur);
      cur = null;
    };
  }, [enabled, maxTilt]);

  return null;
}
