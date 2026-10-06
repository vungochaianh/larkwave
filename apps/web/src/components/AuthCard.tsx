"use client";

import { ThunderboltOutlined } from "@ant-design/icons";
import type { Locale } from "@larkwave/ui";
import { ConfigProvider, type ThemeConfig } from "antd";
import type { CSSProperties, ReactNode } from "react";
import { CursorGlow, HeroShader, TiltCard, FX_DARK_PALETTE as D } from "@/components/fx";
import { LandingHeader, LandingFooter } from "@/components/LandingChrome";

/**
 * Vỏ trình bày chung của bốn trang xác thực (/login, /register, /forgot, /reset). CHỈ là trình
 * bày: mọi thứ về gọi API, chuyển hướng, nút OAuth đều nằm ở từng trang và không đi qua đây.
 *
 * Bản này làm lại theo cùng ngôn ngữ với /welcome (09/2026): nền đen-tím, sàn lưới WebGL có sương
 * mù ở phía sau, một tấm kính nghiêng nhẹ theo chuột đặt trước nó, đèn rọi bám con trỏ. Người
 * dùng chỉ ở đây vài giây nên được phép "mạnh tay" hơn màn hình làm việc — nhưng có ba thứ KHÔNG
 * được hy sinh cho đẹp, vì hỏng chúng là hỏng đăng nhập của người thật:
 *
 *  1. Ô nhập phải đọc rõ: nền ô sáng hơn mặt kính rõ rệt (#1A1731 trên ~#10101A), viền trắng 16%
 *     luôn thấy được (không chỉ khi focus), chữ #F2F1FA. Trang này bọc trong ForceDark nên antd
 *     đã ở dark algorithm; ta chỉ ghi đè token của Input/Button/Alert trong ConfigProvider LỒNG
 *     (antd v5 gộp theme lồng với theme cha) chứ không dựng theme mới.
 *  2. Lỗi phải nổi: colorError nâng lên #FF7A85 (đỏ chuẩn #EF4444 trên nền gần đen chỉ ~4.4:1,
 *     viền ô báo lỗi lúc đó mờ như viền thường). Alert lỗi có nền đỏ pha và viền đỏ sáng.
 *  3. Autofill của trình duyệt: Chrome tô nền ô bằng màu riêng (#E8F0FE, hoặc xanh xám khi
 *     color-scheme dark) và ép màu chữ — thành ô sáng chữ trắng hoặc ô sáng trong ô tối. Không
 *     ghi đè được bằng `background` thường; cách duy nhất chắc chắn là box-shadow inset 1000px
 *     cùng màu với nền ô + `-webkit-text-fill-color`. Firefox dùng `:autofill` và phải tách rule
 *     riêng: một selector lạ làm trình duyệt bỏ CẢ rule.
 *
 * Vì sao TiltCard nghiêng rất ít (6° thay vì 18° như thẻ landing): đây là thẻ người ta gõ chữ vào.
 * Nghiêng mạnh làm chữ trong ô méo khi chuột lướt qua; 6° đủ thấy chiều sâu (cùng viền phát sáng
 * bám chuột và vệt quét lúc bước vào) mà chữ vẫn thẳng. Không lực hút, không phóng — thẻ phải đứng
 * yên dưới con trỏ khi người dùng nhắm vào một ô.
 *
 * Vì sao thẻ nằm TRÊN CursorGlow (z-index 1 > 0): đèn rọi blend `screen` cộng sáng vào mọi thứ nó
 * đi qua — trên landing là đẹp, trên một ô đang gõ là nền ô đổi màu theo chuột. Để đèn chiếu lên
 * nền và mép kính thôi; ánh sáng trên mặt thẻ đã có glare + viền của TiltCard lo.
 */

/**
 * Kiểu cho link inline trong 4 trang (Đăng ký / Quên mật khẩu / Đăng nhập): tím sáng #A99BFF thay
 * cho #6C5CE7 — cùng thương hiệu, nhưng đủ tương phản ở cỡ chữ 13.5px trên nền gần đen.
 */
export const authLink: CSSProperties = { color: "#A99BFF", fontWeight: 600 };

const INPUT_BG = "#1A1731";
const INPUT_TEXT = "#F2F1FA";
const ACCENT_SOFT = "#A99BFF"; // tím sáng hơn #6C5CE7: link 13.5px trên nền gần đen cần ~7:1, #6C5CE7 chỉ ~3.4:1
const ERROR = "#FF7A85";
const GRADIENT = "linear-gradient(135deg, #6C5CE7 0%, #A66BFF 45%, #FF7AB6 75%, #4FB6FF 100%)";

const authFormTheme: ThemeConfig = {
  token: {
    colorError: ERROR,
    colorLink: ACCENT_SOFT,
    colorLinkHover: "#C3B8FF",
  },
  components: {
    Input: {
      // colorError ở cấp component: đặt ở token gốc thì dark algorithm sinh lại bảng màu và trả về
      // một đỏ tối hơn (đo được rgb(220,107,116)); token cấp component được dùng nguyên.
      colorError: ERROR,
      colorBgContainer: INPUT_BG,
      hoverBg: INPUT_BG,
      activeBg: INPUT_BG,
      colorBorder: "rgba(255,255,255,0.16)",
      hoverBorderColor: "rgba(255,255,255,0.34)",
      activeBorderColor: ACCENT_SOFT,
      activeShadow: "0 0 0 3px rgba(108,92,231,0.30)",
      errorActiveShadow: "0 0 0 3px rgba(255,122,133,0.28)",
      colorText: INPUT_TEXT,
      colorTextPlaceholder: "#7F7BA3",
      colorIcon: "#8E8AB0",
      colorIconHover: INPUT_TEXT,
      controlHeightLG: 46,
    },
    Button: {
      controlHeightLG: 46,
      // Nút OAuth (type default) thành nút kính: nền trắng 5% + viền trắng 14%, hover sáng lên.
      defaultBg: "rgba(255,255,255,0.05)",
      defaultBorderColor: "rgba(255,255,255,0.14)",
      defaultColor: D.text,
      defaultHoverBg: "rgba(255,255,255,0.10)",
      defaultHoverBorderColor: "rgba(255,255,255,0.32)",
      defaultHoverColor: "#FFFFFF",
      defaultActiveBg: "rgba(255,255,255,0.07)",
      defaultActiveBorderColor: "rgba(255,255,255,0.32)",
      defaultActiveColor: "#FFFFFF",
      // Nút chính phát sáng tím: đây là hành động duy nhất của trang, cho nó ánh sáng.
      primaryShadow: "0 8px 26px rgba(108,92,231,0.45)",
    },
    Alert: {
      colorError: ERROR,
      colorErrorBg: "rgba(239,68,68,0.16)",
      colorErrorBorder: "rgba(255,122,133,0.55)",
    },
    Form: {
      colorError: ERROR,
      labelColor: "#CFCCE6",
    },
    Divider: {
      colorSplit: "rgba(255,255,255,0.12)",
    },
  },
};

/**
 * CSS riêng của vỏ xác thực, gắn bằng `<style href precedence>` (React 19) như FxStyles: có mặt
 * trong HTML server trả về nên khung hình đầu đã đúng, và nhiều trang dùng chung chỉ sinh một bản.
 */
const AUTH_CSS = `
.tw-auth{position:relative;min-height:100vh;display:flex;flex-direction:column;isolation:isolate;background:${D.layer};color:${D.text};}
/* Sân khấu nền: shader phủ toàn trang, mờ dần ở rìa (mask radial) để lưới tan vào nền đen thay vì
   cắt cứng ở mép header/footer. pointer-events none để không chắn thao tác. */
.tw-auth-stage{position:absolute;inset:0;z-index:0;pointer-events:none;overflow:hidden;}
/* Hai quầng màu mờ phía sau thẻ, cùng bộ màu với hero landing nhưng nhỏ và ở gần thẻ hơn — đây là
   "ánh sáng môi trường" làm mặt kính có màu, không phải trang trí góc trang. */
.tw-auth-orb{position:absolute;border-radius:50%;filter:blur(70px);pointer-events:none;}
.tw-auth-orb-a{width:52vw;height:52vw;max-width:640px;max-height:640px;left:50%;top:38%;transform:translate(-78%,-60%);background:radial-gradient(circle,rgba(108,92,231,.42),transparent 70%);animation:tw-auth-drift-a 14s ease-in-out infinite alternate;}
.tw-auth-orb-b{width:44vw;height:44vw;max-width:520px;max-height:520px;left:50%;top:50%;transform:translate(-18%,-30%);background:radial-gradient(circle,rgba(255,122,182,.26),transparent 70%);animation:tw-auth-drift-b 17s ease-in-out infinite alternate;}
@keyframes tw-auth-drift-a{from{transform:translate(-78%,-60%)}to{transform:translate(-64%,-50%)}}
@keyframes tw-auth-drift-b{from{transform:translate(-18%,-30%)}to{transform:translate(-30%,-42%)}}

.tw-auth-body{position:relative;z-index:1;flex:1;display:flex;align-items:center;justify-content:center;padding:clamp(20px,4vw,40px) 16px;}
/* Mặt kính (tw-fx-glass từ FxStyles cho nền/viền/bóng/vệt sáng 1px mép trên). Thẻ nhỉnh hơn nền
   rất ít — chiều sâu đến từ bóng đen sâu, vệt sáng mép trên và viền phát sáng bám chuột. */
/* Hiệu ứng "trồi lên" đặt ở wrapper chứ KHÔNG đặt lên thẻ: keyframe có transform sẽ ghi đè vĩnh
   viễn (fill both) transform nghiêng của TiltCard — thẻ đứng chết. */
.tw-auth-rise{width:100%;max-width:440px;animation:tw-auth-rise .55s cubic-bezier(.22,1,.36,1) both;}
/* box-sizing PHẢI là border-box: app không reset * {box-sizing} toàn cục, nên width:100% + padding
   hai bên làm thẻ rộng hơn wrapper đúng bằng padding (đo được ở 380px: 348 + 2×20 + viền = 390px)
   → mép phải ô nhập và nút bị xén, không kéo tới được. */
.tw-auth-card{box-sizing:border-box;width:100%;border-radius:22px;padding:clamp(26px,5vw,38px) clamp(20px,5vw,36px);}
/* Kính KHÓI chứ không phải kính trong: vệt sáng chân trời của shader đi ngang đúng tầm tiêu đề/phụ đề
   (đã chụp thấy), qua kính 3.5% trắng nó làm chữ phụ chìm vào dải hồng. Tô thêm một lớp đen-tím 62%
   phía sau — nền vẫn thấy mờ mờ qua thẻ, nhưng chữ và ô luôn nằm trên nền đủ tối. Specificity
   (0,2,0) để thắng .tw-fx-glass (0,1,0) bất kể thứ tự chèn stylesheet. */
.tw-auth .tw-auth-card{background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.02)),rgba(10,8,20,.62);}
@keyframes tw-auth-rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
/* Logo nổi khỏi mặt kính (translateZ qua .tw-fx-z1 — chỉ có tác dụng khi thẻ giữ preserve-3d),
   kèm quầng sáng tím phía dưới như một vật phát sáng đặt trên kính. */
.tw-auth-mark{display:inline-flex;width:56px;height:56px;border-radius:17px;align-items:center;justify-content:center;font-size:26px;color:#fff;background:${GRADIENT};box-shadow:0 10px 28px rgba(108,92,231,.55),0 0 0 1px rgba(255,255,255,.08) inset;}
.tw-auth-word{margin-top:14px;font-weight:800;letter-spacing:2px;font-size:13px;color:${D.textSub};}
/* margin-bottom:0 vì thẻ này là <h1>: trình duyệt tự thêm lề dưới cho heading mà <div> không có. */
.tw-auth-title{margin-top:10px;margin-bottom:0;font-size:clamp(22px,3vw,26px);font-weight:700;line-height:1.2;color:${D.text};letter-spacing:-.2px;}
.tw-auth-sub{margin-top:6px;font-size:14px;color:${D.textSub};}
.tw-auth-foot{margin-top:18px;text-align:center;font-size:13.5px;color:${D.textSub};}

/* Nhãn ô + icon prefix: antd lấy icon prefix theo colorText của wrapper; hạ xuống để icon không
   sáng ngang chữ đang gõ (mắt cần phân biệt "chữ của tôi" với "trang trí của ô"). */
.tw-auth .ant-form-item-label>label{font-weight:600;font-size:13.5px;}
.tw-auth .ant-input-prefix{color:#8E8AB0;}
.tw-auth .ant-input-affix-wrapper-focused .ant-input-prefix{color:${ACCENT_SOFT};}
/* Ô OTP là các Input rời không có affix wrapper: nền ô lấy từ token, nhưng chữ số phải to và
   đậm — người dùng đang chép sáu số từ email, sai một số là thử lại từ đầu. */
.tw-auth .ant-otp .ant-input{font-weight:700;font-size:18px;letter-spacing:1px;text-align:center;}
/* Thông báo lỗi dưới ô: đậm hơn mặc định (antd để 400) để không lẫn với gợi ý. */
.tw-auth .ant-form-item-explain-error{font-weight:600;font-size:13px;}
.tw-auth .ant-alert-error{font-weight:600;}
.tw-auth .ant-alert-error .ant-alert-message{color:#FFD5D9;}
/* GitButton tô cứng icon GitHub màu đen #1E2230 (đúng trên nền trắng cũ, tàng hình trên nút kính
   tối). File đó dùng chung cho luồng import nên không sửa ở đây; !important trong stylesheet thắng
   inline style của nó. */
.tw-auth .anticon-github{color:${D.text} !important;}

/* ---- Autofill: xem chú thích đầu file. Màu inset PHẢI trùng INPUT_BG để ô autofill không khác
   ô thường. transition 9999s là đường lùi cho bản Chrome cũ không tôn trọng box-shadow. ---- */
.tw-auth input:-webkit-autofill,
.tw-auth input:-webkit-autofill:hover,
.tw-auth input:-webkit-autofill:focus,
.tw-auth input:-webkit-autofill:active{
  -webkit-box-shadow:0 0 0 1000px ${INPUT_BG} inset !important;
  box-shadow:0 0 0 1000px ${INPUT_BG} inset !important;
  -webkit-text-fill-color:${INPUT_TEXT} !important;
  caret-color:${INPUT_TEXT};
  border-radius:inherit;
  transition:background-color 9999s ease-out 0s;
}
.tw-auth input:autofill{
  box-shadow:0 0 0 1000px ${INPUT_BG} inset !important;
  -webkit-text-fill-color:${INPUT_TEXT} !important;
  background-color:${INPUT_BG} !important;
  color:${INPUT_TEXT} !important;
  caret-color:${INPUT_TEXT};
  border-radius:inherit;
}

/* Khung nhìn hẹp (< 640px): TẮT nghiêng. Không dựa vào (hover: none) — cảm ứng đã tự tắt, nhưng
   người thu nhỏ cửa sổ trên máy tính vẫn có chuột thật; khi thẻ đã chiếm gần hết bề ngang, mép gần
   của khối xoay 6° không còn chỗ và sẽ chìa ra ngoài viewport. Chỉ bỏ transform (như FxStyles làm
   cho reduced-motion) chứ không đổi component, để không remount form khi người dùng đổi cỡ cửa sổ
   giữa chừng đang gõ. Viền phát sáng/glare vẫn giữ — chúng nằm trong thẻ, không chìa ra. */
@media (max-width: 639px){
  .tw-auth .tw-auth-card{transform:none !important;transition:box-shadow .45s ease,border-color .45s ease;}
}

/* Giảm chuyển động: tắt HẾT chuyển động tự phát (thẻ hiện ngay, quầng đứng yên); các hiệu ứng theo
   chuột đã tự tắt trong bộ fx. */
@media (prefers-reduced-motion: reduce){
  .tw-auth-rise{animation:none;}
  .tw-auth-orb-a,.tw-auth-orb-b{animation:none;}
}
`;

export default function AuthCard({
  title,
  subtitle,
  children,
  footer,
  lang,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
  /** Ngôn ngữ do trang (kết xuất ở máy chủ) giải ra. Thiếu nó thì header/footer rơi về context, tức 'vi'. */
  lang?: Locale;
}) {
  return (
    <div className="tw-auth">
      <style href="tw-auth" precedence="default">
        {AUTH_CSS}
      </style>
      {/* Nền: shader WebGL (rơi về Starfield khi không có WebGL) + hai quầng màu. Đặt ngoài luồng
          nội dung và trước header để header/footer (z-index cao hơn) vẫn nằm trên. */}
      <div className="tw-auth-stage" aria-hidden="true">
        <HeroShader fade="radial" />
        <span className="tw-auth-orb tw-auth-orb-a" />
        <span className="tw-auth-orb tw-auth-orb-b" />
      </div>
      <CursorGlow />
      <LandingHeader lang={lang} />
      <div className="tw-auth-body">
        <ConfigProvider theme={authFormTheme}>
          <div className="tw-auth-rise">
          <TiltCard maxTilt={6} scale={1} magnet={0} reach={260} className="tw-fx-glass tw-auth-card">
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div className="tw-auth-mark tw-fx-z1">
                <ThunderboltOutlined />
              </div>
              <div className="tw-auth-word">TOOLSWAVE</div>
              {/* <h1>, KHÔNG phải <div>.
                  Bốn trang dùng AuthCard — /login, /register, /forgot, /reset — đều không có <h1>
                  nào vì tiêu đề ở đây là một div. Đo bằng trình duyệt: "không có H1" trên cả HTML
                  thô lẫn hai khung nhìn. Trình đọc màn hình mất mốc điều hướng đầu tiên của trang,
                  và máy tìm kiếm mất tín hiệu chủ đề mạnh nhất. Sửa một chỗ, bốn trang được. */}
              <h1 className="tw-auth-title">{title}</h1>
              <div className="tw-auth-sub">{subtitle}</div>
            </div>
            {children}
            <div className="tw-auth-foot">{footer}</div>
          </TiltCard>
          </div>
        </ConfigProvider>
      </div>
      <LandingFooter lang={lang} />
    </div>
  );
}
