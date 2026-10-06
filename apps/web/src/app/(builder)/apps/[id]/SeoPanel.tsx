"use client";

import {
  CheckCircleFilled,
  CloseCircleFilled,
  RocketOutlined,
} from "@ant-design/icons";
import { App as AntApp, Button, Card, Input, Switch, Typography } from "antd";
import { useState, type ReactNode } from "react";
import type { App as AppEntity, AppSeo } from "@larkwave/shared";
import { useI18n } from "@larkwave/ui";
import { api } from "@/lib/api";
import { CARD_SHADOW } from "@/lib/theme";

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

/** One on/off feature row (icon · title · description · switch) — Base44-style. */
function ToggleRow({
  title,
  desc,
  checked,
  onChange,
}: {
  title: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
        padding: "14px 16px",
        border: "1px solid #ECEDF3",
        borderRadius: 12,
        background: "#fff",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <Text strong style={{ fontSize: 13.5 }}>
          {title}
        </Text>
        <Text type="secondary" style={{ fontSize: 12.5, display: "block", lineHeight: 1.5 }}>
          {desc}
        </Text>
      </div>
      <Switch checked={checked} onChange={onChange} />
    </div>
  );
}

export default function SeoPanel({
  app,
  onChanged,
}: {
  app: AppEntity;
  onChanged?: () => void;
}) {
  const { message } = AntApp.useApp();
  const { t } = useI18n();
  const seo0: AppSeo = app.seo ?? {};
  const [enabled, setEnabled] = useState(seo0.enabled !== false);
  const [title, setTitle] = useState(seo0.title ?? "");
  const [description, setDescription] = useState(seo0.description ?? "");
  const [keywords, setKeywords] = useState(seo0.keywords ?? "");
  const [ogImage, setOgImage] = useState(seo0.ogImage ?? "");
  const [index, setIndex] = useState(seo0.index !== false);
  const [sitemap, setSitemap] = useState(seo0.sitemap !== false);
  const [robots, setRobots] = useState(seo0.robots !== false);
  const [aiDiscovery, setAiDiscovery] = useState(seo0.aiDiscovery !== false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.updateAppSeo(app.id, {
        enabled,
        title: title.trim(),
        description: description.trim(),
        keywords: keywords.trim(),
        ogImage: ogImage.trim(),
        index,
        sitemap,
        robots,
        aiDiscovery,
      });
      message.success(t("build.seoSaved", "Đã lưu cấu hình SEO. Bấm “Triển khai lại” để áp dụng lên trang đã deploy."));
      onChanged?.();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Live SEO checklist (the "scan"), computed from the effective config.
  const effTitle = (title || app.name || "").trim();
  const effDesc = (description || app.description || "").trim();
  const checks: { ok: boolean; label: string }[] = [
    { ok: effTitle.length >= 10 && effTitle.length <= 60, label: `${t("build.seoCheckTitle", "Tiêu đề")} ${effTitle.length} ${t("build.seoChars", "ký tự")} (${t("build.seoBest", "tốt nhất")} 10–60)` },
    { ok: effDesc.length >= 50 && effDesc.length <= 160, label: `${t("build.seoCheckDesc", "Mô tả")} ${effDesc.length} ${t("build.seoChars", "ký tự")} (${t("build.seoBest", "tốt nhất")} 50–160)` },
    { ok: !!ogImage.trim(), label: t("build.seoCheckOg", "Ảnh chia sẻ mạng xã hội (OG image)") },
    { ok: index, label: t("build.seoCheckIndex", "Cho phép công cụ tìm kiếm lập chỉ mục") },
    { ok: sitemap, label: t("build.seoCheckSitemap", "Tạo sitemap.xml") },
    { ok: robots, label: t("build.seoCheckRobots", "Tạo robots.txt") },
    { ok: aiDiscovery, label: t("build.seoCheckAi", "AI Assistant Discovery (JSON-LD)") },
  ];
  const passed = checks.filter((c) => c.ok).length;

  const field = (label: string, node: ReactNode, hint?: string) => (
    <div>
      <Text strong style={{ fontSize: 13, display: "block", marginBottom: 6 }}>
        {label}
      </Text>
      {node}
      {hint && (
        <Text type="secondary" style={{ fontSize: 11.5, display: "block", marginTop: 4 }}>
          {hint}
        </Text>
      )}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%", maxWidth: 1040, margin: "0 auto" }}>
      <Paragraph type="secondary" style={{ margin: 0 }}>
        {t(
          "build.seoIntro",
          "Cải thiện cách app xuất hiện trên kết quả tìm kiếm và câu trả lời của AI. Lưu cấu hình rồi bấm “Triển khai lại” để áp dụng vào trang đã deploy.",
        )}
      </Paragraph>

      {/* Master toggle */}
      <Card style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }} styles={{ body: { padding: 16 } }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <Text strong>{t("build.enableSeo", "Bật SEO cho app này")}</Text>
            <Text type="secondary" style={{ fontSize: 12.5, display: "block" }}>
              {t("build.enableSeoDesc", "Chèn thẻ meta/Open Graph + sitemap/robots khi deploy.")}
            </Text>
          </div>
          <Switch checked={enabled} onChange={setEnabled} />
        </div>
      </Card>

      {/* Scan / checklist */}
      <Card style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }} styles={{ body: { padding: 16 } }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <Text strong>{t("build.seoCheck", "Kiểm tra SEO")} · {passed}/{checks.length} {t("build.seoPassed", "đạt")}</Text>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {checks.map((c) => (
            <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {c.ok ? (
                <CheckCircleFilled style={{ color: "#16B98D" }} />
              ) : (
                <CloseCircleFilled style={{ color: "#D0D5DD" }} />
              )}
              <Text style={{ fontSize: 13, color: c.ok ? "#1E2230" : "#6B7280" }}>{c.label}</Text>
            </div>
          ))}
        </div>
      </Card>

      {/* Meta tags */}
      <Card
        title={t("build.metaTags", "Thẻ Meta")}
        style={{ boxShadow: CARD_SHADOW, borderRadius: 14, opacity: enabled ? 1 : 0.55 }}
        styles={{ body: { padding: 16, display: "flex", flexDirection: "column", gap: 14 } }}
      >
        {field(
          t("build.seoTitleField", "Tiêu đề trang (title)"),
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={app.name}
            maxLength={70}
            disabled={!enabled}
          />,
          t("build.seoTitleHint", "Hiển thị trên tab trình duyệt + kết quả tìm kiếm. Bỏ trống = dùng tên app."),
        )}
        {field(
          t("build.seoDescField", "Mô tả (meta description)"),
          <TextArea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={app.description || t("build.seoDescPlaceholder", "Mô tả ngắn gọn về app…")}
            autoSize={{ minRows: 2, maxRows: 4 }}
            maxLength={200}
            disabled={!enabled}
          />,
          t("build.seoDescHint", "Đoạn tóm tắt dưới tiêu đề trên Google."),
        )}
        {field(
          t("build.seoKeywordsField", "Từ khoá (keywords)"),
          <Input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder={t("build.seoKeywordsPlaceholder", "vd: quản lý kho, wms, tồn kho")}
            disabled={!enabled}
          />,
          t("build.seoKeywordsHint", "Ngăn cách bằng dấu phẩy."),
        )}
        {field(
          t("build.seoOgField", "Ảnh chia sẻ (OG image URL)"),
          <Input
            value={ogImage}
            onChange={(e) => setOgImage(e.target.value)}
            placeholder="https://…/cover.png"
            disabled={!enabled}
          />,
          t("build.seoOgHint", "Ảnh hiện khi chia sẻ link lên Facebook/Zalo/Twitter."),
        )}
      </Card>

      {/* Feature toggles (Base44-style) */}
      <Card
        title={t("build.autoGenerate", "Tự động tạo")}
        style={{ boxShadow: CARD_SHADOW, borderRadius: 14, opacity: enabled ? 1 : 0.55 }}
        styles={{ body: { padding: 16, display: "flex", flexDirection: "column", gap: 10 } }}
      >
        <ToggleRow
          title={t("build.seoIndexTitle", "Cho phép lập chỉ mục")}
          desc={t("build.seoIndexDesc", "Cho phép Google và các công cụ tìm kiếm hiển thị app. Tắt = noindex.")}
          checked={index}
          onChange={setIndex}
        />
        <ToggleRow
          title={t("build.seoAiTitle", "AI Assistant Discovery")}
          desc={t("build.seoAiDesc", "Chèn JSON-LD giúp các trợ lý AI hiểu và gợi ý app của bạn.")}
          checked={aiDiscovery}
          onChange={setAiDiscovery}
        />
        <ToggleRow
          title={t("build.seoRobotsTitle", "Tạo robots.txt")}
          desc={t("build.seoRobotsDesc", "Hướng dẫn bot tìm kiếm được/không được thu thập trang.")}
          checked={robots}
          onChange={setRobots}
        />
        <ToggleRow
          title={t("build.seoSitemapTitle", "Tạo sitemap.xml")}
          desc={t("build.seoSitemapDesc", "Liệt kê trang cho công cụ tìm kiếm lập chỉ mục nhanh hơn.")}
          checked={sitemap}
          onChange={setSitemap}
        />
      </Card>

      <div style={{ display: "flex", gap: 10 }}>
        <Button type="primary" icon={<RocketOutlined />} loading={saving} onClick={save}>
          {t("build.saveSeo", "Lưu cấu hình SEO")}
        </Button>
      </div>
    </div>
  );
}
