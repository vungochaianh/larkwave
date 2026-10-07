import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/**
 * Branded app icon / favicon: a gradient rounded-square mark with the white
 * lark-over-wave glyph (same as apps/desktop/resources/icon.svg). Replaces the Next.js
 * default favicon.
 */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 15,
          background:
            "linear-gradient(135deg, #6C5CE7 0%, #A66BFF 45%, #FF7AB6 74%, #4FB6FF 100%)",
          boxShadow: "inset 0 2px 7px rgba(255,255,255,0.28)",
        }}
      >
        <svg width={44} height={44} viewBox="0 0 24 24">
          {/* Larkwave glyph: lark in flight above a wave */}
          <path d="M12 12.2C10.6 8.4 8.4 5.6 6 5.6C4.4 5.6 3.2 6.8 2.2 8.8C3.8 8 5.1 7.8 6.2 8.1C8 8.6 9.6 10.4 10.7 13Q12 15.2 13.3 13C14.4 10.4 16 8.6 17.8 8.1C18.9 7.8 20.2 8 21.8 8.8C20.8 6.8 19.6 5.6 18 5.6C15.6 5.6 13.4 8.4 12 12.2Z" fill="#ffffff" />
          <path d="M3 19c1.5-2.2 3-2.2 4.5 0s3 2.2 4.5 0 3-2.2 4.5 0 3 2.2 4.5 0" fill="none" stroke="#ffffff" strokeWidth={2.4} strokeLinecap="round" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
