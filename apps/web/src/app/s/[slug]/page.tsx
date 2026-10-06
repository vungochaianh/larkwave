"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Empty, Skeleton, Typography } from "antd";
import { ChatMarkdown, useI18n } from "@larkwave/ui";
import type { PublicChatConv } from "@larkwave/shared";
import { api } from "@/lib/api";
import ForceLight from "@/components/ForceLight";
import { LandingHeader, LandingFooter } from "@/components/LandingChrome";

const { Title, Text } = Typography;
const BRAND = "#6C5CE7";

/** PUBLIC, read-only transcript of a shared "Trợ lý AI" conversation (/s/<slug>). */
export default function PublicConversationPage() {
  // Trang này chạy HOÀN TOÀN ở trình duyệt (dữ liệu lấy trong useEffect) nên `useI18n()` là đúng:
  // không có pha dựng ở máy chủ nào để context trả nhầm 'vi'. Trước đây năm chuỗi ở đây viết cứng
  // tiếng Việt — trên một trang CÔNG KHAI, tức người nhận liên kết chia sẻ thấy đầu tiên.
  const { t, locale } = useI18n();
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;
  const [conv, setConv] = useState<PublicChatConv | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    api
      .getPublicChatConv(slug)
      .then(setConv)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  return (
    <ForceLight>
      <LandingHeader lang={locale} />
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "28px 16px 64px" }}>
        {loading ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : notFound || !conv ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <Empty description={t("share.gone", "Liên kết không tồn tại hoặc đã được gỡ.")} />
            <Link href="/" style={{ color: BRAND, fontWeight: 600 }}>{t("share.backHome", "← Về Larkwave")}</Link>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 20 }}>
              <Title level={3} style={{ margin: 0, color: "#1E2230" }}>{conv.title}</Title>
              <Text type="secondary" style={{ fontSize: 13 }}>
                {t("share.by", "Chia sẻ bởi")} {conv.author} ·{" "}
                {new Date(conv.updatedAt).toLocaleDateString(locale === "vi" ? "vi-VN" : "en-GB")} ·{" "}
                {t("share.readOnly", "chỉ đọc")}
              </Text>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              {conv.messages.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} style={{ alignSelf: "flex-end", maxWidth: "88%" }}>
                    <div style={{ background: BRAND, color: "#fff", padding: "10px 15px", borderRadius: 18, borderTopRightRadius: 6, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 14.5, lineHeight: 1.55 }}>
                      {m.text}
                    </div>
                  </div>
                ) : (
                  <div key={i} style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
                    <span style={{ display: "inline-flex", width: 28, height: 28, minWidth: 28, borderRadius: 9, alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, background: `linear-gradient(135deg, ${BRAND}, #8B7CF0)` }}>✳</span>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 14.5, lineHeight: 1.62, color: "#1E2230" }}>
                      <ChatMarkdown content={m.text} />
                    </div>
                  </div>
                ),
              )}
            </div>

            <div style={{ marginTop: 40, textAlign: "center", borderTop: "1px solid #ECEDF3", paddingTop: 24 }}>
              <Text type="secondary" style={{ fontSize: 13 }}>{t("share.cta", "Tạo trợ lý AI của riêng bạn — miễn phí trên")} </Text>
              <Link href="/" style={{ color: BRAND, fontWeight: 700 }}>Larkwave</Link>
            </div>
          </>
        )}
      </div>
      <LandingFooter lang={locale} />
    </ForceLight>
  );
}
