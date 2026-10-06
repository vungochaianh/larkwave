"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { FxStyles } from "./FxStyles";
import { subscribePointer, distToRect } from "./pointerField";
import { useFinePointer, useReducedMotion } from "./useFxPrefs";

/**
 * Thẻ 3D phản ứng với con trỏ theo BỐN cách, cả bốn đều phải nhìn thấy ngay:
 *
 *  1. Viền phát sáng bám con trỏ trên mọi thẻ trong bán kính `reach` — kể cả thẻ chưa hover. Rê
 *     chuột qua một lưới thẻ là thấy ánh sáng chạy theo trên viền từng thẻ.
 *  2. Lực hút: thẻ gần con trỏ dịch nhẹ VỀ PHÍA con trỏ (tối đa `magnet` px), như bị nam châm kéo.
 *  3. Nghiêng theo con trỏ khi ở trên thẻ, tới `maxTilt` độ ở mép (mặc định 18° — đợt trước 4–8°
 *     mắt thường không thấy) + phóng nhẹ.
 *  4. Vệt loé quét ngang mặt kính đúng lúc con trỏ bước vào, và quầng sáng bám theo trên mặt thẻ.
 *
 * Thẻ đọc vị trí chuột từ `pointerField` (một listener chung cho cả trang), không tự gắn
 * pointermove — xem chú thích ở đó. Trên cảm ứng hoặc khi giảm chuyển động: render y hệt về bố
 * cục nhưng không đăng ký gì — không phải "nghiêng ít hơn", mà là đứng yên.
 *
 * Người dùng đặt border/bo góc/nền lên chính thẻ này qua `style`/`className` (hoặc thêm class
 * `tw-fx-glass`); các lớp ánh sáng dùng `border-radius: inherit` nên tự khớp bo góc.
 */
export default function TiltCard({
  children,
  maxTilt = 18,
  scale = 1.04,
  magnet = 14,
  reach = 320,
  glare = true,
  className,
  style,
}: {
  children: ReactNode;
  /** Góc nghiêng tối đa (độ) ở mép thẻ. 15–22° mới đủ thấy; thẻ rất rộng (mockup) nên hạ xuống ~10. */
  maxTilt?: number;
  /** Phóng khi hover để thẻ "nổi lên" — đặt 1 để tắt. */
  scale?: number;
  /** Lực hút tối đa (px) khi con trỏ ở gần nhưng chưa chạm thẻ. 0 để tắt. */
  magnet?: number;
  /** Bán kính (px) mà thẻ bắt đầu phản ứng (viền sáng dần, bị hút). */
  reach?: number;
  /** Quầng sáng + vệt quét trên mặt thẻ. */
  glare?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const finePointer = useFinePointer();
  const reduced = useReducedMotion();
  const enabled = finePointer && !reduced;

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    // Trạng thái đo được ở pha measure, ghi ra ở pha apply.
    let inside = false;
    let near = 0;
    let lastNear = -1;
    let lx = 0;
    let ly = 0;
    let nx = 0.5;
    let ny = 0.5;
    let mgx = 0;
    let mgy = 0;

    const unsubscribe = subscribePointer({
      measure(x, y, active) {
        if (!active) {
          near = 0;
          inside = false;
          mgx = mgy = 0;
          return;
        }
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        // Thẻ ngoài khung nhìn thì không cần đo gì thêm — nhưng vẫn phải về 0 nếu đang sáng.
        const vh = window.innerHeight || 1;
        if (r.bottom < -reach || r.top > vh + reach) {
          near = 0;
          inside = false;
          mgx = mgy = 0;
          return;
        }
        const d = distToRect(x, y, r);
        inside = d === 0;
        near = Math.max(0, Math.min(1, 1 - d / reach));
        lx = x - r.left;
        ly = y - r.top;
        nx = Math.min(1, Math.max(0, lx / r.width));
        ny = Math.min(1, Math.max(0, ly / r.height));
        // Lực hút chỉ khi ở NGOÀI thẻ: bên trong thì thẻ nghiêng theo, hút thêm nữa là rung.
        // Bình phương `near` để lực tăng dần chứ không giật lúc vừa vào bán kính.
        if (!inside && near > 0 && magnet > 0) {
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          const vx = x - cx;
          const vy = y - cy;
          const len = Math.hypot(vx, vy) || 1;
          const k = near * near * magnet;
          mgx = (vx / len) * k;
          mgy = (vy / len) * k;
        } else {
          mgx = mgy = 0;
        }
      },
      apply() {
        // Thẻ xa chuột và vẫn xa như khung trước: không ghi gì (đây là trường hợp phổ biến nhất).
        if (near === 0 && lastNear === 0) return;
        lastNear = near;
        const s = el.style;
        s.setProperty("--tw-fx-near", near.toFixed(3));
        s.setProperty("--tw-fx-lx", `${lx.toFixed(1)}px`);
        s.setProperty("--tw-fx-ly", `${ly.toFixed(1)}px`);
        s.setProperty("--tw-fx-mx", `${(nx * 100).toFixed(1)}%`);
        s.setProperty("--tw-fx-my", `${(ny * 100).toFixed(1)}%`);
        s.setProperty("--tw-fx-mgx", `${mgx.toFixed(1)}px`);
        s.setProperty("--tw-fx-mgy", `${mgy.toFixed(1)}px`);
        if (inside) {
          const ry = (nx - 0.5) * 2 * maxTilt; // trỏ sang phải → xoay quanh trục Y về phía phải
          const rx = (0.5 - ny) * 2 * maxTilt; // trỏ lên trên → cạnh trên ngả ra sau
          s.setProperty("--tw-fx-rx", `${rx.toFixed(2)}deg`);
          s.setProperty("--tw-fx-ry", `${ry.toFixed(2)}deg`);
        } else {
          s.setProperty("--tw-fx-rx", "0deg");
          s.setProperty("--tw-fx-ry", "0deg");
        }
      },
    });

    // Vào/ra thẻ vẫn dùng sự kiện của chính thẻ: đó là mốc để phóng, đổi transition và quét vệt loé.
    const onEnter = () => {
      el.classList.add("tw-fx-live", "tw-fx-sweep");
      el.style.setProperty("--tw-fx-s", String(scale));
      el.style.setProperty("--tw-fx-go", "1");
    };
    const onLeave = () => {
      el.classList.remove("tw-fx-live", "tw-fx-sweep");
      el.style.setProperty("--tw-fx-rx", "0deg");
      el.style.setProperty("--tw-fx-ry", "0deg");
      el.style.setProperty("--tw-fx-s", "1");
      el.style.setProperty("--tw-fx-go", "0");
    };
    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointerleave", onLeave);

    return () => {
      unsubscribe();
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointerleave", onLeave);
      onLeave();
      el.style.setProperty("--tw-fx-near", "0");
      el.style.setProperty("--tw-fx-mgx", "0px");
      el.style.setProperty("--tw-fx-mgy", "0px");
    };
  }, [enabled, maxTilt, scale, magnet, reach]);

  return (
    <div ref={ref} className={className ? `tw-fx-tilt ${className}` : "tw-fx-tilt"} style={style}>
      <FxStyles />
      {children}
      {glare && enabled && (
        <>
          <span className="tw-fx-tilt-glare" aria-hidden="true" />
          <span className="tw-fx-tilt-sheen" aria-hidden="true" />
        </>
      )}
    </div>
  );
}
