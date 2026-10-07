import { ImageResponse } from "next/og";

export const alt = "Larkwave — Trợ lý AI làm việc thật trên Lark";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Ảnh chia sẻ mạng xã hội (1200×630).
 *
 * Sinh động bằng next/og thay vì một tệp .png tĩnh: chữ nằm trong mã nguồn nên đổi định vị là
 * ảnh đổi theo, không bao giờ còn cảnh thẻ meta nói một đằng còn thumbnail vẫn quảng cáo slogan
 * từ ba đợt trước. Dùng phông mặc định của next/og (đã có dấu tiếng Việt) nên không phải tải
 * asset nào.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "84px 96px",
          background:
            "linear-gradient(135deg, #6C5CE7 0%, #A66BFF 42%, #FF7AB6 72%, #4FB6FF 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        {/* Soft glow accents */}
        <div
          style={{
            position: "absolute",
            top: -160,
            right: -120,
            width: 520,
            height: 520,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.16)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -200,
            left: -140,
            width: 540,
            height: 540,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.10)",
            display: "flex",
          }}
        />

        {/* Logo mark + wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 28,
              background: "rgba(255,255,255,0.18)",
              border: "2px solid rgba(255,255,255,0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 18px 50px rgba(0,0,0,0.22)",
            }}
          >
            <BrandGlyphSvg size={60} color="#ffffff" />
          </div>
          <div
            style={{
              fontSize: 46,
              fontWeight: 800,
              letterSpacing: 6,
              display: "flex",
            }}
          >
            LARKWAVE
          </div>
        </div>

        {/* Headline */}
        <div
          style={{
            marginTop: 56,
            fontSize: 84,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: -1,
            display: "flex",
            maxWidth: 980,
          }}
        >
          Trợ lý AI làm việc thật trên Lark
        </div>

        {/* Subline */}
        <div
          style={{
            marginTop: 30,
            fontSize: 36,
            fontWeight: 500,
            color: "rgba(255,255,255,0.92)",
            display: "flex",
          }}
        >
          Bitable · Docs · Sheets · Wiki · Lịch
        </div>

        {/* Footer URL */}
        <div
          style={{
            marginTop: 54,
            fontSize: 28,
            fontWeight: 600,
            color: "rgba(255,255,255,0.85)",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          toolswave.net
        </div>
      </div>
    ),
    { ...size },
  );
}

/** Larkwave glyph (lark over wave) drawn as SVG so it renders without an icon font. */
function BrandGlyphSvg({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 12.2C10.6 8.4 8.4 5.6 6 5.6C4.4 5.6 3.2 6.8 2.2 8.8C3.8 8 5.1 7.8 6.2 8.1C8 8.6 9.6 10.4 10.7 13Q12 15.2 13.3 13C14.4 10.4 16 8.6 17.8 8.1C18.9 7.8 20.2 8 21.8 8.8C20.8 6.8 19.6 5.6 18 5.6C15.6 5.6 13.4 8.4 12 12.2Z" fill={color} />
      <path d="M3 19c1.5-2.2 3-2.2 4.5 0s3 2.2 4.5 0 3-2.2 4.5 0 3 2.2 4.5 0" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
    </svg>
  );
}
