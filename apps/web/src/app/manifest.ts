import type { MetadataRoute } from "next";

/**
 * Web app manifest so Larkwave installs cleanly on a phone home screen
 * (the "Máy của tôi" agent flow is phone-first). Icons reuse existing assets:
 * the generated gradient bolt icon (`/icon`) and the static OG image — no new
 * image files are invented.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Larkwave",
    short_name: "Larkwave",
    description:
      "Trợ lý AI làm việc trong Lark — Bitable, Docs, Sheets, Wiki, Drive, Lịch và tin nhắn.",
    start_url: "/",
    display: "standalone",
    background_color: "#F4F5FB",
    theme_color: "#6C5CE7",
    lang: "vi",
    icons: [
      {
        src: "/icon",
        sizes: "64x64",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/og.png",
        sizes: "1200x630",
        type: "image/png",
      },
    ],
  };
}
