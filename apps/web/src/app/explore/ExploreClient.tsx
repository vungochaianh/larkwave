"use client";

import { CompassOutlined } from "@ant-design/icons";
import { V, type Locale } from "@larkwave/ui";
import { useLangT } from "@/lib/useLangT";
import { BRAND } from "@/lib/theme";
import { HeroShader, ParallaxLayers, type ParallaxLayer } from "@/components/fx";
import { LandingHeader, LandingFooter } from "@/components/LandingChrome";
import ForceDark from "@/components/ForceDark";
import ExploreBrowser, { ExploreStyles, ORB_LAYER_STYLE, orb } from "@/components/ExploreBrowser";


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

export default function ExploreClient({ lang }: { lang?: Locale }) {
  // Ngôn ngữ từ máy chủ, cùng lý do với /pricing: client component kết xuất ở máy chủ thì context
  // i18n chưa có gì để dựa vào nên luôn ra tiếng Việt, và HTML thô là thứ máy tìm kiếm đọc.
  const t = useLangT(lang);
  // Không có cổng chờ auth: trang kết xuất y hệt nhau cho khách và cho người đã đăng nhập, nên
  // không có gì để chờ — và đó cũng là lý do nó không còn nhấp nháy đổi khung sau khi hydrate.

  // MỘT vỏ duy nhất, không còn nhánh "đã đăng nhập thì mặc vỏ dashboard" — cùng lý do với
  // /pricing (xem chú thích ở PricingClient). Khám phá app là trang người ngoài vào xem; người đã
  // đăng nhập muốn duyệt app cộng đồng thì khối đó đã nằm sẵn ngay dưới trang "Tạo website"
  // (create-website/_home.tsx dùng chung đúng component ExploreBrowser).
  // Khách → vỏ công khai, ép TỐI (ForceDark): trang công khai được thiết kế tối hẳn.
  return (
    <ForceDark>
      <div style={{ minHeight: "100vh", background: V.layer, color: V.text }}>
        <ExploreStyles />
        <LandingHeader lang={lang} />
        <ParallaxLayers layers={HERO_LAYERS} className="tw-ex-hero" scrollRange={110} mouseRange={44} tilt={3}>
          <div className="tw-ex-hero-in">
            <span className="tw-ex-kicker">
              <CompassOutlined /> {t("web.pubc.exKicker", "Cộng đồng Larkwave")}
            </span>
            <h1 className="tw-ex-h1">
              <span className="tw-ex-grad">{t("web.pubc.exTitle", "Khám phá app cộng đồng")}</span>
            </h1>
            <p className="tw-ex-sub">
              {t("web.pubc.exSubOut", "Những app được tạo bằng AI trên Larkwave. Mở chạy thử, lấy cảm hứng, rồi dựng app của riêng bạn.")}
            </p>
          </div>
        </ParallaxLayers>
        <div className="tw-ex-wrap">
          <ExploreBrowser lang={lang} />
        </div>
        <LandingFooter lang={lang} />
      </div>
    </ForceDark>
  );
}
