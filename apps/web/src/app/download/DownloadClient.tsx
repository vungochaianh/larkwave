"use client";

import Link from "next/link";
import { useLangT } from "@/lib/useLangT";
import type { Locale } from "@larkwave/ui";
import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@larkwave/ui";
import { LandingHeader, LandingFooter } from "@/components/LandingChrome";
import { CursorGlow, HeroShader, Magnetic, ParallaxLayers, Starfield, TiltCard, type ParallaxLayer } from "@/components/fx";
import { BRAND, BRAND_GRADIENT } from "@/lib/theme";

const GRADIENT = BRAND_GRADIENT;

/** Fallback shown before /api/desktop-release responds (and if it fails). */
const FALLBACK_VERSION = "1.0.2";

interface ReleaseInfo {
  version: string | null;
  notice: string | null;
  mac: string | null; // .dmg URL (null = chưa phát hành)
  win: string | null; // .zip URL (chứa Larkwave.exe)
}

type OS = "mac" | "win" | "other";
type Platform = "mac" | "win";

function detectOS(): OS {
  if (typeof navigator === "undefined") return "other";
  const s = `${navigator.platform} ${navigator.userAgent}`.toLowerCase();
  if (s.includes("mac")) return "mac";
  if (s.includes("win")) return "win";
  return "other";
}

const FEATURES: { icon: string; tk: string; title: string; dk: string; desc: string }[] = [
  {
    icon: "⚡",
    tk: "web.pubc.featAiTitle",
    title: "AI chạy trên máy bạn",
    dk: "web.pubc.featAiDesc",
    desc: "Dùng AI CLI (Claude/Grok/...) + gói của bạn để sinh code — chi phí gần như bằng 0, không tốn token của Larkwave.",
  },
  {
    icon: "🔗",
    tk: "web.pubc.featLarkTitle",
    title: "Lark × Agents toàn quyền",
    dk: "web.pubc.featLarkDesc",
    desc: "Đăng nhập Lark bằng QR (tài khoản cá nhân) → AI thao tác với tư cách bạn trên mọi Base, Docs, Sheets, Wiki, Drive, tin nhắn. Tự động nạp Base.",
  },
  {
    icon: "🚀",
    tk: "web.pubc.featBuildTitle",
    title: "Dựng app từ phân tích",
    dk: "web.pubc.featBuildDesc",
    desc: "Từ một cuộc phân tích dữ liệu Lark, bấm một nút là ra brief app full-stack (schema + dữ liệu mẫu + phân tích) — chỉnh rồi build.",
  },
  {
    icon: "📡",
    tk: "web.pubc.featOfflineTitle",
    title: "Chạy offline-first",
    dk: "web.pubc.featOfflineDesc",
    desc: "Server lỗi vẫn xem được dữ liệu đã lưu trên máy + báo mất kết nối; mượt mạng lại tự đồng bộ.",
  },
  {
    icon: "🔄",
    tk: "web.pubc.featUpdateTitle",
    title: "Tự cập nhật (code-push)",
    dk: "web.pubc.featUpdateDesc",
    desc: "Cài một lần — giao diện tự cập nhật ở lần mở kế, không phải tải lại. Bản có thay đổi lõi sẽ báo tải bản mới.",
  },
  {
    icon: "🔒",
    tk: "web.pubc.featSecTitle",
    title: "Bảo mật trên máy bạn",
    dk: "web.pubc.featSecDesc",
    desc: "Token AI/Lark được mã hoá (OS keychain) và lưu cục bộ — không rời khỏi máy bạn.",
  },
];

const STEPS_WIN = [
  { k: "web.pubc.winStep1", vi: "Tải bản Windows (.zip) bên trên." },
  { k: "web.pubc.winStep2", vi: "Giải nén, chạy Larkwave.exe (chưa ký số → bấm More info → Run anyway)." },
  { k: "web.pubc.winStep3", vi: "Cài AI CLI (Claude/Grok/...) + đăng nhập/key (hoặc dán trong app)." },
];
const STEPS_MAC = [
  { k: "web.pubc.macStep1", vi: "Tải bản macOS (.dmg) bên trên." },
  { k: "web.pubc.macStep2", vi: "Mở .dmg, kéo Larkwave vào Applications (lần đầu: chuột phải → Open)." },
  { k: "web.pubc.macStep3", vi: "Cài Claude CLI + đăng nhập (hoặc dán token ngay trong app)." },
];

/**
 * Rút phiên bản THẬT khỏi link tải, để mỗi nút nói đúng thứ nó sắp tải về.
 *
 * Phải khớp HAI dạng link, vì hai nền tảng nay nằm ở hai nơi:
 *   • GitLab   …/toolswave-desktop/1.0.289/Larkwave-1.0.289-win.zip
 *   • máy chủ  …/dl/Larkwave-1.0.341-universal.dmg
 *
 * Trước đây chỉ khớp dạng GitLab. Sau khi chuyển bộ cài macOS về máy chủ riêng, nút macOS lặng lẽ
 * mất phần phiên bản — đúng thứ hàm này sinh ra để hiện. Thẻ trên đầu trang thì vẫn ghi phiên bản
 * CHUNG, nên người dùng Windows đọc "phiên bản 1.0.341" ở trên rồi tải về 1.0.289: đúng kiểu hiểu
 * nhầm mà phiên-bản-trên-từng-nút được thêm vào để chặn.
 */
function versionFromUrl(url: string | null): string | null {
  if (!url) return null;
  return (
    url.match(/toolswave-desktop\/(\d+(?:\.\d+)+)\//)?.[1] ??
    url.match(/Larkwave-(\d+(?:\.\d+)+)-/i)?.[1] ??
    null
  );
}

/**
 * Ba trạng thái của một đường tải, tách bạch để không bao giờ hiện "sắp có" trong lúc manifest
 * còn đang trên đường về: trước đây `rel` khởi tạo toàn `null` nên khung hình đầu tiên nói
 * "Windows — sắp có" rồi nửa giây sau lại đổi thành nút tải — người dùng thấy nhấp nháy và
 * không biết tin bên nào. Giờ "đang kiểm tra" là một trạng thái có mặt riêng.
 */
type DlStatus = "checking" | "ready" | "missing";
const statusOf = (url: string | null, loaded: boolean): DlStatus => (!loaded ? "checking" : url ? "ready" : "missing");

const LABEL: Record<Platform, string> = { mac: "macOS", win: "Windows" };
const GLYPH: Record<Platform, string> = { mac: "", win: "⊞" };
const EXT: Record<Platform, string> = { mac: ".dmg", win: ".zip" };

/* ------------------------------------------------------------------------------------------ */
/* CSS riêng của trang. Dùng `<style href precedence>` (React 19) như bộ fx: server trả sẵn trong
   <head> nên khung hình đầu đã đúng, và nhiều lần mount chỉ sinh MỘT bản. Màu lấy từ biến --tw-*:
   trang này được ForceDark ép TỐI ở providers (bảng màu đen-tím), các khối `[data-theme="dark"]`
   bên dưới thêm chất KÍNH; selector là attribute (không `:root[...]`) để khớp cả wrapper con. */
const PAGE_CSS = `
.tw-dl{min-height:100vh;background:var(--tw-layer,#F4F5FB);color:var(--tw-text,#1E2230);}

/* ---- Hero: có chiều sâu nhờ 3 lớp parallax (sao xa → quầng màu gần); chữ ở lớp trước ---- */
.tw-dl-hero{padding:clamp(52px,8vw,104px) clamp(16px,5vw,56px) clamp(40px,6vw,64px);text-align:center;}
.tw-dl-hero-in{max-width:960px;margin:0 auto;}
.tw-dl-badge{display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:999px;
  background:var(--tw-chip-bg,#F1EFFE);color:var(--tw-chip-text,#5B4FC2);border:1px solid var(--tw-border,#ECEDF3);
  font-weight:600;font-size:13px;margin-bottom:20px;max-width:100%;}
.tw-dl-h1{font-size:clamp(32px,6vw,60px);line-height:1.06;font-weight:800;letter-spacing:-1px;margin:0 0 16px;}
.tw-dl-grad{background:${GRADIENT};-webkit-background-clip:text;background-clip:text;color:transparent;}
.tw-dl-sub{font-size:clamp(16px,2.3vw,19px);color:var(--tw-text-sub,#6B7280);max-width:680px;margin:0 auto 32px;line-height:1.55;}

/* Khối hành động giữ chiều cao tối thiểu để lúc chuyển "đang kiểm tra" → nút tải, phần dưới
   không giật. */
.tw-dl-action{min-height:80px;display:flex;flex-direction:column;align-items:center;gap:12px;}

/* Nút tải: điểm nhấn DUY NHẤT của hero — thứ duy nhất mang gradient đậm, có quầng sáng thở chậm. */
.tw-dl-halo{position:relative;display:inline-block;max-width:100%;}
.tw-dl-halo::before{content:"";position:absolute;inset:-4px;border-radius:22px;background:${GRADIENT};
  filter:blur(18px);opacity:.45;animation:tw-dl-breathe 3.4s ease-in-out infinite;}
.tw-dl-cta{position:relative;display:inline-flex;align-items:center;gap:14px;padding:16px 28px;border-radius:18px;
  background:${GRADIENT};color:#fff;font-weight:800;font-size:17px;max-width:100%;box-sizing:border-box;
  box-shadow:0 18px 44px rgba(108,92,231,.36);transition:transform .25s ease,box-shadow .25s ease;}
.tw-dl-cta:hover{transform:translateY(-2px) scale(1.02);box-shadow:0 26px 56px rgba(108,92,231,.46);color:#fff;}
.tw-dl-cta-glyph{font-size:26px;line-height:1;}
.tw-dl-cta-sub{display:block;font-size:12.5px;font-weight:500;opacity:.9;margin-top:2px;}
.tw-dl-alt{font-size:13.5px;font-weight:600;color:${BRAND};}

/* Hai trạng thái không-tải-được phải nhìn là hiểu ngay, không được lẫn với nút: nền trung tính
   (đang kiểm tra) hoặc viền hổ phách (chưa có bản) — không gradient, không quầng. */
.tw-dl-pill{display:inline-flex;align-items:center;gap:10px;padding:14px 22px;border-radius:16px;font-weight:700;font-size:15px;
  border:1px solid var(--tw-border,#ECEDF3);background:var(--tw-surface,#fff);color:var(--tw-text-sub,#6B7280);max-width:100%;box-sizing:border-box;}
.tw-dl-pill-miss{border-color:rgba(245,158,11,.55);background:rgba(245,158,11,.10);color:#B45309;}
[data-theme="dark"] .tw-dl-pill-miss{color:#FBBF24;}
[data-theme="light"] .tw-dl-pill-miss{color:#B45309;}
.tw-dl-hint{margin:0;font-size:14px;color:var(--tw-text-sub,#6B7280);max-width:560px;line-height:1.6;}
.tw-dl-hint a,.tw-dl-note a{color:${BRAND};font-weight:600;}
.tw-dl-spin{width:16px;height:16px;border-radius:50%;flex:none;border:2px solid var(--tw-border,#ECEDF3);border-top-color:${BRAND};
  animation:tw-dl-spin .8s linear infinite;}
.tw-dl-note{margin:18px 0 0;font-size:13px;color:var(--tw-text-faint,#9AA3B5);}

/* ---- Các khối dưới ---- */
.tw-dl-section{padding:clamp(28px,5vw,56px) clamp(16px,5vw,56px);max-width:1180px;margin:0 auto;}
.tw-dl-h2{text-align:center;font-size:clamp(24px,4vw,34px);font-weight:800;margin:0 0 10px;letter-spacing:-.5px;}
.tw-dl-h2sub{text-align:center;color:var(--tw-text-sub,#6B7280);font-size:16px;margin:0 auto 34px;max-width:640px;line-height:1.55;}

/* Thẻ nền tảng: min(100%, 320px) để ở 380px thẻ co theo màn chứ không tràn ngang. */
.tw-dl-plats{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:20px;}
.tw-dl-plat{border-radius:20px;padding:clamp(18px,3vw,26px);height:100%;box-sizing:border-box;}
.tw-dl-plat-mine{border-color:rgba(108,92,231,.45);}
/* Huy hiệu nằm trong dòng (không absolute): ở 380px góc phải trên là chỗ tên nền tảng đang chiếm. */
.tw-dl-mine{display:inline-flex;font-size:10.5px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;
  padding:4px 9px;border-radius:999px;background:${GRADIENT};color:#fff;margin-bottom:12px;}
.tw-dl-plat-head{display:flex;align-items:center;gap:14px;margin-bottom:14px;}
/* Viền gradient bằng 2 lớp background: lớp trong phủ màu bề mặt (đúng theme), lớp ngoài là
   gradient lộ ra ở phần border trong suốt. */
.tw-dl-glyph{width:54px;height:54px;flex:none;border-radius:16px;display:inline-flex;align-items:center;justify-content:center;
  font-size:26px;color:var(--tw-text,#1E2230);border:1.5px solid transparent;
  background:linear-gradient(var(--tw-surface,#fff),var(--tw-surface,#fff)) padding-box,${GRADIENT} border-box;}
.tw-dl-plat-name{font-size:20px;font-weight:800;margin:0;line-height:1.2;}
.tw-dl-plat-sub{font-size:13px;color:var(--tw-text-sub,#6B7280);margin:2px 0 0;}
.tw-dl-status{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;margin-bottom:14px;}
.tw-dl-status i{width:8px;height:8px;border-radius:50%;background:currentColor;flex:none;}
.tw-dl-status-ready{color:#16B98D;}
.tw-dl-status-miss{color:#D97706;}
[data-theme="dark"] .tw-dl-status-miss{color:#FBBF24;}
[data-theme="light"] .tw-dl-status-miss{color:#D97706;}
.tw-dl-status-wait{color:var(--tw-text-faint,#9AA3B5);}
/* Nút trong thẻ chỉ viền — nhấn chính đã ở hero, đây là đường phụ. */
.tw-dl-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:11px 18px;border-radius:12px;
  font-weight:700;font-size:14.5px;border:1px solid ${BRAND};color:${BRAND};background:transparent;max-width:100%;box-sizing:border-box;
  transition:background .2s ease;}
.tw-dl-btn:hover{background:rgba(108,92,231,.10);color:${BRAND};}
.tw-dl-btn-off{border-color:var(--tw-border,#ECEDF3);color:var(--tw-text-faint,#9AA3B5);cursor:not-allowed;}
.tw-dl-steps{margin:18px 0 0;padding:16px 0 0 18px;border-top:1px dashed var(--tw-border,#ECEDF3);
  color:var(--tw-text-sub,#6B7280);font-size:14px;line-height:1.7;}
.tw-dl-unsigned{text-align:center;color:var(--tw-text-faint,#9AA3B5);font-size:13px;margin:22px auto 0;max-width:760px;line-height:1.6;}
.tw-dl-code{background:var(--tw-code-bg,#FBFAFF);border:1px solid var(--tw-code-border,#E6E2F8);color:var(--tw-code-text,#2E2A44);
  padding:1px 7px;border-radius:6px;font-size:12.5px;}

.tw-dl-feats{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,290px),1fr));gap:18px;}
.tw-dl-feat{border-radius:18px;padding:22px 22px 24px;height:100%;box-sizing:border-box;}
.tw-dl-feat-icon{width:48px;height:48px;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;
  font-size:22px;background:var(--tw-chip-bg,#F1EFFE);margin-bottom:14px;}
.tw-dl-feat h3{font-size:17.5px;font-weight:700;margin:0 0 6px;}
.tw-dl-feat p{color:var(--tw-text-sub,#6B7280);font-size:14.5px;margin:0;line-height:1.55;}

/* CTA cuối: sàn lưới phối cảnh (Starfield grid) chạy tới phía sau chữ — "tương lai" mà vẫn là
   một thẻ cùng ngôn ngữ với phần trên, không phải khối gradient đặc. */
.tw-dl-cta-wrap{position:relative;overflow:hidden;border-radius:24px;border:1px solid var(--tw-border,#ECEDF3);
  background:var(--tw-surface,#fff);padding:clamp(32px,6vw,64px) clamp(18px,4vw,40px);text-align:center;}
.tw-dl-cta-in{position:relative;z-index:1;}
.tw-dl-cta-in h2{font-size:clamp(22px,3.4vw,32px);font-weight:800;margin:0 0 10px;}
.tw-dl-cta-in>p{font-size:16px;color:var(--tw-text-sub,#6B7280);margin:0 auto 24px;max-width:560px;line-height:1.55;}
.tw-dl-cta-row{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;align-items:center;}
.tw-dl-ghost{display:inline-flex;align-items:center;padding:12px 24px;border-radius:12px;border:1px solid var(--tw-border,#ECEDF3);
  color:var(--tw-text,#1E2230);font-weight:600;font-size:15px;background:var(--tw-surface,#fff);}

/* Tối: pill, khối CTA và nút viền thành kính; quầng thở của nút tải được sáng hơn hẳn vì trên nền
   đen nó là nguồn sáng chính của hero. */
[data-theme="dark"] .tw-dl-pill,[data-theme="dark"] .tw-dl-ghost,[data-theme="dark"] .tw-dl-cta-wrap{
  background:var(--tw-fx-glass-bg,rgba(255,255,255,.035));border-color:var(--tw-fx-glass-border,rgba(255,255,255,.09));
}
[data-theme="dark"] .tw-dl-cta-wrap{box-shadow:var(--tw-fx-glass-shadow),inset 0 1px 0 var(--tw-fx-glass-hi);}
[data-theme="dark"] .tw-dl-halo::before{opacity:.7;filter:blur(24px);}
[data-theme="dark"] .tw-dl-cta{box-shadow:0 18px 54px rgba(108,92,231,.6),inset 0 1px 0 rgba(255,255,255,.18);}
[data-theme="dark"] .tw-dl-badge{box-shadow:0 0 24px rgba(108,92,231,.25);}
@keyframes tw-dl-breathe{0%,100%{opacity:.4;transform:scale(1)}50%{opacity:.75;transform:scale(1.04)}}
@keyframes tw-dl-spin{to{transform:rotate(360deg)}}
/* Giảm chuyển động: tắt quầng thở, vòng xoay và hover nhích — bố cục giữ nguyên. */
@media (prefers-reduced-motion:reduce){
  .tw-dl-halo::before{animation:none;opacity:.45;}
  .tw-dl-spin{animation:none;}
  .tw-dl-cta,.tw-dl-cta:hover{transform:none;transition:none;}
  .tw-dl-cta.tw-shine::after{transition:none;display:none;}
}
`;

function PageStyles() {
  return (
    <style href="tw-dl-page" precedence="default">
      {PAGE_CSS}
    </style>
  );
}

/* Các lớp nền hero: depth nhỏ = xa (nền WebGL — tự lắc camera theo chuột nên depth rất nhỏ),
   depth lớn = gần (quầng hồng). Là hằng ở module để không tạo lại cây phần tử mỗi render. */
/* Lớp quầng mờ dần ở mép trên/dưới: ParallaxLayers cắt overflow nên quầng tràn mép sẽ thành một
   cạnh thẳng lộ liễu — mask đặt trên lớp, không phải trên khối, để chữ phía trước không bị mờ. */
/* Mốc 8%/92%: lớp parallax tràn ±10% ngoài khối, nên khối chỉ chiếm ~8→92% chiều cao lớp — mờ hẳn
   phải rơi đúng tại mép khối, không phải ở mép lớp (ngoài tầm nhìn) như bản đầu. */
const ORB_LAYER_STYLE = {
  WebkitMaskImage: "linear-gradient(transparent 8%, #000 32%, #000 68%, transparent 92%)",
  maskImage: "linear-gradient(transparent 8%, #000 32%, #000 68%, transparent 92%)",
} as const;
const orb = (style: Record<string, string | number>) => <i className="tw-pub-orb" style={style} />;
const HERO_LAYERS: ParallaxLayer[] = [
  { depth: 0.04, style: { inset: "-4%" }, node: <HeroShader /> },
  {
    depth: 0.28,
    style: ORB_LAYER_STYLE,
    node: orb({ left: "-6%", top: "-14%", width: "52vmax", height: "52vmax", maxWidth: 760, maxHeight: 760, background: "radial-gradient(circle, rgba(108,92,231,.5), transparent 70%)" }),
  },
  {
    depth: 0.5,
    style: ORB_LAYER_STYLE,
    node: orb({ right: "-10%", bottom: "-28%", width: "44vmax", height: "44vmax", maxWidth: 640, maxHeight: 640, background: "radial-gradient(circle, rgba(255,122,182,.42), transparent 70%)" }),
  },
  {
    depth: 0.38,
    style: ORB_LAYER_STYLE,
    node: orb({ left: "48%", top: "52%", width: "26vmax", height: "26vmax", maxWidth: 380, maxHeight: 380, background: "radial-gradient(circle, rgba(79,182,255,.38), transparent 70%)" }),
  },
];

function Heading({ title, sub }: { title: string; sub?: string }) {
  return (
    <>
      <h2 className="tw-dl-h2">{title}</h2>
      {sub && <p className="tw-dl-h2sub">{sub}</p>}
    </>
  );
}

/**
 * Nút tải chính của hero — theo hệ điều hành đang dùng. Chỉ khi đã có link thật mới thành nút
 * gradient; "đang kiểm tra" và "chưa có bản" hiện đúng nghĩa đen, có `role=status` để trình đọc
 * màn hình cũng biết trạng thái đổi.
 */
function PrimaryDownload({ os, url, otherUrl, loaded, lang }: { os: Platform; url: string | null; otherUrl: string | null; loaded: boolean; lang?: Locale }) {
  const t = useLangT(lang);
  const label = LABEL[os];
  const other = LABEL[os === "mac" ? "win" : "mac"];
  const status = statusOf(url, loaded);
  const ver = versionFromUrl(url);
  const baseSub = os === "mac" ? t("web.pubc.dlSubMac", "Universal · Intel + Apple Silicon · .dmg") : t("web.pubc.dlSubWin", "x64 · .zip (chứa .exe)");

  if (status === "checking") {
    return (
      <span className="tw-dl-pill" role="status" aria-live="polite" aria-busy="true">
        <i className="tw-dl-spin" aria-hidden="true" />
        {t("web.pubc.dlChecking", "Đang kiểm tra bản mới nhất…")}
      </span>
    );
  }
  if (status === "missing") {
    return (
      <div role="status" aria-live="polite" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
        <span className="tw-dl-pill tw-dl-pill-miss">⚠ {t("web.pubc.dlNoBuild", "Chưa có bản {label}", { label })}</span>
        <p className="tw-dl-hint">
          {otherUrl ? (
            <>
              {t("web.pubc.dlNoBuildHint", "Bản {label} đang được đóng gói — đường tải sẽ bật ngay khi phát hành. Trong lúc chờ:", { label })}{" "}
              <a href={otherUrl}>{t("web.pubc.dlFor", "Tải cho {label}", { label: other })}</a> ·{" "}
              <Link href="/welcome">{t("web.pubc.useWebVersion", "Dùng bản web →")}</Link>
            </>
          ) : (
            <>
              {t("web.pubc.packagingNote", "Bản cài đang được đóng gói — đường tải sẽ bật ngay khi phát hành. Trong lúc chờ, dùng")}{" "}
              <Link href="/welcome">{t("web.pubc.webVersion", "bản web")}</Link>.
            </>
          )}
        </p>
      </div>
    );
  }
  // Nút tải bị con trỏ hút khi lại gần (Magnetic bọc cả quầng thở để quầng đi cùng nút).
  return (
    <Magnetic pull={20}>
    <span className="tw-dl-halo">
      <a href={url ?? "#"} className="tw-dl-cta tw-shine">
        <span className="tw-dl-cta-glyph" aria-hidden="true">
          {GLYPH[os]}
        </span>
        <span style={{ textAlign: "left", lineHeight: 1.15 }}>
          <span style={{ display: "block" }}>{t("web.pubc.dlFor", "Tải cho {label}", { label })}</span>
          <span className="tw-dl-cta-sub">{ver ? `${baseSub} · v${ver}` : baseSub}</span>
        </span>
      </a>
    </span>
    </Magnetic>
  );
}

/**
 * Thẻ một nền tảng: trạng thái + nút phụ + 3 bước cài — gộp "Cài đặt nhanh" cũ vào đây vì bước
 * cài của nền tảng nào thì nằm cạnh nút tải của nền tảng đó, không phải một khối riêng ở dưới.
 */
function PlatformCard({ os, url, loaded, detected, steps, lang }: { os: Platform; url: string | null; loaded: boolean; detected: boolean; steps: string[]; lang?: Locale }) {
  const t = useLangT(lang);
  const label = LABEL[os];
  const status = statusOf(url, loaded);
  const ver = versionFromUrl(url);
  const sub = os === "mac" ? t("web.pubc.dlSubMac", "Universal · Intel + Apple Silicon · .dmg") : t("web.pubc.dlSubWin", "x64 · .zip (chứa .exe)");

  let statusNode: ReactNode;
  let action: ReactNode;
  if (status === "checking") {
    statusNode = (
      <span className="tw-dl-status tw-dl-status-wait" role="status" aria-busy="true">
        <i className="tw-dl-spin" style={{ width: 10, height: 10 }} aria-hidden="true" />
        {t("web.pubc.dlChecking", "Đang kiểm tra bản mới nhất…")}
      </span>
    );
    action = <span className="tw-dl-btn tw-dl-btn-off">{t("web.pubc.dlChecking", "Đang kiểm tra bản mới nhất…")}</span>;
  } else if (status === "missing") {
    statusNode = (
      <span className="tw-dl-status tw-dl-status-miss" role="status">
        <i aria-hidden="true" />
        {t("web.pubc.dlSoonShort", "Sắp có")}
      </span>
    );
    action = <span className="tw-dl-btn tw-dl-btn-off">{t("web.pubc.dlNoBuild", "Chưa có bản {label}", { label })}</span>;
  } else {
    statusNode = (
      <span className="tw-dl-status tw-dl-status-ready" role="status">
        <i aria-hidden="true" />
        {ver ? t("web.pubc.dlReady", "Sẵn sàng · v{ver}", { ver }) : t("web.pubc.dlReadyNoVer", "Sẵn sàng")}
      </span>
    );
    action = (
      <a href={url ?? "#"} className="tw-dl-btn">
        ↓ {t("web.pubc.dlGet", "Tải {ext}", { ext: EXT[os] })}
      </a>
    );
  }

  return (
    <TiltCard maxTilt={18} scale={1.03} className={`tw-pub-card tw-dl-plat${detected ? " tw-dl-plat-mine" : ""}`}>
      {detected && <span className="tw-dl-mine">{t("web.pubc.dlDetected", "Nền tảng của bạn")}</span>}
      <div className="tw-dl-plat-head">
        <span className="tw-dl-glyph" aria-hidden="true">
          {GLYPH[os]}
        </span>
        <div style={{ minWidth: 0 }}>
          <h3 className="tw-dl-plat-name">{label}</h3>
          <p className="tw-dl-plat-sub">{sub}</p>
        </div>
      </div>
      {statusNode}
      <div>{action}</div>
      <ol className="tw-dl-steps">
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </TiltCard>
  );
}

/** `lang` từ máy chủ: lúc dựng ở máy chủ context i18n luôn trả 'vi' — xem lib/useLangT.ts. */
export default function DownloadClient({ lang }: { lang?: Locale }) {
  const t = useLangT(lang);
  const [os, setOs] = useState<OS>("other");
  const [rel, setRel] = useState<ReleaseInfo>({ version: null, notice: null, mac: null, win: null });
  // Cờ trình bày thuần: manifest đã về (kể cả lỗi) hay chưa. Không đổi cách lấy dữ liệu.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setOs(detectOS());
    let alive = true;
    fetch("/api/desktop-release")
      .then((r) => r.json())
      .then((d: ReleaseInfo) => {
        if (alive) setRel(d);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const version = rel.version || FALLBACK_VERSION;
  // Primary button follows the visitor's OS (Windows users see Windows first, etc.).
  const macPrimary = os !== "win";
  const primaryOs: Platform = macPrimary ? "mac" : "win";
  const primaryUrl = macPrimary ? rel.mac : rel.win;
  const otherUrl = macPrimary ? rel.win : rel.mac;
  const otherLabel = LABEL[macPrimary ? "win" : "mac"];

  const stepsMac = STEPS_MAC.map((s) => t(s.k, s.vi));
  const stepsWin = STEPS_WIN.map((s) => t(s.k, s.vi));
  // Nền tảng đang dùng đứng trước — thứ người ta cần nằm trong tầm mắt đầu tiên.
  const platforms: Platform[] = macPrimary ? ["mac", "win"] : ["win", "mac"];

  return (
    <div className="tw-dl">
      <PageStyles />
      <CursorGlow />
      <LandingHeader lang={lang} />

      {/* Hero */}
      <ParallaxLayers layers={HERO_LAYERS} className="tw-dl-hero" scrollRange={120} mouseRange={48} tilt={3}>
        <div className="tw-dl-hero-in">
          <span className="tw-dl-badge">{t("web.pubc.heroBadge", "🖥️ Larkwave Desktop · phiên bản {version}", { version })}</span>
          <h1 className="tw-dl-h1">
            {t("web.pubc.heroTitle1", "Claude dựng app")} <span className="tw-dl-grad">{t("web.pubc.heroTitle2", "ngay trên máy bạn")}</span>
          </h1>
          <p className="tw-dl-sub">
            {t(
              "web.pubc.heroSub",
              "Bản desktop dùng AI CLI (Claude/Grok/...) của bạn để sinh code (chi phí gần như 0), tích hợp sâu Lark × Agents (đăng nhập QR toàn quyền), dựng app từ phân tích dữ liệu và chạy được offline.",
            )}
          </p>

          <div className="tw-dl-action">
            <PrimaryDownload lang={lang} os={primaryOs} url={primaryUrl} otherUrl={otherUrl} loaded={loaded} />
            {loaded && primaryUrl && otherUrl && (
              <a href="#platforms" className="tw-dl-alt">
                {t("web.pubc.dlAlsoFor", "Cũng có cho {label} ↓", { label: otherLabel })}
              </a>
            )}
          </div>

          <p className="tw-dl-note">
            {t("web.pubc.heroNote", "🔄 Cài một lần — app tự cập nhật giao diện (code-push). · Miễn phí · Cần")}{" "}
            <a href="https://docs.claude.com/claude-code" target="_blank" rel="noreferrer">
              Claude CLI
            </a>
            .
          </p>
        </div>
      </ParallaxLayers>

      {/* Nền tảng: hai thẻ nghiêng, trạng thái từng bản đọc từ manifest thật */}
      <section id="platforms" className="tw-dl-section">
        <Heading
          title={t("web.pubc.platformsTitle", "Chọn nền tảng")}
          sub={t("web.pubc.platformsSub", "Số phiên bản đọc từ bản phát hành thật — Windows và macOS có thể lệch nhau.")}
        />
        <div className="tw-dl-plats">
          {platforms.map((p) => (
            <PlatformCard lang={lang} key={p} os={p} url={p === "mac" ? rel.mac : rel.win} loaded={loaded} detected={os === p} steps={p === "mac" ? stepsMac : stepsWin} />
          ))}
        </div>
        <p className="tw-dl-unsigned">
          {t("web.pubc.unsignedNote", "App chưa ký số (unsigned) nên hệ điều hành có thể cảnh báo lần đầu — đây là điều bình thường với bản cài trực tiếp. Cần AI CLI (Claude mặc định):")}{" "}
          <code className="tw-dl-code">npm i -g @anthropic-ai/claude-code</code>
        </p>
      </section>

      {/* Feature grid (những gì BẢN DESKTOP có mà web chưa có) */}
      <section className="tw-dl-section">
        <Heading
          title={t("web.pubc.whyTitle", "Vì sao dùng bản desktop?")}
          sub={t("web.pubc.whySub", "Những thứ chỉ bản desktop có — chạy Claude cục bộ và can thiệp sâu vào Lark.")}
        />
        <div className="tw-dl-feats">
          {FEATURES.map((f) => (
            <TiltCard key={f.title} maxTilt={16} scale={1.03} className="tw-pub-card tw-dl-feat">
              <div className="tw-dl-feat-icon tw-fx-z1" aria-hidden="true">
                {f.icon}
              </div>
              <h3>{t(f.tk, f.title)}</h3>
              <p>{t(f.dk, f.desc)}</p>
            </TiltCard>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="tw-dl-section" style={{ paddingBottom: 72 }}>
        <div className="tw-dl-cta-wrap">
          <Starfield variant="grid" speed={0.8} />
          <div className="tw-dl-cta-in">
            <h2>{t("web.pubc.ctaTitle", "Sẵn sàng dựng app trên máy bạn?")}</h2>
            <p>{t("web.pubc.ctaSub", "Tải về, đăng nhập Claude, kết nối Lark — và bắt đầu biến ý tưởng + dữ liệu thành app.")}</p>
            <div className="tw-dl-cta-row">
              {/* Cùng một component với hero: trạng thái "chưa có bản" ở đây cũng nói y hệt, không
                  bao giờ thành nút giả dẫn tới "#". */}
              <PrimaryDownload lang={lang} os={primaryOs} url={primaryUrl} otherUrl={otherUrl} loaded={loaded} />
              <Link href="/welcome" className="tw-dl-ghost">
                {t("web.pubc.useWebVersion", "Dùng bản web →")}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <LandingFooter lang={lang} />
    </div>
  );
}
