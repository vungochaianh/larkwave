"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { FxStyles } from "./FxStyles";
import { subscribePointer, distToRect } from "./pointerField";
import { useFinePointer, useReducedMotion } from "./useFxPrefs";

/**
 * Bọc một nút/link để nó bị con trỏ HÚT khi lại gần: trong bán kính `reach`, phần tử dịch về phía
 * con trỏ (tối đa `pull` px) và phóng nhẹ; chuột ở trên thì bám theo tay. Rời ra thì trôi về chỗ
 * cũ với transition dài — như một vật có khối lượng, không phải bật lò xo.
 *
 * Bọc bằng `<span class="tw-fx-mag">` inline-block, không đụng vào phần tử con, nên `<Link>`/`<a>`
 * bên trong giữ nguyên ngữ nghĩa và focus. Trên cảm ứng / giảm chuyển động: span rỗng hiệu ứng.
 */
export default function Magnetic({
  children,
  reach = 140,
  pull = 18,
  scale = 1.04,
  className,
  style,
}: {
  children: ReactNode;
  /** Bán kính (px) bắt đầu hút. */
  reach?: number;
  /** Dịch tối đa (px) khi chuột sát mép / ở trên. */
  pull?: number;
  /** Phóng khi chuột ở trên. */
  scale?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const finePointer = useFinePointer();
  const reduced = useReducedMotion();
  const enabled = finePointer && !reduced;

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let mgx = 0;
    let mgy = 0;
    let ms = 1;
    let inside = false;
    let idle = true;

    const unsubscribe = subscribePointer({
      measure(x, y, active) {
        if (!active) {
          mgx = mgy = 0;
          ms = 1;
          inside = false;
          return;
        }
        const r = el.getBoundingClientRect();
        if (r.width === 0) return;
        const d = distToRect(x, y, r);
        const near = Math.max(0, Math.min(1, 1 - d / reach));
        inside = d === 0;
        if (near === 0) {
          mgx = mgy = 0;
          ms = 1;
          return;
        }
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        // Ở trên nút: bám theo tay (tỉ lệ với lệch tâm). Ở ngoài: kéo về phía con trỏ theo near².
        if (inside) {
          mgx = ((x - cx) / (r.width / 2)) * pull * 0.6;
          mgy = ((y - cy) / (r.height / 2)) * pull * 0.6;
          ms = scale;
        } else {
          const vx = x - cx;
          const vy = y - cy;
          const len = Math.hypot(vx, vy) || 1;
          const k = near * near * pull;
          mgx = (vx / len) * k;
          mgy = (vy / len) * k;
          ms = 1 + (scale - 1) * near * 0.5;
        }
      },
      apply() {
        const zero = mgx === 0 && mgy === 0 && ms === 1;
        if (zero && idle) return;
        idle = zero;
        el.style.setProperty("--tw-fx-mgx", `${mgx.toFixed(1)}px`);
        el.style.setProperty("--tw-fx-mgy", `${mgy.toFixed(1)}px`);
        el.style.setProperty("--tw-fx-ms", ms.toFixed(3));
        el.classList.toggle("tw-fx-live", inside);
      },
    });
    return () => {
      unsubscribe();
      el.classList.remove("tw-fx-live");
      el.style.removeProperty("--tw-fx-mgx");
      el.style.removeProperty("--tw-fx-mgy");
      el.style.removeProperty("--tw-fx-ms");
    };
  }, [enabled, reach, pull, scale]);

  return (
    <span ref={ref} className={className ? `tw-fx-mag ${className}` : "tw-fx-mag"} style={style}>
      <FxStyles />
      {children}
    </span>
  );
}
