"use client";

import { AppstoreOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Card,
  Empty,
  Input,
  Pagination,
  Skeleton,
  Space,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import type { App as AppEntity, Paginated } from "@larkwave/shared";
import { useI18n } from "@larkwave/ui";
import { api } from "@/lib/api";
import { CARD_SHADOW } from "@/lib/theme";
import { TrackTag } from "@/components/StatusTags";
import AppPreviewCard from "@/components/AppPreviewCard";

const { Title, Text } = Typography;

const GRID: CSSProperties = {
  display: "grid",
  // min() guard so a card never forces the min track wider than the viewport
  // (which would push horizontal page scroll on ~320–360px phones).
  gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 100%), 1fr))",
  gap: 18,
};

export default function AppsPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const { t } = useI18n();
  const [data, setData] = useState<Paginated<AppEntity> | null>(null);
  const [shared, setShared] = useState<AppEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  // Bộ lọc theo loại app đã bỏ: web chỉ tạo website nên năm tab kia lọc ra danh sách rỗng cho
  // gần như mọi người. App cũ thuộc loại khác vẫn nằm trong danh sách và vẫn có nhãn loại riêng
  // trên từng thẻ, nên không mất đường nhận ra chúng.
  //
  // `?track=` vẫn được tôn trọng để link cũ không gãy.
  const [trackF] = useState<string | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    const tr = new URLSearchParams(window.location.search).get("track");
    return tr && ["web", "mobile", "desktop", "game", "extension"].includes(tr) ? tr : undefined;
  });

  const load = useCallback(
    async (p = page, search = q, track = trackF) => {
      setLoading(true);
      try {
        const res = await api.listApps({ page: p, pageSize: 15, q: search, ...(track ? { track } : {}) });
        setData(res);
      } catch (e) {
        message.error((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [page, q, trackF, message],
  );

  useEffect(() => {
    void load(1, "", trackF);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the "shared with me" list. On a FAILED fetch (most importantly the
  // ~30–60s the API restarts during a deploy) DON'T collapse to [] — that would
  // hide the section for a real customer mid-deploy. Keep the last-known-good
  // list on screen and retry with backoff until the API answers; the section
  // only hides when the server actually returns zero shared apps.
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const delays = [1500, 3000, 6000, 10000]; // backoff while the API is down (deploy)
    let attempt = 0;

    const loadShared = () => {
      api
        .sharedApps()
        .then((res) => {
          if (active) setShared(res);
        })
        .catch(() => {
          if (!active) return;
          if (attempt < delays.length) {
            timer = setTimeout(loadShared, delays[attempt]);
            attempt += 1;
          }
        });
    };
    loadShared();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Optimistically drop a deleted app, then refresh counts from the server.
  const handleDeleted = (id: string) => {
    setData((d) =>
      d ? { ...d, items: d.items.filter((a) => a.id !== id), total: Math.max(0, d.total - 1) } : d,
    );
    void load(page, q);
  };

  const items = data?.items ?? [];

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <Space align="center">
          <AppstoreOutlined style={{ fontSize: 22, color: "#6C5CE7" }} />
          <Title level={3} style={{ margin: 0 }}>
            {t("build.myApps", "Website của tôi")}
          </Title>
        </Space>
        <Space wrap>
          <Input.Search
            placeholder={t("build.searchByName", "Tìm theo tên…")}
            allowClear
            style={{ width: 240, maxWidth: "100%" }}
            // Suppress browser/OS password autofill on this search field.
            name="tw-app-search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-1p-ignore=""
            data-lpignore="true"
            data-form-type="other"
            onSearch={(v) => {
              setQ(v);
              setPage(1);
              void load(1, v);
            }}
          />
          <Tooltip title={t("build.reload", "Tải lại")}>
            <Button icon={<ReloadOutlined />} onClick={() => load(page, q)} />
          </Tooltip>
          <Button type="primary" onClick={() => router.push("/")}>
            {t("build.createNew", "Tạo app mới")}
          </Button>
        </Space>
      </div>

      {shared.length > 0 && (
        <div>
          <Text strong style={{ display: "block", marginBottom: 10 }}>
            {t("build.sharedWithMe", "Được chia sẻ với tôi")}
          </Text>
          <div style={GRID}>
            {shared.map((a) => (
              <Card
                key={a.id}
                size="small"
                hoverable
                onClick={() => router.push(`/apps/${a.id}`)}
                style={{ cursor: "pointer", boxShadow: CARD_SHADOW }}
              >
                <Space direction="vertical" size={6} style={{ width: "100%" }}>
                  <Space style={{ justifyContent: "space-between", width: "100%" }}>
                    <Text strong ellipsis style={{ maxWidth: 150 }}>
                      {a.name}
                    </Text>
                    <Tag color={a.role === "viewer" ? "default" : "blue"} bordered={false}>
                      {a.role === "viewer"
                        ? t("build.roleViewer", "Chỉ xem")
                        : t("build.roleEditor", "Chỉnh sửa")}
                    </Tag>
                  </Space>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      minWidth: 0,
                      width: "100%",
                    }}
                  >
                    <TrackTag track={a.track} />
                    {/* ellipsis + minWidth:0 so a long owner email can't push the
                        card past the grid track → horizontal page scroll on phones. */}
                    <Text
                      type="secondary"
                      ellipsis
                      style={{ fontSize: 12, minWidth: 0, flex: 1 }}
                    >
                      {t("build.by", "bởi")} {a.owner?.name || a.owner?.email || "—"}
                    </Text>
                  </div>
                </Space>
              </Card>
            ))}
          </div>
        </div>
      )}

      {loading && items.length === 0 ? (
        <div style={GRID}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} style={{ boxShadow: CARD_SHADOW, borderRadius: 16 }}>
              <Skeleton.Image active style={{ width: "100%", height: 120 }} />
              <Skeleton active paragraph={{ rows: 1 }} style={{ marginTop: 12 }} />
            </Card>
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card style={{ boxShadow: CARD_SHADOW }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t("build.noApps", "Chưa có app nào. Hãy tạo app đầu tiên!")}
          >
            <Button type="primary" onClick={() => router.push("/")}>
              {t("build.createNew", "Tạo app mới")}
            </Button>
          </Empty>
        </Card>
      ) : (
        <>
          <div style={GRID}>
            {items.map((a) => (
              <AppPreviewCard key={a.id} app={a} onDeleted={handleDeleted} />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
            <Pagination
              current={data?.page ?? 1}
              pageSize={data?.pageSize ?? 15}
              total={data?.total ?? 0}
              showSizeChanger={false}
              hideOnSinglePage
              onChange={(p) => {
                setPage(p);
                void load(p, q);
              }}
            />
          </div>
        </>
      )}
    </Space>
  );
}
