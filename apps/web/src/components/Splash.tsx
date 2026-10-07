import { BrandGlyph } from "@larkwave/ui";
import { BRAND_GRADIENT } from "@/lib/theme";

/**
 * Premium full-screen branded splash used for auth/route loading states.
 *
 * Centered LARKWAVE logo mark + wordmark on a faint brand-gradient backdrop,
 * a short tagline, and a slim shimmering gradient loader bar. This replaces the
 * bare antd Spin for a more polished first impression.
 *
 * Pure CSS animations (keyframes injected inline) keep it self-contained and
 * usable from a Server Component (no "use client" needed).
 */
export default function Splash({
  tagline = "Nhập một câu lệnh → ra app ngay",
}: {
  tagline?: string;
}) {
  return (
    <div
      className="tw-auth-bg"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 22,
        padding: 24,
      }}
    >
      <style>{SPLASH_CSS}</style>

      {/* Logo mark */}
      <div className="tw-splash-mark">
        <span
          style={{
            display: "inline-flex",
            width: 64,
            height: 64,
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
            fontSize: 36,
            color: "#fff",
            background: BRAND_GRADIENT,
            boxShadow: "0 16px 40px rgba(108,92,231,0.34)",
          }}
        >
          <BrandGlyph />
        </span>
      </div>

      {/* Wordmark + tagline */}
      <div style={{ textAlign: "center" }} className="tw-splash-fade">
        <div
          style={{
            fontWeight: 800,
            letterSpacing: 4,
            fontSize: 26,
            color: "#1E2230",
            lineHeight: 1.1,
          }}
        >
          LARKWAVE
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: 14,
            color: "#6B7280",
            maxWidth: 360,
          }}
        >
          {tagline}
        </div>
      </div>

      {/* Slim shimmering loader bar */}
      <div className="tw-splash-bar">
        <span className="tw-splash-bar-fill" />
      </div>
    </div>
  );
}

const SPLASH_CSS = `
@keyframes tw-splash-pop {
  0% { transform: scale(0.8); opacity: 0; }
  60% { transform: scale(1.04); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes tw-splash-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
@keyframes tw-splash-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes tw-splash-slide {
  0% { transform: translateX(-120%); }
  100% { transform: translateX(420%); }
}
.tw-splash-mark {
  animation: tw-splash-pop 0.5s cubic-bezier(0.22, 1, 0.36, 1) both,
             tw-splash-float 2.6s ease-in-out 0.5s infinite;
}
.tw-splash-fade {
  animation: tw-splash-in 0.5s ease 0.12s both;
}
.tw-splash-bar {
  position: relative;
  width: 220px;
  max-width: 70vw;
  height: 4px;
  border-radius: 999px;
  background: rgba(108, 92, 231, 0.14);
  overflow: hidden;
  animation: tw-splash-in 0.5s ease 0.2s both;
}
.tw-splash-bar-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 28%;
  border-radius: 999px;
  background: linear-gradient(90deg, #6C5CE7 0%, #A66BFF 45%, #FF7AB6 75%, #4FB6FF 100%);
  animation: tw-splash-slide 1.15s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}
`;
