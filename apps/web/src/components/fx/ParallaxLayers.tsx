"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { FxStyles } from "./FxStyles";
import { useFinePointer, useReducedMotion } from "./useFxPrefs";

export type ParallaxLayer = {
  node: ReactNode;
  /**
   * Độ sâu 0..1: 0 đứng yên cùng nội dung, 1 dịch nhiều nhất. Lớp "xa" (mờ, to) nên có depth nhỏ,
   * lớp "gần" depth lớn — mắt đọc chênh lệch đó thành chiều sâu.
   */
  depth: number;
  style?: CSSProperties;
};

/**
 * Vài lớp nền dịch chuyển lệch nhau theo cuộn trang và theo chuột; `children` là nội dung phía
 * trước, không dịch.
 *
 * Chiều sâu đến từ HAI cơ chế cộng lại:
 *  - Dịch chuyển lệch theo depth, biên độ mặc định 120px theo cuộn / 48px theo chuột (ở depth 1).
 *    Đợt trước để 28–48px nên các lớp gần như đi cùng nhau — không đủ chênh lệch để cảm được không
 *    gian. Lớp gần dịch ~4× lớp xa mới đọc được là "ở trước".
 *  - Cả sân khấu (khối preserve-3d có perspective) nghiêng tới `tilt` độ theo chuột: lúc đó trình
 *    duyệt tự dựng phối cảnh thật cho các lớp — thứ translate không giả được.
 *
 * Vị trí ghi thẳng vào `style` trong rAF chứ không qua React state — mỗi lần cuộn mà setState là
 * re-render cả cây con. Chỉ tính khi khối đang trong khung nhìn (IntersectionObserver): trang
 * landing dài có nhiều khối parallax, khối nào khuất thì đứng im.
 */
export default function ParallaxLayers({
  layers,
  children,
  scrollRange = 120,
  mouseRange = 48,
  tilt = 3,
  className,
  style,
}: {
  layers: ParallaxLayer[];
  children?: ReactNode;
  /** Biên độ dịch tối đa theo cuộn (px, ở depth = 1). */
  scrollRange?: number;
  /** Biên độ dịch tối đa theo chuột (px, ở depth = 1). Tự tắt trên cảm ứng. */
  mouseRange?: number;
  /** Góc nghiêng tối đa (độ) của cả sân khấu theo chuột. 0 để tắt (khối rất cao thì nên tắt). */
  tilt?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const layerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const finePointer = useFinePointer();
  const reduced = useReducedMotion();

  // Depth vào ref để effect chính không phải chạy lại (gỡ/gắn listener) mỗi khi mảng `layers` được
  // tạo mới ở render cha; ghi trong effect chứ không trong render để đúng luật hooks.
  const depths = useRef<number[]>([]);
  useEffect(() => {
    depths.current = layers.map((l) => l.depth);
  });

  useEffect(() => {
    const el = ref.current;
    const stage = stageRef.current;
    if (!el || !stage || reduced) return;

    const nodes = layerRefs.current; // giữ mảng lúc gắn để cleanup dọn đúng các node đó
    let raf = 0;
    let visible = false;
    let sy = 0; // dịch dọc theo cuộn
    let mx = 0; // -1..1 theo chuột
    let my = 0;

    const paint = () => {
      raf = 0;
      const ds = depths.current;
      nodes.forEach((node, i) => {
        if (!node) return;
        const d = ds[i] ?? 0;
        const x = mx * mouseRange * d;
        const y = sy * d + my * mouseRange * d;
        node.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
      });
      if (tilt > 0) {
        // Trỏ sang phải → sân khấu xoay quanh trục Y về phía phải; trỏ lên → cạnh trên ngả ra sau.
        stage.style.setProperty("--tw-fx-pry", `${(mx * tilt).toFixed(2)}deg`);
        stage.style.setProperty("--tw-fx-prx", `${(-my * tilt).toFixed(2)}deg`);
      }
    };
    const schedule = () => {
      if (visible && !raf) raf = requestAnimationFrame(paint);
    };
    // Tiến độ = tâm khối lệch bao xa so với tâm khung nhìn, chuẩn hoá về [-1, 1]: khối ở giữa màn
    // thì lớp nền ở vị trí gốc, cuộn lên/xuống thì lệch đối xứng — không phụ thuộc chiều cao trang.
    const onScroll = () => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const p = Math.max(-1, Math.min(1, (r.top + r.height / 2 - vh / 2) / vh));
      sy = -p * scrollRange;
      schedule();
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType && e.pointerType !== "mouse") return;
      const vw = window.innerWidth || 1;
      const vh = window.innerHeight || 1;
      mx = (e.clientX / vw - 0.5) * 2;
      my = (e.clientY / vh - 0.5) * 2;
      schedule();
    };

    const io = new IntersectionObserver(
      (entries) => {
        visible = entries.some((en) => en.isIntersecting);
        if (visible) onScroll();
      },
      { rootMargin: "10% 0px" },
    );
    io.observe(el);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    if (finePointer) window.addEventListener("pointermove", onMove, { passive: true });
    onScroll();

    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
      nodes.forEach((node) => {
        if (node) node.style.transform = "";
      });
      stage.style.removeProperty("--tw-fx-prx");
      stage.style.removeProperty("--tw-fx-pry");
    };
  }, [reduced, finePointer, scrollRange, mouseRange, tilt]);

  return (
    <div ref={ref} className={className ? `tw-fx-parallax ${className}` : "tw-fx-parallax"} style={style}>
      <FxStyles />
      <div ref={stageRef} className="tw-fx-parallax-stage" aria-hidden="true">
        {layers.map((l, i) => (
          <div
            key={i}
            ref={(node) => {
              layerRefs.current[i] = node;
            }}
            className="tw-fx-parallax-layer"
            style={l.style}
          >
            {l.node}
          </div>
        ))}
      </div>
      {children !== undefined && <div className="tw-fx-parallax-fg">{children}</div>}
    </div>
  );
}
