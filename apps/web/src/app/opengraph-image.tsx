import { ImageResponse } from "next/og";

export const alt = "Larkwave — Trợ lý AI biết làm việc thật";
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
            <BoltSvg size={56} color="#ffffff" />
          </div>
          <div
            style={{
              fontSize: 46,
              fontWeight: 800,
              letterSpacing: 6,
              display: "flex",
            }}
          >
            TOOLSWAVE
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
          Trợ lý AI biết làm việc thật
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
          Tạo app · Nội dung · Lark · API
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

/** Lightning bolt drawn as SVG so it renders without an icon font. */
function BoltSvg({ size, color }: { size: number; color: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M13 2L4.5 13.5H11l-1 8.5L19.5 10H13l0-8z" />
    </svg>
  );
}
