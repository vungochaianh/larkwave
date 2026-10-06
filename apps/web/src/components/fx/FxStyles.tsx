"use client";

import { FX_DARK_PALETTE as D } from "./fxTheme";

/**
 * CSS dùng chung của cả bộ hiệu ứng, gom một chỗ thay vì rải trong từng component.
 *
 * Vì sao là `<style href precedence>` chứ không phải `<style>` thường: React 19 coi thẻ style có
 * `href` + `precedence` là một stylesheet có định danh — nhiều TiltCard trên cùng trang chỉ sinh ra
 * MỘT bản trong `<head>`, và bản đó có mặt ngay trong HTML server trả về, nên khung hình đầu tiên
 * đã đúng (kể cả nhánh reduced-motion) mà không phải chờ hydrate.
 *
 * Token theo theme khai bốn tầng selector, cùng thứ tự với theme.ts: `:root` (sáng),
 * `[data-theme="dark"]` (khớp cả <html data-theme="dark"> lẫn wrapper ForceDark), rồi
 * `[data-theme="light"]` cho subtree bị ForceLight ép sáng. Tầng cuối là bảng màu ĐEN-TÍM riêng
 * của trang công khai — specificity (0,2,0) cố ý cao hơn tầng `[data-theme="dark"]` (0,1,0) mà
 * ThemeProvider chèn lúc chạy (chèn sau nên nếu cùng specificity thì nó thắng và ta mất màu).
 */
export const FX_CSS = `
:root{
  --tw-fx-glare:rgba(255,255,255,.5);
  --tw-fx-sheen:rgba(255,255,255,.65);
  --tw-fx-edge:rgba(108,92,231,.75);
  --tw-fx-edge-soft:rgba(108,92,231,.22);
  --tw-fx-glow-core:rgba(108,92,231,.18);
  --tw-fx-glow-wide:rgba(108,92,231,.09);
  --tw-fx-glow-blend:multiply;
  --tw-fx-glass-bg:rgba(255,255,255,.82);
  --tw-fx-glass-border:rgba(30,34,48,.08);
  --tw-fx-glass-hi:rgba(255,255,255,.9);
  --tw-fx-glass-shadow:0 1px 3px rgba(17,24,39,.05),0 18px 44px rgba(108,92,231,.10);
  --tw-fx-glass-shadow-hover:0 4px 10px rgba(17,24,39,.06),0 30px 70px rgba(108,92,231,.18);
  --tw-fx-splash-shadow:0 16px 40px rgba(108,92,231,.34);
}
[data-theme="dark"]{
  --tw-fx-glare:rgba(255,255,255,.13);
  --tw-fx-sheen:rgba(255,255,255,.22);
  --tw-fx-edge:rgba(196,180,255,1);
  --tw-fx-edge-soft:rgba(124,108,240,.28);
  --tw-fx-glow-core:rgba(150,130,255,.5);
  --tw-fx-glow-wide:rgba(108,92,231,.26);
  --tw-fx-glow-blend:screen;
  --tw-fx-glass-bg:rgba(255,255,255,.035);
  --tw-fx-glass-border:rgba(255,255,255,.09);
  --tw-fx-glass-hi:rgba(255,255,255,.08);
  --tw-fx-glass-shadow:0 1px 0 rgba(255,255,255,.03),0 24px 60px rgba(0,0,0,.5);
  --tw-fx-glass-shadow-hover:0 1px 0 rgba(255,255,255,.04),0 40px 90px rgba(0,0,0,.6),0 0 60px rgba(108,92,231,.18);
  --tw-fx-splash-shadow:0 16px 40px rgba(0,0,0,.5),0 0 40px rgba(108,92,231,.35);
}
[data-theme="light"]{
  --tw-fx-glare:rgba(255,255,255,.5);
  --tw-fx-sheen:rgba(255,255,255,.65);
  --tw-fx-edge:rgba(108,92,231,.75);
  --tw-fx-edge-soft:rgba(108,92,231,.22);
  --tw-fx-glow-core:rgba(108,92,231,.18);
  --tw-fx-glow-wide:rgba(108,92,231,.09);
  --tw-fx-glow-blend:multiply;
  --tw-fx-glass-bg:rgba(255,255,255,.82);
  --tw-fx-glass-border:rgba(30,34,48,.08);
  --tw-fx-glass-hi:rgba(255,255,255,.9);
  --tw-fx-glass-shadow:0 1px 3px rgba(17,24,39,.05),0 18px 44px rgba(108,92,231,.10);
  --tw-fx-glass-shadow-hover:0 4px 10px rgba(17,24,39,.06),0 30px 70px rgba(108,92,231,.18);
  --tw-fx-splash-shadow:0 16px 40px rgba(108,92,231,.34);
}
/* Bảng màu đen-tím của trang công khai (ForceDark). Ghi đè toàn bộ --tw-* để mọi thứ đang đọc
   biến theme (thẻ, chữ, viền, khối mã, chip) tự chuyển, không phải sửa từng trang. */
.tw-fx-dark[data-theme="dark"]{
  --tw-layer:${D.layer};--tw-surface:${D.surface};--tw-surface-alt:${D.surfaceAlt};--tw-surface-muted:${D.surfaceMuted};
  --tw-text:${D.text};--tw-text-sub:${D.textSub};--tw-text-faint:${D.textFaint};
  --tw-border:${D.border};--tw-border-sub:${D.borderSub};
  --tw-chip-bg:${D.chipBg};--tw-chip-text:${D.chipText};
  --tw-code-bg:${D.codeBg};--tw-code-header-bg:${D.codeHeaderBg};--tw-code-border:${D.codeBorder};--tw-code-text:${D.codeText};--tw-code-dark:1;
  color-scheme:dark;
  background:${D.layer};
  color:${D.text};
}
/* Nền của <html> phải theo trang tối, nếu không kéo quá đà (overscroll) trên Mac lộ nền trắng của
   app và thanh cuộn vẫn sáng. ThemeProvider ghi màu nền lên <html> bằng inline style trong effect
   của nó — effect cha chạy SAU effect con, nên ForceDark set trong effect rồi vẫn bị ghi đè (đã đo
   được: html vẫn #F4F5FB). Một rule !important trong stylesheet thắng inline style bất kể thứ tự
   effect; :has() để rule tự bật/tắt theo sự có mặt của wrapper, không cần JS dọn khi rời trang. */
html:has(.tw-fx-dark[data-theme="dark"]){background-color:${D.layer} !important;color-scheme:dark !important;}

/* ---- Mặt kính dùng chung -------------------------------------------------------------------
   Trang tối: thẻ gần trong suốt + vệt sáng 1px ở mép trên (inset) để đọc như một tấm kính có độ
   dày đặt trước nền; bóng đổ đen sâu tách nó khỏi nền. Không backdrop-filter: nó ép trình duyệt
   làm phẳng preserve-3d của TiltCard (mất nghiêng). */
.tw-fx-glass{
  background:var(--tw-fx-glass-bg);
  border:1px solid var(--tw-fx-glass-border);
  box-shadow:var(--tw-fx-glass-shadow),inset 0 1px 0 var(--tw-fx-glass-hi);
  transition:box-shadow .45s ease,border-color .45s ease;
}
.tw-fx-glass:hover,.tw-fx-glass.tw-fx-live{
  box-shadow:var(--tw-fx-glass-shadow-hover),inset 0 1px 0 var(--tw-fx-glass-hi);
}

/* ---- TiltCard ---------------------------------------------------------------------------- */
/* Góc nghiêng, lực hút và vị trí ánh sáng đi qua biến CSS chứ không set transform trực tiếp: mỗi
   khung hình chỉ đổi vài con số, còn công thức nằm yên ở đây. Perspective 1100px: thấp hơn thì
   mép gần phình quá (chữ méo), cao hơn thì 18° cũng trông như 6°. */
.tw-fx-tilt{
  position:relative;
  transform:perspective(1100px) rotateX(var(--tw-fx-rx,0deg)) rotateY(var(--tw-fx-ry,0deg))
    translate3d(var(--tw-fx-mgx,0px),var(--tw-fx-mgy,0px),0) scale(var(--tw-fx-s,1));
  transform-style:preserve-3d;
  transition:transform .55s cubic-bezier(.22,.8,.3,1);
}
/* Đang có con trỏ trên thẻ: transition dài làm thẻ đuổi theo chậm một nhịp — rút ngắn để bám tay;
   rời ra mới dùng transition dài để thẻ trôi về vị trí như một vật có khối lượng. */
.tw-fx-tilt.tw-fx-live{transition-duration:.1s;transition-timing-function:linear;}
/* Viền phát sáng bám con trỏ trên MỌI thẻ gần chuột (không chỉ thẻ đang hover) — đây là hiệu ứng
   người dùng thấy ngay trong giây đầu khi rê chuột qua một lưới thẻ. Vẽ bằng pseudo + mask xor
   để chỉ lộ một vành 1.5px; độ mờ = --tw-fx-near (0 xa → 1 chạm), do TiltCard tính chung. */
.tw-fx-tilt::after{
  content:"";position:absolute;inset:-1px;border-radius:inherit;padding:1.5px;pointer-events:none;z-index:3;
  background:radial-gradient(320px circle at var(--tw-fx-lx,-9999px) var(--tw-fx-ly,-9999px),var(--tw-fx-edge) 0%,var(--tw-fx-edge-soft) 38%,transparent 70%);
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
  -webkit-mask-composite:xor;mask-composite:exclude;
  opacity:var(--tw-fx-near,0);transition:opacity .3s ease;
}
/* Ánh sáng trên mặt thẻ: sáng dần khi chuột lại gần (near), sáng hẳn khi đang ở trên (go). */
.tw-fx-tilt-glare{
  position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:2;
  background:radial-gradient(circle at var(--tw-fx-mx,50%) var(--tw-fx-my,50%),var(--tw-fx-glare) 0%,transparent 55%);
  opacity:calc(var(--tw-fx-near,0) * .5 + var(--tw-fx-go,0) * .5);
  transition:opacity .35s ease;
}
/* Vệt loé quét ngang mặt kính một lần khi con trỏ bước vào thẻ — như ánh đèn lướt qua kính. */
.tw-fx-tilt-sheen{position:absolute;inset:0;border-radius:inherit;overflow:hidden;pointer-events:none;z-index:2;}
.tw-fx-tilt-sheen::before{
  content:"";position:absolute;top:-60%;bottom:-60%;left:0;width:38%;
  background:linear-gradient(105deg,transparent 0%,var(--tw-fx-sheen) 50%,transparent 100%);
  transform:translateX(-160%) skewX(-18deg);opacity:0;
}
.tw-fx-tilt.tw-fx-sweep .tw-fx-tilt-sheen::before{animation:tw-fx-sweep 1s cubic-bezier(.22,.8,.3,1) both;}
@keyframes tw-fx-sweep{0%{transform:translateX(-160%) skewX(-18deg);opacity:0}12%{opacity:1}100%{transform:translateX(420%) skewX(-18deg);opacity:0}}
/* Phần tử con muốn NỔI khỏi mặt thẻ (icon, tiêu đề): translateZ chỉ có tác dụng khi thẻ giữ được
   preserve-3d — thẻ có overflow:hidden thì trình duyệt làm phẳng, lớp này trở thành vô hại. */
.tw-fx-z1{transform:translateZ(26px);}
.tw-fx-z2{transform:translateZ(48px);}

/* ---- CursorGlow ------------------------------------------------------------------------- */
/* Hai lớp: quầng rộng mờ (đèn phòng) và lõi nhỏ sáng (đèn rọi). Lõi đuổi nhanh, quầng đuổi chậm
   hơn — chênh lệch đó cho cảm giác ánh sáng có quán tính. Trên nền tối blend screen nên nó
   CỘNG sáng vào mọi thứ nó đi qua, kể cả thẻ và chữ, mà chữ vẫn đọc được. */
.tw-fx-glow{
  position:fixed;inset:0;overflow:hidden;pointer-events:none;
  mix-blend-mode:var(--tw-fx-glow-blend);
  opacity:0;transition:opacity .6s ease;
}
.tw-fx-glow.tw-fx-on{opacity:1;}
.tw-fx-glow>i{position:absolute;left:0;top:0;display:block;border-radius:50%;will-change:transform;}
.tw-fx-glow-wide{background:radial-gradient(circle,var(--tw-fx-glow-wide) 0%,transparent 60%);}
.tw-fx-glow-core{background:radial-gradient(circle,var(--tw-fx-glow-core) 0%,transparent 62%);}

/* ---- Magnetic ---------------------------------------------------------------------------- */
.tw-fx-mag{
  display:inline-block;max-width:100%;will-change:transform;
  transform:translate3d(var(--tw-fx-mgx,0px),var(--tw-fx-mgy,0px),0) scale(var(--tw-fx-ms,1));
  transition:transform .5s cubic-bezier(.22,.8,.3,1);
}
.tw-fx-mag.tw-fx-live{transition-duration:.14s;}

/* ---- ParallaxLayers --------------------------------------------------------------------- */
/* Sân khấu 3D: các lớp nền nằm trong một khối preserve-3d có perspective; ngoài dịch chuyển lệch
   nhau theo depth, CẢ sân khấu còn nghiêng vài độ theo chuột — lúc đó lớp xa và lớp gần đổi vị
   trí tương đối theo phối cảnh thật của trình duyệt, không phải giả lập bằng translate. */
.tw-fx-parallax{position:relative;overflow:hidden;perspective:1200px;}
.tw-fx-parallax-stage{
  position:absolute;inset:0;pointer-events:none;transform-style:preserve-3d;
  transform:rotateX(var(--tw-fx-prx,0deg)) rotateY(var(--tw-fx-pry,0deg));
  transition:transform .7s cubic-bezier(.22,.8,.3,1);
}
/* Lớp nền tràn ra ngoài khung 12% mỗi phía: khi dịch chuyển mạnh không lộ mép trống. */
.tw-fx-parallax-layer{position:absolute;inset:-12%;pointer-events:none;will-change:transform;}
.tw-fx-parallax-fg{position:relative;z-index:1;}

/* ---- Starfield / HeroShader ------------------------------------------------------------- */
.tw-fx-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;}
/* Mờ dần ở rìa để nền hoà vào phần trang xung quanh thay vì kết thúc bằng một cạnh cứng. */
.tw-fx-canvas.tw-fx-fade{
  -webkit-mask-image:radial-gradient(ellipse 70% 70% at 50% 50%,#000 45%,transparent 100%);
  mask-image:radial-gradient(ellipse 70% 70% at 50% 50%,#000 45%,transparent 100%);
}
/* Shader hero: mờ ở mép DƯỚI để lưới tan vào phần trang kế tiếp, không cắt ngang một đường. */
.tw-fx-canvas.tw-fx-fade-b{
  -webkit-mask-image:linear-gradient(180deg,#000 0%,#000 55%,transparent 100%);
  mask-image:linear-gradient(180deg,#000 0%,#000 55%,transparent 100%);
}

/* ---- SplashScreen ----------------------------------------------------------------------- */
/* Script chống-flash (trong SplashScreen) gắn thuộc tính này lên <html> NGAY khi parse HTML nếu
   phiên này đã thấy splash — trước cả khi React chạy — nên người quay lại không thấy chớp. */
html[data-tw-splash-seen] .tw-fx-splash{display:none;}
.tw-fx-splash{
  position:fixed;inset:0;z-index:1200;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;
  padding:24px;
  background:var(--tw-layer,#F4F5FB);
  color:var(--tw-text,#1E2230);
  animation:tw-fx-splash-in .28s ease both;
}
.tw-fx-splash[data-phase="out"]{animation:tw-fx-splash-out .3s ease both;pointer-events:none;}
/* Hai quầng gradient mờ phía sau — cùng bộ màu với hero, nhưng nhỏ và nhạt hơn vì ở đây logo
   mới là thứ cần nhìn. */
.tw-fx-splash::before,.tw-fx-splash::after{
  content:"";position:absolute;border-radius:50%;filter:blur(60px);pointer-events:none;opacity:.5;
}
.tw-fx-splash::before{width:44vmax;height:44vmax;left:-12vmax;top:-14vmax;background:radial-gradient(circle,rgba(108,92,231,.35),transparent 70%);}
.tw-fx-splash::after{width:40vmax;height:40vmax;right:-10vmax;bottom:-12vmax;background:radial-gradient(circle,rgba(255,122,182,.28),transparent 70%);}
.tw-fx-splash>*{position:relative;}
.tw-fx-splash-mark{animation:tw-fx-splash-pop .5s cubic-bezier(.22,1,.36,1) both;}
.tw-fx-splash-text{text-align:center;animation:tw-fx-rise .45s ease .1s both;}
.tw-fx-splash-bar{
  position:relative;width:200px;max-width:60vw;height:4px;border-radius:999px;overflow:hidden;
  background:rgba(108,92,231,.16);animation:tw-fx-rise .45s ease .18s both;
}
.tw-fx-splash-bar>i{
  position:absolute;left:0;top:0;height:100%;border-radius:999px;width:0;
  background:linear-gradient(90deg,#6C5CE7 0%,#A66BFF 45%,#FF7AB6 75%,#4FB6FF 100%);
  animation:tw-fx-splash-fill var(--tw-fx-splash-ms,1200ms) linear both;
}
.tw-fx-splash-skip{
  position:absolute;right:max(16px,env(safe-area-inset-right));bottom:max(20px,env(safe-area-inset-bottom));
  padding:8px 14px;border-radius:999px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;
  border:1px solid var(--tw-border,#ECEDF3);background:var(--tw-surface,#fff);color:var(--tw-text-sub,#6B7280);
  animation:tw-fx-rise .45s ease .3s both;
}
.tw-fx-splash-skip:hover,.tw-fx-splash-skip:focus-visible{color:#6C5CE7;border-color:#6C5CE7;outline:none;}

@keyframes tw-fx-splash-in{from{opacity:0}to{opacity:1}}
@keyframes tw-fx-splash-out{from{opacity:1}to{opacity:0}}
@keyframes tw-fx-splash-pop{0%{transform:scale(.8);opacity:0}60%{transform:scale(1.04);opacity:1}100%{transform:scale(1);opacity:1}}
@keyframes tw-fx-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes tw-fx-splash-fill{from{width:0}to{width:100%}}

/* ---- Giảm chuyển động: tắt HẾT, giữ nguyên bố cục ---------------------------------------- */
/* Khung nhìn HẸP: tắt mọi phép xoay/dịch 3D.
 *
 * Bắt được bằng MẮT chứ không bằng phép đo: ảnh chụp trang đăng ký ở 380px cho thấy thẻ bị XÉN
 * mất mép phải — các ô nhập và nút chính chạy quá viền rồi bị "overflow:hidden" cắt cụt. Tệ hơn
 * tràn ngang, vì nội dung biến mất hẳn và không kéo tới được; và "scrollWidth" vẫn đúng bằng bề
 * rộng khung nên phép đo báo "không tràn".
 *
 * Nguyên nhân: mép GẦN của một khối xoay 3D chìa ra ngoài hộp phẳng của nó. Khung hẹp không đủ
 * chỗ cho phần chìa đó.
 *
 * Vì sao KHÔNG chỉ dựa vào "(hover: none)": cảm ứng thì đã tự tắt rồi, nhưng người thu nhỏ cửa sổ
 * trình duyệt trên máy tính vẫn có chuột thật — và họ gặp đúng cảnh trong ảnh. Điều kiện đúng là
 * BỀ RỘNG, không phải loại con trỏ.
 *
 * Đặt ở đây (bộ dùng chung) chứ không ở CSS riêng từng trang: lần trước chỉ vá trang đăng nhập,
 * và năm trang landing vẫn dính nguyên. Một luật, mọi nơi. */
@media (max-width: 640px){
  .tw-fx-tilt{transform:none !important;}
  .tw-fx-tilt::after,.tw-fx-tilt-glare,.tw-fx-tilt-sheen{display:none;}
  .tw-fx-mag{transform:none !important;}
  .tw-fx-parallax-stage{transform:none !important;}
}
@media (prefers-reduced-motion: reduce){
  .tw-fx-tilt{transform:none !important;transition:none;}
  .tw-fx-tilt::after,.tw-fx-tilt-glare,.tw-fx-tilt-sheen{display:none;}
  .tw-fx-z1,.tw-fx-z2{transform:none;}
  .tw-fx-glow{display:none;}
  .tw-fx-mag{transform:none !important;transition:none;}
  .tw-fx-parallax-stage{transform:none !important;transition:none;}
  .tw-fx-parallax-layer{transform:none !important;}
  .tw-fx-glass{transition:none;}
  .tw-fx-splash,.tw-fx-splash-mark,.tw-fx-splash-text,.tw-fx-splash-bar,.tw-fx-splash-skip{animation:none;}
  /* Thanh nạp đứng yên ở mức đầy thay vì chạy: vẫn nói "đang mở" mà không có gì chuyển động. */
  .tw-fx-splash-bar>i{animation:none;width:100%;}
}
`;

/**
 * Gắn `FX_CSS` vào trang. Mỗi component trong bộ fx tự render thẻ này nên người dùng không phải
 * nhớ import thêm gì; React gộp các bản trùng nhờ `href`.
 */
export function FxStyles() {
  return (
    <style href="tw-fx" precedence="default">
      {FX_CSS}
    </style>
  );
}
