import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/**
 * Branded app icon / favicon: a gradient rounded-square mark with a bold white
 * lightning bolt (Larkwave = build apps in a flash). Replaces the Next.js
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
        <svg width={40} height={40} viewBox="0 0 24 24" fill="#ffffff">
          {/* Heroicons solid "bolt" — clean, bold, premium */}
          <path d="M14.615 1.595a.75.75 0 0 1 .359.852L12.982 9.75h7.268a.75.75 0 0 1 .548 1.262l-10.5 11.25a.75.75 0 0 1-1.272-.71l1.992-7.302H3.75a.75.75 0 0 1-.548-1.262l10.5-11.25a.75.75 0 0 1 .913-.143Z" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
