"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BRAND_GRADIENT, useI18n } from "@larkwave/ui";
import { FxStyles } from "./FxStyles";

const DEFAULT_KEY = "tw-fx-splash-seen";

/**
 * Màn mở đầu khi vào site lần đầu trong phiên. Tự tắt sau `duration` (mặc định 1,2s), có nút
 * "Bỏ qua", bấm bất kỳ đâu hoặc Esc cũng tắt. Sau đó không hiện lại cho tới khi mở tab mới
 * (sessionStorage).
 *
 * Vấn đề khó nhất không phải hiệu ứng mà là KHÔNG CHỚP với người quay lại: server không biết
 * sessionStorage, nên HTML luôn chứa splash; nếu chờ React hydrate rồi mới ẩn thì người đã xem sẽ
 * thấy nó loé lên vài trăm ms mỗi lần chuyển trang. Cách xử lý: một script inline nhỏ chạy NGAY
 * lúc parse HTML, đọc sessionStorage và gắn `data-tw-splash-seen` lên <html>; CSS trong FxStyles
 * ẩn splash theo thuộc tính đó trước khi trình duyệt vẽ khung đầu. React không quản lý thuộc
 * tính này nên hydrate không kêu lệch. CSP hiện tại chỉ có frame-ancestors nên inline script
 * chạy được; nếu sau này siết script-src thì cần nonce cho thẻ này.
 */
export default function SplashScreen({
  duration = 1200,
  tagline,
  storageKey = DEFAULT_KEY,
  onDone,
}: {
  /** Thời gian tự tắt (ms). Giữ ≤ 1500: splash lâu là lý do người ta đóng tab. */
  duration?: number;
  tagline?: string;
  /** Đổi khoá nếu muốn hai khu vực của site có splash riêng. */
  storageKey?: string;
  /** Gọi một lần khi splash biến mất (hết giờ hoặc bị bỏ qua) — để trang bắt đầu hiệu ứng hero sau đó. */
  onDone?: () => void;
}) {
  const { t } = useI18n();
  // "in": đang hiện; "out": đang mờ đi; "gone": đã gỡ khỏi cây.
  const [phase, setPhase] = useState<"in" | "out" | "gone">("in");
  const timers = useRef<number[]>([]);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };

  const dismiss = useCallback((fadeMs: number) => {
    clearTimers();
    setPhase((p) => (p === "gone" ? p : "out"));
    timers.current.push(
      window.setTimeout(() => {
        setPhase("gone");
        // Gắn cờ lên <html> ngay khi xong: điều hướng client-side sang trang khác cũng có splash
        // thì không parse lại HTML (script inline không chạy) — CSS theo cờ này ẩn nó trước effect.
        document.documentElement.setAttribute("data-tw-splash-seen", "");
        doneRef.current?.();
      }, fadeMs),
    );
  }, []);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(storageKey) === "1";
    } catch {
      /* Chế độ riêng tư chặn storage → coi như chưa xem, hiện một lần rồi thôi. */
    }
    if (seen) {
      // Gắn lại thuộc tính mà script inline đã gắn — phòng khi script không chạy (CSP siết sau này)
      // thì CSS vẫn ẩn được. Không setState ở đây: phần tử để display:none là đủ, không có timer
      // hay listener nào được gắn, và không gọi onDone vì không có gì "kết thúc" — trang đã hiện sẵn.
      document.documentElement.setAttribute("data-tw-splash-seen", "");
      return;
    }
    try {
      sessionStorage.setItem(storageKey, "1");
    } catch {
      /* bỏ qua */
    }
    timers.current.push(window.setTimeout(() => dismiss(300), duration));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss(200);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimers();
    };
  }, [storageKey, duration, dismiss]);

  if (phase === "gone") return null;

  // Chuỗi script cố định, không nội suy gì ngoài khoá storage đã JSON-hoá — không có đường cho
  // dữ liệu người dùng lọt vào.
  const antiFlash = `try{if(sessionStorage.getItem(${JSON.stringify(storageKey)})==="1")document.documentElement.setAttribute("data-tw-splash-seen","")}catch(e){}`;

  return (
    <>
      <FxStyles />
      <script dangerouslySetInnerHTML={{ __html: antiFlash }} />
      <div
        className="tw-fx-splash"
        data-phase={phase}
        role="status"
        aria-label="Larkwave"
        style={{ ["--tw-fx-splash-ms" as string]: `${duration}ms` }}
        onClick={() => dismiss(200)}
      >
        <div className="tw-fx-splash-mark">
          <span
            style={{
              display: "inline-flex",
              width: 64,
              height: 64,
              borderRadius: 20,
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              background: BRAND_GRADIENT,
              boxShadow: "var(--tw-fx-splash-shadow)",
            }}
          >
            {/* Cùng tia sét với LandingChrome — một nhận diện, không vẽ biến thể mới. */}
            <svg width={32} height={32} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13z" />
            </svg>
          </span>
        </div>
        <div className="tw-fx-splash-text">
          <div style={{ fontWeight: 800, letterSpacing: 4, fontSize: 24, lineHeight: 1.1 }}>TOOLSWAVE</div>
          <div style={{ marginTop: 8, fontSize: 14, color: "var(--tw-text-sub, #6B7280)", maxWidth: 320 }}>
            {tagline ?? t("landing.splash.tagline.lw", "Trợ lý AI cho Lark")}
          </div>
        </div>
        <div className="tw-fx-splash-bar" aria-hidden="true">
          <i />
        </div>
        <button
          type="button"
          className="tw-fx-splash-skip"
          onClick={(e) => {
            e.stopPropagation();
            dismiss(200);
          }}
        >
          {t("landing.splash.skip", "Bỏ qua")}
        </button>
      </div>
    </>
  );
}
