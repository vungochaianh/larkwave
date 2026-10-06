"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { FX_BRAND_RGB, readFxTheme, rgba, watchFxTheme, type FxRgb, type FxTheme } from "./fxTheme";
import { FxStyles } from "./FxStyles";
import { useReducedMotion } from "./useFxPrefs";

type Star = { x: number; y: number; z: number; tint: FxRgb | null };

/**
 * Nền hero vẽ bằng Canvas 2D — hai kiểu: `stars` (sao bay về phía người xem) và `grid` (lưới sàn
 * phối cảnh trôi tới). Không WebGL: cả hai chỉ là vài trăm chấm/đường mỗi khung, Canvas 2D thừa sức
 * và không kéo thêm shader/bundle nào.
 *
 * Đặt trong một khối `position: relative`; canvas tự phủ kín (`absolute; inset: 0`) và không nhận
 * chuột. Vòng vẽ DỪNG HẲN khi tab ẩn (`document.hidden`) và khi khối ra khỏi khung nhìn — một tab
 * landing để quên mà vẫn ngốn CPU là thứ người dùng đóng tab vì nó.
 *
 * Giảm chuyển động: vẽ đúng MỘT khung tĩnh rồi thôi — bố cục giữ nguyên, không có gì trôi.
 */
export default function Starfield({
  variant = "stars",
  density = 1,
  speed = 1,
  fade = true,
  className,
  style,
}: {
  variant?: "stars" | "grid";
  /** Hệ số mật độ sao (1 = mặc định, tự co theo diện tích). Chỉ áp dụng cho `stars`. */
  density?: number;
  /** Hệ số tốc độ trôi (1 = mặc định, chậm rãi). */
  speed?: number;
  /** Mờ dần ở rìa để hoà vào nền trang. */
  fade?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let dpr = 1;
    let theme: FxTheme = readFxTheme(canvas);
    const stars: Star[] = [];
    let raf = 0;
    let last = 0;
    let t = 0; // thời gian tích luỹ (giây) cho lưới
    let visible = true;

    // Sao sinh trên "mặt phẳng xa" toạ độ [-1,1]², z là khoảng cách 1 (xa) → 0 (sát mắt).
    const spawn = (z = Math.random()): Star => ({
      x: Math.random() * 2 - 1,
      y: Math.random() * 2 - 1,
      z: Math.max(0.05, z),
      // 1/6 số sao mang màu thương hiệu — đủ nhận diện, không thành dàn đèn.
      tint: Math.random() < 1 / 6 ? FX_BRAND_RGB[Math.floor(Math.random() * FX_BRAND_RGB.length)] : null,
    });

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width));
      h = Math.max(1, Math.round(r.height));
      // Trần 2× DPR: màn 3× vẽ gấp 9 lần pixel cho mấy chấm mờ, mắt không phân biệt nổi.
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Số sao co theo diện tích (≈1 sao / 9000px²) để điện thoại không bị dày đặc như màn 27".
      const n = Math.round(Math.min(420, Math.max(60, ((w * h) / 9000) * density)));
      while (stars.length < n) stars.push(spawn());
      stars.length = Math.min(stars.length, n);
      drawFrame(0);
    };

    const drawStars = (dt: number) => {
      const cx = w / 2;
      const cy = h / 2;
      // Nền sáng: mực đậm trên trắng dễ thành "bụi bẩn", nên alpha thấp hơn hẳn so với nền tối.
      const maxA = theme.dark ? 0.9 : 0.42;
      for (const s of stars) {
        const pz = s.z;
        s.z -= dt * 0.11 * speed;
        if (s.z <= 0.05) {
          Object.assign(s, spawn(1));
          continue;
        }
        const sx = cx + (s.x * cx) / s.z;
        const sy = cy + (s.y * cy) / s.z;
        if (sx < -4 || sx > w + 4 || sy < -4 || sy > h + 4) {
          Object.assign(s, spawn(1));
          continue;
        }
        const near = 1 - s.z; // 0 xa → 1 gần
        const a = Math.min(maxA, 0.08 + near * near * maxA);
        const col = s.tint ?? theme.ink;
        // Sao gần thì kéo một vệt ngắn về vị trí khung trước: cảm giác đang lao tới mà không cần
        // vệt dài kiểu "warp" loè loẹt.
        if (near > 0.7 && dt > 0) {
          const px = cx + (s.x * cx) / pz;
          const py = cy + (s.y * cy) / pz;
          ctx.strokeStyle = rgba(col, a * 0.6);
          ctx.lineWidth = 0.6 + near * 1.4;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(sx, sy);
          ctx.stroke();
        }
        ctx.fillStyle = rgba(col, a);
        ctx.beginPath();
        ctx.arc(sx, sy, 0.6 + near * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const drawGrid = () => {
      const cx = w / 2;
      const horizon = h * 0.42;
      const floor = h - horizon;
      const base = theme.dark ? 0.55 : 0.3;
      const ink = theme.ink;
      const brand = FX_BRAND_RGB[0];

      // Đường dọc hội tụ về điểm biến mất ở đường chân trời; toả rộng hơn khung để mép không hở.
      const cols = 14;
      ctx.lineWidth = 1;
      for (let j = -cols; j <= cols; j++) {
        const x = cx + (j / cols) * w * 0.95;
        const grad = ctx.createLinearGradient(0, horizon, 0, h);
        grad.addColorStop(0, rgba(ink, 0));
        grad.addColorStop(1, rgba(ink, base * 0.5));
        ctx.strokeStyle = grad;
        ctx.beginPath();
        ctx.moveTo(cx, horizon);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      // Đường ngang: vị trí theo z ∈ (0,1] tăng dần theo thời gian; y = horizon + floor·z² để đường
      // càng gần càng chạy nhanh — đúng cảm giác phối cảnh, không phải băng chuyền đều.
      const rows = 14;
      for (let i = 0; i < rows; i++) {
        const z = ((i / rows + t * 0.06 * speed) % 1 + 1) % 1;
        const y = horizon + floor * z * z;
        const a = base * Math.min(1, z * 1.6);
        ctx.strokeStyle = rgba(ink, a * 0.5);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      // Một vạch sáng tím mảnh ở chân trời — điểm nhấn thương hiệu duy nhất của lưới.
      const glow = ctx.createLinearGradient(0, 0, w, 0);
      glow.addColorStop(0, rgba(brand, 0));
      glow.addColorStop(0.5, rgba(brand, theme.dark ? 0.7 : 0.45));
      glow.addColorStop(1, rgba(brand, 0));
      ctx.strokeStyle = glow;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, horizon);
      ctx.lineTo(w, horizon);
      ctx.stroke();
    };

    const drawFrame = (dt: number) => {
      ctx.clearRect(0, 0, w, h);
      if (variant === "grid") drawGrid();
      else drawStars(dt);
    };

    const loop = (now: number) => {
      raf = 0;
      // Trần 50ms: tab vừa được ưu tiên lại sau khi bị trình duyệt hãm thì không nhảy vọt một cú.
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      t += dt;
      drawFrame(dt);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (reduced || raf || !visible || document.hidden) return;
      last = 0;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const onVisibility = () => (document.hidden ? stop() : start());
    const io = new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      if (visible) start();
      else stop();
    });
    const ro = new ResizeObserver(resize);
    const unwatchTheme = watchFxTheme(() => {
      theme = readFxTheme(canvas);
      drawFrame(0);
    });

    resize();
    io.observe(canvas);
    ro.observe(canvas);
    document.addEventListener("visibilitychange", onVisibility);
    start();

    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      unwatchTheme();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [variant, density, speed, reduced]);

  const cls = ["tw-fx-canvas", fade ? "tw-fx-fade" : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <>
      <FxStyles />
      <canvas ref={ref} className={cls} style={style} aria-hidden="true" />
    </>
  );
}
