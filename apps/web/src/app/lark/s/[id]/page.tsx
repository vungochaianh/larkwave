import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { API_BASE } from "@/lib/api";
import { LandingHeader, LandingFooter } from "@/components/LandingChrome";
// Reuse the desktop chat's markdown renderer so shared conversations render IDENTICALLY
// (GFM tables, code blocks, lists) instead of the blog renderer that lacks table support.
import { ChatMarkdown } from "@larkwave/ui";

const SITE = "https://toolswave.net";
const BRAND = "#6C5CE7";
const GRADIENT =
  "linear-gradient(135deg, #6C5CE7 0%, #A66BFF 45%, #FF7AB6 75%, #4FB6FF 100%)";

/** One rendered transcript item (opaque payload from the desktop). */
type ShareItem =
  | { kind: "msg"; role: "user" | "assistant"; text?: string; agent?: string; images?: { name?: string; dataUrl: string }[] }
  | { kind: "tool"; call?: { name?: string; title?: string; status?: string } };

interface Share {
  id: string;
  title: string;
  data: { items?: ShareItem[]; runner?: string; model?: string; createdAt?: string };
  author: { name: string; handle: string | null; avatarUrl: string | null } | null;
  views: number;
  createdAt: string;
}

async function fetchShare(id: string): Promise<Share | null> {
  try {
    const res = await fetch(`${API_BASE}/public/lark-shares/${encodeURIComponent(id)}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return (await res.json()) as Share;
  } catch {
    return null;
  }
}

function firstUserText(items: ShareItem[]): string {
  const m = items.find((it) => it.kind === "msg" && it.role === "user") as
    | Extract<ShareItem, { kind: "msg" }>
    | undefined;
  return (m?.text ?? "").trim();
}

function fmtDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const share = await fetchShare(id);
  if (!share) return { title: "Không tìm thấy hội thoại · Larkwave" };
  const items = share.data.items ?? [];
  const title = share.title?.trim() || firstUserText(items).slice(0, 80) || "Hội thoại Lark × Agents";
  const description =
    firstUserText(items).slice(0, 150) ||
    "Hội thoại Lark × Agents được chia sẻ công khai qua Larkwave.";
  const url = `${SITE}/lark/s/${share.id}`;
  return {
    metadataBase: new URL(SITE),
    title: `${title} · Lark × Agents`,
    description,
    alternates: { canonical: `/lark/s/${share.id}` },
    openGraph: {
      type: "article",
      url,
      siteName: "Larkwave",
      title,
      description,
      locale: "vi_VN",
    },
    twitter: { card: "summary", title, description },
  };
}

export default async function LarkSharePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const share = await fetchShare(id);
  if (!share) notFound();

  const items = share.data.items ?? [];
  const title = share.title?.trim() || firstUserText(items).slice(0, 80) || "Hội thoại Lark × Agents";
  const runner = share.data.runner || "claude";

  return (
    <main style={{ background: "#FFFFFF", color: "#1E2230", minHeight: "100vh" }}>
      <LandingHeader />

      <article style={{ maxWidth: 820, margin: "0 auto", padding: "clamp(24px,5vw,48px) clamp(16px,5vw,28px) 64px" }}>
        <Link href="/" style={{ color: BRAND, fontWeight: 600, fontSize: 14 }}>
          ← Larkwave
        </Link>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "18px 0 8px" }}>
          <span
            style={{
              padding: "4px 12px",
              borderRadius: 999,
              background: "rgba(108,92,231,0.10)",
              color: BRAND,
              fontSize: 12.5,
              fontWeight: 600,
            }}
          >
            💬 Lark × Agents
          </span>
          <span
            style={{
              padding: "4px 12px",
              borderRadius: 999,
              background: "rgba(22,185,141,0.12)",
              color: "#16B98D",
              fontSize: 12.5,
              fontWeight: 600,
            }}
          >
            {runner}
          </span>
        </div>

        <h1 style={{ fontSize: "clamp(24px,4vw,36px)", fontWeight: 800, lineHeight: 1.2, margin: "0 0 10px", letterSpacing: -0.4 }}>
          {title}
        </h1>
        <div style={{ color: "#9AA3B5", fontSize: 14, marginBottom: 28 }}>
          {share.author?.name ? `${share.author.name} · ` : ""}
          {fmtDate(share.data.createdAt || share.createdAt)}
          {share.views > 0 ? ` · ${share.views} lượt xem` : ""}
        </div>

        {items.length === 0 ? (
          <p style={{ color: "#6B7280" }}>Hội thoại này chưa có nội dung.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {items.map((it, i) => {
              if (it.kind === "tool") {
                const label = it.call?.title || it.call?.name || "công cụ";
                return (
                  <div
                    key={i}
                    style={{
                      alignSelf: "flex-start",
                      fontSize: 12.5,
                      color: "#7A7F8C",
                      background: "#F6F7FB",
                      border: "1px solid #ECEDF3",
                      borderRadius: 8,
                      padding: "6px 10px",
                    }}
                  >
                    🔧 {label}
                    {it.call?.status ? ` · ${it.call.status}` : ""}
                  </div>
                );
              }
              const isUser = it.role === "user";
              const images = it.images ?? [];
              // Drop the trailing "📎 file.png" marker line when we render the real images.
              let text = (it.text ?? "").trim();
              if (images.length) text = text.replace(/\n*📎[^\n]*$/, "").trim();
              if (!text && images.length === 0) return null;
              return (
                <div key={i} style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
                  <div
                    style={{
                      maxWidth: "88%",
                      borderRadius: 14,
                      padding: "10px 14px",
                      background: isUser ? GRADIENT : "#F6F7FB",
                      color: isUser ? "#fff" : "#1E2230",
                      border: isUser ? "none" : "1px solid #ECEDF3",
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.75, marginBottom: 4 }}>
                      {isUser ? "Người dùng" : it.agent || "Trợ lý"}
                    </div>
                    {text &&
                      (isUser ? (
                        <div style={{ whiteSpace: "pre-wrap", fontSize: 14.5, lineHeight: 1.55 }}>{text}</div>
                      ) : (
                        <ChatMarkdown content={text} />
                      ))}
                    {images.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: text ? 8 : 0 }}>
                        {images.map((img, ii) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={ii}
                            src={img.dataUrl}
                            alt={img.name || "ảnh"}
                            style={{
                              maxWidth: "100%",
                              maxHeight: 360,
                              borderRadius: 10,
                              border: isUser ? "1px solid rgba(255,255,255,0.35)" : "1px solid #ECEDF3",
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* End CTA */}
        <div
          style={{
            marginTop: 48,
            padding: "28px 26px",
            borderRadius: 18,
            background: GRADIENT,
            color: "#fff",
            textAlign: "center",
          }}
        >
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 8px" }}>Trò chuyện & tuỳ chỉnh dữ liệu Lark bằng AI</h2>
          <p style={{ opacity: 0.95, margin: "0 0 18px" }}>
            Kết nối Lark Base, tin nhắn, tài liệu — để AI trên máy bạn hỏi đáp và thao tác dữ liệu.
          </p>
          <Link
            href="/download"
            style={{
              display: "inline-block",
              padding: "12px 26px",
              background: "#fff",
              color: BRAND,
              borderRadius: 10,
              fontWeight: 700,
            }}
          >
            Tải Larkwave Desktop →
          </Link>
        </div>
      </article>

      <LandingFooter />
    </main>
  );
}
