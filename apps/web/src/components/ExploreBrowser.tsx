/**
 * Khối duyệt app cộng đồng — phần dùng chung.
 *
 * Trước đây nằm trong apps/web/src/app/explore/page.tsx và chỉ trang đó dùng được. Tách ra vì nay
 * có hai chỗ cần: trang /explore (vẫn nguyên như cũ) và phần dưới của /create-website.
 *
 * Tách theo đúng đường đã có sẵn: file cũ vốn đã chia "vỏ trang" (quyết định AppShell hay
 * LandingHeader) khỏi "khối duyệt" (tìm kiếm + lưới + phân trang), và ghi rõ trong ghi chú rằng
 * khối duyệt là phần chia sẻ được. Chỗ này chỉ đưa nó ra thành file riêng, không đổi hành vi.
 *
 * `ExploreStyles` phải đi kèm `ExploreBrowser`: lưới và thẻ ăn CSS từ đó. Trang nào dựng
 * ExploreBrowser cũng phải dựng ExploreStyles, và dựng hai lần cũng không sao — React 19 gom
 * `<style href precedence>` theo href nên không sinh bản trùng.
 */

"use client";

import { CompassOutlined, EyeOutlined, LinkOutlined, SearchOutlined } from "@ant-design/icons";
import { Empty, Input, Pagination, Segmented, Skeleton, Tag, Typography } from "antd";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { PublicApp } from "@larkwave/shared";
import { V, type Locale } from "@larkwave/ui";
import { useLangT } from "@/lib/useLangT";
import { api } from "@/lib/api";
import { fromNow } from "@/lib/format";
import { BRAND, BRAND_GRADIENT } from "@/lib/theme";
import { useAuth } from "@/lib/auth";
import AppCover from "@/components/AppCover";
import { HeroShader, ParallaxLayers, TiltCard, type ParallaxLayer } from "@/components/fx";

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
const PAGE_SIZE = 24;

/* CSS riêng của trang qua `<style href precedence>` (React 19) — cùng cơ chế với bộ fx: có sẵn
   trong HTML server trả về, không sinh bản trùng. Màu qua biến --tw-* vì trang này có HAI vỏ:
   khách xem được ForceDark ép TỐI (nền đen-tím, thẻ kính — bản thiết kế chính), còn người đã đăng
   nhập xem trong AppShell theo toggle của họ (sáng hoặc tối). */
const PAGE_CSS = `
.tw-ex-hero{padding:clamp(48px,7vw,88px) clamp(16px,5vw,56px) clamp(36px,5vw,56px);text-align:center;}
.tw-ex-hero-in{max-width:820px;margin:0 auto;}
.tw-ex-kicker{display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:999px;font-weight:600;font-size:13px;
  background:var(--tw-chip-bg,#F1EFFE);color:var(--tw-chip-text,#5B4FC2);border:1px solid var(--tw-border,#ECEDF3);margin-bottom:18px;}
.tw-ex-h1{font-size:clamp(30px,5.5vw,52px);line-height:1.08;font-weight:800;letter-spacing:-.8px;margin:0 0 14px;color:var(--tw-text,#1E2230);}
.tw-ex-grad{background:${BRAND_GRADIENT};-webkit-background-clip:text;background-clip:text;color:transparent;}
.tw-ex-sub{font-size:clamp(15px,2.2vw,18px);color:var(--tw-text-sub,#6B7280);max-width:640px;margin:0 auto;line-height:1.55;}
.tw-ex-wrap{max-width:1320px;margin:0 auto;padding:22px 20px 56px;}

/* Khối duyệt: nền parallax là một lớp absolute PHÍA SAU chứ không bọc lưới — ParallaxLayers cắt
   overflow, mà TiltCard lúc hover phóng 1.03 sẽ bị xén mép ở thẻ ngoài cùng. */
.tw-ex-browser{position:relative;}
.tw-ex-browser-in{position:relative;z-index:1;}
.tw-ex-controls{display:flex;gap:12px;flex-wrap:wrap;justify-content:space-between;margin-bottom:20px;}
.tw-ex-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr));gap:18px;}
.tw-ex-skel{border-radius:16px;padding:18px;}

.tw-ex-card{border-radius:16px;overflow:hidden;height:100%;}
.tw-ex-link{display:flex;flex-direction:column;height:100%;color:var(--tw-text,#1E2230);}
.tw-ex-link:hover{color:var(--tw-text,#1E2230);}
.tw-ex-body{padding:13px 15px 6px;flex:1;}
.tw-ex-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 12px;border-top:1px solid var(--tw-border-sub,#F1F2F7);}
.tw-ex-open{color:${BRAND};font-size:12px;font-weight:600;white-space:nowrap;}
`;

export function ExploreStyles() {
  return (
    <style href="tw-ex-page" precedence="default">
      {PAGE_CSS}
    </style>
  );
}

/* Lớp quầng mờ dần ở mép trên/dưới: ParallaxLayers cắt overflow nên quầng tràn mép sẽ thành một
   cạnh thẳng lộ liễu — mask đặt trên lớp, không phải trên khối, để chữ phía trước không bị mờ. */
/* Mốc 8%/92%: lớp parallax tràn ±10% ngoài khối, nên khối chỉ chiếm ~8→92% chiều cao lớp — mờ hẳn
   phải rơi đúng tại mép khối, không phải ở mép lớp (ngoài tầm nhìn) như bản đầu. */
export const ORB_LAYER_STYLE = {
  WebkitMaskImage: "linear-gradient(transparent 8%, #000 32%, #000 68%, transparent 92%)",
  maskImage: "linear-gradient(transparent 8%, #000 32%, #000 68%, transparent 92%)",
} as const;
export const orb = (style: Record<string, string | number>, soft = false) => <i className={soft ? "tw-pub-orb tw-pub-orb-soft" : "tw-pub-orb"} style={style} />;

/* Hero khách: nền WebGL ở xa (tự lắc camera theo chuột, nên depth rất nhỏ để không chồng hai
   chuyển động), hai quầng màu ở gần — cùng ngôn ngữ với /download để đi qua lại hai trang không
   thấy đổi thế giới. */
const HERO_LAYERS: ParallaxLayer[] = [
  { depth: 0.04, style: { inset: "-4%" }, node: <HeroShader /> },
  {
    depth: 0.3,
    style: ORB_LAYER_STYLE,
    node: orb({ left: "-4%", top: "-16%", width: "46vmax", height: "46vmax", maxWidth: 680, maxHeight: 680, background: "radial-gradient(circle, rgba(108,92,231,.5), transparent 70%)" }),
  },
  {
    depth: 0.5,
    style: ORB_LAYER_STYLE,
    node: orb({ right: "-8%", bottom: "-30%", width: "40vmax", height: "40vmax", maxWidth: 600, maxHeight: 600, background: "radial-gradient(circle, rgba(79,182,255,.4), transparent 70%)" }),
  },
];

/* Nền sau lưới thẻ: chỉ hai quầng rất nhạt, không sao — lưới là nơi đọc nội dung, nền chỉ được
   phép gợi chiều sâu chứ không được cạnh tranh với ảnh bìa của app. */
/* Khối lưới thụt 20px so với viewport nên cả bốn mép đều lộ: mask ellipse mờ về mọi hướng, quầng
   kéo vào phía trong để không bị mask nuốt mất. */
const GRID_LAYER_STYLE = {
  WebkitMaskImage: "radial-gradient(ellipse 40% 40% at 50% 50%, #000 20%, transparent 100%)",
  maskImage: "radial-gradient(ellipse 40% 40% at 50% 50%, #000 20%, transparent 100%)",
} as const;
const GRID_LAYERS: ParallaxLayer[] = [
  {
    depth: 0.2,
    style: GRID_LAYER_STYLE,
    node: orb({ left: "14%", top: "14%", width: "40vmax", height: "40vmax", maxWidth: 620, maxHeight: 620, background: "radial-gradient(circle, rgba(108,92,231,.45), transparent 70%)" }, true),
  },
  {
    depth: 0.35,
    style: GRID_LAYER_STYLE,
    node: orb({ right: "14%", top: "40%", width: "36vmax", height: "36vmax", maxWidth: 560, maxHeight: 560, background: "radial-gradient(circle, rgba(255,122,182,.38), transparent 70%)" }, true),
  },
];

/**
 * `/explore` is publicly reachable (community showcase), so it can't live under
 * the auth-gated `(builder)` route group. Instead it renders auth-aware chrome:
 * logged-in users get the full sidebar `AppShell` (so it feels like a real page
 * of the app, not a detached one); logged-out visitors get the public top bar +
 * hero. The browsing UI itself is shared via <ExploreBrowser/>.
 */

/** The shared search + grid of public apps. Fills whatever width its parent gives. */
export default function ExploreBrowser({ lang }: { lang?: Locale } = {}) {
  // `lang` chỉ có ý nghĩa khi khối này nằm trong một trang kết xuất ở MÁY CHỦ (/explore). Ở
  // /create-website nó nằm trong bảng điều khiển, không ai truyền, và `useLangT(undefined)` rơi
  // về đúng context i18n như cũ — nên thêm prop này không đổi gì bên đó.
  const t = useLangT(lang);
  const [items, setItems] = useState<PublicApp[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [track, setTrack] = useState<string>("all");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (p: number, tr: string, search: string) => {
      setLoading(true);
      try {
        const res = await api.publicApps({
          page: p,
          pageSize: PAGE_SIZE,
          ...(tr !== "all" ? { track: tr } : {}),
          ...(search ? { q: search } : {}),
        });
        setItems(res.items);
        setTotal(res.total);
        setPage(p);
      } catch {
        setItems([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load(1, track, query);
  }, [load, track, query]);

  return (
    <div className="tw-ex-browser">
      {/* Lớp nền parallax nhẹ, absolute phía sau; inline `position` thắng class của fx nên khối
          này không chiếm chỗ trong dòng. */}
      <ParallaxLayers layers={GRID_LAYERS} scrollRange={100} mouseRange={30} tilt={0} style={{ position: "absolute", inset: 0 }} />

      <div className="tw-ex-browser-in">
        {/* Controls */}
        <div className="tw-ex-controls">
          <Segmented
            value={track}
            onChange={(v) => setTrack(v as string)}
            options={[
              { label: t("web.pubc.exAll", "Tất cả"), value: "all" },
              { label: "Website", value: "web" },
              { label: "Mobile", value: "mobile" },
              { label: "Extension", value: "extension" },
            ]}
          />
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: V.textFaint }} />}
            placeholder={t("web.pubc.exSearchPh", "Tìm app…")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onPressEnter={() => setQuery(q.trim())}
            onBlur={() => setQuery(q.trim())}
            style={{ maxWidth: 280 }}
          />
        </div>

        {loading ? (
          <div className="tw-ex-grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="tw-pub-card tw-ex-skel">
                <Skeleton active paragraph={{ rows: 3 }} />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <Empty description={t("web.pubc.exEmpty", "Chưa có app công khai nào")} style={{ padding: "64px 0" }} />
        ) : (
          <div className="tw-ex-grid">
            {items.map((a) => (
              <AppCard key={a.slug} app={a} lang={lang} />
            ))}
          </div>
        )}

        {total > PAGE_SIZE && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 28 }}>
            <Pagination current={page} pageSize={PAGE_SIZE} total={total} showSizeChanger={false} onChange={(p) => void load(p, track, query)} />
          </div>
        )}
      </div>
    </div>
  );
}

function hostOf(url: string | null | undefined, fallback: string): string {
  if (!url) return fallback;
  try {
    return new URL(url).host;
  } catch {
    return fallback;
  }
}

/**
 * Thẻ app: TiltCard bọc ngoài (nghiêng 16°, viền phát sáng và bị hút khi chuột lại gần, loé khi
 * vào), Link lấp đầy bên trong để cả thẻ vẫn là một liên kết duy nhất — không lồng phần tử tương
 * tác vào nhau, bàn phím Tab vẫn một dừng. 16° thay vì 18° mặc định: thẻ có ảnh bìa, nghiêng quá
 * thì ảnh méo lộ hơn chữ.
 */
function AppCard({ app, lang }: { app: PublicApp; lang?: Locale }) {
  const t = useLangT(lang);
  return (
    <TiltCard maxTilt={16} scale={1.04} className="tw-pub-card tw-ex-card">
      <Link href={`/app/${app.slug}`} className="tw-ex-link">
        <AppCover
          seed={app.slug}
          name={app.name}
          track={app.track}
          host={hostOf(app.url, app.slug)}
          liveUrl={app.url}
          chips={
            <Tag color={TRACK_COLOR[app.track] ?? "default"} bordered={false} style={{ marginInlineEnd: 0 }}>
              {TRACK_LABEL[app.track] ?? app.track}
            </Tag>
          }
        />

        <div className="tw-ex-body">
          <Title level={5} style={{ margin: 0 }} ellipsis={{ rows: 1 }}>
            {app.name}
          </Title>
          <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
            {t("web.pubc.by", "bởi {name}", { name: app.author })}
          </Text>
          <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ margin: 0, fontSize: 12.5 }}>
            {app.description || t("web.pubc.appDescFallback", "Một app được tạo bằng Larkwave.")}
          </Paragraph>
        </div>

        <div className="tw-ex-foot">
          <Text type="secondary" style={{ fontSize: 11.5 }}>
            <EyeOutlined style={{ marginInlineEnd: 5 }} />
            {t("web.pubc.views", "{n} lượt xem", { n: app.visits })} · {fromNow(app.updatedAt)}
          </Text>
          {app.url && (
            <span className="tw-ex-open">
              <LinkOutlined /> {t("web.pubc.open", "Mở")}
            </span>
          )}
        </div>
      </Link>
    </TiltCard>
  );
}
