"use client";

import { AppstoreOutlined, ThunderboltOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Card,
  Empty,
  Grid,
  Skeleton,
  Space,
  Tag,
  Typography,
} from "antd";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@larkwave/ui";
import { api, type AppTemplate } from "@/lib/api";
import { TrackTag } from "@/components/StatusTags";
import TemplateThumb from "@/components/TemplateThumb";

const { Title, Paragraph, Text } = Typography;

const ALL = "Tất cả";

export default function TemplatesPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const { t: tr } = useI18n();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  const [templates, setTemplates] = useState<AppTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<string>(ALL);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.listTemplates();
        if (!cancelled) setTemplates(res);
      } catch (e) {
        if (!cancelled) message.error((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [message]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const t of templates) if (t.category) set.add(t.category);
    return [ALL, ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [templates]);

  const filtered = useMemo(
    () =>
      active === ALL
        ? templates
        : templates.filter((t) => t.category === active),
    [templates, active],
  );

  const applyTemplate = (t: AppTemplate) => {
    router.push(`/?prompt=${encodeURIComponent(t.prompt)}`);
  };

  return (
    <Space direction="vertical" size={isMobile ? 16 : 22} style={{ width: "100%" }}>
      <div>
        <Space align="center" size="middle">
          <span
            style={{
              display: "inline-flex",
              width: 38,
              height: 38,
              borderRadius: 10,
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(108,92,231,0.12)",
              border: "1px solid rgba(108,92,231,0.30)",
              color: "#6C5CE7",
              fontSize: 18,
            }}
          >
            <AppstoreOutlined />
          </span>
          <Title
            level={3}
            style={{ margin: 0, fontSize: isMobile ? 20 : undefined }}
          >
            {tr("build.templateLibrary", "Thư viện mẫu")}
          </Title>
        </Space>
        <Paragraph
          type="secondary"
          style={{ marginTop: 8, marginBottom: 0, maxWidth: 640 }}
        >
          {tr(
            "build.templatesIntro",
            "Bắt đầu nhanh từ một mẫu có sẵn. Nội dung mẫu được điền sẵn vào trình tạo app — bạn có thể tinh chỉnh trước khi tạo.",
          )}
        </Paragraph>
      </div>

      {/* Category filter chips */}
      {!loading && templates.length > 0 && (
        <Space wrap size={[8, 8]}>
          {categories.map((cat) => {
            const selected = cat === active;
            return (
              <Tag.CheckableTag
                key={cat}
                checked={selected}
                onChange={() => setActive(cat)}
                style={{
                  padding: isMobile ? "7px 14px" : "5px 14px",
                  fontSize: 13,
                  borderRadius: 999,
                  // Chip chưa chọn đọc token bề mặt: trước cứng `#FFFFFF` nên ở chế độ tối là
                  // một dãy chip trắng loá trên nền đen.
                  border: selected
                    ? "1px solid rgba(108,92,231,0.45)"
                    : "1px solid var(--tw-srf-line, #ECEDF3)",
                  background: selected ? "rgba(108,92,231,0.12)" : "var(--tw-srf-glass, #FFFFFF)",
                  color: selected ? "#6C5CE7" : "var(--tw-text-sub, #6B7280)",
                }}
              >
                {cat === ALL ? tr("build.templatesAll", "Tất cả") : cat}
              </Tag.CheckableTag>
            );
          })}
        </Space>
      )}

      {loading ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fill, minmax(min(100%, 290px), 1fr))",
            gap: isMobile ? 14 : 18,
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} styles={{ body: { padding: 0 } }}>
              <Skeleton.Node active style={{ width: "100%", height: 150 }}>
                <span />
              </Skeleton.Node>
              <div style={{ padding: isMobile ? 14 : 18 }}>
                <Skeleton active paragraph={{ rows: 2 }} />
              </div>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Empty description={tr("build.noTemplates", "Chưa có mẫu nào")} style={{ padding: "64px 0" }} />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fill, minmax(min(100%, 290px), 1fr))",
            gap: isMobile ? 14 : 18,
          }}
        >
          {filtered.map((t) => (
            <Card
              key={t.id}
              className="tw-lift"
              styles={{ body: { padding: 0 } }}
              style={{ overflow: "hidden", height: "100%" }}
            >
              {/* Generated preview thumbnail */}
              <TemplateThumb
                accent={t.accent || "#6C5CE7"}
                category={t.category}
                track={t.track}
              />
              <div
                style={{
                  padding: isMobile ? 14 : 18,
                  display: "flex",
                  flexDirection: "column",
                  gap: 9,
                }}
              >
                <Space size={6} wrap>
                  <Tag
                    bordered={false}
                    style={{
                      background: "rgba(108,92,231,0.08)",
                      color: "#5B4FC2",
                      borderRadius: 6,
                    }}
                  >
                    {t.category}
                  </Tag>
                  <TrackTag track={t.track} />
                </Space>
                <Title level={5} style={{ margin: 0 }}>
                  {t.title}
                </Title>
                <Text
                  type="secondary"
                  style={{
                    fontSize: 13.5,
                    lineHeight: 1.55,
                    minHeight: 42,
                  }}
                >
                  {t.description}
                </Text>
                <Button
                  type="primary"
                  icon={<ThunderboltOutlined />}
                  onClick={() => applyTemplate(t)}
                  block
                  size={isMobile ? "large" : "middle"}
                  style={{ marginTop: 2 }}
                >
                  {tr("build.useTemplate", "Dùng mẫu")}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Space>
  );
}
