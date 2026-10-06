"use client";

import {
  ApiOutlined,
  ArrowRightOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
  CloudSyncOutlined,
  CodeOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  DesktopOutlined,
  EditOutlined,
  FilePdfOutlined,
  GlobalOutlined,
  MessageOutlined,
  ReadOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SolutionOutlined,
  TableOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import { type CSSProperties, type ReactNode } from "react";
import { OK, type Locale } from "@larkwave/ui";
import { useLangT } from "@/lib/useLangT";
import Reveal from "@/components/Reveal";
import { CursorGlow, HeroShader, Magnetic, ParallaxLayers, TiltCard, type ParallaxLayer } from "@/components/fx";
import { LandingHeader, LandingFooter } from "@/components/LandingChrome";
import { FAQS } from "@/app/welcome/content";

const BRAND = "#6C5CE7";
const GRADIENT =
  "linear-gradient(120deg, #6C5CE7 0%, #A66BFF 40%, #FF7AB6 70%, #4FB6FF 100%)";

/**
 * TRANG CHỦ LARKWAVE — định vị BỐN TRỤ CỘT: Lark Agents (AI đọc/ghi Lark) · tự động hoá theo lịch ·
 * Trợ lý AI trên web · chia sẻ & điều khiển từ xa. Giao diện Việt/Anh tự theo trình duyệt; tiếng
 * Việt là thế mạnh được nêu ra, không phải điều kiện để dùng.
 *
 * Nguyên tắc viết: mỗi câu phải có thật và kiểm được trong mã nguồn. Giới hạn quan trọng (Lark
 * Agents cần app máy tính; chạy hộ khi tắt máy ở gói Chuyên nghiệp trở lên) được viết THẲNG vào
 * mô tả thay vì giấu đi. Gói và quyền lợi theo apps/api/src/billing/plans.ts.
 *
 * BẪY i18n: `t(key, fallback)` ƯU TIÊN bảng `MESSAGES` trong packages/ui/src/i18n.tsx; câu thứ hai
 * chỉ hiện khi THIẾU khoá. Mọi khoá ở đây mang hậu tố `.lw` (khoá mới, không trùng bản dịch cũ của
 * thời còn tạo app) và phải có cả `vi` lẫn `en` trong bảng, `vi` khớp từng chữ với câu dự phòng.
 * Trong mọi object, trường `xKey` luôn đứng NGAY TRƯỚC trường `x` để script đo lệch bắt được cặp.
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
    icon: <ApiOutlined />,
    accent: "#6C5CE7",
    titleKey: "home.lpP1Title.lw",
    title: "Lark Agents: AI làm việc trong Lark",
    descKey: "home.lpP1Desc.lw",
    desc: "Kết nối tài khoản Lark/Feishu bằng mã QR rồi giao việc bằng lời: AI đọc và ghi Bitable, Docs, Sheets, Wiki, Drive, Lịch và tin nhắn — với tư cách chính bạn.",
    bullets: [
      { key: "home.lpP1B1.lw", text: "Bitable: bảng, trường, view, bản ghi hàng loạt, phân quyền Base" },
      { key: "home.lpP1B2.lw", text: "Tạo Base có tên, đặt đúng thư mục; đính kèm tệp vào hội thoại" },
      { key: "home.lpP1B3.lw", text: "Mọi thao tác ghi đều hỏi bạn duyệt trước" },
    ],
    noteKey: "home.lpP1Note.lw",
    note: "Phần này chạy qua app máy tính Larkwave (macOS/Windows).",
    ctaKey: "home.lpP1Cta.lw",
    cta: "Tải app máy tính",
    href: "/download",
  },
  {
    n: "02",
    icon: <ClockCircleOutlined />,
    accent: "#4FB6FF",
    titleKey: "home.lpP2Title.lw",
    title: "Tự động hoá Lark theo lịch",
    descKey: "home.lpP2Desc.lw",
    desc: "\"Mỗi ngày 9h tổng hợp đơn mới rồi gửi vào nhóm\" — đặt một lần, trợ lý tự chạy. Kích hoạt theo giờ, bằng bot hoặc webhook.",
    bullets: [
      { key: "home.lpP2B1.lw", text: "Lịch hằng ngày, hằng tuần hoặc theo giờ bạn chọn" },
      { key: "home.lpP2B2.lw", text: "Kích hoạt bằng bot Lark, webhook hoặc Telegram" },
      { key: "home.lpP2B3.lw", text: "Larkwave chạy hộ: lịch vẫn chạy khi máy bạn tắt" },
    ],
    noteKey: "home.lpP2Note.lw",
    note: "Chạy hộ khi tắt máy có ở gói Chuyên nghiệp trở lên.",
    ctaKey: "home.lpP2Cta.lw",
    cta: "Đặt lịch đầu tiên",
    href: "/register",
  },
  {
    n: "03",
    icon: <RobotOutlined />,
    accent: "#A66BFF",
    titleKey: "home.lpP3Title.lw",
    title: "Trợ lý AI trả về tệp thật",
    descKey: "home.lpP3Desc.lw",
    desc: "Gửi bảng tính, PDF, Word hay ảnh — trợ lý đọc rồi trả về đúng tệp bạn cần. Dùng ngay trên trình duyệt hoặc trong app máy tính.",
    bullets: [
      { key: "home.lpP3B1.lw", text: "Xuất xlsx, docx, pdf, csv để tải về" },
      { key: "home.lpP3B2.lw", text: "Dự án có chỉ dẫn riêng; Artifacts chia sẻ bằng link công khai" },
      { key: "home.lpP3B3.lw", text: "Tủ tệp lưu tài liệu bạn đã gửi cho trợ lý" },
    ],
    ctaKey: "home.lpP3Cta.lw",
    cta: "Bắt đầu trò chuyện",
    href: "/register",
  },
  {
    n: "04",
    icon: <TeamOutlined />,
    accent: "#FF7AB6",
    titleKey: "home.lpP4Title.lw",
    title: "Chia sẻ và điều khiển từ xa",
    descKey: "home.lpP4Desc.lw",
    desc: "Cho đồng đội dùng trợ lý Lark của bạn bằng quyền uỷ thác — không lộ mật khẩu hay khoá. Ra ngoài vẫn giao việc cho máy tính ở nhà từ điện thoại.",
    bullets: [
      { key: "home.lpP4B1.lw", text: "Cấp và thu hồi quyền cho từng người; hội thoại dùng chung" },
      { key: "home.lpP4B2.lw", text: "Trò chuyện từ điện thoại/web, chạy trên app máy tính của bạn" },
      { key: "home.lpP4B3.lw", text: "Webhook API và Telegram để kích hoạt tác vụ AI" },
    ],
    ctaKey: "home.lpP4Cta.lw",
    cta: "Tạo tài khoản",
    href: "/register",
  },
];

/** Ba thứ dùng chung cho cả bốn trụ cột. */
const SHARED: { icon: ReactNode; titleKey: string; title: string; descKey: string; desc: string }[] = [
  {
    icon: <ThunderboltOutlined />,
    titleKey: "home.lpShared1Title.lw",
    title: "Kỹ năng và lệnh /tắt",
    descKey: "home.lpShared1Desc.lw",
    desc: "Lưu cách làm quen tay thành Kỹ năng, gọi lại bằng /tên-lệnh. Nối nhiều kỹ năng thành chuỗi được kiểm chéo từng bước.",
  },
  {
    icon: <DashboardOutlined />,
    titleKey: "home.lpShared2Title.lw",
    title: "Dùng AI của bạn, hoặc của Larkwave",
    descKey: "home.lpShared2Desc.lw",
    desc: "Chạy bằng Claude, Codex, Gemini hay Grok đã cài trên máy — không trừ hạn mức. Không muốn cài gì thì dùng Claude của Larkwave, trừ theo % hạn mức tháng.",
  },
  {
    icon: <GlobalOutlined />,
    titleKey: "home.lpShared3Title.lw",
    title: "Tiếng Việt và tiếng Anh",
    descKey: "home.lpShared3Desc.lw",
    desc: "Giao diện có cả hai, tự theo ngôn ngữ trình duyệt và đổi được bất cứ lúc nào. Tiếng Việt được chăm kỹ — là thế mạnh, không phải giới hạn.",
  },
];

const STEPS: { n: string; icon: ReactNode; titleKey: string; title: string; descKey: string; desc: string }[] = [
  {
    n: "1",
    icon: <DesktopOutlined />,
    titleKey: "home.lpStep1Title.lw",
    title: "Cài app, quét QR",
    descKey: "home.lpStep1Desc.lw",
    desc: "Tải app máy tính, đăng nhập Lark bằng mã QR. Tài khoản Larkwave miễn phí, không cần thẻ.",
  },
  {
    n: "2",
    icon: <EditOutlined />,
    titleKey: "home.lpStep2Title.lw",
    title: "Nói điều bạn cần",
    descKey: "home.lpStep2Desc.lw",
    desc: "Gõ một câu, đính kèm tệp nếu có — tiếng Việt hay tiếng Anh. Trợ lý tự tìm đúng Base, tài liệu, nhóm chat.",
  },
  {
    n: "3",
    icon: <SafetyCertificateOutlined />,
    titleKey: "home.lpStep3Title.lw",
    title: "Duyệt rồi nhận kết quả",
    descKey: "home.lpStep3Desc.lw",
    desc: "Mỗi thao tác ghi hiện để bạn duyệt. Kết quả là bản ghi đã cập nhật, tài liệu đã tạo hoặc tệp để tải.",
  },
  {
    n: "4",
    icon: <ClockCircleOutlined />,
    titleKey: "home.lpStep4Title.lw",
    title: "Đặt lịch để tự chạy",
    descKey: "home.lpStep4Desc.lw",
    desc: "Biến việc vừa làm thành lịch hằng ngày hay hằng tuần — Larkwave chạy hộ kể cả khi bạn tắt máy.",
  },
];

const USE_CASE_CARDS: { icon: ReactNode; titleKey: string; title: string; descKey: string; desc: string }[] = [
  {
    icon: <FilePdfOutlined />,
    titleKey: "home.lpUc1Title.lw",
    title: "Báo cáo từ Base",
    descKey: "home.lpUc1Desc.lw",
    desc: "Tổng hợp doanh thu, đơn hàng, tiến độ từ Bitable rồi xuất thành xlsx/docx/pdf — hoặc gửi thẳng vào nhóm chat.",
  },
  {
    icon: <TableOutlined />,
    titleKey: "home.lpUc2Title.lw",
    title: "Nhập liệu hàng loạt",
    descKey: "home.lpUc2Desc.lw",
    desc: "Gửi Excel/CSV, trợ lý ghép đúng trường và ghi hàng trăm bản ghi vào Base — bạn duyệt trước khi ghi.",
  },
  {
    icon: <DatabaseOutlined />,
    titleKey: "home.lpUc3Title.lw",
    title: "Dựng Base và phân quyền",
    descKey: "home.lpUc3Desc.lw",
    desc: "Tạo Base có tên, đặt đúng thư mục, thêm bảng, trường, view và vai trò chỉ bằng một câu mô tả.",
  },
  {
    icon: <SolutionOutlined />,
    titleKey: "home.lpUc4Title.lw",
    title: "Tóm tắt tin nhắn và lịch",
    descKey: "home.lpUc4Desc.lw",
    desc: "Tóm tắt nhóm chat, liệt kê việc cần làm, đọc lịch họp trong tuần — theo yêu cầu hoặc theo lịch.",
  },
  {
    icon: <ReadOutlined />,
    titleKey: "home.lpUc5Title.lw",
    title: "Đặc tả sống từ Lark",
    descKey: "home.lpUc5Desc.lw",
    desc: "Một tài liệu đặc tả luôn mới, kéo trực tiếp từ Docs/Wiki của Lark — không phải chép tay mỗi lần đổi.",
  },
  {
    icon: <CloudSyncOutlined />,
    titleKey: "home.lpUc6Title.lw",
    title: "Đồng bộ CMS Bitable",
    descKey: "home.lpUc6Desc.lw",
    desc: "Giữ dữ liệu Bitable khớp với CMS, xem thống kê, tìm và sửa bản ghi — trên nhiều tài khoản Lark.",
  },
];

const USE_CASE_TAGS: { key: string; label: string }[] = [
  { key: "home.lpTag1.lw", label: "Báo cáo tuần từ Bitable" },
  { key: "home.lpTag2.lw", label: "Nhập đơn hàng từ Excel" },
  { key: "home.lpTag3.lw", label: "Tóm tắt nhóm chat mỗi sáng" },
  { key: "home.lpTag4.lw", label: "Soạn tài liệu vào Wiki" },
  { key: "home.lpTag5.lw", label: "Tóm tắt & dịch tài liệu" },
  { key: "home.lpTag6.lw", label: "Nhắc lịch họp trong ngày" },
];

const WHY: { icon: ReactNode; titleKey: string; title: string; descKey: string; desc: string }[] = [
  {
    icon: <SafetyCertificateOutlined />,
    titleKey: "home.lpWhy1Title.lw",
    title: "Ghi gì cũng hỏi trước",
    descKey: "home.lpWhy1Desc.lw",
    desc: "AI không tự ý sửa dữ liệu Lark: mỗi thao tác ghi hiện rõ sẽ làm gì để bạn duyệt hoặc bỏ.",
  },
  {
    icon: <CodeOutlined />,
    titleKey: "home.lpWhy2Title.lw",
    title: "Chạy bằng AI của bạn",
    descKey: "home.lpWhy2Desc.lw",
    desc: "Đã có Claude, Codex, Gemini hay Grok trên máy? Larkwave dùng luôn — không tốn thêm phí AI, không trừ hạn mức.",
  },
  {
    icon: <TeamOutlined />,
    titleKey: "home.lpWhy3Title.lw",
    title: "Chia sẻ mà không lộ khoá",
    descKey: "home.lpWhy3Desc.lw",
    desc: "Đồng đội dùng trợ lý của bạn qua quyền uỷ thác, thu hồi lúc nào cũng được — không ai phải cầm mật khẩu hay app secret.",
  },
  {
    icon: <DatabaseOutlined />,
    titleKey: "home.lpWhy4Title.lw",
    title: "Nói thẳng giới hạn",
    descKey: "home.lpWhy4Desc.lw",
    desc: "Lark Agents cần app máy tính; chạy hộ khi tắt máy ở gói Chuyên nghiệp. Ghi rõ ở đây, không giấu trong điều khoản.",
  },
];

const TRUST_BADGES: { key: string; label: string }[] = [
  { key: "home.lpTrust1.lw", label: "Bitable · Docs · Sheets · Wiki · Drive · Lịch" },
  { key: "home.lpTrust2.lw", label: "Mọi thao tác ghi đều hỏi trước" },
  { key: "home.lpTrust3.lw", label: "Xuất xlsx · docx · pdf · csv" },
  { key: "home.lpTrust4.lw", label: "Tự chạy theo lịch, kể cả khi tắt máy" },
  { key: "home.lpTrust5.lw", label: "App macOS & Windows" },
  { key: "home.lpTrust6.lw", label: "Giao diện tiếng Việt & tiếng Anh" },
];

/**
 * Ba gói đầu của bảng giá, đúng theo apps/api/src/billing/plans.ts: Miễn phí · Khởi đầu (starter)
 * · Chuyên nghiệp (pro). Không ghi giá ở đây: giá theo VND nằm ở /pricing, trang chủ chỉ nói
 * quyền lợi.
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
      { key: "home.lpPlanFreeP1.lw", text: "Lark Agents đủ Bitable, Docs, Sheets, Wiki, Drive, Lịch" },
      { key: "home.lpPlanFreeP2.lw", text: "Chạy trên AI của máy bạn — không tính hạn mức" },
      { key: "home.lpPlanFreeP3.lw", text: "Trợ lý AI · Kỹ năng · Artifacts" },
    ],
    highlight: false,
  },
  {
    nameKey: "home.lpPlanStarterName",
    name: "Khởi đầu",
    taglineKey: "home.lpPlanStarterTagline.lw",
    tagline: "Cho người dùng hằng ngày",
    points: [
      { key: "home.lpPlanStarterP1", text: "Hạn mức gấp ~10× gói Miễn phí" },
      { key: "home.lpPlanStarterP2.lw", text: "Claude do Larkwave cung cấp, không cần cài" },
      { key: "home.lpPlanStarterP3.lw", text: "Tự động hoá theo lịch · Đặc tả · Điều khiển từ xa" },
    ],
    highlight: true,
  },
  {
    nameKey: "home.lpPlanProName",
    name: "Chuyên nghiệp",
    taglineKey: "home.lpPlanProTagline.lw",
    tagline: "Cho đội nhóm dùng chung",
    points: [
      { key: "home.lpPlanProP1", text: "Hạn mức gấp ~33× gói Miễn phí" },
      { key: "home.lpPlanProP2.lw", text: "Larkwave chạy hộ lịch khi máy bạn tắt" },
      { key: "home.lpPlanProP3.lw", text: "Chia sẻ trợ lý cho đồng đội · CMS nhiều tài khoản" },
    ],
    highlight: false,
  },
];

/**
 * CSS riêng của trang, gắn bằng `<style href precedence>` (React 19) giống FxStyles: có mặt ngay
 * trong HTML server trả về nên khung hình đầu đã đúng bố cục, và React chỉ giữ MỘT bản dù
 * component render lại.
 *
 * Bề mặt thẻ KHÔNG tự khai màu: mọi thẻ mang class `tw-pub-card` (globals.css) để ăn chung token
 * `--tw-pub-card-*` với /download, /pricing — một chỗ chỉnh độ sáng kính là cả site theo.
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
 * (24/09 ở /pricing, 25/09 ở chính trang chủ) — xem `lib/useLangT.ts`.
 */
export default function LandingPage({ lang }: { lang?: Locale }) {
  const t = useLangT(lang);

  /* Bốn ô kết quả trong mockup — mỗi ô một mảng Lark. Chữ mẫu (số bản ghi, giờ) là minh hoạ,
     nhưng DẠNG của chúng là thật: bản ghi Bitable đã duyệt, lịch có giờ, tài liệu, tin nhắn nhóm. */
  const tiles: { icon: ReactNode; color: string; title: string; sub: string }[] = [
    { icon: <ApiOutlined />, color: "#6C5CE7", title: t("home.lpMockTileLark", "Lark Base"), sub: t("home.lpMockTileLarkSub.lw", "128 bản ghi đã cập nhật · đã duyệt") },
    { icon: <ClockCircleOutlined />, color: "#A66BFF", title: t("home.lpMockTileSched", "Lịch hẹn"), sub: t("home.lpMockTileSchedSub.lw", "Mỗi ngày · 09:00 · chạy hộ") },
    { icon: <ReadOutlined />, color: "#4FB6FF", title: t("home.lpMockTileDocs.lw", "Docs & Wiki"), sub: t("home.lpMockTileDocsSub.lw", "Đặc tả đã đồng bộ từ Wiki") },
    { icon: <MessageOutlined />, color: "#FF7AB6", title: t("home.lpMockTileMsg.lw", "Tin nhắn"), sub: t("home.lpMockTileMsgSub.lw", "Đã gửi tóm tắt vào nhóm") },
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
                <GlobalOutlined /> {t("home.lpBadge.lw", "AI cho Lark & Feishu · tiếng Việt & tiếng Anh")}
              </span>
            </>
            <>
              <h1 className="tw-lp-h1">
                {t("home.lpH1a.lw", "Trợ lý AI")}{" "}
                <span
                  className="tw-gradient-anim"
                  style={{ background: GRADIENT, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}
                >
                  {t("home.lpH1b.lw", "làm việc thật trong Lark")}
                </span>
              </h1>
            </>
            <>
              <p className="tw-lp-lead">
                {t("home.lpHeroP1.lw", "Kết nối tài khoản Lark, giao việc bằng một câu: AI đọc và ghi Bitable, Docs, Sheets, Wiki, Drive, Lịch và tin nhắn —")}{" "}
                <strong>{t("home.lpHeroStrong.lw", "ghi gì cũng hỏi bạn trước")}</strong>
                {t("home.lpHeroP2.lw", ". Đặt lịch để nó tự chạy, nhận về tệp xlsx/docx/pdf thật. Nói bằng tiếng Việt hay tiếng Anh đều được.")}
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
                  <Link href="/download" className="tw-lp-btn tw-lp-btn-ghost">
                    {t("home.lpCtaDownload.lw", "Tải app máy tính")} →
                  </Link>
                </Magnetic>
              </div>
              <p className="tw-lp-note">
                {t("home.lpHeroNote.lw", "Không cần thẻ tín dụng · Có gói miễn phí · macOS & Windows")}
              </p>
            </>

            {/* Mockup: một khung chat bên trái (giao việc → nhận tệp) và bốn ô kết quả bên phải — các
                mảng Lark trong cùng một tài khoản. Nghiêng nhẹ khi nghỉ, bám theo chuột khi hover
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
                        <span className="tw-lp-frame-url">Larkwave · Lark Agents</span>
                      </div>
                      <div className="tw-lp-frame-grid">
                        <div className="tw-lp-frame-left">
                          <div className="tw-lp-frame-label">{t("home.lpMockYouSay", "BẠN NÓI")}</div>
                          <div className="tw-lp-bubble">
                            {t("home.lpMockBubble.lw", "Từ Base Đơn hàng, tổng hợp doanh thu tuần theo chi nhánh rồi xuất báo cáo PDF, gửi vào nhóm Kinh doanh.")}
                          </div>
                          <div className="tw-lp-frame-label" style={{ marginTop: 16 }}>{t("home.lpMockReply", "TRỢ LÝ TRẢ VỀ")}</div>
                          <div className="tw-lp-file">
                            <span className="tw-lp-file-ico"><FilePdfOutlined /></span>
                            <div style={{ minWidth: 0 }}>
                              <b>bao-cao-tuan-38.pdf</b>
                              <span>{t("home.lpMockFileState.lw", "Sẵn sàng tải · đọc từ Base Đơn hàng")}</span>
                            </div>
                          </div>
                          <div className="tw-lp-live">
                            <i />
                            {t("home.lpMockRunning.lw", "Chạy trên app máy tính · bằng AI của bạn")}
                          </div>
                        </div>
                        <div className="tw-lp-frame-right">
                          <div className="tw-lp-frame-label">{t("home.lpMockSameAccount.lw", "CÙNG MỘT TÀI KHOẢN LARK")}</div>
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
                title={t("home.lpPillarsTitle.lw", "Mọi việc trên Lark, một trợ lý")}
                sub={t("home.lpPillarsSub.lw", "Mỗi mục dưới đây đều đang chạy thật — kể cả những chỗ có điều kiện, chúng tôi ghi rõ ngay trong thẻ.")}
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
              title={t("home.lpStepsTitle.lw", "Bốn bước, vài phút")}
              sub={t("home.lpStepsSub.lw", "Bạn nói, trợ lý làm, bạn duyệt — rồi để nó tự chạy theo lịch.")}
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
            title={t("home.lpUseCasesTitle.lw", "Bạn có thể làm gì?")}
            sub={t("home.lpUseCasesSub.lw", "Từ một báo cáo tuần đến cả quy trình vận hành trên Lark Base — chỉ bằng lời nói.")}
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
            <Heading title={t("home.lpWhyTitle.lw", "Vì sao chọn Larkwave?")} />
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
            title={t("home.lpPricingTitle.lw", "Bắt đầu miễn phí, nâng cấp khi cần")}
            sub={t("home.lpPricingSub.lw", "Mỗi gói là một hạn mức dùng AI hàng tháng — xem chi tiết hạn mức & giá ở trang Gói & Giá.")}
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
            <h2 style={{ position: "relative" }}>{t("home.lpCtaTitle.lw", "Giao việc Lark cho trợ lý ngay hôm nay")}</h2>
            <p style={{ position: "relative" }}>{t("home.lpCtaSub.lw", "Miễn phí để thử, không cần thẻ. Một câu mô tả — phần còn lại để nó làm, bạn chỉ việc duyệt.")}</p>
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
