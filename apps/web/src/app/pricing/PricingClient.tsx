"use client";

import {
  CheckOutlined,
  ClockCircleOutlined,
  CreditCardOutlined,
  CrownOutlined,
  FacebookFilled,
  FireOutlined,
  InboxOutlined,
  MinusOutlined,
  ReloadOutlined,
  StarFilled,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { App, Button, Card, Empty, Grid, Modal, Skeleton, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  discountActive,
  type CreatePaymentResponse,
  type DiscountInfo,
  type MeSubscription,
  type Payment,
  type PlanCatalogEntry,
  type PlanId,
  type UpgradeQuote,
} from "@larkwave/shared";
import { useI18n, type Locale } from "@larkwave/ui";
import { useLangT, useNgonNguIsland } from "@/lib/useLangT";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import {
  BRAND,
  BRAND_GRADIENT,
  CARD_SHADOW,
} from "@/lib/theme";
import { FANPAGE_URL, formatVnd, PLAN_ACCENT, POPULAR_PLAN } from "@/lib/billing";
import CheckoutModal from "@/components/CheckoutModal";
import UsageWidget from "@/components/UsageWidget";
import ForceDark from "@/components/ForceDark";
import { LandingHeader, LandingFooter } from "@/components/LandingChrome";
import { CursorGlow, HeroShader, ParallaxLayers, TiltCard, type ParallaxLayer } from "@/components/fx";

const { Title, Text, Paragraph } = Typography;

// Tier order (cheap → expensive) — index = rank, for upgrade/downgrade decisions.
const PLAN_ORDER: string[] = ["free", "starter", "pro", "enterprise"];
const rankOf = (p?: string | null): number => Math.max(0, PLAN_ORDER.indexOf(p ?? "free"));

/**
 * Static marketing catalog shown to LOGGED-OUT visitors only. The authed
 * /me/subscription endpoint (the live, admin-tunable source of truth) needs a
 * token, so anonymous visitors on the public /pricing page get this mirror of
 * apps/api/src/billing/plans.ts instead — enough to preview plans + prices and
 * hit a "sign up to choose" CTA. Logged-in users always get the live values.
 */
const ANON_CATALOG: PlanCatalogEntry[] = [
  {
    id: "free",
    label: "Miễn phí",
    priceVnd: 0,
    monthlyTokens: 3_000_000,
    storageMb: 1_024,
    features: [
      "Hạn mức dùng AI hàng tháng (gói cơ bản)",
      "Lark Agents trên desktop: Bitable · Docs · Sheets · Wiki · Drive · Lịch · Tin nhắn",
      "Chạy trên Claude/Codex/Gemini/Grok của máy bạn — không tính hạn mức",
      "Trợ lý AI · Kỹ năng · Artifacts",
      "Hỗ trợ cộng đồng",
    ],
  },
  {
    id: "starter",
    label: "Khởi đầu",
    priceVnd: 199000,
    monthlyTokens: 30_000_000,
    storageMb: 5_120,
    features: [
      "Hạn mức gấp ~10× gói Miễn phí mỗi tháng",
      "Trợ lý AI trên Claude do Larkwave cung cấp (không cần cài Claude)",
      "Tự động hoá Lark theo lịch · Đặc tả · Xuất xlsx/docx/pdf",
      "Điều khiển máy desktop từ điện thoại/web",
      "Hỗ trợ email",
    ],
  },
  {
    id: "pro",
    label: "Chuyên nghiệp",
    priceVnd: 499000,
    monthlyTokens: 100_000_000,
    storageMb: 10_240,
    features: [
      "Hạn mức gấp ~33× gói Miễn phí mỗi tháng",
      "Mọi tính năng gói Khởi đầu",
      "Larkwave chạy hộ lịch tự động hoá khi máy bạn tắt",
      "Đồng bộ CMS Bitable nhiều tài khoản Lark",
      "Chia sẻ trợ lý cho đồng đội (quyền uỷ thác, không lộ khoá)",
      "Hỗ trợ ưu tiên",
    ],
  },
  {
    id: "enterprise",
    label: "Doanh nghiệp",
    priceVnd: 999000,
    monthlyTokens: 300_000_000,
    storageMb: 25_600,
    features: [
      "Hạn mức gấp ~100× gói Miễn phí mỗi tháng",
      "Mọi tính năng gói Chuyên nghiệp",
      "Sớm dùng tính năng mới · Hỗ trợ riêng (SLA)",
    ],
  },
];

/** English mirror of ANON_CATALOG — shown on the public /pricing when the UI locale is EN. */
const ANON_CATALOG_EN: PlanCatalogEntry[] = [
  {
    id: "free",
    label: "Free",
    priceVnd: 0,
    monthlyTokens: 3_000_000,
    storageMb: 1_024,
    features: [
      "Monthly AI usage quota (base)",
      "Lark Agents on desktop: Bitable · Docs · Sheets · Wiki · Drive · Calendar · Messages",
      "Runs on your machine's Claude/Codex/Gemini/Grok — no quota used",
      "AI Assistant · Skills · Artifacts",
      "Community support",
    ],
  },
  {
    id: "starter",
    label: "Starter",
    priceVnd: 199000,
    monthlyTokens: 30_000_000,
    storageMb: 5_120,
    features: [
      "~10× the Free monthly quota",
      "AI Assistant on Claude provided by Larkwave (no Claude install needed)",
      "Scheduled Lark automation · Spec · xlsx/docx/pdf export",
      "Control your desktop from phone/web",
      "Email support",
    ],
  },
  {
    id: "pro",
    label: "Professional",
    priceVnd: 499000,
    monthlyTokens: 100_000_000,
    storageMb: 10_240,
    features: [
      "~33× the Free monthly quota",
      "Everything in Starter",
      "Larkwave runs your automation schedules when your computer is off",
      "Bitable CMS sync across multiple Lark accounts",
      "Share your assistant with teammates (delegated access, no keys exposed)",
      "Priority support",
    ],
  },
  {
    id: "enterprise",
    label: "Enterprise",
    priceVnd: 999000,
    monthlyTokens: 300_000_000,
    storageMb: 25_600,
    features: [
      "~100× the Free monthly quota",
      "Everything in Professional",
      "Early access to new features · Dedicated support (SLA)",
    ],
  },
];

/** Synthetic subscription for the logged-out marketing view — no current plan, no usage. */
const ANON_SUB: MeSubscription = {
  plan: "" as PlanId,
  planLabel: "",
  percentUsed: 0,
  tokensUsed: 0,
  tokensLimit: 0,
  resetAt: null,
  unlimited: false,
  freePlanEnabled: true,
  catalog: ANON_CATALOG,
};

/* ------------------------------------------------------------------------------------------------
 * Trình bày: CSS riêng của trang giá.
 *
 * Vì sao là một chuỗi CSS + `<style href precedence>` thay vì inline style: các thứ cần ở đây —
 * hover, @media (mobile, reduced-motion), ::before vẽ viền gradient, cột dính trong bảng — inline
 * style không làm được. React 19 gộp thẻ style có `href` thành MỘT bản trong <head>, có mặt ngay
 * trong HTML server trả về, nên khung hình đầu tiên đã đúng (kể cả nhánh giảm chuyển động).
 *
 * Màu lấy từ biến `--tw-*` của theme để đúng cả tối (khách: ForceDark ép tối, bản thiết kế chính)
 * lẫn sáng (người đã đăng nhập xem trong AppShell để sáng). Riêng vài sắc độ riêng của trang (độ
 * đậm quầng sáng, bóng đổ) khai báo theo ba tầng selector: `:root`, `[data-theme="dark"]` (attribute,
 * KHÔNG phải `:root[data-theme="dark"]` — selector đó không khớp wrapper ForceDark), và
 * `[data-theme="light"]` cho subtree bị ép sáng.
 * ---------------------------------------------------------------------------------------------- */
const PRICING_CSS = `
:root{
  --tw-pr-orb-a:rgba(108,92,231,.17);
  --tw-pr-orb-b:rgba(79,182,255,.13);
  --tw-pr-orb-c:rgba(255,122,182,.11);
  --tw-pr-line:rgba(108,92,231,.13);
  --tw-pr-shadow:0 1px 3px rgba(17,24,39,.06),0 14px 34px rgba(17,24,39,.07);
  --tw-pr-shadow-pop:0 22px 54px rgba(108,92,231,.26);
  --tw-pr-shadow-hover:0 18px 40px rgba(17,24,39,.12);
  --tw-pr-pop-tint:rgba(108,92,231,.06);
}
[data-theme="dark"]{
  --tw-pr-orb-a:rgba(124,108,240,.34);
  --tw-pr-orb-b:rgba(79,182,255,.22);
  --tw-pr-orb-c:rgba(255,122,182,.18);
  --tw-pr-line:rgba(255,255,255,.07);
  --tw-pr-shadow:0 1px 3px rgba(0,0,0,.3),0 14px 34px rgba(0,0,0,.35);
  --tw-pr-shadow-pop:0 22px 54px rgba(108,92,231,.38);
  --tw-pr-shadow-hover:0 18px 40px rgba(0,0,0,.45);
  --tw-pr-pop-tint:rgba(124,108,240,.12);
}
[data-theme="light"]{
  --tw-pr-orb-a:rgba(108,92,231,.17);
  --tw-pr-orb-b:rgba(79,182,255,.13);
  --tw-pr-orb-c:rgba(255,122,182,.11);
  --tw-pr-line:rgba(108,92,231,.13);
  --tw-pr-shadow:0 1px 3px rgba(17,24,39,.06),0 14px 34px rgba(17,24,39,.07);
  --tw-pr-shadow-pop:0 22px 54px rgba(108,92,231,.26);
  --tw-pr-shadow-hover:0 18px 40px rgba(17,24,39,.12);
  --tw-pr-pop-tint:rgba(108,92,231,.06);
}

/* ---- Nền có chiều sâu ------------------------------------------------------------------------
   Ba quầng sáng + một "sàn" lưới phối cảnh, đặt trong ParallaxLayers ở độ sâu khác nhau: cuộn hay
   rê chuột thì chúng dịch lệch nhau vài px — mắt đọc chênh lệch đó thành chiều sâu. Biên độ cố ý
   nhỏ (xem scrollRange/mouseRange ở dưới): trang giá là để đọc số, không phải để ngắm nền. */
.tw-pr-page{min-height:60vh;}
.tw-pr-orb{position:absolute;border-radius:50%;pointer-events:none;}
.tw-pr-orb--a{width:min(60vmax,760px);height:min(60vmax,760px);left:-18vmax;top:-160px;background:radial-gradient(circle,var(--tw-pr-orb-a) 0%,transparent 66%);}
.tw-pr-orb--b{width:min(52vmax,680px);height:min(52vmax,680px);right:-16vmax;top:160px;background:radial-gradient(circle,var(--tw-pr-orb-b) 0%,transparent 66%);}
.tw-pr-orb--c{width:min(40vmax,520px);height:min(40vmax,520px);left:4vw;top:1080px;background:radial-gradient(circle,var(--tw-pr-orb-c) 0%,transparent 66%);}
/* Sàn lưới: một tấm lưới phẳng xoay quanh cạnh DƯỚI (transform-origin 50% 100%) để cạnh trên lùi
   xa và các đường hội tụ về "chân trời" — cách rẻ nhất để có cảm giác 3D mà không cần canvas.
   Mask làm mờ cả hai đầu: đầu xa để giấu moiré khi các đường dồn lại, đầu gần để sàn tan vào
   trang thay vì kết thúc bằng một cạnh cứng ngay dưới thẻ gói. */
.tw-pr-floor{
  position:absolute;left:-30%;right:-30%;top:-560px;height:1000px;pointer-events:none;
  background-image:linear-gradient(var(--tw-pr-line) 1px,transparent 1px),linear-gradient(90deg,var(--tw-pr-line) 1px,transparent 1px);
  background-size:44px 44px;
  transform-origin:50% 100%;
  transform:perspective(900px) rotateX(64deg);
  -webkit-mask-image:linear-gradient(180deg,transparent 0%,#000 55%,#000 78%,transparent 100%);
  mask-image:linear-gradient(180deg,transparent 0%,#000 55%,#000 78%,transparent 100%);
}

/* ---- Hero ------------------------------------------------------------------------------------ */
.tw-pr-hero{text-align:center;max-width:760px;margin:8px auto 0;}
.tw-pr-hero-title{letter-spacing:-.02em;}
/* Vạch gradient ngắn dưới tiêu đề: điểm nhấn thương hiệu duy nhất ở hero — chữ tiêu đề giữ màu
   đặc để đọc rõ, không đổ gradient lên chữ. */
.tw-pr-hero-bar{display:block;width:72px;height:4px;border-radius:999px;margin:0 auto 12px;background:${BRAND_GRADIENT};}

/* Hiện lên nhẹ khi vào trang — đủ để thấy có chuyển động, không đủ để phải chờ. */
@keyframes tw-pr-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.tw-pr-rise{animation:tw-pr-rise .42s cubic-bezier(.22,.8,.3,1) both;}
.tw-pr-rise-1{animation-delay:.06s}.tw-pr-rise-2{animation-delay:.12s}.tw-pr-rise-3{animation-delay:.18s}

/* ---- Thẻ gói --------------------------------------------------------------------------------- */
.tw-pr-grid{
  display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;
  align-items:stretch;max-width:1040px;margin:0 auto;width:100%;
  /* Chừa chỗ cho nhãn "Phổ biến" nhô lên và cho thẻ được khuyên dùng nâng cao hơn hàng. */
  padding-top:14px;
}
.tw-pr-slot{display:grid;min-width:0;}
/* TiltCard là ô grid bên trong slot: display:grid để Card con tự kéo đủ chiều cao hàng. Bo góc
   đặt ở đây vì lớp loé sáng của TiltCard dùng border-radius: inherit. */
.tw-pr-tilt{display:grid;border-radius:16px;}
/* Thẻ gói: nền GẦN đục (color-mix 88% màu bề mặt) để quầng sáng phía sau thấp thoáng — không dùng
   backdrop-filter vì Safari hay chớp khi kết hợp với preserve-3d của TiltCard. */
.ant-card.tw-pr-card{
  border-radius:16px;
  background:var(--tw-surface,#fff);
  background:color-mix(in srgb,var(--tw-surface,#fff) 88%,transparent);
  box-shadow:var(--tw-pr-shadow);
  transition:box-shadow .3s ease;
}
/* Tối: thẻ gói là KÍNH (trắng 3.5% + viền trắng mờ + vệt sáng mép trên) để quầng sáng và nền WebGL
   phía sau thấp thoáng qua — thẻ đục màu xám trên nền đen là thứ làm bản tối trông "chưa thiết kế". */
[data-theme="dark"] .ant-card.tw-pr-card,[data-theme="dark"] .tw-pr-cmp-scroll{
  background:var(--tw-fx-glass-bg,rgba(255,255,255,.035));
  border-color:var(--tw-fx-glass-border,rgba(255,255,255,.09));
  box-shadow:var(--tw-pr-shadow),inset 0 1px 0 rgba(255,255,255,.07);
}
[data-theme="dark"] .ant-card.tw-pr-card--popular{background:rgba(16,14,28,.92);}
/* Gói được khuyên dùng: viền gradient (vẽ bằng ::before ở z-index -1, Card bên trên có border
   trong suốt + background-clip: padding-box nên gradient lộ ra đúng 1.5px quanh mép) + bóng tím
   sâu hơn + nâng lên 10px so với hàng trên màn rộng. Ba tín hiệu cùng nói "đây là gói nên chọn"
   mà không phải thêm chữ. */
.tw-pr-tilt--popular{box-shadow:var(--tw-pr-shadow-pop);}
.tw-pr-tilt--popular::before{content:"";position:absolute;inset:-1.5px;border-radius:inherit;background:${BRAND_GRADIENT};z-index:-1;}
.ant-card.tw-pr-card--popular{border:1.5px solid transparent;background-clip:padding-box;box-shadow:none;}
@media (min-width:768px){
  .tw-pr-slot--popular{margin-top:-10px;margin-bottom:10px;}
}
/* Nút CTA của gói được khuyên dùng đổ gradient thương hiệu; chỉ background-image nên antd vẫn
   quản màu chữ/trạng thái loading/disabled như thường. */
.ant-btn-primary.tw-pr-cta-pop{background-image:${BRAND_GRADIENT};border-color:transparent;}
.ant-btn-primary.tw-pr-cta-pop:not(:disabled):hover{filter:brightness(1.06);}

.tw-pr-plan-head{display:flex;align-items:center;gap:10px;margin-bottom:4px;}
.tw-pr-plan-icon{display:inline-flex;width:38px;height:38px;border-radius:11px;align-items:center;justify-content:center;font-size:18px;}
.tw-pr-price{font-size:30px;font-weight:800;letter-spacing:-.02em;color:var(--tw-text,#1E2230);font-variant-numeric:tabular-nums;}
.tw-pr-price--sale{color:#F5365C;}
.tw-pr-unit{font-size:14px;color:var(--tw-text-faint,#9AA3B5);}
.tw-pr-strike{font-size:14px;color:var(--tw-text-faint,#9AA3B5);text-decoration:line-through;}
.tw-pr-features{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px;}
.tw-pr-feature{display:flex;align-items:flex-start;gap:8px;font-size:13.5px;color:var(--tw-text,#1E2230);line-height:1.5;}
.tw-pr-divider{margin-top:16px;padding-top:16px;border-top:1px solid var(--tw-border-sub,#F1F2F7);}

/* Thẻ không nghiêng (gói Miễn phí, lịch sử, ghi chú): chỉ nhấc nhẹ khi hover cho đồng bộ cảm giác
   "nổi" với thẻ gói, không hơn. */
.tw-pr-lift{transition:transform .2s ease,box-shadow .2s ease;}
.tw-pr-lift:hover{transform:translateY(-2px);box-shadow:var(--tw-pr-shadow-hover);}

/* ---- Bảng so sánh ---------------------------------------------------------------------------- */
/* Bảng nằm trong khối cuộn ngang RIÊNG: trên điện thoại chỉ khối này trượt, cả trang không bị kéo
   ngang. Cột tiêu chí dính bên trái (sticky) và có nền ĐỤC để khi trượt các cột gói chui xuống
   dưới nó chứ không lẫn chữ vào nhau. */
.tw-pr-cmp{max-width:1040px;margin:0 auto;width:100%;}
.tw-pr-cmp-scroll{
  overflow-x:auto;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch;
  border:1px solid var(--tw-border,#ECEDF3);border-radius:16px;
  background:var(--tw-surface,#fff);
  background:color-mix(in srgb,var(--tw-surface,#fff) 88%,transparent);
  box-shadow:var(--tw-pr-shadow);
}
.tw-pr-table{width:100%;min-width:820px;border-collapse:separate;border-spacing:0;font-size:13.5px;color:var(--tw-text,#1E2230);}
.tw-pr-table th,.tw-pr-table td{padding:12px 14px;text-align:center;vertical-align:middle;border-bottom:1px solid var(--tw-border-sub,#F1F2F7);}
.tw-pr-table tbody tr:last-child th,.tw-pr-table tbody tr:last-child td{border-bottom:none;}
.tw-pr-table thead th{font-size:14px;font-weight:700;color:var(--tw-text,#1E2230);background:var(--tw-surface-muted,#FAFAFE);}
/* Mỗi cột gói rộng tối thiểu 150px: dòng hạn mức là một câu, hẹp hơn thì gãy thành 6–7 dòng và bảng
   cao gấp đôi mà vẫn khó đọc; giá không được ngắt dòng. */
.tw-pr-table thead th:not(:first-child){min-width:150px;}
.tw-pr-table td .tw-pr-price,.tw-pr-table td .tw-pr-unit{white-space:nowrap;}
.tw-pr-table th[scope="row"],.tw-pr-table thead th:first-child{
  position:sticky;left:0;z-index:1;text-align:left;min-width:170px;
  font-size:13px;font-weight:600;color:var(--tw-text-sub,#6B7280);
  background:var(--tw-surface,#fff);
  box-shadow:1px 0 0 var(--tw-border-sub,#F1F2F7);
}
.tw-pr-table thead th:first-child{background:var(--tw-surface-muted,#FAFAFE);}
.tw-pr-table .tw-pr-col--pop{background:var(--tw-pr-pop-tint);}
.tw-pr-cmp-tag{display:inline-block;margin-left:6px;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:600;vertical-align:middle;}
.tw-pr-cmp-tag--pop{color:#fff;background:${BRAND_GRADIENT};}
.tw-pr-cmp-tag--cur{color:${BRAND};background:rgba(108,92,231,.12);}
.tw-pr-yes{color:#16B98D;font-size:15px;}
.tw-pr-no{color:var(--tw-text-faint,#9AA3B5);}
/* Gợi ý "kéo ngang" chỉ hiện khi bảng thật sự rộng hơn màn hình. */
.tw-pr-cmp-hint{display:none;margin-top:8px;font-size:12.5px;color:var(--tw-text-faint,#9AA3B5);text-align:center;}
@media (max-width:700px){.tw-pr-cmp-hint{display:block;}}

/* ---- Điện thoại ------------------------------------------------------------------------------ */
@media (max-width:767px){
  .tw-pr-grid{grid-template-columns:1fr;gap:14px;}
  /* SÁU LUẬT NÀY THAY CHO isMobile ĐO BẮNG JAVASCRIPT.
     Grid.useBreakpoint() ở máy chủ trả toàn false, nên !screens.md luôn là true: HTML máy chủ của
     trang bảng giá LUÔN là bản điện thoại, kể cả với người đang mở màn 1440px — họ thấy chữ nhỏ một
     nhịp rồi bố cục nhảy sau khi hydrate. CSS thì đúng ngay từ khung hình đầu tiên.
     KHÔNG dùng dấu huyền ngược trong chú thích này: cả khối CSS nằm trong một template literal. */
  .tw-pr-stack{gap:18px !important;}
  .tw-pr-hero-title{font-size:23px !important;}
  .tw-pr-hero-sub{font-size:14px !important;}
  .tw-pr-cmp-wrap{padding:20px 14px 56px !important;}
  .tw-pr-card .ant-card-body{padding:18px !important;}
  .tw-pr-contact{max-width:94vw;}
  .tw-pr-price{font-size:26px;}
  .tw-pr-orb--c{top:1400px;}
  /* Cột tiêu chí dính chiếm 170px trên màn 350px thì chỉ còn nửa màn cho các gói — thu lại để mỗi
     lần kéo ngang thấy trọn ít nhất một cột gói. */
  .tw-pr-table th[scope="row"],.tw-pr-table thead th:first-child{min-width:128px;font-size:12.5px;}
  .tw-pr-table th,.tw-pr-table td{padding:10px 12px;}
}

/* ---- Giảm chuyển động: tắt HẾT, giữ nguyên bố cục ------------------------------------------- */
@media (prefers-reduced-motion: reduce){
  .tw-pr-rise{animation:none;}
  .tw-pr-lift{transition:none;}
  .tw-pr-lift:hover{transform:none;}
  .ant-card.tw-pr-card{transition:none;}
}
`;

function PricingStyles() {
  return (
    <style href="tw-pricing" precedence="default">
      {PRICING_CSS}
    </style>
  );
}

/**
 * Các lớp nền của ParallaxLayers. Khai báo ở module để mảng không bị tạo mới mỗi render.
 * `inset: 0` ghi đè inset -10% mặc định: lớp này trong suốt, chỉ có vài quầng trôi bên trong, nên
 * không sợ lộ mép khi dịch; giữ inset 0 thì toạ độ `top` của sàn lưới tính từ đúng đầu trang.
 * Độ sâu tăng dần theo "gần" hơn: sàn xa nhất (0.12) hầu như đứng yên, quầng gần (0.5) dịch nhiều.
 */
const PRICING_BG_LAYERS: ParallaxLayer[] = [
  // Nền WebGL chỉ cao bằng một khung nhìn ở đầu trang (không phủ cả trang dài — canvas 4000px là
  // vẽ thừa và tốn GPU), mờ dần ở mép dưới để tan vào sàn lưới CSS phía dưới.
  { depth: 0.04, style: { inset: 0, bottom: "auto", height: "100vh" }, node: <HeroShader /> },
  { depth: 0.12, style: { inset: 0 }, node: <div className="tw-pr-floor" /> },
  { depth: 0.3, style: { inset: 0 }, node: <div className="tw-pr-orb tw-pr-orb--a" /> },
  { depth: 0.5, style: { inset: 0 }, node: <div className="tw-pr-orb tw-pr-orb--b" /> },
  { depth: 0.4, style: { inset: 0 }, node: <div className="tw-pr-orb tw-pr-orb--c" /> },
];

/**
 * Ngôn ngữ của trang, cấp xuống cho MỌI component con trong tệp này.
 *
 * Vì sao context chứ không luồn prop: trang có bảy component con cùng cần dịch chữ (PlanCard,
 * FreeCard, PlanPrice, PlanCompare, ModelNote, PricingFooter, PaymentHistory…), và `PlanPrice`
 * còn nằm bên trong `PlanCard` lẫn `PlanCompare`. Luồn `lang` qua từng lớp là bảy chỗ phải nhớ,
 * và chỗ nào quên thì lặng lẽ rơi về tiếng Việt — đúng cái lỗi vừa sửa, chỉ nhỏ hơn.
 *
 * Đây KHÔNG thay i18n toàn app: nó chỉ mang ngôn ngữ mà MÁY CHỦ đã chọn xuống lượt kết xuất đầu
 * tiên. Sau khi mount, `useLangT` nhường lại cho context i18n thật (xem luật hai giai đoạn ở đó),
 * nên nút đổi ngôn ngữ vẫn đổi được cả trang.
 */
const NgonNguTrang = createContext<Locale | undefined>(undefined);

/** Dịch chữ theo ngôn ngữ của trang. Dùng trong mọi component con của tệp này. */
function useT() {
  return useLangT(useContext(NgonNguTrang));
}

export default function PricingClient({ lang }: { lang?: Locale }) {
  const { user, token } = useAuth();
  const router = useRouter();
  const { message, modal } = App.useApp();
  // `lang` là thứ MÁY CHỦ vừa quyết (từ `?lang=` rồi cookie). Dùng nó cho lượt kết xuất đầu tiên,
  // rồi nhường lại cho context sau khi mount — xem luật hai giai đoạn trong useLangT.
  const t = useLangT(lang);
  const locale = useNgonNguIsland(lang);
  const isAdmin = user?.role === "admin";
  // Anonymous visitor (public /pricing route). The authed subscription/payment
  // endpoints would 401, so render the static catalog + a "sign up to choose" CTA.
  const loggedOut = !user && !token;
  const goLogin = () => router.push("/login?next=/pricing");

  // Logged-out: seed the static catalog synchronously so the marketing view renders
  // immediately (no skeleton, no authed fetch). Logged-in: null + skeleton until load().
  const [sub, setSub] = useState<MeSubscription | null>(loggedOut ? ANON_SUB : null);
  const [loading, setLoading] = useState(!loggedOut);
  const [contactOpen, setContactOpen] = useState(false);
  const [pending, setPending] = useState<PlanId | null>(null);
  const [checkout, setCheckout] = useState<CreatePaymentResponse | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutLabel, setCheckoutLabel] = useState("");
  // Payment history (merged in from the old /billing page).
  const [payments, setPayments] = useState<Payment[]>([]);
  const [payLoading, setPayLoading] = useState(!loggedOut);

  const loadPayments = async () => {
    setPayLoading(true);
    try {
      setPayments(await api.payments());
    } catch {
      /* keep prior history */
    } finally {
      setPayLoading(false);
    }
  };

  // Bounded backoff so a first-load DURING a deploy (API restarting ~30–60s)
  // self-heals once the backend returns — mirrors useAuthProviders.ts.
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttempt = useRef(0);
  const RETRY_DELAYS = [1500, 3000, 6000, 10000];

  const load = async () => {
    setLoading(true);
    try {
      const [res] = await Promise.all([api.subscription(), loadPayments()]);
      setSub(res); // only overwrite `sub` on success — never blank the grid
      retryAttempt.current = 0;
      setLoading(false);
    } catch (e) {
      // Transient failure (API restarting mid-deploy): KEEP the last-known-good
      // `sub` on screen and retry with backoff instead of collapsing to an empty
      // grid. Keep `loading` true while a retry is pending so the first-load
      // skeleton stays (and an already-loaded grid stays mounted).
      const attempt = retryAttempt.current;
      if (attempt < RETRY_DELAYS.length) {
        retryAttempt.current = attempt + 1;
        if (retryTimer.current) clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(() => void load(), RETRY_DELAYS[attempt]);
      } else {
        // Retries exhausted — surface the error and let the inline retry card
        // (rendered when the catalog is still empty) offer a manual retry.
        message.error((e as Error).message);
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    // Logged-out marketing view is seeded synchronously via lazy initial state
    // (no token → the authed subscription/payment endpoints would 401), so skip load().
    if (loggedOut) return;
    void load();
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedOut]);

  const freePlanEnabled = sub?.freePlanEnabled !== false;

  const choose = async (planId: PlanId) => {
    // DOWNGRADE (target tier lower than current) → switch directly, NO payment.
    // (Upgrades go through the payment flow below, with proration server-side.)
    if (rankOf(planId) < rankOf(sub?.plan)) {
      if (planId === "free" && !freePlanEnabled) {
        message.info(t("money.freePaused", "Gói miễn phí đang tạm ngưng. Vui lòng chọn một gói trả phí."));
        return;
      }
      const label = catalog.find((c) => c.id === planId)?.label ?? planId;
      modal.confirm({
        title: t("money.downgrade", "Hạ gói"),
        content: `${t("money.downgradeConfirm1", "Chuyển xuống gói")} ${label}? ${t("money.downgradeConfirm2", "Bạn sẽ áp dụng quyền lợi gói mới (không hoàn tiền chu kỳ hiện tại).")}`,
        okText: t("money.downgrade", "Hạ gói"),
        cancelText: t("money.cancel", "Huỷ"),
        onOk: async () => {
          setPending(planId);
          try {
            const res = await api.setPlan(planId);
            setSub(res);
            message.success(`${t("money.switchedTo", "Đã chuyển sang gói")} ${res.planLabel}.`);
          } catch (e) {
            message.error((e as Error).message);
          } finally {
            setPending(null);
          }
        },
      });
      return;
    }
    // The free plan has no checkout — point users at support instead.
    if (planId === "free") {
      if (!freePlanEnabled) {
        message.info(
          t("money.freePaused", "Gói miễn phí đang tạm ngưng. Vui lòng chọn một gói trả phí."),
        );
        return;
      }
      setContactOpen(true);
      return;
    }
    // Open the modal IMMEDIATELY in a loading state (clearing any prior payment)
    // so switching plans never shows the previous plan's QR, and there's no lag.
    setCheckoutLabel(catalog.find((c) => c.id === planId)?.label ?? "");
    setCheckout(null);
    setCheckoutOpen(true);
    setPending(planId);
    try {
      const res = await api.createPayment(planId);
      // Bank not configured (no account / empty QR target) → fall back to the
      // fanpage contact flow instead of showing an unusable QR.
      if (!res.bank?.account || !res.qrUrl) {
        setCheckoutOpen(false);
        setContactOpen(true);
        return;
      }
      setCheckout(res);
    } catch (e) {
      setCheckoutOpen(false);
      message.error((e as Error).message);
    } finally {
      setPending(null);
    }
  };

  // Admins get a safe (demo) switch wired to the STUB POST /me/plan endpoint.
  const demoSwitch = async (plan: PlanId) => {
    setPending(plan);
    try {
      const res = await api.setPlan(plan);
      setSub(res);
      message.success(`${t("money.demoSwitched", "Đã đổi sang gói")} ${res.planLabel} (demo)`);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setPending(null);
    }
  };

  // Logged-out marketing view uses the static catalog — pick the EN mirror when the UI is English
  // (the server catalog for logged-in users is localized separately).
  const catalog =
    loggedOut && locale === "en" ? ANON_CATALOG_EN : sub?.catalog ?? [];
  const free = catalog.find((c) => c.id === "free");
  const paid = catalog.filter((c) => c.id !== "free");

  const body = (
    <Space direction="vertical" size={26} className="tw-pr-stack" style={{ width: "100%" }}>
      <PricingStyles />
      {/* Hero */}
      <div className="tw-pr-hero tw-pr-rise">
        <Tag
          icon={<ThunderboltOutlined />}
          style={{
            border: "none",
            color: "#fff",
            background: BRAND_GRADIENT,
            padding: "4px 12px",
            borderRadius: 999,
            fontWeight: 600,
            marginBottom: 14,
          }}
        >
          {t("money.pricingBadge", "Bảng giá Larkwave")}
        </Tag>
        {/* level={1}: trang này trước đây KHÔNG có <h1> nào — tiêu đề hero là h2, nên bộ soi báo
            "không có H1" ở cả ba cách đo. Cỡ chữ đặt tường minh ngay bên dưới nên đổi cấp không
            làm xê dịch gì về hình thức. */}
        <Title level={1} className="tw-pr-hero-title" style={{ margin: "0 0 10px", fontSize: 34 }}>
          {t("money.pricingTitle", "Chọn gói phù hợp với bạn")}
        </Title>
        <span className="tw-pr-hero-bar" aria-hidden="true" />
        <Paragraph type="secondary" className="tw-pr-hero-sub" style={{ fontSize: 15, margin: 0 }}>
          {t(
            "money.pricingSubtitle.lw",
            "Mỗi gói là một hạn mức dùng AI hàng tháng cho Trợ lý AI và Lark Agents. Nâng cấp bất cứ lúc nào để có thêm hạn mức, chạy hộ khi tắt máy và chia sẻ cho đồng đội.",
          )}
        </Paragraph>
      </div>

      {/* Promotional campaign banner (e.g. -50% with a countdown). */}
      {sub?.discount && discountActive(sub.discount, Date.now()) && (
        <CampaignBanner discount={sub.discount} />
      )}

      {/* Current plan + usage (merged from the old /billing page) — personalized, so
          hidden for logged-out visitors. */}
      {!loggedOut && (
        <div style={{ maxWidth: 1040, margin: "0 auto", width: "100%" }}>
          <UsageWidget variant="card" />
        </div>
      )}

      {/* Model / credit explainer */}
      <ModelNote />

      {/* Skeletons only on the FIRST load. Once sub is known, keep the cards
          mounted during refreshes (e.g. the post-payment subscription refresh)
          so the grid doesn't blank + reflow behind the open checkout modal —
          that reflow is what made the success modal "jump". */}
      {loading && !sub ? (
        <div className="tw-pr-grid">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="tw-pr-card">
              <Skeleton active paragraph={{ rows: 6 }} />
            </Card>
          ))}
        </div>
      ) : catalog.length === 0 ? (
        // Fetch never succeeded (a successful response always carries plans), so
        // this is a transient outage — show a retry card instead of a silent
        // empty area that blanks every upgrade CTA during a deploy.
        <Card
          className="tw-pr-card"
          style={{ maxWidth: 1040, margin: "0 auto", width: "100%" }}
          styles={{ body: { padding: 28 } }}
        >
          <Empty
            image={<InboxOutlined style={{ fontSize: 48, color: "var(--tw-text-faint, #C7CCD9)" }} />}
            styles={{ image: { height: 56 } }}
            description={
              <span style={{ color: "var(--tw-text-sub, #6B7280)" }}>
                {t("money.pricingLoadFailed", "Không tải được bảng giá — thử lại")}
              </span>
            }
          >
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              loading={loading}
              onClick={() => {
                retryAttempt.current = 0;
                void load();
              }}
            >
              {t("money.retry", "Thử lại")}
            </Button>
          </Empty>
        </Card>
      ) : (
        <>
          {/* 3 paid plans — prominent */}
          <div className="tw-pr-grid">
            {paid.map((plan, i) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                riseIndex={i}
                isCurrent={!loggedOut && sub?.plan === plan.id}
                isDowngrade={!loggedOut && rankOf(plan.id) < rankOf(sub?.plan)}
                upgradeQuote={loggedOut ? undefined : sub?.upgrade?.[plan.id]}
                currentLabel={sub?.planLabel}
                popular={plan.id === POPULAR_PLAN}
                isAdmin={isAdmin}
                loggedOut={loggedOut}
                pending={pending === plan.id}
                onChoose={() => (loggedOut ? goLogin() : choose(plan.id))}
                onDemoSwitch={() => demoSwitch(plan.id)}
              />
            ))}
          </div>

          {/* Free plan — smaller, full-width strip */}
          {free && (
            <FreeCard
              plan={free}
              isCurrent={!loggedOut && sub?.plan === "free"}
              isAdmin={isAdmin}
              loggedOut={loggedOut}
              pending={pending === "free"}
              available={freePlanEnabled}
              onChoose={() => (loggedOut ? goLogin() : choose("free"))}
              onDemoSwitch={() => demoSwitch("free")}
            />
          )}

          {/* Bảng so sánh — CÙNG số liệu với thẻ gói, chỉ xếp cạnh nhau. */}
          <PlanCompare catalog={catalog} currentPlan={loggedOut ? null : sub?.plan ?? null} />
        </>
      )}

      <CheckoutModal
        open={checkoutOpen}
        planLabel={checkoutLabel}
        payment={checkout}
        onClose={() => {
          setCheckoutOpen(false);
          setCheckout(null);
        }}
        onActivated={() => {
          void load();
        }}
      />

      <Modal
        open={contactOpen}
        className="tw-pr-contact"
        width={520}
        onCancel={() => setContactOpen(false)}
        footer={[
          <Button key="close" onClick={() => setContactOpen(false)}>
            {t("money.close", "Đóng")}
          </Button>,
          <Button
            key="fanpage"
            type="primary"
            icon={<FacebookFilled />}
            href={FANPAGE_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("money.messageFanpage", "Nhắn fanpage")}
          </Button>,
        ]}
        title={t("money.activatePlan", "Kích hoạt gói")}
      >
        <Paragraph style={{ marginBottom: 0 }}>
          {t(
            "money.activatePlanDesc",
            "Để kích hoạt gói, thanh toán & liên hệ qua fanpage Facebook của Larkwave. Đội ngũ sẽ nâng cấp tài khoản của bạn ngay sau khi xác nhận.",
          )}
        </Paragraph>
      </Modal>

      {/* Payment history (merged from the old /billing page) — personalized, hidden
          for logged-out visitors. */}
      {!loggedOut && (
        <div style={{ maxWidth: 1040, margin: "0 auto", width: "100%" }}>
          <PaymentHistory payments={payments} loading={payLoading} onReload={loadPayments} />
        </div>
      )}

      {/* Footer — support / contact */}
      <PricingFooter />
    </Space>
  );

  // Nền có chiều sâu bọc TOÀN BỘ nội dung trang (không chỉ hero) để các thẻ kính ở giữa trang vẫn
  // thấy quầng sáng thấp thoáng phía sau. Biên độ 90px theo cuộn / 32px theo chuột (đợt trước 28/10
  // không ai nhận ra có lớp). tilt=0: sân khấu cao bằng cả trang, nghiêng dù 1° cũng làm quầng ở
  // cuối trang văng đi hàng trăm px.
  // CursorGlow phủ toàn khung nhìn (fixed, pointer-events: none) — gắn ở đây thay vì layout vì chỉ
  // trang này muốn nó; tự ẩn trên cảm ứng và khi giảm chuyển động.
  const withDepth = (inner: React.ReactNode) => (
    <>
      <CursorGlow />
      <ParallaxLayers layers={PRICING_BG_LAYERS} scrollRange={90} mouseRange={32} tilt={0} className="tw-pr-page">
        {inner}
      </ParallaxLayers>
    </>
  );

  // MỘT vỏ duy nhất cho mọi người xem — không còn nhánh "đã đăng nhập thì mặc vỏ dashboard".
  //
  // Trước đây trang này tự đổi khung sang AppShell ngay khi `useAuth` trả về người dùng: URL vẫn
  // là /pricing nhưng mắt người dùng thấy đúng là bị ném vào bảng điều khiển. Chủ sản phẩm gọi
  // thẳng đó là sai (24/09/2026): bảng giá là trang giới thiệu, không phải màn hình trong app.
  //
  // Nó cũng mâu thuẫn với nguyên tắc đã ghi sẵn ở proxy.ts cho "/": đã đăng nhập thì vẫn cần đọc
  // trang giới thiệu, xem bảng giá, đọc chính sách — việc cần làm không phải đổi khung cho họ, mà là ĐỔI PHẦN
  // ĐẦU TRANG để hiện tài khoản (LandingHeader đã làm việc đó).
  //
  // Lợi thêm: một liên kết /pricing chia sẻ cho nhau nay mở ra CÙNG một thứ với mọi người, thay vì
  // hai bộ mặt tuỳ trạng thái đăng nhập mà người gửi không hề biết.
  return (
    <NgonNguTrang.Provider value={lang}>
      <ForceDark>
        <LandingHeader lang={lang} />
        {withDepth(
          <div className="tw-pr-cmp-wrap" style={{ maxWidth: 1120, margin: "0 auto", padding: "32px 24px 72px" }}>
            {body}
          </div>,
        )}
        <LandingFooter lang={lang} />
      </ForceDark>
    </NgonNguTrang.Provider>
  );
}

/** Transaction history table — merged in from the old standalone /billing page. */
function PaymentHistory({
  payments,
  loading,
  onReload,
}: {
  payments: Payment[];
  loading: boolean;
  onReload: () => void;
}) {
  const t = useT();
  const columns: ColumnsType<Payment> = [
    {
      title: t("money.colDate", "Ngày"),
      dataIndex: "createdAt",
      key: "createdAt",
      width: 170,
      render: (v: string) => <Text>{formatDate(v)}</Text>,
    },
    {
      title: t("money.colPlan", "Gói"),
      dataIndex: "planLabel",
      key: "planLabel",
      render: (v: string) => (
        <Tag color="purple" bordered={false}>
          {v}
        </Tag>
      ),
    },
    {
      title: t("money.colAmount", "Số tiền"),
      dataIndex: "amountVnd",
      key: "amountVnd",
      align: "right",
      render: (v: number) => (
        <Text strong style={{ color: "var(--tw-text, #1E2230)" }}>
          {formatVnd(v)}
        </Text>
      ),
    },
    {
      title: t("money.colStatus", "Trạng thái"),
      dataIndex: "status",
      key: "status",
      width: 150,
      render: (v: Payment["status"]) =>
        v === "paid" ? (
          <Tag color="success" bordered={false}>
            {t("money.paidStatus", "Đã thanh toán")}
          </Tag>
        ) : (
          <Tag color="warning" bordered={false}>
            {t("money.pendingStatus", "Chờ thanh toán")}
          </Tag>
        ),
    },
    {
      title: t("money.colCode", "Mã"),
      dataIndex: "code",
      key: "code",
      render: (v: string) => (
        <Text code style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
          {v}
        </Text>
      ),
    },
  ];
  return (
    <Card
      className="tw-pr-card"
      styles={{ body: { padding: payments.length || loading ? 0 : 20 } }}
      style={{ overflow: "hidden" }}
      title={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <CreditCardOutlined style={{ color: BRAND }} />
          {t("money.paymentHistory", "Lịch sử thanh toán")}
        </span>
      }
      extra={
        <Button
          type="text"
          size="small"
          icon={<ReloadOutlined />}
          loading={loading}
          onClick={onReload}
        >
          {t("money.reload", "Tải lại")}
        </Button>
      }
    >
      {!loading && payments.length === 0 ? (
        <Empty
          image={<InboxOutlined style={{ fontSize: 48, color: "var(--tw-text-faint, #C7CCD9)" }} />}
          styles={{ image: { height: 56 } }}
          description={
            <span style={{ color: "var(--tw-text-sub, #6B7280)" }}>
              {t("money.noTransactions", "Chưa có giao dịch nào. Chọn một gói ở trên để bắt đầu.")}
            </span>
          }
        />
      ) : (
        <Table<Payment>
          rowKey="id"
          columns={columns}
          dataSource={payments}
          loading={loading}
          pagination={false}
          scroll={{ x: 640 }}
        />
      )}
    </Card>
  );
}

/** Eye-catching promo banner: "-N% có thời hạn" + a live countdown to the deadline. */
function CampaignBanner({ discount }: { discount: DiscountInfo }) {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!discount.until) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [discount.until]);

  // Hide automatically the moment the campaign expires.
  if (!discountActive(discount, now)) return null;

  const remaining = discount.until ? Math.max(0, Date.parse(discount.until) - now) : null;
  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const pad = (n: number) => String(n).padStart(2, "0");
    const hms = `${pad(Math.floor((s % 86400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(
      s % 60,
    )}`;
    return d > 0 ? `${d} ${t("money.days", "ngày")} ${hms}` : hms;
  };

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: "14px 22px",
        borderRadius: 16,
        color: "#fff",
        background: "linear-gradient(135deg, #FF8A4C 0%, #F5365C 100%)",
        boxShadow: "0 12px 30px rgba(245,54,92,0.22)",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 15.5, fontWeight: 700 }}>
        <FireOutlined style={{ fontSize: 20 }} />
        {discount.label?.trim() || `${t("money.discountLabel", "Ưu đãi giảm")} ${discount.percent}%`} — {t("money.appliesAllPaid", "áp dụng cho mọi gói trả phí")}
      </span>
      {remaining != null && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(255,255,255,0.22)",
            padding: "5px 14px",
            borderRadius: 999,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <ClockCircleOutlined /> {t("money.endsIn", "Kết thúc sau")} {fmt(remaining)}
        </span>
      )}
    </div>
  );
}

/** Explains the % usage model right under the hero. */
function ModelNote() {
  const t = useT();
  return (
    <Card
      className="tw-pr-card tw-pr-lift"
      style={{
        // Sắc tím rất nhạt phủ lên bề mặt theme: cùng một rgba đọc được ở cả nền sáng lẫn tối.
        background: "rgba(108,92,231,0.06)",
        borderColor: "rgba(108,92,231,0.22)",
        maxWidth: 1040,
        margin: "0 auto",
        width: "100%",
      }}
      styles={{ body: { padding: "14px 18px" } }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 12,
          justifyContent: "center",
          textAlign: "center",
        }}
      >
        <Text style={{ fontSize: 13.5, color: "var(--tw-text, #1E2230)" }}>
          {t("money.modelNote1", "Mỗi gói có ")}
          <Text strong>{t("money.modelNoteQuota", "hạn mức hàng tháng")}</Text>
          {t("money.modelNote2.lw", ". Mỗi lượt chạy trên Claude của Larkwave dùng một phần ")}
          <Text strong>{t("money.modelNotePercent", "% của gói")}</Text>
          {t("money.modelNote3.lw", " theo khối lượng thực tế. Chạy bằng AI ")}
          <Text strong>{t("money.modelNoteLocal.lw", "cài trên máy bạn")}</Text>
          {t("money.modelNote4.lw", " (Claude, Codex, Gemini, Grok) thì không tính vào hạn mức.")}
        </Text>
      </div>
    </Card>
  );
}

/** Persistent support footer on /pricing pointing at the Facebook fanpage. */
function PricingFooter() {
  const t = useT();
  return (
    <div
      style={{
        textAlign: "center",
        paddingTop: 8,
        borderTop: "1px solid var(--tw-border, #ECEDF3)",
        marginTop: 4,
      }}
    >
      <Text type="secondary" style={{ fontSize: 13 }}>
        {t("money.contactSupport", "Liên hệ / Hỗ trợ")}:{" "}
        <a
          href={FANPAGE_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <FacebookFilled style={{ color: "#1877F2" }} />
          {t("money.facebookFanpage", "fanpage Facebook")}
        </a>
      </Text>
    </div>
  );
}

/**
 * Dòng đầu của `features` luôn là dòng hạn mức tháng và đã được in RIÊNG ở trên (cả thẻ gói, dải
 * gói Miễn phí lẫn bảng so sánh), nên danh sách chi tiết bỏ đúng dòng đó.
 *
 * Không lọc bằng mẫu chữ như bản trước ("hạn mức"…): dòng "không tính hạn mức" của gói Miễn phí
 * cũng chứa chữ đó và sẽ bị nuốt mất. Thứ tự dòng là hợp đồng của apps/api/src/billing/plans.ts.
 */
function detailFeatures(features: string[]): string[] {
  return features.slice(1);
}

/** storageMb → "5 GB" (gói luôn là bội số của 1 GB). */
function formatGb(mb: number): string {
  const gb = mb / 1024;
  return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
}

function FeatureLine({ children }: { children: React.ReactNode }) {
  return (
    <li className="tw-pr-feature">
      <CheckOutlined style={{ color: "#16B98D", marginTop: 3, fontSize: 12 }} />
      <span>{children}</span>
    </li>
  );
}

/** Giá của một gói: giá gạch + giá khuyến mãi khi có chiến dịch, còn không thì giá niêm yết. */
function PlanPrice({ plan, compact }: { plan: PlanCatalogEntry; compact?: boolean }) {
  const t = useT();
  const onSale = plan.discountedVnd != null && plan.discountedVnd < plan.priceVnd;
  if (onSale && plan.discountedVnd != null) {
    return (
      <div style={{ marginTop: compact ? 0 : 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: compact ? "center" : undefined }}>
          <span className="tw-pr-strike">{formatVnd(plan.priceVnd)}</span>
          <Tag color="error" style={{ margin: 0, fontWeight: 700 }}>
            -{Math.round((1 - plan.discountedVnd / plan.priceVnd) * 100)}%
          </Tag>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 2, justifyContent: compact ? "center" : undefined }}>
          <span className={compact ? "tw-pr-price tw-pr-price--sale" : "tw-pr-price tw-pr-price--sale"} style={compact ? { fontSize: 16 } : undefined}>
            {formatVnd(plan.discountedVnd)}
          </span>
          <span className="tw-pr-unit" style={compact ? { fontSize: 12 } : undefined}>{t("money.perMonth", "/tháng")}</span>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: compact ? 0 : 8, justifyContent: compact ? "center" : undefined }}>
      <span className="tw-pr-price" style={compact ? { fontSize: 16 } : undefined}>{formatVnd(plan.priceVnd)}</span>
      <span className="tw-pr-unit" style={compact ? { fontSize: 12 } : undefined}>{t("money.perMonth", "/tháng")}</span>
    </div>
  );
}

function PlanCard({
  plan,
  riseIndex,
  isCurrent,
  isDowngrade,
  upgradeQuote,
  currentLabel,
  popular,
  isAdmin,
  loggedOut,
  pending,
  onChoose,
  onDemoSwitch,
}: {
  plan: PlanCatalogEntry;
  /** Thứ tự trong hàng — thẻ sau hiện trễ hơn thẻ trước một nhịp nhỏ. */
  riseIndex: number;
  isCurrent: boolean;
  isDowngrade?: boolean;
  upgradeQuote?: UpgradeQuote;
  currentLabel?: string;
  popular: boolean;
  isAdmin: boolean;
  loggedOut?: boolean;
  pending: boolean;
  onChoose: () => void;
  onDemoSwitch: () => void;
}) {
  const t = useT();
  const accent = PLAN_ACCENT[plan.id];
  // Show the prorated upgrade price only on a genuine upgrade target (not the
  // current plan, not a downgrade).
  const showUpgrade = !!upgradeQuote && !isCurrent && !isDowngrade;
  const ctaPrimary = (popular || showUpgrade || loggedOut) && !isDowngrade;
  const riseClass = `tw-pr-rise tw-pr-rise-${Math.min(3, riseIndex + 1)}`;
  return (
    <div className={popular ? `tw-pr-slot tw-pr-slot--popular ${riseClass}` : `tw-pr-slot ${riseClass}`}>
      {/* Gói được khuyên dùng nghiêng sâu hơn và nổi cao hơn một chút; các gói còn lại nghiêng
          ít hơn — chênh lệch đó là thứ làm nó "nổi bật" chứ không phải màu sắc loè loẹt. 16°/13°
          thay vì 18° mặc định: thẻ toàn số, nghiêng quá là con số khó đối chiếu giữa các cột. */}
      <TiltCard
        maxTilt={popular ? 16 : 13}
        scale={popular ? 1.04 : 1.02}
        className={popular ? "tw-pr-tilt tw-pr-tilt--popular" : "tw-pr-tilt"}
      >
        <Card
          className={popular ? "tw-pr-card tw-pr-card--popular" : "tw-pr-card"}
          style={{
            border: popular
              ? undefined
              : isCurrent
                ? "1.5px solid rgba(108,92,231,0.45)"
                : undefined,
            position: "relative",
            height: "100%",
            overflow: "visible",
          }}
          styles={{ body: { padding: 22, display: "flex", flexDirection: "column", height: "100%" } }}
        >
          {popular && (
            <Tag
              icon={<StarFilled />}
              style={{
                position: "absolute",
                top: -12,
                left: "50%",
                transform: "translateX(-50%)",
                border: "none",
                color: "#fff",
                background: BRAND_GRADIENT,
                padding: "3px 14px",
                borderRadius: 999,
                fontWeight: 600,
                margin: 0,
                boxShadow: "0 6px 16px rgba(108,92,231,0.30)",
              }}
            >
              {t("money.popular", "Phổ biến")}
            </Tag>
          )}

          <div className="tw-pr-plan-head">
            <span className="tw-pr-plan-icon" style={{ background: `${accent}1F`, color: accent }}>
              <CrownOutlined />
            </span>
            {/* level 2: trang đi h1 → h4 → h5, nhảy hai cấp. Tên gói là mục cấp một dưới h1. */}
            <Title level={2} style={{ margin: 0 }}>
              {plan.label}
            </Title>
          </div>

          <PlanPrice plan={plan} />

          {showUpgrade && upgradeQuote && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 12px",
                borderRadius: 10,
                background: "rgba(22,185,141,0.08)",
                border: "1px solid rgba(22,185,141,0.25)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <ThunderboltOutlined style={{ color: "#0E9F73" }} />
                <Text strong style={{ color: "#0E9F73", fontSize: 13 }}>
                  {t("money.upgradeTodayOnly", "Nâng cấp hôm nay chỉ")}
                </Text>
                <span style={{ fontSize: 18, fontWeight: 800, color: "#0E9F73" }}>
                  {formatVnd(upgradeQuote.amountVnd)}
                </span>
                {upgradeQuote.savingVnd > 0 && (
                  <Tag color="success" bordered={false} style={{ margin: 0 }}>
                    {t("money.discountSave", "tiết kiệm")} {formatVnd(upgradeQuote.savingVnd)}
                  </Tag>
                )}
              </div>
              <Text type="secondary" style={{ fontSize: 11.5 }}>
                {t("money.proratedPre", "Đã trừ phần còn lại của gói")} {currentLabel ?? t("money.current", "hiện tại")}. {t("money.keepRenewal", "Giữ nguyên ngày gia hạn.")}
              </Text>
            </div>
          )}

          <div className="tw-pr-divider">
            <ul className="tw-pr-features">
              <FeatureLine>
                <Text strong>{plan.features[0] ?? t("money.monthlyQuota", "Hạn mức hàng tháng")}</Text>
              </FeatureLine>
              <FeatureLine>
                <Text strong>{formatGb(plan.storageMb)}</Text> {t("money.storageIncluded.lw", "dung lượng lưu trữ")}
              </FeatureLine>
              {detailFeatures(plan.features).map((f) => (
                <FeatureLine key={f}>{f}</FeatureLine>
              ))}
            </ul>
          </div>

          <div style={{ flex: 1 }} />

          <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 8 }}>
            {isCurrent ? (
              <Button block size="large" disabled>
                {t("money.currentPlan", "Gói hiện tại")}
              </Button>
            ) : (
              <Button
                block
                size="large"
                type={ctaPrimary ? "primary" : "default"}
                className={popular && ctaPrimary ? "tw-pr-cta-pop" : undefined}
                loading={pending}
                onClick={onChoose}
              >
                {loggedOut
                  ? t("money.signUpToChoose", "Đăng ký để chọn gói")
                  : isDowngrade
                    ? t("money.downgrade", "Hạ gói")
                    : showUpgrade && upgradeQuote
                      ? `${t("money.upgrade", "Nâng cấp")} · ${formatVnd(upgradeQuote.amountVnd)}`
                      : t("money.choosePlan", "Chọn gói")}
              </Button>
            )}
            {isAdmin && !isCurrent && (
              <Button
                block
                size="small"
                type="link"
                loading={pending}
                onClick={onDemoSwitch}
              >
                {t("money.switchNowDemo", "Đổi ngay (demo)")}
              </Button>
            )}
          </div>
        </Card>
      </TiltCard>
    </div>
  );
}

function FreeCard({
  plan,
  isCurrent,
  isAdmin,
  loggedOut,
  pending,
  available,
  onChoose,
  onDemoSwitch,
}: {
  plan: PlanCatalogEntry;
  isCurrent: boolean;
  isAdmin: boolean;
  loggedOut?: boolean;
  pending: boolean;
  available: boolean;
  onChoose: () => void;
  onDemoSwitch: () => void;
}) {
  const t = useT();
  return (
    // Dải rộng nằm ngang thì KHÔNG nghiêng: TiltCard trên một khối rộng gấp 4 lần cao trông như
    // cánh cửa bập bênh; chỉ nhấc nhẹ khi hover cho cùng ngôn ngữ với các thẻ trên.
    <Card
      className="tw-pr-card tw-pr-lift"
      style={{
        border: isCurrent ? "1.5px solid rgba(108,92,231,0.45)" : undefined,
        opacity: available ? 1 : 0.85,
        maxWidth: 1040,
        margin: "0 auto",
        width: "100%",
      }}
      styles={{ body: { padding: 20 } }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 16,
          justifyContent: "space-between",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* level 3: nằm TRONG một mục cấp hai, nên đây là cấp ba — không nhảy cấp. */}
            <Title level={3} style={{ margin: 0 }}>
              {plan.label}
            </Title>
            {available ? (
              <Tag style={{ margin: 0 }}>{t("money.free", "Miễn phí")}</Tag>
            ) : (
              <Tag color="default" style={{ margin: 0 }}>
                {t("money.paused", "Tạm ngưng")}
              </Tag>
            )}
          </div>
          <Text type="secondary" style={{ fontSize: 13.5 }}>
            {available
              ? `${plan.features[0] ?? t("money.monthlyQuota", "Hạn mức hàng tháng")} · ${formatGb(plan.storageMb)} ${t("money.storageIncluded.lw", "dung lượng lưu trữ")}${
                  detailFeatures(plan.features).length
                    ? ` · ${detailFeatures(plan.features).join(" · ")}`
                    : ""
                }`
              : t("money.freePausedLong", "Gói miễn phí hiện đang tạm ngưng — vui lòng chọn một gói trả phí ở trên.")}
          </Text>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <span className="tw-pr-price" style={{ fontSize: 22 }}>
            {formatVnd(plan.priceVnd)}
            <span className="tw-pr-unit" style={{ fontSize: 13, fontWeight: 400 }}> {t("money.perMonth", "/tháng")}</span>
          </span>
          {!available ? (
            <Button disabled>{t("money.paused", "Tạm ngưng")}</Button>
          ) : isCurrent ? (
            <Button disabled>{t("money.currentPlan", "Gói hiện tại")}</Button>
          ) : loggedOut ? (
            <Button type="primary" onClick={onChoose}>
              {t("money.signUpToChoose", "Đăng ký để chọn gói")}
            </Button>
          ) : (
            <Button onClick={onChoose}>{t("money.choosePlan", "Chọn gói")}</Button>
          )}
          {isAdmin && !isCurrent && available && (
            <Button type="link" size="small" loading={pending} onClick={onDemoSwitch}>
              {t("money.switchNowDemo", "Đổi ngay (demo)")}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

/**
 * Quyền lợi theo HẠNG gói (0 = Miễn phí … 3 = Doanh nghiệp), đối chiếu tay với
 * apps/api/src/billing/plans.ts. Mỗi dòng có hạng thấp nhất được hưởng — gói trên luôn có đủ quyền
 * của gói dưới, nên ma trận ✓/— không bao giờ hiện gói đắt "thiếu" thứ gói rẻ có (lỗi của cách dựng
 * ma trận từ chuỗi `features`, nơi có dòng "Mọi tính năng gói Khởi đầu"). Sửa plans.ts thì sửa ở đây.
 */
const COMPARE_ROWS: { key: string; label: string; minRank: number }[] = [
  { key: "money.cmpLarkAgents.lw", label: "Lark Agents (Bitable, Docs, Sheets, Wiki, Drive, Lịch, Tin nhắn)", minRank: 0 },
  { key: "money.cmpLocalAi.lw", label: "Chạy bằng AI trên máy bạn — không tính hạn mức", minRank: 0 },
  { key: "money.cmpAssistant.lw", label: "Trợ lý AI · Kỹ năng · Artifacts", minRank: 0 },
  { key: "money.cmpHostedClaude.lw", label: "Claude do Larkwave cung cấp (không cần cài)", minRank: 1 },
  { key: "money.cmpSchedule.lw", label: "Tự động hoá theo lịch · Đặc tả · Xuất tệp", minRank: 1 },
  { key: "money.cmpRemote.lw", label: "Điều khiển desktop từ điện thoại/web", minRank: 1 },
  { key: "money.cmpHosted.lw", label: "Larkwave chạy hộ khi máy bạn tắt", minRank: 2 },
  { key: "money.cmpCms.lw", label: "Đồng bộ CMS Bitable nhiều tài khoản Lark", minRank: 2 },
  { key: "money.cmpShare.lw", label: "Chia sẻ trợ lý cho đồng đội", minRank: 2 },
];

/** Kênh hỗ trợ theo hạng gói — cùng thứ tự với plans.ts. */
const SUPPORT_BY_RANK: { key: string; label: string }[] = [
  { key: "money.supportCommunity.lw", label: "Cộng đồng" },
  { key: "money.supportEmail.lw", label: "Email" },
  { key: "money.supportPriority.lw", label: "Ưu tiên" },
  { key: "money.supportSla.lw", label: "Riêng (SLA)" },
];

/**
 * Bảng so sánh nhanh: giá, dòng hạn mức, dung lượng (cùng số liệu thẻ gói đã hiện) cộng ma trận
 * quyền lợi theo hạng ở trên.
 *
 * Cố ý KHÔNG in `monthlyTokens`: con số nội bộ, người dùng chỉ thấy % (xem PlanCatalogEntry).
 */
function PlanCompare({ catalog, currentPlan }: { catalog: PlanCatalogEntry[]; currentPlan: PlanId | null }) {
  const t = useT();
  if (catalog.length === 0) return null;
  const colClass = (p: PlanCatalogEntry) => (p.id === POPULAR_PLAN ? "tw-pr-col--pop" : undefined);
  return (
    <section className="tw-pr-cmp" aria-labelledby="tw-pr-cmp-title">
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        {/* level 2: <section> bên trên dùng aria-labelledby trỏ vào đây, nên nó là tiêu đề của
            cả một mục cấp một. */}
        <Title level={2} id="tw-pr-cmp-title" style={{ margin: "0 0 4px" }}>
          {t("money.compareTitle", "So sánh nhanh các gói")}
        </Title>
        <Text type="secondary" style={{ fontSize: 13.5 }}>
          {t("money.compareSub.lw", "Giá, hạn mức và quyền lợi của từng gói, xếp cạnh nhau để dễ đối chiếu.")}
        </Text>
      </div>
      <div className="tw-pr-cmp-scroll">
        <table className="tw-pr-table">
          <thead>
            <tr>
              <th scope="col">{t("money.compareCriteria", "Tiêu chí")}</th>
              {catalog.map((p) => (
                <th scope="col" key={p.id} className={colClass(p)}>
                  {p.label}
                  {p.id === POPULAR_PLAN && (
                    <span className="tw-pr-cmp-tag tw-pr-cmp-tag--pop">{t("money.popular", "Phổ biến")}</span>
                  )}
                  {currentPlan === p.id && (
                    <span className="tw-pr-cmp-tag tw-pr-cmp-tag--cur">{t("money.currentPlan", "Gói hiện tại")}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">{t("money.comparePrice", "Giá / tháng")}</th>
              {catalog.map((p) => (
                <td key={p.id} className={colClass(p)}>
                  <PlanPrice plan={p} compact />
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">{t("money.monthlyQuota", "Hạn mức hàng tháng")}</th>
              {catalog.map((p) => (
                <td key={p.id} className={colClass(p)}>
                  {p.features[0] ?? t("money.monthlyQuota", "Hạn mức hàng tháng")}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">{t("money.compareStorage.lw", "Dung lượng lưu trữ")}</th>
              {catalog.map((p) => (
                <td key={p.id} className={colClass(p)}>
                  <Text strong>{formatGb(p.storageMb)}</Text>
                </td>
              ))}
            </tr>
            {COMPARE_ROWS.map((row) => (
              <tr key={row.key}>
                <th scope="row">{t(row.key, row.label)}</th>
                {catalog.map((p) => (
                  <td key={p.id} className={colClass(p)}>
                    {rankOf(p.id) >= row.minRank ? (
                      <CheckOutlined className="tw-pr-yes" aria-label={t("money.compareYes", "Có")} />
                    ) : (
                      <MinusOutlined className="tw-pr-no" aria-label={t("money.compareNo", "Không")} />
                    )}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <th scope="row">{t("money.compareSupport.lw", "Hỗ trợ")}</th>
              {catalog.map((p) => {
                const s = SUPPORT_BY_RANK[Math.min(SUPPORT_BY_RANK.length - 1, rankOf(p.id))];
                return (
                  <td key={p.id} className={colClass(p)}>
                    {t(s.key, s.label)}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--tw-text-faint, #9AA3B5)", textAlign: "center" }}>
        {t("money.storageAddonNote.lw", "Cần thêm chỗ lưu tệp? Mua thêm 1 GB với 100.000đ/tháng ở trang Dung lượng — áp dụng cho mọi gói.")}
      </div>
      <div className="tw-pr-cmp-hint">{t("money.compareScrollHint", "Kéo ngang để xem đủ các gói")}</div>
    </section>
  );
}
