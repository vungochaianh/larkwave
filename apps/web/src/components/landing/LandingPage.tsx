"use client";

import {
  ApiOutlined,
  ArrowRightOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
  CodeOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  DesktopOutlined,
  EditOutlined,
  FileDoneOutlined,
  FilePdfOutlined,
  GlobalOutlined,
  PictureOutlined,
  PlayCircleOutlined,
  ReadOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  ShoppingCartOutlined,
  SolutionOutlined,
  TableOutlined,
  ThunderboltOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { BlogPostListItem } from "@larkwave/shared";
import { OK, V, type Locale } from "@larkwave/ui";
import { useLangT, useNgonNguIsland } from "@/lib/useLangT";
import { api } from "@/lib/api";
import Reveal from "@/components/Reveal";
import { CursorGlow, HeroShader, Magnetic, ParallaxLayers, TiltCard, type ParallaxLayer } from "@/components/fx";
import { LandingHeader, LandingFooter } from "@/components/LandingChrome";
import { FAQS } from "@/app/welcome/content";

const BRAND = "#6C5CE7";
const GRADIENT =
  "linear-gradient(120deg, #6C5CE7 0%, #A66BFF 40%, #FF7AB6 70%, #4FB6FF 100%)";

/**
 * TRANG CHỦ — định vị BỐN TRỤ CỘT: trợ lý AI trả về tệp thật · tạo web app full-stack · video/ảnh/
 * bài viết · tự động hoá Lark Base. Sản phẩm dùng được ở mọi nơi (giao diện Việt/Anh tự theo trình
 * duyệt); tiếng Việt là thế mạnh được nêu ra, không phải điều kiện để dùng.
 *
 * Nguyên tắc viết: mỗi câu phải có thật và kiểm được trong mã nguồn. Landing nói quá là cách nhanh
 * nhất mất niềm tin, nên những giới hạn quan trọng (Lark cần app máy tính, lịch đăng gửi qua
 * Telegram, app cần máy chủ riêng ở gói Chuyên nghiệp) được viết THẲNG vào mô tả thay vì giấu đi.
 * Vài con số đã đối chiếu: 54 công cụ Lark (đếm `name:` trong desktop/main/runtime/lark/tools),
 * gói và quyền lợi theo apps/api/src/billing/plans.ts (KHÔNG có gói "Maker"; gỡ nhãn là Pro+).
 *
 * BẪY i18n — lý do lần trước 21/57 câu trên trang thật khác mã nguồn: `t(key, fallback)` ƯU TIÊN
 * bảng `MESSAGES` trong packages/ui/src/i18n.tsx; câu thứ hai chỉ hiện khi THIẾU khoá. Vì vậy mọi
 * khoá `home.lp*` ở đây đều có cả `vi` lẫn `en` trong bảng, và `vi` phải khớp từng chữ với câu dự
 * phòng — sửa chữ ở đây mà không sửa bảng thì khách vẫn thấy câu cũ. Trong mọi object, trường
 * `xKey` luôn đứng NGAY TRƯỚC trường `x` để script đo lệch bắt được cặp (khoá, câu).
 */

/** Bốn trụ cột: mỗi thẻ có mô tả, ba điểm kiểm được, một giới hạn (nếu có) và một nút. */
const PILLARS: {
  n: string;
  icon: ReactNode;
  accent: string;
  titleKey: string;
  title: string;
  descKey: string;
  desc: string;
  bullets: { key: string; text: string }[];
  noteKey?: string;
  note?: string;
  ctaKey: string;
  cta: string;
  href: string;
}[] = [
  {
    n: "01",
    icon: <RobotOutlined />,
    accent: "#A66BFF",
    titleKey: "home.lpP1Title",
    title: "Trợ lý AI làm ra sản phẩm thật",
    descKey: "home.lpP1Desc",
    desc: "Không chỉ trả lời. Gửi cho nó bảng tính, PDF, Word hay ảnh — nó đọc rồi trả về đúng tệp bạn cần. Chạy trên máy chủ: mở trình duyệt là dùng, không phải cài gì.",
    bullets: [
      { key: "home.lpP1B1", text: "Đọc Excel, Word, PDF, ảnh; trả về tệp để tải" },
      { key: "home.lpP1B2", text: "Dự án có chỉ dẫn riêng; chia sẻ kết quả bằng một link công khai" },
      { key: "home.lpP1B3", text: "Kỹ năng riêng lưu thành lệnh tắt /tên-lệnh" },
    ],
    ctaKey: "home.lpP1Cta",
    cta: "Bắt đầu trò chuyện",
    href: "/register",
  },
  {
    n: "02",
    icon: <ThunderboltOutlined />,
    accent: "#4FB6FF",
    titleKey: "home.lpP2Title",
    title: "Tạo web app full-stack",
    descKey: "home.lpP2Desc",
    desc: "Mô tả bằng ngôn ngữ của bạn — nhận về giao diện, cơ sở dữ liệu, API và trang quản trị, deploy sẵn ra link công khai. Dán một địa chỉ web để sao chép giao diện cũng được.",
    bullets: [
      { key: "home.lpP2B1", text: "Cơ sở dữ liệu Cloudflare D1 + API /api/* + trang quản trị" },
      { key: "home.lpP2B2", text: "Link công khai <tên>.toolswave.net, SSL sẵn" },
      { key: "home.lpP2B3", text: "Sửa tiếp bằng hội thoại; tải mã nguồn hoặc nhập từ GitLab/GitHub" },
    ],
    noteKey: "home.lpP2Note",
    note: "App cần máy chủ riêng chạy trên Docker — có ở gói Chuyên nghiệp.",
    ctaKey: "home.lpP2Cta",
    cta: "Tạo app đầu tiên",
    href: "/register",
  },
  {
    n: "03",
    icon: <VideoCameraOutlined />,
    accent: "#FF7AB6",
    titleKey: "home.lpP3Title",
    title: "Video, ảnh và bài viết",
    descKey: "home.lpP3Desc",
    desc: "Video được dựng thật từng khung hình trên máy chủ rồi ghép lồng tiếng AI; ảnh nhiều slide; bài viết theo hướng chuẩn SEO. Bạn xem tiến trình từng bước.",
    bullets: [
      { key: "home.lpP3B1", text: "Kịch bản → giọng đọc → dựng cảnh → render, dọc 9:16 hoặc ngang 16:9" },
      { key: "home.lpP3B2", text: "Giọng tiếng Việt tự nhiên đứng đầu danh sách, nghe thử trước khi chọn" },
      { key: "home.lpP3B3", text: "Lên lịch tạo tự động: hằng ngày, hằng tuần hoặc T2–T6" },
    ],
    noteKey: "home.lpP3Note",
    note: "Lịch đăng hiện gửi qua Telegram.",
    ctaKey: "home.lpP3Cta",
    cta: "Làm video đầu tiên",
    href: "/register",
  },
  {
    n: "04",
    icon: <ApiOutlined />,
    accent: "#6C5CE7",
    titleKey: "home.lpP4Title",
    title: "Tự động hoá Lark Base",
    descKey: "home.lpP4Desc",
    desc: "Đọc/ghi bản ghi, phân quyền, workflow, đồng bộ CMS, đọc cả tệp đính kèm trong Bitable — 54 công cụ, thao tác với tư cách chính bạn.",
    bullets: [
      { key: "home.lpP4B1", text: "Bitable: bảng, trường, view, bản ghi hàng loạt, vai trò" },
      { key: "home.lpP4B2", text: "Docs, Sheets, Wiki, Drive, Lịch và tin nhắn" },
      { key: "home.lpP4B3", text: "Hẹn giờ để tác vụ Lark tự chạy" },
    ],
    noteKey: "home.lpP4Note",
    note: "Phần này chạy qua app máy tính Larkwave (Windows/macOS).",
    ctaKey: "home.lpP4Cta",
    cta: "Tải app máy tính",
    href: "/download",
  },
];

/** Ba thứ dùng chung cho cả bốn trụ cột. */
const SHARED: { icon: ReactNode; titleKey: string; title: string; descKey: string; desc: string }[] = [
  {
    icon: <ClockCircleOutlined />,
    titleKey: "home.lpShared1Title",
    title: "Đặt lịch cho trợ lý",
    descKey: "home.lpShared1Desc",
    desc: "Hẹn giờ theo múi giờ của bạn; máy chủ tự chạy kể cả khi bạn tắt máy. Xong việc có thông báo trong app và lưu lại toàn văn kết quả.",
  },
  {
    icon: <DashboardOutlined />,
    titleKey: "home.lpShared2Title",
    title: "Một hạn mức cho tất cả",
    descKey: "home.lpShared2Desc",
    desc: "Không mua lẻ từng công cụ: mỗi gói có một hạn mức dùng chung mỗi tháng, tiêu tới đâu tính tới đó — cho cả bốn mảng trên.",
  },
  {
    icon: <GlobalOutlined />,
    titleKey: "home.lpShared3Title",
    title: "Tiếng Việt và tiếng Anh",
    descKey: "home.lpShared3Desc",
    desc: "Giao diện có cả hai, tự theo ngôn ngữ trình duyệt và đổi được bất cứ lúc nào. Tiếng Việt được chăm kỹ — từ giao diện đến giọng lồng tiếng — là thế mạnh, không phải giới hạn.",
  },
];

const STEPS: { n: string; icon: ReactNode; titleKey: string; title: string; descKey: string; desc: string }[] = [
  {
    n: "1",
    icon: <SafetyCertificateOutlined />,
    titleKey: "home.lpStep1Title",
    title: "Đăng ký",
    descKey: "home.lpStep1Desc",
    desc: "Tài khoản miễn phí, không cần thẻ. Mở trình duyệt là làm việc được ngay.",
  },
  {
    n: "2",
    icon: <EditOutlined />,
    titleKey: "home.lpStep2Title",
    title: "Nói điều bạn cần",
    descKey: "home.lpStep2Desc",
    desc: "Gõ một câu, đính kèm tệp nếu có — tiếng Việt hay tiếng Anh. Chọn mảng: trò chuyện, tạo app, làm video hay Lark.",
  },
  {
    n: "3",
    icon: <FileDoneOutlined />,
    titleKey: "home.lpStep3Title",
    title: "Nhận kết quả thật",
    descKey: "home.lpStep3Desc",
    desc: "Tệp để tải, app có link công khai, video đã render, bản ghi Lark đã cập nhật — bạn xem tiến trình trực tiếp.",
  },
  {
    n: "4",
    icon: <ClockCircleOutlined />,
    titleKey: "home.lpStep4Title",
    title: "Lặp lại hoặc đặt lịch",
    descKey: "home.lpStep4Desc",
    desc: "Sửa tiếp bằng hội thoại, hoặc hẹn giờ để máy chủ tự chạy lại — kể cả khi bạn tắt máy.",
  },
];

const USE_CASE_CARDS: { icon: ReactNode; titleKey: string; title: string; descKey: string; desc: string }[] = [
  {
    icon: <ShoppingCartOutlined />,
    titleKey: "home.lpUc1Title",
    title: "Cửa hàng & landing bán hàng",
    descKey: "home.lpUc1Desc",
    desc: "Trang giới thiệu sản phẩm, giỏ hàng, danh mục và form đặt hàng — có link công khai để chạy quảng cáo ngay.",
  },
  {
    icon: <SolutionOutlined />,
    titleKey: "home.lpUc2Title",
    title: "CRM & phần mềm quản lý",
    descKey: "home.lpUc2Desc",
    desc: "Quản lý khách hàng, đơn hàng, công việc với cơ sở dữ liệu thật + phân quyền — thay cho file Excel rời rạc.",
  },
  {
    icon: <FilePdfOutlined />,
    titleKey: "home.lpUc3Title",
    title: "Báo cáo từ bảng tính",
    descKey: "home.lpUc3Desc",
    desc: "Gửi Excel/CSV cho trợ lý, nhận về báo cáo hay bản tóm tắt dưới dạng tệp — không phải tự làm công thức.",
  },
  {
    icon: <PlayCircleOutlined />,
    titleKey: "home.lpUc4Title",
    title: "Video ngắn đều đặn",
    descKey: "home.lpUc4Desc",
    desc: "Chủ đề + giọng đọc → video dọc 9:16 hoặc ngang 16:9, tự tạo theo lịch và gửi về Telegram.",
  },
  {
    icon: <PictureOutlined />,
    titleKey: "home.lpUc5Title",
    title: "Bài viết SEO & ảnh mạng xã hội",
    descKey: "home.lpUc5Desc",
    desc: "Bài blog theo hướng chuẩn SEO, ảnh nhiều slide cho bài đăng — cùng một hạn mức với mọi thứ khác.",
  },
  {
    icon: <TableOutlined />,
    titleKey: "home.lpUc6Title",
    title: "Vận hành Lark Base",
    descKey: "home.lpUc6Desc",
    desc: "Nhập/cập nhật bản ghi hàng loạt, tạo bảng và trường, phân quyền, đồng bộ sang CMS — qua app máy tính.",
  },
];

const USE_CASE_TAGS: { key: string; label: string }[] = [
  { key: "home.lpTag1", label: "Landing page sản phẩm/dịch vụ" },
  { key: "home.lpTag2", label: "Cửa hàng online + giỏ hàng" },
  { key: "home.lpTag3", label: "Form khảo sát / đăng ký sự kiện" },
  { key: "home.lpTag4", label: "Blog / trang tin có CMS" },
  { key: "home.lpTag5", label: "Tóm tắt & dịch tài liệu" },
  { key: "home.lpTag6", label: "Nhập liệu Lark Base hàng loạt" },
];

const WHY: { icon: ReactNode; titleKey: string; title: string; descKey: string; desc: string }[] = [
  {
    icon: <FileDoneOutlined />,
    titleKey: "home.lpWhy1Title",
    title: "Không chỉ trả lời — trả về sản phẩm",
    descKey: "home.lpWhy1Desc",
    desc: "Tệp thật, app có link, video đã render, bản ghi đã ghi vào Lark. Mọi kết quả đều tải về hoặc chia sẻ được.",
  },
  {
    icon: <GlobalOutlined />,
    titleKey: "home.lpWhy2Title",
    title: "Dùng ở mọi nơi, tiếng Việt là thế mạnh",
    descKey: "home.lpWhy2Desc",
    desc: "Giao diện Việt/Anh tự theo trình duyệt. Với tiếng Việt còn có giọng lồng tiếng tự nhiên, blog hướng dẫn và cộng đồng bằng tiếng Việt.",
  },
  {
    icon: <CodeOutlined />,
    titleKey: "home.lpWhy3Title",
    title: "Bạn sở hữu mã nguồn",
    descKey: "home.lpWhy3Desc",
    desc: "Xem và tải toàn bộ source code của app bất cứ lúc nào. Không khoá bạn vào nền tảng — muốn tự host cũng được.",
  },
  {
    icon: <DatabaseOutlined />,
    titleKey: "home.lpWhy4Title",
    title: "Nói thẳng giới hạn",
    descKey: "home.lpWhy4Desc",
    desc: "Lark cần app máy tính; lịch đăng gửi qua Telegram; app cần máy chủ riêng thì ở gói Chuyên nghiệp. Ghi rõ ở đây, không giấu trong điều khoản.",
  },
];

const TRUST_BADGES: { key: string; label: string }[] = [
  { key: "home.lpTrust1", label: "Chạy trên trình duyệt, không cài gì" },
  { key: "home.lpTrust2", label: "Tệp vào — tệp ra (Excel, PDF, ảnh)" },
  { key: "home.lpTrust3", label: "Deploy thật ra Cloudflare" },
  { key: "home.lpTrust4", label: "Tải mã nguồn về bất cứ lúc nào" },
  { key: "home.lpTrust5", label: "54 công cụ Lark Base" },
  { key: "home.lpTrust6", label: "Giao diện tiếng Việt & tiếng Anh" },
];

/**
 * Ba gói đầu của bảng giá, đúng theo apps/api/src/billing/plans.ts: Miễn phí · Khởi đầu (starter)
 * · Chuyên nghiệp (pro). Bản trước ghi "Maker" và gán "gỡ thương hiệu" cho gói giữa — không có gói
 * nào tên thế và gỡ nhãn là quyền của Pro trở lên. Không ghi giá ở đây: giá theo VND nằm ở
 * /pricing, trang chủ chỉ nói quyền lợi.
 */
const PLAN_TEASER: {
  nameKey: string;
  name: string;
  taglineKey: string;
  tagline: string;
  points: { key: string; text: string }[];
  highlight: boolean;
}[] = [
  {
    nameKey: "home.lpPlanFreeName",
    name: "Miễn phí",
    taglineKey: "home.lpPlanFreeTagline",
    tagline: "Bắt đầu không cần thẻ",
    points: [
      { key: "home.lpPlanFreeP1", text: "Đủ cả bốn mảng, hạn mức cơ bản mỗi tháng" },
      { key: "home.lpPlanFreeP2", text: "App đầy đủ: giao diện + dữ liệu + quản trị" },
      { key: "home.lpPlanFreeP3", text: "1 app chạy đồng thời, deploy thật" },
    ],
    highlight: false,
  },
  {
    nameKey: "home.lpPlanStarterName",
    name: "Khởi đầu",
    taglineKey: "home.lpPlanStarterTagline",
    tagline: "Cho người làm đều tay",
    points: [
      { key: "home.lpPlanStarterP1", text: "Hạn mức gấp ~10× gói Miễn phí" },
      { key: "home.lpPlanStarterP2", text: "3 app chạy đồng thời" },
      { key: "home.lpPlanStarterP3", text: "Tải mã nguồn ZIP · đồng bộ GitLab" },
    ],
    highlight: true,
  },
  {
    nameKey: "home.lpPlanProName",
    name: "Chuyên nghiệp",
    taglineKey: "home.lpPlanProTagline",
    tagline: "Cho đội nhóm & sản phẩm",
    points: [
      { key: "home.lpPlanProP1", text: "Hạn mức gấp ~33× gói Miễn phí" },
      { key: "home.lpPlanProP2", text: "Chạy trên Server (Docker), 12 app đồng thời" },
      { key: "home.lpPlanProP3", text: "Gỡ nhãn 'Tạo bởi Larkwave' · tên miền riêng" },
    ],
    highlight: false,
  },
];

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

/**
 * CSS riêng của trang, gắn bằng `<style href precedence>` (React 19) giống FxStyles: có mặt ngay
 * trong HTML server trả về nên khung hình đầu đã đúng bố cục, và React chỉ giữ MỘT bản dù
 * component render lại.
 *
 * Bề mặt thẻ KHÔNG tự khai màu: mọi thẻ mang class `tw-pub-card` (globals.css) để ăn chung token
 * `--tw-pub-card-*` với /explore, /download, /blog — một chỗ chỉnh độ sáng kính là cả site theo.
 * Ở đây chỉ còn bo góc, padding, viền gradient khi hover và bố cục. Màu chữ/viền/nền phụ đi qua
 * biến `--tw-*` (kèm fallback sáng): trang được ép TỐI ở providers (ForceDark → bảng đen-tím),
 * bản sáng chỉ là đường lùi. Chỉ màu THƯƠNG HIỆU (tím/hồng/xanh) là cố định.
 */
const LP_CSS = `
.tw-lp{background:var(--tw-layer,#FFFFFF);color:var(--tw-text,#1E2230);overflow-x:hidden;}
.tw-lp a{text-decoration:none;}
.tw-lp h1,.tw-lp h2,.tw-lp h3{color:var(--tw-text,#1E2230);}

/* ---- Hero: chiều sâu thật ----------------------------------------------------------------
   Tầng xa nhất là HeroShader (WebGL: sàn lưới có sương mù + tinh vân + hạt có phối cảnh, tự lắc
   camera theo chuột/cuộn); trên đó là quầng màu rồi vành đai 3D — ba tầng dịch lệch nhau
   theo cuộn/chuột (ParallaxLayers) và cả sân khấu nghiêng theo chuột. */
.tw-lp-hero{position:relative;text-align:center;}
.tw-lp-hero-inner{position:relative;max-width:960px;margin:0 auto;padding:clamp(44px,8vw,100px) clamp(16px,5vw,56px) 88px;}
/* Quầng màu lấy alpha từ --tw-pub-orb-a (globals.css khai 3 tầng sáng/tối): cùng alpha .55 trên
   nền tối sẽ thành đèn neon, nên ở dark biến này nhỏ hơn; fallback .55 để không phụ thuộc biến đó. */
.tw-lp-blob{position:absolute;border-radius:50%;filter:blur(80px);opacity:var(--tw-pub-orb-a,.55);pointer-events:none;}
.tw-lp-blob-a{width:46vw;height:46vw;max-width:620px;max-height:620px;left:4%;top:-4%;background:radial-gradient(circle,rgba(108,92,231,.55),transparent 70%);}
.tw-lp-blob-b{width:40vw;height:40vw;max-width:560px;max-height:560px;right:2%;top:10%;background:radial-gradient(circle,rgba(79,182,255,.45),transparent 70%);}
.tw-lp-blob-c{width:34vw;height:34vw;max-width:460px;max-height:460px;left:38%;bottom:-8%;background:radial-gradient(circle,rgba(255,122,182,.32),transparent 70%);}
/* Vành đai elip nghiêng 74° có perspective() nên phần gần to hơn phần xa — một elip dẹt bình
   thường không cho cảm giác "đang nhìn từ trên xuống" như thế. Xoay Z chậm là transform thuần
   compositor, không repaint. */
.tw-lp-ring{position:absolute;left:50%;top:62%;border-radius:50%;border:1px solid rgba(108,92,231,.22);pointer-events:none;
  transform:translate(-50%,-50%) perspective(1200px) rotateX(74deg) rotateZ(0deg);
  animation:tw-lp-orbit 60s linear infinite;}
.tw-lp-ring-1{width:min(1100px,150vw);height:min(1100px,150vw);}
.tw-lp-ring-2{width:min(760px,110vw);height:min(760px,110vw);border-color:rgba(255,122,182,.22);animation-duration:42s;animation-direction:reverse;}
.tw-lp-ring::after{content:"";position:absolute;left:50%;top:-4px;width:8px;height:8px;margin-left:-4px;border-radius:50%;
  background:#A66BFF;box-shadow:0 0 14px 3px rgba(166,107,255,.55);}
.tw-lp-ring-2::after{background:#4FB6FF;box-shadow:0 0 14px 3px rgba(79,182,255,.55);}
@keyframes tw-lp-orbit{to{transform:translate(-50%,-50%) perspective(1200px) rotateX(74deg) rotateZ(360deg);}}

.tw-lp-badge{display:inline-flex;align-items:center;gap:7px;padding:7px 16px;border-radius:999px;max-width:100%;
  background:var(--tw-surface,#fff);border:1px solid var(--tw-border,#ECEDF3);color:${BRAND};
  font-weight:600;font-size:13.5px;margin-bottom:22px;backdrop-filter:blur(6px);text-align:left;}
.tw-lp-h1{font-size:clamp(34px,6.4vw,66px);line-height:1.06;font-weight:800;margin:0 0 20px;letter-spacing:-1.2px;}
/* KHỔ CHỮ: một con số duy nhất cho mọi đoạn dẫn, thay vì 720 ở hero rồi 660 ở các khối.
   Linear khai thẳng trong CSS --prose-max-width:624px (cạnh --page-max-width:1024px), Stripe
   dùng 608px. Quy ra ký tự là khoảng 38–56 ký tự một dòng — trên mức đó mắt phải quét quá xa và
   dễ lạc dòng khi xuống hàng. Không để mỗi khối một con số: đo được 660/720/782/860px trên
   trang này, và đó là lý do từng khối trông như do người khác dựng. */
.tw-lp{--tw-lp-kho-chu:620px;}
.tw-lp-lead{font-size:clamp(16px,2.4vw,20px);color:var(--tw-text-sub,#6B7280);line-height:1.6;margin:0 auto 32px;max-width:var(--tw-lp-kho-chu,620px);}
.tw-lp-lead strong{color:var(--tw-text,#1E2230);}
.tw-lp-ctas{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;}
.tw-lp-btn{display:inline-flex;align-items:center;gap:8px;padding:15px 30px;border-radius:12px;font-weight:700;font-size:16px;}
.tw-lp-btn-primary{background:${GRADIENT};color:#fff;box-shadow:0 16px 40px rgba(108,92,231,.34);}
.tw-lp-btn-ghost{padding:15px 26px;border:1px solid var(--tw-border,#ECEDF3);background:var(--tw-surface,#fff);color:var(--tw-text,#1E2230);font-weight:600;}
.tw-lp-note{margin-top:18px;color:var(--tw-text-faint,#9AA3B5);font-size:13.5px;}

/* Sân khấu cho mockup: nghiêng nhẹ về sau ở trạng thái nghỉ (như màn hình đặt trên bàn), TiltCard
   bên trong lo phần bám theo chuột. Perspective đặt ở CHA để góc nhìn của cả khối nhất quán. */
.tw-lp-stage{max-width:980px;margin:52px auto 0;perspective:1400px;}
.tw-lp-stage-rest{transform:rotateX(4deg);transform-origin:50% 0;}
.tw-lp-frame{border-radius:18px;border:1px solid var(--tw-border,#ECEDF3);background:var(--tw-surface,#fff);
  box-shadow:0 40px 90px rgba(108,92,231,.22),0 8px 24px rgba(17,24,39,.07);overflow:hidden;text-align:left;}
.tw-lp-frame-bar{display:flex;align-items:center;gap:7px;padding:11px 14px;border-bottom:1px solid var(--tw-border-sub,#F1F2F7);background:var(--tw-surface-alt,#FAFAFE);}
.tw-lp-frame-bar i{width:11px;height:11px;border-radius:50%;display:inline-block;}
.tw-lp-frame-url{margin-left:12px;font-size:12.5px;color:var(--tw-text-faint,#9AA3B5);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.tw-lp-frame-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);}
.tw-lp-frame-left{padding:22px 20px;border-right:1px solid var(--tw-border-sub,#F1F2F7);background:var(--tw-surface-alt,#FAFAFE);}
.tw-lp-frame-right{padding:20px;}
.tw-lp-frame-label{font-size:12px;font-weight:700;color:var(--tw-text-faint,#9AA3B5);letter-spacing:.5px;margin-bottom:12px;}
.tw-lp-bubble{background:${BRAND};color:#fff;padding:11px 14px;border-radius:14px 14px 14px 4px;font-size:14px;line-height:1.5;max-width:320px;}
/* "Tệp trả về": một hàng như trong khung chat thật — icon, tên tệp, trạng thái. */
.tw-lp-file{display:flex;align-items:center;gap:10px;margin-top:12px;padding:10px 12px;border-radius:12px;max-width:320px;
  border:1px solid var(--tw-border,#ECEDF3);background:var(--tw-surface,#fff);font-size:13px;}
.tw-lp-file b{display:block;font-size:13px;color:var(--tw-text,#1E2230);word-break:break-all;}
.tw-lp-file span{color:var(--tw-text-faint,#9AA3B5);font-size:12px;}
.tw-lp-file .tw-lp-file-ico{width:34px;height:34px;min-width:34px;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;font-size:17px;color:#fff;background:${GRADIENT};}
/* Bốn ô kết quả — mỗi ô một trụ cột, cùng tài khoản. */
.tw-lp-tiles{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.tw-lp-tile{border-radius:12px;border:1px solid var(--tw-border-sub,#F1F2F7);padding:12px 12px 11px;background:var(--tw-surface-alt,#FAFAFE);min-width:0;}
.tw-lp-tile-top{display:flex;align-items:center;gap:8px;font-weight:700;font-size:13px;margin-bottom:6px;color:var(--tw-text,#1E2230);}
.tw-lp-tile-top i{width:24px;height:24px;border-radius:7px;display:inline-flex;align-items:center;justify-content:center;font-size:13px;color:#fff;flex-shrink:0;}
.tw-lp-tile small{display:block;color:var(--tw-text-faint,#9AA3B5);font-size:12px;line-height:1.4;}
.tw-lp-tile-line{height:6px;border-radius:4px;background:var(--tw-border,#ECEDF3);margin-top:8px;}
.tw-lp-live{display:inline-flex;align-items:center;gap:6px;margin-top:14px;font-size:12.5px;color:var(--tw-text-sub,#6B7280);}
.tw-lp-live i{width:8px;height:8px;border-radius:50%;background:${OK};display:inline-block;}
@media (max-width:767px){
  .tw-lp-frame-grid{grid-template-columns:1fr;}
  .tw-lp-frame-left{padding:18px 16px;border-right:none;border-bottom:1px solid var(--tw-border-sub,#F1F2F7);}
  .tw-lp-frame-right{padding:16px;}
  .tw-lp-stage-rest{transform:none;}
}
@media (max-width:420px){.tw-lp-tiles{grid-template-columns:1fr;}}

/* ---- Khối chung ------------------------------------------------------------------------- */
/* KHOẢNG NGHỈ DỌC: 48px mỗi phía là chỗ trang này lệch xa chuẩn nhất.
   Đo ngày 25/09/2026 trên bản thật của các bên được coi là chuẩn: Linear đệm 128px CẢ TRÊN LẪN DƯỚI
   cho mọi khối sản phẩm, tức 256px trắng giữa hai khối; Stripe khai hẳn một thang khoảng cách từ 8px
   lên tới 200px. Ở 48px, mười khối của trang này dính vào nhau thành một dải liền — mắt không có
   chỗ nghỉ để biết một ý đã hết và ý sau bắt đầu.
   Không nhảy thẳng lên 128px: trang đã cao 6642px, nhân đôi đệm là thêm hơn 1300px cuộn. */
.tw-lp-section{padding:clamp(64px,8vw,104px) clamp(16px,5vw,56px);}
.tw-lp-wrap{max-width:1180px;margin:0 auto;}
.tw-lp-alt{background:var(--tw-surface-alt,#FAFAFE);border-top:1px solid var(--tw-border-sub,#F1F2F7);border-bottom:1px solid var(--tw-border-sub,#F1F2F7);}
/* Lưới chấm tĩnh (không animation) — gợi "bản vẽ kỹ thuật" cho khối Vì sao, gần như không tốn gì. */
.tw-lp-dots{background-image:radial-gradient(var(--tw-border,#ECEDF3) 1px,transparent 1.5px);background-size:22px 22px;}
/* THANG CỠ CHỮ nhảy vọt, không đi từng nấc. Đo ở 1440px: Linear thân bài 16px → h2 48px; Vercel
   16px → MỌI h2 đều 56px; Framer 18px → h2 44px. Không ai đặt tiêu đề khối ở 24px hay 28px — khoảng
   giữa thân bài và tiêu đề để TRỐNG có chủ đích, vì đó là thứ làm người đọc biết đâu là ranh giới.
   Chữ càng lớn thì line-height càng về 1.0 và letter-spacing càng âm: Linear ghi thành token — 17px
   là 1.4/-0.012em, 48px là 1.0, 72px là 1.0/-0.06em. */
.tw-lp-h2{text-align:center;font-size:clamp(28px,4.6vw,46px);font-weight:800;margin:0 0 10px;letter-spacing:-.022em;line-height:1.1;}
.tw-lp-sub{text-align:center;color:var(--tw-text-sub,#6B7280);font-size:16px;margin:0 auto 36px;max-width:var(--tw-lp-kho-chu,620px);line-height:1.55;}
.tw-lp-h2-only{margin-bottom:36px;}
.tw-lp-grid{display:grid;gap:18px;}
.tw-lp-grid-3{grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr));}
.tw-lp-grid-uc{grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr));}
.tw-lp-grid-plan{grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr));}
.tw-lp-grid-why{grid-template-columns:repeat(auto-fit,minmax(min(250px,100%),1fr));gap:22px;}

/* Thẻ: bề mặt do .tw-pub-card lo (globals.css). Ở đây chỉ bo góc/padding và viền gradient hiện dần
   khi hover bằng mask (không cần phần tử thừa). box-sizing border-box: height 100% của ô lưới đã
   gồm padding — thiếu nó, thẻ cao hơn ô và hàng dưới đè lên mép hàng trên (đã đo được). */
.tw-lp-card{position:relative;box-sizing:border-box;height:100%;padding:22px 22px 24px;border-radius:18px;}
.tw-lp-card::before{content:"";position:absolute;inset:-1px;border-radius:inherit;padding:1px;pointer-events:none;
  background:${GRADIENT};
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
  -webkit-mask-composite:xor;mask-composite:exclude;opacity:0;transition:opacity .3s ease;}
.tw-lp-card:hover::before,.tw-lp-card-hi::before{opacity:1;}
.tw-lp-card h3{font-size:17.5px;font-weight:700;margin:0 0 8px;}
.tw-lp-card p{color:var(--tw-text-sub,#6B7280);font-size:14.5px;line-height:1.6;margin:0;}
.tw-lp-icon{width:48px;height:48px;min-width:48px;border-radius:13px;display:inline-flex;align-items:center;justify-content:center;
  font-size:22px;color:${BRAND};background:var(--tw-chip-bg,#F1EFFE);margin-bottom:14px;}

/* ---- Bốn trụ cột: 2×2, thẻ lớn -----------------------------------------------------------
   Số thứ tự to mờ ở góc là "mốc" để mắt đọc bốn thẻ như một dãy, không phải bốn ô rời. Mỗi thẻ
   có màu nhấn riêng (tím/xanh/hồng/tím đậm) cho icon và số — cùng bảng thương hiệu. */
.tw-lp-pillars{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(420px,100%),1fr));gap:20px;position:relative;}
.tw-lp-pillar{padding:28px 26px 26px;display:flex;flex-direction:column;}
.tw-lp-pillar-n{position:absolute;top:14px;right:20px;font-size:52px;font-weight:900;letter-spacing:-2px;line-height:1;opacity:.14;pointer-events:none;
  background:${GRADIENT};-webkit-background-clip:text;background-clip:text;color:transparent;}
.tw-lp-pillar h3{font-size:clamp(19px,2.2vw,23px);font-weight:800;margin:0 0 10px;letter-spacing:-.3px;}
.tw-lp-pillar p{font-size:15px;line-height:1.62;}
.tw-lp-pillar-ul{list-style:none;padding:0;margin:16px 0 0;display:flex;flex-direction:column;gap:9px;}
.tw-lp-pillar-ul li{display:flex;gap:9px;align-items:flex-start;font-size:14px;line-height:1.5;color:var(--tw-text,#1E2230);}
.tw-lp-pillar-ul li .anticon{margin-top:3px;flex-shrink:0;}
/* Giới hạn viết THẲNG trong thẻ: một hàng nhỏ có viền trái, không phải chú thích mờ ở cuối trang. */
.tw-lp-pillar-note{margin-top:14px;padding:9px 12px;border-left:2px solid rgba(108,92,231,.5);border-radius:0 10px 10px 0;
  background:var(--tw-chip-bg,#F1EFFE);color:var(--tw-text-sub,#6B7280);font-size:13px;line-height:1.5;}
.tw-lp-pillar-cta{margin-top:auto;padding-top:18px;display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:14.5px;color:${BRAND};}
.tw-lp-pillar-cta:hover{gap:10px;}
.tw-lp-pillar-cta{transition:gap .25s ease;}

.tw-lp-pill{display:inline-flex;align-items:center;gap:7px;padding:8px 14px;border-radius:999px;max-width:100%;
  border:1px solid var(--tw-border,#ECEDF3);background:var(--tw-surface,#fff);color:var(--tw-text,#1E2230);
  font-size:13.5px;font-weight:500;box-shadow:0 1px 3px rgba(17,24,39,.04);}
.tw-lp-tag{padding:9px 16px;border-radius:999px;border:1px solid var(--tw-border,#ECEDF3);background:var(--tw-surface-alt,#FAFAFE);color:var(--tw-text,#1E2230);font-size:14px;}

/* Bốn bước: một đường gradient nối các ô số khi đủ rộng để 4 cột nằm trên một hàng. */
.tw-lp-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr));gap:20px;position:relative;}
@media (min-width:960px){
  .tw-lp-steps::before{content:"";position:absolute;left:12%;right:12%;top:28px;height:2px;
    background:linear-gradient(90deg,transparent,rgba(108,92,231,.4),rgba(255,122,182,.4),rgba(79,182,255,.4),transparent);}
}
.tw-lp-step{text-align:center;position:relative;}
.tw-lp-step-ico{width:56px;height:56px;border-radius:16px;background:${GRADIENT};color:#fff;font-size:24px;display:inline-flex;
  align-items:center;justify-content:center;box-shadow:0 12px 26px rgba(108,92,231,.28);}
.tw-lp-step-n{position:absolute;top:-6px;right:-6px;width:22px;height:22px;border-radius:50%;background:var(--tw-surface,#fff);
  border:1.5px solid var(--tw-border,#ECEDF3);color:${BRAND};font-size:12px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;}
.tw-lp-step h3{font-size:17px;font-weight:700;margin:0 0 6px;}
.tw-lp-step p{color:var(--tw-text-sub,#6B7280);font-size:14px;line-height:1.55;margin:0;}

.tw-lp-why h3{font-size:18px;font-weight:700;margin:0 0 8px;}
.tw-lp-why p{color:var(--tw-text-sub,#6B7280);font-size:15px;line-height:1.6;margin:0;}

.tw-lp-plan-name{font-size:20px;font-weight:800;margin-bottom:4px;}
.tw-lp-plan-tag{color:var(--tw-text-faint,#9AA3B5);font-size:13.5px;margin-bottom:16px;}
.tw-lp-plan-ul{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:9px;}
.tw-lp-plan-ul li{display:flex;gap:8px;align-items:flex-start;font-size:14.5px;color:var(--tw-text,#1E2230);}
.tw-lp-popular{position:absolute;top:-12px;left:22px;display:inline-flex;align-items:center;gap:5px;padding:3px 12px;border-radius:999px;
  background:${GRADIENT};color:#fff;font-size:12px;font-weight:700;}
.tw-lp-link-btn{display:inline-block;padding:12px 26px;border:1px solid ${BRAND};color:${BRAND};border-radius:12px;font-weight:700;font-size:15.5px;}

.tw-lp-blog-card{display:flex;flex-direction:column;height:100%;color:var(--tw-text,#1E2230);}
.tw-lp-blog-cover{height:140px;border-radius:12px;margin:0 0 4px;}
.tw-lp-blog-body{padding:12px 6px 4px;display:flex;flex-direction:column;gap:8px;flex:1;}
.tw-lp-blog-body h3{font-size:17px;font-weight:700;margin:0;line-height:1.3;}
.tw-lp-blog-body p{color:var(--tw-text-sub,#6B7280);font-size:14px;line-height:1.55;margin:0;flex:1;}

.tw-lp-faq{border:1px solid var(--tw-border,#ECEDF3);border-radius:12px;background:var(--tw-surface,#fff);padding:14px 18px;transition:border-color .2s ease;}
.tw-lp-faq[open]{border-color:rgba(108,92,231,.45);}
.tw-lp-faq summary{font-weight:600;font-size:15.5px;cursor:pointer;color:var(--tw-text,#1E2230);list-style:none;display:flex;justify-content:space-between;gap:12px;align-items:center;}
.tw-lp-faq summary::-webkit-details-marker{display:none;}
.tw-lp-faq summary::after{content:"+";color:${BRAND};font-size:20px;line-height:1;transition:transform .2s ease;flex-shrink:0;}
.tw-lp-faq[open] summary::after{transform:rotate(45deg);}
.tw-lp-faq p{color:var(--tw-text-sub,#6B7280);font-size:14.5px;line-height:1.6;margin:10px 0 0;}

/* CTA cuối: một dải sáng conic quay chậm phía sau chữ — cùng gradient thương hiệu, alpha thấp. */
.tw-lp-cta{position:relative;max-width:860px;margin:0 auto;padding:clamp(34px,5vw,58px);border-radius:26px;
  background:${GRADIENT};color:#fff;box-shadow:0 30px 70px rgba(108,92,231,.32);overflow:hidden;isolation:isolate;}
.tw-lp-cta::before{content:"";position:absolute;left:50%;top:50%;width:160%;aspect-ratio:1;margin:-80% 0 0 -80%;z-index:-1;
  background:conic-gradient(from 0deg,rgba(255,255,255,0) 0%,rgba(255,255,255,.18) 20%,rgba(255,255,255,0) 40%,rgba(255,255,255,.12) 70%,rgba(255,255,255,0) 100%);
  animation:tw-lp-spin 18s linear infinite;}
@keyframes tw-lp-spin{to{transform:rotate(360deg);}}
.tw-lp-cta h2{font-size:clamp(26px,4.5vw,40px);font-weight:800;margin:0 0 12px;color:#fff;}
.tw-lp-cta p{font-size:17px;opacity:.95;margin:0 0 26px;}
.tw-lp-cta-btn{display:inline-flex;align-items:center;gap:8px;padding:15px 34px;background:#fff;color:${BRAND};border-radius:12px;font-weight:700;font-size:16.5px;box-shadow:0 12px 30px rgba(0,0,0,.18);}

/* ---- Bản TỐI (ForceDark): các bề mặt KHÔNG phải thẻ ------------------------------------------
   Selector [data-theme="dark"] khớp cả wrapper ForceDark lẫn <html> dark. Thẻ đã theo .tw-pub-card;
   còn pill/tag/faq/nút ghost/badge là kính mỏng: nền trắng 3–4%, viền trắng 9%. Chiều sâu đến từ
   ánh sáng (CursorGlow, viền phát sáng của TiltCard) và bóng, không từ màu nền. */
[data-theme="dark"] .tw-lp-faq,
[data-theme="dark"] .tw-lp-pill,
[data-theme="dark"] .tw-lp-tag,
[data-theme="dark"] .tw-lp-btn-ghost,
[data-theme="dark"] .tw-lp-file,
[data-theme="dark"] .tw-lp-tile,
[data-theme="dark"] .tw-lp-badge{
  background:var(--tw-fx-glass-bg,rgba(255,255,255,.035));
  border-color:var(--tw-fx-glass-border,rgba(255,255,255,.09));
}
[data-theme="dark"] .tw-lp-badge{color:#C3B8FF;box-shadow:0 0 24px rgba(108,92,231,.25);}
[data-theme="dark"] .tw-lp-btn-primary{box-shadow:0 16px 48px rgba(108,92,231,.55),0 0 0 1px rgba(255,255,255,.08) inset;}
[data-theme="dark"] .tw-lp-frame{
  background:rgba(12,10,24,.78);border-color:rgba(255,255,255,.1);
  box-shadow:0 60px 120px rgba(0,0,0,.65),0 0 80px rgba(108,92,231,.28),inset 0 1px 0 rgba(255,255,255,.08);
}
[data-theme="dark"] .tw-lp-frame-bar,[data-theme="dark"] .tw-lp-frame-left{background:rgba(255,255,255,.03);}
[data-theme="dark"] .tw-lp-alt{background:rgba(255,255,255,.02);}
[data-theme="dark"] .tw-lp-dots{background-image:radial-gradient(rgba(255,255,255,.08) 1px,transparent 1.5px);}
[data-theme="dark"] .tw-lp-pillar-note{background:rgba(124,108,240,.12);}
[data-theme="dark"] .tw-lp-pillar-n{opacity:.22;}
/* Vành đai và quầng: trên nền đen chúng được phép sáng hơn hẳn — đây là nguồn sáng của hero. */
[data-theme="dark"] .tw-lp-ring{border-color:rgba(166,150,255,.38);box-shadow:0 0 40px rgba(108,92,231,.12);}
[data-theme="dark"] .tw-lp-ring-2{border-color:rgba(255,122,182,.34);}
[data-theme="dark"] .tw-lp-blob{opacity:.6;}
[data-theme="dark"] .tw-lp-step-n{background:#100E1C;}
[data-theme="dark"] .tw-lp-cta{box-shadow:0 40px 100px rgba(108,92,231,.45);}

@media (prefers-reduced-motion:reduce){
  .tw-lp-ring,.tw-lp-cta::before{animation:none;}
  .tw-lp-card::before,.tw-lp-faq,.tw-lp-faq summary::after,.tw-lp-pillar-cta{transition:none;}
}
`;

function LpStyles() {
  return (
    <style href="tw-lp" precedence="default">
      {LP_CSS}
    </style>
  );
}

/** Tiêu đề khối canh giữa + mô tả phụ tuỳ chọn. */
function Heading({ title, sub }: { title: string; sub?: string }) {
  return (
    <>
      <h2 className={sub ? "tw-lp-h2" : "tw-lp-h2 tw-lp-h2-only"}>{title}</h2>
      {sub && <p className="tw-lp-sub">{sub}</p>}
    </>
  );
}

/**
 * Ba tầng nền của hero, xa → gần. Khai báo ngoài component để mảng không bị tạo mới mỗi render
 * (ParallaxLayers đọc depth qua ref nên không sao, nhưng HeroShader bên trong thì không muốn
 * remount — mỗi lần mount là một WebGL context mới).
 * Shader ở tầng xa nhất với depth rất nhỏ: nó tự lắc camera theo chuột rồi, cộng thêm dịch của
 * ParallaxLayers nữa là hai chuyển động chồng nhau. Lớp tràn 4% (không phải 12% mặc định): đủ để
 * sân khấu nghiêng 3° không hở mép canvas, mà không vẽ thừa một phần tư số pixel.
 */
const HERO_LAYERS: ParallaxLayer[] = [
  { depth: 0.04, style: { inset: "-4%" }, node: <HeroShader /> },
  {
    depth: 0.3,
    node: (
      <>
        <span className="tw-lp-blob tw-lp-blob-a" />
        <span className="tw-lp-blob tw-lp-blob-b" />
        <span className="tw-lp-blob tw-lp-blob-c" />
      </>
    ),
  },
  {
    depth: 0.6,
    node: (
      <>
        <span className="tw-lp-ring tw-lp-ring-1" />
        <span className="tw-lp-ring tw-lp-ring-2" />
      </>
    ),
  },
];

/**
 * Nền cho khối bốn trụ cột: hai quầng màu dịch theo cuộn, KHÔNG nghiêng sân khấu (tilt=0) — khối
 * này cao gần hai màn hình, nghiêng cả khối theo chuột thì chữ ở mép trên và mép dưới lệch nhau
 * thấy rõ. Không có shader: một WebGL context cho hero là đủ, hai cái trên cùng trang là gấp đôi
 * GPU cho thứ người ta chỉ lướt qua.
 */
const PILLAR_LAYERS: ParallaxLayer[] = [
  {
    depth: 0.35,
    node: (
      <>
        <span className="tw-pub-orb tw-pub-orb-soft" style={{ width: "44vw", height: "44vw", maxWidth: 560, maxHeight: 560, left: "-14%", top: "-6%", background: "radial-gradient(circle,rgba(79,182,255,.5),transparent 70%)" }} />
        <span className="tw-pub-orb tw-pub-orb-soft" style={{ width: "40vw", height: "40vw", maxWidth: 520, maxHeight: 520, right: "-12%", bottom: "-4%", background: "radial-gradient(circle,rgba(255,122,182,.45),transparent 70%)" }} />
      </>
    ),
  },
];

const FULL: CSSProperties = { height: "100%" };

/**
 * `lang` được TRUYỀN XUỐNG chứ không lấy từ context: đây là island nằm trong một trang kết xuất ở
 * MÁY CHỦ, mà lúc dựng ở máy chủ context i18n luôn trả 'vi'. Đây là lần thứ BA cùng một lỗi
 * (23/09 ở /blog, 24/09 ở /pricing, 25/09 ở chính trang chủ) — xem `lib/useLangT.ts`.
 */
export default function LandingPage({ lang }: { lang?: Locale }) {
  const t = useLangT(lang);
  const ngonNgu = useNgonNguIsland(lang);
  const [posts, setPosts] = useState<BlogPostListItem[]>([]);
  // `ngonNgu` phải nằm trong danh sách phụ thuộc: đổi tiếng giữa chừng thì khối blog phải nạp lại,
  // không thì nó giữ nguyên ba bài của thứ tiếng cũ.
  useEffect(() => {
    api.featuredBlogPosts(3, ngonNgu).then(setPosts).catch(() => undefined);
  }, [ngonNgu]);

  /* Bốn ô kết quả trong mockup — mỗi ô một trụ cột. Chữ mẫu (tên tệp, subdomain) là minh hoạ,
     nhưng DẠNG của chúng là thật: link <tên>.toolswave.net, video 9:16, bản ghi Bitable, lịch có
     giờ. */
  const tiles: { icon: ReactNode; color: string; title: string; sub: string }[] = [
    { icon: <ThunderboltOutlined />, color: "#4FB6FF", title: t("home.lpMockTileApp", "Web app"), sub: t("home.lpMockTileAppSub", "myshop.toolswave.net · đã deploy") },
    { icon: <VideoCameraOutlined />, color: "#FF7AB6", title: t("home.lpMockTileVideo", "Video"), sub: t("home.lpMockTileVideoSub", "0:42 · 9:16 · đã gửi Telegram") },
    { icon: <ApiOutlined />, color: "#6C5CE7", title: t("home.lpMockTileLark", "Lark Base"), sub: t("home.lpMockTileLarkSub", "128 bản ghi đã cập nhật") },
    { icon: <ClockCircleOutlined />, color: "#A66BFF", title: t("home.lpMockTileSched", "Lịch hẹn"), sub: t("home.lpMockTileSchedSub", "Thứ Hai · 08:00 · tự chạy") },
  ];

  return (
    <main className="tw-lp">
      <LpStyles />
      {/* Quầng sáng theo chuột phủ cả trang — fixed, không chắn click, tự tắt trên cảm ứng. */}
      <CursorGlow />
      <LandingHeader lang={lang} />

      {/* ───────── Hero ───────── */}
      <section className="tw-lp-hero">
        <ParallaxLayers layers={HERO_LAYERS} scrollRange={130} mouseRange={56} tilt={3}>
          {/*
            HERO KHÔNG BỌC `Reveal`. Đây là chỗ từng hỏng nặng nhất của trang.

            `.tw-reveal` đặt `opacity: 0` và chỉ gỡ ra khi IntersectionObserver chạy — tức sau khi
            JavaScript nạp và hydrate xong. Bọc nó quanh NỘI DUNG MÀN HÌNH ĐẦU thì khung hình đầu tiên
            người dùng thấy là MỘT BẦU TRỜI SAO TRỐNG. Chụp được hai lần ở 375px ngày 25/09/2026.

            Hậu quả không chỉ là thẩm mỹ: H1 là phần tử lớn nhất trang, mà một phần tử `opacity: 0`
            không được tính là đã vẽ — nên LCP bị dời tới tận lúc hydrate xong. Đó là một chỉ số xếp
            hạng của Google, không phải chuyện trang trí.

            `Reveal` vẫn dùng tốt cho các khối BÊN DƯỚI màn hình đầu — chỗ người dùng phải cuộn tới.
          */}
          <div className="tw-lp-hero-inner">
            <>
              <span className="tw-pulse tw-lp-badge">
                <GlobalOutlined /> {t("home.lpBadge", "Nền tảng AI cho công việc · tiếng Việt & tiếng Anh")}
              </span>
            </>
            <>
              <h1 className="tw-lp-h1">
                {t("home.lpH1a", "Trợ lý AI")}{" "}
                <span
                  className="tw-gradient-anim"
                  style={{ background: GRADIENT, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}
                >
                  {t("home.lpH1b", "biết làm việc thật")}
                </span>
              </h1>
            </>
            <>
              <p className="tw-lp-lead">
                {t("home.lpHeroP1", "Một trợ lý, bốn cách để nó làm việc cho bạn: trò chuyện và nhận về")}{" "}
                <strong>{t("home.lpHeroStrong", "tệp thật")}</strong>
                {t("home.lpHeroP2", ", tạo web app full-stack, dựng video và bài viết, tự động hoá Lark Base. Nói bằng tiếng Việt hay tiếng Anh đều được.")}
              </p>
            </>
            <>
              <div className="tw-lp-ctas">
                {/* Nút bị con trỏ hút khi lại gần (Magnetic) — phản hồi thấy ngay trước cả khi bấm. */}
                <Magnetic>
                  <Link href="/register" className="tw-shine tw-lp-btn tw-lp-btn-primary">
                    {t("home.lpCtaPrimary", "Dùng thử miễn phí")}
                  </Link>
                </Magnetic>
                <Magnetic>
                  <Link href="/explore" className="tw-lp-btn tw-lp-btn-ghost">
                    {t("home.lpCtaExplore", "Xem app cộng đồng")} →
                  </Link>
                </Magnetic>
              </div>
              <p className="tw-lp-note">
                {t("home.lpHeroNote", "Không cần thẻ tín dụng · Có gói miễn phí · Dùng được ở mọi nơi")}
              </p>
            </>

            {/* Mockup: một khung chat bên trái (gửi tệp → nhận tệp) và bốn ô kết quả bên phải — chính
                là bốn trụ cột trong một tài khoản. Nghiêng nhẹ khi nghỉ, bám theo chuột khi hover
                (TiltCard), lơ lửng (tw-float). Góc tối đa 10° (thẻ thường là 18°): mockup rộng gần
                cả màn, nghiêng hơn là chữ bên trong méo; không hút (magnet=0) vì nó đã lơ lửng sẵn. */}
            {/* Khung mô phỏng cũng KHÔNG bọc `Reveal`: đo ở 375px nó bắt đầu ở 743px, tức vẫn nằm
                trong màn hình đầu 812px. Và đây là thứ DUY NHẤT trên toàn trang cho người ta thấy
                sản phẩm trông ra sao — giấu nó sau một hiệu ứng chờ JavaScript là giấu đúng lập luận
                bán hàng của trang. */}
            <>
              <div className="tw-lp-stage">
                <div className="tw-lp-stage-rest">
                  <div className="tw-float">
                    <TiltCard maxTilt={10} scale={1.02} magnet={0} className="tw-lp-frame">
                      <div className="tw-lp-frame-bar">
                        <i style={{ background: "#FF6058" }} />
                        <i style={{ background: "#FFBD2E" }} />
                        <i style={{ background: "#28C840" }} />
                        <span className="tw-lp-frame-url">toolswave.net/agents-chat</span>
                      </div>
                      <div className="tw-lp-frame-grid">
                        <div className="tw-lp-frame-left">
                          <div className="tw-lp-frame-label">{t("home.lpMockYouSay", "BẠN NÓI")}</div>
                          <div className="tw-lp-bubble">
                            {t("home.lpMockBubble", "Từ bảng doanh thu này, làm cho tôi báo cáo tuần dạng PDF, kèm nhận xét từng chi nhánh.")}
                          </div>
                          <div className="tw-lp-frame-label" style={{ marginTop: 16 }}>{t("home.lpMockReply", "TRỢ LÝ TRẢ VỀ")}</div>
                          <div className="tw-lp-file">
                            <span className="tw-lp-file-ico"><FilePdfOutlined /></span>
                            <div style={{ minWidth: 0 }}>
                              <b>bao-cao-tuan-38.pdf</b>
                              <span>{t("home.lpMockFileState", "Sẵn sàng tải · đọc từ doanh-thu.xlsx")}</span>
                            </div>
                          </div>
                          <div className="tw-lp-live">
                            <i />
                            {t("home.lpMockRunning", "Chạy trên máy chủ — không cần cài gì")}
                          </div>
                        </div>
                        <div className="tw-lp-frame-right">
                          <div className="tw-lp-frame-label">{t("home.lpMockSameAccount", "CÙNG MỘT TÀI KHOẢN, CÙNG MỘT HẠN MỨC")}</div>
                          <div className="tw-lp-tiles">
                            {tiles.map((x) => (
                              <div key={x.title} className="tw-lp-tile">
                                <div className="tw-lp-tile-top">
                                  <i style={{ background: x.color }}>{x.icon}</i>
                                  {x.title}
                                </div>
                                <small>{x.sub}</small>
                                <div className="tw-lp-tile-line" style={{ width: "72%" }} />
                                <div className="tw-lp-tile-line" style={{ width: "46%", opacity: 0.7 }} />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </TiltCard>
                  </div>
                </div>
              </div>
            </>
          </div>
        </ParallaxLayers>
      </section>

      {/* ───────── Trust band ───────── */}
      <section style={{ padding: "8px clamp(16px,5vw,56px) 8px" }}>
        <Reveal>
          <div style={{ maxWidth: 1080, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
            {TRUST_BADGES.map((b) => (
              <span key={b.key} className="tw-lift tw-lp-pill">
                <CheckCircleFilled style={{ color: OK }} /> {t(b.key, b.label)}
              </span>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ───────── Bốn trụ cột ───────── */}
      <section className="tw-lp-section" style={{ paddingBottom: 40, position: "relative", overflow: "hidden" }}>
        <ParallaxLayers layers={PILLAR_LAYERS} scrollRange={90} mouseRange={0} tilt={0}>
          <div className="tw-lp-wrap">
            <Reveal>
              <Heading
                title={t("home.lpPillarsTitle", "Bốn việc, một nền tảng")}
                sub={t("home.lpPillarsSub", "Mỗi mục dưới đây đều đang chạy thật — kể cả những chỗ có điều kiện, chúng tôi ghi rõ ngay trong thẻ.")}
              />
            </Reveal>
            <div className="tw-lp-pillars">
              {PILLARS.map((p, i) => (
                <Reveal key={p.titleKey} delay={(i % 2) * 90} style={FULL}>
                  <TiltCard maxTilt={8} scale={1.015} className="tw-pub-card tw-lp-card tw-lp-pillar">
                    <span className="tw-lp-pillar-n" aria-hidden="true">{p.n}</span>
                    <div className="tw-lp-icon tw-fx-z1" style={{ color: p.accent }}>{p.icon}</div>
                    <h3>{t(p.titleKey, p.title)}</h3>
                    <p>{t(p.descKey, p.desc)}</p>
                    <ul className="tw-lp-pillar-ul">
                      {p.bullets.map((b) => (
                        <li key={b.key}>
                          <CheckCircleFilled style={{ color: p.accent }} /> <span>{t(b.key, b.text)}</span>
                        </li>
                      ))}
                    </ul>
                    {p.noteKey && p.note && <div className="tw-lp-pillar-note">{t(p.noteKey, p.note)}</div>}
                    <Link href={p.href} className="tw-lp-pillar-cta">
                      {p.href === "/download" ? <DesktopOutlined /> : null}
                      {t(p.ctaKey, p.cta)} <ArrowRightOutlined style={{ fontSize: 12 }} />
                    </Link>
                  </TiltCard>
                </Reveal>
              ))}
            </div>

            {/* Ba thứ dùng chung: nhỏ hơn bốn thẻ trên, cùng hàng. */}
            <div className="tw-lp-grid tw-lp-grid-3" style={{ marginTop: 20 }}>
              {SHARED.map((f, i) => (
                <Reveal key={f.titleKey} delay={(i % 3) * 90} style={FULL}>
                  <TiltCard className="tw-pub-card tw-lp-card">
                    <div className="tw-lp-icon tw-fx-z1">{f.icon}</div>
                    <h3>{t(f.titleKey, f.title)}</h3>
                    <p>{t(f.descKey, f.desc)}</p>
                  </TiltCard>
                </Reveal>
              ))}
            </div>
          </div>
        </ParallaxLayers>
      </section>

      {/* ───────── Cách dùng ───────── */}
      <section className="tw-lp-section tw-lp-alt">
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <Reveal>
            <Heading
              title={t("home.lpStepsTitle", "Bốn bước, vài phút")}
              sub={t("home.lpStepsSub", "Cùng một cách làm cho cả bốn mảng: bạn nói, nó làm, bạn nhận kết quả thật.")}
            />
          </Reveal>
          <div className="tw-lp-steps">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 90}>
                <div className="tw-lp-step">
                  <div style={{ position: "relative", display: "inline-flex", marginBottom: 14 }}>
                    <div className="tw-lp-step-ico">{s.icon}</div>
                    <span className="tw-lp-step-n">{s.n}</span>
                  </div>
                  <h3>{t(s.titleKey, s.title)}</h3>
                  <p>{t(s.descKey, s.desc)}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Bạn có thể làm gì ───────── */}
      <section className="tw-lp-section" style={{ padding: "56px clamp(16px,5vw,56px)", maxWidth: 1120, margin: "0 auto" }}>
        <Reveal>
          <Heading
            title={t("home.lpUseCasesTitle", "Bạn có thể làm gì?")}
            sub={t("home.lpUseCasesSub", "Từ một báo cáo tuần đến phần mềm quản lý full-stack — cùng một tài khoản, cùng một hạn mức.")}
          />
        </Reveal>
        <div className="tw-lp-grid tw-lp-grid-uc" style={{ marginBottom: 26 }}>
          {USE_CASE_CARDS.map((c, i) => (
            <Reveal key={c.titleKey} delay={(i % 3) * 100} style={FULL}>
              <TiltCard className="tw-pub-card tw-lp-card" style={{ padding: "24px 22px" }}>
                <div className="tw-lp-icon" style={{ marginBottom: 12 }}>{c.icon}</div>
                <h3 style={{ fontSize: 18 }}>{t(c.titleKey, c.title)}</h3>
                <p>{t(c.descKey, c.desc)}</p>
              </TiltCard>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
            {USE_CASE_TAGS.map((u) => (
              <span key={u.key} className="tw-lp-tag">
                {t(u.key, u.label)}
              </span>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ───────── Vì sao ───────── */}
      <section className="tw-lp-section tw-lp-alt tw-lp-dots">
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <Reveal>
            <Heading title={t("home.lpWhyTitle", "Vì sao chọn Larkwave?")} />
          </Reveal>
          <div className="tw-lp-grid tw-lp-grid-why">
            {WHY.map((w, i) => (
              <Reveal key={w.titleKey} delay={i * 90}>
                <div className="tw-lp-why">
                  <div className="tw-lp-icon" style={{ marginBottom: 12 }}>{w.icon}</div>
                  <h3>{t(w.titleKey, w.title)}</h3>
                  <p>{t(w.descKey, w.desc)}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Gói & giá (rút gọn) ───────── */}
      <section style={{ padding: "56px clamp(16px,5vw,56px)", maxWidth: 1080, margin: "0 auto" }}>
        <Reveal>
          <Heading
            title={t("home.lpPricingTitle", "Bắt đầu miễn phí, nâng cấp khi cần")}
            sub={t("home.lpPricingSub", "Một hạn mức cho cả bốn mảng — xem chi tiết hạn mức & giá ở trang Gói & Giá.")}
          />
        </Reveal>
        <div className="tw-lp-grid tw-lp-grid-plan">
          {PLAN_TEASER.map((p, i) => (
            <Reveal key={p.nameKey} delay={i * 90} style={FULL}>
              {/* Gói nổi bật: viền gradient luôn hiện (không chờ hover). */}
              <TiltCard className={p.highlight ? "tw-pub-card tw-lp-card tw-lp-card-hi" : "tw-pub-card tw-lp-card"} style={{ padding: "26px 22px" }}>
                {p.highlight && (
                  <span className="tw-lp-popular">
                    <ThunderboltOutlined /> {t("home.lpPlanPopular", "Phổ biến")}
                  </span>
                )}
                <div className="tw-lp-plan-name">{t(p.nameKey, p.name)}</div>
                <div className="tw-lp-plan-tag">{t(p.taglineKey, p.tagline)}</div>
                <ul className="tw-lp-plan-ul">
                  {p.points.map((pt) => (
                    <li key={pt.key}>
                      <CheckCircleFilled style={{ color: OK, marginTop: 2 }} /> {t(pt.key, pt.text)}
                    </li>
                  ))}
                </ul>
              </TiltCard>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <div style={{ textAlign: "center", marginTop: 28 }}>
            <Link href="/pricing" className="tw-lp-link-btn">
              {t("home.lpPricingCta", "Xem bảng giá chi tiết")} →
            </Link>
          </div>
        </Reveal>
      </section>

      {/* ───────── Blog ───────── */}
      {posts.length > 0 && (
        <section style={{ padding: "8px clamp(16px,5vw,56px) 56px", maxWidth: 1140, margin: "0 auto" }}>
          <Reveal>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: "clamp(22px,4vw,32px)", fontWeight: 800, margin: "0 0 6px", display: "flex", alignItems: "center", gap: 10 }}>
                  <ReadOutlined style={{ color: BRAND }} /> {t("home.lpBlogTitle", "Từ blog Larkwave")}
                </h2>
                <p style={{ color: V.textSub, fontSize: 16, margin: 0 }}>{t("home.lpBlogSub", "Hướng dẫn, mẹo và câu chuyện để bạn đi nhanh hơn.")}</p>
              </div>
              <Link href="/blog" style={{ color: BRAND, fontWeight: 700, fontSize: 15 }}>
                {t("home.lpBlogAll", "Tất cả bài viết")} <ArrowRightOutlined style={{ fontSize: 12 }} />
              </Link>
            </div>
          </Reveal>
          <div className="tw-lp-grid tw-lp-grid-3" style={{ gap: 22 }}>
            {posts.map((p, i) => (
              <Reveal key={p.id} delay={i * 90} style={FULL}>
                <TiltCard className="tw-pub-card tw-lp-card" style={{ padding: 8 }}>
                  <Link href={`/blog/${p.slug}`} className="tw-lp-blog-card">
                    <div className="tw-lp-blog-cover" style={{ background: p.coverImage ? `center/cover no-repeat url(${p.coverImage})` : GRADIENT }} />
                    <div className="tw-lp-blog-body">
                      {p.tags[0] && <span style={{ color: BRAND, fontWeight: 600, fontSize: 12.5 }}>{p.tags[0]}</span>}
                      <h3>{p.title}</h3>
                      {p.excerpt && <p>{p.excerpt}</p>}
                      <div style={{ color: V.textFaint, fontSize: 12.5 }}>{fmtDate(p.publishedAt)}</div>
                    </div>
                  </Link>
                </TiltCard>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* ───────── FAQ ───────── */}
      <section style={{ padding: "8px clamp(16px,5vw,56px) 56px", maxWidth: 820, margin: "0 auto" }}>
        <Reveal>
          <Heading title={t("home.lpFaqTitle", "Câu hỏi thường gặp")} />
        </Reveal>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {FAQS.map((f, i) => (
            <Reveal key={f.qKey} delay={(i % 3) * 60}>
              <details className="tw-lp-faq">
                <summary>{t(f.qKey, f.q)}</summary>
                <p>{t(f.aKey, f.a)}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ───────── CTA cuối ───────── */}
      <section style={{ padding: "clamp(48px,8vw,86px) clamp(16px,5vw,56px)", textAlign: "center" }}>
        <Reveal>
          <div className="tw-lp-cta">
            <SafetyCertificateOutlined style={{ position: "absolute", right: -10, top: -10, fontSize: 130, opacity: 0.12 }} />
            <h2 style={{ position: "relative" }}>{t("home.lpCtaTitle", "Giao việc cho trợ lý ngay hôm nay")}</h2>
            <p style={{ position: "relative" }}>{t("home.lpCtaSub", "Miễn phí để thử, không cần thẻ. Một câu mô tả — phần còn lại để nó làm.")}</p>
            <Link href="/register" className="tw-shine tw-lp-cta-btn" style={{ position: "relative" }}>
              {t("home.lpCtaFinal", "Dùng thử miễn phí")} <ArrowRightOutlined />
            </Link>
          </div>
        </Reveal>
      </section>

      <LandingFooter lang={lang} />
    </main>
  );
}
