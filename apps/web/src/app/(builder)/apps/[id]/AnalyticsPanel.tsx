"use client";

import { GlobalOutlined, MobileOutlined } from "@ant-design/icons";
import { App as AntApp, Card, Empty, Segmented, Skeleton, Tooltip, Typography } from "antd";
import { useCallback, useEffect, useState } from "react";
import type { AppAnalytics } from "@larkwave/shared";
import { useI18n } from "@larkwave/ui";
import { api } from "@/lib/api";
import { CARD_SHADOW } from "@/lib/theme";

const { Text, Paragraph } = Typography;

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <Card style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }} styles={{ body: { padding: 16 } }}>
      <Text type="secondary" style={{ fontSize: 12.5 }}>
        {label}
      </Text>
      <div style={{ fontSize: 26, fontWeight: 700, color: color ?? "#1E2230", marginTop: 2 }}>
        {value}
      </div>
    </Card>
  );
}

export default function AnalyticsPanel({ appId }: { appId: string }) {
  const { message } = AntApp.useApp();
  const { t } = useI18n();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AppAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (d: number) => {
      setLoading(true);
      try {
        setData(await api.getAppAnalytics(appId, d));
      } catch (e) {
        message.error((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [appId, message],
  );

  useEffect(() => {
    void load(days);
  }, [load, days]);

  const maxCount = data ? Math.max(1, ...data.days.map((d) => d.count)) : 1;
  const deviceTotal = data ? data.devices.mobile + data.devices.desktop : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%", maxWidth: 1180, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Paragraph type="secondary" style={{ margin: 0 }}>
          {t(
            "build.analyticsIntro",
            "Lượt xem của app đã deploy (gửi từ trang công khai). Dữ liệu xuất hiện sau khi app được truy cập.",
          )}
        </Paragraph>
        <Segmented
          value={days}
          onChange={(v) => setDays(v as number)}
          options={[
            { label: t("build.days7", "7 ngày"), value: 7 },
            { label: t("build.days30", "30 ngày"), value: 30 },
            { label: t("build.days90", "90 ngày"), value: 90 },
          ]}
        />
      </div>

      {loading ? (
        <Card style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }}>
          <Skeleton active paragraph={{ rows: 5 }} />
        </Card>
      ) : !data || data.total === 0 ? (
        <Card style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t(
              "build.noViews",
              "Chưa có lượt xem nào trong khoảng này. Deploy app và chia sẻ liên kết để bắt đầu thu thập.",
            )}
          />
        </Card>
      ) : (
        <>
          {/* KPI band */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
            <Stat label={`${t("build.totalViews", "Tổng lượt xem")} (${days} ${t("build.daysUnit", "ngày")})`} value={data.total.toLocaleString()} color="#6C5CE7" />
            <Stat
              label={t("build.avgPerDay", "Trung bình / ngày")}
              value={Math.round(data.total / data.rangeDays).toLocaleString()}
            />
            <Stat label="Mobile" value={`${deviceTotal ? Math.round((data.devices.mobile / deviceTotal) * 100) : 0}%`} color="#16B98D" />
            <Stat label="Desktop" value={`${deviceTotal ? Math.round((data.devices.desktop / deviceTotal) * 100) : 0}%`} color="#F59E0B" />
          </div>

          {/* Daily bar chart (CSS, no dependency) */}
          <Card title={t("build.viewsByDay", "Lượt xem theo ngày")} style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }} styles={{ body: { padding: 16 } }}>
            {/* On a phone the 90-day view can't fit ~90 min-width bars; scroll it
                inside this wrapper so the overflow stays in the card (not the whole
                dashboard). 7/30-day fit the width and don't scroll. */}
            <div style={{ overflowX: "auto" }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 160 }}>
                {data.days.map((d) => (
                  <Tooltip key={d.day} title={`${d.day}: ${d.count} ${t("build.viewsUnit", "lượt")}`}>
                    <div
                      style={{
                        flex: 1,
                        minWidth: 2,
                        height: `${Math.max(2, (d.count / maxCount) * 100)}%`,
                        background: d.count ? "linear-gradient(180deg,#8A7FE0,#6C5CE7)" : "#EEF0F6",
                        borderRadius: "4px 4px 0 0",
                        transition: "height .2s ease",
                      }}
                    />
                  </Tooltip>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 11 }}>{data.days[0]?.day}</Text>
              <Text type="secondary" style={{ fontSize: 11 }}>{data.days[data.days.length - 1]?.day}</Text>
            </div>
          </Card>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))", gap: 14 }}>
            {/* Top referrers */}
            <Card title={t("build.referrers", "Nguồn truy cập")} style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }} styles={{ body: { padding: 16 } }}>
              {data.referrers.length === 0 ? (
                <Text type="secondary">{t("build.noReferrers", "Chưa có dữ liệu nguồn.")}</Text>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {data.referrers.map((r) => (
                    <div key={r.host}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
                        <Text ellipsis style={{ maxWidth: 180 }}>{r.host}</Text>
                        <Text strong>{r.count}</Text>
                      </div>
                      <div style={{ height: 6, borderRadius: 999, background: "#EEF0F6" }}>
                        <div
                          style={{
                            height: "100%",
                            width: `${Math.round((r.count / data.referrers[0].count) * 100)}%`,
                            borderRadius: 999,
                            background: "#6C5CE7",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Devices */}
            <Card title={t("build.devices", "Thiết bị")} style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }} styles={{ body: { padding: 16 } }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <MobileOutlined style={{ color: "#16B98D", fontSize: 18 }} />
                  <Text style={{ flex: 1 }}>Mobile</Text>
                  <Text strong>{data.devices.mobile.toLocaleString()}</Text>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <GlobalOutlined style={{ color: "#F59E0B", fontSize: 18 }} />
                  <Text style={{ flex: 1 }}>Desktop</Text>
                  <Text strong>{data.devices.desktop.toLocaleString()}</Text>
                </div>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
