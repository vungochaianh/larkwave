import { ImageResponse } from "next/og";
import { API_BASE } from "@/lib/api";

export const alt = "App công khai · Larkwave";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const TRACK_LABEL: Record<string, string> = {
  web: "Web App",
  mobile: "Mobile App",
  extension: "Extension",
};

/** Per-app branded social card (1200×630). Next wires this to og:image. */
export default async function AppOgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let name = "Ứng dụng";
  let author = "";
  let track = "web";
  try {
    const res = await fetch(`${API_BASE}/public/apps/${slug}`, { next: { revalidate: 300 } });
    if (res.ok) {
      const app = (await res.json()) as { name?: string; author?: string; track?: string };
      name = app.name || name;
      author = app.author || "";
      track = app.track || "web";
    }
  } catch {
    /* fall back to defaults */
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "82px 92px",
          background:
            "linear-gradient(135deg, #6C5CE7 0%, #A66BFF 42%, #FF7AB6 72%, #4FB6FF 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="#fff">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700, opacity: 0.96 }}>Larkwave</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 30, opacity: 0.9, marginBottom: 14 }}>
            {TRACK_LABEL[track] ?? "App"}
          </div>
          <div style={{ display: "flex", fontSize: 78, fontWeight: 800, lineHeight: 1.04 }}>
            {name.slice(0, 56)}
          </div>
          {author ? (
            <div style={{ display: "flex", fontSize: 32, opacity: 0.92, marginTop: 16 }}>bởi {author}</div>
          ) : null}
        </div>
        <div style={{ display: "flex", fontSize: 26, opacity: 0.9 }}>
          Tạo & deploy bằng Larkwave · toolswave.net
        </div>
      </div>
    ),
    size,
  );
}
