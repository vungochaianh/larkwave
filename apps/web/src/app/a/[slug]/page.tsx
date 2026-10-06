"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useI18n } from "@larkwave/ui";
import { api, type PublicArtifact } from "@/lib/api";
import { ArtifactView } from "@/components/ArtifactView";

export default function PublicArtifactPage() {
  const { t } = useI18n();
  const params = useParams();
  const slug = String((params as { slug?: string })?.slug ?? "");
  const [art, setArt] = useState<PublicArtifact | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    let active = true;
    api
      .getPublicArtifact(slug)
      .then((a) => active && setArt(a))
      .catch((e) => active && setErr((e as Error).message || "Không tìm thấy"));
    return () => {
      active = false;
    };
  }, [slug]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#0f1117" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 20px",
          borderBottom: "1px solid rgba(255,255,255,.08)",
          color: "#fff",
        }}
      >
        <Link href="/" style={{ color: "#fff", fontWeight: 700, textDecoration: "none" }}>
          Larkwave
        </Link>
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#c9cede" }}>
          {art?.title ?? ""}
        </span>
        <Link
          href="/register"
          style={{
            padding: "7px 14px",
            background: "linear-gradient(135deg,#6c5ce7,#a66bff)",
            color: "#fff",
            borderRadius: 9,
            fontWeight: 600,
            fontSize: 13,
            textDecoration: "none",
          }}
        >
          {t("web.pubc.createWithAi", "Tạo app bằng AI")}
        </Link>
      </header>

      <main style={{ flex: 1, display: "flex", flexDirection: "column", padding: art ? 0 : 40 }}>
        {err ? (
          <div style={{ margin: "auto", textAlign: "center", color: "#c9cede" }}>
            <div style={{ fontSize: 42, marginBottom: 8 }}>🔒</div>
            <div style={{ fontSize: 16 }}>{t("web.pubc.artifactNotFound", "Artifact này không tồn tại hoặc không được chia sẻ công khai.")}</div>
          </div>
        ) : !art ? (
          <div style={{ margin: "auto", color: "#8b93a7" }}>{t("web.pubc.loading", "Đang tải…")}</div>
        ) : art.kind === "html" || art.kind === "svg" ? (
          // Full-bleed sandboxed render for interactive HTML/SVG.
          <iframe
            title={art.title}
            srcDoc={art.content}
            sandbox="allow-scripts allow-forms allow-popups allow-modals"
            style={{ flex: 1, width: "100%", border: "none", background: "#fff" }}
          />
        ) : (
          <div style={{ maxWidth: 900, margin: "0 auto", padding: 24, width: "100%" }}>
            <div style={{ background: "#fff", borderRadius: 12, padding: 20 }}>
              <ArtifactView kind={art.kind} content={art.content} height="auto" />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
