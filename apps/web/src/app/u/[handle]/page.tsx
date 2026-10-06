"use client";

import { TeamOutlined, AppstoreOutlined, EyeOutlined } from "@ant-design/icons";
import { App, Button, Empty, Skeleton, Typography } from "antd";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { MakerProfile } from "@larkwave/shared";
import { useI18n } from "@larkwave/ui";
import { api } from "@/lib/api";
import { fromNow } from "@/lib/format";
import { CARD_SHADOW } from "@/lib/theme";
import AppCover from "@/components/AppCover";
import { UserAvatar } from "@/components/UserAvatar";
import PublicTopbar from "@/components/PublicTopbar";

const { Title, Text } = Typography;

function hostOf(url?: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export default function MakerProfilePage() {
  const { t } = useI18n();
  const params = useParams<{ handle: string }>();
  const handle = params.handle;
  const { message } = App.useApp();
  const [maker, setMaker] = useState<MakerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followers, setFollowers] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const m = await api.maker(handle);
        if (!alive) return;
        setMaker(m);
        setFollowers(m.followers);
        // Best-effort follow state (only meaningful when logged in).
        api
          .isFollowingMaker(handle)
          .then((r) => alive && setFollowing(r.following))
          .catch(() => undefined);
      } catch {
        if (alive) setNotFound(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [handle]);

  const toggleFollow = async () => {
    setBusy(true);
    try {
      const r = await api.followMaker(handle);
      setFollowing(r.following);
      setFollowers(r.followers);
    } catch (e) {
      const msg = (e as Error).message || "";
      if (/401|unauth|đăng nhập|chưa đăng/i.test(msg)) {
        window.location.href = `/login?next=${encodeURIComponent(`/u/${handle}`)}`;
      } else {
        message.error(msg || t("web.pubc.followFail", "Không theo dõi được"));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh" }}>
      <PublicTopbar />
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 20px 60px" }}>
        {loading ? (
          <Skeleton avatar active paragraph={{ rows: 3 }} />
        ) : notFound || !maker ? (
          <Empty description={t("web.pubc.makerNotFound", "Không tìm thấy maker này")} style={{ marginTop: 80 }}>
            <Link href="/explore">
              <Button type="primary">{t("web.pubc.exploreApp", "Khám phá app")}</Button>
            </Link>
          </Empty>
        ) : (
          <>
            {/* Header */}
            <div
              style={{
                display: "flex",
                gap: 18,
                alignItems: "center",
                flexWrap: "wrap",
                background: "#fff",
                border: "1px solid #ECEDF3",
                borderRadius: 16,
                padding: 20,
                boxShadow: CARD_SHADOW,
              }}
            >
              <UserAvatar name={maker.name} avatarUrl={maker.avatarUrl} size={72} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Title level={3} style={{ margin: 0 }} ellipsis>
                  {maker.name}
                </Title>
                <Text type="secondary">@{maker.handle} · {t("web.pubc.joined", "tham gia")} {fromNow(maker.joinedAt)}</Text>
                <div style={{ display: "flex", gap: 18, marginTop: 8, flexWrap: "wrap" }}>
                  <Text>
                    <AppstoreOutlined /> <b>{maker.appCount}</b> app
                  </Text>
                  <Text>
                    <TeamOutlined /> <b>{followers}</b> {t("web.pubc.followers", "người theo dõi")}
                  </Text>
                  <Text type="secondary">{t("web.pubc.followingCount", "Đang theo dõi {n}", { n: maker.following })}</Text>
                </div>
              </div>
              <Button
                type={following ? "default" : "primary"}
                icon={<TeamOutlined />}
                loading={busy}
                onClick={() => void toggleFollow()}
              >
                {following ? t("web.pubc.followingBtn", "Đang theo dõi") : t("web.pubc.followBtn", "Theo dõi")}
              </Button>
            </div>

            {/* App gallery */}
            <Title level={4} style={{ marginTop: 28 }}>
              {t("web.pubc.publicApps", "App công khai")}
            </Title>
            {maker.apps.length === 0 ? (
              <Empty description={t("web.pubc.noPublicApps", "Chưa có app công khai")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                  gap: 16,
                  marginTop: 12,
                }}
              >
                {maker.apps.map((a) => (
                  <Link
                    key={a.slug}
                    href={`/app/${a.slug}`}
                    className="tw-lift"
                    style={{
                      borderRadius: 16,
                      overflow: "hidden",
                      background: "#fff",
                      border: "1px solid #ECEDF3",
                      boxShadow: CARD_SHADOW,
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    <AppCover seed={a.slug} name={a.name} track={a.track} host={hostOf(a.url)} liveUrl={a.url} />
                    <div style={{ padding: "12px 14px", flex: 1 }}>
                      <Text strong ellipsis style={{ display: "block" }}>
                        {a.name}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        <EyeOutlined /> {t("web.pubc.views", "{n} lượt xem", { n: a.visits })}
                      </Text>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
