"use client";

import {
  CheckOutlined,
  EyeOutlined,
  LinkOutlined,
  ShareAltOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { Button, Result, Skeleton, Tag, Typography } from "antd";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { PublicApp } from "@larkwave/shared";
import { chuDau } from "@/lib/chuDau";
import { useI18n } from "@larkwave/ui";
import { api } from "@/lib/api";
import { fromNow } from "@/lib/format";
import { BRAND_GRADIENT, CARD_SHADOW } from "@/lib/theme";
import PublicTopbar from "@/components/PublicTopbar";

const { Title, Text, Paragraph } = Typography;

const TRACK_LABEL: Record<string, string> = {
  web: "Website",
  mobile: "Mobile",
  extension: "Extension",
};
const TRACK_COLOR: Record<string, string> = {
  web: "blue",
  mobile: "green",
  extension: "purple",
};

export default function PublicAppPage() {
  const { t } = useI18n();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const router = useRouter();
  const [app, setApp] = useState<PublicApp | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [remixing, setRemixing] = useState(false);

  // Fork this app into the current user's account (clone latest build → editable),
  // then open the workspace. Not logged in → send to login and back.
  const remix = async () => {
    setRemixing(true);
    try {
      const res = await api.remixApp(slug);
      router.push(`/apps/${res.appId}?build=${res.buildId}`);
    } catch (e) {
      const msg = (e as Error).message || "";
      if (/401|unauth|đăng nhập|chưa đăng/i.test(msg)) {
        router.push(`/login?next=${encodeURIComponent(`/app/${slug}`)}`);
      } else {
        setRemixing(false);
        window.alert(t("web.pubc.remixFail", "Không remix được: {msg}", { msg }));
      }
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const a = await api.publicApp(slug);
        if (!alive) return;
        setApp(a);
        // Count one visit per browser session per app.
        const key = `tw_visited_${slug}`;
        if (typeof window !== "undefined" && !sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, "1");
          api
            .visitPublicApp(slug)
            .then((r) => alive && setApp((cur) => (cur ? { ...cur, visits: r.visits } : cur)))
            .catch(() => undefined);
        }
      } catch {
        if (alive) setNotFound(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug]);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard API is unavailable on insecure (http) contexts / some in-app
      // browsers — don't fail silently; show the URL so the user can copy it.
      window.prompt(t("web.pubc.copyLink", "Sao chép liên kết:"), window.location.href);
    }
  };

  if (notFound) {
    return (
      <div style={{ minHeight: "100vh", background: "#F7F8FC" }}>
        <PublicTopbar />
        <Result
          status="404"
          title={t("web.pubc.appNotFound", "Không tìm thấy app")}
          subTitle={t("web.pubc.appNotFoundSub", "App này không tồn tại hoặc chưa được công khai.")}
          extra={
            <Link href="/explore">
              <Button type="primary">{t("web.pubc.exploreOther", "Khám phá app khác")}</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F7F8FC" }}>
      <PublicTopbar />
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "28px 20px 56px" }}>
        {loading || !app ? (
          <Skeleton active avatar paragraph={{ rows: 5 }} />
        ) : (
          <>
            {/* Header */}
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
              <span
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 16,
                  background: BRAND_GRADIENT,
                  color: "#fff",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: 26,
                  flexShrink: 0,
                }}
              >
                {chuDau(app.name) || "A"}
              </span>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  {/*
                    level={1} chứ không phải 3: tên app LÀ đề mục chính của trang này, nhưng trước
                    đây nó ra thẻ h3, nên cả trang không có h1 nào — bộ soi bắt đúng ở cả khung
                    điện thoại lẫn máy tính. Cỡ chữ giữ nguyên 24px bằng style, nên nhìn không đổi
                    gì; chỉ có cấp đề mục là đúng lại.
                  */}
                  <Title level={1} style={{ margin: 0, fontSize: 24, lineHeight: 1.35 }}>
                    {app.name}
                  </Title>
                  <Tag color={TRACK_COLOR[app.track] ?? "default"} bordered={false}>
                    {TRACK_LABEL[app.track] ?? app.track}
                  </Tag>
                </div>
                <Text type="secondary">
                  {t("web.pubc.byWord", "bởi")}{" "}
                  {app.authorHandle ? (
                    <Link href={`/u/${app.authorHandle}`}>
                      <Text strong style={{ color: "#6C5CE7" }}>
                        {app.author}
                      </Text>
                    </Link>
                  ) : (
                    <Text strong>{app.author}</Text>
                  )}{" "}
                  · <EyeOutlined style={{ marginInlineStart: 2 }} /> {t("web.pubc.views", "{n} lượt xem", { n: app.visits })} ·{" "}
                  {t("web.pubc.updated", "cập nhật")} {fromNow(app.updatedAt)}
                </Text>
                <Paragraph style={{ margin: "12px 0 0", maxWidth: 640 }}>
                  {app.description || t("web.pubc.appDescFallback", "Một app được tạo bằng Larkwave.")}
                </Paragraph>
                <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                  {app.url && (
                    <Button
                      type="primary"
                      size="large"
                      icon={<LinkOutlined />}
                      href={app.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("web.pubc.openApp", "Mở app")}
                    </Button>
                  )}
                  <Button
                    size="large"
                    icon={<ThunderboltOutlined />}
                    loading={remixing}
                    onClick={() => void remix()}
                  >
                    {t("web.pubc.remixThis", "Remix app này")}
                  </Button>
                  <Button
                    size="large"
                    icon={copied ? <CheckOutlined /> : <ShareAltOutlined />}
                    onClick={() => void share()}
                  >
                    {copied ? t("web.pubc.copied", "Đã sao chép") : t("web.pubc.share", "Chia sẻ")}
                  </Button>
                </div>
              </div>
            </div>

            {/* Live preview (deployed apps are public + embeddable) */}
            {app.url ? (
              <div
                style={{
                  marginTop: 26,
                  borderRadius: 14,
                  overflow: "hidden",
                  boxShadow: CARD_SHADOW,
                  border: "1px solid #E7E9F2",
                  background: "#fff",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 12px",
                    borderBottom: "1px solid #EEF0F6",
                    background: "#FAFBFE",
                  }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#FF5F57" }} />
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#FEBC2E" }} />
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#28C840" }} />
                  <Text type="secondary" style={{ marginInlineStart: 8, fontSize: 12 }} ellipsis>
                    {app.url}
                  </Text>
                </div>
                <iframe
                  src={app.url}
                  title={app.name}
                  loading="lazy"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  style={{ width: "100%", height: 560, border: "none", display: "block" }}
                />
              </div>
            ) : (
              <div
                style={{
                  marginTop: 26,
                  padding: "40px 0",
                  textAlign: "center",
                  borderRadius: 14,
                  border: "1px dashed #D7DCE7",
                  color: "#9AA3B5",
                }}
              >
                {t("web.pubc.noLive", "App chưa có bản chạy trực tuyến.")}
              </div>
            )}

            {/* CTA */}
            <div
              style={{
                marginTop: 26,
                padding: "22px 24px",
                borderRadius: 14,
                background: BRAND_GRADIENT,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{t("web.pubc.wantBuildTitle", "Muốn tự dựng app như thế này?")}</div>
                <div style={{ opacity: 0.92, marginTop: 2 }}>
                  {t("web.pubc.wantBuildSub", "Mô tả ý tưởng — Larkwave sinh code, build và deploy chỉ trong vài phút.")}
                </div>
              </div>
              <Link href="/">
                <Button size="large" icon={<ThunderboltOutlined />}>
                  {t("web.pubc.startFree", "Bắt đầu miễn phí")}
                </Button>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
