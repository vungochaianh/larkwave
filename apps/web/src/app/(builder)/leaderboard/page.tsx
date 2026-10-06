"use client";

import { CrownFilled, ReloadOutlined, TrophyOutlined } from "@ant-design/icons";
import { App, Button, Card, Empty, Grid, Skeleton, Space, Tag, Typography } from "antd";
import { useCallback, useEffect, useState } from "react";
import { levelInfo, type LeaderboardEntry, type LeaderboardResponse } from "@larkwave/shared";
import { useI18n, V } from "@larkwave/ui";
import { api } from "@/lib/api";
import { CARD_SHADOW } from "@/lib/theme";
import { UserAvatar } from "@/components/UserAvatar";

const { Title, Text } = Typography;

const MEDAL = ["🥇", "🥈", "🥉"];

// Map the Vietnamese level title (from levelInfo, shared) to a stable slug + EN
// fallback so the flavor rank can be localized next to the "Level" word.
const LEVEL_TITLE_I18N: Record<string, { slug: string; en: string }> = {
  "Tân binh": { slug: "rookie", en: "Rookie" },
  "Thợ học việc": { slug: "apprentice", en: "Apprentice" },
  "Nhà sáng tạo": { slug: "creator", en: "Creator" },
  "Cao thủ": { slug: "expert", en: "Expert" },
  "Bậc thầy": { slug: "master", en: "Master" },
  "Huyền thoại": { slug: "legend", en: "Legend" },
};

export default function LeaderboardPage() {
  const { message } = App.useApp();
  const { t } = useI18n();
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.leaderboard(100));
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  const entries = data?.entries ?? [];
  const meInTop = data?.me ? entries.some((e) => e.isMe) : false;

  // On wide screens, fill the width with a two-column board. To keep the ranking
  // readable top-to-bottom, the left column holds the top half and the right the
  // bottom half (rather than interleaving 1,2 / 3,4).
  const screens = Grid.useBreakpoint();
  const twoCol = !!screens.lg && entries.length > 8;
  const mid = Math.ceil(entries.length / 2);
  const leftEntries = twoCol ? entries.slice(0, mid) : entries;
  const rightEntries = twoCol ? entries.slice(mid) : [];

  return (
    <Space direction="vertical" size={18} style={{ width: "100%" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <Title level={3} style={{ margin: 0 }}>
            <TrophyOutlined style={{ color: "#F59E0B", marginInlineEnd: 8 }} />
            {t("social.leaderboardTitle", "Bảng xếp hạng · Top 100")}
          </Title>
          <Text type="secondary">
            {t("social.leaderboardSubtitle", "Kiếm XP bằng cách tạo app, build thành công, deploy và thu hút lượt xem.")}
          </Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>
          {t("social.reload", "Tải lại")}
        </Button>
      </div>

      {/* Your rank (when outside the visible top list) */}
      {data?.me && !meInTop && (
        <Card style={{ boxShadow: CARD_SHADOW }} styles={{ body: { padding: 12 } }}>
          <Row entry={data.me} highlight />
        </Card>
      )}

      <Card style={{ boxShadow: CARD_SHADOW }} styles={{ body: { padding: 8 } }}>
        {loading ? (
          <Skeleton active paragraph={{ rows: 6 }} style={{ padding: 16 }} />
        ) : entries.length === 0 ? (
          <Empty description={t("social.leaderboardEmpty", "Chưa có ai trên bảng xếp hạng. Hãy là người đầu tiên!")} style={{ padding: "40px 0" }} />
        ) : twoCol ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 6 }}>
            <div>
              {leftEntries.map((e) => (
                <Row key={e.user.id} entry={e} highlight={e.isMe} />
              ))}
            </div>
            <div>
              {rightEntries.map((e) => (
                <Row key={e.user.id} entry={e} highlight={e.isMe} />
              ))}
            </div>
          </div>
        ) : (
          <div>
            {entries.map((e) => (
              <Row key={e.user.id} entry={e} highlight={e.isMe} />
            ))}
          </div>
        )}
      </Card>
    </Space>
  );
}

function Row({ entry, highlight }: { entry: LeaderboardEntry; highlight?: boolean }) {
  const { t, locale } = useI18n();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const lvl = levelInfo(entry.xp);
  const medal = entry.rank <= 3 ? MEDAL[entry.rank - 1] : null;
  const lvlI18n = LEVEL_TITLE_I18N[lvl.title];
  const lvlTitle = lvlI18n ? t(`leaderboard.level.${lvlI18n.slug}`, lvl.title) : lvl.title;
  const xpDisplay = entry.xp.toLocaleString(locale === "en" ? "en-US" : "vi-VN");
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: isMobile ? 10 : 14,
        padding: isMobile ? "10px 8px" : "10px 12px",
        borderRadius: 12,
        background: highlight ? "rgba(108,92,231,0.08)" : undefined,
        border: highlight ? "1px solid rgba(108,92,231,0.25)" : "1px solid transparent",
      }}
    >
      <div
        style={{
          width: 34,
          textAlign: "center",
          fontSize: medal ? 22 : 15,
          fontWeight: 700,
          color: "#6B7280",
          flexShrink: 0,
        }}
      >
        {medal ?? entry.rank}
      </div>
      <UserAvatar name={entry.user.name} avatarUrl={entry.user.avatarUrl} size={40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Text strong ellipsis style={{ flex: 1, minWidth: 0 }}>
            {entry.user.name || entry.user.email}
          </Text>
          {highlight && (
            <Tag color="purple" bordered={false}>
              {t("social.you", "Bạn")}
            </Tag>
          )}
        </div>
        <Text type="secondary" style={{ fontSize: 12.5 }}>
          <CrownFilled style={{ color: "#F59E0B", marginInlineEnd: 5 }} />
          {t("social.level", "Cấp")} {entry.level} · {lvlTitle}
        </Text>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 16, color: V.text }}>
          {xpDisplay}
        </div>
        <Text type="secondary" style={{ fontSize: 11 }}>
          XP
        </Text>
      </div>
    </div>
  );
}
